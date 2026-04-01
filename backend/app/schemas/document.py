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
    raw_content: str
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
    version_counter: int
    file_exists: bool
    disk_content_hash: str | None
    has_unindexed_changes: bool

    model_config = {"from_attributes": True}


class DocumentSaveRequest(BaseModel):
    raw_content: str
    expected_content_hash: str = Field(..., min_length=64, max_length=64)
    message: str | None = Field(None, max_length=2000)


class DocumentRestoreRequest(BaseModel):
    expected_content_hash: str = Field(..., min_length=64, max_length=64)
    message: str | None = Field(None, max_length=2000)


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


class DocumentVersionSummaryResponse(BaseModel):
    id: str
    version_number: int
    change_type: str
    content_hash: str
    size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentVersionDetailResponse(DocumentVersionSummaryResponse):
    content: str


class DocumentWriteEventResponse(BaseModel):
    id: str
    action: str
    actor: str
    previous_content_hash: str
    new_content_hash: str
    message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
