from datetime import datetime

from pydantic import BaseModel, Field


class EnrollmentTokenCreateRequest(BaseModel):
    note: str | None = Field(None, max_length=255)
    expires_in_minutes: int = Field(default=30, ge=1, le=1440)


class EnrollmentTokenResponse(BaseModel):
    id: str
    token: str
    note: str | None
    expires_at: datetime
    created_at: datetime


class DeviceEnrollRequest(BaseModel):
    enrollment_token: str = Field(..., min_length=8, max_length=255)
    display_name: str = Field(..., min_length=1, max_length=255)
    hostname: str | None = Field(None, max_length=255)
    platform: str | None = Field(None, max_length=64)
    agent_version: str | None = Field(None, max_length=64)


class DeviceAuthResponse(BaseModel):
    device_id: str
    device_token: str
    status: str


class AgentHeartbeatRequest(BaseModel):
    display_name: str | None = Field(None, max_length=255)
    hostname: str | None = Field(None, max_length=255)
    platform: str | None = Field(None, max_length=64)
    agent_version: str | None = Field(None, max_length=64)


class DeviceShareUpsertRequest(BaseModel):
    id: str | None = None
    display_name: str = Field(..., min_length=1, max_length=255)
    source_path: str = Field(..., min_length=1, max_length=2048)
    include_globs: list[str] = Field(default_factory=list)
    exclude_globs: list[str] = Field(default_factory=list)
    sync_enabled: bool = True


class DeviceShareUpdateRequest(BaseModel):
    sync_enabled: bool


class DeviceShareRequestCreateRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=255)
    source_path: str = Field(..., min_length=1, max_length=2048)
    include_globs: list[str] = Field(default_factory=list)
    exclude_globs: list[str] = Field(default_factory=list)
    sync_enabled: bool = True


class DeviceShareRequestDecisionRequest(BaseModel):
    approve: bool
    response_message: str | None = Field(None, max_length=2048)


class DeviceShareRequestResponse(BaseModel):
    id: str
    device_id: str
    display_name: str
    source_path: str
    include_globs: list[str]
    exclude_globs: list[str]
    sync_enabled: bool
    status: str
    response_message: str | None
    requested_at: datetime
    responded_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DeviceShareResponse(BaseModel):
    id: str
    device_id: str
    display_name: str
    source_path: str
    storage_path: str
    include_globs: list[str]
    exclude_globs: list[str]
    sync_enabled: bool
    last_snapshot_generation: str | None
    last_sync_at: datetime | None
    file_count: int = 0
    active_file_count: int = 0
    failed_batch_count: int = 0
    last_error: str | None = None
    last_error_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DeviceResponse(BaseModel):
    id: str
    display_name: str
    hostname: str | None
    platform: str | None
    agent_version: str | None
    status: str
    last_seen_at: datetime | None
    approved_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    updated_at: datetime
    share_count: int = 0


class BatchEntry(BaseModel):
    op: str = Field(..., pattern="^(upsert|delete|present)$")
    path: str = Field(..., min_length=1, max_length=2048)
    size_bytes: int | None = Field(None, ge=0)
    mtime_ns: int | None = Field(None, ge=0)
    sha256: str | None = Field(None, min_length=64, max_length=64)
    content_b64: str | None = None


class SnapshotStartRequest(BaseModel):
    batch_id: str = Field(..., min_length=1, max_length=128)
    generation_id: str = Field(..., min_length=1, max_length=128)


class SnapshotCompleteRequest(BaseModel):
    batch_id: str = Field(..., min_length=1, max_length=128)
    generation_id: str = Field(..., min_length=1, max_length=128)


class SyncBatchRequest(BaseModel):
    batch_id: str = Field(..., min_length=1, max_length=128)
    generation_id: str = Field(..., min_length=1, max_length=128)
    entries: list[BatchEntry] = Field(default_factory=list)


class SyncBatchResponse(BaseModel):
    status: str
    batch_id: str
    applied_entries: int
    generation_id: str | None = None


class AgentConfigResponse(BaseModel):
    device: DeviceResponse
    shares: list[DeviceShareResponse]
    share_requests: list[DeviceShareRequestResponse] = Field(default_factory=list)


class SyncHealthResponse(BaseModel):
    device_count: int
    approved_device_count: int
    revoked_device_count: int
    stale_device_count: int
    share_count: int
    synced_share_count: int
    pending_batch_count: int
    failed_batch_count: int
    recent_batches: list[dict[str, str | int | None]]
    recent_failures: list[dict[str, str | int | None]]
