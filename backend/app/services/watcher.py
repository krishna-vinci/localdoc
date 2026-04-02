from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from watchfiles import DefaultFilter, awatch

from app.core.config import settings
from app.core.database import async_session_maker
from app.models.folder import Folder
from app.services.folder_runtime import (
    AVAILABILITY_AVAILABLE,
    UNSET,
    classify_error_state,
    ensure_folder_runtime_state,
    list_folder_runtime_rows,
    parse_scan_summary,
    sync_folder_runtime_configuration,
    update_folder_runtime_state,
)
from app.services.scanner import (
    resolve_folder_scan_base_path,
    scan_folder,
    sync_document_from_filesystem,
)


@dataclass
class FolderWatchStatus:
    folder_id: str
    folder_name: str
    folder_path: str
    active: bool
    watch_enabled: bool
    watch_state: str = "idle"
    availability_state: str = "unknown"
    last_checked_at: str | None = None
    last_event_at: str | None = None
    last_scan_at: str | None = None
    last_full_reconcile_at: str | None = None
    consecutive_error_count: int = 0
    last_error: str | None = None
    last_scan_summary: dict[str, int] | None = None
    degraded_since: str | None = None


def _utcnow_iso() -> str:
    return datetime.utcnow().isoformat()


class MarkdownWatchFilter(DefaultFilter):
    def __call__(self, change: object, path: str) -> bool:
        if not super().__call__(change, path):
            return False
        return path.endswith(".md") or path.endswith(".markdown")


class FolderWatcher:
    def __init__(self) -> None:
        self._started = False
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._stop_events: dict[str, asyncio.Event] = {}
        self._watched_paths: dict[str, str] = {}
        self._statuses: dict[str, FolderWatchStatus] = {}
        self._lock = asyncio.Lock()
        self._watch_filter = MarkdownWatchFilter()

    @property
    def is_started(self) -> bool:
        return self._started

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        await self.refresh_from_database()

    async def stop(self) -> None:
        self._started = False
        for folder_id in list(self._tasks.keys()):
            await self._stop_folder_task(folder_id)

    async def refresh_from_database(self) -> None:
        async with async_session_maker() as session:
            result = await session.execute(select(Folder).order_by(Folder.name.asc()))
            folders = result.scalars().all()
            for folder in folders:
                await ensure_folder_runtime_state(session, folder)
                await sync_folder_runtime_configuration(session, folder)
            await session.commit()

        current_folder_ids = {folder.id for folder in folders}
        for folder_id in list(self._statuses.keys()):
            if folder_id not in current_folder_ids:
                await self._remove_folder(folder_id)

        for folder in folders:
            await self._sync_folder(folder)

    async def get_statuses(self) -> list[dict[str, object | None]]:
        async with async_session_maker() as session:
            rows = await list_folder_runtime_rows(session)
            payload: list[dict[str, object | None]] = []

            for folder, state in rows:
                if state is None:
                    continue
                payload.append(
                    asdict(
                        FolderWatchStatus(
                            folder_id=folder.id,
                            folder_name=folder.name,
                            folder_path=folder.path,
                            active=folder.is_active,
                            watch_enabled=folder.watch_enabled,
                            watch_state=state.watch_state,
                            availability_state=state.availability_state,
                            last_checked_at=state.last_checked_at.isoformat() if state.last_checked_at else None,
                            last_event_at=state.last_event_at.isoformat() if state.last_event_at else None,
                            last_scan_at=(
                                state.last_successful_scan_at.isoformat()
                                if state.last_successful_scan_at
                                else None
                            ),
                            last_full_reconcile_at=(
                                state.last_full_reconcile_at.isoformat()
                                if state.last_full_reconcile_at
                                else None
                            ),
                            consecutive_error_count=state.consecutive_error_count,
                            last_error=state.last_error,
                            last_scan_summary=parse_scan_summary(state.last_scan_summary),
                            degraded_since=state.degraded_since.isoformat() if state.degraded_since else None,
                        )
                    )
                )

            return payload

    async def force_rescan_all(self) -> dict[str, int]:
        async with async_session_maker() as session:
            result = await session.execute(select(Folder).where(Folder.is_active.is_(True)))
            folders = result.scalars().all()
            summary = {"indexed": 0, "skipped": 0, "errors": 0, "folders": len(folders)}
            for folder in folders:
                try:
                    scan_summary = await scan_folder(folder, session)
                    summary["indexed"] += scan_summary["indexed"]
                    summary["skipped"] += scan_summary["skipped"]
                    summary["errors"] += scan_summary["errors"]
                    await self.mark_scan_result(
                        folder,
                        error=None,
                        scan_summary=scan_summary,
                        full_reconcile=True,
                    )
                except Exception as exc:
                    summary["errors"] += 1
                    await self.mark_scan_result(folder, error=str(exc), full_reconcile=True)
            return summary

    async def mark_scan_result(
        self,
        folder: Folder,
        *,
        error: str | None,
        scan_summary: dict[str, int] | None = None,
        full_reconcile: bool = False,
    ) -> None:
        watch_state = None
        availability_state = None
        if error:
            watch_state, availability_state = classify_error_state(error)
        await self._update_status(
            folder,
            last_scan=error is None,
            full_reconcile=full_reconcile,
            error=error,
            scan_summary=scan_summary,
            watch_state=watch_state,
            availability_state=availability_state,
        )

    async def _remove_folder(self, folder_id: str) -> None:
        await self._stop_folder_task(folder_id)
        async with self._lock:
            self._statuses.pop(folder_id, None)
            self._watched_paths.pop(folder_id, None)

    async def _sync_folder(self, folder: Folder) -> None:
        await self._update_status(
            folder,
            watch_state="disabled" if not folder.is_active or not folder.watch_enabled else None,
        )

        if not self._started:
            return

        if not folder.is_active or not folder.watch_enabled:
            await self._stop_folder_task(folder.id)
            await self._update_status(folder, watch_state="disabled", error=None)
            return

        try:
            resolved_path = resolve_folder_scan_base_path(folder)
            if not resolved_path.exists() or not resolved_path.is_dir():
                raise ValueError(f"Path does not exist or is not a directory: {folder.path}")
        except Exception as exc:
            await self._stop_folder_task(folder.id)
            watch_state, availability_state = classify_error_state(str(exc))
            await self._update_status(
                folder,
                error=str(exc),
                watch_state=watch_state,
                availability_state=availability_state,
            )
            return

        current_path = self._watched_paths.get(folder.id)
        if folder.id in self._tasks and current_path == str(resolved_path):
            return

        await self._stop_folder_task(folder.id)
        stop_event = asyncio.Event()
        task = asyncio.create_task(
            self._watch_folder(folder.id, str(resolved_path), stop_event),
            name=f"folder-watcher-{folder.id}",
        )
        async with self._lock:
            self._stop_events[folder.id] = stop_event
            self._tasks[folder.id] = task
            self._watched_paths[folder.id] = str(resolved_path)

    async def _stop_folder_task(self, folder_id: str) -> None:
        async with self._lock:
            stop_event = self._stop_events.pop(folder_id, None)
            task = self._tasks.pop(folder_id, None)
            self._watched_paths.pop(folder_id, None)

        if stop_event is not None:
            stop_event.set()
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _watch_folder(self, folder_id: str, resolved_path: str, stop_event: asyncio.Event) -> None:
        try:
            await self._scan_folder(folder_id, mark_event=False)
            debounce_ms = max(int(settings.WATCHDEBOUNCE_SECONDS * 1000), 100)
            async for changes in awatch(
                resolved_path,
                watch_filter=self._watch_filter,
                debounce=debounce_ms,
                stop_event=stop_event,
                force_polling=False,
            ):
                if not changes:
                    continue
                changed_paths = {Path(path) for _, path in changes}
                await self._sync_changed_paths(folder_id, changed_paths)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self._mark_folder_error(folder_id, str(exc))

    async def _scan_folder(self, folder_id: str, *, mark_event: bool) -> None:
        async with async_session_maker() as session:
            folder = await session.get(Folder, folder_id)
            if folder is None:
                return
            if not folder.is_active or not folder.watch_enabled:
                await self._update_status(folder, watch_state="disabled", error=None)
                return

            try:
                scan_summary = await scan_folder(
                    folder,
                    session,
                    allow_empty_file_overwrite=False,
                )
                await self._update_status(
                    folder,
                    last_event=mark_event,
                    last_scan=True,
                    full_reconcile=True,
                    error=None,
                    scan_summary=scan_summary,
                    watch_state="watching",
                    availability_state=AVAILABILITY_AVAILABLE,
                )
            except Exception as exc:
                watch_state, availability_state = classify_error_state(str(exc))
                await self._update_status(
                    folder,
                    last_event=mark_event,
                    error=str(exc),
                    watch_state=watch_state,
                    availability_state=availability_state,
                )

    async def _sync_changed_paths(self, folder_id: str, changed_paths: set[Path]) -> None:
        async with async_session_maker() as session:
            folder = await session.get(Folder, folder_id)
            if folder is None:
                return
            if not folder.is_active or not folder.watch_enabled:
                return

            base_path = resolve_folder_scan_base_path(folder)
            indexed = 0
            skipped = 0
            errors = 0

            for changed_path in changed_paths:
                try:
                    if changed_path.is_relative_to(base_path):
                        summary = await sync_document_from_filesystem(
                            folder,
                            session,
                            absolute_path=changed_path,
                        )
                        indexed += summary["indexed"]
                        skipped += summary["skipped"]
                        errors += summary["errors"]
                except Exception:
                    errors += 1

            await self._update_status(
                folder,
                last_event=True,
                last_scan=indexed > 0 or skipped > 0,
                error=None if errors == 0 else f"Failed to sync {errors} changed file(s)",
                scan_summary={"indexed": indexed, "skipped": skipped, "errors": errors},
                watch_state="watching" if errors == 0 else "degraded",
                availability_state=AVAILABILITY_AVAILABLE,
            )

    async def _mark_folder_error(self, folder_id: str, error: str) -> None:
        async with async_session_maker() as session:
            folder = await session.get(Folder, folder_id)
            if folder is not None:
                watch_state, availability_state = classify_error_state(error)
                await self._update_status(
                    folder,
                    error=error,
                    watch_state=watch_state,
                    availability_state=availability_state,
                )

    async def _update_status(
        self,
        folder: Folder,
        *,
        last_event: bool = False,
        last_scan: bool = False,
        full_reconcile: bool = False,
        error: str | None | object = UNSET,
        scan_summary: dict[str, int] | None = None,
        watch_state: str | None = None,
        availability_state: str | None = None,
    ) -> None:
        async with self._lock:
            current = self._statuses.get(
                folder.id,
                FolderWatchStatus(
                    folder_id=folder.id,
                    folder_name=folder.name,
                    folder_path=folder.path,
                    active=folder.is_active,
                    watch_enabled=folder.watch_enabled,
                ),
            )
            now_iso = _utcnow_iso()
            current.folder_name = folder.name
            current.folder_path = folder.path
            current.active = folder.is_active
            current.watch_enabled = folder.watch_enabled
            if watch_state is not None:
                current.watch_state = watch_state
            if availability_state is not None:
                current.availability_state = availability_state
            current.last_checked_at = now_iso
            if last_event:
                current.last_event_at = now_iso
            if last_scan:
                current.last_scan_at = now_iso
            if full_reconcile:
                current.last_full_reconcile_at = now_iso
            if scan_summary is not None:
                current.last_scan_summary = scan_summary
            if error is not UNSET:
                current.last_error = error
            if isinstance(error, str) and error:
                current.consecutive_error_count += 1
                current.degraded_since = current.degraded_since or now_iso
            elif error is None:
                current.consecutive_error_count = 0
                current.degraded_since = None
            self._statuses[folder.id] = current

        async with async_session_maker() as session:
            persisted_folder = await session.get(Folder, folder.id)
            if persisted_folder is None:
                return
            await update_folder_runtime_state(
                session,
                persisted_folder,
                watch_state=watch_state,
                availability_state=availability_state,
                last_event=last_event,
                last_scan=last_scan,
                full_reconcile=full_reconcile,
                error=error,
                scan_summary=scan_summary,
            )
            await session.commit()


folder_watcher = FolderWatcher()
