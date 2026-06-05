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
    portrait: UploadFile = File(..., description="Neutral video loop (mp4)"),
    audio: UploadFile = File(..., description="Speech audio WAV file"),
    bbox_shift: int = Form(default=0, description="Mask shift. Positive = more open mouth"),
    batch_size: int = Form(default=4),
):
    """
    Runs MuseTalk inference.
    Input:  portrait (video) + audio (wav)
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

    # Run MuseTalk inference using the virtual environment python
    # We will invoke scripts.inference as a subprocess
    venv_python = str(MUSETALK_ROOT / "venv-musetalk" / "Scripts" / "python.exe")
    if not os.path.exists(venv_python):
        venv_python = "python" # fallback if venv not at expected path
        
    env = os.environ.copy()
    env["FFMPEG_PATH"] = "C:\\ffmpeg\\bin"

    cmd = [
        venv_python, "-m", "scripts.inference",
        "--inference_config", str(config_path),
        "--unet_model_path", "./models/musetalk/pytorch_model.bin",
        "--unet_config", "./models/musetalk/musetalk.json",
        "--whisper_dir", "./models/whisper",
        "--vae_type", "sd-vae-ft-mse",
        "--result_dir", str(job_dir / "results"),
        "--output_vid_name", str(output_path.name),
        "--bbox_shift", str(bbox_shift),
        "--batch_size", str(batch_size),
        "--ffmpeg_path", "C:\\ffmpeg\\bin"
    ]

    print(f"Running MuseTalk CLI command: {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
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

    # MuseTalk output will be at job_dir/results/v15/lipsynced.mp4
    # Because of "--result_dir" pointing to job_dir/results and version default is v15
    final_output_path = job_dir / "results" / "v15" / "lipsynced.mp4"
    if not final_output_path.exists():
        # Check if it was placed anywhere else
        mp4_files = list(job_dir.rglob("*.mp4"))
        # We don't want to return portrait.mp4
        mp4_files = [f for f in mp4_files if f.name != f"portrait{portrait_suffix}"]
        if not mp4_files:
            raise HTTPException(status_code=500, detail=f"MuseTalk produced no output video. STDOUT: {result.stdout}")
        final_output_path = mp4_files[0]

    # Return output video
    return FileResponse(
        str(final_output_path),
        media_type="video/mp4",
        filename="lipsynced.mp4",
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5300)
