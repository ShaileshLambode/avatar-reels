import os
import shutil
import subprocess
import uuid
import time
import logging
import glob
import json
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("liveportrait-server")

# Try to import torch to report CUDA status
try:
    import torch
    CUDA_AVAILABLE = torch.cuda.is_available()
    DEVICE = "cuda" if CUDA_AVAILABLE else "cpu"
    DEVICE_NAME = torch.cuda.get_device_name(0) if CUDA_AVAILABLE else "CPU Fallback"
    logger.info(f"PyTorch loaded. CUDA Available: {CUDA_AVAILABLE}, Active Device: {DEVICE} ({DEVICE_NAME})")
except ImportError:
    CUDA_AVAILABLE = False
    DEVICE = "cpu"
    DEVICE_NAME = "PyTorch not installed yet"
    logger.warning("PyTorch could not be imported during server initialization. It will be installed in the virtual environment.")

# Path Resolutions
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# Venv Python executable path
if os.name == "nt":
    VENV_PYTHON = os.path.join(BASE_DIR, "venv", "Scripts", "python.exe")
else:
    VENV_PYTHON = os.path.join(BASE_DIR, "venv", "bin", "python")

LIVEPORTRAIT_DIR = os.path.join(BASE_DIR, "LivePortrait")
INFERENCE_SCRIPT = os.path.join(LIVEPORTRAIT_DIR, "inference.py")

app = FastAPI(
    title="AdWhiz LivePortrait Avatar Service",
    description="High-quality portrait animation microservice replacing SadTalker",
    version="1.0.0"
)

def cleanup_directory(path: str):
    """Safely removes a directory after a short delay to ensure file handles are released."""
    time.sleep(2)  # Give time for response sending and file lock release
    try:
        if os.path.exists(path):
            shutil.rmtree(path)
            logger.info(f"Successfully cleaned up temporary session directory: {path}")
    except Exception as e:
        logger.error(f"Error cleaning up temporary directory {path}: {str(e)}")

@app.get("/health")
def health():
    """Reports service health and active execution hardware."""
    # Check if LivePortrait is installed
    is_cloned = os.path.exists(LIVEPORTRAIT_DIR)
    
    # Check if models exist
    models_dir = os.path.join(LIVEPORTRAIT_DIR, "pretrained_weights")
    models_exist = os.path.exists(models_dir) and len(os.listdir(models_dir)) > 0 if os.path.exists(models_dir) else False
    
    # Check if venv python exists
    venv_ready = os.path.exists(VENV_PYTHON)
    
    # Re-evaluate torch cuda at runtime if imported
    runtime_cuda = False
    runtime_device = "cpu"
    try:
        import torch
        runtime_cuda = torch.cuda.is_available()
        runtime_device = "cuda" if runtime_cuda else "cpu"
    except ImportError:
        pass

    return {
        "status": "ok",
        "engine": "LivePortrait",
        "device": runtime_device,
        "cuda_available": runtime_cuda,
        "models_loaded": models_exist,
        "setup_status": {
            "repository_cloned": is_cloned,
            "models_downloaded": models_exist,
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
    Animates a source portrait image using a looped driving video created from input audio.
    """
    start_time = time.time()
    
    # Check prerequisites
    if not os.path.exists(LIVEPORTRAIT_DIR):
        raise HTTPException(status_code=503, detail="LivePortrait engine repository not cloned yet. Run start-avatar.ps1.")
        
    if not os.path.exists(VENV_PYTHON):
        raise HTTPException(status_code=503, detail="Python virtual environment not ready. Run start-avatar.ps1.")

    # Create unique session directory
    session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    session_dir = os.path.join(TEMP_DIR, session_id)
    inputs_dir = os.path.join(session_dir, "inputs")
    outputs_dir = os.path.join(session_dir, "outputs")
    
    os.makedirs(inputs_dir, exist_ok=True)
    os.makedirs(outputs_dir, exist_ok=True)
    
    # Parse options if provided
    relative_motion = True
    driving_video_name = "d0.mp4"
    if options:
        try:
            opt_json = json.loads(options)
            relative_motion = opt_json.get("relative_motion_mode", True)
            driving_video_name = opt_json.get("driving_video", "d0.mp4")
            logger.info(f"Received animation options: {opt_json}")
        except Exception as e:
            logger.warning(f"Failed to parse options JSON: {str(e)}")

    # Save uploaded files
    source_ext = os.path.splitext(source_image.filename)[1] or ".png"
    audio_ext = os.path.splitext(driven_audio.filename)[1] or ".mp3"
    
    source_path = os.path.join(inputs_dir, f"source{source_ext}")
    audio_path = os.path.join(inputs_dir, f"audio{audio_ext}")
    
    with open(source_path, "wb") as f:
        shutil.copyfileobj(source_image.file, f)
        
    with open(audio_path, "wb") as f:
        shutil.copyfileobj(driven_audio.file, f)
        
    logger.info(f"Saved uploads to session {session_id}. Source: {source_path}, Audio: {audio_path}")

    # Stage A: Generate driving video by looping a dynamic talking template overlaid with audio
    driving_video_path = os.path.join(inputs_dir, "driving.mp4")
    
    # Resolve the template driving video
    d0_path = os.path.join(LIVEPORTRAIT_DIR, "assets", "examples", "driving", driving_video_name)
    if not os.path.exists(d0_path):
        logger.warning(f"Requested template {driving_video_name} not found. Falling back to default d0.mp4.")
        d0_path = os.path.join(LIVEPORTRAIT_DIR, "assets", "examples", "driving", "d0.mp4")
        
    logger.info(f"Stage A: Generating looped driving video from template {d0_path} via FFmpeg...")
    
    # We loop the template video indefinitely and map our custom speech audio, ending exactly when the audio ends
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-stream_loop", "-1", "-i", d0_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-map", "0:v:0",
        "-map", "1:a:0",
        driving_video_path
    ]
    
    try:
        res = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, check=True)
        logger.info("FFmpeg driving video completed successfully.")
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed with exit code {e.returncode}.\nStdout: {e.stdout}\nStderr: {e.stderr}")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail=f"Failed to generate driving video: {e.stderr}")

    # Stage B: Run LivePortrait inference via subprocess using venv python
    logger.info("Stage B: Starting LivePortrait animation inference...")
    
    # Prepare inference command
    # LivePortrait expects relative pathing or absolute pathing. We run it with cwd=LIVEPORTRAIT_DIR for safety.
    cmd = [
        VENV_PYTHON, "inference.py",
        "-s", source_path,
        "-d", driving_video_path,
        "--output_dir", outputs_dir
    ]
    
    # Check CUDA availability at runtime to conditionally force CPU inference
    try:
        import torch
        if not torch.cuda.is_available():
            logger.info("CUDA not available in PyTorch, appending --flag_force_cpu option.")
            cmd.append("--flag_force_cpu")
    except Exception as e:
        logger.warning(f"Could not import torch or check CUDA inside animate request: {str(e)}. Defaulting to CPU fallback.")
        cmd.append("--flag_force_cpu")
    
    # Append relative motion mode flag if specified (default is True in LivePortrait, 
    # but we can explicitly pass flags if supported in current repo structure)
    # The default KwaiVGI repo has --no_relative flag to disable it. Let's stick to standard parameters.
    
    logger.info(f"Running command: {' '.join(cmd)} in working directory: {LIVEPORTRAIT_DIR}")
    
    try:
        # Run inference script in the LivePortrait directory
        res = subprocess.run(cmd, cwd=LIVEPORTRAIT_DIR, capture_output=True, text=True, check=True)
        logger.info(f"LivePortrait completed successfully.\nInference log output:\n{res.stdout}")
    except subprocess.CalledProcessError as e:
        logger.error(f"LivePortrait inference failed with exit code {e.returncode}.\nStdout: {e.stdout}\nStderr: {e.stderr}")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail=f"LivePortrait inference error: {e.stderr}")

    # Find generated MP4 in the output folder
    # LivePortrait saves to a dynamic path or subdirectory under output_dir. Let's find any mp4 recursively.
    output_mp4s = glob.glob(os.path.join(outputs_dir, "**", "*.mp4"), recursive=True)
    if not output_mp4s:
        logger.error(f"No output MP4 video found in {outputs_dir} after successful execution.")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail="LivePortrait completed but failed to write final MP4 video.")

    final_video_path = output_mp4s[0]
    logger.info(f"Found animated video at {final_video_path}. Total execution time: {time.time() - start_time:.2f}s")
    
    # Schedule session cleanup in background after file is sent
    background_tasks.add_task(cleanup_directory, session_dir)
    
    return FileResponse(final_video_path, media_type="video/mp4", filename="avatar.mp4")

@app.post("/neutralize")
def neutralize(
    background_tasks: BackgroundTasks,
    portrait: UploadFile = File(...),
    duration_seconds: float = Form(3.0)
):
    """
    Takes a portrait image and generates a neutral-expression (mouth closed) aligned video loop.
    It loops the static portrait itself as the driving video with --flag_normalize_lip enabled.
    """
    start_time = time.time()
    
    # Check prerequisites
    if not os.path.exists(LIVEPORTRAIT_DIR):
        raise HTTPException(status_code=503, detail="LivePortrait engine repository not cloned yet.")
        
    if not os.path.exists(VENV_PYTHON):
        raise HTTPException(status_code=503, detail="Python virtual environment not ready.")

    # Create unique session directory
    session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    session_dir = os.path.join(TEMP_DIR, session_id)
    inputs_dir = os.path.join(session_dir, "inputs")
    outputs_dir = os.path.join(session_dir, "outputs")
    
    os.makedirs(inputs_dir, exist_ok=True)
    os.makedirs(outputs_dir, exist_ok=True)

    # Save uploaded portrait image
    portrait_ext = os.path.splitext(portrait.filename)[1] or ".png"
    portrait_path = os.path.join(inputs_dir, f"portrait{portrait_ext}")
    
    with open(portrait_path, "wb") as f:
        shutil.copyfileobj(portrait.file, f)
        
    logger.info(f"Saved upload to session {session_id}. Portrait: {portrait_path}")

    # Generate a static 3-second driving video from the portrait itself
    driving_video_path = os.path.join(inputs_dir, "driving.mp4")
    logger.info("Generating static driving video from portrait via FFmpeg...")
    
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", portrait_path,
        "-t", str(duration_seconds),
        "-r", "25",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        driving_video_path
    ]
    
    try:
        subprocess.run(ffmpeg_cmd, capture_output=True, text=True, check=True)
        logger.info("FFmpeg static driving video completed successfully.")
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed with exit code {e.returncode}.\nStdout: {e.stdout}\nStderr: {e.stderr}")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail=f"Failed to generate static driving video: {e.stderr}")

    # Run LivePortrait with normalization
    logger.info("Running LivePortrait neutralization inference...")
    cmd = [
        VENV_PYTHON, "inference.py",
        "-s", portrait_path,
        "-d", driving_video_path,
        "--output_dir", outputs_dir,
        "--flag_normalize_lip"  # Force lips/mouth close
    ]
    
    # Check CUDA availability at runtime to conditionally force CPU inference
    try:
        import torch
        if not torch.cuda.is_available():
            logger.info("CUDA not available in PyTorch, appending --flag_force_cpu option.")
            cmd.append("--flag_force_cpu")
    except Exception as e:
        logger.warning(f"Could not import torch or check CUDA inside neutralize request: {str(e)}. Defaulting to CPU fallback.")
        cmd.append("--flag_force_cpu")
        
    logger.info(f"Running command: {' '.join(cmd)} in working directory: {LIVEPORTRAIT_DIR}")
    
    try:
        res = subprocess.run(cmd, cwd=LIVEPORTRAIT_DIR, capture_output=True, text=True, check=True)
        logger.info(f"LivePortrait neutralize completed successfully.\nInference log output:\n{res.stdout}")
    except subprocess.CalledProcessError as e:
        logger.error(f"LivePortrait neutralize inference failed with exit code {e.returncode}.\nStdout: {e.stdout}\nStderr: {e.stderr}")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail=f"LivePortrait neutralize inference error: {e.stderr}")

    # Find generated MP4 in the output folder
    output_mp4s = glob.glob(os.path.join(outputs_dir, "**", "*.mp4"), recursive=True)
    if not output_mp4s:
        logger.error(f"No output MP4 video found in {outputs_dir} after successful neutralize execution.")
        shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail="LivePortrait completed but failed to write final MP4 video.")

    final_video_path = output_mp4s[0]
    logger.info(f"Found neutralized video at {final_video_path}. Total execution time: {time.time() - start_time:.2f}s")
    
    # Schedule session cleanup in background after file is sent
    background_tasks.add_task(cleanup_directory, session_dir)
    
    return FileResponse(final_video_path, media_type="video/mp4", filename="neutral_avatar.mp4")

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting LivePortrait FastAPI Server on port 5200...")
    uvicorn.run(app, host="0.0.0.0", port=5200)
