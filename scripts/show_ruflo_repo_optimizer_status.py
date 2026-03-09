#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RESULTS_ROOT = ROOT / "benchmark-results" / "ruflo-repo-optimizer-live"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Show a concise status snapshot for the Ruflo repo optimizer.")
    parser.add_argument("--results-root", type=Path, default=DEFAULT_RESULTS_ROOT)
    return parser.parse_args()


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    args = parse_args()
    progress = load_json(args.results_root / "progress.json")
    summary = load_json(args.results_root / "summary.json")
    recommendations = load_json(args.results_root / "recommended-settings.json")
    watchdog = load_json(args.results_root / "watchdog.json")

    print(f"results_root={args.results_root}")
    if progress:
        print(f"generated_at={progress.get('generatedAt')}")
        print(f"cycle={progress.get('cycle')}")
        print(f"completed_runs={progress.get('completedRuns')}")
        print(f"queued_runs={progress.get('queuedRuns')}")
        print(f"active_jobs={len(progress.get('activeJobs') or [])}")
        if progress.get("pauseReason"):
            print(f"pause_reason={progress.get('pauseReason')}")
            print(f"paused_until={progress.get('pausedUntil')}")
        for job in (progress.get("activeJobs") or [])[:10]:
            print(f"  - {job.get('repo')} :: {job.get('variant')} ({job.get('projectType')})")
    if summary:
        print(f"total_runs={summary.get('totalRuns')}")
        print(f"clean_runs={summary.get('cleanRuns')}")
        print(f"exact_passes={summary.get('exactPasses')}")
        print(f"quality_passes={summary.get('qualityPasses')}")
        print(f"profile_passes={summary.get('profilePasses')}")
        print(f"config_passes={summary.get('configPasses')}")
        print(f"behavior_passes={summary.get('behaviorPasses')}")
        print(f"timeouts={summary.get('timeouts')}")
        print(f"limit_exceeded_runs={summary.get('limitExceededRuns')}")
        print(f"global_default_variant={summary.get('globalDefaultVariant')}")
    if recommendations:
        print("global_default=" + json.dumps(recommendations.get("globalDefault"), ensure_ascii=False))
        global_evidence = recommendations.get("globalEvidence") or {}
        if global_evidence:
            print(f"global_confidence={global_evidence.get('confidence')}")
            print(f"global_ranked_variants={','.join(global_evidence.get('rankedVariants') or [])}")
        by_runner_mode = recommendations.get("byRunnerMode") or {}
        for runner_mode, payload in sorted(by_runner_mode.items()):
            default = (payload or {}).get("globalDefault") or {}
            if default:
                print(f"runner_mode[{runner_mode}]={json.dumps(default, ensure_ascii=False)}")
    if watchdog:
        print(f"watchdog_status={watchdog.get('status')}")
        print(f"watchdog_pid={watchdog.get('currentPid')}")
        print(f"watchdog_restarts={watchdog.get('restarts')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
