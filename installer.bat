@echo off
setlocal enabledelayedexpansion
title Couch-TV Installer

cd /d "%~dp0"

echo ==========================================================
echo        📺 Couch-TV Virtual Environment Installer
echo ==========================================================
echo.

:: 1. Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        echo [!] ERROR: Python was not found on your system PATH.
        echo     Please install Python 3.10+ from https://www.python.org
        echo     Be sure to check "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    ) else (
        set "PY_CMD=py"
    )
) else (
    set "PY_CMD=python"
)

echo [*] Detected Python:
%PY_CMD% --version
echo.

:: 2. Create Virtual Environment
if not exist ".venv" (
    echo [*] Creating virtual environment in .venv ...
    %PY_CMD% -m venv .venv
    if %errorlevel% neq 0 (
        echo [!] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [✓] Virtual environment created.
) else (
    echo [✓] Existing .venv directory found.
)
echo.

:: 3. Upgrade pip
echo [*] Upgrading pip...
.venv\Scripts\python.exe -m pip install --upgrade pip --quiet

:: 4. Install requirements
echo [*] Installing dependencies from requirements.txt...
.venv\Scripts\python.exe -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] Error installing requirements.
    pause
    exit /b 1
)

echo.
echo [*] Verifying installation...
.venv\Scripts\python.exe -c "import flask, websockets, pycaw, comtypes, PySide6, qrcode, PIL, cryptography, win32gui; print('[✓] All required packages loaded successfully!')"
if %errorlevel% neq 0 (
    echo [!] Warning: Some packages may not have installed cleanly.
) else (
    echo.
    echo ==========================================================
    echo   🎉 Couch-TV is ready to use!
    echo   You can now launch the app by double-clicking:
    echo        run.bat (Fullscreen TV Mode)
    echo        run_headless.bat (Background Remote Server)
    echo ==========================================================
)

echo.
pause