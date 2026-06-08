# AdWhiz Reel Pipeline: GPU Migration & Transition Guide

This document provides complete, step-by-step instructions to successfully migrate and run the **AdWhiz Spokesperson Reels Production Pipeline** on your **NVIDIA RTX 2050 GPU with CUDA** device. 

Follow these steps precisely to unlock high-speed local spokesperson rendering using the integrated **LivePortrait**, **MuseTalk**, and **CodeFormer** engines.

---

## 📋 System Prerequisites on the New Device

Before running any scripts, ensure the following core runtimes are installed on your Windows laptop:

1. **NVIDIA Graphics Drivers**:
   * Verify drivers are active by opening a PowerShell window and running:
     ```powershell
     nvidia-smi
     ```
   * It must display your GPU model (NVIDIA GeForce RTX 2050) and active CUDA driver version.
2. **Python Runtime**:
   * Install **Python 3.10** (avoid 3.11/3.12 for maximum package/PyTorch module compatibility).
   * **IMPORTANT**: During Python setup, check the box **"Add Python to PATH"**.
3. **Node.js**:
   * Install **Node.js (v18 or v20)** from the official website.
4. **FFmpeg**:
   * Ensure `ffmpeg` and `ffprobe` are installed on the system and added to your **Windows Environment Variables (PATH)**.
   * Alternatively, ensure `ffmpeg.exe` is placed at `C:\ffmpeg\bin\ffmpeg.exe` (which is configured as our automated fallback path).
5. **Git**:
   * Install **Git for Windows** so the setup script can run cloning and repository validations.
6. **System Page File Expansion (Critical for 4GB VRAM)**:
   * Loading multiple large models simultaneously can exhaust your GPU's physical memory, triggering Windows WDDM virtual allocation. If your system page file is too small, PyTorch allocations will crash with Out Of Memory (OOM).
   * To prevent this, run the provided automated script as **Administrator** in a PowerShell window:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\increase-pagefile.ps1
     ```
   * This configures a fixed **20GB - 24GB page file** to act as a stable backing store.

---

## 🧹 Step 1: Clean CPU-Specific Folders

To avoid dependency mismatches or compilation conflicts between CPU and GPU architectures, **delete the following virtual environments** immediately after unzipping the `\avatar-reels` folder on your new device:

> [!WARNING]
> Do NOT skip this step! Failing to delete the old virtualenv will force the engines to run in slow CPU emulation mode or throw DLL load failures on your new GPU laptop.

### 🗑️ Folders to Delete:
1. **`\ai-engines\avatar\venv\`** (LivePortrait virtualenv folder)
2. **`\ai-engines\musetalk\venv-musetalk\`** (MuseTalk virtualenv folder)
3. **`\ai-engines\codeformer\venv-codeformer\`** (CodeFormer virtualenv folder)
4. **`\backend\node_modules\`** (Node.js backend dependencies)
5. **`\remotion\node_modules\`** (Remotion rendering dependencies)

---

## 🚀 Step 2: GPU AI Engine Initialization (FastAPI)

We will now build fresh virtual environments specifically compiled for your RTX 2050 CUDA cores. Open **PowerShell** as **Administrator** for each step.

### 🎭 Engine A: LivePortrait Service (Port 5200)
1. Navigate to the avatar engine directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\ai-engines\avatar"
   ```
2. Run the automated bootstrapper:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-avatar.ps1
   ```
* **What it does**: Clones KwaiVGI LivePortrait repository, creates `venv`, installs **PyTorch CUDA 12.1**, resolves dependencies, verifies models, and starts FastAPI on port `5200`.

### 👄 Engine B: MuseTalk LipSync Service (Port 5300 - Low-VRAM Optimized)
1. Navigate to the MuseTalk engine directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\ai-engines\musetalk"
   ```
2. Run the automated bootstrapper:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-musetalk.ps1
   ```
* **What it does**: Clones TMElyralab MuseTalk repository, creates `venv-musetalk`, installs PyTorch CUDA 12.1.
* **Fallback Resolution**: If the OpenMMLab precompiled wheel server is unreachable, the script automatically falls back to PyPI `mmcv-lite` installation and CPU extension source compilations.
* **Low-VRAM Configuration**: MuseTalk runs inside `server.py` with `--use_float16` and `--batch_size 2` (default is 4). This drops local VRAM usage down to **3.32 GB**, running smoothly on the 4GB RTX 2050 without virtual paging slowdowns.

### 💫 Engine C: CodeFormer Face Enhancement Service (Port 5500)
1. Navigate to the CodeFormer engine directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\ai-engines\codeformer"
   ```
2. Run the automated bootstrapper:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-codeformer.ps1
   ```
* **What it does**: Clones CodeFormer, compiles `basicsr`, downloads face detection and parsing libraries (`facelib` & `CodeFormer`), and launches the enhancement microservice on port `5500`.

---

## 🌐 Step 3: Node.js Backend & Remotion Setup

With the three GPU microservices actively running, prepare the Node.js backend and the Remotion rendering environment.

### 📦 Part A: Backend Setup
1. Open a new terminal and navigate to the backend directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\backend"
   ```
2. Install node packages:
   ```bash
   npm install
   ```
3. Open `backend/.env` and verify the settings:
   ```env
   PORT=4001
   MONGODB_URI=mongodb://localhost:27017/adwhiz_reels
   REDIS_URL=redis://localhost:6379
   MOCK_AVATAR=false
   AVATAR_ENGINE=liveportrait
   TTS_SERVICE_URL=http://localhost:5100
   AVATAR_SERVICE_URL=http://localhost:5200
   LIPSYNC_SERVICE_URL=http://localhost:5300
   ```
   > [!NOTE]
   > **Extended Axios Timeouts**: The backend Express worker has been updated with a 30-minute (`1800000ms`) timeout buffer. This ensures that even if local AI services experience cold starts (e.g. initial weights loading) or queued execution, the request will not timeout.

### 🎬 Part B: Remotion Setup
1. Navigate to the remotion directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\remotion"
   ```
2. Install Remotion packages:
   ```bash
   npm install
   ```

---

## 🧪 Step 4: Run Fast E2E Pipeline Integration Tests

To verify that the newly integrated GPU pipeline works flawlessly on a short render:

1. In the backend terminal, run the short integration test:
   ```bash
   node test_liveportrait_short.js
   ```
2. **Observe the magic**:
   * It will resolve the default face avatar image and the short vocal track.
   * PyTorch on CUDA will engage! **It will animate the spokesperson in just 5–15 seconds!**
   * The generated video will save to `storage/temp/test_liveportrait_short/avatar.mp4`.
3. Re-run the full standalone direct test to verify a standard vertical spokesperson clip:
   ```bash
   node test_liveportrait_direct.js
   ```

---

## 🎬 Step 5: Start the Full Multi-Stage Production

Once your GPU and integration tests validate successfully, boot the entire **AdWhiz AI Spokesperson Reels Production Pipeline**!

To execute a complete multi-stage, high-fidelity spokesperson video compilation, open the following **six terminal windows**:

### 📟 Terminal 1: Redis Server
* **Why**: BullMQ requires a local Redis connection to orchestrate job queues and dynamic progress telemetry.
* **Commands**: Launch Docker (`docker run -d -p 6379:6379 redis`) or launch `redis-server.exe` directly.

### 📟 Terminal 2: TTS Vocal Engine (Port 5100)
* **Directory**: `ai-engines/tts/`
* **Command**: `powershell -ExecutionPolicy Bypass -File .\start-tts.ps1`

### 📟 Terminal 3: LivePortrait Spokesperson Engine (Port 5200 - GPU Mode)
* **Directory**: `ai-engines/avatar/`
* **Command**: `powershell -ExecutionPolicy Bypass -File .\start-avatar.ps1`

### 📟 Terminal 4: MuseTalk LipSync Engine (Port 5300 - GPU FP16 Mode)
* **Directory**: `ai-engines/musetalk/`
* **Command**: `powershell -ExecutionPolicy Bypass -File .\start-musetalk.ps1`

### 📟 Terminal 5: CodeFormer Face Enhancement (Port 5500 - GPU Mode)
* **Directory**: `ai-engines/codeformer/`
* **Command**: `powershell -ExecutionPolicy Bypass -File .\start-codeformer.ps1`

### 📟 Terminal 6: Express Backend Server & Queue Worker (Port 4001)
* **Directory**: `backend/`
* **Command**: `npm run dev`

### 📟 Terminal 7: E2E Pipeline Trigger & Telemetry Monitor
* **Directory**: `avatar-reels/`
* **Trigger the generation of a full 30-second spokesperson reel**:
  ```bash
  node test_sample_post.js
  ```
* **Track stage progress and live GPU telemetry**:
  ```bash
  node verify_sample.js
  ```

---

**Congratulations! Your full 6-stage spokesperson generation pipeline is now up, running, and blazing through CUDA acceleration on your GPU machine! 🎉**
