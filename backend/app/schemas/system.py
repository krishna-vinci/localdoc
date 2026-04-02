from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class FolderRuntimeStateResponse(BaseModel):
    folder_id: str
    folder_name: str
    folder_path: str
    device_id: str
    active: bool
    watch_enabled: bool
    watch_state: str
    availability_state: str
    last_checked_at: datetime | None
    last_event_at: datetime | None
    last_successful_scan_at: datetime | None
    last_full_reconcile_at: datetime | None
    consecutive_error_count: int
    last_error: str | None
    last_scan_summary: dict[str, int] | None
    degraded_since: datetime | None


class SystemHealthResponse(BaseModel):
    app_version: str
    status: str
    database_status: str
    watcher_started: bool
    job_runner_started: bool
    active_folder_count: int
    watched_folder_count: int
    degraded_folder_count: int
    unavailable_folder_count: int
    queued_job_count: int
    running_job_count: int
    failed_job_count: int
    generated_at: datetime


class SystemRuntimeResponse(BaseModel):
    generated_at: datetime
    health: SystemHealthResponse
    folders: list[FolderRuntimeStateResponse]


class BackupMetadataResponse(BaseModel):
    schema_version: int | None = None
    app_version: str | None = None
    generated_at: str | None = None


class BackupFileResponse(BaseModel):
    name: str
    path: str
    size_bytes: int
    created_at: str
    metadata: BackupMetadataResponse | None = None


class BackupValidationRequest(BaseModel):
    backup_name: str = Field(..., min_length=1, max_length=255)


class BackupValidationResponse(BaseModel):
    backup_name: str
    valid: bool
    errors: list[str]
    warnings: list[str]
    counts: dict[str, int]
    metadata: dict[str, Any] | None = None


class SupportBundleResponse(BaseModel):
    generated_at: datetime
    app_version: str
    system_health: SystemHealthResponse
    runtime: SystemRuntimeResponse
    recent_failed_jobs: list[dict[str, Any]]
    backup_files: list[BackupFileResponse]
