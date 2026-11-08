@echo off
title Couch-TV - Headless Remote Server
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    set "PY_EXE=.venv\Scripts\python.exe"
) else (
    set "PY_EXE=python"
)

echo ====================================================
echo Starting Couch-TV in Headless Background Mode...
echo ====================================================
"%PY_EXE%" server\app.py --headless
pause
