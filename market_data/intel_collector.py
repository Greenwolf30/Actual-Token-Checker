"""
Lightweight intel enrichment for tracked tokens.

Stores in SQLite (same market.db):
  - name / symbol / price / mcap (from latest market row)
  - short narrative (generated locally — cheap, no LLM API)
  - project X posts + KOL shoutouts mentioning the ticker (Nitter RSS)

Designed to stay easy on a desktop:
  - market poll: every interval (default 45s)
  - intel enrich: staggered, only a few tokens per cycle
  - KOL scan: every N market cycles, small handle list
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_data.collector import import_watchlist_json, poll_once  # noqa: E402
from market_data.db import MarketDB  # noqa: E402
from token_tracker import dexscreener as dx  # noqa: E402
from token_tracker import narrative as narr  # noqa: E402
from token_tracker import sentiment as sent  # noqa: E402


def _build_narrative_from_latest(
    latest: dict[str, Any],
    socials: dict[str, Any],
    *,
    sample_posts: list[dict[str, Any]] | None = None,
    sentiment_label: str = "unknown",
    sentiment_score: float = 0.0,
) -> dict[str, Any]:
    """Theme/hype narrative from stored market + optional posts (no ATH/init MC)."""
    pair_summary = {
        "base_token": {
            "name": latest.get("name"),
            "symbol": latest.get("symbol"),
            "address": latest.get("token_address"),
        },
        "chain_id": latest.get("chain_id"),
        "dex_id": latest.get("dex_id"),
        "price_usd": latest.get("price_usd"),
        "market_cap_usd": latest.get("market_cap_usd"),
        "liquidity_usd": latest.get("liquidity_usd"),
        "volume_h24_usd": latest.get("volume_h24_usd"),
        "price_change_pct": {"h24": latest.get("price_change_h24")},
        "pair_created_at_ms": latest.get("pair_created_at_ms"),
        "labels": [],
    }
    sentiment = {
        "sentiment": {
            "label": sentiment_label,
            "score": sentiment_score,
            "summary": "Collector sample.",
        },
        "sample_posts": sample_posts or [],
    }
    pumpfun = {
        "is_pump_mint": str(latest.get("token_address") or "").lower().endswith("pump"),
        "dex_id": latest.get("dex_id"),
        "on_bonding_curve": (latest.get("dex_id") or "").lower() == "pumpfun",
    }
    return narr.build_narrative(
        pair_summary=pair_summary,
        socials=socials,
        history=None,
        sentiment=sentiment,
        pumpfun=pumpfun,
    )


def enrich_token(db: MarketDB, chain_id: str, token_address: str) -> dict[str, Any]:
    """Update token_intel + collect project X posts for one token."""
    latest = db.get_token_latest(chain_id, token_address)
    if not latest:
        return {"ok": False, "error": "no market row yet"}

    # Socials from stored pair
    socials_blob: dict[str, Any] = {}
    try:
        import json

        socials_blob = json.loads(latest.get("socials_json") or "{}")
    except Exception:  # noqa: BLE001
        socials_blob = {}

    # Build socials shape expected by narrative + extract twitter
    socials = {
        "socials": socials_blob.get("socials") or [],
        "websites": socials_blob.get("websites") or [],
        "twitter_handle": None,
        "image_url": socials_blob.get("imageUrl"),
    }
    for s in socials["socials"]:
        if not isinstance(s, dict):
            continue
        platform = (s.get("type") or s.get("platform") or "").lower()
        url = s.get("url") or ""
        if platform in {"twitter", "x"} or "twitter.com/" in url or "x.com/" in url:
            handle = url.rstrip("/").split("/")[-1].split("?")[0]
            if handle and handle.lower() not in {"i", "home", "share"}:
                socials["twitter_handle"] = handle.lstrip("@")
            break

    # Project account posts first (feed narrative)
    posts_saved = 0
    sentiment_label = "unknown"
    sentiment_score = 0.0
    sample_posts: list[dict[str, Any]] = []
    handle = socials.get("twitter_handle")
    if handle:
        try:
            xdata = sent.community_sentiment(
                symbol=latest.get("symbol"),
                name=latest.get("name"),
                twitter_handle=handle,
                token_address=token_address,
                chain_id=chain_id,
                market={
                    "price_change_pct": {"h24": latest.get("price_change_h24")},
                    "txns_h24": {
                        "buys": latest.get("buys_h24"),
                        "sells": latest.get("sells_h24"),
                    },
                    "volume_h24_usd": latest.get("volume_h24_usd"),
                },
            )
            s = xdata.get("sentiment") or {}
            sentiment_label = s.get("label") or "unknown"
            try:
                sentiment_score = float(s.get("score") or 0)
            except (TypeError, ValueError):
                sentiment_score = 0.0
            sample_posts = list(xdata.get("sample_posts") or [])
            for p in sample_posts:
                text = p.get("text") or ""
                if not text:
                    continue
                if db.save_shoutout(
                    {
                        "chain_id": chain_id,
                        "token_address": token_address,
                        "symbol": latest.get("symbol"),
                        "author_handle": handle,
                        "author_tier": "project",
                        "post_text": text,
                        "post_url": p.get("link"),
                        "published": p.get("published"),
                        "source": p.get("source") or "nitter_rss",
                        "is_shoutout": False,
                    }
                ):
                    posts_saved += 1
        except Exception:  # noqa: BLE001
            pass

    # Also fold in any already-stored KOL shoutouts for theme detection
    try:
        for r in db.get_shoutouts(
            chain_id=chain_id, token_address=token_address, limit=12
        ):
            sample_posts.append(
                {
                    "text": r.get("post_text") or "",
                    "link": r.get("post_url") or "",
                    "source": f"db:@{r.get('author_handle')}({r.get('author_tier')})",
                }
            )
    except Exception:  # noqa: BLE001
        pass

    story = _build_narrative_from_latest(
        latest,
        socials,
        sample_posts=sample_posts,
        sentiment_label=sentiment_label,
        sentiment_score=sentiment_score,
    )

    db.save_token_intel(
        {
            "chain_id": chain_id,
            "token_address": token_address,
            "symbol": latest.get("symbol"),
            "name": latest.get("name"),
            "narrative_headline": story.get("headline"),
            "narrative_paragraph": story.get("paragraph"),
            "narrative_bullets": story.get("bullets") or [],
            "sentiment_label": sentiment_label,
            "sentiment_score": sentiment_score,
            "twitter_handle": handle,
            "dexscreener_url": latest.get("url"),
            "price_usd": latest.get("price_usd"),
            "market_cap_usd": latest.get("market_cap_usd"),
            "volume_h24_usd": latest.get("volume_h24_usd"),
            "liquidity_usd": latest.get("liquidity_usd"),
        }
    )
    return {
        "ok": True,
        "symbol": latest.get("symbol"),
        "posts_saved": posts_saved,
        "sentiment": sentiment_label,
    }


def scan_kols_for_mentions(db: MarketDB) -> dict[str, Any]:
    """
    Pull recent posts from watched KOL accounts; if text mentions a tracked
    $SYMBOL or name, store as shoutout.
    """
    kols = db.list_kols(enabled_only=True)
    tracked = db.list_tracked(enabled_only=True)
    # Build match patterns from tracked symbols/names
    tickers: list[tuple[str, str, str, str]] = []  # symbol, name, chain, addr
    for t in tracked:
        latest = db.get_token_latest(t["chain_id"], t["token_address"])
        sym = (latest or {}).get("symbol") or t.get("symbol") or ""
        name = (latest or {}).get("name") or t.get("name") or ""
        if sym:
            tickers.append((sym, name, t["chain_id"], t["token_address"]))

    if not tickers or not kols:
        return {"kols_scanned": 0, "shoutouts_new": 0}

    new = 0
    scanned = 0
    for kol in kols:
        handle = kol["handle"]
        scanned += 1
        try:
            posts = sent.fetch_nitter_user_posts(handle, limit=12)
        except Exception:  # noqa: BLE001
            posts = []
        time.sleep(0.4)  # be gentle
        for p in posts:
            text = p.get("text") or ""
            if not text:
                continue
            text_l = text.lower()
            for sym, name, chain, addr in tickers:
                sym_l = sym.lower()
                hit = (
                    f"${sym_l}" in text_l
                    or re.search(rf"\b{re.escape(sym_l)}\b", text_l)
                    or (name and len(name) > 3 and name.lower() in text_l)
                )
                if not hit:
                    continue
                if db.save_shoutout(
                    {
                        "chain_id": chain,
                        "token_address": addr,
                        "symbol": sym,
                        "author_handle": handle,
                        "author_tier": kol.get("tier") or "kol",
                        "post_text": text,
                        "post_url": p.get("link"),
                        "published": p.get("published"),
                        "source": "nitter_rss_kol",
                        "is_shoutout": True,
                    }
                ):
                    new += 1
                break  # one token match per post is enough
    return {"kols_scanned": scanned, "shoutouts_new": new}


def run_loop(
    *,
    market_interval: float = 40.0,
    enrich_every_n_cycles: int = 2,
    kol_every_n_cycles: int = 10,
    enrich_batch: int = 8,
    max_tracked_per_cycle: int = 50,
    pumpfun_limit: int = 150,
    pumpfun_auto_track: int = 250,
    max_tracked_pumpfun: int = 350,
    only_bonding: bool = True,
    quiet_days: float = 7.0,
    volume_active_threshold: float = 100.0,
    once: bool = False,
    db_path: str | None = None,
) -> None:
    db = MarketDB(db_path)
    db.seed_defaults()
    db.seed_kols()
    import_watchlist_json(db)

    print(f"DB: {db.path}")
    print(f"Tracking {len(db.list_tracked())} tokens · KOLs {len(db.list_kols())}")
    print("Pump.fun background mode:")
    print(f"  TRACK: bonding-curve only = {only_bonding}")
    print(f"  DELETE: no volume >= ${volume_active_threshold:.0f} for {quiet_days:.0f} days")
    print(f"  discover up to {pumpfun_limit}/cycle · auto-track up to {pumpfun_auto_track}")
    print(f"  max enabled pump tracks {max_tracked_pumpfun}")
    print(f"  refresh {max_tracked_per_cycle} tracked tokens/cycle (rotating)")
    print(
        f"Market every {market_interval}s · "
        f"enrich every {enrich_every_n_cycles} cycles (batch {enrich_batch}) · "
        f"KOL every {kol_every_n_cycles} cycles"
    )
    print("Stores: bonding pumpfun · prices/mcap · narratives · X shoutouts\n")

    cycle = 0
    enrich_cursor = 0
    token_offset = 0
    while True:
        cycle += 1
        print(f"[{time.strftime('%H:%M:%S')}] market poll #{cycle}")
        try:
            result = poll_once(
                db,
                sleep_between=0.35,
                include_pumpfun=True,
                max_tracked_per_cycle=max_tracked_per_cycle if not once else 80,
                pumpfun_limit=pumpfun_limit,
                pumpfun_auto_track=pumpfun_auto_track,
                max_tracked_pumpfun=max_tracked_pumpfun,
                only_bonding=only_bonding,
                quiet_days=quiet_days,
                volume_active_threshold=volume_active_threshold,
                token_offset=token_offset,
            )
            token_offset = int(result.get("next_offset") or 0)
            pf = result.get("pumpfun") or {}
            print(
                f"  market: polled={result['tokens_polled']}/"
                f"{result.get('tokens_tracked_total')} "
                f"pairs={result['pairs_saved']} err={result['errors']} "
                f"in {result['duration_s']}s"
            )
            if pf:
                pr = pf.get("pruned") or {}
                print(
                    f"  pumpfun: bonding={pf.get('bonding_seen')} "
                    f"saved={pf.get('pumpfun_saved')} "
                    f"tracked={pf.get('pumpfun_tracked_enabled')} "
                    f"deleted={pr.get('deleted_pumpfun_coins', 0)} "
                    f"untracked={pr.get('disabled_tracks', 0)}"
                )
        except Exception as exc:  # noqa: BLE001
            print(f"  market error: {exc}")

        # Prefer enriching pumpfun tracks first, then others
        do_enrich = once or (cycle % enrich_every_n_cycles == 0)
        if do_enrich:
            pump = db.list_tracked_pumpfun(enabled_only=True)
            other = [
                t
                for t in db.list_tracked(enabled_only=True)
                if t not in pump and t["id"] not in {p["id"] for p in pump}
            ]
            # rebuild other without identity issues
            pump_ids = {p["id"] for p in pump}
            other = [t for t in db.list_tracked(enabled_only=True) if t["id"] not in pump_ids]
            tracked = pump + other
            if tracked:
                n_batch = min(len(tracked), len(tracked) if once else enrich_batch)
                batch = []
                for _ in range(n_batch):
                    batch.append(tracked[enrich_cursor % len(tracked)])
                    enrich_cursor += 1
                print(f"  enriching {len(batch)} token(s)…")
                for t in batch:
                    try:
                        r = enrich_token(db, t["chain_id"], t["token_address"])
                        print(
                            f"    {r.get('symbol') or t['token_address'][:8]} "
                            f"sent={r.get('sentiment')} posts+={r.get('posts_saved')}"
                        )
                    except Exception as exc:  # noqa: BLE001
                        print(f"    enrich fail: {exc}")
                    time.sleep(0.45)

        do_kol = once or (cycle % kol_every_n_cycles == 0)
        if do_kol:
            print("  scanning KOL accounts for ticker mentions…")
            try:
                kr = scan_kols_for_mentions(db)
                print(
                    f"    kols={kr['kols_scanned']} new_shoutouts={kr['shoutouts_new']}"
                )
            except Exception as exc:  # noqa: BLE001
                print(f"    kol scan fail: {exc}")
            db.prune_shoutouts(keep_days=10)
            db.prune_snapshots(keep_days=5)

        if once:
            print(db.stats())
            return

        time.sleep(max(20.0, market_interval))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Leonidas intel collector (Pump.fun discovery + market + narrative + X)"
    )
    p.add_argument("--interval", type=float, default=40.0, help="Seconds between cycles")
    p.add_argument("--once", action="store_true")
    p.add_argument("--db", default=None)
    p.add_argument("--max-pumpfun", type=int, default=350, help="Max enabled bonding pump tracks")
    p.add_argument("--pumpfun-discover", type=int, default=150, help="Discover limit per cycle")
    p.add_argument("--refresh-batch", type=int, default=50, help="Tracked tokens refreshed per cycle")
    p.add_argument("--enrich-batch", type=int, default=8, help="Narrative/X enrich per cycle")
    p.add_argument(
        "--quiet-days",
        type=float,
        default=7.0,
        help="Delete/untrack if no meaningful volume for this many days",
    )
    p.add_argument(
        "--min-volume",
        type=float,
        default=100.0,
        help="USD 24h volume that counts as 'active'",
    )
    p.add_argument(
        "--include-graduated",
        action="store_true",
        help="Also keep tracking graduated (non-bonding) pumps (default: bonding only)",
    )
    p.add_argument("--add-kol", metavar="HANDLE", help="Add a KOL handle to watch")
    p.add_argument("--list-kols", action="store_true")
    p.add_argument("--stats", action="store_true")
    args = p.parse_args(argv)

    db = MarketDB(args.db)
    if args.add_kol:
        db.add_kol(args.add_kol)
        print(f"Watching KOL @{args.add_kol.lstrip('@')}")
        return 0
    if args.list_kols:
        for k in db.list_kols(enabled_only=False):
            print(f"{'ON' if k['enabled'] else 'OFF'} @{k['handle']:20} {k['tier']}")
        return 0
    if args.stats:
        import json

        print(json.dumps(db.stats(), indent=2, default=str))
        return 0

    run_loop(
        market_interval=args.interval,
        once=args.once,
        db_path=args.db,
        max_tracked_pumpfun=args.max_pumpfun,
        pumpfun_limit=args.pumpfun_discover,
        pumpfun_auto_track=max(args.max_pumpfun, args.pumpfun_discover),
        max_tracked_per_cycle=args.refresh_batch,
        enrich_batch=args.enrich_batch,
        only_bonding=not args.include_graduated,
        quiet_days=args.quiet_days,
        volume_active_threshold=args.min_volume,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
