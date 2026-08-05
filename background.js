/** Gladiator service worker — WalletConnect window + in-page Solana/EVM provider */
const WC_WALLET_PATH = "index.html";
const STORE_KEY = "gladiator_wallet_v1";
const TRUSTED_KEY = "gladiator_trusted_origins";
const OFFSCREEN_URL = "offscreen.html";

let walletWindowId = null;
let offscreenCreating = null;
/** In-memory signer so Jupiter can sign even if chrome.storage lags. */
let cachedSigner = null; // { publicKey, secretKey, mnemonic, evmAddress, evmPrivateKey }
/** Active EVM chain for dApp provider (Uniswap). */
let dappEvmChainId = 1;

const EVM_NETWORKS = {
  1: {
    chainId: 1,
    name: "Ethereum",
    rpcs: [
      "https://eth.llamarpc.com",
      "https://cloudflare-eth.com",
      "https://ethereum.publicnode.com",
      "https://rpc.ankr.com/eth",
      "https://1rpc.io/eth",
    ],
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpcs: [
      "https://polygon-rpc.com",
      "https://polygon-bor.publicnode.com",
      "https://1rpc.io/matic",
    ],
  },
  8453: {
    chainId: 8453,
    name: "Base",
    rpcs: [
      "https://mainnet.base.org",
      "https://base.publicnode.com",
      "https://1rpc.io/base",
    ],
  },
  4663: {
    chainId: 4663,
    name: "Robinhood Ethereum",
    rpcs: ["https://rpc.mainnet.chain.robinhood.com"],
  },
};

function toHexChainId(id) {
  return "0x" + Number(id || 1).toString(16);
}
let persistWaiters = [];

function notifyPersistWaiters() {
  const list = persistWaiters.slice();
  persistWaiters = [];
  for (const fn of list) {
    try {
      fn(true);
    } catch (_) {}
  }
}

function waitForPersist(timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      persistWaiters = persistWaiters.filter((fn) => fn !== onPersist);
      resolve(false);
    }, timeoutMs);
    function onPersist() {
      clearTimeout(timer);
      resolve(true);
    }
    persistWaiters.push(onPersist);
  });
}

function isLedgerAccount(a) {
  return !!(a && (a.type === "ledger" || (a.ledger && a.ledger.path)));
}

function cacheSignerFromState(state) {
  if (!state || !Array.isArray(state.accounts) || !state.accounts.length) {
    return null;
  }
  const acc =
    state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  if (!acc) return null;
  const publicKey = (acc.solana && acc.solana.publicKey) || "";
  const secretKey = (acc.solana && acc.solana.secretKey) || "";
  const mnemonic = acc.mnemonic || "";
  const evmAddress = (acc.evm && acc.evm.address) || "";
  const evmPrivateKey = (acc.evm && acc.evm.privateKey) || "";
  const ledger = isLedgerAccount(acc);
  // Need at least Solana signer or EVM key for dApp use.
  if (!publicKey && !evmAddress) return null;
  if (!secretKey && !mnemonic && !ledger && !evmPrivateKey) return null;
  // Sync dApp EVM chain with wallet selection when on an EVM network.
  try {
    const active = String(state.activeChainId || "");
    if (active === "ethereum") dappEvmChainId = 1;
    else if (active === "polygon") dappEvmChainId = 137;
    else if (active === "base") dappEvmChainId = 8453;
    else if (active === "robinhood") dappEvmChainId = 4663;
  } catch (_) {}
  cachedSigner = {
    publicKey,
    secretKey,
    mnemonic,
    ledger,
    accountIndex:
      acc.ledger && acc.ledger.accountIndex != null
        ? Number(acc.ledger.accountIndex) || 0
        : 0,
    accountId: acc.id || null,
    evmAddress,
    evmPrivateKey,
  };
  return cachedSigner;
}

async function getActiveEvmAccount() {
  const bag = await storageGet([STORE_KEY]);
  const state = bag[STORE_KEY];
  cacheSignerFromState(state);
  if (cachedSigner && cachedSigner.evmAddress) {
    return {
      address: cachedSigner.evmAddress,
      privateKey: cachedSigner.evmPrivateKey || "",
      accountId: cachedSigner.accountId || null,
      hasSigner: !!cachedSigner.evmPrivateKey,
    };
  }
  if (!state || !state.accounts || !state.accounts.length) return null;
  const acc =
    state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  const address = acc && acc.evm && acc.evm.address;
  if (!address) return null;
  return {
    address,
    privateKey: (acc.evm && acc.evm.privateKey) || "",
    accountId: acc.id || null,
    hasSigner: !!(acc.evm && acc.evm.privateKey),
  };
}

async function evmJsonRpc(method, params) {
  const net = EVM_NETWORKS[dappEvmChainId] || EVM_NETWORKS[1];
  const list = (net && net.rpcs) || [];
  let lastErr = null;
  for (const rpc of list) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: params || [],
        }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || method + " failed");
      return j.result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All EVM RPCs failed");
}

async function handleEvmProviderRequest(method, params, origin, tabId) {
  const args = Array.isArray(params && params.args)
    ? params.args
    : Array.isArray(params)
      ? params
      : [];

  if (method === "eth_chainId") {
    return { result: { chainId: toHexChainId(dappEvmChainId) } };
  }
  if (method === "net_version") {
    return { result: { netVersion: String(dappEvmChainId) } };
  }
  if (method === "eth_accounts") {
    const trusted = await readTrustedOrigins();
    if (origin && !trusted.includes(origin)) return { result: { accounts: [] } };
    const acc = await getActiveEvmAccount();
    return { result: { accounts: acc && acc.address ? [acc.address] : [] } };
  }
  if (method === "eth_requestAccounts") {
    const acc = await getActiveEvmAccount();
    if (!acc || !acc.address) {
      throw new Error("No EVM address — open Gladiator and use a seed wallet (not Ledger-only)");
    }
    const trusted = await readTrustedOrigins();
    const isTrusted = !!(origin && trusted.includes(origin));
    if (!isTrusted) {
      await requestUserApproval({
        origin,
        method: "eth_requestAccounts",
        title: "Connect wallet?",
        body:
          shortOriginHost(origin) +
          " wants to connect to your EVM wallet.",
        chain: "evm",
        tabId,
      });
    }
    if (origin) await trustOrigin(origin);
    return {
      result: {
        accounts: [acc.address],
        chainId: toHexChainId(dappEvmChainId),
      },
    };
  }
  if (method === "wallet_switchEthereumChain") {
    const req = args[0] || {};
    const hex = String(req.chainId || "").toLowerCase();
    const id = parseInt(hex, 16);
    if (!EVM_NETWORKS[id]) {
      const err = new Error("Unrecognized chain ID " + hex);
      err.code = 4902;
      throw err;
    }
    dappEvmChainId = id;
    return { result: { chainId: toHexChainId(id) } };
  }
  if (method === "wallet_addEthereumChain") {
    const req = args[0] || {};
    const hex = String(req.chainId || "").toLowerCase();
    const id = parseInt(hex, 16);
    if (EVM_NETWORKS[id]) {
      dappEvmChainId = id;
      return { result: null };
    }
    throw new Error("Gladiator does not support chain " + hex);
  }
  if (method === "personal_sign" || method === "eth_sign") {
    const acc = await getActiveEvmAccount();
    if (!acc || !acc.privateKey) throw new Error("No EVM key to sign with");
    await requestUserApproval({
      origin,
      method,
      title: "Sign message?",
      body: shortOriginHost(origin) + " wants you to sign a message.",
      chain: "evm",
      tabId,
    });
    const raw = await callOffscreen("ethPersonalSign", {
      _evmPrivateKey: acc.privateKey,
      _evmAddress: acc.address,
      method,
      args,
    });
    return { result: { signature: raw && raw.signature ? raw.signature : raw } };
  }
  if (
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4"
  ) {
    const acc = await getActiveEvmAccount();
    if (!acc || !acc.privateKey) throw new Error("No EVM key to sign with");
    await requestUserApproval({
      origin,
      method,
      title: "Sign typed data?",
      body: shortOriginHost(origin) + " wants you to sign typed data.",
      chain: "evm",
      tabId,
    });
    const raw = await callOffscreen("ethSignTypedData", {
      _evmPrivateKey: acc.privateKey,
      _evmAddress: acc.address,
      method,
      args,
    });
    return { result: { signature: raw && raw.signature ? raw.signature : raw } };
  }
  if (method === "eth_sendTransaction") {
    const acc = await getActiveEvmAccount();
    if (!acc || !acc.privateKey) throw new Error("No EVM key to send with");
    const net = EVM_NETWORKS[dappEvmChainId] || EVM_NETWORKS[1];
    const tx = (args && args[0]) || {};
    await requestUserApproval({
      origin,
      method,
      title: "Send transaction?",
      body:
        shortOriginHost(origin) +
        " wants to send a " +
        ((net && net.name) || "EVM") +
        " transaction" +
        (tx.to ? " to " + String(tx.to).slice(0, 10) + "…" : "") +
        ".",
      chain: "evm",
      tabId,
    });
    const raw = await callOffscreen("ethSendTransaction", {
      _evmPrivateKey: acc.privateKey,
      _evmAddress: acc.address,
      rpcUrl: (net.rpcs && net.rpcs[0]) || "",
      rpcs: net.rpcs || [],
      chainId: dappEvmChainId,
      args,
    });
    return { result: { hash: raw && raw.hash ? raw.hash : raw } };
  }

  // Read-only RPC passthrough used by Uniswap / ethers.
  const passthrough = [
    "eth_blockNumber",
    "eth_getBalance",
    "eth_getCode",
    "eth_call",
    "eth_estimateGas",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_feeHistory",
    "eth_getTransactionCount",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getLogs",
    "eth_getStorageAt",
  ];
  if (passthrough.includes(method)) {
    const result = await evmJsonRpc(method, args);
    return { result: { result } };
  }

  throw new Error("Unsupported ethereum method: " + method);
}

async function focusOrOpenWcWallet(opts) {
  const focus = !opts || opts.focus !== false;
  const openSettings = !opts || opts.settings !== false;
  const restore = !!(opts && opts.restore);
  const ledger = !!(opts && opts.ledger);
  const ledgerSign = !!(opts && opts.ledgerSign);
  const base = chrome.runtime.getURL(WC_WALLET_PATH);
  let url = base;
  if (ledgerSign) url = base + "?ledgerSign=1";
  else if (ledger) url = base + "?ledger=1";
  else if (restore) url = base + "?restore=1";
  else if (openSettings) url = base + "?wc=1";

  // Ledger WebHID is unreliable in extension popup windows — use a normal tab.
  if (ledger || ledgerSign) {
    try {
      const existing = await chrome.tabs.query({
        url: [base, base + "?*"],
      });
      const want = ledgerSign ? "ledgerSign=1" : "ledger=1";
      const ledgerTab =
        (existing || []).find(
          (t) => t.url && new RegExp("[?&]" + want + "(?:&|$)").test(String(t.url))
        ) ||
        (existing || []).find((t) => t.url && /index\.html/i.test(String(t.url))) ||
        null;
      if (ledgerTab && ledgerTab.id != null) {
        await chrome.tabs.update(ledgerTab.id, { url, active: focus });
        if (ledgerTab.windowId != null && focus) {
          try {
            await chrome.windows.update(ledgerTab.windowId, { focused: true });
          } catch (_) {}
        }
        return { ok: true, reused: true, tabId: ledgerTab.id, ledgerTab: true };
      }
    } catch (_) {}
    const tab = await chrome.tabs.create({ url, active: focus !== false });
    return {
      ok: true,
      reused: false,
      tabId: tab && tab.id,
      ledgerTab: true,
    };
  }

  const shouldNavigate = openSettings || restore;

  if (walletWindowId != null) {
    try {
      await chrome.windows.update(walletWindowId, focus ? { focused: true } : {});
      try {
        const tabs = await chrome.tabs.query({ windowId: walletWindowId });
        const tab = tabs && tabs[0];
        if (tab && tab.id != null && shouldNavigate) {
          await chrome.tabs.update(tab.id, { url });
        }
      } catch (_) {}
      return { ok: true, reused: true, windowId: walletWindowId };
    } catch (_) {
      walletWindowId = null;
    }
  }

  try {
    const tabs = await chrome.tabs.query({
      url: [base, base + "?*", chrome.runtime.getURL("wc-bridge.html")],
    });
    if (tabs && tabs[0] && tabs[0].windowId != null) {
      walletWindowId = tabs[0].windowId;
      if (focus) await chrome.windows.update(walletWindowId, { focused: true });
      if (tabs[0].id != null && shouldNavigate) {
        try {
          await chrome.tabs.update(tabs[0].id, { url });
        } catch (_) {}
      }
      return { ok: true, reused: true, windowId: walletWindowId };
    }
  } catch (_) {}

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 400,
    height: 760,
    focused: focus,
  });
  walletWindowId = win && win.id != null ? win.id : null;
  return { ok: true, reused: false, windowId: walletWindowId };
}

async function ensureOffscreen() {
  try {
    if (chrome.runtime.getContexts) {
      const existing = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
      });
      if (existing && existing.length) return;
    }
  } catch (_) {}

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  offscreenCreating = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        // LOCAL_STORAGE covers chrome.storage + scripted crypto work.
        reasons: ["LOCAL_STORAGE", "BLOBS"],
        justification: "Sign Solana transactions for in-page dApps like Jupiter",
      });
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (!/already exists|only a single offscreen/i.test(msg)) {
        // Fallback reason set for older Chrome/Opera builds.
        try {
          await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: ["WORKERS"],
            justification: "Sign Solana transactions for in-page dApps like Jupiter",
          });
        } catch (err2) {
          const msg2 = String(err2 && err2.message ? err2.message : err2);
          if (!/already exists|only a single offscreen/i.test(msg2)) throw err2;
        }
      }
    } finally {
      offscreenCreating = null;
    }
  })();
  await offscreenCreating;
  // Give the offscreen page a beat to attach its message listener.
  await new Promise((r) => setTimeout(r, 150));
}

function callOffscreen(method, params) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureOffscreen();
    } catch (err) {
      reject(err);
      return;
    }

    const sendOnce = () =>
      new Promise((res, rej) => {
        chrome.runtime.sendMessage(
          { type: "gladiator-offscreen", method, params: params || {} },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              rej(new Error(err.message || "Offscreen unavailable"));
              return;
            }
            if (!response || response.ok === false) {
              rej(new Error((response && response.error) || "Sign failed"));
              return;
            }
            res(response.result);
          }
        );
      });

    try {
      resolve(await sendOnce());
    } catch (err) {
      // Retry once — offscreen may still be booting after createDocument.
      try {
        await new Promise((r) => setTimeout(r, 300));
        resolve(await sendOnce());
      } catch (err2) {
        reject(err2);
      }
    }
  });
}

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (r) => resolve(r || {}));
    } catch (_) {
      resolve({});
    }
  });
}

function storageSet(obj) {
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

async function readTrustedOrigins() {
  const bag = await storageGet([TRUSTED_KEY]);
  const list = bag[TRUSTED_KEY];
  return Array.isArray(list) ? list : [];
}

async function trustOrigin(origin) {
  if (!origin) return;
  const list = await readTrustedOrigins();
  if (list.includes(origin)) return;
  list.push(origin);
  await storageSet({ [TRUSTED_KEY]: list.slice(-100) });
}

async function untrustOrigin(origin) {
  if (!origin) return;
  const list = await readTrustedOrigins();
  const next = list.filter((o) => o !== origin);
  if (next.length === list.length) return;
  await storageSet({ [TRUSTED_KEY]: next });
}

function niceDappName(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "jup.ag" || host.endsWith(".jup.ag")) return "Jupiter";
    if (host === "pump.fun" || host.endsWith(".pump.fun")) return "pump.fun";
    if (host === "raydium.io" || host.endsWith(".raydium.io")) return "Raydium";
    if (host === "tensor.trade" || host.endsWith(".tensor.trade")) return "Tensor";
    if (host === "orca.so" || host.endsWith(".orca.so")) return "Orca";
    if (host === "drift.trade" || host.endsWith(".drift.trade")) return "Drift";
    if (host === "mango.markets" || host.endsWith(".mango.markets")) return "Mango";
    if (host === "kamino.finance" || host.endsWith(".kamino.finance")) return "Kamino";
    if (host === "sanctum.so" || host.endsWith(".sanctum.so")) return "Sanctum";
    return host;
  } catch (_) {
    return origin || "dApp";
  }
}

async function listInjectConnections() {
  const origins = await readTrustedOrigins();
  return origins.map((origin) => ({
    kind: "inject",
    topic: "inject:" + origin,
    origin,
    name: niceDappName(origin),
    url: origin,
    icon: "",
    accounts: [],
    status: "active",
  }));
}

async function forceDisconnectOrigin(origin) {
  await untrustOrigin(origin);
  if (!origin || !chrome.tabs || !chrome.tabs.query) return;
  try {
    let pattern = origin;
    if (!/\/$/.test(pattern)) pattern += "/";
    const tabs = await chrome.tabs.query({ url: [pattern + "*", origin] });
    for (const tab of tabs) {
      if (!tab || !tab.id) continue;
      try {
        chrome.tabs.sendMessage(tab.id, { type: "gladiator-force-disconnect" }, () => {
          void chrome.runtime.lastError;
        });
      } catch (_) {}
    }
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getActiveSolanaAccount() {
  if (
    cachedSigner &&
    (cachedSigner.secretKey || cachedSigner.mnemonic || cachedSigner.ledger)
  ) {
    return {
      publicKey: cachedSigner.publicKey,
      secretKey: cachedSigner.secretKey || "",
      mnemonic: cachedSigner.mnemonic || "",
      ledger: !!cachedSigner.ledger,
      accountIndex: cachedSigner.accountIndex || 0,
      needsMigrate: false,
      hasSigner: true,
      accountId: cachedSigner.accountId || null,
      fromCache: true,
    };
  }
  const bag = await storageGet([STORE_KEY]);
  const state = bag[STORE_KEY];
  const cached = cacheSignerFromState(state);
  if (cached) {
    return {
      publicKey: cached.publicKey,
      secretKey: cached.secretKey || "",
      mnemonic: cached.mnemonic || "",
      ledger: !!cached.ledger,
      accountIndex: cached.accountIndex || 0,
      needsMigrate: false,
      hasSigner: true,
      accountId: cached.accountId || null,
      fromCache: false,
    };
  }
  if (!state || !state.accounts || !state.accounts.length) return null;
  const acc =
    state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  const pk = acc && acc.solana && acc.solana.publicKey;
  if (!pk) return null;
  const needsMigrate = !!(state.vault && state.vault.data);
  const ledger = isLedgerAccount(acc);
  return {
    publicKey: pk,
    secretKey: "",
    mnemonic: "",
    ledger,
    accountIndex:
      acc.ledger && acc.ledger.accountIndex != null
        ? Number(acc.ledger.accountIndex) || 0
        : 0,
    needsMigrate,
    hasSigner: ledger,
    accountId: acc && acc.id,
  };
}

async function signViaWalletWindow(method, params, acc) {
  const reqId = "led_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const LEDGER_REQ = "gladiator_ledger_sign_req";
  const LEDGER_RES = "gladiator_ledger_sign_res";
  await storageSet({
    [LEDGER_REQ]: {
      id: reqId,
      method,
      params: params || {},
      publicKey: acc.publicKey,
      accountIndex: acc.accountIndex || 0,
      at: Date.now(),
    },
    [LEDGER_RES]: null,
  });
  // Prefer the normal wallet popup UI (no separate tab/window).
  let openedPopup = false;
  try {
    if (chrome.action && typeof chrome.action.openPopup === "function") {
      await chrome.action.openPopup();
      openedPopup = true;
    }
  } catch (_) {
    openedPopup = false;
  }
  if (!openedPopup) {
    try {
      await nudgeWalletPopup();
    } catch (_) {}
  }
  for (let i = 0; i < 240; i++) {
    await sleep(500);
    const bag = await storageGet([LEDGER_RES]);
    const res = bag[LEDGER_RES];
    if (!res || res.id !== reqId) continue;
    await storageSet({ [LEDGER_REQ]: null, [LEDGER_RES]: null });
    if (res.error) throw new Error(res.error);
    return res.result;
  }
  await storageSet({ [LEDGER_REQ]: null, [LEDGER_RES]: null });
  throw new Error(
    "Ledger sign timed out — click the Gladiator icon, tap Sign on Ledger, then approve on the device"
  );
}

async function nudgeWalletPopup() {
  try {
    if (chrome.action && typeof chrome.action.openPopup === "function") {
      await chrome.action.openPopup();
    }
  } catch (_) {}
}

async function requireSignerReady() {
  let acc = await getActiveSolanaAccount();
  if (acc && acc.hasSigner) return acc;

  await nudgeWalletPopup();
  await waitForPersist(10000);
  acc = await getActiveSolanaAccount();
  if (acc && acc.hasSigner) return acc;

  if (!acc) {
    throw new Error(
      "No wallet synced — click the Gladiator toolbar icon once, then retry the swap"
    );
  }
  if (acc.needsMigrate) {
    throw new Error(
      "Keys locked — open Gladiator toolbar icon and enter your old password once"
    );
  }
  throw new Error(
    "No Solana key — open Gladiator toolbar icon and create/import a wallet"
  );
}

async function getActivePublicKey() {
  const acc = await requireSignerReady();
  return acc.publicKey;
}

async function resetOffscreen() {
  try {
    if (chrome.offscreen && chrome.offscreen.closeDocument) {
      await chrome.offscreen.closeDocument();
    }
  } catch (_) {}
  offscreenCreating = null;
  await ensureOffscreen();
}

const FEE_JOB_KEY = "gladiator_fee_job";
let feeJobRunning = false;

async function scheduleFeeJob(acc, hintSig, beforeSnapshotOrPromise) {
  if (!acc || !acc.publicKey) return;
  if (acc.secretKey || acc.mnemonic) {
    cachedSigner = {
      publicKey: acc.publicKey,
      secretKey: acc.secretKey || "",
      mnemonic: acc.mnemonic || "",
    };
  }
  await storageSet({
    [FEE_JOB_KEY]: {
      at: Date.now(),
      publicKey: acc.publicKey,
      hintSig: hintSig || "",
      beforeSnapshot: null,
      tries: 0,
    },
  });

  // Resolve optional pre-sign snapshot without blocking the page response.
  void (async () => {
    const keep = setInterval(() => {
      try {
        chrome.storage.local.get(["_gladiator_fee_keepalive"], () => {});
      } catch (_) {}
    }, 2000);
    try {
      let snap = null;
      if (
        beforeSnapshotOrPromise &&
        typeof beforeSnapshotOrPromise.then === "function"
      ) {
        snap = await beforeSnapshotOrPromise;
      } else if (beforeSnapshotOrPromise) {
        snap = beforeSnapshotOrPromise;
      }
      if (!snap) {
        await ensureOffscreen();
        snap = await callOffscreen("snapshotBalances", {
          _publicKey: acc.publicKey,
          _secretKey: acc.secretKey || "",
          _mnemonic: acc.mnemonic || "",
        });
      }
      const bag = await storageGet([FEE_JOB_KEY]);
      const job = bag[FEE_JOB_KEY];
      if (job && snap) {
        job.beforeSnapshot = snap;
        await storageSet({ [FEE_JOB_KEY]: job });
      }
    } catch (err) {
      console.warn("[Gladiator] fee before-snapshot", err);
    } finally {
      clearInterval(keep);
    }
  })();

  // Collect after the swap has time to land (tx-history path is primary).
  try {
    chrome.alarms.create("gladiator-collect-fee", { when: Date.now() + 8000 });
  } catch (_) {}
  // Kick once now too — collectPlatformFee waits internally for confirmation.
  void runFeeJob();
}

async function runFeeJob() {
  if (feeJobRunning) return;
  const bag = await storageGet([FEE_JOB_KEY, STORE_KEY]);
  const job = bag[FEE_JOB_KEY];
  if (!job || !job.publicKey) return;
  if (Date.now() - (job.at || 0) > 3 * 60 * 1000) {
    await storageSet({ [FEE_JOB_KEY]: null });
    try {
      chrome.alarms.clear("gladiator-collect-fee");
    } catch (_) {}
    return;
  }

  let acc = null;
  if (
    cachedSigner &&
    cachedSigner.publicKey === job.publicKey &&
    (cachedSigner.secretKey || cachedSigner.mnemonic)
  ) {
    acc = {
      hasSigner: true,
      publicKey: cachedSigner.publicKey,
      secretKey: cachedSigner.secretKey || "",
      mnemonic: cachedSigner.mnemonic || "",
    };
  } else {
    cacheSignerFromState(bag[STORE_KEY]);
    acc = await getActiveSolanaAccount();
  }
  if (!acc || !acc.hasSigner) {
    try {
      chrome.alarms.create("gladiator-collect-fee", { when: Date.now() + 15000 });
    } catch (_) {}
    return;
  }

  feeJobRunning = true;
  const keep = setInterval(() => {
    try {
      chrome.storage.local.get(["_gladiator_fee_keepalive"], () => {});
    } catch (_) {}
  }, 3000);

  try {
    // Do NOT reset/close offscreen here — that aborts live Jupiter signatures.
    await ensureOffscreen();
    // Refresh job in case beforeSnapshot arrived while we waited.
    const fresh = await storageGet([FEE_JOB_KEY]);
    const liveJob = (fresh && fresh[FEE_JOB_KEY]) || job;
    const result = await callOffscreen("collectPlatformFee", {
      _publicKey: acc.publicKey,
      _secretKey: acc.secretKey || "",
      _mnemonic: acc.mnemonic || "",
      hintSig: liveJob.hintSig || "",
      beforeSnapshot: liveJob.beforeSnapshot || null,
    });
    console.info("[Gladiator] fee collect result", result);
    if (result && result.ok) {
      await storageSet({ [FEE_JOB_KEY]: null });
      try {
        chrome.alarms.clear("gladiator-collect-fee");
      } catch (_) {}
      return;
    }
    liveJob.tries = (liveJob.tries || 0) + 1;
    if (liveJob.tries < 6) {
      await storageSet({ [FEE_JOB_KEY]: liveJob });
      try {
        chrome.alarms.create("gladiator-collect-fee", { when: Date.now() + 20000 });
      } catch (_) {}
    } else {
      await storageSet({ [FEE_JOB_KEY]: null });
    }
  } catch (err) {
    console.warn("[Gladiator] fee collect failed", err);
    job.tries = (job.tries || 0) + 1;
    await storageSet({ [FEE_JOB_KEY]: job });
    try {
      chrome.alarms.create("gladiator-collect-fee", { when: Date.now() + 20000 });
    } catch (_) {}
  } finally {
    clearInterval(keep);
    feeJobRunning = false;
  }
}

const DAPP_APPROVE_REQ = "gladiator_dapp_approve_req";
const DAPP_APPROVE_RES = "gladiator_dapp_approve_res";

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Show Approve on the dApp tab itself (content-script overlay).
 * Never opens a side/relay window — that steals focus and breaks swaps.
 */
async function showApproveOnTab(tabId, req) {
  if (tabId == null || !chrome.tabs || !chrome.tabs.sendMessage) return false;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "gladiator-show-approve",
      req,
    });
    return true;
  } catch (_) {
    // Content script may not be ready — try a one-shot inject, then retry.
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content-script.js"],
          world: "ISOLATED",
        });
        await sleepMs(80);
        await chrome.tabs.sendMessage(tabId, {
          type: "gladiator-show-approve",
          req,
        });
        return true;
      }
    } catch (err) {
      console.warn("[Gladiator] in-page approve inject", err);
    }
  }
  return false;
}

/** Ask the user to approve inside the wallet UI overlay on the dApp page. */
async function requestUserApproval({
  origin,
  method,
  title,
  body,
  chain,
  tabId,
}) {
  const reqId =
    "dap_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const req = {
    id: reqId,
    origin: origin || "",
    method: method || "",
    title: title || "Approve request?",
    body: body || "",
    chain: chain || "",
    at: Date.now(),
  };
  await storageSet({
    [DAPP_APPROVE_REQ]: req,
    [DAPP_APPROVE_RES]: null,
  });

  let shown = false;
  try {
    shown = await showApproveOnTab(tabId, req);
  } catch (err) {
    console.warn("[Gladiator] approval surface", err);
  }
  // Soft fallback: toolbar popup only (never chrome.windows.create).
  if (!shown) {
    try {
      await nudgeWalletPopup();
    } catch (_) {}
  }

  for (let i = 0; i < 120; i++) {
    await sleepMs(500);
    const bag = await storageGet([DAPP_APPROVE_RES]);
    const res = bag[DAPP_APPROVE_RES];
    if (!res || res.id !== reqId) continue;
    await storageSet({ [DAPP_APPROVE_REQ]: null, [DAPP_APPROVE_RES]: null });
    if (res.approved) return true;
    const err = new Error(res.error || "User rejected the request");
    err.code = 4001;
    throw err;
  }
  await storageSet({ [DAPP_APPROVE_REQ]: null, [DAPP_APPROVE_RES]: null });
  const err = new Error("Approval timed out — Approve in the Gladiator prompt on the page");
  err.code = 4001;
  throw err;
}

function shortOriginHost(origin) {
  try {
    return new URL(origin).hostname || origin;
  } catch (_) {
    return origin || "unknown site";
  }
}

async function handleProviderRequest(msg, sender) {
  const method = msg.method;
  const params = Object.assign({}, msg.params || {});
  // Prefer the isolated content-script / extension sender origin. Never trust
  // a page-controlled params.origin (delete it if present).
  try {
    delete params.origin;
  } catch (_) {}
  const origin =
    (sender && sender.origin) ||
    (msg && msg.origin) ||
    "";
  const tabId =
    sender && sender.tab && sender.tab.id != null ? sender.tab.id : null;

  // EIP-1193 ethereum methods (Uniswap, etc.)
  if (
    method === "eth_requestAccounts" ||
    method === "eth_accounts" ||
    method === "eth_chainId" ||
    method === "net_version" ||
    method === "wallet_switchEthereumChain" ||
    method === "wallet_addEthereumChain" ||
    method === "personal_sign" ||
    method === "eth_sign" ||
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4" ||
    method === "eth_sendTransaction" ||
    String(method || "").startsWith("eth_")
  ) {
    return await handleEvmProviderRequest(method, params, origin, tabId);
  }

  if (method === "connect") {
    const onlyIfTrusted = !!params.onlyIfTrusted;
    const trusted = await readTrustedOrigins();
    const isTrusted = !!(origin && trusted.includes(origin));
    if (onlyIfTrusted && !isTrusted) {
      return { result: null };
    }
    if (!isTrusted) {
      await requestUserApproval({
        origin,
        method: "connect",
        title: "Connect wallet?",
        body:
          shortOriginHost(origin) +
          " wants to connect to your Solana wallet.",
        chain: "solana",
        tabId,
      });
    }
    const publicKey = await getActivePublicKey();
    if (origin) await trustOrigin(origin);
    return { result: { publicKey } };
  }

  if (method === "disconnect") {
    if (origin) await untrustOrigin(origin);
    return { result: { ok: true } };
  }

  if (
    method === "signTransaction" ||
    method === "signAllTransactions" ||
    method === "signAndSendTransaction" ||
    method === "signMessage"
  ) {
    // Stay connected until the user disconnects, but approve every tx/sign.
    const trusted = await readTrustedOrigins();
    const isTrusted = !!(origin && trusted.includes(origin));
    if (!isTrusted) {
      await requestUserApproval({
        origin,
        method: "connect",
        title: "Connect wallet?",
        body:
          shortOriginHost(origin) +
          " wants to connect before signing.",
        chain: "solana",
        tabId,
      });
      if (origin) await trustOrigin(origin);
    }
    const labels = {
      signTransaction: "Approve transaction?",
      signAllTransactions: "Approve transactions?",
      signAndSendTransaction: "Approve & send transaction?",
      signMessage: "Sign message?",
    };
    await requestUserApproval({
      origin,
      method,
      title: labels[method] || "Approve?",
      body:
        shortOriginHost(origin) +
        " wants to " +
        (method === "signMessage" ? "sign a message" : "sign a transaction") +
        " with your Solana wallet.",
      chain: "solana",
      tabId,
    });

    const acc = await requireSignerReady();
    const needFee =
      method === "signTransaction" ||
      method === "signAllTransactions" ||
      method === "signAndSendTransaction";

    // Ledger keys never leave the device — sign in the wallet window via WebHID.
    if (acc.ledger) {
      const result = await signViaWalletWindow(method, params, acc);
      return {
        result,
        feeAcc: null,
        hintSig: result && result.signature ? String(result.signature) : "",
        snapPromise: null,
      };
    }

    const enriched = {
      ...params,
      _publicKey: acc.publicKey,
      _secretKey: acc.secretKey || "",
      _mnemonic: acc.mnemonic || "",
    };
    // Start balance snapshot in parallel with signing (does not delay Jupiter).
    const snapPromise = needFee
      ? callOffscreen("snapshotBalances", {
          _publicKey: acc.publicKey,
          _secretKey: acc.secretKey || "",
          _mnemonic: acc.mnemonic || "",
        }).catch(() => null)
      : null;
    const raw = await callOffscreen(method, enriched);
    const result = raw && typeof raw === "object" ? { ...raw } : raw;
    if (result && result.beforeSnapshot) delete result.beforeSnapshot;

    return {
      result,
      feeAcc: needFee ? acc : null,
      hintSig: result && result.signature ? String(result.signature) : "",
      snapPromise,
    };
  }

  throw new Error("Unsupported provider method: " + method);
}

// Force fresh offscreen scripts on every service-worker boot / reload.
(async () => {
  try {
    await resetOffscreen();
  } catch (_) {
    try {
      await ensureOffscreen();
    } catch (_) {}
  }
  try {
    const bag = await storageGet([FEE_JOB_KEY]);
    if (bag[FEE_JOB_KEY] && bag[FEE_JOB_KEY].publicKey) {
      chrome.alarms.create("gladiator-collect-fee", { when: Date.now() + 3000 });
    }
  } catch (_) {}
})();

chrome.alarms &&
  chrome.alarms.onAlarm &&
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== "gladiator-collect-fee") return;
    runFeeJob().catch((err) => console.warn("[Gladiator] fee alarm", err));
  });

async function injectAllMatchingTabs() {
  if (!chrome.tabs || !chrome.tabs.query) return;
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "https://jup.ag/*",
        "https://*.jup.ag/*",
        "https://pump.fun/*",
        "https://*.pump.fun/*",
        "https://raydium.io/*",
        "https://*.raydium.io/*",
        "https://tensor.trade/*",
        "https://*.tensor.trade/*",
        "https://orca.so/*",
        "https://*.orca.so/*",
        "https://drift.trade/*",
        "https://*.drift.trade/*",
        "https://mango.markets/*",
        "https://*.mango.markets/*",
        "https://kamino.finance/*",
        "https://*.kamino.finance/*",
        "https://sanctum.so/*",
        "https://*.sanctum.so/*",
        "https://uniswap.org/*",
        "https://*.uniswap.org/*",
        "https://relay.link/*",
        "https://*.relay.link/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
      ],
    });
    for (const tab of tabs || []) {
      if (tab && tab.id != null) {
        injectProviderIntoTab(tab.id, tab.url).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[Gladiator] injectAllMatchingTabs", err);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[Gladiator] installed — open the toolbar icon.");
  }
  storageSet({ gladiator_page_inject: true }).catch(() => {});
  resetOffscreen().catch(() => {});
  // After Reload / update, re-inject into already-open dApp tabs.
  setTimeout(() => {
    injectAllMatchingTabs().catch(() => {});
  }, 500);
});

chrome.runtime.onStartup.addListener(() => {
  resetOffscreen().catch(() => {});
  setTimeout(() => {
    injectAllMatchingTabs().catch(() => {});
  }, 800);
});

chrome.windows.onRemoved.addListener((id) => {
  if (id === walletWindowId) walletWindowId = null;
});

/**
 * Backup inject for allowlisted Solana dApps (manifest also injects at document_start).
 * Hard cap: 3 programmatic inject tries per tab refresh / navigation.
 */
const INJECT_FLAG = "gladiator_page_inject";
const INJECT_MAX_TRIES = 3;
const injectedTabs = new Set();
/** tabId -> { url, count } — resets on each load/refresh. */
const injectTryBudget = new Map();

function shouldInjectProvider(url) {
  if (!url || !/^https?:/i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "chrome.google.com" || host.endsWith("chromewebstore.google.com")) {
      return false;
    }
    const allow = [
      "jup.ag",
      "pump.fun",
      "raydium.io",
      "tensor.trade",
      "orca.so",
      "drift.trade",
      "mango.markets",
      "kamino.finance",
      "sanctum.so",
      "uniswap.org",
      "relay.link",
      "localhost",
      "127.0.0.1",
    ];
    return allow.some((d) => host === d || host.endsWith("." + d));
  } catch (_) {
    return false;
  }
}

async function isPageInjectEnabled() {
  const bag = await storageGet([INJECT_FLAG]);
  // Default ON. Set gladiator_page_inject=false to disable.
  if (bag[INJECT_FLAG] === false) return false;
  return true;
}

function resetInjectBudget(tabId, url) {
  injectTryBudget.set(tabId, { url: String(url || ""), count: 0 });
}

function takeInjectTry(tabId, url) {
  const u = String(url || "");
  let row = injectTryBudget.get(tabId);
  if (!row || row.url !== u) {
    row = { url: u, count: 0 };
  }
  if (row.count >= INJECT_MAX_TRIES) {
    injectTryBudget.set(tabId, row);
    return false;
  }
  row.count += 1;
  injectTryBudget.set(tabId, row);
  return true;
}

async function injectProviderIntoTab(tabId, url) {
  if (!(await isPageInjectEnabled())) return;
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  if (!takeInjectTry(tabId, url)) {
    console.info(
      "[Gladiator] inject skip — " + INJECT_MAX_TRIES + " tries used this refresh",
      url || tabId
    );
    return;
  }
  try {
    // MAIN first so Wallet Standard registers before dApp wallet scan.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["injected.js"],
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"],
      world: "ISOLATED",
    });
    injectedTabs.add(tabId);
    console.info("[Gladiator] Wallet Standard injected into", url || tabId);
  } catch (err) {
    console.warn("[Gladiator] inject failed", err);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  injectTryBudget.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = (tab && tab.url) || changeInfo.url || "";
  if (changeInfo.url) {
    injectedTabs.delete(tabId);
    resetInjectBudget(tabId, url);
  }
  // New document load / refresh — reset the 3-try budget.
  if (changeInfo.status === "loading") {
    resetInjectBudget(tabId, url);
  }
  if (!shouldInjectProvider(url)) return;
  // Inject early on loading, then again on complete for SPA shells (≤3 total).
  if (changeInfo.status === "loading") {
    injectProviderIntoTab(tabId, url).catch(() => {});
    return;
  }
  if (changeInfo.status === "complete" || changeInfo.url) {
    const delay = /jup\.ag/i.test(String(url || "")) ? 800 : 200;
    setTimeout(() => {
      injectProviderIntoTab(tabId, url).catch(() => {});
    }, delay);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  // Offscreen document handles these — do not claim the message here.
  if (msg.type === "gladiator-offscreen") return;

  if (msg.type === "gladiator-persist-wallet") {
    const state = msg.state;
    if (!state || !Array.isArray(state.accounts)) {
      sendResponse({ ok: false, error: "Invalid wallet state" });
      return true;
    }
    const toStore = { ...state };
    delete toStore._needsVaultMigrate;
    const hasSecrets = (toStore.accounts || []).some((a) => {
      if (!a) return false;
      if (a.mnemonic) return true;
      if (a.solana && a.solana.secretKey) return true;
      if (a.evm && a.evm.privateKey) return true;
      return false;
    });
    if (hasSecrets) {
      delete toStore.vault;
      delete toStore.vaultEnabled;
    }
    const cached = cacheSignerFromState(toStore);
    storageSet({ [STORE_KEY]: toStore })
      .then(() => {
        notifyPersistWaiters();
        sendResponse({
          ok: true,
          accounts: toStore.accounts.length,
          signerReady: !!cached,
          publicKey: cached && cached.publicKey,
        });
      })
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  }

  if (msg.type === "gladiator-signer-status") {
    getActiveSolanaAccount()
      .then((acc) =>
        sendResponse({
          ok: true,
          ready: !!(acc && acc.hasSigner),
          publicKey: acc && acc.publicKey,
          needsMigrate: !!(acc && acc.needsMigrate),
        })
      )
      .catch(() => sendResponse({ ok: true, ready: false }));
    return true;
  }

  if (msg.type === "gladiator-set-inject") {
    const enabled = !!msg.enabled;
    storageSet({ [INJECT_FLAG]: enabled })
      .then(() => sendResponse({ ok: true, enabled }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  }

  if (msg.type === "gladiator-get-inject") {
    isPageInjectEnabled()
      .then((enabled) => sendResponse({ ok: true, enabled }))
      .catch(() => sendResponse({ ok: true, enabled: true }));
    return true;
  }

  if (msg.type === "gladiator-list-dapp-connections") {
    listInjectConnections()
      .then((items) => sendResponse({ ok: true, items }))
      .catch((err) =>
        sendResponse({
          ok: false,
          items: [],
          error: String(err && err.message ? err.message : err),
        })
      );
    return true;
  }

  if (msg.type === "gladiator-disconnect-dapp") {
    const origin = String(msg.origin || "").trim();
    forceDisconnectOrigin(origin)
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  }

  if (msg.type === "wc-open-wallet" || msg.type === "wc-open-bridge") {
    focusOrOpenWcWallet({
      focus: msg.focus !== false,
      settings: msg.ledger || msg.ledgerSign ? false : msg.settings !== false,
      restore: !!msg.restore,
      ledger: !!msg.ledger,
      ledgerSign: !!msg.ledgerSign,
    })
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  }

  if (msg.type === "gladiator-provider") {
    handleProviderRequest(msg, sender)
      .then((out) => {
        const payload = out && Object.prototype.hasOwnProperty.call(out, "result")
          ? { result: out.result }
          : { result: out };
        sendResponse(payload);
        if (out && out.feeAcc) {
          scheduleFeeJob(out.feeAcc, out.hintSig || "", out.snapPromise || null).catch(
            (err) => console.warn("[Gladiator] schedule fee", err)
          );
        }
      })
      .catch((err) =>
        sendResponse({ error: String(err && err.message ? err.message : err) })
      );
    return true;
  }
});
