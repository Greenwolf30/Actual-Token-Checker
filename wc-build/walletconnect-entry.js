/**
 * Gladiator WalletConnect (WalletKit) bridge — bundled for the extension.
 * Exposes window.GladiatorWC
 */
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_MAINNET_LEGACY = "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ";
const SOLANA_METHODS = [
  "solana_signMessage",
  "solana_signTransaction",
  "solana_signAllTransactions",
  "solana_signAndSendTransaction",
  "solana_getAccounts",
  "solana_requestAccounts",
];

let walletKit = null;
let handlers = {
  getSolanaPublicKey: async () => "",
  signSolanaMessage: async () => {
    throw new Error("signSolanaMessage not wired");
  },
  signSolanaTransaction: async () => {
    throw new Error("signSolanaTransaction not wired");
  },
  signAllSolanaTransactions: async () => {
    throw new Error("signAllSolanaTransactions not wired");
  },
  signAndSendSolanaTransaction: async () => {
    throw new Error("signAndSendSolanaTransaction not wired");
  },
  onProposal: null,
  onRequest: null,
  onSessionDelete: null,
  onStatus: null,
};

function status(msg) {
  if (typeof handlers.onStatus === "function") handlers.onStatus(msg);
}

function buildSolanaNamespace(pubkey, required) {
  const chains = [SOLANA_MAINNET, SOLANA_MAINNET_LEGACY];
  const reqChains =
    (required &&
      required.solana &&
      (required.solana.chains || required.solana.chainIds)) ||
    [];
  const merged = Array.from(
    new Set([...(reqChains || []).filter(Boolean), ...chains])
  ).filter((c) => String(c).startsWith("solana:"));
  const methods = Array.from(
    new Set([
      ...SOLANA_METHODS,
      ...((required && required.solana && required.solana.methods) || []),
    ])
  );
  const events = Array.from(
    new Set([
      "accountsChanged",
      "chainChanged",
      ...((required && required.solana && required.solana.events) || []),
    ])
  );
  return {
    solana: {
      accounts: merged.map((c) => `${c}:${pubkey}`),
      chains: merged,
      methods,
      events,
    },
  };
}

async function init(projectId, metadata) {
  if (!projectId || String(projectId).trim().length < 8) {
    throw new Error(
      "WalletConnect Project ID required — get a free one at https://cloud.reown.com"
    );
  }
  if (walletKit) return walletKit;

  const core = new Core({ projectId: String(projectId).trim() });
  walletKit = await WalletKit.init({
    core,
    metadata: metadata || {
      name: "Gladiator Wallet",
      description: "Gladiator local multi-chain wallet",
      url: "https://gladiator.local",
      icons: [],
    },
  });

  walletKit.on("session_proposal", async (proposal) => {
    status("Session proposal from " + ((proposal.params && proposal.params.proposer && proposal.params.proposer.metadata && proposal.params.proposer.metadata.name) || "dApp"));
    if (typeof handlers.onProposal === "function") {
      await handlers.onProposal(proposal);
      return;
    }
    // Auto-approve Solana if no UI handler (fallback)
    await approveProposal(proposal);
  });

  walletKit.on("session_request", async (event) => {
    if (typeof handlers.onRequest === "function") {
      await handlers.onRequest(event);
      return;
    }
    await handleRequest(event);
  });

  walletKit.on("session_delete", (event) => {
    status("Session disconnected");
    if (typeof handlers.onSessionDelete === "function") handlers.onSessionDelete(event);
  });

  status("WalletConnect ready");
  return walletKit;
}

async function approveProposal(proposal) {
  const pubkey = await handlers.getSolanaPublicKey();
  if (!pubkey) throw new Error("No Solana address — open/import a wallet first");
  const required = (proposal.params && proposal.params.requiredNamespaces) || {};
  const optional = (proposal.params && proposal.params.optionalNamespaces) || {};
  // Prefer requested namespaces; always offer Solana mainnet account.
  const namespaces = buildSolanaNamespace(pubkey, {
    solana: {
      ...(optional.solana || {}),
      ...(required.solana || {}),
      chains: [
        ...((required.solana && required.solana.chains) || []),
        ...((optional.solana && optional.solana.chains) || []),
        SOLANA_MAINNET,
      ],
      methods: [
        ...((required.solana && required.solana.methods) || []),
        ...((optional.solana && optional.solana.methods) || []),
        ...SOLANA_METHODS,
      ],
    },
  });

  const wantsSolana =
    !!(required.solana || optional.solana) ||
    Object.keys(required).length === 0;
  if (!wantsSolana) {
    await walletKit.rejectSession({
      id: proposal.id,
      reason: {
        code: 5000,
        message: "Gladiator supports Solana WalletConnect (not EVM-only)",
      },
    });
    throw new Error("This dApp did not request Solana — use Solana connect on pump.fun");
  }
  // Cannot satisfy required EIP-155 without EVM WC support.
  if (required.eip155 && !required.solana) {
    await walletKit.rejectSession({
      id: proposal.id,
      reason: {
        code: 5000,
        message: "Open pump.fun with Solana selected, then WalletConnect again",
      },
    });
    throw new Error("dApp required Ethereum — select Solana on the site and retry");
  }

  const session = await walletKit.approveSession({
    id: proposal.id,
    namespaces,
  });
  status("Connected to " + ((session && session.peer && session.peer.metadata && session.peer.metadata.name) || "dApp"));
  return session;
}

async function rejectProposal(proposal, message) {
  if (!walletKit) return;
  await walletKit.rejectSession({
    id: proposal.id,
    reason: { code: 5000, message: message || "User rejected" },
  });
  status("Connection rejected");
}

async function handleRequest(event) {
  const { topic, params, id } = event;
  const method = params && params.request && params.request.method;
  const reqParams = (params && params.request && params.request.params) || {};
  try {
    let result;
    if (method === "solana_getAccounts" || method === "solana_requestAccounts") {
      const pubkey = await handlers.getSolanaPublicKey();
      result = [{ pubkey }];
    } else if (method === "solana_signMessage") {
      result = await handlers.signSolanaMessage(reqParams);
    } else if (method === "solana_signTransaction") {
      result = await handlers.signSolanaTransaction(reqParams);
    } else if (method === "solana_signAllTransactions") {
      result = await handlers.signAllSolanaTransactions(reqParams);
    } else if (method === "solana_signAndSendTransaction") {
      result = await handlers.signAndSendSolanaTransaction(reqParams);
    } else {
      throw new Error("Unsupported method: " + method);
    }
    await walletKit.respondSessionRequest({
      topic,
      response: { id, jsonrpc: "2.0", result },
    });
    status("Signed: " + method);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    await walletKit.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: "2.0",
        error: { code: 5000, message: msg },
      },
    });
    status("Request failed: " + msg);
    throw err;
  }
}

async function pair(uri) {
  if (!walletKit) throw new Error("WalletConnect not initialized");
  const u = String(uri || "").trim();
  if (!u.startsWith("wc:")) throw new Error("Paste a WalletConnect URI starting with wc:");
  status("Pairing…");
  await walletKit.pair({ uri: u });
  status("Paired — approve the session if prompted");
}

function getActiveSessions() {
  if (!walletKit) return {};
  return walletKit.getActiveSessions() || {};
}

async function disconnectAll() {
  if (!walletKit) return;
  const sessions = getActiveSessions();
  for (const topic of Object.keys(sessions)) {
    try {
      await walletKit.disconnectSession({
        topic,
        reason: { code: 6000, message: "User disconnected" },
      });
    } catch (_) {}
  }
  status("Disconnected");
}

function setHandlers(next) {
  handlers = { ...handlers, ...(next || {}) };
}

const api = {
  init,
  pair,
  approveProposal,
  rejectProposal,
  handleRequest,
  getActiveSessions,
  disconnectAll,
  setHandlers,
  SOLANA_MAINNET,
  isReady: () => !!walletKit,
};

if (typeof window !== "undefined") {
  window.GladiatorWC = api;
}

export default api;
