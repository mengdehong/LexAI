from pydantic import BaseModel


class DocumentUploadResponse(BaseModel):
    document_id: str
    status: str
    message: str


class SearchResult(BaseModel):
    chunk_text: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
