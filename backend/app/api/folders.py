from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.folder import Folder
from app.models.project import Project
from app.schemas.folder import FolderCreate, FolderResponse, FolderUpdate
from app.services.scanner import scan_folder
from app.services.watcher import folder_watcher

router = APIRouter()


def _serialize_folder(folder: Folder, project_name: str | None = None) -> FolderResponse:
    return FolderResponse(
        id=folder.id,
        path=folder.path,
        name=folder.name,
        project_id=folder.project_id,
        project_name=project_name,
        is_active=folder.is_active,
        watch_enabled=folder.watch_enabled,
        device_id=folder.device_id,
        metadata_rules=folder.metadata_rules,
        default_template=folder.default_template,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.get("/", response_model=list[FolderResponse])
async def list_folders(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
) -> list[FolderResponse]:
    result = await db.execute(select(Folder).offset(skip).limit(limit).order_by(Folder.name.asc()))
    folders = result.scalars().all()
    project_ids = {folder.project_id for folder in folders if folder.project_id}
    project_names: dict[str, str] = {}
    if project_ids:
        project_result = await db.execute(select(Project).where(Project.id.in_(project_ids)))
        project_names = {project.id: project.name for project in project_result.scalars().all()}
    return [_serialize_folder(folder, project_names.get(folder.project_id or "")) for folder in folders]


@router.post("/", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(data: FolderCreate, db: AsyncSession = Depends(get_db)) -> FolderResponse:
    if data.project_id:
        project_result = await db.execute(select(Project).where(Project.id == data.project_id))
        if not project_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Project not found")
    folder = Folder(
        path=data.path,
        name=data.name,
        project_id=data.project_id,
        watch_enabled=data.watch_enabled,
        device_id=data.device_id,
        metadata_rules=data.metadata_rules,
        default_template=data.default_template,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    await folder_watcher.refresh_from_database()
    project_name = None
    if folder.project_id:
        project_result = await db.execute(select(Project).where(Project.id == folder.project_id))
        project = project_result.scalar_one_or_none()
        project_name = project.name if project else None
    return _serialize_folder(folder, project_name)


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    data: FolderUpdate,
    db: AsyncSession = Depends(get_db),
) -> FolderResponse:
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if data.path is not None:
        folder.path = data.path
    if data.name is not None:
        folder.name = data.name
    if data.project_id is not None:
        normalized_project_id = data.project_id or None
        if normalized_project_id:
            project_result = await db.execute(select(Project).where(Project.id == normalized_project_id))
            if not project_result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Project not found")
        folder.project_id = normalized_project_id
    if data.is_active is not None:
        folder.is_active = data.is_active
    if data.watch_enabled is not None:
        folder.watch_enabled = data.watch_enabled
    if data.metadata_rules is not None:
        folder.metadata_rules = data.metadata_rules
    if data.default_template is not None:
        folder.default_template = data.default_template
    await db.commit()
    await db.refresh(folder)
    await folder_watcher.refresh_from_database()
    project_name = None
    if folder.project_id:
        project_result = await db.execute(select(Project).where(Project.id == folder.project_id))
        project = project_result.scalar_one_or_none()
        project_name = project.name if project else None
    return _serialize_folder(folder, project_name)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(folder_id: str, db: AsyncSession = Depends(get_db)) -> None:
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.delete(folder)
    await db.commit()
    await folder_watcher.refresh_from_database()


@router.post("/{folder_id}/scan", status_code=status.HTTP_200_OK)
async def scan_folder_endpoint(
    folder_id: str, db: AsyncSession = Depends(get_db)
) -> dict[str, int]:
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    try:
        summary = await scan_folder(folder, db)
    except ValueError as exc:
        await folder_watcher.mark_scan_result(folder, error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await folder_watcher.mark_scan_result(folder, error=None)
    return summary


@router.post("/reindex-all", status_code=status.HTTP_200_OK)
async def reindex_all_folders() -> dict[str, int]:
    return await folder_watcher.force_rescan_all()


@router.get("/watch/status", status_code=status.HTTP_200_OK)
async def get_watch_status() -> list[dict[str, str | bool | None]]:
    return await folder_watcher.get_statuses()


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str, db: AsyncSession = Depends(get_db)) -> FolderResponse:
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    project_name = None
    if folder.project_id:
        project_result = await db.execute(select(Project).where(Project.id == folder.project_id))
        project = project_result.scalar_one_or_none()
        project_name = project.name if project else None
    return _serialize_folder(folder, project_name)
