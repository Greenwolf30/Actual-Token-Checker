"""
Lightweight local HTTP API over the market SQLite DB.

  GET  /health
  GET  /stats
  GET  /tokens
  GET  /token/{chain}/{address}
  GET  /token/{chain}/{address}/history?limit=100
  POST /watchlist   JSON: {"chain_id","token_address","symbol"?,"name"?}
  GET  /latest

Default: http://127.0.0.1:8787
"""

from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_data.db import MarketDB, row_to_feed  # noqa: E402

DB: MarketDB | None = None


class Handler(BaseHTTPRequestHandler):
    server_version = "LeonidasMarketAPI/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        # quieter logs
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, code: int, payload: Any) -> None:
        raw = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        assert DB is not None
        parsed = urlparse(self.path)
        path = unquote(parsed.path).rstrip("/") or "/"
        qs = parse_qs(parsed.query)

        if path == "/health":
            return self._json(200, {"ok": True, "service": "leonidas-market"})

        if path == "/stats":
            return self._json(200, {"ok": True, **DB.stats()})

        if path == "/tokens":
            tracked = DB.list_tracked(enabled_only=False)
            return self._json(200, {"ok": True, "tokens": tracked})

        if path == "/latest":
            limit = int((qs.get("limit") or ["100"])[0])
            rows = [row_to_feed(r) for r in DB.get_all_latest(limit=limit)]
            return self._json(200, {"ok": True, "count": len(rows), "data": rows})

        if path == "/intel":
            limit = int((qs.get("limit") or ["50"])[0])
            rows = DB.list_token_intel(limit=limit)
            return self._json(200, {"ok": True, "count": len(rows), "data": rows})

        if path == "/shoutouts":
            limit = int((qs.get("limit") or ["40"])[0])
            symbol = (qs.get("symbol") or [None])[0]
            chain = (qs.get("chain") or [None])[0]
            address = (qs.get("address") or [None])[0]
            rows = DB.get_shoutouts(
                chain_id=chain,
                token_address=address,
                symbol=symbol,
                limit=limit,
            )
            return self._json(200, {"ok": True, "count": len(rows), "data": rows})

        if path == "/pumpfun":
            limit = int((qs.get("limit") or ["40"])[0])
            bonding = (qs.get("bonding") or ["0"])[0] in {"1", "true", "yes"}
            rows = DB.list_pumpfun_coins(limit=limit, bonding_only=bonding)
            return self._json(200, {"ok": True, "count": len(rows), "data": rows})

        if path.startswith("/pumpfun/"):
            mint = path.split("/pumpfun/", 1)[-1].strip("/")
            if not mint:
                return self._json(400, {"ok": False, "error": "mint required"})
            row = DB.get_pumpfun_coin(mint)
            if not row:
                return self._json(
                    404,
                    {"ok": False, "error": "No Pump.fun data in DB for this mint yet"},
                )
            return self._json(200, {"ok": True, "data": row})

        if path.startswith("/token/"):
            parts = [p for p in path.split("/") if p]
            # token / {chain} / {address} [/ history|intel|shoutouts]
            if len(parts) >= 3 and parts[0] == "token":
                chain, address = parts[1], parts[2]
                if len(parts) >= 4 and parts[3] == "history":
                    limit = int((qs.get("limit") or ["200"])[0])
                    hist = DB.get_history(chain, address, limit=limit)
                    # chronological for charts
                    hist = list(reversed(hist))
                    return self._json(
                        200,
                        {
                            "ok": True,
                            "chain_id": chain,
                            "token_address": address,
                            "count": len(hist),
                            "history": hist,
                        },
                    )
                if len(parts) >= 4 and parts[3] == "intel":
                    intel = DB.get_token_intel(chain, address)
                    shouts = DB.get_shoutouts(
                        chain_id=chain, token_address=address, limit=30
                    )
                    market = DB.get_token_latest(chain, address)
                    if not intel and not market:
                        return self._json(
                            404,
                            {"ok": False, "error": "No intel/market yet for this token."},
                        )
                    return self._json(
                        200,
                        {
                            "ok": True,
                            "market": row_to_feed(market) if market else None,
                            "intel": intel,
                            "shoutouts": shouts,
                        },
                    )
                if len(parts) >= 4 and parts[3] == "shoutouts":
                    rows = DB.get_shoutouts(
                        chain_id=chain, token_address=address, limit=50
                    )
                    return self._json(200, {"ok": True, "count": len(rows), "data": rows})
                row = DB.get_token_latest(chain, address)
                if not row:
                    return self._json(
                        404,
                        {
                            "ok": False,
                            "error": "No market data in local DB for this token yet. "
                            "Add it to the collector watchlist and wait for a poll.",
                        },
                    )
                intel = DB.get_token_intel(chain, address)
                feed = row_to_feed(row)
                feed["intel"] = intel
                feed["shoutouts"] = DB.get_shoutouts(
                    chain_id=chain, token_address=address, limit=15
                )
                return self._json(200, {"ok": True, "data": feed})

        return self._json(404, {"ok": False, "error": f"Unknown path: {path}"})

    def do_POST(self) -> None:  # noqa: N802
        assert DB is not None
        parsed = urlparse(self.path)
        path = unquote(parsed.path).rstrip("/") or "/"
        body = self._read_json()

        if path == "/watchlist":
            chain = (body.get("chain_id") or body.get("chain") or "").strip()
            addr = (body.get("token_address") or body.get("address") or "").strip()
            if not chain or not addr:
                return self._json(
                    400,
                    {"ok": False, "error": "chain_id and token_address required"},
                )
            DB.upsert_tracked(
                chain,
                addr,
                symbol=body.get("symbol"),
                name=body.get("name"),
                priority=int(body.get("priority") or 50),
                enabled=bool(body.get("enabled", True)),
            )
            return self._json(
                200,
                {
                    "ok": True,
                    "tracked": {"chain_id": chain.lower(), "token_address": addr},
                },
            )

        return self._json(404, {"ok": False, "error": f"Unknown path: {path}"})


def main(argv: list[str] | None = None) -> int:
    global DB
    p = argparse.ArgumentParser(description="Local market data API for Leonidas")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--db", default=None)
    args = p.parse_args(argv)

    DB = MarketDB(args.db)
    DB.seed_defaults()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Market API listening on http://{args.host}:{args.port}")
    print(f"DB: {DB.path}")
    print(
        "Endpoints: /health /stats /tokens /latest /intel /shoutouts /pumpfun "
        "/token/{chain}/{address}[/intel|/history|/shoutouts]"
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
