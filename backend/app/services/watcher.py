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
from app.services.scanner import _resolve_scan_base_path, scan_folder, sync_document_from_filesystem


@dataclass
class FolderWatchStatus:
    folder_id: str
    folder_name: str
    active: bool
    watch_enabled: bool
    last_checked_at: str | None = None
    last_event_at: str | None = None
    last_scan_at: str | None = None
    last_error: str | None = None


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

        current_folder_ids = {folder.id for folder in folders}
        for folder_id in list(self._statuses.keys()):
            if folder_id not in current_folder_ids:
                await self._remove_folder(folder_id)

        for folder in folders:
            await self._sync_folder(folder)

    async def get_statuses(self) -> list[dict[str, str | bool | None]]:
        async with self._lock:
            statuses = sorted(self._statuses.values(), key=lambda status: status.folder_name.lower())
            return [asdict(status) for status in statuses]

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
                    await self.mark_scan_result(folder, error=None)
                except Exception as exc:
                    summary["errors"] += 1
                    await self.mark_scan_result(folder, error=str(exc))
            return summary

    async def mark_scan_result(self, folder: Folder, *, error: str | None) -> None:
        await self._update_status(folder, last_scan=error is None, error=error)

    async def _remove_folder(self, folder_id: str) -> None:
        await self._stop_folder_task(folder_id)
        async with self._lock:
            self._statuses.pop(folder_id, None)
            self._watched_paths.pop(folder_id, None)

    async def _sync_folder(self, folder: Folder) -> None:
        await self._update_status(folder)

        if not self._started:
            return

        if not folder.is_active or not folder.watch_enabled:
            await self._stop_folder_task(folder.id)
            return

        try:
            resolved_path = _resolve_scan_base_path(folder.path)
            if not resolved_path.exists() or not resolved_path.is_dir():
                raise ValueError(f"Path does not exist or is not a directory: {folder.path}")
        except Exception as exc:
            await self._stop_folder_task(folder.id)
            await self._update_status(folder, error=str(exc))
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
                return

            try:
                await scan_folder(folder, session)
                await self._update_status(folder, last_event=mark_event, last_scan=True, error=None)
            except Exception as exc:
                await self._update_status(folder, last_event=mark_event, error=str(exc))

    async def _sync_changed_paths(self, folder_id: str, changed_paths: set[Path]) -> None:
        async with async_session_maker() as session:
            folder = await session.get(Folder, folder_id)
            if folder is None:
                return
            if not folder.is_active or not folder.watch_enabled:
                return

            base_path = _resolve_scan_base_path(folder.path)
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
            )

    async def _mark_folder_error(self, folder_id: str, error: str) -> None:
        async with async_session_maker() as session:
            folder = await session.get(Folder, folder_id)
            if folder is not None:
                await self._update_status(folder, error=error)

    async def _update_status(
        self,
        folder: Folder,
        *,
        last_event: bool = False,
        last_scan: bool = False,
        error: str | None = None,
    ) -> None:
        async with self._lock:
            current = self._statuses.get(
                folder.id,
                FolderWatchStatus(
                    folder_id=folder.id,
                    folder_name=folder.name,
                    active=folder.is_active,
                    watch_enabled=folder.watch_enabled,
                ),
            )
            now_iso = _utcnow_iso()
            current.folder_name = folder.name
            current.active = folder.is_active
            current.watch_enabled = folder.watch_enabled
            current.last_checked_at = now_iso
            if last_event:
                current.last_event_at = now_iso
            if last_scan:
                current.last_scan_at = now_iso
            current.last_error = error
            self._statuses[folder.id] = current


folder_watcher = FolderWatcher()
