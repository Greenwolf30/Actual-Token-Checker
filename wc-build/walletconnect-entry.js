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

function peerKeyFromMeta(meta) {
  if (!meta || typeof meta !== "object") return "";
  const url = String(meta.url || "").trim();
  if (url) {
    try {
      const u = new URL(url);
      return (u.host || url).toLowerCase().replace(/^www\./, "");
    } catch (_) {
      return url.toLowerCase();
    }
  }
  return String(meta.name || "")
    .trim()
    .toLowerCase();
}

/** Keep one session per dApp (same site/name). Re-connecting used to stack duplicates. */
async function pruneDuplicatePeerSessions(keepTopic) {
  if (!walletKit) return 0;
  const sessions = getActiveSessions();
  const topics = Object.keys(sessions);
  if (topics.length < 2) return 0;

  // Group topics by peer; keep newest expiry (or explicit keepTopic).
  const groups = new Map();
  for (const topic of topics) {
    const s = sessions[topic] || {};
    const key = peerKeyFromMeta(s.peer && s.peer.metadata) || "topic:" + topic;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(topic);
  }

  const keep = new Set();
  for (const [, group] of groups) {
    if (group.length === 1) {
      keep.add(group[0]);
      continue;
    }
    if (keepTopic && group.includes(keepTopic)) {
      keep.add(keepTopic);
      continue;
    }
    let best = group[0];
    let bestExp = Number((sessions[best] && sessions[best].expiry) || 0);
    for (const topic of group) {
      const exp = Number((sessions[topic] && sessions[topic].expiry) || 0);
      if (exp >= bestExp) {
        best = topic;
        bestExp = exp;
      }
    }
    keep.add(best);
  }

  let removed = 0;
  for (const topic of topics) {
    if (keep.has(topic)) continue;
    try {
      await disconnectSession(topic);
      removed++;
    } catch (_) {}
  }
  if (removed) status("Removed " + removed + " duplicate session(s) for the same dApp");
  return removed;
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

  // Drop prior sessions to this same dApp before accepting a new one.
  const proposerMeta =
    proposal &&
    proposal.params &&
    proposal.params.proposer &&
    proposal.params.proposer.metadata;
  const incomingKey = peerKeyFromMeta(proposerMeta);
  if (incomingKey) {
    const existing = getActiveSessions();
    for (const topic of Object.keys(existing)) {
      const meta = existing[topic] && existing[topic].peer && existing[topic].peer.metadata;
      if (peerKeyFromMeta(meta) === incomingKey) {
        try {
          await disconnectSession(topic);
        } catch (_) {}
      }
    }
  }

  const session = await walletKit.approveSession({
    id: proposal.id,
    namespaces,
  });
  try {
    await pruneDuplicatePeerSessions(session && session.topic);
  } catch (_) {}
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

async function disconnectSession(topic) {
  if (!walletKit || !topic) return;
  await walletKit.disconnectSession({
    topic: String(topic),
    reason: { code: 6000, message: "User disconnected" },
  });
  status("Disconnected session");
}

async function disconnectAll() {
  if (!walletKit) return;
  const sessions = getActiveSessions();
  for (const topic of Object.keys(sessions)) {
    try {
      await disconnectSession(topic);
    } catch (_) {}
  }
  status("Disconnected");
}

/** Compact session list for UI / storage mirroring. */
function listSessions() {
  const sessions = getActiveSessions();
  return Object.keys(sessions).map((topic) => {
    const s = sessions[topic] || {};
    const meta = (s.peer && s.peer.metadata) || {};
    const ns = s.namespaces || {};
    const accounts = [];
    const chains = [];
    for (const key of Object.keys(ns)) {
      const block = ns[key] || {};
      if (Array.isArray(block.accounts)) {
        for (const a of block.accounts) accounts.push(a);
      }
      if (Array.isArray(block.chains)) {
        for (const c of block.chains) chains.push(c);
      }
    }
    if (!chains.length) {
      for (const a of accounts) {
        const parts = String(a).split(":");
        if (parts.length >= 2) chains.push(parts[0] + ":" + parts[1]);
      }
    }
    return {
      topic,
      name: meta.name || "dApp",
      url: meta.url || "",
      icon: Array.isArray(meta.icons) && meta.icons[0] ? meta.icons[0] : "",
      accounts: Array.from(new Set(accounts)),
      chains: Array.from(new Set(chains)),
      expiry: s.expiry || 0,
      status: "active",
    };
  });
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
  listSessions,
  disconnectSession,
  disconnectAll,
  pruneDuplicatePeerSessions,
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
