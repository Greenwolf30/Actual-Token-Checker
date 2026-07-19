"""
Fuse Helius + Rugcheck + Birdeye + Jito-style signals into one comprehensive
bundle report for the Bundles tab.
"""

from __future__ import annotations

from typing import Any

from . import bundles as bun
from . import bundle_sources as src


def comprehensive_bundle_check(
    mint: str,
    *,
    pair_address: str | None = None,
    chain_id: str = "solana",
) -> dict[str, Any]:
    """
    Full multi-API bundle check.

    Returns same shape as analyze_bundles() plus fusion fields:
      sources_used, source_reports, fusion_signals, comprehensive_score
    """
    if (chain_id or "").lower() not in {"solana", "sol", ""}:
        return bun._empty("Comprehensive bundle check is Solana-only.")  # type: ignore[attr-defined]

    raw = src.fetch_all_bundle_sources(mint, pair_address=pair_address)
    sources = raw.get("sources") or {}

    helius = sources.get("helius") or {}
    rug = sources.get("rugcheck") or {}
    bird = sources.get("birdeye") or {}
    jito_style = sources.get("jito_style") or {}
    jito_eng = sources.get("jito_engine") or {}

    sources_used: list[str] = []
    if helius.get("ok"):
        sources_used.append("helius")
    if rug.get("ok"):
        sources_used.append("rugcheck")
    if bird.get("ok") and not bird.get("skipped"):
        sources_used.append("birdeye")
    if jito_style.get("ok"):
        sources_used.append("jito_style_helius_slots")
    if jito_eng.get("ok"):
        sources_used.append("jito_engine")

    # Build synthetic holders_data for heuristic layer from Helius (primary)
    # enriched with Rugcheck insiders + Birdeye tags
    holders_data = _merge_holder_layers(helius, rug, bird)
    base = bun.analyze_bundles(holders_data)

    fusion_signals: list[dict[str, Any]] = []
    extra_score = 0

    # Rugcheck-specific
    if rug.get("ok"):
        if rug.get("insider_count"):
            fusion_signals.append(
                {
                    "id": "rugcheck_insiders",
                    "provider": "rugcheck",
                    "severity": "high",
                    "title": "Rugcheck insider accounts",
                    "detail": f"{rug.get('insider_count')} top account(s) marked insider.",
                }
            )
            extra_score += min(20, 6 * int(rug.get("insider_count") or 0))
        if rug.get("rugged"):
            fusion_signals.append(
                {
                    "id": "rugcheck_rugged",
                    "provider": "rugcheck",
                    "severity": "critical",
                    "title": "Rugcheck rugged flag",
                    "detail": "Rugcheck marks this mint as rugged=true.",
                }
            )
            extra_score += 25
        for r in (rug.get("risks") or [])[:5]:
            name = (r.get("name") if isinstance(r, dict) else str(r)) or ""
            if any(
                k in name.lower()
                for k in ("bundle", "sniper", "insider", "scam", "rug", "dev")
            ):
                fusion_signals.append(
                    {
                        "id": "rugcheck_risk",
                        "provider": "rugcheck",
                        "severity": "medium",
                        "title": f"Rugcheck risk: {name}",
                        "detail": (r.get("description") if isinstance(r, dict) else "")
                        or name,
                    }
                )
                extra_score += 4

    # Birdeye holder profile tags
    if bird.get("ok"):
        prof = (bird.get("layers") or {}).get("holder_profile") or {}
        if isinstance(prof, dict):
            tags = prof.get("holderSummary") or prof.get("summary") or prof
            # Flexible parse for bundler/sniper percentages
            for key, label in (
                ("bundler", "Birdeye bundler holders"),
                ("sniper", "Birdeye sniper holders"),
                ("insider", "Birdeye insider holders"),
                ("dev", "Birdeye dev holdings"),
            ):
                val = _dig_tag_pct(tags, key)
                if val is not None and val > 0:
                    fusion_signals.append(
                        {
                            "id": f"birdeye_{key}",
                            "provider": "birdeye",
                            "severity": "high" if val >= 10 else "medium",
                            "title": label,
                            "detail": f"~{val:.2f}% supply tagged as {key} (Birdeye holder profile).",
                        }
                    )
                    extra_score += min(18, int(val / 2) + 4)

        sec = (bird.get("layers") or {}).get("security") or {}
        if isinstance(sec, dict):
            # Common security flags
            for flag, title in (
                ("isMintable", "Mint still enabled (Birdeye)"),
                ("isFreezable", "Freeze authority present (Birdeye)"),
                ("ownerBalance", "Owner still holds supply (Birdeye)"),
            ):
                if sec.get(flag) in (True, "true", 1) or (
                    flag == "ownerBalance" and _safe_float(sec.get(flag), 0) > 0
                ):
                    fusion_signals.append(
                        {
                            "id": f"birdeye_sec_{flag}",
                            "provider": "birdeye",
                            "severity": "medium",
                            "title": title,
                            "detail": f"Security field {flag}={sec.get(flag)}",
                        }
                    )
                    extra_score += 5

        traders = (bird.get("layers") or {}).get("top_traders") or []
        if isinstance(traders, list) and len(traders) >= 5:
            fusion_signals.append(
                {
                    "id": "birdeye_top_traders",
                    "provider": "birdeye",
                    "severity": "info",
                    "title": "Birdeye top traders loaded",
                    "detail": f"{len(traders)} top traders (24h) available for cross-check.",
                }
            )

    # Jito-style same-slot groups
    groups = jito_style.get("same_slot_groups") or []
    if jito_style.get("ok") and groups:
        best = max(groups, key=lambda g: int(g.get("unique_buyers") or 0))
        fusion_signals.append(
            {
                "id": "jito_style_same_slot",
                "provider": "jito_style",
                "severity": "high",
                "title": "Same-slot multi-wallet buys (Jito-style)",
                "detail": (
                    f"{best.get('unique_buyers')} wallets across {best.get('tx_count')} txs "
                    f"in slot {best.get('slot')} — atomic/MEV-style snipe pattern "
                    f"(via Helius tx history; {len(groups)} slot group(s) total)."
                ),
            }
        )
        extra_score += min(30, 10 + int(best.get("unique_buyers") or 0) * 3)
        # Add wallets to suspects
        if base.get("ok"):
            suspects = list(base.get("suspect_wallets") or [])
            existing = {s.get("wallet") for s in suspects}
            for w in best.get("wallets") or []:
                if w not in existing:
                    suspects.append(
                        {
                            "wallet": w,
                            "reasons": ["same-slot multi-buy (Jito-style)"],
                            "pct_supply": None,
                        }
                    )
            base = dict(base)
            base["suspect_wallets"] = suspects[:25]
            # Refresh suspect total % after fusion adds wallets
            spct, sn = bun._suspect_total_percent(suspects[:25])  # type: ignore[attr-defined]
            s0 = dict(base.get("summary") or {})
            s0["suspect_total_pct"] = spct
            s0["suspect_wallet_count"] = sn
            base["summary"] = s0

    if jito_eng.get("ok"):
        fusion_signals.append(
            {
                "id": "jito_engine_online",
                "provider": "jito_engine",
                "severity": "info",
                "title": "Jito block-engine online",
                "detail": jito_eng.get("notes") or "Tip accounts reachable.",
            }
        )

    # Merge scores
    if base.get("ok"):
        s = dict(base.get("summary") or {})
        old = int(s.get("bundle_risk_score") or 0)
        new_score = max(0, min(100, old + extra_score))
        s["bundle_risk_score"] = new_score
        s["bundle_risk"] = _risk_label(new_score)
        s["sources_used"] = sources_used
        s["fusion_signal_count"] = len(fusion_signals)
        base = dict(base)
        base["summary"] = s
        base["source"] = "+".join(sources_used) or "none"
        base["method"] = "comprehensive_helius_rugcheck_birdeye_jito"
        base["fusion_signals"] = fusion_signals
        base["source_reports"] = {
            "helius_ok": bool(helius.get("ok")),
            "rugcheck_ok": bool(rug.get("ok")),
            "birdeye_ok": bool(bird.get("ok") and not bird.get("skipped")),
            "birdeye_skipped": bool(bird.get("skipped")),
            "jito_style_ok": bool(jito_style.get("ok")),
            "jito_engine_ok": bool(jito_eng.get("ok")),
            "jito_style_groups": len(groups),
            "errors": {
                k: (sources.get(k) or {}).get("error")
                for k in ("helius", "rugcheck", "birdeye", "jito_style", "jito_engine")
                if (sources.get(k) or {}).get("error")
            },
        }
        # Merge fusion signals into display signals
        signals = list(base.get("signals") or [])
        for fs in fusion_signals:
            if fs.get("severity") == "info":
                continue
            signals.append(
                {
                    "id": fs.get("id"),
                    "severity": fs.get("severity"),
                    "title": fs.get("title"),
                    "detail": f"[{fs.get('provider')}] {fs.get('detail')}",
                }
            )
        base["signals"] = signals
        base["notes"] = (
            "Comprehensive bundle check: Helius top holders + Rugcheck insiders/risks + "
            "Birdeye (if key) security/holder tags + Jito-style same-slot multi-buys "
            "(via Helius txs). Jito public API does not dump historical snipers per mint. "
            + (base.get("notes") or "")
        ).strip()
        return base

    # If heuristics failed but we have some fusion signals, still return a report
    if fusion_signals or sources_used:
        return {
            "ok": True,
            "source": "+".join(sources_used) or "partial",
            "method": "comprehensive_partial",
            "summary": {
                "bundle_risk_score": min(100, extra_score),
                "bundle_risk": _risk_label(min(100, extra_score)),
                "total_bundle_pct": None,
                "flagged_wallets": 0,
                "sources_used": sources_used,
                "fusion_signal_count": len(fusion_signals),
                "multi_account_clusters": 0,
                "similar_size_groups": 0,
                "insider_accounts": rug.get("insider_count") or 0,
            },
            "signals": [
                {
                    "id": fs.get("id"),
                    "severity": fs.get("severity"),
                    "title": fs.get("title"),
                    "detail": f"[{fs.get('provider')}] {fs.get('detail')}",
                }
                for fs in fusion_signals
            ],
            "fusion_signals": fusion_signals,
            "clusters": [],
            "similar_size_groups": [],
            "insider_wallets": [],
            "suspect_wallets": [],
            "source_reports": {
                "helius_ok": bool(helius.get("ok")),
                "rugcheck_ok": bool(rug.get("ok")),
                "birdeye_ok": bool(bird.get("ok") and not bird.get("skipped")),
                "errors": {
                    k: (sources.get(k) or {}).get("error")
                    for k in ("helius", "rugcheck", "birdeye", "jito_style")
                    if (sources.get(k) or {}).get("error")
                },
            },
            "notes": (
                "Partial comprehensive check — Helius holders unavailable or empty; "
                "showing provider fusion signals only."
            ),
        }

    err_parts = [
        f"Helius: {helius.get('error')}",
        f"Rugcheck: {rug.get('error')}",
        f"Birdeye: {bird.get('error')}",
    ]
    return {
        "ok": False,
        "error": "All bundle sources failed. " + " · ".join(err_parts),
        "summary": {"total_bundle_pct": None, "flagged_wallets": 0, "sources_used": []},
        "signals": [],
        "clusters": [],
        "similar_size_groups": [],
        "insider_wallets": [],
        "suspect_wallets": [],
        "source_reports": raw.get("sources"),
        "notes": "Need HELIUS_API_KEY at minimum; BIRDEYE_API_KEY optional for more layers.",
    }


def _merge_holder_layers(
    helius: dict[str, Any],
    rug: dict[str, Any],
    bird: dict[str, Any],
) -> dict[str, Any]:
    """Prefer Helius holders; stamp Rugcheck insider flags by wallet."""
    if helius.get("ok") and helius.get("holders"):
        holders = [dict(h) for h in helius.get("holders") or []]
        insider_w = {
            h.get("wallet")
            for h in (rug.get("holders") or [])
            if h.get("insider") and h.get("wallet")
        }
        for h in holders:
            if h.get("wallet") in insider_w:
                h["insider"] = True
                lab = h.get("label") or ""
                if "insider" not in lab.lower():
                    h["label"] = (lab + " · " if lab else "") + "insider (Rugcheck)"
        # Birdeye holder % overlay if Helius missing pct
        bird_holders = (bird.get("layers") or {}).get("holders") or []
        bird_pct: dict[str, float] = {}
        for bh in bird_holders if isinstance(bird_holders, list) else []:
            if not isinstance(bh, dict):
                continue
            w = bh.get("owner") or bh.get("address") or bh.get("wallet") or ""
            pct = bh.get("percentage") or bh.get("ui_amount") or bh.get("pct")
            try:
                if w and pct is not None:
                    bird_pct[w] = float(pct)
            except (TypeError, ValueError):
                pass
        for h in holders:
            if h.get("pct_supply") is None and h.get("wallet") in bird_pct:
                h["pct_supply"] = bird_pct[h["wallet"]]

        return {
            "ok": True,
            "source": "helius+enrich",
            "holders": holders,
            "owner_clusters": helius.get("owner_clusters") or [],
            "summary": helius.get("summary") or {},
            "meta": {
                **(helius.get("meta") or {}),
                "rugged": rug.get("rugged"),
                "risks": rug.get("risks") or [],
                "insider_networks": rug.get("insider_networks") or [],
            },
            "flags": [],
        }

    # Fallback: Rugcheck holders only
    if rug.get("ok") and rug.get("holders"):
        holders = []
        for h in rug.get("holders") or []:
            holders.append(
                {
                    "rank": h.get("rank"),
                    "wallet": h.get("wallet"),
                    "pct_supply": h.get("pct_supply"),
                    "balance": None,
                    "label": h.get("label"),
                    "is_known_program": False,
                    "insider": bool(h.get("insider")),
                    "token_account": "",
                }
            )
        return {
            "ok": True,
            "source": "rugcheck_fallback",
            "holders": holders,
            "owner_clusters": [],
            "summary": {
                "accounts_returned": len(holders),
                "unique_wallets_in_top": len({h["wallet"] for h in holders}),
                "top1_pct": holders[0].get("pct_supply") if holders else None,
                "top10_pct": sum(float(h.get("pct_supply") or 0) for h in holders[:10]) or None,
                "top10_pct_excluding_known_programs": sum(
                    float(h.get("pct_supply") or 0) for h in holders[:10]
                )
                or None,
                "concentration_risk": "elevated",
            },
            "meta": {"rugged": rug.get("rugged"), "risks": rug.get("risks") or []},
            "flags": [],
        }

    return {
        "ok": False,
        "error": helius.get("error") or rug.get("error") or "No holder layers",
        "holders": [],
        "summary": {},
    }


def _dig_tag_pct(obj: Any, key: str) -> float | None:
    if not isinstance(obj, dict):
        return None
    # direct
    for k, v in obj.items():
        if key in str(k).lower():
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, dict):
                for sk in ("pct", "percentage", "percent", "share", "uiAmount"):
                    if sk in v:
                        try:
                            return float(v[sk])
                        except (TypeError, ValueError):
                            pass
    # nested holderSummary style
    for nest in ("holderSummary", "breakdown", "tags", "byTag"):
        sub = obj.get(nest)
        if isinstance(sub, dict) and key in sub:
            return _dig_tag_pct(sub, key) if isinstance(sub[key], dict) else _safe_float(
                sub[key], None
            )
        if isinstance(sub, list):
            for item in sub:
                if isinstance(item, dict) and key in str(item.get("tag") or item.get("name") or "").lower():
                    return _safe_float(
                        item.get("pct") or item.get("percentage") or item.get("percent"),
                        None,
                    )
    return None


def _safe_float(v: Any, default: float | None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _risk_label(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 45:
        return "elevated"
    if score >= 25:
        return "moderate"
    return "lower"
