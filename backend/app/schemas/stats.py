from pydantic import BaseModel


class StatsResponse(BaseModel):
    document_count: int
    folder_count: int
    tag_count: int
