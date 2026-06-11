@echo off
REM Start the Tutoria backend reachable from this PC AND other devices (phone)
REM on your Wi-Fi. --host 0.0.0.0 is required: the default (127.0.0.1) makes
REM every login from http://192.168.x.x:3001 fail with "Failed to fetch".
cd /d "%~dp0"
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
