from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document
from app.models.folder import Folder
from app.models.project import Project
from app.schemas.document import DocumentListResponse, DocumentResponse, DocumentUpdate

router = APIRouter()


def _serialize_document_list(
    doc: Document,
    *,
    folder_name: str | None,
    project_id: str | None,
    project_name: str | None,
) -> DocumentListResponse:
    return DocumentListResponse(
        id=doc.id,
        folder_id=doc.folder_id,
        folder_name=folder_name,
        project_id=project_id,
        project_name=project_name,
        file_path=doc.file_path,
        file_name=doc.file_name,
        title=doc.title,
        tags=doc.tags,
        status=doc.status,
        task_count=doc.task_count,
        updated_at=doc.updated_at,
    )


def _serialize_document_detail(
    doc: Document,
    *,
    folder_name: str | None,
    project_id: str | None,
    project_name: str | None,
) -> DocumentResponse:
    return DocumentResponse(
        id=doc.id,
        folder_id=doc.folder_id,
        folder_name=folder_name,
        project_id=project_id,
        project_name=project_name,
        file_path=doc.file_path,
        file_name=doc.file_name,
        title=doc.title,
        content_hash=doc.content_hash,
        content=doc.content,
        frontmatter=doc.frontmatter,
        tags=doc.tags,
        status=doc.status,
        headings=doc.headings,
        links=doc.links,
        tasks=doc.tasks,
        task_count=doc.task_count,
        size_bytes=doc.size_bytes,
        is_deleted=doc.is_deleted,
        device_id=doc.device_id,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        indexed_at=doc.indexed_at,
    )


@router.get("/", response_model=list[DocumentListResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    folder_id: str | None = None,
    project_id: str | None = None,
    tag: str | None = None,
    status: str | None = None,
    orphaned: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[DocumentListResponse]:
    query = (
        select(Document, Folder.name, Folder.project_id, Project.name)
        .join(Folder, Document.folder_id == Folder.id)
        .outerjoin(Project, Folder.project_id == Project.id)
        .where(Document.is_deleted.is_(False))
    )
    if folder_id:
        query = query.where(Document.folder_id == folder_id)
    if project_id:
        query = query.where(Folder.project_id == project_id)
    if tag:
        query = query.where(Document.tags.ilike(f"%{tag}%"))
    if status:
        query = query.where(Document.status == status)
    if orphaned:
        query = query.where(Folder.project_id.is_(None))
    query = query.offset(skip).limit(limit).order_by(Document.updated_at.desc())
    result = await db.execute(query)
    return [
        _serialize_document_list(
            doc,
            folder_name=folder_name,
            project_id=project_id_value,
            project_name=project_name,
        )
        for doc, folder_name, project_id_value, project_name in result.all()
    ]


@router.get("/insights/orphans", response_model=list[DocumentListResponse])
async def list_orphan_documents(
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
) -> list[DocumentListResponse]:
    return await list_documents(db=db, orphaned=True, limit=limit)


@router.get("/insights/duplicates", response_model=list[DocumentListResponse])
async def list_duplicate_candidates(
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
) -> list[DocumentListResponse]:
    duplicate_hashes = (
        select(Document.content_hash)
        .where(Document.is_deleted.is_(False))
        .group_by(Document.content_hash)
        .having(func.count(Document.id) > 1)
        .subquery()
    )
    query = (
        select(Document, Folder.name, Folder.project_id, Project.name)
        .join(Folder, Document.folder_id == Folder.id)
        .outerjoin(Project, Folder.project_id == Project.id)
        .where(Document.is_deleted.is_(False), Document.content_hash.in_(select(duplicate_hashes.c.content_hash)))
        .order_by(Document.updated_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [
        _serialize_document_list(
            doc,
            folder_name=folder_name,
            project_id=project_id_value,
            project_name=project_name,
        )
        for doc, folder_name, project_id_value, project_name in result.all()
    ]


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, db: AsyncSession = Depends(get_db)) -> DocumentResponse:
    result = await db.execute(
        select(Document, Folder.name, Folder.project_id, Project.name)
        .join(Folder, Document.folder_id == Folder.id)
        .outerjoin(Project, Folder.project_id == Project.id)
        .where(Document.id == doc_id, Document.is_deleted.is_(False))
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    doc, folder_name, project_id, project_name = row
    return _serialize_document_detail(
        doc,
        folder_name=folder_name,
        project_id=project_id,
        project_name=project_name,
    )


@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str, data: DocumentUpdate, db: AsyncSession = Depends(get_db)
) -> DocumentResponse:
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
    if data.status is not None:
        doc.status = data.status
    await db.commit()
    await db.refresh(doc)
    folder_result = await db.execute(select(Folder).where(Folder.id == doc.folder_id))
    folder = folder_result.scalar_one()
    project_name = None
    if folder.project_id:
        project_result = await db.execute(select(Project).where(Project.id == folder.project_id))
        project = project_result.scalar_one_or_none()
        project_name = project.name if project else None
    return _serialize_document_detail(
        doc,
        folder_name=folder.name,
        project_id=folder.project_id,
        project_name=project_name,
    )
