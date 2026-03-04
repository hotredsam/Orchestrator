@echo off
title Swarm Orchestrator
echo.
echo   ◈ Swarm Orchestrator
echo   Dashboard: http://localhost:6969
echo.

cd /d "%~dp0\.."

REM Check if curl is available, else use PowerShell
where curl >nul 2>&1
if errorlevel 1 (
    set HEALTH_CMD=powershell -NoProfile -Command "try{(Invoke-WebRequest -Uri 'http://localhost:6969/api/status' -UseBasicParsing -TimeoutSec 2).StatusCode}catch{exit 1}"
) else (
    set HEALTH_CMD=curl -s http://localhost:6969/api/status
)

REM Check if already running
%HEALTH_CMD% >nul 2>&1
if not errorlevel 1 (
    echo   ✅ Server already running! Opening dashboard...
    start http://localhost:6969
    exit /b 0
)

REM Start orchestrator in background (hidden window)
start /b /min pythonw orchestrator.py --start-all 2>nul || start /b python orchestrator.py --start-all

REM Wait for API
echo   Waiting for API...
:WAIT_LOOP
timeout /t 1 /nobreak >nul
%HEALTH_CMD% >nul 2>&1
if errorlevel 1 goto WAIT_LOOP
echo   ✅ API ready!

REM Open browser
start http://localhost:6969

echo.
echo   Press Ctrl+C to stop
echo.
pause >nul
