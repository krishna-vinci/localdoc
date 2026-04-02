from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.background_job import BackgroundJob
from app.schemas.job import BackgroundJobResponse
from app.schemas.system import (
    BackupFileResponse,
    BackupValidationRequest,
    BackupValidationResponse,
    FolderRuntimeStateResponse,
    SupportBundleResponse,
    SystemHealthResponse,
    SystemRuntimeResponse,
)
from app.services.background_jobs import (
    JOB_TYPE_CREATE_BACKUP,
    JOB_STATUS_FAILED,
    JOB_STATUS_QUEUED,
    JOB_TYPE_RESTORE_BACKUP,
    JOB_STATUS_RUNNING,
    JOB_TYPE_DRIFT_CHECK,
    create_background_job,
    list_background_jobs,
    serialize_background_job,
)
from app.services.folder_runtime import (
    AVAILABILITY_AVAILABLE,
    AVAILABILITY_UNKNOWN,
    WATCH_STATE_DEGRADED,
    WATCH_STATE_FAILED,
    list_folder_runtime_rows,
    parse_scan_summary,
)
from app.services.background_jobs import background_job_runner
from app.services.watcher import folder_watcher
from app.services.system_backup import list_backups, read_backup_file, validate_backup_payload

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.utcnow()


async def _count_jobs_by_status(db: AsyncSession, *, job_status: str) -> int:
    result = await db.execute(
        select(func.count()).select_from(BackgroundJob).where(BackgroundJob.status == job_status)
    )
    return int(result.scalar_one())


async def build_system_health(db: AsyncSession) -> SystemHealthResponse:
    await db.execute(text("SELECT 1"))

    runtime_rows = await list_folder_runtime_rows(db)
    active_folder_count = sum(1 for folder, _ in runtime_rows if folder.is_active)
    watched_folder_count = sum(
        1 for folder, _ in runtime_rows if folder.is_active and folder.watch_enabled
    )
    degraded_folder_count = sum(
        1
        for _, state in runtime_rows
        if state is not None and state.watch_state in {WATCH_STATE_DEGRADED, WATCH_STATE_FAILED}
    )
    unavailable_folder_count = sum(
        1
        for _, state in runtime_rows
        if state is not None
        and state.availability_state not in {AVAILABILITY_AVAILABLE, AVAILABILITY_UNKNOWN}
    )

    queued_job_count = await _count_jobs_by_status(db, job_status=JOB_STATUS_QUEUED)
    running_job_count = await _count_jobs_by_status(db, job_status=JOB_STATUS_RUNNING)
    failed_job_count = await _count_jobs_by_status(db, job_status=JOB_STATUS_FAILED)

    overall_status = "healthy"
    if degraded_folder_count > 0 or unavailable_folder_count > 0 or failed_job_count > 0:
        overall_status = "degraded"

    return SystemHealthResponse(
        app_version=settings.APP_VERSION,
        status=overall_status,
        database_status="healthy",
        watcher_started=folder_watcher.is_started,
        job_runner_started=background_job_runner.is_started,
        active_folder_count=active_folder_count,
        watched_folder_count=watched_folder_count,
        degraded_folder_count=degraded_folder_count,
        unavailable_folder_count=unavailable_folder_count,
        queued_job_count=queued_job_count,
        running_job_count=running_job_count,
        failed_job_count=failed_job_count,
        generated_at=_utcnow(),
    )


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(db: AsyncSession = Depends(get_db)) -> SystemHealthResponse:
    return await build_system_health(db)


@router.get("/runtime", response_model=SystemRuntimeResponse)
async def get_system_runtime(db: AsyncSession = Depends(get_db)) -> SystemRuntimeResponse:
    health = await build_system_health(db)
    runtime_rows = await list_folder_runtime_rows(db)

    folders = [
        FolderRuntimeStateResponse(
            folder_id=folder.id,
            folder_name=folder.name,
            folder_path=folder.path,
            device_id=folder.device_id,
            active=folder.is_active,
            watch_enabled=folder.watch_enabled,
            watch_state=state.watch_state if state is not None else "idle",
            availability_state=state.availability_state if state is not None else "unknown",
            last_checked_at=state.last_checked_at if state is not None else None,
            last_event_at=state.last_event_at if state is not None else None,
            last_successful_scan_at=(state.last_successful_scan_at if state is not None else None),
            last_full_reconcile_at=(state.last_full_reconcile_at if state is not None else None),
            consecutive_error_count=state.consecutive_error_count if state is not None else 0,
            last_error=state.last_error if state is not None else None,
            last_scan_summary=parse_scan_summary(state.last_scan_summary) if state is not None else None,
            degraded_since=state.degraded_since if state is not None else None,
        )
        for folder, state in runtime_rows
    ]

    return SystemRuntimeResponse(generated_at=_utcnow(), health=health, folders=folders)


@router.post("/drift-check", response_model=BackgroundJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_drift_check(db: AsyncSession = Depends(get_db)) -> BackgroundJobResponse:
    job = await create_background_job(
        db,
        job_type=JOB_TYPE_DRIFT_CHECK,
        target_type="system",
        target_id="drift-check",
        payload={"scope": "active-folders"},
        dedupe=True,
    )
    return BackgroundJobResponse.model_validate(serialize_background_job(job))


@router.get("/recent-failures", response_model=list[BackgroundJobResponse])
async def get_recent_failures(db: AsyncSession = Depends(get_db)) -> list[BackgroundJobResponse]:
    jobs = await list_background_jobs(db, limit=10, status=JOB_STATUS_FAILED)
    return [BackgroundJobResponse.model_validate(serialize_background_job(job)) for job in jobs]


@router.post("/backup", response_model=BackgroundJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_backup(db: AsyncSession = Depends(get_db)) -> BackgroundJobResponse:
    job = await create_background_job(
        db,
        job_type=JOB_TYPE_CREATE_BACKUP,
        target_type="system",
        target_id="backup",
        payload={"scope": "db-and-config"},
        dedupe=True,
    )
    return BackgroundJobResponse.model_validate(serialize_background_job(job))


@router.get("/backups", response_model=list[BackupFileResponse])
async def get_backups() -> list[BackupFileResponse]:
    backups = await list_backups()
    return [BackupFileResponse.model_validate(item) for item in backups]


@router.post("/restore/validate", response_model=BackupValidationResponse)
async def validate_restore_backup(payload: BackupValidationRequest) -> BackupValidationResponse:
    try:
        backup_payload = await read_backup_file(payload.backup_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    validation = validate_backup_payload(backup_payload)
    return BackupValidationResponse(
        backup_name=payload.backup_name,
        valid=validation["valid"],
        errors=validation["errors"],
        warnings=validation["warnings"],
        counts=validation["counts"],
        metadata=validation["metadata"],
    )


@router.post("/restore", response_model=BackgroundJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def restore_backup(
    payload: BackupValidationRequest,
    db: AsyncSession = Depends(get_db),
) -> BackgroundJobResponse:
    try:
        await read_backup_file(payload.backup_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    job = await create_background_job(
        db,
        job_type=JOB_TYPE_RESTORE_BACKUP,
        target_type="backup",
        target_id=payload.backup_name,
        payload={"backup_name": payload.backup_name},
        dedupe=False,
    )
    return BackgroundJobResponse.model_validate(serialize_background_job(job))


@router.get("/support-bundle", response_model=SupportBundleResponse)
async def get_support_bundle(db: AsyncSession = Depends(get_db)) -> SupportBundleResponse:
    health = await build_system_health(db)
    runtime = await get_system_runtime(db)
    jobs = await list_background_jobs(db, limit=10, status=JOB_STATUS_FAILED)
    backups = await list_backups()
    return SupportBundleResponse(
        generated_at=_utcnow(),
        app_version=settings.APP_VERSION,
        system_health=health,
        runtime=runtime,
        recent_failed_jobs=[serialize_background_job(job) for job in jobs],
        backup_files=[BackupFileResponse.model_validate(item) for item in backups],
    )
