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
_BUFFER_MAX = 100  # max messages before forced flush

# ─── Notification Preferences ───────────────────────────────────────────────
# Keys: state_changes, completions, errors, credits, digest
_notify_prefs = {
    "state_changes": True,
    "completions": True,
    "errors": True,
    "credits": True,
    "digest": True,
}

# Pinned repo — default repo for commands that require one
_pinned_repo = ""


def queue_message(text):
    """Add a message to the buffer instead of sending immediately.

    Messages are collected for up to 60 seconds, then flushed as one
    combined message. Use send_message() directly for critical alerts
    that must go out immediately.
    """
    global _buffer_timer
    force_flush = False
    with _buffer_lock:
        _message_buffer.append(text)
        if len(_message_buffer) >= _BUFFER_MAX:
            force_flush = True
        # Start the flush timer if it is not already running
        elif _buffer_timer is None or not _buffer_timer.is_alive():
            _buffer_timer = threading.Timer(_BUFFER_INTERVAL, _flush_buffer)
            _buffer_timer.daemon = True
            _buffer_timer.start()
    if force_flush:
        _flush_buffer()
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
    except HTTPError as e:
        if e.code == 429:
            # Rate limited by Telegram — back off
            try:
                err_body = json.loads(e.read())
                retry_after = err_body.get("parameters", {}).get("retry_after", 5)
            except Exception:
                retry_after = 5
            log.warning("Telegram 429 rate limit — sleeping %ds", retry_after)
            time.sleep(retry_after)
            return _api(method, data, files)  # single retry
        log.error(f"Telegram API error ({method}): {e}")
        return None
    except Exception as e:
        log.error(f"Telegram API error ({method}): {e}")
        return None


def send_message(text, chat_id=None, parse_mode="Markdown", reply_markup=None):
    """Send a text message. Rate-limited to 1/sec."""
    global _last_send
    now = time.time()
    wait = _SEND_INTERVAL - (now - _last_send)
    if wait > 0:
        time.sleep(wait)
    _last_send = time.time()

    payload = {
        "chat_id": chat_id or CHAT_ID,
        "text": text[:4096],
        "parse_mode": parse_mode,
    }
    if reply_markup:
        payload["reply_markup"] = json.dumps(reply_markup)
    result = _api("sendMessage", payload)
    if not result or not result.get("ok"):
        # Retry without parse_mode in case markdown is malformed
        payload2 = {"chat_id": chat_id or CHAT_ID, "text": text[:4096]}
        if reply_markup:
            payload2["reply_markup"] = json.dumps(reply_markup)
        result = _api("sendMessage", payload2)
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


def _orch_get(path, retries=2):
    """GET from orchestrator API with retry + backoff."""
    last_err = None
    for attempt in range(retries + 1):
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
            last_err = e
        except URLError as e:
            log.warning("Orchestrator unreachable (attempt %d): %s", attempt + 1, e.reason)
            last_err = e
        except Exception as e:
            last_err = e
        if attempt < retries:
            time.sleep(0.5 * (2 ** attempt))  # 0.5s, 1s backoff
    return {"error": str(last_err)}


def _orch_post(path, data, retries=1):
    """POST to orchestrator API with retry + backoff."""
    last_err = None
    for attempt in range(retries + 1):
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
            last_err = e
        except URLError as e:
            log.warning("Orchestrator unreachable (attempt %d): %s", attempt + 1, e.reason)
            last_err = e
        except Exception as e:
            last_err = e
        if attempt < retries:
            time.sleep(0.5 * (2 ** attempt))
    return {"error": str(last_err)}


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


def _repo_hint(cmd: str) -> str:
    """Return a helpful message listing available repos when none specified."""
    repos = _orch_get("/api/repos") or []
    if isinstance(repos, dict):
        repos = []
    names = [r["name"] for r in repos[:10]]
    hint = f"Usage: `/{cmd} <repo>`"
    if _pinned_repo:
        hint += f"\n\U0001F4CC Pinned: *{_pinned_repo}*"
    if names:
        hint += "\n\nAvailable repos:\n" + "\n".join(f"  \u25B9 `{n}`" for n in names)
        if len(repos) > 10:
            hint += f"\n  _...and {len(repos) - 10} more_"
    return hint


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
    costs_data = _orch_get("/api/costs")
    total_cost = costs_data.get("total", 0) if isinstance(costs_data, dict) else 0

    lines = [f"*Swarm Town Status* ({len(repos)} repos)"]
    header_parts = []
    if uptime:
        header_parts.append(f"\u23F1 {uptime}")
    header_parts.append(f"\U0001F7E2 {running_count} running")
    if paused_count:
        header_parts.append(f"\u23F8 {paused_count} paused")
    if total_cost > 0:
        header_parts.append(f"\U0001F4B0 ${total_cost:.3f}")
    lines.append(" | ".join(header_parts))
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
    if not name:
        return _repo_hint("logs")
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    logs = _orch_get(f"/api/logs?repo_id={repo['id']}")
    if not logs or (isinstance(logs, dict) and "error" in logs):
        return f"No logs for {repo['name']}."

    err_count = sum(1 for l in logs if l.get("error"))
    total_cost = sum(l.get("cost_usd", 0) for l in logs)
    lines = [f"\U0001F4DC *Logs for {repo['name']}* ({len(logs)} entries)"]
    if err_count > 0 or total_cost > 0:
        parts = []
        if err_count > 0:
            parts.append(f"\u26A0\uFE0F {err_count} errors")
        if total_cost > 0:
            parts.append(f"\U0001F4B0 ${total_cost:.3f}")
        lines.append(" | ".join(parts))
    lines.append("")

    for l in logs[:5]:
        state_emoji = "\U0001F534" if l.get("error") else "\U0001F7E2"
        cost_str = f" (${l.get('cost_usd', 0):.3f})" if l.get("cost_usd", 0) > 0 else ""
        dur_str = f" {l.get('duration_sec', 0):.0f}s" if l.get("duration_sec", 0) > 0 else ""
        lines.append(f"{state_emoji} `{l.get('state', '')}`{dur_str}{cost_str}")
        lines.append(f"  {l.get('action', '')} — {l.get('result', '')[:60]}")
    if len(logs) > 5:
        lines.append(f"\n_...and {len(logs) - 5} more_")
    return "\n".join(lines)


def cmd_mistakes(name):
    if not name:
        return _repo_hint("mistakes")
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    mk = _orch_get(f"/api/mistakes?repo_id={repo['id']}")
    if not mk or (isinstance(mk, dict) and "error" in mk):
        return f"No mistakes for {repo['name']}."
    lines = [f"\U0001F480 *Mistakes for {repo['name']}* ({len(mk)} total)\n"]

    # Frequency summary
    type_counts = {}
    for m in mk:
        et = m.get("error_type", "unknown")
        type_counts[et] = type_counts.get(et, 0) + 1
    if type_counts:
        lines.append("*By Type:*")
        for et, count in sorted(type_counts.items(), key=lambda x: -x[1])[:5]:
            bar = _progress_bar(count, len(mk), width=8)
            lines.append(f"  {bar} `{et}` \u00D7{count}")
        lines.append("")

    lines.append("*Recent:*")
    for m in mk[:5]:
        lines.append(f"\u26A0\uFE0F [{m.get('error_type','')}] {m.get('description','')[:80]}")
        if m.get("resolution"):
            lines.append(f"  \u2192 _{m['resolution'][:60]}_")
    return "\n".join(lines)


def cmd_memory(name):
    if not name:
        return _repo_hint("memory")
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    mem = _orch_get(f"/api/memory?repo_id={repo['id']}")
    if not mem or (isinstance(mem, dict) and "error" in mem):
        return f"No memory for {repo['name']}."

    # Group by namespace
    ns_groups = {}
    for m in mem:
        ns = m.get("namespace", "general")
        ns_groups.setdefault(ns, []).append(m)

    lines = [f"\U0001F9E0 *Memory for {repo['name']}* ({len(mem)} entries)\n"]
    if len(ns_groups) > 1:
        ns_summary = ", ".join(f"`{ns}` ({len(items)})" for ns, items in sorted(ns_groups.items(), key=lambda x: -len(x[1])))
        lines.append(f"*Namespaces:* {ns_summary}\n")

    lines.append("*Recent:*")
    for m in mem[:7]:
        ns_tag = f"`{m.get('namespace', '')}` " if m.get("namespace") else ""
        lines.append(f"\U0001F4DD {ns_tag}*{m.get('key', '')}*: {str(m.get('value', ''))[:70]}")
    if len(mem) > 7:
        lines.append(f"\n_...and {len(mem) - 7} more entries_")
    return "\n".join(lines)


def cmd_items(name):
    """List items for a repo."""
    if not name:
        return _repo_hint("items")
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    items = _orch_get(f"/api/items?repo_id={repo['id']}")
    if not items or (isinstance(items, dict) and "error" in items):
        return f"No items for {repo['name']}."

    pending = [i for i in items if i.get("status") == "pending"]
    in_progress = [i for i in items if i.get("status") == "in_progress"]
    completed = [i for i in items if i.get("status") == "completed"]

    lines = [f"*Items for {repo['name']}* ({len(items)} total)\n"]
    lines.append(f"Pending: {len(pending)} | In Progress: {len(in_progress)} | Done: {len(completed)}")
    lines.append(f"{_progress_bar(len(completed), len(items))} {int(len(completed)/len(items)*100) if items else 0}%\n")

    type_emoji = {"issue": "🐛", "feature": "✨"}
    prio_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}
    for item in items[:10]:
        te = type_emoji.get(item.get("type", ""), "📋")
        pe = prio_emoji.get(item.get("priority", ""), "🟡")
        st = item.get("status", "pending")
        st_mark = "✅" if st == "completed" else "⏳" if st == "in_progress" else "○"
        lines.append(f"{st_mark} {te}{pe} {item.get('title', '')[:60]}")

    if len(items) > 10:
        lines.append(f"\n_...and {len(items) - 10} more_")
    return "\n".join(lines)


def cmd_done(arg):
    """Mark an item as completed. Usage: done repo: title"""
    if ":" not in arg:
        return "Usage: `/done repo: item title`\nExample: `/done blog: fix login bug`"
    parts = arg.split(":", 1)
    repo_name = parts[0].strip()
    item_query = parts[1].strip().lower()
    repo = _find_repo(repo_name)
    if not repo:
        return f"Repo '{repo_name}' not found."
    items = _orch_get(f"/api/items?repo_id={repo['id']}")
    if not items or isinstance(items, dict):
        return f"No items found for {repo['name']}."
    # Find matching item by title substring
    match = None
    for it in items:
        if it.get("status") in ("pending", "in_progress") and item_query in (it.get("title", "").lower()):
            match = it
            break
    if not match:
        # Try partial match
        for it in items:
            if it.get("status") in ("pending", "in_progress") and item_query in it.get("title", "").lower():
                match = it
                break
    if not match:
        return f"No pending/in-progress item matching '{item_query}' in {repo['name']}."
    result = _orch_post("/api/items/update", {"repo_id": repo["id"], "item_id": match["id"], "status": "completed"})
    if isinstance(result, dict) and result.get("ok"):
        return f"\u2705 Marked *{match.get('title', '')}* as completed in {repo['name']}."
    return f"Failed to update: {result.get('error', 'unknown')}"


def cmd_plan(name):
    """Show plan steps for a repo."""
    if not name:
        return _repo_hint("plan")
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    steps = _orch_get(f"/api/plan?repo_id={repo['id']}")
    if not steps or (isinstance(steps, dict) and "error" in steps):
        return f"No plan for {repo['name']}."

    completed = sum(1 for s in steps if s.get("status") == "completed")
    pct = int(completed / len(steps) * 100) if steps else 0

    lines = [f"*Plan for {repo['name']}* ({completed}/{len(steps)} done)\n"]
    lines.append(f"{_progress_bar(completed, len(steps))} {pct}%\n")

    for i, s in enumerate(steps[:15]):
        done = s.get("status") == "completed"
        icon = "✅" if done else "⏳"
        agent = f" [{s.get('agent_type', '')}]" if s.get("agent_type") else ""
        lines.append(f"{icon} {i+1}. {s.get('description', '')[:60]}{agent}")

    if len(steps) > 15:
        lines.append(f"\n_...and {len(steps) - 15} more steps_")
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
    # Append quick system stats
    sys_data = _orch_get("/api/system")
    extra = ""
    if isinstance(sys_data, dict) and "repos" in sys_data:
        s = sys_data
        extra = (
            f"\n\n*Quick Stats:*"
            f"\n📦 {s.get('repos', 0)} repos | ⚡ {s.get('running', 0)} running"
            f"\n✅ {s.get('done_items', 0)}/{s.get('total_items', 0)} items done"
            f"\n💰 ${s.get('total_cost', 0):.4f} total cost"
        )
    return f"*Daily Digest*\n\n{digest}{extra}"


def cmd_costs():
    """Fetch cost data from the orchestrator and format it."""
    data = _orch_get("/api/costs")
    if isinstance(data, dict) and "error" in data:
        return f"Error fetching costs: {data['error']}"
    costs = data.get("costs", {})
    total = data.get("total", 0)
    if not costs:
        return "*API Costs*\n\nNo cost data available."
    max_cost = max(costs.values()) if costs else 1
    lines = ["*\U0001F4B0 API Costs*\n"]
    for repo, cost in sorted(costs.items(), key=lambda x: x[1], reverse=True):
        bar_len = min(int(cost / max(max_cost, 0.001) * 12), 12)
        pct = round(cost / max(total, 0.001) * 100)
        lines.append(f"  {'█' * bar_len}{'░' * (12 - bar_len)} `{repo}` ${cost:.4f} ({pct}%)")
    lines.append(f"\n*Total: ${total:.4f}*")
    # Add daily cost if available
    hist = _orch_get("/api/costs/history?days=2")
    if isinstance(hist, dict) and hist.get("daily"):
        daily = hist["daily"]
        if len(daily) >= 2:
            today = daily[-1].get("cost", 0)
            yesterday = daily[-2].get("cost", 0)
            if yesterday > 0:
                change = ((today - yesterday) / yesterday) * 100
                arrow = "\u2B06\uFE0F" if change > 0 else "\u2B07\uFE0F" if change < 0 else "\u27A1\uFE0F"
                lines.append(f"Today: ${today:.4f} ({arrow} {abs(change):.0f}% vs yesterday)")
            else:
                lines.append(f"Today: ${today:.4f}")
    return "\n".join(lines)


def cmd_health():
    """Fetch health scan from orchestrator and show summary."""
    data = _orch_get("/api/health-scan")
    if isinstance(data, dict) and "error" in data:
        return f"Error running health scan: {data['error']}"
    if not isinstance(data, list) or not data:
        return "No repos found for health scan."
    lines = ["*Health Scan*\n"]
    for r in data[:15]:
        name = r.get("name", "?")
        score = r.get("health_score", 0)
        issues = r.get("issues", [])
        bar = _progress_bar(score, 100)
        emoji = "\u2705" if score >= 80 else "\u26A0\uFE0F" if score >= 50 else "\u274C"
        grade = "A+" if score >= 95 else "A" if score >= 90 else "B+" if score >= 85 else "B" if score >= 80 else "C" if score >= 65 else "D" if score >= 50 else "F"
        lines.append(f"{emoji} *{name}*  `[{bar}]` {score}% ({grade})")
        if issues:
            for iss in issues[:3]:
                lines.append(f"    \u2022 {iss.get('title', '?')}")
    return "\n".join(lines)


def cmd_budget(arg=""):
    """Show or set the budget limit."""
    arg = arg.strip()
    if arg:
        try:
            limit = float(arg)
            result = _orch_post("/api/budget", {"limit": limit})
            if result.get("ok"):
                return f"Budget set to *${limit:.2f}*" if limit > 0 else "Budget limit removed (unlimited)"
            return f"Failed: {result.get('error', 'unknown')}"
        except ValueError:
            return "Usage: `budget [amount]` (e.g. `budget 5.00` or `budget 0` for unlimited)"
    data = _orch_get("/api/budget")
    if isinstance(data, dict) and "error" not in data:
        limit = data.get("budget_limit", 0)
        total = data.get("total_cost", 0)
        pct = (total / limit * 100) if limit > 0 else 0
        bar = _progress_bar(int(pct), 100) if limit > 0 else "unlimited"
        return (f"*Budget:* ${limit:.2f}\n"
                f"*Spent:* ${total:.2f}\n"
                f"*Usage:* `[{bar}]` {pct:.0f}%")
    return "Could not fetch budget info."


def cmd_retry(name):
    """Retry completed items for a repo (re-queue to pending)."""
    name = name.strip()
    if not name:
        return "Usage: `retry [repo]` — re-queue completed items back to pending"
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/items/retry", {"repo_id": repo["id"], "status": "completed"})
    if result.get("ok"):
        return f"All completed items in *{repo['name']}* re-queued to pending."
    return f"Failed: {result.get('error', 'unknown')}"


def cmd_metrics():
    """Show API metrics summary."""
    data = _orch_get("/api/metrics")
    if isinstance(data, dict) and "error" not in data:
        lines = [
            f"*API Metrics*",
            f"Total requests: *{data.get('total_requests', 0):,}*",
            f"Errors: *{data.get('errors', 0):,}*",
            f"Rate limited: *{data.get('rate_limited', 0):,}*",
            "",
            "*Top Endpoints:*",
        ]
        top = sorted(data.get("top_endpoints", {}).items(), key=lambda x: -x[1])[:8]
        for ep, count in top:
            lat = data.get("latency", {}).get(ep, {})
            p95 = f" (p95: {lat.get('p95_ms', '?')}ms)" if lat else ""
            lines.append(f"`{ep}` — {count:,}{p95}")
        return "\n".join(lines)
    return "Could not fetch metrics."


def cmd_trends(name):
    """Show trend summary for a repo."""
    name = name.strip()
    if not name:
        return "Usage: `trends [repo]` — Show 7-day performance trends"
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    data = _orch_get(f"/api/trends?repo_id={repo['id']}&days=7")
    if isinstance(data, dict) and "summary" in data:
        s = data["summary"]
        lines = [
            f"*Trends for {repo['name']}* (7 days)",
            f"Total cost: *${s.get('total_cost', 0)}*",
            f"Items completed: *{s.get('total_items_completed', 0)}*",
            f"Actions: *{s.get('total_actions', 0)}*",
            f"Error rate: *{s.get('error_rate', 0)}%*",
            f"Avg cost/day: *${s.get('avg_cost_per_day', 0)}*",
            f"Avg items/day: *{s.get('avg_items_per_day', 0)}*",
        ]
        daily = data.get("daily", [])
        if daily:
            max_actions = max((d.get("actions", 0) for d in daily), default=1) or 1
            lines.append("\n*Daily activity:*")
            for d in daily[-7:]:
                acts = d.get("actions", 0)
                bar_len = min(int(acts / max_actions * 10), 10)
                lines.append(
                    f"  {'█' * bar_len}{'░' * (10 - bar_len)} "
                    f"`{d['day'][-5:]}` {acts} acts, "
                    f"{d['items_completed']} items, ${d['cost']}"
                )
        return "\n".join(lines)
    return "Could not fetch trends."


def cmd_compare():
    """Show repo comparison table."""
    data = _orch_get("/api/comparison")
    if isinstance(data, dict) and "repos" in data:
        repos = sorted(data["repos"], key=lambda r: -(r.get("items_done", 0)))
        lines = [f"*Repo Comparison* ({len(repos)} repos, total: ${data.get('total_cost', 0)})", ""]
        max_items = max((r.get("items_done", 0) for r in repos), default=1) or 1
        for r in repos[:10]:
            state_icon = "\U0001F7E2" if r["state"] not in ("idle", "unknown") else "\u26AA"
            done = r.get("items_done", 0)
            total = r.get("items_total", 0)
            cost = r.get("cost", 0)
            eff = f"${cost / done:.4f}/item" if done > 0 and cost > 0 else ""
            bar_len = min(int(done / max_items * 8), 8)
            lines.append(
                f"{state_icon} *{r['name']}*\n"
                f"  {'█' * bar_len}{'░' * (8 - bar_len)} "
                f"{done}/{total} items | ${cost} | "
                f"{r['error_rate']}% err{f' | {eff}' if eff else ''}"
            )
        return "\n".join(lines)
    return "Could not fetch comparison data."


def cmd_activity():
    """Show recent activity across all repos."""
    repos = _orch_get("/api/repos")
    if not isinstance(repos, list):
        return "Could not fetch repos."
    lines = ["*Recent Activity*", ""]
    total_errors = 0
    for repo in repos[:10]:
        rid = repo.get("id")
        logs_data = _orch_get(f"/api/logs?repo_id={rid}&limit=5")
        if isinstance(logs_data, list) and logs_data:
            err_count = sum(1 for l in logs_data if l.get("error"))
            total_errors += err_count
            err_badge = f" \U0001F534 {err_count} err" if err_count else ""
            lines.append(f"*{repo['name']}* ({repo.get('state', 'idle')}){err_badge}")
            for l in logs_data[:2]:
                action = (l.get("action") or l.get("result") or "\u2014")[:60]
                ts = (l.get("created_at") or "")[-8:]
                err = " \u274C" if l.get("error") else ""
                lines.append(f"  `{ts}` {action}{err}")
            lines.append("")
    if total_errors > 0:
        lines.insert(2, f"\u26A0\uFE0F *{total_errors} total errors* across recent activity\n")
    return "\n".join(lines) if len(lines) > 2 else "No recent activity."


def cmd_notes(name):
    """Show repo notes/annotations."""
    rid = _resolve_repo(name)
    if not rid:
        return f"Repo not found: {name}"
    data = _orch_get(f"/api/notes?repo_id={rid}")
    if not isinstance(data, list) or not data:
        return f"No notes for *{name}*."
    lines = [f"*Notes for {name}:*", ""]
    for n in data[:10]:
        key = n.get("key", "")
        val = n.get("value", "")[:100]
        lines.append(f"  \U0001F4DD `{key[:10]}` {val}")
    return "\n".join(lines)


def cmd_add_note(name, text):
    """Add a note to a repo."""
    rid = _resolve_repo(name)
    if not rid:
        return f"Repo not found: {name}"
    result = _orch_post("/api/notes", {"repo_id": rid, "action": "add", "text": text})
    if isinstance(result, dict) and result.get("ok"):
        return f"\U0001F4DD Note added to *{name}*."
    return f"Failed to add note to {name}."


def cmd_agent_stats(name):
    """Show agent performance stats for a repo."""
    rid = _resolve_repo(name)
    if not rid:
        return f"Repo not found: {name}"
    data = _orch_get(f"/api/agent-stats?repo_id={rid}")
    if not isinstance(data, list) or not data:
        return f"No agent stats for *{name}*."
    lines = [f"*Agent Stats — {name}:*", ""]
    for a in data:
        agent = a.get("agent_type", "unknown")
        steps = a.get("completed_steps", 0)
        cost = a.get("avg_cost", 0)
        dur = a.get("avg_duration", 0)
        test_pass = a.get("test_pass_rate", 0)
        lines.append(f"  *{agent}*: {steps} steps, ${cost:.3f}/step, {dur:.0f}s avg, {test_pass:.0f}% pass")
    return "\n".join(lines)


def cmd_search(query):
    """Cross-repo search for items, logs, mistakes."""
    if not query or len(query) < 2:
        return "Usage: `search <query>` (min 2 chars)"
    data = _orch_get(f"/api/search?q={query}&scope=all&limit=10")
    if not isinstance(data, dict):
        return "Search failed."
    total = data.get("total", 0)
    if total == 0:
        return f"No results for *{query}*."
    lines = [f"*Search: {query}* ({total} results)", ""]
    for it in (data.get("items") or [])[:5]:
        lines.append(f"  \U0001F4CB `{it.get('repo_name', '?')}` {it.get('title', '')[:50]} [{it.get('status', '')}]")
    for mk in (data.get("mistakes") or [])[:3]:
        lines.append(f"  \u274C `{mk.get('repo_name', '?')}` {mk.get('error_type', '')}: {mk.get('description', '')[:40]}")
    for lg in (data.get("logs") or [])[:3]:
        lines.append(f"  \U0001F4DC `{lg.get('repo_name', '?')}` {lg.get('action', '')} {lg.get('result', '')[:30]}")
    return "\n".join(lines)


def cmd_circuit_breakers():
    """Show circuit breaker states across all repos."""
    data = _orch_get("/api/circuit-breakers")
    if not isinstance(data, dict):
        return "Could not fetch circuit breaker states."
    cbs = data.get("circuit_breakers", [])
    if not cbs:
        return "No circuit breaker data available."
    open_cbs = [cb for cb in cbs if cb["state"] != "closed"]
    if not open_cbs:
        return "\u2705 All circuit breakers closed — everything healthy!"
    lines = [f"*\u26A1 {len(open_cbs)} Circuit Breaker(s) Tripped*", ""]
    for cb in open_cbs:
        state = cb["state"].upper()
        emoji = "\U0001F534" if cb["state"] == "open" else "\U0001F7E1"
        lines.append(f"  {emoji} *{cb['repo_name']}*: {state} ({cb['failures']}/{cb['threshold']} failures)")
        if cb.get("last_failure_ago"):
            lines.append(f"     Last failure: {cb['last_failure_ago']}s ago")
    return "\n".join(lines)


def cmd_health_scores():
    """Show health scores for all repos."""
    data = _orch_get("/api/health/detailed")
    if not isinstance(data, dict):
        return "Could not fetch health scores."
    repos = data.get("repos", [])
    if not repos:
        return "No repos registered."
    avg = data.get("average_score", 0)
    grade_emoji = {"A": "\U0001F7E2", "B": "\U0001F535", "C": "\U0001F7E1", "D": "\U0001F7E0", "F": "\U0001F534"}
    lines = [f"*\U0001F3E5 Health Report* (Avg: {avg})", ""]
    for r in sorted(repos, key=lambda x: -x["score"]):
        emoji = grade_emoji.get(r["grade"], "\u2B1C")
        issues_str = f" — {', '.join(r['issues'][:2])}" if r["issues"] else ""
        lines.append(f"  {emoji} *{r['grade']}* `{r['repo']}` ({r['score']}){issues_str}")
    return "\n".join(lines)


def cmd_cost_history():
    """Show daily cost totals for the last 7 days."""
    data = _orch_get("/api/costs/history?days=7")
    if not isinstance(data, dict):
        return "Could not fetch cost history."
    history = data.get("history", [])
    if not history:
        return "No cost history data yet. Costs are persisted daily at digest time."
    # Aggregate by date
    by_date = {}
    for r in history:
        d = r.get("date", "?")
        by_date[d] = by_date.get(d, 0) + r.get("cost", 0)
    lines = ["\U0001F4C8 *Cost History (7 days)*", ""]
    for d in sorted(by_date.keys()):
        cost = by_date[d]
        bar_len = min(int(cost / max(max(by_date.values()), 0.001) * 15), 15)
        bar = "\u2588" * bar_len + "\u2591" * (15 - bar_len)
        lines.append(f"  `{d[5:]}` `{bar}` ${cost:.3f}")
    total = sum(by_date.values())
    lines.append(f"\n*Total:* ${total:.3f}")
    return "\n".join(lines)


def cmd_snapshot(name):
    """Get a snapshot summary of a specific repo's data."""
    rid = _resolve_repo(name)
    if not rid:
        return f"Repo not found: {name}"
    data = _orch_get(f"/api/repos/snapshot?repo_id={rid}&include=items,plan")
    if not isinstance(data, dict) or "error" in data:
        return f"Could not fetch snapshot for {name}."
    items = data.get("items", [])
    steps = data.get("plan_steps", [])
    done_items = sum(1 for i in items if i.get("status") == "completed")
    done_steps = sum(1 for s in steps if s.get("status") == "completed")
    lines = [
        f"\U0001F4F8 *Snapshot: {data.get('repo', name)}*",
        f"  Items: {done_items}/{len(items)} completed",
        f"  Steps: {done_steps}/{len(steps)} completed",
        f"  Exported: {data.get('exported_at', 'N/A')[:19]}",
    ]
    # Show recent pending items
    pending = [i for i in items if i.get("status") == "pending"][:5]
    if pending:
        lines.append("")
        lines.append("*Pending Items:*")
        for it in pending:
            lines.append(f"  \u2022 {it.get('title', '?')[:50]}")
    return "\n".join(lines)


def cmd_stale():
    """Show items stuck in_progress for 2+ hours."""
    data = _orch_get("/api/stale-items?hours=2")
    if not isinstance(data, dict):
        return "Could not fetch stale items."
    items_list = data.get("stale_items", [])
    if not items_list:
        return "\u2705 No stale items — everything flowing smoothly!"
    lines = [f"*\u26A0\uFE0F {len(items_list)} Stale Items* (2h+ in progress)", ""]
    for it in items_list[:10]:
        repo = it.get("repo_name", "?")
        title = (it.get("title") or "")[:40]
        since = (it.get("started_at") or "")[-8:]
        lines.append(f"  `{repo}` {title} (since {since})")
    return "\n".join(lines)


def cmd_active():
    """Show currently running repos with their active items and progress."""
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return f"Error: {repos['error']}"
    if not isinstance(repos, list):
        return "No repo data available."
    active = [r for r in repos if r.get("running")]
    if not active:
        return "\U0001F634 *No active repos* — everything is idle."
    lines = [f"\u26A1 *{len(active)} Active Repos*", ""]
    for r in active:
        s = r.get("stats", {})
        done = s.get("items_done", 0)
        total = s.get("items_total", 0)
        pct = round(done / max(total, 1) * 100)
        bar_len = min(pct // 10, 10)
        bar = '\u2588' * bar_len + '\u2591' * (10 - bar_len)
        state = r.get("state", "running")
        paused = " \u23F8" if r.get("paused") else ""
        lines.append(
            f"\U0001F7E2 *{r['name']}*{paused}\n"
            f"  `[{bar}]` {done}/{total} items ({pct}%)\n"
            f"  State: {state} | Cost: ${s.get('cost', 0):.4f}"
        )
    return "\n".join(lines)


def cmd_eta():
    """Estimated time remaining for all repos with plan steps."""
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return f"Error: {repos['error']}"
    if not isinstance(repos, list):
        repos = repos.get("repos", []) if isinstance(repos, dict) else []
    lines = ["*ETA Estimates:*\n"]
    has_data = False
    for r in repos:
        rid = r.get("id")
        plan = _orch_get(f"/api/plan?repo_id={rid}")
        if not isinstance(plan, list) or len(plan) == 0:
            continue
        done = sum(1 for s in plan if s.get("status") == "completed")
        total = len(plan)
        remaining = total - done
        bar = _progress_bar(done, total)
        if remaining == 0:
            lines.append(f"✅ *{r['name']}* `[{bar}]` Done!")
            has_data = True
            continue
        total_dur = sum(s.get("duration_sec", 0) for s in plan if s.get("status") == "completed")
        total_cost = sum(s.get("cost_usd", 0) for s in plan if s.get("status") == "completed")
        if done > 0:
            avg_dur = total_dur / done
            avg_cost = total_cost / done
            eta_min = round((remaining * avg_dur) / 60)
            est_cost = remaining * avg_cost
            lines.append(
                f"⏳ *{r['name']}* `[{bar}]` {done}/{total}\n"
                f"  ~{eta_min}m left, ~${est_cost:.2f} est."
            )
        else:
            lines.append(f"⏸️ *{r['name']}* `[{bar}]` 0/{total} (no data)")
        has_data = True
    if not has_data:
        return "No repos with plan steps found."
    return "\n".join(lines)


def cmd_forecast():
    """Show 7-day cost forecast based on recent spending trends."""
    data = _orch_get("/api/cost-forecast")
    if isinstance(data, dict) and "error" in data:
        return f"Error: {data['error']}"
    if not isinstance(data, dict) or "total_7d" not in data:
        return "No cost data available yet."
    trend_emoji = {"rising": "\U0001F4C8", "falling": "\U0001F4C9", "stable": "\u27A1\uFE0F"}.get(data.get("trend", "stable"), "\u27A1\uFE0F")
    lines = [
        "*Cost Forecast:*\n",
        f"Last 7 days: *${data['total_7d']}*",
        f"Avg daily: *${data['avg_daily']}*",
        f"Trend: {trend_emoji} *{data.get('trend', 'stable')}*",
        f"Forecast (next 7d): *${data['forecast_total']}*",
        "",
        "Daily forecast:"
    ]
    for i, v in enumerate(data.get("forecast_7d", [])):
        bar_len = min(int(v * 20 / max(data.get("avg_daily", 0.01), 0.01)), 20)
        lines.append(f"  Day {i+1}: {'█' * bar_len} ${v}")
    return "\n".join(lines)


def cmd_leaderboard():
    """Show top repos ranked by items completed."""
    data = _orch_get("/api/comparison")
    if isinstance(data, dict) and "error" in data:
        return f"Error: {data['error']}"
    repos = data.get("repos", []) if isinstance(data, dict) else []
    if not repos:
        return "No repos to compare yet."
    ranked = sorted(repos, key=lambda r: r.get("items_done", 0), reverse=True)
    medals = ["\U0001F947", "\U0001F948", "\U0001F949"]
    lines = ["*\U0001F3C6 Repo Leaderboard:*\n"]
    for i, r in enumerate(ranked[:10]):
        medal = medals[i] if i < 3 else f"#{i+1}"
        pct = round(r["items_done"] / max(r["items_total"], 1) * 100)
        bar_len = min(pct // 5, 20)
        lines.append(
            f"{medal} *{r['name']}* — {r['items_done']}/{r['items_total']} "
            f"({'█' * bar_len}{'░' * (20 - bar_len)}) {pct}%"
        )
        lines.append(f"   Cost: ${r.get('cost', 0)} | Health: {r.get('health_score', '-')}")
    return "\n".join(lines)


def cmd_top():
    """Show top 5 repos by recent completions (items done today or total if no daily data)."""
    data = _orch_get("/api/comparison")
    if isinstance(data, dict) and "error" in data:
        return f"Error: {data['error']}"
    repos = data.get("repos", []) if isinstance(data, dict) else []
    if not repos:
        return "No repos to rank yet."
    ranked = sorted(repos, key=lambda r: r.get("items_done", 0), reverse=True)[:5]
    medals = ["\U0001F947", "\U0001F948", "\U0001F949", "4\uFE0F\u20E3", "5\uFE0F\u20E3"]
    lines = ["*\U0001F51D Top 5 Repos*\n"]
    for i, r in enumerate(ranked):
        done = r.get("items_done", 0)
        total = r.get("items_total", 0)
        cost = r.get("cost", 0)
        eff = f" (${cost/done:.4f}/item)" if done > 0 and cost > 0 else ""
        lines.append(f"{medals[i]} *{r['name']}* — {done}/{total} items{eff}")
    return "\n".join(lines)


def cmd_summary():
    """Show a compact system-wide summary."""
    data = _orch_get("/api/system")
    if isinstance(data, dict) and "error" in data:
        return f"Error: {data['error']}"
    if not isinstance(data, dict) or "repos" not in data:
        return "No system data available."
    ti = data.get("total_items", 0)
    di = data.get("done_items", 0)
    pct = round(di / max(ti, 1) * 100)
    bar_len = min(pct // 5, 20)
    lines = [
        "*\U0001F3DC\uFE0F Swarm Town Summary*\n",
        f"\U0001F4E6 *{data.get('repos', 0)}* repos ({data.get('running', 0)} running, {data.get('paused', 0)} paused)",
        f"\U0001F4CB Items: *{di}/{ti}* ({'█' * bar_len}{'░' * (20 - bar_len)}) {pct}%",
        f"\u26A1 Steps: *{data.get('done_steps', 0)}/{data.get('total_steps', 0)}*",
        f"\U0001F920 Agents: *{data.get('total_agents', 0)}*",
        f"\U0001F504 Cycles: *{data.get('total_cycles', 0)}*",
        f"\U0001F4B0 Total Cost: *${data.get('total_cost', 0):.4f}*",
    ]
    if data.get("total_mistakes", 0) > 0:
        lines.append(f"\U0001F480 Mistakes: *{data['total_mistakes']}*")
    # Top 3 repos by cost
    cost_by_repo = data.get("cost_by_repo", {})
    if cost_by_repo:
        top = sorted(cost_by_repo.items(), key=lambda x: x[1], reverse=True)[:3]
        lines.append("\n*Top Cost Repos:*")
        for name, cost in top:
            lines.append(f"  `{name}`: ${cost:.4f}")
    return "\n".join(lines)


def cmd_tags(text):
    """View or set repo tags. 'tags repo' to view, 'tags repo: tag1, tag2' to set."""
    if ":" in text:
        parts = text.split(":", 1)
        name = parts[0].strip()
        tags = parts[1].strip()
        rid = _resolve_repo(name)
        if not rid:
            return f"Repo not found: {name}"
        result = _orch_post("/api/repos/tags", {"repo_id": rid, "tags": tags})
        if isinstance(result, dict) and result.get("ok"):
            return f"\U0001F3F7\uFE0F Tags updated for *{name}*: {result.get('tags', tags)}"
        return f"Failed to update tags for {name}."
    else:
        name = text.strip()
        if not name:
            # Show all repos with tags
            repos = _orch_get("/api/repos")
            if not isinstance(repos, list):
                return "Could not fetch repos."
            lines = ["*Repo Tags:*", ""]
            for r in repos:
                tags = r.get("tags", "")
                if tags:
                    lines.append(f"  *{r['name']}*: {tags}")
            return "\n".join(lines) if len(lines) > 2 else "No repos have tags set."
        rid = _resolve_repo(name)
        if not rid:
            return f"Repo not found: {name}"
        repos = _orch_get("/api/repos")
        repo = next((r for r in repos if r["id"] == rid), None)
        tags = repo.get("tags", "") if repo else ""
        return f"\U0001F3F7\uFE0F *{name}* tags: {tags}" if tags else f"No tags for *{name}*. Use `tags {name}: tag1, tag2` to set."


def cmd_uptime():
    data = _orch_get("/api/status")
    if "error" in data:
        return f"Error: {data['error']}"
    uptime = data.get("uptime", "unknown")
    repos_total = data.get("repos_total", 0)
    repos_running = data.get("repos_running", 0)
    version = data.get("version", "?")
    lines = [
        f"*Swarm Town Uptime*\n",
        f"\u23F1 Uptime: `{uptime}`",
        f"\U0001F4E6 Version: `{version}`",
        f"\U0001F7E2 Repos: {repos_running}/{repos_total} running",
    ]
    # Per-repo running streaks
    repos = _orch_get("/api/repos")
    if isinstance(repos, list):
        running = [r for r in repos if r.get("running")]
        if running:
            lines.append("\n*Running Repos:*")
            for r in running[:8]:
                cycles = r.get("cycle_count", 0)
                state = r.get("state", "idle").replace("_", " ")
                lines.append(f"  \u23F1\uFE0F *{r['name']}* — {state} ({cycles} cycles)")
    return "\n".join(lines)


def cmd_rotate_token():
    data = _orch_post("/api/token/rotate", {})
    if "error" in data:
        return f"Error: {data['error']}"
    token = data.get("token", "?")
    return f"API token rotated.\nNew prefix: `{token[:8]}...`\nAll open dashboard sessions need to re-authenticate."


def cmd_recent_errors():
    data = _orch_get("/api/errors/recent?limit=10")
    if "error" in data:
        return f"Error: {data['error']}"
    errors = data.get("errors", [])
    if not errors:
        return "\u2705 No recent errors across any repos."
    # Count errors per repo
    repo_counts = {}
    for e in errors:
        rn = e.get("repo_name", "?")
        repo_counts[rn] = repo_counts.get(rn, 0) + 1
    top_repos = sorted(repo_counts.items(), key=lambda x: -x[1])[:5]
    lines = [f"*\u274C Recent Errors ({len(errors)})*\n"]
    if len(top_repos) > 1:
        lines.append("*By repo:* " + ", ".join(f"{r}({c})" for r, c in top_repos))
        lines.append("")
    for e in errors[:10]:
        repo = e.get("repo_name", "?")
        etype = e.get("error_type", "?")
        desc = (e.get("description") or "")[:60]
        ts = (e.get("created_at") or "")[:19]
        lines.append(f"\U0001F534 `{repo}` *{etype}*\n  {desc}\n  _{ts}_")
    return "\n".join(lines)


def cmd_api_docs():
    data = _orch_get("/api/docs")
    if "error" in data:
        return f"Error: {data['error']}"
    endpoints = data.get("endpoints", [])
    if not endpoints:
        return "No API docs available."
    lines = ["*API Endpoints:*\n"]
    for ep in endpoints[:30]:
        lines.append(f"`{ep['method']} {ep['path']}` — {ep['desc']}")
    if len(endpoints) > 30:
        lines.append(f"\n...and {len(endpoints) - 30} more. GET /api/docs for full list.")
    return "\n".join(lines)


def cmd_archive(name, unarchive=False):
    """Archive or unarchive a repo by name."""
    repos = _orch_get("/api/repos?include_archived=1")
    if not isinstance(repos, list):
        repos = repos.get("repos", []) if isinstance(repos, dict) else []
    repo = next((r for r in repos if r["name"].lower() == name.lower()), None)
    if not repo:
        return f"Repo `{name}` not found."
    action = not unarchive  # archive=True or False
    result = _orch_post("/api/repos/archive", {"repo_id": repo["id"], "archive": action})
    if result.get("ok"):
        return f"{'Unarchived' if unarchive else 'Archived'} `{repo['name']}` successfully."
    return f"Failed: {result.get('error', 'unknown error')}"


def cmd_batch(args):
    """Batch action on repos matching a tag or comma-separated names.

    Examples:
      batch start tag:frontend
      batch stop blog,portfolio
      batch push all
    """
    parts = args.strip().split(None, 1)
    if len(parts) < 2:
        return "Usage: `batch [start|stop|pause|resume|push] [tag:X | repo1,repo2 | all]`"
    action, target = parts[0], parts[1]
    if action not in ("start", "stop", "pause", "resume", "push"):
        return f"Unknown action `{action}`. Use start/stop/pause/resume/push."
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return f"Error: {repos['error']}"
    if target == "all":
        ids = [r["id"] for r in repos]
    elif target.startswith("tag:"):
        tag = target[4:].strip().lower()
        ids = [r["id"] for r in repos if tag in (r.get("tags") or "").lower().split(",")]
    else:
        names = [n.strip().lower() for n in target.split(",")]
        ids = [r["id"] for r in repos if r["name"].lower() in names]
    if not ids:
        return "No matching repos found."
    data = _orch_post("/api/repos/batch", {"repo_ids": ids, "action": action})
    if isinstance(data, dict) and "error" in data:
        return f"Error: {data['error']}"
    results = data.get("results", {})
    ok_count = sum(1 for r in results.values() if r.get("ok"))
    fail_count = len(ids) - ok_count
    lines = [f"\u2699\uFE0F *Batch `{action}`* on {len(ids)} repos: {ok_count}\u2705 {fail_count}\u274C"]
    # Show per-repo results
    repo_names = {str(r["id"]): r["name"] for r in repos}
    for rid, res in list(results.items())[:10]:
        name = repo_names.get(str(rid), f"#{rid}")
        icon = "\u2705" if res.get("ok") else "\u274C"
        err = f" — {res.get('error', '')[:40]}" if not res.get("ok") and res.get("error") else ""
        lines.append(f"  {icon} {name}{err}")
    return "\n".join(lines)


def cmd_changelog(name: str = ""):
    """Show recent git commits for a repo."""
    import subprocess
    repo = _find_repo(name) if name else None
    if name and not repo:
        return f"Repo '{name}' not found."
    if not repo:
        path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    else:
        path = repo.get("path", "")
    if not path or not os.path.isdir(path):
        return f"Repo path not found."
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-10"],
            capture_output=True, text=True, timeout=10, cwd=path
        )
        if result.returncode == 0 and result.stdout.strip():
            label = repo["name"] if repo else "Orchestrator"
            lines = [f"\U0001F4DD *Recent Commits ({label}):*\n"]
            for line in result.stdout.strip().split("\n")[:10]:
                lines.append(f"  `{line[:80]}`")
            return "\n".join(lines)
        return "No git history found."
    except Exception as e:
        return f"Error: {e}"


def cmd_timeline(name: str = ""):
    """Show execution timeline with state transitions for a repo."""
    repo = _find_repo(name) if name else None
    if not repo:
        return f"Repo '{name}' not found. Usage: `/timeline <repo>`" if name else "Usage: `/timeline <repo>`"
    rid = repo["id"]
    data = _get(f"/api/timeline?repo_id={rid}&limit=15")
    if not data:
        return f"No timeline data for *{repo['name']}*."
    lines = [f"\U0001F554 *Timeline — {repo['name']}* (last {len(data)}):\n"]
    state_emoji = {"idle": "\U0001F4A4", "planning": "\U0001F4D0", "executing": "\u26A1", "testing": "\U0001F9EA",
                   "pushing": "\U0001F680", "paused": "\u23F8\uFE0F", "error": "\U0001F534"}
    total_cost = 0
    total_dur = 0
    err_count = 0
    for entry in data:
        st = entry.get("state", "idle")
        act = entry.get("action", "")
        ts_raw = entry.get("created_at", "")
        cost = entry.get("cost_usd") or 0
        dur = entry.get("duration_sec") or 0
        err = entry.get("error") or ""
        total_cost += cost
        total_dur += dur
        if err:
            err_count += 1
        emoji = state_emoji.get(st, "\u25AA\uFE0F")
        ts_short = ts_raw[11:19] if len(ts_raw) > 19 else ts_raw[:19]
        cost_str = f" ${cost:.4f}" if cost else ""
        dur_str = f" {dur:.0f}s" if dur else ""
        err_str = " \u274C" if err else ""
        lines.append(f"  {emoji} `{ts_short}` {st}{' → ' + act if act else ''}{cost_str}{dur_str}{err_str}")
    lines.append(f"\n\U0001F4CA *Totals:* ${total_cost:.4f} | {total_dur:.0f}s | {err_count} errors")
    return "\n".join(lines)


def cmd_queue():
    """Show top priority pending items across all repos."""
    repos = _get("/api/repos") or []
    all_pending = []
    for r in repos:
        items = _get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") == "pending":
                it["_repo"] = r["name"]
                all_pending.append(it)
    if not all_pending:
        return "\u2705 No pending items across any repo!"
    prio_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_pending.sort(key=lambda x: prio_order.get(x.get("priority", "medium"), 2))
    lines = [f"\U0001F4CB *Queue — {len(all_pending)} pending items:*\n"]
    prio_emoji = {"critical": "\u26D4", "high": "\U0001F534", "medium": "\U0001F7E1", "low": "\U0001F7E2"}
    for it in all_pending[:15]:
        pe = prio_emoji.get(it.get("priority", "medium"), "\U0001F7E1")
        lines.append(f"  {pe} *{it['_repo']}*: {it.get('title', '?')[:50]}")
    if len(all_pending) > 15:
        lines.append(f"\n  _...and {len(all_pending) - 15} more_")
    return "\n".join(lines)


def cmd_fastest():
    """Show fastest completed steps across all repos."""
    repos = _get("/api/repos") or []
    all_steps = []
    for r in repos:
        plan = _get(f"/api/plan?repo_id={r['id']}") or []
        for s in plan:
            if s.get("status") == "completed" and s.get("duration_sec", 0) > 0:
                s["_repo"] = r["name"]
                all_steps.append(s)
    if not all_steps:
        return "No completed steps with timing data yet."
    all_steps.sort(key=lambda x: x.get("duration_sec", 9999))
    lines = [f"\u26A1 *Fastest Steps* (top 10 of {len(all_steps)}):\n"]
    for s in all_steps[:10]:
        dur = s.get("duration_sec", 0)
        cost = s.get("cost_usd", 0)
        desc = (s.get("description") or "")[:45]
        lines.append(f"  \U0001F3C3 *{s['_repo']}*: {dur:.0f}s ${cost:.3f} — {desc}")
    return "\n".join(lines)


def cmd_pin(name: str = ""):
    """Pin a repo as default context for commands."""
    global _pinned_repo
    if not name:
        if _pinned_repo:
            return f"\U0001F4CC Pinned repo: *{_pinned_repo}*\nUse `/pin <name>` to change or `/pin clear` to unpin."
        return "No pinned repo. Use `/pin <name>` to set one."
    if name in ("clear", "none", "unpin"):
        _pinned_repo = ""
        return "\U0001F4CC Pinned repo cleared."
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    _pinned_repo = repo["name"]
    return f"\U0001F4CC Pinned *{repo['name']}* as default repo."


def cmd_notify(arg: str = ""):
    """View or toggle notification preferences."""
    global _notify_prefs
    categories = list(_notify_prefs.keys())

    if not arg:
        lines = ["\U0001F514 *Notification Preferences*", ""]
        for cat in categories:
            icon = "\u2705" if _notify_prefs[cat] else "\u274C"
            label = cat.replace("_", " ").title()
            lines.append(f"  {icon} {label}")
        lines.append("")
        lines.append("Toggle: `/notify state_changes`")
        lines.append("Categories: " + ", ".join(f"`{c}`" for c in categories))
        return "\n".join(lines)

    key = arg.strip().lower().replace(" ", "_")
    if key == "all_on":
        for c in categories:
            _notify_prefs[c] = True
        return "\U0001F514 All notifications enabled."
    if key == "all_off":
        for c in categories:
            _notify_prefs[c] = False
        return "\U0001F515 All notifications disabled."
    if key not in _notify_prefs:
        return f"Unknown category `{key}`. Options: {', '.join(categories)}, all_on, all_off"
    _notify_prefs[key] = not _notify_prefs[key]
    state = "\u2705 ON" if _notify_prefs[key] else "\u274C OFF"
    return f"\U0001F514 *{key.replace('_', ' ').title()}* → {state}"


def cmd_help():
    return """*Swarm Town Commands:*

*Control:*
`status` — All repos with progress bars
`start all` / `stop all` — Launch/stop everything
`start [repo]` / `stop [repo]` — Start/stop repo
`pause [repo]` / `resume [repo]` — Pause/resume

*Items & Plans:*
`items [repo]` — List items with status
`plan [repo]` — Show plan steps progress
`add feature repo: title - desc` — Add feature
`add issue repo: title - desc` — Add issue
`done repo: item title` — Mark item as completed

*Inspection:*
`logs [repo]` — Last 5 log entries
`mistakes [repo]` — Last 5 mistakes
`memory [repo]` — Last 5 memory entries

*Management:*
`repos` / `list` — List registered repos
`add repo name: /path` — Register new repo
`remove [repo]` — Remove repo (keeps files)
`push [repo]` — Git push
`screenshot` / `show me` — Dashboard photo
`digest` — Daily digest summary
`costs` — Per-repo API costs
`health` — Health scan all repos
`retry [repo]` — Re-queue completed items
`budget` / `budget [amount]` — View/set budget
`metrics` — API request/latency stats
`trends [repo]` — 7-day performance trends
`compare` — Cross-repo comparison table
`activity` — Recent activity across all repos
`notes [repo]` — View repo notes
`add note repo: text` — Add a note
`agent-stats [repo]` — Agent performance stats
`search [query]` — Search items/logs/mistakes across all repos
`tags` / `tags repo` / `tags repo: tag1,tag2` — View/set tags
`stale` — Show items stuck in_progress for 2+ hours
`breakers` — Circuit breaker states across repos
`snapshot [repo]` — Quick data snapshot with pending items
`cost-history` — Daily cost totals for last 7 days
`grades` — Health scores for all repos (A-F)
`summary` — Compact system-wide summary
`active` — Show currently running repos
`top` — Top 5 repos by items completed
`notify` / `notify [cat]` — View/toggle notifications
`pin [repo]` / `pin clear` — Set default repo for commands
`changelog [repo]` — Recent git commits
`timeline [repo]` — Execution state transition timeline
`queue` — Top priority pending items across all repos
`fastest` — Fastest completed steps across all repos
`uptime` — Server uptime and version info
`eta` — Estimated time and cost remaining per repo
`forecast` — 7-day cost forecast with trend
`leaderboard` — Repo rankings by items completed
`errors` — Recent errors across all repos
`docs` — List all API endpoints
`batch [action] [target]` — Batch start/stop/push repos
`rotate-token` — Rotate API bearer token
`app` — Open Mini App
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

def handle_callback_query(cbq):
    """Handle inline keyboard button presses."""
    cbq_id = cbq.get("id", "")
    data = cbq.get("data", "")
    chat_id = str(cbq.get("message", {}).get("chat", {}).get("id", ""))

    # Acknowledge the callback to remove the loading spinner
    _api("answerCallbackQuery", {"callback_query_id": cbq_id})

    # Handle confirm_remove callbacks
    if data.startswith("confirm_remove:"):
        repo_name = data[len("confirm_remove:"):]
        reply = cmd_remove_repo(repo_name)
        send_message(reply, chat_id=chat_id)
        return
    if data == "cancel_remove":
        send_message("Removal cancelled.", chat_id=chat_id)
        return

    # Dispatch to command handlers
    cmd_map = {
        "cmd_status": cmd_status,
        "cmd_costs": cmd_costs,
        "cmd_leaderboard": cmd_leaderboard,
        "cmd_forecast": cmd_forecast,
        "cmd_summary": cmd_summary,
        "cmd_start_all": cmd_start_all,
        "cmd_stop_all": cmd_stop_all,
    }
    handler = cmd_map.get(data)
    if handler:
        try:
            reply = handler()
            if reply:
                send_message(reply, chat_id=chat_id)
        except Exception as e:
            log.error(f"Callback query error: {e}")
            send_message(f"Error: {e}", chat_id=chat_id)


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
            raw_data = web_app_data.get("data", "")
            if not isinstance(raw_data, str) or len(raw_data) > 10000:
                log.warning("web_app_data: invalid or oversized data field")
                return
            data = json.loads(raw_data) if raw_data else {}
            if not isinstance(data, dict):
                log.warning("web_app_data: data is not a dict")
                return
            action = data.get("action", "")
            VALID_ACTIONS = {"start_repo", "stop_repo", "start_all", "stop_all", "add_item"}
            if action == "start_repo":
                repo = str(data.get("repo", "")).strip()
                reply = cmd_start_repo(repo) if repo else "Missing repo name"
            elif action == "stop_repo":
                repo = str(data.get("repo", "")).strip()
                reply = cmd_stop_repo(repo) if repo else "Missing repo name"
            elif action == "start_all":
                reply = cmd_start_all()
            elif action == "stop_all":
                reply = cmd_stop_all()
            elif action == "add_item":
                item_type = str(data.get("type", "feature")).strip()
                title = str(data.get("title", "")).strip()
                if item_type not in ("feature", "issue"):
                    item_type = "feature"
                reply = cmd_add_item(item_type, title) if title else "Missing item title"
            elif action:
                log.warning(f"web_app_data: unknown action '{action}'")
                reply = f"Unknown action: {action}"
            else:
                reply = None
            if reply:
                send_message(reply, chat_id=chat_id)
        except json.JSONDecodeError:
            log.error("web_app_data: invalid JSON in data field")
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

    # Strip leading / for Telegram command format and @bot suffix
    t = text.lower()
    if t.startswith("/"):
        t = t[1:]
        # Remove @bot suffix (e.g. /status@SwarmTownBot -> status)
        if "@" in t:
            t = t[:t.index("@")]

    if t == "status":
        status_text = cmd_status()
        repos_data = _orch_get("/api/repos") or []
        if isinstance(repos_data, dict):
            repos_data = []
        running = [r for r in repos_data if r.get("running")]
        idle = [r for r in repos_data if not r.get("running") and not r.get("archived")]
        buttons = []
        if idle:
            buttons.append([{"text": "\u25B6\uFE0F Start All", "callback_data": "cmd_start_all"},
                            {"text": "\u23F9\uFE0F Stop All", "callback_data": "cmd_stop_all"}])
        buttons.append([{"text": "\U0001F4CA Costs", "callback_data": "cmd_costs"},
                        {"text": "\U0001F4CB Summary", "callback_data": "cmd_summary"},
                        {"text": "\U0001F3C6 Leader", "callback_data": "cmd_leaderboard"}])
        send_message(status_text, chat_id=chat_id, reply_markup={"inline_keyboard": buttons} if buttons else None)
        reply = None
    elif t in ("start all", "start_all", "startall"):
        reply = cmd_start_all()
    elif t in ("stop all", "stop_all", "stopall"):
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
    elif t == "items" or t.startswith("items "):
        reply = cmd_items(t[6:].strip() or _pinned_repo or "")
    elif t.startswith("done "):
        reply = cmd_done(t[5:])
    elif t == "plan" or t.startswith("plan "):
        reply = cmd_plan(t[5:].strip() or _pinned_repo or "")
    elif t == "logs" or t.startswith("logs "):
        reply = cmd_logs(t[5:].strip() or _pinned_repo or "")
    elif t == "mistakes" or t.startswith("mistakes "):
        reply = cmd_mistakes(t[9:].strip() or _pinned_repo or "")
    elif t == "memory" or t.startswith("memory "):
        reply = cmd_memory(t[7:].strip() or _pinned_repo or "")
    elif t == "repos" or t == "list":
        reply = cmd_repos()
    elif t.startswith("add repo "):
        reply = cmd_add_repo(text[9:])  # use original case
    elif t.startswith("remove "):
        repo_name = t[7:].strip()
        repo = _find_repo(repo_name)
        if not repo:
            reply = f"Repo '{repo_name}' not found."
        else:
            send_message(
                f"\u26A0\uFE0F *Remove {repo['name']}?*\nThis will unregister it from Swarm Town. Files on disk are kept.",
                chat_id=chat_id,
                reply_markup={
                    "inline_keyboard": [[
                        {"text": "\u274C Confirm Remove", "callback_data": f"confirm_remove:{repo['name']}"},
                        {"text": "\u21A9\uFE0F Cancel", "callback_data": "cancel_remove"},
                    ]]
                },
            )
            reply = None
    elif t == "digest":
        reply = cmd_digest()
    elif t == "costs":
        reply = cmd_costs()
    elif t in ("health", "healthcheck", "health_scan"):
        reply = cmd_health()
    elif t in ("health-scores", "grades", "scores"):
        reply = cmd_health_scores()
    elif t.startswith("budget"):
        reply = cmd_budget(t[6:].strip())
    elif t.startswith("retry"):
        reply = cmd_retry(t[5:].strip())
    elif t in ("metrics", "stats"):
        reply = cmd_metrics()
    elif t.startswith("trends"):
        reply = cmd_trends(t[6:].strip())
    elif t in ("compare", "comparison"):
        reply = cmd_compare()
    elif t in ("activity", "recent"):
        reply = cmd_activity()
    elif t.startswith("notes "):
        reply = cmd_notes(t[6:].strip())
    elif t.startswith("add note "):
        # add note repo: my note text
        parts = text[9:].split(":", 1)
        if len(parts) == 2:
            reply = cmd_add_note(parts[0].strip(), parts[1].strip())
        else:
            reply = "Usage: `add note repo: note text`"
    elif t.startswith("agent-stats ") or t.startswith("agentstats "):
        arg = t.split(" ", 1)[1].strip() if " " in t else ""
        reply = cmd_agent_stats(arg)
    elif t in ("summary", "overview"):
        reply = cmd_summary()
    elif t == "help":
        reply = cmd_help()
    elif t.startswith("search "):
        reply = cmd_search(t[7:].strip())
    elif t in ("active", "running", "live"):
        reply = cmd_active()
    elif t in ("fastest", "speed", "quickest"):
        reply = cmd_fastest()
    elif t in ("stale", "stuck"):
        reply = cmd_stale()
    elif t in ("breakers", "circuit-breakers", "circuit"):
        reply = cmd_circuit_breakers()
    elif t in ("cost-history", "cost history", "costs history"):
        reply = cmd_cost_history()
    elif t.startswith("snapshot "):
        reply = cmd_snapshot(t[9:].strip())
    elif t.startswith("tags"):
        reply = cmd_tags(t[4:].strip())
    elif t in ("uptime", "up"):
        reply = cmd_uptime()
    elif t in ("rotate-token", "rotate token", "token"):
        reply = cmd_rotate_token()
    elif t in ("eta", "estimate", "remaining"):
        reply = cmd_eta()
    elif t in ("forecast", "cost-forecast", "cost forecast"):
        reply = cmd_forecast()
    elif t in ("top", "top5", "best"):
        reply = cmd_top()
    elif t in ("leaderboard", "leader", "rankings", "rank"):
        reply = cmd_leaderboard()
    elif t in ("summary", "overview", "report"):
        reply = cmd_summary()
    elif t in ("queue", "pending", "backlog"):
        reply = cmd_queue()
    elif t in ("errors", "recent-errors", "recent errors"):
        reply = cmd_recent_errors()
    elif t in ("docs", "api-docs", "api docs", "endpoints"):
        reply = cmd_api_docs()
    elif t.startswith("archive "):
        reply = cmd_archive(t[8:].strip())
    elif t.startswith("unarchive "):
        reply = cmd_archive(t[10:].strip(), unarchive=True)
    elif t.startswith("batch "):
        reply = cmd_batch(t[6:])
    elif t == "notify" or t.startswith("notify "):
        reply = cmd_notify(t[7:].strip() if t.startswith("notify ") else "")
    elif t == "pin" or t.startswith("pin "):
        reply = cmd_pin(t[4:].strip() if t.startswith("pin ") else "")
    elif t == "changelog" or t.startswith("changelog "):
        reply = cmd_changelog(t[10:].strip() if t.startswith("changelog ") else _pinned_repo)
    elif t == "timeline" or t.startswith("timeline "):
        reply = cmd_timeline(t[9:].strip() if t.startswith("timeline ") else _pinned_repo)
    elif t in ("app", "dashboard", "open"):
        public_url = os.environ.get("PUBLIC_URL", "http://localhost:6969")
        app_url = f"{public_url}/telegram-app"
        send_message(
            "\U0001F3DC\uFE0F *Swarm Town Dashboard*\nTap the button below to open the Mini App:",
            chat_id=chat_id,
            reply_markup={
                "inline_keyboard": [[
                    {"text": "\U0001F680 Open Swarm Town", "web_app": {"url": app_url}},
                ], [
                    {"text": "\U0001F4CA Status", "callback_data": "cmd_status"},
                    {"text": "\U0001F4B0 Costs", "callback_data": "cmd_costs"},
                    {"text": "\U0001F3C6 Leaderboard", "callback_data": "cmd_leaderboard"},
                ], [
                    {"text": "\U0001F4C8 Forecast", "callback_data": "cmd_forecast"},
                    {"text": "\U0001F4CB Summary", "callback_data": "cmd_summary"},
                ]],
            },
        )
        reply = None  # Already sent
    else:
        # Try fuzzy command matching before forwarding to bridge
        import difflib
        known_cmds = ["status", "start", "stop", "items", "logs", "mistakes", "memory",
                       "plan", "snapshot", "batch", "tags", "eta", "forecast", "health",
                       "costs", "push", "digest", "budget", "metrics", "trends", "compare",
                       "activity", "notes", "search", "stale", "breakers", "grades",
                       "summary", "active", "top", "notify", "pin", "changelog", "timeline",
                       "queue", "leaderboard", "errors", "docs", "uptime", "repos"]
        first_word = t.split()[0] if t.split() else ""
        matches = difflib.get_close_matches(first_word, known_cmds, n=2, cutoff=0.6) if len(first_word) >= 3 else []
        if matches:
            reply = f"\u2753 Unknown command `{first_word}`. Did you mean:\n" + "\n".join(f"  \u27A1\uFE0F `/{m}`" for m in matches)
        else:
            # Forward to the bridge inbox so Claude Code sessions can read it
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
    if not _notify_prefs.get("state_changes", True):
        return
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
    if not _notify_prefs.get("completions", True):
        return
    send_message(f"🎉 *{repo_name}* completed cycle #{cycle_num} — {items_done} items done")


def notify_credits_exhausted(repo_name):
    if not _notify_prefs.get("credits", True):
        return
    send_message(f"💳 Credits exhausted for *{repo_name}*. Will auto-resume when back.")


def notify_credits_restored(repo_name, resume_state):
    if not _notify_prefs.get("credits", True):
        return
    send_message(f"✅ Credits restored! Resuming *{repo_name}* from {resume_state}")


def notify_error(repo_name, error_msg):
    if not _notify_prefs.get("errors", True):
        return
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
                    cbq = update.get("callback_query")
                    if cbq:
                        handle_callback_query(cbq)
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
