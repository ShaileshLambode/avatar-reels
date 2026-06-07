# CodeFormer Microservice Bootstrapper
$ErrorActionPreference = "Stop"
$ScriptName = $MyInvocation.MyCommand.Name
$env:PYTHONIOENCODING="utf-8"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     AdWhiz CodeFormer Local Setup        " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Clone CodeFormer repository files if not present
if (-not (Test-Path "basicsr")) {
    Write-Host "[1/6] Cloning CodeFormer repository files..." -ForegroundColor Yellow
    git init
    git remote add origin https://github.com/sczhou/CodeFormer.git
    git fetch origin master --depth=1
    git checkout -f origin/master
    Write-Host "Cloning complete." -ForegroundColor Green
} else {
    Write-Host "[1/6] CodeFormer repository files already present." -ForegroundColor Green
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
if (-not (Test-Path "venv-codeformer")) {
    Write-Host "[3/6] Creating Python virtual environment (venv-codeformer)..." -ForegroundColor Yellow
    python -m venv venv-codeformer
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create Python virtual environment. Please check your Python installation (Python 3.10 recommended)."
    }
    Write-Host "Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "[3/6] Python virtual environment already exists." -ForegroundColor Green
}

# 4. Activate Venv and Upgrade Pip
Write-Host "[4/6] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv-codeformer\Scripts\Activate.ps1"
python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to upgrade pip. Proceeding with existing pip."
}

# 5. Install PyTorch and Dependencies
Write-Host "[5/6] Installing dependencies (this may take several minutes)..." -ForegroundColor Yellow

# Pre-install wheel and numpy<2 to avoid NumPy 2.x compatibility issues
python -m pip install wheel "numpy<2"

if ($HasCuda) {
    Write-Host "Installing GPU-enabled PyTorch (CUDA 12.1)..." -ForegroundColor Cyan
    python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
} else {
    Write-Host "Installing CPU-only PyTorch..." -ForegroundColor Cyan
    python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install PyTorch."
}

# Install requirements
python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install requirements.txt."
}

# Enforce NumPy 1.x and opencv-python compatibility before building basicsr
Write-Host "Enforcing NumPy 1.x and opencv-python compatibility for compilation..." -ForegroundColor Cyan
python -m pip install "numpy<2" "opencv-python<4.9"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install compatibility requirements."
}

# Setup BasicSR
Write-Host "Setting up BasicSR..." -ForegroundColor Cyan
python basicsr/setup.py develop
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to set up BasicSR."
}

# Install FastAPI server dependencies
python -m pip install fastapi uvicorn python-multipart
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install FastAPI requirements."
}

# Double check and enforce package compatibility configurations post-installation
Write-Host "Verifying and enforcing NumPy 1.x and opencv-python compatibility..." -ForegroundColor Cyan
python -m pip install "numpy<2" "opencv-python<4.9"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to enforce package compatibility configurations."
}

Write-Host "All Python packages installed successfully." -ForegroundColor Green

# 6. Download Model Weights
Write-Host "[6/6] Downloading CodeFormer model weights..." -ForegroundColor Yellow
python scripts/download_pretrained_models.py facelib
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to download face detection and parsing libraries (facelib)."
}
python scripts/download_pretrained_models.py CodeFormer
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to download CodeFormer model weights."
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Setup complete! Starting CodeFormer    " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

python server.py
