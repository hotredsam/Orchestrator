@echo off
title Swarm Orchestrator
echo.
echo   ◈ Starting Swarm Orchestrator...
echo   Dashboard: http://localhost:6969
echo.

cd /d "%~dp0"

REM Start orchestrator in background
start /b python orchestrator.py --start-all

REM Wait for API
echo   Waiting for API...
:WAIT_LOOP
timeout /t 1 /nobreak >nul
curl -s http://localhost:6969/api/repos >nul 2>&1
if errorlevel 1 goto WAIT_LOOP
echo   API ready!

REM Open browser
start http://localhost:6969

echo.
echo   Press Ctrl+C to stop
echo.
pause >nul
