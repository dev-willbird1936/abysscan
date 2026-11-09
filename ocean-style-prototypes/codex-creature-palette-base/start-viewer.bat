@echo off
cd /d "%~dp0.."
start "" "http://127.0.0.1:8778/codex-creature-palette-base/index.html"
python -m http.server 8778 --bind 127.0.0.1
pause
