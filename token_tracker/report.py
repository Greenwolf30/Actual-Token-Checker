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

    # Section markers (── TITLE ──) are colored dim-green in the UI.
    lines.append("")
    lines.append("── MARKET ──")
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
        lines.append("── PUMP.FUN ──")
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
    lines.append("── INITIAL MARKET CAP ──")
    lines.append(f"  Est. initial MC: {_usd(init.get('estimated_usd'))}")

    lines.append(f"  As of:           {init.get('as_of') or 'n/a'}")
    if init.get("source") or init.get("method"):
        lines.append(f"  Source:          {init.get('source') or 'n/a'}")
    if init.get("method"):
        lines.append(f"  Method:          {init.get('method')}")

    lines.append("")
    lines.append("── ALL-TIME HIGH ──")
    # Price omitted — MC is the primary estimate shown in Overview
    lines.append(f"  ATH market cap:  {_usd(ath.get('estimated_market_cap_usd'))}")
    lines.append(f"  As of:           {ath.get('as_of') or 'n/a'}")
    lines.append(f"  Candles used:    {ath.get('candles_used')}")
    if ath.get("source") or ath.get("method"):
        lines.append(f"  Source:          {ath.get('source') or 'n/a'}")
    if ath.get("method"):
        lines.append(f"  Method:          {ath.get('method')}")

    lines.append("")
    lines.append("── SOCIALS ──")
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
    lines.append("── X / COMMUNITY SENTIMENT ──")
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
    lines.append("── HOLDERS / WALLETS ──")
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
    lines.append("── BUNDLES / COORDINATED WALLETS ──")
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
            f"  Clusters:        {bs.get('multi_account_clusters')} multi "
            f"Associated Token Account · "
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
                    f"    {c.get('wallet')} · {c.get('accounts')} Associated Token Accounts · "
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
                f"  Similar-sized wallets — total {_pct(st)} across {sn} wallet(s):"
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
    lines.append("── ABOUT / NEWS ──")
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
    # Section markers (── TITLE ──) are colored dim-green in the UI.
    lines.append("=" * 72)
    lines.append(
        f"  {token.get('name')} (${token.get('symbol')})  |  {token.get('chain_id')}"
    )
    lines.append(f"  {token.get('address')}")
    lines.append("=" * 72)
    lines.append("")
    lines.append("── MARKET ──")
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
        lines.append("── PUMP.FUN ──")
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
    lines.append("── INITIAL MARKET CAP ──")
    lines.append(f"  Est. initial MC: {_usd(init.get('estimated_usd'))}")
    lines.append(f"  As of:           {init.get('as_of') or 'n/a'}")
    if init.get("source"):
        lines.append(f"  Source:          {init.get('source')}")
    if init.get("method"):
        lines.append(f"  Method:          {init.get('method')}")

    lines.append("")
    lines.append("── ALL-TIME HIGH ──")
    # Price omitted — Overview shows ATH market cap only (faster path, clearer UI)
    lines.append(f"  ATH market cap:  {_usd(ath.get('estimated_market_cap_usd'))}")
    lines.append(f"  As of:           {ath.get('as_of') or 'n/a'}")
    lines.append(f"  Candles used:    {ath.get('candles_used')}")
    if ath.get("source"):
        lines.append(f"  Source:          {ath.get('source')}")
    if ath.get("method"):
        lines.append(f"  Method:          {ath.get('method')}")

    lines.append("")
    lines.append("── SOCIALS ──")
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
            return (
                "── HOLDERS ──\n"
                f"  {holders.get('error') or holders.get('notes') or 'Run Analyze first.'}\n"
            )
        return json.dumps(holders, indent=2, default=str)


def format_bundles_section(report: dict[str, Any]) -> str:
    """Bundles tab body — always human text, never raw JSON."""
    if report.get("_raw_bundles_text"):
        return str(report["_raw_bundles_text"])
    bundles = report.get("bundles") or {}
    try:
        from .bundles import format_bundles_text

        return format_bundles_text(bundles)
    except Exception as exc:  # noqa: BLE001
        # Do not dump JSON into the UI (looks like "code"). Keep a short error.
        err = (
            bundles.get("error")
            or bundles.get("notes")
            or "Bundles could not be formatted."
        )
        return (
            "── BUNDLES ──\n"
            f"  {err}\n"
            f"  (formatter note: {exc})\n"
            "\n"
            "  Tips:\n"
            "  · Use full Analyze (not Quick) on a Solana mint\n"
            "  · Holders must succeed first\n"
            "  · Helius needed for funding / fresh / multi-send / launch-window\n"
        )


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
                "── MAPS — Bubblemaps ──\n"
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
            "── ALERTS ──\n"
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


def _will_show_placeholder(label: str) -> str:
    """Empty-slot copy — same style as Alerts (“if value returns True”)."""
    name = (label or "Value").strip()
    return f"  {name} will show here if value returns True"


def _about_prose_redundant(text: str, *pools: str) -> bool:
    t = re.sub(r"\s+", " ", (text or "")).strip().lower()
    if len(t) < 20:
        return False
    head = t[:48]
    for pool in pools:
        p = re.sub(r"\s+", " ", (pool or "")).strip().lower()
        if not p:
            continue
        if head in p or t in p or (len(p) >= 24 and p[:48] in t):
            return True
    return False


def _about_collect_frag_lines(
    story: dict[str, Any],
    cf: dict[str, Any],
    *,
    storyline: str,
    official_desc: str,
    limit: int = 6,
) -> list[str]:
    fragments = list(story.get("description_fragments") or [])
    if not fragments and isinstance(cf, dict):
        fragments = list(cf.get("description_fragments") or [])
    frag_lines: list[str] = []
    seen_fr: list[str] = []
    for fr in fragments:
        src = fr.get("source") or "?"
        text = re.sub(r"\s+", " ", str(fr.get("text") or "")).strip()
        if not text:
            continue
        if _about_prose_redundant(text, storyline, official_desc):
            continue
        key = text.lower()
        if any(
            key == s
            or (len(key) >= 24 and (key[:60] == s[:60] or key in s or s in key))
            for s in seen_fr
        ):
            continue
        seen_fr.append(key)
        if len(text) > 180:
            text = text[:177] + "…"
        frag_lines.append(f"[{src}] {text}")
        if len(frag_lines) >= limit:
            break
    return frag_lines


def _about_collect_hype_lines(
    story: dict[str, Any],
    *,
    storyline: str,
    official_desc: str,
    limit: int = 6,
) -> list[str]:
    why = list(story.get("why_interested") or [])
    hype_drv = list(story.get("hype_drivers") or [])
    hook_lines: list[str] = []
    shown_why: list[str] = []
    for w in _dedupe_str_list(why + hype_drv):
        ws = re.sub(r"\s+", " ", str(w or "")).strip()
        if not ws:
            continue
        low = ws.lower()
        if low.startswith("stated purpose/story"):
            continue
        if "publishes an official description" in low:
            continue
        core = re.sub(
            r"^(fits theme/category|secondary angle|listed under)\s*:?\s*",
            "",
            ws,
            flags=re.I,
        ).strip()
        if _about_prose_redundant(core, storyline, official_desc):
            continue
        if any(
            core.lower() == s
            or (len(core) >= 24 and (core[:50].lower() == s[:50] or core.lower() in s))
            or (len(core) >= 30 and s in core.lower())
            or (len(s) >= 30 and core.lower() in s)
            for s in shown_why
        ):
            continue
        shown_why.append(core.lower())
        hook_lines.append(ws)
        if len(hook_lines) >= limit:
            break
    return hook_lines


def build_about_ui_payload(report: dict[str, Any]) -> dict[str, Any]:
    """Structured About tab data for card UI (mirrors format_about_section)."""
    if not report.get("ok") and not report.get("narrative") and not report.get(
        "community_sentiment_x"
    ):
        return {"ok": False, "error": "Run Analyze to load About."}

    token = report.get("token") or {}
    x = report.get("community_sentiment_x") or {}
    sent = x.get("sentiment") or {}
    story = report.get("narrative") or {}
    socials = report.get("socials") or {}
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}

    storyline = (story.get("storyline") or story.get("paragraph") or "").strip()
    official_desc = (story.get("official_description") or "").strip()
    if not official_desc and isinstance(cf, dict):
        official_desc = str(cf.get("official_description") or "").strip()

    tw_handle = (
        (x.get("twitter_handle") or socials.get("twitter_handle") or "")
        .strip()
        .lstrip("@")
    )

    posts: list[dict[str, Any]] = []
    seen_posts: set[str] = set()
    for p in x.get("sample_posts") or []:
        text = (p.get("text") or "").replace("\n", " ").strip()
        if not text:
            continue
        key = text[:60].lower()
        if key in seen_posts:
            continue
        seen_posts.add(key)
        post_url = (p.get("url") or p.get("link") or "").strip()
        if post_url and not post_url.startswith("http"):
            post_url = "https://" + post_url.lstrip("/")
        posts.append(
            {
                "text": text[:240],
                "url": post_url,
                "source": p.get("source") or "",
            }
        )
        if len(posts) >= 10:
            break

    news_out: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for ev in story.get("news_events") or []:
        title = re.sub(r"\s+", " ", str(ev.get("title") or "")).strip()
        if not title:
            continue
        key = title[:70].lower()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        url = (ev.get("url") or "").strip()
        if url and not url.startswith("http"):
            url = "https://" + url.lstrip("/")
        news_out.append(
            {
                "title": title,
                "url": url,
                "platform": ev.get("platform") or ev.get("source") or "news",
            }
        )
        if len(news_out) >= 12:
            break

    link_lines = _collect_about_links(report, story, socials, x)
    other_links = [
        {"label": lab, "url": url}
        for lab, url in link_lines
        if "linkedin" not in str(lab).lower() and "linkedin.com" not in str(url).lower()
    ]
    linkedin_links = [
        {"label": lab, "url": url}
        for lab, url in link_lines
        if "linkedin" in str(lab).lower() or "linkedin.com" in str(url).lower()
    ]
    linkedin_links.extend(
        {"label": lab, "url": url}
        for lab, url in _collect_about_linkedin(report, story, socials, x)
    )
    seen_li: set[str] = set()
    li_unique: list[dict[str, str]] = []
    for item in linkedin_links:
        key = str(item.get("url") or "").rstrip("/").lower()
        if not key or key in seen_li:
            continue
        seen_li.add(key)
        li_unique.append(item)

    li_snips: list[dict[str, str]] = []
    social_pack = report.get("social_narrative_sources") or {}
    for s in social_pack.get("snippets") or []:
        if not isinstance(s, dict):
            continue
        if (s.get("platform") or "").lower() != "linkedin":
            continue
        text = re.sub(r"\s+", " ", str(s.get("text") or "")).strip()
        if not text:
            continue
        u = (s.get("url") or "").strip()
        if u and not u.startswith("http"):
            u = "https://" + u.lstrip("/")
        li_snips.append({"text": text[:200], "url": u})
        if len(li_snips) >= 6:
            break

    listing_tags = story.get("listing_tags") or (
        (cf or {}).get("tags") if isinstance(cf, dict) else None
    ) or []
    risk_notes = list(story.get("risk_notes") or [])
    if not risk_notes and isinstance(cf, dict):
        risk_notes = list(cf.get("risk_notes") or [])

    show_official = bool(
        official_desc and not _about_prose_redundant(official_desc, storyline)
    )

    return {
        "ok": True,
        "token": {
            "name": token.get("name"),
            "symbol": token.get("symbol"),
            "chain_id": token.get("chain_id"),
        },
        "headline": story.get("headline")
        or f"{token.get('name') or 'Token'} (${token.get('symbol') or '?'})",
        "theme": story.get("theme") or "",
        "confidence": (cf or {}).get("confidence") or "",
        "sources_used": list(story.get("sources_used") or [])[:14],
        "storyline_paragraphs": [
            p.strip() for p in storyline.split("\n\n") if p.strip()
        ],
        "fragments": _about_collect_frag_lines(
            story, cf, storyline=storyline, official_desc=official_desc
        ),
        "listing_tags": [str(t) for t in listing_tags[:12]],
        "risk_notes": [str(r) for r in risk_notes[:5]],
        "hype": _about_collect_hype_lines(
            story, storyline=storyline, official_desc=official_desc
        ),
        "official_description": official_desc if show_official else "",
        "x": {
            "label": sent.get("label"),
            "score": sent.get("score"),
            "kind": sent.get("kind"),
            "posts_analyzed": x.get("posts_analyzed"),
            "sources_used": list(x.get("sources_used") or [])[:8],
            "summary": (sent.get("summary") or "").strip(),
            "handle": tw_handle,
            "profile_url": f"https://x.com/{tw_handle}" if tw_handle else "",
            "notes": (x.get("notes") or "").strip(),
            "posts": posts,
        },
        "news": news_out,
        "links": other_links,
        "linkedin": li_unique,
        "linkedin_snippets": li_snips,
        "generated_at": report.get("generated_at"),
        "disclaimer": report.get("disclaimer")
        or "Narrative + news from public APIs · heuristics only · not financial advice.",
    }


def format_about_section(report: dict[str, Any]) -> str:
    """About tab: Narrative + X posts + Public News + Links + LinkedIn (no placeholders)."""
    if not report.get("ok") and not report.get("narrative") and not report.get(
        "community_sentiment_x"
    ):
        return (
            "── ABOUT ──\n"
            "  Run Analyze to load narrative, X posts, public news, and LinkedIn.\n"
        )

    token = report.get("token") or {}
    x = report.get("community_sentiment_x") or {}
    sent = x.get("sentiment") or {}
    story = report.get("narrative") or {}
    socials = report.get("socials") or {}
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}

    lines: list[str] = []
    lines.append("=" * 72)
    lines.append("  ABOUT — narrative · X posts · public news · LinkedIn")
    if token.get("symbol") or token.get("name"):
        lines.append(
            f"  {token.get('name') or ''} (${token.get('symbol') or '?'})  ·  "
            f"{token.get('chain_id') or ''}"
        )
    lines.append("=" * 72)

    storyline = (story.get("storyline") or story.get("paragraph") or "").strip()
    official_desc = (story.get("official_description") or "").strip()
    if not official_desc and isinstance(cf, dict):
        official_desc = str(cf.get("official_description") or "").strip()

    frag_lines = _about_collect_frag_lines(
        story, cf, storyline=storyline, official_desc=official_desc
    )
    hook_lines = _about_collect_hype_lines(
        story, storyline=storyline, official_desc=official_desc
    )
    listing_tags = story.get("listing_tags") or (
        (cf or {}).get("tags") if isinstance(cf, dict) else None
    ) or []
    risk_notes = list(story.get("risk_notes") or [])
    if not risk_notes and isinstance(cf, dict):
        risk_notes = list(cf.get("risk_notes") or [])

    has_narrative = bool(
        story.get("headline")
        or story.get("theme")
        or storyline
        or official_desc
        or frag_lines
        or hook_lines
        or listing_tags
        or risk_notes
    )
    if has_narrative:
        lines.append("")
        lines.append("── NARRATIVE ──")
        headline = story.get("headline") or (
            f"{token.get('name') or 'Token'} (${token.get('symbol') or '?'})"
        )
        lines.append(f"  {headline}")
        if story.get("theme"):
            lines.append(f"  Theme:  {story.get('theme')}")
        conf = (cf or {}).get("confidence") or ""
        srcs = story.get("sources_used") or []
        if conf or srcs:
            bits = []
            if conf:
                bits.append(f"confidence {conf}")
            if srcs:
                bits.append("sources: " + ", ".join(str(s) for s in srcs[:14]))
            lines.append("  (" + " · ".join(bits) + ")")
        if storyline:
            lines.append("")
            for para in storyline.split("\n\n"):
                p = para.strip()
                if not p:
                    continue
                lines.append(_wrap(p, indent="  ", width=72))
                lines.append("")
        if frag_lines:
            lines.append("  Description sources (string elements):")
            for fl in frag_lines:
                lines.append(f"    • {fl}")
            lines.append("")
        if listing_tags:
            lines.append("  Listing tags: " + ", ".join(str(t) for t in listing_tags[:12]))
            lines.append("")
        if risk_notes:
            lines.append("  Rugcheck risk text:")
            for r in risk_notes[:5]:
                lines.append(f"    • {r}")
            lines.append("")
        if hook_lines:
            lines.append("  Hype:")
            for h in hook_lines:
                lines.append(f"    • {h}")
            lines.append("")
        if official_desc and not _about_prose_redundant(official_desc, storyline):
            od = official_desc if len(official_desc) <= 400 else official_desc[:397] + "…"
            lines.append("  Official description:")
            lines.append(_wrap(od, indent="    ", width=72))
            lines.append("")

    # ── X / COMMUNITY POSTS ───────────────────────────────────────────
    tw_handle = (
        (x.get("twitter_handle") or socials.get("twitter_handle") or "")
        .strip()
        .lstrip("@")
    )
    samples = x.get("sample_posts") or []
    summary = (sent.get("summary") or "").strip()
    notes = (x.get("notes") or "").strip()
    kind = sent.get("kind") or ("x_text" if x.get("posts_analyzed") else "")
    label = sent.get("label")
    label_s = (
        "n/a"
        if label is None or str(label).strip() == "" or str(label).lower() == "none"
        else str(label).strip()
    )
    score = sent.get("score")
    try:
        score_s = "n/a" if score is None or score == "" else f"{float(score):g}"
    except (TypeError, ValueError):
        score_s = str(score) if score not in (None, "") else "n/a"
    posts_n = x.get("posts_analyzed")
    posts_s = "0" if posts_n is None or posts_n == "" else str(posts_n)
    x_srcs = [str(s) for s in (x.get("sources_used") or []) if s]
    has_x = bool(samples or tw_handle or summary or notes or kind or x_srcs)

    if has_x:
        lines.append("-" * 72)
        lines.append("")
        lines.append("── X / COMMUNITY POSTS ──")
        if kind or label_s != "n/a" or score_s != "n/a" or posts_s != "0":
            lines.append(
                f"  Tone: {label_s} · score {score_s} · kind {kind or 'n/a'} · "
                f"posts analyzed {posts_s}"
            )
        if x_srcs:
            lines.append(f"  Sources: {', '.join(x_srcs)}")
        if tw_handle:
            lines.append(f"  Handle: @{tw_handle}")
            lines.append(f"  Profile: https://x.com/{tw_handle}")
        if summary:
            lines.append("  Summary: " + summary)
        if notes:
            lines.append("  Note: " + notes)
        if samples:
            lines.append("")
            lines.append("  Recent X posts:")
            seen_posts: set[str] = set()
            shown = 0
            for p in samples[:10]:
                text = (p.get("text") or "").replace("\n", " ").strip()
                if not text:
                    continue
                key = text[:60].lower()
                if key in seen_posts:
                    continue
                seen_posts.add(key)
                if len(text) > 160:
                    text = text[:157] + "..."
                lines.append(f"    • {text}")
                post_url = (p.get("url") or p.get("link") or "").strip()
                src = p.get("source") or ""
                if post_url:
                    if not post_url.startswith("http"):
                        post_url = "https://" + post_url.lstrip("/")
                    lines.append(f"      {post_url}")
                elif src:
                    lines.append(f"      ({src})")
                shown += 1

    # ── PUBLIC NEWS ───────────────────────────────────────────────────
    news = list(story.get("news_events") or [])
    news_lines: list[str] = []
    if news:
        seen_titles: set[str] = set()
        for ev in news:
            title = re.sub(r"\s+", " ", str(ev.get("title") or "")).strip()
            if not title:
                continue
            key = title[:70].lower()
            if key in seen_titles:
                continue
            seen_titles.add(key)
            plat = ev.get("platform") or ev.get("source") or "news"
            news_lines.append(f"    • [{plat}] {title}")
            url = (ev.get("url") or "").strip()
            if url:
                if not url.startswith("http://") and not url.startswith("https://"):
                    url = "https://" + url.lstrip("/")
                news_lines.append(f"      {url}")
            if len(news_lines) >= 24:
                break

    if news_lines:
        lines.append("")
        lines.append("-" * 72)
        lines.append("")
        lines.append("── PUBLIC NEWS ──")
        lines.append("  (Click blue links to open in your browser)")
        lines.extend(news_lines)

    # ── LINKS ─────────────────────────────────────────────────────────
    link_lines = _collect_about_links(report, story, socials, x)
    other_links = [
        (lab, url)
        for lab, url in link_lines
        if "linkedin" not in str(lab).lower()
        and "linkedin.com" not in str(url).lower()
    ]
    linkedin_links = [
        (lab, url)
        for lab, url in link_lines
        if "linkedin" in str(lab).lower() or "linkedin.com" in str(url).lower()
    ]
    linkedin_links.extend(_collect_about_linkedin(report, story, socials, x))
    seen_li: set[str] = set()
    li_unique: list[tuple[str, str]] = []
    for lab, url in linkedin_links:
        key = str(url).rstrip("/").lower()
        if key in seen_li:
            continue
        seen_li.add(key)
        li_unique.append((lab, url))

    if other_links:
        lines.append("")
        lines.append("-" * 72)
        lines.append("")
        lines.append("── LINKS ──")
        lines.append("  (click blue URLs to open)")
        for lab, url in other_links:
            lines.append(f"  {lab}:")
            lines.append(f"    {url}")

    # Always show LinkedIn as its own About section (even when empty).
    li_snips_pairs: list[tuple[str, str]] = []
    social_pack = report.get("social_narrative_sources") or {}
    for s in social_pack.get("snippets") or []:
        if not isinstance(s, dict):
            continue
        if (s.get("platform") or "").lower() != "linkedin":
            continue
        text = re.sub(r"\s+", " ", str(s.get("text") or "")).strip()
        if not text:
            continue
        u = (s.get("url") or "").strip()
        if u and not u.startswith("http"):
            u = "https://" + u.lstrip("/")
        li_snips_pairs.append((text, u))
        if len(li_snips_pairs) >= 6:
            break

    lines.append("")
    lines.append("-" * 72)
    lines.append("")
    lines.append("── LINKEDIN ──")
    lines.append("  (company / profile links + public search snippets)")
    if li_unique:
        for lab, url in li_unique:
            lines.append(f"  {lab}:")
            lines.append(f"    {url}")
    else:
        lines.append("  No LinkedIn company/profile page found in public sources.")
    if li_snips_pairs:
        lines.append("  Public snippets:")
        for text, u in li_snips_pairs:
            if len(text) > 160:
                text = text[:157] + "…"
            lines.append(f"    • {text}")
            if u:
                lines.append(f"      {u}")

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

    # Coin facts / narrative links (LinkedIn excluded here → own About section)
    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}
    links = (cf or {}).get("links") if isinstance((cf or {}).get("links"), dict) else {}
    if not links:
        facts = report.get("coin_facts") or {}
        links = facts.get("links") if isinstance(facts.get("links"), dict) else {}
    for k, v in (links or {}).items():
        kl = str(k).lower()
        if "linkedin" in kl:
            continue
        if isinstance(v, str) and "linkedin.com" in v.lower():
            continue
        add(str(k).replace("_", " ").title(), v)

    # Official source if it's a URL (skip LinkedIn — own section)
    off = story.get("official_source")
    if not (isinstance(off, str) and "linkedin.com" in off.lower()):
        add("Official source", off)

    # Bubblemaps if present
    maps = report.get("maps") or {}
    add("Bubblemaps", maps.get("iframe_url") or maps.get("url") or maps.get("public_url"))

    return out


def _collect_about_linkedin(
    report: dict[str, Any],
    story: dict[str, Any],
    socials: dict[str, Any],
    x: dict[str, Any],
) -> list[tuple[str, str]]:
    """LinkedIn URLs only — for the About ── LINKEDIN ── section."""
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
        lab = (label or "LinkedIn").strip() or "LinkedIn"
        if "linkedin.com" not in url.lower() and "linkedin" not in lab.lower():
            return
        key = url.rstrip("/").lower()
        if key in seen:
            return
        seen.add(key)
        out.append((lab if "linkedin" in lab.lower() else "LinkedIn", url))

    cf = story.get("coin_facts") if isinstance(story.get("coin_facts"), dict) else {}
    links = (cf or {}).get("links") if isinstance((cf or {}).get("links"), dict) else {}
    if not links:
        facts = report.get("coin_facts") or {}
        links = facts.get("links") if isinstance(facts.get("links"), dict) else {}
    add("LinkedIn", (links or {}).get("linkedin"))
    for k, v in (links or {}).items():
        if "linkedin" in str(k).lower() or (
            isinstance(v, str) and "linkedin.com" in v.lower()
        ):
            add(str(k).replace("_", " ").title() if k else "LinkedIn", v)

    for s in socials.get("socials") or []:
        if not isinstance(s, dict):
            continue
        plat = (s.get("platform") or s.get("type") or "").lower()
        url = s.get("url") or s.get("handle") or ""
        if "linkedin" in plat or (isinstance(url, str) and "linkedin.com" in url.lower()):
            add("LinkedIn", url)

    social_pack = report.get("social_narrative_sources") or {}
    for s in social_pack.get("snippets") or []:
        if not isinstance(s, dict):
            continue
        if (s.get("platform") or "").lower() == "linkedin" and s.get("url"):
            add("LinkedIn", s.get("url"))
        elif isinstance(s.get("url"), str) and "linkedin.com" in s["url"].lower():
            add("LinkedIn", s.get("url"))

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
