"""
Per-mint cumulative set of flagged wallets that ever held (then sold / left).

Stored on GitHub in the RugWatch repo:
  data/flagged_previously_holding.json

Also falls back to a local cache file under ATC data/ when GitHub write is unavailable.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .env_config import load_dotenv, project_root
from .http_util import DEFAULT_HEADERS, _ssl_context

REPO_API = "https://api.github.com/repos"
FILE_PATH = "data/flagged_previously_holding.json"
FORMAT = "rugwatch_flagged_prev_hold_v1"


def _github_token() -> str | None:
    load_dotenv()
    k = (
        os.environ.get("RUGWATCH_GITHUB_TOKEN")
        or os.environ.get("GITHUB_TOKEN")
        or ""
    ).strip()
    return k or None


def _github_repo() -> str:
    load_dotenv()
    return (
        os.environ.get("RUGWATCH_GITHUB_REPO")
        or os.environ.get("GITHUB_REPO")
        or "Greenwolf30/RugWatch"
    ).strip() or "Greenwolf30/RugWatch"


def _github_branch() -> str:
    load_dotenv()
    return (os.environ.get("RUGWATCH_GITHUB_BRANCH") or "main").strip() or "main"


def _local_cache_path() -> Path:
    d = project_root() / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d / "flagged_previously_holding.json"


def _empty_payload() -> dict[str, Any]:
    return {
        "format": FORMAT,
        "mints": {},
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Per-mint flagged wallets that ever held this token. "
            "previously_holding grows when more flagged wallets sell ≥99% / leave."
        ),
    }


def _http_json(method: str, url: str, *, body: dict | None = None, token: str | None = None) -> Any:
    headers = {**DEFAULT_HEADERS, "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25.0, context=_ssl_context()) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise RuntimeError(f"HTTP {exc.code}: {err_body[:300]}") from exc


def load_payload() -> dict[str, Any]:
    """Load cumulative stats: GitHub raw → local cache → empty."""
    repo = _github_repo()
    branch = _github_branch()
    raw_url = f"https://raw.githubusercontent.com/{repo}/{branch}/{FILE_PATH}"
    try:
        req = urllib.request.Request(
            raw_url, headers={**DEFAULT_HEADERS, "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15.0, context=_ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace") or "{}")
            if isinstance(data, dict) and isinstance(data.get("mints"), dict):
                return data
    except Exception:  # noqa: BLE001
        pass

    p = _local_cache_path()
    if p.is_file():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("mints"), dict):
                return data
        except Exception:  # noqa: BLE001
            pass
    return _empty_payload()


def _save_local(payload: dict[str, Any]) -> None:
    try:
        _local_cache_path().write_text(
            json.dumps(payload, indent=2), encoding="utf-8"
        )
    except OSError:
        pass


def _push_github(payload: dict[str, Any]) -> dict[str, Any]:
    token = _github_token()
    if not token:
        return {"ok": False, "skipped": True, "error": "no GITHUB_TOKEN"}
    repo = _github_repo()
    branch = _github_branch()
    api = f"{REPO_API}/{repo}/contents/{FILE_PATH}"
    sha = None
    try:
        existing = _http_json("GET", f"{api}?ref={branch}", token=token)
        if isinstance(existing, dict):
            sha = existing.get("sha")
    except Exception:  # noqa: BLE001
        sha = None

    content = base64.b64encode(
        json.dumps(payload, indent=2).encode("utf-8")
    ).decode("ascii")
    body: dict[str, Any] = {
        "message": "RugWatch: update flagged previously-holding counts",
        "content": content,
        "branch": branch,
    }
    if sha:
        body["sha"] = sha
    try:
        _http_json("PUT", api, body=body, token=token)
        return {
            "ok": True,
            "repo": repo,
            "path": FILE_PATH,
            "branch": branch,
            "html_url": f"https://github.com/{repo}/blob/{branch}/{FILE_PATH}",
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def merge_mint_flagged_hold(
    mint: str,
    *,
    still_addrs: list[str] | None = None,
    prev_addrs: list[str] | None = None,
    push_github: bool = True,
) -> dict[str, Any]:
    """
    Merge this scan's still-holding + previously-holding flagged addresses.

    ever_held grows monotonically. previously_holding = ever_held - still_holding.
    Count only increases when new previously-holding wallets are discovered.
    """
    mint = (mint or "").strip()
    if not mint:
        return {
            "ok": False,
            "error": "no mint",
            "still_holding": 0,
            "previously_holding": 0,
            "ever_held": 0,
        }

    still = {(a or "").strip() for a in (still_addrs or []) if (a or "").strip()}
    prev_scan = {(a or "").strip() for a in (prev_addrs or []) if (a or "").strip()}

    payload = load_payload()
    mints = payload.setdefault("mints", {})
    if not isinstance(mints, dict):
        mints = {}
        payload["mints"] = mints

    entry = mints.get(mint) if isinstance(mints.get(mint), dict) else {}
    ever = set()
    for a in entry.get("ever_held") or entry.get("addresses") or []:
        if isinstance(a, str) and a.strip():
            ever.add(a.strip())

    before_prev = len(ever - still) if ever else int(entry.get("previously_holding") or 0)

    # Anyone still holding or sold this scan was (or is) a holder
    ever |= still
    ever |= prev_scan

    previously = ever - still
    previously_count = len(previously)
    # Monotonic: never decrease previously_holding total for this mint
    prev_stored = int(entry.get("previously_holding") or 0)
    if previously_count < prev_stored:
        # Keep higher stored count if sets shrank oddly; expand ever with dummy? prefer max
        previously_count = prev_stored

    mints[mint] = {
        "ever_held": sorted(ever),
        "still_holding_addrs": sorted(still),
        "previously_holding_addrs": sorted(previously),
        "still_holding": len(still),
        "previously_holding": previously_count,
        "ever_held_count": len(ever),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    payload["updated_at"] = mints[mint]["updated_at"]
    payload["format"] = FORMAT

    _save_local(payload)
    gh: dict[str, Any] = {"ok": False, "skipped": True}
    old_ever = set(entry.get("ever_held") or entry.get("addresses") or [])
    changed = ever != old_ever or previously_count > before_prev or still != set(
        entry.get("still_holding_addrs") or []
    )
    if push_github and changed:
        gh = _push_github(payload)

    return {
        "ok": True,
        "mint": mint,
        "still_holding": len(still),
        "previously_holding": previously_count,
        "ever_held": len(ever),
        "added_previously": max(0, previously_count - before_prev),
        "github": gh,
    }
