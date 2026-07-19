"""
Actual Data Token Checker — website backend.

Serves the web UI and a private API. Third-party keys (Helius, Birdeye, etc.)
load only from server-side .env and are never sent to the browser.

  GET  /              → web UI
  GET  /health
  GET  /api/health
  POST /api/analyze   JSON: {"query": "...", "chain": "solana"?, "quick": false?}
  GET  /api/analyze?q=...&chain=solana&quick=0

Run:
  python run_web.py
  # or: python web_server.py --host 127.0.0.1 --port 8080
"""

from __future__ import annotations

import argparse
import json
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

# Simple in-memory rate limit (per IP)
_RATE_LOCK = threading.Lock()
_RATE_HITS: dict[str, deque[float]] = defaultdict(deque)
_RATE_MAX = 12  # analyzes per window
_RATE_WINDOW = 60.0  # seconds

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
    now = time.time()
    with _RATE_LOCK:
        q = _RATE_HITS[ip]
        while q and now - q[0] > _RATE_WINDOW:
            q.popleft()
        if len(q) >= _RATE_MAX:
            return False
        q.append(now)
        return True


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
    # narrative / coin fact links
    story = report.get("narrative") or {}
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}
    for k, v in (cf.get("links") or {}).items():
        if isinstance(v, str) and v.startswith("http") and k not in links:
            if "api-key" in v.lower():
                continue
            links[k] = v
    return {k: redact_text(v) for k, v in links.items() if v}


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

    return {
        "ok": True,
        "query": report.get("query"),
        "generated_at": report.get("generated_at"),
        "token": sanitize_public(report.get("token") or {}),
        "market": _safe_market_summary(report),
        "links": _safe_links(report),
        "sections": sections,
        "alerts_meta": {
            "priority_count": alerts.get("priority_count") or 0,
            "summary": redact_text(str(alerts.get("summary") or "")),
        },
        # Compact fields for the website History tab (browser localStorage)
        "history_meta": {
            "holders_ok": bool(holders.get("ok")),
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


def run_analyze(query: str, *, chain: str | None, quick: bool) -> dict[str, Any]:
    load_dotenv()
    from token_tracker.analyze import analyze_token

    q = (query or "").strip()
    if not q:
        return {"ok": False, "error": "query is required"}
    if len(q) > 200:
        return {"ok": False, "error": "query too long"}

    try:
        report = analyze_token(
            q,
            chain=chain or None,
            include_holders=not quick,
            quick=quick,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": redact_text(f"Analyze failed: {exc}"),
            "detail": redact_text(traceback.format_exc()[-800:]),
        }
    return build_public_payload(report)


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
            return self._handle_analyze(q, chain=chain, quick=quick)

        # Static files from /web
        if path == "/" or path == "/index.html":
            return self._serve_static("index.html")
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
            return self._handle_analyze(q, chain=chain_s, quick=quick)

        return self._json(404, {"ok": False, "error": "not found"})

    def _handle_analyze(
        self, query: str, *, chain: str | None, quick: bool
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
                    "error": f"Rate limit: max {_RATE_MAX} analyzes per {_RATE_WINDOW:.0f}s.",
                },
            )
        if not (query or "").strip():
            return self._json(400, {"ok": False, "error": "query is required"})

        # Analyze can take a while (holders / narrative)
        result = run_analyze(query.strip(), chain=chain, quick=quick)
        try:
            record_analyze(ok=bool(result.get("ok")))
        except Exception:  # noqa: BLE001
            pass
        code = 200 if result.get("ok") else 422
        if result.get("error") and "Rate limit" in str(result.get("error")):
            code = 429
        return self._json(code, result)

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
