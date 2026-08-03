"""
EVM token holders (Ethereum, Robinhood Chain, and other Moralis-supported chains).

Providers (best-effort, first success wins):
  - Moralis  — ERC-20 owners (ETH / Base / BSC / …; not Robinhood)
  - Etherscan V2 — tokenholderlist (ETH mainnet when ETHERSCAN_API_KEY set)
  - Blockscout — Robinhood Chain holders (BLOCKSCOUT_API_KEY + public explorer)

Env:
  MORALIS_API_KEY
  ETHERSCAN_API_KEY
  BLOCKSCOUT_API_KEY
  ALCHEMY_API_KEY  (reserved / health only — not used for holder lists yet)
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote, urlencode

from .env_config import load_dotenv
from .http_util import DEFAULT_HEADERS, get_json

load_dotenv()

# DexScreener / site chain id → Moralis chain slug (Robinhood not on Moralis)
_MORALIS_CHAIN: dict[str, str] = {
    "ethereum": "eth",
    "eth": "eth",
    "base": "base",
    "bsc": "bsc",
    "arbitrum": "arbitrum",
    "polygon": "polygon",
    "optimism": "optimism",
    "avalanche": "avalanche",
}

# Etherscan V2 chain ids
_ETHERSCAN_CHAIN_ID: dict[str, int] = {
    "ethereum": 1,
    "eth": 1,
    "base": 8453,
    "bsc": 56,
    "arbitrum": 42161,
    "polygon": 137,
    "optimism": 10,
    "avalanche": 43114,
}

_EXPLORER_ACCOUNT: dict[str, str] = {
    "ethereum": "https://etherscan.io/address/",
    "eth": "https://etherscan.io/address/",
    "base": "https://basescan.org/address/",
    "bsc": "https://bscscan.com/address/",
    "arbitrum": "https://arbiscan.io/address/",
    "polygon": "https://polygonscan.com/address/",
    "optimism": "https://optimistic.etherscan.io/address/",
    "avalanche": "https://snowtrace.io/address/",
    "robinhood": "https://robinhoodchain.blockscout.com/address/",
    "rh": "https://robinhoodchain.blockscout.com/address/",
}

_EXPLORER_TOKEN: dict[str, str] = {
    "ethereum": "https://etherscan.io/token/",
    "eth": "https://etherscan.io/token/",
    "base": "https://basescan.org/token/",
    "bsc": "https://bscscan.com/token/",
    "arbitrum": "https://arbiscan.io/token/",
    "polygon": "https://polygonscan.com/token/",
    "optimism": "https://optimistic.etherscan.io/token/",
    "avalanche": "https://snowtrace.io/token/",
    "robinhood": "https://robinhoodchain.blockscout.com/token/",
    "rh": "https://robinhoodchain.blockscout.com/token/",
}


def moralis_api_key() -> str | None:
    load_dotenv()
    k = (os.environ.get("MORALIS_API_KEY") or "").strip()
    return k or None


def etherscan_api_key() -> str | None:
    load_dotenv()
    k = (
        os.environ.get("ETHERSCAN_API_KEY")
        or os.environ.get("ETHERSCAN_KEY")
        or ""
    ).strip()
    return k or None


def blockscout_api_key() -> str | None:
    load_dotenv()
    k = (
        os.environ.get("BLOCKSCOUT_API_KEY")
        or os.environ.get("BLOCKSCOUT_KEY")
        or ""
    ).strip()
    return k or None


def alchemy_api_key() -> str | None:
    load_dotenv()
    k = (os.environ.get("ALCHEMY_API_KEY") or "").strip()
    return k or None


def normalize_evm_chain(chain_id: str | None) -> str:
    c = (chain_id or "").strip().lower()
    if c in {"rh", "robinhood-chain", "robinhoodchain", "4663"}:
        return "robinhood"
    if c in {"eth"}:
        return "ethereum"
    return c


def analyze_evm_holders(
    chain_id: str | None,
    token_address: str | None,
    *,
    pair_address: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """
    Fetch top ERC-20 holders for an EVM chain.

    Ethereum: Moralis → Etherscan
    Robinhood: Blockscout (PRO + public explorer)
    Other Moralis chains: Moralis → Etherscan (when chainid known)
    """
    chain = normalize_evm_chain(chain_id)
    addr = (token_address or "").strip()
    if not chain or not addr:
        return _fail("Missing chain or token address.")
    if not addr.startswith("0x") or len(addr) < 10:
        return _fail(f"Expected 0x… token address for {chain}.")

    errors: list[str] = []
    providers: dict[str, Any] = {
        "moralis": False,
        "etherscan": False,
        "blockscout": False,
        "alchemy_configured": bool(alchemy_api_key()),
    }

    # Robinhood: Blockscout first (Moralis does not list this chain)
    if chain == "robinhood":
        try:
            parsed = _from_blockscout_robinhood(addr, limit=limit)
            if parsed.get("holders"):
                providers["blockscout"] = True
                return _ok_result(
                    chain=chain,
                    token_address=addr,
                    pair_address=pair_address,
                    holders=parsed["holders"],
                    total_holders=parsed.get("total_holders"),
                    source=parsed.get("api") or "blockscout",
                    providers=providers,
                    notes=parsed.get("notes")
                    or "Holders from Blockscout (Robinhood Chain).",
                )
            errors.append(parsed.get("error") or "blockscout: empty")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"blockscout: {exc}")
    else:
        # Moralis
        m_slug = _MORALIS_CHAIN.get(chain)
        if m_slug and moralis_api_key():
            try:
                parsed = _from_moralis(addr, chain_slug=m_slug, limit=limit)
                if parsed.get("holders"):
                    providers["moralis"] = True
                    return _ok_result(
                        chain=chain,
                        token_address=addr,
                        pair_address=pair_address,
                        holders=parsed["holders"],
                        total_holders=parsed.get("total_holders"),
                        source="moralis",
                        providers=providers,
                        notes="Holders from Moralis ERC-20 owners.",
                    )
                errors.append(parsed.get("error") or "moralis: empty")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"moralis: {exc}")
        elif m_slug and not moralis_api_key():
            errors.append("moralis: set MORALIS_API_KEY")

        # Etherscan V2
        es_id = _ETHERSCAN_CHAIN_ID.get(chain)
        if es_id and etherscan_api_key():
            try:
                parsed = _from_etherscan(addr, chain_id=es_id, limit=limit)
                if parsed.get("holders"):
                    providers["etherscan"] = True
                    return _ok_result(
                        chain=chain,
                        token_address=addr,
                        pair_address=pair_address,
                        holders=parsed["holders"],
                        total_holders=parsed.get("total_holders"),
                        source="etherscan_v2",
                        providers=providers,
                        notes="Holders from Etherscan tokenholderlist.",
                    )
                errors.append(parsed.get("error") or "etherscan: empty")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"etherscan: {exc}")
        elif es_id and not etherscan_api_key():
            errors.append("etherscan: set ETHERSCAN_API_KEY")

    tip = _missing_key_tip(chain)
    return {
        "ok": False,
        "chain_id": chain,
        "token_address": addr,
        "error": "; ".join(errors) or f"No holders for {chain}.",
        "holders": [],
        "summary": {},
        "flags": [],
        "notes": tip,
        "provider_status": providers,
        "explorer_url": (_EXPLORER_TOKEN.get(chain) or "") + addr,
        "needs_key": not any(
            [
                moralis_api_key() and chain != "robinhood",
                etherscan_api_key() and chain != "robinhood",
                blockscout_api_key() and chain == "robinhood",
            ]
        ),
    }


def _missing_key_tip(chain: str) -> str:
    if chain == "robinhood":
        return (
            "Robinhood holders need BLOCKSCOUT_API_KEY on the server "
            "(Alchemy alone cannot list token holders)."
        )
    return (
        "Set MORALIS_API_KEY and/or ETHERSCAN_API_KEY on the server for EVM holders."
    )


def _fail(msg: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": msg,
        "holders": [],
        "summary": {},
        "flags": [],
        "notes": msg,
    }


def _ok_result(
    *,
    chain: str,
    token_address: str,
    pair_address: str | None,
    holders: list[dict[str, Any]],
    total_holders: Any,
    source: str,
    providers: dict[str, Any],
    notes: str,
) -> dict[str, Any]:
    rows = list(holders)
    # Mark primary pair as LP when known
    pair = (pair_address or "").strip()
    if pair:
        for h in rows:
            if (h.get("wallet") or "").lower() == pair.lower():
                h["is_known_program"] = True
                h["label"] = h.get("label") or "Liquidity pair"

    top1 = _sum_pct(rows, 1)
    top5 = _sum_pct(rows, 5)
    top10 = _sum_pct(rows, 10)
    risk = "unknown"
    if top10 is not None:
        if top10 >= 85:
            risk = "very_high"
        elif top10 >= 70:
            risk = "high"
        elif top10 >= 50:
            risk = "elevated"
        else:
            risk = "moderate"

    total_n = _int_or_none(total_holders)
    if total_n is None:
        total_n = len(rows)

    return {
        "ok": True,
        "chain_id": chain,
        "token_address": token_address,
        "source": source,
        "holders": rows,
        "owner_clusters": [],
        "summary": {
            "accounts_returned": len(rows),
            "unique_wallets_in_top": len(rows),
            "total_wallets": total_n,
            "holders_on_mint": total_n,
            "top1_pct": top1,
            "top5_pct": top5,
            "top10_pct": top10,
            "top1_pct_excluding_known_programs": top1,
            "top10_pct_excluding_known_programs": top10,
            "concentration_risk": risk,
            "holder_source": source,
            "total_wallets_by_source": {source: total_n},
        },
        "flags": _flags_from_holders(rows),
        "meta": {
            "pair_address": pair_address,
            "explorer_account_base": _EXPLORER_ACCOUNT.get(chain),
            "evm": True,
        },
        "notes": notes,
        "provider_status": {
            **providers,
            "primary": source,
        },
        "explorer_url": (_EXPLORER_TOKEN.get(chain) or "") + token_address,
        "holders_on_mint": total_n,
    }


def _from_moralis(token: str, *, chain_slug: str, limit: int) -> dict[str, Any]:
    key = moralis_api_key()
    if not key:
        return {"holders": [], "error": "MORALIS_API_KEY missing"}
    lim = max(1, min(int(limit or 100), 100))
    url = (
        f"https://deep-index.moralis.io/api/v2.2/erc20/{quote(token)}/owners?"
        + urlencode({"chain": chain_slug, "limit": str(lim), "order": "DESC"})
    )
    data = get_json(
        url,
        headers={
            **DEFAULT_HEADERS,
            "Accept": "application/json",
            "X-API-Key": key,
        },
        timeout=20.0,
        retries=1,
    )
    if not isinstance(data, dict):
        return {"holders": [], "error": "moralis: bad payload"}
    items = data.get("result") or data.get("owners") or []
    if not isinstance(items, list) or not items:
        err = data.get("message") or data.get("error") or "no owners"
        return {"holders": [], "error": f"moralis: {err}"}

    holders: list[dict[str, Any]] = []
    for i, row in enumerate(items[:lim]):
        if not isinstance(row, dict):
            continue
        wallet = (
            row.get("owner_address")
            or row.get("owner")
            or row.get("address")
            or ""
        ).strip()
        if not wallet:
            continue
        bal = _f(row.get("balance_formatted"))
        if bal is None:
            bal = _raw_to_ui(row.get("balance"), row.get("decimals"))
        pct = _f(row.get("percentage_relative_to_total_supply"))
        if pct is not None and pct <= 1.0 and pct > 0:
            # Moralis usually returns 0–100 already; keep as-is if > 1
            pass
        label = (row.get("owner_address_label") or row.get("entity") or "").strip() or None
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": bal,
                "pct_supply": pct,
                "label": label,
                "is_known_program": bool(row.get("is_contract")),
                "insider": False,
                "token_account": "",
                "provider": "moralis",
            }
        )
    return {
        "holders": holders,
        "total_holders": _int_or_none(data.get("total"))
        or _int_or_none(data.get("totalHolders")),
        "api": "moralis_v2.2",
    }


def _from_etherscan(token: str, *, chain_id: int, limit: int) -> dict[str, Any]:
    key = etherscan_api_key()
    if not key:
        return {"holders": [], "error": "ETHERSCAN_API_KEY missing"}
    lim = max(1, min(int(limit or 100), 1000))
    params = urlencode(
        {
            "chainid": str(chain_id),
            "module": "token",
            "action": "tokenholderlist",
            "contractaddress": token,
            "page": "1",
            "offset": str(lim),
            "apikey": key,
        }
    )
    data = get_json(
        f"https://api.etherscan.io/v2/api?{params}",
        headers={**DEFAULT_HEADERS, "Accept": "application/json"},
        timeout=20.0,
        retries=1,
    )
    if not isinstance(data, dict):
        return {"holders": [], "error": "etherscan: bad payload"}
    if str(data.get("status") or "") == "0" and not data.get("result"):
        return {
            "holders": [],
            "error": f"etherscan: {data.get('message') or data.get('result') or 'failed'}",
        }
    items = data.get("result")
    if isinstance(items, str):
        return {"holders": [], "error": f"etherscan: {items}"}
    if not isinstance(items, list) or not items:
        return {"holders": [], "error": "etherscan: empty holders"}

    # Total supply for % (best-effort)
    supply_raw = _etherscan_token_supply(token, chain_id=chain_id, key=key)
    decimals = _etherscan_token_decimals(token, chain_id=chain_id, key=key)

    holders: list[dict[str, Any]] = []
    for i, row in enumerate(items[:lim]):
        if not isinstance(row, dict):
            continue
        wallet = (
            row.get("TokenHolderAddress")
            or row.get("address")
            or row.get("holderAddress")
            or ""
        ).strip()
        if not wallet:
            continue
        qty_raw = row.get("TokenHolderQuantity") or row.get("quantity") or row.get("value")
        bal = _raw_to_ui(qty_raw, decimals)
        pct = None
        if supply_raw and qty_raw is not None:
            try:
                pct = float(qty_raw) / float(supply_raw) * 100.0
            except (TypeError, ValueError, ZeroDivisionError):
                pct = None
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": bal,
                "pct_supply": pct,
                "label": None,
                "is_known_program": False,
                "insider": False,
                "token_account": "",
                "provider": "etherscan",
            }
        )
    return {"holders": holders, "total_holders": None, "api": "etherscan_v2"}


def _etherscan_token_supply(token: str, *, chain_id: int, key: str) -> int | None:
    try:
        params = urlencode(
            {
                "chainid": str(chain_id),
                "module": "stats",
                "action": "tokensupply",
                "contractaddress": token,
                "apikey": key,
            }
        )
        data = get_json(
            f"https://api.etherscan.io/v2/api?{params}",
            timeout=12.0,
            retries=0,
        )
        if isinstance(data, dict) and str(data.get("status")) == "1":
            return int(str(data.get("result") or "0"))
    except Exception:  # noqa: BLE001
        pass
    return None


def _etherscan_token_decimals(token: str, *, chain_id: int, key: str) -> int | None:
    # eth_call via proxy is heavy; default 18 for ERC-20 when unknown
    _ = (token, chain_id, key)
    return 18


def _from_blockscout_robinhood(token: str, *, limit: int) -> dict[str, Any]:
    """Robinhood Chain holders via Blockscout PRO API + public explorer."""
    lim = max(1, min(int(limit or 50), 50))
    key = blockscout_api_key()
    errors: list[str] = []

    # 1) Blockscout PRO multi-chain API (chain_id=4663)
    if key:
        try:
            params = urlencode(
                {
                    "chain_id": "4663",
                    "module": "token",
                    "action": "getTokenHolders",
                    "contractaddress": token,
                    "page": "1",
                    "offset": str(lim),
                    "apikey": key,
                }
            )
            data = get_json(
                f"https://api.blockscout.com/v2/api?{params}",
                headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                timeout=20.0,
                retries=1,
            )
            parsed = _parse_blockscout_holders(data, limit=lim, api="blockscout_pro")
            if parsed.get("holders"):
                parsed["notes"] = "Holders from Blockscout PRO (Robinhood chain_id=4663)."
                return parsed
            errors.append(parsed.get("error") or "blockscout_pro: empty")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"blockscout_pro: {exc}")

        # REST holders
        try:
            url = (
                f"https://api.blockscout.com/4663/api/v2/tokens/"
                f"{quote(token)}/holders"
            )
            if key:
                url += "?" + urlencode({"apikey": key})
            data = get_json(
                url,
                headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                timeout=20.0,
                retries=1,
            )
            parsed = _parse_blockscout_v2_rest(data, limit=lim)
            if parsed.get("holders"):
                parsed["notes"] = "Holders from Blockscout PRO REST (Robinhood)."
                parsed["api"] = "blockscout_pro_rest"
                return parsed
            errors.append(parsed.get("error") or "blockscout_pro_rest: empty")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"blockscout_pro_rest: {exc}")

    # 2) Public Robinhood Blockscout (may work without key)
    try:
        params = urlencode(
            {
                "module": "token",
                "action": "getTokenHolders",
                "contractaddress": token,
                "page": "1",
                "offset": str(lim),
            }
        )
        if key:
            params += "&" + urlencode({"apikey": key})
        data = get_json(
            f"https://robinhoodchain.blockscout.com/api?{params}",
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
            timeout=20.0,
            retries=1,
        )
        parsed = _parse_blockscout_holders(
            data, limit=lim, api="blockscout_robinhood_public"
        )
        if parsed.get("holders"):
            parsed["notes"] = "Holders from robinhoodchain.blockscout.com."
            return parsed
        errors.append(parsed.get("error") or "blockscout_public: empty")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"blockscout_public: {exc}")

    try:
        url = (
            f"https://robinhoodchain.blockscout.com/api/v2/tokens/"
            f"{quote(token)}/holders"
        )
        data = get_json(
            url,
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
            timeout=20.0,
            retries=0,
        )
        parsed = _parse_blockscout_v2_rest(data, limit=lim)
        if parsed.get("holders"):
            parsed["notes"] = "Holders from Robinhood Blockscout REST."
            parsed["api"] = "blockscout_robinhood_rest"
            return parsed
        errors.append(parsed.get("error") or "blockscout_rest: empty")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"blockscout_rest: {exc}")

    return {
        "holders": [],
        "error": "; ".join(errors) or "Blockscout holders unavailable",
    }


def _parse_blockscout_holders(
    data: Any, *, limit: int, api: str
) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {"holders": [], "error": f"{api}: bad payload"}
    # Etherscan-compatible shape
    result = data.get("result")
    if str(data.get("status") or "") == "0" and not result:
        return {
            "holders": [],
            "error": f"{api}: {data.get('message') or data.get('result') or 'failed'}",
        }
    items: list[Any]
    if isinstance(result, list):
        items = result
    elif isinstance(result, dict):
        items = list(result.get("holders") or result.get("items") or [])
    else:
        items = list(data.get("items") or data.get("holders") or [])
    if not items:
        return {"holders": [], "error": f"{api}: empty"}

    holders: list[dict[str, Any]] = []
    for i, row in enumerate(items[:limit]):
        if not isinstance(row, dict):
            continue
        addr_field = row.get("address")
        if isinstance(addr_field, dict):
            wallet = (
                addr_field.get("hash")
                or addr_field.get("hash_with_checksum")
                or ""
            ).strip()
        else:
            wallet = (
                str(addr_field or "")
                or str(row.get("Address") or "")
                or str(row.get("holderAddress") or "")
            ).strip()
        if not wallet:
            continue
        bal = _f(row.get("value"))
        if bal is None:
            bal = _raw_to_ui(row.get("value"), row.get("decimals") or 18)
        pct = _f(row.get("percentage") or row.get("percent"))
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": bal,
                "pct_supply": pct,
                "label": None,
                "is_known_program": False,
                "insider": False,
                "token_account": "",
                "provider": "blockscout",
            }
        )
    return {"holders": holders, "total_holders": None, "api": api}


def _parse_blockscout_v2_rest(data: Any, *, limit: int) -> dict[str, Any]:
    items: list[Any] = []
    if isinstance(data, dict):
        items = list(data.get("items") or data.get("holders") or [])
    elif isinstance(data, list):
        items = data
    if not items:
        return {"holders": [], "error": "blockscout_rest: empty"}

    holders: list[dict[str, Any]] = []
    for i, row in enumerate(items[:limit]):
        if not isinstance(row, dict):
            continue
        addr_obj = row.get("address") or {}
        if isinstance(addr_obj, dict):
            wallet = (addr_obj.get("hash") or addr_obj.get("hash_with_checksum") or "").strip()
        else:
            wallet = str(addr_obj or row.get("address_hash") or "").strip()
        if not wallet:
            continue
        bal = _f(row.get("value"))
        if bal is None:
            bal = _raw_to_ui(row.get("value"), 18)
        pct = _f(row.get("percentage") or row.get("token_share"))
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": bal,
                "pct_supply": pct,
                "label": (addr_obj.get("name") if isinstance(addr_obj, dict) else None),
                "is_known_program": bool(
                    isinstance(addr_obj, dict) and addr_obj.get("is_contract")
                ),
                "insider": False,
                "token_account": "",
                "provider": "blockscout",
            }
        )
    return {"holders": holders, "total_holders": None}


def _flags_from_holders(holders: list[dict[str, Any]]) -> list[str]:
    flags: list[str] = []
    for h in holders:
        if h.get("is_known_program"):
            continue
        try:
            pct = float(h["pct_supply"]) if h.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None or pct < 5.0:
            continue
        w = (h.get("wallet") or "").strip()
        if w:
            flags.append(f"Flagged large holder owns ~{pct:.2f}%: {w}")
    return flags[:12]


def _sum_pct(holders: list[dict[str, Any]], n: int) -> float | None:
    vals = []
    for h in holders[:n]:
        try:
            if h.get("pct_supply") is not None:
                vals.append(float(h["pct_supply"]))
        except (TypeError, ValueError):
            continue
    return round(sum(vals), 4) if vals else None


def _raw_to_ui(raw: Any, decimals: Any) -> float | None:
    try:
        if raw is None:
            return None
        amt = float(raw)
        dec = int(decimals) if decimals is not None else 18
        if dec < 0:
            dec = 18
        # Heuristic: huge integers are base units
        if amt > 1e12 or (isinstance(raw, str) and raw.isdigit() and len(raw) > 12):
            return amt / (10**dec)
        return amt
    except (TypeError, ValueError):
        return None


def _f(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _int_or_none(v: Any) -> int | None:
    try:
        if v is None or v == "":
            return None
        return int(float(v))
    except (TypeError, ValueError):
        return None
