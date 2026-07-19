"""
DexScreener market collector.

Uses the official public DexScreener HTTP API (not HTML scraping),
respects rate limits, and writes into SQLite.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

# Allow running as script
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_data.db import MarketDB  # noqa: E402
from market_data.paths import watchlist_path  # noqa: E402
from token_tracker import dexscreener as dx  # noqa: E402
from token_tracker import pumpfun as pf  # noqa: E402


def import_watchlist_json(db: MarketDB, path: Path | None = None) -> int:
    """Pull tokens from Leonidas watchlist.json into tracked_tokens."""
    path = path or watchlist_path()
    if not path.exists():
        return 0
    try:
        items = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0
    if not isinstance(items, list):
        return 0
    n = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        chain = (item.get("chain") or "solana").lower()
        addr = item.get("address") or item.get("query")
        if not addr or len(str(addr)) < 20:
            # skip pure symbols without address
            continue
        db.upsert_tracked(
            chain,
            str(addr),
            symbol=item.get("symbol"),
            name=item.get("name"),
            priority=50,
        )
        n += 1
    return n


def poll_token(db: MarketDB, chain_id: str, token_address: str) -> int:
    """Fetch pairs for one token and store them. Returns pairs saved."""
    pairs = dx.pairs_for_token(chain_id, token_address)
    if not pairs:
        # fallback search by address
        pairs = dx.search_pairs(token_address)
        pairs = [
            p
            for p in pairs
            if (p.get("chainId") or "").lower() == chain_id.lower()
            and ((p.get("baseToken") or {}).get("address") or "").lower()
            == token_address.lower()
        ]
    saved = 0
    # keep top pairs by volume to avoid junk flood
    pairs = sorted(
        pairs,
        key=lambda p: float(((p.get("volume") or {}).get("h24") or 0)),
        reverse=True,
    )[:8]
    for p in pairs:
        db.save_pair_snapshot(p, keep_history=True)
        saved += 1
        # update symbol/name on tracked row
        base = p.get("baseToken") or {}
        if base.get("symbol") or base.get("name"):
            db.upsert_tracked(
                chain_id,
                token_address,
                symbol=base.get("symbol"),
                name=base.get("name"),
            )
    return saved


def poll_pumpfun_feed(
    db: MarketDB,
    *,
    limit: int = 150,
    auto_track: int = 200,
    max_tracked_pumpfun: int = 300,
    only_bonding: bool = True,
    volume_active_threshold: float = 100.0,
    quiet_days: float = 7.0,
) -> dict[str, Any]:
    """
    Discover Pump.fun pairs, store them, auto-track bonding-curve tokens only,
    and delete/disable tokens with no meaningful volume for quiet_days (default 7).

    Note: DexScreener only surfaces *active* pairs each query — not every
    historical Pump.fun mint ever created.
    """
    # Still fetch graduated for status updates, but only TRACK bonding
    pairs = pf.fetch_pumpfun_pairs(limit=limit, include_graduated=True)
    saved = 0
    tracked = 0
    bonding_seen = 0
    for p in pairs:
        rec = pf.pair_to_pump_record(p)
        db.save_pumpfun_coin(rec, volume_active_threshold=volume_active_threshold)
        db.save_pair_snapshot(p, keep_history=True)
        saved += 1

        on_curve = bool(rec.get("on_bonding_curve")) and not bool(rec.get("graduated"))
        if on_curve:
            bonding_seen += 1
        mint = rec.get("mint")
        if not mint:
            continue

        # Only auto-track tokens still on the bonding curve
        if only_bonding and not on_curve:
            # Ensure graduated ones are not left enabled
            db.upsert_tracked(
                "solana",
                mint,
                symbol=rec.get("symbol"),
                name=rec.get("name"),
                priority=90,
                enabled=False,
                notes="auto:pumpfun:graduated",
            )
            continue

        if tracked < auto_track and on_curve:
            db.upsert_tracked(
                "solana",
                mint,
                symbol=rec.get("symbol"),
                name=rec.get("name"),
                priority=70,
                enabled=True,
                notes="auto:pumpfun:bonding",
            )
            tracked += 1

    pruned = db.prune_dead_pumpfun(
        quiet_days=quiet_days,
        volume_threshold=volume_active_threshold,
        delete_rows=True,
    )
    trimmed = db.trim_pumpfun_tracked(max_tracked_pumpfun)
    return {
        "pumpfun_pairs": len(pairs),
        "pumpfun_saved": saved,
        "bonding_seen": bonding_seen,
        "auto_tracked": tracked,
        "pumpfun_tracked_enabled": db.count_tracked(pumpfun_only=True),
        "trimmed": trimmed,
        "pruned": pruned,
    }


def poll_once(
    db: MarketDB,
    *,
    sleep_between: float = 0.35,
    include_pumpfun: bool = True,
    max_tracked_per_cycle: int = 60,
    pumpfun_limit: int = 150,
    pumpfun_auto_track: int = 200,
    max_tracked_pumpfun: int = 300,
    only_bonding: bool = True,
    quiet_days: float = 7.0,
    volume_active_threshold: float = 100.0,
    token_offset: int = 0,
) -> dict[str, Any]:
    """
    One background cycle:
      1) Discover/store active Pump.fun set
      2) Refresh a rotating batch of tracked tokens (so large lists don't block forever)
    """
    started = time.time()
    tokens = db.list_tracked(enabled_only=True)
    pairs_saved = 0
    errors = 0
    messages: list[str] = []
    pumpfun_info: dict[str, Any] = {}

    if include_pumpfun:
        try:
            pumpfun_info = poll_pumpfun_feed(
                db,
                limit=pumpfun_limit,
                auto_track=pumpfun_auto_track,
                max_tracked_pumpfun=max_tracked_pumpfun,
                only_bonding=only_bonding,
                quiet_days=quiet_days,
                volume_active_threshold=volume_active_threshold,
            )
            pruned = (pumpfun_info.get("pruned") or {}).get("deleted_pumpfun_coins", 0)
            messages.append(
                f"pumpfun saved={pumpfun_info.get('pumpfun_saved')} "
                f"bonding={pumpfun_info.get('bonding_seen')} "
                f"tracked={pumpfun_info.get('pumpfun_tracked_enabled')} "
                f"pruned={pruned}"
            )
        except Exception as exc:  # noqa: BLE001
            errors += 1
            messages.append(f"pumpfun err: {exc}")
        time.sleep(sleep_between)

    # Refresh tracked list after pumpfun auto-track
    tokens = db.list_tracked(enabled_only=True)
    if not tokens:
        batch: list[dict[str, Any]] = []
    else:
        # rotating window
        n = len(tokens)
        start = token_offset % n
        batch = []
        for i in range(min(max_tracked_per_cycle, n)):
            batch.append(tokens[(start + i) % n])

    for t in batch:
        chain = t["chain_id"]
        addr = t["token_address"]
        try:
            n = poll_token(db, chain, addr)
            pairs_saved += n
            if n == 0:
                messages.append(f"no pairs: {chain}:{addr[:8]}…")
            if pf.is_pump_mint(addr) or (t.get("notes") or "").startswith("auto:pumpfun"):
                try:
                    ppairs = pf.fetch_pumpfun_token(addr)
                    if ppairs:
                        rec = pf.pair_to_pump_record(ppairs[0])
                        db.save_pumpfun_coin(rec)
                except Exception:  # noqa: BLE001
                    pass
        except Exception as exc:  # noqa: BLE001
            errors += 1
            messages.append(f"err {chain}:{addr[:8]}… {exc}")
        time.sleep(sleep_between)

    if int(time.time()) % 10 == 0:
        db.prune_snapshots(keep_days=5)

    db.log_run(
        started_at=started,
        tokens_polled=len(batch),
        pairs_saved=pairs_saved,
        errors=errors,
        message="; ".join(messages[:8]),
    )
    return {
        "tokens_polled": len(batch),
        "tokens_tracked_total": len(tokens),
        "pairs_saved": pairs_saved,
        "errors": errors,
        "duration_s": round(time.time() - started, 2),
        "messages": messages[:12],
        "pumpfun": pumpfun_info,
        "next_offset": (token_offset + len(batch)) if tokens else 0,
    }


def run_loop(
    *,
    interval_s: float = 30.0,
    once: bool = False,
    db_path: str | None = None,
) -> None:
    db = MarketDB(db_path)
    seeded = db.seed_defaults()
    imported = import_watchlist_json(db)
    print(f"DB: {db.path}")
    print(f"Seeded defaults: {seeded} · imported watchlist: {imported}")
    print(f"Tracking {len(db.list_tracked())} tokens")
    print(
        "Using DexScreener public API (rate-limited). "
        "This is API polling, not HTML scraping."
    )

    while True:
        print(f"\n[{time.strftime('%H:%M:%S')}] polling…")
        try:
            result = poll_once(db)
            print(
                f"  tokens={result['tokens_polled']} "
                f"pairs={result['pairs_saved']} "
                f"errors={result['errors']} "
                f"in {result['duration_s']}s"
            )
            for m in result.get("messages") or []:
                print(f"  · {m}")
        except KeyboardInterrupt:
            print("\nStopped.")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"  cycle failed: {exc}")

        if once:
            return
        # interval measured from end of poll
        time.sleep(max(5.0, interval_s))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Leonidas DexScreener market collector")
    p.add_argument("--interval", type=float, default=30.0, help="Seconds between poll cycles (default 30)")
    p.add_argument("--once", action="store_true", help="Run a single poll cycle and exit")
    p.add_argument("--db", default=None, help="SQLite path (default data/market.db)")
    p.add_argument(
        "--add",
        nargs=2,
        metavar=("CHAIN", "ADDRESS"),
        help="Add a token to the track list and exit",
    )
    p.add_argument("--list", action="store_true", help="List tracked tokens and exit")
    p.add_argument("--stats", action="store_true", help="Show DB stats and exit")
    args = p.parse_args(argv)

    db = MarketDB(args.db)

    if args.add:
        chain, addr = args.add
        db.upsert_tracked(chain, addr, priority=20)
        print(f"Tracking {chain}:{addr}")
        return 0
    if args.list:
        for t in db.list_tracked(enabled_only=False):
            print(
                f"{'ON ' if t['enabled'] else 'OFF'} {t['chain_id']:10} "
                f"{t.get('symbol') or '?':8} {t['token_address']}"
            )
        return 0
    if args.stats:
        print(json.dumps(db.stats(), indent=2, default=str))
        return 0

    run_loop(interval_s=args.interval, once=args.once, db_path=args.db)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
