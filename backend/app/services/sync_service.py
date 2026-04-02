from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import shutil
import tempfile
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.device import Device
from app.models.device_share import DeviceShare
from app.models.enrollment_token import EnrollmentToken
from app.models.folder import Folder
from app.models.share_file import ShareFile
from app.models.sync_batch import SyncBatch
from app.schemas.sync import DeviceResponse, DeviceShareResponse
from app.services.scanner import sync_document_from_filesystem


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _serialize_globs(values: list[str]) -> str | None:
    cleaned = [item.strip() for item in values if item.strip()]
    return json.dumps(cleaned) if cleaned else None


def _parse_globs(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, str)]


def get_replica_root() -> Path:
    if settings.REPLICA_ROOT:
        return Path(settings.REPLICA_ROOT)
    return Path(__file__).resolve().parents[2] / "replicas"


async def ensure_replica_root() -> Path:
    replica_root = get_replica_root()
    replica_root.mkdir(parents=True, exist_ok=True)
    return replica_root


def _normalize_relative_path(path: str) -> str:
    decoded_path = urllib.parse.unquote(path.strip())
    normalized = PurePosixPath(decoded_path)
    if not decoded_path or normalized.is_absolute() or ".." in normalized.parts:
        raise HTTPException(status_code=400, detail="Invalid relative path")
    normalized_str = normalized.as_posix()
    if normalized_str in {"", "."}:
        raise HTTPException(status_code=400, detail="Invalid relative path")
    return normalized_str


def _write_bytes_atomically(target_path: Path, content: bytes) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=target_path.parent,
        prefix=f".{target_path.name}.",
        suffix=".tmp",
        delete=False,
    ) as temp_file:
        temp_file.write(content)
        temp_file.flush()
        os.fsync(temp_file.fileno())
        temp_path = Path(temp_file.name)
    os.replace(temp_path, target_path)


def _ensure_target_within_storage(storage_root: Path, target_path: Path) -> None:
    resolved_root = storage_root.resolve()
    resolved_target = target_path.resolve(strict=False)
    if resolved_root not in resolved_target.parents and resolved_target != resolved_root:
        raise HTTPException(status_code=400, detail="Resolved target path escapes replica root")


def serialize_device(device: Device, *, share_count: int = 0) -> DeviceResponse:
    return DeviceResponse(
        id=device.id,
        display_name=device.display_name,
        hostname=device.hostname,
        platform=device.platform,
        agent_version=device.agent_version,
        status=device.status,
        last_seen_at=device.last_seen_at,
        approved_at=device.approved_at,
        revoked_at=device.revoked_at,
        created_at=device.created_at,
        updated_at=device.updated_at,
        share_count=share_count,
    )


def serialize_share(share: DeviceShare) -> DeviceShareResponse:
    return DeviceShareResponse(
        id=share.id,
        device_id=share.device_id,
        display_name=share.display_name,
        source_path=share.source_path,
        storage_path=share.storage_path,
        include_globs=_parse_globs(share.include_globs),
        exclude_globs=_parse_globs(share.exclude_globs),
        sync_enabled=share.sync_enabled,
        last_snapshot_generation=share.last_snapshot_generation,
        last_sync_at=share.last_sync_at,
        file_count=0,
        active_file_count=0,
        failed_batch_count=0,
        last_error=None,
        last_error_at=None,
        created_at=share.created_at,
        updated_at=share.updated_at,
    )


async def serialize_share_with_stats(db: AsyncSession, share: DeviceShare) -> DeviceShareResponse:
    total_files = int(
        (
            await db.execute(
                select(func.count()).select_from(ShareFile).where(ShareFile.share_id == share.id)
            )
        ).scalar_one()
    )
    active_files = int(
        (
            await db.execute(
                select(func.count())
                .select_from(ShareFile)
                .where(ShareFile.share_id == share.id, ShareFile.deleted_at.is_(None))
            )
        ).scalar_one()
    )
    failed_batches = int(
        (
            await db.execute(
                select(func.count())
                .select_from(SyncBatch)
                .where(SyncBatch.share_id == share.id, SyncBatch.status == "failed")
            )
        ).scalar_one()
    )
    latest_failed_batch = (
        await db.execute(
            select(SyncBatch)
            .where(SyncBatch.share_id == share.id, SyncBatch.status == "failed")
            .order_by(SyncBatch.received_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return DeviceShareResponse(
        id=share.id,
        device_id=share.device_id,
        display_name=share.display_name,
        source_path=share.source_path,
        storage_path=share.storage_path,
        include_globs=_parse_globs(share.include_globs),
        exclude_globs=_parse_globs(share.exclude_globs),
        sync_enabled=share.sync_enabled,
        last_snapshot_generation=share.last_snapshot_generation,
        last_sync_at=share.last_sync_at,
        file_count=total_files,
        active_file_count=active_files,
        failed_batch_count=failed_batches,
        last_error=latest_failed_batch.error if latest_failed_batch is not None else None,
        last_error_at=latest_failed_batch.received_at if latest_failed_batch is not None else None,
        created_at=share.created_at,
        updated_at=share.updated_at,
    )


async def create_enrollment_token(
    db: AsyncSession, *, note: str | None, expires_in_minutes: int
) -> tuple[EnrollmentToken, str]:
    raw_token = secrets.token_urlsafe(24)
    token = EnrollmentToken(
        token_hash=_hash_token(raw_token),
        note=note,
        expires_at=_utcnow() + timedelta(minutes=expires_in_minutes),
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return token, raw_token


async def enroll_device(
    db: AsyncSession,
    *,
    enrollment_token: str,
    display_name: str,
    hostname: str | None,
    platform: str | None,
    agent_version: str | None,
) -> tuple[Device, str]:
    token_hash = _hash_token(enrollment_token)
    token = (
        await db.execute(
            select(EnrollmentToken)
            .where(EnrollmentToken.token_hash == token_hash)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if token is None or token.used_at is not None or token.expires_at < _utcnow():
        raise HTTPException(status_code=401, detail="Invalid or expired enrollment token")

    device_token = secrets.token_urlsafe(32)
    device = Device(
        display_name=display_name,
        hostname=hostname,
        platform=platform,
        agent_version=agent_version,
        status="approved",
        auth_token_hash=_hash_token(device_token),
        last_seen_at=_utcnow(),
        approved_at=_utcnow(),
    )
    db.add(device)
    await db.flush()
    token.used_at = _utcnow()
    token.device_id = device.id
    await db.commit()
    await db.refresh(device)
    return device, device_token


async def get_authenticated_device(
    db: AsyncSession = Depends(get_db),
    x_localdocs_device_token: str | None = Header(default=None),
) -> Device:
    if not x_localdocs_device_token:
        raise HTTPException(status_code=401, detail="Missing device token")
    token_hash = _hash_token(x_localdocs_device_token)
    device = (
        await db.execute(select(Device).where(Device.auth_token_hash == token_hash))
    ).scalar_one_or_none()
    if device is None or device.status == "revoked":
        raise HTTPException(status_code=401, detail="Invalid or revoked device token")
    return device


async def touch_device_heartbeat(
    db: AsyncSession,
    device: Device,
    *,
    display_name: str | None,
    hostname: str | None,
    platform: str | None,
    agent_version: str | None,
) -> Device:
    if display_name:
        device.display_name = display_name
    if hostname is not None:
        device.hostname = hostname
    if platform is not None:
        device.platform = platform
    if agent_version is not None:
        device.agent_version = agent_version
    device.last_seen_at = _utcnow()
    await db.commit()
    await db.refresh(device)
    return device


async def ensure_remote_folder_for_share(db: AsyncSession, share: DeviceShare) -> Folder:
    folder = (
        await db.execute(select(Folder).where(Folder.source_share_id == share.id))
    ).scalar_one_or_none()
    if folder is None:
        folder = Folder(
            path=share.source_path,
            source_type="remote_mirror",
            source_path=share.source_path,
            storage_path=share.storage_path,
            source_share_id=share.id,
            is_read_only=True,
            name=share.display_name,
            project_id=None,
            is_active=True,
            watch_enabled=False,
            device_id=share.device_id,
        )
        db.add(folder)
    else:
        folder.path = share.source_path
        folder.source_type = "remote_mirror"
        folder.source_path = share.source_path
        folder.storage_path = share.storage_path
        folder.is_read_only = True
        folder.name = share.display_name
        folder.device_id = share.device_id
        folder.watch_enabled = False
    await db.flush()
    return folder


async def upsert_share(
    db: AsyncSession,
    *,
    device: Device,
    share_id: str | None,
    display_name: str,
    source_path: str,
    include_globs: list[str],
    exclude_globs: list[str],
    sync_enabled: bool,
) -> DeviceShare:
    if share_id:
        share = (
            await db.execute(
                select(DeviceShare).where(
                    DeviceShare.id == share_id, DeviceShare.device_id == device.id
                )
            )
        ).scalar_one_or_none()
        if share is None:
            raise HTTPException(status_code=404, detail="Share not found")
    else:
        share = None

    replica_root = await ensure_replica_root()

    if share is None:
        share = DeviceShare(
            device_id=device.id,
            display_name=display_name,
            source_path=source_path,
            storage_path="",
            include_globs=_serialize_globs(include_globs),
            exclude_globs=_serialize_globs(exclude_globs),
            sync_enabled=sync_enabled,
        )
        db.add(share)
        await db.flush()
        share.storage_path = str(replica_root / device.id / share.id)
    else:
        share.display_name = display_name
        share.source_path = source_path
        share.include_globs = _serialize_globs(include_globs)
        share.exclude_globs = _serialize_globs(exclude_globs)
        share.sync_enabled = sync_enabled

    Path(share.storage_path).mkdir(parents=True, exist_ok=True)
    await ensure_remote_folder_for_share(db, share)
    await db.commit()
    await db.refresh(share)
    return share


async def get_share_for_device(db: AsyncSession, *, device: Device, share_id: str) -> DeviceShare:
    share = (
        await db.execute(
            select(DeviceShare).where(DeviceShare.id == share_id, DeviceShare.device_id == device.id)
        )
    ).scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    if not share.sync_enabled or device.status == "revoked":
        raise HTTPException(status_code=403, detail="Share sync is disabled")
    return share


async def _get_or_create_batch(
    db: AsyncSession,
    *,
    device: Device,
    share: DeviceShare,
    external_batch_id: str,
    generation_id: str | None,
    batch_kind: str,
    entry_count: int,
) -> tuple[SyncBatch, bool]:
    existing = (
        await db.execute(
            select(SyncBatch).where(
                SyncBatch.device_id == device.id,
                SyncBatch.external_batch_id == external_batch_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.status == "failed":
            existing.status = "received"
            existing.error = None
            existing.summary = None
            existing.generation_id = generation_id
            existing.entry_count = entry_count
            existing.received_at = _utcnow()
            existing.applied_at = None
            await db.flush()
            return existing, True
        return existing, False

    batch = SyncBatch(
        device_id=device.id,
        share_id=share.id,
        external_batch_id=external_batch_id,
        generation_id=generation_id,
        batch_kind=batch_kind,
        status="received",
        entry_count=entry_count,
    )
    db.add(batch)
    await db.flush()
    return batch, True


async def register_snapshot_start(
    db: AsyncSession,
    *,
    device: Device,
    share: DeviceShare,
    batch_id: str,
    generation_id: str,
) -> SyncBatch:
    batch, created = await _get_or_create_batch(
        db,
        device=device,
        share=share,
        external_batch_id=batch_id,
        generation_id=generation_id,
        batch_kind="snapshot_start",
        entry_count=0,
    )
    if created:
        share.last_snapshot_generation = generation_id
        share.last_sync_at = _utcnow()
        batch.status = "applied"
        batch.applied_at = _utcnow()
        await db.commit()
        await db.refresh(batch)
    return batch


async def apply_sync_batch(
    db: AsyncSession,
    *,
    device: Device,
    share: DeviceShare,
    batch_id: str,
    generation_id: str | None,
    entries: list[dict[str, Any]],
) -> SyncBatch:
    batch, created = await _get_or_create_batch(
        db,
        device=device,
        share=share,
        external_batch_id=batch_id,
        generation_id=generation_id,
        batch_kind="entries",
        entry_count=len(entries),
    )
    if not created:
        return batch

    await db.commit()
    batch = await db.get(SyncBatch, batch.id)
    if batch is None:
        raise HTTPException(status_code=500, detail="Sync batch disappeared before apply")

    folder = await ensure_remote_folder_for_share(db, share)
    storage_root = Path(share.storage_path)
    applied_entries = 0

    try:
        for entry in entries:
            op = entry["op"]
            relative_path = _normalize_relative_path(entry["path"])
            target_path = storage_root / Path(relative_path)
            _ensure_target_within_storage(storage_root, target_path)
            share_file = (
                await db.execute(
                    select(ShareFile).where(
                        ShareFile.share_id == share.id,
                        ShareFile.relative_path == relative_path,
                    )
                )
            ).scalar_one_or_none()

            if share_file is None:
                share_file = ShareFile(share_id=share.id, relative_path=relative_path)
                db.add(share_file)

            if op == "upsert":
                if entry.get("content_b64") is None or entry.get("sha256") is None:
                    raise HTTPException(status_code=400, detail="Upsert entries require content and sha256")
                content = base64.b64decode(entry["content_b64"])
                if hashlib.sha256(content).hexdigest() != entry["sha256"]:
                    raise HTTPException(status_code=400, detail="Entry content hash mismatch")
                _write_bytes_atomically(target_path, content)
                share_file.content_hash = entry["sha256"]
                share_file.size_bytes = entry.get("size_bytes") or len(content)
                share_file.modified_time_ns = entry.get("mtime_ns")
                share_file.deleted_at = None
                share_file.last_seen_generation = generation_id
                share_file.last_received_at = _utcnow()
                await db.flush()
                await sync_document_from_filesystem(
                    folder,
                    db,
                    absolute_path=target_path,
                    commit=False,
                )
            elif op == "present":
                if entry.get("sha256") is None:
                    raise HTTPException(status_code=400, detail="Present entries require sha256")
                if share_file.content_hash is None or share_file.deleted_at is not None or not target_path.exists():
                    raise HTTPException(
                        status_code=409,
                        detail="Present entry requires an existing mirrored file; retry with full upload",
                    )
                share_file.content_hash = entry["sha256"]
                share_file.size_bytes = entry.get("size_bytes")
                share_file.modified_time_ns = entry.get("mtime_ns")
                share_file.deleted_at = None
                share_file.last_seen_generation = generation_id
                share_file.last_received_at = _utcnow()
                await db.flush()
            else:
                if target_path.exists():
                    target_path.unlink()
                share_file.content_hash = None
                share_file.deleted_at = _utcnow()
                share_file.modified_time_ns = entry.get("mtime_ns")
                share_file.last_seen_generation = generation_id
                share_file.last_received_at = _utcnow()
                await db.flush()
                await sync_document_from_filesystem(
                    folder,
                    db,
                    absolute_path=target_path,
                    commit=False,
                )

            applied_entries += 1

        share.last_sync_at = _utcnow()
        batch.status = "applied"
        batch.applied_at = _utcnow()
        batch.summary = json.dumps({"applied_entries": applied_entries})
        await db.commit()
        await db.refresh(batch)
        return batch
    except Exception as exc:
        await db.rollback()
        failed_batch = await db.get(SyncBatch, batch.id)
        if failed_batch is not None:
            failed_batch.status = "failed"
            failed_batch.error = str(exc)
            failed_batch.applied_at = None
            await db.commit()
            await db.refresh(failed_batch)
            return failed_batch
        raise


async def apply_snapshot_complete(
    db: AsyncSession,
    *,
    device: Device,
    share: DeviceShare,
    batch_id: str,
    generation_id: str,
) -> SyncBatch:
    batch, created = await _get_or_create_batch(
        db,
        device=device,
        share=share,
        external_batch_id=batch_id,
        generation_id=generation_id,
        batch_kind="snapshot_complete",
        entry_count=0,
    )
    if not created:
        return batch

    await db.commit()
    batch = await db.get(SyncBatch, batch.id)
    if batch is None:
        raise HTTPException(status_code=500, detail="Sync batch disappeared before apply")

    folder = await ensure_remote_folder_for_share(db, share)
    storage_root = Path(share.storage_path)

    try:
        result = await db.execute(select(ShareFile).where(ShareFile.share_id == share.id))
        files = result.scalars().all()
        removed = 0
        for share_file in files:
            if (
                share_file.last_seen_generation is not None
                and share_file.last_seen_generation != generation_id
                and share_file.deleted_at is None
            ):
                target_path = storage_root / Path(share_file.relative_path)
                _ensure_target_within_storage(storage_root, target_path)
                if target_path.exists():
                    target_path.unlink()
                share_file.content_hash = None
                share_file.deleted_at = _utcnow()
                share_file.last_received_at = _utcnow()
                await sync_document_from_filesystem(
                    folder,
                    db,
                    absolute_path=target_path,
                    commit=False,
                )
                removed += 1

        share.last_snapshot_generation = generation_id
        share.last_sync_at = _utcnow()
        batch.status = "applied"
        batch.applied_at = _utcnow()
        batch.summary = json.dumps({"removed": removed})
        await db.commit()
        await db.refresh(batch)
        return batch
    except Exception as exc:
        await db.rollback()
        failed_batch = await db.get(SyncBatch, batch.id)
        if failed_batch is not None:
            failed_batch.status = "failed"
            failed_batch.error = str(exc)
            failed_batch.applied_at = None
            await db.commit()
            await db.refresh(failed_batch)
            return failed_batch
        raise


async def build_sync_health(db: AsyncSession) -> dict[str, Any]:
    now = _utcnow()
    devices = (await db.execute(select(Device).order_by(Device.created_at.desc()))).scalars().all()
    shares = (await db.execute(select(DeviceShare))).scalars().all()
    batches = (await db.execute(select(SyncBatch).order_by(SyncBatch.received_at.desc()).limit(10))).scalars().all()
    device_name_by_id = {device.id: device.display_name for device in devices}
    share_by_id = {share.id: share for share in shares}
    pending_batches = int(
        (
            await db.execute(select(func.count()).select_from(SyncBatch).where(SyncBatch.status == "received"))
        ).scalar_one()
    )
    failed_batches = int(
        (
            await db.execute(select(func.count()).select_from(SyncBatch).where(SyncBatch.status == "failed"))
        ).scalar_one()
    )

    stale_count = sum(
        1
        for device in devices
        if device.status == "approved"
        and (device.last_seen_at is None or (now - device.last_seen_at) > timedelta(minutes=5))
    )
    synced_shares = sum(1 for share in shares if share.last_sync_at is not None)

    return {
        "device_count": len(devices),
        "approved_device_count": sum(1 for device in devices if device.status == "approved"),
        "revoked_device_count": sum(1 for device in devices if device.status == "revoked"),
        "stale_device_count": stale_count,
        "share_count": len(shares),
        "synced_share_count": synced_shares,
        "pending_batch_count": pending_batches,
        "failed_batch_count": failed_batches,
        "recent_batches": [
            {
                "id": batch.id,
                "external_batch_id": batch.external_batch_id,
                "batch_kind": batch.batch_kind,
                "status": batch.status,
                "entry_count": batch.entry_count,
                "received_at": batch.received_at.isoformat() if batch.received_at else None,
                "applied_at": batch.applied_at.isoformat() if batch.applied_at else None,
                "error": batch.error,
                "share_id": batch.share_id,
            }
            for batch in batches
        ],
        "recent_failures": [
            {
                "id": batch.id,
                "external_batch_id": batch.external_batch_id,
                "batch_kind": batch.batch_kind,
                "status": batch.status,
                "entry_count": batch.entry_count,
                "share_id": batch.share_id,
                "device_id": batch.device_id,
                "device_name": device_name_by_id.get(batch.device_id),
                "share_name": share_by_id.get(batch.share_id).display_name
                if share_by_id.get(batch.share_id) is not None
                else None,
                "source_path": share_by_id.get(batch.share_id).source_path
                if share_by_id.get(batch.share_id) is not None
                else None,
                "received_at": batch.received_at.isoformat() if batch.received_at else None,
                "applied_at": batch.applied_at.isoformat() if batch.applied_at else None,
                "error": batch.error,
            }
            for batch in batches
            if batch.status == "failed"
        ],
    }


async def list_devices_with_counts(db: AsyncSession) -> list[tuple[Device, int]]:
    result = await db.execute(
        select(Device, func.count(DeviceShare.id))
        .outerjoin(DeviceShare, DeviceShare.device_id == Device.id)
        .group_by(Device.id)
        .order_by(Device.created_at.desc())
    )
    return [(device, int(count)) for device, count in result.all()]


async def list_shares_for_device(db: AsyncSession, device_id: str) -> list[DeviceShare]:
    result = await db.execute(
        select(DeviceShare)
        .where(DeviceShare.device_id == device_id)
        .order_by(DeviceShare.created_at.asc())
    )
    return list(result.scalars().all())


async def revoke_device(db: AsyncSession, device_id: str) -> Device:
    device = await db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    device.status = "revoked"
    device.revoked_at = _utcnow()
    await db.commit()
    await db.refresh(device)
    return device


async def set_share_sync_enabled(
    db: AsyncSession, *, device_id: str, share_id: str, sync_enabled: bool
) -> DeviceShare:
    share = (
        await db.execute(
            select(DeviceShare).where(DeviceShare.id == share_id, DeviceShare.device_id == device_id)
        )
    ).scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")
    share.sync_enabled = sync_enabled
    await db.commit()
    await db.refresh(share)
    return share


async def _delete_share_resources(db: AsyncSession, share: DeviceShare) -> None:
    folder = (
        await db.execute(select(Folder).where(Folder.source_share_id == share.id))
    ).scalar_one_or_none()
    storage_path = Path(share.storage_path)

    if folder is not None:
        await db.delete(folder)
        await db.flush()

    await db.delete(share)

    if storage_path.exists():
        shutil.rmtree(storage_path, ignore_errors=True)
        parent = storage_path.parent
        if parent.exists() and not any(parent.iterdir()):
            try:
                parent.rmdir()
            except OSError:
                pass


async def delete_share(db: AsyncSession, *, device_id: str, share_id: str) -> None:
    share = (
        await db.execute(
            select(DeviceShare).where(DeviceShare.id == share_id, DeviceShare.device_id == device_id)
        )
    ).scalar_one_or_none()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found")

    await _delete_share_resources(db, share)
    await db.commit()


async def delete_device(db: AsyncSession, *, device_id: str) -> None:
    device = await db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    shares = await list_shares_for_device(db, device_id)
    for share in shares:
        await _delete_share_resources(db, share)

    await db.delete(device)
    await db.commit()
