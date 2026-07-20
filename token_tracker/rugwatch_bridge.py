"""
Read-only bridge from ATC → RugWatch.

Sources (merged):
  1) Local multi-DB: rugwatch.db + rugwatch_002.db + …
  2) Cloud JSON via RUGWATCH_WALLETS_URL:
       - single rugwatch_wallets_v1 file, OR
       - wallets_index.json listing multiple shard files

Does NOT import RugWatch package code.
Never returns absolute local filesystem paths in public fields.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .env_config import load_dotenv, project_root
from .http_util import DEFAULT_HEADERS, _ssl_context


def rugwatch_db_path() -> Path | None:
    """Primary local DB path (first found). Prefer rugwatch_db_paths()."""
    paths = rugwatch_db_paths()
    return paths[0] if paths else None


def rugwatch_db_paths() -> list[Path]:
    """
    All local RugWatch SQLite shards:
      rugwatch.db, rugwatch_002.db, rugwatch_003.db, ...
    """
    load_dotenv()
    env = (os.environ.get("RUGWATCH_DB") or "").strip()
    seeds: list[Path] = []
    if env:
        seeds.append(Path(env))
    seeds.extend(
        [
            project_root().parent / "RugWatch" / "data" / "rugwatch.db",
            project_root() / "RugWatch" / "data" / "rugwatch.db",
            Path.home() / "RugWatch" / "data" / "rugwatch.db",
        ]
    )

    found: list[Path] = []
    seen: set[str] = set()

    def _add(p: Path) -> None:
        try:
            key = str(p.resolve())
        except OSError:
            key = str(p)
        if key in seen:
            return
        if p.is_file():
            seen.add(key)
            found.append(p)

    for seed in seeds:
        _add(seed)
        # Sibling overflow shards next to primary
        if seed.name:
            parent = seed.parent
            stem = seed.stem  # rugwatch
            pat = re.compile(rf"^{re.escape(stem)}_(\d{{3}})\.db$", re.I)
            try:
                extras: list[tuple[int, Path]] = []
                for p in parent.iterdir():
                    m = pat.match(p.name)
                    if m and p.is_file():
                        extras.append((int(m.group(1)), p))
                for _, p in sorted(extras, key=lambda t: t[0]):
                    _add(p)
            except OSError:
                pass
        # Also discover under common data dirs even if primary name differs
        if not found:
            continue

    # If env pointed at a missing file, still try default dirs' shards only once
    if not found:
        for data_dir in (
            project_root().parent / "RugWatch" / "data",
            project_root() / "RugWatch" / "data",
            Path.home() / "RugWatch" / "data",
        ):
            primary = data_dir / "rugwatch.db"
            _add(primary)
            try:
                for p in sorted(data_dir.glob("rugwatch_*.db")):
                    _add(p)
            except OSError:
                pass

    return found


# Public multi-shard cloud list (safe default for this project’s website).
# Override with RUGWATCH_WALLETS_URL on the server if needed.
_DEFAULT_WALLETS_URL = (
    "https://raw.githubusercontent.com/Greenwolf30/RugWatch/main/data/wallets_index.json"
)


def _wallets_url() -> str | None:
    load_dotenv()
    # Explicit env wins (empty string = disable cloud list)
    if "RUGWATCH_WALLETS_URL" in os.environ:
        return (os.environ.get("RUGWATCH_WALLETS_URL") or "").strip() or None
    return _DEFAULT_WALLETS_URL


def _http_get_json(url: str, *, timeout: float = 20.0) -> Any:
    req = urllib.request.Request(url, headers={**DEFAULT_HEADERS, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw.strip() else {}


def _parse_wallet_items(payload: Any) -> list[dict[str, Any]]:
    """Accept list or {wallets:[...]} or index is handled separately."""
    if payload is None:
        return []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("wallets"), list):
            items = payload["wallets"]
        else:
            items = []
    else:
        return []
    out: list[dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        addr = (it.get("address") or it.get("wallet") or "").strip()
        if not addr or len(addr) < 32:
            continue
        try:
            score = int(it.get("risk_score") if it.get("risk_score") is not None else 70)
        except (TypeError, ValueError):
            score = 70
        out.append(
            {
                "address": addr,
                "label": it.get("label") or "cloud",
                "risk_score": score,
                "times_seen": int(it.get("times_seen") or 0),
                "notes": it.get("notes") or "",
                "source": it.get("source") or "cloud",
                "last_seen_at": it.get("last_seen_at"),
                "origin": "cloud",
            }
        )
    return out


def _resolve_shard_url(index_url: str, shard_path: str) -> str:
    """
    Build raw URL for a shard path like data/wallets_cloud_002.json
    from an index URL ending in data/wallets_index.json.
    """
    path = shard_path.lstrip("/")
    if index_url.endswith("wallets_index.json"):
        base = index_url[: -len("wallets_index.json")]
        # index lives in same dir as shards usually data/
        name = path.split("/")[-1]
        return base + name
    # generic: replace last path segment
    if "/" in index_url:
        return index_url.rsplit("/", 1)[0] + "/" + path.split("/")[-1]
    return index_url


def fetch_cloud_wallets() -> dict[str, Any]:
    """
    Load all cloud wallets from RUGWATCH_WALLETS_URL.
    Supports multi-shard index (rugwatch_wallets_index_v1).
    """
    url = _wallets_url()
    result: dict[str, Any] = {
        "ok": False,
        "url_set": bool(url),
        "wallets": [],
        "count": 0,
        "shards": 0,
        "error": None,
    }
    if not url:
        result["error"] = "RUGWATCH_WALLETS_URL not set"
        return result
    try:
        payload = _http_get_json(url)
        wallets: list[dict[str, Any]] = []
        if isinstance(payload, dict) and payload.get("format") == "rugwatch_wallets_index_v1":
            shards = payload.get("shards") or []
            for s in shards:
                if not isinstance(s, dict):
                    continue
                sp = (s.get("path") or "").strip()
                if not sp:
                    continue
                shard_url = _resolve_shard_url(url, sp)
                try:
                    body = _http_get_json(shard_url)
                    wallets.extend(_parse_wallet_items(body))
                except Exception as exc:  # noqa: BLE001
                    result["error"] = (result.get("error") or "") + f" shard {sp}: {exc}; "
            result["shards"] = len(shards)
        else:
            wallets = _parse_wallet_items(payload)
            result["shards"] = 1 if wallets or payload else 0

        # de-dupe by address (keep highest score)
        by_addr: dict[str, dict[str, Any]] = {}
        for w in wallets:
            a = w["address"]
            prev = by_addr.get(a)
            if prev is None or int(w.get("risk_score") or 0) > int(prev.get("risk_score") or 0):
                by_addr[a] = w
        merged = list(by_addr.values())
        result["wallets"] = merged
        result["count"] = len(merged)
        result["ok"] = True
        if isinstance(payload, dict) and isinstance(payload.get("total_count"), int):
            # prefer index total when larger parse failed partially
            if int(payload["total_count"]) >= result["count"]:
                pass  # keep parsed count (accurate for matching)
        return result
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        result["ok"] = False
        return result


def _load_local_wallets(
    *,
    min_score: int = 0,
    holder_set: set[str] | None = None,
    mint: str | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    paths = rugwatch_db_paths()
    out: dict[str, Any] = {
        "ok": bool(paths),
        "db_found": bool(paths),
        "local_shards": len(paths),
        "db_wallet_count": 0,
        "linked_to_mint": [],
        "in_top_holders": [],
        "all_flagged": [],
        "by_address": {},  # address -> row with origin local
        "error": None,
    }
    if not paths:
        out["error"] = (
            "RugWatch DB not found. Install/run RugWatch or set RUGWATCH_DB "
            "to your rugwatch.db location in .env"
        )
        return out

    holder_set = holder_set or set()
    mint = (mint or "").strip()
    linked: list[dict[str, Any]] = []
    in_top: list[dict[str, Any]] = []
    all_flagged: list[dict[str, Any]] = []
    by_addr: dict[str, dict[str, Any]] = {}
    total = 0

    for path in paths:
        try:
            conn = sqlite3.connect(str(path), timeout=5.0)
            conn.row_factory = sqlite3.Row
            try:
                try:
                    total += int(conn.execute("SELECT COUNT(*) FROM wallets").fetchone()[0])
                except sqlite3.Error:
                    pass

                # all wallets for matching (cap per shard to keep memory sane)
                try:
                    rows = conn.execute(
                        """
                        SELECT address, label, risk_score, times_seen,
                               notes, source, last_seen_at
                        FROM wallets
                        WHERE risk_score >= ?
                        ORDER BY risk_score DESC, times_seen DESC
                        LIMIT ?
                        """,
                        (min_score, max(limit, 50_000)),
                    ).fetchall()
                    for r in rows:
                        w = _wallet_row(r)
                        w["origin"] = "local"
                        a = w.get("address") or ""
                        if not a:
                            continue
                        prev = by_addr.get(a)
                        if prev is None or int(w.get("risk_score") or 0) >= int(
                            prev.get("risk_score") or 0
                        ):
                            by_addr[a] = w
                        all_flagged.append(w)
                except sqlite3.Error as exc:
                    out["error"] = (out.get("error") or "") + f" wallets: {exc}; "

                if mint:
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
                            linked.append(
                                _wallet_row(r, role=r["role"], evidence=r["evidence"])
                            )
                    except sqlite3.Error:
                        # overflow shards may lack links table
                        pass

                if holder_set:
                    addrs = list(holder_set)
                    for i in range(0, len(addrs), 80):
                        chunk = addrs[i : i + 80]
                        placeholders = ",".join("?" * len(chunk))
                        try:
                            rows = conn.execute(
                                f"""
                                SELECT address, label, risk_score, times_seen,
                                       notes, source, last_seen_at
                                FROM wallets
                                WHERE address IN ({placeholders})
                                  AND risk_score >= ?
                                ORDER BY risk_score DESC
                                """,
                                (*chunk, min_score),
                            ).fetchall()
                            for r in rows:
                                in_top.append(_wallet_row(r))
                        except sqlite3.Error:
                            continue
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            out["error"] = (out.get("error") or "") + f"{path.name}: {exc}; "

    # de-dupe lists
    def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        out_rows: list[dict[str, Any]] = []
        for w in rows:
            a = w.get("address") or ""
            if a and a not in seen:
                seen.add(a)
                out_rows.append(w)
        return out_rows

    out["db_wallet_count"] = total
    out["linked_to_mint"] = _dedupe(linked)
    out["in_top_holders"] = _dedupe(in_top)
    out["all_flagged"] = _dedupe(all_flagged)[: max(limit, 200)]
    out["by_address"] = by_addr
    out["ok"] = True
    return out


def fetch_rugwatch_flagged(
    mint: str | None = None,
    *,
    holder_wallets: list[str] | None = None,
    min_score: int = 0,
    limit: int = 40,
) -> dict[str, Any]:
    """
    Load flagged wallets from RugWatch local multi-DB + optional cloud URL.

    Tags each match with origin: local | cloud | both
    (also exposed as location / tag fields for Holders UI).
    """
    mint = (mint or "").strip()
    holder_set = {
        (w or "").strip() for w in (holder_wallets or []) if (w or "").strip()
    }

    out: dict[str, Any] = {
        "ok": False,
        "db_found": False,
        "db_path": None,
        "linked_to_mint": [],
        "in_top_holders": [],
        "high_risk_db": [],
        "all_flagged": [],
        "db_wallet_count": 0,
        "cloud_wallet_count": 0,
        "local_shards": 0,
        "cloud_shards": 0,
        "match_count": 0,
        "error": None,
        "sources": [],
    }

    local = _load_local_wallets(
        min_score=min_score, holder_set=holder_set, mint=mint, limit=limit
    )
    cloud = fetch_cloud_wallets()

    out["db_found"] = bool(local.get("db_found"))
    out["local_shards"] = int(local.get("local_shards") or 0)
    out["db_wallet_count"] = int(local.get("db_wallet_count") or 0)
    out["cloud_wallet_count"] = int(cloud.get("count") or 0)
    out["cloud_shards"] = int(cloud.get("shards") or 0)
    if local.get("ok"):
        out["sources"].append("local")
    if cloud.get("ok"):
        out["sources"].append("cloud")

    errs = []
    if local.get("error") and not local.get("ok"):
        errs.append(str(local["error"]))
    if cloud.get("url_set") and cloud.get("error") and not cloud.get("ok"):
        errs.append(f"cloud: {cloud['error']}")
    out["error"] = "; ".join(errs) if errs else None

    # Merge address maps
    local_map: dict[str, dict[str, Any]] = dict(local.get("by_address") or {})
    cloud_map: dict[str, dict[str, Any]] = {}
    for w in cloud.get("wallets") or []:
        a = (w.get("address") or "").strip()
        if a and int(w.get("risk_score") or 0) >= min_score:
            cloud_map[a] = w

    def _tag(addr: str, base: dict[str, Any]) -> dict[str, Any]:
        in_l = addr in local_map
        in_c = addr in cloud_map
        if in_l and in_c:
            origin = "both"
            tag = "[both]"
        elif in_c:
            origin = "cloud"
            tag = "[cloud]"
        else:
            origin = "local"
            tag = "[local]"
        row = dict(base)
        row["origin"] = origin
        row["location"] = origin
        row["tag"] = tag
        row["solscan_url"] = f"https://solscan.io/account/{addr}" if addr else None
        return row

    # Prefer richer local row when both
    merged_all: list[dict[str, Any]] = []
    all_addrs = set(local_map) | set(cloud_map)
    for a in all_addrs:
        base = local_map.get(a) or cloud_map.get(a) or {}
        if a in local_map and a in cloud_map:
            # merge notes/score
            base = dict(local_map[a])
            base["risk_score"] = max(
                int(local_map[a].get("risk_score") or 0),
                int(cloud_map[a].get("risk_score") or 0),
            )
        merged_all.append(_tag(a, base))

    merged_all.sort(
        key=lambda w: (-int(w.get("risk_score") or 0), str(w.get("address") or ""))
    )

    # linked (local only — links live in primary DB)
    linked = []
    for w in local.get("linked_to_mint") or []:
        a = w.get("address") or ""
        linked.append(_tag(a, w))
    out["linked_to_mint"] = linked

    # in top holders: match holders against local ∪ cloud
    in_top: list[dict[str, Any]] = []
    for a in holder_set:
        if a in local_map or a in cloud_map:
            base = local_map.get(a) or cloud_map.get(a) or {}
            in_top.append(_tag(a, base))
    in_top.sort(key=lambda w: -int(w.get("risk_score") or 0))
    out["in_top_holders"] = in_top

    out["all_flagged"] = merged_all[: max(limit, 200)]
    out["high_risk_db"] = [
        w for w in out["all_flagged"] if int(w.get("risk_score") or 0) >= 40
    ][:30]

    for w in out["all_flagged"]:
        a = w.get("address") or ""
        w["on_this_mint"] = any(x.get("address") == a for x in linked)
        w["in_top_holders"] = a in holder_set

    match_addrs = {w.get("address") for w in linked if w.get("address")}
    match_addrs |= {w.get("address") for w in in_top if w.get("address")}
    out["match_count"] = len(match_addrs)

    out["ok"] = bool(local.get("ok") or cloud.get("ok"))
    if not out["ok"] and not out["error"]:
        out["error"] = (
            "No RugWatch local DB and no working RUGWATCH_WALLETS_URL. "
            "Set RUGWATCH_DB and/or RUGWATCH_WALLETS_URL "
            "(prefer .../data/wallets_index.json for multi-shard cloud)."
        )
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
