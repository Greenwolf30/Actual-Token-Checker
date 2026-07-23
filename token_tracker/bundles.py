"""
Bundle / coordinated-wallet heuristics from top-holder snapshots.

This is NOT a professional sniper-graph indexer. Signals are derived from:
  - multi-account clusters (same wallet, multiple large Associated Token Accounts)
  - similar-sized non-LP top wallets (possible coordinated buys)
  - Rugcheck insider flags when present
  - concentration of top wallets excluding known programs / LP
"""

from __future__ import annotations

from typing import Any


def _holder_is_known_lp(
    holders: list[dict[str, Any]], wallet: str | None
) -> bool:
    w = (wallet or "").strip()
    if not w:
        return False
    for h in holders or []:
        if not isinstance(h, dict):
            continue
        if (h.get("wallet") or "").strip() != w:
            continue
        if h.get("is_known_program"):
            return True
        lab = (h.get("label") or "").lower()
        if any(
            k in lab
            for k in (
                "liquidity",
                "pool",
                "meteora",
                "raydium",
                "orca",
                "pump",
                "vault",
                "amm",
                "bonding",
            )
        ):
            return True
    return False


def is_known_lp_label(label: Any) -> bool:
    lab = (str(label or "")).lower()
    if not lab:
        return False
    return any(
        k in lab
        for k in (
            "liquidity",
            "pool",
            "meteora",
            "raydium",
            "orca",
            "pump",
            "vault",
            "amm",
            "bonding",
            "known program",
        )
    )


def analyze_bundles(holders_data: dict[str, Any] | None) -> dict[str, Any]:
    """Build a structured BUNDLES section from holder scan output."""
    if not holders_data:
        return _empty("No holder data — run holders scan first.")
    if not holders_data.get("ok"):
        return _empty(
            holders_data.get("error")
            or holders_data.get("notes")
            or "Holder scan failed; bundles unavailable."
        )

    holders = list(holders_data.get("holders") or [])
    summary = holders_data.get("summary") or {}
    clusters_in = list(holders_data.get("owner_clusters") or [])
    meta = holders_data.get("meta") or {}

    # Enrich multi-account clusters with pct of supply when possible
    multi_clusters = _enrich_clusters(clusters_in, holders, summary)
    # Drop known pool / program owners from multi-account risk clusters
    multi_clusters = [
        c
        for c in multi_clusters
        if not (
            c.get("is_known_program")
            or is_known_lp_label(c.get("label"))
            or _holder_is_known_lp(holders, c.get("wallet") or c.get("owner"))
        )
    ]

    # Similar-size groups among non-program wallets (heuristic bundle)
    similar_groups = _similar_size_groups(holders)

    insiders = [
        h
        for h in holders
        if h.get("insider") and not h.get("is_known_program")
    ]
    non_lp = [h for h in holders if not h.get("is_known_program")]

    top10_ex = summary.get("top10_pct_excluding_known_programs")
    try:
        top10_ex_f = float(top10_ex) if top10_ex is not None else None
    except (TypeError, ValueError):
        top10_ex_f = None

    signals: list[dict[str, Any]] = []
    score = 0  # 0–100 higher = more bundle-like risk

    if multi_clusters:
        n_acct = sum(int(c.get("accounts") or 0) for c in multi_clusters)
        signals.append(
            {
                "id": "multi_ata",
                "severity": "high",
                "title": "Multi-account wallet clusters",
                "detail": (
                    f"{len(multi_clusters)} wallet(s) control multiple large token accounts "
                    f"({n_acct} Associated Token Accounts total in the top set)."
                ),
            }
        )
        score += min(35, 12 + len(multi_clusters) * 8 + max(0, n_acct - len(multi_clusters)) * 4)

    if similar_groups:
        biggest = max(similar_groups, key=lambda g: len(g.get("wallets") or []))
        n = len(biggest.get("wallets") or [])
        signals.append(
            {
                "id": "similar_size",
                "severity": "medium",
                "title": "Similar-sized top wallets",
                "detail": (
                    f"{n} non-LP top wallets hold nearly the same balance "
                    f"(~{_pct(biggest.get('avg_pct'))} each) — can look like a coordinated bundle."
                ),
            }
        )
        score += min(25, 8 + n * 4)

    if insiders:
        signals.append(
            {
                "id": "insider",
                "severity": "high",
                "title": "Insider-flagged accounts",
                "detail": (
                    f"Rugcheck marks {len(insiders)} top account(s) as insider-related."
                ),
            }
        )
        score += min(25, 10 + len(insiders) * 6)

    if top10_ex_f is not None and top10_ex_f >= 70:
        signals.append(
            {
                "id": "concentration",
                "severity": "high" if top10_ex_f >= 85 else "medium",
                "title": "Tight non-LP concentration",
                "detail": (
                    f"Top 10 non-program wallets hold ~{top10_ex_f:.1f}% of supply "
                    "(excluding known LP/programs)."
                ),
            }
        )
        score += 20 if top10_ex_f >= 85 else 12
    elif top10_ex_f is not None and top10_ex_f >= 55:
        signals.append(
            {
                "id": "concentration_mild",
                "severity": "low",
                "title": "Moderate non-LP concentration",
                "detail": f"Top 10 non-program wallets hold ~{top10_ex_f:.1f}% of supply.",
            }
        )
        score += 6

    score = max(0, min(100, int(round(score))))
    risk = _risk_label(score)

    if not signals:
        signals.append(
            {
                "id": "none",
                "severity": "info",
                "title": "No strong bundle signals",
                "detail": (
                    "Top-holder snapshot does not show multi Associated Token "
                    "Account clusters, tight similar-size groups, or insider flags."
                ),
            }
        )

    # Multi-account stays its own category.
    # Suspect = similar-size bags + Rugcheck insider-flagged (not multi).
    similar_total_pct, similar_wallet_n = _similar_size_total_percent(similar_groups)
    insider_rows = [
        {
            "wallet": h.get("wallet"),
            "rank": h.get("rank"),
            "pct_supply": h.get("pct_supply"),
            "balance": h.get("balance"),
            "label": h.get("label") or "insider-flagged (Rugcheck)",
            "source": "rugcheck_insider",
        }
        for h in insiders[:20]
        if isinstance(h, dict) and (h.get("wallet") or "").strip()
    ]
    suspect_total_pct, suspect_wallet_n = _suspect_union_percent(
        similar_groups, insider_rows
    )
    multi_pct, multi_n = _sum_wallets_pct(
        [
            {
                "wallet": c.get("wallet") or c.get("owner"),
                "pct_supply": c.get("pct_supply")
                if c.get("pct_supply") is not None
                else c.get("combined_pct"),
            }
            for c in multi_clusters
            if isinstance(c, dict)
        ]
    )
    # Baseline total: multi always; Suspect (similar+insider) when no optionals
    total_pct, flagged_n = _total_bundle_percent(
        holders=holders,
        clusters=multi_clusters,
        similar_groups=similar_groups,
        insiders=insiders,
        suspects=[],
    )
    _base_for_single = {
        "holders": holders,
        "clusters": multi_clusters,
        "similar_size_groups": similar_groups,
        "insider_wallets": insiders,
        "suspect_wallets": [],
    }
    single_rows = _single_holders_rows(_base_for_single)
    single_pct, single_n = _sum_wallets_pct(single_rows)

    return {
        "ok": True,
        "chain_id": holders_data.get("chain_id"),
        "token_address": holders_data.get("token_address"),
        "source": holders_data.get("source"),
        "method": "heuristic_top_holders",
        "summary": {
            "bundle_risk_score": score,
            "bundle_risk": risk,
            "multi_account_clusters": len(multi_clusters),
            "multi_account_total_pct": multi_pct,
            "multi_account_wallet_count": multi_n,
            "similar_size_groups": len(similar_groups),
            "similar_size_total_pct": similar_total_pct,
            "similar_size_wallet_count": similar_wallet_n,
            # Suspect = similar-size + Rugcheck insiders (unique wallets)
            "suspect_total_pct": suspect_total_pct,
            "suspect_wallet_count": suspect_wallet_n,
            "insider_accounts": len(insiders),
            "insider_total_pct": _sum_wallets_pct(insider_rows)[0],
            "non_lp_top_wallets": len(non_lp),
            "top10_pct_excluding_known_programs": top10_ex_f,
            "unique_wallets_in_top": summary.get("unique_wallets_in_top"),
            "accounts_scanned": summary.get("accounts_returned") or len(holders),
            "total_bundle_pct": total_pct,
            "flagged_wallets": flagged_n,
            "single_holders_total_pct": single_pct,
            "single_holders_wallet_count": single_n,
        },
        "signals": signals,
        "clusters": multi_clusters,
        "similar_size_groups": similar_groups,
        "insider_wallets": insider_rows[:15],
        # Flat suspect list not used; UI builds from similar + insider
        "suspect_wallets": [],
        "single_holders": single_rows,
        "meta": {
            "holder_source": holders_data.get("source"),
            "rpc_endpoint_host": meta.get("rpc_endpoint_host"),
            "rugcheck_score": meta.get("rugcheck_score"),
        },
        "notes": (
            "Bundle detection is heuristic from a top-holder snapshot only. "
            "Multi-account is its own category. Similar-sized wallets = near-exact "
            "bags + Rugcheck insider-flagged. Total = unique wallets: multi always; "
            "Similar-sized only when Fresh/Multi-send/Shared SOL are all off; optionals "
            "when checked. No double-count. Not a full commercial sniper graph."
        ),
    }


def _num(v: Any) -> float | None:
    """Safe float for summary % checks (never raises)."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _empty_line(label: str) -> str:
    """Human empty state — not a code/template placeholder."""
    return f"  {label}: none found this scan"


def format_bundles_text(data: dict[str, Any]) -> str:
    if not data.get("ok"):
        err = data.get("error") or data.get("notes") or "unavailable"
        return (
            "── BUNDLES ──\n"
            f"  {err}\n"
            "\n"
            "  Tips:\n"
            "  · Use full Analyze (not Quick) on a Solana mint\n"
            "  · Holders must succeed first (bundles builds from holders)\n"
            "  · Helius is needed for funding / fresh / multi-send / launch-window\n"
        )

    s = data.get("summary") or {}
    total_bp = _num(s.get("total_bundle_pct"))
    if total_bp is not None and total_bp > 0:
        total_line = (
            f"  Total % bundles: {_pct(total_bp)}"
            + (
                f"  ({s.get('flagged_wallets')} unique wallet(s))"
                if s.get("flagged_wallets")
                else ""
            )
        )
        if s.get("total_bundle_cross_vector_dedupe"):
            total_line += "  [unique wallets — no double-count]"
    else:
        total_line = _empty_line("Total % bundles")
    src_list = s.get("sources_used") or []
    # Section markers (── TITLE ──) are colored dim-green in the UI (titles only).
    lines = [
        "── BUNDLES / COORDINATED WALLETS ──",
        f"  Method:          {data.get('method')}",
        f"  Sources:         {', '.join(src_list) if src_list else (data.get('source') or 'n/a')}",
        f"  Bundle risk:     {s.get('bundle_risk')}  (score {s.get('bundle_risk_score')}/100)",
        total_line,
    ]
    try:
        cl_n = int(s.get("multi_account_clusters") or 0)
    except (TypeError, ValueError):
        cl_n = 0
    try:
        sg_n = int(s.get("similar_size_groups") or 0)
    except (TypeError, ValueError):
        sg_n = 0
    if cl_n > 0:
        lines.append(
            f"  Clusters:        {cl_n} multi Associated Token Account wallet(s)"
        )
    else:
        lines.append(_empty_line("Clusters"))
    if sg_n > 0:
        lines.append(f"  Similar-sized groups: {sg_n}")
    else:
        lines.append(_empty_line("Similar-sized groups"))
    # Similar-sized total = near-exact bags + Rugcheck insiders
    sim_pct = s.get("suspect_total_pct")
    if sim_pct is None:
        sim_pct = s.get("similar_size_total_pct")
    sim_n = s.get("suspect_wallet_count")
    if sim_n is None:
        sim_n = s.get("similar_size_wallet_count")
    if sim_pct is None and (data.get("similar_size_groups") or []):
        sim_pct, sim_n = _similar_size_total_percent(
            list(data.get("similar_size_groups") or [])
        )
    sim_f = _num(sim_pct)
    if sim_f is not None and sim_f > 0:
        lines.append(
            f"  Similar-sized total: {_pct(sim_pct)}"
            + (f"  ({sim_n} wallet(s))" if sim_n else "")
        )
    else:
        lines.append(_empty_line("Similar-sized total"))
    try:
        ins_n = int(s.get("insider_accounts") or 0)
    except (TypeError, ValueError):
        ins_n = 0
    if ins_n > 0:
        lines.append(f"  Insider accts:   {ins_n}")
    else:
        lines.append(_empty_line("Insider accounts"))
    top10 = _num(s.get("top10_pct_excluding_known_programs"))
    if top10 is not None and top10 > 0:
        lines.append(f"  Top10 ex-LP:     {_pct(top10)}")
    else:
        lines.append(_empty_line("Top10 ex-LP"))

    # Single holders total (non-category ≥0.01%)
    single_pct = s.get("single_holders_total_pct")
    single_n = s.get("single_holders_wallet_count")
    if single_pct is None:
        try:
            single_pct, single_n = _single_holders_total(data)
        except Exception:  # noqa: BLE001
            single_pct, single_n = None, 0
    single_f = _num(single_pct)
    if single_f is not None and single_f > 0:
        lines.append(
            f"  Single holders:  {_pct(single_pct)}"
            + (f"  ({single_n} wallet(s))" if single_n else "")
        )
    else:
        lines.append(_empty_line("Single holders"))

    # Fresh total % (category sum of unique sole-token wallets)
    fresh_pct = s.get("fresh_total_pct")
    fresh_n = s.get("fresh_wallet_with_pct")
    if fresh_pct is None and (data.get("fresh_wallets") or []):
        fresh_pct, fresh_n = _sum_wallets_pct(
            [
                {"wallet": r.get("wallet"), "pct_supply": r.get("pct_supply")}
                for r in (data.get("fresh_wallets") or [])
                if isinstance(r, dict)
            ]
        )
    fresh_f = _num(fresh_pct)
    if fresh_f is not None and fresh_f > 0:
        lines.append(
            f"  Fresh total:     {_pct(fresh_pct)}"
            + (f"  ({fresh_n} wallet(s))" if fresh_n else "")
        )
    else:
        lines.append(_empty_line("Fresh total"))

    # Multi-send total % = TOKEN multi-send only (not Shared SOL / sol multi)
    ms_pct = s.get("multi_send_total_pct")
    ms_n = s.get("multi_send_wallet_with_pct")
    if ms_pct is None and data.get("multi_send_clusters"):
        try:
            ms_pct, ms_n = _multi_send_total_percent(
                {
                    "multi_send_clusters": data.get("multi_send_clusters") or [],
                    "sol_multi_send_clusters": [],
                },
                {},
            )
        except Exception:  # noqa: BLE001
            ms_pct, ms_n = None, 0
    ms_f = _num(ms_pct)
    if ms_f is not None and ms_f > 0:
        lines.append(
            f"  Multi-send total: {_pct(ms_pct)}"
            + (f"  ({ms_n} wallet(s))" if ms_n else "")
        )
    else:
        lines.append(_empty_line("Multi-send total"))

    lines.append("")
    lines.append("  Signals:")
    sigs = list(data.get("signals") or []) if isinstance(data.get("signals"), list) else []
    if sigs:
        for sig in sigs:
            if not isinstance(sig, dict):
                continue
            sev = (sig.get("severity") or "info").upper()
            lines.append(f"    [{sev}] {sig.get('title')}")
            lines.append(f"           {sig.get('detail')}")
    else:
        lines.append("    (no signals this scan)")

    reports = data.get("source_reports") or {}
    if reports:
        lines.append("")
        lines.append("  Provider status:")
        lines.append(
            f"    Helius={reports.get('helius_ok')}  Rugcheck={reports.get('rugcheck_ok')}  "
            f"Birdeye={reports.get('birdeye_ok')}  Jito-style={reports.get('jito_style_ok')}  "
            f"Jito-engine={reports.get('jito_engine_ok')}"
        )
        if reports.get("birdeye_skipped"):
            lines.append("    Birdeye skipped — set BIRDEYE_API_KEY in .env for full coverage.")
        errs = reports.get("errors") or {}
        for k, v in errs.items():
            if v:
                lines.append(f"    {k} error: {v}")

    clusters = data.get("clusters") or []
    lines.append("")
    if clusters:
        cl_rows = [
            {
                "wallet": c.get("wallet") or c.get("owner"),
                "pct_supply": c.get("pct_supply")
                if c.get("pct_supply") is not None
                else c.get("combined_pct"),
            }
            for c in clusters
            if isinstance(c, dict)
        ]
        cl_total, cl_wn = _sum_wallets_pct(cl_rows)
        lines.append("── MULTI-ACCOUNT CLUSTERS ──")
        lines.append(
            f"  Same wallet → several large Associated Token Accounts — "
            f"total {_pct(cl_total)} across {cl_wn} wallet(s):"
        )
        for c in clusters[:10]:
            w = c.get("wallet") or ""
            pct = (
                c.get("pct_supply")
                if c.get("pct_supply") is not None
                else c.get("combined_pct")
            )
            # Subgroup total = this owner's combined bag (like slot total)
            lines.append(
                f"    • {w}  ·  {c.get('accounts') or '?'} Associated Token Accounts"
                f"  ·  total {_pct(pct)}"
            )
            lines.append(f"         {w}  holds {_pct(pct)}")
            accts = c.get("token_accounts") or []
            for a in accts[:4]:
                lines.append(f"         Associated Token Account {a}")
            if len(accts) > 4:
                lines.append(f"         … +{len(accts) - 4} more")
    else:
        lines.append("── MULTI-ACCOUNT CLUSTERS ──")
        lines.append(
            "  (none — no multi Associated Token Account clusters this scan)"
        )

    # Suspect (= similar-size) always listed; in Total only when optionals off
    _show_sim_sus = True
    if s.get("total_bundle_show_similar_suspect") is not None:
        _show_sim_sus = bool(s.get("total_bundle_show_similar_suspect"))
    elif s.get("total_bundle_mode") in (
        "primary",
    ):
        _show_sim_sus = False

    groups = data.get("similar_size_groups") or []
    insiders = data.get("insider_wallets") or []
    lines.append("")
    lines.append("── SIMILAR-SIZED WALLETS (near-exact + Rugcheck insider) ──")
    sus_tot_txt, sus_n_txt = _suspect_union_percent(groups, insiders)
    in_total_note = (
        " · in Total (multi + similar-sized)"
        if _show_sim_sus
        else " · listed only (not in Total while optionals on)"
    )
    if groups or insiders:
        lines.append(
            f"  total {_pct(sus_tot_txt)} across {sus_n_txt} unique wallet(s)"
            f"{in_total_note}"
        )
    if groups:
        lines.append("  Similar-sized bags:")
        for g in groups[:6]:
            # Prefer members (wallet + pct); fall back to address-only list
            member_rows = list(g.get("members") or [])
            if not member_rows:
                member_rows = [
                    {"wallet": w, "pct_supply": g.get("avg_pct")}
                    for w in (g.get("wallets") or [])
                ]
            # Sum of holdings for this subgroup
            group_sum = g.get("total_pct")
            if group_sum is None:
                group_sum = _similar_group_sum_pct(g, member_rows)
            n_w = len(g.get("wallets") or member_rows or [])
            header = (
                f"    • {n_w} wallets ≈ {_pct(g.get('avg_pct'))} each "
                f"(range {_pct(g.get('min_pct'))}–{_pct(g.get('max_pct'))})"
            )
            if group_sum is not None:
                header += f"  ·  sum {_pct(group_sum)}"
            lines.append(header)
            for m in member_rows[:6]:
                w = m.get("wallet") if isinstance(m, dict) else m
                pct = m.get("pct_supply") if isinstance(m, dict) else None
                if pct is None:
                    pct = g.get("avg_pct")
                lines.append(f"         {w}  holds {_pct(pct)}")
            n_show = len(member_rows)
            if n_show > 6:
                lines.append(f"         … +{n_show - 6} more")
    # Wallet → supply % map for sections that only had addresses
    pct_map = _wallet_pct_map(data)

    if insiders:
        lines.append("  Rugcheck insider-flagged:")
        for h in insiders[:12]:
            if not isinstance(h, dict):
                continue
            w = (h.get("wallet") or "").strip()
            pct = h.get("pct_supply")
            if pct is None and w in pct_map:
                pct = pct_map[w]
            lines.append(
                f"    • {w}  holds {_pct(pct)}  [insider-flagged (Rugcheck)]"
            )
        if len(insiders) > 12:
            lines.append(f"    … +{len(insiders) - 12} more insider(s)")
    if not groups and not insiders:
        lines.append(
            "  (none — no similar-size bags or Rugcheck insider flags this scan)"
        )

    # Funding clusters (shared SOL funder — comprehensive check)
    funding = data.get("funding_clusters") or []
    lines.append("")
    lines.append("── SHARED SOL FUNDER ──")
    if funding:
        # Category total across all funders + children (unique wallets)
        fund_all_rows: list[dict[str, Any]] = []
        for fc in funding:
            funder = (fc.get("funder") or "").strip()
            if funder:
                fund_all_rows.append(
                    {"wallet": funder, "pct_supply": pct_map.get(funder)}
                )
            for c in fc.get("children") or []:
                w = c if isinstance(c, str) else (c or {}).get("wallet")
                ws = (str(w) if w is not None else "").strip()
                if ws:
                    fund_all_rows.append(
                        {"wallet": ws, "pct_supply": pct_map.get(ws)}
                    )
        fund_cat_total, fund_cat_n = _sum_wallets_pct(fund_all_rows)
        lines.append(
            f"  1-hop clusters — total {_pct(fund_cat_total)} across {fund_cat_n} wallet(s):"
        )
        for fc in funding[:6]:
            kids = list(fc.get("children") or [])
            child_rows = [
                {
                    "wallet": c if isinstance(c, str) else (c or {}).get("wallet"),
                    "pct_supply": pct_map.get(
                        (c if isinstance(c, str) else (c or {}).get("wallet") or "").strip()
                    ),
                }
                for c in kids
            ]
            funder = (fc.get("funder") or "").strip()
            funder_pct = pct_map.get(funder)
            # Subgroup total for this funder cluster only
            sub_rows = list(child_rows)
            if funder:
                sub_rows.append({"wallet": funder, "pct_supply": funder_pct})
            c_total, c_n = _sum_wallets_pct(sub_rows)
            sub_s = _pct(c_total) if c_total is not None else "n/a"
            lines.append(
                f"    • funder {funder}  holds {_pct(funder_pct)} → "
                f"{fc.get('child_count') or len(child_rows)} wallets  ·  sum {sub_s}"
            )
            for row in child_rows[:8]:
                w = row.get("wallet") or ""
                lines.append(f"         {w}  holds {_pct(row.get('pct_supply'))}")
            if len(child_rows) > 8:
                lines.append(f"         … +{len(child_rows) - 8} more")
    else:
        lines.append(
            "  (none — no shared SOL funder clusters this scan; needs Helius)"
        )

    # Fresh / sole-token wallets — total supply % + list sorted by hold %
    # (same layout as multi-send: category total → flat list by current %)
    lines.append("")
    lines.append("── FRESH WALLETS ──")
    fresh = list(data.get("fresh_wallets") or [])
    # Enrich missing % from holders map; sort largest bag first
    fresh_enriched: list[dict[str, Any]] = []
    for r in fresh:
        if not isinstance(r, dict):
            continue
        w = (r.get("wallet") or "").strip()
        if not w:
            continue
        row = dict(r)
        pct = row.get("pct_supply")
        if pct is None and w in pct_map:
            pct = pct_map[w]
        row["pct_supply"] = pct
        row["wallet"] = w
        fresh_enriched.append(row)
    fresh_enriched.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    if fresh_enriched:
        f_rows = [
            {"wallet": r["wallet"], "pct_supply": r.get("pct_supply")}
            for r in fresh_enriched
        ]
        f_tot, f_n = _sum_wallets_pct(f_rows)
        lines.append(
            f"  Fresh wallets — total {_pct(f_tot)} across {f_n} wallet(s):"
        )
        lines.append("  All wallets (by current supply %):")
        for i, r in enumerate(fresh_enriched[:24], start=1):
            w = r["wallet"]
            sol = r.get("sol")
            sol_s = f"{float(sol):.3f} SOL" if sol is not None else "SOL n/a"
            other = r.get("other_tokens")
            tag = r.get("tag") or "sole-token"
            lines.append(
                f"    #{i} {w}  holds {_pct(r.get('pct_supply'))}  ·  {sol_s}  ·  "
                f"other tokens={other if other is not None else '?'}  ·  {tag}"
            )
        if len(fresh_enriched) > 24:
            lines.append(f"    … +{len(fresh_enriched) - 24} more")
    else:
        lines.append(
            "  (none — no fresh wallets this scan; needs Helius + full Analyze)"
        )

    # Multi-send: total supply % of all unique wallets involved + cluster lists
    lines.append("")
    lines.append("── MULTI-SEND (ONE OWNER → MANY) ──")
    token_ms = list(data.get("multi_send_clusters") or [])
    sol_ms = list(data.get("sol_multi_send_clusters") or [])
    if token_ms or sol_ms:
        # Flat unique wallet list (senders + receivers) with supply %
        by_wallet: dict[str, dict[str, Any]] = {}

        def _add_ms_wallet(
            addr: Any,
            pct: Any = None,
            *,
            roles: list[str] | None = None,
        ) -> None:
            w = (str(addr) if addr is not None else "").strip()
            if not w or len(w) < 32:
                return
            cur = by_wallet.get(w) or {
                "wallet": w,
                "pct_supply": None,
                "roles": set(),
            }
            if pct is None and w in pct_map:
                pct = pct_map[w]
            if pct is not None:
                try:
                    pf = float(pct)
                    if cur["pct_supply"] is None or pf > float(cur["pct_supply"] or 0):
                        cur["pct_supply"] = pf
                except (TypeError, ValueError):
                    pass
            for role in roles or []:
                if role:
                    cur["roles"].add(str(role))
            by_wallet[w] = cur

        # Flat list + total = TOKEN multi-send only (Shared SOL sol-* not mixed in)
        for mc in token_ms:
            sender = (mc.get("sender") or "").strip()
            sp = mc.get("sender_pct")
            if sp is None and sender:
                sp = pct_map.get(sender)
            _add_ms_wallet(sender, sp, roles=["token-sender"])
            child_rows = list(mc.get("child_rows") or [])
            if not child_rows:
                for r in mc.get("receivers") or []:
                    rs = r if isinstance(r, str) else (r or {}).get("wallet")
                    _add_ms_wallet(
                        rs,
                        pct_map.get(str(rs or "").strip()),
                        roles=["token-receiver"],
                    )
            for row in child_rows:
                if isinstance(row, dict):
                    _add_ms_wallet(
                        row.get("wallet"),
                        row.get("pct_supply")
                        if row.get("pct_supply") is not None
                        else pct_map.get(str(row.get("wallet") or "").strip()),
                        roles=["token-receiver"],
                    )
                else:
                    _add_ms_wallet(
                        row,
                        pct_map.get(str(row or "").strip()),
                        roles=["token-receiver"],
                    )

        ms_list = list(by_wallet.values())
        for r in ms_list:
            if isinstance(r.get("roles"), set):
                r["roles"] = sorted(r["roles"])
        ms_list.sort(
            key=lambda r: (
                -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
                str(r.get("wallet") or ""),
            )
        )
        ms_tot, ms_n = _sum_wallets_pct(ms_list)
        s_fmt = data.get("summary") if isinstance(data.get("summary"), dict) else {}
        if s_fmt.get("multi_send_total_pct") is not None:
            try:
                s_tot = float(s_fmt.get("multi_send_total_pct"))
            except (TypeError, ValueError):
                s_tot = None
            if s_tot is not None and (ms_tot is None or s_tot > 0 or not ms_n):
                ms_tot = s_tot
                ms_n = int(s_fmt.get("multi_send_wallet_with_pct") or ms_n or 0)
        split = _multi_send_split_totals(
            {
                "multi_send_clusters": token_ms,
                "sol_multi_send_clusters": [],
            },
            pct_map,
        )
        lines.append(
            f"  Multi-send wallets (token multi-send) — {_pct(ms_tot)} across {ms_n} wallet(s) "
            f"(LP/bonding curve excluded; Shared SOL is separate):"
        )
        lines.append(
            f"  Senders (each one wallet): {_pct(split.get('sender_total_pct'))} "
            f"across {split.get('sender_count') or 0} sender(s)"
        )
        lines.append(
            f"  Receivers (across wallets): {_pct(split.get('receiver_total_pct'))} "
            f"across {split.get('receiver_count') or 0} receiver(s)"
        )
        shape = split.get("hold_shape") or "unknown"
        if shape == "mostly_one_wallet_sender":
            lines.append(
                "  Hold shape: mostly still on sender wallet(s) — not spread across receivers"
            )
        elif shape == "mostly_across_receivers":
            lines.append(
                "  Hold shape: mostly across receiver wallets — not one sender bag"
            )
        # Flat list by supply % (all senders + receivers)
        lines.append("  All wallets involved (by current supply %):")
        for i, r in enumerate(ms_list[:24], start=1):
            w = (r.get("wallet") or "").strip()
            roles = r.get("roles") or []
            role_s = ", ".join(roles) if roles else "multi-send"
            lines.append(
                f"    #{i} {w}  holds {_pct(r.get('pct_supply'))}  ·  {role_s}"
            )
        if len(ms_list) > 24:
            lines.append(f"    … +{len(ms_list) - 24} more")

        # Cluster breakdown with per-cluster total %
        if token_ms:
            lines.append("  Token multi-send clusters (one sender → many receivers):")
            # Sort clusters by receiver supply sum
            def _mc_sort_key(mc: dict[str, Any]) -> float:
                try:
                    return -float(mc.get("total_pct") or 0)
                except (TypeError, ValueError):
                    return 0.0

            for mc in sorted(token_ms, key=_mc_sort_key)[:8]:
                sender = (mc.get("sender") or "").strip()
                child_rows = list(mc.get("child_rows") or [])
                if not child_rows:
                    child_rows = [
                        {
                            "wallet": (r if isinstance(r, str) else (r or {}).get("wallet")),
                            "pct_supply": pct_map.get(
                                str(
                                    r if isinstance(r, str) else (r or {}).get("wallet") or ""
                                ).strip()
                            ),
                        }
                        for r in (mc.get("receivers") or [])
                    ]
                # Normalize + sort receivers by %
                norm: list[dict[str, Any]] = []
                for row in child_rows:
                    if isinstance(row, dict):
                        w = (row.get("wallet") or "").strip()
                        pct = row.get("pct_supply")
                        if pct is None and w:
                            pct = pct_map.get(w)
                    else:
                        w = str(row or "").strip()
                        pct = pct_map.get(w)
                    if w:
                        norm.append({"wallet": w, "pct_supply": pct})
                norm.sort(
                    key=lambda r: (
                        -(
                            float(r["pct_supply"])
                            if r.get("pct_supply") is not None
                            else -1.0
                        ),
                        r["wallet"],
                    )
                )
                sub_rows = list(norm)
                sp = mc.get("sender_pct")
                if sp is None and sender:
                    sp = pct_map.get(sender)
                if sender:
                    sub_rows.append({"wallet": sender, "pct_supply": sp})
                c_tot, c_n = _sum_wallets_pct(sub_rows)
                n_rec = mc.get("receiver_count") or len(norm)
                lines.append(
                    f"    • sender {sender}  holds {_pct(sp)} → "
                    f"{n_rec} receivers  ·  cluster total {_pct(c_tot)} "
                    f"({c_n} with %)"
                )
                for j, row in enumerate(norm[:12], start=1):
                    lines.append(
                        f"         #{j} {row['wallet']}  holds {_pct(row.get('pct_supply'))}"
                    )
                if len(norm) > 12:
                    lines.append(f"         … +{len(norm) - 12} more")

        if sol_ms:
            lines.append("  SOL multi-send clusters (one funder → many wallets):")

            def _sol_sort_key(mc: dict[str, Any]) -> float:
                try:
                    return -float(mc.get("total_pct") or 0)
                except (TypeError, ValueError):
                    return 0.0

            for mc in sorted(sol_ms, key=_sol_sort_key)[:8]:
                sender = (mc.get("sender") or "").strip()
                child_rows = list(mc.get("child_rows") or [])
                kids = list(mc.get("receivers") or mc.get("children") or [])
                if not child_rows:
                    child_rows = [
                        {
                            "wallet": c if isinstance(c, str) else (c or {}).get("wallet"),
                            "pct_supply": pct_map.get(
                                (
                                    c
                                    if isinstance(c, str)
                                    else (c or {}).get("wallet")
                                    or ""
                                ).strip()
                            ),
                        }
                        for c in kids
                    ]
                norm = []
                for row in child_rows:
                    if isinstance(row, dict):
                        w = (row.get("wallet") or "").strip()
                        pct = row.get("pct_supply")
                        if pct is None and w:
                            pct = pct_map.get(w)
                    else:
                        w = str(row or "").strip()
                        pct = pct_map.get(w)
                    if w:
                        norm.append({"wallet": w, "pct_supply": pct})
                norm.sort(
                    key=lambda r: (
                        -(
                            float(r["pct_supply"])
                            if r.get("pct_supply") is not None
                            else -1.0
                        ),
                        r["wallet"],
                    )
                )
                sub_rows = list(norm)
                sp = mc.get("sender_pct")
                if sp is None and sender:
                    sp = pct_map.get(sender)
                if sender:
                    sub_rows.append({"wallet": sender, "pct_supply": sp})
                c_tot, c_n = _sum_wallets_pct(sub_rows)
                n_rec = mc.get("receiver_count") or len(norm)
                lines.append(
                    f"    • sender {sender}  holds {_pct(sp)} → "
                    f"{n_rec} wallets  ·  cluster total {_pct(c_tot)} "
                    f"({c_n} with %)"
                )
                for j, row in enumerate(norm[:12], start=1):
                    lines.append(
                        f"         #{j} {row['wallet']}  holds {_pct(row.get('pct_supply'))}"
                    )
                if len(norm) > 12:
                    lines.append(f"         … +{len(norm) - 12} more")
    else:
        ms_err = (s.get("multi_send_error") or "").strip()
        srcs = " ".join(str(x) for x in (s.get("sources_used") or [])).lower()
        helius_ran = "token_multi_send" in srcs or "helius" in srcs
        if ms_err:
            lines.append(f"  (none this scan — {ms_err[:200]})")
        elif helius_ran:
            lines.append(
                "  (none this scan — Helius ran; no one→many token/SOL multi-send "
                "in the recent history window. LP/bonding-curve excluded.)"
            )
        else:
            lines.append(
                "  (none — multi-send needs HELIUS_API_KEY on the API + full Analyze)"
            )

    # Launch-window removed from Bundles (scan disabled — saves Helius RPCs).

    # Old Rugcheck-only suspect list removed (Suspect section = similar-size above)

    # Single holders list (same as UI cards)
    lines.append("")
    lines.append("── SINGLE HOLDERS ──")
    single_rows = list(data.get("single_holders") or [])
    if not single_rows:
        try:
            single_rows = _single_holders_rows(data)
        except Exception:  # noqa: BLE001
            single_rows = []
    # Unique by wallet (max bag)
    by_single: dict[str, dict[str, Any]] = {}
    for r in single_rows:
        if not isinstance(r, dict):
            continue
        w = (r.get("wallet") or "").strip()
        if not w:
            continue
        try:
            p = float(r["pct_supply"]) if r.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            p = None
        prev = by_single.get(w)
        if prev is None or (
            p is not None
            and (
                prev.get("pct_supply") is None
                or float(p) > float(prev.get("pct_supply") or 0)
            )
        ):
            by_single[w] = {"wallet": w, "pct_supply": p, "rank": r.get("rank")}
    single_list = list(by_single.values())
    single_list.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    s_tot, s_n = _sum_wallets_pct(single_list)
    if s.get("single_holders_total_pct") is not None:
        try:
            s_tot = float(s.get("single_holders_total_pct"))
        except (TypeError, ValueError):
            pass
    if single_list:
        lines.append(
            f"  Non-LP bags ≥0.01% not in multi / similar-sized / optionals — "
            f"total {_pct(s_tot)} across {len(single_list)} wallet(s):"
        )
        for i, row in enumerate(single_list[:80], start=1):
            rk = row.get("rank")
            rk_s = f"#{rk}  " if rk is not None else f"#{i}  "
            lines.append(
                f"    {rk_s}{row['wallet']}  holds {_pct(row.get('pct_supply'))}"
            )
        if len(single_list) > 80:
            lines.append(f"    … +{len(single_list) - 80} more")
    else:
        lines.append(
            "  (none — no standalone bags ≥0.01% outside multi / similar-sized / optionals)"
        )

    if data.get("notes"):
        lines.append("")
        lines.append(f"  Note: {data['notes']}")
    return "\n".join(lines) + "\n"


def _empty(msg: str) -> dict[str, Any]:
    return {
        "ok": False,
        "error": msg,
        "summary": {
            "total_bundle_pct": None,
            "flagged_wallets": 0,
            "suspect_total_pct": None,
            "suspect_wallet_count": 0,
            "single_holders_total_pct": None,
            "single_holders_wallet_count": 0,
        },
        "signals": [],
        "clusters": [],
        "similar_size_groups": [],
        "insider_wallets": [],
        "suspect_wallets": [],
        "single_holders": [],
        "notes": msg,
    }


def _suspect_total_percent(
    suspects: list[dict[str, Any]],
) -> tuple[float | None, int]:
    """Sum unique suspect wallets' supply % (cap 100)."""
    return _sum_wallets_pct(suspects or [])


def _suspect_union_percent(
    similar_groups: list[dict[str, Any]] | None,
    insiders: list[dict[str, Any]] | None,
) -> tuple[float | None, int]:
    """
    Suspect total = unique wallets across similar-size groups + Rugcheck insiders.
    Multi-account is NOT included (own category).
    """
    rows: list[dict[str, Any]] = []
    for g in similar_groups or []:
        if not isinstance(g, dict):
            continue
        members = list(g.get("members") or [])
        if members:
            for m in members:
                if isinstance(m, dict):
                    rows.append(
                        {
                            "wallet": m.get("wallet"),
                            "pct_supply": m.get("pct_supply")
                            if m.get("pct_supply") is not None
                            else g.get("avg_pct"),
                        }
                    )
                else:
                    rows.append({"wallet": m, "pct_supply": g.get("avg_pct")})
        else:
            for w in g.get("wallets") or []:
                if isinstance(w, dict):
                    rows.append(
                        {
                            "wallet": w.get("wallet"),
                            "pct_supply": w.get("pct_supply")
                            if w.get("pct_supply") is not None
                            else g.get("avg_pct"),
                        }
                    )
                else:
                    rows.append({"wallet": w, "pct_supply": g.get("avg_pct")})
    for h in insiders or []:
        if isinstance(h, dict):
            rows.append(
                {"wallet": h.get("wallet"), "pct_supply": h.get("pct_supply")}
            )
        else:
            rows.append({"wallet": h, "pct_supply": None})
    return _sum_wallets_pct(rows)


def _wallet_pct_map(data: dict[str, Any]) -> dict[str, float]:
    """Collect wallet → supply % from all bundle payload lists."""
    out: dict[str, float] = {}

    def _put(w: Any, pct: Any) -> None:
        ws = (str(w) if w is not None else "").strip()
        if not ws:
            return
        try:
            p = float(pct) if pct is not None else None
        except (TypeError, ValueError):
            return
        if p is None:
            return
        out[ws] = max(out.get(ws, 0.0), p)

    for h in data.get("insider_wallets") or []:
        if isinstance(h, dict):
            _put(h.get("wallet"), h.get("pct_supply"))
    for s in data.get("suspect_wallets") or []:
        if isinstance(s, dict):
            _put(s.get("wallet"), s.get("pct_supply"))
    for g in data.get("similar_size_groups") or []:
        if not isinstance(g, dict):
            continue
        for m in g.get("members") or []:
            if isinstance(m, dict):
                _put(m.get("wallet"), m.get("pct_supply"))
        avg = g.get("avg_pct")
        for w in g.get("wallets") or []:
            if (str(w).strip() not in out) and avg is not None:
                _put(w, avg)
    for c in data.get("clusters") or []:
        if not isinstance(c, dict):
            continue
        _put(c.get("wallet") or c.get("owner"), c.get("pct_supply") or c.get("combined_pct"))
    # Optional holders snapshot if present on comprehensive payload
    for h in data.get("holders") or []:
        if isinstance(h, dict):
            _put(h.get("wallet"), h.get("pct_supply"))
    return out


def _wallet_label_map(data: dict[str, Any]) -> dict[str, str]:
    """wallet → label (e.g. Liquidity pair) from holders / enriched rows."""
    out: dict[str, str] = {}

    def _put(w: Any, lab: Any) -> None:
        ws = (str(w) if w is not None else "").strip()
        s = (str(lab) if lab is not None else "").strip()
        if ws and s and ws not in out:
            out[ws] = s

    for h in data.get("holders") or []:
        if isinstance(h, dict):
            _put(h.get("wallet"), h.get("label"))
    for g in data.get("same_slot_groups") or []:
        if not isinstance(g, dict):
            continue
        for row in g.get("wallet_rows") or []:
            if isinstance(row, dict):
                _put(row.get("wallet"), row.get("label"))
    for s in data.get("suspect_wallets") or []:
        if isinstance(s, dict):
            _put(s.get("wallet"), s.get("label"))
    return out


def _fmt_unix_utc(ts: Any) -> str | None:
    """Unix seconds → 'YYYY-MM-DD HH:MM:SS UTC' or None."""
    if ts is None or ts == "":
        return None
    try:
        from datetime import datetime, timezone

        n = int(float(ts))
        if n > 1_000_000_000_000:  # ms
            n = n // 1000
        if n < 1_000_000_000:
            return None
        return (
            datetime.fromtimestamp(n, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            + " UTC"
        )
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _fmt_wallet_hold_line(
    wallet: str,
    pct: Any,
    *,
    label: str | None = None,
    is_lp: bool = False,
    when: Any = None,
) -> str:
    """Single Bundles line: wallet holds X% [optional LP label] · @ time."""
    lab = (label or "").strip()
    if is_lp and not lab:
        lab = "Known liquidity / program"
    parts: list[str] = []
    if lab:
        parts.append(f"[{lab}]")
    ts = None
    if isinstance(when, str) and when.strip():
        # already formatted or raw string
        ts = _fmt_unix_utc(when) or when.strip()
    else:
        ts = _fmt_unix_utc(when)
    if ts:
        parts.append(f"@ {ts}")
    suffix = ("  " + "  ·  ".join(parts)) if parts else ""
    return f"         {wallet}  holds {_pct(pct)}{suffix}"


def _sum_wallets_pct(
    rows: list[dict[str, Any]],
) -> tuple[float | None, int]:
    """Sum unique wallets' supply % (cap 100). Returns (total|None, wallet_count)."""
    by_w: dict[str, float] = {}
    for s in rows or []:
        if not isinstance(s, dict):
            continue
        w = (s.get("wallet") or "").strip()
        if not w:
            continue
        try:
            pct = float(s["pct_supply"]) if s.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        # Ignore wallets with unknown % — do not invent 0 and zero the total
        if pct is None:
            continue
        by_w[w] = max(by_w.get(w, 0.0), pct)
    if not by_w:
        return None, 0
    total = sum(by_w.values())
    if total > 100.0:
        total = 100.0
    has_any = any(v > 0 for v in by_w.values())
    return (round(total, 4) if has_any else None), (len(by_w) if has_any else 0)


# Same cutoff as Ruggers Single lane (web_server / app.js)
_SINGLE_HOLDERS_MIN_PCT = 0.01


def _wallet_addr(w: Any) -> str:
    """Normalize a wallet field that may be a string or {wallet|owner|address}."""
    if w is None:
        return ""
    if isinstance(w, dict):
        a = (
            w.get("wallet")
            or w.get("owner")
            or w.get("address")
            or w.get("funder")
            or w.get("sender")
            or ""
        )
        return str(a).strip()
    return str(w).strip()


def _similar_sized_wallet_set(data: dict[str, Any] | None) -> set[str]:
    """
    Every wallet that belongs in Similar-sized section:
      • near-exact bag groups (members + wallets lists)
      • Rugcheck insider-flagged
    Never Single.
    """
    data = data if isinstance(data, dict) else {}
    out: set[str] = set()

    def _add(w: Any) -> None:
        a = _wallet_addr(w)
        if a and len(a) >= 20:
            out.add(a)

    for g in data.get("similar_size_groups") or []:
        if not isinstance(g, dict):
            continue
        for m in g.get("members") or []:
            _add(m)
        for w in g.get("wallets") or []:
            _add(w)
    for h in data.get("insider_wallets") or []:
        _add(h)
    # Legacy flat suspect list (if present) = similar-sized lineage
    for s in data.get("suspect_wallets") or []:
        _add(s)
    return out


def _collect_bundled_wallet_set(data: dict[str, Any] | None) -> set[str]:
    """Wallets that sit in any Bundles risk / category list (not Single)."""
    data = data if isinstance(data, dict) else {}
    out: set[str] = set()

    def _add(w: Any) -> None:
        a = _wallet_addr(w)
        if a:
            out.add(a)

    # Similar-sized first (near-exact bags + Rugcheck insiders) — never Single
    out |= _similar_sized_wallet_set(data)

    for c in data.get("clusters") or []:
        if isinstance(c, dict):
            _add(c.get("wallet") or c.get("owner"))
        else:
            _add(c)
    for h in data.get("insider_wallets") or []:
        _add(h)
    for s in data.get("suspect_wallets") or []:
        _add(s)
    for g in data.get("similar_size_groups") or []:
        if not isinstance(g, dict):
            continue
        for m in g.get("members") or []:
            _add(m)
        for w in g.get("wallets") or []:
            _add(w)
    for fw in data.get("fresh_wallets") or []:
        if isinstance(fw, dict):
            _add(fw.get("wallet"))
        else:
            _add(fw)
    for mc in list(data.get("multi_send_clusters") or []) + list(
        data.get("sol_multi_send_clusters") or []
    ):
        if not isinstance(mc, dict):
            continue
        _add(mc.get("sender") or mc.get("funder"))
        for r in list(mc.get("receivers") or mc.get("children") or []):
            if isinstance(r, dict):
                _add(r.get("wallet"))
            else:
                _add(r)
        for row in mc.get("child_rows") or []:
            if isinstance(row, dict):
                _add(row.get("wallet"))
    for mw in data.get("multi_send_wallets") or []:
        if isinstance(mw, dict):
            _add(mw.get("wallet"))
        else:
            _add(mw)
    for fc in data.get("funding_clusters") or []:
        if not isinstance(fc, dict):
            continue
        _add(fc.get("funder"))
        for c in list(fc.get("children") or []):
            if isinstance(c, dict):
                _add(c.get("wallet"))
            else:
                _add(c)
        for row in fc.get("child_rows") or []:
            if isinstance(row, dict):
                _add(row.get("wallet"))
    return out


def _single_holders_rows(
    data: dict[str, Any] | None,
    *,
    min_pct: float = _SINGLE_HOLDERS_MIN_PCT,
) -> list[dict[str, Any]]:
    """
    Non-LP holders with bag ≥ min_pct that are NOT in any other Bundles category
    (multi / similar-sized / insider / suspect / fresh / multi-send / shared SOL).

    Similar-sized wallets (near-exact bags + Rugcheck insiders) are always
    excluded here — they belong only under Similar-sized.

    Unique by wallet (max bag %). Sorted largest bag first.
    Matches Ruggers “Single” idea: standalone holders in the top snapshot.
    """
    data = data if isinstance(data, dict) else {}
    excluded = _collect_bundled_wallet_set(data)
    # Hard gate: similar-sized set even if category collect missed a shape
    similar_only = _similar_sized_wallet_set(data)
    excluded |= similar_only
    by_w: dict[str, dict[str, Any]] = {}
    for h in data.get("holders") or []:
        if not isinstance(h, dict):
            continue
        if h.get("is_known_program") or is_known_lp_label(h.get("label")):
            continue
        w = _wallet_addr(h.get("wallet") or h.get("owner") or h)
        if not w or w in excluded or w in similar_only:
            continue
        # Extra safety: holder flagged as similar/insider/suspect on the row
        if (
            h.get("in_similar")
            or h.get("in_insider")
            or h.get("in_suspect")
            or h.get("similar")
            or h.get("insider")
        ):
            continue
        try:
            pct = float(h["pct_supply"]) if h.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None or pct < min_pct:
            continue
        try:
            bal = float(h["balance"]) if h.get("balance") is not None else None
        except (TypeError, ValueError):
            bal = None
        rank = h.get("rank")
        prev = by_w.get(w)
        if prev is None or float(pct) > float(prev.get("pct_supply") or 0):
            by_w[w] = {
                "wallet": w,
                "pct_supply": pct,
                "balance": bal,
                "rank": rank,
                "label": h.get("label"),
            }
    rows = list(by_w.values())
    rows.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    return rows


def _single_holders_total(
    data: dict[str, Any] | None,
    *,
    min_pct: float = _SINGLE_HOLDERS_MIN_PCT,
) -> tuple[float | None, int]:
    """Total supply % + count for single holders (unique wallets)."""
    return _sum_wallets_pct(_single_holders_rows(data, min_pct=min_pct))


def _multi_send_total_percent(
    data: dict[str, Any],
    pct_map: dict[str, float] | None = None,
) -> tuple[float | None, int]:
    """
    Unique-wallet total % across token multi-send + SOL multi-send clusters.
    Uses embedded sender_pct / child_rows.pct_supply, then pct_map fallback.
    """
    split = _multi_send_split_totals(data, pct_map)
    return split.get("combined_total_pct"), int(split.get("combined_count") or 0)


def _multi_send_split_totals(
    data: dict[str, Any],
    pct_map: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Split multi-send current supply into:
      - sender_total_pct: unique senders (each is one wallet)
      - receiver_total_pct: unique receivers (across many wallets)
      - combined_total_pct: unique union (capped 100)
      - hold_shape: mostly_one_wallet_sender | mostly_across_receivers | unknown
    """
    pct_map = pct_map or {}
    sender_rows: list[dict[str, Any]] = []
    recv_rows: list[dict[str, Any]] = []

    def _add(bucket: list[dict[str, Any]], addr: Any, pct: Any = None) -> None:
        w = (str(addr) if addr is not None else "").strip()
        if not w or len(w) < 32:
            return
        if pct is None:
            pct = pct_map.get(w)
        bucket.append({"wallet": w, "pct_supply": pct})

    for mc in list(data.get("multi_send_clusters") or []) + list(
        data.get("sol_multi_send_clusters") or []
    ):
        if not isinstance(mc, dict):
            continue
        sender = mc.get("sender")
        sp = mc.get("sender_pct")
        if sp is None and sender:
            sp = pct_map.get(str(sender).strip())
        _add(sender_rows, sender, sp)
        child_rows = list(mc.get("child_rows") or [])
        if child_rows:
            for row in child_rows:
                if isinstance(row, dict):
                    w = row.get("wallet")
                    p = row.get("pct_supply")
                    if p is None and w:
                        p = pct_map.get(str(w).strip())
                    _add(recv_rows, w, p)
                else:
                    _add(recv_rows, row, pct_map.get(str(row or "").strip()))
        else:
            for r in mc.get("receivers") or mc.get("children") or []:
                if isinstance(r, dict):
                    w = r.get("wallet")
                    p = r.get("pct_supply")
                    if p is None and w:
                        p = pct_map.get(str(w).strip())
                    _add(recv_rows, w, p)
                else:
                    _add(recv_rows, r, pct_map.get(str(r or "").strip()))

    st, sc = _sum_wallets_pct(sender_rows)
    rt, rc = _sum_wallets_pct(recv_rows)
    # Combined unique = senders + receivers (same wallet counted once)
    combined_map: dict[str, float] = {}
    for row in sender_rows + recv_rows:
        w = (row.get("wallet") or "").strip()
        if not w:
            continue
        try:
            p = float(row["pct_supply"]) if row.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            p = None
        # Skip unknown % — do not force 0% (UI can keep last known)
        if p is None:
            continue
        combined_map[w] = max(combined_map.get(w, 0.0), p)
    if not combined_map:
        # Clusters may exist without hold % on this snapshot
        ct, cn = None, 0
    else:
        total = sum(combined_map.values())
        if total > 100.0:
            total = 100.0
        has_any = any(v > 0 for v in combined_map.values())
        ct = round(total, 4) if has_any else None
        cn = len(combined_map) if has_any else 0

    try:
        sp_f = float(st) if st is not None else 0.0
    except (TypeError, ValueError):
        sp_f = 0.0
    try:
        rt_f = float(rt) if rt is not None else 0.0
    except (TypeError, ValueError):
        rt_f = 0.0
    if sp_f <= 0 and rt_f <= 0:
        shape = "unknown"
    elif sp_f >= rt_f and sp_f > 0:
        shape = "mostly_one_wallet_sender"
    else:
        shape = "mostly_across_receivers"

    return {
        "sender_total_pct": st,
        "sender_count": sc,
        "receiver_total_pct": rt,
        "receiver_count": rc,
        "combined_total_pct": ct,
        "combined_count": cn,
        "hold_shape": shape,
    }


def _total_bundle_percent(
    *,
    holders: list[dict[str, Any]],
    clusters: list[dict[str, Any]],
    similar_groups: list[dict[str, Any]],
    insiders: list[dict[str, Any]],
    suspects: list[dict[str, Any]],
) -> tuple[float | None, int]:
    """
    Legacy helper used by analyze_bundles before fusion attaches more vectors.
    Prefer recompute_total_bundle_all_vectors() on full comprehensive payloads.

    Sum unique wallets' supply % that are flagged as bundle-related
    (clusters, similar-size groups, insiders, suspect union).
    Excludes known program/LP wallets.
    """
    pct_by_wallet: dict[str, float] = {}
    for h in holders:
        if h.get("is_known_program"):
            continue
        w = h.get("wallet") or ""
        if not w:
            continue
        try:
            pct = float(h["pct_supply"]) if h.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None:
            continue
        # keep max if wallet appears more than once
        pct_by_wallet[w] = max(pct_by_wallet.get(w, 0.0), pct)

    flagged: set[str] = set()
    for c in clusters:
        w = c.get("wallet") or ""
        if w:
            flagged.add(w)
    for g in similar_groups:
        for w in g.get("wallets") or []:
            if w:
                flagged.add(w)
    for h in insiders:
        w = h.get("wallet") or ""
        if w:
            flagged.add(w)
    for s in suspects:
        w = s.get("wallet") or ""
        if w:
            flagged.add(w)

    # Only wallets we have a % for
    usable = [w for w in flagged if w in pct_by_wallet]
    if not usable:
        return (None if not flagged else 0.0, len(flagged))

    total = sum(pct_by_wallet[w] for w in usable)
    # Cap display weirdness (legacy path only; all-vectors path does not cap)
    if total > 100.0:
        total = 100.0
    return round(total, 4), len(usable)


def recompute_total_bundle_all_vectors(
    data: dict[str, Any] | None,
    *,
    include_fresh: bool = True,
    include_multi_send: bool = True,
    include_shared_sol: bool = True,
) -> dict[str, Any]:
    """
    Total bundle % = unique wallets across counted vectors (deduped).

    Each wallet contributes its supply % at most once (max % if it appears in
    several vectors or lists). Cap display total at 100%.

    Always counted:
      multi_account (own category — never merged into Suspect)

    Suspect (= similar-size bags + Rugcheck insider-flagged):
      same Total rules as the old similar + suspect fallback —
      only when Fresh / Multi-send / Shared SOL are ALL unchecked.

    Optional (ONLY when that Analyze checkbox is ON this run):
      multi_send (token multi-send), fresh, shared_funder (Shared SOL)

    Total = unique wallets across active vectors (each wallet once at max %).
    No double-count across categories. Unchecked optionals do not enter Total
    even if last-known is shown.

    When Fresh + Multi-send + Shared SOL are ALL unchecked:
      Total = multi-account + Suspect (similar + insider), unique wallets

    When any optional is checked:
      Total = multi-account + unique wallets in the checked optional(s)
      (Suspect still listed for reference, not in Total)

    Never counted: launch_window (disabled).
    Excludes known LP / program wallets.
    """
    data = data if isinstance(data, dict) else {}
    # Align similar + Suspect totals (Suspect = similar-size ∪ Rugcheck insiders)
    try:
        sim_g = list(data.get("similar_size_groups") or [])
        ins_list = list(data.get("insider_wallets") or [])
        data["suspect_wallets"] = []
        s_fix = dict(data.get("summary") or {})
        sim_pct, sim_n = _similar_size_total_percent(sim_g)
        sus_pct, sus_n = _suspect_union_percent(sim_g, ins_list)
        s_fix["similar_size_total_pct"] = sim_pct
        s_fix["similar_size_wallet_count"] = sim_n
        s_fix["similar_size_groups"] = len(sim_g)
        s_fix["suspect_total_pct"] = sus_pct
        s_fix["suspect_wallet_count"] = sus_n
        data["summary"] = s_fix
    except Exception:  # noqa: BLE001
        pass

    pct_map = _wallet_pct_map(data)

    lp_wallets: set[str] = set()
    for h in data.get("holders") or []:
        if not isinstance(h, dict):
            continue
        w = (h.get("wallet") or "").strip()
        if not w:
            continue
        if h.get("is_known_program") or is_known_lp_label(h.get("label")):
            lp_wallets.add(w)

    def _norm(w: Any) -> str:
        return (str(w) if w is not None else "").strip()

    def _is_lp(w: str) -> bool:
        if not w or w in lp_wallets:
            return True
        return False

    def _pct_of(w: str, explicit: Any = None) -> float | None:
        if explicit is not None:
            try:
                return float(explicit)
            except (TypeError, ValueError):
                pass
        if w in pct_map:
            return float(pct_map[w])
        return None

    def _wallet_map(rows: list[tuple[str, Any]]) -> dict[str, float]:
        """Unique within vector; skip LP / missing %."""
        best: dict[str, float] = {}
        for w_raw, p_raw in rows:
            w = _norm(w_raw)
            if not w or len(w) < 20 or _is_lp(w):
                continue
            p = _pct_of(w, p_raw)
            if p is None:
                continue
            best[w] = max(best.get(w, 0.0), float(p))
        return best

    def _sum_map(best: dict[str, float]) -> tuple[float, int]:
        if not best:
            return 0.0, 0
        return round(sum(best.values()), 4), len(best)

    by_vector: dict[str, dict[str, Any]] = {}
    # Per counted vector: wallet → pct (for cross-list + totals)
    counted_maps: dict[str, dict[str, float]] = {}

    # 1) Multi-account clusters — own category (always in Total when present)
    ma_rows: list[tuple[str, Any]] = []
    for c in data.get("clusters") or []:
        if not isinstance(c, dict):
            continue
        ma_rows.append(
            (
                c.get("wallet") or c.get("owner"),
                c.get("pct_supply")
                if c.get("pct_supply") is not None
                else c.get("combined_pct"),
            )
        )
    ma_map = _wallet_map(ma_rows)
    p, n = _sum_map(ma_map)
    by_vector["multi_account"] = {"pct": p, "count": n, "shown": True}
    counted_maps["multi_account"] = ma_map

    # 2) Suspect = similar-size + Rugcheck insiders (UI); Total fallback rules
    sim_rows: list[tuple[str, Any]] = []
    for g in data.get("similar_size_groups") or []:
        if not isinstance(g, dict):
            continue
        members = list(g.get("members") or [])
        if members:
            for m in members:
                if isinstance(m, dict):
                    sim_rows.append((m.get("wallet"), m.get("pct_supply")))
                else:
                    sim_rows.append((m, g.get("avg_pct")))
        else:
            for w in g.get("wallets") or []:
                if isinstance(w, dict):
                    sim_rows.append((w.get("wallet"), w.get("pct_supply")))
                else:
                    sim_rows.append((w, g.get("avg_pct")))
    sim_map = _wallet_map(sim_rows)
    p_sim, n_sim = _sum_map(sim_map)
    by_vector["similar_size"] = {
        "pct": p_sim,
        "count": n_sim,
        "fallback_only": True,
        "shown": True,
        "part_of": "suspect",
    }

    ins_rows: list[tuple[str, Any]] = []
    for h in data.get("insider_wallets") or []:
        if isinstance(h, dict):
            ins_rows.append((h.get("wallet"), h.get("pct_supply")))
        else:
            ins_rows.append((h, None))
    ins_map = _wallet_map(ins_rows)
    p_ins, n_ins = _sum_map(ins_map)
    by_vector["insider"] = {
        "pct": p_ins,
        "count": n_ins,
        "fallback_only": True,
        "shown": True,
        "part_of": "suspect",
        "excluded_from_total": True,  # counted via unified similar_size key below
    }

    # Unified Suspect map for Total (unique wallets across similar + insider).
    # Same Total rules as old similar-size + old suspect: fallback-only.
    sus_map: dict[str, float] = dict(sim_map)
    for w, pct in ins_map.items():
        sus_map[w] = max(sus_map.get(w, 0.0), float(pct))
    p_sus, n_sus = _sum_map(sus_map)
    by_vector["suspect"] = {
        "pct": p_sus,
        "count": n_sus,
        "fallback_only": True,
        "shown": True,
        "includes": ["similar_size", "insider"],
    }
    # Keep similar_size map as similar-only for reference chips
    counted_maps["similar_size"] = sim_map
    counted_maps["insider"] = ins_map

    # 4) Token multi-send only (not SOL re-label — that is shared_funder)
    ms_rows: list[tuple[str, Any]] = []
    for mc in data.get("multi_send_clusters") or []:
        if not isinstance(mc, dict):
            continue
        ms_rows.append((mc.get("sender"), mc.get("sender_pct")))
        for row in mc.get("child_rows") or []:
            if isinstance(row, dict):
                ms_rows.append((row.get("wallet"), row.get("pct_supply")))
            else:
                ms_rows.append((row, None))
        for r in mc.get("receivers") or []:
            if isinstance(r, dict):
                ms_rows.append((r.get("wallet"), r.get("pct_supply")))
            else:
                ms_rows.append((r, None))
    # Flat multi_send_wallets list (if present) — never drop multi-send bags
    for mw in data.get("multi_send_wallets") or []:
        if isinstance(mw, dict):
            ms_rows.append((mw.get("wallet"), mw.get("pct_supply")))
        else:
            ms_rows.append((mw, None))
    ms_map = _wallet_map(ms_rows)
    p, n = _sum_map(ms_map)
    by_vector["multi_send"] = {"pct": p, "count": n}
    counted_maps["multi_send"] = ms_map

    # 5) Fresh wallets
    fr_rows: list[tuple[str, Any]] = []
    for fw in data.get("fresh_wallets") or []:
        if isinstance(fw, dict):
            fr_rows.append((fw.get("wallet"), fw.get("pct_supply")))
        else:
            fr_rows.append((fw, None))
    fr_map = _wallet_map(fr_rows)
    p, n = _sum_map(fr_map)
    by_vector["fresh"] = {"pct": p, "count": n}
    counted_maps["fresh"] = fr_map

    # 6) Shared funder / Shared SOL — funder + children (+ SOL multi-send
    #    clusters, which are the same pattern when funding was re-labeled).
    #    These bags are token supply %; the link is shared SOL funding.
    fund_rows: list[tuple[str, Any]] = []
    for fc in data.get("funding_clusters") or []:
        if not isinstance(fc, dict):
            continue
        fund_rows.append(
            (
                fc.get("funder") or fc.get("sender"),
                fc.get("funder_pct")
                if fc.get("funder_pct") is not None
                else fc.get("sender_pct"),
            )
        )
        for row in fc.get("child_rows") or []:
            if isinstance(row, dict):
                fund_rows.append((row.get("wallet"), row.get("pct_supply")))
            else:
                fund_rows.append((row, None))
        for c in fc.get("children") or fc.get("receivers") or []:
            if isinstance(c, dict):
                fund_rows.append((c.get("wallet"), c.get("pct_supply")))
            else:
                fund_rows.append((c, None))
    # SOL multi-send clusters = Shared SOL fan-out; must count in Total bundle
    # even when funding_clusters list is empty/stale (was dropping Shared SOL %).
    for mc in data.get("sol_multi_send_clusters") or []:
        if not isinstance(mc, dict):
            continue
        fund_rows.append(
            (
                mc.get("sender") or mc.get("funder"),
                mc.get("sender_pct")
                if mc.get("sender_pct") is not None
                else mc.get("funder_pct"),
            )
        )
        for row in mc.get("child_rows") or []:
            if isinstance(row, dict):
                fund_rows.append((row.get("wallet"), row.get("pct_supply")))
            else:
                fund_rows.append((row, None))
        for r in mc.get("receivers") or mc.get("children") or []:
            if isinstance(r, dict):
                fund_rows.append((r.get("wallet"), r.get("pct_supply")))
            else:
                fund_rows.append((r, None))
    fund_map = _wallet_map(fund_rows)
    p, n = _sum_map(fund_map)
    by_vector["shared_funder"] = {"pct": p, "count": n}
    counted_maps["shared_funder"] = fund_map

    # 7) Launch-window — disabled (not counted, not listed)
    by_vector["launch_window"] = {
        "pct": 0.0,
        "count": 0,
        "excluded_from_total": True,
        "disabled": True,
    }

    # Total rules (same as old similar-size + old suspect fallback):
    #   Always: multi-account
    #   Optionals (Fresh / Multi-send / Shared SOL): only when that checkbox is ON
    #   Suspect (= similar-size + Rugcheck insider): only when ALL three optionals
    #     are OFF — same fallback rule previously applied to similar AND suspect
    # Unique wallets only (max % per wallet). Unchecked optionals never enter Total.
    ALWAYS = ("multi_account",)
    OPTIONAL_FLAGS = {
        "multi_send": bool(include_multi_send),
        "fresh": bool(include_fresh),
        "shared_funder": bool(include_shared_sol),
    }
    any_optional_on = any(OPTIONAL_FLAGS.values())

    active_keys: list[str] = list(ALWAYS)
    for key, on in OPTIONAL_FLAGS.items():
        if on:
            active_keys.append(key)

    # Full Suspect union map for Total (similar-size ∪ Rugcheck insider)
    counted_maps["suspect"] = sus_map

    if not any_optional_on:
        # Classic similar + suspect fallback → one Suspect key in Total
        active_keys.append("suspect")
        mode = "multi_plus_suspect"
        use_sim_sus_in_total = True
    else:
        mode = "primary"
        use_sim_sus_in_total = False

    excluded = ["launch_window"]
    for key, on in OPTIONAL_FLAGS.items():
        if not on:
            excluded.append(key)
            if key in by_vector:
                by_vector[key] = dict(by_vector[key])
                by_vector[key]["excluded_from_total"] = True
                by_vector[key]["optional_scan_off"] = True
        elif key in by_vector:
            by_vector[key] = dict(by_vector[key])
            by_vector[key]["excluded_from_total"] = False
            by_vector[key].pop("optional_scan_off", None)

    if "multi_account" in by_vector:
        by_vector["multi_account"] = dict(by_vector["multi_account"])
        by_vector["multi_account"]["excluded_from_total"] = False

    # similar_size / insider are UI parts of Suspect — never double-count in Total
    if "similar_size" in by_vector:
        by_vector["similar_size"] = dict(by_vector["similar_size"])
        by_vector["similar_size"]["fallback_only"] = True
        by_vector["similar_size"]["shown"] = True
        by_vector["similar_size"]["ui_label"] = "similar-sized"
        by_vector["similar_size"]["part_of"] = "suspect"
        by_vector["similar_size"]["excluded_from_total"] = True
        by_vector["similar_size"]["pct"] = p_sim
        by_vector["similar_size"]["count"] = n_sim
    if "insider" in by_vector:
        by_vector["insider"] = dict(by_vector["insider"])
        by_vector["insider"]["fallback_only"] = True
        by_vector["insider"]["shown"] = True
        by_vector["insider"]["part_of"] = "suspect"
        by_vector["insider"]["excluded_from_total"] = True
    if "suspect" in by_vector:
        by_vector["suspect"] = dict(by_vector["suspect"])
        by_vector["suspect"]["fallback_only"] = True
        by_vector["suspect"]["shown"] = True
        by_vector["suspect"]["includes"] = ["similar_size", "insider"]
        by_vector["suspect"]["pct"] = p_sus
        by_vector["suspect"]["count"] = n_sus
        by_vector["suspect"]["excluded_from_total"] = not use_sim_sus_in_total

    if not use_sim_sus_in_total:
        excluded.extend(["similar_size", "insider", "suspect"])
    else:
        excluded.extend(["similar_size", "insider"])  # counted via unified suspect

    # Total = unique wallets across active vectors only (no double-count).
    # Each address contributes its supply % at most once (max if listed in
    # several categories: multi + suspect + fresh + multi-send + shared SOL).
    union: dict[str, float] = {}
    appear_in: dict[str, list[str]] = {}
    for key in active_keys:
        wmap = counted_maps.get(key) or {}
        if key == "suspect":
            wmap = sus_map  # similar-size + Rugcheck insiders
        for w_raw, pct in wmap.items():
            w = _norm(w_raw)
            if not w or len(w) < 20 or _is_lp(w):
                continue
            try:
                pf = float(pct)
            except (TypeError, ValueError):
                continue
            if pf <= 0:
                continue
            union[w] = max(union.get(w, 0.0), pf)
            if key not in appear_in.setdefault(w, []):
                appear_in[w].append(key)

    any_data = bool(union)
    grand = round(min(100.0, sum(union.values())), 4) if any_data else 0.0
    slot_count = len(union)
    crosslisted = [
        {"wallet": w, "vectors": vecs, "pct_supply": union[w]}
        for w, vecs in appear_in.items()
        if len(vecs) > 1
    ]
    crosslisted.sort(
        key=lambda r: (
            -float(r.get("pct_supply") or 0),
            str(r.get("wallet") or ""),
        )
    )

    # Exclusive % per active vector for UI breakdown (priority = active_keys
    # order). Sum of exclusive pcts == Total (no duplicate wallets in chips).
    exclusive_pct: dict[str, float] = {k: 0.0 for k in active_keys}
    exclusive_n: dict[str, int] = {k: 0 for k in active_keys}
    for w, pct in union.items():
        home = None
        vecs = appear_in.get(w) or []
        for key in active_keys:
            if key in vecs:
                home = key
                break
        if home is None:
            continue
        exclusive_pct[home] = exclusive_pct.get(home, 0.0) + float(pct)
        exclusive_n[home] = exclusive_n.get(home, 0) + 1
    for key in active_keys:
        if key not in by_vector:
            continue
        by_vector[key] = dict(by_vector[key])
        by_vector[key]["pct_in_total"] = round(exclusive_pct.get(key, 0.0), 4)
        by_vector[key]["count_in_total"] = int(exclusive_n.get(key, 0))
        by_vector[key]["unique_in_total"] = True

    # Align optional vector display % with summary when maps under-count
    # (does not change Total — Total stays unique-wallet only).
    s_sum = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    if include_fresh:
        try:
            ft = float(s_sum.get("fresh_total_pct"))  # type: ignore[arg-type]
            if ft > float((by_vector.get("fresh") or {}).get("pct") or 0):
                by_vector["fresh"] = dict(by_vector.get("fresh") or {})
                by_vector["fresh"]["pct"] = ft
        except (TypeError, ValueError):
            pass
    if include_multi_send:
        try:
            mt = float(s_sum.get("multi_send_total_pct"))  # type: ignore[arg-type]
            if mt > float((by_vector.get("multi_send") or {}).get("pct") or 0):
                by_vector["multi_send"] = dict(by_vector.get("multi_send") or {})
                by_vector["multi_send"]["pct"] = mt
        except (TypeError, ValueError):
            pass
    if include_shared_sol:
        try:
            st = float(s_sum.get("funding_total_pct"))  # type: ignore[arg-type]
            if st > float((by_vector.get("shared_funder") or {}).get("pct") or 0):
                by_vector["shared_funder"] = dict(
                    by_vector.get("shared_funder") or {}
                )
                by_vector["shared_funder"]["pct"] = st
        except (TypeError, ValueError):
            pass

    # Single holders: non-LP ≥0.01% not in any category vector
    single_rows = _single_holders_rows(data)
    single_pct, single_n = _sum_wallets_pct(single_rows)
    # Write onto data so UI payload / fusion see list + totals
    try:
        s_sum2 = dict(data.get("summary") or {})
        s_sum2["single_holders_total_pct"] = single_pct
        s_sum2["single_holders_wallet_count"] = single_n
        data["summary"] = s_sum2
        data["single_holders"] = single_rows
    except Exception:  # noqa: BLE001
        pass

    result: dict[str, Any] = {
        "total_bundle_by_vector": by_vector,
        "total_bundle_additive": False,
        "total_bundle_cross_vector_dedupe": True,
        "total_bundle_excluded_vectors": list(excluded),
        "total_bundle_mode": mode,
        "total_bundle_show_similar_suspect": use_sim_sus_in_total,
        "total_bundle_include_fresh": bool(include_fresh),
        "total_bundle_include_multi_send": bool(include_multi_send),
        "total_bundle_include_shared_sol": bool(include_shared_sol),
        "total_bundle_unique_wallets": slot_count,
        "total_bundle_crosslisted_wallets": crosslisted[:24],
        "total_bundle_crosslisted_count": len(crosslisted),
        "single_holders_total_pct": single_pct,
        "single_holders_wallet_count": single_n,
        "single_holders": single_rows,
    }
    result["total_bundle_pct"] = grand if any_data else 0.0
    result["flagged_wallets"] = slot_count
    return result


def _risk_label(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 45:
        return "elevated"
    if score >= 25:
        return "moderate"
    return "lower"


def _pct(v: Any) -> str:
    if v is None:
        return "n/a"
    try:
        return f"{float(v):.2f}%"
    except (TypeError, ValueError):
        return "n/a"


def _enrich_clusters(
    clusters: list[dict[str, Any]],
    holders: list[dict[str, Any]],
    summary: dict[str, Any],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for c in clusters:
        w = c.get("wallet") or ""
        rows = [h for h in holders if h.get("wallet") == w]
        accts = [h.get("token_account") for h in rows if h.get("token_account")]
        pcts = [float(h["pct_supply"]) for h in rows if h.get("pct_supply") is not None]
        combined_pct = sum(pcts) if pcts else None
        # fallback: if only balances known and top10 exists — skip supply pct
        out.append(
            {
                "wallet": w,
                "accounts": c.get("accounts") or len(rows) or 0,
                "combined_balance": c.get("combined_balance"),
                "pct_supply": combined_pct,
                "token_accounts": accts,
                "label": next((h.get("label") for h in rows if h.get("label")), None),
            }
        )
    return sorted(out, key=lambda x: (-(x.get("accounts") or 0), -(x.get("pct_supply") or 0)))


def _similar_group_sum_pct(
    group: dict[str, Any],
    member_rows: list[Any] | None = None,
) -> float | None:
    """Sum of percent holdings for wallets in one similar-size group."""
    if group.get("total_pct") is not None:
        try:
            v = float(group["total_pct"])
            return min(100.0, round(v, 4))
        except (TypeError, ValueError):
            pass
    rows = list(member_rows or group.get("members") or [])
    total = 0.0
    n = 0
    for m in rows:
        if not isinstance(m, dict):
            continue
        try:
            pct = float(m["pct_supply"]) if m.get("pct_supply") is not None else None
        except (TypeError, ValueError):
            pct = None
        if pct is None:
            continue
        total += pct
        n += 1
    if n:
        return min(100.0, round(total, 4))
    # Fallback: count × average (approx when per-wallet % missing)
    try:
        avg = float(group["avg_pct"]) if group.get("avg_pct") is not None else None
    except (TypeError, ValueError):
        avg = None
    if avg is None:
        return None
    count = int(group.get("count") or len(group.get("wallets") or []) or 0)
    if count <= 0:
        return None
    return min(100.0, round(avg * count, 4))


def _similar_size_total_percent(
    groups: list[dict[str, Any]],
) -> tuple[float | None, int]:
    """
    Combined supply % of unique wallets that appear in similar-size groups.
    Uses each group's avg_pct per unique wallet (first group wins if overlap).
    """
    seen: set[str] = set()
    total = 0.0
    for g in groups or []:
        try:
            avg = float(g.get("avg_pct")) if g.get("avg_pct") is not None else None
        except (TypeError, ValueError):
            avg = None
        if avg is None:
            continue
        for w in g.get("wallets") or []:
            addr = (w or "").strip()
            if not addr or addr in seen:
                continue
            seen.add(addr)
            total += avg
    if not seen:
        return None, 0
    if total > 100.0:
        total = 100.0
    return round(total, 4), len(seen)


def _similar_size_groups(holders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group non-program top wallets with nearly equal pct_supply / balance."""
    rows: list[dict[str, Any]] = []
    for h in holders:
        if h.get("is_known_program") or is_known_lp_label(h.get("label")):
            continue
        pct = h.get("pct_supply")
        bal = h.get("balance")
        try:
            pct_f = float(pct) if pct is not None else None
        except (TypeError, ValueError):
            pct_f = None
        try:
            bal_f = float(bal) if bal is not None else None
        except (TypeError, ValueError):
            bal_f = None
        if pct_f is None and bal_f is None:
            continue
        # ignore dust / trivial
        if pct_f is not None and pct_f < 0.15:
            continue
        rows.append(
            {
                "wallet": h.get("wallet"),
                "pct": pct_f,
                "bal": bal_f,
                "rank": h.get("rank"),
            }
        )

    if len(rows) < 3:
        return []

    # Greedy clustering: near-exact bag sizes only.
    # Real same-size bundles usually fund exact (or float-noise) amounts —
    # not a ~10–12% spread (e.g. 2.0% vs 2.2% is not a default bundle match).
    used: set[int] = set()
    groups: list[dict[str, Any]] = []
    for i, a in enumerate(rows):
        if i in used:
            continue
        members = [a]
        used.add(i)
        for j, b in enumerate(rows):
            if j in used or j == i:
                continue
            if _similar(a, b):
                members.append(b)
                used.add(j)
        if len(members) >= 3:
            pcts = [m["pct"] for m in members if m.get("pct") is not None]
            # Keep address list for callers; members include per-wallet % holdings
            wallet_rows = []
            for m in members:
                w = m.get("wallet")
                if not w:
                    continue
                wallet_rows.append({"wallet": w, "pct_supply": m.get("pct")})
            total_pct = round(sum(pcts), 4) if pcts else None
            if total_pct is not None and total_pct > 100.0:
                total_pct = 100.0
            groups.append(
                {
                    "wallets": [r["wallet"] for r in wallet_rows],
                    "members": wallet_rows,
                    "count": len(members),
                    "avg_pct": (sum(pcts) / len(pcts)) if pcts else None,
                    "min_pct": min(pcts) if pcts else None,
                    "max_pct": max(pcts) if pcts else None,
                    # Sum of this group's wallet holdings (% of supply)
                    "total_pct": total_pct,
                }
            )
    return sorted(groups, key=lambda g: -int(g.get("count") or 0))


def _similar(
    a: dict[str, Any],
    b: dict[str, Any],
    *,
    rel_tol: float = 0.005,
    abs_tol_pct: float = 0.02,
    rel_tol_bal: float = 0.005,
) -> bool:
    """
    Near-exact bag match (coordinated same-size wallets).

    Bundle tooling typically sends the *same* amount to many wallets (exact),
    or intentionally scrambles sizes. A loose 10–12% band (e.g. 2.0% vs 2.2%)
    is not a default same-send fingerprint — treat those as different bags.

    Match if either:
      • absolute supply-% gap ≤ abs_tol_pct (default 0.02 percentage points), or
      • relative gap ≤ rel_tol (default 0.5%) for float noise on larger bags
    Same idea on raw balance when % is missing.
    """
    if a.get("pct") is not None and b.get("pct") is not None:
        pa, pb = float(a["pct"]), float(b["pct"])
        gap = abs(pa - pb)
        # tiny epsilon so 2.00 vs 2.02 is not lost to float noise
        if gap <= abs_tol_pct + 1e-9:
            return True
        base = max(pa, pb, 1e-9)
        return (gap / base) <= rel_tol + 1e-12
    if a.get("bal") is not None and b.get("bal") is not None:
        ba, bb = float(a["bal"]), float(b["bal"])
        base = max(ba, bb, 1e-9)
        return abs(ba - bb) / base <= rel_tol_bal + 1e-12
    return False


def _suspect_wallets(
    clusters: list[dict[str, Any]] | None,
    insiders: list[dict[str, Any]],
    groups: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Legacy helper (no longer used for Bundles UI).

    Kept for any residual callers/tests. Product model is now:
      multi-account = own category
      Suspect = similar-size only (UI rename)
      old Rugcheck-only suspect list removed
    """
    bag: dict[str, dict[str, Any]] = {}

    def _add(wallet: str | None, reason: str, pct: Any = None) -> None:
        if not wallet:
            return
        w = str(wallet).strip()
        if not w or len(w) < 20:
            return
        row = bag.setdefault(
            w, {"wallet": w, "reasons": [], "sources": [], "pct_supply": None}
        )
        if reason and reason not in row["reasons"]:
            row["reasons"].append(reason)
        src = reason.split("(")[0].strip().lower()
        if "multi" in src and "multi-account" not in row["sources"]:
            row["sources"].append("multi-account")
        elif "similar" in src and "similar-size" not in row["sources"]:
            row["sources"].append("similar-size")
        elif "insider" in src or "rugcheck" in src:
            if "rugcheck" not in row["sources"]:
                row["sources"].append("rugcheck")
        if pct is not None:
            try:
                new = float(pct)
                old = (
                    float(row["pct_supply"])
                    if row.get("pct_supply") is not None
                    else None
                )
                if old is None or new > old:
                    row["pct_supply"] = new
            except (TypeError, ValueError):
                if row.get("pct_supply") is None:
                    row["pct_supply"] = pct

    for c in clusters or []:
        if not isinstance(c, dict):
            continue
        w = c.get("wallet") or c.get("owner")
        pct = (
            c.get("pct_supply")
            if c.get("pct_supply") is not None
            else c.get("combined_pct")
        )
        _add(w, "multi-account cluster", pct)

    for g in groups or []:
        if not isinstance(g, dict):
            continue
        avg = g.get("avg_pct")
        members = list(g.get("members") or [])
        if members:
            for m in members:
                if isinstance(m, dict):
                    _add(
                        m.get("wallet"),
                        "similar-size group",
                        m.get("pct_supply")
                        if m.get("pct_supply") is not None
                        else avg,
                    )
                else:
                    _add(m, "similar-size group", avg)
        else:
            for w in g.get("wallets") or []:
                if isinstance(w, dict):
                    _add(
                        w.get("wallet"),
                        "similar-size group",
                        w.get("pct_supply")
                        if w.get("pct_supply") is not None
                        else avg,
                    )
                else:
                    _add(w, "similar-size group", avg)

    for h in insiders or []:
        if not isinstance(h, dict):
            continue
        if h.get("insider") is False:
            continue
        if "insider" in h and not h.get("insider"):
            continue
        _add(h.get("wallet"), "insider-flagged (Rugcheck)", h.get("pct_supply"))

    return sorted(
        bag.values(),
        key=lambda x: (
            -len(x.get("reasons") or []),
            -(
                float(x["pct_supply"])
                if x.get("pct_supply") is not None
                else 0
            ),
            str(x.get("wallet") or ""),
        ),
    )


def _similar_wallet_set(groups: list[dict[str, Any]] | None) -> set[str]:
    out: set[str] = set()
    for g in groups or []:
        if not isinstance(g, dict):
            continue
        for w in g.get("wallets") or []:
            a = (str(w) if w is not None else "").strip()
            if a:
                out.add(a)
        for m in g.get("members") or []:
            if isinstance(m, dict):
                a = (str(m.get("wallet") or "")).strip()
            else:
                a = (str(m) if m is not None else "").strip()
            if a:
                out.add(a)
    return out


def _filter_similar_groups_excluding(
    groups: list[dict[str, Any]] | None,
    exclude: set[str],
) -> list[dict[str, Any]]:
    """Drop excluded wallets from similar-size groups; omit empty groups."""
    if not groups:
        return []
    if not exclude:
        return list(groups)
    out: list[dict[str, Any]] = []
    for g in groups:
        if not isinstance(g, dict):
            continue
        gg = dict(g)
        wallets = []
        for w in g.get("wallets") or []:
            a = (str(w) if w is not None else "").strip()
            if a and a not in exclude:
                wallets.append(w if isinstance(w, str) else a)
        members = []
        for m in g.get("members") or []:
            if isinstance(m, dict):
                a = (str(m.get("wallet") or "")).strip()
                if a and a not in exclude:
                    members.append(m)
            else:
                a = (str(m) if m is not None else "").strip()
                if a and a not in exclude:
                    members.append(m)
        if not wallets and not members:
            continue
        if wallets:
            gg["wallets"] = wallets
        elif "wallets" in gg:
            gg["wallets"] = []
        if members:
            gg["members"] = members
        elif "members" in gg:
            gg["members"] = []
        # Recount if present
        n = len(wallets) or len(members)
        if n:
            gg["wallet_count"] = n
            gg["count"] = n
        out.append(gg)
    return out


def _partition_similar_and_suspect(
    similar_groups: list[dict[str, Any]] | None,
    suspect_wallets: list[dict[str, Any]] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Ensure no wallet appears in both Similar-size and Suspect.

    Priority when a wallet would be in both (e.g. multi-ATA + similar bag):
      keep on Suspect (multi / insider), strip from Similar-size groups.

    Suspect list itself is already unique-by-wallet and multi/insider only.
    """
    suspects = list(suspect_wallets or [])
    # Unique by wallet inside suspect (keep richest reasons / max pct)
    bag: dict[str, dict[str, Any]] = {}
    for s in suspects:
        if not isinstance(s, dict):
            continue
        w = (str(s.get("wallet") or "")).strip()
        if not w:
            continue
        # Drop legacy similar-size-only rows if any residual still present
        reasons = [
            r
            for r in (s.get("reasons") or [])
            if "similar-size" not in str(r).lower()
            and "similar size" not in str(r).lower()
        ]
        if not reasons and s.get("reasons"):
            # Was only similar-size tagged — not a real suspect anymore
            continue
        row = dict(s)
        if reasons:
            row["reasons"] = reasons
        if w not in bag:
            bag[w] = row
            continue
        # Merge
        prev = bag[w]
        prev_reasons = list(prev.get("reasons") or [])
        for r in reasons or []:
            if r not in prev_reasons:
                prev_reasons.append(r)
        prev["reasons"] = prev_reasons
        try:
            p0 = float(prev["pct_supply"]) if prev.get("pct_supply") is not None else None
            p1 = float(row["pct_supply"]) if row.get("pct_supply") is not None else None
            if p1 is not None and (p0 is None or p1 > p0):
                prev["pct_supply"] = row["pct_supply"]
        except (TypeError, ValueError):
            pass
        bag[w] = prev

    suspects_u = sorted(
        bag.values(),
        key=lambda x: (
            -len(x.get("reasons") or []),
            -(
                float(x["pct_supply"])
                if x.get("pct_supply") is not None
                else 0
            ),
        ),
    )
    suspect_set = {
        (str(s.get("wallet") or "")).strip()
        for s in suspects_u
        if (str(s.get("wallet") or "")).strip()
    }
    # Strip suspect wallets out of similar groups so lists never overlap
    similar_f = _filter_similar_groups_excluding(similar_groups, suspect_set)
    return similar_f, suspects_u


def build_bundles_ui_payload(data: dict[str, Any] | None) -> dict[str, Any]:
    """
    Trimmed structured payload for the website Bundles card UI.
    No raw JSON dump in the tab — frontend renders cards/tables from this.
    """
    data = data if isinstance(data, dict) else {}
    if not data.get("ok"):
        return {
            "ok": False,
            "error": data.get("error")
            or data.get("notes")
            or "Bundles unavailable — run full Analyze on a Solana mint.",
        }

    s = data.get("summary") if isinstance(data.get("summary"), dict) else {}

    def _wallet_row(w: Any, pct: Any = None, **extra: Any) -> dict[str, Any] | None:
        addr = (str(w) if w is not None else "").strip()
        if not addr or len(addr) < 20:
            return None
        row: dict[str, Any] = {"wallet": addr}
        if pct is not None:
            try:
                row["pct_supply"] = float(pct)
            except (TypeError, ValueError):
                pass
        for k, v in extra.items():
            if v is not None and v != "":
                row[k] = v
        return row

    # Multi-account clusters (own category)
    clusters_out: list[dict[str, Any]] = []
    for c in list(data.get("clusters") or [])[:12]:
        if not isinstance(c, dict):
            continue
        pct = c.get("pct_supply")
        if pct is None:
            pct = c.get("combined_pct")
        clusters_out.append(
            {
                "wallet": c.get("wallet") or c.get("owner"),
                "pct_supply": pct,
                "accounts": c.get("accounts"),
                "token_accounts": list(c.get("token_accounts") or [])[:6],
            }
        )

    # Similar-size groups → Similar-sized section (list all members, not top-10 only)
    similar_out: list[dict[str, Any]] = []
    for g in list(data.get("similar_size_groups") or [])[:12]:
        if not isinstance(g, dict):
            continue
        members: list[dict[str, Any]] = []
        member_rows = list(g.get("members") or [])
        if not member_rows:
            for w in g.get("wallets") or []:
                if isinstance(w, dict):
                    member_rows.append(
                        {
                            "wallet": w.get("wallet") or w.get("address"),
                            "pct_supply": w.get("pct_supply")
                            if w.get("pct_supply") is not None
                            else g.get("avg_pct"),
                        }
                    )
                else:
                    member_rows.append(
                        {"wallet": w, "pct_supply": g.get("avg_pct")}
                    )
        seen_m: set[str] = set()
        for m in member_rows[:60]:
            if isinstance(m, dict):
                r = _wallet_row(
                    m.get("wallet") or m.get("address"),
                    m.get("pct_supply"),
                )
            else:
                r = _wallet_row(m, g.get("avg_pct"))
            if not r:
                continue
            ww = r["wallet"]
            if ww in seen_m:
                continue
            seen_m.add(ww)
            members.append(r)
        members.sort(
            key=lambda r: (
                -(
                    float(r["pct_supply"])
                    if r.get("pct_supply") is not None
                    else -1.0
                ),
                str(r.get("wallet") or ""),
            )
        )
        # Prefer unique-wallet sum for group total
        g_tot, _g_n = _sum_wallets_pct(members)
        similar_out.append(
            {
                "avg_pct": g.get("avg_pct"),
                "min_pct": g.get("min_pct"),
                "max_pct": g.get("max_pct"),
                "total_pct": g_tot
                if g_tot is not None
                else g.get("total_pct"),
                "wallets": members,
                "count": len(members)
                or len(g.get("wallets") or [])
                or len(member_rows),
            }
        )

    # Rugcheck insider-flagged — part of Suspect section (with similar-size)
    insiders_out: list[dict[str, Any]] = []
    for h in list(data.get("insider_wallets") or [])[:20]:
        if not isinstance(h, dict):
            continue
        r = _wallet_row(
            h.get("wallet"),
            h.get("pct_supply"),
            label=h.get("label") or "insider-flagged (Rugcheck)",
            rank=h.get("rank"),
            source="rugcheck_insider",
        )
        if r:
            insiders_out.append(r)

    # Funding / shared SOL funder
    funding_out: list[dict[str, Any]] = []
    for fc in list(data.get("funding_clusters") or [])[:8]:
        if not isinstance(fc, dict):
            continue
        kids: list[dict[str, Any]] = []
        for row in list(fc.get("child_rows") or [])[:12]:
            if isinstance(row, dict):
                r = _wallet_row(row.get("wallet"), row.get("pct_supply"))
                if r:
                    kids.append(r)
        if not kids:
            for c in list(fc.get("children") or [])[:12]:
                if isinstance(c, dict):
                    r = _wallet_row(c.get("wallet"), c.get("pct_supply"))
                else:
                    r = _wallet_row(c)
                if r:
                    kids.append(r)
        funding_out.append(
            {
                "funder": fc.get("funder") or fc.get("sender"),
                "funder_pct": fc.get("funder_pct") or fc.get("sender_pct"),
                "child_count": fc.get("child_count") or len(kids),
                "total_pct": fc.get("total_pct"),
                "children": kids,
            }
        )

    # Fresh wallets
    fresh_out: list[dict[str, Any]] = []
    for fw in list(data.get("fresh_wallets") or [])[:24]:
        if not isinstance(fw, dict):
            continue
        r = _wallet_row(
            fw.get("wallet"),
            fw.get("pct_supply"),
            sol=fw.get("sol"),
            other_tokens=fw.get("other_tokens"),
            tag=fw.get("tag") or "sole-token",
        )
        if r:
            fresh_out.append(r)
    fresh_out.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    fresh_tot, fresh_n = _sum_wallets_pct(fresh_out)

    # Multi-send (token + SOL)
    def _ms_cluster(mc: dict[str, Any], kind: str) -> dict[str, Any]:
        kids: list[dict[str, Any]] = []
        for row in list(mc.get("child_rows") or [])[:16]:
            if isinstance(row, dict):
                r = _wallet_row(row.get("wallet"), row.get("pct_supply"))
                if r:
                    kids.append(r)
        if not kids:
            for c in list(mc.get("receivers") or mc.get("children") or [])[:16]:
                if isinstance(c, dict):
                    r = _wallet_row(c.get("wallet"), c.get("pct_supply"))
                else:
                    r = _wallet_row(c)
                if r:
                    kids.append(r)
        kids.sort(
            key=lambda r: (
                -(
                    float(r["pct_supply"])
                    if r.get("pct_supply") is not None
                    else -1.0
                ),
                str(r.get("wallet") or ""),
            )
        )
        sender = mc.get("sender") or mc.get("funder")
        sp = mc.get("sender_pct") if mc.get("sender_pct") is not None else mc.get("funder_pct")
        sum_rows = list(kids)
        if sender:
            sum_rows.append({"wallet": sender, "pct_supply": sp})
        tot, n = _sum_wallets_pct(sum_rows)
        return {
            "kind": kind,
            "sender": sender,
            "sender_pct": sp,
            "receiver_count": mc.get("receiver_count")
            or mc.get("child_count")
            or len(kids),
            "total_pct": mc.get("total_pct") if mc.get("total_pct") is not None else tot,
            "wallets_with_pct": n,
            "receivers": kids,
        }

    token_ms = [
        _ms_cluster(mc, "token")
        for mc in list(data.get("multi_send_clusters") or [])[:10]
        if isinstance(mc, dict)
    ]
    sol_ms = [
        _ms_cluster(mc, "sol")
        for mc in list(data.get("sol_multi_send_clusters") or [])[:8]
        if isinstance(mc, dict)
    ]
    # Flat unique multi-send wallets for list UI = TOKEN multi-send only.
    # Must match Multi-send total % (do NOT mix Shared SOL / sol-* wallets here —
    # those inflated Holds while Multi-send total stayed empty/0).
    # SOL funder fan-outs stay under sol_multi_send_clusters (+ Shared SOL section).
    ms_by: dict[str, dict[str, Any]] = {}
    for mc in token_ms:
        role_s = "token-sender"
        role_r = "token-receiver"
        if mc.get("sender"):
            cur = ms_by.get(mc["sender"]) or {
                "wallet": mc["sender"],
                "pct_supply": mc.get("sender_pct"),
                "roles": [],
            }
            if mc.get("sender_pct") is not None:
                try:
                    pf = float(mc["sender_pct"])
                    if cur.get("pct_supply") is None or pf > float(
                        cur.get("pct_supply") or 0
                    ):
                        cur["pct_supply"] = pf
                except (TypeError, ValueError):
                    pass
            if role_s not in cur["roles"]:
                cur["roles"].append(role_s)
            ms_by[mc["sender"]] = cur
        for r in mc.get("receivers") or []:
            w = (r.get("wallet") or "").strip()
            if not w:
                continue
            cur = ms_by.get(w) or {
                "wallet": w,
                "pct_supply": r.get("pct_supply"),
                "roles": [],
            }
            if r.get("pct_supply") is not None:
                try:
                    pf = float(r["pct_supply"])
                    if cur.get("pct_supply") is None or pf > float(
                        cur.get("pct_supply") or 0
                    ):
                        cur["pct_supply"] = pf
                except (TypeError, ValueError):
                    pass
            if role_r not in cur["roles"]:
                cur["roles"].append(role_r)
            ms_by[w] = cur
    ms_list = list(ms_by.values())
    ms_list.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    # Multi-send total = unique Holds on token multi-send list (not Shared SOL).
    # If wallets are listed but none have %, show 0% (not blank).
    ms_tot, ms_n = _sum_wallets_pct(ms_list)
    if ms_list:
        if ms_tot is None:
            ms_tot = 0.0
        ms_n = max(int(ms_n or 0), len(ms_list))
    elif s.get("multi_send_total_pct") is not None:
        try:
            ms_tot = float(s.get("multi_send_total_pct"))
            ms_n = int(s.get("multi_send_wallet_with_pct") or 0)
        except (TypeError, ValueError):
            pass
    # Build pct map from token clusters so split totals don't need holders map
    ms_pct_map: dict[str, float] = {}
    for r in ms_list:
        w = (r.get("wallet") or "").strip()
        if not w or r.get("pct_supply") is None:
            continue
        try:
            ms_pct_map[w] = float(r["pct_supply"])
        except (TypeError, ValueError):
            pass
    ms_split = _multi_send_split_totals(
        {
            "multi_send_clusters": token_ms,
            "sol_multi_send_clusters": [],  # totals are token multi-send only
        },
        ms_pct_map,
    )

    # Launch-window same-slot groups
    slots_out: list[dict[str, Any]] = []
    for g in list(data.get("same_slot_groups") or [])[:12]:
        if not isinstance(g, dict):
            continue
        rows: list[dict[str, Any]] = []
        for row in list(g.get("wallet_rows") or [])[:16]:
            if isinstance(row, dict):
                r = _wallet_row(
                    row.get("wallet"),
                    row.get("pct_supply"),
                    label=row.get("label"),
                )
                if r:
                    rows.append(r)
        if not rows:
            for w in list(g.get("wallets") or [])[:16]:
                r = _wallet_row(w)
                if r:
                    rows.append(r)
        if len(rows) < 2:
            continue
        tot, n = _sum_wallets_pct(rows)
        slots_out.append(
            {
                "slot": g.get("slot"),
                "block_time": g.get("block_time") or g.get("time_utc"),
                "wallet_count": len(rows),
                "total_pct": tot,
                "wallets_with_pct": n,
                "wallets": rows,
            }
        )

    # UI "Suspect" = similar-size + Rugcheck insiders (unique); not multi-account
    suspects_out: list[dict[str, Any]] = []
    sus_tot = s.get("suspect_total_pct")
    sus_n = s.get("suspect_wallet_count")
    if sus_tot is None or sus_n is None:
        try:
            u_pct, u_n = _suspect_union_percent(
                list(data.get("similar_size_groups") or []),
                list(data.get("insider_wallets") or []),
            )
            if sus_tot is None:
                sus_tot = u_pct
            if sus_n is None:
                sus_n = u_n
        except Exception:  # noqa: BLE001
            if sus_tot is None:
                sus_tot = s.get("similar_size_total_pct")
            if sus_n is None:
                sus_n = s.get("similar_size_wallet_count")
    try:
        if sus_tot is not None:
            sus_tot = float(sus_tot)
    except (TypeError, ValueError):
        sus_tot = None
    try:
        if sus_n is not None:
            sus_n = int(sus_n)
    except (TypeError, ValueError):
        sus_n = 0

    # Single holders list (non-category ≥0.01%) — full table for Bundles UI
    # Never include Similar-sized wallets (near-exact bags + Rugcheck insiders).
    similar_block = _similar_sized_wallet_set(data)
    # Also block anything already listed in similar_out / insiders_out this paint
    for g in similar_out:
        for m in g.get("wallets") or []:
            a = _wallet_addr(m)
            if a:
                similar_block.add(a)
    for h in insiders_out:
        a = _wallet_addr(h)
        if a:
            similar_block.add(a)

    single_src = list(data.get("single_holders") or [])
    if not single_src:
        try:
            single_src = _single_holders_rows(data)
        except Exception:  # noqa: BLE001
            single_src = []
    single_out: list[dict[str, Any]] = []
    seen_single: set[str] = set()
    for h in single_src:
        if not isinstance(h, dict):
            continue
        r = _wallet_row(
            h.get("wallet"),
            h.get("pct_supply"),
            rank=h.get("rank"),
            balance=h.get("balance"),
            label=h.get("label"),
        )
        if not r:
            continue
        w = r["wallet"]
        if not w or w in seen_single or w in similar_block:
            continue
        seen_single.add(w)
        single_out.append(r)
    # Rebuild from holders if cached single_holders still had similar bleed
    if not single_out and (data.get("holders") or []):
        try:
            for h in _single_holders_rows(data):
                r = _wallet_row(
                    h.get("wallet"),
                    h.get("pct_supply"),
                    rank=h.get("rank"),
                    balance=h.get("balance"),
                    label=h.get("label"),
                )
                if not r or r["wallet"] in similar_block or r["wallet"] in seen_single:
                    continue
                seen_single.add(r["wallet"])
                single_out.append(r)
        except Exception:  # noqa: BLE001
            pass
    single_out.sort(
        key=lambda r: (
            -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
            str(r.get("wallet") or ""),
        )
    )
    single_tot, single_n = _sum_wallets_pct(single_out)
    # Always stamp cleaned totals (never keep a stale total that included similar)
    s = dict(s)
    s["single_holders_total_pct"] = single_tot
    s["single_holders_wallet_count"] = single_n

    # Signals
    signals_out: list[dict[str, Any]] = []
    for sig in list(data.get("signals") or [])[:20]:
        if not isinstance(sig, dict):
            continue
        signals_out.append(
            {
                "id": sig.get("id"),
                "severity": sig.get("severity") or "info",
                "title": sig.get("title"),
                "detail": sig.get("detail"),
            }
        )

    reports = data.get("source_reports") if isinstance(data.get("source_reports"), dict) else {}
    providers = {
        "helius": reports.get("helius_ok"),
        "rugcheck": reports.get("rugcheck_ok"),
        "birdeye": reports.get("birdeye_ok"),
        "jito_style": reports.get("jito_style_ok"),
        "jito_engine": reports.get("jito_engine_ok"),
    }

    return {
        "ok": True,
        "method": data.get("method"),
        "source": data.get("source"),
        "summary": {
            "bundle_risk": s.get("bundle_risk"),
            "bundle_risk_score": s.get("bundle_risk_score"),
            "total_bundle_pct": s.get("total_bundle_pct"),
            "flagged_wallets": s.get("flagged_wallets"),
            "total_bundle_by_vector": s.get("total_bundle_by_vector"),
            "total_bundle_additive": s.get("total_bundle_additive"),
            "total_bundle_cross_vector_dedupe": s.get(
                "total_bundle_cross_vector_dedupe"
            ),
            "total_bundle_excluded_vectors": s.get(
                "total_bundle_excluded_vectors"
            ),
            "total_bundle_mode": s.get("total_bundle_mode"),
            "total_bundle_show_similar_suspect": s.get(
                "total_bundle_show_similar_suspect"
            ),
            "total_bundle_unique_wallets": s.get("total_bundle_unique_wallets")
            or s.get("flagged_wallets"),
            "total_bundle_include_fresh": s.get("total_bundle_include_fresh"),
            "total_bundle_include_multi_send": s.get(
                "total_bundle_include_multi_send"
            ),
            "total_bundle_include_shared_sol": s.get(
                "total_bundle_include_shared_sol"
            ),
            "total_bundle_crosslisted_count": s.get(
                "total_bundle_crosslisted_count"
            ),
            "multi_account_clusters": s.get("multi_account_clusters") or len(clusters_out),
            "multi_account_total_pct": s.get("multi_account_total_pct"),
            "multi_account_wallet_count": s.get("multi_account_wallet_count")
            or len(clusters_out),
            "similar_size_groups": s.get("similar_size_groups") or len(similar_out),
            "similar_size_total_pct": s.get("similar_size_total_pct"),
            "similar_size_wallet_count": s.get("similar_size_wallet_count"),
            "insider_accounts": s.get("insider_accounts") or 0,
            "top10_pct_excluding_known_programs": s.get(
                "top10_pct_excluding_known_programs"
            ),
            "fresh_total_pct": s.get("fresh_total_pct")
            if s.get("fresh_total_pct") is not None
            else fresh_tot,
            "fresh_wallet_count": s.get("fresh_wallet_count") or len(fresh_out),
            "fresh_wallet_with_pct": s.get("fresh_wallet_with_pct") or fresh_n,
            # List-sum wins so Multi-send total always matches visible Holds
            "multi_send_total_pct": ms_tot
            if ms_tot is not None
            else s.get("multi_send_total_pct"),
            "multi_send_wallet_with_pct": ms_n
            if ms_n
            else (s.get("multi_send_wallet_with_pct") or 0),
            "multi_send_sender_total_pct": ms_split.get("sender_total_pct")
            if ms_split.get("sender_total_pct") is not None
            else s.get("multi_send_sender_total_pct"),
            "multi_send_sender_count": ms_split.get("sender_count")
            if ms_split.get("sender_count") is not None
            else s.get("multi_send_sender_count"),
            "multi_send_receiver_total_pct": ms_split.get("receiver_total_pct")
            if ms_split.get("receiver_total_pct") is not None
            else s.get("multi_send_receiver_total_pct"),
            "multi_send_receiver_count": ms_split.get("receiver_count")
            if ms_split.get("receiver_count") is not None
            else s.get("multi_send_receiver_count"),
            "multi_send_hold_shape": ms_split.get("hold_shape")
            or s.get("multi_send_hold_shape"),
            "multi_send_error": s.get("multi_send_error"),
            "multi_send_txs_scanned": s.get("multi_send_txs_scanned"),
            "multi_send_sigs_available": s.get("multi_send_sigs_available"),
            "multi_send_edge_senders": s.get("multi_send_edge_senders"),
            "multi_send_scan_notes": s.get("multi_send_scan_notes"),
            "fresh_error": s.get("fresh_error"),
            "funding_error": s.get("funding_error"),
            "funding_total_pct": s.get("funding_total_pct"),
            "funding_wallet_count": s.get("funding_wallet_count"),
            "fresh_from_cache": s.get("fresh_from_cache"),
            "multi_send_from_cache": s.get("multi_send_from_cache"),
            "funding_from_cache": s.get("funding_from_cache"),
            "fresh_cached_at": s.get("fresh_cached_at"),
            "multi_send_cached_at": s.get("multi_send_cached_at"),
            "funding_cached_at": s.get("funding_cached_at"),
            "token_multi_send_clusters": s.get("token_multi_send_clusters")
            or len(token_ms),
            "sol_multi_send_clusters": s.get("sol_multi_send_clusters") or len(sol_ms),
            "suspect_total_pct": sus_tot,
            "suspect_wallet_count": sus_n if sus_n else len(suspects_out),
            "single_holders_total_pct": s.get("single_holders_total_pct")
            if s.get("single_holders_total_pct") is not None
            else single_tot,
            "single_holders_wallet_count": s.get("single_holders_wallet_count")
            if s.get("single_holders_wallet_count") is not None
            else (single_n if single_n else len(single_out)),
            "sources_used": list(s.get("sources_used") or [])[:16],
        },
        "providers": providers,
        "signals": signals_out,
        "clusters": clusters_out,
        "similar_size_groups": similar_out,
        "insider_wallets": insiders_out,
        "funding_clusters": funding_out,
        "fresh_wallets": fresh_out,
        "multi_send_wallets": ms_list[:32],
        "multi_send_clusters": token_ms,
        "sol_multi_send_clusters": sol_ms,
        "same_slot_groups": [],  # launch-window disabled
        "suspect_wallets": suspects_out,
        "single_holders": single_out,
    }
