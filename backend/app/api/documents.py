from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document import Document
from app.models.document_audit import DocumentWriteEvent
from app.models.document_version import DocumentVersion
from app.models.folder import Folder
from app.models.project import Project
from app.schemas.document import (
    DocumentListResponse,
    DocumentResponse,
    DocumentRestoreRequest,
    DocumentSaveRequest,
    DocumentVersionDetailResponse,
    DocumentVersionSummaryResponse,
    DocumentWriteEventResponse,
)
from app.services.document_editor import (
    get_document_with_folder,
    read_document_disk_state,
    restore_document_version,
    save_document_content,
)

router = APIRouter()


def _serialize_document_list(
    doc: Document,
    *,
    folder: Folder,
    project_id: str | None,
    project_name: str | None,
) -> DocumentListResponse:
    return DocumentListResponse(
        id=doc.id,
        folder_id=doc.folder_id,
        folder_name=folder.name,
        project_id=project_id,
        project_name=project_name,
        source_type=folder.source_type,
        source_path=folder.source_path,
        is_read_only=folder.is_read_only,
        file_path=doc.file_path,
        file_name=doc.file_name,
        title=doc.title,
        tags=doc.tags,
        status=doc.status,
        task_count=doc.task_count,
        updated_at=doc.updated_at,
    )


async def _serialize_document_detail(
    db: AsyncSession,
    doc: Document,
    *,
    folder_name: str | None,
    project_id: str | None,
    project_name: str | None,
) -> DocumentResponse:
    folder = await db.get(Folder, doc.folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    disk_state = await read_document_disk_state(doc, folder)
    return DocumentResponse(
        id=doc.id,
        folder_id=doc.folder_id,
        folder_name=folder_name,
        project_id=project_id,
        project_name=project_name,
        source_type=folder.source_type,
        source_path=folder.source_path,
        is_read_only=folder.is_read_only,
        file_path=doc.file_path,
        file_name=doc.file_name,
        title=doc.title,
        content_hash=doc.content_hash,
        content=doc.content,
        raw_content=disk_state.raw_content,
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
        version_counter=doc.version_counter,
        file_exists=disk_state.file_exists,
        disk_content_hash=disk_state.content_hash if disk_state.file_exists else None,
        has_unindexed_changes=disk_state.file_exists and disk_state.content_hash != doc.content_hash,
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
        select(Document, Folder, Folder.project_id, Project.name)
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
            folder=folder,
            project_id=project_id_value,
            project_name=project_name,
        )
        for doc, folder, project_id_value, project_name in result.all()
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
        select(Document, Folder, Folder.project_id, Project.name)
        .join(Folder, Document.folder_id == Folder.id)
        .outerjoin(Project, Folder.project_id == Project.id)
        .where(
            Document.is_deleted.is_(False),
            Document.content_hash.in_(select(duplicate_hashes.c.content_hash)),
        )
        .order_by(Document.updated_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return [
        _serialize_document_list(
            doc,
            folder=folder,
            project_id=project_id_value,
            project_name=project_name,
        )
        for doc, folder, project_id_value, project_name in result.all()
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
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    doc, folder_name, project_id, project_name = row
    return await _serialize_document_detail(
        db,
        doc,
        folder_name=folder_name,
        project_id=project_id,
        project_name=project_name,
    )


@router.put("/{doc_id}/content", response_model=DocumentResponse)
async def save_document(
    doc_id: str,
    data: DocumentSaveRequest,
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    document, folder = await get_document_with_folder(db, doc_id)
    if folder.is_read_only:
        raise HTTPException(status_code=403, detail="Mirrored remote documents are read-only")
    document = await save_document_content(
        db,
        document=document,
        folder=folder,
        raw_content=data.raw_content,
        expected_content_hash=data.expected_content_hash,
        message=data.message,
    )
    project_name = None
    if folder.project_id:
        project = await db.get(Project, folder.project_id)
        project_name = project.name if project else None
    return await _serialize_document_detail(
        db,
        document,
        folder_name=folder.name,
        project_id=folder.project_id,
        project_name=project_name,
    )


@router.get("/{doc_id}/versions", response_model=list[DocumentVersionSummaryResponse])
async def list_document_versions(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
) -> list[DocumentVersionSummaryResponse]:
    await get_document_with_folder(db, doc_id)
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_number.desc())
        .limit(limit)
    )
    return [DocumentVersionSummaryResponse.model_validate(version) for version in result.scalars().all()]


@router.get("/{doc_id}/versions/{version_id}", response_model=DocumentVersionDetailResponse)
async def get_document_version(
    doc_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
) -> DocumentVersionDetailResponse:
    await get_document_with_folder(db, doc_id)
    version = await db.get(DocumentVersion, version_id)
    if version is None or version.document_id != doc_id:
        raise HTTPException(status_code=404, detail="Document version not found")
    return DocumentVersionDetailResponse.model_validate(version)


@router.post("/{doc_id}/restore/{version_id}", response_model=DocumentResponse)
async def restore_document(
    doc_id: str,
    version_id: str,
    data: DocumentRestoreRequest,
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    document, folder = await get_document_with_folder(db, doc_id)
    if folder.is_read_only:
        raise HTTPException(status_code=403, detail="Mirrored remote documents are read-only")
    version = await db.get(DocumentVersion, version_id)
    if version is None or version.document_id != doc_id:
        raise HTTPException(status_code=404, detail="Document version not found")

    document = await restore_document_version(
        db,
        document=document,
        folder=folder,
        version=version,
        expected_content_hash=data.expected_content_hash,
        message=data.message,
    )
    project_name = None
    if folder.project_id:
        project = await db.get(Project, folder.project_id)
        project_name = project.name if project else None
    return await _serialize_document_detail(
        db,
        document,
        folder_name=folder.name,
        project_id=folder.project_id,
        project_name=project_name,
    )


@router.get("/{doc_id}/audit", response_model=list[DocumentWriteEventResponse])
async def list_document_audit_events(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
) -> list[DocumentWriteEventResponse]:
    await get_document_with_folder(db, doc_id)
    result = await db.execute(
        select(DocumentWriteEvent)
        .where(DocumentWriteEvent.document_id == doc_id)
        .order_by(DocumentWriteEvent.created_at.desc())
        .limit(limit)
    )
    return [DocumentWriteEventResponse.model_validate(event) for event in result.scalars().all()]
