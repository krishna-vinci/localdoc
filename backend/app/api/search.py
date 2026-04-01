from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import String, cast, func, literal, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document
from app.models.folder import Folder
from app.models.project import Project

router = APIRouter()


class SearchResult(BaseModel):
    id: str
    folder_id: str
    folder_name: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    file_name: str
    title: str
    file_path: str
    snippet: str | None
    tags: str | None
    status: str | None
    task_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[SearchResult])
async def search_documents(
    db: AsyncSession = Depends(get_db),
    q: str = Query(..., min_length=1, max_length=200),
    folder_id: str | None = None,
    project_id: str | None = None,
    tag: str | None = None,
    status: str | None = None,
    limit: int = Query(20, ge=1, le=100),
) -> list[SearchResult]:
    pattern = f"%{q}%"
    english_config = literal_column("'english'::regconfig")
    searchable_text = func.concat_ws(
        literal(" "),
        func.coalesce(Document.title, ""),
        func.coalesce(Document.content, ""),
        func.coalesce(Document.tags, ""),
        func.coalesce(Document.status, ""),
        func.coalesce(Document.headings, ""),
        func.coalesce(Document.links, ""),
        func.coalesce(Document.tasks, ""),
    )
    search_vector = func.to_tsvector(english_config, searchable_text)
    search_query = func.websearch_to_tsquery(english_config, q)
    rank = func.ts_rank_cd(search_vector, search_query)
    query = (
        select(Document, Folder.name, Folder.project_id, Project.name, rank)
        .join(Folder, Document.folder_id == Folder.id)
        .outerjoin(Project, Folder.project_id == Project.id)
        .where(
            Document.is_deleted.is_(False),
            or_(
                search_vector.op("@@")(search_query),
                Document.title.ilike(pattern),
                Document.content.ilike(pattern),
                Document.tags.ilike(pattern),
            ),
        )
        .order_by(rank.desc(), Document.updated_at.desc())
    )
    if folder_id:
        query = query.where(Document.folder_id == folder_id)
    if project_id:
        query = query.where(Folder.project_id == project_id)
    if tag:
        query = query.where(Document.tags.ilike(f"%{tag}%"))
    if status:
        query = query.where(Document.status == status)
    query = query.limit(limit)
    result = await db.execute(query)
    rows = result.all()

    results = []
    for doc, folder_name, doc_project_id, project_name, _ in rows:
        snippet = None
        headline_result = await db.execute(
            select(
                func.ts_headline(
                    english_config,
                    cast(Document.content, String),
                    search_query,
                    literal("StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=18,MinWords=8"),
                )
            ).where(Document.id == doc.id)
        )
        snippet = headline_result.scalar_one_or_none()
        results.append(
            SearchResult(
                id=doc.id,
                folder_id=doc.folder_id,
                folder_name=folder_name,
                project_id=doc_project_id,
                project_name=project_name,
                file_name=doc.file_name,
                title=doc.title,
                file_path=doc.file_path,
                snippet=snippet,
                tags=doc.tags,
                status=doc.status,
                task_count=doc.task_count,
                updated_at=doc.updated_at,
            )
        )
    return results
