"""
Public site view / usage counter (no secrets, no personal data stored).

Persists to data/view_stats.json (gitignored). On free Render, this file can
reset when the instance is redeployed unless you add a persistent disk.

Publicize via:
  GET /api/stats
  GET /badge.svg
  UI footer on the website
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
STATS_PATH = DATA_DIR / "view_stats.json"

_LOCK = threading.Lock()

_DEFAULT: dict[str, Any] = {
    "profile_views": 0,  # homepage / UI loads
    "analyzes": 0,  # successful analyze requests
    "analyze_errors": 0,
    "first_view_at": None,
    "last_view_at": None,
    "last_analyze_at": None,
    # daily unique visitors (hashed IP only — not raw IPs)
    "daily_uniques": {},  # "YYYY-MM-DD" -> [hash, ...]
}


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _hash_ip(ip: str) -> str:
    """One-way fingerprint for daily unique counts (not reversible identity)."""
    raw = (ip or "unknown").strip().encode("utf-8")
    return hashlib.sha256(b"adtc-view|" + raw).hexdigest()[:16]


def _load() -> dict[str, Any]:
    if not STATS_PATH.is_file():
        return dict(_DEFAULT)
    try:
        data = json.loads(STATS_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return dict(_DEFAULT)
        out = dict(_DEFAULT)
        out.update(data)
        if not isinstance(out.get("daily_uniques"), dict):
            out["daily_uniques"] = {}
        return out
    except Exception:  # noqa: BLE001
        return dict(_DEFAULT)


def _save(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(STATS_PATH)


def _prune_daily(data: dict[str, Any], *, keep_days: int = 60) -> None:
    """Drop old daily unique buckets to keep the file small."""
    du = data.get("daily_uniques") or {}
    if not isinstance(du, dict) or len(du) <= keep_days:
        return
    keys = sorted(du.keys())
    for k in keys[:-keep_days]:
        du.pop(k, None)
    data["daily_uniques"] = du


def record_profile_view(ip: str | None = None) -> dict[str, Any]:
    """Count a public page / profile view."""
    with _LOCK:
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
            # cap list length per day (abuse protection)
            if len(bucket) > 50_000:
                bucket = bucket[-50_000:]
            du[day] = bucket
        _prune_daily(data)
        _save(data)
        return public_stats(data)


def record_analyze(*, ok: bool = True) -> dict[str, Any]:
    with _LOCK:
        data = _load()
        if ok:
            data["analyzes"] = int(data.get("analyzes") or 0) + 1
            data["last_analyze_at"] = _now_iso()
        else:
            data["analyze_errors"] = int(data.get("analyze_errors") or 0) + 1
        _save(data)
        return public_stats(data)


def public_stats(data: dict[str, Any] | None = None) -> dict[str, Any]:
    """Safe public payload — no IPs, no hashes."""
    with _LOCK:
        d = data if data is not None else _load()
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
                "Public counters for this Token Checker instance. "
                "Unique visitors use a daily hash (raw IPs are not stored). "
                "Counts may reset on free-host redeploys without persistent disk."
            ),
        }


def badge_svg() -> str:
    """Simple public badge for READMEs / embeds."""
    s = public_stats()
    views = s["profile_views"]
    analyzes = s["analyzes"]
    label = "views"
    value = f"{views} · {analyzes} analyzes"
    # rough width
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
