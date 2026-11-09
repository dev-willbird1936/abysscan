@echo off
setlocal
cd /d "%~dp0" || (echo Cannot open comparison folder. & pause & exit /b 1)
where node >nul 2>nul || (echo Node.js is required. & pause & exit /b 1)
node server.mjs
pause
