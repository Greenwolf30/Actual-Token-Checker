"""Client helpers for apps to read the local market feed."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_BASE = (
    os.environ.get("LEONIDAS_MARKET_API")
    or os.environ.get("GROKSCREENER_MARKET_API")
    or "http://127.0.0.1:8787"
)


def _get(url: str, timeout: float = 8.0) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(url: str, payload: dict[str, Any], timeout: float = 8.0) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_healthy(base: str = DEFAULT_BASE, timeout: float = 0.8) -> bool:
    """
    Fast health probe — keep timeout low so UIs never freeze.

    Only returns True for *this* app's market API (service id check),
    not any random process that happens to answer HTTP on the port.
    """
    try:
        data = _get(f"{base.rstrip('/')}/health", timeout=timeout)
        if not isinstance(data, dict) or not data.get("ok"):
            return False
        # Require our signature so a wrong service never paints the light green
        svc = str(data.get("service") or "")
        s = svc.lower()
        return s in {"leonidas-market", "grokscreener-market"} or "leonidas" in s or "grokscreener" in s
    except Exception:  # noqa: BLE001
        return False


def fetch_token(
    chain_id: str,
    token_address: str,
    *,
    base: str = DEFAULT_BASE,
) -> dict[str, Any] | None:
    try:
        data = _get(f"{base.rstrip('/')}/token/{chain_id}/{token_address}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    if data.get("ok"):
        return data.get("data")
    return None


def fetch_history(
    chain_id: str,
    token_address: str,
    *,
    limit: int = 200,
    base: str = DEFAULT_BASE,
) -> list[dict[str, Any]]:
    data = _get(
        f"{base.rstrip('/')}/token/{chain_id}/{token_address}/history?limit={limit}"
    )
    if data.get("ok"):
        return list(data.get("history") or [])
    return []


def fetch_latest(*, limit: int = 100, base: str = DEFAULT_BASE) -> list[dict[str, Any]]:
    data = _get(f"{base.rstrip('/')}/latest?limit={limit}")
    if data.get("ok"):
        return list(data.get("data") or [])
    return []


def fetch_pumpfun_list(
    *,
    limit: int = 40,
    bonding_only: bool = False,
    base: str = DEFAULT_BASE,
) -> list[dict[str, Any]]:
    q = f"limit={limit}"
    if bonding_only:
        q += "&bonding=1"
    data = _get(f"{base.rstrip('/')}/pumpfun?{q}")
    if data.get("ok"):
        return list(data.get("data") or [])
    return []


def fetch_pumpfun_coin(mint: str, *, base: str = DEFAULT_BASE) -> dict[str, Any] | None:
    try:
        data = _get(f"{base.rstrip('/')}/pumpfun/{mint}")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    if data.get("ok"):
        return data.get("data")
    return None


def add_watch(
    chain_id: str,
    token_address: str,
    *,
    symbol: str | None = None,
    name: str | None = None,
    base: str = DEFAULT_BASE,
) -> dict[str, Any]:
    return _post(
        f"{base.rstrip('/')}/watchlist",
        {
            "chain_id": chain_id,
            "token_address": token_address,
            "symbol": symbol,
            "name": name,
        },
    )


def fetch_intel_bundle(
    chain_id: str,
    token_address: str,
    *,
    base: str = DEFAULT_BASE,
) -> dict[str, Any] | None:
    """Market + stored narrative + shoutouts for one token."""
    try:
        data = _get(f"{base.rstrip('/')}/token/{chain_id}/{token_address}/intel")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    if data.get("ok"):
        return data
    return None


def feed_to_report_stub(feed: dict[str, Any]) -> dict[str, Any]:
    """Convert a local feed row into a partial Leonidas-style report."""
    socials_raw = feed.get("socials") or {}
    socials_list = socials_raw.get("socials") or []
    websites = socials_raw.get("websites") or []
    twitter = None
    for s in socials_list:
        if isinstance(s, dict) and (s.get("type") or s.get("platform") or "").lower() in {
            "twitter",
            "x",
        }:
            url = s.get("url") or ""
            if "x.com/" in url or "twitter.com/" in url:
                twitter = url.rstrip("/").split("/")[-1]
            break

    intel = feed.get("intel") or {}
    if intel.get("twitter_handle") and not twitter:
        twitter = intel.get("twitter_handle")

    age = feed.get("age_seconds")
    shouts = feed.get("shoutouts") or []
    shout_lines = []
    for s in shouts[:8]:
        author = s.get("author_handle") or "?"
        tier = s.get("author_tier") or ""
        text = (s.get("post_text") or "").replace("\n", " ")
        if len(text) > 140:
            text = text[:137] + "…"
        tag = "SHOUTOUT" if s.get("is_shoutout") else "post"
        shout_lines.append(f"@{author} ({tier}/{tag}): {text}")

    bullets = list(intel.get("narrative_bullets") or [])
    if shout_lines:
        bullets.append(f"Stored X items: {len(shouts)}")

    return {
        "ok": True,
        "source": "local_market_db",
        "data_age_seconds": age,
        "query": feed.get("token_address"),
        "token": {
            "name": feed.get("name") or intel.get("name"),
            "symbol": feed.get("symbol") or intel.get("symbol"),
            "address": feed.get("token_address"),
            "chain_id": feed.get("chain_id"),
        },
        "market": {
            "price_usd": feed.get("price_usd") or intel.get("price_usd"),
            "market_cap_usd": feed.get("market_cap_usd") or intel.get("market_cap_usd"),
            "fdv_usd": feed.get("fdv_usd"),
            "liquidity_usd": feed.get("liquidity_usd") or intel.get("liquidity_usd"),
            "volume_h24_usd": feed.get("volume_h24_usd") or intel.get("volume_h24_usd"),
            "price_change_pct": {"h24": feed.get("price_change_h24")},
            "txns_h24": {
                "buys": feed.get("buys_h24"),
                "sells": feed.get("sells_h24"),
            },
            "pair": {
                "dex_id": feed.get("dex_id"),
                "pair_address": feed.get("pair_address"),
                "url": feed.get("url") or intel.get("dexscreener_url"),
                "created_at": None,
            },
        },
        "socials": {
            "image_url": socials_raw.get("imageUrl"),
            "websites": websites,
            "socials": socials_list,
            "twitter_handle": twitter,
        },
        "stored_narrative": {
            "headline": intel.get("narrative_headline"),
            "paragraph": intel.get("narrative_paragraph"),
            "bullets": bullets,
            "sentiment_label": intel.get("sentiment_label"),
            "sentiment_score": intel.get("sentiment_score"),
            "enriched_at": intel.get("enriched_at"),
        },
        "stored_shoutouts": shouts,
        "shoutout_lines": shout_lines,
        "note": (
            "From local DB: market snapshots + stored narrative + X posts/KOL shoutouts. "
            "ATH/holders still need live Analyze. Screen updates when you click Analyze."
        ),
    }
