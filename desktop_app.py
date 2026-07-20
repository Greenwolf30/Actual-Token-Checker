"""
Actual Data Token Checker desktop GUI (Tkinter) — for packaging as a Windows .exe.

Run:
  python desktop_app.py

Build:
  python build_exe.py
"""

from __future__ import annotations

import json
import queue
import re
import sys
import threading
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APP_NAME = "Actual Data Token Checker"

# Ensure package imports work when frozen / run from any cwd
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    BASE = Path(sys._MEIPASS)  # type: ignore[attr-defined]
    sys.path.insert(0, str(BASE))
else:
    BASE = Path(__file__).resolve().parent
    if str(BASE) not in sys.path:
        sys.path.insert(0, str(BASE))

from token_tracker.env_config import load_dotenv  # noqa: E402

# Load .env next to the .exe (frozen) or project root
load_dotenv()

# Critical for frozen Windows builds: pin CA bundle before any HTTPS
try:
    import certifi
    import os as _os

    _ca = certifi.where()
    if _ca:
        _os.environ.setdefault("SSL_CERT_FILE", _ca)
        _os.environ.setdefault("REQUESTS_CA_BUNDLE", _ca)
except Exception:  # noqa: BLE001
    pass

# Warm HTTP SSL context early so first Analyze does not fail obscurely
try:
    from token_tracker.http_util import ssl_context  # noqa: E402

    ssl_context()
except Exception:  # noqa: BLE001
    pass

from token_tracker.analyze import analyze_token  # noqa: E402
from token_tracker.report import (  # noqa: E402
    format_about_section,
    format_alerts_section,
    format_bundles_section,
    format_holders_section,
    format_maps_section,
    format_overview,
    format_pretty,
)

try:
    from market_data.client import (  # noqa: E402
        add_watch,
        api_healthy,
        fetch_intel_bundle,
        fetch_latest,
        fetch_pumpfun_list,
        fetch_token,
        feed_to_report_stub,
    )
except Exception:  # noqa: BLE001
    api_healthy = None  # type: ignore[assignment]
    fetch_token = None  # type: ignore[assignment]
    fetch_latest = None  # type: ignore[assignment]
    fetch_intel_bundle = None  # type: ignore[assignment]
    fetch_pumpfun_list = None  # type: ignore[assignment]
    add_watch = None  # type: ignore[assignment]
    feed_to_report_stub = None  # type: ignore[assignment]

try:
    from token_tracker import pumpfun as pf  # noqa: E402
except Exception:  # noqa: BLE001
    pf = None  # type: ignore[assignment]


CHAINS = [
    "any",
    "solana",
    "ethereum",
    "base",
    "bsc",
    "arbitrum",
    "polygon",
    "avalanche",
    "optimism",
    "robinhood",
    "sui",
    "ton",
    "tron",
]

QUICK = ["BONK", "WIF", "POPCAT", "PEPE", "TRUMP", "FARTCOIN"]

# Desktop search bar history (local file; not shipped in share package)
SEARCH_HISTORY_MAX = 5
# History Log tab: last N full analyzes (drops oldest on consecutive lookups over limit)
HISTORY_LOG_MAX = 200


def _app_data_dir() -> Path:
    """Writable dir next to .exe when frozen, else project root."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _search_history_path() -> Path:
    return _app_data_dir() / "search_history.json"


def _history_log_path() -> Path:
    return _app_data_dir() / "history_log.json"


def load_search_history() -> list[dict[str, Any]]:
    path = _search_history_path()
    try:
        if not path.is_file():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [h for h in data if isinstance(h, dict)][:SEARCH_HISTORY_MAX]
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return []


def save_search_history(items: list[dict[str, Any]]) -> None:
    path = _search_history_path()
    try:
        path.write_text(
            json.dumps(items[:SEARCH_HISTORY_MAX], indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass


def push_search_history(entry: dict[str, Any]) -> None:
    """Keep last N unique tokens (by address, else query+chain)."""
    query = (entry.get("query") or entry.get("symbol") or entry.get("address") or "").strip()
    if not query:
        return
    address = (entry.get("address") or "").strip()
    chain = (entry.get("chain") or "").strip().lower()
    symbol = (entry.get("symbol") or "").strip()
    name = (entry.get("name") or "").strip()

    row = {
        "query": query,
        "symbol": symbol or None,
        "name": name or None,
        "address": address or None,
        "chain": chain or None,
    }

    def _key(h: dict[str, Any]) -> str:
        addr = (h.get("address") or "").strip().lower()
        if addr:
            return f"a:{addr}"
        return f"q:{(h.get('query') or '').strip().lower()}|{(h.get('chain') or '').strip().lower()}"

    hist = [h for h in load_search_history() if _key(h) != _key(row)]
    hist.insert(0, row)
    save_search_history(hist[:SEARCH_HISTORY_MAX])


def _history_label(h: dict[str, Any]) -> str:
    sym = (h.get("symbol") or "").strip()
    q = (h.get("query") or "").strip()
    chain = (h.get("chain") or "").strip()
    addr = (h.get("address") or "").strip()
    head = sym or q or "token"
    if addr and len(addr) > 12:
        tail = f"{addr[:4]}…{addr[-4:]}"
    elif addr:
        tail = addr
    else:
        tail = ""
    parts = [head]
    if chain:
        parts.append(chain)
    if tail and tail.lower() != head.lower():
        parts.append(tail)
    return "  ·  ".join(parts)


def load_history_log() -> list[dict[str, Any]]:
    """Load History Log entries (newest first), max HISTORY_LOG_MAX."""
    path = _history_log_path()
    try:
        if not path.is_file():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [h for h in data if isinstance(h, dict)][:HISTORY_LOG_MAX]
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return []


def save_history_log(items: list[dict[str, Any]]) -> None:
    path = _history_log_path()
    try:
        path.write_text(
            json.dumps(items[:HISTORY_LOG_MAX], indent=2, default=str),
            encoding="utf-8",
        )
    except OSError:
        pass


def _fmt_usd_short(v: Any) -> str | None:
    try:
        if v is None or v == "":
            return None
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n >= 1_000_000_000:
        return f"${n / 1_000_000_000:.2f}B"
    if n >= 1_000_000:
        return f"${n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"${n / 1_000:.2f}K"
    if n >= 1:
        return f"${n:.4f}"
    return f"${n:.8f}".rstrip("0").rstrip(".")


def _fmt_pct_short(v: Any) -> str | None:
    try:
        if v is None or v == "":
            return None
        return f"{float(v):.2f}%"
    except (TypeError, ValueError):
        return None


# Cap text snapshots so 200 Logs entries stay reasonable on disk / browser storage
_LOGS_HOLDERS_SNAP_MAX = 12_000
_LOGS_BUNDLES_SNAP_MAX = 8_000


def _clip_snapshot(text: str | None, max_chars: int) -> str | None:
    """Trim a holders/bundles text snapshot for Logs storage."""
    if not text:
        return None
    s = str(text).strip()
    if not s:
        return None
    if len(s) <= max_chars:
        return s
    return (
        s[: max_chars - 80].rstrip()
        + "\n\n  … [snapshot truncated for Logs storage] …\n"
    )


def build_history_log_entry(
    report: dict[str, Any],
    *,
    query: str | None = None,
) -> dict[str, Any] | None:
    """Summarize one successful Analyze into a Logs row (incl. holders/bundles snaps)."""
    if not report or not report.get("ok"):
        return None
    tok = report.get("token") or {}
    mkt = report.get("market") or {}
    pair = mkt.get("pair") if isinstance(mkt.get("pair"), dict) else {}
    holders = report.get("holders") or {}
    hsum = holders.get("summary") or {}
    bundles = report.get("bundles") or {}
    bsum = bundles.get("summary") or {}
    alerts = report.get("alerts") or {}
    pf = report.get("pumpfun") or {}
    pc = mkt.get("price_change_pct") or {}

    address = (tok.get("address") or "").strip()
    symbol = (tok.get("symbol") or "").strip()
    name = (tok.get("name") or "").strip()
    chain = (tok.get("chain_id") or "").strip()
    q = (query or symbol or address or "").strip()
    if not q and not address and not symbol:
        return None

    # Text snapshots at lookup time (frozen copy — not live)
    holders_snap = None
    bundles_snap = None
    try:
        holders_snap = _clip_snapshot(
            format_holders_section(report), _LOGS_HOLDERS_SNAP_MAX
        )
    except Exception:  # noqa: BLE001
        holders_snap = None
    try:
        bundles_snap = _clip_snapshot(
            format_bundles_section(report), _LOGS_BUNDLES_SNAP_MAX
        )
    except Exception:  # noqa: BLE001
        bundles_snap = None

    entry: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "query": q,
        "symbol": symbol or None,
        "name": name or None,
        "address": address or None,
        "chain": chain or None,
        "dex_id": (pair.get("dex_id") or pf.get("dex_id") or None),
        "pair_address": pair.get("pair_address"),
        "price_usd": mkt.get("price_usd"),
        "market_cap_usd": mkt.get("market_cap_usd") or mkt.get("fdv_usd"),
        "liquidity_usd": mkt.get("liquidity_usd"),
        "volume_h24_usd": mkt.get("volume_h24_usd"),
        "price_change_h24_pct": pc.get("h24") if isinstance(pc, dict) else None,
        "concentration_risk": hsum.get("concentration_risk"),
        "top1_pct": hsum.get("top1_pct"),
        "top5_pct": hsum.get("top5_pct"),
        "top10_pct": hsum.get("top10_pct"),
        "holders_ok": bool(holders.get("ok")),
        "bundle_risk": bsum.get("bundle_risk"),
        "bundle_pct": bsum.get("estimated_bundle_pct")
        or bsum.get("total_bundle_pct")
        or bsum.get("bundle_pct"),
        "alerts_priority_count": int(alerts.get("priority_count") or 0),
        "pumpfun": {
            "is_pump_mint": pf.get("is_pump_mint"),
            "status": pf.get("status"),
            "graduated": pf.get("graduated"),
            "on_bonding_curve": pf.get("on_bonding_curve"),
        }
        if pf
        else None,
        "pair_url": pair.get("url"),
        # Frozen text "screenshots" of Holders + Bundles at Analyze time
        "holders_snapshot": holders_snap,
        "bundles_snapshot": bundles_snap,
    }
    return entry


def push_history_log(entry: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Prepend entry; keep only HISTORY_LOG_MAX (drop oldest when over 200).
    Returns the updated list (newest first).
    """
    if not entry:
        return load_history_log()
    items = load_history_log()
    # Prefer unique by address when present, else query+chain+ts keeps separate runs
    addr = (entry.get("address") or "").strip().lower()
    # Always add a new search row (history of searches), do not merge same token
    items.insert(0, entry)
    items = items[:HISTORY_LOG_MAX]
    save_history_log(items)
    return items


def format_history_log_text(items: list[dict[str, Any]] | None = None) -> str:
    """Human-readable History Log for the tab."""
    rows = items if items is not None else load_history_log()
    lines = [
        "=" * 72,
        "  LOGS",
        f"  Last {HISTORY_LOG_MAX} token searches (oldest dropped when full)",
        f"  Stored: {_history_log_path()}",
        "=" * 72,
        "",
    ]
    if not rows:
        lines.append("  No searches yet.")
        lines.append("  Run Analyze — each successful lookup is logged here.")
        lines.append("")
        lines.append("  Use Download to save this log as a text/JSON file.")
        return "\n".join(lines) + "\n"

    lines.append(f"  Entries: {len(rows)} / {HISTORY_LOG_MAX}")
    lines.append("")
    for i, e in enumerate(rows, 1):
        ts = (e.get("ts") or "")[:19].replace("T", " ")
        if ts:
            ts = f"{ts} UTC"
        sym = e.get("symbol") or e.get("query") or "token"
        name = e.get("name") or ""
        chain = e.get("chain") or "—"
        addr = e.get("address") or ""
        title = f"{sym}"
        if name and name.upper() != str(sym).upper():
            title = f"{sym}  ({name})"
        lines.append(f"  {i:2}. {title}")
        lines.append(f"      When:   {ts or '—'}")
        lines.append(f"      Chain:  {chain}  ·  DEX: {e.get('dex_id') or '—'}")
        if addr:
            lines.append(f"      Mint:   {addr}")
        if e.get("query") and str(e.get("query")) not in {sym, addr}:
            lines.append(f"      Query:  {e.get('query')}")
        price = _fmt_usd_short(e.get("price_usd"))
        mcap = _fmt_usd_short(e.get("market_cap_usd"))
        liq = _fmt_usd_short(e.get("liquidity_usd"))
        vol = _fmt_usd_short(e.get("volume_h24_usd"))
        chg = _fmt_pct_short(e.get("price_change_h24_pct"))
        mbits = []
        if price:
            mbits.append(f"price {price}")
        if mcap:
            mbits.append(f"mcap {mcap}")
        if liq:
            mbits.append(f"liq {liq}")
        if vol:
            mbits.append(f"vol24 {vol}")
        if chg:
            mbits.append(f"24h {chg}")
        if mbits:
            lines.append(f"      Market: {' · '.join(mbits)}")
        t1 = _fmt_pct_short(e.get("top1_pct"))
        t5 = _fmt_pct_short(e.get("top5_pct"))
        t10 = _fmt_pct_short(e.get("top10_pct"))
        risk = e.get("concentration_risk") or "—"
        if e.get("holders_ok") or t1 or t5 or t10:
            lines.append(
                f"      Holders: risk {risk}  ·  "
                f"Top1 {t1 or '—'} · Top5 {t5 or '—'} · Top10 {t10 or '—'}"
            )
        br = e.get("bundle_risk")
        bp = _fmt_pct_short(e.get("bundle_pct"))
        if br or bp:
            lines.append(
                f"      Bundles: risk {br or '—'}  ·  share {bp or '—'}"
            )
        ac = int(e.get("alerts_priority_count") or 0)
        lines.append(f"      Alerts:  {ac} top-priority warning(s)")
        pfm = e.get("pumpfun") or {}
        if isinstance(pfm, dict) and (
            pfm.get("is_pump_mint")
            or pfm.get("status")
            or pfm.get("on_bonding_curve")
        ):
            lines.append(
                f"      Pump:    mint={pfm.get('is_pump_mint')}  "
                f"status={pfm.get('status') or '—'}  "
                f"graduated={pfm.get('graduated')}"
            )
        if e.get("pair_url"):
            lines.append(f"      Link:    {e.get('pair_url')}")

        # Frozen Holders snapshot (text screenshot from lookup time)
        h_snap = (e.get("holders_snapshot") or "").strip()
        if h_snap:
            lines.append("")
            lines.append("      ── HOLDERS SNAPSHOT (at lookup) ──")
            for hl in h_snap.splitlines():
                lines.append(f"      {hl}" if hl.strip() else "")
        else:
            lines.append("      Holders snapshot: (none saved for this entry)")

        # Frozen Bundles snapshot
        b_snap = (e.get("bundles_snapshot") or "").strip()
        if b_snap:
            lines.append("")
            lines.append("      ── BUNDLES SNAPSHOT (at lookup) ──")
            for bl in b_snap.splitlines():
                lines.append(f"      {bl}" if bl.strip() else "")
        else:
            lines.append("      Bundles snapshot: (none saved for this entry)")

        lines.append("")
        lines.append("  " + ("-" * 40))
        lines.append("")
    lines.append("  — end of logs —")
    lines.append("  Download saves this view (or JSON) to a file.")
    return "\n".join(lines) + "\n"


def run_gui() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, scrolledtext, ttk

    # Professional slate / indigo palette (sleek, low-glare)
    BG = "#0b0f14"
    SURFACE = "#12181f"
    PANEL = "#151c25"
    CARD = "#1a222d"
    BORDER = "#2a3544"
    FG = "#e8eef6"
    MUTED = "#8b9bb0"
    ACCENT = "#5b8def"
    ACCENT_DIM = "#3d5f9a"
    SUCCESS = "#3dd68c"
    DANGER = "#f07178"
    WARNING = "#e0b35a"
    ORANGE = "#ff9f0a"
    # Dim / muted shades for wallet-holder % only (holders / alerts / bundle total)
    PCT_LOW = "#6a9e78"
    PCT_MEDIUM = "#b8a85c"
    PCT_HIGH = "#b8864a"
    PCT_CRITICAL = "#b86b66"
    ENTRY_BG = "#0e141c"
    # Supply % (not price change): 2–5 low, 5–10 medium, 10–15 high, ≥15 critical
    HOLDER_PCT_RE = re.compile(r"(?<![+\-\d.])(\d+(?:\.\d+)?)(%)")
    HOLDER_PRI_RE = re.compile(
        r"(\[(?:low|medium|high|critical)\s+priority\])"
        r"|(·\s*)(low|medium|high|critical)(\s+priority)",
        re.I,
    )
    FONT = "Segoe UI"
    FONT_MONO = "Cascadia Mono"

    root = tk.Tk()
    root.title(APP_NAME)
    root.geometry("1120x760")
    root.minsize(960, 640)
    root.configure(bg=BG)
    try:
        root.option_add("*Font", (FONT, 10))
    except tk.TclError:
        pass

    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass

    style.configure("TFrame", background=BG)
    style.configure("Card.TFrame", background=SURFACE)
    style.configure("TLabel", background=BG, foreground=FG, font=(FONT, 10))
    style.configure("Card.TLabel", background=SURFACE, foreground=FG, font=(FONT, 10))
    style.configure(
        "Title.TLabel",
        background=BG,
        foreground=FG,
        font=(FONT, 20, "bold"),
    )
    style.configure(
        "Sub.TLabel",
        background=BG,
        foreground=MUTED,
        font=(FONT, 9),
    )
    style.configure(
        "CardSub.TLabel",
        background=SURFACE,
        foreground=MUTED,
        font=(FONT, 9),
    )
    style.configure(
        "Section.TLabel",
        background=SURFACE,
        foreground=MUTED,
        font=(FONT, 8, "bold"),
    )
    style.configure(
        "TButton",
        font=(FONT, 9),
        padding=(12, 6),
        background=CARD,
        foreground=FG,
        borderwidth=0,
        focuscolor=SURFACE,
    )
    style.map(
        "TButton",
        background=[("active", ACCENT_DIM), ("pressed", ACCENT), ("disabled", "#1a1f28")],
        foreground=[("disabled", "#5a6575")],
    )
    style.configure(
        "Accent.TButton",
        font=(FONT, 9, "bold"),
        padding=(14, 7),
        background=ACCENT,
        foreground="#0b0f14",
    )
    style.map(
        "Accent.TButton",
        background=[("active", "#7aa3f5"), ("pressed", "#4a7ad4"), ("disabled", "#2a3a55")],
        foreground=[("disabled", "#8a93a3")],
    )
    style.configure(
        "Ghost.TButton",
        font=(FONT, 9),
        padding=(10, 5),
        background=SURFACE,
        foreground=MUTED,
    )
    style.map("Ghost.TButton", background=[("active", CARD)], foreground=[("active", FG)])
    style.configure(
        "TCombobox",
        fieldbackground=ENTRY_BG,
        background=ENTRY_BG,
        foreground=FG,
        arrowcolor=MUTED,
        bordercolor=BORDER,
        lightcolor=BORDER,
        darkcolor=BORDER,
        padding=4,
    )
    style.map(
        "TCombobox",
        fieldbackground=[("readonly", ENTRY_BG)],
        selectbackground=[("readonly", ACCENT_DIM)],
        selectforeground=[("readonly", FG)],
    )
    style.configure("TCheckbutton", background=BG, foreground=FG)
    style.configure("Horizontal.TSeparator", background=BORDER)

    result_q: queue.Queue = queue.Queue()
    last_report: dict[str, Any] | None = None
    last_url: str | None = None
    analyzing = {"busy": False, "gen": 0}
    # Always default to live APIs — local stack is optional and often offline
    data_source = tk.StringVar(value="Live DexScreener (full report)")

    # ── Header ─────────────────────────────────────────────────────────
    header = tk.Frame(root, bg=BG)
    header.pack(fill="x", padx=22, pady=(18, 6))

    brand = tk.Frame(header, bg=BG)
    brand.pack(side="left", fill="y")
    tk.Label(
        brand,
        text=APP_NAME,
        bg=BG,
        fg=FG,
        font=(FONT, 20, "bold"),
    ).pack(anchor="w")
    tk.Label(
        brand,
        text=(
            "Token intelligence  ·  Overview · Holders · Bundles · Alerts · "
            "Maps · About · Logs"
        ),
        bg=BG,
        fg=MUTED,
        font=(FONT, 9),
    ).pack(anchor="w", pady=(2, 0))

    # ── Data source card ───────────────────────────────────────────────
    mode_box = tk.Frame(root, bg=SURFACE, highlightbackground=BORDER, highlightthickness=1)
    mode_box.pack(fill="x", padx=22, pady=(10, 4))
    mode_inner = tk.Frame(mode_box, bg=SURFACE)
    mode_inner.pack(fill="x", padx=14, pady=12)

    tk.Label(
        mode_inner,
        text="DATA SOURCE",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8, "bold"),
    ).pack(side="left", padx=(0, 10))

    source_box = ttk.Combobox(
        mode_inner,
        textvariable=data_source,
        values=[
            "Live DexScreener (full report)",
            "Local feed (stack @ :8787)",
        ],
        width=32,
        state="readonly",
    )
    source_box.pack(side="left", padx=(0, 14))

    # Connection light: GREEN only when Local feed is selected AND stack responds.
    # Live DexScreener never shows green (even if the stack process happens to be up).
    api_status = tk.Label(
        mode_inner,
        text="● —",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 9, "bold"),
    )
    api_status.pack(side="left", padx=(0, 12))

    mode_hint = tk.Label(
        mode_inner,
        text="Green only when Local feed + stack connected",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8),
    )
    mode_hint.pack(side="right")

    def use_local_feed() -> bool:
        return "Local feed" in (data_source.get() or "")

    _health_busy = {"on": False}
    _stack_ok = {"value": False}

    def _apply_api_status(ok: bool | None, *, missing: bool = False) -> None:
        """
        Green ONLY if:
          1) data source is Local feed (stack), AND
          2) market API :8787 health check succeeds.

        Live DexScreener selection must never paint the light green.
        """
        local = use_local_feed()
        stack_up = False if missing else bool(ok)
        _stack_ok["value"] = stack_up

        if not local:
            # Live mode — never green. Stack may still be running in background; ignore for color.
            api_status.configure(text="● Live (not stack)", fg=MUTED)
            if missing:
                mode_hint.configure(text="Live DexScreener — stack module not in this build")
            elif stack_up:
                mode_hint.configure(
                    text="Live mode active — stack is up but unused (switch to Local for green)"
                )
            else:
                mode_hint.configure(
                    text="Live mode active — stack offline (OK). Green only on Local + stack"
                )
            return

        # Local feed mode — green only when stack is actually connected
        if missing:
            api_status.configure(text="● Stack unavailable", fg=DANGER)
            mode_hint.configure(text="Stack code missing — Local feed cannot work")
            return
        if stack_up:
            api_status.configure(text="● Stack CONNECTED", fg=SUCCESS)
            mode_hint.configure(text="Local feed connected to stack @ :8787")
        else:
            api_status.configure(text="● Stack DISCONNECTED", fg=DANGER)
            mode_hint.configure(
                text="Local feed selected but stack offline — run start_market_stack.bat"
            )

    def refresh_api_status() -> None:
        if api_healthy is None:
            _apply_api_status(False, missing=True)
            return
        if _health_busy["on"]:
            return
        _health_busy["on"] = True

        def _probe() -> None:
            try:
                ok = bool(api_healthy(timeout=0.7))
            except Exception:  # noqa: BLE001
                ok = False
            try:
                root.after(0, lambda o=ok: _apply_api_status(o))
            except Exception:  # noqa: BLE001
                pass
            finally:
                _health_busy["on"] = False

        threading.Thread(target=_probe, daemon=True).start()

    def _on_source_change(_event: Any = None) -> None:
        # Instant UI update for mode (Live → never green), then confirm stack probe
        _apply_api_status(_stack_ok["value"])
        refresh_api_status()

    source_box.bind("<<ComboboxSelected>>", _on_source_change)

    def _api_status_tick() -> None:
        refresh_api_status()
        root.after(5000, _api_status_tick)

    # Default is Live → muted, never green until user picks Local + stack is up
    _apply_api_status(False)
    refresh_api_status()
    root.after(1500, _api_status_tick)

    # ── Search bar ─────────────────────────────────────────────────────
    bar_wrap = tk.Frame(root, bg=SURFACE, highlightbackground=BORDER, highlightthickness=1)
    bar_wrap.pack(fill="x", padx=22, pady=(10, 4))
    bar = tk.Frame(bar_wrap, bg=SURFACE)
    bar.pack(fill="x", padx=12, pady=12)

    tk.Label(bar, text="TOKEN", bg=SURFACE, fg=MUTED, font=(FONT, 8, "bold")).pack(
        side="left", padx=(0, 8)
    )
    query_var = tk.StringVar()
    # Token field + hover history dropdown (last 5 successful checks)
    token_field = tk.Frame(bar, bg=SURFACE)
    token_field.pack(side="left", fill="x", expand=True, padx=(0, 12))
    entry = tk.Entry(
        token_field,
        textvariable=query_var,
        bg=ENTRY_BG,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        font=(FONT, 11),
        highlightthickness=1,
        highlightbackground=BORDER,
        highlightcolor=ACCENT,
    )
    entry.pack(fill="x", expand=True, ipady=8)
    hist_hint = tk.Label(
        token_field,
        text="hover for recent (up to 5)",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 7),
        anchor="w",
    )
    hist_hint.pack(fill="x", pady=(2, 0))

    tk.Label(bar, text="CHAIN", bg=SURFACE, fg=MUTED, font=(FONT, 8, "bold")).pack(
        side="left", padx=(0, 6)
    )
    chain_var = tk.StringVar(value="solana")
    chain_box = ttk.Combobox(
        bar, textvariable=chain_var, values=CHAINS, width=11, state="readonly"
    )
    chain_box.pack(side="left", padx=(0, 4))

    status_var = tk.StringVar(value="Ready")
    status = tk.Label(
        root,
        textvariable=status_var,
        bg=BG,
        fg=MUTED,
        font=(FONT, 9),
        anchor="w",
    )
    status.pack(fill="x", padx=24, pady=(6, 2))

    # ── Recent search history dropdown (hover / focus on token bar) ─────
    history_ui: dict[str, Any] = {
        "popup": None,
        "listbox": None,
        "items": [],
        "hide_job": None,
        "over_popup": False,
    }

    def _cancel_hide_history() -> None:
        job = history_ui.get("hide_job")
        if job is not None:
            try:
                root.after_cancel(job)
            except Exception:  # noqa: BLE001
                pass
            history_ui["hide_job"] = None

    def hide_history_dropdown(_event: Any = None) -> None:
        pop = history_ui.get("popup")
        if pop is not None:
            try:
                pop.destroy()
            except Exception:  # noqa: BLE001
                pass
        history_ui["popup"] = None
        history_ui["listbox"] = None
        history_ui["items"] = []
        history_ui["over_popup"] = False
        _cancel_hide_history()

    def _schedule_hide_history() -> None:
        _cancel_hide_history()

        def _maybe_hide() -> None:
            history_ui["hide_job"] = None
            if history_ui.get("over_popup"):
                return
            # Still over entry? keep open
            try:
                x, y = root.winfo_pointerxy()
                w = root.winfo_containing(x, y)
                if w is not None and (
                    w == entry
                    or str(w).startswith(str(entry))
                    or w in (token_field, hist_hint)
                ):
                    return
            except Exception:  # noqa: BLE001
                pass
            hide_history_dropdown()

        history_ui["hide_job"] = root.after(220, _maybe_hide)

    def apply_history_item(item: dict[str, Any], *, run: bool = True) -> None:
        hide_history_dropdown()
        q = (item.get("address") or item.get("query") or item.get("symbol") or "").strip()
        if not q:
            return
        query_var.set(q)
        ch = (item.get("chain") or "").strip()
        if ch and ch in CHAINS:
            chain_var.set(ch)
        entry.icursor("end")
        entry.focus_set()
        if run:
            start_analyze()

    def show_history_dropdown(_event: Any = None) -> None:
        items = load_search_history()
        if not items:
            return
        _cancel_hide_history()
        # Refresh existing popup if open
        hide_history_dropdown()
        history_ui["items"] = items

        pop = tk.Toplevel(root)
        pop.overrideredirect(True)
        pop.configure(bg=BORDER)
        try:
            pop.attributes("-topmost", True)
        except Exception:  # noqa: BLE001
            pass
        history_ui["popup"] = pop

        inner = tk.Frame(pop, bg=CARD, highlightthickness=0)
        inner.pack(fill="both", expand=True, padx=1, pady=1)

        tk.Label(
            inner,
            text="Recent tokens",
            bg=CARD,
            fg=MUTED,
            font=(FONT, 8, "bold"),
            anchor="w",
        ).pack(fill="x", padx=8, pady=(6, 2))

        lb = tk.Listbox(
            inner,
            height=min(len(items), SEARCH_HISTORY_MAX),
            bg=ENTRY_BG,
            fg=FG,
            selectbackground=ACCENT_DIM,
            selectforeground=FG,
            activestyle="none",
            relief="flat",
            highlightthickness=0,
            font=(FONT, 10),
            borderwidth=0,
            exportselection=False,
        )
        lb.pack(fill="both", expand=True, padx=4, pady=(0, 6))
        history_ui["listbox"] = lb

        labels = [_history_label(h) for h in items]
        for lab in labels:
            lb.insert("end", lab)

        def _pick(_e: Any = None) -> None:
            sel = lb.curselection()
            if not sel:
                return
            idx = int(sel[0])
            if 0 <= idx < len(history_ui["items"]):
                apply_history_item(history_ui["items"][idx], run=True)

        lb.bind("<<ListboxSelect>>", lambda _e: None)
        lb.bind("<ButtonRelease-1>", _pick)
        lb.bind("<Return>", _pick)
        lb.bind("<Escape>", lambda _e: hide_history_dropdown())

        def _over(_e: Any = None) -> None:
            history_ui["over_popup"] = True
            _cancel_hide_history()

        def _leave_pop(_e: Any = None) -> None:
            history_ui["over_popup"] = False
            _schedule_hide_history()

        pop.bind("<Enter>", _over)
        pop.bind("<Leave>", _leave_pop)
        lb.bind("<Enter>", _over)
        lb.bind("<Leave>", _leave_pop)

        # Place under the token entry
        try:
            root.update_idletasks()
            ex = entry.winfo_rootx()
            ey = entry.winfo_rooty() + entry.winfo_height() + 2
            ew = max(entry.winfo_width(), 280)
            row_h = 22
            eh = 28 + min(len(items), SEARCH_HISTORY_MAX) * row_h + 8
            pop.geometry(f"{ew}x{eh}+{ex}+{ey}")
        except Exception:  # noqa: BLE001
            pass

    def _on_entry_enter(_event: Any = None) -> None:
        show_history_dropdown()

    def _on_entry_leave(_event: Any = None) -> None:
        _schedule_hide_history()

    entry.bind("<Enter>", _on_entry_enter)
    entry.bind("<Leave>", _on_entry_leave)
    entry.bind("<FocusIn>", lambda _e: show_history_dropdown())
    entry.bind("<Escape>", lambda _e: hide_history_dropdown())
    hist_hint.bind("<Enter>", _on_entry_enter)
    hist_hint.bind("<Leave>", _on_entry_leave)
    token_field.bind("<Enter>", _on_entry_enter)

    def _click_outside_history(event: Any) -> None:
        pop = history_ui.get("popup")
        if pop is None:
            return
        try:
            w = event.widget
            if w in (entry, hist_hint, token_field) or w == history_ui.get("listbox"):
                return
            # clicks on popup children are ok
            if str(w).startswith(str(pop)):
                return
        except Exception:  # noqa: BLE001
            pass
        hide_history_dropdown()

    root.bind("<Button-1>", _click_outside_history, add="+")

    # ── Quick actions ──────────────────────────────────────────────────
    quick = tk.Frame(root, bg=BG)
    quick.pack(fill="x", padx=22, pady=(2, 6))
    tk.Label(quick, text="Quick", bg=BG, fg=MUTED, font=(FONT, 8, "bold")).pack(
        side="left", padx=(0, 10)
    )

    def set_query(q: str, chain: str | None = None) -> None:
        query_var.set(q)
        if chain:
            chain_var.set(chain)
        start_analyze()

    for sym in QUICK:
        ch = "ethereum" if sym == "PEPE" else "solana"
        ttk.Button(
            quick,
            text=sym,
            style="Ghost.TButton",
            command=lambda s=sym, c=ch: set_query(s, c),
        ).pack(side="left", padx=3)

    def show_pumpfun_board() -> None:
        """List Pump.fun tokens from local DB, or live DexScreener pumpfun feed."""
        if analyzing["busy"]:
            return
        analyzing["busy"] = True
        analyze_btn.configure(state="disabled")
        status_var.set("Loading Pump.fun board…")
        set_output("Loading Pump.fun tokens…\n", error=False)

        def _work() -> None:
            try:
                rows: list[dict[str, Any]] = []
                source = "live"
                if use_local_feed() and fetch_pumpfun_list and api_healthy and api_healthy(timeout=0.7):
                    rows = fetch_pumpfun_list(limit=30)
                    source = "local_db"
                if not rows and pf is not None:
                    pairs = pf.fetch_pumpfun_pairs(limit=30)
                    rows = [pf.pair_to_pump_record(p) for p in pairs]
                    source = "dexscreener_pumpfun"
                if not rows:
                    result_q.put(
                        (
                            "err",
                            "No Pump.fun data. Start the stack or check your internet.",
                        )
                    )
                    return
                lines = [
                    f"PUMP.FUN BOARD ({source}) — {len(rows)} tokens",
                    "Bonding curve & graduated pump mints via DexScreener pumpfun/pumpswap",
                    "",
                ]
                for i, r in enumerate(rows[:30], 1):
                    sym = r.get("symbol") or "?"
                    name = r.get("name") or ""
                    mint = r.get("mint") or ""
                    px = r.get("price_usd")
                    mc = r.get("market_cap_usd")
                    vol = r.get("volume_h24")
                    if r.get("on_bonding_curve"):
                        grad_s = "graduated: no"
                        curve = "BONDING"
                    elif r.get("graduated") is True or r.get("_graduated"):
                        grad_s = "graduated: yes"
                        curve = "GRADUATED"
                    else:
                        grad_s = "graduated: unknown"
                        curve = "GRAD/DEX"
                    try:
                        px_s = f"${float(px):.8f}" if px is not None else "n/a"
                    except (TypeError, ValueError):
                        px_s = str(px)
                    try:
                        mc_s = f"${float(mc):,.0f}" if mc is not None else "n/a"
                    except (TypeError, ValueError):
                        mc_s = str(mc)
                    try:
                        vol_s = f"${float(vol):,.0f}" if vol is not None else "n/a"
                    except (TypeError, ValueError):
                        vol_s = str(vol)
                    lines.append(f"{i:2}. ${sym}  {name}")
                    lines.append(
                        f"    {curve}  {grad_s}  price {px_s}  mcap {mc_s}  vol24 {vol_s}"
                    )
                    lines.append(f"    {mint}")
                    if r.get("pump_url") or r.get("url"):
                        lines.append(f"    {r.get('pump_url') or r.get('url')}")
                    lines.append("")
                lines.append("Tip: paste a mint ending in 'pump' and click Analyze for full report.")
                # display as special holders-style raw text
                result_q.put(
                    (
                        "ok",
                        {
                            "ok": True,
                            "generated_at": __import__("datetime")
                            .datetime.now(__import__("datetime").timezone.utc)
                            .isoformat(),
                            "token": {
                                "name": "Pump.fun",
                                "symbol": "PUMP",
                                "address": "",
                                "chain_id": "solana",
                            },
                            "market": {
                                "price_usd": None,
                                "market_cap_usd": None,
                                "fdv_usd": None,
                                "liquidity_usd": None,
                                "volume_h24_usd": None,
                                "price_change_pct": {},
                                "txns_h24": {},
                                "pair": {},
                            },
                            "initial_market_cap": {},
                            "all_time_high": {},
                            "socials": {},
                            "holders": {"ok": False},
                            "community_sentiment_x": {
                                "sentiment": {"label": "n/a", "score": None, "summary": ""},
                                "posts_analyzed": 0,
                                "sources_used": [],
                                "sample_posts": [],
                            },
                            "narrative": {
                                "headline": "Pump.fun board",
                                "paragraph": "",
                                "bullets": [],
                                "tags": ["pumpfun"],
                            },
                            "alternates": [],
                            "disclaimer": "Pump.fun data via DexScreener pumpfun index.",
                            "_raw_overview_text": "\n".join(lines),
                            "_focus_tab": "overview",
                        },
                    )
                )
            except Exception as exc:  # noqa: BLE001
                result_q.put(("err", str(exc)))

        threading.Thread(target=_work, daemon=True).start()

    ttk.Button(quick, text="Pump.fun", style="Ghost.TButton", command=show_pumpfun_board).pack(
        side="left", padx=(10, 3)
    )

    # ── Tabbed report panel ────────────────────────────────────────────
    out_wrap = tk.Frame(root, bg=SURFACE, highlightbackground=BORDER, highlightthickness=1)
    out_wrap.pack(fill="both", expand=True, padx=22, pady=(6, 8))

    out_header = tk.Frame(out_wrap, bg=SURFACE)
    out_header.pack(fill="x", padx=14, pady=(10, 0))
    tk.Label(
        out_header,
        text="REPORT",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8, "bold"),
    ).pack(side="left")
    tk.Label(
        out_header,
        text="Overview · Holders · Bundles · Alerts · Maps · About",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8),
    ).pack(side="right")

    style.configure("Report.TNotebook", background=SURFACE, borderwidth=0)
    style.configure(
        "Report.TNotebook.Tab",
        background=CARD,
        foreground=MUTED,
        padding=(14, 6),
        font=(FONT, 9, "bold"),
    )
    style.map(
        "Report.TNotebook.Tab",
        background=[("selected", ACCENT_DIM)],
        foreground=[("selected", FG)],
    )

    notebook = ttk.Notebook(out_wrap, style="Report.TNotebook")
    notebook.pack(fill="both", expand=True, padx=8, pady=(8, 8))

    tab_widgets: dict[str, Any] = {}
    tab_frames: dict[str, Any] = {}
    # Solana base58 addresses (no 0 O I l) — used for clickable Solscan links
    SOL_ADDR_RE = re.compile(r"\b[1-9A-HJ-NP-Za-km-z]{32,44}\b")
    # http(s) URLs — About / News / Links section clickable links
    URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
    # Bare www. domains
    WWW_RE = re.compile(r"\bwww\.[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:/[^\s<>\"')\]]*)?", re.I)
    # @handles → X profile (alias HANDLE_RE so both names work)
    AT_RE = re.compile(r"(?<![A-Za-z0-9_])@([A-Za-z0-9_]{1,30})\b")
    HANDLE_RE = AT_RE
    holders_search_var = tk.StringVar()
    holders_view_mode = {"mode": "list"}  # list | lookup | filter

    def _make_tab(key: str, title: str, placeholder: str) -> None:
        frame = tk.Frame(notebook, bg=PANEL)
        notebook.add(frame, text=title)
        box = scrolledtext.ScrolledText(
            frame,
            wrap="word",
            bg=PANEL,
            fg=FG,
            insertbackground=FG,
            relief="flat",
            font=(FONT_MONO, 10),
            padx=16,
            pady=14,
            borderwidth=0,
            highlightthickness=0,
            selectbackground=ACCENT_DIM,
            selectforeground=FG,
        )
        box.pack(fill="both", expand=True)
        box.tag_configure("err", foreground=DANGER)
        box.tag_configure("muted", foreground=MUTED)
        box.insert("end", placeholder, "muted")
        box.configure(state="disabled")
        tab_widgets[key] = box
        tab_frames[key] = frame

    def _configure_link_tags(box: Any) -> None:
        box.tag_configure("err", foreground=DANGER)
        box.tag_configure("muted", foreground=MUTED)
        box.tag_configure(
            "wallet_link",
            foreground="#6cb6ff",
            underline=True,
        )
        # Wallet address hold colors — dim (match pct_medium / pct_critical)
        box.tag_configure(
            "wallet_hold_yellow",
            foreground=PCT_MEDIUM,  # dim yellow >5%
            underline=True,
        )
        box.tag_configure(
            "wallet_hold_red",
            foreground=PCT_CRITICAL,  # dim red >10%
            underline=True,
        )
        # Color tags must outrank default wallet_link blue
        try:
            box.tag_raise("wallet_hold_yellow")
            box.tag_raise("wallet_hold_red")
        except Exception:  # noqa: BLE001
            pass
        box.tag_configure(
            "url_link",
            foreground="#6cb6ff",
            underline=True,
        )
        box.tag_configure("hint", foreground=MUTED)
        # Wallet holder % / priority labels (lighter shades)
        box.tag_configure("pct_low", foreground=PCT_LOW)
        box.tag_configure("pct_medium", foreground=PCT_MEDIUM)
        box.tag_configure("pct_high", foreground=PCT_HIGH)
        box.tag_configure("pct_critical", foreground=PCT_CRITICAL)
        box.tag_configure("pri_low", foreground=PCT_LOW)
        box.tag_configure("pri_medium", foreground=PCT_MEDIUM)
        box.tag_configure("pri_high", foreground=PCT_HIGH)
        box.tag_configure("pri_critical", foreground=PCT_CRITICAL)

    def _pct_priority_tag(pct_value: float) -> str | None:
        """Map supply % → Text tag name (wallet holder bands)."""
        if pct_value >= 15:
            return "pct_critical"
        if pct_value >= 10:
            return "pct_high"
        if pct_value > 5:
            return "pct_medium"
        if pct_value >= 2:
            return "pct_low"
        return None

    def _tag_range_under_cursor(box: Any, event: Any, tag: str) -> str | None:
        """Return text of `tag` under cursor, if any."""
        try:
            idx = box.index(f"@{event.x},{event.y}")
        except Exception:  # noqa: BLE001
            return None
        ranges = box.tag_ranges(tag)
        i = 0
        while i + 1 < len(ranges):
            start, end = ranges[i], ranges[i + 1]
            try:
                if box.compare(start, "<=", idx) and box.compare(idx, "<", end):
                    return box.get(start, end).strip()
            except Exception:  # noqa: BLE001
                pass
            i += 2
        return None

    def _open_solscan_for_index(box: Any, event: Any) -> None:
        """Open Solscan for the wallet_link tag under the cursor."""
        addr = _tag_range_under_cursor(box, event, "wallet_link")
        if addr:
            webbrowser.open(f"https://solscan.io/account/{addr}")

    def _open_external(url: str) -> None:
        """Open URL reliably (Windows + frozen exe)."""
        try:
            from token_tracker.bubblemaps import open_url_external

            ok, _method = open_url_external(url)
            if ok:
                return
        except Exception:  # noqa: BLE001
            pass
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass

    def _open_url_for_index(box: Any, event: Any) -> None:
        """Open url_link / handle_link / wallet under the cursor in the browser."""
        # Prefer explicit URL, then @handle, then Solana addr
        url = _tag_range_under_cursor(box, event, "url_link")
        if url:
            url = url.rstrip(".,;:)>\"'")
            if url.startswith("www."):
                url = "https://" + url
            if url.startswith("http://") or url.startswith("https://"):
                _open_external(url)
            return
        handle = _tag_range_under_cursor(box, event, "handle_link")
        if handle:
            handle = handle.lstrip("@").strip()
            if handle:
                _open_external(f"https://x.com/{handle}")
            return
        addr = _tag_range_under_cursor(box, event, "wallet_link")
        if addr:
            _open_external(f"https://solscan.io/account/{addr}")

    def _bind_url_links(box: Any) -> None:
        """Wire blue clickable URL / handle / wallet tags on a ScrolledText."""
        _configure_link_tags(box)
        box.tag_configure(
            "handle_link",
            foreground="#6cb6ff",
            underline=True,
        )
        for tag in ("url_link", "handle_link", "wallet_link"):
            box.tag_bind(tag, "<Button-1>", lambda e, b=box: _open_url_for_index(b, e))
            box.tag_bind(
                tag,
                "<Enter>",
                lambda _e, b=box: b.configure(cursor="hand2"),
            )
            box.tag_bind(
                tag,
                "<Leave>",
                lambda _e, b=box: b.configure(cursor="arrow"),
            )

    def _bundle_colorable_ranges(content: str) -> list[tuple[int, int]]:
        """
        Bundles tab: only Total % bundles + Suspect wallets TOTAL line get % colors.
        Per-wallet suspect rows stay uncolored.
        """
        ranges: list[tuple[int, int]] = []
        lines = content.splitlines(keepends=True)
        pos = 0
        for line in lines:
            end = pos + len(line)
            if re.search(r"Total\s*%\s*bundles\s*:", line, re.I):
                ranges.append((pos, end))
            elif re.search(r"Suspect\s+wallets", line, re.I) and re.search(
                r"total", line, re.I
            ):
                ranges.append((pos, end))
            pos = end
        return ranges

    def _in_any_range(idx: int, ranges: list[tuple[int, int]]) -> bool:
        for a, b in ranges:
            if a <= idx < b:
                return True
        return False

    def _line_containing(content: str, idx: int) -> str:
        """Return the full line of text that contains character index idx."""
        start = content.rfind("\n", 0, idx) + 1
        end = content.find("\n", idx)
        if end < 0:
            end = len(content)
        return content[start:end]

    def _prev_line(content: str, idx: int) -> str:
        """Line immediately above the line that contains idx (or empty)."""
        line_start = content.rfind("\n", 0, idx) + 1
        if line_start <= 0:
            return ""
        prev_end = line_start - 1
        prev_start = content.rfind("\n", 0, prev_end) + 1
        return content[prev_start:prev_end]

    def _line_hold_pct(line: str) -> float | None:
        """Bag % from 'holds X%' / '(X%' / 'owns X%' on a report line."""
        if not line:
            return None
        m = re.search(r"\bholds\s+(\d+(?:\.\d+)?)\s*%", line, re.I)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                return None
        m = re.search(r"\((\d+(?:\.\d+)?)\s*%", line)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                return None
        m = re.search(r"\bowns\s+(\d+(?:\.\d+)?)\s*%", line, re.I)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                return None
        return None

    # Known LP / program vaults — never address-color by bag % (holders.py)
    _KNOWN_LP_ADDRS = {
        "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
        "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
        "11111111111111111111111111111111",
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        "ComputeBudget111111111111111111111111111111",
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h",
        "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
        "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
        "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
        "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
        "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
        "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
        "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    }
    _LP_LABEL_RE = re.compile(
        r"\b("
        r"lp|liquidity|pool|vault|amm|clmm|dlmm|cpmm|"
        r"raydium|orca|meteora|whirlpool|pumpswap|pump\.fun|pumpfun|"
        r"openbook|serum|phoenix|lifinity|invariant|saber|mercurial|"
        r"market\s*maker|authority|program"
        r")\b",
        re.I,
    )

    def _next_line(content: str, idx: int) -> str:
        """Line immediately below the line that contains idx (or empty)."""
        line_end = content.find("\n", idx)
        if line_end < 0:
            return ""
        next_start = line_end + 1
        next_end = content.find("\n", next_start)
        if next_end < 0:
            next_end = len(content)
        return content[next_start:next_end]

    def _is_lp_context(content: str, addr: str, addr_start: int) -> bool:
        """Skip color for known LP / liquidity pair / program vaults."""
        if (addr or "").strip() in _KNOWN_LP_ADDRS:
            return True
        line = _line_containing(content, addr_start)
        prev = _prev_line(content, addr_start)
        nxt = _next_line(content, addr_start)
        blob = f"{prev}\n{line}\n{nxt}"
        if re.search(
            r"\bliquidity\s*pair\b|\bknown\s*program\b", blob, re.I
        ):
            return True
        for m in re.finditer(r"\[([^\]]+)\]", blob):
            if _LP_LABEL_RE.search(m.group(1)):
                return True
        if re.search(
            r"\[[^\]]*(?:lp|liquidity|pool|vault|amm|raydium|orca|meteora|"
            r"whirlpool|pump)[^\]]*\]",
            blob,
            re.I,
        ):
            return True
        return False

    def _wallet_hold_color_tag(
        content: str, addr: str, addr_start: int, enabled: bool
    ) -> str | None:
        """
        Shared address hold colors (Holders / Alerts / Bundles):
          > 10% → red
          > 5%  → yellow
        Known LP / liquidity pairs are never colored.
        """
        if not enabled:
            return None
        if _is_lp_context(content, addr, addr_start):
            return None
        line = _line_containing(content, addr_start)
        pct = _line_hold_pct(line)
        if pct is None:
            pct = _line_hold_pct(_prev_line(content, addr_start))
        if pct is None:
            pct = _line_hold_pct(_next_line(content, addr_start))
        if pct is None:
            return None
        if pct > 10:
            return "wallet_hold_red"
        if pct > 5:
            return "wallet_hold_yellow"
        return None

    def _is_top_summary_line(line: str) -> bool:
        """
        True for concentration summary lines like:
          Top1 12.34% · Top5 30.00% · Top10 50.00%
        Those percentages stay default text color (no priority palette).
        """
        # Match Top1 / Top5 / Top10 appearing together or as a summary row
        has_top1 = bool(re.search(r"\bTop\s*1\b", line, re.I))
        has_top5 = bool(re.search(r"\bTop\s*5\b", line, re.I))
        has_top10 = bool(re.search(r"\bTop\s*10\b", line, re.I))
        return (has_top1 and has_top5) or (has_top1 and has_top10) or (
            has_top5 and has_top10
        ) or bool(re.search(r"\bTop\s*1\b.*\bTop\s*5\b.*\bTop\s*10\b", line, re.I))

    def _insert_text_with_wallet_links(
        box: Any,
        content: str,
        *,
        error: bool = False,
        color_holder_pct: bool = True,
        color_mode: str = "all",
        link_urls: bool = False,
        wallet_hold_color: bool = False,
    ) -> None:
        """
        Insert report text; Solana wallets + optional holder % priority colors.
        color_mode: "all" | "none" | "bundles" (total + suspect only)
        Top1/Top5/Top10 summary % values are never colored.
        link_urls: also make http(s) Solscan/etc. lines clickable (Holders).
        wallet_hold_color: address >5% yellow · >10% red (skip known LP).
        """
        _configure_link_tags(box)
        if link_urls:
            # Ensure URL clicks work (Creator / top-holder Solscan lines)
            box.tag_bind(
                "url_link",
                "<Button-1>",
                lambda e, b=box: _open_url_for_index(b, e),
            )
            box.tag_bind(
                "url_link",
                "<Enter>",
                lambda _e, b=box: b.configure(cursor="hand2"),
            )
            box.tag_bind(
                "url_link",
                "<Leave>",
                lambda _e, b=box: b.configure(cursor="arrow"),
            )
        # Colored wallet tags still open Solscan (same as wallet_link)
        for wtag in ("wallet_hold_yellow", "wallet_hold_red"):
            box.tag_bind(
                wtag, "<Button-1>", lambda e, b=box: _open_url_for_index(b, e)
            )
            box.tag_bind(
                wtag,
                "<Enter>",
                lambda _e, b=box: b.configure(cursor="hand2"),
            )
            box.tag_bind(
                wtag,
                "<Leave>",
                lambda _e, b=box: b.configure(cursor="arrow"),
            )
        box.configure(state="normal")
        box.delete("1.0", "end")
        if error:
            box.insert("end", content, "err")
            box.configure(state="disabled")
            box.see("1.0")
            return

        allow_pct = color_holder_pct and color_mode != "none"
        bundle_ranges = (
            _bundle_colorable_ranges(content) if color_mode == "bundles" else []
        )

        # Spans: (start, end, tag_or_tuple) — URLs + wallets + supply %
        spans: list[tuple[int, int, Any]] = []
        if link_urls:
            for m in URL_RE.finditer(content):
                raw = m.group(0)
                url = raw.rstrip(".,;:)>\"'")
                spans.append((m.start(), m.start() + len(url), "url_link"))
        for m in SOL_ADDR_RE.finditer(content):
            s, e = m.start(), m.end()
            # Skip address if it sits inside an already-tagged URL
            if any(
                s < pe and e > ps and tag == "url_link" for ps, pe, tag in spans
            ):
                continue
            addr = m.group(0)
            hold_tag = _wallet_hold_color_tag(
                content, addr, s, wallet_hold_color
            )
            if hold_tag:
                # Color tag first so its foreground wins; keep wallet_link for clicks
                spans.append((s, e, (hold_tag, "wallet_link")))
            else:
                spans.append((s, e, "wallet_link"))
        if allow_pct:
            for m in HOLDER_PCT_RE.finditer(content):
                if color_mode == "bundles" and not _in_any_range(
                    m.start(), bundle_ranges
                ):
                    continue
                # Leave Top1 / Top5 / Top10 summary line percentages uncolored
                line = _line_containing(content, m.start())
                if _is_top_summary_line(line):
                    continue
                try:
                    n = float(m.group(1))
                except ValueError:
                    continue
                tag = _pct_priority_tag(n)
                if tag:
                    spans.append((m.start(), m.end(), tag))
            # Do not color "[low priority]" / "· medium priority" labels — % only

        spans.sort(key=lambda t: (t[0], -(t[1] - t[0])))
        cleaned: list[tuple[int, int, Any]] = []
        last_end = -1
        for s, e, tag in spans:
            if s < last_end:
                continue
            cleaned.append((s, e, tag))
            last_end = e

        pos = 0
        for s, e, tag in cleaned:
            if s > pos:
                box.insert("end", content[pos:s])
            piece = content[s:e]
            if tag:
                box.insert("end", piece, tag)
            else:
                box.insert("end", piece)
            pos = e
        if pos < len(content):
            box.insert("end", content[pos:])
        box.configure(state="disabled")
        box.see("1.0")

    def _insert_text_with_url_links(box: Any, content: str, *, error: bool = False) -> None:
        """
        Insert About text with clickable:
          - http(s) URLs and www. domains
          - @handles → x.com
          - Solana addresses → solscan.io
        """
        _bind_url_links(box)
        box.configure(state="normal")
        box.delete("1.0", "end")
        if error:
            box.insert("end", content, "err")
            box.configure(state="disabled")
            box.see("1.0")
            return

        # Build non-overlapping match list: (start, end, kind, text)
        spans: list[tuple[int, int, str, str]] = []
        for m in URL_RE.finditer(content):
            raw = m.group(0)
            url = raw.rstrip(".,;:)>\"'")
            spans.append((m.start(), m.start() + len(url), "url", url))
        for m in WWW_RE.finditer(content):
            # skip if already inside an http match
            s, e = m.start(), m.end()
            if any(s < pe and e > ps for ps, pe, _, _ in spans):
                continue
            raw = m.group(0).rstrip(".,;:)>\"'")
            spans.append((s, s + len(raw), "url", raw))
        for m in AT_RE.finditer(content):
            s, e = m.start(), m.end()
            if any(s < pe and e > ps for ps, pe, _, _ in spans):
                continue
            spans.append((s, e, "handle", m.group(0)))
        for m in SOL_ADDR_RE.finditer(content):
            s, e = m.start(), m.end()
            if any(s < pe and e > ps for ps, pe, _, _ in spans):
                continue
            # Avoid tagging short noise inside words; length already 32–44
            spans.append((s, e, "wallet", m.group(0)))

        spans.sort(key=lambda t: t[0])
        # Drop overlaps keeping earlier (higher priority was added first for URLs)
        cleaned: list[tuple[int, int, str, str]] = []
        last_end = -1
        for s, e, kind, text in spans:
            if s < last_end:
                continue
            cleaned.append((s, e, kind, text))
            last_end = e

        pos = 0
        for s, e, kind, text in cleaned:
            if s > pos:
                box.insert("end", content[pos:s])
            tag = {
                "url": "url_link",
                "handle": "handle_link",
                "wallet": "wallet_link",
            }.get(kind, "url_link")
            box.insert("end", text, tag)
            pos = e
        if pos < len(content):
            box.insert("end", content[pos:])
        box.configure(state="disabled")
        box.see("1.0")

    def _render_holders_text(content: str, *, error: bool = False) -> None:
        box = tab_widgets.get("holders")
        if box is None:
            return
        # Wallets clickable; >5% yellow · >10% red · skip known LP
        _insert_text_with_wallet_links(
            box,
            content,
            error=error,
            link_urls=True,
            wallet_hold_color=True,
        )

    def _render_about_text(content: str, *, error: bool = False) -> None:
        box = tab_widgets.get("about")
        if box is None:
            return
        _insert_text_with_url_links(box, content, error=error)

    def _render_maps_text(content: str, *, error: bool = False) -> None:
        """Maps tab: clickable Bubblemaps / Solscan / http(s) links."""
        box = tab_widgets.get("maps")
        if box is None:
            return
        _insert_text_with_url_links(box, content, error=error)

    def _holders_base_text() -> str:
        """Current holders section from last report (unfiltered)."""
        if not last_report:
            return (
                "Holders appear here after Analyze (or click Holders).\n\n"
                "Use the search bar above to filter this list or look up any wallet\n"
                "via Pump.fun + Birdeye + DexScreener. Click a wallet to open Solscan."
            )
        try:
            return format_holders_section(last_report)
        except Exception:  # noqa: BLE001
            return "Holders unavailable.\n"

    def filter_holders_list(_event: Any = None) -> None:
        """Filter current top-holder list by wallet / label substring."""
        q = holders_search_var.get().strip()
        if not last_report or not (last_report.get("holders") or {}).get("ok"):
            if q and len(q) >= 32:
                # No holder list yet — treat as full wallet lookup
                lookup_holder_wallet()
                return
            status_var.set("Run Analyze or Holders first, then filter — or paste a full wallet to Lookup.")
            return
        if not q:
            holders_view_mode["mode"] = "list"
            _render_holders_text(_holders_base_text())
            status_var.set("Holders · full list")
            return
        try:
            from token_tracker.holders import format_holders_text
            from token_tracker.wallet_lookup import filter_holders_by_query

            filtered = filter_holders_by_query(last_report.get("holders") or {}, q)
            text = format_holders_text(filtered)
            header = (
                f"HOLDER FILTER · query={q!r} · "
                f"matched {filtered.get('filter_matched')}/{filtered.get('filter_total')}\n"
                f"Click any wallet address → Solscan\n\n"
            )
            holders_view_mode["mode"] = "filter"
            _render_holders_text(header + text)
            status_var.set(
                f"Holders filter · {filtered.get('filter_matched')}/"
                f"{filtered.get('filter_total')} match"
            )
            notebook.select(TAB_INDEX["holders"])
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Holders search", str(exc))

    def lookup_holder_wallet() -> None:
        """Pull Pump.fun + Birdeye + DexScreener data for the wallet in the search bar."""
        w = holders_search_var.get().strip()
        if not w:
            messagebox.showinfo(
                "Wallet lookup",
                "Paste a holder wallet address in the Holders search bar, then click Lookup.",
            )
            return
        if analyzing["busy"]:
            return
        status_var.set(f"Looking up wallet {w[:8]}…{w[-4:]}…")
        holders_view_mode["mode"] = "lookup"
        _render_holders_text(
            f"Looking up wallet…\n\n  {w}\n\n"
            "Sources: Pump.fun · Birdeye · DexScreener\n"
            "This may take a few seconds…\n"
        )
        notebook.select(TAB_INDEX["holders"])

        def _work() -> None:
            try:
                from token_tracker.wallet_lookup import (
                    format_wallet_lookup_text,
                    lookup_wallet,
                )

                data = lookup_wallet(w)
                text = format_wallet_lookup_text(data)
                result_q.put(("holders_lookup", text if data.get("ok") or text else "No data."))
            except Exception as exc:  # noqa: BLE001
                result_q.put(("holders_lookup_err", str(exc)))

        threading.Thread(target=_work, daemon=True).start()

    def clear_holders_search() -> None:
        holders_search_var.set("")
        holders_view_mode["mode"] = "list"
        _render_holders_text(_holders_base_text())
        status_var.set("Holders · full list")

    _make_tab(
        "overview",
        "Overview",
        "Enter a token symbol or contract address, then click Analyze.\n\n"
        "Overview shows market, ATH, Pump.fun graduated, and socials.",
    )

    # ── Holders tab (custom: search bar + clickable wallets) ───────────
    holders_frame = tk.Frame(notebook, bg=PANEL)
    notebook.add(holders_frame, text="Holders")
    holders_search_bar = tk.Frame(
        holders_frame, bg=SURFACE, highlightbackground=BORDER, highlightthickness=1
    )
    holders_search_bar.pack(fill="x", padx=8, pady=(8, 4))
    hs_inner = tk.Frame(holders_search_bar, bg=SURFACE)
    hs_inner.pack(fill="x", padx=8, pady=6)
    tk.Label(
        hs_inner,
        text="WALLET",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8, "bold"),
    ).pack(side="left", padx=(0, 8))
    holders_search_entry = tk.Entry(
        hs_inner,
        textvariable=holders_search_var,
        bg=ENTRY_BG,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        font=(FONT_MONO, 10),
        highlightthickness=1,
        highlightbackground=BORDER,
        highlightcolor=ACCENT,
    )
    holders_search_entry.pack(side="left", fill="x", expand=True, ipady=5, padx=(0, 8))
    ttk.Button(
        hs_inner, text="Filter list", style="Ghost.TButton", command=filter_holders_list
    ).pack(side="left", padx=2)
    ttk.Button(
        hs_inner,
        text="Lookup wallet",
        style="Accent.TButton",
        command=lookup_holder_wallet,
    ).pack(side="left", padx=2)
    ttk.Button(
        hs_inner, text="Clear", style="Ghost.TButton", command=clear_holders_search
    ).pack(side="left", padx=2)
    tk.Label(
        holders_frame,
        text=(
            "Filter searches this token’s holder list  ·  "
            "Lookup pulls Pump.fun + Birdeye + DexScreener for any wallet  ·  "
            "Click a blue address → Solscan"
        ),
        bg=PANEL,
        fg=MUTED,
        font=(FONT, 8),
        anchor="w",
    ).pack(fill="x", padx=12, pady=(0, 2))
    holders_box = scrolledtext.ScrolledText(
        holders_frame,
        wrap="word",
        bg=PANEL,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        font=(FONT_MONO, 10),
        padx=16,
        pady=14,
        borderwidth=0,
        highlightthickness=0,
        selectbackground=ACCENT_DIM,
        selectforeground=FG,
        cursor="arrow",
    )
    holders_box.pack(fill="both", expand=True)
    _configure_link_tags(holders_box)
    holders_box.tag_bind(
        "wallet_link",
        "<Button-1>",
        lambda e, b=holders_box: _open_solscan_for_index(b, e),
    )
    holders_box.tag_bind(
        "wallet_link",
        "<Enter>",
        lambda _e, b=holders_box: b.configure(cursor="hand2"),
    )
    holders_box.tag_bind(
        "wallet_link",
        "<Leave>",
        lambda _e, b=holders_box: b.configure(cursor="arrow"),
    )
    holders_box.insert(
        "end",
        "Holders appear here after Analyze (or click Holders).\n\n"
        "Top wallets, concentration, multi-source fusion.\n\n"
        "Search bar: filter holders on this mint, or Lookup any wallet\n"
        "(Pump.fun created coins · Birdeye holdings · DexScreener markets).\n"
        "Blue addresses open Solscan in your browser.\n",
        "muted",
    )
    holders_box.configure(state="disabled")
    tab_widgets["holders"] = holders_box
    tab_frames["holders"] = holders_frame
    holders_search_entry.bind("<Return>", filter_holders_list)
    _make_tab(
        "bundles",
        "Bundles",
        "Bundles appear here after Analyze (or click Bundles).\n\n"
        "Coordinated-wallet heuristics from the top-holder snapshot.",
    )
    _make_tab(
        "alerts",
        "Alerts",
        "ALERTS\n"
        "Things to watch out for immediately\n\n"
        "Run Analyze to scan for:\n"
        "  • Unlocked liquidity\n"
        "  • Single holder over 5%\n"
        "  • Similar wallets with large %\n"
        "  • Wallets linked to known rug / serial-rugger signals\n\n"
        "If none of those fire, this tab stays clear and notes that\n"
        "top priority will show when any appear.",
    )
    _make_tab(
        "maps",
        "Maps",
        "MAPS — Bubblemaps\n\n"
        "Run Analyze, then open this tab or click Maps.\n"
        "Opens Bubblemaps wallet-cluster visualization in your browser\n"
        "(iframe API: iframe.bubblemaps.io).\n",
    )
    _make_tab(
        "about",
        "About",
        "About combines X community sentiment + narrative.\n\n"
        "Run Analyze to load official coin facts and community tone.",
    )

    # ── History Log tab (last 200 searches + download) ────────────────
    history_frame = tk.Frame(notebook, bg=PANEL)
    notebook.add(history_frame, text="Logs")
    history_bar = tk.Frame(
        history_frame, bg=SURFACE, highlightbackground=BORDER, highlightthickness=1
    )
    history_bar.pack(fill="x", padx=8, pady=(8, 4))
    hist_inner = tk.Frame(history_bar, bg=SURFACE)
    hist_inner.pack(fill="x", padx=8, pady=6)
    tk.Label(
        hist_inner,
        text="LOGS",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8, "bold"),
    ).pack(side="left", padx=(0, 10))
    tk.Label(
        hist_inner,
        text=f"Keeps last {HISTORY_LOG_MAX} searches · oldest deleted on later lookups when full",
        bg=SURFACE,
        fg=MUTED,
        font=(FONT, 8),
    ).pack(side="left", fill="x", expand=True)

    def refresh_history_tab() -> None:
        try:
            set_tab_text("history", format_history_log_text())
        except Exception:  # noqa: BLE001
            try:
                _plain_set_tab_text("history", format_history_log_text())
            except Exception:  # noqa: BLE001
                pass

    def download_history_log() -> None:
        items = load_history_log()
        if not items:
            messagebox.showinfo(
                APP_NAME,
                "Logs is empty.\nRun Analyze first, then download.",
            )
            return
        default_name = (
            f"adtc_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        )
        path = filedialog.asksaveasfilename(
            title="Download Logs",
            defaultextension=".txt",
            initialfile=default_name,
            initialdir=str(Path.home() / "Desktop"),
            filetypes=[
                ("Text log", "*.txt"),
                ("JSON", "*.json"),
                ("All files", "*.*"),
            ],
        )
        if not path:
            return
        out = Path(path)
        try:
            if out.suffix.lower() == ".json":
                out.write_text(
                    json.dumps(items, indent=2, default=str),
                    encoding="utf-8",
                )
            else:
                out.write_text(format_history_log_text(items), encoding="utf-8")
            messagebox.showinfo(APP_NAME, f"Logs saved to:\n{out}")
            status_var.set(f"Logs downloaded · {len(items)} entries")
        except OSError as exc:
            messagebox.showerror(APP_NAME, f"Could not save logs:\n{exc}")

    def clear_history_log() -> None:
        if not load_history_log():
            messagebox.showinfo(APP_NAME, "Logs is already empty.")
            return
        if not messagebox.askyesno(
            APP_NAME,
            f"Clear all {len(load_history_log())} Logs entries?",
        ):
            return
        save_history_log([])
        refresh_history_tab()
        status_var.set("Logs cleared")

    ttk.Button(
        hist_inner,
        text="Download",
        style="Ghost.TButton",
        command=download_history_log,
        width=10,
    ).pack(side="right", padx=(4, 0))
    ttk.Button(
        hist_inner,
        text="Clear",
        style="Ghost.TButton",
        command=clear_history_log,
        width=7,
    ).pack(side="right", padx=2)
    ttk.Button(
        hist_inner,
        text="Refresh",
        style="Ghost.TButton",
        command=refresh_history_tab,
        width=8,
    ).pack(side="right", padx=2)

    history_box = scrolledtext.ScrolledText(
        history_frame,
        wrap="word",
        bg=PANEL,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        font=(FONT_MONO, 10),
        padx=16,
        pady=14,
        borderwidth=0,
        highlightthickness=0,
        selectbackground=ACCENT_DIM,
        selectforeground=FG,
        cursor="arrow",
    )
    history_box.pack(fill="both", expand=True)
    history_box.tag_configure("muted", foreground=MUTED)
    history_box.tag_configure("err", foreground="#c45c5c")
    history_box.insert("end", format_history_log_text())
    history_box.configure(state="disabled")
    tab_widgets["history"] = history_box
    tab_frames["history"] = history_frame

    TAB_INDEX = {
        "overview": 0,
        "holders": 1,
        "bundles": 2,
        "alerts": 3,
        "maps": 4,
        "about": 5,
        "history": 6,
    }

    # ── Bottom actions ─────────────────────────────────────────────────
    actions = tk.Frame(root, bg=BG)
    actions.pack(fill="x", padx=22, pady=(0, 16))

    def _plain_set_tab_text(key: str, content: str, error: bool = False) -> None:
        """Fallback write that never runs link highlighters (always works)."""
        box = tab_widgets.get(key)
        if box is None:
            return
        try:
            box.configure(state="normal")
            box.delete("1.0", "end")
            box.insert("end", content, "err" if error else None)
            box.configure(state="disabled")
            box.see("1.0")
        except Exception:  # noqa: BLE001
            pass

    def set_tab_text(key: str, content: str, error: bool = False) -> None:
        box = tab_widgets.get(key)
        if box is None:
            return
        try:
            # Holders: clickable Solana addresses → Solscan + colored supply %
            if key == "holders":
                _render_holders_text(content, error=error)
                return
            # Alerts / Bundles: same address hold colors as Holders
            if key == "alerts":
                _insert_text_with_wallet_links(
                    box,
                    content,
                    error=error,
                    color_holder_pct=True,
                    color_mode="all",
                    wallet_hold_color=True,
                )
                return
            if key == "bundles":
                _insert_text_with_wallet_links(
                    box,
                    content,
                    error=error,
                    color_holder_pct=True,
                    color_mode="bundles",
                    wallet_hold_color=True,
                )
                return
            # About / News: clickable http(s) links → browser
            if key == "about":
                _render_about_text(content, error=error)
                return
            # Maps: clickable Bubblemaps iframe / app URLs → browser
            if key == "maps":
                _render_maps_text(content, error=error)
                return
            # Overview: clickable social / website URLs
            if key == "overview":
                _insert_text_with_url_links(box, content, error=error)
                return
            _plain_set_tab_text(key, content, error=error)
        except Exception as exc:  # noqa: BLE001
            # Never leave a tab blank if link tagging fails (e.g. old NameError bugs)
            _plain_set_tab_text(
                key,
                content if content else f"{key} display error:\n{exc}",
                error=error or not content,
            )

    def set_output(content: str, error: bool = False, tab: str = "overview") -> None:
        """Write to one tab (default Overview) and select it."""
        set_tab_text(tab, content, error=error)
        if tab in TAB_INDEX:
            try:
                notebook.select(TAB_INDEX[tab])
            except Exception:  # noqa: BLE001
                pass

    def show_report_tabs(report: dict[str, Any], *, focus: str | None = None) -> None:
        """Fill all tabs from a full (or partial) report. Never raise — one tab fail ≠ blank UI."""

        def _safe(key: str, fn: Any) -> None:
            try:
                set_tab_text(key, fn(report))
            except Exception as exc:  # noqa: BLE001
                set_tab_text(key, f"{key.upper()} display error:\n{exc}", error=True)

        # Special boards (e.g. Pump.fun list) → Overview only
        if report.get("_raw_overview_text"):
            set_tab_text("overview", report["_raw_overview_text"])
            notebook.select(0)
            return

        focus = focus or report.get("_focus_tab")

        if report.get("_raw_holders_text") and report.get("_focus_tab") == "holders":
            set_tab_text("holders", report["_raw_holders_text"])
            if report.get("bundles"):
                _safe("bundles", format_bundles_section)
            if report.get("community_sentiment_x") or report.get("narrative"):
                _safe("about", format_about_section)
            notebook.select(TAB_INDEX["holders"])
            return

        if report.get("_raw_bundles_text") and report.get("_focus_tab") == "bundles":
            set_tab_text("bundles", report["_raw_bundles_text"])
            if report.get("holders"):
                _safe("holders", format_holders_section)
            notebook.select(TAB_INDEX["bundles"])
            return

        _safe("overview", format_overview)
        _safe("holders", format_holders_section)
        _safe("bundles", format_bundles_section)
        # Rebuild alerts if missing (older partial reports)
        if report.get("alerts") is None and report.get("holders"):
            try:
                from token_tracker.alerts import build_alerts

                report = dict(report)
                tok = report.get("token") or {}
                mkt = report.get("market") or {}
                pair = mkt.get("pair") if isinstance(mkt.get("pair"), dict) else {}
                pf = report.get("pumpfun") or {}
                report["alerts"] = build_alerts(
                    report.get("holders") or {},
                    report.get("bundles") or {},
                    socials=report.get("socials") or {},
                    pumpfun=pf,
                    token_address=tok.get("address"),
                    dex_id=pair.get("dex_id") or mkt.get("dex_id") or pf.get("dex_id"),
                    dexes=list(pf.get("dexes_seen") or []),
                    market=mkt,
                )
            except Exception:  # noqa: BLE001
                pass
        _safe("alerts", format_alerts_section)
        # Bubblemaps payload
        if report.get("maps") is None:
            try:
                from token_tracker.bubblemaps import build_maps_payload

                tok = report.get("token") or {}
                report = dict(report)
                report["maps"] = build_maps_payload(
                    chain_id=tok.get("chain_id"),
                    token_address=tok.get("address"),
                    symbol=tok.get("symbol"),
                    name=tok.get("name"),
                    fetch_api=False,
                )
            except Exception:  # noqa: BLE001
                pass
        _safe("maps", format_maps_section)
        _safe("about", format_about_section)
        # Prefer Alerts tab when top-priority warnings exist
        if not focus and (report.get("alerts") or {}).get("priority_count"):
            focus = "alerts"
        try:
            notebook.select(TAB_INDEX.get(focus or "overview", 0))
        except Exception:  # noqa: BLE001
            pass

    def worker(query: str, chain: str | None, pair: str | None, local: bool) -> None:
        try:
            if (
                local
                and fetch_token
                and feed_to_report_stub
                and chain
                and chain != "any"
            ):
                # Prefer local DB when query looks like an address
                q = query.strip()
                looks_addr = len(q) >= 30 and " " not in q
                if looks_addr:
                    feed = fetch_token(chain, q)
                    if feed:
                        # Merge intel/shoutouts when available
                        if fetch_intel_bundle:
                            try:
                                bundle = fetch_intel_bundle(chain, q)
                                if bundle:
                                    if bundle.get("market"):
                                        feed = {**bundle["market"], **feed}
                                    feed["intel"] = bundle.get("intel")
                                    feed["shoutouts"] = bundle.get("shoutouts") or feed.get(
                                        "shoutouts"
                                    )
                            except Exception:  # noqa: BLE001
                                pass
                        stub = feed_to_report_stub(feed)
                        result_q.put(("ok", _format_local_report(stub, feed)))
                        return
                # Try latest board match by symbol
                if fetch_latest:
                    for row in fetch_latest(limit=200):
                        sym = (row.get("symbol") or "").lower()
                        if sym == q.lower() and (row.get("chain_id") or "").lower() == chain.lower():
                            if fetch_intel_bundle and row.get("token_address"):
                                try:
                                    bundle = fetch_intel_bundle(
                                        row.get("chain_id") or chain,
                                        row["token_address"],
                                    )
                                    if bundle:
                                        row = {**row, **(bundle.get("market") or {})}
                                        row["intel"] = bundle.get("intel")
                                        row["shoutouts"] = bundle.get("shoutouts")
                                except Exception:  # noqa: BLE001
                                    pass
                            stub = feed_to_report_stub(row)
                            result_q.put(("ok", _format_local_report(stub, row)))
                            return
                # Fall through to live if not in DB
            # Phase 1: fast market snapshot so Overview fills in ~1–5s
            try:
                report = analyze_token(
                    query,
                    chain=chain,
                    pair_address=pair,
                    include_holders=False,
                    quick=True,
                )
            except Exception as exc:  # noqa: BLE001
                result_q.put(
                    (
                        "err",
                        f"{exc}\n\n"
                        "Tips:\n"
                        "• Use data source: Live DexScreener (full report)\n"
                        "• Check internet / firewall\n"
                        "• Put .env next to the .exe if using API keys",
                    )
                )
                return
            if not isinstance(report, dict):
                result_q.put(("err", f"Invalid report type: {type(report)}"))
                return
            report = dict(report)
            report["_phase"] = report.get("_phase") or "quick"
            result_q.put(("ok", report))

            # Phase 2: full holders / narrative / bundles (slow) — always finishes busy state
            if report.get("ok"):
                try:
                    full = analyze_token(
                        query,
                        chain=chain,
                        pair_address=pair,
                        include_holders=True,
                        quick=False,
                    )
                    if not isinstance(full, dict):
                        raise RuntimeError(f"Invalid full report: {type(full)}")
                    full = dict(full)
                    full["_phase"] = "full"
                    result_q.put(("ok", full))
                except Exception as exc:  # noqa: BLE001
                    # Keep market data but MUST mark full so UI unlocks
                    partial = dict(report)
                    partial["_phase"] = "full"
                    partial["_enrich_error"] = str(exc)
                    partial["holders"] = {
                        "ok": False,
                        "error": str(exc),
                        "skipped": False,
                        "holders": [],
                        "summary": {},
                        "flags": [],
                        "notes": f"Full scan failed: {exc}",
                    }
                    result_q.put(("ok", partial))
            else:
                # Not found — already sent; unlock happens in poll
                pass

            if (
                report.get("ok")
                and add_watch
                and api_healthy
                and api_healthy()
            ):
                tok = report.get("token") or {}
                if tok.get("address") and tok.get("chain_id"):
                    try:
                        add_watch(
                            tok["chain_id"],
                            tok["address"],
                            symbol=tok.get("symbol"),
                            name=tok.get("name"),
                        )
                    except Exception:  # noqa: BLE001
                        pass
        except Exception as exc:  # noqa: BLE001
            result_q.put(("err", str(exc)))

    def _unlock_analyze() -> None:
        analyzing["busy"] = False
        try:
            analyze_btn.configure(state="normal")
            holders_btn.configure(state="normal")
            bundles_btn.configure(state="normal")
        except Exception:  # noqa: BLE001
            pass

    def poll_queue() -> None:
        nonlocal last_report, last_url
        try:
            while True:
                kind, payload = result_q.get_nowait()
                # Startup / network diagnostics
                if kind == "net_ok":
                    if not analyzing["busy"]:
                        status_var.set(str(payload))
                    continue
                if kind == "net_err":
                    if not analyzing["busy"]:
                        status_var.set(f"Network problem: {payload}")
                    continue
                # Wallet lookup results (Holders search bar) — does not end Analyze busy
                if kind == "holders_lookup":
                    _render_holders_text(str(payload))
                    status_var.set("Wallet lookup complete · click addresses for Solscan")
                    notebook.select(TAB_INDEX["holders"])
                    continue
                if kind == "holders_lookup_err":
                    _render_holders_text(f"Wallet lookup failed:\n{payload}", error=True)
                    status_var.set("Wallet lookup error")
                    notebook.select(TAB_INDEX["holders"])
                    continue
                if kind == "err":
                    _unlock_analyze()
                    status_var.set("Error — fetch failed")
                    set_output(f"Lookup failed:\n{payload}", error=True, tab="overview")
                    for tab in ("holders", "bundles", "alerts", "maps", "about", "history"):
                        if tab == "history":
                            continue
                        set_tab_text(tab, f"Lookup failed:\n{payload}", error=True)
                    continue

                # Successful report (may arrive twice: quick then full)
                report = payload if isinstance(payload, dict) else {"ok": False, "error": str(payload)}
                last_report = report
                phase = report.get("_phase") or "full"
                is_full = phase == "full"
                # Also treat as full if holders were scanned (compat)
                # Note: quick phase sets holders.skipped=True — do NOT unlock early on that
                h = report.get("holders") or {}
                if h.get("ok") is True:
                    is_full = True
                elif h and h.get("skipped") is False and h.get("error"):
                    # Full scan attempted and failed — still unlock
                    is_full = True

                if is_full or not report.get("ok"):
                    _unlock_analyze()
                else:
                    # Quick snapshot — keep busy for enrichment, but re-enable if stuck later
                    analyze_btn.configure(state="disabled")

                if not report.get("ok"):
                    _unlock_analyze()
                    status_var.set("Not found")
                    err = report.get("error") or "Unknown error"
                    set_output(err, error=True, tab="overview")
                    for tab in ("holders", "bundles", "alerts", "maps", "about"):
                        set_tab_text(tab, err, error=True)
                    last_url = None
                else:
                    tok = report.get("token") or {}
                    if is_full:
                        extra = ""
                        if report.get("_enrich_error"):
                            extra = " · (some extras failed)"
                        status_var.set(
                            f"OK · {tok.get('symbol')} · {tok.get('chain_id')}{extra}"
                        )
                    else:
                        status_var.set(
                            f"Market OK · {tok.get('symbol')} · loading holders/about…"
                        )
                    try:
                        push_search_history(
                            {
                                "query": query_var.get().strip()
                                or tok.get("symbol")
                                or tok.get("address"),
                                "symbol": tok.get("symbol"),
                                "name": tok.get("name"),
                                "address": tok.get("address"),
                                "chain": tok.get("chain_id") or chain_var.get(),
                            }
                        )
                    except Exception:  # noqa: BLE001
                        pass
                    # History Log: record completed searches only (full phase)
                    if is_full:
                        try:
                            entry = build_history_log_entry(
                                report,
                                query=query_var.get().strip()
                                or tok.get("symbol")
                                or tok.get("address"),
                            )
                            if entry:
                                push_history_log(entry)
                                refresh_history_tab()
                        except Exception:  # noqa: BLE001
                            pass
                    focus = report.get("_focus_tab")
                    if report.get("_raw_bundles_text") and not report.get("market", {}).get("price_usd"):
                        focus = focus or "bundles"
                    elif report.get("_raw_holders_text") and not report.get("market", {}).get("price_usd"):
                        focus = focus or "holders"
                    try:
                        show_report_tabs(
                            report,
                            focus=focus if is_full else (focus or "overview"),
                        )
                    except Exception as exc:  # noqa: BLE001
                        set_output(
                            f"Report display error (data was fetched):\n{exc}",
                            error=True,
                            tab="overview",
                        )
                        status_var.set(f"Display error: {exc}")
                        _unlock_analyze()
                    pair = ((report.get("market") or {}).get("pair") or {})
                    last_url = pair.get("url")
                    open_btn.configure(state="normal" if last_url else "disabled")
                    export_btn.configure(state="normal")
                    if holders_view_mode.get("mode") != "lookup":
                        holders_search_var.set("")
                        holders_view_mode["mode"] = "list"
        except queue.Empty:
            pass
        except Exception as exc:  # noqa: BLE001
            # Never let the poll loop die — otherwise UI freezes on "Analyzing…"
            try:
                status_var.set(f"UI poll error: {exc}")
                _unlock_analyze()
            except Exception:  # noqa: BLE001
                pass
        root.after(120, poll_queue)

    def start_analyze(_event: Any = None) -> None:
        if analyzing["busy"]:
            return
        q = query_var.get().strip()
        if not q:
            messagebox.showinfo(APP_NAME, "Enter a token symbol or address.")
            return
        hide_history_dropdown()
        chain = chain_var.get().strip()
        chain_arg = None if chain in {"", "any"} else chain
        pair_arg = pair_var.get().strip() or None

        analyzing["busy"] = True
        analyzing["gen"] = int(analyzing.get("gen") or 0) + 1
        run_gen = analyzing["gen"]
        analyze_btn.configure(state="disabled")
        holders_btn.configure(state="disabled")
        bundles_btn.configure(state="disabled")
        open_btn.configure(state="disabled")
        export_btn.configure(state="disabled")
        src_mode = data_source.get() or "Live"
        status_var.set(
            f"Analyzing {q}… market first (~few sec), then holders (up to ~90s)"
        )
        msg = (
            f"Analyzing `{q}` on {chain or 'any'}…\n\n"
            f"Source: {src_mode}\n\n"
            "Step 1: market snapshot (should appear in a few seconds).\n"
            "Step 2: holders / bundles / about (may take up to ~90s).\n"
            "Use Live DexScreener — Local feed needs the stack running."
        )
        for k in ("overview", "holders", "bundles", "alerts", "maps", "about"):
            set_tab_text(k, msg)
        notebook.select(0)

        # Safety: never leave Analyze locked forever if worker dies
        def _busy_watchdog(expected_gen: int = run_gen) -> None:
            # Ignore stale timers from a previous Analyze click
            if analyzing["busy"] and analyzing.get("gen") == expected_gen:
                _unlock_analyze()
                status_var.set(
                    "Analyze timed out (still waiting on network). "
                    "Try again or check Network status."
                )

        root.after(120_000, _busy_watchdog)  # 2 minutes max lock

        use_local = use_local_feed()
        t = threading.Thread(
            target=worker,
            args=(q, chain_arg, pair_arg, use_local),
            daemon=True,
        )
        t.start()

    def open_dex() -> None:
        if last_url:
            webbrowser.open(last_url)

    def open_bubblemaps() -> None:
        """Open live Bubblemaps V2 URL in the system browser (loads map data)."""
        try:
            from token_tracker.bubblemaps import (
                build_maps_payload,
                format_maps_text,
                open_bubblemap_view,
            )

            tok = (last_report or {}).get("token") or {}
            addr = (tok.get("address") or "").strip()
            # Fallback: mint pasted in search box even if Analyze incomplete
            if not addr:
                q = query_var.get().strip()
                if len(q) >= 32 and " " not in q:
                    addr = q
            if not addr:
                messagebox.showinfo(
                    APP_NAME,
                    "Run Analyze first (or paste a token mint address), then click Maps.",
                )
                return

            chain = tok.get("chain_id") or chain_var.get()
            if (chain or "").lower() in {"", "any"}:
                chain = None  # infer solana from base58 mint when possible

            maps = build_maps_payload(
                chain_id=chain,
                token_address=addr,
                symbol=tok.get("symbol"),
                name=tok.get("name"),
                fetch_api=False,
            )
            if not maps.get("ok"):
                set_tab_text("maps", format_maps_text(maps), error=True)
                notebook.select(TAB_INDEX["maps"])
                messagebox.showinfo(
                    APP_NAME,
                    maps.get("error")
                    or "Maps unavailable. Set chain (e.g. solana), Analyze, then Maps.",
                )
                return

            opened = open_bubblemap_view(maps, prefer_window=False)
            maps = dict(maps)
            if opened.get("ok"):
                maps["viewer_method"] = opened.get("method")
                maps["url"] = (
                    opened.get("url")
                    or maps.get("primary_url")
                    or maps.get("v2_url")
                    or maps.get("app_url")
                )
                if opened.get("warning"):
                    maps["warning"] = opened.get("warning")
            if last_report is not None:
                last_report["maps"] = maps
            set_tab_text("maps", format_maps_text(maps))
            notebook.select(TAB_INDEX["maps"])
            if opened.get("ok"):
                status_var.set(
                    f"Maps · opened browser ({opened.get('method')}) · "
                    f"{(tok.get('symbol') or addr)[:20]}"
                )
            else:
                # Show URL so user can still open manually
                url = maps.get("primary_url") or maps.get("v2_url") or ""
                messagebox.showinfo(
                    APP_NAME,
                    (opened.get("error") or "Could not open browser automatically.")
                    + (f"\n\nOpen this URL manually:\n{url}" if url else ""),
                )
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror(APP_NAME, str(exc))

    def export_json() -> None:
        if not last_report:
            return
        sym = (last_report.get("token") or {}).get("symbol") or "token"
        out = Path.home() / "Desktop" / f"actual_data_token_checker_{sym}.json"
        try:
            out.write_text(json.dumps(last_report, indent=2, default=str), encoding="utf-8")
            messagebox.showinfo(APP_NAME, f"Saved to:\n{out}")
        except OSError:
            out = Path.home() / f"actual_data_token_checker_report.json"
            out.write_text(json.dumps(last_report, indent=2, default=str), encoding="utf-8")
            messagebox.showinfo(APP_NAME, f"Saved to:\n{out}")

    pair_var = tk.StringVar()
    tk.Label(
        actions,
        text="PAIR",
        bg=BG,
        fg=MUTED,
        font=(FONT, 8, "bold"),
    ).pack(side="left", padx=(0, 6))
    pair_entry = tk.Entry(
        actions,
        textvariable=pair_var,
        bg=ENTRY_BG,
        fg=FG,
        insertbackground=FG,
        relief="flat",
        font=(FONT, 9),
        width=28,
        highlightthickness=1,
        highlightbackground=BORDER,
        highlightcolor=ACCENT,
    )
    pair_entry.pack(side="left", ipady=6, padx=(0, 12))

    def _resolve_mint_for_scan() -> tuple[str, str, str | None] | None:
        """Return (chain, address, pair) or None after showing a prompt."""
        q = query_var.get().strip()
        chain = chain_var.get().strip()
        if not q or chain in {"", "any"}:
            return None
        return chain, q, pair_var.get().strip() or None

    def run_holders_only() -> None:
        """Re-run / focus holders for current chain + address-like query."""
        if analyzing["busy"]:
            return
        resolved = _resolve_mint_for_scan()
        if not resolved:
            messagebox.showinfo(
                "Holders",
                "Set chain (e.g. solana) and paste a token mint/address, then click Holders.",
            )
            return
        chain, q, pair = resolved
        analyzing["busy"] = True
        analyze_btn.configure(state="disabled")
        holders_btn.configure(state="disabled")
        bundles_btn.configure(state="disabled")
        status_var.set("Scanning top holders…")

        def _hwork() -> None:
            try:
                from token_tracker.bundle_fusion import comprehensive_bundle_check
                from token_tracker.holders import analyze_holders, format_holders_text

                addr = q
                if len(q) < 30:
                    rep = analyze_token(q, chain=None if chain == "any" else chain, include_holders=False)
                    if rep.get("ok"):
                        addr = (rep.get("token") or {}).get("address") or q
                        pair_r = ((rep.get("market") or {}).get("pair") or {}).get("pair_address")
                    else:
                        result_q.put(("err", rep.get("error") or "Token resolve failed"))
                        return
                else:
                    pair_r = pair
                data = analyze_holders(chain, addr, pair_address=pair_r)
                bdata = comprehensive_bundle_check(
                    addr, pair_address=pair_r, chain_id=chain
                )
                text_out = format_holders_text(data)
                result_q.put(
                    (
                        "ok",
                        {
                            "ok": True,
                            "generated_at": __import__("datetime")
                            .datetime.now(__import__("datetime").timezone.utc)
                            .isoformat(),
                            "token": {"name": q, "symbol": q, "address": addr, "chain_id": chain},
                            "market": {
                                "price_usd": None,
                                "market_cap_usd": None,
                                "fdv_usd": None,
                                "liquidity_usd": None,
                                "volume_h24_usd": None,
                                "price_change_pct": {},
                                "txns_h24": {},
                                "pair": {"url": None, "dex_id": None, "pair_address": pair_r},
                            },
                            "initial_market_cap": {},
                            "all_time_high": {},
                            "socials": {},
                            "holders": data,
                            "bundles": bdata,
                            "alerts": __import__(
                                "token_tracker.alerts", fromlist=["build_alerts"]
                            ).build_alerts(
                                data,
                                bdata,
                                token_address=addr,
                            ),
                            "community_sentiment_x": {
                                "sentiment": {"label": "n/a", "score": None, "summary": ""},
                                "posts_analyzed": 0,
                                "sources_used": [],
                                "sample_posts": [],
                            },
                            "narrative": {
                                "headline": "Holders scan",
                                "paragraph": text_out,
                                "bullets": data.get("flags") or [],
                                "tags": ["holders"],
                            },
                            "alternates": [],
                            "disclaimer": data.get("notes") or "",
                            "_raw_holders_text": text_out,
                            "_focus_tab": "holders",
                        },
                    )
                )
            except Exception as exc:  # noqa: BLE001
                result_q.put(("err", str(exc)))

        threading.Thread(target=_hwork, daemon=True).start()

    def run_bundles_only() -> None:
        """Focus bundles section: scan holders then show bundle heuristics."""
        if analyzing["busy"]:
            return
        # Prefer re-using last full report if same query already analyzed
        q = query_var.get().strip()
        if last_report and last_report.get("ok") and last_report.get("bundles"):
            tok = last_report.get("token") or {}
            same = (
                (tok.get("address") or "").lower() == q.lower()
                or (tok.get("symbol") or "").lower() == q.lower()
                or q.lower() in ((tok.get("address") or "").lower())
            )
            if same and (last_report.get("holders") or {}).get("ok"):
                show_report_tabs(last_report, focus="bundles")
                status_var.set(
                    f"Bundles · {(tok.get('symbol') or q)} · "
                    f"risk {(last_report['bundles'].get('summary') or {}).get('bundle_risk')}"
                )
                return

        resolved = _resolve_mint_for_scan()
        if not resolved:
            messagebox.showinfo(
                "Bundles",
                "Set chain (e.g. solana) and paste a token mint/address, then click Bundles.\n"
                "Or run Analyze first, then Bundles to focus that section.",
            )
            return
        chain, q2, pair = resolved
        analyzing["busy"] = True
        analyze_btn.configure(state="disabled")
        holders_btn.configure(state="disabled")
        bundles_btn.configure(state="disabled")
        status_var.set("Scanning holders for bundles…")

        def _bwork() -> None:
            try:
                from token_tracker.bundle_fusion import comprehensive_bundle_check
                from token_tracker.bundles import format_bundles_text
                from token_tracker.holders import analyze_holders

                addr = q2
                if len(q2) < 30:
                    rep = analyze_token(
                        q2, chain=None if chain == "any" else chain, include_holders=False
                    )
                    if rep.get("ok"):
                        addr = (rep.get("token") or {}).get("address") or q2
                        pair_r = ((rep.get("market") or {}).get("pair") or {}).get("pair_address")
                    else:
                        result_q.put(("err", rep.get("error") or "Token resolve failed"))
                        return
                else:
                    pair_r = pair
                hdata = analyze_holders(chain, addr, pair_address=pair_r)
                bdata = comprehensive_bundle_check(
                    addr, pair_address=pair_r, chain_id=chain
                )
                text_out = format_bundles_text(bdata)
                result_q.put(
                    (
                        "ok",
                        {
                            "ok": True,
                            "generated_at": __import__("datetime")
                            .datetime.now(__import__("datetime").timezone.utc)
                            .isoformat(),
                            "token": {
                                "name": q2,
                                "symbol": q2,
                                "address": addr,
                                "chain_id": chain,
                            },
                            "market": {
                                "price_usd": None,
                                "market_cap_usd": None,
                                "fdv_usd": None,
                                "liquidity_usd": None,
                                "volume_h24_usd": None,
                                "price_change_pct": {},
                                "txns_h24": {},
                                "pair": {
                                    "url": None,
                                    "dex_id": None,
                                    "pair_address": pair_r,
                                },
                            },
                            "initial_market_cap": {},
                            "all_time_high": {},
                            "socials": {},
                            "holders": hdata,
                            "bundles": bdata,
                            "alerts": __import__(
                                "token_tracker.alerts", fromlist=["build_alerts"]
                            ).build_alerts(
                                hdata,
                                bdata,
                                token_address=addr,
                            ),
                            "community_sentiment_x": {
                                "sentiment": {"label": "n/a", "score": None, "summary": ""},
                                "posts_analyzed": 0,
                                "sources_used": [],
                                "sample_posts": [],
                            },
                            "narrative": {
                                "headline": "Bundles scan",
                                "paragraph": text_out,
                                "bullets": [
                                    s.get("title") for s in (bdata.get("signals") or [])
                                ],
                                "tags": ["bundles"],
                            },
                            "alternates": [],
                            "disclaimer": bdata.get("notes") or "",
                            "_raw_bundles_text": text_out,
                            "_focus_tab": "bundles",
                        },
                    )
                )
            except Exception as exc:  # noqa: BLE001
                result_q.put(("err", str(exc)))

        threading.Thread(target=_bwork, daemon=True).start()

    analyze_btn = ttk.Button(actions, text="Analyze", style="Accent.TButton", command=start_analyze)
    analyze_btn.pack(side="left", padx=(0, 6))
    holders_btn = ttk.Button(actions, text="Holders", style="TButton", command=run_holders_only)
    holders_btn.pack(side="left", padx=3)
    bundles_btn = ttk.Button(actions, text="Bundles", style="TButton", command=run_bundles_only)
    bundles_btn.pack(side="left", padx=3)
    maps_btn = ttk.Button(actions, text="Maps", style="TButton", command=open_bubblemaps)
    maps_btn.pack(side="left", padx=3)
    open_btn = ttk.Button(
        actions, text="DexScreener", style="TButton", command=open_dex, state="disabled"
    )
    open_btn.pack(side="left", padx=3)
    export_btn = ttk.Button(
        actions, text="Export", style="TButton", command=export_json, state="disabled"
    )
    export_btn.pack(side="left", padx=3)

    entry.bind("<Return>", start_analyze)
    entry.focus_set()

    tk.Label(
        root,
        text="Estimates and heuristics only · not financial advice",
        bg=BG,
        fg="#5c6b7e",
        font=(FONT, 8),
    ).pack(side="bottom", pady=(0, 8))

    def _probe_net() -> None:
        """Background: verify DexScreener HTTPS works (frozen SSL diagnostics)."""

        def _run() -> None:
            try:
                from token_tracker.http_util import connectivity_probe

                p = connectivity_probe()
                if p.get("ok"):
                    result_q.put(
                        (
                            "net_ok",
                            f"Network OK · DexScreener live ({p.get('pairs_sample')} sample pairs)",
                        )
                    )
                else:
                    result_q.put(
                        (
                            "net_err",
                            p.get("error")
                            or "Cannot reach DexScreener — check internet / firewall / SSL",
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                result_q.put(("net_err", str(exc)))

        threading.Thread(target=_run, daemon=True).start()

    root.after(120, poll_queue)
    root.after(400, _probe_net)
    root.mainloop()


def _format_local_report(stub: dict[str, Any], feed: dict[str, Any]) -> dict[str, Any]:
    """Build a pretty-printable report from local feed data."""
    from token_tracker.report import format_pretty as _fp  # local import unused

    age = feed.get("age_seconds")
    age_s = f"{age:.0f}s ago" if isinstance(age, (int, float)) else "unknown age"
    # Reuse format_pretty shape as much as possible
    stored = stub.get("stored_narrative") or {}
    shout_lines = stub.get("shoutout_lines") or []
    headline = stored.get("headline") or (
        f"{(stub.get('token') or {}).get('name')} — local DB feed"
    )
    paragraph = stored.get("paragraph") or (
        f"Market snapshot from local collector DB (last market update {age_s})."
    )
    bullets = list(stored.get("bullets") or [])
    bullets = [
        f"Source: local SQLite (prices + narrative + X)",
        f"Market data age: {age_s}",
        *bullets,
    ]
    if shout_lines:
        bullets.append("Recent stored shoutouts/posts:")
        bullets.extend(f"  {line}" for line in shout_lines[:6])

    sent_label = stored.get("sentiment_label") or "unknown"
    sent_score = stored.get("sentiment_score")
    sample_posts = []
    for s in stub.get("stored_shoutouts") or []:
        sample_posts.append(
            {
                "text": s.get("post_text"),
                "link": s.get("post_url"),
                "published": s.get("published"),
                "source": f"@{s.get('author_handle')} ({s.get('author_tier')})",
            }
        )

    report = {
        "ok": True,
        "_phase": "full",  # single-shot local payload — unlock Analyze immediately
        "generated_at": None,
        "token": stub.get("token"),
        "market": stub.get("market"),
        "initial_market_cap": {
            "estimated_usd": None,
            "estimated_price_usd": None,
            "as_of": None,
            "method": "Not in local collector — use Live Analyze for ATH/initial MC.",
        },
        "all_time_high": {
            "estimated_price_usd": None,
            "estimated_market_cap_usd": None,
            "as_of": None,
            "candles_used": 0,
            "method": "Not in local collector — use Live Analyze for ATH.",
        },
        "socials": stub.get("socials") or {},
        "holders": {"ok": False, "skipped": True, "notes": "Local feed — use Live for holders."},
        "bundles": {"ok": False, "summary": {}, "signals": []},
        "alerts": {"ok": True, "priority_count": 0, "alerts": [], "summary": "Local feed snapshot."},
        "maps": None,
        "community_sentiment_x": {
            "posts_analyzed": len(sample_posts),
            "sources_used": ["local_db_shoutouts"],
            "sentiment": {
                "label": sent_label,
                "score": sent_score,
                "summary": f"Stored DB sentiment label: {sent_label}",
            },
            "sample_posts": sample_posts[:8],
            "notes": "Posts/shoutouts loaded from local collector database.",
        },
        "narrative": {
            "headline": headline,
            "paragraph": paragraph,
            "bullets": bullets,
            "tags": ["local_feed", "stored_intel"],
        },
        "alternates": [],
        "disclaimer": stub.get("note")
        or "Local collector snapshot. Not financial advice.",
    }
    # Ensure format_pretty works
    report["generated_at"] = __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc
    ).isoformat()
    _ = _fp  # keep import used for type checkers
    return report


if __name__ == "__main__":
    run_gui()
