/**
 * Isolated-world bridge only. Provider is injected AFTER page load from background
 * so we don't crash Jupiter during boot.
 */
(function () {
  const PAGE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== PAGE || data.id == null) return;

    try {
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
