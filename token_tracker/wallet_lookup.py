"""
Look up a Solana wallet across Pump.fun, Birdeye, and DexScreener.

Used by the Holders tab search bar (Leonidas desktop).
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from . import dexscreener as dx
from .env_config import load_dotenv
from .holder_sources import birdeye_api_key
from .http_util import DEFAULT_HEADERS, get_json

load_dotenv()

BIRDEYE_BASE = "https://public-api.birdeye.so"
PUMP_USER_COINS = (
    "https://frontend-api.pump.fun/coins/user-created-coins/{wallet}",
    "https://frontend-api-v3.pump.fun/coins/user-created-coins/{wallet}",
)
SOLSCAN_ACCOUNT = "https://solscan.io/account/{wallet}"


def solscan_account_url(wallet: str) -> str:
    return SOLSCAN_ACCOUNT.format(wallet=(wallet or "").strip())


def lookup_wallet(wallet: str, *, max_tokens: int = 12) -> dict[str, Any]:
    """
    Multi-source profile for a single wallet address.

    Sources (best-effort each):
      - Birdeye wallet token list (portfolio)
      - Pump.fun user-created coins
      - DexScreener pairs for tokens found above
    """
    wallet = (wallet or "").strip()
    report: dict[str, Any] = {
        "ok": False,
        "wallet": wallet,
        "solscan_url": solscan_account_url(wallet) if wallet else None,
        "sources": {},
        "errors": [],
        "tokens": [],
        "created_coins": [],
        "dex_pairs": [],
    }
    if not wallet or len(wallet) < 32:
        report["errors"].append("Enter a valid Solana wallet address.")
        return report

    bird = _birdeye_wallet_tokens(wallet, limit=max_tokens)
    report["sources"]["birdeye"] = {
        "ok": bird.get("ok"),
        "skipped": bird.get("skipped"),
        "count": len(bird.get("tokens") or []),
        "error": bird.get("error"),
        "total_usd": bird.get("total_usd"),
    }
    if bird.get("error") and not bird.get("skipped"):
        report["errors"].append(f"birdeye: {bird['error']}")
    report["tokens"] = bird.get("tokens") or []

    pump = _pumpfun_created_coins(wallet, limit=max_tokens)
    report["sources"]["pumpfun"] = {
        "ok": pump.get("ok"),
        "count": len(pump.get("coins") or []),
        "error": pump.get("error"),
    }
    if pump.get("error"):
        report["errors"].append(f"pumpfun: {pump['error']}")
    report["created_coins"] = pump.get("coins") or []

    # DexScreener: market pairs for portfolio + created mints
    mints: list[str] = []
    for t in report["tokens"]:
        m = (t.get("address") or t.get("mint") or "").strip()
        if m and m not in mints:
            mints.append(m)
    for c in report["created_coins"]:
        m = (c.get("mint") or c.get("address") or "").strip()
        if m and m not in mints:
            mints.append(m)

    dex = _dexscreener_for_mints(mints[:max_tokens])
    report["sources"]["dexscreener"] = {
        "ok": dex.get("ok"),
        "count": len(dex.get("pairs") or []),
        "error": dex.get("error"),
        "mints_queried": len(mints[:max_tokens]),
    }
    if dex.get("error"):
        report["errors"].append(f"dexscreener: {dex['error']}")
    report["dex_pairs"] = dex.get("pairs") or []

    report["ok"] = bool(
        report["tokens"] or report["created_coins"] or report["dex_pairs"]
    )
    if not report["ok"] and not report["errors"]:
        report["errors"].append(
            "No portfolio / created coins / pairs found for this wallet "
            "(Birdeye key may be required for holdings)."
        )
    return report


def format_wallet_lookup_text(data: dict[str, Any]) -> str:
    """Human-readable wallet lookup for the Holders tab."""
    w = data.get("wallet") or ""
    lines = [
        "WALLET LOOKUP",
        f"  Address: {w}",
        f"  Solscan: {data.get('solscan_url') or solscan_account_url(w)}",
        "",
        "  Sources:",
    ]
    src = data.get("sources") or {}
    bird = src.get("birdeye") or {}
    pump = src.get("pumpfun") or {}
    dex = src.get("dexscreener") or {}
    lines.append(
        f"    Birdeye: ok={bird.get('ok')}  holdings={bird.get('count')}  "
        f"total_usd={_fmt_usd(bird.get('total_usd'))}"
        + ("  (set BIRDEYE_API_KEY)" if bird.get("skipped") else "")
    )
    if bird.get("error") and not bird.get("skipped"):
        lines.append(f"      note: {bird.get('error')}")
    lines.append(f"    Pump.fun: ok={pump.get('ok')}  created={pump.get('count')}")
    if pump.get("error"):
        lines.append(f"      note: {pump.get('error')}")
    lines.append(
        f"    DexScreener: ok={dex.get('ok')}  pairs={dex.get('count')}  "
        f"mints={dex.get('mints_queried')}"
    )
    if dex.get("error"):
        lines.append(f"      note: {dex.get('error')}")

    coins = data.get("created_coins") or []
    if coins:
        lines.append("")
        lines.append(f"  Pump.fun coins created by this wallet ({len(coins)}):")
        for c in coins[:15]:
            mint = c.get("mint") or c.get("address") or ""
            sym = c.get("symbol") or "?"
            name = c.get("name") or ""
            mc = c.get("usd_market_cap") or c.get("market_cap")
            lines.append(f"    · {sym}  {name}".rstrip())
            lines.append(f"      mint {mint}")
            if mc is not None:
                lines.append(f"      mcap ${_fmt_num(mc)}")
            lines.append(f"      https://pump.fun/{mint}" if mint else "")

    tokens = data.get("tokens") or []
    if tokens:
        lines.append("")
        lines.append(f"  Birdeye holdings ({len(tokens)} shown):")
        for t in tokens[:15]:
            mint = t.get("address") or t.get("mint") or ""
            sym = t.get("symbol") or "?"
            bal = t.get("ui_amount")
            val = t.get("value_usd")
            lines.append(
                f"    · {sym}  bal={_fmt_num(bal)}  "
                f"usd={_fmt_usd(val)}"
            )
            if mint:
                lines.append(f"      {mint}")

    pairs = data.get("dex_pairs") or []
    if pairs:
        lines.append("")
        lines.append(f"  DexScreener markets ({len(pairs)}):")
        for p in pairs[:12]:
            base = p.get("baseToken") or {}
            sym = base.get("symbol") or "?"
            price = p.get("priceUsd")
            liq = (p.get("liquidity") or {}).get("usd")
            vol = (p.get("volume") or {}).get("h24")
            url = p.get("url") or ""
            lines.append(
                f"    · {sym}  price=${_fmt_num(price)}  "
                f"liq=${_fmt_num(liq)}  vol24=${_fmt_num(vol)}  "
                f"dex={p.get('dexId') or '?'}"
            )
            if base.get("address"):
                lines.append(f"      mint {base.get('address')}")
            if url:
                lines.append(f"      {url}")

    errs = data.get("errors") or []
    if errs:
        lines.append("")
        lines.append("  Issues:")
        for e in errs:
            lines.append(f"    • {e}")

    if not data.get("ok") and not tokens and not coins and not pairs:
        lines.append("")
        lines.append(
            "  No data returned. Try another wallet, set BIRDEYE_API_KEY, "
            "or check network."
        )

    lines.append("")
    lines.append("  Tip: click any wallet/mint address in this tab to open Solscan.")
    return "\n".join(lines) + "\n"


def filter_holders_by_query(holders_data: dict[str, Any], query: str) -> dict[str, Any]:
    """Filter a holders analysis payload by wallet substring (case-insensitive)."""
    q = (query or "").strip().lower()
    if not q or not holders_data:
        return holders_data
    out = dict(holders_data)
    rows = list(holders_data.get("holders") or [])
    matched = [
        h
        for h in rows
        if q in (h.get("wallet") or "").lower()
        or q in (h.get("label") or "").lower()
        or q in (h.get("token_account") or "").lower()
    ]
    out["holders"] = matched
    out["filter_query"] = query.strip()
    out["filter_matched"] = len(matched)
    out["filter_total"] = len(rows)
    # notes for UI
    note = f"Filtered holders by '{query.strip()}': {len(matched)}/{len(rows)} match."
    out["notes"] = note + (" " + (holders_data.get("notes") or "")).rstrip()
    return out


# ── providers ───────────────────────────────────────────────────────────


def _birdeye_wallet_tokens(wallet: str, *, limit: int = 20) -> dict[str, Any]:
    key = birdeye_api_key()
    if not key:
        return {
            "ok": False,
            "skipped": True,
            "needs_key": True,
            "error": "Set BIRDEYE_API_KEY in .env for wallet holdings",
            "tokens": [],
        }
    headers = {
        **DEFAULT_HEADERS,
        "X-API-KEY": key,
        "x-chain": "solana",
        "Accept": "application/json",
    }
    # Try common Birdeye wallet portfolio endpoints
    endpoints = [
        f"{BIRDEYE_BASE}/v1/wallet/token_list?{urlencode({'wallet': wallet})}",
        f"{BIRDEYE_BASE}/v1/wallet/token_list?{urlencode({'wallet': wallet, 'limit': str(limit)})}",
        f"{BIRDEYE_BASE}/defi/v3/wallet/token-list?{urlencode({'wallet': wallet})}",
    ]
    last_err: str | None = None
    for url in endpoints:
        try:
            data = get_json(url, headers=headers, timeout=18.0, retries=1)
            tokens, total_usd = _parse_birdeye_wallet(data)
            if tokens:
                return {
                    "ok": True,
                    "tokens": tokens[:limit],
                    "total_usd": total_usd,
                    "api": url.split("?")[0],
                }
            last_err = "empty portfolio"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            continue
    return {
        "ok": False,
        "error": last_err or "Birdeye wallet failed",
        "tokens": [],
    }


def _parse_birdeye_wallet(data: Any) -> tuple[list[dict[str, Any]], float | None]:
    if not isinstance(data, dict):
        return [], None
    body = data.get("data") if "data" in data else data
    items: list[Any] = []
    total_usd = None
    if isinstance(body, dict):
        items = (
            body.get("items")
            or body.get("tokens")
            or body.get("list")
            or body.get("result")
            or []
        )
        total_usd = _f(
            body.get("totalUsd")
            or body.get("total_usd")
            or body.get("valueUsd")
            or body.get("value")
        )
    elif isinstance(body, list):
        items = body

    tokens: list[dict[str, Any]] = []
    for row in items:
        if not isinstance(row, dict):
            continue
        addr = (
            row.get("address")
            or row.get("mint")
            or row.get("tokenAddress")
            or row.get("token_address")
            or ""
        )
        # nested token info
        info = row.get("token") if isinstance(row.get("token"), dict) else {}
        if not addr:
            addr = info.get("address") or info.get("mint") or ""
        symbol = (
            row.get("symbol")
            or info.get("symbol")
            or row.get("tokenSymbol")
            or "?"
        )
        name = row.get("name") or info.get("name") or ""
        ui = _f(
            row.get("uiAmount")
            or row.get("ui_amount")
            or row.get("balance")
            or row.get("amount")
        )
        val = _f(
            row.get("valueUsd")
            or row.get("value_usd")
            or row.get("usdValue")
            or row.get("value")
        )
        if not addr:
            continue
        tokens.append(
            {
                "address": addr,
                "mint": addr,
                "symbol": symbol,
                "name": name,
                "ui_amount": ui,
                "value_usd": val,
                "provider": "birdeye",
            }
        )
    # sort by USD value when present
    tokens.sort(key=lambda t: float(t.get("value_usd") or 0), reverse=True)
    return tokens, total_usd


def _pumpfun_created_coins(wallet: str, *, limit: int = 20) -> dict[str, Any]:
    params = urlencode(
        {
            "offset": "0",
            "limit": str(min(limit, 50)),
            "includeNsfw": "false",
        }
    )
    last_err: str | None = None
    for base in PUMP_USER_COINS:
        url = base.format(wallet=wallet) + f"?{params}"
        try:
            data = get_json(url, timeout=15.0, retries=0)
            coins = _parse_pump_coins(data)
            if coins is not None:
                return {"ok": True, "coins": coins[:limit], "api": base}
            last_err = "unexpected payload"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            continue
    return {
        "ok": False,
        "error": last_err or "Pump.fun user-coins unavailable",
        "coins": [],
    }


def _parse_pump_coins(data: Any) -> list[dict[str, Any]] | None:
    rows: list[Any]
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = (
            data.get("coins")
            or data.get("data")
            or data.get("items")
            or data.get("results")
            or []
        )
        if not isinstance(rows, list):
            return None
    else:
        return None

    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        mint = row.get("mint") or row.get("address") or row.get("token_address") or ""
        if not mint:
            continue
        out.append(
            {
                "mint": mint,
                "address": mint,
                "name": row.get("name"),
                "symbol": row.get("symbol"),
                "creator": row.get("creator") or row.get("dev"),
                "usd_market_cap": _f(
                    row.get("usd_market_cap")
                    or row.get("market_cap")
                    or row.get("usdMarketCap")
                ),
                "created_timestamp": row.get("created_timestamp")
                or row.get("createdTimestamp"),
                "provider": "pumpfun",
            }
        )
    return out


def _dexscreener_for_mints(mints: list[str]) -> dict[str, Any]:
    if not mints:
        return {"ok": False, "pairs": [], "error": "no mints to query"}
    pairs: list[dict[str, Any]] = []
    seen: set[str] = set()
    errors: list[str] = []
    # Batch via tokens endpoint when possible
    try:
        batch = dx.tokens_by_addresses("solana", mints[:30])
        for p in batch or []:
            if not isinstance(p, dict):
                continue
            key = p.get("pairAddress") or p.get("url") or str(id(p))
            if key in seen:
                continue
            seen.add(str(key))
            pairs.append(p)
    except Exception as exc:  # noqa: BLE001
        errors.append(str(exc))

    # Fill gaps one-by-one for mints missing from batch
    have_bases = {
        ((p.get("baseToken") or {}).get("address") or "").lower() for p in pairs
    }
    for mint in mints[:8]:
        if mint.lower() in have_bases:
            continue
        try:
            for p in dx.pairs_for_token("solana", mint) or []:
                key = p.get("pairAddress") or p.get("url") or mint
                if str(key) in seen:
                    continue
                seen.add(str(key))
                pairs.append(p)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{mint[:8]}…: {exc}")

    # Prefer higher liquidity
    def liq(p: dict[str, Any]) -> float:
        try:
            return float((p.get("liquidity") or {}).get("usd") or 0)
        except (TypeError, ValueError):
            return 0.0

    pairs.sort(key=liq, reverse=True)
    return {
        "ok": bool(pairs),
        "pairs": pairs[:20],
        "error": "; ".join(errors[:3]) if errors and not pairs else None,
    }


def _f(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _fmt_num(v: Any) -> str:
    if v is None:
        return "n/a"
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v)
    if abs(n) >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    if abs(n) >= 1_000:
        return f"{n/1_000:.2f}K"
    if abs(n) >= 1:
        return f"{n:.4f}".rstrip("0").rstrip(".")
    return f"{n:.6g}"


def _fmt_usd(v: Any) -> str:
    if v is None:
        return "n/a"
    try:
        return f"${_fmt_num(float(v))}"
    except (TypeError, ValueError):
        return str(v)
