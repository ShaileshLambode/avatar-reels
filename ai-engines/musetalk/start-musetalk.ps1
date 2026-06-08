# MuseTalk Microservice Bootstrapper
$ErrorActionPreference = "Stop"
$ScriptName = $MyInvocation.MyCommand.Name
$env:PYTHONIOENCODING="utf-8"
$env:HF_ENDPOINT = "https://hf-mirror.com"


Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     AdWhiz MuseTalk Local Setup          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Clone MuseTalk repository files if not present
if (-not (Test-Path "musetalk")) {
    Write-Host "[1/6] Cloning MuseTalk repository files..." -ForegroundColor Yellow
    git init
    git remote add origin https://github.com/TMElyralab/MuseTalk.git
    git fetch origin main --depth=1
    git checkout -f origin/main
    Write-Host "Cloning complete." -ForegroundColor Green
} else {
    Write-Host "[1/6] MuseTalk repository files already present." -ForegroundColor Green
}

# 2. Check for CUDA / NVIDIA GPU capability
Write-Host "[2/6] Detecting GPU/CUDA capabilities..." -ForegroundColor Yellow
$HasCuda = $false
try {
    $null = Get-Command nvidia-smi -ErrorAction Stop
    $HasCuda = $true
    Write-Host "NVIDIA GPU with CUDA drivers detected." -ForegroundColor Green
} catch {
    Write-Host "No NVIDIA GPU/CUDA drivers found. Using CPU fallback mode." -ForegroundColor Gray
}

# 3. Initialize Python Virtual Environment (Venv)
if (-not (Test-Path "venv-musetalk")) {
    Write-Host "[3/6] Creating Python virtual environment (venv-musetalk)..." -ForegroundColor Yellow
    python -m venv venv-musetalk
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create Python virtual environment. Please check your Python installation (Python 3.10 recommended)."
    }
    Write-Host "Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "[3/6] Python virtual environment already exists." -ForegroundColor Green
}

# 4. Activate Venv and Upgrade Pip
Write-Host "[4/6] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv-musetalk\Scripts\Activate.ps1"
python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to upgrade pip. Proceeding with existing pip."
}

# 5. Install PyTorch and Dependencies
Write-Host "[5/6] Installing dependencies (this may take several minutes)..." -ForegroundColor Yellow

# Pre-install wheel and numpy<2 to avoid NumPy 2.x compatibility issues with older PyTorch and MMCV
python -m pip install wheel "numpy<2"

# Use torch 2.1.0 to align with OpenMMLab precompiled wheels
if ($HasCuda) {
    Write-Host "Installing GPU-enabled PyTorch (CUDA 12.1)..." -ForegroundColor Cyan
    python -m pip install torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu121
} else {
    Write-Host "Installing CPU-only PyTorch..." -ForegroundColor Cyan
    python -m pip install torch==2.1.0 torchvision==0.16.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cpu
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install PyTorch."
}

# Install OpenMIM, mmengine, mmcv, mmdet, mmpose
Write-Host "Installing OpenMMLab packages..." -ForegroundColor Cyan
python -m pip install openmim
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install openmim."
}

# Constrain numpy<2 during mmengine install to prevent pip upgrading it
python -m mim install mmengine "numpy<2"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install mmengine."
}

# Install MMCV. First try precompiled lite from PyPI, then mim, then pip wheels, and finally source compilation fallback.
python -m pip install setuptools wheel
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to pre-install setuptools."
}

Write-Host "Installing mmcv==2.1.0..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"

# Uninstall any broken mmcv package fragments first
python -m pip uninstall -y mmcv mmcv-lite

# Step A: Try direct PyPI installation of mmcv-lite (downloads precompiled lite wheel, no compiler or OpenMMLab server required)
Write-Host "Step A: Attempting mmcv-lite==2.1.0 installation from PyPI..." -ForegroundColor Yellow
python -m pip install mmcv-lite==2.1.0
$PyPiStatus = $LASTEXITCODE

if ($PyPiStatus -ne 0) {
    Write-Host "PyPI install failed. Step B: Attempting mmcv installation via mim..." -ForegroundColor Yellow
    # Step B: Try mim installation (official OpenMMLab manager)
    python -m mim install "mmcv==2.1.0"
    $MimStatus = $LASTEXITCODE

    if ($MimStatus -ne 0) {
        Write-Host "mim install failed. Step C: Attempting direct pip installation from OpenMMLab wheels repository..." -ForegroundColor Yellow
        # Step C: Direct pip wheel repository download
        if ($HasCuda) {
            python -m pip install mmcv==2.1.0 -f https://download.openmmlab.com/mmcv/dist/cu121/torch2.1.0/index.html
        } else {
            python -m pip install mmcv==2.1.0 -f https://download.openmmlab.com/mmcv/dist/cpu/torch2.1.0/index.html
        }
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Precompiled wheel server unreachable. Step D: Building MMCV from source (CPU extensions only to bypass CUDA_HOME requirements)..." -ForegroundColor Yellow
            # Step D: Compiling MMCV from source without CUDA ops to bypass CUDA Toolkit requirements
            $env:MMCV_WITH_OPS = "0"
            python -m pip install mmcv-lite==2.1.0 --no-build-isolation
            if ($LASTEXITCODE -ne 0) {
                $ErrorActionPreference = "Stop"
                Write-Error "Failed to install mmcv/mmcv-lite via PyPI, mim, direct wheel, or source compilation."
            }
        }
    }
}

# Post-MMCV: Enforce NumPy 1.x compatibility check immediately to fix any dependency resolution creep
Write-Host "Enforcing NumPy compatibility post-MMCV install..." -ForegroundColor Cyan
python -m pip install "numpy<2"
$ErrorActionPreference = "Stop"

# Pre-install wheel, scipy, and chumpy (without build isolation) to bypass Windows/pip compilation errors
Write-Host "Pre-installing wheel, scipy, and chumpy..." -ForegroundColor Cyan
python -m pip install wheel scipy
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install wheel or scipy."
}

python -m pip install chumpy --no-build-isolation
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install chumpy."
}

# Install mmdet and mmpose
python -m pip install mmdet==3.3.0 mmpose==1.3.2
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install mmdet or mmpose."
}

# Install requirements
python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install requirements.txt."
}

# Install FastAPI server dependencies
python -m pip install fastapi uvicorn python-multipart
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install FastAPI requirements."
}

# Enforce NumPy 1.x and opencv-python compatibility to prevent implicit upgrades during setup
Write-Host "Verifying and enforcing NumPy 1.x and opencv-python compatibility..." -ForegroundColor Cyan
python -m pip install "numpy<2" "opencv-python<4.9"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to enforce package compatibility configurations."
}

Write-Host "All Python packages installed successfully." -ForegroundColor Green

# 6. Download Model Weights
Write-Host "[6/6] Downloading MuseTalk model weights..." -ForegroundColor Yellow
python download_models.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to download model weights."
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Setup complete! Starting MuseTalk      " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

$env:FFMPEG_PATH = "C:\ffmpeg\bin"
$env:PATH = "C:\ffmpeg\bin;" + $env:PATH

python server.py
