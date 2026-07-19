"""
Read-only bridge from Leonidas → RugWatch local SQLite.

Does NOT import RugWatch code. Opens the RugWatch DB path if present so
Holders can show flagged / serial-rugger wallets next to the top-holder list.

DB resolution order:
  1) env RUGWATCH_DB
  2) ../RugWatch/data/rugwatch.db (sibling of Leonidas project)
  3) ~/RugWatch/data/rugwatch.db
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

from .env_config import load_dotenv, project_root


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


def fetch_rugwatch_flagged(
    mint: str | None = None,
    *,
    holder_wallets: list[str] | None = None,
    min_score: int = 0,
    limit: int = 40,
) -> dict[str, Any]:
    """
    Load flagged wallets from RugWatch relevant to this mint / holder set.

    Returns:
      - linked_to_mint: wallets RugWatch already linked to this mint
      - in_top_holders: flagged wallets that also appear in current top holders
      - high_risk_db: other high-score wallets from RugWatch (context)
      - stats (no local filesystem paths — privacy)
    """
    path = rugwatch_db_path()
    out: dict[str, Any] = {
        "ok": False,
        "db_found": bool(path),
        # Never expose absolute local paths in UI / exports
        "db_path": None,
        "linked_to_mint": [],
        "in_top_holders": [],
        "high_risk_db": [],
        "all_flagged": [],
        "db_wallet_count": 0,
        "match_count": 0,
        "error": None,
    }
    if path is None:
        out["error"] = (
            "RugWatch DB not found. Install/run RugWatch or set RUGWATCH_DB "
            "to your rugwatch.db location in .env"
        )
        return out

    mint = (mint or "").strip()
    holder_set = {
        (w or "").strip()
        for w in (holder_wallets or [])
        if (w or "").strip()
    }

    try:
        conn = sqlite3.connect(str(path), timeout=5.0)
        conn.row_factory = sqlite3.Row
        try:
            # Total flagged in DB
            try:
                out["db_wallet_count"] = int(
                    conn.execute("SELECT COUNT(*) FROM wallets").fetchone()[0]
                )
            except sqlite3.Error:
                out["db_wallet_count"] = 0

            # Wallets linked to this mint
            linked: list[dict[str, Any]] = []
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
                        linked.append(_wallet_row(r, role=r["role"], evidence=r["evidence"]))
                except sqlite3.Error as exc:
                    out["error"] = f"links query: {exc}"

            out["linked_to_mint"] = linked

            # Flagged wallets that appear among current top holders
            in_top: list[dict[str, Any]] = []
            if holder_set:
                # Chunk IN clause for SQLite
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
            # de-dupe by address
            seen: set[str] = set()
            deduped: list[dict[str, Any]] = []
            for w in in_top:
                a = w.get("address") or ""
                if a and a not in seen:
                    seen.add(a)
                    deduped.append(w)
            out["in_top_holders"] = deduped

            # Full flagged list from RugWatch (what the app flags / stores)
            all_flagged: list[dict[str, Any]] = []
            try:
                rows = conn.execute(
                    """
                    SELECT address, label, risk_score, times_seen,
                           notes, source, last_seen_at
                    FROM wallets
                    WHERE risk_score >= ?
                    ORDER BY risk_score DESC, times_seen DESC, last_seen_at DESC
                    LIMIT ?
                    """,
                    (min_score, max(limit, 200)),
                ).fetchall()
                all_flagged = [_wallet_row(r) for r in rows]
            except sqlite3.Error as exc:
                out["error"] = (out.get("error") or "") + f" all_flagged: {exc}"
            out["all_flagged"] = all_flagged

            # High-risk sample (score >= 40) for context
            out["high_risk_db"] = [
                w for w in all_flagged if int(w.get("risk_score") or 0) >= 40
            ][:30]

            # Tag which flagged wallets are on this mint / in top holders
            linked_set = {w.get("address") for w in linked if w.get("address")}
            for w in all_flagged:
                a = w.get("address") or ""
                w["on_this_mint"] = a in linked_set
                w["in_top_holders"] = a in holder_set

            # Combined match count (linked + in top, unique)
            match_addrs = {w.get("address") for w in linked if w.get("address")}
            match_addrs |= {w.get("address") for w in deduped if w.get("address")}
            # also count any all_flagged that is in holders
            match_addrs |= {
                w.get("address")
                for w in all_flagged
                if w.get("address") in holder_set
            }
            out["match_count"] = len(match_addrs)
            out["ok"] = True
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
        out["ok"] = False

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
