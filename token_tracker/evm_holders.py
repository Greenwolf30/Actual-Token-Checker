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


def _clean_env_key(raw: str | None) -> str | None:
    """Strip quotes / Bearer prefix that break Moralis/Etherscan auth."""
    k = (raw or "").strip()
    if not k:
        return None
    if (k.startswith('"') and k.endswith('"')) or (
        k.startswith("'") and k.endswith("'")
    ):
        k = k[1:-1].strip()
    if k.lower().startswith("bearer "):
        k = k[7:].strip()
    return k or None


def moralis_api_key() -> str | None:
    load_dotenv()
    return _clean_env_key(os.environ.get("MORALIS_API_KEY"))


def etherscan_api_key() -> str | None:
    load_dotenv()
    return _clean_env_key(
        os.environ.get("ETHERSCAN_API_KEY") or os.environ.get("ETHERSCAN_KEY")
    )


def blockscout_api_key() -> str | None:
    load_dotenv()
    return _clean_env_key(
        os.environ.get("BLOCKSCOUT_API_KEY") or os.environ.get("BLOCKSCOUT_KEY")
    )


def alchemy_api_key() -> str | None:
    load_dotenv()
    return _clean_env_key(os.environ.get("ALCHEMY_API_KEY"))


# Public Blockscout explorers (no key) — used when Moralis/Etherscan Pro fail
_BLOCKSCOUT_PUBLIC: dict[str, str] = {
    "ethereum": "https://eth.blockscout.com",
    "eth": "https://eth.blockscout.com",
    "base": "https://base.blockscout.com",
    "optimism": "https://optimism.blockscout.com",
    "polygon": "https://polygon.blockscout.com",
    "arbitrum": "https://arbitrum.blockscout.com",
    "robinhood": "https://robinhoodchain.blockscout.com",
    "rh": "https://robinhoodchain.blockscout.com",
}


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

    Ethereum / Base / …: Moralis → Etherscan → public Blockscout
    Robinhood: Blockscout (PRO + public explorer) first
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

    def _return_blockscout(parsed: dict[str, Any]) -> dict[str, Any]:
        providers["blockscout"] = True
        return _ok_result(
            chain=chain,
            token_address=addr,
            pair_address=pair_address,
            holders=parsed["holders"],
            total_holders=parsed.get("total_holders"),
            source=parsed.get("api") or "blockscout",
            providers=providers,
            notes=parsed.get("notes") or f"Holders from Blockscout ({chain}).",
        )

    # Robinhood: Blockscout first (Moralis does not list this chain)
    if chain == "robinhood":
        try:
            parsed = _from_blockscout_robinhood(addr, limit=limit)
            if parsed.get("holders"):
                return _return_blockscout(parsed)
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
                    rows = _finalize_evm_holder_rows(
                        parsed["holders"],
                        decimals=18,
                        supply_raw=None,
                    )
                    # Prefer Moralis-provided pcts/balances already on rows
                    use_rows = rows or parsed["holders"]
                    return _ok_result(
                        chain=chain,
                        token_address=addr,
                        pair_address=pair_address,
                        holders=use_rows,
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

        # Etherscan V2 (tokenholderlist is often Pro-only)
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

        # Public Blockscout — works without Moralis/Etherscan Pro
        if chain in _BLOCKSCOUT_PUBLIC:
            try:
                parsed = _from_blockscout_public(addr, chain=chain, limit=limit)
                if parsed.get("holders"):
                    return _return_blockscout(parsed)
                errors.append(parsed.get("error") or "blockscout: empty")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"blockscout: {exc}")

    tip = _missing_key_tip(chain, errors)
    has_public = chain in _BLOCKSCOUT_PUBLIC or chain == "robinhood"
    return {
        "ok": False,
        "chain_id": chain,
        "error": "; ".join(errors) or f"No holders for {chain}.",
        "token_address": addr,
        "holders": [],
        "summary": {},
        "flags": [],
        "notes": tip,
        "provider_status": providers,
        "explorer_url": (_EXPLORER_TOKEN.get(chain) or "") + addr,
        "needs_key": not has_public
        and not any(
            [
                moralis_api_key() and chain != "robinhood",
                etherscan_api_key() and chain != "robinhood",
                blockscout_api_key() and chain == "robinhood",
            ]
        ),
    }


def _missing_key_tip(chain: str, errors: list[str] | None = None) -> str:
    err_join = " ".join(errors or []).lower()
    if chain == "robinhood":
        return (
            "Robinhood holders use Blockscout "
            "(public explorer or BLOCKSCOUT_API_KEY)."
        )
    if "invalid format" in err_join or "unauthorized" in err_join:
        return (
            "Moralis key rejected (invalid format). "
            "Paste the raw Web3 API key on Render — no quotes, no 'Bearer '. "
            "Falling back to public Blockscout when available."
        )
    if "api pro" in err_join:
        return (
            "Etherscan tokenholderlist needs API Pro. "
            "Use Moralis or public Blockscout (no Pro required)."
        )
    if chain in _BLOCKSCOUT_PUBLIC:
        return (
            "Holders try Moralis → Etherscan → public Blockscout. "
            "Check MORALIS_API_KEY format if Moralis fails."
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
    non_lp = [h for h in rows if not h.get("is_known_program")]
    top1_ex = _sum_pct(non_lp, 1)
    top10_ex = _sum_pct(non_lp, 10)
    risk = "unknown"
    risk_basis = top10_ex if top10_ex is not None else top10
    if risk_basis is not None:
        if risk_basis >= 85:
            risk = "very_high"
        elif risk_basis >= 70:
            risk = "high"
        elif risk_basis >= 50:
            risk = "elevated"
        else:
            risk = "moderate"

    total_n = _int_or_none(total_holders)
    if total_n is None:
        total_n = len(rows)

    src_key = "blockscout" if "blockscout" in source else source
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
            "top1_pct_excluding_known_programs": top1_ex,
            "top10_pct_excluding_known_programs": top10_ex,
            "concentration_risk": risk,
            "holder_source": source,
            "total_wallets_by_source": {src_key: total_n},
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
    data = None
    last_err = None
    # Prefer X-API-Key; some dashboard keys only work as Bearer
    for headers in (
        {**DEFAULT_HEADERS, "Accept": "application/json", "X-API-Key": key},
        {
            **DEFAULT_HEADERS,
            "Accept": "application/json",
            "Authorization": f"Bearer {key}",
        },
    ):
        try:
            data = get_json(url, headers=headers, timeout=20.0, retries=0)
            if isinstance(data, dict) and (
                data.get("result") or data.get("owners") or data.get("message")
            ):
                # Auth errors often return message without result
                msg = str(data.get("message") or data.get("error") or "").lower()
                if "invalid" in msg or "unauthorized" in msg or "not allowed" in msg:
                    last_err = data.get("message") or data.get("error")
                    data = None
                    continue
                break
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            data = None
            continue

    if not isinstance(data, dict):
        return {
            "holders": [],
            "error": f"moralis: {last_err or 'bad payload'}",
        }
    items = data.get("result") or data.get("owners") or []
    if not isinstance(items, list) or not items:
        err = data.get("message") or data.get("error") or last_err or "no owners"
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
        # Moralis sometimes returns 0–1 fraction
        if pct is not None and 0 < pct <= 1.0:
            pct = pct * 100.0
        label = (row.get("owner_address_label") or row.get("entity") or "").strip() or None
        is_lp = bool(label and _looks_like_evm_lp(label))
        if wallet.lower() in {
            "0x000000000000000000000000000000000000dead",
            "0x0000000000000000000000000000000000000000",
        }:
            label = label or "Burn / dead"
            is_lp = True
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": bal,
                "pct_supply": pct,
                "label": label,
                "is_known_program": is_lp,
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


def _from_blockscout_public(
    token: str, *, chain: str, limit: int
) -> dict[str, Any]:
    """Public Blockscout explorer holders (ETH / Base / …) — no API key required."""
    base = (_BLOCKSCOUT_PUBLIC.get(chain) or "").rstrip("/")
    if not base:
        return {"holders": [], "error": f"no public Blockscout for {chain}"}
    lim = max(1, min(int(limit or 50), 50))
    meta = _blockscout_token_meta(base, token)
    decimals = meta.get("decimals")
    supply_raw = meta.get("total_supply_raw")
    holders_count = meta.get("holders_count")
    errors: list[str] = []

    def _finish(parsed: dict[str, Any], notes: str, api: str) -> dict[str, Any] | None:
        rows = _finalize_evm_holder_rows(
            parsed.get("holders") or [],
            decimals=decimals,
            supply_raw=supply_raw,
        )
        if not rows:
            return None
        out = dict(parsed)
        out["holders"] = rows
        out["notes"] = notes
        out["api"] = api
        if holders_count is not None:
            out["total_holders"] = holders_count
        return out

    try:
        data = get_json(
            f"{base}/api/v2/tokens/{quote(token)}/holders",
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
            timeout=20.0,
            retries=1,
        )
        parsed = _parse_blockscout_v2_rest(data, limit=lim)
        done = _finish(
            parsed,
            f"Holders from public Blockscout ({base}).",
            f"blockscout_{chain}_rest",
        )
        if done:
            return done
        errors.append(parsed.get("error") or "blockscout_rest: empty")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"blockscout_rest: {exc}")

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
        data = get_json(
            f"{base}/api?{params}",
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
            timeout=20.0,
            retries=1,
        )
        parsed = _parse_blockscout_holders(
            data, limit=lim, api=f"blockscout_{chain}_public"
        )
        done = _finish(
            parsed,
            f"Holders from public Blockscout legacy API ({base}).",
            f"blockscout_{chain}_public",
        )
        if done:
            return done
        errors.append(parsed.get("error") or "blockscout_public: empty")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"blockscout_public: {exc}")

    return {
        "holders": [],
        "error": "; ".join(errors) or f"Blockscout holders unavailable ({chain})",
    }


def _from_blockscout_robinhood(token: str, *, limit: int) -> dict[str, Any]:
    """Robinhood Chain holders via Blockscout PRO API + public explorer."""
    lim = max(1, min(int(limit or 50), 50))
    key = blockscout_api_key()
    errors: list[str] = []
    meta = _blockscout_token_meta("https://robinhoodchain.blockscout.com", token)
    decimals = meta.get("decimals")
    supply_raw = meta.get("total_supply_raw")
    holders_count = meta.get("holders_count")

    def _finish(parsed: dict[str, Any], notes: str) -> dict[str, Any] | None:
        rows = _finalize_evm_holder_rows(
            parsed.get("holders") or [],
            decimals=decimals,
            supply_raw=supply_raw,
        )
        if not rows:
            return None
        out = dict(parsed)
        out["holders"] = rows
        out["notes"] = notes
        if holders_count is not None:
            out["total_holders"] = holders_count
        return out

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
            done = _finish(
                parsed,
                "Holders from Blockscout PRO (Robinhood chain_id=4663).",
            )
            if done:
                return done
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
            done = _finish(
                parsed,
                "Holders from Blockscout PRO REST (Robinhood).",
            )
            if done:
                done["api"] = "blockscout_pro_rest"
                return done
            errors.append(parsed.get("error") or "blockscout_pro_rest: empty")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"blockscout_pro_rest: {exc}")

    # 2) Public Robinhood Blockscout — prefer v2 REST (contract names + cleaner rows)
    try:
        url = (
            f"https://robinhoodchain.blockscout.com/api/v2/tokens/"
            f"{quote(token)}/holders"
        )
        data = get_json(
            url,
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
            timeout=20.0,
            retries=1,
        )
        parsed = _parse_blockscout_v2_rest(data, limit=lim)
        done = _finish(parsed, "Holders from Robinhood Blockscout REST.")
        if done:
            done["api"] = "blockscout_robinhood_rest"
            return done
        errors.append(parsed.get("error") or "blockscout_rest: empty")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"blockscout_rest: {exc}")

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
        done = _finish(parsed, "Holders from robinhoodchain.blockscout.com.")
        if done:
            return done
        errors.append(parsed.get("error") or "blockscout_public: empty")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"blockscout_public: {exc}")

    return {
        "holders": [],
        "error": "; ".join(errors) or "Blockscout holders unavailable",
    }


def _blockscout_token_meta(explorer_base: str, token: str) -> dict[str, Any]:
    """decimals / total_supply / holders_count from a Blockscout explorer."""
    out: dict[str, Any] = {
        "decimals": 18,
        "total_supply_raw": None,
        "holders_count": None,
    }
    base = (explorer_base or "").rstrip("/")
    if not base:
        return out
    try:
        data = get_json(
            f"{base}/api/v2/tokens/{quote(token)}",
            headers={**DEFAULT_HEADERS, "Accept": "application/json"},
            timeout=12.0,
            retries=0,
        )
        if not isinstance(data, dict):
            return out
        if data.get("decimals") is not None:
            try:
                out["decimals"] = int(data["decimals"])
            except (TypeError, ValueError):
                pass
        raw = data.get("total_supply")
        if raw is not None and str(raw).strip() != "":
            try:
                out["total_supply_raw"] = int(str(raw).strip())
            except (TypeError, ValueError):
                pass
        if data.get("holders_count") is not None:
            try:
                out["holders_count"] = int(data["holders_count"])
            except (TypeError, ValueError):
                pass
    except Exception:  # noqa: BLE001
        pass
    return out


def _finalize_evm_holder_rows(
    rows: list[dict[str, Any]],
    *,
    decimals: Any,
    supply_raw: int | None,
) -> list[dict[str, Any]]:
    """Normalize balances from base units and fill pct_supply when possible."""
    dec = 18
    try:
        if decimals is not None:
            dec = int(decimals)
    except (TypeError, ValueError):
        dec = 18
    out: list[dict[str, Any]] = []
    for i, h in enumerate(rows):
        if not isinstance(h, dict):
            continue
        row = dict(h)
        raw = row.get("_raw_value")
        # Only convert when we still have base units (_raw_value).
        # Moralis already provides UI balances — do not re-scale those.
        if raw is not None:
            bal = _raw_to_ui(raw, dec)
            if bal is not None:
                row["balance"] = bal
            pct = _f(row.get("pct_supply"))
            if pct is None and supply_raw is not None:
                try:
                    pct = float(int(str(raw).strip())) / float(supply_raw) * 100.0
                except (TypeError, ValueError, ZeroDivisionError):
                    pct = None
            if pct is not None:
                row["pct_supply"] = round(pct, 6)
        row.pop("_raw_value", None)
        # Contract / pool labels → treat as known program (LP-style)
        lab = (row.get("label") or "").strip()
        if lab and _looks_like_evm_lp(lab):
            row["is_known_program"] = True
            if "liquidity" not in lab.lower() and "pool" not in lab.lower():
                row["label"] = f"{lab} (contract)"
        row["rank"] = i + 1
        out.append(row)
    return out


def _looks_like_evm_lp(label: str) -> bool:
    t = (label or "").lower()
    return any(
        k in t
        for k in (
            "uniswap",
            "pool",
            "router",
            "liquidity",
            "pair",
            "vault",
            "aerodrome",
            "pancake",
            "sushiswap",
            "camelot",
        )
    )


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
        label = None
        is_contract = False
        if isinstance(addr_field, dict):
            wallet = (
                addr_field.get("hash")
                or addr_field.get("hash_with_checksum")
                or ""
            ).strip()
            label = addr_field.get("name")
            is_contract = bool(addr_field.get("is_contract"))
        else:
            wallet = (
                str(addr_field or "")
                or str(row.get("Address") or "")
                or str(row.get("holderAddress") or "")
            ).strip()
        if not wallet:
            continue
        raw_val = row.get("value")
        pct = _f(row.get("percentage") or row.get("percent"))
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": None,
                "_raw_value": raw_val,
                "pct_supply": pct,
                "label": label,
                "is_known_program": is_contract,
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
            label = addr_obj.get("name") or _blockscout_tag_label(addr_obj)
        else:
            wallet = str(addr_obj or row.get("address_hash") or "").strip()
            label = None
        if not wallet:
            continue
        # Only LP/pool-named contracts count as known programs (not every contract)
        is_lp = bool(label and _looks_like_evm_lp(str(label)))
        if wallet.lower() in {
            "0x000000000000000000000000000000000000dead",
            "0x0000000000000000000000000000000000000000",
        }:
            label = label or "Burn / dead"
            is_lp = True
        raw_val = row.get("value")
        pct = _f(row.get("percentage") or row.get("token_share"))
        holders.append(
            {
                "rank": i + 1,
                "wallet": wallet,
                "balance": None,
                "_raw_value": raw_val,
                "pct_supply": pct,
                "label": label,
                "is_known_program": is_lp,
                "insider": False,
                "token_account": "",
                "provider": "blockscout",
            }
        )
    return {"holders": holders, "total_holders": None}


def _blockscout_tag_label(addr_obj: dict[str, Any]) -> str | None:
    """Best display name from Blockscout metadata tags (exchanges, etc.)."""
    meta = addr_obj.get("metadata") if isinstance(addr_obj, dict) else None
    tags = (meta or {}).get("tags") if isinstance(meta, dict) else None
    if not isinstance(tags, list):
        return None
    for tag in tags:
        if not isinstance(tag, dict):
            continue
        if (tag.get("tagType") or "").lower() == "name" and tag.get("name"):
            return str(tag["name"]).strip() or None
    for tag in tags:
        if isinstance(tag, dict) and tag.get("name"):
            return str(tag["name"]).strip() or None
    return None


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
        if raw is None or raw == "":
            return None
        dec = int(decimals) if decimals is not None else 18
        if dec < 0:
            dec = 18
        s = str(raw).strip().replace(",", "")
        # Integer base-units (Blockscout / Etherscan quantity strings)
        if s.lstrip("-").isdigit():
            from decimal import Decimal

            return float(Decimal(s) / (Decimal(10) ** dec))
        amt = float(s)
        # Huge floats are almost always still base units
        if abs(amt) > 1e15:
            return amt / (10**dec)
        return amt
    except (TypeError, ValueError, ArithmeticError):
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
