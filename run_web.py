"""Launch the website version of Actual Data Token Checker.

  python run_web.py
  python run_web.py --host 0.0.0.0 --port 8080

Open http://127.0.0.1:8080/

Provider API keys (HELIUS, BIRDEYE, …) load from .env on this machine only.
Optional site gate: WEB_API_TOKEN in .env (browser sends X-API-Token).
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from web_server import main

if __name__ == "__main__":
    raise SystemExit(main())
