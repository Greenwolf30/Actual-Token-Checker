/* Actual Data Token Checker — browser client.
 * Calls YOUR backend /api/* only. Provider keys never reach this page.
 * apiBase comes from config.js (empty = same origin as this static site).
 */

const TABS = ["overview", "holders", "bundles", "alerts", "maps", "about", "history"];
const TOKEN_KEY = "adtc_site_token";
const HISTORY_KEY = "adtc_history_log";
const HISTORY_MAX = 20;

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
    holdersSnap = clipSnap(sections.holders, 10000);
  }
  if (!bundlesSnap && sections.bundles) {
    bundlesSnap = clipSnap(sections.bundles, 7000);
  }

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
  };
}

function clipSnap(text, maxChars) {
  if (!text) return null;
  const s = String(text).trim();
  if (!s) return null;
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 80).replace(/\s+$/, "") +
    "\n\n  … [snapshot truncated for Logs storage] …\n";
}

function pushHistoryLog(entry) {
  if (!entry) return loadHistoryLog();
  const items = loadHistoryLog();
  items.unshift(entry);
  const next = items.slice(0, HISTORY_MAX);
  saveHistoryLog(next);
  return next;
}

function formatHistoryLogText(items) {
  const rows = items != null ? items : loadHistoryLog();
  const lines = [
    "========================================================================",
    "  LOGS",
    "  Last " + HISTORY_MAX + " token searches on this browser (oldest dropped when full)",
    "========================================================================",
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
    let ts = String(e.ts || "").slice(0, 19).replace("T", " ");
    if (ts) ts = ts + " UTC";
    const sym = e.symbol || e.query || "token";
    const name = e.name || "";
    let title = sym;
    if (name && name.toUpperCase() !== String(sym).toUpperCase()) {
      title = sym + "  (" + name + ")";
    }
    lines.push("  " + String(idx + 1).padStart(2) + ". " + title);
    lines.push("      When:   " + (ts || "—"));
    lines.push(
      "      Chain:  " +
        (e.chain || "—") +
        "  ·  DEX: " +
        (e.dex_id || "—")
    );
    if (e.address) lines.push("      Mint:   " + e.address);
    if (e.query && e.query !== sym && e.query !== e.address) {
      lines.push("      Query:  " + e.query);
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
    if (mbits.length) lines.push("      Market: " + mbits.join(" · "));
    const t1 = fmtPctHist(e.top1_pct);
    const t5 = fmtPctHist(e.top5_pct);
    const t10 = fmtPctHist(e.top10_pct);
    if (e.holders_ok || t1 || t5 || t10) {
      lines.push(
        "      Holders: risk " +
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
        "      Bundles: risk " +
          (e.bundle_risk || "—") +
          "  ·  share " +
          (bp || "—")
      );
    }
    lines.push(
      "      Alerts:  " +
        (Number(e.alerts_priority_count) || 0) +
        " top-priority warning(s)"
    );
    const pfm = e.pumpfun || {};
    if (pfm.is_pump_mint || pfm.status) {
      lines.push(
        "      Pump:    mint=" +
          pfm.is_pump_mint +
          "  status=" +
          (pfm.status || "—") +
          "  graduated=" +
          pfm.graduated
      );
    }
    if (e.pair_url) lines.push("      Link:    " + e.pair_url);

    const hSnap = String(e.holders_snapshot || "").trim();
    if (hSnap) {
      lines.push("");
      lines.push("      ── HOLDERS SNAPSHOT (at lookup) ──");
      hSnap.split("\n").forEach((hl) => {
        lines.push(hl.trim() ? "      " + hl : "");
      });
    } else {
      lines.push("      Holders snapshot: (none saved for this entry)");
    }

    const bSnap = String(e.bundles_snapshot || "").trim();
    if (bSnap) {
      lines.push("");
      lines.push("      ── BUNDLES SNAPSHOT (at lookup) ──");
      bSnap.split("\n").forEach((bl) => {
        lines.push(bl.trim() ? "      " + bl : "");
      });
    } else {
      lines.push("      Bundles snapshot: (none saved for this entry)");
    }

    lines.push("");
    lines.push("  " + "-".repeat(40));
    lines.push("");
  });
  lines.push("  — end of logs —");
  lines.push("  Download saves this view (or JSON) to a file.");
  return lines.join("\n") + "\n";
}

function refreshHistoryPanel() {
  setPanelText("history", formatHistoryLogText());
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
  refreshHistoryPanel();
  showError("");
}

function initHistory() {
  refreshHistoryPanel();
  const r = $("historyRefresh");
  const c = $("historyClear");
  const d = $("historyDownload");
  if (r) r.addEventListener("click", () => refreshHistoryPanel());
  if (c) c.addEventListener("click", () => clearHistoryLog());
  if (d) d.addEventListener("click", () => downloadHistoryLog());
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

function linkify(text) {
  if (!text) return "";
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // http(s) URLs first
  let html = esc.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Solana base58 wallets → Solscan (Creator + top holders); skip inside tags
  html = html.replace(
    /(^|>)([^<]*?)(?=<|$)/g,
    (full, prefix, chunk) => {
      const linked = chunk.replace(
        /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g,
        (addr) =>
          `<a href="https://solscan.io/account/${addr}" target="_blank" rel="noopener noreferrer">${addr}</a>`
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

function colorWalletHolderPcts(html) {
  if (!html) return html;
  // Color supply % on wallet rows only — Top1/Top5/Top10 summary stays default color
  return html
    .split("\n")
    .map((line) => (isTopSummaryLine(line) ? line : colorPctTokens(line)))
    .join("\n");
}

/**
 * Bundles tab: color ONLY
 *  - Total % bundles line
 *  - Suspect wallets TOTAL line ("Suspect wallets — total X%")
 * Individual suspect wallet rows stay uncolored.
 */
function colorBundlesSelectivePcts(html) {
  if (!html) return html;
  return html
    .split("\n")
    .map((line) => {
      const plain = line.replace(/<[^>]*>/g, "");
      if (/Total\s*%\s*bundles\s*:/i.test(plain)) {
        return colorPctTokens(line);
      }
      // Header total only — not the wallet list under it
      if (/Suspect\s+wallets/i.test(plain) && /total/i.test(plain)) {
        return colorPctTokens(line);
      }
      return line;
    })
    .join("\n");
}

function setPanelText(tab, text) {
  const el = $("text-" + tab);
  if (!el) return;
  let html = linkify(text || "(empty)");
  // Holders + Alerts: full wallet % colors
  if (tab === "holders" || tab === "alerts") {
    html = colorWalletHolderPcts(html);
  } else if (tab === "bundles") {
    // Bundles: only total bundle % + suspect wallets
    html = colorBundlesSelectivePcts(html);
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
  $("sumAddr").textContent = t.address || m.address || "";
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
    if (tab === "history") continue;
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
  const btn = $("analyzeBtn");
  btn.disabled = true;
  btn.textContent = quick ? "Quick…" : "Analyzing…";
  setPanelText("overview", "Loading… this can take up to ~90s for holders/about.");

  try {
    const r = await fetch(apiUrl("/api/analyze"), {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ query, chain, quick }),
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
