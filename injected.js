/**
 * Gladiator Wallet Standard provider (page MAIN world).
 *
 * Crash-safety rules:
 * - Inject only AFTER page load (background handles timing).
 * - Never touch window.solana.
 * - Register once via official wallet-standard events (no spam).
 * - silent connect never throws and never calls the extension.
 * - Include supportedTransactionVersions (adapters read this).
 */
(function () {
  try {
    if (window.__GLADIATOR_PROVIDER_INSTALLED__) return;
    window.__GLADIATOR_PROVIDER_INSTALLED__ = true;

    const SOURCE = "gladiator-wallet-page";
    const REPLY = "gladiator-wallet-page-reply";
    const FORCE = "gladiator-wallet-force-disconnect";
    const ACCOUNTS_CHANGED = "gladiator-wallet-accounts-changed";
    const CHAINS = Object.freeze(["solana:mainnet", "solana:devnet", "solana:testnet"]);
    const TX_VERSIONS = Object.freeze(["legacy", 0]);
    const ACCOUNT_FEATURES = Object.freeze([
      "solana:signAndSendTransaction",
      "solana:signTransaction",
      "solana:signMessage",
    ]);
    // Valid Wallet Standard icon: data:image/*;base64,...
    const ICON =
      "data:image/png;base64,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";

    let reqId = 1;
    const pending = new Map();
    const listeners = {
      connect: new Set(),
      disconnect: new Set(),
      accountChanged: new Set(),
    };
    const standardListeners = new Set();
    let publicKey = null;
    let isConnected = false;
    let registered = false;
    /** Set after EVM helpers exist — handles active-wallet follow for dApps. */
    let onAccountsChangedFromWallet = null;

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

    function friendlyRequestError(msg) {
      const s = String(msg || "");
      const lower = s.toLowerCase();
      // Keep bridge failures short — never show the old reload/reconnect banner copy.
      if (
        lower.includes("extension context invalidated") ||
        lower.includes("receiving end does not exist") ||
        lower.includes("could not establish connection") ||
        lower.includes("message port closed") ||
        lower.includes("gladiator extension unavailable") ||
        lower.includes("gladiator wallet was reloaded") ||
        lower.includes("reconnect gladiator")
      ) {
        return "Gladiator unavailable";
      }
      return s;
    }

    function request(method, params, timeoutMs) {
      const id = reqId++;
      const ms = timeoutMs == null ? 120000 : timeoutMs;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          window.postMessage({ source: SOURCE, id, method, params: params || {} }, "*");
        } catch (err) {
          pending.delete(id);
          reject(new Error(friendlyRequestError(err && err.message ? err.message : err)));
          return;
        }
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error("Gladiator request timed out"));
        }, ms);
      });
    }

    window.addEventListener("message", (event) => {
      try {
        if (event.source !== window) return;
        const data = event.data;
        if (data && data.source === FORCE) {
          publicKey = null;
          isConnected = false;
          try {
            emit("disconnect");
          } catch (_) {}
          try {
            emitStandard("change", { accounts: [] });
          } catch (_) {}
          try {
            ethSelectedAddress = null;
            ethConnected = false;
            ethEmit("accountsChanged", []);
          } catch (_) {}
          return;
        }
        // Active wallet switched in Gladiator → connection follows the new wallet.
        if (data && data.source === ACCOUNTS_CHANGED) {
          if (typeof onAccountsChangedFromWallet === "function") {
            onAccountsChangedFromWallet(data);
          }
          return;
        }
        if (!data || data.source !== REPLY || data.id == null) return;
        const wait = pending.get(data.id);
        if (!wait) return;
        pending.delete(data.id);
        if (data.error) wait.reject(new Error(friendlyRequestError(data.error)));
        else wait.resolve(data.result);
      } catch (_) {}
    });

    function emit(event, payload) {
      const set = listeners[event];
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (_) {}
      }
    }

    function emitStandard(event, detail) {
      for (const l of [...standardListeners]) {
        try {
          if (l && l.event === event && typeof l.callback === "function") {
            l.callback(detail);
          }
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
        (transaction.message &&
          typeof transaction.signatures !== "undefined" &&
          !transaction.instructions);
      const raw = isVersioned
        ? transaction.serialize()
        : transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          });
      const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      return { transaction: b64FromBytes(u8), versioned: !!isVersioned };
    }

    function deserializeTx(signedB64, original, versioned) {
      const bytes = bytesFromB64(signedB64);
      const ctor = original && original.constructor;
      if (versioned) {
        if (ctor && typeof ctor.deserialize === "function") return ctor.deserialize(bytes);
        throw new Error("Cannot restore VersionedTransaction");
      }
      if (ctor && typeof ctor.from === "function") return ctor.from(bytes);
      if (ctor && typeof ctor.deserialize === "function") return ctor.deserialize(bytes);
      throw new Error("Cannot restore Transaction");
    }

    function getAccounts() {
      if (!publicKey) return [];
      return [
        Object.freeze({
          address: publicKey.toBase58(),
          publicKey: publicKey.toBytes(),
          chains: CHAINS.slice(),
          features: ACCOUNT_FEATURES.slice(),
          label: "Gladiator",
          icon: ICON,
        }),
      ];
    }

    async function connectLegacy(opts) {
      const onlyIfTrusted = !!(opts && opts.onlyIfTrusted);
      let result = null;
      let lastErr = null;
      // Connect should fail fast if the bridge is missing; retry once for SW wake.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await request(
            "connect",
            {
              onlyIfTrusted,
              origin: location.origin,
              title: document.title || "",
            },
            onlyIfTrusted ? 1500 : 20000
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (onlyIfTrusted) break;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      if (lastErr) {
        if (onlyIfTrusted) return { publicKey: null };
        throw lastErr;
      }
      if (!result || !result.publicKey) {
        if (onlyIfTrusted) return { publicKey: null };
        throw new Error("No Solana address in Gladiator — open the extension and create/import a wallet");
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
      if (!isConnected) await connectLegacy();
      const ser = serializeTx(transaction);
      const result = await request("signTransaction", {
        ...ser,
        origin: location.origin,
      });
      if (!result || !result.signedTransaction) throw new Error("Sign failed");
      return deserializeTx(result.signedTransaction, transaction, ser.versioned);
    }

    async function signAllTransactions(transactions) {
      if (!isConnected) await connectLegacy();
      const list = Array.isArray(transactions) ? transactions : [];
      const payload = list.map((tx) => serializeTx(tx));
      const result = await request("signAllTransactions", {
        transactions: payload,
        origin: location.origin,
      });
      const signed = (result && result.signedTransactions) || [];
      return list.map((tx, i) => deserializeTx(signed[i], tx, payload[i].versioned));
    }

    async function signAndSendTransaction(transaction, options) {
      if (!isConnected) await connectLegacy();
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
      if (!isConnected) await connectLegacy();
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

    function toTxBytes(input) {
      if (!input) throw new Error("Missing transaction");
      if (input instanceof Uint8Array) return input;
      return new Uint8Array(input);
    }

    const features = Object.freeze({
      "standard:connect": Object.freeze({
        version: "1.0.0",
        connect: async (input) => {
          const silent = !!(input && input.silent);
          // Critical: silent must never throw and must not talk to the extension
          // during dApp boot (Jupiter autoConnect scans every wallet).
          if (silent) {
            return { accounts: getAccounts() };
          }
          try {
            await connectLegacy({ onlyIfTrusted: false });
          } catch (err) {
            // Surface a clear error for Jupiter's WalletConnectionError wrapper.
            throw new Error(
              String((err && err.message) || err || "Gladiator connect failed")
            );
          }
          const accounts = getAccounts();
          if (!accounts.length) {
            throw new Error(
              "Gladiator connected but returned no account — open the extension wallet"
            );
          }
          return { accounts };
        },
      }),
      "standard:disconnect": Object.freeze({
        version: "1.0.0",
        disconnect: async () => {
          await disconnect();
        },
      }),
      "standard:events": Object.freeze({
        version: "1.0.0",
        on: (event, callback) => {
          if (typeof callback !== "function") return () => {};
          const entry = { event, callback };
          standardListeners.add(entry);
          return () => {
            standardListeners.delete(entry);
          };
        },
      }),
      "solana:signAndSendTransaction": Object.freeze({
        version: "1.0.0",
        supportedTransactionVersions: TX_VERSIONS,
        signAndSendTransaction: async (...inputs) => {
          if (!isConnected) await connectLegacy();
          const out = [];
          for (const input of inputs) {
            const bytes = toTxBytes(input && input.transaction);
            const result = await request("signAndSendTransaction", {
              transaction: b64FromBytes(bytes),
              versioned: true,
              options: (input && input.options) || {},
              origin: location.origin,
            });
            out.push({ signature: result.signature });
          }
          return out;
        },
      }),
      "solana:signTransaction": Object.freeze({
        version: "1.0.0",
        supportedTransactionVersions: TX_VERSIONS,
        signTransaction: async (...inputs) => {
          if (!isConnected) await connectLegacy();
          const out = [];
          for (const input of inputs) {
            const bytes = toTxBytes(input && input.transaction);
            let result;
            try {
              result = await request("signTransaction", {
                transaction: b64FromBytes(bytes),
                versioned: true,
                origin: location.origin,
              });
            } catch (err) {
              throw new Error(
                "Gladiator sign failed: " +
                  String((err && err.message) || err || "unknown")
              );
            }
            if (!result || !result.signedTransaction) {
              throw new Error("Gladiator returned empty signed transaction");
            }
            out.push({
              signedTransaction: bytesFromB64(result.signedTransaction),
            });
          }
          return out;
        },
      }),
      "solana:signMessage": Object.freeze({
        version: "1.0.0",
        signMessage: async (...inputs) => {
          if (!isConnected) await connectLegacy();
          const out = [];
          for (const input of inputs) {
            const msg = toTxBytes(input && input.message);
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
      }),
    });

    const wallet = {
      get version() {
        return "1.0.0";
      },
      get name() {
        return "Gladiator";
      },
      get icon() {
        return ICON;
      },
      get chains() {
        return CHAINS.slice();
      },
      get features() {
        return features;
      },
      get accounts() {
        return getAccounts();
      },
    };

    const provider = {
      isGladiator: true,
      isPhantom: false,
      get publicKey() {
        return publicKey;
      },
      get isConnected() {
        return isConnected;
      },
      connect: connectLegacy,
      disconnect,
      signTransaction,
      signAllTransactions,
      signAndSendTransaction,
      signMessage,
      request: async ({ method, params }) => {
        const m = String(method || "");
        if (m === "connect") return connectLegacy(params);
        if (m === "disconnect") return disconnect();
        if (m === "signTransaction") return signTransaction(params && params.transaction);
        if (m === "signAllTransactions")
          return signAllTransactions(params && params.transactions);
        if (m === "signAndSendTransaction")
          return signAndSendTransaction(
            params && params.transaction,
            params && params.options
          );
        if (m === "signMessage")
          return signMessage(params && params.message, params && params.display);
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

    // Official registerWallet pattern (throws on preventDefault like the reference impl).
    class RegisterWalletEvent extends Event {
      constructor(callback) {
        super("wallet-standard:register-wallet", {
          bubbles: false,
          cancelable: false,
          detail: callback,
        });
        this._detail = callback;
      }
      get detail() {
        return this._detail;
      }
      preventDefault() {
        throw new Error("preventDefault is not supported");
      }
      stopPropagation() {
        throw new Error("stopPropagation is not supported");
      }
      stopImmediatePropagation() {
        throw new Error("stopImmediatePropagation is not supported");
      }
    }

    function registerCallback(api) {
      try {
        if (registered) return;
        if (!api || typeof api.register !== "function") return;
        api.register(wallet);
        registered = true;
      } catch (_) {}
    }

    function registerWalletStandard() {
      const callback = function ({ register }) {
        registerCallback({ register });
      };
      try {
        window.dispatchEvent(new RegisterWalletEvent(callback));
      } catch (_) {
        // Fallback for environments that reject custom Event subclasses.
        try {
          window.dispatchEvent(
            new CustomEvent("wallet-standard:register-wallet", { detail: callback })
          );
        } catch (_) {}
      }
      try {
        window.addEventListener("wallet-standard:app-ready", function (event) {
          try {
            registerCallback(event && event.detail);
          } catch (_) {}
        });
      } catch (_) {}
    }

    // Never overwrite window.solana — fights Phantom/Jupiter and can blank pages.
    try {
      Object.defineProperty(window, "gladiator", {
        value: provider,
        writable: false,
        configurable: true,
      });
    } catch (_) {
      try {
        window.gladiator = provider;
      } catch (_) {}
    }

    registerWalletStandard();

    // --- EIP-1193 + EIP-6963 ethereum provider (Uniswap, etc.) ---
    const ethListeners = {
      accountsChanged: new Set(),
      chainChanged: new Set(),
      connect: new Set(),
      disconnect: new Set(),
      message: new Set(),
    };
    let ethSelectedAddress = null;
    let ethChainId = "0x1";
    let ethConnected = false;

    function ethEmit(event, payload) {
      const set = ethListeners[event];
      if (!set) return;
      set.forEach((fn) => {
        try {
          fn(payload);
        } catch (_) {}
      });
    }

    onAccountsChangedFromWallet = function (data) {
      try {
        const nextPk = data && data.publicKey ? String(data.publicKey) : "";
        const prev =
          publicKey && typeof publicKey.toBase58 === "function"
            ? publicKey.toBase58()
            : publicKey
              ? String(publicKey)
              : "";
        if (nextPk) {
          publicKey = new PublicKey(nextPk);
          isConnected = true;
          if (String(prev || "") !== nextPk) {
            try {
              emit("accountChanged", publicKey);
            } catch (_) {}
            try {
              emitStandard("change", { accounts: getAccounts() });
            } catch (_) {}
          }
        } else if (prev) {
          // Active wallet has no Solana key — clear stale Jupiter identity.
          publicKey = null;
          isConnected = false;
          try {
            emit("accountChanged", null);
          } catch (_) {}
          try {
            emitStandard("change", { accounts: [] });
          } catch (_) {}
        }
        const evmAccounts = Array.isArray(data && data.accounts)
          ? data.accounts.filter(Boolean)
          : [];
        const nextEvm = evmAccounts[0] || null;
        if (
          String(ethSelectedAddress || "").toLowerCase() !==
          String(nextEvm || "").toLowerCase()
        ) {
          ethSelectedAddress = nextEvm;
          ethConnected = !!nextEvm;
          try {
            ethEmit("accountsChanged", nextEvm ? [nextEvm] : []);
          } catch (_) {}
        }
      } catch (err) {
        console.warn("[Gladiator] accounts-changed", err);
      }
    };

    async function ethRequest(args) {
      const method = String((args && args.method) || "");
      const params = (args && args.params) || [];
      if (!method) throw new Error("method required");

      if (method === "eth_chainId") {
        const r = await request("eth_chainId", { args: [] });
        ethChainId = String((r && r.chainId) || ethChainId || "0x1");
        return ethChainId;
      }
      if (method === "net_version") {
        const r = await request("net_version", { args: [] });
        return String((r && r.netVersion) || parseInt(ethChainId, 16) || "1");
      }
      if (method === "eth_accounts") {
        const r = await request("eth_accounts", { args: [] });
        const accounts = (r && r.accounts) || [];
        ethSelectedAddress = accounts[0] || null;
        ethConnected = !!ethSelectedAddress;
        return accounts;
      }
      if (method === "eth_requestAccounts") {
        const r = await request("eth_requestAccounts", { args: [] });
        const accounts = (r && r.accounts) || [];
        ethSelectedAddress = accounts[0] || null;
        ethConnected = !!ethSelectedAddress;
        if (r && r.chainId) ethChainId = String(r.chainId);
        try {
          ethEmit("connect", { chainId: ethChainId });
        } catch (_) {}
        try {
          ethEmit("accountsChanged", accounts.slice());
        } catch (_) {}
        return accounts;
      }
      if (method === "wallet_switchEthereumChain") {
        const r = await request("wallet_switchEthereumChain", { args: params });
        if (r && r.chainId) {
          const prev = ethChainId;
          ethChainId = String(r.chainId);
          if (prev !== ethChainId) ethEmit("chainChanged", ethChainId);
        }
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        await request("wallet_addEthereumChain", { args: params });
        return null;
      }
      if (method === "wallet_revokePermissions" || method === "wallet_requestPermissions") {
        if (method === "wallet_requestPermissions") {
          const accounts = await ethRequest({ method: "eth_requestAccounts", params: [] });
          return [{ parentCapability: "eth_accounts", date: Date.now() }];
        }
        try {
          await request("wallet_revokePermissions", { args: params });
        } catch (_) {}
        ethSelectedAddress = null;
        ethConnected = false;
        ethEmit("accountsChanged", []);
        return null;
      }
      if (method === "wallet_getPermissions") {
        return ethConnected
          ? [{ parentCapability: "eth_accounts", date: Date.now() }]
          : [];
      }

      const r = await request(method, { args: Array.isArray(params) ? params : [] });
      if (r && Object.prototype.hasOwnProperty.call(r, "result")) return r.result;
      if (r && Object.prototype.hasOwnProperty.call(r, "signature")) return r.signature;
      if (r && Object.prototype.hasOwnProperty.call(r, "hash")) return r.hash;
      return r;
    }

    const ethereum = {
      isGladiator: true,
      isMetaMask: false,
      get chainId() {
        return ethChainId;
      },
      get networkVersion() {
        return String(parseInt(ethChainId, 16) || 1);
      },
      get selectedAddress() {
        return ethSelectedAddress;
      },
      isConnected() {
        return !!ethConnected;
      },
      request: ethRequest,
      enable: async () => ethRequest({ method: "eth_requestAccounts", params: [] }),
      send(payload, callback) {
        if (typeof payload === "string") {
          return ethRequest({ method: payload, params: callback || [] });
        }
        const p = ethRequest({
          method: payload && payload.method,
          params: (payload && payload.params) || [],
        });
        if (typeof callback === "function") {
          p.then(
            (result) => callback(null, { id: payload.id, jsonrpc: "2.0", result }),
            (err) => callback(err, null)
          );
          return;
        }
        return p.then((result) => ({ id: payload && payload.id, jsonrpc: "2.0", result }));
      },
      sendAsync(payload, callback) {
        ethereum.send(payload, callback);
      },
      on(event, fn) {
        if (ethListeners[event] && typeof fn === "function") ethListeners[event].add(fn);
        return ethereum;
      },
      addListener(event, fn) {
        return ethereum.on(event, fn);
      },
      removeListener(event, fn) {
        if (ethListeners[event] && fn) ethListeners[event].delete(fn);
        return ethereum;
      },
      off(event, fn) {
        return ethereum.removeListener(event, fn);
      },
      removeAllListeners(event) {
        if (event && ethListeners[event]) ethListeners[event].clear();
        else Object.keys(ethListeners).forEach((k) => ethListeners[k].clear());
      },
      _metamask: {
        isUnlocked: async () => true,
      },
    };

    const eip6963Info = Object.freeze({
      uuid: "a8f0e3c2-6b41-4d9e-9c7a-11f0a1b2c3d4",
      name: "Gladiator",
      icon: ICON,
      rdns: "wallet.gladiator",
    });

    function announceEip6963() {
      try {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({ info: eip6963Info, provider: ethereum }),
          })
        );
      } catch (_) {}
    }

    try {
      if (!window.ethereum) {
        Object.defineProperty(window, "ethereum", {
          value: ethereum,
          writable: false,
          configurable: true,
        });
      } else {
        const existing = window.ethereum;
        try {
          if (Array.isArray(existing.providers)) {
            if (!existing.providers.includes(ethereum)) existing.providers.push(ethereum);
          } else {
            existing.providers = [existing, ethereum];
          }
        } catch (_) {}
      }
    } catch (_) {
      try {
        if (!window.ethereum) window.ethereum = ethereum;
      } catch (_) {}
    }

    try {
      window.gladiatorEthereum = ethereum;
    } catch (_) {}

    announceEip6963();
    try {
      window.addEventListener("eip6963:requestProvider", function () {
        announceEip6963();
      });
    } catch (_) {}
  } catch (_) {}
})();
