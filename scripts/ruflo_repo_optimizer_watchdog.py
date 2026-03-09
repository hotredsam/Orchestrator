#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RESULTS_ROOT = ROOT / "benchmark-results" / "ruflo-repo-optimizer-live"
WORKER_SCRIPT = ROOT / "scripts" / "ruflo_repo_optimizer.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Keep the Ruflo repo optimizer running until its deadline.")
    parser.add_argument("--duration-hours", type=float, default=12.0)
    parser.add_argument("--max-repos", type=int, default=10)
    parser.add_argument("--variant-limit", type=int, default=8)
    parser.add_argument("--max-parallel", type=int, default=10)
    parser.add_argument("--job-timeout-seconds", type=int, default=300)
    parser.add_argument("--warmup-cycles", type=int, default=1)
    parser.add_argument("--exploit-variants", type=int, default=4)
    parser.add_argument("--runner-modes", nargs="*", default=None)
    parser.add_argument("--workspace-mode", choices=["realistic", "compact"], default="realistic")
    parser.add_argument("--results-root", type=Path, default=DEFAULT_RESULTS_ROOT)
    parser.add_argument("--repos", nargs="*", default=None)
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=30)
    parser.add_argument("--stale-seconds", type=int, default=600)
    parser.add_argument("--adopt-pid", type=int, default=0)
    return parser.parse_args()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def hidden_kwargs() -> dict[str, Any]:
    if os.name != "nt":
        return {}
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 0
    return {
        "startupinfo": startupinfo,
        "creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW,
    }


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        probe = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}"],
            capture_output=True,
            text=True,
            check=False,
            **hidden_kwargs(),
        )
        return str(pid) in (probe.stdout or "")
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def kill_tree(pid: int) -> None:
    if pid <= 0 or not pid_running(pid):
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            check=False,
            **hidden_kwargs(),
        )
    else:
        try:
            os.kill(pid, 9)
        except OSError:
            pass


def worker_command(args: argparse.Namespace, fresh: bool) -> list[str]:
    command = [
        sys.executable,
        str(WORKER_SCRIPT),
        "--duration-hours",
        str(args.duration_hours),
        "--max-repos",
        str(args.max_repos),
        "--variant-limit",
        str(args.variant_limit),
        "--max-parallel",
        str(args.max_parallel),
        "--job-timeout-seconds",
        str(args.job_timeout_seconds),
        "--warmup-cycles",
        str(args.warmup_cycles),
        "--exploit-variants",
        str(args.exploit_variants),
        "--workspace-mode",
        str(args.workspace_mode),
        "--results-root",
        str(args.results_root),
    ]
    if args.runner_modes:
        command.extend(["--runner-modes", *args.runner_modes])
    if fresh:
        command.append("--fresh")
    if args.repos:
        command.extend(["--repos", *args.repos])
    return command


def launch_worker(args: argparse.Namespace, fresh: bool) -> int:
    args.results_root.mkdir(parents=True, exist_ok=True)
    stdout_handle = (args.results_root / "stdout.log").open("a", encoding="utf-8")
    stderr_handle = (args.results_root / "stderr.log").open("a", encoding="utf-8")
    proc = subprocess.Popen(
        worker_command(args, fresh=fresh),
        cwd=str(ROOT),
        stdout=stdout_handle,
        stderr=stderr_handle,
        stdin=subprocess.DEVNULL,
        close_fds=True,
        **hidden_kwargs(),
    )
    return proc.pid


def heartbeat_is_stale(progress: dict[str, Any], stale_seconds: int) -> bool:
    generated = progress.get("generatedAt")
    if not generated:
        return False
    try:
        generated_at = datetime.fromisoformat(generated)
    except ValueError:
        return False
    return (datetime.now(timezone.utc) - generated_at).total_seconds() > stale_seconds


def parse_deadline(args: argparse.Namespace, progress: dict[str, Any]) -> datetime:
    if progress.get("deadline"):
        try:
            return datetime.fromisoformat(progress["deadline"])
        except ValueError:
            pass
    return datetime.now(timezone.utc) + timedelta(hours=args.duration_hours)


def write_watchdog_state(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    args.results_root = args.results_root.resolve()
    progress_path = args.results_root / "progress.json"
    worker_state_path = args.results_root / "worker.json"
    watchdog_state_path = args.results_root / "watchdog.json"

    restarts = 0
    current_pid = args.adopt_pid if pid_running(args.adopt_pid) else 0
    if not current_pid:
        worker_state = load_json(worker_state_path)
        current_pid = int(worker_state.get("pid") or 0)
        if not pid_running(current_pid):
            current_pid = 0

    while True:
        progress = load_json(progress_path)
        deadline = parse_deadline(args, progress)
        now = datetime.now(timezone.utc)
        if now >= deadline:
            write_watchdog_state(watchdog_state_path, {
                "generatedAt": utcnow(),
                "status": "deadline_reached",
                "currentPid": current_pid,
                "restarts": restarts,
                "deadline": deadline.isoformat(),
            })
            return 0

        if current_pid and pid_running(current_pid):
            if heartbeat_is_stale(progress, args.stale_seconds):
                kill_tree(current_pid)
                write_watchdog_state(watchdog_state_path, {
                    "generatedAt": utcnow(),
                    "status": "restarting_stale_worker",
                    "currentPid": current_pid,
                    "restarts": restarts,
                    "deadline": deadline.isoformat(),
                })
                current_pid = 0
            else:
                write_watchdog_state(watchdog_state_path, {
                    "generatedAt": utcnow(),
                    "status": "worker_running",
                    "currentPid": current_pid,
                    "restarts": restarts,
                    "deadline": deadline.isoformat(),
                    "lastProgressAt": progress.get("generatedAt"),
                })
                time.sleep(max(5, args.poll_seconds))
                continue

        fresh_start = args.fresh and not (args.results_root / "results.jsonl").exists()
        current_pid = launch_worker(args, fresh=fresh_start)
        restarts += 1
        write_watchdog_state(watchdog_state_path, {
            "generatedAt": utcnow(),
            "status": "worker_started",
            "currentPid": current_pid,
            "restarts": restarts,
            "deadline": deadline.isoformat(),
        })
        time.sleep(max(5, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
