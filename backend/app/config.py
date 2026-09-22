"""Filesystem locations and environment setup."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"
FALLBACK_HTML = BASE_DIR / "app" / "static" / "hello.html"
DB_PATH = BASE_DIR / "app.db"


def db_path() -> Path:
    # PM_DB_PATH lets tests and Docker point the database somewhere else.
    return Path(os.environ.get("PM_DB_PATH", str(DB_PATH)))


def load_environment(start_dir: Path | str | None = None) -> None:
    search_roots: list[Path] = []
    base = Path(start_dir) if start_dir is not None else PROJECT_ROOT
    candidate = base.resolve()

    while True:
        search_roots.append(candidate)
        if candidate == candidate.parent:
            break
        candidate = candidate.parent

    for root in search_roots:
        env_path = root / ".env"
        if env_path.exists():
            values = dotenv_values(env_path)
            for key, value in values.items():
                if key and value is not None and not os.getenv(key):
                    os.environ[key] = value
            break


load_environment(PROJECT_ROOT)
