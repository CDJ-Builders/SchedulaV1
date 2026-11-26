@echo off
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"
if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
    "%SCRIPT_DIR%.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
) else if exist "%SCRIPT_DIR%.venv313\Scripts\python.exe" (
    echo [SchedulaML] Initializing .venv from .venv313...
    xcopy /E /I /Q /Y "%SCRIPT_DIR%.venv313" "%SCRIPT_DIR%.venv"
    "%SCRIPT_DIR%.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8001
) else (
    echo [SchedulaML ERROR] .venv not found. Run start.ps1 in PowerShell.
    pause
)
