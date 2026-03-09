# Swarm Town Architecture

## Overview

Swarm Town is an autonomous multi-repo coding orchestrator. It manages parallel AI agent execution across multiple repositories, handling everything from audio code reviews to automated testing and GitHub pushes.

## System Components

```
                          ┌──────────────────┐
                          │   Telegram Bot    │
                          │  (commands/voice) │
                          └────────┬─────────┘
                                   │
┌──────────────┐         ┌─────────▼──────────┐         ┌──────────────┐
│  Dashboard   │◄───────►│   HTTP API Server   │◄───────►│  Master DB   │
│ (React/JSX)  │  :6969  │  (orchestrator.py)  │         │ (SQLite WAL) │
└──────────────┘         └─────────┬──────────┘         └──────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
              │  Repo     │  │  Repo     │  │  Repo     │
              │ Orch #1   │  │ Orch #2   │  │ Orch #N   │
              │ (thread)  │  │ (thread)  │  │ (thread)  │
              └─────┬────┘  └─────┬────┘  └─────┬────┘
                    │              │              │
              ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
              │ Per-Repo  │  │ Per-Repo  │  │ Per-Repo  │
              │ SQLite DB │  │ SQLite DB │  │ SQLite DB │
              └──────────┘  └──────────┘  └──────────┘
```

## Data Flow

### Request Flow
1. User interacts via Dashboard (browser) or Telegram (phone)
2. REST API receives requests on port 6969
3. Manager routes to appropriate RepoOrchestrator thread
4. Orchestrator executes state machine for that repo

### Execution Flow
1. RepoOrchestrator loads state from per-repo SQLite DB
2. State handler runs (e.g., EXECUTE_STEP calls Claude Code)
3. Results logged to execution_log table
4. State transitions saved to repo_state table
5. Telegram notifications sent on meaningful transitions

## State Machine

```
IDLE ──► CHECK_AUDIO ──► TRANSCRIBE_AUDIO ──► PARSE_AUDIO_ITEMS
  │                                                    │
  │            ┌───────────────────────────────────────┘
  │            ▼
  └──► CHECK_REFACTOR ──► DO_REFACTOR
              │                  │
              │ (done)           │
              ▼                  ▼
       CHECK_NEW_ITEMS ◄────────┘
              │
              ▼
       UPDATE_PLAN ──► CHECK_PLAN_COMPLETE ──► EXECUTE_STEP
                              │                      │
                              │ (done)               ▼
                              │               TEST_STEP
                              │                      │
                              │                      ▼
                              │            CHECK_STEPS_LEFT
                              │               │         │
                              │    (more)     │         │ (none)
                              │    ┌──────────┘         ▼
                              │    │            CHECK_MORE_ITEMS
                              │    │               │         │
                              │    ▼               │ (new)   │ (none)
                              │  EXECUTE_STEP      │         ▼
                              │                    │   FINAL_OPTIMIZE
                              │                    │         │
                              │                    ▼         ▼
                              │              UPDATE_PLAN   SCAN_REPO
                              │                              │
                              ▼                              ▼
                            IDLE ◄──────────────────────── IDLE

         Any state ──► CREDITS_EXHAUSTED ──► (probe) ──► Resume
```

### States

| State | Description |
|-------|------------|
| IDLE | Waiting for new items or audio. Polls every 5 seconds. |
| CHECK_AUDIO | Checks for pending audio reviews. |
| TRANSCRIBE_AUDIO | Runs Whisper on audio files. |
| PARSE_AUDIO_ITEMS | Uses Claude to extract issues/features from transcript. |
| CHECK_REFACTOR | Checks if initial refactoring has been done. |
| DO_REFACTOR | Runs Ruflo init, repo-local Ruflo config repair, and Ralph loop for repo structure cleanup. |
| CHECK_NEW_ITEMS | Checks if there are pending items to work on. |
| UPDATE_PLAN | Generates a build plan from pending items using Claude. |
| CHECK_PLAN_COMPLETE | Checks if all plan steps are done. |
| EXECUTE_STEP | Spawns Ruflo swarm + Ralph loop to complete a step. |
| TEST_STEP | Writes and runs tests for the completed step. |
| CHECK_STEPS_LEFT | Checks if more steps remain in the plan. |
| CHECK_MORE_ITEMS | Checks if new items were added during execution. |
| FINAL_OPTIMIZE | Dead code removal, dedup, tree shaking. |
| SCAN_REPO | Final scan: all tests, imports, build verification. |
| CREDITS_EXHAUSTED | Probes every 60s until API credits return. |
| ERROR | Fatal error state. Logged to mistakes table. |

### Tracker Milestones

The Telegram Mini App and Telegram notifications now group the internal states into stable tracker milestones:

1. Intake
2. Plan
3. Build
4. Test
5. Optimize
6. Scan
7. Ready

This milestone map is generated from backend state metadata rather than hardcoded in the frontend, so adding future states does not break the flow tab or the notification copy.

## Database Schema

### Master Database (`~/swarm-master.db`)
- **repos**: Registry of all managed repositories (name, path, db_path, github_url, branch, running)

### Per-Repo Database (`<repo>/.swarm-agent.db`)
- **items**: Features and issues with type, title, description, priority, status
- **plan_steps**: Ordered build steps with agent_type, test results
- **audio_reviews**: Audio files with transcripts and parsed items
- **memory**: Key-value store with namespaces for context
- **mistakes**: Error history with resolutions for learning
- **execution_log**: Full execution audit trail
- **agents**: Running agent registry
- **repo_state**: JSON-serialized state machine state
- **permissions**: Scoped filesystem access per repo

## External Tools

| Tool | Purpose | Command |
|------|---------|---------|
| Claude Code | AI coding agent | `claude -p "..." --dangerously-skip-permissions` |
| Ruflo (claude-flow) | Swarm orchestration, memory, hooks | `npx ruflo ...` |
| Ralph Wiggum | Persistent execution loops | `/ralph-loop "..." --max-iterations N` |
| Whisper | Audio transcription | `whisper audio.webm --model base` |
| grep | Fast codebase search | `grep -rn --include "*.py" pattern .` |
| git | Version control | `git add -A && git commit && git push` |
| Playwright | Dashboard screenshots | Headless Chromium capture |
| Telegram Bot API | Mobile notifications and control | HTTP polling + sendMessage/sendPhoto |

## Threading Model

- **Main thread**: Runs the HTTP API server
- **Per-repo threads**: One daemon thread per active repository
- **Telegram thread**: Long-polling for incoming messages
- **Each thread**: Has its own SQLite connection (check_same_thread=False with locks)

## Configuration

All config via environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| AGENT_API_PORT | 6969 | HTTP API port |
| AGENT_REPOS_DIR | ~/repos | Default repo storage |
| AGENT_AUDIO_DIR | ~/swarm-audio | Audio file storage |
| AGENT_MASTER_DB | ~/swarm-master.db | Master database path |
| AGENT_POLL | 5 | Idle poll interval (seconds) |
| AGENT_MIN | 10 | Minimum agents per repo |
| AGENT_MAX | 15 | Maximum agents per repo |
| RALPH_ITERS | 50 | Max Ralph loop iterations |
| AGENT_MODEL | sonnet | Claude model to use |
| TELEGRAM_BOT_TOKEN | - | Telegram bot API token |
| TELEGRAM_CHAT_ID | - | Telegram chat ID for notifications |

