"""
Public site view / usage counter (no secrets, no personal data stored).

Uses a short lock timeout so a stuck disk write cannot freeze /api/* routes.
On Render free tier, prefers /tmp for stats so deploys still serve APIs.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def _stats_path() -> Path:
    # Prefer writable temp on cloud hosts (Render sets PORT / RENDER=true)
    if os.environ.get("PORT") or os.environ.get("RENDER"):
        return Path(os.environ.get("TMPDIR") or os.environ.get("TMP") or "/tmp") / "adtc_view_stats.json"
    return ROOT / "data" / "view_stats.json"


_LOCK = threading.Lock()
_CACHE: dict[str, Any] | None = None
_CACHE_AT = 0.0

_DEFAULT: dict[str, Any] = {
    "profile_views": 0,
    "analyzes": 0,
    "analyze_errors": 0,
    "first_view_at": None,
    "last_view_at": None,
    "last_analyze_at": None,
    "daily_uniques": {},
}


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _hash_ip(ip: str) -> str:
    raw = (ip or "unknown").strip().encode("utf-8")
    return hashlib.sha256(b"adtc-view|" + raw).hexdigest()[:16]


def _load() -> dict[str, Any]:
    global _CACHE, _CACHE_AT
    path = _stats_path()
    if not path.is_file():
        return dict(_DEFAULT)
    try:
        # Use cache if fresher than 2s (reduces disk under concurrent hits)
        now = time.time()
        if _CACHE is not None and (now - _CACHE_AT) < 2.0:
            return dict(_CACHE)
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return dict(_DEFAULT)
        out = dict(_DEFAULT)
        out.update(data)
        if not isinstance(out.get("daily_uniques"), dict):
            out["daily_uniques"] = {}
        _CACHE = dict(out)
        _CACHE_AT = now
        return out
    except Exception:  # noqa: BLE001
        return dict(_DEFAULT)


def _save(data: dict[str, Any]) -> None:
    global _CACHE, _CACHE_AT
    path = _stats_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(path)
        _CACHE = dict(data)
        _CACHE_AT = time.time()
    except Exception:  # noqa: BLE001
        # Disk full / read-only — keep in-memory only
        _CACHE = dict(data)
        _CACHE_AT = time.time()


def _prune_daily(data: dict[str, Any], *, keep_days: int = 30) -> None:
    du = data.get("daily_uniques") or {}
    if not isinstance(du, dict) or len(du) <= keep_days:
        return
    for k in sorted(du.keys())[:-keep_days]:
        du.pop(k, None)
    data["daily_uniques"] = du


def _with_lock(fn, default: dict[str, Any]) -> dict[str, Any]:
    got = _LOCK.acquire(timeout=1.5)
    if not got:
        return default
    try:
        return fn()
    except Exception:  # noqa: BLE001
        return default
    finally:
        _LOCK.release()


def record_profile_view(ip: str | None = None) -> dict[str, Any]:
    def _do() -> dict[str, Any]:
        data = _load()
        data["profile_views"] = int(data.get("profile_views") or 0) + 1
        now = _now_iso()
        if not data.get("first_view_at"):
            data["first_view_at"] = now
        data["last_view_at"] = now
        day = _today()
        du = data.setdefault("daily_uniques", {})
        if not isinstance(du, dict):
            du = {}
            data["daily_uniques"] = du
        bucket = list(du.get(day) or [])
        h = _hash_ip(ip or "")
        if h not in bucket:
            bucket.append(h)
            if len(bucket) > 20_000:
                bucket = bucket[-20_000:]
            du[day] = bucket
        _prune_daily(data)
        _save(data)
        return public_stats(data)

    return _with_lock(_do, public_stats())


def record_analyze(*, ok: bool = True) -> dict[str, Any]:
    def _do() -> dict[str, Any]:
        data = _load()
        if ok:
            data["analyzes"] = int(data.get("analyzes") or 0) + 1
            data["last_analyze_at"] = _now_iso()
        else:
            data["analyze_errors"] = int(data.get("analyze_errors") or 0) + 1
        _save(data)
        return public_stats(data)

    return _with_lock(_do, public_stats())


def public_stats(data: dict[str, Any] | None = None) -> dict[str, Any]:
    """Safe public payload — no IPs, no hashes."""

    def _from(d: dict[str, Any]) -> dict[str, Any]:
        day = _today()
        du = d.get("daily_uniques") or {}
        today_uniques = 0
        if isinstance(du, dict):
            bucket = du.get(day) or []
            today_uniques = len(bucket) if isinstance(bucket, list) else 0
        return {
            "ok": True,
            "profile_views": int(d.get("profile_views") or 0),
            "analyzes": int(d.get("analyzes") or 0),
            "analyze_errors": int(d.get("analyze_errors") or 0),
            "unique_visitors_today": today_uniques,
            "first_view_at": d.get("first_view_at"),
            "last_view_at": d.get("last_view_at"),
            "last_analyze_at": d.get("last_analyze_at"),
            "note": (
                "Public counters. Unique visitors use a daily hash (raw IPs not stored). "
                "Counts may reset on free-host redeploys."
            ),
        }

    if data is not None:
        return _from(data)

    def _do() -> dict[str, Any]:
        return _from(_load())

    return _with_lock(_do, _from(_DEFAULT))


def badge_svg() -> str:
    s = public_stats()
    views = s["profile_views"]
    analyzes = s["analyzes"]
    label = "views"
    value = f"{views} · {analyzes} analyzes"
    w = max(118, 70 + len(value) * 7)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="20" role="img" aria-label="{label}: {value}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="m"><rect width="{w}" height="20" rx="3" fill="#fff"/></mask>
  <g mask="url(#m)">
    <rect width="48" height="20" fill="#555"/>
    <rect x="48" width="{w - 48}" height="20" fill="#4f8cff"/>
    <rect width="{w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="24" y="14">{label}</text>
    <text x="{48 + (w - 48) / 2}" y="14">{value}</text>
  </g>
</svg>
"""
