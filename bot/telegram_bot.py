"""
Swarm Town — Telegram Bot (Two-Way Communication)
===================================================
Controls the orchestrator from Telegram. Sends notifications on state changes,
receives commands, handles voice messages for the audio pipeline.

Uses raw Telegram Bot API (no extra dependencies beyond requests/urllib).
"""

import json
import os
import sys
import time
import threading
import logging
import tempfile
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from datetime import datetime, timedelta, timezone

log = logging.getLogger("swarm.telegram")

# ─── Config ──────────────────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"
_port = os.environ.get("AGENT_API_PORT", "6969")
ORCH_URL = os.environ.get("PUBLIC_URL") or os.environ.get("NGROK_URL") or f"http://localhost:{_port}"
AUDIO_DIR = os.environ.get("AGENT_AUDIO_DIR", os.path.expanduser("~/swarm-audio"))

# Bridge paths — matches orchestrator.py layout
BRIDGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bridge")
BRIDGE_INBOX = os.path.join(BRIDGE_DIR, "inbox.jsonl")
BRIDGE_OUTBOX = os.path.join(BRIDGE_DIR, "outbox.jsonl")

os.makedirs(BRIDGE_DIR, exist_ok=True)

# Rate limiting
_last_send = 0
_SEND_INTERVAL = 1.0  # min 1 second between sends

# ─── Message Batching ────────────────────────────────────────────────────────

_message_buffer = []
_buffer_lock = threading.Lock()
_buffer_timer = None
_BUFFER_INTERVAL = 60  # seconds between flushes


def queue_message(text):
    """Add a message to the buffer instead of sending immediately.

    Messages are collected for up to 60 seconds, then flushed as one
    combined message. Use send_message() directly for critical alerts
    that must go out immediately.
    """
    global _buffer_timer
    with _buffer_lock:
        _message_buffer.append(text)
        # Start the flush timer if it is not already running
        if _buffer_timer is None or not _buffer_timer.is_alive():
            _buffer_timer = threading.Timer(_BUFFER_INTERVAL, _flush_buffer)
            _buffer_timer.daemon = True
            _buffer_timer.start()
    log.debug("Message queued (%d in buffer)", len(_message_buffer))


def _flush_buffer():
    """Flush all buffered messages as a single combined send.

    Runs on a daemon Timer thread every 60 seconds while the buffer
    contains messages.
    """
    global _buffer_timer
    with _buffer_lock:
        if not _message_buffer:
            _buffer_timer = None
            return
        combined = "\n---\n".join(_message_buffer)
        _message_buffer.clear()
        _buffer_timer = None

    # Send outside the lock so we don't block new queue_message() calls
    if combined:
        log.info("Flushing %d buffered messages", combined.count("\n---\n") + 1)
        send_message(combined)


# ─── Telegram API Helpers ────────────────────────────────────────────────────

def _api(method, data=None, files=None):
    """Call Telegram Bot API. Returns parsed JSON or None on error."""
    url = f"{API_BASE}/{method}"
    try:
        if files:
            # Multipart upload for photos
            import mimetypes
            boundary = "----SwarmTownBoundary"
            body = b""
            for key, val in (data or {}).items():
                body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{val}\r\n".encode()
            for key, (fname, fdata, ftype) in files.items():
                body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; filename=\"{fname}\"\r\nContent-Type: {ftype}\r\n\r\n".encode()
                body += fdata + b"\r\n"
            body += f"--{boundary}--\r\n".encode()
            req = Request(url, data=body)
            req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        elif data:
            req = Request(url, data=json.dumps(data).encode(),
                         headers={"Content-Type": "application/json"})
        else:
            req = Request(url)
        resp = urlopen(req, timeout=30)
        return json.loads(resp.read())
    except Exception as e:
        log.error(f"Telegram API error ({method}): {e}")
        return None


def send_message(text, chat_id=None, parse_mode="Markdown"):
    """Send a text message. Rate-limited to 1/sec."""
    global _last_send
    now = time.time()
    wait = _SEND_INTERVAL - (now - _last_send)
    if wait > 0:
        time.sleep(wait)
    _last_send = time.time()

    result = _api("sendMessage", {
        "chat_id": chat_id or CHAT_ID,
        "text": text[:4096],
        "parse_mode": parse_mode,
    })
    if not result or not result.get("ok"):
        # Retry without parse_mode in case markdown is malformed
        result = _api("sendMessage", {
            "chat_id": chat_id or CHAT_ID,
            "text": text[:4096],
        })
    return result


def send_photo(photo_path, caption="", chat_id=None):
    """Send a photo file."""
    global _last_send
    now = time.time()
    wait = _SEND_INTERVAL - (now - _last_send)
    if wait > 0:
        time.sleep(wait)
    _last_send = time.time()

    with open(photo_path, "rb") as f:
        photo_data = f.read()
    return _api("sendPhoto", {"chat_id": chat_id or CHAT_ID, "caption": caption[:1024]},
                files={"photo": ("screenshot.png", photo_data, "image/png")})


def get_updates(offset=0, timeout=30):
    """Long-poll for new messages."""
    result = _api("getUpdates", {"offset": offset, "timeout": timeout})
    if result and result.get("ok"):
        return result.get("result", [])
    return []


def get_file(file_id):
    """Get file path from Telegram servers."""
    result = _api("getFile", {"file_id": file_id})
    if result and result.get("ok"):
        fp = result["result"]["file_path"]
        return f"https://api.telegram.org/file/bot{BOT_TOKEN}/{fp}"
    return None


# ─── Screenshot ──────────────────────────────────────────────────────────────

def take_screenshot(url=None, output_path=None):
    """Take a screenshot of the dashboard using Playwright."""
    url = url or ORCH_URL
    output_path = output_path or os.path.join(tempfile.gettempdir(), "dashboard_screenshot.png")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1400, "height": 900})
            page.goto(url, wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(3000)  # Wait for data to load
            page.screenshot(path=output_path, full_page=False)
            browser.close()
        return output_path
    except Exception as e:
        log.error(f"Screenshot failed: {e}")
        return None


# ─── Orchestrator API Helpers ────────────────────────────────────────────────

_cached_token = ""
_cached_token_ts = 0
_TOKEN_TTL = 300  # 5 minutes


def _fetch_api_token():
    """Fetch the Bearer token from the orchestrator's /api/token endpoint.

    Cached for 5 minutes to avoid hitting the endpoint on every API call.
    """
    global _cached_token, _cached_token_ts
    now = time.time()
    if _cached_token and (now - _cached_token_ts) < _TOKEN_TTL:
        return _cached_token
    try:
        resp = urlopen(f"{ORCH_URL}/api/token", timeout=5)
        data = json.loads(resp.read())
        _cached_token = data.get("token", "")
        _cached_token_ts = now
        return _cached_token
    except Exception as e:
        log.error("Failed to fetch API token: %s", e)
        return _cached_token or ""


def _invalidate_token():
    """Clear the cached token so the next request re-fetches it."""
    global _cached_token, _cached_token_ts
    _cached_token = ""
    _cached_token_ts = 0


def _orch_get(path):
    """GET from orchestrator API."""
    try:
        token = _fetch_api_token()
        req = Request(f"{ORCH_URL}{path}")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        resp = urlopen(req, timeout=5)
        return json.loads(resp.read())
    except HTTPError as e:
        if e.code == 401:
            _invalidate_token()
            log.warning("Got 401 from orchestrator — token invalidated, will re-fetch")
        return {"error": str(e)}
    except URLError as e:
        log.warning("Orchestrator unreachable: %s", e.reason)
        return {"error": f"Orchestrator unreachable: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


def _orch_post(path, data):
    """POST to orchestrator API."""
    try:
        token = _fetch_api_token()
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = Request(f"{ORCH_URL}{path}", data=json.dumps(data).encode(),
                     headers=headers)
        resp = urlopen(req, timeout=10)
        return json.loads(resp.read())
    except HTTPError as e:
        if e.code == 401:
            _invalidate_token()
            log.warning("Got 401 from orchestrator — token invalidated, will re-fetch")
        return {"error": str(e)}
    except URLError as e:
        log.warning("Orchestrator unreachable: %s", e.reason)
        return {"error": f"Orchestrator unreachable: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


def _find_repo(name):
    """Find a repo by name (case-insensitive partial match)."""
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return None
    name_lower = name.strip().lower()
    for r in repos:
        if r["name"].lower() == name_lower:
            return r
    for r in repos:
        if name_lower in r["name"].lower():
            return r
    return None


# ─── Command Handlers ────────────────────────────────────────────────────────

def _progress_bar(done, total, width=10):
    """Generate a Unicode progress bar."""
    if total <= 0:
        return "░" * width
    filled = int((done / total) * width)
    return "█" * filled + "░" * (width - filled)


def cmd_status():
    """Return status of all repos with progress bars."""
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return f"Error: {repos['error']}"
    if not repos:
        return "No repos registered."

    # Get uptime from /api/status
    status_data = _orch_get("/api/status")
    uptime = ""
    if isinstance(status_data, dict):
        uptime = status_data.get("uptime", "")

    running_count = sum(1 for r in repos if r.get("running"))
    paused_count = sum(1 for r in repos if r.get("paused"))

    lines = [f"*Swarm Town Status* ({len(repos)} repos)"]
    if uptime:
        lines.append(f"Uptime: {uptime} | Running: {running_count} | Paused: {paused_count}")
    lines.append("")

    for r in repos:
        state = r.get("state", "idle")
        stats = r.get("stats", {})
        items_done = stats.get("items_done", 0)
        items_total = stats.get("items_total", 0)
        steps_done = stats.get("steps_done", 0)
        steps_total = stats.get("steps_total", 0)
        agents = r.get("active_agents", 0)
        cycles = r.get("cycle_count", 0)
        paused = r.get("paused", False)

        status_emoji = {
            "idle": "💤", "execute_step": "⚡", "test_step": "🧪",
            "do_refactor": "🔧", "credits_exhausted": "💳", "error": "💀",
            "update_plan": "📐", "scan_repo": "🔍", "final_optimize": "🚀",
        }.get(state, "🔄")

        state_label = state.replace("_", " ")
        if paused:
            state_label = "PAUSED"
            status_emoji = "⏸️"

        lines.append(f"{status_emoji} *{r['name']}* `{state_label}`")

        # Items progress bar
        items_bar = _progress_bar(items_done, items_total)
        items_pct = f"{int(items_done/items_total*100)}%" if items_total > 0 else "0%"
        lines.append(f"  Items: {items_bar} {items_done}/{items_total} ({items_pct})")

        # Steps progress bar
        steps_bar = _progress_bar(steps_done, steps_total)
        steps_pct = f"{int(steps_done/steps_total*100)}%" if steps_total > 0 else "0%"
        lines.append(f"  Steps: {steps_bar} {steps_done}/{steps_total} ({steps_pct})")

        extra = []
        if agents:
            extra.append(f"{agents} agents")
        if cycles:
            extra.append(f"{cycles} cycles")
        if extra:
            lines.append(f"  {' | '.join(extra)}")
        lines.append("")

    return "\n".join(lines)


def cmd_start_all():
    result = _orch_post("/api/start", {"repo_id": "all"})
    return f"Started all repos: {json.dumps(result, indent=2)}"


def cmd_stop_all():
    _orch_post("/api/stop", {"repo_id": "all"})
    return "Stopped all repos."


def cmd_start_repo(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/start", {"repo_id": repo["id"]})
    return f"Started *{repo['name']}*: {result.get('ok', False)}"


def cmd_stop_repo(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/stop", {"repo_id": repo["id"]})
    return f"Stopped *{repo['name']}*: {result.get('ok', False)}"


def cmd_pause_repo(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/pause", {"repo_id": repo["id"]})
    return f"Paused *{repo['name']}*: {result.get('ok', False)}"


def cmd_resume_repo(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/resume", {"repo_id": repo["id"]})
    return f"Resumed *{repo['name']}*: {result.get('ok', False)}"


def cmd_screenshot():
    path = take_screenshot()
    if path and os.path.exists(path):
        send_photo(path, caption="Dashboard screenshot")
        return None  # Photo already sent
    return "Screenshot failed. Is the dashboard running?"


def cmd_add_item(type_, text):
    """Parse 'repo-name: title - description' and add item."""
    parts = text.split(":", 1)
    if len(parts) < 2:
        return f"Format: add {type_} repo-name: title - description"
    repo = _find_repo(parts[0].strip())
    if not repo:
        return f"Repo '{parts[0].strip()}' not found."
    rest = parts[1].strip()
    if " - " in rest:
        title, desc = rest.split(" - ", 1)
    else:
        title, desc = rest, rest
    result = _orch_post("/api/items", {
        "repo_id": repo["id"], "type": type_,
        "title": title.strip(), "description": desc.strip(),
        "priority": "medium", "source": "telegram",
    })
    return f"Added {type_} to *{repo['name']}*: {title.strip()}"


def cmd_push(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/push", {"repo_id": repo["id"], "message": "push via telegram"})
    ok = result.get("success", False)
    return f"Push *{repo['name']}*: {'success' if ok else 'failed'}"


def cmd_logs(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    logs = _orch_get(f"/api/logs?repo_id={repo['id']}")
    if not logs or (isinstance(logs, dict) and "error" in logs):
        return f"No logs for {repo['name']}."
    lines = [f"*Last 5 logs for {repo['name']}:*\n"]
    for l in logs[:5]:
        lines.append(f"[{l.get('state','')}] {l.get('action','')} — {l.get('result','')[:80]}")
    return "\n".join(lines)


def cmd_mistakes(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    mk = _orch_get(f"/api/mistakes?repo_id={repo['id']}")
    if not mk or (isinstance(mk, dict) and "error" in mk):
        return f"No mistakes for {repo['name']}."
    lines = [f"*Last 5 mistakes for {repo['name']}:*\n"]
    for m in mk[:5]:
        lines.append(f"[{m.get('error_type','')}] {m.get('description','')[:100]}")
    return "\n".join(lines)


def cmd_memory(name):
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    mem = _orch_get(f"/api/memory?repo_id={repo['id']}")
    if not mem or (isinstance(mem, dict) and "error" in mem):
        return f"No memory for {repo['name']}."
    lines = [f"*Last 5 memory entries for {repo['name']}:*\n"]
    for m in mem[:5]:
        lines.append(f"[{m.get('namespace','')}] {m.get('key','')}: {str(m.get('value',''))[:80]}")
    return "\n".join(lines)


def cmd_repos():
    """List all registered repos with their IDs."""
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return f"Error: {repos['error']}"
    if not repos:
        return "No repos registered."
    lines = ["*Registered Repos:*\n"]
    for r in repos:
        state = r.get("state", "idle")
        running = "running" if r.get("running") else "stopped"
        lines.append(f"  `{r['id']}` *{r['name']}* [{state}] ({running})")
    return "\n".join(lines)


def cmd_add_repo(text):
    """Parse 'name: /path/to/repo' and register a new repo."""
    parts = text.split(":", 1)
    if len(parts) < 2:
        return "Format: `add repo name: /path/to/repo`"
    name = parts[0].strip()
    path = parts[1].strip()
    if not name or not path:
        return "Both name and path are required."
    result = _orch_post("/api/repos", {
        "name": name, "path": path, "branch": "main"
    })
    if result.get("ok"):
        return f"Added *{name}* to Swarm Town."
    return f"Failed: {result.get('error', 'unknown error')}"


def cmd_remove_repo(name):
    """Remove a repo from the orchestrator (files kept on disk)."""
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/repos/delete", {"repo_id": repo["id"]})
    if result.get("ok"):
        return f"Removed *{repo['name']}* from Swarm Town (files on disk kept)."
    return f"Failed to remove: {result.get('error', 'unknown error')}"


def cmd_digest():
    """Fetch the daily digest from the orchestrator and return it."""
    data = _orch_get("/api/digest")
    if isinstance(data, dict) and "error" in data:
        return f"Error fetching digest: {data['error']}"
    digest = data.get("digest", "")
    if not digest:
        return "Daily digest is empty — no data available."
    return f"*Daily Digest*\n\n{digest}"


def cmd_costs():
    """Fetch cost data from the orchestrator and format it."""
    data = _orch_get("/api/costs")
    if isinstance(data, dict) and "error" in data:
        return f"Error fetching costs: {data['error']}"
    costs = data.get("costs", {})
    total = data.get("total", 0)
    if not costs:
        return "*API Costs*\n\nNo cost data available."
    lines = ["*API Costs*\n"]
    for repo, cost in sorted(costs.items()):
        lines.append(f"  `{repo}`: ${cost:.4f}")
    lines.append(f"\n*Total: ${total:.4f}*")
    return "\n".join(lines)


def cmd_help():
    return """*Swarm Town Commands:*

`status` — All repo states and stats
`start all` — Launch all repos
`stop all` — Stop everything
`start [repo]` — Start specific repo
`stop [repo]` — Stop specific repo
`pause [repo]` — Pause (keeps thread alive)
`resume [repo]` — Resume paused repo
`screenshot` / `show me` — Dashboard photo
`add feature repo: title - desc` — Add feature
`add issue repo: title - desc` — Add issue
`repos` / `list` — List all registered repos
`add repo name: /path` — Register new repo
`push [repo]` — Git push
`logs [repo]` — Last 5 log entries
`mistakes [repo]` — Last 5 mistakes
`memory [repo]` — Last 5 memory entries
`remove [repo]` — Remove repo (keeps files)
`digest` — Daily digest summary
`costs` — Per-repo API costs
`help` — This message

Send a voice message to queue audio for transcription."""


# ─── Chat Bridge (Telegram → inbox.jsonl → Claude Code) ──────────────────────

_bridge_lock = threading.Lock()


def bridge_append_inbox(text: str):
    """Append a user message to bridge/inbox.jsonl.

    Uses the same JSON schema as orchestrator.bridge_write_inbox so that
    Claude Code sessions pick it up identically regardless of entry point.
    """
    entry = {
        "text": text,
        "source": "telegram",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    with _bridge_lock:
        with open(BRIDGE_INBOX, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    log.info("Bridge inbox: wrote %d chars from telegram", len(text))


def bridge_poll_outbox(last_ts: str = None) -> list:
    """Read new entries from bridge/outbox.jsonl after *last_ts*.

    Returns a list of dicts with keys: text, source, ts.
    """
    if not os.path.exists(BRIDGE_OUTBOX):
        return []
    entries = []
    with _bridge_lock:
        with open(BRIDGE_OUTBOX, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if last_ts and entry.get("ts", "") <= last_ts:
                        continue
                    entries.append(entry)
                except json.JSONDecodeError:
                    continue
    return entries


# ─── Message Router ──────────────────────────────────────────────────────────

def handle_message(msg):
    """Route an incoming Telegram message to the right handler."""
    chat_id = str(msg.get("chat", {}).get("id", ""))

    # Security: only respond to allowed chat
    if chat_id != str(CHAT_ID):
        log.warning(f"Ignoring message from unknown chat: {chat_id}")
        return

    # Handle web_app_data from Telegram Mini App
    web_app_data = msg.get("web_app_data")
    if web_app_data:
        try:
            data = json.loads(web_app_data.get("data", "{}"))
            action = data.get("action", "")
            if action == "start_repo":
                reply = cmd_start_repo(data.get("repo", ""))
            elif action == "stop_repo":
                reply = cmd_stop_repo(data.get("repo", ""))
            elif action == "start_all":
                reply = cmd_start_all()
            elif action == "stop_all":
                reply = cmd_stop_all()
            elif action == "add_item":
                reply = cmd_add_item(data.get("type", "feature"), data.get("title", ""))
            else:
                reply = f"Mini App action: {action}"
            if reply:
                send_message(reply, chat_id=chat_id)
        except Exception as e:
            log.error("web_app_data error: %s", e)
        return

    # Handle voice messages
    voice = msg.get("voice") or msg.get("audio")
    if voice:
        return handle_voice(msg, voice)

    text = msg.get("text", "").strip()
    if not text:
        return

    t = text.lower()

    if t == "status":
        reply = cmd_status()
    elif t == "start all":
        reply = cmd_start_all()
    elif t == "stop all":
        reply = cmd_stop_all()
    elif t.startswith("start "):
        reply = cmd_start_repo(t[6:])
    elif t.startswith("stop "):
        reply = cmd_stop_repo(t[5:])
    elif t.startswith("pause "):
        reply = cmd_pause_repo(t[6:])
    elif t.startswith("resume "):
        reply = cmd_resume_repo(t[7:])
    elif t in ("screenshot", "show me"):
        reply = cmd_screenshot()
    elif t.startswith("add feature "):
        reply = cmd_add_item("feature", text[12:])
    elif t.startswith("add issue "):
        reply = cmd_add_item("issue", text[10:])
    elif t.startswith("push "):
        reply = cmd_push(t[5:])
    elif t.startswith("logs "):
        reply = cmd_logs(t[5:])
    elif t.startswith("mistakes "):
        reply = cmd_mistakes(t[9:])
    elif t.startswith("memory "):
        reply = cmd_memory(t[7:])
    elif t == "repos" or t == "list":
        reply = cmd_repos()
    elif t.startswith("add repo "):
        reply = cmd_add_repo(text[9:])  # use original case
    elif t.startswith("remove "):
        reply = cmd_remove_repo(t[7:])
    elif t == "digest":
        reply = cmd_digest()
    elif t == "costs":
        reply = cmd_costs()
    elif t == "help":
        reply = cmd_help()
    elif t in ("app", "dashboard", "open"):
        public_url = os.environ.get("PUBLIC_URL", "http://localhost:6969")
        reply = f"Open the Swarm Town dashboard:\n{public_url}/telegram-app"
    else:
        # Not a known command — forward to the bridge inbox so Claude Code
        # sessions can read it as a user instruction.
        bridge_append_inbox(text)
        reply = "Message forwarded to Claude Code bridge."

    if reply:
        send_message(reply, chat_id=chat_id)


def handle_voice(msg, voice):
    """Download voice message and queue for transcription."""
    chat_id = str(msg.get("chat", {}).get("id", ""))
    file_id = voice.get("file_id")
    if not file_id:
        send_message("Could not process voice message.", chat_id=chat_id)
        return

    # Download the file
    file_url = get_file(file_id)
    if not file_url:
        send_message("Could not download voice message.", chat_id=chat_id)
        return

    try:
        resp = urlopen(file_url, timeout=30)
        audio_data = resp.read()
    except Exception as e:
        send_message(f"Download failed: {e}", chat_id=chat_id)
        return

    # Determine which repo to associate with
    repos = _orch_get("/api/repos")
    active_repo = None
    if isinstance(repos, list):
        # Prefer running repos, otherwise first repo
        for r in repos:
            if r.get("state") not in ("idle", None):
                active_repo = r
                break
        if not active_repo and repos:
            active_repo = repos[0]

    if not active_repo:
        send_message("No repos registered. Add a repo first.", chat_id=chat_id)
        return

    # Save audio file
    ts = int(time.time())
    fname = f"telegram_{active_repo['name']}_{ts}.ogg"
    os.makedirs(AUDIO_DIR, exist_ok=True)
    fpath = os.path.join(AUDIO_DIR, fname)
    with open(fpath, "wb") as f:
        f.write(audio_data)

    # POST to orchestrator
    import base64
    _orch_post("/api/audio", {
        "repo_id": active_repo["id"],
        "filename": fname,
        "audio_data": base64.b64encode(audio_data).decode(),
    })

    # Try inline Whisper transcription for the bridge
    transcript = None
    try:
        import whisper as _whisper
        _model = _whisper.load_model("base")
        result = _model.transcribe(fpath)
        transcript = result.get("text", "").strip()
        if transcript:
            bridge_append_inbox(transcript)
            send_message(
                f"🎤 *{active_repo['name']}* -- Voice transcribed:\n\n_{transcript}_\n\nForwarded to Claude Code bridge.",
                chat_id=chat_id,
            )
        else:
            send_message(
                f"🎤 Audio received for *{active_repo['name']}*. Transcription was empty.",
                chat_id=chat_id,
            )
    except ImportError:
        send_message(
            f"🎤 Audio received for *{active_repo['name']}*. Queued for Whisper transcription (whisper not installed locally).",
            chat_id=chat_id,
        )
    except Exception as e:
        log.error("Whisper transcription failed: %s", e)
        send_message(
            f"🎤 Audio saved for *{active_repo['name']}*. Transcription error: {e}",
            chat_id=chat_id,
        )


# ─── Notification Functions (called from orchestrator) ───────────────────────

def notify_state_change(repo_name, old_state, new_state):
    """Notify on state transition."""
    desc = {
        "idle": "Waiting for items",
        "check_audio": "Checking for audio reviews",
        "transcribe_audio": "Transcribing audio",
        "parse_audio_items": "Parsing items from audio",
        "check_refactor": "Checking if refactor needed",
        "do_refactor": "Refactoring codebase",
        "check_new_items": "Checking for new items",
        "update_plan": "Generating build plan",
        "check_plan_complete": "Checking plan completion",
        "execute_step": "Executing build step",
        "test_step": "Running tests",
        "check_steps_left": "Checking remaining steps",
        "check_more_items": "Checking for more items",
        "final_optimize": "Final optimization pass",
        "scan_repo": "Scanning full repo",
        "credits_exhausted": "Credits exhausted — waiting",
        "error": "Error state",
    }.get(new_state, new_state)
    send_message(f"🔄 *{repo_name}* → {new_state} — {desc}")


def notify_cycle_complete(repo_name, cycle_num, items_done):
    send_message(f"🎉 *{repo_name}* completed cycle #{cycle_num} — {items_done} items done")


def notify_credits_exhausted(repo_name):
    send_message(f"💳 Credits exhausted for *{repo_name}*. Will auto-resume when back.")


def notify_credits_restored(repo_name, resume_state):
    send_message(f"✅ Credits restored! Resuming *{repo_name}* from {resume_state}")


def notify_error(repo_name, error_msg):
    send_message(f"💀 Error in *{repo_name}*: {error_msg[:500]}")


# ─── Daily Digest ─────────────────────────────────────────────────────────────

def send_daily_digest():
    """Build and send a comprehensive daily summary of all repos.

    Includes per-repo state, items completed / total, steps completed / total,
    active agents, cycle count, health score, and recent mistakes. The message
    is sent immediately (not batched) so it always arrives as a single digest.
    """
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        send_message(f"*Daily Digest*\n\nCould not reach orchestrator: {repos['error']}")
        return
    if not repos:
        send_message("*Daily Digest*\n\nNo repos registered.")
        return

    now = datetime.now()
    lines = [
        f"*Daily Digest — {now.strftime('%A, %B %d %Y %I:%M %p')}*",
        f"Repos tracked: {len(repos)}",
        "",
    ]

    total_items_done = 0
    total_items_all = 0
    total_steps_done = 0
    total_steps_all = 0
    state_counts = {}

    for r in repos:
        name = r.get("name", "unknown")
        state = r.get("state", "idle")
        stats = r.get("stats", {})
        items_done = stats.get("items_done", 0)
        items_total = stats.get("items_total", 0)
        steps_done = stats.get("steps_done", 0)
        steps_total = stats.get("steps_total", 0)
        agents = r.get("active_agents", 0)
        cycles = r.get("cycle_count", 0)
        health = r.get("health_score", None)
        errors = stats.get("errors", 0)

        total_items_done += items_done
        total_items_all += items_total
        total_steps_done += steps_done
        total_steps_all += steps_total
        state_counts[state] = state_counts.get(state, 0) + 1

        status_emoji = {
            "idle": "💤", "execute_step": "⚡", "test_step": "🧪",
            "do_refactor": "🔧", "credits_exhausted": "💳", "error": "💀",
        }.get(state, "🔄")

        health_str = f" | Health: {health}" if health is not None else ""
        error_str = f" | Errors: {errors}" if errors else ""

        lines.append(f"{status_emoji} *{name}* [{state}]")
        lines.append(
            f"  Items: {items_done}/{items_total} | "
            f"Steps: {steps_done}/{steps_total}"
        )
        lines.append(
            f"  Agents: {agents} | Cycles: {cycles}{health_str}{error_str}"
        )

        # Append last mistake if available
        mk = _orch_get(f"/api/mistakes?repo_id={r['id']}")
        if isinstance(mk, list) and mk:
            last = mk[0]
            lines.append(
                f"  Last mistake: [{last.get('error_type', '')}] "
                f"{last.get('description', '')[:80]}"
            )
        lines.append("")

    # ── Aggregate summary ─────────────────────────────────────────────────
    lines.append("*— Aggregate —*")
    lines.append(f"Total items done: {total_items_done}/{total_items_all}")
    lines.append(f"Total steps done: {total_steps_done}/{total_steps_all}")
    state_summary = ", ".join(f"{s}: {c}" for s, c in sorted(state_counts.items()))
    lines.append(f"States: {state_summary}")

    digest_text = "\n".join(lines)

    # Telegram messages max out at 4096 characters; send_message already
    # truncates, but log a warning if we are close.
    if len(digest_text) > 4000:
        log.warning("Daily digest is %d chars — may be truncated", len(digest_text))

    send_message(digest_text)
    log.info("Daily digest sent (%d chars)", len(digest_text))


# ─── Polling Loop ────────────────────────────────────────────────────────────

class TelegramBot:
    """Runs the Telegram bot in a background thread."""

    def __init__(self):
        self.running = False
        self.thread = None
        self.offset = 0
        self._digest_timer = None
        self._outbox_thread = None
        self._outbox_last_ts = None  # track last-seen outbox timestamp

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._poll_loop, name="telegram-bot", daemon=True)
        self.thread.start()
        self._outbox_thread = threading.Thread(target=self._outbox_loop, name="telegram-outbox", daemon=True)
        self._outbox_thread.start()
        log.info("Telegram bot started (polling + outbox watcher)")

    def stop(self):
        self.running = False
        if self._digest_timer is not None:
            self._digest_timer.cancel()
            self._digest_timer = None

    def start_digest_timer(self, hour=8, minute=0):
        """Schedule the daily digest to fire at *hour*:*minute* local time.

        Uses `threading.Timer` with the number of seconds until the next
        occurrence of the target time. After each digest is sent the timer
        automatically reschedules itself for the following day.

        Args:
            hour:   Hour of day in 24-h format (default 8 = 8:00 AM).
            minute: Minute of hour (default 0).
        """
        self._digest_hour = hour
        self._digest_minute = minute
        self._schedule_next_digest()
        log.info(
            "Daily digest timer started — next digest at %02d:%02d local time",
            hour, minute,
        )

    def _schedule_next_digest(self):
        """Compute seconds until the next target time and arm the timer."""
        now = datetime.now()
        target = now.replace(hour=self._digest_hour, minute=self._digest_minute,
                             second=0, microsecond=0)
        if target <= now:
            # Target time already passed today; schedule for tomorrow
            target += timedelta(days=1)

        delay_seconds = (target - now).total_seconds()
        log.info(
            "Next daily digest in %.0f seconds (%s)",
            delay_seconds, target.strftime("%Y-%m-%d %H:%M"),
        )
        self._digest_timer = threading.Timer(delay_seconds, self._fire_digest)
        self._digest_timer.daemon = True
        self._digest_timer.start()

    def _fire_digest(self):
        """Called by the timer — sends the digest then reschedules."""
        if not self.running:
            return
        try:
            send_daily_digest()
        except Exception as e:
            log.error("Daily digest failed: %s", e)
        # Reschedule for tomorrow
        if self.running:
            self._schedule_next_digest()

    def _poll_loop(self):
        """Long-poll for updates from Telegram."""
        log.info(f"Telegram bot polling (chat_id={CHAT_ID})")
        while self.running:
            try:
                updates = get_updates(offset=self.offset, timeout=30)
                for update in updates:
                    self.offset = update["update_id"] + 1
                    msg = update.get("message")
                    if msg:
                        handle_message(msg)
            except Exception as e:
                log.error(f"Telegram poll error: {e}")
                time.sleep(5)

    def _outbox_loop(self):
        """Watch bridge/outbox.jsonl and forward new entries to Telegram."""
        log.info("Outbox watcher started")
        # Initialise last_ts to "now" so we only send messages written after
        # the bot starts, not the entire backlog.
        self._outbox_last_ts = datetime.now(timezone.utc).isoformat()
        while self.running:
            try:
                entries = bridge_poll_outbox(last_ts=self._outbox_last_ts)
                for entry in entries:
                    text = entry.get("text", "")
                    source = entry.get("source", "unknown")
                    if text:
                        send_message(f"[{source}] {text}")
                    self._outbox_last_ts = entry.get("ts", self._outbox_last_ts)
            except Exception as e:
                log.error(f"Outbox watcher error: {e}")
            time.sleep(3)  # check every 3 seconds


# Global bot instance
bot = TelegramBot()


# ─── Entry point for standalone testing ──────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler()],
    )
    print("Telegram bot starting in standalone mode...")
    print(f"  Bot token: {BOT_TOKEN[:20]}...")
    print(f"  Chat ID: {CHAT_ID}")
    print(f"  Orchestrator: {ORCH_URL}")

    # Send startup message
    send_message("🏜️ Swarm Town Telegram bot started (standalone mode). Send `help` for commands.")

    # Start polling
    bot.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        bot.stop()
        print("\nBot stopped.")
