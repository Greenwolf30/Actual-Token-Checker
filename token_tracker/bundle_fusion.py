"""
Fuse Helius + Rugcheck + Birdeye + Jito-style signals into one comprehensive
bundle report for the Bundles tab.
"""

from __future__ import annotations

from typing import Any

from . import bundles as bun
from . import bundle_sources as src
from . import optional_scan_cache as osc


def comprehensive_bundle_check(
    mint: str,
    *,
    pair_address: str | None = None,
    chain_id: str = "solana",
    include_fresh: bool = True,
    include_multi_send: bool = True,
    include_shared_sol: bool = True,
    include_fresh_multi_send: bool | None = None,
) -> dict[str, Any]:
    """
    Full multi-API bundle check.

    Returns same shape as analyze_bundles() plus fusion fields:
      sources_used, source_reports, fusion_signals, comprehensive_score

    include_fresh / include_multi_send / include_shared_sol control optional
    Helius scans (saves credits / RPS when off; other bundle signals still run).
    When a checkbox is OFF, last known results for that mint (from a prior
    Analyze with the box ON) are reused — no new Helius pings for that scan.
    Checking ON again re-scans live and updates the store.
    include_fresh_multi_send=False (legacy) turns fresh + multi-send off.
    """
    if include_fresh_multi_send is False:
        include_fresh = False
        include_multi_send = False
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
    # Launch-window (jito_style same-slot) disabled — never add as source
    if jito_eng.get("ok"):
        sources_used.append("jito_engine")
    # funding added after scan (appended when clusters found)

    # Build synthetic holders_data for heuristic layer from Helius (primary)
    # enriched with Rugcheck insiders + Birdeye tags; aggregate by owner (not ATA)
    # Apply same known-LP / program tags as Holders tab (pair + Pump PDAs + map)
    holders_data = _merge_holder_layers(
        helius,
        rug,
        bird,
        mint=mint,
        pair_address=pair_address,
    )
    base = bun.analyze_bundles(holders_data)
    # Keep holders on payload so format_bundles can attach % to launch/funding wallets
    if base.get("ok") and holders_data.get("holders"):
        base = dict(base)
        base["holders"] = list(holders_data.get("holders") or [])

    fusion_signals: list[dict[str, Any]] = []
    extra_score = 0
    funding_report: dict[str, Any] = {"ok": False, "clusters": []}

    # wallet → pct / LP label for enriching launch/funding lists
    pct_by_w: dict[str, float] = {}
    label_by_w: dict[str, str] = {}
    lp_wallets: set[str] = set()
    try:
        from . import holders as hold_mod

        # Pump PDAs + all DexScreener pairs (Meteora, Raydium, PumpSwap, …)
        lp_wallets |= hold_mod.known_pool_addresses_for_mint(mint)
    except Exception:  # noqa: BLE001
        pass
    for h in holders_data.get("holders") or []:
        if not isinstance(h, dict):
            continue
        w = (h.get("wallet") or "").strip()
        if not w:
            continue
        try:
            if h.get("pct_supply") is not None:
                pct_by_w[w] = max(pct_by_w.get(w, 0.0), float(h["pct_supply"]))
        except (TypeError, ValueError):
            pass
        lab = (h.get("label") or "").strip()
        if lab:
            label_by_w[w] = lab
        if h.get("is_known_program") or (
            lab
            and any(
                k in lab.lower()
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
        ):
            lp_wallets.add(w)

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

    # Launch-window / same-slot multi-buys: disabled (no Helius scan; not in
    # Bundles or Ruggers). Empty lists so UI never shows a launch section.
    groups: list = []
    if base.get("ok"):
        base = dict(base)
        base["same_slot_groups"] = []
        base["early_buyers"] = []

    # Funding hops: common SOL funder among suspects / similar-size
    seed_wallets: list[str] = []
    if base.get("ok"):
        for s in base.get("suspect_wallets") or []:
            if s.get("wallet"):
                seed_wallets.append(str(s["wallet"]))
        for g in base.get("similar_size_groups") or []:
            for w in g.get("wallets") or []:
                seed_wallets.append(str(w))
            for m in g.get("members") or []:
                if isinstance(m, dict) and m.get("wallet"):
                    seed_wallets.append(str(m["wallet"]))

    shared_sol_from_cache = False
    if include_shared_sol:
        try:
            funding_report = src.analyze_funding_clusters(seed_wallets)
        except Exception as exc:  # noqa: BLE001
            funding_report = {"ok": False, "error": str(exc), "clusters": []}
    else:
        # No Helius — reuse last known Shared SOL for this mint if any
        cached_ss = osc.get_slice(mint, "shared_sol")
        if cached_ss and list(cached_ss.get("funding_clusters") or []):
            shared_sol_from_cache = True
            funding_report = {
                "ok": True,
                "clusters": list(cached_ss.get("raw_clusters") or [])
                or [
                    {
                        "funder": fc.get("funder"),
                        "children": [
                            (
                                r.get("wallet")
                                if isinstance(r, dict)
                                else r
                            )
                            for r in list(fc.get("child_rows") or fc.get("children") or [])
                        ],
                        "child_count": fc.get("child_count")
                        or len(fc.get("children") or []),
                        "severity": fc.get("severity") or "high",
                    }
                    for fc in list(cached_ss.get("funding_clusters") or [])
                    if isinstance(fc, dict)
                ],
                "from_cache": True,
                "txs_scanned": cached_ss.get("txs_scanned") or 0,
                "scanned_at": cached_ss.get("scanned_at"),
            }
            # Prefer already-enriched clusters from cache
            if base.get("ok") and cached_ss.get("funding_clusters"):
                base = dict(base)
                base["funding_clusters"] = list(cached_ss.get("funding_clusters") or [])
                s0 = dict(base.get("summary") or {})
                s0["funding_clusters"] = len(base["funding_clusters"])
                s0["funding_from_cache"] = True
                if cached_ss.get("scanned_at"):
                    s0["funding_cached_at"] = cached_ss.get("scanned_at")
                s0.pop("funding_error", None)
                try:
                    fund_rows_c: list[dict[str, Any]] = []
                    for efc in base["funding_clusters"]:
                        if not isinstance(efc, dict):
                            continue
                        fund_rows_c.append(
                            {
                                "wallet": efc.get("funder"),
                                "pct_supply": efc.get("funder_pct")
                                if efc.get("funder_pct") is not None
                                else pct_by_w.get(str(efc.get("funder") or "").strip()),
                            }
                        )
                        for cr in list(efc.get("child_rows") or []):
                            if isinstance(cr, dict):
                                fund_rows_c.append(cr)
                    ft_c, fn_c = bun._sum_wallets_pct(fund_rows_c)  # type: ignore[attr-defined]
                    s0["funding_total_pct"] = ft_c
                    s0["funding_wallet_count"] = fn_c
                except Exception:  # noqa: BLE001
                    pass
                base["summary"] = s0
        else:
            funding_report = {
                "ok": False,
                "clusters": [],
                "skipped": True,
                "error": "Shared SOL funder scan off (enable “Shared SOL” to run).",
            }
            if base.get("ok"):
                base = dict(base)
                base["funding_clusters"] = []
                s0 = dict(base.get("summary") or {})
                s0["funding_clusters"] = 0
                s0["funding_error"] = funding_report["error"]
                base["summary"] = s0

    if funding_report.get("ok") and (funding_report.get("clusters") or []):
        if "funding_1hop" not in sources_used:
            sources_used.append(
                "funding_1hop_cached" if shared_sol_from_cache else "funding_1hop"
            )
        f_clusters = list(funding_report.get("clusters") or [])
        best_f = f_clusters[0] if f_clusters else {}
        # Skip re-enrich if we already injected cached enriched clusters
        already = bool(
            shared_sol_from_cache
            and base.get("ok")
            and list(base.get("funding_clusters") or [])
        )
        if not already:
            fusion_signals.append(
                {
                    "id": "funding_cluster",
                    "provider": "funding",
                    "severity": best_f.get("severity") or "high",
                    "title": "Shared SOL funder (1-hop)"
                    + (" (last known)" if shared_sol_from_cache else ""),
                    "detail": (
                        f"{best_f.get('child_count')} suspect wallets funded by "
                        f"{best_f.get('funder')} — classic split-wallet bundle. "
                        f"{len(f_clusters)} funder cluster(s) found "
                        f"(scanned {funding_report.get('txs_scanned') or 0} txs)."
                        + (
                            " Reused last Analyze (no Helius re-scan)."
                            if shared_sol_from_cache
                            else ""
                        )
                    ),
                }
            )
            if not shared_sol_from_cache:
                extra_score += min(
                    28, 12 + int(best_f.get("child_count") or 0) * 4
                )
            # Always attach Shared SOL clusters (even if multi-account base failed)
            # so Total can count them when Shared SOL is checked.
            enriched_fc = []
            for fc in f_clusters[:8]:
                ff = dict(fc)
                kids = list(fc.get("children") or [])
                child_rows = [
                    {"wallet": c, "pct_supply": pct_by_w.get(c)} for c in kids
                ]
                funder = (fc.get("funder") or "").strip()
                tot, n = bun._sum_wallets_pct(child_rows)  # type: ignore[attr-defined]
                if funder and funder in pct_by_w:
                    try:
                        tot = min(
                            100.0, float(tot or 0) + float(pct_by_w[funder])
                        )
                    except (TypeError, ValueError):
                        pass
                ff["child_rows"] = child_rows
                ff["funder_pct"] = pct_by_w.get(funder)
                ff["total_pct"] = tot
                ff["wallets_with_pct"] = n
                enriched_fc.append(ff)
            if not base.get("ok"):
                base = {
                    "ok": True,
                    "method": "funding_fresh_multi_shell",
                    "source": "helius",
                    "summary": dict(base.get("summary") or {}),
                    "signals": list(base.get("signals") or []),
                    "holders": list(holders_data.get("holders") or [])[:80]
                    if isinstance(holders_data, dict)
                    else [],
                    "clusters": [],
                    "similar_size_groups": [],
                    "suspect_wallets": [],
                    "insider_wallets": [],
                }
            else:
                base = dict(base)
            # Old Rugcheck-only suspect list not used; UI Suspect = similar-size
            base["suspect_wallets"] = []
            base["funding_clusters"] = enriched_fc
            s0 = dict(base.get("summary") or {})
            # Keep Suspect total = similar-size (do not overwrite with empty old list)
            if s0.get("suspect_total_pct") is None and s0.get(
                "similar_size_total_pct"
            ) is not None:
                s0["suspect_total_pct"] = s0.get("similar_size_total_pct")
                s0["suspect_wallet_count"] = s0.get("similar_size_wallet_count")
            s0["funding_clusters"] = len(f_clusters)
            # Unique wallet total % across funders + children (for Bundles header)
            try:
                fund_rows: list[dict[str, Any]] = []
                for efc in enriched_fc:
                    if not isinstance(efc, dict):
                        continue
                    fund_rows.append(
                        {
                            "wallet": efc.get("funder"),
                            "pct_supply": efc.get("funder_pct"),
                        }
                    )
                    for cr in list(efc.get("child_rows") or []):
                        if isinstance(cr, dict):
                            fund_rows.append(cr)
                ft_ss, fn_ss = bun._sum_wallets_pct(fund_rows)  # type: ignore[attr-defined]
                s0["funding_total_pct"] = ft_ss
                s0["funding_wallet_count"] = fn_ss
            except Exception:  # noqa: BLE001
                pass
            if shared_sol_from_cache:
                s0["funding_from_cache"] = True
                if funding_report.get("scanned_at"):
                    s0["funding_cached_at"] = funding_report.get("scanned_at")
            base["summary"] = s0
            if include_shared_sol and enriched_fc:
                osc.put_slice(
                    mint,
                    "shared_sol",
                    {
                        "ok": True,
                        "funding_clusters": enriched_fc,
                        "raw_clusters": f_clusters[:8],
                        "txs_scanned": funding_report.get("txs_scanned") or 0,
                    },
                )
        elif shared_sol_from_cache:
            fusion_signals.append(
                {
                    "id": "funding_cluster",
                    "provider": "funding",
                    "severity": "info",
                    "title": "Shared SOL funder (1-hop) (last known)",
                    "detail": (
                        "Showing last known Shared SOL clusters for this mint "
                        "(Shared SOL unchecked — no Helius re-scan)."
                    ),
                }
            )

    # ── Fresh / sole-token wallets + token multi-send (one sender → many) ──
    # Seed from non-LP top holders (cap for RPC cost).
    holder_seed: list[str] = []
    try:
        from .holders import is_known_lp_or_program as _is_lp_wallet
    except Exception:  # noqa: BLE001
        def _is_lp_wallet(addr: str, label: str | None = None) -> bool:  # type: ignore[misc]
            return False

    if base.get("ok"):
        for h in (base.get("holders") or helius.get("holders") or [])[:40]:
            if not isinstance(h, dict):
                continue
            hw = (h.get("wallet") or "").strip()
            if not hw or hw in lp_wallets:
                continue
            if _is_lp_wallet(hw, label=str(h.get("label") or "")):
                continue
            holder_seed.append(hw)
    # Also seed from suspects / similar / early buyers
    for s in (base.get("suspect_wallets") or [])[:15]:
        if isinstance(s, dict) and s.get("wallet"):
            holder_seed.append(str(s["wallet"]))
    for g in (base.get("similar_size_groups") or [])[:4]:
        for w in g.get("wallets") or []:
            holder_seed.append(str(w))
    for eb in (base.get("early_buyers") or jito_style.get("early_buyers") or [])[:12]:
        if isinstance(eb, dict) and eb.get("wallet"):
            holder_seed.append(str(eb["wallet"]))

    # Dedupe seed
    _seen_seed: set[str] = set()
    holder_seed_u: list[str] = []
    for w in holder_seed:
        a = (w or "").strip()
        if not a or a in _seen_seed:
            continue
        _seen_seed.add(a)
        holder_seed_u.append(a)

    fresh_report: dict[str, Any] = {"ok": False, "wallets": []}
    multi_send_report: dict[str, Any] = {"ok": False, "clusters": []}
    multi_send_error = None
    fresh_from_cache = False
    multi_send_from_cache = False
    if include_fresh:
        try:
            # Cap wallets for free Helius ~10 RPS (fresh = 2+ RPCs each)
            fresh_report = src.analyze_fresh_wallets(
                mint, holder_seed_u, max_wallets=12
            )
        except Exception as exc:  # noqa: BLE001
            fresh_report = {"ok": False, "error": str(exc), "wallets": []}
    else:
        cached_fr = osc.get_slice(mint, "fresh")
        if cached_fr and list(cached_fr.get("wallets") or []):
            fresh_from_cache = True
            fresh_report = {
                "ok": True,
                "wallets": list(cached_fr.get("wallets") or []),
                "wallets_scanned": cached_fr.get("wallets_scanned") or 0,
                "from_cache": True,
                "scanned_at": cached_fr.get("scanned_at"),
            }
        else:
            fresh_report = {
                "ok": False,
                "wallets": [],
                "skipped": True,
                "error": "Fresh wallets scan off (enable “Fresh” to run).",
            }
            # Always surface scan-off on summary so UI can stamp Last updated
            if base.get("ok"):
                base = dict(base)
                s_fr = dict(base.get("summary") or {})
                s_fr["fresh_error"] = fresh_report["error"]
                s_fr["fresh_from_cache"] = False
                base["summary"] = s_fr
    if include_multi_send:
        try:
            # Wider history: newest + older mint txs (not only last ~20 swaps)
            multi_send_report = src.analyze_token_multi_sends(
                mint, holder_seed_u, max_sigs=80, max_tx_fetch=40
            )
        except Exception as exc:  # noqa: BLE001
            multi_send_report = {"ok": False, "error": str(exc), "clusters": []}
    else:
        cached_ms = osc.get_slice(mint, "multi_send")
        if cached_ms and (
            list(cached_ms.get("clusters") or [])
            or list(cached_ms.get("sol_multi_send_clusters") or [])
        ):
            multi_send_from_cache = True
            multi_send_report = {
                "ok": True,
                "clusters": list(cached_ms.get("clusters") or []),
                "txs_scanned": cached_ms.get("txs_scanned") or 0,
                "from_cache": True,
                "scanned_at": cached_ms.get("scanned_at"),
            }
            # Stash sol multi for later if Multi-send box is off
            multi_send_report["_cached_sol_multi"] = list(
                cached_ms.get("sol_multi_send_clusters") or []
            )
        else:
            multi_send_report = {
                "ok": False,
                "clusters": [],
                "skipped": True,
                "error": "Multi-send scan off (enable “Multi-send” to run).",
            }
            multi_send_error = multi_send_report.get("error")

    # Attach supply % to fresh wallets
    fresh_rows: list[dict[str, Any]] = []
    if fresh_report.get("ok"):
        if "fresh_wallets" not in sources_used:
            sources_used.append("fresh_wallets")
        for fw in list(fresh_report.get("wallets") or [])[:24]:
            if not isinstance(fw, dict):
                continue
            w = (fw.get("wallet") or "").strip()
            if not w or w in lp_wallets:
                continue
            row = dict(fw)
            row["pct_supply"] = pct_by_w.get(w)
            row["wallet"] = w
            fresh_rows.append(row)
        # Largest current supply bag first
        fresh_rows.sort(
            key=lambda r: (
                -(
                    float(r["pct_supply"])
                    if r.get("pct_supply") is not None
                    else -1.0
                ),
                str(r.get("wallet") or ""),
            )
        )
        if fresh_rows:
            fusion_signals.append(
                {
                    "id": "fresh_sole_token",
                    "provider": "helius",
                    "severity": "medium" if len(fresh_rows) < 4 else "high",
                    "title": "Fresh wallets"
                    + (" (last known)" if fresh_from_cache else ""),
                    "detail": (
                        f"{len(fresh_rows)} holder(s) hold this mint with almost no "
                        f"other SPL tokens (scanned {fresh_report.get('wallets_scanned') or 0})."
                        + (
                            " Reused last Analyze (no Helius re-scan)."
                            if fresh_from_cache
                            else ""
                        )
                    ),
                }
            )
            if not fresh_from_cache:
                extra_score += min(18, 6 + len(fresh_rows) * 2)
            if include_fresh and not fresh_from_cache:
                osc.put_slice(
                    mint,
                    "fresh",
                    {
                        "ok": True,
                        "wallets": fresh_rows,
                        "wallets_scanned": fresh_report.get("wallets_scanned") or 0,
                    },
                )

    # Token multi-send clusters + SOL multi-send (from funding clusters)
    # Exclude LP / bonding-curve / known program wallets so pool % (~30%+) is never
    # mistaken for a multi-send sender bag.
    multi_clusters: list[dict[str, Any]] = []
    if multi_send_report.get("ok"):
        if "token_multi_send" not in sources_used:
            sources_used.append("token_multi_send")
        for mc in list(multi_send_report.get("clusters") or [])[:10]:
            if not isinstance(mc, dict):
                continue
            sender = (mc.get("sender") or "").strip()
            if not sender or sender in lp_wallets:
                continue  # never treat LP/bonding curve as multi-send sender
            recs = [
                r
                for r in list(mc.get("receivers") or [])
                if r and str(r).strip() not in lp_wallets and str(r).strip() != sender
            ]
            if len(recs) < 2:
                continue
            child_rows = [
                {"wallet": r, "pct_supply": pct_by_w.get(r)} for r in recs if r
            ]
            # Split: sender bag (one wallet) vs receivers bag (across wallets)
            sender_pct = pct_by_w.get(sender)
            recv_tot, recv_n = bun._sum_wallets_pct(child_rows)  # type: ignore[attr-defined]
            sum_rows = list(child_rows)
            sum_rows.append({"wallet": sender, "pct_supply": sender_pct})
            tot, n = bun._sum_wallets_pct(sum_rows)  # type: ignore[attr-defined]
            # How is supply sitting now?
            try:
                sp_f = float(sender_pct) if sender_pct is not None else 0.0
            except (TypeError, ValueError):
                sp_f = 0.0
            try:
                rt_f = float(recv_tot) if recv_tot is not None else 0.0
            except (TypeError, ValueError):
                rt_f = 0.0
            if sp_f <= 0 and rt_f <= 0:
                hold_shape = "unknown"
            elif sp_f >= rt_f and sp_f > 0:
                hold_shape = "mostly_one_wallet_sender"
            else:
                hold_shape = "mostly_across_receivers"
            multi_clusters.append(
                {
                    "kind": "token_multi_send",
                    "sender": sender,
                    "sender_pct": sender_pct,
                    "receivers": recs,
                    "receiver_count": len(recs),
                    "holders_hit": mc.get("holders_hit"),
                    "child_rows": child_rows,
                    "receivers_total_pct": recv_tot,
                    "receivers_with_pct": recv_n,
                    "total_pct": tot,
                    "wallets_with_pct": n,
                    "hold_shape": hold_shape,
                    "severity": mc.get("severity") or "high",
                }
            )
        # Largest combined supply cluster first
        multi_clusters.sort(
            key=lambda c: (
                -(float(c["total_pct"]) if c.get("total_pct") is not None else -1.0),
                -int(c.get("receiver_count") or 0),
            )
        )
        if multi_clusters:
            best_m = multi_clusters[0]
            shape = best_m.get("hold_shape") or "unknown"
            shape_note = (
                "supply now mostly still on the sender (one wallet)"
                if shape == "mostly_one_wallet_sender"
                else "supply now mostly across receivers (many wallets)"
                if shape == "mostly_across_receivers"
                else "current hold split n/a"
            )
            fusion_signals.append(
                {
                    "id": "token_multi_send",
                    "provider": "helius",
                    "severity": best_m.get("severity") or "high",
                    "title": "Token multi-send (one owner → many)",
                    "detail": (
                        f"Sender {best_m.get('sender')} holds "
                        f"{best_m.get('sender_pct') if best_m.get('sender_pct') is not None else 'n/a'}% now; "
                        f"receivers hold ~{best_m.get('receivers_total_pct') if best_m.get('receivers_total_pct') is not None else 'n/a'}% "
                        f"across {best_m.get('receiver_count')} wallet(s) "
                        f"({shape_note}). "
                        f"{len(multi_clusters)} cluster(s); "
                        f"scanned {multi_send_report.get('txs_scanned') or 0} txs. "
                        f"LP/bonding-curve wallets excluded."
                    ),
                }
            )
            extra_score += min(
                24, 10 + int(best_m.get("receiver_count") or 0) * 2
            )
    else:
        multi_send_error = multi_send_report.get("error") or multi_send_report.get(
            "notes"
        )

    # SOL multi-send = funding clusters re-labeled (one funder → many children).
    # When Multi-send is on: build from current funding (live or Shared SOL cache).
    # When Multi-send is off: reuse last known multi-send slice (incl. SOL clusters).
    sol_multi: list[dict[str, Any]] = []
    if include_multi_send:
        for fc in list((base.get("funding_clusters") if base.get("ok") else None) or [])[:8]:
            if not isinstance(fc, dict):
                continue
            funder = (fc.get("funder") or "").strip()
            if funder and funder in lp_wallets:
                continue
            kids_raw = list(fc.get("children") or [])[:24]
            kids = []
            for c in kids_raw:
                w = c if isinstance(c, str) else (c or {}).get("wallet")
                ws = (str(w) if w is not None else "").strip()
                if ws and ws not in lp_wallets:
                    kids.append(c if isinstance(c, str) else ws)
            child_rows = []
            for row in list(fc.get("child_rows") or []):
                if not isinstance(row, dict):
                    continue
                w = (row.get("wallet") or "").strip()
                if not w or w in lp_wallets:
                    continue
                child_rows.append(row)
            if not child_rows and kids:
                child_rows = [
                    {
                        "wallet": (k if isinstance(k, str) else str(k)),
                        "pct_supply": pct_by_w.get(
                            k if isinstance(k, str) else str(k)
                        ),
                    }
                    for k in kids
                ]
            if len(child_rows) < 2 and len(kids) < 2:
                continue
            recv_tot, recv_n = bun._sum_wallets_pct(child_rows)  # type: ignore[attr-defined]
            sp = (
                fc.get("funder_pct")
                if fc.get("funder_pct") is not None
                else pct_by_w.get(funder)
            )
            sum_rows = list(child_rows)
            if funder:
                sum_rows.append({"wallet": funder, "pct_supply": sp})
            tot, n = bun._sum_wallets_pct(sum_rows)  # type: ignore[attr-defined]
            try:
                sp_f = float(sp) if sp is not None else 0.0
            except (TypeError, ValueError):
                sp_f = 0.0
            try:
                rt_f = float(recv_tot) if recv_tot is not None else 0.0
            except (TypeError, ValueError):
                rt_f = 0.0
            if sp_f <= 0 and rt_f <= 0:
                hold_shape = "unknown"
            elif sp_f >= rt_f and sp_f > 0:
                hold_shape = "mostly_one_wallet_sender"
            else:
                hold_shape = "mostly_across_receivers"
            sol_multi.append(
                {
                    "kind": "sol_multi_send",
                    "sender": funder,
                    "sender_pct": sp,
                    "receivers": kids[:24],
                    "receiver_count": fc.get("child_count")
                    or len(child_rows)
                    or len(kids),
                    "child_rows": child_rows,
                    "receivers_total_pct": recv_tot,
                    "receivers_with_pct": recv_n,
                    "total_pct": tot if tot is not None else fc.get("total_pct"),
                    "wallets_with_pct": n,
                    "hold_shape": hold_shape,
                    "severity": fc.get("severity") or "high",
                }
            )
    elif multi_send_from_cache:
        sol_multi = list(multi_send_report.get("_cached_sol_multi") or [])
    elif multi_send_error is None:
        multi_send_error = "Multi-send scan off (enable “Multi-send” to run)."

    if base.get("ok") or fresh_rows or multi_clusters or sol_multi:
        if not base.get("ok"):
            # Heuristics failed but fresh/multi-send/funding still useful
            keep_fund = list(base.get("funding_clusters") or [])
            keep_sum = dict(base.get("summary") or {})
            base = {
                "ok": True,
                "method": "fresh_multi_send_only",
                "source": "helius",
                "summary": {
                    "bundle_risk_score": min(100, extra_score),
                    "bundle_risk": _risk_label(min(100, extra_score)),
                    "sources_used": list(sources_used),
                    **{
                        k: keep_sum[k]
                        for k in (
                            "funding_total_pct",
                            "funding_wallet_count",
                            "funding_clusters",
                            "funding_from_cache",
                            "funding_cached_at",
                        )
                        if k in keep_sum
                    },
                },
                "signals": list(fusion_signals),
                "holders": list(holders_data.get("holders") or [])[:80]
                if isinstance(holders_data, dict)
                else [],
                "clusters": [],
                "similar_size_groups": [],
                "suspect_wallets": [],
                "funding_clusters": keep_fund,
            }
        else:
            base = dict(base)
        base["fresh_wallets"] = fresh_rows
        base["multi_send_clusters"] = multi_clusters
        base["sol_multi_send_clusters"] = sol_multi
        s0 = dict(base.get("summary") or {})
        s0["fresh_wallet_count"] = len(fresh_rows)
        s0["token_multi_send_clusters"] = len(multi_clusters)
        s0["sol_multi_send_clusters"] = len(sol_multi)
        ft, fn = bun._sum_wallets_pct(  # type: ignore[attr-defined]
            [
                {"wallet": r.get("wallet"), "pct_supply": r.get("pct_supply")}
                for r in fresh_rows
            ]
        )
        s0["fresh_total_pct"] = ft
        s0["fresh_wallet_with_pct"] = fn
        if fresh_from_cache:
            s0["fresh_from_cache"] = True
            if fresh_report.get("scanned_at"):
                s0["fresh_cached_at"] = fresh_report.get("scanned_at")
            s0.pop("fresh_error", None)
        elif not include_fresh:
            s0["fresh_error"] = (
                fresh_report.get("error")
                or "Fresh wallets scan off (enable “Fresh” to run.)"
            )
            s0["fresh_from_cache"] = False
        # Multi-send total = TOKEN multi-send only (Multi-send checkbox).
        # Do NOT fold SOL multi-send / Shared SOL funders into this total —
        # that made Multi-send % == Shared SOL % and look "broken" until Shared SOL was on.
        # SOL multi-send clusters still attach for detail UI when Shared SOL ran.
        ms_shell_token = {
            "multi_send_clusters": multi_clusters,
            "sol_multi_send_clusters": [],
        }
        try:
            mt, mn = bun._multi_send_total_percent(ms_shell_token, pct_by_w)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            mt, mn = None, 0
        if mt is None and multi_clusters:
            mt, mn = 0.0, 0
        s0["multi_send_total_pct"] = mt
        s0["multi_send_wallet_with_pct"] = mn
        # Lightweight scan diagnostics for empty Multi-send UI
        for _k in (
            "txs_scanned",
            "sigs_available",
            "edge_senders",
            "notes",
        ):
            if multi_send_report.get(_k) is not None:
                sk = (
                    "multi_send_scan_notes"
                    if _k == "notes"
                    else "multi_send_" + _k
                )
                val = multi_send_report.get(_k)
                s0[sk] = str(val)[:280] if _k == "notes" else val
        # Split totals for token multi-send only
        try:
            split = bun._multi_send_split_totals(ms_shell_token, pct_by_w)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            split = {}
        s0["multi_send_sender_total_pct"] = split.get("sender_total_pct")
        s0["multi_send_sender_count"] = split.get("sender_count")
        s0["multi_send_receiver_total_pct"] = split.get("receiver_total_pct")
        s0["multi_send_receiver_count"] = split.get("receiver_count")
        s0["multi_send_hold_shape"] = split.get("hold_shape")
        # Optional SOL multi-send total (from Shared SOL data) — separate field
        try:
            smt, smn = bun._multi_send_total_percent(  # type: ignore[attr-defined]
                {
                    "multi_send_clusters": [],
                    "sol_multi_send_clusters": sol_multi,
                },
                pct_by_w,
            )
        except Exception:  # noqa: BLE001
            smt, smn = None, 0
        s0["sol_multi_send_total_pct"] = smt
        s0["sol_multi_send_wallet_with_pct"] = smn
        # Multi-send off + no last-known cache → empty / skipped
        if not include_multi_send and not multi_send_from_cache:
            multi_send_error = (
                multi_send_error
                or "Multi-send scan off (enable “Multi-send” to run)."
            )
            s0["multi_send_total_pct"] = None
            s0["multi_send_wallet_with_pct"] = 0
            s0["multi_send_sender_total_pct"] = None
            s0["multi_send_sender_count"] = 0
            s0["multi_send_receiver_total_pct"] = None
            s0["multi_send_receiver_count"] = 0
            s0["multi_send_hold_shape"] = None
            s0["token_multi_send_clusters"] = 0
            s0["sol_multi_send_clusters"] = 0
            s0["multi_send_error"] = str(multi_send_error)[:240]
            base["multi_send_clusters"] = []
            base["sol_multi_send_clusters"] = []
        elif multi_send_from_cache:
            s0["multi_send_from_cache"] = True
            if multi_send_report.get("scanned_at"):
                s0["multi_send_cached_at"] = multi_send_report.get("scanned_at")
            s0.pop("multi_send_error", None)
        elif multi_send_error and not multi_clusters and not sol_multi:
            s0["multi_send_error"] = str(multi_send_error)[:240]
        # Store live Multi-send for later reuse when box is unchecked
        if include_multi_send and not multi_send_from_cache and (
            multi_clusters or sol_multi
        ):
            osc.put_slice(
                mint,
                "multi_send",
                {
                    "ok": True,
                    "clusters": multi_clusters,
                    "sol_multi_send_clusters": sol_multi,
                    "txs_scanned": multi_send_report.get("txs_scanned") or 0,
                },
            )
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
        base["method"] = "comprehensive_helius_rugcheck_birdeye_jito_funding"
        base["fusion_signals"] = fusion_signals
        base["source_reports"] = {
            "helius_ok": bool(helius.get("ok")),
            "rugcheck_ok": bool(rug.get("ok")),
            "birdeye_ok": bool(bird.get("ok") and not bird.get("skipped")),
            "birdeye_skipped": bool(bird.get("skipped")),
            "jito_style_ok": bool(jito_style.get("ok")),
            "jito_engine_ok": bool(jito_eng.get("ok")),
            "jito_style_groups": len(groups),
            "funding_ok": bool(funding_report.get("ok")),
            "funding_clusters": len(funding_report.get("clusters") or []),
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
        # Total bundle % = unique wallets across counted vectors (no double-count)
        # Also partitions similar vs suspect (no shared wallets; suspect ≠ similar).
        try:
            tb = bun.recompute_total_bundle_all_vectors(
                base,
                include_fresh=include_fresh,
                include_multi_send=include_multi_send,
                include_shared_sol=include_shared_sol,
            )
            s = dict(base.get("summary") or {})
            s["total_bundle_pct"] = tb.get("total_bundle_pct")
            s["flagged_wallets"] = tb.get("flagged_wallets")
            s["total_bundle_by_vector"] = tb.get("total_bundle_by_vector")
            s["total_bundle_additive"] = False
            s["total_bundle_cross_vector_dedupe"] = True
            s["total_bundle_excluded_vectors"] = tb.get(
                "total_bundle_excluded_vectors"
            ) or ["similar_size", "suspect", "launch_window"]
            s["total_bundle_mode"] = tb.get("total_bundle_mode") or "primary"
            s["total_bundle_show_similar_suspect"] = bool(
                tb.get("total_bundle_show_similar_suspect")
            )
            s["total_bundle_include_fresh"] = bool(include_fresh)
            s["total_bundle_include_multi_send"] = bool(include_multi_send)
            s["total_bundle_include_shared_sol"] = bool(include_shared_sol)
            s["total_bundle_unique_wallets"] = tb.get(
                "total_bundle_unique_wallets"
            ) or tb.get("flagged_wallets")
            s["total_bundle_crosslisted_count"] = tb.get(
                "total_bundle_crosslisted_count"
            ) or 0
            if tb.get("single_holders_total_pct") is not None:
                s["single_holders_total_pct"] = tb.get("single_holders_total_pct")
            if tb.get("single_holders_wallet_count") is not None:
                s["single_holders_wallet_count"] = tb.get(
                    "single_holders_wallet_count"
                )
            # recompute mutates base similar/suspect lists + their summary totals
            if base.get("summary"):
                for k in (
                    "similar_size_total_pct",
                    "similar_size_wallet_count",
                    "similar_size_groups",
                    "suspect_total_pct",
                    "suspect_wallet_count",
                    "single_holders_total_pct",
                    "single_holders_wallet_count",
                ):
                    if k in base["summary"]:
                        s[k] = base["summary"][k]
            if s.get("total_bundle_pct") is None:
                s["total_bundle_pct"] = 0.0
            base["summary"] = s
            base["total_bundle_crosslisted_wallets"] = []
        except Exception as exc:  # noqa: BLE001
            s = dict(base.get("summary") or {})
            if s.get("total_bundle_pct") is None:
                s["total_bundle_pct"] = 0.0
            s["total_bundle_recompute_error"] = str(exc)[:160]
            base["summary"] = s
        base["notes"] = (
            "Comprehensive bundle check: Helius top holders (owner-resolved) + "
            "Rugcheck insiders/risks + Birdeye (if key) + 1-hop SOL funding + "
            "fresh/sole-token wallets + token multi-send (one sender → many). "
            "Multi-account is its own category (always in Total). "
            "Similar-sized wallets = near-exact bags + Rugcheck insider; counts in Total "
            "only when Fresh / Multi-send / Shared SOL are all off (with multi; unique wallets). "
            "Optionals enter Total when checked. No double-count. "
            "Not a full commercial sniper graph. "
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


def _aggregate_holders_by_owner(holders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge rows so wallet = owner (sum multi Associated Token Account bags)."""
    by_w: dict[str, dict[str, Any]] = {}
    for h in holders:
        if not isinstance(h, dict):
            continue
        w = (h.get("wallet") or h.get("owner") or "").strip()
        ata = (h.get("token_account") or "").strip()
        # If wallet equals Associated Token Account and we only have address, keep but tag
        if not w:
            continue
        cur = by_w.get(w)
        if not cur:
            by_w[w] = dict(h)
            by_w[w]["wallet"] = w
            if ata and ata != w:
                by_w[w]["token_account"] = ata
            continue
        # Sum balances / pct
        try:
            b0 = float(cur.get("balance") or 0)
            b1 = float(h.get("balance") or 0)
            cur["balance"] = b0 + b1
        except (TypeError, ValueError):
            pass
        try:
            p0 = float(cur.get("pct_supply") or 0)
            p1 = float(h.get("pct_supply") or 0)
            if p0 or p1:
                cur["pct_supply"] = p0 + p1
        except (TypeError, ValueError):
            pass
        if h.get("insider"):
            cur["insider"] = True
        # Preserve LP / program tags across multi-account merge
        if h.get("is_known_program"):
            cur["is_known_program"] = True
        if h.get("label") and not cur.get("label"):
            cur["label"] = h.get("label")
        if ata and ata != w:
            atas = list(cur.get("token_accounts") or [])
            if cur.get("token_account") and cur["token_account"] not in atas:
                atas.append(cur["token_account"])
            if ata not in atas:
                atas.append(ata)
            cur["token_accounts"] = atas[:8]
    ordered = sorted(
        by_w.values(),
        key=lambda r: float(r.get("pct_supply") or r.get("balance") or 0),
        reverse=True,
    )
    for i, row in enumerate(ordered):
        row["rank"] = i + 1
    return ordered


def _merge_holder_layers(
    helius: dict[str, Any],
    rug: dict[str, Any],
    bird: dict[str, Any],
    *,
    mint: str | None = None,
    pair_address: str | None = None,
) -> dict[str, Any]:
    """Prefer Helius holders; stamp Rugcheck insiders + known LP (same as Holders)."""
    from . import holders as hold

    if helius.get("ok") and helius.get("holders"):
        holders = _aggregate_holders_by_owner(
            [dict(h) for h in helius.get("holders") or []]
        )
        # Re-apply LP/program tags after owner merge (Holders-tab parity)
        hold.apply_known_lp_tags(
            holders, mint=mint, pair_address=pair_address
        )
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

        # Refresh non-LP top10 after LP tags (Helius summary may predate pump tags)
        summary = dict(helius.get("summary") or {})
        non_lp_pct = [
            float(h["pct_supply"])
            for h in holders
            if h.get("pct_supply") is not None
            and not hold.is_known_lp_or_program(
                h.get("wallet"),
                label=h.get("label"),
                is_known_program=bool(h.get("is_known_program")),
            )
        ]
        if non_lp_pct:
            summary["top10_pct_excluding_known_programs"] = round(
                sum(non_lp_pct[:10]), 4
            )

        return {
            "ok": True,
            "source": "helius+enrich",
            "holders": holders,
            "owner_clusters": helius.get("owner_clusters") or [],
            "summary": summary,
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
                    "is_known_program": bool(h.get("is_known_program")),
                    "insider": bool(h.get("insider")),
                    "token_account": h.get("token_account") or "",
                }
            )
        holders = _aggregate_holders_by_owner(holders)
        hold.apply_known_lp_tags(
            holders, mint=mint, pair_address=pair_address
        )
        non_lp = [
            h
            for h in holders
            if not hold.is_known_lp_or_program(
                h.get("wallet"),
                label=h.get("label"),
                is_known_program=bool(h.get("is_known_program")),
            )
        ]
        return {
            "ok": True,
            "source": "rugcheck_fallback",
            "holders": holders,
            "owner_clusters": [],
            "summary": {
                "accounts_returned": len(holders),
                "unique_wallets_in_top": len(
                    {h["wallet"] for h in holders if h.get("wallet")}
                ),
                "top1_pct": holders[0].get("pct_supply") if holders else None,
                "top10_pct": sum(float(h.get("pct_supply") or 0) for h in holders[:10])
                or None,
                "top10_pct_excluding_known_programs": sum(
                    float(h.get("pct_supply") or 0) for h in non_lp[:10]
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
