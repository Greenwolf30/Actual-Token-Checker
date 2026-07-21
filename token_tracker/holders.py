"""
Holder / wallet concentration analysis.

Solana multi-source fusion:
  - Helius / Solana RPC (getTokenLargestAccounts)
  - Rugcheck report (top holders + insiders + risks)
  - Solscan Pro/public token holders (optional SOLSCAN_API_KEY)
  - Birdeye holders + security (optional BIRDEYE_API_KEY)

Bundles still have a separate comprehensive path; Holders tab uses this fusion.
"""

from __future__ import annotations

import json
import re
import ssl
import urllib.request
from typing import Any

from .env_config import has_helius, helius_api_key, load_dotenv, solana_rpc_url
from .http_util import DEFAULT_HEADERS

load_dotenv()


def _ssl_context() -> ssl.SSLContext:
    """Prefer certifi CA bundle (fixes expired/missing system certs on some Windows installs)."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        return ssl.create_default_context()


def _rpc_endpoints() -> list[str]:
    """Ordered RPC list: paid/custom first, then free fallbacks."""
    preferred = solana_rpc_url() or ""
    candidates = [
        preferred,
        "https://solana.leorpc.com/?api_key=FREE",
        "https://solana-rpc.publicnode.com",
        "https://api.mainnet-beta.solana.com",
    ]
    seen: set[str] = set()
    out: list[str] = []
    for u in candidates:
        u = (u or "").strip()
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


# Known program / LP / AMM vault authorities — never treat as "flagged" risk wallets
_KNOWN_OWNERS: dict[str, str] = {
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": "Raydium Authority V4",
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "Raydium CLMM",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca Whirlpool",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter v6",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "Token Program",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "Token-2022 Program",
    "11111111111111111111111111111111": "System Program",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account Program",
    "ComputeBudget111111111111111111111111111111": "Compute Budget",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM v4",
    "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h": "Raydium AMM Authority",
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C": "Raydium CPMM",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": "Meteora DLMM",
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB": "Meteora Pools",
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG": "Meteora DAMM",
    "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA": "Pump.fun AMM (PumpSwap)",
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun Program",
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s": "Metaplex Token Metadata",
}

# Label heuristics for LP / vault / AMM accounts not in the hard map
_LP_LABEL_RE = re.compile(
    r"\b("
    r"lp|liquidity|pool|vault|amm|clmm|dlmm|cpmm|"
    r"raydium|orca|meteora|whirlpool|pumpswap|pump\.fun|pumpfun|"
    r"openbook|serum|phoenix|lifinity|invariant|saber|mercurial|"
    r"market\s*maker|authority|program"
    r")\b",
    re.I,
)


def is_known_lp_or_program(
    wallet: str | None = None,
    *,
    label: str | None = None,
    is_known_program: bool = False,
) -> bool:
    """True for DEX LP vaults, AMM authorities, and system programs — not risk wallets."""
    if is_known_program:
        return True
    w = (wallet or "").strip()
    if w and w in _KNOWN_OWNERS:
        return True
    lab = (label or "").strip()
    if lab and _LP_LABEL_RE.search(lab):
        return True
    return False


def holding_priority_label(pct: float | None) -> str:
    """
    Priority by holding size (non-LP).
      2%–5%   → low   (Alerts: [low priority] subtitle above those wallets)
      5%–9%   → medium
      10%–14% → high
      ≥15%    → critical
    """
    if pct is None:
        return "unknown"
    try:
        p = float(pct)
    except (TypeError, ValueError):
        return "unknown"
    if p < 2:
        return "none"
    if p <= 5:  # 2%–5% band → low priority
        return "low"
    if p < 10:
        return "medium"
    if p < 15:
        return "high"
    return "critical"


def _holder_pct_map(holders: list[dict[str, Any]]) -> dict[str, float | None]:
    """wallet -> pct_supply for quick lookup."""
    out: dict[str, float | None] = {}
    for h in holders or []:
        w = (h.get("wallet") or "").strip()
        if not w:
            continue
        try:
            pct = float(h["pct_supply"]) if h.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        # keep max if duplicate rows
        prev = out.get(w)
        if prev is None or (pct is not None and pct > (prev or -1)):
            out[w] = pct
    return out


def helius_rpc_url_strict() -> str | None:
    """Helius RPC only (no free public RPC fallbacks)."""
    load_dotenv()
    explicit = (solana_rpc_url() or "").strip()
    if explicit and "helius" in explicit.lower():
        return explicit
    key = helius_api_key()
    if key:
        return f"https://mainnet.helius-rpc.com/?api-key={key}"
    return None


def analyze_holders_helius_only(
    chain_id: str | None,
    token_address: str | None,
    *,
    pair_address: str | None = None,
) -> dict[str, Any]:
    """
    Top holders **only** via Helius JSON-RPC (getTokenLargestAccounts).

    Used as the sole input for bundle analysis. No Rugcheck, no free RPCs.
    """
    if not chain_id or not token_address:
        return _empty("Missing chain or token address.")
    chain = chain_id.lower()
    if chain not in {"solana", "sol"}:
        return _empty("Helius bundle holders are Solana-only.")
    url = helius_rpc_url_strict()
    if not url:
        return _empty(
            "Bundles require a Helius API key. Set HELIUS_API_KEY in .env "
            "(or SOLANA_RPC_URL pointing at mainnet.helius-rpc.com)."
        )
    try:
        result = _solana_via_rpc_url(
            token_address, pair_address=pair_address, rpc_url=url
        )
        result["source"] = "helius_rpc"
        result["notes"] = (
            "Holder snapshot from Helius RPC only (getTokenLargestAccounts). "
            "Used for bundle heuristics — no Rugcheck merge on this path."
        )
        meta = dict(result.get("meta") or {})
        meta["rpc_endpoint_host"] = "mainnet.helius-rpc.com"
        meta["bundle_source"] = "helius_only"
        result["meta"] = meta
        return result
    except Exception as exc:  # noqa: BLE001
        return _empty(f"Helius holder scan failed: {exc}")


def analyze_holders(
    chain_id: str | None,
    token_address: str | None,
    *,
    pair_address: str | None = None,
    include_rugwatch: bool = True,
) -> dict[str, Any]:
    if not chain_id or not token_address:
        return _empty("Missing chain or token address.")

    chain = chain_id.lower()
    if chain in {"solana", "sol"}:
        return _solana_holders(
            token_address,
            pair_address=pair_address,
            include_rugwatch=include_rugwatch,
        )

    if chain in {
        "ethereum",
        "eth",
        "base",
        "bsc",
        "arbitrum",
        "polygon",
        "optimism",
        "avalanche",
        "robinhood",  # Robinhood Chain (Arbitrum L2, chain id 4663)
        "rh",
    }:
        explorer = (
            "https://robinhoodchain.blockscout.com/token/"
            if chain in {"robinhood", "rh"}
            else "https://etherscan.io/token/"
            if chain in {"ethereum", "eth"}
            else "https://basescan.org/token/"
            if chain == "base"
            else "https://arbiscan.io/token/"
            if chain in {"arbitrum"}
            else None
        )
        note_bits = [
            "Market / Overview / About work via DexScreener for this chain.",
            "Top-holder fusion (Helius/Rugcheck) is Solana-only right now.",
        ]
        if chain in {"robinhood", "rh"}:
            note_bits.append(
                "Robinhood Chain explorer: https://robinhoodchain.blockscout.com"
            )
        return {
            "ok": False,
            "chain_id": chain,
            "token_address": token_address,
            "error": (
                f"Holder lists for '{chain}' are not wired to an explorer API yet. "
                "Use Overview for market data. "
                + (
                    f"Token page: {explorer}{token_address}"
                    if explorer and token_address
                    else ""
                )
            ),
            "holders": [],
            "summary": {},
            "flags": [],
            "notes": " ".join(note_bits),
            "explorer_url": (
                f"{explorer}{token_address}" if explorer and token_address else None
            ),
        }

    return _empty(f"Holder analysis not implemented for chain '{chain}'.")


def _solana_holders(
    mint: str,
    *,
    pair_address: str | None = None,
    include_rugwatch: bool = True,
) -> dict[str, Any]:
    """
    Multi-source Solana holders:
      Helius/RPC + Rugcheck + Solscan + Birdeye (best-effort each).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from . import holder_sources as hsrc

    rpc_result: dict[str, Any] | None = None
    rug_result: dict[str, Any] | None = None
    solscan_result: dict[str, Any] | None = None
    birdeye_result: dict[str, Any] | None = None
    errors: dict[str, str] = {}
    totals: dict[str, Any] = {}

    def _rpc() -> dict[str, Any]:
        return _solana_via_rpc(mint, pair_address=pair_address)

    def _rug() -> dict[str, Any]:
        return _solana_via_rugcheck(mint, pair_address=pair_address)

    def _solscan() -> dict[str, Any]:
        # Slightly larger page so Solscan can carry the list if Helius/RPC fails
        return hsrc.fetch_solscan_holders(mint, limit=50)

    def _birdeye() -> dict[str, Any]:
        return hsrc.fetch_birdeye_holders(mint, limit=40)

    def _totals() -> dict[str, Any]:
        return hsrc.fetch_holder_totals(mint)

    # Fetch all sources in parallel — Helius/RPC + Rugcheck + Solscan + Birdeye
    # (holder_totals may also hit Pump.fun / DexScreener for counts only)
    jobs = {
        "rpc": _rpc,  # Helius when HELIUS_API_KEY set
        "rugcheck": _rug,
        "solscan": _solscan,
        "birdeye": _birdeye,
        "holder_totals": _totals,
    }
    with ThreadPoolExecutor(max_workers=5) as pool:
        futs = {pool.submit(fn): name for name, fn in jobs.items()}
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                result = fut.result()
            except Exception as exc:  # noqa: BLE001
                errors[name] = str(exc)
                result = {"ok": False, "holders": [], "error": str(exc)}
            if name == "rpc":
                rpc_result = result
            elif name == "rugcheck":
                rug_result = result
            elif name == "solscan":
                solscan_result = result
                if not (result or {}).get("ok"):
                    errors["solscan"] = (result or {}).get("error") or "failed"
            elif name == "birdeye":
                birdeye_result = result
                if not (result or {}).get("ok") and not (result or {}).get("skipped"):
                    errors["birdeye"] = (result or {}).get("error") or "failed"
            elif name == "holder_totals":
                totals = result if isinstance(result, dict) else {}
                if not totals.get("ok") and "holder_totals" not in errors:
                    # soft failure — totals optional
                    pass

    if not totals:
        totals = {"ok": False, "total_wallets": None, "by_source": {}}

    fused = _fuse_holder_sources(
        mint=mint,
        pair_address=pair_address,
        rpc=rpc_result,
        rug=rug_result,
        solscan=solscan_result,
        birdeye=birdeye_result,
        errors=errors,
        holder_totals=totals,
        include_rugwatch=include_rugwatch,
    )
    if fused.get("ok"):
        return fused

    # Fallbacks if fusion empty — prefer Solscan when Helius/RPC failed
    if solscan_result and solscan_result.get("ok") and solscan_result.get("holders"):
        out = dict(solscan_result)
        out["source"] = solscan_result.get("api") or "solscan"
        out["notes"] = (
            (out.get("notes") or "")
            + " Primary list from Solscan (Helius/RPC unavailable or empty)."
        ).strip()
        return out
    if rpc_result and rpc_result.get("ok"):
        return rpc_result
    if rug_result and rug_result.get("ok"):
        return rug_result
    if birdeye_result and birdeye_result.get("ok") and birdeye_result.get("holders"):
        return birdeye_result

    return _empty(
        "Holder scan failed. "
        + " · ".join(f"{k}: {v}" for k, v in errors.items())
        + " Tip: set HELIUS_API_KEY and/or SOLSCAN_API_KEY on the server."
    )


def _fuse_holder_sources(
    *,
    mint: str,
    pair_address: str | None,
    rpc: dict[str, Any] | None,
    rug: dict[str, Any] | None,
    solscan: dict[str, Any] | None,
    birdeye: dict[str, Any] | None,
    errors: dict[str, str],
    holder_totals: dict[str, Any] | None = None,
    include_rugwatch: bool = True,
) -> dict[str, Any]:
    """
    Merge wallets from all providers.

    Prefer Helius/RPC balances when present.
    If Helius/RPC is down or empty, Solscan becomes the primary balance/% source.
    Rugcheck/Birdeye still fill gaps and flags.
    include_rugwatch: when False, skip RugWatch flagged-wallet merge (user checkbox).
    """
    by_wallet: dict[str, dict[str, Any]] = {}
    sources_used: list[str] = []
    rpc_ok = bool(rpc and rpc.get("ok") and rpc.get("holders"))
    solscan_ok = bool(solscan and solscan.get("ok") and solscan.get("holders"))
    # When Helius fails, lean on Solscan for balances and %
    solscan_primary = solscan_ok and not rpc_ok

    def _ingest(rows: list[dict[str, Any]], provider: str, *, prefer_balance: bool = False) -> None:
        for h in rows:
            w = (h.get("wallet") or "").strip()
            if not w:
                continue
            cur = by_wallet.get(w)
            if cur is None:
                by_wallet[w] = {
                    "wallet": w,
                    "token_account": h.get("token_account") or "",
                    "balance": h.get("balance"),
                    "pct_supply": h.get("pct_supply"),
                    "label": h.get("label"),
                    "is_known_program": bool(h.get("is_known_program")),
                    "insider": bool(h.get("insider")),
                    "providers": [provider],
                }
                continue
            # merge
            if provider not in cur["providers"]:
                cur["providers"].append(provider)
            if h.get("insider"):
                cur["insider"] = True
            if h.get("is_known_program"):
                cur["is_known_program"] = True
            if h.get("label") and not cur.get("label"):
                cur["label"] = h.get("label")
            if h.get("token_account") and not cur.get("token_account"):
                cur["token_account"] = h.get("token_account")
            # balances / pct: prefer RPC/Helius, else higher pct
            if prefer_balance and h.get("balance") is not None:
                cur["balance"] = h.get("balance")
            elif cur.get("balance") is None and h.get("balance") is not None:
                cur["balance"] = h.get("balance")
            try:
                new_pct = float(h["pct_supply"]) if h.get("pct_supply") is not None else None
            except (TypeError, ValueError):
                new_pct = None
            try:
                old_pct = float(cur["pct_supply"]) if cur.get("pct_supply") is not None else None
            except (TypeError, ValueError):
                old_pct = None
            if new_pct is not None and (old_pct is None or (prefer_balance and new_pct)):
                if prefer_balance or old_pct is None:
                    cur["pct_supply"] = new_pct
                elif new_pct > old_pct:
                    cur["pct_supply"] = new_pct

    if rpc_ok:
        sources_used.append(rpc.get("source") or "solana_rpc")  # type: ignore[union-attr]
        _ingest(list(rpc.get("holders") or []), "helius_rpc", prefer_balance=True)  # type: ignore[union-attr]
    if solscan_ok:
        # Ingest Solscan early when it is primary so ranks follow Solscan %
        if solscan_primary:
            sources_used.insert(0, "solscan")
        else:
            sources_used.append("solscan")
        _ingest(
            list(solscan.get("holders") or []),  # type: ignore[union-attr]
            "solscan",
            prefer_balance=solscan_primary,
        )
    if rug and rug.get("ok") and rug.get("holders"):
        sources_used.append("rugcheck")
        _ingest(list(rug.get("holders") or []), "rugcheck")
    if birdeye and birdeye.get("ok") and birdeye.get("holders"):
        sources_used.append("birdeye")
        _ingest(list(birdeye.get("holders") or []), "birdeye")

    if not by_wallet:
        return _empty("No holders from Helius/RPC, Rugcheck, Solscan, or Birdeye.")

    # Per-mint Pump.fun bonding curve / PumpSwap pool (not global program IDs)
    pump_lp: dict[str, str] = {}
    try:
        from .pumpfun import fetch_pump_lp_accounts, is_pump_mint

        if is_pump_mint(mint):
            pump_lp = fetch_pump_lp_accounts(mint) or {}
    except Exception:  # noqa: BLE001
        pump_lp = {}

    # Known program / LP labels
    for w, row in by_wallet.items():
        if w in _KNOWN_OWNERS:
            row["is_known_program"] = True
            row["label"] = row.get("label") or _KNOWN_OWNERS[w]
        if pair_address and w == pair_address:
            row["is_known_program"] = True
            row["label"] = row.get("label") or "Liquidity pair"
        if w in pump_lp:
            row["is_known_program"] = True
            # Prefer specific pump LP label when unlabeled or generic
            cur = (row.get("label") or "").strip()
            if not cur or cur.lower() in {"liquidity pair", "unknown"}:
                row["label"] = pump_lp[w]
            elif pump_lp[w].lower() not in cur.lower():
                row["label"] = cur + " · " + pump_lp[w]
        if row.get("insider"):
            lab = row.get("label") or ""
            if "insider" not in lab.lower():
                row["label"] = (lab + " · " if lab else "") + "insider (Rugcheck)"

    # Sort by pct then balance
    def _sort_key(r: dict[str, Any]) -> tuple:
        try:
            pct = float(r.get("pct_supply") or -1)
        except (TypeError, ValueError):
            pct = -1.0
        try:
            bal = float(r.get("balance") or -1)
        except (TypeError, ValueError):
            bal = -1.0
        return (pct, bal)

    ordered = sorted(by_wallet.values(), key=_sort_key, reverse=True)
    for i, row in enumerate(ordered):
        row["rank"] = i + 1

    # owner totals for multi-ATA clusters (from RPC rows primarily)
    owner_totals: dict[str, float] = {}
    for row in ordered:
        w = row["wallet"]
        try:
            bal = float(row.get("balance") or 0)
        except (TypeError, ValueError):
            bal = 0.0
        owner_totals[w] = owner_totals.get(w, 0.0) + bal

    # If RPC had owner_clusters, keep them
    base_extra: dict[str, Any] = {}
    if rug and rug.get("ok"):
        base_extra.update(rug.get("meta") or {})
    if rpc and rpc.get("ok"):
        base_extra.update({k: v for k, v in (rpc.get("meta") or {}).items() if k not in base_extra})
    if birdeye and birdeye.get("security"):
        base_extra["birdeye_security"] = birdeye.get("security")
    if solscan and solscan.get("total_holders") is not None:
        base_extra["solscan_total_holders"] = solscan.get("total_holders")
    if birdeye and birdeye.get("total_holders") is not None:
        base_extra["birdeye_total_holders"] = birdeye.get("total_holders")

    # Total wallets (Pump.fun / Birdeye / DexScreener / Solscan)
    totals = holder_totals or {}
    by_src = dict(totals.get("by_source") or {})
    # Fill Birdeye from holder list total if dedicated totals call missed it
    if by_src.get("birdeye") is None and birdeye and birdeye.get("total_holders") is not None:
        by_src["birdeye"] = birdeye.get("total_holders")
    if by_src.get("birdeye") is None and isinstance(birdeye, dict):
        sec = birdeye.get("security") if isinstance(birdeye.get("security"), dict) else {}
        try:
            from .holder_sources import _int_or_none

            n = _int_or_none(
                sec.get("holder") or sec.get("holderCount") or sec.get("holder_count")
            )
            if n is not None:
                by_src["birdeye"] = n
        except Exception:  # noqa: BLE001
            pass
    # Solscan from totals call or holders list response
    if by_src.get("solscan") is None and solscan and solscan.get("total_holders") is not None:
        by_src["solscan"] = solscan.get("total_holders")
    solscan_total = by_src.get("solscan")

    candidates = [
        n
        for n in (
            by_src.get("birdeye"),
            by_src.get("pumpfun"),
            by_src.get("dexscreener"),
            by_src.get("solscan"),
            solscan_total,
            totals.get("total_wallets"),
        )
        if isinstance(n, int) and n >= 0
    ]
    best_total = max(candidates) if candidates else None

    base_extra["holder_providers"] = sources_used
    base_extra["holder_provider_errors"] = errors
    base_extra["holder_totals"] = {
        "total_wallets": best_total,
        "by_source": {
            "pumpfun": by_src.get("pumpfun"),
            "birdeye": by_src.get("birdeye"),
            "dexscreener": by_src.get("dexscreener"),
            "solscan": by_src.get("solscan"),
        },
        "solscan": solscan_total,
        "sources_detail": totals.get("sources_detail") or {},
        "ok": best_total is not None,
    }

    supply_ui = None
    supply_raw = None
    decimals = 0
    if rpc and rpc.get("ok"):
        sup = rpc.get("supply") or {}
        supply_ui = sup.get("ui_amount")
        supply_raw = sup.get("raw_amount")
        decimals = int(sup.get("decimals") or 0)
    # recompute pct if missing but supply known
    if supply_ui:
        for row in ordered:
            if row.get("pct_supply") is None and row.get("balance") is not None:
                try:
                    row["pct_supply"] = float(row["balance"]) / float(supply_ui) * 100.0
                except (TypeError, ValueError, ZeroDivisionError):
                    pass

    # Keep a larger internal list for bundles; UI shows top 14
    result = _build_result(
        mint=mint,
        holders=ordered[:40],
        owner_totals=owner_totals,
        supply_ui=supply_ui,
        supply_raw=supply_raw,
        decimals=decimals,
        source="+".join(sources_used) or "multi",
        extra_flags=[],
        extra=base_extra,
    )
    summary = dict(result.get("summary") or {})
    summary["total_wallets"] = best_total
    summary["total_wallets_by_source"] = {
        "pumpfun": by_src.get("pumpfun"),
        "birdeye": by_src.get("birdeye"),
        "dexscreener": by_src.get("dexscreener"),
        "solscan": by_src.get("solscan"),
    }
    summary["top_list_size"] = min(14, len(result.get("holders") or []))
    result["summary"] = summary
    result["holder_totals"] = base_extra["holder_totals"]

    # RugWatch flagged wallets (optional — user checkbox on website)
    if include_rugwatch:
        try:
            from .rugwatch_bridge import fetch_rugwatch_flagged

            holder_addrs = [
                (h.get("wallet") or "").strip()
                for h in (result.get("holders") or [])
                if h.get("wallet")
            ]
            # include creator if known
            if base_extra.get("creator"):
                holder_addrs.append(str(base_extra["creator"]))
            rw = fetch_rugwatch_flagged(
                mint, holder_wallets=holder_addrs, min_score=0, limit=500
            )
            # Combined bag % + still/previously holding counts (cumulative on GitHub)
            try:
                stats = collect_flagged_holder_pcts(
                    rw, list(result.get("holders") or [])
                )
                rw = dict(rw)
                rw["flagged_total_pct"] = float(stats.get("total_pct") or 0)
                rw["flagged_with_pct_count"] = int(stats.get("with_pct_count") or 0)
                rw["flagged_shown_count"] = int(stats.get("shown_count") or 0)
                rw["still_holding_count"] = int(stats.get("still_holding_count") or 0)
                rw["previously_holding_scan"] = int(
                    stats.get("previously_holding_count") or 0
                )
                try:
                    from .flagged_hold_store import merge_mint_flagged_hold

                    prev_info = merge_mint_flagged_hold(
                        mint,
                        still_addrs=list(stats.get("still_addrs") or []),
                        prev_addrs=list(stats.get("prev_addrs") or []),
                        push_github=True,
                    )
                    rw["previously_holding_count"] = int(
                        prev_info.get("previously_holding") or 0
                    )
                    rw["ever_held_count"] = int(prev_info.get("ever_held") or 0)
                    rw["previously_holding_added"] = int(
                        prev_info.get("added_previously") or 0
                    )
                    rw["previously_holding_github"] = prev_info.get("github") or {}
                except Exception as store_exc:  # noqa: BLE001
                    rw["previously_holding_count"] = int(
                        stats.get("previously_holding_count") or 0
                    )
                    rw["ever_held_count"] = rw["still_holding_count"] + rw[
                        "previously_holding_count"
                    ]
                    rw["previously_holding_store_error"] = str(store_exc)
            except Exception:  # noqa: BLE001
                rw = dict(rw)
                rw.setdefault("flagged_total_pct", 0.0)
                rw.setdefault("flagged_with_pct_count", 0)
                rw.setdefault("previously_holding_count", 0)
                rw.setdefault("still_holding_count", 0)

            result["rugwatch_flagged"] = rw
            result["flagged_hold_pct"] = float(rw.get("flagged_total_pct") or 0)
            result["flagged_with_pct_count"] = int(
                rw.get("flagged_with_pct_count") or 0
            )
            result["flagged_still_holding"] = int(rw.get("still_holding_count") or 0)
            result["flagged_previously_holding"] = int(
                rw.get("previously_holding_count") or 0
            )
            base_extra["rugwatch_flagged"] = {
                "ok": rw.get("ok"),
                "match_count": rw.get("match_count"),
                "db_wallet_count": rw.get("db_wallet_count"),
                "cloud_wallet_count": rw.get("cloud_wallet_count"),
                "db_found": rw.get("db_found"),
                "flagged_total_pct": rw.get("flagged_total_pct"),
                "flagged_with_pct_count": rw.get("flagged_with_pct_count"),
                "still_holding_count": rw.get("still_holding_count"),
                "previously_holding_count": rw.get("previously_holding_count"),
                "ever_held_count": rw.get("ever_held_count"),
                # never surface local filesystem paths in holder meta
                "error": rw.get("error"),
            }
            if rw.get("ok") and (
                rw.get("match_count") or (rw.get("flagged_with_pct_count") or 0) > 0
            ):
                n = int(rw.get("match_count") or rw.get("flagged_with_pct_count") or 0)
                tot = float(rw.get("flagged_total_pct") or 0)
                flags = list(result.get("flags") or [])
                if tot > 0:
                    flags.insert(
                        0,
                        f"RugWatch: flagged wallets hold {tot:.2f}% of supply "
                        f"({int(rw.get('flagged_with_pct_count') or 0)} wallet(s))",
                    )
                else:
                    flags.insert(
                        0,
                        f"RugWatch: {n} flagged wallet(s) linked to this mint or top holders",
                    )
                result["flags"] = flags
                if tot > 0 and summary.get("concentration_risk") in {
                    "lower",
                    "moderate",
                }:
                    summary["concentration_risk"] = "elevated"
                    result["summary"] = summary
        except Exception as exc:  # noqa: BLE001
            result["rugwatch_flagged"] = {
                "ok": False,
                "error": str(exc),
                "linked_to_mint": [],
                "in_top_holders": [],
                "high_risk_db": [],
            }
            result["flagged_hold_pct"] = 0.0
            result["flagged_with_pct_count"] = 0
    else:
        result["rugwatch_flagged"] = {
            "ok": True,
            "skipped": True,
            "enabled": False,
            "match_count": 0,
            "linked_to_mint": [],
            "in_top_holders": [],
            "high_risk_db": [],
            "all_flagged": [],
            "note": "RugWatch flags off for this lookup (user unchecked).",
        }
        base_extra["rugwatch_flagged"] = {
            "ok": True,
            "skipped": True,
            "enabled": False,
            "match_count": 0,
        }

    primary_note = (
        "Balances prefer Solscan (Helius/RPC unavailable or empty). "
        if solscan_primary
        else "Balances prefer Helius/RPC; Solscan & Birdeye fill gaps. "
    )
    rw_note = (
        "Flagged wallets section uses RugWatch (local + cloud) when enabled. "
        if include_rugwatch
        else "RugWatch flagged wallets skipped for this lookup. "
    )
    result["notes"] = (
        "Multi-source holders: "
        + (", ".join(sources_used) if sources_used else "none")
        + ". "
        + primary_note
        + "Rugcheck adds insiders/risks. "
        + "Total wallet counts from Pump.fun + Birdeye + DexScreener + Solscan when available. "
        + rw_note
        + (result.get("notes") or "")
    ).strip()
    if errors:
        result["notes"] += " Provider issues: " + "; ".join(f"{k}={v}" for k, v in errors.items())
    if solscan_primary:
        result["primary_holder_source"] = "solscan"
    elif rpc_ok:
        result["primary_holder_source"] = "helius_rpc"
    # provider status for UI
    result["provider_status"] = {
        "helius_rpc": bool(rpc and rpc.get("ok")),
        "rugcheck": bool(rug and rug.get("ok")),
        "solscan": bool(solscan and solscan.get("ok")),
        "birdeye": bool(birdeye and birdeye.get("ok")),
        "primary": "solscan" if solscan_primary else ("helius_rpc" if rpc_ok else "mixed"),
        "birdeye_skipped": bool(birdeye and birdeye.get("skipped")),
        "solscan_needs_key": bool(solscan and solscan.get("needs_key")),
        "holder_totals_ok": best_total is not None,
        "rugwatch_ok": bool((result.get("rugwatch_flagged") or {}).get("ok")),
        "errors": errors,
    }
    return result


def _merge_rpc_and_rugcheck(rpc: dict[str, Any], rug: dict[str, Any]) -> dict[str, Any]:
    """Use RPC balances/wallets as base; overlay Rugcheck insider + risk meta."""
    insider_by_wallet: dict[str, bool] = {}
    for h in rug.get("holders") or []:
        w = h.get("wallet") or ""
        if w and h.get("insider"):
            insider_by_wallet[w] = True

    holders = list(rpc.get("holders") or [])
    insider_count = 0
    for h in holders:
        w = h.get("wallet") or ""
        if insider_by_wallet.get(w):
            h["insider"] = True
            label = h.get("label") or ""
            if "insider" not in label.lower():
                h["label"] = (label + " · " if label else "") + "insider (Rugcheck)"
            insider_count += 1

    flags = list(rpc.get("flags") or [])
    if insider_count:
        flags.insert(
            0,
            f"Rugcheck marks {insider_count} top account(s) as insider-related",
        )
    # Drop bland "no flags" if we added real ones
    flags = [f for f in flags if "No strong concentration" not in f] or flags

    meta = dict(rpc.get("meta") or {})
    rug_meta = rug.get("meta") or {}
    for k in (
        "creator",
        "mint_authority",
        "freeze_authority",
        "rugcheck_score",
        "risks",
        "rugged",
        "insider_networks",
        "graph_insiders_detected",
        "known_accounts",
        "lp_lock",
    ):
        if rug_meta.get(k) is not None and (meta.get(k) is None or meta.get(k) in ({}, [])):
            meta[k] = rug_meta[k]

    src = rpc.get("source") or "solana_rpc"
    if has_helius() or src == "helius_rpc":
        combined_source = "helius+rugcheck"
    else:
        combined_source = f"{src}+rugcheck"

    out = dict(rpc)
    out["holders"] = holders
    out["flags"] = flags
    out["meta"] = meta
    out["source"] = combined_source
    out["notes"] = (
        "Top holders from Solana RPC"
        + (" (Helius)" if "helius" in combined_source else "")
        + "; insider/risk notes from Rugcheck when available. "
        "Bundle/sniper detection is heuristic — multi-account same owner + concentration + "
        "insider flags. Not a full graph indexer."
    )
    # Recompute summary risk flags with insider context
    summary = dict(out.get("summary") or {})
    if insider_count and summary.get("concentration_risk") in {"lower", "moderate"}:
        summary["concentration_risk"] = "elevated"
    out["summary"] = summary
    return out


def _empty(msg: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": msg,
        "holders": [],
        "summary": {},
        "flags": [],
        "notes": msg,
    }


def _get_json(url: str, timeout: float = 30.0) -> Any:
    req = urllib.request.Request(
        url,
        headers={**DEFAULT_HEADERS, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _solana_via_rugcheck(mint: str, *, pair_address: str | None = None) -> dict[str, Any]:
    url = f"https://api.rugcheck.xyz/v1/tokens/{mint}/report"
    data = _get_json(url)
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Rugcheck payload")

    top = data.get("topHolders") or []
    if not top:
        raise RuntimeError("Rugcheck returned no topHolders")

    supply_raw = None
    decimals = 0
    try:
        supply_raw = int((data.get("token") or {}).get("supply") or 0)
        decimals = int((data.get("token") or {}).get("decimals") or 0)
    except (TypeError, ValueError):
        pass
    supply_ui = (supply_raw / (10**decimals)) if supply_raw and decimals >= 0 else None

    holders: list[dict[str, Any]] = []
    owner_totals: dict[str, float] = {}
    insider_count = 0

    for i, row in enumerate(top):
        owner = row.get("owner") or row.get("address") or ""
        token_acct = row.get("address") or ""
        ui = row.get("uiAmount")
        if ui is None:
            try:
                ui = float(row.get("amount") or 0) / (10 ** int(row.get("decimals") or decimals or 0))
            except (TypeError, ValueError):
                ui = 0.0
        ui = float(ui or 0)
        pct = row.get("pct")
        try:
            pct = float(pct) if pct is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None and supply_ui and supply_ui > 0:
            pct = ui / supply_ui * 100.0

        label = _KNOWN_OWNERS.get(owner)
        if pair_address and owner == pair_address:
            label = label or "Liquidity pair"
        if row.get("insider"):
            label = (label + " · " if label else "") + "insider (Rugcheck)"
            insider_count += 1

        holders.append(
            {
                "rank": i + 1,
                "token_account": token_acct,
                "wallet": owner,
                "balance": ui,
                "pct_supply": pct,
                "label": label,
                "is_known_program": owner in _KNOWN_OWNERS,
                "insider": bool(row.get("insider")),
            }
        )
        owner_totals[owner] = owner_totals.get(owner, 0.0) + ui

    return _build_result(
        mint=mint,
        holders=holders,
        owner_totals=owner_totals,
        supply_ui=supply_ui,
        supply_raw=supply_raw,
        decimals=decimals,
        source="rugcheck",
        extra_flags=(
            [f"Rugcheck marks {insider_count} top account(s) as insider-related"]
            if insider_count
            else []
        ),
        extra=_rugcheck_meta(data),
    )


def _rugcheck_meta(data: dict[str, Any]) -> dict[str, Any]:
    """Store Rugcheck fields used by Alerts (LP lock, rug signals, risks)."""
    from .alerts import summarize_lp_lock_from_rugcheck

    risks_raw = data.get("risks") or []
    risks_out: list[Any] = []
    for r in risks_raw[:12]:
        if isinstance(r, dict):
            risks_out.append(
                {
                    "name": r.get("name"),
                    "description": r.get("description"),
                    "level": r.get("level") or r.get("severity"),
                    "score": r.get("score"),
                }
            )
        else:
            risks_out.append(str(r))

    return {
        "creator": data.get("creator"),
        "mint_authority": (data.get("token") or {}).get("mintAuthority")
        or data.get("mintAuthority"),
        "freeze_authority": (data.get("token") or {}).get("freezeAuthority")
        or data.get("freezeAuthority"),
        "rugcheck_score": data.get("score") or data.get("score_normalised"),
        "rugged": bool(data.get("rugged")),
        "risks": risks_out,
        "insider_networks": (data.get("insiderNetworks") or [])[:8],
        "graph_insiders_detected": data.get("graphInsidersDetected"),
        "known_accounts": data.get("knownAccounts")
        if isinstance(data.get("knownAccounts"), dict)
        else {},
        "lp_lock": summarize_lp_lock_from_rugcheck(data),
    }


def _rpc(url: str, method: str, params: list[Any]) -> Any:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={**DEFAULT_HEADERS, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25, context=_ssl_context()) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
    if data.get("error"):
        raise RuntimeError(str(data["error"]))
    return data.get("result")


def _rpc_any(method: str, params: list[Any]) -> tuple[Any, str]:
    """Try RPCs in order; return (result, endpoint_used)."""
    last: Exception | None = None
    for url in _rpc_endpoints():
        try:
            return _rpc(url, method, params), url
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"All Solana RPCs failed for {method}: {last}")


def _source_label(rpc_url: str) -> str:
    low = rpc_url.lower()
    if "helius" in low:
        return "helius_rpc"
    return "solana_rpc"


def _solana_via_rpc(mint: str, *, pair_address: str | None = None) -> dict[str, Any]:
    largest, used_url = _rpc_any("getTokenLargestAccounts", [mint])
    supply_res, _ = _rpc_any("getTokenSupply", [mint])
    return _holders_from_largest(
        mint,
        largest=largest,
        supply_res=supply_res,
        pair_address=pair_address,
        used_url=used_url,
    )


def _solana_via_rpc_url(
    mint: str,
    *,
    pair_address: str | None = None,
    rpc_url: str,
) -> dict[str, Any]:
    """RPC path forced to a single endpoint (e.g. Helius only)."""
    largest = _rpc(rpc_url, "getTokenLargestAccounts", [mint])
    supply_res = _rpc(rpc_url, "getTokenSupply", [mint])
    return _holders_from_largest(
        mint,
        largest=largest,
        supply_res=supply_res,
        pair_address=pair_address,
        used_url=rpc_url,
        owners_rpc_url=rpc_url,
    )


def _holders_from_largest(
    mint: str,
    *,
    largest: Any,
    supply_res: Any,
    pair_address: str | None,
    used_url: str,
    owners_rpc_url: str | None = None,
) -> dict[str, Any]:
    value = (largest or {}).get("value") or largest or []
    if not isinstance(value, list) or not value:
        raise RuntimeError("No holder accounts from RPC")

    supply_ui = None
    supply_raw = None
    decimals = 0
    try:
        s = (supply_res or {}).get("value") or {}
        supply_ui = float(s.get("uiAmount") or 0) or None
        supply_raw = int(s.get("amount") or 0) or None
        decimals = int(s.get("decimals") or 0)
    except (TypeError, ValueError):
        pass

    token_accounts = [v.get("address") for v in value if v.get("address")]
    if owners_rpc_url:
        owners = _resolve_owners_url(token_accounts, owners_rpc_url)
    else:
        owners = _resolve_owners(token_accounts)

    holders: list[dict[str, Any]] = []
    owner_totals: dict[str, float] = {}
    for i, row in enumerate(value):
        acct = row.get("address") or ""
        ui = row.get("uiAmount")
        if ui is None:
            try:
                amt = float(row.get("amount") or 0)
                ui = amt / (10 ** int(row.get("decimals") or decimals or 0))
            except (TypeError, ValueError):
                ui = 0.0
        ui = float(ui or 0)
        owner = owners.get(acct) or acct
        label = _KNOWN_OWNERS.get(owner)
        if pair_address and owner == pair_address:
            label = label or "Liquidity pair"
        pct = (ui / supply_ui * 100.0) if supply_ui else None
        holders.append(
            {
                "rank": i + 1,
                "token_account": acct,
                "wallet": owner,
                "balance": ui,
                "pct_supply": pct,
                "label": label,
                "is_known_program": bool(label),
                "insider": False,
            }
        )
        owner_totals[owner] = owner_totals.get(owner, 0.0) + ui

    return _build_result(
        mint=mint,
        holders=holders,
        owner_totals=owner_totals,
        supply_ui=supply_ui,
        supply_raw=supply_raw,
        decimals=decimals,
        source=_source_label(used_url),
        extra={"rpc_endpoint_host": _host_only(used_url)},
    )


def _host_only(url: str) -> str:
    """Avoid leaking api-key query params into reports."""
    try:
        from urllib.parse import urlparse

        p = urlparse(url)
        return p.netloc or "rpc"
    except Exception:  # noqa: BLE001
        return "rpc"


def _resolve_owners(token_accounts: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    if not token_accounts:
        return out
    try:
        result, _ = _rpc_any(
            "getMultipleAccounts",
            [token_accounts, {"encoding": "jsonParsed"}],
        )
    except Exception:  # noqa: BLE001
        return out
    return _owners_from_multiple_accounts(token_accounts, result)


def _resolve_owners_url(token_accounts: list[str], rpc_url: str) -> dict[str, str]:
    if not token_accounts:
        return {}
    try:
        result = _rpc(
            rpc_url,
            "getMultipleAccounts",
            [token_accounts, {"encoding": "jsonParsed"}],
        )
    except Exception:  # noqa: BLE001
        return {}
    return _owners_from_multiple_accounts(token_accounts, result)


def _owners_from_multiple_accounts(
    token_accounts: list[str], result: Any
) -> dict[str, str]:
    out: dict[str, str] = {}
    values = (result or {}).get("value") or []
    for acct, val in zip(token_accounts, values):
        if not val:
            continue
        try:
            owner = val["data"]["parsed"]["info"]["owner"]
            if owner:
                out[acct] = owner
        except (KeyError, TypeError):
            continue
    return out


def _build_result(
    *,
    mint: str,
    holders: list[dict[str, Any]],
    owner_totals: dict[str, float],
    supply_ui: float | None,
    supply_raw: int | None,
    decimals: int,
    source: str,
    extra_flags: list[str] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    multi = {
        w: bal
        for w, bal in owner_totals.items()
        if sum(1 for h in holders if h["wallet"] == w) > 1
    }

    def _pct_sum(items: list[dict[str, Any]], n: int) -> float | None:
        vals = [float(h.get("pct_supply") or 0) for h in items[:n] if h.get("pct_supply") is not None]
        if vals:
            return sum(vals)
        if not supply_ui or supply_ui <= 0:
            return None
        return sum(float(h.get("balance") or 0) for h in items[:n]) / supply_ui * 100.0

    # Tag LP/program wallets so concentration flags ignore them
    for h in holders:
        if is_known_lp_or_program(
            h.get("wallet"),
            label=h.get("label"),
            is_known_program=bool(h.get("is_known_program")),
        ):
            h["is_known_program"] = True
            if not h.get("label") and (h.get("wallet") or "") in _KNOWN_OWNERS:
                h["label"] = _KNOWN_OWNERS[h["wallet"]]

    non_lp = [
        h
        for h in holders
        if not is_known_lp_or_program(
            h.get("wallet"),
            label=h.get("label"),
            is_known_program=bool(h.get("is_known_program")),
        )
    ]
    top1 = _pct_sum(holders, 1)
    top5 = _pct_sum(holders, 5)
    top10 = _pct_sum(holders, 10)
    top1_non_lp = _pct_sum(non_lp, 1)
    top10_non_lp = _pct_sum(non_lp, 10)

    flags: list[str] = list(extra_flags or [])
    # Concentration risk uses non-LP wallets only (LP vaults are not "flagged whales")
    if top1_non_lp is not None and top1_non_lp >= 40:
        flags.append(
            f"High single-wallet concentration: top non-LP holder ~{top1_non_lp:.1f}%"
        )
    if top10_non_lp is not None and top10_non_lp >= 85:
        flags.append(
            f"Top 10 non-LP wallets hold ~{top10_non_lp:.1f}% (very concentrated)"
        )
    elif top10_non_lp is not None and top10_non_lp >= 70:
        flags.append(
            f"Top 10 non-LP wallets hold ~{top10_non_lp:.1f}% (concentrated)"
        )

    # Per-wallet flags with ownership % (exclude known LP / programs)
    for h in non_lp:
        try:
            pct = float(h.get("pct_supply")) if h.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None or pct < 5.0:
            continue
        w = (h.get("wallet") or "").strip()
        if not w:
            continue
        tag = "insider" if h.get("insider") else "large holder"
        flags.append(f"Flagged {tag} owns ~{pct:.2f}%: {w}")

    multi_non_lp = {
        w: bal
        for w, bal in multi.items()
        if not is_known_lp_or_program(w)
    }
    if multi_non_lp:
        flags.append(
            f"Multi-account cluster: {len(multi_non_lp)} non-LP wallet(s) control "
            "multiple large token accounts"
        )
    lp_count = sum(
        1
        for h in holders
        if is_known_lp_or_program(
            h.get("wallet"),
            label=h.get("label"),
            is_known_program=bool(h.get("is_known_program")),
        )
    )
    if lp_count:
        flags.append(
            f"{lp_count} top accounts are known program/LP wallets (excluded from risk flags)"
        )
    if not flags:
        flags.append("No strong concentration red flags from top-holder snapshot alone")

    risk = "elevated"
    # Risk bands prefer non-LP concentration when available
    t1 = top1_non_lp if top1_non_lp is not None else top1
    t10 = top10_non_lp if top10_non_lp is not None else top10
    if (t10 or 0) >= 90 or (t1 or 0) >= 50:
        risk = "high"
    elif (t10 or 0) < 50 and (t1 or 0) < 20:
        risk = "moderate"
    if (t10 or 0) < 35 and (t1 or 0) < 12:
        risk = "lower"

    helius_note = ""
    if "helius" in source:
        helius_note = " Helius RPC used for top-holder accounts."

    return {
        "ok": True,
        "chain_id": "solana",
        "token_address": mint,
        "source": source,
        "supply": {
            "ui_amount": supply_ui,
            "raw_amount": supply_raw,
            "decimals": decimals,
        },
        "holders": holders,
        "owner_clusters": [
            {
                "wallet": w,
                "combined_balance": bal,
                "accounts": sum(1 for h in holders if h["wallet"] == w),
            }
            for w, bal in sorted(multi.items(), key=lambda x: -x[1])
        ],
        "summary": {
            "accounts_returned": len(holders),
            "unique_wallets_in_top": len({h["wallet"] for h in holders}),
            "top1_pct": top1,
            "top5_pct": top5,
            "top10_pct": top10,
            "top1_pct_excluding_known_programs": top1_non_lp,
            "top10_pct_excluding_known_programs": top10_non_lp,
            "concentration_risk": risk,
        },
        "flags": flags,
        "meta": extra or {},
        "notes": (
            "Holder data is a top-wallet snapshot (not every holder)."
            + helius_note
            + " Bundle/sniper detection is heuristic — multi-account same owner + concentration + "
            "Rugcheck insider flags when available."
        ),
    }


def format_holders_text(data: dict[str, Any]) -> str:
    if not data.get("ok"):
        return f"HOLDERS\n  {data.get('error') or data.get('notes') or 'unavailable'}\n"

    lines = [
        "HOLDERS / WALLETS",
        f"  Source: {data.get('source')}",
    ]
    ps = data.get("provider_status") or {}
    if ps:
        lines.append(
            "  Providers: "
            f"Helius/RPC={ps.get('helius_rpc')}  Rugcheck={ps.get('rugcheck')}  "
            f"Solscan={ps.get('solscan')}  Birdeye={ps.get('birdeye')}"
        )
        if ps.get("birdeye_skipped"):
            lines.append("  Birdeye: skipped (set BIRDEYE_API_KEY)")
        if ps.get("solscan_needs_key"):
            lines.append("  Solscan: set SOLSCAN_API_KEY for Pro holders")

    summary = data.get("summary") or {}
    totals = data.get("holder_totals") or (data.get("meta") or {}).get("holder_totals") or {}
    by = summary.get("total_wallets_by_source") or totals.get("by_source") or {}
    total_w = summary.get("total_wallets")
    if total_w is None:
        total_w = totals.get("total_wallets")

    lines.append("")
    lines.append("  ── TOTAL WALLETS ──────────────────────────────")
    lines.append(f"  Total wallets (holders): {_fmt_count(total_w)}")
    lines.append(f"    Pump.fun:     {_fmt_count(by.get('pumpfun'))}")
    lines.append(f"    Birdeye:      {_fmt_count(by.get('birdeye'))}")
    lines.append(
        f"    DexScreener:  {_fmt_count(by.get('dexscreener'))}"
        + (
            "  (no holder field on pairs)"
            if by.get("dexscreener") is None
            else ""
        )
    )
    lines.append(
        f"    Solscan:      {_fmt_count(by.get('solscan'))}"
        + (
            "  (set SOLSCAN_API_KEY)"
            if by.get("solscan") is None
            else ""
        )
    )
    lines.append(
        "  (Best total = highest reported source · list below is top 14 only)"
    )

    lines.append("")
    lines.append(f"  Concentration risk: {summary.get('concentration_risk')}")
    lines.append(
        f"  Top1 {_pct(summary.get('top1_pct'))} · "
        f"Top5 {_pct(summary.get('top5_pct'))} · "
        f"Top10 {_pct(summary.get('top10_pct'))}"
    )
    lines.append(f"  Unique wallets in top set: {summary.get('unique_wallets_in_top')}")
    meta = data.get("meta") or {}

    def _authority_lines(label: str, value: Any) -> list[str]:
        """Format mint/freeze so addresses are clickable (own line + Solscan)."""
        if value is None:
            return [f"  {label}: None"]
        raw = str(value).strip()
        if not raw or raw.lower() in {"none", "null", "n/a"}:
            return [f"  {label}: None"]
        if re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", raw):
            return [
                f"  {label}:",
                f"         {raw}",
                f"         https://solscan.io/account/{raw}",
            ]
        return [f"  {label}: {raw}"]

    if meta.get("mint_authority") is not None or "mint_authority" in meta:
        lines.extend(_authority_lines("Mint authority", meta.get("mint_authority")))
    if meta.get("freeze_authority") is not None or "freeze_authority" in meta:
        lines.extend(_authority_lines("Freeze authority", meta.get("freeze_authority")))
    pct_by_wallet = _holder_pct_map(list(data.get("holders") or []))
    creator = (meta.get("creator") or "").strip()
    if creator:
        c_pct = pct_by_wallet.get(creator)
        # case-insensitive fallback (rare)
        if c_pct is None:
            for w, p in pct_by_wallet.items():
                if w.lower() == creator.lower():
                    c_pct = p
                    break
        # Same layout as top-holder rows so UI treats the wallet as a link
        lines.append("  Creator wallet:")
        lines.append(f"         {creator}")
        if re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", creator):
            lines.append(f"         https://solscan.io/account/{creator}")
        own = _pct(c_pct)
        note = "  (not in top-holder snapshot)" if c_pct is None else ""
        lines.append(f"         owns {own}{note}")
    # Do not display RPC host / local filesystem paths (privacy)
    if meta.get("risks"):
        lines.append(f"  Rugcheck risks: {', '.join(str(r) for r in meta['risks'][:5])}")

    lines.append("")
    lines.append("  Flags (known LP / program wallets excluded):")
    flags_list = list(data.get("flags") or [])
    if flags_list:
        for f in flags_list:
            lines.append(f"    • {f}")
    else:
        lines.append("    Flags will show here if value returns True")
    if data.get("filter_query"):
        lines.append("")
        lines.append(
            f"  Filter: {data.get('filter_matched')}/{data.get('filter_total')} "
            f"match · query={data.get('filter_query')!r}"
        )

    # Preset top list size: 14 (filter mode may show more matches)
    show_n = 40 if data.get("filter_query") else 14
    listed = (data.get("holders") or [])[:show_n]
    lines.append("")
    lines.append(
        f"  Top holders — showing {len(listed)}"
        + (
            f" of {_fmt_count(total_w)} total"
            if total_w is not None
            else " (top snapshot)"
        )
        + " · click wallet → Solscan:"
    )
    for h in listed:
        label = f"  [{h['label']}]" if h.get("label") else ""
        pct = _pct(h.get("pct_supply"))
        pri = holding_priority_label(h.get("pct_supply"))
        pri_s = f" · {pri} priority" if pri in {"low", "medium", "high", "critical"} else ""
        bal = h.get("balance")
        bal_s = f"{bal:,.4f}" if isinstance(bal, (int, float)) else str(bal)
        w = h.get("wallet") or ""
        lines.append(f"    #{h.get('rank')} {bal_s} ({pct}{pri_s}){label}")
        lines.append(f"         {w}")
        if w:
            lines.append(f"         https://solscan.io/account/{w}")

    clusters = data.get("owner_clusters") or []
    lines.append("")
    if clusters:
        # Same pattern as Bundles launch-window: category total + subgroup totals
        cl_rows: list[dict[str, Any]] = []
        for c in clusters:
            if not isinstance(c, dict):
                continue
            w = (c.get("wallet") or "").strip()
            pct = None
            if w and w in pct_by_wallet:
                pct = pct_by_wallet[w]
            elif c.get("combined_balance") is not None and summary.get("total_wallets"):
                # best-effort from balance if supply known later — leave None
                pct = None
            # Try pct from holders map only
            cl_rows.append({"wallet": w, "pct_supply": pct})
        # Prefer combined_balance-derived share if we can match holder rows
        for row in cl_rows:
            w = row.get("wallet") or ""
            if row.get("pct_supply") is None and w:
                row["pct_supply"] = pct_by_wallet.get(w)
        cl_total = 0.0
        cl_n = 0
        has_pct = False
        for row in cl_rows:
            try:
                p = float(row["pct_supply"]) if row.get("pct_supply") is not None else None
            except (TypeError, ValueError):
                p = None
            if p is not None:
                cl_total += p
                has_pct = True
            if row.get("wallet"):
                cl_n += 1
        if cl_total > 100:
            cl_total = 100.0
        total_s = f"{cl_total:.2f}%" if has_pct else "n/a"
        lines.append(
            f"  Multi-account clusters (same wallet, several large ATAs) — "
            f"total {total_s} across {cl_n} wallet(s):"
        )
        for c in clusters[:8]:
            w = (c.get("wallet") or "").strip()
            pct = pct_by_wallet.get(w)
            pct_s = _pct(pct)
            lines.append(
                f"    • {w}  ·  {c.get('accounts') or '?'} ATAs"
                f"  ·  total {pct_s}"
            )
            lines.append(f"         {w}  holds {pct_s}")
            bal = c.get("combined_balance")
            if bal is not None:
                try:
                    lines.append(f"         bal {float(bal):,.4f}")
                except (TypeError, ValueError):
                    lines.append(f"         bal {bal}")
    else:
        lines.append(
            "  Multi-account clusters will show here if value returns True"
        )

    # ── RugWatch flagged wallets ──────────────────────────────────────
    lines.extend(
        _format_rugwatch_flagged_section(
            data.get("rugwatch_flagged") or {},
            holders=list(data.get("holders") or []),
        )
    )

    if data.get("notes"):
        lines.append("")
        lines.append(f"  Note: {data['notes']}")
    return "\n".join(lines) + "\n"


# Minimum remaining supply % to treat a flagged wallet as still holding.
# Below this (or missing from top-holder snapshot) → sold out / left → hide.
_FLAGGED_STILL_HOLD_MIN_PCT = 0.01


def _flagged_notes_sold_out(notes: str | None) -> bool:
    """True if notes clearly say they sold ≥99% of their bag (e.g. Ruggers upload)."""
    t = str(notes or "").lower()
    if not t:
        return False
    if "100.0% sold" in t or "100% sold" in t or "sold 100%" in t:
        return True
    # "99.0% sold" / "≥99%" / "sold ≥99%"
    if "sold ≥99" in t or "sold >=99" in t or "≥99% sold" in t or ">=99% sold" in t:
        return True
    if re.search(r"\b99(?:\.\d+)?%\s*sold\b", t):
        return True
    if re.search(r"\bsold\s+99(?:\.\d+)?%\b", t):
        return True
    return False


def collect_flagged_holder_pcts(
    rw: dict[str, Any] | None,
    holders: list[dict[str, Any]] | None = None,
    *,
    only_current_holders: bool = True,
) -> dict[str, Any]:
    """
    Flagged (non-LP) wallets for this token.

    only_current_holders=True (default): only wallets that STILL hold a known bag
    on this mint (in top-holder snapshot with pct > dust). Sold-out / not listed
    flagged wallets are omitted from Holders + Alerts combined %.

    Returns:
      wallets: [{wallet, pct, hold_priority, rank?, label?, ...}]
      total_pct: sum of current bags
      shown_count / with_pct_count / skipped_lp / skipped_sold
    """
    rw = rw or {}
    holders = list(holders or [])
    pct_by = _holder_pct_map(holders)
    label_by = {
        (h.get("wallet") or "").strip(): h.get("label")
        for h in holders
        if (h.get("wallet") or "").strip()
    }
    rank_by = {
        (h.get("wallet") or "").strip(): h.get("rank")
        for h in holders
        if (h.get("wallet") or "").strip()
    }
    bal_by: dict[str, float | None] = {}
    for h in holders:
        w = (h.get("wallet") or "").strip()
        if not w:
            continue
        try:
            bal_by[w] = float(h["balance"]) if h.get("balance") is not None else None
        except (TypeError, ValueError):
            bal_by[w] = None

    all_flagged = list(rw.get("all_flagged") or [])
    if not all_flagged:
        seen: set[str] = set()
        for group in (
            list(rw.get("linked_to_mint") or []),
            list(rw.get("in_top_holders") or []),
            list(rw.get("high_risk_db") or []),
        ):
            for w in group:
                a = (w.get("address") or "").strip()
                if a and a not in seen:
                    seen.add(a)
                    all_flagged.append(w)

    def _sort_key(w: dict[str, Any]) -> tuple:
        on_mint = 1 if w.get("on_this_mint") else 0
        in_holders = 1 if w.get("in_top_holders") else 0
        score = int(w.get("risk_score") or 0)
        return (-on_mint, -in_holders, -score)

    ordered = sorted(all_flagged, key=_sort_key)
    shown: list[dict[str, Any]] = []
    skipped_lp = 0
    for w in ordered:
        addr = (w.get("address") or "").strip()
        if not addr:
            continue
        lab = w.get("label") or w.get("role") or label_by.get(addr)
        if is_known_lp_or_program(addr, label=str(lab) if lab else None):
            skipped_lp += 1
            continue
        shown.append(w)

    wallets_out: list[dict[str, Any]] = []
    previously_out: list[dict[str, Any]] = []
    still_addrs: list[str] = []
    prev_addrs: list[str] = []
    total_pct = 0.0
    with_pct = 0
    skipped_sold = 0
    for w in shown:
        addr = (w.get("address") or "").strip()
        if not addr:
            continue
        owns = pct_by.get(addr)
        if owns is None:
            for key, p in pct_by.items():
                if key.lower() == addr.lower():
                    owns = p
                    addr = key  # use map key for bal lookup
                    break
        try:
            owns_f = float(owns) if owns is not None else None
        except (TypeError, ValueError):
            owns_f = None

        notes = str(w.get("notes") or w.get("evidence") or "")
        sold_out_notes = _flagged_notes_sold_out(notes)

        # Still holding? Need known bag on this mint above dust threshold.
        still_holds = (
            owns_f is not None
            and owns_f >= _FLAGGED_STILL_HOLD_MIN_PCT
            and not sold_out_notes
        )
        # Dust balance with 0% also counts as gone
        bal = bal_by.get(addr)
        if still_holds and bal is not None and bal <= 0 and (owns_f or 0) <= 0:
            still_holds = False

        row = {
            "wallet": addr,
            "pct": owns_f,
            "hold_priority": holding_priority_label(owns_f),
            "rank": rank_by.get(addr),
            "label": w.get("label") or w.get("role") or label_by.get(addr),
            "risk_score": w.get("risk_score"),
            "times_seen": w.get("times_seen"),
            "on_this_mint": bool(w.get("on_this_mint")),
            "in_top_holders": bool(w.get("in_top_holders")),
            "origin": (w.get("tag") or w.get("origin") or w.get("location") or ""),
            "notes": notes,
            "raw": w,
            "still_holds": still_holds,
        }

        if still_holds:
            still_addrs.append(addr)
            wallets_out.append(row)
            if owns_f is not None and owns_f >= _FLAGGED_STILL_HOLD_MIN_PCT:
                total_pct += owns_f
                with_pct += 1
        else:
            # Sold ≥99% / left list / not in top — count as previously holding
            skipped_sold += 1
            prev_addrs.append(addr)
            previously_out.append(row)
            if not only_current_holders:
                wallets_out.append(row)

    # Prefer largest bags first for alerts / display
    wallets_out.sort(
        key=lambda r: (
            -(float(r["pct"]) if r.get("pct") is not None else -1.0),
            -int(r.get("risk_score") or 0),
        )
    )
    return {
        "wallets": wallets_out,
        "previously_wallets": previously_out,
        "still_addrs": still_addrs,
        "prev_addrs": prev_addrs,
        "total_pct": round(total_pct, 4) if with_pct else 0.0,
        "with_pct_count": with_pct,
        "shown_count": len(wallets_out),
        "skipped_lp": skipped_lp,
        "skipped_sold": skipped_sold,
        "previously_holding_count": skipped_sold,
        "still_holding_count": len(still_addrs),
        "only_current_holders": only_current_holders,
    }


def _format_rugwatch_flagged_section(
    rw: dict[str, Any],
    *,
    holders: list[dict[str, Any]] | None = None,
) -> list[str]:
    """List RugWatch-flagged wallets with ownership %; skip known LP/program wallets."""
    # Compute totals first so the section header can show combined %
    stats = collect_flagged_holder_pcts(rw, holders)
    total_pct = float(stats.get("total_pct") or 0)
    with_pct_n = int(stats.get("with_pct_count") or 0)
    total_s = f"{total_pct:.2f}%" if with_pct_n else "n/a"
    total_pri = holding_priority_label(total_pct if with_pct_n else None)
    total_pri_s = (
        f" · {total_pri} priority"
        if total_pri in {"low", "medium", "high", "critical"}
        else ""
    )

    skipped_sold = int(stats.get("skipped_sold") or 0)
    still_n = int(
        (rw or {}).get("still_holding_count")
        or stats.get("still_holding_count")
        or with_pct_n
        or 0
    )
    prev_n = int(
        (rw or {}).get("previously_holding_count")
        or stats.get("previously_holding_count")
        or 0
    )
    if prev_n < skipped_sold:
        prev_n = skipped_sold
    still_line = (
        f"  Still holding: {still_n}"
        if still_n > 0
        else "  Still holding will show here if value returns True"
    )
    prev_line = (
        f"  Previously holding: {prev_n}"
        if prev_n > 0
        else "  Previously holding will show here if value returns True"
    )
    combined_line = (
        f"  Combined bag: {total_s}{total_pri_s}"
        if with_pct_n > 0 and total_pct > 0
        else "  Combined flagged bag % will show here if value returns True"
    )
    lines: list[str] = [
        "",
        "  ── FLAGGED WALLETS (RugWatch) ──",
        still_line,
        prev_line,
        combined_line,
    ]
    if not rw:
        lines.append("  RugWatch: no data (scan holders to load).")
        return lines
    if rw.get("skipped") or rw.get("enabled") is False:
        lines.append(
            "  RugWatch: off for this lookup (checkbox unchecked on Analyze)."
        )
        lines.append("  Flagged wallets were not loaded.")
        return lines
    if not rw.get("ok"):
        lines.append(f"  RugWatch: unavailable — {rw.get('error') or 'unknown error'}")
        lines.append(
            "  Tip: run RugWatch + Push cloud, set RUGWATCH_DB and/or "
            "RUGWATCH_WALLETS_URL (prefer .../data/wallets_index.json)."
        )
        return lines

    local_n = int(rw.get("db_wallet_count") or 0)
    cloud_n = int(rw.get("cloud_wallet_count") or 0)
    local_shards = int(rw.get("local_shards") or 0)
    cloud_shards = int(rw.get("cloud_shards") or 0)
    lines.append(
        f"  RugWatch local: {local_n} wallets"
        + (f" ({local_shards} DB files)" if local_shards > 1 else "")
        + f"  ·  cloud: {cloud_n}"
        + (f" ({cloud_shards} shards)" if cloud_shards > 1 else "")
        + f"  ·  matches on this mint/top: {rw.get('match_count', 0)}"
    )
    lines.append("  Tags: [local] · [cloud] · [both]")
    lines.append("")

    wallets = list(stats.get("wallets") or [])
    skipped_lp = int(stats.get("skipped_lp") or 0)
    if not wallets:
        lines.append(
            "  Flagged wallets will show here if value returns True"
        )
        return lines

    # Category header like Bundles suspects / launch-window
    lines.append(
        f"  Flagged wallets (still holding) — total {total_s}{total_pri_s} "
        f"across {len(wallets)} wallet(s)"
        + (f" · previously holding {prev_n}" if prev_n else "")
        + (f" · {skipped_lp} LP excluded" if skipped_lp else "")
        + ":"
    )
    lines.append("")

    for i, row in enumerate(wallets[:100], start=1):
        addr = (row.get("wallet") or "").strip()
        if not addr:
            continue
        tags: list[str] = []
        origin = str(row.get("origin") or "").strip()
        if origin in {"local", "cloud", "both", "[local]", "[cloud]", "[both]"}:
            tags.append(origin.strip("[]"))
        if row.get("on_this_mint"):
            tags.append("this mint")
        if row.get("in_top_holders"):
            tags.append("in top holders")
        if row.get("label"):
            tags.append(str(row.get("label")))
        owns_f = row.get("pct")
        try:
            owns_num = float(owns_f) if owns_f is not None else None
        except (TypeError, ValueError):
            owns_num = None
        hold_pri = (row.get("hold_priority") or holding_priority_label(owns_num) or "").strip()
        # Keep priority on its own token so Alerts-style grouping is clear;
        # the % itself is colored by the same Holders/Alerts scheme in the UI.
        if hold_pri in {"low", "medium", "high", "critical"}:
            tags.append(f"{hold_pri} priority")
        tag_s = f"  [{', '.join(tags)}]" if tags else ""
        score = row.get("risk_score")
        seen_n = row.get("times_seen")
        if owns_num is not None:
            owns_s = f"{owns_num:.2f}%"
        else:
            owns_s = "n/a (not in top snapshot)"
        lines.append(
            f"    #{i}  holds {owns_s}  ·  score={score}  seen×{seen_n}{tag_s}"
        )
        # Address alone on its line so desktop link-tagger makes it clickable
        lines.append(f"         {addr}")
        note = str(row.get("notes") or "").strip()
        if note:
            lines.append(f"         {(note[:100])}")

    if len(wallets) > 100:
        lines.append(f"  … and {len(wallets) - 100} more still holding")

    lines.append("")
    if with_pct_n:
        lines.append(
            f"  Combined bag still held: {total_s}"
            + (f" ({total_pri} priority)" if total_pri_s else "")
            + f" · {with_pct_n} wallet(s)"
        )
    return lines


def _pct(v: Any) -> str:
    if v is None:
        return "n/a"
    try:
        return f"{float(v):.2f}%"
    except (TypeError, ValueError):
        return "n/a"


def _fmt_count(v: Any) -> str:
    if v is None:
        return "n/a"
    try:
        return f"{int(v):,}"
    except (TypeError, ValueError):
        return str(v)
