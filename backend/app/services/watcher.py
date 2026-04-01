from __future__ import annotations

import asyncio
import os
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_maker
from app.models.folder import Folder
from app.services.scanner import _resolve_scan_base_path, scan_folder


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


def _snapshot_folder(folder_path: Path) -> tuple[tuple[str, int, int], ...]:
    items: list[tuple[str, int, int]] = []
    for root, dirs, files in os.walk(folder_path):
        dirs[:] = [directory for directory in dirs if not directory.startswith(".")]
        for file_name in files:
            if not (file_name.endswith(".md") or file_name.endswith(".markdown")):
                continue
            file_path = Path(root) / file_name
            stat = file_path.stat()
            items.append((str(file_path), stat.st_mtime_ns, stat.st_size))
    items.sort(key=lambda item: item[0])
    return tuple(items)


class FolderWatcher:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._snapshots: dict[str, tuple[tuple[str, int, int], ...]] = {}
        self._statuses: dict[str, FolderWatchStatus] = {}
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run(), name="folder-watcher")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def get_statuses(self) -> list[dict[str, str | bool | None]]:
        async with self._lock:
            return [asdict(status) for status in self._statuses.values()]

    async def force_rescan_all(self) -> dict[str, int]:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Folder).where(Folder.is_active.is_(True), Folder.watch_enabled.is_(True))
            )
            folders = result.scalars().all()
            summary = {"indexed": 0, "skipped": 0, "errors": 0, "folders": len(folders)}
            for folder in folders:
                scan_summary = await scan_folder(folder, session)
                summary["indexed"] += scan_summary["indexed"]
                summary["skipped"] += scan_summary["skipped"]
                summary["errors"] += scan_summary["errors"]
                await self._update_status(folder, last_event=True, last_scan=True)
            return summary

    async def _run(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                await asyncio.sleep(settings.WATCH_POLL_SECONDS)
            await asyncio.sleep(settings.WATCH_POLL_SECONDS)

    async def _tick(self) -> None:
        async with async_session_maker() as session:
            result = await session.execute(select(Folder))
            folders = result.scalars().all()

            active_folder_ids = {folder.id for folder in folders}
            async with self._lock:
                for folder_id in list(self._statuses.keys()):
                    if folder_id not in active_folder_ids:
                        self._statuses.pop(folder_id, None)
                        self._snapshots.pop(folder_id, None)

            for folder in folders:
                await self._update_status(folder)

                if not folder.is_active or not folder.watch_enabled:
                    continue

                try:
                    base_path = _resolve_scan_base_path(folder.path)
                    snapshot = await asyncio.to_thread(_snapshot_folder, base_path)
                except Exception as exc:
                    await self._update_status(folder, error=str(exc))
                    continue

                previous_snapshot = self._snapshots.get(folder.id)
                needs_initial_scan = previous_snapshot is None
                snapshot_changed = previous_snapshot is not None and previous_snapshot != snapshot
                self._snapshots[folder.id] = snapshot

                if not needs_initial_scan and not snapshot_changed:
                    continue

                try:
                    await scan_folder(folder, session)
                    await self._update_status(folder, last_event=True, last_scan=True, error=None)
                except Exception as exc:
                    await self._update_status(folder, error=str(exc))

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
            current.folder_name = folder.name
            current.active = folder.is_active
            current.watch_enabled = folder.watch_enabled
            current.last_checked_at = _utcnow_iso()
            if last_event:
                current.last_event_at = _utcnow_iso()
            if last_scan:
                current.last_scan_at = _utcnow_iso()
            current.last_error = error
            self._statuses[folder.id] = current


folder_watcher = FolderWatcher()
