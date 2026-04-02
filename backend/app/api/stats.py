from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document
from app.models.folder import Folder
from app.models.project import Project
from app.schemas.stats import StatsResponse
from app.services.watcher import folder_watcher

router = APIRouter()


@router.get("/", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)) -> StatsResponse:
    doc_count_result = await db.execute(
        select(func.count()).select_from(Document).where(Document.is_deleted.is_(False))
    )
    document_count: int = doc_count_result.scalar_one()

    folder_count_result = await db.execute(
        select(func.count()).select_from(Folder).where(Folder.is_active.is_(True))
    )
    folder_count: int = folder_count_result.scalar_one()

    project_count_result = await db.execute(select(func.count()).select_from(Project))
    project_count: int = project_count_result.scalar_one()

    orphan_count_result = await db.execute(
        select(func.count())
        .select_from(Document)
        .join(Folder, Document.folder_id == Folder.id)
        .where(Document.is_deleted.is_(False), Folder.project_id.is_(None))
    )
    orphan_document_count: int = orphan_count_result.scalar_one()

    duplicate_count_result = await db.execute(
        select(func.count())
        .select_from(
            select(Document.content_hash)
            .where(Document.is_deleted.is_(False))
            .group_by(Document.content_hash)
            .having(func.count(Document.id) > 1)
            .subquery()
        )
    )
    duplicate_candidate_count: int = duplicate_count_result.scalar_one()

    # Count distinct tags: tags column is comma-separated, count non-null unique tags
    tags_result = await db.execute(
        select(Document.tags).where(
            Document.is_deleted.is_(False), Document.tags.isnot(None)
        )
    )
    all_tags: set[str] = set()
    for (tags_str,) in tags_result:
        if tags_str:
            for tag in tags_str.split(","):
                tag = tag.strip()
                if tag:
                    all_tags.add(tag)

    watch_statuses = await folder_watcher.get_statuses()
    watched_folder_count = sum(1 for status in watch_statuses if status["watch_enabled"] and status["active"])

    return StatsResponse(
        document_count=document_count,
        folder_count=folder_count,
        project_count=project_count,
        tag_count=len(all_tags),
        orphan_document_count=orphan_document_count,
        duplicate_candidate_count=duplicate_candidate_count,
        watched_folder_count=watched_folder_count,
    )
