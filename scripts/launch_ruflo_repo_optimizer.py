#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RESULTS_ROOT = ROOT / "benchmark-results" / "ruflo-repo-optimizer-live"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch the Ruflo repo optimizer detached in the background.")
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
    parser.add_argument("--watchdog", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=30)
    parser.add_argument("--stale-seconds", type=int, default=600)
    parser.add_argument("--adopt-pid", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.results_root.mkdir(parents=True, exist_ok=True)
    stdout_path = args.results_root / ("watchdog.stdout.log" if args.watchdog else "stdout.log")
    stderr_path = args.results_root / ("watchdog.stderr.log" if args.watchdog else "stderr.log")
    target_script = "ruflo_repo_optimizer_watchdog.py" if args.watchdog else "ruflo_repo_optimizer.py"

    command = [
        sys.executable,
        str(ROOT / "scripts" / target_script),
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
    if args.fresh:
        command.append("--fresh")
    if args.watchdog:
        command.extend([
            "--poll-seconds",
            str(args.poll_seconds),
            "--stale-seconds",
            str(args.stale_seconds),
        ])
        if args.adopt_pid:
            command.extend(["--adopt-pid", str(args.adopt_pid)])
    if args.repos:
        command.extend(["--repos", *args.repos])

    stdout_handle = stdout_path.open("w", encoding="utf-8")
    stderr_handle = stderr_path.open("w", encoding="utf-8")
    kwargs = {"cwd": str(ROOT), "stdout": stdout_handle, "stderr": stderr_handle, "stdin": subprocess.DEVNULL, "close_fds": True}
    if sys.platform == "win32":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0
        kwargs["startupinfo"] = startupinfo
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW

    proc = subprocess.Popen(command, **kwargs)
    print(
        f"pid={proc.pid}\n"
        f"stdout={stdout_path}\n"
        f"stderr={stderr_path}\n"
        f"progress={args.results_root / 'progress.json'}\n"
        f"summary={args.results_root / 'summary.json'}\n"
        f"recommendations={args.results_root / 'recommended-settings.json'}\n"
        f"mode={'watchdog' if args.watchdog else 'worker'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
