from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import frontmatter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document import Document
from app.models.folder import Folder


def _utcnow() -> datetime:
    return datetime.utcnow()


def _compute_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@dataclass(slots=True)
class ParsedMarkdownDocument:
    raw_content: str
    body_content: str
    content_hash: str
    title: str
    frontmatter: str | None
    tags: str | None
    status: str | None
    headings: str | None
    links: str | None
    tasks: str | None
    task_count: int


def _extract_title(post: frontmatter.Post, file_stem: str) -> str:
    """Return title from frontmatter, first heading, or filename."""
    if post.get("title"):
        return str(post["title"])[:512]
    # Try first H1 heading
    for line in post.content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()[:512]
    return file_stem[:512]


def _extract_tags(post: frontmatter.Post) -> str | None:
    """Return comma-separated tags string from frontmatter or None."""
    raw = post.get("tags")
    if not raw:
        return None
    if isinstance(raw, list):
        tags = [str(t).strip() for t in raw if t]
    elif isinstance(raw, str):
        tags = [t.strip() for t in raw.split(",") if t.strip()]
    else:
        return None
    return ",".join(tags)[:512] if tags else None


def _extract_status(post: frontmatter.Post) -> str | None:
    raw = post.get("status")
    if raw is None:
        return None
    value = str(raw).strip()
    return value[:100] if value else None


def _extract_headings(content: str) -> str | None:
    headings = [
        line.lstrip("#").strip()
        for line in content.splitlines()
        if re.match(r"^#{1,6}\s+", line.strip())
    ]
    return json.dumps(headings) if headings else None


def _extract_links(content: str) -> str | None:
    markdown_links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", content)
    autolinks = re.findall(r"https?://[^\s)>]+", content)
    deduped_links = list(dict.fromkeys(link.strip().rstrip(").,;") for link in markdown_links + autolinks if link.strip()))
    links = [link for link in deduped_links if link]
    return json.dumps(links) if links else None


def _extract_tasks(content: str) -> tuple[str | None, int]:
    tasks = [
        line.strip()
        for line in content.splitlines()
        if re.match(r"^\s*[-*]\s+\[(?: |x|X)\]\s+", line)
    ]
    return (json.dumps(tasks), len(tasks)) if tasks else (None, 0)


def _frontmatter_to_json(post: frontmatter.Post) -> str | None:
    """Serialize frontmatter metadata (excluding content) to JSON."""
    meta = {k: v for k, v in post.metadata.items()}
    if not meta:
        return None
    try:
        return json.dumps(meta, default=str)
    except Exception:
        return None


def _resolve_scan_base_path(folder_path: str) -> Path:
    base_path = Path(folder_path)
    if not settings.FILESYSTEM_ROOT:
        return base_path

    filesystem_root = Path(settings.FILESYSTEM_ROOT)
    if not base_path.is_absolute():
        return filesystem_root / base_path

    relative_path = Path(*base_path.parts[1:]) if len(base_path.parts) > 1 else Path()
    return filesystem_root / relative_path


def resolve_folder_scan_base_path(folder: Folder) -> Path:
    if folder.storage_path:
        return Path(folder.storage_path)
    source_path = folder.source_path or folder.path
    return _resolve_scan_base_path(source_path)


def resolve_document_file_path(folder: Folder, file_path: str) -> Path:
    base_path = resolve_folder_scan_base_path(folder)
    relative_root = (folder.source_path or folder.path).replace("\\", "/").rstrip("/")
    normalized_file_path = file_path.replace("\\", "/")
    if normalized_file_path.casefold() == relative_root.casefold():
        relative_path = Path()
    elif normalized_file_path.casefold().startswith(relative_root.casefold() + "/"):
        relative_fragment = normalized_file_path[len(relative_root) + 1 :]
        relative_path = Path(relative_fragment)
    else:
        raise ValueError(
            f"Document path {file_path} does not belong to folder source root {folder.source_path or folder.path}"
        )
    return base_path / relative_path


def parse_markdown_document(raw_text: str, *, file_stem: str) -> ParsedMarkdownDocument:
    post = frontmatter.loads(raw_text)
    tasks, task_count = _extract_tasks(post.content)
    return ParsedMarkdownDocument(
        raw_content=raw_text,
        body_content=post.content,
        content_hash=_compute_hash(raw_text),
        title=_extract_title(post, file_stem),
        frontmatter=_frontmatter_to_json(post),
        tags=_extract_tags(post),
        status=_extract_status(post),
        headings=_extract_headings(post.content),
        links=_extract_links(post.content),
        tasks=tasks,
        task_count=task_count,
    )


def apply_parsed_document(
    doc: Document,
    parsed: ParsedMarkdownDocument,
    *,
    size_bytes: int,
    indexed_at: datetime | None = None,
) -> None:
    now = _utcnow()
    doc.title = parsed.title
    doc.content = parsed.body_content
    doc.content_hash = parsed.content_hash
    doc.frontmatter = parsed.frontmatter
    doc.tags = parsed.tags
    doc.status = parsed.status
    doc.headings = parsed.headings
    doc.links = parsed.links
    doc.tasks = parsed.tasks
    doc.task_count = parsed.task_count
    doc.size_bytes = size_bytes
    doc.is_deleted = False
    doc.indexed_at = indexed_at or now
    doc.updated_at = now


def _should_preserve_existing_document_on_empty_rescan(
    doc: Document,
    parsed: ParsedMarkdownDocument,
    *,
    size_bytes: int,
    allow_empty_file_overwrite: bool,
) -> bool:
    if allow_empty_file_overwrite:
        return False
    if size_bytes != 0 or parsed.raw_content != "":
        return False
    if doc.is_deleted:
        return False
    return doc.size_bytes > 0 or bool(doc.content) or bool(doc.frontmatter)


def _collect_markdown_files(base_path: Path) -> list[Path]:
    file_paths: list[Path] = []
    for root, dirs, files in os.walk(base_path):
        dirs[:] = [directory for directory in dirs if not directory.startswith(".")]
        for file_name in files:
            if file_name.endswith(".md") or file_name.endswith(".markdown"):
                file_paths.append(Path(root) / file_name)
    return file_paths


async def _read_file_text(file_path: Path) -> str:
    return await asyncio.to_thread(file_path.read_text, encoding="utf-8", errors="replace")


async def _stat_file(file_path: Path) -> os.stat_result:
    return await asyncio.to_thread(file_path.stat)


async def upsert_document_from_file(
    folder: Folder,
    db: AsyncSession,
    *,
    file_path_obj: Path,
    base_path: Path | None = None,
    allow_empty_file_overwrite: bool = True,
) -> str:
    base_scan_path = base_path or resolve_folder_scan_base_path(folder)
    relative_file_path = file_path_obj.relative_to(base_scan_path)
    file_path_str = str(Path(folder.source_path or folder.path) / relative_file_path)

    result = await db.execute(select(Document).where(Document.folder_id == folder.id, Document.file_path == file_path_str))
    doc = result.scalar_one_or_none()

    raw_text = await _read_file_text(file_path_obj)
    parsed = parse_markdown_document(raw_text, file_stem=file_path_obj.stem)
    stat = await _stat_file(file_path_obj)

    if doc is None:
        doc = Document(
            folder_id=folder.id,
            file_path=file_path_str,
            file_name=file_path_obj.name,
            size_bytes=stat.st_size,
            device_id=folder.device_id,
        )
        db.add(doc)
        apply_parsed_document(doc, parsed, size_bytes=stat.st_size)
        return "indexed"

    if doc.content_hash == parsed.content_hash and not doc.is_deleted:
        return "skipped"

    if _should_preserve_existing_document_on_empty_rescan(
        doc,
        parsed,
        size_bytes=stat.st_size,
        allow_empty_file_overwrite=allow_empty_file_overwrite,
    ):
        return "skipped"

    doc.file_name = file_path_obj.name
    apply_parsed_document(doc, parsed, size_bytes=stat.st_size)
    return "indexed"


async def mark_document_deleted(folder: Folder, db: AsyncSession, *, file_path_str: str) -> bool:
    result = await db.execute(select(Document).where(Document.folder_id == folder.id, Document.file_path == file_path_str))
    doc = result.scalar_one_or_none()
    if doc is None or doc.is_deleted:
        return False
    doc.is_deleted = True
    doc.updated_at = _utcnow()
    doc.indexed_at = _utcnow()
    return True


async def sync_document_from_filesystem(
    folder: Folder,
    db: AsyncSession,
    *,
    absolute_path: Path,
    commit: bool = True,
) -> dict[str, int]:
    base_path = resolve_folder_scan_base_path(folder)
    relative_file_path = absolute_path.relative_to(base_path)
    file_path_str = str(Path(folder.source_path or folder.path) / relative_file_path)
    summary = {"indexed": 0, "skipped": 0, "errors": 0}

    try:
        file_exists = await asyncio.to_thread(absolute_path.exists)
        if file_exists:
            result = await upsert_document_from_file(folder, db, file_path_obj=absolute_path, base_path=base_path)
            summary[result] += 1
        elif await mark_document_deleted(folder, db, file_path_str=file_path_str):
            summary["indexed"] += 1
        else:
            summary["skipped"] += 1
        if commit:
            await db.commit()
    except Exception:
        await db.rollback()
        if not commit:
            raise
        summary["errors"] += 1

    return summary


async def scan_folder(
    folder: Folder,
    db: AsyncSession,
    *,
    allow_mass_delete: bool = False,
    allow_empty_file_overwrite: bool = True,
) -> dict[str, int]:
    """
    Walk *folder.path* recursively, index every *.md / *.markdown file.
    Returns a summary dict: {"indexed": n, "skipped": n, "errors": n}.
    When allow_mass_delete is False, refuse a full empty-root deletion if the
    folder previously had indexed documents. This protects against missing mounts
    or unexpectedly empty roots during automatic scans.
    """
    base_path = resolve_folder_scan_base_path(folder)
    path_exists = await asyncio.to_thread(base_path.exists)
    path_is_dir = await asyncio.to_thread(base_path.is_dir)
    if not path_exists or not path_is_dir:
        raise ValueError(f"Path does not exist or is not a directory: {folder.source_path or folder.path}")

    summary: dict[str, int] = {"indexed": 0, "skipped": 0, "errors": 0}

    # Collect all existing doc paths for this folder so we can mark deletions
    existing_result = await db.execute(
        select(Document).where(
            Document.folder_id == folder.id, Document.is_deleted.is_(False)
        )
    )
    existing_docs: dict[str, Document] = {
        doc.file_path: doc for doc in existing_result.scalars().all()
    }
    seen_paths: set[str] = set()
    file_paths = await asyncio.to_thread(_collect_markdown_files, base_path)

    if existing_docs and not file_paths and not allow_mass_delete:
        raise ValueError(
            "Folder appears empty and would remove all indexed markdown files. "
            "Possible unmounted or misconfigured root; refusing automatic mass delete. "
            "Run an explicit rebuild to confirm the folder is truly empty."
        )

    for file_path_obj in file_paths:
        relative_file_path = file_path_obj.relative_to(base_path)
        file_path_str = str(Path(folder.source_path or folder.path) / relative_file_path)
        seen_paths.add(file_path_str)

        try:
            result = await upsert_document_from_file(
                folder,
                db,
                file_path_obj=file_path_obj,
                base_path=base_path,
                allow_empty_file_overwrite=allow_empty_file_overwrite,
            )
            summary[result] += 1
        except Exception:
            summary["errors"] += 1

    # Soft-delete documents whose files are gone
    for file_path_str, doc in existing_docs.items():
        if file_path_str not in seen_paths:
            doc.is_deleted = True

    await db.commit()
    return summary
