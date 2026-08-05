/**
 * Content script — injects Gladiator provider into the page and bridges messages.
 */
(function () {
  const PAGE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";

  function inject() {
    try {
      if (document.documentElement.dataset.gladiatorInjected === "1") return;
      document.documentElement.dataset.gladiatorInjected = "1";
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("injected.js");
      script.async = false;
      script.onload = () => {
        try {
          window.postMessage(
            {
              source: "gladiator-wallet-meta",
              icon: chrome.runtime.getURL("icons/icon128.png"),
            },
            "*"
          );
        } catch (_) {}
        script.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (err) {
      console.warn("[Gladiator] inject failed", err);
    }
  }

  inject();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject, { once: true });
  }

  window.addEventListener("message", (event) => {
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
        window.postMessage(
          {
            source: REPLY,
            id: data.id,
            result: response && response.result,
            error:
              (response && response.error) ||
              (err && err.message) ||
              (!response ? "Gladiator extension unavailable" : null),
          },
          "*"
        );
      }
    );
  });
})();
