# Hallo3 Microservice Bootstrapper
# Sets up venv, auto-detects CUDA/CPU, clones repo, and starts FastAPI.

$ErrorActionPreference = "Stop"
$ScriptName = $MyInvocation.MyCommand.Name
$env:PYTHONIOENCODING="utf-8"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      AdWhiz Hallo3 Local Setup           " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Clone Hallo3 Repository if not present
if (-not (Test-Path "hallo3")) {
    Write-Host "[1/6] Cloning Hallo3 repository from GitHub..." -ForegroundColor Yellow
    git clone https://github.com/fudan-generative-vision/hallo3.git hallo3
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to clone Hallo3 repository. Please ensure git is installed and you have internet access."
    }
    Write-Host "Cloning complete." -ForegroundColor Green
} else {
    Write-Host "[1/6] Hallo3 repository already cloned." -ForegroundColor Green
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
        Write-Error "Failed to create Python virtual environment. Please check your Python installation (Python 3.10 recommended)."
    }
    Write-Host "Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "[3/6] Python virtual environment already exists." -ForegroundColor Green
}

# 4. Activate Venv and Upgrade Pip
Write-Host "[4/6] Activating virtual environment and upgrading pip..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"
python -m pip install --upgrade pip wheel Cython
python -m pip install "setuptools<82"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Failed to upgrade pip and install Cython. Proceeding."
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

# Install official Hallo3 requirements
if (Test-Path "hallo3/requirements.txt") {
    # Install SwissArmyTransformer without dependencies to prevent pulling in DeepSpeed
    Write-Host "Installing SwissArmyTransformer --no-deps..." -ForegroundColor Cyan
    python -m pip install SwissArmyTransformer==0.4.12 --no-deps
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install SwissArmyTransformer."
    }

    # We use --no-build-isolation so setup can see PyTorch installed in the active venv
    python -m pip install -r hallo3/requirements.txt --no-build-isolation
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install Hallo3 requirements."
    }

    # Apply post-installation patch to sat's triton_rotary.py to bypass Triton on CPU/Windows
    Write-Host "Applying Windows/CPU compatibility patch to SwissArmyTransformer..." -ForegroundColor Cyan
    $PythonCode = @'
import os, sys, sat
sat_path = os.path.dirname(sat.__file__)
target = os.path.join(sat_path, 'model', 'position_embedding', 'triton_rotary.py')
if os.path.exists(target):
    with open(target, 'r', encoding='utf-8') as f:
        c = f.read()
    old_imp = 'import triton\nimport triton.language as tl'
    new_imp = 'try:\n    import triton\n    import triton.language as tl\n    HAS_TRITON = True\nexcept ImportError:\n    HAS_TRITON = False\n    class DummyTriton:\n        @staticmethod\n        def jit(func):\n            return func\n        @staticmethod\n        def constexpr(val):\n            return val\n    triton = DummyTriton\n    class DummyLanguage:\n        constexpr = None\n    tl = DummyLanguage'
    if old_imp in c:
        c = c.replace(old_imp, new_imp)
    old_def = 'def apply_rotary('
    pytorch_def = """def apply_rotary_pytorch(
    x: torch.Tensor,
    cos: torch.Tensor,
    sin: torch.Tensor,
    position_ids: torch.Tensor,
    interleaved=False,
    inplace=False,
    conjugate=False,
) -> torch.Tensor:
    batch, nheads, seqlen, headdim = x.shape
    seqlen_ro, rotary_dim_half = cos.shape
    rotary_dim = rotary_dim_half * 2
    cos_gathered = cos[position_ids].unsqueeze(1)
    sin_gathered = sin[position_ids].unsqueeze(1)
    x_rot = x[..., :rotary_dim]
    if not interleaved:
        x1 = x_rot[..., :rotary_dim_half]
        x2 = x_rot[..., rotary_dim_half:]
        if conjugate:
            o1 = x1 * cos_gathered + x2 * sin_gathered
            o2 = -x1 * sin_gathered + x2 * cos_gathered
        else:
            o1 = x1 * cos_gathered - x2 * sin_gathered
            o2 = x1 * sin_gathered + x2 * cos_gathered
        output = torch.cat([o1, o2], dim=-1)
    else:
        x1 = x_rot[..., 0::2]
        x2 = x_rot[..., 1::2]
        if conjugate:
            o1 = x1 * cos_gathered + x2 * sin_gathered
            o2 = -x1 * sin_gathered + x2 * cos_gathered
        else:
            o1 = x1 * cos_gathered - x2 * sin_gathered
            o2 = x1 * sin_gathered + x2 * cos_gathered
        output = torch.empty_like(x_rot)
        output[..., 0::2] = o1
        output[..., 1::2] = o2
    if inplace:
        x[..., :rotary_dim] = output
        return x
    else:
        res = x.clone()
        res[..., :rotary_dim] = output
        return res

def apply_rotary("""
    if 'apply_rotary_pytorch' not in c and old_def in c:
        c = c.replace(old_def, pytorch_def)
    sig = 'def apply_rotary(\n    x: torch.Tensor,\n    cos: torch.Tensor,\n    sin: torch.Tensor,\n    position_ids: torch.Tensor,\n    seqlen_offsets: Union[int, torch.Tensor] = 0,\n    cu_seqlens: Optional[torch.Tensor] = None,\n    max_seqlen: Optional[int] = None,\n    interleaved=False,\n    inplace=False,\n    conjugate=False,\n) -> torch.Tensor:'
    sig_new = sig + '\n    if not HAS_TRITON or x.device.type == "cpu":\n        return apply_rotary_pytorch(x, cos, sin, position_ids, interleaved=interleaved, inplace=inplace, conjugate=conjugate)'
    if sig in c and 'HAS_TRITON' not in c[c.find(sig):c.find(sig)+300]:
        c = c.replace(sig, sig_new)
    with open(target, 'w', encoding='utf-8') as f:
        f.write(c)
    print('SwissArmyTransformer patch applied successfully!')
'@
    $PythonCode | Out-File -FilePath "patch_sat.py" -Encoding utf8
    python patch_sat.py
    if (Test-Path "patch_sat.py") { Remove-Item "patch_sat.py" }
}



Write-Host "All Python packages installed successfully." -ForegroundColor Green

# 6. Pretrained Weights Instructions
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host " [6/6] PRETRAINED MODEL CHECKPOINTS MANUAL DOWNLOAD INFO " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "Because Hallo3 requires huge multi-gigabyte models (CogVideoX, T5-xxl,"
Write-Host "InsightFace, and Wav2Vec2), you must download the checkpoints from HuggingFace:"
Write-Host ""
Write-Host "  Destination directory: ai-engines/hallo3/hallo3/pretrained_models"
Write-Host ""
Write-Host "Command to download (using HuggingFace CLI in venv):" -ForegroundColor Cyan
Write-Host "  huggingface-cli download fudan-generative-ai/hallo3 --local-dir hallo3/pretrained_models --local-dir-use-symlinks False" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Yellow

Write-Host "==========================================" -ForegroundColor Green
Write-Host "   Setup complete! Starting Hallo3 Server " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Launch the FastAPI Server
python server.py
