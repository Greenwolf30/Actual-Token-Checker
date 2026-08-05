/**
 * Invisible offscreen signer for in-page Solana dApp requests (Jupiter, etc).
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

  function keypairFromAccount(acc) {
    if (!window.solanaWeb3) throw new Error("Solana library missing in offscreen");
    if (!acc || !acc.solana || !acc.solana.secretKey) {
      throw new Error("No Solana key — open Gladiator and create/import a wallet");
    }
    const sk = Base58.decode(acc.solana.secretKey);
    if (sk.length === 64) return solanaWeb3.Keypair.fromSecretKey(sk);
    if (sk.length === 32) return solanaWeb3.Keypair.fromSeed(sk);
    throw new Error("Corrupt Solana secret key");
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
    // Rare: some callers send base58
    try {
      const as58 = Base58.decode(String(b64 || ""));
      if (canDeserialize(as58)) return as58;
    } catch (_) {}
    return u8;
  }

  function signTxBytes(u8, keypair) {
    const { Transaction, VersionedTransaction } = solanaWeb3;
    if (VersionedTransaction) {
      try {
        const vtx = VersionedTransaction.deserialize(u8);
        vtx.sign([keypair]);
        const signed = vtx.serialize();
        const signedBytes = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
        return bytesToBase64(signedBytes);
      } catch (_) {}
    }
    const tx = Transaction.from(u8);
    tx.partialSign(keypair);
    const signed = tx.serialize();
    return bytesToBase64(signed instanceof Uint8Array ? signed : new Uint8Array(signed));
  }

  async function getPubkey() {
    const state = await storageGet();
    const acc = activeAccount(state);
    const pk = acc && acc.solana && acc.solana.publicKey;
    if (!pk) throw new Error("No Solana address in Gladiator");
    if (!acc.solana.secretKey) {
      throw new Error("Wallet keys locked/missing — open Gladiator once to restore");
    }
    return pk;
  }

  async function signTransaction(params) {
    const state = await storageGet();
    const kp = keypairFromAccount(activeAccount(state));
    const u8 = decodeTx(params && params.transaction);
    return { signedTransaction: signTxBytes(u8, kp) };
  }

  async function signAllTransactions(params) {
    const state = await storageGet();
    const kp = keypairFromAccount(activeAccount(state));
    const list = (params && params.transactions) || [];
    const signedTransactions = list.map((item) => {
      const blob = typeof item === "string" ? item : item && item.transaction;
      return signTxBytes(decodeTx(blob), kp);
    });
    return { signedTransactions };
  }

  async function signAndSendTransaction(params) {
    const state = await storageGet();
    const kp = keypairFromAccount(activeAccount(state));
    const signedB64 = signTxBytes(decodeTx(params && params.transaction), kp);
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
              signedB64,
              { encoding: "base64", preflightCommitment: "confirmed", skipPreflight: false },
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
    const state = await storageGet();
    const acc = activeAccount(state);
    const kp = keypairFromAccount(acc);
    if (!window.nacl) throw new Error("nacl missing");
    const msg = base64ToBytes(params && params.message);
    const sig = nacl.sign.detached(msg, kp.secretKey);
    return { signature: bytesToBase64(sig) };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "gladiator-offscreen") return;
    (async () => {
      switch (msg.method) {
        case "getPubkey":
          return { publicKey: await getPubkey() };
        case "signTransaction":
          return await signTransaction(msg.params || {});
        case "signAllTransactions":
          return await signAllTransactions(msg.params || {});
        case "signAndSendTransaction":
          return await signAndSendTransaction(msg.params || {});
        case "signMessage":
          return await signMessage(msg.params || {});
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

  console.info("[Gladiator] offscreen signer ready");
})();
