"""
Fetch *authoritative* coin facts for narrative (not keyword guesses).

Priority order (higher = more trusted for "what is this coin"):
  1. CoinGecko contract endpoint (description, categories, links)
  2. On-chain metadata URI JSON (Metaplex description)
  3. Pump.fun coin JSON (mint description / links)
  4. Birdeye token overview extensions
  5. DexScreener pair/profile description + socials
  6. CoinMarketCap (optional CMC_API_KEY)
  7. Project website OG / meta description
  8. Jupiter token tags / name
  9. Solscan token meta (optional SOLSCAN_API_KEY)
 10. Rugcheck tokenMeta / fileMeta + risk *text* (context, not story inventing)
 11. GeckoTerminal token attributes

Web chatter (X, news, Reddit) is handled separately and must not override
an official description when present.
"""

from __future__ import annotations

import html
import os
import re
from typing import Any
from urllib.parse import urlencode, urlparse

from .env_config import load_dotenv
from .http_util import DEFAULT_HEADERS, get_json, get_text

_TIMEOUT = 8.0
_TIMEOUT_SLOW = 10.0

# DexScreener / app chain id → CoinGecko asset platform id
_CHAIN_TO_CG: dict[str, str] = {
    "solana": "solana",
    "sol": "solana",
    "ethereum": "ethereum",
    "eth": "ethereum",
    "bsc": "binance-smart-chain",
    "bnb": "binance-smart-chain",
    "base": "base",
    "arbitrum": "arbitrum-one",
    "polygon": "polygon-pos",
    "avalanche": "avalanche",
    "optimism": "optimistic-ethereum",
    "fantom": "fantom",
    # Robinhood Chain (Arbitrum L2, chain id 4663) — may not list on CoinGecko yet
    "robinhood": "robinhood",
    "rh": "robinhood",
    "sui": "sui",
    "ton": "the-open-network",
    "tron": "tron",
    "blast": "blast",
    "linea": "linea",
    "scroll": "scroll",
    "zksync": "zksync",
    "mantle": "mantle",
    "cronos": "cronos",
    "celo": "celo",
    "gnosis": "xdai",
    "moonbeam": "moonbeam",
    "aptos": "aptos",
    "near": "near-protocol",
}

# Sources whose free-text counts as "official project copy"
_OFFICIAL_SOURCES = {
    "coingecko",
    "metadata_uri",
    "pumpfun",
    "birdeye",
    "dexscreener",
    "coinmarketcap",
    "website_og",
    "solscan",
    "rugcheck_meta",
    "geckoterminal",
    "jupiter",
}


def fetch_coin_facts(
    *,
    chain_id: str | None,
    token_address: str | None,
    symbol: str | None = None,
    name: str | None = None,
    dexscreener_pair: dict[str, Any] | None = None,
    gecko_token: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Return structured facts for narrative.

    {
      ok, sources_used, official_description, categories, links,
      market_hints, facts_lines, confidence, description_fragments,
      risk_notes, tags
    }
    """
    if not token_address:
        return _empty("Missing token address.")

    load_dotenv()
    sources: list[str] = []
    descriptions: list[tuple[float, str, str]] = []  # weight, source, text
    categories: list[str] = []
    links: dict[str, str] = {}
    market_hints: dict[str, Any] = {}
    tags: list[str] = []
    risk_notes: list[str] = []
    meta_uri: str | None = None
    name_resolved = name
    symbol_resolved = symbol
    is_sol = (chain_id or "").lower() in {"solana", "sol", ""}

    # 1) CoinGecko by contract
    try:
        cg = _from_coingecko(chain_id, token_address)
        if cg.get("ok"):
            sources.append("coingecko_contract")
            if cg.get("description"):
                descriptions.append((5.0, "coingecko", cg["description"]))
            categories.extend(cg.get("categories") or [])
            links.update(cg.get("links") or {})
            market_hints.update(cg.get("market") or {})
            name_resolved = cg.get("name") or name_resolved
            symbol_resolved = cg.get("symbol") or symbol_resolved
    except Exception:  # noqa: BLE001
        pass

    # 2) Rugcheck (Solana) — tokenMeta.uri, fileMeta description, risk text
    if is_sol:
        try:
            rc = _from_rugcheck(token_address)
            if rc.get("ok"):
                sources.append("rugcheck")
                if rc.get("description"):
                    descriptions.append((4.2, "rugcheck_meta", rc["description"]))
                if rc.get("uri"):
                    meta_uri = rc["uri"]
                    links.setdefault("metadata_uri", rc["uri"])
                links.update(rc.get("links") or {})
                name_resolved = rc.get("name") or name_resolved
                symbol_resolved = rc.get("symbol") or symbol_resolved
                risk_notes.extend(rc.get("risk_notes") or [])
                if rc.get("jup_verified"):
                    tags.append("jupiter_verified")
        except Exception:  # noqa: BLE001
            pass

    # 3) On-chain metadata URI JSON (description string)
    if meta_uri:
        try:
            mu = _from_metadata_uri(meta_uri)
            if mu.get("ok") and mu.get("description"):
                sources.append("metadata_uri")
                descriptions.append((4.8, "metadata_uri", mu["description"]))
                links.update(mu.get("links") or {})
                name_resolved = mu.get("name") or name_resolved
                symbol_resolved = mu.get("symbol") or symbol_resolved
        except Exception:  # noqa: BLE001
            pass

    # 4) Pump.fun coin page
    if (token_address or "").lower().endswith("pump") or is_sol:
        try:
            pf = _from_pumpfun(token_address)
            if pf.get("ok"):
                sources.append("pumpfun_coin")
                if pf.get("description"):
                    descriptions.append((4.5, "pumpfun", pf["description"]))
                links.update(pf.get("links") or {})
                name_resolved = pf.get("name") or name_resolved
                symbol_resolved = pf.get("symbol") or symbol_resolved
                # If we still lack metadata URI, try pumping description as story
                if not meta_uri and pf.get("uri"):
                    meta_uri = pf["uri"]
                    links.setdefault("metadata_uri", pf["uri"])
                    try:
                        mu = _from_metadata_uri(pf["uri"])
                        if mu.get("ok") and mu.get("description"):
                            sources.append("metadata_uri")
                            descriptions.append((4.8, "metadata_uri", mu["description"]))
                            links.update(mu.get("links") or {})
                    except Exception:  # noqa: BLE001
                        pass
        except Exception:  # noqa: BLE001
            pass

    # 5) Birdeye token overview extensions
    if is_sol:
        try:
            be = _from_birdeye(token_address)
            if be.get("ok"):
                sources.append("birdeye")
                if be.get("description"):
                    descriptions.append((4.3, "birdeye", be["description"]))
                links.update(be.get("links") or {})
                name_resolved = be.get("name") or name_resolved
                symbol_resolved = be.get("symbol") or symbol_resolved
        except Exception:  # noqa: BLE001
            pass

    # 6) DexScreener pair + token endpoint
    try:
        dx = _from_dexscreener(chain_id, token_address, dexscreener_pair)
        if dx.get("ok"):
            sources.append("dexscreener")
            if dx.get("description"):
                descriptions.append((4.0, "dexscreener", dx["description"]))
            links.update(dx.get("links") or {})
            if dx.get("name"):
                name_resolved = name_resolved or dx["name"]
            if dx.get("symbol"):
                symbol_resolved = symbol_resolved or dx["symbol"]
    except Exception:  # noqa: BLE001
        pass

    # 7) CoinMarketCap (optional key)
    try:
        cmc = _from_cmc(symbol_resolved or symbol, name_resolved or name)
        if cmc.get("ok"):
            sources.append("coinmarketcap")
            if cmc.get("description"):
                descriptions.append((4.6, "coinmarketcap", cmc["description"]))
            links.update(cmc.get("links") or {})
            categories.extend(cmc.get("categories") or [])
            name_resolved = cmc.get("name") or name_resolved
            symbol_resolved = cmc.get("symbol") or symbol_resolved
    except Exception:  # noqa: BLE001
        pass

    # 8) Jupiter token search (tags + name; sometimes no free-text desc)
    if is_sol:
        try:
            jup = _from_jupiter(token_address)
            if jup.get("ok"):
                sources.append("jupiter")
                if jup.get("description"):
                    descriptions.append((3.8, "jupiter", jup["description"]))
                tags.extend(jup.get("tags") or [])
                name_resolved = jup.get("name") or name_resolved
                symbol_resolved = jup.get("symbol") or symbol_resolved
                if jup.get("is_verified"):
                    tags.append("jupiter_verified")
        except Exception:  # noqa: BLE001
            pass

    # 9) Solscan token meta (optional key)
    if is_sol:
        try:
            sol = _from_solscan(token_address)
            if sol.get("ok"):
                sources.append("solscan")
                if sol.get("description"):
                    descriptions.append((3.9, "solscan", sol["description"]))
                links.update(sol.get("links") or {})
                if sol.get("uri") and not meta_uri:
                    meta_uri = sol["uri"]
                    links.setdefault("metadata_uri", sol["uri"])
                    try:
                        mu = _from_metadata_uri(sol["uri"])
                        if mu.get("ok") and mu.get("description"):
                            if "metadata_uri" not in sources:
                                sources.append("metadata_uri")
                            descriptions.append((4.8, "metadata_uri", mu["description"]))
                            links.update(mu.get("links") or {})
                    except Exception:  # noqa: BLE001
                        pass
                name_resolved = sol.get("name") or name_resolved
                symbol_resolved = sol.get("symbol") or symbol_resolved
        except Exception:  # noqa: BLE001
            pass

    # 10) Project website OG / meta description
    website = links.get("website")
    if website and website.startswith("http"):
        try:
            og = _from_website_og(website)
            if og.get("ok") and og.get("description"):
                sources.append("website_og")
                descriptions.append((3.6, "website_og", og["description"]))
        except Exception:  # noqa: BLE001
            pass

    # 11) GeckoTerminal token payload
    try:
        gt = _from_geckoterminal(gecko_token)
        if gt.get("ok"):
            sources.append("geckoterminal_token")
            if gt.get("description"):
                descriptions.append((3.5, "geckoterminal", gt["description"]))
            if gt.get("name"):
                name_resolved = name_resolved or gt["name"]
            if gt.get("symbol"):
                symbol_resolved = symbol_resolved or gt["symbol"]
            market_hints.update(
                {k: v for k, v in (gt.get("market") or {}).items() if v is not None}
            )
    except Exception:  # noqa: BLE001
        pass

    # Pick best official description (highest weight, longest sensible text)
    official = ""
    official_source = ""
    description_fragments: list[dict[str, str]] = []
    seen_desc: set[str] = set()
    if descriptions:
        descriptions.sort(key=lambda x: (x[0], len(x[2])), reverse=True)
        for w, src, text in descriptions:
            cleaned = _clean_desc(text)
            if len(cleaned) < 12:
                continue
            key = cleaned.lower()[:100]
            if key in seen_desc:
                continue
            seen_desc.add(key)
            description_fragments.append({"source": src, "text": cleaned[:900]})
            if not official and len(cleaned) >= 20:
                official = cleaned
                official_source = src
        if not official and description_fragments:
            official = description_fragments[0]["text"]
            official_source = description_fragments[0]["source"]

    # De-dupe categories + tags
    cat_out: list[str] = []
    seen_c: set[str] = set()
    for c in categories:
        cl = str(c).strip()
        if cl and cl.lower() not in seen_c:
            seen_c.add(cl.lower())
            cat_out.append(cl)
    tag_out: list[str] = []
    seen_t: set[str] = set()
    for t in tags:
        tl = str(t).strip()
        if tl and tl.lower() not in seen_t:
            seen_t.add(tl.lower())
            tag_out.append(tl)

    # De-dupe risk notes
    risk_out: list[str] = []
    seen_r: set[str] = set()
    for r in risk_notes:
        rl = re.sub(r"\s+", " ", str(r)).strip()
        if not rl:
            continue
        key = rl.lower()[:90]
        if key in seen_r:
            continue
        seen_r.add(key)
        risk_out.append(rl[:240])

    facts_lines = _facts_lines(
        name=name_resolved,
        symbol=symbol_resolved,
        chain_id=chain_id,
        token_address=token_address,
        official=official,
        official_source=official_source,
        categories=cat_out,
        links=links,
        market_hints=market_hints,
        sources=sources,
        tags=tag_out,
        fragments=description_fragments,
        risk_notes=risk_out,
    )

    conf = "low"
    if official and official_source in {
        "coingecko",
        "pumpfun",
        "dexscreener",
        "metadata_uri",
        "birdeye",
        "coinmarketcap",
    }:
        conf = "high"
    elif official:
        conf = "medium"
    elif tag_out or risk_out:
        conf = "low"

    return {
        "ok": bool(official or links or cat_out or sources or description_fragments),
        "sources_used": sources,
        "name": name_resolved,
        "symbol": symbol_resolved,
        "chain_id": chain_id,
        "token_address": token_address,
        "official_description": official[:1200] if official else "",
        "official_source": official_source,
        "description_fragments": description_fragments[:10],
        "categories": cat_out[:12],
        "tags": tag_out[:16],
        "links": links,
        "market_hints": market_hints,
        "risk_notes": risk_out[:8],
        "metadata_uri": meta_uri or links.get("metadata_uri") or "",
        "facts_lines": facts_lines,
        "confidence": conf,
        "notes": (
            f"Official description from {official_source}."
            if official
            else (
                "No project description from coin/string APIs yet "
                "(CoinGecko, metadata URI, Pump.fun, Birdeye, DexScreener, "
                "CMC, website OG, Jupiter, Solscan, Rugcheck) — avoid inventing a story."
            )
        ),
    }


def _empty(msg: str) -> dict[str, Any]:
    return {
        "ok": False,
        "sources_used": [],
        "official_description": "",
        "official_source": "",
        "description_fragments": [],
        "categories": [],
        "tags": [],
        "links": {},
        "market_hints": {},
        "risk_notes": [],
        "metadata_uri": "",
        "facts_lines": [],
        "confidence": "none",
        "notes": msg,
    }


def _clean_desc(text: str) -> str:
    t = re.sub(r"<[^>]+>", " ", text or "")
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t).strip()
    if t.lower() in {"", "n/a", "none", "null", "-", "tbd", "null description"}:
        return ""
    return t


def _from_coingecko(chain_id: str | None, address: str) -> dict[str, Any]:
    platform = _CHAIN_TO_CG.get((chain_id or "").lower())
    if not platform:
        return {"ok": False}
    url = f"https://api.coingecko.com/api/v3/coins/{platform}/contract/{address}"
    try:
        data = get_json(url, timeout=_TIMEOUT_SLOW, retries=0)
    except Exception:  # noqa: BLE001
        return {"ok": False}
    if not isinstance(data, dict) or data.get("error"):
        return {"ok": False}

    desc_map = data.get("description") or {}
    desc = ""
    if isinstance(desc_map, dict):
        desc = (desc_map.get("en") or desc_map.get("en-US") or "").strip()
    elif isinstance(desc_map, str):
        desc = desc_map.strip()

    cats = []
    for c in data.get("categories") or []:
        if isinstance(c, str) and c.strip():
            cats.append(c.strip())

    links_raw = data.get("links") or {}
    links: dict[str, str] = {}
    homepage = links_raw.get("homepage") or []
    if isinstance(homepage, list):
        for h in homepage:
            if h:
                links["website"] = str(h)
                break
    tw = links_raw.get("twitter_screen_name")
    if tw:
        links["twitter"] = f"https://x.com/{str(tw).lstrip('@')}"
    tg = links_raw.get("telegram_channel_identifier")
    if tg:
        links["telegram"] = f"https://t.me/{str(tg).lstrip('@')}"
    chat = links_raw.get("chat_url") or []
    if isinstance(chat, list):
        for c in chat:
            if c and "t.me" in str(c):
                links.setdefault("telegram", str(c))
            elif c and ("discord" in str(c).lower()):
                links["discord"] = str(c)

    md = data.get("market_data") or {}
    market = {
        "coingecko_id": data.get("id"),
        "market_cap_rank": data.get("market_cap_rank"),
        "coingecko_mcap_usd": (
            (md.get("market_cap") or {}).get("usd")
            if isinstance(md.get("market_cap"), dict)
            else None
        ),
    }

    return {
        "ok": True,
        "name": data.get("name"),
        "symbol": (data.get("symbol") or "").upper() or None,
        "description": desc[:1500] if desc else "",
        "categories": cats,
        "links": links,
        "market": market,
    }


def _from_geckoterminal(token_payload: dict[str, Any] | None) -> dict[str, Any]:
    if not token_payload or not isinstance(token_payload, dict):
        return {"ok": False}
    attrs = token_payload.get("attributes") or {}
    if not attrs:
        return {"ok": False}
    desc = attrs.get("description") or ""
    name = attrs.get("name")
    symbol = attrs.get("symbol")
    market = {
        "gt_price_usd": _f(attrs.get("price_usd")),
        "gt_fdv_usd": _f(attrs.get("fdv_usd")),
        "gt_mcap_usd": _f(attrs.get("market_cap_usd")),
        "gt_volume_usd": _f(
            (attrs.get("volume_usd") or {}).get("h24")
            if isinstance(attrs.get("volume_usd"), dict)
            else attrs.get("volume_usd")
        ),
    }
    if desc and desc == attrs.get("coingecko_coin_id"):
        desc = ""
    return {
        "ok": True,
        "name": name,
        "symbol": symbol,
        "description": str(desc)[:1200] if desc else "",
        "market": market,
    }


def _from_dexscreener(
    chain_id: str | None,
    address: str,
    pair: dict[str, Any] | None,
) -> dict[str, Any]:
    desc = ""
    name = None
    symbol = None
    links: dict[str, str] = {}
    ok = False

    if pair:
        base = pair.get("baseToken") or {}
        name = base.get("name")
        symbol = base.get("symbol")
        info = pair.get("info") or {}
        d = info.get("description") or pair.get("description")
        if d:
            desc = str(d)
            ok = True
        for s in info.get("socials") or []:
            if not isinstance(s, dict):
                continue
            plat = (s.get("type") or s.get("platform") or "").lower()
            url = s.get("url") or ""
            if not url:
                continue
            if plat in {"twitter", "x"}:
                links["twitter"] = url
            elif plat == "telegram":
                links["telegram"] = url
            elif plat == "discord":
                links["discord"] = url
            else:
                links.setdefault(plat or "social", url)
        for w in info.get("websites") or []:
            if isinstance(w, dict) and w.get("url"):
                links.setdefault("website", str(w["url"]))
                ok = True

    # Cached DexScreener extras (pairs already often have socials — avoid spam)
    try:
        from .api_cache import TTL_PAIRS, TTL_SEARCH, cache_get, cache_set

        tok_key = f"dx:tokens_meta:{(chain_id or '').lower()}:{address.lower()}"
        data = cache_get(tok_key)
        if data is None:
            data = get_json(
                f"https://api.dexscreener.com/latest/dex/tokens/{address}",
                timeout=_TIMEOUT,
                retries=0,
            )
            cache_set(tok_key, data if data is not None else {}, TTL_PAIRS)
        pairs = (data or {}).get("pairs") if isinstance(data, dict) else None
        if isinstance(pairs, list):
            for p in pairs[:8]:
                if chain_id and (p.get("chainId") or "").lower() != chain_id.lower():
                    continue
                ok = True
                b = p.get("baseToken") or {}
                name = name or b.get("name")
                symbol = symbol or b.get("symbol")
                info = p.get("info") or {}
                d = info.get("description") or p.get("description")
                if d and not desc:
                    desc = str(d)
                for s in info.get("socials") or []:
                    if isinstance(s, dict) and s.get("url"):
                        plat = (s.get("type") or s.get("platform") or "social").lower()
                        links.setdefault(
                            plat if plat not in {"twitter"} else "twitter", s["url"]
                        )
                for w in info.get("websites") or []:
                    if isinstance(w, dict) and w.get("url"):
                        links.setdefault("website", w["url"])
                if desc:
                    break
    except Exception:  # noqa: BLE001
        pass

    # Latest profiles feed is shared — cache whole list briefly (not per-mint)
    try:
        from .api_cache import TTL_SEARCH, cache_get, cache_set

        prof_key = "dx:token_profiles_latest_v1"
        profiles = cache_get(prof_key)
        if profiles is None:
            profiles = get_json(
                "https://api.dexscreener.com/token-profiles/latest/v1",
                timeout=_TIMEOUT,
                retries=0,
            )
            cache_set(
                prof_key,
                profiles if profiles is not None else [],
                TTL_SEARCH,
            )
        if isinstance(profiles, list):
            al = address.lower()
            for row in profiles:
                if (row.get("tokenAddress") or "").lower() != al:
                    continue
                d = (row.get("description") or "").strip()
                if d:
                    desc = d
                    ok = True
                    links.setdefault(
                        "dexscreener_profile", row.get("url") or row.get("link") or ""
                    )
                    break
    except Exception:  # noqa: BLE001
        pass

    return {
        "ok": ok or bool(desc or links),
        "name": name,
        "symbol": symbol,
        "description": desc[:1200] if desc else "",
        "links": {k: v for k, v in links.items() if v},
    }


def _from_pumpfun(mint: str) -> dict[str, Any]:
    for url in (
        f"https://frontend-api.pump.fun/coins/{mint}",
        f"https://frontend-api-v3.pump.fun/coins/{mint}",
    ):
        try:
            data = get_json(url, timeout=6.0, retries=0)
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(data, dict):
            continue
        desc = (data.get("description") or data.get("desc") or "").strip()
        links: dict[str, str] = {}
        if data.get("twitter"):
            links["twitter"] = str(data["twitter"])
        if data.get("telegram"):
            links["telegram"] = str(data["telegram"])
        if data.get("website"):
            links["website"] = str(data["website"])
        uri = data.get("metadata_uri") or data.get("uri") or data.get("image_uri") or ""
        return {
            "ok": True,
            "name": data.get("name"),
            "symbol": data.get("symbol"),
            "description": desc[:1200],
            "links": links,
            "uri": str(uri) if uri and str(uri).startswith("http") else "",
        }
    return {"ok": False}


def _from_rugcheck(mint: str) -> dict[str, Any]:
    try:
        data = get_json(
            f"https://api.rugcheck.xyz/v1/tokens/{mint}/report",
            timeout=_TIMEOUT_SLOW,
            retries=0,
        )
    except Exception:  # noqa: BLE001
        return {"ok": False}
    if not isinstance(data, dict):
        return {"ok": False}

    token_meta = data.get("tokenMeta") or {}
    file_meta = data.get("fileMeta") or {}
    verification = data.get("verification") or {}

    desc = (
        (file_meta.get("description") if isinstance(file_meta, dict) else None)
        or (verification.get("description") if isinstance(verification, dict) else None)
        or (token_meta.get("description") if isinstance(token_meta, dict) else None)
        or ""
    )
    desc = str(desc or "").strip()

    name = None
    symbol = None
    uri = None
    if isinstance(token_meta, dict):
        name = token_meta.get("name") or name
        symbol = token_meta.get("symbol") or symbol
        uri = token_meta.get("uri") or uri
    if isinstance(file_meta, dict):
        name = name or file_meta.get("name")
        symbol = symbol or file_meta.get("symbol")
    if isinstance(verification, dict):
        name = name or verification.get("name")
        symbol = symbol or verification.get("symbol")

    links: dict[str, str] = {}
    if isinstance(verification, dict):
        for link in verification.get("links") or []:
            if not isinstance(link, dict):
                continue
            provider = (link.get("provider") or link.get("type") or "link").lower()
            url = link.get("url") or link.get("value") or ""
            if url:
                if "twitter" in provider or "x.com" in str(url):
                    links.setdefault("twitter", str(url))
                elif "telegram" in provider or "t.me" in str(url):
                    links.setdefault("telegram", str(url))
                elif "web" in provider or "site" in provider:
                    links.setdefault("website", str(url))
                else:
                    links.setdefault(provider, str(url))

    risk_notes: list[str] = []
    for r in (data.get("risks") or [])[:10]:
        if not isinstance(r, dict):
            continue
        rname = (r.get("name") or "").strip()
        rdesc = (r.get("description") or "").strip()
        level = (r.get("level") or r.get("severity") or "").strip()
        if rdesc:
            bit = rdesc if not rname else f"{rname}: {rdesc}"
        elif rname:
            bit = rname
        else:
            continue
        if level:
            bit = f"[{level}] {bit}"
        risk_notes.append(bit)
    if data.get("rugged"):
        risk_notes.insert(0, "Rugcheck marks this mint as rugged=true.")
    score = data.get("score") or data.get("score_normalised")
    if score is not None:
        risk_notes.append(f"Rugcheck score: {score}")

    jup_verified = bool(
        (verification or {}).get("jup_verified")
        or (verification or {}).get("jup_strict")
    )

    return {
        "ok": True,
        "name": name,
        "symbol": symbol,
        "description": desc[:1200],
        "uri": str(uri) if uri else "",
        "links": links,
        "risk_notes": risk_notes,
        "jup_verified": jup_verified,
    }


def _from_metadata_uri(uri: str) -> dict[str, Any]:
    """Fetch Metaplex / IPFS JSON for the token description string."""
    u = (uri or "").strip()
    if not u:
        return {"ok": False}
    # Common IPFS gateways if bare CID
    if u.startswith("ipfs://"):
        cid = u[len("ipfs://") :].lstrip("/")
        candidates = [
            f"https://ipfs.io/ipfs/{cid}",
            f"https://cloudflare-ipfs.com/ipfs/{cid}",
            f"https://nftstorage.link/ipfs/{cid}",
        ]
    else:
        candidates = [u]

    data = None
    for url in candidates:
        try:
            data = get_json(url, timeout=_TIMEOUT, retries=0)
            if isinstance(data, dict):
                break
        except Exception:  # noqa: BLE001
            # Some hosts return text/plain JSON
            try:
                raw = get_text(url, timeout=_TIMEOUT, retries=0)
                import json as _json

                data = _json.loads(raw)
                if isinstance(data, dict):
                    break
            except Exception:  # noqa: BLE001
                continue
    if not isinstance(data, dict):
        return {"ok": False}

    desc = (
        data.get("description")
        or data.get("desc")
        or (data.get("properties") or {}).get("description")
        or ""
    )
    links: dict[str, str] = {}
    ext = data.get("extensions") or data.get("external_url") or {}
    if isinstance(ext, str) and ext.startswith("http"):
        links["website"] = ext
    elif isinstance(ext, dict):
        for k in ("website", "twitter", "telegram", "discord"):
            if ext.get(k):
                links[k] = str(ext[k])
        if ext.get("description") and not desc:
            desc = ext["description"]
    ext_url = data.get("external_url")
    if isinstance(ext_url, str) and ext_url.startswith("http"):
        links.setdefault("website", ext_url)

    return {
        "ok": bool(desc or data.get("name")),
        "name": data.get("name"),
        "symbol": data.get("symbol"),
        "description": _clean_desc(str(desc))[:1200],
        "links": links,
    }


def _from_birdeye(mint: str) -> dict[str, Any]:
    load_dotenv()
    key = (os.environ.get("BIRDEYE_API_KEY") or "").strip()
    if not key:
        return {"ok": False, "skipped": True}
    headers = {
        **DEFAULT_HEADERS,
        "X-API-KEY": key,
        "x-chain": "solana",
        "Accept": "application/json",
    }
    try:
        data = get_json(
            "https://public-api.birdeye.so/defi/token_overview?"
            + urlencode({"address": mint}),
            headers=headers,
            timeout=_TIMEOUT,
            retries=0,
        )
    except Exception:  # noqa: BLE001
        return {"ok": False}
    d = (data or {}).get("data") if isinstance(data, dict) else None
    if not isinstance(d, dict):
        return {"ok": False}

    ext = d.get("extensions") or {}
    if not isinstance(ext, dict):
        ext = {}
    desc = (
        d.get("description")
        or ext.get("description")
        or d.get("desc")
        or ""
    )
    links: dict[str, str] = {}
    for k_src, k_dst in (
        ("website", "website"),
        ("twitter", "twitter"),
        ("telegram", "telegram"),
        ("discord", "discord"),
    ):
        val = ext.get(k_src) or d.get(k_src)
        if val and isinstance(val, str) and val.startswith("http"):
            links[k_dst] = val
        elif val and isinstance(val, str) and k_src == "twitter":
            links[k_dst] = f"https://x.com/{val.lstrip('@')}"
    if ext.get("coingeckoId"):
        links.setdefault(
            "coingecko", f"https://www.coingecko.com/en/coins/{ext['coingeckoId']}"
        )

    return {
        "ok": True,
        "name": d.get("name"),
        "symbol": d.get("symbol"),
        "description": _clean_desc(str(desc))[:1200],
        "links": links,
    }


def _from_jupiter(mint: str) -> dict[str, Any]:
    """Jupiter lite token search — tags, name, verified flags."""
    try:
        data = get_json(
            f"https://lite-api.jup.ag/tokens/v2/search?query={mint}",
            timeout=_TIMEOUT,
            retries=0,
        )
    except Exception:  # noqa: BLE001
        return {"ok": False}
    if not isinstance(data, list) or not data:
        return {"ok": False}
    row = None
    for item in data:
        if isinstance(item, dict) and (item.get("id") or "").lower() == mint.lower():
            row = item
            break
    if row is None and isinstance(data[0], dict):
        row = data[0]
    if not isinstance(row, dict):
        return {"ok": False}

    tags = []
    for t in row.get("tags") or []:
        if isinstance(t, str) and t.strip():
            tags.append(t.strip())
    # Build a short "what Jupiter says" string from tags when no free-text desc
    desc = ""
    if tags:
        desc = "Jupiter tags: " + ", ".join(tags[:8])
        if row.get("organicScoreLabel"):
            desc += f" · organic score: {row.get('organicScoreLabel')}"
        if row.get("isVerified"):
            desc += " · verified on Jupiter"

    return {
        "ok": True,
        "name": row.get("name"),
        "symbol": (str(row.get("symbol") or "").lstrip("$") or None),
        "description": desc,
        "tags": tags,
        "is_verified": bool(row.get("isVerified")),
    }


def _from_solscan(mint: str) -> dict[str, Any]:
    load_dotenv()
    key = (
        os.environ.get("SOLSCAN_API_KEY")
        or os.environ.get("SOLSCAN_PRO_API_KEY")
        or os.environ.get("SOLSCAN_TOKEN")
        or ""
    ).strip()
    headers = {**DEFAULT_HEADERS, "Accept": "application/json"}
    endpoints: list[tuple[str, dict[str, str]]] = []
    if key:
        endpoints.append(
            (
                f"https://pro-api.solscan.io/v2.0/token/meta?address={mint}",
                {**headers, "token": key, "Authorization": key},
            )
        )
    endpoints.extend(
        [
            (f"https://api-v2.solscan.io/v2/token/meta?address={mint}", headers),
            (
                f"https://public-api.solscan.io/token/meta?tokenAddress={mint}",
                headers,
            ),
        ]
    )
    for url, hdrs in endpoints:
        try:
            data = get_json(url, headers=hdrs, timeout=_TIMEOUT, retries=0)
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(data, dict):
            continue
        d = data.get("data") if isinstance(data.get("data"), dict) else data
        if not isinstance(d, dict):
            continue
        meta = d.get("metadata") if isinstance(d.get("metadata"), dict) else {}
        desc = (
            d.get("description")
            or d.get("desc")
            or (meta.get("description") if meta else None)
            or ""
        )
        uri = (
            d.get("metadata_uri")
            or d.get("uri")
            or meta.get("uri")
            or d.get("icon")
            or ""
        )
        links: dict[str, str] = {}
        for k in ("website", "twitter", "telegram", "discord"):
            if d.get(k):
                links[k] = str(d[k])
        if meta.get("website"):
            links.setdefault("website", str(meta["website"]))
        name = d.get("name") or meta.get("name")
        symbol = d.get("symbol") or meta.get("symbol")
        if name or symbol or desc or uri:
            return {
                "ok": True,
                "name": name,
                "symbol": symbol,
                "description": _clean_desc(str(desc or ""))[:1200],
                "uri": str(uri) if uri and str(uri).startswith("http") else "",
                "links": links,
            }
    return {"ok": False}


def _from_cmc(symbol: str | None, name: str | None) -> dict[str, Any]:
    """CoinMarketCap content (needs CMC_API_KEY)."""
    load_dotenv()
    key = (
        os.environ.get("CMC_API_KEY")
        or os.environ.get("COINMARKETCAP_API_KEY")
        or ""
    ).strip()
    if not key:
        return {"ok": False, "skipped": True}
    headers = {
        **DEFAULT_HEADERS,
        "X-CMC_PRO_API_KEY": key,
        "Accept": "application/json",
    }
    # Resolve by symbol first
    slug_or_sym = (symbol or name or "").strip()
    if not slug_or_sym:
        return {"ok": False}
    if not symbol:
        return {"ok": False}
    try:
        data = get_json(
            "https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?"
            + urlencode({"symbol": symbol.upper()}),
            headers=headers,
            timeout=_TIMEOUT,
            retries=0,
        )
    except Exception:  # noqa: BLE001
        return {"ok": False}
    if not isinstance(data, dict):
        return {"ok": False}
    payload = data.get("data")
    row = None
    if isinstance(payload, dict):
        # v2 info: { "WIF": [ {...} ] }
        for _k, v in payload.items():
            if isinstance(v, list) and v:
                row = v[0]
                break
            if isinstance(v, dict) and v.get("description"):
                row = v
                break
    elif isinstance(payload, list) and payload:
        row = payload[0]
    if not isinstance(row, dict):
        return {"ok": False}

    desc = (row.get("description") or "").strip()
    links: dict[str, str] = {}
    urls = row.get("urls") or {}
    if isinstance(urls, dict):
        for web in urls.get("website") or []:
            if web:
                links["website"] = str(web)
                break
        for tw in urls.get("twitter") or []:
            if tw:
                links["twitter"] = str(tw)
                break
        for tg in urls.get("chat") or []:
            if tg and "t.me" in str(tg):
                links["telegram"] = str(tg)
                break
    cats = []
    for t in row.get("tags") or []:
        if isinstance(t, str):
            cats.append(t)
        elif isinstance(t, dict) and t.get("name"):
            cats.append(str(t["name"]))
    return {
        "ok": bool(desc or links),
        "name": row.get("name"),
        "symbol": row.get("symbol"),
        "description": desc[:1500],
        "links": links,
        "categories": cats[:8],
    }


def _from_website_og(url: str) -> dict[str, Any]:
    """Pull og:description / meta description from the project website."""
    u = (url or "").strip()
    if not u.startswith("http"):
        return {"ok": False}
    # Skip pure socials — not a project page
    host = (urlparse(u).netloc or "").lower()
    if any(
        x in host
        for x in (
            "twitter.com",
            "x.com",
            "t.me",
            "telegram",
            "discord.com",
            "discord.gg",
            "youtube.com",
            "tiktok.com",
            "instagram.com",
        )
    ):
        return {"ok": False}
    try:
        page = get_text(
            u,
            timeout=_TIMEOUT,
            retries=0,
            headers={
                **DEFAULT_HEADERS,
                "Accept": "text/html,application/xhtml+xml",
            },
        )
    except Exception:  # noqa: BLE001
        return {"ok": False}

    def _meta(prop: str) -> str:
        # property="og:description" content="..."
        patterns = [
            rf'property=["\']{re.escape(prop)}["\']\s+content=["\'](.*?)["\']',
            rf'content=["\'](.*?)["\']\s+property=["\']{re.escape(prop)}["\']',
            rf'name=["\']{re.escape(prop)}["\']\s+content=["\'](.*?)["\']',
            rf'content=["\'](.*?)["\']\s+name=["\']{re.escape(prop)}["\']',
        ]
        for pat in patterns:
            m = re.search(pat, page, re.I | re.S)
            if m:
                return html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
        return ""

    desc = (
        _meta("og:description")
        or _meta("description")
        or _meta("twitter:description")
    )
    # title as weak fallback
    if not desc:
        m = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
        if m:
            desc = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
    desc = _clean_desc(desc)
    if len(desc) < 20:
        return {"ok": False}
    return {"ok": True, "description": desc[:900]}


def _facts_lines(
    *,
    name: str | None,
    symbol: str | None,
    chain_id: str | None,
    token_address: str | None,
    official: str,
    official_source: str,
    categories: list[str],
    links: dict[str, str],
    market_hints: dict[str, Any],
    sources: list[str],
    tags: list[str] | None = None,
    fragments: list[dict[str, str]] | None = None,
    risk_notes: list[str] | None = None,
) -> list[str]:
    lines: list[str] = []
    label = f"{name or 'Unknown'}"
    if symbol:
        label += f" (${symbol})"
    lines.append(f"Token: {label} on {chain_id or 'unknown'}")
    if token_address:
        lines.append(f"Contract: {token_address}")
    if official:
        short = official if len(official) <= 280 else official[:277] + "…"
        lines.append(f"Official description ({official_source}): {short}")
    if fragments and len(fragments) > 1:
        lines.append("Other description sources:")
        for fr in fragments[1:5]:
            t = fr.get("text") or ""
            if len(t) > 140:
                t = t[:137] + "…"
            lines.append(f"  • ({fr.get('source')}) {t}")
    if categories:
        lines.append("Categories: " + ", ".join(categories[:8]))
    if tags:
        lines.append("Tags: " + ", ".join(tags[:10]))
    if links:
        shown = []
        for k in ("website", "twitter", "telegram", "discord", "metadata_uri"):
            if links.get(k):
                shown.append(f"{k}={links[k]}")
        for k, v in links.items():
            if k in {"website", "twitter", "telegram", "discord", "metadata_uri"}:
                continue
            shown.append(f"{k}={v}")
            if len(shown) >= 8:
                break
        if shown:
            lines.append("Links: " + " · ".join(shown[:8]))
    if risk_notes:
        lines.append("Rugcheck / risk text:")
        for r in risk_notes[:4]:
            lines.append(f"  • {r}")
    rank = market_hints.get("market_cap_rank")
    if rank:
        lines.append(f"CoinGecko market-cap rank: #{rank}")
    if sources:
        lines.append("Fact sources: " + ", ".join(sources))
    return lines


def _f(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None
