# Ruflo / Claude Config Repair Report

## Root Cause

This repository did not contain the upstream Ruflo / Claude Flow CLI source that generates project config. The tracked code only called external `npx ruflo ...` commands, while the actual generated Claude/Ruflo files lived in untracked `.claude/` and `.claude-flow/` directories.

That caused four distinct forms of drift:

1. The generated `.claude/settings.json` mixed Claude Code-native settings with a large custom `claudeFlow` block that Claude Code itself does not consume.
2. Helper commands were brittle:
   - relative helper paths such as `node .claude/helpers/...`
   - timeout values written like milliseconds even though Claude Code expects seconds
   - helper code reading env vars instead of Claude Code's stdin JSON hook payloads
   - CommonJS `.js` helper files that break in `"type": "module"` repos
3. Runtime config was split between stale `.claude-flow/config.yaml`, legacy references to `claude-flow.config.json`, and dead write-only fields that this repo never consumed.
4. There was no checked-in source of truth or doctor command in this repo, so health checks could say "Ruflo initialized" while the generated config was still invalid or misleading.

## What Was Authoritative Vs Stale

Authoritative now:

- `ruflo_config.py`
  - current repo-owned source of truth for generated Claude settings and runtime config
  - migration/normalization logic for older formats
  - validation logic used by the doctor command and health scan
- `.claude/settings.json`
  - Claude Code-native settings only
- `.claude-flow/config.json`
  - repo runtime config only
- generated helper files under `.claude/helpers/`
  - only the helper files actually referenced by `.claude/settings.json`

Stale or intentionally dropped:

- custom `.claude/settings.json` `claudeFlow` block
- legacy `.claude-flow/config.yaml`
- legacy `claude-flow.config.json`
- dead legacy keys that this repo did not consume at runtime:
  - `swarm`
  - `modelPreferences`
  - `neural`
  - `daemon`
  - `learning`
  - `adr`
  - `ddd`
  - `security`
  - `mcp`
  - `attribution`

Important reconciliation note:

- Current official Claude Code hook docs now list `TaskCompleted`, `TeammateIdle`, and `SubagentStart` as real hook events.
- This repo therefore no longer treats those names as inherently invalid.
- Instead, the repo now emits them only when `--agent-teams` is enabled, and otherwise keeps the default config smaller.

## Chosen Architecture

This repo now uses a strict split:

1. `.claude/settings.json`
   - Claude Code hooks
   - Claude Code status line
   - Claude Code permissions
   - no custom runtime blob

2. `.claude-flow/config.json`
   - repo runtime settings consumed by the generated helper scripts
   - current schema:
     - `schemaVersion`
     - `profile`
     - `features.hooks`
     - `features.statusLine`
     - `features.autoMemory`
     - `features.agentTeams`
     - `memory.importOnSessionStart`
     - `memory.syncOnStop`
     - `memory.storePath`

3. `.claude/helpers/`
   - only generated when referenced
   - current managed helpers:
     - `hook-handler.cjs`
     - `statusline.cjs`
     - `auto-memory-hook.mjs` when full profile / auto-memory is enabled

This is intentionally smaller than the previous generated config. The repo now prefers a smaller correct config over a larger speculative one.

## Compatibility And Migration

Read compatibility:

1. `.claude-flow/config.json`
2. `claude-flow.config.json`
3. `.claude-flow/config.yaml`
4. stale `.claude/settings.json` `claudeFlow` block as migration hints

Write behavior:

- only `.claude-flow/config.json` is written going forward
- generated `.claude/settings.json` no longer contains `claudeFlow`
- helper files are rewritten only for the current supported layout

Upgrade command:

```bash
python ruflo_config.py normalize --project . --profile minimal
python ruflo_config.py normalize --project . --profile full
python ruflo_config.py normalize --project . --profile full --agent-teams
```

Validation command:

```bash
python ruflo_config.py doctor --project .
```

Automatic integration:

- `Runner.ruflo_init()` now runs repo-local config repair after `npx ruflo init`
- `Runner.ruflo_setup()` now runs repo-local config repair after init/memory/hooks setup
- `scan_repo_health()` now raises `Repair Ruflo config`
- `fix_repo_issue()` can repair config directly

## Generated Examples

Generated `.claude/settings.json` example:

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null || printf %s \"$CLAUDE_PROJECT_DIR\")\"; node \"$ROOT/.claude/helpers/hook-handler.cjs\" pre-tool-use",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null || printf %s \"$CLAUDE_PROJECT_DIR\")\"; node \"$ROOT/.claude/helpers/hook-handler.cjs\" session-start",
            "timeout": 10
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "ROOT=\"$(git rev-parse --show-toplevel 2>/dev/null || printf %s \"$CLAUDE_PROJECT_DIR\")\"; node \"$ROOT/.claude/helpers/statusline.cjs\"",
    "padding": 0
  }
}
```

Generated `.claude-flow/config.json` example:

```json
{
  "schemaVersion": 1,
  "profile": "full",
  "features": {
    "hooks": true,
    "statusLine": true,
    "autoMemory": true,
    "agentTeams": true
  },
  "memory": {
    "importOnSessionStart": true,
    "syncOnStop": true,
    "storePath": ".claude-flow/data/auto-memory-store.json"
  }
}
```

## Docs Drift Removed Or Reframed

Removed from generated config because they were dead in this repo's runtime:

- giant `claudeFlow` settings blob under `.claude/settings.json`
- legacy YAML runtime config as the primary write target
- wildcard permission rules such as `mcp__claude-flow__:*`
- relative helper commands such as `node .claude/helpers/...`

Updated repo docs now describe:

- the split between Claude Code settings and runtime config
- the `normalize` / `doctor` commands
- automatic post-init repair in the orchestrator

## Verification

Commands run in this repo:

```bash
python -m py_compile orchestrator.py ruflo_config.py
python ruflo_config.py doctor --project .
pytest tests/test_ruflo_config.py -q
pytest tests/test_swarm.py -q -k "test_297_ruflo_setup_method"
pytest tests/test_swarm.py -q -k "TestHealthScanner or test_297_ruflo_setup_method"
```

Observed results:

- `python -m py_compile ...`: passed
- `python ruflo_config.py doctor --project .`: passed
- `tests/test_ruflo_config.py`: 11 passed
- targeted `tests/test_swarm.py` runs: passed

Manual validation steps for a fresh repo:

1. Run `npx ruflo init` or let the orchestrator call `Runner.ruflo_init()`.
2. Run `python ruflo_config.py doctor --project .`.
3. Confirm `.claude/settings.json` contains only Claude Code-native keys.
4. Confirm `.claude-flow/config.json` exists and is the only current runtime config file written by the repo.
5. Confirm every helper referenced by `.claude/settings.json` exists under `.claude/helpers/`.
6. If you want agent-team hooks, re-run `python ruflo_config.py normalize --project . --profile full --agent-teams`.
