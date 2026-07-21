"""
Gather real-world narrative text from public social / web sources.

Sources (best-effort, short timeouts — never require paid keys):
  - Pump.fun coin page metadata (description / name story)
  - DexScreener token profile / boost descriptions
  - X via Nitter search RSS ($TICKER / name) + project account bio
  - Google News RSS
  - Reddit public search JSON
  - LinkedIn via DuckDuckGo site:linkedin.com search + profile links
  - DuckDuckGo HTML lite (TikTok / IG / LinkedIn / news blurbs)

Authoritative string elements (CoinGecko, metadata URI, Birdeye, Jupiter,
Solscan, Rugcheck, CMC, website OG) are fetched in coin_facts.py and merged
into the About narrative separately.

Instagram, TikTok, and LinkedIn have no free full-feed API; we capture
public links + search snippets instead of full scrapes.
"""

from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote_plus, urlparse

from .http_util import DEFAULT_HEADERS, get_json, get_text

# Keep narrative fetches snappy inside Analyze (was 8s × many hosts = multi-minute hangs)
_TIMEOUT = 3.5

_NITTER_HOSTS = [
    "https://nitter.poast.org",
    "https://nitter.privacyredirect.com",
    "https://nitter.cz",
    "https://nitter.space",
    "https://nitter.net",
]

_NARRATIVE_HINTS = re.compile(
    r"\b(narrative|story|about|meme|inspired|based on|community|"
    r"cto|takeover|viral|tiktok|instagram|trending|meta|"
    r"because|the idea|this is|born from|homage|tribute)\b",
    re.I,
)


def gather_narrative_sources(
    *,
    symbol: str | None,
    name: str | None,
    token_address: str | None = None,
    chain_id: str | None = None,
    twitter_handle: str | None = None,
    social_urls: list[str] | None = None,
    pump_url: str | None = None,
    dexscreener_pair: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Return structured snippets for narrative building.

    Shape:
      {
        "ok": True,
        "sources_used": [...],
        "snippets": [{"source","platform","text","url","weight"}, ...],
        "platforms_seen": ["x","pumpfun","google_news",...],
        "description_blocks": [...],  # longer project descriptions
        "notes": str,
      }
    """
    snippets: list[dict[str, Any]] = []
    sources_used: list[str] = []
    platforms: set[str] = set()
    descriptions: list[dict[str, str]] = []

    # ── DexScreener profile / pair info ────────────────────────────────
    try:
        dx_bits = _from_dexscreener(dexscreener_pair, token_address, chain_id)
        for s in dx_bits.get("snippets") or []:
            snippets.append(s)
            platforms.add(s.get("platform") or "dexscreener")
        for d in dx_bits.get("descriptions") or []:
            descriptions.append(d)
        if dx_bits.get("used"):
            sources_used.append("dexscreener_profile")
    except Exception:  # noqa: BLE001
        pass

    # ── Pump.fun coin metadata ─────────────────────────────────────────
    if token_address and (
        (token_address or "").lower().endswith("pump")
        or pump_url
        or (chain_id or "").lower() in {"solana", "sol"}
    ):
        try:
            pf = _from_pumpfun(token_address)
            for s in pf.get("snippets") or []:
                snippets.append(s)
                platforms.add("pumpfun")
            for d in pf.get("descriptions") or []:
                descriptions.append(d)
            if pf.get("used"):
                sources_used.append("pumpfun_coin")
        except Exception:  # noqa: BLE001
            pass

    # ── Linked socials (IG / TikTok / X URLs on profile) ───────────────
    urls = list(social_urls or [])
    if dexscreener_pair:
        info = dexscreener_pair.get("info") or {}
        for s in info.get("socials") or []:
            if isinstance(s, dict) and s.get("url"):
                urls.append(str(s["url"]))
        for w in info.get("websites") or []:
            if isinstance(w, dict) and w.get("url"):
                urls.append(str(w["url"]))
    try:
        link_bits = _from_linked_socials(urls)
        for s in link_bits:
            snippets.append(s)
            platforms.add(s.get("platform") or "web")
        if link_bits:
            sources_used.append("linked_social_urls")
    except Exception:  # noqa: BLE001
        pass

    # ── X / Nitter search (community chatter) + project bio ────────────
    try:
        x_bits = _from_x_search(symbol, name, twitter_handle)
        for s in x_bits:
            snippets.append(s)
            platforms.add("x")
        if x_bits:
            sources_used.append("x_nitter_search")
    except Exception:  # noqa: BLE001
        pass
    if twitter_handle:
        try:
            bio = _from_x_bio(twitter_handle)
            if bio:
                descriptions.append(bio)
                snippets.append(
                    {
                        "source": "x_bio",
                        "platform": "x",
                        "text": bio.get("text") or "",
                        "url": bio.get("url") or "",
                        "weight": 3.2,
                    }
                )
                platforms.add("x")
                sources_used.append("x_profile_bio")
        except Exception:  # noqa: BLE001
            pass

    # ── Google News ────────────────────────────────────────────────────
    try:
        news = _from_google_news(symbol, name)
        for s in news:
            snippets.append(s)
            platforms.add("google_news")
        if news:
            sources_used.append("google_news_rss")
    except Exception:  # noqa: BLE001
        pass

    # ── Reddit ─────────────────────────────────────────────────────────
    try:
        red = _from_reddit(symbol, name)
        for s in red:
            snippets.append(s)
            platforms.add("reddit")
        if red:
            sources_used.append("reddit_search")
    except Exception:  # noqa: BLE001
        pass

    # ── LinkedIn (site search + already-linked company/profile URLs) ────
    try:
        li = _from_linkedin(symbol, name, urls)
        for s in li:
            snippets.append(s)
            platforms.add("linkedin")
        if li:
            sources_used.append("linkedin_search")
    except Exception:  # noqa: BLE001
        pass

    # ── DuckDuckGo (TikTok / IG / LinkedIn / web blurbs) ────────────────
    try:
        ddg = _from_duckduckgo(symbol, name)
        for s in ddg:
            snippets.append(s)
            platforms.add(s.get("platform") or "web_search")
        if ddg:
            sources_used.append("duckduckgo_web")
    except Exception:  # noqa: BLE001
        pass

    # Rank / de-dupe, then drop chatter that doesn't mention this coin
    snippets = _dedupe_snippets(snippets)
    snippets = _require_coin_mention(
        snippets, symbol=symbol, name=name, address=token_address
    )
    descriptions = _dedupe_descriptions(descriptions)

    notes_parts = []
    if not snippets and not descriptions:
        notes_parts.append(
            "No public narrative text found yet (new token, blocked APIs, or quiet socials)."
        )
    else:
        notes_parts.append(
            f"Narrative text from: {', '.join(sources_used) or 'unknown'}."
        )
    notes_parts.append(
        "Community/web snippets are filtered to mentions of this ticker/name/contract."
    )
    if "tiktok" not in platforms and "instagram" not in platforms:
        notes_parts.append(
            "TikTok/Instagram full feeds need official APIs; only public links/search mentions are used."
        )
    if "linkedin" not in platforms:
        notes_parts.append(
            "LinkedIn has no free full API; only profile links and public search snippets are used when found."
        )

    return {
        "ok": bool(snippets or descriptions),
        "sources_used": sources_used,
        "snippets": snippets[:40],
        "platforms_seen": sorted(platforms),
        "description_blocks": descriptions[:8],
        "notes": " ".join(notes_parts),
    }


def _require_coin_mention(
    snippets: list[dict[str, Any]],
    *,
    symbol: str | None,
    name: str | None,
    address: str | None,
) -> list[dict[str, Any]]:
    """Keep official-ish sources; require ticker/name/contract in free-web chatter."""
    sym = (symbol or "").strip().lower()
    nam = (name or "").strip().lower()
    addr = (address or "").strip().lower()
    short = addr[:8] if len(addr) >= 8 else ""
    out: list[dict[str, Any]] = []
    for s in snippets:
        plat = (s.get("platform") or "").lower()
        src = (s.get("source") or "").lower()
        if plat in {"pumpfun", "dexscreener", "x"} or any(
            k in src
            for k in (
                "pumpfun",
                "dexscreener",
                "profile_link",
                "pumpfun_links",
                "x_bio",
                "metadata",
                "birdeye",
                "jupiter",
                "rugcheck",
            )
        ):
            out.append(s)
            continue
        text = (s.get("text") or "").lower()
        if not text:
            continue
        if sym and len(sym) >= 2 and (f"${sym}" in text or re.search(rf"\b{re.escape(sym)}\b", text)):
            out.append(s)
            continue
        if nam and len(nam) >= 3 and nam in text:
            out.append(s)
            continue
        if short and short in text:
            out.append(s)
            continue
        # drop irrelevant news/web noise
    return out


def corpus_from_sources(data: dict[str, Any] | None) -> str:
    if not data:
        return ""
    parts: list[str] = []
    for d in data.get("description_blocks") or []:
        parts.append(str(d.get("text") or ""))
    for s in data.get("snippets") or []:
        parts.append(str(s.get("text") or ""))
    return " ".join(parts)


# ── Source helpers ─────────────────────────────────────────────────────


def _from_dexscreener(
    pair: dict[str, Any] | None,
    token_address: str | None,
    chain_id: str | None,
) -> dict[str, Any]:
    snippets: list[dict[str, Any]] = []
    descriptions: list[dict[str, str]] = []
    used = False

    if pair:
        info = pair.get("info") or {}
        for key in ("description", "header", "openGraph"):
            # not always present
            pass
        # Some pairs embed description under info
        desc = info.get("description") or pair.get("description")
        if desc and isinstance(desc, str) and len(desc.strip()) > 12:
            descriptions.append(
                {
                    "source": "dexscreener_pair",
                    "text": desc.strip()[:800],
                    "url": pair.get("url") or "",
                }
            )
            used = True

    if token_address and chain_id:
        # Latest profiles + boosts may include description for this mint
        for path, label in (
            ("token-profiles/latest/v1", "dexscreener_profile"),
            ("token-boosts/latest/v1", "dexscreener_boost"),
            ("token-boosts/top/v1", "dexscreener_boost_top"),
        ):
            try:
                data = get_json(
                    f"https://api.dexscreener.com/{path}",
                    timeout=_TIMEOUT,
                    retries=0,
                )
            except Exception:  # noqa: BLE001
                continue
            if not isinstance(data, list):
                continue
            addr_l = token_address.lower()
            for row in data:
                if not isinstance(row, dict):
                    continue
                if (row.get("tokenAddress") or "").lower() != addr_l:
                    continue
                if (chain_id or "").lower() not in {
                    (row.get("chainId") or "").lower(),
                    "",
                } and (row.get("chainId") or "").lower() not in {
                    (chain_id or "").lower()
                }:
                    # still accept if address matches
                    pass
                desc = (row.get("description") or "").strip()
                if desc:
                    descriptions.append(
                        {
                            "source": label,
                            "text": desc[:800],
                            "url": row.get("url") or row.get("link") or "",
                        }
                    )
                    used = True
                    snippets.append(
                        {
                            "source": label,
                            "platform": "dexscreener",
                            "text": desc[:280],
                            "url": row.get("url") or "",
                            "weight": 3.0,
                        }
                    )

    return {"snippets": snippets, "descriptions": descriptions, "used": used}


def _from_pumpfun(mint: str) -> dict[str, Any]:
    """Best-effort Pump.fun coin JSON (often Cloudflare-blocked)."""
    snippets: list[dict[str, Any]] = []
    descriptions: list[dict[str, str]] = []
    used = False
    endpoints = [
        f"https://frontend-api.pump.fun/coins/{mint}",
        f"https://frontend-api-v3.pump.fun/coins/{mint}",
        f"https://client-api-2-74b1891ee9f9.herokuapp.com/coins/{mint}",
    ]
    for url in endpoints:
        try:
            data = get_json(url, timeout=6.0, retries=0)
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(data, dict):
            continue
        desc = (
            data.get("description")
            or data.get("desc")
            or data.get("body")
            or ""
        )
        name = data.get("name") or ""
        symbol = data.get("symbol") or ""
        twitter = data.get("twitter") or data.get("twitter_url") or ""
        telegram = data.get("telegram") or ""
        website = data.get("website") or ""
        text_bits = [str(desc or "").strip()]
        if name or symbol:
            text_bits.insert(0, f"{name} (${symbol})".strip())
        blob = " ".join(t for t in text_bits if t)
        if blob:
            descriptions.append(
                {
                    "source": "pumpfun",
                    "text": blob[:900],
                    "url": f"https://pump.fun/{mint}",
                }
            )
            snippets.append(
                {
                    "source": "pumpfun_coin",
                    "platform": "pumpfun",
                    "text": (str(desc).strip() or blob)[:320],
                    "url": f"https://pump.fun/{mint}",
                    "weight": 4.0,
                }
            )
            used = True
        for label, val in (
            ("twitter", twitter),
            ("telegram", telegram),
            ("website", website),
        ):
            if val and isinstance(val, str) and val.startswith("http"):
                snippets.append(
                    {
                        "source": "pumpfun_links",
                        "platform": _platform_from_url(val),
                        "text": f"Linked on Pump.fun: {label} {val}",
                        "url": val,
                        "weight": 1.5,
                    }
                )
        if used:
            break
    return {"snippets": snippets, "descriptions": descriptions, "used": used}


def _from_linked_socials(urls: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in urls:
        u = (raw or "").strip()
        if not u or u in seen:
            continue
        seen.add(u)
        plat = _platform_from_url(u)
        handle = _handle_from_url(u)
        text = f"{plat} profile linked: {handle or u}"
        weight = (
            2.0
            if plat in {"tiktok", "instagram", "x", "youtube", "linkedin"}
            else 1.0
        )
        out.append(
            {
                "source": "profile_link",
                "platform": plat,
                "text": text,
                "url": u,
                "weight": weight,
            }
        )
    return out


def _from_x_bio(handle: str) -> dict[str, str] | None:
    """Best-effort project X bio via Nitter profile page (no X API key)."""
    h = (handle or "").lstrip("@").strip()
    if not h or not re.match(r"^[A-Za-z0-9_]{1,30}$", h):
        return None
    for host in _NITTER_HOSTS:
        url = f"{host}/{h}"
        try:
            page = get_text(
                url,
                timeout=_TIMEOUT,
                retries=0,
                headers={
                    **DEFAULT_HEADERS,
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
        except Exception:  # noqa: BLE001
            continue
        # Common nitter profile bio markup
        bio = ""
        for pat in (
            r'class="profile-bio"[^>]*>(.*?)</div>',
            r'class="profile-website"[^>]*>.*?</div>',
            r'property="og:description"\s+content="([^"]+)"',
            r'name="description"\s+content="([^"]+)"',
        ):
            m = re.search(pat, page, re.I | re.S)
            if not m:
                continue
            raw = m.group(1) if m.lastindex else m.group(0)
            text = html.unescape(re.sub(r"<[^>]+>", " ", raw or ""))
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) >= 12 and "nitter" not in text.lower()[:20]:
                bio = text
                break
        if bio:
            return {
                "source": "x_bio",
                "text": bio[:600],
                "url": f"https://x.com/{h}",
            }
    return None


def _from_x_search(
    symbol: str | None,
    name: str | None,
    twitter_handle: str | None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    queries: list[str] = []
    if symbol:
        queries.append(f"${symbol}")
        queries.append(symbol)
    if name and len(name) >= 3 and (name or "").lower() != (symbol or "").lower():
        queries.append(f'"{name}" crypto OR meme OR solana OR pump')
    if twitter_handle:
        queries.append(f"from:{twitter_handle.lstrip('@')}")

    for q in queries[:3]:
        posts = _nitter_search(q, limit=12)
        for p in posts:
            out.append(
                {
                    "source": "x_search",
                    "platform": "x",
                    "text": p.get("text") or "",
                    "url": p.get("link") or "",
                    "weight": 2.5 if _NARRATIVE_HINTS.search(p.get("text") or "") else 1.8,
                }
            )
        if len(out) >= 15:
            break
    return out


def _nitter_search(query: str, limit: int = 12) -> list[dict[str, str]]:
    q = quote_plus(query)
    for host in _NITTER_HOSTS:
        url = f"{host}/search/rss?f=tweets&q={q}"
        try:
            xml_text = get_text(url, timeout=_TIMEOUT, retries=0)
            posts = _parse_rss(xml_text, limit=limit)
            if posts:
                for p in posts:
                    p["source"] = f"nitter_search:{query}"
                return posts
        except Exception:  # noqa: BLE001
            continue
    return []


def _from_google_news(symbol: str | None, name: str | None) -> list[dict[str, Any]]:
    terms = []
    if symbol:
        terms.append(symbol)
    if name and (name or "").lower() not in {(symbol or "").lower()}:
        terms.append(f'"{name}"')
    terms.append("(crypto OR memecoin OR solana OR pump.fun OR token)")
    q = quote_plus(" ".join(terms))
    url = (
        "https://news.google.com/rss/search?"
        f"q={q}&hl=en-US&gl=US&ceid=US:en"
    )
    try:
        xml_text = get_text(url, timeout=_TIMEOUT, retries=0)
    except Exception:  # noqa: BLE001
        return []
    posts = _parse_rss(xml_text, limit=10)
    out: list[dict[str, Any]] = []
    for p in posts:
        title = p.get("title") or p.get("text") or ""
        out.append(
            {
                "source": "google_news",
                "platform": "google_news",
                "text": title[:320],
                "url": p.get("link") or "",
                "weight": 2.2,
            }
        )
    return out


def _from_reddit(symbol: str | None, name: str | None) -> list[dict[str, Any]]:
    q_parts = []
    if symbol:
        q_parts.append(symbol)
    if name:
        q_parts.append(name)
    q = quote_plus(" ".join(q_parts) + " crypto OR solana OR memecoin")
    url = (
        f"https://www.reddit.com/search.json?q={q}&sort=new&limit=12&t=week"
    )
    try:
        data = get_json(
            url,
            timeout=_TIMEOUT,
            retries=0,
            headers={
                **DEFAULT_HEADERS,
                "User-Agent": "Leonidas/1.0 (narrative research; local tool)",
            },
        )
    except Exception:  # noqa: BLE001
        return []
    children = ((data or {}).get("data") or {}).get("children") or []
    out: list[dict[str, Any]] = []
    for ch in children:
        d = (ch or {}).get("data") or {}
        title = (d.get("title") or "").strip()
        selftext = (d.get("selftext") or "").strip()
        blob = title
        if selftext and len(selftext) > 20:
            blob = f"{title}. {selftext[:200]}"
        if not blob:
            continue
        out.append(
            {
                "source": "reddit",
                "platform": "reddit",
                "text": blob[:320],
                "url": f"https://reddit.com{d.get('permalink') or ''}",
                "weight": 2.0 if _NARRATIVE_HINTS.search(blob) else 1.4,
            }
        )
    return out


def _from_linkedin(
    symbol: str | None,
    name: str | None,
    social_urls: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    LinkedIn as narrative source (best-effort, no official free API):
      1) Profile/company URLs already on Dex/project links
      2) DuckDuckGo site:linkedin.com search for ticker/name
    """
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Linked URLs first (company page / profile on the token)
    for raw in social_urls or []:
        u = (raw or "").strip()
        if not u or "linkedin.com" not in u.lower():
            continue
        key = u.rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        handle = _handle_from_url(u)
        out.append(
            {
                "source": "linkedin_link",
                "platform": "linkedin",
                "text": f"LinkedIn linked on project profile: {handle or u}",
                "url": u if u.startswith("http") else "https://" + u.lstrip("/"),
                "weight": 2.4,
            }
        )

    # Public web search restricted to LinkedIn
    queries: list[str] = []
    if symbol:
        queries.append(f"site:linkedin.com {symbol} crypto OR solana OR token OR company")
        queries.append(f'site:linkedin.com/company "{symbol}"')
    if name and len(name) > 2:
        queries.append(f'site:linkedin.com "{name}" crypto OR blockchain OR token')

    for q in queries[:2]:
        url = f"https://duckduckgo.com/html/?q={quote_plus(q)}"
        try:
            page = get_text(
                url,
                timeout=_TIMEOUT,
                retries=0,
                headers={
                    **DEFAULT_HEADERS,
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
        except Exception:  # noqa: BLE001
            continue
        # Titles + snippets; also capture linkedin.com hrefs when present
        for m in re.finditer(
            r'href="(https?://[^"]*linkedin\.com[^"]*)"[^>]*>(.*?)</a>'
            r'|class="result__snippet"[^>]*>(.*?)</(?:a|td|div)>'
            r'|class="result__a"[^>]*>(.*?)</a>',
            page,
            re.I | re.S,
        ):
            href = (m.group(1) or "").strip()
            raw = m.group(2) or m.group(3) or m.group(4) or ""
            text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
            text = re.sub(r"\s+", " ", text).strip()
            if href and "linkedin.com" in href.lower():
                key = href.rstrip("/").lower()
                if key not in seen:
                    seen.add(key)
                    out.append(
                        {
                            "source": "linkedin_search",
                            "platform": "linkedin",
                            "text": (text or "LinkedIn result")[:320],
                            "url": href,
                            "weight": 2.1 if _NARRATIVE_HINTS.search(text or "") else 1.7,
                        }
                    )
            elif text and len(text) >= 30 and "linkedin" in text.lower():
                key = text[:80].lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    {
                        "source": "linkedin_search",
                        "platform": "linkedin",
                        "text": text[:320],
                        "url": "",
                        "weight": 1.8 if _NARRATIVE_HINTS.search(text) else 1.5,
                    }
                )
            if len(out) >= 10:
                return out
    return out


def _from_duckduckgo(symbol: str | None, name: str | None) -> list[dict[str, Any]]:
    """HTML lite search — picks up TikTok/IG/LinkedIn/news blurbs in result snippets."""
    queries = []
    if symbol:
        queries.append(f"{symbol} memecoin narrative OR tiktok OR instagram OR linkedin")
        queries.append(f"${symbol} pump.fun OR solana")
    if name and len(name) > 2:
        queries.append(f'"{name}" crypto meme story OR narrative OR linkedin')

    out: list[dict[str, Any]] = []
    for q in queries[:2]:
        url = f"https://duckduckgo.com/html/?q={quote_plus(q)}"
        try:
            page = get_text(
                url,
                timeout=_TIMEOUT,
                retries=0,
                headers={
                    **DEFAULT_HEADERS,
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
        except Exception:  # noqa: BLE001
            continue
        # result snippets
        for m in re.finditer(
            r'class="result__snippet"[^>]*>(.*?)</a>|class="result__a"[^>]*>(.*?)</a>',
            page,
            re.I | re.S,
        ):
            raw = m.group(1) or m.group(2) or ""
            text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) < 30:
                continue
            plat = "web_search"
            low = text.lower()
            if "tiktok" in low:
                plat = "tiktok"
            elif "instagram" in low or " insta " in f" {low} ":
                plat = "instagram"
            elif "linkedin" in low:
                plat = "linkedin"
            elif "twitter" in low or " x.com" in low:
                plat = "x"
            out.append(
                {
                    "source": "duckduckgo",
                    "platform": plat,
                    "text": text[:320],
                    "url": "",
                    "weight": (
                        1.6
                        if plat in {"tiktok", "instagram", "linkedin"}
                        else 1.2
                    ),
                }
            )
            if len(out) >= 12:
                return out
    return out


def _parse_rss(xml_text: str, limit: int = 15) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return out
    items = root.findall(".//item")
    for item in items[:limit]:
        title = (item.findtext("title") or "").strip()
        desc = (item.findtext("description") or "").strip()
        desc = html.unescape(re.sub(r"<[^>]+>", " ", desc))
        desc = re.sub(r"\s+", " ", desc).strip()
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        text = desc if len(desc) > len(title) else title
        if desc and title and desc != title:
            text = f"{title}. {desc}" if title not in desc else desc
        if not text:
            continue
        out.append(
            {
                "title": title[:120],
                "text": text[:400],
                "link": link,
                "published": pub,
            }
        )
    return out


def _platform_from_url(url: str) -> str:
    try:
        host = (urlparse(url).netloc or "").lower()
    except Exception:  # noqa: BLE001
        host = url.lower()
    if "tiktok" in host:
        return "tiktok"
    if "instagram" in host:
        return "instagram"
    if "linkedin" in host:
        return "linkedin"
    if "twitter" in host or host in {"x.com", "www.x.com"}:
        return "x"
    if "youtube" in host or "youtu.be" in host:
        return "youtube"
    if "t.me" in host or "telegram" in host:
        return "telegram"
    if "reddit" in host:
        return "reddit"
    if "pump.fun" in host:
        return "pumpfun"
    if "dexscreener" in host:
        return "dexscreener"
    return "web"


def _handle_from_url(url: str) -> str:
    try:
        path = urlparse(url).path.strip("/")
    except Exception:  # noqa: BLE001
        return ""
    parts = [p for p in path.split("/") if p]
    if not parts:
        return ""
    # tiktok.com/@user, instagram.com/user
    h = parts[0]
    if h.startswith("@"):
        return h
    if h in {"reel", "p", "status", "video", "channel", "c"}:
        return parts[1] if len(parts) > 1 else h
    return h


def _dedupe_snippets(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for s in sorted(items, key=lambda x: -float(x.get("weight") or 1)):
        key = re.sub(r"\s+", " ", (s.get("text") or "").lower())[:120]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _dedupe_descriptions(items: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for d in items:
        key = re.sub(r"\s+", " ", (d.get("text") or "").lower())[:100]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(d)
    return out
