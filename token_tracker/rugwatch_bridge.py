"""
Read-only bridge from Actual Token Checker → RugWatch.

Sources (merged for flagging):
  1) Local SQLite rugwatch.db (same PC)
  2) Cloud wallet list (GitHub raw / Gist / RUGWATCH_WALLETS_URL)

Does NOT import RugWatch Python package. Never returns secret keys.

DB resolution order:
  1) env RUGWATCH_DB
  2) ../RugWatch/data/rugwatch.db (sibling of project)
  3) ~/RugWatch/data/rugwatch.db

Cloud resolution order:
  1) env RUGWATCH_WALLETS_URL or RUGWATCH_CLOUD_URL (raw JSON)
  2) env RUGWATCH_GITHUB_REPO + path → raw.githubusercontent.com
     (optional GITHUB_TOKEN / RUGWATCH_GITHUB_TOKEN for private repos)
"""

from __future__ import annotations

import base64
import json
import os
import sqlite3
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .env_config import load_dotenv, project_root

# Soft cache so Analyze does not hit GitHub every second
_CLOUD_CACHE: dict[str, Any] = {"ts": 0.0, "wallets": [], "error": None, "url": None}
_CLOUD_TTL_SEC = 120.0


def rugwatch_db_path() -> Path | None:
    load_dotenv()
    env = (os.environ.get("RUGWATCH_DB") or "").strip()
    if env:
        p = Path(env)
        return p if p.is_file() else None

    candidates = [
        project_root().parent / "RugWatch" / "data" / "rugwatch.db",
        project_root() / "RugWatch" / "data" / "rugwatch.db",
        Path.home() / "RugWatch" / "data" / "rugwatch.db",
    ]

    seen: set[str] = set()
    for p in candidates:
        try:
            key = str(p.resolve())
        except OSError:
            key = str(p)
        if key in seen:
            continue
        seen.add(key)
        if p.is_file():
            return p
    return None


def _parse_wallet_payload(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        out: list[dict[str, Any]] = []
        for x in data:
            if isinstance(x, dict):
                out.append(x)
            elif isinstance(x, str) and x.strip():
                out.append({"address": x.strip(), "label": "cloud", "risk_score": 70})
        return out
    if isinstance(data, dict):
        for key in ("wallets", "items", "data"):
            if isinstance(data.get(key), list):
                return _parse_wallet_payload(data[key])
    return []


def _cloud_raw_url() -> str | None:
    load_dotenv()
    u = (
        os.environ.get("RUGWATCH_WALLETS_URL")
        or os.environ.get("RUGWATCH_CLOUD_URL")
        or ""
    ).strip()
    if u:
        return u
    repo = (
        os.environ.get("RUGWATCH_GITHUB_REPO") or os.environ.get("GITHUB_REPO") or ""
    ).strip().strip("/")
    if not repo:
        return None
    path = (
        os.environ.get("RUGWATCH_GITHUB_PATH") or "data/wallets_cloud.json"
    ).strip().lstrip("/")
    branch = (os.environ.get("RUGWATCH_GITHUB_BRANCH") or "main").strip() or "main"
    return f"https://raw.githubusercontent.com/{repo}/{branch}/{path}"


def _github_token() -> str | None:
    load_dotenv()
    t = (
        os.environ.get("RUGWATCH_GITHUB_TOKEN")
        or os.environ.get("GITHUB_TOKEN")
        or ""
    ).strip()
    return t or None


def fetch_cloud_wallets(*, force: bool = False) -> dict[str, Any]:
    """
    Download cloud wallet JSON (if configured). Cached ~2 minutes.
    Returns { ok, wallets: [{address,label,risk_score,...}], count, error, url_set }
    """
    now = time.time()
    if (
        not force
        and _CLOUD_CACHE.get("wallets") is not None
        and (now - float(_CLOUD_CACHE.get("ts") or 0)) < _CLOUD_TTL_SEC
    ):
        return {
            "ok": True,
            "wallets": list(_CLOUD_CACHE.get("wallets") or []),
            "count": len(_CLOUD_CACHE.get("wallets") or []),
            "cached": True,
            "error": _CLOUD_CACHE.get("error"),
            "url_set": bool(_CLOUD_CACHE.get("url")),
        }

    url = _cloud_raw_url()
    out: dict[str, Any] = {
        "ok": False,
        "wallets": [],
        "count": 0,
        "cached": False,
        "error": None,
        "url_set": bool(url),
    }
    if not url:
        out["error"] = (
            "Cloud not configured. Set RUGWATCH_WALLETS_URL or "
            "RUGWATCH_GITHUB_REPO (+ optional RUGWATCH_GITHUB_PATH) in .env"
        )
        _CLOUD_CACHE.update({"ts": now, "wallets": [], "error": out["error"], "url": None})
        return out

    headers = {
        "User-Agent": "ActualTokenChecker-RugWatchBridge/1.0",
        "Accept": "application/json",
    }
    tok = _github_token()
    # Prefer Contents API for private repos when token + repo set
    repo = (
        os.environ.get("RUGWATCH_GITHUB_REPO") or os.environ.get("GITHUB_REPO") or ""
    ).strip().strip("/")
    path = (
        os.environ.get("RUGWATCH_GITHUB_PATH") or "data/wallets_cloud.json"
    ).strip().lstrip("/")
    branch = (os.environ.get("RUGWATCH_GITHUB_BRANCH") or "main").strip() or "main"

    try:
        raw_text = ""
        if tok and repo and "raw.githubusercontent.com" in (url or ""):
            api = f"https://api.github.com/repos/{repo}/contents/{path}?ref={branch}"
            req = urllib.request.Request(
                api,
                headers={
                    **headers,
                    "Authorization": f"Bearer {tok}",
                    "Accept": "application/vnd.github+json",
                },
            )
            with urllib.request.urlopen(req, timeout=18) as resp:  # noqa: S310
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
            b64 = (data.get("content") or "").replace("\n", "")
            if b64:
                raw_text = base64.b64decode(b64).decode("utf-8", errors="replace")
        if not raw_text:
            req = urllib.request.Request(url, headers=headers)
            if tok:
                req.add_header("Authorization", f"Bearer {tok}")
            with urllib.request.urlopen(req, timeout=18) as resp:  # noqa: S310
                raw_text = resp.read().decode("utf-8", errors="replace")
        parsed = json.loads(raw_text)
        items = _parse_wallet_payload(parsed)
        wallets: list[dict[str, Any]] = []
        for it in items:
            addr = (it.get("address") or it.get("wallet") or "").strip()
            if not addr or len(addr) < 32:
                continue
            try:
                score = int(
                    it.get("risk_score")
                    if it.get("risk_score") is not None
                    else 70
                )
            except (TypeError, ValueError):
                score = 70
            wallets.append(
                {
                    "address": addr,
                    "label": it.get("label") or "cloud",
                    "risk_score": score,
                    "times_seen": int(it.get("times_seen") or 0),
                    "notes": it.get("notes") or "cloud list",
                    "source": it.get("source") or "cloud",
                    "last_seen_at": it.get("last_seen_at"),
                    "origin": "cloud",
                }
            )
        out["ok"] = True
        out["wallets"] = wallets
        out["count"] = len(wallets)
        _CLOUD_CACHE.update(
            {"ts": now, "wallets": wallets, "error": None, "url": url}
        )
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
        # Keep stale cache if any
        if _CLOUD_CACHE.get("wallets"):
            out["ok"] = True
            out["wallets"] = list(_CLOUD_CACHE["wallets"])
            out["count"] = len(out["wallets"])
            out["cached"] = True
            out["stale"] = True
        else:
            _CLOUD_CACHE.update(
                {"ts": now, "wallets": [], "error": out["error"], "url": url}
            )

    return out


def fetch_local_wallets(
    *,
    min_score: int = 0,
    limit: int = 5000,
) -> dict[str, Any]:
    path = rugwatch_db_path()
    out: dict[str, Any] = {
        "ok": False,
        "db_found": bool(path),
        "wallets": [],
        "count": 0,
        "error": None,
    }
    if path is None:
        out["error"] = "local RugWatch DB not found"
        return out
    try:
        conn = sqlite3.connect(str(path), timeout=5.0)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT address, label, risk_score, times_seen,
                       notes, source, last_seen_at
                FROM wallets
                WHERE risk_score >= ?
                ORDER BY risk_score DESC
                LIMIT ?
                """,
                (min_score, limit),
            ).fetchall()
            wallets = []
            for r in rows:
                w = _wallet_row(r)
                w["origin"] = "local"
                wallets.append(w)
            out["wallets"] = wallets
            out["count"] = len(wallets)
            out["ok"] = True
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
    return out


def merge_flag_lists(
    local: list[dict[str, Any]],
    cloud: list[dict[str, Any]],
    *,
    min_score: int = 0,
) -> list[dict[str, Any]]:
    """Union by address; prefer higher score; tag origin local|cloud|both."""
    by_addr: dict[str, dict[str, Any]] = {}
    for src_name, rows in (("local", local), ("cloud", cloud)):
        for w in rows:
            addr = (w.get("address") or "").strip()
            if not addr:
                continue
            score = int(w.get("risk_score") or 0)
            if score < min_score:
                continue
            prev = by_addr.get(addr)
            if prev is None:
                row = dict(w)
                row["origin"] = src_name
                row["in_local"] = src_name == "local"
                row["in_cloud"] = src_name == "cloud"
                by_addr[addr] = row
            else:
                if src_name == "local":
                    prev["in_local"] = True
                if src_name == "cloud":
                    prev["in_cloud"] = True
                if prev.get("in_local") and prev.get("in_cloud"):
                    prev["origin"] = "both"
                elif prev.get("in_local"):
                    prev["origin"] = "local"
                else:
                    prev["origin"] = "cloud"
                if score > int(prev.get("risk_score") or 0):
                    prev["risk_score"] = score
                    if w.get("label"):
                        prev["label"] = w.get("label")
                    if w.get("notes"):
                        prev["notes"] = w.get("notes")
    return sorted(
        by_addr.values(),
        key=lambda x: (-int(x.get("risk_score") or 0), x.get("address") or ""),
    )


def fetch_rugwatch_flagged(
    mint: str | None = None,
    *,
    holder_wallets: list[str] | None = None,
    min_score: int = 0,
    limit: int = 40,
) -> dict[str, Any]:
    """
    Load flagged wallets from RugWatch local DB + cloud list.

    Returns:
      - linked_to_mint: wallets RugWatch already linked to this mint (local DB)
      - in_top_holders: flagged wallets (local|cloud|both) in current holders
      - high_risk_db / all_flagged: merged list
      - local_count / cloud_count / match_count
      - sources: which backends were available
    """
    path = rugwatch_db_path()
    cloud = fetch_cloud_wallets()
    local_pack = fetch_local_wallets(min_score=min_score, limit=max(limit, 2000))

    out: dict[str, Any] = {
        "ok": False,
        "db_found": bool(path),
        "cloud_found": bool(cloud.get("ok") and cloud.get("count")),
        "cloud_configured": bool(cloud.get("url_set")),
        "db_path": None,  # never expose absolute paths
        "linked_to_mint": [],
        "in_top_holders": [],
        "high_risk_db": [],
        "all_flagged": [],
        "db_wallet_count": int(local_pack.get("count") or 0),
        "local_count": int(local_pack.get("count") or 0),
        "cloud_count": int(cloud.get("count") or 0),
        "match_count": 0,
        "error": None,
        "sources": {
            "local": bool(local_pack.get("ok")),
            "cloud": bool(cloud.get("ok")),
            "cloud_error": cloud.get("error"),
            "local_error": local_pack.get("error"),
        },
    }

    mint = (mint or "").strip()
    holder_set = {
        (w or "").strip() for w in (holder_wallets or []) if (w or "").strip()
    }

    # Linked-to-mint still comes from local SQLite only (links table)
    linked: list[dict[str, Any]] = []
    if path is not None and mint:
        try:
            conn = sqlite3.connect(str(path), timeout=5.0)
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    """
                    SELECT w.address, w.label, w.risk_score, w.times_seen,
                           w.notes, w.source, w.last_seen_at,
                           l.role, l.evidence
                    FROM wallet_mint_links l
                    JOIN wallets w ON w.address = l.wallet
                    WHERE l.mint = ?
                      AND w.risk_score >= ?
                    ORDER BY w.risk_score DESC, w.times_seen DESC
                    LIMIT ?
                    """,
                    (mint, min_score, limit),
                ).fetchall()
                for r in rows:
                    row = _wallet_row(r, role=r["role"], evidence=r["evidence"])
                    row["origin"] = "local"
                    row["in_local"] = True
                    row["in_cloud"] = False
                    linked.append(row)
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            out["error"] = f"links query: {exc}"

    out["linked_to_mint"] = linked

    local_w = list(local_pack.get("wallets") or [])
    cloud_w = list(cloud.get("wallets") or [])
    # Tag cloud rows for merge
    for w in cloud_w:
        w["origin"] = "cloud"
    for w in local_w:
        w["origin"] = "local"

    all_flagged = merge_flag_lists(local_w, cloud_w, min_score=min_score)
    out["all_flagged"] = all_flagged[: max(limit, 200)]
    out["high_risk_db"] = [
        w for w in all_flagged if int(w.get("risk_score") or 0) >= 40
    ][:30]

    # Flagged among current top holders (local + cloud)
    in_top: list[dict[str, Any]] = []
    if holder_set:
        for w in all_flagged:
            a = w.get("address") or ""
            if a in holder_set:
                in_top.append(w)
    out["in_top_holders"] = in_top[:limit]

    linked_set = {w.get("address") for w in linked if w.get("address")}
    for w in out["all_flagged"]:
        a = w.get("address") or ""
        w["on_this_mint"] = a in linked_set
        w["in_top_holders"] = a in holder_set
        w["solscan_url"] = f"https://solscan.io/account/{a}" if a else None

    match_addrs = {w.get("address") for w in linked if w.get("address")}
    match_addrs |= {w.get("address") for w in in_top if w.get("address")}
    out["match_count"] = len(match_addrs)
    out["ok"] = bool(local_pack.get("ok") or cloud.get("ok") or linked)

    if not out["ok"] and not out.get("error"):
        errs = [local_pack.get("error"), cloud.get("error")]
        out["error"] = " · ".join(e for e in errs if e) or "no RugWatch local or cloud data"

    # Combined inventory for UI pills / headers
    out["inventory"] = {
        "local_now": out["local_count"],
        "cloud_now": out["cloud_count"],
        "merged_unique": len(all_flagged),
    }

    return out


def _wallet_row(
    r: sqlite3.Row | dict[str, Any],
    *,
    role: str | None = None,
    evidence: str | None = None,
) -> dict[str, Any]:
    if not isinstance(r, dict):
        r = dict(r)
    addr = r.get("address") or ""
    return {
        "address": addr,
        "label": r.get("label"),
        "risk_score": int(r.get("risk_score") or 0),
        "times_seen": int(r.get("times_seen") or 0),
        "notes": r.get("notes"),
        "source": r.get("source"),
        "last_seen_at": r.get("last_seen_at"),
        "role": role,
        "evidence": evidence,
        "solscan_url": f"https://solscan.io/account/{addr}" if addr else None,
    }
