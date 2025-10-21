from __future__ import annotations

import asyncio
import json
import sys
import traceback
import uuid
from typing import Any, Awaitable, Callable, Dict

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


settings = get_settings()
EMBEDDER = services.get_embedder(settings.embedding_model_name)
QDRANT_CLIENT = services.create_qdrant_client(settings.qdrant_host)


def _get_shared_embedder(_: str) -> Any:
    return EMBEDDER


def _get_shared_qdrant(_: str) -> Any:
    return QDRANT_CLIENT


services.get_embedder = services.lru_cache()(  # type: ignore[assignment]
    lambda model_name: EMBEDDER if model_name == settings.embedding_model_name else services.get_embedder.__wrapped__(model_name)
)
services.create_qdrant_client = _get_shared_qdrant  # type: ignore[assignment]


async def rpc_ping(_: Dict[str, Any]) -> Dict[str, Any]:
    return {"status": "ok"}


async def rpc_health(_: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "status": "ok",
        "embedding_model": settings.embedding_model_name,
        "qdrant_host": settings.qdrant_host,
        "collection": COLLECTION_NAME,
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

    query_vector = await asyncio.to_thread(
        EMBEDDER.encode,
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
        hits = await asyncio.to_thread(
            QDRANT_CLIENT.search,
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


def main() -> None:
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
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
