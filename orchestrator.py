#!/usr/bin/env python3
"""
SWARM ORCHESTRATOR v3 — Full Autonomous Multi-Repo
====================================================
• Per-repo SQLite databases (one DB per repo)
• Parallel orchestration across ALL repos simultaneously
• Credit exhaustion detection + auto-resume on refill
• Fully headless — no user input, no Enter key needed
• Whisper transcription for audio code reviews
• Audio → transcribe → issues/features in the flow
• Ruflo memory for mistake tracking + context recovery
• Issues AND features (type selector)
• Scoped permissions per repo folder + configurable external paths
• GitHub push integration
• 10+ concurrent agents minimum per repo
• Ralph loop for persistent autonomous execution
"""

import json, os, re, sqlite3, subprocess, sys, time, hashlib, logging, hmac, secrets, queue
import logging.handlers
import threading, shutil, base64, signal, traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path
from enum import Enum
from dataclasses import dataclass, field, asdict

# Load .env file if present (no dependency needed)
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.isfile(_env_path):
    with open(_env_path) as _ef:
        for _line in _ef:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())
from typing import Optional, Dict, List
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

# Add bot/ directory to path for telegram_bot imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot"))

# ─── Config ───────────────────────────────────────────────────────────────────

API_PORT = int(os.environ.get("AGENT_API_PORT", "6969"))
REPOS_DIR = os.environ.get("AGENT_REPOS_DIR", os.path.expanduser("~/repos"))
AUDIO_DIR = os.environ.get("AGENT_AUDIO_DIR", os.path.expanduser("~/swarm-audio"))
MASTER_DB = os.environ.get("AGENT_MASTER_DB", os.path.expanduser("~/swarm-master.db"))
POLL_SEC = int(os.environ.get("AGENT_POLL", "5"))
MIN_AGENTS = int(os.environ.get("AGENT_MIN", "10"))
MAX_AGENTS = int(os.environ.get("AGENT_MAX", "15"))
RALPH_ITERS = int(os.environ.get("RALPH_ITERS", "50"))
CLAUDE_MODEL = os.environ.get("AGENT_MODEL", "sonnet")
INTAKE_FOLDER = os.environ.get("INTAKE_FOLDER", os.path.expanduser("~/Desktop/intake"))

TELEGRAM_ENABLED = os.environ.get("TELEGRAM_ENABLED", "0") == "1"
BUDGET_LIMIT = float(os.environ.get("AGENT_BUDGET_LIMIT", "0"))  # 0 = unlimited

# Public URL override — set when using ngrok or other tunnel
# Used by the Telegram Mini App and bot for external-facing URLs
PUBLIC_URL = os.environ.get("PUBLIC_URL") or os.environ.get("NGROK_URL") or ""

# Session start time — for uptime tracking
_start_time = time.time()

# ─── API Security ─────────────────────────────────────────────────────────────

# Layer 1: Bearer Token — generated fresh each startup
API_TOKEN = secrets.token_urlsafe(32)

# Layer 2: Telegram Bot Token for initData HMAC validation
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

# Layer 3: Whitelisted Telegram chat/user IDs
_wl = os.environ.get("TELEGRAM_WHITELIST", "")
TELEGRAM_WHITELIST = {int(x.strip()) for x in _wl.split(",") if x.strip().isdigit()} if _wl else set()

# Paths exempt from bearer token auth (static assets + token endpoint)
AUTH_EXEMPT_PATHS = {"/", "/index.html", "/swarm-dashboard.jsx", "/telegram-app", "/api/token", "/api/events", "/api/status"}


def validate_telegram_init_data(init_data: str) -> dict:
    """Validate Telegram Mini App initData using HMAC-SHA256.

    Returns a dict with 'valid' bool and 'user' dict (if present).
    """
    try:
        # Parse the query string
        from urllib.parse import parse_qs, unquote
        parsed = parse_qs(init_data, keep_blank_values=True)
        # parse_qs returns lists; flatten to single values
        params = {k: v[0] for k, v in parsed.items()}

        received_hash = params.pop("hash", None)
        if not received_hash:
            return {"valid": False, "error": "No hash in initData"}

        # Sort params alphabetically and build data_check_string
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(params.items())
        )

        # secret_key = HMAC-SHA256("WebAppData", bot_token)
        secret_key = hmac.new(
            b"WebAppData", TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256
        ).digest()

        # computed_hash = HMAC-SHA256(data_check_string, secret_key)
        computed_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        valid = hmac.compare_digest(computed_hash, received_hash)

        user = None
        if "user" in params:
            try:
                user = json.loads(unquote(params["user"]))
            except (json.JSONDecodeError, TypeError):
                pass

        return {"valid": valid, "user": user}
    except Exception as e:
        return {"valid": False, "error": str(e)}


# ─── Chat Bridge (Telegram ↔ Claude Code) ────────────────────────────────────

BRIDGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge")
BRIDGE_INBOX = os.path.join(BRIDGE_DIR, "inbox.jsonl")
BRIDGE_OUTBOX = os.path.join(BRIDGE_DIR, "outbox.jsonl")
BRIDGE_INSTRUCTION = os.path.join(BRIDGE_DIR, "current_instruction.md")

os.makedirs(BRIDGE_DIR, exist_ok=True)


BRIDGE_MAX_LINES = int(os.environ.get("BRIDGE_MAX_LINES", "200"))

def bridge_write_inbox(text: str, source: str = "telegram"):
    """Append a message to inbox.jsonl and write current_instruction.md."""
    entry = {"text": text, "source": source, "ts": datetime.now(timezone.utc).isoformat()}
    with open(BRIDGE_INBOX, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    # Trim inbox if it exceeds max lines
    try:
        with open(BRIDGE_INBOX, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > BRIDGE_MAX_LINES:
            with open(BRIDGE_INBOX, "w", encoding="utf-8") as f:
                f.writelines(lines[-BRIDGE_MAX_LINES:])
    except Exception:
        pass
    with open(BRIDGE_INSTRUCTION, "w", encoding="utf-8") as f:
        f.write(text)


def bridge_read_outbox(since_ts: str = None) -> list:
    """Read all outbox entries, optionally filtering after since_ts."""
    if not os.path.exists(BRIDGE_OUTBOX):
        return []
    entries = []
    with open(BRIDGE_OUTBOX, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if since_ts and entry.get("ts", "") <= since_ts:
                    continue
                entries.append(entry)
            except json.JSONDecodeError:
                continue
    return entries


def bridge_write_outbox(text: str, source: str = "claude"):
    """Append a response to outbox.jsonl."""
    entry = {"text": text, "source": source, "ts": datetime.now(timezone.utc).isoformat()}
    with open(BRIDGE_OUTBOX, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


# ─── SSE Event Bus ────────────────────────────────────────────────────────────

_sse_clients: list = []
_sse_lock = threading.Lock()


def sse_broadcast(event_type: str, data: dict):
    """Push an event to all connected SSE clients + fire webhooks."""
    try:
        payload = json.dumps({"type": event_type, **data, "ts": datetime.now(timezone.utc).isoformat()}, default=str)
        msg = f"event: {event_type}\ndata: {payload}\n\n"
        with _sse_lock:
            dead = []
            for q in _sse_clients:
                try:
                    q.put_nowait(msg)
                except (queue.Full, Exception):
                    dead.append(q)
            for q in dead:
                try:
                    _sse_clients.remove(q)
                except ValueError:
                    pass
        # Fire webhooks in background
        _fire_webhooks(event_type, data)
    except Exception as e:
        log.debug(f"SSE broadcast error: {e}")


def sse_register() -> queue.Queue:
    """Register a new SSE client and return its queue."""
    q = queue.Queue(maxsize=100)
    with _sse_lock:
        _sse_clients.append(q)
    return q


def sse_unregister(q: queue.Queue):
    """Remove an SSE client."""
    with _sse_lock:
        if q in _sse_clients:
            _sse_clients.remove(q)


# ─── Webhooks ────────────────────────────────────────────────────────────────

_webhooks: List[dict] = []  # [{id, url, events: ["state_change", "log", ...], secret}]
_webhook_lock = threading.Lock()
_webhook_counter = 0


def webhook_register(url: str, events: List[str] = None, secret: str = "") -> dict:
    global _webhook_counter
    with _webhook_lock:
        _webhook_counter += 1
        wh = {"id": _webhook_counter, "url": url, "events": events or ["*"], "secret": secret}
        _webhooks.append(wh)
    return wh


def webhook_remove(wh_id: int) -> bool:
    with _webhook_lock:
        before = len(_webhooks)
        _webhooks[:] = [w for w in _webhooks if w["id"] != wh_id]
        return len(_webhooks) < before


def webhook_list() -> List[dict]:
    with _webhook_lock:
        return [{"id": w["id"], "url": w["url"], "events": w["events"]} for w in _webhooks]


def _fire_webhooks(event_type: str, payload: dict):
    """Send event to matching webhooks in background threads."""
    with _webhook_lock:
        targets = [w for w in _webhooks if "*" in w["events"] or event_type in w["events"]]
    if not targets:
        return
    body = json.dumps({"event": event_type, **payload, "ts": datetime.now(timezone.utc).isoformat()}, default=str)
    for wh in targets:
        threading.Thread(target=_send_webhook, args=(wh, body), daemon=True).start()


def _send_webhook(wh: dict, body: str):
    """POST webhook payload. Best-effort, logs failures."""
    import urllib.request
    try:
        headers = {"Content-Type": "application/json"}
        if wh.get("secret"):
            sig = hmac.new(wh["secret"].encode(), body.encode(), hashlib.sha256).hexdigest()
            headers["X-Swarm-Signature"] = sig
        req = urllib.request.Request(wh["url"], data=body.encode(), headers=headers, method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.debug(f"Webhook {wh['id']} to {wh['url']} failed: {e}")


# ─── Cost Tracking ────────────────────────────────────────────────────────────

_cost_totals: Dict[int, float] = {}
_cost_lock = threading.Lock()


def track_cost(repo_id: int, cost: float):
    """Accumulate cost for a repo."""
    if cost and cost > 0:
        with _cost_lock:
            _cost_totals[repo_id] = _cost_totals.get(repo_id, 0.0) + cost


def get_costs() -> Dict[int, float]:
    """Get all repo cost totals."""
    with _cost_lock:
        return dict(_cost_totals)


# ─── Circuit Breaker ─────────────────────────────────────────────────────────

class CircuitBreaker:
    """Per-repo circuit breaker. Opens after consecutive failures, half-opens after cooldown."""
    CLOSED, OPEN, HALF_OPEN = "closed", "open", "half_open"

    def __init__(self, threshold=5, cooldown=120):
        self.threshold = threshold
        self.cooldown = cooldown
        self.state = self.CLOSED
        self.failures = 0
        self.last_failure = 0.0
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            if self.state == self.CLOSED:
                return True
            if self.state == self.OPEN:
                if time.time() - self.last_failure >= self.cooldown:
                    self.state = self.HALF_OPEN
                    return True
                return False
            return True  # HALF_OPEN: allow one probe

    def record_success(self):
        with self._lock:
            self.failures = 0
            self.state = self.CLOSED

    def record_failure(self):
        with self._lock:
            self.failures += 1
            self.last_failure = time.time()
            if self.failures >= self.threshold:
                self.state = self.OPEN

    def status(self) -> dict:
        return {"state": self.state, "failures": self.failures, "threshold": self.threshold}


_circuit_breakers: Dict[int, CircuitBreaker] = {}
_cb_lock = threading.Lock()


def get_circuit_breaker(repo_id: int) -> CircuitBreaker:
    with _cb_lock:
        if repo_id not in _circuit_breakers:
            _circuit_breakers[repo_id] = CircuitBreaker()
        return _circuit_breakers[repo_id]


def clean_env():
    """Return os.environ with Claude/MCP session vars stripped.

    When the orchestrator runs inside a Claude Code session (e.g. during setup),
    child claude processes inherit env vars that make them think they're nested
    sessions, so they refuse to launch. This strips those vars while keeping
    ANTHROPIC_API_KEY for auth.
    """
    env = os.environ.copy()
    keep = {'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'PATH', 'HOME', 'USER',
            'USERPROFILE', 'SYSTEMROOT', 'COMSPEC', 'TEMP', 'TMP',
            'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'WINDIR',
            'NODE_PATH', 'NPM_CONFIG_PREFIX', 'NVM_DIR'}
    for key in list(env.keys()):
        if any(x in key.upper() for x in ['CLAUDE', 'MCP_', 'ANTHROPIC_SESSION']):
            if key in keep:
                continue
            del env[key]
    return env


for d in [REPOS_DIR, AUDIO_DIR, INTAKE_FOLDER]:
    os.makedirs(d, exist_ok=True)

class _JsonFormatter(logging.Formatter):
    """Emit structured JSON log lines for machine parsing."""
    def format(self, record):
        return json.dumps({
            "ts": self.formatTime(record), "level": record.levelname,
            "msg": record.getMessage(), "module": record.module,
            "line": record.lineno,
        }, ensure_ascii=False)

_json_handler = logging.handlers.RotatingFileHandler(
    os.path.expanduser("~/swarm-json.log"), encoding='utf-8',
    maxBytes=20*1024*1024, backupCount=5,
)
_json_handler.setFormatter(_JsonFormatter())

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(open(sys.stdout.fileno(), mode='w', encoding='utf-8', closefd=False)),
        logging.handlers.RotatingFileHandler(
            os.path.expanduser("~/swarm.log"), encoding='utf-8',
            maxBytes=50*1024*1024, backupCount=3,
        ),
        _json_handler,
    ],
)
log = logging.getLogger("swarm")

# ─── State ────────────────────────────────────────────────────────────────────

class State(Enum):
    IDLE = "idle"
    CHECK_AUDIO = "check_audio"
    TRANSCRIBE_AUDIO = "transcribe_audio"
    PARSE_AUDIO_ITEMS = "parse_audio_items"
    CHECK_REFACTOR = "check_refactor"
    DO_REFACTOR = "do_refactor"
    CHECK_NEW_ITEMS = "check_new_items"
    UPDATE_PLAN = "update_plan"
    CHECK_PLAN_COMPLETE = "check_plan_complete"
    EXECUTE_STEP = "execute_step"
    TEST_STEP = "test_step"
    CHECK_STEPS_LEFT = "check_steps_left"
    CHECK_MORE_ITEMS = "check_more_items"
    FINAL_OPTIMIZE = "final_optimize"
    SCAN_REPO = "scan_repo"
    CREDITS_EXHAUSTED = "credits_exhausted"
    ERROR = "error"


@dataclass
class RepoState:
    current_state: State = State.IDLE
    current_step_id: int = 0
    last_items_hash: str = ""
    refactor_done: bool = False
    cycle_count: int = 0
    active_agents: int = 0
    running: bool = False
    paused_state: str = ""  # state to resume after credits return
    errors: list = field(default_factory=list)
    last_activity: float = field(default_factory=time.time)

    def to_dict(self):
        d = asdict(self)
        d["current_state"] = self.current_state.value
        return d

    @classmethod
    def from_dict(cls, d):
        d = dict(d)
        try:
            d["current_state"] = State(d.get("current_state", "idle"))
        except ValueError:
            log.warning("Invalid state value %r, defaulting to IDLE", d.get("current_state"))
            d["current_state"] = State.IDLE
        # Validate types for known fields
        if not isinstance(d.get("cycle_count", 0), int):
            d["cycle_count"] = int(d.get("cycle_count", 0) or 0)
        if not isinstance(d.get("errors", []), list):
            d["errors"] = []
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ─── Per-Repo Database ────────────────────────────────────────────────────────

class RepoDB:
    """One SQLite database per repository."""

    def __init__(self, db_path: str):
        self.path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.lock = threading.Lock()
        self._init()

    def _init(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL DEFAULT 'feature',  -- 'feature' or 'issue'
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'pending',
                source TEXT DEFAULT 'manual',  -- 'manual', 'audio', 'error_detected'
                created_at TEXT DEFAULT (datetime('now')),
                started_at TEXT, completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS plan_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                step_order INTEGER NOT NULL,
                description TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                agent_type TEXT DEFAULT 'coder',
                tests_written INTEGER DEFAULT 0, tests_passed INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0, duration_sec REAL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')), completed_at TEXT,
                FOREIGN KEY (item_id) REFERENCES items(id)
            );
            CREATE TABLE IF NOT EXISTS audio_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                transcript TEXT,
                parsed_items TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now')), processed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL DEFAULT 'general',
                key TEXT NOT NULL, value TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(namespace, key)
            );
            CREATE TABLE IF NOT EXISTS mistakes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                error_type TEXT NOT NULL,
                description TEXT NOT NULL,
                resolution TEXT,
                step_id INTEGER,
                state_snapshot TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS execution_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                state TEXT, action TEXT, result TEXT,
                agent_count INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0, duration_sec REAL DEFAULT 0,
                error TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_type TEXT, agent_id TEXT UNIQUE, status TEXT DEFAULT 'running',
                task TEXT, spawned_at TEXT DEFAULT (datetime('now')), completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS repo_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                access_type TEXT DEFAULT 'read'
            );
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                details TEXT,
                commit_hash TEXT,
                state_before TEXT,
                state_after TEXT,
                items_snapshot TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        self.conn.commit()
        # Indexes for search/filter performance
        self.conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
            CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
            CREATE INDEX IF NOT EXISTS idx_plan_steps_status ON plan_steps(status);
            CREATE INDEX IF NOT EXISTS idx_log_created ON execution_log(created_at);
            CREATE INDEX IF NOT EXISTS idx_memory_ns ON memory(namespace);
        """)
        self.conn.commit()
        # Migrations for existing DBs
        self._migrate()

    def _migrate(self):
        """Add columns to existing tables if missing."""
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(plan_steps)").fetchall()}
        if "cost_usd" not in cols:
            self.conn.execute("ALTER TABLE plan_steps ADD COLUMN cost_usd REAL DEFAULT 0")
        if "duration_sec" not in cols:
            self.conn.execute("ALTER TABLE plan_steps ADD COLUMN duration_sec REAL DEFAULT 0")
        self.conn.commit()

    def ex(self, q, p=(), retries=3):
        for attempt in range(retries):
            try:
                with self.lock:
                    return self.conn.execute(q, p)
            except sqlite3.OperationalError as e:
                if "locked" in str(e) and attempt < retries - 1:
                    time.sleep(0.1 * (attempt + 1))
                    continue
                raise

    def commit(self, retries=3):
        for attempt in range(retries):
            try:
                with self.lock:
                    self.conn.commit()
                return
            except sqlite3.OperationalError as e:
                if "locked" in str(e) and attempt < retries - 1:
                    time.sleep(0.1 * (attempt + 1))
                    continue
                raise

    def close(self):
        """Safely close the database, flushing WAL."""
        try:
            with self.lock:
                self.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                self.conn.close()
        except Exception as e:
            log.warning("Error closing DB %s: %s", self.path, e)

    def transaction(self):
        """Context manager for atomic multi-statement operations."""
        class _Tx:
            def __init__(tx, db):
                tx.db = db
            def __enter__(tx):
                tx.db.lock.acquire()
                tx.db.conn.execute("BEGIN IMMEDIATE")
                return tx.db
            def __exit__(tx, exc_type, exc_val, exc_tb):
                try:
                    if exc_type is None:
                        tx.db.conn.commit()
                    else:
                        tx.db.conn.rollback()
                finally:
                    tx.db.lock.release()
                return False
        return _Tx(self)

    _SLOW_QUERY_MS = 200  # log queries slower than this

    def fetchall(self, q, p=()):
        t0 = time.time()
        result = [dict(r) for r in self.ex(q, p).fetchall()]
        ms = (time.time() - t0) * 1000
        if ms > self._SLOW_QUERY_MS:
            log.warning("SLOW QUERY (%.0fms): %s [%s]", ms, q[:120], self.path)
        return result

    def fetchone(self, q, p=()):
        t0 = time.time()
        r = self.ex(q, p).fetchone()
        ms = (time.time() - t0) * 1000
        if ms > self._SLOW_QUERY_MS:
            log.warning("SLOW QUERY (%.0fms): %s [%s]", ms, q[:120], self.path)
        return dict(r) if r else None

    # Items (features + issues)
    def get_pending_items(self):
        return self.fetchall(
            "SELECT * FROM items WHERE status='pending' ORDER BY "
            "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 "
            "WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at"
        )

    def items_hash(self):
        rows = self.fetchall("SELECT id,title,type FROM items WHERE status='pending'")
        return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()[:16]

    def add_item(self, type_, title, desc, priority="medium", source="manual"):
        self.ex("INSERT INTO items (type,title,description,priority,source) VALUES (?,?,?,?,?)",
                (type_, title, desc, priority, source))
        self.commit()

    # Plan
    def pending_steps(self):
        return self.fetchall("SELECT * FROM plan_steps WHERE status!='completed' ORDER BY step_order")

    def all_steps(self):
        return self.fetchall("SELECT * FROM plan_steps ORDER BY step_order")

    def save_plan(self, steps):
        for i, s in enumerate(steps):
            self.ex("INSERT INTO plan_steps (item_id,step_order,description,agent_type) VALUES (?,?,?,?)",
                    (s.get("item_id"), i, s["description"], s.get("agent_type", "coder")))
        self.commit()

    def complete_step(self, sid, tw, tp, cost=0, duration=0):
        self.ex("UPDATE plan_steps SET status='completed',tests_written=?,tests_passed=?,"
                "cost_usd=?,duration_sec=?,completed_at=datetime('now') WHERE id=?",
                (tw, tp, cost, duration, sid))
        self.commit()

    # Audio
    def pending_audio(self):
        return self.fetchall("SELECT * FROM audio_reviews WHERE status='pending'")

    def add_audio(self, filename):
        self.ex("INSERT INTO audio_reviews (filename) VALUES (?)", (filename,))
        self.commit()

    # Memory
    def mem_store(self, ns, key, val):
        v = json.dumps(val) if not isinstance(val, str) else val
        self.ex("INSERT OR REPLACE INTO memory (namespace,key,value,updated_at) "
                "VALUES (?,?,?,datetime('now'))", (ns, key, v))
        self.commit()

    def mem_search(self, q):
        return self.fetchall("SELECT * FROM memory WHERE key LIKE ? OR value LIKE ?",
                             (f"%{q}%", f"%{q}%"))

    # Mistakes (ruflo memory)
    def log_mistake(self, error_type, desc, resolution="", step_id=None, state_snapshot=""):
        self.ex("INSERT INTO mistakes (error_type,description,resolution,step_id,state_snapshot) "
                "VALUES (?,?,?,?,?)", (error_type, desc, resolution, step_id, state_snapshot))
        self.commit()

    def get_mistakes(self, limit=20):
        return self.fetchall("SELECT * FROM mistakes ORDER BY created_at DESC LIMIT ?", (limit,))

    def get_mistake_context(self):
        """Get recent mistakes as context for error recovery."""
        mistakes = self.get_mistakes(5)
        if not mistakes:
            return ""
        return "\n".join(f"- [{m['error_type']}] {m['description']}: {m.get('resolution','unresolved')}"
                         for m in mistakes)

    # State
    def save_state(self, state: RepoState):
        self.ex("INSERT OR REPLACE INTO repo_state (id,state_json,updated_at) "
                "VALUES (1,?,datetime('now'))", (json.dumps(state.to_dict()),))
        self.commit()

    def load_state(self):
        r = self.fetchone("SELECT state_json FROM repo_state WHERE id=1")
        if not r:
            return RepoState()
        try:
            return RepoState.from_dict(json.loads(r["state_json"]))
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            log.error("Corrupted state JSON in DB, resetting to IDLE: %s", e)
            return RepoState()

    # Log
    def log_exec(self, state, action, result="", agents=0, cost=0, dur=0, error=""):
        self.ex("INSERT INTO execution_log (state,action,result,agent_count,cost_usd,duration_sec,error) "
                "VALUES (?,?,?,?,?,?,?)", (state, action, result[:5000], agents, cost, dur, error[:2000]))
        self.commit()

    # Permissions
    def get_permissions(self):
        return self.fetchall("SELECT * FROM permissions")

    def add_permission(self, path, access="read"):
        self.ex("INSERT OR IGNORE INTO permissions (path,access_type) VALUES (?,?)", (path, access))
        self.commit()

    # History
    def add_history(self, action, details="", commit_hash="", state_before="", state_after="", items_snapshot=""):
        self.ex("INSERT INTO history (action,details,commit_hash,state_before,state_after,items_snapshot) "
                "VALUES (?,?,?,?,?,?)", (action, details[:5000], commit_hash, state_before, state_after, items_snapshot))
        self.commit()

    def get_history(self, limit=50):
        return self.fetchall("SELECT * FROM history ORDER BY created_at DESC LIMIT ?", (limit,))


# ─── Master Database (repo registry) ─────────────────────────────────────────

class MasterDB:
    def __init__(self, path):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS repos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                path TEXT NOT NULL,
                db_path TEXT NOT NULL,
                github_url TEXT DEFAULT '',
                branch TEXT DEFAULT 'main',
                running INTEGER DEFAULT 0,
                tags TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        self.conn.commit()
        # Migration: add tags column to existing DBs
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(repos)").fetchall()}
        if "tags" not in cols:
            self.conn.execute("ALTER TABLE repos ADD COLUMN tags TEXT DEFAULT ''")
            self.conn.commit()
        # Daily costs table for historical tracking
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_costs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                cost REAL DEFAULT 0,
                UNIQUE(repo_id, date)
            )
        """)
        self.conn.commit()

    def ex(self, q, p=()):
        with self.lock:
            return self.conn.execute(q, p)

    def commit(self):
        with self.lock:
            self.conn.commit()

    def get_repos(self):
        return [dict(r) for r in self.ex("SELECT * FROM repos ORDER BY name").fetchall()]

    def add_repo(self, name, path, github_url="", branch="main"):
        db_path = os.path.join(path, ".swarm-agent.db")
        self.ex("INSERT OR IGNORE INTO repos (name,path,db_path,github_url,branch) VALUES (?,?,?,?,?)",
                (name, path, db_path, github_url, branch))
        self.commit()
        return dict(self.ex("SELECT * FROM repos WHERE name=?", (name,)).fetchone())

    def set_running(self, repo_id, running):
        self.ex("UPDATE repos SET running=? WHERE id=?", (1 if running else 0, repo_id))
        self.commit()

    def get_running(self):
        return [dict(r) for r in self.ex("SELECT * FROM repos WHERE running=1").fetchall()]

    def delete_repo(self, repo_id):
        """Remove a repo from the registry. Does NOT delete files on disk."""
        self.ex("DELETE FROM repos WHERE id=?", (repo_id,))
        self.commit()

    def save_daily_costs(self, costs: Dict[int, float]):
        """Persist current cost totals to daily_costs table (upsert today's row)."""
        today = datetime.now().strftime("%Y-%m-%d")
        with self.lock:
            for rid, cost in costs.items():
                if cost > 0:
                    self.conn.execute(
                        "INSERT INTO daily_costs (repo_id, date, cost) VALUES (?, ?, ?)"
                        " ON CONFLICT(repo_id, date) DO UPDATE SET cost = excluded.cost",
                        (rid, today, cost))
            self.conn.commit()

    def get_cost_history(self, days=30):
        """Get daily cost history for the last N days."""
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        rows = self.ex(
            "SELECT repo_id, date, cost FROM daily_costs WHERE date >= ? ORDER BY date",
            (cutoff,)).fetchall()
        return [dict(r) for r in rows]


# ─── Claude Runner ────────────────────────────────────────────────────────────

class Runner:
    CREDIT_PATTERNS = [
        "rate limit", "rate_limit", "429", "quota exceeded", "billing",
        "credit", "usage limit", "capacity", "overloaded",
    ]

    def __init__(self):
        self.has_claude = shutil.which("claude") is not None
        self.has_whisper = shutil.which("whisper") is not None

    def _is_credit_error(self, text):
        t = text.lower()
        return any(p in t for p in self.CREDIT_PATTERNS)

    def run_cmd(self, cmd, cwd=".", timeout=600):
        start = time.time()
        use_shell = sys.platform == "win32"
        try:
            env = clean_env()
            env["CLAUDE_SKIP_PERMISSIONS"] = "1"
            r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                               shell=use_shell, env=env)
            elapsed = time.time() - start
            out = r.stdout.strip()
            err = r.stderr.strip()

            if self._is_credit_error(out + err):
                return {"success": False, "credits_exhausted": True, "output": out,
                        "error": "Credits exhausted", "elapsed": elapsed}

            try:
                parsed = json.loads(out)
                return {"success": r.returncode == 0, "output": parsed.get("result", out),
                        "raw": out, "elapsed": elapsed, "cost": parsed.get("cost_usd", 0)}
            except (json.JSONDecodeError, ValueError):
                return {"success": r.returncode == 0, "output": out or err, "raw": out,
                        "elapsed": elapsed, "error": err[:1000] if r.returncode != 0 else ""}
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"TIMEOUT {timeout}s", "elapsed": timeout}
        except FileNotFoundError as e:
            return {"success": False, "output": "", "error": f"Not found: {e}", "elapsed": 0}
        except Exception as e:
            return {"success": False, "output": "", "error": str(e), "elapsed": 0}

    def claude(self, cwd, prompt, timeout=600, model=None):
        return self.run_cmd(
            ["claude", "-p", prompt, "--model", model or CLAUDE_MODEL,
             "--output-format", "json", "--dangerously-skip-permissions"],
            cwd=cwd, timeout=timeout,
        )

    def claude_retry(self, cwd, prompt, retries=3, timeout=600, model=None, repo_id=None):
        import random
        cb = get_circuit_breaker(repo_id) if repo_id else None
        for i in range(retries):
            if cb and not cb.allow():
                log.warning(f"Circuit breaker OPEN for repo {repo_id}, skipping attempt {i+1}")
                return {"success": False, "output": "", "error": "Circuit breaker open — too many failures",
                        "elapsed": 0, "circuit_breaker": True}
            r = self.claude(cwd, prompt, timeout, model=model)
            if r.get("credits_exhausted"):
                return r
            if r["success"]:
                if cb:
                    cb.record_success()
                return r
            if cb:
                cb.record_failure()
            # Exponential backoff with jitter: base * 2^i + random 0-1s
            delay = min(2 ** i + random.random(), 30)
            time.sleep(delay)
        return r

    def ralph(self, cwd, prompt, max_iters=RALPH_ITERS, promise="TASK_COMPLETE", model=None):
        rp = f'/ralph-loop "{prompt}" --max-iterations {max_iters} --completion-promise "{promise}"'
        cmd = ["claude", "-p", rp, "--dangerously-skip-permissions"]
        if model:
            cmd.extend(["--model", model])
        return self.run_cmd(cmd, cwd=cwd, timeout=3600)

    def whisper(self, audio_path):
        """Transcribe audio using Whisper."""
        if self.has_whisper:
            r = self.run_cmd(["whisper", audio_path, "--model", "base", "--output_format", "txt"],
                             timeout=300)
            if r["success"]:
                txt_path = audio_path.rsplit(".", 1)[0] + ".txt"
                if os.path.exists(txt_path):
                    return open(txt_path).read()
            return r.get("output", "Transcription failed")
        # Fallback: use Claude to describe we got audio
        return f"[Audio file received: {os.path.basename(audio_path)} — Whisper not installed, install with: pip install openai-whisper]"

    def grep(self, cwd, pattern, glob="*"):
        try:
            r = subprocess.run(["grep", "-rn", "--include", glob, pattern, "."],
                               cwd=cwd, capture_output=True, text=True, timeout=30,
                               shell=(sys.platform == "win32"), env=clean_env())
            return r.stdout[:5000]
        except Exception as e:
            log.debug(f"grep failed in {cwd}: {e}")
            return ""

    def git_push(self, cwd, msg="auto: agent commit", branch="main"):
        self.run_cmd(["git", "add", "-A"], cwd=cwd, timeout=30)
        self.run_cmd(["git", "commit", "-m", msg, "--allow-empty"], cwd=cwd, timeout=30)
        result = self.run_cmd(["git", "push", "origin", branch], cwd=cwd, timeout=120)
        if TELEGRAM_ENABLED:
            try:
                from telegram_bot import send_message as tg_msg
                repo_name = os.path.basename(cwd)
                if result.get("success"):
                    tg_msg(f"📤 *{repo_name}* pushed to GitHub: {msg[:60]}")
                else:
                    tg_msg(f"⚠️ *{repo_name}* git push failed: {result.get('error','')[:100]}. Continuing.")
            except Exception as e:
                log.debug(f"Telegram notify failed for git push: {e}")
        return result

    def ruflo_init(self, cwd):
        return self.run_cmd(["npx", "ruflo", "init"], cwd=cwd, timeout=120)

    def ruflo_setup(self, cwd):
        """Full Ruflo setup for a repo — init, memory, hooks."""
        if not os.path.exists(os.path.join(cwd, ".claude-flow")):
            self.run_cmd(["npx", "ruflo", "init"], cwd=cwd, timeout=120)
        self.run_cmd(["npx", "ruflo", "memory", "init"], cwd=cwd, timeout=60)
        self.run_cmd(["npx", "ruflo", "hooks", "enable", "--all"], cwd=cwd, timeout=30)

    def ruflo_swarm(self, cwd, topology="hierarchical", max_agents=4, agent_types=None):
        """Initialize a swarm with specific topology and agent types."""
        self.run_cmd(["npx", "ruflo", "hive-mind", "init",
                       "--topology", topology, "--max-agents", str(max_agents)],
                      cwd=cwd, timeout=60)
        for atype in (agent_types or ["coder"]):
            self.run_cmd(["npx", "ruflo", "agent", "spawn", "-t", atype],
                          cwd=cwd, timeout=60)

    def ruflo_sparc(self, cwd, mode, objective, timeout=600):
        """Run a SPARC task."""
        return self.run_cmd(["npx", "ruflo", "sparc", "run", mode, objective],
                             cwd=cwd, timeout=timeout)

    def ruflo_memory_store(self, cwd, key, value):
        """Store a value in Ruflo memory."""
        self.run_cmd(["npx", "ruflo", "memory", "store", key, value[:500]],
                      cwd=cwd, timeout=15)

    def ruflo_memory_search(self, cwd, query):
        """Search Ruflo memory."""
        r = self.run_cmd(["npx", "ruflo", "memory", "search", query, "--limit", "5"],
                          cwd=cwd, timeout=15)
        return r.get("output", "")

    def ruflo_quality_gate(self, cwd, check_type="full"):
        """Run Ruflo quality gate hooks — lint, test, security scan."""
        results = {}
        if check_type in ("full", "lint"):
            r = self.run_cmd(["npx", "ruflo", "hooks", "run", "pre-commit"], cwd=cwd, timeout=120)
            results["lint"] = r.get("exit_code", 1) == 0
        if check_type in ("full", "test"):
            r = self.run_cmd(["npx", "ruflo", "hooks", "run", "pre-push"], cwd=cwd, timeout=300)
            results["test"] = r.get("exit_code", 1) == 0
        if check_type in ("full", "security"):
            r = self.run_cmd(["npx", "ruflo", "hooks", "run", "security-scan"], cwd=cwd, timeout=120)
            results["security"] = r.get("exit_code", 1) == 0
        passed = all(results.values()) if results else True
        if not passed:
            log.warning(f"⚠️ Quality gate failed at {cwd}: {results}")
        return {"passed": passed, "checks": results}

    def ruflo_spawn(self, cwd, objective, max_agents=10):
        self.run_cmd(["npx", "ruflo", "swarm", "init", "--v3-mode"], cwd=cwd, timeout=60)
        return self.run_cmd(
            ["npx", "ruflo", "agent", "spawn", "-t", "coder"],
            cwd=cwd, timeout=300,
        )


runner = Runner()


# ─── Repo Orchestrator (one per repo, runs in own thread) ────────────────────

class RepoOrchestrator:
    def __init__(self, repo: dict, master: MasterDB):
        self.repo = repo
        self.master = master
        self.db = RepoDB(repo["db_path"])
        self.state = self.db.load_state()
        self.stop_event = threading.Event()
        self.pause_event = threading.Event()  # set = paused

        # Add intake folder permission
        self.db.add_permission(INTAKE_FOLDER, "read")
        self.db.add_permission(repo["path"], "readwrite")

    def save(self):
        self.db.save_state(self.state)

    def log(self, action, result="", agents=0, cost=0, dur=0, error=""):
        self.db.log_exec(self.state.current_state.value, action, result, agents, cost, dur, error)
        if cost:
            track_cost(self.repo["id"], cost)
            sse_broadcast("log", {"repo": self.repo["name"], "repo_id": self.repo["id"],
                                  "action": action, "cost": cost})

    def _handle_credits(self, result):
        """Check if credits exhausted, pause if so."""
        if result.get("credits_exhausted"):
            log.warning(f"💳 Credits exhausted for {self.repo['name']} — pausing")
            self.state.paused_state = self.state.current_state.value
            self.state.current_state = State.CREDITS_EXHAUSTED
            self.db.log_mistake("credits_exhausted", "API credits ran out during execution",
                                state_snapshot=json.dumps(self.state.to_dict()))
            self.save()
            return True
        return False

    def _with_mistake_context(self, prompt):
        """Inject mistake history into prompts for context recovery."""
        ctx = self.db.get_mistake_context()
        if ctx:
            return f"""{prompt}

## Known Mistakes to Avoid (from ruflo memory):
{ctx}

Do NOT repeat these mistakes. If you encounter similar issues, use a different approach."""
        return prompt

    # ── State Handlers ────────────────────────────────────────────────────

    def h_idle(self):
        self.state.active_agents = 0

        audio = self.db.pending_audio()
        if audio:
            return State.CHECK_AUDIO

        h = self.db.items_hash()
        if h != self.state.last_items_hash:
            pending = self.db.get_pending_items()
            if pending:
                self.state.last_items_hash = h
                return State.CHECK_REFACTOR

        # Check intake folder for files
        try:
            for f in os.listdir(INTAKE_FOLDER):
                fp = os.path.join(INTAKE_FOLDER, f)
                if os.path.isfile(fp) and f.lower().endswith(('.mp3','.wav','.m4a','.ogg','.webm')):
                    dest = os.path.join(AUDIO_DIR, f"{self.repo['name']}_{f}")
                    shutil.move(fp, dest)
                    self.db.add_audio(dest)
                    log.info(f"📥 Intake: moved {f} to audio queue for {self.repo['name']}")
        except Exception as e:
            log.warning(f"Intake folder scan failed for {self.repo['name']}: {e}")

        time.sleep(POLL_SEC)
        return State.IDLE

    def h_check_audio(self):
        audio = self.db.pending_audio()
        if audio:
            return State.TRANSCRIBE_AUDIO
        return State.CHECK_REFACTOR

    def h_transcribe_audio(self):
        audio = self.db.pending_audio()
        if not audio:
            return State.PARSE_AUDIO_ITEMS

        for a in audio:
            log.info(f"🎤 Transcribing: {a['filename']}")
            transcript = runner.whisper(a["filename"])
            if not transcript or not transcript.strip():
                log.warning(f"Empty transcript for {a['filename']}, marking as processed")
                self.db.ex("UPDATE audio_reviews SET transcript='[empty]',status='processed',"
                           "processed_at=datetime('now') WHERE id=?", (a["id"],))
                self.db.commit()
                continue
            self.db.ex("UPDATE audio_reviews SET transcript=?,status='transcribed',"
                       "processed_at=datetime('now') WHERE id=?", (transcript[:10000], a["id"]))
            self.db.commit()
            self.log("transcribe_audio", f"Transcribed {a['filename']}")

        return State.PARSE_AUDIO_ITEMS

    def h_parse_audio_items(self):
        rows = self.db.fetchall("SELECT * FROM audio_reviews WHERE status='transcribed'")
        if not rows:
            return State.CHECK_REFACTOR

        for row in rows:
            log.info(f"📋 Parsing audio items from: {row['filename']}")
            prompt = f"""Analyze this audio transcription from a code review.
Extract every actionable item as either an 'issue' (bug, problem to fix) or 'feature' (new capability to add).

Transcription:
{row['transcript'][:4000]}

Return ONLY a JSON array:
[{{"type": "issue"|"feature", "title": "short title", "description": "detailed description", "priority": "low"|"medium"|"high"|"critical"}}]"""

            result = runner.claude_retry(self.repo["path"], prompt, model="claude-haiku-4-5-20251001", repo_id=self.repo["id"])
            if self._handle_credits(result):
                return State.CREDITS_EXHAUSTED

            items_json = "[]"
            if result["success"]:
                try:
                    out = result["output"]
                    if isinstance(out, str):
                        s, e = out.find("["), out.rfind("]") + 1
                        if s >= 0 and e > s:
                            items = json.loads(out[s:e])
                            items_json = json.dumps(items)
                            for item in items:
                                self.db.add_item(
                                    item.get("type", "feature"),
                                    item.get("title", "Audio item"),
                                    item.get("description", str(item)),
                                    item.get("priority", "medium"),
                                    source="audio",
                                )
                            log.info(f"  → Extracted {len(items)} items")
                except Exception as ex:
                    log.error(f"  Parse error: {ex}")

            self.db.ex("UPDATE audio_reviews SET parsed_items=?,status='processed' WHERE id=?",
                       (items_json, row["id"]))
            self.db.commit()

        return State.CHECK_REFACTOR

    def h_check_refactor(self):
        if self.state.refactor_done:
            return State.CHECK_NEW_ITEMS
        return State.DO_REFACTOR

    def h_do_refactor(self):
        log.info(f"🔧 Refactoring {self.repo['name']}...")
        t0 = time.time()
        self.state.active_agents = 4
        self.save()

        # Full Ruflo setup + hierarchical swarm for refactoring
        runner.ruflo_setup(self.repo["path"])
        runner.ruflo_swarm(self.repo["path"], "hierarchical", 4,
                           ["architect", "coder", "reviewer"])

        # Search Ruflo memory for prior context
        prior = runner.ruflo_memory_search(self.repo["path"], "refactor structure")

        prompt = self._with_mistake_context(
            "Refactor this repository per best practices: ensure CLAUDE.md exists, "
            "proper structure, error handling, test infra. Use grep to scan first. "
            "Do NOT change business logic. Output REFACTOR_COMPLETE when done."
            + (f"\n\nPrior context from memory:\n{prior}" if prior else "")
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=10, promise="REFACTOR_COMPLETE", model="claude-opus-4-6")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        dur = time.time() - t0
        self.log("do_refactor", result.get("output","")[:500], dur=dur)

        if result["success"]:
            self.state.refactor_done = True
            runner.ruflo_memory_store(self.repo["path"], "refactor/result", "SUCCESS: refactoring complete")
            if self.repo.get("github_url"):
                runner.git_push(self.repo["path"], "refactor: initial structure", self.repo.get("branch","main"))
        else:
            err = result.get("error", "unknown error")
            log.warning(f"⚠️ [{self.repo['name']}] Refactor failed: {err[:200]}")
            self.db.log_mistake("refactor_failed", err[:500])
            runner.ruflo_memory_store(self.repo["path"], "refactor/result", f"FAIL: {err[:200]}")
            # Still mark done to avoid infinite retry, but log the skip
            self.state.refactor_done = True

        return State.CHECK_NEW_ITEMS

    def h_check_new_items(self):
        # Auto-escalate priority on old pending items (>2 cycles stuck)
        self._auto_escalate_priorities()
        pending = self.db.get_pending_items()
        return State.UPDATE_PLAN if pending else State.CHECK_PLAN_COMPLETE

    def _auto_escalate_priorities(self):
        """Bump priority of items stuck as pending for 2+ cycles."""
        escalation = {"low": "medium", "medium": "high"}
        old_items = self.db.fetchall(
            "SELECT id, priority, created_at FROM items WHERE status='pending' "
            "AND created_at < datetime('now', '-2 hours')"
        )
        for item in old_items:
            new_prio = escalation.get(item["priority"])
            if new_prio:
                self.db.ex("UPDATE items SET priority=? WHERE id=?", (new_prio, item["id"]))
                log.info(f"⬆️ [{self.repo['name']}] Escalated item {item['id']} from {item['priority']} to {new_prio}")
        if old_items:
            self.db.commit()

    def h_update_plan(self):
        self.state.active_agents = 2
        self.save()

        # Use analyst + architect for planning
        runner.ruflo_swarm(self.repo["path"], "mesh", 2, ["analyst", "architect"])

        pending = self.db.get_pending_items()
        existing = self.db.pending_steps()
        mistakes = self.db.get_mistake_context()

        items_desc = "\n".join(
            f"- [{i['type'].upper()}][{i['priority'].upper()}] {i['title']}: {i['description']}"
            for i in pending
        )
        grep_ctx = runner.grep(self.repo["path"], "TODO|FIXME|HACK", "*.py")

        prompt = f"""Create a development plan.

## Items (features + issues):
{items_desc}

## Existing incomplete steps:
{chr(10).join(f"- {s['description']}" for s in existing) or "(none)"}

## Codebase TODOs (grep):
{grep_ctx[:1500]}

{f'## Past Mistakes to avoid:{chr(10)}{mistakes}' if mistakes else ''}

IMPORTANT: Every item above MUST appear in the plan. Issues should be prioritized before features.
Agent types: researcher, coder, analyst, tester, architect, reviewer, optimizer

Return ONLY JSON: [{{"description":"...","item_id":null,"agent_type":"coder"}}]"""

        result = runner.claude_retry(self.repo["path"], prompt, model="claude-opus-4-6", repo_id=self.repo["id"])
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        if result["success"]:
            try:
                out = result["output"]
                if isinstance(out, str):
                    s, e = out.find("["), out.rfind("]") + 1
                    if s >= 0 and e > s:
                        steps = json.loads(out[s:e])
                        self.db.save_plan(steps)
                        for i in pending:
                            self.db.ex("UPDATE items SET status='in_progress',started_at=datetime('now') WHERE id=?", (i["id"],))
                        self.db.commit()
                        self.db.mem_store("plans", f"plan_{int(time.time())}",
                                         {"steps": len(steps), "items": [i["title"] for i in pending]})
            except Exception as ex:
                self.db.log_mistake("plan_parse", str(ex))
                self.log("update_plan_error", error=str(ex))

        return State.CHECK_PLAN_COMPLETE

    def h_check_plan_complete(self):
        remaining = self.db.pending_steps()
        if not remaining:
            if self.repo.get("github_url"):
                runner.git_push(self.repo["path"], "feat: plan completed", self.repo.get("branch","main"))
            return State.IDLE
        return State.EXECUTE_STEP

    def h_execute_step(self):
        remaining = self.db.pending_steps()
        if not remaining:
            return State.CHECK_PLAN_COMPLETE

        step = remaining[0]
        desc = step["description"].lower()
        log.info(f"⚡ [{self.repo['name']}] Step: {step['description'][:60]}...")
        t0 = time.time()

        # Detect step type and spawn specialized agents
        if "test" in desc:
            agent_types = ["tester", "coder"]
            sparc_mode = "test"
        elif "api" in desc:
            agent_types = ["architect", "coder", "tester"]
            sparc_mode = "api"
        elif any(w in desc for w in ["ui", "frontend", "css", "component", "page"]):
            agent_types = ["coder", "reviewer"]
            sparc_mode = "ui"
        else:
            agent_types = ["coder", "tester"]
            sparc_mode = "dev"

        num_agents = len(agent_types) + 2
        runner.ruflo_setup(self.repo["path"])
        runner.ruflo_swarm(self.repo["path"], "hierarchical", num_agents, agent_types)
        self.state.active_agents = num_agents

        # Search Ruflo memory for prior context
        prior = runner.ruflo_memory_search(self.repo["path"], step["description"][:50])

        prompt = self._with_mistake_context(
            f"Complete: {step['description']}\n\n"
            "Use grep to check existing patterns. Follow conventions. "
            "Output STEP_COMPLETE when done."
            + (f"\n\nPrior context from memory:\n{prior}" if prior else "")
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=20, promise="STEP_COMPLETE", model="claude-sonnet-4-6")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        dur = time.time() - t0
        step_cost = result.get("cost", 0)
        self.log("execute_step", f"step_{step['id']}", agents=MIN_AGENTS,
                 cost=step_cost, dur=dur, error=result.get("error",""))

        if not result["success"] and result.get("error"):
            self.db.log_mistake("step_failed", result["error"][:500],
                                step_id=step["id"],
                                state_snapshot=json.dumps(self.state.to_dict()))

        self.db.mem_store("execution", f"step_{step['id']}",
                          {"desc": step["description"], "elapsed": dur, "ok": result["success"],
                           "cost": step_cost})
        self.state.current_step_id = step["id"]
        self._step_exec_cost = step_cost
        self._step_exec_dur = dur

        # Store in Ruflo memory
        runner.ruflo_memory_store(self.repo["path"], f"step/{step['id']}/result",
                                  f"{'OK' if result['success'] else 'FAIL'}: {step['description'][:100]}")

        # Telegram: step completed
        if TELEGRAM_ENABLED:
            try:
                from telegram_bot import send_message as tg_msg
                total_steps = len(self.db.all_steps())
                done_steps = len([s for s in self.db.all_steps() if s["status"] == "completed"])
                tg_msg(f"✅ *{self.repo['name']}* Step {done_steps+1}/{total_steps}: {step['description'][:60]}")
            except Exception as e:
                log.debug(f"Telegram notify failed: {e}")

        return State.TEST_STEP

    def h_test_step(self):
        sid = self.state.current_step_id
        step = self.db.fetchone("SELECT * FROM plan_steps WHERE id=?", (sid,))
        if not step:
            return State.CHECK_STEPS_LEFT

        log.info(f"🧪 [{self.repo['name']}] Testing step {sid}...")
        t0 = time.time()
        self.state.active_agents = 3
        self.save()

        # Use TDD-focused swarm
        runner.ruflo_swarm(self.repo["path"], "mesh", 3, ["tester", "tester"])

        prompt = self._with_mistake_context(
            f"You implemented: {step['description']}\n\n"
            "1. Write 10+ tests (happy, edge, error, integration)\n"
            "2. Run ALL tests in the suite\n"
            "3. Fix ALL failures\n"
            "Output TESTS_COMPLETE when all pass."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=15, promise="TESTS_COMPLETE", model="claude-sonnet-4-6")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        tw, tp = 10, 10
        try:
            o = result.get("output", "")
            if isinstance(o, str):
                s, e = o.find("{"), o.rfind("}") + 1
                if s >= 0 and e > s:
                    td = json.loads(o[s:e])
                    tw = td.get("tests_written", 10)
                    tp = td.get("tests_passed", 10)
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

        if not result["success"]:
            self.db.log_mistake("test_failure", f"Step {sid} tests failed: {result.get('error','')}",
                                step_id=sid, state_snapshot=json.dumps(self.state.to_dict()))

        test_dur = time.time() - t0
        test_cost = result.get("cost", 0)
        total_step_cost = getattr(self, "_step_exec_cost", 0) + test_cost
        total_step_dur = getattr(self, "_step_exec_dur", 0) + test_dur
        self.db.complete_step(sid, tw, tp, cost=total_step_cost, duration=total_step_dur)
        self.log("test_step", f"{tw} written, {tp} passed", dur=test_dur, cost=test_cost)

        if self.repo.get("github_url"):
            gate = runner.ruflo_quality_gate(self.repo["path"], "test")
            if not gate["passed"]:
                log.warning(f"⚠️ [{self.repo['name']}] Quality gate failed after step {sid}, pushing anyway")
            runner.git_push(self.repo["path"],
                            f"feat: {step['description'][:40]} + {tw} tests",
                            self.repo.get("branch","main"))
        return State.CHECK_STEPS_LEFT

    def h_check_steps_left(self):
        return State.EXECUTE_STEP if self.db.pending_steps() else State.CHECK_MORE_ITEMS

    def h_check_more_items(self):
        h = self.db.items_hash()
        if h != self.state.last_items_hash:
            self.state.last_items_hash = h
            return State.UPDATE_PLAN
        return State.FINAL_OPTIMIZE

    def h_final_optimize(self):
        log.info(f"🔧 [{self.repo['name']}] Optimizing...")
        # Dynamic agent count based on codebase size
        try:
            file_count = sum(1 for _ in Path(self.repo["path"]).rglob("*") if _.is_file()
                            and not any(p in str(_) for p in ["node_modules", ".git", "__pycache__", ".venv"]))
        except Exception:
            file_count = 50
        self.state.active_agents = min(max(file_count // 50, 2), 8)
        self.save()
        if TELEGRAM_ENABLED:
            try:
                from telegram_bot import send_message as tg_msg
                total = len(self.db.all_steps())
                tg_msg(f"🏗️ *{self.repo['name']}* — All {total} plan steps complete. Optimizing and scanning now.")
            except Exception as e:
                log.debug(f"Telegram notify failed: {e}")
        prompt = self._with_mistake_context(
            "Optimization: dead code removal, dedup, tree shaking (grep for unused). "
            "Output OPTIMIZE_COMPLETE when done."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=10, promise="OPTIMIZE_COMPLETE", model="claude-haiku-4-5-20251001")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED
        self.log("optimize", result.get("output","")[:300], cost=result.get("cost", 0))
        if self.repo.get("github_url"):
            gate = runner.ruflo_quality_gate(self.repo["path"], "full")
            if not gate["passed"]:
                log.warning(f"⚠️ [{self.repo['name']}] Quality gate failed after optimize: {gate['checks']}")
                # Stash broken changes so we don't push broken code
                runner.run_cmd(["git", "stash", "--include-untracked"], cwd=self.repo["path"], timeout=30)
                self.db.log_mistake("quality_gate_fail", f"Optimization broke quality gate: {gate['checks']}",
                                    state_snapshot="optimize")
                log.warning(f"⚠️ [{self.repo['name']}] Changes stashed due to gate failure")
            else:
                runner.git_push(self.repo["path"], "refactor: optimization pass", self.repo.get("branch","main"))
        return State.SCAN_REPO

    def h_scan_repo(self):
        log.info(f"🔎 [{self.repo['name']}] Final scan...")
        t0 = time.time()
        prompt = self._with_mistake_context(
            "Full scan: run all tests, check imports, verify build, update CLAUDE.md. "
            "Fix any issues. Output SCAN_COMPLETE."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=10, promise="SCAN_COMPLETE", model="claude-haiku-4-5-20251001")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        self.log("scan_repo", result.get("output", "")[:300], dur=time.time()-t0,
                 cost=result.get("cost", 0))

        self.db.ex("UPDATE items SET status='completed',completed_at=datetime('now') "
                   "WHERE status='in_progress'")
        self.db.commit()

        if self.repo.get("github_url"):
            gate = runner.ruflo_quality_gate(self.repo["path"], "full")
            if not gate["passed"]:
                log.warning(f"⚠️ [{self.repo['name']}] Quality gate failed on final scan: {gate['checks']}")
            runner.git_push(self.repo["path"], "chore: final scan passed", self.repo.get("branch","main"))

        self.state.cycle_count += 1
        self.state.active_agents = 0
        log.info(f"🎉 [{self.repo['name']}] Cycle {self.state.cycle_count} done!")

        # Gather cycle metrics
        items_done = self.db.fetchone("SELECT COUNT(*) c FROM items WHERE status='completed'")["c"]
        items_total = self.db.fetchone("SELECT COUNT(*) c FROM items")["c"]
        tests_passed = sum(s.get("tests_passed", 0) for s in self.db.all_steps())
        mistakes = len(self.db.get_mistakes(100))
        repo_cost = get_costs().get(self.repo["id"], 0)

        # Broadcast cycle completion for webhooks + SSE
        sse_broadcast("cycle_complete", {
            "repo": self.repo["name"], "repo_id": self.repo["id"],
            "cycle": self.state.cycle_count,
            "items_done": items_done, "items_total": items_total,
            "tests_passed": tests_passed, "mistakes": mistakes,
            "cost": repo_cost,
        })

        if TELEGRAM_ENABLED:
            try:
                from telegram_bot import send_message as tg_msg
                tg_msg(f"🎉 *{self.repo['name']}* finished cycle #{self.state.cycle_count}!\n"
                       f"📊 Items done: {items_done}/{items_total}\n"
                       f"🧪 Total tests passed: {tests_passed}\n"
                       f"💀 Mistakes this cycle: {mistakes}\n"
                       f"💰 Total cost: ${repo_cost:.2f}\n"
                       f"Next: watching for new items...")
            except Exception as e:
                log.debug(f"Telegram notify failed: {e}")

        return State.IDLE

    def h_credits_exhausted(self):
        """Wait for credits to return, then resume."""
        log.info(f"💳 [{self.repo['name']}] Waiting for credits... (checking every 60s)")
        time.sleep(60)

        # Probe with tiny request
        test = runner.claude(self.repo["path"], "Say OK", timeout=30)
        if not test.get("credits_exhausted"):
            log.info(f"✅ [{self.repo['name']}] Credits restored! Resuming from {self.state.paused_state}")
            resume = State(self.state.paused_state) if self.state.paused_state else State.CHECK_NEW_ITEMS
            self.state.paused_state = ""
            return resume
        return State.CREDITS_EXHAUSTED

    HANDLERS = {
        State.IDLE: "h_idle", State.CHECK_AUDIO: "h_check_audio",
        State.TRANSCRIBE_AUDIO: "h_transcribe_audio", State.PARSE_AUDIO_ITEMS: "h_parse_audio_items",
        State.CHECK_REFACTOR: "h_check_refactor", State.DO_REFACTOR: "h_do_refactor",
        State.CHECK_NEW_ITEMS: "h_check_new_items", State.UPDATE_PLAN: "h_update_plan",
        State.CHECK_PLAN_COMPLETE: "h_check_plan_complete", State.EXECUTE_STEP: "h_execute_step",
        State.TEST_STEP: "h_test_step", State.CHECK_STEPS_LEFT: "h_check_steps_left",
        State.CHECK_MORE_ITEMS: "h_check_more_items", State.FINAL_OPTIMIZE: "h_final_optimize",
        State.SCAN_REPO: "h_scan_repo", State.CREDITS_EXHAUSTED: "h_credits_exhausted",
    }

    def _telegram_notify(self, old_state, new_state):
        """Send SSE + Telegram notification on state transition."""
        old_val = old_state.value if hasattr(old_state, 'value') else str(old_state)
        new_val = new_state.value if hasattr(new_state, 'value') else str(new_state)

        # Always broadcast via SSE (regardless of Telegram)
        if old_val != new_val or new_val != "idle":
            sse_broadcast("state_change", {
                "repo": self.repo["name"], "repo_id": self.repo["id"],
                "from": old_val, "to": new_val,
                "cost": get_costs().get(self.repo["id"], 0),
            })

        if not TELEGRAM_ENABLED:
            return
        try:
            from telegram_bot import (notify_state_change, notify_cycle_complete,
                                       notify_credits_exhausted, notify_credits_restored,
                                       notify_error)
            # Only notify on meaningful transitions (skip idle->idle)
            if old_val == new_val == "idle":
                return

            if new_val == "credits_exhausted":
                notify_credits_exhausted(self.repo["name"])
            elif old_val == "credits_exhausted" and new_val != "credits_exhausted":
                notify_credits_restored(self.repo["name"], new_val)
            elif new_val == "idle" and old_val == "scan_repo":
                # Cycle complete
                items_done = self.db.fetchone(
                    "SELECT COUNT(*) c FROM items WHERE status='completed'")
                notify_cycle_complete(self.repo["name"], self.state.cycle_count,
                                      items_done["c"] if items_done else 0)
            else:
                notify_state_change(self.repo["name"], old_val, new_val)
        except Exception as e:
            log.debug(f"Telegram notify error: {e}")

    def run(self):
        self.state.running = True
        self.save()
        self.master.set_running(self.repo["id"], True)
        log.info(f"🚀 [{self.repo['name']}] Orchestrator started")

        try:
            while not self.stop_event.is_set():
                # Pause support — sleep in 1s intervals while paused
                while self.pause_event.is_set() and not self.stop_event.is_set():
                    time.sleep(1)
                if self.stop_event.is_set():
                    break
                # Budget check — pause if cost exceeded
                if BUDGET_LIMIT > 0 and self.state.current_state != State.IDLE:
                    repo_cost = get_costs().get(self.repo["id"], 0)
                    if repo_cost >= BUDGET_LIMIT:
                        log.warning(f"💰 [{self.repo['name']}] Budget limit ${BUDGET_LIMIT:.2f} exceeded (${repo_cost:.2f}), pausing")
                        sse_broadcast("budget_exceeded", {
                            "repo": self.repo["name"], "repo_id": self.repo["id"],
                            "cost": repo_cost, "budget": BUDGET_LIMIT,
                        })
                        self.pause_event.set()
                        continue

                old_state = self.state.current_state
                handler_name = self.HANDLERS.get(self.state.current_state, "h_idle")
                handler = getattr(self, handler_name, None)
                if handler is None:
                    log.error(f"[{self.repo['name']}] No handler for state {self.state.current_state}, resetting to IDLE")
                    self.state.current_state = State.IDLE
                    self.save()
                    continue
                try:
                    nxt = handler()
                except Exception as he:
                    log.exception(f"[{self.repo['name']}] Handler {handler_name} crashed: {he}")
                    self.state.errors.append(f"{handler_name}: {he}")
                    self.db.log_mistake("handler_crash", f"{handler_name} crashed: {he}",
                                        state_snapshot=json.dumps(self.state.to_dict()))
                    nxt = State.IDLE
                self.state.current_state = nxt
                self.state.last_activity = time.time()
                self.save()
                self._telegram_notify(old_state, nxt)
        except Exception as e:
            log.exception(f"💥 [{self.repo['name']}] Fatal: {e}")
            self.state.errors.append(str(e))
            self.db.log_mistake("fatal", str(e), state_snapshot=json.dumps(self.state.to_dict()))
            self.save()
            if TELEGRAM_ENABLED:
                try:
                    from telegram_bot import notify_error
                    notify_error(self.repo["name"], str(e))
                except Exception as tg_err:
                    log.debug(f"Telegram error notify failed: {tg_err}")
        finally:
            self.state.running = False
            self.save()
            self.master.set_running(self.repo["id"], False)
            log.info(f"⏹️ [{self.repo['name']}] Stopped")

    def stop(self):
        self.stop_event.set()

    def pause(self):
        self.pause_event.set()
        log.info(f"⏸️ [{self.repo['name']}] Paused")

    def resume(self):
        self.pause_event.clear()
        log.info(f"▶️ [{self.repo['name']}] Resumed")

    @property
    def is_paused(self):
        return self.pause_event.is_set()

    def cleanup(self):
        """Close the per-repo database connection."""
        if hasattr(self, "db") and self.db:
            try:
                self.db.close()
            except Exception as e:
                log.debug(f"DB close error for {getattr(self, 'repo', {}).get('name', '?')}: {e}")


# ─── Orchestrator Manager ────────────────────────────────────────────────────

class Manager:
    """Manages parallel orchestrators across multiple repos."""

    def __init__(self):
        self.master = MasterDB(MASTER_DB)
        self.orchestrators: Dict[int, RepoOrchestrator] = {}
        self.threads: Dict[int, threading.Thread] = {}

    def start_repo(self, repo_id):
        if repo_id in self.threads and self.threads[repo_id].is_alive():
            return {"ok": False, "error": "Already running"}

        repos = self.master.get_repos()
        repo = next((r for r in repos if r["id"] == repo_id), None)
        if not repo:
            return {"ok": False, "error": "Repo not found"}

        orch = RepoOrchestrator(repo, self.master)
        self.orchestrators[repo_id] = orch
        t = threading.Thread(target=orch.run, name=f"repo-{repo['name']}", daemon=True)
        self.threads[repo_id] = t
        t.start()
        return {"ok": True}

    def stop_repo(self, repo_id):
        if repo_id in self.orchestrators:
            self.orchestrators[repo_id].stop()
            return {"ok": True}
        return {"ok": False, "error": "Not running"}

    def pause_repo(self, repo_id):
        if repo_id in self.orchestrators:
            self.orchestrators[repo_id].pause()
            return {"ok": True}
        return {"ok": False, "error": "Not running"}

    def resume_repo(self, repo_id):
        if repo_id in self.orchestrators:
            self.orchestrators[repo_id].resume()
            return {"ok": True}
        return {"ok": False, "error": "Not running"}

    def start_all(self):
        results = {}
        for repo in self.master.get_repos():
            results[repo["name"]] = self.start_repo(repo["id"])
        return results

    def stop_all(self):
        for rid in list(self.orchestrators):
            self.stop_repo(rid)
        # Wait for threads to finish (5s max per thread)
        for rid, t in list(self.threads.items()):
            t.join(timeout=5)
        # Close database connections
        for rid, orch in list(self.orchestrators.items()):
            orch.cleanup()
        self.orchestrators.clear()
        self.threads.clear()

    def get_repo_db(self, repo_id) -> Optional[RepoDB]:
        repos = self.master.get_repos()
        repo = next((r for r in repos if r["id"] == repo_id), None)
        if not repo:
            return None
        os.makedirs(os.path.dirname(repo["db_path"]), exist_ok=True)
        return RepoDB(repo["db_path"])

    def get_repo_state(self, repo_id) -> dict:
        db = self.get_repo_db(repo_id)
        if not db:
            return {}
        state = db.load_state()
        return state.to_dict()

    def watchdog(self):
        """Background thread that auto-restarts dead repo threads and detects stuck orchestrators."""
        STUCK_THRESHOLD = 1800  # 30 minutes without state change
        while True:
            time.sleep(30)
            now = time.time()
            # Check for stuck orchestrators (alive but not progressing)
            for rid, orch in list(self.orchestrators.items()):
                if orch.state.running and not orch.pause_event.is_set():
                    idle_time = now - orch.state.last_activity
                    if idle_time > STUCK_THRESHOLD and orch.state.current_state not in (State.IDLE, State.CREDITS_EXHAUSTED):
                        repo_name = orch.repo.get("name", f"id={rid}")
                        state_name = orch.state.current_state.value
                        log.warning(f"⏰ Watchdog: [{repo_name}] stuck in {state_name} for {int(idle_time/60)}m, restarting...")
                        orch.stop()
                        if rid in self.threads:
                            self.threads[rid].join(timeout=10)
                        orch.cleanup()
                        del self.orchestrators[rid]
                        if rid in self.threads:
                            del self.threads[rid]
                        result = self.start_repo(rid)
                        if result.get("ok"):
                            sse_broadcast("watchdog", {"repo_id": rid, "repo_name": repo_name, "action": "unstuck", "was_stuck_in": state_name})
                            log.info(f"⏰ Watchdog: [{repo_name}] unstuck and restarted")
                        continue
            # Check for dead threads
            for rid, t in list(self.threads.items()):
                if not t.is_alive() and rid in self.orchestrators:
                    orch = self.orchestrators[rid]
                    # Only restart if the orchestrator was supposed to be running
                    if orch.state.running:
                        repo_name = orch.repo.get("name", f"id={rid}")
                        log.warning(f"🔄 Watchdog: thread for [{repo_name}] died, restarting...")
                        orch.cleanup()
                        del self.orchestrators[rid]
                        del self.threads[rid]
                        result = self.start_repo(rid)
                        if result.get("ok"):
                            log.info(f"🔄 Watchdog: [{repo_name}] restarted successfully")
                            sse_broadcast("watchdog", {"repo_id": rid, "repo_name": repo_name, "action": "restart"})
                            if TELEGRAM_ENABLED:
                                try:
                                    from telegram_bot import send_message as tg_send
                                    tg_send(f"🔄 Watchdog restarted *{repo_name}* (thread died)")
                                except Exception as tg_err:
                                    log.debug(f"Watchdog Telegram notify failed: {tg_err}")
                        else:
                            log.error(f"🔄 Watchdog: failed to restart [{repo_name}]: {result}")


manager = Manager()

# ─── Chat History ─────────────────────────────────────────────────────────────

chat_history = []  # in-memory chat history (latest 50)


# ─── Health Scanner ───────────────────────────────────────────────────────────

def scan_repo_health(repo):
    """Scan a repo for issues and return a health report."""
    path = repo["path"]
    issues = []

    def add(severity, title, desc, fixable=False):
        issues.append({"severity": severity, "title": title, "description": desc, "auto_fixable": fixable})

    if not os.path.isdir(path):
        add("critical", "Repo path missing", f"Path does not exist: {path}")
        return {"repo_id": repo["id"], "repo_name": repo["name"], "health_score": 0, "issues": issues}

    files = set()
    try:
        for item in os.listdir(path):
            files.add(item.lower())
    except OSError as e:
        log.warning(f"Cannot list directory {path}: {e}")

    # Missing essentials
    if ".gitignore" not in files:
        add("issue", "Add .gitignore", "No .gitignore file found", True)
    if "readme.md" not in files:
        add("issue", "Add README.md", "No README.md found", True)
    if "claude.md" not in files:
        add("issue", "Generate CLAUDE.md", "No CLAUDE.md for agent context", True)
    if "license" not in files and "license.md" not in files:
        add("issue", "Add LICENSE", "No license file found", True)

    # Check for tests
    has_tests = any(f.startswith("test") or f == "tests" or f == "__tests__" for f in files)
    if not has_tests:
        add("issue", "Add test coverage", "No test files or test directory found", True)

    # Dependency manifest
    has_manifest = any(f in files for f in ["package.json", "requirements.txt", "cargo.toml", "pyproject.toml", "go.mod"])
    if not has_manifest:
        add("warning", "No dependency manifest", "No package.json, requirements.txt, or equivalent found")

    # Code quality checks
    todo_count = 0
    large_files = []
    debug_lines = 0
    try:
        for root, dirs, fnames in os.walk(path):
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", ".next", "venv", ".venv", "dist", "build"}]
            for fname in fnames:
                fpath = os.path.join(root, fname)
                ext = os.path.splitext(fname)[1].lower()
                if ext not in {".py", ".js", ".jsx", ".ts", ".tsx", ".rs", ".go", ".java", ".rb", ".php"}:
                    continue
                try:
                    size = os.path.getsize(fpath)
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as fp:
                        lines = fp.readlines()
                    if len(lines) > 500:
                        large_files.append((os.path.relpath(fpath, path), len(lines)))
                    for line in lines:
                        ll = line.upper()
                        if any(t in ll for t in ["TODO", "FIXME", "HACK", "XXX"]):
                            todo_count += 1
                        if ext in {".py"} and "print(" in line and "test" not in fname.lower():
                            debug_lines += 1
                        if ext in {".js", ".jsx", ".ts", ".tsx"} and "console.log" in line and "test" not in fname.lower():
                            debug_lines += 1
                except (OSError, UnicodeDecodeError):
                    pass
    except OSError as e:
        log.debug(f"Code scan walk failed: {e}")

    if todo_count > 0:
        add("warning", f"Found {todo_count} TODO/FIXME comments", f"{todo_count} TODO/FIXME/HACK/XXX comments in code")
    if debug_lines > 3:
        add("warning", f"Found {debug_lines} debug statements", "console.log/print statements in production code")
    for fname, lc in large_files[:5]:
        add("warning", f"Large file: {fname}", f"{lc} lines — consider splitting")

    # Git checks
    git_dir = os.path.join(path, ".git")
    if not os.path.isdir(git_dir):
        add("issue", "Initialize git", "Not a git repository", True)
    else:
        # Check for .env tracked
        try:
            env_path = os.path.join(path, ".env")
            if os.path.exists(env_path):
                r = subprocess.run(["git", "ls-files", ".env"], cwd=path, capture_output=True, text=True,
                                   timeout=10, shell=(sys.platform == "win32"))
                if r.stdout.strip():
                    add("critical", "Remove .env from git", ".env file is tracked by git — contains secrets!", True)
        except (subprocess.TimeoutExpired, OSError):
            pass
        # Check for uncommitted changes
        try:
            r = subprocess.run(["git", "status", "--porcelain"], cwd=path, capture_output=True, text=True,
                               timeout=10, shell=(sys.platform == "win32"))
            if r.stdout.strip():
                changed = len(r.stdout.strip().split("\n"))
                add("warning", f"Uncommitted changes ({changed} files)", "Has uncommitted changes in working tree")
        except (subprocess.TimeoutExpired, OSError):
            pass
        # Check for remote
        try:
            r = subprocess.run(["git", "remote", "-v"], cwd=path, capture_output=True, text=True,
                               timeout=10, shell=(sys.platform == "win32"))
            if not r.stdout.strip():
                add("warning", "No git remote", "No remote configured — can't push")
        except (subprocess.TimeoutExpired, OSError):
            pass

    # Ruflo checks
    if ".claude-flow" not in files and ".ruflo" not in files:
        add("issue", "Initialize Ruflo", "No .claude-flow/ directory — Ruflo not set up", True)

    # Dependency install checks
    if "package.json" in files and "node_modules" not in files:
        lock = any(f in files for f in ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"])
        if not lock:
            add("issue", "Run npm install", "package.json exists but no node_modules or lockfile", True)

    # Calculate health score
    total_checks = 10  # base checks
    deductions = 0
    for issue in issues:
        if issue["severity"] == "critical":
            deductions += 2
        elif issue["severity"] == "issue":
            deductions += 1
        elif issue["severity"] == "warning":
            deductions += 0.5
    score = max(0, min(100, int((1 - deductions / total_checks) * 100)))

    return {"repo_id": repo["id"], "repo_name": repo["name"], "health_score": score, "issues": issues, "path": path}


def fix_repo_issue(repo, issue):
    """Auto-fix a single issue in a repo."""
    path = repo["path"]
    title = issue["title"]
    result = {"fixed": False, "title": title, "message": ""}

    if title == "Add .gitignore":
        # Detect project type and generate appropriate gitignore
        files = set(os.listdir(path))
        lines = ["# OS\n.DS_Store\nThumbs.db\n*.swp\n*.swo\n\n# IDE\n.idea/\n.vscode/\n*.sublime-*\n\n"]
        if "package.json" in files:
            lines.append("# Node\nnode_modules/\ndist/\nbuild/\n.next/\n*.log\n\n")
        if any(f.endswith(".py") for f in files):
            lines.append("# Python\n__pycache__/\n*.pyc\n*.pyo\nvenv/\n.venv/\n*.egg-info/\n\n")
        lines.append("# Env\n.env\n.env.local\n")
        with open(os.path.join(path, ".gitignore"), "w") as fp:
            fp.writelines(lines)
        result["fixed"] = True
        result["message"] = "Generated .gitignore"

    elif title == "Add LICENSE":
        year = datetime.now().year
        mit = f"""MIT License

Copyright (c) {year}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
        with open(os.path.join(path, "LICENSE"), "w") as fp:
            fp.write(mit)
        result["fixed"] = True
        result["message"] = "Added MIT License"

    elif title == "Initialize git":
        r = subprocess.run(["git", "init"], cwd=path, capture_output=True, text=True,
                          timeout=30, shell=(sys.platform == "win32"))
        result["fixed"] = r.returncode == 0
        result["message"] = "Initialized git repository" if result["fixed"] else f"git init failed: {r.stderr}"

    elif title == "Initialize Ruflo":
        r = runner.ruflo_init(path)
        result["fixed"] = r.get("success", False)
        result["message"] = "Initialized Ruflo" if result["fixed"] else "Ruflo init failed"

    elif title == "Run npm install":
        r = runner.run_cmd(["npm", "install"], cwd=path, timeout=120)
        result["fixed"] = r.get("success", False)
        result["message"] = "npm install complete" if result["fixed"] else "npm install failed"

    elif title.startswith("Remove .env from git"):
        subprocess.run(["git", "rm", "--cached", ".env"], cwd=path, capture_output=True, text=True,
                       timeout=10, shell=(sys.platform == "win32"))
        # Add to gitignore
        gi_path = os.path.join(path, ".gitignore")
        existing = ""
        if os.path.exists(gi_path):
            existing = open(gi_path).read()
        if ".env" not in existing:
            with open(gi_path, "a") as fp:
                fp.write("\n.env\n.env.local\n")
        result["fixed"] = True
        result["message"] = "Removed .env from git tracking, added to .gitignore"

    elif title == "Add README.md":
        readme = f"# {repo['name']}\n\nProject description goes here.\n"
        with open(os.path.join(path, "README.md"), "w") as fp:
            fp.write(readme)
        result["fixed"] = True
        result["message"] = "Created basic README.md"

    elif title == "Generate CLAUDE.md":
        claude_md = f"""# {repo['name']}

## Project Overview
This project is located at `{path}`.

## Key Files
Check the repository root for main source files.

## Conventions
- Follow existing code style
- Run tests before committing
- Keep functions focused and small

## Agent Instructions
- Use grep to scan the codebase before making changes
- Check for existing patterns before adding new ones
- Run the test suite after every change
"""
        with open(os.path.join(path, "CLAUDE.md"), "w") as fp:
            fp.write(claude_md)
        result["fixed"] = True
        result["message"] = "Generated CLAUDE.md"

    elif title == "Add test coverage":
        # Create basic test skeleton
        files = set(os.listdir(path))
        if "package.json" in files:
            os.makedirs(os.path.join(path, "__tests__"), exist_ok=True)
            with open(os.path.join(path, "__tests__", "basic.test.js"), "w") as fp:
                fp.write("describe('Basic', () => {\n  test('should pass', () => {\n    expect(true).toBe(true);\n  });\n});\n")
            result["message"] = "Created __tests__/basic.test.js skeleton"
        else:
            with open(os.path.join(path, "test_basic.py"), "w") as fp:
                fp.write("def test_basic():\n    assert True\n")
            result["message"] = "Created test_basic.py skeleton"
        result["fixed"] = True

    return result


def detect_project_type(path):
    """Detect project type and tech stack from files."""
    files = set()
    try:
        for item in os.listdir(path):
            files.add(item.lower())
    except OSError:
        return {"type": "unknown", "stack": [], "file_count": 0}

    stack = []
    ptype = "unknown"
    file_count = 0

    # Count source files
    for root, dirs, fnames in os.walk(path):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", ".next", "venv", "dist", "build"}]
        file_count += len([f for f in fnames if any(f.endswith(e) for e in [".py", ".js", ".jsx", ".ts", ".tsx", ".rs", ".go"])])

    if "package.json" in files:
        stack.append("node")
        if any(f in files for f in [".jsx", ".tsx"]) or os.path.isdir(os.path.join(path, "src")):
            # Check for React
            try:
                pkg = json.load(open(os.path.join(path, "package.json")))
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react" in deps:
                    stack.append("react")
                if "next" in deps:
                    stack.append("nextjs")
                if "express" in deps:
                    stack.append("express")
                if "typescript" in deps:
                    stack.append("typescript")
            except (json.JSONDecodeError, OSError, KeyError):
                pass
        ptype = "node-react" if "react" in stack else "node"

    if any(f.endswith(".py") for f in files) or "requirements.txt" in files or "pyproject.toml" in files:
        stack.append("python")
        if "requirements.txt" in files:
            try:
                reqs = open(os.path.join(path, "requirements.txt")).read().lower()
                if "fastapi" in reqs:
                    stack.append("fastapi")
                if "flask" in reqs:
                    stack.append("flask")
                if "django" in reqs:
                    stack.append("django")
            except OSError:
                pass
        ptype = "python" if ptype == "unknown" else "fullstack"

    if "cargo.toml" in files:
        stack.append("rust")
        ptype = "rust"

    if ptype == "unknown":
        # Static site
        if any(f.endswith(".html") for f in files):
            stack.append("html")
            ptype = "static"

    # Determine swarm size
    if file_count < 20:
        swarm_size = 4
        topology = "mesh"
    elif file_count < 100:
        swarm_size = 8
        topology = "hierarchical"
    else:
        swarm_size = 12
        topology = "hierarchical"

    # Determine SPARC mode
    sparc = "dev"
    if "fastapi" in stack or "express" in stack or "flask" in stack:
        sparc = "api"
    elif "react" in stack or "nextjs" in stack:
        sparc = "ui"
    elif has_tests_in(path):
        sparc = "tdd"

    return {
        "type": ptype, "stack": stack, "file_count": file_count,
        "swarm_size": swarm_size, "topology": topology, "sparc_mode": sparc,
    }


def has_tests_in(path):
    """Check if repo has substantial test files."""
    for root, dirs, fnames in os.walk(path):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", "venv", "dist"}]
        for f in fnames:
            if f.startswith("test_") or f.endswith("_test.py") or f.endswith(".test.js") or f.endswith(".test.ts") or f.endswith(".spec.js"):
                return True
    return False


def handle_chat_command(message):
    """Parse a natural language chat command and execute it."""
    msg = message.lower().strip()
    repos = manager.master.get_repos()

    # "fix all gitignores" / "add gitignore everywhere"
    if "gitignore" in msg and ("fix" in msg or "add" in msg or "all" in msg):
        fixed = 0
        for repo in repos:
            if not os.path.exists(os.path.join(repo["path"], ".gitignore")):
                r = fix_repo_issue(repo, {"title": "Add .gitignore"})
                if r["fixed"]:
                    fixed += 1
        return {"message": f"Added .gitignore to {fixed} repos.", "action": "fix_gitignore", "count": fixed}

    # "add tests to X"
    m = re.search(r"add tests? to (.+)", msg)
    if m:
        target = m.group(1).strip()
        repo = next((r for r in repos if target in r["name"].lower()), None)
        if repo:
            r = fix_repo_issue(repo, {"title": "Add test coverage"})
            return {"message": f"Added test skeleton to {repo['name']}: {r['message']}", "action": "add_tests"}
        return {"message": f"Repo '{target}' not found.", "action": "error"}

    # "scan" / "scan all"
    if "scan" in msg:
        results = [scan_repo_health(r) for r in repos]
        avg_score = sum(r["health_score"] for r in results) / max(len(results), 1)
        total_issues = sum(len(r["issues"]) for r in results)
        return {"message": f"Scanned {len(results)} repos. Average health: {avg_score:.0f}%. {total_issues} total issues found.",
                "action": "scan", "results": results}

    # "fix all" / "fix everything"
    if "fix" in msg and ("all" in msg or "everything" in msg):
        all_results = []
        for repo in repos:
            report = scan_repo_health(repo)
            for issue in report["issues"]:
                if issue["auto_fixable"]:
                    r = fix_repo_issue(repo, issue)
                    r["repo_name"] = repo["name"]
                    all_results.append(r)
        fixed = sum(1 for r in all_results if r["fixed"])
        return {"message": f"Fixed {fixed}/{len(all_results)} auto-fixable issues across {len(repos)} repos.",
                "action": "fix_all", "results": all_results}

    # "start X" / "stop X"
    for action in ["start", "stop"]:
        if msg.startswith(action):
            target = msg.replace(action, "").strip()
            if target == "all":
                if action == "start":
                    manager.start_all()
                else:
                    manager.stop_all()
                return {"message": f"{action.title()}ed all repos.", "action": f"{action}_all"}
            repo = next((r for r in repos if target in r["name"].lower()), None)
            if repo:
                if action == "start":
                    manager.start_repo(repo["id"])
                else:
                    manager.stop_repo(repo["id"])
                return {"message": f"{action.title()}ed {repo['name']}.", "action": action}
            return {"message": f"Repo '{target}' not found.", "action": "error"}

    # "update all readmes"
    if "readme" in msg and ("update" in msg or "add" in msg or "all" in msg):
        fixed = 0
        for repo in repos:
            if not os.path.exists(os.path.join(repo["path"], "README.md")):
                r = fix_repo_issue(repo, {"title": "Add README.md"})
                if r["fixed"]:
                    fixed += 1
        return {"message": f"Added README.md to {fixed} repos.", "action": "add_readmes", "count": fixed}

    # "npm install" in various repos
    if "npm install" in msg:
        target = msg.replace("npm install", "").replace("run", "").replace("in", "").strip()
        targets = []
        if "all" in target or not target:
            targets = [r for r in repos if os.path.exists(os.path.join(r["path"], "package.json"))]
        else:
            repo = next((r for r in repos if target in r["name"].lower()), None)
            if repo:
                targets = [repo]
        done = 0
        for repo in targets:
            r = runner.run_cmd(["npm", "install"], cwd=repo["path"], timeout=120)
            if r.get("success"):
                done += 1
        return {"message": f"Ran npm install in {done}/{len(targets)} repos.", "action": "npm_install"}

    # "add feature/issue to X: description"
    m = re.search(r"add (feature|issue) to (.+?):\s*(.+)", msg)
    if m:
        itype, target, desc = m.group(1), m.group(2).strip(), m.group(3).strip()
        repo = next((r for r in repos if target in r["name"].lower()), None)
        if repo:
            db = manager.get_repo_db(repo["id"])
            if db:
                db.add_item(itype, desc[:80], desc, "medium", "chat")
                return {"message": f"Added {itype} to {repo['name']}: {desc[:80]}", "action": "add_item"}
        return {"message": f"Repo '{target}' not found.", "action": "error"}

    # Default — don't know
    return {"message": f"I don't understand '{message}'. Try: 'scan all', 'fix all', 'start/stop [repo]', 'add feature to [repo]: [description]', 'add tests to [repo]'.",
            "action": "unknown"}


# ─── API Server ───────────────────────────────────────────────────────────────

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

MIME_TYPES = {
    ".html": "text/html",
    ".jsx": "application/javascript",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


# ─── Rate Limiting ────────────────────────────────────────────────────────────

_rate_limits = {}  # ip -> [timestamps]
_rate_lock = threading.Lock()
RATE_LIMIT_RPM = int(os.environ.get("RATE_LIMIT_RPM", "120"))  # requests per minute
RATE_EXEMPT_PATHS = {"/", "/index.html", "/swarm-dashboard.jsx", "/api/events",
                      "/api/token", "/telegram-app", "/api/status"}


RATE_STRICT_PATHS = {"/api/chat", "/api/bridge/inbox", "/api/bridge/outbox"}
RATE_STRICT_RPM = 30  # stricter limit for chat/bridge (30/min)
_rate_strict = {}  # ip:path -> [timestamps]


def _check_rate_limit(ip, path):
    """Return True if request is allowed, False if rate-limited."""
    path = path.rstrip("/") or "/"  # Normalize trailing slashes
    if path in RATE_EXEMPT_PATHS:
        return True
    now = time.time()
    with _rate_lock:
        # Stricter limit for chat/bridge endpoints
        if path in RATE_STRICT_PATHS:
            key = f"{ip}:{path}"
            if key not in _rate_strict:
                _rate_strict[key] = []
            _rate_strict[key] = [t for t in _rate_strict[key] if now - t < 60]
            if len(_rate_strict[key]) >= RATE_STRICT_RPM:
                return False
            _rate_strict[key].append(now)
        # General rate limit
        if ip not in _rate_limits:
            _rate_limits[ip] = []
        # Prune old entries (older than 60s)
        _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < 60]
        if len(_rate_limits[ip]) >= RATE_LIMIT_RPM:
            return False
        _rate_limits[ip].append(now)
        return True


# ─── Request Metrics ──────────────────────────────────────────────────────────

_metrics = {"total": 0, "endpoints": {}, "errors": 0, "rate_limited": 0, "latencies": {}}
_metrics_lock = threading.Lock()


def _record_metric(path, status_code=200, latency_ms=0):
    """Record a request metric with optional latency."""
    with _metrics_lock:
        _metrics["total"] += 1
        _metrics["endpoints"][path] = _metrics["endpoints"].get(path, 0) + 1
        if status_code >= 400:
            _metrics["errors"] += 1
        if status_code == 429:
            _metrics["rate_limited"] += 1
        if latency_ms > 0:
            if path not in _metrics["latencies"]:
                _metrics["latencies"][path] = []
            lat = _metrics["latencies"][path]
            lat.append(latency_ms)
            # Keep only last 100 measurements per endpoint
            if len(lat) > 100:
                _metrics["latencies"][path] = lat[-100:]


# Simple in-memory response cache (TTL-based)
_response_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3  # seconds


def _cache_get(key):
    with _cache_lock:
        entry = _response_cache.get(key)
        if entry and time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
    return None


def _cache_set(key, data):
    with _cache_lock:
        _response_cache[key] = {"data": data, "ts": time.time()}


class API(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Telegram-Init-Data")

    def _check_rate(self):
        """Check rate limit. Returns True if OK, False if limited (response sent)."""
        ip = self.client_address[0]
        path = urlparse(self.path).path
        if not _check_rate_limit(ip, path):
            self._json({"error": "Rate limited — too many requests"}, 429)
            return False
        return True

    def _check_auth(self):
        """Three-layer auth check. Returns True if authorized, False if denied (response already sent)."""
        p = urlparse(self.path).path

        # Exempt paths don't need bearer token
        if p in AUTH_EXEMPT_PATHS:
            return True

        # Layer 1: Bearer token required for all /api/* endpoints (except exempted)
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer ") or auth_header[7:] != API_TOKEN:
            self._json({"error": "Unauthorized — missing or invalid bearer token"}, 401)
            return False

        # Layer 2 + 3: Telegram initData validation (additional layer, only if header present)
        tg_init_data = self.headers.get("X-Telegram-Init-Data")
        if tg_init_data:
            result = validate_telegram_init_data(tg_init_data)
            if not result["valid"]:
                self._json({"error": "Forbidden — Telegram initData validation failed"}, 403)
                return False

            # Layer 3: Chat ID whitelist (only for requests with Telegram initData)
            user = result.get("user")
            if user and user.get("id") not in TELEGRAM_WHITELIST:
                self._json({"error": "Forbidden — user not whitelisted"}, 403)
                return False

        return True

    def _serve_file(self, filepath):
        """Serve a static file from the project directory."""
        try:
            ext = os.path.splitext(filepath)[1]
            content_type = MIME_TYPES.get(ext, "application/octet-stream")
            with open(filepath, "rb") as fp:
                data = fp.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self._json({"error": "Not found"}, 404)

    def _json(self, data, status=200):
        path = urlparse(self.path).path
        latency = (time.time() - getattr(self, "_req_start", time.time())) * 1000
        _record_metric(path, status, latency)
        req_id = getattr(self, "_req_id", secrets.token_hex(8))
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Request-ID", req_id)
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2, default=str).encode())

    MAX_BODY_SIZE = 50 * 1024 * 1024  # 50 MB

    @staticmethod
    def _safe_int(val, default=None):
        """Safely convert value to int, return default on failure."""
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        if not n:
            return {}
        if n > self.MAX_BODY_SIZE:
            return {}
        try:
            return json.loads(self.rfile.read(n))
        except (json.JSONDecodeError, ValueError):
            return {}

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        self._req_start = time.time()
        self._req_id = secrets.token_hex(8)
        p = urlparse(self.path)
        path = p.path
        q = parse_qs(p.query)

        # Rate limit check
        if not self._check_rate():
            return

        # Auth check (exempt paths handled inside _check_auth)
        if not self._check_auth():
            return

        # Static file serving
        if path == "/" or path == "/index.html":
            return self._serve_file(os.path.join(STATIC_DIR, "index.html"))
        if path == "/swarm-dashboard.jsx":
            return self._serve_file(os.path.join(STATIC_DIR, "swarm-dashboard.jsx"))

        # Token endpoint — returns current API token (exempt from auth, accessed locally)
        if path == "/api/token":
            return self._json({"token": API_TOKEN})

        # SSE — Server-Sent Events for real-time dashboard updates
        if path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self._cors()
            self.end_headers()
            client_q = sse_register()
            try:
                # Send initial heartbeat
                self.wfile.write(b"event: connected\ndata: {}\n\n")
                self.wfile.flush()
                while True:
                    try:
                        msg = client_q.get(timeout=15)
                        self.wfile.write(msg.encode())
                        self.wfile.flush()
                    except queue.Empty:
                        # Send keepalive
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                sse_unregister(client_q)
            return

        # Cost tracking — per-repo API costs
        if path == "/api/costs":
            costs = get_costs()
            return self._json({"costs": costs, "total": sum(costs.values())})

        if path == "/api/costs/history":
            days = min(int(q.get("days", [30])[0]), 365)
            history = master.get_cost_history(days)
            return self._json({"history": history, "days": days})

        # Telegram Mini App — serve the self-contained HTML file with token injected
        if path == "/telegram-app":
            html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot", "telegram-app.html")
            try:
                with open(html_path, "r", encoding="utf-8") as fp:
                    content = fp.read()
                # Inject API token so Mini App can authenticate
                token_script = f'<script>window.__SWARM_API_TOKEN__="{API_TOKEN}";</script>'
                content = content.replace("</head>", token_script + "</head>", 1)
                encoded = content.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(encoded)))
                self._cors()
                self.end_headers()
                self.wfile.write(encoded)
            except FileNotFoundError:
                self._json({"error": "telegram-app.html not found"}, 404)
            return

        if path == "/api/repos":
            name_q = q.get("q", [""])[0].strip().lower()
            cache_key = f"repos:{name_q}"
            cached = _cache_get(cache_key)
            if cached is not None:
                return self._json(cached)
            repos = manager.master.get_repos()
            if name_q:
                repos = [r for r in repos if name_q in r["name"].lower()]
            # Enrich with state — batch counts in single query per repo
            for r in repos:
                try:
                    db = RepoDB(r["db_path"])
                    st = db.load_state()
                    r["state"] = st.current_state.value
                    r["cycle_count"] = st.cycle_count
                    r["active_agents"] = st.active_agents
                    r["running"] = st.running or r.get("running", 0)
                    # Check if paused
                    orch = manager.orchestrators.get(r["id"])
                    r["paused"] = orch.is_paused if orch else False
                    # Single query for all item counts
                    ic = db.fetchone(
                        "SELECT COUNT(*) c,"
                        " SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) done,"
                        " SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pend,"
                        " SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) prog"
                        " FROM items")
                    sc = db.fetchone(
                        "SELECT COUNT(*) c,"
                        " SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) done"
                        " FROM plan_steps")
                    mc = db.fetchone("SELECT COUNT(*) c FROM mistakes")
                    mem_c = db.fetchone("SELECT COUNT(*) c FROM memory")
                    ac = db.fetchone("SELECT COUNT(*) c FROM audio_reviews")
                    stats = {
                        "items_total": ic["c"],
                        "items_done": ic["done"] or 0,
                        "items_pending": ic["pend"] or 0,
                        "items_in_progress": ic["prog"] or 0,
                        "steps_total": sc["c"],
                        "steps_done": sc["done"] or 0,
                        "steps_pending": sc["c"] - (sc["done"] or 0),
                        "agents": st.active_agents,
                        "memory": mem_c["c"],
                        "mistakes": mc["c"],
                        "audio": ac["c"],
                    }
                    # Include ruflo config
                    ruflo_rows = db.fetchall("SELECT key, value FROM memory WHERE namespace='ruflo_config'")
                    stats["ruflo_config"] = {row["key"]: row["value"] for row in ruflo_rows}
                    r["stats"] = stats
                except Exception as e:
                    log.debug(f"Stats fetch failed for repo {r.get('name', '?')}: {e}")
                    r["state"] = "idle"
                    r["stats"] = {}
            _cache_set(cache_key, repos)
            return self._json(repos)

        # Per-repo endpoints need repo_id
        rid = int(q.get("repo_id", [0])[0]) if "repo_id" in q else None
        # Pagination params
        limit = min(int(q.get("limit", [200])[0]), 1000)
        offset = max(int(q.get("offset", [0])[0]), 0)
        status_filter = q.get("status", [None])[0]
        source_filter = q.get("source", [None])[0]

        if path == "/api/items" and rid:
            db = manager.get_repo_db(rid)
            if not db: return self._json([])
            where_parts, params = [], []
            if status_filter:
                where_parts.append("status=?"); params.append(status_filter)
            if source_filter:
                where_parts.append("source=?"); params.append(source_filter)
            where_clause = " WHERE " + " AND ".join(where_parts) if where_parts else ""
            params.extend([limit, offset])
            return self._json(db.fetchall(
                f"SELECT * FROM items{where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                tuple(params)))

        if path == "/api/plan" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.all_steps() if db else [])

        if path == "/api/logs" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.fetchall(
                "SELECT * FROM execution_log ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (limit, offset)) if db else [])

        if path == "/api/history" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json([])
            # Combine DB history with git log
            history = db.get_history(100)
            # Also fetch git log for this repo
            repo = next((r for r in manager.master.get_repos() if r["id"] == rid), None)
            if repo and os.path.isdir(os.path.join(repo["path"], ".git")):
                try:
                    result = subprocess.run(
                        ["git", "log", "--oneline", "-30", "--format=%H|%s|%ai"],
                        cwd=repo["path"], capture_output=True, text=True, timeout=10
                    )
                    for line in result.stdout.strip().split("\n"):
                        if "|" in line:
                            parts = line.split("|", 2)
                            if len(parts) == 3:
                                history.append({
                                    "id": None, "action": "git_commit",
                                    "details": parts[1], "commit_hash": parts[0],
                                    "state_before": "", "state_after": "",
                                    "items_snapshot": "", "created_at": parts[2]
                                })
                except Exception as e:
                    log.debug(f"Git log fetch failed for history: {e}")
            # Sort by created_at descending
            history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return self._json(history[:100])

        if path == "/api/agents" and rid:
            try:
                db = manager.get_repo_db(rid)
                if not db:
                    return self._json([])
                # Try real agents table first
                real = db.fetchall("SELECT * FROM agents WHERE status='running'")
                if real:
                    return self._json(real)
                # Generate virtual agents from orchestrator state
                repo = master.get_repo(rid)
                if repo:
                    st = db.load_state()
                    n = st.active_agents or 0
                    state_name = st.current_state.value if st.current_state else "idle"
                    agent_types = {"do_refactor": ["architect","coder","reviewer","coder"],
                                   "execute_step": ["coder","tester","coder","architect","reviewer"],
                                   "test_step": ["tester","tester","coder"],
                                   "update_plan": ["analyst","architect"],
                                   "final_optimize": ["optimizer","coder"],
                                   "scan_repo": ["scanner","tester"]}
                    types = agent_types.get(state_name, ["coder"] * n)[:n]
                    virtual = [{"id": i+1, "agent_id": f"ruflo-{t}-{i+1}", "agent_type": t,
                                "status": "running", "task": state_name.replace("_"," ").title()}
                               for i, t in enumerate(types)]
                    return self._json(virtual)
                return self._json([])
            except Exception as e:
                log.error(f"Error in /api/agents: {e}")
                return self._json([])

        if path == "/api/memory" and rid:
            db = manager.get_repo_db(rid)
            if not db: return self._json([])
            sq = q.get("q", [""])[0]
            return self._json(db.mem_search(sq) if sq else db.fetchall("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 50"))

        if path == "/api/mistakes" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.get_mistakes(50) if db else [])

        if path == "/api/mistakes/analysis" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json({"error_types": [], "total": 0, "resolution_rate": 0})
            all_m = db.fetchall("SELECT error_type, resolution, created_at FROM mistakes ORDER BY created_at DESC")
            # Count by error type
            type_counts = {}
            resolved = 0
            for m in all_m:
                et = m.get("error_type", "unknown")
                type_counts[et] = type_counts.get(et, 0) + 1
                if m.get("resolution"):
                    resolved += 1
            sorted_types = sorted(type_counts.items(), key=lambda x: -x[1])
            chronic = [{"error_type": et, "count": c} for et, c in sorted_types if c >= 3]
            return self._json({
                "error_types": [{"error_type": et, "count": c} for et, c in sorted_types],
                "total": len(all_m),
                "resolved": resolved,
                "resolution_rate": round(resolved / len(all_m) * 100, 1) if all_m else 0,
                "chronic_patterns": chronic,
                "top_5": [{"error_type": et, "count": c} for et, c in sorted_types[:5]],
            })

        if path == "/api/audio" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.fetchall("SELECT * FROM audio_reviews ORDER BY created_at DESC") if db else [])

        if path == "/api/state" and rid:
            return self._json(manager.get_repo_state(rid))

        if path == "/api/search":
            query = q.get("q", [None])[0]
            if not query or len(query) < 2:
                return self._json({"error": "Query too short (min 2 chars)"}, 400)
            scope = q.get("scope", ["all"])[0]  # all, items, logs, mistakes
            limit = min(int(q.get("limit", [50])[0]), 200)
            results = {"items": [], "logs": [], "mistakes": []}
            repos = manager.master.get_repos()
            qlike = f"%{query}%"
            for repo in repos:
                db = manager.get_repo_db(repo["id"])
                if not db:
                    continue
                rname = repo["name"]
                if scope in ("all", "items"):
                    for it in db.fetchall("SELECT * FROM items WHERE title LIKE ? OR description LIKE ? LIMIT ?", (qlike, qlike, limit)):
                        it["repo_name"] = rname
                        it["repo_id"] = repo["id"]
                        results["items"].append(it)
                if scope in ("all", "logs"):
                    for lg in db.fetchall("SELECT * FROM execution_log WHERE action LIKE ? OR result LIKE ? OR error LIKE ? ORDER BY created_at DESC LIMIT ?", (qlike, qlike, qlike, limit)):
                        lg["repo_name"] = rname
                        lg["repo_id"] = repo["id"]
                        results["logs"].append(lg)
                if scope in ("all", "mistakes"):
                    for mk in db.fetchall("SELECT * FROM mistakes WHERE description LIKE ? OR error_type LIKE ? OR resolution LIKE ? ORDER BY created_at DESC LIMIT ?", (qlike, qlike, qlike, limit)):
                        mk["repo_name"] = rname
                        mk["repo_id"] = repo["id"]
                        results["mistakes"].append(mk)
            results["total"] = sum(len(v) for v in results.values())
            return self._json(results)

        if path == "/api/circuit-breakers":
            repos = manager.master.get_repos()
            cbs = []
            for r in repos:
                cb = get_circuit_breaker(r["id"])
                status = cb.status()
                status["repo_id"] = r["id"]
                status["repo_name"] = r["name"]
                if cb.last_failure > 0:
                    status["last_failure_ago"] = round(time.time() - cb.last_failure)
                cbs.append(status)
            return self._json({"circuit_breakers": cbs})

        if path == "/api/health-scan":
            repos = manager.master.get_repos()
            results = []
            for repo in repos:
                report = scan_repo_health(repo)
                report["project_type"] = detect_project_type(repo["path"])
                results.append(report)
            return self._json(results)

        if path == "/api/health/detailed":
            repos_list = manager.master.get_repos()
            scores = []
            for repo in repos_list:
                score = 100
                issues = []
                try:
                    db = RepoDB(repo["db_path"]) if repo.get("db_path") and os.path.exists(repo["db_path"]) else None
                    if not db:
                        scores.append({"repo": repo["name"], "score": 0, "issues": ["DB not found"]})
                        continue
                    ic = db.fetchone("SELECT COUNT(*) c,"
                        " SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) done,"
                        " SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) prog"
                        " FROM items")
                    mc = db.fetchone("SELECT COUNT(*) c FROM mistakes")
                    # Deductions
                    if ic["c"] > 0 and (ic["done"] or 0) == 0:
                        score -= 20; issues.append("No completed items")
                    if (ic["prog"] or 0) > 5:
                        score -= 15; issues.append(f"{ic['prog']} items stuck in progress")
                    if mc["c"] > 20:
                        score -= 15; issues.append(f"{mc['c']} mistakes (high)")
                    elif mc["c"] > 10:
                        score -= 5; issues.append(f"{mc['c']} mistakes")
                    # Circuit breaker check
                    with _cb_lock:
                        cb = _circuit_breakers.get(repo["id"])
                        if cb and cb.state != CircuitBreaker.CLOSED:
                            score -= 25; issues.append(f"Circuit breaker {cb.state}")
                    if not repo.get("running"):
                        score -= 10; issues.append("Not running")
                    cost = _cost_totals.get(repo["id"], 0)
                    if cost > 5.0:
                        score -= 10; issues.append(f"High cost: ${cost:.2f}")
                except Exception as e:
                    score = 0; issues.append(f"Error: {e}")
                scores.append({"repo": repo["name"], "repo_id": repo["id"],
                               "score": max(0, score), "issues": issues,
                               "grade": "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"})
            avg = sum(s["score"] for s in scores) / max(len(scores), 1)
            return self._json({"repos": scores, "average_score": round(avg, 1),
                               "total": len(scores)})

        if path == "/api/chat/history":
            return self._json(chat_history[-50:])

        if path == "/api/ruflo-config" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json({})
            configs = db.fetchall("SELECT * FROM memory WHERE namespace='ruflo_config'")
            return self._json({c["key"]: c["value"] for c in configs})

        # ─── Chat Bridge GET endpoints ────────────────────────────────────────
        if path == "/api/bridge/outbox":
            since = q.get("since", [None])[0]
            return self._json(bridge_read_outbox(since))

        if path == "/api/bridge/inbox":
            if not os.path.exists(BRIDGE_INBOX):
                return self._json([])
            entries = []
            with open(BRIDGE_INBOX, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
            return self._json(entries[-50:])

        if path == "/api/bridge/instruction":
            if os.path.exists(BRIDGE_INSTRUCTION):
                with open(BRIDGE_INSTRUCTION, "r", encoding="utf-8") as f:
                    return self._json({"instruction": f.read()})
            return self._json({"instruction": ""})

        # Repo export — dump all repos as JSON for backup/migration
        if path == "/api/repos/export":
            repos = manager.master.get_repos()
            export = [{"name": r["name"], "path": r["path"], "github_url": r.get("github_url", ""),
                        "branch": r.get("branch", "main")} for r in repos]
            return self._json({"repos": export, "count": len(export),
                               "exported_at": datetime.now(timezone.utc).isoformat()})

        # Full repo data export — items, plan, logs, mistakes for backup
        if path == "/api/repos/snapshot" and "repo_id" in q:
            rid = int(q["repo_id"][0])
            db = manager.get_repo_db(rid)
            if not db:
                return self._json({"error": "Repo not found"}, 404)
            repo = manager.master.get_repo(rid)
            include = set((q.get("include", ["all"])[0]).split(","))
            snap = {"repo": repo.get("name", "?"), "exported_at": datetime.now(timezone.utc).isoformat()}
            if "all" in include or "items" in include:
                snap["items"] = db.fetchall("SELECT * FROM items ORDER BY created_at DESC")
            if "all" in include or "plan" in include:
                snap["plan_steps"] = db.all_steps()
            if "all" in include or "logs" in include:
                snap["logs"] = db.fetchall("SELECT * FROM execution_log ORDER BY created_at DESC LIMIT 500")
            if "all" in include or "mistakes" in include:
                snap["mistakes"] = db.get_mistakes(500)
            if "all" in include or "memory" in include:
                snap["memory"] = db.fetchall("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 200")
            return self._json(snap)

        # System status — uptime, counts, version
        if path == "/api/status":
            uptime_sec = time.time() - _start_time
            hrs, rem = divmod(int(uptime_sec), 3600)
            mins, secs = divmod(rem, 60)
            repos = manager.master.get_repos()
            running = sum(1 for r in repos if r.get("running"))
            with _sse_lock:
                sse_count = len(_sse_clients)
            costs = get_costs()
            cb_summary = {}
            with _cb_lock:
                for rid, cb in _circuit_breakers.items():
                    if cb.state != CircuitBreaker.CLOSED:
                        cb_summary[rid] = cb.status()
            return self._json({
                "uptime": f"{hrs}h {mins}m {secs}s",
                "uptime_seconds": int(uptime_sec),
                "repos_total": len(repos),
                "repos_running": running,
                "sse_clients": sse_count,
                "total_cost": sum(costs.values()),
                "circuit_breakers": cb_summary,
                "version": "3.0",
            })

        if path == "/api/metrics":
            with _metrics_lock:
                top_endpoints = sorted(_metrics["endpoints"].items(), key=lambda x: -x[1])[:20]
                latency_stats = {}
                for ep, vals in _metrics["latencies"].items():
                    if vals:
                        s = sorted(vals)
                        latency_stats[ep] = {
                            "avg_ms": round(sum(s) / len(s), 1),
                            "p50_ms": round(s[len(s)//2], 1),
                            "p95_ms": round(s[int(len(s)*0.95)], 1) if len(s) >= 2 else round(s[-1], 1),
                            "max_ms": round(s[-1], 1),
                            "count": len(s),
                        }
            return self._json({
                "total_requests": _metrics["total"],
                "errors": _metrics["errors"],
                "rate_limited": _metrics["rate_limited"],
                "top_endpoints": dict(top_endpoints),
                "latency": latency_stats,
            })

        # Daily digest — generate on demand
        if path == "/api/digest":
            return self._json({"digest": generate_daily_digest()})

        if path == "/api/webhooks":
            return self._json({"webhooks": webhook_list()})

        if path == "/api/budget":
            return self._json({"budget_limit": BUDGET_LIMIT,
                               "total_cost": sum(get_costs().values()),
                               "costs": get_costs()})

        if path == "/api/trends" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json({"daily": [], "summary": {}})
            period = int(q.get("days", [7])[0])
            # Aggregate execution_log by day
            rows = db.fetchall(
                "SELECT date(created_at) as day, COUNT(*) as actions, "
                "SUM(cost_usd) as cost, SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) as errors, "
                "AVG(duration_sec) as avg_duration "
                "FROM execution_log WHERE created_at >= datetime('now', ?) GROUP BY date(created_at) ORDER BY day",
                (f"-{period} days",))
            # Item velocity — items completed by day
            item_rows = db.fetchall(
                "SELECT date(updated_at) as day, COUNT(*) as completed "
                "FROM items WHERE status='completed' AND updated_at >= datetime('now', ?) "
                "GROUP BY date(updated_at) ORDER BY day",
                (f"-{period} days",))
            item_map = {r["day"]: r["completed"] for r in item_rows}
            daily = []
            for r in rows:
                daily.append({
                    "day": r["day"], "actions": r["actions"],
                    "cost": round(r["cost"] or 0, 4), "errors": r["errors"] or 0,
                    "avg_duration": round(r["avg_duration"] or 0, 1),
                    "items_completed": item_map.get(r["day"], 0),
                })
            # Summary stats
            total_cost = sum(d["cost"] for d in daily)
            total_actions = sum(d["actions"] for d in daily)
            total_errors = sum(d["errors"] for d in daily)
            total_items = sum(d["items_completed"] for d in daily)
            return self._json({
                "daily": daily,
                "period_days": period,
                "summary": {
                    "total_cost": round(total_cost, 4),
                    "total_actions": total_actions,
                    "total_errors": total_errors,
                    "error_rate": round(total_errors / total_actions * 100, 1) if total_actions else 0,
                    "total_items_completed": total_items,
                    "avg_cost_per_day": round(total_cost / max(len(daily), 1), 4),
                    "avg_items_per_day": round(total_items / max(len(daily), 1), 1),
                },
            })

        if path == "/api/notes" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json([])
            notes = db.fetchall("SELECT * FROM memory WHERE namespace='notes' ORDER BY updated_at DESC")
            return self._json(notes)

        if path == "/api/agent-stats" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json({"agents": []})
            rows = db.fetchall(
                "SELECT agent_type, COUNT(*) as steps, "
                "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, "
                "AVG(CASE WHEN status='completed' THEN cost_usd END) as avg_cost, "
                "AVG(CASE WHEN status='completed' THEN duration_sec END) as avg_duration, "
                "SUM(CASE WHEN status='completed' THEN tests_written END) as total_tests, "
                "SUM(CASE WHEN status='completed' THEN tests_passed END) as total_passed "
                "FROM plan_steps GROUP BY agent_type ORDER BY completed DESC"
            )
            agents = [{
                "agent_type": r["agent_type"] or "unknown",
                "total_steps": r["steps"],
                "completed": r["completed"] or 0,
                "avg_cost": round(r["avg_cost"] or 0, 4),
                "avg_duration": round(r["avg_duration"] or 0, 1),
                "total_tests": r["total_tests"] or 0,
                "tests_passed": r["total_passed"] or 0,
            } for r in rows]
            return self._json({"agents": agents})

        if path == "/api/stale-items":
            hours = int(q.get("hours", [2])[0])
            repos = manager.master.get_repos()
            stale = []
            for r in repos:
                db = manager.get_repo_db(r["id"])
                if not db:
                    continue
                items_list = db.fetchall(
                    "SELECT * FROM items WHERE status='in_progress' AND started_at < datetime('now', ?)",
                    (f"-{hours} hours",))
                for it in items_list:
                    it["repo_name"] = r["name"]
                    it["repo_id"] = r["id"]
                    stale.append(it)
            return self._json({"stale_items": stale, "hours_threshold": hours, "count": len(stale)})

        if path == "/api/timeline" and rid:
            db = manager.get_repo_db(rid)
            if not db:
                return self._json([])
            limit = min(int(q.get("limit", [100])[0]), 500)
            rows = db.fetchall(
                "SELECT id, state, action, created_at, cost_usd, duration_sec, error "
                "FROM execution_log ORDER BY created_at DESC LIMIT ?", (limit,))
            return self._json(rows)

        if path == "/api/comparison":
            repos = manager.master.get_repos()
            costs = get_costs()
            comparison = []
            for r in repos:
                try:
                    db = RepoDB(r["db_path"])
                    items_done = db.fetchone("SELECT COUNT(*) c FROM items WHERE status='completed'")["c"]
                    items_total = db.fetchone("SELECT COUNT(*) c FROM items")["c"]
                    errors_row = db.fetchone("SELECT COUNT(*) c FROM mistakes")
                    error_count = errors_row["c"] if errors_row else 0
                    log_row = db.fetchone("SELECT COUNT(*) c FROM execution_log")
                    total_actions = log_row["c"] if log_row else 0
                    cost = costs.get(r["id"], 0)
                    st = db.load_state()
                    err_rate = round(error_count / max(total_actions, 1) * 100, 1)
                    completion = round(items_done / max(items_total, 1) * 100, 1)
                    # Health score: 0-100 based on completion rate (40%), low error rate (40%), activity (20%)
                    health = min(100, round(
                        completion * 0.4 +
                        max(0, 100 - err_rate * 2) * 0.4 +
                        min(100, total_actions * 2) * 0.2
                    ))
                    comparison.append({
                        "id": r["id"], "name": r["name"],
                        "state": st.current_state.value,
                        "cost": round(cost, 4),
                        "items_done": items_done, "items_total": items_total,
                        "cost_per_item": round(cost / max(items_done, 1), 4),
                        "error_count": error_count,
                        "error_rate": err_rate,
                        "total_actions": total_actions,
                        "cycles": st.cycle_count,
                        "health_score": health,
                    })
                except Exception:
                    comparison.append({"id": r["id"], "name": r["name"], "state": "unknown", "cost": 0, "items_done": 0, "items_total": 0, "cost_per_item": 0, "error_count": 0, "error_rate": 0, "total_actions": 0, "cycles": 0, "health_score": 0})
            return self._json({"repos": comparison, "total_cost": round(sum(costs.values()), 4)})

        self._json({"error": "Not found"}, 404)

    def do_POST(self):
        self._req_start = time.time()
        self._req_id = secrets.token_hex(8)
        # Invalidate response cache on any write operation
        with _cache_lock:
            _response_cache.clear()
        # Rate limit check
        if not self._check_rate():
            return

        # Auth check
        if not self._check_auth():
            return

        path = urlparse(self.path).path
        b = self._body()

        if path == "/api/repos/import":
            repos_data = b.get("repos", [])
            if not repos_data:
                return self._json({"error": "repos array required"}, 400)
            imported = 0
            skipped = 0
            for rd in repos_data:
                name = rd.get("name", "").strip()
                rpath = rd.get("path", "").strip()
                if not name or not rpath:
                    skipped += 1
                    continue
                # Sanitize: resolve to absolute, reject paths with ..
                rpath = os.path.abspath(rpath)
                if ".." in os.path.relpath(rpath, os.path.expanduser("~")):
                    log.warning(f"Import repo '{name}' rejected: path outside home dir")
                    skipped += 1
                    continue
                try:
                    os.makedirs(rpath, exist_ok=True)
                    manager.master.add_repo(name, rpath, rd.get("github_url", ""), rd.get("branch", "main"))
                    RepoDB(os.path.join(rpath, ".swarm-agent.db"))
                    imported += 1
                except Exception as e:
                    log.warning(f"Import repo '{name}' failed: {e}")
                    skipped += 1
            return self._json({"ok": True, "imported": imported, "skipped": skipped})

        if path == "/api/repos":
            name = b.get("name","").strip()
            p = b.get("path","").strip()
            if not name or not p: return self._json({"error": "name+path required"}, 400)
            os.makedirs(p, exist_ok=True)
            repo = manager.master.add_repo(name, p, b.get("github_url",""), b.get("branch","main"))
            RepoDB(repo["db_path"])  # initialize
            return self._json({"ok": True, "repo": repo}, 201)

        if path == "/api/repos/delete":
            rid = self._safe_int(b.get("repo_id"))
            if rid is None:
                return self._json({"error": "repo_id required (integer)"}, 400)
            # Stop the repo if running
            if rid in manager.orchestrators:
                manager.stop_repo(rid)
                if rid in manager.threads:
                    manager.threads[rid].join(timeout=5)
                    del manager.threads[rid]
                if rid in manager.orchestrators:
                    manager.orchestrators[rid].cleanup()
                    del manager.orchestrators[rid]
            manager.master.delete_repo(rid)
            return self._json({"ok": True, "deleted": rid})

        if path == "/api/repos/tags":
            rid = self._safe_int(b.get("repo_id"))
            if rid is None:
                return self._json({"error": "repo_id required"}, 400)
            tags = b.get("tags", "")
            if not isinstance(tags, str):
                tags = ",".join(str(t) for t in tags)
            # Sanitize: lowercase, strip, max 20 tags, max 200 chars total
            tag_list = [t.strip().lower() for t in tags.split(",") if t.strip()][:20]
            tags = ",".join(tag_list)[:200]
            manager.master.ex("UPDATE repos SET tags=? WHERE id=?", (tags, rid))
            manager.master.commit()
            _response_cache.clear()
            return self._json({"ok": True, "tags": tags})

        if path == "/api/start":
            rid = b.get("repo_id")
            tag = b.get("tag")
            if rid == "all":
                return self._json(manager.start_all())
            if tag:
                # Start all repos with this tag
                repos = manager.master.get_repos()
                started = []
                for r in repos:
                    if tag in (r.get("tags") or "").split(","):
                        res = manager.start_repo(r["id"])
                        if res.get("ok"):
                            started.append(r["name"])
                return self._json({"ok": True, "started": started, "tag": tag})
            rid_int = self._safe_int(rid)
            if rid_int is None:
                return self._json({"error": "repo_id required (integer or 'all')"}, 400)
            return self._json(manager.start_repo(rid_int))

        if path == "/api/stop":
            rid = b.get("repo_id")
            tag = b.get("tag")
            if rid == "all":
                manager.stop_all()
                return self._json({"ok": True})
            if tag:
                repos = manager.master.get_repos()
                stopped = []
                for r in repos:
                    if tag in (r.get("tags") or "").split(","):
                        manager.stop_repo(r["id"])
                        stopped.append(r["name"])
                return self._json({"ok": True, "stopped": stopped, "tag": tag})
            rid_int = self._safe_int(rid)
            if rid_int is None:
                return self._json({"error": "repo_id required (integer or 'all')"}, 400)
            return self._json(manager.stop_repo(rid_int))

        if path == "/api/pause":
            rid = self._safe_int(b.get("repo_id"))
            if rid is None: return self._json({"error": "repo_id required (integer)"}, 400)
            return self._json(manager.pause_repo(rid))

        if path == "/api/resume":
            rid = self._safe_int(b.get("repo_id"))
            if rid is None: return self._json({"error": "repo_id required (integer)"}, 400)
            return self._json(manager.resume_repo(rid))

        if path == "/api/items":
            rid = self._safe_int(b.get("repo_id"))
            if rid is None: return self._json({"error": "repo_id required (integer)"}, 400)
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            title = (b.get("title") or "").strip()[:200]
            if not title: return self._json({"error": "title required"}, 400)
            desc = (b.get("description") or "")[:5000]
            db.add_item(b.get("type","feature"), title, desc,
                        b.get("priority","medium"), b.get("source","manual"))
            return self._json({"ok": True}, 201)

        if path == "/api/items/bulk":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            items = b.get("items", [])
            if not isinstance(items, list):
                return self._json({"error": "items must be a list"}, 400)
            added, skipped = 0, 0
            for item in items:
                title = (item.get("title") or "").strip()[:200]
                if not title:
                    skipped += 1
                    continue
                desc = (item.get("description") or "")[:5000]
                db.add_item(item.get("type","feature"), title,
                            desc, item.get("priority","medium"),
                            item.get("source","manual"))
                added += 1
            return self._json({"ok": True, "added": added, "skipped": skipped}, 201)

        if path == "/api/items/update":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            item_id = b.get("item_id")
            if not item_id: return self._json({"error": "item_id required"}, 400)
            sets, vals = [], []
            for field in ("status", "priority", "title", "description", "type"):
                if field in b:
                    sets.append(f"{field}=?")
                    vals.append(b[field])
            if not sets: return self._json({"error": "No fields to update"}, 400)
            vals.append(item_id)
            db.ex(f"UPDATE items SET {','.join(sets)} WHERE id=?", vals)
            db.commit()
            return self._json({"ok": True})

        if path == "/api/items/delete":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            item_id = b.get("item_id")
            if not item_id: return self._json({"error": "item_id required"}, 400)
            db.ex("DELETE FROM items WHERE id=?", (item_id,))
            db.commit()
            return self._json({"ok": True})

        if path == "/api/items/clear":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            status = b.get("status")
            if status:
                db.ex("DELETE FROM items WHERE status=?", (status,))
            else:
                db.ex("DELETE FROM items")
            db.commit()
            return self._json({"ok": True})

        if path == "/api/items/dedupe":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            items_list = db.fetchall("SELECT * FROM items WHERE status='pending' ORDER BY created_at ASC")
            seen_titles = {}
            dupes_removed = 0
            with db.transaction():
                for item in items_list:
                    key = item["title"].lower().strip()
                    if key in seen_titles:
                        db.conn.execute("DELETE FROM items WHERE id=?", (item["id"],))
                        dupes_removed += 1
                    else:
                        seen_titles[key] = item["id"]
            return self._json({"ok": True, "duplicates_removed": dupes_removed, "remaining": len(seen_titles)})

        if path == "/api/items/archive":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            days = int(b.get("days", 7))
            archived = db.fetchall(
                "SELECT id FROM items WHERE status='completed' AND completed_at <= datetime('now', ?)",
                (f"-{days} days",))
            if archived:
                with db.transaction():
                    for item in archived:
                        db.conn.execute("UPDATE items SET status='archived' WHERE id=?", (item["id"],))
            return self._json({"ok": True, "archived": len(archived)})

        if path == "/api/items/retry":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            item_id = b.get("item_id")
            # Retry single item or all failed/completed items
            if item_id:
                db.ex("UPDATE items SET status='pending' WHERE id=?", (item_id,))
            else:
                status = b.get("status", "completed")
                db.ex("UPDATE items SET status='pending' WHERE status=?", (status,))
            db.commit()
            return self._json({"ok": True})

        if path == "/api/items/bulk-update":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            item_ids = b.get("item_ids", [])
            action = b.get("action", "")
            value = b.get("value", "")
            if not item_ids or not action:
                return self._json({"error": "item_ids and action required"}, 400)
            updated = 0
            placeholders = ",".join("?" for _ in item_ids)
            if action == "change_status" and value in ("pending", "in_progress", "completed"):
                db.ex(f"UPDATE items SET status=? WHERE id IN ({placeholders})", [value] + list(item_ids))
                updated = len(item_ids)
            elif action == "change_priority" and value in ("low", "medium", "high", "critical"):
                db.ex(f"UPDATE items SET priority=? WHERE id IN ({placeholders})", [value] + list(item_ids))
                updated = len(item_ids)
            elif action == "delete":
                db.ex(f"DELETE FROM items WHERE id IN ({placeholders})", list(item_ids))
                updated = len(item_ids)
            else:
                return self._json({"error": f"Invalid action '{action}' or value '{value}'"}, 400)
            db.commit()
            return self._json({"ok": True, "updated": updated})

        if path == "/api/audio":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            fname = b.get("filename", f"review_{int(time.time())}.webm")
            data = b.get("audio_data", "")
            if data:
                try:
                    decoded = base64.b64decode(data)
                except Exception:
                    return self._json({"error": "Invalid base64 audio data"}, 400)
                fpath = os.path.join(AUDIO_DIR, fname)
                with open(fpath, "wb") as fp:
                    fp.write(decoded)
                db.add_audio(fpath)
            return self._json({"ok": True, "filename": fname}, 201)

        if path == "/api/plan/reorder":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            step_id = b.get("step_id")
            direction = b.get("direction", "up")  # "up" or "down"
            if not step_id: return self._json({"error": "step_id required"}, 400)
            steps = db.all_steps()
            idx = next((i for i, s in enumerate(steps) if s["id"] == step_id), None)
            if idx is None: return self._json({"error": "Step not found"}, 404)
            swap_idx = idx - 1 if direction == "up" else idx + 1
            if swap_idx < 0 or swap_idx >= len(steps):
                return self._json({"error": "Cannot move further"}, 400)
            # Swap step_order values atomically
            with db.transaction():
                db.conn.execute("UPDATE plan_steps SET step_order=? WHERE id=?", (steps[swap_idx]["step_order"], steps[idx]["id"]))
                db.conn.execute("UPDATE plan_steps SET step_order=? WHERE id=?", (steps[idx]["step_order"], steps[swap_idx]["id"]))
            return self._json({"ok": True})

        if path == "/api/notes":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            action = b.get("action", "add")
            if action == "add":
                text = (b.get("text") or "").strip()[:2000]
                if not text: return self._json({"error": "text required"}, 400)
                key = f"note_{int(time.time())}_{secrets.token_hex(4)}"
                db.mem_store("notes", key, text)
                return self._json({"ok": True, "key": key})
            elif action == "delete":
                key = b.get("key")
                if not key: return self._json({"error": "key required"}, 400)
                db.ex("DELETE FROM memory WHERE namespace='notes' AND key=?", (key,))
                db.commit()
                return self._json({"ok": True})
            return self._json({"error": "Invalid action"}, 400)

        if path == "/api/items/import":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            import_items = b.get("items", [])
            if not import_items: return self._json({"error": "No items to import"}, 400)
            added = 0
            for it in import_items:
                title = (it.get("title") or "").strip()[:200]
                if not title: continue
                desc = (it.get("description") or "")[:5000]
                type_ = it.get("type", "feature")
                priority = it.get("priority", "medium")
                source = it.get("source", "manual")
                db.add_item(type_, title, desc, priority, source)
                added += 1
            return self._json({"ok": True, "added": added, "skipped": len(import_items) - added})

        if path == "/api/push":
            rid = b.get("repo_id")
            repos = manager.master.get_repos()
            repo = next((r for r in repos if r["id"] == rid), None)
            if not repo: return self._json({"error": "Not found"}, 404)
            result = runner.git_push(repo["path"], b.get("message","manual push"), repo.get("branch","main"))
            return self._json(result)

        if path == "/api/fix-all":
            repos = manager.master.get_repos()
            all_results = []
            for repo in repos:
                report = scan_repo_health(repo)
                for issue in report["issues"]:
                    if issue["auto_fixable"]:
                        fix_result = fix_repo_issue(repo, issue)
                        fix_result["repo_name"] = repo["name"]
                        all_results.append(fix_result)
            fixed = sum(1 for r in all_results if r["fixed"])
            return self._json({"ok": True, "results": all_results, "fixed_count": fixed,
                               "total_attempted": len(all_results)})

        if path == "/api/fix":
            rid = b.get("repo_id")
            repos = manager.master.get_repos()
            repo = next((r for r in repos if r["id"] == rid), None)
            if not repo:
                return self._json({"error": "Not found"}, 404)
            issue = {"title": b.get("issue_title", ""), "severity": b.get("severity", "issue"),
                     "description": b.get("description", ""), "auto_fixable": True}
            result = fix_repo_issue(repo, issue)
            return self._json(result)

        if path == "/api/rollback":
            rid = b.get("repo_id")
            commit_hash = b.get("commit_hash", "").strip()
            if not rid or not commit_hash:
                return self._json({"error": "repo_id and commit_hash required"}, 400)
            repo = next((r for r in manager.master.get_repos() if r["id"] == rid), None)
            if not repo:
                return self._json({"error": "Repo not found"}, 404)
            if not os.path.isdir(os.path.join(repo["path"], ".git")):
                return self._json({"error": "Not a git repo"}, 400)
            try:
                # Get current HEAD for history
                head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo["path"],
                                      capture_output=True, text=True, timeout=10).stdout.strip()
                # Create a revert commit (safe, doesn't destroy history)
                result = subprocess.run(
                    ["git", "revert", "--no-edit", f"{commit_hash}..HEAD"],
                    cwd=repo["path"], capture_output=True, text=True, timeout=60
                )
                if result.returncode != 0:
                    # Fallback: reset to commit (harder rollback)
                    subprocess.run(["git", "revert", "--abort"], cwd=repo["path"],
                                   capture_output=True, timeout=10)
                    result = subprocess.run(
                        ["git", "checkout", commit_hash, "--", "."],
                        cwd=repo["path"], capture_output=True, text=True, timeout=30
                    )
                    subprocess.run(["git", "commit", "-m", f"Rollback to {commit_hash[:8]}"],
                                   cwd=repo["path"], capture_output=True, text=True, timeout=30)
                # Record in history + reset in_progress/completed items to pending
                db = manager.get_repo_db(rid)
                items_reset = 0
                if db:
                    db.add_history("rollback", f"Rolled back to {commit_hash[:8]}",
                                   commit_hash, state_before=head)
                    # Reset recently completed items back to pending since code was rolled back
                    c = db.ex("UPDATE items SET status='pending', completed_at=NULL "
                              "WHERE status IN ('completed', 'in_progress')")
                    items_reset = c.rowcount
                    db.commit()
                return self._json({"ok": True, "rolled_back_to": commit_hash,
                                   "previous_head": head, "items_reset": items_reset})
            except Exception as e:
                return self._json({"error": f"Rollback failed: {str(e)}"}, 500)

        if path == "/api/memory/seed":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            repo = next((r for r in manager.master.get_repos() if r["id"] == rid), None)
            if not repo: return self._json({"error": "Repo not found"}, 404)
            count = 0
            # Seed from repo info
            db.mem_store("config", "repo_name", repo["name"])
            db.mem_store("config", "repo_path", repo["path"])
            db.mem_store("config", "github_url", repo.get("github_url", ""))
            db.mem_store("config", "branch", repo.get("branch", "main"))
            count += 4
            # Seed from items summary
            items_list = db.fetchall("SELECT type, title, status FROM items")
            if items_list:
                pending = [i["title"] for i in items_list if i["status"] == "pending"]
                done = [i["title"] for i in items_list if i["status"] == "completed"]
                db.mem_store("items", "pending_count", str(len(pending)))
                db.mem_store("items", "completed_count", str(len(done)))
                db.mem_store("items", "pending_titles", json.dumps(pending[:20]))
                count += 3
            # Seed from health scan
            try:
                report = scan_repo_health(repo)
                db.mem_store("health", "score", str(report["health_score"]))
                db.mem_store("health", "issues_count", str(len(report["issues"])))
                count += 2
            except Exception as e:
                log.debug(f"Health scan failed during memory seed: {e}")
            # Seed from state
            st = db.load_state()
            db.mem_store("state", "current_state", st.current_state.value)
            db.mem_store("state", "cycle_count", str(st.cycle_count))
            count += 2
            return self._json({"ok": True, "entries_seeded": count})

        if path == "/api/chat":
            message = b.get("message", "").strip()
            if not message:
                return self._json({"error": "message required"}, 400)

            # Add user message to history
            chat_history.append({"role": "user", "content": message, "time": datetime.now(timezone.utc).isoformat()})

            # Parse intent — simple keyword-based for now (no Claude call needed)
            response = handle_chat_command(message)
            chat_history.append({"role": "assistant", "content": response["message"], "time": datetime.now(timezone.utc).isoformat()})
            return self._json(response)

        if path == "/api/ruflo-config":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db:
                return self._json({"error": "No repo"}, 400)
            config = b.get("config", {})
            for k, v in config.items():
                db.mem_store("ruflo_config", k, v)
            return self._json({"ok": True})

        if path == "/api/ruflo-optimize":
            rid = b.get("repo_id")
            optimize_all = b.get("all", False)
            item_ids = b.get("item_ids")  # selective item optimization
            results = []
            repos_to_opt = manager.master.get_repos() if optimize_all else []
            if rid and not optimize_all:
                repo = next((r for r in manager.master.get_repos() if r["id"] == rid), None)
                if repo:
                    repos_to_opt = [repo]
            for repo in repos_to_opt:
                try:
                    ptype_info = detect_project_type(repo["path"])
                    ptype = ptype_info.get("type", "unknown") if isinstance(ptype_info, dict) else str(ptype_info)
                    db = manager.get_repo_db(repo["id"])
                    if not db:
                        continue
                    # Auto-configure based on project type, size, and complexity
                    fc = ptype_info.get("file_count", 0) if isinstance(ptype_info, dict) else 0
                    stk = ptype_info.get("stack", []) if isinstance(ptype_info, dict) else []
                    sparc = ptype_info.get("sparc_mode", "dev") if isinstance(ptype_info, dict) else "dev"
                    topo = ptype_info.get("topology", "mesh") if isinstance(ptype_info, dict) else "mesh"
                    defaults = {
                        "python":    {"agents": "10", "model_arch": "opus", "model_code": "sonnet", "model_scan": "haiku", "ralph_iters": "50"},
                        "node":      {"agents": "8",  "model_arch": "opus", "model_code": "sonnet", "model_scan": "haiku", "ralph_iters": "40"},
                        "node-react":{"agents": "8",  "model_arch": "opus", "model_code": "sonnet", "model_scan": "haiku", "ralph_iters": "40"},
                        "fullstack": {"agents": "12", "model_arch": "opus", "model_code": "sonnet", "model_scan": "haiku", "ralph_iters": "60"},
                        "rust":      {"agents": "6",  "model_arch": "opus", "model_code": "opus",   "model_scan": "sonnet","ralph_iters": "30"},
                        "static":    {"agents": "4",  "model_arch": "sonnet","model_code": "sonnet","model_scan": "haiku", "ralph_iters": "20"},
                    }
                    config = defaults.get(ptype, {"agents": "8", "model_arch": "opus", "model_code": "sonnet", "model_scan": "haiku", "ralph_iters": "40"})
                    # Scale agents and iterations by codebase size
                    if fc > 200:
                        config["agents"] = str(min(int(config["agents"]) + 4, 15))
                        config["ralph_iters"] = str(int(config["ralph_iters"]) + 20)
                    elif fc > 100:
                        config["agents"] = str(min(int(config["agents"]) + 2, 12))
                        config["ralph_iters"] = str(int(config["ralph_iters"]) + 10)
                    elif fc < 10:
                        config["agents"] = str(max(int(config["agents"]) - 2, 3))
                        config["ralph_iters"] = str(max(int(config["ralph_iters"]) - 10, 10))
                    # TypeScript projects need more thorough scanning
                    if "typescript" in stk:
                        config["model_scan"] = "sonnet"
                    # Large fullstack projects upgrade arch model
                    if ptype == "fullstack" and fc > 100:
                        config["model_arch"] = "opus"
                        config["model_code"] = "opus"
                    config["sparc_mode"] = sparc
                    config["topology"] = topo
                    config["project_type"] = ptype
                    for k, v in config.items():
                        db.mem_store("ruflo_config", k, v)
                    # Selective item optimization: reset chosen items to pending
                    # so the swarm re-plans and re-processes only those items
                    re_queued = []
                    if item_ids and isinstance(item_ids, list):
                        # Validate all item_ids are integers
                        try:
                            validated_ids = [int(i) for i in item_ids]
                        except (ValueError, TypeError):
                            return self._json({"error": "item_ids must be a list of integers"}, 400)
                        if validated_ids:
                            placeholders = ",".join("?" for _ in validated_ids)
                            db.ex(f"UPDATE items SET status='pending', started_at=NULL, completed_at=NULL "
                                  f"WHERE id IN ({placeholders})", tuple(validated_ids))
                            # Remove plan steps linked to those items so they get re-planned
                            db.ex(f"DELETE FROM plan_steps WHERE item_id IN ({placeholders})",
                                  tuple(validated_ids))
                            db.commit()
                            re_queued = validated_ids
                    results.append({"repo": repo["name"], "type": ptype, "config": config,
                                    "re_queued_items": re_queued})
                except Exception as e:
                    results.append({"repo": repo.get("name", "?"), "error": str(e)})
            return self._json({"ok": True, "optimized": len(results), "results": results})

        # ─── Webhook Endpoints ─────────────────────────────────────────────
        if path == "/api/webhooks":
            url = b.get("url", "").strip()
            if not url:
                return self._json({"error": "url required"}, 400)
            parsed_url = urlparse(url)
            if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
                return self._json({"error": "url must be a valid http/https URL"}, 400)
            events = b.get("events", ["*"])
            secret = b.get("secret", "")
            wh = webhook_register(url, events, secret)
            return self._json({"ok": True, "webhook": {"id": wh["id"], "url": wh["url"], "events": wh["events"]}})

        if path == "/api/webhooks/delete":
            wh_id = b.get("id")
            if not wh_id:
                return self._json({"error": "id required"}, 400)
            removed = webhook_remove(int(wh_id))
            return self._json({"ok": True, "removed": removed})

        # ─── Budget ────────────────────────────────────────────────────────────
        if path == "/api/budget":
            global BUDGET_LIMIT
            limit = b.get("limit")
            if limit is not None:
                try:
                    BUDGET_LIMIT = max(0.0, float(limit))
                except (ValueError, TypeError):
                    return self._json({"error": "limit must be a number"}, 400)
            return self._json({"ok": True, "budget_limit": BUDGET_LIMIT,
                               "total_cost": sum(get_costs().values()),
                               "costs": get_costs()})

        # ─── Chat Bridge Endpoints ────────────────────────────────────────────
        if path == "/api/bridge/inbox":
            text = b.get("text", "").strip()
            source = b.get("source", "telegram")
            if not text:
                return self._json({"error": "text required"}, 400)
            bridge_write_inbox(text, source)
            return self._json({"ok": True, "instruction_file": BRIDGE_INSTRUCTION})

        if path == "/api/bridge/outbox":
            text = b.get("text", "").strip()
            source = b.get("source", "claude")
            if not text:
                return self._json({"error": "text required"}, 400)
            bridge_write_outbox(text, source)
            return self._json({"ok": True})

        self._json({"error": "Not found"}, 404)

    def log_message(self, *a):
        pass


# ─── Daily Telegram Digest ────────────────────────────────────────────────────

def generate_daily_digest() -> str:
    """Generate a daily progress summary with mini ASCII charts."""
    master = MasterDB()
    repos = master.get_repos()
    if not repos:
        return "No repos registered."

    lines = ["📊 *SWARM TOWN — Daily Digest*", f"📅 {datetime.now().strftime('%B %d, %Y')}", ""]

    total_items_done = 0
    total_items = 0
    total_steps_done = 0
    total_steps = 0
    total_mistakes = 0
    total_cost = 0.0
    repo_summaries = []

    costs = get_costs()

    for r in repos:
        try:
            db = RepoDB(r["db_path"]) if r.get("db_path") and os.path.exists(r["db_path"]) else None
            if not db:
                continue
            items = db.fetchall("SELECT * FROM items")
            done = [i for i in items if i["status"] == "completed"]
            steps = db.all_steps()
            steps_done = [s for s in steps if s["status"] == "completed"]
            mistakes = db.get_mistakes(1000)
            cost = costs.get(r["id"], 0)

            total_items_done += len(done)
            total_items += len(items)
            total_steps_done += len(steps_done)
            total_steps += len(steps)
            total_mistakes += len(mistakes)
            total_cost += cost

            # Progress bar
            pct = int(len(done) / max(len(items), 1) * 100)
            bar_filled = pct // 10
            bar = "█" * bar_filled + "░" * (10 - bar_filled)

            repo_summaries.append(
                f"*{r['name']}*  `[{bar}]` {pct}%\n"
                f"  Items: {len(done)}/{len(items)} | Steps: {len(steps_done)}/{len(steps)} | "
                f"Mistakes: {len(mistakes)} | Cost: ${cost:.2f}"
            )
        except Exception as e:
            log.debug(f"Digest: skipping repo {r.get('name', '?')}: {e}")
            continue

    # Overall stats
    overall_pct = int(total_items_done / max(total_items, 1) * 100)
    lines.append(f"🎯 *Overall Progress:* {total_items_done}/{total_items} items ({overall_pct}%)")
    lines.append(f"🔧 *Steps:* {total_steps_done}/{total_steps}")
    lines.append(f"💀 *Mistakes:* {total_mistakes}")
    lines.append(f"💰 *Cost:* ${total_cost:.2f}")
    lines.append(f"📦 *Repos:* {len(repos)}")
    lines.append("")

    # Mini ASCII chart of progress per repo
    lines.append("*Per-Repo Breakdown:*")
    lines.append("")
    for s in repo_summaries:
        lines.append(s)

    lines.append("")
    lines.append("_Generated by Swarm Town Orchestrator_")
    return "\n".join(lines)


def digest_scheduler():
    """Background thread that sends daily digest at 9 AM."""
    last_digest_day = None
    digest_hour = max(0, min(23, int(os.environ.get("DIGEST_HOUR", "9"))))
    while True:
        now = datetime.now()
        if now.hour == digest_hour and now.date() != last_digest_day:
            last_digest_day = now.date()
            if TELEGRAM_ENABLED:
                try:
                    from telegram_bot import send_message as tg_send
                    digest = generate_daily_digest()
                    tg_send(digest)
                    log.info("📊 Daily digest sent to Telegram")
                except Exception as e:
                    log.warning(f"Failed to send daily digest: {e}")
            sse_broadcast("digest", {"message": "Daily digest generated"})
            # Persist daily costs to master DB
            try:
                master = MasterDB(MASTER_DB)
                master.save_daily_costs(get_costs())
                log.info("Daily costs persisted to master DB")
            except Exception as e:
                log.warning(f"Failed to persist daily costs: {e}")
        time.sleep(300)  # Check every 5 minutes


def serve():
    s = HTTPServer(("0.0.0.0", API_PORT), API)
    log.info(f"🌐 API on http://localhost:{API_PORT}")
    if PUBLIC_URL:
        log.info(f"🌍 Public URL: {PUBLIC_URL}")
        log.info(f"📱 Telegram Mini App: {PUBLIC_URL}/telegram-app")
    log.info(f"🔑 API Bearer Token: {API_TOKEN}")
    s.serve_forever()


# ─── Entry ────────────────────────────────────────────────────────────────────

def main():
    global TELEGRAM_ENABLED
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--server-only", action="store_true")
    ap.add_argument("--start-all", action="store_true")
    ap.add_argument("--telegram", action="store_true", help="Enable Telegram bot")
    args = ap.parse_args()

    # Start API server
    st = threading.Thread(target=serve, daemon=True)
    st.start()

    # Start daily digest scheduler
    dt = threading.Thread(target=digest_scheduler, daemon=True)
    dt.start()

    # Start watchdog (auto-restarts dead repo threads)
    wt = threading.Thread(target=manager.watchdog, name="watchdog", daemon=True)
    wt.start()

    # Start Telegram bot if requested
    if args.telegram:
        TELEGRAM_ENABLED = True
        try:
            from telegram_bot import bot as tg_bot, send_message as tg_send
            tg_bot.start()
            log.info("📱 Telegram bot enabled")
        except Exception as e:
            log.error(f"Telegram bot failed to start: {e}")

    if args.start_all:
        manager.start_all()
        log.info("🚀 All repos started. Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("\n⏹️ Shutting down...")
        manager.stop_all()
        # Drain SSE clients
        with _sse_lock:
            _sse_clients.clear()
        log.info("Shutdown complete.")


if __name__ == "__main__":
    main()
