"""Shared paths for the market database."""

from __future__ import annotations

import os
from pathlib import Path


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def default_db_path() -> Path:
    env = os.environ.get("LEONIDAS_DB") or os.environ.get("GROKSCREENER_DB")
    if env:
        return Path(env)
    data_dir = project_root() / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "market.db"


def watchlist_path() -> Path:
    return project_root() / "watchlist.json"
