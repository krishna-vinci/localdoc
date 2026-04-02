from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.folder import Folder
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter()


async def _serialize_project(project: Project, db: AsyncSession) -> ProjectResponse:
    count_result = await db.execute(
        select(func.count()).select_from(Folder).where(Folder.project_id == project.id)
    )
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        color=project.color,
        metadata_rules=project.metadata_rules,
        default_template=project.default_template,
        created_at=project.created_at,
        updated_at=project.updated_at,
        folder_count=count_result.scalar_one(),
    )


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)) -> list[ProjectResponse]:
    result = await db.execute(select(Project).order_by(Project.name.asc()))
    projects = result.scalars().all()
    return [await _serialize_project(project, db) for project in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)) -> ProjectResponse:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _serialize_project(project, db)


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)) -> ProjectResponse:
    project = Project(
        name=data.name,
        description=data.description,
        color=data.color,
        metadata_rules=data.metadata_rules,
        default_template=data.default_template,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return await _serialize_project(project, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for field in ["name", "description", "color", "metadata_rules", "default_template"]:
        value = getattr(data, field)
        if value is not None:
            setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return await _serialize_project(project, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)) -> None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
