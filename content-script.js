/**
 * Isolated-world bridge + page-world provider inject for allowlisted dApps.
 * Runs at document_start so Jupiter can discover Gladiator during wallet scan.
 * Also hosts the in-page Approve UI (no separate side window).
 */
(function () {
  const PAGE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";
  const FORCE = "gladiator-wallet-force-disconnect";
  const DAPP_APPROVE_REQ = "gladiator_dapp_approve_req";
  const DAPP_APPROVE_RES = "gladiator_dapp_approve_res";

  function allowHost(hostname) {
    const host = String(hostname || "")
      .toLowerCase()
      .replace(/^www\./, "");
    if (!host) return false;
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
      "sol-incinerator.com",
      "localhost",
      "127.0.0.1",
    ];
    return allow.some((d) => host === d || host.endsWith("." + d));
  }

  /** Inject MAIN-world provider via script tag (works even if service worker slept). */
  function injectPageProvider() {
    try {
      if (!allowHost(location.hostname)) return;
      if (window.__GLADIATOR_PROVIDER_INSTALLED__) return;
      if (document.documentElement && document.documentElement.dataset.gladiatorInjected === "1") {
        return;
      }
      if (document.querySelector("script[data-gladiator='1']")) return;
      const root = document.documentElement || document.head || document.body;
      if (!root) return;
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("injected.js");
      s.async = false;
      s.dataset.gladiator = "1";
      s.onload = function () {
        try {
          if (document.documentElement) document.documentElement.dataset.gladiatorInjected = "1";
          s.remove();
        } catch (_) {}
      };
      s.onerror = function () {
        try {
          s.remove();
        } catch (_) {}
      };
      root.insertBefore(s, root.firstChild);
    } catch (_) {}
  }

  // Up to 3 inject tries per page load/refresh (guards SPA/wallet-scan races).
  injectPageProvider();
  try {
    setTimeout(injectPageProvider, 250);
    setTimeout(injectPageProvider, 1000);
  } catch (_) {}

  if (window.__GLADIATOR_BRIDGE_INSTALLED__) return;
  window.__GLADIATOR_BRIDGE_INSTALLED__ = true;

  function isDeadExtensionContext(msg) {
    const s = String(msg || "").toLowerCase();
    return (
      s.includes("extension context invalidated") ||
      s.includes("receiving end does not exist") ||
      s.includes("could not establish connection") ||
      s.includes("message port closed")
    );
  }

  function friendlyBridgeError(msg) {
    // Never surface the old "Gladiator Wallet was reloaded…" page banner copy.
    if (isDeadExtensionContext(msg)) return "Gladiator unavailable";
    return String(msg || "Gladiator unavailable");
  }

  function extensionAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // Remove any leftover banner from older builds; do not show a new one.
  try {
    const oldBanner = document.getElementById("gladiator-refresh-banner");
    if (oldBanner) oldBanner.remove();
  } catch (_) {}

  function replyToPage(id, result, error) {
    try {
      window.postMessage(
        {
          source: REPLY,
          id,
          result,
          error: error ? friendlyBridgeError(error) : undefined,
        },
        "*"
      );
    } catch (_) {}
  }

  window.addEventListener("message", (event) => {
    try {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== PAGE || data.id == null) return;

      // Never trust page-supplied origin — always use this frame's location.
      const params = Object.assign({}, data.params || {});
      try {
        delete params.origin;
      } catch (_) {}

      if (!extensionAlive()) {
        replyToPage(data.id, undefined, "Gladiator unavailable");
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "gladiator-provider",
          id: data.id,
          method: data.method,
          params,
          origin: location.origin,
        },
        (response) => {
          const err = chrome.runtime.lastError;
          const errMsg =
            (response && response.error) ||
            (err && err.message) ||
            (!response ? "Gladiator unavailable" : "");
          replyToPage(
            data.id,
            response && response.result,
            errMsg || undefined
          );
        }
      );
    } catch (err) {
      try {
        const data = event && event.data;
        if (!data || data.id == null) return;
        const msg = String(err && err.message ? err.message : err);
        replyToPage(data.id, undefined, msg);
      } catch (_) {}
    }
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "gladiator-force-disconnect") {
        try {
          window.postMessage({ source: FORCE }, "*");
        } catch (_) {}
        return;
      }
      if (msg.type === "gladiator-show-approve" && msg.req) {
        showInPageApprove(msg.req);
      }
    });
  } catch (_) {}

  /* ---------- In-page Approve UI (stays on the dApp — no side window) ---------- */
  let approveHost = null;
  let approveShadow = null;
  let pendingApproveId = null;

  function ensureApproveHost() {
    if (approveHost && approveHost.isConnected) return approveShadow;
    approveHost = document.createElement("div");
    approveHost.id = "gladiator-approve-host";
    approveHost.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    (document.documentElement || document.body).appendChild(approveHost);
    approveShadow = approveHost.attachShadow({ mode: "closed" });
    return approveShadow;
  }

  function hideInPageApprove() {
    pendingApproveId = null;
    if (approveShadow) approveShadow.innerHTML = "";
    if (approveHost) approveHost.style.pointerEvents = "none";
  }

  function respondInPageApprove(approved) {
    const id = pendingApproveId;
    hideInPageApprove();
    if (!id) return;
    try {
      chrome.storage.local.set({
        [DAPP_APPROVE_RES]: {
          id,
          approved: !!approved,
          error: approved ? "" : "User rejected the request",
        },
        [DAPP_APPROVE_REQ]: null,
      });
    } catch (_) {}
  }

  function showInPageApprove(req) {
    if (!req || !req.id) return;
    if (!allowHost(location.hostname)) return;
    const root = ensureApproveHost();
    pendingApproveId = req.id;
    if (approveHost) approveHost.style.pointerEvents = "auto";

    const title = String(req.title || "Approve request?");
    const body = String(
      req.body ||
        (req.origin || "A site") + " is requesting wallet access."
    );
    const hostLabel = (function () {
      try {
        return new URL(req.origin || location.origin).hostname;
      } catch (_) {
        return req.origin || location.hostname;
      }
    })();
    const dappLogo = (function () {
      const host = String(hostLabel || "")
        .toLowerCase()
        .replace(/^www\./, "");
      const map = [
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
      for (let i = 0; i < map.length; i++) {
        if (host === map[i][0] || host.endsWith("." + map[i][0])) {
          return chrome.runtime.getURL("icons/dapps/" + map[i][1] + ".png");
        }
      }
      return chrome.runtime.getURL("icons/icon48.png");
    })();

    root.innerHTML =
      '<style>' +
      ":host, * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }" +
      ".backdrop { position: fixed; inset: 0; background: rgba(6,8,16,0.72); display: grid; place-items: center; padding: 20px; }" +
      ".card { width: min(360px, 100%); border-radius: 18px; border: 1px solid rgba(184,167,207,0.35); " +
      "background: linear-gradient(165deg, #1a1524 0%, #0d1018 55%, #12101a 100%); " +
      "color: #e8eefc; box-shadow: 0 24px 60px rgba(0,0,0,0.55); padding: 18px 18px 16px; pointer-events: auto; }" +
      ".brand { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }" +
      ".logo { width: 36px; height: 36px; border-radius: 10px; object-fit: cover; background: rgba(184,167,207,0.15); }" +
      ".brand strong { font-size: 15px; font-weight: 700; letter-spacing: 0.02em; }" +
      ".brand span { display: block; font-size: 11px; color: rgba(232,238,252,0.55); margin-top: 2px; }" +
      "h2 { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #fff; }" +
      "p { margin: 0 0 8px; font-size: 13px; line-height: 1.45; color: rgba(232,238,252,0.82); }" +
      ".sub { font-size: 11px; color: rgba(232,238,252,0.5); margin-bottom: 14px; }" +
      ".actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }" +
      "button { appearance: none; border: 0; border-radius: 12px; padding: 12px 14px; font-size: 14px; font-weight: 650; cursor: pointer; }" +
      ".no { background: rgba(255,255,255,0.08); color: #e8eefc; }" +
      ".yes { background: linear-gradient(180deg, #c9b8e0 0%, #b8a7cf 100%); color: #1a1024; }" +
      ".no:hover { background: rgba(255,255,255,0.12); }" +
      ".yes:hover { filter: brightness(1.05); }" +
      "</style>" +
      '<div class="backdrop" part="backdrop">' +
      '<div class="card" role="alertdialog" aria-modal="true">' +
      '<div class="brand">' +
      '<img class="logo" alt="" src="' +
      dappLogo +
      '" />' +
      "<div><strong>Gladiator</strong><span>" +
      hostLabel +
      "</span></div></div>" +
      "<h2></h2><p class='body'></p>" +
      '<p class="sub">Connection stays until you disconnect. Every transaction needs Approve.</p>' +
      '<div class="actions">' +
      '<button type="button" class="no">Reject</button>' +
      '<button type="button" class="yes">Approve</button>' +
      "</div></div></div>";

    root.querySelector("h2").textContent = title;
    root.querySelector("p.body").textContent = body;
    root.querySelector("button.no").addEventListener("click", function () {
      respondInPageApprove(false);
    });
    root.querySelector("button.yes").addEventListener("click", function () {
      respondInPageApprove(true);
    });
  }

  // If an approval request is already pending when this tab loads, show it.
  try {
    chrome.storage.local.get([DAPP_APPROVE_REQ], function (bag) {
      const req = bag && bag[DAPP_APPROVE_REQ];
      if (!req || !req.id) return;
      if (req.at && Date.now() - Number(req.at) > 2 * 60 * 1000) return;
      showInPageApprove(req);
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes[DAPP_APPROVE_REQ]) return;
      const req = changes[DAPP_APPROVE_REQ].newValue;
      if (req && req.id) showInPageApprove(req);
      else hideInPageApprove();
    });
  } catch (_) {}
})();
