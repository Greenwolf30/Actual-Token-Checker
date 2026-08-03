"""
Robinhood EVM comprehensive bundles — holder heuristics + Shared ETH / Fresh /
Multi-send (Alchemy+Blockscout) + MadeOnSol launch-bundle.
"""

from __future__ import annotations

from typing import Any

from . import bundles as bun
from . import evm_bundle_sources as esrc
from . import optional_scan_cache as osc


def comprehensive_evm_bundle_check(
    token: str,
    holders_data: dict[str, Any] | None,
    *,
    chain_id: str = "robinhood",
    pair_address: str | None = None,
    include_fresh: bool = True,
    include_multi_send: bool = True,
    include_shared_sol: bool = True,
) -> dict[str, Any]:
    """
    Robinhood (and future EVM) fusion. Reuses funding_clusters / fresh_wallets /
    multi_send_clusters / sol_multi_send_clusters field names for UI parity;
    summary.shared_asset = "ETH".
    """
    chain = (chain_id or "robinhood").strip().lower()
    if chain in {"rh", "robinhood-chain", "robinhoodchain", "4663"}:
        chain = "robinhood"
    token = (token or "").strip()
    cache_key = f"{chain}:{token.lower()}" if token else ""

    if not holders_data or not holders_data.get("ok"):
        return {
            "ok": False,
            "error": (
                (holders_data or {}).get("error")
                or (holders_data or {}).get("notes")
                or "Holders required for EVM bundles."
            ),
            "summary": {},
            "signals": [],
            "notes": "EVM bundles need a successful Holders scan (Blockscout).",
        }

    base = bun.analyze_bundles(holders_data)
    if not base.get("ok"):
        return base

    base = dict(base)
    base["holders"] = list(holders_data.get("holders") or [])
    base["chain_id"] = chain
    base["token_address"] = token
    if pair_address:
        base["pair_address"] = pair_address

    pct_by_w: dict[str, float] = {}
    lp_wallets: set[str] = set()
    for h in base.get("holders") or []:
        if not isinstance(h, dict):
            continue
        w = (h.get("wallet") or "").strip()
        if not w:
            continue
        try:
            if h.get("pct_supply") is not None:
                pct_by_w[w] = max(pct_by_w.get(w, 0.0), float(h["pct_supply"]))
                pct_by_w[w.lower()] = pct_by_w[w]
        except (TypeError, ValueError):
            pass
        lab = (h.get("label") or "").lower()
        if h.get("is_known_program") or any(
            k in lab for k in ("uniswap", "pool", "liquidity", "router", "vault", "pair")
        ):
            lp_wallets.add(w)
            lp_wallets.add(w.lower())
    if pair_address:
        lp_wallets.add(pair_address.strip())
        lp_wallets.add(pair_address.strip().lower())

    def _pct(w: str | None) -> float | None:
        if not w:
            return None
        if w in pct_by_w:
            return pct_by_w[w]
        return pct_by_w.get(w.lower())

    def _is_lp(w: str | None) -> bool:
        if not w:
            return True
        return w in lp_wallets or w.lower() in lp_wallets

    # Seed wallets: similar-size + suspects + top non-LP holders
    seed: list[str] = []
    for s in base.get("suspect_wallets") or []:
        if isinstance(s, dict):
            w = (s.get("wallet") or "").strip()
            if w and not _is_lp(w):
                seed.append(w)
    for g in base.get("similar_size_groups") or []:
        for w in g.get("wallets") or []:
            ws = str(w if not isinstance(w, dict) else w.get("wallet") or "").strip()
            if ws and not _is_lp(ws):
                seed.append(ws)
        for m in g.get("members") or []:
            if isinstance(m, dict):
                ws = (m.get("wallet") or "").strip()
                if ws and not _is_lp(ws):
                    seed.append(ws)
    for h in (base.get("holders") or [])[:40]:
        if not isinstance(h, dict):
            continue
        w = (h.get("wallet") or "").strip()
        if w and not _is_lp(w):
            seed.append(w)

    seen: set[str] = set()
    seed_u: list[str] = []
    for w in seed:
        k = w.lower()
        if k in seen:
            continue
        seen.add(k)
        seed_u.append(w)

    sources_used: list[str] = ["holders"]
    fusion_signals: list[dict[str, Any]] = []
    extra_score = 0

    # ── Shared ETH ────────────────────────────────────────────────────
    funding_report: dict[str, Any] = {"ok": False, "clusters": []}
    shared_from_cache = False
    if include_shared_sol:
        try:
            funding_report = esrc.analyze_shared_eth(seed_u, chain=chain, max_wallets=12)
        except Exception as exc:  # noqa: BLE001
            funding_report = {"ok": False, "error": str(exc), "clusters": []}
    else:
        cached = osc.get_slice(cache_key, "shared_sol") if cache_key else None
        if cached and list(cached.get("funding_clusters") or []):
            shared_from_cache = True
            funding_report = {
                "ok": True,
                "clusters": list(cached.get("raw_clusters") or []),
                "from_cache": True,
                "scanned_at": cached.get("scanned_at"),
            }
            base["funding_clusters"] = list(cached.get("funding_clusters") or [])
            s0 = dict(base.get("summary") or {})
            s0["funding_clusters"] = len(base["funding_clusters"])
            s0["funding_from_cache"] = True
            s0["funding_total_pct"] = cached.get("funding_total_pct")
            s0["funding_wallet_count"] = cached.get("funding_wallet_count")
            base["summary"] = s0
        else:
            funding_report = {
                "ok": False,
                "skipped": True,
                "clusters": [],
                "error": "Shared ETH funder scan off (enable “Shared SOL” to run).",
            }
            base["funding_clusters"] = []
            s0 = dict(base.get("summary") or {})
            s0["funding_error"] = funding_report["error"]
            base["summary"] = s0

    enriched_fc: list[dict[str, Any]] = list(base.get("funding_clusters") or [])
    if (
        funding_report.get("ok")
        and (funding_report.get("clusters") or [])
        and not (shared_from_cache and enriched_fc)
    ):
        sources_used.append(
            "shared_eth_cached" if shared_from_cache else "shared_eth"
        )
        enriched_fc = []
        for fc in list(funding_report.get("clusters") or [])[:8]:
            if not isinstance(fc, dict):
                continue
            funder = (fc.get("funder") or "").strip()
            if not funder or _is_lp(funder):
                continue
            kids = [
                c
                for c in list(fc.get("children") or [])
                if str(c).strip()
                and not _is_lp(str(c).strip())
                and str(c).strip().lower() != funder.lower()
            ]
            if len(kids) < 2:
                continue
            child_rows = [{"wallet": c, "pct_supply": _pct(c)} for c in kids]
            tot, n = bun._sum_wallets_pct(child_rows)  # type: ignore[attr-defined]
            fp = _pct(funder)
            if fp is not None:
                try:
                    tot = min(100.0, float(tot or 0) + float(fp))
                    n = int(n or 0) + 1
                except (TypeError, ValueError):
                    pass
            ff = dict(fc)
            ff["children"] = kids
            ff["child_count"] = len(kids)
            ff["child_rows"] = child_rows
            ff["funder_pct"] = fp
            ff["total_pct"] = tot
            ff["wallets_with_pct"] = n
            enriched_fc.append(ff)
        base["funding_clusters"] = enriched_fc
        s0 = dict(base.get("summary") or {})
        s0["funding_clusters"] = len(enriched_fc)
        try:
            rows = []
            for efc in enriched_fc:
                f = (efc.get("funder") or "").strip()
                if f:
                    rows.append({"wallet": f, "pct_supply": efc.get("funder_pct")})
                rows.extend(list(efc.get("child_rows") or []))
            ft, fn = bun._sum_wallets_pct(rows)  # type: ignore[attr-defined]
            s0["funding_total_pct"] = ft
            s0["funding_wallet_count"] = fn
        except Exception:  # noqa: BLE001
            pass
        base["summary"] = s0
        if enriched_fc:
            fusion_signals.append(
                {
                    "id": "funding_cluster",
                    "provider": "shared_eth",
                    "severity": (enriched_fc[0].get("severity") or "high"),
                    "title": "Shared ETH funder (1-hop)"
                    + (" (last known)" if shared_from_cache else ""),
                    "detail": (
                        f"{enriched_fc[0].get('child_count')} wallets funded by "
                        f"{enriched_fc[0].get('funder')} — split-wallet pattern. "
                        f"{len(enriched_fc)} funder cluster(s)."
                    ),
                }
            )
            if not shared_from_cache:
                extra_score += bun._pct_risk_points(  # type: ignore[attr-defined]
                    s0.get("funding_total_pct"), cap=28, full_at=15.0
                )
            if include_shared_sol and not shared_from_cache and cache_key:
                osc.put_slice(
                    cache_key,
                    "shared_sol",
                    {
                        "ok": True,
                        "funding_clusters": enriched_fc,
                        "raw_clusters": list(funding_report.get("clusters") or [])[:8],
                        "funding_total_pct": s0.get("funding_total_pct"),
                        "funding_wallet_count": s0.get("funding_wallet_count"),
                        "txs_scanned": funding_report.get("txs_scanned") or 0,
                    },
                )

    # ── Fresh ─────────────────────────────────────────────────────────
    fresh_report: dict[str, Any] = {"ok": False, "wallets": []}
    fresh_from_cache = False
    if include_fresh:
        try:
            fresh_report = esrc.analyze_fresh_evm(
                token, seed_u, chain=chain, max_wallets=12
            )
        except Exception as exc:  # noqa: BLE001
            fresh_report = {"ok": False, "error": str(exc), "wallets": []}
    else:
        cached_fr = osc.get_slice(cache_key, "fresh") if cache_key else None
        if cached_fr and list(cached_fr.get("wallets") or []):
            fresh_from_cache = True
            fresh_report = {
                "ok": True,
                "wallets": list(cached_fr.get("wallets") or []),
                "from_cache": True,
                "scanned_at": cached_fr.get("scanned_at"),
            }
        else:
            fresh_report = {
                "ok": False,
                "skipped": True,
                "wallets": [],
                "error": "Fresh wallets scan off (enable “Fresh” to run).",
            }
            s0 = dict(base.get("summary") or {})
            s0["fresh_error"] = fresh_report["error"]
            base["summary"] = s0

    fresh_rows: list[dict[str, Any]] = []
    if fresh_report.get("ok"):
        sources_used.append("fresh_wallets")
        for fw in list(fresh_report.get("wallets") or [])[:24]:
            if not isinstance(fw, dict):
                continue
            w = (fw.get("wallet") or "").strip()
            if not w or _is_lp(w):
                continue
            row = dict(fw)
            row["pct_supply"] = _pct(w)
            fresh_rows.append(row)
        fresh_rows.sort(
            key=lambda r: (
                -(float(r["pct_supply"]) if r.get("pct_supply") is not None else -1.0),
                str(r.get("wallet") or ""),
            )
        )
        if fresh_rows:
            fusion_signals.append(
                {
                    "id": "fresh_sole_token",
                    "provider": "evm_fresh",
                    "severity": "medium" if len(fresh_rows) < 4 else "high",
                    "title": "Fresh wallets"
                    + (" (last known)" if fresh_from_cache else ""),
                    "detail": (
                        f"{len(fresh_rows)} low-nonce / fresh holder(s) "
                        f"(scanned {fresh_report.get('wallets_scanned') or 0})."
                    ),
                }
            )
            if not fresh_from_cache:
                fpct, _ = bun._sum_wallets_pct(fresh_rows)  # type: ignore[attr-defined]
                extra_score += bun._pct_risk_points(fpct, cap=18, full_at=12.0)  # type: ignore[attr-defined]
            if include_fresh and not fresh_from_cache and cache_key:
                osc.put_slice(
                    cache_key,
                    "fresh",
                    {
                        "ok": True,
                        "wallets": fresh_rows,
                        "wallets_scanned": fresh_report.get("wallets_scanned") or 0,
                    },
                )

    # ── Token multi-send ──────────────────────────────────────────────
    multi_send_report: dict[str, Any] = {"ok": False, "clusters": []}
    multi_from_cache = False
    multi_send_error = None
    if include_multi_send:
        try:
            multi_send_report = esrc.analyze_token_multi_sends_evm(
                token, seed_u, chain=chain
            )
        except Exception as exc:  # noqa: BLE001
            multi_send_report = {"ok": False, "error": str(exc), "clusters": []}
    else:
        cached_ms = osc.get_slice(cache_key, "multi_send") if cache_key else None
        if cached_ms and (
            list(cached_ms.get("clusters") or [])
            or list(cached_ms.get("sol_multi_send_clusters") or [])
        ):
            multi_from_cache = True
            multi_send_report = {
                "ok": True,
                "clusters": list(cached_ms.get("clusters") or []),
                "from_cache": True,
                "scanned_at": cached_ms.get("scanned_at"),
                "_cached_sol_multi": list(
                    cached_ms.get("sol_multi_send_clusters") or []
                ),
            }
        else:
            multi_send_report = {
                "ok": False,
                "skipped": True,
                "clusters": [],
                "error": "Multi-send scan off (enable “Multi-send” to run).",
            }
            multi_send_error = multi_send_report["error"]

    multi_clusters: list[dict[str, Any]] = []
    if multi_send_report.get("ok"):
        sources_used.append("token_multi_send")
        for mc in list(multi_send_report.get("clusters") or [])[:10]:
            if not isinstance(mc, dict):
                continue
            sender = (mc.get("sender") or "").strip()
            if not sender or _is_lp(sender):
                continue
            recs = [
                r
                for r in list(mc.get("receivers") or [])
                if r and not _is_lp(str(r).strip()) and str(r).strip().lower() != sender.lower()
            ]
            if len(recs) < 2:
                continue
            child_rows = [{"wallet": r, "pct_supply": _pct(r)} for r in recs]
            sender_pct = _pct(sender)
            recv_tot, recv_n = bun._sum_wallets_pct(child_rows)  # type: ignore[attr-defined]
            sum_rows = list(child_rows) + [
                {"wallet": sender, "pct_supply": sender_pct}
            ]
            tot, n = bun._sum_wallets_pct(sum_rows)  # type: ignore[attr-defined]
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
        multi_clusters.sort(
            key=lambda c: (
                -(float(c["total_pct"]) if c.get("total_pct") is not None else -1.0),
                -int(c.get("receiver_count") or 0),
            )
        )
        if multi_clusters:
            best_m = multi_clusters[0]
            fusion_signals.append(
                {
                    "id": "token_multi_send",
                    "provider": "blockscout",
                    "severity": best_m.get("severity") or "high",
                    "title": "Token multi-send (one owner → many)",
                    "detail": (
                        f"Sender {best_m.get('sender')} → "
                        f"{best_m.get('receiver_count')} receivers; "
                        f"{len(multi_clusters)} cluster(s)."
                    ),
                }
            )
            extra_score += bun._pct_risk_points(  # type: ignore[attr-defined]
                best_m.get("total_pct"), cap=24, full_at=12.0
            )
    else:
        multi_send_error = multi_send_report.get("error") or multi_send_error

    # ETH multi-send = funding clusters re-labeled (reuse sol_multi_send_* fields)
    sol_multi: list[dict[str, Any]] = []
    if include_multi_send:
        for fc in enriched_fc[:8]:
            if not isinstance(fc, dict):
                continue
            funder = (fc.get("funder") or "").strip()
            if not funder or _is_lp(funder):
                continue
            kids = [
                str(c).strip()
                for c in list(fc.get("children") or [])
                if str(c).strip() and not _is_lp(str(c).strip())
            ]
            child_rows = list(fc.get("child_rows") or []) or [
                {"wallet": k, "pct_supply": _pct(k)} for k in kids
            ]
            if len(child_rows) < 2 and len(kids) < 2:
                continue
            recv_tot, recv_n = bun._sum_wallets_pct(child_rows)  # type: ignore[attr-defined]
            sp = (
                fc.get("funder_pct")
                if fc.get("funder_pct") is not None
                else _pct(funder)
            )
            sum_rows = list(child_rows) + [{"wallet": funder, "pct_supply": sp}]
            tot, n = bun._sum_wallets_pct(sum_rows)  # type: ignore[attr-defined]
            sol_multi.append(
                {
                    "kind": "eth_multi_send",
                    "sender": funder,
                    "sender_pct": sp,
                    "receivers": kids,
                    "receiver_count": len(kids),
                    "child_rows": child_rows,
                    "receivers_total_pct": recv_tot,
                    "receivers_with_pct": recv_n,
                    "total_pct": tot,
                    "wallets_with_pct": n,
                    "severity": fc.get("severity") or "high",
                }
            )
    elif multi_from_cache:
        sol_multi = list(multi_send_report.get("_cached_sol_multi") or [])

    # Attach fresh / multi
    base["fresh_wallets"] = fresh_rows
    base["multi_send_clusters"] = multi_clusters if include_multi_send or multi_from_cache else []
    base["sol_multi_send_clusters"] = sol_multi if include_multi_send or multi_from_cache else []
    s0 = dict(base.get("summary") or {})
    s0["shared_asset"] = "ETH"
    s0["fresh_wallet_count"] = len(fresh_rows)
    ft, fn = bun._sum_wallets_pct(  # type: ignore[attr-defined]
        [{"wallet": r.get("wallet"), "pct_supply": r.get("pct_supply")} for r in fresh_rows]
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

    try:
        mt, mn = bun._multi_send_total_percent(  # type: ignore[attr-defined]
            {"multi_send_clusters": multi_clusters, "sol_multi_send_clusters": []},
            pct_by_w,
        )
    except Exception:  # noqa: BLE001
        mt, mn = None, 0
    s0["multi_send_total_pct"] = mt
    s0["multi_send_wallet_with_pct"] = mn
    s0["token_multi_send_clusters"] = len(multi_clusters)
    s0["sol_multi_send_clusters"] = len(sol_multi)
    if multi_from_cache:
        s0["multi_send_from_cache"] = True
        s0.pop("multi_send_error", None)
    elif not include_multi_send:
        s0["multi_send_error"] = multi_send_error or (
            "Multi-send scan off (enable “Multi-send” to run)."
        )
        s0["multi_send_total_pct"] = None
        base["multi_send_clusters"] = []
        base["sol_multi_send_clusters"] = []
    elif multi_send_error and not multi_clusters:
        s0["multi_send_error"] = str(multi_send_error)[:240]

    if include_multi_send and not multi_from_cache and (multi_clusters or sol_multi) and cache_key:
        osc.put_slice(
            cache_key,
            "multi_send",
            {
                "ok": True,
                "clusters": multi_clusters,
                "sol_multi_send_clusters": sol_multi,
                "txs_scanned": multi_send_report.get("txs_scanned") or 0,
            },
        )

    # ── MadeOnSol launch bundle ───────────────────────────────────────
    launch: dict[str, Any] = {"ok": False, "skipped": True}
    try:
        launch = esrc.fetch_madeonsol_launch_bundle(token)
    except Exception as exc:  # noqa: BLE001
        launch = {"ok": False, "error": str(exc), "bundle_kind": "none"}
    if launch.get("ok"):
        sources_used.append("madeonsol")
        base["launch_bundle"] = {
            "ok": True,
            "bundle_kind": launch.get("bundle_kind"),
            "held_pct_of_supply": launch.get("held_pct_of_supply"),
            "wallet_count": launch.get("wallet_count"),
            "wallets": list(launch.get("wallets") or [])[:24],
            "fully_exited": launch.get("fully_exited"),
            "quality": launch.get("quality"),
            "notes": launch.get("notes"),
        }
        s0["launch_bundle_kind"] = launch.get("bundle_kind")
        s0["launch_bundle_held_pct"] = launch.get("held_pct_of_supply")
        if str(launch.get("bundle_kind") or "") == "same_block":
            fusion_signals.append(
                {
                    "id": "madeonsol_launch_bundle",
                    "provider": "madeonsol",
                    "severity": "high",
                    "title": "Same-block launch bundle (MadeOnSol)",
                    "detail": (
                        f"Cohort still holds ~{launch.get('held_pct_of_supply')}% "
                        f"({launch.get('wallet_count') or len(launch.get('wallets') or [])} wallets)."
                    ),
                }
            )
            extra_score += bun._pct_risk_points(  # type: ignore[attr-defined]
                launch.get("held_pct_of_supply"), cap=22, full_at=20.0
            )
    else:
        base["launch_bundle"] = {
            "ok": False,
            "skipped": bool(launch.get("skipped")),
            "error": launch.get("error"),
            "bundle_kind": "none",
        }

    # Score + totals
    old = int(s0.get("bundle_risk_score") or 0)
    s0["bundle_risk_score"] = max(0, min(100, old + extra_score))
    s0["bundle_risk"] = (
        "critical"
        if s0["bundle_risk_score"] >= 70
        else "high"
        if s0["bundle_risk_score"] >= 50
        else "elevated"
        if s0["bundle_risk_score"] >= 30
        else "moderate"
        if s0["bundle_risk_score"] >= 15
        else "lower"
    )
    s0["sources_used"] = sources_used
    s0["fusion_signal_count"] = len(fusion_signals)
    base["summary"] = s0
    base["source"] = "+".join(sources_used)
    base["method"] = "comprehensive_evm_alchemy_blockscout_madeonsol"
    base["fusion_signals"] = fusion_signals
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
    tip = (
        "Robinhood bundles: concentration + similar-size + Shared ETH + Fresh + "
        "Multi-send (Alchemy/Blockscout). MadeOnSol launch-bundle when keyed."
    )
    base["notes"] = (tip + " " + (base.get("notes") or "")).strip()

    try:
        bun.recompute_total_bundle_all_vectors(
            base,
            include_fresh=include_fresh,
            include_multi_send=include_multi_send,
            include_shared_sol=include_shared_sol,
        )
    except Exception:  # noqa: BLE001
        pass

    return base
