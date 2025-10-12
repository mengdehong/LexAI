from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from qdrant_client import QdrantClient, models

from ..config import Settings, get_settings
from ..schemas import DocumentUploadResponse, SearchResponse, SearchResult
from ..services import COLLECTION_NAME, get_embedder, process_and_embed_document


router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> DocumentUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    document_id = str(uuid.uuid4())
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename).name
    temp_path = upload_dir / f"{document_id}_{safe_name}"

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    temp_path.write_bytes(contents)

    try:
        await process_and_embed_document(str(temp_path), document_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - unexpected runtime failure
        raise HTTPException(status_code=500, detail=f"Failed to process document: {exc}") from exc
    finally:
        temp_path.unlink(missing_ok=True)

    return DocumentUploadResponse(
        document_id=document_id,
        status="processed",
        message="Document processed successfully",
    )


@router.get("/{doc_id}/search", response_model=SearchResponse)
async def search_document(
    doc_id: str,
    term: str = Query(..., min_length=1),
    settings: Settings = Depends(get_settings),
) -> SearchResponse:
    embedder = get_embedder(settings.embedding_model_name)
    query_vector = await asyncio.to_thread(
        embedder.encode,
        term,
        convert_to_numpy=True,
    )

    client = QdrantClient(url=settings.qdrant_host)
    query_filter = models.Filter(
        must=[
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=doc_id),
            )
        ]
    )

    try:
        hits = await asyncio.to_thread(
            client.search,
            collection_name=COLLECTION_NAME,
            query_vector=query_vector.tolist(),
            query_filter=query_filter,
            limit=5,
        )
    except Exception as exc:  # pragma: no cover - unexpected runtime failure
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc

    results = [
        SearchResult(
            chunk_text=hit.payload.get("chunk_text", ""),
            score=hit.score,
        )
        for hit in hits
    ]

    return SearchResponse(results=results)
