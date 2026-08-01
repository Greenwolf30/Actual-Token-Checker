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
DEX_PUMP = {"pumpfun", "pumpswap", "pump", "pumpswap-v2", "pump-fun", "pump_swap"}


def is_pump_mint(address: str | None) -> bool:
    """Classic Pump.fun mint suffix (…pump)."""
    if not address:
        return False
    return address.lower().endswith(PUMP_MINT_SUFFIX)


def _norm_dex_id(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "").replace("_", "").replace("-", "")


def is_pump_pool_dex(dex_id: str | None) -> bool:
    """True when DexScreener pool is Pump.fun bonding curve or PumpSwap."""
    d = _norm_dex_id(dex_id)
    if not d:
        return False
    if d in {_norm_dex_id(x) for x in DEX_PUMP}:
        return True
    return d.startswith("pumpfun") or d.startswith("pumpswap") or d == "pump"


def _pairs_have_pump_pool(pairs: list[dict[str, Any]] | None) -> bool:
    for p in pairs or []:
        if is_pump_pool_dex(p.get("dexId")):
            return True
    return False


def is_pump_token(
    address: str | None,
    *,
    pairs: list[dict[str, Any]] | None = None,
    primary_dex_id: str | None = None,
    native: dict[str, Any] | None = None,
) -> bool:
    """
    Pump.fun origin token — suffix mint OR pumpfun/pumpswap pool OR native API hit.

    Many graduated / legacy pump tokens no longer end with 'pump' but still trade on
    pumpfun/pumpswap or exist in the Pump.fun coin API.
    """
    if is_pump_mint(address):
        return True
    if is_pump_pool_dex(primary_dex_id):
        return True
    if _pairs_have_pump_pool(pairs):
        return True
    if native and isinstance(native, dict):
        if native.get("mint") or native.get("bonding_curve") or native.get("raydium_pool"):
            return True
    return False


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
    suffix_mint = is_pump_mint(mint)
    dex_primary = (primary_dex_id or "").lower()
    pair_dexes: list[str] = []
    for p in pairs or []:
        d = (p.get("dexId") or "").lower()
        if d:
            pair_dexes.append(d)

    if dex_primary and dex_primary not in pair_dexes:
        pair_dexes.append(dex_primary)

    on_bonding = any(_norm_dex_id(d) == "pumpfun" for d in pair_dexes) or _norm_dex_id(
        dex_primary
    ) == "pumpfun"
    on_pumpswap = any(is_pump_pool_dex(d) and _norm_dex_id(d) != "pumpfun" for d in pair_dexes)
    graduated_dexes = {"pumpswap", "raydium", "meteora", "orca", "pumpswap-v2"}
    on_grad_dex = any(_norm_dex_id(d) in graduated_dexes for d in pair_dexes)

    # Native API only when pump signals exist (avoid extra call on unrelated tokens)
    native = None
    if mint and (
        suffix_mint
        or on_bonding
        or on_pumpswap
        or _pairs_have_pump_pool(pairs)
        or is_pump_pool_dex(primary_dex_id)
    ):
        native = try_native_coin(mint)
    pump_origin = is_pump_token(
        mint,
        pairs=pairs,
        primary_dex_id=primary_dex_id,
        native=native,
    )

    graduated: bool | None
    if on_bonding:
        graduated = False
    elif pump_origin and (on_pumpswap or on_grad_dex):
        graduated = True
    elif pump_origin and not on_bonding and pair_dexes:
        graduated = True
    elif pump_origin and native and native.get("complete") is True:
        graduated = True
    elif pump_origin and native and native.get("complete") is False:
        graduated = False
    elif pump_origin:
        graduated = None
    else:
        graduated = None

    status = "not_pump"
    if pump_origin:
        if graduated is True:
            status = "graduated"
        elif graduated is False:
            status = "bonding"
        else:
            status = "unknown"

    return {
        # Back-compat: treat any pump-origin token as pump for UI/alerts/history
        "is_pump_mint": pump_origin,
        "mint_ends_with_pump": suffix_mint,
        "is_pump_origin": pump_origin,
        "on_bonding_curve": bool(on_bonding),
        "graduated": graduated,
        "graduated_label": (
            "yes" if graduated is True else "no" if graduated is False else "unknown"
        ),
        "status": status,
        "dex_id": dex_primary or (pair_dexes[0] if pair_dexes else None),
        "dexes_seen": sorted(set(pair_dexes)),
        "pump_url": f"https://pump.fun/{mint}" if pump_origin and mint else None,
        "native_pump_api": bool(native),
    }


def _is_pump_pair(p: dict[str, Any]) -> bool:
    if is_pump_pool_dex(p.get("dexId")):
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
    urls = [
        f"https://frontend-api-v3.pump.fun/coins/{mint}",
        f"https://frontend-api.pump.fun/coins/{mint}",
        f"https://client-api-2-74b1891ee9f9.herokuapp.com/coins/{mint}",
    ]
    for url in urls:
        try:
            data = get_json(url, retries=1, timeout=8.0)
            if isinstance(data, dict) and (
                data.get("mint") or data.get("symbol") or data.get("name")
            ):
                return data
        except Exception:  # noqa: BLE001
            continue
    return None


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
        "_is_pump_mint": is_pump_mint(addr) or bool(coin),
        "_graduated": complete,
    }
    return pair


def pairs_from_pump_fallback(query: str) -> list[dict[str, Any]]:
    """
    When DexScreener is unavailable, try Pump.fun native API for a mint.
    """
    q = (query or "").strip()
    if ":" in q and not q.startswith("http"):
        q = q.split(":", 1)[-1].strip()
    if not q or len(q) < 32:
        return []
    # Prefer pump-suffix mints; still try any solana-looking address
    if not (is_pump_mint(q) or (len(q) >= 32 and " " not in q)):
        return []
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

    Works for any mint the Pump.fun API recognizes — not only …pump suffix addresses.
    """
    if not mint:
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
