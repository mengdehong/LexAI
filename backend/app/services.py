from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from functools import lru_cache
from importlib import import_module
from typing import TYPE_CHECKING, Any, List

from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse

from .config import get_settings

try:
    import rust_core
except ImportError as exc:  # pragma: no cover - exercised during runtime
    raise RuntimeError("rust_core module is required for document processing") from exc


COLLECTION_NAME = "lexai_documents"

if TYPE_CHECKING:  # pragma: no cover - typing aid only
    from sentence_transformers import SentenceTransformer as _SentenceTransformer


@lru_cache
def get_text_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)


@lru_cache
def get_embedder(model_name: str) -> "_SentenceTransformer | Any":
    try:
        module = import_module("sentence_transformers")
    except ImportError as exc:  # pragma: no cover - exercised during runtime
        raise RuntimeError(
            "sentence-transformers package is required for embedding generation"
        ) from exc

    SentenceTransformer = getattr(module, "SentenceTransformer")
    return SentenceTransformer(model_name)


def create_qdrant_client(destination: str) -> QdrantClient:
    if destination.startswith("http://") or destination.startswith("https://"):
        return QdrantClient(url=destination)

    if destination == ":memory:":
        return QdrantClient(location=destination)

    local_path = Path(destination)
    local_path.mkdir(parents=True, exist_ok=True)
    return QdrantClient(path=str(local_path))


def ensure_collection(client: QdrantClient, vector_size: int) -> None:
    try:
        client.get_collection(COLLECTION_NAME)
    except (UnexpectedResponse, ValueError):
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=vector_size,
                distance=models.Distance.COSINE,
            ),
        )


async def process_and_embed_document(file_path: str, document_id: str) -> None:
    settings = get_settings()

    try:
        extracted_text = await asyncio.to_thread(rust_core.extract_text, file_path)
    except Exception as exc:  # pragma: no cover - rust_core failure surfaces at runtime
        raise RuntimeError(f"Failed to extract text from document: {exc}") from exc
    text = extracted_text.strip()

    if not text:
        raise ValueError("Extracted document text is empty")

    splitter = get_text_splitter()
    chunks = splitter.split_text(text)

    if not chunks:
        raise ValueError("No text chunks were generated from the document")

    embedder = get_embedder(settings.embedding_model_name)
    embeddings = await asyncio.to_thread(
        embedder.encode,
        chunks,
        convert_to_numpy=True,
    )

    vectors: List[List[float]] = embeddings.tolist()

    if not vectors:
        raise ValueError("No embeddings generated for document chunks")

    client = create_qdrant_client(settings.qdrant_host)
    await asyncio.to_thread(ensure_collection, client, len(vectors[0]))

    points = [
        models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={"document_id": document_id, "chunk_text": chunk_text},
        )
        for idx, (vector, chunk_text) in enumerate(zip(vectors, chunks))
    ]

    await asyncio.to_thread(
        client.upsert,
        collection_name=COLLECTION_NAME,
        points=points,
        wait=True,
    )
