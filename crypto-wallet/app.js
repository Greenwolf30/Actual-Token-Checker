/**
 * Keel — Solana wallet UI demo (mock balances / local interactions).
 * Not a live signer — design surface for Solana mainnet wallet flows.
 */

const WALLET = {
  address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  short: "7xKX…gAsU",
  solPrice: 148.32,
};

const TOKENS = [
  {
    id: "sol",
    symbol: "SOL",
    name: "Solana",
    amount: 12.4821,
    price: 148.32,
    change: 2.4,
    iconClass: "sol",
  },
  {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    amount: 420.5,
    price: 1,
    change: 0.01,
    iconClass: "usdc",
  },
  {
    id: "jup",
    symbol: "JUP",
    name: "Jupiter",
    amount: 860,
    price: 0.72,
    change: -1.1,
    iconClass: "jup",
  },
  {
    id: "bonk",
    symbol: "BONK",
    name: "Bonk",
    amount: 12500000,
    price: 0.0000184,
    change: 5.6,
    iconClass: "bonk",
  },
];

const ACTIVITY = [
  {
    kind: "in",
    title: "Received SOL",
    sub: "From Phantom · 2h ago",
    amount: "+0.85 SOL",
    fiat: "+$126.07",
  },
  {
    kind: "out",
    title: "Sent USDC",
    sub: "To 9wL…k2Pq · yesterday",
    amount: "-40 USDC",
    fiat: "-$40.00",
  },
  {
    kind: "in",
    title: "Swap filled",
    sub: "JUP → SOL · 2d ago",
    amount: "+1.12 SOL",
    fiat: "+$166.12",
  },
  {
    kind: "out",
    title: "Sent SOL",
    sub: "Rent + tip · 4d ago",
    amount: "-0.002 SOL",
    fiat: "-$0.30",
  },
];

function $(id) {
  return document.getElementById(id);
}

function fmtUsd(n) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtToken(n, symbol) {
  if (symbol === "BONK") {
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (n >= 1000) {
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function totalUsd() {
  return TOKENS.reduce((sum, t) => sum + t.amount * t.price, 0);
}

function totalSol() {
  const sol = TOKENS.find((t) => t.id === "sol");
  return sol ? sol.amount : 0;
}

function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("is-on"));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.classList.remove("is-on");
    setTimeout(() => {
      el.hidden = true;
    }, 220);
  }, 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Address copied");
  } catch {
    showToast("Copy failed — select the address manually");
  }
}

function animateNumber(el, to, { duration = 900, decimals = 2 } = {}) {
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    el.textContent = to.toFixed(decimals);
    return;
  }
  const from = 0;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = from + (to - from) * eased;
    el.textContent = val.toFixed(decimals);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function renderTokens() {
  const list = $("tokenList");
  if (!list) return;
  list.innerHTML = "";
  TOKENS.forEach((t, i) => {
    const usd = t.amount * t.price;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "token-row";
    btn.style.animationDelay = `${0.05 + i * 0.06}s`;
    btn.innerHTML = `
      <span class="token-icon ${t.iconClass}">${t.symbol.slice(0, 2)}</span>
      <span class="token-meta">
        <strong>${t.symbol}</strong>
        <span>${t.name}</span>
      </span>
      <span class="token-vals">
        <strong>$${fmtUsd(usd)}</strong>
        <span>${fmtToken(t.amount, t.symbol)} ${t.symbol}</span>
      </span>
    `;
    btn.addEventListener("click", () => {
      go("send");
      const sel = $("sendAsset");
      if (sel) sel.value = t.id;
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
  const count = $("tokenCount");
  if (count) count.textContent = `${TOKENS.length} assets`;
}

function renderActivity() {
  const list = $("activityList");
  if (!list) return;
  list.innerHTML = "";
  ACTIVITY.forEach((a, i) => {
    const li = document.createElement("li");
    li.className = "activity-row";
    li.style.animationDelay = `${0.04 + i * 0.05}s`;
    li.innerHTML = `
      <span class="activity-ico ${a.kind}" aria-hidden="true">${
        a.kind === "in" ? "↘" : "↗"
      }</span>
      <span class="activity-meta">
        <strong>${a.title}</strong>
        <span>${a.sub}</span>
      </span>
      <span class="activity-vals">
        <strong>${a.amount}</strong>
        <span>${a.fiat}</span>
      </span>
    `;
    list.appendChild(li);
  });
}

function fillSendAssets() {
  const sel = $("sendAsset");
  if (!sel) return;
  sel.innerHTML = TOKENS.map(
    (t) =>
      `<option value="${t.id}">${t.symbol} · ${fmtToken(t.amount, t.symbol)} available</option>`
  ).join("");
}

/** Lightweight faux-QR from address bits (decorative, not a real QR codec). */
function drawFauxQr(svg, seed) {
  if (!svg) return;
  const size = 120;
  const cells = 21;
  const cell = size / cells;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  function bit(x, y) {
    let n = h ^ (x * 374761393) ^ (y * 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n >>> 0) % 3 !== 0;
  }
  const parts = [
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
  ];
  function finder(ox, oy) {
    parts.push(
      `<rect x="${ox * cell}" y="${oy * cell}" width="${7 * cell}" height="${7 * cell}" fill="#0E1512"/>`,
      `<rect x="${(ox + 1) * cell}" y="${(oy + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/>`,
      `<rect x="${(ox + 2) * cell}" y="${(oy + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#0F9F6E"/>`
    );
  }
  finder(0, 0);
  finder(cells - 7, 0);
  finder(0, cells - 7);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const inFinder =
        (x < 8 && y < 8) ||
        (x > cells - 9 && y < 8) ||
        (x < 8 && y > cells - 9);
      if (inFinder) continue;
      if (bit(x, y)) {
        parts.push(
          `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#0E1512"/>`
        );
      }
    }
  }
  svg.innerHTML = parts.join("");
}

function go(panel) {
  const panels = document.querySelectorAll(".panel");
  panels.forEach((p) => {
    const on = p.dataset.panel === panel;
    p.hidden = !on;
    p.classList.toggle("is-active", on);
  });
  document.querySelectorAll(".dock-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.go === panel);
  });
  if (panel === "receive") {
    drawFauxQr($("qrSvg"), WALLET.address);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireNav() {
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      go(el.dataset.go);
    });
  });
}

function wireActions() {
  $("copyAddrBtn")?.addEventListener("click", () => copyText(WALLET.address));
  $("copyFullBtn")?.addEventListener("click", () => copyText(WALLET.address));
  $("swapHintBtn")?.addEventListener("click", () =>
    showToast("Swap connects to Jupiter in a live build")
  );

  $("sendMaxBtn")?.addEventListener("click", () => {
    const id = $("sendAsset")?.value;
    const t = TOKENS.find((x) => x.id === id);
    if (!t || !$("sendAmount")) return;
    const max =
      t.id === "sol" ? Math.max(0, t.amount - 0.01) : t.amount;
    $("sendAmount").value = String(max);
  });

  $("sendForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const to = ($("sendTo")?.value || "").trim();
    const amount = Number($("sendAmount")?.value || 0);
    const asset = TOKENS.find((t) => t.id === $("sendAsset")?.value);
    const status = $("sendStatus");
    if (!to || to.length < 32) {
      if (status) status.textContent = "Enter a valid Solana address or .sol domain.";
      return;
    }
    if (!asset || !(amount > 0)) {
      if (status) status.textContent = "Enter an amount greater than zero.";
      return;
    }
    if (amount > asset.amount) {
      if (status) status.textContent = "Amount exceeds available balance.";
      return;
    }
    if (status) {
      status.textContent = `Demo only — would send ${amount} ${asset.symbol} to ${to.slice(
        0,
        4
      )}…${to.slice(-4)} on Solana.`;
    }
    showToast("Send reviewed (demo)");
  });
}

function boot() {
  const short = $("addrShort");
  if (short) short.textContent = WALLET.short;
  const full = $("fullAddr");
  if (full) full.textContent = WALLET.address;

  fillSendAssets();
  renderTokens();
  renderActivity();
  wireNav();
  wireActions();

  animateNumber($("fiatBalance"), totalUsd(), { duration: 1000, decimals: 2 });
  animateNumber($("solBalance"), totalSol(), { duration: 900, decimals: 4 });
}

document.addEventListener("DOMContentLoaded", boot);
