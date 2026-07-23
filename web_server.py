"""
Actual Data Token Checker — website backend.

Serves the web UI and a private API. Third-party keys (Helius, Birdeye, etc.)
load only from server-side .env and are never sent to the browser.

  GET  /              → web UI
  GET  /health
  GET  /api/health
  GET  /api/rugwatch-counts  local DB + cloud wallet counts (no addresses)
  POST /api/analyze   JSON: {"query": "...", "chain": "solana"?, "quick": false?}
  GET  /api/analyze?q=...&chain=solana&quick=0

Run:
  python run_web.py
  # or: python web_server.py --host 127.0.0.1 --port 8080
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
import traceback
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from token_tracker.env_config import load_dotenv  # noqa: E402
from token_tracker.bundles import build_bundles_ui_payload  # noqa: E402
from token_tracker.report import (  # noqa: E402
    format_about_section,
    format_alerts_section,
    format_bundles_section,
    format_holders_section,
    format_maps_section,
    format_overview,
)
from view_counter import (  # noqa: E402
    badge_svg,
    public_stats,
    record_analyze,
    record_profile_view,
)

WEB_DIR = ROOT / "web"
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}

# Redact secrets if they ever appear in errors / nested payloads
_SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|access[_-]?token|bearer|authorization)\s*[=:]\s*[^\s&,;\"']+"),
    re.compile(r"(?i)[?&]api-key=[^&\s\"']+"),
    re.compile(r"(?i)helius-rpc\.com/\?api-key=[^\s\"']+"),
    re.compile(r"(?i)(sk-|pk_|xox[baprs]-)[A-Za-z0-9_-]{10,}"),
]
_SECRET_KEY_NAMES = re.compile(
    r"(?i)^(api[_-]?key|apikey|secret|password|token|authorization|bearer|"
    r"helius_api_key|birdeye_api_key|solscan_api_key|cmc_api_key|x_bearer|"
    r"rpc_url|solana_rpc_url)$"
)

# Per-IP rate limit + concurrent Analyze cap (protect shared server egress IP)
_RATE_LOCK = threading.Lock()
_RATE_HITS: dict[str, deque[float]] = defaultdict(deque)
# Default 6 analyzes / minute / IP (was 12). Override: ANALYZE_RATE_MAX
_RATE_MAX = int(os.environ.get("ANALYZE_RATE_MAX") or 6)
_RATE_WINDOW = float(os.environ.get("ANALYZE_RATE_WINDOW") or 60.0)
# One in-flight Analyze per IP
_MAX_INFLIGHT_PER_IP = int(os.environ.get("ANALYZE_MAX_INFLIGHT") or 1)
_IP_INFLIGHT: dict[str, int] = defaultdict(int)

# Optional shared secret so random internet clients can't burn your keys
# Set WEB_API_TOKEN in .env to require header: X-API-Token: <token>
# (This is YOUR site gate — not a third-party provider key.)


def _web_api_token() -> str | None:
    load_dotenv()
    import os

    t = (os.environ.get("WEB_API_TOKEN") or "").strip()
    return t or None


def _cors_allowed_origins() -> list[str] | None:
    """
    WEB_CORS_ORIGINS=https://your-app.netlify.app,http://localhost:5500
    Empty / * → allow request Origin (or * if none). Prefer explicit list in prod.
    """
    load_dotenv()
    import os

    raw = (os.environ.get("WEB_CORS_ORIGINS") or "").strip()
    if not raw or raw == "*":
        return None
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def _rate_ok(ip: str) -> bool:
    """Sliding-window max Analyzes per IP (counts every attempt that starts)."""
    now = time.time()
    with _RATE_LOCK:
        q = _RATE_HITS[ip]
        while q and now - q[0] > _RATE_WINDOW:
            q.popleft()
        if len(q) >= _RATE_MAX:
            return False
        q.append(now)
        return True


def _acquire_inflight(ip: str) -> bool:
    """At most N concurrent Analyzes per IP (default 1)."""
    with _RATE_LOCK:
        if _IP_INFLIGHT[ip] >= _MAX_INFLIGHT_PER_IP:
            return False
        _IP_INFLIGHT[ip] += 1
        return True


def _release_inflight(ip: str) -> None:
    with _RATE_LOCK:
        n = _IP_INFLIGHT.get(ip, 0) - 1
        if n <= 0:
            _IP_INFLIGHT.pop(ip, None)
        else:
            _IP_INFLIGHT[ip] = n


def redact_text(text: str) -> str:
    if not text:
        return text
    out = str(text)
    for pat in _SECRET_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    return out


def sanitize_public(obj: Any, *, depth: int = 0) -> Any:
    """Deep-copy shape for JSON responses; strip secrets and huge noise."""
    if depth > 12:
        return None
    if obj is None or isinstance(obj, (bool, int, float)):
        return obj
    if isinstance(obj, str):
        return redact_text(obj)
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            ks = str(k)
            if _SECRET_KEY_NAMES.match(ks):
                continue
            # Drop raw provider error blobs that often embed URLs with keys
            if ks.lower() in {
                "rpc_url",
                "endpoint",
                "raw",
                "raw_response",
                "request_url",
            }:
                continue
            out[ks] = sanitize_public(v, depth=depth + 1)
        return out
    if isinstance(obj, (list, tuple)):
        return [sanitize_public(x, depth=depth + 1) for x in obj[:200]]
    return redact_text(str(obj))


def _safe_market_summary(report: dict[str, Any]) -> dict[str, Any]:
    market = report.get("market") or {}
    pair = market.get("pair") or {}
    token = report.get("token") or {}
    return {
        "name": token.get("name"),
        "symbol": token.get("symbol"),
        "address": token.get("address"),
        "chain_id": token.get("chain_id"),
        "price_usd": market.get("price_usd"),
        "market_cap_usd": market.get("market_cap_usd"),
        "fdv_usd": market.get("fdv_usd"),
        "liquidity_usd": market.get("liquidity_usd"),
        "volume_h24_usd": market.get("volume_h24_usd"),
        "price_change_pct": market.get("price_change_pct"),
        "txns_h24": market.get("txns_h24"),
        "dex_id": pair.get("dex_id"),
        "pair_address": pair.get("pair_address"),
        "pair_url": pair.get("url"),
        "created_at": pair.get("created_at"),
    }


def _safe_links(report: dict[str, Any]) -> dict[str, str]:
    links: dict[str, str] = {}
    market = report.get("market") or {}
    pair = market.get("pair") or {}
    token = report.get("token") or {}
    socials = report.get("socials") or {}
    maps = report.get("maps") or {}

    if pair.get("url"):
        links["dexscreener"] = str(pair["url"])
    addr = token.get("address") or ""
    chain = (token.get("chain_id") or "solana").lower()
    if addr and chain in {"solana", "sol"}:
        links["solscan"] = f"https://solscan.io/token/{addr}"
    elif addr and chain in {"robinhood", "rh", "robinhood-chain"}:
        # Robinhood Chain explorer (Blockscout)
        a = addr if addr.startswith("0x") else addr
        links["explorer"] = f"https://robinhoodchain.blockscout.com/token/{a}"
        links["dexscreener_chain"] = f"https://dexscreener.com/robinhood/{a}"
    elif addr and chain in {"ethereum", "eth"} and addr.startswith("0x"):
        links["etherscan"] = f"https://etherscan.io/token/{addr}"
    elif addr and chain == "base" and addr.startswith("0x"):
        links["basescan"] = f"https://basescan.org/token/{addr}"
    elif addr and chain in {"arbitrum", "arb"} and addr.startswith("0x"):
        links["arbiscan"] = f"https://arbiscan.io/token/{addr}"
    if maps.get("bubblemaps_url"):
        links["bubblemaps"] = str(maps["bubblemaps_url"])
    elif maps.get("url"):
        links["bubblemaps"] = str(maps["url"])
    tw = socials.get("twitter_handle") or ""
    if tw:
        links["twitter"] = f"https://x.com/{str(tw).lstrip('@')}"
    for w in socials.get("websites") or []:
        if isinstance(w, dict) and w.get("url"):
            links.setdefault("website", str(w["url"]))
            break
        if isinstance(w, str) and w.startswith("http"):
            links.setdefault("website", w)
            break
    for s in socials.get("socials") or []:
        if not isinstance(s, dict):
            continue
        url = s.get("url") or ""
        plat = (s.get("type") or s.get("platform") or "").lower()
        if url and plat in {"telegram", "discord", "website"}:
            links.setdefault(plat, str(url))
    # narrative / coin fact links (skip raw metadata JSON URI — not a user-facing page)
    _skip_link_keys = {
        "metadata_uri",
        "metadataUri",
        "metadata",
        "uri",
        "image",
        "image_uri",
        "imageUri",
    }
    story = report.get("narrative") or {}
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}
    for k, v in (cf.get("links") or {}).items():
        if str(k).lower() in {s.lower() for s in _skip_link_keys}:
            continue
        if isinstance(v, str) and v.startswith("http") and k not in links:
            if "api-key" in v.lower():
                continue
            links[k] = v
    return {k: redact_text(v) for k, v in links.items() if v}


def _clean_logs_snapshot(text: Any) -> str:
    """Keep full holders/bundles content; drop only noise for Logs.

    Removed: Providers: lines, Note: lines, RugWatch flagged-wallets section.
    Kept: totals, concentration, creator, flags, top holder wallets, bundles body.
    """
    if text is None:
        return ""
    lines = str(text).splitlines()
    out: list[str] = []
    skip_rw = False
    for line in lines:
        t = line.strip()
        low = t.lower()

        # RugWatch appendix starts after top holders — skip that section only
        if "flagged wallets (rugwatch)" in low or "── flagged wallets" in low:
            skip_rw = True
            continue
        if skip_rw:
            continue

        if low.startswith("providers:"):
            continue
        if "birdeye: skipped" in low:
            continue
        if "solscan: set solscan" in low:
            continue
        if "provider issues" in low:
            continue
        if low.startswith("note:") or low.startswith("notes:"):
            continue
        # Flag bullet that is only a rugwatch count (not wallet list)
        if "rugwatch:" in low and "flagged" in low and t.startswith(("•", "*", "-")):
            continue
        # Solscan URL rows (keep wallet addresses elsewhere)
        if re.match(r"^https?://(www\.)?solscan\.io/(account|token)/", t, re.I):
            continue

        out.append(line)

    collapsed: list[str] = []
    blanks = 0
    for line in out:
        if not line.strip():
            blanks += 1
            if blanks <= 1:
                collapsed.append(line)
            continue
        blanks = 0
        collapsed.append(line)
    return "\n".join(collapsed).strip()


def _clip_log_snapshot(text: Any, *, max_chars: int = 10_000) -> str | None:
    """Clean + trim Holders/Bundles text for website Logs localStorage."""
    if text is None:
        return None
    s = _clean_logs_snapshot(redact_text(str(text)))
    if not s:
        return None
    if len(s) <= max_chars:
        return s
    return (
        s[: max_chars - 80].rstrip()
        + "\n\n  … [snapshot truncated for Logs storage] …\n"
    )


def _ruggers_track_snapshot(
    holders: dict[str, Any] | None,
    bundles: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compact structured wallets for website Ruggers tab (first-lookup tracking).

    Client stores first-seen holdings per mint, then flags wallets that later
    sold ≥99% of that bag (or dropped off the list), including similar-size
    group members and creator.

    Single sellers (client) only from plain holders ≥0.01% that are NOT
    similar-size, multi-account, multi-send, insider, suspect, shared-funder,
    launch-window, or fresh wallets.
    """
    holders = holders or {}
    bundles = bundles or {}
    meta = holders.get("meta") if isinstance(holders.get("meta"), dict) else {}
    creator = (meta.get("creator") or "").strip() or None

    # Bundle-category sets — excluded from Ruggers Single lane
    similar_wallets: set[str] = set()
    multi_wallets: set[str] = set()
    multi_send_wallets: set[str] = set()
    insider_wallets: set[str] = set()
    suspect_wallets: set[str] = set()
    funding_wallets: set[str] = set()
    launch_wallets: set[str] = set()
    fresh_wallets: set[str] = set()

    for c in list(holders.get("owner_clusters") or []) + list(
        bundles.get("clusters") or []
    ):
        if not isinstance(c, dict):
            continue
        w = (c.get("wallet") or c.get("owner") or "").strip()
        if w:
            multi_wallets.add(w)

    for h in list(holders.get("holders") or []):
        if isinstance(h, dict) and h.get("insider"):
            w = (h.get("wallet") or "").strip()
            if w:
                insider_wallets.add(w)
    for h in list(bundles.get("insider_wallets") or []):
        if isinstance(h, dict):
            w = (h.get("wallet") or "").strip()
        else:
            w = str(h or "").strip()
        if w:
            insider_wallets.add(w)

    for s in list(bundles.get("suspect_wallets") or []):
        if isinstance(s, dict):
            w = (s.get("wallet") or "").strip()
        else:
            w = str(s or "").strip()
        if w:
            suspect_wallets.add(w)

    for fc in list(bundles.get("funding_clusters") or []):
        if not isinstance(fc, dict):
            continue
        funder = (fc.get("funder") or "").strip()
        if funder:
            funding_wallets.add(funder)
        for c in list(fc.get("children") or []):
            if isinstance(c, dict):
                w = (c.get("wallet") or "").strip()
            else:
                w = str(c or "").strip()
            if w:
                funding_wallets.add(w)

    # Known LP / Pump.fun pool PDAs — never tag as launch-window multi-buys
    lp_exclude: set[str] = set()
    for h in list(holders.get("holders") or []):
        if not isinstance(h, dict):
            continue
        if h.get("is_known_program"):
            hw = (h.get("wallet") or "").strip()
            if hw:
                lp_exclude.add(hw)
        lab = (h.get("label") or "").strip().lower()
        if lab and any(
            k in lab
            for k in (
                "liquidity",
                "pump",
                "bonding",
                "raydium",
                "orca",
                "meteora",
                "pool",
                "vault",
                "amm",
            )
        ):
            hw = (h.get("wallet") or "").strip()
            if hw:
                lp_exclude.add(hw)
    try:
        from token_tracker.holders import known_pool_addresses_for_mint

        mint_for_lp = (
            (holders.get("token_address") or holders.get("mint") or "")
            or (bundles.get("token_address") or "")
        )
        # Pump + Meteora + Raydium + all Dex pair addresses for this mint
        lp_exclude |= known_pool_addresses_for_mint(str(mint_for_lp))
    except Exception:  # noqa: BLE001
        pass

    # Launch-window disabled — never tag Ruggers wallets as in_launch
    # (same_slot_groups left empty by bundle fusion).

    # Fresh wallets (sole-token / near-sole — almost only this mint)
    for fw in list(bundles.get("fresh_wallets") or []):
        if isinstance(fw, dict):
            w = (fw.get("wallet") or "").strip()
        else:
            w = str(fw or "").strip()
        if w:
            fresh_wallets.add(w)

    # Multi-send (token + SOL): one sender → many receivers (NOT multi-account)
    for mc in list(bundles.get("multi_send_clusters") or []) + list(
        bundles.get("sol_multi_send_clusters") or []
    ):
        if not isinstance(mc, dict):
            continue
        sender = (mc.get("sender") or mc.get("funder") or "").strip()
        if sender:
            multi_send_wallets.add(sender)
        for r in list(mc.get("receivers") or mc.get("children") or []):
            if isinstance(r, dict):
                w = (r.get("wallet") or "").strip()
            else:
                w = str(r or "").strip()
            if w:
                multi_send_wallets.add(w)
        for row in list(mc.get("child_rows") or []):
            if isinstance(row, dict):
                w = (row.get("wallet") or "").strip()
                if w:
                    multi_send_wallets.add(w)

    # Parse similar-size groups first (needed for tagging + Single exclusion)
    similar_groups: list[dict[str, Any]] = []
    for i, g in enumerate(list(bundles.get("similar_size_groups") or [])[:12]):
        if not isinstance(g, dict):
            continue
        members_out: list[dict[str, Any]] = []
        for m in list(g.get("members") or []):
            if isinstance(m, dict):
                mw = (m.get("wallet") or "").strip()
                mp = m.get("pct_supply")
            else:
                mw = str(m or "").strip()
                mp = None
            if not mw:
                continue
            try:
                mp_f = float(mp) if mp is not None else None
            except (TypeError, ValueError):
                mp_f = None
            members_out.append({"wallet": mw, "pct_supply": mp_f})
            similar_wallets.add(mw)
        if not members_out:
            avg = g.get("avg_pct")
            try:
                avg_f = float(avg) if avg is not None else None
            except (TypeError, ValueError):
                avg_f = None
            for mw in list(g.get("wallets") or [])[:20]:
                addr = str(mw or "").strip()
                if not addr:
                    continue
                members_out.append({"wallet": addr, "pct_supply": avg_f})
                similar_wallets.add(addr)
        if len(members_out) < 2:
            continue
        try:
            avg_g = float(g.get("avg_pct")) if g.get("avg_pct") is not None else None
        except (TypeError, ValueError):
            avg_g = None
        try:
            tot_g = float(g.get("total_pct")) if g.get("total_pct") is not None else None
        except (TypeError, ValueError):
            tot_g = None
        similar_groups.append(
            {
                "id": f"sim{i + 1}",
                "count": len(members_out),
                "avg_pct": avg_g,
                "total_pct": tot_g,
                "members": members_out[:20],
            }
        )

    SINGLE_MIN_PCT = 0.01  # Single lane: top→least holder cutoff

    def _bundle_tags(addr: str) -> dict[str, Any]:
        in_sim = addr in similar_wallets
        in_multi = addr in multi_wallets
        in_ms = addr in multi_send_wallets
        in_ins = addr in insider_wallets
        in_sus = addr in suspect_wallets
        in_fund = addr in funding_wallets
        in_launch = addr in launch_wallets
        in_fresh = addr in fresh_wallets
        # Multi-account stays multi. Suspect = similar-size + Rugcheck insider.
        return {
            "in_similar": in_sim,
            "in_multi": in_multi,
            "in_multi_send": in_ms,
            "in_insider": in_ins,
            "in_suspect": bool(in_sim or in_ins),
            "in_funding": in_fund,
            "in_launch": in_launch,
            "in_fresh": in_fresh,
            "exclude_from_single": bool(
                in_sim
                or in_ins
                or in_multi
                or in_ms
                or in_fund
                or in_launch
                or in_fresh
            ),
        }

    wallet_rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    # All non-LP holders in snapshot:
    #  - include if supply % ≥ 0.01% (Single cutoff), OR
    #  - include if % unknown but balance > 0 (still track; Single needs % later)
    # Dust below 0.01% with known % is skipped (unless similar/creator added below).
    for h in list(holders.get("holders") or []):
        if not isinstance(h, dict):
            continue
        if h.get("is_known_program"):
            continue
        w = (h.get("wallet") or "").strip()
        if not w or w in seen:
            continue
        pct = h.get("pct_supply")
        try:
            pct_f = float(pct) if pct is not None else None
        except (TypeError, ValueError):
            pct_f = None
        bal = h.get("balance")
        try:
            bal_f = float(bal) if bal is not None else None
        except (TypeError, ValueError):
            bal_f = None
        if pct_f is not None and pct_f < SINGLE_MIN_PCT:
            continue
        if pct_f is None and (bal_f is None or bal_f <= 0):
            continue
        seen.add(w)
        row: dict[str, Any] = {
            "wallet": w,
            "pct_supply": pct_f,
            "balance": bal_f,
            "rank": h.get("rank"),
            "label": h.get("label"),
        }
        row.update(_bundle_tags(w))
        # Single lane needs known % ≥ cutoff; balance-only rows track but not Single
        if pct_f is None or pct_f < SINGLE_MIN_PCT:
            row["exclude_from_single"] = True
        wallet_rows.append(row)

    # Similar-only wallets not already listed (still track Similar sellers)
    for addr in similar_wallets:
        if addr in seen:
            continue
        seen.add(addr)
        pct_f = None
        for g in similar_groups:
            for m in g.get("members") or []:
                if m.get("wallet") == addr:
                    pct_f = m.get("pct_supply")
                    break
            if pct_f is not None:
                break
        row = {
            "wallet": addr,
            "pct_supply": pct_f,
            "balance": None,
            "rank": None,
            "label": None,
        }
        row.update(_bundle_tags(addr))
        row["in_similar"] = True
        row["exclude_from_single"] = True
        wallet_rows.append(row)

    # Fresh-only wallets not already listed (track Fresh wallets sellers)
    for addr in fresh_wallets:
        if addr in seen:
            continue
        seen.add(addr)
        pct_f = None
        for fw in list(bundles.get("fresh_wallets") or []):
            if isinstance(fw, dict) and (fw.get("wallet") or "").strip() == addr:
                try:
                    pct_f = (
                        float(fw["pct_supply"])
                        if fw.get("pct_supply") is not None
                        else None
                    )
                except (TypeError, ValueError):
                    pct_f = None
                break
        row = {
            "wallet": addr,
            "pct_supply": pct_f,
            "balance": None,
            "rank": None,
            "label": "fresh",
        }
        row.update(_bundle_tags(addr))
        row["in_fresh"] = True
        row["exclude_from_single"] = True
        wallet_rows.append(row)

    # Multi-send-only wallets not already listed
    for addr in multi_send_wallets:
        if addr in seen:
            continue
        seen.add(addr)
        row = {
            "wallet": addr,
            "pct_supply": None,
            "balance": None,
            "rank": None,
            "label": "multi-send",
        }
        row.update(_bundle_tags(addr))
        row["in_multi_send"] = True
        row["exclude_from_single"] = True
        wallet_rows.append(row)

    # Shared SOL (funding) funder + children not already listed.
    # Without this, only top holders get in_funding — most Shared SOL bags
    # never freeze into Ruggers, so sells never appear under Shared SOL section.
    for addr in funding_wallets:
        if addr in seen:
            continue
        seen.add(addr)
        pct_f = None
        for fc in list(bundles.get("funding_clusters") or []):
            if not isinstance(fc, dict):
                continue
            funder = (fc.get("funder") or fc.get("sender") or "").strip()
            if funder == addr:
                try:
                    pct_f = (
                        float(fc["funder_pct"])
                        if fc.get("funder_pct") is not None
                        else (
                            float(fc["sender_pct"])
                            if fc.get("sender_pct") is not None
                            else None
                        )
                    )
                except (TypeError, ValueError):
                    pct_f = None
                break
            for row_c in list(fc.get("child_rows") or []):
                if isinstance(row_c, dict) and (row_c.get("wallet") or "").strip() == addr:
                    try:
                        pct_f = (
                            float(row_c["pct_supply"])
                            if row_c.get("pct_supply") is not None
                            else None
                        )
                    except (TypeError, ValueError):
                        pct_f = None
                    break
            if pct_f is not None:
                break
            for c in list(fc.get("children") or []):
                cw = (
                    (c.get("wallet") or "").strip()
                    if isinstance(c, dict)
                    else str(c or "").strip()
                )
                if cw == addr:
                    if isinstance(c, dict):
                        try:
                            pct_f = (
                                float(c["pct_supply"])
                                if c.get("pct_supply") is not None
                                else None
                            )
                        except (TypeError, ValueError):
                            pct_f = None
                    break
            if pct_f is not None:
                break
        row = {
            "wallet": addr,
            "pct_supply": pct_f,
            "balance": None,
            "rank": None,
            "label": "shared SOL funder",
        }
        row.update(_bundle_tags(addr))
        row["in_funding"] = True
        row["exclude_from_single"] = True
        wallet_rows.append(row)

    if creator and creator not in seen:
        c_pct = None
        c_bal = None
        c_rank = None
        for h in list(holders.get("holders") or []):
            if not isinstance(h, dict):
                continue
            if (h.get("wallet") or "").strip() == creator:
                try:
                    c_pct = (
                        float(h["pct_supply"]) if h.get("pct_supply") is not None else None
                    )
                except (TypeError, ValueError):
                    c_pct = None
                try:
                    c_bal = float(h["balance"]) if h.get("balance") is not None else None
                except (TypeError, ValueError):
                    c_bal = None
                c_rank = h.get("rank")
                break
        row = {
            "wallet": creator,
            "pct_supply": c_pct,
            "balance": c_bal,
            "rank": c_rank,
            "label": "creator",
            "baseline_pending": c_pct is None and c_bal is None,
        }
        row.update(_bundle_tags(creator))
        row["exclude_from_single"] = True  # creator never Single
        wallet_rows.append(row)
        seen.add(creator)

    # RugWatch-flagged addresses that actually touch THIS mint only.
    # Never dump global high_risk_db / all_flagged — those are unrelated wallets.
    # Client Ruggers: only after ≥99% sell do they enter Flagged section.
    flagged_addresses: list[dict[str, Any]] = []
    rw = holders.get("rugwatch_flagged") if isinstance(holders.get("rugwatch_flagged"), dict) else {}
    if rw and rw.get("ok") and not rw.get("skipped"):
        seen_f: set[str] = set()
        for group_key in ("in_top_holders", "linked_to_mint"):
            for w in list(rw.get(group_key) or []):
                if not isinstance(w, dict):
                    continue
                addr = (w.get("address") or w.get("wallet") or "").strip()
                if not addr or addr in seen_f:
                    continue
                seen_f.add(addr)
                fm = w.get("flagged_from_mint")
                if not fm:
                    fms = list(w.get("flagged_from_mints") or [])
                    fm = fms[0] if fms else None
                flagged_addresses.append(
                    {
                        "wallet": addr,
                        "risk_score": w.get("risk_score"),
                        "label": w.get("label") or w.get("role"),
                        "origin": w.get("origin") or w.get("tag") or w.get("location"),
                        "notes": w.get("notes"),
                        "times_flagged": int(
                            w.get("times_flagged") or w.get("times_seen") or 0
                        ),
                        "mint_flag_count": int(w.get("mint_flag_count") or 0),
                        "flagged_from_mints": [fm] if fm else [],
                        "flagged_from_mint": fm,
                        "on_this_mint": bool(
                            w.get("on_this_mint") or group_key == "linked_to_mint"
                        ),
                        "in_top_holders": bool(
                            w.get("in_top_holders") or group_key == "in_top_holders"
                        ),
                    }
                )
                if len(flagged_addresses) >= 80:
                    break
            if len(flagged_addresses) >= 80:
                break
        if len(flagged_addresses) < 80:
            by_addr: dict[str, dict[str, Any]] = {}
            for group_key in ("in_top_holders", "linked_to_mint", "all_flagged"):
                for w in list(rw.get(group_key) or []):
                    if not isinstance(w, dict):
                        continue
                    a = (w.get("address") or w.get("wallet") or "").strip()
                    if a and a not in by_addr:
                        by_addr[a] = w
            for addr in list(seen):
                if addr in seen_f:
                    continue
                w = by_addr.get(addr)
                if not w:
                    continue
                seen_f.add(addr)
                fm = w.get("flagged_from_mint")
                if not fm:
                    fms = list(w.get("flagged_from_mints") or [])
                    fm = fms[0] if fms else None
                flagged_addresses.append(
                    {
                        "wallet": addr,
                        "risk_score": w.get("risk_score"),
                        "label": w.get("label") or w.get("role"),
                        "origin": w.get("origin") or w.get("tag") or w.get("location"),
                        "notes": w.get("notes"),
                        "times_flagged": int(
                            w.get("times_flagged") or w.get("times_seen") or 0
                        ),
                        "mint_flag_count": int(w.get("mint_flag_count") or 0),
                        "flagged_from_mints": [fm] if fm else [],
                        "flagged_from_mint": fm,
                        "on_this_mint": bool(w.get("on_this_mint")),
                        "in_top_holders": True,
                    }
                )
                if len(flagged_addresses) >= 80:
                    break

    # Cap payload size (holders ≥0.01% + similar/creator extras)
    wallet_rows.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    return {
        # ok if holders succeeded OR we at least have some wallet rows
        # (empty rows still return a track so the client can seed this mint)
        "ok": bool(holders.get("ok")) or bool(wallet_rows),
        "creator": creator,
        "single_min_pct": SINGLE_MIN_PCT,
        "wallets": wallet_rows[:200],
        "similar_groups": similar_groups,
        "flagged_addresses": flagged_addresses,
    }



def build_public_payload(report: dict[str, Any]) -> dict[str, Any]:
    """Client-safe analyze response (formatted tabs + summary, no keys)."""
    if not report.get("ok"):
        return {
            "ok": False,
            "error": redact_text(str(report.get("error") or "Analyze failed")),
            "query": report.get("query"),
        }

    sections = {
        "overview": format_overview(report),
        "holders": format_holders_section(report),
        "bundles": format_bundles_section(report),
        "alerts": format_alerts_section(report),
        "maps": format_maps_section(report),
        "about": format_about_section(report),
    }
    # Redact any accidental secret bleed in text sections
    sections = {k: redact_text(v) for k, v in sections.items()}

    alerts = report.get("alerts") or {}
    narrative = report.get("narrative") or {}
    x = report.get("community_sentiment_x") or {}
    holders = report.get("holders") or {}
    hsum = holders.get("summary") or {}
    bundles = report.get("bundles") or {}
    bsum = bundles.get("summary") or {}
    pf = report.get("pumpfun") or {}
    market = report.get("market") or {}
    pair = market.get("pair") if isinstance(market.get("pair"), dict) else {}

    # Structured card UI for Bundles tab (not raw text / not full JSON dump)
    try:
        bundles_view = sanitize_public(build_bundles_ui_payload(bundles))
    except Exception:  # noqa: BLE001
        bundles_view = {
            "ok": False,
            "error": "Bundles UI payload failed — use full Analyze on Solana.",
        }

    return {
        "ok": True,
        "query": report.get("query"),
        "generated_at": report.get("generated_at"),
        "token": sanitize_public(report.get("token") or {}),
        "market": _safe_market_summary(report),
        "links": _safe_links(report),
        "sections": sections,
        "bundles_view": bundles_view,
        "alerts_meta": {
            "priority_count": alerts.get("priority_count") or 0,
            "summary": redact_text(str(alerts.get("summary") or "")),
        },
        # Fields for website Logs tab (browser localStorage)
        # Text snapshots are clipped so ~20 entries fit in localStorage.
        "history_meta": {
            "holders_ok": bool(holders.get("ok")),
            "flagged_still_holding": int(
                holders.get("flagged_still_holding")
                or (holders.get("rugwatch_flagged") or {}).get("still_holding_count")
                or 0
            ),
            "flagged_previously_holding": int(
                holders.get("flagged_previously_holding")
                or (holders.get("rugwatch_flagged") or {}).get("previously_holding_count")
                or 0
            ),
            "concentration_risk": hsum.get("concentration_risk"),
            "top1_pct": hsum.get("top1_pct"),
            "top5_pct": hsum.get("top5_pct"),
            "top10_pct": hsum.get("top10_pct"),
            "bundle_risk": bsum.get("bundle_risk"),
            "bundle_pct": bsum.get("total_bundle_pct")
            or bsum.get("estimated_bundle_pct")
            or bsum.get("bundle_pct"),
            "dex_id": pair.get("dex_id") or pf.get("dex_id"),
            "pumpfun": {
                "is_pump_mint": pf.get("is_pump_mint"),
                "status": pf.get("status"),
                "graduated": pf.get("graduated"),
                "on_bonding_curve": pf.get("on_bonding_curve"),
            }
            if pf
            else None,
            # Frozen Holders + Bundles text at lookup time (not live)
            "holders_snapshot": _clip_log_snapshot(
                sections.get("holders"), max_chars=10_000
            ),
            "bundles_snapshot": _clip_log_snapshot(
                sections.get("bundles"), max_chars=7_000
            ),
            # Structured wallets for Ruggers tab (first-lookup sell tracking)
            "ruggers_track": _ruggers_track_snapshot(holders, bundles),
        },
        "about_meta": {
            "headline": narrative.get("headline"),
            "theme": narrative.get("theme"),
            "confidence": (narrative.get("coin_facts") or {}).get("confidence")
            if isinstance(narrative.get("coin_facts"), dict)
            else None,
            "sources_used": list(narrative.get("sources_used") or [])[:20],
        },
        "sentiment_meta": {
            "label": (x.get("sentiment") or {}).get("label"),
            "score": (x.get("sentiment") or {}).get("score"),
            "posts_analyzed": x.get("posts_analyzed"),
        },
        "disclaimer": redact_text(
            str(
                report.get("disclaimer")
                or "Heuristics only · not financial advice · keys stay on the server."
            )
        ),
    }


def run_analyze(
    query: str,
    *,
    chain: str | None,
    quick: bool,
    include_rugwatch: bool = True,
    include_fresh: bool = True,
    include_multi_send: bool = True,
    include_shared_sol: bool = True,
    include_fresh_multi_send: bool | None = None,
) -> dict[str, Any]:
    load_dotenv()
    from token_tracker.analyze import analyze_token
    from token_tracker.analyze_gate import analyze_cached

    q = (query or "").strip()
    if not q:
        return {"ok": False, "error": "query is required"}
    if len(q) > 200:
        return {"ok": False, "error": "query too long"}
    if include_fresh_multi_send is False:
        include_fresh = False
        include_multi_send = False

    def _live() -> dict[str, Any]:
        try:
            report = analyze_token(
                q,
                chain=chain or None,
                include_holders=not quick,
                quick=quick,
                include_rugwatch=bool(include_rugwatch),
                include_fresh=bool(include_fresh),
                include_multi_send=bool(include_multi_send),
                include_shared_sol=bool(include_shared_sol),
            )
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "error": redact_text(f"Analyze failed: {exc}"),
                "detail": redact_text(traceback.format_exc()[-800:]),
            }
        return build_public_payload(report)

    try:
        payload, source = analyze_cached(
            _live,
            query=q,
            chain=chain,
            quick=quick,
            include_rugwatch=bool(include_rugwatch),
            include_fresh=bool(include_fresh),
            include_multi_send=bool(include_multi_send),
            include_shared_sol=bool(include_shared_sol),
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": redact_text(f"Analyze failed: {exc}"),
            "detail": redact_text(traceback.format_exc()[-800:]),
        }
    if isinstance(payload, dict):
        # Non-secret debug: helps confirm cache is working (safe for clients)
        payload.setdefault("cache", source)
        return payload
    return {"ok": False, "error": "Analyze returned empty result"}


class _ThreadedServer(ThreadingHTTPServer):
    """Daemon threads so a stuck Analyze cannot pin the process forever."""

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 32


class WebHandler(BaseHTTPRequestHandler):
    server_version = "ActualDataTokenCheckerWeb/1.0"
    # Close connections promptly (better behind Render's proxy)
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))
        try:
            sys.stderr.flush()
        except Exception:  # noqa: BLE001
            pass

    def _client_ip(self) -> str:
        # Honor reverse-proxy only if you set WEB_TRUST_PROXY=1
        import os

        if (os.environ.get("WEB_TRUST_PROXY") or "").strip() in {"1", "true", "yes"}:
            xff = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            if xff:
                return xff
        return self.client_address[0]

    def _cors(self) -> None:
        # Cross-origin for Netlify/Vercel UI → this API host
        origin = (self.headers.get("Origin") or "").strip().rstrip("/")
        allowed = _cors_allowed_origins()
        if allowed is None:
            # Dev / open: echo Origin if present so credentialed patterns work later
            self.send_header("Access-Control-Allow-Origin", origin or "*")
        elif origin in allowed:
            self.send_header("Access-Control-Allow-Origin", origin)
        elif not origin:
            # non-browser clients
            self.send_header("Access-Control-Allow-Origin", allowed[0])
        else:
            # Disallowed origin — still set a header so browser gets a clear CORS fail
            self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-API-Token",
        )
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")

    def _json(self, code: int, payload: Any) -> None:
        raw = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._cors()
        self.end_headers()
        self.wfile.write(raw)

    def _bytes(self, code: int, data: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        if content_type.startswith("text/html"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "public, max-age=300")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > 64_000:
            return {}
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _check_gate(self) -> bool:
        """Optional site gate via WEB_API_TOKEN (not a provider key)."""
        required = _web_api_token()
        if not required:
            return True
        got = (self.headers.get("X-API-Token") or "").strip()
        if got and got == required:
            return True
        # Also allow ?site_token= for simple bookmarking (still not a provider key)
        return False

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path) or "/"
        qs = parse_qs(parsed.query)

        # Ultra-light ping — must never hang (use this to debug Render free tier)
        if path in {"/api/ping", "/ping"}:
            return self._json(200, {"ok": True, "pong": True})

        if path in {"/health", "/api/health"}:
            load_dotenv()
            import os

            providers = {
                "helius": bool((os.environ.get("HELIUS_API_KEY") or "").strip()),
                "birdeye": bool((os.environ.get("BIRDEYE_API_KEY") or "").strip()),
                "solscan": bool(
                    (
                        os.environ.get("SOLSCAN_API_KEY")
                        or os.environ.get("SOLSCAN_PRO_API_KEY")
                        or ""
                    ).strip()
                ),
                "cmc": bool(
                    (
                        os.environ.get("CMC_API_KEY")
                        or os.environ.get("COINMARKETCAP_API_KEY")
                        or ""
                    ).strip()
                ),
                "site_gate": bool(_web_api_token()),
            }
            views = analyzes = None
            try:
                stats = public_stats()
                views = stats.get("profile_views")
                analyzes = stats.get("analyzes")
            except Exception:  # noqa: BLE001
                pass
            return self._json(
                200,
                {
                    "ok": True,
                    "service": "actual-data-token-checker-web",
                    "providers_configured": providers,
                    "profile_views": views,
                    "analyzes": analyzes,
                    "note": "Provider keys are server-side only and never returned.",
                },
            )

        # Public counters (no auth — intentionally publicized)
        if path in {"/api/stats", "/stats.json"}:
            try:
                return self._json(200, public_stats())
            except Exception as exc:  # noqa: BLE001
                return self._json(
                    200,
                    {"ok": True, "profile_views": 0, "analyzes": 0, "error": str(exc)[:120]},
                )

        # RugWatch local SQLite + cloud list sizes (no wallet addresses returned)
        if path in {"/api/rugwatch-counts", "/api/rugwatch_counts", "/rugwatch-counts"}:
            try:
                from token_tracker.rugwatch_bridge import rugwatch_wallet_counts

                full = str((qs.get("full") or ["0"])[0]).strip().lower() in {
                    "1",
                    "true",
                    "yes",
                    "full",
                }
                return self._json(200, rugwatch_wallet_counts(full_cloud=full))
            except Exception as exc:  # noqa: BLE001
                return self._json(
                    200,
                    {
                        "ok": False,
                        "local": {"count": 0, "db_found": False, "ok": False},
                        "cloud": {"count": 0, "url_set": False, "ok": False},
                        "sources": [],
                        "error": str(exc)[:200],
                    },
                )

        if path in {"/api/view", "/api/hit"}:
            try:
                stats = record_profile_view(self._client_ip())
                return self._json(200, stats)
            except Exception as exc:  # noqa: BLE001
                return self._json(
                    200,
                    {"ok": True, "profile_views": 0, "analyzes": 0, "error": str(exc)[:120]},
                )

        if path in {"/badge.svg", "/api/badge.svg"}:
            try:
                svg = badge_svg().encode("utf-8")
            except Exception:  # noqa: BLE001
                svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="90" height="20"></svg>'
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Content-Length", str(len(svg)))
            self.send_header("Cache-Control", "no-cache")
            self._cors()
            self.end_headers()
            self.wfile.write(svg)
            return None

        if path in {"/api/analyze", "/api/analyze/"}:
            q = (qs.get("q") or qs.get("query") or [""])[0]
            chain = (qs.get("chain") or [None])[0]
            quick = (qs.get("quick") or ["0"])[0] in {"1", "true", "yes"}
            # Default on when param omitted; only "0/false/no" disables
            rw_raw = (qs.get("rugwatch") or qs.get("include_rugwatch") or ["1"])[0]
            include_rugwatch = str(rw_raw).strip().lower() not in {
                "0",
                "false",
                "no",
                "off",
            }
            def _qs_bool(keys: list[str], default: bool = True) -> bool:
                for k in keys:
                    if k in qs and qs.get(k):
                        return str(qs.get(k)[0]).strip().lower() not in {
                            "0",
                            "false",
                            "no",
                            "off",
                        }
                return default

            include_fresh = _qs_bool(["fresh", "include_fresh"], True)
            include_multi_send = _qs_bool(
                ["multi_send", "include_multi_send"], True
            )
            include_shared_sol = _qs_bool(
                ["shared_sol", "include_shared_sol", "funding", "include_funding"],
                True,
            )
            # Legacy combined param
            if "fresh_multi" in qs or "include_fresh_multi_send" in qs:
                combined = _qs_bool(
                    ["fresh_multi", "include_fresh_multi_send"], True
                )
                if not combined:
                    include_fresh = False
                    include_multi_send = False
            return self._handle_analyze(
                q,
                chain=chain,
                quick=quick,
                include_rugwatch=include_rugwatch,
                include_fresh=include_fresh,
                include_multi_send=include_multi_send,
                include_shared_sol=include_shared_sol,
            )

        # Static files from /web
        if path == "/" or path == "/index.html":
            return self._serve_static("index.html")
        # On-site documentation (full user guide = web/documentation.txt
        # which is kept in sync with repo-root DOCUMENTATION.txt)
        if path in {"/docs", "/docs/", "/documentation", "/documentation/"}:
            return self._serve_static("docs.html")
        if path.lower() in {
            "/documentation.txt",
            "/documentations.txt",
        } or path in {"/DOCUMENTATION.txt", "/Documentation.txt"}:
            return self._serve_doc_text()
        if path.startswith("/"):
            rel = path.lstrip("/")
            # block path traversal
            if ".." in rel or rel.startswith(("api/", "\\")):
                return self._json(404, {"ok": False, "error": "not found"})
            return self._serve_static(rel)

        return self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path).rstrip("/") or "/"

        if path in {"/api/view", "/api/hit"}:
            stats = record_profile_view(self._client_ip())
            return self._json(200, stats)

        if path == "/api/analyze":
            body = self._read_json()
            q = str(body.get("query") or body.get("q") or "").strip()
            chain = body.get("chain")
            chain_s = str(chain).strip() if chain else None
            quick = bool(body.get("quick"))
            # Default True; explicit false/0/off disables RugWatch flags
            if "include_rugwatch" in body:
                include_rugwatch = bool(body.get("include_rugwatch"))
            elif "rugwatch" in body:
                include_rugwatch = bool(body.get("rugwatch"))
            else:
                include_rugwatch = True
            # Default True; uncheck Fresh / Multi-send to skip those Helius scans
            if "include_fresh" in body:
                include_fresh = bool(body.get("include_fresh"))
            elif "fresh" in body:
                include_fresh = bool(body.get("fresh"))
            else:
                include_fresh = True
            if "include_multi_send" in body:
                include_multi_send = bool(body.get("include_multi_send"))
            elif "multi_send" in body:
                include_multi_send = bool(body.get("multi_send"))
            else:
                include_multi_send = True
            if "include_shared_sol" in body:
                include_shared_sol = bool(body.get("include_shared_sol"))
            elif "shared_sol" in body:
                include_shared_sol = bool(body.get("shared_sol"))
            elif "include_funding" in body:
                include_shared_sol = bool(body.get("include_funding"))
            elif "funding" in body:
                include_shared_sol = bool(body.get("funding"))
            else:
                include_shared_sol = True
            # Legacy combined: only if neither separate flag sent
            if (
                "include_fresh" not in body
                and "fresh" not in body
                and "include_multi_send" not in body
                and "multi_send" not in body
            ):
                if "include_fresh_multi_send" in body:
                    if not bool(body.get("include_fresh_multi_send")):
                        include_fresh = False
                        include_multi_send = False
                elif "fresh_multi" in body:
                    if not bool(body.get("fresh_multi")):
                        include_fresh = False
                        include_multi_send = False
            return self._handle_analyze(
                q,
                chain=chain_s,
                quick=quick,
                include_rugwatch=include_rugwatch,
                include_fresh=include_fresh,
                include_multi_send=include_multi_send,
                include_shared_sol=include_shared_sol,
            )

        return self._json(404, {"ok": False, "error": "not found"})

    def _handle_analyze(
        self,
        query: str,
        *,
        chain: str | None,
        quick: bool,
        include_rugwatch: bool = True,
        include_fresh: bool = True,
        include_multi_send: bool = True,
        include_shared_sol: bool = True,
    ) -> None:
        if not self._check_gate():
            return self._json(
                401,
                {
                    "ok": False,
                    "error": "Unauthorized. Set X-API-Token header (WEB_API_TOKEN on server).",
                },
            )
        ip = self._client_ip()
        if not _rate_ok(ip):
            return self._json(
                429,
                {
                    "ok": False,
                    "error": (
                        f"Rate limit: max {_RATE_MAX} analyzes per "
                        f"{_RATE_WINDOW:.0f}s from your IP. Wait and try again."
                    ),
                },
            )
        if not (query or "").strip():
            return self._json(400, {"ok": False, "error": "query is required"})
        if not _acquire_inflight(ip):
            return self._json(
                429,
                {
                    "ok": False,
                    "error": (
                        "Another Analyze is already running from your IP. "
                        "Wait for it to finish (one at a time protects shared API limits)."
                    ),
                },
            )

        # Analyze can take a while (holders / narrative); cache+single-flight inside
        try:
            result = run_analyze(
                query.strip(),
                chain=chain,
                quick=quick,
                include_rugwatch=include_rugwatch,
                include_fresh=include_fresh,
                include_multi_send=include_multi_send,
                include_shared_sol=include_shared_sol,
            )
        finally:
            _release_inflight(ip)
        try:
            record_analyze(ok=bool(result.get("ok")))
        except Exception:  # noqa: BLE001
            pass
        code = 200 if result.get("ok") else 422
        err = str(result.get("error") or "")
        if "Rate limit" in err or "already running" in err:
            code = 429
        return self._json(code, result)

    def _serve_doc_text(self) -> None:
        """Serve the Token Checker user guide as plain text (no-cache).

        Prefer web/documentation.txt; fall back to repo-root DOCUMENTATION.txt
        so Docs still works if only the root file is present on the host.
        """
        candidates = [
            WEB_DIR / "documentation.txt",
            ROOT / "DOCUMENTATION.txt",
            WEB_DIR / "DOCUMENTATION.txt",
        ]
        target = next((p for p in candidates if p.is_file()), None)
        if target is None:
            return self._json(
                404,
                {
                    "ok": False,
                    "error": (
                        "documentation.txt not found. Expected web/documentation.txt "
                        "or DOCUMENTATION.txt next to web_server.py."
                    ),
                },
            )
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self._cors()
        self.end_headers()
        self.wfile.write(data)
        return None


    def _inject_asset_hashes(self, rel: str, data: bytes, ctype: str) -> bytes:
        """Rewrite app.js/styles.css query strings to content hashes (cache bust)."""
        if rel not in {"index.html", "docs.html"} and not rel.endswith(".html"):
            return data
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            return data
        import hashlib
        import re as _re

        def file_hash(name: str) -> str:
            path = WEB_DIR / name
            if not path.is_file():
                return "missing"
            return hashlib.md5(path.read_bytes()).hexdigest()[:10]

        app_h = file_hash("app.js")
        css_h = file_hash("styles.css")
        text = _re.sub(
            r'src="(/app\.js)\?v=[^"]*"',
            f'src="\\1?v=h-{app_h}"',
            text,
        )
        text = _re.sub(
            r'href="(/styles\.css)\?v=[^"]*"',
            f'href="\\1?v=h-{css_h}"',
            text,
        )
        return text.encode("utf-8")

    def _serve_static(self, rel: str) -> None:
        if not WEB_DIR.is_dir():
            return self._json(
                500,
                {"ok": False, "error": "web/ folder missing next to web_server.py"},
            )
        # default
        if not rel or rel == "/":
            rel = "index.html"
        target = (WEB_DIR / rel).resolve()
        try:
            target.relative_to(WEB_DIR.resolve())
        except ValueError:
            return self._json(403, {"ok": False, "error": "forbidden"})
        if not target.is_file():
            return self._json(404, {"ok": False, "error": "not found"})
        data = target.read_bytes()
        ctype = STATIC_TYPES.get(target.suffix.lower(), "application/octet-stream")
        if target.suffix.lower() in {".html"}:
            data = self._inject_asset_hashes(rel, data, ctype)
        # Always revalidate HTML/JS so Docs + app updates appear after deploy
        if target.suffix.lower() in {".html", ".js", ".txt", ".css"}:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            # Stronger for JS: never use stale cached app without revalidation
            if target.suffix.lower() in {".js", ".css"}:
                self.send_header("Cache-Control", "no-store")
            self._cors()
            self.end_headers()
            self.wfile.write(data)
            return None
        return self._bytes(200, data, ctype)


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    import os

    # Unbuffered-ish logs for Render / Railway
    try:
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
        sys.stderr.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    p = argparse.ArgumentParser(description="Actual Data Token Checker web server")
    default_host = (
        os.environ.get("HOST")
        or os.environ.get("WEB_HOST")
        or "0.0.0.0"  # cloud-friendly default (local: pass --host 127.0.0.1 if needed)
    )
    port_raw = (os.environ.get("PORT") or os.environ.get("WEB_PORT") or "8080").strip()
    try:
        default_port = int(port_raw)
    except ValueError:
        print(f"Invalid PORT={port_raw!r}; falling back to 8080", flush=True)
        default_port = 8080

    p.add_argument(
        "--host",
        default=default_host,
        help="Bind host (default 0.0.0.0 for cloud; use 127.0.0.1 only for local)",
    )
    p.add_argument(
        "--port",
        type=int,
        default=default_port,
        help="Port (default from PORT env or 8080)",
    )
    args = p.parse_args(argv)

    print("Starting Actual Data Token Checker web…", flush=True)
    print(f"  cwd={Path.cwd()}", flush=True)
    print(f"  root={ROOT}", flush=True)
    print(f"  web_dir={WEB_DIR} exists={WEB_DIR.is_dir()}", flush=True)
    print(f"  bind={args.host}:{args.port}", flush=True)

    if not WEB_DIR.is_dir():
        # Still run API-only so the service does not crash-loop if web/ was omitted
        print(
            f"WARNING: web UI folder missing at {WEB_DIR} — serving API only.",
            file=sys.stderr,
            flush=True,
        )
        try:
            print("  repo top-level:", [x.name for x in ROOT.iterdir()][:40], flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  (could not list root: {exc})", flush=True)

    try:
        httpd = _ThreadedServer((args.host, args.port), WebHandler)
    except OSError as exc:
        print(f"FATAL: cannot bind {args.host}:{args.port}: {exc}", file=sys.stderr, flush=True)
        return 1

    httpd.timeout = 300
    print("Actual Data Token Checker — web API + optional UI", flush=True)
    print(f"  UI:  http://{args.host}:{args.port}/", flush=True)
    print(f"  API: http://{args.host}:{args.port}/api/health", flush=True)
    print("  Keys load from server env/.env only (never sent to the browser).", flush=True)
    cors = _cors_allowed_origins()
    if cors:
        print(f"  CORS allowlist: {', '.join(cors)}", flush=True)
    else:
        print(
            "  CORS: open (set WEB_CORS_ORIGINS to your Netlify/Vercel URL in prod).",
            flush=True,
        )
    if _web_api_token():
        print("  Site gate ON (WEB_API_TOKEN required as X-API-Token header).", flush=True)
    else:
        print(
            "  Site gate OFF — set WEB_API_TOKEN in env so public users cannot burn API quota.",
            flush=True,
        )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", flush=True)
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
