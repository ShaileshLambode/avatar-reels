# LivePortrait Local Avatar Service

This is the local avatar animation microservice for AdWhiz, running on port `5200`. It replaces the old SadTalker model with **LivePortrait**, a state-of-the-art talking-head generator that produces highly realistic expressions, natural head motion, and high-fidelity video outputs.

## Architecture

Unlike SadTalker which is natively audio-driven, LivePortrait is fundamentally **video-driven** — it animates a source portrait image using the motion and expressions extracted from a **driving video**.

To integrate this smoothly into our audio-driven pipeline, this microservice uses a robust **two-stage local pipeline**:
1. **Stage A — Driving Video Generation:** Loops the input source image with the driving audio using FFmpeg. This creates a temporal reference video of the correct duration.
2. **Stage B — LivePortrait Inference:** Feeds the source image and generated driving video into LivePortrait's core inference engine to generate the animated talking-head spokesperson MP4. This animated video serves as the base for Stage 4 of the main pipeline, where it undergoes audio-driven lip sync (via MuseTalk) and face restoration/enhancement (via CodeFormer).

## Features

- **CUDA Auto-Detection:** Automatically detects if an NVIDIA GPU/CUDA is available at startup.
  - **GPU Mode (with CUDA):** Fast inference, takes ~5 to 15 seconds for a 30s video.
  - **CPU Mode (Fallback):** Handles execution on CPU-only machines safely (runs slower, ~2 to 10 minutes for a 30s video).
- **FastAPI Interface:** Exposes HTTP endpoints identical to what the AdWhiz Node.js backend expects.
- **Robust Subprocess Isolation:** LivePortrait inference is run as an isolated Python subprocess within the local virtual environment (`venv`), preventing memory leaks and importing conflicts with the FastAPI server.

## API Endpoints

### 1. Health Check
* **Endpoint:** `GET /health`
* **Response:**
```json
{
  "status": "ok",
  "engine": "LivePortrait",
  "device": "cpu",
  "cuda_available": false,
  "models_loaded": true,
  "setup_status": {
    "repository_cloned": true,
    "models_downloaded": true,
    "virtual_env_ready": true
  }
}
```

### 2. Animate Portrait
* **Endpoint:** `POST /animate`
* **Request:** `multipart/form-data`
  - `source_image`: Uploaded image file (e.g. `.png` or `.jpg` containing a clear face)
  - `driven_audio`: Uploaded audio file (e.g. `.mp3` or `.wav` containing the spoken speech)
  - `options` (optional): JSON string of custom arguments
* **Response:**
  - File stream of the generated `.mp4` video.

## Directory Structure

Upon bootstrapping, the structure will be organized as follows:
```text
ai-engines/avatar/
├── LivePortrait/            # Cloned KwaiVGI LivePortrait repo
│   └── pretrained_weights/  # Pretrained weights downloaded from HuggingFace
├── venv/                    # Python virtual environment
├── requirements.txt         # FastAPI service dependencies
├── server.py                # FastAPI microservice wrapper
├── start-avatar.ps1         # PowerShell bootstrapper script
└── README.md                # This documentation
```

## Initial Setup & Bootstrapping

Simply execute the PowerShell bootstrapper from the `ai-engines/avatar/` directory:
```powershell
./start-avatar.ps1
```

This script will automate:
1. Cloning the LivePortrait repository.
2. Initializing the Python virtual environment (`venv`).
3. Auto-detecting GPU/CUDA and installing the correct PyTorch variant (GPU or CPU).
4. Installing all required libraries.
5. Downloading the pretrained model weights (~750MB) from HuggingFace.
6. Starting the FastAPI server on port `5200`.
