/**
 * Solana HD derivation from BIP39 seed (SLIP-0010 ed25519).
 * Path: m/44'/501'/{account}'/0'  (Phantom-compatible)
 *
 * Requires: window.nacl, window.ethers (for hmac via crypto or ethers)
 */
(function (root) {
  "use strict";

  async function hmacSha512(keyBytes, dataBytes) {
    if (root.crypto && root.crypto.subtle) {
      const key = await root.crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"]
      );
      const sig = await root.crypto.subtle.sign("HMAC", key, dataBytes);
      return new Uint8Array(sig);
    }
    // ethers fallback
    if (root.ethers && root.ethers.keccak256) {
      // ethers v6 has hmac via computeHmac if available
      if (typeof root.ethers.computeHmac === "function") {
        const hex = root.ethers.computeHmac(
          "sha512",
          keyBytes,
          dataBytes
        );
        return root.ethers.getBytes(hex);
      }
    }
    throw new Error("HMAC-SHA512 not available");
  }

  function concatBytes(arrays) {
    let len = 0;
    for (const a of arrays) len += a.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const a of arrays) {
      out.set(a, o);
      o += a.length;
    }
    return out;
  }

  function ser32(i) {
    return new Uint8Array([
      (i >>> 24) & 0xff,
      (i >>> 16) & 0xff,
      (i >>> 8) & 0xff,
      i & 0xff,
    ]);
  }

  async function masterKeyFromSeed(seed) {
    const key = new TextEncoder().encode("ed25519 seed");
    const I = await hmacSha512(key, seed);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }

  async function deriveHardened(node, index) {
    const idx = (index | 0x80000000) >>> 0;
    const data = concatBytes([
      new Uint8Array([0]),
      node.key,
      ser32(idx),
    ]);
    const I = await hmacSha512(node.chainCode, data);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }

  /**
   * @param {Uint8Array} seed BIP39 seed (64 bytes)
   * @param {number} accountIndex 0-based account index
   * @returns {Promise<Uint8Array>} 32-byte ed25519 seed
   */
  async function deriveSolanaSeed(seed, accountIndex) {
    let node = await masterKeyFromSeed(seed);
    // m/44'/501'/account'/0'
    node = await deriveHardened(node, 44);
    node = await deriveHardened(node, 501);
    node = await deriveHardened(node, accountIndex | 0);
    node = await deriveHardened(node, 0);
    return node.key;
  }

  async function deriveSolanaKeypair(seed, accountIndex) {
    if (!root.nacl) throw new Error("nacl missing");
    const skSeed = await deriveSolanaSeed(seed, accountIndex);
    return root.nacl.sign.keyPair.fromSeed(skSeed);
  }

  root.SolanaHD = {
    deriveSolanaSeed,
    deriveSolanaKeypair,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
