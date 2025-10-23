from __future__ import annotations

import asyncio
import os
import sys
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
        # If str(exc) has surrogates, use surrogateescape to handle them
        try:
            message = str(exc).encode('utf-8', errors='surrogateescape').decode('utf-8', errors='replace')
        except:
            # Last resort: filter out surrogates completely
            raw = repr(exc)
            message = "".join(char for char in raw if ord(char) < 0xD800 or ord(char) > 0xDFFF)
    
    try:
        lowered = message.lower()
    except:
        lowered = ""
    
    # Check for file not found errors - common with encoding issues
    if "no such file or directory" in lowered or "filenotfounderror" in lowered:
        return DocumentProcessingError(
            "file_not_found",
            f"File not found. This may be due to encoding issues with special characters in the filename. Original error: {message}",
            exc,
        )

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

    # Normalize file path for Windows: ensure proper encoding
    # On Windows, Python may receive paths with incorrect encoding from IPC
    try:
        # First, clean any surrogates from the path string itself
        if sys.platform == "win32":
            try:
                # Test if path string contains surrogates
                file_path.encode('utf-8', errors='strict')
            except UnicodeEncodeError:
                print(f"[Path Fix] Path string contains surrogates, cleaning: {repr(file_path)}", file=sys.stderr)
                # Method 1: Use surrogateescape to handle Windows filesystem encoding
                try:
                    # This converts surrogates back to bytes, then properly decodes
                    fixed_path = file_path.encode('utf-8', errors='surrogateescape').decode('utf-8', errors='replace')
                    print(f"[Path Fix] After surrogateescape: {repr(fixed_path)}", file=sys.stderr)
                    file_path = fixed_path
                except Exception as e:
                    print(f"[Path Fix] surrogateescape failed: {e}", file=sys.stderr)
                    # Method 2: Just remove surrogates
                    file_path = "".join(c for c in file_path if not (0xDC80 <= ord(c) <= 0xDCFF))
                    print(f"[Path Fix] After removing surrogates: {repr(file_path)}", file=sys.stderr)
        
        # Try to detect and fix encoding issues on Windows
        if sys.platform == "win32":
            # If the path appears to be garbled (contains mojibake), try to fix it
            try:
                # First, check if the file exists as-is
                test_path = Path(file_path)
                if not test_path.exists():
                    # Try to fix common Windows encoding issues
                    # Path might be in GBK/GB2312 but interpreted as UTF-8 or vice versa
                    print(f"[Path Fix] Original path does not exist: {file_path}", file=sys.stderr)
                    
                    # Attempt 1: Encode as latin-1 and decode as UTF-8 (for paths sent through JSON)
                    try:
                        fixed_path = file_path.encode('latin-1').decode('utf-8')
                        if Path(fixed_path).exists():
                            print(f"[Path Fix] Fixed with latin-1->utf-8: {fixed_path}", file=sys.stderr)
                            file_path = fixed_path
                    except (UnicodeEncodeError, UnicodeDecodeError):
                        pass
                    
                    # Attempt 2: Try different encodings (GBK is common on Chinese Windows)
                    if not Path(file_path).exists():
                        for encoding in ['gbk', 'gb2312', 'cp936', 'cp1252']:
                            try:
                                # If string was decoded as wrong encoding, re-encode and decode correctly
                                fixed_path = file_path.encode(encoding, errors='ignore').decode('utf-8', errors='ignore')
                                if fixed_path != file_path and Path(fixed_path).exists():
                                    print(f"[Path Fix] Fixed with {encoding}->utf-8: {fixed_path}", file=sys.stderr)
                                    file_path = fixed_path
                                    break
                            except (UnicodeEncodeError, UnicodeDecodeError):
                                pass
                        
                    # Final check
                    if not Path(file_path).exists():
                        print(f"[Path Fix] All attempts failed, file not found: {file_path}", file=sys.stderr)
                        raise FileNotFoundError(f"File not found: {file_path}")
            except Exception as path_exc:
                print(f"[Path Fix] Error during path normalization: {path_exc}", file=sys.stderr)
        
        # Verify file exists before proceeding
        path_obj = Path(file_path)
        if not path_obj.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
            
        print(f"[Document Process] Processing file: {file_path}", file=sys.stderr)
    except Exception as path_error:
        print(f"[Document Process] Path validation failed: {path_error}", file=sys.stderr)
        raise _classify_extraction_failure(path_error) from path_error

    # Lightweight support for plain text/markdown without invoking rust_core
    ext = Path(file_path).suffix.lower()
    if ext in {".md", ".markdown", ".txt"}:
        try:
            extracted_text = Path(file_path).read_text(encoding="utf-8", errors="ignore")
        except Exception as exc:
            raise _classify_extraction_failure(exc) from exc
    else:
        try:
            print(f"[PDF Extract] Attempting rust_core extraction for: {file_path}", file=sys.stderr)
            extracted_text = await asyncio.to_thread(rust_core.extract_text, file_path)
            print(f"[PDF Extract] rust_core succeeded, extracted {len(extracted_text)} chars", file=sys.stderr)
        except Exception as exc:  # pragma: no cover - rust_core failure surfaces at runtime
            print(f"[PDF Extract] rust_core failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            # Try pure-Python fallback (pdfminer.six) when rust_core fails (e.g., surrogate issues)
            try:
                print(f"[PDF Extract] Trying pdfminer fallback...", file=sys.stderr)
                extracted_text = await asyncio.to_thread(_extract_pdf_text_fallback, file_path)
                print(f"[PDF Extract] pdfminer succeeded, extracted {len(extracted_text)} chars", file=sys.stderr)
            except Exception as fallback_exc:
                print(f"[PDF Extract] pdfminer also failed: {type(fallback_exc).__name__}: {fallback_exc}", file=sys.stderr)
                raise _classify_extraction_failure(exc) from exc
    
    # Sanitize text: replace invalid surrogates to avoid UTF-8 encode errors on Windows
    # This is critical because PDF extraction can produce surrogate pairs that can't be serialized
    text = extracted_text
    if text:
        # Method 1: Manually filter out surrogate characters (most reliable)
        # Surrogates are in range U+D800 to U+DFFF
        try:
            text = "".join(char for char in text if ord(char) < 0xD800 or ord(char) > 0xDFFF)
        except Exception:
            # Method 2: Force replace any problematic characters
            try:
                text = text.encode("utf-8", errors="replace").decode("utf-8")
            except Exception:
                # Method 3: Last resort - use repr and strip quotes
                text = repr(text)[1:-1]
        
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
