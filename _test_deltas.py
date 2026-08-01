"""Headless test: serve web/ and run renderBundlesUi delta checks."""
from __future__ import annotations

import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt, *args):
        pass


def main() -> int:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    url = f"http://127.0.0.1:{port}/_delta_test.html"
    print("serving", url)

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        console = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))

        page.goto(url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(500)
        result = page.evaluate("() => window.__deltaTestResult || window.__runDeltaTest()")
        print("RESULT:", json.dumps(result, indent=2))
        if page_errors:
            print("PAGE_ERRORS:")
            for e in page_errors:
                print(" ", e)
        print("CONSOLE (last 30):")
        for line in console[-30:]:
            print(" ", line)

        # Also dump DOM snippet
        html = page.evaluate(
            """() => {
              const r = document.getElementById('bundlesUi');
              return r ? r.innerHTML.slice(0, 2000) : 'no root';
            }"""
        )
        print("DOM_SNIPPET:\n", html[:2000])
        browser.close()

    httpd.shutdown()
    ok = bool(result and result.get("ok"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
