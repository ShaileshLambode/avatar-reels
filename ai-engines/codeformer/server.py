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

    # Locate Python in virtual environment
    venv_python = str(CODEFORMER_ROOT / "venv-codeformer" / "Scripts" / "python.exe")
    if not os.path.exists(venv_python):
        venv_python = "python"

    cmd = [
        venv_python, "inference_codeformer.py",
        "-w", str(fidelity_weight),
        "--input_path", str(input_path),
        "--output_path", str(output_dir),
    ]
    if face_upsample:
        cmd.append("--face_upsample")

    print(f"Running CodeFormer CLI command: {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=str(CODEFORMER_ROOT),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"CodeFormer failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
        )

    # CodeFormer saves the result in output_dir / <video_name>.mp4
    # The input file name is "lipsynced.mp4", so video_name is "lipsynced"
    final_video_path = output_dir / "lipsynced.mp4"
    if not final_video_path.exists():
        # Fallback check for any mp4 output
        final_results = list(output_dir.rglob("*.mp4"))
        if not final_results:
            raise HTTPException(status_code=500, detail=f"CodeFormer produced no output video. STDOUT: {result.stdout}")
        final_video_path = final_results[0]

    return FileResponse(
        str(final_video_path),
        media_type="video/mp4",
        filename="enhanced.mp4",
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5500)
