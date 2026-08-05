/**
 * Gladiator WalletConnect (WalletKit) bridge — bundled for the extension.
 * Exposes window.GladiatorWC
 */
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import {
  buildAuthObject,
  populateAuthPayload,
  getSdkError,
} from "@walletconnect/utils";

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
  /** Sign raw UTF-8 string (for One-Click Auth / SIWX message text). */
  signUtf8Message: async () => {
    throw new Error("signUtf8Message not wired");
  },
  onProposal: null,
  onRequest: null,
  onAuthenticate: null,
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

async function approveAuthenticate(payload) {
  const pubkey = await handlers.getSolanaPublicKey();
  if (!pubkey) throw new Error("No Solana address");

  let authPayload;
  try {
    authPayload = populateAuthPayload({
      authPayload: payload.params.authPayload,
      chains: [SOLANA_MAINNET, SOLANA_MAINNET_LEGACY],
      methods: SOLANA_METHODS,
    });
  } catch (err) {
    // Some dApps mix EVM+Solana auth; if populate fails, fall back to raw payload.
    status("Auth populate fallback: " + (err && err.message ? err.message : err));
    authPayload = payload.params.authPayload;
  }

  // Prefer a solana chain from the populated payload
  const chain =
    (authPayload.chains || []).find((c) => String(c).startsWith("solana:")) ||
    SOLANA_MAINNET;
  // buildAuthObject prefixes did:pkh: when missing
  const iss = `${chain}:${pubkey}`;
  const message = walletKit.formatAuthMessage({
    request: authPayload,
    iss,
  });

  status("Ownership auth message — signing…");
  const signature = await handlers.signUtf8Message(message);
  // CACAO types signatures as eip191/eip1271; Solana ed25519 sig is carried in `s` (base58).
  const auth = buildAuthObject(
    authPayload,
    {
      t: "eip191",
      s: signature,
    },
    iss
  );

  const result = await walletKit.approveSessionAuthenticate({
    id: payload.id,
    auths: [auth],
  });
  status("Ownership proof sent — check pump.fun");
  return result;
}

async function init(projectId, metadata, opts) {
  if (!projectId || String(projectId).trim().length < 8) {
    throw new Error(
      "WalletConnect Project ID required — get a free one at https://dashboard.walletconnect.com"
    );
  }
  if (walletKit) return walletKit;

  const core = new Core({
    projectId: String(projectId).trim(),
    // Keep bridge storage separate from any popup instance.
    customStoragePrefix: (opts && opts.storagePrefix) || "gladiator-wc",
  });
  walletKit = await WalletKit.init({
    core,
    metadata: metadata || {
      name: "Gladiator Wallet",
      description: "Gladiator local multi-chain wallet",
      url: "https://gladiator.wallet",
      icons: [],
    },
  });

  walletKit.on("session_proposal", async (proposal) => {
    status(
      "Session proposal from " +
        ((proposal.params &&
          proposal.params.proposer &&
          proposal.params.proposer.metadata &&
          proposal.params.proposer.metadata.name) ||
          "dApp")
    );
    try {
      if (typeof handlers.onProposal === "function") {
        await handlers.onProposal(proposal);
        return;
      }
      await approveProposal(proposal);
    } catch (err) {
      status("Proposal failed: " + (err && err.message ? err.message : err));
    }
  });

  walletKit.on("session_authenticate", async (payload) => {
    status("pump.fun ownership auth request…");
    try {
      if (typeof handlers.onAuthenticate === "function") {
        await handlers.onAuthenticate(payload);
        return;
      }
      await approveAuthenticate(payload);
    } catch (err) {
      try {
        await walletKit.rejectSessionAuthenticate({
          id: payload.id,
          reason: getSdkError("USER_REJECTED"),
        });
      } catch (_) {}
      status("Auth failed: " + (err && err.message ? err.message : err));
    }
  });

  walletKit.on("session_request", async (event) => {
    try {
      if (typeof handlers.onRequest === "function") {
        await handlers.onRequest(event);
        return;
      }
      await handleRequest(event);
    } catch (err) {
      status("Request failed: " + (err && err.message ? err.message : err));
    }
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
  const namespaces = buildSolanaNamespace(pubkey, {
    solana: {
      ...(optional.solana || {}),
      ...(required.solana || {}),
      chains: [
        ...((required.solana && required.solana.chains) || []),
        ...((optional.solana && optional.solana.chains) || []),
        SOLANA_MAINNET,
        SOLANA_MAINNET_LEGACY,
      ],
      methods: [
        ...((required.solana && required.solana.methods) || []),
        ...((optional.solana && optional.solana.methods) || []),
        ...SOLANA_METHODS,
      ],
    },
  });

  const wantsSolana =
    !!(required.solana || optional.solana) || Object.keys(required).length === 0;
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
  status(
    "Connected to " +
      ((session && session.peer && session.peer.metadata && session.peer.metadata.name) ||
        "dApp") +
      " — waiting for ownership signature…"
  );
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

function normalizeRequestParams(raw) {
  if (raw == null) return {};
  if (Array.isArray(raw)) {
    if (!raw.length) return {};
    if (raw.length === 1) {
      const only = raw[0];
      if (only && typeof only === "object" && !Array.isArray(only)) return only;
      if (typeof only === "string") return { message: only, transaction: only };
    }
    if (typeof raw[0] === "string") {
      return { message: raw[0], pubkey: typeof raw[1] === "string" ? raw[1] : undefined };
    }
    return raw[0] || {};
  }
  return raw;
}

async function handleRequest(event) {
  const { topic, params, id } = event;
  const method = params && params.request && params.request.method;
  const reqParams = normalizeRequestParams(
    params && params.request && params.request.params
  );
  try {
    let result;
    if (method === "solana_getAccounts" || method === "solana_requestAccounts") {
      const pubkey = await handlers.getSolanaPublicKey();
      result = method === "solana_getAccounts" ? [{ pubkey }] : { pubkey };
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
    try {
      await walletKit.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: "2.0",
          error: { code: 5000, message: msg },
        },
      });
    } catch (_) {}
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
  status("Paired — waiting for pump.fun session / signature…");
}

function getActiveSessions() {
  if (!walletKit) return {};
  return walletKit.getActiveSessions() || {};
}

async function rejectRequest(event, message) {
  if (!walletKit || !event) return;
  await walletKit.respondSessionRequest({
    topic: event.topic,
    response: {
      id: event.id,
      jsonrpc: "2.0",
      error: { code: 5000, message: message || "User rejected" },
    },
  });
  status("Request rejected");
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

async function processPendings() {
  if (!walletKit) return { proposals: 0, requests: 0, auths: 0 };
  let proposals = 0;
  let requests = 0;
  try {
    const pendingProps = walletKit.getPendingSessionProposals() || {};
    const list = Array.isArray(pendingProps)
      ? pendingProps
      : Object.values(pendingProps);
    for (const proposal of list) {
      proposals++;
      if (typeof handlers.onProposal === "function") await handlers.onProposal(proposal);
      else await approveProposal(proposal);
    }
  } catch (_) {}
  try {
    const pendingReqs = walletKit.getPendingSessionRequests() || [];
    for (const event of pendingReqs) {
      requests++;
      if (typeof handlers.onRequest === "function") await handlers.onRequest(event);
      else await handleRequest(event);
    }
  } catch (_) {}
  return { proposals, requests };
}

function setHandlers(next) {
  handlers = { ...handlers, ...(next || {}) };
}

const api = {
  init,
  pair,
  approveProposal,
  rejectProposal,
  approveAuthenticate,
  handleRequest,
  rejectRequest,
  getActiveSessions,
  disconnectAll,
  processPendings,
  setHandlers,
  SOLANA_MAINNET,
  isReady: () => !!walletKit,
  getKit: () => walletKit,
};

if (typeof window !== "undefined") {
  window.GladiatorWC = api;
}

export default api;
