from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document
from app.models.folder import Folder
from app.schemas.stats import StatsResponse

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

    return StatsResponse(
        document_count=document_count,
        folder_count=folder_count,
        tag_count=len(all_tags),
    )
