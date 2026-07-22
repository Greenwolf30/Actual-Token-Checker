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

    suspect_wallets = _suspect_wallets(multi_clusters, similar_groups, insiders)
    total_pct, flagged_n = _total_bundle_percent(
        holders=holders,
        clusters=multi_clusters,
        similar_groups=similar_groups,
        insiders=insiders,
        suspects=suspect_wallets,
    )
    suspect_pct, suspect_n = _suspect_total_percent(suspect_wallets)
    # Combined % of unique wallets that sit in similar-size groups
    similar_total_pct, similar_wallet_n = _similar_size_total_percent(similar_groups)

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
            "similar_size_groups": len(similar_groups),
            "similar_size_total_pct": similar_total_pct,
            "similar_size_wallet_count": similar_wallet_n,
            "insider_accounts": len(insiders),
            "non_lp_top_wallets": len(non_lp),
            "top10_pct_excluding_known_programs": top10_ex_f,
            "unique_wallets_in_top": summary.get("unique_wallets_in_top"),
            "accounts_scanned": summary.get("accounts_returned") or len(holders),
            # Combined % of supply across unique wallets flagged as bundle-related
            "total_bundle_pct": total_pct,
            "flagged_wallets": flagged_n,
            # Sum of unique suspect wallets' supply %
            "suspect_total_pct": suspect_pct,
            "suspect_wallet_count": suspect_n,
        },
        "signals": signals,
        "clusters": multi_clusters,
        "similar_size_groups": similar_groups,
        "insider_wallets": [
            {
                "wallet": h.get("wallet"),
                "rank": h.get("rank"),
                "pct_supply": h.get("pct_supply"),
                "balance": h.get("balance"),
                "label": h.get("label"),
            }
            for h in insiders[:15]
        ],
        "suspect_wallets": suspect_wallets[:20],
        "meta": {
            "holder_source": holders_data.get("source"),
            "rpc_endpoint_host": meta.get("rpc_endpoint_host"),
            "rugcheck_score": meta.get("rugcheck_score"),
        },
        "notes": (
            "Bundle detection is heuristic from a top-holder snapshot only. "
            "Suspect total % = sum of unique suspect wallets' supply %. "
            "Comprehensive mode also scans launch-window same-slot multi-buys, "
            "1-hop SOL funding, fresh/sole-token wallets, and token multi-send "
            "(Helius). Not a full commercial sniper graph."
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
                f"  ({s.get('flagged_wallets')} flagged wallet(s))"
                if s.get("flagged_wallets")
                else ""
            )
        )
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
        lines.append(f"  Similar groups:  {sg_n}")
    else:
        lines.append(_empty_line("Similar groups"))
    # Total % of unique wallets that sit in similar-size groups (combined supply)
    sim_pct = s.get("similar_size_total_pct")
    sim_n = s.get("similar_size_wallet_count")
    if sim_pct is None and (data.get("similar_size_groups") or []):
        sim_pct, sim_n = _similar_size_total_percent(
            list(data.get("similar_size_groups") or [])
        )
    sim_f = _num(sim_pct)
    if sim_f is not None and sim_f > 0:
        lines.append(
            f"  Similar-size total: {_pct(sim_pct)}"
            + (f"  ({sim_n} wallet(s))" if sim_n else "")
        )
    else:
        lines.append(_empty_line("Similar-size total"))
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

    # Multi-send total % (unique senders + receivers across token + SOL clusters)
    ms_pct = s.get("multi_send_total_pct")
    ms_n = s.get("multi_send_wallet_with_pct")
    if ms_pct is None and (
        data.get("multi_send_clusters") or data.get("sol_multi_send_clusters")
    ):
        try:
            ms_pct, ms_n = _multi_send_total_percent(data, {})
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

    groups = data.get("similar_size_groups") or []
    if groups:
        lines.append("")
        # Category total across all similar-size wallets (unique)
        all_sim_rows: list[dict[str, Any]] = []
        for g in groups:
            member_rows = list(g.get("members") or [])
            if not member_rows:
                member_rows = [
                    {"wallet": w, "pct_supply": g.get("avg_pct")}
                    for w in (g.get("wallets") or [])
                ]
            for m in member_rows:
                if isinstance(m, dict):
                    all_sim_rows.append(m)
                else:
                    all_sim_rows.append(
                        {"wallet": m, "pct_supply": g.get("avg_pct")}
                    )
        sim_cat_total, sim_cat_n = _sum_wallets_pct(all_sim_rows)
        lines.append("── SIMILAR-SIZE GROUPS ──")
        lines.append(
            f"  total {_pct(sim_cat_total)} across {sim_cat_n} wallet(s):"
        )
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
    else:
        lines.append("")
        lines.append("── SIMILAR-SIZE GROUPS ──")
        lines.append(
            "  (none — no similar-size groups this scan)"
        )

    # Wallet → supply % map for sections that only had addresses
    pct_map = _wallet_pct_map(data)
    label_map = _wallet_label_map(data)

    insiders = data.get("insider_wallets") or []
    lines.append("")
    lines.append("── INSIDER-FLAGGED ──")
    if insiders:
        ins_total, ins_n = _sum_wallets_pct(
            [
                {
                    "wallet": h.get("wallet"),
                    "pct_supply": h.get("pct_supply")
                    if h.get("pct_supply") is not None
                    else pct_map.get((h.get("wallet") or "").strip()),
                }
                for h in insiders
            ]
        )
        total_s = _pct(ins_total) if ins_total is not None else "n/a"
        lines.append(
            f"  Rugcheck — total {total_s} across {ins_n} wallet(s):"
        )
        for h in insiders[:12]:
            w = (h.get("wallet") or "").strip()
            pct = h.get("pct_supply")
            if pct is None and w in pct_map:
                pct = pct_map[w]
            lines.append(
                f"    #{h.get('rank') or '—'} {w}  holds {_pct(pct)}"
            )
    else:
        lines.append(
            "  (none — no Rugcheck insider-flagged wallets this scan)"
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
                    _add_ms_wallet(rs, pct_map.get(str(rs or "").strip()), roles=["token-receiver"])
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
                    _add_ms_wallet(row, pct_map.get(str(row or "").strip()), roles=["token-receiver"])

        for mc in sol_ms:
            sender = (mc.get("sender") or "").strip()
            sp = mc.get("sender_pct")
            if sp is None and sender:
                sp = pct_map.get(sender)
            _add_ms_wallet(sender, sp, roles=["sol-sender"])
            child_rows = list(mc.get("child_rows") or [])
            kids = list(mc.get("receivers") or mc.get("children") or [])
            if not child_rows:
                for c in kids:
                    ws = c if isinstance(c, str) else (c or {}).get("wallet")
                    _add_ms_wallet(ws, pct_map.get(str(ws or "").strip()), roles=["sol-receiver"])
            for row in child_rows:
                if isinstance(row, dict):
                    _add_ms_wallet(
                        row.get("wallet"),
                        row.get("pct_supply")
                        if row.get("pct_supply") is not None
                        else pct_map.get(str(row.get("wallet") or "").strip()),
                        roles=["sol-receiver"],
                    )
                else:
                    _add_ms_wallet(row, pct_map.get(str(row or "").strip()), roles=["sol-receiver"])

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
        split = _multi_send_split_totals(
            {
                "multi_send_clusters": token_ms,
                "sol_multi_send_clusters": sol_ms,
            },
            pct_map,
        )
        lines.append(
            f"  Multi-send wallets — combined {_pct(ms_tot)} across {ms_n} wallet(s) "
            f"(LP/bonding curve excluded):"
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

    # Launch-window same-slot groups
    slots = data.get("same_slot_groups") or []
    lines.append("")
    lines.append("── LAUNCH-WINDOW ──")
    # Glossary (Slot / launch-window / same-slot / holds %) lives in
    # DOCUMENTATION.txt §6.3c — not repeated in the Bundles UI.
    def _is_lp_row(r: dict[str, Any]) -> bool:
        if r.get("is_known_program"):
            return True
        lab = str(
            r.get("label") or label_map.get((r.get("wallet") or "").strip()) or ""
        )
        low = lab.lower()
        return any(
            k in low
            for k in (
                "liquidity",
                "raydium",
                "orca",
                "meteora",
                "pool",
                "vault",
                "pump",
                "amm",
                "bonding",
            )
        )

    if slots:
        # Rebuild non-LP groups for display + totals
        shown_groups: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
        launch_rows: list[dict[str, Any]] = []
        for g in slots:
            if g.get("wallet_rows"):
                rows = list(g.get("wallet_rows") or [])
            else:
                wallets = list(g.get("wallets") or [])
                rows = [
                    {
                        "wallet": w,
                        "pct_supply": pct_map.get((w or "").strip()),
                        "label": label_map.get((w or "").strip()),
                    }
                    for w in wallets
                ]
            rows = [r for r in rows if not _is_lp_row(r)]
            if len(rows) < 2:
                continue
            shown_groups.append((g, rows))
            for r in rows:
                ws = (r.get("wallet") or "").strip()
                if ws:
                    launch_rows.append(
                        {
                            "wallet": ws,
                            "pct_supply": r.get("pct_supply")
                            if r.get("pct_supply") is not None
                            else pct_map.get(ws),
                        }
                    )
        if shown_groups:
            launch_total, launch_n = _sum_wallets_pct(launch_rows)
            lines.append(
                f"  Same-slot multi-buys — total {_pct(launch_total)} across "
                f"{launch_n} wallet(s):"
            )
            for g, rows in shown_groups[:5]:
                g_total, g_n = _sum_wallets_pct(rows)
                total_s = _pct(g_total) if g_total is not None else "n/a"
                slot_when = _fmt_unix_utc(g.get("block_time"))
                slot_head = f"    • slot {g.get('slot')}"
                if slot_when:
                    slot_head += f" @ {slot_when}"
                lines.append(
                    f"{slot_head}: {g.get('unique_buyers') or g_n} wallets / "
                    f"{g.get('tx_count')} txs  ·  total {total_s}"
                )
                for row in rows[:10]:
                    w = (row.get("wallet") or "").strip()
                    # Prefer wallet first-buy ts; fall back to slot block_time
                    when = (
                        row.get("first_buy_ts")
                        or row.get("block_time")
                        or g.get("block_time")
                    )
                    lines.append(
                        _fmt_wallet_hold_line(
                            w,
                            row.get("pct_supply")
                            if row.get("pct_supply") is not None
                            else pct_map.get(w),
                            label=row.get("label") or label_map.get(w),
                            is_lp=False,
                            when=when,
                        )
                    )
                if len(rows) > 10:
                    lines.append(f"         … +{len(rows) - 10} more")
        else:
            lines.append(
                "  (none — no same-slot multi-buys in launch window this scan)"
            )
    else:
        lines.append(
            "  (none — no same-slot multi-buys in launch window this scan)"
        )

    suspects = data.get("suspect_wallets") or []
    lines.append("")
    lines.append("── SUSPECT WALLETS ──")
    if suspects:
        # Prefer summary field; recompute if missing
        suspect_total = s.get("suspect_total_pct")
        suspect_n = s.get("suspect_wallet_count")
        if suspect_total is None:
            suspect_total, suspect_n = _suspect_total_percent(suspects)
        lines.append(
            f"  Suspect wallets — total {_pct(suspect_total)} across "
            f"{suspect_n or len(suspects)} wallet(s):"
        )
        for sw in suspects[:12]:
            reasons = ", ".join(sw.get("reasons") or [])
            w = (sw.get("wallet") or "").strip()
            lab = sw.get("label") or label_map.get(w)
            # Wallet + percent holdings; reasons on next line
            lines.append(
                f"    • {w}  holds {_pct(sw.get('pct_supply'))}"
                + (f"  [{lab}]" if lab else "")
            )
            if reasons:
                lines.append(f"      {reasons}")
        if len(suspects) > 12:
            lines.append(f"    … +{len(suspects) - 12} more")
    else:
        lines.append(
            "  (none — no suspect wallets tagged this scan)"
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
        },
        "signals": [],
        "clusters": [],
        "similar_size_groups": [],
        "insider_wallets": [],
        "suspect_wallets": [],
        "notes": msg,
    }


def _suspect_total_percent(
    suspects: list[dict[str, Any]],
) -> tuple[float | None, int]:
    """Sum unique suspect wallets' supply % (cap 100)."""
    return _sum_wallets_pct(suspects or [])


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
        if pct is None:
            by_w.setdefault(w, by_w.get(w, 0.0))
            continue
        by_w[w] = max(by_w.get(w, 0.0), pct)
    if not by_w:
        return None, 0
    total = sum(by_w.values())
    if total > 100.0:
        total = 100.0
    has_any = any(v > 0 for v in by_w.values())
    return (round(total, 4) if has_any else 0.0), len(by_w)


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
        if p is None:
            combined_map.setdefault(w, combined_map.get(w, 0.0))
            continue
        combined_map[w] = max(combined_map.get(w, 0.0), p)
    if not combined_map:
        ct, cn = None, 0
    else:
        total = sum(combined_map.values())
        if total > 100.0:
            total = 100.0
        has_any = any(v > 0 for v in combined_map.values())
        ct = round(total, 4) if has_any else 0.0
        cn = len(combined_map)

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
    # Cap display weirdness
    if total > 100.0:
        total = 100.0
    return round(total, 4), len(usable)


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

    # Greedy clustering: relative similarity within 12%
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


def _similar(a: dict[str, Any], b: dict[str, Any], tol: float = 0.12) -> bool:
    """Relative match on pct preferred, else balance."""
    if a.get("pct") is not None and b.get("pct") is not None:
        pa, pb = float(a["pct"]), float(b["pct"])
        base = max(pa, pb, 1e-9)
        return abs(pa - pb) / base <= tol
    if a.get("bal") is not None and b.get("bal") is not None:
        ba, bb = float(a["bal"]), float(b["bal"])
        base = max(ba, bb, 1e-9)
        return abs(ba - bb) / base <= tol
    return False


def _suspect_wallets(
    clusters: list[dict[str, Any]],
    groups: list[dict[str, Any]],
    insiders: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    bag: dict[str, dict[str, Any]] = {}

    def _add(wallet: str | None, reason: str, pct: Any = None) -> None:
        if not wallet:
            return
        row = bag.setdefault(wallet, {"wallet": wallet, "reasons": [], "pct_supply": pct})
        if reason not in row["reasons"]:
            row["reasons"].append(reason)
        if pct is not None and row.get("pct_supply") is None:
            row["pct_supply"] = pct

    for c in clusters:
        _add(
            c.get("wallet"),
            "multi Associated Token Account cluster",
            c.get("pct_supply"),
        )
    for g in groups:
        for w in g.get("wallets") or []:
            _add(w, "similar-size group", g.get("avg_pct"))
    for h in insiders:
        _add(h.get("wallet"), "insider flag", h.get("pct_supply"))

    return sorted(
        bag.values(),
        key=lambda x: (-len(x.get("reasons") or []), -(float(x["pct_supply"]) if x.get("pct_supply") is not None else 0)),
    )


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

    # Multi-account clusters
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

    # Similar-size groups
    similar_out: list[dict[str, Any]] = []
    for g in list(data.get("similar_size_groups") or [])[:8]:
        if not isinstance(g, dict):
            continue
        members: list[dict[str, Any]] = []
        member_rows = list(g.get("members") or [])
        if not member_rows:
            for w in g.get("wallets") or []:
                member_rows.append({"wallet": w, "pct_supply": g.get("avg_pct")})
        for m in member_rows[:10]:
            if isinstance(m, dict):
                r = _wallet_row(m.get("wallet"), m.get("pct_supply"))
            else:
                r = _wallet_row(m, g.get("avg_pct"))
            if r:
                members.append(r)
        similar_out.append(
            {
                "avg_pct": g.get("avg_pct"),
                "min_pct": g.get("min_pct"),
                "max_pct": g.get("max_pct"),
                "total_pct": g.get("total_pct"),
                "wallets": members,
                "count": len(members)
                or len(g.get("wallets") or [])
                or len(member_rows),
            }
        )

    # Insiders
    insiders_out: list[dict[str, Any]] = []
    for h in list(data.get("insider_wallets") or [])[:16]:
        if not isinstance(h, dict):
            continue
        r = _wallet_row(h.get("wallet"), h.get("pct_supply"), rank=h.get("rank"))
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
    # Flat unique multi-send wallets for list UI
    ms_by: dict[str, dict[str, Any]] = {}
    for mc in token_ms + sol_ms:
        role_s = "token-sender" if mc.get("kind") == "token" else "sol-sender"
        role_r = "token-receiver" if mc.get("kind") == "token" else "sol-receiver"
        if mc.get("sender"):
            cur = ms_by.get(mc["sender"]) or {
                "wallet": mc["sender"],
                "pct_supply": mc.get("sender_pct"),
                "roles": [],
            }
            if mc.get("sender_pct") is not None:
                try:
                    pf = float(mc["sender_pct"])
                    if cur.get("pct_supply") is None or pf > float(cur.get("pct_supply") or 0):
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
            cur = ms_by.get(w) or {"wallet": w, "pct_supply": r.get("pct_supply"), "roles": []}
            if r.get("pct_supply") is not None:
                try:
                    pf = float(r["pct_supply"])
                    if cur.get("pct_supply") is None or pf > float(cur.get("pct_supply") or 0):
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
    ms_tot, ms_n = _sum_wallets_pct(ms_list)
    ms_split = _multi_send_split_totals(
        {
            "multi_send_clusters": token_ms,
            "sol_multi_send_clusters": sol_ms,
        },
        {},
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

    # Suspects
    suspects_out: list[dict[str, Any]] = []
    for srow in list(data.get("suspect_wallets") or [])[:24]:
        if not isinstance(srow, dict):
            continue
        reasons = srow.get("reasons") or srow.get("reason")
        if isinstance(reasons, str):
            reasons = [reasons]
        r = _wallet_row(
            srow.get("wallet"),
            srow.get("pct_supply"),
            reasons=list(reasons or [])[:6],
        )
        if r:
            suspects_out.append(r)
    sus_tot, sus_n = _sum_wallets_pct(suspects_out)
    if s.get("suspect_total_pct") is not None:
        try:
            sus_tot = float(s.get("suspect_total_pct"))
        except (TypeError, ValueError):
            pass
    if s.get("suspect_wallet_count") is not None:
        try:
            sus_n = int(s.get("suspect_wallet_count"))
        except (TypeError, ValueError):
            pass

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
            "multi_account_clusters": s.get("multi_account_clusters") or len(clusters_out),
            "similar_size_groups": s.get("similar_size_groups") or len(similar_out),
            "similar_size_total_pct": s.get("similar_size_total_pct"),
            "similar_size_wallet_count": s.get("similar_size_wallet_count"),
            "insider_accounts": s.get("insider_accounts") or len(insiders_out),
            "top10_pct_excluding_known_programs": s.get(
                "top10_pct_excluding_known_programs"
            ),
            "fresh_total_pct": s.get("fresh_total_pct")
            if s.get("fresh_total_pct") is not None
            else fresh_tot,
            "fresh_wallet_count": s.get("fresh_wallet_count") or len(fresh_out),
            "fresh_wallet_with_pct": s.get("fresh_wallet_with_pct") or fresh_n,
            "multi_send_total_pct": s.get("multi_send_total_pct")
            if s.get("multi_send_total_pct") is not None
            else ms_tot,
            "multi_send_wallet_with_pct": s.get("multi_send_wallet_with_pct") or ms_n,
            "multi_send_sender_total_pct": s.get("multi_send_sender_total_pct")
            if s.get("multi_send_sender_total_pct") is not None
            else ms_split.get("sender_total_pct"),
            "multi_send_sender_count": s.get("multi_send_sender_count")
            if s.get("multi_send_sender_count") is not None
            else ms_split.get("sender_count"),
            "multi_send_receiver_total_pct": s.get("multi_send_receiver_total_pct")
            if s.get("multi_send_receiver_total_pct") is not None
            else ms_split.get("receiver_total_pct"),
            "multi_send_receiver_count": s.get("multi_send_receiver_count")
            if s.get("multi_send_receiver_count") is not None
            else ms_split.get("receiver_count"),
            "multi_send_hold_shape": s.get("multi_send_hold_shape")
            or ms_split.get("hold_shape"),
            "multi_send_error": s.get("multi_send_error"),
            "token_multi_send_clusters": s.get("token_multi_send_clusters")
            or len(token_ms),
            "sol_multi_send_clusters": s.get("sol_multi_send_clusters") or len(sol_ms),
            "suspect_total_pct": sus_tot,
            "suspect_wallet_count": sus_n if sus_n else len(suspects_out),
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
        "same_slot_groups": slots_out,
        "suspect_wallets": suspects_out,
    }
