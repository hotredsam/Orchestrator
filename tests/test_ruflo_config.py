import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "bot"))

from ruflo_config import load_runtime_config, normalize_project, validate_project


NODE = shutil.which("node")


def test_normalize_minimal_generates_valid_settings_and_runtime_config(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    result = normalize_project(repo, profile="minimal")

    assert result["ok"] is True
    runtime = json.loads((repo / ".claude-flow" / "config.json").read_text(encoding="utf-8"))
    settings = json.loads((repo / ".claude" / "settings.json").read_text(encoding="utf-8"))

    assert runtime["schemaVersion"] == 1
    assert runtime["profile"] == "minimal"
    assert runtime["features"]["autoMemory"] is False
    assert runtime["features"]["agentTeams"] is False
    assert "TaskCompleted" not in settings["hooks"]
    assert "TeammateIdle" not in settings["hooks"]
    assert not (repo / ".claude" / "helpers" / "auto-memory-hook.mjs").exists()
    assert (repo / ".claude" / "helpers" / "hook-handler.cjs").exists()
    assert (repo / ".claude" / "helpers" / "statusline.cjs").exists()
    stop_commands = settings["hooks"]["Stop"][0]["hooks"]
    subagent_commands = settings["hooks"]["SubagentStop"][0]["hooks"]
    assert not any("telegram-notify.cjs" in item["command"] for item in stop_commands)
    assert not any("telegram-notify.cjs" in item["command"] for item in subagent_commands)


def test_normalize_full_agent_teams_emits_supported_hooks(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    result = normalize_project(repo, profile="full", agent_teams=True)

    assert result["ok"] is True
    runtime = json.loads((repo / ".claude-flow" / "config.json").read_text(encoding="utf-8"))
    settings = json.loads((repo / ".claude" / "settings.json").read_text(encoding="utf-8"))

    assert runtime["profile"] == "full"
    assert runtime["features"]["autoMemory"] is True
    assert runtime["features"]["agentTeams"] is True
    assert "TaskCompleted" in settings["hooks"]
    assert "TeammateIdle" in settings["hooks"]
    assert (repo / ".claude" / "helpers" / "auto-memory-hook.mjs").exists()
    assert not any("telegram-notify.cjs" in item["command"] for item in settings["hooks"]["TaskCompleted"][0]["hooks"])


def test_validate_detects_relative_helper_paths_and_missing_helpers(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".claude").mkdir()
    (repo / ".claude-flow").mkdir()
    (repo / ".claude-flow" / "config.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "profile": "minimal",
                "features": {
                    "hooks": True,
                    "statusLine": True,
                    "autoMemory": False,
                    "agentTeams": False,
                },
                "memory": {
                    "importOnSessionStart": False,
                    "syncOnStop": False,
                    "storePath": ".claude-flow/data/auto-memory-store.json",
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (repo / ".claude" / "settings.json").write_text(
        json.dumps(
            {
                "hooks": {
                    "PreToolUse": [
                        {
                            "matcher": "Bash",
                            "hooks": [
                                {
                                    "type": "command",
                                    "command": "node .claude/helpers/hook-handler.cjs pre-tool-use",
                                    "timeout": 5000,
                                }
                            ],
                        }
                    ]
                }
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    result = validate_project(repo)
    messages = [issue["message"] for issue in result["issues"]]

    assert result["ok"] is False
    assert any("relative helper path" in message for message in messages)
    assert any("timeout looks like milliseconds" in message for message in messages)
    assert any("missing helper file" in message for message in messages)


def test_migrates_legacy_yaml_to_current_json(tmp_path):
    repo = tmp_path / "repo"
    (repo / ".claude-flow").mkdir(parents=True)
    (repo / ".claude-flow" / "config.yaml").write_text(
        "\n".join(
            [
                "version: \"3.0.0\"",
                "memory:",
                "  backend: hybrid",
                "hooks:",
                "  enabled: true",
                "mcp:",
                "  autoStart: false",
            ]
        ),
        encoding="utf-8",
    )

    result = normalize_project(repo, profile="minimal")
    runtime = json.loads((repo / ".claude-flow" / "config.json").read_text(encoding="utf-8"))

    assert result["ok"] is True
    assert runtime["features"]["autoMemory"] is True
    assert any("config.yaml" in warning for warning in result["warnings"])


def test_migrates_agent_teams_from_legacy_settings_block(tmp_path):
    repo = tmp_path / "repo"
    (repo / ".claude").mkdir(parents=True)
    (repo / ".claude" / "settings.json").write_text(
        json.dumps(
            {
                "claudeFlow": {
                    "agentTeams": {"enabled": True},
                    "memory": {"backend": "hybrid"},
                    "swarm": {"topology": "mesh"},
                }
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    result = normalize_project(repo, profile="minimal")
    runtime = json.loads((repo / ".claude-flow" / "config.json").read_text(encoding="utf-8"))
    settings = json.loads((repo / ".claude" / "settings.json").read_text(encoding="utf-8"))

    assert result["ok"] is True
    assert runtime["features"]["agentTeams"] is True
    assert runtime["features"]["autoMemory"] is True
    assert "claudeFlow" not in settings
    assert "TaskCompleted" in settings["hooks"]
    assert "TeammateIdle" in settings["hooks"]


def test_runtime_config_round_trip(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    normalize_project(repo, profile="full", agent_teams=True)

    runtime, warnings = load_runtime_config(repo, profile="minimal")

    assert warnings == []
    assert runtime["profile"] == "full"
    assert runtime["features"]["autoMemory"] is True
    assert runtime["features"]["agentTeams"] is True


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_hook_handler_uses_repo_root_from_subdir(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    normalize_project(repo, profile="full")
    nested = repo / "src" / "feature"
    nested.mkdir(parents=True)

    result = subprocess.run(
        ["node", str(repo / ".claude" / "helpers" / "hook-handler.cjs"), "session-start"],
        cwd=nested,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(nested)},
        input="{}",
        text=True,
        capture_output=True,
        timeout=20,
    )

    assert result.returncode == 0
    assert (repo / ".claude-flow" / "sessions" / "current.json").exists()


@pytest.mark.skipif(NODE is None, reason="node not installed")
def test_auto_memory_round_trip_from_non_root_cwd(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    normalize_project(repo, profile="full")
    nested = repo / "packages" / "app"
    nested.mkdir(parents=True)

    env = {**os.environ, "CLAUDE_PROJECT_DIR": str(nested)}
    subprocess.run(
        ["node", str(repo / ".claude" / "helpers" / "auto-memory-hook.mjs"), "import"],
        cwd=nested,
        env=env,
        text=True,
        capture_output=True,
        timeout=20,
        check=True,
    )
    subprocess.run(
        ["node", str(repo / ".claude" / "helpers" / "auto-memory-hook.mjs"), "sync"],
        cwd=nested,
        env=env,
        text=True,
        capture_output=True,
        timeout=20,
        check=True,
    )

    store = json.loads(
        (repo / ".claude-flow" / "data" / "auto-memory-store.json").read_text(encoding="utf-8")
    )
    assert store["meta"]["lastImportAt"]
    assert store["meta"]["lastSyncAt"]


def test_normalize_removes_stale_telegram_notify_helper(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    helper = repo / ".claude" / "helpers" / "telegram-notify.cjs"
    helper.parent.mkdir(parents=True)
    helper.write_text("legacy", encoding="utf-8")
    metric = repo / ".claude-flow" / "metrics" / "telegram-notify-state.json"
    metric.parent.mkdir(parents=True)
    metric.write_text("{}", encoding="utf-8")

    normalize_project(repo, profile="minimal")

    assert not helper.exists()
    assert not metric.exists()


def test_runner_ruflo_init_repairs_config(tmp_path):
    from orchestrator import Runner

    repo = tmp_path / "repo"
    repo.mkdir()
    runner = Runner()
    runner.has_claude = False
    runner.has_whisper = False

    with patch.object(runner, "run_cmd", return_value={"success": True, "output": "ok"}):
        result = runner.ruflo_init(str(repo))

    assert result["config_repaired"] is True
    assert (repo / ".claude" / "settings.json").exists()
    assert (repo / ".claude-flow" / "config.json").exists()


def test_scan_repo_health_flags_invalid_ruflo_config(tmp_path):
    from orchestrator import scan_repo_health

    repo = tmp_path / "repo"
    repo.mkdir()
    normalize_project(repo, profile="minimal")
    settings_path = repo / ".claude" / "settings.json"
    settings = json.loads(settings_path.read_text(encoding="utf-8"))
    settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"] = "node .claude/helpers/hook-handler.cjs pre-tool-use"
    settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")

    report = scan_repo_health({"id": 0, "path": str(repo), "name": "repo"})
    titles = [issue["title"] for issue in report["issues"]]

    assert "Repair Ruflo config" in titles


def test_fix_repo_issue_repairs_ruflo_config(tmp_path):
    from orchestrator import fix_repo_issue

    repo_path = tmp_path / "repo"
    repo_path.mkdir()
    normalize_project(repo_path, profile="minimal")
    settings_path = repo_path / ".claude" / "settings.json"
    settings = json.loads(settings_path.read_text(encoding="utf-8"))
    settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"] = "node .claude/helpers/hook-handler.cjs pre-tool-use"
    settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")

    result = fix_repo_issue({"path": str(repo_path), "name": "repo"}, {"title": "Repair Ruflo config"})

    assert result["fixed"] is True
    assert validate_project(repo_path)["ok"] is True


def test_get_ruflo_runtime_settings_uses_recommendation_file(tmp_path, monkeypatch):
    import orchestrator

    repo = tmp_path / "Repo Sample"
    repo.mkdir()
    (repo / "package.json").write_text(json.dumps({"name": "repo-sample", "dependencies": {"react": "1.0.0"}}), encoding="utf-8")

    rec_path = tmp_path / "recommended-settings.json"
    rec_path.write_text(
        json.dumps(
            {
                "globalDefault": {"name": "minimal_no_status", "profile": "minimal", "hooks": True, "statusline": False, "auto_memory": False, "agent_teams": False},
                "globalEvidence": {"winnerName": "minimal_no_status", "confidence": "medium", "candidates": {"minimal_no_status": {"meetsSampleFloor": True, "exactRate": 0.8}}},
                "projectTypeDefaults": {
                    "node-react": {"name": "full_default", "profile": "full", "hooks": True, "statusline": True, "auto_memory": True, "agent_teams": False}
                },
                "projectTypeEvidence": {
                    "node-react": {"winnerName": "full_default", "confidence": "medium", "candidates": {"full_default": {"meetsSampleFloor": True, "exactRate": 0.8}}}
                },
                "repoOverrides": {
                    "Repo Sample": {"name": "full_agent_teams", "profile": "full", "hooks": True, "statusline": False, "auto_memory": True, "agent_teams": True}
                },
                "repoEvidence": {
                    "Repo Sample": {"winnerName": "full_agent_teams", "confidence": "medium", "candidates": {"full_agent_teams": {"meetsSampleFloor": True, "exactRate": 0.8}}}
                },
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(orchestrator, "RUFLO_RECOMMENDATIONS_PATH", str(rec_path))
    settings = orchestrator.get_ruflo_runtime_settings(str(repo), default_profile="minimal")

    assert settings["profile"] == "full"
    assert settings["hooks"] is True
    assert settings["statusline"] is False
    assert settings["auto_memory"] is True
    assert settings["agent_teams"] is True


def test_repair_ruflo_config_applies_measured_settings(tmp_path, monkeypatch):
    import orchestrator

    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "package.json").write_text(json.dumps({"name": "repo"}), encoding="utf-8")

    rec_path = tmp_path / "recommended-settings.json"
    rec_path.write_text(
        json.dumps(
            {
                "globalDefault": {"name": "minimal_no_status", "profile": "minimal", "hooks": True, "statusline": False, "auto_memory": False, "agent_teams": False},
                "globalEvidence": {"winnerName": "minimal_no_status", "confidence": "medium", "candidates": {"minimal_no_status": {"meetsSampleFloor": True, "exactRate": 0.8}}},
                "projectTypeDefaults": {},
                "repoOverrides": {},
            }
        ),
        encoding="utf-8",
    )

    captured = {}

    def fake_normalize(path, **kwargs):
        captured.update(kwargs)
        return {"ok": True, "issues": [], "warnings": [], "projectRoot": str(path)}

    monkeypatch.setattr(orchestrator, "RUFLO_RECOMMENDATIONS_PATH", str(rec_path))
    monkeypatch.setattr(orchestrator, "normalize_ruflo_project", fake_normalize)

    result = orchestrator.repair_ruflo_config(str(repo), profile="full")

    assert result["ok"] is True
    assert result["applied_settings"]["variant"] == "minimal_no_status"
    assert captured["profile"] == "minimal"
    assert captured["hooks"] is True
    assert captured["status_line"] is False
    assert captured["auto_memory"] is False
