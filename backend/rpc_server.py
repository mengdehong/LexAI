from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
import uuid
from functools import lru_cache
from typing import Any, Awaitable, Callable, Dict

from app.bootstrap import bootstrap_env as _bootstrap_env
_ = _bootstrap_env()  # set env & UTF-8 before any heavy imports

from qdrant_client import models

from app.config import get_settings
from app import services
from app.services import COLLECTION_NAME, DocumentProcessingError


JSONRPC_VERSION = "2.0"


class RPCError(Exception):
    def __init__(self, code: int, message: str, data: Any | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data

@lru_cache
def get_settings_cached():
    return get_settings()


@lru_cache
def get_embedder_cached():
    s = get_settings_cached()
    cache_dir = (
        os.environ.get("HUGGINGFACE_HUB_CACHE")
        or os.environ.get("HF_HUB_CACHE")
        or os.environ.get("HF_HOME")
        or os.environ.get("TRANSFORMERS_CACHE")
        or os.environ.get("SENTENCE_TRANSFORMERS_HOME")
    )
    try:
        return services.get_embedder(s.embedding_model_name, cache_dir=cache_dir)
    except TypeError:
        return services.get_embedder(s.embedding_model_name)


@lru_cache
def get_qdrant_client_cached():
    s = get_settings_cached()
    return services.create_qdrant_client(s.qdrant_host)


async def rpc_ping(_: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "ok"}


async def rpc_health(_: Dict[str, Any]) -> Dict[str, Any]:
    s = get_settings_cached()
    return {
        "status": "ok",
        "embedding_model": s.embedding_model_name,
        "qdrant_host": s.qdrant_host,
        "collection": COLLECTION_NAME,
    }


async def rpc_health_plus(_: Dict[str, Any]) -> Dict[str, Any]:
    s = get_settings_cached()
    # probe embedder to ensure lazy init succeeds
    _ = get_embedder_cached()
    cache_dir = (
        os.environ.get("HUGGINGFACE_HUB_CACHE")
        or os.environ.get("HF_HUB_CACHE")
        or os.environ.get("HF_HOME")
        or os.environ.get("TRANSFORMERS_CACHE")
        or os.environ.get("SENTENCE_TRANSFORMERS_HOME")
    )
    env_snapshot = {
        k: os.environ.get(k)
        for k in [
            "HF_HOME",
            "HUGGINGFACE_HUB_CACHE",
            "HF_HUB_CACHE",
            "TRANSFORMERS_CACHE",
            "SENTENCE_TRANSFORMERS_HOME",
            "HF_HUB_DISABLE_SYMLINKS",
            "PYTHONIOENCODING",
            "PYTHONUTF8",
        ]
    }
    return {
        "status": "ok",
        "embedding_model": s.embedding_model_name,
        "hf_cache_dir": cache_dir,
        "env": env_snapshot,
    }


async def rpc_upload_document(params: Dict[str, Any]) -> Dict[str, Any]:
    file_path = params.get("file_path")
    if not file_path:
        raise RPCError(-32602, "file_path is required")

    document_id = params.get("document_id") or str(uuid.uuid4())

    try:
        extracted_text = await services.process_and_embed_document(file_path, document_id)
    except DocumentProcessingError as exc:
        raise RPCError(-32001, str(exc), {"code": exc.code}) from exc
    except Exception as exc:  # pragma: no cover - unexpected runtime failure
        raise RPCError(-32603, f"Failed to process document: {exc}") from exc

    return {
        "document_id": document_id,
        "status": "processed",
        "message": "Document processed successfully",
        "extracted_text": extracted_text,
    }


async def rpc_search_term_contexts(params: Dict[str, Any]) -> Dict[str, Any]:
    document_id = params.get("document_id")
    term = params.get("term")
    limit = params.get("limit", 5)

    if not document_id:
        raise RPCError(-32602, "document_id is required")
    if not term:
        raise RPCError(-32602, "term is required")

    embedder = get_embedder_cached()
    query_vector = await asyncio.to_thread(
        embedder.encode,
        term,
        convert_to_numpy=True,
    )

    query_filter = models.Filter(
        must=[
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=document_id),
            )
        ]
    )

    try:
        client = get_qdrant_client_cached()
        hits = await asyncio.to_thread(
            client.search,
            collection_name=COLLECTION_NAME,
            query_vector=query_vector.tolist(),
            query_filter=query_filter,
            limit=limit,
        )
    except Exception as exc:  # pragma: no cover - unexpected runtime failure
        raise RPCError(-32603, f"Search failed: {exc}") from exc

    results = [
        {
            "chunk_text": hit.payload.get("chunk_text", ""),
            "score": hit.score,
        }
        for hit in hits
    ]

    return {"results": results}


RPC_METHODS: Dict[str, Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]] = {
    "ping": rpc_ping,
    "health": rpc_health,
    "health_plus": rpc_health_plus,
    "upload_document": rpc_upload_document,
    "search_term_contexts": rpc_search_term_contexts,
}


def make_error_response(request_id: Any, code: int, message: str, data: Any | None = None) -> Dict[str, Any]:
    error: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": JSONRPC_VERSION, "id": request_id, "error": error}


def make_success_response(request_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": JSONRPC_VERSION, "id": request_id, "result": result}


async def dispatch(request: Dict[str, Any]) -> Dict[str, Any]:
    if request.get("jsonrpc") != JSONRPC_VERSION:
        raise RPCError(-32600, "Invalid JSON-RPC version")

    method = request.get("method")
    if not isinstance(method, str):
        raise RPCError(-32600, "Method must be a string")

    handler = RPC_METHODS.get(method)
    if handler is None:
        raise RPCError(-32601, f"Method not found: {method}")

    params = request.get("params") or {}
    if not isinstance(params, dict):
        raise RPCError(-32602, "Params must be an object")

    return await handler(params)


async def handle_payload(payload: str) -> Dict[str, Any]:
    try:
        request = json.loads(payload)
    except json.JSONDecodeError as exc:
        return make_error_response(None, -32700, f"Parse error: {exc.msg}")

    request_id = request.get("id")
    try:
        result = await dispatch(request)
    except RPCError as exc:
        return make_error_response(request_id, exc.code, str(exc), exc.data)
    except Exception as exc:  # pragma: no cover - unexpected runtime failure
        return make_error_response(
            request_id,
            -32603,
            f"Internal error: {exc}",
            {"traceback": traceback.format_exc()},
        )

    return make_success_response(request_id, result)


def _configure_stdio_utf8() -> None:
    try:
        # Prefer explicit UTF-8 regardless of console codepage (e.g., GBK)
        if hasattr(sys, "stdout") and hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys, "stderr") and hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        os.environ.setdefault("PYTHONIOENCODING", "utf-8")
        os.environ.setdefault("PYTHONUTF8", "1")
    except Exception:
        # Best effort; ignore if Python lacks reconfigure (older runtimes)
        pass


def _ensure_hf_cache_env() -> None:
    # Default HF caches to application data to avoid Windows path/permissions issues
    appdata = os.environ.get("APPDATA")
    home = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    base = Path(appdata) if appdata else (Path(home) if home else Path.cwd())
    cache_dir = base / "com.wenmou.lexai" / "hf-cache"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    os.environ.setdefault("HF_HOME", str(cache_dir))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(cache_dir))
    os.environ.setdefault("TRANSFORMERS_CACHE", str(cache_dir))
    os.environ.setdefault("SENTENCE_TRANSFORMERS_HOME", str(cache_dir))
    # Avoid symlink-related quirks on Windows
    os.environ.setdefault("HF_HUB_ENABLE_HF_XET", "0")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def main() -> None:
    # Redundant safety to ensure env is correct in long-running sessions
    _ensure_hf_cache_env()
    _configure_stdio_utf8()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while True:
        line = sys.stdin.readline()
        if line == "":
            break

        payload = line.strip()
        if not payload:
            continue

        response = loop.run_until_complete(handle_payload(payload))
        # ensure_ascii=True keeps stdout strictly ASCII (Unicode escaped)
        sys.stdout.write(json.dumps(response, ensure_ascii=True) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
