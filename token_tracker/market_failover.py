"""
DexScreener circuit breaker + hourly budget.

When DexScreener is rate-limited or over a soft hourly pull budget, market
resolution prefers Raydium (Solana) / Pump.fun instead of hammering DexScreener.
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque
from typing import Any

_LOCK = threading.Lock()

# Soft budget: free DexScreener calls per rolling hour (override via env)
_DX_HOUR_BUDGET = int(os.environ.get("DEXSCREENER_HOUR_BUDGET") or 400)
# After a 429, skip DexScreener for this many seconds
_DX_COOLDOWN_SEC = float(os.environ.get("DEXSCREENER_COOLDOWN_SEC") or 90.0)

_dx_hits: deque[float] = deque()
_dx_cooldown_until = 0.0
_dx_last_429_at = 0.0


def _prune_hits(now: float) -> None:
    while _dx_hits and now - _dx_hits[0] > 3600.0:
        _dx_hits.popleft()


def dexscreener_allowed() -> bool:
    """False while in 429 cooldown or over soft hourly budget."""
    now = time.time()
    with _LOCK:
        if now < _dx_cooldown_until:
            return False
        _prune_hits(now)
        if len(_dx_hits) >= _DX_HOUR_BUDGET:
            return False
        return True


def dexscreener_status() -> dict[str, Any]:
    now = time.time()
    with _LOCK:
        _prune_hits(now)
        return {
            "allowed": now >= _dx_cooldown_until and len(_dx_hits) < _DX_HOUR_BUDGET,
            "hits_last_hour": len(_dx_hits),
            "hour_budget": _DX_HOUR_BUDGET,
            "cooldown_remaining_sec": max(0.0, round(_dx_cooldown_until - now, 1)),
            "last_429_ago_sec": (
                None if not _dx_last_429_at else round(now - _dx_last_429_at, 1)
            ),
        }


def record_dexscreener_call() -> None:
    now = time.time()
    with _LOCK:
        _prune_hits(now)
        _dx_hits.append(now)


def record_dexscreener_429() -> None:
    global _dx_cooldown_until, _dx_last_429_at
    now = time.time()
    with _LOCK:
        _dx_last_429_at = now
        _dx_cooldown_until = max(_dx_cooldown_until, now + _DX_COOLDOWN_SEC)


def prefer_alternate_market() -> bool:
    """True when callers should try Raydium/Pump before DexScreener."""
    return not dexscreener_allowed()
