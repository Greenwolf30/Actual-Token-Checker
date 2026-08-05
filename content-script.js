/**
 * Isolated-world bridge + page-world provider inject for allowlisted dApps.
 * Runs at document_start so Jupiter can discover Gladiator during wallet scan.
 */
(function () {
  const PAGE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";
  const FORCE = "gladiator-wallet-force-disconnect";

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

  window.addEventListener("message", (event) => {
    try {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== PAGE || data.id == null) return;

      chrome.runtime.sendMessage(
        {
          type: "gladiator-provider",
          id: data.id,
          method: data.method,
          params: data.params || {},
          origin: location.origin,
        },
        (response) => {
          const err = chrome.runtime.lastError;
          try {
            window.postMessage(
              {
                source: REPLY,
                id: data.id,
                result: response && response.result,
                error:
                  (response && response.error) ||
                  (err && err.message) ||
                  (!response ? "Gladiator extension unavailable" : undefined),
              },
              "*"
            );
          } catch (_) {}
        }
      );
    } catch (err) {
      try {
        const data = event && event.data;
        if (!data || data.id == null) return;
        window.postMessage(
          {
            source: REPLY,
            id: data.id,
            error: String(err && err.message ? err.message : err),
          },
          "*"
        );
      } catch (_) {}
    }
  });

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "gladiator-force-disconnect") return;
      try {
        window.postMessage({ source: FORCE }, "*");
      } catch (_) {}
    });
  } catch (_) {}
})();
