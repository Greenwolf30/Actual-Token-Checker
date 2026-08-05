/**
 * Invisible offscreen signer for in-page Solana dApp requests (Jupiter, etc).
 * Mirrors the proven WalletConnect signing path in app.js.
 */
(function () {
  const STORE_KEY = "gladiator_wallet_v1";

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

  function ensureBuffer() {
    const g = typeof globalThis !== "undefined" ? globalThis : window;
    if (typeof g.Buffer === "undefined" || typeof g.Buffer.alloc !== "function") {
      const fromLib = window.solanaWeb3 && window.solanaWeb3.Buffer;
      if (fromLib) g.Buffer = fromLib;
    }
    if (typeof g.Buffer === "undefined" || typeof g.Buffer.alloc !== "function") {
      throw new Error("Buffer missing in offscreen — reload Gladiator");
    }
  }

  function storageGet() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORE_KEY], (r) => resolve((r && r[STORE_KEY]) || null));
      } catch (_) {
        resolve(null);
      }
    });
  }

  function activeAccount(state) {
    if (!state || !state.accounts || !state.accounts.length) return null;
    return (
      state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0]
    );
  }

  function storageSet(state) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ [STORE_KEY]: state }, () => {
          const err = chrome.runtime.lastError;
          if (err) reject(err);
          else resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function getBase58() {
    return (
      (typeof window !== "undefined" && window.Base58) ||
      (typeof globalThis !== "undefined" && globalThis.Base58) ||
      null
    );
  }

  function getNacl() {
    return (
      (typeof window !== "undefined" && window.nacl) ||
      (typeof self !== "undefined" && self.nacl) ||
      (typeof globalThis !== "undefined" && globalThis.nacl) ||
      null
    );
  }

  async function deriveSolanaFromMnemonic(mnemonic) {
    if (!window.ethers || !window.SolanaHD) {
      throw new Error("HD libs missing in offscreen — reload Gladiator");
    }
    const B58 = getBase58();
    if (!B58) throw new Error("Base58 missing in offscreen");
    const phrase = String(mnemonic || "").trim().replace(/\s+/g, " ");
    const m = ethers.Mnemonic.fromPhrase(phrase);
    const seed = ethers.getBytes(m.computeSeed());
    const solKp = await SolanaHD.deriveSolanaKeypair(seed, 0);
    return {
      publicKey: B58.encode(solKp.publicKey),
      secretKey: B58.encode(solKp.secretKey),
    };
  }

  async function ensureAccountWithSecret(state) {
    const acc = activeAccount(state);
    if (!acc) throw new Error("No wallet — open the Gladiator extension and create/import one");
    if (acc.solana && acc.solana.secretKey) return { state, acc };

    const mnemonic = String(acc.mnemonic || "").trim();
    if (!mnemonic) {
      if (state.vault && state.vault.data) {
        throw new Error(
          "Keys still locked — open the Gladiator extension icon and enter your old password once"
        );
      }
      throw new Error(
        "No Solana key — open the Gladiator extension icon and create/import a wallet"
      );
    }

    const derived = await deriveSolanaFromMnemonic(mnemonic);
    acc.solana = {
      ...(acc.solana || {}),
      publicKey: (acc.solana && acc.solana.publicKey) || derived.publicKey,
      secretKey: derived.secretKey,
    };
    try {
      await storageSet(state);
    } catch (_) {}
    return { state, acc };
  }

  function keypairFromAccount(acc) {
    ensureBuffer();
    if (!window.solanaWeb3) throw new Error("Solana library missing in offscreen");
    if (!acc || !acc.solana || !acc.solana.secretKey) {
      throw new Error("No Solana key — open the Gladiator extension icon and import a wallet");
    }
    const B58 = getBase58();
    if (!B58 || typeof B58.decode !== "function") {
      throw new Error("Base58 missing in offscreen — reload Gladiator");
    }
    const sk = B58.decode(acc.solana.secretKey);
    if (sk.length === 64) return solanaWeb3.Keypair.fromSecretKey(sk);
    if (sk.length === 32) return solanaWeb3.Keypair.fromSeed(sk);
    throw new Error("Corrupt Solana secret key (need 32 or 64 bytes)");
  }

  function canDeserialize(u8) {
    const { Transaction, VersionedTransaction } = solanaWeb3;
    if (VersionedTransaction) {
      try {
        VersionedTransaction.deserialize(u8);
        return "versioned";
      } catch (_) {}
    }
    try {
      Transaction.from(u8);
      return "legacy";
    } catch (_) {}
    return null;
  }

  function decodeTx(b64) {
    const u8 = base64ToBytes(b64);
    if (canDeserialize(u8)) return u8;
    try {
      const B58 = getBase58();
      if (B58 && typeof B58.decode === "function") {
        const as58 = B58.decode(String(b64 || ""));
        if (canDeserialize(as58)) return as58;
      }
    } catch (_) {}
    return u8;
  }

  /**
   * Sign serialized Solana tx bytes. Prefer VersionedTransaction (Jupiter swaps).
   * Never call legacy serialize() with requireAllSignatures:true — multi-signer
   * txs would throw even after a valid partialSign.
   */
  function signTxBytes(u8, keypair) {
    ensureBuffer();
    const { Transaction, VersionedTransaction } = solanaWeb3;
    const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    if (!bytes.length) throw new Error("Empty transaction");

    let vtErr = null;
    if (VersionedTransaction) {
      try {
        const vtx = VersionedTransaction.deserialize(bytes);
        vtx.sign([keypair]);
        const signed = vtx.serialize();
        const signedBytes = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
        return bytesToBase64(signedBytes);
      } catch (err) {
        vtErr = err;
        // Only fall through when deserialize itself failed (not a versioned tx).
        try {
          VersionedTransaction.deserialize(bytes);
          // deserialize worked — signing failed; don't try legacy
          throw err;
        } catch (inner) {
          if (inner === err) throw err;
          // deserialize failed → try legacy below
        }
      }
    }

    try {
      const tx = Transaction.from(bytes);
      tx.partialSign(keypair);
      const signed = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      return bytesToBase64(signed instanceof Uint8Array ? signed : new Uint8Array(signed));
    } catch (legacyErr) {
      const a = vtErr && (vtErr.message || vtErr);
      const b = legacyErr && (legacyErr.message || legacyErr);
      throw new Error("Sign failed: " + String(b || a || "unknown"));
    }
  }

  async function resolveAccount(params) {
    // Prefer keys passed from the service worker (avoids chrome.storage races).
    if (params && params._secretKey) {
      return {
        state: null,
        acc: {
          solana: {
            publicKey: params._publicKey || "",
            secretKey: params._secretKey,
          },
          mnemonic: params._mnemonic || "",
        },
      };
    }
    if (params && params._mnemonic) {
      const state = (await storageGet()) || { accounts: [], activeAccountId: "tmp" };
      const derived = await deriveSolanaFromMnemonic(params._mnemonic);
      const acc = {
        id: "tmp",
        mnemonic: params._mnemonic,
        solana: {
          publicKey: params._publicKey || derived.publicKey,
          secretKey: derived.secretKey,
        },
      };
      return { state, acc };
    }
    const state = await storageGet();
    return await ensureAccountWithSecret(state || {});
  }

  async function getPubkey(params) {
    const { acc } = await resolveAccount(params || {});
    keypairFromAccount(acc);
    return acc.solana.publicKey;
  }

  async function signTransaction(params) {
    const { acc } = await resolveAccount(params || {});
    const kp = keypairFromAccount(acc);
    const u8 = decodeTx(params && params.transaction);
    if (!canDeserialize(u8)) {
      throw new Error("Could not decode Solana transaction from Jupiter");
    }
    return { signedTransaction: signTxBytes(u8, kp) };
  }

  async function signAllTransactions(params) {
    const { acc } = await resolveAccount(params || {});
    const kp = keypairFromAccount(acc);
    const list = (params && params.transactions) || [];
    if (!list.length) throw new Error("No transactions to sign");
    const signedTransactions = list.map((item) => {
      const blob = typeof item === "string" ? item : item && item.transaction;
      const u8 = decodeTx(blob);
      if (!canDeserialize(u8)) throw new Error("Could not decode one of the transactions");
      return signTxBytes(u8, kp);
    });
    return { signedTransactions };
  }

  async function signAndSendTransaction(params) {
    const { state, acc } = await resolveAccount(params || {});
    const kp = keypairFromAccount(acc);
    const u8 = decodeTx(params && params.transaction);
    if (!canDeserialize(u8)) throw new Error("Could not decode Solana transaction");
    const signedB64 = signTxBytes(u8, kp);
    const bag = state || (await storageGet()) || {};
    const rpcs = [
      bag.solRpc || "",
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
              signedB64,
              {
                encoding: "base64",
                preflightCommitment: "confirmed",
                skipPreflight: false,
                maxRetries: 3,
              },
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
    return { signature: String(sig) };
  }

  async function signMessage(params) {
    const { acc } = await resolveAccount(params || {});
    const kp = keypairFromAccount(acc);
    const naclApi = getNacl();
    if (!naclApi || !naclApi.sign || !naclApi.sign.detached) {
      throw new Error("nacl missing in offscreen");
    }
    const msg = base64ToBytes(params && params.message);
    const sig = naclApi.sign.detached(msg, kp.secretKey);
    return { signature: bytesToBase64(sig) };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "gladiator-offscreen") return;
    (async () => {
      switch (msg.method) {
        case "getPubkey":
          return { publicKey: await getPubkey(msg.params || {}) };
        case "signTransaction":
          return await signTransaction(msg.params || {});
        case "signAllTransactions":
          return await signAllTransactions(msg.params || {});
        case "signAndSendTransaction":
          return await signAndSendTransaction(msg.params || {});
        case "signMessage":
          return await signMessage(msg.params || {});
        case "ping":
          return {
            ok: true,
            solanaWeb3: !!window.solanaWeb3,
            Base58: !!(getBase58() && getBase58().decode),
            nacl: !!(getNacl() && getNacl().sign),
            Buffer: typeof Buffer !== "undefined",
          };
        default:
          throw new Error("Unknown offscreen method: " + msg.method);
      }
    })()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  });

  console.info("[Gladiator] offscreen signer ready", {
    solanaWeb3: !!window.solanaWeb3,
    Base58: !!(getBase58() && getBase58().decode),
    nacl: !!(getNacl() && getNacl().sign),
  });
})();
