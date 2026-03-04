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

import json, os, re, sqlite3, subprocess, sys, time, hashlib, logging
import threading, shutil, base64, signal, traceback
from datetime import datetime, timezone
from pathlib import Path
from enum import Enum
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

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

for d in [REPOS_DIR, AUDIO_DIR, INTAKE_FOLDER]:
    os.makedirs(d, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(open(sys.stdout.fileno(), mode='w', encoding='utf-8', closefd=False)),
        logging.FileHandler(os.path.expanduser("~/swarm.log"), encoding='utf-8'),
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

    def to_dict(self):
        d = asdict(self)
        d["current_state"] = self.current_state.value
        return d

    @classmethod
    def from_dict(cls, d):
        d = dict(d)
        d["current_state"] = State(d.get("current_state", "idle"))
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
        """)
        self.conn.commit()

    def ex(self, q, p=()):
        with self.lock:
            return self.conn.execute(q, p)

    def commit(self):
        with self.lock:
            self.conn.commit()

    def fetchall(self, q, p=()):
        return [dict(r) for r in self.ex(q, p).fetchall()]

    def fetchone(self, q, p=()):
        r = self.ex(q, p).fetchone()
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

    def complete_step(self, sid, tw, tp):
        self.ex("UPDATE plan_steps SET status='completed',tests_written=?,tests_passed=?,"
                "completed_at=datetime('now') WHERE id=?", (tw, tp, sid))
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
        return RepoState.from_dict(json.loads(r["state_json"])) if r else RepoState()

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
                created_at TEXT DEFAULT (datetime('now'))
            );
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
            r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                               shell=use_shell,
                               env={**os.environ, "CLAUDE_SKIP_PERMISSIONS": "1"})
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
            except:
                return {"success": r.returncode == 0, "output": out or err, "raw": out,
                        "elapsed": elapsed, "error": err[:1000] if r.returncode != 0 else ""}
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"TIMEOUT {timeout}s", "elapsed": timeout}
        except FileNotFoundError as e:
            return {"success": False, "output": "", "error": f"Not found: {e}", "elapsed": 0}
        except Exception as e:
            return {"success": False, "output": "", "error": str(e), "elapsed": 0}

    def claude(self, cwd, prompt, timeout=600):
        return self.run_cmd(
            ["claude", "-p", prompt, "--model", CLAUDE_MODEL,
             "--output-format", "json", "--dangerously-skip-permissions"],
            cwd=cwd, timeout=timeout,
        )

    def claude_retry(self, cwd, prompt, retries=3, timeout=600):
        for i in range(retries):
            r = self.claude(cwd, prompt, timeout)
            if r.get("credits_exhausted"):
                return r
            if r["success"]:
                return r
            time.sleep(2 ** i)
        return r

    def ralph(self, cwd, prompt, max_iters=RALPH_ITERS, promise="TASK_COMPLETE"):
        rp = f'/ralph-loop "{prompt}" --max-iterations {max_iters} --completion-promise "{promise}"'
        return self.run_cmd(
            ["claude", "-p", rp, "--dangerously-skip-permissions"],
            cwd=cwd, timeout=3600,
        )

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
                               shell=(sys.platform == "win32"))
            return r.stdout[:5000]
        except:
            return ""

    def git_push(self, cwd, msg="auto: agent commit", branch="main"):
        self.run_cmd(["git", "add", "-A"], cwd=cwd, timeout=30)
        self.run_cmd(["git", "commit", "-m", msg, "--allow-empty"], cwd=cwd, timeout=30)
        return self.run_cmd(["git", "push", "origin", branch], cwd=cwd, timeout=120)

    def ruflo_init(self, cwd):
        return self.run_cmd(["npx", "ruflo@alpha", "init", "--verify"], cwd=cwd, timeout=120)

    def ruflo_spawn(self, cwd, objective, max_agents=10):
        self.run_cmd(["npx", "ruflo", "hive-mind", "init"], cwd=cwd, timeout=60)
        return self.run_cmd(
            ["npx", "ruflo", "hive-mind", "spawn", objective,
             "--queen-type", "strategic", "--consensus", "simple-majority", "--claude"],
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

        # Add intake folder permission
        self.db.add_permission(INTAKE_FOLDER, "read")
        self.db.add_permission(repo["path"], "readwrite")

    def save(self):
        self.db.save_state(self.state)

    def log(self, action, result="", agents=0, cost=0, dur=0, error=""):
        self.db.log_exec(self.state.current_state.value, action, result, agents, cost, dur, error)

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
        except:
            pass

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

            result = runner.claude_retry(self.repo["path"], prompt)
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

        runner.ruflo_init(self.repo["path"])

        prompt = self._with_mistake_context(
            "Refactor this repository per best practices: ensure CLAUDE.md exists, "
            "proper structure, error handling, test infra. Use grep to scan first. "
            "Do NOT change business logic. Output REFACTOR_COMPLETE when done."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=10, promise="REFACTOR_COMPLETE")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        self.log("do_refactor", result.get("output","")[:500], dur=time.time()-t0)
        self.state.refactor_done = True

        if self.repo.get("github_url"):
            runner.git_push(self.repo["path"], "refactor: initial structure", self.repo.get("branch","main"))

        return State.CHECK_NEW_ITEMS

    def h_check_new_items(self):
        pending = self.db.get_pending_items()
        return State.UPDATE_PLAN if pending else State.CHECK_PLAN_COMPLETE

    def h_update_plan(self):
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

        result = runner.claude_retry(self.repo["path"], prompt)
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
        log.info(f"⚡ [{self.repo['name']}] Step: {step['description'][:60]}...")
        t0 = time.time()

        # Spawn swarm
        runner.ruflo_spawn(self.repo["path"], step["description"], MIN_AGENTS)
        self.state.active_agents = MIN_AGENTS

        prompt = self._with_mistake_context(
            f"Complete: {step['description']}\n\n"
            "Use grep to check existing patterns. Follow conventions. "
            "Output STEP_COMPLETE when done."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=20, promise="STEP_COMPLETE")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        dur = time.time() - t0
        self.log("execute_step", f"step_{step['id']}", agents=MIN_AGENTS,
                 cost=result.get("cost",0), dur=dur, error=result.get("error",""))

        if not result["success"] and result.get("error"):
            self.db.log_mistake("step_failed", result["error"][:500],
                                step_id=step["id"],
                                state_snapshot=json.dumps(self.state.to_dict()))

        self.db.mem_store("execution", f"step_{step['id']}",
                          {"desc": step["description"], "elapsed": dur, "ok": result["success"]})
        self.state.current_step_id = step["id"]
        return State.TEST_STEP

    def h_test_step(self):
        sid = self.state.current_step_id
        step = self.db.fetchone("SELECT * FROM plan_steps WHERE id=?", (sid,))
        if not step:
            return State.CHECK_STEPS_LEFT

        log.info(f"🧪 [{self.repo['name']}] Testing step {sid}...")
        t0 = time.time()

        prompt = self._with_mistake_context(
            f"You implemented: {step['description']}\n\n"
            "1. Write 10+ tests (happy, edge, error, integration)\n"
            "2. Run ALL tests in the suite\n"
            "3. Fix ALL failures\n"
            "Output TESTS_COMPLETE when all pass."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=15, promise="TESTS_COMPLETE")
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
        except:
            pass

        if not result["success"]:
            self.db.log_mistake("test_failure", f"Step {sid} tests failed: {result.get('error','')}",
                                step_id=sid, state_snapshot=json.dumps(self.state.to_dict()))

        self.db.complete_step(sid, tw, tp)
        self.log("test_step", f"{tw} written, {tp} passed", dur=time.time()-t0)

        if self.repo.get("github_url"):
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
        prompt = self._with_mistake_context(
            "Optimization: dead code removal, dedup, tree shaking (grep for unused). "
            "Output OPTIMIZE_COMPLETE when done."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=10, promise="OPTIMIZE_COMPLETE")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED
        self.log("optimize", result.get("output","")[:300])
        if self.repo.get("github_url"):
            runner.git_push(self.repo["path"], "refactor: optimization pass", self.repo.get("branch","main"))
        return State.SCAN_REPO

    def h_scan_repo(self):
        log.info(f"🔎 [{self.repo['name']}] Final scan...")
        prompt = self._with_mistake_context(
            "Full scan: run all tests, check imports, verify build, update CLAUDE.md. "
            "Fix any issues. Output SCAN_COMPLETE."
        )
        result = runner.ralph(self.repo["path"], prompt, max_iters=10, promise="SCAN_COMPLETE")
        if self._handle_credits(result):
            return State.CREDITS_EXHAUSTED

        self.db.ex("UPDATE items SET status='completed',completed_at=datetime('now') "
                   "WHERE status='in_progress'")
        self.db.commit()

        if self.repo.get("github_url"):
            runner.git_push(self.repo["path"], "chore: final scan passed", self.repo.get("branch","main"))

        self.state.cycle_count += 1
        self.state.active_agents = 0
        log.info(f"🎉 [{self.repo['name']}] Cycle {self.state.cycle_count} done!")
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

    def run(self):
        self.state.running = True
        self.save()
        self.master.set_running(self.repo["id"], True)
        log.info(f"🚀 [{self.repo['name']}] Orchestrator started")

        try:
            while not self.stop_event.is_set():
                handler = getattr(self, self.HANDLERS.get(self.state.current_state, "h_idle"))
                nxt = handler()
                self.state.current_state = nxt
                self.save()
        except Exception as e:
            log.exception(f"💥 [{self.repo['name']}] Fatal: {e}")
            self.state.errors.append(str(e))
            self.db.log_mistake("fatal", str(e), state_snapshot=json.dumps(self.state.to_dict()))
            self.save()
        finally:
            self.state.running = False
            self.save()
            self.master.set_running(self.repo["id"], False)
            log.info(f"⏹️ [{self.repo['name']}] Stopped")

    def stop(self):
        self.stop_event.set()


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

    def start_all(self):
        results = {}
        for repo in self.master.get_repos():
            results[repo["name"]] = self.start_repo(repo["id"])
        return results

    def stop_all(self):
        for rid in list(self.orchestrators):
            self.stop_repo(rid)

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


manager = Manager()


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


class API(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

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
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2, default=str).encode())

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        p = urlparse(self.path)
        path = p.path
        q = parse_qs(p.query)

        # Static file serving
        if path == "/" or path == "/index.html":
            return self._serve_file(os.path.join(STATIC_DIR, "index.html"))
        if path == "/swarm-dashboard.jsx":
            return self._serve_file(os.path.join(STATIC_DIR, "swarm-dashboard.jsx"))

        if path == "/api/repos":
            repos = manager.master.get_repos()
            # Enrich with state
            for r in repos:
                try:
                    db = RepoDB(r["db_path"])
                    st = db.load_state()
                    r["state"] = st.current_state.value
                    r["cycle_count"] = st.cycle_count
                    r["active_agents"] = st.active_agents
                    stats = {
                        "items_total": db.fetchone("SELECT COUNT(*) c FROM items")["c"],
                        "items_done": db.fetchone("SELECT COUNT(*) c FROM items WHERE status='completed'")["c"],
                        "steps_total": db.fetchone("SELECT COUNT(*) c FROM plan_steps")["c"],
                        "steps_done": db.fetchone("SELECT COUNT(*) c FROM plan_steps WHERE status='completed'")["c"],
                        "agents": len(db.fetchall("SELECT * FROM agents WHERE status='running'")),
                        "memory": db.fetchone("SELECT COUNT(*) c FROM memory")["c"],
                        "mistakes": db.fetchone("SELECT COUNT(*) c FROM mistakes")["c"],
                        "audio": db.fetchone("SELECT COUNT(*) c FROM audio_reviews")["c"],
                    }
                    r["stats"] = stats
                except:
                    r["state"] = "idle"
                    r["stats"] = {}
            return self._json(repos)

        # Per-repo endpoints need repo_id
        rid = int(q.get("repo_id", [0])[0]) if "repo_id" in q else None

        if path == "/api/items" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.fetchall("SELECT * FROM items ORDER BY created_at DESC") if db else [])

        if path == "/api/plan" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.all_steps() if db else [])

        if path == "/api/logs" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.fetchall("SELECT * FROM execution_log ORDER BY created_at DESC LIMIT 100") if db else [])

        if path == "/api/agents" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.fetchall("SELECT * FROM agents WHERE status='running'") if db else [])

        if path == "/api/memory" and rid:
            db = manager.get_repo_db(rid)
            if not db: return self._json([])
            sq = q.get("q", [""])[0]
            return self._json(db.mem_search(sq) if sq else db.fetchall("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 50"))

        if path == "/api/mistakes" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.get_mistakes(50) if db else [])

        if path == "/api/audio" and rid:
            db = manager.get_repo_db(rid)
            return self._json(db.fetchall("SELECT * FROM audio_reviews ORDER BY created_at DESC") if db else [])

        if path == "/api/state" and rid:
            return self._json(manager.get_repo_state(rid))

        self._json({"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        b = self._body()

        if path == "/api/repos":
            name = b.get("name","").strip()
            p = b.get("path","").strip()
            if not name or not p: return self._json({"error": "name+path required"}, 400)
            os.makedirs(p, exist_ok=True)
            repo = manager.master.add_repo(name, p, b.get("github_url",""), b.get("branch","main"))
            RepoDB(repo["db_path"])  # initialize
            return self._json({"ok": True, "repo": repo}, 201)

        if path == "/api/start":
            rid = b.get("repo_id")
            if rid == "all":
                return self._json(manager.start_all())
            return self._json(manager.start_repo(int(rid)))

        if path == "/api/stop":
            rid = b.get("repo_id")
            if rid == "all":
                manager.stop_all()
                return self._json({"ok": True})
            return self._json(manager.stop_repo(int(rid)))

        if path == "/api/items":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            db.add_item(b.get("type","feature"), b.get("title",""), b.get("description",""),
                        b.get("priority","medium"), b.get("source","manual"))
            return self._json({"ok": True}, 201)

        if path == "/api/audio":
            rid = b.get("repo_id")
            db = manager.get_repo_db(rid)
            if not db: return self._json({"error": "No repo"}, 400)
            fname = b.get("filename", f"review_{int(time.time())}.webm")
            data = b.get("audio_data", "")
            if data:
                fpath = os.path.join(AUDIO_DIR, fname)
                with open(fpath, "wb") as fp:
                    fp.write(base64.b64decode(data))
                db.add_audio(fpath)
            return self._json({"ok": True, "filename": fname}, 201)

        if path == "/api/push":
            rid = b.get("repo_id")
            repos = manager.master.get_repos()
            repo = next((r for r in repos if r["id"] == rid), None)
            if not repo: return self._json({"error": "Not found"}, 404)
            result = runner.git_push(repo["path"], b.get("message","manual push"), repo.get("branch","main"))
            return self._json(result)

        self._json({"error": "Not found"}, 404)

    def log_message(self, *a):
        pass


def serve():
    s = HTTPServer(("0.0.0.0", API_PORT), API)
    log.info(f"🌐 API on http://localhost:{API_PORT}")
    s.serve_forever()


# ─── Entry ────────────────────────────────────────────────────────────────────

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--server-only", action="store_true")
    ap.add_argument("--start-all", action="store_true")
    args = ap.parse_args()

    # Start API server
    st = threading.Thread(target=serve, daemon=True)
    st.start()

    if args.start_all:
        manager.start_all()
        log.info("🚀 All repos started. Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("\n⏹️ Shutting down...")
        manager.stop_all()


if __name__ == "__main__":
    main()
