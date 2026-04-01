from pydantic import BaseModel


class StatsResponse(BaseModel):
    document_count: int
    folder_count: int
    project_count: int
    tag_count: int
    orphan_document_count: int
    duplicate_candidate_count: int
    watched_folder_count: int
