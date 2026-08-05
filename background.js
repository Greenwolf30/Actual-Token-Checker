/** Gladiator service worker — WalletConnect window + in-page Solana provider */
const WC_WALLET_PATH = "index.html";
const STORE_KEY = "gladiator_wallet_v1";
const TRUSTED_KEY = "gladiator_trusted_origins";
const OFFSCREEN_URL = "offscreen.html";

let walletWindowId = null;
let offscreenCreating = null;

async function focusOrOpenWcWallet(opts) {
  const focus = !opts || opts.focus !== false;
  const openSettings = !opts || opts.settings !== false;
  const base = chrome.runtime.getURL(WC_WALLET_PATH);
  const url = openSettings ? base + "?wc=1" : base;

  if (walletWindowId != null) {
    try {
      await chrome.windows.update(walletWindowId, focus ? { focused: true } : {});
      try {
        const tabs = await chrome.tabs.query({ windowId: walletWindowId });
        const tab = tabs && tabs[0];
        if (tab && tab.id != null && openSettings) {
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
      if (tabs[0].id != null && openSettings) {
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
    width: 420,
    height: 720,
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
        reasons: ["WORKERS"],
        justification: "Sign Solana transactions for in-page dApps like Jupiter",
      });
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (!/already exists|only a single offscreen/i.test(msg)) throw err;
    } finally {
      offscreenCreating = null;
    }
  })();
  await offscreenCreating;
}

function callOffscreen(method, params) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureOffscreen();
    } catch (err) {
      reject(err);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "gladiator-offscreen", method, params: params || {} },
      (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "Offscreen unavailable"));
          return;
        }
        if (!response || response.ok === false) {
          reject(new Error((response && response.error) || "Sign failed"));
          return;
        }
        resolve(response.result);
      }
    );
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

async function getActivePublicKey() {
  const bag = await storageGet([STORE_KEY]);
  const state = bag[STORE_KEY];
  if (!state || !state.accounts || !state.accounts.length) {
    throw new Error("No wallet — open Gladiator and create/import one");
  }
  const acc =
    state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
  const pk = acc && acc.solana && acc.solana.publicKey;
  if (!pk) throw new Error("No Solana address on active wallet");
  if (!acc.solana.secretKey) {
    throw new Error("Keys missing — open Gladiator once to restore your wallet");
  }
  return pk;
}

async function handleProviderRequest(msg, sender) {
  const method = msg.method;
  const params = msg.params || {};
  const origin = params.origin || (sender && sender.origin) || msg.origin || "";

  if (method === "connect") {
    const onlyIfTrusted = !!params.onlyIfTrusted;
    const trusted = await readTrustedOrigins();
    if (onlyIfTrusted && origin && !trusted.includes(origin)) {
      return null; // silent fail for onlyIfTrusted
    }
    const publicKey = await getActivePublicKey();
    // Warm signer; also verifies keys are usable
    await callOffscreen("getPubkey", {});
    if (origin) await trustOrigin(origin);
    return { publicKey };
  }

  if (method === "disconnect") {
    return { ok: true };
  }

  if (method === "signTransaction") {
    return await callOffscreen("signTransaction", params);
  }
  if (method === "signAllTransactions") {
    return await callOffscreen("signAllTransactions", params);
  }
  if (method === "signAndSendTransaction") {
    return await callOffscreen("signAndSendTransaction", params);
  }
  if (method === "signMessage") {
    return await callOffscreen("signMessage", params);
  }

  throw new Error("Unsupported provider method: " + method);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[Gladiator] installed — open the toolbar icon.");
  }
  // Crash-safe Wallet Standard inject is ON by default (allowlisted Solana dApps).
  storageSet({ gladiator_page_inject: true }).catch(() => {});
  ensureOffscreen().catch(() => {});
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
