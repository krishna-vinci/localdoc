from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.models.document import Document
from app.schemas.document import DocumentResponse, DocumentListResponse

router = APIRouter()


@router.get("/", response_model=list[DocumentListResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    folder_id: str | None = None,
    skip: int = 0,
    limit: int = 50,
):
    query = select(Document).where(Document.is_deleted == False)
    if folder_id:
        query = query.where(Document.folder_id == folder_id)
    query = query.offset(skip).limit(limit).order_by(Document.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.is_deleted == False)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
