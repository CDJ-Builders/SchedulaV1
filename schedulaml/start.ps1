# start.ps1 - Start SchedulaML Service with guaranteed Python 3.13 runtime
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$VenvPython = Join-Path $ScriptDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[SchedulaML] .venv not found. Looking for Python 3.13 environment..." -ForegroundColor Yellow
    if (Test-Path (Join-Path $ScriptDir ".venv313\Scripts\python.exe")) {
        Write-Host "[SchedulaML] Restoring configured Python 3.13 environment into .venv..." -ForegroundColor Cyan
        Copy-Item -Recurse -Force (Join-Path $ScriptDir ".venv313") (Join-Path $ScriptDir ".venv")
    } elseif (Get-Command uv -ErrorAction SilentlyContinue) {
        Write-Host "[SchedulaML] Creating fresh Python 3.13 .venv via uv..." -ForegroundColor Cyan
        & uv venv --python 3.13 (Join-Path $ScriptDir ".venv")
        & uv pip install -r (Join-Path $ScriptDir "requirements.txt") --python (Join-Path $ScriptDir ".venv")
    } else {
        Write-Error "[SchedulaML] Could not locate Python 3.13. Please install Python 3.13 or run `uv venv --python 3.13 .venv`."
        exit 1
    }
}

# Verify Python version of .venv
$PyVersion = & $VenvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($PyVersion -ne "3.13") {
    Write-Host "[SchedulaML WARNING] .venv is running Python $PyVersion, but SchedulaML requires Python 3.13." -ForegroundColor Red
    if (Test-Path (Join-Path $ScriptDir ".venv313\Scripts\python.exe")) {
        Write-Host "[SchedulaML] Replacing incompatible .venv with working Python 3.13 environment (.venv313)..." -ForegroundColor Cyan
        Remove-Item -Recurse -Force (Join-Path $ScriptDir ".venv")
        Copy-Item -Recurse -Force (Join-Path $ScriptDir ".venv313") (Join-Path $ScriptDir ".venv")
    } else {
        Write-Error "[SchedulaML] Incompatible Python $PyVersion in .venv. SchedulaML requires Python 3.13."
        exit 1
    }
}

Write-Host "[SchedulaML] Launching FastAPI inference service on http://127.0.0.1:8001 (Python 3.13)..." -ForegroundColor Green
& $VenvPython -m uvicorn app.main:app --host 127.0.0.1 --port 8001
