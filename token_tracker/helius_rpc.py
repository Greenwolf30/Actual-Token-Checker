"""
Shared Helius / Solana JSON-RPC helper with rate limiting + 429 retries.

Free Helius plans are ~10 RPC req/s. Full Analyze can burst 50–100+ calls
(holders, launch-window, multi-send, fresh). Without a throttle you get HTTP 429
even when monthly credits remain.

Env:
  HELIUS_MAX_RPS   max requests per second (default 8; free plan is ~10)
  HELIUS_RPC_RETRIES  retries on 429 (default 4)
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Any

from .http_util import DEFAULT_HEADERS, ssl_context

_lock = threading.Lock()
_last_request_mono = 0.0


def _max_rps() -> float:
    try:
        v = float((os.environ.get("HELIUS_MAX_RPS") or "8").strip() or "8")
    except (TypeError, ValueError):
        v = 8.0
    return max(1.0, min(v, 50.0))


def _retries() -> int:
    try:
        n = int((os.environ.get("HELIUS_RPC_RETRIES") or "4").strip() or "4")
    except (TypeError, ValueError):
        n = 4
    return max(0, min(n, 8))


def is_helius_url(url: str | None) -> bool:
    return "helius" in (url or "").lower()


def _throttle() -> None:
    """Space requests so we stay under HELIUS_MAX_RPS (thread-safe)."""
    global _last_request_mono
    min_gap = 1.0 / _max_rps()
    with _lock:
        now = time.monotonic()
        wait = _last_request_mono + min_gap - now
        if wait > 0:
            time.sleep(wait)
            now = time.monotonic()
        _last_request_mono = now


def rpc_call(
    url: str,
    method: str,
    params: list[Any] | dict[str, Any],
    *,
    timeout: float = 25.0,
    req_id: Any = 1,
) -> Any:
    """
    JSON-RPC POST. For Helius URLs: rate-limit + retry on HTTP 429.
    Non-Helius URLs: single attempt (no throttle).
    """
    helius = is_helius_url(url)
    retries = _retries() if helius else 0
    last_err: Exception | None = None

    for attempt in range(retries + 1):
        if helius:
            _throttle()
        payload = json.dumps(
            {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={**DEFAULT_HEADERS, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                req, timeout=timeout, context=ssl_context()
            ) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
            if isinstance(data, dict) and data.get("error"):
                err = data["error"]
                # Some gateways embed rate-limit in JSON-RPC error
                err_s = str(err).lower()
                if helius and attempt < retries and (
                    "429" in err_s or "rate limit" in err_s or "too many" in err_s
                ):
                    time.sleep(min(1.2 * (attempt + 1), 8.0))
                    continue
                raise RuntimeError(str(err))
            return (data or {}).get("result") if isinstance(data, dict) else data
        except urllib.error.HTTPError as exc:
            last_err = exc
            if helius and exc.code == 429 and attempt < retries:
                wait = 1.5 * (attempt + 1)
                try:
                    ra = exc.headers.get("Retry-After") if exc.headers else None
                    if ra is not None:
                        wait = max(wait, float(ra))
                except (TypeError, ValueError):
                    pass
                time.sleep(min(wait, 12.0))
                continue
            if helius and exc.code in {500, 502, 503, 504} and attempt < retries:
                time.sleep(0.8 * (attempt + 1))
                continue
            raise RuntimeError(f"Helius/RPC HTTP {exc.code}: {exc.reason}") from exc
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            last_err = exc
            if helius and attempt < retries:
                time.sleep(0.6 * (attempt + 1))
                continue
            raise RuntimeError(f"RPC failed for {method}: {exc}") from exc

    raise RuntimeError(f"RPC failed for {method} after retries: {last_err}") from last_err
