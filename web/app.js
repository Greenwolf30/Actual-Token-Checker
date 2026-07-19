/* Actual Data Token Checker — browser client.
 * Calls YOUR backend /api/* only. Provider keys never reach this page.
 * apiBase comes from config.js (empty = same origin as this static site).
 */

const TABS = ["overview", "holders", "bundles", "alerts", "maps", "about"];
const TOKEN_KEY = "adtc_site_token";

const $ = (id) => document.getElementById(id);

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
  // http(s) URLs
  return esc.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function setPanelText(tab, text) {
  const el = $("text-" + tab);
  if (!el) return;
  el.innerHTML = linkify(text || "(empty)");
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
    "solscan",
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

function renderSections(data) {
  const sections = (data && data.sections) || {};
  for (const tab of TABS) {
    if (sections[tab]) setPanelText(tab, sections[tab]);
  }
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
    renderSections(data);
  } catch (e) {
    showError(String(e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
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
