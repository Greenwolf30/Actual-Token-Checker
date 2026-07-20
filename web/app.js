/* Actual Data Token Checker — browser client.
 * Calls YOUR backend /api/* only. Provider keys never reach this page.
 * apiBase comes from config.js (empty = same origin as this static site).
 */

const TABS = ["overview", "holders", "bundles", "alerts", "maps", "about", "ruggers", "history"];
const TOKEN_KEY = "adtc_site_token";
const HISTORY_KEY = "adtc_history_log";
const HISTORY_MAX = 20;
const RUGGERS_KEY = "adtc_ruggers_track";
/** Sold ≥ this fraction of first-lookup bag → list as seller (99%). */
const RUGGERS_SOLD_FRAC = 0.99;
/** Remaining bag must be ≤ (1 - RUGGERS_SOLD_FRAC) of first_pct to count as sold. */
const RUGGERS_REMAIN_FRAC = 1 - RUGGERS_SOLD_FRAC;

const $ = (id) => document.getElementById(id);

// ── History log (browser localStorage, max 20) ───────────────────────

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
    "  Last " + HISTORY_MAX + " token searches on this browser (oldest dropped when full)",
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
      '<p class="logs-empty">Run Analyze — successful searches are logged here (max 20).<br/>' +
      "Each entry shows Overview · Holders · Bundles side by side.<br/>" +
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
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function saveRuggersStore(store) {
  try {
    localStorage.setItem(RUGGERS_KEY, JSON.stringify(store || {}));
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
        if (wallets[w]) wallets[w].in_similar = true;
        else
          wallets[w] = {
            pct_supply: g.avg_pct,
            balance: null,
            rank: null,
            label: null,
            in_similar: true,
          };
      }
    }
    const creator = (track.creator || "").trim() || null;
    if (creator && !wallets[creator]) {
      wallets[creator] = {
        pct_supply: null,
        balance: null,
        rank: null,
        label: "creator",
        in_similar: false,
      };
    }
    // Previously flagged (RugWatch) — separate Ruggers section, not mixed into similar
    const flagged_known = {};
    for (const f of track.flagged_addresses || []) {
      const fw = ((f && (f.wallet || f.address)) || "").trim();
      if (!fw) continue;
      flagged_known[fw] = {
        risk_score: f.risk_score != null ? Number(f.risk_score) : null,
        label: f.label || null,
        origin: f.origin || null,
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

/**
 * Sold ≥99% of first bag when:
 *  - not listed anymore (dropped off top holders), or
 *  - current_pct <= first_pct * 1%, or
 *  - current_balance <= first_balance * 1% (when both known)
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

  if (!listed) {
    // Dropped off list → treat as fully sold (100%)
    return {
      sold: true,
      sold_pct: 100,
      remaining_pct: 0,
      remaining_of_first: 0,
      reason: "not_listed",
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
      remaining_pct: curPct,
      remaining_of_first: null,
      reason: "unknown",
    };
  }

  const soldFrac = Math.max(0, Math.min(1, 1 - remainingOfFirst));
  const sold = remainingOfFirst <= RUGGERS_REMAIN_FRAC + 1e-12;
  return {
    sold,
    sold_pct: Math.round(soldFrac * 10000) / 100,
    remaining_pct: curPct,
    remaining_of_first: remainingOfFirst,
    reason: sold ? (remainingOfFirst <= 0 ? "sold_100" : "sold_99") : "holding",
  };
}

/**
 * Update (or seed) tracking for one mint from a successful full Analyze.
 * First lookup freezes baseline; later lookups recompute sellers / swings.
 */
function processRuggersFromAnalyze(data) {
  const snap = extractRuggersSnapshot(data);
  if (!snap || !snap.address) return null;
  const key = mintKeyFromToken(snap.address, snap.chain);
  if (!key) return null;

  const store = loadRuggersStore();
  let rec = store[key];
  const now = snap.ts || new Date().toISOString();

  if (!rec || !rec.first_wallets || !Object.keys(rec.first_wallets).length) {
    // First lookup baseline
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
      // status filled after compare
      status: {},
    };
    for (const [w, info] of Object.entries(snap.wallets || {})) {
      rec.first_wallets[w] = {
        pct_supply: info.pct_supply,
        balance: info.balance,
        rank: info.rank,
        label: info.label,
        in_similar: !!info.in_similar,
      };
    }
    if (snap.creator && !rec.first_wallets[snap.creator]) {
      rec.first_wallets[snap.creator] = {
        pct_supply: null,
        balance: null,
        rank: null,
        label: "creator",
        in_similar: false,
      };
    }
  } else {
    rec.last_ts = now;
    rec.lookup_count = (rec.lookup_count || 1) + 1;
    if (snap.symbol) rec.symbol = snap.symbol;
    if (snap.name) rec.name = snap.name;
    if (snap.creator) rec.creator = snap.creator;
    // Merge any newly seen wallets into baseline only if never tracked
    // (user asked first-lookup track; still capture new similar members that appear later
    //  only for "not listed" of original set — do NOT expand first set with late whales)
  }

  // Current listed map
  const current = {};
  for (const [w, info] of Object.entries(snap.wallets || {})) {
    current[w] = {
      listed: true,
      pct_supply: info.pct_supply,
      balance: info.balance,
      in_similar: !!info.in_similar,
    };
  }

  // Recompute status for every first-lookup wallet
  const status = rec.status && typeof rec.status === "object" ? rec.status : {};
  for (const [w, first] of Object.entries(rec.first_wallets || {})) {
    const cur = current[w] || { listed: false, pct_supply: 0, balance: 0 };
    // If not in current snapshot at all → not listed
    if (!current[w]) {
      cur.listed = false;
      cur.pct_supply = 0;
      cur.balance = 0;
    }
    const soldState = computeSoldState(first, cur);
    const prev = status[w] || {};
    let tag = "holding"; // default ignore in UI unless sold/swing
    let everSold = !!prev.ever_sold;

    if (soldState.sold) {
      everSold = true;
      tag = "seller";
    } else if (everSold && cur.listed) {
      // Buy-back after a ≥99% dump → swing
      const hasBag =
        (cur.pct_supply != null && Number(cur.pct_supply) > 0) ||
        (cur.balance != null && Number(cur.balance) > 0);
      if (hasBag || (soldState.remaining_of_first != null && soldState.remaining_of_first > RUGGERS_REMAIN_FRAC)) {
        tag = "swing";
      } else {
        tag = "seller";
      }
    } else {
      tag = "holding";
    }

    status[w] = {
      tag,
      ever_sold: everSold,
      first_pct: first.pct_supply,
      first_balance: first.balance,
      current_pct: cur.listed ? cur.pct_supply : 0,
      current_balance: cur.listed ? cur.balance : 0,
      listed: !!cur.listed,
      sold_pct: soldState.sold_pct,
      reason: soldState.reason,
      in_similar: !!(first.in_similar || (cur && cur.in_similar)),
      is_creator: !!(
        rec.creator &&
        w.toLowerCase() === String(rec.creator).toLowerCase()
      ),
      last_update: now,
    };
  }

  // Merge RugWatch-flagged addresses for this mint (persistent on the rec)
  const prevFlagged =
    rec.flagged_known && typeof rec.flagged_known === "object"
      ? rec.flagged_known
      : {};
  const nextFlagged = { ...prevFlagged };
  for (const [fw, meta] of Object.entries(snap.flagged_known || {})) {
    if (!fw) continue;
    nextFlagged[fw] = {
      ...(prevFlagged[fw] || {}),
      ...(meta || {}),
      last_seen: now,
    };
  }
  rec.flagged_known = nextFlagged;

  // Mark status rows that are already on the RugWatch list
  for (const [w, st] of Object.entries(status)) {
    if (!st) continue;
    st.is_flagged = isRuggersFlaggedWallet(rec, w);
  }
  rec.status = status;

  store[key] = rec;
  saveRuggersStore(store);
  return { key, rec };
}

/** True if wallet is already known flagged (RugWatch list for this mint track). */
function isRuggersFlaggedWallet(rec, wallet) {
  if (!rec || !wallet) return false;
  const fk = rec.flagged_known;
  if (!fk || typeof fk !== "object") return false;
  const w = String(wallet).trim();
  if (fk[w]) return true;
  const wl = w.toLowerCase();
  for (const k of Object.keys(fk)) {
    if (String(k).toLowerCase() === wl) return true;
  }
  return false;
}

function ruggersBuckets(rec) {
  const creatorSold = [];
  const similarSellers = [];
  const singleSellers = [];
  const flaggedWallets = [];
  const swings = [];
  const flaggedSeen = new Set();
  if (!rec || !rec.status) {
    return {
      creatorSold,
      similarSellers,
      singleSellers,
      flaggedWallets,
      swings,
    };
  }

  function pushFlagged(row) {
    const w = row.wallet || "";
    if (!w || flaggedSeen.has(w)) return;
    flaggedSeen.add(w);
    flaggedWallets.push({
      ...row,
      is_flagged: true,
      tag: row.tag === "swing" ? "swing" : row.tag === "seller" ? "seller" : "flagged",
    });
  }

  for (const [w, st] of Object.entries(rec.status)) {
    if (!st) continue;
    const flagged = !!(st.is_flagged || isRuggersFlaggedWallet(rec, w));
    const row = { wallet: w, ...st, is_flagged: flagged };

    // Already on RugWatch → Flagged wallets section (not Similar / Single / Creator sell lists)
    if (flagged && (st.tag === "seller" || st.tag === "swing")) {
      pushFlagged(row);
      continue;
    }

    if (st.tag === "swing") {
      swings.push(row);
      continue;
    }
    if (st.tag !== "seller") continue; // ignore non-99% sells
    if (st.is_creator) {
      creatorSold.push(row);
      continue;
    }
    if (st.in_similar) similarSellers.push(row);
    else singleSellers.push(row);
  }

  // Any other previously flagged addresses known for this mint (not already listed)
  for (const [fw, meta] of Object.entries(rec.flagged_known || {})) {
    if (!fw || flaggedSeen.has(fw)) continue;
    const st = (rec.status && rec.status[fw]) || {};
    pushFlagged({
      wallet: fw,
      tag: st.tag === "seller" ? "seller" : st.tag === "swing" ? "swing" : "flagged",
      sold_pct: st.sold_pct != null ? st.sold_pct : null,
      first_pct: st.first_pct != null ? st.first_pct : null,
      current_pct: st.current_pct != null ? st.current_pct : null,
      listed: st.listed,
      reason: st.reason || "rugwatch_flagged",
      is_flagged: true,
      risk_score: meta && meta.risk_score,
      label: meta && meta.label,
    });
  }

  const bySold = (a, b) => (Number(b.sold_pct) || 0) - (Number(a.sold_pct) || 0);
  creatorSold.sort(bySold);
  similarSellers.sort(bySold);
  singleSellers.sort(bySold);
  flaggedWallets.sort(bySold);
  swings.sort(bySold);
  return {
    creatorSold,
    similarSellers,
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

/** Last Ruggers render — used by per-section Export buttons */
let _lastRuggersBuckets = null;
let _lastRuggersRec = null;
let _lastRuggersKey = "";

function renderRuggersWalletRow(row) {
  const w = row.wallet || "";
  const isFlagged = !!row.is_flagged || row.tag === "flagged";
  const sold =
    row.sold_pct != null
      ? Number(row.sold_pct).toFixed(1) + "% sold"
      : isFlagged && row.tag === "flagged"
        ? "on RugWatch list"
        : "sold";
  const first = "first " + fmtRugPct(row.first_pct);
  const now =
    row.tag === "swing"
      ? "now " + fmtRugPct(row.current_pct)
      : row.listed
        ? "now " + fmtRugPct(row.current_pct)
        : row.tag === "flagged" && row.listed == null
          ? "watchlist"
          : "now not listed";
  const reason =
    row.reason === "not_listed"
      ? "dropped off holder list"
      : row.reason === "sold_100"
        ? "sold 100% of first bag"
        : row.reason === "sold_99"
          ? "sold ≥99% of first bag"
          : row.reason === "rugwatch_flagged"
            ? "already on RugWatch (flagged)"
            : row.tag === "swing"
              ? "buy-back after dump"
              : row.reason || "";
  let tagCls = "rug-tag-seller";
  let tagLabel = "seller";
  if (row.tag === "swing") {
    tagCls = "rug-tag-swing";
    tagLabel = "swing";
  } else if (isFlagged) {
    tagCls = "rug-tag-flagged";
    tagLabel = "flagged";
  }
  return (
    '<div class="rug-wallet-row' +
    (isFlagged ? " rug-wallet-flagged" : "") +
    '">' +
    '<div class="rug-wallet-main">' +
    '<span class="rug-tag ' +
    tagCls +
    '">' +
    tagLabel +
    "</span> " +
    '<a class="wallet-link" href="https://solscan.io/account/' +
    encodeURIComponent(w) +
    '" target="_blank" rel="noopener noreferrer">' +
    escHtml(w) +
    "</a>" +
    "</div>" +
    '<div class="rug-wallet-meta">' +
    escHtml(sold) +
    " · " +
    escHtml(first) +
    " → " +
    escHtml(now) +
    (reason ? " · " + escHtml(reason) : "") +
    "</div>" +
    "</div>"
  );
}

/**
 * @param {string} title
 * @param {string} hint
 * @param {object[]} rows
 * @param {string} [exportKey]  "creator" | "similar" | "single" — Export; Upload unless exportOnly
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
  const exportOnly = !!(opts && opts.exportOnly);
  let actions = "";
  if (exportKey) {
    actions =
      '<div class="rug-section-actions">' +
      '<button type="button" class="ghost history-btn rug-export-btn" data-rug-export="' +
      escHtml(exportKey) +
      '" title="Download wallets as JSON/txt for RugWatch">' +
      "Export" +
      (n ? " (" + n + ")" : "") +
      "</button>";
    if (!exportOnly) {
      actions +=
        '<button type="button" class="rug-upload-btn" data-rug-upload="' +
        escHtml(exportKey) +
        '" title="Import into local RugWatch DB and Push cloud (GitHub wallet list)">' +
        "Upload" +
        (n ? " (" + n + ")" : "") +
        "</button>";
    }
    actions += "</div>";
  }
  return (
    '<section class="rug-section">' +
    '<div class="rug-section-head">' +
    '<h3 class="rug-section-title">' +
    escHtml(title) +
    ' <span class="rug-count">' +
    n +
    "</span></h3>" +
    actions +
    "</div>" +
    (hint ? '<p class="rug-section-hint">' + escHtml(hint) + "</p>" : "") +
    '<div class="rug-section-body">' +
    body +
    "</div></section>"
  );
}

function ruggersRowsForExportKey(key) {
  const b = _lastRuggersBuckets;
  if (!b) return [];
  if (key === "creator") return b.creatorSold || [];
  if (key === "similar") return b.similarSellers || [];
  if (key === "single") return b.singleSellers || [];
  return [];
}

function ruggersExportLabel(key) {
  if (key === "creator") return "creator_sellers";
  if (key === "similar") return "similar_sellers";
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
  const wallets = (rows || [])
    .map((r) => {
      const addr = (r.wallet || "").trim();
      if (!addr) return null;
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
      return {
        address: addr,
        wallet: addr,
        chain_id: (rec.chain || "solana").toString(),
        label: "ruggers_" + section,
        risk_score: 80,
        notes: notes,
        source: "adtc_ruggers_export",
      };
    })
    .filter(Boolean);
  return {
    format: "rugwatch_wallets_v1",
    source: "adtc_ruggers",
    section: section,
    mint: mint,
    symbol: symbol,
    exported_at: new Date().toISOString(),
    wallets: wallets,
  };
}

function downloadRuggersSection(exportKey) {
  const rows = ruggersRowsForExportKey(exportKey);
  if (!rows.length) {
    alert(
      "No wallets in this section to export.\n\n" +
        "Re-analyze the mint after sellers appear, then Export again."
    );
    return;
  }
  const payload = buildRuggersExportPayload(exportKey, rows);
  const section = ruggersExportLabel(exportKey);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const asJson = window.confirm(
    "Export " +
      rows.length +
      " wallet(s) from “" +
      section +
      "” for RugWatch.\n\n" +
      "OK = JSON (RugWatch Upload tab — recommended)\n" +
      "Cancel = plain text (one address per line)"
  );
  let blob;
  let name;
  if (asJson) {
    blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    name = "ruggers_" + section + "_" + stamp + ".json";
  } else {
    const lines = payload.wallets.map((w) => w.address);
    blob = new Blob([lines.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    name = "ruggers_" + section + "_" + stamp + ".txt";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
  const rows = ruggersRowsForExportKey(exportKey);
  if (!rows.length) {
    alert(
      "No wallets in this section to upload.\n\n" +
        "Re-analyze the mint after sellers appear, then try Upload again."
    );
    return;
  }
  const section = ruggersExportLabel(exportKey);
  const payload = buildRuggersExportPayload(exportKey, rows);
  const base = rugwatchApiBase();
  const ok = window.confirm(
    "Upload " +
      rows.length +
      " wallet(s) from “" +
      section +
      "” to RugWatch?\n\n" +
      "1) Import NEW wallets only (already in cloud/local are skipped)\n" +
      "2) Push cloud → GitHub if anything new was added\n\n" +
      "Duplicates are never saved twice.\n\n" +
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
    const cloudN =
      cloud && cloud.wallet_count != null
        ? cloud.wallet_count
        : cloud && cloud.count != null
          ? cloud.count
          : "?";
    const pushed =
      cloud && cloud.skipped_push
        ? "no (all duplicates — push skipped)"
        : cloud && cloud.ok
          ? "yes"
          : "n/a";
    alert(
      (imported > 0
        ? "Uploaded to RugWatch.\n\n"
        : "No new wallets to upload.\n\n") +
        "Section: " +
        section +
        "\nNew imported: " +
        imported +
        "\nAlready in cloud/local (skipped): " +
        skipEx +
        "\nCloud wallets now: " +
        cloudN +
        "\nCloud push: " +
        pushed +
        (cloud && cloud.cloud_shards != null
          ? "\nCloud shards: " + cloud.cloud_shards
          : "") +
        "\n\nDuplicates are never saved twice."
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
  body.querySelectorAll("[data-rug-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-rug-export") || "";
      downloadRuggersSection(key);
    });
  });
  body.querySelectorAll("[data-rug-upload]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-rug-upload") || "";
      uploadRuggersSectionToCloud(key);
    });
  });
}

function refreshRuggersPanel(focusKey) {
  const body = $("ruggersBody");
  const dump = $("text-ruggers");
  const store = loadRuggersStore();
  const keys = Object.keys(store).sort((a, b) => {
    const ta = store[a].last_ts || store[a].first_ts || "";
    const tb = store[b].last_ts || store[b].first_ts || "";
    return tb.localeCompare(ta);
  });

  // Prefer currently displayed token address if known
  let activeKey = focusKey || "";
  if (!activeKey) {
    const addrEl = $("sumAddr");
    const addr = addrEl ? String(addrEl.textContent || "").trim() : "";
    if (addr) {
      activeKey =
        keys.find((k) => k === addr || k.endsWith(":" + addr) || k === "solana:" + addr) ||
        "";
    }
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

  const rec = store[activeKey];
  const buckets = ruggersBuckets(rec);
  _lastRuggersBuckets = buckets;
  _lastRuggersRec = rec;
  _lastRuggersKey = activeKey;
  const mintAddr = (rec.address || "").trim() || "";
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
    '<p class="rug-rules">Rules: wallets that sold <strong>≥99%</strong> upon ' +
    "<em>first-lookup</em> (or left the holder list) are listed. " +
    "Continued search queries do not affect monitoring. " +
    "After they have sold, place another search query and they will appear in Ruggers. " +
    "Buy-back after a dump → <span class=\"rug-tag rug-tag-swing\">swing</span>. " +
    "Holders who never dumped 99% are ignored. " +
    "Yellow <strong>Upload</strong> on Creator / Similar sends wallets to RugWatch cloud; " +
    "<strong>Export</strong> downloads a file (Single has Export only).</p>";

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
  html += '<label class="rug-mint-pick" for="ruggersMintSelect">Tracked mint';
  html += '<select id="ruggersMintSelect">';
  for (const k of keys) {
    const r = store[k] || {};
    const lab =
      (r.symbol ? "$" + r.symbol + " " : "") +
      (r.address || k).slice(0, 12) +
      "…";
    html +=
      '<option value="' +
      escHtml(k) +
      '"' +
      (k === activeKey ? " selected" : "") +
      ">" +
      escHtml(lab) +
      "</option>";
  }
  html += "</select></label></div>";

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
    "Creator wallet only — listed if they sold ≥99% of their first-lookup bag or left the list. Yellow Upload → RugWatch cloud.",
    buckets.creatorSold,
    "creator"
  );
  html += renderRuggersSection(
    "Similar wallets (sellers)",
    "New similar-size group sellers only (not already on RugWatch). Sold ≥99% / dropped off. Yellow Upload → RugWatch cloud.",
    buckets.similarSellers,
    "similar"
  );
  html += renderRuggersSection(
    "Single wallets (sellers)",
    "New individual sellers not already on RugWatch. Sold ≥99% / dropped off. Export only (no Upload).",
    buckets.singleSellers,
    "single",
    { exportOnly: true }
  );
  // Previously flagged — no Upload (already on RugWatch / cloud)
  const flaggedRows = buckets.flaggedWallets || [];
  if (flaggedRows.length) {
    html += renderRuggersSection(
      "Flagged wallets",
      "Already on RugWatch. Not mixed into Similar/Single. No Upload — already on GitHub/cloud.",
      flaggedRows
      // no exportKey → no Export / Upload buttons
    );
  } else {
    html +=
      '<section class="rug-section">' +
      '<div class="rug-section-head">' +
      '<h3 class="rug-section-title">Flagged wallets <span class="rug-count">0</span></h3>' +
      "</div>" +
      '<p class="rug-section-hint">' +
      "Flagged wallets will show here. Wallets that sold ≥99% of their bags are not listed. " +
      "Upload new sellers to GitHub with yellow Upload on Creator / Similar / Single." +
      "</p>" +
      '<div class="rug-section-body"><p class="rug-empty">Flagged wallets will show here</p></div>' +
      "</section>";
  }
  html += renderRuggersSection(
    "Swing traders",
    "Previously sold ≥99% (or left the list), then bought back on a later lookup.",
    buckets.swings
  );

  // Summary counts
  const nSell =
    buckets.creatorSold.length +
    buckets.similarSellers.length +
    buckets.singleSellers.length;
  const nFlag = (buckets.flaggedWallets || []).length;
  html +=
    '<p class="rug-footer-meta">New sellers: ' +
    nSell +
    " · Flagged (no upload): " +
    nFlag +
    " · Swings: " +
    buckets.swings.length +
    " · Tracked mints: " +
    keys.length +
    " · Yellow Upload: Creator / Similar only · Export: Creator / Similar / Single." +
    "</p>";

  if (body) body.innerHTML = html;
  if (dump) {
    dump.textContent = formatRuggersPlain(rec, buckets, activeKey);
  }

  const sel = $("ruggersMintSelect");
  if (sel) {
    sel.addEventListener("change", () => refreshRuggersPanel(sel.value));
  }
  wireRuggersExportButtons();
  wireCopyMintClicks(body);
  wireRuggersCaSearch();
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
  const keys = Object.keys(store);
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
  lines.push("RUGGERS · " + (rec.symbol || "") + " " + (rec.address || key));
  lines.push("First: " + shortWhen(rec.first_ts) + " · Last: " + shortWhen(rec.last_ts));
  lines.push("Lookups: " + (rec.lookup_count || 1));
  lines.push("");
  function dump(title, rows) {
    lines.push("--- " + title + " (" + rows.length + ") ---");
    if (!rows.length) {
      lines.push("  (none)");
      return;
    }
    for (const r of rows) {
      lines.push(
        "  [" +
          (r.tag || "") +
          "] " +
          r.wallet +
          "  sold=" +
          (r.sold_pct != null ? r.sold_pct + "%" : "?") +
          "  first=" +
          fmtRugPct(r.first_pct) +
          "  now=" +
          (r.listed ? fmtRugPct(r.current_pct) : "not listed")
      );
    }
    lines.push("");
  }
  dump("Creator sold", buckets.creatorSold);
  dump("Similar sellers (new only)", buckets.similarSellers);
  dump("Single sellers (new only)", buckets.singleSellers);
  dump("Flagged wallets (no upload)", buckets.flaggedWallets || []);
  dump("Swing traders", buckets.swings);
  return lines.join("\n");
}

function clearRuggersMint() {
  const store = loadRuggersStore();
  const addrEl = $("sumAddr");
  const addr = addrEl ? String(addrEl.textContent || "").trim() : "";
  let key = "";
  if (addr) {
    key = Object.keys(store).find(
      (k) => k === addr || k.endsWith(":" + addr)
    );
  }
  if (!key) {
    const sel = $("ruggersMintSelect");
    if (sel && sel.value) key = sel.value;
  }
  if (!key) {
    alert("No mint selected to clear. Analyze a token or pick one in the Ruggers dropdown.");
    return;
  }
  if (!confirm("Clear Ruggers tracking for this mint?\n" + key)) return;
  delete store[key];
  saveRuggersStore(store);
  refreshRuggersPanel();
}

function clearRuggersAll() {
  const store = loadRuggersStore();
  if (!Object.keys(store).length) {
    alert("Ruggers store is already empty.");
    return;
  }
  if (!confirm("Clear ALL Ruggers tracking for every mint on this browser?")) return;
  saveRuggersStore({});
  refreshRuggersPanel();
}

function initRuggers() {
  refreshRuggersPanel();
  const r = $("ruggersRefresh");
  const cm = $("ruggersClearMint");
  const ca = $("ruggersClearAll");
  if (r) r.addEventListener("click", () => refreshRuggersPanel());
  if (cm) cm.addEventListener("click", () => clearRuggersMint());
  if (ca) ca.addEventListener("click", () => clearRuggersAll());
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

function linkify(text) {
  if (!text) return "";
  // Never show Solscan URL rows; addresses stay and become clickable below
  const plain = stripSolscanUrlLines(text);
  const esc = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Other http(s) URLs (not solscan account lines — already stripped)
  let html = esc.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    (url) => {
      if (/solscan\.io\/(account|token)\//i.test(url)) {
        return url; // should be rare after strip; leave plain if any leftover
      }
      return (
        '<a href="' +
        url +
        '" target="_blank" rel="noopener noreferrer">' +
        url +
        "</a>"
      );
    }
  );
  // Solana base58 wallets → clickable Solscan (address text stays)
  html = html.replace(
    /(^|>)([^<]*?)(?=<|$)/g,
    (full, prefix, chunk) => {
      const linked = chunk.replace(
        /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g,
        (addr) =>
          `<a class="wallet-link" href="https://solscan.io/account/${addr}" target="_blank" rel="noopener noreferrer">${addr}</a>`
      );
      return prefix + linked;
    }
  );
  return html;
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
 *  - yellow token amounts
 *  - % color bands except Top1/Top5/Top10 and Top10 ex-LP
 *  - Creator "owns X%" uses % color scheme
 */
function formatHoldersRichHtml(text) {
  if (!text) return "";
  let html = linkify(text);
  html = colorWalletHolderPcts(html);
  html = colorHoldingAmounts(html);
  return html;
}

/**
 * Bundles tab % color scheme (same priority bands as Holders):
 *  - Summary: Total % bundles, Similar-size total, Suspect total
 *  - Each wallet percent holdings in groups: "holds X%" on clusters,
 *    similar-size members, insiders, suspects (+ group avg/range headers)
 *  - Similar-size group header right side: "sum X%" (combined group holdings)
 *  - Top10 ex-LP stays uncolored (summary concentration, not a wallet bag)
 * Also yellows cluster "bal …" amounts.
 */
function colorBundlesSelectivePcts(html) {
  if (!html) return html;
  return html
    .split("\n")
    .map((line) => {
      if (isUncoloredPctLine(line)) return line;
      return colorPctTokens(line);
    })
    .join("\n");
}

function formatBundlesRichHtml(text) {
  if (!text) return "";
  let html = linkify(text);
  html = colorBundlesSelectivePcts(html);
  html = colorHoldingAmounts(html);
  return html;
}

function setPanelText(tab, text) {
  const el = $("text-" + tab);
  if (!el) return;
  const raw = text || "(empty)";
  let html;
  if (tab === "holders") {
    // No Solscan URL rows; clickable addresses; yellow amounts; % colors (not Top1/5/10)
    html = formatHoldersRichHtml(raw);
  } else if (tab === "alerts") {
    html = linkify(raw);
    html = colorWalletHolderPcts(html);
    html = colorHoldingAmounts(html);
  } else if (tab === "bundles") {
    // Summary + each wallet group % colored; Top10 ex-LP uncolored; bal yellow
    html = formatBundlesRichHtml(raw);
  } else {
    html = linkify(raw);
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
  $("sumName").textContent = `${name} ($${sym}) · ${t.chain_id || m.chain_id || ""}`;
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
    if (!links[k]) continue;
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

function renderSections(data, query) {
  const sections = (data && data.sections) || {};
  for (const tab of TABS) {
    if (tab === "history" || tab === "ruggers") continue;
    if (sections[tab]) setPanelText(tab, sections[tab]);
  }
  // Log successful Analyze into browser History (max 20)
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
    if (!isQuick && holdersOk) {
      const result = processRuggersFromAnalyze(data);
      if (result && result.key) rugKey = result.key;
    }
  } catch {
    /* ignore ruggers failures */
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

function useRugwatchEnabled() {
  const el = $("useRugwatch");
  if (!el) return true;
  return !!el.checked;
}

function initRugwatchPref() {
  const el = $("useRugwatch");
  if (!el) return;
  try {
    const saved = localStorage.getItem(RUGWATCH_PREF_KEY);
    if (saved === "0" || saved === "false") el.checked = false;
    else if (saved === "1" || saved === "true") el.checked = true;
    // default: checked (on)
  } catch (_) {
    /* ignore */
  }
  el.addEventListener("change", () => {
    try {
      localStorage.setItem(RUGWATCH_PREF_KEY, el.checked ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
  });
}

function initRugwatchNav() {
  const a = $("navRugwatch");
  if (!a) return;
  const cfg = window.ADTC_CONFIG || {};
  const url = (cfg.rugwatchUrl || "https://rugwatch.onrender.com/").trim();
  if (url) a.href = url;
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
  const btn = $("analyzeBtn");
  btn.disabled = true;
  btn.textContent = quick ? "Quick…" : "Analyzing…";
  setPanelText("overview", "Loading… this can take up to ~90s for holders/about.");

  try {
    const r = await fetch(apiUrl("/api/analyze"), {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ query, chain, quick, include_rugwatch }),
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
  initRugwatchNav();
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
  }
}

document.addEventListener("DOMContentLoaded", init);
