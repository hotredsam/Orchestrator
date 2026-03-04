#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Swarm Town — ngrok Tunnel
#  Exposes localhost:6969 so Telegram Mini App works externally
# ═══════════════════════════════════════════════════════════

PORT=${AGENT_API_PORT:-6969}

echo ""
echo "  Swarm Town ngrok Tunnel"
echo "  Local port: $PORT"
echo ""

# ── Check ngrok is installed ──────────────────────────────
if ! command -v ngrok &>/dev/null; then
    echo "  ERROR: ngrok is not installed."
    echo ""
    echo "  Install it with one of:"
    echo "    brew install ngrok          # macOS"
    echo "    choco install ngrok         # Windows"
    echo "    snap install ngrok          # Linux"
    echo "    npm install -g ngrok        # npm (wrapper)"
    echo "    https://ngrok.com/download  # direct download"
    echo ""
    exit 1
fi

# ── Check the orchestrator is running ─────────────────────
if ! curl -s "http://localhost:$PORT/api/repos" >/dev/null 2>&1; then
    echo "  WARNING: Orchestrator not responding on port $PORT."
    echo "  Start it first:  python3 orchestrator.py --start-all"
    echo "  Continuing anyway — ngrok will wait for the server."
    echo ""
fi

# ── Start ngrok ───────────────────────────────────────────
echo "  Starting ngrok tunnel to localhost:$PORT ..."
echo ""

# Start ngrok in the background, then query the API for the URL
ngrok http "$PORT" --log=stdout --log-level=info &
NGROK_PID=$!

# Wait for ngrok to initialize
sleep 3

# Get the public URL from ngrok's local API
PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for t in data.get('tunnels', []):
        if t.get('proto') == 'https':
            print(t['public_url'])
            break
    else:
        # Fall back to first tunnel
        tunnels = data.get('tunnels', [])
        if tunnels:
            print(tunnels[0]['public_url'])
except:
    pass
" 2>/dev/null)

if [ -z "$PUBLIC_URL" ]; then
    echo "  Could not retrieve ngrok URL. Check ngrok output above."
    echo "  You can also visit http://127.0.0.1:4040 to see the tunnel."
else
    echo "  =================================================="
    echo "  ngrok tunnel active!"
    echo ""
    echo "  Public URL:  $PUBLIC_URL"
    echo "  Mini App:    $PUBLIC_URL/telegram-app"
    echo "  Dashboard:   $PUBLIC_URL"
    echo ""
    echo "  To register with BotFather:"
    echo "    1. Open @BotFather in Telegram"
    echo "    2. Send /mybots -> select your bot -> Bot Settings"
    echo "    3. Menu Button -> Edit URL (or Configure Mini App)"
    echo "    4. Set URL to: $PUBLIC_URL/telegram-app"
    echo ""
    echo "  Or set PUBLIC_URL env var before starting orchestrator:"
    echo "    export PUBLIC_URL=$PUBLIC_URL"
    echo "  =================================================="
fi

echo ""
echo "  ngrok inspect UI: http://127.0.0.1:4040"
echo "  Press Ctrl+C to stop the tunnel"
echo ""

# Keep alive
trap "echo ''; echo 'Stopping ngrok...'; kill $NGROK_PID 2>/dev/null; exit 0" INT TERM
wait $NGROK_PID
