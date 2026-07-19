"""SQLite market database."""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .paths import default_db_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS tracked_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id TEXT NOT NULL,
    token_address TEXT NOT NULL,
    symbol TEXT,
    name TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 100,
    notes TEXT,
    created_at REAL NOT NULL,
    UNIQUE(chain_id, token_address)
);

CREATE TABLE IF NOT EXISTS pair_latest (
    chain_id TEXT NOT NULL,
    pair_address TEXT NOT NULL,
    token_address TEXT NOT NULL,
    dex_id TEXT,
    url TEXT,
    symbol TEXT,
    name TEXT,
    price_usd REAL,
    market_cap_usd REAL,
    fdv_usd REAL,
    liquidity_usd REAL,
    volume_h24_usd REAL,
    price_change_h24 REAL,
    buys_h24 INTEGER,
    sells_h24 INTEGER,
    pair_created_at_ms INTEGER,
    socials_json TEXT,
    raw_json TEXT,
    updated_at REAL NOT NULL,
    PRIMARY KEY (chain_id, pair_address)
);

CREATE INDEX IF NOT EXISTS idx_pair_latest_token
    ON pair_latest(chain_id, token_address);

CREATE TABLE IF NOT EXISTS pair_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id TEXT NOT NULL,
    pair_address TEXT NOT NULL,
    token_address TEXT NOT NULL,
    ts REAL NOT NULL,
    price_usd REAL,
    market_cap_usd REAL,
    fdv_usd REAL,
    liquidity_usd REAL,
    volume_h24_usd REAL,
    price_change_h24 REAL,
    buys_h24 INTEGER,
    sells_h24 INTEGER
);

CREATE INDEX IF NOT EXISTS idx_snap_pair_ts
    ON pair_snapshots(chain_id, pair_address, ts DESC);

CREATE INDEX IF NOT EXISTS idx_snap_token_ts
    ON pair_snapshots(chain_id, token_address, ts DESC);

CREATE TABLE IF NOT EXISTS collector_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at REAL NOT NULL,
    finished_at REAL,
    tokens_polled INTEGER DEFAULT 0,
    pairs_saved INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    message TEXT
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Cached token intel: narrative + last enrichment
CREATE TABLE IF NOT EXISTS token_intel (
    chain_id TEXT NOT NULL,
    token_address TEXT NOT NULL,
    symbol TEXT,
    name TEXT,
    narrative_headline TEXT,
    narrative_paragraph TEXT,
    narrative_bullets_json TEXT,
    sentiment_label TEXT,
    sentiment_score REAL,
    twitter_handle TEXT,
    dexscreener_url TEXT,
    price_usd REAL,
    market_cap_usd REAL,
    volume_h24_usd REAL,
    liquidity_usd REAL,
    enriched_at REAL NOT NULL,
    PRIMARY KEY (chain_id, token_address)
);

-- Shoutouts / posts from project account or watched KOLs
CREATE TABLE IF NOT EXISTS x_shoutouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id TEXT,
    token_address TEXT,
    symbol TEXT,
    author_handle TEXT NOT NULL,
    author_tier TEXT,
    post_text TEXT NOT NULL,
    post_url TEXT,
    published TEXT,
    source TEXT,
    is_shoutout INTEGER NOT NULL DEFAULT 0,
    collected_at REAL NOT NULL,
    UNIQUE(author_handle, post_url, post_text)
);

CREATE INDEX IF NOT EXISTS idx_shoutouts_token
    ON x_shoutouts(chain_id, token_address, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_shoutouts_symbol
    ON x_shoutouts(symbol, collected_at DESC);

-- Big accounts we watch for mentions of tracked tickers
CREATE TABLE IF NOT EXISTS kol_accounts (
    handle TEXT PRIMARY KEY,
    tier TEXT NOT NULL DEFAULT 'kol',
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at REAL NOT NULL
);

-- Pump.fun (and graduated pump mints) market rows
CREATE TABLE IF NOT EXISTS pumpfun_coins (
    mint TEXT PRIMARY KEY,
    name TEXT,
    symbol TEXT,
    price_usd REAL,
    market_cap_usd REAL,
    fdv_usd REAL,
    volume_h24 REAL,
    liquidity_usd REAL,
    price_change_h24 REAL,
    pair_address TEXT,
    dex_id TEXT,
    url TEXT,
    pump_url TEXT,
    graduated INTEGER NOT NULL DEFAULT 0,
    on_bonding_curve INTEGER NOT NULL DEFAULT 1,
    twitter TEXT,
    telegram TEXT,
    website TEXT,
    image_url TEXT,
    description TEXT,
    created_at_ms INTEGER,
    updated_at REAL NOT NULL,
    last_active_volume_at REAL,
    raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_pumpfun_mcap
    ON pumpfun_coins(market_cap_usd DESC);

CREATE INDEX IF NOT EXISTS idx_pumpfun_updated
    ON pumpfun_coins(updated_at DESC);
"""


class MarketDB:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else default_db_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    @contextmanager
    def conn(self) -> Iterator[sqlite3.Connection]:
        c = self._connect()
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise
        finally:
            c.close()

    def _init(self) -> None:
        with self.conn() as c:
            c.executescript(SCHEMA)
            # Lightweight migrations for existing DBs
            cols = {
                r[1]
                for r in c.execute("PRAGMA table_info(pumpfun_coins)").fetchall()
            }
            if cols and "last_active_volume_at" not in cols:
                c.execute(
                    "ALTER TABLE pumpfun_coins ADD COLUMN last_active_volume_at REAL"
                )
            # Index after column is guaranteed to exist
            c.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_pumpfun_active
                ON pumpfun_coins(last_active_volume_at DESC)
                """
            )

    # ── tracked tokens / watchlist ─────────────────────────────────────

    def upsert_tracked(
        self,
        chain_id: str,
        token_address: str,
        *,
        symbol: str | None = None,
        name: str | None = None,
        priority: int = 100,
        enabled: bool = True,
        notes: str | None = None,
    ) -> None:
        now = time.time()
        with self.conn() as c:
            c.execute(
                """
                INSERT INTO tracked_tokens
                    (chain_id, token_address, symbol, name, enabled, priority, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chain_id, token_address) DO UPDATE SET
                    symbol=COALESCE(excluded.symbol, tracked_tokens.symbol),
                    name=COALESCE(excluded.name, tracked_tokens.name),
                    enabled=excluded.enabled,
                    priority=excluded.priority,
                    notes=COALESCE(excluded.notes, tracked_tokens.notes)
                """,
                (
                    chain_id.lower(),
                    token_address,
                    symbol,
                    name,
                    1 if enabled else 0,
                    priority,
                    notes,
                    now,
                ),
            )

    def list_tracked(self, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        with self.conn() as c:
            if enabled_only:
                rows = c.execute(
                    """
                    SELECT * FROM tracked_tokens
                    WHERE enabled=1
                    ORDER BY priority ASC, id ASC
                    """
                ).fetchall()
            else:
                rows = c.execute(
                    "SELECT * FROM tracked_tokens ORDER BY priority ASC, id ASC"
                ).fetchall()
        return [dict(r) for r in rows]

    def list_tracked_pumpfun(self, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        rows = self.list_tracked(enabled_only=enabled_only)
        return [
            r
            for r in rows
            if (r.get("notes") or "").startswith("auto:pumpfun")
            or (r.get("token_address") or "").lower().endswith("pump")
        ]

    def count_tracked(self, *, enabled_only: bool = True, pumpfun_only: bool = False) -> int:
        rows = (
            self.list_tracked_pumpfun(enabled_only=enabled_only)
            if pumpfun_only
            else self.list_tracked(enabled_only=enabled_only)
        )
        return len(rows)

    def trim_pumpfun_tracked(self, max_count: int) -> int:
        """
        Keep only the most recently created auto:pumpfun tracks up to max_count.
        Disables older ones (does not delete history).
        Returns number disabled.
        """
        if max_count <= 0:
            return 0
        pump = self.list_tracked_pumpfun(enabled_only=True)
        if len(pump) <= max_count:
            return 0
        pump_sorted = sorted(
            pump,
            key=lambda r: (int(r.get("priority") or 100), -float(r.get("created_at") or 0)),
        )
        keep = {r["id"] for r in pump_sorted[:max_count]}
        disabled = 0
        with self.conn() as c:
            for r in pump:
                if r["id"] not in keep:
                    c.execute(
                        "UPDATE tracked_tokens SET enabled=0 WHERE id=?",
                        (r["id"],),
                    )
                    disabled += 1
        return disabled

    def prune_dead_pumpfun(
        self,
        *,
        quiet_days: float = 7.0,
        volume_threshold: float = 100.0,
        delete_rows: bool = True,
    ) -> dict[str, int]:
        """
        Remove pump tokens that:
          - are no longer on the bonding curve (graduated), OR
          - have had no meaningful volume for quiet_days (default 7).

        Drops auto:pumpfun tracked entries and optionally deletes pumpfun_coins rows.
        """
        now = time.time()
        cutoff = now - quiet_days * 86400
        disabled = 0
        deleted_coins = 0
        deleted_snaps = 0

        with self.conn() as c:
            # Ensure column exists for older DBs
            cols = {r[1] for r in c.execute("PRAGMA table_info(pumpfun_coins)").fetchall()}
            if "last_active_volume_at" not in cols:
                c.execute(
                    "ALTER TABLE pumpfun_coins ADD COLUMN last_active_volume_at REAL"
                )

            # Seed last_active for rows that have volume now but never got a timestamp
            c.execute(
                """
                UPDATE pumpfun_coins
                SET last_active_volume_at = updated_at
                WHERE last_active_volume_at IS NULL
                  AND COALESCE(volume_h24, 0) >= ?
                """,
                (volume_threshold,),
            )
            # Brand-new rows with no volume yet: give a grace window from first seen
            c.execute(
                """
                UPDATE pumpfun_coins
                SET last_active_volume_at = updated_at
                WHERE last_active_volume_at IS NULL
                """
            )

            dead = c.execute(
                """
                SELECT mint, on_bonding_curve, graduated, volume_h24, last_active_volume_at
                FROM pumpfun_coins
                WHERE on_bonding_curve = 0
                   OR graduated = 1
                   OR COALESCE(last_active_volume_at, 0) < ?
                """,
                (cutoff,),
            ).fetchall()
            dead_mints = [r["mint"] for r in dead if r["mint"]]

            for mint in dead_mints:
                cur = c.execute(
                    """
                    UPDATE tracked_tokens SET enabled=0
                    WHERE chain_id='solana' AND lower(token_address)=lower(?)
                      AND (notes LIKE 'auto:pumpfun%' OR lower(token_address) LIKE '%pump')
                    """,
                    (mint,),
                )
                disabled += cur.rowcount or 0

                if delete_rows:
                    c.execute("DELETE FROM pumpfun_coins WHERE lower(mint)=lower(?)", (mint,))
                    deleted_coins += 1
                    cur2 = c.execute(
                        """
                        DELETE FROM pair_snapshots
                        WHERE chain_id='solana' AND lower(token_address)=lower(?)
                        """,
                        (mint,),
                    )
                    deleted_snaps += cur2.rowcount or 0
                    # Drop latest pairs only for pure pump auto tracks
                    c.execute(
                        """
                        DELETE FROM pair_latest
                        WHERE chain_id='solana' AND lower(token_address)=lower(?)
                          AND lower(COALESCE(dex_id,'')) IN ('pumpfun','pump')
                        """,
                        (mint,),
                    )
                    c.execute(
                        """
                        DELETE FROM token_intel
                        WHERE chain_id='solana' AND lower(token_address)=lower(?)
                        """,
                        (mint,),
                    )

            # Also untrack any enabled auto:pumpfun that graduated (not on bonding)
            still = c.execute(
                """
                SELECT t.id, t.token_address FROM tracked_tokens t
                LEFT JOIN pumpfun_coins p ON lower(p.mint)=lower(t.token_address)
                WHERE t.enabled=1
                  AND (t.notes LIKE 'auto:pumpfun%' OR lower(t.token_address) LIKE '%pump')
                  AND (
                    p.mint IS NULL
                    OR p.on_bonding_curve=0
                    OR p.graduated=1
                    OR COALESCE(p.last_active_volume_at, 0) < ?
                  )
                """,
                (cutoff,),
            ).fetchall()
            for r in still:
                c.execute("UPDATE tracked_tokens SET enabled=0 WHERE id=?", (r["id"],))
                disabled += 1
                if delete_rows and r["token_address"]:
                    c.execute(
                        "DELETE FROM pumpfun_coins WHERE lower(mint)=lower(?)",
                        (r["token_address"],),
                    )

        return {
            "disabled_tracks": disabled,
            "deleted_pumpfun_coins": deleted_coins,
            "deleted_snapshots": deleted_snaps,
            "dead_mints": len(dead_mints),
        }

    def remove_tracked(self, chain_id: str, token_address: str) -> None:
        with self.conn() as c:
            c.execute(
                "DELETE FROM tracked_tokens WHERE chain_id=? AND lower(token_address)=lower(?)",
                (chain_id.lower(), token_address),
            )

    def seed_defaults(self) -> int:
        """Seed a few popular Solana tokens if watchlist empty."""
        existing = self.list_tracked(enabled_only=False)
        if existing:
            return 0
        seeds = [
            ("solana", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "BONK", "Bonk"),
            ("solana", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "WIF", "dogwifhat"),
            ("solana", "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "POPCAT", "Popcat"),
            ("ethereum", "0x6982508145454ce325ddbe47a25d4ec3d2311933", "PEPE", "Pepe"),
            ("base", "0x532f27101965dd16442e59d40670faf5ebb142e4", "BRETT", "Brett"),
        ]
        for chain, addr, sym, name in seeds:
            self.upsert_tracked(chain, addr, symbol=sym, name=name, priority=10)
        return len(seeds)

    # ── pair market data ───────────────────────────────────────────────

    def save_pair_snapshot(self, pair: dict[str, Any], *, keep_history: bool = True) -> None:
        """Persist latest + optional history row from a DexScreener pair object."""
        chain = (pair.get("chainId") or "").lower()
        pair_addr = pair.get("pairAddress") or ""
        base = pair.get("baseToken") or {}
        token_addr = base.get("address") or ""
        if not chain or not pair_addr or not token_addr:
            return

        price = _f(pair.get("priceUsd"))
        mcap = _f(pair.get("marketCap"))
        fdv = _f(pair.get("fdv"))
        liq = _f((pair.get("liquidity") or {}).get("usd"))
        vol = _f((pair.get("volume") or {}).get("h24"))
        chg = _f((pair.get("priceChange") or {}).get("h24"))
        tx = (pair.get("txns") or {}).get("h24") or {}
        buys = tx.get("buys")
        sells = tx.get("sells")
        info = pair.get("info") or {}
        socials = {
            "imageUrl": info.get("imageUrl"),
            "websites": info.get("websites") or [],
            "socials": info.get("socials") or [],
        }
        now = time.time()

        with self.conn() as c:
            c.execute(
                """
                INSERT INTO pair_latest (
                    chain_id, pair_address, token_address, dex_id, url, symbol, name,
                    price_usd, market_cap_usd, fdv_usd, liquidity_usd, volume_h24_usd,
                    price_change_h24, buys_h24, sells_h24, pair_created_at_ms,
                    socials_json, raw_json, updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(chain_id, pair_address) DO UPDATE SET
                    token_address=excluded.token_address,
                    dex_id=excluded.dex_id,
                    url=excluded.url,
                    symbol=excluded.symbol,
                    name=excluded.name,
                    price_usd=excluded.price_usd,
                    market_cap_usd=excluded.market_cap_usd,
                    fdv_usd=excluded.fdv_usd,
                    liquidity_usd=excluded.liquidity_usd,
                    volume_h24_usd=excluded.volume_h24_usd,
                    price_change_h24=excluded.price_change_h24,
                    buys_h24=excluded.buys_h24,
                    sells_h24=excluded.sells_h24,
                    pair_created_at_ms=excluded.pair_created_at_ms,
                    socials_json=excluded.socials_json,
                    raw_json=excluded.raw_json,
                    updated_at=excluded.updated_at
                """,
                (
                    chain,
                    pair_addr,
                    token_addr,
                    pair.get("dexId"),
                    pair.get("url"),
                    base.get("symbol"),
                    base.get("name"),
                    price,
                    mcap,
                    fdv,
                    liq,
                    vol,
                    chg,
                    buys,
                    sells,
                    pair.get("pairCreatedAt"),
                    json.dumps(socials),
                    json.dumps(pair),
                    now,
                ),
            )
            if keep_history:
                c.execute(
                    """
                    INSERT INTO pair_snapshots (
                        chain_id, pair_address, token_address, ts,
                        price_usd, market_cap_usd, fdv_usd, liquidity_usd,
                        volume_h24_usd, price_change_h24, buys_h24, sells_h24
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        chain,
                        pair_addr,
                        token_addr,
                        now,
                        price,
                        mcap,
                        fdv,
                        liq,
                        vol,
                        chg,
                        buys,
                        sells,
                    ),
                )

    def get_token_latest(
        self,
        chain_id: str,
        token_address: str,
    ) -> dict[str, Any] | None:
        with self.conn() as c:
            row = c.execute(
                """
                SELECT * FROM pair_latest
                WHERE chain_id=? AND lower(token_address)=lower(?)
                ORDER BY COALESCE(volume_h24_usd,0) DESC, COALESCE(liquidity_usd,0) DESC
                LIMIT 1
                """,
                (chain_id.lower(), token_address),
            ).fetchone()
        return dict(row) if row else None

    def get_all_latest(self, *, limit: int = 200) -> list[dict[str, Any]]:
        with self.conn() as c:
            rows = c.execute(
                """
                SELECT * FROM pair_latest
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_history(
        self,
        chain_id: str,
        token_address: str,
        *,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        with self.conn() as c:
            rows = c.execute(
                """
                SELECT * FROM pair_snapshots
                WHERE chain_id=? AND lower(token_address)=lower(?)
                ORDER BY ts DESC
                LIMIT ?
                """,
                (chain_id.lower(), token_address, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def prune_snapshots(self, *, keep_days: float = 7.0) -> int:
        cutoff = time.time() - keep_days * 86400
        with self.conn() as c:
            cur = c.execute("DELETE FROM pair_snapshots WHERE ts < ?", (cutoff,))
            return cur.rowcount or 0

    def log_run(
        self,
        *,
        started_at: float,
        tokens_polled: int,
        pairs_saved: int,
        errors: int,
        message: str = "",
    ) -> None:
        with self.conn() as c:
            c.execute(
                """
                INSERT INTO collector_runs
                    (started_at, finished_at, tokens_polled, pairs_saved, errors, message)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (started_at, time.time(), tokens_polled, pairs_saved, errors, message),
            )

    # ── intel / narratives ─────────────────────────────────────────────

    def save_token_intel(self, row: dict[str, Any]) -> None:
        now = time.time()
        with self.conn() as c:
            c.execute(
                """
                INSERT INTO token_intel (
                    chain_id, token_address, symbol, name,
                    narrative_headline, narrative_paragraph, narrative_bullets_json,
                    sentiment_label, sentiment_score, twitter_handle, dexscreener_url,
                    price_usd, market_cap_usd, volume_h24_usd, liquidity_usd, enriched_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(chain_id, token_address) DO UPDATE SET
                    symbol=excluded.symbol,
                    name=excluded.name,
                    narrative_headline=excluded.narrative_headline,
                    narrative_paragraph=excluded.narrative_paragraph,
                    narrative_bullets_json=excluded.narrative_bullets_json,
                    sentiment_label=excluded.sentiment_label,
                    sentiment_score=excluded.sentiment_score,
                    twitter_handle=excluded.twitter_handle,
                    dexscreener_url=excluded.dexscreener_url,
                    price_usd=excluded.price_usd,
                    market_cap_usd=excluded.market_cap_usd,
                    volume_h24_usd=excluded.volume_h24_usd,
                    liquidity_usd=excluded.liquidity_usd,
                    enriched_at=excluded.enriched_at
                """,
                (
                    (row.get("chain_id") or "").lower(),
                    row.get("token_address"),
                    row.get("symbol"),
                    row.get("name"),
                    row.get("narrative_headline"),
                    row.get("narrative_paragraph"),
                    json.dumps(row.get("narrative_bullets") or []),
                    row.get("sentiment_label"),
                    row.get("sentiment_score"),
                    row.get("twitter_handle"),
                    row.get("dexscreener_url"),
                    row.get("price_usd"),
                    row.get("market_cap_usd"),
                    row.get("volume_h24_usd"),
                    row.get("liquidity_usd"),
                    now,
                ),
            )

    def get_token_intel(self, chain_id: str, token_address: str) -> dict[str, Any] | None:
        with self.conn() as c:
            row = c.execute(
                """
                SELECT * FROM token_intel
                WHERE chain_id=? AND lower(token_address)=lower(?)
                """,
                (chain_id.lower(), token_address),
            ).fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["narrative_bullets"] = json.loads(d.get("narrative_bullets_json") or "[]")
        except json.JSONDecodeError:
            d["narrative_bullets"] = []
        return d

    def list_token_intel(self, *, limit: int = 100) -> list[dict[str, Any]]:
        with self.conn() as c:
            rows = c.execute(
                "SELECT * FROM token_intel ORDER BY enriched_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["narrative_bullets"] = json.loads(d.get("narrative_bullets_json") or "[]")
            except json.JSONDecodeError:
                d["narrative_bullets"] = []
            out.append(d)
        return out

    # ── shoutouts ──────────────────────────────────────────────────────

    def save_shoutout(self, row: dict[str, Any]) -> bool:
        """Insert shoutout; returns True if new row inserted."""
        now = time.time()
        with self.conn() as c:
            cur = c.execute(
                """
                INSERT OR IGNORE INTO x_shoutouts (
                    chain_id, token_address, symbol, author_handle, author_tier,
                    post_text, post_url, published, source, is_shoutout, collected_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    (row.get("chain_id") or None),
                    row.get("token_address"),
                    row.get("symbol"),
                    (row.get("author_handle") or "").lstrip("@").lower(),
                    row.get("author_tier") or "unknown",
                    (row.get("post_text") or "")[:2000],
                    row.get("post_url"),
                    row.get("published"),
                    row.get("source") or "nitter",
                    1 if row.get("is_shoutout") else 0,
                    now,
                ),
            )
            return (cur.rowcount or 0) > 0

    def get_shoutouts(
        self,
        *,
        chain_id: str | None = None,
        token_address: str | None = None,
        symbol: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        q = "SELECT * FROM x_shoutouts WHERE 1=1"
        args: list[Any] = []
        if chain_id and token_address:
            q += " AND chain_id=? AND lower(token_address)=lower(?)"
            args.extend([chain_id.lower(), token_address])
        elif symbol:
            q += " AND lower(symbol)=lower(?)"
            args.append(symbol)
        q += " ORDER BY collected_at DESC LIMIT ?"
        args.append(limit)
        with self.conn() as c:
            rows = c.execute(q, args).fetchall()
        return [dict(r) for r in rows]

    def prune_shoutouts(self, *, keep_days: float = 14.0) -> int:
        cutoff = time.time() - keep_days * 86400
        with self.conn() as c:
            cur = c.execute("DELETE FROM x_shoutouts WHERE collected_at < ?", (cutoff,))
            return cur.rowcount or 0

    # ── KOL watchlist ──────────────────────────────────────────────────

    def seed_kols(self) -> int:
        """Seed a small default set of well-known crypto accounts (handles only)."""
        defaults = [
            ("elonmusk", "mega", "High reach; not always crypto"),
            ("cz_binance", "exchange", "Exchange founder"),
            ("VitalikButerin", "builder", "Ethereum"),
            ("a1lon9", "solana", "Solana ecosystem"),
            ("solana", "official", "Solana official"),
            ("warpcast", "social", "Farcaster-related reach"),
            ("cobie", "kol", "Crypto commentator"),
            ("hsaka", "kol", "Crypto trader/comment"),
            ("CryptoKaleo", "kol", "Trader KOL"),
            ("Ansem", "kol", "Solana/memecoin commentary"),
            ("blknoiz06", "kol", "Trader KOL"),
            ("0xMert_", "builder", "Helius / Solana"),
            ("rajgokal", "solana", "Solana Labs"),
            ("SBF_FTX", "historical", "historical — may be inactive"),
            ("WhaleInsider", "kol", "Crypto news-style"),
            ("lookonchain", "onchain", "On-chain alerts"),
            ("spotonchain", "onchain", "On-chain alerts"),
            ("dexscreener", "tools", "DexScreener official"),
            ("birdeye_so", "tools", "Birdeye"),
            ("JupiterExchange", "defi", "Jupiter"),
        ]
        n = 0
        now = time.time()
        with self.conn() as c:
            for handle, tier, notes in defaults:
                cur = c.execute(
                    """
                    INSERT OR IGNORE INTO kol_accounts (handle, tier, enabled, notes, created_at)
                    VALUES (?, ?, 1, ?, ?)
                    """,
                    (handle.lower(), tier, notes, now),
                )
                n += cur.rowcount or 0
        return n

    def list_kols(self, *, enabled_only: bool = True) -> list[dict[str, Any]]:
        with self.conn() as c:
            if enabled_only:
                rows = c.execute(
                    "SELECT * FROM kol_accounts WHERE enabled=1 ORDER BY tier, handle"
                ).fetchall()
            else:
                rows = c.execute("SELECT * FROM kol_accounts ORDER BY handle").fetchall()
        return [dict(r) for r in rows]

    def add_kol(self, handle: str, *, tier: str = "kol", notes: str = "") -> None:
        with self.conn() as c:
            c.execute(
                """
                INSERT INTO kol_accounts (handle, tier, enabled, notes, created_at)
                VALUES (?, ?, 1, ?, ?)
                ON CONFLICT(handle) DO UPDATE SET tier=excluded.tier, enabled=1, notes=excluded.notes
                """,
                (handle.lstrip("@").lower(), tier, notes, time.time()),
            )

    # ── Pump.fun ───────────────────────────────────────────────────────

    def save_pumpfun_coin(
        self,
        row: dict[str, Any],
        *,
        volume_active_threshold: float = 100.0,
    ) -> None:
        mint = row.get("mint") or ""
        if not mint:
            return
        now = time.time()
        vol = row.get("volume_h24")
        try:
            vol_f = float(vol) if vol is not None else 0.0
        except (TypeError, ValueError):
            vol_f = 0.0
        # Touch last_active_volume_at when volume is meaningful
        active_ts = now if vol_f >= volume_active_threshold else None

        with self.conn() as c:
            c.execute(
                """
                INSERT INTO pumpfun_coins (
                    mint, name, symbol, price_usd, market_cap_usd, fdv_usd,
                    volume_h24, liquidity_usd, price_change_h24, pair_address,
                    dex_id, url, pump_url, graduated, on_bonding_curve,
                    twitter, telegram, website, image_url, description,
                    created_at_ms, updated_at, last_active_volume_at, raw_json
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(mint) DO UPDATE SET
                    name=excluded.name,
                    symbol=excluded.symbol,
                    price_usd=excluded.price_usd,
                    market_cap_usd=excluded.market_cap_usd,
                    fdv_usd=excluded.fdv_usd,
                    volume_h24=excluded.volume_h24,
                    liquidity_usd=excluded.liquidity_usd,
                    price_change_h24=excluded.price_change_h24,
                    pair_address=excluded.pair_address,
                    dex_id=excluded.dex_id,
                    url=excluded.url,
                    pump_url=excluded.pump_url,
                    graduated=excluded.graduated,
                    on_bonding_curve=excluded.on_bonding_curve,
                    twitter=COALESCE(excluded.twitter, pumpfun_coins.twitter),
                    telegram=COALESCE(excluded.telegram, pumpfun_coins.telegram),
                    website=COALESCE(excluded.website, pumpfun_coins.website),
                    image_url=COALESCE(excluded.image_url, pumpfun_coins.image_url),
                    description=COALESCE(excluded.description, pumpfun_coins.description),
                    created_at_ms=COALESCE(excluded.created_at_ms, pumpfun_coins.created_at_ms),
                    updated_at=excluded.updated_at,
                    last_active_volume_at=COALESCE(
                        excluded.last_active_volume_at,
                        pumpfun_coins.last_active_volume_at
                    ),
                    raw_json=excluded.raw_json
                """,
                (
                    mint,
                    row.get("name"),
                    row.get("symbol"),
                    row.get("price_usd"),
                    row.get("market_cap_usd"),
                    row.get("fdv_usd"),
                    row.get("volume_h24"),
                    row.get("liquidity_usd"),
                    row.get("price_change_h24"),
                    row.get("pair_address"),
                    row.get("dex_id"),
                    row.get("url"),
                    row.get("pump_url"),
                    int(row.get("graduated") or 0),
                    int(row.get("on_bonding_curve") if row.get("on_bonding_curve") is not None else 1),
                    row.get("twitter"),
                    row.get("telegram"),
                    row.get("website"),
                    row.get("image_url"),
                    row.get("description"),
                    row.get("created_at_ms"),
                    now,
                    active_ts,
                    json.dumps(row.get("raw") or row),
                ),
            )

    def get_pumpfun_coin(self, mint: str) -> dict[str, Any] | None:
        with self.conn() as c:
            row = c.execute(
                "SELECT * FROM pumpfun_coins WHERE lower(mint)=lower(?)",
                (mint,),
            ).fetchone()
        return dict(row) if row else None

    def list_pumpfun_coins(
        self,
        *,
        limit: int = 50,
        bonding_only: bool = False,
    ) -> list[dict[str, Any]]:
        q = "SELECT * FROM pumpfun_coins"
        if bonding_only:
            q += " WHERE on_bonding_curve=1"
        q += " ORDER BY COALESCE(volume_h24,0) DESC, updated_at DESC LIMIT ?"
        with self.conn() as c:
            rows = c.execute(q, (limit,)).fetchall()
        return [dict(r) for r in rows]

    def stats(self) -> dict[str, Any]:
        base = self._stats_core()
        with self.conn() as c:
            try:
                pf = c.execute("SELECT COUNT(*) AS n FROM pumpfun_coins").fetchone()["n"]
            except sqlite3.OperationalError:
                pf = 0
        base["pumpfun_coins"] = pf
        return base

    def _stats_core(self) -> dict[str, Any]:
        with self.conn() as c:
            tracked = c.execute("SELECT COUNT(*) AS n FROM tracked_tokens WHERE enabled=1").fetchone()["n"]
            pairs = c.execute("SELECT COUNT(*) AS n FROM pair_latest").fetchone()["n"]
            snaps = c.execute("SELECT COUNT(*) AS n FROM pair_snapshots").fetchone()["n"]
            try:
                intel = c.execute("SELECT COUNT(*) AS n FROM token_intel").fetchone()["n"]
            except sqlite3.OperationalError:
                intel = 0
            try:
                shouts = c.execute("SELECT COUNT(*) AS n FROM x_shoutouts").fetchone()["n"]
            except sqlite3.OperationalError:
                shouts = 0
            last = c.execute(
                "SELECT MAX(updated_at) AS t FROM pair_latest"
            ).fetchone()["t"]
            last_run = c.execute(
                "SELECT * FROM collector_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return {
            "db_path": str(self.path),
            "tracked_tokens": tracked,
            "pairs_latest": pairs,
            "snapshots": snaps,
            "token_intel": intel,
            "x_shoutouts": shouts,
            "last_market_update": last,
            "last_run": dict(last_run) if last_run else None,
        }


def _f(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def row_to_feed(row: dict[str, Any]) -> dict[str, Any]:
    """Shape a pair_latest row into a clean API/app payload."""
    socials = {}
    try:
        socials = json.loads(row.get("socials_json") or "{}")
    except json.JSONDecodeError:
        socials = {}
    raw = None
    try:
        raw = json.loads(row.get("raw_json") or "null")
    except json.JSONDecodeError:
        raw = None
    age = None
    if row.get("updated_at"):
        age = max(0.0, time.time() - float(row["updated_at"]))
    return {
        "chain_id": row.get("chain_id"),
        "token_address": row.get("token_address"),
        "pair_address": row.get("pair_address"),
        "dex_id": row.get("dex_id"),
        "url": row.get("url"),
        "symbol": row.get("symbol"),
        "name": row.get("name"),
        "price_usd": row.get("price_usd"),
        "market_cap_usd": row.get("market_cap_usd"),
        "fdv_usd": row.get("fdv_usd"),
        "liquidity_usd": row.get("liquidity_usd"),
        "volume_h24_usd": row.get("volume_h24_usd"),
        "price_change_h24": row.get("price_change_h24"),
        "buys_h24": row.get("buys_h24"),
        "sells_h24": row.get("sells_h24"),
        "pair_created_at_ms": row.get("pair_created_at_ms"),
        "socials": socials,
        "updated_at": row.get("updated_at"),
        "age_seconds": age,
        "raw": raw,
        "source": "local_db",
    }
