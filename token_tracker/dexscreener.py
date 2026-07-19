"""DexScreener API client with TTL cache (cuts repeat 429s)."""

from __future__ import annotations

from typing import Any

from .api_cache import TTL_NEGATIVE, TTL_PAIRS, TTL_SEARCH, cache_get, cache_set
from .http_util import encode_query, get_json

BASE = "https://api.dexscreener.com"


def _is_rate_limit_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "rate-limited" in msg or "too many requests" in msg


def search_pairs(query: str) -> list[dict[str, Any]]:
    """Search DexScreener. Cached ~3 min. Raises on 429 after short retries."""
    q = (query or "").strip()
    if not q:
        return []
    key = f"dx:search:{q.lower()}"
    hit = cache_get(key)
    if hit is not None:
        return list(hit)

    try:
        data = get_json(
            f"{BASE}/latest/dex/search?{encode_query({'q': q})}",
            timeout=14.0,
            retries=2,
        )
    except Exception as exc:  # noqa: BLE001
        cache_set(key, [], TTL_NEGATIVE)
        raise

    pairs = list(data.get("pairs") or []) if isinstance(data, dict) else []
    cache_set(key, pairs, TTL_SEARCH if pairs else TTL_NEGATIVE)
    return pairs


def pairs_for_token(chain_id: str, token_address: str) -> list[dict[str, Any]]:
    chain = (chain_id or "").strip().lower()
    addr = (token_address or "").strip()
    if not chain or not addr:
        return []
    key = f"dx:pairs:{chain}:{addr.lower()}"
    hit = cache_get(key)
    if hit is not None:
        return list(hit)

    try:
        data = get_json(
            f"{BASE}/token-pairs/v1/{chain}/{addr}",
            timeout=14.0,
            retries=2,
        )
    except Exception as exc:  # noqa: BLE001
        cache_set(key, [], TTL_NEGATIVE)
        if _is_rate_limit_error(exc):
            raise
        return []

    if isinstance(data, list):
        pairs = data
    elif isinstance(data, dict):
        pairs = list(data.get("pairs") or [])
    else:
        pairs = []
    cache_set(key, pairs, TTL_PAIRS if pairs else TTL_NEGATIVE)
    return pairs


def tokens_by_addresses(chain_id: str, addresses: list[str]) -> list[dict[str, Any]]:
    if not addresses:
        return []
    chain = (chain_id or "").strip().lower()
    joined = ",".join(a.strip() for a in addresses[:30] if a and str(a).strip())
    if not chain or not joined:
        return []
    key = f"dx:tokens:{chain}:{joined.lower()}"
    hit = cache_get(key)
    if hit is not None:
        return list(hit)

    try:
        data = get_json(
            f"{BASE}/tokens/v1/{chain}/{joined}",
            timeout=14.0,
            retries=2,
        )
    except Exception as exc:  # noqa: BLE001
        cache_set(key, [], TTL_NEGATIVE)
        if _is_rate_limit_error(exc):
            raise
        return []

    if isinstance(data, list):
        pairs = data
    elif isinstance(data, dict):
        pairs = list(data.get("pairs") or [])
    else:
        pairs = []
    cache_set(key, pairs, TTL_PAIRS if pairs else TTL_NEGATIVE)
    return pairs


# Common quote assets — pairs against these are usually the real market.
# Stored lowercased for case-insensitive compare (fine for selection scoring).
_PREFERRED_QUOTES = {
    "so11111111111111111111111111111111111111112",  # wrapped SOL
    "es9vmfrzacermjfrf4h2fyd4kconky11mcce8benwnyb",  # USDT (Sol)
    "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v",  # USDC (Sol)
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",  # WETH
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",  # USDC eth
    "0xdac17f958d2ee523a2206206994597c13d831ec7",  # USDT eth
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  # USDC base
    "0x4200000000000000000000000000000000000006",  # WETH base/op / many L2s
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",  # WBNB
    # Robinhood Chain uses ETH as gas; WETH-style quotes score higher when present
}


def group_best_token_pairs(
    pairs: list[dict[str, Any]],
    *,
    query: str | None = None,
) -> list[dict[str, Any]]:
    """
    Collapse search hits to the most liquid pair per base token, ranked by
    aggregate market presence. Stops copycat tickers from beating blue-chips
    when DexScreener returns many same-symbol results.
    """
    if not pairs:
        return []

    by_token: dict[str, list[dict[str, Any]]] = {}
    for p in pairs:
        base = p.get("baseToken") or {}
        addr = (base.get("address") or "").strip()
        if not addr:
            continue
        by_token.setdefault(addr.lower(), []).append(p)

    representatives: list[dict[str, Any]] = []
    aggregates: dict[str, float] = {}
    for key, group in by_token.items():
        best = pick_primary_pair(group, query=query)
        if not best:
            continue
        vol = 0.0
        mcap = 0.0
        liq = 0.0
        for p in group:
            try:
                vol += float((p.get("volume") or {}).get("h24") or 0)
            except (TypeError, ValueError):
                pass
            try:
                mcap = max(mcap, float(p.get("marketCap") or p.get("fdv") or 0))
            except (TypeError, ValueError):
                pass
            try:
                liq += float((p.get("liquidity") or {}).get("usd") or 0)
            except (TypeError, ValueError):
                pass
        # Ignore fantasy mcaps / liquidity on dead pools (huge FDV, no activity).
        if vol < 1_000:
            credible_liq = min(liq, max(vol * 25, 500.0))
            credible_mcap = min(mcap, credible_liq * 20, max(vol * 500, 1.0))
        else:
            credible_liq = liq
            credible_mcap = mcap
        # Token-level score — real volume dominates ticker collisions
        aggregates[key] = vol * 10.0 + credible_liq * 0.5 + credible_mcap * 0.05
        representatives.append(best)

    def token_key(p: dict[str, Any]) -> float:
        addr = ((p.get("baseToken") or {}).get("address") or "").lower()
        return aggregates.get(addr, 0.0)

    representatives.sort(key=token_key, reverse=True)
    return representatives


def pick_primary_pair(
    pairs: list[dict[str, Any]],
    *,
    query: str | None = None,
) -> dict[str, Any] | None:
    """
    Rank pairs for a useful 'main' market.

    Liquidity alone is a poor signal (empty DLMM/stable pools can show huge liq
    and near-zero volume). Prefer real volume, social metadata, and quote quality.
    """
    if not pairs:
        return None

    q = (query or "").strip().lower()
    q_is_address = len(q) >= 32 and " " not in q

    def score(p: dict[str, Any]) -> tuple:
        base = p.get("baseToken") or {}
        quote = p.get("quoteToken") or {}
        info = p.get("info") or {}
        try:
            liq = float((p.get("liquidity") or {}).get("usd") or 0)
        except (TypeError, ValueError):
            liq = 0.0
        try:
            vol = float((p.get("volume") or {}).get("h24") or 0)
        except (TypeError, ValueError):
            vol = 0.0
        try:
            mcap = float(p.get("marketCap") or p.get("fdv") or 0)
        except (TypeError, ValueError):
            mcap = 0.0

        base_addr = (base.get("address") or "").lower()
        quote_addr = (quote.get("address") or "").lower()
        symbol = (base.get("symbol") or "").lower()
        name = (base.get("name") or "").lower()

        exact_addr = 1 if q_is_address and base_addr == q else 0
        symbol_hit = 1 if q and not q_is_address and symbol == q else 0
        name_hit = 1 if q and not q_is_address and (q in name or q in symbol) else 0
        has_profile = 1 if (info.get("socials") or info.get("websites") or info.get("imageUrl")) else 0
        good_quote = 1 if quote_addr in _PREFERRED_QUOTES else 0
        # Penalize absurd liq/volume/mcap ratios (phantom / mispriced pools)
        phantom = 0
        if vol < 50 and (liq > 50_000 or mcap > 100_000):
            phantom = 1
        if vol < 500 and mcap > 10_000_000:
            phantom = 1
        if liq > 0 and vol > 0 and liq / max(vol, 1) > 50_000:
            phantom = 1
        # Cap fantasy valuations when there is almost no trading
        if vol < 1_000:
            liq_score = min(liq, max(vol * 25, 500.0))
            mcap = min(mcap, liq_score * 20, max(vol * 500, 1.0))
        else:
            liq_score = liq
        activity = vol * 5.0 + liq_score * 0.2 + mcap * 0.01 + (50_000 if has_profile else 0)

        # Higher is better for most keys; phantom is inverted
        return (
            exact_addr,
            0 if phantom else 1,
            symbol_hit,
            vol,
            activity,
            liq_score,
            mcap,
            has_profile,
            good_quote,
            name_hit,
        )

    return max(pairs, key=score)


def extract_socials(pair: dict[str, Any]) -> dict[str, Any]:
    info = pair.get("info") or {}
    websites = []
    for w in info.get("websites") or []:
        if isinstance(w, dict):
            websites.append(
                {
                    "label": w.get("label") or "Website",
                    "url": w.get("url"),
                }
            )
        elif isinstance(w, str):
            websites.append({"label": "Website", "url": w})

    socials: list[dict[str, str]] = []
    twitter_handle: str | None = None
    extra_handles: list[str] = []
    for s in info.get("socials") or []:
        if not isinstance(s, dict):
            continue
        platform = (s.get("type") or s.get("platform") or "").lower()
        url = (s.get("url") or "").strip()
        handle = (s.get("handle") or "").strip()
        if not handle and url:
            handle = _handle_from_url(url)
        # Detect X/Twitter even if platform field is empty/wrong
        if not platform and url and ("x.com/" in url.lower() or "twitter.com/" in url.lower()):
            platform = "twitter"
        entry = {
            "platform": platform or "unknown",
            "handle": handle,
            "url": url or _url_from_handle(platform, handle),
        }
        socials.append(entry)
        if platform in {"twitter", "x"} and handle:
            h = handle.lstrip("@")
            if not twitter_handle:
                twitter_handle = h
            elif h.lower() != twitter_handle.lower():
                extra_handles.append(h)

    # Also scan websites for x.com links sometimes mislabeled
    for w in websites:
        url = (w.get("url") or "") if isinstance(w, dict) else ""
        if "x.com/" in url.lower() or "twitter.com/" in url.lower():
            h = _handle_from_url(url)
            if h and not twitter_handle:
                twitter_handle = h.lstrip("@")

    return {
        "websites": websites,
        "socials": socials,
        "twitter_handle": twitter_handle,
        "extra_twitter_handles": extra_handles,
        "image_url": info.get("imageUrl"),
        "header_url": info.get("header"),
    }


def _handle_from_url(url: str) -> str:
    url = url.strip().rstrip("/")
    lower = url.lower()
    # Skip non-profile links (communities, status, search, intents)
    if any(
        part in lower
        for part in (
            "/i/communities",
            "/i/lists",
            "/intent/",
            "/search",
            "/status/",
            "/hashtag/",
        )
    ):
        return ""
    for prefix in (
        "https://twitter.com/",
        "http://twitter.com/",
        "https://x.com/",
        "http://x.com/",
        "https://t.me/",
        "http://t.me/",
        "https://www.t.me/",
    ):
        if lower.startswith(prefix):
            rest = url[len(prefix) :]
            handle = rest.split("?")[0].split("/")[0]
            if handle.lower() in {"i", "home", "share", "intent", "search"}:
                return ""
            return handle
    return ""


def _url_from_handle(platform: str, handle: str) -> str:
    if not handle:
        return ""
    h = handle.lstrip("@")
    if platform in {"twitter", "x"}:
        return f"https://x.com/{h}"
    if platform == "telegram":
        return f"https://t.me/{h}"
    if platform == "discord":
        return handle if handle.startswith("http") else f"https://discord.gg/{h}"
    return ""


def summarize_pair(pair: dict[str, Any]) -> dict[str, Any]:
    base = pair.get("baseToken") or {}
    quote = pair.get("quoteToken") or {}
    price_usd = _f(pair.get("priceUsd"))
    mcap = _f(pair.get("marketCap"))
    fdv = _f(pair.get("fdv"))
    liq = _f((pair.get("liquidity") or {}).get("usd"))
    vol = pair.get("volume") or {}
    chg = pair.get("priceChange") or {}
    txns = pair.get("txns") or {}
    h24 = txns.get("h24") or {}

    return {
        "chain_id": pair.get("chainId"),
        "dex_id": pair.get("dexId"),
        "pair_address": pair.get("pairAddress"),
        "pair_url": pair.get("url"),
        "base_token": {
            "address": base.get("address"),
            "name": base.get("name"),
            "symbol": base.get("symbol"),
        },
        "quote_token": {
            "address": quote.get("address"),
            "name": quote.get("name"),
            "symbol": quote.get("symbol"),
        },
        "price_usd": price_usd,
        "market_cap_usd": mcap,
        "fdv_usd": fdv,
        "liquidity_usd": liq,
        "volume_h24_usd": _f(vol.get("h24")),
        "price_change_pct": {
            "m5": _f(chg.get("m5")),
            "h1": _f(chg.get("h1")),
            "h6": _f(chg.get("h6")),
            "h24": _f(chg.get("h24")),
        },
        "txns_h24": {
            "buys": h24.get("buys"),
            "sells": h24.get("sells"),
        },
        "pair_created_at_ms": pair.get("pairCreatedAt"),
        "labels": pair.get("labels") or [],
        "boosts_active": ((pair.get("boosts") or {}).get("active")),
    }


def _f(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
