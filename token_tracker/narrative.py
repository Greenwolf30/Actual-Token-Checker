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

# Theme keyword buckets. Scored: name/symbol > official > community noise.
# Do not put bare elon/musk under politics (mislabels Grok/AI tokens).
_THEME_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("AI / tech", (
        "ai", "a.i", "gpt", "openai", "agent", "robot", "neural", "llm", "agi",
        "machine learning", "deep learning", "grok", "xai", "x.ai", "chatgpt",
        "claude", "gemini", "anthropic", "tech", "software", "silicon", "compute",
        "artificial intelligence", "chatbot", "transformer",
    )),
    ("politics / election", (
        "trump", "biden", "obama", "harris", "maga", "democrat", "republican",
        "election", "vote", "president", "congress", "senate", "political",
        "government", "whitehouse", "potus", "kamala", "ballot", "campaign",
        "policy", "tariff", "right wing", "libertarian",
    )),
    ("animal / meme pet", (
        "dog", "cat", "inu", "pepe", "frog", "wojak", "doge", "shiba", "kitten",
        "bonk", "popcat", "monkey", "ape", "penguin", "puppy", "kitty",
        "duck", "bird", "fox", "wolf", "hamster", "capybara",
        "otter", "seal", "fish", "crab", "goat", "pig",
        "cow", "horse", "rabbit", "bunny", "mouse", "squirrel",
    )),
    ("celebrity / influencer", (
        "celebrity", "influencer", "rapper", "athlete", "espn", "kanye", "drake",
        "rogan", "elon musk", "famous",
    )),
    ("crypto culture / degen", (
        "meme", "degen", "wagmi", "ngmi", "moon", "jeet", "cto",
        "community take over", "community takeover",
    )),
    ("religion / spiritual", (
        "jesus", "god", "bible", "church", "faith", "pray", "holy", "satan",
    )),
    ("finance / money", (
        "bank", "dollar", "money", "rich", "wealth", "gold", "silver", "fed",
        "inflation", "recession",
    )),
    # Real games only — NOT tiktok/youtube (those are distribution, not theme)
    ("gaming", (
        "videogame", "video game", "videogames", "play-to-earn", "play to earn",
        "p2e", "gamefi", "game fi", "mmorpg", "esports", "e-sports", "steam",
        "unity engine", "unreal engine", "in-game", "gamefi", "gamer",
        "rpg", "fps game", "mobile game", "web3 game", "gaming guild",
    )),
    ("war / geopolitics", (
        "war", "ukraine", "russia", "israel", "gaza", "china", "taiwan", "nato",
        "military", "army",
    )),
]

# Name/symbol hard boosts so brand names (Grok, GPT, doge) beat noisy web themes
_NAME_THEME_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("AI / tech", (
        "grok", "gpt", "openai", "claude", "gemini", "chatgpt", "xai", "ai",
        "agent", "llm", "neural", "robot", "tech",
    )),
    ("politics / election", (
        "trump", "biden", "maga", "harris", "obama", "potus", "vote", "elect",
    )),
    ("animal / meme pet", (
        "doge", "shiba", "pepe", "bonk", "popcat", "inu", "kitten", "wojak",
        "dog", "cat", "frog", "ape", "monkey", "penguin", "puppy", "kitty",
        "duck", "fox", "wolf", "hamster", "capybara", "otter", "bunny", "goat",
    )),
    ("gaming", (
        "gamefi", "playtoearn", "p2e", "esports",
    )),
]

# Themes that should not sit together as primary+secondary (pick one)
_THEME_CONFLICTS: dict[str, set[str]] = {
    "animal / meme pet": {"gaming", "AI / tech", "politics / election", "war / geopolitics"},
    "gaming": {"animal / meme pet", "politics / election", "religion / spiritual"},
    "AI / tech": {"politics / election", "animal / meme pet", "religion / spiritual"},
    "politics / election": {"AI / tech", "animal / meme pet", "gaming"},
    "war / geopolitics": {"animal / meme pet", "gaming"},
    "religion / spiritual": {"gaming", "AI / tech"},
}

# CoinGecko / listing category strings → our theme labels (or drop)
_CATEGORY_THEME_MAP: dict[str, str | None] = {
    "gaming": "gaming",
    "play to earn": "gaming",
    "gamefi": "gaming",
    "artificial intelligence": "AI / tech",
    "ai": "AI / tech",
    "ai & big data": "AI / tech",
    "meme": "crypto culture / degen",
    "memes": "crypto culture / degen",
    "dog-themed": "animal / meme pet",
    "cat-themed": "animal / meme pet",
    "animal": "animal / meme pet",
    "politics": "politics / election",
    "political memes": "politics / election",
}

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

    # Theme scoring: name/symbol + official prose weigh much more than news noise.
    # (Community/news used to pull "Grok" tokens into politics via Elon mentions.)
    # Dedupe multi-source description copies up front so the same blurb is not
    # scored/shown three times under different source labels.
    fact_fragments = _dedupe_fragments(fact_fragments)
    descriptions = _dedupe_description_dicts(descriptions)

    name_sym_corpus = f"{name or ''} {symbol or ''}".lower()
    official_corpus = " ".join(
        [
            official or "",
            " ".join(categories),
            " ".join(fact_tags),
            " ".join(
                str(fr.get("text") or "")
                for fr in fact_fragments[:6]
                if (fr.get("source") or "")
                in {
                    "pumpfun",
                    "pumpfun_about",
                    "pumpfun_about_metadata",
                    "pumpfun_about_page",
                    "metadata_uri",
                    "coingecko",
                    "dexscreener",
                    "birdeye",
                    "website_og",
                    "coinmarketcap",
                    "solscan",
                    "rugcheck_meta",
                    "geckoterminal",
                }
            ),
        ]
    ).lower()
    # Theme community color: only project-ish descriptions + posts that name the
    # coin. Exclude free-web / news / LinkedIn scrapes from theme scoring — they
    # often match the brand word ("Grok") while talking about elections/Elon.
    _NOISE_PLATS = {
        "google_news", "news", "web", "duckduckgo", "web_search",
        "linkedin", "linkedin_search",
    }
    theme_community_bits: list[str] = []
    for d in descriptions[:6]:
        src = str(d.get("source") or "").lower()
        if any(n in src for n in _NOISE_PLATS):
            continue
        theme_community_bits.append(str(d.get("text") or ""))
    for s in web_snippets[:6]:
        plat = str(s.get("platform") or s.get("source") or "").lower()
        if any(n in plat for n in _NOISE_PLATS):
            continue
        theme_community_bits.append(str(s.get("text") or ""))
    for p in sample_posts[:4]:
        theme_community_bits.append(str(p.get("text") or ""))
    community_corpus = " ".join(theme_community_bits).lower()
    # Storyline/hype may still use wider community text
    wide_community = " ".join(
        [
            " ".join(str(d.get("text") or "") for d in descriptions[:4]),
            " ".join(str(s.get("text") or "") for s in web_snippets[:6]),
            " ".join(str(p.get("text") or "") for p in sample_posts[:6]),
        ]
    ).lower()
    theme_corpus = f"{name_sym_corpus} {official_corpus}".strip()

    themes = _rank_themes(
        name_symbol=name_sym_corpus,
        official=official_corpus,
        community=community_corpus,
        fact_tags=fact_tags,
    )
    theme_cats = _prefer_theme_categories(categories)
    # Jupiter-style tags (meme, community, verified) as soft theme hints only
    for t in fact_tags:
        tl = str(t).strip().lower()
        if tl in {"meme", "memes"} and "crypto culture / degen" not in themes:
            themes = themes + ["crypto culture / degen"]
        if tl in {"ai", "agent"} and "AI / tech" not in themes:
            themes = ["AI / tech"] + themes
    # Map listing categories into our labels (skip junk like bare "Gaming"
    # when name/official already locked animal/meme).
    mapped_cats = _map_listing_categories(theme_cats)
    if mapped_cats:
        themes = _merge_theme_lists(themes, mapped_cats[:2])
    # Name always wins for clear animal tokens (e.g. "Rigby the Tiktok cat")
    themes = _force_name_theme(name_sym_corpus, themes)
    themes = _prune_conflicting_themes(themes)
    themes = [_normalize_theme_label(t) for t in themes]
    themes = _prune_conflicting_themes(themes)

    primary_theme = themes[0] if themes else ""
    brand_locked = bool(_name_brand_theme_scores(name_sym_corpus)) or bool(
        _animal_in_text(name_sym_corpus)
    )

    hype = _match_hype(
        f"{theme_corpus} {wide_community}".strip(),
        pair_summary,
        pumpfun,
        sample_posts,
        web_snippets,
        platforms,
    )
    # Drop off-theme hype tags when name/official already locked the category
    if brand_locked and primary_theme and "politics" not in primary_theme:
        hype = [
            h
            for h in hype
            if "political" not in h.lower() and "campaign angle" not in h.lower()
        ]
    political = (
        _political_bits(official_corpus)
        if official and "politics" in primary_theme
        else []
    )
    big_x = _big_account_bits(sample_posts, twitter if isinstance(twitter, str) else None)

    story_lines: list[str] = []
    if official:
        story_lines.append(official if len(official) <= 320 else official[:317] + "…")
    # Prefer multi-source fact fragments before free-web chatter
    for fr in fact_fragments:
        t = (fr.get("text") or "").strip()
        if not t:
            continue
        if _text_redundant(t, story_lines):
            continue
        labeled = f"[{fr.get('source')}] {t}"
        story_lines.append(labeled if len(labeled) <= 280 else labeled[:277] + "…")
        if len(story_lines) >= 5:
            break
    for extra in _extract_story_lines(
        [d for d in descriptions if d.get("source") != official_source][:3],
        web_snippets,
    ):
        if _text_redundant(extra, story_lines):
            continue
        if brand_locked and _off_theme_noise(extra, primary_theme, name=name, symbol=symbol):
            continue
        story_lines.append(extra)
        if len(story_lines) >= 6:
            break
    story_lines = _dedupe_text_list(story_lines, limit=6)

    real_quotes = []
    if official:
        real_quotes.append(official if len(official) <= 200 else official[:197] + "…")
    # Prefer quotes from official fragments; only add community/web when on-theme
    quote_posts = sample_posts
    quote_web = web_snippets
    if brand_locked and primary_theme and "politics" not in primary_theme:
        quote_posts = [
            p
            for p in sample_posts
            if not _off_theme_noise(
                str(p.get("text") or ""), primary_theme, name=name, symbol=symbol
            )
        ]
        quote_web = [
            s
            for s in web_snippets
            if not _off_theme_noise(
                str(s.get("text") or ""), primary_theme, name=name, symbol=symbol
            )
        ]
    for q in _pick_real_world_quotes(
        [{"text": fr.get("text")} for fr in fact_fragments[:4]],
        quote_web,
        quote_posts,
        limit=8,
    ):
        if _text_redundant(q, real_quotes):
            continue
        if brand_locked and _off_theme_noise(q, primary_theme, name=name, symbol=symbol):
            continue
        real_quotes.append(q)
        if len(real_quotes) >= 6:
            break

    # Community posts shown in storyline — same relevance gate
    display_posts = sample_posts
    if brand_locked and primary_theme and "politics" not in primary_theme:
        display_posts = [
            p
            for p in sample_posts
            if not _off_theme_noise(
                str(p.get("text") or ""), primary_theme, name=name, symbol=symbol
            )
        ]

    if themes:
        theme_label = themes[0]
    elif theme_cats:
        mapped = _map_listing_categories(theme_cats)
        theme_label = mapped[0] if mapped else _fallback_theme(
            name, symbol, dex, descriptions
        )
    elif official:
        theme_label = "listed crypto token"
    else:
        theme_label = _fallback_theme(name, symbol, dex, descriptions)
        if theme_label == "meme / narrative token" and not official:
            theme_label = "insufficient official description"
    # Final hard gate: never label a "TikTok cat/dog" style name as gaming
    theme_label = _normalize_theme_label(theme_label)
    forced = _force_name_theme(name_sym_corpus, [theme_label] + list(themes))
    if forced:
        theme_label = forced[0]
        themes = forced

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
        official_text=official,
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
        seen_extra: list[str] = [official] if official else []
        for fr in fact_fragments:
            t = (fr.get("text") or "").strip()
            if not t or _text_redundant(t, seen_extra):
                continue
            seen_extra.append(t)
            if len(t) > 100:
                t = t[:97] + "…"
            extra_bits.append(f"{fr.get('source')}: {t}")
            if len(extra_bits) >= 3:
                break
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
        seen_b: list[str] = []
        for fr in fact_fragments:
            t = (fr.get("text") or "").strip()
            if not t or _text_redundant(t, seen_b):
                continue
            seen_b.append(t)
            if len(t) > 160:
                t = t[:157] + "…"
            bullets.append(f"  • [{fr.get('source')}] {t}")
            if len(seen_b) >= 6:
                break

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
    # Drop election/politics noise headlines when the token theme is not politics
    if brand_locked and primary_theme and "politics" not in primary_theme:
        news_events = [
            e
            for e in news_events
            if not _off_theme_noise(
                str(e.get("title") or ""), primary_theme, name=name, symbol=symbol
            )
        ]

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
        sample_posts=display_posts,
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

    # Opening: what it is / where it trades — one clear theme, no mixed buckets
    open_s = f"{name} (${symbol}) is a token on {chain}"
    if dex and dex != "unknown":
        open_s += f", most active on {dex}"
    open_s += f", framed as a {theme_label} story"
    # Only surface listing categories that agree with the primary theme
    aligned_cats = _categories_aligned_with_theme(categories, theme_label)
    if aligned_cats:
        open_s += " and listed under " + ", ".join(aligned_cats[:3])
    if tags:
        # Skip raw platform tags that fight the theme (e.g. bare "gaming")
        safe_tags = [
            t
            for t in tags[:8]
            if not _tag_conflicts_with_theme(str(t), theme_label)
        ][:5]
        if safe_tags:
            open_s += " (tags: " + ", ".join(safe_tags) + ")"
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

    # Multi-source description fragments (skip repeats of the official blurb)
    if len(fragments) > 1:
        bits = []
        seen_bits: list[str] = [official] if official else []
        for fr in fragments:
            t = re.sub(r"\s+", " ", str(fr.get("text") or "")).strip()
            if not t:
                continue
            if _text_redundant(t, seen_bits):
                continue
            seen_bits.append(t)
            if len(t) > 160:
                t = t[:157] + "…"
            bits.append(f"{fr.get('source')}: {t}")
            if len(bits) >= 3:
                break
        if bits:
            paras.append(
                "Across listing/metadata sources: " + " · ".join(bits) + "."
            )

    # Extra story fragments / quotes (deduped against official + already used)
    seen_quotes: list[str] = [official] if official else []
    extra: list[str] = []
    for q in real_quotes or []:
        if not q:
            continue
        if _text_redundant(str(q), seen_quotes):
            continue
        seen_quotes.append(str(q))
        extra.append(str(q))
        if len(extra) >= 2:
            break
    if extra and not official:
        paras.append("Community / web fragments: " + " · ".join(extra))
    elif extra and official:
        paras.append("Related notes from the web: " + " · ".join(extra))

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
        # Keep each reason intact, but skip restating the official description
        # (already shown under "What it claims to be").
        bits = []
        seen_i: list[str] = [official] if official else []
        for r in interest[:8]:
            t = re.sub(r"\s+", " ", str(r or "").strip())
            if not t:
                continue
            # Strip label, check if body is a dupe of official / prior hook
            low_t = t.lower()
            if low_t.startswith("stated purpose/story"):
                continue
            if "publishes an official description" in low_t:
                continue
            body = re.sub(
                r"^(fits theme/category|secondary angle|listed under)\s*:?\s*",
                "",
                t,
                flags=re.I,
            ).strip()
            if official and body and _text_redundant(body, [official]):
                continue
            if body and _text_redundant(body, seen_i):
                continue
            if body:
                seen_i.append(body)
            if not t.endswith("."):
                t = t + "."
            bits.append(t)
            if len(bits) >= 5:
                break
        if bits:
            paras.append("Why people seem interested: " + " ".join(bits))
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
            paras.append(
                "Community sentiment: “" + "” · “".join(snippets) + "”."
            )

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
        # Generic platform buckets that often mislabel meme pets as "Gaming"
        if low in {"gaming", "games", "entertainment", "social money", "collectibles"}:
            # Keep only if we will map them carefully later — still include for map
            out.append(cl)
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
    official_text: str = "",
    categories: list[str] | None = None,
) -> list[str]:
    """
    Plain-language reasons people might care about the token —
    separate from raw hype mechanics when possible.
    """
    reasons: list[str] = []

    # Prefer real official prose — never Jupiter tags / organic-score lines.
    def _is_real_blurb(t: str) -> bool:
        s = re.sub(r"\s+", " ", (t or "").strip())
        if len(s) < 20:
            return False
        low = s.lower()
        if low.startswith("jupiter tags") or "organic score" in low:
            return False
        if re.match(r"^(tags?|listing tags|categories)\s*:", low):
            return False
        return True

    body = re.sub(r"\s+", " ", (official_text or "").strip())
    if not _is_real_blurb(body):
        body = ""
    if not body and story_lines:
        for sl in story_lines:
            cand = re.sub(r"\s+", " ", str(sl or "").strip())
            cand = re.sub(r"^\[[^\]]+\]\s*", "", cand).strip()
            if _is_real_blurb(cand):
                body = cand
                break
    if body:
        reasons.append("project publishes an official description on coin data APIs")
        short = body if len(body) <= 280 else body[:277] + "…"
        reasons.append(f"stated purpose/story: {short}")
    elif has_official:
        # had a non-prose "official" flag — do not claim a story
        pass

    if categories:
        aligned = _categories_aligned_with_theme(list(categories), theme_label)
        if aligned:
            reasons.append("listed under: " + ", ".join(aligned[:4]))

    plats = {p.lower() for p in (platforms or [])}
    if has_official and "tiktok" in plats:
        reasons.append("TikTok mentions appear in public search (viral short-form angle)")
    if has_official and "instagram" in plats:
        reasons.append("Instagram is linked or mentioned in public web results")
    if "google_news" in plats and has_official:
        reasons.append("picked up in news/search headlines")
    if "reddit" in plats and has_official:
        reasons.append("discussed on Reddit in the recent search window")
    if "linkedin" in plats:
        reasons.append(
            "LinkedIn company/profile links or public search mentions appear"
        )
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

    # Only non-conflicting secondaries (already pruned, but double-check)
    for t in themes[1:3]:
        if t == theme_label:
            continue
        if t in _THEME_CONFLICTS.get(theme_label, set()):
            continue
        if theme_label in _THEME_CONFLICTS.get(t, set()):
            continue
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
    """Legacy helper: any keyword hit, rule order (prefer _rank_themes)."""
    hits: list[str] = []
    for label, keys in _THEME_RULES:
        if any(re.search(rf"\b{re.escape(k)}\b", corpus, re.I) for k in keys):
            hits.append(label)
    return hits


def _theme_score_for_corpus(corpus: str, keys: tuple[str, ...]) -> float:
    if not corpus:
        return 0.0
    score = 0.0
    for k in keys:
        if not k:
            continue
        # Multi-word phrases: higher weight
        pat = rf"\b{re.escape(k)}\b"
        n = len(re.findall(pat, corpus, flags=re.I))
        if n:
            score += n * (2.0 if " " in k else 1.0)
        else:
            # Brand compounds: "grok" inside "grok5" / "grokai"
            if " " not in k and len(k) >= 3:
                n2 = len(re.findall(rf"\b{re.escape(k)}[a-z0-9]*\b", corpus, flags=re.I))
                if n2:
                    score += n2 * 0.9
    return score


def _name_brand_theme_scores(name_symbol: str) -> dict[str, float]:
    """
    Hard brand cues from name/symbol only (Grok5 → AI, TrumpCoin → politics).
    Matches whole words and alnum prefixes (grok5, gpt4o).
    """
    ns = (name_symbol or "").lower()
    if not ns.strip():
        return {}
    tokens = re.findall(r"[a-z0-9]+", ns)
    scores: dict[str, float] = {}
    for label, keys in _NAME_THEME_HINTS:
        hit = False
        for k in keys:
            if not k or len(k) < 2:
                continue
            if re.search(rf"\b{re.escape(k)}\b", ns, re.I):
                hit = True
                break
            # prefix: grok ⊂ grok5 ; skip ultra-short keys to avoid "ai" in "paid"
            if len(k) >= 3:
                for tok in tokens:
                    if tok == k or tok.startswith(k) or (
                        len(tok) >= 4 and k.startswith(tok)
                    ):
                        hit = True
                        break
            if hit:
                break
        if hit:
            scores[label] = scores.get(label, 0.0) + 10.0
    return scores


def _rank_themes(
    *,
    name_symbol: str,
    official: str,
    community: str,
    fact_tags: list[str] | None = None,
) -> list[str]:
    """
    Score themes so name/symbol + official copy beat noisy news/X chatter.
    Example: "Grok 5" + tech blurb should rank AI/tech over politics even if
    web snippets mention elections or Elon in passing.
    """
    scores: dict[str, float] = {}
    brand = _name_brand_theme_scores(name_symbol)
    for lab, sc in brand.items():
        scores[lab] = scores.get(lab, 0.0) + sc

    # When the name itself is a clear brand theme, ignore community noise for
    # theme ranking (news about "Grok"/Elon often injects election keywords).
    community_weight = 0.0 if brand else 0.2

    for label, keys in _THEME_RULES:
        s = 0.0
        s += 4.0 * _theme_score_for_corpus(name_symbol, keys)
        s += 3.0 * _theme_score_for_corpus(official, keys)
        s += community_weight * _theme_score_for_corpus(community, keys)
        if s > 0:
            scores[label] = scores.get(label, 0.0) + s

    # Soft tag boosts
    for t in fact_tags or []:
        tl = str(t).strip().lower()
        if tl in {"ai", "agent", "artificial-intelligence"}:
            scores["AI / tech"] = scores.get("AI / tech", 0.0) + 2.5
        if tl in {"meme", "memes"}:
            scores["crypto culture / degen"] = (
                scores.get("crypto culture / degen", 0.0) + 1.5
            )
        if tl in {"politics", "election"}:
            scores["politics / election"] = scores.get("politics / election", 0.0) + 2.0
        if tl in {"gaming", "gamefi", "play-to-earn", "p2e"}:
            scores["gaming"] = scores.get("gaming", 0.0) + 2.0

    # Brand lock: name/symbol theme always outranks community-only competitors
    if brand:
        top_brand = max(brand.items(), key=lambda kv: kv[1])[0]
        brand_floor = max(scores.get(top_brand, 0.0), brand.get(top_brand, 0.0) + 4.0)
        scores[top_brand] = brand_floor
        for lab in list(scores):
            if lab == top_brand:
                continue
            # Keep competing theme only if name also signals it (e.g. "Trump AI")
            if lab not in brand and scores[lab] > brand_floor * 0.45:
                scores[lab] = brand_floor * 0.35

    # Strong name/official primary (even without brand table) dampens conflicts
    ranked_tmp = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    if ranked_tmp:
        top_lab, top_sc = ranked_tmp[0]
        if top_sc >= 6.0:
            conflicts = _THEME_CONFLICTS.get(top_lab, set())
            for lab in list(scores):
                if lab == top_lab:
                    continue
                if lab in conflicts:
                    scores[lab] = min(scores[lab], top_sc * 0.25)

    # Extra: AI name+official must not lose to politics without politics in the name
    ai = scores.get("AI / tech", 0.0)
    pol = scores.get("politics / election", 0.0)
    pol_keys = next(
        (keys for lab, keys in _THEME_RULES if lab == "politics / election"),
        (),
    )
    if ai >= 4.0 and pol > 0 and _theme_score_for_corpus(name_symbol, pol_keys) == 0:
        if "politics / election" not in brand:
            scores["politics / election"] = min(pol * 0.2, ai * 0.3)

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    # Drop near-noise themes (community-only dust)
    out = [lab for lab, sc in ranked if sc >= 1.5]
    return _prune_conflicting_themes(out)


def _merge_theme_lists(preferred: list[str], base: list[str]) -> list[str]:
    out: list[str] = []
    for t in list(preferred) + list(base):
        if t and t not in out:
            out.append(t)
    return out


def _map_listing_categories(categories: list[str]) -> list[str]:
    """Map CoinGecko-style categories into our theme labels; drop noise."""
    out: list[str] = []
    for c in categories or []:
        cl = str(c).strip()
        if not cl:
            continue
        low = cl.lower()
        if low in _CATEGORY_THEME_MAP:
            mapped = _CATEGORY_THEME_MAP[low]
            if mapped and mapped not in out:
                out.append(mapped)
            continue
        # Fuzzy contains
        hit = None
        for key, mapped in _CATEGORY_THEME_MAP.items():
            if key in low:
                hit = mapped
                break
        if hit and hit not in out:
            out.append(hit)
        # Unmapped categories are display-only (not themes) — skip here
    return out


# Animals that lock theme when they appear as whole words in the name
_ANIMAL_WORD_RE = re.compile(
    r"\b("
    r"dog|cat|cats|dogs|inu|pepe|frog|frogs|wojak|doge|shiba|kitten|kittens|"
    r"bonk|popcat|monkey|ape|apes|penguin|penguins|puppy|puppies|kitty|"
    r"duck|ducks|bird|birds|fox|wolf|hamster|capybara|otter|seal|"
    r"fish|crab|goat|pig|cow|horse|rabbit|bunny|mouse|squirrel|"
    r"kitten|meow|woof|bark|paws?"
    r")\b",
    re.I,
)
_SOCIAL_PLATFORM_RE = re.compile(
    r"\b(tiktok|tik\s*tok|youtube|yt|instagram|insta|twitch|snapchat)\b",
    re.I,
)
_REAL_GAME_RE = re.compile(
    r"\b(gamefi|play[\s-]?to[\s-]?earn|p2e|mmorpg|esports|e[\s-]?sports|"
    r"videogame|video\s*game|web3\s*game|mobile\s*game|gaming\s*guild)\b",
    re.I,
)


def _animal_in_text(text: str) -> bool:
    return bool(_ANIMAL_WORD_RE.search(text or ""))


def _normalize_theme_label(label: str) -> str:
    """Collapse legacy / noisy labels to canonical ones."""
    t = str(label or "").strip()
    if not t:
        return t
    low = t.lower()
    # Old buggy bucket that mixed TikTok virality with real games
    if low in {
        "gaming / internet culture",
        "internet culture",
        "gaming/internet culture",
        "games",
        "game",
    }:
        return "gaming"
    if low in {"animal / meme culture", "animal meme", "animal"}:
        return "animal / meme pet"
    if low in {"viral / internet culture", "viral meme"}:
        return "crypto culture / degen"
    return t


def _force_name_theme(name_symbol: str, themes: list[str]) -> list[str]:
    """
    Name/symbol hard overrides.
    'Rigby the Tiktok cat' must be animal — never gaming from the word TikTok.
    """
    ns = (name_symbol or "").lower()
    themes = [_normalize_theme_label(t) for t in (themes or []) if t]
    animal = _animal_in_text(ns)
    social = bool(_SOCIAL_PLATFORM_RE.search(ns))
    real_game = bool(_REAL_GAME_RE.search(ns))

    if animal and not real_game:
        # Animal (+ optional TikTok/YouTube in the name) → animal primary only
        rest = [
            t
            for t in themes
            if t != "animal / meme pet"
            and t != "gaming"
            and "gam" not in t.lower()
        ]
        # TikTok-in-name is distribution, optional soft meme secondary
        if social and "crypto culture / degen" not in rest:
            rest = ["crypto culture / degen"] + rest
        return _prune_conflicting_themes(["animal / meme pet"] + rest)

    if real_game and not animal:
        rest = [t for t in themes if t != "gaming"]
        return _prune_conflicting_themes(["gaming"] + rest)

    # Social platform in name alone (no animal, no game) → meme culture, not gaming
    if social and not real_game:
        cleaned = [
            t
            for t in themes
            if t != "gaming" and "gam" not in (t or "").lower()
        ]
        if not cleaned:
            cleaned = ["crypto culture / degen"]
        elif cleaned[0] == "gaming":
            cleaned[0] = "crypto culture / degen"
        return _prune_conflicting_themes(cleaned)

    # Strip gaming if it only came from social noise and name has no game cue
    if themes and themes[0] in {"gaming", "gaming / internet culture"} and not real_game:
        rest = [t for t in themes[1:] if "gam" not in (t or "").lower()]
        if rest:
            return _prune_conflicting_themes(rest)
        return ["crypto culture / degen"]

    return _prune_conflicting_themes(themes) if themes else themes


def _prune_conflicting_themes(themes: list[str]) -> list[str]:
    """
    Keep a clear primary theme; drop secondaries that fight it.
    Animal meme coin should not also be labeled gaming just because TikTok
    or a CoinGecko 'Gaming' bucket appeared.
    """
    if not themes:
        return []
    # Normalize legacy label
    normed: list[str] = []
    for t in themes:
        tl = str(t or "").strip()
        if not tl:
            continue
        low = tl.lower()
        if low in {"gaming / internet culture", "games", "game"}:
            tl = "gaming"
        if tl not in normed:
            normed.append(tl)
    if not normed:
        return []
    primary = normed[0]
    conflicts = set(_THEME_CONFLICTS.get(primary, set()))
    # Also conflict if secondary's conflict list includes primary
    out = [primary]
    for t in normed[1:]:
        if t == primary:
            continue
        if t in conflicts:
            continue
        if primary in _THEME_CONFLICTS.get(t, set()):
            continue
        # Never keep raw unmapped CG strings that look like gaming next to animals
        if primary.startswith("animal") and "gam" in t.lower():
            continue
        out.append(t)
        if len(out) >= 3:
            break
    return out


def _categories_aligned_with_theme(
    categories: list[str], theme_label: str
) -> list[str]:
    """Only show listing categories that match (or don't fight) the primary theme."""
    if not categories:
        return []
    tl = (theme_label or "").lower()
    out: list[str] = []
    for c in categories:
        cl = str(c).strip()
        if not cl:
            continue
        low = cl.lower()
        mapped = _CATEGORY_THEME_MAP.get(low)
        if mapped is None:
            for key, m in _CATEGORY_THEME_MAP.items():
                if key in low:
                    mapped = m
                    break
        if mapped:
            # Drop category if it maps to a theme that conflicts with primary
            if mapped != theme_label and mapped in _THEME_CONFLICTS.get(theme_label, set()):
                continue
            if theme_label in _THEME_CONFLICTS.get(mapped or "", set()) and mapped != theme_label:
                continue
        else:
            # Unmapped "Gaming" style labels next to animal primary
            if "animal" in tl and "gam" in low:
                continue
            if "ai" in tl and any(x in low for x in ("politic", "election", "animal")):
                continue
        out.append(cl)
        if len(out) >= 4:
            break
    return out


def _tag_conflicts_with_theme(tag: str, theme_label: str) -> bool:
    t = (tag or "").strip().lower()
    tl = (theme_label or "").lower()
    if not t or not tl:
        return False
    if "animal" in tl and t in {"gaming", "gamefi", "game", "games", "p2e"}:
        return True
    if ("ai" in tl or "tech" in tl) and t in {"politics", "election"}:
        return True
    if "politics" in tl and t in {"ai", "agent", "gaming"}:
        return True
    return False


def _norm_text_key(text: str) -> str:
    t = re.sub(r"^\[[^\]]+\]\s*", "", str(text or ""))
    # Drop common source prefixes in storyline lines
    t = re.sub(
        r"^(what it claims to be|stated purpose/story|also described as)\s*[:\(]?\s*",
        "",
        t,
        flags=re.I,
    )
    t = re.sub(r"\s+", " ", t).strip().lower()
    # strip trailing ellipsis / punctuation for compare
    t = re.sub(r"[\.…]+$", "", t).strip()
    return t


def _token_set(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]{3,}", (text or "").lower()) if w}


def _text_redundant(candidate: str, existing: list[str]) -> bool:
    """True if candidate is the same description already shown (or a subset)."""
    c = _norm_text_key(candidate)
    if not c:
        return True
    # Very short strings only count as redundant when we already have content
    # (do not drop a short official blurb like "AI from xAI" when alone).
    if len(c) < 12:
        return bool(existing)
    c_tokens = _token_set(c)
    for prev in existing:
        p = _norm_text_key(prev)
        if not p:
            continue
        if c == p:
            return True
        # Same blurb repeated with different source labels / truncation
        n = min(80, len(c), len(p))
        if n >= 24 and c[:n] == p[:n]:
            return True
        if len(c) >= 24 and c in p:
            return True
        if len(p) >= 24 and p in c:
            return True
        # High overlap of leading content
        if len(c) >= 30 and len(p) >= 30 and c[:50] == p[:50]:
            return True
        # Near-duplicate by token Jaccard (same description, slight rewording)
        if len(c) >= 40 and len(p) >= 40 and c_tokens:
            p_tokens = _token_set(p)
            if p_tokens:
                inter = len(c_tokens & p_tokens)
                union = len(c_tokens | p_tokens) or 1
                if inter / union >= 0.72:
                    return True
    return False


def _dedupe_text_list(items: list[str], *, limit: int = 8) -> list[str]:
    out: list[str] = []
    for raw in items:
        s = str(raw or "").strip()
        if not s:
            continue
        if _text_redundant(s, out):
            continue
        out.append(s)
        if len(out) >= limit:
            break
    return out


def _dedupe_fragments(fragments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep first unique description text across sources (pumpfun ≈ metadata_uri)."""
    out: list[dict[str, Any]] = []
    seen_texts: list[str] = []
    for fr in fragments or []:
        t = re.sub(r"\s+", " ", str(fr.get("text") or "")).strip()
        if not t:
            continue
        if _text_redundant(t, seen_texts):
            continue
        seen_texts.append(t)
        row = dict(fr)
        row["text"] = t
        out.append(row)
    return out


def _dedupe_description_dicts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: list[str] = []
    for d in items or []:
        t = re.sub(r"\s+", " ", str(d.get("text") or "")).strip()
        if not t or _text_redundant(t, seen):
            continue
        seen.append(t)
        row = dict(d)
        row["text"] = t
        out.append(row)
    return out


_POLITICS_NOISE = re.compile(
    r"\b(trump|biden|harris|maga|election|vote|president|congress|senate|"
    r"campaign|ballot|democrat|republican|potus|whitehouse|political|"
    r"government|tariff|kamala|obama)\b",
    re.I,
)
_AI_TECH_CUE = re.compile(
    r"\b(ai|a\.i|gpt|llm|xai|grok|openai|claude|gemini|robot|neural|"
    r"chatbot|software|tech|compute|agent|model|artificial)\b",
    re.I,
)


def _off_theme_noise(
    text: str,
    theme_label: str,
    *,
    name: str | None = None,
    symbol: str | None = None,
) -> bool:
    """
    True when a scrape's politics/election keywords fight a non-politics theme
    (e.g. Google News about Elon elections pulled in for a Grok AI token).
    """
    t = (text or "").strip()
    if not t or not theme_label:
        return False
    tl = theme_label.lower()
    if "politics" in tl or "election" in tl:
        return False
    # Only gate non-politics themes
    if "ai" not in tl and "tech" not in tl and "animal" not in tl and "gaming" not in tl:
        return False
    if not _POLITICS_NOISE.search(t):
        return False
    # Keep if it also clearly talks tech/product for AI themes
    if ("ai" in tl or "tech" in tl) and _AI_TECH_CUE.search(t):
        # Still drop if politics terms dominate over tech cues
        pol_n = len(_POLITICS_NOISE.findall(t))
        tech_n = len(_AI_TECH_CUE.findall(t))
        if tech_n >= pol_n:
            return False
    # Keep if it is primarily about this token name/symbol as a product pitch
    nam = (name or "").strip().lower()
    sym = (symbol or "").strip().lower()
    low = t.lower()
    mentions = (nam and len(nam) >= 3 and nam in low) or (
        sym and len(sym) >= 3 and (f"${sym}" in low or re.search(rf"\b{re.escape(sym)}\b", low))
    )
    if mentions and _AI_TECH_CUE.search(t) and len(_POLITICS_NOISE.findall(t)) <= 1:
        return False
    return True


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
    name_blob = f"{name} {symbol}".lower()
    # Animals always beat TikTok/viral/gaming fallthrough
    if _animal_in_text(name_blob):
        return "animal / meme pet"
    brand = _name_brand_theme_scores(name_blob)
    if "AI / tech" in brand:
        return "AI / tech"
    if "politics / election" in brand:
        return "politics / election"
    if "animal / meme pet" in brand:
        return "animal / meme pet"
    if "gaming" in brand and _REAL_GAME_RE.search(name_blob):
        return "gaming"
    blob = name_blob
    for d in descriptions or []:
        blob += " " + str(d.get("text") or "").lower()
    if _animal_in_text(blob) and not _REAL_GAME_RE.search(blob):
        return "animal / meme pet"
    # Prefer brand/tech name cues before politics (incl. grok5 compounds)
    if any(
        re.search(rf"\b{re.escape(k)}[a-z0-9]*\b", blob)
        for k in ("grok", "gpt", "openai", "claude", "gemini", "chatgpt", "xai", "llm")
    ) or re.search(r"\bai\b", blob):
        return "AI / tech"
    if _REAL_GAME_RE.search(blob):
        return "gaming"
    if "pump" in (dex or "").lower():
        return "Pump.fun-style meme launch"
    if any(k in blob for k in ("pepe", "doge", "inu", "popcat", "shiba")):
        return "animal / meme pet"
    if any(
        re.search(rf"\b{re.escape(k)}\b", blob)
        for k in ("trump", "biden", "maga", "vote", "election")
    ):
        return "politics / election"
    if any(k in blob for k in ("tiktok", "viral", "trend")):
        # Social virality ≠ gaming
        return "crypto culture / degen"
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
