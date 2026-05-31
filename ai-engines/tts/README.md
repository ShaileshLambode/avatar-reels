# XTTS v2 TTS Microservice Setup

This is a Python-based FastAPI microservice hosting the XTTS v2 multi-speaker voice synthesis model. It is designed to run locally on your CPU on port 5100.

## Prerequisites
- Python 3.9, 3.10, or 3.11 (Python 3.10 is recommended)
- `ffmpeg` installed on your system.

## Setup Instructions (Windows)

1. **Open a terminal in this folder** (`avatar-reels/ai-engines/tts/`).
2. **Create a virtual environment**:
   ```powershell
   python -m venv venv
   ```
3. **Activate the virtual environment**:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```
4. **Install PyTorch CPU explicitly first** (this prevents downloading the multi-gigabyte CUDA package):
   ```powershell
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
   ```
5. **Install requirements**:
   ```powershell
   pip install -r requirements.txt
   ```
6. **Start the server**:
   ```powershell
   uvicorn server:app --host 0.0.0.0 --port 5100 --reload
   ```

*Note: The first time the server processes a synthesis request, it will download the XTTS v2 model weight files automatically (~2.5GB). Subsequent startups and synthesis calls will be much faster (~20s startup loading time).*

## API endpoints
- `GET /health` - Check model status
- `GET /voices` - List built-in presets and custom voices
- `POST /synthesize` - Synthesize WAV audio from text
