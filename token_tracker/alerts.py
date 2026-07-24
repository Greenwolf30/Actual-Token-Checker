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
    socials_dexscreener: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return structured alerts from holder/bundle/Rugcheck + DexScreener socials.

    Pass dex_id / dexes / market so Pump.fun + PumpSwap pools skip LP-unlock
    even when the mint does not end with 'pump'.

    socials_dexscreener: pure DexScreener profile snapshot (before Pump.fun
    enrichment). Prefer this for "socials missing" so pre-bond tokens still
    alert when DexScreener has no links even if pump.fun JSON has them.
    """
    holders_data = holders_data or {}
    bundles_data = bundles_data or {}
    socials = socials or {}
    pumpfun = pumpfun or {}
    alerts: list[dict[str, Any]] = []
    is_pump = skip_lp_unlock_for_pump_pool(
        holders_data,
        pumpfun,
        token_address,
        dex_id=dex_id,
        dexes=dexes,
        market=market,
    )

    # DexScreener-only socials (do not use pump-enriched merged socials)
    dex_socials = socials_dexscreener
    if not isinstance(dex_socials, dict) or not dex_socials:
        if isinstance(socials.get("dexscreener"), dict):
            dex_socials = socials.get("dexscreener")
        else:
            dex_socials = socials

    # Socials + bonded status can still run when holders failed
    social_alert = _dexscreener_socials_alert(dex_socials, pumpfun=pumpfun)
    if social_alert:
        alerts.append(social_alert)

    bonded_alert = _bonded_status_alert(pumpfun, token_address=token_address)
    if bonded_alert:
        alerts.append(bonded_alert)

    if not holders_data.get("ok"):
        if alerts:
            # Return social/bonded alerts when holders unavailable
            return {
                "ok": True,
                "priority_count": sum(1 for a in alerts if a.get("priority") == "top"),
                "alerts": alerts,
                "summary": (
                    f"{len(alerts)} alert(s); holders scan unavailable for full checks."
                ),
                "checks": [
                    "dexscreener_socials_missing",
                    "bonded_status",
                ],
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
    holders_ge_5: list[dict[str, Any]] = []
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
        if pct >= 5.0:
            holders_ge_5.append(row)
    over_2.sort(key=lambda x: -float(x["pct"]))
    holders_ge_5.sort(key=lambda x: -float(x["pct"]))

    # Bundles tab totals (same numbers as Bundles stats bar)
    single_total_pct, single_total_n, single_ge_5 = (
        _single_holders_from_bundles(bundles_data)
    )
    # Single-holder wallet list = Bundles single holders with bag ≥ 5% only.
    # Fall back to non-LP holders ≥5% only when Bundles single list is unavailable.
    if bundles_data.get("ok"):
        single_wallets_ge_5 = list(single_ge_5)
    else:
        single_wallets_ge_5 = list(holders_ge_5)

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
                else ("medium" if any(float(w["pct"]) >= 5 for w in over_2) else "info"),
                "title": f"Wallets holding over 2% ({len(over_2)})",
                "detail": " ".join(lines_detail),
                "wallets": over_2,  # full list; formatter prints all
                "list_all": True,
            }
        )

    # ── 2b) Single holders (Bundles total + list of single holders ≥ 5%) ─
    single_alert = _single_holders_alert(
        whales=single_wallets_ge_5,
        single_total_pct=single_total_pct,
        single_total_n=single_total_n,
    )
    if single_alert:
        alerts.append(single_alert)

    # ── 3) Similar-sized total (Bundles → Similar-sized total) ────────
    # Must use suspect_total_pct / similar_size_total_pct — same as Bundles tab.
    similar_alert = _similar_wallets_alert(bundles_data)
    if similar_alert:
        alerts.append(similar_alert)

    # ── 4) Total bundle % (Bundles → Total % bundles) ─────────────────
    # Same number as Bundles stats bar; show whenever total > 0.
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

    # ── 6) RugWatch flagged wallets — total bag % on this token ───────
    rw_alert = _rugwatch_flagged_alert(holders_data)
    if rw_alert:
        alerts.append(rw_alert)

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
            "similar wallets hold a large %, a wallet is linked to known rug signals, "
            "or RugWatch-flagged wallets hold a measurable bag."
        )

    checks = [
        "holders_over_2_pct",
        "single_holder_over_5",
        "similar_wallets_large",
        "bundle_pct_threshold",
        "dexscreener_socials_missing",
        "bonded_status",
        "serial_rugger_link",
        "rugwatch_flagged",
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
    False if profile payload was checked but empty.
    None if socials were not provided (unknown / not checked).

    Empty dict {} is treated as missing (False) when checked=True, otherwise
    None (unknown). Prefer the pre-enrichment dexscreener snapshot.
    """
    if socials is None:
        return None
    if not isinstance(socials, dict):
        return None

    # Nested pure DexScreener snapshot (when merged socials were passed)
    nested = socials.get("dexscreener")
    if isinstance(nested, dict) and (
        nested.get("checked")
        or nested.get("source") == "dexscreener"
        or "socials" in nested
        or "websites" in nested
    ):
        socials = nested

    checked = bool(socials.get("checked") or socials.get("source") == "dexscreener")
    # No keys at all and not marked checked → unknown
    if not socials and not checked:
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

    has_any = bool(social_urls > 0 or web_urls > 0 or twitter)
    if has_any:
        return True
    # Empty profile: missing when we have a real snapshot/checked flag,
    # or when dict has socials/websites keys (extract_socials shape).
    if checked or "socials" in socials or "websites" in socials:
        return False
    return None


def _bonded_status_alert(
    pumpfun: dict[str, Any] | None,
    *,
    token_address: str | None = None,
) -> dict[str, Any] | None:
    """
    Bonded yes/no for Pump.fun-style mints.

    Bonded: no  = still on bonding curve (not graduated)
    Bonded: yes = graduated off bonding curve
    Bonded: unknown = pump mint without clear pair signal
    Non-pump tokens: no alert.
    """
    pf = pumpfun or {}
    is_mint = pf.get("is_pump_mint")
    if is_mint is None and token_address:
        try:
            from .pumpfun import is_pump_mint

            is_mint = is_pump_mint(token_address)
        except Exception:  # noqa: BLE001
            is_mint = str(token_address or "").lower().endswith("pump")
    if not is_mint:
        return None

    graduated = pf.get("graduated")
    on_bonding = pf.get("on_bonding_curve")
    if graduated is True:
        label = "yes"
    elif graduated is False or on_bonding is True:
        label = "no"
    elif on_bonding is False:
        label = "yes"
    else:
        gl = str(pf.get("graduated_label") or "unknown").strip().lower()
        label = gl if gl in {"yes", "no", "unknown"} else "unknown"

    severity = "medium" if label == "no" else "info"

    return {
        "id": "bonded_status",
        "priority": "top" if label == "no" else "info",
        "severity": severity,
        "title": f"Bonded: {label}",
        "detail": "",
        "bonded": label,
        "on_bonding_curve": bool(on_bonding) if on_bonding is not None else None,
        "graduated": graduated,
        "hide_wallets": True,
    }


def _dexscreener_socials_alert(
    socials: dict[str, Any] | None,
    *,
    pumpfun: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    Alert when DexScreener pair profile has no socials / websites.

    Uses DexScreener-only data (not Pump.fun-enriched links). Still fires for
    pre-bond (bonding curve) tokens when DexScreener has no profile links.
    """
    updated = dexscreener_socials_updated(socials)
    if updated is not False:
        return None

    pf = pumpfun or {}
    bonded = None
    if pf.get("graduated") is True:
        bonded = "yes"
    elif pf.get("graduated") is False or pf.get("on_bonding_curve") is True:
        bonded = "no"
    elif pf.get("is_pump_mint"):
        bonded = str(pf.get("graduated_label") or "unknown").lower()
        if bonded not in {"yes", "no", "unknown"}:
            bonded = "unknown"

    title = "DexScreener socials missing"
    if bonded in {"yes", "no", "unknown"}:
        title = f"DexScreener socials missing · Bonded: {bonded}"

    return {
        "id": "dexscreener_socials_missing",
        "priority": "top",
        "severity": "medium",
        "title": title,
        "detail": "",  # compact Alerts UI — no notes
        "bonded": bonded,
        "hide_wallets": True,
    }


def _single_holders_from_bundles(
    bundles_data: dict[str, Any] | None,
) -> tuple[float | None, int | None, list[dict[str, Any]]]:
    """
    Single-holders totals + wallets over 5% from Bundles tab data.

    Returns (single_holders_total_pct, wallet_count, whales_over_5).
    Uses the same summary fields as Bundles → Single holders.
    """
    bundles_data = bundles_data or {}
    if not bundles_data.get("ok"):
        return None, None, []
    summary = bundles_data.get("summary") or {}
    raw_pct = summary.get("single_holders_total_pct")
    raw_n = summary.get("single_holders_wallet_count")
    total_pct: float | None
    total_n: int | None
    try:
        total_pct = float(raw_pct) if raw_pct is not None else None
    except (TypeError, ValueError):
        total_pct = None
    try:
        total_n = int(raw_n) if raw_n is not None else None
    except (TypeError, ValueError):
        total_n = None

    try:
        from .holders import holding_priority_label
    except Exception:  # noqa: BLE001

        def holding_priority_label(pct: float | None) -> str:  # type: ignore[misc]
            if pct is None:
                return "unknown"
            if pct < 2:
                return "none"
            if pct <= 5:
                return "low"
            if pct < 10:
                return "medium"
            if pct < 15:
                return "high"
            return "critical"

    # Single-holder wallets with bag ≥ 5% (from Bundles single_holders list)
    whales: list[dict[str, Any]] = []
    for h in bundles_data.get("single_holders") or []:
        if not isinstance(h, dict):
            continue
        try:
            pct = (
                float(h["pct_supply"])
                if h.get("pct_supply") is not None
                else (
                    float(h["pct"])
                    if h.get("pct") is not None
                    else None
                )
            )
        except (TypeError, ValueError):
            pct = None
        if pct is None or pct < 5.0:
            continue
        whales.append(
            {
                "wallet": h.get("wallet") or h.get("owner"),
                "pct": pct,
                "rank": h.get("rank"),
                "label": h.get("label"),
                "insider": bool(h.get("insider")),
                "hold_priority": holding_priority_label(pct),
            }
        )
    whales.sort(key=lambda x: -float(x["pct"]))

    # If summary total missing, recompute from full Bundles single_holders set
    if total_pct is None:
        try:
            from .bundles import _single_holders_total  # type: ignore[attr-defined]

            total_pct, total_n = _single_holders_total(bundles_data)
        except Exception:  # noqa: BLE001
            # Last resort: sum only ≥5% rows we already have
            if whales:
                try:
                    total_pct = sum(float(w["pct"]) for w in whales)
                    total_n = len(whales)
                except (TypeError, ValueError):
                    pass

    return total_pct, total_n, whales


def _similar_total_from_bundles(
    bundles_data: dict[str, Any] | None,
) -> tuple[float | None, int | None]:
    """
    Similar-sized total % + wallet count — same fields as Bundles tab.

    Prefer suspect_total_pct (similar-size ∪ Rugcheck insiders), then
    similar_size_total_pct, then recompute from similar_size_groups.
    """
    bundles_data = bundles_data or {}
    if not bundles_data.get("ok"):
        return None, None
    summary = bundles_data.get("summary") or {}

    # Same preference order as format_bundles_text / Bundles stats bar
    raw_pct = summary.get("suspect_total_pct")
    if raw_pct is None:
        raw_pct = summary.get("similar_size_total_pct")
    raw_n = summary.get("suspect_wallet_count")
    if raw_n is None:
        raw_n = summary.get("similar_size_wallet_count")

    total_pct: float | None
    total_n: int | None
    try:
        total_pct = float(raw_pct) if raw_pct is not None else None
    except (TypeError, ValueError):
        total_pct = None
    try:
        total_n = int(raw_n) if raw_n is not None else None
    except (TypeError, ValueError):
        total_n = None

    if total_pct is None:
        groups = list(bundles_data.get("similar_size_groups") or [])
        if groups:
            try:
                from .bundles import _similar_size_total_percent  # type: ignore[attr-defined]

                total_pct, total_n = _similar_size_total_percent(groups)
            except Exception:  # noqa: BLE001
                # Fallback: unique wallets × avg per group (no double-count)
                seen: set[str] = set()
                total = 0.0
                for g in groups:
                    try:
                        avg = (
                            float(g.get("avg_pct"))
                            if g.get("avg_pct") is not None
                            else None
                        )
                    except (TypeError, ValueError):
                        avg = None
                    if avg is None:
                        continue
                    for w in g.get("wallets") or []:
                        addr = str(w or "").strip()
                        if not addr or addr in seen:
                            continue
                        seen.add(addr)
                        total += avg
                if seen:
                    total_pct = min(100.0, round(total, 4))
                    total_n = len(seen)

    if total_pct is not None and total_pct <= 0:
        return None, total_n
    return total_pct, total_n


def _single_holders_alert(
    *,
    whales: list[dict[str, Any]],
    single_total_pct: float | None,
    single_total_n: int | None,
) -> dict[str, Any] | None:
    """
    Single holders alert using Bundles single_holders_total_pct only.

    Shows the total % (same as Bundles → Single holders). Does NOT list
    individual wallets. UI should not apply hold-% color bands to this total.
    """
    # Count ≥5% single holders for severity only (never listed in Alerts)
    ge5_n = 0
    top_pct = 0.0
    for w in whales or []:
        try:
            p = float(w.get("pct"))
        except (TypeError, ValueError):
            continue
        if p >= 5.0:
            ge5_n += 1
            if p > top_pct:
                top_pct = p

    has_total = single_total_pct is not None and float(single_total_pct) > 0
    if not has_total and ge5_n <= 0:
        return None

    if top_pct >= 15 or (
        has_total and single_total_pct is not None and float(single_total_pct) >= 15
    ):
        severity = "high"
    elif top_pct >= 5 or (
        has_total and single_total_pct is not None and float(single_total_pct) >= 5
    ):
        severity = "medium"
    else:
        severity = "info"

    if has_total and single_total_pct is not None:
        title = f"Single holders total {float(single_total_pct):.2f}%"
    else:
        single_total_pct = top_pct if top_pct > 0 else None
        if single_total_pct is None:
            return None
        title = f"Single holders total {float(single_total_pct):.2f}%"

    return {
        "id": "single_holder_over_5",
        "priority": "top",
        "severity": severity,
        "title": title,
        "detail": "",  # no notes / no duplicate % on UI
        "wallets": [],
        "list_all": False,
        "single_holders_total_pct": single_total_pct,
        "single_holders_wallet_count": single_total_n,
        "hide_wallets": True,
        "no_pct_color": True,
    }


def _similar_wallets_alert(
    bundles_data: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Similar wallets alert using Bundles Similar-sized total %.

    Uses suspect_total_pct / similar_size_total_pct (same as Bundles stats bar),
    not just avg×n of one group.
    """
    bundles_data = bundles_data or {}
    if not bundles_data.get("ok"):
        return None

    sim_pct, sim_n = _similar_total_from_bundles(bundles_data)
    groups = list(bundles_data.get("similar_size_groups") or [])
    # All similar-sized groups with a usable % (for Alerts group breakdown)
    group_rows: list[dict[str, Any]] = []
    for g in groups:
        if not isinstance(g, dict):
            continue
        try:
            n = int(g.get("count") or len(g.get("wallets") or []) or 0)
            avg = float(g.get("avg_pct")) if g.get("avg_pct") is not None else None
        except (TypeError, ValueError):
            continue
        if avg is None or n < 2:
            continue
        combined = avg * n
        group_rows.append({**g, "combined_pct_est": combined})
    group_rows.sort(key=lambda x: -float(x.get("combined_pct_est") or 0))

    has_total = sim_pct is not None and float(sim_pct) > 0
    if not has_total and not group_rows:
        return None

    # Severity from Bundles similar total when available, else largest group
    score = float(sim_pct) if has_total and sim_pct is not None else 0.0
    if not score and group_rows:
        score = float(group_rows[0].get("combined_pct_est") or 0)
    if score >= 15:
        severity = "high"
    elif score >= 5:
        severity = "medium"
    else:
        severity = "info"

    if has_total and sim_pct is not None:
        title = f"Similar-sized total {float(sim_pct):.2f}%"
    else:
        g0 = group_rows[0]
        title = (
            f"Similar-sized total "
            f"{float(g0.get('combined_pct_est') or 0):.2f}%"
        )
        if sim_pct is None:
            sim_pct = float(g0.get("combined_pct_est") or 0)

    return {
        "id": "similar_wallets_large",
        "priority": "top",
        "severity": severity,
        "title": title,
        "detail": "",  # no notes; groups rendered as % lines only
        "groups": group_rows[:12],
        "similar_size_total_pct": sim_pct,
        "similar_size_wallet_count": sim_n,
        "suspect_total_pct": sim_pct,
        "suspect_wallet_count": sim_n,
        "hide_wallets": True,
        "color_pct": True,
    }


def _total_bundle_from_bundles(
    bundles_data: dict[str, Any] | None,
) -> tuple[float | None, int | None]:
    """
    Total bundle % + unique wallet count — same fields as Bundles tab.

    Prefer summary.total_bundle_pct (Total % bundles).
    """
    bundles_data = bundles_data or {}
    if not bundles_data.get("ok"):
        return None, None
    summary = bundles_data.get("summary") or {}
    raw = summary.get("total_bundle_pct")
    if raw is None:
        raw = summary.get("estimated_bundle_pct") or summary.get("bundle_pct")
    if raw is None:
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
        return None, None
    try:
        pct = float(raw)
    except (TypeError, ValueError):
        return None, None
    if pct <= 0:
        return None, None

    flagged_n = summary.get("flagged_wallets")
    if flagged_n is None:
        flagged_n = summary.get("total_bundle_unique_wallets")
    try:
        n = int(flagged_n) if flagged_n is not None else None
    except (TypeError, ValueError):
        n = None
    return pct, n


def _bundle_pct_alert(bundles_data: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    Alert from Bundles tab total_bundle_pct (same number as Total % bundles).

    Shows whenever total > 0 (same pattern as Similar-sized total).
    Severity tiers:
      > 0  and < 5%  → info
      5–20%            → low to moderate
      > 20%  and ≤ 27% → high possibility of rug
      > 27%  and < 50% → danger, most likely rug
      ≥ 50%             → rug imminent
    """
    pct, flagged_n = _total_bundle_from_bundles(bundles_data)
    if pct is None:
        return None

    # One clean title line — Total bundle % only (hold-% color bands in UI)
    def _payload(
        *,
        aid: str,
        severity: str,
        threshold: int,
    ) -> dict[str, Any]:
        return {
            "id": aid,
            "priority": "top",
            "severity": severity,
            "title": f"Total bundle {pct:.2f}%",
            "detail": "",  # no notes / no duplicate % on UI
            "bundle_pct": pct,
            "total_bundle_pct": pct,
            "total_bundle_unique_wallets": flagged_n,
            "threshold": threshold,
            "hide_wallets": True,
            "no_pct_color": False,
            "color_pct": True,
        }

    if pct >= 50.0:
        return _payload(aid="bundle_pct_50", severity="critical", threshold=50)
    if pct > 27.0:
        return _payload(aid="bundle_pct_27", severity="critical", threshold=27)
    if pct > 20.0:
        return _payload(aid="bundle_pct_20", severity="high", threshold=20)
    if pct >= 5.0:
        return _payload(aid="bundle_pct_5_20", severity="medium", threshold=5)
    return _payload(aid="bundle_pct_under_5", severity="info", threshold=0)


def format_alerts_text(data: dict[str, Any]) -> str:
    """
    Format Alerts tab. Active alerts print as usual; any check with no
    real-time hit (0 / missing) gets a “will show here” placeholder.
    """
    # Section markers (── TITLE ──) are colored dim-green in the UI.
    lines = [
        "=" * 72,
        "── ALERTS ──",
        "  Things to watch out for immediately",
        "=" * 72,
        "",
    ]
    if not data.get("ok") and not data.get("alerts"):
        lines.append(f"  {data.get('summary') or data.get('notes') or 'unavailable'}")
        lines.append("")
        lines.append("  Alerts will show here after a full Analyze.")
        return "\n".join(lines) + "\n"

    n = int(data.get("priority_count") or 0)
    if n > 0:
        lines.append(f"  Top-priority warnings: {n}")
    else:
        lines.append(
            "  Top-priority warnings will show here if value returns True"
        )
    if data.get("summary"):
        lines.append(f"  {data.get('summary')}")
    lines.append("")

    alerts = [a for a in (data.get("alerts") or []) if isinstance(a, dict)]
    by_id: dict[str, dict[str, Any]] = {}
    for a in alerts:
        aid = str(a.get("id") or "")
        if aid and aid not in by_id:
            by_id[aid] = a
        # bundle thresholds share one placeholder bucket
        if aid.startswith("bundle_pct"):
            by_id.setdefault("bundle_pct_threshold", a)

    # Labels for zero/empty → “will show here if value returns True”
    placeholder_slots: list[tuple[str, str, list[str]]] = [
        (
            "liquidity_unlocked",
            "Liquidity unlocked will show here if value returns True",
            ["liquidity_unlocked"],
        ),
        (
            "holders_over_2_pct",
            "Wallets holding over 2% will show here if value returns True",
            ["holders_over_2_pct"],
        ),
        (
            "single_holder_over_5",
            "Single holder over 5% will show here if value returns True",
            ["single_holder_over_5"],
        ),
        (
            "similar_wallets_large",
            "Similar wallets large hold % will show here if value returns True",
            ["similar_wallets_large"],
        ),
        (
            "bundle_pct_threshold",
            "Bundle share % will show here if value returns True",
            [
                "bundle_pct_threshold",
                "bundle_pct_under_5",
                "bundle_pct_5_20",
                "bundle_pct_20",
                "bundle_pct_27",
                "bundle_pct_50",
            ],
        ),
        (
            "dexscreener_socials_missing",
            "DexScreener socials missing will show here if value returns True",
            ["dexscreener_socials_missing"],
        ),
        (
            "bonded_status",
            "Bonded yes/no will show here if value returns True",
            ["bonded_status"],
        ),
        (
            "serial_rugger_link",
            "Serial-rugger / rug signals will show here if value returns True",
            ["serial_rugger_link"],
        ),
        (
            "rugwatch_flagged",
            "Flagged wallets hold % will show here if value returns True",
            ["rugwatch_flagged"],
        ),
    ]

    checks = set(data.get("checks") or [])
    notes = str(data.get("notes") or "")
    pump_skip_lp = "Pump.fun" in notes or "PumpSwap" in notes

    # Slot keys that stay on one placeholder line when active (no full alert block).
    # Placeholder already ends with "if value returns True" — do not append " · true".
    # NOTE: dexscreener_socials_missing is NOT here — it must render as a real alert
    # (was stuck on the placeholder line even when True).
    _append_true_keys = {
        "serial_rugger_link",
        "rugwatch_flagged",
    }

    def _render_alert(a: dict[str, Any], index: int) -> None:
        sev = (a.get("severity") or "info").upper()
        title = str(a.get("title") or "")
        lines.append(f"  {index}. [{sev}] {title}")
        aid = str(a.get("id") or "")
        # Compact totals / status: title only (no notes, no duplicate total %)
        if (
            aid
            in {
                "single_holder_over_5",
                "dexscreener_socials_missing",
                "bonded_status",
            }
            or aid.startswith("bundle_pct")
        ):
            lines.append("")
            return
        # Similar-sized: total title + each group % (no notes / no total re-print)
        if aid == "similar_wallets_large":
            for g in (a.get("groups") or [])[:12]:
                try:
                    n = int(g.get("count") or len(g.get("wallets") or []) or 0)
                    avg = float(g.get("avg_pct") or 0)
                    comb = float(g.get("combined_pct_est") or (avg * n))
                    lines.append(
                        f"     · {n} wallets ~{avg:.2f}% each (≈ {comb:.2f}%)"
                    )
                except (TypeError, ValueError):
                    continue
            lines.append("")
            return
        detail = a.get("detail") or ""
        while len(detail) > 90:
            lines.append(f"     {detail[:90]}")
            detail = detail[90:]
        if detail:
            lines.append(f"     {detail}")
        for it in (a.get("items") or [])[:6]:
            lines.append(f"     • {it}")
        if a.get("hide_wallets") or aid == "rugwatch_flagged":
            ftp = a.get("flagged_total_pct")
            if ftp is not None:
                try:
                    fval = float(ftp)
                    if fval > 0:
                        lines.append(f"     Flagged wallets hold {fval:.2f}% total")
                    else:
                        lines.append(
                            "     Flagged wallets hold % will show here "
                            "if value returns True"
                        )
                except (TypeError, ValueError):
                    lines.append(
                        "     Flagged wallets hold % will show here "
                        "if value returns True"
                    )
            lines.append("")
            return
        wallets = a.get("wallets") or []
        if not wallets and aid == "holders_over_2_pct":
            lines.append(
                "     Wallet list will show here if value returns True"
            )
            lines.append("")
            return
        max_w = 40 if a.get("list_all") or aid == "holders_over_2_pct" else 8
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
        for pri in sorted(groups.keys(), key=lambda k: _pri_order.get(k, 99)):
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

    lines.append("── ALERT SLOTS ──")
    lines.append("  " + "-" * 40)
    idx = 1
    for _key, placeholder, id_aliases in placeholder_slots:
        hit = None
        for aid in id_aliases:
            if aid in by_id:
                hit = by_id[aid]
                break
        # LP unlock not in checks on pump pools
        if _key == "liquidity_unlocked" and (
            "liquidity_unlocked" not in checks or pump_skip_lp
        ):
            if not hit:
                lines.append(
                    f"  · Liquidity unlocked will show here if value returns True"
                    f"{' (skipped on Pump.fun / PumpSwap)' if pump_skip_lp else ''}"
                )
                continue
        if hit and _key in _append_true_keys:
            # One "True" only (in "if value returns True"); optional % for flagged
            line = f"  · {placeholder}"
            if _key == "rugwatch_flagged":
                ftp = hit.get("flagged_total_pct")
                try:
                    if ftp is not None and float(ftp) > 0:
                        line = f"  · {placeholder} · {float(ftp):.2f}%"
                except (TypeError, ValueError):
                    pass
            lines.append(line)
            idx += 1
        elif hit:
            _render_alert(hit, idx)
            idx += 1
        else:
            lines.append(f"  · {placeholder}")

    # Any extra alerts not covered by slots
    covered = set()
    for _, _, aliases in placeholder_slots:
        covered.update(aliases)
    for a in alerts:
        aid = str(a.get("id") or "")
        if aid and aid not in covered and not aid.startswith("bundle_pct"):
            _render_alert(a, idx)
            idx += 1

    lines.append("")
    # No footer notes on Alerts UI
    return "\n".join(lines) + "\n"


def _rugwatch_flagged_alert(holders_data: dict[str, Any]) -> dict[str, Any] | None:
    """
    Alert when RugWatch-flagged wallets hold a known bag on this token.

    Alerts shows ONLY the combined holding % (color-banded in the UI).
    Individual wallets stay on the Holders → Flagged wallets section — not here.
    """
    rw = holders_data.get("rugwatch_flagged") or {}
    if not rw or rw.get("skipped") or rw.get("enabled") is False:
        return None
    # Prefer precomputed totals from holders scan (same numbers as Holders tab)
    total = holders_data.get("flagged_hold_pct")
    with_pct = holders_data.get("flagged_with_pct_count")
    try:
        from .holders import collect_flagged_holder_pcts, holding_priority_label
    except Exception:  # noqa: BLE001
        holding_priority_label = None  # type: ignore[assignment]
        collect_flagged_holder_pcts = None  # type: ignore[assignment]

    if total is None or with_pct is None:
        if not rw.get("ok"):
            return None
        if collect_flagged_holder_pcts is None:
            return None
        stats = collect_flagged_holder_pcts(
            rw, list(holders_data.get("holders") or [])
        )
        total = float(stats.get("total_pct") or 0)
        with_pct = int(stats.get("with_pct_count") or 0)
    else:
        try:
            total = float(total or 0)
        except (TypeError, ValueError):
            total = 0.0
        try:
            with_pct = int(with_pct or 0)
        except (TypeError, ValueError):
            with_pct = 0

    # Also accept values stashed on rugwatch_flagged
    if with_pct <= 0:
        try:
            with_pct = int(rw.get("flagged_with_pct_count") or 0)
        except (TypeError, ValueError):
            pass
    if total <= 0:
        try:
            total = float(rw.get("flagged_total_pct") or 0)
        except (TypeError, ValueError):
            total = 0.0

    match_n = 0
    try:
        match_n = int(rw.get("match_count") or 0)
    except (TypeError, ValueError):
        match_n = 0

    # Need at least one flagged wallet with a known bag % on this token
    if with_pct <= 0 or total <= 0:
        return None

    if holding_priority_label is not None:
        total_pri = holding_priority_label(total)
    else:
        total_pri = "unknown"
    if total >= 15:
        severity = "critical"
    elif total >= 10:
        severity = "high"
    elif total > 5:
        severity = "medium"
    else:
        severity = "info"

    # Title carries the % so the Alerts color scheme paints it (same as Holders).
    # No wallet list — addresses live under Holders → Flagged wallets.
    return {
        "id": "rugwatch_flagged",
        "priority": "top",
        "severity": severity,
        "title": f"Flagged wallets hold {total:.2f}% of supply",
        "detail": (
            f"Combined bag of {with_pct} flagged wallet(s) on this token: {total:.2f}%"
            + (
                f" ({total_pri} priority)."
                if total_pri in {"low", "medium", "high", "critical"}
                else "."
            )
            + " See Holders → Flagged wallets for addresses. LP/program excluded."
        ),
        "wallets": [],  # never list addresses in Alerts
        "items": [],
        "list_all": False,
        "flagged_total_pct": total,
        "flagged_wallet_count": with_pct,
        "hide_wallets": True,
    }


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
