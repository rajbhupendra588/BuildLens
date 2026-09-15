"""Master plan: how many parallel ingest worker threads to run (cap 5)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from app.core.config import Settings, settings

ABSOLUTE_MAX_PARALLEL = 5


@dataclass(frozen=True)
class WorkerPlan:
    """Runtime plan produced by the ingest master."""

    max_parallel: int
    initial_workers: int
    environment: str
    cpu_count: int
    memory_budget_gb: float
    reasons: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict:
        return {
            "max_parallel": self.max_parallel,
            "initial_workers": self.initial_workers,
            "environment": self.environment,
            "cpu_count": self.cpu_count,
            "memory_budget_gb": self.memory_budget_gb,
            "reasons": list(self.reasons),
        }


def compute_worker_plan(app_settings: Settings | None = None) -> WorkerPlan:
    """
    Production-oriented sizing:
    - Hard cap of 5 parallel workers
    - Explicit INGEST__WORKER_COUNT overrides (still capped)
    - ENVIRONMENT tier + CPU + optional memory budget
    """
    cfg = app_settings or settings
    ingest = cfg.INGEST
    env = cfg.ENVIRONMENT
    cpu = os.cpu_count() or 2
    mem_gb = float(ingest.WORKER_MEMORY_BUDGET_GB or 0.0)
    cap = min(max(1, ingest.WORKER_MAX_PARALLEL), ABSOLUTE_MAX_PARALLEL)
    reasons: list[str] = []

    if ingest.WORKER_COUNT is not None:
        requested = int(ingest.WORKER_COUNT)
        if requested <= 0:
            reasons.append("WORKER_COUNT=0 disables ingest worker pool")
            return WorkerPlan(
                max_parallel=0,
                initial_workers=0,
                environment=env,
                cpu_count=cpu,
                memory_budget_gb=mem_gb,
                reasons=tuple(reasons),
            )
        count = min(requested, cap)
        reasons.append(f"WORKER_COUNT={requested} (capped to {count})")
        return WorkerPlan(
            max_parallel=count,
            initial_workers=count,
            environment=env,
            cpu_count=cpu,
            memory_budget_gb=mem_gb,
            reasons=tuple(reasons),
        )

    max_parallel = cap
    if env == "development":
        max_parallel = min(cap, 2)
        initial = 1
        reasons.append("development: start 1 worker, max 2")
    elif env == "test":
        max_parallel = 1
        initial = 1
        reasons.append("test: single worker")
    else:
        # production (and unknown envs): use CPU, favor throughput without oversubscribing
        max_parallel = min(cap, max(2, min(ABSOLUTE_MAX_PARALLEL, cpu)))
        initial = min(2, max_parallel)
        reasons.append(
            f"production: cpu={cpu} → max_parallel={max_parallel}, initial={initial}"
        )

    if mem_gb > 0:
        if mem_gb < 3:
            max_parallel = 1
            initial = 1
            reasons.append(f"memory budget {mem_gb}GB < 3 → 1 worker")
        elif mem_gb < 6:
            max_parallel = min(max_parallel, 2)
            initial = min(initial, max_parallel)
            reasons.append(f"memory budget {mem_gb}GB < 6 → max 2 workers")
        elif mem_gb < 10:
            max_parallel = min(max_parallel, 3)
            initial = min(initial, max_parallel)
            reasons.append(f"memory budget {mem_gb}GB < 10 → max 3 workers")
        else:
            reasons.append(f"memory budget {mem_gb}GB supports up to {max_parallel} workers")

    initial = max(1, min(initial, max_parallel))
    return WorkerPlan(
        max_parallel=max_parallel,
        initial_workers=initial,
        environment=env,
        cpu_count=cpu,
        memory_budget_gb=mem_gb,
        reasons=tuple(reasons),
    )
