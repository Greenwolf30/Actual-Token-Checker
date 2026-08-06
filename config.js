/**
 * Gladiator public config (safe to commit).
 * Helius belongs in local .env + serve.py only — never in the extension.
 */
(function () {
  const isExt = !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  window.GLADIATOR_CONFIG = {
    solanaRpcProxy: isExt ? "" : "/api/solana-rpc",
    // Optional default Reown / WalletConnect Project ID (override in Settings).
    wcProjectId: "",
  };
})();
