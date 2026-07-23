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
        notes = it.get("notes") or ""
        from_m = mints_from_notes(notes)
        # also accept explicit fields if present
        for mm in list(it.get("flagged_from_mints") or []):
            s = str(mm or "").strip()
            if s and s not in from_m:
                from_m.append(s)
        fm = (it.get("flagged_from_mint") or "").strip()
        if fm and fm not in from_m:
            from_m.insert(0, fm)
        initial = from_m[0] if from_m else None
        try:
            times_flagged = int(
                it.get("times_flagged")
                if it.get("times_flagged") is not None
                else it.get("times_seen") or 0
            )
        except (TypeError, ValueError):
            times_flagged = 0
        try:
            mint_flag_count = int(it.get("mint_flag_count") or 0)
        except (TypeError, ValueError):
            mint_flag_count = 0
        out.append(
            {
                "address": addr,
                "label": it.get("label") or "cloud",
                "risk_score": score,
                "times_seen": int(it.get("times_seen") or 0),
                "times_flagged": times_flagged,
                "mint_flag_count": mint_flag_count,
                "notes": notes,
                "source": it.get("source") or "cloud",
                "last_seen_at": it.get("last_seen_at"),
                "origin": "cloud",
                "flagged_from_mints": [initial] if initial else [],
                "flagged_from_mint": initial,
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

        # de-dupe by address (keep highest score); never list the same CA twice
        by_addr: dict[str, dict[str, Any]] = {}
        for w in wallets:
            a = (w.get("address") or "").strip()
            if not a:
                continue
            w["address"] = a
            prev = by_addr.get(a)
            if prev is None or int(w.get("risk_score") or 0) > int(
                prev.get("risk_score") or 0
            ):
                by_addr[a] = w
            else:
                # merge times_flagged / notes mints into the kept row
                try:
                    prev["times_flagged"] = max(
                        int(prev.get("times_flagged") or 0),
                        int(w.get("times_flagged") or 0),
                    )
                except (TypeError, ValueError):
                    pass
                mset = list(prev.get("flagged_from_mints") or [])
                for mm in list(w.get("flagged_from_mints") or []):
                    if mm and mm not in mset:
                        mset.append(mm)
                if mset:
                    prev["flagged_from_mints"] = mset
                    if not prev.get("flagged_from_mint"):
                        prev["flagged_from_mint"] = mset[0]
        merged = list(by_addr.values())
        result["wallets"] = merged
        result["count"] = len(merged)
        result["deduped"] = True
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


def rugwatch_site_url() -> str | None:
    """
    Live RugWatch website base URL (no trailing slash).
    Used so hosted ATC can reflect RugWatch's *site* local DB when this
    host has no rugwatch.db file.
    """
    load_dotenv()
    raw = (
        os.environ.get("RUGWATCH_URL")
        or os.environ.get("RUGWATCH_SITE_URL")
        or ""
    ).strip()
    if not raw:
        # Same default as web/config.js rugwatchUrl
        raw = "https://rugwatch.onrender.com"
    if raw.lower() in {"0", "false", "off", "none", "disabled"}:
        return None
    return raw.rstrip("/")


def fetch_remote_rugwatch_local_count() -> dict[str, Any]:
    """
    GET {RUGWATCH_URL}/api/stats → stats.wallets (RugWatch site local SQLite).
    """
    base = rugwatch_site_url()
    out: dict[str, Any] = {
        "ok": False,
        "url_set": bool(base),
        "count": 0,
        "shards": 0,
        "error": None,
        "source": "rugwatch_site",
        "site_url": base,
    }
    if not base:
        out["error"] = "RUGWATCH_URL disabled"
        return out
    try:
        payload = _http_get_json(f"{base}/api/stats", timeout=15.0)
        stats = payload.get("stats") if isinstance(payload, dict) else None
        if not isinstance(stats, dict):
            out["error"] = "RugWatch /api/stats missing stats object"
            return out
        n = stats.get("wallets")
        if n is None:
            n = stats.get("wallets_logged")
        out["count"] = int(n or 0)
        out["shards"] = int(stats.get("local_shards") or 0)
        out["ok"] = True
        return out
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
        return out


def fetch_remote_rugwatch_wallets(
    *,
    min_score: int = 0,
    limit: int = 50_000,
) -> dict[str, Any]:
    """
    GET {RUGWATCH_URL}/api/wallets — wallets from RugWatch site local DB.
    Used for Analyze matching when ATC has no on-disk rugwatch.db.
    """
    base = rugwatch_site_url()
    out: dict[str, Any] = {
        "ok": False,
        "url_set": bool(base),
        "wallets": [],
        "count": 0,
        "error": None,
        "source": "rugwatch_site",
        "site_url": base,
    }
    if not base:
        out["error"] = "RUGWATCH_URL disabled"
        return out
    try:
        lim = max(1, min(int(limit), 100_000))
        url = f"{base}/api/wallets?min_score={int(min_score)}&limit={lim}"
        payload = _http_get_json(url, timeout=45.0)
        rows = payload.get("wallets") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            out["error"] = "RugWatch /api/wallets missing wallets list"
            return out
        by_addr: dict[str, dict[str, Any]] = {}
        for it in rows:
            if not isinstance(it, dict):
                continue
            addr = (it.get("address") or it.get("wallet") or "").strip()
            if not addr or len(addr) < 32:
                continue
            try:
                score = int(
                    it.get("risk_score")
                    if it.get("risk_score") is not None
                    else it.get("score")
                    or 0
                )
            except (TypeError, ValueError):
                score = 0
            if score < min_score:
                continue
            notes = it.get("notes") or ""
            from_m = mints_from_notes(notes)
            fm = (it.get("flagged_from_mint") or "").strip()
            if fm and fm not in from_m:
                from_m.insert(0, fm)
            for mm in list(it.get("flagged_from_mints") or []):
                s = str(mm or "").strip()
                if s and s not in from_m:
                    from_m.append(s)
            initial = from_m[0] if from_m else None
            try:
                times_flagged = int(
                    it.get("times_flagged")
                    if it.get("times_flagged") is not None
                    else it.get("times_seen")
                    or 0
                )
            except (TypeError, ValueError):
                times_flagged = 0
            row = {
                "address": addr,
                "label": it.get("label") or "remote_local",
                "risk_score": score,
                "times_seen": int(it.get("times_seen") or times_flagged or 0),
                "times_flagged": times_flagged,
                "notes": notes,
                "source": it.get("source") or "rugwatch_site",
                "last_seen_at": it.get("last_seen_at"),
                "origin": "local",
                "flagged_from_mints": [initial] if initial else [],
                "flagged_from_mint": initial,
            }
            prev = by_addr.get(addr)
            if prev is None or score > int(prev.get("risk_score") or 0):
                by_addr[addr] = row
            else:
                try:
                    prev["times_flagged"] = max(
                        int(prev.get("times_flagged") or 0), times_flagged
                    )
                except (TypeError, ValueError):
                    pass
        wallets = list(by_addr.values())
        out["wallets"] = wallets
        out["count"] = len(wallets)
        out["ok"] = True
        return out
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
        return out


def count_local_wallets() -> dict[str, Any]:
    """
    Local wallet count for ATC:

    1) On-disk rugwatch*.db if present (desktop / same host as RugWatch data)
    2) Else live RugWatch site /api/stats (so hosted ATC mirrors RugWatch local)

    Does not copy files — remote is a live read of RugWatch's local DB count.
    """
    paths = rugwatch_db_paths()
    out: dict[str, Any] = {
        "ok": False,
        "db_found": bool(paths),
        "local_shards": len(paths),
        "count": 0,
        "error": None,
        # Never expose absolute paths to the website
        "shard_names": [p.name for p in paths],
        "source": None,
        "site_url": None,
    }
    if paths:
        total = 0
        errs: list[str] = []
        for path in paths:
            try:
                conn = sqlite3.connect(str(path), timeout=5.0)
                try:
                    total += int(
                        conn.execute("SELECT COUNT(*) FROM wallets").fetchone()[0]
                    )
                finally:
                    conn.close()
            except sqlite3.Error as exc:
                errs.append(f"{path.name}: {exc}")
            except OSError as exc:
                errs.append(f"{path.name}: {exc}")
        out["count"] = total
        out["ok"] = True
        out["source"] = "sqlite"
        if errs:
            out["error"] = "; ".join(errs)
        return out

    # No disk DB — mirror RugWatch website local count
    remote = fetch_remote_rugwatch_local_count()
    out["source"] = "rugwatch_site"
    out["site_url"] = remote.get("site_url")
    out["count"] = int(remote.get("count") or 0)
    out["local_shards"] = int(remote.get("shards") or 0)
    out["db_found"] = bool(remote.get("ok"))  # treat remote local as available
    out["ok"] = bool(remote.get("ok"))
    out["error"] = remote.get("error") or (
        None
        if remote.get("ok")
        else "No on-disk rugwatch.db and RugWatch site stats unavailable"
    )
    return out


def count_cloud_wallets(*, full_parse: bool = False) -> dict[str, Any]:
    """
    Cloud wallet count from RUGWATCH_WALLETS_URL.

    Prefer index total_count / sum of shard counts (one lightweight HTTP GET).
    Set full_parse=True to load every shard and de-dupe (slower, unique count).
    """
    url = _wallets_url()
    out: dict[str, Any] = {
        "ok": False,
        "url_set": bool(url),
        "count": 0,
        "shards": 0,
        "error": None,
        "method": None,
    }
    if not url:
        out["error"] = "RUGWATCH_WALLETS_URL not set (cloud list disabled)"
        return out

    if full_parse:
        full = fetch_cloud_wallets()
        out["ok"] = bool(full.get("ok"))
        out["count"] = int(full.get("count") or 0)
        out["shards"] = int(full.get("shards") or 0)
        out["error"] = full.get("error")
        out["method"] = "full_parse"
        return out

    try:
        payload = _http_get_json(url)
        if isinstance(payload, dict) and payload.get("format") == "rugwatch_wallets_index_v1":
            shards = payload.get("shards") or []
            out["shards"] = len(shards) if isinstance(shards, list) else 0
            if isinstance(payload.get("total_count"), int):
                out["count"] = int(payload["total_count"])
                out["method"] = "index_total_count"
            else:
                ssum = 0
                for s in shards if isinstance(shards, list) else []:
                    if isinstance(s, dict) and s.get("count") is not None:
                        try:
                            ssum += int(s["count"])
                        except (TypeError, ValueError):
                            pass
                out["count"] = ssum
                out["method"] = "index_shard_sum"
            out["ok"] = True
            return out

        # Single-file payload
        wallets = _parse_wallet_items(payload)
        out["count"] = len(wallets)
        out["shards"] = 1 if wallets or payload else 0
        out["method"] = "single_file"
        out["ok"] = True
        return out
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
        out["ok"] = False
        return out


def rugwatch_wallet_counts(*, full_cloud: bool = False) -> dict[str, Any]:
    """
    Local DB + cloud wallet counts for the ATC website status strip.
    Local = on-disk SQLite, or live RugWatch site local count as fallback.
    Does not return wallet addresses or filesystem paths.
    """
    local = count_local_wallets()
    cloud = count_cloud_wallets(full_parse=full_cloud)
    sources: list[str] = []
    if local.get("ok"):
        sources.append("local")
    if cloud.get("url_set") and cloud.get("ok"):
        sources.append("cloud")
    errs: list[str] = []
    if local.get("error") and not local.get("ok"):
        errs.append(str(local["error"]))
    if cloud.get("error"):
        errs.append(f"cloud: {cloud['error']}")
    return {
        "ok": bool(sources) or bool(local.get("ok") or cloud.get("ok")),
        "local": {
            "count": int(local.get("count") or 0),
            "db_found": bool(local.get("db_found")),
            "shards": int(local.get("local_shards") or 0),
            "shard_names": list(local.get("shard_names") or []),
            "ok": bool(local.get("ok")),
            "error": local.get("error"),
            "source": local.get("source"),
            "site_url": local.get("site_url"),
        },
        "cloud": {
            "count": int(cloud.get("count") or 0),
            "url_set": bool(cloud.get("url_set")),
            "shards": int(cloud.get("shards") or 0),
            "ok": bool(cloud.get("ok")),
            "method": cloud.get("method"),
            "error": cloud.get("error"),
        },
        "sources": sources,
        "error": "; ".join(errs) if errs else None,
    }


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
        "source": "sqlite" if paths else None,
    }
    if not paths:
        # Mirror RugWatch site local DB for hosted ATC (no shared disk)
        remote = fetch_remote_rugwatch_wallets(
            min_score=min_score, limit=max(limit, 50_000)
        )
        out["source"] = "rugwatch_site"
        out["db_found"] = bool(remote.get("ok"))
        if not remote.get("ok"):
            out["error"] = (
                remote.get("error")
                or "RugWatch DB not found and RugWatch site wallets unavailable. "
                "Set RUGWATCH_DB or RUGWATCH_URL."
            )
            return out
        by_addr: dict[str, dict[str, Any]] = {}
        holder_set = holder_set or set()
        for w in remote.get("wallets") or []:
            a = (w.get("address") or "").strip()
            if not a:
                continue
            w = dict(w)
            w["address"] = a
            prev = by_addr.get(a)
            if prev is None or int(w.get("risk_score") or 0) >= int(
                prev.get("risk_score") or 0
            ):
                by_addr[a] = w
        all_flagged = list(by_addr.values())
        all_flagged.sort(
            key=lambda x: (
                -int(x.get("risk_score") or 0),
                str(x.get("address") or ""),
            )
        )
        in_top = [by_addr[a] for a in holder_set if a in by_addr]
        in_top.sort(key=lambda x: -int(x.get("risk_score") or 0))
        out["db_wallet_count"] = int(remote.get("count") or len(by_addr))
        out["by_address"] = by_addr
        out["all_flagged"] = all_flagged[: max(limit, 200)]
        out["in_top_holders"] = in_top
        out["linked_to_mint"] = []
        out["ok"] = True
        out["error"] = None
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
                                _wallet_row(
                                    r,
                                    role=r["role"],
                                    evidence=r["evidence"],
                                    linked_mints=[mint],
                                )
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

                # Map wallet → mints from wallet_mint_links (source mints for flags)
                try:
                    link_rows = conn.execute(
                        """
                        SELECT wallet, mint FROM wallet_mint_links
                        LIMIT 200000
                        """
                    ).fetchall()
                    mints_by_wallet: dict[str, list[str]] = {}
                    for lr in link_rows:
                        try:
                            ww = (
                                lr["wallet"] if isinstance(lr, sqlite3.Row) else lr[0]
                            ) or ""
                            mm = (
                                lr["mint"] if isinstance(lr, sqlite3.Row) else lr[1]
                            ) or ""
                        except (KeyError, IndexError, TypeError):
                            continue
                        ww = str(ww).strip()
                        mm = str(mm).strip()
                        if not ww or not mm:
                            continue
                        mints_by_wallet.setdefault(ww, [])
                        if mm not in mints_by_wallet[ww]:
                            mints_by_wallet[ww].append(mm)

                    def _enrich_from_links(w: dict[str, Any]) -> None:
                        a = (w.get("address") or "").strip()
                        if not a:
                            return
                        extra = mints_by_wallet.get(a) or []
                        if not extra:
                            return
                        cur = list(w.get("flagged_from_mints") or [])
                        for mm in extra:
                            if mm not in cur:
                                cur.append(mm)
                        w["flagged_from_mints"] = cur
                        if cur:
                            w["flagged_from_mint"] = cur[0]

                    for bucket in (all_flagged, in_top, linked):
                        for w in bucket:
                            _enrich_from_links(w)
                    for w in by_addr.values():
                        _enrich_from_links(w)
                except sqlite3.Error:
                    pass
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            out["error"] = (out.get("error") or "") + f"{path.name}: {exc}; "

    # de-dupe lists by address (prefer higher risk_score already in by_addr)
    def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        out_rows: list[dict[str, Any]] = []
        for w in rows:
            a = (w.get("address") or "").strip()
            if not a or a in seen:
                continue
            seen.add(a)
            # Prefer merged by_addr row when present (best score across shards)
            out_rows.append(by_addr.get(a) or w)
        return out_rows

    out["db_wallet_count"] = total
    out["linked_to_mint"] = _dedupe(linked)
    out["in_top_holders"] = _dedupe(in_top)
    # all_flagged from unique map — not the raw multi-shard append list
    uniq_all = list(by_addr.values())
    uniq_all.sort(
        key=lambda x: (
            -int(x.get("risk_score") or 0),
            str(x.get("address") or ""),
        )
    )
    out["all_flagged"] = uniq_all[: max(limit, 200)]
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

    # Prefer richer local row when both — one row per address only
    merged_by: dict[str, dict[str, Any]] = {}
    all_addrs = set(local_map) | set(cloud_map)
    for a in all_addrs:
        a = (a or "").strip()
        if not a or a in merged_by:
            continue
        base = local_map.get(a) or cloud_map.get(a) or {}
        if a in local_map and a in cloud_map:
            # merge notes/score
            base = dict(local_map[a])
            base["address"] = a
            base["risk_score"] = max(
                int(local_map[a].get("risk_score") or 0),
                int(cloud_map[a].get("risk_score") or 0),
            )
            # union flagged-from mints
            mset: list[str] = []
            for src in (local_map[a], cloud_map[a]):
                for mm in list(src.get("flagged_from_mints") or []):
                    if mm and mm not in mset:
                        mset.append(mm)
            for mm in mints_from_notes(cloud_map[a].get("notes")) + mints_from_notes(
                local_map[a].get("notes")
            ):
                if mm not in mset:
                    mset.append(mm)
            base["flagged_from_mints"] = mset
            base["flagged_from_mint"] = mset[0] if mset else None
            try:
                base["times_flagged"] = max(
                    int(local_map[a].get("times_flagged") or 0),
                    int(cloud_map[a].get("times_flagged") or 0),
                    int(local_map[a].get("times_seen") or 0),
                    int(cloud_map[a].get("times_seen") or 0),
                )
            except (TypeError, ValueError):
                pass
        else:
            base = dict(base)
            base["address"] = a
            # ensure cloud-only notes mint parse
            if not base.get("flagged_from_mints"):
                mset = mints_from_notes(base.get("notes"))
                base["flagged_from_mints"] = mset
                base["flagged_from_mint"] = mset[0] if mset else None
        merged_by[a] = _tag(a, base)

    merged_all = list(merged_by.values())
    merged_all.sort(
        key=lambda w: (-int(w.get("risk_score") or 0), str(w.get("address") or ""))
    )

    # linked (local only — links live in primary DB) — unique addresses
    linked: list[dict[str, Any]] = []
    linked_seen: set[str] = set()
    for w in local.get("linked_to_mint") or []:
        a = (w.get("address") or "").strip()
        if not a or a in linked_seen:
            continue
        linked_seen.add(a)
        linked.append(_tag(a, merged_by.get(a) or w))
    out["linked_to_mint"] = linked

    # in top holders: match holders against local ∪ cloud — one per address
    in_top: list[dict[str, Any]] = []
    top_seen: set[str] = set()
    for a in holder_set:
        a = (a or "").strip()
        if not a or a in top_seen:
            continue
        if a in merged_by or a in local_map or a in cloud_map:
            top_seen.add(a)
            base = merged_by.get(a) or local_map.get(a) or cloud_map.get(a) or {}
            in_top.append(merged_by.get(a) or _tag(a, base))
    in_top.sort(key=lambda w: -int(w.get("risk_score") or 0))
    out["in_top_holders"] = in_top

    out["all_flagged"] = merged_all[: max(limit, 200)]
    out["high_risk_db"] = [
        w for w in out["all_flagged"] if int(w.get("risk_score") or 0) >= 40
    ][:30]

    linked_addrs = { (x.get("address") or "").strip() for x in linked }
    for w in out["all_flagged"]:
        a = (w.get("address") or "").strip()
        w["on_this_mint"] = a in linked_addrs
        w["in_top_holders"] = a in holder_set

    match_addrs = set(linked_addrs)
    match_addrs |= { (w.get("address") or "").strip() for w in in_top if w.get("address") }
    match_addrs.discard("")
    out["match_count"] = len(match_addrs)
    out["unique_addresses"] = len(merged_by)

    out["ok"] = bool(local.get("ok") or cloud.get("ok"))
    if not out["ok"] and not out["error"]:
        out["error"] = (
            "No RugWatch local DB and no working RUGWATCH_WALLETS_URL. "
            "Set RUGWATCH_DB and/or RUGWATCH_WALLETS_URL "
            "(prefer .../data/wallets_index.json for multi-shard cloud)."
        )
    return out


_MINT_IN_TEXT_RE = re.compile(
    r"\bmint\s+([1-9A-HJ-NP-Za-km-z]{32,44})\b",
    re.I,
)


def mints_from_notes(notes: str | None) -> list[str]:
    """Pull mint addresses from Ruggers/ATC upload notes ('mint <CA>')."""
    t = str(notes or "")
    if not t.strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    for m in _MINT_IN_TEXT_RE.findall(t):
        a = (m or "").strip()
        if a and a not in seen:
            seen.add(a)
            out.append(a)
    return out


def _wallet_row(
    r: sqlite3.Row | dict[str, Any],
    *,
    role: str | None = None,
    evidence: str | None = None,
    linked_mints: list[str] | None = None,
) -> dict[str, Any]:
    if not isinstance(r, dict):
        r = dict(r)
    addr = r.get("address") or ""
    from_notes = mints_from_notes(r.get("notes"))
    from_links = [str(x).strip() for x in (linked_mints or []) if str(x).strip()]
    flagged_from: list[str] = []
    seen_m: set[str] = set()
    for m in from_links + from_notes:
        if m and m not in seen_m:
            seen_m.add(m)
            flagged_from.append(m)
    times_flagged = int(r.get("times_flagged") or r.get("times_seen") or 0)
    # Only first mint as identity source
    initial = flagged_from[0] if flagged_from else None
    return {
        "address": addr,
        "label": r.get("label"),
        "risk_score": int(r.get("risk_score") or 0),
        "times_seen": int(r.get("times_seen") or 0),
        "times_flagged": times_flagged,
        "notes": r.get("notes"),
        "source": r.get("source"),
        "last_seen_at": r.get("last_seen_at"),
        "role": role,
        "evidence": evidence,
        "flagged_from_mints": [initial] if initial else [],
        "flagged_from_mint": initial,
        "mint_flag_count": int(r.get("mint_flag_count") or 0),
        "solscan_url": f"https://solscan.io/account/{addr}" if addr else None,
    }
