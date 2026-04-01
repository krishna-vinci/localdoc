from datetime import datetime

from pydantic import BaseModel, Field


class DocumentBase(BaseModel):
    file_path: str = Field(..., max_length=2048)
    file_name: str = Field(..., max_length=255)
    title: str = Field(..., max_length=512)


class DocumentResponse(DocumentBase):
    id: str
    folder_id: str
    folder_name: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    content_hash: str
    content: str
    frontmatter: str | None
    tags: str | None
    status: str | None
    headings: str | None
    links: str | None
    tasks: str | None
    task_count: int
    size_bytes: int
    is_deleted: bool
    device_id: str
    created_at: datetime
    updated_at: datetime
    indexed_at: datetime

    model_config = {"from_attributes": True}


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, max_length=512)
    tags: str | None = None
    status: str | None = Field(None, max_length=100)


class DocumentListResponse(BaseModel):
    id: str
    folder_id: str
    folder_name: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    file_path: str
    file_name: str
    title: str
    tags: str | None
    status: str | None
    task_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}
