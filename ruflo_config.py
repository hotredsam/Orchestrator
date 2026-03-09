from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
CURRENT_CONFIG = Path(".claude-flow/config.json")
LEGACY_JSON = Path("claude-flow.config.json")
LEGACY_YAML = Path(".claude-flow/config.yaml")
SETTINGS_PATH = Path(".claude/settings.json")
HOOK_HANDLER_PATH = Path(".claude/helpers/hook-handler.cjs")
STATUSLINE_PATH = Path(".claude/helpers/statusline.cjs")
AUTO_MEMORY_PATH = Path(".claude/helpers/auto-memory-hook.mjs")

VALID_HOOK_EVENTS = {
    "PreToolUse",
    "PostToolUse",
    "Notification",
    "UserPromptSubmit",
    "Stop",
    "SubagentStop",
    "PreCompact",
    "SessionStart",
    "SessionEnd",
    "SubagentStart",
    "TaskCompleted",
    "TeammateIdle",
    "PreToolUseFailure",
    "PostToolUseFailure",
    "PermissionRequest",
    "InstructionsLoaded",
    "ConfigChange",
    "WorktreeCreated",
}

KNOWN_SETTINGS_KEYS = {
    "apiKeyHelper",
    "cleanupPeriodDays",
    "env",
    "includeCoAuthoredBy",
    "permissions",
    "hooks",
    "disableAllHooks",
    "model",
    "statusLine",
    "outputStyle",
    "forceLoginMethod",
    "forceLoginOrgUUID",
    "enableAllProjectMcpServers",
    "enabledMcpjsonServers",
    "disabledMcpjsonServers",
    "awsAuthRefresh",
    "awsCredentialExport",
    "preferredNotifChannel",
    "theme",
}

LEGACY_DROPPED_KEYS = {
    "version",
    "swarm",
    "modelPreferences",
    "neural",
    "daemon",
    "learning",
    "adr",
    "ddd",
    "security",
    "mcp",
    "attribution",
}

HOOK_HANDLER_TEMPLATE = r"""#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (error) {
    // Ignore malformed files and use the fallback.
  }
  return fallback;
}

function readStdinJson() {
  try {
    const input = fs.readFileSync(0, "utf8").trim();
    return input ? JSON.parse(input) : {};
  } catch (error) {
    return {};
  }
}

function findProjectRoot() {
  const rawCandidates = [
    process.env.CLAUDE_PROJECT_DIR,
    process.cwd(),
    path.resolve(__dirname, "..", ".."),
  ].filter(Boolean);
  const seen = new Set();
  for (const candidate of rawCandidates) {
    let current = path.resolve(candidate);
    while (true) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
      const sentinels = [
        path.join(current, ".claude-flow", "config.json"),
        path.join(current, ".claude"),
        path.join(current, ".git"),
      ];
      if (sentinels.some((entry) => fs.existsSync(entry))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return path.resolve(__dirname, "..", "..");
}

const PROJECT_ROOT = findProjectRoot();
const CONFIG_PATH = path.join(PROJECT_ROOT, ".claude-flow", "config.json");
const SESSIONS_DIR = path.join(PROJECT_ROOT, ".claude-flow", "sessions");
const CURRENT_SESSION_PATH = path.join(SESSIONS_DIR, "current.json");
const METRICS_DIR = path.join(PROJECT_ROOT, ".claude-flow", "metrics");
const EVENTS_PATH = path.join(METRICS_DIR, "hook-events.jsonl");

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function defaultConfig() {
  return {
    schemaVersion: 1,
    profile: "minimal",
    features: {
      hooks: true,
      statusLine: true,
      autoMemory: false,
      agentTeams: false,
    },
    memory: {
      importOnSessionStart: false,
      syncOnStop: false,
      storePath: ".claude-flow/data/auto-memory-store.json",
    },
  };
}

function loadConfig() {
  const fallback = defaultConfig();
  const data = readJson(CONFIG_PATH, fallback);
  const features = data.features || {};
  const memory = data.memory || {};
  return {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    profile: data.profile === "full" ? "full" : "minimal",
    features: {
      hooks: features.hooks !== false,
      statusLine: features.statusLine !== false,
      autoMemory: features.autoMemory === true,
      agentTeams: features.agentTeams === true,
    },
    memory: {
      importOnSessionStart: memory.importOnSessionStart === true,
      syncOnStop: memory.syncOnStop === true,
      storePath: typeof memory.storePath === "string" && memory.storePath ? memory.storePath : ".claude-flow/data/auto-memory-store.json",
    },
  };
}

function appendEvent(eventName, payload) {
  ensureDirectory(METRICS_DIR);
  const entry = {
    timestamp: new Date().toISOString(),
    event: eventName,
    sessionId: payload.session_id || null,
    hookEventName: payload.hook_event_name || null,
    toolName: payload.tool_name || null,
    cwd: payload.cwd || process.cwd(),
  };
  if (payload.tool_input && typeof payload.tool_input.file_path === "string") {
    entry.filePath = payload.tool_input.file_path;
  }
  fs.appendFileSync(EVENTS_PATH, JSON.stringify(entry) + "\n", "utf8");
}

function readCurrentSession() {
  return readJson(CURRENT_SESSION_PATH, null);
}

function writeCurrentSession(session) {
  ensureDirectory(SESSIONS_DIR);
  fs.writeFileSync(CURRENT_SESSION_PATH, JSON.stringify(session, null, 2) + "\n", "utf8");
}

function updateCurrentSession(patch) {
  const existing = readCurrentSession() || {
    id: patch.id || "session-unknown",
    startedAt: new Date().toISOString(),
    hookEvents: 0,
  };
  const next = {
    ...existing,
    ...patch,
    lastSeenAt: new Date().toISOString(),
    hookEvents: (existing.hookEvents || 0) + 1,
  };
  writeCurrentSession(next);
  return next;
}

function archiveCurrentSession(reason) {
  const session = readCurrentSession();
  if (!session) {
    return;
  }
  ensureDirectory(SESSIONS_DIR);
  const ended = {
    ...session,
    endedAt: new Date().toISOString(),
    endReason: reason || "session-end",
  };
  const archiveName = `${ended.id || "session"}.json`;
  fs.writeFileSync(path.join(SESSIONS_DIR, archiveName), JSON.stringify(ended, null, 2) + "\n", "utf8");
  fs.unlinkSync(CURRENT_SESSION_PATH);
}

function denyPreTool(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message,
    },
  }));
}

function sessionStartContext(config) {
  const parts = [
    `profile=${config.profile}`,
    `hooks=${config.features.hooks ? "on" : "off"}`,
    `memory=${config.features.autoMemory ? "on" : "off"}`,
    `teams=${config.features.agentTeams ? "on" : "off"}`,
  ];
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Claude Flow config loaded from .claude-flow/config.json (${parts.join(", ")}).`,
    },
  }));
}

function dangerousPattern(commandText) {
  const lower = String(commandText || "").toLowerCase();
  const patterns = [
    "rm -rf /",
    "git reset --hard",
    "del /s /q",
    "format c:",
    ":(){:|:&};:",
  ];
  return patterns.find((pattern) => lower.includes(pattern)) || null;
}

function handle(command) {
  const payload = readStdinJson();
  const config = loadConfig();
  if (!config.features.hooks) {
    return;
  }

  switch (command) {
    case "pre-tool-use": {
      const toolName = payload.tool_name || "";
      const toolInput = payload.tool_input || {};
      const commandText = toolInput.command || "";
      const match = toolName === "Bash" ? dangerousPattern(commandText) : null;
      if (match) {
        denyPreTool(`Blocked dangerous Bash pattern: ${match}`);
      }
      break;
    }
    case "post-tool-use":
      appendEvent("post-tool-use", payload);
      updateCurrentSession({ id: payload.session_id || "session-unknown" });
      break;
    case "session-start":
      updateCurrentSession({
        id: payload.session_id || `session-${Date.now()}`,
        transcriptPath: payload.transcript_path || null,
        cwd: PROJECT_ROOT,
        startedAt: new Date().toISOString(),
      });
      appendEvent("session-start", payload);
      sessionStartContext(config);
      break;
    case "stop":
      appendEvent("stop", payload);
      updateCurrentSession({ id: payload.session_id || "session-unknown" });
      break;
    case "session-end":
      appendEvent("session-end", payload);
      archiveCurrentSession(payload.reason || "session-end");
      break;
    case "subagent-stop":
      appendEvent("subagent-stop", payload);
      updateCurrentSession({ id: payload.session_id || "session-unknown" });
      break;
    case "task-completed":
      appendEvent("task-completed", payload);
      updateCurrentSession({ id: payload.session_id || "session-unknown" });
      break;
    case "teammate-idle":
      appendEvent("teammate-idle", payload);
      updateCurrentSession({ id: payload.session_id || "session-unknown" });
      break;
    default:
      appendEvent(`unknown:${command}`, payload);
      break;
  }
}

handle(process.argv[2] || "");
"""

STATUSLINE_TEMPLATE = r"""#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (error) {
    // Ignore malformed files and use the fallback.
  }
  return fallback;
}

function findProjectRoot() {
  const rawCandidates = [
    process.env.CLAUDE_PROJECT_DIR,
    process.cwd(),
    path.resolve(__dirname, "..", ".."),
  ].filter(Boolean);
  const seen = new Set();
  for (const candidate of rawCandidates) {
    let current = path.resolve(candidate);
    while (true) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
      const sentinels = [
        path.join(current, ".claude-flow", "config.json"),
        path.join(current, ".claude"),
        path.join(current, ".git"),
      ];
      if (sentinels.some((entry) => fs.existsSync(entry))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return path.resolve(__dirname, "..", "..");
}

const root = findProjectRoot();
const config = readJson(path.join(root, ".claude-flow", "config.json"), {
  profile: "minimal",
  features: { hooks: true, statusLine: true, autoMemory: false, agentTeams: false },
});
const session = readJson(path.join(root, ".claude-flow", "sessions", "current.json"), null);
const eventsPath = path.join(root, ".claude-flow", "metrics", "hook-events.jsonl");
let eventCount = 0;
if (fs.existsSync(eventsPath)) {
  try {
    const content = fs.readFileSync(eventsPath, "utf8").trim();
    eventCount = content ? content.split(/\r?\n/).length : 0;
  } catch (error) {
    eventCount = 0;
  }
}
const sessionLabel = session && session.id ? session.id.slice(-8) : "none";
const line = [
  `cf:${config.profile || "minimal"}`,
  `hooks:${config.features && config.features.hooks === false ? "off" : "on"}`,
  `memory:${config.features && config.features.autoMemory ? "on" : "off"}`,
  `teams:${config.features && config.features.agentTeams ? "on" : "off"}`,
  `events:${eventCount}`,
  `session:${sessionLabel}`,
].join(" ");
process.stdout.write(line + "\n");
"""

AUTO_MEMORY_TEMPLATE = r"""#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

function readJson(filePath, fallback) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf8"));
    }
  } catch (error) {
    // Ignore malformed files and use the fallback.
  }
  return fallback;
}

function findProjectRoot(startPoints) {
  const seen = new Set();
  for (const raw of startPoints.filter(Boolean)) {
    let current = path.resolve(raw);
    while (true) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
      const sentinels = [
        path.join(current, ".claude-flow", "config.json"),
        path.join(current, ".claude"),
        path.join(current, ".git"),
      ];
      if (sentinels.some((entry) => existsSync(entry))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = findProjectRoot([
  process.env.CLAUDE_PROJECT_DIR,
  process.cwd(),
  path.resolve(__dirname, "..", ".."),
]);
const configPath = path.join(projectRoot, ".claude-flow", "config.json");
const config = readJson(configPath, {
  features: { autoMemory: false },
  memory: {
    importOnSessionStart: false,
    syncOnStop: false,
    storePath: ".claude-flow/data/auto-memory-store.json",
  },
});
const relativeStorePath = config.memory && typeof config.memory.storePath === "string"
  ? config.memory.storePath
  : ".claude-flow/data/auto-memory-store.json";
const storePath = path.join(projectRoot, relativeStorePath);
const storeDir = path.dirname(storePath);

function ensureStore() {
  mkdirSync(storeDir, { recursive: true });
  if (!existsSync(storePath)) {
    writeFileSync(storePath, JSON.stringify({ version: 1, entries: [], meta: {} }, null, 2) + "\n", "utf8");
  }
  return readJson(storePath, { version: 1, entries: [], meta: {} });
}

function writeStore(store) {
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(storePath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function importMemory() {
  if (!config.features || config.features.autoMemory !== true || !config.memory || config.memory.importOnSessionStart !== true) {
    return;
  }
  const store = ensureStore();
  store.meta = store.meta || {};
  store.meta.lastImportAt = new Date().toISOString();
  store.meta.projectRoot = projectRoot;
  writeStore(store);
}

function syncMemory() {
  if (!config.features || config.features.autoMemory !== true || !config.memory || config.memory.syncOnStop !== true) {
    return;
  }
  const store = ensureStore();
  store.meta = store.meta || {};
  store.meta.lastSyncAt = new Date().toISOString();
  writeStore(store);
}

function status() {
  const store = ensureStore();
  const count = Array.isArray(store.entries) ? store.entries.length : 0;
  process.stdout.write(JSON.stringify({
    projectRoot,
    storePath,
    entries: count,
    autoMemory: !!(config.features && config.features.autoMemory),
  }) + "\n");
}

const command = process.argv[2] || "status";
if (command === "import") {
  importMemory();
} else if (command === "sync") {
  syncMemory();
} else {
  status();
}
"""

def default_runtime_config(profile: str = "minimal") -> dict[str, Any]:
    full = profile == "full"
    return {
        "schemaVersion": SCHEMA_VERSION,
        "profile": "full" if full else "minimal",
        "features": {
            "hooks": True,
            "statusLine": True,
            "autoMemory": full,
            "agentTeams": False,
        },
        "memory": {
            "importOnSessionStart": full,
            "syncOnStop": full,
            "storePath": ".claude-flow/data/auto-memory-store.json",
        },
    }


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_text_if_changed(path: Path, content: str) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.write_text(content, encoding="utf-8", newline="\n")
    return True


def _write_json_if_changed(path: Path, payload: dict[str, Any]) -> bool:
    content = json.dumps(payload, indent=2) + "\n"
    return _write_text_if_changed(path, content)


def _bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lower = value.strip().lower()
        if lower in {"1", "true", "yes", "on"}:
            return True
        if lower in {"0", "false", "no", "off"}:
            return False
    return default


def _detect_settings_hints(project_root: Path) -> tuple[dict[str, Any], list[str]]:
    hints: dict[str, Any] = {}
    warnings: list[str] = []
    settings_path = project_root / SETTINGS_PATH
    if not settings_path.exists():
        return hints, warnings
    try:
        settings = _load_json(settings_path)
    except (json.JSONDecodeError, OSError) as exc:
        warnings.append(f"Could not read existing .claude/settings.json: {exc}")
        return hints, warnings

    if "statusLine" in settings:
        hints["statusLine"] = True
    env = settings.get("env") or {}
    if env.get("CLAUDE_FLOW_HOOKS_ENABLED") == "true":
        hints["hooks"] = True
    claude_flow = settings.get("claudeFlow") or {}
    if claude_flow:
        warnings.append(
            "Existing .claude/settings.json contains stale custom claudeFlow settings; "
            "they will be migrated to .claude-flow/config.json and removed from generated settings."
        )
    agent_teams = claude_flow.get("agentTeams") or {}
    memory = claude_flow.get("memory") or {}
    hints["agentTeams"] = _bool(agent_teams.get("enabled"), False)
    if memory:
        hints["autoMemory"] = True
    if isinstance(claude_flow, dict):
        dropped = sorted(key for key in claude_flow if key in LEGACY_DROPPED_KEYS)
        if dropped:
            warnings.append(
                "Dropping legacy claudeFlow settings that are not consumed at runtime: "
                + ", ".join(dropped)
            )
    return hints, warnings


def _detect_legacy_yaml_hints(project_root: Path) -> tuple[dict[str, Any], list[str]]:
    hints: dict[str, Any] = {}
    warnings: list[str] = []
    yaml_path = project_root / LEGACY_YAML
    if not yaml_path.exists():
        return hints, warnings
    text = yaml_path.read_text(encoding="utf-8", errors="ignore")
    warnings.append(
        "Migrating legacy .claude-flow/config.yaml to .claude-flow/config.json; "
        "the JSON file is the only format written going forward."
    )
    if re.search(r"(?m)^memory:\s*$", text):
        hints["autoMemory"] = True
    hooks_enabled = re.search(r"(?ms)^hooks:\s*\n\s+enabled:\s*(true|false)", text)
    if hooks_enabled:
        hints["hooks"] = hooks_enabled.group(1).lower() == "true"
    top_level = set(re.findall(r"(?m)^([A-Za-z][A-Za-z0-9_-]*):\s*$", text))
    dropped = sorted(key for key in top_level if key in LEGACY_DROPPED_KEYS)
    if dropped:
        warnings.append(
            "Dropping legacy YAML sections that are not consumed at runtime: "
            + ", ".join(dropped)
        )
    return hints, warnings


def _detect_legacy_json_hints(project_root: Path) -> tuple[dict[str, Any], list[str]]:
    hints: dict[str, Any] = {}
    warnings: list[str] = []
    json_path = project_root / LEGACY_JSON
    if not json_path.exists():
        return hints, warnings
    try:
        data = _load_json(json_path)
    except (json.JSONDecodeError, OSError) as exc:
        warnings.append(f"Could not read legacy claude-flow.config.json: {exc}")
        return hints, warnings
    warnings.append(
        "Migrating legacy claude-flow.config.json to .claude-flow/config.json; "
        "the legacy file remains readable but is no longer written."
    )
    features = data.get("features") or {}
    agent_teams = data.get("agentTeams") or {}
    memory = data.get("memory") or {}
    hooks = data.get("hooks") or {}
    if "statusLine" in data:
        hints["statusLine"] = _bool((data.get("statusLine") or {}).get("enabled"), True)
    if features:
        if "hooks" in features:
            hints["hooks"] = _bool(features.get("hooks"), True)
        if "statusLine" in features:
            hints["statusLine"] = _bool(features.get("statusLine"), True)
        if "autoMemory" in features:
            hints["autoMemory"] = _bool(features.get("autoMemory"), False)
        if "agentTeams" in features:
            hints["agentTeams"] = _bool(features.get("agentTeams"), False)
    if agent_teams:
        hints["agentTeams"] = _bool(agent_teams.get("enabled"), False)
    if memory:
        hints["autoMemory"] = True
    if hooks and "enabled" in hooks:
        hints["hooks"] = _bool(hooks.get("enabled"), True)
    dropped = sorted(key for key in data if key in LEGACY_DROPPED_KEYS)
    if dropped:
        warnings.append(
            "Dropping legacy JSON keys that are not consumed at runtime: "
            + ", ".join(dropped)
        )
    return hints, warnings


def load_runtime_config(project_root: Path, profile: str = "minimal") -> tuple[dict[str, Any], list[str]]:
    current_path = project_root / CURRENT_CONFIG
    if current_path.exists():
        try:
            data = _load_json(current_path)
        except (json.JSONDecodeError, OSError) as exc:
            return default_runtime_config(profile), [
                f"Current .claude-flow/config.json is invalid JSON: {exc}"
            ]
        warnings: list[str] = []
        if data.get("schemaVersion") != SCHEMA_VERSION:
            warnings.append(
                f"Upgrading .claude-flow/config.json schema from {data.get('schemaVersion')!r} to {SCHEMA_VERSION}."
            )
        normalized = default_runtime_config(data.get("profile") or profile)
        features = data.get("features") or {}
        memory = data.get("memory") or {}
        normalized["features"]["hooks"] = _bool(features.get("hooks"), normalized["features"]["hooks"])
        normalized["features"]["statusLine"] = _bool(
            features.get("statusLine"),
            normalized["features"]["statusLine"],
        )
        normalized["features"]["autoMemory"] = _bool(
            features.get("autoMemory"),
            normalized["features"]["autoMemory"],
        )
        normalized["features"]["agentTeams"] = _bool(
            features.get("agentTeams"),
            normalized["features"]["agentTeams"],
        )
        normalized["memory"]["importOnSessionStart"] = _bool(
            memory.get("importOnSessionStart"),
            normalized["memory"]["importOnSessionStart"],
        )
        normalized["memory"]["syncOnStop"] = _bool(
            memory.get("syncOnStop"),
            normalized["memory"]["syncOnStop"],
        )
        if isinstance(memory.get("storePath"), str) and memory["storePath"]:
            normalized["memory"]["storePath"] = memory["storePath"]
        return normalized, warnings

    runtime = default_runtime_config(profile)
    warnings: list[str] = []
    for detector in (
        _detect_legacy_json_hints,
        _detect_legacy_yaml_hints,
        _detect_settings_hints,
    ):
        hints, detector_warnings = detector(project_root)
        warnings.extend(detector_warnings)
        if "hooks" in hints:
            runtime["features"]["hooks"] = _bool(hints["hooks"], runtime["features"]["hooks"])
        if "statusLine" in hints:
            runtime["features"]["statusLine"] = _bool(
                hints["statusLine"],
                runtime["features"]["statusLine"],
            )
        if "autoMemory" in hints:
            runtime["features"]["autoMemory"] = _bool(
                hints["autoMemory"],
                runtime["features"]["autoMemory"],
            )
        if "agentTeams" in hints:
            runtime["features"]["agentTeams"] = _bool(
                hints["agentTeams"],
                runtime["features"]["agentTeams"],
            )
    runtime["memory"]["importOnSessionStart"] = runtime["features"]["autoMemory"]
    runtime["memory"]["syncOnStop"] = runtime["features"]["autoMemory"]
    return runtime, warnings


def _root_prefixed_command(helper_name: str, *args: str) -> str:
    helper_literal = f"'.claude/helpers/{helper_name}'"
    command_parts = [
        "var c=require('child_process'),p=require('path'),r;",
        "try{r=c.execSync('git rev-parse --show-toplevel',{encoding:'utf8'}).trim()}",
        "catch(e){r=process.env.CLAUDE_PROJECT_DIR||process.cwd()}",
        f"var s=p.join(r,{helper_literal});",
        "process.argv.splice(1,0,s);",
        "require(s)",
    ]
    command = f'node -e "{"".join(command_parts)}"'
    if args:
        command += " " + " ".join(args)
    return command


def build_settings(runtime: dict[str, Any]) -> dict[str, Any]:
    settings: dict[str, Any] = {
        "permissions": {
            "deny": [
                "Read(./.env)",
                "Read(./.env.*)",
                "Read(./secrets/**)",
            ]
        }
    }
    if runtime["features"]["hooks"]:
        hooks: dict[str, Any] = {
            "PreToolUse": [
                {
                    "matcher": "Bash",
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "pre-tool-use"),
                            "timeout": 5,
                        }
                    ],
                }
            ],
            "PostToolUse": [
                {
                    "matcher": "Write|Edit|MultiEdit",
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "post-tool-use"),
                            "timeout": 10,
                        }
                    ],
                }
            ],
            "SessionStart": [
                {
                    "matcher": "startup|resume|clear",
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "session-start"),
                            "timeout": 10,
                        }
                    ],
                }
            ],
            "SessionEnd": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "session-end"),
                            "timeout": 10,
                        }
                    ]
                }
            ],
            "Stop": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "stop"),
                            "timeout": 5,
                        }
                    ]
                }
            ],
            "SubagentStop": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "subagent-stop"),
                            "timeout": 5,
                        }
                    ]
                }
            ],
        }
        if runtime["features"]["autoMemory"]:
            hooks["SessionStart"][0]["hooks"].append(
                {
                    "type": "command",
                    "command": _root_prefixed_command("auto-memory-hook.mjs", "import"),
                    "timeout": 10,
                }
            )
            hooks["Stop"][0]["hooks"].append(
                {
                    "type": "command",
                    "command": _root_prefixed_command("auto-memory-hook.mjs", "sync"),
                    "timeout": 10,
                }
            )
        if runtime["features"]["agentTeams"]:
            hooks["TaskCompleted"] = [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "task-completed"),
                            "timeout": 5,
                        }
                    ]
                }
            ]
            hooks["TeammateIdle"] = [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": _root_prefixed_command("hook-handler.cjs", "teammate-idle"),
                            "timeout": 5,
                        }
                    ]
                }
            ]
        settings["hooks"] = hooks
    if runtime["features"]["statusLine"]:
        settings["statusLine"] = {
            "type": "command",
            "command": _root_prefixed_command("statusline.cjs"),
            "padding": 0,
        }
    return settings


def normalize_project(
    project_root: str | Path,
    *,
    profile: str = "minimal",
    hooks: bool | None = None,
    status_line: bool | None = None,
    auto_memory: bool | None = None,
    agent_teams: bool | None = None,
) -> dict[str, Any]:
    root = Path(project_root).resolve()
    if not root.exists():
        raise FileNotFoundError(f"Project root does not exist: {root}")
    runtime, warnings = load_runtime_config(root, profile=profile)
    runtime["profile"] = "full" if profile == "full" else runtime["profile"]
    if hooks is not None:
        runtime["features"]["hooks"] = hooks
    if status_line is not None:
        runtime["features"]["statusLine"] = status_line
    if auto_memory is not None:
        runtime["features"]["autoMemory"] = auto_memory
    if agent_teams is not None:
        runtime["features"]["agentTeams"] = agent_teams
    runtime["memory"]["importOnSessionStart"] = runtime["features"]["autoMemory"]
    runtime["memory"]["syncOnStop"] = runtime["features"]["autoMemory"]
    runtime["schemaVersion"] = SCHEMA_VERSION

    written: list[str] = []
    if _write_json_if_changed(root / CURRENT_CONFIG, runtime):
        written.append(str(CURRENT_CONFIG))
    settings = build_settings(runtime)
    if _write_json_if_changed(root / SETTINGS_PATH, settings):
        written.append(str(SETTINGS_PATH))
    if _write_text_if_changed(root / HOOK_HANDLER_PATH, HOOK_HANDLER_TEMPLATE):
        written.append(str(HOOK_HANDLER_PATH))
    if _write_text_if_changed(root / STATUSLINE_PATH, STATUSLINE_TEMPLATE):
        written.append(str(STATUSLINE_PATH))
    if runtime["features"]["autoMemory"]:
        if _write_text_if_changed(root / AUTO_MEMORY_PATH, AUTO_MEMORY_TEMPLATE):
            written.append(str(AUTO_MEMORY_PATH))
    for stale_path in (
        root / ".claude" / "helpers" / "telegram-notify.cjs",
        root / ".claude-flow" / "metrics" / "telegram-notify-state.json",
    ):
        if stale_path.exists():
            stale_path.unlink()

    validation = validate_project(root)
    validation["warnings"] = warnings + validation["warnings"]
    validation["written"] = written
    validation["runtimeConfig"] = runtime
    validation["settings"] = settings
    return validation


def validate_project(project_root: str | Path) -> dict[str, Any]:
    root = Path(project_root).resolve()
    issues: list[dict[str, str]] = []
    warnings: list[str] = []
    settings_path = root / SETTINGS_PATH
    config_path = root / CURRENT_CONFIG

    def add_issue(level: str, message: str) -> None:
        issues.append({"level": level, "message": message})

    if not config_path.exists():
        if (root / LEGACY_JSON).exists() or (root / LEGACY_YAML).exists():
            add_issue(
                "error",
                "Missing .claude-flow/config.json; run the Ruflo config repair to migrate the legacy config.",
            )
        else:
            add_issue("error", "Missing .claude-flow/config.json.")
    else:
        try:
            runtime = _load_json(config_path)
        except (json.JSONDecodeError, OSError) as exc:
            add_issue("error", f".claude-flow/config.json is invalid JSON: {exc}")
            runtime = None
        if isinstance(runtime, dict):
            if runtime.get("schemaVersion") != SCHEMA_VERSION:
                add_issue(
                    "error",
                    f".claude-flow/config.json schemaVersion must be {SCHEMA_VERSION}.",
                )
            features = runtime.get("features")
            memory = runtime.get("memory")
            if not isinstance(features, dict):
                add_issue("error", ".claude-flow/config.json is missing a features object.")
            if not isinstance(memory, dict):
                add_issue("error", ".claude-flow/config.json is missing a memory object.")

    if not settings_path.exists():
        add_issue("error", "Missing .claude/settings.json.")
        settings = None
    else:
        try:
            settings = _load_json(settings_path)
        except (json.JSONDecodeError, OSError) as exc:
            add_issue("error", f".claude/settings.json is invalid JSON: {exc}")
            settings = None

    referenced_helpers: set[str] = set()
    if isinstance(settings, dict):
        unknown_keys = sorted(key for key in settings if key not in KNOWN_SETTINGS_KEYS)
        if unknown_keys:
            warnings.append("Unknown or stale .claude/settings.json keys: " + ", ".join(unknown_keys))
        hooks = settings.get("hooks")
        if hooks is not None:
            if not isinstance(hooks, dict):
                add_issue("error", ".claude/settings.json hooks must be an object.")
            else:
                for event_name, matchers in hooks.items():
                    if event_name not in VALID_HOOK_EVENTS:
                        add_issue("error", f"Invalid Claude Code hook event: {event_name}")
                    if not isinstance(matchers, list):
                        add_issue("error", f"Hook {event_name} must be an array.")
                        continue
                    for matcher_index, matcher in enumerate(matchers):
                        if not isinstance(matcher, dict):
                            add_issue(
                                "error",
                                f"Hook {event_name}[{matcher_index}] must be an object.",
                            )
                            continue
                        if event_name in {"PreToolUse", "PostToolUse", "SessionStart"} and "matcher" not in matcher:
                            add_issue(
                                "error",
                                f"Hook {event_name}[{matcher_index}] is missing a matcher.",
                            )
                        hook_commands = matcher.get("hooks")
                        if not isinstance(hook_commands, list) or not hook_commands:
                            add_issue(
                                "error",
                                f"Hook {event_name}[{matcher_index}] must contain a non-empty hooks array.",
                            )
                            continue
                        for hook_index, hook in enumerate(hook_commands):
                            if not isinstance(hook, dict):
                                add_issue(
                                    "error",
                                    f"Hook {event_name}[{matcher_index}].hooks[{hook_index}] must be an object.",
                                )
                                continue
                            if hook.get("type") != "command":
                                add_issue(
                                    "error",
                                    f"Hook {event_name}[{matcher_index}].hooks[{hook_index}] must use type=command.",
                                )
                            command = hook.get("command")
                            if not isinstance(command, str) or not command.strip():
                                add_issue(
                                    "error",
                                    f"Hook {event_name}[{matcher_index}].hooks[{hook_index}] is missing a command.",
                                )
                                continue
                            if "node .claude/" in command or "node .claude\\" in command:
                                add_issue(
                                    "error",
                                    f"Hook {event_name} uses a brittle relative helper path: {command}",
                                )
                            if "$CLAUDE_PROJECT_DIR" not in command and "git rev-parse --show-toplevel" not in command:
                                add_issue(
                                    "error",
                                    f"Hook {event_name} command does not resolve the project root safely: {command}",
                                )
                            timeout = hook.get("timeout")
                            if timeout is not None:
                                if not isinstance(timeout, int) or timeout <= 0:
                                    add_issue(
                                        "error",
                                        f"Hook {event_name}[{matcher_index}].hooks[{hook_index}] has an invalid timeout value.",
                                    )
                                elif timeout > 300:
                                    add_issue(
                                        "error",
                                        f"Hook {event_name}[{matcher_index}].hooks[{hook_index}] timeout looks like milliseconds, but Claude Code expects seconds.",
                                    )
                            referenced_helpers.update(
                                re.findall(r"\.claude/helpers/([A-Za-z0-9._-]+)", command)
                            )
        permissions = settings.get("permissions")
        if permissions is not None and not isinstance(permissions, dict):
            add_issue("error", ".claude/settings.json permissions must be an object.")
        if isinstance(permissions, dict):
            for section in ("allow", "ask", "deny"):
                rules = permissions.get(section)
                if rules is not None and not isinstance(rules, list):
                    add_issue("error", f"permissions.{section} must be an array when present.")
                if isinstance(rules, list):
                    for rule in rules:
                        if isinstance(rule, str) and ("mcp__claude-flow__:*" in rule or ".claude/*" in rule):
                            add_issue(
                                "error",
                                f"permissions.{section} contains an invalid wildcard rule: {rule}",
                            )
        if settings.get("statusLine"):
            status_line = settings["statusLine"]
            if (
                not isinstance(status_line, dict)
                or status_line.get("type") != "command"
                or not isinstance(status_line.get("command"), str)
            ):
                add_issue("error", ".claude/settings.json statusLine must be a command object.")
            else:
                referenced_helpers.update(
                    re.findall(r"\.claude/helpers/([A-Za-z0-9._-]+)", status_line["command"])
                )

    for helper_name in sorted(referenced_helpers):
        helper_path = root / ".claude" / "helpers" / helper_name
        if not helper_path.exists():
            add_issue(
                "error",
                f".claude/settings.json references missing helper file: {helper_path.relative_to(root)}",
            )

    ok = not any(issue["level"] == "error" for issue in issues)
    return {
        "ok": ok,
        "issues": issues,
        "warnings": warnings,
        "projectRoot": str(root),
    }


def print_validation(result: dict[str, Any]) -> None:
    state = "OK" if result["ok"] else "INVALID"
    print(f"Ruflo config validation: {state}")
    print(f"Project: {result['projectRoot']}")
    if result.get("written"):
        print("Written files:")
        for entry in result["written"]:
            print(f"  - {entry}")
    if result["issues"]:
        print("Issues:")
        for issue in result["issues"]:
            print(f"  - {issue['level']}: {issue['message']}")
    if result["warnings"]:
        print("Warnings:")
        for warning in result["warnings"]:
            print(f"  - {warning}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Normalize and validate Ruflo / Claude Code project config."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    normalize_parser = subparsers.add_parser(
        "normalize",
        help="Write the current supported config files and helpers.",
    )
    normalize_parser.add_argument("--project", default=".", help="Project root to normalize.")
    normalize_parser.add_argument("--profile", choices=("minimal", "full"), default="minimal")
    normalize_parser.add_argument(
        "--agent-teams",
        action="store_true",
        help="Enable Claude Code TaskCompleted / TeammateIdle hooks.",
    )
    normalize_parser.add_argument(
        "--disable-hooks",
        action="store_true",
        help="Generate settings without hooks.",
    )
    normalize_parser.add_argument(
        "--disable-statusline",
        action="store_true",
        help="Disable the custom Claude Code status line.",
    )
    normalize_parser.add_argument(
        "--disable-auto-memory",
        action="store_true",
        help="Disable SessionStart/Stop auto-memory hooks.",
    )
    normalize_parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full result as JSON.",
    )

    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate the current supported config files and helpers.",
    )
    validate_parser.add_argument("--project", default=".", help="Project root to validate.")
    validate_parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full result as JSON.",
    )

    doctor_parser = subparsers.add_parser("doctor", help="Alias for validate.")
    doctor_parser.add_argument("--project", default=".", help="Project root to validate.")
    doctor_parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full result as JSON.",
    )

    args = parser.parse_args(argv)

    if args.command == "normalize":
        result = normalize_project(
            args.project,
            profile=args.profile,
            hooks=not args.disable_hooks,
            status_line=not args.disable_statusline,
            auto_memory=not args.disable_auto_memory,
            agent_teams=args.agent_teams,
        )
    else:
        result = validate_project(args.project)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_validation(result)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
