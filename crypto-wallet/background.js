/** Keel extension service worker — keeps the extension alive for popup opens. */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[Keel] extension installed — open the toolbar icon for the wallet popup.");
  }
});
