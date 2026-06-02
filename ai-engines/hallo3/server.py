import os
import shutil
import subprocess
import uuid
import time
import logging
import glob
import json
import yaml
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("hallo3-server")

# Try to check GPU status
try:
    import torch
    CUDA_AVAILABLE = torch.cuda.is_available()
    DEVICE = "cuda" if CUDA_AVAILABLE else "cpu"
    DEVICE_NAME = torch.cuda.get_device_name(0) if CUDA_AVAILABLE else "CPU Fallback"
    logger.info(f"PyTorch loaded. CUDA Available: {CUDA_AVAILABLE}, Active Device: {DEVICE} ({DEVICE_NAME})")
except ImportError:
    CUDA_AVAILABLE = False
    DEVICE = "cpu"
    DEVICE_NAME = "PyTorch not loaded"

# Path Resolutions
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Venv Python executable path
if os.name == "nt":
    VENV_PYTHON = os.path.join(BASE_DIR, "venv", "Scripts", "python.exe")
else:
    VENV_PYTHON = os.path.join(BASE_DIR, "venv", "bin", "python")

HALLO3_DIR = os.path.join(BASE_DIR, "hallo3")

app = FastAPI(
    title="AdWhiz Hallo3 Avatar Service",
    description="High-fidelity video diffusion transformer spokesperson animation microservice",
    version="1.0.0"
)

def cleanup_directory(path: str):
    """Safely removes temporary files and session folder."""
    time.sleep(2)  # Give time for file handles to release
    try:
        if os.path.exists(path):
            shutil.rmtree(path)
            logger.info(f"Successfully cleaned up temporary session directory: {path}")
    except Exception as e:
        logger.error(f"Error cleaning up directory {path}: {str(e)}")

@app.get("/health")
def health():
    """Reports service health and configuration status."""
    is_cloned = os.path.exists(HALLO3_DIR)
    venv_ready = os.path.exists(VENV_PYTHON)
    
    # Check if pretrained models exist
    models_dir = os.path.join(HALLO3_DIR, "pretrained_models")
    models_exist = os.path.exists(models_dir) and len(os.listdir(models_dir)) > 0 if os.path.exists(models_dir) else False

    return {
        "status": "ok",
        "engine": "Hallo3",
        "device": DEVICE,
        "cuda_available": CUDA_AVAILABLE,
        "models_loaded": models_exist,
        "setup_status": {
            "repository_cloned": is_cloned,
            "pretrained_models_ready": models_exist,
            "virtual_env_ready": venv_ready
        }
    }

@app.post("/animate")
def animate(
    background_tasks: BackgroundTasks,
    source_image: UploadFile = File(...),
    driven_audio: UploadFile = File(...),
    options: Optional[str] = Form(None)
):
    """
    Animates a source image to the given driven speech audio using the Hallo3 Diffusion Transformer.
    """
    start_time = time.time()

    # Prerequisite verification
    if not os.path.exists(HALLO3_DIR):
        raise HTTPException(status_code=503, detail="Hallo3 repository not cloned yet. Run start-hallo.ps1.")
        
    if not os.path.exists(VENV_PYTHON):
        raise HTTPException(status_code=503, detail="Python virtual environment not ready. Run start-hallo.ps1.")

    # Create session directories
    session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    session_dir = os.path.join(TEMP_DIR, session_id)
    inputs_dir = os.path.join(session_dir, "inputs")
    outputs_dir = os.path.join(session_dir, "outputs")
    os.makedirs(inputs_dir, exist_ok=True)
    os.makedirs(outputs_dir, exist_ok=True)

    # Save uploaded files
    source_ext = os.path.splitext(source_image.filename)[1] or ".png"
    audio_ext = os.path.splitext(driven_audio.filename)[1] or ".wav"
    
    source_path = os.path.join(inputs_dir, f"source{source_ext}")
    audio_path = os.path.join(inputs_dir, f"audio{audio_ext}")
    
    with open(source_path, "wb") as f:
        shutil.copyfileobj(source_image.file, f)
        
    with open(audio_path, "wb") as f:
        shutil.copyfileobj(driven_audio.file, f)
        
    logger.info(f"Saved uploads for Hallo3 session {session_id}.")

    # Generate the dynamic config YAML for Hallo3
    config_path = os.path.join(session_dir, "inference_config.yaml")
    
    # Standard template fields expected by scripts/inference_long.py or config
    config_data = {
        "source_image": source_path,
        "driving_audio": audio_path,
        "output_dir": outputs_dir,
        "device": DEVICE,
        "save_video": True,
        # Default stable config flags for Hallo3
        "ref_image_path": source_path,
        "audio_path": audio_path,
        "output_path": os.path.join(outputs_dir, "output.mp4")
    }

    # Parse and merge custom options if provided
    if options:
        try:
            opt_json = json.loads(options)
            config_data.update(opt_json)
            logger.info(f"Applied custom options to config: {opt_json}")
        except Exception as e:
            logger.warning(f"Failed to parse custom options JSON: {str(e)}")

    with open(config_path, "w") as f:
        yaml.dump(config_data, f, default_flow_style=False)

    # Execute Hallo3 inference via subprocess
    logger.info("Executing Hallo3 inference subprocess...")
    
    # We will trigger the main long-inference script from Hallo3
    cmd = [
        VENV_PYTHON, "scripts/inference_long.py",
        "--config", config_path
    ]
    
    logger.info(f"Running command: {' '.join(cmd)} (Working Directory: {HALLO3_DIR})")
    
    try:
        # Execute the python script inside the cloned hallo3 repo directory
        res = subprocess.run(cmd, cwd=HALLO3_DIR, capture_output=True, text=True, check=True)
        logger.info(f"Hallo3 completed successfully.\nInference log output:\n{res.stdout}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Hallo3 inference failed with exit code {e.returncode}.\nStdout: {e.stdout}\nStderr: {e.stderr}")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail=f"Hallo3 inference failed: {e.stderr or e.stdout}")

    # Find the synthesized MP4 file in the outputs directory
    output_mp4s = glob.glob(os.path.join(outputs_dir, "**", "*.mp4"), recursive=True)
    if not output_mp4s:
        logger.error("No output MP4 video found in outputs folder after execution.")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail="Hallo3 completed but failed to write final MP4 video.")

    final_video_path = output_mp4s[0]
    logger.info(f"Found animated video at {final_video_path}. Total execution time: {time.time() - start_time:.2f}s")

    # Schedule clean up in background after file response is sent
    background_tasks.add_task(cleanup_directory, session_dir)
    
    return FileResponse(final_video_path, media_type="video/mp4", filename="avatar.mp4")

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Hallo3 FastAPI Server on port 5400...")
    uvicorn.run(app, host="0.0.0.0", port=5400)
