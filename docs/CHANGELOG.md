# Changelog

## v3.0.0 — 2026-03-04

### Added
- Full autonomous multi-repo orchestrator with 17-state state machine
- React dashboard with Los Lunas cartoon theme (9 tabs)
- Per-repo SQLite databases with WAL mode
- Parallel orchestration across multiple repos (thread-per-repo)
- Credit exhaustion detection with auto-resume
- Whisper audio transcription pipeline (audio -> transcript -> items)
- Mistake memory system (errors injected into prompts to prevent repeats)
- Ruflo v3.5 integration (215 MCP tools, swarm coordination, vector memory)
- Ralph Wiggum persistent execution loops
- Telegram bot with two-way communication (commands + voice messages)
- Playwright dashboard screenshots via Telegram
- Auto git push after each step
- Global repo selector in dashboard header
- Desktop launcher with cactus icon (Windows/macOS/Linux)
- 100 integration tests across 9 groups (all passing)
- Log rotation (50MB per file, 3 backups)

### Technical
- Python 3.10+ backend with stdlib HTTP server
- React 18 via CDN with Babel standalone for JSX
- Google Fonts: Bangers + Fredoka
- SQLite WAL mode for concurrent access
- Threading with per-connection locks
- Ruflo MCP: 215 tools (agent, swarm, memory, neural, hooks, claims)
- Telegram Bot API with long polling
