"""
Robinhood (EVM) optional bundle scanners — Shared ETH / Fresh / Multi-send / MadeOnSol.

Shapes mirror Solana helpers in bundle_sources.py so fusion/UI stay unchanged.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote, urlencode

from .env_config import load_dotenv
from .evm_holders import (
    _BLOCKSCOUT_PUBLIC,
    _clean_env_key,
    alchemy_api_key,
    blockscout_api_key,
)
from .http_util import DEFAULT_HEADERS, get_json, ssl_context

load_dotenv()

_ALCHEMY_RH = "https://robinhood-mainnet.g.alchemy.com/v2/{key}"
_MADEONSOL_BUNDLE = "https://api.madeonsol.com/api/v1/rhc/tokens/{addr}/bundle"
_MADEONSOL_QUALITY = "https://api.madeonsol.com/api/v1/rhc/tokens/{addr}/buyer-quality"


def madeonsol_api_key() -> str | None:
    load_dotenv()
    return _clean_env_key(
        os.environ.get("MADEONSOL_API_KEY")
        or os.environ.get("RHC_API_KEY")
        or os.environ.get("MADEONSOL_KEY")
    )


def _alchemy_url(chain: str = "robinhood") -> str | None:
    key = alchemy_api_key()
    if not key:
        return None
    c = (chain or "robinhood").lower()
    if c in {"robinhood", "rh"}:
        return _ALCHEMY_RH.format(key=key)
    # Future: eth-mainnet etc.
    if c in {"ethereum", "eth"}:
        return f"https://eth-mainnet.g.alchemy.com/v2/{key}"
    return None


def _blockscout_base(chain: str = "robinhood") -> str:
    c = (chain or "robinhood").lower()
    return (_BLOCKSCOUT_PUBLIC.get(c) or "https://robinhoodchain.blockscout.com").rstrip(
        "/"
    )


def _post_json(
    url: str,
    body: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 18.0,
) -> Any:
    merged = {**DEFAULT_HEADERS, "Content-Type": "application/json", **(headers or {})}
    raw = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=raw, headers=merged, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_context()) as resp:
            data = resp.read()
            if not data:
                return None
            return json.loads(data.decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        body_txt = ""
        try:
            body_txt = exc.read().decode("utf-8", errors="replace")[:220]
        except Exception:  # noqa: BLE001
            pass
        raise RuntimeError(
            f"POST JSON failed for {url}: HTTP {exc.code} {exc.reason} {body_txt}"
        ) from exc


def _alchemy_rpc(url: str, method: str, params: list[Any]) -> Any:
    data = _post_json(
        url,
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        timeout=18.0,
    )
    if not isinstance(data, dict):
        return None
    if data.get("error"):
        err = data["error"]
        raise RuntimeError(
            f"Alchemy {method}: {err.get('message') or err}"
            if isinstance(err, dict)
            else f"Alchemy {method}: {err}"
        )
    return data.get("result")


def _norm_addr(a: str | None) -> str:
    return (a or "").strip()


def _is_evm(a: str) -> bool:
    return a.startswith("0x") and len(a) == 42


def analyze_shared_eth(
    wallets: list[str],
    *,
    chain: str = "robinhood",
    max_wallets: int = 12,
    transfers_per_wallet: int = 15,
) -> dict[str, Any]:
    """
    Trace recent native-ETH inflows; group wallets by common funder (1 hop).
    Alchemy alchemy_getAssetTransfers preferred; Blockscout txs as fallback.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for w in wallets:
        a = _norm_addr(w)
        if not a or a in seen or not _is_evm(a):
            continue
        seen.add(a)
        cleaned.append(a)
        if len(cleaned) >= max_wallets:
            break

    if len(cleaned) < 2:
        return {
            "ok": True,
            "method": "shared_eth_1hop",
            "clusters": [],
            "notes": "Need ≥2 suspect wallets for Shared ETH clustering.",
            "wallets_scanned": cleaned,
        }

    funders_of: dict[str, set[str]] = {w: set() for w in cleaned}
    scanned = 0
    method = "shared_eth_1hop"
    alchemy = _alchemy_url(chain)
    if alchemy:
        method = "alchemy_eth_inflow_1hop"
        for w in cleaned:
            try:
                result = _alchemy_rpc(
                    alchemy,
                    "alchemy_getAssetTransfers",
                    [
                        {
                            "fromBlock": "0x0",
                            "toBlock": "latest",
                            "toAddress": w,
                            "category": ["external", "internal"],
                            "withMetadata": False,
                            "excludeZeroValue": True,
                            "maxCount": hex(transfers_per_wallet),
                            "order": "desc",
                        }
                    ],
                )
            except Exception:  # noqa: BLE001
                continue
            transfers = (result or {}).get("transfers") if isinstance(result, dict) else None
            if not isinstance(transfers, list):
                continue
            scanned += 1
            for t in transfers[:transfers_per_wallet]:
                if not isinstance(t, dict):
                    continue
                # Native ETH only
                cat = str(t.get("category") or "").lower()
                if cat not in {"external", "internal"}:
                    continue
                if t.get("asset") not in (None, "ETH", "eth"):
                    # Some payloads use rawContract; skip ERC-20
                    if t.get("rawContract") and not t.get("asset"):
                        continue
                funder = _norm_addr(t.get("from"))
                if funder and _is_evm(funder) and funder.lower() != w.lower():
                    funders_of[w].add(funder)
    else:
        # Blockscout fallback — recent txs where address is recipient
        method = "blockscout_eth_inflow_1hop"
        base = _blockscout_base(chain)
        for w in cleaned:
            try:
                data = get_json(
                    f"{base}/api/v2/addresses/{quote(w)}/transactions?"
                    + urlencode({"filter": "to"}),
                    headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                    timeout=14.0,
                    retries=0,
                )
            except Exception:  # noqa: BLE001
                continue
            items = (data or {}).get("items") if isinstance(data, dict) else None
            if not isinstance(items, list):
                continue
            scanned += 1
            for tx in items[:transfers_per_wallet]:
                if not isinstance(tx, dict):
                    continue
                try:
                    val = int(str(tx.get("value") or "0"))
                except (TypeError, ValueError):
                    val = 0
                if val <= 0:
                    continue
                frm = tx.get("from")
                if isinstance(frm, dict):
                    funder = _norm_addr(frm.get("hash"))
                else:
                    funder = _norm_addr(frm)
                if funder and _is_evm(funder) and funder.lower() != w.lower():
                    funders_of[w].add(funder)

    by_funder: dict[str, list[str]] = {}
    for child, parents in funders_of.items():
        for p in parents:
            by_funder.setdefault(p, []).append(child)

    clusters: list[dict[str, Any]] = []
    for funder, children in by_funder.items():
        uniq = sorted({c for c in children}, key=str.lower)
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
        "method": method,
        "clusters": clusters[:12],
        "wallets_scanned": cleaned,
        "txs_scanned": scanned,
        "notes": (
            "Wallets that received ETH from the same funder (1 hop). "
            "Classic split-wallet bundle pattern. Best-effort; not full graph."
        ),
        "alchemy_configured": bool(alchemy),
    }


def analyze_fresh_evm(
    token: str,
    wallets: list[str],
    *,
    chain: str = "robinhood",
    max_wallets: int = 12,
    max_nonce: int = 25,
) -> dict[str, Any]:
    """
    Fresh wallets: low nonce and/or few other token balances, still hold this token.
    """
    token = _norm_addr(token)
    if not token:
        return {
            "ok": False,
            "error": "Token required for fresh-wallet scan",
            "method": "evm_fresh",
            "wallets": [],
        }

    cleaned: list[str] = []
    seen: set[str] = set()
    for w in wallets:
        a = _norm_addr(w)
        if not a or a in seen or not _is_evm(a):
            continue
        seen.add(a)
        cleaned.append(a)
        if len(cleaned) >= max_wallets:
            break

    alchemy = _alchemy_url(chain)
    base = _blockscout_base(chain)
    fresh: list[dict[str, Any]] = []
    scanned = 0

    for w in cleaned:
        try:
            nonce = None
            eth_bal = None
            other_tokens = None
            if alchemy:
                try:
                    n_hex = _alchemy_rpc(alchemy, "eth_getTransactionCount", [w, "latest"])
                    if isinstance(n_hex, str):
                        nonce = int(n_hex, 16)
                except Exception:  # noqa: BLE001
                    pass
                try:
                    bal_hex = _alchemy_rpc(alchemy, "eth_getBalance", [w, "latest"])
                    if isinstance(bal_hex, str):
                        eth_bal = int(bal_hex, 16) / 1e18
                except Exception:  # noqa: BLE001
                    pass
            # Blockscout counters for token diversity
            try:
                info = get_json(
                    f"{base}/api/v2/addresses/{quote(w)}",
                    headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                    timeout=12.0,
                    retries=0,
                )
                if isinstance(info, dict):
                    if nonce is None and info.get("transactions_count") is not None:
                        try:
                            nonce = int(info["transactions_count"])
                        except (TypeError, ValueError):
                            pass
                    # has_tokens / token counts vary by explorer version
                    tc = info.get("token_transfers_count")
                    if other_tokens is None and info.get("has_token_transfers") is False:
                        other_tokens = 0
                    if isinstance(info.get("coin_balance"), str) and eth_bal is None:
                        try:
                            eth_bal = int(info["coin_balance"]) / 1e18
                        except (TypeError, ValueError):
                            pass
                    _ = tc
            except Exception:  # noqa: BLE001
                pass

            scanned += 1
            # Heuristic: nonce <= max_nonce → fresh
            is_fresh = False
            tag = "fresh"
            if nonce is not None and nonce <= max_nonce:
                is_fresh = True
                tag = "low-nonce" if nonce > 5 else "very-fresh"
            elif nonce is None and other_tokens == 0:
                is_fresh = True
                tag = "sole-token"
            if not is_fresh:
                continue
            fresh.append(
                {
                    "wallet": w,
                    "other_tokens": other_tokens if other_tokens is not None else -1,
                    "this_token_ui": None,
                    "sol": eth_bal,  # UI field reused as native balance
                    "eth": eth_bal,
                    "nonce": nonce,
                    "tag": tag,
                }
            )
        except Exception:  # noqa: BLE001
            continue

    fresh.sort(key=lambda r: (r.get("nonce") is None, int(r.get("nonce") or 10**9)))
    return {
        "ok": True,
        "method": "alchemy_nonce_blockscout_fresh" if alchemy else "blockscout_fresh",
        "wallets": fresh[:30],
        "wallets_scanned": scanned,
        "notes": (
            f"Wallets with nonce ≤{max_nonce} (or sole-token heuristic). "
            "EVM fresh proxy — not a full portfolio archive."
        ),
    }


def analyze_token_multi_sends_evm(
    token: str,
    holder_wallets: list[str] | None = None,
    *,
    chain: str = "robinhood",
    max_pages: int = 4,
    page_size: int = 50,
    min_receivers: int = 2,
) -> dict[str, Any]:
    """
    Detect token multi-sends: one sender → many receivers of this ERC-20.
    Uses Blockscout token transfer feed (public explorer).
    """
    token = _norm_addr(token)
    if not token:
        return {
            "ok": False,
            "error": "Token required for multi-send scan",
            "method": "blockscout_token_multi_send",
            "clusters": [],
        }

    holder_set = {
        _norm_addr(w).lower()
        for w in (holder_wallets or [])
        if _norm_addr(w) and _is_evm(_norm_addr(w))
    }
    base = _blockscout_base(chain)
    # sender -> set(receivers)
    edges: dict[str, set[str]] = {}
    scanned = 0
    next_params: dict[str, Any] | None = None

    for _page in range(max_pages):
        try:
            url = f"{base}/api/v2/tokens/{quote(token)}/transfers"
            if next_params:
                url += "?" + urlencode({k: str(v) for k, v in next_params.items()})
            key = blockscout_api_key()
            if key and "apikey" not in url.lower():
                url += ("&" if "?" in url else "?") + urlencode({"apikey": key})
            data = get_json(
                url,
                headers={**DEFAULT_HEADERS, "Accept": "application/json"},
                timeout=18.0,
                retries=0,
            )
        except Exception:  # noqa: BLE001
            break
        if not isinstance(data, dict):
            break
        items = data.get("items") or []
        if not isinstance(items, list) or not items:
            break
        for row in items:
            if not isinstance(row, dict):
                continue
            scanned += 1
            frm = row.get("from") or {}
            to = row.get("to") or {}
            sender = _norm_addr(frm.get("hash") if isinstance(frm, dict) else frm)
            recv = _norm_addr(to.get("hash") if isinstance(to, dict) else to)
            if not sender or not recv or not _is_evm(sender) or not _is_evm(recv):
                continue
            if sender.lower() == recv.lower():
                continue
            # Prefer edges that touch current holders
            if holder_set and (
                sender.lower() not in holder_set and recv.lower() not in holder_set
            ):
                continue
            edges.setdefault(sender, set()).add(recv)
        npp = data.get("next_page_params")
        if not isinstance(npp, dict) or not npp:
            break
        next_params = npp

    clusters: list[dict[str, Any]] = []
    for sender, recs in edges.items():
        uniq = sorted(recs, key=str.lower)
        if len(uniq) < min_receivers:
            continue
        holders_hit = sum(1 for r in uniq if r.lower() in holder_set) if holder_set else 0
        clusters.append(
            {
                "sender": sender,
                "receivers": uniq[:40],
                "receiver_count": len(uniq),
                "holders_hit": holders_hit,
                "kind": "token_multi_send",
                "severity": "critical" if len(uniq) >= 6 else "high",
            }
        )
    clusters.sort(key=lambda c: (-int(c.get("holders_hit") or 0), -int(c.get("receiver_count") or 0)))

    return {
        "ok": True,
        "method": "blockscout_token_multi_send",
        "clusters": clusters[:12],
        "txs_scanned": scanned,
        "edge_senders": len(edges),
        "notes": (
            "One wallet sent this token to many receivers (Blockscout transfer feed). "
            "Best-effort sample of recent transfers — not a full archive."
        ),
    }


def fetch_madeonsol_launch_bundle(token: str) -> dict[str, Any]:
    """
    MadeOnSol Robinhood Chain intel — same-block launch bundle + optional quality.
    Skips cleanly when MADEONSOL_API_KEY is unset.
    """
    token = _norm_addr(token)
    key = madeonsol_api_key()
    if not key:
        return {
            "ok": False,
            "skipped": True,
            "error": "Set MADEONSOL_API_KEY for launch-bundle intel.",
            "bundle_kind": "none",
            "wallets": [],
        }
    if not token:
        return {
            "ok": False,
            "error": "Missing token",
            "bundle_kind": "none",
            "wallets": [],
        }

    headers = {
        **DEFAULT_HEADERS,
        "Accept": "application/json",
        "Authorization": f"Bearer {key}",
    }
    try:
        data = get_json(
            _MADEONSOL_BUNDLE.format(addr=quote(token)),
            headers=headers,
            timeout=16.0,
            retries=0,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"madeonsol bundle: {exc}",
            "bundle_kind": "none",
            "wallets": [],
        }

    # Response shapes vary: {bundle: {...}} or nested data.bundle
    bundle = data
    if isinstance(data, dict):
        if isinstance(data.get("bundle"), dict):
            bundle = data["bundle"]
        elif isinstance(data.get("data"), dict) and isinstance(
            data["data"].get("bundle"), dict
        ):
            bundle = data["data"]["bundle"]
    if not isinstance(bundle, dict):
        return {
            "ok": False,
            "error": "madeonsol: unexpected payload",
            "bundle_kind": "none",
            "wallets": [],
        }

    kind = str(bundle.get("bundle_kind") or bundle.get("kind") or "none")
    held = bundle.get("held_pct_of_supply")
    try:
        if held is not None and float(held) <= 1.0:
            held = float(held) * 100.0
        elif held is not None:
            held = float(held)
    except (TypeError, ValueError):
        held = None

    wallets: list[str] = []
    for key_w in ("wallets", "buyers", "cohort", "addresses"):
        raw = bundle.get(key_w)
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, str) and _is_evm(item):
                    wallets.append(item)
                elif isinstance(item, dict):
                    a = _norm_addr(item.get("wallet") or item.get("address"))
                    if a and _is_evm(a):
                        wallets.append(a)
        if wallets:
            break

    quality = None
    try:
        qdata = get_json(
            _MADEONSOL_QUALITY.format(addr=quote(token)),
            headers=headers,
            timeout=12.0,
            retries=0,
        )
        if isinstance(qdata, dict):
            quality = (
                qdata.get("quality")
                or (qdata.get("data") or {}).get("quality")
                or qdata
            )
    except Exception:  # noqa: BLE001
        quality = None

    return {
        "ok": True,
        "method": "madeonsol_rhc_bundle",
        "bundle_kind": kind,
        "held_pct_of_supply": held,
        "wallet_count": bundle.get("wallet_count") or len(wallets),
        "wallets": wallets[:40],
        "fully_exited": bundle.get("fully_exited"),
        "quality": quality,
        "raw": {k: bundle.get(k) for k in ("bundle_kind", "held_pct_of_supply", "wallet_count", "fully_exited")},
        "notes": "MadeOnSol same-block launch-bundle detection (Robinhood Chain).",
    }
