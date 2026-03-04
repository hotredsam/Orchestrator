#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Swarm Orchestrator — Desktop Launcher
#  Double-click to start backend + open dashboard
# ═══════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORT=6969
URL="http://localhost:$PORT"

echo "◈ Starting Swarm Orchestrator..."
echo "  Dashboard: $URL"
echo ""

# Check if already running
if curl -s "$URL/api/repos" > /dev/null 2>&1; then
    echo "  ✅ Server already running! Opening dashboard..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "$URL"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
        start "$URL"
    else
        xdg-open "$URL" 2>/dev/null || echo "  Open $URL in your browser"
    fi
    exit 0
fi

# Start orchestrator in background
cd "$PROJECT_DIR"
PYTHONIOENCODING=utf-8 python3 orchestrator.py --start-all &
ORCH_PID=$!
echo "  Orchestrator PID: $ORCH_PID"

# Wait for server to be ready
echo "  Waiting for API..."
for i in $(seq 1 30); do
    if curl -s "$URL/api/repos" > /dev/null 2>&1; then
        echo "  ✅ API ready!"
        break
    fi
    sleep 1
done

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$URL"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    start "$URL"
else
    xdg-open "$URL" 2>/dev/null || echo "  Open $URL in your browser"
fi

echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Keep alive
trap "echo ''; echo 'Stopping...'; kill $ORCH_PID 2>/dev/null; exit 0" INT TERM
wait $ORCH_PID
