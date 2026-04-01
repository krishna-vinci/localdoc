from datetime import datetime

from pydantic import BaseModel, Field


class DocumentBase(BaseModel):
    file_path: str = Field(..., max_length=2048)
    file_name: str = Field(..., max_length=255)
    title: str = Field(..., max_length=512)


class DocumentResponse(DocumentBase):
    id: str
    folder_id: str
    content_hash: str
    content: str
    frontmatter: str | None
    tags: str | None
    size_bytes: int
    is_deleted: bool
    device_id: str
    created_at: datetime
    updated_at: datetime
    indexed_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    id: str
    file_name: str
    title: str
    tags: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}
