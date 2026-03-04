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
- **Response latency metrics** — /api/metrics now includes p50/p95/max latency per endpoint
- **Smart polling** — dashboard only fetches data for the active tab on interval (full refresh on SSE events)
- **Retry items** — POST /api/items/retry to re-queue completed/failed items back to pending (single or bulk)
- **Retry UI** — per-item retry button on completed items + "Retry Done" bulk action in toolbar
- **Metrics tab** — dashboard tab showing API request counts, error rates, latency percentiles (p50/p95/max) per endpoint
- **Copy repo path** — clipboard button on master view repo cards for quick path copying
- **Response cache** — 3-second TTL cache on /api/repos to reduce DB queries from polling
- **Telegram retry command** — `retry [repo]` re-queues completed items from Telegram
- **Telegram metrics command** — `metrics` shows API request counts and latency from Telegram
- **Repo pinning** — pin/unpin repos in master view (localStorage), pinned repos sort to top everywhere
- **Uptime display** — header shows server uptime (from /api/status)
- **Browser notifications** — optional desktop notifications for cycle complete, errors, budget exceeded (localStorage toggle)
- **Cache invalidation** — response cache cleared on all POST requests to ensure fresh data after writes
- **Master view search** — search bar + state filter chips (All/Running/Idle/Pinned) on master view
- **Master quick actions** — Start/Stop/Pause/Resume/Push buttons directly on master view cards
- **Sticky tab bar** — tab navigation bar stays fixed at top when scrolling
- **Item metadata** — bounty board shows source badge (audio/error_detected) and created date
- **Mistake pattern analysis** — `/api/mistakes/analysis` returns error type breakdown, resolution rate, chronic patterns (3+ repeats), top 5 errors
- **Mistake insights UI** — dashboard mistakes tab shows summary cards (total, resolution %, chronic count) + top error types bar chart
- **Source filter** — bounty board items filterable by source (Manual/Audio/Error) alongside status filter. API supports `?source=` param
- **Bulk item operations** — `/api/items/bulk-update` for batch change_priority, change_status, or delete. Dashboard has select/deselect all + bulk action toolbar
- **Item selection** — checkboxes on bounty board items for multi-select, with bulk priority/re-queue/delete actions
- **Trend analysis** — `/api/trends` endpoint with daily cost/actions/items/errors aggregation, configurable period
- **Trends dashboard tab** — 15th tab showing summary cards, daily breakdown table, cost trend bar chart
- **Telegram trends command** — `trends [repo]` shows 7-day performance summary with recent daily breakdown
- **Repo comparison** — `/api/comparison` endpoint with per-repo cost, items, error rate, cycles, cost-per-item
- **Compare dashboard tab** — 16th tab with sortable comparison table, click-to-navigate, color-coded error rates
- **Telegram compare command** — `compare` shows cross-repo performance table
- **Health score** — 0-100 composite score (40% completion, 40% low errors, 20% activity) shown in compare view
- **CSV export** — comparison table downloadable as CSV from Compare tab
- **Dashboard now 16 tabs** — added Trends (15th) and Compare (16th)
- **Recent activity feed** — Town Square home tab shows last 5 actions with timestamps and error indicators
- **Total cost stat card** — Town Square stats row includes total API cost across all repos
- **Error badge on repo cards** — repos with mistakes show error count badge when not running
- **Telegram activity command** — `activity` shows recent actions across all repos
- **Plan step reordering** — `/api/plan/reorder` endpoint + up/down arrows on pending plan steps in dashboard
- **JSON item import** — `/api/items/import` endpoint + collapsible JSON import form on bounty board
- **Item import validation** — title required, 200 char cap, 5000 char description cap, source preserved
- **Agent performance stats** — `/api/agent-stats` endpoint with per-agent-type step counts, avg cost, avg duration, test pass rates
- **Crew tab performance table** — agents tab shows performance breakdown table after the active agent cards
- **Repo notes** — per-repo annotations stored in memory table (namespace='notes'), collapsible Notes section on Town Square with add/delete
- **Telegram notes command** — `notes [repo]` to view, `add note repo: text` to add notes from Telegram
- **Telegram agent-stats command** — `agent-stats [repo]` shows per-agent-type performance from Telegram
- **Keyboard shortcuts expanded** — F=focus search, C=clear all filters, [/]=prev/next tab, Esc=deselect
- **Priority filter** — bounty board items filterable by priority (Critical/High/Medium/Low) alongside status and source filters
- **Transaction safety** — RepoDB.transaction() context manager for atomic multi-statement operations (dedupe, plan reorder)
- **State recovery** — corrupted state JSON in DB auto-recovers to IDLE instead of crashing, with type validation
- **Safe DB close** — WAL checkpoint on close ensures all writes flushed to main database file
- **Cross-repo search** — `/api/search?q=term&scope=all` searches items, logs, mistakes across all repos. Collapsible UI on master view
- **Log level filter** — logs tab has "All / Errors Only / High Cost" filter chips alongside text search
- **Log filtered count** — "Showing X of Y" updates for both text search and level filter
- **Telegram search command** — `search [query]` searches items/logs/mistakes across all repos from Telegram
- **Item auto-archive** — `/api/items/archive` moves completed items older than N days to 'archived' status. "Archive 7d+" button on bounty board
- **Archived status filter** — bounty board status filter includes 'Archived' chip
- **Repo tags** — repos table has `tags` column (comma-separated), tag editor in Settings, tag badges on master view cards
- **Tag filter** — master view has tag filter chips auto-populated from all repos' tags
- **Tags API** — `/api/repos/tags` POST to set repo tags, auto-migration adds column to existing DBs

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
POST /api/repos/tags               — Set repo tags {repo_id, tags: "tag1,tag2"}

# Control
POST /api/start                    — Start repo {repo_id} or {repo_id: "all"}
POST /api/stop                     — Stop repo {repo_id} or {repo_id: "all"}
POST /api/pause                    — Pause repo {repo_id}
POST /api/resume                   — Resume repo {repo_id}
POST /api/push                     — Git push {repo_id, message}

# Items
GET  /api/items?repo_id=N&limit=200&offset=0&status=pending&source=audio — Issues + features (paginated, filterable by status + source)
POST /api/items                    — Add {repo_id, type, title, description, priority}
POST /api/items/bulk               — Add multiple {repo_id, items: [...]}
POST /api/items/update             — Update {repo_id, item_id, status, priority, ...}
POST /api/items/delete             — Delete {repo_id, item_id}
POST /api/items/clear              — Clear items {repo_id, status?} (optional status filter)
POST /api/items/dedupe             — Remove duplicate pending items {repo_id}
POST /api/items/retry              — Re-queue items to pending {repo_id, item_id?} or {repo_id, status}
POST /api/items/bulk-update        — Batch update {repo_id, item_ids[], action, value}
POST /api/items/import             — Import items from JSON {repo_id, items: [...]}
POST /api/items/archive            — Archive old completed items {repo_id, days?: 7}

# Data
GET  /api/plan?repo_id=N           — Plan steps
POST /api/plan/reorder             — Move plan step {repo_id, step_id, direction: up|down}
GET  /api/logs?repo_id=N&limit=200&offset=0 — Execution log (paginated)
GET  /api/agents?repo_id=N         — Active agents
GET  /api/memory?repo_id=N&q=term  — Memory (with search)
GET  /api/mistakes?repo_id=N       — Mistake memory
GET  /api/mistakes/analysis?repo_id=N — Error type breakdown, resolution rate, chronic patterns
GET  /api/audio?repo_id=N          — Audio reviews
POST /api/audio                    — Upload {repo_id, filename, audio_data(b64)}
GET  /api/history?repo_id=N        — Combined DB + git history
GET  /api/notes?repo_id=N          — Repo notes/annotations
POST /api/notes                    — Add/delete note {repo_id, action, text/note_key}
GET  /api/search?q=term&scope=all  — Cross-repo search (items, logs, mistakes)

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
notes [repo]    — View repo notes
add note repo: text — Add a note
agent-stats [repo] — Agent performance stats
search [query]  — Cross-repo search (items, logs, mistakes)
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
