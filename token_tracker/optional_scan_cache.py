"""
Per-mint cache for optional Helius scans: Fresh, Multi-send, Shared SOL.

When a user Analyzes with a checkbox ON, results are stored.
When they re-Analyze with that checkbox OFF, last known values are reused
(no new Helius pings for that scan). Checking ON again refreshes live.
"""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

# How long last-known optional scans stay available (seconds).
# Default 24h — survives many re-Analyzes of the same mint on one host.
TTL = float(os.environ.get("OPTIONAL_SCAN_CACHE_TTL") or 86400.0)
_MAX = int(os.environ.get("OPTIONAL_SCAN_CACHE_MAX") or 400)

_LOCK = threading.Lock()
# mint -> { expires_at, fresh, multi_send, shared_sol, updated_at }
_STORE: dict[str, dict[str, Any]] = {}


def _norm_mint(mint: str) -> str:
    return (mint or "").strip()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_slice(mint: str, kind: str) -> dict[str, Any] | None:
    """
    kind: 'fresh' | 'multi_send' | 'shared_sol'
    Returns cached dict or None (includes scanned_at when stored).
    """
    key = _norm_mint(mint)
    if not key or kind not in {"fresh", "multi_send", "shared_sol"}:
        return None
    now = time.time()
    with _LOCK:
        row = _STORE.get(key)
        if not row:
            return None
        if float(row.get("expires_at") or 0) < now:
            _STORE.pop(key, None)
            return None
        blob = row.get(kind)
        if not isinstance(blob, dict) or not blob.get("ok"):
            return None
        out = dict(blob)
        # Prefer slice stamp; fall back to mint-row updated_at
        if not out.get("scanned_at") and row.get("updated_at"):
            try:
                out["scanned_at"] = datetime.fromtimestamp(
                    float(row["updated_at"]), tz=timezone.utc
                ).isoformat()
            except (TypeError, ValueError, OSError):
                pass
        return out


def put_slice(mint: str, kind: str, payload: dict[str, Any]) -> None:
    """Store a successful optional-scan slice for mint."""
    key = _norm_mint(mint)
    if not key or kind not in {"fresh", "multi_send", "shared_sol"}:
        return
    if not isinstance(payload, dict) or not payload.get("ok"):
        return
    now = time.time()
    stamped = dict(payload)
    if not stamped.get("scanned_at"):
        stamped["scanned_at"] = _iso_now()
    with _LOCK:
        row = _STORE.get(key) or {}
        row["expires_at"] = now + max(60.0, TTL)
        row["updated_at"] = now
        row[kind] = stamped
        _STORE[key] = row
        # Cap size (drop oldest by updated_at)
        if len(_STORE) > _MAX:
            ordered = sorted(
                _STORE.items(),
                key=lambda kv: float((kv[1] or {}).get("updated_at") or 0),
            )
            for k, _ in ordered[: max(1, len(_STORE) - _MAX)]:
                _STORE.pop(k, None)


def clear_mint(mint: str) -> None:
    key = _norm_mint(mint)
    if not key:
        return
    with _LOCK:
        _STORE.pop(key, None)
