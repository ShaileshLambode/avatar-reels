# LivePortrait Microservice Bootstrapper
# Sets up venv, auto-detects CUDA/CPU, clones repo, downloads models, and starts FastAPI.

$ErrorActionPreference = "Stop"
$ScriptName = $MyInvocation.MyCommand.Name
$env:PYTHONIOENCODING="utf-8"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   AdWhiz LivePortrait Local Setup        " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Clone LivePortrait Repository if not present
if (-not (Test-Path "LivePortrait")) {
    Write-Host "[1/6] Cloning LivePortrait repository from GitHub..." -ForegroundColor Yellow
    git clone https://github.com/KlingAIResearch/LivePortrait.git LivePortrait
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to clone LivePortrait repository. Please ensure git is installed and you have internet access."
    }
    Write-Host "Cloning complete." -ForegroundColor Green
} else {
    Write-Host "[1/6] LivePortrait repository already cloned." -ForegroundColor Green
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
if (-not (Test-Path "venv")) {
    Write-Host "[3/6] Creating Python virtual environment (venv)..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create Python virtual environment. Please check your Python installation (Python 3.9 or 3.10 recommended)."
    }
    Write-Host "Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "[3/6] Python virtual environment already exists." -ForegroundColor Green
}

# 4. Activate Venv and Upgrade Pip
Write-Host "[4/6] Activating virtual environment and upgrading pip..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to upgrade pip. Proceeding with existing pip."
}

# 5. Install PyTorch and Dependencies
Write-Host "[5/6] Installing dependencies (this may take several minutes)..." -ForegroundColor Yellow

if ($HasCuda) {
    Write-Host "Installing GPU-enabled PyTorch (CUDA 12.1)..." -ForegroundColor Cyan
    python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
} else {
    Write-Host "Installing CPU-only PyTorch..." -ForegroundColor Cyan
    python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install PyTorch. Environment setup aborted."
}

# Install FastAPI wrapper requirements
Write-Host "Installing FastAPI server requirements..." -ForegroundColor Cyan
python -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install FastAPI requirements."
}

# Install official LivePortrait requirements
Write-Host "Installing official LivePortrait requirements..." -ForegroundColor Cyan
python -m pip install -r LivePortrait/requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install LivePortrait requirements."
}

Write-Host "All Python packages installed successfully." -ForegroundColor Green

# 6. Download Model Weights
Write-Host "[6/6] Downloading LivePortrait pretrained weights (~750MB)..." -ForegroundColor Yellow
$WeightsDir = "LivePortrait/pretrained_weights"
$WeightsExist = $false

if (Test-Path $WeightsDir) {
    $Subdirs = Get-ChildItem $WeightsDir -Directory -ErrorAction SilentlyContinue
    if ($Subdirs.Count -gt 0) {
        $WeightsExist = $true
    }
}

if (-not $WeightsExist) {
    Write-Host "Downloading weights from HuggingFace (KwaiVGI/LivePortrait)..." -ForegroundColor Cyan
    # Install huggingface_hub CLI inside venv if not already present
    python -m pip install "huggingface_hub[cli]"
    
    # Run HuggingFace download with dev-symlinks turned off (critical for Windows permission stability)
    huggingface-cli download KwaiVGI/LivePortrait --local-dir LivePortrait/pretrained_weights --local-dir-use-symlinks False
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to download model weights from HuggingFace. Check your internet connection."
    }
    Write-Host "Model weights downloaded and placed successfully." -ForegroundColor Green
} else {
    Write-Host "Pretrained model weights already present." -ForegroundColor Green
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Setup complete! Starting LivePortrait  " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Launch the FastAPI Server
python server.py
