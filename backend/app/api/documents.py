from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document
from app.schemas.document import DocumentListResponse, DocumentResponse, DocumentUpdate

router = APIRouter()


@router.get("/", response_model=list[DocumentListResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    folder_id: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> Sequence[Document]:
    query = select(Document).where(Document.is_deleted.is_(False))
    if folder_id:
        query = query.where(Document.folder_id == folder_id)
    query = query.offset(skip).limit(limit).order_by(Document.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, db: AsyncSession = Depends(get_db)) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.is_deleted.is_(False))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str, data: DocumentUpdate, db: AsyncSession = Depends(get_db)
) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.is_deleted.is_(False))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if data.title is not None:
        doc.title = data.title
    if data.tags is not None:
        doc.tags = data.tags
    await db.commit()
    await db.refresh(doc)
    return doc
