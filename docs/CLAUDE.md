# CLAUDE.md — Swarm Orchestrator v3

## What This Is
Autonomous multi-repo coding orchestrator. Combines Ruflo swarm intelligence (10+ agents), Ralph Wiggum persistent loops, Whisper audio transcription, and a flowchart-driven state machine. One click to start — runs unattended across all repos, pushes to GitHub, resumes after credit exhaustion.

## Architecture
```
  Dashboard (localhost:6969)        Telegram Mini App (11 tabs)
       ↓ REST API + SSE + gzip            ↓
  Master DB (repo registry)         Telegram Bot (50+ commands)
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
- **Command palette** — Ctrl+K opens command palette for quick navigation, actions, search. Chip suggestions for common commands
- **Toast history** — notification bell in header shows past 50 toasts with timestamps, color-coded by type, clearable
- **Notification badge** — bell icon shows unread count badge
- **Telegram tags command** — `tags` to list all, `tags repo` to view, `tags repo: tag1,tag2` to set
- **Batch start/stop by tag** — `/api/start` and `/api/stop` accept `{tag: "tagname"}` to operate on all repos with that tag
- **Stale item detection** — `/api/stale-items?hours=2` finds items stuck in_progress across all repos, warning banner on Town Square
- **Execution timeline** — `/api/timeline?repo_id=N` returns state transition history for debugging
- **Circuit breaker visibility** — `/api/circuit-breakers` endpoint exposes per-repo circuit breaker state. Health tab shows open/half-open breakers with failure counts
- **Mobile responsive** — media queries for 700px/480px/360px breakpoints. Touch-friendly 36px min button height, compact header on small screens
- **Telegram stale command** — `stale` shows items stuck in_progress for 2+ hours from Telegram
- **Cost breakdown chart** — Trends tab shows per-repo cost breakdown with colored bars and percentages
- **Telegram circuit-breaker command** — `breakers` shows open/half-open circuit breakers across all repos
- **N+1 query optimization** — /api/repos batches 8 COUNT queries into 2 per repo using conditional SUM aggregation
- **Webhook URL validation** — rejects non-http/https URLs and missing netloc on webhook registration
- **Rate limit path normalization** — trailing slashes stripped before rate limit check
- **Repo snapshot API** — `/api/repos/snapshot?repo_id=N&include=items,plan,logs,mistakes,memory` for full data export
- **Request trace IDs** — X-Request-ID response header on all API responses for debugging/correlation
- **Live log tail** — toggle button on logs tab auto-scrolls to latest entries as they arrive
- **Telegram retry with backoff** — _orch_get retries 2x, _orch_post retries 1x with exponential backoff (0.5s, 1s)
- **Message buffer overflow cap** — Telegram message buffer capped at 100 entries with forced flush on overflow
- **Telegram 429 handling** — adaptive retry_after backoff when Telegram rate-limits the bot
- **Sticky repo bar** — compact repo selector + state/stats bar appears when scrolled past header
- **Daily cost persistence** — daily_costs table in MasterDB with UPSERT, persisted at each digest cycle
- **Cost history API** — `/api/costs/history?days=30` returns daily cost totals per repo for historical tracking
- **Slow query logging** — RepoDB logs queries taking >200ms with table path for performance tuning
- **Telegram snapshot command** — `snapshot [repo]` shows item/step counts and pending items
- **Telegram cost-history command** — `cost-history` shows 7-day daily costs with ASCII bar chart
- **30-day cost history chart** — Trends tab sparkline chart from persisted daily cost data
- **Item quick actions** — one-click complete button on pending items, reordered action buttons (complete/retry/delete)
- **Git rollback item reset** — rollback now resets completed/in_progress items to pending
- **Tag count limits** — repo tags capped at 20 tags max (previously unlimited, only had 200 char limit)
- **DB indexes** — SQLite indexes on items(status), items(created_at), plan_steps(status), execution_log(created_at), memory(namespace)
- **Circuit breaker home alert** — Town Square shows alert card when any breakers are tripped
- **Detailed health scores** — `/api/health/detailed` computes 0-100 score per repo with A-F letter grades
- **Health scores overview** — Health tab shows all repo grades with color-coded badges and average score
- **Telegram health scores command** — `grades` shows A-F health scores for all repos with issues
- **Compact item view** — toggle between full poster cards and one-line compact rows on Bounty Board
- **Configurable refresh interval** — dashboard polling interval adjustable (1s/3s/5s/10s/30s) via Settings tab, persisted in localStorage
- **API token rotation** — POST /api/token/rotate generates new bearer token. Dashboard auto-updates session, Telegram `/rotate-token` command
- **Dynamic API URL** — dashboard detects origin automatically, supports `window.__SWARM_API_URL__` override for custom deployments
- **SSE connection indicator** — green/red dot in header showing live update connection status with pulse animation on disconnect
- **Silent exception logging** — replaced bare except-pass blocks with logged warnings for better debugging
- **Safe GET parameter parsing** — try/except around repo_id int conversion in GET handler prevents ValueError crashes
- **Audio upload size limit** — 50MB max on base64 audio uploads (returns 413 on oversized files)
- **Bulk item ID validation** — /api/items/bulk-update validates item_ids as list of integers before SQL execution
- **Reorder timestamp fix** — item/step reorder uses microsecond precision timestamps to prevent duplicates
- **Input length limits** — webhook URL capped at 2048 chars, chat messages at 2000, repo names at 100
- **Health grades in master view** — each repo card shows A-F health grade badge from healthScores data
- **Flow tab activity timeline** — vertical timeline showing last 5 actions with color-coded dots and timestamps
- **API documentation endpoint** — GET /api/docs returns list of all 40+ endpoints with methods and descriptions (auth-exempt)
- **Recent errors API** — GET /api/errors/recent aggregates mistakes across all repos with repo attribution
- **Recent errors card** — Town Square home tab shows last 5 errors with repo name, type, and timestamp
- **Telegram uptime command** — `uptime` shows server uptime, version, running repo count
- **Telegram rotate-token command** — `rotate-token` rotates API bearer token from Telegram
- **RepoDB context manager** — `with RepoDB(path) as db:` auto-closes connection, flushing WAL
- **DB connection cache** — Manager caches RepoDB instances per path, eliminating ~40 leaked connections per request cycle
- **Graceful SIGTERM shutdown** — signal handler for SIGTERM/SIGBREAK triggers clean shutdown (Docker/systemd/Windows)
- **MasterDB close** — master database explicitly closed during shutdown
- **Watchdog Telegram notify** — stuck-repo restarts now send Telegram notification (dead-thread path already did)
- **Mobile responsive grid** — repo grids collapse to single column below 640px viewport width
- **Dark mode shadow fix** — Card and Button box-shadow uses proper dark shadow color instead of hardcoded #3D2B1F
- **Batch repo API** — POST /api/repos/batch for bulk start/stop/pause/resume/push on multiple repos by ID
- **Git clone API** — POST /api/repos/clone: git clone + auto-register in one call
- **Clone from Git UI** — "Clone from Git" button on home tab next to "Add to Town"
- **Flow tab repo selector** — dropdown in flow tab header for quick repo switching without returning to master view
- **Batch select in master view** — checkboxes on master view cards with batch action bar (start/stop/pause/resume)
- **Gzip compression** — JSON responses > 1KB auto-compressed with gzip when client supports Accept-Encoding
- **Content-Length header** — all JSON responses now include Content-Length for better HTTP compliance
- **Request log** — ring buffer of last 200 requests (excludes SSE). GET /api/request-log with status filter
- **Request log viewer** — expandable section on metrics tab showing recent requests with status and latency
- **Telegram batch command** — `batch [action] [tag:X | repo1,repo2 | all]` for bulk operations from Telegram
- **Telegram ETA command** — `eta` shows estimated time/cost remaining per repo based on average step duration
- **setStatusFilter bug fix** — keyboard shortcut 'C' (clear all) no longer references undefined function

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
POST /api/repos/batch              — Batch action {repo_ids: [], action: start|stop|pause|resume|push}
POST /api/repos/clone              — Git clone + register {url, name?, branch?}

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
GET  /api/stale-items?hours=2      — Items stuck in_progress across all repos
GET  /api/circuit-breakers         — Per-repo circuit breaker states
GET  /api/timeline?repo_id=N       — State transition history for debugging
GET  /api/errors/recent?limit=20   — Recent mistakes across all repos
POST /api/items/reorder            — Reorder items {repo_id, order: [id1, id2, ...]}

# System
GET  /api/status                   — Uptime, repo counts, SSE clients, total cost
GET  /api/metrics                  — Request counts, errors, rate limits, top endpoints
GET  /api/costs                    — Per-repo API costs and total
GET  /api/events                   — SSE stream (state_change, log, watchdog, error_event)
GET  /api/token                    — Current API bearer token
POST /api/token/rotate             — Rotate API bearer token
GET  /api/docs                     — List all API endpoints (auth-exempt)
GET  /api/request-log?limit=50&status=error — Recent request log ring buffer
GET  /api/init                     — Batch init data (repos, costs, status in one call)
GET  /api/comparison               — Cross-repo comparison matrix
GET  /api/costs/history?days=30    — Daily cost totals per repo
GET  /api/health/detailed          — Health scores (0-100) with A-F grades
GET  /api/repos/snapshot?repo_id=N — Full repo data export
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
tags / tags repo / tags repo: t1,t2 — View/set repo tags
stale           — Show items stuck in_progress for 2+ hours
breakers        — Circuit breaker states across all repos
snapshot [repo] — Quick data snapshot with pending items
cost-history    — Daily cost totals for last 7 days with chart
grades          — Health scores (A-F) for all repos
summary         — Quick one-message status overview
uptime          — Server uptime, version, running repos
rotate-token    — Rotate API bearer token
eta             — Estimated time/cost remaining per repo
errors          — Recent errors across all repos
docs            — List all API endpoints
batch [action] [target] — Batch start/stop/push by tag or names
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
