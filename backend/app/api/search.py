from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document

router = APIRouter()


class SearchResult(BaseModel):
    id: str
    file_name: str
    title: str
    file_path: str
    snippet: str | None

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[SearchResult])
async def search_documents(
    db: AsyncSession = Depends(get_db),
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(20, ge=1, le=100),
) -> list[SearchResult]:
    pattern = f"%{q}%"
    query = (
        select(Document)
        .where(
            Document.is_deleted.is_(False),
            or_(
                Document.title.ilike(pattern),
                Document.content.ilike(pattern),
                Document.tags.ilike(pattern),
            ),
        )
        .limit(limit)
    )
    result = await db.execute(query)
    docs = result.scalars().all()

    results = []
    for doc in docs:
        snippet = None
        q_lower = q.lower()
        content_lower = doc.content.lower()
        idx = content_lower.find(q_lower)
        if idx != -1:
            start = max(0, idx - 40)
            end = min(len(doc.content), idx + len(q) + 40)
            snippet = ("..." if start > 0 else "") + doc.content[start:end] + ("..." if end < len(doc.content) else "")
        results.append(
            SearchResult(
                id=doc.id,
                file_name=doc.file_name,
                title=doc.title,
                file_path=doc.file_path,
                snippet=snippet,
            )
        )
    return results
