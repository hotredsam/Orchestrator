@echo off
REM ═══════════════════════════════════════════════════════════
REM  Swarm Town — ngrok Tunnel (Windows)
REM  Exposes localhost:6969 so Telegram Mini App works externally
REM ═══════════════════════════════════════════════════════════

setlocal

if "%AGENT_API_PORT%"=="" (set PORT=6969) else (set PORT=%AGENT_API_PORT%)

echo.
echo   Swarm Town ngrok Tunnel
echo   Local port: %PORT%
echo.

REM ── Check ngrok is installed ──────────────────────────────
where ngrok >nul 2>&1
if errorlevel 1 (
    echo   ERROR: ngrok is not installed.
    echo.
    echo   Install it with one of:
    echo     choco install ngrok         -- Chocolatey
    echo     winget install ngrok.ngrok  -- winget
    echo     npm install -g ngrok        -- npm wrapper
    echo     https://ngrok.com/download  -- direct download
    echo.
    pause
    exit /b 1
)

REM ── Check the orchestrator is running ─────────────────────
curl -s http://localhost:%PORT%/api/repos >nul 2>&1
if errorlevel 1 (
    echo   WARNING: Orchestrator not responding on port %PORT%.
    echo   Start it first:  python orchestrator.py --start-all
    echo   Continuing anyway — ngrok will wait for the server.
    echo.
)

REM ── Start ngrok in background ─────────────────────────────
echo   Starting ngrok tunnel to localhost:%PORT% ...
echo.
start /b ngrok http %PORT%

REM Wait for ngrok to initialize
timeout /t 4 /nobreak >nul

REM ── Get the public URL from ngrok local API ───────────────
for /f "delims=" %%U in ('curl -s http://127.0.0.1:4040/api/tunnels 2^>nul ^| python -c "import sys,json; data=json.load(sys.stdin); tunnels=data.get('tunnels',[]); [print(t['public_url']) for t in tunnels if t.get('proto')=='https'][:1] or [print(tunnels[0]['public_url']) if tunnels else None]" 2^>nul') do set PUBLIC_URL=%%U

if "%PUBLIC_URL%"=="" (
    echo   Could not retrieve ngrok URL.
    echo   Visit http://127.0.0.1:4040 to see the tunnel URL.
) else (
    echo   ==================================================
    echo   ngrok tunnel active!
    echo.
    echo   Public URL:  %PUBLIC_URL%
    echo   Mini App:    %PUBLIC_URL%/telegram-app
    echo   Dashboard:   %PUBLIC_URL%
    echo.
    echo   To register with BotFather:
    echo     1. Open @BotFather in Telegram
    echo     2. Send /mybots -^> select your bot -^> Bot Settings
    echo     3. Menu Button -^> Edit URL ^(or Configure Mini App^)
    echo     4. Set URL to: %PUBLIC_URL%/telegram-app
    echo.
    echo   Or set PUBLIC_URL env var before starting orchestrator:
    echo     set PUBLIC_URL=%PUBLIC_URL%
    echo   ==================================================
)

echo.
echo   ngrok inspect UI: http://127.0.0.1:4040
echo   Press Ctrl+C to stop the tunnel
echo.
pause >nul
