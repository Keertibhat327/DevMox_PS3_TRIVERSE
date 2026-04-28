@echo off
title AquaWatch Frontend
set "ROOT=%~dp0"
echo Starting Frontend on port 3000...
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000"
py -m http.server 3000 --directory "%ROOT%frontend"
pause
