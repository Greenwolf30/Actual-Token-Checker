#!/usr/bin/env python3
import sys
sys.dont_write_bytecode = True
"""
Gladiator local server.

- Serves the wallet UI
- Loads HELIUS_API_KEY / SOLANA_RPC_URL from .env (never sent to the browser)
- Proxies allowlisted Solana JSON-RPC at POST /api/solana-rpc

Usage:
  py serve.py
  # or: python serve.py --port 8765
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ALLOWED_METHODS = frozenset(
    {
        "getBalance",
        "getTokenAccountsByOwner",
        "getTokenAccountBalance",
        "getAccountInfo",
        "getMultipleAccounts",
        "getSlot",
        "getLatestBlockhash",
        "getSignatureStatuses",
        "getMinimumBalanceForRentExemption",
        "simulateTransaction",
        "sendTransaction",
        "getRecentPrioritizationFees",
        "getSignaturesForAddress",
        "getTransaction",
    }
)


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def rpc_urls() -> list[str]:
    """Ordered upstream list. Browser talks only to this proxy (no CORS)."""
    urls: list[str] = []
    explicit = (os.environ.get("SOLANA_RPC_URL") or "").strip()
    if explicit:
        urls.append(explicit)
    key = (os.environ.get("HELIUS_API_KEY") or "").strip()
    if key:
        urls.append(f"https://mainnet.helius-rpc.com/?api-key={key}")
    # mainnet-beta allows getTokenAccountsByOwner; publicnode often blocks programId scans
    urls.extend(
        [
            "https://api.mainnet-beta.solana.com",
            "https://solana-rpc.publicnode.com",
        ]
    )
    # de-dupe preserve order
    out: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def solana_rpc_url() -> str | None:
    urls = rpc_urls()
    return urls[0] if urls else None


def _error_should_failover(err_obj) -> bool:
    msg = ""
    if isinstance(err_obj, dict):
        msg = str(err_obj.get("message") or err_obj)
    else:
        msg = str(err_obj or "")
    low = msg.lower()
    return any(
        x in low
        for x in (
            "blocked",
            "forbidden",
            "not available",
            "rate limit",
            "too many requests",
            "capacity",
            "api key",
            "unauthorized",
            "method not found",
        )
    )


def upstream_rpc(method: str, params, req_id=1, timeout: float = 25.0):
    urls = rpc_urls()
    if not urls:
        raise RuntimeError(
            "No RPC configured. Put HELIUS_API_KEY=... or SOLANA_RPC_URL=... in .env"
        )
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
    ).encode("utf-8")
    last_err: Exception | None = None
    for url in urls:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Gladiator-Local/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            # 403/429/5xx → try next upstream (common on free public RPCs)
            if exc.code in {401, 403, 408, 429, 500, 502, 503, 504}:
                last_err = RuntimeError(f"Upstream HTTP {exc.code} @ {url}")
                continue
            raise
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            continue

        if not isinstance(data, dict):
            return {"jsonrpc": "2.0", "id": req_id, "result": data}
        if data.get("error") and _error_should_failover(data.get("error")):
            last_err = RuntimeError(str(data.get("error")))
            continue
        return data

    if last_err:
        raise last_err
    raise RuntimeError("All upstream Solana RPCs failed")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._cors()
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] in {"/api/health", "/health"}:
            urls = rpc_urls()
            key = bool((os.environ.get("HELIUS_API_KEY") or "").strip())
            custom = bool((os.environ.get("SOLANA_RPC_URL") or "").strip())
            return self._json(
                200,
                {
                    "ok": True,
                    "service": "gladiator-local",
                    "rpc_configured": bool(urls),
                    "helius_key": key,
                    "custom_rpc": custom,
                    "upstream_count": len(urls),
                },
            )
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path not in {"/api/solana-rpc", "/solana-rpc"}:
            self.send_error(404, "Not found")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            length = 0
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return self._json(
                400,
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            )
        if not isinstance(body, dict):
            body = {}
        method = str(body.get("method") or "").strip()
        req_id = body.get("id", 1)
        params = body.get("params", [])
        if method not in ALLOWED_METHODS:
            return self._json(
                400,
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32601,
                        "message": f"Method not allowed: {method or '(empty)'}",
                    },
                },
            )
        try:
            data = upstream_rpc(method, params, req_id=req_id)
            if isinstance(data, dict) and ("result" in data or "error" in data):
                # Preserve upstream id when present
                if "id" not in data:
                    data = {**data, "id": req_id}
                if "jsonrpc" not in data:
                    data = {"jsonrpc": "2.0", **data}
                return self._json(200, data)
            return self._json(200, {"jsonrpc": "2.0", "id": req_id, "result": data})
        except urllib.error.HTTPError as exc:
            return self._json(
                502,
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32000, "message": f"Upstream HTTP {exc.code}"},
                },
            )
        except Exception as exc:  # noqa: BLE001
            return self._json(
                502,
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32000, "message": str(exc)[:280]},
                },
            )


def bind_server(host: str, preferred: int) -> tuple[ThreadingHTTPServer, int]:
    """Bind preferred port; on Windows excluded/forbidden ports, try fallbacks."""
    candidates = [preferred, 8766, 8877, 9876, 18976, 5173, 8080, 0]
    seen: set[int] = set()
    last_err: Exception | None = None
    for port in candidates:
        if port in seen:
            continue
        seen.add(port)
        try:
            httpd = ThreadingHTTPServer((host, port), Handler)
            return httpd, int(httpd.server_address[1])
        except OSError as exc:  # PermissionError / WinError 10013 / EADDRINUSE
            last_err = exc
            continue
    raise OSError(f"Could not bind any local port ({last_err})")


def main() -> None:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description="Gladiator local wallet server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the default browser",
    )
    args = parser.parse_args()

    configured = bool(solana_rpc_url())
    try:
        httpd, port = bind_server(args.host, args.port)
    except OSError as exc:
        print(f"ERROR: {exc}", flush=True)
        print(
            "Tip: close other apps using that port, or run: py serve.py --port 18976",
            flush=True,
        )
        raise SystemExit(1) from exc

    url = f"http://{args.host}:{port}/"
    print(f"Gladiator -> {url}", flush=True)
    print(
        "RPC from .env: "
        + ("yes" if configured else "NO - add HELIUS_API_KEY or SOLANA_RPC_URL to .env"),
        flush=True,
    )
    if not args.no_browser:
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)


if __name__ == "__main__":
    main()
