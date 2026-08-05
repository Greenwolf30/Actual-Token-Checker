/**
 * Isolated-world bridge: page provider (MAIN) <-> extension background.
 * Provider itself is injected via manifest content_scripts world:MAIN.
 */
(function () {
  const PAGE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";

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
