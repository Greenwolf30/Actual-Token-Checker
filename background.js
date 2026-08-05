/** Gladiator extension service worker — keeps WalletConnect bridge window available */
const WC_BRIDGE_PATH = "wc-bridge.html";
let bridgeWindowId = null;

async function focusOrOpenWcBridge() {
  const url = chrome.runtime.getURL(WC_BRIDGE_PATH);

  if (bridgeWindowId != null) {
    try {
      await chrome.windows.update(bridgeWindowId, { focused: true });
      return { ok: true, reused: true, windowId: bridgeWindowId };
    } catch (_) {
      bridgeWindowId = null;
    }
  }

  // Reuse an existing bridge tab/window if present
  try {
    const tabs = await chrome.tabs.query({ url });
    if (tabs && tabs[0] && tabs[0].windowId != null) {
      bridgeWindowId = tabs[0].windowId;
      await chrome.windows.update(bridgeWindowId, { focused: true });
      if (tabs[0].id != null) {
        try {
          await chrome.tabs.reload(tabs[0].id);
        } catch (_) {}
      }
      return { ok: true, reused: true, windowId: bridgeWindowId };
    }
  } catch (_) {}

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 400,
    height: 560,
    focused: true,
  });
  bridgeWindowId = win && win.id != null ? win.id : null;
  return { ok: true, reused: false, windowId: bridgeWindowId };
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.info("[Gladiator] installed — open the toolbar icon.");
  }
});

chrome.windows.onRemoved.addListener((id) => {
  if (id === bridgeWindowId) bridgeWindowId = null;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "wc-open-bridge") return;
  focusOrOpenWcBridge()
    .then((r) => sendResponse(r))
    .catch((err) =>
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
    );
  return true;
});
