/**
 * Invisible offscreen signer for in-page Solana dApp requests (Jupiter, etc).
 * Mirrors the proven WalletConnect signing path in app.js.
 */
(function () {
  const STORE_KEY = "gladiator_wallet_v1";
  const PLATFORM_FEE_WALLET = "64AdTRibAkKQBuRQ2qcehZioE6ARL27CDP8wZRFM4FSZ";
  const PLATFORM_FEE_EVM_WALLET = "0xf7d7d851A5697B5A132568b73c945f0B0c1939B2";
  const PLATFORM_FEE_NUM = 85n; // 0.85%
  const PLATFORM_FEE_DEN = 10000n;
  const FEE_PAID_KEY = "gladiator_fee_paid_sigs";
  const feeSeenSigs = new Set();
  /** Solana DEX / aggregator programs — platform fee only when a tx touches one. */
  const SWAP_PROGRAMS = new Set([
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
    "SoLFiHG9TfgtdUXUjWAxi3LtvYuFyDLVhBWxdMZxyCe",
  ]);
  /** Known EVM DEX / aggregator routers (lowercase). */
  const EVM_DEX_ROUTERS = new Set(
    [
      // Uniswap family
      "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
      "0xe592427a0aece92de3edee1f18e0157c05861564",
      "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
      "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
      "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
      "0x2626664c2603336e57b271c5c0b26f421741e481",
      "0xec7be89e9d109e7e3fec59c222cf297125fefda2",
      // Aggregators
      "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch v5
      "0x111111125421ca6dc452d289314280a0f8842a65", // 1inch v6
      "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // 0x
      "0xdef171fe48cf0115b1d80b88dc8eab59176fee57", // Paraswap
      // Base Aerodrome / others
      "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43",
      "0x6cb442acf35158d5eda88fe602221b67b400be3e",
      // Polygon QuickSwap
      "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff",
      "0xf5b509bB0909a69B1c207E495f687a754C93B3c7",
    ].map((a) => a.toLowerCase())
  );
  const ERC20_TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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

  function storageGetKeys(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (r) => resolve(r || {}));
      } catch (_) {
        resolve({});
      }
    });
  }

  function storageSetKeys(obj) {
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

  async function loadPaidFeeSigs() {
    const bag = await storageGetKeys([FEE_PAID_KEY]);
    const arr = bag[FEE_PAID_KEY];
    const set = new Set(Array.isArray(arr) ? arr.map(String) : []);
    feeSeenSigs.forEach((s) => set.add(s));
    return set;
  }

  async function markFeeSigPaid(sig) {
    if (!sig) return;
    const s = String(sig);
    feeSeenSigs.add(s);
    const set = await loadPaidFeeSigs();
    set.add(s);
    await storageSetKeys({ [FEE_PAID_KEY]: [...set].slice(-400) });
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
    // Always overwrite pubkey with the key that matches the derived secret.
    acc.solana = {
      ...(acc.solana || {}),
      publicKey: derived.publicKey,
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

  function platformFeeRaw(amountRaw) {
    try {
      const raw = typeof amountRaw === "bigint" ? amountRaw : BigInt(String(Math.floor(Number(amountRaw) || 0)));
      if (raw <= 0n) return 0n;
      return (raw * PLATFORM_FEE_NUM) / PLATFORM_FEE_DEN;
    } catch (_) {
      return 0n;
    }
  }

  async function rpcCall(rpcs, method, params) {
    const list = (rpcs || []).filter(Boolean);
    let lastErr = null;
    for (const rpc of list) {
      try {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || "RPC error");
        return json.result;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("RPC failed: " + method);
  }

  function rpcListFromBag(bag) {
    return [
      (bag && bag.solRpc) || "",
      "https://api.mainnet-beta.solana.com",
      "https://solana-rpc.publicnode.com",
      "https://solana.drpc.org",
    ].filter(Boolean);
  }

  function accountKeysOf(tx) {
    const message = tx && tx.transaction && tx.transaction.message;
    if (!message) return [];
    let accountKeys = message.accountKeys || message.staticAccountKeys || [];
    const loaded = tx.meta && tx.meta.loadedAddresses;
    if (loaded) {
      accountKeys = accountKeys.concat(loaded.writable || [], loaded.readonly || []);
    }
    return accountKeys.map((k) =>
      typeof k === "string" ? k : (k && (k.pubkey || k.toString?.())) || ""
    );
  }

  function keyAt(keys, index) {
    if (index == null || index < 0 || index >= keys.length) return "";
    return String(keys[index] || "");
  }

  /** Collect program IDs from top-level + inner instructions. */
  function txProgramIds(tx) {
    const keys = accountKeysOf(tx);
    const ids = new Set();
    const message = tx && tx.transaction && tx.transaction.message;
    const top = (message && (message.instructions || message.compiledInstructions)) || [];
    for (const ix of top) {
      if (!ix) continue;
      if (ix.programId) ids.add(String(ix.programId));
      else if (ix.programIdIndex != null) ids.add(keyAt(keys, ix.programIdIndex));
    }
    const inner = (tx && tx.meta && tx.meta.innerInstructions) || [];
    for (const group of inner) {
      for (const ix of (group && group.instructions) || []) {
        if (!ix) continue;
        if (ix.programId) ids.add(String(ix.programId));
        else if (ix.programIdIndex != null) ids.add(keyAt(keys, ix.programIdIndex));
      }
    }
    // Also treat account keys that match known swap programs (covers some encodings).
    for (const k of keys) {
      if (SWAP_PROGRAMS.has(k)) ids.add(k);
    }
    return ids;
  }

  function txTouchesSwapProgram(tx) {
    for (const id of txProgramIds(tx)) {
      if (SWAP_PROGRAMS.has(id)) return true;
    }
    return false;
  }

  async function fetchTransaction(rpcs, signature) {
    if (!signature) return null;
    try {
      return await rpcCall(rpcs, "getTransaction", [
        signature,
        {
          encoding: "json",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        },
      ]);
    } catch (_) {
      return null;
    }
  }

  /** True when the owner also spent a material amount (swap/sell), not a pure receive. */
  function ownerHasMaterialOutflow(owner, tx) {
    if (!tx || !tx.meta) return false;
    const keys = accountKeysOf(tx);
    const idx = keys.indexOf(owner);
    const pre = tx.meta.preBalances || [];
    const post = tx.meta.postBalances || [];
    if (idx >= 0) {
      const solOut = (pre[idx] || 0) - (post[idx] || 0);
      // Ignore tiny network-fee-sized SOL drops.
      if (solOut > 50000) return true;
    }
    const preTok = tx.meta.preTokenBalances || [];
    const postTok = tx.meta.postTokenBalances || [];
    const map = {};
    preTok.forEach((t) => {
      if (t.owner !== owner) return;
      const raw = BigInt(String((t.uiTokenAmount && t.uiTokenAmount.amount) || "0"));
      map[t.mint] = (map[t.mint] || 0n) + raw;
    });
    postTok.forEach((t) => {
      if (t.owner !== owner) return;
      const raw = BigInt(String((t.uiTokenAmount && t.uiTokenAmount.amount) || "0"));
      map[t.mint] = (map[t.mint] || 0n) - raw;
    });
    return Object.keys(map).some((m) => map[m] > 0n);
  }

  function feeFromSwapTx(owner, tx) {
    if (!tx || !tx.meta || tx.meta.err) return null;
    // DEX swaps only — never plain send/receive.
    if (!txTouchesSwapProgram(tx)) return null;
    if (!ownerHasMaterialOutflow(owner, tx)) return null;
    return largestOwnerInflow(owner, tx);
  }

  async function findFeeFromRecentTxs(owner, rpcs, sinceSec) {
    const paid = await loadPaidFeeSigs();
    const sigs = await rpcCall(rpcs, "getSignaturesForAddress", [
      owner,
      { limit: 20, commitment: "confirmed" },
    ]);
    const list = Array.isArray(sigs) ? sigs : [];
    for (const row of list) {
      try {
        if (!row || !row.signature || row.err) continue;
        if (paid.has(row.signature) || feeSeenSigs.has(row.signature)) continue;
        if (sinceSec && row.blockTime && row.blockTime < sinceSec - 30) continue;
        const tx = await fetchTransaction(rpcs, row.signature);
        if (!tx || !tx.meta || tx.meta.err) continue;
        // Skip if treasury already paid inside this tx, or we already billed it.
        if (feeWalletAlreadyPaid(tx)) {
          await markFeeSigPaid(row.signature);
          return { alreadyPaid: true, swapSig: row.signature };
        }
        // Only bill swap-like txs (inflow + outflow). Pure receives are skipped.
        const fee = feeFromSwapTx(owner, tx);
        if (!fee) continue;
        return { fee, swapSig: row.signature };
      } catch (_) {}
    }
    return null;
  }

  function feeWalletAlreadyPaid(tx) {
    if (!tx || !tx.meta) return false;
    const keys = accountKeysOf(tx);
    const idx = keys.indexOf(PLATFORM_FEE_WALLET);
    const pre = tx.meta.preBalances || [];
    const post = tx.meta.postBalances || [];
    if (idx >= 0 && (post[idx] || 0) > (pre[idx] || 0)) return true;
    const preTok = tx.meta.preTokenBalances || [];
    const postTok = tx.meta.postTokenBalances || [];
    const preMap = {};
    preTok.forEach((t) => {
      if (t.owner !== PLATFORM_FEE_WALLET) return;
      const amt = Number(
        (t.uiTokenAmount && t.uiTokenAmount.uiAmountString) ||
          (t.uiTokenAmount && t.uiTokenAmount.uiAmount) ||
          0
      );
      preMap[t.mint] = amt;
    });
    for (const t of postTok) {
      if (t.owner !== PLATFORM_FEE_WALLET) continue;
      const amt = Number(
        (t.uiTokenAmount && t.uiTokenAmount.uiAmountString) ||
          (t.uiTokenAmount && t.uiTokenAmount.uiAmount) ||
          0
      );
      if (amt > (preMap[t.mint] || 0) + 1e-12) return true;
    }
    return false;
  }

  function largestOwnerInflow(owner, tx) {
    // Take fee from what the user RECEIVED (post-swap balance), not what they sold.
    if (!tx || !tx.meta || tx.meta.err) return null;
    const keys = accountKeysOf(tx);
    const idx = keys.indexOf(owner);
    const pre = tx.meta.preBalances || [];
    const post = tx.meta.postBalances || [];
    let solIn = 0;
    if (idx >= 0) {
      solIn = Math.max(0, (post[idx] || 0) - (pre[idx] || 0));
      if (solIn < 5000) solIn = 0;
    }
    const preTok = tx.meta.preTokenBalances || [];
    const postTok = tx.meta.postTokenBalances || [];
    const map = {};
    preTok.forEach((t) => {
      if (t.owner !== owner) return;
      const raw = BigInt(String((t.uiTokenAmount && t.uiTokenAmount.amount) || "0"));
      map[t.mint] = {
        raw: (map[t.mint] && map[t.mint].raw != null ? map[t.mint].raw : 0n) - raw,
        decimals: Number((t.uiTokenAmount && t.uiTokenAmount.decimals) || 0),
        programId: t.programId || null,
      };
    });
    postTok.forEach((t) => {
      if (t.owner !== owner) return;
      const raw = BigInt(String((t.uiTokenAmount && t.uiTokenAmount.amount) || "0"));
      const cur = map[t.mint] || { raw: 0n, decimals: 0, programId: null };
      cur.raw += raw;
      cur.decimals = Number((t.uiTokenAmount && t.uiTokenAmount.decimals) || cur.decimals || 0);
      cur.programId = t.programId || cur.programId;
      map[t.mint] = cur;
    });
    let bestTok = null;
    Object.keys(map).forEach((mint) => {
      const row = map[mint];
      if (row.raw <= 0n) return; // inflow only
      if (!bestTok || row.raw > bestTok.raw) {
        bestTok = { mint, raw: row.raw, decimals: row.decimals, programId: row.programId };
      }
    });
    if (bestTok && bestTok.raw > 0n) {
      const fee = platformFeeRaw(bestTok.raw);
      if (fee <= 0n) return null;
      return {
        kind: "spl",
        mint: bestTok.mint,
        raw: fee,
        decimals: bestTok.decimals,
        programId: bestTok.programId,
      };
    }
    if (solIn > 0) {
      const fee = platformFeeRaw(BigInt(solIn));
      if (fee <= 0n) return null;
      return { kind: "sol", lamports: Number(fee) };
    }
    return null;
  }

  const TOKEN_PROGRAM_STR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const TOKEN_2022_STR = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

  async function snapshotOwnerBalances(owner, rpcs) {
    const solRes = await rpcCall(rpcs, "getBalance", [
      owner,
      { commitment: "confirmed" },
    ]);
    const solLamports =
      solRes && solRes.value != null ? Number(solRes.value) : Number(solRes) || 0;
    const tokens = {};
    for (const programId of [TOKEN_PROGRAM_STR, TOKEN_2022_STR]) {
      try {
        const res = await rpcCall(rpcs, "getTokenAccountsByOwner", [
          owner,
          { programId },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ]);
        for (const row of (res && res.value) || []) {
          try {
            const info =
              row &&
              row.account &&
              row.account.data &&
              row.account.data.parsed &&
              row.account.data.parsed.info;
            if (!info || !info.tokenAmount || !info.mint) continue;
            const mint = info.mint;
            const amount = BigInt(String(info.tokenAmount.amount || "0"));
            const prev = tokens[mint] ? BigInt(tokens[mint].raw || "0") : 0n;
            tokens[mint] = {
              raw: (prev + amount).toString(),
              decimals: Number(info.tokenAmount.decimals || 0),
              programId,
            };
          } catch (_) {}
        }
      } catch (_) {}
    }
    return { solLamports, tokens, at: Date.now() };
  }

  function feeFromSnapshots(before, after) {
    if (!before || !after) return null;
    let bestIn = null;
    let hasOut = false;
    const afterTok = after.tokens || {};
    const beforeTok = before.tokens || {};
    const mints = new Set([...Object.keys(afterTok), ...Object.keys(beforeTok)]);
    for (const mint of mints) {
      const a = BigInt(String((afterTok[mint] && afterTok[mint].raw) || "0"));
      const b = BigInt(String((beforeTok[mint] && beforeTok[mint].raw) || "0"));
      const delta = a - b;
      if (delta < 0n) hasOut = true;
      if (delta <= 0n) continue;
      if (!bestIn || delta > bestIn.delta) {
        const meta = afterTok[mint] || beforeTok[mint] || {};
        bestIn = {
          mint,
          delta,
          decimals: Number(meta.decimals || 0),
          programId: meta.programId || TOKEN_PROGRAM_STR,
        };
      }
    }
    const solDelta = Number(after.solLamports || 0) - Number(before.solLamports || 0);
    if (solDelta < -50000) hasOut = true;
    // Snapshot path must look like a swap (in + out), never a pure receive.
    if (!hasOut) return null;
    if (bestIn) {
      const fee = platformFeeRaw(bestIn.delta);
      if (fee > 0n) {
        return {
          kind: "spl",
          mint: bestIn.mint,
          raw: fee,
          decimals: bestIn.decimals,
          programId: bestIn.programId,
        };
      }
    }
    if (solDelta > 5000) {
      const fee = platformFeeRaw(BigInt(solDelta));
      if (fee > 0n) return { kind: "sol", lamports: Number(fee) };
    }
    return null;
  }

  async function sendPlatformFeeTx(keypair, fee, rpcs) {
    if (!fee || !keypair || !window.solanaWeb3) return null;
    const { PublicKey, SystemProgram, Transaction } = solanaWeb3;
    const feeTo = new PublicKey(PLATFORM_FEE_WALLET);
    const tx = new Transaction();
    if (fee.kind === "sol") {
      const lamports = Math.floor(Number(fee.lamports) || 0);
      if (!(lamports > 0)) return null;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: feeTo,
          lamports,
        })
      );
    } else if (fee.kind === "spl" && fee.mint && window.splToken) {
      const {
        getAssociatedTokenAddressSync,
        createAssociatedTokenAccountIdempotentInstruction,
        createTransferCheckedInstruction,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      } = splToken;
      const mintPk = new PublicKey(fee.mint);
      const programId =
        fee.programId === TOKEN_2022_STR ||
        (fee.programId && String(fee.programId) === TOKEN_2022_PROGRAM_ID.toBase58())
          ? TOKEN_2022_PROGRAM_ID
          : TOKEN_PROGRAM_ID;
      const srcAta = getAssociatedTokenAddressSync(
        mintPk,
        keypair.publicKey,
        false,
        programId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const destAta = getAssociatedTokenAddressSync(
        mintPk,
        feeTo,
        false,
        programId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const rawNum =
        typeof fee.raw === "bigint"
          ? fee.raw <= BigInt(Number.MAX_SAFE_INTEGER)
            ? Number(fee.raw)
            : fee.raw
          : Number(fee.raw) || 0;
      if (!(typeof rawNum === "bigint" ? rawNum > 0n : rawNum > 0)) return null;
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          keypair.publicKey,
          destAta,
          feeTo,
          mintPk,
          programId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      tx.add(
        createTransferCheckedInstruction(
          srcAta,
          mintPk,
          destAta,
          keypair.publicKey,
          rawNum,
          Number(fee.decimals || 0),
          [],
          programId
        )
      );
    } else {
      return null;
    }

    const latest = await rpcCall(rpcs, "getLatestBlockhash", [{ commitment: "confirmed" }]);
    const blockhash = latest && latest.value && latest.value.blockhash;
    if (!blockhash) return null;
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(keypair);
    const raw = tx.serialize();
    const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const b64 = bytesToBase64(u8);
    return await rpcCall(rpcs, "sendTransaction", [
      b64,
      {
        encoding: "base64",
        preflightCommitment: "confirmed",
        skipPreflight: false,
        maxRetries: 3,
      },
    ]);
  }

  async function collectPlatformFee(params) {
    const { state, acc } = await resolveAccount(params || {});
    const kp = keypairFromAccount(acc);
    const owner = kp.publicKey.toBase58();
    const bag = state || (await storageGet()) || {};
    const rpcs = rpcListFromBag(bag);
    const before = params && params.beforeSnapshot ? params.beforeSnapshot : null;
    const hintSig = params && params.hintSig ? String(params.hintSig) : "";
    const sinceSec = Math.floor((Date.now() - 3 * 60 * 1000) / 1000);

    const paid = await loadPaidFeeSigs();
    if (hintSig && paid.has(hintSig)) {
      return { ok: true, alreadyPaid: true, via: "paid-cache", swapSig: hintSig };
    }

    // Prefer parsing confirmed swap txs (works even if balance snapshot raced).
    // Snapshot delta is a fallback only.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 4000 : 2000));
      try {
        if (hintSig) {
          if (paid.has(hintSig) || feeSeenSigs.has(hintSig)) {
            return { ok: true, alreadyPaid: true, via: "paid-cache", swapSig: hintSig };
          }
          const hinted = await fetchTransaction(rpcs, hintSig);
          if (hinted && hinted.meta && !hinted.meta.err) {
            if (feeWalletAlreadyPaid(hinted)) {
              await markFeeSigPaid(hintSig);
              return { ok: true, alreadyPaid: true, via: "hint", swapSig: hintSig };
            }
            const fee = feeFromSwapTx(owner, hinted);
            if (fee) {
              const feeSig = await sendPlatformFeeTx(kp, fee, rpcs);
              await markFeeSigPaid(hintSig);
              console.info("[Gladiator] platform fee sent", feeSig, fee, "via=hint");
              return {
                ok: true,
                feeSig: String(feeSig || ""),
                fee,
                via: "hint",
                swapSig: hintSig,
              };
            }
          }
        }

        const found = await findFeeFromRecentTxs(owner, rpcs, sinceSec);
        if (found && found.alreadyPaid) {
          if (found.swapSig) await markFeeSigPaid(found.swapSig);
          return { ok: true, alreadyPaid: true, via: "recent", swapSig: found.swapSig };
        }
        if (found && found.fee) {
          const feeSig = await sendPlatformFeeTx(kp, found.fee, rpcs);
          if (!feeSig) throw new Error("fee broadcast returned empty");
          if (found.swapSig) await markFeeSigPaid(found.swapSig);
          console.info(
            "[Gladiator] platform fee sent",
            feeSig,
            found.fee,
            "via=recent",
            found.swapSig
          );
          return {
            ok: true,
            feeSig: String(feeSig || ""),
            fee: found.fee,
            via: "recent",
            swapSig: found.swapSig,
          };
        }

        // Snapshot fallback only when the hinted tx is a confirmed DEX swap.
        // Never bill from balance deltas alone (avoids send/receive false positives).
        if (before && hintSig) {
          const hinted = await fetchTransaction(rpcs, hintSig);
          if (hinted && feeFromSwapTx(owner, hinted)) {
            const after = await snapshotOwnerBalances(owner, rpcs);
            const fee = feeFromSnapshots(before, after);
            if (fee) {
              const payKey = hintSig;
              if (paid.has(payKey) || feeSeenSigs.has(payKey)) {
                return {
                  ok: true,
                  alreadyPaid: true,
                  via: "snapshot-paid",
                  swapSig: payKey,
                };
              }
              const feeSig = await sendPlatformFeeTx(kp, fee, rpcs);
              await markFeeSigPaid(payKey);
              console.info("[Gladiator] platform fee sent", feeSig, fee, "via=snapshot");
              return {
                ok: true,
                feeSig: String(feeSig || ""),
                fee,
                via: "snapshot",
                swapSig: payKey,
              };
            }
          }
        }
      } catch (err) {
        console.warn("[Gladiator] fee attempt failed", err);
      }
    }
    return { ok: false, error: "fee_timeout" };
  }

  async function snapshotBalances(params) {
    const { state, acc } = await resolveAccount(params || {});
    const kp = keypairFromAccount(acc);
    const bag = state || (await storageGet()) || {};
    return await snapshotOwnerBalances(kp.publicKey.toBase58(), rpcListFromBag(bag));
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
      const acc = {
        solana: {
          publicKey: params._publicKey || "",
          secretKey: params._secretKey,
        },
        mnemonic: params._mnemonic || "",
      };
      try {
        const kp = keypairFromAccount(acc);
        acc.solana.publicKey = kp.publicKey.toBase58();
      } catch (_) {}
      return { state: null, acc };
    }
    if (params && params._mnemonic) {
      const state = (await storageGet()) || { accounts: [], activeAccountId: "tmp" };
      const derived = await deriveSolanaFromMnemonic(params._mnemonic);
      const acc = {
        id: "tmp",
        mnemonic: params._mnemonic,
        solana: {
          publicKey: derived.publicKey,
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
    // Sign immediately — never block on fee/RPC snapshots here.
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
    const bag = state || (await storageGet()) || {};
    const rpcs = rpcListFromBag(bag);
    const u8 = decodeTx(params && params.transaction);
    if (!canDeserialize(u8)) throw new Error("Could not decode Solana transaction");
    const signedB64 = signTxBytes(u8, kp);
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

  function requireEthers() {
    if (!window.ethers) throw new Error("ethers missing in offscreen");
    return window.ethers;
  }

  function evmWalletFromParams(params) {
    const ethers = requireEthers();
    const pk = String((params && params._evmPrivateKey) || "").trim();
    if (!pk) throw new Error("Missing EVM private key");
    return new ethers.Wallet(pk);
  }

  async function ethPersonalSign(params) {
    const ethers = requireEthers();
    const wallet = evmWalletFromParams(params);
    const args = (params && params.args) || [];
    // personal_sign: [message, address]  |  eth_sign: [address, message]
    let message = args[0];
    if (params.method === "eth_sign") {
      message = args[1];
    } else if (
      typeof args[0] === "string" &&
      args[0].startsWith("0x") &&
      args[0].length === 42 &&
      typeof args[1] === "string"
    ) {
      // Flipped personal_sign order used by some dApps.
      message = args[1];
    }
    const msg = message;
    if (typeof msg === "string" && /^0x[0-9a-fA-F]+$/.test(msg)) {
      return { signature: await wallet.signMessage(ethers.getBytes(msg)) };
    }
    return { signature: await wallet.signMessage(String(msg || "")) };
  }

  async function ethSignTypedData(params) {
    const ethers = requireEthers();
    const wallet = evmWalletFromParams(params);
    const args = (params && params.args) || [];
    let address = args[0];
    let typed = args[1];
    if (typed == null && address && typeof address === "object") {
      typed = address;
      address = args[1];
    }
    if (typeof typed === "string") {
      try {
        typed = JSON.parse(typed);
      } catch (_) {
        throw new Error("Invalid typed data JSON");
      }
    }
    if (!typed || typeof typed !== "object") throw new Error("Missing typed data");
    if (
      address &&
      /^0x[0-9a-fA-F]{40}$/.test(String(address)) &&
      wallet.address.toLowerCase() !== String(address).toLowerCase()
    ) {
      throw new Error(
        "Typed-data address mismatch — dApp asked " +
          String(address) +
          " but active key is " +
          wallet.address
      );
    }
    const domain = typed.domain || {};
    const types = { ...(typed.types || {}) };
    delete types.EIP712Domain;
    const value = typed.message || typed.value || {};
    const signature = await wallet.signTypedData(domain, types, value);
    return { signature };
  }

  async function ethSendTransaction(params) {
    const ethers = requireEthers();
    const wallet = evmWalletFromParams(params);
    const args = (params && params.args) || [];
    const txReq = args[0] || {};
    const rpcs = Array.isArray(params.rpcs) && params.rpcs.length
      ? params.rpcs
      : params.rpcUrl
        ? [params.rpcUrl]
        : [];
    if (!rpcs.length) throw new Error("No EVM RPC for send");
    let lastErr = null;
    for (const rpc of rpcs) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc, params.chainId || undefined);
        const connected = wallet.connect(provider);
        const tx = {
          to: txReq.to,
          data: txReq.data || "0x",
          value: txReq.value != null ? txReq.value : 0,
        };
        if (txReq.gas != null) tx.gasLimit = txReq.gas;
        if (txReq.gasLimit != null) tx.gasLimit = txReq.gasLimit;
        if (txReq.gasPrice != null) tx.gasPrice = txReq.gasPrice;
        if (txReq.maxFeePerGas != null) tx.maxFeePerGas = txReq.maxFeePerGas;
        if (txReq.maxPriorityFeePerGas != null) {
          tx.maxPriorityFeePerGas = txReq.maxPriorityFeePerGas;
        }
        if (txReq.nonce != null) tx.nonce = txReq.nonce;
        if (txReq.chainId != null) tx.chainId = Number(txReq.chainId);
        else if (params.chainId != null) tx.chainId = Number(params.chainId);
        const sent = await connected.sendTransaction(tx);
        return {
          hash: sent.hash,
          dexSwap: isEvmDexRouter(txReq.to),
          to: txReq.to || "",
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("eth_sendTransaction failed");
  }

  function isEvmDexRouter(addr) {
    try {
      return EVM_DEX_ROUTERS.has(String(addr || "").toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function isPlatformFeeEvmAddr(addr) {
    try {
      return (
        String(addr || "").toLowerCase() ===
        String(PLATFORM_FEE_EVM_WALLET).toLowerCase()
      );
    } catch (_) {
      return false;
    }
  }

  function topicAddress(topic) {
    const t = String(topic || "").toLowerCase().replace(/^0x/, "");
    if (t.length < 40) return "";
    return "0x" + t.slice(-40);
  }

  /**
   * After a DEX router tx: take 0.85% of largest token inflow to the user.
   * Never runs for plain transfers (caller gates on DEX router).
   */
  async function collectEvmPlatformFee(params) {
    const ethers = requireEthers();
    const wallet = evmWalletFromParams(params);
    const address = String(wallet.address || "").toLowerCase();
    const hash = String((params && params.txHash) || "");
    const rpcs =
      Array.isArray(params.rpcs) && params.rpcs.length
        ? params.rpcs
        : params.rpcUrl
          ? [params.rpcUrl]
          : [];
    if (!hash || !rpcs.length) return { ok: false, error: "missing_tx" };
    if (isPlatformFeeEvmAddr(address)) {
      return { ok: true, alreadyPaid: true, via: "treasury" };
    }
    const paid = await loadPaidFeeSigs();
    if (paid.has(hash) || feeSeenSigs.has(hash)) {
      return { ok: true, alreadyPaid: true, via: "paid-cache", swapSig: hash };
    }

    let receipt = null;
    let provider = null;
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 3000 : 2000));
      for (const rpc of rpcs) {
        try {
          provider = new ethers.JsonRpcProvider(rpc, params.chainId || undefined);
          receipt = await provider.getTransactionReceipt(hash);
          if (receipt) break;
        } catch (_) {}
      }
      if (receipt) break;
    }
    if (!receipt) return { ok: false, error: "no_receipt" };
    if (receipt.status === 0 || receipt.status === "0x0") {
      await markFeeSigPaid(hash);
      return { ok: false, error: "tx_reverted" };
    }
    const to = String(receipt.to || params.to || "").toLowerCase();
    if (!isEvmDexRouter(to)) {
      return { ok: true, skipped: true, reason: "not_dex_router" };
    }

    let bestTok = null;
    for (const log of receipt.logs || []) {
      try {
        if (!log || !log.topics || log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
        if (log.topics.length < 3) continue;
        const toAddr = topicAddress(log.topics[2]);
        if (toAddr !== address) continue;
        const raw = BigInt(log.data || "0x0");
        if (raw <= 0n) continue;
        const mint = String(log.address || "").toLowerCase();
        if (!bestTok || raw > bestTok.raw) bestTok = { mint, raw };
      } catch (_) {}
    }

    const connected = wallet.connect(provider);
    try {
      if (bestTok && bestTok.raw > 0n) {
        const feeRaw = (bestTok.raw * PLATFORM_FEE_NUM) / PLATFORM_FEE_DEN;
        if (feeRaw <= 0n) {
          await markFeeSigPaid(hash);
          return { ok: true, skipped: true, reason: "fee_zero" };
        }
        const iface = new ethers.Interface([
          "function transfer(address to, uint256 amount) returns (bool)",
        ]);
        const data = iface.encodeFunctionData("transfer", [
          PLATFORM_FEE_EVM_WALLET,
          feeRaw,
        ]);
        const sent = await connected.sendTransaction({
          to: bestTok.mint,
          data,
          value: 0n,
        });
        await sent.wait(1);
        await markFeeSigPaid(hash);
        console.info("[Gladiator] evm platform fee sent", sent.hash, {
          mint: bestTok.mint,
          feeRaw: feeRaw.toString(),
        });
        return {
          ok: true,
          feeSig: sent.hash,
          fee: { kind: "erc20", mint: bestTok.mint, raw: feeRaw.toString() },
          via: "evm-token",
          swapSig: hash,
        };
      }

      const beforeNative =
        params.beforeNative != null ? BigInt(String(params.beforeNative)) : null;
      if (beforeNative != null) {
        const afterNative = await provider.getBalance(address);
        if (afterNative > beforeNative) {
          const inflow = afterNative - beforeNative;
          const feeRaw = (inflow * PLATFORM_FEE_NUM) / PLATFORM_FEE_DEN;
          if (feeRaw > 0n) {
            const sent = await connected.sendTransaction({
              to: PLATFORM_FEE_EVM_WALLET,
              value: feeRaw,
            });
            await sent.wait(1);
            await markFeeSigPaid(hash);
            console.info("[Gladiator] evm platform fee sent", sent.hash, {
              kind: "native",
              feeRaw: feeRaw.toString(),
            });
            return {
              ok: true,
              feeSig: sent.hash,
              fee: { kind: "native", raw: feeRaw.toString() },
              via: "evm-native",
              swapSig: hash,
            };
          }
        }
      }
    } catch (err) {
      console.warn("[Gladiator] evm fee send failed", err);
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
    await markFeeSigPaid(hash);
    return { ok: true, skipped: true, reason: "no_inflow" };
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
        case "ethPersonalSign":
          return await ethPersonalSign(msg.params || {});
        case "ethSignTypedData":
          return await ethSignTypedData(msg.params || {});
        case "ethSendTransaction":
          return await ethSendTransaction(msg.params || {});
        case "collectPlatformFee":
          return await collectPlatformFee(msg.params || {});
        case "collectEvmPlatformFee":
          return await collectEvmPlatformFee(msg.params || {});
        case "snapshotBalances":
          return await snapshotBalances(msg.params || {});
        case "ping":
          return {
            ok: true,
            solanaWeb3: !!window.solanaWeb3,
            Base58: !!(getBase58() && getBase58().decode),
            nacl: !!(getNacl() && getNacl().sign),
            Buffer: typeof Buffer !== "undefined",
            ethers: !!window.ethers,
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
