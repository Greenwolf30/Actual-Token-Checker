"""
Build a short *theme / hype* narrative for a token.

Priority:
  1. Official coin facts / string elements from:
     CoinGecko, on-chain metadata URI, Pump.fun, Birdeye, DexScreener,
     CoinMarketCap, website OG, Jupiter, Solscan, Rugcheck meta text
  2. Theme tags only from that official text + verified name/symbol
  3. Community chatter (X, news) as secondary color (must mention the coin)
  4. Rugcheck risk *text* as risk context (not a backstory)

Does NOT invent a story when no official description exists.
Does NOT discuss ATH, initial market cap, or price-history valuation.
"""

from __future__ import annotations

import re
from typing import Any

# Theme keyword buckets (name/symbol/description/posts)
_THEME_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("politics / election", (
        "trump", "biden", "obama", "harris", "maga", "democrat", "republican",
        "election", "vote", "president", "congress", "senate", "political",
        "government", "whitehouse", "potus", "kamala", "elon", "musk",
        "policy", "tariff", "border", "left", "right wing", "libertarian",
    )),
    ("AI / tech", (
        "ai", "gpt", "openai", "agent", "robot", "neural", "llm", "agi", "machine",
    )),
    ("animal / meme pet", (
        "dog", "cat", "inu", "pepe", "frog", "wojak", "doge", "shiba", "kitten",
        "bonk", "popcat", "monkey", "ape", "penguin", "bear", "bull",
    )),
    ("celebrity / influencer", (
        "celebrity", "influencer", "rapper", "athlete", "hollywood", "kanye", "drake",
        "rogan", "musk", "celebrity", "famous",
    )),
    ("crypto culture / degen", (
        "meme", "degen", "wagmi", "ngmi", "pump", "moon", "ape", "jeet", "cto",
        "community take over", "community takeover",
    )),
    ("religion / spiritual", (
        "jesus", "god", "bible", "church", "faith", "pray", "holy", "satan",
    )),
    ("finance / money", (
        "bank", "dollar", "money", "rich", "wealth", "gold", "silver", "fed",
        "inflation", "recession",
    )),
    ("gaming / internet culture", (
        "game", "gamer", "twitch", "tiktok", "youtube", "stream", "npc", "sigma",
        "rizz", "skibidi",
    )),
    ("war / geopolitics", (
        "war", "ukraine", "russia", "israel", "gaza", "china", "taiwan", "nato",
        "military", "army",
    )),
]

_HYPE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("viral meme / internet joke energy", (
        "meme", "funny", "joke", "viral", "trend", "trending", "lol", "lmao",
    )),
    ("celebrity or mega-account attention", (
        "elon", "musk", "trump", "celebrity", "shoutout", "called out", "mentioned",
    )),
    ("political controversy or campaign angle", (
        "election", "campaign", "maga", "vote", "president", "ban", "lawsuit",
        "arrest", "indict",
    )),
    ("community / CTO takeover narrative", (
        "cto", "community", "takeover", "dev rugged", "community run", "holders",
    )),
    ("fresh launch / bonding-curve momentum", (
        "pump.fun", "pumpfun", "bonding", "just launched", "new pair", "fair launch",
    )),
    ("exchange / listing speculation", (
        "listing", "binance", "coinbase", "upbit", "listed", "cex",
    )),
    ("partnership / product claim", (
        "partnership", "collab", "utility", "roadmap", "launch", "app",
    )),
]

# Handles that read as "large account" when they appear in post sources
_BIG_HANDLE_HINTS = {
    "elonmusk", "trump", "realdonaldtrump", "vitalikbuterin", "cz_binance",
    "cobie", "hsaka", "cryptokaleo", "ansem", "blknoiz06", "lookonchain",
    "spotonchain", "solana", "a1lon9", "0xmert_", "dexscreener", "pumpdotfun",
    "birdeye_so", "jupiterexchange", "warpcast", "naval", "balajis",
}


def build_narrative(
    *,
    pair_summary: dict[str, Any],
    socials: dict[str, Any],
    history: dict[str, Any] | None = None,  # kept for call-site compatibility; unused
    sentiment: dict[str, Any] | None = None,
    pumpfun: dict[str, Any] | None = None,
    social_sources: dict[str, Any] | None = None,
    coin_facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base = pair_summary.get("base_token") or {}
    facts = coin_facts or {}
    name = facts.get("name") or base.get("name") or "Unknown"
    symbol = facts.get("symbol") or base.get("symbol") or "?"
    chain = pair_summary.get("chain_id") or "unknown"
    dex = pair_summary.get("dex_id") or "unknown"
    addr = (base.get("address") or facts.get("token_address") or "")[:12]

    sent = (sentiment or {}).get("sentiment") or {}
    sample_posts = (sentiment or {}).get("sample_posts") or []
    twitter = (socials or {}).get("twitter_handle") or (
        (facts.get("links") or {}).get("twitter") or ""
    )
    if isinstance(twitter, str) and "x.com/" in twitter:
        twitter = twitter.rstrip("/").split("/")[-1]
    social_src = social_sources or {}

    official = (facts.get("official_description") or "").strip()
    official_source = facts.get("official_source") or ""
    categories = list(facts.get("categories") or [])
    fact_tags = list(facts.get("tags") or [])
    fact_sources = list(facts.get("sources_used") or [])
    fact_fragments = list(facts.get("description_fragments") or [])
    risk_notes = list(facts.get("risk_notes") or [])

    # Community text only as secondary color — filter for relevance
    web_snippets = _filter_relevant_snippets(
        list(social_src.get("snippets") or []),
        symbol=symbol,
        name=name,
        address=base.get("address") or facts.get("token_address"),
    )
    descriptions = list(social_src.get("description_blocks") or [])
    # Fold multi-source coin description fragments into the description pool
    for fr in fact_fragments:
        src = fr.get("source") or "coin_api"
        text = (fr.get("text") or "").strip()
        if not text:
            continue
        descriptions.append({"source": src, "text": text, "url": ""})
    if official:
        descriptions = [
            {"source": official_source or "official", "text": official, "url": ""}
        ] + [d for d in descriptions if (d.get("text") or "")[:80] != official[:80]]
    platforms = list(social_src.get("platforms_seen") or [])

    # Theme tags from official text first (avoids wrong themes from random news)
    theme_corpus = " ".join(
        [
            name or "",
            symbol or "",
            official,
            " ".join(categories),
            " ".join(fact_tags),
            " ".join(str(d.get("text") or "") for d in descriptions[:6]),
            " ".join(str(fr.get("text") or "") for fr in fact_fragments[:6]),
        ]
    ).lower()
    themes = _match_themes(theme_corpus)
    theme_cats = _prefer_theme_categories(categories)
    # Jupiter-style tags (meme, community, verified) as soft theme hints
    for t in fact_tags:
        tl = str(t).strip().lower()
        if tl in {"meme", "memes"} and "animal / meme pet" not in themes:
            themes = ["meme / culture"] + themes
        if tl in {"ai", "agent"} and "AI / tech" not in themes:
            themes = ["AI / tech"] + themes
    if theme_cats:
        # Prefer real themes (Meme, Dog-Themed) over "X Ecosystem" listing tags
        themes = theme_cats[:3] + [t for t in themes if t not in theme_cats]

    hype = _match_hype(
        theme_corpus, pair_summary, pumpfun, sample_posts, web_snippets, platforms
    )
    political = _political_bits(theme_corpus) if official or categories else []
    big_x = _big_account_bits(sample_posts, twitter if isinstance(twitter, str) else None)

    story_lines: list[str] = []
    if official:
        story_lines.append(official if len(official) <= 320 else official[:317] + "…")
    # Prefer multi-source fact fragments before free-web chatter
    for fr in fact_fragments:
        t = (fr.get("text") or "").strip()
        if not t or (official and t[:60].lower() in official[:200].lower()):
            continue
        labeled = f"[{fr.get('source')}] {t}"
        story_lines.append(labeled if len(labeled) <= 280 else labeled[:277] + "…")
        if len(story_lines) >= 5:
            break
    story_lines.extend(
        _extract_story_lines(
            [d for d in descriptions if d.get("source") != official_source][:3],
            web_snippets,
        )[:3]
    )
    # de-dupe story lines
    _seen_sl: set[str] = set()
    _uniq_sl: list[str] = []
    for sl in story_lines:
        key = re.sub(r"\s+", " ", sl).lower()[:90]
        if key in _seen_sl:
            continue
        _seen_sl.add(key)
        _uniq_sl.append(sl)
    story_lines = _uniq_sl[:6]

    real_quotes = []
    if official:
        real_quotes.append(official if len(official) <= 200 else official[:197] + "…")
    real_quotes.extend(
        _pick_real_world_quotes(
            [{"text": fr.get("text")} for fr in fact_fragments[:4]],
            web_snippets,
            sample_posts,
            limit=5,
        )
    )
    real_quotes = real_quotes[:6]

    if official or theme_cats or themes:
        theme_label = themes[0] if themes else (
            theme_cats[0] if theme_cats else "listed crypto token"
        )
    else:
        theme_label = themes[0] if themes else _fallback_theme(
            name, symbol, dex, descriptions
        )
        if theme_label == "meme / narrative token" and not official:
            theme_label = "insufficient official description"

    interest = _why_interested(
        theme_label=theme_label,
        themes=themes,
        hype=hype,
        political=political,
        big_x=big_x,
        pair_summary=pair_summary,
        pumpfun=pumpfun,
        sent=sent,
        sample_posts=sample_posts,
        story_lines=story_lines if official else [],
        platforms=platforms,
        has_official=bool(official),
        categories=categories,
    )
    headline = f"{name} (${symbol}) — {theme_label}"

    # ── Paragraph: official facts first ───────────────────────────────
    para_parts: list[str] = []
    if fact_sources:
        para_parts.append(
            f"{name} (${symbol}) facts from: " + ", ".join(fact_sources[:6]) + "."
        )
    else:
        para_parts.append(
            f"{name} (${symbol}) on {chain}"
            + (f" via {dex}" if dex and dex != "unknown" else "")
            + "."
        )

    if official:
        para_parts.append(
            f"Official description ({official_source}): {story_lines[0]}"
        )
    else:
        para_parts.append(
            "No project description was returned by CoinGecko, metadata URI, "
            "Pump.fun, Birdeye, DexScreener, CMC, website OG, Jupiter, Solscan, "
            "or Rugcheck for this contract — not inventing a story."
        )

    if len(fact_fragments) > 1:
        extra_bits = []
        for fr in fact_fragments[1:4]:
            t = (fr.get("text") or "").strip()
            if not t:
                continue
            if len(t) > 100:
                t = t[:97] + "…"
            extra_bits.append(f"{fr.get('source')}: {t}")
        if extra_bits:
            para_parts.append(
                "Also described as: " + " | ".join(extra_bits) + "."
            )

    if categories:
        para_parts.append("Listed categories: " + ", ".join(categories[:6]) + ".")
    if fact_tags:
        para_parts.append("Listing tags: " + ", ".join(fact_tags[:8]) + ".")
    if risk_notes:
        para_parts.append(
            "Risk notes (Rugcheck text): " + "; ".join(risk_notes[:3]) + "."
        )

    if interest:
        para_parts.append("Why people are interested: " + "; ".join(interest[:4]) + ".")

    if hype and (official or categories):
        para_parts.append("Market / social attention signals: " + "; ".join(hype[:4]) + ".")
    elif hype and not official:
        # Softer language when we lack official copy
        para_parts.append(
            "Secondary chatter (not verified project copy): " + "; ".join(hype[:3]) + "."
        )

    if political and official:
        para_parts.append("Angles in official/community text: " + "; ".join(political[:2]) + ".")

    links = facts.get("links") or {}
    if links:
        link_bits = []
        for k in ("website", "twitter", "telegram"):
            if links.get(k):
                link_bits.append(f"{k}")
        if link_bits:
            para_parts.append("Project links on record: " + ", ".join(link_bits) + ".")

    if twitter and isinstance(twitter, str) and not twitter.startswith("http"):
        para_parts.append(f"Project X handle: @{twitter.lstrip('@')}.")

    sent_label = sent.get("label")
    if sent_label and sent_label not in {"unknown", "n/a"} and (sample_posts or official):
        para_parts.append(
            f"Community tone sample: {sent_label} ({sent.get('kind') or 'sample'})."
        )

    conf = facts.get("confidence") or "low"
    para_parts.append(
        f"Narrative confidence: {conf}. Based on API coin facts"
        + (" + filtered community mentions" if web_snippets else "")
        + " — not financial advice."
    )

    # ── Bullets ───────────────────────────────────────────────────────
    bullets: list[str] = [
        f"Theme / category: {theme_label}",
        f"Fact confidence: {conf}",
    ]
    if fact_sources:
        bullets.append("Coin data APIs: " + ", ".join(fact_sources))
    if categories:
        bullets.append("Categories: " + ", ".join(categories[:8]))
    if official:
        bullets.append("Official description:")
        bullets.append(f"  • ({official_source}) {story_lines[0]}")
    else:
        bullets.append("Official description: not available from coin string APIs")

    if fact_fragments:
        bullets.append("Description sources (string elements):")
        for fr in fact_fragments[:6]:
            t = (fr.get("text") or "").strip()
            if len(t) > 160:
                t = t[:157] + "…"
            bullets.append(f"  • [{fr.get('source')}] {t}")

    if fact_tags:
        bullets.append("Tags: " + ", ".join(fact_tags[:10]))

    facts_lines = list(facts.get("facts_lines") or [])
    if facts_lines:
        bullets.append("Structured facts:")
        bullets.extend(f"  • {line}" for line in facts_lines[:10])

    if links:
        bullets.append("Links from APIs:")
        for k, v in list(links.items())[:8]:
            bullets.append(f"  • {k}: {v}")

    if risk_notes:
        bullets.append("Rugcheck risk text:")
        bullets.extend(f"  • {r}" for r in risk_notes[:5])

    bullets.append("Why people are interested:")
    if interest:
        bullets.extend(f"  • {line}" for line in interest[:5])
    else:
        bullets.append("  • Limited verified copy — attention may be price-only")

    if hype:
        bullets.append("Attention signals (secondary):")
        bullets.extend(f"  • {line}" for line in hype[:5])

    # Public news events (Google News + news-like web hits) — structured for UI
    news_events: list[dict[str, Any]] = []
    seen_news: set[str] = set()
    for s in web_snippets:
        plat = (s.get("platform") or s.get("source") or "").lower()
        if plat not in {"google_news", "news", "web"} and "news" not in plat:
            # keep google_news; also duckduckgo items that look like news headlines
            if plat not in {"duckduckgo", "web_search"}:
                continue
        t = re.sub(r"\s+", " ", str(s.get("text") or "")).strip()
        if not t:
            continue
        key = t[:80].lower()
        if key in seen_news:
            continue
        seen_news.add(key)
        news_events.append(
            {
                "title": t[:200],
                "platform": s.get("platform") or s.get("source") or "news",
                "url": s.get("url"),
                "source": s.get("source"),
            }
        )
    # Prefer google_news first
    news_events.sort(
        key=lambda e: (0 if "news" in (e.get("platform") or "").lower() else 1)
    )

    # Keep bullets lean — UI formats structured fields; avoid full duplication
    if big_x:
        bullets.append("Large X interactions: " + " · ".join(big_x[:5]))

    chat_sources = list(social_src.get("sources_used") or [])
    all_sources = list(dict.fromkeys(fact_sources + chat_sources))

    tags = _tags(
        themes, hype, political, big_x, pair_summary, socials, sent_label or "unknown"
    )
    tags.append(f"confidence:{conf}")
    for s in fact_sources[:4]:
        tags.append(f"fact:{s}")

    # Unified multi-paragraph storyline for the About tab
    storyline = _build_storyline(
        name=name,
        symbol=symbol,
        chain=chain,
        dex=dex,
        theme_label=theme_label,
        themes=themes,
        categories=categories,
        official=official,
        official_source=official_source,
        story_lines=story_lines,
        interest=interest,
        hype=hype,
        sent=sent,
        sample_posts=sample_posts,
        twitter=twitter if isinstance(twitter, str) else None,
        pumpfun=pumpfun,
        pair_summary=pair_summary,
        news_events=news_events[:6],
        conf=conf,
        fact_sources=fact_sources,
        real_quotes=real_quotes,
        fact_fragments=fact_fragments,
        fact_tags=fact_tags,
        risk_notes=risk_notes,
    )

    return {
        "headline": headline,
        "paragraph": " ".join(para_parts),
        "storyline": storyline,
        "bullets": bullets,
        "theme": theme_label,
        "themes": themes,
        "why_interested": interest,
        "hype_drivers": hype,
        "political": political,
        "large_x": big_x,
        "story_lines": story_lines,
        "quotes": real_quotes,
        "official_description": official,
        "official_source": official_source,
        "description_fragments": fact_fragments,
        "risk_notes": risk_notes,
        "categories": categories,
        "listing_tags": fact_tags,
        "news_events": news_events[:12],
        "coin_facts": {
            "ok": facts.get("ok"),
            "confidence": conf,
            "sources_used": fact_sources,
            "links": links,
            "description_fragments": fact_fragments,
            "risk_notes": risk_notes,
            "tags": fact_tags,
        },
        "sources_used": all_sources,
        "platforms": platforms,
        "social_sources": {
            "ok": social_src.get("ok"),
            "sources_used": chat_sources,
            "platforms_seen": platforms,
            "snippet_count": len(web_snippets),
            "description_count": len(descriptions),
            "notes": social_src.get("notes"),
        },
        "tags": tags,
    }


def _build_storyline(
    *,
    name: str,
    symbol: str,
    chain: str,
    dex: str,
    theme_label: str,
    themes: list[str],
    categories: list[str],
    official: str,
    official_source: str,
    story_lines: list[str],
    interest: list[str],
    hype: list[str],
    sent: dict[str, Any],
    sample_posts: list[dict[str, Any]],
    twitter: str | None,
    pumpfun: dict[str, Any] | None,
    pair_summary: dict[str, Any],
    news_events: list[dict[str, Any]],
    conf: str,
    fact_sources: list[str],
    real_quotes: list[str],
    fact_fragments: list[dict[str, Any]] | None = None,
    fact_tags: list[str] | None = None,
    risk_notes: list[str] | None = None,
) -> str:
    """
    Weave multi-source string elements, community tone, and news into one
    readable story about what the token is and why people talk about it.
    """
    paras: list[str] = []
    fragments = list(fact_fragments or [])
    tags = list(fact_tags or [])
    risks = list(risk_notes or [])

    # Opening: what it is / where it trades
    open_s = f"{name} (${symbol}) is a token on {chain}"
    if dex and dex != "unknown":
        open_s += f", most active on {dex}"
    open_s += f", framed as a {theme_label} story"
    if categories:
        open_s += " and listed under " + ", ".join(categories[:4])
    if tags:
        open_s += " (tags: " + ", ".join(tags[:5]) + ")"
    paras.append(open_s + ".")

    # What the project / string sources say it is
    if official:
        src = f" ({official_source})" if official_source else ""
        body = official if len(official) <= 480 else official[:477] + "…"
        paras.append(f"What it claims to be{src}: {body}")
    elif story_lines:
        paras.append(
            "What sources say it's about: "
            + " ".join(story_lines[:2])
        )
    else:
        paras.append(
            "There is little official project copy from CoinGecko, on-chain "
            "metadata URI, Pump.fun, Birdeye, DexScreener, CMC, website OG, "
            "Jupiter, Solscan, or Rugcheck — so this narrative sticks to market "
            "tags and filtered community chatter rather than inventing a backstory."
        )

    # Multi-source description fragments (the string-element blend)
    if len(fragments) > 1:
        bits = []
        for fr in fragments[1:5]:
            t = re.sub(r"\s+", " ", str(fr.get("text") or "")).strip()
            if not t:
                continue
            if official and t[:50].lower() in official[:220].lower():
                continue
            if len(t) > 160:
                t = t[:157] + "…"
            bits.append(f"{fr.get('source')}: {t}")
        if bits:
            paras.append(
                "Across listing/metadata sources: " + " · ".join(bits) + "."
            )

    # Extra story fragments / quotes
    extra = [q for q in (real_quotes or []) if q and q != official][:3]
    if extra and not official:
        paras.append("Community / web fragments: " + " · ".join(extra))
    elif extra and official:
        more = [e for e in extra if e[:40].lower() not in official[:200].lower()][:2]
        if more:
            paras.append("Related notes from the web: " + " · ".join(more))

    # Pump.fun lifecycle
    pf = pumpfun or {}
    if pf.get("is_pump_mint") or pf.get("graduated") is not None or pf.get("on_bonding_curve"):
        if pf.get("graduated") is True:
            paras.append(
                "On Pump.fun it has graduated off the bonding curve onto open DEX "
                "liquidity (e.g. PumpSwap / Raydium-style markets)."
            )
        elif pf.get("on_bonding_curve"):
            paras.append(
                "It still appears on a Pump.fun-style bonding curve — early-stage "
                "launch mechanics rather than a fully graduated market."
            )

    # Why people care / hype (story, not raw lists)
    if interest:
        paras.append(
            "Why people seem interested: " + "; ".join(interest[:4]) + "."
        )
    if hype:
        paras.append(
            "Attention drivers in the wild: " + "; ".join(hype[:4]) + "."
        )

    # Rugcheck risk text as context (not inventing narrative)
    if risks:
        paras.append(
            "Risk text on record (Rugcheck, not a project story): "
            + "; ".join(risks[:4])
            + "."
        )

    # Community tone woven in (not a separate section)
    sent_label = (sent or {}).get("label")
    if sent_label and sent_label not in {"unknown", "n/a", "pending", None}:
        kind = (sent or {}).get("kind") or "sample"
        paras.append(
            f"Recent community tone reads as {sent_label} ({kind}"
            + (
                f", score {(sent or {}).get('score')}"
                if (sent or {}).get("score") is not None
                else ""
            )
            + ")."
        )
    if sample_posts:
        snippets = []
        for p in sample_posts[:3]:
            t = re.sub(r"\s+", " ", str(p.get("text") or "")).strip()
            if t:
                snippets.append(t[:140] + ("…" if len(t) > 140 else ""))
        if snippets:
            paras.append("Voices from chatter: “" + "” · “".join(snippets) + "”.")

    if twitter:
        handle = twitter.lstrip("@")
        paras.append(f"Project X presence points at @{handle} (https://x.com/{handle}).")

    # News as part of the story
    if news_events:
        headlines = []
        for ev in news_events[:4]:
            t = re.sub(r"\s+", " ", str(ev.get("title") or "")).strip()
            if t:
                headlines.append(t[:160])
        if headlines:
            paras.append("In the news / web: " + " | ".join(headlines) + ".")

    # Liquidity/volume color without dumping full market table
    try:
        vol = float(pair_summary.get("volume_h24_usd") or 0)
        liq = float(
            (pair_summary.get("liquidity") or {}).get("usd")
            or pair_summary.get("liquidity_usd")
            or 0
        )
    except (TypeError, ValueError):
        vol, liq = 0.0, 0.0
    if vol or liq:
        mbits = []
        if vol:
            mbits.append(f"~${vol:,.0f} 24h volume")
        if liq:
            mbits.append(f"~${liq:,.0f} liquidity")
        paras.append(
            "Market backdrop right now: " + ", ".join(mbits) + " (DexScreener snapshot)."
        )

    sources = ", ".join(fact_sources[:10]) if fact_sources else "public market APIs"
    paras.append(
        f"Story confidence: {conf}. Built from string sources: {sources}"
        + " plus filtered community/news snippets when available. "
        "Heuristics only — not financial advice."
    )

    return "\n\n".join(paras)


def _prefer_theme_categories(categories: list[str]) -> list[str]:
    """Skip multi-chain 'Ecosystem' tags; keep meme/theme-like CoinGecko categories."""
    out: list[str] = []
    for c in categories or []:
        cl = str(c).strip()
        if not cl:
            continue
        low = cl.lower()
        if "ecosystem" in low or "gmci" in low or low.endswith(" index"):
            continue
        out.append(cl)
    return out


def _filter_relevant_snippets(
    snippets: list[dict[str, Any]],
    *,
    symbol: str | None,
    name: str | None,
    address: str | None,
) -> list[dict[str, Any]]:
    """Drop chatter that doesn't mention this coin (reduces wrong narratives)."""
    sym = (symbol or "").strip().lower()
    nam = (name or "").strip().lower()
    addr = (address or "").strip().lower()
    addr_short = addr[:8] if len(addr) >= 8 else ""
    out: list[dict[str, Any]] = []
    for s in snippets:
        # Always keep pumpfun / dexscreener / profile-linked items
        plat = (s.get("platform") or "").lower()
        src = (s.get("source") or "").lower()
        if plat in {"pumpfun", "dexscreener"} or "pumpfun" in src or "dexscreener" in src:
            out.append(s)
            continue
        if src in {"profile_link", "linked_social_urls", "pumpfun_links"}:
            out.append(s)
            continue
        text = (s.get("text") or "").lower()
        if not text:
            continue
        hit = False
        if sym and len(sym) >= 2 and (f"${sym}" in text or re.search(rf"\b{re.escape(sym)}\b", text)):
            hit = True
        if nam and len(nam) >= 3 and nam in text:
            hit = True
        if addr_short and addr_short in text:
            hit = True
        if hit:
            out.append(s)
    return out


def _why_interested(
    *,
    theme_label: str,
    themes: list[str],
    hype: list[str],
    political: list[str],
    big_x: list[str],
    pair_summary: dict[str, Any],
    pumpfun: dict[str, Any] | None,
    sent: dict[str, Any],
    sample_posts: list[dict[str, Any]],
    story_lines: list[str] | None = None,
    platforms: list[str] | None = None,
    has_official: bool = False,
    categories: list[str] | None = None,
) -> list[str]:
    """
    Plain-language reasons people might care about the token —
    separate from raw hype mechanics when possible.
    """
    reasons: list[str] = []

    if has_official and story_lines:
        reasons.append("project publishes an official description on coin data APIs")
        # Don't paste full essay as "reason" — one short line only
        short = story_lines[0]
        if len(short) > 120:
            short = short[:117] + "…"
        reasons.append(f"stated purpose/story: {short}")

    if categories:
        reasons.append("listed under: " + ", ".join(categories[:4]))

    plats = {p.lower() for p in (platforms or [])}
    if has_official and "tiktok" in plats:
        reasons.append("TikTok mentions appear in public search (viral short-form angle)")
    if has_official and "instagram" in plats:
        reasons.append("Instagram is linked or mentioned in public web results")
    if "google_news" in plats and has_official:
        reasons.append("picked up in news/search headlines")
    if "reddit" in plats and has_official:
        reasons.append("discussed on Reddit in the recent search window")
    if "pumpfun" in plats:
        reasons.append("Pump.fun page metadata is available for this mint")

    # Theme identity — only assert strongly when we have official copy
    if has_official and theme_label and theme_label not in {
        "meme / narrative token",
        "insufficient official description",
    }:
        reasons.append(f"fits theme/category: {theme_label}")
    elif not has_official:
        reasons.append("no verified project copy — interest may be pure price/speculation")

    for t in themes[1:3]:
        if t != theme_label:
            reasons.append(f"secondary angle: {t}")

    for p in political[:2]:
        reasons.append(f"ties into {p.lower()} that draws news-driven attention")

    if big_x:
        reasons.append(
            "notable X accounts appear in the chatter sample ("
            + ", ".join(big_x[:3])
            + ")"
        )
    if any("shoutout" in (h or "").lower() or "mega-account" in (h or "").lower() for h in hype):
        reasons.append("attention is partly social-proof driven (mentions / callouts)")

    if pumpfun and pumpfun.get("on_bonding_curve"):
        reasons.append("it's still on a Pump.fun bonding curve — early-launch FOMO")
    elif pumpfun and pumpfun.get("is_pump_mint"):
        reasons.append("it originated as a Pump.fun-style launch (meme launchpad culture)")

    chg = (pair_summary.get("price_change_pct") or {}).get("h24")
    vol = pair_summary.get("volume_h24_usd")
    try:
        if chg is not None and abs(float(chg)) >= 25:
            direction = "up" if float(chg) > 0 else "down"
            reasons.append(
                f"traders are watching sharp 24h move ({float(chg):+.0f}% {direction})"
            )
    except (TypeError, ValueError):
        pass
    try:
        if vol is not None and float(vol) >= 50_000:
            reasons.append("elevated trading volume suggests active speculative interest")
    except (TypeError, ValueError):
        pass

    label = (sent.get("label") or "").lower()
    if label == "bullish" and (sent.get("kind") or "") != "market_crowd":
        reasons.append("recent community posts lean bullish / excited")
    elif label == "bullish" and (sent.get("kind") or "") == "market_crowd":
        reasons.append("buy-side flow is stronger than sells in the latest window")

    if any("cto" in (h or "").lower() or "community" in (h or "").lower() for h in hype):
        reasons.append("community-takeover / holder-run story can attract loyal bags")

    for p in sample_posts[:8]:
        t = (p.get("text") or "").lower()
        if any(k in t for k in ("because", "reason", "narrative", "meta is", "this is the")):
            snippet = re.sub(r"\s+", " ", (p.get("text") or "")).strip()
            if len(snippet) > 110:
                snippet = snippet[:107] + "…"
            if snippet:
                reasons.append(f'community framing: “{snippet}”')
            break

    seen: set[str] = set()
    out: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


def _build_corpus(
    name: str,
    symbol: str,
    socials: dict[str, Any],
    posts: list[dict[str, Any]],
    pumpfun: dict[str, Any] | None,
    social_src: dict[str, Any] | None = None,
) -> str:
    parts = [name or "", symbol or ""]
    for s in socials.get("socials") or []:
        if isinstance(s, dict):
            parts.append(str(s.get("handle") or ""))
            parts.append(str(s.get("url") or ""))
    for w in socials.get("websites") or []:
        if isinstance(w, dict):
            parts.append(str(w.get("url") or ""))
            parts.append(str(w.get("label") or ""))
    for p in posts:
        parts.append(str(p.get("text") or ""))
        parts.append(str(p.get("source") or ""))
    if pumpfun:
        if pumpfun.get("on_bonding_curve"):
            parts.append("pump.fun bonding curve launch")
        if pumpfun.get("is_pump_mint"):
            parts.append("pumpfun meme mint")
    if social_src:
        for d in social_src.get("description_blocks") or []:
            parts.append(str(d.get("text") or ""))
        for s in social_src.get("snippets") or []:
            parts.append(str(s.get("text") or ""))
            parts.append(str(s.get("platform") or ""))
    return " ".join(parts).lower()


def _match_themes(corpus: str) -> list[str]:
    hits: list[str] = []
    for label, keys in _THEME_RULES:
        if any(re.search(rf"\b{re.escape(k)}\b", corpus) for k in keys):
            hits.append(label)
    return hits


def _match_hype(
    corpus: str,
    pair_summary: dict[str, Any],
    pumpfun: dict[str, Any] | None,
    posts: list[dict[str, Any]],
    web_snippets: list[dict[str, Any]] | None = None,
    platforms: list[str] | None = None,
) -> list[str]:
    hits: list[str] = []
    for label, keys in _HYPE_RULES:
        if any(re.search(rf"\b{re.escape(k)}\b", corpus) for k in keys):
            hits.append(label)

    chg = (pair_summary.get("price_change_pct") or {}).get("h24")
    vol = pair_summary.get("volume_h24_usd")
    try:
        if chg is not None and float(chg) >= 40:
            hits.append(f"sharp 24h price momentum ({float(chg):+.0f}%)")
    except (TypeError, ValueError):
        pass
    try:
        if vol is not None and float(vol) >= 100_000:
            hits.append("elevated 24h trading activity")
    except (TypeError, ValueError):
        pass

    if pumpfun and pumpfun.get("on_bonding_curve"):
        hits.append("still on Pump.fun bonding curve (launch-phase attention)")
    elif pumpfun and pumpfun.get("is_pump_mint"):
        hits.append("Pump.fun-origin mint (meme launch culture)")

    plats = {p.lower() for p in (platforms or [])}
    if "tiktok" in plats:
        hits.append("TikTok / short-form viral mentions in public search")
    if "instagram" in plats:
        hits.append("Instagram presence (linked profile or web mentions)")
    if "google_news" in plats:
        hits.append("news-headline pickup (Google News RSS)")
    if "x" in plats or any((p.get("source") or "").startswith("nitter") for p in posts):
        hits.append("active X / community chatter in search sample")
    if "reddit" in plats:
        hits.append("Reddit discussion in recent search")

    shout_like = 0
    for p in posts:
        src = (p.get("source") or "").lower()
        if "kol" in src or "shoutout" in src or "db:@" in src:
            shout_like += 1
    if shout_like >= 2:
        hits.append("multiple stored X shoutouts / watched-account mentions")

    # Count narrative-like web snippets
    narr_snip = 0
    for s in web_snippets or []:
        t = s.get("text") or ""
        if re.search(r"\b(narrative|viral|trending|story|meme|inspired)\b", t, re.I):
            narr_snip += 1
    if narr_snip >= 2:
        hits.append("multiple public posts/pages use story/viral narrative language")

    seen: set[str] = set()
    out: list[str] = []
    for h in hits:
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out


def _extract_story_lines(
    descriptions: list[dict[str, Any]],
    snippets: list[dict[str, Any]],
) -> list[str]:
    """Pull human-readable story lines from Pump.fun / profiles / social text."""
    lines: list[str] = []
    seen: set[str] = set()

    def add(text: str, *, max_len: int = 180) -> None:
        t = re.sub(r"\s+", " ", (text or "")).strip()
        if len(t) < 24:
            return
        # Drop pure ticker spam
        if t.count("$") >= 4 and len(t) < 80:
            return
        if len(t) > max_len:
            t = t[: max_len - 1] + "…"
        key = t.lower()[:90]
        if key in seen:
            return
        seen.add(key)
        lines.append(t)

    for d in descriptions:
        add(str(d.get("text") or ""), max_len=220)
    # Prefer high-weight / narrative-ish snippets
    ranked = sorted(
        snippets,
        key=lambda s: (
            1 if re.search(r"\b(narrative|story|inspired|about|because|viral)\b", s.get("text") or "", re.I) else 0,
            float(s.get("weight") or 0),
        ),
        reverse=True,
    )
    for s in ranked:
        plat = s.get("platform") or s.get("source") or ""
        text = s.get("text") or ""
        if plat and plat not in text.lower()[:20]:
            add(f"[{plat}] {text}", max_len=200)
        else:
            add(text, max_len=200)
        if len(lines) >= 8:
            break
    return lines


def _pick_real_world_quotes(
    descriptions: list[dict[str, Any]],
    snippets: list[dict[str, Any]],
    posts: list[dict[str, Any]],
    limit: int = 5,
) -> list[str]:
    quotes: list[str] = []
    for d in descriptions:
        t = re.sub(r"\s+", " ", str(d.get("text") or "")).strip()
        if len(t) >= 28:
            quotes.append(t[:160] + ("…" if len(t) > 160 else ""))
        if len(quotes) >= limit:
            return quotes
    for s in snippets:
        t = re.sub(r"\s+", " ", str(s.get("text") or "")).strip()
        if len(t) < 28:
            continue
        if len(t) > 150:
            t = t[:147] + "…"
        quotes.append(t)
        if len(quotes) >= limit:
            return quotes
    for p in posts:
        t = re.sub(r"\s+", " ", (p.get("text") or "")).strip()
        if len(t) < 20:
            continue
        if len(t) > 140:
            t = t[:137] + "…"
        quotes.append(t)
        if len(quotes) >= limit:
            break
    return quotes


def _political_bits(corpus: str) -> list[str]:
    bits: list[str] = []
    checks = [
        ("US election / campaign language", ("election", "campaign", "vote", "ballot", "primary")),
        ("Trump / MAGA framing", ("trump", "maga", "realdonaldtrump")),
        ("left/right culture-war framing", ("woke", "maga", "liberal", "conservative", "democrat", "republican")),
        ("policy / government angle", ("tariff", "ban", "sec", "regulation", "fed", "congress", "senate")),
        ("geopolitical conflict angle", ("war", "ukraine", "russia", "israel", "gaza", "china", "taiwan")),
    ]
    for label, keys in checks:
        if any(re.search(rf"\b{re.escape(k)}\b", corpus) for k in keys):
            bits.append(label)
    return bits


def _big_account_bits(posts: list[dict[str, Any]], project_handle: str | None) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    proj = (project_handle or "").lower().lstrip("@")

    for p in posts:
        src = (p.get("source") or "")
        text = (p.get("text") or "")
        # source forms: nitter:@handle, db:@handle(tier), x_api
        handles = set(re.findall(r"@([A-Za-z0-9_]{2,30})", src + " " + text))
        m = re.search(r"(?:nitter|db):@([A-Za-z0-9_]+)", src, re.I)
        if m:
            handles.add(m.group(1))
        # tier hints in source
        tier = ""
        tm = re.search(r"\(([^)]+)\)", src)
        if tm:
            tier = tm.group(1).lower()

        for h in handles:
            hl = h.lower()
            if hl == proj:
                continue
            key = hl
            if key in seen:
                continue
            if hl in _BIG_HANDLE_HINTS or "kol" in tier or "mega" in tier or "official" in tier:
                seen.add(key)
                label = f"@{h}"
                if tier and tier not in {"project", "unknown", "nitter_rss"}:
                    label += f" ({tier})"
                found.append(label)

        # Explicit "mentioned by @x" style in text already captured via handles
    return found


def _pick_quotes(posts: list[dict[str, Any]], limit: int = 3) -> list[str]:
    quotes: list[str] = []
    for p in posts:
        t = re.sub(r"\s+", " ", (p.get("text") or "")).strip()
        if len(t) < 20:
            continue
        if len(t) > 140:
            t = t[:137] + "…"
        quotes.append(t)
        if len(quotes) >= limit:
            break
    return quotes


def _fallback_theme(
    name: str,
    symbol: str,
    dex: str,
    descriptions: list[dict[str, Any]] | None = None,
) -> str:
    blob = f"{name} {symbol}".lower()
    for d in descriptions or []:
        blob += " " + str(d.get("text") or "").lower()
    if "pump" in (dex or "").lower():
        return "Pump.fun-style meme launch"
    if any(k in blob for k in ("pepe", "doge", "inu", "cat", "dog")):
        return "animal / meme culture"
    if any(k in blob for k in ("trump", "biden", "maga", "vote")):
        return "politics / election"
    if any(k in blob for k in ("tiktok", "viral", "trend")):
        return "viral / internet culture"
    return "meme / narrative token"


def _tags(
    themes: list[str],
    hype: list[str],
    political: list[str],
    big_x: list[str],
    pair_summary: dict[str, Any],
    socials: dict[str, Any],
    sent_label: str,
) -> list[str]:
    tags: list[str] = []
    chain = pair_summary.get("chain_id")
    if chain:
        tags.append(str(chain))
    dex = pair_summary.get("dex_id")
    if dex:
        tags.append(str(dex))
    for t in themes[:3]:
        tags.append("theme:" + t.split("/")[0].strip().replace(" ", "_"))
    if political:
        tags.append("political_angle")
    if big_x:
        tags.append("large_x")
    if socials.get("twitter_handle"):
        tags.append("has_twitter")
    tags.append(f"sentiment:{sent_label}")
    return tags
