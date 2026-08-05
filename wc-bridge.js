/**
 * Persistent WalletConnect session relay.
 * Toolbar popup closes when you click Jupiter — this window stays open to receive
 * solana_signTransaction / signAndSend and reply over the WC relay.
 */
(function () {
  const STORE_KEY = "gladiator_wallet_v1";
  const PENDING_KEY = "gladiator_wc_pending";
  const SESSIONS_KEY = "gladiator_wc_sessions";
  const CMD_KEY = "gladiator_wc_cmd";

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
      } catch (_) {
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

  function bytesToBase64(u8) {
    let s = "";
    const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function base64ToBytes(b64) {
    const bin = atob(String(b64 || "").replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
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
    try {
      return Base58.decode(s);
    } catch (_) {
      return new TextEncoder().encode(s);
    }
  }

  function canDeserializeTx(u8) {
    if (!u8 || !u8.length || !window.solanaWeb3) return false;
    const { Transaction, VersionedTransaction } = solanaWeb3;
    if (VersionedTransaction) {
      try {
        VersionedTransaction.deserialize(u8);
        return true;
      } catch (_) {}
    }
    try {
      Transaction.from(u8);
      return true;
    } catch (_) {}
    return false;
  }

  /** Jupiter / WC Solana send txs as base64. Prefer that; fall back to base58. */
  function decodeTxBytes(raw) {
    if (raw instanceof Uint8Array) return raw;
    if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    if (Array.isArray(raw)) return new Uint8Array(raw);
    if (typeof raw !== "string") throw new Error("Bad transaction payload");
    const s = raw.trim();
    if (!s) throw new Error("Empty transaction");

    const candidates = [];
    if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0) {
      try {
        candidates.push(base64ToBytes(s));
      } catch (_) {}
    }
    try {
      candidates.push(Base58.decode(s));
    } catch (_) {}
    if (/^(0x)?[0-9a-fA-F]+$/.test(s) && s.replace(/^0x/, "").length % 2 === 0) {
      const hex = s.replace(/^0x/, "");
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      candidates.push(out);
    }

    for (const c of candidates) {
      if (canDeserializeTx(c)) return c;
    }
    if (candidates.length) return candidates[0];
    throw new Error("Could not decode transaction");
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

  function extractTxBlob(params) {
    if (!params) throw new Error("No transaction params");
    if (typeof params === "string") return params;
    return (
      params.transaction ||
      params.tx ||
      (params.transactions && params.transactions[0]) ||
      params.message ||
      null
    );
  }

  /**
   * Jupiter expects:
   *   signature = base58(64-byte ed25519 sig)
   *   transaction = base64(fully signed serialized tx)  [preferred path]
   */
  function signTx(bytes, keypair) {
    const { Transaction, VersionedTransaction } = solanaWeb3;
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (VersionedTransaction) {
      try {
        const vtx = VersionedTransaction.deserialize(u8);
        vtx.sign([keypair]);
        const signed = vtx.serialize();
        const signedBytes = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
        const sigBytes =
          vtx.signatures && vtx.signatures[0] ? vtx.signatures[0] : null;
        return {
          signature: sigBytes ? Base58.encode(sigBytes) : Base58.encode(signedBytes.slice(1, 65)),
          transaction: bytesToBase64(signedBytes),
        };
      } catch (_) {}
    }
    const tx = Transaction.from(u8);
    tx.partialSign(keypair);
    const signed = tx.serialize();
    const signedBytes = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
    const sig0 = tx.signatures && tx.signatures[0] && tx.signatures[0].signature;
    return {
      signature: Base58.encode(sig0 || signedBytes),
      transaction: bytesToBase64(signedBytes),
    };
  }

  async function loadState() {
    const bag = await storageGet([STORE_KEY, PENDING_KEY]);
    return {
      state: bag[STORE_KEY] || null,
      pending: bag[PENDING_KEY] || null,
    };
  }

  async function publishSessions() {
    try {
      if (!(window.GladiatorWC && GladiatorWC.isReady())) return;
      const items =
        typeof GladiatorWC.listSessions === "function"
          ? GladiatorWC.listSessions() || []
          : [];
      await storageSet({ [SESSIONS_KEY]: { at: Date.now(), items } });
    } catch (_) {}
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
        const bytes =
          message instanceof Uint8Array
            ? message
            : new TextEncoder().encode(String(message));
        const sig = nacl.sign.detached(bytes, kp.secretKey);
        return Base58.encode(sig);
      },
      signSolanaMessage: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const raw = p.message || p.msg;
        if (!raw) throw new Error("No message from dApp");
        const msg = decodeMessage(raw);
        const sig = nacl.sign.detached(msg, kp.secretKey);
        setStatus("Signed ownership message — check dApp", "ok");
        return { signature: Base58.encode(sig) };
      },
      signSolanaTransaction: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const blob = extractTxBlob(p);
        const signed = signTx(decodeTxBytes(blob), kp);
        setStatus("Signed swap/tx — check Jupiter", "ok");
        return signed;
      },
      signAllSolanaTransactions: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const list = p.transactions || p.txs || [];
        const out = [];
        for (const item of list) {
          const blob =
            typeof item === "string"
              ? item
              : item && (item.transaction || item.tx);
          // Jupiter deserializes these as base64
          out.push(signTx(decodeTxBytes(blob), kp).transaction);
        }
        setStatus("Signed transactions — check dApp", "ok");
        return { transactions: out };
      },
      signAndSendSolanaTransaction: async (params) => {
        const p = normalizeParams(params);
        const { state } = await loadState();
        const kp = solanaKeypair(activeAccount(state));
        const blob = extractTxBlob(p);
        const signed = signTx(decodeTxBytes(blob), kp);
        const rpcs = [
          (state && state.solRpc) || "",
          "https://api.mainnet-beta.solana.com",
          "https://solana-rpc.publicnode.com",
          "https://solana.drpc.org",
        ].filter(Boolean);
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
                params: [
                  signed.transaction,
                  { encoding: "base64", preflightCommitment: "confirmed" },
                ],
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
        setStatus("Session proposal — approving…");
        await GladiatorWC.approveProposal(proposal);
        await publishSessions();
        setStatus("Session linked. Waiting for Jupiter / dApp sign request…", "ok");
      },
      onAuthenticate: async (payload) => {
        try {
          setStatus("Ownership auth — signing…");
          await GladiatorWC.approveAuthenticate(payload);
          await publishSessions();
          setStatus("Ownership signed — check dApp", "ok");
        } catch (err) {
          setStatus("Auth failed: " + (err && err.message ? err.message : err), "bad");
        }
      },
      onRequest: async (event) => {
        const method =
          (event && event.params && event.params.request && event.params.request.method) ||
          "request";
        setStatus("dApp asked for: " + method + "\nSigning now…");
        try {
          await GladiatorWC.handleRequest(event);
          setStatus(
            "Signed " + method.replace(/^solana_/, "") + " — look at Jupiter / dApp",
            "ok"
          );
          await publishSessions();
        } catch (err) {
          setStatus("Sign failed: " + (err && err.message ? err.message : err), "bad");
        }
      },
      onSessionDelete: async () => {
        await publishSessions();
        setStatus("Disconnected from dApp", "bad");
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
    await GladiatorWC.init(String(projectId).trim(), {
      name: "Gladiator Wallet",
      description: "Gladiator WalletConnect session relay",
      url: "https://gladiator.wallet",
      icons: [chrome.runtime.getURL("icons/icon128.png")],
    });
  }

  async function connectPending() {
    if (pairing) return;
    pairing = true;
    try {
      const { state, pending } = await loadState();
      const projectId =
        (pending && pending.projectId) || (state && state.wcProjectId) || "";
      const uri = pending && pending.uri;
      if (!uri || !String(uri).startsWith("wc:")) {
        setStatus(
          "No pending wc: link.\nIn Gladiator: paste URI → Connect (this window opens).",
          "bad"
        );
        return;
      }
      try {
        const q = String(uri).split("?")[1] || "";
        const exp = new URLSearchParams(q).get("expiryTimestamp");
        if (exp && Number(exp) * 1000 < Date.now()) {
          setStatus("That wc: link expired. Copy a fresh one from Jupiter.", "bad");
          return;
        }
      } catch (_) {}

      await ensureInit(projectId);
      setStatus("Pairing… keep this window open");
      await GladiatorWC.pair(String(uri).trim());
      await storageSet({
        [PENDING_KEY]: { projectId, uri: "", at: Date.now(), paired: true },
      });
      // Catch late proposal / auth / sign
      for (let i = 0; i < 12; i++) {
        try {
          if (typeof GladiatorWC.processPendings === "function") {
            await GladiatorWC.processPendings();
          }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 400));
        await publishSessions();
      }
      await publishSessions();
      setStatus(
        "Paired. Keep this open — Jupiter swap confirms are signed here automatically.",
        "ok"
      );
    } catch (err) {
      setStatus("Connect failed: " + (err && err.message ? err.message : err), "bad");
    } finally {
      pairing = false;
    }
  }

  async function disconnect(topic) {
    try {
      if (window.GladiatorWC && GladiatorWC.isReady()) {
        if (topic && typeof GladiatorWC.disconnectSession === "function") {
          await GladiatorWC.disconnectSession(topic);
        } else {
          await GladiatorWC.disconnectAll();
        }
      }
      await storageSet({ [PENDING_KEY]: null });
      await publishSessions();
      setStatus("Disconnected", "bad");
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
        connectPending();
      }
    }
    if (changes[CMD_KEY]) {
      const cmd = changes[CMD_KEY].newValue;
      if (!cmd || !cmd.type) return;
      if (cmd.type === "disconnect") {
        disconnect(cmd.topic || "").catch(() => {});
      } else if (cmd.type === "publish") {
        publishSessions().catch(() => {});
      }
    }
  });

  (async () => {
    try {
      if (!window.GladiatorWC) throw new Error("WalletConnect failed to load");
      const { state, pending } = await loadState();
      const acc = activeAccount(state);
      const addr = acc && acc.solana && acc.solana.publicKey;
      if (acc && acc.vaultEnabled && !acc.solana.secretKey) {
        setStatus(
          "Wallet keys missing in storage.\nOpen Gladiator once so keys are available (password encryption is off).",
          "bad"
        );
      }
      setStatus(
        "Relay ready" +
          (addr ? "\nSolana: " + addr.slice(0, 4) + "…" + addr.slice(-4) : "\nNo wallet found") +
          "\nWaiting for Connect from Gladiator…"
      );
      if (pending && pending.uri && String(pending.uri).startsWith("wc:")) {
        await connectPending();
      } else if (state && state.wcProjectId) {
        await ensureInit(state.wcProjectId);
        try {
          if (typeof GladiatorWC.processPendings === "function") {
            await GladiatorWC.processPendings();
          }
        } catch (_) {}
        await publishSessions();
        const sessions = GladiatorWC.getActiveSessions() || {};
        const n = Object.keys(sessions).length;
        if (n) {
          setStatus(
            "Restored " + n + " session(s). Keep this open for Jupiter swaps.",
            "ok"
          );
        }
      }
    } catch (err) {
      setStatus("Boot failed: " + (err && err.message ? err.message : err), "bad");
    }
  })();
})();
