from datetime import datetime

from pydantic import BaseModel, Field


class FolderBase(BaseModel):
    path: str = Field(..., max_length=1024)
    name: str = Field(..., max_length=255)


class FolderCreate(FolderBase):
    device_id: str = Field(..., max_length=255)


class FolderUpdate(BaseModel):
    path: str | None = Field(None, max_length=1024)
    is_active: bool | None = None


class FolderResponse(FolderBase):
    id: str
    is_active: bool
    device_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
