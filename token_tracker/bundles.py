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

    # Similar-size groups among non-program wallets (heuristic bundle)
    similar_groups = _similar_size_groups(holders)

    insiders = [h for h in holders if h.get("insider")]
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
            "Comprehensive mode also scans launch-window same-slot multi-buys "
            "and 1-hop SOL funding clusters (Helius). Not a full commercial sniper graph."
        ),
    }


def format_bundles_text(data: dict[str, Any]) -> str:
    if not data.get("ok"):
        return (
            "── BUNDLES ──\n"
            f"  {data.get('error') or data.get('notes') or 'unavailable'}\n"
        )

    s = data.get("summary") or {}
    total_bp = s.get("total_bundle_pct")
    if total_bp is not None and float(total_bp or 0) > 0:
        total_line = (
            f"  Total % bundles: {_pct(total_bp)}"
            + (
                f"  ({s.get('flagged_wallets')} flagged wallet(s))"
                if s.get("flagged_wallets")
                else ""
            )
        )
    else:
        total_line = "  Total % bundles will show here if value returns True"
    src_list = s.get("sources_used") or []
    # Section markers (── TITLE ──) are colored dim-green in the UI (titles only).
    lines = [
        "── BUNDLES / COORDINATED WALLETS ──",
        f"  Method:          {data.get('method')}",
        f"  Sources:         {', '.join(src_list) if src_list else (data.get('source') or 'n/a')}",
        f"  Bundle risk:     {s.get('bundle_risk')}  (score {s.get('bundle_risk_score')}/100)",
        total_line,
    ]
    cl_n = int(s.get("multi_account_clusters") or 0)
    sg_n = int(s.get("similar_size_groups") or 0)
    if cl_n > 0:
        lines.append(
            f"  Clusters:        {cl_n} multi Associated Token Account wallet(s)"
        )
    else:
        lines.append("  Clusters will show here if value returns True")
    if sg_n > 0:
        lines.append(f"  Similar groups:  {sg_n}")
    else:
        lines.append("  Similar groups will show here if value returns True")
    # Total % of unique wallets that sit in similar-size groups (combined supply)
    sim_pct = s.get("similar_size_total_pct")
    sim_n = s.get("similar_size_wallet_count")
    if sim_pct is None and (data.get("similar_size_groups") or []):
        sim_pct, sim_n = _similar_size_total_percent(
            list(data.get("similar_size_groups") or [])
        )
    if sim_pct is not None and float(sim_pct or 0) > 0:
        lines.append(
            f"  Similar-size total: {_pct(sim_pct)}"
            + (f"  ({sim_n} wallet(s))" if sim_n else "")
        )
    else:
        lines.append(
            "  Similar-size total will show here if value returns True"
        )
    ins_n = int(s.get("insider_accounts") or 0)
    if ins_n > 0:
        lines.append(f"  Insider accts:   {ins_n}")
    else:
        lines.append(
            "  Insider accounts will show here if value returns True"
        )
    top10 = s.get("top10_pct_excluding_known_programs")
    if top10 is not None and float(top10 or 0) > 0:
        lines.append(f"  Top10 ex-LP:     {_pct(top10)}")
    else:
        lines.append("  Top10 ex-LP will show here if value returns True")
    lines.append("")
    lines.append("  Signals:")
    sigs = list(data.get("signals") or [])
    if sigs:
        for sig in sigs:
            sev = (sig.get("severity") or "info").upper()
            lines.append(f"    [{sev}] {sig.get('title')}")
            lines.append(f"           {sig.get('detail')}")
    else:
        lines.append("    Signals will show here if value returns True")

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
            "  Multi-account clusters will show here if value returns True"
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
            "  Similar-size wallet groups will show here if value returns True"
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
            "  Insider-flagged wallets will show here if value returns True"
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
            "  Shared SOL funder clusters will show here if value returns True"
        )

    # Launch-window same-slot groups
    slots = data.get("same_slot_groups") or []
    lines.append("")
    lines.append("── LAUNCH-WINDOW ──")
    lines.append(
        "  Slot = Solana chain time unit (~400ms). Same-slot multi-buys = several "
        "different wallets buy this mint in the same slot (often at launch)."
    )
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
                f"{launch_n} wallet(s) (Pump.fun / known LP vaults excluded):"
            )
            for g, rows in shown_groups[:5]:
                g_total, g_n = _sum_wallets_pct(rows)
                total_s = _pct(g_total) if g_total is not None else "n/a"
                lines.append(
                    f"    • slot {g.get('slot')}: {g.get('unique_buyers') or g_n} wallets / "
                    f"{g.get('tx_count')} txs  ·  total {total_s}"
                )
                for row in rows[:10]:
                    w = (row.get("wallet") or "").strip()
                    lines.append(
                        _fmt_wallet_hold_line(
                            w,
                            row.get("pct_supply")
                            if row.get("pct_supply") is not None
                            else pct_map.get(w),
                            label=row.get("label") or label_map.get(w),
                            is_lp=False,
                        )
                    )
                if len(rows) > 10:
                    lines.append(f"         … +{len(rows) - 10} more")
        else:
            lines.append(
                "  Launch-window same-slot multi-buys will show here if value returns True"
            )
    else:
        lines.append(
            "  Launch-window same-slot multi-buys will show here if value returns True"
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
            f"  Union of signals — total {_pct(suspect_total)} across "
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
            "  Suspect wallets will show here if value returns True"
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


def _fmt_wallet_hold_line(
    wallet: str,
    pct: Any,
    *,
    label: str | None = None,
    is_lp: bool = False,
) -> str:
    """Single Bundles line: wallet holds X% [optional LP label]."""
    lab = (label or "").strip()
    if is_lp and not lab:
        lab = "Known liquidity / program"
    suffix = f"  [{lab}]" if lab else ""
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
        if h.get("is_known_program"):
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
