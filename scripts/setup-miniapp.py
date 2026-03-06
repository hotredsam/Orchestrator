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

    # 2. Set bot commands (Telegram max: 100)
    print("2. Setting bot commands...")
    commands = [
        # ── Core Control ──
        {"command": "status", "description": "Show all repos with progress bars"},
        {"command": "start_all", "description": "Start all repo orchestrators"},
        {"command": "stop_all", "description": "Stop all repo orchestrators"},
        {"command": "start", "description": "Start a specific repo (e.g. /start blog)"},
        {"command": "stop", "description": "Stop a specific repo (e.g. /stop blog)"},
        {"command": "pause", "description": "Pause a repo (e.g. /pause blog)"},
        {"command": "resume", "description": "Resume a paused repo"},
        {"command": "pause_all", "description": "Pause all running repos"},
        {"command": "resume_all", "description": "Resume all paused repos"},
        {"command": "drain", "description": "Toggle drain mode (finish current, no new)"},
        # ── Repos ──
        {"command": "repos", "description": "List all registered repos"},
        {"command": "add_repo", "description": "Register a repo (name|path|url|branch)"},
        {"command": "clone", "description": "Clone and register a GitHub repo"},
        {"command": "remove_repo", "description": "Remove a repo (e.g. /remove_repo blog)"},
        {"command": "rename", "description": "Rename a repo (e.g. /rename old|new)"},
        {"command": "push", "description": "Git push a repo (e.g. /push blog)"},
        {"command": "git_status", "description": "Show git status for a repo"},
        # ── Items & Plans ──
        {"command": "items", "description": "List items for a repo (e.g. /items blog)"},
        {"command": "plan", "description": "Show plan steps (e.g. /plan blog)"},
        {"command": "done", "description": "Mark item complete (e.g. /done 42)"},
        {"command": "retry", "description": "Re-queue completed items (e.g. /retry blog)"},
        {"command": "retry_all", "description": "Re-queue all completed items"},
        {"command": "pick", "description": "Start working on a specific item"},
        {"command": "deps", "description": "Show item dependencies"},
        {"command": "batch", "description": "Batch start/stop/pause repos"},
        # ── Analytics ──
        {"command": "costs", "description": "Show per-repo API costs and total"},
        {"command": "budget", "description": "View or set API budget limit"},
        {"command": "metrics", "description": "API request and latency stats"},
        {"command": "trends", "description": "7-day performance trends"},
        {"command": "forecast", "description": "7-day cost forecast with trend"},
        {"command": "compare", "description": "Side-by-side repo comparison"},
        {"command": "compare_costs", "description": "Compare costs across repos"},
        {"command": "cost_history", "description": "Cost history over time"},
        {"command": "cost_rank", "description": "Rank repos by cost"},
        {"command": "cost_alert", "description": "Set cost alert threshold"},
        {"command": "throughput", "description": "Items completed per hour"},
        {"command": "velocity", "description": "Team velocity metrics"},
        {"command": "efficiency", "description": "Cost per completed item"},
        {"command": "roi", "description": "Return on investment per repo"},
        # ── Status & Info ──
        {"command": "health", "description": "Health scan all repos"},
        {"command": "health_scores", "description": "Detailed health scores"},
        {"command": "digest", "description": "Show the daily digest summary"},
        {"command": "daily", "description": "Daily stats digest"},
        {"command": "summary", "description": "Compact system-wide summary"},
        {"command": "overview", "description": "Quick system overview"},
        {"command": "leaderboard", "description": "Repo rankings by items completed"},
        {"command": "hall_of_fame", "description": "All-time top repos"},
        {"command": "uptime", "description": "Server uptime and version"},
        {"command": "uptime_rank", "description": "Rank repos by uptime"},
        {"command": "alive", "description": "Quick liveness check"},
        {"command": "active", "description": "Show only active repos"},
        {"command": "idle", "description": "Show only idle repos"},
        {"command": "stale", "description": "Find repos with no activity"},
        {"command": "stalled", "description": "Find stalled orchestrations"},
        {"command": "pending", "description": "Show pending items"},
        {"command": "eta", "description": "Estimated time to completion"},
        {"command": "progress", "description": "Overall progress percentage"},
        {"command": "wave", "description": "Current development wave"},
        {"command": "streak", "description": "Activity streak stats"},
        # ── Search & Logs ──
        {"command": "logs", "description": "Show recent execution logs"},
        {"command": "mistakes", "description": "Show tracked mistakes"},
        {"command": "memory", "description": "Show stored memories"},
        {"command": "search", "description": "Search across all repos"},
        {"command": "activity", "description": "Recent activity timeline"},
        {"command": "timeline", "description": "Item completion timeline"},
        {"command": "changelog", "description": "Recent changes per repo"},
        {"command": "top_errors", "description": "Most common error types"},
        {"command": "recent_errors", "description": "Latest errors across repos"},
        # ── Agents & Claude ──
        {"command": "agents", "description": "Show agents for a repo"},
        {"command": "agent_stats", "description": "Agent performance stats"},
        {"command": "screenshot", "description": "Capture repo state snapshot"},
        {"command": "snapshot", "description": "Detailed repo snapshot"},
        # ── Config ──
        {"command": "watch", "description": "Watch a repo for changes"},
        {"command": "pin", "description": "Pin/unpin repos"},
        {"command": "focus", "description": "Focus mode - show one repo"},
        {"command": "quiet", "description": "Toggle quiet notifications"},
        {"command": "notify", "description": "Configure notifications"},
        {"command": "schedule", "description": "Schedule operations"},
        {"command": "threshold", "description": "Set alert thresholds"},
        {"command": "tags", "description": "Tag repos for grouping"},
        {"command": "group", "description": "Group repos by tag"},
        {"command": "export", "description": "Export repo data as JSON"},
        {"command": "notes", "description": "View notes for a repo"},
        {"command": "add_note", "description": "Add a note to a repo"},
        {"command": "cleanup", "description": "Clean up old data"},
        # ── Misc ──
        {"command": "top", "description": "Top repos by various metrics"},
        {"command": "queue", "description": "View processing queue"},
        {"command": "backlog", "description": "Show item backlog"},
        {"command": "fastest", "description": "Fastest completing repos"},
        {"command": "slowest", "description": "Slowest completing repos"},
        {"command": "hot", "description": "Most active repos right now"},
        {"command": "diff", "description": "Show recent code diffs"},
        {"command": "impact", "description": "Impact analysis per repo"},
        {"command": "benchmark", "description": "Performance benchmarks"},
        {"command": "capacity", "description": "System capacity info"},
        {"command": "rate", "description": "Completion rate per repo"},
        {"command": "last", "description": "Last completed item per repo"},
        {"command": "emoji", "description": "Random motivational message"},
        {"command": "help", "description": "Show all available commands"},
        {"command": "app", "description": "Open the Swarm Town Mini App"},
    ]
    result = api("setMyCommands", commands=commands)
    if result.get("ok"):
        print(f"   Done! {len(commands)} commands registered")

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
