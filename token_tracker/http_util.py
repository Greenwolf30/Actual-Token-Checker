"""Small HTTP helpers with retries, certifi SSL, and a browser-like User-Agent.

Frozen Windows builds often have no system CA bundle — always prefer certifi.
"""

from __future__ import annotations

import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 ActualDataTokenChecker/1.0"
    ),
    "Accept": "application/json, text/plain, */*",
}


def _ssl_context() -> ssl.SSLContext:
    """TLS context that works in source and frozen PyInstaller builds."""
    try:
        import certifi

        ca = certifi.where()
        if ca and os.path.isfile(ca):
            # Help any other SSL users in-process
            os.environ.setdefault("SSL_CERT_FILE", ca)
            os.environ.setdefault("REQUESTS_CA_BUNDLE", ca)
            return ssl.create_default_context(cafile=ca)
    except Exception:  # noqa: BLE001
        pass
    try:
        return ssl.create_default_context()
    except Exception:  # noqa: BLE001
        # Last resort — better than hard-failing every request
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx


_SSL_CTX: ssl.SSLContext | None = None


def ssl_context() -> ssl.SSLContext:
    global _SSL_CTX
    if _SSL_CTX is None:
        _SSL_CTX = _ssl_context()
    return _SSL_CTX


def get_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 15.0,
    retries: int = 1,
) -> Any:
    global _SSL_CTX
    last_err: Exception | None = None
    merged = {**DEFAULT_HEADERS, **(headers or {})}
    # Refresh SSL each call so frozen builds pick up certifi even if first import failed
    ctx = ssl_context()
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=merged, method="GET")
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                raw = resp.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            last_err = exc
            # Back off harder on rate limits
            if exc.code == 429 and attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            if attempt < retries and exc.code in {500, 502, 503, 504}:
                time.sleep(0.6 * (attempt + 1))
                continue
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ssl.SSLError, OSError) as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(0.6 * (attempt + 1))
                # Rebuild SSL context after SSL failures (cert path / store issues)
                if isinstance(exc, (ssl.SSLError, urllib.error.URLError)):
                    _SSL_CTX = None
                    ctx = ssl_context()
    raise RuntimeError(f"GET JSON failed for {url}: {last_err}") from last_err


def get_text(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 12.0,
    retries: int = 1,
) -> str:
    last_err: Exception | None = None
    merged = {
        **DEFAULT_HEADERS,
        **(headers or {}),
        "Accept": "application/rss+xml, text/xml, */*",
    }
    ctx = ssl_context()
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=merged)
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            ssl.SSLError,
        ) as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"GET text failed for {url}: {last_err}") from last_err


def encode_query(params: dict[str, str]) -> str:
    return urllib.parse.urlencode(params)


def connectivity_probe() -> dict[str, Any]:
    """Quick check that HTTPS + DexScreener work (for diagnostics / UI)."""
    out: dict[str, Any] = {"ok": False, "dexscreener": False, "error": None}
    try:
        data = get_json(
            "https://api.dexscreener.com/latest/dex/search?q=SOL",
            timeout=12.0,
            retries=1,
        )
        n = len((data or {}).get("pairs") or []) if isinstance(data, dict) else 0
        out["dexscreener"] = n > 0
        out["ok"] = n > 0
        out["pairs_sample"] = n
        if n == 0:
            out["error"] = "DexScreener returned no pairs"
    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)
    return out
