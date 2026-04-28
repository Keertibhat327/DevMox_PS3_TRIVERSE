@echo off
title AquaWatch Backend
set "BACKEND=%~dp0backend"
cd /d "%BACKEND%"
echo Starting GEE Backend on port 8000...
py -m uvicorn app:app --reload --port 8000
pause
