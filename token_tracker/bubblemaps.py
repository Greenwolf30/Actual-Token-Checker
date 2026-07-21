"""
Bubblemaps integration for the Maps tab.

Live map URLs (open in system browser — this is how data actually loads):
  https://v2.bubblemaps.io/map?address=...&chain=...
  https://app.bubblemaps.io/{chainSeg}/token/{address}
  https://iframe.bubblemaps.io/map?chain=...&address=...&partnerId=...

Partner id defaults to ``demo``. Override:
  BUBBLEMAPS_PARTNER_ID=your_partner_id

Optional Data API:
  BUBBLEMAPS_API_KEY=...
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from .env_config import load_dotenv, project_root
from .http_util import get_json

load_dotenv()

IFRAME_BASE = "https://iframe.bubblemaps.io/map"
APP_BASE = "https://app.bubblemaps.io"
V2_BASE = "https://v2.bubblemaps.io/map"
API_BASE = "https://api.bubblemaps.io"

# DexScreener / app chain id → Bubblemaps chain id (iframe + docs)
_CHAIN_TO_BUBBLE: dict[str, str] = {
    "solana": "solana",
    "sol": "solana",
    "ethereum": "eth",
    "eth": "eth",
    "bsc": "bsc",
    "bnb": "bsc",
    "base": "base",
    "arbitrum": "arbitrum",
    "arbi": "arbitrum",
    "polygon": "polygon",
    "poly": "polygon",
    "avalanche": "avalanche",
    "avax": "avalanche",
    "tron": "tron",
    "ton": "ton",
    "sonic": "sonic",
    "monad": "monad",
    "hyperevm": "hyperevm",
    "robinhood": "robinhood",
    "fantom": "ftm",
    "ftm": "ftm",
    "cronos": "cro",
    "cro": "cro",
    "optimism": "eth",  # map closest; may not have dedicated BM chain
    "aptos": "aptos",
}

# Legacy app path segment for app.bubblemaps.io/{seg}/token/{addr}
_APP_PATH: dict[str, str] = {
    "solana": "sol",
    "eth": "eth",
    "bsc": "bsc",
    "base": "base",
    "arbitrum": "arbi",
    "polygon": "poly",
    "avalanche": "avax",
    "tron": "tron",
    "ton": "ton",
    "sonic": "sonic",
    "fantom": "ftm",
    "ftm": "ftm",
    "robinhood": "robinhood",
}


def partner_id() -> str:
    load_dotenv()
    return (os.environ.get("BUBBLEMAPS_PARTNER_ID") or "demo").strip() or "demo"


def api_key() -> str | None:
    load_dotenv()
    key = (os.environ.get("BUBBLEMAPS_API_KEY") or "").strip()
    return key or None


def to_bubble_chain(chain_id: str | None) -> str | None:
    if not chain_id:
        return None
    key = chain_id.lower().strip()
    if key in {"", "any", "unknown", "none"}:
        return None
    return _CHAIN_TO_BUBBLE.get(key)


def _looks_like_solana_address(addr: str | None) -> bool:
    """Base58 Solana addresses are typically 32–44 chars without 0/O/I/l."""
    a = (addr or "").strip()
    if len(a) < 32 or len(a) > 44:
        return False
    if a.startswith("0x"):
        return False
    return all(c in "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz" for c in a)


def resolve_bubble_chain(chain_id: str | None, token_address: str | None = None) -> str | None:
    """Map app chain id → Bubblemaps chain; infer solana from address when chain missing."""
    bm = to_bubble_chain(chain_id)
    if bm:
        return bm
    if _looks_like_solana_address(token_address):
        return "solana"
    return None


def iframe_map_url(
    chain_id: str | None,
    token_address: str | None,
    *,
    partner: str | None = None,
) -> str | None:
    """Official Bubblemaps iframe map URL."""
    addr = (token_address or "").strip()
    bm_chain = resolve_bubble_chain(chain_id, addr)
    if not addr or not bm_chain:
        return None
    q = urlencode(
        {
            "chain": bm_chain,
            "address": addr,
            "partnerId": partner or partner_id(),
        }
    )
    return f"{IFRAME_BASE}?{q}"


def app_map_url(chain_id: str | None, token_address: str | None) -> str | None:
    """Legacy app path deep link (redirects to v2)."""
    addr = (token_address or "").strip()
    bm_chain = resolve_bubble_chain(chain_id, addr)
    if not addr or not bm_chain:
        return None
    seg = _APP_PATH.get(bm_chain, bm_chain)
    return f"{APP_BASE}/{seg}/token/{addr}"


def v2_map_url(chain_id: str | None, token_address: str | None) -> str | None:
    """
    Current Bubblemaps V2 map URL (what app.bubblemaps.io redirects to).
    This is the most reliable link for loading live holder-map data.
    """
    addr = (token_address or "").strip()
    bm_chain = resolve_bubble_chain(chain_id, addr)
    if not addr or not bm_chain:
        return None
    q = urlencode({"address": addr, "chain": bm_chain})
    return f"{V2_BASE}?{q}"


def v2_explore_url(chain_id: str | None, token_address: str | None) -> str | None:
    """Alias for v2_map_url."""
    return v2_map_url(chain_id, token_address)


def open_url_external(url: str) -> tuple[bool, str]:
    """
    Open an HTTPS URL in the user's default browser.

    Frozen Windows apps (pythonw / PyInstaller --windowed) often fail silently
    with webbrowser.open alone — use os.startfile / cmd start first.
    """
    url = (url or "").strip()
    if not url:
        return False, "empty url"
    errors: list[str] = []

    if sys.platform.startswith("win"):
        try:
            os.startfile(url)  # type: ignore[attr-defined]
            return True, "os.startfile"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"startfile: {exc}")
        try:
            # empty title arg after start is required when URL is quoted
            subprocess.Popen(
                ["cmd", "/c", "start", "", url],
                shell=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True, "cmd_start"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"cmd_start: {exc}")

    try:
        ok = webbrowser.open(url, new=2)
        if ok:
            return True, "webbrowser"
        errors.append("webbrowser returned False")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"webbrowser: {exc}")

    # macOS / Linux fallbacks
    for cmd in (
        ["xdg-open", url],
        ["open", url],
    ):
        try:
            subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True, cmd[0]
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{cmd[0]}: {exc}")

    return False, "; ".join(errors) or "all open methods failed"


def build_maps_payload(
    *,
    chain_id: str | None,
    token_address: str | None,
    symbol: str | None = None,
    name: str | None = None,
    fetch_api: bool = True,
) -> dict[str, Any]:
    """
    Build Maps tab payload: URLs + optional Data API snapshot.
    """
    addr = (token_address or "").strip()
    bm_chain = resolve_bubble_chain(chain_id, addr)
    v2 = v2_map_url(chain_id, addr)
    iframe = iframe_map_url(chain_id, addr)
    app = app_map_url(chain_id, addr)

    if not addr:
        return {
            "ok": False,
            "error": "No token address — run Analyze first (or paste a mint address).",
            "iframe_url": None,
            "app_url": None,
            "v2_url": None,
            "bubble_chain": None,
        }

    if not bm_chain:
        return {
            "ok": False,
            "error": (
                f"Chain '{chain_id or 'unknown'}' is not mapped to Bubblemaps yet. "
                "Set chain to solana (or ethereum/base/bsc/…) then Analyze again. "
                "Supported: solana, ethereum, base, bsc, arbitrum, polygon, "
                "avalanche, tron, ton, robinhood."
            ),
            "iframe_url": None,
            "app_url": None,
            "v2_url": None,
            "bubble_chain": None,
            "token_address": addr,
            "chain_id": chain_id,
        }

    api_info: dict[str, Any] = {"attempted": False}
    if fetch_api and api_key():
        api_info = _try_data_api(bm_chain, addr)

    return {
        "ok": True,
        "name": name,
        "symbol": symbol,
        "chain_id": chain_id or bm_chain,
        "token_address": addr,
        "bubble_chain": bm_chain,
        "partner_id": partner_id(),
        "v2_url": v2,
        "iframe_url": iframe,
        "app_url": app,
        # Preferred open target for live data
        "primary_url": v2 or app or iframe,
        "api": api_info,
        "notes": (
            "Click Maps to open the live Bubblemaps V2 map in your browser "
            "(holder bubbles load on bubblemaps.io). "
            "Blue links below also work. Partner id defaults to 'demo'."
        ),
    }


def write_viewer_html(iframe_url: str, *, title: str = "Bubblemaps") -> Path:
    """Write a full-window HTML viewer that embeds the Bubblemaps iframe (real map UI)."""
    safe_title = (title or "Bubblemaps").replace("<", "").replace(">", "")[:80]
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{safe_title} · Bubblemaps</title>
  <style>
    html, body {{ margin:0; padding:0; height:100%; background:#0b0f14; color:#e8eef6;
      font-family: system-ui, Segoe UI, sans-serif; overflow:hidden; }}
    .bar {{ height:40px; display:flex; align-items:center; gap:12px; padding:0 14px;
      background:#12181f; border-bottom:1px solid #2a3544; font-size:13px; }}
    .bar a {{ color:#5b8def; }}
    .bar span {{ color:#8b9bb0; }}
    iframe {{ border:0; width:100%; height:calc(100% - 40px); display:block; background:#000; }}
  </style>
</head>
<body>
  <div class="bar">
    <strong>{safe_title}</strong>
    <span>· interactive Bubblemaps</span>
    <a href="{iframe_url}" target="_blank" rel="noopener">Open map URL</a>
  </div>
  <iframe
    src="{iframe_url}"
    allow="clipboard-write; fullscreen"
    allowfullscreen
    referrerpolicy="no-referrer-when-downgrade"
    title="Bubblemaps"
  ></iframe>
</body>
</html>
"""
    # Prefer project cache dir so path is stable; fallback to temp
    try:
        cache = project_root() / "data" / "cache"
        cache.mkdir(parents=True, exist_ok=True)
        path = cache / "bubblemaps_view.html"
    except Exception:  # noqa: BLE001
        path = Path(tempfile.gettempdir()) / "leonidas_bubblemaps_view.html"
    path.write_text(html, encoding="utf-8")
    return path


def open_bubblemap_view(
    maps_payload: dict[str, Any],
    *,
    prefer_window: bool = True,
) -> dict[str, Any]:
    """
    Open Bubblemaps with live data in the system browser.

    Always prefer HTTPS V2/app URLs. Never rely on file:// HTML embeds
    (blocked by Bubblemaps CSP → blank map).
    """
    v2 = (maps_payload.get("v2_url") or "").strip()
    app = (maps_payload.get("app_url") or "").strip()
    iframe = (maps_payload.get("iframe_url") or "").strip()
    primary = (
        (maps_payload.get("primary_url") or "").strip()
        or v2
        or app
        or iframe
    )
    if not primary:
        return {
            "ok": False,
            "error": maps_payload.get("error") or "No Bubblemaps URL available.",
        }

    title = (
        f"{maps_payload.get('name') or ''} ${maps_payload.get('symbol') or ''}".strip()
        or "Token"
    )

    # 1) Robust external browser open (critical for frozen Windows .exe)
    ok, method = open_url_external(primary)
    if ok:
        return {
            "ok": True,
            "method": method,
            "url": primary,
            "v2_url": v2 or None,
            "app_url": app or None,
            "iframe_url": iframe or None,
        }

    # 2) Optional pywebview on the HTTPS URL
    if prefer_window:
        try:
            import webview  # type: ignore

            def _run() -> None:
                webview.create_window(
                    f"Actual Data Token Checker · Maps · {title}",
                    primary,
                    width=1200,
                    height=800,
                )
                webview.start()

            threading.Thread(target=_run, daemon=True).start()
            return {
                "ok": True,
                "method": "pywebview",
                "url": primary,
                "v2_url": v2 or None,
                "app_url": app or None,
                "iframe_url": iframe or None,
            }
        except Exception as exc:  # noqa: BLE001
            method = f"{method}; pywebview: {exc}"

    # 3) Try alternate HTTPS URLs
    for alt in (v2, app, iframe):
        if not alt or alt == primary:
            continue
        ok2, method2 = open_url_external(alt)
        if ok2:
            return {
                "ok": True,
                "method": method2,
                "url": alt,
                "v2_url": v2 or None,
                "app_url": app or None,
                "iframe_url": iframe or None,
                "warning": f"primary open failed ({method}); used alternate",
            }

    return {
        "ok": False,
        "error": (
            f"Could not open browser for Bubblemaps ({method}). "
            f"Copy this URL manually: {primary}"
        ),
        "url": primary,
        "v2_url": v2 or None,
        "app_url": app or None,
        "iframe_url": iframe or None,
    }


def format_maps_text(data: dict[str, Any]) -> str:
    # Section markers (── TITLE ──) are colored dim-green in the UI.
    lines = [
        "=" * 72,
        "── MAPS — Bubblemaps ──",
        "  Wallet clusters & token distribution (live Bubblemaps UI)",
        "=" * 72,
        "",
    ]
    if not data.get("ok"):
        lines.append(f"  {data.get('error') or 'unavailable'}")
        lines.append("")
        lines.append("  Run Analyze with chain set (e.g. solana), then click Maps.")
        lines.append("  Or click a blue Bubblemaps link below when available.")
        return "\n".join(lines) + "\n"

    lines.append("── TOKEN ──")
    lines.append(f"  Token:     {data.get('name') or ''} (${data.get('symbol') or '?'})")
    lines.append(f"  Chain:     {data.get('chain_id')}  →  Bubblemaps: {data.get('bubble_chain')}")
    lines.append(f"  Address:   {data.get('token_address')}")
    lines.append(f"  Partner:   {data.get('partner_id')}")
    lines.append("")
    lines.append("── HOW TO VIEW ──")
    lines.append("  Click Maps — opens Bubblemaps V2 in your default browser (live data).")
    lines.append("  Or click any blue URL below.")
    if data.get("viewer_method"):
        lines.append(f"  Opened via:  {data.get('viewer_method')}")
    if data.get("url"):
        lines.append(f"  Last opened: {data.get('url')}")
    lines.append("")
    lines.append("── MAP LINKS ──")
    lines.append("  (click blue → browser)")
    if data.get("v2_url") or data.get("primary_url"):
        lines.append(f"    V2 map:  {data.get('v2_url') or data.get('primary_url')}")
    if data.get("app_url"):
        lines.append(f"    App:     {data['app_url']}")
    if data.get("iframe_url"):
        lines.append(f"    Embed:   {data['iframe_url']}")
    if data.get("token_address"):
        addr = data.get("token_address")
        chain = (data.get("bubble_chain") or data.get("chain_id") or "").lower()
        if chain in {"solana", "sol", ""}:
            lines.append(f"    Solscan: https://solscan.io/token/{addr}")
        lines.append(f"    Address: {addr}")
    lines.append("")

    api = data.get("api") or {}
    if api.get("attempted"):
        lines.append("── DATA API ──")
        if api.get("ok"):
            lines.append(f"  Status:    ok · source {api.get('source')}")
            for k, v in (api.get("summary") or {}).items():
                lines.append(f"  {k}: {v}")
        else:
            lines.append(f"  Status:    {api.get('error') or 'failed'}")
        lines.append("")

    if data.get("notes"):
        lines.append(f"  Note: {data['notes']}")
    if data.get("warning"):
        lines.append(f"  Warning: {data['warning']}")
    return "\n".join(lines) + "\n"


def _try_data_api(bubble_chain: str, address: str) -> dict[str, Any]:
    """Best-effort Pro Data API call (requires BUBBLEMAPS_API_KEY)."""
    key = api_key()
    if not key:
        return {"attempted": False}
    headers = {"X-ApiKey": key, "Accept": "application/json"}
    # Common patterns — endpoints evolve; try a few safely
    candidates = [
        f"{API_BASE}/v0/tokens/{bubble_chain}/{address}",
        f"{API_BASE}/v0/map/{bubble_chain}/{address}",
        f"{API_BASE}/v1/tokens/{bubble_chain}/{address}",
    ]
    last_err = None
    for url in candidates:
        try:
            data = get_json(url, headers=headers, timeout=12.0, retries=0)
            if data is None:
                continue
            summary: dict[str, Any] = {}
            if isinstance(data, dict):
                for k in (
                    "name",
                    "symbol",
                    "holders",
                    "decentralization_score",
                    "score",
                    "clusters",
                ):
                    if k in data:
                        v = data[k]
                        if isinstance(v, (list, dict)):
                            summary[k] = f"{type(v).__name__} len={len(v)}"
                        else:
                            summary[k] = v
            return {
                "attempted": True,
                "ok": True,
                "source": url,
                "summary": summary or {"raw_type": type(data).__name__},
            }
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            continue
    return {
        "attempted": True,
        "ok": False,
        "error": last_err or "Data API unavailable",
    }
