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
    blockscout: "https://eth.blockscout.com",
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
    blockscout: "https://polygon.blockscout.com",
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
    rpcs: ["https://rpc.mainnet.chain.robinhood.com"],
    priceId: "ethereum",
    chainId: 4663,
    blockscout: "https://robinhoodchain.blockscout.com",
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
    blockscout: "https://base.blockscout.com",
  },
];

const LOGO_ICON_VER = "8";

const STORE_KEY = "gladiator_wallet_v1";
const IS_EXTENSION = !!(
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.id
);
/** Toolbar popup closes on blur — cannot host WalletConnect reliably. */
const IS_EXTENSION_POPUP = !!(
  IS_EXTENSION &&
  /popup\.html$/i.test(String((location && location.pathname) || ""))
);
/** Full wallet page / detached wallet window owns the WC relay session. */
const IS_WC_HOST = !IS_EXTENSION_POPUP;

/** Legacy vault migrate: one-time decrypt if an old encrypted blob exists. */
let VAULT_MIGRATE_MODE = false;

function bufToB64(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function b64ToBuf(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function accountHasPlainSecrets(a) {
  if (!a) return false;
  if (a.mnemonic) return true;
  if (a.solana && a.solana.secretKey) return true;
  if (a.evm && a.evm.privateKey) return true;
  if (a.bitcoin && a.bitcoin.privateKey) return true;
  if (a.sui && a.sui.secretKey) return true;
  return false;
}

function isLedgerAccount(a) {
  return !!(a && (a.type === "ledger" || (a.ledger && a.ledger.path)));
}

function ledgerAccountIndex(a) {
  if (!a) return 0;
  if (a.ledger && a.ledger.accountIndex != null) return Number(a.ledger.accountIndex) || 0;
  return 0;
}

function ledgerBadgeHtml(a) {
  if (!isLedgerAccount(a)) return "";
  const tip = ledgerHasEvm(a)
    ? "Ledger · Solana + EVM linked"
    : "Ledger · Solana (pick an ETH chain to link EVM)";
  return (
    '<span class="ledger-badge" title="' + tip + '">Ledger</span>'
  );
}

/** Resolve extension-relative icon paths reliably in popup + wallet window. */
function extAssetUrl(relPath) {
  const rel = String(relPath || "").replace(/^\.\//, "");
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === "function"
    ) {
      return chrome.runtime.getURL(rel);
    }
  } catch (_) {}
  return "./" + rel;
}

function getLedgerApi() {
  const api =
    (typeof window !== "undefined" && window.GladiatorLedger) ||
    (typeof globalThis !== "undefined" && globalThis.GladiatorLedger) ||
    null;
  if (!api || typeof api.getAddress !== "function") {
    throw new Error("Ledger library missing — reload the extension pack");
  }
  return api;
}

function getLedgerEthApi() {
  const api =
    (typeof window !== "undefined" && window.GladiatorLedgerEth) ||
    (typeof globalThis !== "undefined" && globalThis.GladiatorLedgerEth) ||
    null;
  if (!api || typeof api.getAddress !== "function") {
    throw new Error("Ledger Ethereum library missing — reload the extension pack");
  }
  return api;
}

function ledgerHasEvm(acc) {
  return !!(acc && acc.evm && acc.evm.address);
}

function ledgerSupportsChain(acc, chain) {
  if (!isLedgerAccount(acc) || !chain) return false;
  if (chain.kind === "solana") return !!(acc.solana && acc.solana.publicKey);
  if (chain.kind === "evm") return ledgerHasEvm(acc);
  // Bitcoin / Sui Ledger apps not wired yet
  return false;
}

async function ensureLedgerSupported() {
  const api = getLedgerApi();
  const ok = api.isSupported ? await api.isSupported() : true;
  if (!ok) {
    throw new Error("WebHID unavailable — use Chrome/Opera and allow Ledger access");
  }
  return api;
}

async function ensureLedgerEthSupported() {
  const api = getLedgerEthApi();
  const ok = api.isSupported ? await api.isSupported() : true;
  if (!ok) {
    throw new Error("WebHID unavailable — use Chrome/Opera and allow Ledger access");
  }
  return api;
}

function stateHasPlainSecrets(state) {
  return !!(state && Array.isArray(state.accounts) && state.accounts.some(accountHasPlainSecrets));
}

function applyAccountSecrets(accounts, secretsMap) {
  return (accounts || []).map((a) => {
    const s = secretsMap && secretsMap[a.id];
    if (!s) return { ...a };
    const next = { ...a };
    next.mnemonic = s.mnemonic || "";
    if (next.solana || s.solanaSecretKey) {
      next.solana = { ...(next.solana || {}), secretKey: s.solanaSecretKey || "" };
    }
    if (next.evm || s.evmPrivateKey) {
      next.evm = { ...(next.evm || {}), privateKey: s.evmPrivateKey || "" };
    }
    if (next.bitcoin || s.bitcoinPrivateKey) {
      next.bitcoin = { ...(next.bitcoin || {}), privateKey: s.bitcoinPrivateKey || "" };
    }
    if (next.sui || s.suiSecretKey) {
      next.sui = { ...(next.sui || {}), secretKey: s.suiSecretKey || "" };
    }
    return next;
  });
}

async function deriveVaultKey(password, saltBytes, iterations) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: iterations || 310000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptVaultPayload(password, vault) {
  if (!vault || !vault.data || !vault.salt || !vault.iv) {
    throw new Error("No encrypted vault");
  }
  const salt = b64ToBuf(vault.salt);
  const iv = b64ToBuf(vault.iv);
  const key = await deriveVaultKey(password, salt, vault.iterations);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    b64ToBuf(vault.data)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

function isVaultLocked() {
  // Encryption paused — only "locked" while awaiting one-time migrate unlock.
  return !!(STATE && STATE._needsVaultMigrate);
}

function paintVaultStatus() {
  // Vault UI removed; keep no-op for any leftover calls.
}

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

/** Slightly longer truncation for the top address bar. */
function shortAddrWide(a) {
  if (!a || a.length < 14) return shortAddr(a);
  return a.slice(0, 6) + "…" + a.slice(-6);
}

/** True when a string looks like a truncated or full chain address (not a ticker). */
function looksLikeAddressLabel(s) {
  const t = String(s || "").trim();
  if (!t) return true;
  if (t.includes("…") || t.includes("...")) return true;
  if (/^0x[a-fA-F0-9]{6,}$/.test(t)) return true;
  // Base58-ish Solana / Sui style blobs (no spaces, mostly alnum, long)
  if (t.length >= 20 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return true;
  return false;
}

function holdingDisplaySymbol(t) {
  const sym = t && t.symbol != null ? String(t.symbol).trim() : "";
  if (sym && !looksLikeAddressLabel(sym)) return sym;
  if (t && t.kind === "native") return "TOKEN";
  return "TOKEN";
}

function holdingDisplayName(t, chain) {
  const name = t && t.name != null ? String(t.name).trim() : "";
  if (name && !looksLikeAddressLabel(name)) return name;
  const sym = holdingDisplaySymbol(t);
  if (sym && sym !== "TOKEN") return sym;
  if (t && t.kind === "native") return (chain && chain.name) || "Native";
  return "Token";
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
  let chromeState = null;
  let localState = null;

  if (IS_EXTENSION) {
    try {
      chromeState = await new Promise((resolve) => {
        try {
          chrome.storage.local.get([STORE_KEY], (r) => resolve((r && r[STORE_KEY]) || null));
        } catch (_) {
          resolve(null);
        }
      });
    } catch (_) {}
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) localState = JSON.parse(raw);
  } catch (_) {}

  const chromeOk = chromeState && Array.isArray(chromeState.accounts) && chromeState.accounts.length;
  const localOk = localState && Array.isArray(localState.accounts) && localState.accounts.length;
  const chromeHasSecrets = chromeOk && stateHasPlainSecrets(chromeState);
  const localHasSecrets = localOk && stateHasPlainSecrets(localState);

  // Prefer whichever copy still has signing keys. Older builds could leave
  // chrome.storage with addresses-only while localStorage still had secrets.
  if (chromeHasSecrets) return chromeState;
  if (localHasSecrets) return localState;
  if (chromeOk) return chromeState;
  if (localOk) return localState;
  return null;
}

async function storageSet(data) {
  // Never mutate caller's object. Only drop vault after plaintext secrets exist.
  const toStore = data && typeof data === "object" ? { ...data } : data;
  if (toStore && typeof toStore === "object") {
    const hasSecrets = stateHasPlainSecrets(toStore);
    delete toStore._needsVaultMigrate;
    if (hasSecrets) {
      delete toStore.vault;
      delete toStore.vaultEnabled;
    }
    // If secrets are still locked in vault, keep vault blob intact.
  }
  const raw = JSON.stringify(toStore);
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
          chrome.storage.local.set({ [STORE_KEY]: toStore }, () => {
            const err = chrome.runtime && chrome.runtime.lastError;
            if (err) reject(err);
            else resolve();
          });
        } catch (e) {
          reject(e);
        }
      });
      // Confirm background/offscreen can see the same wallet.
      try {
        chrome.runtime.sendMessage({
          type: "gladiator-persist-wallet",
          state: toStore,
        });
      } catch (_) {}
    } catch (err) {
      console.warn("[storage chrome]", err);
      if (!localOk) throw err;
      showToast("Warning: wallet not synced for Jupiter signing");
    }
  } else if (!localOk) {
    throw new Error("Could not save wallet");
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

function normalizeHexPrivateKey(pk) {
  let h = String(pk || "").trim();
  if (!h) throw new Error("Paste a private key");
  if (h.startsWith("0x") || h.startsWith("0X")) h = h.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(h)) throw new Error("Private key must be hex");
  if (h.length === 64) return "0x" + h.toLowerCase();
  if (h.length === 128) return "0x" + h.slice(0, 64).toLowerCase(); // seed||pub → seed
  throw new Error("Private key must be 32 bytes (64 hex chars)");
}

async function importBitcoinFromPrivateKey(pk) {
  if (!window.MultiHD || !MultiHD.btcAddressFromPrivateKey) {
    throw new Error("Bitcoin import lib missing");
  }
  const privateKey = normalizeHexPrivateKey(pk);
  const address = await MultiHD.btcAddressFromPrivateKey(privateKey);
  if (!isValidBtcAddress(address)) throw new Error("Could not derive Bitcoin address");
  let publicKey = "";
  try {
    if (window.ethers) {
      publicKey = new ethers.SigningKey(privateKey).compressedPublicKey || "";
    }
  } catch (_) {}
  return { address, privateKey, publicKey };
}

function importSuiFromPrivateKey(pk) {
  if (!window.nacl || !window.MultiHD || !MultiHD.suiAddressFromPubkey) {
    throw new Error("Sui import lib missing");
  }
  let h = String(pk || "").trim();
  if (!h) throw new Error("Paste a Sui private key");
  if (h.startsWith("0x") || h.startsWith("0X")) h = h.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(h)) throw new Error("Sui private key must be hex");
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  let kp;
  if (bytes.length === 32) kp = nacl.sign.keyPair.fromSeed(bytes);
  else if (bytes.length === 64) kp = nacl.sign.keyPair.fromSecretKey(bytes);
  else throw new Error("Sui key must be 32-byte seed or 64-byte secret (hex)");
  const toHex = (u8) =>
    Array.from(u8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return {
    address: MultiHD.suiAddressFromPubkey(kp.publicKey),
    publicKey: toHex(kp.publicKey),
    secretKey: toHex(kp.secretKey),
  };
}

function emptyChainKeys() {
  return {
    solana: { publicKey: "", secretKey: "" },
    evm: { address: "", privateKey: "" },
    bitcoin: { address: "", privateKey: "", publicKey: "" },
    sui: { address: "", publicKey: "", secretKey: "" },
  };
}

function setImportFieldVisible(el, on) {
  if (!el) return;
  el.hidden = !on;
  el.style.display = on ? "" : "none";
  if (!on) {
    const input = el.querySelector("input, textarea");
    if (input) input.value = "";
  }
}

/** Ledger accounts never store or show a seed phrase / private keys. */
function sanitizeLedgerAccounts(accounts) {
  let changed = false;
  (accounts || []).forEach((a) => {
    if (!isLedgerAccount(a)) return;
    if (a.mnemonic) {
      a.mnemonic = "";
      changed = true;
    }
    if (a.solana && a.solana.secretKey) {
      a.solana.secretKey = "";
      changed = true;
    }
    if (a.evm && a.evm.privateKey) {
      a.evm.privateKey = "";
      changed = true;
    }
    if (a.bitcoin && a.bitcoin.privateKey) {
      a.bitcoin.privateKey = "";
      changed = true;
    }
    if (a.sui && a.sui.secretKey) {
      a.sui.secretKey = "";
      changed = true;
    }
  });
  return changed;
}

/** Hide all seed-phrase / import UI while a Ledger account is active. */
function paintLedgerSeedUi() {
  const ledger = isLedgerAccount(activeAccount(STATE));
  const note = $("ledgerSeedNote");
  const importPanel = $("importSeedPanel");
  const backupBtn = $("viewBackupBtn");
  const backupReveal = $("backupReveal");
  const softwareSeed = $("softwareSeedTools");
  document.body.classList.toggle("ledger-account-active", !!ledger);
  if (note) note.hidden = !ledger;
  if (importPanel) importPanel.hidden = !!ledger;
  if (backupBtn) backupBtn.hidden = !!ledger;
  if (softwareSeed) softwareSeed.hidden = !!ledger;
  if (ledger) {
    try {
      hideBackup();
    } catch (_) {}
    if (backupReveal) backupReveal.hidden = true;
    if ($("backupMnemonic")) $("backupMnemonic").value = "";
    if ($("backupChainSecret")) $("backupChainSecret").value = "";
    if ($("importMnemonic")) $("importMnemonic").value = "";
    if ($("importSolSecret")) $("importSolSecret").value = "";
    if ($("importEvmSecret")) $("importEvmSecret").value = "";
    if ($("importBtcSecret")) $("importBtcSecret").value = "";
    if ($("importSuiSecret")) $("importSuiSecret").value = "";
    renderSeedGrid("");
    const label = $("backupWalletLabel");
    if (label) label.textContent = "Ledger — no seed phrase";
    const seedNote = $("seedPhraseNote");
    if (seedNote) {
      seedNote.hidden = true;
      seedNote.textContent = "";
    }
  }
  paintLinkEvmUi();
}

/** Link EVM is for ETH chains only — hide it while Solana (or non-EVM) is selected. */
function paintLinkEvmUi() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const onEvm = !!(chain && chain.kind === "evm");
  const ledger = isLedgerAccount(acc);
  const show = ledger && onEvm;
  ["linkLedgerEvmBtn", "acctDrawerLinkEvm", "linkEvmHelp"].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = !show;
  });
}

function paintImportFields() {
  paintLedgerSeedUi();
  if (isLedgerAccount(activeAccount(STATE))) return;
  const chain = activeChain(STATE);
  const kind = (chain && chain.kind) || "solana";
  const showSol = kind === "solana";
  const showEvm = kind === "evm";
  const showBtc = kind === "bitcoin";
  const showSui = kind === "sui";
  setImportFieldVisible($("importSolField"), showSol);
  setImportFieldVisible($("importEvmField"), showEvm);
  setImportFieldVisible($("importBtcField"), showBtc);
  setImportFieldVisible($("importSuiField"), showSui);
  // Never leave a cross-chain key sitting in a hidden input.
  if (!showSol && $("importSolSecret")) $("importSolSecret").value = "";
  if (!showEvm && $("importEvmSecret")) $("importEvmSecret").value = "";
  if (!showBtc && $("importBtcSecret")) $("importBtcSecret").value = "";
  if (!showSui && $("importSuiSecret")) $("importSuiSecret").value = "";
  const keyName = showSol
    ? "Solana secret"
    : showEvm
      ? "EVM private key"
      : showBtc
        ? "Bitcoin private key"
        : showSui
          ? "Sui private key"
          : "private key";
  const summary = $("importPanelSummary");
  if (summary) {
    summary.textContent =
      "Import seed / " + ((chain && chain.name) || "chain") + " key";
  }
  const note = $("importChainKeyNote");
  if (note) {
    note.hidden = false;
    note.style.display = "";
    if (showEvm) {
      note.textContent =
        "EVM chains: paste an EVM private key only. Solana secret import is hidden here.";
    } else if (showSol) {
      note.textContent =
        "Solana: paste a Solana secret key only. EVM private-key import is hidden here.";
    } else {
      note.textContent =
        "Private-key import is for " +
        ((chain && chain.name) || "this chain") +
        " only (" +
        keyName +
        "). Seed phrase still restores all chains.";
    }
  }
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
    type: "software",
    createdAt: new Date().toISOString(),
    mnemonic: keys.mnemonic,
    solana: keys.solana,
    evm: keys.evm,
    bitcoin: keys.bitcoin,
    sui: keys.sui,
  };
}

function normalizeAddrKey(kind, addr) {
  const a = String(addr || "").trim();
  if (!a) return "";
  if (kind === "evm" || kind === "sui") return kind + ":" + a.toLowerCase();
  return kind + ":" + a;
}

/** Stable address keys for an account (empty addresses ignored). */
function accountAddressKeys(account) {
  if (!account) return [];
  const out = [];
  const sol = account.solana && account.solana.publicKey;
  const evm = account.evm && account.evm.address;
  const btc = account.bitcoin && account.bitcoin.address;
  const sui = account.sui && account.sui.address;
  if (sol) out.push(normalizeAddrKey("solana", sol));
  if (evm) out.push(normalizeAddrKey("evm", evm));
  if (btc) out.push(normalizeAddrKey("bitcoin", btc));
  if (sui) out.push(normalizeAddrKey("sui", sui));
  return out;
}

function accountsShareAddress(a, b) {
  const keys = accountAddressKeys(a);
  if (!keys.length) return false;
  const set = new Set(keys);
  return accountAddressKeys(b).some((k) => set.has(k));
}

function findDuplicateAccount(candidate, accounts, exceptId) {
  const list = accounts || (STATE && STATE.accounts) || [];
  return (
    list.find(
      (a) => a && a.id !== exceptId && accountsShareAddress(a, candidate)
    ) || null
  );
}

function accountDedupeScore(a) {
  if (!a) return -1;
  let s = 0;
  if (a.mnemonic) s += 100;
  if (a.solana && a.solana.secretKey) s += 20;
  if (a.evm && a.evm.privateKey) s += 10;
  if (a.bitcoin && a.bitcoin.privateKey) s += 5;
  if (a.sui && a.sui.secretKey) s += 5;
  if (isLedgerAccount(a)) s += 15;
  const t = Date.parse(a.createdAt) || 0;
  if (t) s += 1; // prefer any dated account over undated
  return s;
}

/**
 * Collapse accounts that share any chain address. Keeps the richer / preferred copy.
 * Returns { accounts, removed }.
 */
function dedupeAccountsByAddress(accounts, preferredId) {
  const list = Array.isArray(accounts) ? accounts.slice() : [];
  const keep = [];
  const removed = [];
  for (const acc of list) {
    if (!acc) continue;
    if (!accountAddressKeys(acc).length) {
      keep.push(acc);
      continue;
    }
    let conflictIdx = -1;
    for (let i = 0; i < keep.length; i++) {
      if (accountsShareAddress(keep[i], acc)) {
        conflictIdx = i;
        break;
      }
    }
    if (conflictIdx < 0) {
      keep.push(acc);
      continue;
    }
    const existing = keep[conflictIdx];
    let winner = existing;
    let loser = acc;
    if (preferredId && acc.id === preferredId && existing.id !== preferredId) {
      winner = acc;
      loser = existing;
    } else if (
      preferredId &&
      existing.id === preferredId &&
      acc.id !== preferredId
    ) {
      winner = existing;
      loser = acc;
    } else if (accountDedupeScore(acc) > accountDedupeScore(existing)) {
      winner = acc;
      loser = existing;
    }
    keep[conflictIdx] = winner;
    removed.push(loser);
  }
  return { accounts: keep, removed };
}

function nextLedgerLabel() {
  const n =
    STATE.accounts.filter((a) => isLedgerAccount(a)).length + 1;
  return "Ledger " + n;
}

/** Generated software wallets: Account 1, Account 2… (not Ledger / Imported). */
function nextGeneratedAccountLabel(accounts) {
  const list = accounts || (STATE && STATE.accounts) || [];
  const used = new Set(
    list.map((a) => String((a && a.name) || "").trim().toLowerCase())
  );
  let n = 1;
  while (used.has("account " + n)) n += 1;
  return "Account " + n;
}

/** Rename legacy W1/W2 labels → Account 1/Account 2. Leave Ledger + Imported alone. */
function migrateGeneratedAccountNames(accounts) {
  let changed = false;
  (accounts || []).forEach((a) => {
    if (!a || isLedgerAccount(a)) return;
    const name = String(a.name || "").trim();
    if (/^imported\b/i.test(name)) return;
    const m = /^W(\d+)$/i.exec(name);
    if (!m) return;
    a.name = "Account " + m[1];
    changed = true;
  });
  return changed;
}

function accountDisplayName(account, idx) {
  if (account && account.name) return account.name;
  if (account && isLedgerAccount(account)) return "Ledger";
  return "Account " + ((idx != null ? idx : 0) + 1);
}

function nextLedgerAccountIndex() {
  const used = new Set(
    STATE.accounts
      .filter(isLedgerAccount)
      .map((a) => ledgerAccountIndex(a))
  );
  let i = 0;
  while (used.has(i)) i += 1;
  return i;
}

function friendlyLedgerErr(err, appName) {
  const msg = String(err && err.message ? err.message : err);
  const app = appName || "Solana";
  if (/denied|cancel|No device selected|Access denied to use Ledger/i.test(msg)) {
    return (
      "No Ledger selected — use USB (not Bluetooth), quit Ledger Live, unlock Nano + open " +
      app +
      " app, then Allow in the Chrome list."
    );
  }
  if (/already open|Failed to open|Unable to claim|transfer|NetworkError|DOMException/i.test(msg)) {
    return (
      "Ledger is busy — fully quit Ledger Live / other wallet apps, unplug & replug the Nano, then retry."
    );
  }
  if (/busy|locked|blind|CLA_NOT_SUPPORTED|0x6e00|0x6511|INS_NOT_SUPPORTED|0x6d00|6a80/i.test(msg)) {
    return "Unlock Ledger and open the " + app + " app (enable Blind signing for Ethereum sends), then retry";
  }
  if (/gesture|activation|NotAllowedError|user gesture/i.test(msg)) {
    return "Click again (browser needs a fresh click for USB)";
  }
  if (/NoDeviceFound|ListenTimeout|not supported/i.test(msg)) {
    return "No Ledger found — plug in via USB, unlock it, open the " + app + " app, then retry.";
  }
  return msg;
}

/** Link Ethereum / Polygon / Base / Robinhood ETH address from Ledger Ethereum app. */
async function linkLedgerEvm(account, opts) {
  const acc = account || activeAccount(STATE);
  if (!acc || !isLedgerAccount(acc)) {
    throw new Error("Select a Ledger account first");
  }
  const status = $("accountStatus");
  const ledgerStatus = $("ledgerConnectStatus");
  const setStatus = (msg) => {
    if (status) status.textContent = msg;
    if (ledgerStatus) ledgerStatus.textContent = msg;
  };
  const api = await ensureLedgerEthSupported();
  const accountIndex = ledgerAccountIndex(acc);
  showToast("Link EVM · open Ethereum app…");
  setStatus(
    "Open the Ethereum app on your Ledger (quit Ledger Live), then approve the address if asked."
  );
  let got;
  try {
    got = await api.getAddress(accountIndex, false);
  } catch (err) {
    console.warn("[ledger-eth-getAddress]", err);
    throw new Error(friendlyLedgerErr(err, "Ethereum"));
  }
  const address = got && got.address;
  if (!address) throw new Error("Ledger returned no Ethereum address");
  if (!acc.evm) acc.evm = { address: "", privateKey: "" };
  acc.evm.address = address;
  acc.evm.privateKey = "";
  if (!acc.ledger) acc.ledger = {};
  acc.ledger.evmPath = got.path || api.pathForIndex(accountIndex);
  acc.ledger.evmLinkedAt = new Date().toISOString();
  // Ensure empty bitcoin/sui slots exist for UI consistency
  if (!acc.bitcoin) acc.bitcoin = { address: "", privateKey: "", publicKey: "" };
  if (!acc.sui) acc.sui = { address: "", publicKey: "", secretKey: "" };
  await storageSet(STATE);
  paintActiveChainAddress();
  paintSwitchers();
  renderAccountsPanel();
  renderAcctDrawerList();
  showToast("EVM linked · " + shortAddr(address));
  setStatus(
    "EVM linked · " +
      shortAddr(address) +
      " — works on Ethereum, Polygon, Base, Robinhood ETH. Open Ethereum app to send."
  );
  if (!(opts && opts.skipRefresh)) await refreshAll();
  return acc;
}

async function connectLedgerAccount(opts) {
  const status = $("accountStatus");
  const ledgerStatus = $("ledgerConnectStatus");
  const setStatus = (msg) => {
    if (status) status.textContent = msg;
    if (ledgerStatus) ledgerStatus.textContent = msg;
  };
  const api = await ensureLedgerSupported();
  let accountIndex =
    opts && opts.accountIndex != null
      ? Number(opts.accountIndex)
      : Number(($("ledgerAccountIndex") && $("ledgerAccountIndex").value) || 0);
  if (!Number.isFinite(accountIndex) || accountIndex < 0) accountIndex = 0;
  accountIndex = Math.floor(accountIndex);
  showToast("Connect Ledger · open Solana app…");
  setStatus(
    "Unlock Ledger, open the Solana app, close Ledger Live, then pick your Nano in the Chrome prompt."
  );
  let got;
  try {
    // display=false first so connect doesn't stall waiting for on-device confirm
    got = await api.getAddress(accountIndex, false);
  } catch (err) {
    console.warn("[ledger-getAddress]", err);
    throw new Error(friendlyLedgerErr(err, "Solana"));
  }
  const publicKey = got && got.publicKey;
  if (!publicKey) throw new Error("Ledger returned no Solana address");
  const dup = STATE.accounts.find(
    (a) => a.solana && a.solana.publicKey === publicKey
  );
  if (dup) {
    STATE.activeAccountId = dup.id;
    if (!isLedgerAccount(dup)) {
      dup.type = "ledger";
      dup.ledger = {
        path: got.path || api.pathForIndex(accountIndex),
        accountIndex,
      };
      if (!String(dup.name || "").toLowerCase().includes("ledger")) {
        dup.name = nextLedgerLabel();
      }
    } else {
      dup.ledger = {
        path: got.path || api.pathForIndex(accountIndex),
        accountIndex,
        evmPath: (dup.ledger && dup.ledger.evmPath) || "",
        evmLinkedAt: (dup.ledger && dup.ledger.evmLinkedAt) || "",
      };
    }
    STATE.activeChainId = "solana";
    await storageSet(STATE);
    await ensureLedgerChainAllowed(dup);
    await refreshAll();
    showToast(
      "Ledger already linked · " +
        (dup.name || shortAddr(publicKey)) +
        (ledgerHasEvm(dup) ? " · EVM ready" : " · Solana ready")
    );
    setStatus(
      "Connected · " +
        (dup.name || shortAddr(publicKey)) +
        (ledgerHasEvm(dup)
          ? " · EVM linked"
          : " · Solana. Pick ETH/Polygon/Base later to link EVM.")
    );
    go("activity");
    return dup;
  }
  const label =
    (opts && opts.name && String(opts.name).trim()) || nextLedgerLabel();
  const acc = {
    id: uid(),
    name: label.slice(0, 32),
    type: "ledger",
    createdAt: new Date().toISOString(),
    mnemonic: "",
    ledger: {
      path: got.path || api.pathForIndex(accountIndex),
      accountIndex,
    },
    solana: { publicKey, secretKey: "" },
    evm: { address: "", privateKey: "" },
    bitcoin: { address: "", privateKey: "", publicKey: "" },
    sui: { address: "", publicKey: "", secretKey: "" },
  };
  STATE.accounts.push(acc);
  STATE.activeAccountId = acc.id;
  STATE.activeChainId = "solana";
  sanitizeLedgerAccounts(STATE.accounts);
  await storageSet(STATE);
  await ensureLedgerChainAllowed(acc);
  await refreshAll();
  hideBackup();
  paintLedgerSeedUi();
  showToast("Ledger connected · " + acc.name + " · Solana ready");
  setStatus(
    "Ledger linked as “" +
      acc.name +
      "” on Solana. To use ETH chains later, open the Ethereum app and pick Ethereum / Polygon / Base."
  );
  go("activity");
  return acc;
}

async function startLedgerConnectFlow() {
  const idxEl = $("ledgerAccountIndex");
  const accountIndex = Math.max(
    0,
    Math.floor(Number((idxEl && idxEl.value) || 0) || 0)
  );
  const ledgerStatus = $("ledgerConnectStatus");

  // Toolbar popup closes when Chrome shows the HID device chooser, so Ledger
  // pairing must finish in the detached wallet window (fresh click there).
  if (IS_EXTENSION_POPUP) {
    try {
      await chromeLocalSet({
        gladiator_ledger_connect: {
          at: Date.now(),
          accountIndex,
          needsClick: true,
        },
      });
    } catch (_) {}
    await openWalletWindowForWc({
      focus: true,
      settings: false,
      ledger: true,
    });
    showToast("Ledger tab opened → tap Connect Ledger");
    if (ledgerStatus) {
      ledgerStatus.textContent =
        "Opened Gladiator tab — unlock Ledger (USB), open Solana app, then tap Connect Ledger there and pick your device.";
    }
    return;
  }

  // Full wallet page / tab: WebHID must run from this click.
  try {
    await connectLedgerAccount({ accountIndex });
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    console.warn("[ledger-connect]", err);
    const needsTab =
      IS_EXTENSION &&
      /gesture|activation|NotAllowedError|must be handling a user gesture/i.test(
        msg
      );
    if (needsTab) {
      try {
        await chromeLocalSet({
          gladiator_ledger_connect: {
            at: Date.now(),
            accountIndex,
            needsClick: true,
          },
        });
      } catch (_) {}
      await openWalletWindowForWc({
        focus: true,
        settings: false,
        ledger: true,
      });
      showToast("Ledger tab opened → tap Connect Ledger");
      if (ledgerStatus) {
        ledgerStatus.textContent =
          "Opened Gladiator tab — unlock Ledger (USB), open Solana app, then tap Connect Ledger there and pick your device.";
      }
      return;
    }
    throw err;
  }
}

async function ensureState() {
  let state = await storageGet();
  if (!state || !Array.isArray(state.accounts) || !state.accounts.length) {
    const first = await createAccount(nextGeneratedAccountLabel([]));
    state = {
      accounts: [first],
      activeAccountId: first.id,
      activeChainId: "solana",
      solRpc: "",
      addressBook: [],
      wcProjectId: "",
    };
    // New wallets stay plaintext until the user sets a password (prompted on boot).
    await storageSet(state);
  }
  if (migrateGeneratedAccountNames(state.accounts)) {
    await storageSet(state);
  }
  if (sanitizeLedgerAccounts(state.accounts)) {
    await storageSet(state);
  }
  // Drop duplicate wallets that share any chain address (keep one unique copy).
  const deduped = dedupeAccountsByAddress(
    state.accounts,
    state.activeAccountId
  );
  if (deduped.removed.length) {
    state.accounts = deduped.accounts;
    console.info(
      "[dedupe] removed",
      deduped.removed.length,
      "duplicate wallet(s)"
    );
    await storageSet(state);
  }
  if (!CHAINS.some((c) => c.id === state.activeChainId)) state.activeChainId = "solana";
  if (!state.accounts.some((a) => a.id === state.activeAccountId)) {
    state.activeAccountId = state.accounts[0].id;
  }
  if (typeof state.solRpc !== "string") state.solRpc = "";
  if (typeof state.wcProjectId !== "string") state.wcProjectId = "";
  if (!Array.isArray(state.addressBook)) state.addressBook = [];
  // hiddenTokens keys are "chainId:mint" — absent means shown (default).
  if (!state.hiddenTokens || typeof state.hiddenTokens !== "object") {
    state.hiddenTokens = {};
  }
  if (!state.tokenCatalog || typeof state.tokenCatalog !== "object") {
    state.tokenCatalog = {};
  }

  // Legacy encrypted vault: require one-time password migrate, then plaintext.
  if (state.vault && state.vault.data && !stateHasPlainSecrets(state)) {
    state._needsVaultMigrate = true;
    state.vaultEnabled = true;
  } else {
    state._needsVaultMigrate = false;
    state.vaultEnabled = false;
    if (state.vault) {
      delete state.vault;
      await storageSet(state);
    }
    let repaired = false;
    for (const a of state.accounts) {
      if (repairAccountSolanaKeys(a)) repaired = true;
    }
    if (await repairAllExtraKeys(state)) repaired = true;
    if (repaired) await storageSet(state);
  }
  return state;
}

function openVaultModal(mode) {
  const modal = $("vaultModal");
  if (!modal) return;
  modal.hidden = false;
  modal.dataset.mode = "migrate";
  const title = $("vaultModalTitle");
  const body = $("vaultModalBody");
  const pass2Wrap = $("vaultPass2Wrap");
  const err = $("vaultModalError");
  const pass1 = $("vaultPass1");
  const pass2 = $("vaultPass2");
  if (err) err.textContent = "";
  if (pass1) pass1.value = "";
  if (pass2) pass2.value = "";
  if (title) title.textContent = "Restore wallet";
  if (body) {
    body.textContent =
      "Password encryption is paused. Enter your old password once to restore keys (then they stay unlocked on this device).";
  }
  if (pass2Wrap) pass2Wrap.hidden = true;
  requestAnimationFrame(() => {
    if (pass1) pass1.focus();
  });
}

function closeVaultModal() {
  const modal = $("vaultModal");
  if (modal) modal.hidden = true;
  const pass1 = $("vaultPass1");
  const pass2 = $("vaultPass2");
  if (pass1) pass1.value = "";
  if (pass2) pass2.value = "";
}

async function unlockVaultWithPassword(password) {
  const disk = await storageGet();
  if (!disk || !disk.vault) throw new Error("No encrypted vault found");
  const payload = await decryptVaultPayload(password, disk.vault);
  const secrets = payload && payload.secrets;
  if (!secrets) throw new Error("Vault is empty");
  STATE.accounts = applyAccountSecrets(disk.accounts || STATE.accounts, secrets);
  STATE.activeAccountId = disk.activeAccountId || STATE.activeAccountId;
  STATE._needsVaultMigrate = false;
  STATE.vaultEnabled = false;
  delete STATE.vault;
  if (await repairAllExtraKeys(STATE)) {
    /* persist below */
  }
  await storageSet(STATE);
  return true;
}

async function requireUnlocked(_reason) {
  if (isVaultLocked()) {
    openVaultModal("migrate");
    throw new Error("Enter your old password once to restore keys");
  }
  return true;
}

async function submitVaultModal() {
  const pass1 = (($("vaultPass1") && $("vaultPass1").value) || "").trim();
  const errEl = $("vaultModalError");
  if (errEl) errEl.textContent = "";
  if (!pass1) throw new Error("Enter a password");
  try {
    await unlockVaultWithPassword(pass1);
  } catch (_) {
    throw new Error("Wrong password");
  }
  closeVaultModal();
  showToast("Wallet restored — encryption off");
  paintSwitchers();
  renderAccountsPanel();
  await refreshBalance();
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
  if (short) short.textContent = shortAddrWide(addr) || "—";
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
    if (await ensureAccountSolanaFromMnemonic(a)) repaired = true;
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

/** If seed phrase exists but Solana secretKey was stripped, re-derive it. */
async function ensureAccountSolanaFromMnemonic(account) {
  if (!account) return false;
  if (account.solana && account.solana.secretKey) return false;
  const mnemonic = String(account.mnemonic || "").trim();
  if (!mnemonic) return false;
  if (!window.ethers || !window.SolanaHD) {
    console.warn("[ensure-sol-mnemonic] ethers/SolanaHD missing");
    return false;
  }
  try {
    const phrase = normalizeMnemonic(mnemonic);
    const m = ethers.Mnemonic.fromPhrase(phrase);
    const seed = ethers.getBytes(m.computeSeed());
    const solKp = await SolanaHD.deriveSolanaKeypair(seed, 0);
    if (!solKp || !solKp.secretKey) throw new Error("derive returned empty");
    account.solana = {
      ...(account.solana || {}),
      publicKey: Base58.encode(solKp.publicKey),
      secretKey: Base58.encode(solKp.secretKey),
    };
    return true;
  } catch (err) {
    console.warn("[ensure-sol-mnemonic]", err);
    return false;
  }
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

function go(panel, opts) {
  document.querySelectorAll(".panel").forEach((p) => {
    const on = p.dataset.panel === panel;
    p.hidden = !on;
    p.classList.toggle("is-active", on);
  });
  document.querySelectorAll(".dock-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.go === panel);
  });
  const skipScroll = !!(opts && opts.skipScroll);
  if (!skipScroll) {
    const stage = document.querySelector("body.is-extension .stage");
    if (stage) stage.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (panel === "receive") renderReceive();
  if (panel === "activity") {
    renderAccountsPanel();
    paintImportFields();
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
  if (panel === "token") {
    paintTokenDetail();
  }
}

function scrollSettingsTo(id) {
  const block = $(id);
  if (!block) return;
  const stage = document.querySelector("body.is-extension .stage");
  const run = () => {
    if (stage) {
      const blockTop = block.getBoundingClientRect().top;
      const stageTop = stage.getBoundingClientRect().top;
      const next = stage.scrollTop + (blockTop - stageTop) - 10;
      stage.scrollTo({ top: Math.max(0, next), behavior: "smooth" });
    } else if (block.scrollIntoView) {
      block.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  // Wait a tick so the settings panel is visible after go().
  requestAnimationFrame(() => setTimeout(run, 40));
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
let BALANCE = { native: 0, usd: 0, ok: false, error: "", chainId: "", accountId: "" };
let HOLDINGS = []; // [{symbol, name, mint, amount, decimals, usd, kind}]
let syncBusy = false;
let MINT_META = {}; // mint -> {symbol, name}
/** Currently open token detail page */
let TOKEN_DETAIL = null; // { holding, chainId, range }
let TOKEN_DETAIL_SEQ = 0;
const TOKEN_CHART_CACHE = new Map();
/** accountId -> { sol:number|null, loading:boolean, error:string } */
let ACCOUNT_SOL = {};
let accountBalSeq = 0;
let balanceSeq = 0;
/** Recent txs for History tab */
let TX_HISTORY = [];
let historySeq = 0;
/** Active “you received tokens” notice under total balance */
let RECEIVE_ALERT = null; // { text, symbols:[], at, accountId, chainId }
let receiveAlertTimer = null;
const RECEIVE_ALERT_MS = 3500;
const LOCAL_TX_KEY = "gladiator_local_txs_v1";
const HOLDINGS_SNAP_KEY = "gladiator_holdings_snap_v1";
const SWAP_PROGRAMS = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter v6
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", // Jupiter v4
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS", // Raydium route
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", // Orca Whirlpool
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // Raydium CLMM
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", // pump.fun
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // Pump AMM
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", // Meteora DLMM
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB", // Meteora pools
  "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN", // Meteora DBC
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", // Meteora DAMM v2
  "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY", // Phoenix
  "SoLFiHG9TfgtdUXUjWAxi3LtvYuFyDLVhBWxdMZxyCe", // SolFi
]);

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
/**
 * Native USD stablecoin per chain (Circle USDC where available).
 * Robinhood Chain has no USDC — official USD stablecoin is USDG.
 * Bitcoin L1 has no USD stablecoin contract.
 */
const CHAIN_USD_STABLE = {
  solana: {
    mint: USDC_MINT,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "usdc",
    kind: "spl",
    unitPrice: 1,
    cgId: "usd-coin",
  },
  ethereum: {
    mint: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "usdc",
    kind: "erc20",
    unitPrice: 1,
    cgId: "usd-coin",
  },
  polygon: {
    // Native Circle USDC (not USDC.e bridged)
    mint: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "usdc",
    kind: "erc20",
    unitPrice: 1,
    cgId: "usd-coin",
  },
  base: {
    mint: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "usdc",
    kind: "erc20",
    unitPrice: 1,
    cgId: "usd-coin",
  },
  sui: {
    mint:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "usdc",
    kind: "sui_coin",
    unitPrice: 1,
    cgId: "usd-coin",
  },
  robinhood: {
    // Robinhood Chain official USD stablecoin (no native USDC)
    mint: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
    logo: "usdc",
    kind: "erc20",
    unitPrice: 1,
    cgId: "global-dollar",
  },
};
MINT_META[USDC_MINT] = { symbol: "USDC", name: "USD Coin" };
MINT_META[WSOL_MINT] = { symbol: "SOL", name: "Wrapped SOL" };

function chainUsdStable(chainOrId) {
  const id =
    typeof chainOrId === "string"
      ? chainOrId
      : chainOrId && chainOrId.id
        ? chainOrId.id
        : "";
  return (id && CHAIN_USD_STABLE[id]) || null;
}

function normalizeTokenMintKey(mint, chainKind) {
  const m = String(mint || "").trim();
  if (!m) return "";
  // Sui coin types first (0x…::module::Struct) — never treat as EVM.
  if (chainKind === "sui" || (m.startsWith("0x") && m.includes("::"))) {
    const parts = m.split("::");
    if (parts.length >= 3 && /^0x[a-fA-F0-9]+$/i.test(parts[0])) {
      parts[0] = parts[0].toLowerCase();
      return parts.join("::");
    }
  }
  // EVM contract addresses only (40 hex chars)
  if (/^0x[a-fA-F0-9]{40}$/.test(m)) return m.toLowerCase();
  return m;
}

function isChainUsdStableMint(chainOrId, mint) {
  const s = chainUsdStable(chainOrId);
  if (!s || !mint) return false;
  const id =
    typeof chainOrId === "string"
      ? chainOrId
      : chainOrId && chainOrId.id
        ? chainOrId.id
        : "";
  const kind =
    (typeof chainOrId === "object" && chainOrId && chainOrId.kind) ||
    ((CHAINS.find((c) => c.id === id) || {}).kind);
  return (
    normalizeTokenMintKey(mint, kind) === normalizeTokenMintKey(s.mint, kind || s.kind)
  );
}

/** True only for the chain's known native USD stable mint (not symbol spoofs). */
function isUsdStableHolding(holding, chainOrId) {
  if (!holding || !holding.mint) return false;
  return isChainUsdStableMint(chainOrId || holding.chainId, holding.mint);
}

function usdStableHoldingRow(chain, amount) {
  const s = chainUsdStable(chain);
  if (!s) return null;
  const amt = Number(amount) || 0;
  const unit = s.unitPrice != null ? Number(s.unitPrice) : 1;
  return {
    chainId: chain.id,
    mint: s.mint,
    amount: amt,
    decimals: s.decimals,
    symbol: s.symbol,
    name: s.name,
    usd: amt * unit,
    kind: s.kind,
    logo: s.logo || "usdc",
  };
}

function parseEvmHexAmount(hex, decimals) {
  const dec = decimals != null ? Number(decimals) : 6;
  let h = String(hex == null ? "0x0" : hex);
  if (h === "" || h === "0x") h = "0x0";
  if (!h.startsWith("0x") && !h.startsWith("0X")) h = "0x" + h;
  try {
    if (window.ethers && ethers.formatUnits) {
      return Number(ethers.formatUnits(h, dec));
    }
  } catch (_) {}
  return formatTokenRawAmount(BigInt(h).toString(), dec);
}

/**
 * ERC-20 balanceOf via eth_call.
 * Returns a number on success, or null when all RPCs fail (do not treat as 0).
 */
async function fetchEvmErc20Balance(owner, token, decimals, rpcOrList) {
  const list = Array.isArray(rpcOrList)
    ? rpcOrList
    : [rpcOrList].filter(Boolean);
  if (!list.length || !owner || !token) return null;
  const ownerHex = String(owner).toLowerCase().replace(/^0x/, "");
  const data = "0x70a08231" + ownerHex.padStart(64, "0");
  const to = String(token).toLowerCase();
  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status + " @ " + rpc);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || "eth_call");
      if (j.result == null) throw new Error("empty eth_call result");
      return parseEvmHexAmount(j.result, decimals);
    } catch (err) {
      lastErr = err;
      console.warn("[erc20-balance]", rpc, err && err.message ? err.message : err);
    }
  }
  if (lastErr) console.warn("[erc20-balance] all rpcs failed", lastErr);
  return null;
}

/** Returns number on success, null on failure. */
async function fetchSuiCoinBalance(owner, coinType, decimals, rpcs) {
  if (!owner || !coinType) return null;
  try {
    const result = await suiRpcCall(
      "suix_getBalance",
      [owner, coinType],
      rpcs
    );
    const raw = (result && result.totalBalance) || "0";
    return formatTokenRawAmount(raw, decimals != null ? decimals : 6);
  } catch (err) {
    console.warn("[sui-usdc]", err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Ensure the chain's native USD stablecoin is present in holdings (even at 0).
 * Prefers live RPC balance; falls back to scanner amount; placeholder 0 only when unknown.
 */
async function ensureChainUsdStableHolding(chain, owner, tokens) {
  const s = chainUsdStable(chain);
  if (!s) return Array.isArray(tokens) ? tokens.slice() : [];
  const list = Array.isArray(tokens) ? tokens.slice() : [];
  const kind = chain.kind || s.kind;
  const mintKey = normalizeTokenMintKey(s.mint, kind);

  // Dedupe casing variants (esp. Sui coin types); keep the last match.
  let idx = -1;
  let scannedAmt = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i];
    if (!row || !row.mint) continue;
    if (normalizeTokenMintKey(row.mint, kind) !== mintKey) continue;
    const amt = Number(row.amount);
    if (Number.isFinite(amt)) {
      scannedAmt = scannedAmt == null ? amt : Math.max(scannedAmt, amt);
    }
    if (idx < 0) {
      idx = i;
    } else {
      list.splice(i, 1);
      if (idx > i) idx -= 1;
    }
  }

  let fetched = null;
  try {
    if (chain.kind === "evm") {
      fetched = await fetchEvmErc20Balance(
        owner,
        s.mint,
        s.decimals,
        chain.rpcs || [chain.rpc]
      );
    } else if (chain.kind === "sui") {
      fetched = await fetchSuiCoinBalance(
        owner,
        s.mint,
        s.decimals,
        chain.rpcs || [chain.rpc]
      );
    }
  } catch (_) {
    fetched = null;
  }

  let amount = 0;
  if (fetched != null && Number.isFinite(Number(fetched))) {
    amount = Number(fetched);
  } else if (scannedAmt != null && Number.isFinite(scannedAmt)) {
    amount = scannedAmt;
  } else {
    amount = 0; // always-show placeholder when both RPC + scanner unknown
  }

  const base = usdStableHoldingRow(chain, amount);
  const merged =
    idx >= 0
      ? {
          ...list[idx],
          ...base,
          mint: s.mint,
          amount: Number(amount) || 0,
          usd: base.usd,
          logo: s.logo || "usdc",
          symbol: s.symbol,
          name: s.name,
        }
      : base;
  if (idx >= 0) list[idx] = merged;
  else list.unshift(merged);
  return list;
}

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
        chainId: "solana",
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
          chainId: "solana",
          mint,
          amount: amount || 0,
          decimals: Number(ta.decimals || 0),
          symbol: meta.symbol || "TOKEN",
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
              symbol: "TOKEN",
              name: "Unknown token",
              partial: true,
            };
          }
          return;
        }
        MINT_META[mint] = {
          symbol: hit.symbol || hit.ticker || "TOKEN",
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

function tokenVisibilityKey(chainId, mint) {
  return String(chainId || "") + ":" + String(mint || "").toLowerCase();
}

function isTokenHidden(chainId, mint) {
  if (!mint) return false;
  const map = (STATE && STATE.hiddenTokens) || {};
  return !!map[tokenVisibilityKey(chainId, mint)];
}

async function setTokenHidden(chainId, mint, hidden) {
  if (!mint || !STATE) return;
  if (!STATE.hiddenTokens || typeof STATE.hiddenTokens !== "object") {
    STATE.hiddenTokens = {};
  }
  const key = tokenVisibilityKey(chainId, mint);
  if (hidden) STATE.hiddenTokens[key] = true;
  else delete STATE.hiddenTokens[key];
  await storageSet(STATE);
}

function mergeTokenCatalog(holdings) {
  if (!STATE) return;
  if (!STATE.tokenCatalog || typeof STATE.tokenCatalog !== "object") {
    STATE.tokenCatalog = {};
  }
  let changed = false;
  for (const h of holdings || []) {
    if (!h || h.kind === "native" || !h.mint) continue;
    const chainId = h.chainId || (STATE && STATE.activeChainId) || "";
    const key = tokenVisibilityKey(chainId, h.mint);
    const next = {
      chainId,
      mint: h.mint,
      symbol: h.symbol || "TOKEN",
      name: h.name || h.symbol || "Token",
      kind: h.kind || "erc20",
      logo: h.logo || null,
      decimals: h.decimals != null ? h.decimals : 18,
    };
    const prev = STATE.tokenCatalog[key];
    if (
      !prev ||
      prev.symbol !== next.symbol ||
      prev.name !== next.name ||
      prev.logo !== next.logo
    ) {
      STATE.tokenCatalog[key] = next;
      changed = true;
    }
  }
  if (changed) storageSet(STATE).catch(() => {});
}

function formatTokenRawAmount(raw, decimals) {
  try {
    if (window.ethers && ethers.formatUnits) {
      return Number(ethers.formatUnits(String(raw || "0"), Number(decimals) || 18));
    }
  } catch (_) {}
  try {
    const d = Math.max(0, Math.min(36, Number(decimals) || 18));
    const s = String(raw || "0").replace(/^0x/i, "");
    const bi = BigInt(s.startsWith("-") ? s : s || "0");
    const base = 10n ** BigInt(d);
    const whole = bi / base;
    const frac = bi % base;
    return Number(whole) + Number(frac) / Number(base);
  } catch (_) {
    return 0;
  }
}

/** ERC-20 balances via Blockscout (Robinhood / ETH / Base / Polygon). */
async function fetchEvmTokenHoldings(address, chain) {
  const base = String((chain && chain.blockscout) || "").replace(/\/$/, "");
  if (!base || !address) return [];
  const out = [];
  const seen = new Set();

  // Prefer REST v2 (richer metadata), fall back to legacy tokenlist.
  let url =
    base + "/api/v2/addresses/" + encodeURIComponent(address) + "/tokens?type=ERC-20";
  try {
    for (let page = 0; page < 4 && url; page++) {
      const res = await fetch(url);
      if (!res.ok) throw new Error("blockscout http " + res.status);
      const j = await res.json();
      const items = Array.isArray(j.items) ? j.items : [];
      for (const item of items) {
        const tok = (item && item.token) || {};
        const mint = String(
          tok.address_hash || tok.address || item.token_address || ""
        ).toLowerCase();
        if (!mint || !/^0x[a-f0-9]{40}$/.test(mint) || seen.has(mint)) continue;
        seen.add(mint);
        const decimals = Number(tok.decimals != null ? tok.decimals : 18) || 18;
        const amount = formatTokenRawAmount(item.value || "0", decimals);
        if (!(amount > 0)) continue;
        const px = tok.exchange_rate != null ? Number(tok.exchange_rate) : null;
        out.push({
          chainId: chain.id,
          mint,
          amount,
          decimals,
          symbol: tok.symbol || "TOKEN",
          name: tok.name || tok.symbol || "Token",
          logo: tok.icon_url || null,
          usd: px != null && !Number.isNaN(px) ? amount * px : null,
          kind: "erc20",
        });
      }
      const next = j.next_page_params;
      if (!next || typeof next !== "object") {
        url = "";
        break;
      }
      const qs = Object.keys(next)
        .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(next[k]))
        .join("&");
      url =
        base +
        "/api/v2/addresses/" +
        encodeURIComponent(address) +
        "/tokens?type=ERC-20&" +
        qs;
    }
    if (out.length) return out;
  } catch (err) {
    console.warn("[evm-tokens v2]", chain && chain.id, err && err.message ? err.message : err);
  }

  try {
    const legacy =
      base +
      "/api?module=account&action=tokenlist&address=" +
      encodeURIComponent(address);
    const res = await fetch(legacy);
    if (!res.ok) throw new Error("tokenlist http " + res.status);
    const j = await res.json();
    const list = Array.isArray(j.result) ? j.result : [];
    for (const row of list) {
      const mint = String(row.contractAddress || row.contractaddress || "")
        .toLowerCase();
      if (!mint || !/^0x[a-f0-9]{40}$/.test(mint) || seen.has(mint)) continue;
      seen.add(mint);
      const decimals = Number(row.decimals != null ? row.decimals : 18) || 18;
      const amount = formatTokenRawAmount(row.balance || row.value || "0", decimals);
      if (!(amount > 0)) continue;
      out.push({
        chainId: chain.id,
        mint,
        amount,
        decimals,
        symbol: row.symbol || "TOKEN",
        name: row.name || row.symbol || "Token",
        logo: null,
        usd: null,
        kind: "erc20",
      });
    }
  } catch (err) {
    console.warn("[evm-tokens legacy]", chain && chain.id, err && err.message ? err.message : err);
  }
  return out;
}

function visibleHoldings(holdings, chain) {
  const c = chain || activeChain(STATE);
  const cid = c && c.id;
  return (holdings || HOLDINGS || []).filter((h) => {
    if (!h) return false;
    // Require matching chainId so leftovers never flash on another network.
    if (cid && h.chainId !== cid) return false;
    if (h.kind === "native" || !h.mint) return true;
    return !isTokenHidden(h.chainId || cid, h.mint);
  });
}

/** Highest holdings first: USD value, then token amount. */
function sortHoldingsByAmount(rows) {
  return (rows || []).slice().sort((a, b) => {
    const usdA = Number(a && a.usd);
    const usdB = Number(b && b.usd);
    const aUsd = Number.isFinite(usdA) ? usdA : 0;
    const bUsd = Number.isFinite(usdB) ? usdB : 0;
    if (bUsd !== aUsd) return bUsd - aUsd;
    const amtA = Number(a && a.amount) || 0;
    const amtB = Number(b && b.amount) || 0;
    if (amtB !== amtA) return amtB - amtA;
    return String((a && a.symbol) || "").localeCompare(String((b && b.symbol) || ""));
  });
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

function setSyncButtonsBusy(busy) {
  ["refreshBtn", "settingsSyncBtn"].forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle("is-syncing", !!busy);
    btn.setAttribute("aria-busy", busy ? "true" : "false");
  });
}

async function runManualSync() {
  if (syncBusy) {
    showToast("Already syncing…");
    return;
  }
  syncBusy = true;
  setSyncButtonsBusy(true);
  const statusEl = $("balanceStatus");
  const chain = activeChain(STATE);
  if (statusEl) statusEl.textContent = "Syncing " + ((chain && chain.name) || "network") + "…";
  showToast("Syncing…");
  try {
    // Prices first (soft-fail); keep current balances on screen while RPC runs.
    await fetchPrices();
    await refreshBalance({ keepUi: true });
    if (BALANCE.ok && !BALANCE.error) showToast("Synced");
    else if (BALANCE.ok && BALANCE.error)
      showToast("Sync failed · showing last balance");
    else showToast("Sync failed");
  } catch (err) {
    console.warn("[manual-sync]", err);
    showToast(String(err && err.message ? err.message : err) || "Sync failed");
  } finally {
    syncBusy = false;
    setSyncButtonsBusy(false);
  }
}

async function refreshBalance(opts) {
  const seq = ++balanceSeq;
  const chain = activeChain(STATE);
  const acc = activeAccount(STATE);
  if (acc) repairAccountSolanaKeys(acc);
  const addr = chainKeyAddress(acc, chain);
  const displayAddr = addressFor(acc, chain);
  const statusEl = $("balanceStatus");
  const accountId = (acc && acc.id) || "";
  const stillCurrent = () =>
    seq === balanceSeq &&
    STATE &&
    STATE.activeChainId === chain.id &&
    STATE.activeAccountId === (acc && acc.id);

  const sameContext =
    BALANCE &&
    BALANCE.ok &&
    BALANCE.chainId === chain.id &&
    BALANCE.accountId === accountId &&
    Array.isArray(HOLDINGS) &&
    HOLDINGS.length > 0;
  // Keep last good balances while re-syncing the same wallet/chain (Sync button).
  // Only clear when switching account/chain, first load, or caller forces it.
  const keepUi =
    sameContext && !(opts && opts.resetUi) && !(opts && opts.keepUi === false);

  if (stillCurrent()) {
    if (!keepUi) {
      BALANCE = {
        native: 0,
        usd: 0,
        ok: false,
        error: "",
        chainId: chain.id,
        accountId,
      };
      HOLDINGS = [];
      paintBalances();
      paintHoldings();
    }
    if (statusEl) statusEl.textContent = "Syncing " + chain.name + "…";
  }

  const commit = (nextBalance, nextHoldings, statusText) => {
    if (!stillCurrent()) return false;
    BALANCE = { ...nextBalance, accountId };
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
    let nextBalance = {
      native: 0,
      usd: 0,
      ok: false,
      error: "",
      chainId: chain.id,
      accountId,
    };

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
      const other = spl.filter((row) => row.mint !== USDC_MINT && row.amount > 0);
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
      nextHoldings = sortHoldingsByAmount(
        [
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
        ].filter(Boolean)
      );
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
      let suiCoins = [];
      try {
        suiCoins = await fetchSuiTokenHoldings(addr, chain.rpcs || [chain.rpc]);
      } catch (err) {
        console.warn("[sui-tokens]", err);
        suiCoins = [];
      }
      if (!stillCurrent()) return;
      const stable = chainUsdStable(chain);
      suiCoins = (suiCoins || []).filter((row) => {
        if (!row) return false;
        if (stable && isChainUsdStableMint(chain, row.mint)) return true;
        return Number(row.amount) > 0;
      });
      suiCoins = await ensureChainUsdStableHolding(chain, addr, suiCoins);
      if (!stillCurrent()) return;
      const px = PRICES[chain.priceId] || 0;
      const other = (suiCoins || []).filter(
        (row) => row && !isChainUsdStableMint(chain, row.mint) && Number(row.amount) > 0
      );
      const usdc = (suiCoins || []).find((row) => isChainUsdStableMint(chain, row.mint));
      const tokenUsd =
        (usdc ? Number(usdc.usd) || Number(usdc.amount) || 0 : 0) +
        other.reduce((s, row) => s + (Number(row.usd) || 0), 0);
      nextBalance = {
        native,
        usd: native * px + tokenUsd,
        ok: true,
        error: "",
        chainId: chain.id,
      };
      nextHoldings = sortHoldingsByAmount(
        [nativeHoldingRow(chain, native, native * px), usdc, ...other].filter(Boolean)
      );
    } else {
      if (!addr) throw new Error("No EVM address on this account.");
      native = await fetchEvmBalance(addr, chain.rpcs || [chain.rpc]);
      if (!stillCurrent()) return;
      let erc20 = [];
      try {
        erc20 = await fetchEvmTokenHoldings(addr, chain);
      } catch (err) {
        console.warn("[evm-tokens]", err);
        erc20 = [];
      }
      if (!stillCurrent()) return;
      const stable = chainUsdStable(chain);
      erc20 = (erc20 || []).filter((row) => {
        if (!row) return false;
        if (stable && isChainUsdStableMint(chain, row.mint)) return true;
        return Number(row.amount) > 0;
      });
      erc20 = await ensureChainUsdStableHolding(chain, addr, erc20);
      if (!stillCurrent()) return;
      const px = PRICES[chain.priceId] || 0;
      const other = (erc20 || []).filter(
        (row) => row && !isChainUsdStableMint(chain, row.mint) && Number(row.amount) > 0
      );
      const usdc = (erc20 || []).find((row) => isChainUsdStableMint(chain, row.mint));
      const tokenUsd =
        (usdc ? Number(usdc.usd) || Number(usdc.amount) || 0 : 0) +
        other.reduce((s, row) => s + (Number(row.usd) || 0), 0);
      nextBalance = {
        native,
        usd: native * px + tokenUsd,
        ok: true,
        error: "",
        chainId: chain.id,
      };
      nextHoldings = sortHoldingsByAmount(
        [nativeHoldingRow(chain, native, native * px), usdc, ...other].filter(Boolean)
      );
    }

    mergeTokenCatalog(nextHoldings);

    const shown = visibleHoldings(nextHoldings, chain);
    const shownUsd = shown.reduce((s, row) => s + (Number(row.usd) || 0), 0);
    nextBalance = {
      ...nextBalance,
      usd: shownUsd,
    };

    const statusText =
      "Synced · " +
      chain.name +
      " " +
      shortAddr(addr || displayAddr) +
      " · " +
      shown.length +
      " assets";
    if (commit(nextBalance, nextHoldings, statusText)) {
      if (acc && chain.kind === "solana" && nextBalance.ok) {
        ACCOUNT_SOL[acc.id] = { sol: Number(nextBalance.native) || 0, loading: false, error: "" };
      }
      paintManageTokens();
      if (acc && nextBalance.ok) {
        maybeNotifyReceives(acc.id, chain.id, nextHoldings);
      }
    }
  } catch (err) {
    if (!stillCurrent()) return;
    const msg = String(err && err.message ? err.message : err);
    // Keep the last good numbers if this was a re-sync of the same wallet/chain.
    if (keepUi && sameContext) {
      BALANCE = { ...BALANCE, error: msg, chainId: chain.id, accountId };
      if (statusEl) statusEl.textContent = "RPC error: " + msg + " · showing last balance";
      return;
    }
    const nextBalance = {
      native: 0,
      usd: 0,
      ok: false,
      error: msg,
      chainId: chain.id,
      accountId,
    };
    const stableRow = usdStableHoldingRow(chain, 0);
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
            stableRow || {
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
        : [nativeHoldingRow(chain, 0, 0), stableRow].filter(Boolean);
    commit(nextBalance, nextHoldings, "RPC error: " + msg);
  }
}

function loadHoldingsSnaps() {
  try {
    const raw = localStorage.getItem(HOLDINGS_SNAP_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (_) {
    return {};
  }
}

function saveHoldingsSnaps(map) {
  try {
    localStorage.setItem(HOLDINGS_SNAP_KEY, JSON.stringify(map || {}));
  } catch (_) {}
}

function holdingsSnapKey(accountId, chainId) {
  return String(accountId || "") + ":" + String(chainId || "");
}

function formatReceiveQty(n) {
  const abs = Math.abs(Number(n) || 0);
  if (abs >= 1000) return abs.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1) return abs.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (abs >= 0.0001) return abs.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return abs.toPrecision(3);
}

/**
 * Compare current holdings to last snapshot for this wallet+chain.
 * First sync only baselines (no alert). Later increases = received.
 */
function detectAndRecordReceives(accountId, chainId, holdings) {
  if (!accountId || !chainId) return [];
  const key = holdingsSnapKey(accountId, chainId);
  const snaps = loadHoldingsSnaps();
  const prev = snaps[key] && typeof snaps[key] === "object" ? snaps[key] : null;
  const next = {};
  for (const h of holdings || []) {
    if (!h) continue;
    const id = h.mint ? String(h.mint).toLowerCase() : "__native__";
    next[id] = Number(h.amount) || 0;
  }
  const received = [];
  if (prev) {
    for (const id of Object.keys(next)) {
      const before = Number(prev[id]) || 0;
      const after = Number(next[id]) || 0;
      const delta = after - before;
      const minDelta = id === "__native__" ? 1e-8 : 1e-12;
      if (!(delta > minDelta)) continue;
      const h = (holdings || []).find((row) => {
        const rid = row.mint ? String(row.mint).toLowerCase() : "__native__";
        return rid === id;
      });
      const chain = CHAINS.find((c) => c.id === chainId);
      received.push({
        mint: id === "__native__" ? null : id,
        symbol:
          (h && h.symbol) ||
          (id === "__native__" ? (chain && chain.symbol) || "COIN" : "TOKEN"),
        amount: delta,
        isNew: !Object.prototype.hasOwnProperty.call(prev, id),
        kind: (h && h.kind) || (id === "__native__" ? "native" : "token"),
      });
    }
  }
  snaps[key] = next;
  // Cap stored keys
  const keys = Object.keys(snaps);
  if (keys.length > 80) {
    keys.slice(0, keys.length - 80).forEach((k) => delete snaps[k]);
  }
  saveHoldingsSnaps(snaps);
  return received;
}

function receiveAlertText(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  // Prefer token receives in the headline; include native if that's all we got.
  const tokens = list.filter((x) => x.kind !== "native");
  const use = tokens.length ? tokens : list;
  if (use.length === 1) {
    const r = use[0];
    return (
      "Received " +
      formatReceiveQty(r.amount) +
      " " +
      (r.symbol || "TOKEN") +
      (r.isNew && r.kind !== "native" ? " · new token" : "")
    );
  }
  if (use.length === 2) {
    return (
      "Received " +
      (use[0].symbol || "TOKEN") +
      " + " +
      (use[1].symbol || "TOKEN")
    );
  }
  return "Received " + use.length + " tokens";
}

function dismissReceiveAlert() {
  if (receiveAlertTimer) {
    clearTimeout(receiveAlertTimer);
    receiveAlertTimer = null;
  }
  RECEIVE_ALERT = null;
  paintReceiveAlert();
  paintBalances();
}

function scheduleReceiveAlertDismiss() {
  if (receiveAlertTimer) clearTimeout(receiveAlertTimer);
  receiveAlertTimer = setTimeout(() => {
    receiveAlertTimer = null;
    RECEIVE_ALERT = null;
    paintReceiveAlert();
    paintBalances();
  }, RECEIVE_ALERT_MS);
}

function paintReceiveAlert() {
  const note = $("balanceReceiveNote");
  const text = $("balanceReceiveText");
  if (!note) return;
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const stillRelevant =
    RECEIVE_ALERT &&
    acc &&
    chain &&
    RECEIVE_ALERT.accountId === acc.id &&
    RECEIVE_ALERT.chainId === chain.id &&
    Date.now() - (RECEIVE_ALERT.at || 0) < RECEIVE_ALERT_MS + 250;
  if (!stillRelevant || !RECEIVE_ALERT.text) {
    note.hidden = true;
    if (text) text.textContent = "";
    return;
  }
  if (text) text.textContent = RECEIVE_ALERT.text;
  note.hidden = false;
}

function maybeNotifyReceives(accountId, chainId, holdings) {
  const received = detectAndRecordReceives(accountId, chainId, holdings);
  if (!received.length) {
    paintReceiveAlert();
    return;
  }
  // Prefer highlighting token inflows in the balance area.
  const tokens = received.filter((r) => r.kind !== "native");
  const focus = tokens.length ? tokens : received;
  const text = receiveAlertText(focus);
  RECEIVE_ALERT = {
    text,
    symbols: focus.map((r) => r.symbol).filter(Boolean),
    items: focus,
    at: Date.now(),
    accountId,
    chainId,
  };
  paintReceiveAlert();
  scheduleReceiveAlertDismiss();
  showToast(text);
  const delta = $("dayDelta");
  if (delta) {
    delta.textContent =
      focus.length === 1
        ? "received · " + (focus[0].symbol || "token")
        : "received · " + focus.length + " tokens";
    delta.className = "delta up";
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
  const ledgerTag = $("ledgerBalanceTag");
  const acc = activeAccount(STATE);
  if (ledgerTag) ledgerTag.hidden = !isLedgerAccount(acc);
  if (badge) badge.textContent = chain.name;
  if (sym) sym.textContent = chain.symbol;
  if (solLogo) {
    const logo = chain.logo || "solana";
    solLogo.hidden = false;
    solLogo.src = "./icons/" + logo + ".png?v=" + LOGO_ICON_VER;
    solLogo.alt = chain.symbol || "";
  }
  const vis = visibleHoldings(HOLDINGS, chain);
  const usd = vis.reduce((s, h) => s + (Number(h.usd) || 0), 0);
  if (fiat) fiat.textContent = (BALANCE.ok ? usd : BALANCE.usd || 0).toFixed(2);
  const digits =
    chain.kind === "bitcoin" ? 8 : chain.kind === "solana" || chain.kind === "sui" ? 4 : 5;
  if (native) native.textContent = Number(BALANCE.native || 0).toFixed(digits);
  const alertActive =
    RECEIVE_ALERT &&
    acc &&
    chain &&
    RECEIVE_ALERT.accountId === acc.id &&
    RECEIVE_ALERT.chainId === chain.id &&
    Date.now() - (RECEIVE_ALERT.at || 0) < RECEIVE_ALERT_MS;
  if (delta) {
    if (alertActive && RECEIVE_ALERT.symbols && RECEIVE_ALERT.symbols.length) {
      delta.textContent =
        RECEIVE_ALERT.symbols.length === 1
          ? "received · " + RECEIVE_ALERT.symbols[0]
          : "received · " + RECEIVE_ALERT.symbols.length + " tokens";
      delta.className = "delta up";
    } else {
      const tokN = vis.filter(
        (h) =>
          (h.kind === "spl" || h.kind === "erc20" || h.kind === "sui_coin") &&
          Number(h.amount) > 0
      ).length;
      delta.textContent = BALANCE.ok
        ? tokN
          ? "on-chain · " + tokN + " token" + (tokN === 1 ? "" : "s")
          : "on-chain"
        : chain.kind === "solana"
          ? "Solana sync failed — check Helius in Advanced · RPC"
          : chain.name + " sync failed — retry Sync";
      delta.className = "delta " + (BALANCE.ok ? "up" : "");
    }
  }
  paintReceiveAlert();
}

function chainLogoSrc(chainOrLogo) {
  const logo =
    typeof chainOrLogo === "string"
      ? chainOrLogo
      : (chainOrLogo && (chainOrLogo.logo || chainOrLogo.id)) || "solana";
  const file = String(logo || "solana").replace(/[^a-z0-9_-]/gi, "") || "solana";
  return extAssetUrl("icons/" + file + ".png") + "?v=" + LOGO_ICON_VER;
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
  if (isUsdStableHolding(t, t.chainId) || t.mint === USDC_MINT) {
    key = "usdc";
  }
  if (key && localLogos[key]) {
    const file = localLogos[key];
    return (
      '<img class="token-logo-img" src="' +
      extAssetUrl("icons/" + file + ".png") +
      "?v=" +
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

  // Never paint another chain's leftovers while switching; respect Manage tokens hides.
  // Always show highest value/amount first. Do not mutate global HOLDINGS here.
  let rows = sortHoldingsByAmount(visibleHoldings(HOLDINGS, chain));
  const stable = chainUsdStable(chain);
  const hasStable = rows.some((r) => r && isChainUsdStableMint(chain, r.mint));
  if (!rows.length) {
    rows = [nativeHoldingRow(chain, 0, 0)];
    if (stable && !isTokenHidden(chain.id, stable.mint)) {
      rows.push(usdStableHoldingRow(chain, 0));
    }
  } else if (
    stable &&
    !hasStable &&
    !isTokenHidden(chain.id, stable.mint)
  ) {
    // Display-only placeholder until refreshBalance commits the real row.
    rows = sortHoldingsByAmount([...rows, usdStableHoldingRow(chain, 0)]);
  }

  rows.forEach((t) => {
    const li = document.createElement("li");
    // Name + token amount + USD only — never wallet/mint addresses.
    const displayName = holdingDisplayName(t, chain);
    const symbol = holdingDisplaySymbol(t);
    const usdLabel =
      t.usd != null && !Number.isNaN(Number(t.usd))
        ? "$" +
          Number(t.usd).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: Number(t.usd) < 1 ? 4 : 2,
          })
        : "—";
    const qty =
      Number(t.amount) >= 1
        ? Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })
        : Number(t.amount).toFixed(6);
    const amtLabel = qty + (symbol && symbol !== "TOKEN" ? " " + symbol : "");
    li.innerHTML =
      '<button type="button" class="token-row" data-mint="' +
      (t.mint || "native") +
      '" title="' +
      escapeHtml(displayName) +
      '">' +
      '<span class="token-logo">' +
      tokenLogoHtml(t) +
      "</span>" +
      '<span class="token-meta"><strong>' +
      escapeHtml(displayName) +
      "</strong></span>" +
      '<span class="token-vals"><strong>' +
      escapeHtml(amtLabel) +
      "</strong><span>" +
      usdLabel +
      "</span></span></button>";
    li.querySelector("button")?.addEventListener("click", () => {
      openTokenDetail(t);
    });
    list.appendChild(li);
  });

  const count = $("tokenCount");
  if (count) {
    const tokN = rows.filter(
      (h) =>
        (h.kind === "spl" || h.kind === "erc20" || h.kind === "sui_coin") &&
        Number(h.amount) > 0
    ).length;
    count.textContent = tokN
      ? rows.length + " assets · " + tokN + " token" + (tokN === 1 ? "" : "s")
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
  if (fee) {
    fee.textContent = chain.name || "selected chain";
  }
  updateSendUsdEstimate();
  paintSendAvailable();
}

function formatUsdMoney(n, opts) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  const digits =
    opts && opts.digits != null
      ? opts.digits
      : abs >= 1000
        ? 2
        : abs >= 1
          ? 2
          : abs >= 0.01
            ? 4
            : 6;
  return (
    "$" +
    v.toLocaleString(undefined, {
      minimumFractionDigits: Math.min(2, digits),
      maximumFractionDigits: digits,
    })
  );
}

function formatTokenUnitPrice(n) {
  if (n == null || !(Number(n) >= 0) || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v === 0) return "$0.00";
  if (v >= 1000) return formatUsdMoney(v, { digits: 2 });
  if (v >= 1) return "$" + v.toFixed(4).replace(/\.?0+$/, "");
  if (v >= 0.01) return "$" + v.toFixed(6).replace(/\.?0+$/, "");
  return "$" + Number(v.toPrecision(4)).toString();
}

function formatCompactUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return "$" + (v / 1e3).toFixed(2) + "K";
  return formatUsdMoney(v, { digits: 2 });
}

function geckoNetworkForChain(chain) {
  if (!chain) return "";
  if (chain.kind === "solana") return "solana";
  if (chain.id === "ethereum") return "eth";
  if (chain.id === "polygon") return "polygon_pos";
  if (chain.id === "base") return "base";
  if (chain.id === "robinhood") return "robinhood";
  if (chain.kind === "sui") return "sui-network";
  return "";
}

function coingeckoPlatformForChain(chain) {
  if (!chain) return "";
  if (chain.kind === "solana") return "solana";
  if (chain.id === "ethereum" || chain.id === "robinhood") return "ethereum";
  if (chain.id === "polygon") return "polygon-pos";
  if (chain.id === "base") return "base";
  if (chain.kind === "sui") return "sui";
  return "";
}

function openTokenDetail(holding) {
  const chain = activeChain(STATE);
  if (!holding) return;
  TOKEN_DETAIL = {
    holding: { ...holding },
    chainId: chain.id,
    range: (TOKEN_DETAIL && TOKEN_DETAIL.range) || "1D",
  };
  go("token");
}

function selectSendAssetForHolding(holding) {
  const sel = $("sendAsset");
  if (!sel || !holding) return;
  const val = holding.mint || "native";
  if (![...sel.options].some((o) => o.value === val)) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent =
      (holding.symbol || "TOKEN") +
      " · " +
      Number(holding.amount || 0).toFixed(4) +
      " available";
    sel.appendChild(opt);
  }
  sel.value = val;
  updateSendUsdEstimate();
  paintSendAvailable();
}

function tokenDetailUnitPrice(holding, chain) {
  if (!holding) return null;
  if (isUsdStableHolding(holding, chain || holding.chainId) || holding.mint === USDC_MINT) {
    return 1;
  }
  if (Number(holding.amount) > 0 && holding.usd != null && Number(holding.usd) >= 0) {
    return Number(holding.usd) / Number(holding.amount);
  }
  if (holding.kind === "native" && chain) {
    const px = Number(PRICES[chain.priceId]);
    return px > 0 ? px : null;
  }
  const meta = holding.mint && MINT_META[holding.mint];
  if (meta && meta.usdPrice != null) return Number(meta.usdPrice);
  return null;
}

function pctChange(points) {
  if (!points || points.length < 2) return null;
  const a = Number(points[0].price);
  const b = Number(points[points.length - 1].price);
  if (!(a > 0) || !(b >= 0)) return null;
  return ((b - a) / a) * 100;
}

function chartRangeConfig(range) {
  const r = String(range || "1D").toUpperCase();
  if (r === "1H") {
    return {
      key: "1H",
      cgDays: 1,
      sliceMs: 60 * 60 * 1000,
      gtTimeframe: "minute",
      gtAggregate: 5,
      gtLimit: 24,
    };
  }
  if (r === "1W") {
    return {
      key: "1W",
      cgDays: 7,
      sliceMs: 0,
      gtTimeframe: "hour",
      gtAggregate: 4,
      gtLimit: 42,
    };
  }
  if (r === "1M") {
    return {
      key: "1M",
      cgDays: 30,
      sliceMs: 0,
      gtTimeframe: "day",
      gtAggregate: 1,
      gtLimit: 30,
    };
  }
  return {
    key: "1D",
    cgDays: 1,
    sliceMs: 0,
    gtTimeframe: "hour",
    gtAggregate: 1,
    gtLimit: 24,
  };
}

async function fetchJsonOk(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function normalizePricePoints(rows, sliceMs) {
  const out = [];
  for (const row of rows || []) {
    let t = Number(row[0]);
    const p = Number(row[1]);
    if (!(p >= 0) || Number.isNaN(p)) continue;
    if (t > 0 && t < 1e12) t *= 1000;
    if (!(t > 0)) continue;
    out.push({ t, price: p });
  }
  out.sort((a, b) => a.t - b.t);
  if (sliceMs > 0 && out.length) {
    const cutoff = out[out.length - 1].t - sliceMs;
    return out.filter((p) => p.t >= cutoff);
  }
  return out;
}

async function fetchCoinGeckoMarketChart(priceId, days, sliceMs) {
  if (!priceId) return [];
  const url =
    "https://api.coingecko.com/api/v3/coins/" +
    encodeURIComponent(priceId) +
    "/market_chart?vs_currency=usd&days=" +
    encodeURIComponent(String(days));
  const data = await fetchJsonOk(url);
  return normalizePricePoints(data && data.prices, sliceMs);
}

async function fetchCoinGeckoContractChart(platform, address, days, sliceMs) {
  if (!platform || !address) return [];
  const url =
    "https://api.coingecko.com/api/v3/coins/" +
    encodeURIComponent(platform) +
    "/contract/" +
    encodeURIComponent(address) +
    "/market_chart/?vs_currency=usd&days=" +
    encodeURIComponent(String(days));
  const data = await fetchJsonOk(url);
  return normalizePricePoints(data && data.prices, sliceMs);
}

async function fetchGeckoTerminalChart(network, tokenAddress, cfg) {
  if (!network || !tokenAddress) return { points: [], meta: null };
  const poolsUrl =
    "https://api.geckoterminal.com/api/v2/networks/" +
    encodeURIComponent(network) +
    "/tokens/" +
    encodeURIComponent(tokenAddress) +
    "/pools?page=1";
  const poolsJson = await fetchJsonOk(poolsUrl);
  const pools = Array.isArray(poolsJson && poolsJson.data) ? poolsJson.data : [];
  if (!pools.length) return { points: [], meta: null };

  const ranked = pools
    .map((p) => {
      const a = (p && p.attributes) || {};
      const reserve = Number(a.reserve_in_usd || 0);
      const vol =
        (a.volume_usd && (Number(a.volume_usd.h24) || Number(a.volume_usd.h6))) || 0;
      return { pool: p, score: reserve * 2 + vol };
    })
    .sort((a, b) => b.score - a.score);

  let meta = null;
  try {
    const tokJson = await fetchJsonOk(
      "https://api.geckoterminal.com/api/v2/networks/" +
        encodeURIComponent(network) +
        "/tokens/" +
        encodeURIComponent(tokenAddress)
    );
    meta = (tokJson && tokJson.data && tokJson.data.attributes) || null;
  } catch (_) {}

  const want = String(tokenAddress).toLowerCase();
  for (const item of ranked.slice(0, 4)) {
    const pool = item.pool;
    const poolAddr = pool && pool.attributes && pool.attributes.address;
    if (!poolAddr) continue;
    let side = "base";
    const baseId =
      pool.relationships &&
      pool.relationships.base_token &&
      pool.relationships.base_token.data &&
      pool.relationships.base_token.data.id;
    const quoteId =
      pool.relationships &&
      pool.relationships.quote_token &&
      pool.relationships.quote_token.data &&
      pool.relationships.quote_token.data.id;
    if (quoteId && String(quoteId).toLowerCase().endsWith("_" + want)) side = "quote";
    if (baseId && String(baseId).toLowerCase().endsWith("_" + want)) side = "base";

    try {
      const ohlcvUrl =
        "https://api.geckoterminal.com/api/v2/networks/" +
        encodeURIComponent(network) +
        "/pools/" +
        encodeURIComponent(poolAddr) +
        "/ohlcv/" +
        encodeURIComponent(cfg.gtTimeframe) +
        "?aggregate=" +
        encodeURIComponent(String(cfg.gtAggregate)) +
        "&limit=" +
        encodeURIComponent(String(cfg.gtLimit)) +
        "&currency=usd&token=" +
        encodeURIComponent(side);
      const ohlcv = await fetchJsonOk(ohlcvUrl);
      const list =
        (ohlcv &&
          ohlcv.data &&
          ohlcv.data.attributes &&
          ohlcv.data.attributes.ohlcv_list) ||
        [];
      // list entries: [ts, open, high, low, close, volume]
      const closes = list
        .map((row) => [row[0], row[4]])
        .filter((row) => row[1] != null);
      const points = normalizePricePoints(closes, cfg.sliceMs);
      if (points.length >= 2) return { points, meta };
    } catch (_) {}
  }
  return { points: [], meta };
}

async function fetchDexScreenerMeta(mint) {
  if (!mint) return null;
  try {
    const data = await fetchJsonOk(
      "https://api.dexscreener.com/latest/dex/tokens/" + encodeURIComponent(mint)
    );
    const pairs = Array.isArray(data && data.pairs) ? data.pairs.slice() : [];
    pairs.sort(
      (a, b) =>
        Number((b.liquidity && b.liquidity.usd) || 0) -
        Number((a.liquidity && a.liquidity.usd) || 0)
    );
    return pairs[0] || null;
  } catch (_) {
    return null;
  }
}

async function loadTokenChartBundle(holding, chain, range) {
  const cfg = chartRangeConfig(range);
  const mint = holding && holding.mint ? String(holding.mint) : "";
  const isNative = !mint || holding.kind === "native";
  const cacheKey = [
    chain && chain.id,
    isNative ? "native" : mint,
    cfg.key,
  ].join(":");
  const cached = TOKEN_CHART_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached;

  let points = [];
  let meta = {
    priceUsd: tokenDetailUnitPrice(holding, chain),
    changePct: null,
    volume24: null,
    mcap: null,
  };

  try {
    if (isNative || mint === WSOL_MINT) {
      points = await fetchCoinGeckoMarketChart(
        chain.priceId,
        cfg.cgDays,
        cfg.sliceMs
      );
      if (points.length) {
        meta.priceUsd = points[points.length - 1].price;
        meta.changePct = pctChange(points);
      }
      try {
        const coin = await fetchJsonOk(
          "https://api.coingecko.com/api/v3/coins/" +
            encodeURIComponent(chain.priceId) +
            "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false"
        );
        const md = coin && coin.market_data;
        if (md) {
          if (md.total_volume && md.total_volume.usd != null) {
            meta.volume24 = Number(md.total_volume.usd);
          }
          if (md.market_cap && md.market_cap.usd != null) {
            meta.mcap = Number(md.market_cap.usd);
          }
          if (md.current_price && md.current_price.usd != null) {
            meta.priceUsd = Number(md.current_price.usd);
          }
        }
      } catch (_) {}
    } else if (isUsdStableHolding(holding, chain) || mint === USDC_MINT) {
      const stable = chainUsdStable(chain);
      const cgId = (stable && stable.cgId) || "usd-coin";
      try {
        points = await fetchCoinGeckoMarketChart(cgId, cfg.cgDays, cfg.sliceMs);
      } catch (_) {
        points = [];
      }
      meta.priceUsd = 1;
      meta.changePct = pctChange(points);
    } else {
      const platform = coingeckoPlatformForChain(chain);
      try {
        points = await fetchCoinGeckoContractChart(
          platform,
          mint,
          cfg.cgDays,
          cfg.sliceMs
        );
      } catch (_) {
        points = [];
      }
      if (points.length < 2) {
        const network = geckoNetworkForChain(chain);
        try {
          const gt = await fetchGeckoTerminalChart(network, mint, cfg);
          if (gt.points && gt.points.length >= 2) points = gt.points;
          if (gt.meta) {
            if (gt.meta.price_usd != null) meta.priceUsd = Number(gt.meta.price_usd);
            if (gt.meta.volume_usd && gt.meta.volume_usd.h24 != null) {
              meta.volume24 = Number(gt.meta.volume_usd.h24);
            }
            if (gt.meta.market_cap_usd != null) meta.mcap = Number(gt.meta.market_cap_usd);
            else if (gt.meta.fdv_usd != null) meta.mcap = Number(gt.meta.fdv_usd);
          }
        } catch (_) {}
      }
      if (points.length >= 2) {
        meta.priceUsd = points[points.length - 1].price;
        meta.changePct = pctChange(points);
      }
      if (meta.volume24 == null || meta.mcap == null || meta.priceUsd == null) {
        const pair = await fetchDexScreenerMeta(mint);
        if (pair) {
          if (meta.priceUsd == null && pair.priceUsd != null) {
            meta.priceUsd = Number(pair.priceUsd);
          }
          if (meta.changePct == null && pair.priceChange && pair.priceChange.h24 != null) {
            meta.changePct = Number(pair.priceChange.h24);
          }
          if (meta.volume24 == null && pair.volume && pair.volume.h24 != null) {
            meta.volume24 = Number(pair.volume.h24);
          }
          if (meta.mcap == null && pair.marketCap != null) meta.mcap = Number(pair.marketCap);
          else if (meta.mcap == null && pair.fdv != null) meta.mcap = Number(pair.fdv);
        }
      }
    }
  } catch (err) {
    console.warn("[token-chart]", err);
  }

  const bundle = { at: Date.now(), points, meta };
  TOKEN_CHART_CACHE.set(cacheKey, bundle);
  return bundle;
}

function drawTokenChart(canvas, points, up) {
  if (!canvas) return false;
  const empty = $("tokenChartEmpty");
  const wrap = canvas.parentElement;
  const cssW = Math.max(280, (wrap && wrap.clientWidth) || canvas.clientWidth || 320);
  const cssH = Math.max(148, (wrap && wrap.clientHeight) || 168);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!points || points.length < 2) {
    if (empty) empty.hidden = false;
    return false;
  }
  if (empty) empty.hidden = true;

  const padX = 2;
  const padY = 12;
  const prices = points.map((p) => p.price);
  let min = Math.min.apply(null, prices);
  let max = Math.max.apply(null, prices);
  if (!(max > min)) {
    min *= 0.999;
    max *= 1.001;
    if (min === max) {
      min -= 1;
      max += 1;
    }
  }
  // Soft padding so the line never kisses the edges.
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.02 || 1;
  min -= pad;
  max += pad;
  const span = max - min || 1;
  const xAt = (i) => padX + (i / (points.length - 1)) * (cssW - padX * 2);
  const yAt = (price) => padY + (1 - (price - min) / span) * (cssH - padY * 2);
  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.price) }));

  // Subtle horizontal guides
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 1;
  for (let g = 1; g <= 3; g++) {
    const gy = padY + ((cssH - padY * 2) * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padX, gy);
    ctx.lineTo(cssW - padX, gy);
    ctx.stroke();
  }

  const stroke = up ? "#4adf95" : "#f07171";
  const fillTop = up ? "rgba(74, 223, 149, 0.26)" : "rgba(240, 113, 113, 0.2)";

  const strokePath = () => {
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      const midX = (prev.x + cur.x) / 2;
      const midY = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    }
    const last = coords[coords.length - 1];
    ctx.lineTo(last.x, last.y);
  };

  strokePath();
  ctx.lineTo(coords[coords.length - 1].x, cssH - padY + 4);
  ctx.lineTo(coords[0].x, cssH - padY + 4);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padY, 0, cssH);
  grad.addColorStop(0, fillTop);
  grad.addColorStop(0.85, "rgba(8, 11, 18, 0)");
  ctx.fillStyle = grad;
  ctx.fill();

  strokePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = stroke;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = up ? "rgba(74, 223, 149, 0.18)" : "rgba(240, 113, 113, 0.18)";
  ctx.fill();
  return true;
}

function paintTokenDetailMint(holding, chain) {
  const btn = $("tokenDetailMint");
  const text = $("tokenDetailMintText");
  if (!btn || !text) return;
  const mint = holding && holding.mint ? String(holding.mint).trim() : "";
  const isNative = !mint || holding.kind === "native" || mint === "native";
  if (isNative) {
    btn.hidden = true;
    btn.dataset.mint = "";
    text.textContent = "—";
    btn.title = "Native asset — no mint / contract";
    return;
  }
  btn.hidden = false;
  btn.dataset.mint = mint;
  text.textContent = mint;
  text.title = mint;
  const label =
    chain && chain.kind === "evm" ? "Contract" : "Mint";
  const labelEl = btn.querySelector(".token-detail-mint-label");
  if (labelEl) labelEl.textContent = label;
  btn.title = "Copy " + label.toLowerCase() + " address";
}

function paintTokenDetailSkeleton() {
  if (!TOKEN_DETAIL || !TOKEN_DETAIL.holding) return;
  const chain = activeChain(STATE);
  const h = TOKEN_DETAIL.holding;
  const name = holdingDisplayName(h, chain);
  const symbol = holdingDisplaySymbol(h);
  const logo = $("tokenDetailLogo");
  const nameEl = $("tokenDetailName");
  const symEl = $("tokenDetailSymbol");
  const balEl = $("tokenDetailBalance");
  const usdEl = $("tokenDetailUsd");
  if (logo) logo.innerHTML = tokenLogoHtml(h);
  if (nameEl) nameEl.textContent = name;
  if (symEl) {
    symEl.textContent =
      (symbol && symbol !== "TOKEN" ? symbol : name) +
      (chain ? " · " + chain.name : "");
  }
  paintTokenDetailMint(h, chain);
  const qty =
    Number(h.amount) >= 1
      ? Number(h.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })
      : Number(h.amount || 0).toFixed(6);
  if (balEl) balEl.textContent = qty + (symbol && symbol !== "TOKEN" ? " " + symbol : "");
  if (usdEl) {
    usdEl.textContent =
      h.usd != null && !Number.isNaN(Number(h.usd))
        ? formatUsdMoney(h.usd, { digits: 2 })
        : "—";
  }
  const priceEl = $("tokenDetailPrice");
  const changeEl = $("tokenDetailChange");
  const px = tokenDetailUnitPrice(h, chain);
  if (priceEl) priceEl.textContent = formatTokenUnitPrice(px);
  if (changeEl) {
    changeEl.textContent = "···";
    changeEl.className = "token-detail-change";
  }
  const volEl = $("tokenDetailVol");
  const mcapEl = $("tokenDetailMcap");
  if (volEl) volEl.textContent = "—";
  if (mcapEl) mcapEl.textContent = "—";
  document.querySelectorAll("#tokenChartRanges .token-chart-range").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.range === (TOKEN_DETAIL.range || "1D"));
  });
  const empty = $("tokenChartEmpty");
  if (empty) {
    empty.hidden = false;
    empty.textContent = "Loading chart…";
  }
  const canvas = $("tokenChartCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

async function paintTokenDetail() {
  if (!TOKEN_DETAIL || !TOKEN_DETAIL.holding) return;
  const chain = activeChain(STATE);
  if (TOKEN_DETAIL.chainId && TOKEN_DETAIL.chainId !== chain.id) {
    // Chain switched under the page — bounce home.
    TOKEN_DETAIL = null;
    go("home");
    return;
  }
  paintTokenDetailSkeleton();
  const seq = ++TOKEN_DETAIL_SEQ;
  const holding = TOKEN_DETAIL.holding;
  const range = TOKEN_DETAIL.range || "1D";
  let bundle;
  try {
    bundle = await loadTokenChartBundle(holding, chain, range);
  } catch (err) {
    console.warn("[token-detail]", err);
    bundle = { points: [], meta: {} };
  }
  if (seq !== TOKEN_DETAIL_SEQ) return;

  const meta = (bundle && bundle.meta) || {};
  const points = (bundle && bundle.points) || [];
  const priceEl = $("tokenDetailPrice");
  const changeEl = $("tokenDetailChange");
  const volEl = $("tokenDetailVol");
  const mcapEl = $("tokenDetailMcap");
  const usdEl = $("tokenDetailUsd");
  if (priceEl) priceEl.textContent = formatTokenUnitPrice(meta.priceUsd);
  const ch = meta.changePct;
  if (changeEl) {
    if (ch == null || Number.isNaN(Number(ch))) {
      changeEl.textContent = "—";
      changeEl.className = "token-detail-change";
    } else {
      const n = Number(ch);
      const sign = n > 0 ? "+" : "";
      changeEl.textContent = sign + n.toFixed(2) + "%  " + range;
      changeEl.className =
        "token-detail-change " + (n > 0 ? "is-up" : n < 0 ? "is-down" : "");
    }
  }
  if (volEl) volEl.textContent = formatCompactUsd(meta.volume24);
  if (mcapEl) mcapEl.textContent = formatCompactUsd(meta.mcap);
  if (
    usdEl &&
    (holding.usd == null || Number.isNaN(Number(holding.usd))) &&
    meta.priceUsd != null &&
    Number(holding.amount) >= 0
  ) {
    usdEl.textContent = formatUsdMoney(Number(holding.amount) * Number(meta.priceUsd), {
      digits: 2,
    });
  }

  const up = !(ch < 0);
  const drawn = drawTokenChart($("tokenChartCanvas"), points, up);
  const empty = $("tokenChartEmpty");
  if (empty && !drawn) {
    empty.hidden = false;
    empty.textContent = "Chart unavailable";
  }
}

function wireTokenDetailControls() {
  $("tokenChartRanges")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-range]");
    if (!btn || !TOKEN_DETAIL) return;
    const range = btn.getAttribute("data-range") || "1D";
    TOKEN_DETAIL.range = range;
    document.querySelectorAll("#tokenChartRanges .token-chart-range").forEach((el) => {
      el.classList.toggle("is-active", el === btn);
    });
    paintTokenDetail();
  });
  $("tokenDetailSendBtn")?.addEventListener("click", () => {
    if (!TOKEN_DETAIL || !TOKEN_DETAIL.holding) return;
    selectSendAssetForHolding(TOKEN_DETAIL.holding);
    go("send");
  });
  $("tokenDetailReceiveBtn")?.addEventListener("click", () => {
    go("receive");
  });
  $("tokenDetailMint")?.addEventListener("click", async () => {
    const btn = $("tokenDetailMint");
    const mint = (btn && btn.dataset.mint) || "";
    if (!mint) return;
    try {
      await navigator.clipboard.writeText(mint);
      showToast("Mint copied");
    } catch (_) {
      try {
        copyText(mint);
        showToast("Mint copied");
      } catch (err) {
        showToast("Copy failed");
      }
    }
  });
  window.addEventListener("resize", () => {
    const panel = $("panel-token");
    if (!panel || panel.hidden || !TOKEN_DETAIL) return;
    const cacheKeyHint = TOKEN_DETAIL.range || "1D";
    // Redraw last cached points without refetch.
    const chain = activeChain(STATE);
    const h = TOKEN_DETAIL.holding;
    const mint = h && h.mint ? String(h.mint) : "";
    const isNative = !mint || h.kind === "native";
    const key = [chain && chain.id, isNative ? "native" : mint, cacheKeyHint].join(":");
    const cached = TOKEN_CHART_CACHE.get(key);
    if (cached && cached.points) {
      const up = !(cached.meta && cached.meta.changePct < 0);
      drawTokenChart($("tokenChartCanvas"), cached.points, up);
    }
  });
}

function sendAssetUnitPriceUsd() {
  const chain = activeChain(STATE);
  const assetVal = ($("sendAsset") && $("sendAsset").value) || "native";
  const stable = chainUsdStable(chain);
  if (
    assetVal === USDC_MINT ||
    (stable &&
      normalizeTokenMintKey(assetVal, chain.kind) ===
        normalizeTokenMintKey(stable.mint, chain.kind))
  ) {
    return 1;
  }
  if (assetVal === "native" || !assetVal) {
    return Number(PRICES[chain.priceId]) || 0;
  }
  const holding = HOLDINGS.find(
    (h) =>
      h.mint === assetVal ||
      normalizeTokenMintKey(h.mint, chain.kind) ===
        normalizeTokenMintKey(assetVal, chain.kind)
  );
  if (holding && Number(holding.amount) > 0 && Number(holding.usd) > 0) {
    return Number(holding.usd) / Number(holding.amount);
  }
  if (holding && (isUsdStableHolding(holding, chain) || holding.mint === USDC_MINT)) {
    return 1;
  }
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
  const chain = activeChain(STATE);
  const assetVal = ($("sendAsset") && $("sendAsset").value) || "native";
  if (assetVal === "native") {
    return (
      (HOLDINGS || []).find((h) => h.kind === "native") ||
      (chain ? nativeHoldingRow(chain, Number(BALANCE && BALANCE.native) || 0, 0) : null)
    );
  }
  const want = normalizeTokenMintKey(assetVal, chain && chain.kind);
  const found = (HOLDINGS || []).find((h) => {
    if (!h || !h.mint) return false;
    if (h.mint === assetVal) return true;
    return normalizeTokenMintKey(h.mint, chain && chain.kind) === want;
  });
  if (found) return found;
  // Display-only USDC/USDG placeholder from paintHoldings (0 balance pre-sync).
  if (chain && isChainUsdStableMint(chain, assetVal)) {
    return usdStableHoldingRow(chain, 0);
  }
  return null;
}

function solanaKeypairFromAccount(acc) {
  if (isVaultLocked()) throw new Error("Unlock wallet first");
  if (!window.solanaWeb3) throw new Error("Solana tx library missing — restart with start.ps1 from the latest wallet folder");
  if (isLedgerAccount(acc)) {
    throw new Error("Ledger account — approve the transaction on your device");
  }
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
  try {
    return Base58.decode(s);
  } catch (_) {}
  if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0) {
    try {
      return base64ToBytes(s);
    } catch (_) {}
  }
  return new TextEncoder().encode(s);
}

function canDeserializeSolTx(u8) {
  if (!u8 || !u8.length || !window.solanaWeb3) return false;
  const { Transaction, VersionedTransaction } = solanaWeb3;
  if (VersionedTransaction) {
    try {
      VersionedTransaction.deserialize(u8);
      return true;
    } catch (_) {}
  }
  try {
    Transaction.from(u8);
    return true;
  } catch (_) {}
  return false;
}

/** Jupiter / WC Solana send transactions as base64 — prefer that over base58. */
function decodeWcTxBytes(raw) {
  if (raw == null) throw new Error("Missing transaction");
  if (raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (Array.isArray(raw)) return new Uint8Array(raw);
  if (typeof raw !== "string") throw new Error("Unsupported transaction type");
  const s = raw.trim();
  if (!s) throw new Error("Empty transaction");
  const candidates = [];
  if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0) {
    try {
      candidates.push(base64ToBytes(s));
    } catch (_) {}
  }
  try {
    candidates.push(Base58.decode(s));
  } catch (_) {}
  if (/^(0x)?[0-9a-fA-F]+$/.test(s) && s.replace(/^0x/, "").length % 2 === 0 && s.length >= 16) {
    const hex = s.replace(/^0x/, "");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    candidates.push(out);
  }
  for (const c of candidates) {
    if (canDeserializeSolTx(c)) return c;
  }
  if (candidates.length) return candidates[0];
  throw new Error("Could not decode transaction");
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
  // Jupiter WC adapter wants:
  //   signature = base58(64-byte ed25519 sig)
  //   transaction = base64(fully signed serialized tx)
  if (VersionedTransaction) {
    try {
      const vtx = VersionedTransaction.deserialize(u8);
      vtx.sign([keypair]);
      const signed = vtx.serialize();
      const signedBytes = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
      const sigBytes = vtx.signatures && vtx.signatures[0] ? vtx.signatures[0] : null;
      return {
        signature: sigBytes ? Base58.encode(sigBytes) : Base58.encode(signedBytes.slice(1, 65)),
        signedTransaction: Base58.encode(signedBytes),
        transactionBase64: bytesToBase64(signedBytes),
        signedBytes,
      };
    } catch (_) {
      /* fall through to legacy */
    }
  }
  const tx = Transaction.from(u8);
  tx.partialSign(keypair);
  const signed = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const signedBytes = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
  const sig0 = tx.signatures && tx.signatures[0] && tx.signatures[0].signature;
  return {
    signature: Base58.encode(sig0 || signedBytes),
    signedTransaction: Base58.encode(signedBytes),
    transactionBase64: bytesToBase64(signedBytes),
    signedBytes,
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

function chainKindsFromWcAccounts(accounts, namespaceKeys) {
  const kinds = new Set();
  (namespaceKeys || []).forEach((key) => {
    const k = String(key || "").toLowerCase();
    if (k === "solana" || k.startsWith("solana:")) kinds.add("solana");
    if (k === "eip155" || k.startsWith("eip155:")) kinds.add("evm");
  });
  (accounts || []).forEach((raw) => {
    const s = String(raw || "").toLowerCase();
    if (s.startsWith("solana:")) kinds.add("solana");
    if (s.startsWith("eip155:") || /^0x[a-f0-9]{40}$/.test(s)) kinds.add("evm");
  });
  return Array.from(kinds);
}

function collectLiveWcSessions() {
  try {
    if (!(window.GladiatorWC && GladiatorWC.isReady())) return [];
    if (typeof GladiatorWC.listSessions === "function") {
      const listed = GladiatorWC.listSessions() || [];
      return listed.map((row) => {
        if (!row) return row;
        if (Array.isArray(row.chains) && row.chains.length) return row;
        const chains = chainKindsFromWcAccounts(row.accounts, row.namespaces || row.namespaceKeys);
        return chains.length ? { ...row, chains } : row;
      });
    }
    const sessions = GladiatorWC.getActiveSessions() || {};
    return Object.keys(sessions).map((topic) => {
      const s = sessions[topic] || {};
      const meta = (s.peer && s.peer.metadata) || {};
      const ns = s.namespaces || {};
      const accounts = [];
      const nsKeys = Object.keys(ns);
      for (const key of nsKeys) {
        const block = ns[key] || {};
        if (Array.isArray(block.accounts)) accounts.push(...block.accounts);
      }
      const row = {
        topic,
        name: meta.name || "dApp",
        url: meta.url || "",
        icon: Array.isArray(meta.icons) && meta.icons[0] ? meta.icons[0] : "",
        accounts,
        chains: chainKindsFromWcAccounts(accounts, nsKeys),
        status: "active",
      };
      if (!row.icon) row.icon = localDappIconSrc(row) || "";
      return row;
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
  // Toolbar popup only mirrors sessions; wallet window / web page owns WC.
  if (
    IS_WC_HOST &&
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

  // Merge in-page Wallet Standard connections (Jupiter / pump.fun inject).
  const injectItems = await loadInjectConnections();
  const merged = mergeConnectionLists(injectItems, items);
  paintWcConnectionsList(merged);
  if (merged.length) {
    const name = merged[0].name || "dApp";
    setWcStatus(
      "Connected to " + name + (merged.length > 1 ? " (+" + (merged.length - 1) + ")" : "")
    );
  }
  return merged;
}

async function loadInjectConnections() {
  if (!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage)) {
    return [];
  }
  try {
    const res = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "gladiator-list-dapp-connections" }, (r) => {
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
    return res && Array.isArray(res.items) ? res.items : [];
  } catch (_) {
    return [];
  }
}

function mergeConnectionLists(injectItems, wcItems) {
  const out = [];
  const seenHosts = new Set();
  const hostOf = (item) => {
    try {
      const raw = item && (item.origin || item.url || "");
      if (!raw) return "";
      return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    } catch (_) {
      return String((item && (item.origin || item.url)) || "")
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
    }
  };
  (injectItems || []).forEach((item) => {
    if (!item) return;
    const row = { ...item, kind: item.kind || "inject" };
    out.push(row);
    const h = hostOf(row);
    if (h) seenHosts.add(h);
  });
  (wcItems || []).forEach((item) => {
    if (!item) return;
    const h = hostOf(item);
    // Prefer in-page inject row when both exist for the same dApp.
    if (h && seenHosts.has(h)) return;
    out.push({ ...item, kind: item.kind || "wc" });
    if (h) seenHosts.add(h);
  });
  return out;
}

async function disconnectInjectOrigin(origin) {
  const o = String(origin || "").trim();
  if (!o) return;
  if (!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage)) {
    return;
  }
  await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "gladiator-disconnect-dapp", origin: o },
        () => {
          void chrome.runtime.lastError;
          resolve();
        }
      );
    } catch (_) {
      resolve();
    }
  });
}

/** Known dApp logos shipped under icons/dapps/ (host suffix → file stem). */
const DAPP_LOCAL_ICON_MAP = [
  ["jup.ag", "jupiter"],
  ["pump.fun", "pump"],
  ["raydium.io", "raydium"],
  ["orca.so", "orca"],
  ["tensor.trade", "tensor"],
  ["drift.trade", "drift"],
  ["mango.markets", "mango"],
  ["kamino.finance", "kamino"],
  ["sanctum.so", "sanctum"],
  ["uniswap.org", "uniswap"],
  ["relay.link", "relay"],
  ["sol-incinerator.com", "incinerator"],
];

function connectionHost(item) {
  const raw = (item && (item.origin || item.url || item.name)) || "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    }
  } catch (_) {}
  return String(raw)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function localDappIconSrc(hostOrItem) {
  const host =
    typeof hostOrItem === "string" ? hostOrItem : connectionHost(hostOrItem);
  if (!host) return "";
  for (let i = 0; i < DAPP_LOCAL_ICON_MAP.length; i++) {
    const suffix = DAPP_LOCAL_ICON_MAP[i][0];
    const file = DAPP_LOCAL_ICON_MAP[i][1];
    if (host === suffix || host.endsWith("." + suffix)) {
      return extAssetUrl("icons/dapps/" + file + ".png") + "?v=1";
    }
  }
  // Name-based fallback (persisted WC rows sometimes lack url).
  const name = String(
    (hostOrItem && hostOrItem.name) || hostOrItem || ""
  ).toLowerCase();
  const byName = [
    ["jupiter", "jupiter"],
    ["jup", "jupiter"],
    ["pump", "pump"],
    ["raydium", "raydium"],
    ["orca", "orca"],
    ["tensor", "tensor"],
    ["drift", "drift"],
    ["mango", "mango"],
    ["kamino", "kamino"],
    ["sanctum", "sanctum"],
    ["uniswap", "uniswap"],
    ["relay", "relay"],
    ["incinerator", "incinerator"],
  ];
  for (let i = 0; i < byName.length; i++) {
    if (name === byName[i][0] || name.includes(byName[i][0])) {
      return extAssetUrl("icons/dapps/" + byName[i][1] + ".png") + "?v=1";
    }
  }
  return "";
}

function resolveConnectionIconSrc(item) {
  const local = localDappIconSrc(item);
  if (local) return local;
  const remote = item && item.icon ? String(item.icon) : "";
  if (remote && (/^https?:\/\//i.test(remote) || remote.startsWith("./") || remote.startsWith("data:"))) {
    return remote;
  }
  const host = connectionHost(item);
  if (host && host.includes(".")) {
    return (
      "https://www.google.com/s2/favicons?domain=" +
      encodeURIComponent(host) +
      "&sz=64"
    );
  }
  return "";
}

function connectionSiteLabel(item) {
  if (!item) return "";
  const host = shortHost(item.url || item.origin || "");
  if (host) return host;
  const name = String(item.name || "").trim();
  return name && name !== "dApp" ? name : "";
}

/** Account ids that still own an active inject/WC connection (sidebar green dots). */
let CONNECTED_ACCOUNT_IDS = new Set();
/** Last full inject+WC connection list (all wallets) for re-paint on account switch. */
let LAST_CONNECTION_ITEMS = [];

function accountAddressesForMatch(acc) {
  if (!acc) return [];
  const out = [];
  if (acc.solana && acc.solana.publicKey) out.push(String(acc.solana.publicKey));
  if (acc.evm && acc.evm.address) out.push(String(acc.evm.address));
  if (acc.bitcoin && acc.bitcoin.address) out.push(String(acc.bitcoin.address));
  if (acc.sui && acc.sui.address) out.push(String(acc.sui.address));
  return out;
}

function matchAccountIdFromConnectionAddresses(accounts) {
  if (!STATE || !Array.isArray(STATE.accounts) || !STATE.accounts.length) return null;
  const needles = (accounts || [])
    .map((raw) => {
      const parts = String(raw || "").split(":");
      return (parts[parts.length - 1] || "").trim().toLowerCase();
    })
    .filter(Boolean);
  if (!needles.length) return null;
  for (const acc of STATE.accounts) {
    const addrs = accountAddressesForMatch(acc).map((a) => a.toLowerCase());
    if (addrs.some((a) => needles.includes(a))) return acc.id;
  }
  return null;
}

function connectionOwnerAccountId(row) {
  if (!row) return null;
  if (row.accountId) return String(row.accountId);
  return matchAccountIdFromConnectionAddresses(row.accounts);
}

function inferConnectionChainKindsFromHost(urlOrOrigin) {
  try {
    const host = new URL(urlOrOrigin).hostname.toLowerCase().replace(/^www\./, "");
    const sol = [
      "jup.ag",
      "pump.fun",
      "raydium.io",
      "tensor.trade",
      "orca.so",
      "drift.trade",
      "mango.markets",
      "kamino.finance",
      "sanctum.so",
      "sol-incinerator.com",
    ];
    for (let i = 0; i < sol.length; i++) {
      const s = sol[i];
      if (host === s || host.endsWith("." + s)) return ["solana"];
    }
    if (
      host === "uniswap.org" ||
      host.endsWith(".uniswap.org") ||
      host === "relay.link" ||
      host.endsWith(".relay.link")
    ) {
      return ["evm"];
    }
  } catch (_) {}
  return [];
}

function connectionChainKinds(row) {
  if (!row) return [];
  if (Array.isArray(row.chains) && row.chains.length) {
    return row.chains.map((x) => String(x || "").toLowerCase()).filter(Boolean);
  }
  if (row.chain) return [String(row.chain).toLowerCase()];
  const fromAccounts = chainKindsFromWcAccounts(row.accounts, row.namespaces || row.namespaceKeys);
  if (fromAccounts.length) return fromAccounts;
  const fromHost = inferConnectionChainKindsFromHost(row.origin || row.url || "");
  if (fromHost.length) return fromHost;
  // Inject rows without metadata are almost always Solana Wallet Standard.
  if (row.kind === "inject") return ["solana"];
  return [];
}

function connectionMatchesActiveChain(row) {
  const chain = activeChain(STATE);
  const kind = chain && chain.kind ? String(chain.kind).toLowerCase() : "";
  if (!kind) return true;
  const kinds = connectionChainKinds(row);
  // No known chain on the session → do not claim Connected on mismatched networks.
  if (!kinds.length) return false;
  return kinds.includes(kind);
}

function filterConnectionsForAccount(items, accountId) {
  const id = String(accountId || "");
  if (!id) return [];
  return (Array.isArray(items) ? items : []).filter((row) => {
    if (!row) return false;
    const owner = connectionOwnerAccountId(row);
    return !!(owner && String(owner) === id);
  });
}

function filterConnectionsForActiveContext(items) {
  const activeId = (STATE && STATE.activeAccountId) || "";
  return filterConnectionsForAccount(items, activeId).filter(connectionMatchesActiveChain);
}

function syncConnectedAccountIds(items) {
  const next = new Set();
  const rows = Array.isArray(items) ? items : [];
  for (const row of rows) {
    if (!row || row.status === "pending") continue;
    // Green dots follow the active chain — Solana session should not light up on Bitcoin.
    if (!connectionMatchesActiveChain(row)) continue;
    const owner = connectionOwnerAccountId(row);
    if (owner) next.add(String(owner));
  }
  CONNECTED_ACCOUNT_IDS = next;
  paintAcctDrawerConnDots();
}

function paintAcctDrawerConnDots() {
  const list = $("acctDrawerList");
  if (!list) return;
  list.querySelectorAll(".acct-drawer-item").forEach((btn) => {
    const id = btn.dataset.accountId;
    const connected = !!(id && CONNECTED_ACCOUNT_IDS.has(id));
    let dot = btn.querySelector(".acct-drawer-conn-dot");
    if (connected) {
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "acct-drawer-conn-dot";
        dot.setAttribute("aria-hidden", "true");
        btn.appendChild(dot);
      }
    } else if (dot) {
      dot.remove();
    }
  });
}

function paintBalanceConnStatus(items) {
  const el = $("balanceConnStatus");
  const label = $("balanceConnLabel");
  const sitesEl = $("balanceConnSites");
  const allRows = Array.isArray(items) ? items.filter(Boolean) : [];
  // Green dots: wallets with a session on the *active chain*.
  const allActive = allRows.filter((r) => r && r.status !== "pending");
  syncConnectedAccountIds(allActive);
  // Home status / site chips: active wallet + active chain only.
  const mine = filterConnectionsForActiveContext(allRows);
  const active = mine.filter((r) => r && r.status !== "pending");
  if (!el) return;
  const connected = active.length > 0;
  const pendingOnly = !connected && mine.length > 0;

  const clearSites = () => {
    if (!sitesEl) return;
    sitesEl.textContent = "";
    sitesEl.hidden = true;
  };

  if (connected) {
    el.dataset.state = "connected";
    if (label) label.textContent = "Connected";
    if (sitesEl) {
      const names = [];
      const seen = new Set();
      for (const row of active) {
        const site = connectionSiteLabel(row);
        if (!site) continue;
        const key = site.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(site);
      }
      if (names.length) {
        sitesEl.textContent = names.join(" · ");
        sitesEl.hidden = false;
      } else {
        clearSites();
      }
    }
  } else if (pendingOnly) {
    el.dataset.state = "disconnected";
    if (label) label.textContent = "Connecting…";
    clearSites();
  } else {
    el.dataset.state = "disconnected";
    if (label) label.textContent = "Disconnected";
    clearSites();
  }
}

function paintWcConnectionsList(items) {
  const list = $("wcConnectionsList");
  const empty = $("wcConnectionsEmpty");
  LAST_CONNECTION_ITEMS = Array.isArray(items) ? items.slice() : [];
  paintBalanceConnStatus(LAST_CONNECTION_ITEMS);
  if (!list) return;
  // Connections page: only platforms linked to the active wallet + chain.
  const rows = filterConnectionsForActiveContext(LAST_CONNECTION_ITEMS);
  list.innerHTML = "";
  if (!rows.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  for (const item of rows) {
    if (!item) continue;
    const kind = item.kind === "inject" ? "inject" : "wc";
    const li = document.createElement("li");
    li.className = "wc-conn-item";
    li.dataset.topic = item.topic || "";
    li.dataset.kind = kind;
    if (item.origin) li.dataset.origin = item.origin;

    const initials =
      String(item.name || (kind === "inject" ? "GL" : "WC"))
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 2)
        .toUpperCase() || (kind === "inject" ? "GL" : "WC");
    const iconUrl = resolveConnectionIconSrc(item);
    let iconHtml;
    if (iconUrl) {
      iconHtml =
        '<img class="wc-conn-icon" alt="" width="36" height="36" src="' +
        iconUrl.replace(/"/g, "&quot;") +
        '" />';
    } else {
      iconHtml = '<div class="wc-conn-icon fallback">' + initials + "</div>";
    }

    const status = item.status === "pending" ? "pending" : "active";
    const subParts =
      status === "pending"
        ? [item.uri || "Waiting for pair / approve…"]
        : [
            shortHost(item.url || item.origin),
            kind === "inject" ? "in-page" : accountHint(item.accounts) || "WalletConnect",
          ];
    const sub = subParts.filter(Boolean).join(" · ") || "Solana connection";

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
      '<button type="button" class="wc-conn-disconnect" data-topic="" data-kind="" data-origin="">Disconnect</button>';
    li.querySelector("strong").textContent = item.name || "dApp";
    li.querySelector("span").textContent = sub;
    const img = li.querySelector("img.wc-conn-icon");
    if (img) {
      img.addEventListener("error", () => {
        // Prefer local brand mark if a remote/WC icon failed.
        const local = localDappIconSrc(item);
        if (local && img.getAttribute("src") !== local) {
          img.src = local;
          return;
        }
        const wrap = document.createElement("div");
        wrap.className = "wc-conn-icon fallback";
        wrap.textContent = initials;
        img.replaceWith(wrap);
      });
    }
    const btn = li.querySelector(".wc-conn-disconnect");
    btn.dataset.topic = item.topic || "";
    btn.dataset.kind = kind;
    btn.dataset.origin = item.origin || "";
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
    if (t.startsWith("pending:")) {
      showToast("Nothing to cancel");
      paintWcSettings();
      return;
    }
    if (IS_EXTENSION_POPUP) {
      await chromeLocalSet({
        [WC_CMD_KEY]: { type: "disconnect", topic: t, at: Date.now() },
      });
      await openWalletWindowForWc({ focus: false, settings: false });
      setWcStatus("Disconnect sent");
      showToast("Disconnected");
      paintWcSettings();
      return;
    }
    await ensureWalletConnect();
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


const WC_PENDING_KEY = "gladiator_wc_pending";
const WC_CMD_KEY = "gladiator_wc_cmd";
let WC_PENDING_CONSUMING = false;

async function chromeLocalGet(keys) {
  if (!(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)) return {};
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (r) => resolve(r || {}));
    } catch (_) {
      resolve({});
    }
  });
}

async function chromeLocalSet(obj) {
  if (!(typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)) return;
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(err);
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

function openWalletWindowForWc(opts) {
  if (!(IS_EXTENSION && typeof chrome !== "undefined" && chrome.runtime)) {
    return Promise.resolve({ ok: false, error: "Not an extension" });
  }
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "wc-open-wallet",
        focus: !opts || opts.focus !== false,
        settings: !opts || opts.settings !== false,
        restore: !!(opts && opts.restore),
        ledger: !!(opts && opts.ledger),
      },
      (r) => resolve(r || {})
    );
  });
}

async function consumePendingWcUri() {
  if (!IS_WC_HOST || !IS_EXTENSION || WC_PENDING_CONSUMING) return false;
  WC_PENDING_CONSUMING = true;
  try {
    const bag = await chromeLocalGet([WC_PENDING_KEY]);
    const pending = bag[WC_PENDING_KEY];
    const uri = pending && pending.uri;
    if (!uri || !String(uri).startsWith("wc:")) return false;
    const projectId = (
      (pending && pending.projectId) ||
      (STATE && STATE.wcProjectId) ||
      ""
    ).trim();
    if (projectId && STATE && STATE.wcProjectId !== projectId) {
      STATE.wcProjectId = projectId;
      await storageSet(STATE);
    }
    setWcStatus("Connecting WalletConnect in wallet…");
    showToast("Connecting…");
    await ensureWalletConnect();
    await GladiatorWC.pair(String(uri).trim());
    await chromeLocalSet({
      [WC_PENDING_KEY]: {
        projectId: projectId || (STATE && STATE.wcProjectId) || "",
        uri: "",
        at: Date.now(),
        paired: true,
      },
    });
    if ($("wcUri")) $("wcUri").value = "";
    try {
      if (typeof GladiatorWC.processPendings === "function") {
        await GladiatorWC.processPendings();
      }
    } catch (_) {}
    await refreshWcConnections({ ensure: false, poll: 10 });
    setWcStatus("Connected — keep this wallet window open for Jupiter swaps");
    showToast("Keep this wallet open for swaps");
    paintWcSettings();
    return true;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    setWcStatus("Connect failed: " + msg);
    showToast(msg);
    return false;
  } finally {
    WC_PENDING_CONSUMING = false;
  }
}

async function handleWcHostCommand(cmd) {
  if (!IS_WC_HOST || !cmd || !cmd.type) return;
  if (cmd.type === "disconnect") {
    try {
      await ensureWalletConnect();
      if (cmd.topic && typeof GladiatorWC.disconnectSession === "function") {
        await GladiatorWC.disconnectSession(cmd.topic);
      } else if (window.GladiatorWC && GladiatorWC.isReady()) {
        await GladiatorWC.disconnectAll();
      }
      await persistWcSessions([]);
      setWcStatus("Disconnected");
      paintWcSettings();
    } catch (err) {
      console.warn("[wc-cmd]", err);
    }
  } else if (cmd.type === "publish") {
    try {
      await persistWcSessions();
      await refreshWcConnections({ ensure: false });
    } catch (_) {}
  }
}

async function ensureWalletConnect() {
  if (isVaultLocked()) {
    openVaultModal("migrate");
    throw new Error("Enter old password once to restore keys");
  }
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
        const bytes = decodeWcTxBytes(blob);
        const signed = signSolanaTxBytes(bytes, kp);
        // Jupiter reads `transaction` (base64) first; `signature` must be the 64-byte sig.
        return {
          signature: signed.signature,
          transaction: signed.transactionBase64,
        };
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
          const signed = signSolanaTxBytes(decodeWcTxBytes(blob), kp);
          out.push(signed.transactionBase64);
        }
        return { transactions: out };
      },
      signAndSendSolanaTransaction: async (params) => {
        const p = normalizeWcParams(params);
        const acc = activeAccount(STATE);
        const kp = solanaKeypairFromAccount(acc);
        const blob = extractWcTxBlob(p);
        const signed = signSolanaTxBytes(decodeWcTxBytes(blob), kp);
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
        // sessions — never wipe the remaining connection (or inject rows).
        WC_PENDING_REQUEST = null;
        hideWcApproveBar();
        // Tiny delay so WalletKit finishes removing the closed topic.
        await new Promise((r) => setTimeout(r, 50));
        const live = collectLiveWcSessions();
        await persistWcSessions(live);
        // refreshWcConnections merges inject (Jupiter Wallet Standard) + WC.
        // Do not paint WC-only lists here — that hides active inject connections.
        const merged = await refreshWcConnections({ ensure: false });
        if (merged && merged.length) {
          setWcStatus(
            "Connected to " +
              (merged[0].name || "dApp") +
              (merged.length > 1 ? " (+" + (merged.length - 1) + ")" : "")
          );
          return;
        }
        setWcStatus("Disconnected");
        showToast("WalletConnect disconnected");
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

  // Toolbar popup closes on blur — hand the URI to the full wallet window.
  if (IS_EXTENSION_POPUP) {
    try {
      await chromeLocalSet({
        [WC_PENDING_KEY]: { uri, projectId, at: Date.now() },
      });
      const res = await openWalletWindowForWc({ focus: true, settings: true });
      if (res && res.ok === false) throw new Error(res.error || "Could not open wallet");
      if ($("wcUri")) $("wcUri").value = "";
      setWcStatus(
        "Opened Gladiator wallet window — keep it open. Jupiter swap confirms are signed there."
      );
      showToast("Keep the wallet window open");
      paintWcSettings();
      return;
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      setWcStatus("Wallet window failed: " + msg + " — trying here");
    }
  }

  setWcStatus("Connecting… keep this wallet open");
  showToast("Connecting…");
  try {
    await ensureWalletConnect();
    await GladiatorWC.pair(uri);
    if ($("wcUri")) $("wcUri").value = "";
    setWcStatus("Paired — keep this wallet open for Jupiter swaps");
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
    if (IS_EXTENSION_POPUP) {
      await chromeLocalSet({
        [WC_CMD_KEY]: { type: "disconnect", at: Date.now() },
        [WC_PENDING_KEY]: null,
        gladiator_wc_sessions: { at: Date.now(), items: [] },
      });
      await openWalletWindowForWc({ focus: false, settings: false });
      setWcStatus("Disconnect sent");
      showToast("Disconnected");
      paintWcSettings();
      return;
    }
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

function friendlySendError(err, chainHint) {
  const msg = String(err && err.message ? err.message : err || "Send failed");
  const low = msg.toLowerCase();
  const chain = chainHint || activeChain(STATE) || {};
  const kind = chain.kind || "";
  const sym = chain.symbol || (kind === "evm" ? "ETH" : kind === "bitcoin" ? "BTC" : kind === "sui" ? "SUI" : "SOL");

  // Never rewrite an already chain-correct message into SOL.
  if (
    /insufficient (eth|btc|sui|pol|matic|sol)\b/i.test(msg) ||
    /ledger evm|ethereum app|link evm|blind signing/i.test(msg)
  ) {
    return msg;
  }

  if (
    low.includes("insufficient funds") ||
    low.includes("insufficient") ||
    low.includes("overshot") ||
    low.includes("exceeds balance") ||
    low.includes("no record of a prior credit") ||
    low.includes("attempt to debit")
  ) {
    if (kind === "evm") {
      return (
        "Insufficient " +
        sym +
        " — need enough for the amount and gas on " +
        (chain.name || "this network") +
        ". Open Receive and deposit " +
        sym +
        " first."
      );
    }
    if (kind === "bitcoin") {
      return "Insufficient BTC — need enough for the amount plus network fee. Open Receive and deposit BTC first.";
    }
    if (kind === "sui") {
      return "Insufficient SUI — need enough for the amount plus network fee. Open Receive and deposit SUI first.";
    }
    return (
      "Insufficient SOL — this wallet needs SOL for the amount and network fee. Open Receive and deposit SOL first."
    );
  }
  if (low.includes("user rejected") || low.includes("denied by the user")) {
    return "Rejected on Ledger / wallet.";
  }
  if (low.includes("blockhash not found") || low.includes("block height exceeded")) {
    return "Network timed out — tap Send again.";
  }
  if (
    low.includes("invalid public key") ||
    low.includes("wrong size") ||
    low.includes("invalid solana recipient") ||
    low.includes("invalid evm recipient") ||
    low.includes("invalid ethereum")
  ) {
    return "Invalid recipient address for " + (chain.name || "this chain") + ".";
  }
  if (low.includes("failed to fetch") || low.includes("http 403") || low.includes("http 429") || low.includes("http 502")) {
    if (kind === "solana") {
      return "RPC blocked the send — paste a Helius key in Accounts → Advanced RPC, Save, then retry.";
    }
    return "Network RPC error — tap Send again in a moment.";
  }
  if (low.includes("solana tx library") || low.includes("solanaweb3")) {
    return "Solana send library missing — reload the Gladiator extension pack.";
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

async function signLegacyTxWithLedger(tx, acc) {
  ensureBrowserBuffer();
  const api = await ensureLedgerSupported();
  const idx = ledgerAccountIndex(acc);
  const pkStr = acc.solana && acc.solana.publicKey;
  if (!pkStr) throw new Error("Ledger account has no public key");
  const { PublicKey } = solanaWeb3;
  const pubkey = new PublicKey(pkStr);
  showToast("Approve on Ledger…");
  const message = tx.serializeMessage();
  const msgBytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  const signed = await api.signTransaction(idx, msgBytes);
  const sigBytes = signed.signatureBytes
    ? new Uint8Array(signed.signatureBytes)
    : Base58.decode(signed.signature);
  tx.addSignature(pubkey, sigBytes);
  return tx;
}

async function broadcastSolTx(tx, signer, rpcs, ledgerAcc) {
  ensureBrowserBuffer();
  const latest = await solRpc("getLatestBlockhash", [{ commitment: "confirmed" }], rpcs);
  const blockhash = latest && latest.value && latest.value.blockhash;
  if (!blockhash) throw new Error("Could not fetch blockhash");
  if (ledgerAcc && isLedgerAccount(ledgerAcc)) {
    const { PublicKey } = solanaWeb3;
    tx.feePayer = new PublicKey(ledgerAcc.solana.publicKey);
    tx.recentBlockhash = blockhash;
    await signLegacyTxWithLedger(tx, ledgerAcc);
  } else {
    tx.feePayer = signer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(signer);
  }
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
  const ledger = isLedgerAccount(acc);
  const from = ledger ? null : solanaKeypairFromAccount(acc);
  const fromAddr = ledger
    ? acc.solana.publicKey
    : from.publicKey.toBase58();
  if (!fromAddr) throw new Error("No Solana address on this account");
  // Keep stored pubkey aligned with the signing key
  if (!ledger && acc.solana && acc.solana.publicKey !== fromAddr) {
    acc.solana.publicKey = fromAddr;
    await storageSet(STATE);
    paintSwitchers();
  }
  const fromPubkey = ledger ? new PublicKey(fromAddr) : from.publicKey;
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
  // Network fee buffer only (no platform fee).
  const networkFeeLamports = 10000;
  if (balLamports <= networkFeeLamports) {
    throw new Error(
      "Insufficient SOL on active wallet " +
        shortAddr(fromAddr) +
        " (RPC balance " +
        bal.toFixed(6) +
        " SOL). Deposit to Receive address: " +
        fromAddr
    );
  }
  const maxSend = balLamports - networkFeeLamports;
  if (lamports > maxSend) lamports = Math.max(0, maxSend);
  if (!(lamports > 0)) {
    throw new Error(
      "Insufficient SOL for amount + network fee on " +
        shortAddr(fromAddr) +
        " — have " +
        bal.toFixed(6) +
        " SOL"
    );
  }
  if (lamports + networkFeeLamports > balLamports) {
    throw new Error("Insufficient SOL for amount and network fee");
  }
  ensureBrowserBuffer();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: to,
      lamports: lamports,
    })
  );
  return await broadcastSolTx(tx, from, rpcs, ledger ? acc : null);
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
  const ledger = isLedgerAccount(acc);
  const from = ledger ? null : solanaKeypairFromAccount(acc);
  const fromAddr = ledger
    ? acc.solana && acc.solana.publicKey
    : from.publicKey.toBase58();
  if (!fromAddr) throw new Error("No Solana address on this account");
  const fromPubkey = ledger ? new PublicKey(fromAddr) : from.publicKey;
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
  let rawAmount = uiAmountToRaw(amountUi, decimals);
  if (rawAmount <= 0n) throw new Error("Amount too small");
  const balRaw = uiAmountToRaw(holding.amount, decimals);
  if (rawAmount > balRaw) rawAmount = balRaw;
  if (rawAmount <= 0n) throw new Error("Amount too small");
  const srcAta = getAssociatedTokenAddressSync(
    mintPk,
    fromPubkey,
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
      fromPubkey,
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
      fromPubkey,
      rawAmount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawAmount) : rawAmount,
      decimals,
      [],
      programId
    )
  );
  const solChain = CHAINS.find((c) => c.id === "solana") || activeChain(STATE);
  const rpcs = solRpcList(solChain);
  // SPL transfers still burn SOL for network fees (+ possible ATA rent)
  const solBal = await fetchSolBalance(fromAddr, rpcs);
  if (solBal < 0.004) {
    throw new Error(
      "Insufficient SOL for token send network fees — need ~0.004 SOL on this wallet. Receive address: " +
        fromAddr
    );
  }
  return await broadcastSolTx(tx, from, rpcs, ledger ? acc : null);
}

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function signAndBroadcastEvmLedger(acc, chain, provider, txRequest) {
  const ethApi = await ensureLedgerEthSupported();
  const from = acc.evm.address;
  const nonce = await provider.getTransactionCount(from, "pending");
  const network = await provider.getNetwork();
  const chainId = Number(chain.chainId || network.chainId);
  let fee = {};
  try {
    const feeData = await provider.getFeeData();
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      fee = {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        type: 2,
      };
    } else if (feeData.gasPrice) {
      fee = { gasPrice: feeData.gasPrice, type: 0 };
    }
  } catch (_) {}
  const gasLimit =
    txRequest.gasLimit ||
    (await provider.estimateGas({
      from,
      to: txRequest.to,
      value: txRequest.value || 0n,
      data: txRequest.data || "0x",
    }));
  const fields = {
    to: txRequest.to,
    value: txRequest.value || 0n,
    data: txRequest.data || "0x",
    nonce,
    gasLimit,
    chainId,
    ...fee,
  };
  const unsigned = ethers.Transaction.from(fields);
  const rawHex = unsigned.unsignedSerialized.replace(/^0x/i, "");
  showToast("Approve on Ledger (Ethereum app)…");
  let sig;
  try {
    sig = await ethApi.signTransaction(ledgerAccountIndex(acc), rawHex);
  } catch (err) {
    throw new Error(friendlyLedgerErr(err, "Ethereum"));
  }
  let v = sig.v;
  if (typeof v === "string" && !v.startsWith("0x")) {
    // Ledger may return compact v (0/1) or full hex
    const n = parseInt(v, 16);
    v = Number.isFinite(n) ? n : v;
  }
  const signed = ethers.Transaction.from({
    ...fields,
    signature: { r: sig.r, s: sig.s, v },
  });
  const resp = await provider.broadcastTransaction(signed.serialized);
  showToast("Submitted · waiting…");
  await resp.wait(1);
  return resp.hash;
}

async function sendEvmNative(acc, chain, toAddr, amount) {
  if (!window.ethers) throw new Error("ethers missing");
  if (!acc.evm || (!acc.evm.privateKey && !(isLedgerAccount(acc) && acc.evm.address))) {
    throw new Error(
      isLedgerAccount(acc)
        ? "Ledger EVM not linked — open Ethereum app on the Nano and tap Link EVM"
        : "No EVM key on this wallet"
    );
  }
  if (!ethers.isAddress(toAddr)) throw new Error("Invalid EVM recipient address");
  const sym = chain.symbol || "ETH";
  const list = (chain.rpcs && chain.rpcs.length ? chain.rpcs : [chain.rpc]).filter(Boolean);
  let lastErr = null;
  const value = ethers.parseUnits(String(amount), chain.decimals || 18);
  for (const rpc of list) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, chain.chainId || undefined);
      const from = acc.evm.address;
      const bal = await provider.getBalance(from);
      // Leave headroom for gas only (no platform fee).
      const gasPad = ethers.parseUnits("0.00008", 18);
      const need = value + gasPad;
      if (bal < need) {
        throw new Error(
          "Insufficient " +
            sym +
            " — need enough for the amount and gas on " +
            (chain.name || "Ethereum")
        );
      }
      const ledger = isLedgerAccount(acc) && !acc.evm.privateKey;
      if (ledger) {
        return await signAndBroadcastEvmLedger(acc, chain, provider, {
          to: toAddr,
          value,
        });
      }
      const wallet = new ethers.Wallet(acc.evm.privateKey, provider);
      const tx = await wallet.sendTransaction({ to: toAddr, value });
      showToast("Submitted · waiting…");
      await tx.wait(1);
      return tx.hash;
    } catch (err) {
      lastErr = err;
      console.warn("[evm-send]", rpc, err && err.message ? err.message : err);
    }
  }
  throw lastErr || new Error((chain.name || "EVM") + " send failed");
}

async function sendEvmToken(acc, chain, holding, toAddr, amountUi) {
  if (!window.ethers) throw new Error("ethers missing");
  if (!acc.evm || (!acc.evm.privateKey && !(isLedgerAccount(acc) && acc.evm.address))) {
    throw new Error(
      isLedgerAccount(acc)
        ? "Ledger EVM not linked — open Ethereum app on the Nano and tap Link EVM"
        : "No EVM key on this wallet"
    );
  }
  if (!ethers.isAddress(toAddr)) throw new Error("Invalid EVM recipient address");
  const mint = holding && holding.mint;
  if (!mint || !ethers.isAddress(mint)) throw new Error("Invalid token contract");
  const decimals =
    holding.decimals != null ? Number(holding.decimals) : 18;
  const value = ethers.parseUnits(String(amountUi), decimals);
  const have = ethers.parseUnits(String(holding.amount || "0"), decimals);
  if (value > have) {
    throw new Error("Amount exceeds token balance");
  }

  const list = (chain.rpcs && chain.rpcs.length ? chain.rpcs : [chain.rpc]).filter(Boolean);
  let lastErr = null;
  const iface = new ethers.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData("transfer", [toAddr, value]);
  for (const rpc of list) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, chain.chainId || undefined);
      const ledger = isLedgerAccount(acc) && !acc.evm.privateKey;
      if (ledger) {
        return await signAndBroadcastEvmLedger(acc, chain, provider, {
          to: mint,
          value: 0n,
          data,
        });
      }
      const wallet = new ethers.Wallet(acc.evm.privateKey, provider);
      const contract = new ethers.Contract(mint, ERC20_ABI, wallet);
      const tx = await contract.transfer(toAddr, value);
      showToast("Submitted · waiting…");
      await tx.wait(1);
      return tx.hash;
    } catch (err) {
      lastErr = err;
      console.warn("[erc20-send]", rpc, err && err.message ? err.message : err);
    }
  }
  throw lastErr || new Error("Token send failed on " + (chain.name || "EVM"));
}

async function fetchBtcUtxos(address) {
  const urls = [
    "https://blockstream.info/api/address/" + address + "/utxo",
    "https://mempool.space/api/address/" + address + "/utxo",
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("utxo http " + res.status);
      const j = await res.json();
      if (!Array.isArray(j)) throw new Error("bad utxo payload");
      return j.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: Number(u.value) || 0,
      }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Could not load Bitcoin UTXOs");
}

async function fetchBtcFeeSats(inputCount, outputCount) {
  // ~vbytes for P2WPKH: 10.5 + 68*in + 31*out (approx)
  const vbytes = Math.ceil(10.5 + 68 * inputCount + 31 * outputCount);
  let satPerVb = 8;
  try {
    const res = await fetch("https://mempool.space/api/v1/fees/recommended");
    if (res.ok) {
      const j = await res.json();
      satPerVb = Math.max(1, Number(j.halfHourFee || j.economyFee || j.fastestFee) || 8);
    }
  } catch (_) {}
  return Math.max(200, Math.ceil(vbytes * satPerVb));
}

async function sendBtcNative(acc, toAddr, amountBtc) {
  if (!window.GladiatorBtc || !GladiatorBtc.buildSignedP2wpkhTx) {
    throw new Error("Bitcoin send library missing — reload extension");
  }
  if (!acc.bitcoin || !acc.bitcoin.privateKey || !acc.bitcoin.address) {
    throw new Error("No Bitcoin key on this wallet");
  }
  if (!isValidBtcAddress(toAddr)) throw new Error("Invalid Bitcoin address");
  const fromAddress = acc.bitcoin.address;
  const amountSats = Number(uiAmountToRaw(amountBtc, 8));
  if (!(amountSats > 0)) throw new Error("Amount too small");
  const utxos = (await fetchBtcUtxos(fromAddress)).filter((u) => u.value > 0);
  if (!utxos.length) throw new Error("No Bitcoin UTXOs to spend");
  // Fee for worst-case inputs we'll likely need; recompute after selection below.
  let feeSats = await fetchBtcFeeSats(Math.min(utxos.length, 3), 2);
  let built;
  try {
    built = GladiatorBtc.buildSignedP2wpkhTx({
      privKeyHex: acc.bitcoin.privateKey,
      fromAddress,
      toAddress: toAddr,
      amountSats,
      feeSats,
      utxos,
    });
  } catch (err) {
    // Retry with higher fee if selection failed oddly
    feeSats = await fetchBtcFeeSats(utxos.length, 2);
    built = GladiatorBtc.buildSignedP2wpkhTx({
      privKeyHex: acc.bitcoin.privateKey,
      fromAddress,
      toAddress: toAddr,
      amountSats,
      feeSats,
      utxos,
    });
  }
  const posts = [
    "https://blockstream.info/api/tx",
    "https://mempool.space/api/tx",
  ];
  let lastErr = null;
  for (const url of posts) {
    try {
      const res = await fetch(url, { method: "POST", body: built.hex });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "broadcast http " + res.status);
      return (text || built.txid || "").trim();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Bitcoin broadcast failed");
}

async function suiRpcCall(method, params, rpcs) {
  const list =
    rpcs && rpcs.length
      ? rpcs
      : [
          "https://rpc-mainnet.suiscan.xyz",
          "https://sui-mainnet-endpoint.blockvision.org",
        ];
  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || method + " failed");
      return j.result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(method + " failed");
}

function b64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(u8) {
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function hexToBytesLocal(h) {
  const s = String(h || "").replace(/^0x/i, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

function signSuiTransactionBytes(txBytesB64, secretKeyHex) {
  if (!window.nacl || !nacl.sign || !nacl.sign.detached) {
    throw new Error("nacl missing for Sui signing");
  }
  if (!window.MultiHD || !MultiHD.blake2b256) {
    throw new Error("MultiHD blake2b missing for Sui signing");
  }
  const txBytes = b64ToBytes(txBytesB64);
  // Intent: scope=TransactionData(0), version=V0(0), app=Sui(0) — wait, IntentScope TransactionData = 0
  // Actually Sui IntentScope::TransactionData = 0, but many docs use [0,0,0]. 
  // Official: IntentMessage = Intent(scope, version, app_id) || BCS(tx)
  // scope TransactionData = 0, version V0 = 0, app Sui = 0
  const intent = new Uint8Array([0, 0, 0]);
  const msg = new Uint8Array(intent.length + txBytes.length);
  msg.set(intent, 0);
  msg.set(txBytes, intent.length);
  const digest = MultiHD.blake2b256(msg);
  let sk = hexToBytesLocal(secretKeyHex);
  // nacl secretKey is 64 bytes (seed||pub); accept 32-byte seed too
  if (sk.length === 32) {
    const kp = nacl.sign.keyPair.fromSeed(sk);
    sk = kp.secretKey;
  }
  if (sk.length !== 64) throw new Error("Bad Sui secret key length");
  const sig = nacl.sign.detached(digest, sk);
  const pub = sk.slice(32);
  const flagSigPub = new Uint8Array(1 + sig.length + pub.length);
  flagSigPub[0] = 0x00; // ED25519
  flagSigPub.set(sig, 1);
  flagSigPub.set(pub, 1 + sig.length);
  return bytesToB64(flagSigPub);
}

async function fetchSuiTokenHoldings(address, rpcs) {
  const balances = await suiRpcCall("suix_getAllBalances", [address], rpcs);
  const list = Array.isArray(balances) ? balances : [];
  const out = [];
  for (const row of list) {
    const coinType = String(row.coinType || "");
    if (!coinType || coinType === "0x2::sui::SUI") continue;
    const raw = String(row.totalBalance || "0");
    let meta = null;
    try {
      meta = await suiRpcCall("suix_getCoinMetadata", [coinType], rpcs);
    } catch (_) {
      meta = null;
    }
    const decimals = meta && meta.decimals != null ? Number(meta.decimals) : 9;
    const amount = formatTokenRawAmount(raw, decimals);
    if (!(amount > 0)) continue;
    const symbol =
      (meta && meta.symbol) ||
      (coinType.split("::").pop() || "COIN").slice(0, 12);
    out.push({
      chainId: "sui",
      mint: coinType,
      amount,
      decimals,
      symbol,
      name: (meta && meta.name) || symbol,
      logo: (meta && meta.iconUrl) || null,
      usd: null,
      kind: "sui_coin",
    });
  }
  return out.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
}

async function sendSuiNative(acc, toAddr, amountSui) {
  if (!acc.sui || !acc.sui.secretKey || !acc.sui.address) {
    throw new Error("No Sui key on this wallet");
  }
  if (!isValidSuiAddress(toAddr)) throw new Error("Invalid Sui address");
  const from = acc.sui.address;
  const rpcs = (CHAINS.find((c) => c.id === "sui") || {}).rpcs;
  const amountMist = uiAmountToRaw(amountSui, 9);
  if (!(amountMist > 0n)) throw new Error("Amount too small");
  const coinsPage = await suiRpcCall(
    "suix_getCoins",
    [from, "0x2::sui::SUI"],
    rpcs
  );
  const coins = (coinsPage && coinsPage.data) || [];
  if (!coins.length) throw new Error("No SUI coins to spend");
  // Prefer a single coin large enough; else paySui with several.
  const gasBudget = "10000000";
  let built;
  const big = coins.find((c) => BigInt(c.balance || "0") > amountMist + 1000000n);
  if (big) {
    built = await suiRpcCall(
      "unsafe_transferSui",
      [from, big.coinObjectId, gasBudget, toAddr, amountMist.toString()],
      rpcs
    );
  } else {
    const ids = coins.map((c) => c.coinObjectId);
    built = await suiRpcCall(
      "unsafe_paySui",
      [from, ids, [toAddr], [amountMist.toString()], gasBudget],
      rpcs
    );
  }
  const txBytes = built && built.txBytes;
  if (!txBytes) throw new Error("Sui tx build returned empty");
  const signature = signSuiTransactionBytes(txBytes, acc.sui.secretKey);
  const executed = await suiRpcCall(
    "sui_executeTransactionBlock",
    [
      txBytes,
      [signature],
      { showEffects: true, showInput: false },
      "WaitForLocalExecution",
    ],
    rpcs
  );
  const digest =
    (executed && executed.digest) ||
    (executed && executed.effects && executed.effects.transactionDigest) ||
    "";
  if (!digest) throw new Error("Sui send returned no digest");
  const status =
    executed &&
    executed.effects &&
    executed.effects.status &&
    executed.effects.status.status;
  if (status && status !== "success") {
    throw new Error(
      "Sui tx " +
        status +
        ((executed.effects.status.error && ": " + executed.effects.status.error) || "")
    );
  }
  return digest;
}

async function sendSuiCoin(acc, holding, toAddr, amountUi) {
  if (!acc.sui || !acc.sui.secretKey || !acc.sui.address) {
    throw new Error("No Sui key on this wallet");
  }
  if (!isValidSuiAddress(toAddr)) throw new Error("Invalid Sui address");
  const coinType = holding && holding.mint;
  if (!coinType) throw new Error("Missing Sui coin type");
  const from = acc.sui.address;
  const rpcs = (CHAINS.find((c) => c.id === "sui") || {}).rpcs;
  const decimals = holding.decimals != null ? Number(holding.decimals) : 9;
  const amountRaw = uiAmountToRaw(amountUi, decimals).toString();
  const coinsPage = await suiRpcCall("suix_getCoins", [from, coinType], rpcs);
  const coins = (coinsPage && coinsPage.data) || [];
  if (!coins.length) throw new Error("No coins of this type to spend");
  const ids = coins.map((c) => c.coinObjectId);
  const gasBudget = "20000000";
  // gas paid in SUI — omit gas object (node picks)
  const built = await suiRpcCall(
    "unsafe_pay",
    [from, ids, [toAddr], [amountRaw], null, gasBudget],
    rpcs
  );
  const txBytes = built && built.txBytes;
  if (!txBytes) throw new Error("Sui token tx build returned empty");
  const signature = signSuiTransactionBytes(txBytes, acc.sui.secretKey);
  const executed = await suiRpcCall(
    "sui_executeTransactionBlock",
    [
      txBytes,
      [signature],
      { showEffects: true },
      "WaitForLocalExecution",
    ],
    rpcs
  );
  const digest = (executed && executed.digest) || "";
  if (!digest) throw new Error("Sui token send returned no digest");
  return digest;
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

  // Hard chain guards — never let SOL/ETH/BTC address rules bleed across.
  try {
    if (chain.kind === "evm") {
      if (!window.ethers || !ethers.isAddress(to)) {
        throw new Error("Invalid Ethereum address — use a 0x… address on " + chain.name);
      }
      if (isLedgerAccount(acc) && !ledgerHasEvm(acc)) {
        throw new Error(
          "Ledger EVM not linked — open the Ethereum app and tap Link EVM before sending"
        );
      }
      if (!chainKeyAddress(acc, chain)) {
        throw new Error("No " + chain.name + " address on this wallet");
      }
    } else if (chain.kind === "solana") {
      if (/^0x/i.test(to)) {
        throw new Error("That looks like an Ethereum address — switch to an EVM chain to send it");
      }
      if (isLedgerAccount(acc) && !(acc.solana && acc.solana.publicKey)) {
        throw new Error("Ledger Solana not connected — Connect Ledger with the Solana app open");
      }
    } else if (chain.kind === "bitcoin") {
      if (isLedgerAccount(acc)) {
        throw new Error("Ledger Bitcoin is not supported yet — use a seed wallet for BTC");
      }
      if (/^0x/i.test(to)) {
        throw new Error("That looks like an Ethereum address — Bitcoin needs a bc1… / BTC address");
      }
    } else if (chain.kind === "sui") {
      if (isLedgerAccount(acc)) {
        throw new Error("Ledger Sui is not supported yet — use a seed wallet for Sui");
      }
    }
  } catch (guardErr) {
    const msg = String(guardErr && guardErr.message ? guardErr.message : guardErr);
    if (status) status.textContent = msg;
    showToast(msg);
    return;
  }

  if (btn) btn.disabled = true;
  if (status) {
    status.textContent =
      isLedgerAccount(acc) && chain.kind === "evm"
        ? "Approve on Ledger (Ethereum app)…"
        : isLedgerAccount(acc) && chain.kind === "solana"
          ? "Approve on Ledger (Solana app)…"
          : "Signing & broadcasting…";
  }
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
    } else if (chain.kind === "bitcoin") {
      if (assetVal !== "native") {
        throw new Error("Bitcoin only sends BTC (no tokens on this chain)");
      }
      sig = await sendBtcNative(acc, to, amountRaw);
      symbol = "BTC";
      explorer = "https://mempool.space/tx/" + sig;
    } else if (chain.kind === "sui") {
      if (assetVal === "native") {
        sig = await sendSuiNative(acc, to, amountRaw);
        symbol = "SUI";
      } else {
        if (!holding || holding.kind !== "sui_coin") {
          throw new Error("Coin not in holdings");
        }
        sig = await sendSuiCoin(acc, holding, to, amountRaw);
        symbol = holding.symbol || "COIN";
      }
      explorer = "https://suiscan.xyz/mainnet/tx/" + sig;
    } else {
      if (assetVal === "native") {
        sig = await sendEvmNative(acc, chain, to, amountRaw);
        symbol = chain.symbol || "ETH";
      } else {
        if (!holding || holding.kind !== "erc20") {
          throw new Error("Token not in holdings");
        }
        sig = await sendEvmToken(acc, chain, holding, to, amountRaw);
        symbol = holding.symbol || "TOKEN";
      }
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
      chainId: chain && chain.id,
      counterparty: to,
    });
    if ($("sendAmount")) $("sendAmount").value = "";
    updateSendUsdEstimate();
    await refreshBalance();
  } catch (err) {
    console.error("[send]", err);
    const msg = friendlySendError(err, chain);
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
  const sym = holding.symbol || chain.symbol || "asset";
  el.textContent =
    "Available: " +
    label +
    " " +
    sym +
    (holding.kind === "native" && !(amt > 0)
      ? " · deposit " + sym + " via Receive before sending"
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
      : abs >= 0.0001
        ? abs.toFixed(6).replace(/\.?0+$/, "")
        : abs.toFixed(8).replace(/\.?0+$/, "");
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + body + (symbol ? " " + symbol : "");
}

function formatHistoryQty(amount) {
  const abs = Math.abs(Number(amount) || 0);
  if (abs >= 1) return abs.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (abs >= 0.0001) return abs.toFixed(6).replace(/\.?0+$/, "");
  return abs.toFixed(8).replace(/\.?0+$/, "");
}

function mintHistorySymbol(mint) {
  if (!mint) return "SOL";
  if (mint === USDC_MINT) return "USDC";
  if (mint === WSOL_MINT) return "SOL";
  return (MINT_META[mint] && MINT_META[mint].symbol) || shortAddr(mint);
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

function collectParsedIxs(tx) {
  const message = tx && tx.transaction && tx.transaction.message;
  const out = [];
  const push = (ix) => {
    if (ix) out.push(ix);
  };
  ((message && message.instructions) || []).forEach(push);
  ((tx.meta && tx.meta.innerInstructions) || []).forEach((group) => {
    (group.instructions || []).forEach(push);
  });
  return out;
}

/** Best-effort counterparty wallet for a Solana send/receive. */
function solanaCounterparty(owner, tx, direction, mint) {
  if (!owner || !tx) return "";
  const ixs = collectParsedIxs(tx);
  for (const ix of ixs) {
    const p = ix.parsed;
    if (!p || !p.info) continue;
    const prog = String(ix.program || ix.programId || "");
    const typ = String(p.type || "");
    const info = p.info;
    if (typ === "transfer" && /system/i.test(prog)) {
      if (direction === "in" && info.destination === owner && info.source) {
        return String(info.source);
      }
      if (direction === "out" && info.source === owner && info.destination) {
        return String(info.destination);
      }
    }
    if (
      (typ === "transfer" || typ === "transferChecked") &&
      /token/i.test(prog)
    ) {
      const auth = info.authority || info.multisigAuthority || "";
      const src = info.source || info.sourceAccount || "";
      const dst = info.destination || info.destinationAccount || "";
      if (direction === "out" && auth === owner) {
        // Prefer destination token-account owner from balances.
        const destOwner = solanaTokenAccountOwner(tx, dst) || "";
        if (destOwner && destOwner !== owner) return destOwner;
      }
      if (direction === "in") {
        // Only treat this ix as our receive when the destination ATA is ours.
        const destOwner = solanaTokenAccountOwner(tx, dst) || "";
        if (destOwner && destOwner !== owner) continue;
        if (!destOwner && auth === owner) continue;
        const srcOwner = solanaTokenAccountOwner(tx, src) || auth || "";
        if (srcOwner && srcOwner !== owner) return srcOwner;
      }
    }
  }

  // Opposite token-balance mover on the same mint.
  if (mint) {
    const deltas = {};
    const bump = (row, sign) => {
      if (!row || !row.owner || row.mint !== mint || row.owner === owner) return;
      const amt =
        Number(
          row.uiTokenAmount && row.uiTokenAmount.uiAmountString != null
            ? row.uiTokenAmount.uiAmountString
            : row.uiTokenAmount && row.uiTokenAmount.uiAmount
        ) || 0;
      deltas[row.owner] = (deltas[row.owner] || 0) + sign * amt;
    };
    (tx.meta.preTokenBalances || []).forEach((t) => bump(t, -1));
    (tx.meta.postTokenBalances || []).forEach((t) => bump(t, 1));
    const want = direction === "in" ? -1 : 1;
    let best = "";
    let bestAbs = 0;
    Object.keys(deltas).forEach((o) => {
      const d = deltas[o];
      if (d * want > 0 && Math.abs(d) > bestAbs) {
        bestAbs = Math.abs(d);
        best = o;
      }
    });
    if (best) return best;
  }

  // Opposite native SOL mover (simple transfers).
  if (!mint) {
    const message = tx.transaction && tx.transaction.message;
    const accountKeys = (message && message.accountKeys) || [];
    const keys = accountKeys.map((k) =>
      typeof k === "string" ? k : k.pubkey || ""
    );
    const pre = tx.meta.preBalances || [];
    const post = tx.meta.postBalances || [];
    const want = direction === "in" ? -1 : 1;
    let best = "";
    let bestAbs = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k || k === owner) continue;
      const d = ((post[i] || 0) - (pre[i] || 0)) / 1e9;
      if (d * want > 0 && Math.abs(d) > bestAbs && Math.abs(d) > 0.000001) {
        bestAbs = Math.abs(d);
        best = k;
      }
    }
    if (best) return best;
  }

  // Fee payer as weak fallback on receives.
  if (direction === "in") {
    const message = tx.transaction && tx.transaction.message;
    const accountKeys = (message && message.accountKeys) || [];
    const feePayer =
      typeof accountKeys[0] === "string"
        ? accountKeys[0]
        : accountKeys[0] && accountKeys[0].pubkey;
    if (feePayer && feePayer !== owner) return String(feePayer);
  }
  return "";
}

function solanaTokenAccountOwner(tx, tokenAccount) {
  if (!tokenAccount || !tx || !tx.meta) return "";
  const rows = [].concat(
    tx.meta.preTokenBalances || [],
    tx.meta.postTokenBalances || []
  );
  const message = tx.transaction && tx.transaction.message;
  const accountKeys = (message && message.accountKeys) || [];
  const keys = accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey || ""
  );
  for (const row of rows) {
    if (row == null || row.accountIndex == null) continue;
    if (keys[row.accountIndex] === tokenAccount && row.owner) return row.owner;
  }
  return "";
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
    const amt =
      Number(
        t.uiTokenAmount && t.uiTokenAmount.uiAmountString != null
          ? t.uiTokenAmount.uiAmountString
          : t.uiTokenAmount && t.uiTokenAmount.uiAmount
      ) || 0;
    tokenMap[mint] = (tokenMap[mint] || 0) - amt;
  });
  postTok.forEach((t) => {
    if (t.owner !== owner) return;
    const mint = t.mint;
    const amt =
      Number(
        t.uiTokenAmount && t.uiTokenAmount.uiAmountString != null
          ? t.uiTokenAmount.uiAmountString
          : t.uiTokenAmount && t.uiTokenAmount.uiAmount
      ) || 0;
    tokenMap[mint] = (tokenMap[mint] || 0) + amt;
  });
  // Collapse WSOL into native SOL for cleaner swap pairs.
  if (tokenMap[WSOL_MINT]) {
    solDelta += tokenMap[WSOL_MINT];
    delete tokenMap[WSOL_MINT];
  }
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

  const outs = tokenDeltas
    .filter((t) => t.delta < 0)
    .sort((a, b) => a.delta - b.delta);
  const ins = tokenDeltas
    .filter((t) => t.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  // Native SOL moves larger than rent/fee noise count as a swap leg.
  const SOL_LEG_EPS = 0.0005;
  const hasSolOut = solDelta < -SOL_LEG_EPS;
  const hasSolIn = solDelta > SOL_LEG_EPS;
  const looksLikeSwap =
    isSwap || (outs.length && ins.length) || (outs.length && hasSolIn) || (ins.length && hasSolOut);

  let type = "transfer";
  let direction = "out";
  let amount = 0;
  let symbol = "SOL";
  let mint = null;
  let fromAmount = null;
  let fromSymbol = null;
  let fromMint = null;
  let toAmount = null;
  let toSymbol = null;
  let toMint = null;

  if (looksLikeSwap) {
    let sold = outs[0] || null;
    let bought = ins[0] || null;
    if (!sold && hasSolOut) {
      sold = { mint: null, delta: solDelta, isSol: true };
    }
    if (!bought && hasSolIn) {
      bought = { mint: null, delta: solDelta, isSol: true };
    }
    // Token↔token swaps still spend a little SOL on fees — don't treat fee as a leg
    // when both token sides already exist.
    if (sold && bought && sold.mint && bought.mint) {
      // keep token legs
    } else if (sold && !bought && hasSolIn) {
      bought = { mint: null, delta: solDelta, isSol: true };
    } else if (bought && !sold && hasSolOut) {
      sold = { mint: null, delta: solDelta, isSol: true };
    }

    if (sold) {
      fromAmount = Math.abs(sold.delta);
      fromMint = sold.isSol ? null : sold.mint;
      fromSymbol = sold.isSol ? "SOL" : mintHistorySymbol(sold.mint);
    }
    if (bought) {
      toAmount = Math.abs(bought.delta);
      toMint = bought.isSol ? null : bought.mint;
      toSymbol = bought.isSol ? "SOL" : mintHistorySymbol(bought.mint);
    }

    if (fromSymbol === "SOL" && toSymbol && toSymbol !== "SOL") {
      type = "buy";
      direction = "in";
    } else if (toSymbol === "SOL" && fromSymbol && fromSymbol !== "SOL") {
      type = "sell";
      direction = "out";
    } else {
      type = "swap";
      direction = "out";
    }

    amount = fromAmount != null ? fromAmount : toAmount != null ? toAmount : Math.abs(solDelta);
    symbol = fromSymbol || toSymbol || "TOKEN";
    mint = fromMint || toMint;
  } else if (tokenDeltas.length) {
    const primary = tokenDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    direction = primary.delta >= 0 ? "in" : "out";
    type = direction === "in" ? "receive" : "send";
    amount = Math.abs(primary.delta);
    mint = primary.mint;
    symbol = mintHistorySymbol(mint);
  } else if (Math.abs(solDelta) > 1e-9) {
    direction = solDelta >= 0 ? "in" : "out";
    type = direction === "in" ? "receive" : "send";
    amount = Math.abs(solDelta);
    symbol = "SOL";
  } else {
    return null;
  }

  const counterparty =
    type === "send" || type === "receive" || type === "transfer"
      ? solanaCounterparty(owner, tx, direction, mint)
      : "";

  return {
    type,
    direction,
    amount,
    symbol,
    mint,
    solDelta,
    fromAmount,
    fromSymbol,
    fromMint,
    toAmount,
    toSymbol,
    toMint,
    counterparty: counterparty || "",
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

function historyExplorerTxUrl(sig, chain) {
  if (!sig) return "#";
  const c = chain || activeChain(STATE);
  if (!c || c.kind === "solana") return "https://solscan.io/tx/" + sig;
  if (c.id === "ethereum") return "https://etherscan.io/tx/" + sig;
  if (c.id === "polygon") return "https://polygonscan.com/tx/" + sig;
  if (c.id === "base") return "https://basescan.org/tx/" + sig;
  if (c.id === "robinhood") return "https://robinhoodchain.blockscout.com/tx/" + sig;
  if (c.kind === "bitcoin") return "https://mempool.space/tx/" + sig;
  if (c.kind === "sui") return "https://suiscan.xyz/mainnet/tx/" + sig;
  return "#";
}

function clearHistoryForSwitch(msg) {
  historySeq += 1;
  TX_HISTORY = [];
  paintHistory();
  const status = $("historyStatus");
  if (status) status.textContent = msg || "Loading history…";
}

function historyPartyLine(tx) {
  const party = String(tx.counterparty || "").trim();
  if (!party) return "";
  const isPair =
    tx.type === "swap" || tx.type === "buy" || tx.type === "sell";
  if (isPair) return "";
  const label = tx.direction === "in" ? "from" : "to";
  return (
    '<span class="history-party" title="' +
    escapeHtml(party) +
    '">' +
    label +
    " " +
    escapeHtml(shortAddr(party)) +
    "</span>"
  );
}

function paintHistory() {
  const list = $("historyList");
  const status = $("historyStatus");
  const chain = activeChain(STATE);
  if (!list) return;
  list.innerHTML = "";
  if (!TX_HISTORY.length) {
    list.innerHTML =
      '<li class="history-empty">No transactions yet for this wallet on ' +
      ((chain && chain.name) || "this chain") +
      ".</li>";
    if (status) {
      status.textContent =
        "No activity yet for this wallet · " + ((chain && chain.name) || "chain") + ".";
    }
    return;
  }
  TX_HISTORY.forEach((tx) => {
    const li = document.createElement("li");
    const isPair =
      (tx.type === "swap" || tx.type === "buy" || tx.type === "sell") &&
      (tx.fromSymbol || tx.toSymbol);
    const dirClass = isPair ? "is-swap" : tx.direction === "in" ? "is-in" : "is-out";
    const title =
      tx.type === "buy" || tx.type === "sell" || tx.type === "swap"
        ? "swap"
        : tx.type || "transfer";
    let amt;
    let amtClass = "";
    if (isPair) {
      const left =
        tx.fromAmount != null && tx.fromSymbol
          ? formatHistoryQty(tx.fromAmount) + " " + tx.fromSymbol
          : "";
      const right =
        tx.toAmount != null && tx.toSymbol
          ? formatHistoryQty(tx.toAmount) + " " + tx.toSymbol
          : "";
      if (left && right) {
        amt = left + " → " + right;
        amtClass = " history-pair";
      } else if (right) {
        amt = formatHistoryAmount(tx.toAmount, tx.toSymbol);
      } else if (left) {
        amt = formatHistoryAmount(-tx.fromAmount, tx.fromSymbol);
      } else {
        amt =
          tx.amount > 0
            ? formatHistoryAmount(tx.direction === "in" ? tx.amount : -tx.amount, tx.symbol)
            : "—";
      }
    } else {
      amt =
        tx.amount > 0
          ? formatHistoryAmount(tx.direction === "in" ? tx.amount : -tx.amount, tx.symbol)
          : "—";
    }
    const when = formatHistoryTime(tx.when);
    const href = historyExplorerTxUrl(tx.sig, chain);
    const party = historyPartyLine(tx);
    li.innerHTML =
      '<a class="history-row ' +
      dirClass +
      '" href="' +
      href +
      '" target="_blank" rel="noopener">' +
      '<span class="history-ico" aria-hidden="true">' +
      historyIcon(isPair ? "swap" : tx.type) +
      "</span>" +
      '<span class="history-meta"><strong>' +
      title +
      "</strong><span>" +
      (when || shortAddr(tx.sig || "")) +
      (tx.sig ? " · " + shortAddr(tx.sig) : "") +
      "</span>" +
      party +
      "</span>" +
      '<span class="history-vals"><strong class="' +
      amtClass.trim() +
      '">' +
      amt +
      "</strong><span>" +
      (tx.status || "confirmed") +
      "</span></span></a>";
    list.appendChild(li);
  });
  if (status) {
    status.textContent =
      TX_HISTORY.length +
      " recent · " +
      ((chain && chain.name) || "chain") +
      (TX_HISTORY.length === 1 ? " transaction" : " transactions");
  }
}

function parseBlockscoutTime(ts) {
  if (ts == null || ts === "") return 0;
  if (typeof ts === "number") {
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  }
  const ms = Date.parse(String(ts));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/** Native + ERC-20 activity via Blockscout (ETH / Base / Polygon / Robinhood). */
async function fetchEvmHistoryForOwner(owner, chain) {
  const base = String((chain && chain.blockscout) || "").replace(/\/$/, "");
  if (!base || !owner) return [];
  const addr = String(owner).toLowerCase();
  const out = [];
  const seen = new Set();

  try {
    const res = await fetch(
      base + "/api/v2/addresses/" + encodeURIComponent(owner) + "/transactions"
    );
    if (res.ok) {
      const j = await res.json();
      const items = Array.isArray(j.items) ? j.items : [];
      for (const item of items) {
        const hash = String(item.hash || "");
        if (!hash || seen.has("tx:" + hash)) continue;
        const from = String((item.from && item.from.hash) || "").toLowerCase();
        const to = String((item.to && item.to.hash) || "").toLowerCase();
        const amount = formatTokenRawAmount(item.value || "0", 18);
        // Skip pure contract calls with zero value (token transfers covered below).
        if (!(amount > 0)) continue;
        seen.add("tx:" + hash);
        const direction = to === addr && from !== addr ? "in" : "out";
        const ok =
          item.status === "ok" ||
          item.result === "success" ||
          item.result == null;
        const fromRaw = String((item.from && item.from.hash) || "");
        const toRaw = String((item.to && item.to.hash) || "");
        out.push({
          sig: hash,
          type: direction === "in" ? "receive" : "send",
          direction,
          amount,
          symbol: chain.symbol || "ETH",
          when: parseBlockscoutTime(item.timestamp),
          status: ok ? "confirmed" : "failed",
          chainId: chain.id,
          counterparty: direction === "in" ? fromRaw : toRaw,
        });
      }
    }
  } catch (err) {
    console.warn("[evm-history txs]", chain && chain.id, err);
  }

  try {
    const res = await fetch(
      base +
        "/api/v2/addresses/" +
        encodeURIComponent(owner) +
        "/token-transfers?type=ERC-20"
    );
    if (res.ok) {
      const j = await res.json();
      const items = Array.isArray(j.items) ? j.items : [];
      for (const item of items) {
        const hash = String(item.transaction_hash || item.tx_hash || "");
        const tok = item.token || {};
        const mint = String(tok.address_hash || tok.address || "").toLowerCase();
        const key = "tt:" + hash + ":" + mint + ":" + (item.log_index || "");
        if (!hash || seen.has(key)) continue;
        seen.add(key);
        const from = String((item.from && item.from.hash) || "").toLowerCase();
        const to = String((item.to && item.to.hash) || "").toLowerCase();
        const decimals = Number(
          (item.total && item.total.decimals) != null
            ? item.total.decimals
            : tok.decimals != null
              ? tok.decimals
              : 18
        );
        const raw =
          (item.total && (item.total.value || item.total.raw)) ||
          item.total ||
          "0";
        const amount = formatTokenRawAmount(
          typeof raw === "object" ? raw.value || "0" : raw,
          decimals
        );
        if (!(amount > 0)) continue;
        const direction = to === addr && from !== addr ? "in" : "out";
        const fromRaw = String((item.from && item.from.hash) || "");
        const toRaw = String((item.to && item.to.hash) || "");
        out.push({
          sig: hash,
          type: direction === "in" ? "receive" : "send",
          direction,
          amount,
          symbol: tok.symbol || "TOKEN",
          mint: mint || null,
          when: parseBlockscoutTime(item.timestamp),
          status: "confirmed",
          chainId: chain.id,
          counterparty: direction === "in" ? fromRaw : toRaw,
        });
      }
    }
  } catch (err) {
    console.warn("[evm-history transfers]", chain && chain.id, err);
  }

  return out.sort((a, b) => (b.when || 0) - (a.when || 0)).slice(0, 40);
}

/** Bitcoin history via mempool/blockstream address txs (native BTC). */
async function fetchBtcHistoryForOwner(owner, chain) {
  if (!owner) return [];
  const bases = [
    "https://mempool.space/api",
    String((chain && chain.rpc) || "https://blockstream.info/api").replace(/\/$/, ""),
  ];
  let items = null;
  let lastErr = null;
  for (const base of bases) {
    try {
      const res = await fetch(base + "/address/" + encodeURIComponent(owner) + "/txs");
      if (!res.ok) throw new Error("btc history http " + res.status);
      const j = await res.json();
      if (Array.isArray(j)) {
        items = j;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (!items) {
    if (lastErr) console.warn("[btc-history]", lastErr);
    return [];
  }

  const me = String(owner);
  const out = [];
  for (const tx of items.slice(0, 40)) {
    const vinAddrs = [];
    let spent = 0;
    for (const vin of tx.vin || []) {
      const a =
        (vin.prevout && vin.prevout.scriptpubkey_address) ||
        vin.address ||
        "";
      if (!a) continue;
      if (a === me) spent += Number((vin.prevout && vin.prevout.value) || 0) || 0;
      else if (!vinAddrs.includes(a)) vinAddrs.push(a);
    }
    const voutAddrs = [];
    let received = 0;
    for (const vout of tx.vout || []) {
      const a = vout.scriptpubkey_address || "";
      if (!a) continue;
      if (a === me) received += Number(vout.value) || 0;
      else if (!voutAddrs.includes(a)) voutAddrs.push(a);
    }
    const net = received - spent;
    if (Math.abs(net) < 1) continue;
    const direction = net > 0 ? "in" : "out";
    const amount = Math.abs(net) / 1e8;
    const st = tx.status || {};
    out.push({
      sig: tx.txid || tx.hash || "",
      type: direction === "in" ? "receive" : "send",
      direction,
      amount,
      symbol: "BTC",
      when: Number(st.block_time) || 0,
      status: st.confirmed === false ? "pending" : "confirmed",
      chainId: (chain && chain.id) || "bitcoin",
      counterparty:
        direction === "in"
          ? vinAddrs[0] || ""
          : voutAddrs[0] || "",
    });
  }
  return out;
}

function suiOwnerAddress(owner) {
  if (!owner) return "";
  if (typeof owner === "string") return owner;
  if (owner.AddressOwner) return String(owner.AddressOwner);
  if (owner.ObjectOwner) return String(owner.ObjectOwner);
  return "";
}

function suiCoinSymbol(coinType) {
  const t = String(coinType || "");
  if (!t || /::sui::SUI$/i.test(t)) return "SUI";
  const parts = t.split("::");
  return parts[parts.length - 1] || "TOKEN";
}

async function suiQueryTxBlocks(filter, rpcs, limit) {
  const list =
    rpcs && rpcs.length
      ? rpcs
      : [
          "https://sui-mainnet-endpoint.blockvision.org",
          "https://rpc-mainnet.suiscan.xyz",
        ];
  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_queryTransactionBlocks",
          params: [
            {
              filter,
              options: {
                showInput: true,
                showEffects: true,
                showBalanceChanges: true,
              },
              limit: limit || 20,
              order: "descending",
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("sui history http " + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || "sui rpc");
      return (j.result && j.result.data) || [];
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) console.warn("[sui-history]", lastErr);
  return [];
}

/** Sui native / coin transfers via balanceChanges. */
async function fetchSuiHistoryForOwner(owner, chain) {
  if (!owner) return [];
  const rpcs = (chain && chain.rpcs) || [];
  const [fromBlocks, toBlocks] = await Promise.all([
    suiQueryTxBlocks({ FromAddress: owner }, rpcs, 20),
    suiQueryTxBlocks({ ToAddress: owner }, rpcs, 20),
  ]);
  const byDigest = {};
  [...fromBlocks, ...toBlocks].forEach((b) => {
    if (b && b.digest) byDigest[b.digest] = b;
  });

  const me = String(owner).toLowerCase();
  const out = [];
  for (const block of Object.values(byDigest)) {
    const changes = block.balanceChanges || [];
    const byCoin = {};
    for (const c of changes) {
      const addr = suiOwnerAddress(c.owner);
      if (!addr) continue;
      const coin = c.coinType || "0x2::sui::SUI";
      if (!byCoin[coin]) byCoin[coin] = {};
      const amt = Number(c.amount) || 0;
      byCoin[coin][addr] = (byCoin[coin][addr] || 0) + amt;
    }

    let best = null;
    for (const coin of Object.keys(byCoin)) {
      const map = byCoin[coin];
      let myDelta = 0;
      for (const a of Object.keys(map)) {
        if (a.toLowerCase() === me) myDelta += map[a];
      }
      if (!myDelta) continue;
      if (!best || Math.abs(myDelta) > Math.abs(best.myDelta)) {
        best = { coin, myDelta, map };
      }
    }
    if (!best) continue;

    const direction = best.myDelta > 0 ? "in" : "out";
    const want = direction === "in" ? -1 : 1;
    let counterparty = "";
    let bestAbs = 0;
    for (const a of Object.keys(best.map)) {
      if (a.toLowerCase() === me) continue;
      const d = best.map[a];
      if (d * want > 0 && Math.abs(d) > bestAbs) {
        bestAbs = Math.abs(d);
        counterparty = a;
      }
    }
    if (!counterparty && direction === "in") {
      const sender =
        block.transaction &&
        block.transaction.data &&
        block.transaction.data.sender;
      if (sender && String(sender).toLowerCase() !== me) {
        counterparty = String(sender);
      }
    }

    const decimals = await suiCoinDecimals(best.coin, rpcs);
    const ts = Number(
      (block.timestampMs != null
        ? block.timestampMs
        : block.checkpointTimestampMs) || 0
    );
    out.push({
      sig: block.digest,
      type: direction === "in" ? "receive" : "send",
      direction,
      amount: Math.abs(best.myDelta) / Math.pow(10, decimals),
      symbol: suiCoinSymbol(best.coin),
      mint: /::sui::SUI$/i.test(best.coin) ? null : best.coin,
      when: ts > 1e12 ? Math.floor(ts / 1000) : ts,
      status:
        block.effects &&
        block.effects.status &&
        block.effects.status.status === "failure"
          ? "failed"
          : "confirmed",
      chainId: (chain && chain.id) || "sui",
      counterparty: counterparty || "",
    });
  }

  return out.sort((a, b) => (b.when || 0) - (a.when || 0)).slice(0, 40);
}

const SUI_COIN_DECIMALS = { "0x2::sui::SUI": 9 };

async function suiCoinDecimals(coinType, rpcs) {
  const t = String(coinType || "");
  if (!t || /::sui::SUI$/i.test(t)) return 9;
  if (SUI_COIN_DECIMALS[t] != null) return SUI_COIN_DECIMALS[t];
  try {
    const meta = await suiRpcCall("suix_getCoinMetadata", [t], rpcs);
    const d = Number(meta && meta.decimals);
    if (Number.isFinite(d) && d >= 0 && d <= 18) {
      SUI_COIN_DECIMALS[t] = d;
      return d;
    }
  } catch (_) {}
  // Safer unknown fallback than assuming 9 for every coin.
  SUI_COIN_DECIMALS[t] = 6;
  return 6;
}

async function refreshHistory() {
  const status = $("historyStatus");
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  if (!acc || !chain) {
    TX_HISTORY = [];
    paintHistory();
    if (status) status.textContent = "No active wallet.";
    return;
  }

  const seq = ++historySeq;
  TX_HISTORY = [];
  paintHistory();
  if (status) {
    status.textContent =
      "Loading " + (chain.name || "chain") + " history…";
  }

  const local = loadLocalTxs()
    .filter((t) => {
      if (t.accountId && t.accountId !== acc.id) return false;
      // Prefer explicit chainId; legacy local Solana sends (no chainId) only on Solana.
      if (t.chainId) return t.chainId === chain.id;
      return chain.kind === "solana";
    })
    .map((t) => ({
      sig: t.sig,
      type: t.type || "send",
      direction: t.direction || "out",
      amount: Number(t.amount) || 0,
      symbol: t.symbol || chain.symbol || "",
      when: t.when ? Math.floor(Number(t.when) / (Number(t.when) > 1e12 ? 1000 : 1)) : 0,
      status: "local",
      chainId: t.chainId || chain.id,
      counterparty: t.counterparty || t.to || t.from || "",
    }));

  const mergeLocal = (remote) => {
    const byKey = {};
    (remote || []).forEach((t) => {
      const k = (t.sig || "") + ":" + (t.mint || t.symbol || "");
      byKey[k] = t;
    });
    local.forEach((t) => {
      const k = (t.sig || "") + ":" + (t.mint || t.symbol || "");
      if (!byKey[k]) byKey[k] = t;
      else if (!byKey[k].counterparty && t.counterparty) {
        byKey[k].counterparty = t.counterparty;
      }
    });
    return Object.values(byKey).sort((a, b) => (b.when || 0) - (a.when || 0));
  };

  // EVM: Blockscout native + ERC-20 history for this wallet/chain only.
  if (chain.kind === "evm") {
    const owner = acc.evm && acc.evm.address;
    if (!owner) {
      if (seq !== historySeq) return;
      TX_HISTORY = local;
      paintHistory();
      if (status) status.textContent = "No EVM address on this wallet.";
      return;
    }
    try {
      const remote = await fetchEvmHistoryForOwner(owner, chain);
      if (seq !== historySeq) return;
      TX_HISTORY = mergeLocal(remote);
      paintHistory();
      if (status && !TX_HISTORY.length) {
        status.textContent =
          "No " + chain.name + " activity yet for this wallet.";
      }
    } catch (err) {
      console.warn("[history-evm]", err);
      if (seq !== historySeq) return;
      TX_HISTORY = local.sort((a, b) => (b.when || 0) - (a.when || 0));
      paintHistory();
      if (status) {
        status.textContent =
          "History sync failed: " +
          (err && err.message ? err.message : "explorer error") +
          (local.length ? " · showing local sends" : "");
      }
    }
    return;
  }

  // Bitcoin: mempool/blockstream address txs.
  if (chain.kind === "bitcoin") {
    const owner = acc.bitcoin && acc.bitcoin.address;
    if (!owner) {
      if (seq !== historySeq) return;
      TX_HISTORY = local;
      paintHistory();
      if (status) status.textContent = "No Bitcoin address on this wallet.";
      return;
    }
    try {
      const remote = await fetchBtcHistoryForOwner(owner, chain);
      if (seq !== historySeq) return;
      TX_HISTORY = mergeLocal(remote);
      paintHistory();
      if (status && !TX_HISTORY.length) {
        status.textContent =
          "No " + chain.name + " activity yet for this wallet.";
      }
    } catch (err) {
      console.warn("[history-btc]", err);
      if (seq !== historySeq) return;
      TX_HISTORY = local.sort((a, b) => (b.when || 0) - (a.when || 0));
      paintHistory();
      if (status) {
        status.textContent =
          "History sync failed: " +
          (err && err.message ? err.message : "explorer error") +
          (local.length ? " · showing local sends" : "");
      }
    }
    return;
  }

  // Sui: balance-change history via RPC.
  if (chain.kind === "sui") {
    const owner = acc.sui && acc.sui.address;
    if (!owner) {
      if (seq !== historySeq) return;
      TX_HISTORY = local;
      paintHistory();
      if (status) status.textContent = "No Sui address on this wallet.";
      return;
    }
    try {
      const remote = await fetchSuiHistoryForOwner(owner, chain);
      if (seq !== historySeq) return;
      TX_HISTORY = mergeLocal(remote);
      paintHistory();
      if (status && !TX_HISTORY.length) {
        status.textContent =
          "No " + chain.name + " activity yet for this wallet.";
      }
    } catch (err) {
      console.warn("[history-sui]", err);
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
    return;
  }

  // Other non-Solana chains: local sends for now.
  if (chain.kind !== "solana") {
    if (seq !== historySeq) return;
    TX_HISTORY = local.sort((a, b) => (b.when || 0) - (a.when || 0));
    paintHistory();
    if (status && !TX_HISTORY.length) {
      status.textContent =
        "No " + chain.name + " activity stored for this wallet yet.";
    }
    return;
  }

  const owner = acc.solana && acc.solana.publicKey;
  if (!owner) {
    if (seq !== historySeq) return;
    TX_HISTORY = local;
    paintHistory();
    if (status) status.textContent = "No Solana address on this wallet.";
    return;
  }
  if (!isValidSolanaAddress(owner)) {
    if (status) status.textContent = "Invalid wallet address — cannot load history.";
    return;
  }

  try {
    const solChain = CHAINS.find((c) => c.id === "solana") || chain;
    const rpcs = solRpcList(solChain);
    const remote = await fetchHistoryForOwner(owner, rpcs);
    if (seq !== historySeq) return;
    const bySig = {};
    remote.forEach((t) => {
      bySig[t.sig] = t;
    });
    local.forEach((t) => {
      if (!bySig[t.sig]) bySig[t.sig] = t;
      else if (!bySig[t.sig].counterparty && t.counterparty) {
        bySig[t.sig].counterparty = t.counterparty;
      }
    });
    // Prefetch mint meta for nicer symbols
    const mints = [];
    Object.values(bySig).forEach((t) => {
      [t.mint, t.fromMint, t.toMint].forEach((m) => {
        if (m && m !== USDC_MINT && m !== WSOL_MINT) mints.push(m);
      });
    });
    if (mints.length) await resolveMintMeta(mints);
    Object.values(bySig).forEach((t) => {
      if (t.mint && MINT_META[t.mint] && MINT_META[t.mint].symbol) {
        t.symbol = MINT_META[t.mint].symbol;
      }
      if (t.fromMint && MINT_META[t.fromMint] && MINT_META[t.fromMint].symbol) {
        t.fromSymbol = MINT_META[t.fromMint].symbol;
      }
      if (t.toMint && MINT_META[t.toMint] && MINT_META[t.toMint].symbol) {
        t.toSymbol = MINT_META[t.toMint].symbol;
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
    label.textContent =
      name + (isLedgerAccount(acc) ? " · Ledger" : "") + " · " + shortAddr(addr);
    label.title = addr || "";
  }
  const sub = $("acctDrawerSub");
  if (sub) {
    const ledgerN = (STATE.accounts || []).filter(isLedgerAccount).length;
    sub.textContent =
      (STATE.accounts && STATE.accounts.length
        ? STATE.accounts.length +
          " wallet" +
          (STATE.accounts.length === 1 ? "" : "s") +
          (ledgerN ? " · " + ledgerN + " Ledger" : "")
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
    const dappConnected = CONNECTED_ACCOUNT_IDS.has(a.id);
    btn.className = "acct-drawer-item" + (active ? " is-active" : "");
    btn.dataset.accountId = a.id;
    btn.innerHTML =
      '<img class="acct-drawer-avatar" src="' +
      extAssetUrl("icons/gladiator.png") +
      '?v=4" alt="" width="36" height="36" />' +
      '<img class="acct-drawer-chain" src="' +
      chainLogoSrc(activeChain(STATE)) +
      '" alt="" width="16" height="16" title="' +
      escapeHtml((activeChain(STATE) && activeChain(STATE).name) || "") +
      '" />' +
      (dappConnected
        ? '<span class="acct-drawer-conn-dot" aria-hidden="true"></span>'
        : "") +
      '<span class="acct-drawer-meta"><strong>' +
      escapeHtml(accountDisplayName(a, idx)) +
      (active ? " · Active" : "") +
      ledgerBadgeHtml(a) +
      "</strong><span>" +
      shortAddr(addr) +
      (isLedgerAccount(a) ? " · Ledger" : "") +
      "</span></span>" +
      '<span class="acct-drawer-bal" data-drawer-bal="' +
      a.id +
      '">' +
      bal +
      " SOL</span>";
    btn.addEventListener("click", async () => {
      if (a.id !== STATE.activeAccountId) {
        STATE.activeAccountId = a.id;
        clearHistoryForSwitch("Loading history for " + (a.name || "wallet") + "…");
        RECEIVE_ALERT = null;
        paintReceiveAlert();
        await storageSet(STATE);
        await ensureLedgerChainAllowed(a);
        await refreshAll();
        showToast(
          "Active · " +
            (a.name || "Wallet") +
            (isLedgerAccount(a)
              ? " · Ledger" + (ledgerHasEvm(a) ? " · EVM linked" : "")
              : "")
        );
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
  // Keep green dots aligned with live inject/WC sessions.
  refreshWcConnections({ ensure: false })
    .then(() => paintAcctDrawerConnDots())
    .catch(() => {});
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
  paintImportFields();
  if ($("acctDrawerRoot") && !$("acctDrawerRoot").hidden) {
    renderAcctDrawerList();
  }
  paintSendContacts();
  // Re-scope Connected sites / Connections list to the newly active wallet.
  if (LAST_CONNECTION_ITEMS.length || $("balanceConnStatus") || $("wcConnectionsList")) {
    paintWcConnectionsList(LAST_CONNECTION_ITEMS);
  }
}

function positionChainPickerMenu() {
  const menu = $("chainPickerMenu");
  const btn = $("chainPickerBtn");
  if (!menu || !btn || menu.hidden) return;
  const rect = btn.getBoundingClientRect();
  const top = Math.max(8, Math.round(rect.bottom + 6));
  menu.style.position = "fixed";
  menu.style.left = "10px";
  menu.style.right = "10px";
  menu.style.width = "auto";
  menu.style.maxWidth = "none";
  menu.style.transform = "none";
  menu.style.top = top + "px";
  menu.style.zIndex = "400";
  menu.classList.add("is-open");
}

function toggleChainPicker() {
  const menu = $("chainPickerMenu");
  const btn = $("chainPickerBtn");
  const bar = document.querySelector(".chain-bar, .switcher-bar");
  const top = document.querySelector(".topbar");
  const center = document.querySelector(".topbar-center");
  if (!menu || !btn) return;
  const open = menu.hidden;
  if (open) paintChainPicker();
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (bar) bar.classList.toggle("is-chain-open", open);
  if (top) top.classList.toggle("is-chain-open", open);
  if (center) center.classList.toggle("is-chain-open", open);
  if (open) {
    // Keep menu under <body> so shell overflow can't clip/block it in the popup.
    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    positionChainPickerMenu();
  } else {
    menu.classList.remove("is-open");
    menu.removeAttribute("style");
    const picker = $("chainPicker");
    if (picker && menu.parentElement !== picker) picker.appendChild(menu);
  }
}

function closeChainPicker() {
  const menu = $("chainPickerMenu");
  const btn = $("chainPickerBtn");
  const bar = document.querySelector(".chain-bar, .switcher-bar");
  if (menu) {
    menu.hidden = true;
    menu.classList.remove("is-open");
    menu.removeAttribute("style");
    const picker = $("chainPicker");
    if (picker && menu.parentElement !== picker) picker.appendChild(menu);
  }
  if (btn) btn.setAttribute("aria-expanded", "false");
  if (bar) bar.classList.remove("is-chain-open");
  document.querySelector(".topbar")?.classList.remove("is-chain-open");
  document.querySelector(".topbar-center")?.classList.remove("is-chain-open");
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
  const nextChain = CHAINS.find((c) => c.id === chainId);
  const accPre = activeAccount(STATE);
  if (accPre && isLedgerAccount(accPre) && nextChain) {
    if (nextChain.kind === "evm" && !ledgerHasEvm(accPre)) {
      // Chain click is a user gesture — run Link EVM now (Ethereum app must be open).
      try {
        showToast("Open Ethereum app on Ledger… linking EVM");
        await linkLedgerEvm(accPre, { skipRefresh: true });
      } catch (err) {
        showToast(String(err && err.message ? err.message : err));
        return;
      }
      if (!ledgerHasEvm(accPre)) {
        showToast("Link EVM failed — open Ethereum app, then try again");
        return;
      }
    }
    if (nextChain.kind === "bitcoin" || nextChain.kind === "sui") {
      showToast(
        "Ledger " +
          nextChain.name +
          " not supported yet — use a seed wallet, or stay on Solana / EVM"
      );
      return;
    }
  }
  STATE.activeChainId = chainId;
  const sel = $("chainSelect");
  if (sel) sel.value = chainId;
  // Token detail is chain-scoped — leave it when switching networks.
  if (TOKEN_DETAIL) {
    TOKEN_DETAIL = null;
    const tokenPanel = $("panel-token");
    if (tokenPanel && !tokenPanel.hidden) go("home", { skipScroll: true });
  }
  // Drop prior chain/wallet history immediately so it cannot bleed across.
  clearHistoryForSwitch(
    "Loading " + ((nextChain && nextChain.name) || "chain") + " history…"
  );
  // Receive banner is per wallet+chain — hide while switching.
  if (
    RECEIVE_ALERT &&
    RECEIVE_ALERT.chainId &&
    RECEIVE_ALERT.chainId !== chainId
  ) {
    RECEIVE_ALERT = null;
    paintReceiveAlert();
  }
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
    } else if (acc && isLedgerAccount(acc)) {
      showToast("Ledger " + chain.name + " not supported yet");
    } else if (acc && !acc.mnemonic) {
      showToast("Import seed phrase for " + chain.name);
    } else if (!window.MultiHD) {
      showToast("Chain lib missing — reload extension pack");
    } else {
      showToast("No " + chain.name + " address — try Generate/Import seed");
    }
  } else if (chain && chain.kind === "evm" && acc && isLedgerAccount(acc)) {
    showToast(chain.name + " · Ledger · " + shortAddr(chainKeyAddress(acc, chain)));
  } else {
    showToast(chain.name);
  }
  // If seed/keys panel is open, swap to this chain's private key only.
  const backup = $("backupReveal");
  if (backup && !backup.hidden) {
    paintBackupChainKey(activeAccount(STATE));
  }
  paintImportFields();
  await refreshAll();
  // Manage tokens list is wallet + chain scoped — refresh if Settings is open.
  if ($("panel-settings") && !$("panel-settings").hidden) {
    paintManageTokens();
  }
}


function renderReceive() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const depositAddr = chainKeyAddress(acc, chain) || "";
  const full = $("fullAddr");
  if (full) {
    if (depositAddr) {
      full.textContent = depositAddr;
    } else if (acc && isLedgerAccount(acc) && chain.kind === "evm") {
      full.textContent =
        "Ledger EVM not linked — open the Ethereum app on your Nano, then tap Link EVM (same Account #).";
    } else if (acc && isLedgerAccount(acc) && (chain.kind === "bitcoin" || chain.kind === "sui")) {
      full.textContent =
        "Ledger " + chain.name + " is not supported yet — use a seed wallet for this chain.";
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
      '<img class="photon-wallet-logo" src="' +
      extAssetUrl("icons/gladiator.png") +
      '?v=4" alt="" width="22" height="22" />' +
      '<span class="photon-name">' +
      escapeHtml(accountDisplayName(a, idx)) +
      ledgerBadgeHtml(a) +
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
      (isLedgerAccount(a)
        ? '<button type="button" class="photon-icon-btn" data-act="ledger" title="Ledger path" aria-label="Ledger path">◌</button>'
        : '<button type="button" class="photon-icon-btn" data-act="key" title="View seed / keys">◉</button>') +
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
        if (act === "ledger") {
          STATE.activeAccountId = a.id;
          await storageSet(STATE);
          paintSwitchers();
          paintLedgerSeedUi();
          showToast(
            "Seed phrase is not stored in the wallet for Ledger accounts. Connect your Ledger device."
          );
          const status = $("accountStatus");
          if (status) {
            status.textContent =
              "Seed phrase is not stored in the wallet for Ledger accounts. Connect your Ledger device. · path " +
              ((a.ledger && a.ledger.path) ||
                "44'/501'/" + ledgerAccountIndex(a) + "'");
          }
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
      clearHistoryForSwitch("Loading history for " + (a.name || "wallet") + "…");
      RECEIVE_ALERT = null;
      paintReceiveAlert();
      await storageSet(STATE);
      await ensureLedgerChainAllowed(a);
      await refreshAll();
      showToast(
        "Active · " +
          a.name +
          (isLedgerAccount(a)
            ? " · Ledger" + (ledgerHasEvm(a) ? " · EVM linked" : " · Solana")
            : "")
      );
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
  paintLedgerSeedUi();
}

function askRemoveAccount(label, opts) {
  const ledger = !!(opts && opts.ledger);
  const warn = ledger
    ? "This removes the Ledger account from this wallet. Your keys stay on the device — reconnect Ledger anytime. Seed phrase is not stored in the wallet for Ledger accounts."
    : "Doing so will remove the account from the wallet. If you didn't back up the seed phrase, you may lose funds permanently.";
  const modal = $("removeModal");
  const title = $("removeModalTitle");
  const body = $("removeModalBody");
  const yes = $("removeModalYes");
  const no = $("removeModalNo");
  if (!modal || !yes || !no) {
    return Promise.resolve(
      window.confirm("Remove " + label + "?\n\n" + warn)
    );
  }
  if (title) title.textContent = "Remove " + label + "?";
  if (body) {
    body.textContent = warn;
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
  const ok = await askRemoveAccount(label, { ledger: isLedgerAccount(acc) });
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
  const status = $("accountStatus");
  let acc = null;
  // Random wallets almost never collide; retry a few times just in case.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = await createAccount(nextGeneratedAccountLabel());
    if (findDuplicateAccount(candidate, STATE.accounts)) continue;
    acc = candidate;
    break;
  }
  if (!acc) {
    showToast("Could not generate a unique wallet");
    if (status) status.textContent = "Generate failed — address already exists.";
    return;
  }
  STATE.accounts.push(acc);
  STATE.activeAccountId = acc.id;
  await storageSet(STATE);
  await refreshAll();
  hideBackup();
  showToast("Generated " + acc.name + " · tap Show seed phrase to view");
  go("activity");
  if (status) {
    status.textContent =
      "Wallet created. Tap Show seed phrase when you are ready to back it up.";
  }
}

async function importAccountFromSecrets() {
  const status = $("accountStatus");
  const chain = activeChain(STATE);
  const kind = (chain && chain.kind) || "solana";
  const mnemonicIn = ($("importMnemonic")?.value || "").trim();
  const solSecret =
    kind === "solana" ? ($("importSolSecret")?.value || "").trim() : "";
  const evmPk = kind === "evm" ? ($("importEvmSecret")?.value || "").trim() : "";
  const btcPk =
    kind === "bitcoin" ? ($("importBtcSecret")?.value || "").trim() : "";
  const suiPk = kind === "sui" ? ($("importSuiSecret")?.value || "").trim() : "";
  const chainKey = solSecret || evmPk || btcPk || suiPk;
  if (!mnemonicIn && !chainKey) {
    if (status) {
      status.textContent =
        "Paste a seed phrase or the " +
        ((chain && chain.name) || "chain") +
        " private key.";
    }
    return;
  }
  try {
    let acc;
    if (mnemonicIn) {
      const keys = await keysFromMnemonic(mnemonicIn, 0);
      acc = {
        id: uid(),
        name: "Imported " + (STATE.accounts.length + 1),
        type: "software",
        createdAt: new Date().toISOString(),
        mnemonic: keys.mnemonic,
        solana: keys.solana,
        evm: keys.evm,
        bitcoin: keys.bitcoin,
        sui: keys.sui,
      };
    } else {
      const empty = emptyChainKeys();
      if (kind === "solana") {
        empty.solana = importSolanaFromSecret(solSecret);
      } else if (kind === "evm") {
        empty.evm = importEvmFromPrivateKey(evmPk);
      } else if (kind === "bitcoin") {
        empty.bitcoin = await importBitcoinFromPrivateKey(btcPk);
      } else if (kind === "sui") {
        empty.sui = importSuiFromPrivateKey(suiPk);
      } else {
        throw new Error("Unsupported chain for key import");
      }
      acc = {
        id: uid(),
        name: "Imported " + (STATE.accounts.length + 1),
        type: "software",
        createdAt: new Date().toISOString(),
        mnemonic: "",
        solana: empty.solana,
        evm: empty.evm,
        bitcoin: empty.bitcoin,
        sui: empty.sui,
      };
    }
    const dup = findDuplicateAccount(acc, STATE.accounts);
    if (dup) {
      STATE.activeAccountId = dup.id;
      if (chain && chain.id) STATE.activeChainId = chain.id;
      await storageSet(STATE);
      await refreshAll();
      const addr = chainKeyAddress(dup, activeChain(STATE));
      if (status) {
        status.textContent =
          "Already imported · " +
          (dup.name || shortAddr(addr) || "wallet") +
          " — switched to existing unique wallet.";
      }
      showToast("Wallet already exists · opened existing");
      go("activity");
      return;
    }
    STATE.accounts.push(acc);
    STATE.activeAccountId = acc.id;
    // Stay on the chain the user imported for (seed still ok on any chain).
    if (chain && chain.id) STATE.activeChainId = chain.id;
    await storageSet(STATE);
    if ($("importMnemonic")) $("importMnemonic").value = "";
    if ($("importSolSecret")) $("importSolSecret").value = "";
    if ($("importEvmSecret")) $("importEvmSecret").value = "";
    if ($("importBtcSecret")) $("importBtcSecret").value = "";
    if ($("importSuiSecret")) $("importSuiSecret").value = "";
    await refreshAll();
    const addr = chainKeyAddress(acc, activeChain(STATE));
    if (status) {
      status.textContent = mnemonicIn
        ? "Seed imported — all chain addresses derived."
        : "Imported " +
          ((chain && chain.name) || "wallet") +
          (addr ? ": " + shortAddr(addr) : "") +
          " — kept in localStorage.";
    }
    showToast(
      mnemonicIn
        ? "Seed phrase imported"
        : ((chain && chain.name) || "Wallet") + " key imported"
    );
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
  if (acc && isLedgerAccount(acc)) {
    throw new Error(
      "Seed phrase is not stored in the wallet for Ledger accounts. Connect your Ledger device."
    );
  }
  if (!acc) {
    acc = await createAccount(nextGeneratedAccountLabel());
    STATE.accounts.push(acc);
    STATE.activeAccountId = acc.id;
    await storageSet(STATE);
    return acc;
  }
  if (acc.mnemonic && String(acc.mnemonic).trim().split(/\s+/).length >= 12) {
    return acc;
  }
  // Key-only wallets cannot reverse into a mnemonic — mint a seeded wallet and show it.
  const seeded = await createAccount(
    acc.name && !acc.mnemonic
      ? acc.name + " seed"
      : nextGeneratedAccountLabel()
  );
  STATE.accounts.push(seeded);
  STATE.activeAccountId = seeded.id;
  await storageSet(STATE);
  showToast("New 24-word seed wallet ready");
  return seeded;
}

/** Private key for the currently selected chain only (never mix Solana/EVM/etc.). */
function chainPrivateKeyInfo(account, chain) {
  const c = chain || activeChain(STATE);
  const acc = account || activeAccount(STATE);
  if (!acc || !c) {
    return { label: "Private key", value: "", note: "", copyLabel: "Copy private key" };
  }
  if (c.kind === "solana") {
    return {
      label: "Solana secret key",
      value: (acc.solana && acc.solana.secretKey) || "",
      note: "",
      copyLabel: "Copy Solana secret",
    };
  }
  if (c.kind === "evm") {
    return {
      label: (c.name || "EVM") + " private key",
      value: (acc.evm && acc.evm.privateKey) || "",
      note:
        "This key is for EVM networks only (Ethereum, Base, Polygon, Robinhood). Solana uses a different key.",
      copyLabel: "Copy " + (c.symbol || "EVM") + " key",
    };
  }
  if (c.kind === "bitcoin") {
    return {
      label: "Bitcoin private key",
      value: (acc.bitcoin && acc.bitcoin.privateKey) || "",
      note: "",
      copyLabel: "Copy Bitcoin key",
    };
  }
  if (c.kind === "sui") {
    return {
      label: "Sui private key",
      value: (acc.sui && acc.sui.secretKey) || "",
      note: "",
      copyLabel: "Copy Sui key",
    };
  }
  return { label: "Private key", value: "", note: "", copyLabel: "Copy private key" };
}

function paintBackupChainKey(account) {
  const info = chainPrivateKeyInfo(account, activeChain(STATE));
  const label = $("backupChainKeyLabel");
  const box = $("backupChainSecret");
  const note = $("backupChainKeyNote");
  const copyBtn = $("copyChainSecretBtn");
  if (label) label.textContent = info.label;
  if (box) {
    box.value = info.value || "";
    box.rows = info.value && info.value.length > 80 ? 3 : 2;
  }
  if (note) {
    if (info.note) {
      note.hidden = false;
      note.textContent = info.note;
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }
  if (copyBtn) copyBtn.textContent = info.copyLabel || "Copy private key";
}

async function showBackup() {
  const current = activeAccount(STATE);
  if (isLedgerAccount(current)) {
    hideBackup();
    paintLedgerSeedUi();
    showToast(
      "Seed phrase is not stored in the wallet for Ledger accounts. Connect your Ledger device."
    );
    const status = $("accountStatus");
    if (status) {
      status.textContent =
        "Seed phrase is not stored in the wallet for Ledger accounts. Connect your Ledger device.";
    }
    return;
  }
  try {
    await requireUnlocked("backup");
  } catch (err) {
    showToast(String(err && err.message ? err.message : err));
    return;
  }
  const acc = await ensureActiveSeededAccount();
  paintSwitchers();
  renderAccountsPanel();
  const box = $("backupReveal");
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
  paintBackupChainKey(acc);
  if (label) {
    label.textContent =
      (acc && acc.name ? acc.name + " · " : "") +
      (wordCount ? wordCount + "-word seed phrase" : "Private key");
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
    const chain = activeChain(STATE);
    status.textContent = phrase
      ? wordCount +
        "-word seed visible — private key shown for " +
        ((chain && chain.name) || "this chain") +
        " only."
      : "Private key for " +
        ((chain && chain.name) || "this chain") +
        " visible — keep offline.";
  }
}

function hideBackup() {
  const box = $("backupReveal");
  if (box) box.hidden = true;
  const chainKey = $("backupChainSecret");
  const seedBox = $("backupMnemonic");
  if (chainKey) chainKey.value = "";
  if (seedBox) seedBox.value = "";
  const note = $("backupChainKeyNote");
  if (note) {
    note.hidden = true;
    note.textContent = "";
  }
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
        '<img class="settings-wallet-logo" src="' +
        extAssetUrl("icons/gladiator.png") +
        '?v=4" alt="" width="28" height="28" />' +
        '<div class="settings-wallet-meta">' +
        '<input type="text" maxlength="32" data-rename-input="' +
        escapeHtml(a.id) +
        '" value="' +
        escapeHtml(accountDisplayName(a, idx)) +
        '" aria-label="Rename wallet" />' +
        (isLedgerAccount(a)
          ? '<span class="ledger-badge">Ledger</span>'
          : "") +
        (active ? '<span class="photon-sub">Active</span>' : "") +
        (isLedgerAccount(a)
          ? '<span class="photon-sub">path ' +
            escapeHtml(
              (a.ledger && a.ledger.path) ||
                "44'/501'/" + ledgerAccountIndex(a) + "'"
            ) +
            "</span>"
          : "") +
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

function paintManageTokens() {
  const list = $("manageTokenList");
  const empty = $("manageTokenEmpty");
  if (!list) return;
  list.innerHTML = "";
  const chain = activeChain(STATE);
  const acc = activeAccount(STATE);
  const chainId = (chain && chain.id) || (STATE && STATE.activeChainId) || "";
  const catalog = (STATE && STATE.tokenCatalog) || {};

  // Current wallet + current chain only (live HOLDINGS from last Sync).
  const liveByKey = {};
  (HOLDINGS || []).forEach((h) => {
    if (!h || !h.mint || h.kind === "native") return;
    const cid = h.chainId || chainId;
    if (cid !== chainId) return;
    liveByKey[tokenVisibilityKey(cid, h.mint)] = h;
  });

  // Live HOLDINGS are already scoped to the active wallet + last Sync chain.
  // Hidden tokens remain in HOLDINGS (only filtered on Home), so they still appear here.
  const rows = Object.keys(liveByKey)
    .map((key) => {
      const live = liveByKey[key];
      const c = catalog[key] || {};
      return {
        key,
        chainId,
        mint: live.mint,
        symbol: live.symbol || c.symbol || "TOKEN",
        name: live.name || c.name || "Token",
        kind: live.kind || c.kind || "token",
        logo: live.logo || c.logo || null,
        amount: Number(live.amount) || 0,
      };
    })
    .filter((r) => r.mint)
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));

  if (empty) {
    empty.hidden = rows.length > 0;
    const walletName = (acc && acc.name) || "wallet";
    const chainName = (chain && chain.name) || "chain";
    empty.textContent = rows.length
      ? ""
      : "No tokens for " +
        walletName +
        " on " +
        chainName +
        " yet — open Home and Sync, then come back.";
  }
  if (!rows.length) return;

  rows.forEach((t) => {
    const shown = !isTokenHidden(t.chainId, t.mint);
    const li = document.createElement("li");
    li.className = "settings-token" + (shown ? "" : " is-hidden-token");
    const amt =
      t.amount != null
        ? (t.amount >= 1
            ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })
            : t.amount.toFixed(6)) +
          " " +
          t.symbol
        : t.symbol;
    li.innerHTML =
      '<span class="settings-token-logo">' +
      tokenLogoHtml(t) +
      "</span>" +
      '<span class="settings-token-meta"><strong>' +
      (t.symbol || "TOKEN") +
      "</strong><span>" +
      ((chain && chain.name) || t.chainId || "chain") +
      " · " +
      shortAddr(t.mint) +
      (t.amount != null ? " · " + amt : "") +
      "</span></span>" +
      '<label class="token-toggle" title="' +
      (shown ? "Hide from wallet" : "Show in wallet") +
      '">' +
      '<input type="checkbox" data-token-toggle="1" data-chain="' +
      String(t.chainId).replace(/"/g, "") +
      '" data-mint="' +
      String(t.mint).replace(/"/g, "") +
      '"' +
      (shown ? " checked" : "") +
      " />" +
      '<span class="token-switch-track" aria-hidden="true"></span>' +
      "<span>" +
      (shown ? "Shown" : "Hidden") +
      "</span></label>";
    list.appendChild(li);
  });
}

function paintSettings() {
  paintAddressBook();
  paintWalletRenameList();
  paintManageTokens();
  paintWcSettings();
}

function openSettings(opts) {
  closeAddrMenu();
  const focus =
    opts && (opts.focusWc || opts.focusManageTokens) ? true : false;
  go("settings", { skipScroll: focus });
  paintSettings();
  if (opts && opts.focusManageTokens) {
    scrollSettingsTo("manageTokensBlock");
    showToast("Manage tokens");
  } else if (opts && opts.focusWc) {
    scrollSettingsTo("wcSettingsBlock");
    setTimeout(() => {
      const uri = $("wcUri");
      if (uri) uri.focus();
    }, 80);
  }
}

/** In-page Jupiter provider signing — uses the same keys as WalletConnect. */
async function ensureProviderSignerAccount() {
  if (isVaultLocked()) {
    openVaultModal("migrate");
    throw new Error("Enter your old password once to restore signing keys");
  }
  const acc = activeAccount(STATE);
  if (!acc) throw new Error("No wallet — create/import one in Gladiator");
  if (isLedgerAccount(acc)) {
    if (!(acc.solana && acc.solana.publicKey)) {
      throw new Error("Ledger account missing public key — reconnect Ledger");
    }
    return acc;
  }
  if (await ensureAccountSolanaFromMnemonic(acc)) {
    try {
      await storageSet(STATE);
    } catch (_) {}
  }
  if (!(acc.solana && acc.solana.secretKey)) {
    go("settings");
    showToast("Import seed phrase, Solana secret, or Connect Ledger");
    throw new Error("No Solana key — open Gladiator and create/import a wallet");
  }
  return acc;
}

async function signSolanaTxBytesWithLedger(bytes, acc) {
  ensureBrowserBuffer();
  const api = await ensureLedgerSupported();
  const idx = ledgerAccountIndex(acc);
  const { PublicKey, Transaction, VersionedTransaction } = solanaWeb3;
  const pubkey = new PublicKey(acc.solana.publicKey);
  showToast("Approve on Ledger…");

  if (VersionedTransaction) {
    try {
      const vtx = VersionedTransaction.deserialize(bytes);
      const msg = vtx.message.serialize();
      const msgBytes = msg instanceof Uint8Array ? msg : new Uint8Array(msg);
      const signed = await api.signTransaction(idx, msgBytes);
      const sig = signed.signatureBytes
        ? new Uint8Array(signed.signatureBytes)
        : Base58.decode(signed.signature);
      vtx.addSignature(pubkey, sig);
      const out = vtx.serialize();
      return bytesToBase64(out instanceof Uint8Array ? out : new Uint8Array(out));
    } catch (err) {
      // Fall through to legacy only when deserialize failed.
      try {
        VersionedTransaction.deserialize(bytes);
        throw err;
      } catch (inner) {
        if (inner === err) throw err;
      }
    }
  }

  const tx = Transaction.from(bytes);
  await signLegacyTxWithLedger(tx, acc);
  const raw = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return bytesToBase64(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

async function handleProviderSignRequest(method, params) {
  const p = params || {};
  if (method === "getPubkey") {
    const acc = await ensureProviderSignerAccount();
    return { publicKey: acc.solana.publicKey };
  }

  const acc = await ensureProviderSignerAccount();
  const ledger = isLedgerAccount(acc);
  const kp = ledger ? null : solanaKeypairFromAccount(acc);

  if (method === "signTransaction") {
    const bytes = decodeWcTxBytes(p.transaction);
    if (ledger) {
      const signedB64 = await signSolanaTxBytesWithLedger(bytes, acc);
      return { signedTransaction: signedB64 };
    }
    const signed = signSolanaTxBytes(bytes, kp);
    return { signedTransaction: signed.transactionBase64 };
  }

  if (method === "signAllTransactions") {
    const list = p.transactions || [];
    if (!list.length) throw new Error("No transactions to sign");
    const signedTransactions = [];
    for (const item of list) {
      const blob = typeof item === "string" ? item : item && item.transaction;
      const bytes = decodeWcTxBytes(blob);
      if (ledger) {
        signedTransactions.push(await signSolanaTxBytesWithLedger(bytes, acc));
      } else {
        signedTransactions.push(signSolanaTxBytes(bytes, kp).transactionBase64);
      }
    }
    return { signedTransactions };
  }

  if (method === "signAndSendTransaction") {
    const bytes = decodeWcTxBytes(p.transaction);
    const b64 = ledger
      ? await signSolanaTxBytesWithLedger(bytes, acc)
      : signSolanaTxBytes(bytes, kp).transactionBase64;
    const solChain = CHAINS.find((c) => c.id === "solana");
    const rpcs = solRpcList(solChain);
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
  }

  if (method === "signMessage") {
    if (ledger) {
      throw new Error("Ledger message signing — open Gladiator and use Solana app support");
    }
    if (!window.nacl) throw new Error("nacl missing");
    const msg = base64ToBytes(p.message);
    const sig = nacl.sign.detached(msg, kp.secretKey);
    return { signature: bytesToBase64(sig) };
  }

  throw new Error("Unsupported provider method: " + method);
}

function wireProviderSignBridge() {
  if (!(IS_EXTENSION && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage)) {
    return;
  }
  if (wireProviderSignBridge._wired) return;
  wireProviderSignBridge._wired = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "gladiator-wallet-sign") return;
    handleProviderSignRequest(msg.method, msg.params || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  });
}

const LEDGER_REQ_KEY = "gladiator_ledger_sign_req";
const LEDGER_RES_KEY = "gladiator_ledger_sign_res";
const DAPP_APPROVE_REQ_KEY = "gladiator_dapp_approve_req";
const DAPP_APPROVE_RES_KEY = "gladiator_dapp_approve_res";
let ledgerSignBusy = false;
let dappApproveBusy = false;
let pendingDappApproveId = null;
let pendingLedgerSignReq = null;

/**
 * Keep Ledger on a supported chain. Solana always; EVM when linked;
 * Bitcoin/Sui fall back to Solana until those Ledger apps are wired.
 */
async function ensureLedgerUsesSolana(account) {
  return ensureLedgerChainAllowed(account, { preferSolana: true });
}

async function ensureLedgerChainAllowed(account, opts) {
  const acc = account || activeAccount(STATE);
  if (!isLedgerAccount(acc) || !STATE) return false;
  const preferSolana = !!(opts && opts.preferSolana);
  const chain = CHAINS.find((c) => c.id === STATE.activeChainId) || activeChain(STATE);
  if (chain && ledgerSupportsChain(acc, chain) && !preferSolana) return false;
  if (preferSolana && STATE.activeChainId === "solana") return false;
  if (!preferSolana && chain && chain.kind === "evm" && !ledgerHasEvm(acc)) {
    showToast("Ledger EVM not linked — open Ethereum app, then Link EVM");
  } else if (!preferSolana && chain && (chain.kind === "bitcoin" || chain.kind === "sui")) {
    showToast("Ledger " + chain.name + " not supported yet — using Solana");
  }
  if (STATE.activeChainId === "solana") return false;
  STATE.activeChainId = "solana";
  const sel = $("chainSelect");
  if (sel) sel.value = "solana";
  try {
    await storageSet(STATE);
  } catch (_) {}
  paintActiveChainAddress();
  paintChainPicker();
  paintBalances();
  return true;
}

function openDappApproveModal(req) {
  const modal = $("dappApproveModal");
  const title = $("dappApproveTitle");
  const body = $("dappApproveBody");
  const logo = $("dappApproveLogo");
  const hostEl = $("dappApproveHost");
  if (title) title.textContent = (req && req.title) || "Approve request?";
  if (body) {
    body.textContent =
      (req && req.body) ||
      ((req && req.origin) || "A site") + " is requesting wallet access.";
  }
  const iconSrc =
    localDappIconSrc({ origin: req && req.origin, url: req && req.origin, name: req && req.title }) ||
    extAssetUrl("icons/gladiator.png");
  if (logo) {
    logo.src = iconSrc;
    logo.hidden = false;
  }
  if (hostEl) {
    try {
      hostEl.textContent = req && req.origin ? new URL(req.origin).hostname : "";
    } catch (_) {
      hostEl.textContent = (req && req.origin) || "";
    }
  }
  pendingDappApproveId = req && req.id ? req.id : null;
  if (modal) modal.hidden = false;
  // Keep the in-wallet UI focused on the approval (don't leave users on a blank panel).
  try {
    if (typeof go === "function") go("home", { skipScroll: true });
  } catch (_) {}
}

function closeDappApproveModal() {
  const modal = $("dappApproveModal");
  if (modal) modal.hidden = true;
}

async function respondDappApprove(approved, error) {
  const id = pendingDappApproveId;
  pendingDappApproveId = null;
  closeDappApproveModal();
  if (!id) return;
  try {
    await new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [DAPP_APPROVE_RES_KEY]: {
            id,
            approved: !!approved,
            session: !!approved,
            error: error || (approved ? "" : "User rejected the request"),
          },
          [DAPP_APPROVE_REQ_KEY]: null,
        },
        () => resolve()
      );
    });
  } catch (_) {}
  showToast(approved ? "Approved" : "Rejected");
}

async function processDappApproveRequest(req) {
  if (!req || !req.id || dappApproveBusy) return;
  // Ignore stale requests.
  if (req.at && Date.now() - Number(req.at) > 2 * 60 * 1000) {
    try {
      chrome.storage.local.set({ [DAPP_APPROVE_REQ_KEY]: null });
    } catch (_) {}
    return;
  }
  dappApproveBusy = true;
  try {
    openDappApproveModal(req);
  } finally {
    dappApproveBusy = false;
  }
}

function wireDappApproveBridge() {
  if (
    !(
      IS_EXTENSION &&
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    )
  ) {
    return;
  }
  if (wireDappApproveBridge._wired) return;
  wireDappApproveBridge._wired = true;
  chrome.storage.local.get([DAPP_APPROVE_REQ_KEY], (bag) => {
    if (bag && bag[DAPP_APPROVE_REQ_KEY]) {
      processDappApproveRequest(bag[DAPP_APPROVE_REQ_KEY]);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[DAPP_APPROVE_REQ_KEY]) return;
    const req = changes[DAPP_APPROVE_REQ_KEY].newValue;
    if (req) processDappApproveRequest(req);
  });
}

function openLedgerSignModal(req) {
  const modal = $("ledgerSignModal");
  const body = $("ledgerSignBody");
  if (body) {
    const method = (req && req.method) || "signTransaction";
    const isEvm =
      (req && req.chain === "evm") ||
      /personal_sign|eth_sign|eth_sendTransaction|eth_signTypedData/i.test(
        String(method)
      );
    const appName = isEvm ? "Ethereum" : "Solana";
    const kind = /personal_sign|eth_sign|signMessage|TypedData/i.test(
      String(method)
    )
      ? "message"
      : "transaction";
    body.textContent =
      "A dApp needs a Ledger " +
      kind +
      " signature. Unlock the Nano, open the " +
      appName +
      " app, tap Sign on Ledger, then approve on the device — keep this wallet popup open.";
  }
  pendingLedgerSignReq = req || null;
  if (modal) modal.hidden = false;
  try {
    if (typeof go === "function") go("home", { skipScroll: true });
  } catch (_) {}
  showToast("Tap Sign on Ledger in Gladiator");
}

function ledgerEvmSigToHex(sig) {
  const r = String(sig.r || "")
    .replace(/^0x/i, "")
    .padStart(64, "0");
  const s = String(sig.s || "")
    .replace(/^0x/i, "")
    .padStart(64, "0");
  let v = sig.v;
  if (typeof v === "string") {
    v = v.startsWith("0x") ? parseInt(v, 16) : parseInt(v, 10);
  }
  v = Number(v);
  if (!Number.isFinite(v)) v = 27;
  if (v < 27) v += 27;
  return "0x" + r + s + v.toString(16).padStart(2, "0");
}

function personalSignMessageToHex(message) {
  if (typeof message === "string" && /^0x[0-9a-fA-F]+$/.test(message)) {
    return message.slice(2);
  }
  const str = String(message || "");
  if (window.ethers && ethers.toUtf8Bytes) {
    return Array.from(ethers.toUtf8Bytes(str))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

async function handleLedgerEvmSignRequest(method, params) {
  const ethApi = await ensureLedgerEthSupported();
  const acc = activeAccount(STATE);
  if (!acc || !isLedgerAccount(acc) || !ledgerHasEvm(acc)) {
    throw new Error("Ledger EVM not linked — open Ethereum app and Link EVM");
  }
  const idx = ledgerAccountIndex(acc);
  const args = (params && params.args) || [];
  const m = String(method || (params && params.method) || "");

  if (m === "personal_sign" || m === "eth_sign") {
    let message = args[0];
    if (m === "eth_sign") message = args[1];
    else if (
      typeof args[0] === "string" &&
      args[0].startsWith("0x") &&
      args[0].length === 42 &&
      typeof args[1] === "string"
    ) {
      message = args[1];
    }
    const hex = personalSignMessageToHex(message);
    showToast("Approve message on Ledger (Ethereum app)…");
    const sig = await ethApi.signPersonalMessage(idx, hex);
    return { signature: ledgerEvmSigToHex(sig) };
  }

  if (
    m === "eth_signTypedData" ||
    m === "eth_signTypedData_v3" ||
    m === "eth_signTypedData_v4"
  ) {
    if (typeof ethApi.signEIP712Message !== "function") {
      throw new Error("Ledger EIP-712 missing — reload Gladiator pack");
    }
    let typed = args[1];
    let address = args[0];
    if (typed == null && address && typeof address === "object") {
      typed = address;
    }
    if (typeof typed === "string") {
      try {
        typed = JSON.parse(typed);
      } catch (_) {
        throw new Error("Invalid typed data JSON");
      }
    }
    showToast("Approve typed data on Ledger (Ethereum app)…");
    const sig = await ethApi.signEIP712Message(idx, typed);
    return { signature: ledgerEvmSigToHex(sig) };
  }

  if (m === "eth_sendTransaction") {
    if (!window.ethers) throw new Error("ethers missing");
    const txReq = args[0] || {};
    const chainId = Number((params && params.chainId) || 1);
    const rpcs =
      Array.isArray(params && params.rpcs) && params.rpcs.length
        ? params.rpcs
        : params && params.rpcUrl
          ? [params.rpcUrl]
          : [];
    if (!rpcs.length) throw new Error("No EVM RPC for Ledger send");
    let lastErr = null;
    for (const rpc of rpcs) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc, chainId || undefined);
        const hash = await signAndBroadcastEvmLedger(acc, { chainId, decimals: 18 }, provider, {
          to: txReq.to,
          data: txReq.data || "0x",
          value:
            txReq.value != null
              ? typeof txReq.value === "bigint"
                ? txReq.value
                : BigInt(txReq.value)
              : 0n,
          gasLimit: txReq.gasLimit || txReq.gas || undefined,
        });
        return { hash };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Ledger eth_sendTransaction failed");
  }

  throw new Error("Unsupported Ledger EVM method: " + m);
}

function closeLedgerSignModal() {
  const modal = $("ledgerSignModal");
  if (modal) modal.hidden = true;
}

async function rejectPendingLedgerSign(error) {
  const req = pendingLedgerSignReq;
  pendingLedgerSignReq = null;
  closeLedgerSignModal();
  if (!req || !req.id) return;
  try {
    await new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [LEDGER_RES_KEY]: {
            id: req.id,
            error: error || "User rejected Ledger sign",
          },
          [LEDGER_REQ_KEY]: null,
        },
        () => resolve()
      );
    });
  } catch (_) {}
  showToast("Ledger sign rejected");
}

async function confirmPendingLedgerSign() {
  const req = pendingLedgerSignReq;
  if (!req || !req.id || ledgerSignBusy) return;
  ledgerSignBusy = true;
  const approveBtn = $("ledgerSignApprove");
  if (approveBtn) {
    approveBtn.disabled = true;
    approveBtn.textContent = "Signing…";
  }
  try {
    showToast("Approve on Ledger device…");
    const isEvm =
      req.chain === "evm" ||
      /personal_sign|eth_sign|eth_sendTransaction|eth_signTypedData/i.test(
        String(req.method || "")
      );
    // Prefer the Ledger account matching the request address/pubkey.
    if (STATE && Array.isArray(STATE.accounts)) {
      let match = null;
      if (isEvm && req.address) {
        match = STATE.accounts.find(
          (a) =>
            a.evm &&
            a.evm.address &&
            String(a.evm.address).toLowerCase() ===
              String(req.address).toLowerCase()
        );
      }
      if (!match && req.publicKey) {
        match = STATE.accounts.find(
          (a) => a.solana && a.solana.publicKey === req.publicKey
        );
      }
      if (match) {
        if (match.id !== STATE.activeAccountId) {
          STATE.activeAccountId = match.id;
          await storageSet(STATE);
          paintSwitchers();
        }
        if (!isEvm) await ensureLedgerUsesSolana(match);
      }
    }
    // Must run from this button click so WebHID has a user gesture.
    const result = isEvm
      ? await handleLedgerEvmSignRequest(req.method, req.params || {})
      : await handleProviderSignRequest(req.method, req.params || {});
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(
        { [LEDGER_RES_KEY]: { id: req.id, result }, [LEDGER_REQ_KEY]: null },
        () => {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve();
        }
      );
    });
    pendingLedgerSignReq = null;
    closeLedgerSignModal();
    showToast("Ledger signed — back to the dApp");
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set(
          {
            [LEDGER_RES_KEY]: { id: req.id, error: msg },
            [LEDGER_REQ_KEY]: null,
          },
          () => resolve()
        );
      });
    } catch (_) {}
    pendingLedgerSignReq = null;
    closeLedgerSignModal();
    showToast(msg);
  } finally {
    ledgerSignBusy = false;
    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.textContent = "Sign on Ledger";
    }
  }
}

async function processLedgerSignRequest(req) {
  if (!req || !req.id) return;
  // Ignore stale requests.
  if (req.at && Date.now() - Number(req.at) > 3 * 60 * 1000) {
    try {
      chrome.storage.local.set({ [LEDGER_REQ_KEY]: null });
    } catch (_) {}
    return;
  }
  // Do NOT auto-sign — WebHID / Ledger needs a real click.
  openLedgerSignModal(req);
}

function wireLedgerSignBridge() {
  if (!(IS_EXTENSION && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local)) {
    return;
  }
  if (wireLedgerSignBridge._wired) return;
  wireLedgerSignBridge._wired = true;
  $("ledgerSignApprove")?.addEventListener("click", () => {
    confirmPendingLedgerSign().catch((err) => console.warn("[ledger-sign]", err));
  });
  $("ledgerSignReject")?.addEventListener("click", () => {
    rejectPendingLedgerSign("User rejected Ledger sign");
  });
  chrome.storage.local.get([LEDGER_REQ_KEY], (bag) => {
    if (bag && bag[LEDGER_REQ_KEY]) processLedgerSignRequest(bag[LEDGER_REQ_KEY]);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[LEDGER_REQ_KEY]) return;
    const req = changes[LEDGER_REQ_KEY].newValue;
    if (req) processLedgerSignRequest(req);
  });
}

async function refreshAll() {
  const acc = activeAccount(STATE);
  const chain = activeChain(STATE);
  const sameContext =
    BALANCE &&
    BALANCE.ok &&
    BALANCE.chainId === (chain && chain.id) &&
    BALANCE.accountId === ((acc && acc.id) || "");
  // Only blank the home balance when switching wallet/chain — not on a soft refresh.
  if (!sameContext) {
    HOLDINGS = [];
    BALANCE = {
      native: 0,
      usd: 0,
      ok: false,
      error: "",
      chainId: chain && chain.id,
      accountId: (acc && acc.id) || "",
    };
  }
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
  await Promise.all([
    refreshBalance({ keepUi: !!sameContext }),
    refreshAccountBalances(),
    refreshHistory().catch((err) => console.warn("[history refreshAll]", err)),
  ]);
}

function wire() {
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      go(el.dataset.go);
    });
  });
  wireTokenDetailControls();
  $("brandAccountsBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    const root = $("acctDrawerRoot");
    if (root && !root.hidden && root.classList.contains("is-open")) closeAcctDrawer();
    else openAcctDrawer();
  });
  $("acctDrawerClose")?.addEventListener("click", () => closeAcctDrawer());
  $("acctDrawerBackdrop")?.addEventListener("click", () => closeAcctDrawer());
  const onConnectLedger = async () => {
    try {
      closeAcctDrawer();
      await startLedgerConnectFlow();
    } catch (err) {
      console.warn(err);
      showToast(String(err && err.message ? err.message : err));
      const status = $("accountStatus");
      const ledgerStatus = $("ledgerConnectStatus");
      const msg = String(err && err.message ? err.message : err);
      if (status) status.textContent = msg;
      if (ledgerStatus) ledgerStatus.textContent = msg;
    }
  };
  $("acctDrawerLedger")?.addEventListener("click", onConnectLedger);
  $("connectLedgerBtn")?.addEventListener("click", onConnectLedger);
  const onLinkLedgerEvm = async () => {
    try {
      const acc = activeAccount(STATE);
      if (!acc || !isLedgerAccount(acc)) {
        showToast("Connect a Ledger account first");
        return;
      }
      closeAcctDrawer();
      await linkLedgerEvm(acc);
    } catch (err) {
      console.warn(err);
      showToast(String(err && err.message ? err.message : err));
      const status = $("accountStatus");
      const ledgerStatus = $("ledgerConnectStatus");
      const msg = String(err && err.message ? err.message : err);
      if (status) status.textContent = msg;
      if (ledgerStatus) ledgerStatus.textContent = msg;
    }
  };
  $("acctDrawerLinkEvm")?.addEventListener("click", onLinkLedgerEvm);
  $("linkLedgerEvmBtn")?.addEventListener("click", onLinkLedgerEvm);
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
    else if (act === "manage-tokens") openSettings({ focusManageTokens: true });
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
    // Refresh only reloads the list from storage / in-page inject.
    // Do NOT open the detached wallet window — that was only needed for
    // Connect pairing. If a WC host window is already open, nudge it to
    // republish live sessions without focusing/creating a window.
    if (IS_EXTENSION_POPUP) {
      chromeLocalSet({ [WC_CMD_KEY]: { type: "publish", at: Date.now() } }).catch(
        () => {}
      );
    }
    refreshWcConnections({ ensure: IS_WC_HOST, poll: IS_WC_HOST ? 6 : 0 })
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
    const kind = btn.getAttribute("data-kind") || "";
    const topic = btn.getAttribute("data-topic") || "";
    const origin =
      btn.getAttribute("data-origin") ||
      (topic.indexOf("inject:") === 0 ? topic.slice("inject:".length) : "");
    const run =
      kind === "inject" || topic.indexOf("inject:") === 0
        ? disconnectInjectOrigin(origin).then(() =>
            refreshWcConnections({ ensure: false })
          )
        : wcDisconnectTopic(topic);
    run
      .then(() => showToast("Disconnected"))
      .catch((err) => console.warn(err));
  });
  $("dappApproveApprove")?.addEventListener("click", () => {
    respondDappApprove(true).catch(() => {});
  });
  $("dappApproveReject")?.addEventListener("click", () => {
    respondDappApprove(false).catch(() => {});
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
  $("vaultModalSubmit")?.addEventListener("click", () => {
    submitVaultModal().catch((err) => {
      const el = $("vaultModalError");
      if (el) el.textContent = String(err && err.message ? err.message : err);
    });
  });
  $("vaultModalCancel")?.addEventListener("click", () => {
    if (isVaultLocked()) {
      showToast("Enter old password once to restore keys");
      return;
    }
    closeVaultModal();
  });
  $("vaultPass1")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("vaultModalSubmit")?.click();
    }
  });
  if (
    IS_EXTENSION &&
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.onChanged
  ) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (
        changes.gladiator_wc_sessions ||
        changes.gladiator_wc_pending ||
        changes.gladiator_trusted_origins ||
        changes.gladiator_trusted_origin_accounts ||
        changes.gladiator_trusted_origin_chains
      ) {
        paintWcConnections().catch(() => {});
      }
      if (IS_WC_HOST && changes.gladiator_wc_pending) {
        const next = changes.gladiator_wc_pending.newValue;
        if (next && next.uri && String(next.uri).startsWith("wc:")) {
          consumePendingWcUri().catch((err) => console.warn(err));
        }
      }
      if (IS_WC_HOST && changes.gladiator_wc_cmd) {
        handleWcHostCommand(changes.gladiator_wc_cmd.newValue).catch((err) =>
          console.warn(err)
        );
      }
    });
  }
  document.addEventListener("click", (e) => {
    const wrap = $("addrMenuWrap");
    if (wrap && !wrap.contains(e.target)) closeAddrMenu();
  });
  $("chainSelect")?.addEventListener("change", async (e) => {
    await selectChain(e.target.value);
  });

  // pointerdown is more reliable than click in the narrow extension popup
  $("chainPickerBtn")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleChainPicker();
  });
  $("chainPickerBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  // Menu may be reparented to <body> while open — bind on document.
  document.addEventListener("pointerdown", (e) => {
    const menu = $("chainPickerMenu");
    if (!menu || menu.hidden) return;
    const copyBtn = e.target.closest("[data-copy-addr]");
    if (copyBtn && menu.contains(copyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const addr = copyBtn.getAttribute("data-copy-addr") || "";
      const row = copyBtn.closest("[data-chain-id]");
      const chain = row && CHAINS.find((c) => c.id === row.getAttribute("data-chain-id"));
      copyChainAddress(addr, chain && chain.name);
      return;
    }
    const item = e.target.closest("[data-chain-id]");
    if (item && menu.contains(item)) {
      e.preventDefault();
      e.stopPropagation();
      selectChain(item.getAttribute("data-chain-id"));
    }
  });
  document.addEventListener("click", (e) => {
    const picker = $("chainPicker");
    const menu = $("chainPickerMenu");
    const btn = $("chainPickerBtn");
    if (!picker || !menu || menu.hidden) return;
    if (btn && btn.contains(e.target)) return;
    if (picker.contains(e.target) || menu.contains(e.target)) return;
    closeChainPicker();
  });
  window.addEventListener("resize", () => positionChainPickerMenu());
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
  $("manageTokenList")?.addEventListener("change", async (e) => {
    const input = e.target && e.target.closest("input[data-token-toggle]");
    if (!input) return;
    const chainId = input.getAttribute("data-chain") || "";
    const mint = input.getAttribute("data-mint") || "";
    if (!chainId || !mint) return;
    const show = !!input.checked;
    try {
      await setTokenHidden(chainId, mint, !show);
      paintHoldings();
      paintBalances();
      paintManageTokens();
      const labelEl = input.closest("li") && input.closest("li").querySelector("strong");
      showToast((show ? "Showing " : "Hidden ") + ((labelEl && labelEl.textContent) || "token"));
    } catch (err) {
      console.warn(err);
      showToast("Could not update token visibility");
      paintManageTokens();
    }
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
    if (isLedgerAccount(activeAccount(STATE))) {
      paintLedgerSeedUi();
      showToast(
        "Seed phrase is not stored in the wallet for Ledger accounts. Connect your Ledger device."
      );
      return;
    }
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
  $("copyChainSecretBtn")?.addEventListener("click", () => {
    const v = ($("backupChainSecret")?.value || "").trim();
    if (!v) return showToast("Open Show seed phrase first");
    copyText(v);
    const chain = activeChain(STATE);
    showToast(
      ((chain && chain.name) || "Chain") + " private key copied"
    );
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
  $("settingsSyncBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    runManualSync();
  });
  $("refreshBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    runManualSync();
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
        // Network fee buffer only
        max = Math.max(0, max - 0.00001);
      }
    } else {
      max = Math.max(0, (Number(BALANCE.native) || 0) - 0.00001);
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
  wireProviderSignBridge();
  wireLedgerSignBridge();
  wireDappApproveBridge();
  // Always push wallet into chrome.storage + SW memory so Jupiter signing works.
  try {
    if (!isVaultLocked()) {
      await repairAllExtraKeys(STATE);
    }
    await storageSet(STATE);
    const synced = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: "gladiator-persist-wallet", state: STATE },
          (response) => resolve(response || null)
        );
      } catch (_) {
        resolve(null);
      }
    });
    const acc = activeAccount(STATE);
    if (synced && synced.signerReady) {
      showToast("Jupiter signing ready");
      console.info("[Gladiator] signer ready", synced.publicKey);
    } else if (acc && acc.solana && (acc.solana.secretKey || acc.mnemonic)) {
      showToast("Wallet synced — retry Jupiter if needed");
    } else if (isVaultLocked()) {
      showToast("Enter old password once — then Jupiter swaps work");
    } else {
      showToast("Import a wallet to enable Jupiter swaps");
    }
  } catch (err) {
    console.warn("[boot-persist]", err);
    showToast("Could not sync wallet for signing");
  }
  wire();
  paintSwitchers();
  paintBalances();
  paintHoldings();
  go("home");
  if (isVaultLocked()) {
    openVaultModal("migrate");
  }
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
  // Toolbar popup: mirror only. Wallet window / web page: own WC relay.
  if (IS_EXTENSION_POPUP) {
    paintWcSettings();
    setWcStatus(
      STATE.wcProjectId
        ? "Paste wc: URI → Connect (opens Gladiator wallet window)"
        : "Add a WalletConnect Project ID, then paste a wc: URI"
    );
    try {
      await refreshWcConnections({ ensure: false });
    } catch (err) {
      console.warn("[connections-boot]", err);
    }
  } else {
    try {
      if (STATE.wcProjectId && window.GladiatorWC) {
        await ensureWalletConnect();
      }
      // Deep-link from toolbar Connect (?wc=1) → Settings + pair pending URI
      try {
        const q = new URLSearchParams((location && location.search) || "");
        if (q.get("wc") === "1") {
          openSettings({ focusWc: true });
        }
        if (q.get("ledger") === "1") {
          go("activity");
          try {
            const bag = await chromeLocalGet(["gladiator_ledger_connect"]);
            const pending = bag && bag.gladiator_ledger_connect;
            if (pending && pending.accountIndex != null && $("ledgerAccountIndex")) {
              $("ledgerAccountIndex").value = String(
                Math.max(0, Math.floor(Number(pending.accountIndex) || 0))
              );
            }
            await chromeLocalSet({ gladiator_ledger_connect: null });
          } catch (_) {}
          // Do NOT auto-call WebHID — requestDevice needs a real click.
          const ledgerStatus = $("ledgerConnectStatus");
          if (ledgerStatus) {
            ledgerStatus.textContent =
              "Ready — unlock Ledger, open the Solana app, then tap Connect Ledger.";
          }
          showToast("Tap Connect Ledger (USB)");
          try {
            const btn = $("connectLedgerBtn");
            if (btn && btn.scrollIntoView) {
              btn.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            // Ensure the Ledger section is expanded.
            const details = btn && btn.closest("details");
            if (details) details.open = true;
          } catch (_) {}
        }
        if (q.get("ledgerSign") === "1") {
          go("home", { skipScroll: true });
          await ensureLedgerUsesSolana();
          showToast("Ledger sign ready — tap Sign on Ledger when prompted");
          try {
            const bag = await chromeLocalGet([LEDGER_REQ_KEY]);
            if (bag && bag[LEDGER_REQ_KEY]) {
              processLedgerSignRequest(bag[LEDGER_REQ_KEY]);
            }
          } catch (_) {}
        }
      } catch (_) {}
      const paired = await consumePendingWcUri();
      if (!paired) {
        await refreshWcConnections({ ensure: false, poll: 4 });
        paintWcSettings();
        if (STATE.wcProjectId) {
          const items = collectLiveWcSessions();
          setWcStatus(
            items.length
              ? "Connected — keep this wallet window open for Jupiter swaps"
              : "Ready — paste a wc: URI, then Connect (keep this window open)"
          );
        }
      }
    } catch (err) {
      console.warn("[wc-boot]", err);
      setWcStatus(String(err && err.message ? err.message : err));
      paintWcSettings();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot().catch((err) => {
    console.error(err);
    showToast("Wallet boot failed");
  });
});
