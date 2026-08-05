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

function isLedgerAccount(a) {
  return !!(a && (a.type === "ledger" || (a.ledger && a.ledger.path)));
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
  const ledger = isLedgerAccount(acc);
  if (!secretKey && !mnemonic && !ledger) return null;
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
  };
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
  try {
    await focusOrOpenWcWallet({ focus: true, settings: false, restore: true });
  } catch (_) {
    await nudgeWalletPopup();
  }
  for (let i = 0; i < 180; i++) {
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
    "Ledger sign timed out — keep Gladiator open and approve on the device"
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

async function handleProviderRequest(msg, sender) {
  const method = msg.method;
  const params = msg.params || {};
  const origin = params.origin || (sender && sender.origin) || msg.origin || "";

  if (method === "connect") {
    const onlyIfTrusted = !!params.onlyIfTrusted;
    const trusted = await readTrustedOrigins();
    if (onlyIfTrusted && origin && !trusted.includes(origin)) {
      return { result: null };
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
  if (!(await isPageInjectEnabled())) return;
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
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
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = (tab && tab.url) || changeInfo.url || "";
  if (changeInfo.url) injectedTabs.delete(tabId);
  if (!shouldInjectProvider(url)) return;
  // Inject early on loading, then again on complete for SPA shells.
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
