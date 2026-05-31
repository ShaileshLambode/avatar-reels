# AdWhiz AI Avatar Reels - Windows Setup & Directory Scaffold Script
# Run from repository root

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Scaffolding AdWhiz AI Avatar Reels Directory Layout" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Define directories to create
$dirs = @(
    "avatar-reels/storage/cache",
    "avatar-reels/storage/temp",
    "avatar-reels/storage/exports",
    "avatar-reels/storage/failed-renders",
    "avatar-reels/assets/avatars",
    "avatar-reels/assets/music",
    "avatar-reels/assets/templates",
    "avatar-reels/assets/fonts",
    "avatar-reels/backend/logs"
)

# Create folders and insert a .gitkeep file
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Write-Host "Created Directory: $dir" -ForegroundColor Green
    }
    
    # Place .gitkeep inside to keep Git tracking clean
    $gitkeepPath = Join-Path $dir ".gitkeep"
    if (-not (Test-Path $gitkeepPath)) {
        New-Item -ItemType File -Force -Path $gitkeepPath | Out-Null
        Write-Host "Created .gitkeep in: $dir" -ForegroundColor DarkGreen
    }
}

# Environment variable check
$envPath = "avatar-reels/backend/.env"
$envExamplePath = "avatar-reels/backend/.env.example"

if (-not (Test-Path $envPath)) {
    if (Test-Path $envExamplePath) {
        Copy-Item -Path $envExamplePath -Destination $envPath
        Write-Host "Created backend config: $envPath from example template." -ForegroundColor Yellow
    } else {
        Write-Host "Warning: Backend environment template (.env.example) not found!" -ForegroundColor Red
    }
} else {
    Write-Host "Backend environment file (.env) already exists." -ForegroundColor Gray
}

Write-Host "`nScaffolding Completed Successfully!" -ForegroundColor Green
Write-Host "Ensure MongoDB (port 27017) and Redis (port 6379) are active." -ForegroundColor Cyan
Write-Host "Start development server using: cd avatar-reels/backend && npm run dev" -ForegroundColor Yellow
