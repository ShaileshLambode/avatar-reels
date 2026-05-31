# AdWhiz Reel Pipeline: GPU Migration & Transition Guide

This document provides complete, step-by-step instructions to successfully migrate the **AdWhiz Spokesperson Reels Production Pipeline** from your CPU-only environment to your new **NVIDIA RTX 2050 GPU with CUDA** device. 

Follow these steps precisely to unlock lightning-fast spokesperson rendering using the newly integrated **LivePortrait** local engine.

---

## 📋 System Prerequisites on the New Device

Before running any scripts, ensure the following core runtimes are installed on your new Windows laptop:

1. **NVIDIA Graphics Drivers**:
   * Verify drivers are active by opening a PowerShell window and running:
     ```powershell
     nvidia-smi
     ```
   * It should display your GPU model (NVIDIA GeForce RTX 2050) and active CUDA driver version.
2. **Python Runtime**:
   * Install **Python 3.9 or 3.10** (avoid 3.11/3.12 for maximum ONNX/PyTorch module compatibility).
   * **IMPORTANT**: During Python setup, make sure to check the box **"Add Python to PATH"**.
3. **Node.js**:
   * Install **Node.js (v18 or v20)** from the official website.
4. **FFmpeg**:
   * Ensure `ffmpeg` and `ffprobe` are installed on the system and added to your **Windows Environment Variables (PATH)**.
   * Alternatively, ensure `ffmpeg.exe` is placed at `C:\ffmpeg\bin\ffmpeg.exe` (which is configured as our automated fallback path).
5. **Git**:
   * Install **Git for Windows** so the setup script can run cloning and repository validations.

---

## 🧹 Step 1: Clean CPU-Specific Folders

To avoid dependency mismatches or compilation conflicts between CPU and GPU architectures, **delete the following folders** immediately after unzipping the `\avatar-reels` folder on your new device:

> [!WARNING]
> Do NOT skip this step! Failing to delete the old virtualenv will force the engine to run in slow CPU emulation mode on your new GPU laptop.

### 🗑️ Folders to Delete:
1. **`\ai-engines\avatar\venv\`** (The entire virtualenv folder).
   * *Why*: Contains CPU-only wheels of PyTorch, which are binary-compiled and cannot detect your RTX GPU.
2. **`\ai-engines\avatar\temp\`** (The entire temporary sessions folder, if present).
   * *Why*: Cleans up old audio/video generation sessions from CPU debugging.
3. **`\backend\node_modules\`** (Optional but highly recommended).
   * *Why*: Prevents native Node.js binary compilation issues between different Windows environments.
4. **`\remotion\node_modules\`** (Optional but highly recommended).
   * *Why*: Prevents Remotion compilation mismatches.

---

## 🚀 Step 2: GPU AI Engine Initialization (FastAPI)

We will now build a fresh virtual environment specifically compiled for your RTX 2050 CUDA cores.

1. Open **PowerShell** as **Administrator**.
2. Navigate to your avatar engine directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\ai-engines\avatar"
   ```
3. Run the automated bootstrapper:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\start-avatar.ps1
   ```

### 🔍 What `start-avatar.ps1` Will Automatically Do:
* **CUDA Detection**: Uses `nvidia-smi` to verify your RTX 2050 is ready.
* **Fresh Venv**: Creates a brand new Python virtual environment.
* **CUDA PyTorch Setup**: Auto-installs **PyTorch with CUDA 12.1 acceleration** directly from the PyTorch repository.
* **Requirements Installation**: Auto-installs all required dependencies (handling OpenCV conflict resolutions cleanly).
* **Model Check**: Confirms your `pretrained_weights/` are present and ready (no heavy redownloading needed!).
* **Boot FastAPI**: Starts the FastAPI microservice on `http://localhost:5200` in **full GPU Acceleration Mode**.

---

## 🌐 Step 3: Node.js Backend & Remotion Setup

With the GPU microservice actively running in one terminal, we will now prepare the Node.js backend and the Remotion rendering environment.

### 📦 Part A: Backend Setup
1. Open a **second terminal** and navigate to the backend directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\backend"
   ```
2. Reinstall backend node packages:
   ```bash
   npm install
   ```
3. Open `backend/.env` and ensure **mock mode is disabled** so real AI generation runs:
   ```env
   MOCK_AVATAR=false
   ```

### 🎬 Part B: Remotion Setup
1. In the same terminal (or a new one), navigate to the remotion directory:
   ```powershell
   cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\remotion"
   ```
2. Reinstall remotion node packages:
   ```bash
   npm install
   ```

---

## 🧪 Step 4: Run Fast E2E Pipeline Integration Tests

To make sure the new GPU pipeline works flawlessly without long CPU rendering wait times, I've compiled a **3-second short integration test** (`test_liveportrait_short.js`). 

This runs the exact E2E spokesperson generation pipeline (Stage A driving video loop + Stage B LivePortrait CUDA inference) on a 3-second audio track.

1. In the backend terminal, run the short integration test:
   ```bash
   node test_liveportrait_short.js
   ```
2. **Observe the magic**:
   * The terminal will print: `[PROGRESS 5%] [Avatar] Checking LivePortrait service health...`
   * It will resolve the default face avatar image and the short vocal track.
   * PyTorch on CUDA will engage! **It will animate the spokesperson in just 5–15 seconds!**
   * The generated video will save to `storage/temp/test_liveportrait_short/avatar.mp4`.
3. Re-run the full standalone direct test to verify a standard vertical spokesperson clip:
   ```bash
   node test_liveportrait_direct.js
   ```

---

## 🎬 Step 5: Start the Full Multi-Stage Production

Once your GPU and integration tests validate successfully, you are officially ready to boot the entire **AdWhiz AI Spokesperson Reels Production Pipeline**!

To execute a complete multi-stage, high-fidelity spokesperson video compilation, open the following five terminal windows:

### 📟 Terminal 1: Redis Server
* **Why**: BullMQ requires a local Redis connection to orchestrate job queues and dynamic progress telemetry.
* **Commands**:
  * *Option A (Docker)*: 
    ```bash
    docker run -d -p 6379:6379 redis
    ```
  * *Option B (Windows Native)*: Launch `redis-server.exe` directly on your host machine.

### 📟 Terminal 2: TTS Vocal Engine (Port 5100)
* **Why**: Generates the high-fidelity spokesperson voice audio tracks for Stage 2 of the pipeline.
* **Directory**:
  ```powershell
  cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\ai-engines\tts"
  ```
* **Command**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\start-tts.ps1
  ```

### 📟 Terminal 3: LivePortrait Spokesperson Engine (Port 5200 - GPU Mode)
* **Why**: Animates the spokesperson face driven by audio using PyTorch CUDA acceleration.
* **Directory**:
  ```powershell
  cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\ai-engines\avatar"
  ```
* **Command**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\start-avatar.ps1
  ```

### 📟 Terminal 4: AdWhiz Express Backend Server & Queue Worker (Port 4001)
* **Why**: Hosts the REST API endpoint, connects MongoDB, and initializes the BullMQ `reel-pipeline` background queue processor.
* **Directory**:
  ```powershell
  cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels\backend"
  ```
* **Command**:
  ```bash
  npm run dev
  ```

### 📟 Terminal 5: E2E Pipeline Trigger & Telemetry Monitor
* **Why**: Used to post real production payloads and track database/rendering progress in real time.
* **Directory**:
  ```powershell
  cd "c:\Users\lmn21\Work\AIMAVEN\Projects\31-May\avatar-reels"
  ```
* **Step A: Trigger the generation of a full 30-second spokesperson reel**:
  ```bash
  node test_sample_post.js
  ```
* **Step B: Actively track stage progress and live GPU telemetry**:
  ```bash
  node verify_sample.js
  ```

---

**Congratulations! Your full spool spokesperson generation pipeline is now up, running, and blazing through CUDA acceleration on your new GPU machine! 🎉**
