@echo off
title Swarm Orchestrator
echo.
echo   ◈ Swarm Orchestrator
echo   Dashboard: http://localhost:6969
echo.

cd /d "%~dp0\.."

REM Check if already running
curl -s http://localhost:6969/api/repos >nul 2>&1
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
curl -s http://localhost:6969/api/repos >nul 2>&1
if errorlevel 1 goto WAIT_LOOP
echo   ✅ API ready!

REM Open browser
start http://localhost:6969

echo.
echo   Press Ctrl+C to stop
echo.
pause >nul
