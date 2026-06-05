# AdWhiz Avatar Pipeline — SieveSync Implementation Plan

**Project:** AdWhiz AI Spokesperson Reels  
**Pipeline:** LivePortrait (neutralize) → MuseTalk (lipsync) → CodeFormer (enhance)  
**Architecture Pattern:** SieveSync (open-sourced by Sieve, Sept 2024)  
**Target OS:** Windows 10/11 with NVIDIA GPU (CUDA)  
**Status:** Replacing the broken Stage 3 avatar engine and Stage 4 lipsync passthrough

---

## Table of Contents

1. [The Core Problem, Re-explained](#1-the-core-problem-re-explained)
2. [New Architecture Overview](#2-new-architecture-overview)
3. [Prerequisites & Environment Inventory](#3-prerequisites--environment-inventory)
4. [Phase 1 — MuseTalk Engine Setup](#4-phase-1--musetalk-engine-setup-port-5300)
5. [Phase 2 — CodeFormer Engine Setup](#5-phase-2--codeformer-engine-setup-port-5500)
6. [Phase 3 — LivePortrait Neutralization Mode](#6-phase-3--liveportrait-neutralization-mode)
7. [Phase 4 — FastAPI Service Wrappers](#7-phase-4--fastapi-service-wrappers)
8. [Phase 5 — CpuWorker.js Integration](#8-phase-5--cpuworkerjs-integration)
9. [Phase 6 — Pipeline Wiring & .env Config](#9-phase-6--pipeline-wiring--env-config)
10. [Phase 7 — End-to-End Testing](#10-phase-7--end-to-end-testing)
11. [Common Errors & Fixes](#11-common-errors--fixes)
12. [File Structure After Implementation](#12-file-structure-after-implementation)
13. [Performance Expectations](#13-performance-expectations)

---

## 1. The Core Problem, Re-explained

Your current Stage 3 uses **LivePortrait** with the file `assets/examples/driving/d0.mp4` as the driving video. That file is a short, silent clip of a woman smiling and looking around. LivePortrait copies movements from this driving video onto your portrait — it **does not read audio at all**. No amount of fixing the config will make LivePortrait produce lip sync from audio, because it is architecturally the wrong type of model.

The Stage 4 lipsync handler in `CpuWorker.js` (lines 122–127) is a passthrough that simply copies `avatar.mp4` to `composed.mp4`, doing nothing.

**The fix is a two-stage replacement:**

| Stage | Old | New |
|---|---|---|
| Stage 3 (Avatar) | LivePortrait with silent driving video | LivePortrait in **neutralize mode** (closes the mouth to a neutral state) |
| Stage 4 (LipSync) | Passthrough copy | **MuseTalk** (audio-driven lipsync) + **CodeFormer** (face restore) |

LivePortrait is kept, but used for what it is actually good at: neutralizing/retargeting facial expression. It gives MuseTalk a clean, forward-facing, closed-mouth canvas to work on — which is exactly what MuseTalk needs for best results.

---

## 2. New Architecture Overview

```
User Prompt
    │
    ▼
Stage 1: Script Generation (OpenAI GPT-4o-mini)          ← unchanged
    │
    ▼
Stage 2: Voice Synthesis (XTTS v2 — Port 5100)           ← unchanged
    │  outputs: audio.wav
    ▼
Stage 3: Avatar Neutralization (LivePortrait — Port 5200) ← CHANGED
    │  input:  portrait image (PNG/JPG)
    │  task:   expression retarget → neutral closed-mouth
    │  output: neutral_avatar.mp4 (25fps, face forward, mouth closed)
    ▼
Stage 4a: LipSync (MuseTalk — Port 5300)                  ← NEW
    │  input:  neutral_avatar.mp4 + audio.wav
    │  output: lipsynced_raw.mp4
    │
Stage 4b: Face Restore (CodeFormer — Port 5500)           ← NEW
    │  input:  lipsynced_raw.mp4
    │  output: lipsynced_enhanced.mp4
    ▼
Stage 5: Media Composition (FFmpeg)                       ← unchanged
    │  merges background music, ducks audio
    ▼
Stage 6: Caption Rendering (Remotion + Whisper.cpp)       ← unchanged
    │
    ▼
reel_final.mp4
```

**Port assignment:**

| Service | Port | Model |
|---|---|---|
| XTTS TTS | 5100 | Coqui XTTS v2 |
| LivePortrait | 5200 | KwaiVGI/LivePortrait |
| MuseTalk | 5300 | TMElyralab/MuseTalk |
| CodeFormer | 5500 | sczhou/CodeFormer |

---

## 3. Prerequisites & Environment Inventory

Before starting, verify the following on your machine:

### 3.1 GPU & CUDA

```powershell
nvidia-smi
```

Required: NVIDIA GPU with at least **6 GB VRAM** (8 GB recommended for all three models in sequence).  
Your RTX 2050 (4 GB) will be tight — if VRAM errors occur, see Section 11.

Check your CUDA version from the `nvidia-smi` output (top-right corner). Note it down — you will need it when installing PyTorch.

### 3.2 Python

```powershell
python --version
```

Required: Python **3.10.x** (not 3.11 or 3.12 — mmcv and some torch builds break on 3.11+).  
If you don't have 3.10: download from https://www.python.org/downloads/release/python-31011/  
Install with "Add to PATH" checked.

### 3.3 Git, FFmpeg, Node.js

```powershell
git --version
ffmpeg -version
node --version
```

All three must be accessible from PATH. FFmpeg is already in your project at `C:\ffmpeg\bin\ffmpeg.exe`.

### 3.4 Conda (optional but recommended)

MuseTalk and CodeFormer each need their own Python environments because they have conflicting dependencies. Use either **conda** (recommended) or Python `venv` for isolation.

Install Miniconda from: https://docs.conda.io/en/latest/miniconda.html

---

## 4. Phase 1 — MuseTalk Engine Setup (Port 5300)

MuseTalk is the core lipsync engine. It takes a portrait video (or image) and an audio file, and outputs a lip-synced video at 25fps.

### 4.1 Clone MuseTalk

```powershell
cd ai-engines
git clone https://github.com/TMElyralab/MuseTalk.git musetalk
cd musetalk
```

### 4.2 Create isolated environment

```powershell
conda create -n musetalk python=3.10 -y
conda activate musetalk
```

Or with venv:

```powershell
python -m venv venv-musetalk
.\venv-musetalk\Scripts\Activate.ps1
```

### 4.3 Install PyTorch (match your CUDA version)

For CUDA 11.8:
```powershell
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
```

For CUDA 12.1:
```powershell
pip install torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu121
```

Verify CUDA is available:
```python
python -c "import torch; print(torch.cuda.is_available())"
# Must print: True
```

### 4.4 Install MuseTalk dependencies

```powershell
pip install -r requirements.txt
pip install --no-cache-dir -U openmim
mim install mmengine
mim install "mmcv==2.0.1"
mim install "mmdet==3.1.0"
mim install "mmpose==1.1.0"
pip install fastapi uvicorn python-multipart
```

> **Known issue:** If `mim install mmcv` fails with a CUDA mismatch error, your PyTorch CUDA version doesn't match your installed CUDA toolkit. Double-check with `nvcc --version` and re-install PyTorch for the correct version.

> **Known issue:** If `huggingface_hub` CLI errors appear during weight download, pin the version:
> ```powershell
> pip install "huggingface_hub[cli]==0.30.2"
> ```

### 4.5 Set FFmpeg path

MuseTalk needs a static FFmpeg binary path set as an environment variable. Add this to your PowerShell profile or to the startup script:

```powershell
$env:FFMPEG_PATH = "C:\ffmpeg\bin"
```

### 4.6 Download model weights

```powershell
# From inside ai-engines/musetalk/
python -c "
from huggingface_hub import snapshot_download
snapshot_download(repo_id='TMElyralab/MuseTalk', local_dir='./models/musetalk')
snapshot_download(repo_id='stabilityai/sd-vae-ft-mse', local_dir='./models/sd-vae-ft-mse')
"
```

Download remaining weights manually (place in `models/` directory):

| File | Source | Destination |
|---|---|---|
| `dw-ll_ucoco_384.pth` | [dwpose HuggingFace](https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ll_ucoco_384.pth) | `models/dwpose/` |
| `79999_iter.pth` | [face-parse-bisent](https://huggingface.co/datasets/TMElyralab/MuseTalk/blob/main/utils/face_parsing/79999_iter.pth) | `models/face-parse-bisent/` |
| `resnet18-5c106cde.pth` | [pytorch model hub](https://download.pytorch.org/models/resnet18-5c106cde.pth) | `models/face-parse-bisent/` |
| `tiny.pt` | [whisper tiny](https://openaipublic.azureedge.net/main/whisper/models/65147644a518d12f04e32d6f3b26facc3f8dd46e5390956a9424a650c0ce22b9/tiny.pt) | `models/whisper/` |

Final model tree should look like:

```
models/
├── musetalk/
│   ├── musetalk.json
│   └── pytorch_model.bin
├── dwpose/
│   └── dw-ll_ucoco_384.pth
├── face-parse-bisent/
│   ├── 79999_iter.pth
│   └── resnet18-5c106cde.pth
├── sd-vae-ft-mse/
│   ├── config.json
│   └── diffusion_pytorch_model.bin
└── whisper/
    └── tiny.pt
```

### 4.7 Verify MuseTalk works standalone

```powershell
python -m scripts.inference \
  --inference_config configs/inference/test.yaml \
  --bbox_shift 0
```

Edit `configs/inference/test.yaml` to point to a test portrait and audio file first. If it generates a video, the engine is working.

---

## 5. Phase 2 — CodeFormer Engine Setup (Port 5500)

CodeFormer is a face restoration model from NeurIPS 2022. It sharpens and corrects facial artifacts introduced by MuseTalk's 256×256 face region.

### 5.1 Clone CodeFormer

```powershell
cd ai-engines
git clone https://github.com/sczhou/CodeFormer.git codeformer
cd codeformer
```

### 5.2 Create isolated environment

```powershell
conda create -n codeformer python=3.8 -y
conda activate codeformer
```

> CodeFormer officially targets Python 3.8. You can try 3.10, but the `basicsr` package is more stable on 3.8.

### 5.3 Install dependencies

```powershell
pip install torch==1.13.1 torchvision==0.14.1 torchaudio==0.13.1 --index-url https://download.pytorch.org/whl/cu117
pip install -r requirements.txt
python basicsr/setup.py develop
pip install fastapi uvicorn python-multipart
```

### 5.4 Download model weights

```powershell
python scripts/download_pretrained_models.py facelib
python scripts/download_pretrained_models.py CodeFormer
```

This downloads:
- `weights/facelib/` — detection models (RetinaFace, YOLO5)
- `weights/CodeFormer/codeformer.pth` — main restoration model

### 5.5 Verify CodeFormer works standalone

```powershell
python inference_codeformer.py \
  -w 0.7 \
  --input_path inputs/cropped_faces \
  --output_path results/test_faces \
  --face_upsample
```

`-w` is the fidelity weight (0.0 = max restoration, 1.0 = max identity). For lipsync output, use `0.5`–`0.7`.

---

## 6. Phase 3 — LivePortrait Neutralization Mode

You already have LivePortrait installed at `ai-engines/avatar/` running on port 5200. The key change is **how** you call it. Instead of using it as an animator (driving video → portrait), you will use its **retargeting control** to set the expression parameters to a neutral state (mouth closed, looking forward).

### 6.1 Understanding the neutralize call

LivePortrait exposes expression retargeting via its `--flag_relative_motion` and expression coefficient parameters. To neutralize a portrait image:

- Set `delta_exp` (expression deltas) to zero — this removes all expression
- Keep head pose from the source portrait
- Do **not** loop a driving video

The SieveSync team's approach, from their open-sourced `main.py`:

```python
# They use LivePortrait with expression zeroing to close the mouth
neutral_video = neutralize_with_liveportrait(video_path, timestamp_chunks, temp_dir)
```

Their alignment algorithm uses **MediaPipe FaceMesh** to detect face orientation, then calls LivePortrait's retargeting mode to flatten the expression.

### 6.2 What to change in your existing `server.py`

In `ai-engines/avatar/server.py`, add a new endpoint `/neutralize` that:

1. Accepts a portrait image path
2. Calls LivePortrait in retargeting mode with expression zeroed out
3. Returns a short (1–3 second) neutral-expression video loop at 25fps

The existing `/animate` endpoint (driven by `d0.mp4`) can remain as a fallback.

### 6.3 Neutralize endpoint sketch

Add to your existing `ai-engines/avatar/server.py`:

```python
@app.post("/neutralize")
async def neutralize_portrait(
    portrait: UploadFile = File(...),
    duration_seconds: float = Form(default=3.0)
):
    """
    Takes a portrait image and returns a short neutral-expression video.
    The output is a clean canvas for MuseTalk to work on.
    """
    import uuid, shutil
    job_id = str(uuid.uuid4())[:8]
    portrait_path = f"temp/{job_id}_portrait{Path(portrait.filename).suffix}"
    output_path = f"temp/{job_id}_neutral.mp4"

    os.makedirs("temp", exist_ok=True)
    with open(portrait_path, "wb") as f:
        f.write(await portrait.read())

    # Call LivePortrait CLI with retargeting args
    # The key flags:
    #   --flag_relative_motion False  — absolute, not relative motion
    #   Expression coefficients set to neutral (zeros)
    cmd = [
        "python", "inference.py",
        "--source", portrait_path,
        "--driving", "assets/examples/driving/neutral_loop.mp4",  # see note below
        "--output", output_path,
        "--flag_do_crop", "True",
        "--flag_pasteback", "True",
    ]
    subprocess.run(cmd, check=True)

    return FileResponse(output_path, media_type="video/mp4")
```

> **Note on `neutral_loop.mp4`:** You need to create or download a short (~3s) driving video of a person with a completely neutral expression — face forward, mouth closed, no movement. Record yourself looking straight at the camera with your mouth closed and minimal movement. This is all LivePortrait needs to output a neutralized version of any portrait. Save it to `assets/examples/driving/neutral_loop.mp4`.
>
> Alternatively, LivePortrait's `--flag_relative_motion` flag combined with a single-frame driving input can produce a still neutral frame, which you then loop with FFmpeg.

---

## 7. Phase 4 — FastAPI Service Wrappers

You need two new FastAPI services, following the same pattern as your existing TTS and Avatar services.

### 7.1 MuseTalk FastAPI wrapper

Create: `ai-engines/musetalk/server.py`

```python
import os
import uuid
import subprocess
import shutil
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
import uvicorn

app = FastAPI(title="MuseTalk LipSync Service")

MUSETALK_ROOT = Path(__file__).parent  # ai-engines/musetalk/
TEMP_DIR = MUSETALK_ROOT / "temp"
TEMP_DIR.mkdir(exist_ok=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "musetalk"}


@app.post("/lipsync")
async def lipsync(
    portrait: UploadFile = File(..., description="Portrait image or short neutral video"),
    audio: UploadFile = File(..., description="Speech audio WAV file"),
    bbox_shift: int = Form(default=0, description="Mask shift. Positive = more open mouth"),
    batch_size: int = Form(default=4),
):
    """
    Runs MuseTalk inference.
    Input:  portrait (image or video) + audio (wav)
    Output: lip-synced MP4 video
    """
    job_id = str(uuid.uuid4())[:8]
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    portrait_suffix = Path(portrait.filename).suffix or ".mp4"
    portrait_path = job_dir / f"portrait{portrait_suffix}"
    audio_path = job_dir / "audio.wav"
    output_path = job_dir / "lipsynced.mp4"

    # Save uploaded files
    with open(portrait_path, "wb") as f:
        f.write(await portrait.read())
    with open(audio_path, "wb") as f:
        f.write(await audio.read())

    # Build MuseTalk inference config YAML dynamically
    config_path = job_dir / "inference_config.yaml"
    config_content = f"""
task_{job_id}:
  video_path: "{portrait_path.as_posix()}"
  audio_path: "{audio_path.as_posix()}"
  bbox_shift: {bbox_shift}
"""
    config_path.write_text(config_content)

    # Run MuseTalk inference
    env = os.environ.copy()
    env["FFMPEG_PATH"] = "C:\\ffmpeg\\bin"

    result = subprocess.run(
        [
            "python", "-m", "scripts.inference",
            "--inference_config", str(config_path),
            "--result_dir", str(job_dir / "results"),
            "--output_vid_name", str(output_path),
            "--bbox_shift", str(bbox_shift),
        ],
        cwd=str(MUSETALK_ROOT),
        capture_output=True,
        text=True,
        env=env,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"MuseTalk failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
        )

    if not output_path.exists():
        # MuseTalk names outputs based on input filenames; find it
        result_dir = job_dir / "results"
        mp4_files = list(result_dir.glob("*.mp4"))
        if not mp4_files:
            raise HTTPException(status_code=500, detail="MuseTalk produced no output video")
        output_path = mp4_files[0]

    return FileResponse(
        str(output_path),
        media_type="video/mp4",
        filename="lipsynced.mp4",
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5300)
```

### 7.2 CodeFormer FastAPI wrapper

Create: `ai-engines/codeformer/server.py`

```python
import os
import uuid
import subprocess
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
import uvicorn

app = FastAPI(title="CodeFormer Face Restore Service")

CODEFORMER_ROOT = Path(__file__).parent  # ai-engines/codeformer/
TEMP_DIR = CODEFORMER_ROOT / "temp"
TEMP_DIR.mkdir(exist_ok=True)


@app.get("/health")
def health():
    return {"status": "ok", "service": "codeformer"}


@app.post("/enhance")
async def enhance(
    video: UploadFile = File(..., description="Lip-synced video to enhance"),
    fidelity_weight: float = Form(default=0.7, description="0.0=max restore, 1.0=max identity"),
    face_upsample: bool = Form(default=True),
    bg_upsampler: str = Form(default="realesrgan"),
):
    """
    Runs CodeFormer face restoration on the input video.
    fidelity_weight=0.7 is a good balance for lipsync output.
    """
    job_id = str(uuid.uuid4())[:8]
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    input_path = job_dir / "lipsynced.mp4"
    output_dir = job_dir / "enhanced"
    output_dir.mkdir(exist_ok=True)

    with open(input_path, "wb") as f:
        f.write(await video.read())

    cmd = [
        "python", "inference_codeformer.py",
        "-w", str(fidelity_weight),
        "--input_path", str(input_path),
        "--output_path", str(output_dir),
    ]
    if face_upsample:
        cmd.append("--face_upsample")

    result = subprocess.run(
        cmd,
        cwd=str(CODEFORMER_ROOT),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"CodeFormer failed:\n{result.stderr}"
        )

    # CodeFormer saves the result in output_dir/restored_imgs/ or output_dir/final_results/
    final_results = list(output_dir.rglob("*.mp4"))
    if not final_results:
        raise HTTPException(status_code=500, detail="CodeFormer produced no output video")

    return FileResponse(
        str(final_results[0]),
        media_type="video/mp4",
        filename="enhanced.mp4",
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5500)
```

### 7.3 PowerShell startup scripts

Create: `ai-engines/musetalk/start-musetalk.ps1`

```powershell
Write-Host "Starting MuseTalk LipSync Service on port 5300..." -ForegroundColor Cyan

$env:FFMPEG_PATH = "C:\ffmpeg\bin"

# Activate environment
conda activate musetalk
# OR: .\venv-musetalk\Scripts\Activate.ps1

Set-Location $PSScriptRoot

python server.py
```

Create: `ai-engines/codeformer/start-codeformer.ps1`

```powershell
Write-Host "Starting CodeFormer Face Restore Service on port 5500..." -ForegroundColor Cyan

conda activate codeformer
# OR: .\venv-codeformer\Scripts\Activate.ps1

Set-Location $PSScriptRoot

python server.py
```

---

## 8. Phase 5 — CpuWorker.js Integration

This is the critical Node.js change. You need to update `backend/src/workers/CpuWorker.js` to call the new services.

### 8.1 Update the Avatar Stage (Stage 3)

Find the avatar generation logic in `CpuWorker.js` — the part that calls the LivePortrait service. Change it to call the new `/neutralize` endpoint instead of `/animate`.

```javascript
// CpuWorker.js — Stage 3: Avatar Neutralization

async function runAvatarStage(assets, jobConfig, onProgress) {
  if (onProgress) onProgress(10, "[Avatar] Neutralizing portrait expression via LivePortrait...");

  const avatarServiceUrl = process.env.AVATAR_SERVICE_URL || "http://localhost:5200";

  // Read the portrait image
  const portraitPath = jobConfig.portraitPath || "assets/avatars/default_portrait.jpg";
  const portraitBuffer = fs.readFileSync(portraitPath);
  const portraitFilename = path.basename(portraitPath);

  // Build multipart form data
  const formData = new FormData();
  formData.append("portrait", portraitBuffer, {
    filename: portraitFilename,
    contentType: "image/jpeg",
  });
  formData.append("duration_seconds", "3.0");

  const response = await fetch(`${avatarServiceUrl}/neutralize`, {
    method: "POST",
    body: formData,
    headers: formData.getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LivePortrait neutralize failed (${response.status}): ${errText}`);
  }

  // Save neutral avatar video
  const neutralVideoPath = sanitizePath(`storage/temp/${jobConfig.jobId}_neutral_avatar.mp4`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(neutralVideoPath, buffer);

  if (onProgress) onProgress(100, "[Avatar] Portrait neutralized successfully.");
  return { neutralVideoPath };
}
```

### 8.2 Replace the LipSync Passthrough (Stage 4)

Find the lipsync stage (lines 122–127 in your current `CpuWorker.js`) — the section with the comment `"LivePortrait output is already lip-synced. Passing through..."`. Replace the entire block:

```javascript
// CpuWorker.js — Stage 4: LipSync + Enhancement
// REPLACES the passthrough at lines 122-127

async function runLipSyncStage(assets, onProgress) {
  const museTalkUrl = process.env.MUSETALK_SERVICE_URL || "http://localhost:5300";
  const codeFormerUrl = process.env.CODEFORMER_SERVICE_URL || "http://localhost:5500";

  // ── Step 4a: MuseTalk LipSync ──────────────────────────────────────────────
  if (onProgress) onProgress(10, "[LipSync] Running MuseTalk audio-driven lipsync...");

  const neutralVideoBuffer = fs.readFileSync(assets.neutralVideoPath);
  const audioBuffer = fs.readFileSync(assets.audioPath); // audio.wav from Stage 2

  const museTalkForm = new FormData();
  museTalkForm.append("portrait", neutralVideoBuffer, {
    filename: "neutral_avatar.mp4",
    contentType: "video/mp4",
  });
  museTalkForm.append("audio", audioBuffer, {
    filename: "audio.wav",
    contentType: "audio/wav",
  });
  museTalkForm.append("bbox_shift", "0");       // tune: positive = more open mouth
  museTalkForm.append("batch_size", "4");

  const museTalkResponse = await fetch(`${museTalkUrl}/lipsync`, {
    method: "POST",
    body: museTalkForm,
    headers: museTalkForm.getHeaders(),
    // MuseTalk can take 30–120 seconds for a 30s audio clip
    signal: AbortSignal.timeout(300_000), // 5 min timeout
  });

  if (!museTalkResponse.ok) {
    const errText = await museTalkResponse.text();
    throw new Error(`MuseTalk lipsync failed (${museTalkResponse.status}): ${errText}`);
  }

  const rawLipsyncPath = sanitizePath(`storage/temp/${assets.jobId}_lipsynced_raw.mp4`);
  const museTalkBuffer = Buffer.from(await museTalkResponse.arrayBuffer());
  fs.writeFileSync(rawLipsyncPath, museTalkBuffer);

  if (onProgress) onProgress(60, "[LipSync] MuseTalk complete. Running CodeFormer face enhancement...");

  // ── Step 4b: CodeFormer Face Restore ──────────────────────────────────────
  const codeFormerForm = new FormData();
  codeFormerForm.append("video", fs.readFileSync(rawLipsyncPath), {
    filename: "lipsynced_raw.mp4",
    contentType: "video/mp4",
  });
  codeFormerForm.append("fidelity_weight", "0.7"); // 0.7 = good balance
  codeFormerForm.append("face_upsample", "true");

  const codeFormerResponse = await fetch(`${codeFormerUrl}/enhance`, {
    method: "POST",
    body: codeFormerForm,
    headers: codeFormerForm.getHeaders(),
    signal: AbortSignal.timeout(300_000),
  });

  if (!codeFormerResponse.ok) {
    // CodeFormer failure is non-critical — fall back to raw lipsync output
    console.warn(`[LipSync] CodeFormer failed, using raw MuseTalk output. Error: ${await codeFormerResponse.text()}`);
    const composedVideoPath = sanitizePath(`storage/temp/${assets.jobId}_composed.mp4`);
    fs.copyFileSync(rawLipsyncPath, composedVideoPath);
    if (onProgress) onProgress(100, "[LipSync] Used raw MuseTalk output (CodeFormer fallback).");
    return { composedVideoPath };
  }

  const enhancedVideoPath = sanitizePath(`storage/temp/${assets.jobId}_composed.mp4`);
  const codeFormerBuffer = Buffer.from(await codeFormerResponse.arrayBuffer());
  fs.writeFileSync(enhancedVideoPath, codeFormerBuffer);

  if (onProgress) onProgress(100, "[LipSync] LipSync + face enhancement complete.");
  return { composedVideoPath: enhancedVideoPath };
}
```

### 8.3 Wire the new functions into the main worker flow

In the main pipeline switch/case or sequential handler in `CpuWorker.js`, update the stage routing:

```javascript
// Inside your pipeline orchestration:

case "avatar":
  const avatarResult = await runAvatarStage(assets, jobConfig, onProgress);
  assets.neutralVideoPath = avatarResult.neutralVideoPath;
  // neutralVideoPath replaces avatarVideoPath for the next stage
  break;

case "lipsync":
  // assets.neutralVideoPath comes from Stage 3
  // assets.audioPath comes from Stage 2
  const lipsyncResult = await runLipSyncStage(assets, onProgress);
  assets.composedVideoPath = lipsyncResult.composedVideoPath;
  break;
```

Make sure `assets.audioPath` is being set during Stage 2 (voice synthesis) and carried forward. It should already be set — check that the `audioPath` key name matches what Stage 2 sets.

---

## 9. Phase 6 — Pipeline Wiring & .env Config

### 9.1 Update `backend/.env`

Add the new service URLs to your backend environment file:

```env
# Existing
AVATAR_ENGINE=liveportrait
AVATAR_SERVICE_URL=http://localhost:5200

# New
MUSETALK_SERVICE_URL=http://localhost:5300
CODEFORMER_SERVICE_URL=http://localhost:5500

# CodeFormer fidelity (0.0–1.0). 0.7 is a safe default.
CODEFORMER_FIDELITY=0.7

# MuseTalk mouth openness shift (-10 to +10). 0 is neutral. 
# Increase if mouth appears too closed.
MUSETALK_BBOX_SHIFT=0
```

### 9.2 Update `backend/.env.example`

Add the same keys with placeholder values so other developers know about them.

### 9.3 Read env vars in CpuWorker.js

At the top of `CpuWorker.js` where you read other env vars:

```javascript
const MUSETALK_SERVICE_URL = process.env.MUSETALK_SERVICE_URL || "http://localhost:5300";
const CODEFORMER_SERVICE_URL = process.env.CODEFORMER_SERVICE_URL || "http://localhost:5500";
const CODEFORMER_FIDELITY = parseFloat(process.env.CODEFORMER_FIDELITY || "0.7");
const MUSETALK_BBOX_SHIFT = parseInt(process.env.MUSETALK_BBOX_SHIFT || "0");
```

### 9.4 Startup order

All services must be running before the backend processes jobs. The correct startup order is:

```
Terminal 1:  start Redis (Docker or native)
Terminal 2:  start MongoDB
Terminal 3:  .\ai-engines\tts\start-tts.ps1          (Port 5100)
Terminal 4:  .\ai-engines\avatar\start-avatar.ps1     (Port 5200)
Terminal 5:  .\ai-engines\musetalk\start-musetalk.ps1 (Port 5300)
Terminal 6:  .\ai-engines\codeformer\start-codeformer.ps1 (Port 5500)
Terminal 7:  cd backend && npm run dev
```

Add a health-check wait loop in `backend/src/services/AvatarService.js` (or equivalent) so the backend retries on startup if the new services aren't ready yet.

---

## 10. Phase 7 — End-to-End Testing

### 10.1 Test each service independently

```powershell
# Test MuseTalk health
curl http://localhost:5300/health

# Test MuseTalk with a portrait + audio
curl -X POST http://localhost:5300/lipsync `
  -F "portrait=@assets/avatars/test_portrait.jpg" `
  -F "audio=@storage/temp/test_audio.wav" `
  -F "bbox_shift=0" `
  --output test_lipsynced.mp4

# Test CodeFormer health
curl http://localhost:5500/health

# Test CodeFormer with the MuseTalk output
curl -X POST http://localhost:5500/enhance `
  -F "video=@test_lipsynced.mp4" `
  -F "fidelity_weight=0.7" `
  --output test_enhanced.mp4

# Test LivePortrait neutralize
curl -X POST http://localhost:5200/neutralize `
  -F "portrait=@assets/avatars/test_portrait.jpg" `
  -F "duration_seconds=3.0" `
  --output test_neutral.mp4
```

### 10.2 Visual inspection checklist

Open `test_lipsynced.mp4` and check:
- [ ] Avatar mouth is moving (not just blinking/smiling in a loop)
- [ ] Lip movements correspond to the words in the audio
- [ ] Face identity is preserved (same person throughout)
- [ ] No obvious flickering or black frames

Open `test_enhanced.mp4` and check:
- [ ] Face is sharper than `test_lipsynced.mp4`
- [ ] No over-smoothing artifacts
- [ ] Skin texture looks natural

### 10.3 Tune `bbox_shift` if needed

`bbox_shift` controls how much of the lower face is included in MuseTalk's mouth mask.

| Value | Effect | When to use |
|---|---|---|
| `-7` to `-3` | Smaller mask, tighter lip area | Mouth appears too wide / artifacts around chin |
| `0` | Default | Most portraits |
| `+3` to `+7` | Larger mask, more open mouth | Mouth appears too closed, not enough teeth visible |

Test with a sample audio that has clear vowel sounds (A, E, O).

### 10.4 Full pipeline E2E test

```powershell
# From project root
node test_sample_post.js
```

Watch the job progress in your MongoDB or through the BullMQ dashboard. Each stage should log a completion message. The final output at `storage/exports/reel_final.mp4` should have a properly lip-synced avatar.

---

## 11. Common Errors & Fixes

### VRAM Out of Memory

**Symptom:** `CUDA out of memory` in MuseTalk or CodeFormer logs.  
**Fix 1:** Reduce `batch_size` in the MuseTalk call from `4` to `2` or `1`.  
**Fix 2:** Run MuseTalk and CodeFormer sequentially, not concurrently. Add a mutex/lock in `CpuWorker.js` around the Stage 4 calls so only one job processes at a time.  
**Fix 3:** Add `torch.cuda.empty_cache()` between the MuseTalk and CodeFormer calls in the server scripts.

### mmcv install fails

**Symptom:** `mim install mmcv` errors about CUDA or torch version mismatch.  
**Fix:** The mmcv version must match your PyTorch and CUDA exactly. Check the compatibility table at https://mmcv.readthedocs.io/en/latest/get_started/installation.html

### MuseTalk output video has no audio

**Symptom:** The MuseTalk output `.mp4` is silent.  
**Explanation:** This is expected. MuseTalk outputs video only. The audio will be added back by Stage 5 (FFmpeg composition). Do not add audio at Stage 4 — Stage 5 handles it.

### MuseTalk mouth barely moves

**Symptom:** The face is facing forward but the mouth barely opens.  
**Fix 1:** Increase `bbox_shift` to `+5` or `+7`.  
**Fix 2:** Check that the input portrait/video has a face resolution of at least 256×256 pixels. Very small face regions produce poor results.  
**Fix 3:** Try MuseTalk 1.5 weights instead of 1.0 (they were released in March 2025 with better clarity).

### CodeFormer over-smoothes the face

**Symptom:** The restored face looks like plastic — too smooth, unnatural.  
**Fix:** Increase `fidelity_weight` from `0.7` to `0.85` or `0.9`. Higher values preserve more of the original identity at the cost of less restoration.

### LivePortrait neutralize produces a blurry loop

**Symptom:** The neutral video is lower quality than expected.  
**Fix:** Make sure the driving `neutral_loop.mp4` you recorded is well-lit, front-facing, and at least 512×512 resolution. LivePortrait's quality degrades significantly with low-res driving videos.

### Node.js FormData `getHeaders()` not found

**Symptom:** `TypeError: formData.getHeaders is not a function`  
**Fix:** The built-in `FormData` (from Node 18+) doesn't have `getHeaders()`. Use the `form-data` npm package instead:
```javascript
const FormData = require("form-data");
```
Or switch to `fetch` with `FormData` from the global but set headers manually.

### Stage 4 timeout in CpuWorker

**Symptom:** The job fails with a timeout error after ~30 seconds.  
**Fix:** MuseTalk processing time scales with audio length. A 30-second audio clip takes ~60–90 seconds on a mid-range GPU. Increase the fetch timeout in `CpuWorker.js` to at least 300 seconds (5 minutes), as shown in the code above.

---

## 12. File Structure After Implementation

```
avatar-reels/
├── ai-engines/
│   ├── avatar/                    ← LivePortrait (unchanged + new /neutralize endpoint)
│   │   ├── server.py              ← add /neutralize endpoint
│   │   └── start-avatar.ps1
│   ├── tts/                       ← XTTS (unchanged)
│   ├── musetalk/                  ← NEW
│   │   ├── [MuseTalk repo files]  ← cloned from GitHub
│   │   ├── server.py              ← new FastAPI wrapper
│   │   ├── start-musetalk.ps1     ← new startup script
│   │   └── models/                ← downloaded weights (~4GB)
│   └── codeformer/                ← NEW
│       ├── [CodeFormer repo files]← cloned from GitHub
│       ├── server.py              ← new FastAPI wrapper
│       ├── start-codeformer.ps1   ← new startup script
│       └── weights/               ← downloaded weights (~500MB)
├── assets/
│   └── examples/
│       └── driving/
│           ├── d0.mp4             ← old (keep for reference)
│           └── neutral_loop.mp4   ← NEW: record yourself, face-forward, mouth closed
├── backend/
│   ├── src/
│   │   └── workers/
│   │       └── CpuWorker.js       ← updated Stage 3 + Stage 4 logic
│   └── .env                       ← add MUSETALK_SERVICE_URL + CODEFORMER_SERVICE_URL
└── docs/
    └── AVATAR_PIPELINE_IMPLEMENTATION_PLAN.md  ← this file
```

---

## 13. Performance Expectations

On a mid-range GPU (RTX 2050 / 3060, 4–6 GB VRAM):

| Stage | Input | Expected Time |
|---|---|---|
| Stage 3 — LivePortrait neutralize | 1 portrait → 3s video | ~5–10 seconds |
| Stage 4a — MuseTalk lipsync | 3s neutral + 30s audio | ~60–90 seconds |
| Stage 4b — CodeFormer enhance | 30s video | ~20–40 seconds |
| **Total new stages 3+4** | | **~90–140 seconds** |

For context, the old broken pipeline completed Stage 3 fast but produced unusable output. This pipeline trades speed for correctness — a 30-second marketing reel will take ~2–3 minutes total end-to-end.

**To improve speed:**
- Use `--bbox_shift 0 --batch_size 8` in MuseTalk if VRAM allows
- Skip CodeFormer enhancement on draft runs (set `SKIP_CODEFORMER=true` env flag and bypass the enhance call)
- Pre-process the portrait once and cache the neutral avatar video for repeated use (same avatar, different scripts)

---

*Document prepared for AdWhiz AdWhiz Avatar Reels Pipeline — June 2026*
