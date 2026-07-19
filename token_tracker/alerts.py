"""
Immediate risk Alerts for the Alerts tab.

Things to watch out for immediately:
  - Liquidity unlocked (LP can be pulled)
  - Comprehensive list of non-LP wallets holding over 2% (with % + priority)
  - Single non-LP holder over 5% of supply
  - Similar-size wallets with large combined %
  - Bundle supply % thresholds (5–20% / 20% / 27% / 50%)
  - Socials missing / not set on DexScreener
  - Wallet linked to known serial-rugger / rug signals (Rugcheck)

If none fire: show a clean "no top-priority warnings" message.
"""

from __future__ import annotations

import re
from typing import Any

_RUGGER_RISK_RE = re.compile(
    r"scam|rugg|serial|known\s*scammer|malicious|honeypot|"
    r"creator\s*history|dev\s*sold|bundle|sniper|blacklist|phishing",
    re.I,
)


# DexScreener / internal ids for Pump.fun bonding curve and PumpSwap pools
_PUMP_POOL_DEXES = frozenset(
    {
        "pumpfun",
        "pumpswap",
        "pump",
        "pumpswap-v2",
        "pump-fun",
        "pump_swap",
    }
)


def _norm_dex(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "").replace("_", "").replace("-", "")


def _is_pump_pool_dex(value: Any) -> bool:
    """True if dex/pool id is Pump.fun bonding curve or PumpSwap."""
    d = _norm_dex(value)
    if not d:
        return False
    # Normalize variants: pump-fun → pumpfun, pump_swap → pumpswap
    for name in _PUMP_POOL_DEXES:
        if _norm_dex(name) == d:
            return True
    # Substring fallback for odd labels (e.g. "pumpswapamm")
    return d.startswith("pumpfun") or d.startswith("pumpswap") or d == "pump"


def _collect_pool_dexes(
    *,
    pumpfun: dict[str, Any] | None = None,
    dex_id: str | None = None,
    dexes: list[str] | tuple[str, ...] | None = None,
    market: dict[str, Any] | None = None,
) -> list[str]:
    """Gather primary + alternate pool dex ids for pump-pool detection."""
    out: list[str] = []
    if dex_id:
        out.append(str(dex_id))
    for d in dexes or []:
        if d:
            out.append(str(d))
    pf = pumpfun or {}
    if pf.get("dex_id"):
        out.append(str(pf["dex_id"]))
    for d in pf.get("dexes_seen") or []:
        if d:
            out.append(str(d))
    m = market or {}
    pair = m.get("pair") if isinstance(m.get("pair"), dict) else {}
    if pair.get("dex_id"):
        out.append(str(pair["dex_id"]))
    if m.get("dex_id"):
        out.append(str(m["dex_id"]))
    # de-dupe, preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for d in out:
        key = d.lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(d)
    return uniq


def skip_lp_unlock_for_pump_pool(
    holders_data: dict[str, Any] | None = None,
    pumpfun: dict[str, Any] | None = None,
    token_address: str | None = None,
    *,
    dex_id: str | None = None,
    dexes: list[str] | tuple[str, ...] | None = None,
    market: dict[str, Any] | None = None,
) -> bool:
    """
    Skip liquidity-unlocked alert for Pump.fun ecosystem tokens/pools.

    True when any of:
      - mint ends with 'pump' (classic Pump.fun mint)
      - pumpfun meta marks is_pump_mint / on bonding curve
      - primary or known pool dex is pumpfun / pumpswap (not all mints end in pump)
    """
    pf = pumpfun or {}
    if pf.get("is_pump_mint") is True:
        return True
    if pf.get("on_bonding_curve") is True:
        return True

    mint = (token_address or "").strip()
    if not mint and holders_data:
        mint = str(holders_data.get("token_address") or "").strip()
    if mint:
        try:
            from .pumpfun import is_pump_mint

            if is_pump_mint(mint):
                return True
        except Exception:  # noqa: BLE001
            if mint.lower().endswith("pump"):
                return True

    # Pool / venue check — covers pump tokens whose mint does NOT end with "pump"
    pool_dexes = _collect_pool_dexes(
        pumpfun=pf, dex_id=dex_id, dexes=dexes, market=market
    )
    if any(_is_pump_pool_dex(d) for d in pool_dexes):
        return True

    return False


def build_alerts(
    holders_data: dict[str, Any] | None,
    bundles_data: dict[str, Any] | None = None,
    socials: dict[str, Any] | None = None,
    pumpfun: dict[str, Any] | None = None,
    token_address: str | None = None,
    *,
    dex_id: str | None = None,
    dexes: list[str] | tuple[str, ...] | None = None,
    market: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return structured alerts from holder/bundle/Rugcheck + DexScreener socials.

    Pass dex_id / dexes / market so Pump.fun + PumpSwap pools skip LP-unlock
    even when the mint does not end with 'pump'.
    """
    holders_data = holders_data or {}
    bundles_data = bundles_data or {}
    socials = socials or {}
    alerts: list[dict[str, Any]] = []
    is_pump = skip_lp_unlock_for_pump_pool(
        holders_data,
        pumpfun,
        token_address,
        dex_id=dex_id,
        dexes=dexes,
        market=market,
    )

    # Socials can still be checked even if holders failed
    social_alert = _dexscreener_socials_alert(socials)
    if social_alert:
        alerts.append(social_alert)

    if not holders_data.get("ok"):
        if alerts:
            # Return social-only alerts when holders unavailable
            return {
                "ok": True,
                "priority_count": sum(1 for a in alerts if a.get("priority") == "top"),
                "alerts": alerts,
                "summary": (
                    f"{len(alerts)} alert(s); holders scan unavailable for full checks."
                ),
                "checks": ["dexscreener_socials_missing"],
                "notes": holders_data.get("error") or holders_data.get("notes") or "",
            }
        return {
            "ok": False,
            "priority_count": 0,
            "alerts": [],
            "summary": "Holders scan unavailable — run Analyze to fill Alerts.",
            "notes": holders_data.get("error") or holders_data.get("notes") or "",
        }

    meta = holders_data.get("meta") or {}
    holders = list(holders_data.get("holders") or [])

    # ── 1) Liquidity unlocked ─────────────────────────────────────────
    # Skip for Pump.fun / PumpSwap: mint ends with pump OR pool dex is
    # pumpfun/pumpswap (some pump tokens lack the pump suffix). LP lock
    # metrics from Rugcheck are often misleading on these venues.
    # Uses the *worst* meaningful pool (min LP locked). Showing "max locked"
    # used to read like "LP is 100% locked" even when another pool was open.
    lp = meta.get("lp_lock") or {}
    if lp.get("checked") and not is_pump:
        unlocked = bool(lp.get("liquidity_unlocked"))
        min_locked = lp.get("lp_locked_pct_min")
        max_locked = lp.get("lp_locked_pct_max")
        markets_unlocked = int(lp.get("markets_unlocked") or 0)
        markets_scanned = int(lp.get("markets_scanned") or 0)
        if unlocked:
            detail_bits: list[str] = []
            if min_locked is not None:
                detail_bits.append(
                    f"worst pool LP locked ≈ {float(min_locked):.1f}%"
                )
            if (
                max_locked is not None
                and min_locked is not None
                and float(max_locked) - float(min_locked) > 0.5
            ):
                detail_bits.append(
                    f"best pool ≈ {float(max_locked):.1f}% locked"
                )
            if markets_scanned > 0 and markets_unlocked > 0:
                detail_bits.append(
                    f"{markets_unlocked} of {markets_scanned} market(s) "
                    f"under 50% LP locked"
                )
            elif markets_unlocked > 0:
                detail_bits.append(
                    f"{markets_unlocked} market(s) under 50% LP locked"
                )
            alerts.append(
                {
                    "id": "liquidity_unlocked",
                    "priority": "top",
                    "severity": "high",
                    "title": "Liquidity unlocked",
                    "detail": (
                        "At least one meaningful market has mostly unlocked LP "
                        "(can often be removed). "
                        + (
                            " · ".join(detail_bits)
                            if detail_bits
                            else "Check lock status on Rugcheck."
                        )
                    ),
                }
            )

    # ── 2) Holders ≥ 2% and > 5% (exclude known program / LP) ─────────
    try:
        from .holders import is_known_lp_or_program, holding_priority_label
    except Exception:  # noqa: BLE001
        is_known_lp_or_program = None  # type: ignore[assignment]

        def holding_priority_label(pct: float | None) -> str:  # type: ignore[misc]
            if pct is None:
                return "unknown"
            if pct < 2:
                return "none"
            if pct <= 5:
                return "low"  # 2%–5% → [low priority]
            if pct < 10:
                return "medium"
            if pct < 15:
                return "high"
            return "critical"

    over_2: list[dict[str, Any]] = []
    whales: list[dict[str, Any]] = []
    for h in holders:
        if is_known_lp_or_program is not None:
            if is_known_lp_or_program(
                h.get("wallet"),
                label=h.get("label"),
                is_known_program=bool(h.get("is_known_program")),
            ):
                continue
        elif h.get("is_known_program"):
            continue
        try:
            pct = float(h.get("pct_supply")) if h.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None or pct <= 2.0:
            continue
        row = {
            "wallet": h.get("wallet"),
            "pct": pct,
            "rank": h.get("rank"),
            "label": h.get("label"),
            "insider": bool(h.get("insider")),
            "hold_priority": holding_priority_label(pct),
        }
        over_2.append(row)
        if pct > 5.0:
            whales.append(row)
    over_2.sort(key=lambda x: -float(x["pct"]))
    whales.sort(key=lambda x: -float(x["pct"]))

    # Comprehensive list: every non-LP wallet above 2% with holding %
    if over_2:
        lines_detail = [
            f"{len(over_2)} non-LP wallet(s) hold more than 2% of supply "
            "(LP/program wallets excluded). Full list below."
        ]
        alerts.append(
            {
                "id": "holders_over_2_pct",
                "priority": "top",
                "severity": "high"
                if any(float(w["pct"]) >= 10 for w in over_2)
                else ("medium" if any(float(w["pct"]) > 5 for w in over_2) else "info"),
                "title": f"Wallets holding over 2% ({len(over_2)})",
                "detail": " ".join(lines_detail),
                "wallets": over_2,  # full list; formatter prints all
                "list_all": True,
            }
        )

    if whales:
        top = whales[0]
        more = f" (+{len(whales) - 1} more over 5%)" if len(whales) > 1 else ""
        alerts.append(
            {
                "id": "single_holder_over_5",
                "priority": "top",
                "severity": "high" if top["pct"] >= 15 else "medium",
                "title": "Single holder over 5%",
                "detail": (
                    f"Wallet holds ~{top['pct']:.2f}% of supply "
                    f"(rank #{top.get('rank')}){more}. "
                    f"{top.get('wallet') or ''}"
                ),
                "wallets": whales[:12],
            }
        )

    # ── 3) Similar wallets with large % ───────────────────────────────
    groups = list(bundles_data.get("similar_size_groups") or []) if bundles_data.get("ok") else []
    large_groups = []
    for g in groups:
        try:
            n = int(g.get("count") or len(g.get("wallets") or []))
            avg = float(g.get("avg_pct")) if g.get("avg_pct") is not None else None
        except (TypeError, ValueError):
            continue
        if avg is None or n < 3:
            continue
        combined = avg * n
        # "large percent" — combined group footprint or each already big
        if combined >= 5.0 or avg >= 2.0:
            large_groups.append({**g, "combined_pct_est": combined})
    if large_groups:
        large_groups.sort(key=lambda x: -float(x.get("combined_pct_est") or 0))
        g0 = large_groups[0]
        alerts.append(
            {
                "id": "similar_wallets_large",
                "priority": "top",
                "severity": "high" if (g0.get("combined_pct_est") or 0) >= 15 else "medium",
                "title": "Similar wallets with large combined share",
                "detail": (
                    f"{g0.get('count')} wallets hold nearly the same size "
                    f"(~{float(g0.get('avg_pct') or 0):.2f}% each, "
                    f"combined ≈ {float(g0.get('combined_pct_est') or 0):.1f}%). "
                    "Can look like a coordinated bundle."
                ),
                "groups": large_groups[:4],
            }
        )

    # ── 4) Bundle supply % thresholds (from Bundles tab total) ────────
    #   >20%  → elevated risk
    #   >27%  → danger / most likely rug
    #   ≥50%  → rug imminent
    bundle_alert = _bundle_pct_alert(bundles_data)
    if bundle_alert:
        alerts.append(bundle_alert)

    # ── 5) Known serial rugger / rug-linked wallets ───────────────────
    rugger_hits = _serial_rugger_hits(holders, meta)
    if rugger_hits:
        alerts.append(
            {
                "id": "serial_rugger_link",
                "priority": "top",
                "severity": "critical",
                "title": "Wallet linked to known rug / serial-rugger signals",
                "detail": rugger_hits["summary"],
                "items": rugger_hits.get("items") or [],
            }
        )

    priority_count = sum(1 for a in alerts if a.get("priority") == "top")
    if priority_count:
        summary = f"{priority_count} top-priority warning(s) — review immediately."
    else:
        lp_clause = (
            ""
            if is_pump
            else "liquidity is unlocked, "
        )
        summary = (
            "No top-priority warnings from current checks. "
            f"Top priority will show here if {lp_clause}a single holder "
            "is over 5%, bundle share exceeds 20%, DexScreener socials are missing, "
            "similar wallets hold a large %, or a wallet is linked to known rug signals."
        )

    checks = [
        "holders_over_2_pct",
        "single_holder_over_5",
        "similar_wallets_large",
        "bundle_pct_threshold",
        "dexscreener_socials_missing",
        "serial_rugger_link",
    ]
    if not is_pump:
        checks.insert(0, "liquidity_unlocked")

    return {
        "ok": True,
        "priority_count": priority_count,
        "alerts": alerts,
        "summary": summary,
        "checks": checks,
        "notes": (
            "Alerts are heuristics from Rugcheck + top-holder snapshot + bundle % + "
            "DexScreener profile socials. Not financial advice."
            + (
                " Liquidity-unlocked check skipped for Pump.fun / PumpSwap pools."
                if is_pump
                else ""
            )
        ),
    }


def dexscreener_socials_updated(socials: dict[str, Any] | None) -> bool | None:
    """
    True if DexScreener profile has any social/website links.
    False if profile payload is present but empty.
    None if socials were not provided (unknown).
    """
    if not socials:
        return None

    social_list = socials.get("socials") or []
    websites = socials.get("websites") or []
    twitter = (socials.get("twitter_handle") or "").strip()

    social_urls = 0
    for s in social_list:
        if not isinstance(s, dict):
            continue
        if (s.get("url") or s.get("handle") or "").strip():
            social_urls += 1
    web_urls = 0
    for w in websites:
        if isinstance(w, dict) and (w.get("url") or "").strip():
            web_urls += 1
        elif isinstance(w, str) and w.strip():
            web_urls += 1

    return bool(social_urls > 0 or web_urls > 0 or twitter)


def _dexscreener_socials_alert(socials: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    Alert when DexScreener pair profile has no socials / websites updated.

    DexScreener does not expose a reliable 'last updated' timestamp for social
    links, so 'not updated' = missing or empty profile links on the pair.
    """
    updated = dexscreener_socials_updated(socials)
    if updated is not False:
        return None

    return {
        "id": "dexscreener_socials_missing",
        "priority": "top",
        "severity": "medium",
        "title": "Socials not updated on DexScreener",
        "detail": (
            "No website, X/Twitter, Telegram, or other social links found on the "
            "DexScreener pair profile. Socials appear missing or not updated — "
            "common on fresh or low-effort tokens. Verify community links elsewhere. "
            "Heuristics only; not financial advice."
        ),
    }


def _bundle_pct_alert(bundles_data: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    Alert from total estimated bundle % of supply.

    Thresholds (highest matching tier only):
      5–20%            → low to moderate (informational warn)
      > 20%  and ≤ 27% → high possibility of rug
      > 27%  and < 50% → danger, most likely rug
      ≥ 50%             → rug imminent
    """
    bundles_data = bundles_data or {}
    if not bundles_data.get("ok"):
        return None
    summary = bundles_data.get("summary") or {}
    raw = summary.get("total_bundle_pct")
    if raw is None:
        # fallback: sum similar-size groups combined estimate
        try:
            groups = list(bundles_data.get("similar_size_groups") or [])
            if groups:
                best = 0.0
                for g in groups:
                    n = int(g.get("count") or len(g.get("wallets") or []) or 0)
                    avg = float(g.get("avg_pct") or 0)
                    best = max(best, n * avg)
                raw = best if best > 0 else None
        except (TypeError, ValueError):
            raw = None
    if raw is None:
        return None
    try:
        pct = float(raw)
    except (TypeError, ValueError):
        return None
    if pct < 5.0:
        return None

    flagged_n = summary.get("flagged_wallets")
    extra = ""
    if flagged_n is not None:
        extra = f" · {flagged_n} wallet(s) in bundle estimate"

    if pct >= 50.0:
        return {
            "id": "bundle_pct_50",
            "priority": "top",
            "severity": "critical",
            "title": "RUG IMMINENT — bundle ≥ 50%",
            "detail": (
                f"Estimated bundle share ≈ {pct:.1f}% of supply (≥ 50%). "
                "Extremely concentrated coordinated supply — rug imminent risk. "
                "Heuristics only; not financial advice."
                + extra
            ),
            "bundle_pct": pct,
            "threshold": 50,
        }
    if pct > 27.0:
        return {
            "id": "bundle_pct_27",
            "priority": "top",
            "severity": "critical",
            "title": "DANGER — bundle 27% or higher",
            "detail": (
                f"Estimated bundle share ≈ {pct:.1f}% of supply (> 27%). "
                "Most likely rug risk — coordinated wallets control a large slice of supply. "
                "Heuristics only; not financial advice."
                + extra
            ),
            "bundle_pct": pct,
            "threshold": 27,
        }
    if pct > 20.0:
        # > 20% and ≤ 27%
        return {
            "id": "bundle_pct_20",
            "priority": "top",
            "severity": "high",
            "title": "Bundle higher than 20%",
            "detail": (
                f"Estimated bundle share ≈ {pct:.1f}% of supply (> 20%). "
                "High possibility of rug — watch for coordinated dumps. "
                "Heuristics only; not financial advice."
                + extra
            ),
            "bundle_pct": pct,
            "threshold": 20,
        }
    # 5% ≤ pct ≤ 20%
    return {
        "id": "bundle_pct_5_20",
        "priority": "top",
        "severity": "medium",
        "title": "Bundle amount low to moderate",
        "detail": (
            f"Estimated bundle share ≈ {pct:.1f}% of supply (in the 5%–20% range). "
            "Bundle amount is low to moderate — worth watching, not an extreme signal by itself. "
            "Heuristics only; not financial advice."
            + extra
        ),
        "bundle_pct": pct,
        "threshold": 5,
    }


def format_alerts_text(data: dict[str, Any]) -> str:
    lines = [
        "=" * 72,
        "  ALERTS",
        "  Things to watch out for immediately",
        "=" * 72,
        "",
    ]
    if not data.get("ok") and not data.get("alerts"):
        lines.append(f"  {data.get('summary') or data.get('notes') or 'unavailable'}")
        lines.append("")
        lines.append(
            "  Top priority will show if there are any of: unlocked liquidity, "
            "single holder >5%, bundle >20% / >27% / ≥50%, DexScreener socials missing, "
            "similar large wallets, or rugger-linked wallets."
        )
        return "\n".join(lines) + "\n"

    n = int(data.get("priority_count") or 0)
    lines.append(f"  Top-priority warnings: {n}")
    lines.append(f"  {data.get('summary') or ''}")
    lines.append("")

    alerts = data.get("alerts") or []
    if not alerts:
        lines.append("  ✓ No immediate top-priority alerts from current data.")
        lines.append("")
        lines.append("  Checked:")
        checks_done = set(data.get("checks") or [])
        # Prefer explicit checks list (e.g. skip LP unlock for Pump.fun)
        if not checks_done or "liquidity_unlocked" in checks_done:
            lines.append("    • Liquidity unlocked")
        elif data.get("notes") and (
            "Pump.fun" in str(data.get("notes")) or "PumpSwap" in str(data.get("notes"))
        ):
            lines.append(
                "    • Liquidity unlocked (skipped — Pump.fun / PumpSwap pool)"
            )
        lines.append("    • All non-LP wallets holding over 2% (with % + priority)")
        lines.append("    • Single holder over 5% (excluding known program/LP)")
        lines.append("    • Bundle share 5–20% (low–moderate) / >20% / >27% / ≥50%")
        lines.append("    • Socials missing / not updated on DexScreener")
        lines.append("    • Similar wallets with large combined %")
        lines.append("    • Known serial-rugger / rug signals (Rugcheck)")
        lines.append("")
        lines.append(
            "  Warning: top priority will show if any of those conditions appear."
        )
    else:
        lines.append("  TOP PRIORITY")
        lines.append("  " + "-" * 40)
        for i, a in enumerate(alerts, 1):
            sev = (a.get("severity") or "info").upper()
            lines.append(f"  {i}. [{sev}] {a.get('title')}")
            detail = a.get("detail") or ""
            # wrap-ish
            while len(detail) > 90:
                lines.append(f"     {detail[:90]}")
                detail = detail[90:]
            if detail:
                lines.append(f"     {detail}")
            items = a.get("items") or []
            for it in items[:6]:
                lines.append(f"     • {it}")
            wallets = a.get("wallets") or []
            # Comprehensive lists (e.g. all >2%) print fully; others cap for brevity
            max_w = 40 if a.get("list_all") or a.get("id") == "holders_over_2_pct" else 8
            # Group by holding priority so e.g. [low priority] is a subtitle
            # above the wallets — not glued next to each address line.
            _pri_order = {
                "critical": 0,
                "high": 1,
                "medium": 2,
                "low": 3,
                "unknown": 4,
                "none": 5,
                "": 6,
            }

            def _wallet_pri(w: dict[str, Any]) -> str:
                pri = (w.get("hold_priority") or "").strip().lower()
                if pri:
                    return pri
                try:
                    pct_f = float(w.get("pct"))
                except (TypeError, ValueError):
                    return "unknown"
                if 2.0 <= pct_f <= 5.0:
                    return "low"
                if pct_f < 10:
                    return "medium"
                if pct_f < 15:
                    return "high"
                if pct_f >= 15:
                    return "critical"
                return "unknown"

            shown = wallets[:max_w]
            groups: dict[str, list[dict[str, Any]]] = {}
            for w in shown:
                groups.setdefault(_wallet_pri(w), []).append(w)
            ordered_keys = sorted(
                groups.keys(), key=lambda k: _pri_order.get(k, 99)
            )
            for pri in ordered_keys:
                # Subtitle above the wallet list for that band
                if pri and pri not in {"none", "unknown"}:
                    lines.append(f"     [{pri} priority]")
                for w in groups[pri]:
                    try:
                        pct_s = f"{float(w.get('pct')):.2f}%"
                    except (TypeError, ValueError):
                        pct_s = "n/a"
                    rank = w.get("rank")
                    rank_s = f"#{rank} " if rank is not None else ""
                    lab = f"  ({w.get('label')})" if w.get("label") else ""
                    lines.append(
                        f"     • {rank_s}holds {pct_s}{lab}  {w.get('wallet') or ''}"
                    )
            if len(wallets) > max_w:
                lines.append(f"     … and {len(wallets) - max_w} more")
            lines.append("")

    if data.get("notes"):
        lines.append(f"  Note: {data['notes']}")
    return "\n".join(lines) + "\n"


def _serial_rugger_hits(
    holders: list[dict[str, Any]],
    meta: dict[str, Any],
) -> dict[str, Any] | None:
    items: list[str] = []

    if meta.get("rugged") is True:
        items.append("Rugcheck flags this mint as rugged=true")

    for r in meta.get("risks") or []:
        name = ""
        desc = ""
        if isinstance(r, dict):
            name = str(r.get("name") or "")
            desc = str(r.get("description") or "")
        else:
            name = str(r)
        blob = f"{name} {desc}"
        if _RUGGER_RISK_RE.search(blob):
            items.append(f"Rugcheck risk: {name or desc[:80]}")

    # Insider-marked top wallets (Rugcheck graph) — often linked to creator networks
    try:
        from .holders import is_known_lp_or_program as _is_lp
    except Exception:  # noqa: BLE001
        def _is_lp(w=None, *, label=None, is_known_program=False):  # type: ignore[misc]
            return bool(is_known_program)

    insider_wallets = [
        h
        for h in holders
        if h.get("insider")
        and not _is_lp(
            h.get("wallet"),
            label=h.get("label"),
            is_known_program=bool(h.get("is_known_program")),
        )
    ]
    if insider_wallets:
        for h in insider_wallets[:5]:
            pct = h.get("pct_supply")
            pct_s = f"{float(pct):.2f}%" if pct is not None else "n/a"
            items.append(
                f"Insider-linked top wallet owns {pct_s}: {h.get('wallet')}"
            )

    # Large insider transfer networks (Rugcheck)
    nets = meta.get("insider_networks") or []
    for net in nets[:3]:
        if not isinstance(net, dict):
            continue
        size = net.get("size") or net.get("activeAccounts") or 0
        try:
            size_i = int(size)
        except (TypeError, ValueError):
            size_i = 0
        if size_i >= 10:
            items.append(
                f"Insider network '{net.get('id') or '?'}' size={size_i} "
                f"(type={net.get('type') or 'n/a'})"
            )

    # Known accounts labeled scammer-like (if Rugcheck provides)
    known = meta.get("known_accounts") or {}
    if isinstance(known, dict):
        for addr, info in list(known.items())[:50]:
            if not isinstance(info, dict):
                continue
            label = f"{info.get('name') or ''} {info.get('type') or ''}"
            if _RUGGER_RISK_RE.search(label):
                items.append(f"Known account flag on {addr[:8]}…: {label.strip()}")

    # Top holders that match known bad labels
    bad_addrs = set()
    if isinstance(known, dict):
        for addr, info in known.items():
            if isinstance(info, dict) and _RUGGER_RISK_RE.search(
                f"{info.get('name') or ''} {info.get('type') or ''}"
            ):
                bad_addrs.add(addr)
    for h in holders:
        w = h.get("wallet") or ""
        if w in bad_addrs and not _is_lp(
            w,
            label=h.get("label"),
            is_known_program=bool(h.get("is_known_program")),
        ):
            pct = h.get("pct_supply")
            try:
                pct_s = f"{float(pct):.2f}%" if pct is not None else "n/a"
            except (TypeError, ValueError):
                pct_s = "n/a"
            items.append(f"Top holder matches flagged known account (owns {pct_s}): {w}")

    if not items:
        return None

    # de-dupe
    seen: set[str] = set()
    uniq: list[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            uniq.append(it)

    return {
        "summary": (
            f"{len(uniq)} rug / serial-rugger related signal(s) from Rugcheck "
            "or insider graphs. Review wallets carefully."
        ),
        "items": uniq[:12],
    }


def summarize_lp_lock_from_rugcheck(data: dict[str, Any]) -> dict[str, Any]:
    """Extract LP lock/unlock summary from full Rugcheck report JSON.

    Only meaningful markets (USD liquidity threshold) count, so dusty pools
    do not spam false \"unlocked\" alerts.
    """
    markets = data.get("markets") or []
    if not isinstance(markets, list) or not markets:
        return {"checked": False}

    unlocked_markets = 0
    locked_pcts: list[float] = []
    unlocked_pcts: list[float] = []
    min_usd = 5_000.0  # ignore dust pools

    for m in markets:
        if not isinstance(m, dict):
            continue
        lp = m.get("lp") or {}
        if not isinstance(lp, dict) or not lp:
            continue
        try:
            usd = float(lp.get("quoteUSD") or 0) + float(lp.get("baseUSD") or 0)
        except (TypeError, ValueError):
            usd = 0.0
        if usd < min_usd:
            continue
        try:
            locked_pct = float(lp.get("lpLockedPct") or 0)
        except (TypeError, ValueError):
            locked_pct = 0.0
        try:
            unlocked = float(lp.get("lpUnlocked") or 0)
            locked = float(lp.get("lpLocked") or 0)
        except (TypeError, ValueError):
            unlocked, locked = 0.0, 0.0
        total = unlocked + locked
        unlocked_pct = (unlocked / total * 100.0) if total > 0 else (
            100.0 - locked_pct if locked_pct else None
        )
        locked_pcts.append(locked_pct)
        if unlocked_pct is not None:
            unlocked_pcts.append(unlocked_pct)
        # Pool counts as unlocked risk if little LP is locked
        if locked_pct < 50.0:
            unlocked_markets += 1

    if not locked_pcts:
        return {"checked": False, "reason": "no_markets_above_liquidity_threshold"}

    max_locked = max(locked_pcts)
    min_locked = min(locked_pcts)
    max_unlocked_pct = max(unlocked_pcts) if unlocked_pcts else None

    # Alert when the *weakest* meaningful pool is poorly locked
    liquidity_unlocked = min_locked < 50.0

    return {
        "checked": True,
        "liquidity_unlocked": bool(liquidity_unlocked),
        "markets_unlocked": unlocked_markets,
        "markets_scanned": len(locked_pcts),
        "lp_locked_pct_max": max_locked,
        "lp_locked_pct_min": min_locked,
        "lp_unlocked_pct_max": max_unlocked_pct,
    }
