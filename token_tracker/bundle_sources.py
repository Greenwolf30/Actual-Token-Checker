"""
Multi-source Solana bundle intelligence.

Combines:
  1) Helius RPC — top holders (getTokenLargestAccounts) + early mint activity
  2) Rugcheck — top holders, insiders, risks, LP notes
  3) Birdeye — security, top traders, holders, holder-profile tags (needs BIRDEYE_API_KEY)
  4) Jito-style signals — same-slot multi-wallet early buys (MEV/atomic snipes)
     via Helius enhanced tx history (Jito block-engine API is for *sending* bundles,
     not querying historical sniper sets on a mint)

Env:
  HELIUS_API_KEY          required for Helius + Jito-style path
  BIRDEYE_API_KEY         optional; unlocks Birdeye layers
  # JITO_BLOCK_ENGINE_URL optional override for tip/status probes
"""

from __future__ import annotations

import json
import os
import ssl
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlencode

from .env_config import has_helius, helius_api_key, load_dotenv, solana_rpc_url
from .http_util import DEFAULT_HEADERS, get_json

load_dotenv()

BIRDEYE_BASE = "https://public-api.birdeye.so"
JITO_BUNDLES = "https://mainnet.block-engine.jito.wtf/api/v1/bundles"


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001
        return ssl.create_default_context()


def birdeye_api_key() -> str | None:
    load_dotenv()
    k = (os.environ.get("BIRDEYE_API_KEY") or "").strip()
    return k or None


def helius_url() -> str | None:
    load_dotenv()
    u = (solana_rpc_url() or "").strip()
    if u and "helius" in u.lower():
        return u
    key = helius_api_key()
    if key:
        return f"https://mainnet.helius-rpc.com/?api-key={key}"
    return None


def fetch_all_bundle_sources(
    mint: str,
    *,
    pair_address: str | None = None,
) -> dict[str, Any]:
    """Fetch raw layers from each provider in parallel (best-effort per source)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    out: dict[str, Any] = {
        "mint": mint,
        "fetched_at": time.time(),
        "sources": {},
    }

    def _helius_layer() -> dict[str, Any]:
        from . import holders as hold

        h = hold.analyze_holders_helius_only(
            "solana", mint, pair_address=pair_address
        )
        return {
            "helius": {
                "ok": bool(h.get("ok")),
                "error": h.get("error"),
                "holders": h.get("holders") or [],
                "owner_clusters": h.get("owner_clusters") or [],
                "summary": h.get("summary") or {},
                "meta": h.get("meta") or {},
                "source": h.get("source"),
            },
            # Same-slot multi-buy (Jito-style) — after Helius RPC is warm
            "jito_style": _helius_same_slot_snipes(mint),
        }

    def _rug() -> dict[str, Any]:
        return _fetch_rugcheck(mint)

    def _bird() -> dict[str, Any]:
        return _fetch_birdeye(mint)

    def _jito_eng() -> dict[str, Any]:
        return _jito_engine_probe()

    jobs = {
        "helius_layer": _helius_layer,
        "rugcheck": _rug,
        "birdeye": _bird,
        "jito_engine": _jito_eng,
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = {pool.submit(fn): name for name, fn in jobs.items()}
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                result = fut.result()
            except Exception as exc:  # noqa: BLE001
                if name == "helius_layer":
                    out["sources"]["helius"] = {
                        "ok": False,
                        "error": str(exc),
                        "holders": [],
                    }
                    out["sources"]["jito_style"] = {"ok": False, "error": str(exc)}
                else:
                    out["sources"][name] = {"ok": False, "error": str(exc)}
                continue
            if name == "helius_layer" and isinstance(result, dict):
                out["sources"]["helius"] = result.get("helius") or {
                    "ok": False,
                    "holders": [],
                }
                out["sources"]["jito_style"] = result.get("jito_style") or {
                    "ok": False,
                }
            else:
                out["sources"][name] = result

    return out


def _rpc(url: str, method: str, params: list[Any] | dict[str, Any]) -> Any:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": "leonidas-bundle", "method": method, "params": params}
    ).encode()
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


def _helius_same_slot_snipes(
    mint: str,
    *,
    max_sigs: int = 120,
    max_tx_fetch: int = 60,
) -> dict[str, Any]:
    """
    Detect early multi-wallet same-slot activity (atomic / Jito-style snipes).

    Walks mint signatures toward *oldest* activity (launch window), not only
    the latest trades. Jito public API does not return historical snipers.
    """
    url = helius_url()
    if not url:
        return {
            "ok": False,
            "error": "Helius required for Jito-style same-slot scan",
            "method": "helius_enhanced_txs_same_slot",
        }

    # Paginate toward older signatures (launch is usually oldest activity)
    all_sigs: list[dict[str, Any]] = []
    before: str | None = None
    pages = 0
    try:
        while len(all_sigs) < max_sigs and pages < 4:
            params: dict[str, Any] = {"limit": min(50, max_sigs - len(all_sigs))}
            if before:
                params["before"] = before
            batch = _rpc(url, "getSignaturesForAddress", [mint, params])
            pages += 1
            if not isinstance(batch, list) or not batch:
                break
            all_sigs.extend([b for b in batch if isinstance(b, dict)])
            last_sig = batch[-1].get("signature") if batch else None
            if not last_sig or last_sig == before:
                break
            before = str(last_sig)
            if len(batch) < 20:
                break
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"getSignaturesForAddress failed: {exc}",
            "method": "helius_enhanced_txs_same_slot",
        }

    if not all_sigs:
        return {
            "ok": True,
            "method": "helius_enhanced_txs_same_slot",
            "same_slot_groups": [],
            "early_buyers": [],
            "notes": "No signatures for mint.",
        }

    # Prefer oldest portion of what we collected (launch window)
    # all_sigs is newest-first from RPC; take the tail as older activity
    older = list(reversed(all_sigs[-max_tx_fetch:]))
    by_slot: dict[int, list[dict[str, Any]]] = {}
    first_buy_ts: dict[str, int] = {}
    buyer_hits: dict[str, int] = {}

    for row in older:
        sig = row.get("signature")
        if not sig:
            continue
        try:
            tx = _rpc(
                url,
                "getTransaction",
                [
                    sig,
                    {
                        "encoding": "jsonParsed",
                        "maxSupportedTransactionVersion": 0,
                    },
                ],
            )
        except Exception:  # noqa: BLE001
            continue
        if not tx:
            continue
        slot = tx.get("slot")
        if slot is None:
            continue
        block_time = tx.get("blockTime")
        buyers = _extract_buyers_from_tx(tx, mint)
        if not buyers:
            continue
        by_slot.setdefault(int(slot), []).append(
            {
                "signature": sig,
                "buyers": buyers,
                "slot": int(slot),
                "block_time": block_time,
            }
        )
        for w in buyers:
            buyer_hits[w] = buyer_hits.get(w, 0) + 1
            if block_time is not None:
                bt = int(block_time)
                if w not in first_buy_ts or bt < first_buy_ts[w]:
                    first_buy_ts[w] = bt

    groups = []
    for slot, entries in sorted(by_slot.items()):
        wallets: set[str] = set()
        for e in entries:
            wallets.update(e.get("buyers") or [])
        # 2+ wallets in same slot is interesting; 3+ is strong
        if len(wallets) >= 2:
            groups.append(
                {
                    "slot": slot,
                    "tx_count": len(entries),
                    "unique_buyers": len(wallets),
                    "wallets": sorted(wallets)[:24],
                    "signatures": [e.get("signature") for e in entries[:8]],
                    "block_time": next(
                        (e.get("block_time") for e in entries if e.get("block_time")),
                        None,
                    ),
                    "strength": "high" if len(wallets) >= 3 else "medium",
                }
            )

    # Prefer strongest groups
    groups.sort(
        key=lambda g: (-int(g.get("unique_buyers") or 0), -int(g.get("tx_count") or 0))
    )
    early_buyers = [
        {
            "wallet": w,
            "buy_tx_hits": buyer_hits[w],
            "first_buy_ts": first_buy_ts.get(w),
        }
        for w in sorted(buyer_hits.keys(), key=lambda x: -buyer_hits[x])[:40]
    ]

    return {
        "ok": True,
        "method": "helius_enhanced_txs_same_slot_launch_window",
        "same_slot_groups": groups[:20],
        "early_buyers": early_buyers,
        "sigs_scanned": len(older),
        "sigs_collected": len(all_sigs),
        "notes": (
            "Launch-window same-slot multi-wallet buys (Helius history). "
            "Proxy for atomic/Jito-style snipes — not a Jito archive dump."
        ),
    }


def analyze_funding_clusters(
    wallets: list[str],
    *,
    max_wallets: int = 12,
    sigs_per_wallet: int = 12,
) -> dict[str, Any]:
    """
    Trace recent SOL inflows for suspect wallets; group by common funder.

    Best-effort via Helius getSignaturesForAddress + getTransaction.
    1 hop only (who sent SOL into each suspect).
    """
    url = helius_url()
    if not url:
        return {
            "ok": False,
            "error": "Helius required for funding-hop scan",
            "method": "helius_sol_inflow_1hop",
            "clusters": [],
        }

    cleaned: list[str] = []
    seen: set[str] = set()
    for w in wallets:
        a = (w or "").strip()
        if not a or a in seen or len(a) < 32:
            continue
        seen.add(a)
        cleaned.append(a)
        if len(cleaned) >= max_wallets:
            break

    if len(cleaned) < 2:
        return {
            "ok": True,
            "method": "helius_sol_inflow_1hop",
            "clusters": [],
            "notes": "Need ≥2 suspect wallets for funding clustering.",
            "wallets_scanned": cleaned,
        }

    # wallet -> set of funders (SOL senders into this wallet)
    funders_of: dict[str, set[str]] = {w: set() for w in cleaned}
    scanned = 0

    for w in cleaned:
        try:
            sigs = _rpc(
                url,
                "getSignaturesForAddress",
                [w, {"limit": sigs_per_wallet}],
            )
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(sigs, list):
            continue
        for row in sigs[:sigs_per_wallet]:
            sig = (row or {}).get("signature")
            if not sig:
                continue
            try:
                tx = _rpc(
                    url,
                    "getTransaction",
                    [
                        sig,
                        {
                            "encoding": "jsonParsed",
                            "maxSupportedTransactionVersion": 0,
                        },
                    ],
                )
            except Exception:  # noqa: BLE001
                continue
            if not tx:
                continue
            scanned += 1
            for funder in _extract_sol_funders(tx, w):
                if funder and funder != w:
                    funders_of[w].add(funder)

    # Invert: funder -> children
    by_funder: dict[str, list[str]] = {}
    for child, parents in funders_of.items():
        for p in parents:
            by_funder.setdefault(p, []).append(child)

    clusters = []
    for funder, children in by_funder.items():
        uniq = sorted(set(children))
        if len(uniq) < 2:
            continue
        clusters.append(
            {
                "funder": funder,
                "children": uniq[:20],
                "child_count": len(uniq),
                "severity": "critical" if len(uniq) >= 4 else "high",
            }
        )
    clusters.sort(key=lambda c: -int(c.get("child_count") or 0))

    return {
        "ok": True,
        "method": "helius_sol_inflow_1hop",
        "clusters": clusters[:12],
        "wallets_scanned": cleaned,
        "txs_scanned": scanned,
        "notes": (
            "Wallets that received SOL from the same funder (1 hop). "
            "Classic split-wallet bundle pattern. Best-effort; not full graph."
        ),
    }


def _extract_sol_funders(tx: dict[str, Any], recipient: str) -> list[str]:
    """Wallets that sent SOL to recipient in this tx (parsed balance deltas)."""
    funders: set[str] = set()
    meta = tx.get("meta") or {}
    msg = (tx.get("transaction") or {}).get("message") or {}
    keys = msg.get("accountKeys") or []
    addrs: list[str] = []
    for k in keys:
        if isinstance(k, dict):
            addrs.append(str(k.get("pubkey") or ""))
        else:
            addrs.append(str(k or ""))
    pre = meta.get("preBalances") or []
    post = meta.get("postBalances") or []
    if len(pre) != len(post) or len(pre) != len(addrs):
        # Fallback: fee payer as possible funder if recipient appears
        if addrs and recipient in addrs and addrs[0] != recipient:
            return [addrs[0]]
        return []

    rec_idx = None
    for i, a in enumerate(addrs):
        if a == recipient:
            rec_idx = i
            break
    if rec_idx is None:
        return []
    try:
        rec_delta = int(post[rec_idx]) - int(pre[rec_idx])
    except (TypeError, ValueError):
        return []
    if rec_delta <= 0:
        return []

    # Anyone whose SOL balance dropped is a candidate funder
    for i, a in enumerate(addrs):
        if not a or a == recipient:
            continue
        try:
            d = int(post[i]) - int(pre[i])
        except (TypeError, ValueError):
            continue
        if d < 0:
            funders.add(a)
    return list(funders)


def _extract_buyers_from_tx(tx: dict[str, Any], mint: str) -> list[str]:
    """Best-effort: fee payer + token balance increases for mint."""
    buyers: set[str] = set()
    try:
        msg = (tx.get("transaction") or {}).get("message") or {}
        keys = msg.get("accountKeys") or []
        if keys:
            k0 = keys[0]
            if isinstance(k0, dict):
                buyers.add(k0.get("pubkey") or "")
            elif isinstance(k0, str):
                buyers.add(k0)
    except Exception:  # noqa: BLE001
        pass

    meta = tx.get("meta") or {}
    pre = meta.get("preTokenBalances") or []
    post = meta.get("postTokenBalances") or []
    pre_map = {
        (b.get("owner"), b.get("mint")): float(
            ((b.get("uiTokenAmount") or {}).get("uiAmount")) or 0
        )
        for b in pre
        if b.get("mint") == mint
    }
    for b in post:
        if b.get("mint") != mint:
            continue
        owner = b.get("owner") or ""
        post_amt = float(((b.get("uiTokenAmount") or {}).get("uiAmount")) or 0)
        pre_amt = pre_map.get((owner, mint), 0.0)
        if post_amt > pre_amt and owner:
            buyers.add(owner)
    return [b for b in buyers if b]


def _fetch_rugcheck(mint: str) -> dict[str, Any]:
    data = get_json(
        f"https://api.rugcheck.xyz/v1/tokens/{mint}/report",
        timeout=20.0,
        retries=1,
    )
    if not isinstance(data, dict):
        return {"ok": False, "error": "Unexpected Rugcheck payload"}

    top = data.get("topHolders") or []
    holders = []
    for i, row in enumerate(top[:40]):
        # Prefer owner (wallet); address is often the ATA token account
        owner = (row.get("owner") or "").strip()
        ata = (row.get("address") or "").strip()
        if not owner:
            owner = ata
        try:
            pct = float(row.get("pct")) if row.get("pct") is not None else None
        except (TypeError, ValueError):
            pct = None
        holders.append(
            {
                "rank": i + 1,
                "wallet": owner,
                "token_account": ata if ata and ata != owner else "",
                "pct_supply": pct,
                "insider": bool(row.get("insider")),
                "label": "insider" if row.get("insider") else None,
            }
        )

    risks = []
    for r in (data.get("risks") or [])[:12]:
        if isinstance(r, dict):
            risks.append(
                {
                    "name": r.get("name"),
                    "description": r.get("description"),
                    "level": r.get("level") or r.get("severity"),
                }
            )

    return {
        "ok": True,
        "holders": holders,
        "insider_count": sum(1 for h in holders if h.get("insider")),
        "risks": risks,
        "rugged": bool(data.get("rugged")),
        "score": data.get("score") or data.get("score_normalised"),
        "graph_insiders": data.get("graphInsidersDetected"),
        "insider_networks": (data.get("insiderNetworks") or [])[:6],
        "creator": data.get("creator"),
    }


def _fetch_birdeye(mint: str) -> dict[str, Any]:
    key = birdeye_api_key()
    if not key:
        return {
            "ok": False,
            "error": "Set BIRDEYE_API_KEY in .env for Birdeye holder/security layers",
            "skipped": True,
        }

    headers = {
        **DEFAULT_HEADERS,
        "X-API-KEY": key,
        "x-chain": "solana",
        "Accept": "application/json",
    }
    result: dict[str, Any] = {"ok": True, "layers": {}}

    # Security
    try:
        sec = get_json(
            f"{BIRDEYE_BASE}/defi/token_security?{urlencode({'address': mint})}",
            headers=headers,
            timeout=15.0,
            retries=0,
        )
        result["layers"]["security"] = (sec or {}).get("data") if isinstance(sec, dict) else sec
    except Exception as exc:  # noqa: BLE001
        result["layers"]["security_error"] = str(exc)

    # Top traders
    try:
        traders = get_json(
            f"{BIRDEYE_BASE}/defi/v2/tokens/top_traders?{urlencode({'address': mint, 'time_frame': '24h', 'sort_type': 'desc', 'sort_by': 'volume', 'limit': 20})}",
            headers=headers,
            timeout=15.0,
            retries=0,
        )
        data = (traders or {}).get("data") if isinstance(traders, dict) else None
        items = []
        if isinstance(data, dict):
            items = data.get("items") or data.get("tokens") or data.get("list") or []
        elif isinstance(data, list):
            items = data
        result["layers"]["top_traders"] = items[:20]
    except Exception as exc:  # noqa: BLE001
        result["layers"]["top_traders_error"] = str(exc)

    # Holders list
    try:
        holders = get_json(
            f"{BIRDEYE_BASE}/defi/v3/token/holder?{urlencode({'address': mint, 'offset': 0, 'limit': 20})}",
            headers=headers,
            timeout=15.0,
            retries=0,
        )
        data = (holders or {}).get("data") if isinstance(holders, dict) else None
        items = []
        if isinstance(data, dict):
            items = data.get("items") or data.get("list") or []
        elif isinstance(data, list):
            items = data
        result["layers"]["holders"] = items[:30]
    except Exception as exc:  # noqa: BLE001
        result["layers"]["holders_error"] = str(exc)

    # Holder profile (bundler/sniper/insider tags) — may require higher tier
    try:
        prof = get_json(
            f"{BIRDEYE_BASE}/token/v1/holder-profile?{urlencode({'address': mint})}",
            headers=headers,
            timeout=15.0,
            retries=0,
        )
        result["layers"]["holder_profile"] = (
            (prof or {}).get("data") if isinstance(prof, dict) else prof
        )
    except Exception as exc:  # noqa: BLE001
        result["layers"]["holder_profile_error"] = str(exc)

    # Mark ok false if everything failed
    layers = result.get("layers") or {}
    if all(k.endswith("_error") for k in layers) and layers:
        result["ok"] = False
        result["error"] = "All Birdeye layers failed (plan/key/rate limit?)"
    return result


def _jito_engine_probe() -> dict[str, Any]:
    """
    Probe Jito block-engine. Public API is for sendBundle / getTipAccounts /
    getInflightBundleStatuses — not mint-level historical snipers.
    """
    url = (os.environ.get("JITO_BLOCK_ENGINE_URL") or JITO_BUNDLES).strip()
    try:
        # getTipAccounts is a lightweight public method on many Jito endpoints
        payload = json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": "getTipAccounts", "params": []}
        ).encode()
        req = urllib.request.Request(
            url,
            data=payload,
            headers={**DEFAULT_HEADERS, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12, context=_ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        if data.get("error"):
            return {
                "ok": False,
                "error": str(data["error"]),
                "notes": "Jito engine reachable but method error",
                "endpoint": url.split("?")[0],
            }
        tips = data.get("result") or []
        return {
            "ok": True,
            "endpoint": url.split("?")[0],
            "tip_accounts": tips[:8] if isinstance(tips, list) else [],
            "notes": (
                "Jito block-engine is online (tip accounts OK). "
                "Historical mint snipers use Helius same-slot analysis, not Jito dump API."
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": str(exc),
            "endpoint": url.split("?")[0],
            "notes": "Jito engine probe failed (optional)",
        }
