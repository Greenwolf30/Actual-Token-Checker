"""X / community sentiment (Nitter RSS, optional X API, market-crowd fallback)."""

from __future__ import annotations

import html
import os
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote

from .http_util import get_json, get_text

NITTER_HOSTS = [
    "https://nitter.net",
    "https://nitter.poast.org",
    "https://nitter.privacyredirect.com",
    "https://nitter.cz",
    "https://nitter.space",
]

POS_WORDS = {
    "bull", "bullish", "moon", "mooning", "pump", "pumping", "ath", "breakout",
    "accumulate", "accumulating", "gem", "undervalued", "send", "sending",
    "rocket", "lfg", "based", "strong", "holder", "holders", "diamond", "hands",
    "buy", "buying", "long", "support", "bounce", "recovery", "rally", "alpha",
    "winner", "winning", "green", "up", "higher", "partnership", "listing",
    "utility", "organic", "fire", "cook", "cooking", "run", "running", "gains",
    "huge", "massive", "solid", "love", "best", " bulish",
}

NEG_WORDS = {
    "bear", "bearish", "dump", "dumping", "rug", "rugged", "scam", "honeypot",
    "exit", "pull", "dead", "dying", "bag", "bags", "rekt", "crash", "crashing",
    "sell", "selling", "short", "weak", "fake", "bot", "bots", "wash",
    "manipulation", "down", "lower", "fear", "panic", "slowbleed", "bleeding",
    "shitcoin", "trash", "ngmi", "fraud", "lawsuit", "dev", "sold", "jeet",
    "jeets", "rugpull", "avoid", "warning",
}


def analyze_texts(texts: list[str]) -> dict[str, Any]:
    if not texts:
        return {
            "label": "unknown",
            "score": 0.0,
            "positive_hits": 0,
            "negative_hits": 0,
            "sample_size": 0,
            "summary": "No community posts available to score.",
        }

    pos = neg = 0
    token_re = re.compile(r"[a-zA-Z#@$][a-zA-Z0-9_#@$']+")
    for text in texts:
        words = {w.lower().lstrip("#@$") for w in token_re.findall(text or "")}
        pos += len(words & POS_WORDS)
        neg += len(words & NEG_WORDS)

    total = pos + neg
    if total == 0:
        # Posts exist but no strong crypto lexicon words — treat as neutral chatter
        score = 0.0
        label = "neutral"
        summary = (
            f"Read {len(texts)} posts; few strong bullish/bearish keywords → neutral chatter."
        )
    else:
        score = (pos - neg) / total
        if score >= 0.25:
            label = "bullish"
        elif score <= -0.25:
            label = "bearish"
        else:
            label = "mixed"
        summary = (
            f"Lexicon sentiment on {len(texts)} posts: {label} "
            f"(score {score:+.2f}; +{pos}/-{neg} keyword hits)."
        )

    return {
        "label": label,
        "score": round(score, 3),
        "positive_hits": pos,
        "negative_hits": neg,
        "sample_size": len(texts),
        "summary": summary,
    }


def market_crowd_sentiment(
    *,
    price_change_h24: float | None = None,
    buys_h24: int | None = None,
    sells_h24: int | None = None,
    volume_h24: float | None = None,
) -> dict[str, Any]:
    """
    Fallback when X posts are unavailable: infer crowd tone from market flow.
    Labeled clearly as market-crowd, not X text sentiment.
    """
    score = 0.0
    bits: list[str] = []

    if buys_h24 is not None and sells_h24 is not None and (buys_h24 + sells_h24) > 0:
        ratio = buys_h24 / (buys_h24 + sells_h24)
        # map 0..1 → -1..1 around 0.5
        flow = (ratio - 0.5) * 2
        score += flow * 0.55
        bits.append(f"buy share {ratio*100:.0f}% ({buys_h24}B/{sells_h24}S)")

    if price_change_h24 is not None:
        # clamp influence of extreme pumps
        chg = max(-80.0, min(80.0, float(price_change_h24))) / 80.0
        score += chg * 0.45
        bits.append(f"24h change {price_change_h24:+.1f}%")

    if volume_h24 is not None and volume_h24 > 0:
        bits.append(f"vol24 ${volume_h24:,.0f}")

    score = max(-1.0, min(1.0, score))
    if score >= 0.25:
        label = "bullish"
    elif score <= -0.25:
        label = "bearish"
    else:
        label = "mixed"

    return {
        "label": label,
        "score": round(score, 3),
        "sample_size": 0,
        "positive_hits": 0,
        "negative_hits": 0,
        "kind": "market_crowd",
        "summary": (
            f"No X posts fetched — market-crowd proxy: {label} "
            f"(score {score:+.2f}; {', '.join(bits) or 'limited metrics'})."
        ),
    }


def fetch_nitter_user_posts(handle: str, limit: int = 20) -> list[dict[str, str]]:
    handle = handle.lstrip("@")
    if not handle or handle.lower() in {"i", "home", "share", "intent", "search"}:
        return []
    # Try at most 2 mirrors (was all hosts × timeouts)
    for host in NITTER_HOSTS[:2]:
        url = f"{host}/{handle}/rss"
        try:
            # Short timeout: dead Nitter mirrors must not stall full Analyze
            xml_text = get_text(url, timeout=2.5, retries=0)
            posts = _parse_rss(xml_text, limit=limit)
            if posts:
                for p in posts:
                    p["source"] = f"nitter:@{handle}"
                return posts
        except RuntimeError:
            continue
    return []


def fetch_x_api_recent(query: str, limit: int = 25) -> list[dict[str, str]]:
    """Optional official X API v2 recent search (needs X_BEARER_TOKEN)."""
    token = os.environ.get("X_BEARER_TOKEN") or os.environ.get("TWITTER_BEARER_TOKEN")
    if not token:
        return []
    url = (
        "https://api.twitter.com/2/tweets/search/recent"
        f"?query={quote(query)}&max_results={min(max(limit, 10), 100)}"
        "&tweet.fields=created_at,public_metrics,lang"
    )
    try:
        data = get_json(url, headers={"Authorization": f"Bearer {token}"})
    except RuntimeError:
        return []
    if not isinstance(data, dict):
        return []
    out: list[dict[str, str]] = []
    for tw in data.get("data") or []:
        out.append(
            {
                "title": (tw.get("text") or "")[:120],
                "text": tw.get("text") or "",
                "link": f"https://x.com/i/web/status/{tw.get('id')}",
                "published": tw.get("created_at") or "",
                "source": "x_api",
            }
        )
    return out


def load_local_shoutouts(
    chain_id: str | None,
    token_address: str | None,
    symbol: str | None,
    limit: int = 25,
) -> list[dict[str, str]]:
    """Pull previously stored community posts from local market DB if available."""
    try:
        from market_data.db import MarketDB

        db = MarketDB()
        rows = []
        if chain_id and token_address:
            rows = db.get_shoutouts(
                chain_id=chain_id, token_address=token_address, limit=limit
            )
        if not rows and symbol:
            rows = db.get_shoutouts(symbol=symbol, limit=limit)
        out: list[dict[str, str]] = []
        for r in rows:
            out.append(
                {
                    "text": r.get("post_text") or "",
                    "link": r.get("post_url") or "",
                    "published": r.get("published") or "",
                    "source": f"db:@{r.get('author_handle')}({r.get('author_tier')})",
                }
            )
        return out
    except Exception:  # noqa: BLE001
        return []


def community_sentiment(
    *,
    symbol: str | None,
    name: str | None,
    twitter_handle: str | None,
    token_address: str | None = None,
    chain_id: str | None = None,
    extra_handles: list[str] | None = None,
    market: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build community tone from:
      1) X API (if X_BEARER_TOKEN set) — true community search
      2) Project X account via Nitter
      3) Local DB shoutouts (collector)
      4) Market-crowd proxy (buys/sells + 24h change) if still empty
    """
    posts: list[dict[str, str]] = []
    sources_used: list[str] = []
    handle = (twitter_handle or "").lstrip("@") or None

    # 1) Official X API community search
    query_parts = []
    if symbol:
        query_parts.append(f"${symbol} OR {symbol}")
    if name and name.lower() not in {(symbol or "").lower()}:
        query_parts.append(f'"{name}"')
    if handle:
        query_parts.append(f"from:{handle}")
    api_query = " OR ".join(query_parts)
    if token_address and len(token_address) >= 8:
        api_query = f"({api_query}) OR {token_address[:12]}" if api_query else token_address[:12]
    if api_query:
        api_query = f"({api_query}) lang:en -is:retweet"
        api_posts = fetch_x_api_recent(api_query, limit=30)
        if api_posts:
            posts.extend(api_posts)
            sources_used.append("x_api_recent_search")

    # 2) Project + extra handles via Nitter
    handles = []
    if handle:
        handles.append(handle)
    for h in extra_handles or []:
        h = (h or "").lstrip("@")
        if h and h not in handles:
            handles.append(h)

    seen_text = {p.get("text") for p in posts}
    for h in handles:
        user_posts = fetch_nitter_user_posts(h, limit=15)
        if user_posts:
            for p in user_posts:
                if p.get("text") not in seen_text:
                    posts.append(p)
                    seen_text.add(p.get("text"))
            sources_used.append(f"nitter_rss:@{h}")

    # 2b) Cashtag / name search via Nitter (community narrative, not just project acct)
    if len(posts) < 8 and (symbol or name):
        search_q = f"${symbol}" if symbol else (name or "")
        try:
            from .social_sources import _nitter_search

            found = _nitter_search(search_q, limit=12)
            added = 0
            for p in found:
                t = p.get("text") or ""
                if t and t not in seen_text:
                    posts.append(p)
                    seen_text.add(t)
                    added += 1
            if added:
                sources_used.append(f"nitter_search:{search_q}")
        except Exception:  # noqa: BLE001
            pass

    # 3) Local collector DB (KOL shoutouts + prior project posts)
    local = load_local_shoutouts(chain_id, token_address, symbol, limit=25)
    if local:
        for p in local:
            if p.get("text") and p.get("text") not in seen_text:
                posts.append(p)
                seen_text.add(p.get("text"))
        sources_used.append("local_db_shoutouts")

    texts = [p.get("text") or p.get("title") or "" for p in posts if p.get("text") or p.get("title")]
    analysis = analyze_texts(texts)
    analysis["kind"] = "x_text" if texts else "none"

    # 4) Market-crowd fallback
    if not texts and market:
        analysis = market_crowd_sentiment(
            price_change_h24=_f(market.get("price_change_h24") or (market.get("price_change_pct") or {}).get("h24")),
            buys_h24=_i((market.get("txns_h24") or {}).get("buys") if isinstance(market.get("txns_h24"), dict) else market.get("buys_h24")),
            sells_h24=_i((market.get("txns_h24") or {}).get("sells") if isinstance(market.get("txns_h24"), dict) else market.get("sells_h24")),
            volume_h24=_f(market.get("volume_h24_usd") or market.get("volume_h24")),
        )
        sources_used.append("market_crowd_proxy")

    notes = _sentiment_notes(sources_used, handle, has_posts=bool(texts), used_market=analysis.get("kind") == "market_crowd")

    return {
        "sources_used": sources_used or ["none"],
        "twitter_handle": handle,
        "posts_analyzed": len(texts),
        "sentiment": analysis,
        "sample_posts": [
            {
                "text": (p.get("text") or "")[:240],
                "link": p.get("link"),
                "published": p.get("published"),
                "source": p.get("source"),
            }
            for p in posts[:10]
            if p.get("text")
        ],
        "notes": notes,
    }


def _sentiment_notes(
    sources: list[str],
    handle: str | None,
    *,
    has_posts: bool,
    used_market: bool,
) -> str:
    if used_market:
        return (
            "Could not load X/community posts (missing handle, Nitter down, or new token). "
            "Showed a market-crowd proxy from buys/sells and 24h price change instead. "
            "For real community search set X_BEARER_TOKEN, add socials on DexScreener, "
            "or run the intel collector to store shoutouts."
        )
    if not sources or sources == ["none"]:
        if handle:
            return (
                f"Listed @{handle} but no posts fetched (Nitter mirrors may be down). "
                "Set X_BEARER_TOKEN for official X recent search."
            )
        return (
            "No X handle on this token’s DexScreener profile, so community posts can’t be pulled. "
            "Many Pump.fun launches have empty socials. "
            "Add a Twitter link on DexScreener, set X_BEARER_TOKEN, or track the token in the stack "
            "so KOL shoutouts can be stored."
        )
    if "x_api_recent_search" in sources:
        return "Scored live community posts via X API recent search."
    if "local_db_shoutouts" in sources and has_posts:
        return "Used posts/shoutouts stored by the local intel collector (project + KOL accounts)."
    return (
        "Free mode: scored posts from the project X account (Nitter RSS). "
        "This is the project’s account, not the whole community — set X_BEARER_TOKEN for wider search."
    )


def _parse_rss(xml_text: str, limit: int = 20) -> list[dict[str, str]]:
    if not xml_text or not xml_text.strip():
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    items: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        title = _child_text(item, "title")
        desc = _child_text(item, "description")
        link = _child_text(item, "link")
        pub = _child_text(item, "pubDate")
        text = _clean_html(desc or title)
        if not text:
            continue
        items.append(
            {
                "title": _clean_html(title)[:120],
                "text": text,
                "link": link,
                "published": pub,
                "source": "nitter_rss",
            }
        )
        if len(items) >= limit:
            break
    return items


def _child_text(el: ET.Element, tag: str) -> str:
    child = el.find(tag)
    return (child.text or "").strip() if child is not None else ""


def _clean_html(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _f(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
