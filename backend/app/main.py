"""FastAPI application entrypoint for LexAI backend."""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .routers.documents import router as documents_router

try:
    from rust_core import hello_from_rust
    _rust_import_error: Exception | None = None
except ImportError as exc:  # pragma: no cover - exercised during runtime
    hello_from_rust = None  # type: ignore[assignment]
    _rust_import_error = exc


app = FastAPI(title="LexAI Backend", version="0.1.0")

allowed_origins = {
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(documents_router)


@app.get("/")
async def read_root(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "qdrant_host": settings.qdrant_host}


@app.get("/test_rust")
async def read_test_rust() -> dict[str, str]:
    """Invoke the Rust PyO3 extension to verify bindings."""
    if hello_from_rust is None:
        raise HTTPException(
            status_code=500,
            detail=f"rust_core module is unavailable: {_rust_import_error}",
        )

    return {"message": hello_from_rust()}
