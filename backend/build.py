from __future__ import annotations

import os
import sys
from pathlib import Path

from PyInstaller.__main__ import run as pyinstaller_run


try:
    ROOT_DIR = Path(__file__).resolve().parent
except NameError:  # pragma: no cover - should not happen
    ROOT_DIR = Path.cwd()
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
SPEC_PATH = ROOT_DIR / "rpc_server.spec"


def build() -> None:
    if not SPEC_PATH.exists():
        raise FileNotFoundError(f"Spec file not found: {SPEC_PATH}")

    os.makedirs(DIST_DIR, exist_ok=True)
    os.makedirs(BUILD_DIR, exist_ok=True)

    args = [
        str(SPEC_PATH),
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(BUILD_DIR),
        "--noconfirm",
    ]

    pyinstaller_run(args)


if __name__ == "__main__":
    try:
        build()
    except Exception as exc:  # pragma: no cover - convenience script
        print(f"Build failed: {exc}", file=sys.stderr)
        sys.exit(1)
