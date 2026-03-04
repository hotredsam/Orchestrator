#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Swarm Orchestrator v3 — Full Setup
# ═══════════════════════════════════════════════════════════
set -e

echo "◈ Swarm Orchestrator v3 Setup"
echo "═══════════════════════════════"

check() { command -v "$1" &>/dev/null && echo "  ✅ $1" || { echo "  ❌ $1 — $2"; return 1; }; }

echo ""
echo "Checking tools..."
FAIL=0
check node "Install Node.js 18+" || FAIL=1
check npm "" || FAIL=1
check python3 "" || FAIL=1
check git "" || FAIL=1
check claude "npm i -g @anthropic-ai/claude-code" || FAIL=1
check gh "(optional) https://cli.github.com" || true
check grep "" || FAIL=1

[ $FAIL -eq 1 ] && echo "" && echo "⚠ Install missing required tools first." && exit 1

# ── Ruflo ──
echo ""
echo "Installing Ruflo..."
npm install -g claude-flow@alpha 2>/dev/null && echo "  ✅ Ruflo" || echo "  ⚠ Ruflo failed (optional)"

# ── Ralph Loop ──
echo ""
echo "Installing Ralph Loop plugin..."
claude plugin install ralph-wiggum@claude-plugins-official 2>/dev/null && echo "  ✅ Ralph" || echo "  ⚠ Ralph failed (optional)"

# ── Whisper ──
echo ""
echo "Installing Whisper for audio transcription..."
pip install --break-system-packages openai-whisper 2>/dev/null || pip install openai-whisper 2>/dev/null
check whisper "pip install openai-whisper" || echo "  ⚠ Whisper not installed — audio will use Claude fallback"

# ── Directories ──
echo ""
echo "Creating directories..."
mkdir -p ~/repos ~/swarm-audio ~/Desktop/intake
echo "  ✅ ~/repos (repo storage)"
echo "  ✅ ~/swarm-audio (audio recordings)"
echo "  ✅ ~/Desktop/intake (drag files here)"

# ── Claude permissions ──
echo ""
echo "Configuring Claude Code permissions..."
mkdir -p ~/.claude
cat > ~/.claude/settings.local.json << 'EOF'
{
  "permissions": {
    "allow": [
      "Bash(grep:*)", "Bash(find:*)", "Bash(git:*)",
      "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)",
      "Bash(python3:*)", "Bash(pytest:*)", "Bash(gh:*)",
      "Bash(whisper:*)"
    ]
  }
}
EOF
echo "  ✅ Permissions set"

# ── Make launchers executable ──
echo ""
SDIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$SDIR/launch-swarm.sh" 2>/dev/null || true
chmod +x "$SDIR/Swarm Orchestrator.command" 2>/dev/null || true
echo "  ✅ Launchers executable"

# ── Desktop shortcut ──
echo ""
echo "Creating desktop shortcut..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: copy .command to Desktop
    cp "$SDIR/Swarm Orchestrator.command" ~/Desktop/ 2>/dev/null
    chmod +x ~/Desktop/"Swarm Orchestrator.command"
    echo "  ✅ ~/Desktop/Swarm Orchestrator.command"
elif [[ "$OSTYPE" == "linux"* ]]; then
    cat > ~/Desktop/swarm-orchestrator.desktop << DESK
[Desktop Entry]
Name=Swarm Orchestrator
Comment=Multi-agent autonomous coding
Exec=bash -c 'cd $SDIR && ./launch-swarm.sh'
Terminal=true
Type=Application
Icon=utilities-terminal
Categories=Development;
DESK
    chmod +x ~/Desktop/swarm-orchestrator.desktop
    echo "  ✅ ~/Desktop/swarm-orchestrator.desktop"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    cp "$SDIR/launch-swarm.bat" ~/Desktop/ 2>/dev/null
    echo "  ✅ ~/Desktop/launch-swarm.bat"
fi

# ── Init master DB ──
echo ""
echo "Initializing master database..."
python3 -c "
import sys; sys.path.insert(0,'$SDIR')
from orchestrator import MasterDB
MasterDB('$HOME/swarm-master.db')
print('  ✅ ~/swarm-master.db')
" 2>/dev/null || echo "  ⚠ DB init skipped (run orchestrator.py to create)"

echo ""
echo "═══════════════════════════════════════"
echo "  ✅ Setup complete!"
echo "═══════════════════════════════════════"
echo ""
echo "  Quick start:"
echo "    Double-click the icon on your Desktop"
echo "    OR: python3 orchestrator.py --start-all"
echo ""
echo "  Dashboard: http://localhost:6969"
echo ""
echo "  Workflow:"
echo "    1. Add repos in the Repos tab"
echo "    2. Add features or issues"
echo "    3. Click START ALL — walk away"
echo "    4. Record audio reviews anytime"
echo "    5. Agent runs until done, pushes to GitHub"
echo "    6. If credits run out, auto-resumes when back"
echo ""
