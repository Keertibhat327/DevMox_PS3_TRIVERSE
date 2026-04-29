@echo off
title AquaWatch - NEW VERSION
cls
echo.
echo ========================================
echo   AquaWatch - OPEN NEW VERSION
echo ========================================
echo.
echo This will open index-new.html which
echo has a DIFFERENT filename to bypass
echo ALL browser caching!
echo.
pause

REM Kill existing servers
echo Stopping any existing servers...
taskkill /F /IM python.exe 2>nul
taskkill /F /IM py.exe 2>nul
timeout /t 1 /nobreak >nul

REM Start server
echo.
echo Starting server on port 3000...
set "ROOT=%~dp0"
start /B py -m http.server 3000 --directory "%ROOT%frontend"
timeout /t 2 /nobreak >nul

REM Open the NEW file
set "URL=http://localhost:3000/index-new.html"

echo.
echo ========================================
echo   Opening NEW VERSION:
echo   %URL%
echo ========================================
echo.
echo This is a DIFFERENT FILE NAME so your
echo browser CANNOT use cached version!
echo.
echo After it opens:
echo 1. Click "Yamuna, Delhi" button
echo 2. Click "Analyze Location"
echo 3. Scroll down in the result card
echo 4. Look for 3 NEW sections!
echo.

start "" "%URL%"

echo.
echo Server is running...
echo Press any key to stop the server...
pause >nul

REM Stop server
taskkill /F /IM python.exe 2>nul
taskkill /F /IM py.exe 2>nul
echo Server stopped.
timeout /t 2 /nobreak >nul
