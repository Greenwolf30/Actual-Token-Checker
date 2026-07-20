"""
Raydium API v3 helpers — Solana market fallback when DexScreener is limited.

Maps pool info into DexScreener-like pair dicts so the rest of Analyze can reuse
summarize_pair / pick_primary_pair without a full rewrite.
"""

from __future__ import annotations

from typing import Any

from .api_cache import TTL_PAIRS, TTL_SEARCH, cache_get, cache_set
from .http_util import get_json

BASE = "https://api-v3.raydium.io"
_WSOL = "So11111111111111111111111111111111111111112"
_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


def _f(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def mint_price(mint: str) -> float | None:
    m = (mint or "").strip()
    if not m:
        return None
    key = f"rd:price:{m.lower()}"
    hit = cache_get(key)
    if hit is not None:
        try:
            return float(hit) if hit != "" else None
        except (TypeError, ValueError):
            return None
    try:
        data = get_json(
            f"{BASE}/mint/price?mints={m}",
            timeout=12.0,
            retries=1,
        )
    except Exception:  # noqa: BLE001
        cache_set(key, "", TTL_PAIRS)
        return None
    row = (data or {}).get("data") if isinstance(data, dict) else None
    price = None
    if isinstance(row, dict):
        price = _f(row.get(m) or row.get(m.lower()))
    cache_set(key, price if price is not None else "", TTL_PAIRS)
    return price


def pools_for_mint(mint: str, *, page_size: int = 8) -> list[dict[str, Any]]:
    """Raw Raydium pool rows for a mint (liquidity-sorted)."""
    m = (mint or "").strip()
    if not m:
        return []
    key = f"rd:pools:{m.lower()}"
    hit = cache_get(key)
    if hit is not None:
        return list(hit) if isinstance(hit, list) else []
    url = (
        f"{BASE}/pools/info/mint?mint1={m}"
        f"&poolType=all&poolSortField=liquidity&sortType=desc"
        f"&pageSize={int(page_size)}&page=1"
    )
    try:
        data = get_json(url, timeout=14.0, retries=1)
    except Exception:  # noqa: BLE001
        cache_set(key, [], TTL_PAIRS)
        return []
    if not isinstance(data, dict) or not data.get("success"):
        cache_set(key, [], TTL_PAIRS)
        return []
    body = data.get("data") or {}
    rows = body.get("data") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        rows = []
    cache_set(key, rows, TTL_PAIRS)
    return rows


def _mint_side(info: Any) -> dict[str, str]:
    if not isinstance(info, dict):
        return {"address": "", "name": "", "symbol": ""}
    return {
        "address": str(info.get("address") or info.get("mint") or ""),
        "name": str(info.get("name") or ""),
        "symbol": str(info.get("symbol") or ""),
    }


def pool_to_dex_pair(pool: dict[str, Any], *, focus_mint: str | None = None) -> dict[str, Any]:
    """Convert one Raydium pool row → DexScreener-like pair dict."""
    mint_a = _mint_side(pool.get("mintA"))
    mint_b = _mint_side(pool.get("mintB"))
    focus = (focus_mint or "").strip().lower()
    # Prefer focus mint as base when possible
    if focus and mint_b["address"].lower() == focus and mint_a["address"].lower() != focus:
        base, quote = mint_b, mint_a
        # price field is typically mintA in mintB; invert when swapping
        price = _f(pool.get("price"))
        price_usd = (1.0 / price) if price and price > 0 else None
    else:
        base, quote = mint_a, mint_b
        price_usd = _f(pool.get("price"))

    day = pool.get("day") if isinstance(pool.get("day"), dict) else {}
    vol = _f(day.get("volume"))
    tvl = _f(pool.get("tvl"))
    pool_id = str(pool.get("id") or "")
    ptype = str(pool.get("type") or pool.get("pooltype") or "raydium")

    return {
        "chainId": "solana",
        "dexId": "raydium",
        "url": f"https://raydium.io/swap/?inputMint={base['address']}&outputMint={quote['address']}",
        "pairAddress": pool_id,
        "baseToken": base,
        "quoteToken": quote,
        "priceNative": str(price_usd) if price_usd is not None else None,
        "priceUsd": str(price_usd) if price_usd is not None else None,
        "txns": {},
        "volume": {"h24": vol} if vol is not None else {},
        "priceChange": {},
        "liquidity": {"usd": tvl} if tvl is not None else {},
        "fdv": None,
        "marketCap": None,
        "pairCreatedAt": None,
        "info": {},
        "_source": "raydium",
        "_raydium_type": ptype,
        "_raydium_program": pool.get("programId"),
    }


def pairs_for_token(mint: str) -> list[dict[str, Any]]:
    """DexScreener-shaped pairs for a Solana mint from Raydium (may be empty)."""
    m = (mint or "").strip()
    if not m:
        return []
    key = f"rd:dxpairs:{m.lower()}"
    hit = cache_get(key)
    if hit is not None:
        return list(hit) if isinstance(hit, list) else []
    pools = pools_for_mint(m)
    pairs = [pool_to_dex_pair(p, focus_mint=m) for p in pools if isinstance(p, dict)]
    # Drop empty ids
    pairs = [p for p in pairs if p.get("pairAddress")]
    # If pools empty but price exists, synthesize a thin quote pair vs USDC
    if not pairs:
        px = mint_price(m)
        if px is not None and px > 0:
            pairs = [
                {
                    "chainId": "solana",
                    "dexId": "raydium",
                    "url": f"https://raydium.io/swap/?inputMint={m}&outputMint={_USDC}",
                    "pairAddress": f"raydium-price-{m[:8]}",
                    "baseToken": {"address": m, "name": "", "symbol": ""},
                    "quoteToken": {
                        "address": _USDC,
                        "name": "USD Coin",
                        "symbol": "USDC",
                    },
                    "priceUsd": str(px),
                    "priceNative": str(px),
                    "volume": {},
                    "liquidity": {},
                    "info": {},
                    "_source": "raydium_price_only",
                }
            ]
    cache_set(key, pairs, TTL_SEARCH if pairs else TTL_PAIRS)
    return pairs
