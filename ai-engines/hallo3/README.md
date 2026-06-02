# Hallo3 Local Avatar Service

This is the local avatar animation microservice wrapper for **Hallo3**, running on port `5400`. It provides a high-fidelity **Video Diffusion Transformer** alternative to LivePortrait.

---

## 1. Architecture

Like LivePortrait, the Hallo3 microservice exposes an identical REST interface expected by the AdWhiz Node.js backend:
1. **`GET /health`**: Returns service readiness, GPU availability, and model download status.
2. **`POST /animate`**: Accepts a static portrait image and voice audio, generates a YAML config dynamically, and triggers the Hallo3 diffusion pipeline to generate the finished talking-head video.

---

## 2. Directory Structure

Upon setup, the directory will be structured as follows:
```text
ai-engines/hallo3/
├── hallo3/                  # Cloned official Hallo3 repository
│   └── pretrained_models/   # Downloaded pretrained weights (CogVideoX, T5, etc.)
├── venv/                    # Python virtual environment
├── requirements.txt         # FastAPI service dependencies
├── server.py                # FastAPI microservice wrapper
├── start-hallo.ps1          # PowerShell setup and launcher script
└── README.md                # This documentation
```

---

## 3. Initial Setup

### Step 1: Run the Bootstrapper
Run the PowerShell setup bootstrapper from the `ai-engines/hallo3/` folder:
```powershell
./start-hallo.ps1
```
This script will:
* Clone the Hallo3 repository.
* Create the Python virtual environment (`venv`).
* Auto-detect GPU/CUDA capabilities to install the correct PyTorch package.
* Install all dependencies.

### Step 2: Download Model Checkpoints
Because Hallo3 relies on massive Video Diffusion Transformers (over 10GB+ total weights), download the model weights from HuggingFace.

From the `ai-engines/hallo3/` directory:
```powershell
.\venv\Scripts\Activate.ps1
huggingface-cli download fudan-generative-ai/hallo3 --local-dir hallo3/pretrained_models --local-dir-use-symlinks False
```

---

## 4. Toggling the Engine in AdWhiz

To switch the AdWhiz pipeline from LivePortrait to Hallo3:

1. Open `backend/.env`.
2. Add or update these variables:
   ```env
   AVATAR_ENGINE=hallo
   HALLO_SERVICE_URL=http://localhost:5400
   ```
3. Run the queue workers and start generating reels! The backend will automatically route all avatar generation requests to the Hallo3 microservice on port `5400`.
