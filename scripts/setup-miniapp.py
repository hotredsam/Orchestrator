#!/usr/bin/env python3
"""
Register Swarm Town Mini App with Telegram BotFather.
Sets the menu button URL and configures web_app_data handling.

Usage:
  python scripts/setup-miniapp.py <PUBLIC_URL>

  Example:
    python scripts/setup-miniapp.py https://abc123.ngrok-free.app
"""
import os, sys, json, requests

# Load .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.isfile(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

if not BOT_TOKEN:
    print("Error: TELEGRAM_BOT_TOKEN not set. Add it to .env")
    sys.exit(1)

BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

def api(method, **kwargs):
    r = requests.post(f"{BASE}/{method}", json=kwargs)
    data = r.json()
    if not data.get("ok"):
        print(f"  Error: {data.get('description', 'Unknown error')}")
    return data

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/setup-miniapp.py <PUBLIC_URL>")
        print("  PUBLIC_URL = your ngrok or tunnel URL (e.g. https://abc123.ngrok-free.app)")
        sys.exit(1)

    public_url = sys.argv[1].rstrip("/")
    app_url = f"{public_url}/telegram-app"

    print(f"Setting up Swarm Town Mini App...")
    print(f"  Bot Token: {BOT_TOKEN[:10]}...")
    print(f"  App URL: {app_url}")
    print()

    # 1. Set the chat menu button to open the Mini App
    print("1. Setting chat menu button...")
    result = api("setChatMenuButton",
        chat_id=int(CHAT_ID) if CHAT_ID else None,
        menu_button={
            "type": "web_app",
            "text": "Swarm Town",
            "web_app": {"url": app_url}
        }
    )
    if result.get("ok"):
        print("   Done! Menu button set to 'Swarm Town'")

    # 2. Set bot commands
    print("2. Setting bot commands...")
    result = api("setMyCommands", commands=[
        {"command": "status", "description": "Show all repos with progress bars"},
        {"command": "start_all", "description": "Start all repo orchestrators"},
        {"command": "stop_all", "description": "Stop all repo orchestrators"},
        {"command": "start", "description": "Start a specific repo (e.g. /start blog)"},
        {"command": "stop", "description": "Stop a specific repo (e.g. /stop blog)"},
        {"command": "items", "description": "List items for a repo (e.g. /items blog)"},
        {"command": "plan", "description": "Show plan steps (e.g. /plan blog)"},
        {"command": "push", "description": "Git push a repo (e.g. /push blog)"},
        {"command": "digest", "description": "Show the daily digest summary"},
        {"command": "costs", "description": "Show per-repo API costs and total"},
        {"command": "health", "description": "Health scan all repos"},
        {"command": "budget", "description": "View or set API budget limit"},
        {"command": "retry", "description": "Re-queue completed items (e.g. /retry blog)"},
        {"command": "metrics", "description": "API request and latency stats"},
        {"command": "trends", "description": "7-day performance trends (e.g. /trends blog)"},
        {"command": "forecast", "description": "7-day cost forecast with trend"},
        {"command": "leaderboard", "description": "Repo rankings by items completed"},
        {"command": "summary", "description": "Compact system-wide summary"},
        {"command": "help", "description": "Show all available commands"},
        {"command": "app", "description": "Open the Swarm Town Mini App"},
    ])
    if result.get("ok"):
        print("   Done! 20 commands registered")

    # 3. Set bot description
    print("3. Setting bot description...")
    result = api("setMyDescription",
        description="Swarm Town - Autonomous Multi-Repo Coding Orchestrator. Manages 19+ repos with AI agents, tracks issues/features, and pushes to GitHub automatically."
    )
    if result.get("ok"):
        print("   Done!")

    # 4. Set bot short description
    print("4. Setting short description...")
    result = api("setMyShortDescription",
        short_description="AI-powered multi-repo coding orchestrator"
    )
    if result.get("ok"):
        print("   Done!")

    print()
    print("Setup complete!")
    print(f"  Open Telegram and tap the menu button to launch Swarm Town")
    print(f"  Or send /app to get a link")
    print()
    print("To update the URL later (e.g. new ngrok URL), just run this script again.")

if __name__ == "__main__":
    main()
