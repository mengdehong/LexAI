from __future__ import annotations

import os
import sys
from pathlib import Path

_BOOTSTRAPPED = False


def _resolve_cache_dir() -> Path:
    # Prefer app-owned cache under APPDATA on Windows; else fall back to HOME
    appdata = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
    home = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    base = Path(appdata) if appdata else (Path(home) if home else Path.cwd())
    return base / "com.wenmou.lexai" / "hf-cache"


def bootstrap_env() -> Path:
    """Idempotently enforce UTF-8 IO and HuggingFace cache isolation.

    Returns the resolved cache directory.
    """
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        # Return current effective cache dir
        for key in (
            "HUGGINGFACE_HUB_CACHE",
            "HF_HUB_CACHE",
            "HF_HOME",
            "TRANSFORMERS_CACHE",
            "SENTENCE_TRANSFORMERS_HOME",
        ):
            val = os.environ.get(key)
            if val:
                return Path(val)
        return _resolve_cache_dir()

    cache_dir = _resolve_cache_dir()
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    # Apply env (only if not already set by parent process)
    for key in (
        "HF_HOME",
        "HUGGINGFACE_HUB_CACHE",
        "HF_HUB_CACHE",
        "TRANSFORMERS_CACHE",
        "SENTENCE_TRANSFORMERS_HOME",
    ):
        os.environ.setdefault(key, str(cache_dir))

    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
    os.environ.setdefault("HF_HUB_ENABLE_HF_XET", "0")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("PYTHONUNBUFFERED", "1")

    try:
        if hasattr(sys, "stdout") and hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys, "stderr") and hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        # Log to stderr to avoid polluting JSON-RPC stdout
        sys.stderr.write(f"[bootstrap] HF cache dir: {cache_dir}\n")
        sys.stderr.flush()
    except Exception:
        pass

    _BOOTSTRAPPED = True
    return cache_dir
