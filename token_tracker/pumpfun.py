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
    urls = [
        f"https://frontend-api.pump.fun/coins/{mint}",
        f"https://frontend-api-v3.pump.fun/coins/{mint}",
    ]
    for url in urls:
        try:
            data = get_json(url, retries=0, timeout=10.0)
            if isinstance(data, dict) and (data.get("mint") or data.get("symbol")):
                return data
        except Exception:  # noqa: BLE001
            continue
    return None


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
