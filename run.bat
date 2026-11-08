@echo off
setlocal
title Couch-TV - TV Launcher & Remote Server
cd /d "%~dp0"

:: Check if virtual environment exists
if not exist ".venv\Scripts\python.exe" (
    echo ====================================================
    echo [!] Virtual environment not found.
    echo Running installer.bat to set up dependencies...
    echo ====================================================
    echo.
    call installer.bat
    if not exist ".venv\Scripts\python.exe" (
        echo [!] Installation failed or was cancelled.
        pause
        exit /b 1
    )
)

echo ====================================================
echo Starting Couch-TV (Fullscreen TV Mode)...
echo ====================================================
".venv\Scripts\python.exe" server\app.py
if %errorlevel% neq 0 (
    echo.
    echo [!] Server exited with code %errorlevel%.
    pause
)
