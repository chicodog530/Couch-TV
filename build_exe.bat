@echo off
title Building Couch-TV Standalone Executable...
cd /d "%~dp0"
echo ==========================================================
echo       Building Couch-TV Standalone Executable
echo ==========================================================
echo.
python -m PyInstaller --clean --noconfirm couch_tv.spec
if %errorlevel% neq 0 (
    echo [!] Build failed.
    pause
    exit /b 1
)
echo.
echo [✓] Build completed successfully!
echo Executable is located at: dist\Couch-TV\Couch-TV.exe
pause