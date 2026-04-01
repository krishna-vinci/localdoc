from __future__ import annotations

import hashlib
import json
import os
import re
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


async def scan_folder(folder: Folder, db: AsyncSession) -> dict[str, int]:
    """
    Walk *folder.path* recursively, index every *.md / *.markdown file.
    Returns a summary dict: {"indexed": n, "skipped": n, "errors": n}.
    """
    base_path = _resolve_scan_base_path(folder.path)
    if not base_path.exists() or not base_path.is_dir():
        raise ValueError(f"Path does not exist or is not a directory: {folder.path}")

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

    for root, dirs, files in os.walk(base_path):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file_name in files:
            if not (file_name.endswith(".md") or file_name.endswith(".markdown")):
                continue
            file_path_obj = Path(root) / file_name
            relative_file_path = file_path_obj.relative_to(base_path)
            file_path_str = str(Path(folder.path) / relative_file_path)
            seen_paths.add(file_path_str)

            try:
                raw_text = file_path_obj.read_text(encoding="utf-8", errors="replace")
                post = frontmatter.loads(raw_text)
                content_hash = _compute_hash(raw_text)
                title = _extract_title(post, file_path_obj.stem)
                tags = _extract_tags(post)
                status = _extract_status(post)
                headings = _extract_headings(post.content)
                links = _extract_links(post.content)
                tasks, task_count = _extract_tasks(post.content)
                fm_json = _frontmatter_to_json(post)
                size_bytes = file_path_obj.stat().st_size

                if file_path_str in existing_docs:
                    doc = existing_docs[file_path_str]
                    if doc.content_hash == content_hash:
                        summary["skipped"] += 1
                        continue
                    # Update changed document
                    doc.title = title
                    doc.content = post.content
                    doc.content_hash = content_hash
                    doc.frontmatter = fm_json
                    doc.tags = tags
                    doc.status = status
                    doc.headings = headings
                    doc.links = links
                    doc.tasks = tasks
                    doc.task_count = task_count
                    doc.size_bytes = size_bytes
                    doc.indexed_at = _utcnow()
                    doc.updated_at = _utcnow()
                else:
                    doc = Document(
                        folder_id=folder.id,
                        file_path=file_path_str,
                        file_name=file_name,
                        title=title,
                        content=post.content,
                        content_hash=content_hash,
                        frontmatter=fm_json,
                        tags=tags,
                        status=status,
                        headings=headings,
                        links=links,
                        tasks=tasks,
                        task_count=task_count,
                        size_bytes=size_bytes,
                        device_id=folder.device_id,
                        indexed_at=_utcnow(),
                    )
                    db.add(doc)

                summary["indexed"] += 1

            except Exception:
                summary["errors"] += 1

    # Soft-delete documents whose files are gone
    for file_path_str, doc in existing_docs.items():
        if file_path_str not in seen_paths:
            doc.is_deleted = True

    await db.commit()
    return summary
