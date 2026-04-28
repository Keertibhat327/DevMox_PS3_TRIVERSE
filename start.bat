@echo off
echo Starting AquaWatch local server...
echo Open http://localhost:3000 in your browser
echo Press Ctrl+C to stop
python -m http.server 3000 --directory frontend
pause
