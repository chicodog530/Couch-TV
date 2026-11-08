@echo off
title CouchPC - Headless Remote Server
cd /d "%~dp0"
echo ====================================================
echo Starting CouchPC in Headless Background Mode...
echo ====================================================
python server\app.py --headless
pause
