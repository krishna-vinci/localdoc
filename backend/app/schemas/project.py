from datetime import datetime

from pydantic import BaseModel, Field


class ProjectBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    color: str | None = Field(default=None, max_length=32)
    metadata_rules: str | None = None
    default_template: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    color: str | None = Field(default=None, max_length=32)
    metadata_rules: str | None = None
    default_template: str | None = None


class ProjectResponse(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime
    folder_count: int = 0

    model_config = {"from_attributes": True}
