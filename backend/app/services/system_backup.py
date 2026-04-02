from __future__ import annotations

import asyncio
import json
import os
import tempfile
from datetime import datetime, UTC
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.device import Device
from app.models.device_share import DeviceShare
from app.models.document import Document
from app.models.document_audit import DocumentWriteEvent
from app.models.document_version import DocumentVersion
from app.models.enrollment_token import EnrollmentToken
from app.models.folder import Folder
from app.models.folder_runtime_state import FolderRuntimeState
from app.models.project import Project
from app.models.share_file import ShareFile
from app.models.sync_batch import SyncBatch

BACKUP_SCHEMA_VERSION = 1


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _format_timestamp(value: datetime) -> str:
    return value.strftime("%Y%m%dT%H%M%SZ")


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _serialize_model(model: Any, fields: list[str]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for field in fields:
        value = getattr(model, field)
        if isinstance(value, datetime):
            payload[field] = _serialize_datetime(value)
        else:
            payload[field] = value
    return payload


def get_backup_directory() -> Path:
    if settings.BACKUP_DIR:
        return Path(settings.BACKUP_DIR)
    return Path(__file__).resolve().parents[2] / "backups"


async def ensure_backup_directory() -> Path:
    backup_dir = get_backup_directory()
    await asyncio.to_thread(backup_dir.mkdir, parents=True, exist_ok=True)
    return backup_dir


async def build_backup_payload(db: AsyncSession) -> dict[str, Any]:
    project_rows = (await db.execute(select(Project).order_by(Project.name.asc()))).scalars().all()
    device_rows = (await db.execute(select(Device).order_by(Device.created_at.asc()))).scalars().all()
    enrollment_rows = (
        await db.execute(select(EnrollmentToken).order_by(EnrollmentToken.created_at.asc()))
    ).scalars().all()
    share_rows = (
        await db.execute(select(DeviceShare).order_by(DeviceShare.created_at.asc()))
    ).scalars().all()
    share_file_rows = (
        await db.execute(select(ShareFile).order_by(ShareFile.share_id.asc(), ShareFile.relative_path.asc()))
    ).scalars().all()
    batch_rows = (
        await db.execute(select(SyncBatch).order_by(SyncBatch.received_at.asc()))
    ).scalars().all()
    folder_rows = (await db.execute(select(Folder).order_by(Folder.name.asc()))).scalars().all()
    runtime_rows = (
        await db.execute(select(FolderRuntimeState).order_by(FolderRuntimeState.folder_id.asc()))
    ).scalars().all()
    document_rows = (
        await db.execute(select(Document).order_by(Document.file_path.asc(), Document.id.asc()))
    ).scalars().all()
    version_rows = (
        await db.execute(
            select(DocumentVersion).order_by(
                DocumentVersion.document_id.asc(), DocumentVersion.version_number.asc()
            )
        )
    ).scalars().all()
    audit_rows = (
        await db.execute(
            select(DocumentWriteEvent).order_by(
                DocumentWriteEvent.document_id.asc(), DocumentWriteEvent.created_at.asc()
            )
        )
    ).scalars().all()

    return {
        "metadata": {
            "schema_version": BACKUP_SCHEMA_VERSION,
            "app_version": settings.APP_VERSION,
            "generated_at": _serialize_datetime(_utcnow()),
        },
        "projects": [
            _serialize_model(
                item,
                [
                    "id",
                    "name",
                    "description",
                    "color",
                    "metadata_rules",
                    "default_template",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in project_rows
        ],
        "devices": [
            _serialize_model(
                item,
                [
                    "id",
                    "display_name",
                    "hostname",
                    "platform",
                    "agent_version",
                    "status",
                    "auth_token_hash",
                    "last_seen_at",
                    "approved_at",
                    "revoked_at",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in device_rows
        ],
        "enrollment_tokens": [
            _serialize_model(
                item,
                ["id", "token_hash", "note", "expires_at", "used_at", "device_id", "created_at"],
            )
            for item in enrollment_rows
        ],
        "device_shares": [
            _serialize_model(
                item,
                [
                    "id",
                    "device_id",
                    "display_name",
                    "source_path",
                    "storage_path",
                    "include_globs",
                    "exclude_globs",
                    "sync_enabled",
                    "last_snapshot_generation",
                    "last_sync_at",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in share_rows
        ],
        "share_files": [
            _serialize_model(
                item,
                [
                    "id",
                    "share_id",
                    "relative_path",
                    "content_hash",
                    "size_bytes",
                    "modified_time_ns",
                    "deleted_at",
                    "last_seen_generation",
                    "last_received_at",
                ],
            )
            for item in share_file_rows
        ],
        "sync_batches": [
            _serialize_model(
                item,
                [
                    "id",
                    "device_id",
                    "share_id",
                    "external_batch_id",
                    "generation_id",
                    "batch_kind",
                    "status",
                    "entry_count",
                    "summary",
                    "error",
                    "received_at",
                    "applied_at",
                    "created_at",
                ],
            )
            for item in batch_rows
        ],
        "folders": [
            _serialize_model(
                item,
                [
                    "id",
                    "path",
                    "name",
                    "source_type",
                    "source_path",
                    "storage_path",
                    "source_share_id",
                    "is_read_only",
                    "project_id",
                    "is_active",
                    "watch_enabled",
                    "device_id",
                    "metadata_rules",
                    "default_template",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in folder_rows
        ],
        "folder_runtime_states": [
            _serialize_model(
                item,
                [
                    "folder_id",
                    "watch_state",
                    "availability_state",
                    "last_checked_at",
                    "last_event_at",
                    "last_successful_scan_at",
                    "last_full_reconcile_at",
                    "consecutive_error_count",
                    "last_error",
                    "last_scan_summary",
                    "degraded_since",
                    "created_at",
                    "updated_at",
                ],
            )
            for item in runtime_rows
        ],
        "documents": [
            _serialize_model(
                item,
                [
                    "id",
                    "folder_id",
                    "file_path",
                    "file_name",
                    "title",
                    "content_hash",
                    "content",
                    "frontmatter",
                    "tags",
                    "status",
                    "headings",
                    "links",
                    "tasks",
                    "task_count",
                    "size_bytes",
                    "is_deleted",
                    "device_id",
                    "created_at",
                    "updated_at",
                    "indexed_at",
                    "version_counter",
                ],
            )
            for item in document_rows
        ],
        "document_versions": [
            _serialize_model(
                item,
                [
                    "id",
                    "document_id",
                    "version_number",
                    "change_type",
                    "content_hash",
                    "content",
                    "size_bytes",
                    "created_at",
                ],
            )
            for item in version_rows
        ],
        "document_write_events": [
            _serialize_model(
                item,
                [
                    "id",
                    "document_id",
                    "action",
                    "actor",
                    "previous_content_hash",
                    "new_content_hash",
                    "message",
                    "created_at",
                ],
            )
            for item in audit_rows
        ],
    }


def validate_backup_payload(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    required_sections = [
        "metadata",
        "projects",
        "folders",
        "folder_runtime_states",
        "devices",
        "enrollment_tokens",
        "device_shares",
        "share_files",
        "sync_batches",
        "documents",
        "document_versions",
        "document_write_events",
    ]
    for section in required_sections:
        if section not in payload:
            errors.append(f"Missing top-level section: {section}")

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        errors.append("metadata must be an object")
    else:
        if metadata.get("schema_version") != BACKUP_SCHEMA_VERSION:
            errors.append(
                f"Unsupported schema_version: {metadata.get('schema_version')}"
            )
        if not metadata.get("app_version"):
            errors.append("metadata.app_version is required")
        if not metadata.get("generated_at"):
            errors.append("metadata.generated_at is required")

    counts = {
        section: len(payload.get(section, [])) if isinstance(payload.get(section), list) else 0
        for section in required_sections
        if section != "metadata"
    }

    folder_ids = {
        item.get("id")
        for item in payload.get("folders", [])
        if isinstance(item, dict) and item.get("id")
    }
    device_ids = {
        item.get("id")
        for item in payload.get("devices", [])
        if isinstance(item, dict) and item.get("id")
    }
    share_ids = {
        item.get("id")
        for item in payload.get("device_shares", [])
        if isinstance(item, dict) and item.get("id")
    }
    project_ids = {
        item.get("id")
        for item in payload.get("projects", [])
        if isinstance(item, dict) and item.get("id")
    }
    document_ids = {
        item.get("id")
        for item in payload.get("documents", [])
        if isinstance(item, dict) and item.get("id")
    }

    for token in payload.get("enrollment_tokens", []):
        if isinstance(token, dict) and token.get("device_id") and token["device_id"] not in device_ids:
            errors.append(f"Enrollment token {token.get('id')} references missing device {token.get('device_id')}")

    for share in payload.get("device_shares", []):
        if isinstance(share, dict) and share.get("device_id") not in device_ids:
            errors.append(f"Share {share.get('id')} references missing device {share.get('device_id')}")

    for share_file in payload.get("share_files", []):
        if isinstance(share_file, dict) and share_file.get("share_id") not in share_ids:
            errors.append(f"Share file {share_file.get('id')} references missing share {share_file.get('share_id')}")

    for batch in payload.get("sync_batches", []):
        if isinstance(batch, dict) and batch.get("device_id") not in device_ids:
            errors.append(f"Sync batch {batch.get('id')} references missing device {batch.get('device_id')}")
        if isinstance(batch, dict) and batch.get("share_id") not in share_ids:
            errors.append(f"Sync batch {batch.get('id')} references missing share {batch.get('share_id')}")

    for folder in payload.get("folders", []):
        if isinstance(folder, dict) and folder.get("project_id") and folder["project_id"] not in project_ids:
            errors.append(f"Folder {folder.get('id')} references missing project {folder.get('project_id')}")
        if isinstance(folder, dict) and folder.get("source_share_id") and folder["source_share_id"] not in share_ids:
            errors.append(f"Folder {folder.get('id')} references missing share {folder.get('source_share_id')}")

    for runtime in payload.get("folder_runtime_states", []):
        if isinstance(runtime, dict) and runtime.get("folder_id") not in folder_ids:
            errors.append(f"Runtime state references missing folder {runtime.get('folder_id')}")

    for document in payload.get("documents", []):
        if isinstance(document, dict) and document.get("folder_id") not in folder_ids:
            errors.append(f"Document {document.get('id')} references missing folder {document.get('folder_id')}")

    for version in payload.get("document_versions", []):
        if isinstance(version, dict) and version.get("document_id") not in document_ids:
            errors.append(f"Version {version.get('id')} references missing document {version.get('document_id')}")

    for event in payload.get("document_write_events", []):
        if isinstance(event, dict) and event.get("document_id") not in document_ids:
            errors.append(f"Write event {event.get('id')} references missing document {event.get('document_id')}")

    if counts.get("documents", 0) == 0:
        warnings.append("Backup contains no document rows")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "counts": counts,
        "metadata": metadata if isinstance(metadata, dict) else None,
    }


async def list_backups() -> list[dict[str, Any]]:
    backup_dir = await ensure_backup_directory()
    files = await asyncio.to_thread(lambda: sorted(backup_dir.glob("*.json"), reverse=True))

    results: list[dict[str, Any]] = []
    for backup_file in files:
        stat = await asyncio.to_thread(backup_file.stat)
        metadata: dict[str, Any] | None = None
        try:
            payload = json.loads(await asyncio.to_thread(backup_file.read_text, encoding="utf-8"))
            raw_metadata = payload.get("metadata")
            metadata = raw_metadata if isinstance(raw_metadata, dict) else None
        except Exception:
            metadata = None

        results.append(
            {
                "name": backup_file.name,
                "path": str(backup_file),
                "size_bytes": stat.st_size,
                "created_at": _serialize_datetime(
                    datetime.fromtimestamp(stat.st_mtime, tz=UTC)
                ),
                "metadata": metadata,
            }
        )
    return results


async def write_backup_file(payload: dict[str, Any]) -> dict[str, Any]:
    backup_dir = await ensure_backup_directory()
    generated_at = payload["metadata"]["generated_at"]
    timestamp = _format_timestamp(datetime.fromisoformat(generated_at))
    backup_name = f"localdocs-backup-{timestamp}.json"
    target_path = backup_dir / backup_name

    encoded = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")

    def _write() -> int:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=backup_dir,
            prefix=f".{backup_name}.",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_file.write(encoded)
            temp_file.flush()
            os.fsync(temp_file.fileno())
            temp_path = Path(temp_file.name)

        os.replace(temp_path, target_path)
        return target_path.stat().st_size

    size_bytes = await asyncio.to_thread(_write)
    return {
        "name": backup_name,
        "path": str(target_path),
        "size_bytes": size_bytes,
        "generated_at": generated_at,
    }


async def read_backup_file(backup_name: str) -> dict[str, Any]:
    backup_dir = await ensure_backup_directory()
    target = (backup_dir / backup_name).resolve()
    if backup_dir.resolve() not in target.parents or not target.is_file():
        raise ValueError("Backup file not found")
    raw = await asyncio.to_thread(target.read_text, encoding="utf-8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Backup file is not a valid JSON object")
    return payload


async def restore_backup_payload(db: AsyncSession, payload: dict[str, Any]) -> dict[str, Any]:
    validation = validate_backup_payload(payload)
    if not validation["valid"]:
        raise ValueError("Backup payload failed validation")

    await db.execute(delete(SyncBatch))
    await db.execute(delete(ShareFile))
    await db.execute(delete(EnrollmentToken))
    await db.execute(delete(DeviceShare))
    await db.execute(delete(Device))
    await db.execute(delete(DocumentWriteEvent))
    await db.execute(delete(DocumentVersion))
    await db.execute(delete(Document))
    await db.execute(delete(FolderRuntimeState))
    await db.execute(delete(Folder))
    await db.execute(delete(Project))

    project_rows = [
        {
            **item,
            "created_at": _parse_datetime(item.get("created_at")),
            "updated_at": _parse_datetime(item.get("updated_at")),
        }
        for item in payload.get("projects", [])
    ]
    if project_rows:
        await db.execute(insert(Project), project_rows)

    device_rows = [
        {
            **item,
            "last_seen_at": _parse_datetime(item.get("last_seen_at")),
            "approved_at": _parse_datetime(item.get("approved_at")),
            "revoked_at": _parse_datetime(item.get("revoked_at")),
            "created_at": _parse_datetime(item.get("created_at")),
            "updated_at": _parse_datetime(item.get("updated_at")),
        }
        for item in payload.get("devices", [])
    ]
    if device_rows:
        await db.execute(insert(Device), device_rows)

    enrollment_rows = [
        {
            **item,
            "expires_at": _parse_datetime(item.get("expires_at")),
            "used_at": _parse_datetime(item.get("used_at")),
            "created_at": _parse_datetime(item.get("created_at")),
        }
        for item in payload.get("enrollment_tokens", [])
    ]
    if enrollment_rows:
        await db.execute(insert(EnrollmentToken), enrollment_rows)

    share_rows = [
        {
            **item,
            "last_sync_at": _parse_datetime(item.get("last_sync_at")),
            "created_at": _parse_datetime(item.get("created_at")),
            "updated_at": _parse_datetime(item.get("updated_at")),
        }
        for item in payload.get("device_shares", [])
    ]
    if share_rows:
        await db.execute(insert(DeviceShare), share_rows)

    share_file_rows = [
        {
            **item,
            "deleted_at": _parse_datetime(item.get("deleted_at")),
            "last_received_at": _parse_datetime(item.get("last_received_at")),
        }
        for item in payload.get("share_files", [])
    ]
    if share_file_rows:
        await db.execute(insert(ShareFile), share_file_rows)

    sync_batch_rows = [
        {
            **item,
            "received_at": _parse_datetime(item.get("received_at")),
            "applied_at": _parse_datetime(item.get("applied_at")),
            "created_at": _parse_datetime(item.get("created_at")),
        }
        for item in payload.get("sync_batches", [])
    ]
    if sync_batch_rows:
        await db.execute(insert(SyncBatch), sync_batch_rows)

    folder_rows = [
        {
            **item,
            "created_at": _parse_datetime(item.get("created_at")),
            "updated_at": _parse_datetime(item.get("updated_at")),
        }
        for item in payload.get("folders", [])
    ]
    if folder_rows:
        await db.execute(insert(Folder), folder_rows)

    runtime_rows = [
        {
            **item,
            "last_checked_at": _parse_datetime(item.get("last_checked_at")),
            "last_event_at": _parse_datetime(item.get("last_event_at")),
            "last_successful_scan_at": _parse_datetime(item.get("last_successful_scan_at")),
            "last_full_reconcile_at": _parse_datetime(item.get("last_full_reconcile_at")),
            "degraded_since": _parse_datetime(item.get("degraded_since")),
            "created_at": _parse_datetime(item.get("created_at")),
            "updated_at": _parse_datetime(item.get("updated_at")),
        }
        for item in payload.get("folder_runtime_states", [])
    ]
    if runtime_rows:
        await db.execute(insert(FolderRuntimeState), runtime_rows)

    document_rows = [
        {
            **item,
            "created_at": _parse_datetime(item.get("created_at")),
            "updated_at": _parse_datetime(item.get("updated_at")),
            "indexed_at": _parse_datetime(item.get("indexed_at")),
        }
        for item in payload.get("documents", [])
    ]
    if document_rows:
        await db.execute(insert(Document), document_rows)

    version_rows = [
        {
            **item,
            "created_at": _parse_datetime(item.get("created_at")),
        }
        for item in payload.get("document_versions", [])
    ]
    if version_rows:
        await db.execute(insert(DocumentVersion), version_rows)

    event_rows = [
        {
            **item,
            "created_at": _parse_datetime(item.get("created_at")),
        }
        for item in payload.get("document_write_events", [])
    ]
    if event_rows:
        await db.execute(insert(DocumentWriteEvent), event_rows)

    await db.commit()
    return {
        "restored": True,
        "counts": validation["counts"],
        "metadata": validation["metadata"],
    }
