"""Ingest master: spawns worker threads at runtime according to WorkerPlan."""

from __future__ import annotations

import os
import socket
import threading
from typing import Any

from app.core.config import settings
from app.core.database import engine
from app.services.ingest_job_service import (
    count_claimable_jobs,
    reclaim_stale_processing_jobs,
)
from sqlmodel import Session
from app.services.ingest_worker_plan import WorkerPlan, compute_worker_plan


class IngestWorkerPool:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._threads: dict[str, threading.Thread] = {}
        self._plan: WorkerPlan | None = None
        self._host = socket.gethostname()
        self._pid = os.getpid()
        self._next_index = 0

    @property
    def plan(self) -> WorkerPlan | None:
        return self._plan

    def master_start(self, plan: WorkerPlan | None = None) -> WorkerPlan:
        """Apply plan and create initial worker threads."""
        reclaimed = 0
        with Session(engine) as db:
            reclaimed = reclaim_stale_processing_jobs(db)
            if reclaimed:
                print(
                    f"[ingest-master] re-queued {reclaimed} stale processing job(s)"
                )

        if settings.INGEST.PRELOAD_EMBED_MODEL:
            try:
                from app.services.vector_service import preload_embedding_model

                preload_embedding_model()
                print("[embed] model ready")
            except Exception as exc:
                print(f"[embed] preload failed (will retry on first ingest): {exc}")

        if not settings.INGEST.ENABLE_WORKER_POOL:
            disabled = WorkerPlan(
                max_parallel=0,
                initial_workers=0,
                environment=settings.ENVIRONMENT,
                cpu_count=os.cpu_count() or 1,
                memory_budget_gb=float(settings.INGEST.WORKER_MEMORY_BUDGET_GB or 0),
                reasons=("ENABLE_WORKER_POOL=false",),
            )
            print("[ingest-master] worker pool disabled")
            self._plan = disabled
            return disabled

        resolved = plan or compute_worker_plan()
        self._plan = resolved
        if resolved.max_parallel <= 0:
            print("[ingest-master] worker pool not started (max_parallel=0)")
            return resolved

        print(
            f"[ingest-master] plan max_parallel={resolved.max_parallel} "
            f"initial={resolved.initial_workers} env={resolved.environment} "
            f"reasons={list(resolved.reasons)}"
        )
        self._scale_to(resolved.initial_workers)
        if reclaimed:
            self.notify_work_available()
        return resolved

    def notify_work_available(self) -> None:
        """After enqueue / quick_ready: grow pool up to plan max based on queue depth."""
        with self._lock:
            if not self._plan or self._plan.max_parallel <= 0:
                return
            pending = count_claimable_jobs()
            target = min(
                self._plan.max_parallel,
                max(self._plan.initial_workers, pending),
            )
            self._scale_to_locked(target)

    def status(self) -> dict[str, Any]:
        with self._lock:
            alive = sum(1 for t in self._threads.values() if t.is_alive())
            return {
                "enabled": settings.INGEST.ENABLE_WORKER_POOL,
                "plan": self._plan.to_dict() if self._plan else None,
                "threads_alive": alive,
                "threads_started": len(self._threads),
                "claimable_jobs": count_claimable_jobs(),
            }

    def _scale_to(self, target: int) -> None:
        with self._lock:
            self._scale_to_locked(target)

    def _scale_to_locked(self, target: int) -> None:
        if not self._plan:
            return
        target = max(0, min(target, self._plan.max_parallel))
        while len(self._threads) < target:
            self._spawn_one_locked()
        # Do not kill idle threads — they sleep on poll and cost little; avoids churn.

    def _spawn_one_locked(self) -> None:
        from app.workers.ingest_worker import run_loop

        self._next_index += 1
        idx = self._next_index
        worker_id = f"{self._host}-{self._pid}-w{idx}"
        thread = threading.Thread(
            target=run_loop,
            args=(worker_id,),
            name=f"ingest-worker-{idx}",
            daemon=True,
        )
        self._threads[worker_id] = thread
        thread.start()
        print(f"[ingest-master] started worker thread {worker_id}")


_pool: IngestWorkerPool | None = None
_pool_lock = threading.Lock()


def get_ingest_worker_pool() -> IngestWorkerPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = IngestWorkerPool()
    return _pool
