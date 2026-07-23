"""
Extra holder data providers for Solana:
  - Solscan Pro API (token holders)
  - Birdeye (holder list + security extras)

Used by holders.analyze_holders multi-source fusion.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

from .env_config import load_dotenv
from .http_util import DEFAULT_HEADERS, get_json

load_dotenv()

SOLSCAN_PRO = "https://pro-api.solscan.io/v2.0"
SOLSCAN_PUBLIC = "https://api-v2.solscan.io/v2"
BIRDEYE_BASE = "https://public-api.birdeye.so"


def solscan_api_key() -> str | None:
    load_dotenv()
    k = (
        os.environ.get("SOLSCAN_API_KEY")
        or os.environ.get("SOLSCAN_PRO_API_KEY")
        or os.environ.get("SOLSCAN_TOKEN")
        or ""
    ).strip()
    return k or None


def birdeye_api_key() -> str | None:
    load_dotenv()
    k = (os.environ.get("BIRDEYE_API_KEY") or "").strip()
    return k or None


def fetch_solscan_holders(mint: str, *, limit: int = 40) -> dict[str, Any]:
    """
    Solscan token holders.

    Pro:  GET /v2.0/token/holders  (header token: KEY)
    Also tries public v2 if pro fails / no key.

    Used as primary holder list when Helius/RPC fails (see holders._fuse_holder_sources).
    """
    key = solscan_api_key()
    page_size = min(max(limit, 1), 100)
    params = urlencode(
        {
            "address": mint,
            "page": 1,
            "page_size": page_size,
        }
    )
    errors: list[str] = []

    # Pro API (preferred — set SOLSCAN_API_KEY on server)
    if key:
        try:
            data = get_json(
                f"{SOLSCAN_PRO}/token/holders?{params}",
                headers={
                    **DEFAULT_HEADERS,
                    "token": key,
                    "Authorization": key,
                    "Accept": "application/json",
                },
                timeout=18.0,
                retries=2,
            )
            parsed = _parse_solscan_holders(data, mint)
            if parsed.get("holders"):
                parsed["ok"] = True
                parsed["api"] = "solscan_pro_v2"
                parsed["notes"] = "Solscan Pro holders"
                return parsed
            errors.append("pro returned no holders")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"pro: {exc}")

    # Public / alternate (may be rate-limited or blocked)
    for base, label in (
        (f"{SOLSCAN_PUBLIC}/token/holders", "solscan_public_v2"),
        (f"https://api.solscan.io/token/holders", "solscan_legacy"),
    ):
        try:
            q = urlencode({"token": mint, "offset": 0, "size": min(limit, 50)})
            # legacy uses different param names
            if "api.solscan.io" in base and "v2" not in base:
                url = f"{base}?{q}"
            else:
                url = f"{base}?{params}"
            data = get_json(
                url,
                headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                timeout=15.0,
                retries=0,
            )
            parsed = _parse_solscan_holders(data, mint)
            if parsed.get("holders"):
                parsed["ok"] = True
                parsed["api"] = label
                return parsed
            errors.append(f"{label}: empty")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label}: {exc}")

    return {
        "ok": False,
        "error": "; ".join(errors) or "Solscan holders unavailable",
        "holders": [],
        "needs_key": not bool(key),
        "notes": (
            "Set SOLSCAN_API_KEY for Solscan Pro token holders."
            if not key
            else "Solscan request failed with provided key."
        ),
    }


def fetch_birdeye_holders(mint: str, *, limit: int = 40) -> dict[str, Any]:
    """Birdeye holder list + optional security snapshot."""
    key = birdeye_api_key()
    if not key:
        return {
            "ok": False,
            "error": "Set BIRDEYE_API_KEY in .env for Birdeye holders",
            "holders": [],
            "skipped": True,
            "needs_key": True,
        }

    headers = {
        **DEFAULT_HEADERS,
        "X-API-KEY": key,
        "x-chain": "solana",
        "Accept": "application/json",
    }
    out: dict[str, Any] = {"ok": False, "holders": [], "security": None, "api": "birdeye"}

    # Holders
    try:
        data = get_json(
            f"{BIRDEYE_BASE}/defi/v3/token/holder?"
            + urlencode({"address": mint, "offset": 0, "limit": min(limit, 100)}),
            headers=headers,
            timeout=18.0,
            retries=1,
        )
        items = _birdeye_items(data)
        holders = []
        for i, row in enumerate(items[:limit]):
            if not isinstance(row, dict):
                continue
            wallet = (
                row.get("owner")
                or row.get("address")
                or row.get("wallet")
                or row.get("owner_address")
                or ""
            )
            pct = _f(
                row.get("percentage")
                or row.get("percent")
                or row.get("pct")
                or row.get("ui_percentage")
            )
            # Birdeye sometimes returns 0-1 fraction
            if pct is not None and pct <= 1.0:
                pct = pct * 100.0
            bal = _f(
                row.get("ui_amount")
                or row.get("uiAmount")
                or row.get("amount")
                or row.get("balance")
            )
            holders.append(
                {
                    "rank": i + 1,
                    "wallet": wallet,
                    "pct_supply": pct,
                    "balance": bal,
                    "label": None,
                    "is_known_program": False,
                    "insider": False,
                    "token_account": row.get("token_account") or row.get("ata") or "",
                    "provider": "birdeye",
                }
            )
        out["holders"] = [h for h in holders if h.get("wallet")]
        out["ok"] = bool(out["holders"])
        # Total holder count from list response when present
        out["total_holders"] = _extract_total_holders(data)
        if not out["ok"]:
            out["error"] = "Birdeye returned no holder rows"
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)

    # Security (enrichment only) — often includes holder count
    try:
        sec = get_json(
            f"{BIRDEYE_BASE}/defi/token_security?" + urlencode({"address": mint}),
            headers=headers,
            timeout=12.0,
            retries=0,
        )
        out["security"] = (sec or {}).get("data") if isinstance(sec, dict) else sec
        if out.get("total_holders") is None and isinstance(out["security"], dict):
            th = _int_or_none(
                out["security"].get("holder")
                or out["security"].get("holderCount")
                or out["security"].get("holder_count")
                or out["security"].get("totalHolder")
            )
            if th is not None:
                out["total_holders"] = th
    except Exception as exc:  # noqa: BLE001
        out["security_error"] = str(exc)

    return out


def fetch_holder_totals(mint: str) -> dict[str, Any]:
    """
    Total wallet/holder counts from Pump.fun, Birdeye, DexScreener, and Solscan.

    Returns per-source counts plus a best-effort ``total_wallets`` (max of
    reported totals — not a sum, since sources describe the same mint).
    """
    mint = (mint or "").strip()
    out: dict[str, Any] = {
        "ok": False,
        "mint": mint,
        "total_wallets": None,
        "by_source": {
            "pumpfun": None,
            "birdeye": None,
            "dexscreener": None,
            "solscan": None,
        },
        "sources_detail": {},
        "errors": [],
    }
    if not mint:
        out["errors"].append("missing mint")
        return out

    # ── Birdeye ───────────────────────────────────────────────────────
    bird_n, bird_detail = _birdeye_total_holders(mint)
    out["by_source"]["birdeye"] = bird_n
    out["sources_detail"]["birdeye"] = bird_detail
    if bird_detail.get("error") and not bird_detail.get("skipped"):
        out["errors"].append(f"birdeye: {bird_detail['error']}")

    # ── Pump.fun ──────────────────────────────────────────────────────
    pump_n, pump_detail = _pumpfun_total_holders(mint)
    out["by_source"]["pumpfun"] = pump_n
    out["sources_detail"]["pumpfun"] = pump_detail
    if pump_detail.get("error"):
        out["errors"].append(f"pumpfun: {pump_detail['error']}")

    # ── DexScreener ───────────────────────────────────────────────────
    dex_n, dex_detail = _dexscreener_total_holders(mint)
    out["by_source"]["dexscreener"] = dex_n
    out["sources_detail"]["dexscreener"] = dex_detail
    if dex_detail.get("error"):
        out["errors"].append(f"dexscreener: {dex_detail['error']}")

    # ── Solscan ───────────────────────────────────────────────────────
    sol_n, sol_detail = _solscan_total_holders(mint)
    out["by_source"]["solscan"] = sol_n
    out["sources_detail"]["solscan"] = sol_detail
    if sol_detail.get("error") and not sol_detail.get("skipped"):
        out["errors"].append(f"solscan: {sol_detail['error']}")

    counts = [
        n
        for n in (bird_n, pump_n, dex_n, sol_n)
        if isinstance(n, int) and n >= 0
    ]
    if counts:
        # Prefer highest reported total (sources can lag / undercount)
        out["total_wallets"] = max(counts)
        out["ok"] = True
    return out


def _solscan_total_holders(mint: str) -> tuple[int | None, dict[str, Any]]:
    """Total holders via Solscan Pro/public holders endpoints (total field)."""
    key = solscan_api_key()
    detail: dict[str, Any] = {"ok": False, "needs_key": not bool(key)}
    params = urlencode({"address": mint, "page": 1, "page_size": 1})
    errors: list[str] = []

    if key:
        try:
            data = get_json(
                f"{SOLSCAN_PRO}/token/holders?{params}",
                headers={
                    **DEFAULT_HEADERS,
                    "token": key,
                    "Authorization": key,
                    "Accept": "application/json",
                },
                timeout=15.0,
                retries=1,
            )
            n = _extract_total_holders(data)
            if n is None:
                # parse via holders helper structure
                parsed = _parse_solscan_holders(data, mint)
                n = _int_or_none(parsed.get("total_holders"))
            if n is not None:
                detail.update({"ok": True, "api": "solscan_pro_v2", "total": n})
                return n, detail
            errors.append("pro: no total")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"pro: {exc}")

        # Token meta sometimes includes holder count
        try:
            meta = get_json(
                f"{SOLSCAN_PRO}/token/meta?{urlencode({'address': mint})}",
                headers={
                    **DEFAULT_HEADERS,
                    "token": key,
                    "Authorization": key,
                    "Accept": "application/json",
                },
                timeout=12.0,
                retries=0,
            )
            d = (meta or {}).get("data") if isinstance(meta, dict) else None
            if isinstance(d, dict):
                n = _int_or_none(
                    d.get("holder")
                    or d.get("holders")
                    or d.get("holder_count")
                    or d.get("holderCount")
                    or d.get("total_holder")
                )
                if n is not None:
                    detail.update({"ok": True, "api": "solscan_pro_meta", "total": n})
                    return n, detail
        except Exception as exc:  # noqa: BLE001
            errors.append(f"meta: {exc}")

    # Public / legacy
    for url, label in (
        (f"{SOLSCAN_PUBLIC}/token/holders?{params}", "solscan_public_v2"),
        (
            f"https://api.solscan.io/token/holders?"
            + urlencode({"token": mint, "offset": 0, "size": 1}),
            "solscan_legacy",
        ),
    ):
        try:
            data = get_json(
                url,
                headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                timeout=12.0,
                retries=0,
            )
            n = _extract_total_holders(data)
            if n is None:
                parsed = _parse_solscan_holders(data, mint)
                n = _int_or_none(parsed.get("total_holders"))
            if n is not None:
                detail.update({"ok": True, "api": label, "total": n})
                return n, detail
            errors.append(f"{label}: no total")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label}: {exc}")

    if not key:
        detail["skipped"] = True
        detail["error"] = "Set SOLSCAN_API_KEY for Solscan total holders"
    else:
        detail["error"] = "; ".join(errors) or "Solscan total unavailable"
    return None, detail


def _birdeye_total_holders(mint: str) -> tuple[int | None, dict[str, Any]]:
    key = birdeye_api_key()
    if not key:
        return None, {
            "ok": False,
            "skipped": True,
            "error": "Set BIRDEYE_API_KEY for total holders",
        }
    headers = {
        **DEFAULT_HEADERS,
        "X-API-KEY": key,
        "x-chain": "solana",
        "Accept": "application/json",
    }
    detail: dict[str, Any] = {"ok": False}
    # 1) token overview
    try:
        data = get_json(
            f"{BIRDEYE_BASE}/defi/token_overview?" + urlencode({"address": mint}),
            headers=headers,
            timeout=15.0,
            retries=1,
        )
        d = (data or {}).get("data") if isinstance(data, dict) else None
        if isinstance(d, dict):
            # Only true holder totals (not uniqueWallet24h trading activity)
            n = _int_or_none(
                d.get("holder") or d.get("holderCount") or d.get("holders")
            )
            if n is not None:
                detail.update({"ok": True, "api": "token_overview", "total": n})
                return n, detail
    except Exception as exc:  # noqa: BLE001
        detail["overview_error"] = str(exc)

    # 2) holder list total field
    try:
        data = get_json(
            f"{BIRDEYE_BASE}/defi/v3/token/holder?"
            + urlencode({"address": mint, "offset": 0, "limit": 1}),
            headers=headers,
            timeout=15.0,
            retries=1,
        )
        n = _extract_total_holders(data)
        if n is not None:
            detail.update({"ok": True, "api": "token_holder", "total": n})
            return n, detail
    except Exception as exc:  # noqa: BLE001
        detail["holder_list_error"] = str(exc)

    # 3) security
    try:
        data = get_json(
            f"{BIRDEYE_BASE}/defi/token_security?" + urlencode({"address": mint}),
            headers=headers,
            timeout=12.0,
            retries=0,
        )
        d = (data or {}).get("data") if isinstance(data, dict) else None
        if isinstance(d, dict):
            n = _int_or_none(
                d.get("holder") or d.get("holderCount") or d.get("holder_count")
            )
            if n is not None:
                detail.update({"ok": True, "api": "token_security", "total": n})
                return n, detail
    except Exception as exc:  # noqa: BLE001
        detail["security_error"] = str(exc)

    detail["error"] = detail.get("overview_error") or detail.get("holder_list_error") or "no total"
    return None, detail


def _pumpfun_total_holders(mint: str) -> tuple[int | None, dict[str, Any]]:
    detail: dict[str, Any] = {"ok": False}
    urls = [
        f"https://frontend-api.pump.fun/coins/{mint}",
        f"https://frontend-api-v3.pump.fun/coins/{mint}",
    ]
    last_err: str | None = None
    for url in urls:
        try:
            data = get_json(url, timeout=12.0, retries=0)
            if not isinstance(data, dict):
                continue
            n = _int_or_none(
                data.get("holder_count")
                or data.get("holderCount")
                or data.get("holders")
                or data.get("num_holders")
                or data.get("total_holders")
            )
            # Sometimes nested
            if n is None and isinstance(data.get("coin"), dict):
                c = data["coin"]
                n = _int_or_none(
                    c.get("holder_count")
                    or c.get("holderCount")
                    or c.get("holders")
                )
            if n is not None:
                detail.update(
                    {
                        "ok": True,
                        "api": url.split("/")[2],
                        "total": n,
                        "symbol": data.get("symbol"),
                    }
                )
                return n, detail
            last_err = "coin found but no holder_count field"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            continue
    detail["error"] = last_err or "Pump.fun coin meta unavailable"
    return None, detail


def _dexscreener_total_holders(mint: str) -> tuple[int | None, dict[str, Any]]:
    """
    DexScreener public pair payload usually has no full holder count.
    We still query pairs and extract any holder* field if present; otherwise
    report unavailable (honest) rather than inventing a number.
    """
    detail: dict[str, Any] = {"ok": False, "api": "dexscreener"}
    try:
        from . import dexscreener as dx

        pairs = dx.pairs_for_token("solana", mint) or []
        if not pairs:
            try:
                pairs = [
                    p
                    for p in (dx.search_pairs(mint) or [])
                    if ((p.get("baseToken") or {}).get("address") or "").lower()
                    == mint.lower()
                ]
            except Exception:  # noqa: BLE001
                pairs = []
        detail["pairs"] = len(pairs)
        for p in pairs:
            if not isinstance(p, dict):
                continue
            # Rare / future fields
            for key in (
                "holders",
                "holderCount",
                "holder_count",
                "totalHolders",
            ):
                n = _int_or_none(p.get(key))
                if n is not None:
                    detail.update({"ok": True, "total": n, "field": key})
                    return n, detail
            info = p.get("info") if isinstance(p.get("info"), dict) else {}
            n = _int_or_none(
                info.get("holders")
                or info.get("holderCount")
                or info.get("holder_count")
            )
            if n is not None:
                detail.update({"ok": True, "total": n, "field": "info.holders"})
                return n, detail
        # No total — leave null; UI shows n/a for DexScreener
        detail["note"] = (
            "DexScreener pairs have no total-holder field; "
            f"{len(pairs)} market pair(s) found"
        )
        return None, detail
    except Exception as exc:  # noqa: BLE001
        detail["error"] = str(exc)
        return None, detail


def _extract_total_holders(data: Any) -> int | None:
    if not isinstance(data, dict):
        return None
    for root in (data, data.get("data") if isinstance(data.get("data"), dict) else None):
        if not isinstance(root, dict):
            continue
        n = _int_or_none(
            root.get("total")
            or root.get("totalHolders")
            or root.get("total_holders")
            or root.get("holder")
            or root.get("holderCount")
            or root.get("holdersCount")
            or root.get("count")
        )
        if n is not None:
            return n
        items = root.get("items") or root.get("list") or root.get("holders")
        if isinstance(items, list) and root.get("total") is None:
            # only use list length if API claims it's complete (rare)
            pass
    return None


def _int_or_none(v: Any) -> int | None:
    try:
        if v is None or v == "":
            return None
        n = int(float(v))
        if n < 0:
            return None
        return n
    except (TypeError, ValueError):
        return None


def _parse_solscan_holders(data: Any, mint: str) -> dict[str, Any]:
    items: list[Any] = []
    total = None
    if isinstance(data, dict):
        # v2 pro shapes
        d = data.get("data") if "data" in data else data
        if isinstance(d, dict):
            items = (
                d.get("items")
                or d.get("result")
                or d.get("list")
                or d.get("holders")
                or []
            )
            total = d.get("total") or d.get("totalCount")
            # amount sometimes nested
        elif isinstance(d, list):
            items = d
        if not items and isinstance(data.get("result"), list):
            items = data["result"]
    elif isinstance(data, list):
        items = data

    holders = []
    for i, row in enumerate(items[:50]):
        if not isinstance(row, dict):
            continue
        wallet = (
            row.get("owner")
            or row.get("address")
            or row.get("ownerAddress")
            or row.get("wallet")
            or ""
        )
        # Solscan often: amount, decimals, owner
        bal = _f(row.get("amount") or row.get("uiAmount") or row.get("balance"))
        decimals = row.get("decimals")
        if bal is not None and decimals is not None and bal > 1e6:
            try:
                bal = bal / (10 ** int(decimals))
            except (TypeError, ValueError):
                pass
        pct = _f(row.get("percentage") or row.get("percent") or row.get("pct"))
        if pct is not None and pct <= 1.0:
            pct = pct * 100.0
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "pct_supply": pct,
                "balance": bal,
                "label": None,
                "is_known_program": False,
                "insider": False,
                "token_account": row.get("token_account")
                or row.get("tokenAccount")
                or row.get("address")
                or "",
                "provider": "solscan",
            }
        )

    return {
        "holders": [h for h in holders if h.get("wallet")],
        "total_holders": total,
        "mint": mint,
    }


def _birdeye_items(data: Any) -> list[Any]:
    if not isinstance(data, dict):
        return list(data) if isinstance(data, list) else []
    d = data.get("data") if "data" in data else data
    if isinstance(d, dict):
        return list(d.get("items") or d.get("list") or d.get("holders") or [])
    if isinstance(d, list):
        return d
    return []


def _f(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None
