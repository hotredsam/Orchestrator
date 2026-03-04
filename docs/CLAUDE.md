# CLAUDE.md — Swarm Orchestrator v3

## What This Is
Autonomous multi-repo coding orchestrator. Combines Ruflo swarm intelligence (10+ agents), Ralph Wiggum persistent loops, Whisper audio transcription, and a flowchart-driven state machine. One click to start — runs unattended across all repos, pushes to GitHub, resumes after credit exhaustion.

## Architecture
```
  Dashboard (localhost:6969)
       ↓ REST API
  Master DB (repo registry)
       ↓
  Per-Repo DB (.swarm-agent.db in each repo)
       ↓
  Repo Orchestrator (one thread per repo, parallel)
       ├→ Ruflo CLI (npx ruflo hive-mind spawn) — 10+ agents
       ├→ Ralph Loop (/ralph-loop via stop hooks) — persistent execution
       ├→ Claude Code (claude -p --dangerously-skip-permissions)
       ├→ Whisper (audio transcription)
       ├→ GitHub (git push after every step)
       └→ grep (fast codebase search)
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

## Commands
```bash
# Full system — starts API + all repo orchestrators
python3 orchestrator.py --start-all

# API server only
python3 orchestrator.py --server-only

# Desktop launcher (double-click)
./launch-swarm.sh          # Mac/Linux
launch-swarm.bat           # Windows
Swarm Orchestrator.command # macOS Finder

# Setup everything
chmod +x setup.sh && ./setup.sh
```

## API (port 6969)
```
GET  /api/repos                    — All repos with state + stats
POST /api/repos                    — Add repo {name, path, github_url, branch}
POST /api/start                    — Start repo {repo_id} or {repo_id: "all"}
POST /api/stop                     — Stop repo {repo_id} or {repo_id: "all"}
GET  /api/items?repo_id=N          — Issues + features
POST /api/items                    — Add {repo_id, type, title, description, priority}
GET  /api/plan?repo_id=N           — Plan steps
GET  /api/logs?repo_id=N           — Execution log
GET  /api/agents?repo_id=N         — Active agents
GET  /api/memory?repo_id=N&q=term  — Memory (with search)
GET  /api/mistakes?repo_id=N       — Mistake memory
GET  /api/audio?repo_id=N          — Audio reviews
POST /api/audio                    — Upload {repo_id, filename, audio_data(b64)}
POST /api/push                     — Git push {repo_id, message}
```

## Environment
```
AGENT_API_PORT=6969     AGENT_REPOS_DIR=~/repos
AGENT_AUDIO_DIR=~/swarm-audio  AGENT_MASTER_DB=~/swarm-master.db
AGENT_POLL=5  AGENT_MIN=10  AGENT_MAX=15  RALPH_ITERS=50
INTAKE_FOLDER=~/Desktop/intake
```
