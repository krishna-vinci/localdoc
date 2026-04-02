from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.job import BackgroundJobResponse
from app.services.background_jobs import get_background_job, list_background_jobs, serialize_background_job

router = APIRouter()


@router.get("/", response_model=list[BackgroundJobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    status: str | None = None,
) -> list[BackgroundJobResponse]:
    jobs = await list_background_jobs(db, limit=limit, status=status)
    return [BackgroundJobResponse.model_validate(serialize_background_job(job)) for job in jobs]


@router.get("/{job_id}", response_model=BackgroundJobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)) -> BackgroundJobResponse:
    job = await get_background_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return BackgroundJobResponse.model_validate(serialize_background_job(job))
