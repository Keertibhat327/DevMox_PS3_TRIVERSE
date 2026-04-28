@echo off
title AquaWatch Launcher

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo ================================
echo   AquaWatch - Starting...
echo ================================
echo.

echo Starting Backend (GEE)...
start "AquaWatch Backend" cmd /k "cd /d "%BACKEND%" && py -m uvicorn app:app --port 8000"

echo Waiting for backend to start...
timeout /t 4 /nobreak >nul

echo Starting Frontend...
start "AquaWatch Frontend" cmd /k "py -m http.server 3000 --directory "%FRONTEND%""

timeout /t 2 /nobreak >nul

echo Opening browser...
start "" "http://localhost:3000"

echo.
echo Done! AquaWatch is running.
echo Frontend : http://localhost:3000
echo Backend  : http://localhost:8000
echo.
echo Close the two black terminal windows to stop.
pause
