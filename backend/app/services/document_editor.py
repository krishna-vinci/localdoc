from __future__ import annotations

import asyncio
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import frontmatter
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker
from app.models.document import Document
from app.models.document_audit import DocumentWriteEvent
from app.models.document_version import DocumentVersion
from app.models.folder import Folder
from app.services.background_jobs import enqueue_document_recovery_sync
from app.services.folder_runtime import classify_error_state, update_folder_runtime_state
from app.services.scanner import (
    _compute_hash,
    apply_parsed_document,
    parse_markdown_document,
    resolve_document_file_path,
)


@dataclass(slots=True)
class DocumentDiskState:
    raw_content: str
    content_hash: str
    file_exists: bool


async def read_document_disk_state(document: Document, folder: Folder) -> DocumentDiskState:
    file_path = resolve_document_file_path(folder, document.file_path)
    file_exists = await asyncio.to_thread(file_path.exists)
    if not file_exists:
        metadata = json.loads(document.frontmatter) if document.frontmatter else {}
        fallback_raw_content = frontmatter.dumps(frontmatter.Post(document.content, **metadata))
        return DocumentDiskState(
            raw_content=fallback_raw_content,
            content_hash=document.content_hash,
            file_exists=False,
        )

    raw_content = await asyncio.to_thread(file_path.read_text, encoding="utf-8", errors="replace")
    return DocumentDiskState(
        raw_content=raw_content,
        content_hash=_compute_hash(raw_content),
        file_exists=True,
    )


async def get_document_with_folder(db: AsyncSession, doc_id: str) -> tuple[Document, Folder]:
    result = await db.execute(
        select(Document, Folder)
        .join(Folder, Document.folder_id == Folder.id)
        .where(Document.id == doc_id, Document.is_deleted.is_(False))
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return row


def _write_atomic_markdown_file(target_path: Path, raw_content: str) -> int:
    target_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=target_path.parent,
        prefix=f".{target_path.name}.",
        suffix=".tmp",
        delete=False,
    ) as temp_file:
        temp_file.write(raw_content)
        temp_file.flush()
        os.fsync(temp_file.fileno())
        temp_path = Path(temp_file.name)

    os.replace(temp_path, target_path)
    return target_path.stat().st_size


def _append_version_snapshot(
    document: Document,
    *,
    raw_content: str,
    content_hash: str,
    change_type: str,
    size_bytes: int,
    db: AsyncSession,
) -> DocumentVersion:
    document.version_counter += 1
    version = DocumentVersion(
        document_id=document.id,
        version_number=document.version_counter,
        change_type=change_type,
        content_hash=content_hash,
        content=raw_content,
        size_bytes=size_bytes,
    )
    db.add(version)
    return version


async def _ensure_baseline_version(
    document: Document,
    *,
    raw_content: str,
    content_hash: str,
    size_bytes: int,
    db: AsyncSession,
) -> None:
    if document.version_counter > 0:
        return

    _append_version_snapshot(
        document,
        raw_content=raw_content,
        content_hash=content_hash,
        change_type="baseline",
        size_bytes=size_bytes,
        db=db,
    )


async def save_document_content(
    db: AsyncSession,
    *,
    document: Document,
    folder: Folder,
    raw_content: str,
    expected_content_hash: str,
    message: str | None = None,
    action: str = "save",
) -> Document:
    disk_state = await read_document_disk_state(document, folder)
    if not disk_state.file_exists:
        raise HTTPException(status_code=409, detail="Document file no longer exists on disk")

    if expected_content_hash != document.content_hash or expected_content_hash != disk_state.content_hash:
        raise HTTPException(
            status_code=409,
            detail="Document changed on disk. Reload before saving.",
        )

    if raw_content == disk_state.raw_content:
        return document

    target_path = resolve_document_file_path(folder, document.file_path)
    previous_size_bytes = await asyncio.to_thread(target_path.stat)
    await _ensure_baseline_version(
        document,
        raw_content=disk_state.raw_content,
        content_hash=disk_state.content_hash,
        size_bytes=previous_size_bytes.st_size,
        db=db,
    )

    parsed_document = parse_markdown_document(raw_content, file_stem=target_path.stem)
    file_replaced = False

    try:
        size_bytes = await asyncio.to_thread(_write_atomic_markdown_file, target_path, raw_content)
        file_replaced = True
        apply_parsed_document(document, parsed_document, size_bytes=size_bytes)
        _append_version_snapshot(
            document,
            raw_content=raw_content,
            content_hash=parsed_document.content_hash,
            change_type=action,
            size_bytes=size_bytes,
            db=db,
        )
        db.add(
            DocumentWriteEvent(
                document_id=document.id,
                action=action,
                actor="local",
                previous_content_hash=disk_state.content_hash,
                new_content_hash=parsed_document.content_hash,
                message=message,
            )
        )
        await db.commit()
        await db.refresh(document)
        return document
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        if file_replaced:
            async with async_session_maker() as recovery_session:
                try:
                    recovery_folder = await recovery_session.get(Folder, folder.id)
                    if recovery_folder is not None:
                        await enqueue_document_recovery_sync(recovery_folder.id, target_path)
                        watch_state, availability_state = classify_error_state(
                            "Document save wrote to disk but queued recovery sync"
                        )
                        await update_folder_runtime_state(
                            recovery_session,
                            recovery_folder,
                            watch_state=watch_state,
                            availability_state=availability_state,
                            error="Document save wrote to disk but queued recovery sync",
                        )
                        await recovery_session.commit()
                except Exception:
                    pass
        raise HTTPException(status_code=500, detail="Failed to save document safely") from exc


async def restore_document_version(
    db: AsyncSession,
    *,
    document: Document,
    folder: Folder,
    version: DocumentVersion,
    expected_content_hash: str,
    message: str | None = None,
) -> Document:
    return await save_document_content(
        db,
        document=document,
        folder=folder,
        raw_content=version.content,
        expected_content_hash=expected_content_hash,
        message=message,
        action="restore",
    )
