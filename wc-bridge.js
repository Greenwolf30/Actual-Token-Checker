/**
 * Persistent WalletConnect bridge window.
 * Lives outside the toolbar popup so pump.fun can deliver sign requests.
 */
(function () {
  const STORE_KEY = "gladiator_wallet_v1";
  const PENDING_KEY = "gladiator_wc_pending";
  const SESSIONS_KEY = "gladiator_wc_sessions";
  const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

  const statusEl = document.getElementById("status");
  const retryBtn = document.getElementById("retryBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");

  let wired = false;
  let pairing = false;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("ok", "bad");
    if (kind) statusEl.classList.add(kind);
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (r) => resolve(r || {}));
      } catch (err) {
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(obj, () => {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function activeAccount(state) {
    if (!state || !state.accounts || !state.accounts.length) return null;
    return (
      state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0]
    );
  }

  function solanaKeypair(acc) {
    if (!window.solanaWeb3) throw new Error("Solana library missing");
    if (!acc || !acc.solana || !acc.solana.secretKey) {
      throw new Error("No Solana key — open Gladiator and import/generate a wallet first");
    }
    const sk = Base58.decode(acc.solana.secretKey);
    if (sk.length === 64) return solanaWeb3.Keypair.fromSecretKey(sk);
    if (sk.length === 32) return solanaWeb3.Keypair.fromSeed(sk);
    throw new Error("Corrupt Solana secret key");
  }

  function decodeMessage(raw) {
    if (raw == null) throw new Error("Missing message");
    if (raw instanceof Uint8Array) return raw;
    if (typeof raw !== "string") throw new Error("Bad message type");
    const s = raw.trim();
    // Cleartext (newlines / URI) cannot be WalletConnect base58 — sign UTF-8.
    if (s.includes("\n") || /\s/.test(s) || s.includes("URI:")) {
      return new TextEncoder().encode(s);
    }
    // WalletConnect Solana standard: message is base58(bytes to sign).
    try {
      return Base58.decode(s);
    } catch (_) {
      return new TextEncoder().encode(s);
    }
  }

  function signUtf8(message, kp) {
    const bytes =
      message instanceof Uint8Array
        ? message
        : new TextEncoder().encode(String(message));
    const sig = nacl.sign.detached(bytes, kp.secretKey);
    return Base58.encode(sig);
  }

  function startOwnershipWatch() {
    // After session link, pump.fun often sends solana_signMessage within a few seconds.
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      if (n > 60 || !window.GladiatorWC || !GladiatorWC.isReady()) {
        clearInterval(id);
        return;
      }
      GladiatorWC.processPendings().catch(() => {});
      publishSessions().catch(() => {});
    }, 500);
  }

  async function publishSessions() {
    try {
      const { pending } = await loadState();
      const active =
        window.GladiatorWC && typeof GladiatorWC.listSessions === "function"
          ? GladiatorWC.listSessions()
          : [];
      const items = Array.isArray(active) ? active.slice() : [];
      if (pending && pending.uri && String(pending.uri).startsWith("wc:")) {
        items.unshift({
          topic: "pending:" + String(pending.at || Date.now()),
          name: "Pending connect",
          url: "",
          icon: "",
          accounts: [],
          chains: ["solana"],
          expiry: 0,
          status: "pending",
          uri: String(pending.uri).slice(0, 48) + "…",
        });
      }
      await storageSet({
        [SESSIONS_KEY]: {
          at: Date.now(),
          items,
        },
      });
    } catch (_) {}
  }

  function decodeBytes(raw) {
    if (raw instanceof Uint8Array) return raw;
    if (typeof raw !== "string") throw new Error("Bad payload");
    const s = raw.trim();
    try {
      return Base58.decode(s);
    } catch (_) {}
    if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0) {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    throw new Error("Could not decode payload");
  }

  function normalizeParams(params) {
    if (params == null) return {};
    if (Array.isArray(params)) {
      if (!params.length) return {};
      const only = params[0];
      if (only && typeof only === "object" && !Array.isArray(only)) return only;
      if (typeof only === "string") {
        return {
          message: only,
          transaction: only,
          pubkey: typeof params[1] === "string" ? params[1] : undefined,
        };
      }
      return {};
    }
    return params;
  }

  function signTx(bytes, keypair) {
    const { Transaction, VersionedTransaction } = solanaWeb3;
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (VersionedTransaction) {
      try {
        const vtx = VersionedTransaction.deserialize(u8);
        vtx.sign([keypair]);
        return { signature: Base58.encode(vtx.serialize()) };
      } catch (_) {}
    }
    const tx = Transaction.from(u8);
    tx.partialSign(keypair);
    return { signature: Base58.encode(tx.serialize()) };
  }

  async function loadState() {
    const bag = await storageGet([STORE_KEY, PENDING_KEY]);
    return {
      state: bag[STORE_KEY] || null,
      pending: bag[PENDING_KEY] || null,
    };
  }

  async function wireHandlers() {
    if (wired || !window.GladiatorWC) return;
    GladiatorWC.setHandlers({
      getSolanaPublicKey: async () => {
        const { state } = await loadState();
        const acc = activeAccount(state);
        const pk = acc && acc.solana && acc.solana.publicKey;
        if (!pk) throw new Error("No Solana address on active wallet");
        return pk;
      },
      signUtf8Message: async (message) => {
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        return signUtf8(message, kp);
      },
      signSolanaMessage: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const raw = p.message || p.msg;
        if (!raw) throw new Error("No message from dApp");
        const msg = decodeMessage(raw);
        const sig = nacl.sign.detached(msg, kp.secretKey);
        setStatus(
          "Signed ownership proof (solana_signMessage).\nCheck pump.fun — it should finish connecting.",
          "ok"
        );
        return { signature: Base58.encode(sig) };
      },
      signSolanaTransaction: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const blob = p.transaction || p.tx || p.message;
        const signed = signTx(decodeBytes(blob), kp);
        setStatus("Signed transaction — check pump.fun", "ok");
        return signed;
      },
      signAllSolanaTransactions: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const list = p.transactions || p.txs || [];
        const out = [];
        for (const item of list) {
          const blob = typeof item === "string" ? item : (item && (item.transaction || item.tx));
          out.push(signTx(decodeBytes(blob), kp).signature);
        }
        setStatus("Signed transactions — check pump.fun", "ok");
        return { transactions: out };
      },
      signAndSendSolanaTransaction: async (params) => {
        // Bridge signs; broadcast via public RPC
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const blob = p.transaction || p.tx || p.message;
        const { Transaction, VersionedTransaction } = solanaWeb3;
        const bytes = decodeBytes(blob);
        let raw;
        if (VersionedTransaction) {
          try {
            const vtx = VersionedTransaction.deserialize(bytes);
            vtx.sign([kp]);
            raw = vtx.serialize();
          } catch (_) {
            const tx = Transaction.from(bytes);
            tx.partialSign(kp);
            raw = tx.serialize();
          }
        } else {
          const tx = Transaction.from(bytes);
          tx.partialSign(kp);
          raw = tx.serialize();
        }
        const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        let s = "";
        for (let i = 0; i < u8.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        }
        const b64 = btoa(s);
        const rpcs = [
          "https://api.mainnet-beta.solana.com",
          "https://solana-rpc.publicnode.com",
          "https://solana.drpc.org",
        ];
        let sig = null;
        let lastErr = null;
        for (const rpc of rpcs) {
          try {
            const res = await fetch(rpc, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "sendTransaction",
                params: [b64, { encoding: "base64", preflightCommitment: "confirmed" }],
              }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error.message || "RPC error");
            sig = json.result;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!sig) throw lastErr || new Error("Broadcast failed");
        setStatus("Sent transaction: " + String(sig).slice(0, 16) + "…", "ok");
        return { signature: String(sig) };
      },
      onProposal: async (proposal) => {
        setStatus("pump.fun session — approving…");
        await GladiatorWC.approveProposal(proposal);
        setStatus(
          "Session linked.\nWaiting for ownership signature from pump.fun…\n(Keep this window open — do not close)",
          "ok"
        );
        await publishSessions();
        startOwnershipWatch();
      },
      onAuthenticate: async (payload) => {
        setStatus("pump.fun ownership auth — signing…");
        try {
          await GladiatorWC.approveAuthenticate(payload);
          setStatus(
            "Ownership auth signed.\nCheck pump.fun — “Click confirm” should finish.",
            "ok"
          );
          await publishSessions();
        } catch (err) {
          setStatus("Auth sign failed: " + (err && err.message ? err.message : err), "bad");
          throw err;
        }
      },
      onRequest: async (event) => {
        const method =
          (event && event.params && event.params.request && event.params.request.method) ||
          "request";
        setStatus("pump.fun asked for: " + method + "\nSigning now…");
        try {
          await GladiatorWC.handleRequest(event);
          setStatus(
            "Signed " +
              method.replace(/^solana_/, "") +
              " — look at pump.fun (ownership step should clear)",
            "ok"
          );
          await publishSessions();
        } catch (err) {
          setStatus("Sign failed: " + (err && err.message ? err.message : err), "bad");
        }
      },
      onSessionDelete: async () => {
        setStatus("Disconnected from dApp", "bad");
        await publishSessions();
      },
      onStatus: (msg) => {
        if (msg) setStatus(msg);
      },
    });
    wired = true;
  }

  async function ensureInit(projectId) {
    if (!window.GladiatorWC) throw new Error("WalletConnect bundle failed to load");
    if (!projectId || String(projectId).trim().length < 8) {
      throw new Error("Missing Project ID — paste it in Gladiator → WalletConnect first");
    }
    await wireHandlers();
    await GladiatorWC.init(
      String(projectId).trim(),
      {
        name: "Gladiator Wallet",
        description: "Gladiator WalletConnect bridge",
        url: "https://gladiator.wallet",
        icons: [chrome.runtime.getURL("icons/icon128.png")],
      },
      { storagePrefix: "gladiator-wc-bridge" }
    );
    try {
      const pend = await GladiatorWC.processPendings();
      if (pend && (pend.proposals || pend.requests)) {
        setStatus(
          "Processed pending WC items: " +
            (pend.proposals || 0) +
            " proposal(s), " +
            (pend.requests || 0) +
            " request(s)",
          "ok"
        );
      }
    } catch (_) {}
  }

  async function connectPending() {
    if (pairing) return;
    pairing = true;
    try {
      const { state, pending } = await loadState();
      const projectId =
        (pending && pending.projectId) ||
        (state && state.wcProjectId) ||
        "";
      const uri = pending && pending.uri;
      if (!uri || !String(uri).startsWith("wc:")) {
        setStatus(
          "No pending wc: link.\nIn Gladiator popup: paste URI → Connect (this window should open/focus).",
          "bad"
        );
        return;
      }
      try {
        const q = String(uri).split("?")[1] || "";
        const exp = new URLSearchParams(q).get("expiryTimestamp");
        if (exp && Number(exp) * 1000 < Date.now()) {
          setStatus("That wc: link expired. Copy a fresh one from pump.fun.", "bad");
          return;
        }
      } catch (_) {}

      await ensureInit(projectId);
      setStatus("Pairing with pump.fun… keep this window open");
      await GladiatorWC.pair(String(uri).trim());
      // clear pending uri so retries need a fresh paste (pairing consumes it)
      await storageSet({ [PENDING_KEY]: { projectId, uri: "", at: Date.now(), paired: true } });
      setStatus(
        "Paired. Approving session + ownership signature automatically.\nKeep this window open — pump.fun’s “Click confirm” waits on this.",
        "ok"
      );
      await publishSessions();
      startOwnershipWatch();
    } catch (err) {
      setStatus("Connect failed: " + (err && err.message ? err.message : err), "bad");
      await publishSessions();
    } finally {
      pairing = false;
    }
  }

  async function disconnect(topic) {
    try {
      if (window.GladiatorWC && GladiatorWC.isReady()) {
        if (topic && !String(topic).startsWith("pending:")) {
          if (typeof GladiatorWC.disconnectSession === "function") {
            await GladiatorWC.disconnectSession(topic);
          } else {
            await GladiatorWC.disconnectAll();
          }
        } else {
          await GladiatorWC.disconnectAll();
        }
      }
      const clearPending = !topic || String(topic).startsWith("pending:");
      await storageSet({
        ...(clearPending ? { [PENDING_KEY]: null } : {}),
        gladiator_wc_cmd: { type: "disconnected", at: Date.now(), topic: topic || null },
      });
      await publishSessions();
      setStatus(
        topic && !String(topic).startsWith("pending:")
          ? "Disconnected that dApp session"
          : "Disconnected — session end sent to dApp (pump.fun)",
        "bad"
      );
    } catch (err) {
      setStatus(String(err && err.message ? err.message : err), "bad");
    }
  }

  retryBtn?.addEventListener("click", () => connectPending());
  disconnectBtn?.addEventListener("click", () => disconnect());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[PENDING_KEY]) {
      const next = changes[PENDING_KEY].newValue;
      if (next && next.uri && String(next.uri).startsWith("wc:")) {
        setStatus("New wc: link received — connecting…");
        connectPending().then(() => publishSessions());
      } else {
        publishSessions().catch(() => {});
      }
    }
    if (changes.gladiator_wc_cmd) {
      const cmd = changes.gladiator_wc_cmd.newValue;
      if (cmd && cmd.type === "disconnect") {
        setStatus(
          cmd.topic
            ? "Disconnect requested for one session…"
            : "Disconnect requested from Gladiator…"
        );
        disconnect(cmd.topic || null);
      }
    }
  });

  // Catch late ownership / sign requests while user is on pump.fun
  setInterval(() => {
    if (!window.GladiatorWC || !GladiatorWC.isReady()) return;
    GladiatorWC.processPendings().catch(() => {});
    publishSessions().catch(() => {});
  }, 2500);

  // Boot
  (async () => {
    try {
      if (!window.GladiatorWC) throw new Error("WalletConnect failed to load");
      const { state, pending } = await loadState();
      const acc = activeAccount(state);
      const addr = acc && acc.solana && acc.solana.publicKey;
      setStatus(
        "Bridge ready" +
          (addr ? "\nSolana: " + addr.slice(0, 4) + "…" + addr.slice(-4) : "\nNo wallet found") +
          "\nWaiting for Connect from Gladiator…"
      );
      if (pending && pending.uri && String(pending.uri).startsWith("wc:")) {
        await connectPending();
      } else if (state && state.wcProjectId) {
        await ensureInit(state.wcProjectId);
        const sessions = GladiatorWC.getActiveSessions() || {};
        const n = Object.keys(sessions).length;
        if (n) {
          setStatus(
            "Restored " +
              n +
              " session(s). Keep this window open.\nIf pump.fun still asks to approve, click Connect pending link with a fresh wc: URI.",
            "ok"
          );
        }
      }
      await publishSessions();
    } catch (err) {
      setStatus("Boot failed: " + (err && err.message ? err.message : err), "bad");
    }
  })();
})();
