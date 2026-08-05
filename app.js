/**
 * Gladiator Wallet — multi-account, multi-chain (Solana + EVM).
 * Real receive addresses generated & stored locally (chrome.storage / localStorage).
 */

const CHAINS = [
  {
    id: "solana",
    name: "Solana",
    kind: "solana",
    symbol: "SOL",
    decimals: 9,
    logo: "solana",
    explorer: (a) => `https://solscan.io/account/${a}`,
    rpc: "https://api.mainnet-beta.solana.com",
    rpcs: [
      "https://api.mainnet-beta.solana.com",
      "https://solana-rpc.publicnode.com",
      "https://rpc.ankr.com/solana",
      "https://solana.drpc.org",
      "https://1rpc.io/sol",
    ],
    priceId: "solana",
  },
  {
    id: "ethereum",
    name: "Ethereum",
    kind: "evm",
    symbol: "ETH",
    decimals: 18,
    logo: "ethereum",
    explorer: (a) => `https://etherscan.io/address/${a}`,
    rpc: "https://eth.llamarpc.com",
    rpcs: [
      "https://eth.llamarpc.com",
      "https://cloudflare-eth.com",
      "https://ethereum.publicnode.com",
      "https://rpc.ankr.com/eth",
      "https://1rpc.io/eth",
    ],
    priceId: "ethereum",
    chainId: 1,
  },
  {
    id: "bitcoin",
    name: "Bitcoin",
    kind: "bitcoin",
    symbol: "BTC",
    decimals: 8,
    logo: "bitcoin",
    explorer: (a) => `https://mempool.space/address/${a}`,
    rpc: "https://blockstream.info/api",
    priceId: "bitcoin",
  },
  {
    id: "polygon",
    name: "Polygon",
    kind: "evm",
    symbol: "POL",
    decimals: 18,
    logo: "polygon",
    explorer: (a) => `https://polygonscan.com/address/${a}`,
    rpc: "https://polygon-rpc.com",
    rpcs: [
      "https://polygon-rpc.com",
      "https://polygon-bor.publicnode.com",
      "https://1rpc.io/matic",
    ],
    priceId: "matic-network",
    chainId: 137,
  },
  {
    id: "sui",
    name: "Sui",
    kind: "sui",
    symbol: "SUI",
    decimals: 9,
    logo: "sui",
    explorer: (a) => `https://suiscan.xyz/mainnet/account/${a}`,
    rpc: "https://sui-mainnet-endpoint.blockvision.org",
    rpcs: [
      "https://sui-mainnet-endpoint.blockvision.org",
      "https://rpc-mainnet.suiscan.xyz",
    ],
    priceId: "sui",
  },
  {
    id: "robinhood",
    name: "Robinhood Ethereum",
    kind: "evm",
    symbol: "ETH",
    decimals: 18,
    logo: "robinhood",
    explorer: (a) => `https://robinhoodchain.blockscout.com/address/${a}`,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    priceId: "ethereum",
    chainId: 4663,
  },
  {
    id: "base",
    name: "Ethereum Base",
    kind: "evm",
    symbol: "ETH",
    decimals: 18,
    logo: "base",
    explorer: (a) => `https://basescan.org/address/${a}`,
    rpc: "https://mainnet.base.org",
    rpcs: [
      "https://mainnet.base.org",
      "https://base.publicnode.com",
      "https://1rpc.io/base",
    ],
    priceId: "ethereum",
    chainId: 8453,
  },
];

const LOGO_ICON_VER = "8";

const STORE_KEY = "gladiator_wallet_v1";
const IS_EXTENSION = !!(
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.id
);

function gladiatorConfig() {
  return (typeof window !== "undefined" && window.GLADIATOR_CONFIG) || {};
}

/** Local serve.py JSON-RPC proxy (reads HELIUS from .env). Empty in the extension. */
function serverSolanaRpc() {
  // Chrome extension pages have no serve.py — never hit /api/solana-rpc there.
  if (IS_EXTENSION) return "";
  const cfg = gladiatorConfig();
  const u = (cfg.solanaRpcProxy || "").trim();
  return u || "/api/solana-rpc";
}

/** Turn a pasted Helius key, .env line, or URL into a usable HTTPS RPC endpoint. */
function normalizeCustomRpc(raw) {
  let v = String(raw || "").trim();
  if (!v) return "";

  // Strip wrapping quotes from .env / copy-paste
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }

  // Accept full .env lines: HELIUS_API_KEY=... or SOLANA_RPC_URL=...
  const envLine = v.match(
    /^(?:export\s+)?(?:HELIUS_API_KEY|SOLANA_RPC_URL|RPC_URL)\s*=\s*(.+)$/i
  );
  if (envLine) {
    v = envLine[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
  }

  // Bare API key → Helius mainnet URL
  if (!/^https?:\/\//i.test(v) && !v.includes("://")) {
    if (/^[A-Za-z0-9_-]{16,}$/.test(v)) {
      return "https://mainnet.helius-rpc.com/?api-key=" + v;
    }
    return "";
  }

  // If URL has no api-key but looks like Helius host, keep as-is (will 401 and failover)
  try {
    const u = new URL(v);
    if (!/^https?:$/i.test(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

function isHeliusRpcUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return /(^|\.)helius-rpc\.com$/i.test(u.hostname) || /(^|\.)helius\.xyz$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Probe that a custom Solana RPC answers JSON-RPC (used after Save in extension). */
async function probeSolanaRpc(rpcUrl) {
  const url = String(rpcUrl || "").trim();
  if (!url) throw new Error("No RPC URL");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getHealth",
      params: [],
    }),
  });
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("HTTP " + res.status + " (not JSON) from RPC");
  }
  if (!res.ok) {
    throw new Error(
      "HTTP " +
        res.status +
        (j && j.error && j.error.message ? ": " + j.error.message : " Unauthorized/invalid key?")
    );
  }
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result || "ok";
}

function $(id) {
  return document.getElementById(id);
}

function uid() {
  return "acc_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function shortAddr(a) {
  if (!a || a.length < 10) return "—";
  return a.slice(0, 4) + "…" + a.slice(-4);
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

async function storageGet() {
  // Extension: chrome.storage.local is source of truth (localStorage can stay stale
  // after BTC/Sui repairs if quota/write fails, which hid bc1q / Sui addresses).
  if (IS_EXTENSION) {
    try {
      const fromChrome = await new Promise((resolve) => {
        try {
          chrome.storage.local.get([STORE_KEY], (r) => resolve((r && r[STORE_KEY]) || null));
        } catch (_) {
          resolve(null);
        }
      });
      if (fromChrome && Array.isArray(fromChrome.accounts)) return fromChrome;
    } catch (_) {}
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

async function storageSet(data) {
  const raw = JSON.stringify(data);
  let localOk = false;
  try {
    localStorage.setItem(STORE_KEY, raw);
    localOk = true;
  } catch (err) {
    console.warn("[storage local]", err);
  }
  if (IS_EXTENSION) {
    try {
      await new Promise((resolve, reject) => {
        try {
          chrome.storage.local.set({ [STORE_KEY]: data }, () => {
            const err = chrome.runtime && chrome.runtime.lastError;
            if (err) reject(err);
            else resolve();
          });
        } catch (e) {
          reject(e);
        }
      });
    } catch (err) {
      console.warn("[storage chrome]", err);
      if (!localOk) throw err;
    }
  }
}

function createSolanaKeys() {
  if (!window.nacl || !window.Base58) throw new Error("Solana crypto libs missing");
  const kp = nacl.sign.keyPair();
  return {
    publicKey: Base58.encode(kp.publicKey),
    secretKey: Base58.encode(kp.secretKey),
  };
}

function importSolanaFromSecret(secretB58) {
  if (!window.nacl || !window.Base58) throw new Error("Solana crypto libs missing");
  const raw = String(secretB58 || "").trim();
  if (!raw) throw new Error("Paste a Solana secret key (base58)");
  const sk = Base58.decode(raw);
  let kp;
  if (sk.length === 64) {
    kp = nacl.sign.keyPair.fromSecretKey(sk);
  } else if (sk.length === 32) {
    kp = nacl.sign.keyPair.fromSeed(sk);
  } else {
    throw new Error("Secret must be 32-byte seed or 64-byte secret (base58)");
  }
  return {
    publicKey: Base58.encode(kp.publicKey),
    secretKey: Base58.encode(kp.secretKey),
  };
}

function createEvmKeys() {
  if (!window.ethers) throw new Error("ethers missing");
  const w = ethers.Wallet.createRandom();
  return {
    address: w.address,
    privateKey: w.privateKey,
  };
}

function importEvmFromPrivateKey(pk) {
  if (!window.ethers) throw new Error("ethers missing");
  const w = new ethers.Wallet(String(pk || "").trim());
  return { address: w.address, privateKey: w.privateKey };
}

/** Normalize / validate BIP39 phrase. Supports 12 or 24 words (generate uses 24). */
function normalizeMnemonic(phrase) {
  if (!window.ethers) throw new Error("ethers missing");
  // Accept pasted lists like "1. word" / commas / newlines
  const words = String(phrase || "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .split(/[\s,;]+/)
    .map((w) => w.replace(/^\d+[.):-]+/, "").replace(/^#+/, "").trim())
    .filter(Boolean);
  const n = words.length;
  if (![12, 15, 18, 21, 24].includes(n)) {
    throw new Error(
      "Seed phrase must be 12 or 24 words (got " + n + "). Paste words only, separated by spaces."
    );
  }
  const joined = words.join(" ");
  if (!ethers.Mnemonic.isValidMnemonic(joined)) {
    throw new Error(
      "Invalid seed phrase — check spelling. Use your Phantom/Solflare recovery words."
    );
  }
  return joined;
}

function createTwentyFourWordMnemonic() {
  if (!window.ethers) throw new Error("ethers missing");
  // 32 bytes entropy → 24-word BIP39 mnemonic
  return ethers.Mnemonic.fromEntropy(ethers.randomBytes(32)).phrase;
}

async function keysFromMnemonic(phrase, accountIndex) {
  if (!window.ethers) throw new Error("ethers missing");
  if (!window.SolanaHD) throw new Error("Solana HD lib missing");
  if (!window.MultiHD) throw new Error("Multi HD lib missing");
  if (!window.Base58 || !window.nacl) throw new Error("Solana crypto libs missing");
  const mnemonic = normalizeMnemonic(phrase);
  const m = ethers.Mnemonic.fromPhrase(mnemonic);
  const seed = ethers.getBytes(m.computeSeed());
  const idx = accountIndex | 0;

  const solKp = await SolanaHD.deriveSolanaKeypair(seed, idx);
  const sol = {
    publicKey: Base58.encode(solKp.publicKey),
    secretKey: Base58.encode(solKp.secretKey),
  };

  const hd = ethers.HDNodeWallet.fromSeed(seed);
  const evmWallet = hd.derivePath("m/44'/60'/0'/0/" + idx);
  const evm = {
    address: evmWallet.address,
    privateKey: evmWallet.privateKey,
  };

  let bitcoin = null;
  let sui = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 2 && !bitcoin; attempt++) {
    try {
      const full = await MultiHD.deriveBitcoinKeys(seed, idx);
      if (full && isValidBtcAddress(full.address)) {
        // Persist address (+ key for future send). Address is what the UI needs.
        bitcoin = {
          address: full.address,
          privateKey: full.privateKey,
          publicKey: full.publicKey,
        };
      }
    } catch (err) {
      lastErr = err;
      console.warn("[import-btc]", attempt, err);
    }
  }
  for (let attempt = 0; attempt < 2 && !sui; attempt++) {
    try {
      const full = await MultiHD.deriveSuiKeys(seed, idx);
      if (full && full.address) {
        sui = {
          address: full.address,
          publicKey: full.publicKey,
          secretKey: full.secretKey,
        };
      }
    } catch (err) {
      lastErr = err;
      console.warn("[import-sui]", attempt, err);
    }
  }
  if (!bitcoin || !bitcoin.address) {
    throw new Error(
      "Could not derive Bitcoin address" +
        (lastErr && lastErr.message ? ": " + lastErr.message : "") +
        (!window.MultiHD ? " (MultiHD missing)" : "")
    );
  }
  if (!sui || !sui.address) {
    throw new Error(
      "Could not derive Sui address" +
        (lastErr && lastErr.message ? ": " + lastErr.message : "")
    );
  }

  return { mnemonic, solana: sol, evm: evm, bitcoin, sui };
}

async function createAccount(label) {
  const phrase = createTwentyFourWordMnemonic();
  const keys = await keysFromMnemonic(phrase, 0);
  if (!keys.bitcoin || !keys.sui) {
    throw new Error("Wallet create missing Bitcoin/Sui keys");
  }
  return {
    id: uid(),
    name: label || "Account",
    createdAt: new Date().toISOString(),
    mnemonic: keys.mnemonic,
    solana: keys.solana,
    evm: keys.evm,
    bitcoin: keys.bitcoin,
    sui: keys.sui,
  };
}

async function ensureState() {
  let state = await storageGet();
  if (!state || !Array.isArray(state.accounts) || !state.accounts.length) {
    const first = await createAccount("W1");
    state = {
      accounts: [first],
      activeAccountId: first.id,
      activeChainId: "solana",
      solRpc: "",
      addressBook: [],
      wcProjectId: "",
    };
    await storageSet(state);
  }
  if (!CHAINS.some((c) => c.id === state.activeChainId)) state.activeChainId = "solana";
  if (!state.accounts.some((a) => a.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0].id;
  }
  if (typeof state.solRpc !== "string") state.solRpc = "";
  if (typeof state.wcProjectId !== "string") state.wcProjectId = "";
  if (!Array.isArray(state.addressBook)) state.addressBook = [];
  let repaired = false;
  for (const a of state.accounts) {
    if (repairAccountSolanaKeys(a)) repaired = true;
  }
  if (await repairAllExtraKeys(state)) repaired = true;
  if (repaired) await storageSet(state);
  return state;
}

function solRpcList(chain) {
  const custom = normalizeCustomRpc(STATE && STATE.solRpc);
  const proxy = serverSolanaRpc();
  const base = (chain && chain.rpcs) || [chain.rpc];
  // Prefer optional user override, then local proxy, then public fallbacks.
  const out = [];
  const seen = new Set();
  const push = (u) => {
    const v = (u || "").trim();
    if (!v || seen.has(v)) return;
    if (IS_EXTENSION && v.startsWith("/")) return;
    seen.add(v);
    out.push(v);
  };
  push(custom);
  push(proxy);
  (base || []).forEach(push);
  return out;
}

function activeAccount(state) {
  return state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
}

function activeChain(state) {
  return CHAINS.find((c) => c.id === state.activeChainId) || CHAINS[0];
}

function addressFor(account, chain) {
  // Always the selected chain's deposit address — never fall back to Solana.
  return chainKeyAddress(account, chain);
}

/** On-chain deposit address for the selected network. */
function chainKeyAddress(account, chain) {
  if (!account || !chain) return "";
  if (chain.kind === "solana") return (account.solana && account.solana.publicKey) || "";
  if (chain.kind === "bitcoin") return (account.bitcoin && account.bitcoin.address) || "";
  if (chain.kind === "sui") return (account.sui && account.sui.address) || "";
  // ethereum / polygon / base / robinhood share the same EVM key
  if (chain.kind === "evm") return (account.evm && account.evm.address) || "";
  return "";
}

/** Paint top-bar address + logo for the currently selected chain. */
function paintActiveChainAddress() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const addr = chainKeyAddress(acc, chain) || "";
  const short = $("addrShort");
  if (short) short.textContent = shortAddr(addr) || "—";
  const addrLogo = $("addrChainLogo");
  if (addrLogo && chain) {
    addrLogo.src = chainLogoSrc(chain);
    addrLogo.alt = chain.symbol || chain.name || "";
  }
  const copyBtn = $("copyAddrBtn");
  if (copyBtn) {
    copyBtn.dataset.copyAddr = addr || "";
    copyBtn.title = addr
      ? "Copy " + (chain && chain.name ? chain.name + " " : "") + "address"
      : chain
        ? "No " + chain.name + " address yet"
        : "No address";
  }
}

function isValidBtcAddress(addr) {
  const a = String(addr || "").trim();
  // Native segwit P2WPKH we generate (bc1q…)
  return /^bc1q[a-z0-9]{38,60}$/i.test(a);
}

function isValidSuiAddress(addr) {
  const a = String(addr || "").trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(a);
}

/** Derive BTC/Sui keys for older accounts that only have Solana + EVM. */
async function ensureAccountExtraKeys(account) {
  if (!account) return false;
  const mnemonic = String(account.mnemonic || "").trim();
  if (!mnemonic) return false;
  if (!window.MultiHD || !window.ethers) {
    console.warn("[ensure-extra-keys] MultiHD/ethers missing");
    return false;
  }
  const haveBtc = isValidBtcAddress(account.bitcoin && account.bitcoin.address);
  const haveSui = isValidSuiAddress(account.sui && account.sui.address);
  if (haveBtc && haveSui) return false;
  try {
    const phrase = normalizeMnemonic(mnemonic);
    const m = ethers.Mnemonic.fromPhrase(phrase);
    const seed = ethers.getBytes(m.computeSeed());
    let changed = false;
    if (!haveBtc) {
      const bitcoin = await MultiHD.deriveBitcoinKeys(seed, 0);
      if (!bitcoin || !isValidBtcAddress(bitcoin.address)) {
        throw new Error("Bitcoin address derive returned empty");
      }
      account.bitcoin = {
        address: bitcoin.address,
        privateKey: bitcoin.privateKey,
        publicKey: bitcoin.publicKey,
      };
      changed = true;
    }
    if (!haveSui) {
      const sui = await MultiHD.deriveSuiKeys(seed, 0);
      if (!sui || !sui.address) throw new Error("Sui address derive returned empty");
      account.sui = {
        address: sui.address,
        publicKey: sui.publicKey,
        secretKey: sui.secretKey,
      };
      changed = true;
    }
    return changed;
  } catch (err) {
    console.warn("[ensure-extra-keys]", err);
    return false;
  }
}

async function repairAllExtraKeys(state) {
  if (!state || !Array.isArray(state.accounts)) return false;
  let repaired = false;
  for (const a of state.accounts) {
    if (await ensureAccountExtraKeys(a)) repaired = true;
  }
  return repaired;
}

function isValidSolanaAddress(addr) {
  try {
    if (!addr || !window.Base58) return false;
    const bytes = Base58.decode(String(addr).trim());
    return bytes && bytes.length === 32;
  } catch {
    return false;
  }
}

/** Repair stored pubkey from secret if it was corrupted / wrong size. */
function repairAccountSolanaKeys(account) {
  if (!account || !account.solana || !account.solana.secretKey || !window.nacl || !window.Base58) {
    return false;
  }
  try {
    const sk = Base58.decode(account.solana.secretKey);
    let kp;
    if (sk.length === 64) kp = nacl.sign.keyPair.fromSecretKey(sk);
    else if (sk.length === 32) kp = nacl.sign.keyPair.fromSeed(sk);
    else return false;
    const derived = Base58.encode(kp.publicKey);
    if (account.solana.publicKey !== derived) {
      account.solana.publicKey = derived;
      account.solana.secretKey = Base58.encode(kp.secretKey);
      return true;
    }
  } catch (err) {
    console.warn("[repair-sol]", err);
  }
  return false;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    showToast("Address copied");
  } catch {
    showToast("Copy failed");
  }
}

function go(panel) {
  document.querySelectorAll(".panel").forEach((p) => {
    const on = p.dataset.panel === panel;
    p.hidden = !on;
    p.classList.toggle("is-active", on);
  });
  document.querySelectorAll(".dock-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.go === panel);
  });
  const stage = document.querySelector("body.is-extension .stage");
  if (stage) stage.scrollTo({ top: 0, behavior: "smooth" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
  if (panel === "receive") renderReceive();
  if (panel === "activity") {
    renderAccountsPanel();
    refreshAccountBalances();
  }
  if (panel === "send") {
    paintSendContacts();
    updateSendUsdEstimate();
    paintSendAvailable();
  }
  if (panel === "history") {
    refreshHistory();
  }
  if (panel === "settings") {
    paintSettings();
  }
}

function renderQR(text) {
  const box = $("qrBox");
  if (!box) return;
  box.innerHTML = "";
  if (!text || typeof qrcode !== "function") {
    box.textContent = "QR unavailable";
    return;
  }
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    box.innerHTML = qr.createSvgTag(4, 2);
    const svg = box.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", "160");
      svg.setAttribute("height", "160");
      svg.style.display = "block";
    }
  } catch (err) {
    box.textContent = "QR error";
    console.warn(err);
  }
}

let STATE = null;
let PRICES = { solana: 0, ethereum: 0, "matic-network": 0 };
let BALANCE = { native: 0, usd: 0, ok: false, error: "" };
let HOLDINGS = []; // [{symbol, name, mint, amount, decimals, usd, kind}]
let MINT_META = {}; // mint -> {symbol, name}
/** accountId -> { sol:number|null, loading:boolean, error:string } */
let ACCOUNT_SOL = {};
let accountBalSeq = 0;
let balanceSeq = 0;
/** Recent txs for History tab */
let TX_HISTORY = [];
let historySeq = 0;
const LOCAL_TX_KEY = "gladiator_local_txs_v1";
const SWAP_PROGRAMS = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
]);

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

MINT_META[USDC_MINT] = { symbol: "USDC", name: "USD Coin" };

async function solRpc(method, params, rpcs) {
  // Prefer local proxy first (local serve.py only). Extension uses public HTTPS RPCs.
  const proxy = serverSolanaRpc();
  const list = [];
  const seen = new Set();
  const push = (u) => {
    const v = (u || "").trim();
    if (!v || seen.has(v)) return;
    // Extension cannot use relative /api paths
    if (IS_EXTENSION && v.startsWith("/")) return;
    seen.add(v);
    list.push(v);
  };
  push(proxy);
  (rpcs || []).forEach(push);
  if (!list.length) {
    push("https://api.mainnet-beta.solana.com");
    push("https://solana-rpc.publicnode.com");
    push("https://rpc.ankr.com/solana");
  }

  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status + " @ " + rpc);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || method + " failed");
      return j.result;
    } catch (err) {
      lastErr = err;
      console.warn("[rpc]", method, rpc, err && err.message ? err.message : err);
    }
  }
  throw lastErr || new Error("All Solana RPCs failed");
}

async function fetchSolBalance(address, rpcs) {
  const result = await solRpc("getBalance", [address], rpcs);
  return Number(result && result.value != null ? result.value : 0) / 1e9;
}

async function fetchPrices() {
  try {
    const ids = "solana,ethereum,matic-network,bitcoin,sui";
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=" +
      ids +
      "&vs_currencies=usd";
    const res = await fetch(url);
    if (!res.ok) throw new Error("price http " + res.status);
    const j = await res.json();
    PRICES = {
      solana: Number(j.solana && j.solana.usd) || 0,
      ethereum: Number(j.ethereum && j.ethereum.usd) || 0,
      "matic-network": Number(j["matic-network"] && j["matic-network"].usd) || 0,
      bitcoin: Number(j.bitcoin && j.bitcoin.usd) || 0,
      sui: Number(j.sui && j.sui.usd) || 0,
    };
  } catch (err) {
    console.warn("[prices]", err);
  }
}

async function fetchSplHoldings(owner, rpcs) {
  const out = [];

  // Explicit USDC mint query (more reliable than full scan alone)
  try {
    const usdcRes = await solRpc(
      "getTokenAccountsByOwner",
      [owner, { mint: USDC_MINT }, { encoding: "jsonParsed", commitment: "confirmed" }],
      rpcs
    );
    for (const row of (usdcRes && usdcRes.value) || []) {
      const info =
        row &&
        row.account &&
        row.account.data &&
        row.account.data.parsed &&
        row.account.data.parsed.info;
      if (!info || !info.tokenAmount) continue;
      const ta = info.tokenAmount;
      const amount =
        ta.uiAmount != null
          ? Number(ta.uiAmount)
          : Number(ta.amount || 0) / Math.pow(10, Number(ta.decimals || 0));
      out.push({
        mint: USDC_MINT,
        amount: amount || 0,
        decimals: Number(ta.decimals || 6),
        symbol: "USDC",
        name: "USD Coin",
        usd: amount || 0,
        kind: "spl",
        logo: "usdc",
        tokenProgram: (row.account && row.account.owner) || TOKEN_PROGRAM,
        tokenAccount: row.pubkey || "",
      });
    }
  } catch (err) {
    console.warn("[usdc]", err);
  }

  for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    let result;
    try {
      result = await solRpc(
        "getTokenAccountsByOwner",
        [
          owner,
          { programId },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
        rpcs
      );
    } catch (err) {
      console.warn("[spl]", programId, err);
      continue;
    }
    const values = (result && result.value) || [];
    for (const row of values) {
      try {
        const info =
          row &&
          row.account &&
          row.account.data &&
          row.account.data.parsed &&
          row.account.data.parsed.info;
        if (!info || !info.tokenAmount) continue;
        const mint = info.mint;
        const ta = info.tokenAmount;
        const amount =
          ta.uiAmount != null
            ? Number(ta.uiAmount)
            : Number(ta.amount || 0) / Math.pow(10, Number(ta.decimals || 0));
        if (!mint) continue;
        // Show every positive SPL / memecoin balance (Token + Token-2022)
        if (!(amount > 0) && mint !== USDC_MINT) continue;
        const meta = MINT_META[mint] || {};
        out.push({
          mint,
          amount: amount || 0,
          decimals: Number(ta.decimals || 0),
          symbol: meta.symbol || shortAddr(mint),
          name: meta.name || "SPL Token",
          usd: mint === USDC_MINT ? amount || 0 : meta.usdPrice != null ? amount * Number(meta.usdPrice) : null,
          kind: "spl",
          logo: mint === USDC_MINT ? "usdc" : meta.icon || null,
          tokenProgram: (row.account && row.account.owner) || programId,
          tokenAccount: row.pubkey || "",
        });
      } catch (_) {}
    }
  }
  const byMint = {};
  for (const t of out) {
    if (!byMint[t.mint] || t.amount > byMint[t.mint].amount) {
      byMint[t.mint] = { ...t };
    }
  }
  return Object.values(byMint).sort((a, b) => {
    if (a.mint === USDC_MINT) return -1;
    if (b.mint === USDC_MINT) return 1;
    const ua = a.usd != null ? Number(a.usd) : -1;
    const ub = b.usd != null ? Number(b.usd) : -1;
    if (ua !== ub) return ub - ua;
    return b.amount - a.amount;
  });
}

async function resolveMintMeta(mints) {
  const missing = mints.filter((m) => m && (!MINT_META[m] || MINT_META[m].partial));
  if (!missing.length) return;

  const chunk = missing.slice(0, 40);
  await Promise.all(
    chunk.map(async (mint) => {
      try {
        const res = await fetch(
          "https://lite-api.jup.ag/tokens/v2/search?query=" + encodeURIComponent(mint)
        );
        if (!res.ok) return;
        const arr = await res.json();
        const hit = Array.isArray(arr)
          ? arr.find((t) => t.id === mint || t.address === mint) || null
          : null;
        if (!hit) {
          if (!MINT_META[mint]) {
            MINT_META[mint] = {
              symbol: shortAddr(mint),
              name: "Unknown token",
              partial: true,
            };
          }
          return;
        }
        MINT_META[mint] = {
          symbol: hit.symbol || hit.ticker || shortAddr(mint),
          name: hit.name || "SPL Token",
          icon: hit.icon || hit.logoURI || hit.logo || "",
          usdPrice:
            hit.usdPrice != null
              ? Number(hit.usdPrice)
              : hit.price != null
                ? Number(hit.price)
                : null,
        };
      } catch (_) {}
    })
  );

  // Fill missing USD via Jupiter price API (batches)
  const needPrice = chunk.filter(
    (m) => MINT_META[m] && (MINT_META[m].usdPrice == null || !(MINT_META[m].usdPrice >= 0))
  );
  for (let i = 0; i < needPrice.length; i += 50) {
    const ids = needPrice.slice(i, i + 50);
    try {
      const res = await fetch(
        "https://lite-api.jup.ag/price/v2?ids=" + ids.map(encodeURIComponent).join(",")
      );
      if (!res.ok) continue;
      const j = await res.json();
      const data = (j && j.data) || j || {};
      ids.forEach((mint) => {
        const row = data[mint];
        const px = row && (row.price != null ? row.price : row);
        if (px != null && MINT_META[mint]) {
          MINT_META[mint].usdPrice = Number(px) || 0;
        }
      });
    } catch (_) {}
  }
}

async function fetchEvmBalance(address, rpcOrList) {
  const list = Array.isArray(rpcOrList)
    ? rpcOrList
    : [rpcOrList].filter(Boolean);
  if (!list.length) throw new Error("No EVM RPC configured");
  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status + " @ " + rpc);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || "evm rpc");
      const hex = j.result || "0x0";
      return Number(BigInt(hex)) / 1e18;
    } catch (err) {
      lastErr = err;
      console.warn("[evm-rpc]", rpc, err && err.message ? err.message : err);
    }
  }
  throw lastErr || new Error("All EVM RPCs failed");
}

async function fetchBtcBalance(address, apiBase) {
  const base = (apiBase || "https://blockstream.info/api").replace(/\/$/, "");
  const urls = [
    base + "/address/" + address,
    "https://mempool.space/api/address/" + address,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("btc http " + res.status);
      const j = await res.json();
      const chain = j.chain_stats || {};
      const mem = j.mempool_stats || {};
      const funded = Number(chain.funded_txo_sum || 0) + Number(mem.funded_txo_sum || 0);
      const spent = Number(chain.spent_txo_sum || 0) + Number(mem.spent_txo_sum || 0);
      return (funded - spent) / 1e8;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("btc balance failed");
}

async function fetchSuiBalance(address, rpcs) {
  const list = (rpcs && rpcs.length ? rpcs : [
    "https://sui-mainnet-endpoint.blockvision.org",
    "https://rpc-mainnet.suiscan.xyz",
  ]);
  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getBalance",
          params: [address],
        }),
      });
      if (!res.ok) throw new Error("sui http " + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || "sui rpc");
      const total = (j.result && j.result.totalBalance) || "0";
      return Number(total) / 1e9;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("sui balance failed");
}

function nativeHoldingRow(chain, amount, usd) {
  return {
    chainId: chain.id,
    symbol: chain.symbol,
    name: chain.name,
    mint: null,
    amount: amount,
    decimals: chain.decimals,
    usd: usd,
    kind: "native",
    logo: chain.logo || null,
  };
}

async function refreshBalance() {
  const seq = ++balanceSeq;
  const chain = activeChain(STATE);
  const acc = activeAccount(STATE);
  if (acc) repairAccountSolanaKeys(acc);
  const addr = chainKeyAddress(acc, chain);
  const displayAddr = addressFor(acc, chain);
  const statusEl = $("balanceStatus");
  const stillCurrent = () =>
    seq === balanceSeq &&
    STATE &&
    STATE.activeChainId === chain.id &&
    STATE.activeAccountId === (acc && acc.id);

  // Optimistic reset only if this is still the latest request.
  if (stillCurrent()) {
    BALANCE = { native: 0, usd: 0, ok: false, error: "", chainId: chain.id };
    HOLDINGS = [];
    paintBalances();
    paintHoldings();
    if (statusEl) statusEl.textContent = "Syncing " + chain.name + "…";
  }

  const commit = (nextBalance, nextHoldings, statusText) => {
    if (!stillCurrent()) return false;
    BALANCE = nextBalance;
    HOLDINGS = nextHoldings;
    if (statusEl && statusText) statusEl.textContent = statusText;
    paintBalances();
    paintHoldings();
    paintAccountBalanceCells();
    paintSendAvailable();
    return true;
  };

  try {
    let native = 0;
    let nextHoldings = [];
    let nextBalance = { native: 0, usd: 0, ok: false, error: "", chainId: chain.id };

    if (chain.kind === "solana") {
      if (!isValidSolanaAddress(addr)) {
        throw new Error(
          "Invalid Solana address on this account (WrongSize). Open Accounts → generate a new wallet or re-import your seed."
        );
      }
      const rpcs = solRpcList(chain);
      native = await fetchSolBalance(addr, rpcs);
      if (!stillCurrent()) return;
      let spl = await fetchSplHoldings(addr, rpcs);
      if (!stillCurrent()) return;
      await resolveMintMeta(
        spl.map((row) => row.mint).filter((m) => m && m !== USDC_MINT)
      );
      if (!stillCurrent()) return;
      spl = spl.map((row) => {
        const meta = MINT_META[row.mint] || {};
        const price =
          row.mint === USDC_MINT
            ? 1
            : meta.usdPrice != null
              ? Number(meta.usdPrice)
              : null;
        return {
          ...row,
          chainId: chain.id,
          symbol: meta.symbol || row.symbol,
          name: meta.name || row.name,
          logo: row.mint === USDC_MINT ? "usdc" : meta.icon || row.logo || null,
          usd: price != null ? Number(row.amount) * price : row.usd,
        };
      });
      if (!spl.some((row) => row.mint === USDC_MINT)) {
        spl.unshift({
          chainId: chain.id,
          mint: USDC_MINT,
          amount: 0,
          decimals: 6,
          symbol: "USDC",
          name: "USD Coin",
          usd: 0,
          kind: "spl",
          logo: "usdc",
          tokenProgram: TOKEN_PROGRAM,
          tokenAccount: "",
        });
      }
      const other = spl
        .filter((row) => row.mint !== USDC_MINT && row.amount > 0)
        .sort((a, b) => (Number(b.usd) || 0) - (Number(a.usd) || 0));
      const usdc = spl.find((row) => row.mint === USDC_MINT);
      const px = PRICES[chain.priceId] || 0;
      const usdcAmt = usdc ? usdc.amount : 0;
      const otherUsd = other.reduce((s, row) => s + (Number(row.usd) || 0), 0);
      nextBalance = {
        native,
        usd: native * px + usdcAmt + otherUsd,
        ok: true,
        error: "",
        chainId: chain.id,
      };
      nextHoldings = [
        {
          chainId: chain.id,
          symbol: "SOL",
          name: "Solana",
          mint: null,
          amount: native,
          decimals: 9,
          usd: native * px,
          kind: "native",
          logo: "solana",
        },
        usdc,
        ...other,
      ].filter(Boolean);
    } else if (chain.kind === "bitcoin") {
      if (!addr) throw new Error("No Bitcoin address on this account — re-open wallet to derive keys.");
      native = await fetchBtcBalance(addr, chain.rpc);
      if (!stillCurrent()) return;
      const px = PRICES[chain.priceId] || 0;
      nextBalance = { native, usd: native * px, ok: true, error: "", chainId: chain.id };
      nextHoldings = [nativeHoldingRow(chain, native, native * px)];
    } else if (chain.kind === "sui") {
      if (!addr) throw new Error("No Sui address on this account — re-open wallet to derive keys.");
      native = await fetchSuiBalance(addr, chain.rpcs || [chain.rpc]);
      if (!stillCurrent()) return;
      const px = PRICES[chain.priceId] || 0;
      nextBalance = { native, usd: native * px, ok: true, error: "", chainId: chain.id };
      nextHoldings = [nativeHoldingRow(chain, native, native * px)];
    } else {
      if (!addr) throw new Error("No EVM address on this account.");
      native = await fetchEvmBalance(addr, chain.rpcs || [chain.rpc]);
      if (!stillCurrent()) return;
      const px = PRICES[chain.priceId] || 0;
      nextBalance = { native, usd: native * px, ok: true, error: "", chainId: chain.id };
      nextHoldings = [nativeHoldingRow(chain, native, native * px)];
    }

    const statusText =
      "Synced · " +
      chain.name +
      " " +
      shortAddr(addr || displayAddr) +
      " · " +
      nextHoldings.length +
      " assets";
    if (commit(nextBalance, nextHoldings, statusText)) {
      if (acc && chain.kind === "solana" && nextBalance.ok) {
        ACCOUNT_SOL[acc.id] = { sol: Number(nextBalance.native) || 0, loading: false, error: "" };
      }
    }
  } catch (err) {
    if (!stillCurrent()) return;
    const msg = String(err && err.message ? err.message : err);
    const nextBalance = { native: 0, usd: 0, ok: false, error: msg, chainId: chain.id };
    const nextHoldings =
      chain.kind === "solana"
        ? [
            {
              chainId: chain.id,
              symbol: "SOL",
              name: "Solana",
              mint: null,
              amount: 0,
              usd: 0,
              kind: "native",
              logo: "solana",
            },
            {
              chainId: chain.id,
              symbol: "USDC",
              name: "USD Coin",
              mint: USDC_MINT,
              amount: 0,
              usd: 0,
              kind: "spl",
              logo: "usdc",
            },
          ]
        : [nativeHoldingRow(chain, 0, 0)];
    commit(nextBalance, nextHoldings, "RPC error: " + msg);
  }
}

function paintBalances() {
  const chain = activeChain(STATE);
  const fiat = $("fiatBalance");
  const native = $("nativeBalance");
  const sym = $("nativeSymbol");
  const badge = $("chainBadge");
  const delta = $("dayDelta");
  const solLogo = $("solBalanceLogo");
  if (badge) badge.textContent = chain.name;
  if (sym) sym.textContent = chain.symbol;
  if (solLogo) {
    const logo = chain.logo || "solana";
    solLogo.hidden = false;
    solLogo.src = "./icons/" + logo + ".png?v=" + LOGO_ICON_VER;
    solLogo.alt = chain.symbol || "";
  }
  if (fiat) fiat.textContent = BALANCE.usd.toFixed(2);
  const digits =
    chain.kind === "bitcoin" ? 8 : chain.kind === "solana" || chain.kind === "sui" ? 4 : 5;
  if (native) native.textContent = Number(BALANCE.native || 0).toFixed(digits);
  if (delta) {
    const splN = HOLDINGS.filter((h) => h.kind === "spl" && h.amount > 0).length;
    delta.textContent = BALANCE.ok
      ? splN
        ? "on-chain · " + splN + " SPL"
        : "on-chain"
      : chain.kind === "solana"
        ? "Solana sync failed — check Helius in Advanced · RPC"
        : chain.name + " sync failed — retry Sync";
    delta.className = "delta " + (BALANCE.ok ? "up" : "");
  }
}

function chainLogoSrc(chainOrLogo) {
  const logo =
    typeof chainOrLogo === "string"
      ? chainOrLogo
      : (chainOrLogo && (chainOrLogo.logo || chainOrLogo.id)) || "solana";
  const file = String(logo || "solana").replace(/[^a-z0-9_-]/gi, "") || "solana";
  return "./icons/" + file + ".png?v=" + LOGO_ICON_VER;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenLogoHtml(t) {
  const localLogos = {
    solana: "solana",
    usdc: "usdc",
    ethereum: "ethereum",
    bitcoin: "bitcoin",
    polygon: "polygon",
    sui: "sui",
    base: "base",
    robinhood: "robinhood",
  };
  let key = t.logo;
  if (t.mint === USDC_MINT || t.symbol === "USDC") key = "usdc";
  if (key && localLogos[key]) {
    const file = localLogos[key];
    return (
      '<img class="token-logo-img" src="./icons/' +
      file +
      ".png?v=" +
      LOGO_ICON_VER +
      '" alt="' +
      String(t.symbol || file).replace(/"/g, "") +
      '" />'
    );
  }
  if (t.logo && /^https?:\/\//i.test(String(t.logo))) {
    return (
      '<img class="token-logo-img" src="' +
      String(t.logo).replace(/"/g, "") +
      '" alt="' +
      String(t.symbol || "token").replace(/"/g, "") +
      '" loading="lazy" referrerpolicy="no-referrer" />'
    );
  }
  const letters = String(t.symbol || "??").slice(0, 2).toUpperCase();
  return '<span class="token-icon usdc">' + letters + "</span>";
}

function paintHoldings() {
  const list = $("tokenList");
  const chain = activeChain(STATE);
  const acc = activeAccount(STATE);
  const addr = addressFor(acc, chain);
  if (!list) return;
  list.innerHTML = "";

  // Never paint another chain's leftovers while switching.
  let rows = (HOLDINGS || []).filter(
    (h) => !h.chainId || h.chainId === chain.id
  );
  if (!rows.length) {
    if (chain.kind === "solana") {
      rows = [
        {
          chainId: chain.id,
          symbol: "SOL",
          name: "Solana",
          amount: 0,
          usd: 0,
          kind: "native",
          logo: "solana",
        },
        {
          chainId: chain.id,
          symbol: "USDC",
          name: "USD Coin",
          amount: 0,
          usd: 0,
          kind: "spl",
          logo: "usdc",
          mint: USDC_MINT,
        },
      ];
    } else {
      rows = [nativeHoldingRow(chain, 0, 0)];
    }
  }

  rows.forEach((t) => {
    const li = document.createElement("li");
    // Always show THIS wallet's address (not the token mint — mint looks like another wallet).
    const chainAddr = chainKeyAddress(acc, chain) || addr;
    const sub =
      t.kind === "spl"
        ? (t.name && t.name !== t.symbol ? t.name : "SPL token") +
          " · " +
          shortAddr(addr)
        : chain.name + " · " + shortAddr(chainAddr);
    const mintTitle =
      t.kind === "spl" && t.mint ? " title=\"Mint " + t.mint + "\"" : "";
    const usdLabel =
      t.usd != null && !Number.isNaN(Number(t.usd))
        ? "$" +
          Number(t.usd).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: Number(t.usd) < 1 ? 4 : 2,
          })
        : "—";
    const amtLabel =
      (Number(t.amount) >= 1
        ? Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })
        : Number(t.amount).toFixed(6)) +
      " " +
      t.symbol;
    li.innerHTML =
      '<button type="button" class="token-row" data-mint="' +
      (t.mint || "native") +
      '"' +
      mintTitle +
      ">" +
      '<span class="token-logo">' +
      tokenLogoHtml(t) +
      "</span>" +
      '<span class="token-meta"><strong>' +
      (t.symbol || "TOKEN") +
      "</strong><span>" +
      sub +
      "</span></span>" +
      '<span class="token-vals"><strong>' +
      amtLabel +
      "</strong><span>" +
      usdLabel +
      "</span></span></button>";
    li.querySelector("button")?.addEventListener("click", () => {
      const sel = $("sendAsset");
      if (sel) {
        const val = t.mint || "native";
        if (![...sel.options].some((o) => o.value === val)) {
          // ensure option exists after paint
        } else {
          sel.value = val;
        }
      }
      go("send");
      if (sel) sel.value = t.mint || "native";
      updateSendUsdEstimate();
    });
    list.appendChild(li);
  });

  const count = $("tokenCount");
  if (count) {
    const splN = rows.filter((h) => h.kind === "spl" && Number(h.amount) > 0).length;
    count.textContent = splN
      ? rows.length + " assets · " + splN + " token" + (splN === 1 ? "" : "s")
      : rows.length + " assets";
  }

  const sendAsset = $("sendAsset");
  if (sendAsset) {
    sendAsset.innerHTML = rows
      .map((t) => {
        const val = t.mint || "native";
        return (
          '<option value="' +
          val +
          '">' +
          t.symbol +
          " · " +
          Number(t.amount).toFixed(4) +
          " available</option>"
        );
      })
      .join("");
  }
  const fee = $("feeEst");
  if (fee) fee.textContent = chain.name;
  updateSendUsdEstimate();
  paintSendAvailable();
}

function sendAssetUnitPriceUsd() {
  const chain = activeChain(STATE);
  const assetVal = ($("sendAsset") && $("sendAsset").value) || "native";
  if (assetVal === USDC_MINT || assetVal === "USDC") return 1;
  if (assetVal === "native" || !assetVal) {
    return Number(PRICES[chain.priceId]) || 0;
  }
  const holding = HOLDINGS.find((h) => h.mint === assetVal);
  if (holding && Number(holding.amount) > 0 && Number(holding.usd) > 0) {
    return Number(holding.usd) / Number(holding.amount);
  }
  if (holding && (holding.symbol === "USDC" || holding.mint === USDC_MINT)) return 1;
  return 0;
}

function updateSendUsdEstimate() {
  const el = $("sendUsdEst");
  if (!el) return;
  const raw = ($("sendAmount")?.value || "").trim().replace(/,/g, "");
  const amount = Number(raw);
  const px = sendAssetUnitPriceUsd();
  if (!raw || !(amount > 0)) {
    el.textContent = px > 0 ? "≈ $0.00 USD" : "≈ — USD";
    el.classList.add("is-empty");
    return;
  }
  if (!(px > 0)) {
    el.textContent = "≈ — USD · price unavailable";
    el.classList.add("is-empty");
    return;
  }
  const usd = amount * px;
  const formatted =
    usd >= 1000
      ? usd.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : usd.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: usd < 1 ? 4 : 2,
        });
  el.textContent = "≈ $" + formatted + " USD";
  el.classList.remove("is-empty");
}

function bytesToBase64(u8) {
  let s = "";
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function uiAmountToRaw(amount, decimals) {
  const d = Number(decimals) || 0;
  const str = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error("Invalid amount");
  const [whole, frac = ""] = str.split(".");
  if (frac.length > d) throw new Error("Too many decimal places");
  const padded = (frac + "0".repeat(d)).slice(0, d);
  return BigInt(whole + padded);
}

function selectedSendHolding() {
  const assetVal = ($("sendAsset") && $("sendAsset").value) || "native";
  if (assetVal === "native") {
    return HOLDINGS.find((h) => h.kind === "native") || null;
  }
  return HOLDINGS.find((h) => h.mint === assetVal) || null;
}

function solanaKeypairFromAccount(acc) {
  if (!window.solanaWeb3) throw new Error("Solana tx library missing — restart with start.ps1 from the latest wallet folder");
  if (!acc || !acc.solana || !acc.solana.secretKey) throw new Error("No Solana key on this account");
  const sk = Base58.decode(acc.solana.secretKey);
  if (sk.length === 64) return solanaWeb3.Keypair.fromSecretKey(sk);
  if (sk.length === 32) return solanaWeb3.Keypair.fromSeed(sk);
  throw new Error("Corrupt Solana secret key (need 32 or 64 bytes)");
}

/* ——— WalletConnect (Solana / pump.fun) ——— */
let WC_PENDING_PROPOSAL = null;
let WC_PENDING_REQUEST = null;
let WC_WIRED = false;

function setWcStatus(msg) {
  const el = $("wcStatus");
  if (el) el.textContent = msg || "";
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || "").replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeWcBytes(raw) {
  if (raw == null) throw new Error("Missing payload");
  if (raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (Array.isArray(raw)) return new Uint8Array(raw);
  if (typeof raw !== "string") throw new Error("Unsupported payload type");
  const s = raw.trim();
  if (!s) throw new Error("Empty payload");
  // Hex
  if (/^(0x)?[0-9a-fA-F]+$/.test(s) && s.replace(/^0x/, "").length % 2 === 0 && s.length >= 16) {
    const hex = s.replace(/^0x/, "");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  // Solana WC payloads are usually base58 — try before base64 (overlap causes bad sigs).
  try {
    return Base58.decode(s);
  } catch (_) {}
  // Base64
  if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0) {
    try {
      return base64ToBytes(s);
    } catch (_) {}
  }
  // UTF-8 text fallback
  return new TextEncoder().encode(s);
}

/** WalletConnect solana_signMessage: message field is base58-encoded bytes. */
function decodeWcSignMessage(raw) {
  if (raw == null) throw new Error("Missing message");
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw !== "string") return decodeWcBytes(raw);
  const s = raw.trim();
  if (!s) throw new Error("Empty message");
  try {
    return Base58.decode(s);
  } catch (_) {
    // pump.fun / some dApps may send utf8 text
    return new TextEncoder().encode(s);
  }
}

function normalizeWcParams(params) {
  if (params == null) return {};
  if (Array.isArray(params)) {
    if (!params.length) return {};
    const only = params[0];
    if (only && typeof only === "object" && !Array.isArray(only)) return only;
    if (typeof only === "string") {
      return {
        message: only,
        transaction: only,
        pubkey: typeof params[1] === "string" ? params[1] : undefined,
      };
    }
    return {};
  }
  return params;
}

function extractWcTxBlob(params) {
  if (!params) throw new Error("No transaction params");
  if (typeof params === "string") return params;
  return (
    params.transaction ||
    params.tx ||
    (params.transactions && params.transactions[0]) ||
    params.message ||
    null
  );
}

function signSolanaTxBytes(bytes, keypair) {
  ensureBrowserBuffer();
  const { Transaction, VersionedTransaction } = solanaWeb3;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Versioned txs start with a version/prefix byte; try Versioned first for pump.fun.
  if (VersionedTransaction) {
    try {
      const vtx = VersionedTransaction.deserialize(u8);
      vtx.sign([keypair]);
      const signed = vtx.serialize();
      const sig =
        vtx.signatures && vtx.signatures[0]
          ? Base58.encode(vtx.signatures[0])
          : Base58.encode(signed);
      return {
        signature: sig,
        signedTransaction: Base58.encode(signed),
        signedBytes: signed instanceof Uint8Array ? signed : new Uint8Array(signed),
      };
    } catch (_) {
      /* fall through to legacy */
    }
  }
  const tx = Transaction.from(u8);
  tx.partialSign(keypair);
  const signed = tx.serialize();
  const sig0 = tx.signatures && tx.signatures[0] && tx.signatures[0].signature;
  return {
    signature: Base58.encode(sig0 || signed),
    signedTransaction: Base58.encode(signed),
    signedBytes: signed instanceof Uint8Array ? signed : new Uint8Array(signed),
  };
}

function shortHost(url) {
  try {
    return new URL(url).host || url;
  } catch (_) {
    return url || "";
  }
}

function accountHint(accounts) {
  if (!accounts || !accounts.length) return "";
  const a = String(accounts[0] || "");
  const parts = a.split(":");
  const addr = parts[parts.length - 1] || a;
  if (addr.length < 10) return addr;
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

const WC_SESSIONS_STORE = "gladiator_wc_sessions";

function collectLiveWcSessions() {
  try {
    if (!(window.GladiatorWC && GladiatorWC.isReady())) return [];
    if (typeof GladiatorWC.listSessions === "function") {
      return GladiatorWC.listSessions() || [];
    }
    const sessions = GladiatorWC.getActiveSessions() || {};
    return Object.keys(sessions).map((topic) => {
      const s = sessions[topic] || {};
      const meta = (s.peer && s.peer.metadata) || {};
      const ns = s.namespaces || {};
      const accounts = [];
      for (const key of Object.keys(ns)) {
        const block = ns[key] || {};
        if (Array.isArray(block.accounts)) accounts.push(...block.accounts);
      }
      return {
        topic,
        name: meta.name || "dApp",
        url: meta.url || "",
        icon: Array.isArray(meta.icons) && meta.icons[0] ? meta.icons[0] : "",
        accounts,
        status: "active",
      };
    });
  } catch (_) {
    return [];
  }
}

async function persistWcSessions(items) {
  const list = Array.isArray(items) ? items : collectLiveWcSessions();
  const payload = { at: Date.now(), items: list };
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [WC_SESSIONS_STORE]: payload }, () => resolve());
      });
    } else {
      localStorage.setItem(WC_SESSIONS_STORE, JSON.stringify(payload));
    }
  } catch (_) {}
  return list;
}

async function readPersistedWcSessions() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const bag = await new Promise((resolve) => {
        chrome.storage.local.get([WC_SESSIONS_STORE], (r) => resolve(r || {}));
      });
      const items = bag[WC_SESSIONS_STORE] && bag[WC_SESSIONS_STORE].items;
      return Array.isArray(items) ? items : [];
    }
    const raw = localStorage.getItem(WC_SESSIONS_STORE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed && parsed.items) ? parsed.items : [];
  } catch (_) {
    return [];
  }
}

async function loadWcSessionMirror() {
  // Prefer live WalletKit sessions; fall back to last persisted snapshot
  // so Connections still shows Jupiter/etc after the popup reopens.
  const live = collectLiveWcSessions();
  if (live.length) {
    await persistWcSessions(live);
    return live;
  }
  return readPersistedWcSessions();
}

async function refreshWcConnections(opts) {
  const ensure = !opts || opts.ensure !== false;
  const poll = opts && typeof opts.poll === "number" ? opts.poll : 0;
  if (
    ensure &&
    STATE &&
    STATE.wcProjectId &&
    window.GladiatorWC &&
    !(GladiatorWC.isReady && GladiatorWC.isReady())
  ) {
    try {
      await ensureWalletConnect();
    } catch (_) {}
  }
  // Session approve can land a moment after pair — optional short poll.
  let items = collectLiveWcSessions();
  for (let i = 0; i < poll && !items.length; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (window.GladiatorWC && typeof GladiatorWC.processPendings === "function") {
        await GladiatorWC.processPendings();
      }
    } catch (_) {}
    items = collectLiveWcSessions();
  }
  // Collapse stacked sessions from repeated Connects to the same dApp (e.g. jup.ag).
  if (
    items.length > 1 &&
    window.GladiatorWC &&
    typeof GladiatorWC.pruneDuplicatePeerSessions === "function"
  ) {
    try {
      const removed = await GladiatorWC.pruneDuplicatePeerSessions();
      if (removed) items = collectLiveWcSessions();
    } catch (_) {}
  }
  if (items.length) {
    await persistWcSessions(items);
  } else if (window.GladiatorWC && GladiatorWC.isReady && GladiatorWC.isReady()) {
    // WalletKit restored and empty — drop stale mirror.
    await persistWcSessions([]);
    items = [];
  } else {
    items = await readPersistedWcSessions();
  }
  paintWcConnectionsList(items);
  if (items.length) {
    const name = items[0].name || "dApp";
    setWcStatus(
      "Connected to " + name + (items.length > 1 ? " (+" + (items.length - 1) + ")" : "")
    );
  }
  return items;
}

function paintWcConnectionsList(items) {
  const list = $("wcConnectionsList");
  const empty = $("wcConnectionsEmpty");
  if (!list) return;
  const rows = Array.isArray(items) ? items : [];
  list.innerHTML = "";
  if (!rows.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  for (const item of rows) {
    if (!item) continue;
    const li = document.createElement("li");
    li.className = "wc-conn-item";
    li.dataset.topic = item.topic || "";

    const iconUrl = item.icon || "";
    let iconHtml;
    if (iconUrl && /^https?:/i.test(iconUrl)) {
      iconHtml =
        '<img class="wc-conn-icon" alt="" src="' +
        iconUrl.replace(/"/g, "") +
        '" onerror="this.classList.add(\'fallback\');this.removeAttribute(\'src\');this.textContent=\'WC\';" />';
    } else {
      const initials = String(item.name || "WC")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 2)
        .toUpperCase() || "WC";
      iconHtml = '<div class="wc-conn-icon fallback">' + initials + "</div>";
    }

    const status = item.status === "pending" ? "pending" : "active";
    const sub =
      status === "pending"
        ? item.uri || "Waiting for pair / approve…"
        : [shortHost(item.url), accountHint(item.accounts)].filter(Boolean).join(" · ") ||
          "Solana session";

    li.innerHTML =
      iconHtml +
      '<div class="wc-conn-meta">' +
      "<strong></strong>" +
      "<span></span>" +
      '<em class="wc-conn-badge ' +
      status +
      '">' +
      status +
      "</em>" +
      "</div>" +
      '<button type="button" class="wc-conn-disconnect" data-topic="">Disconnect</button>';
    li.querySelector("strong").textContent = item.name || "dApp";
    li.querySelector("span").textContent = sub;
    const btn = li.querySelector(".wc-conn-disconnect");
    btn.dataset.topic = item.topic || "";
    btn.textContent = status === "pending" ? "Cancel" : "Disconnect";
    list.appendChild(li);
  }
}

async function paintWcConnections() {
  await refreshWcConnections({ ensure: true });
}

function paintWcSettings() {
  const input = $("wcProjectId");
  if (input && STATE) input.value = STATE.wcProjectId || "";
  refreshWcConnections({ ensure: true })
    .then((items) => {
      if (items && items.length) return;
      const el = $("wcStatus");
      const cur = el && el.textContent ? el.textContent.trim() : "";
      if (!cur || cur === "Not connected" || /^Ready|^Add a/.test(cur)) {
        setWcStatus(
          STATE && STATE.wcProjectId
            ? "Ready — paste a wc: URI"
            : "Add a Reown Project ID to start"
        );
      }
    })
    .catch(() => {});
}

async function wcDisconnectTopic(topic) {
  const t = String(topic || "").trim();
  if (!t) {
    await wcDisconnect();
    return;
  }
  try {
    await ensureWalletConnect();
    if (t.startsWith("pending:")) {
      showToast("Nothing to cancel");
      paintWcSettings();
      return;
    }
    if (typeof GladiatorWC.disconnectSession === "function") {
      await GladiatorWC.disconnectSession(t);
    } else {
      await GladiatorWC.disconnectAll();
    }
    await persistWcSessions();
    setWcStatus("Disconnected");
    showToast("Disconnected");
    paintWcSettings();
  } catch (err) {
    showToast(String(err && err.message ? err.message : err));
  }
}

function showWcApproveBar(hintText, statusText) {
  const bar = $("wcApproveBar");
  const hint = $("wcApproveHint");
  if (hint) {
    hint.textContent =
      hintText ||
      "dApp is waiting — tap Approve in Gladiator.";
  }
  if (bar) {
    bar.hidden = false;
    bar.classList.add("is-open");
    if (typeof bar.scrollIntoView === "function") {
      bar.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
  setWcStatus(statusText || "Waiting for Approve…");
  showToast(statusText || "Tap Approve");
}

function hideWcApproveBar() {
  const bar = $("wcApproveBar");
  if (bar) {
    bar.hidden = true;
    bar.classList.remove("is-open");
  }
}

function openWcProposalModal(proposal) {
  WC_PENDING_PROPOSAL = proposal;
  const meta =
    proposal &&
    proposal.params &&
    proposal.params.proposer &&
    proposal.params.proposer.metadata;
  const name = (meta && meta.name) || "dApp";
  const url = (meta && meta.url) || "";
  const title = $("wcProposalTitle");
  const body = $("wcProposalBody");
  if (title) title.textContent = "Connect " + name + "?";
  if (body) {
    body.textContent =
      "Approve Solana WalletConnect for " +
      name +
      (url ? " (" + url + ")" : "") +
      ". Uses your active Gladiator Solana address.";
  }
  // Inline Approve is more reliable in the tiny extension popup.
  showWcApproveBar(
    "Connect to " + name + "? Tap Approve to link your Solana wallet.",
    "Approve connection"
  );
  const modal = $("wcProposalModal");
  if (modal) modal.hidden = false;
}

function closeWcProposalModal() {
  const modal = $("wcProposalModal");
  if (modal) modal.hidden = true;
  if (!WC_PENDING_REQUEST) hideWcApproveBar();
  WC_PENDING_PROPOSAL = null;
}

function openWcSignRequest(event) {
  WC_PENDING_REQUEST = event;
  const method =
    (event && event.params && event.params.request && event.params.request.method) ||
    "sign";
  const label =
    method === "solana_signMessage"
      ? "Approve signature — pump.fun needs this to prove wallet ownership."
      : method === "solana_signTransaction" || method === "solana_signAndSendTransaction"
        ? "Approve transaction from the dApp."
        : "Approve WalletConnect request (" + method + ").";
  showWcApproveBar(label, "Tap Approve to sign");
}

async function ensureWalletConnect() {
  if (!window.GladiatorWC) {
    throw new Error("WalletConnect bundle missing — reload the extension");
  }
  const projectId = (
    ($("wcProjectId") && $("wcProjectId").value) ||
    (STATE && STATE.wcProjectId) ||
    (window.GLADIATOR_CONFIG && window.GLADIATOR_CONFIG.wcProjectId) ||
    ""
  ).trim();
  if (!projectId) {
    throw new Error("Paste a free Reown Project ID from cloud.reown.com first");
  }
  if (STATE && STATE.wcProjectId !== projectId) {
    STATE.wcProjectId = projectId;
    await storageSet(STATE);
  }
  if (!WC_WIRED) {
    GladiatorWC.setHandlers({
      getSolanaPublicKey: async () => {
        const acc = activeAccount(STATE);
        const pk = acc && acc.solana && acc.solana.publicKey;
        if (!pk) throw new Error("No Solana address on active wallet");
        return pk;
      },
      signUtf8Message: async (message) => {
        const acc = activeAccount(STATE);
        const kp = solanaKeypairFromAccount(acc);
        if (!window.nacl) throw new Error("nacl missing");
        const bytes =
          message instanceof Uint8Array
            ? message
            : new TextEncoder().encode(String(message));
        const sig = nacl.sign.detached(bytes, kp.secretKey);
        return Base58.encode(sig);
      },
      signSolanaMessage: async (params) => {
        const p = normalizeWcParams(params);
        const acc = activeAccount(STATE);
        const kp = solanaKeypairFromAccount(acc);
        const raw = p.message || p.msg || (typeof params === "string" ? params : null);
        if (!raw) throw new Error("No message to sign");
        const msgBytes = decodeWcSignMessage(raw);
        if (!window.nacl) throw new Error("nacl missing");
        // Solana Keypair.secretKey is 64 bytes (seed+pubkey) — required by nacl.sign.detached
        const sig = nacl.sign.detached(msgBytes, kp.secretKey);
        return { signature: Base58.encode(sig) };
      },
      signSolanaTransaction: async (params) => {
        const p = normalizeWcParams(params);
        const acc = activeAccount(STATE);
        const kp = solanaKeypairFromAccount(acc);
        const blob = extractWcTxBlob(p);
        const bytes = decodeWcBytes(blob);
        const signed = signSolanaTxBytes(bytes, kp);
        // WalletConnect Solana: result.signature is commonly the signed tx (base58) or sig.
        return { signature: signed.signedTransaction };
      },
      signAllSolanaTransactions: async (params) => {
        const p = normalizeWcParams(params);
        const acc = activeAccount(STATE);
        const kp = solanaKeypairFromAccount(acc);
        const list =
          (p && (p.transactions || p.txs)) ||
          (Array.isArray(params) ? params : null);
        if (!list || !list.length) throw new Error("No transactions to sign");
        const out = [];
        for (const item of list) {
          const blob = typeof item === "string" ? item : extractWcTxBlob(normalizeWcParams(item));
          const signed = signSolanaTxBytes(decodeWcBytes(blob), kp);
          out.push(signed.signedTransaction);
        }
        return { transactions: out };
      },
      signAndSendSolanaTransaction: async (params) => {
        const p = normalizeWcParams(params);
        const acc = activeAccount(STATE);
        const kp = solanaKeypairFromAccount(acc);
        const blob = extractWcTxBlob(p);
        const signed = signSolanaTxBytes(decodeWcBytes(blob), kp);
        const solChain = CHAINS.find((c) => c.id === "solana");
        const rpcs = solRpcList(solChain);
        const b64 = bytesToBase64(signed.signedBytes);
        const sig = await solRpc(
          "sendTransaction",
          [
            b64,
            {
              encoding: "base64",
              skipPreflight: false,
              preflightCommitment: "confirmed",
              maxRetries: 3,
            },
          ],
          rpcs
        );
        if (!sig) throw new Error("Broadcast failed");
        return { signature: typeof sig === "string" ? sig : String(sig) };
      },
      onProposal: async (proposal) => {
        // User already pasted the wc: URI — approve the session immediately.
        try {
          setWcStatus("Approving session…");
          await GladiatorWC.approveProposal(proposal);
          WC_PENDING_PROPOSAL = null;
          hideWcApproveBar();
          if ($("wcUri")) $("wcUri").value = "";
          setWcStatus("Session linked — waiting for ownership signature…");
          showToast("Linked");
          await persistWcSessions();
          await refreshWcConnections({ ensure: false, poll: 4 });
        } catch (err) {
          // Fallback: show manual approve if auto fails
          openWcProposalModal(proposal);
          setWcStatus(
            "Auto-approve failed: " + String(err && err.message ? err.message : err)
          );
        }
      },
      onAuthenticate: async (payload) => {
        try {
          setWcStatus("Ownership auth — signing…");
          await GladiatorWC.approveAuthenticate(payload);
          setWcStatus("Ownership signed — check dApp");
          showToast("Ownership signed");
          await persistWcSessions();
          await refreshWcConnections({ ensure: false });
        } catch (err) {
          const msg = String(err && err.message ? err.message : err);
          setWcStatus("Auth failed: " + msg);
          showToast(msg);
        }
      },
      onRequest: async (event) => {
        // dApp "writes" sign requests to the wallet over WC relay.
        // Handle them here — do not wait on a custom UI button.
        const method =
          (event && event.params && event.params.request && event.params.request.method) ||
          "request";
        try {
          setWcStatus("dApp request: " + method + " — signing…");
          showToast("Signing " + method.replace(/^solana_/, "") + "…");
          await GladiatorWC.handleRequest(event);
          setWcStatus("Signed " + method.replace(/^solana_/, "") + " — check dApp");
          showToast("Signed — check dApp");
          await persistWcSessions();
          await refreshWcConnections({ ensure: false });
        } catch (err) {
          const msg = String(err && err.message ? err.message : err);
          setWcStatus("Sign failed: " + msg);
          showToast(msg);
          // Offer manual retry
          openWcSignRequest(event);
        }
      },
      onSessionDelete: async () => {
        // A duplicate prune also emits session_delete. Always resync from live
        // sessions — never wipe the remaining connection.
        WC_PENDING_REQUEST = null;
        hideWcApproveBar();
        // Tiny delay so WalletKit finishes removing the closed topic.
        await new Promise((r) => setTimeout(r, 50));
        const live = collectLiveWcSessions();
        await persistWcSessions(live);
        if (live.length) {
          setWcStatus(
            "Connected to " +
              (live[0].name || "dApp") +
              (live.length > 1 ? " (+" + (live.length - 1) + ")" : "")
          );
          paintWcConnectionsList(live);
          return;
        }
        setWcStatus("Disconnected");
        showToast("WalletConnect disconnected");
        paintWcConnectionsList([]);
      },
      onStatus: (msg) => {
        if (msg) setWcStatus(msg);
      },
    });
    WC_WIRED = true;
  }
  await GladiatorWC.init(projectId, {
    name: "Gladiator Wallet",
    description: "Local multi-chain wallet",
    url: IS_EXTENSION ? "https://gladiator.wallet" : location.origin,
    icons: [],
  });
  return GladiatorWC;
}

async function wcConnectFromUri() {
  const uri = (($("wcUri") && $("wcUri").value) || "").trim();
  if (!uri) {
    setWcStatus("Paste a wc: URI from pump.fun");
    showToast("Paste WalletConnect URI");
    return;
  }
  if (!uri.startsWith("wc:")) {
    setWcStatus("URI must start with wc:");
    showToast("Invalid WalletConnect URI");
    return;
  }
  // Surface expiry if present (do not log symKey).
  try {
    const q = uri.split("?")[1] || "";
    const exp = new URLSearchParams(q).get("expiryTimestamp");
    if (exp && Number(exp) * 1000 < Date.now()) {
      setWcStatus("This URI expired — get a fresh QR/link from pump.fun");
      showToast("WalletConnect URI expired");
      return;
    }
  } catch (_) {}

  const projectId = (
    ($("wcProjectId") && $("wcProjectId").value) ||
    (STATE && STATE.wcProjectId) ||
    (window.GLADIATOR_CONFIG && window.GLADIATOR_CONFIG.wcProjectId) ||
    ""
  ).trim();
  if (!projectId) {
    setWcStatus("Paste a WalletConnect Project ID first");
    showToast("Project ID required");
    return;
  }
  if (STATE) {
    STATE.wcProjectId = projectId;
    await storageSet(STATE);
  }

  setWcStatus("Connecting…");
  showToast("Connecting…");
  try {
    await ensureWalletConnect();
    await GladiatorWC.pair(uri);
    if ($("wcUri")) $("wcUri").value = "";
    setWcStatus("Paired — approving session / signature…");
    // Catch late proposal / ownership sign while URI is still fresh
    try {
      if (typeof GladiatorWC.processPendings === "function") {
        await GladiatorWC.processPendings();
      }
    } catch (_) {}
    await refreshWcConnections({ ensure: false, poll: 10 });
    paintWcSettings();
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    setWcStatus("Connect failed: " + msg);
    showToast(msg);
  }
}

async function wcDisconnect() {
  try {
    if (window.GladiatorWC && GladiatorWC.isReady()) {
      await GladiatorWC.disconnectAll();
    } else if (STATE && STATE.wcProjectId && window.GladiatorWC) {
      await ensureWalletConnect();
      await GladiatorWC.disconnectAll();
    }
    await persistWcSessions([]);
    setWcStatus("Disconnected");
    showToast("Disconnected");
    paintWcSettings();
  } catch (err) {
    showToast(String(err && err.message ? err.message : err));
  }
}

async function wcApprovePending() {
  try {
    await ensureWalletConnect();
    // 1) Session connect
    if (WC_PENDING_PROPOSAL) {
      const proposal = WC_PENDING_PROPOSAL;
      await GladiatorWC.approveProposal(proposal);
      closeWcProposalModal();
      if ($("wcUri")) $("wcUri").value = "";
      setWcStatus("Connected — waiting for signature request…");
      showToast("Connected — approve the next signature if asked");
      paintWcSettings();
      return;
    }
    // 2) Sign / tx request (pump.fun ownership proof)
    if (WC_PENDING_REQUEST) {
      const event = WC_PENDING_REQUEST;
      WC_PENDING_REQUEST = null;
      hideWcApproveBar();
      setWcStatus("Signing…");
      await GladiatorWC.handleRequest(event);
      setWcStatus("Signature sent — check pump.fun");
      showToast("Signed — check pump.fun");
      paintWcSettings();
      return;
    }
    hideWcApproveBar();
    setWcStatus("Nothing to approve right now");
    showToast("Nothing to approve — paste a fresh wc: link");
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    setWcStatus("Approve failed: " + msg);
    showToast(msg);
  }
}

async function wcRejectPending() {
  try {
    if (WC_PENDING_PROPOSAL && window.GladiatorWC) {
      await GladiatorWC.rejectProposal(WC_PENDING_PROPOSAL, "User rejected");
    }
    if (WC_PENDING_REQUEST && window.GladiatorWC && GladiatorWC.rejectRequest) {
      await GladiatorWC.rejectRequest(WC_PENDING_REQUEST, "User rejected");
    }
  } catch (_) {}
  WC_PENDING_REQUEST = null;
  closeWcProposalModal();
  hideWcApproveBar();
  setWcStatus("Rejected");
}

function friendlySendError(err) {
  const msg = String(err && err.message ? err.message : err || "Send failed");
  const low = msg.toLowerCase();
  if (
    low.includes("insufficient") ||
    low.includes("no record of a prior credit") ||
    low.includes("attempt to debit")
  ) {
    return "Insufficient SOL — this wallet needs SOL for the amount and network fee. Open Receive and deposit SOL first.";
  }
  if (low.includes("blockhash not found") || low.includes("block height exceeded")) {
    return "Network timed out — tap Send again.";
  }
  if (low.includes("invalid public key") || low.includes("wrong size") || low.includes("invalid solana recipient")) {
    return "Invalid recipient address.";
  }
  if (low.includes("failed to fetch") || low.includes("http 403") || low.includes("http 429") || low.includes("http 502")) {
    return "RPC blocked the send — set HELIUS_API_KEY in .env and restart with start.ps1.";
  }
  if (low.includes("solana tx library") || low.includes("solanaweb3")) {
    return "Send library missing — update/restart the wallet folder (start.ps1).";
  }
  if (low.includes("amount exceeds")) return "Amount exceeds this token’s balance.";
  return msg;
}

async function waitForSolSignature(sig, rpcs, tries) {
  const n = tries || 24;
  for (let i = 0; i < n; i++) {
    try {
      const st = await solRpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }], rpcs);
      const row = st && st.value && st.value[0];
      if (row) {
        if (row.err) throw new Error("Transaction failed on-chain");
        if (
          row.confirmationStatus === "confirmed" ||
          row.confirmationStatus === "finalized" ||
          (row.confirmations != null && row.confirmations > 0)
        ) {
          return row;
        }
      }
    } catch (err) {
      if (String(err.message || err).includes("failed on-chain")) throw err;
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  return null;
}

function ensureBrowserBuffer() {
  const g = typeof globalThis !== "undefined" ? globalThis : window;
  if (typeof g.Buffer === "undefined" || typeof g.Buffer.alloc !== "function") {
    const fromLib = window.solanaWeb3 && window.solanaWeb3.Buffer;
    if (fromLib) {
      g.Buffer = fromLib;
      if (typeof window !== "undefined") window.Buffer = fromLib;
    }
  }
  if (typeof Buffer === "undefined" || typeof Buffer.alloc !== "function") {
    throw new Error(
      "Buffer polyfill missing — update wallet (update.ps1) and hard-refresh. Need lib/buffer.min.js"
    );
  }
}

async function broadcastSolTx(tx, signer, rpcs) {
  ensureBrowserBuffer();
  const latest = await solRpc("getLatestBlockhash", [{ commitment: "confirmed" }], rpcs);
  const blockhash = latest && latest.value && latest.value.blockhash;
  if (!blockhash) throw new Error("Could not fetch blockhash");
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(signer);
  const raw = tx.serialize();
  const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const b64 = bytesToBase64(u8);
  let sig;
  try {
    sig = await solRpc(
      "sendTransaction",
      [
        b64,
        {
          encoding: "base64",
          preflightCommitment: "confirmed",
          skipPreflight: false,
          maxRetries: 3,
        },
      ],
      rpcs
    );
  } catch (err) {
    // One retry with skipPreflight when node preflight is flaky (not for funds errors)
    const msg = String(err && err.message ? err.message : err);
    if (/insufficient|debit|no record of a prior credit/i.test(msg)) throw err;
    sig = await solRpc(
      "sendTransaction",
      [
        b64,
        {
          encoding: "base64",
          preflightCommitment: "confirmed",
          skipPreflight: true,
          maxRetries: 5,
        },
      ],
      rpcs
    );
  }
  if (!sig || typeof sig !== "string") throw new Error("No signature returned");
  await waitForSolSignature(sig, rpcs);
  return sig;
}

async function sendSolNative(acc, toAddr, amountSol) {
  const { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = solanaWeb3;
  const from = solanaKeypairFromAccount(acc);
  const fromAddr = from.publicKey.toBase58();
  // Keep stored pubkey aligned with the signing key
  if (acc.solana && acc.solana.publicKey !== fromAddr) {
    acc.solana.publicKey = fromAddr;
    await storageSet(STATE);
    paintSwitchers();
  }
  let to;
  try {
    to = new PublicKey(toAddr);
  } catch {
    throw new Error("Invalid Solana recipient address");
  }
  let lamports = Number(uiAmountToRaw(amountSol, 9));
  lamports = Math.floor(lamports);
  if (!(lamports > 0) || !Number.isFinite(lamports)) throw new Error("Amount too small");
  if (lamports >= Number(LAMPORTS_PER_SOL) * 1000000) throw new Error("Amount too large");
  const solChain = CHAINS.find((c) => c.id === "solana") || activeChain(STATE);
  const rpcs = solRpcList(solChain);
  const bal = await fetchSolBalance(fromAddr, rpcs);
  const balLamports = Math.floor(bal * 1e9 + 1e-9);
  // Leave enough for fee so Max / full-balance sends don't fail
  const feeLamports = 5000;
  if (balLamports <= feeLamports) {
    throw new Error(
      "Insufficient SOL on active wallet " +
        shortAddr(fromAddr) +
        " (RPC balance " +
        bal.toFixed(6) +
        " SOL). Deposit to Receive address: " +
        fromAddr
    );
  }
  if (lamports > balLamports - feeLamports) {
    lamports = balLamports - feeLamports;
  }
  if (!(lamports > 0)) {
    throw new Error(
      "Insufficient SOL for amount + fee on " +
        shortAddr(fromAddr) +
        " — have " +
        bal.toFixed(6) +
        " SOL"
    );
  }
  ensureBrowserBuffer();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: lamports, // integer lamports (u64)
    })
  );
  return broadcastSolTx(tx, from, rpcs);
}

async function sendSplToken(acc, holding, toAddr, amountUi) {
  const { PublicKey, Transaction } = solanaWeb3;
  const {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  } = splToken;
  if (!holding || !holding.mint) throw new Error("Select a token");
  const from = solanaKeypairFromAccount(acc);
  let destOwner;
  try {
    destOwner = new PublicKey(toAddr);
  } catch {
    throw new Error("Invalid Solana recipient address");
  }
  const mintPk = new PublicKey(holding.mint);
  const progStr = holding.tokenProgram || TOKEN_PROGRAM;
  const programId =
    progStr === TOKEN_2022_PROGRAM || progStr === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
  const decimals = Number(holding.decimals || 0);
  const rawAmount = uiAmountToRaw(amountUi, decimals);
  if (rawAmount <= 0n) throw new Error("Amount too small");
  if (Number(amountUi) > Number(holding.amount) + 1e-12) {
    throw new Error("Amount exceeds token balance");
  }
  const srcAta = getAssociatedTokenAddressSync(
    mintPk,
    from.publicKey,
    false,
    programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const destAta = getAssociatedTokenAddressSync(
    mintPk,
    destOwner,
    false,
    programId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      from.publicKey,
      destAta,
      destOwner,
      mintPk,
      programId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  tx.add(
    createTransferCheckedInstruction(
      srcAta,
      mintPk,
      destAta,
      from.publicKey,
      rawAmount,
      decimals,
      [],
      programId
    )
  );
  const solChain = CHAINS.find((c) => c.id === "solana") || activeChain(STATE);
  const rpcs = solRpcList(solChain);
  // SPL transfers still burn SOL for fees (+ possible ATA rent)
  const solBal = await fetchSolBalance(from.publicKey.toBase58(), rpcs);
  if (solBal < 0.003) {
    throw new Error(
      "Insufficient SOL for token send fees — need ~0.003 SOL on this wallet. Receive address: " +
        from.publicKey.toBase58()
    );
  }
  return broadcastSolTx(tx, from, rpcs);
}

async function sendEvmNative(acc, chain, toAddr, amount) {
  if (!window.ethers) throw new Error("ethers missing");
  if (!acc.evm || !acc.evm.privateKey) throw new Error("No EVM key");
  if (!ethers.isAddress(toAddr)) throw new Error("Invalid EVM recipient address");
  const provider = new ethers.JsonRpcProvider(chain.rpc);
  const wallet = new ethers.Wallet(acc.evm.privateKey, provider);
  const value = ethers.parseUnits(String(amount), chain.decimals || 18);
  const tx = await wallet.sendTransaction({ to: toAddr, value });
  showToast("Submitted · waiting…");
  await tx.wait(1);
  return tx.hash;
}

async function executeSend() {
  const status = $("sendStatus");
  const btn = $("sendSubmitBtn");
  const chain = activeChain(STATE);
  const acc = activeAccount(STATE);
  let to = ($("sendTo")?.value || "").trim();
  // If user typed a saved contact name, resolve it.
  if (to && Array.isArray(STATE.addressBook)) {
    const byName = STATE.addressBook.find(
      (c) => c.name.toLowerCase() === to.toLowerCase()
    );
    if (byName) to = byName.address;
  }
  const amountRaw = ($("sendAmount")?.value || "").trim().replace(/,/g, "");
  const amount = Number(amountRaw);
  const assetVal = ($("sendAsset") && $("sendAsset").value) || "native";
  const holding = selectedSendHolding();
  const px = sendAssetUnitPriceUsd();
  const usdBit =
    amount > 0 && px > 0 ? " ≈ $" + (amount * px).toFixed(2) + " USD" : "";

  if (!to) {
    if (status) status.textContent = "Enter a recipient address.";
    return;
  }
  if (!(amount > 0) || !amountRaw) {
    if (status) status.textContent = "Enter an amount greater than zero.";
    return;
  }

  if (btn) btn.disabled = true;
  if (status) status.textContent = "Signing & broadcasting…";
  showToast("Sending…");

  try {
    let sig = "";
    let explorer = "";
    let symbol = chain.symbol;

    if (chain.kind === "solana") {
      if (!window.solanaWeb3 || !window.splToken) {
        throw new Error("Solana send library failed to load");
      }
      if (assetVal === "native") {
        sig = await sendSolNative(acc, to, amountRaw);
        symbol = "SOL";
      } else {
        if (!holding || holding.kind !== "spl") throw new Error("Token not in holdings");
        sig = await sendSplToken(acc, holding, to, amountRaw);
        symbol = holding.symbol || "TOKEN";
      }
      explorer = "https://solscan.io/tx/" + sig;
    } else if (chain.kind === "bitcoin" || chain.kind === "sui") {
      throw new Error(
        chain.name +
          " send is not enabled yet — receive & balances work. Switch to Solana or an EVM chain to send."
      );
    } else {
      if (assetVal !== "native") {
        throw new Error("Token sends on Solana only — switch to Solana for SPL");
      }
      sig = await sendEvmNative(acc, chain, to, amountRaw);
      const explorers = {
        ethereum: "https://etherscan.io/tx/",
        base: "https://basescan.org/tx/",
        polygon: "https://polygonscan.com/tx/",
        robinhood: "https://robinhoodchain.blockscout.com/tx/",
      };
      explorer = (explorers[chain.id] || "https://etherscan.io/tx/") + sig;
    }

    if (status) {
      status.innerHTML =
        "Sent " +
        amountRaw +
        " " +
        symbol +
        usdBit +
        ' · <a href="' +
        explorer +
        '" target="_blank" rel="noopener">View tx</a>';
    }
    showToast("Sent " + amountRaw + " " + symbol);
    rememberLocalTx({
      sig: sig,
      type: "send",
      direction: "out",
      symbol: symbol,
      amount: Number(amountRaw) || 0,
      when: Date.now(),
      accountId: acc && acc.id,
      counterparty: to,
    });
    if ($("sendAmount")) $("sendAmount").value = "";
    updateSendUsdEstimate();
    await refreshBalance();
  } catch (err) {
    console.error("[send]", err);
    const msg = friendlySendError(err);
    if (status) status.textContent = "Send failed: " + msg;
    showToast(msg.length > 60 ? "Send failed" : msg);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function paintSendAvailable() {
  const el = $("sendAvailable");
  if (!el) return;
  const chain = activeChain(STATE);
  const holding = selectedSendHolding();
  if (!holding) {
    el.textContent = "Available: —";
    return;
  }
  const amt = Number(holding.amount) || 0;
  const label =
    amt >= 1 ? amt.toLocaleString(undefined, { maximumFractionDigits: 6 }) : amt.toFixed(6);
  el.textContent =
    "Available: " +
    label +
    " " +
    (holding.symbol || chain.symbol) +
    (holding.kind === "native" && !(amt > 0)
      ? " · deposit SOL via Receive before sending"
      : "");
}

function loadLocalTxs() {
  try {
    const raw = localStorage.getItem(LOCAL_TX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLocalTxs(list) {
  try {
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify((list || []).slice(0, 80)));
  } catch (_) {}
}

function rememberLocalTx(entry) {
  if (!entry || !entry.sig) return;
  const list = loadLocalTxs().filter((t) => t.sig !== entry.sig);
  list.unshift(entry);
  saveLocalTxs(list);
}

function historyIcon(type) {
  switch (type) {
    case "receive":
      return "↘";
    case "send":
      return "↗";
    case "buy":
      return "↓";
    case "sell":
      return "↑";
    case "swap":
      return "⇄";
    default:
      return "•";
  }
}

function formatHistoryAmount(amount, symbol) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const body =
    abs >= 1
      ? abs.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : abs.toFixed(6);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + body + (symbol ? " " + symbol : "");
}

function formatHistoryTime(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts * (ts < 1e12 ? 1000 : 1));
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function classifySolanaTx(owner, tx) {
  if (!tx || !tx.meta || tx.meta.err) return null;
  const message = tx.transaction && tx.transaction.message;
  const accountKeys = (message && message.accountKeys) || [];
  const keys = accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey || k.toString?.() || ""
  );
  const ownerIndex = keys.indexOf(owner);
  const pre = tx.meta.preBalances || [];
  const post = tx.meta.postBalances || [];
  let solDelta = 0;
  if (ownerIndex >= 0) {
    solDelta = ((post[ownerIndex] || 0) - (pre[ownerIndex] || 0)) / 1e9;
  }

  // SPL token balance deltas for this owner
  const preTok = tx.meta.preTokenBalances || [];
  const postTok = tx.meta.postTokenBalances || [];
  const tokenMap = {};
  preTok.forEach((t) => {
    if (t.owner !== owner) return;
    const mint = t.mint;
    const amt = Number(t.uiTokenAmount && t.uiTokenAmount.uiAmountString != null
      ? t.uiTokenAmount.uiAmountString
      : t.uiTokenAmount && t.uiTokenAmount.uiAmount) || 0;
    tokenMap[mint] = (tokenMap[mint] || 0) - amt;
  });
  postTok.forEach((t) => {
    if (t.owner !== owner) return;
    const mint = t.mint;
    const amt = Number(t.uiTokenAmount && t.uiTokenAmount.uiAmountString != null
      ? t.uiTokenAmount.uiAmountString
      : t.uiTokenAmount && t.uiTokenAmount.uiAmount) || 0;
    tokenMap[mint] = (tokenMap[mint] || 0) + amt;
  });
  const tokenDeltas = Object.keys(tokenMap)
    .map((mint) => ({ mint, delta: tokenMap[mint] }))
    .filter((t) => Math.abs(t.delta) > 1e-12);

  const programIds = new Set();
  const ixs = (message && (message.instructions || message.compiledInstructions)) || [];
  ixs.forEach((ix) => {
    if (ix.programId) programIds.add(ix.programId);
    else if (ix.programIdIndex != null && keys[ix.programIdIndex]) {
      programIds.add(keys[ix.programIdIndex]);
    }
  });
  const inner = tx.meta.innerInstructions || [];
  inner.forEach((group) => {
    (group.instructions || []).forEach((ix) => {
      if (ix.programId) programIds.add(ix.programId);
    });
  });
  const isSwap = [...programIds].some((p) => SWAP_PROGRAMS.has(p));

  let type = "transfer";
  let direction = "out";
  let amount = 0;
  let symbol = "SOL";
  let mint = null;

  if (isSwap) {
    if (solDelta < -1e-9 && tokenDeltas.some((t) => t.delta > 0)) {
      type = "buy";
      direction = "in";
      const gained = tokenDeltas.filter((t) => t.delta > 0).sort((a, b) => b.delta - a.delta)[0];
      amount = gained ? gained.delta : Math.abs(solDelta);
      mint = gained ? gained.mint : null;
      symbol = (mint && MINT_META[mint] && MINT_META[mint].symbol) || (mint ? shortAddr(mint) : "TOKEN");
    } else if (solDelta > 1e-9 && tokenDeltas.some((t) => t.delta < 0)) {
      type = "sell";
      direction = "out";
      const sold = tokenDeltas.filter((t) => t.delta < 0).sort((a, b) => a.delta - b.delta)[0];
      amount = sold ? Math.abs(sold.delta) : Math.abs(solDelta);
      mint = sold ? sold.mint : null;
      symbol = (mint && MINT_META[mint] && MINT_META[mint].symbol) || (mint ? shortAddr(mint) : "TOKEN");
    } else {
      type = "swap";
      direction = solDelta >= 0 ? "in" : "out";
      amount = Math.abs(solDelta);
      symbol = "SOL";
    }
  } else if (tokenDeltas.length) {
    const primary = tokenDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    direction = primary.delta >= 0 ? "in" : "out";
    type = direction === "in" ? "receive" : "send";
    amount = Math.abs(primary.delta);
    mint = primary.mint;
    symbol =
      mint === USDC_MINT
        ? "USDC"
        : (MINT_META[mint] && MINT_META[mint].symbol) || shortAddr(mint);
  } else if (Math.abs(solDelta) > 1e-9) {
    // fee-only changes are tiny; treat meaningful SOL moves
    direction = solDelta >= 0 ? "in" : "out";
    type = direction === "in" ? "receive" : "send";
    amount = Math.abs(solDelta);
    symbol = "SOL";
  } else {
    return null;
  }

  return {
    type,
    direction,
    amount,
    symbol,
    mint,
    solDelta,
  };
}

async function fetchHistoryForOwner(owner, rpcs) {
  const sigs = await solRpc(
    "getSignaturesForAddress",
    [owner, { limit: 25 }],
    rpcs
  );
  const list = Array.isArray(sigs) ? sigs : [];
  const out = [];
  // Resolve a handful of txs in parallel batches
  const batchSize = 5;
  for (let i = 0; i < list.length; i += batchSize) {
    const chunk = list.slice(i, i + batchSize);
    const rows = await Promise.all(
      chunk.map(async (row) => {
        const sig = row.signature || row;
        try {
          const tx = await solRpc(
            "getTransaction",
            [
              sig,
              {
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
              },
            ],
            rpcs
          );
          const classified = classifySolanaTx(owner, tx);
          if (!classified) {
            if (row.err) return null;
            return {
              sig,
              type: "transfer",
              direction: "out",
              amount: 0,
              symbol: "",
              when: row.blockTime || 0,
              status: row.err ? "failed" : "unknown",
            };
          }
          return {
            sig,
            ...classified,
            when: row.blockTime || (tx && tx.blockTime) || 0,
            status: "confirmed",
          };
        } catch (err) {
          console.warn("[history tx]", sig, err);
          return {
            sig,
            type: "transfer",
            direction: "out",
            amount: 0,
            symbol: "",
            when: row.blockTime || 0,
            status: "pending",
          };
        }
      })
    );
    rows.forEach((r) => {
      if (r) out.push(r);
    });
  }
  return out;
}

function paintHistory() {
  const list = $("historyList");
  const status = $("historyStatus");
  if (!list) return;
  list.innerHTML = "";
  if (!TX_HISTORY.length) {
    list.innerHTML = '<li class="history-empty">No transactions yet for this wallet.</li>';
    if (status) status.textContent = "No activity yet — sends & receives will show here.";
    return;
  }
  TX_HISTORY.forEach((tx) => {
    const li = document.createElement("li");
    const dirClass = tx.direction === "in" ? "is-in" : "is-out";
    const title = tx.type || "transfer";
    const amt =
      tx.amount > 0
        ? formatHistoryAmount(tx.direction === "in" ? tx.amount : -tx.amount, tx.symbol)
        : "—";
    const when = formatHistoryTime(tx.when);
    const href = tx.sig ? "https://solscan.io/tx/" + tx.sig : "#";
    li.innerHTML =
      '<a class="history-row ' +
      dirClass +
      '" href="' +
      href +
      '" target="_blank" rel="noopener">' +
      '<span class="history-ico" aria-hidden="true">' +
      historyIcon(tx.type) +
      "</span>" +
      '<span class="history-meta"><strong>' +
      title +
      "</strong><span>" +
      (when || shortAddr(tx.sig || "")) +
      (tx.sig ? " · " + shortAddr(tx.sig) : "") +
      "</span></span>" +
      '<span class="history-vals"><strong>' +
      amt +
      "</strong><span>" +
      (tx.status || "confirmed") +
      "</span></span></a>";
    list.appendChild(li);
  });
  if (status) {
    status.textContent = TX_HISTORY.length + " recent transaction" + (TX_HISTORY.length === 1 ? "" : "s");
  }
}

async function refreshHistory() {
  const status = $("historyStatus");
  const acc = activeAccount(STATE);
  const owner = acc && acc.solana && acc.solana.publicKey;
  if (!owner) {
    TX_HISTORY = [];
    paintHistory();
    if (status) status.textContent = "No active wallet.";
    return;
  }
  if (!isValidSolanaAddress(owner)) {
    if (status) status.textContent = "Invalid wallet address — cannot load history.";
    return;
  }
  const seq = ++historySeq;
  if (status) status.textContent = "Loading history…";
  const local = loadLocalTxs()
    .filter((t) => !t.accountId || t.accountId === acc.id)
    .map((t) => ({
      sig: t.sig,
      type: t.type || "send",
      direction: t.direction || "out",
      amount: Number(t.amount) || 0,
      symbol: t.symbol || "SOL",
      when: t.when ? Math.floor(Number(t.when) / (Number(t.when) > 1e12 ? 1000 : 1)) : 0,
      status: "local",
    }));

  try {
    const solChain = CHAINS.find((c) => c.id === "solana") || activeChain(STATE);
    const rpcs = solRpcList(solChain);
    const remote = await fetchHistoryForOwner(owner, rpcs);
    if (seq !== historySeq) return;
    const bySig = {};
    remote.forEach((t) => {
      bySig[t.sig] = t;
    });
    local.forEach((t) => {
      if (!bySig[t.sig]) bySig[t.sig] = t;
    });
    // Prefetch mint meta for nicer symbols
    const mints = Object.values(bySig)
      .map((t) => t.mint)
      .filter((m) => m && m !== USDC_MINT);
    if (mints.length) await resolveMintMeta(mints);
    Object.values(bySig).forEach((t) => {
      if (t.mint && MINT_META[t.mint] && MINT_META[t.mint].symbol) {
        t.symbol = MINT_META[t.mint].symbol;
      }
    });
    TX_HISTORY = Object.values(bySig).sort((a, b) => (b.when || 0) - (a.when || 0));
    paintHistory();
  } catch (err) {
    console.warn("[history]", err);
    if (seq !== historySeq) return;
    TX_HISTORY = local.sort((a, b) => (b.when || 0) - (a.when || 0));
    paintHistory();
    if (status) {
      status.textContent =
        "History sync failed: " +
        (err && err.message ? err.message : "RPC error") +
        (local.length ? " · showing local sends" : "");
    }
  }
}

function paintBrandAccount() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const addr = addressFor(acc, chain);
  const label = $("brandAcctLabel");
  if (label) {
    const name = (acc && acc.name) || "Wallet";
    label.textContent = name + " · " + shortAddr(addr);
    label.title = addr || "";
  }
  const sub = $("acctDrawerSub");
  if (sub) {
    sub.textContent =
      (STATE.accounts && STATE.accounts.length
        ? STATE.accounts.length + " wallet" + (STATE.accounts.length === 1 ? "" : "s")
        : "No wallets") +
      " · active " +
      ((acc && acc.name) || "—");
  }
}

function renderAcctDrawerList() {
  const list = $("acctDrawerList");
  if (!list || !STATE) return;
  list.innerHTML = "";
  STATE.accounts.forEach((a, idx) => {
    const active = a.id === STATE.activeAccountId;
    const addr = (a.solana && a.solana.publicKey) || "";
    const bal = walletSolBalanceLabel(a.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "acct-drawer-item" + (active ? " is-active" : "");
    btn.dataset.accountId = a.id;
    btn.innerHTML =
      '<img class="acct-drawer-avatar" src="./icons/gladiator.png?v=2" alt="" width="36" height="36" />' +
      '<span class="acct-drawer-meta"><strong>' +
      (a.name || "W" + (idx + 1)) +
      (active ? " · Active" : "") +
      "</strong><span>" +
      shortAddr(addr) +
      "</span></span>" +
      '<span class="acct-drawer-bal" data-drawer-bal="' +
      a.id +
      '">' +
      bal +
      " SOL</span>";
    btn.addEventListener("click", async () => {
      if (a.id !== STATE.activeAccountId) {
        STATE.activeAccountId = a.id;
        await storageSet(STATE);
        await refreshAll();
        showToast("Active · " + (a.name || "Wallet"));
      }
      closeAcctDrawer();
      go("home");
    });
    list.appendChild(btn);
  });
}

function openAcctDrawer() {
  const root = $("acctDrawerRoot");
  const btn = $("brandAccountsBtn");
  if (!root) return;
  paintBrandAccount();
  renderAcctDrawerList();
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add("is-open"));
  if (btn) btn.setAttribute("aria-expanded", "true");
  refreshAccountBalances();
  document.body.classList.add("acct-drawer-open");
}

function closeAcctDrawer() {
  const root = $("acctDrawerRoot");
  const btn = $("brandAccountsBtn");
  if (!root) return;
  root.classList.remove("is-open");
  if (btn) btn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("acct-drawer-open");
  setTimeout(() => {
    if (!root.classList.contains("is-open")) root.hidden = true;
  }, 220);
}

function paintSwitchers() {
  const accSel = $("accountSelect");
  const chainSel = $("chainSelect");
  if (accSel) {
    accSel.innerHTML = STATE.accounts
      .map(
        (a) =>
          '<option value="' +
          a.id +
          '"' +
          (a.id === STATE.activeAccountId ? " selected" : "") +
          ">" +
          escapeHtml(a.name) +
          "</option>"
      )
      .join("");
  }
  if (chainSel) {
    chainSel.innerHTML = CHAINS.map(
      (c) =>
        '<option value="' +
        c.id +
        '"' +
        (c.id === STATE.activeChainId ? " selected" : "") +
        ">" +
        c.name +
        "</option>"
    ).join("");
  }
  paintChainPicker();
  paintActiveChainAddress();
  paintBrandAccount();
  if ($("acctDrawerRoot") && !$("acctDrawerRoot").hidden) {
    renderAcctDrawerList();
  }
  paintSendContacts();
}

function closeChainPicker() {
  const menu = $("chainPickerMenu");
  const btn = $("chainPickerBtn");
  const bar = document.querySelector(".chain-bar, .switcher-bar, .topbar");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
  if (bar) bar.classList.remove("is-chain-open");
  document.querySelector(".topbar")?.classList.remove("is-chain-open");
}

function toggleChainPicker() {
  const menu = $("chainPickerMenu");
  const btn = $("chainPickerBtn");
  const bar = document.querySelector(".chain-bar, .switcher-bar");
  const top = document.querySelector(".topbar");
  if (!menu || !btn) return;
  const open = menu.hidden;
  if (open) paintChainPicker();
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (bar) bar.classList.toggle("is-chain-open", open);
  if (top) top.classList.toggle("is-chain-open", open);
}

function paintChainPicker() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const logo = $("chainPickerLogo");
  const nameEl = $("chainPickerName");
  const menu = $("chainPickerMenu");
  if (!chain) return;
  if (logo) {
    logo.src = chainLogoSrc(chain);
    logo.alt = chain.symbol || chain.name || "";
  }
  if (nameEl) nameEl.textContent = chain.name || "Chain";
  if (!menu) return;
  menu.innerHTML = CHAINS.map((c) => {
    const a = chainKeyAddress(acc, c) || "";
    const active = c.id === STATE.activeChainId;
    return (
      '<div class="chain-picker-item' +
      (active ? " is-active" : "") +
      '" role="option" data-chain-id="' +
      c.id +
      '" aria-selected="' +
      (active ? "true" : "false") +
      '">' +
      '<img src="' +
      chainLogoSrc(c) +
      '" alt="" width="20" height="20" />' +
      '<button type="button" class="chain-picker-item-main" data-chain-id="' +
      c.id +
      '"><strong>' +
      escapeHtml(c.name) +
      "</strong></button>" +
      (a
        ? '<button type="button" class="chain-picker-item-addr" data-copy-addr="' +
          escapeHtml(a) +
          '" title="Copy ' +
          escapeHtml(c.name) +
          ' address">' +
          escapeHtml(shortAddr(a)) +
          "</button>"
        : '<span class="chain-picker-item-addr is-empty">—</span>') +
      "</div>"
    );
  }).join("");
  // Selection / copy handled by delegated listeners in wire().
}

async function copyChainAddress(addr, label) {
  const text = (addr || "").trim();
  if (!text) return showToast("No address");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      await copyText(text);
      return;
    }
    showToast((label ? label + " " : "") + "address copied");
  } catch {
    showToast("Copy failed");
  }
}

async function selectChain(chainId) {
  if (!chainId || !CHAINS.some((c) => c.id === chainId)) return;
  closeChainPicker();
  if (STATE.activeChainId === chainId) {
    paintActiveChainAddress();
    paintChainPicker();
    return;
  }
  STATE.activeChainId = chainId;
  const sel = $("chainSelect");
  if (sel) sel.value = chainId;
  // Swap top-bar address immediately for the selected chain (before RPC).
  paintActiveChainAddress();
  paintChainPicker();
  paintBrandAccount();
  renderReceive();
  // Derive BTC/Sui keys for older wallets, then re-paint if keys appeared.
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  if (acc && (await ensureAccountExtraKeys(acc))) {
    await storageSet(STATE);
    paintActiveChainAddress();
    paintChainPicker();
    renderReceive();
  } else {
    await storageSet(STATE);
  }
  if (chain && (chain.kind === "bitcoin" || chain.kind === "sui")) {
    const addr = chainKeyAddress(acc, chain);
    if (addr) {
      showToast(chain.name + " · " + shortAddr(addr));
    } else if (acc && !acc.mnemonic) {
      showToast("Import seed phrase for " + chain.name);
    } else if (!window.MultiHD) {
      showToast("Chain lib missing — reload extension pack");
    } else {
      showToast("No " + chain.name + " address — try Generate/Import seed");
    }
  } else {
    showToast(chain.name);
  }
  await refreshAll();
}


function renderReceive() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const depositAddr = chainKeyAddress(acc, chain) || "";
  const full = $("fullAddr");
  if (full) {
    if (depositAddr) {
      full.textContent = depositAddr;
    } else if (
      (chain.kind === "bitcoin" || chain.kind === "sui") &&
      acc &&
      !acc.mnemonic
    ) {
      full.textContent =
        "No " +
        chain.name +
        " address — this wallet was imported by private key only. Re-import with your 12/24-word seed phrase.";
    } else if (chain.kind === "bitcoin" || chain.kind === "sui") {
      full.textContent =
        "No " +
        chain.name +
        " address yet. Use Accounts → Import Wallet with your seed phrase, then select " +
        chain.name +
        " again.";
    } else {
      full.textContent = "No " + chain.name + " address on this wallet";
    }
  }
  const cname = $("receiveChainName");
  if (cname) cname.textContent = chain.name;
  const aname = $("receiveAssetName");
  if (aname) {
    aname.textContent =
      chain.kind === "solana"
        ? "SOL / SPL tokens"
        : chain.symbol + " on " + chain.name;
  }
  const hint = $("receiveHint");
  if (hint) {
    if (chain.kind === "solana") {
      hint.textContent =
        "Send only SOL / SPL tokens to this Solana address.";
    } else if (chain.kind === "bitcoin") {
      hint.textContent =
        "Send only Bitcoin (BTC) to this native segwit address.";
    } else if (chain.kind === "sui") {
      hint.textContent = "Send only SUI to this Sui address.";
    } else {
      hint.textContent =
        "Send only " +
        chain.symbol +
        " on " +
        chain.name +
        " to this address. The top bar shows this chain’s address when selected.";
    }
  }
  const both = $("bothAddrs");
  if (both && acc) {
    const rows = CHAINS.map((c) => {
      const a = chainKeyAddress(acc, c);
      if (!a) return "";
      const active = c.id === chain.id ? " · selected" : "";
      return (
        "<div><strong>" +
        escapeHtml(c.name) +
        active +
        "</strong><br /><code>" +
        escapeHtml(a) +
        "</code></div>"
      );
    }).join("");
    both.innerHTML =
      "<div><strong>Active deposit (" +
      escapeHtml(chain.name) +
      ")</strong><br /><code>" +
      escapeHtml(depositAddr || "—") +
      "</code></div>" +
      rows;
  }
  renderQR(depositAddr);
}

function formatSolAmount(n) {
  const v = Number(n) || 0;
  if (v === 0) return "0";
  if (v >= 100) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function walletSolBalanceLabel(accountId) {
  const cached = ACCOUNT_SOL[accountId];
  if (cached && cached.sol != null && !cached.error) {
    return formatSolAmount(cached.sol);
  }
  if (
    accountId === STATE.activeAccountId &&
    BALANCE &&
    BALANCE.ok &&
    activeChain(STATE).kind === "solana"
  ) {
    return formatSolAmount(BALANCE.native);
  }
  if (cached && cached.loading) return "…";
  if (cached && cached.error) return "—";
  return "…";
}

function paintAccountBalanceCells() {
  document.querySelectorAll(".photon-row[data-account-id]").forEach((row) => {
    const id = row.dataset.accountId;
    const cell = row.querySelector(".photon-bal");
    if (cell) cell.textContent = walletSolBalanceLabel(id);
  });
  document.querySelectorAll("[data-drawer-bal]").forEach((el) => {
    const id = el.getAttribute("data-drawer-bal");
    el.textContent = walletSolBalanceLabel(id) + " SOL";
  });
}

async function refreshAccountBalances() {
  if (!STATE || !STATE.accounts || !STATE.accounts.length) return;
  const seq = ++accountBalSeq;
  const solChain = CHAINS.find((c) => c.id === "solana") || CHAINS[0];
  const rpcs = solRpcList(solChain);

  STATE.accounts.forEach((a) => {
    const prev = ACCOUNT_SOL[a.id];
    ACCOUNT_SOL[a.id] = {
      sol: prev && prev.sol != null ? prev.sol : null,
      loading: true,
      error: "",
    };
  });
  paintAccountBalanceCells();

  await Promise.all(
    STATE.accounts.map(async (a) => {
      const addr = a.solana && a.solana.publicKey;
      if (!addr) {
        ACCOUNT_SOL[a.id] = { sol: null, loading: false, error: "no address" };
        return;
      }
      try {
        const sol = await fetchSolBalance(addr, rpcs);
        if (seq !== accountBalSeq) return;
        ACCOUNT_SOL[a.id] = { sol, loading: false, error: "" };
      } catch (err) {
        if (seq !== accountBalSeq) return;
        ACCOUNT_SOL[a.id] = {
          sol: ACCOUNT_SOL[a.id] && ACCOUNT_SOL[a.id].sol != null ? ACCOUNT_SOL[a.id].sol : null,
          loading: false,
          error: (err && err.message) || "failed",
        };
      }
    })
  );
  if (seq !== accountBalSeq) return;
  paintAccountBalanceCells();
}

function renderAccountsPanel() {
  const list = $("activityList");
  if (!list) return;
  list.innerHTML = "";
  STATE.accounts.forEach((a, idx) => {
    const active = a.id === STATE.activeAccountId;
    const li = document.createElement("li");
    li.className = "photon-row" + (active ? " is-active" : "");
    li.dataset.accountId = a.id;
    const addr = a.solana.publicKey;
    li.innerHTML =
      '<span class="photon-radio" aria-hidden="true"></span>' +
      '<span class="photon-name">' +
      (a.name || "W" + (idx + 1)) +
      (active ? "<small>Active</small>" : "") +
      "</span>" +
      '<span class="photon-addr" title="' +
      addr +
      '">' +
      shortAddr(addr) +
      "</span>" +
      '<span class="photon-bal" title="SOL balance">' +
      walletSolBalanceLabel(a.id) +
      "</span>" +
      '<span class="photon-actions">' +
      '<button type="button" class="photon-icon-btn" data-act="copy" title="Copy address">⧉</button>' +
      '<button type="button" class="photon-icon-btn" data-act="key" title="View seed / keys">◉</button>' +
      '<button type="button" class="photon-icon-btn photon-icon-danger" data-act="remove" title="Remove account">✕</button>' +
      "</span>";

    li.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (btn) {
        e.stopPropagation();
        const act = btn.getAttribute("data-act");
        if (act === "copy") {
          copyText(addr);
          showToast("Address copied");
          return;
        }
        if (act === "key") {
          STATE.activeAccountId = a.id;
          await storageSet(STATE);
          paintSwitchers();
          await showBackup();
          renderAccountsPanel();
          return;
        }
        if (act === "remove") {
          await removeAccount(a.id);
          return;
        }
      }
      if (a.id === STATE.activeAccountId) return;
      STATE.activeAccountId = a.id;
      await storageSet(STATE);
      await refreshAll();
      showToast("Active · " + a.name);
      go("activity");
    });
    list.appendChild(li);
  });
  const rpcInput = $("solRpcInput");
  if (rpcInput) rpcInput.value = STATE.solRpc || "";
  const rpcNote = $("rpcStatusNote");
  if (rpcNote) {
    rpcNote.innerHTML = IS_EXTENSION
      ? "Solana only: paste a Helius API key or <code>https://mainnet.helius-rpc.com/?api-key=YOUR_KEY</code> and Save. Ethereum / other chains use built-in public RPCs — do not paste those here."
      : "Solana only: put <code>HELIUS_API_KEY=...</code> in <code>.env</code> and run <code>serve.py</code>. Ethereum uses built-in public RPCs.";
  }
}

function askRemoveAccount(label) {
  const modal = $("removeModal");
  const title = $("removeModalTitle");
  const body = $("removeModalBody");
  const yes = $("removeModalYes");
  const no = $("removeModalNo");
  if (!modal || !yes || !no) {
    return Promise.resolve(
      window.confirm(
        "Remove " +
          label +
          "?\n\nThis removes the account from the wallet. If you did not back up the seed phrase, you may lose funds permanently."
      )
    );
  }
  if (title) title.textContent = "Remove " + label + "?";
  if (body) {
    body.textContent =
      "Doing so will remove the account from the wallet. If you didn't back up the seed phrase, you may lose funds permanently.";
  }
  modal.hidden = false;
  modal.classList.add("is-open");
  return new Promise((resolve) => {
    const finish = (value) => {
      modal.classList.remove("is-open");
      modal.hidden = true;
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    const onBackdrop = (e) => {
      if (e.target === modal) finish(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
    };
    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    no.focus();
  });
}

async function removeAccount(accountId) {
  const acc = STATE.accounts.find((a) => a.id === accountId);
  if (!acc) return;
  if (STATE.accounts.length <= 1) {
    showToast("Keep at least one wallet");
    const status = $("accountStatus");
    if (status) status.textContent = "Can't remove the last wallet — generate another first.";
    return;
  }
  const label = acc.name || shortAddr(acc.solana && acc.solana.publicKey) || "wallet";
  const ok = await askRemoveAccount(label);
  if (!ok) return;

  const wasActive = STATE.activeAccountId === accountId;
  STATE.accounts = STATE.accounts.filter((a) => a.id !== accountId);
  delete ACCOUNT_SOL[accountId];
  if (wasActive || !STATE.accounts.some((a) => a.id === STATE.activeAccountId)) {
    STATE.activeAccountId = STATE.accounts[0].id;
  }
  hideBackup();
  await storageSet(STATE);
  await refreshAll();
  showToast("Removed · " + label);
  const status = $("accountStatus");
  if (status) status.textContent = "Removed " + label + " from this device.";
}

async function addAccount() {
  const n = STATE.accounts.length + 1;
  const acc = await createAccount("W" + n);
  STATE.accounts.push(acc);
  STATE.activeAccountId = acc.id;
  await storageSet(STATE);
  await refreshAll();
  hideBackup();
  showToast("Generated " + acc.name + " · tap Show seed phrase to view");
  go("activity");
  const status = $("accountStatus");
  if (status) {
    status.textContent =
      "Wallet created. Tap Show seed phrase when you are ready to back it up.";
  }
}

async function importAccountFromSecrets() {
  const status = $("accountStatus");
  const mnemonicIn = ($("importMnemonic")?.value || "").trim();
  const solSecret = ($("importSolSecret")?.value || "").trim();
  const evmPk = ($("importEvmSecret")?.value || "").trim();
  if (!mnemonicIn && !solSecret && !evmPk) {
    if (status) status.textContent = "Paste a 24-word seed phrase or a private key.";
    return;
  }
  try {
    let acc;
    if (mnemonicIn) {
      const keys = await keysFromMnemonic(mnemonicIn, 0);
      acc = {
        id: uid(),
        name: "Imported " + (STATE.accounts.length + 1),
        createdAt: new Date().toISOString(),
        mnemonic: keys.mnemonic,
        solana: keys.solana,
        evm: keys.evm,
        bitcoin: keys.bitcoin,
        sui: keys.sui,
      };
    } else {
      const sol = solSecret ? importSolanaFromSecret(solSecret) : createSolanaKeys();
      const evm = evmPk ? importEvmFromPrivateKey(evmPk) : createEvmKeys();
      acc = {
        id: uid(),
        name: "Imported " + (STATE.accounts.length + 1),
        createdAt: new Date().toISOString(),
        mnemonic: "",
        solana: sol,
        evm: evm,
      };
    }
    STATE.accounts.push(acc);
    STATE.activeAccountId = acc.id;
    STATE.activeChainId = "solana";
    await storageSet(STATE);
    if ($("importMnemonic")) $("importMnemonic").value = "";
    if ($("importSolSecret")) $("importSolSecret").value = "";
    if ($("importEvmSecret")) $("importEvmSecret").value = "";
    await refreshAll();
    if (status) {
      status.textContent =
        "Imported. Solana: " + shortAddr(acc.solana.publicKey) + " — kept in localStorage.";
    }
    showToast(mnemonicIn ? "Seed phrase imported" : "Wallet imported");
    go("activity");
  } catch (err) {
    console.error("[import]", err);
    const msg = String(err && err.message ? err.message : err);
    if (status) status.textContent = "Import failed: " + msg;
    showToast(msg.length > 70 ? "Import failed — see message below" : msg);
  }
}

function renderSeedGrid(phrase) {
  const grid = $("seedGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const words = String(phrase || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    grid.hidden = true;
    return;
  }
  grid.hidden = false;
  words.forEach((w, i) => {
    const li = document.createElement("li");
    li.innerHTML = "<em>" + (i + 1) + "</em><span>" + w + "</span>";
    grid.appendChild(li);
  });
}

async function ensureActiveSeededAccount() {
  let acc = activeAccount(STATE);
  if (!acc) {
    acc = await createAccount("W1");
    STATE.accounts.push(acc);
    STATE.activeAccountId = acc.id;
    await storageSet(STATE);
    return acc;
  }
  if (acc.mnemonic && String(acc.mnemonic).trim().split(/\s+/).length >= 12) {
    return acc;
  }
  // Key-only wallets cannot reverse into a mnemonic — mint a seeded wallet and show it.
  const n = STATE.accounts.length + 1;
  const seeded = await createAccount(acc.name && !acc.mnemonic ? acc.name + " seed" : "W" + n);
  STATE.accounts.push(seeded);
  STATE.activeAccountId = seeded.id;
  await storageSet(STATE);
  showToast("New 24-word seed wallet ready");
  return seeded;
}

async function showBackup() {
  const acc = await ensureActiveSeededAccount();
  paintSwitchers();
  renderAccountsPanel();
  const box = $("backupReveal");
  const sol = $("backupSolSecret");
  const evm = $("backupEvmSecret");
  const label = $("backupWalletLabel");
  const seedBox = $("backupMnemonic");
  const seedNote = $("seedPhraseNote");
  const phrase = (acc && acc.mnemonic) || "";
  const wordCount = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;
  if (seedBox) {
    seedBox.value = phrase;
    seedBox.hidden = true; // grid is the primary view
  }
  renderSeedGrid(phrase);
  if (sol) sol.value = (acc && acc.solana && acc.solana.secretKey) || "";
  if (evm) evm.value = (acc && acc.evm && acc.evm.privateKey) || "";
  if (label) {
    label.textContent =
      (acc && acc.name ? acc.name + " · " : "") +
      (wordCount ? wordCount + "-word seed phrase" : "Private keys");
  }
  if (seedNote) {
    if (phrase) {
      seedNote.hidden = true;
      seedNote.textContent = "";
    } else {
      seedNote.hidden = false;
      seedNote.textContent =
        "This wallet has no seed phrase (imported via private key only).";
    }
  }
  const copySeed = $("copyMnemonicBtn");
  if (copySeed) copySeed.hidden = !phrase;
  if (box) box.hidden = false;
  const status = $("accountStatus");
  if (status) {
    status.textContent = phrase
      ? wordCount + "-word seed visible — write it down offline."
      : "Private keys visible — keep offline.";
  }
}

function hideBackup() {
  const box = $("backupReveal");
  if (box) box.hidden = true;
  const sol = $("backupSolSecret");
  const evm = $("backupEvmSecret");
  const seedBox = $("backupMnemonic");
  if (sol) sol.value = "";
  if (evm) evm.value = "";
  if (seedBox) seedBox.value = "";
  renderSeedGrid("");
  const status = $("accountStatus");
  if (status) status.textContent = "";
}


function closeAddrMenu() {
  const menu = $("addrMenu");
  const btn = $("addrMenuBtn");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function toggleAddrMenu() {
  const menu = $("addrMenu");
  const btn = $("addrMenuBtn");
  if (!menu || !btn) return;
  const open = menu.hidden;
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}


function paintSendContacts() {
  const sel = $("sendContactSelect");
  if (!sel || !STATE) return;
  const book = Array.isArray(STATE.addressBook) ? STATE.addressBook : [];
  const cur = sel.value;
  sel.innerHTML =
    '<option value="">Enter address manually</option>' +
    book
      .map(
        (c) =>
          '<option value="' +
          escapeHtml(c.id) +
          '">' +
          escapeHtml(c.name) +
          " · " +
          escapeHtml(shortAddr(c.address)) +
          "</option>"
      )
      .join("");
  if (cur && book.some((c) => c.id === cur)) sel.value = cur;
}

function applySendContact(contactId) {
  const book = (STATE && STATE.addressBook) || [];
  const hit = book.find((c) => c.id === contactId);
  const input = $("sendTo");
  if (!input) return;
  if (!hit) return;
  // Show the saved name in the field; executeSend resolves it to the address.
  input.value = hit.name;
  updateSendUsdEstimate();
  showToast("Sending to " + hit.name);
}

function paintAddressBook() {
  const list = $("abList");
  if (!list || !STATE) return;
  const book = Array.isArray(STATE.addressBook) ? STATE.addressBook : [];
  if (!book.length) {
    list.innerHTML = '<li class="photon-sub" style="padding:6px 2px">No saved contacts yet.</li>';
    return;
  }
  list.innerHTML = book
    .map(
      (c) =>
        '<li class="settings-contact" data-ab-id="' +
        escapeHtml(c.id) +
        '">' +
        '<div class="settings-contact-meta"><strong>' +
        escapeHtml(c.name) +
        "</strong><span>" +
        escapeHtml(c.address) +
        "</span></div>" +
        '<button type="button" class="photon-chip settings-danger" data-ab-del="' +
        escapeHtml(c.id) +
        '">Remove</button></li>'
    )
    .join("");
}

async function addAddressBookEntry() {
  const name = ($("abName")?.value || "").trim();
  const address = ($("abAddress")?.value || "").trim();
  if (!name) return showToast("Enter a contact name");
  if (!address || address.length < 8) return showToast("Enter a valid address");
  if (!Array.isArray(STATE.addressBook)) STATE.addressBook = [];
  const existing = STATE.addressBook.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    existing.address = address;
  } else {
    STATE.addressBook.push({
      id: "ab_" + Math.random().toString(36).slice(2, 10),
      name,
      address,
      createdAt: new Date().toISOString(),
    });
  }
  await storageSet(STATE);
  if ($("abName")) $("abName").value = "";
  if ($("abAddress")) $("abAddress").value = "";
  paintAddressBook();
  paintSendContacts();
  showToast("Saved " + name);
}

async function removeAddressBookEntry(id) {
  if (!Array.isArray(STATE.addressBook)) return;
  STATE.addressBook = STATE.addressBook.filter((c) => c.id !== id);
  await storageSet(STATE);
  paintAddressBook();
  paintSendContacts();
  showToast("Contact removed");
}

function paintWalletRenameList() {
  const list = $("walletRenameList");
  if (!list || !STATE) return;
  list.innerHTML = STATE.accounts
    .map((a, idx) => {
      const active = a.id === STATE.activeAccountId;
      return (
        '<li class="settings-wallet" data-wallet-id="' +
        escapeHtml(a.id) +
        '">' +
        '<div class="settings-wallet-meta">' +
        '<input type="text" maxlength="32" data-rename-input="' +
        escapeHtml(a.id) +
        '" value="' +
        escapeHtml(a.name || "W" + (idx + 1)) +
        '" aria-label="Rename wallet" />' +
        (active ? '<span class="photon-sub">Active</span>' : "") +
        "</div>" +
        '<button type="button" class="photon-chip" data-rename-save="' +
        escapeHtml(a.id) +
        '">Save</button></li>'
      );
    })
    .join("");
}

async function renameWallet(accountId) {
  const row = document.querySelector('.settings-wallet[data-wallet-id="' + accountId + '"]');
  const input =
    (row && row.querySelector("input")) ||
    document.querySelector('[data-rename-input="' + accountId + '"]');
  const name = (input && input.value ? input.value : "").trim();
  if (!name) return showToast("Enter a wallet name");
  const acc = STATE.accounts.find((a) => a.id === accountId);
  if (!acc) return;
  acc.name = name.slice(0, 32);
  await storageSet(STATE);
  paintSwitchers();
  renderAccountsPanel();
  paintWalletRenameList();
  paintBrandAccount();
  if ($("acctDrawerRoot") && !$("acctDrawerRoot").hidden) renderAcctDrawerList();
  showToast("Renamed to " + acc.name);
}

function paintSettings() {
  paintAddressBook();
  paintWalletRenameList();
  paintWcSettings();
}

function openSettings(opts) {
  closeAddrMenu();
  go("settings");
  paintWcSettings();
  if (opts && opts.focusWc) {
    requestAnimationFrame(() => {
      const block = $("wcSettingsBlock");
      if (block && typeof block.scrollIntoView === "function") {
        block.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const uri = $("wcUri");
      if (uri) uri.focus();
    });
  }
}

async function refreshAll() {
  // Drop prior-chain holdings immediately so UI never sticks on ETH/etc.
  HOLDINGS = [];
  BALANCE = {
    native: 0,
    usd: 0,
    ok: false,
    error: "",
    chainId: STATE && STATE.activeChainId,
  };
  const acc = activeAccount(STATE);
  if (acc && (await ensureAccountExtraKeys(acc))) {
    await storageSet(STATE);
  }
  paintSwitchers();
  paintBalances();
  paintHoldings();
  renderReceive();
  renderAccountsPanel();
  hideBackup();
  closeAddrMenu();
  closeChainPicker();
  await Promise.all([refreshBalance(), refreshAccountBalances()]);
}

function wire() {
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      go(el.dataset.go);
    });
  });
  $("brandAccountsBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    const root = $("acctDrawerRoot");
    if (root && !root.hidden && root.classList.contains("is-open")) closeAcctDrawer();
    else openAcctDrawer();
  });
  $("acctDrawerClose")?.addEventListener("click", () => closeAcctDrawer());
  $("acctDrawerBackdrop")?.addEventListener("click", () => closeAcctDrawer());
  $("acctDrawerGenerate")?.addEventListener("click", async () => {
    closeAcctDrawer();
    await addAccount();
  });
  $("acctDrawerManage")?.addEventListener("click", () => {
    closeAcctDrawer();
    go("activity");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeAcctDrawer(); closeAddrMenu(); closeChainPicker(); }
  });
  $("addrMenuBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAddrMenu();
  });
  $("addrMenu")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-menu]");
    if (!item) return;
    e.preventDefault();
    const act = item.getAttribute("data-menu");
    if (act === "connect") openSettings({ focusWc: true });
    else if (act === "settings") openSettings();
  });
  $("wcConnectBtn")?.addEventListener("click", () => {
    wcConnectFromUri().catch((err) => {
      console.error(err);
      showToast(err.message || "WalletConnect failed");
    });
  });
  $("wcDisconnectBtn")?.addEventListener("click", () => {
    wcDisconnect().catch((err) => console.warn(err));
  });
  $("wcRefreshConnections")?.addEventListener("click", () => {
    refreshWcConnections({ ensure: true, poll: 6 })
      .then((items) => {
        showToast(
          items && items.length
            ? items.length + " connection" + (items.length === 1 ? "" : "s")
            : "No active connections"
        );
      })
      .catch((err) => console.warn(err));
  });
  $("wcConnectionsList")?.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest(".wc-conn-disconnect") : null;
    if (!btn) return;
    e.preventDefault();
    const topic = btn.getAttribute("data-topic") || "";
    wcDisconnectTopic(topic).catch((err) => console.warn(err));
  });
  $("wcProposalApprove")?.addEventListener("click", () => {
    wcApprovePending().catch((err) => console.error(err));
  });
  $("wcProposalReject")?.addEventListener("click", () => {
    wcRejectPending().catch((err) => console.warn(err));
  });
  $("wcApproveInline")?.addEventListener("click", () => {
    wcApprovePending().catch((err) => console.error(err));
  });
  $("wcRejectInline")?.addEventListener("click", () => {
    wcRejectPending().catch((err) => console.warn(err));
  });
  $("wcProjectId")?.addEventListener("change", async () => {
    const v = ($("wcProjectId")?.value || "").trim();
    if (!STATE) return;
    STATE.wcProjectId = v;
    await storageSet(STATE);
    paintWcSettings();
  });
  document.addEventListener("click", (e) => {
    const wrap = $("addrMenuWrap");
    if (wrap && !wrap.contains(e.target)) closeAddrMenu();
  });
  $("chainSelect")?.addEventListener("change", async (e) => {
    await selectChain(e.target.value);
  });

  $("chainPickerBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleChainPicker();
  });
  // pointerdown selects reliably even when a later click would hit content underneath
  $("chainPickerMenu")?.addEventListener("pointerdown", (e) => {
    const copyBtn = e.target.closest("[data-copy-addr]");
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const addr = copyBtn.getAttribute("data-copy-addr") || "";
      const row = copyBtn.closest("[data-chain-id]");
      const chain = row && CHAINS.find((c) => c.id === row.getAttribute("data-chain-id"));
      copyChainAddress(addr, chain && chain.name);
      return;
    }
    const item = e.target.closest("[data-chain-id]");
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    selectChain(item.getAttribute("data-chain-id"));
  });
  $("chainPickerMenu")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-chain-id], [data-copy-addr]")) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  document.addEventListener("click", (e) => {
    const picker = $("chainPicker");
    if (!picker) return;
    if (picker.contains(e.target)) return;
    closeChainPicker();
  });
  $("sendContactSelect")?.addEventListener("change", (e) => {
    const id = e.target.value;
    if (!id) return;
    applySendContact(id);
  });
  $("abAddBtn")?.addEventListener("click", () => addAddressBookEntry());
  $("abList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ab-del]");
    if (!btn) return;
    removeAddressBookEntry(btn.getAttribute("data-ab-del"));
  });
  $("walletRenameList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rename-save]");
    if (!btn) return;
    e.preventDefault();
    renameWallet(btn.getAttribute("data-rename-save"));
  });
  $("walletRenameList")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const input = e.target.closest("[data-rename-input]");
    if (!input) return;
    e.preventDefault();
    renameWallet(input.getAttribute("data-rename-input"));
  });

  $("addAccountBtn")?.addEventListener("click", () => addAccount());
  $("createAccountBtn")?.addEventListener("click", () => addAccount());
  $("importAccountBtn")?.addEventListener("click", () => importAccountFromSecrets());
  $("viewBackupBtn")?.addEventListener("click", () => {
    showBackup().catch((err) => {
      console.error(err);
      showToast(err.message || "Could not show seed phrase");
    });
  });
  $("hideBackupBtn")?.addEventListener("click", () => hideBackup());
  $("copyMnemonicBtn")?.addEventListener("click", () => {
    const v = ($("backupMnemonic")?.value || "").trim();
    if (!v) return showToast("No seed phrase on this wallet");
    copyText(v);
    showToast("Seed phrase copied");
  });
  $("copySolSecretBtn")?.addEventListener("click", () => {
    const v = ($("backupSolSecret")?.value || "").trim();
    if (!v) return showToast("Open Show seed phrase first");
    copyText(v);
    showToast("Solana secret copied");
  });
  $("copyEvmSecretBtn")?.addEventListener("click", () => {
    const v = ($("backupEvmSecret")?.value || "").trim();
    if (!v) return showToast("Open Show seed phrase first");
    copyText(v);
    showToast("EVM key copied");
  });
  $("saveRpcBtn")?.addEventListener("click", async () => {
    const raw = ($("solRpcInput")?.value || "").trim();
    const v = normalizeCustomRpc(raw);
    const status = $("accountStatus");
    if (raw && !v) {
      if (status) {
        status.textContent =
          "Could not parse RPC. Paste only the API key, or a full URL like https://mainnet.helius-rpc.com/?api-key=YOUR_KEY (not the HELIUS_API_KEY= prefix unless you include the value).";
      }
      showToast("Invalid RPC paste");
      return;
    }
    STATE.solRpc = v;
    if ($("solRpcInput")) $("solRpcInput").value = v;
    await storageSet(STATE);

    if (v && IS_EXTENSION) {
      if (status) status.textContent = "Testing Helius / custom RPC…";
      try {
        await probeSolanaRpc(v);
        showToast(isHeliusRpcUrl(v) ? "Helius RPC OK" : "Custom RPC OK");
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        if (status) {
          status.textContent =
            "RPC rejected: " +
            msg +
            " — check the key in Helius dashboard. Balances may still work via public RPCs.";
        }
        showToast("RPC key rejected");
        // Still try balance sync (failover to public RPCs).
      }
    } else if (IS_EXTENSION) {
      showToast("Using public RPCs");
    } else {
      showToast(v ? "Custom RPC override saved" : "Using .env RPC via serve.py");
    }

    // Helius only affects Solana — switch there so Save feels like it "worked".
    if (STATE.activeChainId !== "solana") {
      STATE.activeChainId = "solana";
      await storageSet(STATE);
      paintActiveChainAddress();
      paintChainPicker();
    }
    await refreshBalance();
    if (status) {
      const acc = activeAccount(STATE);
      const addr = acc && acc.solana && acc.solana.publicKey;
      status.textContent = BALANCE.ok
        ? "Synced on Solana" +
          (addr ? " (" + shortAddr(addr) + ")" : "") +
          ". Native " +
          Number(BALANCE.native || 0).toFixed(4) +
          " SOL · SPL: " +
          HOLDINGS.filter((h) => h.kind === "spl" && h.amount > 0).length +
          (v && isHeliusRpcUrl(v) ? " · Helius saved" : "") +
          ". If this isn’t your funded wallet, Import the seed from the local wallet."
        : "Sync failed: " +
          (BALANCE.error || "unknown") +
          (IS_EXTENSION
            ? " — paste API key or full Helius URL, Save, stay on Solana, and import your seed if balances are on another wallet."
            : "");
    }
  });
  $("settingsSyncBtn")?.addEventListener("click", async () => {
    showToast("Syncing…");
    await fetchPrices();
    await refreshBalance();
    showToast(BALANCE.ok ? "Synced" : "Sync failed");
  });
  $("refreshBtn")?.addEventListener("click", async () => {
    showToast("Syncing…");
    await fetchPrices();
    await refreshBalance();
    showToast(BALANCE.ok ? "Synced" : "Sync failed");
  });
  $("copyAddrBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const acc = activeAccount(STATE);
    const chain = activeChain(STATE);
    const addr =
      e.currentTarget.getAttribute("data-copy-addr") ||
      chainKeyAddress(acc, chain) ||
      addressFor(acc, chain);
    copyChainAddress(addr, chain && chain.name);
  });
  $("copyFullBtn")?.addEventListener("click", () => {
    const acc = activeAccount(STATE);
    const chain = activeChain(STATE);
    const addr = chainKeyAddress(acc, chain) || addressFor(acc, chain);
    copyChainAddress(addr, chain && chain.name);
  });
  $("sendAmount")?.addEventListener("input", updateSendUsdEstimate);
  $("sendAmount")?.addEventListener("change", updateSendUsdEstimate);
  $("sendAsset")?.addEventListener("change", () => {
    updateSendUsdEstimate();
    paintSendAvailable();
  });
  $("historyRefreshBtn")?.addEventListener("click", () => {
    refreshHistory().catch((err) => console.warn(err));
  });
  $("sendForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    executeSend().catch((err) => {
      console.error(err);
      showToast(err.message || "Send failed");
    });
  });
  $("sendMaxBtn")?.addEventListener("click", () => {
    const holding = selectedSendHolding();
    const chain = activeChain(STATE);
    let max = 0;
    if (holding) {
      max = Number(holding.amount) || 0;
      if (holding.kind === "native" && chain.kind === "solana") {
        // Keep fee buffer so Max does not trip insufficient-funds
        max = Math.max(0, max - 0.000005);
      }
    } else {
      max = Math.max(0, (Number(BALANCE.native) || 0) - 0.000005);
    }
    if ($("sendAmount")) {
      $("sendAmount").value =
        max >= 1 ? String(Number(max.toFixed(6))) : String(Number(max.toFixed(9)));
    }
    updateSendUsdEstimate();
    paintSendAvailable();
  });
}

async function boot() {
  if (!window.nacl) {
    console.error("nacl missing");
    showToast("Crypto lib failed to load");
  }
  if (!window.ethers) {
    console.error("ethers missing");
  }
  if (!window.MultiHD) {
    console.error("multi-hd missing");
    showToast("Bitcoin lib failed to load — remove & reload extension");
  }
  if (!window.solanaWeb3 || !window.splToken) {
    console.error("solana-tx.bundle missing");
  }
  STATE = await ensureState();
  // Second pass: always try to materialize BTC/Sui before first paint.
  if (await repairAllExtraKeys(STATE)) {
    try {
      await storageSet(STATE);
    } catch (err) {
      console.warn("[boot-persist]", err);
      showToast("Could not save BTC/Sui keys — storage full?");
    }
  }
  wire();
  paintSwitchers();
  paintBalances();
  paintHoldings();
  go("home");
  const bootAcc = activeAccount(STATE);
  if (bootAcc && bootAcc.mnemonic && window.MultiHD) {
    const missing = [];
    if (!isValidBtcAddress(bootAcc.bitcoin && bootAcc.bitcoin.address)) missing.push("Bitcoin");
    if (!isValidSuiAddress(bootAcc.sui && bootAcc.sui.address)) missing.push("Sui");
    if (missing.length) {
      showToast("Missing " + missing.join(" & ") + " — re-import seed");
    }
  } else if (bootAcc && !bootAcc.mnemonic) {
    // Key-only wallets cannot derive BTC/Sui
    console.info("[boot] active wallet has no mnemonic — BTC/Sui unavailable");
  }
  await fetchPrices();
  updateSendUsdEstimate();
  await refreshBalance();
  if (STATE.wcProjectId && window.GladiatorWC) {
    try {
      await ensureWalletConnect();
      await refreshWcConnections({ ensure: false, poll: 4 });
      paintWcSettings();
    } catch (err) {
      console.warn("[wc-boot]", err);
      setWcStatus(String(err && err.message ? err.message : err));
      paintWcSettings();
    }
  } else {
    paintWcSettings();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    console.error(err);
    showToast("Wallet boot failed");
  });
});
