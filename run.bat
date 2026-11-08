@echo off
title CouchPC - TV Box & Remote Server
cd /d "%~dp0"
echo ====================================================
echo Starting CouchPC TV Box Mode...
echo ====================================================
python server\app.py
pause
