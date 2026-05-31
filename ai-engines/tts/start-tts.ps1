# Windows PowerShell Helper to set up and run the TTS service
$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location $PSScriptRoot

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   XTTS v2 Voice Generation Microservice     " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Found Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Python is not installed or not in your PATH. Please install Python 3.10 and try again." -ForegroundColor Red
    Exit 1
}

# Check if venv directory exists
if (-not (Test-Path "venv")) {
    Write-Host "Virtual environment ('venv') not found. Creating it now..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create virtual environment." -ForegroundColor Red
        Exit 1
    }
    Write-Host "Virtual environment created successfully." -ForegroundColor Green
    
    Write-Host "Activating venv and installing CPU PyTorch (this may take a few minutes)..." -ForegroundColor Yellow
    & ".\venv\Scripts\pip.exe" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    
    Write-Host "Installing required packages from requirements.txt..." -ForegroundColor Yellow
    & ".\venv\Scripts\pip.exe" install -r requirements.txt
    
    Write-Host "Setup completed successfully!" -ForegroundColor Green
}

Write-Host "Activating virtual environment..." -ForegroundColor Cyan
# Set execution policy for this process only, then activate and run
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

Write-Host "Starting FastAPI uvicorn server on port 5100..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Yellow
& ".\venv\Scripts\uvicorn.exe" server:app --host 0.0.0.0 --port 5100 --reload
