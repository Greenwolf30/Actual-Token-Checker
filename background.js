/** Gladiator extension service worker — keeps WalletConnect bridge alive for Jupiter/pump.fun */
const WC_BRIDGE_PATH = "wc-bridge.html";
let bridgeWindowId = null;

async function focusOrOpenWcBridge(opts) {
  const url = chrome.runtime.getURL(WC_BRIDGE_PATH);
  const focus = !opts || opts.focus !== false;

  if (bridgeWindowId != null) {
    try {
      await chrome.windows.update(bridgeWindowId, focus ? { focused: true } : {});
      return { ok: true, reused: true, windowId: bridgeWindowId };
    } catch (_) {
      bridgeWindowId = null;
    }
  }

  try {
    const tabs = await chrome.tabs.query({ url });
    if (tabs && tabs[0] && tabs[0].windowId != null) {
      bridgeWindowId = tabs[0].windowId;
      if (focus) await chrome.windows.update(bridgeWindowId, { focused: true });
      return { ok: true, reused: true, windowId: bridgeWindowId };
    }
  } catch (_) {}

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width: 380,
    height: 520,
    focused: focus,
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
  focusOrOpenWcBridge({ focus: msg.focus !== false })
    .then((r) => sendResponse(r))
    .catch((err) =>
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
    );
  return true;
});
