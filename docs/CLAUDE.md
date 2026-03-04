# CLAUDE.md — Swarm Orchestrator v3

## What This Is
Autonomous multi-repo coding orchestrator. Combines Ruflo swarm intelligence (10+ agents), Ralph Wiggum persistent loops, Whisper audio transcription, and a flowchart-driven state machine. One click to start — runs unattended across all repos, pushes to GitHub, resumes after credit exhaustion.

## Architecture
```
  Dashboard (localhost:6969)        Telegram Mini App (11 tabs)
       ↓ REST API + SSE                    ↓
  Master DB (repo registry)         Telegram Bot (30+ commands)
       ↓                                   ↓
  Per-Repo DB (.swarm-agent.db in each repo)
       ↓
  Repo Orchestrator (one thread per repo, parallel)
       ├→ Ruflo CLI (npx ruflo hive-mind spawn) — 10+ agents
       ├→ Ralph Loop (/ralph-loop via stop hooks) — persistent execution
       ├→ Claude Code (claude -p --dangerously-skip-permissions)
       ├→ Whisper (audio transcription)
       ├→ GitHub (git push after every step)
       └→ grep (fast codebase search)

  Watchdog thread (auto-restarts dead orchestrators every 30s)
  Digest scheduler (daily summary at configurable hour)
```

## State Machine (per repo)
```
IDLE → CHECK_AUDIO → TRANSCRIBE_AUDIO → PARSE_AUDIO_ITEMS
  ↓                                            ↓
CHECK_REFACTOR → DO_REFACTOR → CHECK_NEW_ITEMS → UPDATE_PLAN
                                                      ↓
  IDLE ← CHECK_PLAN_COMPLETE → EXECUTE_STEP → TEST_STEP
                                                   ↓
  CHECK_MORE_ITEMS ← CHECK_STEPS_LEFT → (loop back to EXECUTE)
       ↓
  FINAL_OPTIMIZE → SCAN_REPO → IDLE

  Any state → CREDITS_EXHAUSTED (auto-resume when credits return)
  Any running state → PAUSED (via pause/resume API)
```

## One Database Per Repo
Each repo gets `.swarm-agent.db` inside its folder. Tables:
- items (type=feature|issue, priority, status, source=manual|audio|error_detected)
- plan_steps (ordered, with agent_type assignment)
- audio_reviews (filename, transcript, parsed_items, status)
- memory (namespace/key/value — AgentDB-style)
- mistakes (ruflo error memory — injected into prompts)
- execution_log, agents, repo_state, permissions

## Key Behaviors
- **No user input needed** — `--dangerously-skip-permissions` + `--start-all`
- **Credit exhaustion** — detects rate limit / 429 errors, pauses, polls every 60s, resumes from exact state
- **Mistake memory** — errors logged to `mistakes` table, last 5 injected into every prompt to avoid repeats
- **Audio flow** — audio in DB → Whisper transcribe → Claude parses into issues/features → added to items table → planned + executed
- **Intake folder** — drop audio files in `~/Desktop/intake`, auto-picked up per repo
- **Scoped permissions** — each repo folder gets readwrite, intake folder gets read, configurable via `permissions` table
- **Thread watchdog** — background thread checks every 30s, auto-restarts dead orchestrator threads with Telegram + SSE notification
- **Stuck detection** — watchdog detects repos stuck in same state for 30min, auto-restarts them
- **Pause/Resume** — individual repos can be paused (thread stays alive) and resumed via API or Telegram
- **Graceful shutdown** — joins threads (5s timeout), closes DBs, drains SSE clients
- **DB retry** — SQLite operations retry 3x on "database locked" errors with exponential backoff
- **Rate limiting** — 120 requests/min per IP (configurable), 30/min for chat/bridge, exempt paths for static/SSE
- **Dark mode** — dashboard supports dark mode with localStorage persistence (D key or header toggle)
- **Toast notifications** — dashboard shows success/error/warning toasts for all API actions
- **Duplicate detection** — `/api/items/dedupe` removes duplicate pending items by title
- **Pagination** — items and logs endpoints support `?limit=N&offset=N&status=X` params
- **Circuit breaker** — per-repo circuit breaker pattern (opens after 5 consecutive failures, cooldown 120s, half-open probe)
- **Exponential backoff with jitter** — claude_retry uses 2^i + random(0,1) delay, capped at 30s
- **Per-step cost tracking** — plan_steps table stores cost_usd and duration_sec, displayed in dashboard plan view
- **Item management UI** — dashboard has dedupe, clear done, clear all buttons + per-item delete + status filter chips
- **DB migrations** — RepoDB auto-migrates older databases to add new columns
- **Structured JSON logging** — machine-parseable JSON log at `~/swarm-json.log` (20MB rotate, 5 backups) alongside human-readable `~/swarm.log`
- **Webhooks** — register external HTTP callbacks for SSE events (state_change, log, error_event, watchdog, cycle_complete). HMAC-SHA256 signing with optional secret
- **Cycle completion events** — SSE + webhook broadcast on cycle_complete with full metrics (items done, tests, cost)
- **Quality gate safety** — optimization stashes broken changes instead of pushing if quality gate fails
- **Dynamic agent scaling** — h_final_optimize scales agent count based on codebase file count (2-8 agents)
- **Windows launcher hardened** — launch-swarm.bat falls back to PowerShell if curl unavailable
- **Priority auto-escalation** — items pending for 2+ hours auto-escalate (low→medium, medium→high)
- **Log search** — dashboard logs tab has search/filter bar for finding specific actions
- **Memory search** — dashboard memory tab has inline search for filtering entries
- **Budget limits** — configurable cost budget via `AGENT_BUDGET_LIMIT` env var or API. Auto-pauses repos when exceeded
- **Budget UI** — dashboard Settings has budget limit input with real-time enforcement
- **Master view cost** — repo cards in master view show per-repo cost alongside items/steps/cycles
- **Input validation** — title required on item add/bulk, budget limit validated as non-negative number, base64 audio validated
- **Bridge inbox trim** — inbox.jsonl auto-trimmed to BRIDGE_MAX_LINES (default 200) to prevent unbounded growth
- **Digest hour clamp** — DIGEST_HOUR env var clamped to 0-23 range
- **Request body limit** — 50MB max body size on POST requests to prevent memory exhaustion
- **Safe int parsing** — all repo_id parameters validated with safe int conversion, returns 400 on bad input
- **Path sanitization** — repo import rejects paths outside home directory
- **Field length limits** — item titles capped at 200 chars, descriptions at 5000 chars
- **Loading skeleton** — dashboard shows loading state on initial connect before data arrives
- **Disabled async buttons** — scan/fix buttons disable during operation to prevent double-click
- **Log export** — download logs as JSON from the logs tab
- **Filtered count** — logs tab shows "Showing X of Y" when search filter is active

## Commands
```bash
# Full system — starts API + all repo orchestrators
python3 orchestrator.py --start-all

# With Telegram bot
python3 orchestrator.py --start-all --telegram

# API server only
python3 orchestrator.py --server-only

# Desktop launcher (double-click)
./launch-swarm.sh          # Mac/Linux
launch-swarm.bat           # Windows
Swarm Orchestrator.command # macOS Finder

# Setup everything
chmod +x setup.sh && ./setup.sh

# Register Mini App with BotFather
python scripts/setup-miniapp.py <PUBLIC_URL>
```

## API (port 6969)
```
# Repos
GET  /api/repos?q=name             — All repos with state + stats (optional name filter)
POST /api/repos                    — Add repo {name, path, github_url, branch}
POST /api/repos/delete             — Remove repo {repo_id}
GET  /api/repos/export             — Export all repos as JSON backup
POST /api/repos/import             — Import repos from JSON {repos: [...]}

# Control
POST /api/start                    — Start repo {repo_id} or {repo_id: "all"}
POST /api/stop                     — Stop repo {repo_id} or {repo_id: "all"}
POST /api/pause                    — Pause repo {repo_id}
POST /api/resume                   — Resume repo {repo_id}
POST /api/push                     — Git push {repo_id, message}

# Items
GET  /api/items?repo_id=N&limit=200&offset=0&status=pending — Issues + features (paginated, filterable)
POST /api/items                    — Add {repo_id, type, title, description, priority}
POST /api/items/bulk               — Add multiple {repo_id, items: [...]}
POST /api/items/update             — Update {repo_id, item_id, status, priority, ...}
POST /api/items/delete             — Delete {repo_id, item_id}
POST /api/items/clear              — Clear items {repo_id, status?} (optional status filter)
POST /api/items/dedupe             — Remove duplicate pending items {repo_id}

# Data
GET  /api/plan?repo_id=N           — Plan steps
GET  /api/logs?repo_id=N&limit=200&offset=0 — Execution log (paginated)
GET  /api/agents?repo_id=N         — Active agents
GET  /api/memory?repo_id=N&q=term  — Memory (with search)
GET  /api/mistakes?repo_id=N       — Mistake memory
GET  /api/audio?repo_id=N          — Audio reviews
POST /api/audio                    — Upload {repo_id, filename, audio_data(b64)}
GET  /api/history?repo_id=N        — Combined DB + git history

# System
GET  /api/status                   — Uptime, repo counts, SSE clients, total cost
GET  /api/metrics                  — Request counts, errors, rate limits, top endpoints
GET  /api/costs                    — Per-repo API costs and total
GET  /api/events                   — SSE stream (state_change, log, watchdog, error_event)
GET  /api/token                    — Current API bearer token
GET  /api/digest                   — Generate daily digest on demand
GET  /api/health-scan              — Scan all repos for health issues
POST /api/fix-all                  — Auto-fix all detected health issues
POST /api/fix                      — Fix specific issue {repo_id, issue_title, ...}
POST /api/rollback                 — Git rollback {repo_id, commit_hash}

# Webhooks
GET  /api/webhooks                 — List registered webhooks
POST /api/webhooks                 — Register webhook {url, events?: ["*"], secret?}
POST /api/webhooks/delete          — Remove webhook {id}

# Budget
GET  /api/budget                   — Current budget limit and cost totals
POST /api/budget                   — Set budget limit {limit: float} (0 = unlimited)
```

## Telegram Bot Commands
```
# Control
status          — All repos with Unicode progress bars and uptime
start all       — Launch all repos
stop all        — Stop everything
start [repo]    — Start specific repo
stop [repo]     — Stop specific repo
pause [repo]    — Pause (thread stays alive)
resume [repo]   — Resume paused repo

# Items & Plans
items [repo]    — List items with status, progress bar
plan [repo]     — Show plan steps with progress
add feature repo: title - desc
add issue repo: title - desc

# Inspection
logs [repo]     — Last 5 log entries
mistakes [repo] — Last 5 mistakes
memory [repo]   — Last 5 memory entries

# Management
repos / list    — List all registered repos
add repo name: /path — Register new repo
remove [repo]   — Remove repo (keeps files)
push [repo]     — Git push
screenshot      — Dashboard screenshot
digest          — Daily digest summary
costs           — Per-repo API costs
health          — Health scan all repos
app             — Open Mini App link
help            — Show all commands
```

## Telegram Mini App (11 tabs)
- **Home** — Repo cards with Start/Stop/Pause/Resume/Push/Remove, Start All/Stop All, pull-to-refresh
- **Add** — Add feature/issue form + collapsible "Register New Repo" form
- **Items** — Items list with status filter and delete
- **Flow** — State machine flow map with current position
- **Plan** — Plan steps with progress bar and agent badges
- **Logs** — Execution logs with color-coded actions
- **Memory** — Agent memory entries with search
- **Errors** — Mistake memory with error types and fixes
- **Health** — Health scanner with auto-fix
- **Chat** — Natural language command interface
- **Stats** — Dashboard stats with per-repo breakdown and costs

Features: Dark mode (localStorage), SSE real-time updates, toast notifications, haptic feedback, scrollable tab bar

## Environment
```
AGENT_API_PORT=6969     AGENT_REPOS_DIR=~/repos
AGENT_AUDIO_DIR=~/swarm-audio  AGENT_MASTER_DB=~/swarm-master.db
AGENT_POLL=5  AGENT_MIN=10  AGENT_MAX=15  RALPH_ITERS=50
INTAKE_FOLDER=~/Desktop/intake
RATE_LIMIT_RPM=120     DIGEST_HOUR=9
AGENT_BUDGET_LIMIT=0   # Max API cost per repo (0 = unlimited)
PUBLIC_URL=             # ngrok or tunnel URL for Telegram Mini App
TELEGRAM_BOT_TOKEN=     # From BotFather
TELEGRAM_CHAT_ID=       # Your chat ID
```
