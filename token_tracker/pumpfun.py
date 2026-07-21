"""
Pump.fun market data via DexScreener (dexId=pumpfun / pumpswap).

Pump.fun's own frontend APIs are often Cloudflare-blocked without browser
auth, so we use DexScreener's public API which indexes Pump.fun pairs.

"All tokens" on Pump.fun is not feasible (hundreds of thousands). We continuously
discover *active / boosted / newly profiled* pump mints and rotate them.
"""

from __future__ import annotations

import time
from typing import Any

from . import dexscreener as dx
from .http_util import get_json

PUMP_MINT_SUFFIX = "pump"
DEX_PUMP = {"pumpfun", "pumpswap", "pump"}


def is_pump_mint(address: str | None) -> bool:
    if not address:
        return False
    return address.lower().endswith(PUMP_MINT_SUFFIX)


def fetch_pump_lp_accounts(mint: str) -> dict[str, str]:
    """
    Map of wallet address → LP label for this pump mint.

    Bonding curve / PumpSwap pool accounts are *per-mint PDAs*, not the global
    program IDs in holders._KNOWN_OWNERS — so large LP bags look like whales
    unless we resolve them from Pump.fun coin metadata.
    """
    m = (mint or "").strip()
    if not m or not is_pump_mint(m):
        return {}
    out: dict[str, str] = {}
    data: Any = None
    for url in (
        f"https://frontend-api-v3.pump.fun/coins/{m}",
        f"https://frontend-api.pump.fun/coins/{m}",
    ):
        try:
            data = get_json(url, timeout=10.0, retries=0)
            if isinstance(data, dict) and (
                data.get("bonding_curve")
                or data.get("associated_bonding_curve")
                or data.get("pump_swap_pool")
            ):
                break
        except Exception:  # noqa: BLE001
            data = None
    if not isinstance(data, dict):
        return {}

    def _add(addr: Any, label: str) -> None:
        a = (str(addr) if addr is not None else "").strip()
        if a and len(a) >= 32:
            out[a] = label

    _add(data.get("bonding_curve"), "Pump.fun bonding curve")
    _add(
        data.get("associated_bonding_curve"),
        "Pump.fun bonding curve (Associated Token Account)",
    )
    _add(data.get("pump_swap_pool"), "PumpSwap pool (liquidity)")
    # Some payloads use raydium_pool after migrate
    _add(data.get("raydium_pool"), "Raydium pool (liquidity)")
    return out


def classify_graduation(
    token_address: str | None,
    *,
    pairs: list[dict[str, Any]] | None = None,
    primary_dex_id: str | None = None,
) -> dict[str, Any]:
    """
    Decide bonding-curve vs graduated for a Pump.fun-style mint.

    Rules (DexScreener-based; free public index):
      - dexId == pumpfun  → still on bonding curve → graduated = no
      - pump mint on pumpswap / raydium / meteora / orca (and no pumpfun pair)
        → graduated = yes
      - pump mint with no clear DEX signal → graduated = unknown
    """
    mint = (token_address or "").strip()
    is_mint = is_pump_mint(mint)
    dex_primary = (primary_dex_id or "").lower()
    pair_dexes: list[str] = []
    for p in pairs or []:
        d = (p.get("dexId") or "").lower()
        if d:
            pair_dexes.append(d)
        # only pairs for this mint if we can check base
        base = ((p.get("baseToken") or {}).get("address") or "").lower()
        if mint and base and base != mint.lower():
            # keep dex anyway if caller already filtered pairs to this token
            pass

    if dex_primary and dex_primary not in pair_dexes:
        pair_dexes.append(dex_primary)

    on_bonding = "pumpfun" in pair_dexes or dex_primary == "pumpfun"
    graduated_dexes = {"pumpswap", "raydium", "meteora", "orca", "pumpswap-v2"}
    on_grad_dex = any(d in graduated_dexes for d in pair_dexes)

    graduated: bool | None
    if on_bonding:
        graduated = False
    elif is_mint and on_grad_dex:
        graduated = True
    elif is_mint and not on_bonding and pair_dexes:
        # Pump mint trading somewhere other than bonding curve
        graduated = True
    elif is_mint:
        graduated = None  # unknown / no pair signal
    else:
        graduated = None

    status = "bonding"
    if graduated is True:
        status = "graduated"
    elif graduated is False:
        status = "bonding"
    elif is_mint:
        status = "unknown"
    else:
        status = "not_pump"

    return {
        "is_pump_mint": is_mint,
        "on_bonding_curve": bool(on_bonding),
        "graduated": graduated,
        "graduated_label": (
            "yes" if graduated is True else "no" if graduated is False else "unknown"
        ),
        "status": status,
        "dex_id": dex_primary or (pair_dexes[0] if pair_dexes else None),
        "dexes_seen": sorted(set(pair_dexes)),
        "pump_url": f"https://pump.fun/{mint}" if is_mint else None,
    }


def _is_pump_pair(p: dict[str, Any]) -> bool:
    dex = (p.get("dexId") or "").lower()
    if dex in DEX_PUMP:
        return True
    base = (p.get("baseToken") or {}).get("address") or ""
    return is_pump_mint(base)


def fetch_pumpfun_pairs(
    *,
    limit: int = 120,
    include_graduated: bool = True,
) -> list[dict[str, Any]]:
    """
    Discover as many active Pump.fun-related pairs as DexScreener will return
    in one discovery pass (multiple search queries + boosts + profiles).
    """
    seen: set[str] = set()
    out: list[dict[str, Any]] = []

    def add_pair(p: dict[str, Any]) -> None:
        if not _is_pump_pair(p):
            return
        base = (p.get("baseToken") or {}).get("address") or ""
        if not base:
            return
        key = f"{(p.get('chainId') or 'solana').lower()}:{base.lower()}"
        if key in seen:
            return
        seen.add(key)
        p = dict(p)
        dex = (p.get("dexId") or "").lower()
        p["_source"] = "pumpfun" if dex == "pumpfun" else (dex or "pumpfun")
        p["_graduated"] = dex in {"pumpswap", "raydium", "meteora", "orca"} and dex != "pumpfun"
        out.append(p)

    # Multiple query angles — DexScreener search returns ~30 each
    queries = ["pumpfun"]
    if include_graduated:
        queries += ["pumpswap", "pump.fun"]
    # Letter / noise queries sometimes surface different active sets
    queries += ["sol pump", "bonding", "meme pump"]

    for q in queries:
        if len(out) >= limit:
            break
        try:
            for p in dx.search_pairs(q):
                add_pair(p)
                if len(out) >= limit:
                    break
        except Exception:  # noqa: BLE001
            continue
        time.sleep(0.25)

    # Boosted tokens → resolve pairs (often brand-new pump launches)
    if len(out) < limit:
        try:
            boosts = get_json("https://api.dexscreener.com/token-boosts/latest/v1", retries=1)
            if isinstance(boosts, list):
                for b in boosts[:40]:
                    if (b.get("chainId") or "").lower() != "solana":
                        continue
                    addr = b.get("tokenAddress") or ""
                    if not addr or (not is_pump_mint(addr) and "pump" not in (b.get("description") or "").lower()):
                        # still try if we have room — many boosts are pump mints
                        if not is_pump_mint(addr):
                            continue
                    try:
                        pairs = dx.pairs_for_token("solana", addr)
                    except Exception:  # noqa: BLE001
                        continue
                    for p in pairs:
                        add_pair(p)
                        if len(out) >= limit:
                            break
                    time.sleep(0.2)
                    if len(out) >= limit:
                        break
        except Exception:  # noqa: BLE001
            pass

    # Latest token profiles on solana with pump-like mints
    if len(out) < limit:
        try:
            profiles = get_json("https://api.dexscreener.com/token-profiles/latest/v1", retries=1)
            if isinstance(profiles, list):
                for prof in profiles:
                    if (prof.get("chainId") or "").lower() != "solana":
                        continue
                    addr = prof.get("tokenAddress") or ""
                    if not is_pump_mint(addr):
                        continue
                    try:
                        pairs = dx.pairs_for_token("solana", addr)
                    except Exception:  # noqa: BLE001
                        continue
                    for p in pairs:
                        add_pair(p)
                        if len(out) >= limit:
                            break
                    time.sleep(0.15)
                    if len(out) >= limit:
                        break
        except Exception:  # noqa: BLE001
            pass

    # Prefer higher volume first
    out.sort(
        key=lambda p: float(((p.get("volume") or {}).get("h24") or 0)),
        reverse=True,
    )
    return out[:limit]


def fetch_pumpfun_token(mint: str) -> list[dict[str, Any]]:
    """All DexScreener pairs for a mint, tagged if pumpfun/pumpswap."""
    pairs = dx.search_pairs(mint)
    exact = [
        p
        for p in pairs
        if ((p.get("baseToken") or {}).get("address") or "").lower() == mint.lower()
    ]
    if not exact:
        try:
            exact = dx.pairs_for_token("solana", mint)
        except Exception:  # noqa: BLE001
            exact = pairs
    tagged = []
    for p in exact:
        p = dict(p)
        dex = (p.get("dexId") or "").lower()
        p["_source"] = "pumpfun" if dex == "pumpfun" else dex
        p["_graduated"] = dex != "pumpfun" and is_pump_mint(mint)
        p["_is_pump_mint"] = is_pump_mint(mint)
        tagged.append(p)
    return tagged


def pair_to_pump_record(pair: dict[str, Any]) -> dict[str, Any]:
    """Normalize a DexScreener pair into a pumpfun_coins row dict."""
    base = pair.get("baseToken") or {}
    info = pair.get("info") or {}
    socials = info.get("socials") or []
    websites = info.get("websites") or []
    twitter = telegram = website = None
    for s in socials:
        if not isinstance(s, dict):
            continue
        t = (s.get("type") or s.get("platform") or "").lower()
        url = s.get("url") or ""
        if t in {"twitter", "x"}:
            twitter = url
        elif t == "telegram":
            telegram = url
    if websites:
        w0 = websites[0]
        website = w0.get("url") if isinstance(w0, dict) else str(w0)

    mint = base.get("address") or ""
    dex = (pair.get("dexId") or "").lower()
    return {
        "mint": mint,
        "name": base.get("name"),
        "symbol": base.get("symbol"),
        "price_usd": _f(pair.get("priceUsd")),
        "market_cap_usd": _f(pair.get("marketCap")),
        "fdv_usd": _f(pair.get("fdv")),
        "volume_h24": _f((pair.get("volume") or {}).get("h24")),
        "liquidity_usd": _f((pair.get("liquidity") or {}).get("usd")),
        "price_change_h24": _f((pair.get("priceChange") or {}).get("h24")),
        "pair_address": pair.get("pairAddress"),
        "dex_id": pair.get("dexId"),
        "url": pair.get("url") or f"https://pump.fun/{mint}",
        "pump_url": f"https://pump.fun/{mint}" if mint else None,
        "graduated": 1 if dex != "pumpfun" and is_pump_mint(mint) else (1 if pair.get("_graduated") else 0),
        "on_bonding_curve": 1 if dex == "pumpfun" else 0,
        "twitter": twitter,
        "telegram": telegram,
        "website": website,
        "image_url": info.get("imageUrl"),
        "created_at_ms": pair.get("pairCreatedAt"),
        "raw": pair,
    }


def try_native_coin(mint: str) -> dict[str, Any] | None:
    """Fetch Pump.fun coin JSON (cached briefly)."""
    m = (mint or "").strip()
    if not m:
        return None
    try:
        from .api_cache import TTL_PAIRS, cache_get, cache_set

        key = f"pump:coin:{m.lower()}"
        hit = cache_get(key)
        if isinstance(hit, dict):
            return hit
        if hit == "":
            return None
    except Exception:  # noqa: BLE001
        key = None
        cache_set = None  # type: ignore[assignment]

    urls = [
        f"https://frontend-api-v3.pump.fun/coins/{m}",
        f"https://frontend-api.pump.fun/coins/{m}",
        f"https://client-api-2-74b1891ee9f9.herokuapp.com/coins/{m}",
    ]
    for url in urls:
        try:
            data = get_json(url, retries=1, timeout=10.0)
            if isinstance(data, dict) and (
                data.get("mint") or data.get("symbol") or data.get("name")
            ):
                if key and cache_set:
                    cache_set(key, data, TTL_PAIRS)
                return data
        except Exception:  # noqa: BLE001
            continue
    if key and cache_set:
        try:
            from .api_cache import TTL_NEGATIVE

            cache_set(key, "", TTL_NEGATIVE)
        except Exception:  # noqa: BLE001
            pass
    return None


def _clean_about_text(text: Any) -> str:
    import re

    if text is None:
        return ""
    if isinstance(text, dict):
        text = text.get("en") or text.get("text") or text.get("description") or ""
    t = re.sub(r"<[^>]+>", " ", str(text or ""))
    t = re.sub(r"\s+", " ", t).strip()
    if t.lower() in {"", "n/a", "none", "null", "-", "tbd", "null description"}:
        return ""
    # Drop Pump.fun site chrome / SEO market blurbs (not the project About)
    low = t.lower()
    chrome_bits = (
        "price today",
        "live ",
        "trade on solana via pump",
        "market cap $",
        "trade aq on",
        "via pump.fun",
    )
    if any(b in low for b in chrome_bits) and (
        "market cap" in low or "price today" in low or "trade " in low
    ):
        return ""
    if low.startswith("live ") and "price" in low and "usd" in low:
        return ""
    return t


def _about_from_coin_dict(coin: dict[str, Any]) -> str:
    """
    Extract the About-section prose from Pump.fun coin JSON.

    UI "About" maps to description (and a few legacy aliases).
    """
    for key in (
        "description",
        "about",
        "desc",
        "body",
        "bio",
        "summary",
        "story",
        "project_description",
        "token_description",
    ):
        got = _clean_about_text(coin.get(key))
        if len(got) >= 8:
            return got
    # Nested blobs some API versions use
    for nest_key in ("profile", "metadata", "info", "details"):
        nest = coin.get(nest_key)
        if isinstance(nest, dict):
            for key in ("description", "about", "desc", "body", "bio"):
                got = _clean_about_text(nest.get(key))
                if len(got) >= 8:
                    return got
    return ""


def _about_from_metadata_uri(uri: str | None) -> tuple[str, dict[str, str], dict[str, Any]]:
    """Follow metadata_uri (what Pump.fun About often stores for the mint)."""
    u = (uri or "").strip()
    if not u:
        return "", {}, {}
    if u.startswith("ipfs://"):
        cid = u[len("ipfs://") :].lstrip("/")
        candidates = [
            f"https://ipfs.io/ipfs/{cid}",
            f"https://cloudflare-ipfs.com/ipfs/{cid}",
            f"https://nftstorage.link/ipfs/{cid}",
        ]
    else:
        candidates = [u]

    from .http_util import get_json, get_text
    import json

    data: Any = None
    for url in candidates:
        try:
            data = get_json(url, timeout=8.0, retries=0)
            if isinstance(data, dict):
                break
        except Exception:  # noqa: BLE001
            try:
                raw = get_text(url, timeout=8.0, retries=0)
                data = json.loads(raw)
                if isinstance(data, dict):
                    break
            except Exception:  # noqa: BLE001
                continue
    if not isinstance(data, dict):
        return "", {}, {}

    desc = _clean_about_text(
        data.get("description")
        or data.get("desc")
        or data.get("about")
        or (data.get("properties") or {}).get("description")
    )
    links: dict[str, str] = {}
    ext = data.get("extensions") or {}
    if isinstance(ext, dict):
        for k in ("website", "twitter", "telegram", "discord"):
            if ext.get(k):
                links[k] = str(ext[k])
        if not desc and ext.get("description"):
            desc = _clean_about_text(ext.get("description"))
    ext_url = data.get("external_url")
    if isinstance(ext_url, str) and ext_url.startswith("http"):
        links.setdefault("website", ext_url)
    meta = {
        "name": data.get("name"),
        "symbol": data.get("symbol"),
    }
    return desc, links, meta


def _about_from_pumpfun_page(mint: str) -> str:
    """
    Last-resort: scrape pump.fun coin page meta / embedded JSON for About text.
    """
    import json
    import re

    m = (mint or "").strip()
    if not m:
        return ""
    from .http_util import get_text

    for url in (
        f"https://pump.fun/coin/{m}",
        f"https://pump.fun/{m}",
        f"https://www.pump.fun/coin/{m}",
    ):
        try:
            html = get_text(url, timeout=10.0, retries=0) or ""
        except Exception:  # noqa: BLE001
            continue
        if not html or len(html) < 80:
            continue
        # og / twitter / meta description
        for pat in (
            r'property=["\']og:description["\']\s+content=["\']([^"\']+)["\']',
            r'content=["\']([^"\']+)["\']\s+property=["\']og:description["\']',
            r'name=["\']description["\']\s+content=["\']([^"\']+)["\']',
            r'name=["\']twitter:description["\']\s+content=["\']([^"\']+)["\']',
        ):
            mm = re.search(pat, html, re.I)
            if mm:
                got = _clean_about_text(mm.group(1))
                # Skip generic site chrome
                if len(got) >= 12 and "pump.fun" not in got.lower()[:20]:
                    low = got.lower()
                    if "trade" in low and "pump.fun" in low and len(got) < 80:
                        continue
                    return got
        # Next.js / embedded coin JSON with description
        for pat in (
            r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
            r'"description"\s*:\s*"((?:\\.|[^"\\]){12,})"',
        ):
            mm = re.search(pat, html, re.I | re.S)
            if not mm:
                continue
            blob = mm.group(1)
            if pat.startswith(r"<script"):
                try:
                    data = json.loads(blob)
                except Exception:  # noqa: BLE001
                    continue
                # Walk for description near this mint
                found = _walk_json_for_description(data, mint=m)
                if found:
                    return found
            else:
                try:
                    # unescape JSON string
                    got = json.loads(f'"{blob}"')
                except Exception:  # noqa: BLE001
                    got = blob.encode("utf-8").decode("unicode_escape", errors="ignore")
                got = _clean_about_text(got)
                if len(got) >= 12:
                    return got
    return ""


def _walk_json_for_description(obj: Any, *, mint: str, depth: int = 0) -> str:
    if depth > 8:
        return ""
    if isinstance(obj, dict):
        # Prefer nodes that mention this mint
        mint_l = (mint or "").lower()
        node_mint = str(obj.get("mint") or obj.get("address") or "").lower()
        desc = _about_from_coin_dict(obj) if any(
            k in obj for k in ("description", "about", "desc", "body")
        ) else ""
        if desc and (not mint_l or not node_mint or mint_l in node_mint or node_mint in mint_l):
            if len(desc) >= 8:
                return desc
        for v in obj.values():
            got = _walk_json_for_description(v, mint=mint, depth=depth + 1)
            if got:
                return got
    elif isinstance(obj, list):
        for it in obj[:40]:
            got = _walk_json_for_description(it, mint=mint, depth=depth + 1)
            if got:
                return got
    return ""


def fetch_coin_about(mint: str) -> dict[str, Any]:
    """
    Resolve the Pump.fun coin *About* section for narrative.

    Priority:
      1) coin JSON description / about fields (API)
      2) metadata_uri JSON description (same text About often loads)
      3) pump.fun coin page meta / embedded JSON scrape

    Returns:
      {
        ok, name, symbol, description, description_source,
        links, uri, page_url, raw_coin
      }
    """
    m = (mint or "").strip()
    if not m:
        return {"ok": False, "description": "", "links": {}}

    coin = try_native_coin(m)
    name = None
    symbol = None
    links: dict[str, str] = {}
    uri = ""
    desc = ""
    desc_source = ""

    if isinstance(coin, dict):
        name = coin.get("name")
        symbol = coin.get("symbol")
        desc = _about_from_coin_dict(coin)
        if desc:
            desc_source = "pumpfun_about"
        uri = str(
            coin.get("metadata_uri")
            or coin.get("uri")
            or coin.get("metadataUri")
            or ""
        ).strip()
        # Socials from coin row (shown on the same About/profile card)
        tw = coin.get("twitter") or coin.get("twitter_url") or coin.get("twitterUrl")
        if tw:
            tw_s = str(tw).strip()
            if tw_s and not tw_s.startswith("http"):
                tw_s = f"https://x.com/{tw_s.lstrip('@')}"
            if tw_s.startswith("http"):
                links["twitter"] = tw_s
        tg = coin.get("telegram") or coin.get("telegram_url")
        if tg:
            tg_s = str(tg).strip()
            if tg_s and not tg_s.startswith("http"):
                tg_s = f"https://t.me/{tg_s.lstrip('@')}"
            if tg_s.startswith("http"):
                links["telegram"] = tg_s
        web = coin.get("website") or coin.get("website_url")
        if web and str(web).startswith("http") and "pump.fun" not in str(web).lower():
            links["website"] = str(web)
        if uri.startswith("http"):
            links.setdefault("metadata_uri", uri)

    # About empty on coin row → metadata (Pump.fun About often uses this)
    if len(desc) < 8 and uri:
        meta_desc, meta_links, meta = _about_from_metadata_uri(uri)
        if len(meta_desc) >= 8:
            desc = meta_desc
            desc_source = "pumpfun_about_metadata"
            for k, v in meta_links.items():
                links.setdefault(k, v)
            name = name or meta.get("name")
            symbol = symbol or meta.get("symbol")

    # API blocked / empty → page scrape
    if len(desc) < 8:
        page_desc = _about_from_pumpfun_page(m)
        if len(page_desc) >= 8:
            desc = page_desc
            desc_source = "pumpfun_about_page"

    page_url = f"https://pump.fun/coin/{m}"
    ok = bool(desc or name or symbol or coin)
    return {
        "ok": ok,
        "name": name,
        "symbol": symbol,
        "description": desc[:1200] if desc else "",
        "description_source": desc_source or ("pumpfun_coin" if coin else ""),
        "links": links,
        "uri": uri if uri.startswith("http") else "",
        "page_url": page_url,
        "raw_coin": coin if isinstance(coin, dict) else None,
    }


def is_prebond_coin(native: dict[str, Any] | None) -> bool:
    """True while still on Pump.fun bonding curve (not migrated)."""
    if not isinstance(native, dict):
        return False
    if native.get("complete") is True:
        return False
    # Some payloads only set pool fields after migrate
    if native.get("complete") is False:
        return True
    # complete missing: treat as prebond if no graduate pool yet
    if native.get("pump_swap_pool") or native.get("raydium_pool"):
        return False
    return True


def pairs_for_prebond_mint(mint: str) -> list[dict[str, Any]]:
    """
    Market pairs for a *pump mint still on the bonding curve.

    Prefer native Pump.fun API (price/mcap/curve) — do not wait on DexScreener
    or Raydium for prebond tokens.
    """
    m = (mint or "").strip()
    if not m or not is_pump_mint(m):
        return []
    native = try_native_coin(m)
    if not native or not is_prebond_coin(native):
        return []
    pair = synthetic_pair_from_native(m, native)
    if not pair:
        return []
    pair = dict(pair)
    pair["dexId"] = "pumpfun"
    pair["_source"] = "pumpfun_native_api"
    pair["_prebond"] = True
    pair["_graduated"] = False
    pair["_is_pump_mint"] = True
    # Bonding curve account is the "pair" for prebond
    if native.get("bonding_curve"):
        pair["pairAddress"] = native.get("bonding_curve")
    return [pair]


def synthetic_pair_from_native(mint: str, native: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """
    Build a DexScreener-shaped pair dict from Pump.fun coin JSON so Analyze
    can continue when DexScreener is rate-limited (429).
    """
    coin = native if isinstance(native, dict) else try_native_coin(mint)
    if not coin:
        return None
    addr = str(coin.get("mint") or mint or "").strip()
    if not addr:
        return None

    name = coin.get("name") or "Unknown"
    symbol = coin.get("symbol") or "?"
    # price / mcap fields vary by API version
    usd_mc = _f(coin.get("usd_market_cap")) or _f(coin.get("market_cap"))
    price = _f(coin.get("price_usd") or coin.get("usd_price") or coin.get("price"))
    if price is None and usd_mc:
        # rough: total supply often 1e9 for pump tokens
        try:
            supply = float(coin.get("total_supply") or 1_000_000_000)
            # total_supply may be raw with 6 decimals
            if supply > 1e12:
                supply = supply / 1e6
            if supply > 0:
                price = usd_mc / supply
        except (TypeError, ValueError):
            pass

    complete = bool(coin.get("complete") or coin.get("raydium_pool"))
    dex_id = "pumpswap" if complete else "pumpfun"

    websites = []
    socials = []
    if coin.get("website"):
        websites.append({"label": "Website", "url": str(coin["website"])})
    if coin.get("twitter"):
        tw = str(coin["twitter"])
        if not tw.startswith("http"):
            tw = f"https://x.com/{tw.lstrip('@')}"
        socials.append({"type": "twitter", "url": tw})
    if coin.get("telegram"):
        tg = str(coin["telegram"])
        if not tg.startswith("http"):
            tg = f"https://t.me/{tg.lstrip('@')}"
        socials.append({"type": "telegram", "url": tg})

    image = coin.get("image_uri") or coin.get("image") or coin.get("uri")
    pair: dict[str, Any] = {
        "chainId": "solana",
        "dexId": dex_id,
        "pairAddress": coin.get("bonding_curve") or coin.get("raydium_pool") or addr,
        "url": f"https://pump.fun/{addr}",
        "baseToken": {
            "address": addr,
            "name": name,
            "symbol": symbol,
        },
        "quoteToken": {
            "address": "So11111111111111111111111111111111111111112",
            "name": "Wrapped SOL",
            "symbol": "SOL",
        },
        "priceUsd": str(price) if price is not None else None,
        "marketCap": usd_mc,
        "fdv": usd_mc,
        "liquidity": {"usd": None},
        "volume": {"h24": _f(coin.get("volume_24h") or coin.get("volume"))},
        "priceChange": {},
        "txns": {"h24": {}},
        "pairCreatedAt": coin.get("created_timestamp"),
        "info": {
            "imageUrl": image,
            "websites": websites,
            "socials": socials,
            "description": (coin.get("description") or "")[:500],
        },
        "_source": "pumpfun_native_api",
        "_fallback": True,
        "_is_pump_mint": True,
        "_graduated": complete,
    }
    return pair


def pairs_from_pump_fallback(query: str) -> list[dict[str, Any]]:
    """
    Pump.fun native market pairs for a mint (prebond preferred, else graduated).
    Used when DexScreener is empty/429 or as primary for *pump mints.
    """
    q = (query or "").strip()
    if ":" in q and not q.startswith("http"):
        q = q.split(":", 1)[-1].strip()
    if not q or len(q) < 32:
        return []
    # Prefer pump-suffix mints; still try any solana-looking address
    if not (is_pump_mint(q) or (len(q) >= 32 and " " not in q)):
        return []
    # Pre-bond: dedicated path
    if is_pump_mint(q):
        pre = pairs_for_prebond_mint(q)
        if pre:
            return pre
    pair = synthetic_pair_from_native(q)
    return [pair] if pair else []


# Classic Pump.fun bonding-curve virtual reserves at launch (lamports / raw token units)
_PUMP_INIT_VIRTUAL_SOL_LAMPORTS = 30_000_000_000  # 30 SOL
_PUMP_INIT_VIRTUAL_TOKEN_RAW = 1_073_000_000_000_000
_PUMP_DEFAULT_SUPPLY_RAW = 1_000_000_000_000_000


def fetch_pumpfun_mcap_metrics(mint: str | None) -> dict[str, Any] | None:
    """
    Initial + ATH market cap from Pump.fun coin API (Overview source of truth when available).

    Uses frontend-api-v3 fields:
      - ath_market_cap, ath_market_cap_timestamp
      - usd_market_cap / market_cap
      - created_timestamp
      - virtual reserves for initial mcap estimate
    """
    if not mint or not is_pump_mint(mint):
        return None
    native = try_native_coin(mint)
    if not native:
        return None

    ath_mc = _f(native.get("ath_market_cap"))
    usd_mc = _f(native.get("usd_market_cap"))
    mc_sol = _f(native.get("market_cap"))  # often SOL-denominated
    total_raw = None
    try:
        total_raw = int(
            native.get("total_supply")
            or native.get("total_supply_str")
            or _PUMP_DEFAULT_SUPPLY_RAW
        )
    except (TypeError, ValueError):
        total_raw = _PUMP_DEFAULT_SUPPLY_RAW

    # SOL/USD from current mcap if market_cap is in SOL
    sol_usd = None
    if usd_mc and mc_sol and mc_sol > 0:
        sol_usd = usd_mc / mc_sol

    # Initial mcap: bonding curve at launch ≈ 30 SOL * supply / 1.073e9 tokens
    # standard: init mcap_sol = init_virtual_sol * total_supply / init_virtual_token
    init_mc_sol = (
        (_PUMP_INIT_VIRTUAL_SOL_LAMPORTS / 1e9)
        * (total_raw / _PUMP_INIT_VIRTUAL_TOKEN_RAW)
    )
    init_mc_usd = (init_mc_sol * sol_usd) if sol_usd else None

    # Prefer API ATH; if missing use current as floor
    ath_ts = native.get("ath_market_cap_timestamp") or native.get("updated_at")
    created = native.get("created_timestamp")

    return {
        "ok": True,
        "source": "pumpfun_api",
        "mint": mint,
        "current_market_cap_usd": usd_mc,
        "ath_market_cap_usd": ath_mc if ath_mc is not None else usd_mc,
        "ath_timestamp_ms": ath_ts if isinstance(ath_ts, (int, float)) else None,
        "initial_market_cap_usd": init_mc_usd,
        "initial_market_cap_sol": init_mc_sol,
        "created_timestamp_ms": created if isinstance(created, (int, float)) else None,
        "complete": bool(native.get("complete")),
        "symbol": native.get("symbol"),
        "name": native.get("name"),
        "history_note": (
            "Initial MC estimated from Pump.fun bonding-curve launch reserves "
            "(30 SOL virtual / standard virtual token reserves). "
            "ATH MC from Pump.fun coin API field ath_market_cap."
        ),
        "raw_fields": {
            "ath_market_cap": native.get("ath_market_cap"),
            "usd_market_cap": native.get("usd_market_cap"),
            "market_cap": native.get("market_cap"),
            "created_timestamp": native.get("created_timestamp"),
        },
    }


def enrich_with_native(record: dict[str, Any]) -> dict[str, Any]:
    mint = record.get("mint") or ""
    if not mint:
        return record
    native = try_native_coin(mint)
    if not native:
        return record
    record = dict(record)
    record["description"] = native.get("description") or record.get("description")
    record["name"] = record.get("name") or native.get("name")
    record["symbol"] = record.get("symbol") or native.get("symbol")
    for key in ("usd_market_cap", "market_cap"):
        if native.get(key) is not None and not record.get("market_cap_usd"):
            try:
                record["market_cap_usd"] = float(native[key])
            except (TypeError, ValueError):
                pass
    if native.get("twitter"):
        record["twitter"] = native.get("twitter")
    if native.get("telegram"):
        record["telegram"] = native.get("telegram")
    if native.get("website"):
        record["website"] = native.get("website")
    if native.get("image_uri") or native.get("image_url"):
        record["image_url"] = native.get("image_uri") or native.get("image_url")
    if native.get("complete") is not None:
        record["graduated"] = 1 if native.get("complete") else record.get("graduated", 0)
        record["on_bonding_curve"] = 0 if native.get("complete") else 1
    record["native_pump"] = True
    return record


def _f(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
