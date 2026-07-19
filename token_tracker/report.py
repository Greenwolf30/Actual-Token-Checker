"""Pretty console report for token analysis."""

from __future__ import annotations

import json
import re
from typing import Any


def _usd(n: Any) -> str:
    if n is None:
        return "n/a"
    try:
        n = float(n)
    except (TypeError, ValueError):
        return "n/a"
    abs_n = abs(n)
    if abs_n >= 1_000_000_000:
        return f"${n/1_000_000_000:,.2f}B"
    if abs_n >= 1_000_000:
        return f"${n/1_000_000:,.2f}M"
    if abs_n >= 1_000:
        return f"${n/1_000:,.2f}K"
    if abs_n >= 1:
        return f"${n:,.4f}"
    return f"${n:.10f}".rstrip("0").rstrip(".")


def _pct(n: Any) -> str:
    if n is None:
        return "n/a"
    try:
        return f"{float(n):+.2f}%"
    except (TypeError, ValueError):
        return "n/a"


def format_pretty(report: dict[str, Any]) -> str:
    if not report.get("ok"):
        return f"ERROR: {report.get('error') or 'unknown error'}"

    token = report.get("token") or {}
    market = report.get("market") or {}
    pair = market.get("pair") or {}
    init = report.get("initial_market_cap") or {}
    ath = report.get("all_time_high") or {}
    socials = report.get("socials") or {}
    x = report.get("community_sentiment_x") or {}
    sent = x.get("sentiment") or {}
    story = report.get("narrative") or {}
    chg = market.get("price_change_pct") or {}
    tx = market.get("txns_h24") or {}

    lines: list[str] = []
    lines.append("=" * 72)
    lines.append(
        f"  {token.get('name')} (${token.get('symbol')})  |  {token.get('chain_id')}"
    )
    lines.append(f"  {token.get('address')}")
    lines.append("=" * 72)

    lines.append("")
    lines.append("MARKET")
    lines.append(f"  Price:          {_usd(market.get('price_usd'))}")
    lines.append(f"  Market cap:     {_usd(market.get('market_cap_usd'))}")
    lines.append(f"  FDV:            {_usd(market.get('fdv_usd'))}")
    lines.append(f"  Liquidity:      {_usd(market.get('liquidity_usd'))}")
    lines.append(f"  Volume 24h:     {_usd(market.get('volume_h24_usd'))}")
    lines.append(
        f"  Change:         m5 {_pct(chg.get('m5'))} | h1 {_pct(chg.get('h1'))} | "
        f"h6 {_pct(chg.get('h6'))} | h24 {_pct(chg.get('h24'))}"
    )
    lines.append(
        f"  Txns 24h:       buys {tx.get('buys')} / sells {tx.get('sells')}"
    )
    lines.append(
        f"  Pair:           {pair.get('dex_id')} {pair.get('pair_address')}"
    )
    lines.append(f"  Created:        {pair.get('created_at') or 'n/a'}")
    lines.append(f"  DexScreener:    {pair.get('url') or 'n/a'}")
    pump = report.get("pumpfun") or {}
    if pump.get("is_pump_mint") or pump.get("on_bonding_curve") or pump.get("graduated") is True:
        lines.append("")
        lines.append("PUMP.FUN")
        # Explicit yes/no for graduated (main ask)
        grad = pump.get("graduated")
        if grad is True:
            grad_s = "yes"
        elif grad is False:
            grad_s = "no"
        else:
            # Fallback from bonding flag if older payloads
            if pump.get("on_bonding_curve"):
                grad_s = "no"
            elif pump.get("is_pump_mint"):
                grad_s = "unknown"
            else:
                grad_s = "n/a"
        lines.append(f"  Graduated:      {grad_s}")
        lines.append(
            f"  Bonding curve:  {'yes' if pump.get('on_bonding_curve') else 'no'}"
        )
        status = pump.get("status")
        if status:
            lines.append(f"  Status:         {status}")
        lines.append(f"  DEX id:         {pump.get('dex_id') or 'n/a'}")
        dexes = pump.get("dexes_seen") or []
        if dexes:
            lines.append(f"  DEXes seen:     {', '.join(dexes)}")
        if pump.get("pump_url"):
            lines.append(f"  Pump.fun:       {pump.get('pump_url')}")

    lines.append("")
    lines.append("INITIAL MARKET CAP (estimate)")
    lines.append(f"  Est. initial MC: {_usd(init.get('estimated_usd'))}")

    lines.append(f"  As of:           {init.get('as_of') or 'n/a'}")
    if init.get("source") or init.get("method"):
        lines.append(f"  Source:          {init.get('source') or 'n/a'}")
    if init.get("method"):
        lines.append(f"  Method:          {init.get('method')}")

    lines.append("")
    lines.append("ALL-TIME HIGH (estimate over available history)")
    lines.append(f"  ATH price:       {_usd(ath.get('estimated_price_usd'))}")
    lines.append(f"  ATH market cap:  {_usd(ath.get('estimated_market_cap_usd'))}")
    lines.append(f"  As of:           {ath.get('as_of') or 'n/a'}")
    lines.append(f"  Candles used:    {ath.get('candles_used')}")
    if ath.get("source") or ath.get("method"):
        lines.append(f"  Source:          {ath.get('source') or 'n/a'}")
    if ath.get("method"):
        lines.append(f"  Method:          {ath.get('method')}")

    lines.append("")
    lines.append("SOCIALS")
    try:
        from .alerts import dexscreener_socials_updated

        _su = dexscreener_socials_updated(socials)
        if _su is True:
            lines.append("  Updated on DexScreener:  yes")
        elif _su is False:
            lines.append("  Updated on DexScreener:  no")
        else:
            lines.append("  Updated on DexScreener:  n/a")
    except Exception:  # noqa: BLE001
        lines.append("  Updated on DexScreener:  n/a")
    if socials.get("twitter_handle"):
        lines.append(f"  X/Twitter:       @{socials['twitter_handle']}")
    for s in socials.get("socials") or []:
        lines.append(
            f"  - {s.get('platform')}: {s.get('url') or s.get('handle') or 'n/a'}"
        )
    for w in socials.get("websites") or []:
        lines.append(f"  - website ({w.get('label')}): {w.get('url')}")
    if not (socials.get("socials") or socials.get("websites") or socials.get("twitter_handle")):
        lines.append("  (none listed on DexScreener)")

    lines.append("")
    lines.append("X / COMMUNITY SENTIMENT")
    kind = sent.get("kind") or ("x_text" if x.get("posts_analyzed") else "unknown")
    lines.append(f"  Label:           {sent.get('label')}")
    lines.append(f"  Score:           {sent.get('score')}")
    lines.append(f"  Kind:            {kind}")
    lines.append(f"  Posts analyzed:  {x.get('posts_analyzed')}")
    lines.append(f"  Handle:          @{x.get('twitter_handle')}" if x.get("twitter_handle") else "  Handle:          (none on DexScreener)")
    lines.append(f"  Sources:         {', '.join(x.get('sources_used') or [])}")
    lines.append(f"  Summary:         {sent.get('summary')}")
    if x.get("notes"):
        lines.append(f"  Note:            {x.get('notes')}")
    samples = x.get("sample_posts") or []
    if samples:
        lines.append("  Recent X posts:")
        for p in samples[:5]:
            text = (p.get("text") or "").replace("\n", " ")
            if len(text) > 110:
                text = text[:107] + "..."
            lines.append(f"    • {text}")

    holders = report.get("holders") or {}
    lines.append("")
    lines.append("HOLDERS / WALLETS")
    if holders.get("ok"):
        summary = holders.get("summary") or {}
        lines.append(f"  Source:          {holders.get('source')}")
        lines.append(f"  Risk:            {summary.get('concentration_risk')}")
        lines.append(
            f"  Top1 / Top5 / Top10:  "
            f"{_pct(summary.get('top1_pct'))} / {_pct(summary.get('top5_pct'))} / {_pct(summary.get('top10_pct'))}"
        )
        lines.append(f"  Unique wallets in top set: {summary.get('unique_wallets_in_top')}")
        for f in holders.get("flags") or []:
            lines.append(f"  • {f}")
        lines.append("  Top holders:")
        for h in (holders.get("holders") or [])[:12]:
            w = h.get("wallet") or ""
            label = f" [{h.get('label')}]" if h.get("label") else ""
            pct = _pct(h.get("pct_supply"))
            bal = h.get("balance")
            try:
                bal_s = f"{float(bal):,.4f}"
            except (TypeError, ValueError):
                bal_s = str(bal)
            lines.append(f"    #{h.get('rank')} {w}  {bal_s} ({pct}){label}")
        if holders.get("notes"):
            lines.append(f"  Note: {holders.get('notes')}")
    else:
        lines.append(f"  {holders.get('error') or holders.get('notes') or 'n/a'}")

    bundles = report.get("bundles") or {}
    lines.append("")
    lines.append("BUNDLES / COORDINATED WALLETS")
    if bundles.get("ok"):
        bs = bundles.get("summary") or {}
        lines.append(
            f"  Bundle risk:     {bs.get('bundle_risk')}  "
            f"(score {bs.get('bundle_risk_score')}/100)"
        )
        tbp = bs.get("total_bundle_pct")
        if tbp is not None:
            lines.append(
                f"  Total % bundles: {_pct(tbp)}"
                + (
                    f"  ({bs.get('flagged_wallets')} wallet(s))"
                    if bs.get("flagged_wallets") is not None
                    else ""
                )
            )
        else:
            lines.append("  Total % bundles: n/a (none flagged)")
        lines.append(
            f"  Clusters:        {bs.get('multi_account_clusters')} multi-ATA · "
            f"similar groups {bs.get('similar_size_groups')} · "
            f"insiders {bs.get('insider_accounts')}"
        )
        lines.append(
            f"  Top10 ex-LP:     {_pct(bs.get('top10_pct_excluding_known_programs'))}"
        )
        lines.append("  Signals:")
        for sig in bundles.get("signals") or []:
            sev = (sig.get("severity") or "info").upper()
            lines.append(f"    [{sev}] {sig.get('title')}")
            if sig.get("detail"):
                lines.append(f"           {sig.get('detail')}")
        clusters = bundles.get("clusters") or []
        if clusters:
            lines.append("  Multi-account clusters:")
            for c in clusters[:8]:
                lines.append(
                    f"    {c.get('wallet')} · {c.get('accounts')} ATAs · "
                    f"~{_pct(c.get('pct_supply'))} · bal {c.get('combined_balance')}"
                )
        groups = bundles.get("similar_size_groups") or []
        if groups:
            lines.append("  Similar-size groups:")
            for g in groups[:5]:
                lines.append(
                    f"    {g.get('count')} wallets ≈ {_pct(g.get('avg_pct'))} each"
                )
        suspects = bundles.get("suspect_wallets") or []
        if suspects:
            st = (bundles.get("summary") or {}).get("suspect_total_pct")
            sn = (bundles.get("summary") or {}).get("suspect_wallet_count") or len(suspects)
            lines.append(
                f"  Suspect wallets — total {_pct(st)} across {sn} wallet(s):"
            )
            for sw in suspects[:10]:
                reasons = ", ".join(sw.get("reasons") or [])
                lines.append(
                    f"    {sw.get('wallet')}  {_pct(sw.get('pct_supply'))}  [{reasons}]"
                )
        if bundles.get("notes"):
            lines.append(f"  Note: {bundles.get('notes')}")
    else:
        lines.append(f"  {bundles.get('error') or bundles.get('notes') or 'n/a'}")

    lines.append("")
    lines.append("ABOUT / NEWS")
    lines.append("  (See About tab for full X sentiment, narrative, and public news events.)")
    lines.append(f"  Headline: {story.get('headline') or 'n/a'}")
    news_n = len(story.get("news_events") or [])
    lines.append(f"  Public news events: {news_n}")

    lines.append("")
    lines.append("-" * 72)
    lines.append(report.get("disclaimer") or "")
    lines.append(f"Generated: {report.get('generated_at')}")
    return "\n".join(lines)


def format_json(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2, default=str)


def format_overview(report: dict[str, Any]) -> str:
    """Market / ATH / socials only — for Overview tab (no holders/bundles/about)."""
    if not report.get("ok"):
        return f"ERROR: {report.get('error') or 'unknown error'}"

    token = report.get("token") or {}
    market = report.get("market") or {}
    pair = market.get("pair") or {}
    init = report.get("initial_market_cap") or {}
    ath = report.get("all_time_high") or {}
    socials = report.get("socials") or {}
    chg = market.get("price_change_pct") or {}
    tx = market.get("txns_h24") or {}
    pump = report.get("pumpfun") or {}

    lines: list[str] = []
    lines.append("=" * 72)
    lines.append(
        f"  {token.get('name')} (${token.get('symbol')})  |  {token.get('chain_id')}"
    )
    lines.append(f"  {token.get('address')}")
    lines.append("=" * 72)
    lines.append("")
    lines.append("MARKET")
    lines.append(f"  Price:          {_usd(market.get('price_usd'))}")
    lines.append(f"  Market cap:     {_usd(market.get('market_cap_usd'))}")
    lines.append(f"  FDV:            {_usd(market.get('fdv_usd'))}")
    lines.append(f"  Liquidity:      {_usd(market.get('liquidity_usd'))}")
    lines.append(f"  Volume 24h:     {_usd(market.get('volume_h24_usd'))}")
    lines.append(
        f"  Change:         m5 {_pct(chg.get('m5'))} | h1 {_pct(chg.get('h1'))} | "
        f"h6 {_pct(chg.get('h6'))} | h24 {_pct(chg.get('h24'))}"
    )
    lines.append(f"  Txns 24h:       buys {tx.get('buys')} / sells {tx.get('sells')}")
    lines.append(f"  Pair:           {pair.get('dex_id')} {pair.get('pair_address')}")
    lines.append(f"  Created:        {pair.get('created_at') or 'n/a'}")
    lines.append(f"  DexScreener:    {pair.get('url') or 'n/a'}")

    if pump.get("is_pump_mint") or pump.get("on_bonding_curve") or pump.get("graduated") is True:
        lines.append("")
        lines.append("PUMP.FUN")
        grad = pump.get("graduated")
        if grad is True:
            grad_s = "yes"
        elif grad is False:
            grad_s = "no"
        else:
            grad_s = "no" if pump.get("on_bonding_curve") else "unknown"
        lines.append(f"  Graduated:      {grad_s}")
        lines.append(f"  Bonding curve:  {'yes' if pump.get('on_bonding_curve') else 'no'}")
        if pump.get("status"):
            lines.append(f"  Status:         {pump.get('status')}")
        lines.append(f"  DEX id:         {pump.get('dex_id') or 'n/a'}")
        if pump.get("pump_url"):
            lines.append(f"  Pump.fun:       {pump.get('pump_url')}")

    lines.append("")
    lines.append("INITIAL MARKET CAP (estimate)")
    lines.append(f"  Est. initial MC: {_usd(init.get('estimated_usd'))}")
    lines.append(f"  As of:           {init.get('as_of') or 'n/a'}")
    if init.get("source"):
        lines.append(f"  Source:          {init.get('source')}")
    if init.get("method"):
        lines.append(f"  Method:          {init.get('method')}")

    lines.append("")
    lines.append("ALL-TIME HIGH (estimate)")
    lines.append(f"  ATH price:       {_usd(ath.get('estimated_price_usd'))}")
    lines.append(f"  ATH market cap:  {_usd(ath.get('estimated_market_cap_usd'))}")
    lines.append(f"  As of:           {ath.get('as_of') or 'n/a'}")
    lines.append(f"  Candles used:    {ath.get('candles_used')}")
    if ath.get("source"):
        lines.append(f"  Source:          {ath.get('source')}")
    if ath.get("method"):
        lines.append(f"  Method:          {ath.get('method')}")

    lines.append("")
    lines.append("SOCIALS")
    lines.append("  (Click blue links to open in your browser)")
    try:
        from .alerts import dexscreener_socials_updated

        _su = dexscreener_socials_updated(socials)
        if _su is True:
            lines.append("  Updated on DexScreener:  yes")
        elif _su is False:
            lines.append("  Updated on DexScreener:  no")
        else:
            lines.append("  Updated on DexScreener:  n/a")
    except Exception:  # noqa: BLE001
        lines.append("  Updated on DexScreener:  n/a")

    # Full http(s) URLs on their own lines so the GUI can tag them as clickable
    if socials.get("twitter_handle"):
        h = str(socials["twitter_handle"]).lstrip("@")
        lines.append(f"  X/Twitter:  @{h}")
        lines.append(f"    https://x.com/{h}")
    for s in socials.get("socials") or []:
        if not isinstance(s, dict):
            continue
        plat = s.get("platform") or "social"
        url = (s.get("url") or "").strip()
        handle = (s.get("handle") or "").strip()
        if not url and handle and plat.lower() in {"twitter", "x"}:
            url = f"https://x.com/{handle.lstrip('@')}"
        if not url and handle and plat.lower() in {"telegram", "tg"}:
            url = f"https://t.me/{handle.lstrip('@')}"
        lines.append(f"  - {plat}: {handle or url or 'n/a'}")
        if url:
            if not url.startswith("http"):
                url = "https://" + url.lstrip("/")
            lines.append(f"    {url}")
    for w in socials.get("websites") or []:
        if isinstance(w, dict):
            lab = w.get("label") or "Website"
            url = (w.get("url") or "").strip()
        else:
            lab, url = "Website", str(w).strip()
        lines.append(f"  - website ({lab}):")
        if url:
            if not url.startswith("http"):
                url = "https://" + url.lstrip("/")
            lines.append(f"    {url}")
    if not (socials.get("socials") or socials.get("websites") or socials.get("twitter_handle")):
        lines.append("  (none listed on DexScreener)")

    lines.append("")
    lines.append("Use tabs: Holders · Bundles · About (narrative · X posts · public news)")
    lines.append(f"Generated: {report.get('generated_at')}")
    return "\n".join(lines)


def format_holders_section(report: dict[str, Any]) -> str:
    """Holders tab body."""
    if report.get("_raw_holders_text"):
        return str(report["_raw_holders_text"])
    holders = report.get("holders") or {}
    try:
        from .holders import format_holders_text

        return format_holders_text(holders)
    except Exception:  # noqa: BLE001
        if not holders.get("ok"):
            return f"HOLDERS\n  {holders.get('error') or holders.get('notes') or 'Run Analyze first.'}\n"
        return json.dumps(holders, indent=2, default=str)


def format_bundles_section(report: dict[str, Any]) -> str:
    """Bundles tab body."""
    if report.get("_raw_bundles_text"):
        return str(report["_raw_bundles_text"])
    bundles = report.get("bundles") or {}
    try:
        from .bundles import format_bundles_text

        return format_bundles_text(bundles)
    except Exception:  # noqa: BLE001
        if not bundles.get("ok"):
            return f"BUNDLES\n  {bundles.get('error') or bundles.get('notes') or 'Run Analyze first.'}\n"
        return json.dumps(bundles, indent=2, default=str)


def format_maps_section(report: dict[str, Any]) -> str:
    """Maps tab — Bubblemaps links / status."""
    maps = report.get("maps")
    if maps is None:
        # Build on the fly from token
        tok = report.get("token") or {}
        try:
            from .bubblemaps import build_maps_payload, format_maps_text

            maps = build_maps_payload(
                chain_id=tok.get("chain_id"),
                token_address=tok.get("address"),
                symbol=tok.get("symbol"),
                name=tok.get("name"),
                fetch_api=False,
            )
            return format_maps_text(maps)
        except Exception as exc:  # noqa: BLE001
            return (
                "MAPS — Bubblemaps\n"
                f"  Could not build map links: {exc}\n"
                "  Run Analyze first, then open Maps.\n"
            )
    try:
        from .bubblemaps import format_maps_text

        return format_maps_text(maps)
    except Exception:  # noqa: BLE001
        return str(maps)


def format_alerts_section(report: dict[str, Any]) -> str:
    """Alerts tab body."""
    alerts = report.get("alerts")
    if alerts is None:
        return (
            "ALERTS\n"
            "  Things to watch out for immediately\n\n"
            "  Run Analyze first.\n"
            "  Top priority will show if there are any of: unlocked liquidity,\n"
            "  single holder >5%, similar large wallets, or rugger-linked wallets.\n"
        )
    try:
        from .alerts import format_alerts_text

        return format_alerts_text(alerts)
    except Exception:  # noqa: BLE001
        return str(alerts)


def format_about_section(report: dict[str, Any]) -> str:
    """About tab: Narrative storyline + X posts + Public News + Links."""
    if not report.get("ok") and not report.get("narrative") and not report.get("community_sentiment_x"):
        return (
            "ABOUT\n"
            "  Run Analyze to load narrative, X posts, and public news.\n"
        )

    token = report.get("token") or {}
    x = report.get("community_sentiment_x") or {}
    sent = x.get("sentiment") or {}
    story = report.get("narrative") or {}
    socials = report.get("socials") or {}

    lines: list[str] = []
    lines.append("=" * 72)
    lines.append("  ABOUT — narrative · X posts · public news")
    if token.get("symbol") or token.get("name"):
        lines.append(
            f"  {token.get('name') or ''} (${token.get('symbol') or '?'})  ·  "
            f"{token.get('chain_id') or ''}"
        )
    lines.append("=" * 72)

    # ── NARRATIVE (storyline) ─────────────────────────────────────────
    lines.append("")
    lines.append("NARRATIVE")
    lines.append("  What this token is about")
    headline = story.get("headline") or (
        f"{token.get('name') or 'Token'} (${token.get('symbol') or '?'})"
    )
    lines.append(f"  {headline}")
    if story.get("theme"):
        lines.append(f"  Theme:  {story.get('theme')}")
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}
    conf = (cf or {}).get("confidence") or ""
    srcs = story.get("sources_used") or []
    if conf or srcs:
        bits = []
        if conf:
            bits.append(f"confidence {conf}")
        if srcs:
            bits.append("sources: " + ", ".join(str(s) for s in srcs[:14]))
        lines.append("  (" + " · ".join(bits) + ")")

    lines.append("")
    storyline = (story.get("storyline") or story.get("paragraph") or "").strip()
    if storyline:
        for para in storyline.split("\n\n"):
            p = para.strip()
            if not p:
                continue
            lines.append(_wrap(p, indent="  ", width=72))
            lines.append("")
    else:
        lines.append("  (No narrative yet — run a full Analyze.)")
        lines.append("")

    # Multi-source string elements that built the "what is this token" story
    fragments = list(story.get("description_fragments") or [])
    if not fragments and isinstance(cf, dict):
        fragments = list(cf.get("description_fragments") or [])
    if fragments:
        lines.append("  Description sources (string elements):")
        for fr in fragments[:8]:
            src = fr.get("source") or "?"
            text = re.sub(r"\s+", " ", str(fr.get("text") or "")).strip()
            if not text:
                continue
            if len(text) > 180:
                text = text[:177] + "…"
            lines.append(f"    • [{src}] {text}")
        lines.append("")

    listing_tags = story.get("listing_tags") or (
        (cf or {}).get("tags") if isinstance(cf, dict) else None
    ) or []
    if listing_tags:
        lines.append("  Listing tags: " + ", ".join(str(t) for t in listing_tags[:12]))
        lines.append("")

    risk_notes = list(story.get("risk_notes") or [])
    if not risk_notes and isinstance(cf, dict):
        risk_notes = list(cf.get("risk_notes") or [])
    if risk_notes:
        lines.append("  Rugcheck risk text:")
        for r in risk_notes[:5]:
            lines.append(f"    • {r}")
        lines.append("")

    why = story.get("why_interested") or []
    if why:
        lines.append("  Key hooks:")
        for w in _dedupe_str_list(why)[:5]:
            lines.append(f"    • {w}")
        lines.append("")

    # ── X / COMMUNITY POSTS ───────────────────────────────────────────
    lines.append("-" * 72)
    lines.append("")
    lines.append("X / COMMUNITY POSTS")
    kind = sent.get("kind") or ("x_text" if x.get("posts_analyzed") else "unknown")
    lines.append(f"  Label:           {sent.get('label')}")
    lines.append(f"  Score:           {sent.get('score')}")
    lines.append(f"  Kind:            {kind}")
    lines.append(f"  Posts analyzed:  {x.get('posts_analyzed')}")
    tw_handle = (
        (x.get("twitter_handle") or socials.get("twitter_handle") or "")
        .strip()
        .lstrip("@")
    )
    if tw_handle:
        lines.append(f"  Handle:          @{tw_handle}")
        lines.append(f"  X profile:")
        lines.append(f"    https://x.com/{tw_handle}")
    else:
        lines.append("  Handle:          (none on DexScreener)")
    lines.append(f"  Sources:         {', '.join(x.get('sources_used') or [])}")
    if sent.get("summary"):
        lines.append(f"  Summary:         {sent.get('summary')}")
    if x.get("notes"):
        lines.append(f"  Note:            {x.get('notes')}")
    samples = x.get("sample_posts") or []
    if samples:
        lines.append("  Recent X posts:")
        seen_posts: set[str] = set()
        for p in samples[:10]:
            text = (p.get("text") or "").replace("\n", " ").strip()
            if not text:
                continue
            key = text[:60].lower()
            if key in seen_posts:
                continue
            seen_posts.add(key)
            if len(text) > 140:
                text = text[:137] + "..."
            lines.append(f"    • {text}")
            post_url = (p.get("url") or p.get("link") or "").strip()
            src = p.get("source") or ""
            if post_url:
                if not post_url.startswith("http"):
                    post_url = "https://" + post_url.lstrip("/")
                lines.append(f"      {post_url}")
            elif src:
                lines.append(f"      ({src})")
    else:
        lines.append("  (No sample posts fetched — tone may use market-crowd fallback.)")

    # ── PUBLIC NEWS ───────────────────────────────────────────────────
    lines.append("")
    lines.append("-" * 72)
    lines.append("")
    lines.append("PUBLIC NEWS")
    lines.append("  Public news events")
    lines.append("  (Click blue links to open in your browser)")
    news = list(story.get("news_events") or [])
    if news:
        seen_titles: set[str] = set()
        shown = 0
        for ev in news:
            title = re.sub(r"\s+", " ", str(ev.get("title") or "")).strip()
            if not title:
                continue
            key = title[:70].lower()
            if key in seen_titles:
                continue
            seen_titles.add(key)
            shown += 1
            plat = ev.get("platform") or ev.get("source") or "news"
            lines.append(f"    • [{plat}] {title}")
            url = (ev.get("url") or "").strip()
            if url:
                if not url.startswith("http://") and not url.startswith("https://"):
                    url = "https://" + url.lstrip("/")
                lines.append(f"      {url}")
            if shown >= 12:
                break
        if shown == 0:
            lines.append("  (No distinct public news headlines found for this token.)")
    else:
        lines.append("  (No public news events found for this token right now.)")
        lines.append("  Sources checked: Google News RSS + web search snippets.")

    # ── LINKS ─────────────────────────────────────────────────────────
    lines.append("")
    lines.append("-" * 72)
    lines.append("")
    lines.append("LINKS  (click blue URLs to open)")
    link_lines = _collect_about_links(report, story, socials, x)
    if link_lines:
        for lab, url in link_lines:
            lines.append(f"  {lab}:")
            lines.append(f"    {url}")
    else:
        lines.append("  (No website / social URLs found on DexScreener or coin APIs.)")

    lines.append("")
    lines.append("-" * 72)
    lines.append(
        report.get("disclaimer")
        or "Narrative + news from public APIs · heuristics only · not financial advice."
    )
    lines.append(f"Generated: {report.get('generated_at')}")
    return "\n".join(lines)


def _dedupe_str_list(items: list[Any]) -> list[str]:
    """Drop exact / near-duplicate strings (case-insensitive prefix)."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in items:
        s = str(raw).strip()
        if not s:
            continue
        key = s.lower()[:100]
        if key in seen:
            continue
        # also skip if this line is a substring of an already-kept line
        if any(key in prev or prev in key for prev in seen if len(prev) > 20):
            continue
        seen.add(key)
        out.append(s)
    return out


def _normalize_url(u: str) -> str | None:
    u = (u or "").strip()
    if not u or u.lower() in {"n/a", "none", "null"}:
        return None
    if u.startswith("@"):
        return f"https://x.com/{u.lstrip('@')}"
    if u.startswith("http://") or u.startswith("https://"):
        return u
    # bare domain or path
    if re.match(r"^(www\.)?[\w.-]+\.[a-z]{2,}([/?#].*)?$", u, re.I):
        return "https://" + u.lstrip("/")
    if u.startswith("t.me/") or u.startswith("telegram.me/"):
        return "https://" + u
    return None


def _collect_about_links(
    report: dict[str, Any],
    story: dict[str, Any],
    socials: dict[str, Any],
    x: dict[str, Any],
) -> list[tuple[str, str]]:
    """Gather labeled full URLs for the About LINKS block (deduped by URL)."""
    out: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(label: str, raw: Any) -> None:
        if not raw:
            return
        if isinstance(raw, dict):
            raw = raw.get("url") or raw.get("link") or raw.get("handle") or ""
        url = _normalize_url(str(raw))
        if not url:
            return
        key = url.rstrip("/").lower()
        if key in seen:
            return
        seen.add(key)
        out.append((label, url))

    # Token mint → Solscan
    tok = report.get("token") or {}
    addr = (tok.get("address") or "").strip()
    chain = (tok.get("chain_id") or "").lower()
    if addr and chain in {"solana", "sol", ""}:
        add("Token (Solscan)", f"https://solscan.io/token/{addr}")
    elif addr and chain in {"ethereum", "eth", "base", "bsc", "arbitrum", "polygon"}:
        add("Token (explorer)", f"https://dexscreener.com/{chain}/{addr}")

    # DexScreener pair
    pair = ((report.get("market") or {}).get("pair") or {})
    add("DexScreener", pair.get("url"))

    # Pump.fun
    pump = report.get("pumpfun") or {}
    add("Pump.fun", pump.get("pump_url"))

    # X / Twitter
    handle = (x.get("twitter_handle") or socials.get("twitter_handle") or "").strip().lstrip("@")
    if handle:
        add("X / Twitter", f"https://x.com/{handle}")

    # DexScreener socials list
    for s in socials.get("socials") or []:
        if not isinstance(s, dict):
            continue
        plat = (s.get("platform") or s.get("type") or "social").strip() or "social"
        add(str(plat).title(), s.get("url") or s.get("handle"))

    for w in socials.get("websites") or []:
        if isinstance(w, dict):
            lab = w.get("label") or "Website"
            add(str(lab).title(), w.get("url"))
        else:
            add("Website", w)

    # Coin facts / narrative links
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}
    links = (cf or {}).get("links") if isinstance((cf or {}).get("links"), dict) else {}
    if not links:
        facts = report.get("coin_facts") or {}
        links = facts.get("links") if isinstance(facts.get("links"), dict) else {}
    for k, v in (links or {}).items():
        add(str(k).replace("_", " ").title(), v)

    # Official source if it's a URL
    add("Official source", story.get("official_source"))

    # Bubblemaps if present
    maps = report.get("maps") or {}
    add("Bubblemaps", maps.get("iframe_url") or maps.get("url") or maps.get("public_url"))

    return out


def _wrap(text: str, indent: str = "", width: int = 70) -> str:
    words = text.split()
    if not words:
        return indent
    lines: list[str] = []
    cur = indent
    for w in words:
        if cur == indent:
            cur += w
        elif len(cur) + 1 + len(w) <= width + len(indent):
            cur += " " + w
        else:
            lines.append(cur)
            cur = indent + w
    lines.append(cur)
    return "\n".join(lines)
