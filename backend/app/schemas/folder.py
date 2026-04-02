from datetime import datetime

from pydantic import BaseModel, Field


class FolderBase(BaseModel):
    path: str = Field(..., max_length=1024)
    name: str = Field(..., max_length=255)


class FolderCreate(FolderBase):
    device_id: str = Field(default="local", max_length=255)
    project_id: str | None = None
    watch_enabled: bool = True
    metadata_rules: str | None = None
    default_template: str | None = None


class FolderUpdate(BaseModel):
    path: str | None = Field(None, max_length=1024)
    name: str | None = Field(None, max_length=255)
    project_id: str | None = None
    is_active: bool | None = None
    watch_enabled: bool | None = None
    metadata_rules: str | None = None
    default_template: str | None = None


class FolderResponse(FolderBase):
    id: str
    project_id: str | None
    project_name: str | None = None
    source_type: str
    source_path: str | None
    storage_path: str | None
    source_share_id: str | None
    is_read_only: bool
    is_active: bool
    watch_enabled: bool
    device_id: str
    metadata_rules: str | None
    default_template: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
