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
from datetime import datetime, timedelta

log = logging.getLogger("swarm.telegram")

# ─── Config ──────────────────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8310291869:AAEGGLhVldtQ_kExJkeUF3QLBZdBlL6nzu4")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "5652086820")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"
ORCH_URL = "http://localhost:6969"
AUDIO_DIR = os.environ.get("AGENT_AUDIO_DIR", os.path.expanduser("~/swarm-audio"))

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

def _orch_get(path):
    """GET from orchestrator API."""
    try:
        resp = urlopen(f"{ORCH_URL}{path}", timeout=5)
        return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}


def _orch_post(path, data):
    """POST to orchestrator API."""
    try:
        req = Request(f"{ORCH_URL}{path}", data=json.dumps(data).encode(),
                     headers={"Content-Type": "application/json"})
        resp = urlopen(req, timeout=10)
        return json.loads(resp.read())
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

def cmd_status():
    """Return status of all repos."""
    repos = _orch_get("/api/repos")
    if isinstance(repos, dict) and "error" in repos:
        return f"Error: {repos['error']}"
    if not repos:
        return "No repos registered."

    lines = ["*Swarm Town Status*\n"]
    for r in repos:
        state = r.get("state", "idle")
        stats = r.get("stats", {})
        items_done = stats.get("items_done", 0)
        items_total = stats.get("items_total", 0)
        steps_done = stats.get("steps_done", 0)
        steps_total = stats.get("steps_total", 0)
        agents = r.get("active_agents", 0)
        cycles = r.get("cycle_count", 0)

        status_emoji = {
            "idle": "💤", "execute_step": "⚡", "test_step": "🧪",
            "do_refactor": "🔧", "credits_exhausted": "💳", "error": "💀",
        }.get(state, "🔄")

        lines.append(f"{status_emoji} *{r['name']}* [{state}]")
        lines.append(f"  Items: {items_done}/{items_total} | Steps: {steps_done}/{steps_total}")
        if agents:
            lines.append(f"  Agents: {agents} | Cycles: {cycles}")
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


def cmd_help():
    return """*Swarm Town Commands:*

`status` — All repo states and stats
`start all` — Launch all repos
`stop all` — Stop everything
`start [repo]` — Start specific repo
`stop [repo]` — Stop specific repo
`screenshot` / `show me` — Dashboard photo
`add feature repo: title - desc` — Add feature
`add issue repo: title - desc` — Add issue
`push [repo]` — Git push
`logs [repo]` — Last 5 log entries
`mistakes [repo]` — Last 5 mistakes
`memory [repo]` — Last 5 memory entries
`help` — This message

Send a voice message to queue audio for transcription."""


# ─── Message Router ──────────────────────────────────────────────────────────

def handle_message(msg):
    """Route an incoming Telegram message to the right handler."""
    chat_id = str(msg.get("chat", {}).get("id", ""))

    # Security: only respond to allowed chat
    if chat_id != str(CHAT_ID):
        log.warning(f"Ignoring message from unknown chat: {chat_id}")
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
    elif t == "help":
        reply = cmd_help()
    else:
        reply = f"Unknown command. Send `help` for available commands."

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

    send_message(
        f"🎤 Audio received for *{active_repo['name']}*. Queued for Whisper transcription.",
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

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._poll_loop, name="telegram-bot", daemon=True)
        self.thread.start()
        log.info("📱 Telegram bot started")

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
        log.info(f"📱 Telegram bot polling (chat_id={CHAT_ID})")
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
