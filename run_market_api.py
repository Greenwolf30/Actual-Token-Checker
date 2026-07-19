#!/usr/bin/env python3
"""Start the local market data HTTP API (default :8787)."""

from market_data.api_server import main

if __name__ == "__main__":
    raise SystemExit(main())
