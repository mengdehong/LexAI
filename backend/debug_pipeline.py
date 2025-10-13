"""Utility script to inspect document extraction via rust_core/extractous.

Usage:
    poetry run python backend/debug_pipeline.py /path/to/document.pdf

The script will invoke the Rust binding directly, print the first few hundred
characters of the extracted text, and surface any raised exception with full
context. This mirrors the backend's extraction step without embedding or
Qdrant dependencies, making it easier to isolate parser issues.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from rust_core import extract_text
except ImportError as exc:  # pragma: no cover - exercised manually
    print("[error] rust_core module unavailable. Did you build the extension?", file=sys.stderr)
    raise SystemExit(1) from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Run extractous text extraction on a document")
    parser.add_argument("document", type=Path, help="Path to the document to inspect")
    parser.add_argument(
        "--preview-chars",
        type=int,
        default=600,
        help="How many characters of the extracted text to print",
    )

    args = parser.parse_args()

    if not args.document.exists():
        raise SystemExit(f"Document not found: {args.document}")

    try:
        text = extract_text(str(args.document))
    except Exception as exc:  # pragma: no cover - runtime diagnostic path
        print("[error] Extraction failed:", exc, file=sys.stderr)
        raise SystemExit(2) from exc

    normalized = text.strip()
    total_chars = len(normalized)

    print(f"[ok] Extracted {total_chars} characters")
    if total_chars == 0:
        print("[warn] Extraction returned empty text")
        return

    preview = normalized[: args.preview_chars]
    print("[preview]")
    print(preview)
    if total_chars > len(preview):
        print("…")


if __name__ == "__main__":  # pragma: no cover - manual script execution
    main()
