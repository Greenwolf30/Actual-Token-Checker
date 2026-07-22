"""
Analyze gate: per-mint report cache + single-flight.

Many users / double-clicks share one outbound fetch for the same query.
Cuts DexScreener / Helius / Birdeye load and shared-IP rate-limit risk.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from collections.abc import Callable
from typing import Any

# Full Analyze (holders + bundles) — short enough to stay useful, long enough
# that re-clicks and multi-tab don't re-hammer providers.
TTL_FULL = float(os.environ.get("ANALYZE_CACHE_TTL_FULL") or 90.0)
TTL_QUICK = float(os.environ.get("ANALYZE_CACHE_TTL_QUICK") or 45.0)

_LOCK = threading.Lock()
# key -> (expires_at, payload)
_CACHE: dict[str, tuple[float, Any]] = {}
# key -> Event set when the in-flight job finishes
_INFLIGHT: dict[str, threading.Event] = {}
_MAX_CACHE = 200


def _ttl(quick: bool) -> float:
    return max(5.0, TTL_QUICK if quick else TTL_FULL)


def cache_key(
    query: str,
    *,
    chain: str | None,
    quick: bool,
    include_rugwatch: bool,
    include_fresh: bool = True,
    include_multi_send: bool = True,
    include_fresh_multi_send: bool | None = None,
) -> str:
    q = (query or "").strip().lower()
    ch = (chain or "").strip().lower()
    rw = "1" if include_rugwatch else "0"
    # Legacy combined flag: if provided alone, apply to both
    if include_fresh_multi_send is not None and include_fresh_multi_send is False:
        include_fresh = False
        include_multi_send = False
    fr = "1" if include_fresh else "0"
    ms = "1" if include_multi_send else "0"
    mode = "q" if quick else "f"
    raw = f"{mode}|{ch}|{rw}|{fr}|{ms}|{q}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def _cache_get(key: str) -> Any | None:
    now = time.time()
    with _LOCK:
        item = _CACHE.get(key)
        if not item:
            return None
        exp, val = item
        if exp < now:
            _CACHE.pop(key, None)
            return None
        return val


def _cache_set(key: str, value: Any, ttl: float) -> None:
    with _LOCK:
        _CACHE[key] = (time.time() + max(5.0, ttl), value)
        if len(_CACHE) > _MAX_CACHE:
            items = sorted(_CACHE.items(), key=lambda kv: kv[1][0])
            for k, _ in items[: max(1, _MAX_CACHE // 5)]:
                _CACHE.pop(k, None)


def run_single_flight(
    key: str,
    fn: Callable[[], Any],
    *,
    ttl: float,
    wait_timeout: float = 180.0,
) -> tuple[Any, str]:
    """
    Run fn once per key; concurrent waiters share the result.
    Returns (payload, source) where source is "cache" | "shared" | "live".
    """
    hit = _cache_get(key)
    if hit is not None:
        return hit, "cache"

    leader = False
    event: threading.Event | None = None
    with _LOCK:
        hit = _CACHE.get(key)
        if hit and hit[0] >= time.time():
            return hit[1], "cache"
        if key in _INFLIGHT:
            event = _INFLIGHT[key]
        else:
            event = threading.Event()
            _INFLIGHT[key] = event
            leader = True

    if not leader and event is not None:
        event.wait(timeout=wait_timeout)
        again = _cache_get(key)
        if again is not None:
            return again, "shared"
        # Leader failed or timed out — do not stampede; return soft error
        return (
            {
                "ok": False,
                "error": (
                    "Analyze still running or failed for this mint. "
                    "Wait a few seconds and try once more."
                ),
            },
            "shared",
        )

    try:
        result = fn()
        # Cache successful reports and structured failures (avoid retry storms)
        if isinstance(result, dict):
            _cache_set(key, result, ttl)
        return result, "live"
    except Exception as exc:  # noqa: BLE001
        err = {
            "ok": False,
            "error": f"Analyze failed: {exc}",
        }
        _cache_set(key, err, min(30.0, ttl))
        return err, "live"
    finally:
        with _LOCK:
            ev = _INFLIGHT.pop(key, None)
        if ev is not None:
            ev.set()


def analyze_cached(
    fn: Callable[[], Any],
    *,
    query: str,
    chain: str | None,
    quick: bool,
    include_rugwatch: bool,
    include_fresh: bool = True,
    include_multi_send: bool = True,
    include_fresh_multi_send: bool | None = None,
) -> tuple[Any, str]:
    """Run analyze_token (or equivalent) with cache + single-flight."""
    if include_fresh_multi_send is False:
        include_fresh = False
        include_multi_send = False
    key = cache_key(
        query,
        chain=chain,
        quick=quick,
        include_rugwatch=include_rugwatch,
        include_fresh=include_fresh,
        include_multi_send=include_multi_send,
    )
    return run_single_flight(key, fn, ttl=_ttl(quick))
