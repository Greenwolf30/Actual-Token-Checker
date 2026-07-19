"""GeckoTerminal helpers for ATH / initial price estimation via OHLCV."""

from __future__ import annotations

from typing import Any

from .http_util import encode_query, get_json

BASE = "https://api.geckoterminal.com/api/v2"

# DexScreener chainId -> GeckoTerminal network id
CHAIN_TO_NETWORK = {
    "solana": "solana",
    "ethereum": "eth",
    "bsc": "bsc",
    "base": "base",
    "arbitrum": "arbitrum",
    "polygon": "polygon_pos",
    "avalanche": "avax",
    "optimism": "optimism",
    # DexScreener chainId for Robinhood Chain (Arbitrum L2, chain id 4663)
    "robinhood": "robinhood",
    "fantom": "ftm",
    "sui": "sui-network",
    "ton": "ton",
    "tron": "tron",
    "blast": "blast",
    "linea": "linea",
    "scroll": "scroll",
    "zksync": "zksync",
    "cronos": "cro",
    "mantle": "mantle",
    "pulsechain": "pulsechain",
    "moonbeam": "glmr",
    "celo": "celo",
    "gnosis": "xdai",
    "aptos": "aptos",
    "near": "near",
    "sonic": "sonic",
    "hyperevm": "hyperevm",
}


def network_id(chain_id: str | None) -> str | None:
    if not chain_id:
        return None
    return CHAIN_TO_NETWORK.get(chain_id.lower(), chain_id.lower())


# Reverse map for Gecko network -> DexScreener chainId (best effort)
_NETWORK_TO_CHAIN = {
    "solana": "solana",
    "eth": "ethereum",
    "bsc": "bsc",
    "base": "base",
    "arbitrum": "arbitrum",
    "polygon_pos": "polygon",
    "avax": "avalanche",
    "optimism": "optimism",
    "robinhood": "robinhood",
    "ftm": "fantom",
    "sui-network": "sui",
    "ton": "ton",
    "tron": "tron",
    "blast": "blast",
    "linea": "linea",
    "scroll": "scroll",
    "zksync": "zksync",
}


def search_top_token(
    query: str,
    *,
    chain: str | None = None,
) -> dict[str, str] | None:
    """
    Use GeckoTerminal pool search to resolve a ticker to the most active token.
    Returns {chain_id, token_address, pool_address, network} or None.
    """
    try:
        data = get_json(f"{BASE}/search/pools?{encode_query({'query': query})}")
    except RuntimeError:
        return None
    if not isinstance(data, dict):
        return None

    preferred_net = network_id(chain) if chain else None
    best: tuple[float, dict[str, str]] | None = None

    for item in data.get("data") or []:
        attrs = item.get("attributes") or {}
        rel = item.get("relationships") or {}
        item_id = item.get("id") or ""
        net_rel = (rel.get("network") or {}).get("data") or {}
        # Search results often omit relationships.network; id is "{network}_{pool}"
        network = net_rel.get("id") or (item_id.split("_", 1)[0] if "_" in item_id else "")
        if preferred_net and network and network != preferred_net:
            continue

        # base token id like "solana_EKpQ..."
        base_rel = (rel.get("base_token") or {}).get("data") or {}
        base_id = base_rel.get("id") or ""
        token_address = base_id.split("_", 1)[1] if "_" in base_id else ""
        pool_address = attrs.get("address") or ""
        if not token_address:
            continue

        try:
            reserve = float(attrs.get("reserve_in_usd") or 0)
        except (TypeError, ValueError):
            reserve = 0.0
        vol_obj = attrs.get("volume_usd") or {}
        try:
            vol = float(vol_obj.get("h24") or 0) if isinstance(vol_obj, dict) else float(vol_obj or 0)
        except (TypeError, ValueError):
            vol = 0.0
        try:
            mcap = float(attrs.get("market_cap_usd") or attrs.get("fdv_usd") or 0)
        except (TypeError, ValueError):
            mcap = 0.0

        # Skip phantom pools: huge reserves / mcap with almost no trading
        if vol < 500 and reserve > 50_000:
            continue
        if vol < 5_000 and mcap > 100_000_000:
            continue
        if reserve > 0 and vol / reserve < 0.001 and reserve > 500_000:
            continue
        # Prefer pool names that *exactly* match the query ticker (e.g. "$WIF / SOL")
        # Avoid substring traps: "Wifout" should not beat "$WIF".
        name = (attrs.get("name") or "").lower()
        qlow = query.lower().lstrip("$")
        name_mult = 1.0
        if qlow:
            base_name = name.split("/")[0].strip().lstrip("$")
            if base_name == qlow:
                name_mult = 25.0
            elif base_name != qlow:
                # Strongly demote non-exact ticker matches for short queries
                name_mult = 0.05 if len(qlow) <= 6 else 0.25

        # Volume is the primary signal; reserves only as a tie-breaker
        score = (
            vol * 10.0 + min(reserve, 5_000_000) * 0.2 + min(mcap, 20_000_000) * 0.01
        ) * name_mult
        chain_id = _NETWORK_TO_CHAIN.get(network, network.replace("-", "_") if network else "unknown")
        # normalize a few common cases
        if network == "eth":
            chain_id = "ethereum"
        candidate = {
            "chain_id": chain_id,
            "token_address": token_address,
            "pool_address": pool_address,
            "network": network,
        }
        if best is None or score > best[0]:
            best = (score, candidate)

    return best[1] if best else None


def fetch_token(network: str, token_address: str) -> dict[str, Any] | None:
    try:
        data = get_json(f"{BASE}/networks/{network}/tokens/{token_address}")
    except RuntimeError:
        return None
    if not isinstance(data, dict):
        return None
    return data.get("data")


def top_pool_address(token_payload: dict[str, Any] | None) -> str | None:
    if not token_payload:
        return None
    rel = (token_payload.get("relationships") or {}).get("top_pools") or {}
    pools = rel.get("data") or []
    if not pools:
        return None
    pool_id = pools[0].get("id") or ""
    # id format: "{network}_{poolAddress}"
    if "_" in pool_id:
        return pool_id.split("_", 1)[1]
    return pool_id or None


def fetch_ohlcv(
    network: str,
    pool_address: str,
    *,
    timeframe: str = "day",
    aggregate: int = 1,
    limit: int = 1000,
    currency: str = "usd",
    token: str = "base",
) -> list[list[float]]:
    """
    Returns OHLCV list: [timestamp, open, high, low, close, volume]
    Newest first (GeckoTerminal convention).
    """
    url = (
        f"{BASE}/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}"
        f"?aggregate={aggregate}&limit={limit}&currency={currency}&token={token}"
    )
    try:
        data = get_json(url)
    except RuntimeError:
        return []
    if not isinstance(data, dict):
        return []
    attrs = (data.get("data") or {}).get("attributes") or {}
    candles = attrs.get("ohlcv_list") or []
    return candles if isinstance(candles, list) else []


def analyze_price_history(
    candles: list[list[float]],
    *,
    current_price: float | None,
    current_mcap: float | None,
    current_fdv: float | None,
) -> dict[str, Any]:
    """
    Estimate ATH and initial market cap from available OHLCV.

    Notes:
    - ATH is the max high across returned candles (may be incomplete for
      very old tokens if history is truncated).
    - Initial mcap uses the earliest candle open * implied circulating supply
      derived from current mcap / price (preferred) or fdv / price.
    """
    if not candles:
        return {
            "candles_used": 0,
            "ath_price_usd": None,
            "ath_market_cap_usd": None,
            "ath_timestamp": None,
            "initial_price_usd": None,
            "initial_market_cap_usd": None,
            "initial_timestamp": None,
            "history_note": "No OHLCV history available from GeckoTerminal.",
        }

    # Normalize rows
    rows: list[tuple[int, float, float, float, float, float]] = []
    for c in candles:
        if not c or len(c) < 5:
            continue
        try:
            ts = int(c[0])
            o, h, l, cl = float(c[1]), float(c[2]), float(c[3]), float(c[4])
            vol = float(c[5]) if len(c) > 5 else 0.0
            rows.append((ts, o, h, l, cl, vol))
        except (TypeError, ValueError):
            continue

    if not rows:
        return {
            "candles_used": 0,
            "ath_price_usd": None,
            "ath_market_cap_usd": None,
            "ath_timestamp": None,
            "initial_price_usd": None,
            "initial_market_cap_usd": None,
            "initial_timestamp": None,
            "history_note": "OHLCV payload could not be parsed.",
        }

    # Gecko returns newest first
    newest = rows[0]
    oldest = rows[-1]
    ath_row = max(rows, key=lambda r: r[2])
    ath_price = ath_row[2]
    init_price = oldest[1]  # open of earliest candle

    supply = None
    supply_basis = None
    if current_price and current_price > 0 and current_mcap and current_mcap > 0:
        supply = current_mcap / current_price
        supply_basis = "market_cap"
    elif current_price and current_price > 0 and current_fdv and current_fdv > 0:
        supply = current_fdv / current_price
        supply_basis = "fdv"

    ath_mcap = (ath_price * supply) if supply else None
    init_mcap = (init_price * supply) if supply else None

    note_parts = [
        f"Derived from {len(rows)} {('day' if len(rows) < 400 else 'day')} OHLCV candles via GeckoTerminal.",
    ]
    if supply_basis == "fdv":
        note_parts.append("Supply inferred from FDV (circulating mcap unavailable).")
    elif supply_basis == "market_cap":
        note_parts.append("Supply inferred from current market cap / price.")
    else:
        note_parts.append("Could not infer supply; mcap estimates omitted.")
    note_parts.append(
        "ATH/initial figures are estimates over available history and may miss earlier peaks."
    )

    # Keep chronological series for charts (oldest -> newest)
    series = [
        {
            "ts": r[0],
            "open": r[1],
            "high": r[2],
            "low": r[3],
            "close": r[4],
            "volume": r[5],
        }
        for r in reversed(rows)
    ]

    return {
        "candles_used": len(rows),
        "ath_price_usd": ath_price,
        "ath_market_cap_usd": ath_mcap,
        "ath_timestamp": ath_row[0],
        "initial_price_usd": init_price,
        "initial_market_cap_usd": init_mcap,
        "initial_timestamp": oldest[0],
        "latest_candle_timestamp": newest[0],
        "supply_estimate": supply,
        "supply_basis": supply_basis,
        "history_note": " ".join(note_parts),
        "series": series,
    }
