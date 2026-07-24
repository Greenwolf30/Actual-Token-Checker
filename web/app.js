/* Actual Data Token Checker — browser client.
 * Calls YOUR backend /api/* only. Provider keys never reach this page.
 * apiBase comes from config.js (empty = same origin as this static site).
 */

const TABS = ["overview", "holders", "bundles", "alerts", "maps", "about", "ruggers", "history"];
const TOKEN_KEY = "adtc_site_token";
const HISTORY_KEY = "adtc_history_log";
const HISTORY_MAX = 200;
const RUGGERS_KEY = "adtc_ruggers_track";
/** Last Analyze full payload (all tabs). */
const LAST_ANALYZE_KEY = "adtc_last_analyze";
const LAST_BUNDLES_ANALYZE_KEY = "adtc_last_bundles_analyze";
/** Minimal Bundles-only backup if full last-Analyze is too large for localStorage. */
const LAST_BUNDLES_ONLY_KEY = "adtc_last_bundles_only";
/** Per-mint baseline + frozen delta pair for Bundles arrows. */
const BUNDLE_STATS_PREV_KEY = "adtc_bundle_stats_prev";
/** Per-mint precomputed delta HTML snippets. */
const BUNDLE_DELTA_HTML_KEY = "adtc_bundle_delta_html";
/**
 * Exact .bun-stats bar HTML from last live Analyze (mint + html).
 * Refresh restores this blob so arrows cannot “recompute away”.
 */
const BUNDLE_STATS_BAR_SNAP_KEY = "adtc_bundle_stats_bar_snap";
/** Last live scan time for Fresh / Multi-send / Shared SOL (browser). */
const OPTIONAL_LAST_KNOWN_KEY = "adtc_optional_last_known";
/** Bump when shipping UI delta/persist fixes (shown in Bundles). */
const ADTC_CLIENT_VERSION = "v168";
try { window.__ADTC_CLIENT__ = ADTC_CLIENT_VERSION; } catch (_) {}
// Hide boot banner ASAP so Opera never sticks on "Loading…" during restore
try {
  if (window.__adtcBootReady) window.__adtcBootReady();
} catch (_) {}

/** Yield so the browser can paint / handle clicks (Opera freezes on long sync work). */
function yieldToUi(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms != null ? ms : 0));
}

function isOperaBrowser() {
  try {
    const ua = String(navigator.userAgent || "");
    if (/OPR\/|Opera|OPX\//i.test(ua)) return true;
    if (
      typeof navigator.userAgentData !== "undefined" &&
      Array.isArray(navigator.userAgentData.brands)
    ) {
      return navigator.userAgentData.brands.some((b) =>
        /Opera|OPR/i.test(String((b && b.brand) || ""))
      );
    }
  } catch (_) {}
  return false;
}

/**
 * Full UI (fonts, full Bundles cards, full Ruggers) is DEFAULT on Edge/Chrome/Firefox.
 * Opera GX stays on lite unless ?full=1. Force lite anywhere with ?lite=1.
 */
function wantFullHeavyUi() {
  try {
    if (window.__ADTC_FULL_UI__ === true) return true;
    if (window.__ADTC_FULL_UI__ === false) return false;
    const p = new URLSearchParams(location.search || "");
    if (p.get("lite") === "1") return false;
    if (p.get("full") === "1") return true;
    // Edge / Chrome / Firefox / Safari → full experience
    if (!isOperaBrowser()) return true;
    // Opera GX → lite by default (freeze-safe)
    return false;
  } catch (_) {
    return !isOperaBrowser();
  }
}

/** Lite UI only when full is off (Opera default, or ?lite=1). */
function useLiteUi() {
  return !wantFullHeavyUi();
}

/** Wipe poisoned forNext baselines once (old builds wrote forNext=cur before paint). */
const BUNDLE_DELTA_BASELINE_VER_KEY = "adtc_bundle_delta_baseline_ver";
const BUNDLE_DELTA_BASELINE_VER = 90;
/** In-page last LIVE stats per mint — survives re-Analyze in the same tab without storage races. */
const __adtcLiveBaselineByMint = Object.create(null);

function migrateBundleDeltaBaselines() {
  try {
    const cur = Number(localStorage.getItem(BUNDLE_DELTA_BASELINE_VER_KEY) || 0);
    if (cur >= BUNDLE_DELTA_BASELINE_VER) return;
    localStorage.removeItem(BUNDLE_STATS_PREV_KEY);
    localStorage.removeItem(BUNDLE_DELTA_HTML_KEY);
    try {
      sessionStorage.removeItem(BUNDLE_DELTA_HTML_KEY);
      sessionStorage.removeItem("adtc_delta_html_last");
    } catch (_) {}
    localStorage.setItem(BUNDLE_DELTA_BASELINE_VER_KEY, String(BUNDLE_DELTA_BASELINE_VER));
    console.info(
      "[bundles] cleared old delta baselines (upgrade to v" +
        BUNDLE_DELTA_BASELINE_VER +
        ")"
    );
  } catch (err) {
    console.warn("[bundles] baseline migrate failed", err);
  }
}

function statsAlmostEqual(a, b) {
  if (!a || !b) return false;
  const keys = [
    "risk",
    "total_bundle_pct",
    "similar_size_total_pct",
    "fresh_total_pct",
    "multi_send_total_pct",
    "funding_total_pct",
    "suspect_total_pct",
    "single_holders_total_pct",
    "top10_ex_lp",
  ];
  let compared = 0;
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    const xn = x != null && Number.isFinite(Number(x)) ? Number(x) : null;
    const yn = y != null && Number.isFinite(Number(y)) ? Number(y) : null;
    if (xn == null && yn == null) continue;
    compared++;
    const xv = xn == null ? 0 : xn;
    const yv = yn == null ? 0 : yn;
    if (Math.abs(xv - yv) > 0.05) return false;
  }
  return compared > 0;
}


/** Bump when Flagged-wallet rules change so sticky junk is wiped once. */
/** v9: Upload marks only from Ruggers Upload button on THAT mint (no cloud bleed). */
/** v10: compact persist + wallet cap so localStorage quota no longer drops baselines. */
const RUGGERS_RULES_VERSION = 10;
/** Sold ≥ this fraction of first-lookup bag → list as seller (99%). */
const RUGGERS_SOLD_FRAC = 0.99;
/** Remaining bag must be ≤ (1 - RUGGERS_SOLD_FRAC) of first_pct to count as sold. */
const RUGGERS_REMAIN_FRAC = 1 - RUGGERS_SOLD_FRAC;
/** Single sellers: min first bag % of supply (top → least holder cutoff). */
const RUGGERS_SINGLE_MIN_PCT = 0.01;
/**
 * Max wallets frozen per mint. Full DAS (~2000) × status blob blew localStorage
 * (~2.7MB/mint, dual-key ~5.4MB) so saves failed silently and every Analyze
 * re-froze as first lookup → sellers never stuck.
 */
const RUGGERS_MAX_TRACK_WALLETS = 450;
/** Keep this many most-recent mint tracks when pruning for quota. */
const RUGGERS_MAX_MINTS = 12;
/**
 * In-page overlay of Ruggers tracks (survives same-session save failures).
 * Keyed by canonical store key (solana:CA) and bare CA.
 */
const __ruggersMem = Object.create(null);

/**
 * Ruggers origin lanes (sticky sell ↔ swing loop, labels kept on Swing).
 * Priority when assigning first-discovery lane (creator always wins).
 */
const RUGGERS_LANE_PRIORITY = [
  "creator",
  "similar",
  "multi",
  "multi_send",
  "funding",
  "insider",
  "launch",
  "fresh",
  "suspect",
  "single",
];
const RUGGERS_STICKY_LANES = new Set(RUGGERS_LANE_PRIORITY);
const RUGGERS_LANE_LABEL = {
  creator: "creator",
  similar: "similar-sized",
  multi: "multi-account",
  multi_send: "multi-send",
  funding: "shared funder",
  insider: "similar-sized",
  launch: "same-slot multi-buys (bots)",
  fresh: "fresh wallets",
  suspect: "similar-sized",
  single: "single",
};

/** User-facing lane name (maps legacy "suspect" stored labels). */
function ruggersDisplayLaneName(laneOrLabel) {
  const raw = String(laneOrLabel || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  if (
    key === "suspect" ||
    key === "similar" ||
    key === "insider" ||
    key === "similar-size" ||
    key === "similar size" ||
    key.indexOf("suspect") === 0
  ) {
    return "similar-sized";
  }
  if (RUGGERS_LANE_LABEL[key]) return RUGGERS_LANE_LABEL[key];
  if (RUGGERS_LANE_LABEL[raw]) return RUGGERS_LANE_LABEL[raw];
  return raw;
}

/** Rewrite frozen stats-bar HTML that still says Suspect → Similar-sized. */
function rewriteSuspectLabelsInHtml(html) {
  if (!html || typeof html !== "string") return html;
  return html
    .replace(/data-bun-stat="Suspect total"/gi, 'data-bun-stat="Similar-sized total"')
    .replace(/>Suspect total</gi, ">Similar-sized total<")
    .replace(/Suspect wallets/gi, "Similar-sized wallets")
    .replace(/Suspect total/gi, "Similar-sized total")
    .replace(/multi \+ suspect/gi, "multi + similar-sized")
    .replace(/\bsuspect\b/gi, function (m) {
      // only rewrite standalone suspect in user labels, not keys
      return m === "suspect" || m === "Suspect" ? "similar-sized" : m;
    });
}

const $ = (id) => document.getElementById(id);

// ── History log (browser localStorage, max 200; oldest dropped on later lookups) ─

function loadHistoryLog() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // Always newest first; cap length by dropping earliest
    return trimHistoryDropOldest(
      data.filter((x) => x && typeof x === "object"),
      HISTORY_MAX
    );
  } catch (_e) {
    return [];
  }
}

/**
 * Newest-first order by timestamp (index 0 = latest Analyze).
 * Always drop from the END (earliest / oldest mints) — never the newest.
 */
function sortHistoryNewestFirst(items) {
  const arr = (items || []).filter((x) => x && typeof x === "object");
  arr.sort((a, b) => {
    const ta = Date.parse(a.ts || 0) || 0;
    const tb = Date.parse(b.ts || 0) || 0;
    return tb - ta; // newest first
  });
  return arr;
}

/** Keep newest head; drop earliest (oldest) from the tail. */
function trimHistoryDropOldest(items, maxKeep) {
  const max = Math.max(1, maxKeep != null ? maxKeep : HISTORY_MAX);
  const list = sortHistoryNewestFirst(items);
  if (list.length <= max) return list;
  // list[0] = newest · list[length-1] = earliest → slice keeps newest
  return list.slice(0, max);
}

/** Clone entry without heavy text (used only on older rows when quota is tight). */
function historyEntryWithoutSnapshots(e) {
  if (!e || typeof e !== "object") return e;
  const c = { ...e };
  delete c.holders_snapshot;
  delete c.bundles_snapshot;
  delete c.ruggers_track;
  return c;
}

/** Compact market-only row (last resort for oldest entries). */
function historyEntryCompact(e) {
  if (!e || typeof e !== "object") return e;
  return {
    ts: e.ts,
    query: e.query,
    symbol: e.symbol,
    name: e.name,
    address: e.address,
    chain: e.chain,
    dex_id: e.dex_id,
    price_usd: e.price_usd,
    market_cap_usd: e.market_cap_usd,
    liquidity_usd: e.liquidity_usd,
    volume_h24_usd: e.volume_h24_usd,
    price_change_h24_pct: e.price_change_h24_pct,
    holders_ok: e.holders_ok,
    bundle_risk: e.bundle_risk,
    bundle_pct: e.bundle_pct,
    alerts_priority_count: e.alerts_priority_count,
    // Keep short previews if present (not full dumps)
    holders_snapshot: e.holders_snapshot
      ? clipSnap(e.holders_snapshot, 2500)
      : null,
    bundles_snapshot: e.bundles_snapshot
      ? clipSnap(e.bundles_snapshot, 2000)
      : null,
  };
}

/**
 * Persist Logs. Prefer keeping Holders + Bundles on the newest entries.
 * On quota: drop earliest mints first; only strip snapshots from older rows.
 * Newest Analyze always keeps snapshots when possible.
 */
function saveHistoryLog(items) {
  let list = trimHistoryDropOldest(items, HISTORY_MAX);
  const tryWrite = (arr) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
    return true;
  };

  // Attempt 1: full entries (with holders/bundles)
  try {
    return tryWrite(list);
  } catch (e1) {
    console.warn(
      "[logs] full save failed — drop earliest mints first (keep snapshots on newest)",
      e1 && e1.name
    );
  }

  // Attempt 2: drop earliest full entries until it fits (newest keep Holders/Bundles)
  list = sortHistoryNewestFirst(list);
  {
    let attempt = list.slice();
    while (attempt.length > 0) {
      try {
        return tryWrite(attempt);
      } catch (_) {
        if (attempt.length <= 1) break;
        // Remove earliest (tail), never the newest head
        attempt = attempt.slice(0, attempt.length - 1);
        console.info(
          "[logs] dropped earliest mint to free space; keeping",
          attempt.length,
          "newest with snapshots"
        );
      }
    }
    list = attempt.length ? attempt : list.slice(0, 1);
  }

  // Attempt 3: keep full snapshots on newest 15; strip only older rows
  try {
    const KEEP_FULL = 15;
    list = sortHistoryNewestFirst(list).map((e, i) =>
      i < KEEP_FULL ? e : historyEntryWithoutSnapshots(e)
    );
    return tryWrite(list);
  } catch (e3) {
    console.warn("[logs] partial-snapshot save failed", e3 && e3.name);
  }

  // Attempt 4: compact all but keep short previews on newest 5
  try {
    list = sortHistoryNewestFirst(list).map((e, i) =>
      i < 5 ? historyEntryCompact(e) : historyEntryWithoutSnapshots(e)
    );
    // Drop earliest until fits
    while (list.length > 0) {
      try {
        return tryWrite(list);
      } catch (_) {
        if (list.length <= 1) {
          // Last: newest only, short snapshots
          try {
            return tryWrite([historyEntryCompact(list[0])]);
          } catch (e4) {
            console.error("[logs] save failed completely", e4);
            return false;
          }
        }
        list = list.slice(0, list.length - 1);
      }
    }
  } catch (e5) {
    console.error("[logs] save failed", e5);
  }
  return false;
}

function fmtUsdHist(n) {
  if (n == null || n === "") return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const a = Math.abs(x);
  if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return "$" + (x / 1e3).toFixed(2) + "K";
  if (a >= 1) return "$" + x.toFixed(4);
  return "$" + x.toPrecision(4);
}

function fmtPctHist(n) {
  if (n == null || n === "") return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return x.toFixed(2) + "%";
}

function buildHistoryEntry(data, query) {
  if (!data || !data.ok) return null;
  const t = data.token || {};
  const m = data.market || {};
  const hm = data.history_meta || {};
  const alerts = data.alerts_meta || {};
  const pf = hm.pumpfun || data.pumpfun || {};
  const pair = (m.pair && typeof m.pair === "object" ? m.pair : {}) || {};
  const pc = m.price_change_pct || {};
  // Mint CA from token, market, query arg, or search box
  let address = bareMintAddr(t.address || m.address || "");
  if (!address || address.length < 30) {
    try {
      address =
        bareMintAddr(
          query ||
            data.query ||
            ($("query") && $("query").value) ||
            ""
        ) || address;
    } catch (_) {
      /* ignore */
    }
  }
  const symbol = (t.symbol || m.symbol || "").trim();
  let q = String(query || data.query || symbol || address || "").trim();
  if (!q) {
    try {
      q = String(($("query") && $("query").value) || "").trim();
    } catch (_) {
      /* ignore */
    }
  }
  if (!q && !address && !symbol) return null;
  // Prefer API snapshots; fall back to sections text from this response
  const sections = data.sections || {};
  let holdersSnap = hm.holders_snapshot || null;
  let bundlesSnap = hm.bundles_snapshot || null;
  if (!holdersSnap && sections.holders) {
    holdersSnap = sections.holders;
  }
  if (!bundlesSnap && sections.bundles) {
    bundlesSnap = sections.bundles;
  }
  // Sized to keep Holders + Bundles readable in Logs without blowing storage
  holdersSnap = clipSnap(holdersSnap, 6000);
  bundlesSnap = clipSnap(bundlesSnap, 4500);

  return {
    ts: new Date().toISOString(),
    query: q,
    symbol: symbol || null,
    name: (t.name || "").trim() || null,
    address: address || null,
    chain: (t.chain_id || m.chain_id || "").trim() || null,
    dex_id: hm.dex_id || pair.dex_id || m.dex_id || null,
    price_usd: m.price_usd,
    market_cap_usd: m.market_cap_usd || m.fdv_usd,
    liquidity_usd: m.liquidity_usd,
    volume_h24_usd: m.volume_h24_usd,
    price_change_h24_pct: pc.h24 != null ? pc.h24 : null,
    concentration_risk: hm.concentration_risk || null,
    top1_pct: hm.top1_pct,
    top5_pct: hm.top5_pct,
    top10_pct: hm.top10_pct,
    holders_ok: !!hm.holders_ok,
    bundle_risk: hm.bundle_risk || null,
    bundle_pct: hm.bundle_pct != null ? hm.bundle_pct : null,
    alerts_priority_count: Number(alerts.priority_count || 0) || 0,
    pumpfun:
      pf && (pf.is_pump_mint != null || pf.status)
        ? {
            is_pump_mint: pf.is_pump_mint,
            status: pf.status,
            graduated: pf.graduated,
          }
        : null,
    pair_url: pair.url || (data.links && data.links.dexscreener) || null,
    holders_snapshot: holdersSnap,
    bundles_snapshot: bundlesSnap,
    // Compact structured track for Ruggers (may be truncated; primary store is RUGGERS_KEY)
    ruggers_track: hm.ruggers_track || null,
  };
}

function clipSnap(text, maxChars) {
  if (!text) return null;
  let s = cleanLogsSnapshot(String(text));
  if (!s) return null;
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 80).replace(/\s+$/, "") +
    "\n\n  … [snapshot truncated for Logs storage] …\n";
}

/**
 * Clean Logs snapshots — KEEP full holders/bundles content.
 * Only drop: provider status lines, Note: lines, RugWatch flagged section.
 */
function cleanLogsSnapshot(text) {
  if (!text) return "";
  const lines = String(text).split("\n");
  const out = [];
  // RugWatch block is always near the end of holders report — skip from header to end
  let skipRugwatch = false;
  for (const line of lines) {
    const t = line.trim();

    // Start of RugWatch flagged-wallets section → drop rest of that section
    if (
      /flagged wallets\s*\(rugwatch\)/i.test(t) ||
      /──+\s*flagged wallets/i.test(t)
    ) {
      skipRugwatch = true;
      continue;
    }
    if (skipRugwatch) {
      // Entire rugwatch appendix is after top holders; keep skipping to end
      continue;
    }

    // Provider status / API key tips only
    if (/^\s*providers\s*:/i.test(t)) continue;
    if (/birdeye:\s*skipped/i.test(t)) continue;
    if (/solscan:\s*set\s+solscan/i.test(t)) continue;
    if (/set\s+helius_api_key/i.test(t)) continue;
    if (/provider issues\s*:/i.test(t)) continue;
    if (/^\s*source:\s*/i.test(t) && /helius|rugcheck|solscan|birdeye|\+/i.test(t)) {
      // keep simple "Source: multi" style if short; drop long multi-provider lines
      // always keep Source line for context — user asked only providers/notes/rugwatch
    }

    // Standalone note lines (not the wallet list)
    if (/^\s*note\s*:/i.test(t)) continue;
    if (/^\s*notes\s*:/i.test(t)) continue;

    // One-line RugWatch status in flags (not the full top-holder list)
    if (/^•\s*rugwatch:/i.test(t) || /^\*\s*rugwatch:/i.test(t)) continue;
    if (/rugwatch:\s*\d+\s*flagged/i.test(t)) continue;

    // Solscan URL rows (addresses kept separately)
    if (/^https?:\/\/(www\.)?solscan\.io\/(account|token)\//i.test(t)) continue;

    out.push(line);
  }
  // Collapse excess blank lines
  const collapsed = [];
  let blanks = 0;
  for (const line of out) {
    if (!line.trim()) {
      blanks += 1;
      if (blanks <= 1) collapsed.push(line);
      continue;
    }
    blanks = 0;
    collapsed.push(line);
  }
  return collapsed.join("\n").trim();
}

function pushHistoryLog(entry) {
  if (!entry) return loadHistoryLog();
  if (!entry.ts) entry.ts = new Date().toISOString();
  let items = [];
  try {
    items = loadHistoryLog();
  } catch (_) {
    items = [];
  }
  // Normalize address for matching
  const addrRaw = String(entry.address || entry.query || "").trim();
  let addr = "";
  try {
    addr = bareMintAddr(addrRaw).toLowerCase();
  } catch (_) {
    addr = addrRaw.toLowerCase();
  }
  // Drop older entries for the same mint (re-Analyze replaces prior row)
  const filtered = items.filter((e) => {
    if (!addr || !e) return true;
    let ea = "";
    try {
      ea = bareMintAddr(e.address || e.query || "").toLowerCase();
    } catch (_) {
      ea = String(e.address || e.query || "")
        .trim()
        .toLowerCase();
    }
    return !ea || ea !== addr;
  });
  // Newest Analyze first; trimHistoryDropOldest drops earliest from the tail
  filtered.unshift(entry);
  const next = trimHistoryDropOldest(filtered, HISTORY_MAX);
  let ok = false;
  try {
    ok = saveHistoryLog(next);
  } catch (e) {
    console.error("[logs] saveHistoryLog threw", e);
    ok = false;
  }
  if (!ok) {
    // Last resort: keep newest only (never drop the just-Analyzed mint)
    try {
      const mini = {
        ts: entry.ts || new Date().toISOString(),
        query: entry.query || entry.address || "token",
        address: entry.address || null,
        symbol: entry.symbol || null,
        name: entry.name || null,
        chain: entry.chain || "solana",
        price_usd: entry.price_usd,
        market_cap_usd: entry.market_cap_usd,
      };
      localStorage.setItem(HISTORY_KEY, JSON.stringify([mini]));
      console.warn("[logs] kept only latest Analyze; dropped all earlier mints");
    } catch (e2) {
      console.error("[logs] pushHistoryLog could not persist", e2);
    }
  }
  return loadHistoryLog();
}

/**
 * Record a successful Analyze into Logs (top of list = current mint).
 * Safe to call even if other UI rendering fails.
 */
function recordAnalyzeInLogs(data, query) {
  if (!data || !data.ok) return false;
  let qArg = query;
  try {
    if (!qArg) {
      qArg =
        ($("query") && $("query").value) ||
        data.query ||
        (data.token && data.token.address) ||
        "";
    }
  } catch (_) {
    qArg = (data && data.query) || query || "";
  }
  qArg = String(qArg || "").trim();
  let entry = null;
  try {
    entry = buildHistoryEntry(data, qArg);
  } catch (e) {
    console.warn("[logs] buildHistoryEntry threw", e);
    entry = null;
  }
  if (!entry) {
    let addr = "";
    try {
      addr =
        bareMintAddr(
          (data.token && data.token.address) ||
            data.query ||
            qArg ||
            ($("query") && $("query").value) ||
            ""
        ) || "";
    } catch (_) {
      addr = String(qArg || "").trim();
    }
    if (!addr) {
      console.warn("[logs] no address/query to record");
      return false;
    }
    entry = {
      ts: new Date().toISOString(),
      query: addr,
      address: addr,
      symbol: (data.token && data.token.symbol) || null,
      name: (data.token && data.token.name) || null,
      chain: (data.token && data.token.chain_id) || "solana",
      price_usd: (data.market && data.market.price_usd) || null,
      market_cap_usd:
        (data.market &&
          (data.market.market_cap_usd || data.market.fdv_usd)) ||
        null,
      liquidity_usd: (data.market && data.market.liquidity_usd) || null,
      volume_h24_usd: (data.market && data.market.volume_h24_usd) || null,
    };
  }
  // Ensure address is set
  if (!entry.address && qArg) {
    try {
      entry.address = bareMintAddr(qArg) || qArg;
    } catch (_) {
      entry.address = qArg;
    }
  }
  pushHistoryLog(entry);
  console.info(
    "[logs] recorded",
    entry.symbol || entry.query || "?",
    String(entry.address || "").slice(0, 12)
  );
  // Defer panel paint — full Logs render freezes Opera after Analyze
  const highlight = entry.address || entry.query || "";
  setTimeout(() => {
    try {
      refreshHistoryPanel(highlight);
    } catch (_) {
      try {
        refreshHistoryPanel();
      } catch (__) {
        /* ignore */
      }
    }
  }, 0);
  return true;
}

function entryOverviewText(e) {
  const lines = [];
  if (!e || typeof e !== "object") return "(empty log entry)";
  let ts = String(e.ts || "").slice(0, 19).replace("T", " ");
  if (ts) ts = ts + " UTC";
  const sym = e.symbol || e.query || "token";
  const name = e.name || "";
  let title = sym;
  if (name && name.toUpperCase() !== String(sym).toUpperCase()) {
    title = sym + "  (" + name + ")";
  }
  lines.push(title);
  lines.push("When:   " + (ts || "—"));
  lines.push("Chain:  " + (e.chain || "—") + "  ·  DEX: " + (e.dex_id || "—"));
  if (e.address) lines.push("Mint:   " + e.address);
  if (e.query && e.query !== sym && e.query !== e.address) {
    lines.push("Query:  " + e.query);
  }
  const mbits = [];
  const price = fmtUsdHist(e.price_usd);
  const mcap = fmtUsdHist(e.market_cap_usd);
  const liq = fmtUsdHist(e.liquidity_usd);
  const vol = fmtUsdHist(e.volume_h24_usd);
  const chg = fmtPctHist(e.price_change_h24_pct);
  if (price) mbits.push("price " + price);
  if (mcap) mbits.push("mcap " + mcap);
  if (liq) mbits.push("liq " + liq);
  if (vol) mbits.push("vol24 " + vol);
  if (chg) mbits.push("24h " + chg);
  if (mbits.length) lines.push("Market: " + mbits.join(" · "));
  const t1 = fmtPctHist(e.top1_pct);
  const t5 = fmtPctHist(e.top5_pct);
  const t10 = fmtPctHist(e.top10_pct);
  if (e.holders_ok || t1 || t5 || t10) {
    lines.push(
      "Holders: risk " +
        (e.concentration_risk || "—") +
        "  ·  Top1 " +
        (t1 || "—") +
        " · Top5 " +
        (t5 || "—") +
        " · Top10 " +
        (t10 || "—")
    );
  }
  const bp = fmtPctHist(e.bundle_pct);
  if (e.bundle_risk || bp) {
    lines.push(
      "Bundles: risk " + (e.bundle_risk || "—") + "  ·  share " + (bp || "—")
    );
  }
  lines.push(
    "Alerts:  " +
      (Number(e.alerts_priority_count) || 0) +
      " top-priority warning(s)"
  );
  const pfm = e.pumpfun || {};
  if (pfm.is_pump_mint || pfm.status) {
    lines.push(
      "Pump:    mint=" +
        pfm.is_pump_mint +
        "  status=" +
        (pfm.status || "—") +
        "  graduated=" +
        pfm.graduated
    );
  }
  if (e.pair_url) lines.push("Link:    " + e.pair_url);
  return lines.join("\n");
}

function formatHistoryLogText(items) {
  /** Plain-text export (Download .txt) — single bracket separators */
  const rows = items != null ? items : loadHistoryLog();
  const entrySep =
    "[[============================================================]]";
  const lines = [
    entrySep,
    "  LOGS",
    "  Last " +
      HISTORY_MAX +
      " token searches on this browser (oldest deleted on consecutive lookups when full)",
    entrySep,
    "",
  ];
  if (!rows.length) {
    lines.push("  No searches yet.");
    lines.push("  Run Analyze — each successful lookup is logged here.");
    lines.push("");
    lines.push("  Use Download to save this log as a text or JSON file.");
    return lines.join("\n") + "\n";
  }
  lines.push("  Entries: " + rows.length + " / " + HISTORY_MAX);
  lines.push("");
  rows.forEach((e, idx) => {
    // Single bracket line between entries
    lines.push(entrySep);
    lines.push("");
    lines.push("  " + String(idx + 1).padStart(2) + ".");
    lines.push(stripSolscanUrlLines(entryOverviewText(e)));
    lines.push("");
    lines.push("  --- HOLDERS SNAPSHOT ---");
    lines.push(
      stripSolscanUrlLines(cleanLogsSnapshot(e.holders_snapshot || "")) ||
        "(none)"
    );
    lines.push("");
    lines.push("  --- BUNDLES SNAPSHOT ---");
    lines.push(
      stripSolscanUrlLines(cleanLogsSnapshot(e.bundles_snapshot || "")) ||
        "(none)"
    );
    lines.push("");
  });
  lines.push(entrySep);
  lines.push("  — end of logs —");
  return lines.join("\n") + "\n";
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function historyEntryMatchesCa(e, hl) {
  if (!hl || !e) return false;
  const eAddr = String(e.address || "")
    .trim()
    .toLowerCase();
  const eQ = String(e.query || "")
    .trim()
    .toLowerCase();
  const eSym = String(e.symbol || "")
    .trim()
    .toLowerCase();
  const eName = String(e.name || "")
    .trim()
    .toLowerCase();
  if (eAddr && (eAddr === hl || eAddr.includes(hl) || (hl.length >= 6 && hl.includes(eAddr)))) {
    return true;
  }
  if (eQ && (eQ === hl || eQ.includes(hl) || (hl.length >= 6 && hl.includes(eQ)))) {
    return true;
  }
  // Allow $SYMBOL or name search for convenience
  if (eSym && (eSym === hl || eSym === hl.replace(/^\$/, "") || ("$" + eSym) === hl)) {
    return true;
  }
  if (eName && eName === hl) return true;
  return false;
}

function refreshHistoryPanel(highlightCa) {
  const list = $("historyList");
  const dump = $("text-history");
  const rows = loadHistoryLog();
  // Keep plain text dump for download parity / debugging
  if (dump) dump.textContent = formatHistoryLogText(rows);

  if (!list) {
    setPanelText("history", formatHistoryLogText(rows));
    return;
  }

  if (!rows.length) {
    list.innerHTML =
      '<p class="logs-empty">Run Analyze — successful searches are logged here (max ' +
      HISTORY_MAX +
      ").<br/>" +
      "Each entry shows Overview · Holders · Bundles side by side.<br/>" +
      "After " +
      HISTORY_MAX +
      " entries, the <strong>earliest</strong> mints are deleted first (never the latest Analyze).<br/>" +
      "Use the search bar above to find a previous lookup by CA.</p>";
    return;
  }

  const hl = normalizeCaQuery(highlightCa || "").toLowerCase();
  const sep =
    "[[============================================================]]";
  let matchCount = 0;
  if (hl) {
    rows.forEach((e) => {
      if (historyEntryMatchesCa(e, hl)) matchCount += 1;
    });
  }
  let html =
    '<p class="logs-meta">Entries: ' +
    rows.length +
    " / " +
    HISTORY_MAX +
    " · Overview | Holders | Bundles in a row" +
    (hl
      ? " · Search hits: " +
        matchCount +
        (matchCount ? " (highlighted)" : " — none")
      : " · Search by CA above") +
    "</p>";

  let firstHitId = true;
  rows.forEach((e, idx) => {
    const isHit = historyEntryMatchesCa(e, hl);
    // Single separator between entries (not double)
    html +=
      '<div class="logs-sep" aria-hidden="true">' + escHtml(sep) + "</div>";

    const sym = e.symbol || e.query || "token";
    const name = e.name || "";
    let title = sym;
    if (name && name.toUpperCase() !== String(sym).toUpperCase()) {
      title = sym + "  (" + name + ")";
    }
    let ts = String(e.ts || "").slice(0, 19).replace("T", " ");
    if (ts) ts += " UTC";

    const overview = entryOverviewText(e);
    const holdersPlain =
      cleanLogsSnapshot(e.holders_snapshot || "") ||
      "(no holders snapshot for this entry)";
    const bundlesPlain =
      cleanLogsSnapshot(e.bundles_snapshot || "") ||
      "(no bundles snapshot for this entry)";

    // Overview: clickable mint + light % colors (not Top1/5/10 style lines)
    const overviewHtml = formatHoldersRichHtml(overview);
    // Holders: % colors + yellow amounts; Bundles: group % colors + Top10 ex-LP uncolored
    const holdersHtml = formatHoldersRichHtml(holdersPlain);
    const bundlesHtml = formatBundlesRichHtml(bundlesPlain);

    // Subline CA — yellow copyable (same scheme as Ruggers / summary bar)
    let subHtml = escHtml((ts || "—") + " · " + (e.chain || "—") + " · ");
    if (e.address) {
      subHtml +=
        '<a href="#" class="copy-mint mono logs-ca-copy" data-copy="' +
        escHtml(e.address) +
        '" title="Left-click to copy mint / CA">' +
        escHtml(e.address) +
        "</a>";
    } else {
      subHtml += "—";
    }

    const hitId = isHit && firstHitId;
    if (hitId) firstHitId = false;

    html +=
      '<article class="logs-entry' +
      (isHit ? " logs-hit" : "") +
      '"' +
      (hitId ? ' id="logs-hit-entry"' : "") +
      ">" +
      '<h3 class="logs-entry-head">' +
      escHtml(String(idx + 1).padStart(2, "0") + ". " + title) +
      "</h3>" +
      '<p class="logs-entry-sub">' +
      subHtml +
      "</p>" +
      '<div class="logs-row">' +
      '<div class="logs-col">' +
      '<div class="logs-col-title">Overview</div>' +
      '<pre class="logs-col-body">' +
      overviewHtml +
      "</pre></div>" +
      '<div class="logs-col">' +
      '<div class="logs-col-title">Holders snapshot</div>' +
      '<pre class="logs-col-body">' +
      holdersHtml +
      "</pre></div>" +
      '<div class="logs-col">' +
      '<div class="logs-col-title">Bundles snapshot</div>' +
      '<pre class="logs-col-body">' +
      bundlesHtml +
      "</pre></div>" +
      "</div></article>";
  });

  list.innerHTML = html;
  wireCopyMintClicks(list);
  if (hl) {
    const hitEl = document.getElementById("logs-hit-entry");
    if (hitEl) {
      try {
        hitEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (_) {
        /* ignore */
      }
    }
  }
}

function downloadHistoryLog() {
  const items = loadHistoryLog();
  if (!items.length) {
    showError("Logs is empty. Run Analyze first, then download.");
    return;
  }
  showError("");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  const asJson = window.confirm(
    "OK = save as JSON\nCancel = save as readable text (.txt)"
  );
  let blob;
  let name;
  if (asJson) {
    blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    name = "adtc_history_log_" + stamp + ".json";
  } else {
    blob = new Blob([formatHistoryLogText(items)], {
      type: "text/plain;charset=utf-8",
    });
    name = "adtc_history_log_" + stamp + ".txt";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function clearHistoryLog() {
  if (!loadHistoryLog().length) {
    showError("Logs is already empty.");
    return;
  }
  if (!window.confirm("Clear all Logs entries on this browser?")) return;
  saveHistoryLog([]);
  setLogsCaStatus("", false);
  const inp = $("logsCaSearch");
  if (inp) inp.value = "";
  refreshHistoryPanel();
  showError("");
}

function setLogsCaStatus(msg, ok) {
  const el = $("logsCaStatus");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("ok");
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("ok", !!ok);
}

/**
 * Logs search bar: find a previous Analyze by mint/CA (or symbol).
 * Highlights matching entries and scrolls to the first hit.
 */
function logsFindByCa() {
  const input = $("logsCaSearch");
  const q = input ? String(input.value || "").trim() : "";
  if (!q) {
    setLogsCaStatus("Paste a mint / CA into the search bar first.", false);
    refreshHistoryPanel();
    return;
  }
  const hit = findHistoryEntryByCa(q);
  if (hit && hit.entry) {
    const e = hit.entry;
    const n = loadHistoryLog().filter((row) =>
      historyEntryMatchesCa(row, normalizeCaQuery(q).toLowerCase())
    ).length;
    setLogsCaStatus(
      "Found" +
        (n > 1 ? " " + n + " matches" : "") +
        (e.symbol ? " · $" + e.symbol : "") +
        (e.address ? " · " + String(e.address).slice(0, 12) + "…" : "") +
        (e.ts
          ? " · " + String(e.ts).slice(0, 19).replace("T", " ") + " UTC"
          : "") +
        " (entry #" +
        (hit.index + 1) +
        ")",
      true
    );
    refreshHistoryPanel(e.address || normalizeCaQuery(q));
    return;
  }
  setLogsCaStatus(
    "No previous lookup for that CA in Logs (this browser, last " +
      HISTORY_MAX +
      "). Run Analyze first.",
    false
  );
  refreshHistoryPanel(normalizeCaQuery(q));
}

function wireLogsCaSearch() {
  const form = $("logsCaForm");
  if (form) {
    form.onsubmit = (ev) => {
      ev.preventDefault();
      logsFindByCa();
    };
  }
  const go = $("logsCaGo");
  const inp = $("logsCaSearch");
  if (go) {
    go.onclick = (ev) => {
      ev.preventDefault();
      logsFindByCa();
    };
  }
  if (inp) {
    inp.onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        logsFindByCa();
      }
    };
  }
}

function initHistory() {
  // Wire only — do not render the full log on boot (can freeze Opera GX)
  wireLogsCaSearch();
  const r = $("historyRefresh");
  const c = $("historyClear");
  const d = $("historyDownload");
  if (r)
    r.addEventListener("click", () => {
      const inp = $("logsCaSearch");
      const q = inp ? String(inp.value || "").trim() : "";
      if (q) logsFindByCa();
      else {
        setLogsCaStatus("", false);
        refreshHistoryPanel();
      }
    });
  if (c) c.addEventListener("click", () => clearHistoryLog());
  if (d) d.addEventListener("click", () => downloadHistoryLog());
}

// ── Ruggers tab: first-lookup sell tracking (browser localStorage) ───

function loadRuggersStore() {
  let data = {};
  try {
    const raw = localStorage.getItem(RUGGERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed;
      }
    }
  } catch (_e) {
    data = {};
  }
  // Overlay in-memory tracks (newer / recovered after quota fail)
  try {
    for (const [k, rec] of Object.entries(__ruggersMem)) {
      if (!k || k === "__meta" || !rec || typeof rec !== "object") continue;
      data[k] = rec;
    }
  } catch (_) {
    /* ignore */
  }
  return migrateRuggersStore(data);
}

/** Keep last processed rec in RAM so panel refresh works even if localStorage fails. */
function rememberRuggersRec(storeKey, rec, mintBare) {
  if (!rec || typeof rec !== "object") return;
  const bare = bareMintAddr(mintBare || rec.address || "");
  const key =
    String(storeKey || rec.mint_key || "").trim() ||
    (bare ? mintKeyFromToken(bare, rec.chain || "solana") : "");
  if (key) __ruggersMem[key] = rec;
  if (bare) __ruggersMem[bare] = rec;
}

/**
 * Whether a snap wallet should enter the Ruggers baseline.
 * Categories always; plain holders only with bag ≥ Single min (0.01%).
 * Dust without a category is not frozen — bloated baselines kill persistence.
 */
function shouldTrackRuggersWallet(info, opts) {
  if (!info || typeof info !== "object") return false;
  const o = opts || {};
  if (o.force) return true;
  if (info.label === "creator" || info.is_creator) return true;
  if (
    info.in_similar ||
    info.in_multi ||
    info.in_multi_send ||
    info.in_insider ||
    info.in_suspect ||
    info.in_funding ||
    info.in_launch ||
    info.in_fresh
  ) {
    return true;
  }
  const pct =
    info.pct_supply != null && Number.isFinite(Number(info.pct_supply))
      ? Number(info.pct_supply)
      : null;
  if (pct != null && pct >= RUGGERS_SINGLE_MIN_PCT) return true;
  // Balance-only measurable without category: skip (can't rank Single)
  return false;
}

/**
 * Pick up to RUGGERS_MAX_TRACK_WALLETS from a snap wallet map.
 * Priority: creator/categories/measurable bags by size, then rest of categories.
 */
function selectRuggersTrackWallets(wallets, extraKeep) {
  const src = wallets && typeof wallets === "object" ? wallets : {};
  const keep = new Set();
  if (extraKeep) {
    for (const w of extraKeep) {
      if (w) keep.add(w);
    }
  }
  const scored = [];
  for (const [w, info] of Object.entries(src)) {
    if (!w || !info) continue;
    if (!shouldTrackRuggersWallet(info) && !keep.has(w)) continue;
    const pct =
      info.pct_supply != null && Number.isFinite(Number(info.pct_supply))
        ? Number(info.pct_supply)
        : 0;
    let pri = 0;
    if (info.label === "creator" || info.is_creator) pri = 100;
    else if (info.in_similar || info.in_insider || info.in_suspect) pri = 80;
    else if (info.in_multi) pri = 70;
    else if (info.in_multi_send || info.in_funding) pri = 60;
    else if (info.in_fresh) pri = 50;
    else if (pct >= RUGGERS_SINGLE_MIN_PCT) pri = 40;
    else pri = 10;
    scored.push({ w, pri, pct });
  }
  scored.sort((a, b) => b.pri - a.pri || b.pct - a.pct || a.w.localeCompare(b.w));
  const out = {};
  let n = 0;
  // Always include force-keep (sticky sellers etc.) even if not in snap
  for (const w of keep) {
    if (src[w]) {
      out[w] = src[w];
      n++;
    }
  }
  for (const row of scored) {
    if (out[row.w]) continue;
    if (n >= RUGGERS_MAX_TRACK_WALLETS) break;
    out[row.w] = src[row.w];
    n++;
  }
  return out;
}

/** Drop pure-holding status rows; keep seller/swing/ever_sold for buy-back. */
function compactRuggersStatusForStore(status) {
  if (!status || typeof status !== "object") return {};
  const out = {};
  for (const [w, st] of Object.entries(status)) {
    if (!w || !st || typeof st !== "object") continue;
    if (
      st.tag === "seller" ||
      st.tag === "swing" ||
      st.ever_sold ||
      st.sticky_lane_seller ||
      st.is_flagged ||
      st.ever_flagged_on_mint
    ) {
      out[w] = st;
    }
  }
  return out;
}

/** Slim bool flags (omit false) on first_wallets for smaller JSON. */
function compactRuggersFirstWalletsForStore(firstWallets) {
  if (!firstWallets || typeof firstWallets !== "object") return {};
  const out = {};
  for (const [w, fw] of Object.entries(firstWallets)) {
    if (!w || !fw || typeof fw !== "object") continue;
    const row = {
      pct_supply: fw.pct_supply != null ? fw.pct_supply : null,
      balance: fw.balance != null ? fw.balance : null,
    };
    if (fw.rank != null) row.rank = fw.rank;
    if (fw.label) row.label = fw.label;
    if (fw.origin_lane) row.origin_lane = fw.origin_lane;
    if (fw.first_seen_at) row.first_seen_at = fw.first_seen_at;
    if (fw.in_similar) row.in_similar = true;
    if (fw.in_multi) row.in_multi = true;
    if (fw.in_multi_send) row.in_multi_send = true;
    if (fw.in_insider) row.in_insider = true;
    if (fw.in_suspect) row.in_suspect = true;
    if (fw.in_funding) row.in_funding = true;
    if (fw.in_launch) row.in_launch = true;
    if (fw.in_fresh) row.in_fresh = true;
    if (fw.exclude_from_single) row.exclude_from_single = true;
    if (fw.is_creator) row.is_creator = true;
    if (fw.enrolled_after_baseline) row.enrolled_after_baseline = true;
    out[w] = row;
  }
  return out;
}

/** Prepare a mint rec for localStorage (compact + no dual bulk). */
function compactRuggersRecForStore(rec) {
  if (!rec || typeof rec !== "object") return rec;
  const c = { ...rec };
  c.first_wallets = compactRuggersFirstWalletsForStore(rec.first_wallets);
  c.status = compactRuggersStatusForStore(rec.status);
  // Cap similar groups
  if (Array.isArray(c.first_similar_groups) && c.first_similar_groups.length > 12) {
    c.first_similar_groups = c.first_similar_groups.slice(0, 12);
  }
  return c;
}

/** Canonical mint keys only — bare CA dual-keys doubled JSON size past quota. */
function ruggersStoreKeysForPersist(store) {
  const s = store && typeof store === "object" ? store : {};
  const byBare = Object.create(null);
  const meta = s.__meta && typeof s.__meta === "object" ? s.__meta : {};
  for (const [k, rec] of Object.entries(s)) {
    if (k === "__meta" || !rec || typeof rec !== "object") continue;
    if (rec.first_wallets == null && !rec.address) continue;
    const bare = bareMintAddr(rec.address || k);
    if (!bare) continue;
    const canon = mintKeyFromToken(bare, rec.chain || "solana");
    const prev = byBare[bare];
    if (!prev) {
      byBare[bare] = { key: canon, rec };
      continue;
    }
    // Prefer newer last_ts / higher lookup_count
    const tPrev = String(prev.rec.last_ts || prev.rec.first_ts || "");
    const tCur = String(rec.last_ts || rec.first_ts || "");
    const nPrev = Number(prev.rec.lookup_count) || 0;
    const nCur = Number(rec.lookup_count) || 0;
    if (nCur > nPrev || (nCur === nPrev && tCur >= tPrev)) {
      byBare[bare] = { key: canon, rec };
    }
  }
  // Sort by recency, keep newest RUGGERS_MAX_MINTS
  const rows = Object.values(byBare).sort((a, b) => {
    const ta = String(a.rec.last_ts || a.rec.first_ts || "");
    const tb = String(b.rec.last_ts || b.rec.first_ts || "");
    return tb.localeCompare(ta);
  });
  const out = { __meta: { ...meta, rules_version: RUGGERS_RULES_VERSION } };
  for (const row of rows.slice(0, RUGGERS_MAX_MINTS)) {
    out[row.key] = compactRuggersRecForStore(row.rec);
  }
  return out;
}

/**
 * One-time cleanup: old builds dumped global RugWatch wallets into
 * flagged_known and left them sticky forever. Wipe Flagged section data
 * when rules version is behind; keep first_wallets / sellers / swings.
 *
 * Also strip any flagged_sellers entry that was not created under the
 * current rules (entered_via + rules_v), so junk cannot survive.
 */
function migrateRuggersStore(store) {
  const meta = store.__meta && typeof store.__meta === "object" ? store.__meta : {};
  const ver = Number(meta.rules_version) || 0;
  let changed = ver < RUGGERS_RULES_VERSION;

  const next = {};
  for (const [key, rec] of Object.entries(store)) {
    if (key === "__meta") continue;
    if (!rec || typeof rec !== "object") continue;
    const copy = { ...rec };

    if (ver < RUGGERS_RULES_VERSION) {
      // Pre-v9: full Flagged + false-Upload wipe (cloud bleed)
      if (ver < 9) {
        copy.flagged_known = {};
        copy.flagged_sellers = {};
        copy.rugwatch_known = {};
        const keepSim = {};
        if (copy.uploaded_similar && typeof copy.uploaded_similar === "object") {
          for (const [w, meta] of Object.entries(copy.uploaded_similar)) {
            if (w && meta) keepSim[w] = meta;
          }
        }
        copy.uploaded_similar = keepSim;
        const keepUp = {};
        for (const w of Object.keys(keepSim)) {
          keepUp[w] = {
            via: "button",
            mint: copy.address || null,
            section: "similar",
            uploaded_at: (keepSim[w] && keepSim[w].uploaded_at) || null,
            last_update: new Date().toISOString(),
          };
        }
        copy.ruggers_uploaded = keepUp;
        if (copy.status && typeof copy.status === "object") {
          for (const st of Object.values(copy.status)) {
            if (!st || typeof st !== "object") continue;
            delete st.ruggers_uploaded;
            delete st.ruggers_uploaded_section;
          }
        }
        // map legacy "excluded" lanes
        if (copy.first_wallets && typeof copy.first_wallets === "object") {
          for (const fw of Object.values(copy.first_wallets)) {
            if (!fw || typeof fw !== "object") continue;
            if (fw.origin_lane === "excluded" || fw.origin_lane === "single") {
              delete fw.origin_lane;
            }
          }
        }
        if (copy.status && typeof copy.status === "object") {
          const st = {};
          for (const [w, row] of Object.entries(copy.status)) {
            if (!row || typeof row !== "object") continue;
            const nextRow = { ...row, is_flagged: false };
            if (nextRow.origin_lane === "excluded") delete nextRow.origin_lane;
            delete nextRow.ruggers_uploaded;
            delete nextRow.ruggers_uploaded_section;
            st[w] = nextRow;
          }
          copy.status = st;
        }
        changed = true;
      }
      // v10+: compact persist only — keep sellers / sticky / flagged intact
      copy.rules_version = RUGGERS_RULES_VERSION;
      changed = true;
    } else {
      // Current rules: keep Flagged rows from the sold-while-flagged path (v9+).
      // Do NOT require rules_v === current — that wiped legit v9 rows after v10 bump.
      const fs = copy.flagged_sellers;
      if (fs && typeof fs === "object") {
        const cleaned = {};
        let fsChanged = false;
        for (const [w, metaW] of Object.entries(fs)) {
          if (!metaW || typeof metaW !== "object") {
            fsChanged = true;
            continue;
          }
          const via = String(metaW.entered_via || "");
          const rv = Number(metaW.rules_v) || 0;
          // Accept v9+ Flagged path; also accept missing rules_v if via is correct
          const ok =
            via === "sold_while_flagged" && (rv >= 9 || rv === 0);
          if (!ok) {
            fsChanged = true;
            continue;
          }
          const sealed = withSingleFlaggedFromMint(metaW);
          if (
            JSON.stringify(metaW.flagged_from_mints || []) !==
            JSON.stringify(sealed.flagged_from_mints || [])
          ) {
            fsChanged = true;
          }
          // Stamp current rules so future bumps don't re-scrub needlessly
          if (Number(sealed.rules_v) !== RUGGERS_RULES_VERSION) {
            sealed.rules_v = RUGGERS_RULES_VERSION;
            fsChanged = true;
          }
          cleaned[w] = sealed;
        }
        if (
          fsChanged ||
          Object.keys(cleaned).length !== Object.keys(fs).length
        ) {
          copy.flagged_sellers = cleaned;
          copy.flagged_known = { ...cleaned };
          changed = true;
        }
      }
    }
    next[key] = copy;
  }
  next.__meta = {
    ...meta,
    rules_version: RUGGERS_RULES_VERSION,
    migrated_at: meta.migrated_at || new Date().toISOString(),
    last_flagged_scrub: changed ? new Date().toISOString() : meta.last_flagged_scrub,
  };
  if (changed) {
    try {
      // Compact persist (no dual bare keys) so migrate itself doesn't blow quota
      const payload = ruggersStoreKeysForPersist(next);
      payload.__meta = {
        ...(payload.__meta || {}),
        ...(next.__meta || {}),
        rules_version: RUGGERS_RULES_VERSION,
        migrated_at: new Date().toISOString(),
      };
      const raw = JSON.stringify(payload);
      if (typeof safeLocalStorageSet === "function") {
        safeLocalStorageSet(RUGGERS_KEY, raw);
      } else {
        localStorage.setItem(RUGGERS_KEY, raw);
      }
    } catch (_e) {
      /* ignore */
    }
  }
  return next;
}

function saveRuggersStore(store) {
  const s = store && typeof store === "object" ? store : {};
  // Always remember full in-memory copies before compacting to disk
  try {
    for (const [k, rec] of Object.entries(s)) {
      if (k === "__meta" || !rec || typeof rec !== "object") continue;
      rememberRuggersRec(k, rec, rec.address);
    }
  } catch (_) {
    /* ignore */
  }

  // Progressive persist: full compact → fewer mints → sellers-only
  const attempts = [];
  try {
    attempts.push(ruggersStoreKeysForPersist(s));
  } catch (_) {
    attempts.push({ __meta: { rules_version: RUGGERS_RULES_VERSION } });
  }
  // Fewer mints
  try {
    const slim = ruggersStoreKeysForPersist(s);
    const keys = Object.keys(slim).filter((k) => k !== "__meta");
    keys.sort((a, b) => {
      const ta = String((slim[a] && (slim[a].last_ts || slim[a].first_ts)) || "");
      const tb = String((slim[b] && (slim[b].last_ts || slim[b].first_ts)) || "");
      return tb.localeCompare(ta);
    });
    const cut = { __meta: slim.__meta };
    for (const k of keys.slice(0, 4)) cut[k] = slim[k];
    attempts.push(cut);
  } catch (_) {
    /* ignore */
  }
  // Sellers-only per mint (drop pure first_wallets holding bags)
  try {
    const base = ruggersStoreKeysForPersist(s);
    const sellersOnly = { __meta: base.__meta };
    for (const [k, rec] of Object.entries(base)) {
      if (k === "__meta" || !rec) continue;
      const fwKeep = {};
      const st = rec.status || {};
      const sticky = rec.sticky_lane_sellers || {};
      const flagged = rec.flagged_sellers || {};
      for (const w of Object.keys(st)) {
        if (rec.first_wallets && rec.first_wallets[w]) fwKeep[w] = rec.first_wallets[w];
      }
      for (const w of Object.keys(sticky)) {
        if (rec.first_wallets && rec.first_wallets[w]) fwKeep[w] = rec.first_wallets[w];
      }
      for (const w of Object.keys(flagged)) {
        if (rec.first_wallets && rec.first_wallets[w]) fwKeep[w] = rec.first_wallets[w];
      }
      // Keep creator + category baselines even if not yet sold
      if (rec.first_wallets) {
        let nCat = 0;
        for (const [w, fw] of Object.entries(rec.first_wallets)) {
          if (fwKeep[w]) continue;
          if (
            fw &&
            (fw.label === "creator" ||
              fw.is_creator ||
              fw.in_similar ||
              fw.in_multi ||
              fw.in_multi_send ||
              fw.in_funding ||
              fw.in_insider ||
              fw.in_suspect ||
              fw.in_fresh)
          ) {
            fwKeep[w] = fw;
            nCat++;
            if (nCat >= 200) break;
          }
        }
      }
      sellersOnly[k] = {
        ...rec,
        first_wallets: fwKeep,
        status: compactRuggersStatusForStore(rec.status),
      };
    }
    attempts.push(sellersOnly);
  } catch (_) {
    /* ignore */
  }

  let saved = false;
  for (const payload of attempts) {
    try {
      if (!payload.__meta || typeof payload.__meta !== "object") {
        payload.__meta = {};
      }
      payload.__meta.rules_version = RUGGERS_RULES_VERSION;
      payload.__meta.saved_at = new Date().toISOString();
      const raw = JSON.stringify(payload);
      if (typeof safeLocalStorageSet === "function") {
        if (safeLocalStorageSet(RUGGERS_KEY, raw)) {
          saved = true;
          break;
        }
      } else {
        localStorage.setItem(RUGGERS_KEY, raw);
        saved = true;
        break;
      }
    } catch (err) {
      console.warn("[ruggers] save attempt failed", err && err.name);
    }
  }
  if (!saved) {
    console.error(
      "[ruggers] localStorage save failed — using in-memory track only this session. " +
        "Sellers still work until you close the tab; free space or clear old mints."
    );
  }
  return saved;
}

/** Bare mint CA (no chain: prefix), trimmed. */
function bareMintAddr(address) {
  let a = String(address || "").trim();
  if (!a) return "";
  if (a.includes(":") && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) {
    a = a.split(":").pop() || a;
  }
  return String(a).trim();
}

function sameMintAddr(a, b) {
  const x = bareMintAddr(a).toLowerCase();
  const y = bareMintAddr(b).toLowerCase();
  return !!(x && y && x === y);
}

/**
 * Canonical Ruggers store key — always chain-prefixed so mints never collide
 * and bare vs solana: keys cannot mix two different tracks.
 */
function mintKeyFromToken(address, chain) {
  const a = bareMintAddr(address);
  if (!a) return "";
  let c = String(chain || "").trim().toLowerCase();
  if (!c || c === "sol" || c === "solana-mainnet") c = "solana";
  return c + ":" + a;
}

/**
 * Find the track record for a mint. Only returns a rec whose rec.address
 * matches the requested mint (never another mint's sellers/hardware).
 */
function findRuggersRecForMint(store, address, chain) {
  const s = store && typeof store === "object" ? store : {};
  const bare = bareMintAddr(address);
  if (!bare) return { key: "", rec: null };
  const wantKey = mintKeyFromToken(bare, chain || "solana");
  const candidates = [wantKey, bare, "solana:" + bare];
  const seen = new Set();
  for (const k of candidates) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const rec = s[k];
    if (!rec || typeof rec !== "object") continue;
    // Match on rec.address OR key itself (legacy rows sometimes lack address)
    if (
      sameMintAddr(rec.address, bare) ||
      sameMintAddr(k, bare) ||
      sameMintAddr(rec.address || k, bare)
    ) {
      return { key: k, rec };
    }
  }
  // Full scan — address / key match only (never fuzzy suffix of unrelated mints)
  for (const [k, rec] of Object.entries(s)) {
    if (k === "__meta" || !rec || typeof rec !== "object") continue;
    if (sameMintAddr(rec.address, bare) || sameMintAddr(k, bare)) {
      return { key: k, rec };
    }
  }
  return { key: wantKey, rec: null };
}

/** Mint CA currently shown in the summary bar (if any). */
function getSummaryBarMintAddr() {
  try {
    const addrEl = $("sumAddr");
    if (addrEl) {
      const link = addrEl.querySelector(
        "a.sum-mint-link, a[href*='solscan'], a[href*='token'], a"
      );
      if (link) {
        // Prefer href mint (full CA) over visible text
        const href = String(link.getAttribute("href") || "");
        const hm = href.match(
          /(?:token|account)\/([1-9A-HJ-NP-Za-km-z]{32,44})/i
        );
        if (hm && hm[1]) return bareMintAddr(hm[1]);
        const t = bareMintAddr(link.textContent || "");
        if (t.length >= 32) return t;
      }
      const raw = bareMintAddr(addrEl.textContent || "");
      if (raw.length >= 32) return raw;
    }
    // Fallback: query input
    const q = $("query");
    if (q && q.value) {
      const v = bareMintAddr(normalizeCaQuery(q.value));
      if (v.length >= 32) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return "";
}

/**
 * Pull compact wallet snapshot from analyze payload (history_meta.ruggers_track)
 * or fall back to parsing holders/bundles text snapshots.
 */
function extractRuggersSnapshot(data) {
  if (!data || !data.ok) return null;
  const t = data.token || {};
  // Prefer token.address; fall back to query string (CA) when token meta is thin
  let address = bareMintAddr(t.address || "");
  if (!address) {
    address = bareMintAddr(data.query || "");
  }
  if (!address || address.length < 32) return null;
  const hm = data.history_meta || {};
  const track = hm.ruggers_track || data.ruggers_track || null;
  const chain = (t.chain_id || (data.market || {}).chain_id || "").trim() || "solana";
  const symbol = (t.symbol || "").trim() || null;
  const name = (t.name || "").trim() || null;
  const ts = data.generated_at || new Date().toISOString();

  // Use structured track whenever present — even if wallets[] is empty (still seed mint)
  if (track && typeof track === "object" && Array.isArray(track.wallets)) {
    const wallets = {};
    for (const row of track.wallets) {
      const w = (row && row.wallet) || "";
      if (!w) continue;
      const pct =
        row.pct_supply != null && Number.isFinite(Number(row.pct_supply))
          ? Number(row.pct_supply)
          : null;
      const bal =
        row.balance != null && Number.isFinite(Number(row.balance))
          ? Number(row.balance)
          : null;
      wallets[w] = {
        pct_supply: pct,
        balance: bal,
        rank: row.rank != null ? row.rank : null,
        label: row.label || null,
        in_similar: !!row.in_similar,
        in_multi: !!row.in_multi,
        in_multi_send: !!row.in_multi_send,
        in_insider: !!row.in_insider,
        in_suspect: !!row.in_suspect,
        in_funding: !!row.in_funding,
        in_launch: !!row.in_launch,
        in_fresh: !!row.in_fresh,
        exclude_from_single: !!row.exclude_from_single,
      };
    }
    const similar_groups = (track.similar_groups || []).map((g, i) => ({
      id: g.id || "sim" + (i + 1),
      count: g.count || (g.members || []).length,
      avg_pct: g.avg_pct != null ? Number(g.avg_pct) : null,
      total_pct: g.total_pct != null ? Number(g.total_pct) : null,
      wallets: (g.members || g.wallets || [])
        .map((m) => (typeof m === "string" ? m : m && m.wallet))
        .filter(Boolean),
    }));
    // ensure in_similar from groups
    for (const g of similar_groups) {
      for (const w of g.wallets || []) {
        if (wallets[w]) {
          wallets[w].in_similar = true;
          wallets[w].exclude_from_single = true;
        } else
          wallets[w] = {
            pct_supply: g.avg_pct,
            balance: null,
            rank: null,
            label: null,
            in_similar: true,
            exclude_from_single: true,
          };
      }
    }
    // Final Single exclusion: any bundle category or bag below min %
    for (const w of Object.keys(wallets)) {
      const row = wallets[w];
      if (!row) continue;
      const pct =
        row.pct_supply != null && Number.isFinite(Number(row.pct_supply))
          ? Number(row.pct_supply)
          : null;
      const bundleCat = !!(
        row.in_similar ||
        row.in_multi ||
        row.in_multi_send ||
        row.in_insider ||
        row.in_suspect ||
        row.in_funding ||
        row.in_launch ||
        row.in_fresh
      );
      const belowMin = pct == null || pct < RUGGERS_SINGLE_MIN_PCT;
      row.exclude_from_single = !!(
        row.exclude_from_single ||
        bundleCat ||
        belowMin ||
        row.label === "creator"
      );
    }
    const creator = (track.creator || "").trim() || null;
    if (creator && !wallets[creator]) {
      wallets[creator] = {
        pct_supply: null,
        balance: null,
        rank: null,
        label: "creator",
        in_similar: false,
        exclude_from_single: true,
      };
    } else if (creator && wallets[creator]) {
      wallets[creator].exclude_from_single = true;
    }
    // Previously flagged (RugWatch) — separate Ruggers section, not mixed into similar
    const flagged_known = {};
    for (const f of track.flagged_addresses || []) {
      const fw = ((f && (f.wallet || f.address)) || "").trim();
      if (!fw) continue;
      // Only the first mint ever — ignore extra mints from notes / API lists
      const notes = String(f.notes || "");
      const initial = pickInitialFlaggedFromMint(f, { notes });
      let timesFlagged = 0;
      try {
        timesFlagged = Number(
          f.times_flagged != null ? f.times_flagged : f.times_seen || 0
        );
      } catch (_) {
        timesFlagged = 0;
      }
      let mintFlagCount = 0;
      try {
        mintFlagCount = Number(f.mint_flag_count || 0);
      } catch (_) {
        mintFlagCount = 0;
      }
      flagged_known[fw] = {
        risk_score: f.risk_score != null ? Number(f.risk_score) : null,
        label: f.label || null,
        origin: f.origin || null,
        notes: notes || null,
        times_flagged: timesFlagged,
        mint_flag_count: mintFlagCount,
        flagged_from_mint: initial || null,
        flagged_from_mints: initial ? [initial] : [],
        on_this_mint: !!f.on_this_mint,
        in_top_holders: !!f.in_top_holders,
      };
    }
    return {
      address,
      chain,
      symbol,
      name,
      ts,
      creator,
      wallets,
      similar_groups,
      flagged_known,
      ok: true,
    };
  }

  // Fallback: parse text snapshots (older API / missing track)
  return parseRuggersFromText(
    address,
    chain,
    symbol,
    name,
    ts,
    hm.holders_snapshot || (data.sections && data.sections.holders) || "",
    hm.bundles_snapshot || (data.sections && data.sections.bundles) || ""
  );
}

function parseRuggersFromText(address, chain, symbol, name, ts, holdersText, bundlesText) {
  const wallets = {};
  let creator = null;
  const hText = String(holdersText || "");
  const bText = String(bundlesText || "");

  // Creator wallet block
  const cMatch = hText.match(
    /Creator wallet:\s*\n\s*([1-9A-HJ-NP-Za-km-z]{32,44})[\s\S]*?owns\s+([\d.]+)%/i
  );
  if (cMatch) {
    creator = cMatch[1];
    wallets[creator] = {
      pct_supply: Number(cMatch[2]),
      balance: null,
      rank: null,
      label: "creator",
      in_similar: false,
    };
  }

  // Top holder rows: "#N BAL (PCT" then next line address
  const lines = hText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      /#\s*(\d+)\s+([\d,]+\.?\d*)\s*\(\s*([\d.]+)%/i
    );
    if (!m) continue;
    let addr = "";
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const am = lines[j].match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
      if (am) {
        addr = am[1];
        break;
      }
    }
    if (!addr) continue;
    const bal = Number(String(m[2]).replace(/,/g, ""));
    const pct = Number(m[3]);
    if (!wallets[addr]) {
      wallets[addr] = {
        pct_supply: Number.isFinite(pct) ? pct : null,
        balance: Number.isFinite(bal) ? bal : null,
        rank: Number(m[1]) || null,
        label: null,
        in_similar: false,
      };
    }
  }

  // Similar-size groups from bundles text: collect wallets under "Similar"
  const similar_groups = [];
  const simSection = bText.match(
    /Similar[\s\S]*?(?=Insider|Suspect|Multi-account|Notes:|$)/i
  );
  if (simSection) {
    const addrs = [];
    const re = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
    let mm;
    while ((mm = re.exec(simSection[0]))) {
      if (!addrs.includes(mm[1])) addrs.push(mm[1]);
    }
    if (addrs.length >= 2) {
      similar_groups.push({
        id: "sim1",
        count: addrs.length,
        avg_pct: null,
        total_pct: null,
        wallets: addrs,
      });
      for (const w of addrs) {
        if (wallets[w]) wallets[w].in_similar = true;
        else
          wallets[w] = {
            pct_supply: null,
            balance: null,
            rank: null,
            label: null,
            in_similar: true,
          };
      }
    }
  }

  // Even with zero parsed wallets, return a snap so this mint can be seeded
  return {
    address,
    chain,
    symbol,
    name,
    ts,
    creator,
    wallets,
    similar_groups,
    ok: true,
  };
}

/** Round supply % for display / store (keeps fine precision). */
function roundSupplyPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Number(n) * 1e6) / 1e6;
}

/**
 * % of *token supply* this wallet sold since first lookup
 * (first_pct − current_pct). Not “100% of bag”.
 */
function ruggersSoldSupplyPct(firstPct, currentPct, listed) {
  if (firstPct == null || !Number.isFinite(Number(firstPct))) return null;
  const f = Number(firstPct);
  if (f < 0) return null;
  if (!listed || currentPct == null || !Number.isFinite(Number(currentPct))) {
    return roundSupplyPct(Math.max(0, f));
  }
  const c = Math.max(0, Number(currentPct));
  return roundSupplyPct(Math.max(0, f - c));
}

/**
 * % of *token supply* bought back (current hold after re-entry as swing).
 */
function ruggersBoughtBackSupplyPct(currentPct, listed) {
  if (!listed || currentPct == null || !Number.isFinite(Number(currentPct))) {
    return null;
  }
  const c = Number(currentPct);
  if (c <= 0) return null;
  return roundSupplyPct(c);
}

/** True if first-lookup bag is measurable (required to prove a ≥99% sell). */
function hasRuggersFirstBag(first) {
  if (!first || typeof first !== "object") return false;
  const fp =
    first.pct_supply != null && Number.isFinite(Number(first.pct_supply))
      ? Number(first.pct_supply)
      : null;
  const fb =
    first.balance != null && Number.isFinite(Number(first.balance))
      ? Number(first.balance)
      : null;
  return (fp != null && fp > 0) || (fb != null && fb > 0);
}

function countMeasurableRuggersBags(firstWallets) {
  let n = 0;
  for (const w of Object.keys(firstWallets || {})) {
    if (hasRuggersFirstBag(firstWallets[w])) n++;
  }
  return n;
}

function snapHasMeasurableRuggersBags(wallets) {
  for (const info of Object.values(wallets || {})) {
    if (hasRuggersFirstBag(info)) return true;
  }
  return false;
}

/** Fill null first bag from a later sighting while still holding (enables sell detection). */
function upgradeRuggersFirstBag(fw, info) {
  if (!fw || !info) return false;
  let changed = false;
  if (
    !hasRuggersFirstBag(fw) ||
    (fw.pct_supply == null &&
      info.pct_supply != null &&
      Number.isFinite(Number(info.pct_supply)) &&
      Number(info.pct_supply) > 0)
  ) {
    if (
      info.pct_supply != null &&
      Number.isFinite(Number(info.pct_supply)) &&
      Number(info.pct_supply) > 0
    ) {
      fw.pct_supply = Number(info.pct_supply);
      changed = true;
    }
  }
  if (
    (fw.balance == null || !Number.isFinite(Number(fw.balance)) || Number(fw.balance) <= 0) &&
    info.balance != null &&
    Number.isFinite(Number(info.balance)) &&
    Number(info.balance) > 0
  ) {
    fw.balance = Number(info.balance);
    changed = true;
  }
  return changed;
}

/**
 * Sold ≥99% of first bag when:
 *  - we *know* first bag, AND
 *  - not listed anymore (dropped off top holders), or
 *  - current_pct <= first_pct * 1%, or
 *  - current_balance <= first_balance * 1% (when both known)
 *
 * IMPORTANT: unknown first bag + off the top-holder list is NOT a sell.
 * (Creator often holds but sits outside top-N → was false “100% sold”.)
 *
 * sold_pct = % of *first bag* dumped (0–100).
 * sold_supply_pct = % of *mint supply* dumped (first − now).
 */
function computeSoldState(first, current) {
  const firstPct =
    first && first.pct_supply != null && Number.isFinite(Number(first.pct_supply))
      ? Number(first.pct_supply)
      : null;
  const firstBal =
    first && first.balance != null && Number.isFinite(Number(first.balance))
      ? Number(first.balance)
      : null;
  const cur = current || null;
  const listed = !!(cur && cur.listed);
  const curPct =
    cur && cur.pct_supply != null && Number.isFinite(Number(cur.pct_supply))
      ? Number(cur.pct_supply)
      : null;
  const curBal =
    cur && cur.balance != null && Number.isFinite(Number(cur.balance))
      ? Number(cur.balance)
      : null;

  const hasPositiveHold =
    listed &&
    ((curPct != null && curPct > 0) || (curBal != null && curBal > 0));

  // No measurable first bag → cannot claim they sold (common for creator
  // tracked with null pct, or wallets never seen in top holders).
  if (!hasRuggersFirstBag(first)) {
    return {
      sold: false,
      sold_pct: null,
      sold_supply_pct: null,
      remaining_pct: listed ? curPct : null,
      remaining_of_first: null,
      listed,
      has_positive_hold: hasPositiveHold,
      reason: "unknown_baseline",
      baseline_ok: false,
    };
  }

  const soldSupply = ruggersSoldSupplyPct(firstPct, listed ? curPct : 0, listed);

  if (!listed) {
    // Known first bag, dropped off list → fully sold that bag
    return {
      sold: true,
      sold_pct: 100,
      sold_supply_pct: soldSupply != null ? soldSupply : firstPct,
      remaining_pct: 0,
      remaining_of_first: 0,
      listed: false,
      has_positive_hold: false,
      reason: "not_listed",
      baseline_ok: true,
    };
  }

  let remainingOfFirst = null;
  if (firstPct != null && firstPct > 0 && curPct != null) {
    remainingOfFirst = curPct / firstPct;
  } else if (firstBal != null && firstBal > 0 && curBal != null) {
    remainingOfFirst = curBal / firstBal;
  } else if (firstPct != null && firstPct > 0 && curPct == null) {
    remainingOfFirst = 0;
  }

  if (remainingOfFirst == null) {
    return {
      sold: false,
      sold_pct: null,
      sold_supply_pct: soldSupply,
      remaining_pct: curPct,
      remaining_of_first: null,
      listed: true,
      has_positive_hold: hasPositiveHold,
      reason: "unknown",
      baseline_ok: true,
    };
  }

  const soldFrac = Math.max(0, Math.min(1, 1 - remainingOfFirst));
  const sold = remainingOfFirst <= RUGGERS_REMAIN_FRAC + 1e-12;
  return {
    sold,
    sold_pct: Math.round(soldFrac * 10000) / 100,
    sold_supply_pct: soldSupply,
    remaining_pct: curPct,
    remaining_of_first: remainingOfFirst,
    listed: true,
    has_positive_hold: hasPositiveHold,
    reason: sold ? (remainingOfFirst <= 0 ? "sold_100" : "sold_99") : "holding",
    baseline_ok: true,
  };
}

/**
 * Sold ≥99% of a reference bag (swing peak or any measured bag).
 * Used so swingers who dump the buy-back bag return to Similar/Single.
 */
function computeSoldVsBag(bagPct, bagBal, current) {
  const cur = current || null;
  const listed = !!(cur && cur.listed);
  const curPct =
    cur && cur.pct_supply != null && Number.isFinite(Number(cur.pct_supply))
      ? Number(cur.pct_supply)
      : null;
  const curBal =
    cur && cur.balance != null && Number.isFinite(Number(cur.balance))
      ? Number(cur.balance)
      : null;
  const bp =
    bagPct != null && Number.isFinite(Number(bagPct)) ? Number(bagPct) : null;
  const bb =
    bagBal != null && Number.isFinite(Number(bagBal)) ? Number(bagBal) : null;
  const hasBag = (bp != null && bp > 0) || (bb != null && bb > 0);
  if (!hasBag) {
    return { sold: false, remaining_of_bag: null, reason: "no_swing_bag" };
  }
  if (!listed) {
    return { sold: true, remaining_of_bag: 0, reason: "not_listed" };
  }
  let rem = null;
  if (bp != null && bp > 0 && curPct != null) rem = curPct / bp;
  else if (bb != null && bb > 0 && curBal != null) rem = curBal / bb;
  else if (bp != null && bp > 0 && curPct == null) rem = 0;
  if (rem == null) {
    return { sold: false, remaining_of_bag: null, reason: "unknown" };
  }
  const sold = rem <= RUGGERS_REMAIN_FRAC + 1e-12;
  return {
    sold,
    remaining_of_bag: rem,
    reason: sold ? (rem <= 0 ? "sold_100" : "sold_99") : "holding",
  };
}

/**
 * True when a prior ≥99% seller has bought back onto the mint.
 *
 * Cases:
 *  - Was off the list / zero bag, now listed with any positive hold
 *  - Still “sold” vs first bag (≤1% of first) but bag grew from a lower residual
 *  - Recovered above the 1% first-bag threshold (no longer soldState.sold)
 *
 * Used so Similar + Single (+ Creator/Flagged) leave Sellers → Swing.
 */
function isRuggersBuyBack(prev, soldState, cur) {
  const ever =
    !!(prev && (prev.ever_sold || prev.tag === "seller" || prev.tag === "swing"));
  if (!ever) return false;

  const listed = !!(soldState && soldState.listed) || !!(cur && cur.listed);
  const hasHold = !!(
    (soldState && soldState.has_positive_hold) ||
    (cur &&
      ((cur.pct_supply != null && Number(cur.pct_supply) > 0) ||
        (cur.balance != null && Number(cur.balance) > 0)))
  );
  if (!listed || !hasHold) return false;

  // Fully recovered vs first bag → always swing
  if (soldState && soldState.sold === false) return true;

  const prevListed = prev.listed === true;
  const prevPct =
    prev.current_pct != null && Number.isFinite(Number(prev.current_pct))
      ? Number(prev.current_pct)
      : null;
  const curPct =
    cur && cur.pct_supply != null && Number.isFinite(Number(cur.pct_supply))
      ? Number(cur.pct_supply)
      : soldState && soldState.remaining_pct != null
        ? Number(soldState.remaining_pct)
        : null;
  const prevBal =
    prev.current_balance != null && Number.isFinite(Number(prev.current_balance))
      ? Number(prev.current_balance)
      : null;
  const curBal =
    cur && cur.balance != null && Number.isFinite(Number(cur.balance))
      ? Number(cur.balance)
      : null;

  // Re-entered the holder list after being gone (classic buy-back)
  if (!prevListed && listed && hasHold) return true;

  // Bag grew from zero / dust residual while still under the 99% sold rule
  if (prevPct != null && curPct != null && curPct > prevPct + 1e-12) {
    if (prevPct <= 0) return true;
    // Meaningful re-accumulation (at least 2× residual or +0.05% supply)
    if (curPct >= prevPct * 2 || curPct - prevPct >= 0.05) return true;
  }
  if (prevBal != null && curBal != null && curBal > prevBal + 1e-12) {
    if (prevBal <= 0) return true;
    if (curBal >= prevBal * 2) return true;
  }

  // Previous tag was seller with zero bag, now positive
  if (
    (prev.tag === "seller" || prev.tag === "swing") &&
    (prevPct == null || prevPct <= 0) &&
    hasHold
  ) {
    return true;
  }

  return false;
}

/**
 * True if this wallet is the mint creator — only the known mint creator address.
 * Treated like Similar/Single for sell↔swing sticky loop.
 *
 * IMPORTANT: never treat multiple wallets as creator. Older builds wrongly
 * marked many Upload rows as section "creator"; only rec.creator counts.
 */
function isRuggersCreatorWallet(rec, w, first, prev) {
  if (!w) return false;
  const wl = String(w).toLowerCase();
  const known =
    rec && rec.creator ? String(rec.creator).trim().toLowerCase() : "";
  if (known) {
    // Authoritative: only the mint creator address
    return known === wl;
  }
  // Creator address not known yet — allow sticky flags only for this wallet
  // (still at most one identity once rec.creator is filled)
  if (prev && prev.is_creator) return true;
  if (first && (first.label === "creator" || first.origin_lane === "creator")) {
    return true;
  }
  if (prev && prev.origin_lane === "creator") return true;
  if (rec && rec.first_wallets && rec.first_wallets[w]) {
    const fw = rec.first_wallets[w];
    if (fw.label === "creator" || fw.origin_lane === "creator" || fw.is_creator) {
      return true;
    }
  }
  return false;
}

/**
 * Pick primary origin lane from baseline flags (first-lookup).
 * Priority: creator → similar → multi → funding → insider → launch → suspect → single
 */
function primaryLaneFromBaselineFlags(first, uploadedSimilar) {
  if (!first || typeof first !== "object") {
    return uploadedSimilar ? "suspect" : null;
  }
  if (first.label === "creator" || first.is_creator || first.origin_lane === "creator") {
    return "creator";
  }
  if (first.in_multi) return "multi";
  // Suspect = similar-size + Rugcheck insider (not multi-account)
  if (uploadedSimilar || first.in_similar || first.in_insider || first.in_suspect)
    return "suspect";
  if (first.in_multi_send) return "multi_send";
  if (first.in_funding) return "funding";
  if (first.in_fresh) return "fresh";
  if (isRuggersSingleEligible(first, null)) return "single";
  return null;
}

/**
 * Freeze lane at first discovery on THIS mint.
 * Lanes: creator | similar | multi | multi_send | funding | insider | launch |
 *        fresh | suspect | single
 * Each keeps its label on Swing; sell ≥99% again → back to same lane (like Flagged).
 */
function resolveRuggersOriginLane(rec, w, first, prev, cur, uploadedSimilar) {
  // Creator never loses its lane / label
  if (isRuggersCreatorWallet(rec, w, first, prev)) {
    return "creator";
  }
  // Frozen sticky lanes (do not reclassify after first discovery)
  const frozen =
    (first && first.origin_lane) || (prev && prev.origin_lane) || "";
  if (frozen && RUGGERS_STICKY_LANES.has(frozen)) {
    // Launch-window removed — remap sticky launch → single
    if (frozen === "launch") return "single";
    // similar / old insider-as-suspect → Suspect; multi stays multi
    if (frozen === "similar" || frozen === "insider") return "suspect";
    if (frozen === "multi") return "multi";
    if (
      frozen !== "suspect" &&
      frozen !== "multi" &&
      frozen !== "creator" &&
      (uploadedSimilar ||
        (first && first.in_similar) ||
        (prev && prev.in_similar))
    ) {
      return "suspect";
    }
    return frozen;
  }
  if (frozen === "excluded" || !frozen) {
    const primary = primaryLaneFromBaselineFlags(first, uploadedSimilar);
    if (primary) return primary;
  }
  if (uploadedSimilar || (first && first.in_similar) || (cur && cur.in_similar)) {
    return "suspect";
  }
  if ((first && first.in_multi) || (cur && cur.in_multi)) return "multi";

  const primary = primaryLaneFromBaselineFlags(first, false);
  if (primary) return primary;
  // Measurable bag with no special category → Single (sellers must have a lane)
  if (hasRuggersFirstBag(first)) return "single";
  return "excluded";
}

/** First bag ≥ RUGGERS_SINGLE_MIN_PCT (0.01%) for Single lane. */
function isRuggersSingleEligible(first, cur) {
  const pct =
    first && first.pct_supply != null && Number.isFinite(Number(first.pct_supply))
      ? Number(first.pct_supply)
      : null;
  // Do not fall back to current % — Single eligibility is first-lookup bag only
  return pct != null && pct >= RUGGERS_SINGLE_MIN_PCT;
}

function isRuggersStickyOriginLane(lane) {
  return !!(lane && RUGGERS_STICKY_LANES.has(lane));
}

/**
 * Enroll a wallet into the Ruggers baseline the first time we see them holding.
 * Used on first Analyze for everyone, and on later Analyzes for NEW holders
 * (and RugWatch-flagged wallets that appear as holders later).
 */
function enrollRuggersBaselineWallet(rec, w, info, now) {
  if (!rec || !w || !info) return false;
  if (!rec.first_wallets || typeof rec.first_wallets !== "object") {
    rec.first_wallets = {};
  }
  if (rec.first_wallets[w]) return false; // already baseline
  const pct =
    info.pct_supply != null && Number.isFinite(Number(info.pct_supply))
      ? Number(info.pct_supply)
      : null;
  const bal =
    info.balance != null && Number.isFinite(Number(info.balance))
      ? Number(info.balance)
      : null;
  // Skip empty / dust rows with no measurable bag (except explicit creator)
  const isCreatorLabel =
    info.label === "creator" ||
    !!(rec.creator && String(rec.creator).toLowerCase() === String(w).toLowerCase());
  if (!isCreatorLabel && (pct == null || pct <= 0) && (bal == null || bal <= 0)) {
    return false;
  }
  rec.first_wallets[w] = {
    pct_supply: pct,
    balance: bal,
    rank: info.rank != null ? info.rank : null,
    label: isCreatorLabel ? "creator" : info.label || null,
    in_similar: !!info.in_similar,
    in_multi: !!info.in_multi,
    in_multi_send: !!info.in_multi_send,
    in_insider: !!info.in_insider,
    in_suspect: !!info.in_suspect,
    in_funding: !!info.in_funding,
    in_launch: !!info.in_launch,
    in_fresh: !!info.in_fresh,
    exclude_from_single: !!info.exclude_from_single,
    first_seen_at: now,
    enrolled_after_baseline: true,
  };
  if (isCreatorLabel) {
    rec.first_wallets[w].origin_lane = "creator";
    rec.first_wallets[w].is_creator = true;
    rec.first_wallets[w].label = "creator";
  }
  return true;
}

/**
 * Update (or seed) tracking for one mint from a successful full Analyze.
 * First lookup freezes baseline; later lookups recompute sellers / swings
 * and enroll NEW holders seen for the first time.
 *
 * Loop (per mint, concurrent re-Analyze):
 *  similar/single/creator sellers  ↔  Swing  (origin_lane frozen at first discovery)
 *  Flagged sellers                 ↔  Swing (still purple “flagged” on Swing)
 *  New holders on later Analyzes: added to baseline; sell → similar/single
 *    or Flagged if on RugWatch
 * Flagged for mint B never rewrites lanes on mint A (per-mint store).
 */
/**
 * Create (or return) an empty Ruggers track for a mint so the panel can open
 * on the correct CA even when holders/ruggers_track was empty/thin.
 */
function ensureRuggersMintTrack(address, meta) {
  const mintBare = bareMintAddr(address);
  // Solana mints are typically 32–44 base58 chars (pump mints often 44)
  if (!mintBare || mintBare.length < 30) {
    console.warn("[ruggers] ensure: address too short", mintBare);
    return null;
  }
  const chain = (meta && meta.chain) || "solana";
  const storeKey = mintKeyFromToken(mintBare, chain);
  let store = {};
  try {
    store = loadRuggersStore() || {};
  } catch (_) {
    store = {};
  }
  const found = findRuggersRecForMint(store, mintBare, chain);
  if (found.rec && typeof found.rec === "object") {
    // Keep existing track; ensure address/key normalized
    const rec0 = found.rec;
    rec0.address = mintBare;
    rec0.mint_key = storeKey;
    if (!rec0.first_wallets || typeof rec0.first_wallets !== "object") {
      rec0.first_wallets = {};
    }
    if (meta && meta.symbol) rec0.symbol = meta.symbol;
    if (meta && meta.name) rec0.name = meta.name;
    store[storeKey] = rec0;
    // Drop bare dual-key (doubled JSON past localStorage quota)
    if (found.key && found.key !== storeKey) {
      try {
        delete store[found.key];
      } catch (_) {}
    }
    try {
      if (store[mintBare] && store[mintBare] !== rec0) delete store[mintBare];
      else if (store[mintBare] === rec0) delete store[mintBare];
    } catch (_) {}
    try {
      saveRuggersStore(store);
    } catch (e) {
      console.warn("[ruggers] ensure save failed", e);
    }
    rememberRuggersRec(storeKey, rec0, mintBare);
    return { key: storeKey, rec: rec0 };
  }
  const now = new Date().toISOString();
  const rec = {
    address: mintBare,
    chain: chain,
    symbol: (meta && meta.symbol) || null,
    name: (meta && meta.name) || null,
    creator: null,
    first_ts: now,
    last_ts: now,
    lookup_count: 1,
    first_wallets: {},
    first_similar_groups: [],
    status: {},
    rugwatch_known: {},
    flagged_sellers: {},
    uploaded_similar: {},
    ruggers_uploaded: {},
    sticky_lane_sellers: {},
    rules_version: RUGGERS_RULES_VERSION,
    mint_key: storeKey,
    seeded_empty: true,
  };
  store[storeKey] = rec;
  try {
    if (store[mintBare]) delete store[mintBare];
  } catch (_) {}
  try {
    saveRuggersStore(store);
  } catch (e) {
    console.warn("[ruggers] ensure save failed", e);
    // Still return in-memory so this page session can show the panel
  }
  rememberRuggersRec(storeKey, rec, mintBare);
  return { key: storeKey, rec };
}

function processRuggersFromAnalyze(data) {
  const snap = extractRuggersSnapshot(data);
  if (!snap || !snap.address) return null;
  const mintBare = bareMintAddr(snap.address);
  if (!mintBare) return null;
  const key = mintKeyFromToken(mintBare, snap.chain || "solana");
  if (!key || key === "__meta") return null;

  const store = loadRuggersStore();
  // Strict: only load a track whose rec.address is THIS mint
  let found = findRuggersRecForMint(store, mintBare, snap.chain || "solana");
  let rec = found.rec;
  // Refuse any rec that doesn't match this mint CA (cross-mint isolation)
  if (rec && !sameMintAddr(rec.address || found.key, mintBare)) {
    console.warn(
      "[ruggers] refused foreign mint track",
      found.key,
      rec.address,
      "want",
      mintBare
    );
    rec = null;
  }
  if (rec && (rec === store.__meta || (!rec.first_wallets && rec.rules_version && !rec.address))) {
    rec = null;
  }
  // Prefer canonical key going forward (migrate bare → solana:addr)
  const storeKey = key;
  if (rec && found.key && found.key !== storeKey) {
    try {
      delete store[found.key];
    } catch (_) {}
  }

  const now = snap.ts || new Date().toISOString();
  const measurableFirst = rec
    ? countMeasurableRuggersBags(rec.first_wallets)
    : 0;
  const snapMeasurable = snapHasMeasurableRuggersBags(snap.wallets);
  // First freeze, or thin seed (wallets enrolled with null bags) when snap now
  // has real holds — without bags, sells can never be proven.
  const isFirstLookup =
    !rec ||
    !rec.first_wallets ||
    !Object.keys(rec.first_wallets).length ||
    (measurableFirst === 0 &&
      snapMeasurable &&
      !(
        rec.sticky_lane_sellers &&
        Object.keys(rec.sticky_lane_sellers).length
      ) &&
      !(
        rec.status &&
        Object.values(rec.status).some(
          (s) => s && (s.tag === "seller" || s.ever_sold || s.tag === "swing")
        )
      ));

  if (isFirstLookup) {
    // First lookup baseline — empty sellers until later sells on THIS mint only.
    // Never copy status/sticky/upload from any other mint.
    rec = {
      address: mintBare,
      chain: snap.chain || "solana",
      symbol: snap.symbol,
      name: snap.name,
      creator: snap.creator || null,
      first_ts: now,
      last_ts: now,
      lookup_count: 1,
      first_wallets: {},
      first_similar_groups: snap.similar_groups || [],
      status: {},
      // RugWatch hits seen while on this mint (not the Flagged section by itself)
      rugwatch_known: {},
      // Sold ≥99% while flagged — sticky Flagged section until buy-back swing
      flagged_sellers: {},
      // Similar section Upload on this mint — stay under Similar (not Flagged here)
      uploaded_similar: {},
      // Wallets successfully Uploaded via Ruggers Upload button on THIS mint only
      ruggers_uploaded: {},
      // Similar/Single/Creator sellers who never buy back — stay forever until swing
      sticky_lane_sellers: {},
      rules_version: RUGGERS_RULES_VERSION,
      mint_key: storeKey,
    };
    // Cap freeze: category wallets + ≥0.01% holders (not all ~2000 DAS dust)
    const freezeMap = selectRuggersTrackWallets(snap.wallets || {}, [
      snap.creator,
      ...Object.keys(snap.flagged_known || {}),
    ]);
    for (const [w, info] of Object.entries(freezeMap)) {
      rec.first_wallets[w] = {
        pct_supply: info.pct_supply,
        balance: info.balance,
        rank: info.rank,
        label: info.label,
        in_similar: !!info.in_similar,
        in_multi: !!info.in_multi,
        in_multi_send: !!info.in_multi_send,
        in_insider: !!info.in_insider,
        in_suspect: !!info.in_suspect,
        in_funding: !!info.in_funding,
        in_launch: !!info.in_launch,
        in_fresh: !!info.in_fresh,
        exclude_from_single: !!info.exclude_from_single,
        first_seen_at: now,
      };
    }
    if (snap.creator && !rec.first_wallets[snap.creator]) {
      rec.first_wallets[snap.creator] = {
        pct_supply: null,
        balance: null,
        rank: null,
        label: "creator",
        in_similar: false,
        exclude_from_single: true,
      };
    }
  } else {
    rec.last_ts = now;
    rec.lookup_count = (rec.lookup_count || 1) + 1;
    if (snap.symbol) rec.symbol = snap.symbol;
    if (snap.name) rec.name = snap.name;
    if (snap.creator) rec.creator = snap.creator;
    if (!rec.rugwatch_known || typeof rec.rugwatch_known !== "object") {
      rec.rugwatch_known = {};
    }
    if (!rec.flagged_sellers || typeof rec.flagged_sellers !== "object") {
      rec.flagged_sellers = {};
    }
    if (!rec.uploaded_similar || typeof rec.uploaded_similar !== "object") {
      rec.uploaded_similar = {};
    }
    if (!rec.ruggers_uploaded || typeof rec.ruggers_uploaded !== "object") {
      rec.ruggers_uploaded = {};
    }
    // Sticky Similar/Single sellers who never returned (indefinite until buy-back)
    if (!rec.sticky_lane_sellers || typeof rec.sticky_lane_sellers !== "object") {
      rec.sticky_lane_sellers = {};
    }
    // Similar-Upload pins → re-stamp as button marks for this mint only
    for (const w of Object.keys(rec.uploaded_similar || {})) {
      markRuggersWalletUploaded(rec, w, "similar");
    }
    // Hard purge: cloud / other-mint / sold-while-flagged never count as Upload
    purgeFalseRuggersUploadMarks(rec);
    // Repair: ruggers_uploaded.section "creator" for non-creator addresses
    if (rec.ruggers_uploaded && typeof rec.ruggers_uploaded === "object") {
      const cKnown = rec.creator ? String(rec.creator).toLowerCase() : "";
      for (const [w, meta] of Object.entries(rec.ruggers_uploaded)) {
        if (!meta || String(meta.section || "") !== "creator") continue;
        if (cKnown && String(w).toLowerCase() === cKnown) continue;
        meta.section = "single";
        meta.repaired_from_false_creator = true;
      }
    }
    // Repair: older builds moved Similar-Uploads into Flagged — pin permanently
    if (rec.flagged_sellers && typeof rec.flagged_sellers === "object") {
      for (const [w, meta] of Object.entries(rec.flagged_sellers)) {
        if (!w || !meta || String(meta.origin) !== "uploaded") continue;
        const firstSim = !!(
          rec.first_wallets &&
          rec.first_wallets[w] &&
          rec.first_wallets[w].in_similar
        );
        const stSim = !!(rec.status && rec.status[w] && rec.status[w].in_similar);
        if (!firstSim && !stSim) continue;
        pinUploadedSimilarOnMint(rec, w, {
          uploaded_at: meta.entered_at || now,
          sold_pct: meta.sold_pct,
          first_pct: meta.first_pct,
          repaired_from_flagged: true,
          source: "repair",
        });
      }
    }
  }

  // Current listed map (+ bundle-category tags for Single exclusion)
  const current = {};
  for (const [w, info] of Object.entries(snap.wallets || {})) {
    current[w] = {
      listed: true,
      pct_supply: info.pct_supply,
      balance: info.balance,
      in_similar: !!info.in_similar,
      in_multi: !!info.in_multi,
      in_multi_send: !!info.in_multi_send,
      in_insider: !!info.in_insider,
      in_suspect: !!info.in_suspect,
      in_funding: !!info.in_funding,
      in_launch: !!info.in_launch,
      in_fresh: !!info.in_fresh,
      exclude_from_single: !!info.exclude_from_single,
    };
    // Sticky-promote category tags on first_wallets (identity kept).
    // Do NOT clear them later — that was hiding Single / mis-routing lanes.
    if (rec.first_wallets && rec.first_wallets[w]) {
      const fw = rec.first_wallets[w];
      if (info.in_similar) fw.in_similar = true;
      if (info.in_multi) fw.in_multi = true;
      if (info.in_multi_send) fw.in_multi_send = true;
      if (info.in_funding) fw.in_funding = true;
      if (info.in_insider) fw.in_insider = true;
      if (info.in_launch) fw.in_launch = true;
      if (info.in_fresh) fw.in_fresh = true;
      if (info.in_suspect) fw.in_suspect = true;
      if (
        info.in_similar ||
        info.in_multi ||
        info.in_multi_send ||
        info.in_funding ||
        info.in_insider ||
        info.in_launch ||
        info.in_fresh ||
        info.in_suspect
      ) {
        fw.exclude_from_single = true;
      }
    }
  }

  // Learn similar-group membership from this snap + freeze it on first_wallets.
  // Bug fix: after a sell, wallet drops off the holder list → current snapshot
  // no longer marks in_similar, so Similar count shrank every re-Analyze.
  // Once similar (first, previous status, or any later snap), stay similar.
  // Same sticky idea for Shared SOL (funding) tags when later snaps drop them.
  if (!rec.first_wallets || typeof rec.first_wallets !== "object") {
    rec.first_wallets = {};
  }
  for (const [w, info] of Object.entries(snap.wallets || {})) {
    if (!info) continue;
    if (info.in_similar && rec.first_wallets[w]) {
      rec.first_wallets[w].in_similar = true;
    }
    if (info.in_funding && rec.first_wallets[w]) {
      rec.first_wallets[w].in_funding = true;
      rec.first_wallets[w].exclude_from_single = true;
    }
  }
  // Also from similar_groups members on this snap
  for (const g of snap.similar_groups || []) {
    for (const w of g.wallets || []) {
      if (!w) continue;
      if (rec.first_wallets[w]) rec.first_wallets[w].in_similar = true;
      // New similar member not yet baseline — enroll as holder on this Analyze
      else if (current[w] || (snap.wallets && snap.wallets[w])) {
        const info = (snap.wallets && snap.wallets[w]) || {
          in_similar: true,
          pct_supply: null,
          balance: null,
        };
        info.in_similar = true;
        enrollRuggersBaselineWallet(rec, w, info, now);
      }
    }
  }

  // ── Subsequent Analyzes: enroll NEW holders + upgrade null first bags ─
  // First sight freezes their bag. If they sell later → Similar / Single / …
  // or Flagged if on RugWatch. Flagged wallets that show up as holders are
  // enrolled the same way so a later dump lands in Flagged.
  if (!isFirstLookup) {
    const nExisting = Object.keys(rec.first_wallets || {}).length;
    const room = Math.max(0, RUGGERS_MAX_TRACK_WALLETS - nExisting);
    // Cap new enrolls; always upgrade bags on already-tracked wallets
    const enrollCandidates = selectRuggersTrackWallets(snap.wallets || {}, [
      snap.creator,
      ...Object.keys(snap.flagged_known || {}),
      ...Object.keys(rec.sticky_lane_sellers || {}),
      ...Object.keys(rec.flagged_sellers || {}),
    ]);
    let enrolledNew = 0;
    for (const [w, info] of Object.entries(snap.wallets || {})) {
      if (!w || !info) continue;
      if (rec.first_wallets[w]) {
        // Was enrolled with null bag (e.g. multi-send inject) — fill bag while
        // they still hold so a later dump can register as sold.
        upgradeRuggersFirstBag(rec.first_wallets[w], info);
        continue;
      }
      if (!enrollCandidates[w] && !shouldTrackRuggersWallet(info)) continue;
      if (enrolledNew >= room && room >= 0) continue;
      if (enrollRuggersBaselineWallet(rec, w, info, now)) enrolledNew++;
    }
    // RugWatch-known addresses currently holding but missing from snap.wallets
    // (edge: server tagged them but holder row thin) — still enroll if current
    for (const [fw, meta] of Object.entries(snap.flagged_known || {})) {
      if (!fw || rec.first_wallets[fw]) continue;
      if (!current[fw] && !(snap.wallets && snap.wallets[fw])) continue;
      const info = (snap.wallets && snap.wallets[fw]) || current[fw] || {};
      enrollRuggersBaselineWallet(
        rec,
        fw,
        {
          pct_supply: info.pct_supply,
          balance: info.balance,
          rank: info.rank,
          label: info.label || null,
          in_similar: !!info.in_similar,
          in_multi: !!info.in_multi,
          in_multi_send: !!info.in_multi_send,
          in_insider: !!info.in_insider,
          in_suspect: !!info.in_suspect,
          in_funding: !!info.in_funding,
          in_launch: !!info.in_launch,
          in_fresh: !!info.in_fresh,
          exclude_from_single: !!info.exclude_from_single,
        },
        now
      );
      if (rec.first_wallets[fw]) {
        rec.first_wallets[fw].from_rugwatch_holder = true;
      }
    }
  }

  // Merge RugWatch knowledge for wallets that touch this mint only
  // (server already filters; never treat as Flagged section until ≥99% sell)
  const rwKnown =
    rec.rugwatch_known && typeof rec.rugwatch_known === "object"
      ? rec.rugwatch_known
      : {};
  const thisMintLc = String(rec.address || "").trim().toLowerCase();
  for (const [fw, meta] of Object.entries(snap.flagged_known || {})) {
    if (!fw) continue;
    // Remember if on this mint track (baseline / currently listed / flagged seller)
    // New holders enrolled above are already in first_wallets
    const onTrack =
      !!(rec.first_wallets && rec.first_wallets[fw]) ||
      !!current[fw] ||
      !!(rec.flagged_sellers && rec.flagged_sellers[fw]);
    if (!onTrack) continue;
    const merged = {
      ...(rwKnown[fw] || {}),
      ...(meta || {}),
      last_seen: now,
    };
    // Cloud "uploaded" is not a this-mint Upload unless flagged_from_mint matches
    if (String(merged.origin || "") === "uploaded") {
      const from = String(
        merged.flagged_from_mint ||
          (Array.isArray(merged.flagged_from_mints) &&
            merged.flagged_from_mints[0]) ||
          ""
      )
        .trim()
        .toLowerCase();
      if (!thisMintLc || from !== thisMintLc) {
        if (!(rec.ruggers_uploaded && rec.ruggers_uploaded[fw])) {
          merged.origin = "rugwatch";
          delete merged.uploaded_section;
        }
      }
    }
    rwKnown[fw] = merged;
  }
  rec.rugwatch_known = rwKnown;

  // Recompute status for every first-lookup wallet on THIS mint only
  const status = rec.status && typeof rec.status === "object" ? rec.status : {};
  const flaggedSellers =
    rec.flagged_sellers && typeof rec.flagged_sellers === "object"
      ? { ...rec.flagged_sellers }
      : {};
  // Sticky sellers: drop only rows stamped for a *different* mint
  const stickyLane = {};
  {
    const rawSticky =
      rec.sticky_lane_sellers && typeof rec.sticky_lane_sellers === "object"
        ? rec.sticky_lane_sellers
        : {};
    const want = mintBare.toLowerCase();
    for (const [w, meta] of Object.entries(rawSticky)) {
      if (!w || !meta) continue;
      const src = bareMintAddr(meta.source_mint || "").toLowerCase();
      if (src && src !== want) continue; // foreign mint only
      stickyLane[w] = { ...meta, source_mint: mintBare };
    }
  }
  // Drop foreign flagged_sellers only when stamped for another mint
  for (const w of Object.keys(flaggedSellers)) {
    const meta = flaggedSellers[w];
    const src = bareMintAddr((meta && meta.source_mint) || "").toLowerCase();
    if (src && src !== mintBare.toLowerCase()) {
      delete flaggedSellers[w];
      continue;
    }
    if (meta && typeof meta === "object") meta.source_mint = mintBare;
  }
  const unflagNow = [];

  for (const [w, first] of Object.entries(rec.first_wallets || {})) {
    const cur = current[w] || { listed: false, pct_supply: 0, balance: 0 };
    if (!current[w]) {
      cur.listed = false;
      cur.pct_supply = 0;
      cur.balance = 0;
    }

    // Fill first bag on first *observed* hold (creator / inject with null bag).
    // Without a measurable first bag, sold detection is always false.
    if (rec.first_wallets[w] && cur.listed) {
      const fw = rec.first_wallets[w];
      if (upgradeRuggersFirstBag(fw, cur)) {
        first.pct_supply = fw.pct_supply;
        first.balance = fw.balance;
      }
    }

    const soldState = computeSoldState(first, cur);
    const prev = status[w] || {};
    let tag = "holding";
    let everSold = !!prev.ever_sold;
    const buyBack = isRuggersBuyBack(prev, soldState, cur);
    const prevTag = String(prev.tag || "holding");
    const baselineOk = hasRuggersFirstBag(first);

    // Drop false sticky sellers that never had a measurable first bag
    // (classic creator false-positive: null first → off list → "100% sold").
    if (!baselineOk && stickyLane[w]) {
      delete stickyLane[w];
    }
    if (!baselineOk && (prev.ever_sold || prevTag === "seller") && !soldState.sold) {
      everSold = false;
    }

    // ── Phase loop (per concurrent lookup) ────────────────────────────
    // All sticky origin lanes (creator/similar/multi/funding/insider/launch/suspect/single):
    //   sell ≥99% of first bag → seller (sticky until buy-back)
    //   buy-back → Swing (keep origin label)
    //   sell ≥99% of *swing bag* again → back to same origin lane
    //   buy-back again → Swing … (loop)
    const wasStickySeller = !!(stickyLane[w] && baselineOk);
    const wasSwing = prevTag === "swing";
    // Peak bag while on Swing (for measuring re-dump of the buy-back hold)
    let swingBagPct =
      prev.swing_bag_pct != null && Number.isFinite(Number(prev.swing_bag_pct))
        ? Number(prev.swing_bag_pct)
        : null;
    let swingBagBal =
      prev.swing_bag_balance != null &&
      Number.isFinite(Number(prev.swing_bag_balance))
        ? Number(prev.swing_bag_balance)
        : null;
    if (
      wasSwing &&
      cur.listed &&
      cur.pct_supply != null &&
      Number(cur.pct_supply) > 0
    ) {
      const cp = Number(cur.pct_supply);
      swingBagPct = swingBagPct == null ? cp : Math.max(swingBagPct, cp);
    }
    if (
      wasSwing &&
      cur.listed &&
      cur.balance != null &&
      Number(cur.balance) > 0
    ) {
      const cb = Number(cur.balance);
      swingBagBal = swingBagBal == null ? cb : Math.max(swingBagBal, cb);
    }
    const swingDump = wasSwing
      ? computeSoldVsBag(swingBagPct, swingBagBal, cur)
      : { sold: false };

    if (!baselineOk) {
      // Cannot prove a dump without a first bag
      tag = "holding";
      everSold = false;
    } else if (wasSwing) {
      // Already on Swing: stay while holding; leave only on ≥99% dump of swing bag
      // (or full first-bag dump / off-list with known first bag)
      everSold = true;
      if (swingDump.sold || soldState.sold) {
        tag = "seller"; // back to Similar / Single / Creator / Flagged
        swingBagPct = null;
        swingBagBal = null;
      } else if (
        cur.listed &&
        ((cur.pct_supply != null && Number(cur.pct_supply) > 0) ||
          (cur.balance != null && Number(cur.balance) > 0))
      ) {
        tag = "swing"; // still holds → stay on Swing
      } else {
        // No measurable hold and not proven sold → stay swing if prior swing
        // until we see a clear dump (avoids flicker); off-list with swing bag = sold above
        tag = swingBagPct != null || swingBagBal != null ? "seller" : "swing";
      }
    } else if (buyBack) {
      everSold = true;
      tag = "swing";
      // New swing bag = what they hold now after buy-back
      if (cur.listed && cur.pct_supply != null && Number(cur.pct_supply) > 0) {
        swingBagPct = Number(cur.pct_supply);
      }
      if (cur.listed && cur.balance != null && Number(cur.balance) > 0) {
        swingBagBal = Number(cur.balance);
      }
    } else if (soldState.sold || wasStickySeller || prevTag === "seller") {
      everSold = true;
      tag = "seller";
      swingBagPct = null;
      swingBagBal = null;
    } else {
      tag = "holding";
    }

    // Sticky similar membership (never clear just because they left the list)
    // + wallets Uploaded from Similar on this mint stay similar here forever
    const uploadedSimilar = isUploadedSimilarOnThisMint(rec, w);
    if (uploadedSimilar) {
      pinUploadedSimilarOnMint(rec, w, {
        sold_pct: soldState.sold_pct,
        first_pct: first.pct_supply,
      });
    }
    const inSimilar = !!(
      first.in_similar ||
      prev.in_similar ||
      (cur && cur.in_similar) ||
      uploadedSimilar
    );
    if (inSimilar && first && !first.in_similar) {
      first.in_similar = true;
      if (rec.first_wallets[w]) rec.first_wallets[w].in_similar = true;
    }

    // Freeze origin lane on THIS mint (similar / single / creator)
    // Creator uses the same sticky sell↔swing rules as Similar/Single.
    const isCreator = isRuggersCreatorWallet(rec, w, first, prev);
    let originLane = resolveRuggersOriginLane(
      rec,
      w,
      first,
      prev,
      cur,
      uploadedSimilar
    );
    if (isCreator) originLane = "creator";
    if (rec.first_wallets[w]) {
      // Freeze origin_lane once (creator always wins)
      if (isCreator) {
        rec.first_wallets[w].origin_lane = "creator";
        rec.first_wallets[w].label = "creator";
        rec.first_wallets[w].is_creator = true;
      } else if (
        !rec.first_wallets[w].origin_lane ||
        rec.first_wallets[w].origin_lane === "excluded"
      ) {
        // Assign or re-map legacy excluded → real lane
        rec.first_wallets[w].origin_lane = originLane;
      } else {
        // Keep frozen lane; allow promote to similar only
        const fl = rec.first_wallets[w].origin_lane;
        if (fl !== "similar" && fl !== "creator" && originLane === "similar") {
          rec.first_wallets[w].origin_lane = "similar";
          originLane = "similar";
        } else {
          originLane = fl;
        }
      }
    }
    if (inSimilar && originLane === "similar" && rec.first_wallets[w] && !isCreator) {
      rec.first_wallets[w].in_similar = true;
      rec.first_wallets[w].origin_lane = "similar";
    }

    // Similar lineage on THIS mint (upload pin, frozen lane, or baseline tag).
    const similarLineageOnMint = !!(
      uploadedSimilar ||
      originLane === "similar" ||
      inSimilar ||
      (first && first.in_similar) ||
      (prev && (prev.in_similar || prev.origin_lane === "similar" || prev.permanent_similar || prev.uploaded_similar)) ||
      (rec.first_wallets &&
        rec.first_wallets[w] &&
        (rec.first_wallets[w].in_similar ||
          rec.first_wallets[w].origin_lane === "similar"))
    );

    // Uploaded from any Ruggers section on THIS mint (Single, multi, Creator, …).
    // Stay in that origin section ↔ Swing — never Ruggers Flagged on this mint.
    // Must be a real this-mint Upload — not cloud-known from another mint
    // (old bug: false "uploaded" kept RugWatch wallets in Single + Upload (0)).
    const uploadedOnThisMint = isRuggersAlreadyUploaded(rec, w);
    let uploadedSection = null;
    if (uploadedOnThisMint) {
      uploadedSection =
        (rec.ruggers_uploaded &&
          rec.ruggers_uploaded[w] &&
          rec.ruggers_uploaded[w].section) ||
        (rec.uploaded_similar && rec.uploaded_similar[w] ? "similar" : null) ||
        null;
      // Case-insensitive lookup for ruggers_uploaded section
      if (
        !uploadedSection &&
        rec.ruggers_uploaded &&
        typeof rec.ruggers_uploaded === "object"
      ) {
        const wl = String(w).toLowerCase();
        for (const [k, meta] of Object.entries(rec.ruggers_uploaded)) {
          if (String(k).toLowerCase() === wl && meta && meta.section) {
            uploadedSection = String(meta.section);
            break;
          }
        }
      }
    } else if (prev && (prev.ruggers_uploaded || prev.ruggers_uploaded_section)) {
      // Clear poisoned status flags from older builds (do not re-stick)
      // so RugWatch-known sellers go to Flagged, not Single with Upload (0).
    }
    // Never force non-creator wallets into Creator via a bad upload section tag
    if (
      uploadedSection === "creator" &&
      !isCreator &&
      rec.creator &&
      String(w).toLowerCase() !== String(rec.creator).toLowerCase()
    ) {
      uploadedSection = "single";
      if (rec.ruggers_uploaded && rec.ruggers_uploaded[w]) {
        rec.ruggers_uploaded[w].section = "single";
      }
    }

    const wasFlaggedSeller = !!flaggedSellers[w];
    const onRugWatchEarly =
      wasFlaggedSeller ||
      !!rwKnown[w] ||
      isRuggersRugwatchKnown(rec, w) ||
      !!(snap.flagged_known && snap.flagged_known[w]);

    // Similar sticky only when NOT on RugWatch (or permanent Similar-Upload).
    // On RugWatch + sell → Flagged (unless this-mint Upload / creator).
    if (similarLineageOnMint && (!onRugWatchEarly || uploadedSimilar)) {
      originLane = "similar";
      if (rec.first_wallets[w]) {
        rec.first_wallets[w].in_similar = true;
        rec.first_wallets[w].origin_lane = "similar";
      }
      if (!onRugWatchEarly && flaggedSellers[w]) delete flaggedSellers[w];
    }

    if (
      uploadedOnThisMint &&
      uploadedSection &&
      RUGGERS_STICKY_LANES.has(String(uploadedSection)) &&
      !(similarLineageOnMint && (!onRugWatchEarly || uploadedSimilar)) &&
      !isCreator
    ) {
      originLane = String(uploadedSection);
      if (rec.first_wallets[w]) {
        rec.first_wallets[w].origin_lane = originLane;
        if (originLane !== "creator") {
          rec.first_wallets[w].is_creator = false;
          if (rec.first_wallets[w].label === "creator") {
            rec.first_wallets[w].label = null;
          }
        }
      }
    }
    // Only the real mint creator keeps creator origin / is_creator
    if (!isCreator && (originLane === "creator" || (first && first.is_creator))) {
      originLane =
        similarLineageOnMint && !onRugWatchEarly
          ? "similar"
          : uploadedSection &&
              RUGGERS_STICKY_LANES.has(String(uploadedSection)) &&
              uploadedSection !== "creator"
            ? String(uploadedSection)
            : first && first.in_multi
              ? "multi"
              : isRuggersSingleEligible(first, cur)
                ? "single"
                : "single";
      if (rec.first_wallets[w]) {
        rec.first_wallets[w].origin_lane = originLane;
        rec.first_wallets[w].is_creator = false;
        if (rec.first_wallets[w].label === "creator") {
          rec.first_wallets[w].label = null;
        }
      }
    }
    if (uploadedOnThisMint && flaggedSellers[w]) {
      delete flaggedSellers[w];
    }

    // Once flagged on THIS mint, never drop the label (buy-back / swing / re-sell)
    // This-mint Upload / permanent Similar-Upload never use Flagged identity here.
    const everFlaggedOnMint = !!(
      !uploadedOnThisMint &&
      !uploadedSimilar &&
      (prev.ever_flagged_on_mint ||
        wasFlaggedSeller ||
        (flaggedSellers[w] &&
          (flaggedSellers[w].ever_flagged || flaggedSellers[w].phase)) ||
        (prev.flagged_meta &&
          (prev.flagged_meta.ever_flagged || prev.flagged_meta.phase)) ||
        (prev.is_flagged && prev.ever_sold))
    );
    const onRugWatch = onRugWatchEarly || everFlaggedOnMint;

    // Flagged when sold ≥99% while on RugWatch (new holders included once enrolled).
    // Priority over Similar/Single unless Creator / permanent Similar-Upload / this-mint Upload.
    const soldWhileFlaggedPath =
      tag === "seller" &&
      !uploadedSimilar &&
      !uploadedOnThisMint &&
      originLane !== "creator" &&
      !isCreator &&
      (onRugWatch || everFlaggedOnMint);

    if (soldWhileFlaggedPath) {
      const prior = flaggedSellers[w] || prev.flagged_meta || {};
      // Only the first mint they were flagged on — never append later mints.
      // Do NOT pass rec.address as fallback here before we know if they had a prior mint.
      const sealed = withSingleFlaggedFromMint(
        { ...(rwKnown[w] || {}), ...prior },
        prior,
        rwKnown[w],
        prev,
        { symbol: rec.symbol, flagged_from_symbol: rec.symbol }
      );
      // First time ever flagged: attribute to THIS mint + ticker for display
      if (!sealed.flagged_from_mint && rec.address) {
        sealed.flagged_from_mint = rec.address;
        sealed.flagged_from_mints = [rec.address];
        const sym = normalizeFlaggedTicker(rec.symbol);
        if (sym) sealed.flagged_from_symbol = sym;
      } else if (
        sealed.flagged_from_mint &&
        !sealed.flagged_from_symbol &&
        rec.address &&
        String(sealed.flagged_from_mint) === String(rec.address)
      ) {
        const sym = normalizeFlaggedTicker(rec.symbol);
        if (sym) sealed.flagged_from_symbol = sym;
      }
      flaggedSellers[w] = {
        ...sealed,
        // Never inherit cloud "uploaded" — that is NOT Ruggers Upload on this mint
        origin:
          sealed.origin && String(sealed.origin) !== "uploaded"
            ? sealed.origin
            : "sold_while_flagged",
        entered_at: prior.entered_at || now,
        last_update: now,
        phase: "sold",
        ever_flagged: true,
        sold_pct:
          soldState.sold_pct != null
            ? soldState.sold_pct
            : prior.sold_pct != null
              ? prior.sold_pct
              : 100,
        first_pct: first.pct_supply,
        reason: soldState.reason || prior.reason || "sold_99",
        entered_via: prior.entered_via || "sold_while_flagged",
        origin_lane: originLane,
        rules_v: RUGGERS_RULES_VERSION,
        source_mint: mintBare,
      };
    }

    // Buy-back: stay Flagged identity forever — only move section to Swing.
    // phase=swing → Swing list with purple "flagged · swing"; never remove label.
    // Sell ≥99% again → phase=sold → Flagged section again (still purple).
    // Similar lineage / this-mint Upload never use Flagged identity here.
    if (
      tag === "swing" &&
      everFlaggedOnMint &&
      !similarLineageOnMint &&
      !uploadedSimilar &&
      !uploadedOnThisMint
    ) {
      const prior = flaggedSellers[w] || prev.flagged_meta || {};
      const sealed = withSingleFlaggedFromMint(
        { ...prior, ...(rwKnown[w] || {}) },
        prior,
        rwKnown[w],
        prev,
        { symbol: rec.symbol, flagged_from_symbol: rec.symbol }
      );
      if (!sealed.flagged_from_mint && rec.address) {
        sealed.flagged_from_mint = rec.address;
        sealed.flagged_from_mints = [rec.address];
        const sym = normalizeFlaggedTicker(rec.symbol);
        if (sym) sealed.flagged_from_symbol = sym;
      } else if (
        sealed.flagged_from_mint &&
        !sealed.flagged_from_symbol &&
        rec.address &&
        String(sealed.flagged_from_mint) === String(rec.address)
      ) {
        const sym = normalizeFlaggedTicker(rec.symbol);
        if (sym) sealed.flagged_from_symbol = sym;
      }
      flaggedSellers[w] = {
        ...sealed,
        origin:
          sealed.origin && String(sealed.origin) !== "uploaded"
            ? sealed.origin
            : "sold_while_flagged",
        entered_at: prior.entered_at || now,
        last_update: now,
        phase: "swing",
        ever_flagged: true,
        source_mint: mintBare,
        sold_pct: prior.sold_pct != null ? prior.sold_pct : soldState.sold_pct,
        first_pct: first.pct_supply,
        reason: "buy_back_flagged_swing",
        origin_lane: originLane,
        rules_v: RUGGERS_RULES_VERSION,
      };
      // Never cloud-unflag: keep flagged label/identity for this mint loop
    }

    // Permanent Similar-Upload: never Flagged on this mint
    if (uploadedSimilar && flaggedSellers[w]) {
      delete flaggedSellers[w];
    }

    // Flagged lineage = permanent once set (except similar-upload pin on this mint)
    const isFlaggedLineage = !!(
      !uploadedSimilar &&
      (everFlaggedOnMint || flaggedSellers[w] || wasFlaggedSeller)
    );
    const flaggedPhase =
      flaggedSellers[w] && flaggedSellers[w].phase
        ? String(flaggedSellers[w].phase)
        : tag === "swing" && isFlaggedLineage
          ? "swing"
          : tag === "seller" && isFlaggedLineage
            ? "sold"
            : null;

    // Sticky Similar / Single / Creator sellers: pin until confirmed buy-back.
    // If they never return, they stay in that section indefinitely.
    const soldSupplyPct =
      soldState.sold_supply_pct != null
        ? soldState.sold_supply_pct
        : ruggersSoldSupplyPct(
            first.pct_supply,
            cur.listed ? cur.pct_supply : 0,
            !!cur.listed
          );
    // What they hold now (Swing UI: "holds X% of supply")
    const holdsSupplyPct =
      tag === "swing"
        ? ruggersBoughtBackSupplyPct(
            cur.listed ? cur.pct_supply : null,
            !!cur.listed
          )
        : null;
    const boughtBackSupplyPct = holdsSupplyPct; // legacy field name
    // Peak dump supply % remembered while seller (don't shrink on dust noise)
    let peakSoldSupply =
      prev.sold_supply_pct != null && Number.isFinite(Number(prev.sold_supply_pct))
        ? Number(prev.sold_supply_pct)
        : stickyLane[w] && stickyLane[w].sold_supply_pct != null
          ? Number(stickyLane[w].sold_supply_pct)
          : null;
    if (soldSupplyPct != null) {
      peakSoldSupply =
        peakSoldSupply == null
          ? soldSupplyPct
          : Math.max(peakSoldSupply, soldSupplyPct);
    }

    if (
      tag === "seller" &&
      everSold &&
      baselineOk &&
      soldState.sold &&
      !isFlaggedLineage &&
      isRuggersStickyOriginLane(originLane)
    ) {
      stickyLane[w] = {
        ...(stickyLane[w] || {}),
        origin_lane: originLane,
        entered_at: (stickyLane[w] && stickyLane[w].entered_at) || now,
        last_update: now,
        sold_pct:
          soldState.sold_pct != null
            ? soldState.sold_pct
            : (stickyLane[w] && stickyLane[w].sold_pct) || null,
        sold_supply_pct:
          peakSoldSupply != null
            ? peakSoldSupply
            : stickyLane[w] && stickyLane[w].sold_supply_pct != null
              ? stickyLane[w].sold_supply_pct
              : null,
        first_pct: first.pct_supply,
        first_balance: first.balance,
        reason: soldState.reason || (stickyLane[w] && stickyLane[w].reason) || "sold_99",
        in_similar: originLane === "similar",
        in_multi: originLane === "multi" || !!first.in_multi,
        in_funding: originLane === "funding" || !!first.in_funding,
        in_insider: originLane === "insider" || !!first.in_insider,
        in_launch: originLane === "launch" || !!first.in_launch,
        in_suspect: originLane === "suspect" || !!first.in_suspect,
        indefinite: true,
        source_mint: mintBare,
      };
    } else if (tag === "swing" && buyBack && stickyLane[w]) {
      // Only leave sticky seller list on real buy-back → Swing
      delete stickyLane[w];
    }

    // Flagged meta: store supply sold, not fake 100%
    if (flaggedSellers[w]) {
      flaggedSellers[w] = {
        ...flaggedSellers[w],
        sold_supply_pct:
          peakSoldSupply != null
            ? peakSoldSupply
            : flaggedSellers[w].sold_supply_pct,
        sold_pct:
          soldState.sold_pct != null
            ? soldState.sold_pct
            : flaggedSellers[w].sold_pct,
        bought_back_supply_pct:
          tag === "swing"
            ? boughtBackSupplyPct
            : flaggedSellers[w].bought_back_supply_pct,
      };
    }

    // Timestamps (ISO) — preserve first time seen / sold / swing
    const firstSeenAt = prev.first_seen_at || first.first_seen_at || now;
    let soldAt = prev.sold_at || null;
    if (tag === "seller" && soldState.sold) {
      soldAt = soldAt || now;
    } else if (
      stickyLane[w] &&
      stickyLane[w].entered_at &&
      !soldAt
    ) {
      soldAt = stickyLane[w].entered_at;
    }
    let swingAt = prev.swing_at || null;
    if (tag === "swing") {
      swingAt = swingAt || (buyBack ? now : prev.swing_at) || now;
    }

    status[w] = {
      tag,
      ever_sold: everSold,
      first_pct: first.pct_supply,
      first_balance: first.balance,
      current_pct: cur.listed ? cur.pct_supply : 0,
      current_balance: cur.listed ? cur.balance : 0,
      listed: !!cur.listed,
      first_seen_at: firstSeenAt,
      sold_at: soldAt,
      swing_at: swingAt,
      source_mint: mintBare,
      in_multi: !!(
        originLane === "multi" ||
        first.in_multi ||
        prev.in_multi ||
        (cur && cur.in_multi)
      ),
      in_multi_send: !!(
        originLane === "multi_send" ||
        first.in_multi_send ||
        prev.in_multi_send ||
        (cur && cur.in_multi_send)
      ),
      in_insider: !!(
        originLane === "insider" ||
        first.in_insider ||
        prev.in_insider ||
        (cur && cur.in_insider)
      ),
      in_suspect: !!(
        originLane === "suspect" ||
        first.in_suspect ||
        prev.in_suspect ||
        (cur && cur.in_suspect)
      ),
      in_funding: !!(
        originLane === "funding" ||
        first.in_funding ||
        prev.in_funding ||
        (cur && cur.in_funding)
      ),
      in_launch: !!(
        originLane === "launch" ||
        first.in_launch ||
        prev.in_launch ||
        (cur && cur.in_launch)
      ),
      in_fresh: !!(
        originLane === "fresh" ||
        first.in_fresh ||
        prev.in_fresh ||
        (cur && cur.in_fresh)
      ),
      exclude_from_single: !!(
        originLane === "excluded" ||
        originLane === "fresh" ||
        originLane === "multi_send" ||
        first.exclude_from_single ||
        prev.exclude_from_single ||
        (cur && cur.exclude_from_single)
      ),
      // % of first bag (rule helper; not shown as "100% of supply")
      sold_pct:
        soldState.sold_pct != null
          ? soldState.sold_pct
          : stickyLane[w] && stickyLane[w].sold_pct != null
            ? stickyLane[w].sold_pct
            : null,
      // % of mint supply sold (what UI shows for sellers)
      sold_supply_pct:
        peakSoldSupply != null
          ? peakSoldSupply
          : stickyLane[w] && stickyLane[w].sold_supply_pct != null
            ? stickyLane[w].sold_supply_pct
            : soldSupplyPct,
      // % of mint supply currently held (Swing UI: "holds …")
      holds_supply_pct: holdsSupplyPct,
      bought_back_supply_pct: boughtBackSupplyPct,
      // Peak bag while on Swing — re-dump ≥99% of this → back to origin lane
      swing_bag_pct: tag === "swing" ? swingBagPct : null,
      swing_bag_balance: tag === "swing" ? swingBagBal : null,
      reason:
        tag === "swing" && isFlaggedLineage
          ? "buy_back_flagged_swing"
          : tag === "swing"
            ? "holds_after_buy_back"
            : tag === "seller" && wasSwing
              ? "sold_swing_bag"
              : stickyLane[w]
                ? soldState.reason || stickyLane[w].reason || "sold_99_sticky"
                : soldState.reason,
      in_similar: inSimilar || uploadedSimilar || originLane === "similar",
      uploaded_similar: uploadedSimilar,
      origin_lane: originLane,
      // Creator label only for the real mint creator address
      is_creator: !!isCreator,
      sticky_lane_seller: !!stickyLane[w],
      // Purple forever once flagged on this mint (seller or swing)
      is_flagged: !!(isFlaggedLineage && !uploadedSimilar),
      ever_flagged_on_mint: !!(
        !uploadedSimilar &&
        (isFlaggedLineage || everFlaggedOnMint)
      ),
      flagged_phase: flaggedPhase,
      flagged_meta: flaggedSellers[w]
        ? { ...flaggedSellers[w] }
        : prev.flagged_meta || null,
      last_update: now,
    };
  }

  // Keep sticky lane sellers even if they dropped out of status recompute edge cases
  for (const [sw, meta] of Object.entries(stickyLane)) {
    if (!sw || !meta) continue;
    if (status[sw] && status[sw].tag === "swing") {
      // buy-back already handled — drop pin
      delete stickyLane[sw];
      continue;
    }
    const lane = meta.origin_lane || "single";
    if (!status[sw]) {
      status[sw] = {
        tag: "seller",
        ever_sold: true,
        first_pct: meta.first_pct != null ? meta.first_pct : null,
        first_balance: meta.first_balance != null ? meta.first_balance : null,
        first_seen_at: meta.entered_at || meta.first_seen_at || now,
        sold_at: meta.entered_at || meta.sold_at || now,
        last_update: meta.last_update || now,
        current_pct: 0,
        current_balance: 0,
        listed: false,
        sold_pct: meta.sold_pct != null ? meta.sold_pct : null,
        sold_supply_pct:
          meta.sold_supply_pct != null
            ? meta.sold_supply_pct
            : meta.first_pct != null
              ? meta.first_pct
              : null,
        bought_back_supply_pct: null,
        reason: meta.reason || "sold_99_sticky",
        in_similar: lane === "similar",
        origin_lane: lane,
        is_creator: lane === "creator",
        sticky_lane_seller: true,
        is_flagged: false,
        ever_flagged_on_mint: false,
        last_update: now,
      };
    } else if (status[sw].tag !== "swing") {
      status[sw].tag = "seller";
      status[sw].ever_sold = true;
      status[sw].sticky_lane_seller = true;
      status[sw].origin_lane = lane;
      status[sw].in_similar = lane === "similar" || !!status[sw].in_similar;
      if (status[sw].sold_pct == null && meta.sold_pct != null) {
        status[sw].sold_pct = meta.sold_pct;
      }
      if (
        status[sw].sold_supply_pct == null &&
        meta.sold_supply_pct != null
      ) {
        status[sw].sold_supply_pct = meta.sold_supply_pct;
      }
      if (
        status[sw].sold_supply_pct == null &&
        meta.first_pct != null
      ) {
        status[sw].sold_supply_pct = meta.first_pct;
      }
    }
    // Keep baseline for sticky sellers so they remain trackable
    if (!rec.first_wallets[sw]) {
      rec.first_wallets[sw] = {
        pct_supply: meta.first_pct != null ? meta.first_pct : null,
        balance: meta.first_balance != null ? meta.first_balance : null,
        rank: null,
        label: lane === "creator" ? "creator" : null,
        in_similar: lane === "similar",
        origin_lane: lane,
        source_mint: mintBare,
      };
    } else {
      rec.first_wallets[sw].origin_lane =
        rec.first_wallets[sw].origin_lane || lane;
      if (lane === "similar") rec.first_wallets[sw].in_similar = true;
    }
  }

  // Final scrub: Similar lineage never Flagged here
  if (rec.uploaded_similar && typeof rec.uploaded_similar === "object") {
    for (const uw of Object.keys(rec.uploaded_similar)) {
      if (flaggedSellers[uw]) delete flaggedSellers[uw];
      if (status[uw]) {
        status[uw].in_similar = true;
        status[uw].is_flagged = false;
        status[uw].uploaded_similar = true;
        status[uw].origin_lane = "similar";
        status[uw].ever_flagged_on_mint = false;
      }
    }
  }
  for (const [sw, st] of Object.entries(status)) {
    if (!st) continue;
    const fw0 = rec.first_wallets && rec.first_wallets[sw];
    const isSim =
      isUploadedSimilarOnThisMint(rec, sw) ||
      st.origin_lane === "similar" ||
      st.in_similar ||
      st.permanent_similar ||
      st.uploaded_similar ||
      (fw0 && (fw0.in_similar || fw0.origin_lane === "similar"));
    if (isSim) {
      if (flaggedSellers[sw]) delete flaggedSellers[sw];
      st.in_similar = true;
      st.origin_lane = "similar";
      st.is_flagged = false;
      st.ever_flagged_on_mint = false;
      if (st.flagged_meta) delete st.flagged_meta;
      continue;
    }
    // Any Ruggers Upload on THIS mint (Single, multi, Creator, …) never Flagged here
    if (isRuggersAlreadyUploaded(rec, sw)) {
      if (flaggedSellers[sw]) delete flaggedSellers[sw];
      st.is_flagged = false;
      st.ever_flagged_on_mint = false;
      st.ruggers_uploaded = true;
      if (st.flagged_meta) delete st.flagged_meta;
      const sec =
        rec.ruggers_uploaded &&
        rec.ruggers_uploaded[sw] &&
        rec.ruggers_uploaded[sw].section;
      if (sec && RUGGERS_STICKY_LANES.has(String(sec))) {
        st.origin_lane = String(sec);
        if (rec.first_wallets && rec.first_wallets[sw]) {
          rec.first_wallets[sw].origin_lane = String(sec);
        }
        if (sec === "creator") {
          st.is_creator = true;
          st.origin_lane = "creator";
        }
        if (sec === "single") {
          st.origin_lane = "single";
        }
      }
    }
  }
  // Drop flagged_sellers rows for this-mint uploads (including Single)
  if (rec.ruggers_uploaded && typeof rec.ruggers_uploaded === "object") {
    for (const uw of Object.keys(rec.ruggers_uploaded)) {
      if (flaggedSellers[uw]) delete flaggedSellers[uw];
    }
  }

  // Sticky flagged sellers not in first_wallets — keep by phase
  for (const fw of Object.keys(flaggedSellers)) {
    if (status[fw]) continue;
    const meta = flaggedSellers[fw] || {};
    const phase = String(meta.phase || "sold");
    const lane = meta.origin_lane || "single";
    status[fw] = {
      tag: phase === "swing" ? "swing" : "seller",
      ever_sold: true,
      first_pct: meta.first_pct != null ? meta.first_pct : null,
      first_balance: null,
      current_pct: 0,
      current_balance: 0,
      listed: false,
      sold_pct: meta.sold_pct != null ? meta.sold_pct : 100,
      reason:
        phase === "swing"
          ? "buy_back_flagged_swing"
          : meta.reason || "sold_99",
      in_similar: lane === "similar",
      origin_lane: lane,
      is_creator: lane === "creator",
      is_flagged: true,
      ever_flagged_on_mint: true,
      flagged_phase: phase,
      flagged_meta: { ...meta },
      last_update: now,
    };
  }

  rec.rugwatch_known = rwKnown;
  rec.flagged_sellers = flaggedSellers;
  rec.sticky_lane_sellers = stickyLane;
  // Keep legacy key in sync for any old UI paths (sellers-only, not full watchlist)
  rec.flagged_known = { ...flaggedSellers };
  rec.status = status;
  // Final pass: Upload (N) only for real this-mint Upload button marks
  purgeFalseRuggersUploadMarks(rec);
  rec.rules_version = RUGGERS_RULES_VERSION;
  // Hard-bind track to this mint CA (never another mint's hardware)
  rec.address = mintBare;
  rec.mint_key = storeKey;
  rec.chain = rec.chain || snap.chain || "solana";
  // Real holder bags → no longer a thin auto-seed
  if (Object.keys(rec.first_wallets || {}).length > 0) {
    delete rec.seeded_empty;
  }

  // Drop any sticky/status rows that were stamped for a different mint
  try {
    scrubForeignMintRuggersRows(rec, mintBare);
  } catch (err) {
    console.warn("[ruggers] scrub after process", err);
  }

  store[storeKey] = rec;
  // Never dual-write bare CA key (quota blow-up). Memory overlay covers lookup.
  try {
    if (store[mintBare]) delete store[mintBare];
  } catch (_) {}
  let savedOk = false;
  try {
    savedOk = !!saveRuggersStore(store);
  } catch (err) {
    console.warn("[ruggers] save store failed", err);
  }
  rememberRuggersRec(storeKey, rec, mintBare);

  try {
    const nTrack = Object.keys(rec.first_wallets || {}).length;
    const nMeas = countMeasurableRuggersBags(rec.first_wallets);
    let nSellers = 0;
    let nHolding = 0;
    for (const st of Object.values(rec.status || {})) {
      if (!st) continue;
      if (st.tag === "seller" || st.ever_sold) nSellers++;
      else if (st.tag === "holding") nHolding++;
    }
    console.info(
      "[ruggers]",
      mintBare.slice(0, 6) + "…",
      "tracked=" + nTrack,
      "measurable_bags=" + nMeas,
      "sellers=" + nSellers,
      "holding=" + nHolding,
      "lookups=" + (rec.lookup_count || 1),
      savedOk ? "saved" : "mem-only",
      isFirstLookup ? "(baseline freeze)" : "(compare)"
    );
  } catch (_) {}

  // Cloud unflag only for non-lineage cleanup (flagged identity stays for loop)
  if (unflagNow.length) {
    unflagRuggersWalletsOnCloud(unflagNow).catch(() => {
      /* non-fatal */
    });
  }

  return { key: storeKey, rec, unflagged: unflagNow };
}

/**
 * Remove sticky/status/flagged rows that are *explicitly* stamped for another mint.
 * Unstamped rows are kept (legacy data) — never wipe a whole track on open.
 */
function scrubForeignMintRuggersRows(rec, mintBare) {
  if (!rec || !mintBare) return;
  const want = bareMintAddr(mintBare).toLowerCase();
  if (!want) return;
  function isForeign(meta) {
    if (!meta || typeof meta !== "object") return false;
    const src = bareMintAddr(meta.source_mint || meta.track_mint || "").toLowerCase();
    return !!(src && src !== want);
  }
  if (rec.sticky_lane_sellers && typeof rec.sticky_lane_sellers === "object") {
    for (const w of Object.keys(rec.sticky_lane_sellers)) {
      if (isForeign(rec.sticky_lane_sellers[w])) delete rec.sticky_lane_sellers[w];
      else if (rec.sticky_lane_sellers[w]) rec.sticky_lane_sellers[w].source_mint = mintBare;
    }
  }
  if (rec.flagged_sellers && typeof rec.flagged_sellers === "object") {
    for (const w of Object.keys(rec.flagged_sellers)) {
      if (isForeign(rec.flagged_sellers[w])) delete rec.flagged_sellers[w];
      else if (rec.flagged_sellers[w]) rec.flagged_sellers[w].source_mint = mintBare;
    }
  }
  if (rec.status && typeof rec.status === "object") {
    for (const w of Object.keys(rec.status)) {
      if (isForeign(rec.status[w])) delete rec.status[w];
      else if (rec.status[w]) rec.status[w].source_mint = mintBare;
    }
  }
}

/** True if wallet is known on RugWatch for this mint track (not necessarily in Flagged section). */
function isRuggersRugwatchKnown(rec, wallet) {
  if (!rec || !wallet) return false;
  const w = String(wallet).trim();
  if (!w) return false;
  // Do not consult legacy flagged_known dump (had unrelated high-risk wallets)
  const pools = [rec.rugwatch_known, rec.flagged_sellers];
  for (const fk of pools) {
    if (!fk || typeof fk !== "object") continue;
    if (fk[w]) return true;
    const wl = w.toLowerCase();
    for (const k of Object.keys(fk)) {
      if (String(k).toLowerCase() === wl) return true;
    }
  }
  return false;
}

/** @deprecated name kept — means "in Flagged sellers section for this mint" */
function isRuggersFlaggedWallet(rec, wallet) {
  if (!rec || !wallet) return false;
  const fs = rec.flagged_sellers;
  if (!fs || typeof fs !== "object") return false;
  const w = String(wallet).trim();
  if (fs[w]) return true;
  const wl = w.toLowerCase();
  for (const k of Object.keys(fs)) {
    if (String(k).toLowerCase() === wl) return true;
  }
  return false;
}

/**
 * Remove wallets from RugWatch local DB + GitHub cloud (buy-back swing).
 */
async function unflagRuggersWalletsOnCloud(addresses) {
  const addrs = (addresses || []).map((a) => String(a || "").trim()).filter(Boolean);
  if (!addrs.length) return null;
  const base = rugwatchApiBase();
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  try {
    const tok = localStorage.getItem("rugwatch_site_token") || "";
    if (tok) headers["X-API-Token"] = tok;
  } catch (_) {
    /* ignore */
  }
  const res = await fetch(base + "/api/unflag", {
    method: "POST",
    headers,
    body: JSON.stringify({ addresses: addrs, push_cloud: true }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    data = { ok: false, error: "non-JSON unflag response" };
  }
  return data;
}

/**
 * True if this wallet was Uploaded from Similar on THIS mint.
 * Permanent for the mint track: always Similar here, never Flagged here.
 * Same wallet on other mints → Flagged when they sell ≥99%.
 */
function isUploadedSimilarOnThisMint(rec, wallet) {
  if (!rec || !wallet) return false;
  const w = String(wallet).trim();
  if (!w) return false;
  const us = rec.uploaded_similar;
  if (us && typeof us === "object") {
    if (us[w]) return true;
    const wl = w.toLowerCase();
    for (const k of Object.keys(us)) {
      if (String(k).toLowerCase() === wl) return true;
    }
  }
  return false;
}

/**
 * True if wallet was marked by the Ruggers Upload button on THIS mint only.
 * Cloud-known / other-mint / sold-while-flagged must never count.
 */
function isRuggersAlreadyUploaded(rec, wallet) {
  if (!rec || !wallet) return false;
  const w = String(wallet).trim();
  if (!w) return false;
  if (isUploadedSimilarOnThisMint(rec, w)) return true;
  const up = rec.ruggers_uploaded;
  if (!up || typeof up !== "object") return false;
  const mint = String(rec.address || "").trim().toLowerCase();
  const hit = up[w]
    ? up[w]
    : (function () {
        const wl = w.toLowerCase();
        for (const k of Object.keys(up)) {
          if (String(k).toLowerCase() === wl) return up[k];
        }
        return null;
      })();
  if (!hit || typeof hit !== "object") return false;
  // Only explicit Upload-button marks (v106+) count
  if (hit.via === "button") return true;
  // Legacy keep: must prove same mint address was stored on the mark
  if (
    mint &&
    hit.mint &&
    String(hit.mint).trim().toLowerCase() === mint
  ) {
    return true;
  }
  return false;
}

/**
 * Drop false "already uploaded" marks (cloud bleed / other mints / old builds).
 * Only keeps Upload-button marks for THIS mint + Similar-Upload pins.
 */
function purgeFalseRuggersUploadMarks(rec) {
  if (!rec || typeof rec !== "object") return;
  const mint = String(rec.address || "").trim().toLowerCase();
  const cleaned = {};
  const up = rec.ruggers_uploaded;
  if (up && typeof up === "object") {
    for (const [w, meta] of Object.entries(up)) {
      if (!w || !meta || typeof meta !== "object") continue;
      if (isUploadedSimilarOnThisMint(rec, w)) {
        cleaned[w] = { ...meta, via: meta.via || "button", mint: meta.mint || rec.address };
        continue;
      }
      if (meta.via === "button") {
        cleaned[w] = meta;
        continue;
      }
      if (
        mint &&
        meta.mint &&
        String(meta.mint).trim().toLowerCase() === mint
      ) {
        cleaned[w] = { ...meta, via: "button" };
        continue;
      }
      // Drop — no proof this mint's Upload button wrote it
    }
  }
  rec.ruggers_uploaded = cleaned;
  // Clear sticky status flags that are not in cleaned
  if (rec.status && typeof rec.status === "object") {
    for (const [sw, st] of Object.entries(rec.status)) {
      if (!st) continue;
      if (!st.ruggers_uploaded && !st.ruggers_uploaded_section) continue;
      let keep = !!(cleaned[sw] || isUploadedSimilarOnThisMint(rec, sw));
      if (!keep) {
        const wl = String(sw).toLowerCase();
        for (const k of Object.keys(cleaned)) {
          if (String(k).toLowerCase() === wl) {
            keep = true;
            break;
          }
        }
      }
      if (!keep) {
        delete st.ruggers_uploaded;
        delete st.ruggers_uploaded_section;
      }
    }
  }
  // Cloud origin "uploaded" is not a this-mint button upload
  if (rec.rugwatch_known && typeof rec.rugwatch_known === "object") {
    for (const [w, meta] of Object.entries(rec.rugwatch_known)) {
      if (!meta || String(meta.origin || "") !== "uploaded") continue;
      if (cleaned[w] || isUploadedSimilarOnThisMint(rec, w)) continue;
      const from = String(
        meta.flagged_from_mint ||
          (Array.isArray(meta.flagged_from_mints) && meta.flagged_from_mints[0]) ||
          ""
      )
        .trim()
        .toLowerCase();
      if (!mint || from !== mint) {
        meta.origin = "rugwatch";
        delete meta.uploaded_section;
      }
    }
  }
  // flagged_sellers: sold-while-flagged is never an Upload-button mark
  if (rec.flagged_sellers && typeof rec.flagged_sellers === "object") {
    for (const [w, meta] of Object.entries(rec.flagged_sellers)) {
      if (!meta || typeof meta !== "object") continue;
      if (String(meta.origin || "") !== "uploaded") continue;
      if (cleaned[w] || isUploadedSimilarOnThisMint(rec, w)) continue;
      meta.origin = "sold_while_flagged";
      delete meta.uploaded_section;
    }
  }
}

function markRuggersWalletUploaded(rec, wallet, section) {
  if (!rec || !wallet) return;
  const w = String(wallet).trim();
  if (!w) return;
  if (!rec.ruggers_uploaded || typeof rec.ruggers_uploaded !== "object") {
    rec.ruggers_uploaded = {};
  }
  const now = new Date().toISOString();
  rec.ruggers_uploaded[w] = {
    ...(rec.ruggers_uploaded[w] || {}),
    uploaded_at: (rec.ruggers_uploaded[w] && rec.ruggers_uploaded[w].uploaded_at) || now,
    last_update: now,
    section: section || (rec.ruggers_uploaded[w] && rec.ruggers_uploaded[w].section) || "unknown",
    // Proof: only Upload button / Similar pin paths call this
    via: "button",
    mint: rec.address || (rec.ruggers_uploaded[w] && rec.ruggers_uploaded[w].mint) || null,
  };
}

/** Permanently pin wallet as Similar on this mint (never expires). */
function pinUploadedSimilarOnMint(rec, wallet, extra) {
  if (!rec || !wallet) return;
  const w = String(wallet).trim();
  if (!w) return;
  if (!rec.uploaded_similar || typeof rec.uploaded_similar !== "object") {
    rec.uploaded_similar = {};
  }
  const now = new Date().toISOString();
  markRuggersWalletUploaded(rec, w, "similar");
  rec.uploaded_similar[w] = {
    permanent: true,
    ...(rec.uploaded_similar[w] || {}),
    ...(extra || {}),
    uploaded_at:
      (rec.uploaded_similar[w] && rec.uploaded_similar[w].uploaded_at) ||
      (extra && extra.uploaded_at) ||
      now,
    last_update: now,
  };
  if (rec.first_wallets && rec.first_wallets[w]) {
    rec.first_wallets[w].in_similar = true;
  } else if (rec.first_wallets) {
    // Ensure they stay on the track even if baseline was partial
    rec.first_wallets[w] = {
      pct_supply: (extra && extra.first_pct) != null ? extra.first_pct : null,
      balance: null,
      rank: null,
      label: null,
      in_similar: true,
    };
  }
  if (rec.flagged_sellers && rec.flagged_sellers[w]) {
    delete rec.flagged_sellers[w];
  }
  if (rec.status && rec.status[w]) {
    rec.status[w].in_similar = true;
    rec.status[w].is_flagged = false;
    rec.status[w].uploaded_similar = true;
  }
}

/**
 * After successful Upload → mark wallets as RugWatch-known on cloud.
 *
 * Similar section: permanent pin on THIS mint (never Flagged here).
 * Creator / Single / multi / …: stay in their origin section on THIS mint.
 * On OTHER mints, cloud-listed wallets can enter Flagged when they sell ≥99%
 * (unless that mint also freezes them as creator/similar).
 */
function markRuggersUploadedAsFlagged(exportKey, rows) {
  if (!_lastRuggersKey || !rows || !rows.length) return;
  const store = loadRuggersStore();
  const rec = store[_lastRuggersKey];
  if (!rec) return;
  if (!rec.rugwatch_known || typeof rec.rugwatch_known !== "object") {
    rec.rugwatch_known = {};
  }
  if (!rec.flagged_sellers || typeof rec.flagged_sellers !== "object") {
    rec.flagged_sellers = {};
  }
  if (!rec.uploaded_similar || typeof rec.uploaded_similar !== "object") {
    rec.uploaded_similar = {};
  }
  if (!rec.ruggers_uploaded || typeof rec.ruggers_uploaded !== "object") {
    rec.ruggers_uploaded = {};
  }
  const now = new Date().toISOString();
  // All lane Uploads stay in their section on THIS mint (never move Creator → Flagged).
  // Creator / Similar / Single / multi / … remain in place; cloud still gets the wallets.
  const keepOriginLane = new Set([
    "creator",
    "similar",
    "multi",
    "multi_send",
    "funding",
    "insider",
    "launch",
    "fresh",
    "suspect",
    "single",
  ]);

  for (const row of rows) {
    const w = (row && row.wallet) || "";
    if (!w) continue;
    markRuggersWalletUploaded(rec, w, exportKey || "unknown");
    rec.rugwatch_known[w] = {
      ...(rec.rugwatch_known[w] || {}),
      origin: "uploaded",
      last_seen: now,
      uploaded_section: exportKey || "unknown",
      // Initial mint + ticker identity for this flag upload
      flagged_from_mint: rec.address || null,
      flagged_from_mints: rec.address ? [rec.address] : [],
      flagged_from_symbol: normalizeFlaggedTicker(rec.symbol) || null,
    };
    const st = (rec.status && rec.status[w]) || row;
    const tag = st.tag || row.tag;

    // If this row was Similar (section upload OR tags), pin permanently on this mint
    const rowWasSimilar =
      exportKey === "similar" ||
      !!(st.in_similar || row.in_similar || st.origin_lane === "similar" || row.origin_lane === "similar") ||
      !!(
        rec.first_wallets &&
        rec.first_wallets[w] &&
        (rec.first_wallets[w].in_similar ||
          rec.first_wallets[w].origin_lane === "similar")
      );

    if (rowWasSimilar || exportKey === "similar") {
      // Permanent Similar pin on this mint — never Flagged here, ever
      pinUploadedSimilarOnMint(rec, w, {
        uploaded_at: now,
        sold_pct: st.sold_pct != null ? st.sold_pct : row.sold_pct,
        first_pct: st.first_pct != null ? st.first_pct : row.first_pct,
        source: exportKey === "similar" ? "similar_upload" : "similar_lineage_upload",
      });
      continue;
    }

    if (keepOriginLane.has(exportKey)) {
      // Stay under Creator / multi / funder / insider / launch / suspect / single
      // Creator section Upload: only the real mint creator gets is_creator.
      const realCreator =
        rec.creator &&
        String(w).toLowerCase() === String(rec.creator).toLowerCase();
      const laneKey =
        exportKey === "creator" && !realCreator ? "single" : exportKey;
      if (rec.status && rec.status[w]) {
        rec.status[w].origin_lane = laneKey;
        rec.status[w].ruggers_uploaded = true;
        rec.status[w].ruggers_uploaded_section = laneKey;
        rec.status[w].is_flagged = false;
        rec.status[w].ever_flagged_on_mint = false;
        rec.status[w].is_creator = !!realCreator;
        if (realCreator) {
          rec.status[w].origin_lane = "creator";
        }
        if (laneKey === "single") {
          rec.status[w].origin_lane = "single";
        }
      }
      if (rec.ruggers_uploaded && rec.ruggers_uploaded[w]) {
        rec.ruggers_uploaded[w].section = laneKey === "creator" || realCreator ? (realCreator ? "creator" : laneKey) : laneKey;
        if (realCreator) rec.ruggers_uploaded[w].section = "creator";
        else if (exportKey === "creator" && !realCreator) {
          rec.ruggers_uploaded[w].section = "single";
        }
      }
      if (rec.first_wallets && rec.first_wallets[w]) {
        rec.first_wallets[w].origin_lane = realCreator ? "creator" : laneKey;
        if (realCreator) {
          rec.first_wallets[w].label = "creator";
          rec.first_wallets[w].is_creator = true;
          rec.first_wallets[w].origin_lane = "creator";
        } else {
          rec.first_wallets[w].is_creator = false;
          if (rec.first_wallets[w].label === "creator") {
            rec.first_wallets[w].label = null;
          }
        }
        if (laneKey === "single") {
          rec.first_wallets[w].origin_lane = "single";
        }
      } else if (rec.first_wallets && exportKey === "single") {
        rec.first_wallets[w] = {
          pct_supply: st.first_pct != null ? st.first_pct : row.first_pct,
          balance: null,
          rank: null,
          label: null,
          in_similar: false,
          origin_lane: "single",
        };
      }
      if (rec.flagged_sellers && rec.flagged_sellers[w]) {
        delete rec.flagged_sellers[w];
      }
      // Ensure sticky pin so section stays populated after refresh
      if (!rec.sticky_lane_sellers || typeof rec.sticky_lane_sellers !== "object") {
        rec.sticky_lane_sellers = {};
      }
      if (tag === "seller" || row.sold_pct != null || row.ever_sold) {
        rec.sticky_lane_sellers[w] = {
          ...(rec.sticky_lane_sellers[w] || {}),
          origin_lane: exportKey === "creator" ? "creator" : exportKey,
          entered_at: (rec.sticky_lane_sellers[w] && rec.sticky_lane_sellers[w].entered_at) || now,
          last_update: now,
          sold_pct: st.sold_pct != null ? st.sold_pct : row.sold_pct,
          sold_supply_pct:
            st.sold_supply_pct != null ? st.sold_supply_pct : row.sold_supply_pct,
          first_pct: st.first_pct != null ? st.first_pct : row.first_pct,
          reason: st.reason || row.reason || "sold_99",
          uploaded: true,
          indefinite: true,
          source_mint: bareMintAddr(rec.address) || null,
        };
      }
      // Never put uploaded Creator into Flagged on this mint
      if (exportKey === "creator" && rec.flagged_sellers && rec.flagged_sellers[w]) {
        delete rec.flagged_sellers[w];
      }
      continue;
    }
  }
  // Do not rebuild flagged_known from flagged_sellers only (would wipe RugWatch hits)
  store[_lastRuggersKey] = rec;
  saveRuggersStore(store);
}

function ruggersBuckets(rec) {
  const creatorSold = [];
  const similarSellers = [];
  const multiSellers = [];
  const multiSendSellers = [];
  const fundingSellers = [];
  const insiderSellers = [];
  const launchSellers = [];
  const freshSellers = [];
  const suspectSellers = [];
  const singleSellers = [];
  const flaggedWallets = [];
  const swings = [];
  const flaggedSeen = new Set();
  const similarSeen = new Set();
  const multiSeen = new Set();
  const multiSendSeen = new Set();
  const fundingSeen = new Set();
  const insiderSeen = new Set();
  const launchSeen = new Set();
  const freshSeen = new Set();
  const suspectSeen = new Set();
  const singleSeen = new Set();
  const swingSeen = new Set();
  const empty = () => ({
    creatorSold,
    similarSellers,
    multiSellers,
    multiSendSellers,
    fundingSellers,
    insiderSellers,
    launchSellers,
    freshSellers,
    suspectSellers,
    singleSellers,
    flaggedWallets,
    swings,
  });
  if (!rec || !rec.status) {
    return empty();
  }

  const flaggedSellers =
    rec.flagged_sellers && typeof rec.flagged_sellers === "object"
      ? rec.flagged_sellers
      : {};
  // RugWatch knowledge on this mint (must be local — never rely on outer scope)
  const rwKnown =
    rec.rugwatch_known && typeof rec.rugwatch_known === "object"
      ? rec.rugwatch_known
      : {};

  function laneOf(w, st) {
    // Creator: only the mint creator address (never a crowd of "creator" uploads)
    if (isRuggersCreatorWallet(rec, w, rec.first_wallets && rec.first_wallets[w], st)) {
      return "creator";
    }
    if (isUploadedSimilarOnThisMint(rec, w)) return "similar";
    // Upload section on this mint wins over re-derived single → Flagged
    let upSec =
      rec.ruggers_uploaded &&
      rec.ruggers_uploaded[w] &&
      rec.ruggers_uploaded[w].section;
    if (
      upSec === "creator" &&
      rec.creator &&
      String(w).toLowerCase() !== String(rec.creator).toLowerCase()
    ) {
      upSec = "single";
    }
    if (upSec && RUGGERS_STICKY_LANES.has(String(upSec)) && upSec !== "creator") {
      return String(upSec);
    }
    if (st && st.origin_lane === "creator") return "creator";
    if (st && st.origin_lane && RUGGERS_STICKY_LANES.has(st.origin_lane)) {
      return st.origin_lane;
    }
    if (st && st.in_similar) return "similar";
    if (st && st.is_creator) return "creator";
    const fw = rec.first_wallets && rec.first_wallets[w];
    if (fw && fw.origin_lane && RUGGERS_STICKY_LANES.has(fw.origin_lane)) {
      // Launch-window removed — remap sticky launch → single
      if (fw.origin_lane === "launch") return "single";
      return fw.origin_lane;
    }
    if (fw && fw.in_similar) return "similar";
    if (fw && fw.in_multi) return "multi";
    if (fw && fw.in_multi_send) return "multi_send";
    if (fw && fw.in_funding) return "funding";
    if (fw && fw.in_insider) return "insider";
    // Launch-window disabled
    if (fw && fw.in_fresh) return "fresh";
    if (fw && fw.in_suspect) return "suspect";
    return "single";
  }

  function pushLaneSeller(lane, row, seenSet, list) {
    if (!row || !row.wallet || seenSet.has(row.wallet)) return;
    seenSet.add(row.wallet);
    list.push({
      ...row,
      origin_lane: lane,
      lane_label: RUGGERS_LANE_LABEL[lane] || lane,
    });
  }

  function isSimilarLineageRow(w, st) {
    // Permanent Similar-Upload always similar for UI
    if (isUploadedSimilarOnThisMint(rec, w)) return true;
    // If they are on Flagged sell path this row, do not force Similar UI
    if (st && st.is_flagged && st.tag === "seller" && st.ever_flagged_on_mint) {
      return false;
    }
    if (flaggedSellers[w] && String(flaggedSellers[w].phase || "sold") === "sold") {
      return false;
    }
    if (st && (st.origin_lane === "similar" || st.in_similar || st.permanent_similar || st.uploaded_similar)) {
      return true;
    }
    const fw = rec.first_wallets && rec.first_wallets[w];
    if (fw && (fw.in_similar || fw.origin_lane === "similar")) return true;
    return false;
  }

  function isFlaggedSold(w, st) {
    // Permanent Similar-Upload / this-mint Upload stay out of Flagged UI
    if (isUploadedSimilarOnThisMint(rec, w)) return false;
    if (isRuggersAlreadyUploaded(rec, w)) return false;
    const meta = flaggedSellers[w];
    if (meta && String(meta.phase || "sold") === "sold" && st.tag === "seller") {
      return true;
    }
    if (st.is_flagged && st.tag === "seller" && st.ever_flagged_on_mint) {
      return true;
    }
    return false;
  }

  for (const [w, st] of Object.entries(rec.status)) {
    if (!st || !w) continue;
    const keepSimilar = isUploadedSimilarOnThisMint(rec, w);
    const lane = laneOf(w, st);
    const flaggedSold = isFlaggedSold(w, st);
    const flaggedSwing = !!(
      !keepSimilar &&
      st.tag === "swing" &&
      (st.is_flagged ||
        st.ever_flagged_on_mint ||
        (flaggedSellers[w] &&
          (flaggedSellers[w].ever_flagged ||
            String(flaggedSellers[w].phase) === "swing")))
    );

    const row = {
      wallet: w,
      ...st,
      origin_lane: lane,
      in_similar: !!(st.in_similar || keepSimilar || lane === "similar"),
      // Never strip purple flagged label once set on this mint
      is_flagged: !!(
        !keepSimilar &&
        (flaggedSold ||
          flaggedSwing ||
          st.is_flagged ||
          st.ever_flagged_on_mint ||
          !!flaggedSellers[w])
      ),
      permanent_similar: keepSimilar,
    };

    // ── Swing (buy-back). Keep origin-lane label (multi · swing, etc.). ─
    // Flagged lineage keeps purple "flagged · swing". Creator keeps creator.
    if (st.tag === "swing") {
      const creatorSwing = !!(
        row.is_creator ||
        lane === "creator" ||
        isRuggersCreatorWallet(rec, w, rec.first_wallets && rec.first_wallets[w], st)
      );
      const originLaneSwing = creatorSwing
        ? "creator"
        : isRuggersStickyOriginLane(lane)
          ? lane
          : row.origin_lane || lane || "single";
      if (!swingSeen.has(w)) {
        swingSeen.add(w);
        // Flagged · swing: only the initial source mint (not every later mint)
        const metaF = withSingleFlaggedFromMint(
          flaggedSellers[w] || st.flagged_meta || {},
          st,
          rwKnown[w],
          rec.address,
          { symbol: rec.symbol, flagged_from_symbol: rec.symbol }
        );
        swings.push({
          ...row,
          tag: "swing",
          is_flagged: flaggedSwing || !!row.is_flagged,
          is_creator: creatorSwing || !!row.is_creator,
          origin_lane: originLaneSwing,
          lane_label:
            RUGGERS_LANE_LABEL[originLaneSwing] || originLaneSwing,
          ever_flagged_on_mint:
            !!(row.ever_flagged_on_mint || flaggedSwing || row.is_flagged),
          flagged_from_mint: metaF.flagged_from_mint || null,
          flagged_from_mints: metaF.flagged_from_mints || [],
          flagged_from_symbol: metaF.flagged_from_symbol || null,
          times_flagged:
            metaF.times_flagged != null
              ? metaF.times_flagged
              : (rwKnown[w] && rwKnown[w].times_flagged) || 0,
          mint_flag_count:
            metaF.mint_flag_count != null
              ? metaF.mint_flag_count
              : (rwKnown[w] && rwKnown[w].mint_flag_count) || 0,
          flagged_meta: metaF,
        });
      }
      // Permanent Similar-Upload also stays listed under Similar on this mint
      if (keepSimilar && !similarSeen.has(w)) {
        similarSeen.add(w);
        similarSellers.push({
          ...row,
          tag: "swing",
          in_similar: true,
          is_flagged: false,
          permanent_similar: true,
          origin_lane: "similar",
          lane_label: "similar",
        });
      }
      continue;
    }

    if (st.tag !== "seller") continue;

    // ── Flagged section (sold phase only) ─────────────────────────────
    if (flaggedSold) {
      if (!flaggedSeen.has(w)) {
        flaggedSeen.add(w);
        const metaF = withSingleFlaggedFromMint(
          flaggedSellers[w] || st.flagged_meta || {},
          st,
          rwKnown[w],
          rec.address,
          { symbol: rec.symbol, flagged_from_symbol: rec.symbol }
        );
        flaggedWallets.push({
          ...row,
          tag: "seller",
          is_flagged: true,
          risk_score: metaF.risk_score || st.risk_score,
          label: metaF.label || st.label,
          flagged_from_mint: metaF.flagged_from_mint || null,
          flagged_from_mints: metaF.flagged_from_mints || [],
          flagged_from_symbol: metaF.flagged_from_symbol || null,
          times_flagged:
            metaF.times_flagged != null
              ? metaF.times_flagged
              : (rwKnown[w] && rwKnown[w].times_flagged) || 0,
          mint_flag_count:
            metaF.mint_flag_count != null
              ? metaF.mint_flag_count
              : (rwKnown[w] && rwKnown[w].mint_flag_count) || 0,
        });
      }
      continue;
    }

    // ── Origin lanes (same sticky sell ↔ swing rules as Flagged/Similar) ─
    if (lane === "creator" || row.is_creator) {
      // At most one creator row — only the known mint creator (or first if unknown)
      const cAddr = rec.creator ? String(rec.creator).trim() : "";
      if (cAddr && String(w).toLowerCase() !== cAddr.toLowerCase()) {
        // Mis-tagged non-creator → fall through to single
        pushLaneSeller(
          "single",
          { ...row, is_creator: false, origin_lane: "single", lane_label: "single" },
          singleSeen,
          singleSellers
        );
        continue;
      }
      if (creatorSold.length && cAddr) {
        // Already have the real creator listed
        continue;
      }
      if (
        creatorSold.length &&
        !cAddr &&
        creatorSold.some((r) => r && r.wallet)
      ) {
        // Unknown creator: keep first only; rest → single
        pushLaneSeller(
          "single",
          { ...row, is_creator: false, origin_lane: "single", lane_label: "single" },
          singleSeen,
          singleSellers
        );
        continue;
      }
      creatorSold.push({
        ...row,
        is_creator: true,
        origin_lane: "creator",
        lane_label: "creator",
      });
      continue;
    }
    if (lane === "similar" || keepSimilar) {
      pushLaneSeller("similar", {
        ...row,
        in_similar: true,
        is_flagged: false,
        permanent_similar: keepSimilar,
      }, similarSeen, similarSellers);
      continue;
    }
    if (lane === "multi") {
      pushLaneSeller("multi", { ...row, in_multi: true }, multiSeen, multiSellers);
      continue;
    }
    if (lane === "multi_send") {
      pushLaneSeller(
        "multi_send",
        { ...row, in_multi_send: true },
        multiSendSeen,
        multiSendSellers
      );
      continue;
    }
    if (lane === "funding") {
      pushLaneSeller(
        "funding",
        { ...row, in_funding: true },
        fundingSeen,
        fundingSellers
      );
      continue;
    }
    if (lane === "insider") {
      pushLaneSeller(
        "insider",
        { ...row, in_insider: true },
        insiderSeen,
        insiderSellers
      );
      continue;
    }
    if (lane === "launch") {
      // Launch-window removed — sticky launch wallets go to Single
      if (isRuggersExcludedLpWallet(row)) continue;
      pushLaneSeller("single", { ...row, in_launch: false }, singleSeen, singleSellers);
      continue;
    }
    if (lane === "fresh") {
      pushLaneSeller(
        "fresh",
        { ...row, in_fresh: true },
        freshSeen,
        freshSellers
      );
      continue;
    }
    if (lane === "suspect") {
      pushLaneSeller(
        "suspect",
        { ...row, in_suspect: true },
        suspectSeen,
        suspectSellers
      );
      continue;
    }
    if (lane === "single") {
      pushLaneSeller("single", row, singleSeen, singleSellers);
      continue;
    }
    // excluded / unknown lane with proven sell → Single (never drop a seller)
    if (!isRuggersExcludedLpWallet(row)) {
      pushLaneSeller(
        "single",
        { ...row, origin_lane: "single", lane_label: "single" },
        singleSeen,
        singleSellers
      );
    }
  }

  // Flagged meta without status row (sold phase only)
  for (const [fw, meta] of Object.entries(flaggedSellers)) {
    if (!fw || flaggedSeen.has(fw) || swingSeen.has(fw)) continue;
    if (isUploadedSimilarOnThisMint(rec, fw)) continue;
    if (isRuggersAlreadyUploaded(rec, fw)) continue;
    if (meta && meta.origin_lane === "similar") continue;
    const fw0 = rec.first_wallets && rec.first_wallets[fw];
    if (fw0 && (fw0.in_similar || fw0.origin_lane === "similar")) continue;
    if (String(meta.phase || "sold") === "swing") continue;
    const st = (rec.status && rec.status[fw]) || {};
    if (st.tag === "swing") continue;
    flaggedSeen.add(fw);
    const sealed = withSingleFlaggedFromMint(
      meta,
      rec.rugwatch_known && rec.rugwatch_known[fw],
      st,
      rec.address,
      { symbol: rec.symbol, flagged_from_symbol: rec.symbol }
    );
    flaggedWallets.push({
      wallet: fw,
      tag: "seller",
      is_flagged: true,
      ever_sold: true,
      ever_flagged_on_mint: true,
      origin_lane: meta.origin_lane || "single",
      sold_pct: meta.sold_pct != null ? meta.sold_pct : null,
      sold_supply_pct:
        meta.sold_supply_pct != null
          ? meta.sold_supply_pct
          : meta.first_pct != null
            ? meta.first_pct
            : st.sold_supply_pct,
      first_pct: meta.first_pct != null ? meta.first_pct : st.first_pct,
      current_pct: st.current_pct != null ? st.current_pct : 0,
      listed: st.listed === true,
      reason: meta.reason || "sold_99",
      risk_score: meta.risk_score,
      label: meta.label,
      flagged_from_mint: sealed.flagged_from_mint || null,
      flagged_from_mints: sealed.flagged_from_mints || [],
      flagged_from_symbol: sealed.flagged_from_symbol || null,
      times_flagged:
        sealed.times_flagged != null
          ? sealed.times_flagged
          : meta.times_flagged != null
            ? meta.times_flagged
            : (rec.rugwatch_known &&
                rec.rugwatch_known[fw] &&
                rec.rugwatch_known[fw].times_flagged) ||
              0,
      mint_flag_count:
        sealed.mint_flag_count != null
          ? sealed.mint_flag_count
          : meta.mint_flag_count != null
            ? meta.mint_flag_count
            : 0,
      first_seen_at: meta.entered_at || st.first_seen_at,
      sold_at: meta.entered_at || st.sold_at,
      last_update: meta.last_update || st.last_update,
    });
  }

  // Permanent similar pins not already listed
  for (const [w, meta] of Object.entries(rec.uploaded_similar || {})) {
    if (!w || similarSeen.has(w)) continue;
    const st = (rec.status && rec.status[w]) || {};
    if (st.tag === "holding" && !st.ever_sold && st.sold_pct == null) continue;
    similarSeen.add(w);
    similarSellers.push({
      wallet: w,
      tag: st.tag === "swing" ? "swing" : "seller",
      ever_sold: true,
      is_flagged: false,
      in_similar: true,
      permanent_similar: true,
      origin_lane: "similar",
      sold_pct:
        st.sold_pct != null
          ? st.sold_pct
          : meta.sold_pct != null
            ? meta.sold_pct
            : 100,
      first_pct: st.first_pct != null ? st.first_pct : meta.first_pct,
      current_pct: st.current_pct != null ? st.current_pct : 0,
      listed: st.listed === true,
      reason: st.reason || "sold_99",
    });
  }

  // Sticky lane sellers who never returned — always show until buy-back
  const sticky = rec.sticky_lane_sellers || {};
  for (const [w, meta] of Object.entries(sticky)) {
    if (!w || !meta) continue;
    const st = (rec.status && rec.status[w]) || {};
    if (st.tag === "swing") continue;
    const lane = meta.origin_lane || st.origin_lane || "single";
    if (!isRuggersStickyOriginLane(lane)) continue;
    const row = {
      wallet: w,
      tag: "seller",
      ever_sold: true,
      sticky_lane_seller: true,
      is_flagged: false,
      in_similar: lane === "similar",
      in_multi: lane === "multi" || !!meta.in_multi,
      in_multi_send: lane === "multi_send" || !!meta.in_multi_send,
      in_funding: lane === "funding" || !!meta.in_funding,
      in_insider: lane === "insider" || !!meta.in_insider,
      in_launch: lane === "launch" || !!meta.in_launch,
      in_fresh: lane === "fresh" || !!meta.in_fresh,
      in_suspect: lane === "suspect" || !!meta.in_suspect,
      origin_lane: lane,
      lane_label: RUGGERS_LANE_LABEL[lane] || lane,
      is_creator: lane === "creator",
      sold_pct:
        st.sold_pct != null
          ? st.sold_pct
          : meta.sold_pct != null
            ? meta.sold_pct
            : null,
      sold_supply_pct:
        st.sold_supply_pct != null
          ? st.sold_supply_pct
          : meta.sold_supply_pct != null
            ? meta.sold_supply_pct
            : meta.first_pct != null
              ? meta.first_pct
              : st.first_pct != null
                ? st.first_pct
                : null,
      first_pct: st.first_pct != null ? st.first_pct : meta.first_pct,
      current_pct: st.current_pct != null ? st.current_pct : 0,
      listed: st.listed === true,
      reason: st.reason || meta.reason || "sold_99_sticky",
    };
    if (lane === "creator") {
      const cAddr = rec.creator ? String(rec.creator).trim() : "";
      if (cAddr && String(w).toLowerCase() !== cAddr.toLowerCase()) {
        pushLaneSeller(
          "single",
          { ...row, is_creator: false, origin_lane: "single" },
          singleSeen,
          singleSellers
        );
      } else if (!creatorSold.some((r) => r.wallet === w)) {
        if (cAddr) {
          // Keep only the real mint creator
          for (let i = creatorSold.length - 1; i >= 0; i--) {
            if (
              String(creatorSold[i].wallet || "").toLowerCase() !==
              cAddr.toLowerCase()
            ) {
              creatorSold.splice(i, 1);
            }
          }
        }
        if (!creatorSold.length || (cAddr && String(w).toLowerCase() === cAddr.toLowerCase())) {
          if (!creatorSold.some((r) => r.wallet === w)) {
            creatorSold.push({
              ...row,
              is_creator: true,
              origin_lane: "creator",
            });
          }
        }
      }
    } else if (lane === "multi") {
      pushLaneSeller("multi", row, multiSeen, multiSellers);
    } else if (lane === "similar" || lane === "suspect" || lane === "insider") {
      pushLaneSeller(
        "suspect",
        { ...row, origin_lane: "suspect", in_similar: true },
        suspectSeen,
        suspectSellers
      );
    } else if (lane === "multi_send") {
      pushLaneSeller("multi_send", row, multiSendSeen, multiSendSellers);
    } else if (lane === "funding") {
      pushLaneSeller("funding", row, fundingSeen, fundingSellers);
    } else if (lane === "launch") {
      pushLaneSeller("single", { ...row, in_launch: false }, singleSeen, singleSellers);
    } else if (lane === "fresh") {
      pushLaneSeller("fresh", row, freshSeen, freshSellers);
    } else if (lane === "single" && !flaggedSeen.has(w)) {
      pushLaneSeller("single", row, singleSeen, singleSellers);
    }
  }

  const bySold = (a, b) => {
    const as =
      a.sold_supply_pct != null
        ? Number(a.sold_supply_pct)
        : a.bought_back_supply_pct != null
          ? Number(a.bought_back_supply_pct)
          : Number(a.sold_pct) || 0;
    const bs =
      b.sold_supply_pct != null
        ? Number(b.sold_supply_pct)
        : b.bought_back_supply_pct != null
          ? Number(b.bought_back_supply_pct)
          : Number(b.sold_pct) || 0;
    return bs - as;
  };
  creatorSold.sort(bySold);
  similarSellers.sort(bySold);
  multiSellers.sort(bySold);
  multiSendSellers.sort(bySold);
  fundingSellers.sort(bySold);
  insiderSellers.sort(bySold);
  launchSellers.sort(bySold);
  freshSellers.sort(bySold);
  suspectSellers.sort(bySold);
  singleSellers.sort(bySold);
  flaggedWallets.sort(bySold);
  swings.sort(bySold);
  return {
    creatorSold,
    similarSellers,
    multiSellers,
    multiSendSellers,
    fundingSellers,
    insiderSellers,
    launchSellers,
    freshSellers,
    suspectSellers,
    singleSellers,
    flaggedWallets,
    swings,
  };
}

function fmtRugPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(2) + "%";
}

function shortWhen(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 19).replace("T", " ") + " UTC";
}

/**
 * Single initial mint a wallet was flagged from.
 * Never returns more than one; never grows a list of consecutive mints.
 * Prefers stored flagged_from_mint, else first entry of flagged_from_mints, else fallbacks.
 */
function pickInitialFlaggedFromMint(...sources) {
  for (const src of sources) {
    if (!src) continue;
    if (typeof src === "string") {
      const s = src.trim();
      if (s) return s;
      continue;
    }
    if (typeof src === "object") {
      const one = String(src.flagged_from_mint || "").trim();
      if (one) return one;
      const arr = src.flagged_from_mints;
      if (Array.isArray(arr) && arr.length) {
        const s = String(arr[0] || "").trim();
        if (s) return s;
      }
      // At most first mint mentioned in notes (ignore later mint lines)
      const notes = String(src.notes || "");
      const nm = notes.match(/\bmint\s+([1-9A-HJ-NP-Za-km-z]{32,44})\b/i);
      if (nm && nm[1]) return nm[1].trim();
    }
  }
  return "";
}

/** Strip $ and whitespace from a ticker symbol. */
function normalizeFlaggedTicker(sym) {
  const s = String(sym || "")
    .trim()
    .replace(/^\$+/, "");
  return s || "";
}

/**
 * Resolve ticker for a source mint from meta / store / history.
 */
function resolveFlaggedFromSymbol(mintAddr, ...sources) {
  const raw = String(mintAddr || "").trim();
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    const s =
      normalizeFlaggedTicker(src.flagged_from_symbol) ||
      normalizeFlaggedTicker(src.flagged_from_ticker) ||
      normalizeFlaggedTicker(src.symbol) ||
      normalizeFlaggedTicker(src.ticker);
    if (s) return s;
  }
  if (!raw) return "";
  try {
    const store = loadRuggersStore();
    for (const [k, rec] of Object.entries(store || {})) {
      if (k === "__meta" || !rec || typeof rec !== "object") continue;
      const addr = String(rec.address || "").trim();
      const keyEnd = k.includes(":") ? k.split(":").pop() : k;
      if (
        addr === raw ||
        keyEnd === raw ||
        k === raw ||
        k.endsWith(":" + raw) ||
        (addr && raw.endsWith(addr)) ||
        (addr && addr.endsWith(raw))
      ) {
        const s = normalizeFlaggedTicker(rec.symbol);
        if (s) return s;
      }
    }
  } catch (_) {
    /* ignore */
  }
  // History log (last Analyze rows often have symbol + address)
  try {
    const hist =
      typeof loadHistoryLog === "function" ? loadHistoryLog() : null;
    for (const e of hist || []) {
      const addr = String(e.address || e.token_address || "").trim();
      if (addr && (addr === raw || raw.endsWith(addr) || addr.endsWith(raw))) {
        const s = normalizeFlaggedTicker(e.symbol);
        if (s) return s;
      }
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const last = JSON.parse(localStorage.getItem(LAST_ANALYZE_KEY) || "null");
    const t = (last && last.token) || {};
    const addr = String(t.address || "").trim();
    if (addr && (addr === raw || raw.endsWith(addr) || addr.endsWith(raw))) {
      return normalizeFlaggedTicker(t.symbol);
    }
  } catch (_) {
    /* ignore */
  }
  return "";
}

/**
 * Force a flagged meta object to carry only the initial mint + its ticker.
 * Always stores flagged_from_symbol when known so UI shows $TICKER mint.
 */
function withSingleFlaggedFromMint(meta, ...fallbacks) {
  const base = meta && typeof meta === "object" ? { ...meta } : {};
  const initial = pickInitialFlaggedFromMint(base, ...fallbacks);
  base.flagged_from_mint = initial || null;
  base.flagged_from_mints = initial ? [initial] : [];
  const sym = resolveFlaggedFromSymbol(initial, base, ...fallbacks);
  if (sym) base.flagged_from_symbol = sym;
  else if (!base.flagged_from_symbol) base.flagged_from_symbol = null;
  return base;
}

/**
 * Display "$TICKER mintAddress" for the mint a wallet was flagged from.
 * Always prefers ticker + mint when ticker is known (store / meta / history).
 */
function formatFlaggedFromMint(mintAddr, symbolHint) {
  const raw = String(mintAddr || "").trim();
  if (!raw) return "";
  let full = raw;
  let symbol = normalizeFlaggedTicker(symbolHint);
  try {
    const store = loadRuggersStore();
    for (const [k, rec] of Object.entries(store || {})) {
      if (k === "__meta" || !rec || typeof rec !== "object") continue;
      const addr = String(rec.address || "").trim();
      const keyEnd = k.includes(":") ? k.split(":").pop() : k;
      if (
        addr === raw ||
        keyEnd === raw ||
        k === raw ||
        k.endsWith(":" + raw) ||
        (addr && raw.endsWith(addr)) ||
        (addr && addr.endsWith(raw))
      ) {
        if (!symbol && rec.symbol) symbol = normalizeFlaggedTicker(rec.symbol);
        if (addr) full = addr;
        break;
      }
    }
  } catch (_) {
    /* ignore */
  }
  if (!symbol) symbol = resolveFlaggedFromSymbol(full || raw);
  if (symbol) return "$" + symbol + " " + full;
  return full;
}

/** Last Ruggers render — used by per-section Export buttons */
let _lastRuggersBuckets = null;
let _lastRuggersRec = null;
let _lastRuggersKey = "";

function fmtSupplyPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  if (v === 0) return "0%";
  if (Math.abs(v) >= 1) return v.toFixed(2).replace(/\.?0+$/, "") + "%";
  if (Math.abs(v) >= 0.01) return v.toFixed(3).replace(/\.?0+$/, "") + "%";
  return v.toFixed(4).replace(/\.?0+$/, "") + "%";
}

/** Color a supply % with Holders priority bands (low/med/high/critical). */
function rugColoredPct(n, formatted) {
  const label =
    formatted != null
      ? String(formatted)
      : fmtSupplyPct(n) || fmtRugPct(n);
  if (!label || label === "—") return "—";
  const x = Number(n);
  const cls = Number.isFinite(x) ? pctPriorityClass(x) : "";
  return cls
    ? '<span class="' + cls + '">' + escHtml(label) + "</span>"
    : escHtml(label);
}

function renderRuggersWalletRow(row) {
  const w = row.wallet || "";
  const isFlagged = !!row.is_flagged || row.tag === "flagged";
  const isSwing = row.tag === "swing";
  // Flagged-on-swing keeps purple scheme (not gold-only)
  const flaggedSwing = isFlagged && isSwing;

  // Prefer supply % sold (not bag "100%")
  let soldSupply = row.sold_supply_pct;
  if (soldSupply == null && row.first_pct != null) {
    const cur =
      row.listed && row.current_pct != null ? Number(row.current_pct) : 0;
    soldSupply = Math.max(0, Number(row.first_pct) - cur);
  }
  // Swing: show what they hold now (not "bought back")
  const holdsNow =
    row.holds_supply_pct != null
      ? row.holds_supply_pct
      : row.bought_back_supply_pct != null
        ? row.bought_back_supply_pct
        : isSwing && row.current_pct != null
          ? row.current_pct
          : null;

  // Headline + first/now with colored supply % (same bands as Holders/Bundles)
  let headlineHtml;
  if (isSwing) {
    const hh = fmtSupplyPct(holdsNow);
    headlineHtml = hh
      ? "holds " + rugColoredPct(holdsNow, hh) + " of supply"
      : "holds (amount n/a)";
  } else {
    const ss = fmtSupplyPct(soldSupply);
    headlineHtml = ss
      ? "sold " + rugColoredPct(soldSupply, ss) + " of supply"
      : isFlagged && row.tag === "flagged"
        ? "on RugWatch list"
        : "sold (supply % n/a)";
  }

  const firstHtml =
    "first " + rugColoredPct(row.first_pct, fmtRugPct(row.first_pct));
  // For swing, "now" is redundant with "holds" — skip or keep brief
  let nowHtml = null;
  if (!isSwing) {
    if (row.listed) {
      nowHtml =
        "now " + rugColoredPct(row.current_pct, fmtRugPct(row.current_pct));
    } else if (row.tag === "flagged" && row.listed == null) {
      nowHtml = "watchlist";
    } else {
      nowHtml = "now not listed";
    }
  }
  const reason = isSwing
    ? isFlagged
      ? "still flagged · holding"
      : "holding after re-entry"
    : row.reason === "not_listed"
      ? "dropped off holder list"
      : row.reason === "sold_100"
        ? "dumped full first bag"
        : row.reason === "sold_99"
          ? "dumped ≥99% of first bag"
          : row.reason === "sold_swing_bag"
            ? "sold ≥99% of swing bag → back to origin"
            : row.reason === "rugwatch_flagged"
              ? "already on RugWatch (flagged)"
              : row.reason || "";
  const isCreator = !!(
    row.is_creator ||
    row.origin_lane === "creator" ||
    row.label === "creator"
  );
  const originLane = isCreator
    ? "creator"
    : row.origin_lane && RUGGERS_STICKY_LANES.has(row.origin_lane)
      ? row.origin_lane
      : "";
  const laneName = ruggersDisplayLaneName(
    row.lane_label ||
      RUGGERS_LANE_LABEL[originLane] ||
      originLane ||
      ""
  );
  let tagCls = "rug-tag-seller";
  let tagLabel = laneName ? laneName + " · seller" : "seller";
  if (flaggedSwing && isCreator) {
    tagCls = "rug-tag-flagged rug-tag-flagged-swing rug-tag-creator";
    tagLabel = "creator · flagged · swing";
  } else if (flaggedSwing) {
    tagCls = "rug-tag-flagged rug-tag-flagged-swing";
    tagLabel = "flagged · swing";
  } else if (isSwing && isCreator) {
    tagCls = "rug-tag-swing rug-tag-creator";
    tagLabel = "creator · swing";
  } else if (isSwing && laneName) {
    // Keep category label on Swing (multi · swing, fresh wallets · swing, …)
    tagCls = "rug-tag-swing";
    tagLabel = laneName + " · swing";
  } else if (isSwing) {
    tagCls = "rug-tag-swing";
    tagLabel = "swing";
  } else if (isFlagged && isCreator) {
    tagCls = "rug-tag-flagged rug-tag-creator";
    tagLabel = "creator · flagged seller";
  } else if (isFlagged && !isSwing) {
    tagCls = "rug-tag-flagged";
    tagLabel = "flagged seller";
  } else if (isCreator) {
    tagCls = "rug-tag-creator";
    tagLabel = "creator";
  } else if (laneName) {
    tagCls = "rug-tag-seller";
    tagLabel = laneName + " · seller";
  }
  const lane = laneName;
  // Timestamps: seen / sold / swing only (no “last”) — see docs §6.3d TIME SLOTS
  const tsParts = [];
  if (row.first_seen_at) {
    tsParts.push("seen " + shortWhen(row.first_seen_at));
  }
  if (row.sold_at) {
    tsParts.push("sold " + shortWhen(row.sold_at));
  }
  if (isSwing && row.swing_at) {
    tsParts.push("swing " + shortWhen(row.swing_at));
  }
  // Fallback if nothing else: sticky / flagged entered_at as sold/seen proxy
  if (!tsParts.length && row.entered_at) {
    tsParts.push("sold " + shortWhen(row.entered_at));
  }
  if (!tsParts.length && row.flagged_meta && row.flagged_meta.entered_at) {
    tsParts.push("sold " + shortWhen(row.flagged_meta.entered_at));
  }
  // Flagged (RugWatch) + flagged · swing: identity = initial mint ticker+address
  // + how many times this address has been flagged (RugWatch times_flagged)
  let flaggedFromLine = "";
  if (isFlagged || flaggedSwing || row.tag === "flagged" || row.ever_flagged_on_mint) {
    const initial =
      pickInitialFlaggedFromMint(row, row.flagged_meta) ||
      String(row.flagged_from_mint || "").trim();
    if (initial) {
      const symHint =
        (row.flagged_from_symbol ||
          (row.flagged_meta && row.flagged_meta.flagged_from_symbol) ||
          "") + "";
      const label = formatFlaggedFromMint(initial, symHint);
      if (label) flaggedFromLine = " · flagged from " + label;
    }
    let times = 0;
    try {
      times = Number(
        row.times_flagged != null
          ? row.times_flagged
          : row.flagged_meta && row.flagged_meta.times_flagged != null
            ? row.flagged_meta.times_flagged
            : row.times_seen || 0
      );
    } catch (_) {
      times = 0;
    }
    if (times > 0) {
      flaggedFromLine += " · flagged " + times + "×";
    }
  }
  const tsLine =
    (tsParts.length ? " · " + tsParts.join(" · ") : "") + flaggedFromLine;
  return (
    '<div class="rug-wallet-row' +
    (isFlagged ? " rug-wallet-flagged" : "") +
    (flaggedSwing ? " rug-wallet-flagged-swing" : "") +
    (isCreator ? " rug-wallet-creator" : "") +
    '">' +
    '<div class="rug-wallet-main">' +
    '<span class="rug-tag ' +
    tagCls +
    '">' +
    escHtml(tagLabel) +
    "</span> " +
    '<a class="wallet-link" href="https://solscan.io/account/' +
    encodeURIComponent(w) +
    '" target="_blank" rel="noopener noreferrer">' +
    escHtml(w) +
    "</a>" +
    "</div>" +
    '<div class="rug-wallet-meta">' +
    headlineHtml +
    " · " +
    firstHtml +
    (nowHtml ? " → " + nowHtml : "") +
    (lane ? " · lane " + escHtml(lane) : "") +
    (reason ? " · " + escHtml(reason) : "") +
    escHtml(tsLine) +
    "</div>" +
    "</div>"
  );
}

/**
 * Sum of mint-supply sold % across wallets in a Ruggers category.
 * Uses sold_supply_pct when set; else first_pct for full dumps; else 0.
 * Caps display at 100 (overlap possible across wallets).
 */
function sumRuggersCategorySoldSupplyPct(rows) {
  let sum = 0;
  const seen = new Set();
  for (const r of rows || []) {
    if (!r) continue;
    const w = String(r.wallet || "").trim();
    if (w) {
      if (seen.has(w)) continue;
      seen.add(w);
    }
    let v = null;
    if (r.sold_supply_pct != null && Number.isFinite(Number(r.sold_supply_pct))) {
      v = Number(r.sold_supply_pct);
    } else if (
      r.tag === "seller" &&
      r.first_pct != null &&
      Number.isFinite(Number(r.first_pct))
    ) {
      // Full / near-full dump of first bag ≈ supply sold for that bag
      const soldPct = r.sold_pct != null ? Number(r.sold_pct) : 100;
      if (Number.isFinite(soldPct) && soldPct >= 99) {
        v = Number(r.first_pct);
      } else if (Number.isFinite(soldPct) && soldPct > 0) {
        v = (Number(r.first_pct) * soldPct) / 100;
      }
    }
    if (v != null && Number.isFinite(v) && v > 0) sum += v;
  }
  if (sum > 100) sum = 100;
  return sum;
}

function formatRuggersSoldSupplyTotal(pct) {
  if (pct == null || !Number.isFinite(Number(pct)) || Number(pct) <= 0) {
    return "";
  }
  const n = Number(pct);
  // Avoid "0% supply sold" from tiny floats after rounding
  if (n < 0.0005) return "";
  const s = n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);
  const body = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  if (!body || body === "0") return "";
  return body + "% supply sold";
}

/**
 * Sum of mint-supply % currently held / bought back (Swing traders).
 * Prefers holds_supply_pct, then bought_back_supply_pct, then current_pct.
 */
function sumRuggersCategoryBoughtSupplyPct(rows) {
  let sum = 0;
  const seen = new Set();
  for (const r of rows || []) {
    if (!r) continue;
    const w = String(r.wallet || "").trim();
    if (w) {
      if (seen.has(w)) continue;
      seen.add(w);
    }
    let v = null;
    if (
      r.holds_supply_pct != null &&
      Number.isFinite(Number(r.holds_supply_pct))
    ) {
      v = Number(r.holds_supply_pct);
    } else if (
      r.bought_back_supply_pct != null &&
      Number.isFinite(Number(r.bought_back_supply_pct))
    ) {
      v = Number(r.bought_back_supply_pct);
    } else if (
      r.current_pct != null &&
      Number.isFinite(Number(r.current_pct)) &&
      Number(r.current_pct) > 0
    ) {
      v = Number(r.current_pct);
    } else if (
      r.swing_bag_pct != null &&
      Number.isFinite(Number(r.swing_bag_pct))
    ) {
      v = Number(r.swing_bag_pct);
    }
    if (v != null && Number.isFinite(v) && v > 0) sum += v;
  }
  if (sum > 100) sum = 100;
  return sum;
}

function formatRuggersBoughtSupplyTotal(pct) {
  if (pct == null || !Number.isFinite(Number(pct)) || Number(pct) <= 0) {
    return "";
  }
  const n = Number(pct);
  if (n < 0.0005) return "";
  const s = n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3);
  const body = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  if (!body || body === "0") return "";
  return body + "% supply bought";
}

/**
 * @param {string} title
 * @param {string} hint
 * @param {object[]} rows
 * @param {string} [exportKey]  lane key — Export + Upload (unless exportOnly)
 * @param {{ exportOnly?: boolean }} [opts]
 */
function renderRuggersSection(title, hint, rows, exportKey, opts) {
  let body;
  if (!rows || !rows.length) {
    body = '<p class="rug-empty">None yet.</p>';
  } else {
    body = rows.map(renderRuggersWalletRow).join("");
  }
  const n = rows ? rows.length : 0;
  // Swing = bought-back / currently held supply; all seller sections = sold supply
  const isSwingSection =
    (opts && opts.supplyMode === "bought") ||
    /^swing\b/i.test(String(title || "").trim());
  const supplyMode = isSwingSection ? "bought" : "sold";
  const supplyTot = !rows || !rows.length
    ? 0
    : supplyMode === "bought"
      ? sumRuggersCategoryBoughtSupplyPct(rows)
      : sumRuggersCategorySoldSupplyPct(rows);
  // Only show pill when formatted label is non-empty and not 0%
  // (covers empty sections, true 0%, and tiny floats that round to 0%)
  const supplyLabel =
    supplyMode === "bought"
      ? formatRuggersBoughtSupplyTotal(supplyTot)
      : formatRuggersSoldSupplyTotal(supplyTot);
  const showSupply = !!(
    supplyLabel &&
    !/^0%/.test(supplyLabel) &&
    supplyLabel.indexOf("%") >= 0
  );
  const supplyTitle =
    supplyMode === "bought"
      ? "Sum of mint-supply % currently held (bought back) across Swing wallets (capped at 100%)"
      : "Sum of mint-supply % sold across wallets in this section (capped at 100%)";
  // Upload count = not yet uploaded on this mint (ignores already-uploaded)
  const rec = _lastRuggersRec;
  const nUpload = (rows || []).filter(
    (r) => r && r.wallet && !isRuggersAlreadyUploaded(rec, r.wallet)
  ).length;
  const exportOnly = !!(opts && opts.exportOnly);
  let actions = "";
  if (exportKey) {
    actions =
      '<div class="rug-section-actions">' +
      '<button type="button" class="ghost history-btn rug-export-btn" data-rug-export="' +
      escHtml(exportKey) +
      '" title="Download all wallets in this section (JSON/txt for RugWatch)">' +
      "Export" +
      (n ? " (" + n + ")" : "") +
      "</button>";
    if (!exportOnly) {
      actions +=
        '<button type="button" class="rug-upload-btn" data-rug-upload="' +
        escHtml(exportKey) +
        '" title="Upload wallets not yet uploaded from THIS mint (cloud may still skip wallets already in RugWatch)">' +
        "Upload" +
        (nUpload ? " (" + nUpload + ")" : n ? " (0)" : "") +
        "</button>";
    }
    actions += "</div>";
  }
  const titleHtml =
    opts && opts.titleHtml
      ? opts.titleHtml
      : escHtml(title || "");
  const sectionClass =
    "rug-section" +
    (opts && opts.sectionClass ? " " + opts.sectionClass : "");
  const hintHtml =
    opts && opts.hintHtml
      ? opts.hintHtml
      : hint
        ? escHtml(hint)
        : "";
  return (
    '<section class="' +
    sectionClass +
    '">' +
    '<div class="rug-section-head">' +
    '<h3 class="rug-section-title">' +
    titleHtml +
    ' <span class="rug-count">' +
    n +
    "</span>" +
    (showSupply
      ? ' <span class="' +
        (isSwingSection || supplyMode === "bought"
          ? "rug-supply-bought"
          : "rug-supply-sold") +
        (pctPriorityClass(Number(supplyTot))
          ? " " + pctPriorityClass(Number(supplyTot))
          : "") +
        '" title="' +
        escHtml(supplyTitle) +
        '">' +
        escHtml(supplyLabel) +
        "</span>"
      : "") +
    "</h3>" +
    actions +
    "</div>" +
    (hintHtml
      ? '<p class="rug-section-hint">' + hintHtml + "</p>"
      : "") +
    '<div class="rug-section-body">' +
    body +
    "</div></section>"
  );
}

/** “Flagged wallets (RugWatch)” with dim-yellow RugWatch label */
function ruggersFlaggedTitleHtml() {
  return (
    "Flagged wallets " +
    '(<span class="rug-label-rugwatch">RugWatch</span>)'
  );
}

/**
 * Same-slot multi-buys title — dim-yellow (bots) / (launch-window) tags.
 */
function ruggersLaunchTitleHtml() {
  return (
    "Same-slot multi-buys " +
    '(<span class="rug-label-launch-bots">bots</span>) ' +
    '(<span class="rug-label-launch-window">launch-window</span>)'
  );
}

/**
 * Pump.fun / DEX liquidity vaults must not enter Ruggers Upload or launch-window sellers.
 */
function isRuggersExcludedLpWallet(row) {
  if (!row) return false;
  if (row.is_known_program || row.is_lp || row.isKnownProgram) return true;
  const blob = [
    row.label,
    row.reason,
    row.notes,
    row.origin,
    row.tag,
    ...(Array.isArray(row.reasons) ? row.reasons : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob) return false;
  const keys = [
    "pump.fun",
    "pumpfun",
    "pumpswap",
    "bonding curve",
    "associated bonding",
    "liquidity pair",
    "liquidity pool",
    "known liquidity",
    "raydium pool",
    "raydium authority",
    "raydium amm",
    "orca whirlpool",
    "orca pool",
    "meteora",
    "meteora pool",
    "pool (liquidity)",
    "pump swap",
    "known program",
  ];
  return keys.some((k) => blob.includes(k));
}

function filterOutRuggersLpRows(rows) {
  return (rows || []).filter(
    (r) => r && r.wallet && !isRuggersExcludedLpWallet(r)
  );
}

function ruggersRowsForExportKey(key) {
  const b = _lastRuggersBuckets;
  if (!b) return [];
  let rows = [];
  if (key === "creator") rows = b.creatorSold || [];
  else if (key === "similar") rows = b.similarSellers || [];
  else if (key === "multi") rows = b.multiSellers || [];
  else if (key === "multi_send") rows = b.multiSendSellers || [];
  else if (key === "funding") rows = b.fundingSellers || [];
  else if (key === "insider") rows = b.insiderSellers || [];
  else if (key === "launch") rows = b.launchSellers || [];
  else if (key === "fresh") rows = b.freshSellers || [];
  else if (key === "suspect") rows = b.suspectSellers || [];
  else if (key === "single") rows = b.singleSellers || [];
  return filterOutRuggersLpRows(rows);
}

/** Section rows that have not been Uploaded yet on this mint. */
function ruggersRowsNotYetUploaded(key) {
  const rows = ruggersRowsForExportKey(key);
  const rec = _lastRuggersRec;
  return (rows || []).filter(
    (r) => r && r.wallet && !isRuggersAlreadyUploaded(rec, r.wallet)
  );
}

function ruggersExportLabel(key) {
  if (key === "creator") return "creator_sellers";
  if (key === "similar") return "similar_sellers";
  if (key === "multi") return "multi_account_sellers";
  if (key === "multi_send") return "multi_send_sellers";
  if (key === "funding") return "shared_funder_sellers";
  if (key === "insider") return "insider_sellers";
  if (key === "launch") return "launch_window_sellers";
  if (key === "fresh") return "fresh_wallet_sellers";
  if (key === "suspect") return "similar_sized_sellers";
  if (key === "single") return "single_sellers";
  return String(key || "sellers");
}

/**
 * Build RugWatch-compatible wallet list from a Ruggers seller section.
 * JSON matches rugwatch_wallets_v1 so RugWatch Upload can import it.
 */
function buildRuggersExportPayload(exportKey, rows) {
  const rec = _lastRuggersRec || {};
  const section = ruggersExportLabel(exportKey);
  const mint = rec.address || _lastRuggersKey || "";
  const symbol = rec.symbol || "";
  // One entry per address (dedupe if UI listed a wallet twice)
  const seen = new Set();
  const wallets = [];
  for (const r of rows || []) {
    if (isRuggersExcludedLpWallet(r)) continue;
    const addr = (r && r.wallet || "").trim();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    const sold =
      r.sold_pct != null && Number.isFinite(Number(r.sold_pct))
        ? Number(r.sold_pct).toFixed(1) + "% sold of first bag"
        : "seller ≥99% first bag";
    const notes = [
      "ruggers " + section,
      symbol ? "$" + symbol : "",
      mint ? "mint " + mint : "",
      sold,
      r.reason || "",
    ]
      .filter(Boolean)
      .join(" · ");
    wallets.push({
      address: addr,
      wallet: addr,
      chain_id: (rec.chain || "solana").toString(),
      label: "ruggers_" + section,
      risk_score: 80,
      notes: notes,
      source: "adtc_ruggers_export",
      mint: mint || null,
      symbol: symbol || null,
      // Initial mint + ticker identity for this upload (source of the flag)
      flagged_from_mint: mint || null,
      flagged_from_mints: mint ? [mint] : [],
      flagged_from_symbol: symbol || null,
    });
  }
  return {
    format: "rugwatch_wallets_v1",
    source: "adtc_ruggers",
    section: section,
    mint: mint,
    symbol: symbol,
    count: wallets.length,
    exported_at: new Date().toISOString(),
    wallets: wallets,
  };
}

/** Guard: one export download at a time (prevents stacked listeners → multi files). */
let _ruggersExportBusy = false;

function downloadRuggersSection(exportKey) {
  if (_ruggersExportBusy) return;
  const rows = ruggersRowsForExportKey(exportKey);
  if (!rows.length) {
    alert(
      "No wallets in this section to export.\n\n" +
        "Re-analyze the mint after sellers appear, then Export again."
    );
    return;
  }
  const payload = buildRuggersExportPayload(exportKey, rows);
  const n = (payload.wallets || []).length;
  if (!n) {
    alert("No unique wallets to export after dedupe.");
    return;
  }
  const section = ruggersExportLabel(exportKey);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const asJson = window.confirm(
    "Export " +
      n +
      " wallet(s) from “" +
      section +
      "” for RugWatch.\n\n" +
      "This downloads ONE file with all " +
      n +
      " addresses.\n\n" +
      "OK = JSON (RugWatch Upload — recommended)\n" +
      "Cancel = plain text (one address per line)"
  );
  // One file only — never split across multiple downloads
  let blob;
  let name;
  if (asJson) {
    blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    name = "ruggers_" + section + "_" + n + "wallets_" + stamp + ".json";
  } else {
    const lines = (payload.wallets || [])
      .map((w) => (w && (w.address || w.wallet)) || "")
      .filter(Boolean);
    blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    name = "ruggers_" + section + "_" + n + "wallets_" + stamp + ".txt";
  }
  _ruggersExportBusy = true;
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally {
    setTimeout(() => {
      _ruggersExportBusy = false;
    }, 800);
  }
}

function rugwatchApiBase() {
  const cfg = window.ADTC_CONFIG || {};
  let u = (cfg.rugwatchUrl || "https://rugwatch.onrender.com/").trim();
  if (!u) u = "https://rugwatch.onrender.com/";
  return u.replace(/\/+$/, "");
}

/**
 * Upload Ruggers section wallets → live RugWatch DB + Push cloud (GitHub wallet list).
 * Default: https://rugwatch.onrender.com (override with config.js rugwatchUrl).
 */
async function uploadRuggersSectionToCloud(exportKey) {
  const allRows = ruggersRowsForExportKey(exportKey);
  const rows = ruggersRowsNotYetUploaded(exportKey);
  if (!allRows.length) {
    alert(
      "No wallets in this section to upload.\n\n" +
        "Re-analyze the mint after sellers appear, then try Upload again."
    );
    return;
  }
  if (!rows.length) {
    alert(
      "All " +
        allRows.length +
        " wallet(s) in this section were already uploaded from THIS mint.\n\n" +
        "Upload (N) only skips wallets you already Uploaded here — " +
        "wallets on RugWatch from other mints still count as new for this mint.\n\n" +
        "If this is wrong, clear Ruggers track for this mint and re-Analyze."
    );
    return;
  }
  const section = ruggersExportLabel(exportKey);
  const payload = buildRuggersExportPayload(exportKey, rows);
  const base = rugwatchApiBase();
  const ok = window.confirm(
    "Upload " +
      rows.length +
      " new wallet(s) from “" +
      section +
      "” to RugWatch?\n\n" +
      "(Section has " +
      allRows.length +
      " total; " +
      (allRows.length - rows.length) +
      " already uploaded from this mint are skipped.)\n\n" +
      "1) Import NEW wallets only (already in cloud/local are skipped)\n" +
      "2) Push cloud → GitHub if anything new was added\n\n" +
      "RugWatch:\n" +
      base +
      "\n\nContinue?"
  );
  if (!ok) return;

  const btn = document.querySelector(
    '[data-rug-upload="' + exportKey + '"]'
  );
  const prev = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Uploading…";
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    // Optional: same passcode as RugWatch site token if configured
    try {
      const tok =
        localStorage.getItem("rugwatch_site_token") ||
        sessionStorage.getItem("rugwatch_site_token") ||
        "";
      if (tok) headers["X-API-Token"] = tok;
    } catch (_) {
      /* ignore */
    }

    // Send wallets[] + plain text lines so RugWatch always has something to parse
    const addrLines = (payload.wallets || [])
      .map((w) => (w && (w.address || w.wallet)) || "")
      .filter(Boolean)
      .join("\n");
    if (!addrLines) {
      throw new Error("No wallet addresses in payload after filter.");
    }

    const up = await fetch(base + "/api/upload", {
      method: "POST",
      mode: "cors",
      headers,
      body: JSON.stringify({
        format: payload.format || "rugwatch_wallets_v1",
        wallets: payload.wallets,
        text: addrLines,
        source: "adtc_ruggers_" + section,
        push_cloud: true,
      }),
    });
    let upData = {};
    const upText = await up.text();
    try {
      upData = upText ? JSON.parse(upText) : {};
    } catch (_) {
      throw new Error(
        "RugWatch upload returned non-JSON (HTTP " +
          up.status +
          "). Is " +
          base +
          " awake? Body: " +
          String(upText || "").slice(0, 120)
      );
    }
    if (!up.ok || !upData.ok) {
      throw new Error(
        (upData && upData.error) ||
          "Upload failed (HTTP " +
            up.status +
            "). Open RugWatch (" +
            base +
            ") and retry."
      );
    }

    // Explicit push if server did not auto-push — do NOT fail the whole upload
    // when wallets already imported but GitHub push is misconfigured.
    let cloud = upData.cloud || null;
    let pushWarning = "";
    if (!cloud || !cloud.ok) {
      try {
        const push = await fetch(base + "/api/push-cloud", {
          method: "POST",
          mode: "cors",
          headers,
          body: JSON.stringify({}),
        });
        const pushText = await push.text();
        try {
          cloud = pushText ? JSON.parse(pushText) : { ok: false };
        } catch (_) {
          cloud = { ok: false, error: "Push cloud bad response" };
        }
        if (!push.ok || !cloud.ok) {
          pushWarning =
            (cloud && cloud.error) ||
            "Push cloud failed — wallets may still be in RugWatch local DB. Open RugWatch and click Push cloud.";
          console.warn("[ruggers upload] push-cloud", pushWarning, cloud);
        }
      } catch (pushErr) {
        pushWarning = String(
          (pushErr && pushErr.message) || pushErr || "Push cloud network error"
        );
        console.warn("[ruggers upload] push-cloud", pushWarning);
        cloud = cloud || { ok: false, error: pushWarning };
      }
    }

    const imported = upData.imported != null ? upData.imported : 0;
    const skipEx =
      upData.skipped_existing != null
        ? upData.skipped_existing
        : upData.skipped != null
          ? upData.skipped
          : 0;
    const skipCloud = upData.skipped_cloud != null ? upData.skipped_cloud : "?";
    const skipLocal = upData.skipped_local != null ? upData.skipped_local : "?";
    const cloudChecked = upData.cloud_checked === true ? "yes" : "no / failed";
    const cloudN =
      cloud && cloud.wallet_count != null
        ? cloud.wallet_count
        : cloud && cloud.count != null
          ? cloud.count
          : "?";
    const cloudBefore =
      cloud && cloud.cloud_before != null ? cloud.cloud_before : "?";
    const addedCloud =
      cloud && cloud.added_from_local != null ? cloud.added_from_local : "?";
    const pushed =
      cloud && cloud.skipped_push
        ? "skipped"
        : cloud && cloud.ok
          ? "merge-push OK"
          : cloud && cloud.error
            ? "failed: " + cloud.error
            : "n/a";
    // Move uploaded sellers into Flagged for this mint (already on cloud)
    try {
      markRuggersUploadedAsFlagged(exportKey, rows);
      if (_lastRuggersKey) refreshRuggersPanel(_lastRuggersKey);
    } catch (_) {
      /* ignore */
    }

    alert(
      "RugWatch upload result\n\n" +
        "Section: " +
        section +
        "\nNew into local DB: " +
        imported +
        "\nSkipped (already on cloud list): " +
        skipCloud +
        "\nSkipped (already on this RugWatch server DB): " +
        skipLocal +
        "\nCloud address list checked: " +
        cloudChecked +
        "\nCloud before merge: " +
        cloudBefore +
        "\nCloud now: " +
        cloudN +
        "\nAdded to cloud from local: " +
        addedCloud +
        "\nCloud push: " +
        pushed +
        (pushWarning ? "\n\n⚠ " + pushWarning : "") +
        (upData && upData.note ? "\n\n" + upData.note : "") +
        (cloud && cloud.note ? "\n\n" + cloud.note : "") +
        (exportKey === "similar"
          ? "\n\nSimilar sellers stay under Similar wallets on this mint (also on cloud). " +
            "On other mints they go to Flagged when they sell ≥99%."
          : exportKey === "creator"
            ? "\n\nUploaded Creator sellers stay under Creator on this mint (also on cloud). " +
              "They do not move to Flagged on this mint. Buy-back → Swing (creator label kept)."
            : exportKey === "single"
              ? "\n\nUploaded Single sellers stay under Single wallets on this mint (also on cloud). " +
                "They do not move to Flagged on this mint. Buy-back → Swing · sell again → Single."
              : "\n\nUploaded sellers stay under their Ruggers category on this mint (also on cloud). " +
                "They do not move to Flagged on this mint. Buy-back → Swing (label kept) · sell again → same category.")
    );
  } catch (e) {
    alert(
      "RugWatch Upload failed:\n\n" +
        String(e.message || e) +
        "\n\nTips:\n• Live RugWatch: https://rugwatch.onrender.com\n" +
        "• GITHUB_TOKEN must be set on that server\n" +
        "• Check config.js rugwatchUrl\n" +
        "• Free tier: first request after sleep can take ~60s"
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev || "Upload";
    }
  }
}

function wireRuggersExportButtons() {
  const body = $("ruggersBody");
  if (!body) return;
  // Single delegated listener (survives re-renders without stacking 2–3x clicks)
  if (!body.dataset.rugActionsWired) {
    body.dataset.rugActionsWired = "1";
    body.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      const up = t.closest("[data-rug-upload]");
      if (up) {
        ev.preventDefault();
        uploadRuggersSectionToCloud(up.getAttribute("data-rug-upload") || "");
        return;
      }
      const ex = t.closest("[data-rug-export]");
      if (ex) {
        ev.preventDefault();
        downloadRuggersSection(ex.getAttribute("data-rug-export") || "");
      }
    });
  }
}

/** Lite Ruggers tab — show detection status without huge seller tables. */
function showRuggersLitePanel(focusKey) {
  const body = $("ruggersBody");
  const dump = $("text-ruggers");
  let lines = [];
  let activeLine = "";
  try {
    const ca =
      bareMintAddr(focusKey || getSummaryBarMintAddr() || "") ||
      bareMintAddr(($("query") && $("query").value) || "") ||
      "";
    const raw = localStorage.getItem(RUGGERS_KEY);
    let store = {};
    if (raw && raw.length < 800000) {
      try {
        store = JSON.parse(raw) || {};
      } catch (_) {
        store = {};
      }
    }
    // Prefer in-memory recs from last Analyze
    try {
      for (const [k, recM] of Object.entries(__ruggersMem || {})) {
        if (k && recM && typeof recM === "object") store[k] = recM;
      }
    } catch (_) {}

    if (ca) {
      const found = findRuggersRecForMint
        ? findRuggersRecForMint(store, ca, "solana")
        : { rec: null, key: "" };
      let rec = found && found.rec;
      if (!rec && __ruggersMem) {
        const k = mintKeyFromToken(ca, "solana");
        rec = __ruggersMem[k] || __ruggersMem[ca] || null;
      }
      if (rec && rec.first_wallets) {
        const n = Object.keys(rec.first_wallets).length;
        const looks = rec.lookup_count || 1;
        const sym = rec.symbol ? "$" + rec.symbol : "token";
        activeLine =
          "<strong>Detected</strong> " +
          escHtml(sym) +
          " · " +
          escHtml(ca.slice(0, 8)) +
          "…" +
          " · baseline <strong>" +
          escHtml(String(n)) +
          "</strong> wallet(s) · lookups " +
          escHtml(String(looks)) +
          "<br/><span class=\"muted\">Seller/swing tables stay collapsed in lite mode (Opera-safe).</span>";
      } else if (ca) {
        activeLine =
          "Mint <code>" +
          escHtml(ca.slice(0, 12)) +
          "…</code> not in Ruggers yet. Run <strong>Analyze</strong> with Quick off so holders can seed a baseline.";
      }
    }

    const keys = Object.keys(store)
      .filter((k) => k && k !== "__meta")
      .slice(0, 20);
    if (keys.length) {
      lines.push("<br/><br/><strong>Tracked mints:</strong><br/>");
      for (const k of keys) {
        const rec = store[k];
        if (!rec || typeof rec !== "object") continue;
        const sym = rec.symbol ? "$" + String(rec.symbol) + " · " : "";
        const addr = rec.address ? String(rec.address) : k;
        const n =
          rec.first_wallets && typeof rec.first_wallets === "object"
            ? Object.keys(rec.first_wallets).length
            : 0;
        lines.push(
          "· " +
            escHtml(sym) +
            escHtml(String(addr).slice(0, 10)) +
            "… · " +
            escHtml(String(n)) +
            " baseline<br/>"
        );
      }
    }
  } catch (err) {
    console.warn("[ruggers lite build]", err);
  }
  if (body) {
    body.innerHTML =
      '<div class="logs-empty" style="text-align:left;padding:12px">' +
      "<strong>Ruggers · lite</strong><br/><br/>" +
      (activeLine || "Run Analyze to detect a mint baseline.") +
      lines.join("") +
      "<br/><br/>Full seller / Flagged / Upload UI: open <code>?full=1</code> in Edge or Chrome." +
      "</div>";
  }
  if (dump) {
    dump.textContent = "Ruggers lite — detection on; full tables off for Opera safety.";
  }
}

function refreshRuggersPanel(focusKey) {
  if (useLiteUi()) {
    try {
      showRuggersLitePanel(focusKey);
    } catch (err) {
      console.warn("[ruggers lite]", err);
    }
    return;
  }
  try {
    _refreshRuggersPanelImpl(focusKey);
  } catch (err) {
    console.error("[ruggers] panel crash", err);
    try {
      const body = $("ruggersBody");
      if (body) {
        body.innerHTML =
          '<p class="logs-empty"><strong>Ruggers error</strong><br/>' +
          escHtml(String(err && err.message ? err.message : err)) +
          "<br/><br/>Hard-refresh the page, then run a full Analyze again.</p>";
      }
    } catch (_) {
      /* ignore */
    }
  }
}

function _refreshRuggersPanelImpl(focusKey) {
  const body = $("ruggersBody");
  const dump = $("text-ruggers");
  let store = {};
  try {
    store = loadRuggersStore() || {};
  } catch (err) {
    console.error("[ruggers] load store failed", err);
    store = {};
  }

  // Prefer full in-memory recs (include holding status) over compact disk copies
  try {
    for (const [k, recM] of Object.entries(__ruggersMem)) {
      if (!k || !recM || typeof recM !== "object") continue;
      store[k] = recM;
    }
  } catch (_) {
    /* ignore */
  }

  const keys = Object.keys(store)
    .filter((k) => {
      if (k === "__meta") return false;
      const r = store[k];
      if (!(r && typeof r === "object" && r.first_wallets != null)) return false;
      // Dedupe bare CA vs solana:CA — keep canonical only for dropdown
      const bare = bareMintAddr(r.address || k);
      const canon = bare ? mintKeyFromToken(bare, r.chain || "solana") : "";
      if (canon && k !== canon && store[canon]) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = (store[a] && (store[a].last_ts || store[a].first_ts)) || "";
      const tb = (store[b] && (store[b].last_ts || store[b].first_ts)) || "";
      return String(tb).localeCompare(String(ta));
    });

  const focusHint = String(focusKey || "").trim();
  const summaryMint = getSummaryBarMintAddr();
  // Explicit focus (Analyze result key or dropdown pick) wins over summary bar.
  // Summary bar only used when opening the tab with no focusKey.
  const focusBare = bareMintAddr(focusHint);
  const wantBare = focusBare || summaryMint || "";

  let activeKey = "";
  let rec = null;

  // 0) In-memory exact key / bare (post-Analyze before disk catch-up)
  if (!rec && focusHint && __ruggersMem[focusHint]) {
    activeKey = focusHint;
    rec = __ruggersMem[focusHint];
  }
  if (!rec && focusBare && __ruggersMem[focusBare]) {
    activeKey = mintKeyFromToken(focusBare, "solana");
    rec = __ruggersMem[focusBare];
  }

  // 1) Explicit store key (Analyze rugKey or dropdown data-value)
  if (!rec && focusHint && store[focusHint] && typeof store[focusHint] === "object") {
    activeKey = focusHint;
    rec = store[focusHint];
  }

  // 2) Resolve by the mint we want (focus CA or summary CA) — never another mint
  if (!rec && wantBare) {
    const found = findRuggersRecForMint(store, wantBare, "solana");
    if (found.rec) {
      activeKey = found.key || mintKeyFromToken(wantBare, "solana");
      rec = found.rec;
    }
  }

  // 3) Auto-seed THIS mint so the panel is never blank when we know the CA
  //    (Analyze may have skipped holders / track — still open Ruggers for this mint)
  if (!rec && wantBare && wantBare.length >= 32) {
    try {
      const seeded = ensureRuggersMintTrack(wantBare, { chain: "solana" });
      if (seeded && seeded.rec) {
        rec = seeded.rec;
        activeKey = seeded.key;
        store = loadRuggersStore() || store;
      }
    } catch (seedErr) {
      console.warn("[ruggers] auto-seed on open failed", seedErr);
    }
  }

  // 4) Only if we have NO target mint at all, show most recent track
  if (!rec && !wantBare && keys.length) {
    activeKey = keys[0];
    rec = store[activeKey];
  }

  // Hard guard: if we wanted mint B, never display mint A's rec
  if (
    rec &&
    wantBare &&
    !sameMintAddr(rec.address || activeKey, wantBare) &&
    !sameMintAddr(activeKey, wantBare)
  ) {
    console.warn(
      "[ruggers] blocked wrong mint",
      rec.address || activeKey,
      "want",
      wantBare
    );
    // Prefer re-seed for the wanted mint instead of showing wrong hardware
    try {
      const seeded = ensureRuggersMintTrack(wantBare, { chain: "solana" });
      if (seeded && seeded.rec) {
        rec = seeded.rec;
        activeKey = seeded.key;
        store = loadRuggersStore() || store;
      } else {
        rec = null;
        activeKey = "";
      }
    } catch (_) {
      rec = null;
      activeKey = "";
    }
  }

  if (!rec || typeof rec !== "object" || !activeKey) {
    _lastRuggersBuckets = null;
    _lastRuggersRec = null;
    _lastRuggersKey = "";
    let html =
      '<div class="rug-header"><div class="rug-title">Ruggers</div></div>';
    html +=
      '<p class="logs-empty">Could not open a Ruggers track.<br/><br/>' +
      "Paste the mint CA in the search box and run a <strong>full Analyze</strong> (not Quick), " +
      "then open Ruggers again." +
      (wantBare
        ? "<br/><br/>Looking for:<br/><span class=\"mono\">" +
          escHtml(wantBare) +
          "</span>"
        : "") +
      "</p>";
    if (body) body.innerHTML = html;
    if (dump) dump.textContent = "No Ruggers track.";
    return;
  }

  // Normalize address field to bare CA for this track only
  rec.address = bareMintAddr(rec.address || activeKey || wantBare) || rec.address;

  try {
    purgeFalseRuggersUploadMarks(rec);
  } catch (err) {
    console.warn("[ruggers] purge", err);
  }
  try {
    const mintForScrub = bareMintAddr(rec.address || expectedBare || activeKey);
    if (mintForScrub) scrubForeignMintRuggersRows(rec, mintForScrub);
  } catch (err) {
    console.warn("[ruggers] scrub", err);
  }
  try {
    store[activeKey] = rec;
    saveRuggersStore(store);
  } catch (_) {
    /* ignore */
  }

  let buckets;
  try {
    buckets = ruggersBuckets(rec);
  } catch (err) {
    console.error("[ruggers] buckets failed", err);
    buckets = {
      creatorSold: [],
      similarSellers: [],
      multiSellers: [],
      multiSendSellers: [],
      fundingSellers: [],
      insiderSellers: [],
      launchSellers: [],
      freshSellers: [],
      suspectSellers: [],
      singleSellers: [],
      flaggedWallets: [],
      swings: [],
    };
  }
  _lastRuggersBuckets = buckets;
  _lastRuggersRec = rec;
  _lastRuggersKey = activeKey;
  const mintAddr = bareMintAddr(rec.address || activeKey) || "";
  const titleLeft =
    (rec.symbol ? "$" + rec.symbol + " · " : "") +
    (rec.name ? rec.name + " · " : "");

  let html = "";
  html += '<div class="rug-header">';
  html += '<div class="rug-title mono">';
  html += escHtml(titleLeft);
  if (mintAddr) {
    html +=
      '<a href="#" class="copy-mint mono" data-copy="' +
      escHtml(mintAddr) +
      '" title="Left-click to copy mint / CA">' +
      escHtml(mintAddr) +
      "</a>";
  } else {
    html += escHtml(activeKey);
  }
  html += "</div>";
  // CA/mint shown once in the title above — do not repeat "Mint:" here
  const nTracked = Object.keys(rec.first_wallets || {}).length;
  html +=
    '<div class="rug-sub">First lookup: ' +
    escHtml(shortWhen(rec.first_ts)) +
    " · Last: " +
    escHtml(shortWhen(rec.last_ts)) +
    " · Lookups: " +
    (rec.lookup_count || 1) +
    " · Tracked wallets: " +
    nTracked +
    (mintAddr
      ? " · CA " + escHtml(mintAddr.slice(0, 6) + "…" + mintAddr.slice(-4))
      : "") +
    "</div>";
  const nMeasBags = countMeasurableRuggersBags(rec.first_wallets);
  if (nTracked === 0 || rec.seeded_empty) {
    html +=
      '<p class="rug-rules" style="border-color:rgba(230,208,122,0.4)">' +
      "<strong>Baseline open for this mint</strong> — holder bag list is empty or thin. " +
      "Run a <strong>full Analyze</strong> (not Quick) so holders freeze with a real bag %. " +
      "Seller sections stay empty until a <strong>later</strong> full Analyze of the same mint " +
      "after wallets sell ≥99% of their first bag." +
      "</p>";
  } else if (nMeasBags === 0) {
    html +=
      '<p class="rug-rules" style="border-color:rgba(230,208,122,0.4)">' +
      "<strong>No measurable first bags</strong> — " +
      nTracked +
      " wallet(s) tracked but none have supply % / balance frozen. " +
      "Sells cannot be proven. Re-run <strong>full Analyze</strong> while holders still have bags." +
      "</p>";
  } else if ((rec.lookup_count || 1) < 2) {
    html +=
      '<p class="rug-rules" style="border-color:rgba(120,180,140,0.35)">' +
      "<strong>Baseline frozen</strong> — " +
      nMeasBags +
      " wallet(s) with bags. Seller lists stay empty until a <strong>second</strong> full Analyze " +
      "after they dump ≥99% of that first bag." +
      "</p>";
  }
  // Cap note when near limit (persistence needs this)
  if (nTracked >= RUGGERS_MAX_TRACK_WALLETS - 5) {
    html +=
      '<p class="rug-rules" style="border-color:rgba(120,160,200,0.3)">' +
      "Tracking cap " +
      nTracked +
      "/" +
      RUGGERS_MAX_TRACK_WALLETS +
      " wallets (categories + ≥0.01% bags). Dust-only bags are skipped so the baseline can save." +
      "</p>";
  }
  html +=
    '<p class="rug-rules">Rules: first full Analyze freezes a holder baseline; ' +
    "seller lists start <strong>empty</strong>. " +
    "<strong>Re-Analyze later</strong> — wallets that sold <strong>≥99%</strong> of that first bag " +
    "appear under their baseline category: Creator · Multi-account · Multi-send · Shared funder · " +
    "Fresh · Similar-sized · Single · Flagged wallets (RugWatch). " +
    "Buy-back → <span class=\"rug-tag rug-tag-swing\">swing</span> (label kept) · " +
    "sell again → back to the same category. Loop continues.</p>";

  // Tracked mint (left) + CA search bar (right)
  const prevSearch =
    ($("ruggersCaSearch") && $("ruggersCaSearch").value) || "";
  const prevStatusEl = $("ruggersCaStatus");
  const prevStatus =
    prevStatusEl && !prevStatusEl.hidden ? prevStatusEl.textContent : "";
  const prevStatusOk =
    prevStatusEl && prevStatusEl.classList.contains("ok");

  html += '<div class="rug-mint-search-row">';
  html += '<div class="rug-mint-pick-wrap">';
  html += '<span class="rug-mint-pick-label">Tracked mint</span>';
  // Custom dropdown (scrollable) — native <select> lists can't max-height reliably
  const activeRec = store[activeKey] || {};
  const activeLab =
    (activeRec.symbol ? "$" + activeRec.symbol + " " : "") +
    (activeRec.address || activeKey).slice(0, 14) +
    "…";
  html +=
    '<div class="rug-mint-dd" id="ruggersMintDropdown">' +
    '<button type="button" class="rug-mint-dd-btn" id="ruggersMintDdBtn" ' +
    'aria-haspopup="listbox" aria-expanded="false" title="Previously looked-up mints">' +
    '<span class="rug-mint-dd-label mono" id="ruggersMintDdLabel">' +
    escHtml(activeLab) +
    "</span>" +
    '<span class="rug-mint-dd-caret" aria-hidden="true">▾</span>' +
    "</button>" +
    '<ul class="rug-mint-dd-list" id="ruggersMintDdList" role="listbox" hidden>';
  for (const k of keys) {
    const r = store[k] || {};
    const lab =
      (r.symbol ? "$" + r.symbol + " " : "") +
      (r.address || k).slice(0, 14) +
      "…";
    html +=
      '<li role="option" class="rug-mint-dd-opt' +
      (k === activeKey ? " is-active" : "") +
      '" data-value="' +
      escHtml(k) +
      '" tabindex="-1">' +
      escHtml(lab) +
      "</li>";
  }
  html += "</ul></div>";
  // Hidden select kept for any legacy code that reads #ruggersMintSelect
  html +=
    '<select id="ruggersMintSelect" class="rug-mint-select-hidden" aria-hidden="true" tabindex="-1">';
  for (const k of keys) {
    html +=
      '<option value="' +
      escHtml(k) +
      '"' +
      (k === activeKey ? " selected" : "") +
      "></option>";
  }
  html += "</select></div>";

  html +=
    '<form class="rug-ca-search" id="ruggersCaForm" autocomplete="off">' +
    '<div class="rug-ca-search-row">' +
    '<span class="rug-ca-icon" aria-hidden="true">⌕</span>' +
    '<input id="ruggersCaSearch" class="mono rug-ca-input" type="search" name="ca" ' +
    'placeholder="Search previous lookup by CA…" spellcheck="false" ' +
    'autocomplete="off" enterkeyhint="search" value="' +
    escHtml(prevSearch) +
    '" />' +
    '<button type="submit" id="ruggersCaGo" class="rug-ca-go">Search</button>' +
    "</div>" +
    '<p id="ruggersCaStatus" class="rug-ca-status' +
    (prevStatusOk ? " ok" : "") +
    '"' +
    (prevStatus ? "" : " hidden") +
    ">" +
    escHtml(prevStatus) +
    "</p>" +
    "</form>";
  html += "</div>"; // rug-mint-search-row
  html += "</div>"; // rug-header

  html += renderRuggersSection(
    "Creator (sold ≥99%)",
    "Creator wallet — same rules as Similar/Single: sell ≥99% → stay here indefinitely if they never return; " +
      "buy-back → Swing (still labeled creator); sell again → back here. " +
      "Creator label is never removed. Yellow Upload → cloud.",
    buckets.creatorSold,
    "creator"
  );
  html += renderRuggersSection(
    "Multi-account clusters (1 Owner)",
    "Same owner, several large Associated Token Accounts at first lookup. " +
      "Sell ≥99% → stay here · buy-back → Swing · sell again → back here. Export + Upload.",
    buckets.multiSellers || [],
    "multi"
  );
  html += renderRuggersSection(
    "Multi-send (one → many)",
    "Token multi-send wallets (one sender → many receivers) at first lookup. " +
      "Export + Upload.",
    buckets.multiSendSellers || [],
    "multi_send"
  );
  html += renderRuggersSection(
    "Shared SOL funder clusters (1-Owner)",
    "Wallets that shared a common SOL funder (1-hop) at first lookup. Export + Upload.",
    buckets.fundingSellers || [],
    "funding"
  );
  html += renderRuggersSection(
    "Fresh wallets",
    "Holders whose bag is almost only this mint at first lookup. Export + Upload.",
    buckets.freshSellers || [],
    "fresh"
  );
  // Similar-sized = similar-size bags + Rugcheck insider (not multi-account)
  const suspectSellersOnly = []
    .concat(buckets.similarSellers || [])
    .concat(buckets.suspectSellers || [])
    .concat(buckets.insiderSellers || []);
  const susSeen = new Set();
  const suspectSellersDedup = [];
  for (const row of suspectSellersOnly) {
    const w = row && row.wallet;
    if (!w || susSeen.has(w)) continue;
    // Exclude multi-account lane wallets from Similar-sized section
    if (row.in_multi || row.origin_lane === "multi") continue;
    susSeen.add(w);
    suspectSellersDedup.push({
      ...row,
      origin_lane: "suspect",
      lane_label: "similar-sized",
      in_similar: !!(row.in_similar || row.origin_lane === "similar"),
      in_insider: !!(row.in_insider || row.origin_lane === "insider"),
      in_suspect: true,
    });
  }
  html += renderRuggersSection(
    "Similar-sized wallets",
    "Near-exact same bag size + Rugcheck insider-flagged. Not multi-account. " +
      "Sticky sell ↔ Swing. Export + Upload.",
    suspectSellersDedup,
    "suspect"
  );
  html += renderRuggersSection(
    "Single wallets (sellers)",
    "Plain top holders ≥0.01% (not multi / multi-send / funder / fresh / similar-sized). " +
      "Export + Upload.",
    buckets.singleSellers,
    "single"
  );
  // Flagged = sold ≥99% while on RugWatch; buy-back → purple Swing; sell again → Flagged
  const flaggedRows = buckets.flaggedWallets || [];
  if (flaggedRows.length) {
    html += renderRuggersSection(
      "Flagged wallets (RugWatch)",
      "Sold ≥99% while on RugWatch cloud/local list (purple). Label never removed. " +
        "Buy-back → Swing as “flagged · swing” (same purple). " +
        "Sell ≥99% again after concurrent lookup → back here. " +
        "Not the same as Insider-flagged (Rugcheck).",
      flaggedRows,
      null,
      { titleHtml: ruggersFlaggedTitleHtml() }
    );
  } else {
    html +=
      '<section class="rug-section">' +
      '<div class="rug-section-head">' +
      '<h3 class="rug-section-title">' +
      ruggersFlaggedTitleHtml() +
      ' <span class="rug-count">0</span>' +
      "</h3>" +
      "</div>" +
      '<p class="rug-section-hint">' +
      "Empty until a RugWatch wallet sells ≥99% on this mint. " +
      "Loop: Flagged ↔ Swing — purple label never drops once flagged. " +
      "Not the same as Insider-flagged (Rugcheck)." +
      "</p>" +
      '<div class="rug-section-body"><p class="rug-empty">None yet.</p></div>' +
      "</section>";
  }
  html += renderRuggersSection(
    "Swing traders",
    "Buy-back after ≥99% sell — stay while they hold (holds % of supply). " +
      "Category label is kept (e.g. multi-account · swing, insider · swing). " +
      "Sell ≥99% of that swing bag again → back to the same origin section. Loop continues. " +
      "Title total = mint-supply % currently held (bought), not sold.",
    buckets.swings,
    null,
    { supplyMode: "bought" }
  );

  // Summary counts
  const nSell =
    buckets.creatorSold.length +
    buckets.similarSellers.length +
    (buckets.multiSellers || []).length +
    (buckets.multiSendSellers || []).length +
    (buckets.fundingSellers || []).length +
    (buckets.insiderSellers || []).length +
    (buckets.launchSellers || []).length +
    (buckets.freshSellers || []).length +
    (buckets.suspectSellers || []).length +
    buckets.singleSellers.length;
  const nFlag = (buckets.flaggedWallets || []).length;
  html +=
    '<p class="rug-footer-meta">Lane sellers: ' +
    nSell +
    " · Flagged: " +
    nFlag +
    " · Swings: " +
    buckets.swings.length +
    " · Tracked mints: " +
    keys.length +
    " · Upload + Export on every seller section" +
    " · Swing keeps origin labels." +
    "</p>";

  if (body) body.innerHTML = html;
  if (dump) {
    dump.textContent = formatRuggersPlain(rec, buckets, activeKey);
  }

  wireRuggersMintDropdown();
  wireRuggersExportButtons();
  wireCopyMintClicks(body);
  wireRuggersCaSearch();
}

/** Scrollable “Tracked mint” dropdown (max-height; does not fill the screen). */
function wireRuggersMintDropdown() {
  const root = $("ruggersMintDropdown");
  const btn = $("ruggersMintDdBtn");
  const list = $("ruggersMintDdList");
  const sel = $("ruggersMintSelect");
  if (!root || !btn || !list) return;

  function close() {
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
  }
  function open() {
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
    const active = list.querySelector(".rug-mint-dd-opt.is-active");
    if (active && typeof active.scrollIntoView === "function") {
      try {
        active.scrollIntoView({ block: "nearest" });
      } catch (_) {
        /* ignore */
      }
    }
  }
  function toggle() {
    if (list.hidden) open();
    else close();
  }

  btn.onclick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggle();
  };

  list.querySelectorAll(".rug-mint-dd-opt").forEach((li) => {
    li.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const key = li.getAttribute("data-value") || "";
      if (!key) return;
      if (sel) sel.value = key;
      close();
      refreshRuggersPanel(key);
    };
  });

  // Close on outside click / Escape
  if (!document.documentElement.dataset.rugMintDdDoc) {
    document.documentElement.dataset.rugMintDdDoc = "1";
    document.addEventListener("click", (ev) => {
      const dd = $("ruggersMintDropdown");
      if (!dd || !dd.classList.contains("is-open")) return;
      if (dd.contains(ev.target)) return;
      const listEl = $("ruggersMintDdList");
      const btnEl = $("ruggersMintDdBtn");
      if (listEl) listEl.hidden = true;
      if (btnEl) btnEl.setAttribute("aria-expanded", "false");
      dd.classList.remove("is-open");
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      const dd = $("ruggersMintDropdown");
      if (!dd || !dd.classList.contains("is-open")) return;
      const listEl = $("ruggersMintDdList");
      const btnEl = $("ruggersMintDdBtn");
      if (listEl) listEl.hidden = true;
      if (btnEl) btnEl.setAttribute("aria-expanded", "false");
      dd.classList.remove("is-open");
    });
  }
}

/** Wire CA search form (re-run after each Ruggers panel render). */
function wireRuggersCaSearch() {
  const form = $("ruggersCaForm");
  if (form && form.dataset.wired !== "1") {
    form.dataset.wired = "1";
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      ruggersFindByCa();
    });
  }
  const go = $("ruggersCaGo");
  const inp = $("ruggersCaSearch");
  // Always re-bind click if button was recreated (dataset on form may survive wrongly)
  if (form) {
    // form recreated each refresh — rewire every time without relying on dataset alone
    form.onsubmit = (ev) => {
      ev.preventDefault();
      ruggersFindByCa();
    };
  }
  if (go) {
    go.onclick = (ev) => {
      ev.preventDefault();
      ruggersFindByCa();
    };
  }
  if (inp) {
    inp.onkeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ruggersFindByCa();
      }
    };
  }
}

/** Normalize pasted CA (strip chain: prefix, whitespace, zero-width chars). */
function normalizeCaQuery(query) {
  let q = String(query || "")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  // chain:address or solana/ADDRESS styles
  if (q.includes(":")) {
    const parts = q.split(":");
    q = parts[parts.length - 1].trim();
  }
  if (q.includes("/")) {
    const parts = q.split("/");
    q = parts[parts.length - 1].trim();
  }
  return q;
}

/** Find previously tracked Ruggers mint key by full or partial CA. */
function findRuggersKeyByCa(query, store) {
  const raw = normalizeCaQuery(query);
  if (!raw || !store) return null;
  const ql = raw.toLowerCase();
  const keys = Object.keys(store).filter(
    (k) => k !== "__meta" && store[k] && typeof store[k] === "object"
  );
  for (const k of keys) {
    const rec = store[k] || {};
    const addr = String(rec.address || "").trim();
    const al = addr.toLowerCase();
    const kl = k.toLowerCase();
    if (al && al === ql) return k;
    if (kl === ql) return k;
    if (kl.endsWith(":" + ql)) return k;
    // key may be "solana:MINT"
    const keyAddr = kl.includes(":") ? kl.split(":").pop() : kl;
    if (keyAddr === ql) return k;
  }
  let best = null;
  let bestLen = 0;
  if (ql.length >= 6) {
    for (const k of keys) {
      const rec = store[k] || {};
      const addr = String(rec.address || "").trim().toLowerCase();
      const keyAddr = k.toLowerCase().includes(":")
        ? k.toLowerCase().split(":").pop()
        : k.toLowerCase();
      if (addr && (addr.includes(ql) || ql.includes(addr))) {
        if (addr.length >= bestLen) {
          best = k;
          bestLen = addr.length;
        }
      } else if (keyAddr && (keyAddr.includes(ql) || ql.includes(keyAddr))) {
        if (keyAddr.length >= bestLen) {
          best = k;
          bestLen = keyAddr.length;
        }
      }
    }
  }
  return best;
}

/** Find a previous Logs (history) entry by CA — most recent match first. */
function findHistoryEntryByCa(query) {
  const raw = normalizeCaQuery(query);
  if (!raw) return null;
  const ql = raw.toLowerCase();
  const rows = loadHistoryLog();
  // Exact address / query first
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i] || {};
    const addr = String(e.address || "")
      .trim()
      .toLowerCase();
    const qy = String(e.query || "")
      .trim()
      .toLowerCase();
    if (addr && addr === ql) return { index: i, entry: e };
    if (qy && qy === ql) return { index: i, entry: e };
  }
  // Partial CA / symbol (same rules as highlight)
  for (let i = 0; i < rows.length; i++) {
    if (historyEntryMatchesCa(rows[i], ql)) {
      return { index: i, entry: rows[i] };
    }
  }
  return null;
}

function setRuggersCaStatus(msg, ok) {
  const el = $("ruggersCaStatus");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("ok");
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("ok", !!ok);
}

/**
 * Search bar: find a token you previously looked up by CA.
 * Prefers Ruggers tracking data; falls back to Logs history snapshots.
 */
function ruggersFindByCa() {
  const input = $("ruggersCaSearch");
  const q = input ? String(input.value || "").trim() : "";
  if (!q) {
    setRuggersCaStatus("Paste a mint / CA into the search bar first.", false);
    return;
  }
  const store = loadRuggersStore();
  const key = findRuggersKeyByCa(q, store);
  if (key) {
    const rec = store[key] || {};
    setRuggersCaStatus(
      "Found Ruggers data" +
        (rec.symbol ? " · $" + rec.symbol : "") +
        (rec.address ? " · " + String(rec.address).slice(0, 10) + "…" : "") +
        " · lookups " +
        (rec.lookup_count || 1),
      true
    );
    refreshRuggersPanel(key);
    switchTab("ruggers");
    return;
  }
  // Fallback: previous Analyze in Logs
  const hit = findHistoryEntryByCa(q);
  if (hit && hit.entry) {
    const e = hit.entry;
    setRuggersCaStatus(
      "Found in Logs (previous Analyze)" +
        (e.symbol ? " · $" + e.symbol : "") +
        (e.address ? " · " + String(e.address).slice(0, 10) + "…" : "") +
        " — opening Logs. No Ruggers sell-track for this CA yet (needs full Analyze baseline).",
      true
    );
    switchTab("history");
    refreshHistoryPanel(e.address || normalizeCaQuery(q));
    return;
  }
  setRuggersCaStatus(
    "No previous lookup for that CA in this browser (Ruggers or Logs).",
    false
  );
}

function copyTextToClipboard(text, onOk) {
  const t = String(text || "").trim();
  if (!t) return;
  const done = () => {
    if (typeof onOk === "function") onOk();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done).catch(() => {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (_) {
        alert("Copy failed — select and copy manually:\n" + t);
      }
    });
  } else {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (_) {
      alert("Copy failed — select and copy manually:\n" + t);
    }
  }
}

function wireCopyMintClicks(root) {
  const scope = root || document;
  scope.querySelectorAll("a.copy-mint, .copy-mint").forEach((a) => {
    if (a.dataset.copyWired === "1") return;
    a.dataset.copyWired = "1";
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const text = (a.getAttribute("data-copy") || a.textContent || "").trim();
      if (!text || text === "copied!") return;
      copyTextToClipboard(text, () => {
        const prev = a.textContent;
        a.textContent = "copied!";
        setTimeout(() => {
          a.textContent = prev;
        }, 900);
      });
    });
  });
}

function formatRuggersPlain(rec, buckets, key) {
  const lines = [];
  const r0 = rec && typeof rec === "object" ? rec : {};
  const b0 = buckets && typeof buckets === "object" ? buckets : {};
  lines.push("RUGGERS · " + (r0.symbol || "") + " " + (r0.address || key || ""));
  lines.push("First: " + shortWhen(r0.first_ts) + " · Last: " + shortWhen(r0.last_ts));
  lines.push("Lookups: " + (r0.lookup_count || 1));
  lines.push("");
  function dump(title, rows) {
    const list = Array.isArray(rows) ? rows : [];
    lines.push("--- " + title + " (" + list.length + ") ---");
    if (!list.length) {
      lines.push("  (none)");
      return;
    }
    for (const r of list) {
      const isSw = r.tag === "swing";
      const hold =
        r.holds_supply_pct != null
          ? r.holds_supply_pct
          : r.current_pct != null
            ? r.current_pct
            : null;
      const soldSup =
        r.sold_supply_pct != null
          ? r.sold_supply_pct
          : r.sold_pct != null
            ? r.sold_pct
            : null;
      lines.push(
        "  [" +
          (r.tag || "") +
          "] " +
          r.wallet +
          (isSw
            ? "  holds=" + (hold != null ? hold + "% supply" : "?")
            : "  sold=" + (soldSup != null ? soldSup + "% supply" : "?")) +
          "  first=" +
          fmtRugPct(r.first_pct) +
          "  now=" +
          (r.listed ? fmtRugPct(r.current_pct) : "not listed")
      );
    }
    lines.push("");
  }
  dump("Creator sold", b0.creatorSold);
  dump("Similar sellers", b0.similarSellers);
  dump("Multi-account (1 owner)", b0.multiSellers || []);
  dump("Shared SOL funder (1 owner)", b0.fundingSellers || []);
  dump("Insider-flagged (Rugcheck)", b0.insiderSellers || []);
  // Launch-window dump removed (scan disabled).
  dump("Similar-sized sellers", b0.suspectSellers || []);
  dump("Single sellers", b0.singleSellers);
  dump("Flagged wallets (RugWatch)", b0.flaggedWallets || []);
  dump("Swing traders", b0.swings);
  return lines.join("\n");
}

function initRuggers() {
  // Wire search only on boot. Full panel render is heavy (can freeze Opera GX
  // when many tracked mints exist) — run on first Ruggers tab open instead.
  wireRuggersCaSearch();
}

function apiBase() {
  const cfg = window.ADTC_CONFIG || {};
  const raw = (cfg.apiBase || "").trim().replace(/\/+$/, "");
  return raw; // "" → same origin
}

function apiUrl(path) {
  const p = path.startsWith("/") ? path : "/" + path;
  const base = apiBase();
  return base ? base + p : p;
}

function siteToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  } catch (_e) {
    return "";
  }
}

function setSiteToken(v) {
  try {
    if (v) sessionStorage.setItem(TOKEN_KEY, v);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (_e) {
    /* ignore */
  }
}

function headers(json = true) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  const t = siteToken();
  if (t) h["X-API-Token"] = t;
  return h;
}

function fmtUsd(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e9) return "$" + (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return "$" + (x / 1e3).toFixed(2) + "K";
  if (a >= 1) return "$" + x.toFixed(4);
  return "$" + x.toPrecision(4);
}

/**
 * Compact time for Bundles optional box stamp (must fit ~140px grid cells).
 * ASCII-safe: "Jul 22, 6:52 PM"
 */
function fmtMarketUpdatedAt(isoOrMs) {
  if (isoOrMs == null || isoOrMs === "") return "";
  try {
    const d =
      typeof isoOrMs === "number"
        ? new Date(isoOrMs)
        : new Date(String(isoOrMs));
    if (!Number.isFinite(d.getTime())) return String(isoOrMs).slice(0, 16);
    const mon = d.toLocaleString(undefined, { month: "short" });
    const day = d.getDate();
    const time = d.toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return mon + " " + day + ", " + time;
  } catch (_) {
    return String(isoOrMs).slice(0, 16);
  }
}

/**
 * Stamp under Fresh / Multi-send / Shared SOL — always BOTH lines:
 *   Last updated
 *   Jul 22, 6:52 PM
 * Fits inside the bun-stat box (white-space: pre-line).
 */
function optionalBundleUpdatedSub(whenRaw) {
  let when = fmtMarketUpdatedAt(whenRaw);
  if (!when) {
    // Always have a timestamp when we stamp the box
    when = fmtMarketUpdatedAt(Date.now());
  }
  if (!when) return "Last updated";
  return "Last updated\n" + when;
}

/** Clear any legacy MC/Liq/Vol market stamps left in old HTML / cache. */
function clearPrimaryMarketUpdatedStamps() {
  ["sumMcAt", "sumLiqAt", "sumVolAt", "sumMarketUpdated"].forEach(function (id) {
    const el = $(id);
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
    el.setAttribute("hidden", "");
    try {
      el.style.display = "none";
    } catch (_) {}
  });
}

function fmtPct(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const s = (x >= 0 ? "+" : "") + x.toFixed(2) + "%";
  return s;
}

function showError(msg) {
  const box = $("errorBox");
  if (!msg) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = msg;
}

/** Remove standalone Solscan URL lines; keep wallet addresses. */
function stripSolscanUrlLines(text) {
  if (!text) return "";
  return String(text)
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      // Drop lines that are only a Solscan account/token URL
      if (/^https?:\/\/(www\.)?solscan\.io\/(account|token)\//i.test(t)) {
        return false;
      }
      return true;
    })
    .join("\n");
}

/**
 * Hold % from a plain report line (no HTML).
 * Matches: holds 12.3% · holds ~12.3% · (12.3% · owns 12.3%
 */
function extractHoldPctFromPlain(line) {
  const plain = String(line || "");
  // Optional ~ before the number (Alerts detail: "holds ~15.00%")
  let m = plain.match(/\bholds\s*~?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (m) return Number(m[1]);
  m = plain.match(/\((\d+(?:\.\d+)?)\s*%/);
  if (m) return Number(m[1]);
  m = plain.match(/\bowns\s*~?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (m) return Number(m[1]);
  // "Wallet holds ~15%" already covered; bare "~15.00% of supply"
  m = plain.match(/~(\d+(?:\.\d+)?)\s*%/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Known LP / AMM / program vault addresses (match holders.py _KNOWN_OWNERS).
 * Never color-code these as risk bags.
 */
const KNOWN_LP_PROGRAM_ADDRS = new Set([
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h",
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
]);

/** Label / text hints for LP · liquidity pair · AMM vaults (holders.py _LP_LABEL_RE). */
const LP_LABEL_RE =
  /\b(lp|liquidity|pool|vault|amm|clmm|dlmm|cpmm|raydium|orca|meteora|whirlpool|pumpswap|pump\.fun|pumpfun|openbook|serum|phoenix|lifinity|invariant|saber|mercurial|market\s*maker|authority|program)\b/i;

/**
 * True if this row context is a known LP / liquidity pair / program vault.
 * Checks the address and bracket labels on the same / neighboring lines.
 */
function isKnownLpContext(addr, plainLines, idx) {
  if (addr && KNOWN_LP_PROGRAM_ADDRS.has(addr)) return true;
  const parts = [];
  for (let j = Math.max(0, idx - 1); j <= Math.min(plainLines.length - 1, idx + 1); j++) {
    parts.push(String(plainLines[j] || ""));
  }
  const blob = parts.join(" ");
  // Explicit labels like [Liquidity pair] or (Raydium Authority)
  if (/\[[^\]]*(?:lp|liquidity|pool|vault|amm|raydium|orca|meteora|whirlpool|pump)[^\]]*\]/i.test(blob)) {
    return true;
  }
  if (/\(\s*(?:lp|liquidity\s*pair|raydium|orca|meteora|whirlpool|pumpswap)[^)]*\)/i.test(blob)) {
    return true;
  }
  if (/\bliquidity\s*pair\b/i.test(blob)) return true;
  if (/\bknown\s*program\b/i.test(blob)) return true;
  // Bracket label body matches LP heuristics
  const labels = blob.match(/\[([^\]]+)\]/g) || [];
  for (const lab of labels) {
    if (LP_LABEL_RE.test(lab)) return true;
  }
  return false;
}

/**
 * Shared wallet-address colors (Holders / Alerts / Bundles):
 *   known LP / liquidity pair → white (dim)
 *   > 10% → red (dim)
 *   > 5%  → yellow (dim)
 */
function holdColorForPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  // Dim shades (match % priority palette — not bright)
  if (pct > 10) return { cls: "wallet-hold-red", color: "#b86b66" };
  if (pct > 5) return { cls: "wallet-hold-yellow", color: "#b8a85c" };
  return null;
}

// Dim off-white / light gray (not bright white)
const LP_HOLD_COLOR = { cls: "wallet-hold-lp", color: "#9aa3b2" };

/**
 * For each plain line, resolve the bag % that should color a wallet on that line.
 * - Same line % wins
 * - Else previous line % (Holders: rank line then address line)
 * - Else next line % (Creator: address then "owns X%")
 */
function resolveLineHoldPcts(plainLines) {
  const n = plainLines.length;
  const own = plainLines.map(extractHoldPctFromPlain);
  const resolved = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (own[i] != null) {
      resolved[i] = own[i];
      continue;
    }
    // Prefer previous non-empty line with a % (top-holder layout)
    for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
      if (own[j] != null) {
        resolved[i] = own[j];
        break;
      }
      if (String(plainLines[j] || "").trim()) break;
    }
    if (resolved[i] != null) continue;
    // Next line with owns/holds (creator layout)
    for (let j = i + 1; j < n && j <= i + 2; j++) {
      if (own[j] != null) {
        resolved[i] = own[j];
        break;
      }
      if (String(plainLines[j] || "").trim() && !/solscan\.io/i.test(plainLines[j])) {
        // non-empty non-pct line — stop looking
        if (!/\b(owns|holds)\b/i.test(plainLines[j])) break;
      }
    }
  }
  return resolved;
}

/** Build wallet <a> with optional hold color (inline style so it always wins). */
function walletLinkHtml(addr, holdClass, holdColor) {
  const cls = holdClass
    ? "wallet-link " + holdClass
    : "wallet-link";
  const style = holdColor
    ? ' style="color:' +
      holdColor +
      ' !important;font-weight:600"'
    : "";
  return (
    '<a class="' +
    cls +
    '" href="https://solscan.io/account/' +
    addr +
    '" target="_blank" rel="noopener noreferrer"' +
    style +
    ">" +
    addr +
    "</a>"
  );
}

/**
 * linkify with optional wallet-address hold coloring.
 * colorHold true → Holders / Alerts / Bundles shared scheme:
 *   >5% yellow · >10% red · skip known LP / liquidity pairs
 */
function linkify(text, colorHold) {
  if (!text) return "";
  // Never show Solscan URL rows; addresses stay and become clickable below
  const plain = stripSolscanUrlLines(text);
  const plainLines = plain.split("\n");
  const linePcts = colorHold ? resolveLineHoldPcts(plainLines) : null;

  const escLines = plainLines.map((line) =>
    line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );

  const htmlLines = escLines.map((escLine, idx) => {
    // Other http(s) URLs (not solscan account lines — already stripped)
    let html = escLine.replace(/(https?:\/\/[^\s<>"']+)/g, (url) => {
      if (/solscan\.io\/(account|token)\//i.test(url)) {
        return url;
      }
      return (
        '<a href="' +
        url +
        '" target="_blank" rel="noopener noreferrer">' +
        url +
        "</a>"
      );
    });

    const linePct = linePcts ? linePcts[idx] : null;

    // Solana base58 wallets → clickable Solscan (address text stays)
    html = html.replace(
      /(^|>)([^<]*?)(?=<|$)/g,
      (full, prefix, chunk) => {
        const linked = chunk.replace(
          /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g,
          (addr) => {
            let holdClass = null;
            let holdColor = null;
            if (colorHold) {
              // Known LP / liquidity pair → white (not bag-risk colors)
              if (isKnownLpContext(addr, plainLines, idx)) {
                holdClass = LP_HOLD_COLOR.cls;
                holdColor = LP_HOLD_COLOR.color;
              } else if (linePct != null) {
                const hc = holdColorForPct(linePct);
                if (hc) {
                  holdClass = hc.cls;
                  holdColor = hc.color;
                }
              }
            }
            return walletLinkHtml(addr, holdClass, holdColor);
          }
        );
        return prefix + linked;
      }
    );
    return html;
  });

  return htmlLines.join("\n");
}

/** Wallet-holder % bands: low green · medium yellow · high orange · critical red */
function pctPriorityClass(n) {
  if (!Number.isFinite(n)) return "";
  if (n <= 0) return "bun-pct-zero";
  if (n >= 15) return "pct-critical";
  if (n >= 10) return "pct-high";
  if (n > 5) return "pct-medium";
  // Any positive bag % gets a band (was blank below 2% — looked “uncolored”)
  return "pct-low";
}

function colorPctTokens(html) {
  // Color bare supply % tokens (skip signed +/- price change)
  return html.replace(/([+\-])?(\d+(?:\.\d+)?)(%)/g, (full, sign, num, pct) => {
    if (sign === "+" || sign === "-") return full;
    const n = Number(num);
    const cls = pctPriorityClass(n);
    if (!cls) return full;
    return `<span class="${cls}">${num}${pct}</span>`;
  });
}

/** Token balance amounts (not %) → yellow */
function colorHoldingAmounts(html) {
  if (!html) return html;
  // Holder rows: "#1 1,234.5678 ("
  let out = html.replace(
    /(#[0-9]+\s+)([\d,]+\.\d+|[\d,]{1,}|\d+)(\s*\()/g,
    '$1<span class="hold-amt">$2</span>$3'
  );
  // Cluster lines: "bal 1234.5"
  out = out.replace(
    /(\bbal\s+)([\d,]+\.?\d*)/gi,
    '$1<span class="hold-amt">$2</span>'
  );
  return out;
}

/** True for concentration summary lines: Top1 …% · Top5 …% · Top10 …% */
function isTopSummaryLine(line) {
  const plain = String(line || "").replace(/<[^>]*>/g, "");
  const hasTop1 = /\bTop\s*1\b/i.test(plain);
  const hasTop5 = /\bTop\s*5\b/i.test(plain);
  const hasTop10 = /\bTop\s*10\b/i.test(plain);
  return (
    (hasTop1 && hasTop5) ||
    (hasTop1 && hasTop10) ||
    (hasTop5 && hasTop10) ||
    /\bTop\s*1\b.*\bTop\s*5\b.*\bTop\s*10\b/i.test(plain)
  );
}

/** Lines whose % should stay uncolored (summary concentration / ex-LP). */
function isUncoloredPctLine(line) {
  const plain = String(line || "").replace(/<[^>]*>/g, "");
  if (isTopSummaryLine(plain)) return true;
  // Bundles / Logs: Top10 ex-LP is a summary metric, not a wallet holding band
  if (/\bTop\s*10\s*ex[-\s]?LP\b/i.test(plain)) return true;
  return false;
}

function colorWalletHolderPcts(html) {
  if (!html) return html;
  // Color supply % on wallet rows; Top1/Top5/Top10 + Top10 ex-LP stay default
  return html
    .split("\n")
    .map((line) => (isUncoloredPctLine(line) ? line : colorPctTokens(line)))
    .join("\n");
}

/**
 * Alerts tab % colors:
 *  - Total bundle % → hold-% priority bands (same as Bundles Total %)
 *  - Similar-sized total % → same bands
 *  - Single holders total → uncolored
 *  - Other alert rows (wallets over 2%, etc.) keep normal coloring
 */
function isAlertsSingleHoldersPctLine(plain) {
  const t = String(plain || "");
  if (/\bsingle\s*holders?\s*total\b/i.test(t)) return true;
  if (/\bsingle\s*holders?\s*≥/i.test(t)) return true;
  if (/\bsingle\s*holder\s*over\s*5/i.test(t)) return true;
  if (/\bBundles\s*→\s*Single holders\b/i.test(t)) return true;
  if (/\bsingle-holder wallet/i.test(t)) return true;
  return false;
}

function isAlertsBundleOrSimilarPctLine(plain) {
  const t = String(plain || "");
  if (/\btotal\s*bundle\b/i.test(t)) return true;
  if (/\bsimilar[-\s]*sized\s*total\b/i.test(t)) return true;
  return false;
}

function colorAlertsSelectivePcts(html) {
  if (!html) return html;
  return html
    .split("\n")
    .map((line) => {
      const plain = plainTextFromHtmlLine(line);
      // Never color single holders total %
      if (isAlertsSingleHoldersPctLine(plain)) return line;
      if (isUncoloredPctLine(line)) return line;
      // Color Total bundle + Similar-sized total + other alert wallet rows
      return colorPctTokens(line);
    })
    .join("\n");
}

/**
 * Holders + Logs rich formatting:
 *  - drop Solscan URL lines (keep addresses)
 *  - clickable wallet addresses
 *  - Holders mode: address red when bag > 10%
 *  - yellow token amounts
 *  - % color bands except Top1/Top5/Top10 and Top10 ex-LP
 *  - Creator "owns X%" uses % color scheme
 */
function formatHoldersRichHtml(text) {
  if (!text) return "";
  // Wallet addresses: >5% yellow · >10% red · skip known LP (inline style)
  let html = linkify(text, true);
  html = colorWalletHolderPcts(html);
  html = colorHoldingAmounts(html);
  html = colorAllSectionTitles(html);
  return html;
}

/**
 * Bundles tab % color scheme (same priority bands as Holders):
 *  - Summary: Total % bundles, Similar-size total, Fresh total, Multi-send total,
 *    Shared SOL total, Suspect total
 *  - Each wallet percent holdings in groups: "holds X%" on clusters,
 *    similar-size members, insiders, suspects, fresh, multi-send, shared SOL
 *    (+ group avg/range headers)
 *  - Similar-size group header right side: "sum X%" (combined group holdings)
 *  - Fresh / Multi-send / Shared SOL: “total X% across N wallet(s)” + lists
 *  - Top10 ex-LP stays uncolored (summary concentration, not a wallet bag)
 * Also yellows cluster "bal …" amounts.
 */
function colorBundlesSelectivePcts(html) {
  if (!html) return html;
  return html
    .split("\n")
    .map((line) => {
      if (isUncoloredPctLine(line)) return line;
      let out = colorPctTokens(line);
      // Color "Bundle risk: … (score N/100)" with risk score bands
      out = out.replace(
        /(Bundle\s+risk:\s*)([a-zA-Z]+)(\s*\(score\s*)(\d+(?:\.\d+)?)(\s*\/\s*100\))/i,
        (full, pre, label, mid, num, end) => {
          const cls = bundleRiskScoreClass(Number(num));
          return (
            pre +
            '<span class="' +
            cls +
            '">' +
            label +
            mid +
            num +
            end +
            "</span>"
          );
        }
      );
      return out;
    })
    .join("\n");
}

/** Strip tags for line classification */
function plainTextFromHtmlLine(line) {
  return String(line || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/**
 * Major section header (── TITLE ── or bare ALL-CAPS block).
 * Used for stronger dim-green styling so categories read as separate blocks.
 */
function isMajorSectionTitleLine(plain) {
  const t = String(plain || "").trim();
  if (!t) return false;
  // Explicit ── TITLE ── markers (About / Alerts categories)
  if (/^[─\-–—]{2,}\s*.+\s*[─\-–—]{2,}$/.test(t)) return true;
  // Bundles bare headers (title-case + colon; not field labels with values)
  const bare = t.toLowerCase().replace(/:+\s*$/, ":");
  if (bare === "signals:" || bare === "provider status:") return true;
  // Bare ALL-CAPS block titles only (no %, no decimals, short)
  if (
    t.length >= 3 &&
    t.length <= 48 &&
    t === t.toUpperCase() &&
    /[A-Z]/.test(t) &&
    !/\d\.\d/.test(t) &&
    !/%/.test(t) &&
    !/\$\d/.test(t) &&
    !/^[─\-–—=]{4,}$/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * True when a line is decorative/meta only (not real data under a section).
 */
function isSectionBodyMetaLine(plain) {
  const t = String(plain || "").trim();
  if (!t) return true;
  if (/^[=─\-–—]{6,}$/.test(t)) return true;
  if (/^[-]{12,}$/.test(t)) return true;
  if (/^\(/.test(t)) return true; // hints like "(click blue…)"
  if (/^click /i.test(t)) return true;
  if (/^or click /i.test(t)) return true;
  if (/^use tabs:/i.test(t)) return true;
  if (/^generated:/i.test(t)) return true;
  if (/^things to watch out for\b/i.test(t)) return true;
  if (/^wallet clusters\b/i.test(t)) return true;
  if (/^what this token is about$/i.test(t)) return true;
  if (/^public news events$/i.test(t)) return true;
  if (/^note:\s*$/i.test(t)) return true;
  if (/^heuristic only\b/i.test(t)) return true;
  if (/not financial advice/i.test(t)) return true;
  return false;
}

/**
 * True when a body line means the check/value is false / empty (no real-time hit).
 * Section titles above such-only bodies should NOT be dim-green.
 */
function isSectionBodyFalseOrEmptyLine(plain) {
  const t = String(plain || "").trim();
  if (!t) return true;
  if (isSectionBodyMetaLine(t)) return true;
  // Placeholder copy used across Alerts / Holders / Bundles / About
  if (/\bwill show here if value returns True\b/i.test(t)) return true;
  if (/\bwill show here after a full Analyze\b/i.test(t)) return true;
  if (/\bwill show here if\b/i.test(t)) return true;
  if (/\bwill show when\b/i.test(t)) return true;
  if (/\bwill show if\b/i.test(t)) return true;
  if (/^run analyze\b/i.test(t)) return true;
  if (/^unavailable\b/i.test(t)) return true;
  if (/^skipped\b/i.test(t)) return true;
  if (/\bcould not build\b/i.test(t)) return true;
  if (/\bno data\b/i.test(t)) return true;
  // Whole-line false / empty values (not mixed True/False status rows)
  if (/^(false|False|FALSE|n\/a|none|null|—|-)$/.test(t)) return true;
  if (/:\s*(false|False|FALSE|n\/a|none|null|—|-)\s*$/.test(t)) return true;
  // Pure "returns False" status (no accompanying real hit)
  if (/^[^:]*\breturns?\s+False\b\s*$/i.test(t)) return true;
  return false;
}

/**
 * Does this section have any real-time / real data (not all false placeholders)?
 * Scans body lines after titleIdx until the next major section title.
 */
function sectionHasRealData(plainLines, titleIdx) {
  const n = plainLines.length;
  let sawAny = false;
  let sawReal = false;
  for (let i = titleIdx + 1; i < n; i++) {
    const t = String(plainLines[i] || "").trim();
    if (!t) continue;
    if (isMajorSectionTitleLine(t)) break;
    if (isSectionBodyMetaLine(t)) continue;
    sawAny = true;
    if (!isSectionBodyFalseOrEmptyLine(t)) {
      sawReal = true;
      break;
    }
  }
  // No body at all → treat as empty/false (don't green)
  if (!sawAny) return false;
  return sawReal;
}

/**
 * Color major section titles only (dim green) — not field labels / subcategories.
 * Skip green when the section body is all false / empty / "will show if True"
 * (no real-time market / check data for that title).
 */
function colorAllSectionTitles(html) {
  if (!html) return html;
  const lines = html.split("\n");
  const plainLines = lines.map((line) => plainTextFromHtmlLine(line));
  return lines
    .map((line, idx) => {
      const plain = plainLines[idx];
      if (!isMajorSectionTitleLine(plain)) return line;
      // No real data under this title → leave default color (not green)
      if (!sectionHasRealData(plainLines, idx)) return line;
      // Preserve leading whitespace; wrap the rest
      const m = line.match(/^([ \t]*)([\s\S]*)$/);
      if (!m) return line;
      const indent = m[1] || "";
      const rest = m[2] || "";
      if (!rest.trim() || /bundle-cat-name|section-title-green/.test(rest)) {
        return line;
      }
      return (
        indent +
        '<span class="section-title-green bundle-cat-name section-title-major">' +
        rest +
        "</span>"
      );
    })
    .join("\n");
}

/** @deprecated name — use colorAllSectionTitles */
function colorBundlesCategoryNames(html) {
  return colorAllSectionTitles(html);
}

/**
 * Color "Same-slot multi-buys" title phrase dim green in Bundles text.
 * Matches the line header from bundles.py launch-window section.
 */
function colorBundlesSameSlotTitle(html) {
  if (!html) return html;
  return html
    .split("\n")
    .map((line) => {
      if (/bundle-same-slot-title|section-title-green/.test(line)) return line;
      // Plain or already-linkified line starting with optional spaces + Same-slot multi-buys
      if (!/Same-slot multi-buys/i.test(line)) return line;
      return line.replace(
        /(Same-slot multi-buys)/i,
        '<span class="section-title-green bundle-cat-name bundle-same-slot-title">$1</span>'
      );
    })
    .join("\n");
}

function formatBundlesRichHtml(text) {
  if (!text) return "";
  // Same address hold colors as Holders/Alerts (>5% yellow · >10% red · skip LP)
  let html = linkify(text, true);
  html = colorBundlesSelectivePcts(html);
  html = colorHoldingAmounts(html);
  html = colorAllSectionTitles(html);
  html = colorBundlesSameSlotTitle(html);
  return html;
}

function setPanelText(tab, text) {
  const el = $("text-" + tab);
  if (!el) return;
  let raw = text == null || text === "" ? "(empty)" : String(text);

  // Only skip rich colors when the report is huge (that freezes Opera).
  // Lite mode still gets green titles + % color bands for normal-sized text.
  const usePlain =
    raw.length > 80000 || (tab === "holders" && raw.length > 50000);

  if (usePlain) {
    const cap =
      tab === "holders" ? 100000 : tab === "alerts" ? 80000 : 120000;
    if (raw.length > cap) {
      raw =
        raw.slice(0, cap) +
        "\n\n… truncated for browser performance — open ?full=1 for full rich formatting …";
    }
    try {
      el.textContent = raw;
    } catch (_) {
      el.innerHTML = "";
      el.appendChild(document.createTextNode(raw));
    }
    return;
  }

  let html;
  try {
    if (tab === "holders") {
      // Wallet address: >5% yellow · >10% red · skip known LP
      html = formatHoldersRichHtml(raw);
    } else if (tab === "alerts") {
      // Total bundle % colored; Single holders total uncolored; no single-wallet list
      html = linkify(raw, true);
      html = colorAlertsSelectivePcts(html);
      html = colorHoldingAmounts(html);
      html = colorAllSectionTitles(html);
    } else if (tab === "about") {
      // About: green section titles (NARRATIVE / X / NEWS / LINKS / placeholders)
      html = linkify(raw, true);
      html = colorAllSectionTitles(html);
    } else if (tab === "bundles") {
      // Summary + each wallet group % colored; Top10 ex-LP uncolored; bal yellow
      // + wallet address hold colors
      html = formatBundlesRichHtml(raw);
    } else {
      // Overview, Maps, History text, etc.
      html = linkify(raw);
      html = colorAllSectionTitles(html);
    }
  } catch (err) {
    console.warn("[setPanelText rich]", tab, err);
    try {
      el.textContent = raw;
    } catch (_) {}
    return;
  }
  el.innerHTML = html;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.panel === name);
  });
}

/**
 * When Analyze/restore leaves Liq, Vol 24h, or 24h % as "—", pull from
 * public DexScreener token endpoint (no keys) and patch the summary bar.
 */
function enrichSummaryMarketFromDex(mint, data) {
  const addr = String(mint || "").trim();
  if (!addr || addr.length < 32) return;
  const url =
    "https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(addr);
  fetch(url, { method: "GET", mode: "cors", cache: "no-store" })
    .then(function (r) {
      if (!r || !r.ok) return null;
      return r.json();
    })
    .then(function (j) {
      if (!j || !Array.isArray(j.pairs) || !j.pairs.length) return;
      const want = addr.toLowerCase();
      const pairs = j.pairs.filter(function (p) {
        if (!p || typeof p !== "object") return false;
        const base = ((p.baseToken || {}).address || "").toLowerCase();
        const quote = ((p.quoteToken || {}).address || "").toLowerCase();
        return base === want || quote === want;
      });
      const list = pairs.length ? pairs : j.pairs;
      let bestLiq = 0;
      let sumVol = 0;
      let bestVol = 0;
      let bestChg = null;
      let bestChgVol = -1;
      let bestPrice = null;
      let bestMc = null;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const liqObj = p.liquidity || {};
        const pl =
          liqObj && typeof liqObj === "object"
            ? Number(liqObj.usd)
            : Number(liqObj);
        if (Number.isFinite(pl) && pl > bestLiq) bestLiq = pl;
        const volObj = p.volume || {};
        const pv =
          volObj && typeof volObj === "object"
            ? Number(volObj.h24)
            : Number(volObj);
        if (Number.isFinite(pv) && pv > 0) {
          sumVol += pv;
          if (pv > bestVol) bestVol = pv;
        }
        const pc = p.priceChange || {};
        const ch =
          pc && typeof pc === "object" ? Number(pc.h24) : Number(pc);
        if (Number.isFinite(ch)) {
          const score = Number.isFinite(pv) ? pv : 0;
          if (score >= bestChgVol) {
            bestChgVol = score;
            bestChg = ch;
          }
        }
        const pr = Number(p.priceUsd);
        if (Number.isFinite(pr) && pr > 0 && bestPrice == null) bestPrice = pr;
        const mc = Number(p.marketCap != null ? p.marketCap : p.fdv);
        if (Number.isFinite(mc) && mc > 0 && bestMc == null) bestMc = mc;
      }
      const fillVol = sumVol > 0 ? sumVol : bestVol;
      // Only patch empty cells — do not overwrite good server values
      const elLiq = $("sumLiq");
      const elVol = $("sumVol");
      const elChg = $("sumChg");
      const elPrice = $("sumPrice");
      const elMc = $("sumMc");
      const isBlank = function (el) {
        if (!el) return true;
        const t = String(el.textContent || "").trim();
        return !t || t === "—" || t === "-" || t === "n/a";
      };
      if (elLiq && isBlank(elLiq) && bestLiq > 0) {
        elLiq.textContent = fmtUsd(bestLiq);
      }
      if (elVol && isBlank(elVol) && fillVol > 0) {
        elVol.textContent = fmtUsd(fillVol);
      }
      if (elChg && isBlank(elChg) && bestChg != null) {
        elChg.textContent = fmtPct(bestChg);
        elChg.classList.remove("up", "down");
        if (Number(bestChg) > 0) elChg.classList.add("up");
        if (Number(bestChg) < 0) elChg.classList.add("down");
      }
      if (elPrice && isBlank(elPrice) && bestPrice != null) {
        elPrice.textContent = fmtUsd(bestPrice);
      }
      if (elMc && isBlank(elMc) && bestMc != null) {
        elMc.textContent = fmtUsd(bestMc);
      }
      // Keep in-memory payload so refresh restore also has numbers
      try {
        if (data && typeof data === "object") {
          if (!data.market || typeof data.market !== "object") data.market = {};
          if (bestLiq > 0 && data.market.liquidity_usd == null) {
            data.market.liquidity_usd = bestLiq;
          }
          if (fillVol > 0 && data.market.volume_h24_usd == null) {
            data.market.volume_h24_usd = fillVol;
          }
          if (bestChg != null) {
            if (!data.market.price_change_pct) data.market.price_change_pct = {};
            if (data.market.price_change_pct.h24 == null) {
              data.market.price_change_pct.h24 = bestChg;
            }
          }
        }
      } catch (_) {}
    })
    .catch(function () {
      /* ignore network / CORS */
    });
}

function renderSummary(data) {
  const bar = $("summaryBar");
  if (!data || !data.ok) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const m = data.market || {};
  const t = data.token || {};
  const name = t.name || m.name || "Token";
  const sym = t.symbol || m.symbol || "?";
  const chain = t.chain_id || m.chain_id || "";
  $("sumName").textContent = `${name} ($${sym}) · ${chain}`;
  // Token logo next to ticker / name
  const logoEl = $("sumLogo");
  const imgUrl = (
    t.image_url ||
    m.image_url ||
    (t.base_token && t.base_token.image_url) ||
    ""
  ).trim();
  if (logoEl) {
    if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
      logoEl.hidden = false;
      logoEl.alt = (sym || name || "token") + " logo";
      logoEl.onerror = () => {
        logoEl.hidden = true;
        logoEl.removeAttribute("src");
      };
      logoEl.src = imgUrl;
    } else {
      logoEl.hidden = true;
      logoEl.removeAttribute("src");
      logoEl.alt = "";
    }
  }
  const mint = (t.address || m.address || "").trim();
  const sumAddr = $("sumAddr");
  if (sumAddr) {
    // Top summary mint — yellow text link to Solscan (no raw URL shown)
    sumAddr.textContent = "";
    sumAddr.classList.remove("copy-mint");
    sumAddr.removeAttribute("data-copy");
    sumAddr.dataset.copyWired = "";
    if (mint) {
      const a = document.createElement("a");
      a.className = "sum-mint-link mono";
      a.href = "https://solscan.io/token/" + encodeURIComponent(mint);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = mint;
      a.title = "Open on Solscan";
      sumAddr.appendChild(a);
    }
  }
  const elPrice = $("sumPrice");
  const elMc = $("sumMc");
  if (elPrice) elPrice.textContent = fmtUsd(m.price_usd);
  if (elMc)
    elMc.textContent = fmtUsd(
      m.market_cap_usd != null ? m.market_cap_usd : m.fdv_usd
    );
  // Defensive multi-key extract for Liq / Vol 24h / 24h %
  const pickNum = function () {
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v == null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const liq = pickNum(
    m.liquidity_usd,
    m.liquidityUsd,
    m.liquidity != null && typeof m.liquidity === "object"
      ? m.liquidity.usd
      : m.liquidity,
    m.tvl,
    m.tvl_usd
  );
  const vol = pickNum(
    m.volume_h24_usd,
    m.volume24h,
    m.volume_h24,
    m.volume != null && typeof m.volume === "object" ? m.volume.h24 : m.volume,
    m.v24hUSD,
    m.volume24hUsd
  );
  const pcObj =
    m.price_change_pct && typeof m.price_change_pct === "object"
      ? m.price_change_pct
      : m.priceChange && typeof m.priceChange === "object"
        ? m.priceChange
        : {};
  const chg = pickNum(
    pcObj.h24,
    pcObj["24h"],
    m.price_change_h24_pct,
    m.priceChange24h,
    typeof m.price_change_pct === "number" ? m.price_change_pct : null
  );
  const elLiq = $("sumLiq");
  const elVol = $("sumVol");
  if (elLiq) elLiq.textContent = fmtUsd(liq);
  if (elVol) elVol.textContent = fmtUsd(vol);
  const chgEl = $("sumChg");
  if (chgEl) {
    chgEl.textContent = fmtPct(chg);
    chgEl.classList.remove("up", "down");
    if (Number(chg) > 0) chgEl.classList.add("up");
    if (Number(chg) < 0) chgEl.classList.add("down");
  }

  // Last-updated belongs under Fresh / Multi-send / Shared SOL (Bundles), not MC/Liq/Vol
  try {
    clearPrimaryMarketUpdatedStamps();
  } catch (_) {}

  // If server left Liq / Vol / 24h blank, fill from public DexScreener (browser)
  try {
    const needFill =
      liq == null || vol == null || chg == null;
    if (needFill && mint && mint.length >= 32) {
      enrichSummaryMarketFromDex(mint, data);
    }
  } catch (_) {}

  const linkBar = $("linkBar");
  linkBar.innerHTML = "";
  const links = data.links || {};
  // Hide raw metadata JSON URI (and similar) from the summary link bar
  const hideLinkKeys = new Set([
    "metadata_uri",
    "metadatauri",
    "metadata",
    "uri",
    "image",
    "image_uri",
    "imageuri",
  ]);
  const order = [
    "dexscreener",
    "dexscreener_chain",
    "solscan",
    "pumpfun",
    "pump",
    "explorer",
    "etherscan",
    "basescan",
    "arbiscan",
    "bubblemaps",
    "twitter",
    "x",
    "website",
    "telegram",
    "discord",
  ];
  const seen = new Set();
  function appendLinkBtn(key, url) {
    if (!url || hideLinkKeys.has(String(key).toLowerCase())) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "ext-link-btn";
    const meta = externalLinkMeta(key, url);
    a.classList.add("ext-link-" + meta.slug);
    a.title = meta.label + " — open in new tab";
    a.setAttribute("aria-label", meta.label);
    const icon = document.createElement("span");
    icon.className = "ext-link-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = meta.iconSvg;
    const lab = document.createElement("span");
    lab.className = "ext-link-label";
    lab.textContent = meta.label;
    a.appendChild(icon);
    a.appendChild(lab);
    linkBar.appendChild(a);
  }
  for (const k of order) {
    if (!links[k] || hideLinkKeys.has(String(k).toLowerCase())) continue;
    seen.add(k);
    appendLinkBtn(k, links[k]);
  }
  for (const [k, url] of Object.entries(links)) {
    if (seen.has(k) || !url) continue;
    if (hideLinkKeys.has(String(k).toLowerCase())) continue;
    appendLinkBtn(k, url);
  }

  if (data.disclaimer) $("disclaimer").textContent = data.disclaimer;
  if (data.generated_at) $("generatedAt").textContent = "Generated: " + data.generated_at;
}

/**
 * Display label + inline SVG logo for summary link-bar buttons.
 * Icons are simplified brand marks (16×16) for DexScreener / Solscan / X / Pump.fun.
 */
function externalLinkMeta(key, url) {
  const k = String(key || "").toLowerCase().replace(/[_\s-]+/g, "");
  const u = String(url || "").toLowerCase();
  // Detect from URL when key is generic (explorer, website, …)
  const isDex =
    k.indexOf("dexscreener") >= 0 || u.indexOf("dexscreener.com") >= 0;
  const isSolscan =
    k.indexOf("solscan") >= 0 || u.indexOf("solscan.io") >= 0;
  const isTwitter =
    k === "twitter" ||
    k === "x" ||
    u.indexOf("twitter.com") >= 0 ||
    u.indexOf("x.com/") >= 0;
  const isPump =
    k.indexOf("pump") >= 0 ||
    u.indexOf("pump.fun") >= 0 ||
    u.indexOf("pumpfun") >= 0;

  if (isDex) {
    // DexScreener brand (seeklogo): frontal white eagle head on dark
    return {
      slug: "dexscreener",
      label: "DexScreener",
      iconSvg:
        '<svg viewBox="0 0 32 32" width="12" height="12" xmlns="http://www.w3.org/2000/svg">' +
        // Outer white head silhouette (horns, dome, cheeks, jagged neck)
        '<path fill="#fff" d="' +
        "M16 3c2.6 0 4.7 1.1 5.9 2.85 1.15-.55 2.55-.5 3.35.45.55.65.45 1.45-.15 2.05" +
        "-.55.55-1.35.8-2.15.75.55 1.35.85 2.85.75 4.35-.2 2.9-1.85 5.35-4.55 6.85" +
        "L16 29l-3.15-8.7C10.15 18.8 8.5 16.35 8.3 13.45c-.1-1.5.2-3 .75-4.35" +
        "-.8.05-1.6-.2-2.15-.75-.6-.6-.7-1.4-.15-2.05.8-.95 2.2-1 3.35-.45" +
        "C11.3 4.1 13.4 3 16 3z" +
        '"/>' +
        // Brow / eye cutouts (dark)
        '<path fill="#1a1a1a" d="M10.2 10.6c1.5-1.4 3.2-2.1 5-2.1.15 1.2-.25 2.25-1.15 3.05' +
        "-.7.6-1.55.95-2.45 1.05l-1.4-2zM21.8 10.6c-1.5-1.4-3.2-2.1-5-2.1-.15 1.2.25 2.25 1.15 3.05" +
        '.7.6 1.55.95 2.45 1.05l1.4-2z"/>' +
        // Eyes
        '<ellipse cx="12.4" cy="12.35" rx="1.65" ry="1.2" fill="#1a1a1a"/>' +
        '<ellipse cx="19.6" cy="12.35" rx="1.65" ry="1.2" fill="#1a1a1a"/>' +
        // Beak pointing down
        '<path fill="#1a1a1a" d="M16 13.6c1.2.25 2 1.15 2.2 2.55.15 1.1-.25 2.35-1.2 3.4L16 21.5' +
        'l-1-1.95c-.95-1.05-1.35-2.3-1.2-3.4.2-1.4 1-2.3 2.2-2.55z"/>' +
        // Lower neck V
        '<path fill="#1a1a1a" d="M11.5 22.2 16 26.3l4.5-4.1c-1.2.85-2.75 1.3-4.5 1.3s-3.3-.45-4.5-1.3z"/>' +
        "</svg>",
    };
  }
  if (isSolscan) {
    return {
      slug: "solscan",
      label: "Solscan",
      iconSvg:
        '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="8" cy="8" r="7" fill="#14203A" stroke="#4C8DFF" stroke-width="1.2"/>' +
        '<path d="M5 6.2h6M5 8h6M5 9.8h4.2" stroke="#7EB6FF" stroke-width="1.2" stroke-linecap="round"/>' +
        '<circle cx="11.2" cy="11.2" r="2.1" stroke="#4C8DFF" stroke-width="1.1"/>' +
        '<path d="M12.6 12.6L14 14" stroke="#4C8DFF" stroke-width="1.2" stroke-linecap="round"/>' +
        "</svg>",
    };
  }
  if (isTwitter) {
    return {
      slug: "twitter",
      label: "Twitter",
      iconSvg:
        '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="1" y="1" width="14" height="14" rx="3" fill="#0F1419"/>' +
        '<path d="M3.6 3.6h2.2l2.05 2.85L10.2 3.6H12.4L9.05 7.55 12.55 12.4H10.35L7.95 9.15 5.2 12.4H3L6.7 7.7 3.6 3.6Z" fill="#E7E9EA"/>' +
        "</svg>",
    };
  }
  if (isPump) {
    // Pump.fun brand mark: pill capsule, left white / right green, rotated −22° (CCW)
    return {
      slug: "pumpfun",
      label: "Pump.fun",
      iconSvg:
        '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<g transform="rotate(-22 8 8)">' +
        // Full capsule base
        '<rect x="1.5" y="4.75" width="13" height="6.5" rx="3.25" fill="#1A1A1A"/>' +
        // Left half white
        '<path d="M1.5 8A3.25 3.25 0 0 1 4.75 4.75H8v6.5H4.75A3.25 3.25 0 0 1 1.5 8Z" fill="#FFFFFF"/>' +
        // Right half green
        '<path d="M8 4.75h3.25A3.25 3.25 0 0 1 14.5 8a3.25 3.25 0 0 1-3.25 3.25H8V4.75Z" fill="#86EF2A"/>' +
        // Center seam
        '<path d="M8 5.15v5.7" stroke="rgba(0,0,0,0.2)" stroke-width="0.55"/>' +
        "</g>" +
        "</svg>",
    };
  }
  // Generic label from key
  const pretty =
    String(key || "link")
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      }) || "Link";
  return {
    slug: "generic",
    label: pretty,
    iconSvg:
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M6.5 4H4.2A2.2 2.2 0 0 0 2 6.2v5.6A2.2 2.2 0 0 0 4.2 14h5.6A2.2 2.2 0 0 0 12 11.8V9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
      '<path d="M9 2h5v5M14 2L7.5 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>",
  };
}

function bunWalletLink(addr) {
  const w = String(addr || "").trim();
  if (!w) return "—";
  return (
    '<a class="wallet-link bun-wallet" href="https://solscan.io/account/' +
    encodeURIComponent(w) +
    '" target="_blank" rel="noopener noreferrer" title="' +
    escHtml(w) +
    '">' +
    escHtml(w) +
    "</a>"
  );
}

function bunPctHtml(n) {
  const x = Number(n);
  const cls = Number.isFinite(x) ? pctPriorityClass(x) : "";
  const label = fmtSupplyPct(n) || "—";
  return cls
    ? '<span class="' + cls + '">' + escHtml(label) + "</span>"
    : escHtml(label);
}

/** Unique-wallet sum of supply % (each address once at max hold %). */
function sumUniqueWalletSupplyPct(rows) {
  const by = Object.create(null);
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i] || {};
    // Normalize address so the same bag is never counted twice
    const w = String(row.wallet || row.owner || row.funder || row.sender || "")
      .trim();
    if (!w || w.length < 20) continue;
    const p = Number(
      row.pct_supply != null
        ? row.pct_supply
        : row.combined_pct != null
          ? row.combined_pct
          : row.funder_pct != null
            ? row.funder_pct
            : row.sender_pct
    );
    if (!Number.isFinite(p) || p <= 0) continue;
    by[w] = Math.max(by[w] || 0, p);
  }
  const keys = Object.keys(by);
  if (!keys.length) return null;
  let t = 0;
  for (let j = 0; j < keys.length; j++) t += by[keys[j]];
  if (t > 100) t = 100;
  return t > 0 ? Math.round(t * 10000) / 10000 : null;
}

/** Drop pure sol-* multi_send_wallets (Shared SOL pattern, not token multi-send). */
function tokenMultiSendWalletRows(view) {
  const v = view || {};
  const rows = [];
  const raw = v.multi_send_wallets || [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] || {};
    const roles = r.roles || [];
    const onlySol =
      roles.length &&
      roles.every(function (role) {
        return String(role || "").toLowerCase().indexOf("sol") === 0;
      });
    if (!onlySol) rows.push(r);
  }
  const tokenMs = v.multi_send_clusters || [];
  for (let ci = 0; ci < tokenMs.length; ci++) {
    const mc = tokenMs[ci] || {};
    if (mc.sender) {
      rows.push({ wallet: mc.sender, pct_supply: mc.sender_pct });
    }
    const recs = mc.receivers || [];
    for (let ri = 0; ri < recs.length; ri++) rows.push(recs[ri]);
  }
  return rows;
}

/**
 * Token multi-send total %: server summary, else unique sum of token wallets.
 * Never falls back to Shared SOL last-known.
 */
function resolveTokenMultiSendTotalPct(view, summary) {
  const s = summary || {};
  const recomputed = sumUniqueWalletSupplyPct(tokenMultiSendWalletRows(view));
  const server =
    s.multi_send_total_pct != null && Number.isFinite(Number(s.multi_send_total_pct))
      ? Number(s.multi_send_total_pct)
      : null;
  if (recomputed != null && (server == null || (server === 0 && recomputed > 0))) {
    return recomputed;
  }
  if (server != null) return server;
  return recomputed;
}

/**
 * Total bundle % = unique wallets (no double-count).
 *
 * Same rules as old similar-size + old suspect for the Total (bundle %) box:
 *   • Multi-account always counts
 *   • Fresh / Multi-send / Shared SOL only when that Analyze checkbox was ON
 *   • Suspect (similar-size + Rugcheck insider) only when ALL three optionals
 *     are OFF (classic similar + suspect fallback)
 */
function recomputeTotalBundleFromView(view, summary) {
  const s = summary || {};
  const v = view || {};

  function flagOn(serverKey, checkboxFn) {
    if (s[serverKey] === true) return true;
    if (s[serverKey] === false) return false;
    try {
      return typeof checkboxFn === "function" ? !!checkboxFn() : false;
    } catch (_) {
      return false;
    }
  }

  const countFresh = flagOn("total_bundle_include_fresh", useFreshEnabled);
  const countMs = flagOn("total_bundle_include_multi_send", useMultiSendEnabled);
  const countSol = flagOn(
    "total_bundle_include_shared_sol",
    useSharedSolEnabled
  );
  const anyOptionalOn = countFresh || countMs || countSol;
  // Prefer server fallback flag when present (from last Analyze)
  const countSuspect =
    s.total_bundle_show_similar_suspect != null
      ? !!s.total_bundle_show_similar_suspect
      : !anyOptionalOn;

  const rows = [];
  function pushWalletObj(r) {
    if (r == null) return;
    if (typeof r === "string") {
      rows.push({ wallet: r, pct_supply: null });
      return;
    }
    rows.push(r);
  }

  // Multi-account always in Total
  const clusters = v.clusters || [];
  for (let i = 0; i < clusters.length; i++) pushWalletObj(clusters[i]);

  if (countFresh) {
    const fresh = v.fresh_wallets || [];
    for (let i = 0; i < fresh.length; i++) pushWalletObj(fresh[i]);
  }
  if (countMs) {
    const msRows = tokenMultiSendWalletRows(v);
    for (let i = 0; i < msRows.length; i++) pushWalletObj(msRows[i]);
  }
  if (countSol) {
    const fund = v.funding_clusters || [];
    for (let i = 0; i < fund.length; i++) {
      const fc = fund[i] || {};
      pushWalletObj({
        wallet: fc.funder || fc.sender,
        pct_supply: fc.funder_pct != null ? fc.funder_pct : fc.sender_pct,
      });
      const kids = fc.children || fc.child_rows || [];
      for (let j = 0; j < kids.length; j++) pushWalletObj(kids[j]);
    }
    const solMs = v.sol_multi_send_clusters || [];
    for (let i = 0; i < solMs.length; i++) {
      const mc = solMs[i] || {};
      pushWalletObj({
        wallet: mc.sender || mc.funder,
        pct_supply: mc.sender_pct != null ? mc.sender_pct : mc.funder_pct,
      });
      const recs = mc.receivers || mc.children || [];
      for (let j = 0; j < recs.length; j++) pushWalletObj(recs[j]);
    }
  }
  // Suspect (= similar-size + Rugcheck insider) — same fallback as old
  // similar-size AND old suspect: only when all optionals off
  if (countSuspect) {
    const sims = v.similar_size_groups || [];
    for (let i = 0; i < sims.length; i++) {
      const g = sims[i] || {};
      const mem = g.members || g.wallets || [];
      for (let j = 0; j < mem.length; j++) {
        const m = mem[j];
        if (m && typeof m === "object") pushWalletObj(m);
        else pushWalletObj({ wallet: m, pct_supply: g.avg_pct });
      }
    }
    const ins = v.insider_wallets || [];
    for (let i = 0; i < ins.length; i++) pushWalletObj(ins[i]);
  }

  // Unique wallets only — never sum category boxes (that double-counts)
  const unique = sumUniqueWalletSupplyPct(rows);
  const server =
    s.total_bundle_pct != null && Number.isFinite(Number(s.total_bundle_pct))
      ? Number(s.total_bundle_pct)
      : null;
  const flagsAlign =
    (s.total_bundle_include_fresh == null ||
      s.total_bundle_include_fresh === countFresh) &&
    (s.total_bundle_include_multi_send == null ||
      s.total_bundle_include_multi_send === countMs) &&
    (s.total_bundle_include_shared_sol == null ||
      s.total_bundle_include_shared_sol === countSol) &&
    (s.total_bundle_show_similar_suspect == null ||
      !!s.total_bundle_show_similar_suspect === countSuspect);

  let total;
  if (unique != null && rows.length > 0) {
    // Client unique from listed bags is the truth (no duplicate wallets)
    total = unique;
    // Server may know wallets not in the slim UI lists — only lift when higher
    // and still unique (server already unique-deduped) and flags match
    if (server != null && flagsAlign && server > total + 0.0001) {
      total = server;
    }
  } else if (server != null) {
    total = server;
  } else {
    total = 0;
  }
  if (total > 100) total = 100;
  if (total < 0) total = 0;
  return Math.round(total * 10000) / 10000;
}

/**
 * Hold-% colors for Bundles top boxes (Multi-send / Shared SOL / etc.).
 * Same bands as Holders, but any positive bag gets at least green so small
 * multi-send / shared SOL totals still show the scheme.
 *   >0 green · >5 yellow · ≥10 orange · ≥15 red
 */
function bunPctHtmlBox(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return escHtml("—");
  const label = fmtSupplyPct(n) || "—";
  let cls = "";
  if (x >= 15) cls = "pct-critical";
  else if (x >= 10) cls = "pct-high";
  else if (x > 5) cls = "pct-medium";
  else if (x > 0) cls = "pct-low";
  return cls
    ? '<span class="' + cls + '">' + escHtml(label) + "</span>"
    : '<span class="bun-pct-zero">' + escHtml(label) + "</span>";
}

/**
 * Bundle risk score color bands (user scheme):
 *   1–25 green · 25–50 yellow · 50–75 orange · 75–100 red
 * Boundaries: ≤25 green, ≤50 yellow, ≤75 orange, else red.
 */
function bundleRiskScoreClass(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return "risk-score-green";
  if (n <= 25) return "risk-score-green";
  if (n <= 50) return "risk-score-yellow";
  if (n <= 75) return "risk-score-orange";
  return "risk-score-red";
}

function bunEmptySection(title, hint) {
  return (
    '<section class="bun-section">' +
    '<div class="bun-section-head">' +
    '<span class="bun-section-title">' +
    escHtml(title) +
    "</span></div>" +
    '<p class="bun-empty">' +
    escHtml(hint || "None found this scan.") +
    "</p></section>"
  );
}

function bunWalletTable(rows, cols) {
  // cols: [{key, label, render?}]
  if (!rows || !rows.length) return "";
  let h =
    '<table class="bun-table"><thead><tr>' +
    cols.map((c) => "<th>" + escHtml(c.label) + "</th>").join("") +
    "</tr></thead><tbody>";
  for (const row of rows) {
    h += "<tr>";
    for (const c of cols) {
      const raw = row[c.key];
      const cell =
        typeof c.render === "function"
          ? c.render(raw, row)
          : escHtml(raw == null ? "—" : String(raw));
      h += "<td>" + cell + "</td>";
    }
    h += "</tr>";
  }
  h += "</tbody></table>";
  return h;
}

/** JSON-safe clone (drops non-serializable junk that breaks localStorage). */
function jsonClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (_) {
    return null;
  }
}

/**
 * localStorage setItem with quota recovery.
 * Never delete delta / last-Analyze keys when recovering — those are what
 * refresh restore needs (old path wiped them and cleared Bundles + arrows).
 */
function safeLocalStorageSet(key, raw) {
  try {
    localStorage.setItem(key, raw);
    return true;
  } catch (err) {
    try {
      const drop = [
        BUNDLE_STATS_BAR_SNAP_KEY,
        "adtc_history_log_backup",
        "adtc_debug",
        "adtc_tmp",
      ];
      for (const k of drop) {
        try {
          localStorage.removeItem(k);
        } catch (_) {
          /* ignore */
        }
      }
      // Only drop the secondary full-payload key if we are not writing it
      if (key !== LAST_BUNDLES_ANALYZE_KEY) {
        try {
          localStorage.removeItem(LAST_BUNDLES_ANALYZE_KEY);
        } catch (_) {
          /* ignore */
        }
      }
      try {
        sessionStorage.removeItem(BUNDLE_STATS_BAR_SNAP_KEY);
      } catch (_) {
        /* ignore */
      }
      localStorage.setItem(key, raw);
      return true;
    } catch (err2) {
      console.error("[localStorage] set failed", key, err2 || err);
      return false;
    }
  }
}

/** sessionStorage set (survives refresh in the same tab). */
function safeSessionStorageSet(key, raw) {
  try {
    sessionStorage.setItem(key, raw);
    return true;
  } catch (_) {
    try {
      sessionStorage.removeItem(BUNDLE_STATS_BAR_SNAP_KEY);
      sessionStorage.setItem(key, raw);
      return true;
    } catch (_) {
      return false;
    }
  }
}

/** Truncate long report text so localStorage quota is not blown. */
function truncateSectionText(s, maxLen) {
  const lim = maxLen != null ? maxLen : 12000;
  if (s == null) return null;
  const t = String(s);
  if (t.length <= lim) return t;
  return t.slice(0, lim) + "\n… (truncated for browser storage)";
}

/** Shrink bundles_view for storage (keep summary + short lists). */
function slimBundlesViewForStorage(bv) {
  if (!bv || typeof bv !== "object") return null;
  const c = jsonClone(bv);
  if (!c) return null;
  const caps = {
    clusters: 8,
    similar_size_groups: 6,
    insider_wallets: 12,
    funding_clusters: 6,
    fresh_wallets: 16,
    multi_send_clusters: 6,
    multi_send_wallets: 20,
    sol_multi_send_clusters: 6,
    suspect_wallets: 16,
    signals: 8,
    single_holders: 200,
  };
  for (const [k, n] of Object.entries(caps)) {
    if (Array.isArray(c[k]) && c[k].length > n) c[k] = c[k].slice(0, n);
  }
  for (const heavy of [
    "raw",
    "debug",
    "holder_rows",
    "all_holders",
    "transactions",
    "tx_sample",
  ]) {
    if (c[heavy] != null) delete c[heavy];
  }
  if (c.summary && typeof c.summary === "object") {
    delete c.summary._ui_stats_bar_html;
  }
  return c;
}

/** Summary-only bundles_view (stats bar always works after refresh). */

/** Per-tab text storage (avoids one huge last-Analyze blob dropping Maps/About). */
const SECTION_STORE_KEYS = {
  overview: "adtc_sec_overview",
  holders: "adtc_sec_holders",
  bundles: "adtc_sec_bundles",
  alerts: "adtc_sec_alerts",
  maps: "adtc_sec_maps",
  about: "adtc_sec_about",
};

function saveSectionsSeparately(sections) {
  if (!sections || typeof sections !== "object") return;
  const now = Date.now();
  for (const [tab, key] of Object.entries(SECTION_STORE_KEYS)) {
    try {
      const raw = sections[tab];
      if (raw == null || !String(raw).trim()) continue;
      const text = truncateSectionText(raw, 20000);
      const payload = JSON.stringify({ savedAt: now, text: text });
      safeLocalStorageSet(key, payload);
      safeSessionStorageSet(key, payload);
    } catch (_) {
      /* ignore */
    }
  }
}

function loadSectionText(tab) {
  const key = SECTION_STORE_KEYS[tab];
  if (!key) return null;
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(key);
      if (!raw) continue;
      const o = JSON.parse(raw);
      if (o && o.text && String(o.text).trim()) return String(o.text);
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/**
 * Mount Bundles top stats with pure DOM textContent so deltas cannot be
 * stripped by HTML sanitization / string assembly bugs.
 * items: [{label, valueText, valueClass, deltaText, deltaCls, sub}]
 */
function mountBundleStatsBar(mountEl, items, version) {
  if (!mountEl) return;
  while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);

  const note = document.createElement("div");
  note.className = "bun-delta-note";
  note.id = "bunDeltaNote";
  note.textContent =
    "Since last Analyze · " + (version || "?");
  mountEl.appendChild(note);

  const grid = document.createElement("div");
  grid.className = "bun-stats";
  grid.setAttribute("data-adtc-deltas", "1");

  (items || []).forEach((it) => {
    if (!it) return;
    const box = document.createElement("div");
    box.className = "bun-stat";
    box.setAttribute("data-bun-stat", String(it.label || ""));

    const isScoreBox =
      it.isScore === true ||
      String(it.label || "").toLowerCase() === "risk" ||
      it.key === "risk";

    // Classic marker text from compute: "▲ +3%" / "▼ −1%" / "· 0%"
    let dText = it.deltaText != null ? String(it.deltaText).trim() : "";
    dText = dText.replace(/^\(|\)$/g, "").trim();
    // Normalize legacy UP/DN
    dText = dText.replace(/^UP\s*/i, "\u25B2 ").replace(/^DN\s*/i, "\u25BC ");
    if (!dText || /no change/i.test(dText)) {
      dText = isScoreBox ? "· 0" : "· 0%";
    }
    if (isScoreBox) {
      // Risk: points only — strip any %
      dText = dText.replace(/%/g, "").replace(/\u00b7\s*0%?/, "· 0");
    }
    const isFlat =
      /^\u00b7/.test(dText) ||
      dText === "0" ||
      dText === "0%" ||
      /^[+\-\u2212]?\s*0(\.0+)?%?$/.test(dText);
    const isUp = /[\u25B2▲]/.test(dText);
    const isDn = /\u25BC|^▼/.test(dText);

    let dCls = String(it.deltaCls || "");
    if (isFlat) dCls = "bun-delta-green";
    else if (isDn) dCls = dCls || "bun-delta-red";
    else if (isUp) dCls = dCls || "bun-delta-green";
    else dCls = dCls || "bun-delta-green";

    const lab = document.createElement("span");
    lab.className = "bun-stat-label";
    lab.textContent = String(it.label || "");

    const val = document.createElement("span");
    // Put color class on both value shell and main text so % bands always win CSS
    const vCls = it.valueClass ? String(it.valueClass).trim() : "";
    val.className = "bun-stat-value" + (vCls ? " " + vCls : "");

    const main = document.createElement("span");
    if (vCls) main.className = vCls;
    main.textContent = String(it.valueText != null ? it.valueText : "—");

    // Classic: 12% ▲ +3%  (value then space then arrow delta — no parens)
    const dlt = document.createElement("span");
    dlt.className = "bun-stat-delta " + dCls;
    dlt.textContent = " " + dText;
    dlt.title = isScoreBox
      ? "Risk score change (points)"
      : "Change since last Analyze";

    val.appendChild(main);
    val.appendChild(dlt);
    box.appendChild(lab);
    box.appendChild(val);

    if (it.sub != null && String(it.sub).trim() !== "") {
      const sub = document.createElement("span");
      sub.className = "bun-stat-sub";
      sub.textContent = String(it.sub);
      sub.title = String(it.sub).replace(/\n/g, " ");
      box.appendChild(sub);
    }
    grid.appendChild(box);
  });

  mountEl.appendChild(grid);
}

function summaryOnlyBundlesView(bv) {
  if (!bv || typeof bv !== "object") return null;
  const c = jsonClone(bv) || {};
  const out = {
    ok: c.ok !== false,
    error: c.error || null,
    method: c.method || null,
    source: c.source || null,
    token_address: c.token_address || null,
    summary: c.summary && typeof c.summary === "object" ? c.summary : {},
  };
  if (out.summary) delete out.summary._ui_stats_bar_html;
  // Keep short list slices so Single / Multi / Similar still paint after quota slim
  function keepList(key, n) {
    if (Array.isArray(c[key]) && c[key].length) {
      out[key] = c[key].slice(0, n);
    }
  }
  keepList("single_holders", 80);
  keepList("clusters", 8);
  keepList("similar_size_groups", 4);
  keepList("insider_wallets", 12);
  keepList("fresh_wallets", 12);
  keepList("multi_send_wallets", 16);
  keepList("funding_clusters", 4);
  return out;
}

/**
 * Write payload to localStorage + sessionStorage for one or more keys.
 * Returns true if at least one write succeeded.
 */

/** IndexedDB fallback when localStorage quota fails (survives refresh). */
const ADTC_IDB_NAME = "adtc_persist_v1";
const ADTC_IDB_STORE = "kv";

/** Race a promise so hung IndexedDB / network cannot freeze boot forever. */
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(fallback);
        }
      }
    );
  });
}

function openAdtcIdb() {
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        if (!window.indexedDB) {
          reject(new Error("no idb"));
          return;
        }
        const req = indexedDB.open(ADTC_IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(ADTC_IDB_STORE)) {
            db.createObjectStore(ADTC_IDB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("idb open failed"));
        req.onblocked = () => reject(new Error("idb blocked"));
      } catch (err) {
        reject(err);
      }
    }),
    2500,
    null
  ).then((db) => {
    if (!db) throw new Error("idb timeout");
    return db;
  });
}

function idbSet(key, value) {
  return openAdtcIdb()
    .then(
      (db) =>
        new Promise((resolve) => {
          try {
            const tx = db.transaction(ADTC_IDB_STORE, "readwrite");
            tx.objectStore(ADTC_IDB_STORE).put(value, key);
            tx.oncomplete = () => {
              try {
                db.close();
              } catch (_) {}
              resolve(true);
            };
            tx.onerror = () => {
              try {
                db.close();
              } catch (_) {}
              resolve(false);
            };
          } catch (_) {
            resolve(false);
          }
        })
    )
    .catch(() => false);
}

function idbGet(key) {
  return openAdtcIdb()
    .then(
      (db) =>
        new Promise((resolve) => {
          try {
            const tx = db.transaction(ADTC_IDB_STORE, "readonly");
            const req = tx.objectStore(ADTC_IDB_STORE).get(key);
            req.onsuccess = () => {
              const v = req.result;
              try {
                db.close();
              } catch (_) {}
              resolve(v == null ? null : v);
            };
            req.onerror = () => {
              try {
                db.close();
              } catch (_) {}
              resolve(null);
            };
          } catch (_) {
            resolve(null);
          }
        })
    )
    .catch(() => null);
}

function persistAnalyzePayload(keys, obj) {
  let raw;
  try {
    raw = JSON.stringify(obj);
  } catch (err) {
    console.warn("[persistAnalyzePayload] stringify failed", err);
    return false;
  }
  if (raw.length > 4 * 1024 * 1024) return false;
  let ok = false;
  for (const k of keys) {
    if (safeLocalStorageSet(k, raw)) ok = true;
    if (safeSessionStorageSet(k, raw)) ok = true;
    // IndexedDB (async) — best-effort; survives when localStorage is full
    try {
      idbSet(k, raw);
    } catch (_) {
      /* ignore */
    }
  }
  // Always also store under primary key in IDB for restoreLastAnalyzeAsync
  try {
    idbSet(LAST_ANALYZE_KEY, raw);
    idbSet(LAST_BUNDLES_ONLY_KEY, raw);
  } catch (_) {
    /* ignore */
  }
  return ok;
}

/**
 * Persist last successful Analyze for all tabs after page refresh.
 * Always keeps at least a tiny Bundles summary + delta backup (session + local).
 */
function saveLastAnalyze(data, query) {
  if (!data || !data.ok) return false;
  try {
    const sections = data.sections || {};
    let bundleDelta = null;
    try {
      bundleDelta = data._bundleDeltaPair
        ? jsonClone(data._bundleDeltaPair)
        : null;
    } catch (_) {
      bundleDelta = data._bundleDeltaPair || null;
    }
    if (!bundleDelta) {
      try {
        const mint =
          (data.token && data.token.address) ||
          (data.market && data.market.address) ||
          "";
        const e = mint ? getBundleStatsEntry(mint) : null;
        const htmlByKey =
          (mint && loadBundleDeltaHtml(mint)) ||
          loadBundleDeltaHtml("last") ||
          (data.bundles_view &&
            data.bundles_view.summary &&
            data.bundles_view.summary._ui_delta_html) ||
          null;
        bundleDelta = {
          mint: bundleStatsMintKey(mint) || "last",
          forNext: e && e.forNext,
          deltaFrom: e && e.deltaFrom,
          deltaCur: e && e.deltaCur,
          htmlByKey: htmlByKey || null,
        };
      } catch (_) {
        bundleDelta = null;
      }
    }

    // Always slim — full wallet lists + monospaced reports blow quota.
    let bundlesView = slimBundlesViewForStorage(data.bundles_view);
    if (!bundlesView && data.bundles_view) {
      bundlesView = summaryOnlyBundlesView(data.bundles_view);
    }
    try {
      if (
        bundlesView &&
        bundlesView.summary &&
        bundleDelta &&
        bundleDelta.htmlByKey
      ) {
        bundlesView.summary._ui_delta_html = bundleDelta.htmlByKey;
        delete bundlesView.summary._ui_stats_bar_html;
      }
    } catch (_) {
      /* ignore */
    }

    const mintAddr =
      (data.token && data.token.address) ||
      (data.market && data.market.address) ||
      "";
    const chainId =
      (data.token && data.token.chain_id) ||
      (data.market && data.market.chain_id) ||
      "";
    const q = (query || "").trim();
    const marketSlim = jsonClone(data.market) || data.market || null;
    const tokenSlim = jsonClone(data.token) || data.token || null;

    // Build section pack — always keep every tab (truncated), never drop maps/about.
    function sectionPack(maxEach) {
      const m = maxEach != null ? maxEach : 10000;
      return {
        overview: truncateSectionText(sections.overview, m),
        holders: truncateSectionText(sections.holders, m),
        bundles: truncateSectionText(sections.bundles, m),
        alerts: truncateSectionText(sections.alerts, Math.min(m, 10000)),
        maps: truncateSectionText(sections.maps, Math.min(m, 8000)),
        about: truncateSectionText(sections.about, Math.min(m, 12000)),
      };
    }

    // 1) Full multi-tab payload first (progressive size cut) — primary restore source
    const buildFull = (level) => {
      const maxSec = level === 0 ? 14000 : level === 1 ? 8000 : level === 2 ? 4000 : 2500;
      const bv =
        level >= 3 ? summaryOnlyBundlesView(bundlesView) : bundlesView;
      return {
        savedAt: Date.now(),
        query: q,
        chain: chainId,
        bundleDelta: bundleDelta,
        data: {
          ok: true,
          _restoredFromBrowserCache: true,
          generated_at: data.generated_at || new Date().toISOString(),
          _marketUpdatedAt: data.generated_at || new Date().toISOString(),
          quick: !!(data.quick || data._phase === "quick"),
          _phase: data._phase || null,
          market: marketSlim,
          token: tokenSlim,
          links: level <= 1 ? jsonClone(data.links) || data.links || null : null,
          holders: null,
          bundles: null,
          bundles_view: bv,
          alerts: null,
          alerts_meta:
            level === 0
              ? jsonClone(data.alerts_meta) || data.alerts_meta || null
              : null,
          history_meta: null,
          bundleDelta: bundleDelta,
          sections: sectionPack(maxSec),
        },
      };
    };

    let anySaved = false;
    let fullSaved = false;
    for (let level = 0; level <= 3; level++) {
      try {
        const obj = buildFull(level);
        if (
          persistAnalyzePayload(
            [LAST_ANALYZE_KEY, LAST_BUNDLES_ANALYZE_KEY],
            obj
          )
        ) {
          fullSaved = true;
          anySaved = true;
          break;
        }
      } catch (err) {
        console.warn("[saveLastAnalyze] full attempt failed", level, err);
      }
    }

    // 2) Bundles-focused backup (cards + main text tabs)
    try {
      const bundlesOnly = {
        savedAt: Date.now(),
        query: q,
        chain: chainId,
        mint: mintAddr,
        bundleDelta: bundleDelta,
        data: {
          ok: true,
          _restoredFromBrowserCache: true,
          generated_at: data.generated_at || new Date().toISOString(),
          _marketUpdatedAt: data.generated_at || new Date().toISOString(),
          market: marketSlim,
          token: tokenSlim,
          bundles_view: bundlesView,
          sections: sectionPack(6000),
          bundleDelta: bundleDelta,
        },
      };
      if (persistAnalyzePayload([LAST_BUNDLES_ONLY_KEY], bundlesOnly)) {
        anySaved = true;
      }
    } catch (err) {
      console.error("[saveLastAnalyze] bundles-only backup failed", err);
    }

    // 3) Micro only if nothing landed — last resort (still keep all section keys if possible)
    if (!anySaved) {
      try {
        const micro = {
          savedAt: Date.now(),
          query: q,
          chain: chainId,
          mint: mintAddr,
          bundleDelta: bundleDelta,
          data: {
            ok: true,
            _restoredFromBrowserCache: true,
            generated_at: data.generated_at || new Date().toISOString(),
            _marketUpdatedAt: data.generated_at || new Date().toISOString(),
            market: marketSlim,
            token: tokenSlim,
            bundles_view: summaryOnlyBundlesView(bundlesView || data.bundles_view),
            sections: sectionPack(2000),
            bundleDelta: bundleDelta,
          },
        };
        if (
          persistAnalyzePayload(
            [LAST_BUNDLES_ONLY_KEY, LAST_ANALYZE_KEY, LAST_BUNDLES_ANALYZE_KEY],
            micro
          )
        ) {
          anySaved = true;
        }
      } catch (err) {
        console.error("[saveLastAnalyze] micro backup failed", err);
      }
    }

    // Keep delta HTML map in sync (small, separate key)
    try {
      const hk =
        (bundleDelta && bundleDelta.htmlByKey) ||
        (data.bundles_view &&
          data.bundles_view.summary &&
          data.bundles_view.summary._ui_delta_html) ||
        null;
      if (hk && typeof hk === "object") {
        const m = bundleStatsMintKey(mintAddr) || "last";
        saveBundleDeltaHtml(m, hk);
        saveBundleDeltaHtml("last", hk);
        try {
          sessionStorage.setItem("adtc_delta_html_last", JSON.stringify(hk));
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* ignore */
    }

    if (!fullSaved) {
      console.warn(
        "[saveLastAnalyze] full payload not saved; micro/bundles backup:",
        anySaved
      );
    } else {
      try {
        console.info(
          "[saveLastAnalyze] ok",
          "mint=",
          (mintAddr || "").slice(0, 8),
          "deltaKeys=",
          bundleDelta && bundleDelta.htmlByKey
            ? Object.keys(bundleDelta.htmlByKey).length
            : 0
        );
      } catch (_) {
        /* ignore */
      }
    }
    return anySaved;
  } catch (err) {
    console.error("[saveLastAnalyze] failed", err);
    return false;
  }
}

/** @deprecated use saveLastAnalyze */
function saveLastBundlesAnalyze(data, query) {
  saveLastAnalyze(data, query);
}

function parseLastAnalyzeRaw(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || !parsed.data || !parsed.data.ok) return null;
    const d = parsed.data;
    if (!d.bundles_view && !(d.sections && d.sections.bundles) && !d.market) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function scoreLastAnalyzePayload(parsed) {
  if (!parsed || !parsed.data || !parsed.data.ok) return -1;
  const d = parsed.data;
  const sec = d.sections || {};
  let score = 0;
  if (d.bundles_view) score += 20;
  if (d.bundles_view && d.bundles_view.summary) score += 10;
  if (d.market) score += 3;
  if (d.token) score += 3;
  for (const k of ["overview", "holders", "bundles", "alerts", "maps", "about"]) {
    if (sec[k] && String(sec[k]).length > 20) score += 5;
    if (sec[k] && String(sec[k]).length > 500) score += 3;
  }
  if (parsed.bundleDelta && parsed.bundleDelta.htmlByKey) score += 4;
  if (parsed.savedAt) score += Math.min(5, Number(parsed.savedAt) / 1e15);
  return score;
}

function loadLastAnalyze() {
  const keys = [
    LAST_ANALYZE_KEY,
    LAST_BUNDLES_ANALYZE_KEY,
    LAST_BUNDLES_ONLY_KEY,
  ];
  const candidates = [];
  try {
    for (const k of keys) {
      try {
        const hit = parseLastAnalyzeRaw(localStorage.getItem(k));
        if (hit) candidates.push(hit);
      } catch (_) {}
    }
    for (const k of keys) {
      try {
        const hit = parseLastAnalyzeRaw(sessionStorage.getItem(k));
        if (hit) candidates.push(hit);
      } catch (_) {}
    }
  } catch (_) {
    /* ignore */
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreLastAnalyzePayload(b) - scoreLastAnalyzePayload(a));
  return candidates[0];
}

/** Async load including IndexedDB (used on page boot). */
async function loadLastAnalyzeAsync() {
  const sync = loadLastAnalyze();
  if (sync) return sync;
  const keys = [
    LAST_ANALYZE_KEY,
    LAST_BUNDLES_ANALYZE_KEY,
    LAST_BUNDLES_ONLY_KEY,
  ];
  for (const k of keys) {
    try {
      const raw = await idbGet(k);
      const hit = parseLastAnalyzeRaw(raw);
      if (hit) {
        // Re-seed session/local so subsequent sync loads work
        try {
          const s =
            typeof raw === "string" ? raw : JSON.stringify(raw);
          safeSessionStorageSet(k, s);
          safeLocalStorageSet(k, s);
        } catch (_) {
          /* ignore */
        }
        return hit;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function loadLastBundlesAnalyze() {
  return loadLastAnalyze();
}

/**
 * Restore all Analyze tabs from browser last-known result after refresh.
 * Does not re-log History or re-process Ruggers (lookup_count).
 */
function restoreLastAnalyze(cachedOpt) {
  const cached = cachedOpt || loadLastAnalyze();
  if (!cached || !cached.data) {
    // Still show Ruggers / History from their own stores
    try {
      refreshRuggersPanel();
    } catch (_) {
      /* ignore */
    }
    try {
      refreshHistoryPanel();
    } catch (_) {
      /* ignore */
    }
    return false;
  }
  try {
    const data = cached.data;
    data._restoredFromBrowserCache = true;
    if (cached.bundleDelta) {
      data.bundleDelta = cached.bundleDelta;
    }
    if (
      data.bundles_view &&
      data.bundles_view.summary &&
      cached.bundleDelta &&
      cached.bundleDelta.htmlByKey
    ) {
      data.bundles_view.summary._ui_delta_html = cached.bundleDelta.htmlByKey;
    }
    if (cached.query && $("query") && !$("query").value.trim()) {
      $("query").value = cached.query;
    }
    // Ensure mint address exists for Ruggers / delta map lookup
    try {
      const q = String(cached.query || data.query || "").trim();
      const tok = data.token && typeof data.token === "object" ? data.token : {};
      const mkt = data.market && typeof data.market === "object" ? data.market : {};
      if (!tok.address && !mkt.address && q && q.length >= 32 && !/\s/.test(q)) {
        data.token = { ...tok, address: q };
      }
    } catch (_) {
      /* ignore */
    }
    if (cached.chain && $("chain")) {
      try {
        $("chain").value = cached.chain;
      } catch (_) {
        /* ignore */
      }
    }
    try {
      // Stamp restore time so MC / Liq / Vol show “Last updated · …”
      if (cached.savedAt) data._restoredSavedAt = cached.savedAt;
      if (!data.generated_at && cached.savedAt) {
        try {
          data.generated_at = new Date(cached.savedAt).toISOString();
        } catch (_) {
          data.generated_at = data.generated_at || null;
        }
      }
      data._marketUpdatedAt =
        data.generated_at || data._restoredSavedAt || null;
      renderSummary(data);
    } catch (err) {
      console.error("[restore summary]", err);
    }
    const when = cached.savedAt
      ? new Date(cached.savedAt).toLocaleString()
      : "previous Analyze";
    const lastKnownLine =
      "── Last known (page refresh) · " +
      when +
      " · Run Analyze for live update ──\n\n";
    const sections = data.sections || {};
    for (const tab of TABS) {
      if (tab === "history" || tab === "ruggers" || tab === "bundles") continue;
      try {
        let body = sections[tab] && String(sections[tab]).trim()
          ? String(sections[tab])
          : loadSectionText(tab);
        if (body && String(body).trim()) {
          setPanelText(tab, lastKnownLine + String(body));
        } else {
          setPanelText(
            tab,
            lastKnownLine +
              "(This tab was not kept in browser storage for the last Analyze.\n" +
              "Run Analyze again to refill Overview / Holders / Alerts / Maps / About.)\n"
          );
        }
      } catch (_) {
        /* ignore */
      }
    }
    // Bundles UI (cards)
    try {
      if (data.bundles_view) {
        renderBundlesUi(data);
      } else if (sections.bundles) {
        setPanelText("bundles", lastKnownLine + String(sections.bundles));
      }
    } catch (err) {
      console.error("[bundles ui restore]", err);
      try {
        if (sections.bundles) {
          setPanelText("bundles", lastKnownLine + String(sections.bundles));
        }
      } catch (_) {
        /* ignore */
      }
    }
    // Ruggers (separate localStorage track — always try to show)
    try {
      const mint =
        (data.token && data.token.address) ||
        (data.market && data.market.address) ||
        "";
      const chain =
        (data.token && data.token.chain_id) ||
        (data.market && data.market.chain_id) ||
        "solana";
      if (mint) {
        refreshRuggersPanel(mintKeyFromToken(mint, chain));
      } else {
        refreshRuggersPanel();
      }
    } catch (err) {
      console.error("[ruggers restore]", err);
      try {
        refreshRuggersPanel();
      } catch (_) {
        /* ignore */
      }
    }
    // History logs (separate store)
    try {
      refreshHistoryPanel();
    } catch (err) {
      console.error("[history restore]", err);
    }
    const noteHtml =
      '<div class="bun-hint" style="margin-bottom:10px"><strong>Last known result</strong> (page refresh) — showing Analyze from ' +
      escHtml(when) +
      ". Run <strong>Analyze</strong> again for a live update.</div>";
    const root = $("bundlesUi");
    if (root && root.firstChild && !root.dataset.lastKnownPrefixed) {
      root.dataset.lastKnownPrefixed = "1";
      const note = document.createElement("div");
      note.innerHTML = noteHtml;
      if (note.firstChild) root.insertBefore(note.firstChild, root.firstChild);
    }
    return true;
  } catch (err) {
    console.error("[restore analyze]", err);
    try {
      refreshRuggersPanel();
    } catch (_) {
      /* ignore */
    }
    try {
      refreshHistoryPanel();
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

/** @deprecated use restoreLastAnalyze */
function restoreLastBundlesAnalyze() {
  return restoreLastAnalyze();
}

/**
 * Since-last-Analyze change color (magnitude of the shown delta):
 * 1–25 green · 25–50 yellow · 50–75 orange · 75–99+ red
 */
function bundleChangeDeltaClass(absPct) {
  const a = Math.abs(Number(absPct));
  if (!Number.isFinite(a) || a < 1) return "bun-delta-flat";
  if (a <= 25) return "bun-delta-green";
  if (a <= 50) return "bun-delta-yellow";
  if (a <= 75) return "bun-delta-orange";
  return "bun-delta-red";
}

function loadBundleStatsPrevMap() {
  try {
    const raw = localStorage.getItem(BUNDLE_STATS_PREV_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (_) {
    return {};
  }
}

/** Bare mint address for stats prev map (stable across chain: prefix variants). */
function bundleStatsMintKey(mint) {
  const m = String(mint || "").trim();
  if (!m) return "";
  return m.includes(":") ? m.split(":").pop() : m;
}

/** Stat field keys used for delta compare (exclude storage meta). */
const BUNDLE_STAT_KEYS = [
  "risk",
  "total_bundle_pct",
  "similar_size_total_pct",
  "fresh_total_pct",
  "multi_send_total_pct",
  "funding_total_pct",
  "suspect_total_pct",
  "single_holders_total_pct",
  "top10_ex_lp",
];

function isBundleStatsBlob(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  // Accept if any known stat key is present (including explicit null / 0)
  return BUNDLE_STAT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(o, k));
}

/** Clone stats → full key set (null-filled). Keeps 0 values. */
function cloneBundleStats(stats) {
  const out = {};
  const src = stats && typeof stats === "object" ? stats : {};
  for (const k of BUNDLE_STAT_KEYS) {
    const v = src[k];
    out[k] = v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  }
  return out;
}

/** All-zero baseline so the first Analyze still freezes a delta pair for refresh. */
function zeroBundleStats() {
  const out = {};
  for (const k of BUNDLE_STAT_KEYS) out[k] = 0;
  return out;
}

/**
 * Optional Helius scans (Shared SOL / Multi-send / Fresh) may be null when the
 * checkbox is off. Carry forward the last known % into the baseline so the next
 * live scan with the box ON compares against last known, not 0.
 */
const OPTIONAL_BUNDLE_PCT_KEYS = [
  "funding_total_pct",
  "multi_send_total_pct",
  "fresh_total_pct",
];

function mergeLastKnownOptionalStats(cur, lastKnown) {
  const out = cloneBundleStats(cur);
  const prev = lastKnown && typeof lastKnown === "object" ? lastKnown : null;
  if (!prev) return out;
  for (const k of OPTIONAL_BUNDLE_PCT_KEYS) {
    const c = out[k];
    const p = prev[k];
    if (p == null || !Number.isFinite(Number(p)) || Number(p) <= 0) continue;
    // Keep last known when live is missing or zeroed (scan off / no hold % on snapshot)
    if (c == null || !Number.isFinite(Number(c)) || Number(c) <= 0) {
      out[k] = Number(p);
    }
  }
  return out;
}

/** Prefer live optional %, else last known (never force 0 over a real last known). */
/**
 * Optional box % when scan is off / cache-only: allow last-known.
 * Prefer positive live, else positive last-known, else live 0, else known.
 */
function resolveOptionalDisplayPct(liveVal, lastKnownObj) {
  const live =
    liveVal != null && Number.isFinite(Number(liveVal)) ? Number(liveVal) : null;
  const known =
    lastKnownObj &&
    lastKnownObj.pct != null &&
    Number.isFinite(Number(lastKnownObj.pct))
      ? Number(lastKnownObj.pct)
      : null;
  if (live != null && live > 0) return live;
  if (known != null && known > 0) return known;
  if (live != null) return live;
  return known;
}

/**
 * Fresh / Multi-send / Shared SOL top-box value:
 *  - Live scan (checkbox on this run): only this scan’s % (0 if none).
 *  - Skipped / last-known: may use last-known for display only (not Total).
 */
function resolveOptionalBoxPct(isLive, serverVal, lastKnownObj, deltaFallback) {
  if (isLive) {
    return serverVal != null && Number.isFinite(Number(serverVal))
      ? Number(serverVal)
      : 0;
  }
  const base =
    serverVal != null && Number.isFinite(Number(serverVal))
      ? serverVal
      : deltaFallback;
  return resolveOptionalDisplayPct(base, lastKnownObj);
}

function loadBundleDeltaHtmlMap() {
  try {
    let raw = localStorage.getItem(BUNDLE_DELTA_HTML_KEY);
    if (!raw) {
      try {
        raw = sessionStorage.getItem(BUNDLE_DELTA_HTML_KEY);
      } catch (_) {
        raw = null;
      }
    }
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (_) {
    return {};
  }
}

function saveBundleDeltaHtml(mint, htmlByKey) {
  const m = bundleStatsMintKey(mint);
  if (!m || !htmlByKey) return;
  try {
    const map = loadBundleDeltaHtmlMap();
    map[m] = { ...htmlByKey, savedAt: Date.now() };
    const keys = Object.keys(map);
    if (keys.length > 80) {
      keys
        .sort((a, b) => (map[a].savedAt || 0) - (map[b].savedAt || 0))
        .slice(0, keys.length - 80)
        .forEach((k) => delete map[k]);
    }
    const raw = JSON.stringify(map);
    safeLocalStorageSet(BUNDLE_DELTA_HTML_KEY, raw);
    try {
      sessionStorage.setItem(BUNDLE_DELTA_HTML_KEY, raw);
    } catch (_) {
      /* ignore */
    }
  } catch (_) {
    /* ignore */
  }
}

function loadBundleDeltaHtml(mint) {
  const m = bundleStatsMintKey(mint);
  if (!m) return null;
  const map = loadBundleDeltaHtmlMap();
  const row = map[m];
  if (row && typeof row === "object") return row;
  for (const k of Object.keys(map)) {
    if (bundleStatsMintKey(k) === m && map[k]) return map[k];
  }
  return null;
}

/** Save exact Bundles summary bar HTML (includes arrows) for refresh replay. */
function saveBundleStatsBarSnap(mint, barHtml) {
  const m = bundleStatsMintKey(mint);
  const html = rewriteSuspectLabelsInHtml(String(barHtml || "").trim());
  if (!html || html.indexOf("bun-stats") < 0) return;
  try {
    const payload = {
      mint: m || "",
      html,
      savedAt: Date.now(),
    };
    localStorage.setItem(BUNDLE_STATS_BAR_SNAP_KEY, JSON.stringify(payload));
    // Also mint-keyed copy inside delta html map for multi-mint
    if (m) {
      const map = loadBundleDeltaHtmlMap();
      map[m] = { ...(map[m] || {}), barHtml: html, savedAt: Date.now() };
      localStorage.setItem(BUNDLE_DELTA_HTML_KEY, JSON.stringify(map));
    }
  } catch (_) {
    /* ignore */
  }
}

function loadBundleStatsBarSnap(mint) {
  // 1) Global last bar (always the most recent live Analyze)
  try {
    const raw = localStorage.getItem(BUNDLE_STATS_BAR_SNAP_KEY);
    if (raw) {
      // Prefer JSON {mint,html}; also accept raw HTML string
      if (raw.trim().charAt(0) === "<") {
        return {
          mint: "",
          html: rewriteSuspectLabelsInHtml(raw),
          savedAt: 0,
        };
      }
      const o = JSON.parse(raw);
      if (o && o.html) {
        o.html = rewriteSuspectLabelsInHtml(o.html);
        const m = bundleStatsMintKey(mint);
        // Always return last snap if mint unknown or matches; still return
        // last snap on mismatch (refresh of last token is the common case)
        if (!m || !o.mint || bundleStatsMintKey(o.mint) === m || m === "last") {
          return o;
        }
        // Mismatch: still use it (user refreshed last result)
        return o;
      }
    }
  } catch (_) {
    /* ignore */
  }
  // 2) sessionStorage plain HTML
  try {
    const ss = sessionStorage.getItem(BUNDLE_STATS_BAR_SNAP_KEY);
    if (ss && ss.indexOf("bun-stats") >= 0) {
      return {
        mint: "",
        html: rewriteSuspectLabelsInHtml(ss),
        savedAt: 0,
      };
    }
  } catch (_) {
    /* ignore */
  }
  // 3) Per-mint map
  try {
    const row = mint ? loadBundleDeltaHtml(mint) : null;
    if (row && row.barHtml) {
      return {
        mint: bundleStatsMintKey(mint),
        html: row.barHtml,
        savedAt: row.savedAt,
      };
    }
    const last = loadBundleDeltaHtml("last");
    if (last && last.barHtml) {
      return { mint: "last", html: last.barHtml, savedAt: last.savedAt };
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/** Normalize map entry → { forNext, deltaFrom, deltaCur, savedAt }. */
function normalizeBundleStatsEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  // New shape: nested forNext / deltaFrom / deltaCur
  if (
    raw.forNext ||
    raw.deltaFrom ||
    raw.deltaCur ||
    raw._v === 2
  ) {
    return {
      _v: 2,
      forNext: isBundleStatsBlob(raw.forNext)
        ? cloneBundleStats(raw.forNext)
        : null,
      deltaFrom: isBundleStatsBlob(raw.deltaFrom)
        ? cloneBundleStats(raw.deltaFrom)
        : null,
      deltaCur: isBundleStatsBlob(raw.deltaCur)
        ? cloneBundleStats(raw.deltaCur)
        : null,
      savedAt: raw.savedAt || 0,
    };
  }
  // Legacy flat: { risk, total_bundle_pct, ..., savedAt }
  if (isBundleStatsBlob(raw)) {
    const stats = cloneBundleStats(raw);
    return {
      _v: 2,
      forNext: stats,
      deltaFrom: null,
      deltaCur: stats,
      savedAt: raw.savedAt || 0,
    };
  }
  return null;
}

function getBundleStatsEntry(mint) {
  const m = bundleStatsMintKey(mint);
  if (!m) return null;
  const map = loadBundleStatsPrevMap();
  if (map[m]) {
    const e = normalizeBundleStatsEntry(map[m]);
    if (e) return e;
  }
  for (const k of Object.keys(map)) {
    if (bundleStatsMintKey(k) === m) {
      const e = normalizeBundleStatsEntry(map[k]);
      if (e) return e;
    }
  }
  return null;
}

/**
 * Persist baseline + last-shown delta pair for a mint.
 * forNext   = baseline for the *next* live Analyze
 * deltaFrom = left side of last shown deltas (kept across page refresh)
 * deltaCur  = right side of last shown deltas (matches last live result)
 */
function saveBundleStatsEntry(mint, entry) {
  const m = bundleStatsMintKey(mint);
  if (!m || !entry) return;
  try {
    // Never drop an existing delta pair on partial updates (e.g. refresh seed).
    // Pass a new deltaFrom object to update; omit key to keep previous.
    const prevE = getBundleStatsEntry(m) || {};
    const forNext =
      entry.forNext != null
        ? cloneBundleStats(entry.forNext)
        : prevE.forNext || null;
    let deltaFrom = prevE.deltaFrom || null;
    let deltaCur = prevE.deltaCur || null;
    if (entry.deltaFrom !== undefined && entry.deltaFrom != null) {
      deltaFrom = cloneBundleStats(entry.deltaFrom);
    }
    if (entry.deltaCur !== undefined && entry.deltaCur != null) {
      deltaCur = cloneBundleStats(entry.deltaCur);
    }
    const map = loadBundleStatsPrevMap();
    map[m] = {
      _v: 2,
      forNext,
      deltaFrom,
      deltaCur,
      savedAt: Date.now(),
    };
    const keys = Object.keys(map);
    if (keys.length > 80) {
      keys
        .sort((a, b) => (map[a].savedAt || 0) - (map[b].savedAt || 0))
        .slice(0, keys.length - 80)
        .forEach((k) => delete map[k]);
    }
    localStorage.setItem(BUNDLE_STATS_PREV_KEY, JSON.stringify(map));
  } catch (_) {
    /* ignore */
  }
}

/** @deprecated use saveBundleStatsEntry — kept for seed paths */
function saveBundleStatsPrev(mint, stats) {
  if (!stats) return;
  const existing = getBundleStatsEntry(mint) || {};
  saveBundleStatsEntry(mint, {
    forNext: stats,
    // Keep any existing frozen delta pair
    deltaFrom: existing.deltaFrom,
    deltaCur: existing.deltaCur || stats,
  });
}

/** Baseline stats for *next* live compare (forNext), or null. */
function loadBundleStatsPrev(mint) {
  const e = getBundleStatsEntry(mint);
  if (!e) return null;
  return e.forNext || null;
}


/**
 * Compute plain delta text + CSS class (always returns a result).
 * text examples: "d =0%" | "d +12%" | "d -3.5%" | "d +8" (score)
 */

/** True if text already includes a since-last-Analyze marker. */
function hasBundleDeltaMarker(text) {
  const t = String(text || "");
  return (
    /[▲▼]/.test(t) ||
    /\bUP\s+[+\-]/.test(t) ||
    /\bDN\s+[+\-]/.test(t) ||
    /\(0%?\)/.test(t) ||
    /bun-stat-delta/.test(t)
  );
}

function computeBundleStatDeltaParts(cur, prev, kind, opts) {
  const isScore = kind === "score";
  const coalesce = !opts || opts.coalesceNull !== false;
  let c = cur != null && Number.isFinite(Number(cur)) ? Number(cur) : null;
  let p = prev != null && Number.isFinite(Number(prev)) ? Number(prev) : null;
  if (coalesce) {
    if (c == null) c = 0;
    if (p == null) p = 0;
  }
  // Always return a visible marker.
  // Flat / missing → green 0 (score points) or 0% (supply %)
  // Classic flat: · 0% (green). Risk score: · 0 (points)
  const flatText = isScore ? "· 0" : "· 0%";
  if (c == null || p == null || !Number.isFinite(c - p)) {
    return {
      text: flatText,
      cls: "bun-delta-green",
      title: "No change since last Analyze",
      flat: true,
      isScore: isScore,
    };
  }
  const diff = c - p;
  const flatEps = isScore ? 0.5 : 0.05;
  if (Math.abs(diff) < flatEps) {
    return {
      text: flatText,
      cls: "bun-delta-green",
      title: "No change since last Analyze",
      flat: true,
      isScore: isScore,
    };
  }
  const up = diff > 0;
  // Classic style: ▲ +3% / ▼ −1.2%
  const sign = up ? "+" : "−";
  const mag = Math.abs(diff);
  const colorMag = isScore ? Math.min(99, mag * 5) : Math.min(99, mag * 20);
  const cls = bundleChangeDeltaClass(Math.max(1, colorMag));
  let label;
  if (isScore) {
    label = Math.round(mag).toString();
  } else {
    if (mag >= 10) label = mag.toFixed(0) + "%";
    else label = mag.toFixed(1).replace(/\.0$/, "") + "%";
  }
  const arrow = up ? "▲" : "▼";
  return {
    text: arrow + " " + sign + label,
    cls: cls,
    title: isScore
      ? "Risk score change since last Analyze (points)"
      : "Change since last Analyze of this mint",
    flat: false,
    isScore: isScore,
  };
}

/** HTML span for a delta (always non-empty). Risk = points; others = %. */
function formatBundleStatDelta(cur, prev, kind, opts) {
  const isScore = kind === "score";
  const parts = computeBundleStatDeltaParts(cur, prev, kind, opts) || {
    text: isScore ? "· 0" : "· 0%",
    cls: "bun-delta-green",
    title: "No change since last Analyze",
    isScore: isScore,
    flat: true,
  };
  let text = parts.text || (isScore ? "· 0" : "· 0%");
  // Classic flat marker
  if (parts.flat) {
    text = isScore ? "· 0" : "· 0%";
  }
  const cls = parts.cls || "bun-delta-green";
  const title = parts.title || "Change since last Analyze";
  // Classic: no extra parentheses around the whole marker
  return (
    '<span class="bun-stat-delta ' +
    cls +
    '" title="' +
    title +
    '">' +
    text +
    "</span>"
  );
}


function extractBundleSummaryStats(s, riskScore) {
  const num = (v) =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  return {
    risk: riskScore != null && Number.isFinite(Number(riskScore))
      ? Number(riskScore)
      : null,
    total_bundle_pct: num(s.total_bundle_pct),
    similar_size_total_pct: num(s.similar_size_total_pct),
    fresh_total_pct: num(s.fresh_total_pct),
    multi_send_total_pct: num(s.multi_send_total_pct),
    funding_total_pct: num(s.funding_total_pct),
    suspect_total_pct: num(s.suspect_total_pct),
    single_holders_total_pct: num(s.single_holders_total_pct),
    top10_ex_lp: num(s.top10_pct_excluding_known_programs),
  };
}

/** Stats from a full analyze/restore payload (for seeding prev baseline). */
function extractBundleStatsFromData(data) {
  if (!data || !data.ok) return null;
  const view = data.bundles_view;
  if (!view || !view.ok) return null;
  const s = view.summary || {};
  const riskScore =
    s.bundle_risk_score != null && Number.isFinite(Number(s.bundle_risk_score))
      ? Number(s.bundle_risk_score)
      : null;
  return extractBundleSummaryStats(s, riskScore);
}

/**
 * Baseline for a *new* live Analyze compare (forNext).
 * Falls back to last Analyze snapshot when map empty.
 * Never clears an existing frozen deltaFrom/deltaCur pair.
 */
function resolveBundleStatsPrev(mint) {
  // Read-only baseline for the *next* live compare. Never writes curStats.
  const m = bundleStatsMintKey(mint);
  if (!m) return null;
  try {
    const existing = getBundleStatsEntry(m);
    if (existing && existing.forNext) {
      return cloneBundleStats(existing.forNext);
    }
    const cached = loadLastAnalyze();
    if (!cached || !cached.data) return null;
    const addr =
      (cached.data.token && cached.data.token.address) ||
      (cached.data.market && cached.data.market.address) ||
      (cached.data.bundles_view && cached.data.bundles_view.token_address) ||
      cached.mint ||
      "";
    const cachedMint = bundleStatsMintKey(addr);
    if (cachedMint && cachedMint !== m && m !== "last") return null;
    const embedded = cached.bundleDelta || cached.data.bundleDelta || null;
    // forNext = stats after last *completed* live Analyze (baseline for this run)
    if (embedded && (embedded.forNext || embedded.deltaCur)) {
      return cloneBundleStats(embedded.forNext || embedded.deltaCur);
    }
    const stats = extractBundleStatsFromData(cached.data);
    return stats ? cloneBundleStats(stats) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Card UI for Bundles tab from structured bundles_view.
 * Never dumps raw JSON / monospaced report into the main panel.
 */
/**
 * Opera GX freezes building full wallet tables (1000s of DOM nodes).
 * Show summary stats only; optional expand via ?full=1 or button.
 */
function renderBundlesUiOperaLite(data) {
  const root = $("bundlesUi");
  if (!root) return;
  const view = (data && data.bundles_view) || null;
  const textFallback =
    (data && data.sections && data.sections.bundles) || "";
  // Keep hidden text panel in sync with rich formatting for Logs
  try {
    if (textFallback) setPanelText("bundles", textFallback);
  } catch (_) {
    const textEl = $("text-bundles");
    if (textEl && textFallback) textEl.textContent = String(textFallback);
  }

  const s = (view && view.summary) || {};
  const hasSummary =
    view &&
    view.ok !== false &&
    s &&
    typeof s === "object" &&
    (s.total_bundle_pct != null ||
      s.bundle_risk_score != null ||
      s.similar_size_total_pct != null);

  function row(label, valHtml) {
    return (
      '<div class="bun-stat"><span class="bun-stat-label">' +
      escHtml(label) +
      '</span><span class="bun-stat-value">' +
      (valHtml == null || valHtml === "" ? "—" : valHtml) +
      "</span></div>"
    );
  }

  let html =
    '<p class="bun-delta-note" data-adtc-ver="1">Bundles · lite · ' +
    escHtml(
      typeof ADTC_CLIENT_VERSION !== "undefined" ? ADTC_CLIENT_VERSION : "?"
    ) +
    "</p>";

  if (hasSummary) {
    const risk =
      s.bundle_risk_score != null && Number.isFinite(Number(s.bundle_risk_score))
        ? Number(s.bundle_risk_score)
        : null;
    html += '<div class="bun-stats">';
    html += row(
      "Risk",
      risk != null
        ? '<span class="' +
            bundleRiskScoreClass(risk) +
            '">' +
            escHtml(String(Math.round(risk))) +
            "</span>"
        : "—"
    );
    html += row("Total bundle", bunPctHtml(s.total_bundle_pct));
    html += row("Similar-sized", bunPctHtml(s.similar_size_total_pct));
    html += row("Fresh", bunPctHtml(s.fresh_total_pct));
    html += row("Multi-send", bunPctHtml(s.multi_send_total_pct));
    html += row("Shared SOL", bunPctHtml(s.funding_total_pct));
    html += row("Single holders", bunPctHtml(s.single_holders_total_pct));
    html += "</div>";
  } else if (view && view.ok === false) {
    html +=
      '<div class="bun-hint"><strong>Bundles unavailable</strong><br />' +
      escHtml(view.error || "No structured bundles data") +
      "</div>";
  } else {
    html +=
      '<p class="bun-hint">No structured bundle stats yet — text report below. Uncheck Quick for fuller holders-based bundles.</p>';
  }

  // Rich report: green titles, colored %, blue wallet links (same as full text path)
  if (textFallback && String(textFallback).trim()) {
    let rich = "";
    try {
      rich = formatBundlesRichHtml(String(textFallback).slice(0, 14000));
    } catch (err) {
      console.warn("[bundles lite rich]", err);
      rich =
        "<pre style=\"white-space:pre-wrap\">" +
        escHtml(String(textFallback).slice(0, 8000)) +
        "</pre>";
    }
    html +=
      '<div class="bun-section" style="margin-top:12px"><div class="bun-section-body" style="max-height:55vh;overflow:auto;padding:10px 12px;border:1px solid var(--border,#323a48);border-radius:8px;background:var(--bg-panel,#141820);font:12.5px/1.5 var(--mono,Consolas,monospace);white-space:pre-wrap;word-break:break-word">' +
      rich +
      "</div></div>";
  }

  html +=
    '<p class="bun-hint" style="margin-top:12px">Interactive wallet cards stay off in lite mode. ' +
    "Use <code>?full=1</code> in Edge/Chrome for full expandable tables.</p>";
  root.innerHTML = html;
}

function renderBundlesUi(data) {
  // Default lite summary (full tables only with ?full=1)
  if (useLiteUi()) {
    try {
      renderBundlesUiOperaLite(data);
      return;
    } catch (err) {
      console.warn("[bundles lite]", err);
    }
  }

  const root = $("bundlesUi");
  if (!root) return;

  const view = (data && data.bundles_view) || null;
  const textFallback =
    (data && data.sections && data.sections.bundles) || "";

  // Always keep hidden text for Logs snapshot path
  const textEl = $("text-bundles");
  if (textEl && textFallback) {
    // Keep plain text in hidden pre (not shown as UI)
    textEl.textContent = String(textFallback);
  }

  if (!view) {
    root.innerHTML =
      '<p class="logs-empty">Run a <strong>full Analyze</strong> (not Quick) on a Solana mint to load Bundles cards.</p>';
    return;
  }

  if (!view.ok) {
    root.innerHTML =
      '<div class="bun-hint"><strong>Bundles unavailable</strong><br />' +
      escHtml(view.error || "No data") +
      "<br /><br />Tips: full Analyze · Solana mint · holders must succeed · Helius for funding / fresh / multi-send.</div>";
    return;
  }

  const s = view.summary || {};
  const riskScore =
    s.bundle_risk_score != null && Number.isFinite(Number(s.bundle_risk_score))
      ? Number(s.bundle_risk_score)
      : null;
  const riskCls = bundleRiskScoreClass(riskScore != null ? riskScore : 0);

  let mint =
    (data.token && data.token.address) ||
    (data.market && data.market.address) ||
    (view.token_address || "") ||
    "";
  // Fallback: query field / search box (CA) when token sparse after restore
  if (!mint) {
    const q = String(
      (data && data.query) ||
        ($("query") && $("query").value) ||
        ""
    ).trim();
    if (q.length >= 32 && !/\s/.test(q)) mint = q;
  }
  const curStats = extractBundleSummaryStats(s, riskScore);
  // Align Total with listed Fresh / Multi-send / Shared SOL bags
  try {
    const tFix = recomputeTotalBundleFromView(view, s);
    if (tFix != null && Number.isFinite(Number(tFix))) {
      curStats.total_bundle_pct = Number(tFix);
      if (s && typeof s === "object") s.total_bundle_pct = Number(tFix);
    }
  } catch (_) {}
  const isRestore = !!(data && data._restoredFromBrowserCache);
  let stored = mint ? getBundleStatsEntry(mint) : null;

  // Frozen delta HTML — load from every backup so refresh cannot lose arrows
  function pickFrozenDeltaHtml() {
    const sources = [];
    try {
      if (s && s._ui_delta_html && typeof s._ui_delta_html === "object") {
        sources.push(s._ui_delta_html);
      }
      if (
        view.summary &&
        view.summary._ui_delta_html &&
        typeof view.summary._ui_delta_html === "object"
      ) {
        sources.push(view.summary._ui_delta_html);
      }
      if (data && data.bundleDelta && data.bundleDelta.htmlByKey) {
        sources.push(data.bundleDelta.htmlByKey);
      }
      if (data && data._bundleDeltaPair && data._bundleDeltaPair.htmlByKey) {
        sources.push(data._bundleDeltaPair.htmlByKey);
      }
      // loadLastAnalyze() is expensive (multi‑MB JSON.parse) — only on restore,
      // never on live Analyze (that freeze is what locks Opera GX after Analyze).
      if (isRestore) {
        const cached = loadLastAnalyze();
        if (cached && cached.bundleDelta && cached.bundleDelta.htmlByKey) {
          sources.push(cached.bundleDelta.htmlByKey);
        }
        if (
          cached &&
          cached.data &&
          cached.data.bundleDelta &&
          cached.data.bundleDelta.htmlByKey
        ) {
          sources.push(cached.data.bundleDelta.htmlByKey);
        }
        if (
          cached &&
          cached.data &&
          cached.data.bundles_view &&
          cached.data.bundles_view.summary &&
          cached.data.bundles_view.summary._ui_delta_html
        ) {
          sources.push(cached.data.bundles_view.summary._ui_delta_html);
        }
      }
    } catch (_) {
      /* ignore */
    }
    if (mint) {
      const m = loadBundleDeltaHtml(mint);
      if (m) sources.push(m);
    }
    const last = loadBundleDeltaHtml("last");
    if (last) sources.push(last);
    try {
      const ss = sessionStorage.getItem("adtc_delta_html_last");
      if (ss) sources.push(JSON.parse(ss));
    } catch (_) {
      /* ignore */
    }
    // First non-empty map that has at least one delta span
    for (const src of sources) {
      if (!src || typeof src !== "object") continue;
      const keys = Object.keys(src).filter(
        (k) =>
          k !== "savedAt" &&
          k !== "barHtml" &&
          src[k] &&
          String(src[k]).indexOf("bun-stat-delta") >= 0
      );
      if (keys.length) return src;
    }
    return null;
  }

  let frozenHtml = pickFrozenDeltaHtml();

  // ── Baseline lock ──────────────────────────────────────────────────
  // LIVE: prev = last completed Analyze stats (forNext), never current.
  // Writing forNext=curStats *before* paint caused permanent "(no change)".
  // RESTORE: show frozen pair / frozen HTML; do not poison forNext with cur.
  let prev = null;
  let deltaCurStats = curStats;
  const mKeyEarly = mint || "last";

  if (isRestore) {
    try {
      const cached = loadLastAnalyze();
      const emb =
        (data && data.bundleDelta) ||
        (data && data._bundleDeltaPair) ||
        (cached &&
          (cached.bundleDelta ||
            (cached.data && cached.data.bundleDelta))) ||
        null;
      if (emb && emb.htmlByKey && typeof emb.htmlByKey === "object") {
        frozenHtml = frozenHtml || emb.htmlByKey;
      }
      if (stored && stored.deltaFrom) {
        prev = cloneBundleStats(stored.deltaFrom);
        deltaCurStats = stored.deltaCur
          ? cloneBundleStats(stored.deltaCur)
          : curStats;
      } else if (stored && stored.deltaCur && stored.forNext) {
        prev = cloneBundleStats(stored.forNext);
        deltaCurStats = cloneBundleStats(stored.deltaCur);
      } else if (emb && emb.deltaFrom) {
        prev = cloneBundleStats(emb.deltaFrom);
        deltaCurStats = emb.deltaCur
          ? cloneBundleStats(emb.deltaCur)
          : curStats;
      } else {
        prev = zeroBundleStats();
        deltaCurStats = curStats;
      }
    } catch (_) {
      prev = zeroBundleStats();
      deltaCurStats = curStats;
    }
  } else {
    // LIVE Analyze — baseline = last LIVE run in this tab, else storage, else zeros.
    // Never use current stats as baseline (that forced permanent "(no change)").
    const mKey = bundleStatsMintKey(mint) || "last";
    let baseline = null;
    let baselineSrc = "zeros";
    try {
      if (mKey && __adtcLiveBaselineByMint[mKey]) {
        baseline = cloneBundleStats(__adtcLiveBaselineByMint[mKey]);
        baselineSrc = "memory";
      }
    } catch (_) {}
    if (!baseline) {
      try {
        baseline = mint ? resolveBundleStatsPrev(mint) : null;
        if (baseline) baselineSrc = "storage";
      } catch (_) {
        baseline = null;
      }
    }
    // Note: storage matching live is NORMAL when you re-Analyze the same mint
    // with unchanged numbers (shows "(no change)"). Poisoned forNext=cur from
    // old builds is cleared once by migrateBundleDeltaBaselines() on upgrade.
    if (!baseline) {
      prev = zeroBundleStats();
      baselineSrc = "zeros";
    } else {
      prev = cloneBundleStats(baseline);
    }
    deltaCurStats = curStats;
    try {
      console.info(
        "[bundles baseline]",
        "src=",
        baselineSrc,
        "mint=",
        (mint || "").slice(0, 8),
        "prev.total=",
        prev && prev.total_bundle_pct,
        "cur.total=",
        curStats && curStats.total_bundle_pct
      );
    } catch (_) {}
  }

  // Collect HTML deltas this render so we can freeze them for refresh
  const htmlByKeyThisRun = {};

  /**
   * Stats box. Value should already include plain "(d +N%)" from withDelta.
   */
  function stat(label, valueHtml, subHtml) {
    let val = valueHtml == null ? "" : String(valueHtml);
    // Do not force "(no change)" here — that hid real UP/DN when assembly missed a marker.
    const subRaw = subHtml == null ? "" : String(subHtml);
    const subTitle = subRaw
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (
      '<div class="bun-stat" data-bun-stat="' +
      escHtml(label) +
      '"><span class="bun-stat-label">' +
      escHtml(label) +
      '</span><span class="bun-stat-value">' +
      val +
      "</span>" +
      (subRaw
        ? '<span class="bun-stat-sub"' +
          (subTitle ? ' title="' + escHtml(subTitle) + '"' : "") +
          ">" +
          subRaw +
          "</span>"
        : "") +
      "</div>"
    );
  }

  /** Format ISO / date for “last known · …” under Fresh / Multi / Shared SOL. */
  function fmtLastKnownAt(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 19);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (_) {
      return String(iso).slice(0, 16);
    }
  }

  function lastKnownSub(fromCache, serverAt, browserAt) {
    // Legacy helper — prefer optionalUpdatedPlain; keep both label + time
    if (!fromCache && !browserAt && !serverAt) return "";
    const when = fmtLastKnownAt(serverAt || browserAt) || fmtLastKnownAt(Date.now());
    if (!when) return escHtml("Last updated");
    return escHtml("Last updated\n" + when);
  }

  /**
   * Was this optional unchecked / not live-scanned on this Analyze?
   * Prefer server include flags, then checkbox, then cache / scan-off errors.
   */
  function optionalBoxIsOff(includeKey, fromCache, errStr, checkboxFn) {
    if (s[includeKey] === false) return true;
    if (fromCache) return true;
    const err = String(errStr || "");
    if (/scan off|skipped/i.test(err)) return true;
    try {
      if (typeof checkboxFn === "function" && !checkboxFn()) return true;
    } catch (_) {}
    return false;
  }

  /**
   * Plain-text sub under Fresh / Multi / Shared SOL.
   * When boxOff (unchecked this Analyze): always "Last updated" + timestamp.
   * Also on page restore. Hidden when that optional was live-scanned (on).
   */
  function optionalUpdatedPlain(whenCandidates, boxOff) {
    if (!boxOff && !isRestore) return "";
    let whenRaw = null;
    for (let i = 0; i < (whenCandidates || []).length; i++) {
      if (whenCandidates[i]) {
        whenRaw = whenCandidates[i];
        break;
      }
    }
    if (!whenRaw) {
      whenRaw =
        (data && data.generated_at) ||
        (data && data._marketUpdatedAt) ||
        (data && data._restoredSavedAt) ||
        Date.now();
    }
    // Always both lines: "Last updated" + formatted time
    return optionalBundleUpdatedSub(whenRaw);
  }

  // Browser timestamps for optional scans (when server cache is gone)
  function loadOptionalLastKnown(mintKey) {
    try {
      const raw = localStorage.getItem(OPTIONAL_LAST_KNOWN_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw);
      const m = bundleStatsMintKey(mintKey);
      return (o && m && o[m] && typeof o[m] === "object" ? o[m] : {}) || {};
    } catch (_) {
      return {};
    }
  }
  function saveOptionalLastKnown(mintKey, kind, pct, atIso) {
    const m = bundleStatsMintKey(mintKey);
    if (!m || !kind) return;
    try {
      const raw = localStorage.getItem(OPTIONAL_LAST_KNOWN_KEY);
      const map = raw ? JSON.parse(raw) : {};
      if (!map || typeof map !== "object") return;
      if (!map[m] || typeof map[m] !== "object") map[m] = {};
      if (pct != null && Number.isFinite(Number(pct))) {
        map[m][kind] = {
          pct: Number(pct),
          at: atIso || new Date().toISOString(),
        };
      }
      localStorage.setItem(OPTIONAL_LAST_KNOWN_KEY, JSON.stringify(map));
    } catch (_) {
      /* ignore */
    }
  }
  const optKnown = mint ? loadOptionalLastKnown(mint) : {};
  // Detect live optional scans (not skipped / not cache-only) so we do not
  // keep showing a poisoned last-known Multi-send % that equaled Shared SOL.
  const freshErr0 = String(s.fresh_error || "");
  const msErr0 = String(s.multi_send_error || "");
  const fundErr0 = String(s.funding_error || "");
  const freshLive =
    !s.fresh_from_cache &&
    !/scan off|enable .Fresh|Fresh wallets scan off/i.test(freshErr0);
  const msLive =
    !s.multi_send_from_cache &&
    !/scan off|enable [“"]Multi|Multi-send scan off/i.test(msErr0);
  const fundLive =
    !s.funding_from_cache &&
    !/scan off|enable .Shared SOL|Shared SOL funder scan off/i.test(fundErr0);
  // On live scan: always write last known (including 0) + timestamp so an
  // unchecked re-Analyze can show Last updated under that box.
  if (!isRestore && mint) {
    const nowIso = new Date().toISOString();
    if (freshLive) {
      const frWrite =
        s.fresh_total_pct != null && Number.isFinite(Number(s.fresh_total_pct))
          ? Number(s.fresh_total_pct)
          : 0;
      saveOptionalLastKnown(
        mint,
        "fresh",
        frWrite,
        s.fresh_cached_at || nowIso
      );
    }
    if (msLive) {
      const msWrite =
        s.multi_send_total_pct != null && Number.isFinite(Number(s.multi_send_total_pct))
          ? Number(s.multi_send_total_pct)
          : 0;
      saveOptionalLastKnown(
        mint,
        "multi_send",
        msWrite,
        s.multi_send_cached_at || nowIso
      );
    }
    if (fundLive) {
      const fundWrite =
        s.funding_total_pct != null && Number.isFinite(Number(s.funding_total_pct))
          ? Number(s.funding_total_pct)
          : 0;
      saveOptionalLastKnown(
        mint,
        "funding",
        fundWrite,
        s.funding_cached_at || nowIso
      );
    }
  }

  function withDelta(mainHtml, key, curOverride) {
    const kind = key === "risk" ? "score" : "pct";
    let parts = null;
    try {
      if (isRestore && frozenHtml && frozenHtml[key]) {
        // Prefer recompute on live; on restore use frozen HTML span if present
        const frozen = String(frozenHtml[key]);
        if (hasBundleDeltaMarker(frozen)) {
          // Only bake real arrow markers (▲ / ▼)
          const plainMatch = frozen.match(
            /\((?:[▲▼][^)]*|UP[^)]*|DN[^)]*)\)/i
          );
          if (!plainMatch) {
            htmlByKeyThisRun[key] = "";
            // fall through to recompute
          } else {
            const plain = plainMatch[0];
            htmlByKeyThisRun[key] = frozen;
            const main = String(mainHtml);
            const m = main.match(/^(<span\b[^>]*>)([\s\S]*)(<\/span>)\s*$/i);
            if (m) return m[1] + m[2] + " " + plain + m[3];
            return main + " " + plain;
          }
        }
      }
      const curVal =
        curOverride !== undefined
          ? curOverride
          : deltaCurStats
            ? deltaCurStats[key]
            : null;
      const prevVal = prev ? prev[key] : 0;
      parts = computeBundleStatDeltaParts(
        curVal != null && Number.isFinite(Number(curVal)) ? Number(curVal) : 0,
        prevVal != null && Number.isFinite(Number(prevVal)) ? Number(prevVal) : 0,
        kind === "score" ? "score" : "pct",
        { coalesceNull: true }
      );
    } catch (err) {
      console.warn("[withDelta]", key, err);
      parts = null;
    }
    if (!parts || !parts.text) {
      parts = {
        text: kind === "score" ? "· 0" : "· 0%",
        cls: "bun-delta-green",
        title: "No change since last Analyze",
        flat: true,
        isScore: kind === "score",
      };
    }
    // Classic: 12% ▲ +3%  (space + marker, no parentheses)
    const plain = parts.text;
    const dHtml =
      '<span class="bun-stat-delta ' +
      parts.cls +
      '" title="' +
      (parts.title || "") +
      '">' +
      plain +
      "</span>";
    htmlByKeyThisRun[key] = dHtml;
    return String(mainHtml) + " " + dHtml;
  }

  let html = "";
  html += '<div class="bun-delta-note">Since last Analyze · ' +
    escHtml(typeof ADTC_CLIENT_VERSION !== "undefined" ? ADTC_CLIENT_VERSION : "?") +
    '</div>';
  html += '<div class="bun-stats">';
  // Risk label + score share the 1–25 / 25–50 / 50–75 / 75–100 color scheme
  html += stat(
    "Risk",
    withDelta(
      '<span class="' +
        riskCls +
        '">' +
        escHtml(s.bundle_risk || "—") +
        (riskScore != null
          ? " (" + escHtml(String(Math.round(riskScore))) + "/100)"
          : "") +
        "</span>",
      "risk"
    )
  );
  // Summary % tiles — same Holders priority color bands
  // Total bundle = unique wallets (Fresh + Multi-send + Shared SOL + multi + insider)
  {
    // Prefer union of listed bags so Fresh etc. always land in Total
    const tbp = recomputeTotalBundleFromView(view, s);
    const showSimSus =
      s.total_bundle_mode === "multi_plus_suspect" ||
      s.total_bundle_mode === "suspect_fallback" ||
      s.total_bundle_mode === "fallback_similar_suspect" ||
      s.total_bundle_mode === "multi_plus_similar_suspect" ||
      s.total_bundle_show_similar_suspect === true;
    const totalLabel = showSimSus
      ? "Total (multi + similar-sized)"
      : "Total bundle";
    html += stat(totalLabel, withDelta(bunPctHtml(tbp), "total_bundle_pct", tbp));
  }
  {
    const maN =
      s.multi_account_total_pct != null &&
      Number.isFinite(Number(s.multi_account_total_pct))
        ? Number(s.multi_account_total_pct)
        : null;
    const maFromList = (view.clusters || []).reduce(function (sum, c) {
      const p = Number(c && c.pct_supply);
      return sum + (Number.isFinite(p) && p > 0 ? p : 0);
    }, 0);
    const maPct = maN != null ? maN : maFromList > 0 ? Math.min(100, maFromList) : 0;
    html += stat(
      "Multi-account",
      withDelta(bunPctHtml(maPct), "multi_account_total_pct", maPct)
    );
  }
  {
    const susPct =
      s.suspect_total_pct != null && Number.isFinite(Number(s.suspect_total_pct))
        ? Number(s.suspect_total_pct)
        : s.similar_size_total_pct != null &&
            Number.isFinite(Number(s.similar_size_total_pct))
          ? Number(s.similar_size_total_pct)
          : 0;
    html += stat(
      "Similar-sized total",
      withDelta(bunPctHtml(susPct), "suspect_total_pct", susPct)
    );
  }
  // ── Fresh / Multi-send / Shared SOL (optional) ─────────────────────
  // Unchecked on this Analyze → always show Last updated + timestamp.
  {
    const freshCached = !!s.fresh_from_cache;
    const freshErr = String(s.fresh_error || "");
    const freshSkipped = /scan off|enable .Fresh|Fresh wallets scan off/i.test(
      freshErr
    );
    const freshOff = optionalBoxIsOff(
      "total_bundle_include_fresh",
      freshCached,
      freshErr,
      useFreshEnabled
    );
    const freshPct = resolveOptionalBoxPct(
      freshLive && !freshOff,
      s.fresh_total_pct,
      optKnown.fresh,
      deltaCurStats && deltaCurStats.fresh_total_pct
    );
    const freshAt =
      s.fresh_cached_at || (optKnown.fresh && optKnown.fresh.at) || "";
    const freshSubEsc = escHtml(
      optionalUpdatedPlain(
        [
          freshAt,
          optKnown.fresh && optKnown.fresh.at,
          data && data.generated_at,
          data && data._restoredSavedAt,
        ],
        freshOff
      )
    );
    if ((freshSkipped || freshOff) && freshPct == null && !freshCached) {
      html += stat(
        "Fresh total",
        withDelta(
          '<span style="color:var(--text-muted)">skipped</span>',
          "fresh_total_pct",
          0
        ),
        freshSubEsc
      );
    } else {
      const live = freshPct != null ? freshPct : 0;
      html += stat(
        "Fresh total",
        withDelta(bunPctHtmlBox(live), "fresh_total_pct", live),
        freshSubEsc
      );
    }
  }
  {
    const msErr = String(s.multi_send_error || "");
    const msSkipped = /scan off|enable [“"]Multi|Multi-send scan off/i.test(msErr);
    const msCached = !!s.multi_send_from_cache;
    // Live Multi-send: token multi-send only (never Shared SOL last-known).
    const msResolved = resolveTokenMultiSendTotalPct(view, s);
    const msOff = optionalBoxIsOff(
      "total_bundle_include_multi_send",
      msCached,
      msErr,
      useMultiSendEnabled
    );
    const msLiveBox = !msOff && !msSkipped && !msCached;
    let msPct = resolveOptionalBoxPct(
      msLiveBox,
      msResolved != null ? msResolved : s.multi_send_total_pct,
      optKnown.multi_send,
      deltaCurStats && deltaCurStats.multi_send_total_pct
    );
    if (msLiveBox && (msPct == null || !Number.isFinite(Number(msPct)))) {
      msPct = 0;
    }
    const msAt =
      s.multi_send_cached_at ||
      (optKnown.multi_send && optKnown.multi_send.at) ||
      "";
    const msSubEsc = escHtml(
      optionalUpdatedPlain(
        [
          msAt,
          optKnown.multi_send && optKnown.multi_send.at,
          data && data.generated_at,
          data && data._restoredSavedAt,
        ],
        msOff
      )
    );
    if ((msSkipped || msOff) && msPct == null && !msCached) {
      html += stat(
        "Multi-send total",
        withDelta(
          '<span style="color:var(--text-muted)">skipped</span>',
          "multi_send_total_pct",
          0
        ),
        msSubEsc
      );
    } else {
      // Same hold-% bands as Multi-send list at bottom (bunPctHtml / pctPriorityClass)
      const live = msPct != null ? msPct : 0;
      html += stat(
        "Multi-send total",
        withDelta(bunPctHtml(live), "multi_send_total_pct", live),
        msSubEsc
      );
    }
  }
  {
    const fundErr = String(s.funding_error || "");
    const fundSkipped = /scan off|enable .Shared SOL|Shared SOL funder scan off/i.test(
      fundErr
    );
    const fundCached = !!s.funding_from_cache;
    const fundOff = optionalBoxIsOff(
      "total_bundle_include_shared_sol",
      fundCached,
      fundErr,
      useSharedSolEnabled
    );
    const fundPct = resolveOptionalBoxPct(
      fundLive && !fundOff,
      s.funding_total_pct,
      optKnown.funding,
      (deltaCurStats && deltaCurStats.funding_total_pct != null
        ? deltaCurStats.funding_total_pct
        : prev && prev.funding_total_pct) || null
    );
    const fundAt =
      s.funding_cached_at || (optKnown.funding && optKnown.funding.at) || "";
    const fundSubEsc = escHtml(
      optionalUpdatedPlain(
        [
          fundAt,
          optKnown.funding && optKnown.funding.at,
          data && data.generated_at,
          data && data._restoredSavedAt,
        ],
        fundOff
      )
    );
    let sharedSolVal;
    if ((fundSkipped || fundOff) && !fundCached && fundPct == null) {
      sharedSolVal = withDelta(
        '<span style="color:var(--text-muted)">skipped</span>',
        "funding_total_pct",
        0
      );
    } else {
      const live = fundPct != null ? fundPct : 0;
      sharedSolVal = withDelta(bunPctHtmlBox(live), "funding_total_pct", live);
    }
    html += stat("Shared SOL total", sharedSolVal, fundSubEsc);
  }
  // Single holders: non-LP bags ≥0.01% not in multi/similar/optional categories
  {
    let singlePct =
      s.single_holders_total_pct != null &&
      Number.isFinite(Number(s.single_holders_total_pct))
        ? Number(s.single_holders_total_pct)
        : null;
    if (
      singlePct == null &&
      deltaCurStats &&
      deltaCurStats.single_holders_total_pct != null
    ) {
      singlePct = Number(deltaCurStats.single_holders_total_pct);
    }
    const live = singlePct != null ? singlePct : 0;
    html += stat(
      "Single holders",
      withDelta(bunPctHtml(live), "single_holders_total_pct", live)
    );
  }
  html += stat(
    "Top10 ex-LP",
    withDelta(
      bunPctHtml(s.top10_pct_excluding_known_programs),
      "top10_ex_lp"
    )
  );
  html += "</div>";

  // Defer saveBundleStatsEntry until AFTER stats are painted (see end of render).
  // Saving forNext=cur here used to make a second pass / re-entry always "(no change)".
  if (!isRestore && curStats) {
    try {
      data._bundleDeltaPair = {
        mint: bundleStatsMintKey(mint) || "last",
        forNext: null, // filled after paint
        deltaFrom: prev || zeroBundleStats(),
        deltaCur: curStats,
        htmlByKey: { ...htmlByKeyThisRun },
      };
    } catch (_) {
      /* ignore */
    }
  }

  const src = (s.sources_used || []).join(", ") || view.method || view.source || "—";
  html +=
    '<p class="bun-meta">Sources: ' +
    escHtml(src) +
    " · Heuristic only — not proof of identity" +
    ' · <span class="bun-client-ver" title="Client build for cache checks">' +
    escHtml(typeof ADTC_CLIENT_VERSION !== "undefined" ? ADTC_CLIENT_VERSION : "?") +
    "</span></p>";
  // Total bundle = multi-account + insider + Fresh + Multi-send + Shared SOL
  // (unique wallets; similar/suspect only when all three optionals are off)
  if (s.total_bundle_additive || s.total_bundle_by_vector) {
    const bv = s.total_bundle_by_vector || {};
    const parts = [];
    const labels = {
      multi_account: "multi-account",
      multi_send: "multi-send",
      fresh: "fresh",
      shared_funder: "shared SOL",
      suspect: "similar-sized",
      similar_size: "similar-sized",
    };
    const seenLab = {};
    for (const [k, lab] of Object.entries(labels)) {
      const m = bv[k];
      if (!m || m.excluded_from_total) continue;
      // Prefer unified "suspect" chip over similar_size alias
      if (k === "similar_size" && bv.suspect && !bv.suspect.excluded_from_total)
        continue;
      if (seenLab[lab]) continue;
      // Prefer exclusive-in-Total % (no duplicate wallets across chips)
      const pEx =
        m.pct_in_total != null && Number.isFinite(Number(m.pct_in_total))
          ? Number(m.pct_in_total)
          : null;
      const p =
        pEx != null
          ? pEx
          : m.pct != null && Number.isFinite(Number(m.pct))
            ? Number(m.pct)
            : null;
      const n =
        m.count_in_total != null
          ? Number(m.count_in_total)
          : m.count != null
            ? Number(m.count)
            : 0;
      if (p != null && p > 0) {
        parts.push(lab + " " + p.toFixed(2) + "%");
        seenLab[lab] = true;
      } else if (n > 0) {
        parts.push(lab + " n/a%");
        seenLab[lab] = true;
      }
    }
    const uniqN =
      s.total_bundle_unique_wallets != null
        ? s.total_bundle_unique_wallets
        : s.flagged_wallets;
    const crossN = s.total_bundle_crosslisted_count;
    html +=
      '<p class="bun-meta">Total = unique wallets only (each address once at max hold % — no double-count across multi / similar-sized / optionals). ' +
      "Multi-account always counts. Similar-sized (near-exact bags + Rugcheck insider) only when Fresh / Multi-send / Shared SOL are all off. " +
      "Checked optionals enter Total; last-known under an unchecked box does not. " +
      (uniqN != null ? " · " + escHtml(String(uniqN)) + " unique wallet(s)" : "") +
      (crossN != null && Number(crossN) > 0
        ? " · " + escHtml(String(crossN)) + " cross-listed (deduped into Total once)"
        : "") +
      (parts.length
        ? " · exclusive in Total: " + escHtml(parts.join(" + "))
        : "") +
      ".</p>";
  }

  // Signals chips
  const sigs = view.signals || [];
  if (sigs.length) {
    html += '<div class="bun-signals">';
    for (const sig of sigs) {
      const sev = String(sig.severity || "info").toLowerCase();
      html +=
        '<span class="bun-chip sev-' +
        escHtml(sev) +
        '" title="' +
        escHtml(sig.detail || "") +
        '"><strong>' +
        escHtml(sig.title || sig.id || "signal") +
        "</strong></span>";
    }
    html += "</div>";
  }

  // Suspect (= similar-size) in Total only when Fresh/Multi-send/Shared SOL all off
  const showSimilarSuspect =
    s.total_bundle_show_similar_suspect != null
      ? !!s.total_bundle_show_similar_suspect
      : s.total_bundle_mode === "multi_plus_suspect" ||
        s.total_bundle_mode === "suspect_fallback" ||
        s.total_bundle_mode === "fallback_similar_suspect" ||
        s.total_bundle_mode === "multi_plus_similar_suspect";

  // Multi-account clusters (own category — box above + list)
  const clusters = view.clusters || [];
  if (clusters.length) {
    const maTot =
      s.multi_account_total_pct != null
        ? s.multi_account_total_pct
        : null;
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Multi-account clusters</span>' +
      '<span class="bun-section-total">' +
      (maTot != null ? bunPctHtml(maTot) + " · " : "") +
      escHtml(String(clusters.length)) +
      " owner(s) · several ATAs each</span></div><div class=\"bun-section-body\">";
    html +=
      '<p class="bun-sub">One owner with multiple large Associated Token Accounts. Always counted in Total (unique wallets).</p>';
    html += bunWalletTable(clusters, [
      { key: "wallet", label: "Owner", render: (v) => bunWalletLink(v) },
      {
        key: "accounts",
        label: "ATAs",
        render: (v) => escHtml(v != null ? String(v) : "—"),
      },
      { key: "pct_supply", label: "Total hold", render: (v) => bunPctHtml(v) },
    ]);
    html += "</div></section>";
  } else {
    html += bunEmptySection(
      "Multi-account clusters",
      "None found — one owner with several large Associated Token Accounts."
    );
  }

  // Shared SOL funder
  const fund = view.funding_clusters || [];
  const fundErr = String(s.funding_error || "");
  const fundSkipped = /scan off|enable .Shared SOL|Shared SOL funder scan off/i.test(
    fundErr
  );
  const fundCached = !!s.funding_from_cache;
  if (fund.length) {
    // Total % across unique wallets (funders + children) in all Shared SOL clusters
    const fundPctByW = {};
    for (const fc of fund) {
      const funder = String((fc && fc.funder) || "").trim();
      if (funder) {
        const fp = Number(fc.funder_pct);
        if (Number.isFinite(fp)) {
          fundPctByW[funder] = Math.max(fundPctByW[funder] || 0, fp);
        } else if (fundPctByW[funder] == null) {
          fundPctByW[funder] = null;
        }
      }
      const kids = Array.isArray(fc.child_rows) && fc.child_rows.length
        ? fc.child_rows
        : fc.children || [];
      for (const row of kids) {
        let w;
        let p = null;
        if (row && typeof row === "object") {
          w = String(row.wallet || "").trim();
          p = row.pct_supply != null ? Number(row.pct_supply) : null;
        } else {
          w = String(row || "").trim();
        }
        if (!w) continue;
        if (Number.isFinite(p)) {
          fundPctByW[w] = Math.max(fundPctByW[w] || 0, p);
        } else if (fundPctByW[w] == null) {
          fundPctByW[w] = null;
        }
      }
    }
    let fundTotalPct = s.funding_total_pct;
    if (fundTotalPct == null) {
      let sum = 0;
      let any = false;
      for (const p of Object.values(fundPctByW)) {
        if (p != null && Number.isFinite(Number(p)) && Number(p) > 0) {
          sum += Number(p);
          any = true;
        }
      }
      fundTotalPct = any ? Math.min(100, sum) : null;
    }
    const fundWalletN =
      s.funding_wallet_count != null
        ? Number(s.funding_wallet_count)
        : Object.keys(fundPctByW).length;
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Shared SOL funder' +
      (fundCached ? " (last known)" : "") +
      "</span>" +
      '<span class="bun-section-total">total ' +
      bunPctHtml(fundTotalPct) +
      " · " +
      escHtml(String(Number.isFinite(fundWalletN) ? fundWalletN : 0)) +
      " wallet(s) · " +
      escHtml(String(fund.length)) +
      " cluster(s)" +
      (fundCached ? " · no re-scan" : "") +
      "</span></div><div class=\"bun-section-body\">";
    if (fundCached) {
      html +=
        '<p class="bun-sub">Last known Shared SOL for this mint (checkbox off — no Helius pings). Check Shared SOL to refresh.</p>';
    }
    for (const fc of fund) {
      html +=
        '<div class="bun-cluster"><div class="bun-cluster-head">Funder ' +
        bunWalletLink(fc.funder) +
        " holds " +
        bunPctHtml(fc.funder_pct) +
        " → " +
        escHtml(String(fc.child_count || (fc.children || []).length || 0)) +
        " wallets" +
        (fc.total_pct != null ? " · sum " + bunPctHtml(fc.total_pct) : "") +
        "</div>";
      // Prefer child_rows (with %) when present
      const childTable =
        Array.isArray(fc.child_rows) && fc.child_rows.length
          ? fc.child_rows
          : (fc.children || []).map((c) =>
              typeof c === "object" && c
                ? c
                : { wallet: c, pct_supply: null }
            );
      html += bunWalletTable(childTable, [
        { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
        { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
      ]);
      html += "</div>";
    }
    html += "</div></section>";
  } else {
    html += bunEmptySection(
      "Shared SOL funder",
      fundSkipped
        ? "Skipped — turn on “Shared SOL” above Analyze (heaviest Helius load)."
        : "None found — needs Helius for 1-hop funding clusters."
    );
  }

  // Fresh
  const fresh = view.fresh_wallets || [];
  const freshCached = !!s.fresh_from_cache;
  if (fresh.length) {
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Fresh wallets' +
      (freshCached ? " (last known)" : "") +
      "</span>" +
      '<span class="bun-section-total">total ' +
      bunPctHtml(s.fresh_total_pct) +
      " · " +
      escHtml(String(fresh.length)) +
      " wallet(s)" +
      (freshCached ? " · no re-scan" : "") +
      "</span></div><div class=\"bun-section-body\">";
    if (freshCached) {
      html +=
        '<p class="bun-sub">Last known Fresh wallets for this mint (checkbox off — no Helius pings). Check Fresh to refresh.</p>';
    }
    html += bunWalletTable(fresh, [
      { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
      { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
      {
        key: "sol",
        label: "SOL",
        render: (v) =>
          v != null && Number.isFinite(Number(v))
            ? escHtml(Number(v).toFixed(3))
            : "—",
      },
      {
        key: "other_tokens",
        label: "Other SPL",
        render: (v) => escHtml(v != null ? String(v) : "—"),
      },
      {
        key: "tag",
        label: "Tag",
        render: (v) => escHtml(v || "sole-token"),
      },
    ]);
    html += "</div></section>";
  } else {
    html += bunEmptySection(
      "Fresh wallets",
      useFreshEnabled()
        ? "None found — wallets holding almost only this mint (needs Helius + full Analyze)."
        : "Skipped — turn on “Fresh” above Analyze to scan (or re-scan after a prior full Analyze with Fresh on to keep last known)."
    );
  }

  // Multi-send section = token multi-send only (Shared SOL is separate)
  const tokenMs = view.multi_send_clusters || [];
  const solMs = view.sol_multi_send_clusters || [];
  const msCached = !!s.multi_send_from_cache;
  const msTableRows = (view.multi_send_wallets || []).filter(function (r) {
    const roles = (r && r.roles) || [];
    if (!roles.length) return true;
    return !roles.every(function (role) {
      return String(role || "").toLowerCase().indexOf("sol") === 0;
    });
  });
  const msTotDisp = resolveTokenMultiSendTotalPct(view, s);
  if (msTableRows.length || tokenMs.length) {
    const shape = String(s.multi_send_hold_shape || "");
    let shapeNote = "";
    if (shape === "mostly_one_wallet_sender") {
      shapeNote =
        "Hold shape: mostly still on sender wallet(s) — not spread across receivers.";
    } else if (shape === "mostly_across_receivers") {
      shapeNote =
        "Hold shape: mostly across receiver wallets — not one sender bag.";
    }
    const msWalletN = Math.max(
      msTableRows.length || 0,
      s.multi_send_wallet_with_pct != null &&
        Number.isFinite(Number(s.multi_send_wallet_with_pct))
        ? Number(s.multi_send_wallet_with_pct)
        : 0
    );
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Multi-send (one → many)' +
      (msCached ? " (last known)" : "") +
      "</span>" +
      '<span class="bun-section-total">total supply held ' +
      bunPctHtml(msTotDisp != null ? msTotDisp : 0) +
      " · " +
      escHtml(String(msWalletN)) +
      " wallet(s)" +
      (msCached ? " · no re-scan" : "") +
      "</span></div><div class=\"bun-section-body\">";
    if (msCached) {
      html +=
        '<p class="bun-sub">Last known Multi-send for this mint (checkbox off — no Helius pings). Check Multi-send to refresh.</p>';
    }
    html +=
      '<p class="bun-sub">Token multi-send only (this mint sent one→many). ' +
      "Total = sum of Holds below. Senders: " +
      bunPctHtml(s.multi_send_sender_total_pct) +
      " · " +
      escHtml(String(s.multi_send_sender_count != null ? s.multi_send_sender_count : "—")) +
      " · Receivers: " +
      bunPctHtml(s.multi_send_receiver_total_pct) +
      " · " +
      escHtml(
        String(
          s.multi_send_receiver_count != null ? s.multi_send_receiver_count : "—"
        )
      ) +
      ". LP/bonding-curve excluded. Shared SOL funders are under Shared SOL only.</p>";
    if (shapeNote) {
      html += '<p class="bun-sub">' + escHtml(shapeNote) + "</p>";
    }
    if (msTableRows.length) {
      html +=
        '<p class="bun-sub">Wallets (by current supply % — same set as total above)</p>';
      html += bunWalletTable(msTableRows, [
        { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
        { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
        {
          key: "roles",
          label: "Role",
          render: (v) =>
            escHtml(Array.isArray(v) ? v.join(", ") : v || "multi-send"),
        },
      ]);
    }
    for (const mc of tokenMs) {
      const hs = String(mc.hold_shape || "");
      const hsNote =
        hs === "mostly_one_wallet_sender"
          ? " · mostly still on sender"
          : hs === "mostly_across_receivers"
            ? " · mostly across receivers"
            : "";
      html +=
        '<div class="bun-cluster"><div class="bun-cluster-head">Token sender ' +
        bunWalletLink(mc.sender) +
        " holds " +
        bunPctHtml(mc.sender_pct) +
        " (one wallet) → " +
        escHtml(String(mc.receiver_count || (mc.receivers || []).length || 0)) +
        " receivers hold " +
        bunPctHtml(
          mc.receivers_total_pct != null
            ? mc.receivers_total_pct
            : null
        ) +
        " · cluster " +
        bunPctHtml(mc.total_pct) +
        escHtml(hsNote) +
        "</div>";
      html += bunWalletTable(mc.receivers || [], [
        { key: "wallet", label: "Receiver", render: (v) => bunWalletLink(v) },
        { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
      ]);
      html += "</div>";
    }
    html += "</div></section>";
  } else {
    const srcs = ((s.sources_used || []).join(" ") || "").toLowerCase();
    const heliusRan =
      srcs.indexOf("token_multi_send") >= 0 || srcs.indexOf("helius") >= 0;
    const errS = String(s.multi_send_error || "");
    let emptyMsg;
    if (/scan off|enable “Multi|enable "Multi|Multi-send scan off/i.test(errS)) {
      emptyMsg =
        "Skipped — turn on “Multi-send” above Analyze to run this scan.";
    } else if (s.multi_send_error) {
      emptyMsg =
        "None this scan — " +
        errS +
        " (set HELIUS_API_KEY on the API host, not in web/config.js).";
    } else if (solMs.length) {
      emptyMsg =
        "No token multi-send this scan (Multi-send total 0%). " +
        "Funded wallets that hold supply are under Shared SOL — their % is in Shared SOL total, not Multi-send.";
    } else if (heliusRan) {
      const txsN = s.multi_send_txs_scanned;
      const sigsN = s.multi_send_sigs_available;
      const edgeN = s.multi_send_edge_senders;
      const scanBit =
        txsN != null || sigsN != null
          ? " Scanned " +
            escHtml(String(txsN != null ? txsN : "?")) +
            " txs / " +
            escHtml(String(sigsN != null ? sigsN : "?")) +
            " mint sigs" +
            (edgeN != null
              ? " · " + escHtml(String(edgeN)) + " sender outflow(s)"
              : "") +
            "."
          : "";
      emptyMsg =
        "None this scan — Helius ran token multi-send (this mint one→many)." +
        scanBit +
        " No fan-out with ≥2 receivers found (LP/bonding-curve senders excluded). " +
        "Shared SOL funders are a different check.";
    } else {
      emptyMsg =
        "None found — multi-send needs HELIUS_API_KEY on the API (Render) + full Analyze (not Quick). " +
        "Key is server-side only; not web/config.js.";
    }
    html += bunEmptySection("Multi-send (one → many)", emptyMsg);
  }

  // Launch-window removed from Bundles (Helius scan disabled).

  // Similar-sized wallets = near-exact bags + Rugcheck insider-flagged
  const sims = view.similar_size_groups || [];
  const insiders = view.insider_wallets || [];
  let susTot =
    s.suspect_total_pct != null
      ? s.suspect_total_pct
      : s.similar_size_total_pct;
  if (sims.length || insiders.length) {
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Similar-sized wallets</span>' +
      '<span class="bun-section-total">' +
      bunPctHtml(susTot) +
      " combined" +
      (showSimilarSuspect ? " · in Total" : "") +
      "</span></div><div class=\"bun-section-body\">";
    if (showSimilarSuspect) {
      html +=
        '<p class="bun-sub">Near-exact same bag size + Rugcheck insider-flagged. Counted in Total when Fresh, Multi-send, and Shared SOL are all off (with multi-account; unique wallets).</p>';
    } else {
      html +=
        '<p class="bun-sub">Near-exact same bag size + Rugcheck insider-flagged. Listed for reference — not in Total while Fresh / Multi-send / Shared SOL are checked.</p>';
    }
    if (sims.length) {
      html +=
        '<p class="bun-sub"><strong>Similar-sized bags</strong></p>';
      for (const g of sims) {
        html +=
          '<div class="bun-cluster"><div class="bun-cluster-head">' +
          escHtml(String(g.count || (g.wallets || []).length || 0)) +
          " wallets ≈ " +
          bunPctHtml(g.avg_pct) +
          " each" +
          (g.total_pct != null ? " · sum " + bunPctHtml(g.total_pct) : "") +
          "</div>";
        html += bunWalletTable(g.wallets || [], [
          { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
          { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
        ]);
        html += "</div>";
      }
    }
    if (insiders.length) {
      html +=
        '<p class="bun-sub"><strong>Rugcheck insider-flagged</strong> · ' +
        escHtml(String(insiders.length)) +
        " wallet(s)</p>";
      html += bunWalletTable(insiders, [
        { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
        { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
        {
          key: "label",
          label: "Tag",
          render: (v) => escHtml(v || "insider-flagged (Rugcheck)"),
        },
      ]);
    }
    html += "</div></section>";
  } else {
    html += bunEmptySection(
      "Similar-sized wallets",
      "None found — no near-exact same-size bags or Rugcheck insider-flagged wallets."
    );
  }

  // Single holders — non-category bags ≥0.01% (list + total with hold-% colors)
  // Hard-exclude any wallet already in Similar-sized (bags or Rugcheck insider).
  {
    const similarBlock = Object.create(null);
    for (const g of sims) {
      const mems = (g && (g.wallets || g.members)) || [];
      for (const m of mems) {
        const w =
          typeof m === "string"
            ? String(m).trim()
            : String((m && (m.wallet || m.address)) || "").trim();
        if (w) similarBlock[w] = true;
      }
    }
    for (const h of insiders) {
      const w = String((h && (h.wallet || h.address)) || "").trim();
      if (w) similarBlock[w] = true;
    }

    const singles = Array.isArray(view.single_holders) ? view.single_holders : [];
    // Dedupe by wallet (max bag) in case API/cache double-listed
    const byW = Object.create(null);
    for (const row of singles) {
      if (!row || typeof row !== "object") continue;
      const w = String(row.wallet || "").trim();
      if (!w || similarBlock[w]) continue; // similar-sized → Similar section only
      const p =
        row.pct_supply != null && Number.isFinite(Number(row.pct_supply))
          ? Number(row.pct_supply)
          : null;
      const prev = byW[w];
      if (
        !prev ||
        (p != null &&
          (prev.pct_supply == null || p > Number(prev.pct_supply || 0)))
      ) {
        byW[w] = { ...row, wallet: w, pct_supply: p != null ? p : row.pct_supply };
      }
    }
    const singleRows = Object.values(byW).sort((a, b) => {
      const pa = a.pct_supply != null ? Number(a.pct_supply) : -1;
      const pb = b.pct_supply != null ? Number(b.pct_supply) : -1;
      return pb - pa;
    });
    // Always recompute total from filtered list (never use a total that included similar)
    let singleTot = sumUniqueWalletSupplyPct(singleRows);
    if (singleTot == null) singleTot = 0;
    const singleN = singleRows.length;
    if (singleRows.length) {
      html +=
        '<section class="bun-section bun-section-single"><div class="bun-section-head">' +
        '<span class="bun-section-title">Single holders</span>' +
        '<span class="bun-section-total">total ' +
        bunPctHtml(singleTot) +
        " · " +
        escHtml(String(singleRows.length || singleN || 0)) +
        " wallet(s)</span></div><div class=\"bun-section-body\">";
      html +=
        '<p class="bun-sub">Non-LP bags ≥0.01% that are <strong>not</strong> in multi-account, ' +
        "similar-sized, multi-send, Shared SOL, or Fresh. " +
        "Similar-sized wallets are listed only under Similar-sized above. " +
        "Hold % uses the same low → critical color bands as other Bundles sections.</p>";
      html += bunWalletTable(singleRows, [
        {
          key: "rank",
          label: "#",
          render: (v) =>
            v != null && Number.isFinite(Number(v))
              ? escHtml(String(v))
              : "—",
        },
        { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
        { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
      ]);
      html += "</div></section>";
    } else {
      html +=
        '<section class="bun-section bun-section-single">' +
        '<div class="bun-section-head">' +
        '<span class="bun-section-title">Single holders</span>' +
        '<span class="bun-section-total">total ' +
        bunPctHtml(0) +
        " · 0 wallet(s)</span></div>" +
        '<p class="bun-empty">None found — no standalone bags ≥0.01% outside multi / similar-sized / optionals.</p>' +
        "</section>";
    }
  }

  root.innerHTML = html;


  // v87: rebuild top stats with DOM textContent so deltas always show
  try {
    const ver =
      typeof ADTC_CLIENT_VERSION !== "undefined" ? ADTC_CLIENT_VERSION : "?";
    const items = [];
    function pushStat(label, valueText, valueClass, key, curOverride, sub) {
      const kind = key === "risk" ? "score" : "pct";
      const isScore = kind === "score";
      const flatDefault = isScore ? "· 0" : "· 0%";
      let deltaText = null;
      let deltaCls = "bun-delta-green";
      // Restore: prefer exact frozen marker from last live Analyze
      if (isRestore && frozenHtml && frozenHtml[key]) {
        let fr = String(frozenHtml[key]).replace(/<[^>]+>/g, " ").trim();
        fr = fr.replace(/\bUP\b/gi, "▲").replace(/\bDN\b/gi, "▼");
        // Classic: "▲ +3%" or "· 0%" (optional surrounding parens / span text)
        const m = fr.match(
          /([▲▼]\s*[+\-\u2212]?\s*\d+(?:\.\d+)?%?|·\s*0%?)/
        );
        if (m) {
          deltaText = m[1].trim();
          if (isScore) deltaText = deltaText.replace(/%/g, "");
          if (/▲/.test(deltaText)) deltaCls = "bun-delta-green";
          else if (/▼/.test(deltaText)) deltaCls = "bun-delta-red";
          else deltaCls = "bun-delta-green";
        }
      }
      if (!deltaText) {
        const curVal =
          curOverride !== undefined
            ? curOverride
            : deltaCurStats
              ? deltaCurStats[key]
              : null;
        const prevVal = prev ? prev[key] : 0;
        const parts = computeBundleStatDeltaParts(
          curVal != null && Number.isFinite(Number(curVal)) ? Number(curVal) : 0,
          prevVal != null && Number.isFinite(Number(prevVal)) ? Number(prevVal) : 0,
          kind,
          { coalesceNull: true }
        );
        if (parts && parts.text) {
          // Classic: "▲ +3%" or "· 0%" — no wrapping parens
          deltaText = parts.text;
          deltaCls = parts.cls || "bun-delta-green";
          if (parts.flat) deltaCls = "bun-delta-green";
        } else {
          deltaText = isScore ? "· 0" : "· 0%";
          deltaCls = "bun-delta-green";
        }
      }
      if (!deltaText) {
        deltaText = isScore ? "· 0" : "· 0%";
        deltaCls = "bun-delta-green";
      }
      htmlByKeyThisRun[key] =
        '<span class="bun-stat-delta ' +
        deltaCls +
        '">' +
        deltaText +
        "</span>";
      items.push({
        label: label,
        key: key,
        isScore: isScore,
        valueText: valueText,
        valueClass: valueClass || "",
        deltaText: deltaText,
        deltaCls: deltaCls,
        sub: sub || "",
      });
    }

    const riskText =
      (s.bundle_risk || "—") +
      (riskScore != null ? " (" + Math.round(riskScore) + "/100)" : "");
    pushStat("Risk", riskText, riskCls, "risk");

    const tbp = recomputeTotalBundleFromView(view, s);
    const showSimSus =
      s.total_bundle_mode === "multi_plus_suspect" ||
      s.total_bundle_mode === "suspect_fallback" ||
      s.total_bundle_mode === "fallback_similar_suspect" ||
      s.total_bundle_mode === "multi_plus_similar_suspect" ||
      s.total_bundle_show_similar_suspect === true;
    pushStat(
      showSimSus ? "Total (multi + similar-sized)" : "Total bundle",
      fmtSupplyPct(tbp) || "0%",
      pctPriorityClass(tbp) || "",
      "total_bundle_pct",
      tbp
    );

    const maN =
      s.multi_account_total_pct != null &&
      Number.isFinite(Number(s.multi_account_total_pct))
        ? Number(s.multi_account_total_pct)
        : 0;
    pushStat(
      "Multi-account",
      fmtSupplyPct(s.multi_account_total_pct != null ? s.multi_account_total_pct : maN) ||
        "0%",
      pctPriorityClass(maN) || (maN <= 0 ? "bun-pct-zero" : ""),
      "multi_account_total_pct",
      maN
    );

    const susN =
      s.suspect_total_pct != null && Number.isFinite(Number(s.suspect_total_pct))
        ? Number(s.suspect_total_pct)
        : s.similar_size_total_pct != null &&
            Number.isFinite(Number(s.similar_size_total_pct))
          ? Number(s.similar_size_total_pct)
          : 0;
    pushStat(
      "Similar-sized total",
      fmtSupplyPct(susN) || "0%",
      pctPriorityClass(susN) || (susN <= 0 ? "bun-pct-zero" : ""),
      "suspect_total_pct",
      susN
    );

    const freshOffDom = optionalBoxIsOff(
      "total_bundle_include_fresh",
      !!s.fresh_from_cache,
      s.fresh_error,
      useFreshEnabled
    );
    const fp =
      resolveOptionalBoxPct(
        freshLive && !freshOffDom,
        s.fresh_total_pct,
        optKnown.fresh,
        deltaCurStats && deltaCurStats.fresh_total_pct
      ) || 0;
    const freshSubPlain = optionalUpdatedPlain(
      [
        s.fresh_cached_at,
        optKnown.fresh && optKnown.fresh.at,
        data && data.generated_at,
        data && data._restoredSavedAt,
      ],
      freshOffDom
    );
    pushStat(
      "Fresh total",
      fmtSupplyPct(fp) || "0%",
      pctPriorityClass(fp) || (fp <= 0 ? "bun-pct-zero" : ""),
      "fresh_total_pct",
      fp,
      freshSubPlain
    );

    const msOffDom = optionalBoxIsOff(
      "total_bundle_include_multi_send",
      !!s.multi_send_from_cache,
      s.multi_send_error,
      useMultiSendEnabled
    );
    const msResolvedDom = resolveTokenMultiSendTotalPct(view, s);
    const mp =
      resolveOptionalBoxPct(
        msLive && !msOffDom,
        msResolvedDom != null ? msResolvedDom : s.multi_send_total_pct,
        optKnown.multi_send,
        deltaCurStats && deltaCurStats.multi_send_total_pct
      ) || 0;
    const msSubPlain = optionalUpdatedPlain(
      [
        s.multi_send_cached_at,
        optKnown.multi_send && optKnown.multi_send.at,
        data && data.generated_at,
        data && data._restoredSavedAt,
      ],
      msOffDom
    );
    pushStat(
      "Multi-send total",
      fmtSupplyPct(mp) || "0%",
      pctPriorityClass(mp) || (mp <= 0 ? "bun-pct-zero" : ""),
      "multi_send_total_pct",
      mp,
      msSubPlain
    );

    const fundOffDom = optionalBoxIsOff(
      "total_bundle_include_shared_sol",
      !!s.funding_from_cache,
      s.funding_error,
      useSharedSolEnabled
    );
    const fdp =
      resolveOptionalBoxPct(
        fundLive && !fundOffDom,
        s.funding_total_pct,
        optKnown.funding,
        deltaCurStats && deltaCurStats.funding_total_pct
      ) || 0;
    const fundSubPlain = optionalUpdatedPlain(
      [
        s.funding_cached_at,
        optKnown.funding && optKnown.funding.at,
        data && data.generated_at,
        data && data._restoredSavedAt,
      ],
      fundOffDom
    );
    pushStat(
      "Shared SOL total",
      fmtSupplyPct(fdp) || "0%",
      pctPriorityClass(fdp) || (fdp <= 0 ? "bun-pct-zero" : ""),
      "funding_total_pct",
      fdp,
      fundSubPlain
    );

    const singlePct =
      s.single_holders_total_pct != null &&
      Number.isFinite(Number(s.single_holders_total_pct))
        ? Number(s.single_holders_total_pct)
        : 0;
    pushStat(
      "Single holders",
      fmtSupplyPct(singlePct) || "0%",
      pctPriorityClass(singlePct) || "",
      "single_holders_total_pct",
      singlePct
    );

    const t10 =
      s.top10_pct_excluding_known_programs != null &&
      Number.isFinite(Number(s.top10_pct_excluding_known_programs))
        ? Number(s.top10_pct_excluding_known_programs)
        : 0;
    pushStat(
      "Top10 ex-LP",
      fmtSupplyPct(s.top10_pct_excluding_known_programs) || "0%",
      pctPriorityClass(t10) || "",
      "top10_ex_lp",
      t10
    );

    const oldNote = root.querySelector(".bun-delta-note");
    const oldStats = root.querySelector(".bun-stats");
    const mount = document.createElement("div");
    mount.id = "bunStatsMount";
    mountBundleStatsBar(mount, items, ver);
    if (!items.length) {
      console.error("[bundles deltas] no items to paint");
    } else {
      console.info(
        "[bundles deltas] mounted",
        items.length,
        items.map(function (it) {
          return (it.label || "") + "=" + (it.deltaText || "");
        }).join(" | ")
      );
    }

    if (oldNote && oldNote.parentNode) {
      oldNote.parentNode.insertBefore(mount, oldNote);
      try {
        oldNote.remove();
      } catch (_) {
        oldNote.parentNode.removeChild(oldNote);
      }
    } else if (oldStats && oldStats.parentNode) {
      oldStats.parentNode.insertBefore(mount, oldStats);
    } else if (root.firstChild) {
      root.insertBefore(mount, root.firstChild);
    } else {
      root.appendChild(mount);
    }
    if (oldStats && oldStats.parentNode) {
      try {
        oldStats.remove();
      } catch (_) {
        oldStats.parentNode.removeChild(oldStats);
      }
    }
    // Drop any leftover top-level note/stats not inside mount
    try {
      root.querySelectorAll(".bun-delta-note").forEach((n) => {
        if (!mount.contains(n)) n.parentNode && n.parentNode.removeChild(n);
      });
      root.querySelectorAll(":scope > .bun-stats").forEach((n) => {
        if (!mount.contains(n)) n.parentNode && n.parentNode.removeChild(n);
      });
    } catch (_) {
      /* ignore */
    }

    // Commit baseline for the *next* live Analyze only after paint
    if (!isRestore && curStats) {
      const baseline = prev || zeroBundleStats();
      // Next compare should use *this* run's live numbers (not last-known merges that
      // equal display), so change detection tracks real summary fields.
      const statsForNext = cloneBundleStats(curStats);
      const statsForCur = cloneBundleStats(curStats);
      const mKey = mint || "last";
      try {
        saveBundleStatsEntry(mKey, {
          forNext: statsForNext,
          deltaFrom: baseline,
          deltaCur: statsForCur,
        });
        try {
          __adtcLiveBaselineByMint[mKey] = cloneBundleStats(statsForNext);
        } catch (_) {}
      } catch (_) {}
      if (Object.keys(htmlByKeyThisRun).length) {
        try {
          saveBundleDeltaHtml(mKey, htmlByKeyThisRun);
          saveBundleDeltaHtml("last", htmlByKeyThisRun);
        } catch (_) {}
      }
      try {
        data._bundleDeltaPair = {
          mint: bundleStatsMintKey(mint) || "last",
          forNext: statsForNext,
          deltaFrom: baseline,
          deltaCur: statsForCur,
          htmlByKey: { ...htmlByKeyThisRun },
        };
      } catch (_) {}
      try {
        console.info(
          "[bundles baseline committed]",
          "next.total=",
          statsForNext && statsForNext.total_bundle_pct,
          "show.delta.from=",
          baseline && baseline.total_bundle_pct
        );
      } catch (_) {}
    }

    console.info(
      "[bundles deltas DOM]",
      "v=" + ver,
      "items=" + items.length,
      "sample=",
      items[1] ? items[1].valueText + " " + items[1].deltaText : "?"
    );
  } catch (err) {
    console.error("[bundles deltas DOM]", err);
  }

  // Map stats box labels → delta keys (for post-inject on restore)
  const DELTA_LABEL_TO_KEY = {
    Risk: "risk",
    "Total bundle": "total_bundle_pct",
    "Total (multi + similar/suspect)": "total_bundle_pct",
    "showing Similar/suspect": "total_bundle_pct",
    "Similar-size": "similar_size_total_pct",
    "Fresh total": "fresh_total_pct",
    "Multi-send total": "multi_send_total_pct",
    "Shared SOL total": "funding_total_pct",
    "Suspect total": "suspect_total_pct",
    "Similar-sized total": "suspect_total_pct",
    "Single holders": "single_holders_total_pct",
    "Top10 ex-LP": "top10_ex_lp",
  };

  function injectFrozenDeltasIntoDom(rootEl, htmlByKey) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".bun-stat").forEach((el) => {
      const valEl = el.querySelector(".bun-stat-value");
      if (!valEl) return;
      if (
        hasBundleDeltaMarker(valEl.textContent) ||
        valEl.querySelector(".bun-stat-delta")
      ) {
        return;
      }
      const labEl = el.querySelector(".bun-stat-label");
      const lab = String(
        el.getAttribute("data-bun-stat") ||
          (labEl && labEl.textContent) ||
          ""
      ).trim();
      const key = DELTA_LABEL_TO_KEY[lab];
      let html = htmlByKey && key ? htmlByKey[key] : "";
      if (!html || /no change/i.test(String(html))) {
        html =
          key === "risk"
            ? '<span class="bun-stat-delta bun-delta-green">· 0</span>'
            : '<span class="bun-stat-delta bun-delta-green">· 0%</span>';
      }
      valEl.insertAdjacentHTML("beforeend", " ");
      valEl.insertAdjacentHTML("beforeend", html);
    });
  }

  // ── Freeze deltas only (never full bar — full-bar restore caused stale %s) ──
  try {
    const freezeMap = { ...htmlByKeyThisRun };
    if (!isRestore) {
      if (Object.keys(freezeMap).length) {
        if (mint) saveBundleDeltaHtml(mint, freezeMap);
        saveBundleDeltaHtml("last", freezeMap);
        try {
          sessionStorage.setItem(
            "adtc_delta_html_last",
            JSON.stringify(freezeMap)
          );
        } catch (_) {
          /* ignore */
        }
      }
      try {
        if (view && view.summary && typeof view.summary === "object") {
          view.summary._ui_delta_html = freezeMap;
          delete view.summary._ui_stats_bar_html;
        }
        if (data && data.bundles_view && data.bundles_view.summary) {
          data.bundles_view.summary._ui_delta_html = freezeMap;
          delete data.bundles_view.summary._ui_stats_bar_html;
        }
      } catch (_) {
        /* ignore */
      }
      if (data) {
        const baseline = prev || zeroBundleStats();
        const carrySrc =
          (stored && (stored.deltaCur || stored.forNext)) || baseline;
        const statsForNext = mergeLastKnownOptionalStats(curStats, carrySrc);
        const statsForCur = mergeLastKnownOptionalStats(curStats, carrySrc);
        data._bundleDeltaPair = {
          mint: bundleStatsMintKey(mint) || "last",
          forNext: statsForNext,
          deltaFrom: baseline,
          deltaCur: statsForCur,
          htmlByKey: freezeMap,
        };
        data._bundlesStatsBarHtml = null;
      }
      try {
        localStorage.removeItem(BUNDLE_STATS_BAR_SNAP_KEY);
        sessionStorage.removeItem(BUNDLE_STATS_BAR_SNAP_KEY);
      } catch (_) {
        /* ignore */
      }
    }
    // Always force-inject deltas into DOM (live + restore)
    const map =
      (Object.keys(freezeMap).length ? freezeMap : null) ||
      frozenHtml ||
      (s && s._ui_delta_html) ||
      (data && data.bundleDelta && data.bundleDelta.htmlByKey) ||
      (data && data._bundleDeltaPair && data._bundleDeltaPair.htmlByKey) ||
      {};
    injectFrozenDeltasIntoDom(root, map);
    try {
      // Guarantee every stats box has a delta chip (green 0% if missing)
      root.querySelectorAll(".bun-stat").forEach((el) => {
        const valEl = el.querySelector(".bun-stat-value");
        if (!valEl) return;
        if (valEl.querySelector(".bun-stat-delta")) return;
        // Also check if value text already includes a delta paren
        if (/[▲▼]|\(0%?\)/i.test(valEl.textContent || "")) return;
        const s = document.createElement("span");
        s.className = "bun-stat-delta bun-delta-green";
        const lab = (
          el.getAttribute("data-bun-stat") ||
          (el.querySelector(".bun-stat-label") || {}).textContent ||
          ""
        ).toLowerCase();
        // Classic flat: · 0 (risk points) / · 0% (supply)
        s.textContent = lab.indexOf("risk") === 0 ? "· 0" : "· 0%";
        s.setAttribute(
          "style",
          "display:block!important;color:#6ee7a8!important;font-weight:800!important;" +
            "margin-top:6px!important;padding:4px 8px!important;" +
            "background:rgba(0,0,0,0.45)!important;border-radius:6px!important;"
        );
        valEl.appendChild(s);
      });
      const n = root.querySelectorAll(".bun-stat-delta").length;
      console.info(
        "[bundles deltas]",
        "v=" +
          (typeof ADTC_CLIENT_VERSION !== "undefined"
            ? ADTC_CLIENT_VERSION
            : "?"),
        "count=" + n,
        "restore=" + !!isRestore
      );
    } catch (_) {
      /* ignore */
    }
  } catch (err) {
    console.warn("[bundles delta snap]", err);
  }
}

/** Fast paint only: summary tabs + bundles. No Ruggers/history (those freeze Opera). */
function renderSectionsLight(data, query) {
  const sections = (data && data.sections) || {};
  for (const tab of TABS) {
    if (tab === "history" || tab === "ruggers" || tab === "bundles") continue;
    if (sections[tab]) setPanelText(tab, sections[tab]);
  }
  try {
    renderBundlesUi(data);
  } catch (err) {
    console.error("[bundles ui]", err);
    const root = $("bundlesUi");
    if (root) {
      root.innerHTML =
        '<div class="bun-hint"><strong>Bundles UI error</strong><br />' +
        escHtml(String(err && err.message ? err.message : err)) +
        "</div>";
    }
    if (sections.bundles) setPanelText("bundles", sections.bundles);
  }
  const n = (data.alerts_meta && data.alerts_meta.priority_count) || 0;
  if (n > 0) switchTab("alerts");
  else switchTab("overview");
}

/** Heavy Ruggers baseline + panel — must run after UI is unlocked. */
function runRuggersAfterAnalyze(data, query) {
  let rugKey = null;
  try {
    const isQuick = !!(data.quick || data._phase === "quick");
    const track = (data.history_meta || {}).ruggers_track;
    const mintAddr =
      bareMintAddr((data.token && data.token.address) || data.query || "") ||
      "";
    const holdersText = String(((data && data.sections) || {}).holders || "");
    const holdersOk = !!(
      (track &&
        (track.ok || (Array.isArray(track.wallets) && track.wallets.length))) ||
      (data.holders && data.holders.ok) ||
      (holdersText &&
        holdersText.length > 40 &&
        !/unavailable|skipped|quick mode/i.test(holdersText))
    );
    if (isQuick) {
      console.info(
        "[ruggers] skipped — Quick mode (need full Analyze for sellers)"
      );
      if (mintAddr) {
        rugKey = mintKeyFromToken(
          mintAddr,
          (data.token && data.token.chain_id) || "solana"
        );
      }
    } else {
      let result = null;
      try {
        result = processRuggersFromAnalyze(data);
      } catch (procErr) {
        console.error("[ruggers] process threw", procErr);
        result = null;
      }
      let seedAddr = mintAddr;
      if (!seedAddr || seedAddr.length < 32) {
        try {
          seedAddr =
            bareMintAddr(
              (data.token && data.token.address) ||
                data.query ||
                (typeof query === "string" ? query : "") ||
                ($("query") && $("query").value) ||
                ""
            ) || "";
        } catch (_) {
          seedAddr = mintAddr;
        }
      }
      try {
        const seeded = ensureRuggersMintTrack(seedAddr || mintAddr, {
          chain: (data.token && data.token.chain_id) || "solana",
          symbol: (data.token && data.token.symbol) || null,
          name: (data.token && data.token.name) || null,
        });
        if (seeded && seeded.key) {
          if (!result) result = seeded;
          else rugKey = result.key || seeded.key;
        }
      } catch (seedErr) {
        console.warn("[ruggers] seed failed", seedErr);
      }
      if (result && result.key) {
        rugKey = result.key;
        const nBase =
          result.rec && result.rec.first_wallets
            ? Object.keys(result.rec.first_wallets).length
            : 0;
        const nLook = (result.rec && result.rec.lookup_count) || 0;
        console.info(
          "[ruggers] updated",
          result.key,
          "lookups=" + nLook,
          "baseline_wallets=" + nBase,
          holdersOk ? "holders_ok" : "holders_thin"
        );
      } else if (seedAddr || mintAddr) {
        rugKey = mintKeyFromToken(
          seedAddr || mintAddr,
          (data.token && data.token.chain_id) || "solana"
        );
      }
    }
  } catch (err) {
    console.error("[ruggers] process failed", err);
  }
  try {
    refreshRuggersPanel(rugKey);
  } catch (refErr) {
    console.error("[ruggers] refresh failed", refErr);
  }
}

function renderSections(data, query) {
  // Backward-compatible: light paint + deferred ruggers
  renderSectionsLight(data, query);
  setTimeout(() => {
    try {
      runRuggersAfterAnalyze(data, query);
    } catch (err) {
      console.error("[ruggers] deferred failed", err);
    }
  }, 0);
}

function formatViews(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e6) return (x / 1e6).toFixed(1) + "M";
  if (x >= 1e3) return (x / 1e3).toFixed(1) + "K";
  return String(x);
}

function renderPublicStats(j) {
  if (!j || !j.ok) return;
  const views = j.profile_views != null ? j.profile_views : 0;
  const analyzes = j.analyzes != null ? j.analyzes : 0;
  const uniques = j.unique_visitors_today;
  const pill = $("viewStats");
  if (pill) {
    pill.textContent = "views " + formatViews(views);
    pill.className = "pill ok";
    pill.title =
      "Public profile views: " +
      views +
      " · Analyzes: " +
      analyzes +
      (uniques != null ? " · Unique today: " + uniques : "") +
      " · Open /api/stats for JSON";
  }
  const foot = $("footerStats");
  if (foot) {
    foot.textContent =
      "Profile views: " +
      formatViews(views) +
      " · Analyzes: " +
      formatViews(analyzes) +
      (uniques != null ? " · Unique today: " + uniques : "");
  }
  const statsLink = $("statsLink");
  if (statsLink) statsLink.href = apiUrl("/api/stats");
  const badgeLink = $("badgeLink");
  if (badgeLink) badgeLink.href = apiUrl("/badge.svg");
}

async function recordAndLoadStats() {
  // Short timeout so a hung API cannot freeze the whole UI
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(apiUrl("/api/view"), {
      method: "POST",
      headers: headers(false),
      signal: ctrl.signal,
    });
    const j = await r.json();
    renderPublicStats(j);
    return;
  } catch (_e) {
    /* fall through */
  } finally {
    clearTimeout(timer);
  }
  try {
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 5000);
    const r = await fetch(apiUrl("/api/stats"), {
      headers: headers(false),
      signal: ctrl2.signal,
    });
    clearTimeout(t2);
    const j = await r.json();
    renderPublicStats(j);
  } catch (_e) {
    const pill = $("viewStats");
    if (pill) {
      pill.textContent = "views n/a";
      pill.title = "Stats API timed out — service may be waking up. Try refresh.";
    }
  }
}

async function checkHealth() {
  const el = $("serverStatus");
  if (!el) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(apiUrl("/api/health"), {
      headers: headers(false),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (j.ok) {
      const p = j.providers_configured || {};
      const on = Object.entries(p)
        .filter(([k, v]) => k !== "site_gate" && v)
        .map(([k]) => k);
      const remote = apiBase() ? " · remote API" : "";
      el.textContent = on.length
        ? "server ok · " + on.join(", ") + remote
        : "server ok · public APIs only" + remote;
      el.className = "pill ok";
      if (p.site_gate) el.title = "Site gate enabled — set passcode via ⚙";
      else if (apiBase()) el.title = "API: " + apiBase();
      if (j.profile_views != null) {
        renderPublicStats({
          ok: true,
          profile_views: j.profile_views,
          analyzes: j.analyzes,
        });
      }
    } else {
      el.textContent = "server error";
      el.className = "pill bad";
    }
  } catch (e) {
    el.textContent = apiBase() ? "API offline" : "offline";
    el.className = "pill bad";
    el.title = apiBase()
      ? "Cannot reach " + apiBase() + " — check backend + CORS"
      : String(e.message || e);
  } finally {
    clearTimeout(timer);
  }
}

const RUGWATCH_PREF_KEY = "adtc_use_rugwatch";
const FRESH_PREF_KEY = "adtc_use_fresh";
const MULTI_SEND_PREF_KEY = "adtc_use_multi_send";
const SHARED_SOL_PREF_KEY = "adtc_use_shared_sol";
/** Legacy combined pref — migrate once if present */
const FRESH_MULTI_PREF_KEY_LEGACY = "adtc_use_fresh_multi";

function useRugwatchEnabled() {
  const el = $("useRugwatch");
  if (!el) return true;
  return !!el.checked;
}

function useFreshEnabled() {
  const el = $("useFresh");
  if (!el) return true;
  return !!el.checked;
}

function useMultiSendEnabled() {
  const el = $("useMultiSend");
  if (!el) return true;
  return !!el.checked;
}

function useSharedSolEnabled() {
  const el = $("useSharedSol");
  if (!el) return true;
  return !!el.checked;
}

function initCheckboxPref(elId, storageKey, legacyKey) {
  const el = $(elId);
  if (!el) return;
  try {
    let saved = localStorage.getItem(storageKey);
    if (saved == null && legacyKey) {
      const leg = localStorage.getItem(legacyKey);
      if (leg === "0" || leg === "false") saved = "0";
      else if (leg === "1" || leg === "true") saved = "1";
    }
    if (saved === "0" || saved === "false") el.checked = false;
    else if (saved === "1" || saved === "true") el.checked = true;
  } catch (_) {
    /* ignore */
  }
  el.addEventListener("change", () => {
    try {
      localStorage.setItem(storageKey, el.checked ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
  });
}

function initRugwatchPref() {
  initCheckboxPref("useRugwatch", RUGWATCH_PREF_KEY);
}

function initFreshMultiPref() {
  initCheckboxPref("useFresh", FRESH_PREF_KEY, FRESH_MULTI_PREF_KEY_LEGACY);
  initCheckboxPref(
    "useMultiSend",
    MULTI_SEND_PREF_KEY,
    FRESH_MULTI_PREF_KEY_LEGACY
  );
  initCheckboxPref("useSharedSol", SHARED_SOL_PREF_KEY);
  const fresh = $("useFresh");
  const multi = $("useMultiSend");
  const sharedSol = $("useSharedSol");
  const banner = $("heliusFreshMultiWarn");
  function syncHeliusWarnBanner() {
    if (!banner) return;
    const bothFreshMulti = !!(
      fresh &&
      multi &&
      fresh.checked &&
      multi.checked
    );
    const heavyShared = !!(sharedSol && sharedSol.checked);
    // Brighten when Shared SOL is on (heaviest) or Fresh+Multi together
    banner.classList.toggle(
      "helius-warn-active",
      bothFreshMulti || heavyShared
    );
  }
  if (fresh) fresh.addEventListener("change", syncHeliusWarnBanner);
  if (multi) multi.addEventListener("change", syncHeliusWarnBanner);
  if (sharedSol) sharedSol.addEventListener("change", syncHeliusWarnBanner);
  syncHeliusWarnBanner();
}

function initRugwatchNav() {
  const a = $("navRugwatch");
  if (!a) return;
  const cfg = window.ADTC_CONFIG || {};
  const url = (cfg.rugwatchUrl || "https://rugwatch.onrender.com/").trim();
  if (url) a.href = url;
}

/**
 * RugWatch wallet counts on ATC (same idea as RugWatch site):
 *   Local DB N  = SQLite on this ATC host
 *   Cloud N     = GitHub wallet index
 * Pills + stats line + Refresh. Click pill/button to reload.
 */
function fmtRwCount(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function renderRugwatchCounts(data) {
  const localPill = $("pillWallets");
  const cloudPill = $("pillCloud");
  const statsBar = $("statsBar");
  if (!localPill && !cloudPill && !statsBar) return;

  const local = (data && data.local) || {};
  const cloud = (data && data.cloud) || {};

  let localLabel = "n/a";
  let cloudLabel = "—";

  if (localPill) {
    if (local.ok) {
      localLabel = fmtRwCount(local.count);
      localPill.textContent = "Local DB " + localLabel;
      localPill.className = "pill pill-wallets ok";
      const shards = local.shards != null ? local.shards + " shard(s)" : "";
      const names = (local.shard_names || []).join(", ");
      const src =
        local.source === "rugwatch_site"
          ? "via RugWatch site (mirrors its local DB)"
          : "on-disk SQLite on this ATC host";
      localPill.title =
        "Local DB " +
        localLabel +
        " wallet(s) · " +
        src +
        (local.site_url ? " · " + local.site_url : "") +
        (shards ? " · " + shards : "") +
        (names ? " · " + names : "") +
        " · click to refresh" +
        (local.error ? " · " + local.error : "");
    } else {
      localLabel = "n/a";
      localPill.textContent = "Local DB n/a";
      localPill.className = "pill pill-wallets warn";
      localPill.title =
        (local.error ||
          "Local DB unavailable (no SQLite on this host and RugWatch site stats failed).") +
        " · click to refresh";
    }
  }

  if (cloudPill) {
    if (cloud.url_set && cloud.ok) {
      cloudLabel = fmtRwCount(cloud.count);
      cloudPill.textContent = "Cloud " + cloudLabel;
      cloudPill.className = "pill pill-cloud ok";
      cloudPill.title =
        "Cloud (GitHub) wallet list: " +
        cloudLabel +
        " wallet(s)" +
        (cloud.shards != null ? " · " + cloud.shards + " shard(s)" : "") +
        (cloud.method ? " · " + cloud.method : "") +
        " · click to refresh" +
        (cloud.error ? " · " + cloud.error : "");
    } else if (cloud.url_set) {
      cloudLabel = "n/a";
      cloudPill.textContent = "Cloud n/a";
      cloudPill.className = "pill pill-cloud bad";
      cloudPill.title =
        (cloud.error || "Cloud list fetch failed") + " · click to refresh";
    } else {
      cloudLabel = "off";
      cloudPill.textContent = "Cloud off";
      cloudPill.className = "pill pill-cloud warn";
      cloudPill.title =
        (cloud.error || "Cloud list disabled (RUGWATCH_WALLETS_URL empty)") +
        " · click to refresh";
    }
  }

  if (statsBar) {
    const srcNote =
      local.source === "rugwatch_site"
        ? " (from RugWatch site)"
        : local.source === "sqlite"
          ? " (this host)"
          : "";
    statsBar.textContent =
      "Local DB: " +
      localLabel +
      srcNote +
      " · Cloud: " +
      cloudLabel +
      (cloud.ok && cloud.count != null ? " wallets" : "");
    if (data && data.error && !local.ok && !cloud.ok) {
      statsBar.title = String(data.error);
    } else {
      statsBar.title =
        "Local DB = on-disk rugwatch.db, or live count from RugWatch site when ATC has no file. Cloud = GitHub index.";
    }
  }
}

let _rwCountsBusy = false;
async function loadRugwatchCounts() {
  if (_rwCountsBusy) return;
  _rwCountsBusy = true;
  const localPill = $("pillWallets");
  const cloudPill = $("pillCloud");
  const statsBar = $("statsBar");
  const btn = $("rwCountsRefresh");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "…";
  }
  if (localPill) localPill.textContent = "Local DB …";
  if (cloudPill) cloudPill.textContent = "Cloud …";
  if (statsBar) statsBar.textContent = "Loading Local DB + Cloud counts…";
  try {
    const r = await fetch(apiUrl("/api/rugwatch-counts"), {
      headers: headers(false),
      cache: "no-store",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    renderRugwatchCounts(j);
  } catch (e) {
    renderRugwatchCounts({
      ok: false,
      local: {
        count: 0,
        db_found: false,
        ok: false,
        error: String(e.message || e),
      },
      cloud: {
        count: 0,
        url_set: false,
        ok: false,
        error: String(e.message || e),
      },
      error: String(e.message || e),
    });
  } finally {
    _rwCountsBusy = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh";
    }
  }
}

function initRugwatchCounts() {
  const wire = (id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("click", () => loadRugwatchCounts());
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        loadRugwatchCounts();
      }
    });
  };
  wire("pillWallets");
  wire("pillCloud");
  const btn = $("rwCountsRefresh");
  if (btn) btn.addEventListener("click", () => loadRugwatchCounts());
  loadRugwatchCounts();
}

/**
 * After light UI is shown: logs → ruggers → disk persist, each yielding so
 * Opera GX can process clicks between steps.
 *
 * Opera GX: skip Ruggers wallet scan + full persist + history panel rebuild.
 * Those are the post-result freezes (data already painted).
 */
async function finishAnalyzeHeavyWork(data, query) {
  await yieldToUi(0);

  // ── Lite / low-power path ──────────────────────────────────────────
  if (useLiteUi()) {
    try {
      // Log mint only — do not rebuild Logs DOM
      const qArg = String(
        query ||
          (data && data.query) ||
          (data && data.token && data.token.address) ||
          ""
      ).trim();
      let entry = null;
      try {
        entry = buildHistoryEntry(data, qArg);
      } catch (_) {
        entry = null;
      }
      if (entry) {
        try {
          pushHistoryLog(entry);
        } catch (_) {}
      }
    } catch (logErr) {
      console.warn("[logs] opera lite", logErr);
    }

    await yieldToUi(32);
    // Seed mint name only — no 450-wallet freeze/compare/save
    try {
      const mintAddr =
        bareMintAddr(
          (data.token && data.token.address) || data.query || query || ""
        ) || "";
      if (mintAddr) {
        ensureRuggersMintTrack(mintAddr, {
          chain: (data.token && data.token.chain_id) || "solana",
          symbol: (data.token && data.token.symbol) || null,
          name: (data.token && data.token.name) || null,
        });
      }
    } catch (err) {
      console.warn("[ruggers] opera seed", err);
    }

    await yieldToUi(32);
    // Tiny session snapshot only (not multi-MB localStorage)
    try {
      const mini = {
        savedAt: Date.now(),
        query: String(query || "").trim(),
        chain: (data.token && data.token.chain_id) || "",
        data: {
          ok: true,
          generated_at: data.generated_at || new Date().toISOString(),
          market: data.market || null,
          token: data.token || null,
          quick: !!(data.quick || data._phase === "quick"),
          sections: {
            overview: truncateSectionText(
              (data.sections && data.sections.overview) || "",
              4000
            ),
          },
          bundles_view: data.bundles_view
            ? summaryOnlyBundlesView(data.bundles_view)
            : null,
        },
      };
      const raw = JSON.stringify(mini);
      if (raw.length < 200000) {
        try {
          sessionStorage.setItem(LAST_ANALYZE_KEY, raw);
        } catch (_) {}
      }
    } catch (err) {
      console.warn("[save] opera mini", err);
    }

    try {
      unstickPointerLayer();
    } catch (_) {}
    console.info("[boot] Opera lite finishAnalyze — skipped heavy ruggers/save");
    return;
  }

  // ── Full browsers ──────────────────────────────────────────────────
  try {
    recordAnalyzeInLogs(data, query);
  } catch (logErr) {
    console.error("[logs] recordAnalyzeInLogs failed", logErr);
  }

  await yieldToUi(16);
  try {
    runRuggersAfterAnalyze(data, query);
  } catch (err) {
    console.error("[ruggers] after analyze", err);
  }

  await yieldToUi(16);
  try {
    const ok = saveLastAnalyze(data, query);
    try {
      saveSectionsSeparately((data && data.sections) || {});
    } catch (_) {}
    if (!ok) {
      console.warn(
        "[analyze] last Analyze may not fully persist; Bundles backup attempted"
      );
    }
  } catch (err) {
    console.error("[saveLastAnalyze]", err);
  }

  await yieldToUi(0);
  try {
    const snap = loadLastAnalyze();
    if (snap) {
      const raw = JSON.stringify(snap);
      await withTimeout(idbSet(LAST_ANALYZE_KEY, raw), 3000, false);
      await withTimeout(idbSet(LAST_BUNDLES_ONLY_KEY, raw), 3000, false);
    }
  } catch (idbErr) {
    console.warn("[analyze] idb persist", idbErr);
  }
}

async function analyze(ev) {
  if (ev) {
    try {
      ev.preventDefault();
      ev.stopPropagation();
    } catch (_) {}
  }
  showError("");
  const queryEl = $("query");
  const query = queryEl ? String(queryEl.value || "").trim() : "";
  if (!query) {
    showError("Enter a mint, symbol, or name.");
    return;
  }
  const chain = $("chain") ? $("chain").value || null : null;
  const lite = useLiteUi();
  // Respect user checkboxes (including Fresh / Multi-send / Shared SOL)
  const quick = $("quick") ? $("quick").checked : false;
  const include_rugwatch = useRugwatchEnabled();
  const include_fresh = useFreshEnabled();
  const include_multi_send = useMultiSendEnabled();
  const include_shared_sol = useSharedSolEnabled();
  const btn = $("analyzeBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = quick ? "Quick…" : "Analyzing…";
  }
  try {
    const st = $("serverStatus");
    if (st) {
      st.textContent = lite
        ? quick
          ? "lite quick…"
          : "lite analyze…"
        : quick
          ? "quick analyze…"
          : "analyzing…";
      st.className = "pill muted";
    }
  } catch (_) {}

  const ctrl = new AbortController();
  const analyzeTimer = setTimeout(() => ctrl.abort(), lite || quick ? 60000 : 120000);
  let unlocked = false;
  function unlockBtn() {
    if (unlocked) return;
    unlocked = true;
    try {
      clearTimeout(analyzeTimer);
    } catch (_) {}
    try {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Analyze";
      }
    } catch (_) {}
  }

  try {
    const r = await fetch(apiUrl("/api/analyze"), {
      method: "POST",
      headers: headers(true),
      signal: ctrl.signal,
      body: JSON.stringify({
        query,
        chain,
        quick,
        lite,
        include_rugwatch,
        include_fresh,
        include_multi_send,
        include_shared_sol,
        include_fresh_multi_send: include_fresh && include_multi_send,
      }),
    });
    let data;
    try {
      const rawText = await r.text();
      if (rawText.length > 800000 && lite) {
        throw new Error(
          "Response still too large (" +
            Math.round(rawText.length / 1024) +
            " KB). Try another mint or open in Edge/Chrome with ?full=1."
        );
      }
      data = JSON.parse(rawText);
    } catch (pe) {
      if (pe && pe.message && /too large|JSON|parse/i.test(String(pe.message)))
        throw pe;
      throw new Error("Bad response from server");
    }
    if (r.status === 401) {
      showError(data.error || "Unauthorized — set site passcode (⚙).");
      try {
        $("settingsDialog").showModal();
      } catch (_) {}
      return;
    }
    if (r.status === 429) {
      showError(data.error || "Rate limited — try again shortly.");
      return;
    }
    if (!data.ok) {
      showError(data.error || "Analyze failed");
      try {
        setPanelText("overview", data.error || "Analyze failed");
      } catch (_) {}
      try {
        $("summaryBar").hidden = true;
      } catch (_) {}
      return;
    }

    // Unlock immediately — user must stay able to click
    unlockBtn();
    unstickPointerLayer();
    try {
      checkHealth();
    } catch (_) {}

    if (!data.generated_at) data.generated_at = new Date().toISOString();
    data._marketUpdatedAt = data.generated_at;

    // 1) Summary bar only (price / MC / liq) — smallest paint
    try {
      renderSummary(data);
    } catch (err) {
      console.error("[renderSummary]", err);
    }
    await yieldToUi(0);
    try {
      switchTab("overview");
    } catch (_) {}

    // 2) Lite: paint ALL text tabs (plain) + bundles summary — no heavy tables/ruggers
    if (lite) {
      const sections = (data && data.sections) || {};
      const order = ["overview", "alerts", "holders", "maps", "about"];
      for (const tab of order) {
        try {
          const body = sections[tab];
          if (body && String(body).trim()) {
            setPanelText(tab, body);
          } else if (tab === "holders" && quick) {
            setPanelText(
              tab,
              "Holders skipped in Quick mode.\nUncheck Quick and run Analyze again for holder lists (still lite-safe)."
            );
          } else if (tab === "alerts") {
            const am = data.alerts_meta || {};
            setPanelText(
              tab,
              (am.summary && String(am.summary)) ||
                "No alerts text in this response."
            );
          } else if (!body) {
            setPanelText(tab, "(no data for this tab in lite response)");
          }
        } catch (e) {
          console.warn("[lite setPanelText]", tab, e);
        }
        await yieldToUi(0);
      }
      // Bundles: stats cards + text fallback
      try {
        if (sections.bundles) setPanelText("bundles", sections.bundles);
      } catch (_) {}
      await yieldToUi(0);
      try {
        renderBundlesUiOperaLite(data);
      } catch (err) {
        console.warn("[bundles lite]", err);
        try {
          const root = $("bundlesUi");
          if (root && sections.bundles) {
            root.innerHTML =
              '<pre class="panel-text" style="white-space:pre-wrap;padding:12px">' +
              escHtml(String(sections.bundles).slice(0, 8000)) +
              "</pre>";
          }
        } catch (_) {}
      }
      try {
        const n = (data.alerts_meta && data.alerts_meta.priority_count) || 0;
        if (n > 0) switchTab("alerts");
        else switchTab("overview");
      } catch (_) {}
      await yieldToUi(0);
      unstickPointerLayer();
      // Logs + capped Ruggers seed (needs history_meta.ruggers_track from lite API)
      setTimeout(() => {
        try {
          recordAnalyzeInLogs(data, query);
        } catch (e) {
          console.warn("[logs lite]", e);
        }
      }, 200);
      setTimeout(() => {
        try {
          // Seed baseline without painting huge seller tables
          runRuggersAfterAnalyze(data, query);
        } catch (e) {
          console.warn("[ruggers lite process]", e);
          try {
            showRuggersLitePanel(
              bareMintAddr(
                (data.token && data.token.address) || query || ""
              ) || ""
            );
          } catch (_) {}
        }
      }, 450);
      console.info("[analyze] lite path done — rich tabs + ruggers seed");
      return;
    }

    // Full path (only with ?full=1)
    try {
      const sections = (data && data.sections) || {};
      for (const tab of ["overview", "alerts", "maps", "about", "holders"]) {
        if (sections[tab]) {
          try {
            setPanelText(tab, sections[tab]);
          } catch (e) {
            console.warn("[setPanelText]", tab, e);
          }
          await yieldToUi(0);
        }
      }
      const n = (data.alerts_meta && data.alerts_meta.priority_count) || 0;
      if (n > 0) switchTab("alerts");
      else switchTab("overview");
    } catch (err) {
      console.error("[sections text]", err);
    }
    await yieldToUi(0);
    try {
      renderBundlesUi(data);
    } catch (err) {
      console.error("[renderBundlesUi]", err);
    }
    await yieldToUi(0);
    unstickPointerLayer();
    setTimeout(() => {
      finishAnalyzeHeavyWork(data, query).catch((err) =>
        console.error("[finishAnalyzeHeavyWork]", err)
      );
    }, 0);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    showError(
      e && e.name === "AbortError"
        ? "Analyze timed out — try again or use Quick mode."
        : msg
    );
  } finally {
    unlockBtn();
  }
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      switchTab(b.dataset.tab);
      if (b.dataset.tab === "history") {
        // Clear search filter status and show full log (newest first)
        try {
          setLogsCaStatus("", false);
        } catch (_) {}
        refreshHistoryPanel();
        try {
          const list = $("historyList");
          if (list) list.scrollTop = 0;
        } catch (_) {}
      }
      if (b.dataset.tab === "ruggers") {
        // Prefer the mint currently in the summary / query box — never another mint
        const ca = getSummaryBarMintAddr();
        refreshRuggersPanel(
          ca ? mintKeyFromToken(ca, "solana") : _lastRuggersKey || ""
        );
      }
    });
  });
}

function initSettings() {
  const dlg = $("settingsDialog");
  const btn = $("settingsBtn");
  const form = $("settingsForm");
  const tokenEl = $("siteToken");
  const clearBtn = $("clearToken");
  if (!dlg || !btn || !form || !tokenEl) {
    console.warn("[initSettings] settings UI missing — skipped");
    return;
  }
  btn.addEventListener("click", () => {
    tokenEl.value = siteToken();
    if (dlg.showModal) dlg.showModal();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setSiteToken(tokenEl.value.trim());
    if (dlg.close) dlg.close();
    checkHealth();
  });
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      tokenEl.value = "";
      setSiteToken("");
    });
  }
}

/**
 * Optional last-Analyze restore — never on the critical path.
 * Skip huge payloads (they freeze Opera GX while re-rendering).
 * Use ?restore=1 to force, ?safe=1 to never restore and clear heavy keys.
 */
async function restoreBootCache() {
  try {
    const params = new URLSearchParams(location.search || "");
    if (params.get("safe") === "1" || params.get("norestore") === "1") {
      console.info("[boot] skip restore (safe/norestore)");
      return;
    }
    // Default: skip auto-restore on Opera-family browsers (main-thread freezes)
    const ua = String(navigator.userAgent || "");
    const isOpera =
      /OPR\/|Opera|OPX\//i.test(ua) ||
      (typeof navigator.userAgentData !== "undefined" &&
        Array.isArray(navigator.userAgentData.brands) &&
        navigator.userAgentData.brands.some((b) =>
          /Opera|OPR/i.test(String((b && b.brand) || ""))
        ));
    if (isOpera && params.get("restore") !== "1") {
      console.info("[boot] Opera: skip auto-restore (add ?restore=1 to enable)");
      return;
    }

    const cached = await withTimeout(loadLastAnalyzeAsync(), 1500, null);
    if (!cached) return;

    // Huge cached Analyze re-renders freeze the tab (looks fine, no clicks)
    let approx = 0;
    try {
      approx = JSON.stringify(cached).length;
    } catch (_) {
      approx = 0;
    }
    if (approx > 400000) {
      console.warn(
        "[boot] skip restore — payload too large (" + approx + " chars)"
      );
      return;
    }

    restoreLastAnalyze(cached);
  } catch (err) {
    console.warn("[init restore]", err);
  }
}

/** Clear poisoned local caches that can freeze Opera on boot. */
function clearHeavyBootCaches() {
  const keys = [
    LAST_ANALYZE_KEY,
    LAST_BUNDLES_ANALYZE_KEY,
    LAST_BUNDLES_ONLY_KEY,
    BUNDLE_STATS_PREV_KEY,
    BUNDLE_DELTA_HTML_KEY,
    BUNDLE_STATS_BAR_SNAP_KEY,
  ];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch (_) {}
    try {
      sessionStorage.removeItem(k);
    } catch (_) {}
  }
}

/** Ensure nothing is eating clicks (stuck dialog / pointer-events). */
function unstickPointerLayer() {
  try {
    document.documentElement.style.pointerEvents = "auto";
    document.body.style.pointerEvents = "auto";
  } catch (_) {}
  try {
    const dlg = $("settingsDialog");
    if (dlg && dlg.open && typeof dlg.close === "function") dlg.close();
  } catch (_) {}
  try {
    document.querySelectorAll("dialog[open]").forEach((d) => {
      try {
        if (typeof d.close === "function") d.close();
        else d.removeAttribute("open");
      } catch (_) {}
    });
  } catch (_) {}
}

async function init() {
  // Isolate each subsystem so one Opera/localStorage failure cannot blank the site
  function safe(name, fn) {
    try {
      fn();
    } catch (err) {
      console.warn("[init] " + name + " failed", err);
      try {
        if (window.__adtcBootError)
          window.__adtcBootError(name + ": " + (err && err.message));
      } catch (_e) {
        /* ignore */
      }
    }
  }

  // Safe mode: wipe heavy caches that freeze boot
  try {
    const params = new URLSearchParams(location.search || "");
    if (params.get("safe") === "1") {
      clearHeavyBootCaches();
      console.info("[boot] safe=1 cleared heavy caches");
    }
  } catch (_) {}

  unstickPointerLayer();

  // Unstick controls from a prior hung Analyze / modal (Opera GX common)
  try {
    const btn = $("analyzeBtn");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Analyze";
    }
  } catch (_e) {
    /* ignore */
  }
  try {
    if (window.__adtcBootReady) window.__adtcBootReady();
  } catch (_e) {
    /* ignore */
  }

  // 1) Wire interactive controls FIRST — nothing else before this
  safe("tabs", initTabs);
  safe("settings", initSettings);
  const searchForm = $("searchForm");
  const analyzeBtn = $("analyzeBtn");
  if (searchForm) {
    searchForm.addEventListener("submit", (ev) => {
      if (ev) ev.preventDefault();
      analyze(ev);
    });
  } else console.warn("[init] searchForm missing");
  // type=button Analyze — never relies on form navigation
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", (ev) => {
      if (ev) ev.preventDefault();
      analyze(ev);
    });
  }

  try {
    if (useLiteUi()) {
      console.info(
        "[boot] lite UI on (safe paint). Check Fresh/Multi/Shared SOL if you need those scans. ?full=1 for full wallet tables."
      );
    }
  } catch (_) {}

  // 2) Light wiring only (no heavy panel paints)
  safe("history", initHistory);
  safe("ruggers", initRuggers);
  safe("rugwatchPref", initRugwatchPref);
  safe("freshMultiPref", initFreshMultiPref);
  safe("rugwatchNav", initRugwatchNav);

  try {
    window.__ADTC_UI_READY__ = true;
  } catch (_) {}
  unstickPointerLayer();

  // 3) Network / counts after clicks work (never block)
  setTimeout(() => {
    safe("rugwatchCounts", initRugwatchCounts);
    try {
      checkHealth();
    } catch (err) {
      console.warn("[init] health", err);
    }
    try {
      recordAndLoadStats();
    } catch (err) {
      console.warn("[init] stats", err);
    }
  }, 0);

  // Deep link: ?q=mint or #mint
  let autoRun = false;
  try {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || params.get("query");
    if (q && $("query")) {
      $("query").value = q;
      if (params.get("chain") && $("chain")) $("chain").value = params.get("chain");
    }
    if (params.get("auto") === "1" && q) autoRun = true;
  } catch (err) {
    console.warn("[init] deep link", err);
  }

  if (autoRun) {
    try {
      analyze();
    } catch (err) {
      console.warn("[init] auto analyze", err);
    }
    return;
  }

  // 4) Optional cache restore much later (Opera skips entirely)
  setTimeout(() => {
    restoreBootCache().catch((err) => console.warn("[restoreBootCache]", err));
  }, 750);

  // Keep re-asserting clickability for a few seconds (stuck dialogs / extensions)
  let n = 0;
  const poke = setInterval(() => {
    unstickPointerLayer();
    n += 1;
    if (n >= 8) clearInterval(poke);
  }, 500);
}

function startApp() {
  try {
    if (window.__adtcBootReady) window.__adtcBootReady();
  } catch (_e) {
    /* ignore */
  }
  init().catch((err) => {
    console.error("[init]", err);
    try {
      if (window.__adtcBootError) {
        window.__adtcBootError(String((err && err.message) || err));
      }
    } catch (_e) {
      /* ignore */
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  // defer scripts can finish after DOMContentLoaded already fired
  startApp();
}
