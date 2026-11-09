@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js is required. & exit /b 1)
echo Starting Abysscan Scene Studio at http://127.0.0.1:4175/scene-studio
echo This editor changes fictional desktop state only. Keep this window open.
node tools\scene-studio.mjs
if errorlevel 1 pause
