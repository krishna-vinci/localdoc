from datetime import datetime
from typing import Any

from pydantic import BaseModel


class BackgroundJobResponse(BaseModel):
    id: str
    job_type: str
    status: str
    target_type: str | None
    target_id: str | None
    payload: dict[str, Any] | None
    summary: dict[str, Any] | None
    error: str | None
    progress_current: int
    progress_total: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}
