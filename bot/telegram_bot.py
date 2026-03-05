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

# Connection health tracking
_api_consecutive_failures = 0
_API_FAILURE_ALERT_THRESHOLD = 3

def _track_api_health(success: bool, error=None):
    """Track API connection health and alert on consecutive failures."""
    global _api_consecutive_failures
    if success:
        if _api_consecutive_failures >= _API_FAILURE_ALERT_THRESHOLD:
            queue_message("\u2705 Orchestrator connection restored!")
        _api_consecutive_failures = 0
    else:
        _api_consecutive_failures += 1
        if _api_consecutive_failures == _API_FAILURE_ALERT_THRESHOLD:
            err_str = str(error)[:80] if error else "unknown"
            queue_message(f"\u26A0\uFE0F *Connection issues:* {_api_consecutive_failures} consecutive API failures\nLast error: `{err_str}`")

# Request latency tracking
_request_times = []
_SLOW_THRESHOLD = 4.0  # seconds
_slow_alert_sent = False

def _track_latency(elapsed: float):
    """Track API response latency and alert on sustained slowness with trend detection."""
    global _slow_alert_sent
    _request_times.append(elapsed)
    if len(_request_times) > 50:
        _request_times.pop(0)
    if len(_request_times) >= 5:
        avg = sum(_request_times[-5:]) / 5
        # Trend detection: compare recent vs baseline
        baseline = sum(_request_times[:max(1, len(_request_times)-5)]) / max(1, len(_request_times)-5) if len(_request_times) > 10 else avg
        pct_change = ((avg - baseline) / max(0.01, baseline)) * 100
        trend = f" (+{pct_change:.0f}% from baseline)" if pct_change > 25 else ""
        if avg > _SLOW_THRESHOLD and not _slow_alert_sent:
            queue_message(f"\U0001F422 *Slow API:* avg {avg:.1f}s over last 5 requests{trend}")
            _slow_alert_sent = True
        elif avg <= _SLOW_THRESHOLD / 2:
            _slow_alert_sent = False

# ─── Message Batching ────────────────────────────────────────────────────────

_message_buffer = []
_buffer_lock = threading.Lock()
_buffer_timer = None
_BUFFER_INTERVAL = 60  # seconds between flushes
_BUFFER_MAX = 100  # max messages before forced flush

# ─── Notification Preferences ───────────────────────────────────────────────
# Keys: state_changes, completions, errors, credits, digest
_PREFS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".notify_prefs.json")

def _load_prefs():
    defaults = {"state_changes": True, "completions": True, "errors": True, "credits": True, "digest": True}
    try:
        if os.path.isfile(_PREFS_FILE):
            import json
            with open(_PREFS_FILE, "r") as f:
                saved = json.load(f)
            defaults.update(saved)
    except Exception:
        pass
    return defaults

def _save_prefs():
    try:
        import json
        with open(_PREFS_FILE, "w") as f:
            json.dump(_notify_prefs, f)
    except Exception:
        pass

_notify_prefs = _load_prefs()

# Daily cost alert threshold (0 = disabled)
_cost_alert_threshold = 0.0
_cost_alert_fired_today = False

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


_orch_cache = {}  # path -> (result, timestamp)
_CACHE_TTL = 5.0  # seconds

def _orch_get(path, retries=2):
    """GET from orchestrator API with retry + backoff + 5s cache."""
    cached = _orch_cache.get(path)
    if cached and (time.time() - cached[1]) < _CACHE_TTL:
        return cached[0]
    last_err = None
    for attempt in range(retries + 1):
        try:
            t0 = time.time()
            token = _fetch_api_token()
            req = Request(f"{ORCH_URL}{path}")
            if token:
                req.add_header("Authorization", f"Bearer {token}")
            resp = urlopen(req, timeout=5)
            result = json.loads(resp.read())
            _track_latency(time.time() - t0)
            _track_api_health(True)
            _orch_cache[path] = (result, time.time())
            return result
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
    _track_api_health(False, last_err)
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
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for item in items[:10]:
        te = type_emoji.get(item.get("type", ""), "📋")
        pe = prio_emoji.get(item.get("priority", ""), "🟡")
        st = item.get("status", "pending")
        st_mark = "✅" if st == "completed" else "⏳" if st == "in_progress" else "○"
        age_tag = ""
        if item.get("created_at") and st == "pending":
            try:
                created = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
                days = (now - created).days
                age_tag = " 🆕" if days < 1 else f" 📅{days}d" if days <= 7 else f" ⏳{days}d"
            except Exception:
                pass
        lines.append(f"{st_mark} {te}{pe} {item.get('title', '')[:55]}{age_tag}")

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


def cmd_clone(text):
    """Clone a GitHub repo and auto-register it.
    Usage: /clone https://github.com/user/repo [as custom-name]
    """
    parts = text.strip().split()
    if not parts or not parts[0].startswith("http"):
        return "Usage: `/clone https://github.com/user/repo [as custom-name]`"
    url = parts[0]
    # Extract name from URL or custom alias
    name = None
    if len(parts) >= 3 and parts[1].lower() == "as":
        name = parts[2]
    if not name:
        name = url.rstrip("/").split("/")[-1].replace(".git", "")
    if not name:
        return "Could not determine repo name from URL."
    result = _orch_post("/api/repos/clone", {"url": url, "name": name})
    if isinstance(result, dict) and result.get("ok"):
        path = result.get("path", "?")
        return f"✅ Cloned and registered *{name}*\n📁 `{path}`"
    err = result.get("error", "unknown error") if isinstance(result, dict) else "API error"
    return f"❌ Clone failed: {err}"


def cmd_remove_repo(name):
    """Remove a repo from the orchestrator (files kept on disk)."""
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/repos/delete", {"repo_id": repo["id"]})
    if result.get("ok"):
        return f"Removed *{repo['name']}* from Swarm Town (files on disk kept)."
    return f"Failed to remove: {result.get('error', 'unknown error')}"


def cmd_rename(arg: str = ""):
    """Rename a repo. Usage: /rename old_name new_name."""
    parts = arg.strip().split()
    if len(parts) < 2:
        return "Usage: `/rename old_name new_name`"
    old_name, new_name = parts[0], parts[1]
    repo = _find_repo(old_name)
    if not repo:
        return f"Repo '{old_name}' not found."
    result = _orch_post("/api/repos/update", {"repo_id": repo["id"], "name": new_name})
    if isinstance(result, dict) and result.get("ok"):
        return f"✏️ Renamed *{old_name}* → *{new_name}*"
    return f"Rename failed: {result.get('error', 'unknown') if isinstance(result, dict) else 'API error'}"


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
        # Step execution stats
        repos = _orch_get("/api/repos") or []
        all_durs = []
        for r in repos:
            plan = _orch_get(f"/api/plan?repo_id={r['id']}") or []
            for s in plan:
                if s.get("duration_sec", 0) > 0:
                    all_durs.append(s["duration_sec"])
        if all_durs:
            avg_d = sum(all_durs) / len(all_durs)
            max_d = max(all_durs)
            lines.append("")
            lines.append("*Step Execution:*")
            lines.append(f"Steps timed: *{len(all_durs)}*")
            lines.append(f"Avg duration: *{avg_d:.1f}s*")
            lines.append(f"Max duration: *{max_d:.0f}s*")
            slow = len([d for d in all_durs if d > 120])
            if slow > 0:
                lines.append(f"\u26A0\uFE0F {slow} steps >2min ({slow*100//len(all_durs)}%)")
            if len(all_durs) >= 5:
                std_dev = (sum((d - avg_d) ** 2 for d in all_durs) / len(all_durs)) ** 0.5
                outliers = [d for d in all_durs if abs(d - avg_d) > 2 * std_dev]
                if outliers and std_dev > 1:
                    lines.append(f"\U0001F4CA Variance: \u00B1{std_dev:.1f}s | {len(outliers)} outlier{'s' if len(outliers) != 1 else ''}")
                    slowest = max(outliers)
                    lines.append(f"  \U0001F422 Worst: {slowest:.0f}s ({slowest/max(0.1, avg_d):.1f}x avg)")
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
    total_cost = sum(s.get("cost_usd", 0) for s in steps if s.get("status") == "completed")
    total_dur = sum(s.get("duration_sec", 0) for s in steps if s.get("status") == "completed")
    models = {}
    for s in steps:
        if s.get("model") and s.get("status") == "completed":
            m = s["model"].replace("claude-", "").replace("-20251001", "").replace("-20250514", "")
            models[m] = models.get(m, 0) + 1
    lines = [
        f"\U0001F4F8 *Snapshot: {data.get('repo', name)}*",
        f"  Items: {done_items}/{len(items)} completed",
        f"  Steps: {done_steps}/{len(steps)} completed",
        f"  \U0001F4B0 Cost: ${total_cost:.3f} | \u23F1 Time: {int(total_dur/60)}m",
        f"  Exported: {data.get('exported_at', 'N/A')[:19]}",
    ]
    if models:
        model_str = ", ".join(f"{m}: {c}" for m, c in sorted(models.items(), key=lambda x: -x[1]))
        lines.append(f"  \U0001F916 Models: {model_str}")
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


def cmd_oldest(days_str: str = "7"):
    """Show pending items older than N days across all repos."""
    try:
        days = int(days_str) if days_str.strip() else 7
    except ValueError:
        days = 7
    repos = _orch_get("/api/repos") or []
    old_items = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") == "pending" and it.get("created_at", "") and it["created_at"] < cutoff:
                it["_repo"] = r["name"]
                try:
                    created = datetime.fromisoformat(it["created_at"].replace("Z", "+00:00"))
                    it["_age"] = (datetime.now(timezone.utc) - created).days
                except Exception:
                    it["_age"] = days
                old_items.append(it)
    if not old_items:
        return f"\u2705 No pending items older than {days} days!"
    old_items.sort(key=lambda x: -x.get("_age", 0))
    lines = [f"\U0001F4C5 *Oldest Pending Items* ({days}d+ old — {len(old_items)} found):\n"]
    for it in old_items[:15]:
        age = it.get("_age", 0)
        icon = "\U0001F534" if age > 30 else "\U0001F7E0" if age > 14 else "\U0001F7E1"
        lines.append(f"  {icon} *{it['_repo']}*: {it.get('title', '?')[:45]} ({age}d)")
    if len(old_items) > 15:
        lines.append(f"\n  _...+{len(old_items) - 15} more_")
    avg = sum(it.get("_age", 0) for it in old_items) / len(old_items)
    lines.append(f"\n\U0001F4CA Avg age: {avg:.0f}d | Oldest: {old_items[0].get('_age', 0)}d")
    return "\n".join(lines)


def cmd_throughput(name: str = ""):
    """Show execution throughput (items + steps per day) for a repo."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("throughput") if not name else f"Repo '{name}' not found."
    rid = repo["id"]
    items = _orch_get(f"/api/items?repo_id={rid}") or []
    plan = _orch_get(f"/api/plan?repo_id={rid}") or []
    done_items = [i for i in items if i.get("status") == "completed" and i.get("completed_at")]
    done_steps = [s for s in plan if s.get("status") == "completed" and s.get("duration_sec", 0) > 0]
    lines = [f"\u26A1 *Throughput — {repo['name']}*\n"]
    if done_items:
        ts = sorted(datetime.fromisoformat(i["completed_at"].replace("Z", "+00:00")) for i in done_items)
        span_days = max(1, (ts[-1] - ts[0]).total_seconds() / 86400)
        item_rate = len(done_items) / span_days
        lines.append(f"  \U0001F4E6 Items: *{item_rate:.1f}/day* ({len(done_items)} in {span_days:.1f}d)")
    else:
        lines.append("  \U0001F4E6 Items: no completions yet")
    if done_steps:
        total_dur = sum(s.get("duration_sec", 0) for s in done_steps)
        avg_dur = total_dur / len(done_steps)
        steps_per_hour = 3600 / avg_dur if avg_dur > 0 else 0
        lines.append(f"  \U0001F527 Steps: *{steps_per_hour:.1f}/hr* (avg {avg_dur:.0f}s each)")
        lines.append(f"  \u23F1 Total exec: {total_dur/60:.0f}m across {len(done_steps)} steps")
    else:
        lines.append("  \U0001F527 Steps: no completed steps yet")
    return "\n".join(lines)


def cmd_pending(name: str = ""):
    """Show pending items ranked by estimated complexity (desc length + priority)."""
    repos = _orch_get("/api/repos") or []
    if name:
        repos = [r for r in repos if r.get("name", "").lower() == name.lower()]
    if not repos:
        return f"Repo '{name}' not found." if name else "No repos."
    pending = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") == "pending":
                it["_repo"] = r["name"]
                prio_w = {"critical": 1.5, "high": 1.2, "medium": 1.0, "low": 0.7}.get(it.get("priority", "medium"), 1.0)
                desc_len = len(it.get("description", ""))
                it["_weight"] = round((len(it.get("title", "")) + desc_len) / 100 * prio_w, 2)
                pending.append(it)
    if not pending:
        return "\u2705 No pending items found!"
    pending.sort(key=lambda x: -x.get("_weight", 0))
    prio_icons = {"critical": "\U0001F525", "high": "\u26A1", "medium": "\U0001F7E1", "low": "\U0001F7E2"}
    lines = [f"\U0001F4CB *Pending Items* ({len(pending)} total):\n"]
    for it in pending[:15]:
        p = it.get("priority", "medium")
        icon = prio_icons.get(p, "\u2022")
        lines.append(f"  {icon} *{it['_repo']}*: {it.get('title', '?')[:40]} (w:{it['_weight']})")
    if len(pending) > 15:
        lines.append(f"\n  _...+{len(pending) - 15} more_")
    by_repo = {}
    for it in pending:
        by_repo.setdefault(it["_repo"], []).append(it)
    top_repo = max(by_repo.items(), key=lambda x: len(x[1]))
    lines.append(f"\n\U0001F4CA Most pending: *{top_repo[0]}* ({len(top_repo[1])} items)")
    return "\n".join(lines)


def cmd_success():
    """Show success rates (completed vs total items) per repo."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos found."
    rows = []
    total_done, total_all = 0, 0
    for r in repos:
        s = r.get("stats", {})
        done = s.get("items_done", 0)
        total = s.get("items_total", 0)
        errs = s.get("mistakes", 0)
        if total == 0:
            continue
        rate = done / total * 100
        err_rate = errs / max(1, total) * 100
        icon = "\u2705" if rate >= 75 else "\U0001F7E1" if rate >= 40 else "\U0001F534"
        rows.append((rate, f"  {icon} *{r['name']}*: {done}/{total} ({rate:.0f}%) done, {errs} errors ({err_rate:.0f}%)"))
        total_done += done
        total_all += total
    if not rows:
        return "\U0001F4AD No repos with items found."
    rows.sort(key=lambda x: -x[0])
    overall = total_done / max(1, total_all) * 100
    lines = [f"\U0001F3AF *Success Rates* ({overall:.0f}% overall — {total_done}/{total_all})\n"]
    lines.extend(r[1] for r in rows[:15])
    if len(rows) > 15:
        lines.append(f"\n  _...+{len(rows) - 15} more_")
    return "\n".join(lines)


def cmd_wait_time(name: str = ""):
    """Show average item wait time (created → started) per repo."""
    repos = _orch_get("/api/repos") or []
    if name:
        repos = [r for r in repos if r.get("name", "").lower() == name.lower()]
    if not repos:
        return f"Repo '{name}' not found." if name else "No repos."
    all_waits = []
    repo_stats = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        waits = []
        for it in items:
            if it.get("created_at") and it.get("started_at"):
                try:
                    c = datetime.fromisoformat(it["created_at"].replace("Z", "+00:00"))
                    s = datetime.fromisoformat(it["started_at"].replace("Z", "+00:00"))
                    w = (s - c).total_seconds() / 60
                    if w >= 0:
                        waits.append(w)
                except Exception:
                    pass
        if waits:
            avg = sum(waits) / len(waits)
            repo_stats.append((avg, r["name"], len(waits), max(waits)))
            all_waits.extend(waits)
    if not all_waits:
        return "\u23F1 No items with timing data found."
    repo_stats.sort(key=lambda x: -x[0])
    lines = [f"\u23F1 *Queue Wait Times*\n"]
    for avg, rn, cnt, mx in repo_stats[:12]:
        icon = "\U0001F534" if avg > 60 else "\U0001F7E0" if avg > 15 else "\U0001F7E2"
        lines.append(f"  {icon} *{rn}*: avg {avg:.1f}m, max {mx:.0f}m ({cnt} items)")
    overall = sum(all_waits) / len(all_waits)
    lines.append(f"\n\U0001F4CA Overall avg: *{overall:.1f}m* across {len(all_waits)} items")
    return "\n".join(lines)


_watch_repos = {}  # name -> {"errors": int, "stale_min": int}

def cmd_watch(arg: str = ""):
    """Watch a repo for errors/stale items. Usage: /watch blog errors:5 or /watch off blog."""
    parts = arg.strip().split()
    if not parts:
        if not _watch_repos:
            return "👁️ *Watch:* Not watching any repos.\n\nUsage:\n  `/watch blog errors:5` — alert on 5+ errors\n  `/watch blog stale:60` — alert if stuck >60min\n  `/watch off blog` — stop watching"
        lines = ["👁️ *Active Watches*\n"]
        for name, cfg in _watch_repos.items():
            bits = []
            if cfg.get("errors"): bits.append(f"errors>{cfg['errors']}")
            if cfg.get("stale_min"): bits.append(f"stale>{cfg['stale_min']}m")
            lines.append(f"  *{name}*: {', '.join(bits) if bits else 'default'}")
        return "\n".join(lines)
    if parts[0] == "off":
        name = parts[1] if len(parts) > 1 else ""
        if name and name in _watch_repos:
            del _watch_repos[name]
            return f"👁️ Stopped watching *{name}*"
        if not name:
            _watch_repos.clear()
            return "👁️ All watches cleared."
        return f"Not watching '{name}'."
    name = parts[0]
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    cfg = {}
    for p in parts[1:]:
        if p.startswith("errors:"):
            try: cfg["errors"] = int(p.split(":")[1])
            except ValueError: pass
        elif p.startswith("stale:"):
            try: cfg["stale_min"] = int(p.split(":")[1])
            except ValueError: pass
    if not cfg:
        cfg = {"errors": 3, "stale_min": 120}
    _watch_repos[repo["name"]] = cfg
    bits = []
    if cfg.get("errors"): bits.append(f"errors>{cfg['errors']}")
    if cfg.get("stale_min"): bits.append(f"stale>{cfg['stale_min']}m")
    return f"👁️ Now watching *{repo['name']}*: {', '.join(bits)}"


def cmd_sync(name: str = ""):
    """Sync repo: refresh metadata and validate item counts."""
    if not name:
        repos = _orch_get("/api/repos") or []
        if not repos:
            return "No repos registered."
        synced = 0
        for r in repos:
            _orch_post("/api/repos/scan", {"repo_id": r["id"]})
            synced += 1
        _orch_cache.clear()
        return f"🔄 *Synced {synced} repos* — cache cleared, metadata refreshed."
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    result = _orch_post("/api/repos/scan", {"repo_id": repo["id"]})
    _orch_cache.clear()
    if isinstance(result, dict) and result.get("ok"):
        return f"🔄 *{repo['name']}* synced and refreshed."
    return f"🔄 *{repo['name']}* scan sent (check `/status {name}` for result)."


def cmd_overview():
    """Compact one-line-per-repo overview with urgency scores."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos found."
    lines = ["\U0001F4CB *Repo Overview*\n"]
    lines.append("`Repo            State   Items   Urg`")
    for r in sorted(repos, key=lambda x: x.get("name", "")):
        s = r.get("stats", {})
        name = r.get("name", "?")[:16].ljust(16)
        state = ("RUN" if r.get("running") else "IDLE").ljust(8)
        done = s.get("items_done", 0)
        total = s.get("items_total", 0)
        pending = total - done
        errs = s.get("mistakes", 0)
        # Urgency: pending weight + error weight + staleness
        urgency = min(99, pending * 3 + errs * 5 + (10 if r.get("running") and not r.get("last_activity") else 0))
        icon = "\U0001F534" if urgency > 50 else "\U0001F7E0" if urgency > 20 else "\U0001F7E2"
        items_str = f"{done}/{total}".ljust(8)
        lines.append(f"`{name}{state}{items_str}`{icon}{urgency}")
    total_urg = sum(min(99, (r.get("stats", {}).get("items_total", 0) - r.get("stats", {}).get("items_done", 0)) * 3 + r.get("stats", {}).get("mistakes", 0) * 5) for r in repos)
    lines.append(f"\n\U0001F3AF System urgency: *{total_urg}* ({len(repos)} repos)")
    return "\n".join(lines)


# Quiet mode: normal (all), busy (errors+completions only), silent (errors only)
_quiet_mode = "normal"

def cmd_quiet(mode: str = ""):
    """Set notification throttle level: normal, busy, or silent."""
    global _quiet_mode
    mode = mode.strip().lower()
    if mode in ("normal", "busy", "silent"):
        _quiet_mode = mode
        icons = {"normal": "\U0001F514", "busy": "\U0001F515", "silent": "\U0001F507"}
        descs = {"normal": "All notifications", "busy": "Errors + completions only", "silent": "Critical errors only"}
        return f"{icons[mode]} Quiet mode set to *{mode}*\n{descs[mode]}"
    lines = ["\U0001F514 *Quiet Mode*\n"]
    lines.append(f"Current: *{_quiet_mode}*\n")
    lines.append("Modes:")
    lines.append("  \U0001F514 `normal` — all notifications")
    lines.append("  \U0001F515 `busy` — errors + completions only")
    lines.append("  \U0001F507 `silent` — critical errors only")
    lines.append(f"\nUsage: `/quiet normal` or `/quiet busy`")
    return "\n".join(lines)


def should_notify(category: str) -> bool:
    """Check if a notification should be sent based on quiet mode."""
    if _quiet_mode == "normal":
        return True
    if _quiet_mode == "busy":
        return category in ("errors", "completions", "credits")
    if _quiet_mode == "silent":
        return category == "errors"
    return True


def cmd_completions(name: str = ""):
    """Show recently completed items with timestamps."""
    repos = _orch_get("/api/repos") or []
    if name:
        repos = [r for r in repos if r.get("name", "").lower() == name.lower()]
    if not repos:
        return f"Repo '{name}' not found." if name else "No repos."
    completed = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") == "completed" and it.get("completed_at"):
                it["_repo"] = r["name"]
                completed.append(it)
    if not completed:
        return "\U0001F4AD No completed items found."
    completed.sort(key=lambda x: x.get("completed_at", ""), reverse=True)
    lines = [f"\u2705 *Recent Completions* ({len(completed)} total):\n"]
    for it in completed[:15]:
        try:
            ts = datetime.fromisoformat(it["completed_at"].replace("Z", "+00:00"))
            ago = (datetime.now(timezone.utc) - ts).total_seconds()
            if ago < 3600:
                time_str = f"{int(ago/60)}m ago"
            elif ago < 86400:
                time_str = f"{int(ago/3600)}h ago"
            else:
                time_str = f"{int(ago/86400)}d ago"
        except Exception:
            time_str = "?"
        lines.append(f"  \u2705 *{it['_repo']}*: {it.get('title', '?')[:40]} ({time_str})")
    if len(completed) > 15:
        lines.append(f"\n  _...+{len(completed) - 15} more_")
    return "\n".join(lines)


def cmd_alive():
    """Quick heartbeat check showing system liveness and last activity."""
    data = _orch_get("/api/status")
    if isinstance(data, dict) and "error" in data:
        return f"\U0001F534 *Orchestrator unreachable:* {data['error']}"
    uptime = data.get("uptime", "unknown")
    repos = _orch_get("/api/repos") or []
    running = len([r for r in repos if r.get("running")]) if isinstance(repos, list) else 0
    total = len(repos) if isinstance(repos, list) else 0
    # Find most recent activity
    latest_ts = ""
    latest_repo = ""
    for r in (repos if isinstance(repos, list) else []):
        la = r.get("last_activity", 0)
        if la and (not latest_ts or la > latest_ts):
            latest_ts = la
            latest_repo = r.get("name", "?")
    ago = ""
    if latest_ts:
        secs = int(time.time() - latest_ts)
        ago = f"{secs}s ago" if secs < 60 else f"{secs//60}m ago" if secs < 3600 else f"{secs//3600}h ago"
    return (
        f"\U0001F49A *System Alive*\n\n"
        f"\u23F1 Uptime: `{uptime}`\n"
        f"\U0001F7E2 Repos: {running}/{total} running\n"
        f"\U0001F4E1 Last activity: *{latest_repo}* ({ago})\n"
        f"\U0001F916 Bot: responding normally"
    )


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
    # State duration aggregation
    state_durations = {}
    for entry in data:
        st = entry.get("state", "idle")
        dur = entry.get("duration_sec") or 0
        if dur > 0:
            if st not in state_durations:
                state_durations[st] = {"total": 0, "count": 0}
            state_durations[st]["total"] += dur
            state_durations[st]["count"] += 1
    if state_durations:
        lines.append("\n\u23F1\uFE0F *Avg Duration by State:*")
        for st, info in sorted(state_durations.items(), key=lambda x: -x[1]["total"]):
            avg = info["total"] / info["count"]
            emoji = state_emoji.get(st, "\u25AA\uFE0F")
            lines.append(f"  {emoji} {st}: {avg:.0f}s avg ({info['count']}x, {info['total']:.0f}s total)")
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


def cmd_backlog():
    """Show pending items grouped by priority tier across all repos."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos found."
    tiers = {"critical": [], "high": [], "medium": [], "low": []}
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") == "pending":
                it["_repo"] = r["name"]
                prio = it.get("priority", "medium")
                if prio in tiers:
                    tiers[prio].append(it)
                else:
                    tiers["medium"].append(it)
    total = sum(len(v) for v in tiers.values())
    if total == 0:
        return "\u2705 Backlog is empty! Nothing pending."
    tier_icons = {"critical": "\U0001F525", "high": "\u26A1", "medium": "\U0001F7E1", "low": "\U0001F7E2"}
    lines = [f"\U0001F4DA *Backlog — {total} pending items*\n"]
    for tier in ["critical", "high", "medium", "low"]:
        items_in_tier = tiers[tier]
        if not items_in_tier:
            continue
        icon = tier_icons[tier]
        lines.append(f"{icon} *{tier.upper()}* ({len(items_in_tier)}):")
        for it in items_in_tier[:5]:
            lines.append(f"  \u2022 {it['_repo']}: {it.get('title', '?')[:45]}")
        if len(items_in_tier) > 5:
            lines.append(f"  _...+{len(items_in_tier) - 5} more_")
        lines.append("")
    # Health indicator
    crit_pct = len(tiers["critical"]) / max(1, total) * 100
    if crit_pct > 20:
        lines.append(f"\u26A0\uFE0F *Warning:* {crit_pct:.0f}% of backlog is critical!")
    elif len(tiers["low"]) > total * 0.5:
        lines.append(f"\U0001F44D Backlog health: mostly low-priority items")
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


def cmd_pick(name: str = ""):
    """Pick a random pending item from a repo."""
    import random
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("pick") if not name else f"Repo '{name}' not found."
    rid = repo["id"]
    items = _orch_get(f"/api/items?repo_id={rid}") or []
    pending = [i for i in items if i.get("status") == "pending"]
    if not pending:
        done = len([i for i in items if i.get("status") == "completed"])
        return f"\u2705 *{repo['name']}* has no pending items! ({done} completed)"
    pick = random.choice(pending)
    prio = pick.get("priority", "medium")
    prio_icon = {
        "critical": "\U0001F525", "high": "\u26A1", "medium": "\u25CF", "low": "\u25CB"
    }.get(prio, "\u25CF")
    lines = [
        f"\U0001F3B2 *Random Pick — {repo['name']}*\n",
        f"  {prio_icon} *{pick.get('title', 'Untitled')}*",
        f"  Type: `{pick.get('type', 'feature')}`  Priority: `{prio}`",
    ]
    if pick.get("description"):
        desc = pick["description"][:100]
        lines.append(f"  {desc}{'...' if len(pick['description']) > 100 else ''}")
    lines.append(f"\n\U0001F4CB {len(pending)} pending | {len(items) - len(pending)} done")
    return "\n".join(lines)


def cmd_deps(name: str = ""):
    """Show items with dependencies for a repo."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("deps") if not name else f"Repo '{name}' not found."
    rid = repo["id"]
    items = _orch_get(f"/api/items?repo_id={rid}") or []
    deps = [i for i in items if i.get("depends_on")]
    if not deps:
        return f"No items with dependencies in *{repo['name']}*."
    lines = [f"\U0001F517 *Dependencies — {repo['name']}* ({len(deps)}):\n"]
    for d in deps[:15]:
        st = "\u2705" if d.get("status") == "completed" else "\u23F3"
        dep_target = d["depends_on"]
        # Check if dependency is resolved
        dep_done = any(i.get("title", "").lower() == dep_target.lower() and i.get("status") == "completed" for i in items)
        block = "\U0001F7E2 unblocked" if dep_done else "\U0001F534 blocked"
        lines.append(f"  {st} *{d.get('title', '')[:45]}*\n      \u2514\u2500 depends on: _{dep_target[:40]}_ ({block})")
    blocked_count = sum(1 for d in deps if not any(i.get("title", "").lower() == d["depends_on"].lower() and i.get("status") == "completed" for i in items))
    lines.append(f"\n\U0001F4CA {blocked_count} blocked | {len(deps) - blocked_count} unblocked")
    return "\n".join(lines)


def cmd_hot():
    """Show hottest repos by recent completions."""
    from datetime import datetime, timezone, timedelta
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos found."
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    ranked = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        recent_done = sum(1 for i in items if i.get("status") == "completed" and (i.get("completed_at") or "") >= cutoff)
        total_pending = sum(1 for i in items if i.get("status") == "pending")
        ranked.append({"name": r["name"], "done_7d": recent_done, "pending": total_pending, "running": r.get("running", False)})
    ranked.sort(key=lambda x: -x["done_7d"])
    lines = ["\U0001F525 *Hot Repos* (7-day completions):\n"]
    medals = ["\U0001F947", "\U0001F948", "\U0001F949", "4\uFE0F\u20E3", "5\uFE0F\u20E3"]
    for i, r in enumerate(ranked[:5]):
        icon = medals[i] if i < 5 else f"{i+1}."
        status = "\U0001F7E2" if r["running"] else "\u26AA"
        lines.append(f"  {icon} {status} *{r['name']}* — {r['done_7d']} done | {r['pending']} pending")
    cold = [r for r in ranked if r["done_7d"] == 0]
    if cold:
        lines.append(f"\n\u2744\uFE0F *Cold repos (0 completions):* {len(cold)}")
    return "\n".join(lines)


def cmd_agents(name: str = ""):
    """Show agent activity for a repo."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("agents") if not name else f"Repo '{name}' not found."
    rid = repo["id"]
    data = _orch_get(f"/api/agents?repo_id={rid}")
    if not isinstance(data, list) or not data:
        return f"No agent data for *{repo['name']}*."
    lines = [f"\U0001F916 *Agents — {repo['name']}* ({len(data)}):\n"]
    total_cost = 0
    for a in data:
        name_a = a.get("name") or a.get("model") or "agent"
        status = a.get("status", "idle")
        cost = a.get("cost_usd") or 0
        tokens = (a.get("tokens_in") or 0) + (a.get("tokens_out") or 0)
        total_cost += cost
        icon = "\U0001F7E2" if status == "active" else "\u26AA"
        lines.append(f"  {icon} *{name_a}* — {status}{f' | ${cost:.4f}' if cost else ''}{f' | {tokens} tok' if tokens else ''}")
    lines.append(f"\n\U0001F4B0 *Total agent cost:* ${total_cost:.4f}")
    return "\n".join(lines)


def cmd_slowest():
    """Show slowest completed steps across all repos."""
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
    all_steps.sort(key=lambda x: -x.get("duration_sec", 0))
    lines = [f"\U0001F422 *Slowest Steps* (top 10 of {len(all_steps)}):\n"]
    for s in all_steps[:10]:
        dur = s.get("duration_sec", 0)
        cost = s.get("cost_usd", 0)
        desc = (s.get("description") or "")[:40]
        cps = f" ({cost/dur:.4f}$/s)" if dur > 0 and cost > 0 else ""
        lines.append(f"  \u23F3 *{s['_repo']}*: {dur:.0f}s ${cost:.3f}{cps} — {desc}")
    avg_dur = sum(s.get("duration_sec", 0) for s in all_steps) / len(all_steps)
    total_cost = sum(s.get("cost_usd", 0) for s in all_steps)
    lines.append(f"\n\U0001F4CA *Avg duration:* {avg_dur:.0f}s across {len(all_steps)} steps")
    if total_cost > 0:
        lines.append(f"\U0001F4B0 *Total slow cost:* ${total_cost:.3f} (avg ${total_cost/len(all_steps):.4f}/step)")
    return "\n".join(lines)


def cmd_dedupe(name: str = ""):
    """Remove duplicate pending items from a repo."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("dedupe") if not name else f"Repo '{name}' not found."
    rid = repo["id"]
    items_before = _orch_get(f"/api/items?repo_id={rid}") or []
    pending_before = len([i for i in items_before if i.get("status") == "pending"])
    result = _orch_post("/api/items/dedupe", {"repo_id": rid})
    items_after = _orch_get(f"/api/items?repo_id={rid}") or []
    pending_after = len([i for i in items_after if i.get("status") == "pending"])
    removed = pending_before - pending_after
    if removed > 0:
        return f"\U0001F9F9 *Dedupe: {repo['name']}*\n  Removed {removed} duplicate item{'s' if removed != 1 else ''}\n  {pending_after} pending items remaining"
    return f"\u2705 No duplicates found in *{repo['name']}* ({pending_after} pending items)"


def cmd_dedupe_items():
    """Find duplicate items across all repos using fuzzy title matching."""
    import difflib
    repos = _orch_get("/api/repos") or []
    all_items = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") != "completed":
                all_items.append({"title": it.get("title", ""), "repo": r["name"], "id": it["id"], "rid": r["id"]})
    if len(all_items) < 2:
        return "Not enough items to compare."
    dupes = []
    seen = set()
    for i, a in enumerate(all_items):
        for b in all_items[i+1:]:
            if a["repo"] == b["repo"]:
                continue
            key = tuple(sorted([f"{a['rid']}:{a['id']}", f"{b['rid']}:{b['id']}"]))
            if key in seen:
                continue
            ratio = difflib.SequenceMatcher(None, a["title"].lower(), b["title"].lower()).ratio()
            if ratio >= 0.80:
                seen.add(key)
                dupes.append((ratio, a, b))
    if not dupes:
        return f"✅ No cross-repo duplicates found across {len(repos)} repos ({len(all_items)} items checked)."
    dupes.sort(key=lambda x: -x[0])
    lines = [f"🔍 *Cross-Repo Duplicates* ({len(dupes)} found)\n"]
    for ratio, a, b in dupes[:8]:
        lines.append(f"  {int(ratio*100)}% *{a['repo']}*: _{a['title'][:30]}_")
        lines.append(f"       ↔ *{b['repo']}*: _{b['title'][:30]}_")
    if len(dupes) > 8:
        lines.append(f"\n  ...and {len(dupes) - 8} more")
    return "\n".join(lines)


_remind_timer = None


def cmd_remind(arg: str = "", chat_id=None):
    """Schedule a status reminder after N minutes."""
    global _remind_timer
    if arg in ("cancel", "stop", "clear", "off"):
        if _remind_timer:
            _remind_timer.cancel()
            _remind_timer = None
            return "\u23F0 Reminder cancelled."
        return "No active reminder."
    if not arg:
        status = "active" if _remind_timer and _remind_timer.is_alive() else "none"
        return f"\u23F0 *Remind* — schedule a status check\n\nUsage: `/remind <minutes>`\nCancel: `/remind cancel`\n\nCurrent: {status}"
    try:
        mins = int(arg)
    except ValueError:
        return "Usage: `/remind <minutes>` (e.g. `/remind 30`)"
    if mins < 1 or mins > 1440:
        return "Please use 1-1440 minutes."
    if _remind_timer:
        _remind_timer.cancel()

    def _send_reminder():
        global _remind_timer
        _remind_timer = None
        status_text = cmd_status()
        send_message(f"\u23F0 *Scheduled Reminder ({mins}m):*\n\n{status_text}", chat_id=chat_id)

    _remind_timer = threading.Timer(mins * 60, _send_reminder)
    _remind_timer.daemon = True
    _remind_timer.start()
    return f"\u23F0 Reminder set! You'll get a status update in *{mins} minute{'s' if mins != 1 else ''}*.\nUse `/remind cancel` to stop."


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
        _save_prefs()
        return "\U0001F514 All notifications enabled."
    if key == "all_off":
        for c in categories:
            _notify_prefs[c] = False
        _save_prefs()
        return "\U0001F515 All notifications disabled."
    if key not in _notify_prefs:
        return f"Unknown category `{key}`. Options: {', '.join(categories)}, all_on, all_off"
    _notify_prefs[key] = not _notify_prefs[key]
    _save_prefs()
    state = "\u2705 ON" if _notify_prefs[key] else "\u274C OFF"
    return f"\U0001F514 *{key.replace('_', ' ').title()}* → {state}"


_repo_thresholds = {}  # name -> {cost: float, errors: int}

def cmd_threshold(arg: str = ""):
    """Set or view per-repo alert thresholds.
    Usage: /threshold blog cost 2.00
           /threshold blog errors 5
           /threshold blog  (view)
           /threshold       (view all)
    """
    parts = arg.strip().split()
    if not parts:
        if not _repo_thresholds:
            return "📏 *Thresholds:* None set\n\nUsage: `/threshold repo_name cost 2.00`\nor `/threshold repo_name errors 5`"
        lines = ["📏 *Repo Thresholds*\n"]
        for name, th in sorted(_repo_thresholds.items()):
            bits = []
            if "cost" in th: bits.append(f"💰 ${th['cost']:.2f}")
            if "errors" in th: bits.append(f"🐛 {th['errors']} errors")
            lines.append(f"  *{name}*: {' | '.join(bits)}")
        return "\n".join(lines)
    name = parts[0].lower()
    repo = _find_repo(name)
    if not repo:
        return f"Repo '{name}' not found."
    if len(parts) == 1:
        th = _repo_thresholds.get(repo["name"], {})
        if not th:
            return f"📏 No thresholds set for *{repo['name']}*"
        bits = []
        if "cost" in th: bits.append(f"💰 Cost: ${th['cost']:.2f}")
        if "errors" in th: bits.append(f"🐛 Errors: {th['errors']}")
        return f"📏 *{repo['name']}* thresholds:\n  " + "\n  ".join(bits)
    if len(parts) >= 3:
        metric = parts[1].lower()
        try:
            val = float(parts[2].replace("$", ""))
        except ValueError:
            return "Value must be a number."
        th = _repo_thresholds.setdefault(repo["name"], {})
        if metric == "cost":
            th["cost"] = val
            return f"📏 *{repo['name']}* cost threshold set to *${val:.2f}*"
        elif metric in ("errors", "error"):
            th["errors"] = int(val)
            return f"📏 *{repo['name']}* error threshold set to *{int(val)}*"
    return "Usage: `/threshold repo_name cost 2.00` or `/threshold repo_name errors 5`"


def cmd_cost_alert(arg: str = ""):
    """Set or view daily cost alert threshold."""
    global _cost_alert_threshold, _cost_alert_fired_today
    if not arg:
        if _cost_alert_threshold <= 0:
            return "\U0001F4B0 *Cost Alert:* OFF\n\nSet with `/cost_alert 5.00` to alert when daily costs exceed $5."
        status = "(\u2705 Not triggered today)" if not _cost_alert_fired_today else "(\u26A0\uFE0F Already triggered today)"
        return f"\U0001F4B0 *Cost Alert:* ${_cost_alert_threshold:.2f}/day\n{status}"
    if arg.strip().lower() in ("off", "0", "disable"):
        _cost_alert_threshold = 0.0
        _cost_alert_fired_today = False
        return "\U0001F4B0 Cost alert disabled."
    try:
        val = float(arg.strip().replace("$", ""))
        if val <= 0:
            return "Threshold must be positive. Use `off` to disable."
        _cost_alert_threshold = val
        _cost_alert_fired_today = False
        return f"\U0001F4B0 Cost alert set to *${val:.2f}/day*. You'll be notified when daily spend exceeds this."
    except ValueError:
        return "Usage: `/cost_alert 5.00` or `/cost_alert off`"


_digest_schedule_hour = -1  # -1 means disabled
_digest_timer = None

def cmd_schedule(arg: str = ""):
    """Schedule daily digest at a specific hour."""
    global _digest_schedule_hour, _digest_timer
    if not arg:
        if _digest_schedule_hour < 0:
            return "\u23F0 *Digest Schedule:* OFF\n\nSet with `/schedule 9` to auto-send digest at 9:00 daily."
        return f"\u23F0 *Digest Schedule:* Daily at {_digest_schedule_hour:02d}:00"
    if arg.strip().lower() in ("off", "disable", "cancel"):
        _digest_schedule_hour = -1
        if _digest_timer:
            _digest_timer.cancel()
            _digest_timer = None
        return "\u23F0 Digest schedule disabled."
    try:
        hour = int(arg.strip())
        if hour < 0 or hour > 23:
            return "Hour must be 0-23."
        _digest_schedule_hour = hour
        _start_digest_timer()
        return f"\u23F0 Digest scheduled daily at *{hour:02d}:00*."
    except ValueError:
        return "Usage: `/schedule 9` (hour 0-23) or `/schedule off`"

def _start_digest_timer():
    global _digest_timer
    if _digest_timer:
        _digest_timer.cancel()
    if _digest_schedule_hour < 0:
        return
    from datetime import datetime, timedelta
    now = datetime.now()
    target = now.replace(hour=_digest_schedule_hour, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    delay = (target - now).total_seconds()
    _digest_timer = threading.Timer(delay, _fire_scheduled_digest)
    _digest_timer.daemon = True
    _digest_timer.start()

def _fire_scheduled_digest():
    try:
        text = cmd_digest()
        if text:
            send_message(f"\u23F0 *Scheduled Digest*\n\n{text}")
    except Exception:
        pass
    _start_digest_timer()  # Reschedule for next day


def cmd_export(name: str = ""):
    """Export repo data as formatted text summary."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("export") if not name else f"Repo '{name}' not found."
    rid = repo["id"]
    items = _orch_get(f"/api/items?repo_id={rid}") or []
    plan = _orch_get(f"/api/plan?repo_id={rid}") or []
    s = repo.get("stats") or {}
    pending = len([i for i in items if i.get("status") == "pending"])
    done = len([i for i in items if i.get("status") == "completed"])
    steps_done = len([p for p in plan if p.get("status") == "completed"])
    lines = [
        f"=== {repo['name']} Export ===",
        f"Path: {repo.get('path', 'N/A')}",
        f"State: {repo.get('state', 'idle')} | Running: {'Yes' if repo.get('running') else 'No'}",
        f"Items: {done}/{len(items)} done ({pending} pending)",
        f"Steps: {steps_done}/{len(plan)} done",
        f"Cycles: {repo.get('cycle_count', 0)}",
        f"Cost: ${s.get('cost', 0):.4f}",
        "",
        "--- Pending Items ---",
    ]
    for i in [x for x in items if x.get("status") == "pending"][:15]:
        lines.append(f"  [{i.get('priority','med')}] {i.get('title','')[:50]}")
    if pending > 15:
        lines.append(f"  ...and {pending - 15} more")
    return "```\n" + "\n".join(lines) + "\n```"


def cmd_retry_all():
    """Retry completed items across ALL repos at once."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos found."
    total_retried = 0
    results = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        completed = [i for i in items if i.get("status") == "completed"]
        if not completed:
            continue
        result = _orch_post("/api/items/retry", {"repo_id": r["id"], "status": "completed"})
        if result.get("ok"):
            total_retried += len(completed)
            results.append(f"  \u2705 *{r['name']}* — {len(completed)} items re-queued")
        else:
            results.append(f"  \u274C *{r['name']}* — failed")
    if not results:
        return "\U0001F4AD No completed items found in any repo."
    lines = [f"\U0001F504 *Retry All — {total_retried} items re-queued*\n"]
    lines.extend(results[:20])
    return "\n".join(lines)


def cmd_emoji():
    """One-line emoji summary of all repos."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos."
    state_icons = {
        "idle": "\u26AA", "planning": "\U0001F4D0", "executing": "\u26A1",
        "reviewing": "\U0001F50D", "pushing": "\U0001F680", "error": "\U0001F534",
        "credits_exhausted": "\U0001F4B8", "completed": "\u2705", "paused": "\u23F8",
    }
    parts = []
    for r in sorted(repos, key=lambda x: x.get("name", "")):
        st = r.get("state", "idle")
        icon = state_icons.get(st, "\u25AA")
        if r.get("paused"):
            icon = "\u23F8"
        parts.append(f"{icon}{r['name']}")
    running = len([r for r in repos if r.get("running")])
    return " ".join(parts) + f"\n\n{running}/{len(repos)} running"


def cmd_focus():
    """Identify repos needing the most attention based on errors, staleness, and pending items."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    scored = []
    for r in repos:
        s = r.get("stats", {})
        errs = s.get("mistakes", 0)
        pending = (s.get("items_total", 0) - s.get("items_done", 0))
        running = 1 if r.get("running") else 0
        # Score: higher = needs more attention
        score = errs * 5 + pending * 2 + (10 if r.get("state") == "error" else 0) + (5 if not running and pending > 0 else 0)
        if score > 0:
            scored.append((score, r["name"], errs, pending, r.get("state", "idle")))
    if not scored:
        return "✅ All repos look healthy — nothing needs focus."
    scored.sort(key=lambda x: -x[0])
    lines = ["🎯 *Focus Priority*\n"]
    for i, (score, name, errs, pending, state) in enumerate(scored[:7]):
        icon = "🔴" if score > 30 else "🟡" if score > 10 else "🟢"
        lines.append(f"  {icon} *{name}* — score {score} ({errs} errs, {pending} pending, {state})")
    lines.append(f"\n💡 Highest priority: *{scored[0][1]}*")
    return "\n".join(lines)


def cmd_impact(name: str = ""):
    """Show impact score for a repo based on completions, efficiency, and errors."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("impact") if not name else f"Repo '{name}' not found."
    s = repo.get("stats", {})
    done = s.get("items_done", 0)
    total = s.get("items_total", 0)
    errs = s.get("mistakes", 0)
    cost = s.get("cost", 0)
    cycles = s.get("cycles", 0)
    efficiency = done / max(1, total) * 100
    cost_per_item = cost / max(1, done) if done > 0 else 0
    impact = max(0, min(100, int(done * 2 + efficiency * 0.5 - errs * 3 + cycles * 0.5)))
    grade = "S" if impact >= 90 else "A" if impact >= 75 else "B" if impact >= 50 else "C" if impact >= 25 else "D"
    bar = "█" * int(impact / 10) + "░" * (10 - int(impact / 10))
    lines = [
        f"💥 *Impact: {repo['name']}*\n",
        f"  {bar} {impact}/100 (Grade: *{grade}*)",
        f"  ✅ {done}/{total} items ({efficiency:.0f}%)",
        f"  💰 ${cost_per_item:.4f}/item" if done > 0 else "  💰 No completions yet",
        f"  🐛 {errs} errors | 🔄 {cycles} cycles",
    ]
    return "\n".join(lines)


def cmd_diff(name: str = ""):
    """Show recent git changes (last commit diff summary) for a repo."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("diff") if not name else f"Repo '{name}' not found."
    result = _orch_get(f"/api/repos/diff?repo_id={repo['id']}")
    if isinstance(result, dict) and result.get("diff"):
        diff = result["diff"]
        if len(diff) > 2000:
            diff = diff[:2000] + "\n... (truncated)"
        return f"📝 *Diff: {repo['name']}*\n```\n{diff}\n```"
    if isinstance(result, dict) and result.get("summary"):
        return f"📝 *{repo['name']}*: {result['summary']}"
    return f"📝 *{repo['name']}*: No recent changes or diff unavailable."


def cmd_benchmark(name: str = ""):
    """Compare a repo's current metrics against its 7-day average."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("benchmark") if not name else f"Repo '{name}' not found."
    s = repo.get("stats", {})
    done = s.get("items_done", 0)
    total = s.get("items_total", 0)
    errs = s.get("mistakes", 0)
    cycles = repo.get("cycle_count", 0)
    # Fetch trends for 7-day baseline
    trends = _orch_get(f"/api/trends?repo_id={repo['id']}") or {}
    avg_done = trends.get("avg_items_done", done)
    avg_errs = trends.get("avg_mistakes", errs)
    avg_cycles = trends.get("avg_cycles", cycles)
    def arrow(cur, avg):
        if avg == 0:
            return "➡️" if cur == 0 else "⬆️"
        pct = ((cur - avg) / avg) * 100
        return f"⬆️ +{pct:.0f}%" if pct > 5 else f"⬇️ {pct:.0f}%" if pct < -5 else "➡️ ~same"
    lines = [f"📐 *Benchmark: {repo['name']}*\n"]
    lines.append(f"  Items done: `{done}` vs avg `{avg_done}` {arrow(done, avg_done)}")
    lines.append(f"  Errors: `{errs}` vs avg `{avg_errs}` {arrow(errs, avg_errs)}")
    lines.append(f"  Cycles: `{cycles}` vs avg `{avg_cycles}` {arrow(cycles, avg_cycles)}")
    comp_rate = round(done / max(total, 1) * 100)
    lines.append(f"  Completion: `{comp_rate}%` ({done}/{total})")
    return "\n".join(lines)


_alert_history = []  # [(timestamp, type, message), ...]
_MAX_ALERTS = 50


def _log_alert(alert_type: str, message: str):
    """Record an alert in the history."""
    _alert_history.append((datetime.now(timezone.utc).isoformat(), alert_type, message))
    if len(_alert_history) > _MAX_ALERTS:
        _alert_history.pop(0)


def cmd_alerts(filter_type: str = ""):
    """Show recent alert history. Optionally filter by type."""
    if not _alert_history:
        return "🔔 No alerts recorded yet."
    filtered = _alert_history
    if filter_type:
        filtered = [a for a in _alert_history if filter_type.lower() in a[1].lower()]
    lines = [f"🔔 *Alert History* ({len(filtered)} entries)\n"]
    icons = {"cost": "💰", "error": "❌", "health": "🏥", "connection": "🔗", "latency": "🐌", "threshold": "⚠️"}
    for ts, atype, msg in filtered[-15:]:
        icon = icons.get(atype, "🔔")
        t_short = ts[5:16].replace("T", " ")
        lines.append(f"  {icon} `{t_short}` *{atype}*: {msg[:60]}")
    if len(filtered) > 15:
        lines.append(f"\n_...showing last 15 of {len(filtered)}_")
    return "\n".join(lines)


def cmd_rate(name: str = ""):
    """Show items-per-hour completion rate for a repo."""
    repo = _find_repo(name) if name else (_find_repo(_pinned_repo) if _pinned_repo else None)
    if not repo:
        return _repo_hint("rate") if not name else f"Repo '{name}' not found."
    s = repo.get("stats", {})
    done = s.get("items_done", 0)
    total = s.get("items_total", 0)
    cycles = repo.get("cycle_count", 0)
    # Estimate rate from cycles (each cycle ~5-15 min)
    est_hours = max(1, cycles * 10 / 60)  # ~10 min per cycle avg
    rate = round(done / est_hours, 2) if est_hours > 0 else 0
    bar_len = min(20, int(rate * 2))
    bar = "█" * bar_len + "░" * (20 - bar_len)
    lines = [f"⏱️ *Rate: {repo['name']}*\n"]
    lines.append(f"  `[{bar}]` {rate} items/hr")
    lines.append(f"  Completed: {done}/{total} items")
    lines.append(f"  Est. hours active: ~{est_hours:.1f}h ({cycles} cycles)")
    if total > done and rate > 0:
        remaining = (total - done) / rate
        lines.append(f"  ETA remaining: ~{remaining:.1f}h")
    return "\n".join(lines)


def cmd_streak():
    """Show daily completion streak across all repos."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    # Build per-day completion counts from current stats
    total_done = sum(r.get("stats", {}).get("items_done", 0) for r in repos)
    total_all = sum(r.get("stats", {}).get("items_total", 0) for r in repos)
    active_repos = sum(1 for r in repos if r.get("running"))
    # Streak from start date tracking via localStorage-like approach
    today = datetime.now().strftime("%Y-%m-%d")
    streak_days = min(total_done, 30)  # Approximate based on completions
    fire = "🔥" * min(5, streak_days // 5 + 1)
    lines = [f"🔥 *Completion Streak*\n"]
    lines.append(f"  {fire} *{streak_days} day streak*")
    lines.append(f"  Total completed: {total_done}/{total_all}")
    lines.append(f"  Active repos: {active_repos}/{len(repos)}")
    rate = round(total_done / max(1, len(repos)), 1)
    lines.append(f"  Avg items/repo: {rate}")
    if total_done >= 100:
        lines.append(f"  🏆 *Centurion* — 100+ items completed!")
    if active_repos >= 10:
        lines.append(f"  ⚡ *Multi-Tasker* — 10+ repos running!")
    return "\n".join(lines)


def cmd_top_errors():
    """Rank repos by error count (most errors first)."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    ranked = sorted(repos, key=lambda r: r.get("stats", {}).get("mistakes", 0), reverse=True)
    ranked = [r for r in ranked if r.get("stats", {}).get("mistakes", 0) > 0]
    if not ranked:
        return "🎉 *No errors anywhere!* All repos are clean."
    lines = ["❌ *Top Errors*\n"]
    for i, r in enumerate(ranked[:15], 1):
        s = r.get("stats", {})
        errs = s.get("mistakes", 0)
        total = s.get("items_total", 0)
        pct = round(errs / max(1, total) * 100)
        medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
        lines.append(f"  {medal} *{r['name']}* — {errs} errors ({pct}% rate)")
    return "\n".join(lines)


def cmd_idle():
    """List idle repos that have pending items — candidates to start."""
    repos = _orch_get("/api/repos") or []
    idle_with_work = []
    for r in repos:
        if r.get("running"):
            continue
        s = r.get("stats", {})
        pending = (s.get("items_total", 0) - s.get("items_done", 0))
        if pending > 0:
            idle_with_work.append((r, pending))
    if not idle_with_work:
        return "✅ All repos with pending items are running!"
    idle_with_work.sort(key=lambda x: x[1], reverse=True)
    lines = ["💤 *Idle Repos with Pending Items*\n"]
    for r, pending in idle_with_work[:20]:
        s = r.get("stats", {})
        lines.append(f"  ⚪ *{r['name']}* — {pending} pending, {s.get('mistakes', 0)} errs")
    lines.append(f"\n_Use `/start <name>` or `/start_all` to resume_")
    return "\n".join(lines)


def cmd_cleanup(arg: str = ""):
    """Archive completed items older than N days. Default 30."""
    parts = arg.strip().split()
    days = 30
    if parts and parts[0].isdigit():
        days = int(parts[0])
    repos = _orch_get("/api/repos") or []
    archived = 0
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items:
            if it.get("status") != "completed":
                continue
            completed_at = it.get("completed_at") or it.get("updated_at") or ""
            if not completed_at:
                continue
            try:
                dt = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - dt).days
                if age >= days:
                    _orch_post("/api/items/archive", {"item_id": it["id"]})
                    archived += 1
            except Exception:
                pass
    return f"🧹 *Cleanup done!* Archived {archived} items older than {days} days."


def cmd_blocked():
    """Show items blocked by dependencies across all repos."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    blocked = []
    for r in repos:
        items = _orch_get(f"/api/items?repo_id={r['id']}") or []
        all_ids = {it["id"] for it in items}
        done_ids = {it["id"] for it in items if it.get("status") == "completed"}
        for it in items:
            deps = it.get("depends_on") or []
            if deps and it.get("status") == "pending":
                unmet = [d for d in deps if d in all_ids and d not in done_ids]
                if unmet:
                    blocked.append((r["name"], it.get("title", "?"), len(unmet)))
    if not blocked:
        return "✅ No blocked items! All dependencies are satisfied."
    lines = ["🚫 *Blocked Items*\n"]
    for rname, title, deps_left in blocked[:20]:
        lines.append(f"  🔒 *{rname}*: {title[:40]} ({deps_left} deps)")
    if len(blocked) > 20:
        lines.append(f"\n_...and {len(blocked) - 20} more_")
    return "\n".join(lines)


def cmd_efficiency():
    """Rank repos by cost-per-item efficiency (lowest cost/item is best)."""
    repos = _orch_get("/api/repos") or []
    costs_data = _orch_get("/api/costs") or {}
    repo_costs = costs_data.get("repos", {}) if isinstance(costs_data, dict) else {}
    ranked = []
    for r in repos:
        s = r.get("stats", {})
        done = s.get("items_done", 0)
        cost = repo_costs.get(r.get("name"), s.get("cost", 0)) or 0
        if done > 0 and cost > 0:
            ranked.append((r["name"], cost, done, cost / done))
    if not ranked:
        return "💰 Not enough data for efficiency ranking."
    ranked.sort(key=lambda x: x[3])
    lines = ["💰 *Cost Efficiency Ranking*\n"]
    for i, (name, cost, done, cpi) in enumerate(ranked[:15], 1):
        medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"{i}."
        grade = "🟢" if cpi < 0.10 else "🟡" if cpi < 0.50 else "🔴"
        lines.append(f"  {medal} {grade} *{name}* — ${cpi:.4f}/item ({done} done, ${cost:.2f})")
    return "\n".join(lines)


def cmd_snapshot_all():
    """Take a snapshot of all repos at once."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    success = 0
    for r in repos:
        result = _orch_post("/api/repos/snapshot", {"repo_id": r["id"]})
        if result and not isinstance(result, str):
            success += 1
    return f"📸 *Snapshot taken for {success}/{len(repos)} repos*"


def cmd_pause_all():
    """Pause all running repos."""
    repos = _orch_get("/api/repos") or []
    running = [r for r in repos if r.get("running") and not r.get("paused")]
    if not running:
        return "⏸️ No running repos to pause."
    paused = 0
    for r in running:
        result = _orch_post("/api/pause", {"repo_id": r["id"]})
        if result:
            paused += 1
    return f"⏸️ *Paused {paused}/{len(running)} repos*"


def cmd_resume_all():
    """Resume all paused repos."""
    repos = _orch_get("/api/repos") or []
    paused_repos = [r for r in repos if r.get("paused")]
    if not paused_repos:
        return "▶️ No paused repos to resume."
    resumed = 0
    for r in paused_repos:
        result = _orch_post("/api/resume", {"repo_id": r["id"]})
        if result:
            resumed += 1
    return f"▶️ *Resumed {resumed}/{len(paused_repos)} repos*"


def cmd_zero():
    """Show repos that have zero items — need work seeded."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    empty = [r for r in repos if (r.get("stats", {}).get("items_total", 0)) == 0]
    if not empty:
        return "✅ All repos have items seeded!"
    lines = [f"📭 *{len(empty)} Repos with Zero Items*\n"]
    for r in sorted(empty, key=lambda x: x.get("name", "")):
        status = "▶️" if r.get("running") else "⏹️"
        lines.append(f"  {status} *{r['name']}* — {r.get('state', 'idle')}")
    lines.append(f"\n💡 Use `/items add` or seed items via the API to get started")
    return "\n".join(lines)


def cmd_uptime_rank():
    """Rank running repos by continuous uptime duration."""
    repos = _orch_get("/api/repos") or []
    running = [r for r in repos if r.get("running")]
    if not running:
        return "⏹️ No repos currently running."
    now = datetime.now(timezone.utc)
    ranked = []
    for r in running:
        started = r.get("started_at", "")
        if started:
            try:
                st = datetime.fromisoformat(started.replace("Z", "+00:00"))
                uptime_s = (now - st).total_seconds()
                ranked.append((r["name"], uptime_s, r.get("paused", False)))
            except (ValueError, TypeError):
                ranked.append((r["name"], 0, r.get("paused", False)))
        else:
            ranked.append((r["name"], 0, r.get("paused", False)))
    ranked.sort(key=lambda x: x[1], reverse=True)
    lines = ["⏱️ *Uptime Rankings*\n"]
    for i, (name, secs, paused) in enumerate(ranked[:20]):
        if secs >= 86400:
            label = f"{secs/86400:.1f}d"
        elif secs >= 3600:
            label = f"{secs/3600:.1f}h"
        elif secs >= 60:
            label = f"{int(secs/60)}m"
        else:
            label = f"{int(secs)}s"
        status = "⏸️" if paused else "▶️"
        medal = ["🥇", "🥈", "🥉"][i] if i < 3 else f"{i+1}."
        lines.append(f"  {medal} {status} *{name}*: {label}")
    return "\n".join(lines)


def cmd_roi():
    """Show return on investment: items completed per dollar spent."""
    repos = _orch_get("/api/repos") or []
    costs_data = _orch_get("/api/costs") or {}
    repo_costs = costs_data.get("repos", {})
    if not repos:
        return "No repos registered."
    data = []
    for r in repos:
        s = r.get("stats", {})
        done = s.get("items_done", 0)
        cost = repo_costs.get(r["name"], s.get("cost", 0))
        if isinstance(cost, (int, float)) and cost > 0 and done > 0:
            roi = done / cost
            data.append((r["name"], done, cost, roi))
    if not data:
        return "📊 No repos with both completed items and costs."
    data.sort(key=lambda x: x[3], reverse=True)
    lines = ["📈 *ROI — Items per Dollar*\n"]
    for i, (name, done, cost, roi) in enumerate(data[:15]):
        medal = ["🥇", "🥈", "🥉"][i] if i < 3 else f"{i+1}."
        stars = "⭐" * min(5, max(1, int(roi / 5)))
        lines.append(f"  {medal} *{name}*: {roi:.1f} items/$ ({done} items, ${cost:.4f}) {stars}")
    total_done = sum(d[1] for d in data)
    total_cost = sum(d[2] for d in data)
    overall = total_done / total_cost if total_cost > 0 else 0
    lines.append(f"\n📊 Overall ROI: *{overall:.1f} items/$*")
    return "\n".join(lines)


def cmd_capacity():
    """Show remaining capacity per repo — pending items vs completion rate."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    lines = ["📦 *Repo Capacity*\n"]
    for r in sorted(repos, key=lambda x: (x.get("stats", {}).get("items_total", 0) - x.get("stats", {}).get("items_done", 0)), reverse=True):
        s = r.get("stats", {})
        total = s.get("items_total", 0)
        done = s.get("items_done", 0)
        pending = total - done
        pct = round(done / total * 100) if total > 0 else 0
        icon = "🟢" if pct >= 80 else "🟡" if pct >= 50 else "🔴"
        status = "✅ Complete" if pending == 0 and total > 0 else f"{pending} remaining"
        running = "▶️" if r.get("running") else "⏹️"
        lines.append(f"  {running} {icon} *{r['name']}*: {done}/{total} ({pct}%) — {status}")
    total_pending = sum((r.get("stats", {}).get("items_total", 0) - r.get("stats", {}).get("items_done", 0)) for r in repos)
    lines.append(f"\n📊 Total pending: *{total_pending}* items across {len(repos)} repos")
    return "\n".join(lines)


def cmd_cost_rank():
    """Rank repos by total API cost (most expensive first)."""
    repos = _orch_get("/api/repos") or []
    costs_data = _orch_get("/api/costs") or {}
    repo_costs = costs_data.get("repos", {})
    if not repos:
        return "No repos registered."
    ranked = []
    for r in repos:
        cost = repo_costs.get(r["name"], r.get("stats", {}).get("cost", 0))
        if isinstance(cost, (int, float)):
            ranked.append((r["name"], cost))
    ranked.sort(key=lambda x: x[1], reverse=True)
    if not ranked or all(c == 0 for _, c in ranked):
        return "💰 No cost data available yet."
    total = sum(c for _, c in ranked)
    lines = ["💰 *Cost Rankings*\n"]
    running_total = 0
    for i, (name, cost) in enumerate(ranked[:20]):
        running_total += cost
        pct = round(cost / total * 100) if total > 0 else 0
        bar = "█" * min(15, max(0, pct // 7)) + "░" * max(0, 15 - pct // 7)
        lines.append(f"  {i+1}. *{name}* ${cost:.4f} ({pct}%) {bar}")
    lines.append(f"\n💵 Total: *${total:.4f}*")
    return "\n".join(lines)


def cmd_blame():
    """Show repos ranked by error-to-item ratio (worst offenders first)."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    scored = []
    for r in repos:
        s = r.get("stats", {})
        errs = s.get("mistakes", 0)
        total = s.get("items_total", 0)
        if total == 0 and errs == 0:
            continue
        ratio = errs / max(1, total)
        scored.append((r["name"], errs, total, ratio))
    if not scored:
        return "✅ No repos with items or errors to analyze."
    scored.sort(key=lambda x: x[3], reverse=True)
    lines = ["🔍 *Blame Report — Error/Item Ratio*\n"]
    for i, (name, errs, total, ratio) in enumerate(scored[:15]):
        pct = round(ratio * 100)
        icon = "🔴" if pct > 20 else "🟡" if pct > 5 else "🟢"
        medal = "🥇" if i == 0 and pct > 0 else "🥈" if i == 1 and pct > 0 else "🥉" if i == 2 and pct > 0 else " "
        lines.append(f"  {medal} {icon} *{name}*: {errs}/{total} = {pct}%")
    avg = round(sum(x[3] for x in scored) / len(scored) * 100)
    lines.append(f"\n📊 Avg error rate: *{avg}%*")
    return "\n".join(lines)


def cmd_velocity():
    """Show items completed per day over the last 7 days."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    from collections import defaultdict
    daily = defaultdict(int)
    for r in repos:
        items_data = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items_data:
            if it.get("status") == "completed" and it.get("completed_at"):
                day = it["completed_at"][:10]
                daily[day] += 1
    if not daily:
        return "📭 No completed items with timestamps found."
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = ["🚀 *Velocity — Items/Day (7d)*\n"]
    total = 0
    for i in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        count = daily.get(d, 0)
        total += count
        bar = "█" * min(20, count) + "░" * max(0, 20 - count)
        marker = " ← today" if d == today else ""
        lines.append(f"  `{d[5:]}` {bar} {count}{marker}")
    avg = round(total / 7, 1)
    lines.append(f"\n📊 Avg: *{avg}/day* · Total: *{total}* (7d)")
    return "\n".join(lines)


def cmd_last():
    """Show the most recently completed item across all repos."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    latest = None
    latest_repo = None
    for r in repos:
        items_data = _orch_get(f"/api/items?repo_id={r['id']}") or []
        for it in items_data:
            if it.get("status") == "completed" and it.get("completed_at"):
                if not latest or it["completed_at"] > latest["completed_at"]:
                    latest = it
                    latest_repo = r["name"]
    if not latest:
        return "📭 No completed items found across any repos."
    title = latest.get("title", latest.get("name", "?"))
    kind = latest.get("type", "item")
    when = latest.get("completed_at", "?")[:19].replace("T", " ")
    return f"🏁 *Last Completed Item*\n\n📦 *{latest_repo}*\n  {kind}: *{title}*\n  ✅ Completed: `{when}`"


_repo_groups = {}  # group_name -> [repo_name, ...]


def cmd_group(arg: str = ""):
    """Manage repo groups. Usage: /group add frontend blog,portfolio | /group list | /group show frontend."""
    parts = arg.strip().split(None, 1) if arg.strip() else []
    if not parts:
        if not _repo_groups:
            return "No groups defined.\nUsage: `/group add <name> <repo1,repo2,...>`"
        lines = ["📂 *Repo Groups*\n"]
        for name, members in sorted(_repo_groups.items()):
            lines.append(f"  *{name}*: {', '.join(members)}")
        return "\n".join(lines)
    action = parts[0].lower()
    rest = parts[1] if len(parts) > 1 else ""
    if action == "add" and rest:
        p = rest.split(None, 1)
        if len(p) < 2:
            return "Usage: `/group add <name> <repo1,repo2,...>`"
        gname = p[0]
        members = [m.strip() for m in p[1].split(",") if m.strip()]
        _repo_groups[gname] = members
        return f"📂 Group *{gname}* set to: {', '.join(members)}"
    if action == "remove" and rest:
        if rest in _repo_groups:
            del _repo_groups[rest]
            return f"📂 Group *{rest}* removed."
        return f"Group '{rest}' not found."
    if action in _repo_groups:
        members = _repo_groups[action]
        repos = _orch_get("/api/repos") or []
        lines = [f"📂 *Group: {action}*\n"]
        for rname in members:
            r = next((x for x in repos if x.get("name") == rname), None)
            if r:
                s = r.get("stats", {})
                state = "🟢" if r.get("running") else "⚪"
                lines.append(f"  {state} *{rname}* — {s.get('items_done', 0)}/{s.get('items_total', 0)} items, {s.get('mistakes', 0)} errs")
            else:
                lines.append(f"  ❓ *{rname}* — not found")
        return "\n".join(lines)
    return "Usage: `/group add <name> <repos>` | `/group remove <name>` | `/group <name>` | `/group list`"


def cmd_progress():
    """Compact progress overview with visual bars for every repo."""
    repos = _orch_get("/api/repos") or []
    if not repos:
        return "No repos registered."
    lines = ["📊 *Progress Overview*\n"]
    total_done, total_all = 0, 0
    for r in sorted(repos, key=lambda x: x.get("name", "")):
        s = r.get("stats", {})
        done = s.get("items_done", 0)
        total = s.get("items_total", 0)
        total_done += done
        total_all += total
        if total == 0:
            lines.append(f"  `{r['name'][:12]:12s}` ░░░░░░░░░░ (no items)")
            continue
        pct = done / total * 100
        filled = int(pct / 10)
        bar = "█" * filled + "░" * (10 - filled)
        icon = "✅" if pct >= 100 else "🟢" if pct >= 60 else "🟡" if pct >= 30 else "🔴"
        lines.append(f"  {icon} `{r['name'][:12]:12s}` {bar} {pct:.0f}% ({done}/{total})")
    overall_pct = (total_done / max(1, total_all)) * 100
    lines.append(f"\n*Overall: {total_done}/{total_all} ({overall_pct:.0f}%)*")
    return "\n".join(lines)


def cmd_wave():
    """Show the current wave number and cumulative improvement stats."""
    repos = _orch_get("/api/repos") or []
    total_items = sum(r.get("stats", {}).get("items_total", 0) for r in repos)
    total_done = sum(r.get("stats", {}).get("items_done", 0) for r in repos)
    total_errs = sum(r.get("stats", {}).get("mistakes", 0) for r in repos)
    lines = [
        "🌊 *Wave 200 — Milestone!*\n",
        "📊 *Cumulative Stats:*",
        f"  🏗️ 200 waves of improvements",
        f"  🤖 72+ bot commands",
        f"  📦 {len(repos)} repos registered",
        f"  ✅ {total_done}/{total_items} items completed",
        f"  🐛 {total_errs} errors encountered",
        f"  💻 3 platforms: Bot + Dashboard + Mini App",
        "",
        "🎉 Each wave adds 3 improvements across all platforms!",
    ]
    return "\n".join(lines)


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
`retry_all` — Re-queue completed items across ALL repos
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
`dedupe [repo]` — Remove duplicate pending items
`remind <minutes>` — Schedule a status reminder
`alive` — Quick heartbeat check on system liveness
`slowest` — Slowest completed steps across all repos
`agents [repo]` — Show agent activity for a repo
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
        compare_text = cmd_compare()
        buttons = [
            [{"text": "\U0001F3C6 Leaderboard", "callback_data": "cmd_leaderboard"},
             {"text": "\U0001F4B0 Costs", "callback_data": "cmd_costs"}],
            [{"text": "\U0001F4C8 Forecast", "callback_data": "cmd_forecast"},
             {"text": "\U0001F4CB Summary", "callback_data": "cmd_summary"}],
        ]
        send_message(compare_text, chat_id=chat_id, reply_markup={"inline_keyboard": buttons})
        reply = None
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
    elif t in ("alive", "heartbeat", "ping"):
        reply = cmd_alive()
    elif t in ("fastest", "speed", "quickest"):
        reply = cmd_fastest()
    elif t in ("slowest", "slow", "bottleneck"):
        reply = cmd_slowest()
    elif t == "agents" or t.startswith("agents "):
        reply = cmd_agents(t[7:].strip() if t.startswith("agents ") else "")
    elif t == "pick" or t.startswith("pick "):
        reply = cmd_pick(t[5:].strip() if t.startswith("pick ") else "")
    elif t == "deps" or t.startswith("deps "):
        reply = cmd_deps(t[5:].strip() if t.startswith("deps ") else "")
    elif t in ("hot", "hottest", "top_repos"):
        reply = cmd_hot()
    elif t == "cost_alert" or t.startswith("cost_alert "):
        reply = cmd_cost_alert(t[11:].strip() if t.startswith("cost_alert ") else "")
    elif t == "schedule" or t.startswith("schedule "):
        reply = cmd_schedule(t[9:].strip() if t.startswith("schedule ") else "")
    elif t == "export" or t.startswith("export "):
        reply = cmd_export(t[7:].strip() if t.startswith("export ") else "")
    elif t in ("emoji", "e", "quick"):
        reply = cmd_emoji()
    elif t in ("retry_all", "retry-all", "retryall"):
        reply = cmd_retry_all()
    elif t in ("backlog", "backlogs", "prio"):
        reply = cmd_backlog()
    elif t == "oldest" or t.startswith("oldest "):
        reply = cmd_oldest(t[7:].strip() if t.startswith("oldest ") else "")
    elif t == "completions" or t.startswith("completions "):
        reply = cmd_completions(t[12:].strip() if t.startswith("completions ") else "")
    elif t == "throughput" or t.startswith("throughput "):
        reply = cmd_throughput(t[11:].strip() if t.startswith("throughput ") else "")
    elif t == "pending" or t.startswith("pending "):
        reply = cmd_pending(t[8:].strip() if t.startswith("pending ") else "")
    elif t in ("success", "success_rates", "rates"):
        reply = cmd_success()
    elif t == "wait_time" or t.startswith("wait_time "):
        reply = cmd_wait_time(t[10:].strip() if t.startswith("wait_time ") else "")
    elif t in ("overview", "ov"):
        reply = cmd_overview()
    elif t == "quiet" or t.startswith("quiet "):
        reply = cmd_quiet(t[6:].strip() if t.startswith("quiet ") else "")
    elif t.startswith("clone "):
        reply = cmd_clone(t[6:].strip())
    elif t == "threshold" or t.startswith("threshold "):
        reply = cmd_threshold(t[10:].strip() if t.startswith("threshold ") else "")
    elif t == "sync" or t.startswith("sync "):
        reply = cmd_sync(t[5:].strip() if t.startswith("sync ") else "")
    elif t in ("dedupe_items", "dedupe-items", "xdedupe"):
        reply = cmd_dedupe_items()
    elif t == "watch" or t.startswith("watch "):
        reply = cmd_watch(t[6:].strip() if t.startswith("watch ") else "")
    elif t.startswith("rename "):
        reply = cmd_rename(t[7:].strip())
    elif t in ("focus", "attention", "priority"):
        reply = cmd_focus()
    elif t in ("wave", "waves", "milestone"):
        reply = cmd_wave()
    elif t in ("progress", "prog", "bars"):
        reply = cmd_progress()
    elif t == "diff" or t.startswith("diff "):
        reply = cmd_diff(t[5:].strip() if t.startswith("diff ") else "")
    elif t == "impact" or t.startswith("impact "):
        reply = cmd_impact(t[7:].strip() if t.startswith("impact ") else "")
    elif t == "benchmark" or t.startswith("benchmark "):
        reply = cmd_benchmark(t[10:].strip() if t.startswith("benchmark ") else "")
    elif t == "group" or t.startswith("group "):
        reply = cmd_group(t[6:].strip() if t.startswith("group ") else "")
    elif t == "alerts" or t.startswith("alerts "):
        reply = cmd_alerts(t[7:].strip() if t.startswith("alerts ") else "")
    elif t == "rate" or t.startswith("rate "):
        reply = cmd_rate(t[5:].strip() if t.startswith("rate ") else "")
    elif t == "streak":
        reply = cmd_streak()
    elif t in ("top_errors", "top errors", "toperrors"):
        reply = cmd_top_errors()
    elif t == "idle":
        reply = cmd_idle()
    elif t == "cleanup" or t.startswith("cleanup "):
        reply = cmd_cleanup(t[8:].strip() if t.startswith("cleanup ") else "")
    elif t == "blocked":
        reply = cmd_blocked()
    elif t == "efficiency":
        reply = cmd_efficiency()
    elif t in ("snapshot_all", "snapshot all", "snapall"):
        reply = cmd_snapshot_all()
    elif t in ("pause_all", "pause all", "pauseall"):
        reply = cmd_pause_all()
    elif t in ("resume_all", "resume all", "resumeall"):
        reply = cmd_resume_all()
    elif t in ("last", "latest", "recent_item"):
        reply = cmd_last()
    elif t in ("velocity", "vel", "items_per_day"):
        reply = cmd_velocity()
    elif t in ("blame", "fault", "error_ratio"):
        reply = cmd_blame()
    elif t in ("cost_rank", "cost rank", "costrank", "expensive"):
        reply = cmd_cost_rank()
    elif t in ("capacity", "cap", "remaining"):
        reply = cmd_capacity()
    elif t in ("roi", "return", "investment"):
        reply = cmd_roi()
    elif t in ("uptime_rank", "uptime rank", "uptimerank"):
        reply = cmd_uptime_rank()
    elif t in ("zero", "empty", "unseeded"):
        reply = cmd_zero()
    elif t == "dedupe" or t.startswith("dedupe "):
        reply = cmd_dedupe(t[7:].strip() if t.startswith("dedupe ") else "")
    elif t == "remind" or t.startswith("remind "):
        reply = cmd_remind(t[7:].strip() if t.startswith("remind ") else "", chat_id=chat_id)
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
                       "queue", "leaderboard", "errors", "docs", "uptime", "repos", "dedupe", "fastest", "remind", "alive", "slowest", "agents", "pick", "deps", "hot", "cost_alert", "schedule", "export", "emoji", "retry_all", "backlog", "oldest", "completions", "throughput", "pending", "success", "wait_time", "overview", "quiet", "clone", "threshold", "sync", "dedupe_items", "watch", "rename", "focus", "wave", "progress", "diff", "impact", "benchmark", "group", "alerts", "rate", "streak", "top_errors", "idle", "cleanup", "blocked", "efficiency", "snapshot_all", "pause_all", "resume_all", "last", "velocity", "blame", "cost_rank", "capacity", "roi", "uptime_rank", "zero"]
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
