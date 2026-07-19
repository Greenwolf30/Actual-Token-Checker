"""Orchestrate DexScreener + GeckoTerminal + X sentiment into one report."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from . import alerts as alrt
from . import bubblemaps as bmaps
from . import bundles as bun
from . import coin_facts as cfacts
from . import dexscreener as dx
from . import geckoterminal as gt
from . import holders as hold
from . import narrative as narr
from . import pumpfun as pf
from . import sentiment as sent
from . import social_sources as socials_src


ADDRESS_RE = re.compile(r"^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$")

# Normalize UI / user chain aliases → DexScreener chainId
_CHAIN_ALIASES: dict[str, str] = {
    "rh": "robinhood",
    "robinhood-chain": "robinhood",
    "robinhoodchain": "robinhood",
    "4663": "robinhood",  # Robinhood Chain mainnet id
    "eth": "ethereum",
    "sol": "solana",
    "bnb": "bsc",
    "arb": "arbitrum",
    "matic": "polygon",
    "poly": "polygon",
    "avax": "avalanche",
    "op": "optimism",
}

# EVM chains to probe when user pastes 0x… without selecting a chain
_EVM_PROBE_CHAINS = (
    "ethereum",
    "base",
    "bsc",
    "arbitrum",
    "robinhood",
    "polygon",
    "optimism",
    "avalanche",
)


def _normalize_chain(chain: str | None) -> str | None:
    if not chain:
        return None
    c = chain.strip().lower()
    if c in {"", "any", "auto", "all"}:
        return None
    return _CHAIN_ALIASES.get(c, c)


def resolve_pairs(query: str, chain: str | None = None) -> list[dict[str, Any]]:
    """
    Resolve market pairs. Uses DexScreener (cached) first; on 429 / empty for
    pump-style mints, falls back to Pump.fun native coin API.
    Supports Solana, EVM, and Robinhood Chain (DexScreener chainId=robinhood).
    """
    q = query.strip()
    if not q:
        return []
    chain = _normalize_chain(chain)

    last_err: Exception | None = None

    def _pump_fallback(mint_q: str) -> list[dict[str, Any]]:
        try:
            return pf.pairs_from_pump_fallback(mint_q)
        except Exception:  # noqa: BLE001
            return []

    def _direct_token_pairs(addr: str, preferred: str | None) -> list[dict[str, Any]]:
        """Hit DexScreener token-pairs for one or several chains."""
        chains: list[str] = []
        if preferred:
            chains.append(preferred)
        is_evm = addr.lower().startswith("0x") and len(addr) == 42
        if is_evm:
            for c in _EVM_PROBE_CHAINS:
                if c not in chains:
                    chains.append(c)
        else:
            if "solana" not in chains:
                chains.append("solana")
        out: list[dict[str, Any]] = []
        for c in chains:
            try:
                got = dx.pairs_for_token(c, addr)
            except Exception as exc:  # noqa: BLE001
                nonlocal last_err
                last_err = exc
                continue
            if got:
                # Prefer exact chain hits; return first successful probe list
                return got
        return out

    # Direct chain:address form (e.g. robinhood:0xabc… or solana:Mint…)
    if ":" in q and not q.startswith("http"):
        maybe_chain, maybe_addr = q.split(":", 1)
        maybe_chain = _normalize_chain(maybe_chain) or maybe_chain.lower()
        if maybe_chain and maybe_addr:
            try:
                pairs = dx.pairs_for_token(maybe_chain, maybe_addr)
                if pairs:
                    return pairs
            except Exception as exc:  # noqa: BLE001
                last_err = exc
            fb = _pump_fallback(maybe_addr)
            if fb:
                return fb

    # Looks like an address — search, optionally filter chain
    pairs: list[dict[str, Any]] = []
    try:
        pairs = dx.search_pairs(q)
    except Exception as exc:  # noqa: BLE001
        last_err = exc
        pairs = []
        # Immediate pump fallback on DexScreener failure (esp. 429)
        fb = _pump_fallback(q)
        if fb:
            return fb

    if chain:
        pairs = [p for p in pairs if (p.get("chainId") or "").lower() == chain.lower()]

    # If query is a pure address, prefer pairs where baseToken matches
    if ADDRESS_RE.match(q) or (len(q) >= 32 and " " not in q):
        exact = [
            p
            for p in pairs
            if ((p.get("baseToken") or {}).get("address") or "").lower() == q.lower()
        ]
        if exact:
            return exact
        direct = _direct_token_pairs(q, chain)
        if direct:
            return direct
        fb = _pump_fallback(q)
        if fb:
            return fb
        if last_err and not pairs:
            raise last_err
        return pairs

    # Symbol / name: DexScreener search is noisy (copycats). GeckoTerminal pool
    # search ranks by real reserves/volume and usually hits the canonical mint.
    looks_short_ticker = len(q) <= 12 and " " not in q
    if looks_short_ticker or not pairs:
        try:
            hit = gt.search_top_token(q, chain=chain)
        except Exception:  # noqa: BLE001
            hit = None
        if hit:
            try:
                resolved = dx.pairs_for_token(hit["chain_id"], hit["token_address"])
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                resolved = []
            if not resolved:
                try:
                    resolved = dx.search_pairs(hit["token_address"])
                    if chain:
                        resolved = [
                            p
                            for p in resolved
                            if (p.get("chainId") or "").lower() == chain.lower()
                        ]
                except Exception as exc:  # noqa: BLE001
                    last_err = exc
                    resolved = []
            if not resolved:
                fb = _pump_fallback(hit["token_address"])
                if fb:
                    return fb
            # Trust GeckoTerminal ticker resolution — DexScreener search is full of
            # same-symbol clones, and per-pair volume there can under-report majors.
            if resolved:
                return resolved

    if not pairs:
        fb = _pump_fallback(q)
        if fb:
            return fb
        if last_err:
            raise last_err

    return pairs


def analyze_token(
    query: str,
    *,
    chain: str | None = None,
    pair_address: str | None = None,
    include_holders: bool = True,
    quick: bool = False,
) -> dict[str, Any]:
    """
    Build a full token report.

    quick=True: market + basic fields only (fast first paint for the GUI).
    Skips slow OHLCV history, social scrape, holders, and bundles.
    """
    try:
        pairs = resolve_pairs(query, chain=chain)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": (
                f"Market lookup failed: {exc}. "
                "If this is DexScreener 429, wait a minute or use a full pump mint "
                "(Pump.fun fallback applies when possible)."
            ),
            "query": query,
        }
    if not pairs:
        return {
            "ok": False,
            "error": (
                f"No pairs found for query: {query!r} "
                "(DexScreener empty; Pump.fun fallback also missed)."
            ),
            "query": query,
        }

    if pair_address:
        filtered = [
            p
            for p in pairs
            if (p.get("pairAddress") or "").lower() == pair_address.lower()
        ]
        if filtered:
            pairs = filtered

    # For symbol/name searches, first pick the strongest *token*, then its main pair.
    q = query.strip()
    looks_like_address = bool(ADDRESS_RE.match(q)) or (":" in q and len(q.split(":", 1)[-1]) >= 32)

    # Prefer Pump.fun pairs when mint ends with "pump" or query is pump-focused
    pump_pairs = [
        p
        for p in pairs
        if (p.get("dexId") or "").lower() in {"pumpfun", "pumpswap", "pump"}
        or pf.is_pump_mint(((p.get("baseToken") or {}).get("address") or ""))
    ]

    if looks_like_address or pair_address:
        if pump_pairs and pf.is_pump_mint(q.split(":")[-1] if ":" in q else q):
            primary = dx.pick_primary_pair(pump_pairs, query=query)
        else:
            primary = dx.pick_primary_pair(pairs, query=query)
    else:
        ranked_tokens = dx.group_best_token_pairs(pairs, query=query)
        primary = ranked_tokens[0] if ranked_tokens else dx.pick_primary_pair(pairs, query=query)
        # Once we know the winning token, keep only its pairs for alternates/history
        if primary:
            win = ((primary.get("baseToken") or {}).get("address") or "").lower()
            pairs = [
                p
                for p in pairs
                if ((p.get("baseToken") or {}).get("address") or "").lower() == win
            ] or pairs
            # Prefer bonding-curve pumpfun pair when present for that mint
            mint_pump = [
                p
                for p in pairs
                if (p.get("dexId") or "").lower() == "pumpfun"
            ]
            primary = (
                dx.pick_primary_pair(mint_pump, query=query)
                if mint_pump
                else dx.pick_primary_pair(pairs, query=query)
            ) or primary

    if not primary:
        return {"ok": False, "error": "Could not select a primary pair.", "query": query}

    pair_summary = dx.summarize_pair(primary)
    socials = dx.extract_socials(primary)

    network = gt.network_id(pair_summary.get("chain_id"))
    token_addr = (pair_summary.get("base_token") or {}).get("address")
    base = pair_summary.get("base_token") or {}

    # Pump.fun bonding vs graduated is local (no network) — cheap
    pump_meta = pf.classify_graduation(
        token_addr,
        pairs=pairs,
        primary_dex_id=pair_summary.get("dex_id"),
    )
    social_url_list: list[str] = []
    for s in socials.get("socials") or []:
        if isinstance(s, dict) and s.get("url"):
            social_url_list.append(str(s["url"]))
    for w in socials.get("websites") or []:
        if isinstance(w, dict) and w.get("url"):
            social_url_list.append(str(w["url"]))

    if quick:
        include_holders = False

    history: dict[str, Any] = {
        "candles_used": 0,
        "ath_price_usd": None,
        "ath_market_cap_usd": None,
        "initial_price_usd": None,
        "initial_market_cap_usd": None,
        "history_note": "Skipped (unknown network mapping).",
    }
    gecko_token = None
    x_data: dict[str, Any]
    coin_pack: dict[str, Any]
    social_pack: dict[str, Any]
    holders_data: dict[str, Any] = {
        "ok": False,
        "skipped": True,
        "notes": "Holder scan disabled for this run.",
    }
    bundles_data: dict[str, Any] = {
        "ok": False,
        "summary": {},
        "signals": [],
        "error": "Bundles skipped (quick mode or non-Solana).",
    }
    helius_holders: dict[str, Any] = {"ok": False, "holders": [], "summary": {}}
    maps_data: dict[str, Any]

    def _fetch_history() -> tuple[dict[str, Any], Any]:
        """
        ATH / initial MC estimate — optimized for speed (no ATH price UI).
        Prefer Pump.fun API; else Gecko OHLCV on known pair only (skip extra
        Gecko token lookup when Dex pair works). Wallet scans unchanged.
        """
        hist: dict[str, Any] = {
            "candles_used": 0,
            "ath_price_usd": None,
            "ath_market_cap_usd": None,
            "initial_price_usd": None,
            "initial_market_cap_usd": None,
            "history_note": "Skipped (unknown network mapping).",
        }
        gtok = None
        if token_addr and pf.is_pump_mint(token_addr):
            try:
                pump_mcap = pf.fetch_pumpfun_mcap_metrics(token_addr)
            except Exception:  # noqa: BLE001
                pump_mcap = None
            if pump_mcap and pump_mcap.get("ok"):
                return (
                    {
                        "candles_used": 0,
                        "ath_price_usd": None,
                        "ath_market_cap_usd": pump_mcap.get("ath_market_cap_usd"),
                        "ath_timestamp": _ms_to_unix(pump_mcap.get("ath_timestamp_ms")),
                        "initial_price_usd": None,
                        "initial_market_cap_usd": pump_mcap.get("initial_market_cap_usd"),
                        "initial_timestamp": _ms_to_unix(
                            pump_mcap.get("created_timestamp_ms")
                        ),
                        "history_note": pump_mcap.get("history_note"),
                        "source": "pumpfun_api",
                        "network": network,
                        "pool_address": pair_summary.get("pair_address"),
                    },
                    None,
                )
        if network and token_addr:
            # Fast path: use DexScreener pair address first (no Gecko token hop)
            pools = _candidate_pools(
                None, pair_summary.get("pair_address"), pairs
            )
            pool = pools[0] if pools else None
            candles: list = []
            if pool:
                # Fewer day candles; hour fallback only if day is empty
                candles = gt.fetch_ohlcv(
                    network, pool, timeframe="day", limit=90
                )
                if len(candles) < 3:
                    candles = (
                        gt.fetch_ohlcv(
                            network, pool, timeframe="hour", limit=72
                        )
                        or candles
                    )
            # One fallback: Gecko top pool if pair OHLCV empty
            if len(candles) < 3:
                try:
                    gtok = gt.fetch_token(network, token_addr)
                except Exception:  # noqa: BLE001
                    gtok = None
                pools2 = _candidate_pools(
                    gtok, pair_summary.get("pair_address"), pairs
                )
                for p2 in pools2[:2]:
                    if pool and p2 == pool:
                        continue
                    candles = gt.fetch_ohlcv(
                        network, p2, timeframe="day", limit=90
                    )
                    if len(candles) >= 3:
                        pool = p2
                        break
            if pool and candles:
                cand = gt.analyze_price_history(
                    candles,
                    current_price=pair_summary.get("price_usd"),
                    current_mcap=pair_summary.get("market_cap_usd"),
                    current_fdv=pair_summary.get("fdv_usd"),
                )
                hist = cand or hist
                # ATH price kept for internal analytics; Overview UI shows MC only
                hist["network"] = network
                hist["pool_address"] = pool
                hist.setdefault("source", "geckoterminal_ohlcv")
                if pair_summary.get("pair_created_at_ms"):
                    hist["pair_created_at"] = _iso(
                        pair_summary["pair_created_at_ms"]
                    )
        return hist, gtok

    def _fetch_sentiment() -> dict[str, Any]:
        return sent.community_sentiment(
            symbol=base.get("symbol"),
            name=base.get("name"),
            twitter_handle=socials.get("twitter_handle"),
            token_address=token_addr,
            chain_id=pair_summary.get("chain_id"),
            extra_handles=socials.get("extra_twitter_handles") or [],
            market={
                "price_change_pct": pair_summary.get("price_change_pct"),
                "txns_h24": pair_summary.get("txns_h24"),
                "volume_h24_usd": pair_summary.get("volume_h24_usd"),
                "buys_h24": (pair_summary.get("txns_h24") or {}).get("buys"),
                "sells_h24": (pair_summary.get("txns_h24") or {}).get("sells"),
            },
        )

    def _fetch_coin_facts() -> dict[str, Any]:
        try:
            return cfacts.fetch_coin_facts(
                chain_id=pair_summary.get("chain_id"),
                token_address=token_addr,
                symbol=base.get("symbol"),
                name=base.get("name"),
                dexscreener_pair=primary,
                gecko_token=None,
            )
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "sources_used": [],
                "official_description": "",
                "categories": [],
                "links": {},
                "facts_lines": [],
                "confidence": "none",
                "notes": f"Coin facts fetch failed: {exc}",
            }

    def _fetch_social_pack() -> dict[str, Any]:
        try:
            return socials_src.gather_narrative_sources(
                symbol=base.get("symbol"),
                name=base.get("name"),
                token_address=token_addr,
                chain_id=pair_summary.get("chain_id"),
                twitter_handle=socials.get("twitter_handle"),
                social_urls=social_url_list,
                pump_url=pump_meta.get("pump_url"),
                dexscreener_pair=primary,
            )
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "sources_used": [],
                "snippets": [],
                "platforms_seen": [],
                "description_blocks": [],
                "notes": f"Social narrative fetch failed: {exc}",
            }

    def _fetch_holders() -> dict[str, Any]:
        try:
            return hold.analyze_holders(
                pair_summary.get("chain_id"),
                token_addr,
                pair_address=pair_summary.get("pair_address"),
            )
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "error": str(exc),
                "holders": [],
                "summary": {},
                "flags": [],
                "notes": f"Holder scan failed: {exc}",
            }

    def _fetch_bundles() -> dict[str, Any]:
        if not token_addr or (pair_summary.get("chain_id") or "").lower() not in {
            "solana",
            "sol",
            "",
        }:
            return {
                "ok": False,
                "error": "Comprehensive bundles require Solana mint + APIs (Helius recommended).",
                "summary": {},
                "signals": [],
            }
        try:
            from . import bundle_fusion as bfusion

            return bfusion.comprehensive_bundle_check(
                token_addr,
                pair_address=pair_summary.get("pair_address"),
                chain_id=pair_summary.get("chain_id") or "solana",
            )
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "error": str(exc),
                "summary": {},
                "signals": [],
                "notes": f"Comprehensive bundle analysis failed: {exc}",
            }

    def _fetch_maps() -> dict[str, Any]:
        try:
            return bmaps.build_maps_payload(
                chain_id=pair_summary.get("chain_id"),
                token_address=token_addr,
                symbol=base.get("symbol"),
                name=base.get("name"),
                fetch_api=False,  # URL payload only — API was slow and optional
            )
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "error": f"Bubblemaps payload failed: {exc}",
                "iframe_url": None,
                "app_url": None,
            }

    if quick:
        # Fast path: market + pump meta only (no parallel network storm)
        if token_addr and pf.is_pump_mint(token_addr):
            try:
                pump_mcap = pf.fetch_pumpfun_mcap_metrics(token_addr)
            except Exception:  # noqa: BLE001
                pump_mcap = None
            if pump_mcap and pump_mcap.get("ok"):
                history = {
                    "candles_used": 0,
                    "ath_price_usd": None,
                    "ath_market_cap_usd": pump_mcap.get("ath_market_cap_usd"),
                    "ath_timestamp": _ms_to_unix(pump_mcap.get("ath_timestamp_ms")),
                    "initial_price_usd": None,
                    "initial_market_cap_usd": pump_mcap.get("initial_market_cap_usd"),
                    "initial_timestamp": _ms_to_unix(
                        pump_mcap.get("created_timestamp_ms")
                    ),
                    "history_note": pump_mcap.get("history_note"),
                    "source": "pumpfun_api",
                    "network": network,
                    "pool_address": pair_summary.get("pair_address"),
                }
        x_data = {
            "sentiment": {
                "label": "pending",
                "score": None,
                "summary": "Full sentiment loads after market snapshot…",
                "kind": "quick",
            },
            "posts_analyzed": 0,
            "sources_used": [],
            "sample_posts": [],
            "twitter_handle": socials.get("twitter_handle"),
        }
        coin_pack = {
            "ok": False,
            "sources_used": ["dexscreener"],
            "official_description": "",
            "categories": [],
            "links": {},
            "facts_lines": [],
            "confidence": "low",
            "notes": "Quick mode — full coin facts load next.",
        }
        social_pack = {
            "ok": False,
            "sources_used": [],
            "snippets": [],
            "platforms_seen": [],
            "description_blocks": [],
            "notes": "Quick mode — social/news loads after market snapshot.",
        }
        maps_data = _fetch_maps()
    else:
        # Full mode: run independent network work in parallel
        with ThreadPoolExecutor(max_workers=6) as pool:
            f_hist = pool.submit(_fetch_history)
            f_sent = pool.submit(_fetch_sentiment)
            f_coin = pool.submit(_fetch_coin_facts)
            f_soc = pool.submit(_fetch_social_pack)
            f_maps = pool.submit(_fetch_maps)
            f_hold = (
                pool.submit(_fetch_holders)
                if include_holders and token_addr
                else None
            )
            f_bund = (
                pool.submit(_fetch_bundles)
                if include_holders and token_addr
                else None
            )

            history, gecko_token = f_hist.result()
            x_data = f_sent.result()
            coin_pack = f_coin.result()
            social_pack = f_soc.result()
            maps_data = f_maps.result()
            if f_hold is not None:
                holders_data = f_hold.result()
            if f_bund is not None:
                bundles_data = f_bund.result()

        # Prefer Helius snapshot already inside bundles (skip extra Helius RPC)
        try:
            src_rep = (bundles_data.get("source_reports") or {}).get("helius") or {}
            if src_rep.get("ok") or src_rep.get("holders"):
                helius_holders = {
                    "ok": bool(src_rep.get("ok")),
                    "holders": src_rep.get("holders") or [],
                    "summary": src_rep.get("summary") or {},
                    "source": src_rep.get("source") or "helius_rpc",
                    "error": src_rep.get("error"),
                }
            elif holders_data.get("ok") and "helius" in str(
                holders_data.get("source") or ""
            ):
                helius_holders = {
                    "ok": True,
                    "holders": holders_data.get("holders") or [],
                    "summary": holders_data.get("summary") or {},
                    "source": holders_data.get("source"),
                }
        except Exception:  # noqa: BLE001
            helius_holders = {"ok": False, "holders": [], "summary": {}}

    # Merge official description into social pack
    if coin_pack.get("official_description"):
        social_pack = dict(social_pack)
        blocks = list(social_pack.get("description_blocks") or [])
        blocks.insert(
            0,
            {
                "source": coin_pack.get("official_source") or "coin_api",
                "text": coin_pack["official_description"],
                "url": (coin_pack.get("links") or {}).get("website") or "",
            },
        )
        social_pack["description_blocks"] = blocks
        srcs = list(social_pack.get("sources_used") or [])
        for s in coin_pack.get("sources_used") or []:
            if s not in srcs:
                srcs.insert(0, s)
        social_pack["sources_used"] = srcs
        social_pack["ok"] = True

    # Fold social snippets into X sample posts
    if social_pack.get("snippets"):
        extra_posts = []
        seen_txt = {p.get("text") for p in (x_data.get("sample_posts") or [])}
        for sn in social_pack["snippets"][:12]:
            t = (sn.get("text") or "").strip()
            if not t or t in seen_txt:
                continue
            seen_txt.add(t)
            extra_posts.append(
                {
                    "text": t[:240],
                    "link": sn.get("url"),
                    "published": "",
                    "source": f"{sn.get('platform') or 'web'}:{sn.get('source') or ''}",
                }
            )
        if extra_posts:
            x_data = dict(x_data)
            x_data["sample_posts"] = list(x_data.get("sample_posts") or []) + extra_posts
            if (x_data.get("posts_analyzed") or 0) == 0:
                from .sentiment import analyze_texts

                texts = [
                    p.get("text") or ""
                    for p in x_data["sample_posts"]
                    if p.get("text")
                ]
                analysis = analyze_texts(texts)
                analysis["kind"] = "social_web_text"
                x_data["sentiment"] = analysis
                x_data["posts_analyzed"] = len(texts)
                srcs = list(x_data.get("sources_used") or [])
                for s in social_pack.get("sources_used") or []:
                    if s not in srcs:
                        srcs.append(s)
                x_data["sources_used"] = srcs

    story = narr.build_narrative(
        pair_summary=pair_summary,
        socials=socials,
        history=history,
        sentiment=x_data,
        pumpfun=pump_meta,
        social_sources=social_pack,
        coin_facts=coin_pack,
    )

    try:
        alerts_data = alrt.build_alerts(
            holders_data, bundles_data, socials=socials
        )
    except Exception as exc:  # noqa: BLE001
        alerts_data = {
            "ok": False,
            "priority_count": 0,
            "alerts": [],
            "summary": f"Alerts failed: {exc}",
            "notes": str(exc),
        }

    return {
        "ok": True,
        "query": query,
        # GUI uses this to know when enrichment is done (never leave Analyze stuck)
        "_phase": "quick" if quick else "full",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "token": {
            "name": base.get("name"),
            "symbol": base.get("symbol"),
            "address": token_addr,
            "chain_id": pair_summary.get("chain_id"),
        },
        "market": {
            "price_usd": pair_summary.get("price_usd"),
            "market_cap_usd": pair_summary.get("market_cap_usd"),
            "fdv_usd": pair_summary.get("fdv_usd"),
            "liquidity_usd": pair_summary.get("liquidity_usd"),
            "volume_h24_usd": pair_summary.get("volume_h24_usd"),
            "price_change_pct": pair_summary.get("price_change_pct"),
            "txns_h24": pair_summary.get("txns_h24"),
            "pair": {
                "dex_id": pair_summary.get("dex_id"),
                "pair_address": pair_summary.get("pair_address"),
                "url": pair_summary.get("pair_url"),
                "created_at": _iso(pair_summary.get("pair_created_at_ms")),
                "labels": pair_summary.get("labels"),
                "boosts_active": pair_summary.get("boosts_active"),
            },
        },
        "initial_market_cap": {
            "estimated_usd": history.get("initial_market_cap_usd"),
            "estimated_price_usd": history.get("initial_price_usd"),
            "as_of": _iso_ts(history.get("initial_timestamp")),
            "method": history.get("history_note"),
            "source": history.get("source") or "geckoterminal_ohlcv",
        },
        "all_time_high": {
            "estimated_price_usd": history.get("ath_price_usd"),
            "estimated_market_cap_usd": history.get("ath_market_cap_usd"),
            "as_of": _iso_ts(history.get("ath_timestamp")),
            "candles_used": history.get("candles_used"),
            "method": history.get("history_note"),
            "source": history.get("source") or "geckoterminal_ohlcv",
        },
        "helius_holders_for_bundles": {
            "ok": helius_holders.get("ok"),
            "source": helius_holders.get("source"),
            "error": helius_holders.get("error"),
            "accounts": (helius_holders.get("summary") or {}).get("accounts_returned"),
        },
        "analytics": _build_analytics(pair_summary, history),
        "chart": {
            "network": history.get("network"),
            "pool_address": history.get("pool_address"),
            "series": history.get("series") or [],
            "timeframe": "day" if (history.get("candles_used") or 0) <= 400 else "day",
        },
        "socials": socials,
        "holders": holders_data,
        "bundles": bundles_data,
        "alerts": alerts_data,
        "maps": maps_data,
        "community_sentiment_x": x_data,
        "coin_facts": coin_pack,
        "social_narrative_sources": social_pack,
        "narrative": story,
        "alternates": [
            {
                "pair_address": p.get("pairAddress"),
                "dex_id": p.get("dexId"),
                "chain_id": p.get("chainId"),
                "liquidity_usd": ((p.get("liquidity") or {}).get("usd")),
                "volume_h24_usd": ((p.get("volume") or {}).get("h24")),
                "price_usd": p.get("priceUsd"),
                "url": p.get("url"),
            }
            for p in sorted(
                pairs,
                key=lambda x: float(((x.get("volume") or {}).get("h24") or 0)),
                reverse=True,
            )[:12]
            if (p.get("pairAddress") or "") != pair_summary.get("pair_address")
        ],
        "pumpfun": pump_meta,
        "disclaimer": (
            "Estimates only. ATH/initial mcap depend on available OHLCV history "
            "and inferred supply. Sentiment is a keyword heuristic, not investment advice."
        ),
    }


def _build_analytics(pair_summary: dict[str, Any], history: dict[str, Any]) -> dict[str, Any]:
    """Derived risk / pressure metrics for the advanced GUI."""
    tx = pair_summary.get("txns_h24") or {}
    buys = float(tx.get("buys") or 0)
    sells = float(tx.get("sells") or 0)
    total_tx = buys + sells
    buy_ratio = (buys / total_tx) if total_tx else None

    price = pair_summary.get("price_usd")
    ath = history.get("ath_price_usd")
    init_p = history.get("initial_price_usd")
    mcap = pair_summary.get("market_cap_usd")
    liq = pair_summary.get("liquidity_usd")
    vol = pair_summary.get("volume_h24_usd")

    dd_from_ath = None
    if price and ath and ath > 0:
        dd_from_ath = (price / ath - 1.0) * 100.0

    multiple_from_init = None
    if price and init_p and init_p > 0:
        multiple_from_init = price / init_p

    liq_to_mcap = (liq / mcap) if (liq and mcap and mcap > 0) else None
    vol_to_mcap = (vol / mcap) if (vol and mcap and mcap > 0) else None

    # Lightweight heuristic risk score 0 (safer) .. 100 (riskier)
    risk = 40.0
    if liq is not None:
        if liq < 5_000:
            risk += 25
        elif liq < 50_000:
            risk += 12
        elif liq > 1_000_000:
            risk -= 10
    if liq_to_mcap is not None:
        if liq_to_mcap < 0.01:
            risk += 15
        elif liq_to_mcap > 0.15:
            risk -= 8
    if buy_ratio is not None:
        if buy_ratio < 0.35:
            risk += 10
        elif buy_ratio > 0.6:
            risk -= 5
    if dd_from_ath is not None and dd_from_ath < -80:
        risk += 8
    risk = max(0.0, min(100.0, risk))

    if risk >= 70:
        risk_label = "high"
    elif risk >= 45:
        risk_label = "elevated"
    elif risk >= 25:
        risk_label = "moderate"
    else:
        risk_label = "lower"

    return {
        "buy_ratio_h24": buy_ratio,
        "buys_h24": int(buys),
        "sells_h24": int(sells),
        "drawdown_from_ath_pct": dd_from_ath,
        "multiple_from_initial": multiple_from_init,
        "liquidity_to_mcap": liq_to_mcap,
        "volume_to_mcap": vol_to_mcap,
        "risk_score": round(risk, 1),
        "risk_label": risk_label,
    }


def _candidate_pools(
    gecko_token: dict[str, Any] | None,
    primary_pair: str | None,
    pairs: list[dict[str, Any]],
) -> list[str]:
    """Collect pool addresses to mine for longer OHLCV / better ATH."""
    ordered: list[str] = []
    seen: set[str] = set()

    def add(addr: str | None) -> None:
        if not addr:
            return
        key = addr.lower()
        if key in seen:
            return
        seen.add(key)
        ordered.append(addr)

    if gecko_token:
        rel = (gecko_token.get("relationships") or {}).get("top_pools") or {}
        for p in rel.get("data") or []:
            pool_id = p.get("id") or ""
            if "_" in pool_id:
                add(pool_id.split("_", 1)[1])
            else:
                add(pool_id)
    add(primary_pair)
    for p in sorted(
        pairs,
        key=lambda x: float(((x.get("volume") or {}).get("h24") or 0)),
        reverse=True,
    )[:5]:
        add(p.get("pairAddress"))
    return ordered


def _ms_to_unix(ms: int | float | None) -> int | None:
    """Pump.fun timestamps are often ms; Gecko uses unix seconds."""
    if ms is None:
        return None
    try:
        v = int(ms)
    except (TypeError, ValueError):
        return None
    # treat large values as milliseconds
    if v > 10_000_000_000:
        return v // 1000
    return v


def _iso(ms: int | None) -> str | None:
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
    except (OSError, OverflowError, ValueError, TypeError):
        return None


def _iso_ts(ts: int | None) -> str | None:
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except (OSError, OverflowError, ValueError, TypeError):
        return None
