"""
Multi-provider Solana market pairs (DexScreener-shaped).

Cascade helpers used by resolve_pairs:
  Pump (prebond) → DexScreener → Raydium → Birdeye → Pump native → …
Holders already fuse: Helius + Rugcheck + Solscan + Birdeye.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

from .api_cache import TTL_PAIRS, TTL_SEARCH, cache_get, cache_set
from .http_util import DEFAULT_HEADERS, get_json

BIRDEYE_BASE = "https://public-api.birdeye.so"


def _f(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _birdeye_key() -> str | None:
    k = (os.environ.get("BIRDEYE_API_KEY") or "").strip()
    return k or None


def birdeye_pairs_for_mint(mint: str) -> list[dict[str, Any]]:
    """
    Synthetic market pair from Birdeye token overview (Solana).
    Needs BIRDEYE_API_KEY. Returns [] if unavailable.
    """
    m = (mint or "").strip()
    key = _birdeye_key()
    if not m or not key:
        return []
    cache_key = f"be:pair:{m.lower()}"
    hit = cache_get(cache_key)
    if hit is not None:
        return list(hit) if isinstance(hit, list) else []

    headers = {
        **DEFAULT_HEADERS,
        "X-API-KEY": key,
        "x-chain": "solana",
        "Accept": "application/json",
    }
    try:
        data = get_json(
            f"{BIRDEYE_BASE}/defi/token_overview?" + urlencode({"address": m}),
            headers=headers,
            timeout=14.0,
            retries=1,
        )
    except Exception:  # noqa: BLE001
        cache_set(cache_key, [], TTL_PAIRS)
        return []

    body = (data or {}).get("data") if isinstance(data, dict) else None
    if not isinstance(body, dict):
        cache_set(cache_key, [], TTL_PAIRS)
        return []

    price = _f(body.get("price") or body.get("priceUsd") or body.get("value"))
    mc = _f(body.get("mc") or body.get("marketCap") or body.get("market_cap"))
    liq = _f(body.get("liquidity") or body.get("liquidityUsd"))
    vol = _f(
        body.get("v24hUSD")
        or body.get("v24h")
        or body.get("volume24h")
        or body.get("volume_24h_usd")
    )
    name = str(body.get("name") or "")
    symbol = str(body.get("symbol") or "")
    if price is None and mc is None and liq is None:
        cache_set(cache_key, [], TTL_PAIRS)
        return []

    pair: dict[str, Any] = {
        "chainId": "solana",
        "dexId": "birdeye",
        "url": f"https://birdeye.so/token/{m}?chain=solana",
        "pairAddress": f"birdeye-{m[:12]}",
        "baseToken": {"address": m, "name": name, "symbol": symbol},
        "quoteToken": {
            "address": "So11111111111111111111111111111111111111112",
            "name": "Wrapped SOL",
            "symbol": "SOL",
        },
        "priceUsd": str(price) if price is not None else None,
        "marketCap": mc,
        "fdv": _f(body.get("fdv") or body.get("realMc")) or mc,
        "liquidity": {"usd": liq} if liq is not None else {},
        "volume": {"h24": vol} if vol is not None else {},
        "priceChange": {
            "h24": _f(body.get("v24hChangePercent") or body.get("priceChange24h"))
        },
        "info": {
            "imageUrl": body.get("logoURI") or body.get("logo"),
            "websites": [],
            "socials": [],
        },
        "_source": "birdeye",
        "_is_pump_mint": m.lower().endswith("pump"),
    }
    # Optional extensions if Birdeye returns links
    ext = body.get("extensions") if isinstance(body.get("extensions"), dict) else {}
    if ext.get("website"):
        pair["info"]["websites"] = [{"url": str(ext["website"])}]
    if ext.get("twitter"):
        pair["info"]["socials"].append({"type": "twitter", "url": str(ext["twitter"])})
    if ext.get("telegram"):
        pair["info"]["socials"].append({"type": "telegram", "url": str(ext["telegram"])})

    out = [pair]
    cache_set(cache_key, out, TTL_SEARCH)
    return out


def rugcheck_pairs_for_mint(mint: str) -> list[dict[str, Any]]:
    """
    Thin market pair from Rugcheck token report when price/mcap present.
    Holders still come from multi-source fusion separately.
    """
    m = (mint or "").strip()
    if not m:
        return []
    cache_key = f"rc:pair:{m.lower()}"
    hit = cache_get(cache_key)
    if hit is not None:
        return list(hit) if isinstance(hit, list) else []

    try:
        data = get_json(
            f"https://api.rugcheck.xyz/v1/tokens/{m}/report",
            timeout=14.0,
            retries=0,
        )
    except Exception:  # noqa: BLE001
        cache_set(cache_key, [], TTL_PAIRS)
        return []
    if not isinstance(data, dict):
        cache_set(cache_key, [], TTL_PAIRS)
        return []

    price = _f(
        data.get("price")
        or (data.get("priceInfo") or {}).get("price")
        or (data.get("token") or {}).get("price")
    )
    # markets / fileMeta sometimes carry mc
    mc = _f(data.get("marketCap") or data.get("totalMarketLiquidity"))
    liq = _f(data.get("totalMarketLiquidity") or data.get("liquidity"))
    tok = data.get("token") if isinstance(data.get("token"), dict) else {}
    meta = data.get("tokenMeta") if isinstance(data.get("tokenMeta"), dict) else {}
    name = str(tok.get("name") or meta.get("name") or "")
    symbol = str(tok.get("symbol") or meta.get("symbol") or "")

    if price is None and mc is None and liq is None:
        cache_set(cache_key, [], TTL_PAIRS)
        return []

    pair = {
        "chainId": "solana",
        "dexId": "rugcheck",
        "url": f"https://rugcheck.xyz/tokens/{m}",
        "pairAddress": f"rugcheck-{m[:12]}",
        "baseToken": {"address": m, "name": name, "symbol": symbol},
        "quoteToken": {
            "address": "So11111111111111111111111111111111111111112",
            "name": "Wrapped SOL",
            "symbol": "SOL",
        },
        "priceUsd": str(price) if price is not None else None,
        "marketCap": mc,
        "fdv": mc,
        "liquidity": {"usd": liq} if liq is not None else {},
        "volume": {},
        "info": {},
        "_source": "rugcheck",
        "_is_pump_mint": m.lower().endswith("pump"),
    }
    out = [pair]
    cache_set(cache_key, out, TTL_SEARCH)
    return out


def merge_pair_lists(*lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Dedupe by pairAddress / base+dex, preserve order."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for lst in lists:
        for p in lst or []:
            if not isinstance(p, dict):
                continue
            base = ((p.get("baseToken") or {}).get("address") or "").lower()
            key = (
                (p.get("pairAddress") or "").lower()
                or f"{p.get('dexId')}|{base}|{p.get('_source')}"
            )
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(p)
    return out
