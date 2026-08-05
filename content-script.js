/**
 * Isolated-world bridge. Forwards page provider requests to the extension.
 * Does not touch the page DOM or MAIN-world globals.
 */
(function () {
  if (window.__GLADIATOR_BRIDGE_INSTALLED__) return;
  window.__GLADIATOR_BRIDGE_INSTALLED__ = true;

  const PAGE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";

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
                  (!response ? "Gladiator extension unavailable" : null),
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
})();
