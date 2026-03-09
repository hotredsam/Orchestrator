import json
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import ruflo_optimizer_core as core


def test_exact_pass_requires_grounded_not_blind():
    row = {
        "qualityPass": True,
        "groundedProfilePass": True,
        "blindProfilePass": False,
        "configPass": True,
        "behaviorPass": True,
        "claudeExit": 0,
        "claudeTimedOut": False,
        "limitExceeded": False,
    }

    assert core.exact_pass(row) is True


def test_choose_runner_mode_prefers_less_used_mode():
    repo = core.RepoSpec("Repo", "C:/repo", "node", "TypeScript", 10)
    variant = core.VARIANTS[0]
    results = [
        {"repo": "Repo", "variant": variant.name, "runnerMode": "oneshot"},
        {"repo": "Repo", "variant": variant.name, "runnerMode": "oneshot"},
        {"repo": "Repo", "variant": variant.name, "runnerMode": "staged_session"},
    ]

    chosen = core.choose_runner_mode(repo, variant, results, ["oneshot", "staged_session"], cycle=3)

    assert chosen == "staged_session"


def test_recommend_scope_prefers_higher_exact_rate_over_raw_wins():
    variants_by_name = {variant.name: core.asdict(variant) for variant in core.VARIANTS[:2]}
    winner = core.VARIANTS[0].name
    loser = core.VARIANTS[1].name

    rows = []
    for _ in range(6):
        rows.append(
            {
                "variant": winner,
                "exactPass": True,
                "qualityPass": True,
                "profilePass": True,
                "configPass": True,
                "behaviorPass": True,
                "hookClean": True,
                "claudeTimedOut": False,
                "score": 100.0,
                "totalCostUsd": 0.10,
                "claudeDurationMs": 1000,
                "cacheBucket": "cold",
                "runnerMode": "oneshot",
                "scenario": "js_manifest_renderer",
            }
        )
    for _ in range(20):
        rows.append(
            {
                "variant": loser,
                "exactPass": False,
                "qualityPass": True,
                "profilePass": False,
                "configPass": True,
                "behaviorPass": True,
                "hookClean": True,
                "claudeTimedOut": False,
                "score": 70.0,
                "totalCostUsd": 0.12,
                "claudeDurationMs": 1200,
                "cacheBucket": "cold",
                "runnerMode": "oneshot",
                "scenario": "js_manifest_renderer",
            }
        )
    for _ in range(4):
        rows.append(
            {
                "variant": loser,
                "exactPass": True,
                "qualityPass": True,
                "profilePass": True,
                "configPass": True,
                "behaviorPass": True,
                "hookClean": True,
                "claudeTimedOut": False,
                "score": 90.0,
                "totalCostUsd": 0.12,
                "claudeDurationMs": 1200,
                "cacheBucket": "cold",
                "runnerMode": "oneshot",
                "scenario": "js_manifest_renderer",
            }
        )

    recommendation = core.recommend_scope(rows, min_samples=6, variants_by_name=variants_by_name)

    assert recommendation["winnerName"] == winner


def test_build_scenario_plan_writes_into_real_repo_dirs(tmp_path):
    repo_root = tmp_path / "repo"
    (repo_root / "src").mkdir(parents=True)
    (repo_root / "tests").mkdir(parents=True)
    repo = core.RepoSpec("Repo", str(repo_root), "node", "TypeScript", 10)

    plan = core.build_scenario_plan(repo_root, repo, "js_manifest_renderer")

    assert any(path.startswith("src/") for path in plan.created_files)
    assert any(path.startswith("tests/") for path in plan.created_files)
    assert all(not path.startswith(".ruflo-benchmark/") for path in plan.created_files)


def test_jobs_for_cycle_spreads_runner_modes_across_variants():
    repo = core.RepoSpec("Repo", "C:/repo", "node", "TypeScript", 10)

    jobs = core.jobs_for_cycle(
        repos=[repo],
        results=[],
        variants=core.VARIANTS[:2],
        runner_modes=["oneshot", "staged_session"],
        cycle=1,
        warmup_cycles=1,
        exploit_variants=2,
    )

    assert {job[2] for job in jobs} == {"oneshot", "staged_session"}


def test_run_claude_flow_staged_ignores_warmup_timeout(monkeypatch, tmp_path):
    repo = core.RepoSpec("Repo", str(tmp_path), "node", "TypeScript", 10)
    scenario = core.ScenarioPlan(
        definition=core.SCENARIOS["js_manifest_renderer"],
        focus_paths=("src/example.js",),
        verify_commands=(("node", "--test", "tests/example.test.js"),),
        created_files=("src/example.js", "tests/example.test.js"),
        prompt_fragment="Fix the example benchmark.",
    )
    calls = []

    def fake_run_command(command, cwd, timeout_seconds=300, env=None, headless=True):
        calls.append(timeout_seconds)
        if len(calls) == 1:
            return core.CommandResult(command=["warmup"], returncode=-9, stdout="", stderr="timeout", timed_out=True, elapsed_ms=timeout_seconds * 1000)
        payload = {"duration_ms": 1200, "total_cost_usd": 0.01, "usage": {"input_tokens": 10, "output_tokens": 20}, "result": "TASK_DONE"}
        return core.CommandResult(command=["main"], returncode=0, stdout=json.dumps(payload), stderr="", timed_out=False, elapsed_ms=1500)

    monkeypatch.setattr(core, "run_command", fake_run_command)

    result, parsed, limit_exceeded = core.run_claude_flow(
        workspace=tmp_path,
        repo=repo,
        scenario=scenario,
        runner_mode="staged_session",
        prompt_style="structured",
        run_command_hint="npm test",
        timeout_seconds=90,
    )

    assert limit_exceeded is False
    assert result.returncode == 0
    assert result.timed_out is False
    assert parsed["result"] == "TASK_DONE"
