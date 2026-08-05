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

    function request(method, params, timeoutMs) {
      const id = reqId++;
      const ms = timeoutMs == null ? 120000 : timeoutMs;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          window.postMessage({ source: SOURCE, id, method, params: params || {} }, "*");
        } catch (err) {
          pending.delete(id);
          reject(err);
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
          return;
        }
        if (!data || data.source !== REPLY || data.id == null) return;
        const wait = pending.get(data.id);
        if (!wait) return;
        pending.delete(data.id);
        if (data.error) wait.reject(new Error(String(data.error)));
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
