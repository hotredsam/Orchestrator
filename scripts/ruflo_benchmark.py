#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CODING_PROJECTS = ROOT.parent
NORMALIZER = ROOT / "ruflo_config.py"
RESULTS_DIR = ROOT / "benchmark-results"
SYNTHETIC_ROOT = RESULTS_DIR / "synthetic-projects"
LIVE_PROGRESS = RESULTS_DIR / "ruflo-benchmark-live.json"
PYTHON = sys.executable
CLAUDE = shutil.which("claude")

DEFAULT_REPOS = [
    "AI Agent IDE",
    "Blog",
    "Clear Project",
    "CSV Editor",
    "Excalibur",
    "Kaleo Website Bot",
    "LOTR Typing Game",
    "Plant Scheduler",
    "Project Tracker",
    "RUFLO-GUI",
]

SYNTHETIC_REPO_NAMES = [
    "synthetic-cli-tool",
    "synthetic-react-dashboard",
    "synthetic-fastapi-service",
    "synthetic-node-api",
    "synthetic-monorepo",
    "synthetic-electron-app",
    "synthetic-python-worker",
    "synthetic-hybrid-automation",
    "synthetic-typescript-library",
    "synthetic-data-platform",
]

BENCHMARK_PROMPT = (
    "Inspect only the repo root, README, package manifests, lockfiles, and one relevant source directory. "
    "Run one safe shell command to print the current working directory. "
    "Then create .ruflo-benchmark.json at the repo root containing valid JSON with keys "
    "repoName, primaryLanguage, packageManagers, topLevelDirs, recommendedRunCommand. "
    "Finally reply only with BENCHMARK_DONE."
)

REQUIRED_BENCHMARK_KEYS = {
    "repoName",
    "primaryLanguage",
    "packageManagers",
    "topLevelDirs",
    "recommendedRunCommand",
}

IGNORE_DIR_NAMES = {
    ".git",
    ".svn",
    ".hg",
    ".claude",
    ".claude-flow",
    ".swarm",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".cache",
    ".turbo",
    ".venv",
    "venv",
    "__pycache__",
}

IGNORE_FILE_NAMES = {
    ".DS_Store",
}


@dataclass(frozen=True)
class Variant:
    name: str
    profile: str
    hooks: bool = True
    statusline: bool = True
    auto_memory: bool = False
    agent_teams: bool = False


@dataclass(frozen=True)
class Job:
    repo: Path
    variant: Variant
    batch_index: int

    @property
    def id(self) -> str:
        return f"{self.repo.name}:{self.variant.name}"


@dataclass
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool
    elapsed_ms: int


VARIANTS = [
    Variant("minimal_default", "minimal", hooks=True, statusline=True, auto_memory=False, agent_teams=False),
    Variant("minimal_no_status", "minimal", hooks=True, statusline=False, auto_memory=False, agent_teams=False),
    Variant("minimal_no_hooks", "minimal", hooks=False, statusline=False, auto_memory=False, agent_teams=False),
    Variant("minimal_agent_teams", "minimal", hooks=True, statusline=True, auto_memory=False, agent_teams=True),
    Variant("minimal_agent_no_status", "minimal", hooks=True, statusline=False, auto_memory=False, agent_teams=True),
    Variant("full_default", "full", hooks=True, statusline=True, auto_memory=True, agent_teams=False),
    Variant("full_no_status", "full", hooks=True, statusline=False, auto_memory=True, agent_teams=False),
    Variant("full_no_auto_memory", "full", hooks=True, statusline=True, auto_memory=False, agent_teams=False),
    Variant("full_agent_teams", "full", hooks=True, statusline=True, auto_memory=True, agent_teams=True),
    Variant("full_balanced", "full", hooks=True, statusline=False, auto_memory=False, agent_teams=False),
]


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProgressTracker:
    def __init__(self, path: Path, *, total_jobs: int, total_batches: int) -> None:
        self.path = path
        self.lock = threading.Lock()
        self.running_jobs: dict[str, dict[str, Any]] = {}
        self.state: dict[str, Any] = {
            "startedAt": utcnow_iso(),
            "lastUpdatedAt": utcnow_iso(),
            "totalJobs": total_jobs,
            "completedJobs": 0,
            "successfulJobs": 0,
            "failedJobs": 0,
            "timedOutJobs": 0,
            "totalBatches": total_batches,
            "completedBatches": 0,
            "currentBatch": None,
            "recentCompletions": [],
            "lastEvent": "initialized",
            "reportPath": None,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._write_locked()

    def _snapshot(self) -> dict[str, Any]:
        now = time.time()
        running_jobs = []
        for job_id, job in sorted(self.running_jobs.items()):
            running_jobs.append(
                {
                    "jobId": job_id,
                    "repo": job["repo"],
                    "variant": job["variant"],
                    "phase": job["phase"],
                    "startedAt": job["startedAt"],
                    "elapsedSeconds": round(now - job["startedAtMonotonic"], 1),
                }
            )
        snapshot = dict(self.state)
        snapshot["runningJobs"] = running_jobs
        snapshot["runningCount"] = len(running_jobs)
        snapshot["lastUpdatedAt"] = utcnow_iso()
        return snapshot

    def _write_locked(self) -> None:
        self.path.write_text(json.dumps(self._snapshot(), indent=2) + "\n", encoding="utf-8")

    def start_batch(self, batch_index: int, repo: str, batch_size: int) -> None:
        with self.lock:
            self.state["currentBatch"] = {
                "batchIndex": batch_index,
                "repo": repo,
                "batchSize": batch_size,
            }
            self.state["lastEvent"] = f"batch-start:{repo}"
            self._write_locked()

    def complete_batch(self, repo: str) -> None:
        with self.lock:
            self.state["completedBatches"] += 1
            self.state["lastEvent"] = f"batch-complete:{repo}"
            self.state["currentBatch"] = None
            self._write_locked()

    def job_started(self, job: Job, phase: str) -> None:
        with self.lock:
            self.running_jobs[job.id] = {
                "repo": job.repo.name,
                "variant": job.variant.name,
                "phase": phase,
                "startedAt": utcnow_iso(),
                "startedAtMonotonic": time.time(),
            }
            self.state["lastEvent"] = f"job-start:{job.id}:{phase}"
            self._write_locked()

    def job_phase(self, job: Job, phase: str) -> None:
        with self.lock:
            if job.id in self.running_jobs:
                self.running_jobs[job.id]["phase"] = phase
            self.state["lastEvent"] = f"job-phase:{job.id}:{phase}"
            self._write_locked()

    def job_completed(self, job: Job, row: dict[str, Any]) -> None:
        with self.lock:
            self.running_jobs.pop(job.id, None)
            self.state["completedJobs"] += 1
            if row.get("claude_exit") == 0 and row.get("benchmark_valid"):
                self.state["successfulJobs"] += 1
            else:
                self.state["failedJobs"] += 1
            if row.get("normalize_timed_out") or row.get("claude_timed_out"):
                self.state["timedOutJobs"] += 1
            recent = self.state["recentCompletions"]
            recent.append(
                {
                    "repo": job.repo.name,
                    "variant": job.variant.name,
                    "claudeExit": row.get("claude_exit"),
                    "benchmarkValid": row.get("benchmark_valid"),
                    "hookClean": row.get("hook_clean"),
                    "timedOut": row.get("normalize_timed_out") or row.get("claude_timed_out"),
                    "durationMs": row.get("duration_ms"),
                    "score": row.get("score"),
                }
            )
            del recent[:-15]
            self.state["lastEvent"] = f"job-complete:{job.id}"
            self._write_locked()

    def finish(self, report_path: Path) -> None:
        with self.lock:
            self.state["reportPath"] = str(report_path)
            self.state["finishedAt"] = utcnow_iso()
            self.state["lastEvent"] = "finished"
            self._write_locked()


def _ignore_filter(_: str, names: list[str]) -> set[str]:
    ignored = {
        name
        for name in names
        if name in IGNORE_DIR_NAMES or name in IGNORE_FILE_NAMES or name.upper() == "NUL"
    }
    ignored.update({name for name in names if name.endswith((".log", ".sqlite", ".db-wal", ".db-shm"))})
    return ignored


def copy_project(source: Path, destination: Path) -> None:
    shutil.copytree(source, destination, ignore=_ignore_filter, dirs_exist_ok=True)


def _terminate_process_tree(proc: subprocess.Popen[str]) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            capture_output=True,
            text=True,
            check=False,
        )
    else:
        proc.kill()


def run_command(
    command: list[str],
    cwd: Path,
    timeout_seconds: int,
    env: dict[str, str] | None = None,
) -> CommandResult:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    started = time.perf_counter()
    proc = subprocess.Popen(
        command,
        cwd=str(cwd),
        env=merged_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        stdout, stderr = proc.communicate(timeout=timeout_seconds)
        return CommandResult(
            command=command,
            returncode=proc.returncode,
            stdout=stdout or "",
            stderr=stderr or "",
            timed_out=False,
            elapsed_ms=int((time.perf_counter() - started) * 1000),
        )
    except subprocess.TimeoutExpired as exc:
        _terminate_process_tree(proc)
        stdout, stderr = proc.communicate()
        timeout_note = f"Process timed out after {timeout_seconds} seconds."
        stderr_text = (stderr or "").strip()
        if stderr_text:
            stderr_text = stderr_text + "\n" + timeout_note
        else:
            stderr_text = timeout_note
        timed_out_stdout = stdout or (exc.stdout if isinstance(exc.stdout, str) else "") or ""
        return CommandResult(
            command=command,
            returncode=-9,
            stdout=timed_out_stdout,
            stderr=stderr_text,
            timed_out=True,
            elapsed_ms=int((time.perf_counter() - started) * 1000),
        )


def apply_variant(project_dir: Path, variant: Variant) -> CommandResult:
    command = [
        PYTHON,
        str(NORMALIZER),
        "normalize",
        "--project",
        str(project_dir),
        "--profile",
        variant.profile,
    ]
    if not variant.hooks:
        command.append("--disable-hooks")
    if not variant.statusline:
        command.append("--disable-statusline")
    if not variant.auto_memory:
        command.append("--disable-auto-memory")
    if variant.agent_teams:
        command.append("--agent-teams")
    return run_command(command, cwd=ROOT, timeout_seconds=120)


def run_claude(project_dir: Path, model: str, effort: str, timeout_seconds: int) -> CommandResult:
    if not CLAUDE:
        raise RuntimeError("Could not find 'claude' on PATH.")

    command = [
        CLAUDE,
        "-p",
        BENCHMARK_PROMPT,
        "--model",
        model,
        "--effort",
        effort,
        "--output-format",
        "json",
        "--permission-mode",
        "bypassPermissions",
        "--dangerously-skip-permissions",
        "--allowedTools",
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "LS",
        "--no-session-persistence",
    ]
    if CLAUDE.lower().endswith(".ps1"):
        command = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            *command,
        ]
    return run_command(command, cwd=project_dir, timeout_seconds=timeout_seconds)


def read_benchmark_file(project_dir: Path) -> tuple[bool, str | None, dict[str, Any] | None]:
    benchmark_path = project_dir / ".ruflo-benchmark.json"
    if not benchmark_path.exists():
        return False, "missing benchmark file", None
    try:
        payload = json.loads(benchmark_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return False, f"invalid benchmark json: {exc}", None
    missing = sorted(REQUIRED_BENCHMARK_KEYS - set(payload))
    if missing:
        return False, f"missing keys: {', '.join(missing)}", payload
    return True, None, payload


def parse_claude_result(raw_stdout: str) -> dict[str, Any]:
    try:
        return json.loads(raw_stdout.strip()) if raw_stdout.strip() else {}
    except json.JSONDecodeError as exc:
        return {"parse_error": str(exc), "raw": raw_stdout}


def score_run(
    variant: Variant,
    *,
    normalize: CommandResult,
    claude: CommandResult | None,
    hook_clean: bool,
    benchmark_ok: bool,
    duration_ms: int | None,
) -> float:
    score = 0.0
    if normalize.returncode == 0 and not normalize.timed_out:
        score += 15.0
    if claude and claude.returncode == 0:
        score += 100.0
    if hook_clean:
        score += 60.0
    if benchmark_ok:
        score += 80.0
    if variant.hooks:
        score += 20.0
    if variant.statusline:
        score += 5.0
    if variant.auto_memory:
        score += 5.0
    if variant.agent_teams:
        score += 2.0
    if normalize.timed_out or (claude and claude.timed_out):
        score -= 120.0
    if duration_ms is not None:
        score -= duration_ms / 1000.0
    return round(score, 3)


def summarize_variant(results: list[dict[str, Any]]) -> dict[str, Any]:
    durations = [row["duration_ms"] for row in results if isinstance(row.get("duration_ms"), int)]
    costs = [row["total_cost_usd"] for row in results if isinstance(row.get("total_cost_usd"), (int, float))]
    return {
        "runs": len(results),
        "successes": sum(1 for row in results if row.get("claude_exit") == 0),
        "hook_clean_runs": sum(1 for row in results if row.get("hook_clean")),
        "benchmark_valid_runs": sum(1 for row in results if row.get("benchmark_valid")),
        "normalize_timeouts": sum(1 for row in results if row.get("normalize_timed_out")),
        "claude_timeouts": sum(1 for row in results if row.get("claude_timed_out")),
        "average_duration_ms": round(mean(durations), 2) if durations else None,
        "median_duration_ms": round(median(durations), 2) if durations else None,
        "average_cost_usd": round(mean(costs), 6) if costs else None,
        "median_cost_usd": round(median(costs), 6) if costs else None,
        "average_score": round(mean(row["score"] for row in results), 3) if results else None,
    }


def choose_winner(variant_summaries: dict[str, dict[str, Any]], variants: dict[str, Variant]) -> str:
    def sort_key(item: tuple[str, dict[str, Any]]) -> tuple[Any, ...]:
        name, summary = item
        variant = variants[name]
        return (
            summary["benchmark_valid_runs"],
            summary["hook_clean_runs"],
            summary["successes"],
            -summary["claude_timeouts"],
            1 if variant.hooks else 0,
            1 if not variant.agent_teams else 0,
            -(summary["median_duration_ms"] or 10**9),
            -(summary["average_duration_ms"] or 10**9),
            summary["average_score"] or -10**9,
        )

    winner_name, _ = max(variant_summaries.items(), key=sort_key)
    return winner_name


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    _write(path, json.dumps(payload, indent=2) + "\n")


def _seed_text(title: str) -> str:
    return "\n".join(
        [f"# {title}", "", "Synthetic benchmark fixture for Claude Code + Ruflo tuning.", "", "- README and manifests are intentionally representative.", "- Source trees are small enough to run quickly.", ""]
    )


def _materialize_synthetic_repo(root: Path, name: str, kind: str) -> None:
    _write(root / "README.md", _seed_text(name))
    if kind == "ts-cli":
        _write_json(root / "package.json", {"name": name, "private": True, "type": "module", "scripts": {"build": "tsc -p tsconfig.json", "test": "vitest run"}})
        _write(root / "package-lock.json", '{\n  "name": "synthetic-cli-tool"\n}\n')
        _write(root / "src" / "index.ts", "import { init } from './commands/init.js';\ninit();\n")
        _write(root / "src" / "commands" / "init.ts", "export function init() {\n  return 'ok';\n}\n")
        _write(root / "tests" / "init.test.ts", "test('init', () => {});\n")
    elif kind == "react":
        _write_json(root / "package.json", {"name": name, "private": True, "packageManager": "pnpm@10.0.0", "scripts": {"dev": "vite", "test": "vitest run"}, "dependencies": {"react": "^19.0.0"}})
        _write(root / "pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
        _write(root / "src" / "App.tsx", "export function App() {\n  return 'dashboard';\n}\n")
        _write(root / "src" / "components" / "Jobs.tsx", "export function Jobs() {\n  return 'jobs';\n}\n")
        _write(root / "tests" / "app.test.tsx", "test('app', () => {});\n")
    elif kind == "python-api":
        _write(root / "pyproject.toml", "[project]\nname = 'synthetic-fastapi-service'\nversion = '0.1.0'\ndependencies = ['fastapi', 'uvicorn']\n")
        _write(root / "uv.lock", "version = 1\n")
        _write(root / "app" / "main.py", "from fastapi import FastAPI\napp = FastAPI()\n")
        _write(root / "app" / "routes" / "jobs.py", "def list_jobs():\n    return []\n")
        _write(root / "tests" / "test_api.py", "def test_api():\n    assert True\n")
    elif kind == "node-api":
        _write_json(root / "package.json", {"name": name, "private": True, "scripts": {"dev": "tsx src/server.ts", "test": "vitest run"}, "dependencies": {"express": "^5.0.0"}})
        _write(root / "yarn.lock", "# yarn lockfile v1\n")
        _write(root / "src" / "server.ts", "import express from 'express';\nconst app = express();\napp.listen(3000);\n")
        _write(root / "src" / "routes" / "jobs.ts", "export const jobs = [];\n")
        _write(root / "docs" / "openapi.yaml", "openapi: 3.0.0\n")
    elif kind == "monorepo":
        _write_json(root / "package.json", {"name": name, "private": True, "packageManager": "pnpm@10.0.0", "workspaces": ["apps/*", "packages/*"]})
        _write(root / "pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n")
        _write_json(root / "apps" / "web" / "package.json", {"name": "@synthetic/web", "private": True})
        _write(root / "apps" / "web" / "src" / "main.tsx", "console.log('web');\n")
        _write_json(root / "packages" / "shared" / "package.json", {"name": "@synthetic/shared", "private": True})
        _write(root / "packages" / "shared" / "src" / "index.ts", "export const version = '1.0.0';\n")
    elif kind == "desktop":
        _write_json(root / "package.json", {"name": name, "private": True, "type": "module", "scripts": {"dev": "electron .", "test": "vitest run"}})
        _write(root / "package-lock.json", '{\n  "name": "synthetic-electron-app"\n}\n')
        _write(root / "src" / "main.ts", "console.log('main');\n")
        _write(root / "src" / "renderer" / "App.tsx", "export function App() {\n  return 'desktop';\n}\n")
        _write(root / "tests" / "app.test.ts", "test('desktop', () => {});\n")
    elif kind == "python-worker":
        _write(root / "pyproject.toml", "[project]\nname = 'synthetic-python-worker'\nversion = '0.1.0'\ndependencies = ['click']\n")
        _write(root / "worker" / "main.py", "from worker.tasks.sync import sync\nsync()\n")
        _write(root / "worker" / "tasks" / "sync.py", "def sync():\n    return 'ok'\n")
        _write(root / "configs" / "default.yaml", "queue: default\nretries: 3\n")
    elif kind == "hybrid":
        _write_json(root / "package.json", {"name": name, "private": True, "scripts": {"dev": "tsx scripts/index.ts", "test": "pytest"}})
        _write(root / "pyproject.toml", "[project]\nname = 'synthetic-hybrid-automation'\nversion = '0.1.0'\n")
        _write(root / "scripts" / "index.ts", "console.log('automation');\n")
        _write(root / "bridge" / "worker.py", "def run():\n    return {'ok': True}\n")
        _write(root / "config" / "targets.json", json.dumps({"targets": ["docs", "api", "web"]}, indent=2) + "\n")
    elif kind == "ts-lib":
        _write_json(root / "package.json", {"name": name, "private": True, "type": "module", "scripts": {"build": "tsup src/index.ts --format esm,cjs", "test": "vitest run"}})
        _write(root / "src" / "index.ts", "export * from './format.js';\n")
        _write(root / "src" / "format.ts", "export function formatValue(input: string) {\n  return input.trim();\n}\n")
        _write(root / "tests" / "format.test.ts", "test('format', () => {});\n")
    elif kind == "data":
        _write_json(root / "package.json", {"name": name, "private": True, "packageManager": "pnpm@10.0.0", "workspaces": ["apps/*", "packages/*"]})
        _write(root / "pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
        _write_json(root / "apps" / "api" / "package.json", {"name": "@synthetic/platform-api", "private": True})
        _write(root / "apps" / "api" / "src" / "server.ts", "console.log('platform-api');\n")
        _write(root / "infra" / "docker-compose.yml", "services:\n  postgres:\n    image: postgres:16\n")
    else:
        raise ValueError(f"Unsupported synthetic repo kind: {kind}")


def materialize_synthetic_projects(root: Path, count: int) -> list[Path]:
    specs = [
        ("synthetic-cli-tool", "ts-cli"),
        ("synthetic-react-dashboard", "react"),
        ("synthetic-fastapi-service", "python-api"),
        ("synthetic-node-api", "node-api"),
        ("synthetic-monorepo", "monorepo"),
        ("synthetic-electron-app", "desktop"),
        ("synthetic-python-worker", "python-worker"),
        ("synthetic-hybrid-automation", "hybrid"),
        ("synthetic-typescript-library", "ts-lib"),
        ("synthetic-data-platform", "data"),
    ]
    if count > len(specs):
        raise ValueError(f"Synthetic count {count} exceeds available blueprints {len(specs)}")
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True, exist_ok=True)
    repos: list[Path] = []
    for name, kind in specs[:count]:
        repo_root = root / name
        repo_root.mkdir(parents=True, exist_ok=True)
        _materialize_synthetic_repo(repo_root, name, kind)
        repos.append(repo_root)
    return repos


def execute_job(
    job: Job,
    *,
    temp_root: Path,
    model: str,
    effort: str,
    job_timeout_seconds: int,
    tracker: ProgressTracker,
) -> dict[str, Any]:
    run_started = time.time()
    sandbox_dir = temp_root / f"batch{job.batch_index:02d}_{job.repo.name.replace(' ', '_')}__{job.variant.name}"
    tracker.job_started(job, "copy")
    try:
        if sandbox_dir.exists():
            shutil.rmtree(sandbox_dir, ignore_errors=True)
        copy_project(job.repo, sandbox_dir)
        tracker.job_phase(job, "normalize")
        normalize_proc = apply_variant(sandbox_dir, job.variant)

        claude_proc: CommandResult | None = None
        result_json: dict[str, Any] = {}
        benchmark_valid = False
        benchmark_error: str | None = None
        benchmark_payload: dict[str, Any] | None = None
        hook_clean = False

        if normalize_proc.returncode == 0 and not normalize_proc.timed_out:
            tracker.job_phase(job, "claude")
            claude_proc = run_claude(sandbox_dir, model=model, effort=effort, timeout_seconds=job_timeout_seconds)
            result_json = parse_claude_result(claude_proc.stdout)
            hook_clean = claude_proc.returncode == 0 and claude_proc.stderr.strip() == ""
            benchmark_valid, benchmark_error, benchmark_payload = read_benchmark_file(sandbox_dir)
        else:
            benchmark_error = "normalize failed"

        duration_ms = result_json.get("duration_ms") if isinstance(result_json, dict) else None
        total_cost_usd = result_json.get("total_cost_usd") if isinstance(result_json, dict) else None
        row = {
            "repo": job.repo.name,
            "repoPath": str(job.repo),
            "variant": job.variant.name,
            "variantConfig": asdict(job.variant),
            "normalize_exit": normalize_proc.returncode,
            "normalize_stdout": normalize_proc.stdout,
            "normalize_stderr": normalize_proc.stderr,
            "normalize_timed_out": normalize_proc.timed_out,
            "normalize_elapsed_ms": normalize_proc.elapsed_ms,
            "claude_exit": claude_proc.returncode if claude_proc else None,
            "claude_stdout": claude_proc.stdout if claude_proc else "",
            "claude_stderr": claude_proc.stderr if claude_proc else "",
            "claude_timed_out": claude_proc.timed_out if claude_proc else False,
            "claude_elapsed_ms": claude_proc.elapsed_ms if claude_proc else None,
            "hook_clean": hook_clean,
            "benchmark_valid": benchmark_valid,
            "benchmark_error": benchmark_error,
            "benchmark_payload": benchmark_payload,
            "duration_ms": duration_ms,
            "total_cost_usd": total_cost_usd,
            "wall_time_seconds": round(time.time() - run_started, 3),
        }
        row["score"] = score_run(
            job.variant,
            normalize=normalize_proc,
            claude=claude_proc,
            hook_clean=hook_clean,
            benchmark_ok=benchmark_valid,
            duration_ms=duration_ms if isinstance(duration_ms, int) else None,
        )
        tracker.job_completed(job, row)
        return row
    except Exception as exc:
        row = {
            "repo": job.repo.name,
            "repoPath": str(job.repo),
            "variant": job.variant.name,
            "variantConfig": asdict(job.variant),
            "normalize_exit": None,
            "normalize_stdout": "",
            "normalize_stderr": f"internal error: {exc}",
            "normalize_timed_out": False,
            "normalize_elapsed_ms": None,
            "claude_exit": None,
            "claude_stdout": "",
            "claude_stderr": "",
            "claude_timed_out": False,
            "claude_elapsed_ms": None,
            "hook_clean": False,
            "benchmark_valid": False,
            "benchmark_error": f"internal error: {exc}",
            "benchmark_payload": None,
            "duration_ms": None,
            "total_cost_usd": None,
            "wall_time_seconds": round(time.time() - run_started, 3),
            "score": -999.0,
        }
        tracker.job_completed(job, row)
        return row
    finally:
        shutil.rmtree(sandbox_dir, ignore_errors=True)


def benchmark_repos(
    repos: list[Path],
    variants: list[Variant],
    *,
    model: str,
    effort: str,
    max_workers: int,
    job_timeout_seconds: int,
    progress_path: Path,
) -> dict[str, Any]:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    tracker = ProgressTracker(progress_path, total_jobs=len(repos) * len(variants), total_batches=len(repos))
    started_at = utcnow_iso()
    all_results: list[dict[str, Any]] = []

    with tempfile.TemporaryDirectory(prefix="ruflo-benchmark-") as temp_root_raw:
        temp_root = Path(temp_root_raw)
        for batch_index, repo in enumerate(repos, start=1):
            tracker.start_batch(batch_index, repo.name, len(variants))
            jobs = [Job(repo=repo, variant=variant, batch_index=batch_index) for variant in variants]
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(
                        execute_job,
                        job,
                        temp_root=temp_root,
                        model=model,
                        effort=effort,
                        job_timeout_seconds=job_timeout_seconds,
                        tracker=tracker,
                    ): job
                    for job in jobs
                }
                for future in as_completed(future_map):
                    all_results.append(future.result())
            tracker.complete_batch(repo.name)

    grouped: dict[str, list[dict[str, Any]]] = {variant.name: [] for variant in variants}
    for row in all_results:
        grouped[row["variant"]].append(row)

    variant_summaries = {name: summarize_variant(rows) for name, rows in grouped.items()}
    variants_by_name = {variant.name: variant for variant in variants}
    winner = choose_winner(variant_summaries, variants_by_name)

    report = {
        "startedAt": started_at,
        "finishedAt": utcnow_iso(),
        "model": model,
        "effort": effort,
        "jobTimeoutSeconds": job_timeout_seconds,
        "maxWorkers": max_workers,
        "progressPath": str(progress_path),
        "repos": [str(repo) for repo in repos],
        "variants": [asdict(variant) for variant in variants],
        "winner": winner,
        "winnerConfig": asdict(variants_by_name[winner]),
        "variantSummaries": variant_summaries,
        "runs": all_results,
    }

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = RESULTS_DIR / f"ruflo-benchmark-{timestamp}.json"
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report["outputPath"] = str(output_path)
    tracker.finish(output_path)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark Claude Code + Ruflo project settings.")
    parser.add_argument("--projects-root", type=Path, default=CODING_PROJECTS)
    parser.add_argument("--repos", nargs="*", default=DEFAULT_REPOS)
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--effort", default="low", choices=["low", "medium", "high"])
    parser.add_argument("--repo-limit", type=int, default=10)
    parser.add_argument("--variant-limit", type=int, default=10)
    parser.add_argument("--max-workers", type=int, default=10)
    parser.add_argument("--job-timeout-seconds", type=int, default=300)
    parser.add_argument("--progress-path", type=Path, default=LIVE_PROGRESS)
    parser.add_argument("--use-synthetic", action="store_true", help="Benchmark generated synthetic repos instead of real repos.")
    parser.add_argument("--synthetic-root", type=Path, default=SYNTHETIC_ROOT)
    parser.add_argument("--synthetic-count", type=int, default=10)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.use_synthetic:
        repos = materialize_synthetic_projects(args.synthetic_root, count=min(args.synthetic_count, args.repo_limit))
    else:
        repos = []
        for repo_name in args.repos[: args.repo_limit]:
            repo_path = args.projects_root / repo_name
            if not repo_path.exists():
                raise SystemExit(f"Missing repo: {repo_path}")
            repos.append(repo_path)

    variants = VARIANTS[: args.variant_limit]
    report = benchmark_repos(
        repos,
        variants,
        model=args.model,
        effort=args.effort,
        max_workers=min(args.max_workers, len(variants)),
        job_timeout_seconds=args.job_timeout_seconds,
        progress_path=args.progress_path,
    )
    print(json.dumps({
        "winner": report["winner"],
        "winnerConfig": report["winnerConfig"],
        "outputPath": report["outputPath"],
        "progressPath": report["progressPath"],
        "variantSummaries": report["variantSummaries"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
