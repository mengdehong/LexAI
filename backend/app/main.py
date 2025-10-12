"""FastAPI application entrypoint for LexAI backend."""

from fastapi import FastAPI, HTTPException

try:
    from rust_core import hello_from_rust
    _rust_import_error: Exception | None = None
except ImportError as exc:  # pragma: no cover - exercised during runtime
    hello_from_rust = None  # type: ignore[assignment]
    _rust_import_error = exc


app = FastAPI(title="LexAI Backend", version="0.1.0")


@app.get("/")
async def read_root() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/test_rust")
async def read_test_rust() -> dict[str, str]:
    """Invoke the Rust PyO3 extension to verify bindings."""
    if hello_from_rust is None:
        raise HTTPException(
            status_code=500,
            detail=f"rust_core module is unavailable: {_rust_import_error}",
        )

    return {"message": hello_from_rust()}
