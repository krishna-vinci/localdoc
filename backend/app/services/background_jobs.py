from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Final

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.background_job import BackgroundJob
from app.models.folder import Folder
from app.services.folder_runtime import (
    AVAILABILITY_AVAILABLE,
    AVAILABILITY_MISSING,
    WATCH_STATE_FAILED,
    classify_error_state,
    update_folder_runtime_state,
)
from app.services.scanner import (
    resolve_folder_scan_base_path,
    scan_folder,
    sync_document_from_filesystem,
)
from app.services.system_backup import (
    build_backup_payload,
    read_backup_file,
    restore_backup_payload,
    validate_backup_payload,
    write_backup_file,
)

JOB_STATUS_QUEUED: Final = "queued"
JOB_STATUS_RUNNING: Final = "running"
JOB_STATUS_SUCCEEDED: Final = "succeeded"
JOB_STATUS_FAILED: Final = "failed"
JOB_STATUS_CANCELLED: Final = "cancelled"

JOB_TYPE_REBUILD_FOLDER: Final = "rebuild_folder"
JOB_TYPE_REBUILD_ALL: Final = "rebuild_all"
JOB_TYPE_DRIFT_CHECK: Final = "drift_check"
JOB_TYPE_STARTUP_RECONCILE: Final = "startup_reconcile"
JOB_TYPE_CREATE_BACKUP: Final = "create_backup"
JOB_TYPE_RESTORE_BACKUP: Final = "restore_backup"
JOB_TYPE_DOCUMENT_RECOVERY_SYNC: Final = "document_recovery_sync"


def _utcnow() -> datetime:
    return datetime.utcnow()


def _serialize_json(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


def _deserialize_json(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def serialize_background_job(job: BackgroundJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "target_type": job.target_type,
        "target_id": job.target_id,
        "payload": _deserialize_json(job.payload),
        "summary": _deserialize_json(job.summary),
        "error": job.error,
        "progress_current": job.progress_current,
        "progress_total": job.progress_total,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "updated_at": job.updated_at,
    }


async def create_background_job(
    db: AsyncSession,
    *,
    job_type: str,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict[str, Any] | None = None,
    dedupe: bool = False,
) -> BackgroundJob:
    if dedupe:
        query = select(BackgroundJob).where(
            BackgroundJob.job_type == job_type,
            BackgroundJob.status.in_([JOB_STATUS_QUEUED, JOB_STATUS_RUNNING]),
        )
        if target_type is None:
            query = query.where(BackgroundJob.target_type.is_(None))
        else:
            query = query.where(BackgroundJob.target_type == target_type)
        if target_id is None:
            query = query.where(BackgroundJob.target_id.is_(None))
        else:
            query = query.where(BackgroundJob.target_id == target_id)

        existing = (
            await db.execute(query.order_by(BackgroundJob.created_at.asc()).limit(1))
        ).scalar_one_or_none()
        if existing is not None:
            return existing

    job = BackgroundJob(
        job_type=job_type,
        status=JOB_STATUS_QUEUED,
        target_type=target_type,
        target_id=target_id,
        payload=_serialize_json(payload),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def list_background_jobs(
    db: AsyncSession,
    *,
    limit: int = 50,
    status: str | None = None,
) -> list[BackgroundJob]:
    query: Select[tuple[BackgroundJob]] = select(BackgroundJob).order_by(BackgroundJob.created_at.desc())
    if status:
        query = query.where(BackgroundJob.status == status)
    query = query.limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_background_job(db: AsyncSession, job_id: str) -> BackgroundJob | None:
    return await db.get(BackgroundJob, job_id)


async def update_background_job_progress(
    job_id: str,
    *,
    progress_current: int,
    progress_total: int,
    summary: dict[str, Any] | None = None,
) -> None:
    async with async_session_maker() as db:
        job = await db.get(BackgroundJob, job_id)
        if job is None:
            return
        job.progress_current = progress_current
        job.progress_total = progress_total
        if summary is not None:
            job.summary = _serialize_json(summary)
        await db.commit()


async def enqueue_document_recovery_sync(folder_id: str, absolute_path: Path) -> None:
    async with async_session_maker() as db:
        await create_background_job(
            db,
            job_type=JOB_TYPE_DOCUMENT_RECOVERY_SYNC,
            target_type="document_path",
            target_id=str(absolute_path),
            payload={"folder_id": folder_id, "absolute_path": str(absolute_path)},
            dedupe=True,
        )


async def enqueue_startup_reconcile() -> None:
    async with async_session_maker() as db:
        await create_background_job(
            db,
            job_type=JOB_TYPE_STARTUP_RECONCILE,
            target_type="system",
            target_id="startup-reconcile",
            payload={"scope": "active-folders"},
            dedupe=True,
        )


async def _mark_job_succeeded(job_id: str, summary: dict[str, Any] | None) -> None:
    async with async_session_maker() as db:
        job = await db.get(BackgroundJob, job_id)
        if job is None:
            return
        job.status = JOB_STATUS_SUCCEEDED
        job.summary = _serialize_json(summary)
        if job.progress_total == 0:
            job.progress_total = 1
        if job.progress_current == 0:
            job.progress_current = job.progress_total
        job.finished_at = _utcnow()
        await db.commit()


async def _mark_job_failed(job_id: str, error: str) -> None:
    async with async_session_maker() as db:
        job = await db.get(BackgroundJob, job_id)
        if job is None:
            return
        job.status = JOB_STATUS_FAILED
        job.error = error
        job.finished_at = _utcnow()
        await db.commit()


async def _reset_running_jobs() -> None:
    async with async_session_maker() as db:
        result = await db.execute(
            select(BackgroundJob).where(BackgroundJob.status == JOB_STATUS_RUNNING)
        )
        jobs = result.scalars().all()
        for job in jobs:
            job.status = JOB_STATUS_QUEUED
            job.started_at = None
            job.finished_at = None
            job.error = "Requeued after backend restart before completion"
        if jobs:
            await db.commit()


async def _handle_rebuild_folder(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    folder_id = str(payload["folder_id"])
    async with async_session_maker() as db:
        folder = await db.get(Folder, folder_id)
        if folder is None:
            raise ValueError("Folder not found")

        try:
            summary = await scan_folder(folder, db, allow_mass_delete=True)
            await update_folder_runtime_state(
                db,
                folder,
                watch_state="watching" if folder.is_active and folder.watch_enabled else "disabled",
                availability_state=AVAILABILITY_AVAILABLE,
                last_scan=True,
                full_reconcile=True,
                error=None,
                scan_summary=summary,
            )
            await db.commit()
            await update_background_job_progress(job_id, progress_current=1, progress_total=1, summary=summary)
            return {"folder_id": folder.id, "folder_name": folder.name, **summary}
        except Exception as exc:
            watch_state, availability_state = classify_error_state(str(exc))
            await update_folder_runtime_state(
                db,
                folder,
                watch_state=watch_state,
                availability_state=availability_state,
                error=str(exc),
            )
            await db.commit()
            raise


async def _handle_rebuild_all(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    async with async_session_maker() as db:
        result = await db.execute(select(Folder).where(Folder.is_active.is_(True)).order_by(Folder.name.asc()))
        folders = result.scalars().all()

    total = len(folders)
    summary: dict[str, Any] = {"folders": total, "indexed": 0, "skipped": 0, "errors": 0}
    await update_background_job_progress(job_id, progress_current=0, progress_total=max(total, 1))

    for index, folder_stub in enumerate(folders, start=1):
        async with async_session_maker() as db:
            folder = await db.get(Folder, folder_stub.id)
            if folder is None:
                summary["errors"] += 1
                await update_background_job_progress(
                    job_id,
                    progress_current=index,
                    progress_total=max(total, 1),
                    summary=summary,
                )
                continue

            try:
                folder_summary = await scan_folder(folder, db, allow_mass_delete=True)
                await update_folder_runtime_state(
                    db,
                    folder,
                    watch_state="watching" if folder.is_active and folder.watch_enabled else "disabled",
                    availability_state=AVAILABILITY_AVAILABLE,
                    last_scan=True,
                    full_reconcile=True,
                    error=None,
                    scan_summary=folder_summary,
                )
                await db.commit()
                summary["indexed"] += folder_summary["indexed"]
                summary["skipped"] += folder_summary["skipped"]
                summary["errors"] += folder_summary["errors"]
            except Exception as exc:
                watch_state, availability_state = classify_error_state(str(exc))
                await update_folder_runtime_state(
                    db,
                    folder,
                    watch_state=watch_state,
                    availability_state=availability_state,
                    error=str(exc),
                )
                await db.commit()
                summary["errors"] += 1

        await update_background_job_progress(
            job_id,
            progress_current=index,
            progress_total=max(total, 1),
            summary=summary,
        )

    return summary


async def _handle_drift_check(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    async with async_session_maker() as db:
        result = await db.execute(select(Folder).where(Folder.is_active.is_(True)).order_by(Folder.name.asc()))
        folders = result.scalars().all()

    total = len(folders)
    summary: dict[str, Any] = {"folders": total, "available": 0, "missing": 0, "errors": 0}
    await update_background_job_progress(job_id, progress_current=0, progress_total=max(total, 1))

    for index, folder_stub in enumerate(folders, start=1):
        async with async_session_maker() as db:
            folder = await db.get(Folder, folder_stub.id)
            if folder is None:
                summary["errors"] += 1
                await update_background_job_progress(
                    job_id,
                    progress_current=index,
                    progress_total=max(total, 1),
                    summary=summary,
                )
                continue

            try:
                base_path = resolve_folder_scan_base_path(folder)
                exists = await asyncio.to_thread(base_path.exists)
                is_dir = await asyncio.to_thread(base_path.is_dir)
                if exists and is_dir:
                    await update_folder_runtime_state(
                        db,
                        folder,
                        watch_state="watching" if folder.is_active and folder.watch_enabled else "disabled",
                        availability_state=AVAILABILITY_AVAILABLE,
                        error=None,
                    )
                    summary["available"] += 1
                else:
                    error = f"Path does not exist or is not a directory: {folder.path}"
                    await update_folder_runtime_state(
                        db,
                        folder,
                        watch_state=WATCH_STATE_FAILED,
                        availability_state="missing",
                        error=error,
                    )
                    summary["missing"] += 1
                await db.commit()
            except Exception as exc:
                watch_state, availability_state = classify_error_state(str(exc))
                await update_folder_runtime_state(
                    db,
                    folder,
                    watch_state=watch_state,
                    availability_state=availability_state,
                    error=str(exc),
                )
                await db.commit()
                summary["errors"] += 1

        await update_background_job_progress(
            job_id,
            progress_current=index,
            progress_total=max(total, 1),
            summary=summary,
        )

    return summary


async def _handle_startup_reconcile(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    async with async_session_maker() as db:
        result = await db.execute(select(Folder).where(Folder.is_active.is_(True)).order_by(Folder.name.asc()))
        folders = result.scalars().all()

    total = len(folders)
    summary: dict[str, Any] = {
        "folders": total,
        "verified": 0,
        "scanned_manual": 0,
        "missing": 0,
        "errors": 0,
    }
    await update_background_job_progress(job_id, progress_current=0, progress_total=max(total, 1))

    for index, folder_stub in enumerate(folders, start=1):
        async with async_session_maker() as db:
            folder = await db.get(Folder, folder_stub.id)
            if folder is None:
                summary["errors"] += 1
                await update_background_job_progress(
                    job_id,
                    progress_current=index,
                    progress_total=max(total, 1),
                    summary=summary,
                )
                continue

            try:
                base_path = resolve_folder_scan_base_path(folder)
                exists = await asyncio.to_thread(base_path.exists)
                is_dir = await asyncio.to_thread(base_path.is_dir)
                if not exists or not is_dir:
                    error = f"Path does not exist or is not a directory: {folder.path}"
                    await update_folder_runtime_state(
                        db,
                        folder,
                        watch_state=WATCH_STATE_FAILED,
                        availability_state=AVAILABILITY_MISSING,
                        error=error,
                    )
                    summary["missing"] += 1
                elif folder.watch_enabled:
                    await update_folder_runtime_state(
                        db,
                        folder,
                        watch_state="watching",
                        availability_state=AVAILABILITY_AVAILABLE,
                        full_reconcile=True,
                        error=None,
                    )
                    summary["verified"] += 1
                else:
                    folder_summary = await scan_folder(folder, db, allow_mass_delete=False)
                    await update_folder_runtime_state(
                        db,
                        folder,
                        watch_state="disabled",
                        availability_state=AVAILABILITY_AVAILABLE,
                        last_scan=True,
                        full_reconcile=True,
                        error=None,
                        scan_summary=folder_summary,
                    )
                    summary["verified"] += 1
                    summary["scanned_manual"] += 1
                await db.commit()
            except Exception as exc:
                watch_state, availability_state = classify_error_state(str(exc))
                await update_folder_runtime_state(
                    db,
                    folder,
                    watch_state=watch_state,
                    availability_state=availability_state,
                    error=str(exc),
                )
                await db.commit()
                summary["errors"] += 1

        await update_background_job_progress(
            job_id,
            progress_current=index,
            progress_total=max(total, 1),
            summary=summary,
        )

    return summary


async def _handle_create_backup(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    async with async_session_maker() as db:
        backup_payload = await build_backup_payload(db)

    summary = await write_backup_file(backup_payload)
    await update_background_job_progress(job_id, progress_current=1, progress_total=1, summary=summary)
    return summary


async def _handle_restore_backup(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    backup_name = str(payload["backup_name"])
    backup_payload = await read_backup_file(backup_name)
    validation = validate_backup_payload(backup_payload)
    if not validation["valid"]:
        raise ValueError("Backup validation failed before restore")

    from app.services.watcher import folder_watcher

    watcher_was_started = folder_watcher.is_started
    if watcher_was_started:
        await folder_watcher.stop()

    try:
        async with async_session_maker() as db:
            restore_summary = await restore_backup_payload(db, backup_payload)
        if watcher_was_started:
            await folder_watcher.start()
        await enqueue_startup_reconcile()
        restore_summary["backup_name"] = backup_name
        await update_background_job_progress(
            job_id,
            progress_current=1,
            progress_total=1,
            summary=restore_summary,
        )
        return restore_summary
    finally:
        if watcher_was_started and not folder_watcher.is_started:
            await folder_watcher.start()


async def _handle_document_recovery_sync(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    folder_id = str(payload["folder_id"])
    absolute_path = Path(str(payload["absolute_path"]))
    async with async_session_maker() as db:
        folder = await db.get(Folder, folder_id)
        if folder is None:
            raise ValueError("Folder not found")

        summary = await sync_document_from_filesystem(folder, db, absolute_path=absolute_path)
        await update_folder_runtime_state(
            db,
            folder,
            watch_state="watching" if folder.is_active and folder.watch_enabled else "disabled",
            availability_state=AVAILABILITY_AVAILABLE,
            last_scan=summary["errors"] == 0,
            error=None if summary["errors"] == 0 else "Document recovery sync failed",
            scan_summary=summary,
        )
        await db.commit()
        await update_background_job_progress(job_id, progress_current=1, progress_total=1, summary=summary)
        return {"folder_id": folder.id, "absolute_path": str(absolute_path), **summary}


class BackgroundJobRunner:
    def __init__(self) -> None:
        self._started = False
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    @property
    def is_started(self) -> bool:
        return self._started

    async def start(self) -> None:
        if self._started:
            return
        await _reset_running_jobs()
        self._started = True
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="background-job-runner")

    async def stop(self) -> None:
        self._started = False
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            processed = await self._run_next_job()
            if not processed:
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass

    async def _run_next_job(self) -> bool:
        async with async_session_maker() as db:
            result = await db.execute(
                select(BackgroundJob)
                .where(BackgroundJob.status == JOB_STATUS_QUEUED)
                .order_by(BackgroundJob.created_at.asc())
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            queued_job = result.scalar_one_or_none()

            if queued_job is None:
                return False

            queued_job.status = JOB_STATUS_RUNNING
            queued_job.started_at = _utcnow()
            queued_job.finished_at = None
            queued_job.error = None
            await db.commit()
            await db.refresh(queued_job)

        claimed = queued_job

        payload = _deserialize_json(claimed.payload) or {}

        try:
            if claimed.job_type == JOB_TYPE_REBUILD_FOLDER:
                summary = await _handle_rebuild_folder(claimed.id, payload)
            elif claimed.job_type == JOB_TYPE_REBUILD_ALL:
                summary = await _handle_rebuild_all(claimed.id, payload)
            elif claimed.job_type == JOB_TYPE_DRIFT_CHECK:
                summary = await _handle_drift_check(claimed.id, payload)
            elif claimed.job_type == JOB_TYPE_STARTUP_RECONCILE:
                summary = await _handle_startup_reconcile(claimed.id, payload)
            elif claimed.job_type == JOB_TYPE_CREATE_BACKUP:
                summary = await _handle_create_backup(claimed.id, payload)
            elif claimed.job_type == JOB_TYPE_RESTORE_BACKUP:
                summary = await _handle_restore_backup(claimed.id, payload)
            elif claimed.job_type == JOB_TYPE_DOCUMENT_RECOVERY_SYNC:
                summary = await _handle_document_recovery_sync(claimed.id, payload)
            else:
                raise ValueError(f"Unsupported job type: {claimed.job_type}")
            await _mark_job_succeeded(claimed.id, summary)
        except Exception as exc:  # noqa: BLE001
            await _mark_job_failed(claimed.id, str(exc))
        return True


background_job_runner = BackgroundJobRunner()
