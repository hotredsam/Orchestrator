# Graph Report - .  (2026-06-07)

## Corpus Check
- 57 files · ~294,444 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1496 nodes · 3186 edges · 70 communities (44 shown, 26 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 250 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Status CLI Commands|Status CLI Commands]]
- [[_COMMUNITY_Ruflo Optimizer Core|Ruflo Optimizer Core]]
- [[_COMMUNITY_Telegram Bot Commands|Telegram Bot Commands]]
- [[_COMMUNITY_MasterDB Operations|MasterDB Operations]]
- [[_COMMUNITY_Orchestrator Core|Orchestrator Core]]
- [[_COMMUNITY_Clean Env Tests|Clean Env Tests]]
- [[_COMMUNITY_Repo Info CLI Commands|Repo Info CLI Commands]]
- [[_COMMUNITY_Chat Command Parser|Chat Command Parser]]
- [[_COMMUNITY_State Machine Tests|State Machine Tests]]
- [[_COMMUNITY_RepoDB CRUD Tests|RepoDB CRUD Tests]]
- [[_COMMUNITY_MasterDB Tests|MasterDB Tests]]
- [[_COMMUNITY_Edge Case Tests|Edge Case Tests]]
- [[_COMMUNITY_Repo Management Commands|Repo Management Commands]]
- [[_COMMUNITY_Ruflo Benchmark Runner|Ruflo Benchmark Runner]]
- [[_COMMUNITY_Circuit Breaker & Ruflo|Circuit Breaker & Ruflo]]
- [[_COMMUNITY_API Handler Unit Tests|API Handler Unit Tests]]
- [[_COMMUNITY_Manager Bridge & Control|Manager Bridge & Control]]
- [[_COMMUNITY_Swarm Dashboard UI|Swarm Dashboard UI]]
- [[_COMMUNITY_API Server Handlers|API Server Handlers]]
- [[_COMMUNITY_Ruflo Config Loader|Ruflo Config Loader]]
- [[_COMMUNITY_Ruflo CLI Verify Tests|Ruflo CLI Verify Tests]]
- [[_COMMUNITY_Mistake & Event Tracking|Mistake & Event Tracking]]
- [[_COMMUNITY_Telegram Bot Tests|Telegram Bot Tests]]
- [[_COMMUNITY_Ruflo Readme Experiment|Ruflo Readme Experiment]]
- [[_COMMUNITY_Repo Health Scanner|Repo Health Scanner]]
- [[_COMMUNITY_RepoOrchestrator & Credits|RepoOrchestrator & Credits]]
- [[_COMMUNITY_Claude CLI Verify Tests|Claude CLI Verify Tests]]
- [[_COMMUNITY_RepoDB SQLite Tests|RepoDB SQLite Tests]]
- [[_COMMUNITY_Parallel Manager Tests|Parallel Manager Tests]]
- [[_COMMUNITY_Optimizer Watchdog|Optimizer Watchdog]]
- [[_COMMUNITY_State Machine Handlers|State Machine Handlers]]
- [[_COMMUNITY_TelegramBot Digest Timer|TelegramBot Digest Timer]]
- [[_COMMUNITY_API Server Endpoint Tests|API Server Endpoint Tests]]
- [[_COMMUNITY_Model Routing Tests|Model Routing Tests]]
- [[_COMMUNITY_Telegram MCP Server|Telegram MCP Server]]
- [[_COMMUNITY_Auto-Fix Repo Issues|Auto-Fix Repo Issues]]
- [[_COMMUNITY_New API Endpoint Tests|New API Endpoint Tests]]
- [[_COMMUNITY_Status & Telegram Tests|Status & Telegram Tests]]
- [[_COMMUNITY_Dashboard Regression Guards|Dashboard Regression Guards]]
- [[_COMMUNITY_Project Type Detection|Project Type Detection]]
- [[_COMMUNITY_Health Check Tests|Health Check Tests]]
- [[_COMMUNITY_API Base & Test Fixtures|API Base & Test Fixtures]]
- [[_COMMUNITY_Budget & Plan Commands|Budget & Plan Commands]]
- [[_COMMUNITY_Runner Command Tests|Runner Command Tests]]
- [[_COMMUNITY_Dashboard Lifecycle Tests|Dashboard Lifecycle Tests]]
- [[_COMMUNITY_Help Command Tests|Help Command Tests]]
- [[_COMMUNITY_Scheduled Claude API Client|Scheduled Claude API Client]]
- [[_COMMUNITY_MasterDB Basic Tests|MasterDB Basic Tests]]
- [[_COMMUNITY_State Change Notifications|State Change Notifications]]
- [[_COMMUNITY_Optimizer Status Display|Optimizer Status Display]]
- [[_COMMUNITY_Dashboard Browser Smoke|Dashboard Browser Smoke]]
- [[_COMMUNITY_Bridge Outbox Polling|Bridge Outbox Polling]]
- [[_COMMUNITY_Test Presence Detection|Test Presence Detection]]
- [[_COMMUNITY_Cactus Icon Generator|Cactus Icon Generator]]
- [[_COMMUNITY_Optimizer Launcher|Optimizer Launcher]]
- [[_COMMUNITY_Item Status Notification|Item Status Notification]]
- [[_COMMUNITY_Setup Script|Setup Script]]
- [[_COMMUNITY_Miniapp Setup|Miniapp Setup]]
- [[_COMMUNITY_Dashboard Screenshots|Dashboard Screenshots]]
- [[_COMMUNITY_Cost Forecast Command|Cost Forecast Command]]
- [[_COMMUNITY_Metrics Command|Metrics Command]]
- [[_COMMUNITY_Velocity Command|Velocity Command]]
- [[_COMMUNITY_Launch Swarm Script|Launch Swarm Script]]
- [[_COMMUNITY_Ngrok Start Script|Ngrok Start Script]]

## God Nodes (most connected - your core abstractions)
1. `handle_message()` - 133 edges
2. `_orch_get()` - 96 edges
3. `RepoOrchestrator` - 79 edges
4. `TestEdgeCasesIntegration` - 71 edges
5. `handle_chat_command()` - 69 edges
6. `RepoDB` - 67 edges
7. `RepoState` - 53 edges
8. `Manager` - 53 edges
9. `TestTelegramBotExtended` - 53 edges
10. `MasterDB` - 52 edges

## Surprising Connections (you probably didn't know these)
- `TestAPIEndpoints` --uses--> `TelegramBot`  [INFERRED]
  tests/test_swarm.py → bot/telegram_bot.py
- `TestAPIHandlerUnit` --uses--> `TelegramBot`  [INFERRED]
  tests/test_swarm.py → bot/telegram_bot.py
- `TestAPIServer` --uses--> `TelegramBot`  [INFERRED]
  tests/test_swarm.py → bot/telegram_bot.py
- `TestChatCommandParser` --uses--> `TelegramBot`  [INFERRED]
  tests/test_swarm.py → bot/telegram_bot.py
- `TestClaudeCodeCLI` --uses--> `TelegramBot`  [INFERRED]
  tests/test_swarm.py → bot/telegram_bot.py

## Import Cycles
- 1-file cycle: `scripts/ruflo_optimizer_core.py -> scripts/ruflo_optimizer_core.py`
- 1-file cycle: `scripts/ruflo_repo_optimizer_watchdog.py -> scripts/ruflo_repo_optimizer_watchdog.py`

## Communities (70 total, 26 thin omitted)

### Community 0 - "Status CLI Commands"
Cohesion: 0.02
Nodes (117): cmd_active(), cmd_activity(), cmd_agent_stats(), cmd_alerts(), cmd_alive(), cmd_api_docs(), cmd_backlog(), cmd_blame() (+109 more)

### Community 1 - "Ruflo Optimizer Core"
Cohesion: 0.08
Nodes (89): Counter, aggregate_claude_runs(), build_blind_profile_prompt(), build_config_report_prompt(), build_grounded_profile_prompt(), build_isolated_env(), build_js_manifest_renderer(), build_js_multifile_sum() (+81 more)

### Community 2 - "Telegram Bot Commands"
Cohesion: 0.05
Nodes (55): _api(), bridge_append_inbox(), _bridge_outbox_write(), cmd_digest(), cmd_notify(), cmd_remind(), cmd_remove_repo(), cmd_schedule() (+47 more)

### Community 3 - "MasterDB Operations"
Cohesion: 0.08
Nodes (15): MasterDB, Single query returning all item counts (total, done, pending, in_progress)., Remove a repo from the registry. Does NOT delete files on disk., Persist current cost totals to daily_costs table (upsert today's row)., Get daily cost history for the last N days., Get health score history for the last N days., Return all scheduled tasks., Create a new scheduled task. Returns the created row as dict. (+7 more)

### Community 4 - "Orchestrator Core"
Cohesion: 0.07
Nodes (42): Enum, build_repo_state_payload(), _claude_watcher(), close_dashboard_session(), dashboard_session_watchdog(), digest_scheduler(), ExclusiveThreadingHTTPServer, _find_listening_pid() (+34 more)

### Community 5 - "Clean Env Tests"
Cohesion: 0.05
Nodes (4): clean_env(), Return os.environ with Claude/MCP session vars stripped.      When the orchestra, Extended Runner tests for ralph, claude, git_push, clean_env, quality gate., TestRunnerMethods

### Community 6 - "Repo Info CLI Commands"
Cohesion: 0.06
Nodes (45): cmd_agents(), cmd_benchmark(), cmd_changelog(), cmd_dedupe(), cmd_deps(), cmd_diff(), cmd_export(), cmd_git_status() (+37 more)

### Community 7 - "Chat Command Parser"
Cohesion: 0.08
Nodes (4): handle_chat_command(), Parse a natural language chat command and execute it., Test handle_chat_command with various inputs., TestChatCommandParser

### Community 8 - "State Machine Tests"
Cohesion: 0.06
Nodes (3): RepoState, Thorough tests for state machine transitions, persistence, and edge cases., TestStateMachineTransitions

### Community 12 - "Repo Management Commands"
Cohesion: 0.05
Nodes (41): cmd_add_item(), cmd_add_note(), cmd_add_repo(), cmd_archive(), cmd_batch(), cmd_cleanup(), cmd_clone(), cmd_done() (+33 more)

### Community 13 - "Ruflo Benchmark Runner"
Cohesion: 0.14
Nodes (28): Popen, apply_variant(), benchmark_repos(), choose_winner(), CommandResult, copy_project(), execute_job(), Job (+20 more)

### Community 14 - "Circuit Breaker & Ruflo"
Cohesion: 0.09
Nodes (12): CircuitBreaker, get_circuit_breaker(), Transcribe audio using Whisper., Full Ruflo setup for a repo — init, memory, hooks., Store a value in Ruflo memory., Normalize Ruflo / Claude Code config into the repo-supported layout., Wait for credits to return, then resume., Per-repo circuit breaker. Opens after consecutive failures, half-opens after coo (+4 more)

### Community 16 - "Manager Bridge & Control"
Cohesion: 0.09
Nodes (13): bridge_write_inbox(), bridge_write_outbox(), main(), Safely close the database, flushing WAL., Context manager for atomic multi-statement operations with deadlock retry., Close the master database connection., Close the per-repo database connection., Server-only startup must not inherit stale in-flight runtime state. (+5 more)

### Community 17 - "Swarm Dashboard UI"
Cohesion: 0.07
Nodes (11): FLOW_EDGES, FLOW_NODES, isRepoBusy(), Dashboard(), ErrorBoundary, useDebounce(), Dashboard(), ErrorBoundary (+3 more)

### Community 18 - "API Server Handlers"
Cohesion: 0.08
Nodes (21): bridge_read_outbox(), _cache_get(), _cache_set(), ensure_dashboard_bundle(), Persist today's health scores (upsert)., Validate Telegram Mini App initData using HMAC-SHA256.      Returns a dict with, Read all outbox entries, optionally filtering after since_ts., Build the browser bundle when the JSX source changes. (+13 more)

### Community 19 - "Ruflo Config Loader"
Cohesion: 0.17
Nodes (26): _bool(), build_settings(), default_runtime_config(), _detect_legacy_json_hints(), _detect_legacy_yaml_hints(), _detect_settings_hints(), _load_json(), load_runtime_config() (+18 more)

### Community 20 - "Ruflo CLI Verify Tests"
Cohesion: 0.06
Nodes (17): claude-flow npm package is accessible., npx ruflo init command is recognized., npx ruflo hive-mind command is recognized., ruflo hive-mind init creates swarm in a repo., ruflo hive-mind status command runs., ruflo orchestrate command has help text., ruflo memory command is recognized., ruflo sparc command is recognized. (+9 more)

### Community 21 - "Mistake & Event Tracking"
Cohesion: 0.16
Nodes (7): Get recent mistakes as context for error recovery., Initialize a swarm with specific topology and agent types., Run Ruflo quality gate hooks — lint, test, security scan., Check if credits exhausted, pause if so., Inject mistake history into prompts for context recovery., Push an event to all connected SSE clients + fire webhooks., sse_broadcast()

### Community 23 - "Ruflo Readme Experiment"
Cohesion: 0.25
Nodes (24): claude_command(), ClaudeCase, CommandResult, main(), make_fixture(), normalize_project(), parse_args(), parse_claude() (+16 more)

### Community 24 - "Repo Health Scanner"
Cohesion: 0.16
Nodes (4): Scan a repo for issues and return a health report., scan_repo_health(), Test scan_repo_health, fix_repo_issue, detect_project_type., TestHealthScanner

### Community 26 - "Claude CLI Verify Tests"
Cohesion: 0.09
Nodes (12): Verify Claude Code is installed and flags work., claude CLI is on PATH., claude --version returns a version string., claude --help shows usage info., claude -p flag is recognized for prompt mode., claude --output-format json flag is recognized., --dangerously-skip-permissions flag exists., claude --model flag is accepted. (+4 more)

### Community 28 - "Parallel Manager Tests"
Cohesion: 0.14
Nodes (3): Manager, Manages parallel orchestrators across multiple repos., TestMultiRepo

### Community 29 - "Optimizer Watchdog"
Cohesion: 0.29
Nodes (16): heartbeat_is_stale(), hidden_kwargs(), kill_tree(), launch_worker(), load_json(), main(), parse_args(), parse_deadline() (+8 more)

### Community 31 - "TelegramBot Digest Timer"
Cohesion: 0.14
Nodes (5): Runs the Telegram bot in a background thread., Schedule the daily digest to fire at *hour*:*minute* local time.          Uses `, Compute seconds until the next target time and arm the timer., Called by the timer — sends the digest then reschedules., TelegramBot

### Community 33 - "Model Routing Tests"
Cohesion: 0.12
Nodes (6): Test model routing and quality gate hooks., Runner.ralph accepts a model parameter., Runner.claude accepts a model parameter., Runner.claude_retry accepts a model parameter., Quality gate with mocked run_cmd returns proper structure., TestModelRouting

### Community 34 - "Telegram MCP Server"
Cohesion: 0.19
Nodes (13): fs, handleMessage(), handleToolCall(), http, path, readline, rl, sendError() (+5 more)

### Community 36 - "New API Endpoint Tests"
Cohesion: 0.13
Nodes (3): Test new API endpoints (health-scan, chat, ruflo-config, fix)., Skip if server is not running., TestAPIEndpoints

### Community 37 - "Status & Telegram Tests"
Cohesion: 0.14
Nodes (4): cmd_status(), Return status of all repos with progress bars., Test Telegram bot message handling, batching, and digest., TestTelegramBot

### Community 38 - "Dashboard Regression Guards"
Cohesion: 0.14
Nodes (3): _check_rate_limit(), Return True if request is allowed, False if rate-limited., TestDashboardRegressionGuards

### Community 41 - "API Base & Test Fixtures"
Cohesion: 0.18
Nodes (5): BaseHTTPRequestHandler, API, master_db(), Swarm Orchestrator v3 — 100 Integration Tests ==================================, temp_db()

### Community 42 - "Budget & Plan Commands"
Cohesion: 0.18
Nodes (11): cmd_budget(), cmd_eta(), cmd_health(), cmd_mistakes(), cmd_plan(), _progress_bar(), Estimated time remaining for all repos with plan steps., Generate a Unicode progress bar. (+3 more)

### Community 44 - "Dashboard Lifecycle Tests"
Cohesion: 0.27
Nodes (7): apiJson(), authedJson(), fs, getToken(), path, sleep(), waitFor()

### Community 46 - "Scheduled Claude API Client"
Cohesion: 0.25
Nodes (8): cmd_schedule_claude(), _fetch_api_token(), _invalidate_token(), _orch_delete(), Fetch the Bearer token from the orchestrator's /api/token endpoint.      Cached, Clear the cached token so the next request re-fetches it., Manage scheduled Claude tasks via orchestrator API., DELETE from orchestrator API with retry + backoff.

### Community 49 - "State Change Notifications"
Cohesion: 0.33
Nodes (4): notify_state_change(), notify_tracker_transition(), Notify on state transition., Send one readable tracker-stage message for a repo milestone.

### Community 50 - "Optimizer Status Display"
Cohesion: 0.47
Nodes (5): load_json(), main(), parse_args(), Namespace, Path

### Community 52 - "Bridge Outbox Polling"
Cohesion: 0.50
Nodes (3): bridge_poll_outbox(), Read new entries from bridge/outbox.jsonl after *last_ts*.      Returns a list o, Watch bridge/outbox.jsonl and forward new entries to Telegram.

### Community 54 - "Cactus Icon Generator"
Cohesion: 0.50
Nodes (3): create_cactus_ico(), Generate a cactus icon for the Swarm Orchestrator desktop shortcut., Create a 32x32 cactus icon as .ico file.

### Community 55 - "Optimizer Launcher"
Cohesion: 0.67
Nodes (3): main(), parse_args(), Namespace

## Knowledge Gaps
- **24 isolated node(s):** `http`, `fs`, `path`, `readline`, `TOOLS` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TelegramBot` connect `TelegramBot Digest Timer` to `Telegram Bot Commands`, `Clean Env Tests`, `Chat Command Parser`, `State Machine Tests`, `RepoDB CRUD Tests`, `MasterDB Tests`, `Edge Case Tests`, `API Handler Unit Tests`, `Ruflo CLI Verify Tests`, `Telegram Bot Tests`, `Repo Health Scanner`, `RepoOrchestrator & Credits`, `Claude CLI Verify Tests`, `RepoDB SQLite Tests`, `Parallel Manager Tests`, `State Machine Handlers`, `API Server Endpoint Tests`, `Model Routing Tests`, `New API Endpoint Tests`, `Status & Telegram Tests`, `Dashboard Regression Guards`, `Health Check Tests`, `Runner Command Tests`, `MasterDB Basic Tests`, `Bridge Outbox Polling`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `RepoOrchestrator` connect `RepoOrchestrator & Credits` to `MasterDB Operations`, `Orchestrator Core`, `Clean Env Tests`, `Chat Command Parser`, `State Machine Tests`, `RepoDB CRUD Tests`, `MasterDB Tests`, `Edge Case Tests`, `Circuit Breaker & Ruflo`, `API Handler Unit Tests`, `Manager Bridge & Control`, `Ruflo CLI Verify Tests`, `Mistake & Event Tracking`, `Telegram Bot Tests`, `Repo Health Scanner`, `Claude CLI Verify Tests`, `RepoDB SQLite Tests`, `Parallel Manager Tests`, `State Machine Handlers`, `API Server Endpoint Tests`, `Model Routing Tests`, `New API Endpoint Tests`, `Status & Telegram Tests`, `Dashboard Regression Guards`, `Health Check Tests`, `API Base & Test Fixtures`, `Runner Command Tests`, `MasterDB Basic Tests`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `Runner` connect `Circuit Breaker & Ruflo` to `Orchestrator Core`, `Clean Env Tests`, `Chat Command Parser`, `State Machine Tests`, `RepoDB CRUD Tests`, `MasterDB Tests`, `Edge Case Tests`, `API Handler Unit Tests`, `Ruflo Config Loader`, `Ruflo CLI Verify Tests`, `Mistake & Event Tracking`, `Telegram Bot Tests`, `Repo Health Scanner`, `RepoOrchestrator & Credits`, `Claude CLI Verify Tests`, `RepoDB SQLite Tests`, `Parallel Manager Tests`, `State Machine Handlers`, `API Server Endpoint Tests`, `Model Routing Tests`, `New API Endpoint Tests`, `Status & Telegram Tests`, `Dashboard Regression Guards`, `Health Check Tests`, `API Base & Test Fixtures`, `Runner Command Tests`, `MasterDB Basic Tests`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `handle_message()` (e.g. with `.test_106_handle_message_ignores_unknown_chat()` and `.test_439_handle_message_ignores_wrong_chat()`) actually correct?**
  _`handle_message()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `RepoOrchestrator` (e.g. with `TestAPIEndpoints` and `TestAPIHandlerUnit`) actually correct?**
  _`RepoOrchestrator` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `TestEdgeCasesIntegration` (e.g. with `TelegramBot` and `API`) actually correct?**
  _`TestEdgeCasesIntegration` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `http`, `fs`, `path` to the rest of the system?**
  _279 weakly-connected nodes found - possible documentation gaps or missing edges._