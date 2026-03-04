#!/bin/bash
# Swarm Orchestrator — macOS Launcher
# Double-click this file in Finder to start

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "◈ Swarm Orchestrator starting..."

python3 orchestrator.py --start-all &
PID=$!

# Wait for ready
for i in $(seq 1 30); do
    curl -s http://localhost:6969/api/repos > /dev/null 2>&1 && break
    sleep 1
done

open "http://localhost:6969"
echo "Dashboard open. Close this window or Ctrl+C to stop."
trap "kill $PID 2>/dev/null; exit" INT TERM
wait $PID
