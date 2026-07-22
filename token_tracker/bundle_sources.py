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
            # Launch-window / same-slot scan disabled (saves ~40–44 Helius RPCs
            # per Analyze). Not shown in Bundles or Ruggers.
            "jito_style": {
                "ok": False,
                "skipped": True,
                "same_slot_groups": [],
                "early_buyers": [],
                "method": "helius_enhanced_txs_same_slot_disabled",
                "notes": "Launch-window scan disabled — not used in Bundles/Ruggers.",
            },
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
    from .helius_rpc import rpc_call

    return rpc_call(
        url, method, params, timeout=25.0, req_id="adtc-bundle"
    )


def _helius_same_slot_snipes(
    mint: str,
    *,
    max_sigs: int = 80,
    max_tx_fetch: int = 40,
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


# SPL Token + Token-2022 program IDs (for getTokenAccountsByOwner)
_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
_TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"


def analyze_fresh_wallets(
    mint: str,
    wallets: list[str],
    *,
    max_wallets: int = 18,
    max_other_tokens: int = 0,
) -> dict[str, Any]:
    """
    Detect "fresh / sole-token" wallets: hold this mint and almost no other SPL tokens.

    Heuristic via Helius getTokenAccountsByOwner + getBalance.
    max_other_tokens=0 → only this mint (plus empty accounts ignored).
    """
    url = helius_url()
    mint = (mint or "").strip()
    if not url or not mint:
        return {
            "ok": False,
            "error": "Helius + mint required for fresh-wallet scan",
            "method": "helius_token_accounts_by_owner",
            "wallets": [],
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

    fresh: list[dict[str, Any]] = []
    scanned = 0
    for w in cleaned:
        try:
            other = 0
            this_amt = 0.0
            for program in (_TOKEN_PROGRAM, _TOKEN_2022_PROGRAM):
                try:
                    res = _rpc(
                        url,
                        "getTokenAccountsByOwner",
                        [
                            w,
                            {"programId": program},
                            {"encoding": "jsonParsed"},
                        ],
                    )
                except Exception:  # noqa: BLE001
                    continue
                value = (res or {}).get("value") if isinstance(res, dict) else None
                if not isinstance(value, list):
                    continue
                for acc in value:
                    try:
                        info = (
                            ((acc or {}).get("account") or {})
                            .get("data", {})
                            .get("parsed", {})
                            .get("info", {})
                        )
                        m = str(info.get("mint") or "").strip()
                        ta = (info.get("tokenAmount") or {})
                        ui = ta.get("uiAmount")
                        if ui is None:
                            try:
                                amt = float(ta.get("amount") or 0)
                                dec = int(ta.get("decimals") or 0)
                                ui = amt / (10**dec) if dec >= 0 else amt
                            except (TypeError, ValueError):
                                ui = 0
                        try:
                            uif = float(ui or 0)
                        except (TypeError, ValueError):
                            uif = 0.0
                        if uif <= 0:
                            continue
                        if m == mint:
                            this_amt += uif
                        else:
                            other += 1
                    except Exception:  # noqa: BLE001
                        continue
            scanned += 1
            if this_amt <= 0:
                continue
            if other > max_other_tokens:
                continue
            sol_ui = None
            try:
                lamports = _rpc(url, "getBalance", [w])
                if isinstance(lamports, dict):
                    lamports = lamports.get("value")
                sol_ui = float(lamports or 0) / 1e9
            except Exception:  # noqa: BLE001
                sol_ui = None
            fresh.append(
                {
                    "wallet": w,
                    "other_tokens": other,
                    "this_token_ui": this_amt,
                    "sol": sol_ui,
                    "tag": "sole-token" if other == 0 else "near-sole-token",
                }
            )
        except Exception:  # noqa: BLE001
            continue

    fresh.sort(key=lambda r: -float(r.get("this_token_ui") or 0))
    return {
        "ok": True,
        "method": "helius_token_accounts_by_owner",
        "wallets": fresh[:30],
        "wallets_scanned": scanned,
        "notes": (
            "Hold this mint and ≤"
            f"{max_other_tokens} other SPL token(s) with balance. "
            "Heuristic; closed ATAs / other chains not counted."
        ),
    }


def analyze_token_multi_sends(
    mint: str,
    holder_wallets: list[str] | None = None,
    *,
    max_sigs: int = 28,
    max_tx_fetch: int = 20,
    min_receivers: int = 2,
) -> dict[str, Any]:
    """
    Detect multi-sends of THIS mint: one owner sent the token to many wallets.

    Scans recent mint signatures (Helius getTransaction), builds
    sender_owner → receivers from pre/post token balances for this mint.
    Prefers clusters that hit current holders when holder_wallets is set.
    """
    url = helius_url()
    mint = (mint or "").strip()
    if not url or not mint:
        return {
            "ok": False,
            "error": "Helius + mint required for multi-send scan",
            "method": "helius_mint_token_multi_send",
            "clusters": [],
        }

    holder_set = {
        (w or "").strip()
        for w in (holder_wallets or [])
        if w and len(str(w).strip()) >= 32
    }

    try:
        sigs = _rpc(
            url,
            "getSignaturesForAddress",
            [mint, {"limit": max_sigs}],
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": str(exc),
            "method": "helius_mint_token_multi_send",
            "clusters": [],
        }
    if not isinstance(sigs, list):
        sigs = []

    # sender -> set of receivers (owners)
    edges: dict[str, set[str]] = {}
    txs_ok = 0
    for row in sigs[:max_sigs]:
        if txs_ok >= max_tx_fetch:
            break
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
        txs_ok += 1
        for sender, receivers in _extract_mint_send_edges(tx, mint).items():
            if not sender:
                continue
            edges.setdefault(sender, set()).update(receivers)

    clusters: list[dict[str, Any]] = []
    for sender, recs in edges.items():
        uniq = sorted({r for r in recs if r and r != sender})
        if len(uniq) < min_receivers:
            continue
        in_holders = [r for r in uniq if r in holder_set] if holder_set else list(uniq)
        # Prefer clusters that touch current holders; still keep pure fan-outs
        focus = in_holders if len(in_holders) >= min_receivers else uniq
        if len(focus) < min_receivers:
            continue
        clusters.append(
            {
                "sender": sender,
                "receivers": focus[:24],
                "receiver_count": len(focus),
                "receiver_count_all": len(uniq),
                "holders_hit": len(in_holders),
                "kind": "token_multi_send",
                "severity": "critical" if len(focus) >= 5 else "high",
            }
        )
    clusters.sort(
        key=lambda c: (
            -int(c.get("holders_hit") or 0),
            -int(c.get("receiver_count") or 0),
        )
    )
    return {
        "ok": True,
        "method": "helius_mint_token_multi_send",
        "clusters": clusters[:12],
        "txs_scanned": txs_ok,
        "notes": (
            "One wallet sent this mint to multiple receivers (token multi-send). "
            "Best-effort from recent mint history; not full chain archive."
        ),
    }


def _extract_mint_send_edges(tx: dict[str, Any], mint: str) -> dict[str, set[str]]:
    """
    sender_owner → receivers for this mint from pre/post token balances.
    """
    meta = tx.get("meta") or {}
    pre = meta.get("preTokenBalances") or []
    post = meta.get("postTokenBalances") or []
    if not isinstance(pre, list) or not isinstance(post, list):
        return {}

    def _key(b: dict[str, Any]) -> tuple[str, str]:
        owner = str(b.get("owner") or "").strip()
        acct = str(b.get("accountIndex") if b.get("accountIndex") is not None else "")
        return owner, acct

    pre_map: dict[tuple[str, str], float] = {}
    post_map: dict[tuple[str, str], float] = {}
    owners_by_idx: dict[str, str] = {}

    for b in pre:
        if not isinstance(b, dict):
            continue
        if str(b.get("mint") or "").strip() != mint:
            continue
        owner = str(b.get("owner") or "").strip()
        idx = str(b.get("accountIndex") if b.get("accountIndex") is not None else "")
        if owner:
            owners_by_idx[idx] = owner
        try:
            ui = (b.get("uiTokenAmount") or {}).get("uiAmount")
            pre_map[(owner, idx)] = float(ui) if ui is not None else float(
                (b.get("uiTokenAmount") or {}).get("amount") or 0
            )
        except (TypeError, ValueError):
            pre_map[(owner, idx)] = 0.0

    for b in post:
        if not isinstance(b, dict):
            continue
        if str(b.get("mint") or "").strip() != mint:
            continue
        owner = str(b.get("owner") or "").strip()
        idx = str(b.get("accountIndex") if b.get("accountIndex") is not None else "")
        if owner:
            owners_by_idx[idx] = owner
        try:
            ui = (b.get("uiTokenAmount") or {}).get("uiAmount")
            post_map[(owner, idx)] = float(ui) if ui is not None else float(
                (b.get("uiTokenAmount") or {}).get("amount") or 0
            )
        except (TypeError, ValueError):
            post_map[(owner, idx)] = 0.0

    # Aggregate by owner
    pre_own: dict[str, float] = {}
    post_own: dict[str, float] = {}
    for (owner, _idx), v in pre_map.items():
        o = owner or owners_by_idx.get(_idx) or ""
        if not o:
            continue
        pre_own[o] = pre_own.get(o, 0.0) + float(v or 0)
    for (owner, _idx), v in post_map.items():
        o = owner or owners_by_idx.get(_idx) or ""
        if not o:
            continue
        post_own[o] = post_own.get(o, 0.0) + float(v or 0)

    all_owners = set(pre_own) | set(post_own)
    senders: list[str] = []
    receivers: list[str] = []
    for o in all_owners:
        delta = float(post_own.get(o, 0) or 0) - float(pre_own.get(o, 0) or 0)
        if delta < -1e-9:
            senders.append(o)
        elif delta > 1e-9:
            receivers.append(o)

    out: dict[str, set[str]] = {}
    # Attribute multi-receive to each sender that lost tokens in the same tx
    # (common batch distribute pattern).
    if not senders or not receivers:
        return out
    for s in senders:
        out[s] = {r for r in receivers if r != s}
    return out


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
