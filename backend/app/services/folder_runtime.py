from __future__ import annotations

import json
from datetime import datetime
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.folder import Folder
from app.models.folder_runtime_state import FolderRuntimeState

WATCH_STATE_IDLE: Final = "idle"
WATCH_STATE_WATCHING: Final = "watching"
WATCH_STATE_DISABLED: Final = "disabled"
WATCH_STATE_DEGRADED: Final = "degraded"
WATCH_STATE_FAILED: Final = "failed"

AVAILABILITY_UNKNOWN: Final = "unknown"
AVAILABILITY_AVAILABLE: Final = "available"
AVAILABILITY_MISSING: Final = "missing"
AVAILABILITY_PERMISSION_DENIED: Final = "permission_denied"
AVAILABILITY_SUSPECT_UNMOUNTED: Final = "suspect_unmounted"

UNSET: Final = object()


def _utcnow() -> datetime:
    return datetime.utcnow()


def _default_watch_state(folder: Folder) -> str:
    if not folder.is_active or not folder.watch_enabled:
        return WATCH_STATE_DISABLED
    return WATCH_STATE_IDLE


def _serialize_summary(summary: dict[str, int] | None) -> str | None:
    if summary is None:
        return None
    return json.dumps(summary)


def parse_scan_summary(value: str | None) -> dict[str, int] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    normalized: dict[str, int] = {}
    for key, item in parsed.items():
        if isinstance(key, str) and isinstance(item, int):
            normalized[key] = item
    return normalized or None


def classify_error_state(error: str) -> tuple[str, str]:
    lowered = error.lower()
    if "permission" in lowered:
        return WATCH_STATE_FAILED, AVAILABILITY_PERMISSION_DENIED
    if "does not exist" in lowered or "not a directory" in lowered:
        return WATCH_STATE_FAILED, AVAILABILITY_MISSING
    if "unmounted" in lowered:
        return WATCH_STATE_FAILED, AVAILABILITY_SUSPECT_UNMOUNTED
    return WATCH_STATE_DEGRADED, AVAILABILITY_AVAILABLE


async def ensure_folder_runtime_state(
    db: AsyncSession,
    folder: Folder,
) -> FolderRuntimeState:
    state = await db.get(FolderRuntimeState, folder.id)
    if state is not None:
        return state

    state = FolderRuntimeState(
        folder_id=folder.id,
        watch_state=_default_watch_state(folder),
        availability_state=AVAILABILITY_UNKNOWN,
        last_checked_at=_utcnow(),
    )
    db.add(state)
    await db.flush()
    return state


async def update_folder_runtime_state(
    db: AsyncSession,
    folder: Folder,
    *,
    watch_state: str | None = None,
    availability_state: str | None = None,
    last_event: bool = False,
    last_scan: bool = False,
    full_reconcile: bool = False,
    error: str | None | object = UNSET,
    scan_summary: dict[str, int] | None = None,
) -> FolderRuntimeState:
    state = await ensure_folder_runtime_state(db, folder)
    now = _utcnow()

    state.last_checked_at = now
    if watch_state is not None:
        state.watch_state = watch_state
    if availability_state is not None:
        state.availability_state = availability_state
    if last_event:
        state.last_event_at = now
    if last_scan:
        state.last_successful_scan_at = now
    if full_reconcile:
        state.last_full_reconcile_at = now
    if scan_summary is not None:
        state.last_scan_summary = _serialize_summary(scan_summary)

    if error is not UNSET:
        state.last_error = error
        if error:
            state.consecutive_error_count += 1
            if state.degraded_since is None:
                state.degraded_since = now
            if watch_state is None and state.watch_state not in {WATCH_STATE_DISABLED, WATCH_STATE_FAILED}:
                state.watch_state = WATCH_STATE_DEGRADED
        else:
            state.consecutive_error_count = 0
            state.degraded_since = None
            if watch_state is None:
                state.watch_state = _default_watch_state(folder)
            if availability_state is None:
                state.availability_state = AVAILABILITY_AVAILABLE

    db.add(state)
    await db.flush()
    return state


async def sync_folder_runtime_configuration(db: AsyncSession, folder: Folder) -> FolderRuntimeState:
    watch_state = _default_watch_state(folder)
    return await update_folder_runtime_state(
        db,
        folder,
        watch_state=watch_state,
        error=None if watch_state == WATCH_STATE_DISABLED else UNSET,
    )


async def list_folder_runtime_rows(
    db: AsyncSession,
) -> list[tuple[Folder, FolderRuntimeState | None]]:
    result = await db.execute(
        select(Folder, FolderRuntimeState)
        .outerjoin(FolderRuntimeState, FolderRuntimeState.folder_id == Folder.id)
        .order_by(Folder.name.asc())
    )
    return list(result.all())
