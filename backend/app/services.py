from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from functools import lru_cache
from importlib import import_module
from typing import TYPE_CHECKING, Any, List, Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse

from .config import get_settings


class DocumentProcessingError(Exception):
    """Raised when a document fails to be processed due to user-actionable issues."""

    def __init__(self, code: str, message: str, original: Optional[Exception] = None) -> None:
        super().__init__(message)
        self.code = code
        self.original = original


def _classify_extraction_failure(exc: Exception) -> DocumentProcessingError:
    # Safely convert exception to string, handling potential surrogates
    # Use repr() first as it's safer, then clean surrogates
    try:
        message = str(exc)
        # Test if the message can be encoded to UTF-8
        message.encode('utf-8', errors='strict')
    except (UnicodeEncodeError, UnicodeDecodeError):
        # If str(exc) has surrogates, use repr and filter
        raw = repr(exc)
        message = "".join(char for char in raw if ord(char) < 0xD800 or ord(char) > 0xDFFF)
    
    try:
        lowered = message.lower()
    except:
        lowered = ""

    if "encrypted" in lowered:
        return DocumentProcessingError(
            "encrypted_document",
            "Failed to parse encrypted document. Remove the password protection and try again.",
            exc,
        )

    if "password" in lowered:
        return DocumentProcessingError(
            "password_protected",
            "Document is password protected and cannot be processed.",
            exc,
        )

    if any(keyword in lowered for keyword in ("invalid file header", "unsupported", "format")):
        return DocumentProcessingError(
            "unsupported_format",
            "Unsupported document format. Please upload a PDF file.",
            exc,
        )

    if "tika" in lowered and "timeout" in lowered:
        return DocumentProcessingError(
            "parser_timeout",
            "Document parsing timed out. Try simplifying the file or splitting it.",
            exc,
        )

    return DocumentProcessingError(
        "extraction_failure",
        f"Failed to extract document text: {message}",
        exc,
    )

try:
    import rust_core  # type: ignore
except ImportError:  # pragma: no cover - runtime fallback for tests/CI without rust_core
    class _RustCoreFallback:
        @staticmethod
        def extract_text(_: str) -> str:
            raise RuntimeError("rust_core module is required for document processing")

    rust_core = _RustCoreFallback()  # type: ignore


def _extract_pdf_text_fallback(file_path: str) -> str:
    try:
        from pdfminer.high_level import extract_text  # type: ignore
    except Exception as exc:  # pragma: no cover - optional fallback
        raise RuntimeError(
            "PDF extraction fallback unavailable (pdfminer.six not installed)"
        ) from exc

    try:
        return extract_text(file_path) or ""
    except Exception as exc:
        raise RuntimeError(f"pdfminer failed to extract text: {exc}") from exc


COLLECTION_NAME = "lexai_documents"

if TYPE_CHECKING:  # pragma: no cover - typing aid only
    from sentence_transformers import SentenceTransformer as _SentenceTransformer


@lru_cache
def get_text_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)


@lru_cache
def get_embedder(model_name: str, cache_dir: Optional[str] = None) -> "_SentenceTransformer | Any":
    try:
        module = import_module("sentence_transformers")
    except ImportError as exc:  # pragma: no cover - exercised during runtime
        raise RuntimeError(
            "sentence-transformers package is required for embedding generation"
        ) from exc

    # Resolve cache directory from env if not explicitly provided
    if cache_dir is None:
        cache_dir = (
            os.environ.get("HUGGINGFACE_HUB_CACHE")
            or os.environ.get("HF_HUB_CACHE")
            or os.environ.get("HF_HOME")
            or os.environ.get("TRANSFORMERS_CACHE")
            or os.environ.get("SENTENCE_TRANSFORMERS_HOME")
        )

    SentenceTransformer = getattr(module, "SentenceTransformer")
    try:
        if cache_dir:
            return SentenceTransformer(model_name, cache_folder=cache_dir)
        return SentenceTransformer(model_name)
    except TypeError:
        # Older versions may not support cache_folder kwarg
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


async def process_and_embed_document(file_path: str, document_id: str) -> str:
    settings = get_settings()

    # Lightweight support for plain text/markdown without invoking rust_core
    ext = Path(file_path).suffix.lower()
    if ext in {".md", ".markdown", ".txt"}:
        try:
            extracted_text = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except Exception as exc:
            raise _classify_extraction_failure(exc) from exc
    else:
        try:
            extracted_text = await asyncio.to_thread(rust_core.extract_text, file_path)
        except Exception as exc:  # pragma: no cover - rust_core failure surfaces at runtime
            # Try pure-Python fallback (pdfminer.six) when rust_core fails (e.g., surrogate issues)
            try:
                extracted_text = await asyncio.to_thread(_extract_pdf_text_fallback, file_path)
            except Exception:
                raise _classify_extraction_failure(exc) from exc
    # Sanitize text: replace invalid surrogates to avoid UTF-8 encode errors on Windows
    # First, encode with 'surrogateescape' to handle Windows filesystem encoding issues,
    # then decode with 'replace' to convert any remaining problematic characters
    try:
        # Handle surrogate pairs from Windows filesystem encoding
        text = extracted_text.encode("utf-8", errors="surrogateescape").decode("utf-8", errors="replace")
    except (UnicodeDecodeError, UnicodeEncodeError):
        # Fallback: aggressive sanitization - remove all surrogates
        try:
            text = extracted_text.encode("utf-8", errors="replace").decode("utf-8")
        except Exception:
            # Last resort: filter out problematic characters
            text = "".join(char for char in extracted_text if ord(char) < 0xD800 or ord(char) > 0xDFFF)
    text = text.strip()

    if not text:
        raise DocumentProcessingError(
            "empty_document",
            "The extracted document text is empty.",
        )

    splitter = get_text_splitter()
    chunks = splitter.split_text(text)

    if not chunks:
        raise DocumentProcessingError(
            "chunking_failure",
            "No text chunks were generated from the document.",
        )

    embedder = get_embedder(settings.embedding_model_name)
    try:
        embeddings = await asyncio.to_thread(
            embedder.encode,
            chunks,
            convert_to_numpy=True,
        )
    except Exception as exc:
        raise DocumentProcessingError(
            "embedding_failure",
            "Failed to generate embeddings for document chunks.",
            exc,
        ) from exc

    vectors: List[List[float]] = embeddings.tolist()

    if not vectors:
        raise DocumentProcessingError(
            "embedding_failure",
            "No embeddings were generated for document chunks.",
        )

    client = create_qdrant_client(settings.qdrant_host)
    await asyncio.to_thread(ensure_collection, client, len(vectors[0]))

    points = [
        models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={"document_id": document_id, "chunk_text": chunk_text},
        )
        for vector, chunk_text in zip(vectors, chunks)
    ]

    await asyncio.to_thread(
        client.upsert,
        collection_name=COLLECTION_NAME,
        points=points,
        wait=True,
    )

    return text
