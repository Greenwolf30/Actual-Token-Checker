/* Actual Data Token Checker — browser client.
 * Calls YOUR backend /api/* only. Provider keys never reach this page.
 * apiBase comes from config.js (empty = same origin as this static site).
 */

const TABS = ["overview", "holders", "bundles", "alerts", "maps", "about", "ruggers", "history"];
const TOKEN_KEY = "adtc_site_token";
const HISTORY_KEY = "adtc_history_log";
const HISTORY_MAX = 200;
const RUGGERS_KEY = "adtc_ruggers_track";
/** Bump when Flagged-wallet rules change so sticky junk is wiped once. */
const RUGGERS_RULES_VERSION = 8;
/** Sold ≥ this fraction of first-lookup bag → list as seller (99%). */
const RUGGERS_SOLD_FRAC = 0.99;
/** Remaining bag must be ≤ (1 - RUGGERS_SOLD_FRAC) of first_pct to count as sold. */
const RUGGERS_REMAIN_FRAC = 1 - RUGGERS_SOLD_FRAC;
/** Single sellers: min first bag % of supply (top → least holder cutoff). */
const RUGGERS_SINGLE_MIN_PCT = 0.01;

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
  similar: "similar",
  multi: "multi-account",
  multi_send: "multi-send",
  funding: "shared funder",
  insider: "insider",
  launch: "same-slot multi-buys (bots)",
  fresh: "fresh wallets",
  suspect: "suspect",
  single: "single",
};

const $ = (id) => document.getElementById(id);

// ── History log (browser localStorage, max 200; oldest dropped on later lookups) ─

function loadHistoryLog() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x) => x && typeof x === "object").slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function saveHistoryLog(items) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify((items || []).slice(0, HISTORY_MAX))
    );
  } catch {
    /* quota / private mode */
  }
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
  const address = (t.address || "").trim();
  const symbol = (t.symbol || "").trim();
  const q = (query || data.query || symbol || address || "").trim();
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
  holdersSnap = clipSnap(holdersSnap, 10000);
  bundlesSnap = clipSnap(bundlesSnap, 7000);

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
  const items = loadHistoryLog();
  items.unshift(entry);
  const next = items.slice(0, HISTORY_MAX);
  saveHistoryLog(next);
  return next;
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
      " entries, oldest are deleted on consecutive lookups.<br/>" +
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
  refreshHistoryPanel();
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
  try {
    const raw = localStorage.getItem(RUGGERS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return migrateRuggersStore(data);
  } catch {
    return {};
  }
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
      // Full Flagged wipe on rules bump
      copy.flagged_known = {};
      copy.flagged_sellers = {};
      copy.rugwatch_known = {};
      // v8: map legacy "excluded" / re-resolve multi·funding·insider·launch·suspect lanes
      if (copy.first_wallets && typeof copy.first_wallets === "object") {
        for (const fw of Object.values(copy.first_wallets)) {
          if (!fw || typeof fw !== "object") continue;
          if (fw.origin_lane === "excluded" || fw.origin_lane === "single") {
            // Re-resolve on next Analyze from baseline flags
            delete fw.origin_lane;
            changed = true;
          }
        }
      }
      if (copy.status && typeof copy.status === "object") {
        const st = {};
        for (const [w, row] of Object.entries(copy.status)) {
          if (!row || typeof row !== "object") continue;
          const nextRow = { ...row, is_flagged: false };
          if (nextRow.origin_lane === "excluded") {
            delete nextRow.origin_lane;
            changed = true;
          }
          st[w] = nextRow;
        }
        copy.status = st;
      }
      copy.rules_version = RUGGERS_RULES_VERSION;
      changed = true;
    } else {
      // Even on current version: drop invalid sticky Flagged rows
      const fs = copy.flagged_sellers;
      if (fs && typeof fs === "object") {
        const cleaned = {};
        for (const [w, metaW] of Object.entries(fs)) {
          if (
            metaW &&
            typeof metaW === "object" &&
            metaW.entered_via === "sold_while_flagged" &&
            Number(metaW.rules_v) >= RUGGERS_RULES_VERSION
          ) {
            // Collapse to a single initial mint (no consecutive mint lists)
            const sealed = withSingleFlaggedFromMint(metaW);
            if (
              JSON.stringify(metaW.flagged_from_mints || []) !==
              JSON.stringify(sealed.flagged_from_mints || [])
            ) {
              changed = true;
            }
            cleaned[w] = sealed;
          } else {
            changed = true;
          }
        }
        if (
          Object.keys(cleaned).length !== Object.keys(fs).length ||
          changed
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
      localStorage.setItem(RUGGERS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

function saveRuggersStore(store) {
  try {
    const s = store && typeof store === "object" ? store : {};
    if (!s.__meta || typeof s.__meta !== "object") s.__meta = {};
    s.__meta.rules_version = RUGGERS_RULES_VERSION;
    localStorage.setItem(RUGGERS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

function mintKeyFromToken(address, chain) {
  const a = String(address || "").trim();
  if (!a) return "";
  const c = String(chain || "").trim().toLowerCase();
  return c ? c + ":" + a : a;
}

/**
 * Pull compact wallet snapshot from analyze payload (history_meta.ruggers_track)
 * or fall back to parsing holders/bundles text snapshots.
 */
function extractRuggersSnapshot(data) {
  if (!data || !data.ok) return null;
  const t = data.token || {};
  const address = (t.address || "").trim();
  if (!address) return null;
  const hm = data.history_meta || {};
  const track = hm.ruggers_track || data.ruggers_track || null;
  const chain = (t.chain_id || (data.market || {}).chain_id || "").trim() || null;
  const symbol = (t.symbol || "").trim() || null;
  const name = (t.name || "").trim() || null;
  const ts = data.generated_at || new Date().toISOString();

  if (track && Array.isArray(track.wallets) && track.wallets.length) {
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

  if (!Object.keys(wallets).length) return null;
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
    return uploadedSimilar ? "similar" : null;
  }
  if (first.label === "creator" || first.is_creator || first.origin_lane === "creator") {
    return "creator";
  }
  if (uploadedSimilar || first.in_similar) return "similar";
  if (first.in_multi) return "multi";
  if (first.in_multi_send) return "multi_send";
  if (first.in_funding) return "funding";
  if (first.in_insider) return "insider";
  // Launch-window disabled — never route into a launch lane
  if (first.in_fresh) return "fresh";
  if (first.in_suspect) return "suspect";
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
    // Promote excluded/legacy → similar if we learn similar
    if (
      frozen !== "similar" &&
      frozen !== "creator" &&
      (uploadedSimilar || (first && first.in_similar) || (prev && prev.in_similar))
    ) {
      return "similar";
    }
    return frozen;
  }
  // Legacy "excluded" (v7) → re-map to proper bundle lane once
  if (frozen === "excluded" || !frozen) {
    if (uploadedSimilar || (first && first.in_similar) || (prev && prev.in_similar)) {
      return "similar";
    }
    if (cur && cur.in_similar) return "similar";
    const primary = primaryLaneFromBaselineFlags(first, uploadedSimilar);
    if (primary) return primary;
  }
  if (uploadedSimilar || (first && first.in_similar) || (prev && prev.in_similar)) {
    return "similar";
  }
  if (cur && cur.in_similar) return "similar";

  const primary = primaryLaneFromBaselineFlags(first, false);
  if (primary) return primary;
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
function processRuggersFromAnalyze(data) {
  const snap = extractRuggersSnapshot(data);
  if (!snap || !snap.address) return null;
  const key = mintKeyFromToken(snap.address, snap.chain);
  if (!key || key === "__meta") return null;

  const store = loadRuggersStore();
  let rec = store[key];
  if (rec && (rec === store.__meta || !rec.first_wallets && rec.rules_version && !rec.address)) {
    rec = null;
  }
  const now = snap.ts || new Date().toISOString();
  const isFirstLookup =
    !rec || !rec.first_wallets || !Object.keys(rec.first_wallets).length;

  if (isFirstLookup) {
    // First lookup baseline — all Ruggers sections stay empty until later sells
    rec = {
      address: snap.address,
      chain: snap.chain,
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
      // Wallets successfully Uploaded via Ruggers (any section) on this mint
      ruggers_uploaded: {},
      // Similar/Single/Creator sellers who never buy back — stay forever until swing
      sticky_lane_sellers: {},
    };
    for (const [w, info] of Object.entries(snap.wallets || {})) {
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
    // Backfill upload marks from similar pins / legacy uploaded flags
    for (const w of Object.keys(rec.uploaded_similar || {})) {
      markRuggersWalletUploaded(rec, w, "similar");
    }
    // Legacy: origin "uploaded" was wrongly re-marked as section "creator"
    // (made many wallets look like Creator). Prefer real section / origin_lane.
    for (const [w, meta] of Object.entries(rec.flagged_sellers || {})) {
      if (!meta || String(meta.origin || "") !== "uploaded") continue;
      const sec =
        (meta.uploaded_section && String(meta.uploaded_section)) ||
        (meta.origin_lane &&
        RUGGERS_STICKY_LANES.has(String(meta.origin_lane)) &&
        String(meta.origin_lane) !== "creator"
          ? String(meta.origin_lane)
          : null) ||
        (rec.ruggers_uploaded &&
          rec.ruggers_uploaded[w] &&
          rec.ruggers_uploaded[w].section) ||
        "single";
      // Only real mint creator may keep section "creator"
      const secFinal =
        sec === "creator" &&
        rec.creator &&
        String(w).toLowerCase() !== String(rec.creator).toLowerCase()
          ? "single"
          : sec;
      markRuggersWalletUploaded(rec, w, secFinal);
    }
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
  if (!rec.first_wallets || typeof rec.first_wallets !== "object") {
    rec.first_wallets = {};
  }
  for (const [w, info] of Object.entries(snap.wallets || {})) {
    if (!info || !info.in_similar) continue;
    if (rec.first_wallets[w]) {
      rec.first_wallets[w].in_similar = true;
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

  // ── Subsequent Analyzes: enroll NEW holders into baseline ─────────────
  // First sight freezes their bag. If they sell later → Similar / Single / …
  // or Flagged if on RugWatch. Flagged wallets that show up as holders are
  // enrolled the same way so a later dump lands in Flagged.
  if (!isFirstLookup) {
    for (const [w, info] of Object.entries(snap.wallets || {})) {
      if (!w || !info) continue;
      if (rec.first_wallets[w]) continue;
      // Prefer measurable bag (or creator)
      enrollRuggersBaselineWallet(rec, w, info, now);
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
  for (const [fw, meta] of Object.entries(snap.flagged_known || {})) {
    if (!fw) continue;
    // Remember if on this mint track (baseline / currently listed / flagged seller)
    // New holders enrolled above are already in first_wallets
    const onTrack =
      !!(rec.first_wallets && rec.first_wallets[fw]) ||
      !!current[fw] ||
      !!(rec.flagged_sellers && rec.flagged_sellers[fw]);
    if (!onTrack) continue;
    rwKnown[fw] = {
      ...(rwKnown[fw] || {}),
      ...(meta || {}),
      last_seen: now,
    };
  }
  rec.rugwatch_known = rwKnown;

  // Recompute status for every first-lookup wallet
  const status = rec.status && typeof rec.status === "object" ? rec.status : {};
  const flaggedSellers =
    rec.flagged_sellers && typeof rec.flagged_sellers === "object"
      ? { ...rec.flagged_sellers }
      : {};
  const stickyLane =
    rec.sticky_lane_sellers && typeof rec.sticky_lane_sellers === "object"
      ? { ...rec.sticky_lane_sellers }
      : {};
  const unflagNow = [];

  for (const [w, first] of Object.entries(rec.first_wallets || {})) {
    const cur = current[w] || { listed: false, pct_supply: 0, balance: 0 };
    if (!current[w]) {
      cur.listed = false;
      cur.pct_supply = 0;
      cur.balance = 0;
    }

    // Fill first bag on first *observed* hold (creator often missing from top-N
    // on first lookup with null pct — don't invent a dump later).
    if (rec.first_wallets[w] && cur.listed) {
      const fw = rec.first_wallets[w];
      if (
        (fw.pct_supply == null || !Number.isFinite(Number(fw.pct_supply))) &&
        cur.pct_supply != null &&
        Number(cur.pct_supply) > 0
      ) {
        fw.pct_supply = Number(cur.pct_supply);
        first.pct_supply = fw.pct_supply;
      }
      if (
        (fw.balance == null || !Number.isFinite(Number(fw.balance))) &&
        cur.balance != null &&
        Number(cur.balance) > 0
      ) {
        fw.balance = Number(cur.balance);
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
    const uploadedOnThisMint = isRuggersAlreadyUploaded(rec, w);
    let uploadedSection =
      (rec.ruggers_uploaded &&
        rec.ruggers_uploaded[w] &&
        rec.ruggers_uploaded[w].section) ||
      (prev && prev.ruggers_uploaded_section) ||
      null;
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
      // Only the first mint they were flagged on — never append later mints
      // Keep first mint only — do not add this mint if already flagged elsewhere
      const sealed = withSingleFlaggedFromMint(
        { ...(rwKnown[w] || {}), ...prior },
        prior,
        rwKnown[w],
        prev,
        rec.address
      );
      flaggedSellers[w] = {
        ...sealed,
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
        rec.address
      );
      flaggedSellers[w] = {
        ...sealed,
        entered_at: prior.entered_at || now,
        last_update: now,
        phase: "swing",
        ever_flagged: true,
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
    // Ensure baseline memory so future analyzes still track them
    if (!rec.first_wallets[sw]) {
      rec.first_wallets[sw] = {
        pct_supply: meta.first_pct != null ? meta.first_pct : null,
        balance: meta.first_balance != null ? meta.first_balance : null,
        rank: null,
        label: lane === "creator" ? "creator" : null,
        in_similar: lane === "similar",
        origin_lane: lane,
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

  store[key] = rec;
  saveRuggersStore(store);

  // Cloud unflag only for non-lineage cleanup (flagged identity stays for loop)
  if (unflagNow.length) {
    unflagRuggersWalletsOnCloud(unflagNow).catch(() => {
      /* non-fatal */
    });
  }

  return { key, rec, unflagged: unflagNow };
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
 * True if this wallet was successfully Uploaded from Ruggers on THIS mint
 * (any section). Used so Upload (N) only counts not-yet-uploaded wallets.
 */
function isRuggersAlreadyUploaded(rec, wallet) {
  if (!rec || !wallet) return false;
  const w = String(wallet).trim();
  if (!w) return false;
  const up = rec.ruggers_uploaded;
  if (up && typeof up === "object") {
    if (up[w]) return true;
    const wl = w.toLowerCase();
    for (const k of Object.keys(up)) {
      if (String(k).toLowerCase() === wl) return true;
    }
  }
  // Legacy pins / marks from older uploads
  if (isUploadedSimilarOnThisMint(rec, w)) return true;
  const fs = rec.flagged_sellers && rec.flagged_sellers[w];
  if (fs && String(fs.origin || "") === "uploaded") return true;
  const rk = rec.rugwatch_known && rec.rugwatch_known[w];
  if (rk && String(rk.origin || "") === "uploaded") return true;
  return false;
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
      // Initial mint identity for this flag upload (ticker resolved in UI from store)
      flagged_from_mint: rec.address || null,
      flagged_from_mints: rec.address ? [rec.address] : [],
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
          rec.address
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
          rec.address
        );
        flaggedWallets.push({
          ...row,
          tag: "seller",
          is_flagged: true,
          risk_score: metaF.risk_score || st.risk_score,
          label: metaF.label || st.label,
          flagged_from_mint: metaF.flagged_from_mint || null,
          flagged_from_mints: metaF.flagged_from_mints || [],
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
      rec.address
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
    } else if (lane === "similar") {
      pushLaneSeller("similar", row, similarSeen, similarSellers);
    } else if (lane === "multi") {
      pushLaneSeller("multi", row, multiSeen, multiSellers);
    } else if (lane === "multi_send") {
      pushLaneSeller("multi_send", row, multiSendSeen, multiSendSellers);
    } else if (lane === "funding") {
      pushLaneSeller("funding", row, fundingSeen, fundingSellers);
    } else if (lane === "insider") {
      pushLaneSeller("insider", row, insiderSeen, insiderSellers);
    } else if (lane === "launch") {
      pushLaneSeller("single", { ...row, in_launch: false }, singleSeen, singleSellers);
    } else if (lane === "fresh") {
      pushLaneSeller("fresh", row, freshSeen, freshSellers);
    } else if (lane === "suspect") {
      pushLaneSeller("suspect", row, suspectSeen, suspectSellers);
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

/** Force a flagged meta object to carry only the initial mint. */
function withSingleFlaggedFromMint(meta, ...fallbacks) {
  const base = meta && typeof meta === "object" ? { ...meta } : {};
  const initial = pickInitialFlaggedFromMint(base, ...fallbacks);
  base.flagged_from_mint = initial || null;
  base.flagged_from_mints = initial ? [initial] : [];
  return base;
}

/**
 * Resolve a mint CA to display "$TICKER mintAddress" using Ruggers store when known.
 */
function formatFlaggedFromMint(mintAddr) {
  const raw = String(mintAddr || "").trim();
  if (!raw) return "";
  let symbol = "";
  let full = raw;
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
        if (rec.symbol) symbol = String(rec.symbol).replace(/^\$/, "");
        if (addr) full = addr;
        break;
      }
    }
  } catch (_) {
    /* ignore */
  }
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
  const laneName =
    row.lane_label ||
    RUGGERS_LANE_LABEL[originLane] ||
    originLane ||
    "";
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
      const label = formatFlaggedFromMint(initial);
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
        '" title="Upload only wallets not yet uploaded from this mint to RugWatch/cloud">' +
        "Upload" +
        (nUpload ? " (" + nUpload + ")" : " (0)") +
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
  if (key === "suspect") return "suspect_sellers";
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
      // Initial mint identity for this upload (source mint of the flag)
      flagged_from_mint: mint || null,
      flagged_from_mints: mint ? [mint] : [],
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
        " wallet(s) in this section were already uploaded from this mint.\n\n" +
        "Upload count only includes not-yet-uploaded wallets."
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
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    // Optional: same passcode as RugWatch site token if configured
    try {
      const tok = localStorage.getItem("rugwatch_site_token") || "";
      if (tok) headers["X-API-Token"] = tok;
    } catch (_) {
      /* ignore */
    }

    const up = await fetch(base + "/api/upload", {
      method: "POST",
      headers,
      body: JSON.stringify({
        format: payload.format,
        wallets: payload.wallets,
        source: "adtc_ruggers_" + section,
        push_cloud: true,
      }),
    });
    let upData = {};
    try {
      upData = await up.json();
    } catch (_) {
      throw new Error("RugWatch upload returned non-JSON (is " + base + " running?)");
    }
    if (!up.ok || !upData.ok) {
      throw new Error(
        upData.error || "Upload failed (HTTP " + up.status + "). Start RugWatch website."
      );
    }

    // Explicit push if server did not auto-push
    let cloud = upData.cloud || null;
    if (!cloud || !cloud.ok) {
      const push = await fetch(base + "/api/push-cloud", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      try {
        cloud = await push.json();
      } catch (_) {
        cloud = { ok: false, error: "Push cloud bad response" };
      }
      if (!push.ok || !cloud.ok) {
        throw new Error(
          (cloud && cloud.error) ||
            "Imported locally but Push cloud failed. Open RugWatch and click Push cloud."
        );
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

function refreshRuggersPanel(focusKey) {
  const body = $("ruggersBody");
  const dump = $("text-ruggers");
  const store = loadRuggersStore();
  const keys = Object.keys(store)
    .filter((k) => k !== "__meta" && store[k] && typeof store[k] === "object" && store[k].first_wallets)
    .sort((a, b) => {
      const ta = store[a].last_ts || store[a].first_ts || "";
      const tb = store[b].last_ts || store[b].first_ts || "";
      return tb.localeCompare(ta);
    });

  // Resolve focus/sum mint → a key that actually exists in the track store.
  // focusKey is often solana:<mint> after restore/Analyze even when that mint has
  // no Ruggers baseline yet (other mints still in localStorage) — never read
  // store[missing].address (TypeError: reading 'address').
  const resolveRuggersKey = (hint) => {
    const h = String(hint || "").trim();
    if (!h) return "";
    if (keys.includes(h) && store[h]) return h;
    const bare = h.includes(":") ? h.split(":").pop() : h;
    return (
      keys.find(
        (k) =>
          k === h ||
          k === bare ||
          k.endsWith(":" + h) ||
          k.endsWith(":" + bare) ||
          k === "solana:" + h ||
          k === "solana:" + bare ||
          (k.includes(":") && k.split(":").pop() === bare)
      ) || ""
    );
  };

  let activeKey = resolveRuggersKey(focusKey);
  if (!activeKey) {
    const addrEl = $("sumAddr");
    const addr = addrEl ? String(addrEl.textContent || "").trim() : "";
    activeKey = resolveRuggersKey(addr);
  }
  if (!activeKey && keys.length) activeKey = keys[0];

  if (!keys.length) {
    _lastRuggersBuckets = null;
    _lastRuggersRec = null;
    _lastRuggersKey = "";
    const emptyMsg =
      "No Ruggers tracking yet.\n\n" +
      "Run a full Analyze (Quick off) on a mint. The first successful holder snapshot " +
      "is frozen as a baseline (top holders + similar-size wallets + creator).\n\n" +
      "Re-analyze later: wallets that sold ≥99% of their first bag (or disappeared " +
      "from the holder list) appear here as seller. If they buy back, they are labeled swing.\n\n" +
      "When sellers appear, use Export on Creator / Similar / Single sections, " +
      "then import the file in RugWatch → Upload tab.";
    if (body) {
      body.innerHTML =
        '<p class="logs-empty">' +
        emptyMsg.replace(/\n/g, "<br/>") +
        "</p>";
    }
    if (dump) dump.textContent = emptyMsg;
    return;
  }

  // Defensive: keys is non-empty; still never assume store[activeKey] exists
  let rec = store[activeKey];
  if (!rec || typeof rec !== "object") {
    activeKey = keys[0];
    rec = store[activeKey];
  }
  if (!rec || typeof rec !== "object") {
    _lastRuggersBuckets = null;
    _lastRuggersRec = null;
    _lastRuggersKey = "";
    if (body) {
      body.innerHTML =
        '<p class="logs-empty">Ruggers track data is missing or corrupt. Run a full Analyze again.</p>';
    }
    if (dump) dump.textContent = "Ruggers track data is missing or corrupt.";
    return;
  }

  const buckets = ruggersBuckets(rec);
  _lastRuggersBuckets = buckets;
  _lastRuggersRec = rec;
  _lastRuggersKey = activeKey;
  const mintAddr = String(rec.address || "").trim() || "";
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
  html +=
    '<div class="rug-sub">First lookup: ' +
    escHtml(shortWhen(rec.first_ts)) +
    " · Last: " +
    escHtml(shortWhen(rec.last_ts)) +
    " · Lookups: " +
    (rec.lookup_count || 1) +
    " · Tracked wallets: " +
    Object.keys(rec.first_wallets || {}).length +
    "</div>";
  html +=
    '<p class="rug-rules">Rules: first full Analyze freezes a holder baseline; ' +
    "seller lists start <strong>empty</strong>. " +
    "<strong>Re-Analyze later</strong> — wallets that sold <strong>≥99%</strong> of that first bag " +
    "appear under their baseline category: Creator · Similar · Multi-account · Shared funder · " +
    "Insider · Same-slot multi-buys (bots) · Suspect · Single · Flagged wallets (RugWatch). " +
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
    "Similar wallets (sellers)",
    "Similar-size group sellers on THIS mint (lane frozen at first discovery). " +
      "Sell ≥99% → stay here indefinitely if they never return. " +
      "Buy-back → Swing (label kept) · sell again after concurrent lookup → back here. " +
      "Upload → cloud; permanent pin stays under Similar on this mint.",
    buckets.similarSellers,
    "similar"
  );
  html += renderRuggersSection(
    "Multi-account clusters (1 Owner)",
    "Same owner, several large Associated Token Accounts at first lookup. " +
      "Sell ≥99% of first bag → stay here · buy-back → Swing (multi-account label kept) · " +
      "sell again → back here. Export + Upload (same metrics as Creator/Similar).",
    buckets.multiSellers || [],
    "multi"
  );
  html += renderRuggersSection(
    "Multi-send (one → many)",
    "Token or SOL multi-send wallets (one sender distributed to many receivers) at first lookup — " +
      "not multi-account clusters. Same identity rules as other lanes: first bag, sold % of supply, " +
      "seen/sold/swing times, sticky sell ↔ Swing loop, Export + Upload.",
    buckets.multiSendSellers || [],
    "multi_send"
  );
  html += renderRuggersSection(
    "Shared SOL funder clusters (1-Owner)",
    "Wallets that shared a common SOL funder (1-hop) at first lookup. " +
      "Sell ≥99% → stay here · buy-back → Swing (shared funder label kept) · " +
      "sell again → back here. Export + Upload.",
    buckets.fundingSellers || [],
    "funding"
  );
  html += renderRuggersSection(
    "Insider-flagged wallets (Rugcheck)",
    "Rugcheck insider-tagged holders at first lookup. " +
      "Sell ≥99% → stay here · buy-back → Swing (insider label kept) · " +
      "sell again → back here. Export + Upload.",
    buckets.insiderSellers || [],
    "insider"
  );
  // Launch-window / same-slot multi-buys removed from Ruggers (scan disabled).
  html += renderRuggersSection(
    "Fresh wallets",
    "Holders whose bag is almost only this mint (sole / near-sole token) at first lookup. " +
      "Same identity parameters as other Ruggers lanes: first bag %, sold % of supply, " +
      "holds % on Swing, seen/sold/swing times, sticky sell ↔ Swing loop (label “fresh wallets”), " +
      "Export + Upload. Not multi-account and not multi-send.",
    buckets.freshSellers || [],
    "fresh"
  );
  html += renderRuggersSection(
    "Suspect wallets",
    "Bundles suspect-union wallets (not already in a more specific lane above). " +
      "Sell ≥99% → stay here · buy-back → Swing (suspect label kept) · " +
      "sell again → back here. Export + Upload.",
    buckets.suspectSellers || [],
    "suspect"
  );
  html += renderRuggersSection(
    "Single wallets (sellers)",
    "Plain top holders ≥0.01% (not multi / multi-send / funder / insider / fresh / suspect / similar). " +
      "Sell ≥99% → stay here · buy-back → Swing · sell again → back here. Export + Upload.",
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
  dump("Suspect sellers", b0.suspectSellers || []);
  dump("Single sellers", b0.singleSellers);
  dump("Flagged wallets (RugWatch)", b0.flaggedWallets || []);
  dump("Swing traders", b0.swings);
  return lines.join("\n");
}

function initRuggers() {
  // Always load through migration (wipes illegal Flagged sticky rows)
  try {
    loadRuggersStore();
  } catch (_) {
    /* ignore */
  }
  refreshRuggersPanel();
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
  } catch {
    return "";
  }
}

function setSiteToken(v) {
  try {
    if (v) sessionStorage.setItem(TOKEN_KEY, v);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
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
  if (n >= 15) return "pct-critical";
  if (n >= 10) return "pct-high";
  if (n > 5) return "pct-medium";
  if (n >= 2) return "pct-low";
  return "";
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
  const raw = text || "(empty)";
  let html;
  if (tab === "holders") {
    // Wallet address: >5% yellow · >10% red · skip known LP
    html = formatHoldersRichHtml(raw);
  } else if (tab === "alerts") {
    // Same hold-color scheme as Holders / Bundles + green section titles
    html = linkify(raw, true);
    html = colorWalletHolderPcts(html);
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
  $("sumPrice").textContent = fmtUsd(m.price_usd);
  $("sumMc").textContent = fmtUsd(m.market_cap_usd);
  $("sumLiq").textContent = fmtUsd(m.liquidity_usd);
  $("sumVol").textContent = fmtUsd(m.volume_h24_usd);
  const chg = (m.price_change_pct || {}).h24;
  const chgEl = $("sumChg");
  chgEl.textContent = fmtPct(chg);
  chgEl.classList.remove("up", "down");
  if (Number(chg) > 0) chgEl.classList.add("up");
  if (Number(chg) < 0) chgEl.classList.add("down");

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
    "explorer",
    "etherscan",
    "basescan",
    "arbiscan",
    "bubblemaps",
    "twitter",
    "website",
    "telegram",
    "discord",
  ];
  const seen = new Set();
  for (const k of order) {
    if (!links[k] || hideLinkKeys.has(String(k).toLowerCase())) continue;
    seen.add(k);
    const a = document.createElement("a");
    a.href = links[k];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = k;
    linkBar.appendChild(a);
  }
  for (const [k, url] of Object.entries(links)) {
    if (seen.has(k) || !url) continue;
    if (hideLinkKeys.has(String(k).toLowerCase())) continue;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = k;
    linkBar.appendChild(a);
  }

  if (data.disclaimer) $("disclaimer").textContent = data.disclaimer;
  if (data.generated_at) $("generatedAt").textContent = "Generated: " + data.generated_at;
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

/**
 * Persist last successful Analyze for all tabs after page refresh.
 * Replaced only when a new successful Analyze runs.
 */
function saveLastAnalyze(data, query) {
  if (!data || !data.ok) return;
  try {
    const sections = data.sections || {};
    const slim = {
      savedAt: Date.now(),
      query: (query || "").trim(),
      chain:
        (data.token && data.token.chain_id) ||
        (data.market && data.market.chain_id) ||
        "",
      data: {
        ok: true,
        _restoredFromBrowserCache: true,
        quick: !!(data.quick || data._phase === "quick"),
        _phase: data._phase || null,
        market: data.market || null,
        token: data.token || null,
        links: data.links || null,
        holders: data.holders || null,
        bundles: data.bundles || null,
        bundles_view: data.bundles_view || null,
        alerts: data.alerts || null,
        alerts_meta: data.alerts_meta || null,
        history_meta: data.history_meta || null,
        sections: {
          overview: sections.overview || null,
          holders: sections.holders || null,
          bundles: sections.bundles || null,
          alerts: sections.alerts || null,
          maps: sections.maps || null,
          about: sections.about || null,
        },
      },
    };
    let raw = JSON.stringify(slim);
    // Trim heavy fields if over ~4MB
    if (raw.length > 4 * 1024 * 1024) {
      slim.data.history_meta = null;
      slim.data.alerts = null;
      raw = JSON.stringify(slim);
    }
    if (raw.length > 4 * 1024 * 1024) {
      if (slim.data.sections) {
        slim.data.sections.about = null;
        slim.data.sections.maps = null;
      }
      raw = JSON.stringify(slim);
    }
    if (raw.length > 4 * 1024 * 1024) return;
    localStorage.setItem(LAST_ANALYZE_KEY, raw);
    // Keep legacy key in sync for older code paths
    try {
      localStorage.setItem(LAST_BUNDLES_ANALYZE_KEY, raw);
    } catch (_) {
      /* ignore */
    }
  } catch (_) {
    /* quota / private mode */
  }
}

/** @deprecated use saveLastAnalyze */
function saveLastBundlesAnalyze(data, query) {
  saveLastAnalyze(data, query);
}

function loadLastAnalyze() {
  try {
    let raw = localStorage.getItem(LAST_ANALYZE_KEY);
    if (!raw) raw = localStorage.getItem(LAST_BUNDLES_ANALYZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !parsed.data.ok) return null;
    const d = parsed.data;
    const hasSections =
      d.sections &&
      (d.sections.overview ||
        d.sections.holders ||
        d.sections.bundles ||
        d.sections.alerts ||
        d.sections.about ||
        d.sections.maps);
    if (!hasSections && !d.bundles_view && !d.market) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function loadLastBundlesAnalyze() {
  return loadLastAnalyze();
}

/**
 * Restore all Analyze tabs from browser last-known result after refresh.
 * Does not re-log History or re-process Ruggers (lookup_count).
 */
function restoreLastAnalyze() {
  const cached = loadLastAnalyze();
  if (!cached || !cached.data) return false;
  try {
    const data = cached.data;
    data._restoredFromBrowserCache = true;
    if (cached.query && $("query") && !$("query").value.trim()) {
      $("query").value = cached.query;
    }
    if (cached.chain && $("chain")) {
      try {
        $("chain").value = cached.chain;
      } catch (_) {
        /* ignore */
      }
    }
    renderSummary(data);
    const when = cached.savedAt
      ? new Date(cached.savedAt).toLocaleString()
      : "previous Analyze";
    // Prepend last-known marker to RAW text BEFORE setPanelText so green
    // section titles / hold colors still run (never overwrite innerHTML via textContent).
    const lastKnownLine =
      "── Last known (page refresh) · " +
      when +
      " · Run Analyze for live update ──\n\n";
    const sections = data.sections || {};
    for (const tab of TABS) {
      if (tab === "history" || tab === "ruggers" || tab === "bundles") continue;
      if (sections[tab]) {
        setPanelText(tab, lastKnownLine + String(sections[tab]));
      }
    }
    try {
      renderBundlesUi(data);
    } catch (err) {
      console.error("[bundles ui restore]", err);
      if (sections.bundles) {
        setPanelText("bundles", lastKnownLine + String(sections.bundles));
      }
    }
    // Ruggers: show existing browser track for this mint (do not re-process)
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
        const key = mintKeyFromToken(mint, chain);
        refreshRuggersPanel(key);
      } else {
        refreshRuggersPanel();
      }
    } catch (_) {
      try {
        refreshRuggersPanel();
      } catch (_) {
        /* ignore */
      }
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

function saveBundleStatsPrev(mint, stats) {
  const m = bundleStatsMintKey(mint);
  if (!m || !stats) return;
  try {
    const map = loadBundleStatsPrevMap();
    map[m] = { ...stats, savedAt: Date.now() };
    // Cap map size
    const keys = Object.keys(map);
    if (keys.length > 80) {
      keys
        .sort(
          (a, b) => (map[a].savedAt || 0) - (map[b].savedAt || 0)
        )
        .slice(0, keys.length - 80)
        .forEach((k) => delete map[k]);
    }
    localStorage.setItem(BUNDLE_STATS_PREV_KEY, JSON.stringify(map));
  } catch (_) {
    /* ignore */
  }
}

function loadBundleStatsPrev(mint) {
  const m = bundleStatsMintKey(mint);
  if (!m) return null;
  const map = loadBundleStatsPrevMap();
  if (map[m] && typeof map[m] === "object") return map[m];
  // Legacy keys may have been full "solana:mint" or mixed forms
  for (const k of Object.keys(map)) {
    const bare = bundleStatsMintKey(k);
    if (bare === m && map[k] && typeof map[k] === "object") return map[k];
  }
  return null;
}

/**
 * Change since last live Analyze for this mint.
 * Supply tiles: absolute percentage-points (e.g. 12% → 15% ⇒ ▲ +3.0%).
 * Risk: absolute score points (e.g. 40 → 48 ⇒ ▲ +8).
 * Returns HTML with arrow + color, or "".
 *
 * kind: "pct" (default) | "score"
 */
function formatBundleStatDelta(cur, prev, kind) {
  const c = cur != null && Number.isFinite(Number(cur)) ? Number(cur) : null;
  const p = prev != null && Number.isFinite(Number(prev)) ? Number(prev) : null;
  if (c == null || p == null) return "";
  const diff = c - p;
  if (!Number.isFinite(diff) || Math.abs(diff) < 1e-12) return "";

  const isScore = kind === "score";
  // Hide tiny noise: risk < 0.5 pt · supply < 0.05 percentage points
  if (isScore) {
    if (Math.abs(diff) < 0.5) return "";
  } else if (Math.abs(diff) < 0.05) {
    return "";
  }

  const up = diff > 0;
  const arrow = up ? "▲" : "▼";
  const sign = up ? "+" : "−";
  const mag = Math.abs(diff);

  // Color intensity from magnitude (maps into existing 1–25 / 25–50 / … bands)
  // Risk: 1 pt → ~5, 5 pts → 25 · Supply: 0.5pp → 10, 1.25pp → 25, 5pp → 100
  const colorMag = isScore
    ? Math.min(99, mag * 5)
    : Math.min(99, mag * 20);
  const cls = bundleChangeDeltaClass(Math.max(1, colorMag));

  let label;
  if (isScore) {
    label = Math.round(mag).toString();
  } else {
    label =
      (mag >= 10 ? mag.toFixed(0) : mag.toFixed(1).replace(/\.0$/, "")) + "%";
  }

  return (
    '<span class="bun-stat-delta ' +
    cls +
    '" title="Change since last Analyze of this mint">' +
    arrow +
    " " +
    sign +
    label +
    "</span>"
  );
}

function extractBundleSummaryStats(s, riskScore) {
  return {
    risk: riskScore,
    total_bundle_pct:
      s.total_bundle_pct != null && Number.isFinite(Number(s.total_bundle_pct))
        ? Number(s.total_bundle_pct)
        : null,
    similar_size_total_pct:
      s.similar_size_total_pct != null &&
      Number.isFinite(Number(s.similar_size_total_pct))
        ? Number(s.similar_size_total_pct)
        : null,
    fresh_total_pct:
      s.fresh_total_pct != null && Number.isFinite(Number(s.fresh_total_pct))
        ? Number(s.fresh_total_pct)
        : null,
    multi_send_total_pct:
      s.multi_send_total_pct != null &&
      Number.isFinite(Number(s.multi_send_total_pct))
        ? Number(s.multi_send_total_pct)
        : null,
    funding_total_pct:
      s.funding_total_pct != null && Number.isFinite(Number(s.funding_total_pct))
        ? Number(s.funding_total_pct)
        : null,
    suspect_total_pct:
      s.suspect_total_pct != null && Number.isFinite(Number(s.suspect_total_pct))
        ? Number(s.suspect_total_pct)
        : null,
    top10_ex_lp:
      s.top10_pct_excluding_known_programs != null &&
      Number.isFinite(Number(s.top10_pct_excluding_known_programs))
        ? Number(s.top10_pct_excluding_known_programs)
        : null,
  };
}

/**
 * Card UI for Bundles tab from structured bundles_view.
 * Never dumps raw JSON / monospaced report into the main panel.
 */
function renderBundlesUi(data) {
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

  const mint =
    (data.token && data.token.address) ||
    (data.market && data.market.address) ||
    (view.token_address || "") ||
    "";
  const prev = mint ? loadBundleStatsPrev(mint) : null;
  const curStats = extractBundleSummaryStats(s, riskScore);
  const isRestore = !!(data && data._restoredFromBrowserCache);

  function stat(label, valueHtml) {
    return (
      '<div class="bun-stat"><span class="bun-stat-label">' +
      escHtml(label) +
      '</span><span class="bun-stat-value">' +
      valueHtml +
      "</span></div>"
    );
  }

  function withDelta(mainHtml, key) {
    // Deltas only on live Analyze (not page-refresh restore) and only when
    // we have a previous live run for this mint (2nd+ Analyze).
    if (isRestore || !prev) return mainHtml;
    const kind = key === "risk" ? "score" : "pct";
    const d = formatBundleStatDelta(curStats[key], prev[key], kind);
    return d ? mainHtml + " " + d : mainHtml;
  }

  let html = "";
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
  // Total bundle = unique wallets across counted vectors (no double-count)
  {
    // Always show a value (0% when none of the counted vectors hit)
    const tbp =
      s.total_bundle_pct != null && Number.isFinite(Number(s.total_bundle_pct))
        ? Number(s.total_bundle_pct)
        : 0;
    const showSimSus =
      s.total_bundle_mode === "fallback_similar_suspect" ||
      s.total_bundle_show_similar_suspect === true;
    // Fallback only: short label, no extra wording
    const totalLabel = showSimSus ? "showing Similar/suspect" : "Total bundle";
    html += stat(totalLabel, withDelta(bunPctHtml(tbp), "total_bundle_pct"));
  }
  html += stat(
    "Similar-size",
    withDelta(bunPctHtml(s.similar_size_total_pct), "similar_size_total_pct")
  );
  html += stat(
    "Fresh total",
    withDelta(bunPctHtml(s.fresh_total_pct), "fresh_total_pct")
  );
  {
    const msErr = String(s.multi_send_error || "");
    const msSkipped = /scan off|enable [“"]Multi|Multi-send scan off/i.test(msErr);
    html += stat(
      "Multi-send total",
      msSkipped
        ? '<span style="color:var(--text-muted)">skipped</span>'
        : withDelta(bunPctHtml(s.multi_send_total_pct), "multi_send_total_pct")
    );
  }
  {
    const fundErr = String(s.funding_error || "");
    const fundSkipped = /scan off|enable .Shared SOL|Shared SOL funder scan off/i.test(
      fundErr
    );
    const fundCached = !!s.funding_from_cache;
    let sharedSolVal;
    if (fundSkipped && !fundCached && s.funding_total_pct == null) {
      sharedSolVal = '<span style="color:var(--text-muted)">skipped</span>';
    } else {
      sharedSolVal = withDelta(
        bunPctHtml(s.funding_total_pct),
        "funding_total_pct"
      );
    }
    html += stat("Shared SOL total", sharedSolVal);
  }
  html += stat(
    "Suspect total",
    withDelta(bunPctHtml(s.suspect_total_pct), "suspect_total_pct")
  );
  html += stat(
    "Top10 ex-LP",
    withDelta(
      bunPctHtml(s.top10_pct_excluding_known_programs),
      "top10_ex_lp"
    )
  );
  html += "</div>";

  // After a live Analyze, store stats as baseline for next run
  if (!isRestore && mint) {
    saveBundleStatsPrev(mint, curStats);
  }

  const src = (s.sources_used || []).join(", ") || view.method || view.source || "—";
  html +=
    '<p class="bun-meta">Sources: ' +
    escHtml(src) +
    " · Heuristic only — not proof of identity</p>";
  // Total bundle = counted risk vectors only (similar-size + suspect excluded)
  if (s.total_bundle_additive || s.total_bundle_by_vector) {
    const bv = s.total_bundle_by_vector || {};
    const parts = [];
    const labels = {
      multi_account: "multi-account",
      similar_size: "similar-size",
      insider: "insider",
      multi_send: "multi-send",
      fresh: "fresh",
      shared_funder: "shared funder",
      suspect: "suspect",
    };
    for (const [k, lab] of Object.entries(labels)) {
      const m = bv[k];
      if (!m || m.excluded_from_total) continue;
      const p = m.pct != null && Number.isFinite(Number(m.pct)) ? Number(m.pct) : null;
      const n = m.count != null ? Number(m.count) : 0;
      if (p != null && p > 0) {
        parts.push(lab + " " + p.toFixed(2) + "%");
      } else if (n > 0) {
        parts.push(lab + " n/a%");
      }
    }
    const uniqN =
      s.total_bundle_unique_wallets != null
        ? s.total_bundle_unique_wallets
        : s.flagged_wallets;
    html +=
      '<p class="bun-meta">Total bundle = unique wallets across counted vectors ' +
      "(each wallet once, max hold %; no double-count)" +
      (uniqN != null ? " · " + escHtml(String(uniqN)) + " wallet(s)" : "") +
      (parts.length
        ? ". Per-vector (for reference): " + escHtml(parts.join(" + "))
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

  // Primary categories (anything other than similar-size / suspect)
  const clusters = view.clusters || [];
  const ins = view.insider_wallets || [];
  const fundEarly = view.funding_clusters || [];
  const freshEarly = view.fresh_wallets || [];
  const msWalletsEarly = view.multi_send_wallets || [];
  const tokenMsEarly = view.multi_send_clusters || [];
  const solMsEarly = view.sol_multi_send_clusters || [];
  const hasPrimaryCats = !!(
    clusters.length ||
    ins.length ||
    fundEarly.length ||
    freshEarly.length ||
    msWalletsEarly.length ||
    tokenMsEarly.length ||
    solMsEarly.length ||
    (s.total_bundle_mode && s.total_bundle_mode === "primary" &&
      Number(s.total_bundle_pct) > 0 &&
      !s.total_bundle_show_similar_suspect)
  );
  // Prefer server flag when present
  const showSimilarSuspect =
    s.total_bundle_show_similar_suspect != null
      ? !!s.total_bundle_show_similar_suspect
      : !hasPrimaryCats;

  // Multi-account
  if (clusters.length) {
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Multi-account clusters</span>' +
      '<span class="bun-section-total">' +
      escHtml(String(clusters.length)) +
      " owner(s) · several ATAs each</span></div><div class=\"bun-section-body\">";
    html += bunWalletTable(clusters, [
      {
        key: "wallet",
        label: "Owner",
        render: (v) => bunWalletLink(v),
      },
      {
        key: "accounts",
        label: "ATAs",
        render: (v) => escHtml(v != null ? String(v) : "—"),
      },
      {
        key: "pct_supply",
        label: "Total hold",
        render: (v) => bunPctHtml(v),
      },
    ]);
    html += "</div></section>";
  } else {
    html += bunEmptySection(
      "Multi-account clusters",
      "None found — one owner with several large Associated Token Accounts."
    );
  }

  // Similar-size — only when primary categories are all empty (fallback)
  const sims = view.similar_size_groups || [];
  if (showSimilarSuspect) {
    if (sims.length) {
      html +=
        '<section class="bun-section"><div class="bun-section-head">' +
        '<span class="bun-section-title">Similar-size groups</span>' +
        '<span class="bun-section-total">' +
        bunPctHtml(s.similar_size_total_pct) +
        " combined · fallback</span></div><div class=\"bun-section-body\">";
      html +=
        '<p class="bun-sub">Shown because multi-account, insider, multi-send, fresh, and shared SOL are all empty this scan.</p>';
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
      html += "</div></section>";
    } else {
      html += bunEmptySection(
        "Similar-size groups",
        "None found — top wallets with nearly the same bag size."
      );
    }
  }

  // Insiders
  if (ins.length) {
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Insider-flagged (Rugcheck)</span>' +
      '<span class="bun-section-total">' +
      escHtml(String(ins.length)) +
      " wallet(s)</span></div><div class=\"bun-section-body\">";
    html += bunWalletTable(ins, [
      { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
      { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
    ]);
    html += "</div></section>";
  } else {
    html += bunEmptySection("Insider-flagged (Rugcheck)", "None found this scan.");
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

  // Multi-send — split: one-wallet senders vs across receivers (LP excluded)
  const msWallets = view.multi_send_wallets || [];
  const tokenMs = view.multi_send_clusters || [];
  const solMs = view.sol_multi_send_clusters || [];
  const msCached = !!s.multi_send_from_cache;
  if (msWallets.length || tokenMs.length || solMs.length) {
    const shape = String(s.multi_send_hold_shape || "");
    let shapeNote = "";
    if (shape === "mostly_one_wallet_sender") {
      shapeNote =
        "Hold shape: mostly still on sender wallet(s) — not spread across receivers.";
    } else if (shape === "mostly_across_receivers") {
      shapeNote =
        "Hold shape: mostly across receiver wallets — not one sender bag.";
    }
    html +=
      '<section class="bun-section"><div class="bun-section-head">' +
      '<span class="bun-section-title">Multi-send (one → many)' +
      (msCached ? " (last known)" : "") +
      "</span>" +
      '<span class="bun-section-total">combined ' +
      bunPctHtml(s.multi_send_total_pct) +
      " · " +
      escHtml(String(msWallets.length || 0)) +
      " wallet(s)" +
      (msCached ? " · no re-scan" : "") +
      "</span></div><div class=\"bun-section-body\">";
    if (msCached) {
      html +=
        '<p class="bun-sub">Last known Multi-send for this mint (checkbox off — no Helius pings). Check Multi-send to refresh.</p>';
    }
    html +=
      '<p class="bun-sub">Senders (each one wallet): ' +
      bunPctHtml(s.multi_send_sender_total_pct) +
      " · " +
      escHtml(String(s.multi_send_sender_count != null ? s.multi_send_sender_count : "—")) +
      " sender(s) · Receivers (across wallets): " +
      bunPctHtml(s.multi_send_receiver_total_pct) +
      " · " +
      escHtml(
        String(
          s.multi_send_receiver_count != null ? s.multi_send_receiver_count : "—"
        )
      ) +
      " receiver(s). LP/bonding-curve wallets excluded.</p>";
    if (shapeNote) {
      html += '<p class="bun-sub">' + escHtml(shapeNote) + "</p>";
    }
    if (msWallets.length) {
      html += '<p class="bun-sub">All wallets involved (by current supply %)</p>';
      html += bunWalletTable(msWallets, [
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
    for (const mc of solMs) {
      const hs = String(mc.hold_shape || "");
      const hsNote =
        hs === "mostly_one_wallet_sender"
          ? " · mostly still on funder"
          : hs === "mostly_across_receivers"
            ? " · mostly across funded wallets"
            : "";
      html +=
        '<div class="bun-cluster"><div class="bun-cluster-head">SOL funder ' +
        bunWalletLink(mc.sender) +
        " holds " +
        bunPctHtml(mc.sender_pct) +
        " (one wallet) → " +
        escHtml(String(mc.receiver_count || (mc.receivers || []).length || 0)) +
        " wallets hold " +
        bunPctHtml(
          mc.receivers_total_pct != null ? mc.receivers_total_pct : null
        ) +
        " · cluster " +
        bunPctHtml(mc.total_pct) +
        escHtml(hsNote) +
        "</div>";
      html += bunWalletTable(mc.receivers || [], [
        { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
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
    } else if (heliusRan) {
      emptyMsg =
        "None this scan — Helius ran, but no one→many token/SOL multi-send showed in the recent history window. " +
        "That is normal for many mints. LP/bonding-curve (~pool %) is never counted as a multi-send sender.";
    } else {
      emptyMsg =
        "None found — multi-send needs HELIUS_API_KEY on the API (Render) + full Analyze (not Quick). " +
        "Key is server-side only; not web/config.js.";
    }
    html += bunEmptySection("Multi-send (one → many)", emptyMsg);
  }

  // Launch-window removed from Bundles (Helius scan disabled).

  // Suspects — only when primary categories are all empty (fallback)
  const sus = view.suspect_wallets || [];
  if (showSimilarSuspect) {
    let susTot = s.suspect_total_pct;
    if (susTot == null && sus.length) {
      let sum = 0;
      const seen = new Set();
      for (const r of sus) {
        const w = String((r && r.wallet) || "").trim();
        if (!w || seen.has(w)) continue;
        seen.add(w);
        const p = Number(r.pct_supply);
        if (Number.isFinite(p) && p > 0) sum += p;
      }
      if (sum > 100) sum = 100;
      susTot = sum > 0 ? sum : null;
    }
    if (sus.length) {
      html +=
        '<section class="bun-section"><div class="bun-section-head">' +
        '<span class="bun-section-title">Suspect wallets</span>' +
        '<span class="bun-section-total">total ' +
        bunPctHtml(susTot) +
        " · " +
        escHtml(String(s.suspect_wallet_count || sus.length)) +
        " wallet(s) · fallback</span></div><div class=\"bun-section-body\">";
      html +=
        '<p class="bun-sub">Shown because multi-account, insider, multi-send, fresh, and shared SOL are all empty this scan.</p>';
      html += bunWalletTable(sus, [
        { key: "wallet", label: "Wallet", render: (v) => bunWalletLink(v) },
        { key: "pct_supply", label: "Holds", render: (v) => bunPctHtml(v) },
        {
          key: "reasons",
          label: "Why",
          render: (v) => {
            const list = (Array.isArray(v) ? v : v ? [v] : []).filter((r) => {
              const t = String(r || "").toLowerCase();
              return !(
                t.startsWith("funded by ") || t.indexOf("common funder") >= 0
              );
            });
            return escHtml(list.length ? list.join("; ") : "—");
          },
        },
      ]);
      html += "</div></section>";
    } else {
      html += bunEmptySection(
        "Suspect wallets",
        "None tagged this scan."
      );
    }
  }

  root.innerHTML = html;
}

function renderSections(data, query) {
  const sections = (data && data.sections) || {};
  for (const tab of TABS) {
    if (tab === "history" || tab === "ruggers" || tab === "bundles") continue;
    if (sections[tab]) setPanelText(tab, sections[tab]);
  }
  // Bundles: card UI (structured), not monospaced text dump
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
  // Log successful Analyze into browser History (max HISTORY_MAX; drop oldest)
  try {
    // Prefer full analyze (not quick-only empty holders) when possible
    const isQuick = !!(data.quick || data._phase === "quick");
    const holdersOk = !!(
      (data.holders && data.holders.ok) ||
      (sections.holders && !/unavailable|skipped|quick/i.test(sections.holders || ""))
    );
    if (!isQuick || holdersOk || data.ok) {
      const entry = buildHistoryEntry(data, query);
      if (entry) {
        // Skip pure quick market-only if already have empty market-only noise:
        // still record — user searched it
        pushHistoryLog(entry);
      }
    }
  } catch {
    /* ignore history failures */
  }
  refreshHistoryPanel();

  // Ruggers: first-lookup baseline + sell/swing tracking (needs holder snapshot)
  let rugKey = null;
  try {
    const isQuick = !!(data.quick || data._phase === "quick");
    const track = (data.history_meta || {}).ruggers_track;
    const holdersOk = !!(
      (track && track.ok) ||
      (data.holders && data.holders.ok) ||
      (sections.holders && !/unavailable|skipped|quick/i.test(sections.holders || ""))
    );
    if (isQuick) {
      console.info("[ruggers] skipped — Quick mode (need full Analyze for sellers)");
    } else if (!holdersOk) {
      console.warn("[ruggers] skipped — holders/ruggers_track not ok");
    } else {
      const result = processRuggersFromAnalyze(data);
      if (result && result.key) {
        rugKey = result.key;
        const nBase = result.rec && result.rec.first_wallets
          ? Object.keys(result.rec.first_wallets).length
          : 0;
        const nLook = (result.rec && result.rec.lookup_count) || 0;
        console.info(
          "[ruggers] updated",
          result.key,
          "lookups=" + nLook,
          "baseline_wallets=" + nBase
        );
      } else {
        console.warn("[ruggers] process returned null (no mint/snapshot)");
      }
    }
  } catch (err) {
    console.error("[ruggers] process failed", err);
  }
  refreshRuggersPanel(rugKey);

  // Prefer Alerts tab when there are top-priority warnings
  const n = (data.alerts_meta && data.alerts_meta.priority_count) || 0;
  if (n > 0) switchTab("alerts");
  else switchTab("overview");
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
  const views = j.profile_views ?? 0;
  const analyzes = j.analyzes ?? 0;
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
  } catch {
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
  } catch {
    const pill = $("viewStats");
    if (pill) {
      pill.textContent = "views n/a";
      pill.title = "Stats API timed out — service may be waking up. Try refresh.";
    }
  }
}

async function checkHealth() {
  const el = $("serverStatus");
  try {
    const r = await fetch(apiUrl("/api/health"), { headers: headers(false) });
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
  }
}

const RUGWATCH_PREF_KEY = "adtc_use_rugwatch";
const FRESH_PREF_KEY = "adtc_use_fresh";
const MULTI_SEND_PREF_KEY = "adtc_use_multi_send";
const SHARED_SOL_PREF_KEY = "adtc_use_shared_sol";
/** Last full Analyze payload (all tabs; survives page refresh until next Analyze). */
const LAST_BUNDLES_ANALYZE_KEY = "adtc_last_bundles_analyze";
const LAST_ANALYZE_KEY = "adtc_last_analyze";
/** Previous Bundles summary stats per mint (for since-last-Analyze deltas). */
const BUNDLE_STATS_PREV_KEY = "adtc_bundle_stats_prev";
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

async function analyze(ev) {
  if (ev) ev.preventDefault();
  showError("");
  const query = $("query").value.trim();
  if (!query) {
    showError("Enter a mint, symbol, or name.");
    return;
  }
  const chain = $("chain").value || null;
  const quick = $("quick").checked;
  const include_rugwatch = useRugwatchEnabled();
  const include_fresh = useFreshEnabled();
  const include_multi_send = useMultiSendEnabled();
  const include_shared_sol = useSharedSolEnabled();
  const btn = $("analyzeBtn");
  btn.disabled = true;
  btn.textContent = quick ? "Quick…" : "Analyzing…";
  setPanelText("overview", "Loading… this can take up to ~90s for holders/about.");

  try {
    const r = await fetch(apiUrl("/api/analyze"), {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        query,
        chain,
        quick,
        include_rugwatch,
        include_fresh,
        include_multi_send,
        include_shared_sol,
        // legacy combined flag (true only if both on)
        include_fresh_multi_send: include_fresh && include_multi_send,
      }),
    });
    let data;
    try {
      data = await r.json();
    } catch {
      throw new Error("Bad response from server");
    }
    if (r.status === 401) {
      showError(data.error || "Unauthorized — set site passcode (⚙).");
      $("settingsDialog").showModal();
      return;
    }
    if (r.status === 429) {
      showError(data.error || "Rate limited — try again shortly.");
      return;
    }
    if (!data.ok) {
      showError(data.error || "Analyze failed");
      setPanelText("overview", data.error || "Analyze failed");
      $("summaryBar").hidden = true;
      return;
    }
    renderSummary(data);
    renderSections(data, query);
    // Persist all tabs for page refresh until next Analyze
    try {
      saveLastAnalyze(data, query);
    } catch (_) {
      /* ignore */
    }
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => {
      switchTab(b.dataset.tab);
      if (b.dataset.tab === "history") refreshHistoryPanel();
      if (b.dataset.tab === "ruggers") refreshRuggersPanel();
    });
  });
}

function initSettings() {
  const dlg = $("settingsDialog");
  $("settingsBtn").addEventListener("click", () => {
    $("siteToken").value = siteToken();
    dlg.showModal();
  });
  $("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    setSiteToken($("siteToken").value.trim());
    dlg.close();
    checkHealth();
  });
  $("clearToken").addEventListener("click", () => {
    $("siteToken").value = "";
    setSiteToken("");
  });
}

function init() {
  initTabs();
  initSettings();
  initHistory();
  initRuggers();
  initRugwatchPref();
  initFreshMultiPref();
  initRugwatchNav();
  initRugwatchCounts();
  $("searchForm").addEventListener("submit", analyze);
  checkHealth();
  recordAndLoadStats();

  // Deep link: ?q=mint or #mint
  const params = new URLSearchParams(location.search);
  const q = params.get("q") || params.get("query");
  if (q) {
    $("query").value = q;
    if (params.get("chain")) $("chain").value = params.get("chain");
    if (params.get("auto") === "1") analyze();
  } else {
    // No auto-analyze: restore last Analyze (all tabs) after page refresh
    restoreLastAnalyze();
  }
}

document.addEventListener("DOMContentLoaded", init);
