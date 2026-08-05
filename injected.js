/**
 * Runs in the web page (Jupiter, etc). Exposes Gladiator as a Solana wallet
 * via window.gladiator / Wallet Standard. Does not overwrite Phantom's window.solana.
 */
(function () {
  if (window.__GLADIATOR_PROVIDER_INSTALLED__) return;
  window.__GLADIATOR_PROVIDER_INSTALLED__ = true;

  const SOURCE = "gladiator-wallet-page";
  const REPLY = "gladiator-wallet-page-reply";
  const ICON =
    (document.currentScript && document.currentScript.src
      ? document.currentScript.src.replace(/injected\.js.*$/, "icons/icon128.png")
      : "") || "";

  let reqId = 1;
  const pending = new Map();
  const listeners = {
    connect: new Set(),
    disconnect: new Set(),
    accountChanged: new Set(),
  };

  function b64FromBytes(u8) {
    const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function bytesFromB64(b64) {
    const bin = atob(String(b64 || ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function request(method, params) {
    const id = reqId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.postMessage(
        { source: SOURCE, id, method, params: params || {} },
        "*"
      );
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("Gladiator request timed out — open the extension once"));
      }, 120000);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== REPLY || data.id == null) return;
    const wait = pending.get(data.id);
    if (!wait) return;
    pending.delete(data.id);
    if (data.error) wait.reject(new Error(data.error));
    else wait.resolve(data.result);
  });

  function emit(event, payload) {
    const set = listeners[event];
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (_) {}
    }
  }

  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const B58MAP = {};
  for (let i = 0; i < B58.length; i++) B58MAP[B58[i]] = i;

  function decodeBase58(str) {
    const s = String(str || "");
    let zeros = 0;
    while (zeros < s.length && s[zeros] === "1") zeros++;
    const size = (((s.length - zeros) * 733) / 1000 + 1) | 0;
    const b = new Uint8Array(size);
    let length = 0;
    for (let i = zeros; i < s.length; i++) {
      const val = B58MAP[s[i]];
      if (val === undefined) throw new Error("Invalid base58");
      let carry = val;
      let j = 0;
      for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
        carry += 58 * b[k];
        b[k] = carry % 256;
        carry = (carry / 256) | 0;
      }
      length = j;
    }
    let it = size - length;
    while (it < size && b[it] === 0) it++;
    const out = new Uint8Array(zeros + (size - it));
    out.set(b.subarray(it), zeros);
    return out;
  }

  class PublicKey {
    constructor(value) {
      this._value = String(value || "");
      try {
        this._bytes = decodeBase58(this._value);
      } catch (_) {
        this._bytes = new Uint8Array(32);
      }
    }
    toBase58() {
      return this._value;
    }
    toString() {
      return this._value;
    }
    toJSON() {
      return this._value;
    }
    toBytes() {
      return new Uint8Array(this._bytes);
    }
    equals(other) {
      return String(other && (other.toBase58 ? other.toBase58() : other)) === this._value;
    }
  }

  function serializeTx(transaction) {
    if (!transaction) throw new Error("Missing transaction");
    if (transaction instanceof Uint8Array) {
      return { transaction: b64FromBytes(transaction), versioned: true };
    }
    const isVersioned =
      typeof transaction.version !== "undefined" ||
      (transaction.message && typeof transaction.signatures !== "undefined" && !transaction.instructions);
    let raw;
    if (isVersioned) {
      raw = transaction.serialize();
    } else {
      raw = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
    }
    const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    return { transaction: b64FromBytes(u8), versioned: !!isVersioned };
  }

  function deserializeTx(signedB64, original, versioned) {
    const bytes = bytesFromB64(signedB64);
    const ctor = original && original.constructor;
    if (versioned) {
      if (ctor && typeof ctor.deserialize === "function") return ctor.deserialize(bytes);
      throw new Error("Cannot restore VersionedTransaction on this page");
    }
    if (ctor && typeof ctor.from === "function") return ctor.from(bytes);
    if (ctor && typeof ctor.deserialize === "function") return ctor.deserialize(bytes);
    throw new Error("Cannot restore Transaction on this page");
  }

  let publicKey = null;
  let isConnected = false;

  async function connect(opts) {
    const onlyIfTrusted = !!(opts && opts.onlyIfTrusted);
    const result = await request("connect", {
      onlyIfTrusted,
      origin: location.origin,
      title: document.title || "",
    });
    if (!result || !result.publicKey) {
      if (onlyIfTrusted) throw new Error("Wallet not connected");
      throw new Error("No Solana address in Gladiator");
    }
    publicKey = new PublicKey(result.publicKey);
    isConnected = true;
    emit("connect", publicKey);
    emitStandard("change", { accounts: getAccounts() });
    return { publicKey };
  }

  async function disconnect() {
    try {
      await request("disconnect", { origin: location.origin });
    } catch (_) {}
    publicKey = null;
    isConnected = false;
    emit("disconnect");
    emitStandard("change", { accounts: [] });
  }

  async function signTransaction(transaction) {
    if (!isConnected) await connect();
    const ser = serializeTx(transaction);
    const result = await request("signTransaction", {
      ...ser,
      origin: location.origin,
    });
    if (!result || !result.signedTransaction) throw new Error("Sign failed");
    return deserializeTx(result.signedTransaction, transaction, ser.versioned);
  }

  async function signAllTransactions(transactions) {
    if (!isConnected) await connect();
    const list = Array.isArray(transactions) ? transactions : [];
    const payload = list.map((tx) => serializeTx(tx));
    const result = await request("signAllTransactions", {
      transactions: payload,
      origin: location.origin,
    });
    const signed = (result && result.signedTransactions) || [];
    return list.map((tx, i) =>
      deserializeTx(signed[i], tx, payload[i].versioned)
    );
  }

  async function signAndSendTransaction(transaction, options) {
    if (!isConnected) await connect();
    const ser = serializeTx(transaction);
    const result = await request("signAndSendTransaction", {
      ...ser,
      options: options || {},
      origin: location.origin,
    });
    if (!result || !result.signature) throw new Error("Send failed");
    return { signature: result.signature };
  }

  async function signMessage(message, display) {
    if (!isConnected) await connect();
    const bytes =
      message instanceof Uint8Array
        ? message
        : new TextEncoder().encode(String(message));
    const result = await request("signMessage", {
      message: b64FromBytes(bytes),
      display: display || "utf8",
      origin: location.origin,
    });
    if (!result || !result.signature) throw new Error("Sign message failed");
    return { signature: bytesFromB64(result.signature), publicKey };
  }

  const provider = {
    isGladiator: true,
    isPhantom: false,
    get publicKey() {
      return publicKey;
    },
    get isConnected() {
      return isConnected;
    },
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
    signAndSendTransaction,
    signMessage,
    request: async ({ method, params }) => {
      const m = String(method || "");
      if (m === "connect") return connect(params);
      if (m === "disconnect") return disconnect();
      if (m === "signTransaction") return signTransaction(params && params.transaction);
      if (m === "signAllTransactions")
        return signAllTransactions(params && params.transactions);
      if (m === "signAndSendTransaction")
        return signAndSendTransaction(params && params.transaction, params && params.options);
      if (m === "signMessage") return signMessage(params && params.message, params && params.display);
      throw new Error("Unsupported method: " + m);
    },
    on(event, fn) {
      if (listeners[event] && typeof fn === "function") listeners[event].add(fn);
      return () => provider.off(event, fn);
    },
    off(event, fn) {
      if (listeners[event] && fn) listeners[event].delete(fn);
    },
    removeListener(event, fn) {
      provider.off(event, fn);
    },
  };

  // --- Wallet Standard (what Jupiter discovers) ---
  const standardListeners = new Set();
  function emitStandard(event, detail) {
    for (const l of [...standardListeners]) {
      try {
        if (l && l.event === event) l.callback(detail);
        else if (typeof l === "function") l({ event, detail });
      } catch (_) {}
    }
  }
  function getAccounts() {
    if (!publicKey) return [];
    return [
      {
        address: publicKey.toBase58(),
        publicKey: publicKey.toBytes(),
        chains: ["solana:mainnet", "solana:devnet", "solana:testnet"],
        features: [
          "solana:signTransaction",
          "solana:signAllTransactions",
          "solana:signMessage",
          "solana:signAndSendTransaction",
        ],
      },
    ];
  }

  const wallet = {
    version: "1.0.0",
    name: "Gladiator",
    icon: ICON ? "https://placeholder.invalid/gladiator.png" : "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#0b1220" width="40" height="40" rx="8"/><text x="20" y="26" text-anchor="middle" fill="#14f195" font-size="16" font-family="sans-serif">G</text></svg>'),
    chains: ["solana:mainnet", "solana:devnet", "solana:testnet"],
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async (input) => {
          await connect({ onlyIfTrusted: !!(input && input.silent) });
          return { accounts: getAccounts() };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          await disconnect();
        },
      },
      "standard:events": {
        version: "1.0.0",
        on: (event, callback) => {
          const entry = { event, callback };
          standardListeners.add(entry);
          return () => standardListeners.delete(entry);
        },
      },
      "solana:signTransaction": {
        version: "1.0.0",
        signTransaction: async (...inputs) => {
          if (!isConnected) await connect();
          const out = [];
          for (const input of inputs) {
            const bytes =
              input.transaction instanceof Uint8Array
                ? input.transaction
                : new Uint8Array(input.transaction);
            const result = await request("signTransaction", {
              transaction: b64FromBytes(bytes),
              versioned: true,
              origin: location.origin,
            });
            out.push({ signedTransaction: bytesFromB64(result.signedTransaction) });
          }
          return out;
        },
      },
      "solana:signAllTransactions": {
        version: "1.0.0",
        signAllTransactions: async (...inputs) => {
          if (!isConnected) await connect();
          const out = [];
          for (const input of inputs) {
            const txs = (input && input.transactions) || [];
            const payload = txs.map((t) => ({
              transaction: b64FromBytes(t instanceof Uint8Array ? t : new Uint8Array(t)),
              versioned: true,
            }));
            const result = await request("signAllTransactions", {
              transactions: payload,
              origin: location.origin,
            });
            out.push({
              signedTransactions: ((result && result.signedTransactions) || []).map((s) =>
                bytesFromB64(s)
              ),
            });
          }
          return out;
        },
      },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        signAndSendTransaction: async (...inputs) => {
          if (!isConnected) await connect();
          const out = [];
          for (const input of inputs) {
            const bytes =
              input.transaction instanceof Uint8Array
                ? input.transaction
                : new Uint8Array(input.transaction);
            const result = await request("signAndSendTransaction", {
              transaction: b64FromBytes(bytes),
              versioned: true,
              options: input.options || {},
              origin: location.origin,
            });
            out.push({ signature: result.signature });
          }
          return out;
        },
      },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async (...inputs) => {
          if (!isConnected) await connect();
          const out = [];
          for (const input of inputs) {
            const msg =
              input.message instanceof Uint8Array
                ? input.message
                : new Uint8Array(input.message);
            const result = await request("signMessage", {
              message: b64FromBytes(msg),
              display: "utf8",
              origin: location.origin,
            });
            out.push({
              signedMessage: msg,
              signature: bytesFromB64(result.signature),
            });
          }
          return out;
        },
      },
    },
    get accounts() {
      return getAccounts();
    },
  };

  // Fix icon: content script will post the real extension icon URL
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data && data.source === "gladiator-wallet-meta" && data.icon) {
      try {
        wallet.icon = data.icon;
      } catch (_) {}
    }
  });

  function registerWalletStandard() {
    try {
      const callback = (registration) => {
        try {
          registration.register(wallet);
        } catch (err) {
          console.warn("[Gladiator] wallet-standard register failed", err);
        }
      };
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", { detail: callback })
      );
      window.addEventListener("wallet-standard:app-ready", (event) => {
        try {
          const detail = event && event.detail;
          if (typeof detail === "function") detail(callback);
          else if (detail && typeof detail.register === "function") callback(detail);
        } catch (_) {}
      });
    } catch (err) {
      console.warn("[Gladiator] wallet-standard hook failed", err);
    }
  }

  // Expose provider. Never clobber Phantom / other wallets on window.solana.
  window.gladiator = provider;
  window.gladiatorSolana = provider;
  try {
    Object.defineProperty(window, "gladiator", { value: provider, writable: false });
  } catch (_) {}

  if (!window.solana) {
    window.solana = provider;
  } else if (!window.solana.isPhantom && !window.solana.isGladiator) {
    // Some pages use a stub; only attach if empty-ish
    try {
      if (!window.solana.connect) window.solana = provider;
    } catch (_) {}
  }

  registerWalletStandard();

  // Eager silent connect for returning sites (onlyIfTrusted)
  request("connect", { onlyIfTrusted: true, origin: location.origin })
    .then((result) => {
      if (result && result.publicKey) {
        publicKey = new PublicKey(result.publicKey);
        isConnected = true;
        emit("connect", publicKey);
        emitStandard("change", { accounts: getAccounts() });
      }
    })
    .catch(() => {});
})();
