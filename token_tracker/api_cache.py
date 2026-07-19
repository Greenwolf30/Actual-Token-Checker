"""
Simple in-memory TTL cache for DexScreener (and similar) responses.

Reduces duplicate calls when the same mint is analyzed repeatedly or when
multiple code paths hit the same endpoint in one Analyze.
"""

from __future__ import annotations

import threading
import time
from typing import Any

_LOCK = threading.Lock()
_STORE: dict[str, tuple[float, Any]] = {}

# Default TTLs (seconds)
TTL_SEARCH = 180.0  # 3 min — market search
TTL_PAIRS = 120.0  # 2 min — token pairs
TTL_NEGATIVE = 45.0  # short cache for empty / hard failures


def cache_get(key: str) -> Any | None:
    now = time.time()
    with _LOCK:
        item = _STORE.get(key)
        if not item:
            return None
        exp, val = item
        if exp < now:
            _STORE.pop(key, None)
            return None
        return val


def cache_set(key: str, value: Any, ttl: float) -> None:
    with _LOCK:
        _STORE[key] = (time.time() + max(1.0, ttl), value)
        # crude size cap
        if len(_STORE) > 800:
            # drop oldest ~20%
            items = sorted(_STORE.items(), key=lambda kv: kv[1][0])
            for k, _ in items[:160]:
                _STORE.pop(k, None)


def cache_clear() -> None:
    with _LOCK:
        _STORE.clear()
