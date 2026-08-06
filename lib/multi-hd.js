/**
 * Bitcoin (BIP84 native segwit) + Sui address helpers for Gladiator Wallet.
 * Requires: window.nacl, window.ethers (HMAC / secp256k1), Web Crypto (SHA-256).
 */
(function (root) {
  "use strict";

  /* ---------- bytes ---------- */
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

  function toHex(u8) {
    return Array.from(u8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function sha256(bytes) {
    const copy =
      bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes || []);
    // Copy into a standalone buffer — some extension engines mishandle views.
    const ab = copy.buffer.slice(
      copy.byteOffset,
      copy.byteOffset + copy.byteLength
    );
    if (root.crypto && root.crypto.subtle) {
      try {
        const dig = await root.crypto.subtle.digest("SHA-256", ab);
        return new Uint8Array(dig);
      } catch (_) {
        /* fall through to ethers */
      }
    }
    if (root.ethers && typeof root.ethers.sha256 === "function") {
      return root.ethers.getBytes(root.ethers.sha256(copy));
    }
    throw new Error("SHA-256 not available (crypto.subtle / ethers)");
  }

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
    if (root.ethers && typeof root.ethers.computeHmac === "function") {
      return root.ethers.getBytes(
        root.ethers.computeHmac("sha512", keyBytes, dataBytes)
      );
    }
    throw new Error("HMAC-SHA512 not available");
  }

  /* ---------- RIPEMD-160 (compact) ---------- */
  function rotl(x, n) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  function ripemd160(msg) {
    const ml = msg.length;
    const withOne = new Uint8Array(ml + 1);
    withOne.set(msg);
    withOne[ml] = 0x80;
    const lenBits = ml * 8;
    let paddedLen = withOne.length + 8;
    while (paddedLen % 64 !== 0) paddedLen++;
    const buf = new Uint8Array(paddedLen);
    buf.set(withOne);
    const dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 8, lenBits >>> 0, true);
    dv.setUint32(paddedLen - 4, Math.floor(lenBits / 0x100000000), true);

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    const zl = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6,
      15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6,
      13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0,
      5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
    ];
    const zr = [
      5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13,
      5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2,
      10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12,
      15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
    ];
    const sl = [
      11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11,
      9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8,
      13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5,
      12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
    ];
    const sr = [
      8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12,
      8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13,
      5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15,
      8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
    ];

    function f(j, x, y, z) {
      if (j < 16) return (x ^ y ^ z) >>> 0;
      if (j < 32) return ((x & y) | (~x & z)) >>> 0;
      if (j < 48) return ((x | ~y) ^ z) >>> 0;
      if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
      return (x ^ (y | ~z)) >>> 0;
    }
    function k(j) {
      if (j < 16) return 0x00000000;
      if (j < 32) return 0x5a827999;
      if (j < 48) return 0x6ed9eba1;
      if (j < 64) return 0x8f1bbcdc;
      return 0xa953fd4e;
    }
    function kr(j) {
      if (j < 16) return 0x50a28be6;
      if (j < 32) return 0x5c4dd124;
      if (j < 48) return 0x6d703ef3;
      if (j < 64) return 0x7a6d76e9;
      return 0x00000000;
    }

    for (let i = 0; i < buf.length; i += 64) {
      const X = new Array(16);
      for (let j = 0; j < 16; j++) X[j] = dv.getUint32(i + j * 4, true);
      let al = h0,
        bl = h1,
        cl = h2,
        dl = h3,
        el = h4;
      let ar = h0,
        br = h1,
        cr = h2,
        dr = h3,
        er = h4;
      for (let j = 0; j < 80; j++) {
        let t = (al + f(j, bl, cl, dl) + X[zl[j]] + k(j)) >>> 0;
        t = (rotl(t, sl[j]) + el) >>> 0;
        al = el;
        el = dl;
        dl = rotl(cl, 10);
        cl = bl;
        bl = t;
        t = (ar + f(79 - j, br, cr, dr) + X[zr[j]] + kr(j)) >>> 0;
        t = (rotl(t, sr[j]) + er) >>> 0;
        ar = er;
        er = dr;
        dr = rotl(cr, 10);
        cr = br;
        br = t;
      }
      const t = (h1 + cl + dr) >>> 0;
      h1 = (h2 + dl + er) >>> 0;
      h2 = (h3 + el + ar) >>> 0;
      h3 = (h4 + al + br) >>> 0;
      h4 = (h0 + bl + cr) >>> 0;
      h0 = t;
    }

    const out = new Uint8Array(20);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, h0, true);
    odv.setUint32(4, h1, true);
    odv.setUint32(8, h2, true);
    odv.setUint32(12, h3, true);
    odv.setUint32(16, h4, true);
    return out;
  }

  /* ---------- bech32 (BIP173) ---------- */
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

  function bech32Polymod(values) {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (let p = 0; p < values.length; p++) {
      const top = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ values[p];
      for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
    }
    return chk;
  }

  function bech32HrpExpand(hrp) {
    const ret = [];
    for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >>> 5);
    ret.push(0);
    for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
    return ret;
  }

  function bech32CreateChecksum(hrp, data) {
    const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = bech32Polymod(values) ^ 1;
    const ret = [];
    for (let p = 0; p < 6; p++) ret.push((mod >>> (5 * (5 - p))) & 31);
    return ret;
  }

  function convertBits(data, from, to, pad) {
    let acc = 0;
    let bits = 0;
    const ret = [];
    const maxv = (1 << to) - 1;
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (value < 0 || value >> from) return null;
      acc = (acc << from) | value;
      bits += from;
      while (bits >= to) {
        bits -= to;
        ret.push((acc >> bits) & maxv);
      }
    }
    if (pad) {
      if (bits > 0) ret.push((acc << (to - bits)) & maxv);
    } else if (bits >= from || (acc << (to - bits)) & maxv) {
      return null;
    }
    return ret;
  }

  function bech32Encode(hrp, witver, program) {
    const data = [witver].concat(convertBits(Array.from(program), 8, 5, true));
    const checksum = bech32CreateChecksum(hrp, data);
    return hrp + "1" + data.concat(checksum).map((d) => CHARSET[d]).join("");
  }

  /* ---------- Blake2b-256 (for Sui) ---------- */
  // Compact blake2b for 32-byte digest only.
  function blake2b256(input) {
    const OUTLEN = 32;
    const IV = [
      0x6a09e667f3bcc908n,
      0xbb67ae8584caa73bn,
      0x3c6ef372fe94f82bn,
      0xa54ff53a5f1d36f1n,
      0x510e527fade682d1n,
      0x9b05688c2b3e6c1fn,
      0x1f83d9abfb41bd6bn,
      0x5be0cd19137e2179n,
    ];
    const SIGMA = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
      [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
      [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
      [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
      [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
      [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
      [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
      [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
      [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    ];
    const MASK = 0xffffffffffffffffn;
    function rotr64(x, n) {
      return ((x >> BigInt(n)) | (x << BigInt(64 - n))) & MASK;
    }
    function G(v, a, b, c, d, x, y) {
      v[a] = (v[a] + v[b] + x) & MASK;
      v[d] = rotr64(v[d] ^ v[a], 32);
      v[c] = (v[c] + v[d]) & MASK;
      v[b] = rotr64(v[b] ^ v[c], 24);
      v[a] = (v[a] + v[b] + y) & MASK;
      v[d] = rotr64(v[d] ^ v[a], 16);
      v[c] = (v[c] + v[d]) & MASK;
      v[b] = rotr64(v[b] ^ v[c], 63);
    }

    const h = IV.slice();
    h[0] = (h[0] ^ 0x01010000n ^ BigInt(OUTLEN)) & MASK;

    const msg = input instanceof Uint8Array ? input : new Uint8Array(input);
    let offset = 0;
    let t = 0n;
    const block = new Uint8Array(128);

    function compress(last) {
      const m = new Array(16);
      const view = new DataView(block.buffer, block.byteOffset, 128);
      for (let i = 0; i < 16; i++) {
        const lo = BigInt(view.getUint32(i * 8, true));
        const hi = BigInt(view.getUint32(i * 8 + 4, true));
        m[i] = (lo | (hi << 32n)) & MASK;
      }
      const v = h.concat(IV);
      v[12] = (v[12] ^ (t & MASK)) & MASK;
      v[13] = (v[13] ^ ((t >> 64n) & MASK)) & MASK;
      if (last) v[14] = (v[14] ^ MASK) & MASK;
      for (let r = 0; r < 12; r++) {
        const s = SIGMA[r];
        G(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
        G(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
        G(v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
        G(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
        G(v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
        G(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
        G(v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
        G(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
      }
      for (let i = 0; i < 8; i++) h[i] = (h[i] ^ v[i] ^ v[i + 8]) & MASK;
    }

    while (offset < msg.length) {
      const take = Math.min(128, msg.length - offset);
      block.fill(0);
      block.set(msg.subarray(offset, offset + take));
      t += BigInt(take);
      offset += take;
      compress(offset >= msg.length);
    }
    if (msg.length === 0) {
      block.fill(0);
      compress(true);
    }

    const out = new Uint8Array(OUTLEN);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < OUTLEN / 8; i++) {
      const w = h[i];
      odv.setUint32(i * 8, Number(w & 0xffffffffn), true);
      odv.setUint32(i * 8 + 4, Number((w >> 32n) & 0xffffffffn), true);
    }
    return out;
  }

  /* ---------- ed25519 SLIP-0010 (Sui) ---------- */
  async function masterKeyFromSeed(seed) {
    const key = new TextEncoder().encode("ed25519 seed");
    const I = await hmacSha512(key, seed);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }

  async function deriveHardened(node, index) {
    const idx = (index | 0x80000000) >>> 0;
    const data = concatBytes([new Uint8Array([0]), node.key, ser32(idx)]);
    const I = await hmacSha512(node.chainCode, data);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  }

  async function deriveSuiSeed(seed, accountIndex) {
    let node = await masterKeyFromSeed(seed);
    // m/44'/784'/account'/0'/0'
    node = await deriveHardened(node, 44);
    node = await deriveHardened(node, 784);
    node = await deriveHardened(node, accountIndex | 0);
    node = await deriveHardened(node, 0);
    node = await deriveHardened(node, 0);
    return node.key;
  }

  function suiAddressFromPubkey(pubKey) {
    const flagged = concatBytes([new Uint8Array([0x00]), pubKey]);
    const dig = blake2b256(flagged);
    return "0x" + toHex(dig);
  }

  async function deriveSuiKeys(seed, accountIndex) {
    if (!root.nacl) throw new Error("nacl missing");
    const skSeed = await deriveSuiSeed(seed, accountIndex);
    const kp = root.nacl.sign.keyPair.fromSeed(skSeed);
    return {
      address: suiAddressFromPubkey(kp.publicKey),
      publicKey: toHex(kp.publicKey),
      secretKey: toHex(kp.secretKey),
    };
  }

  /* ---------- Bitcoin BIP84 ---------- */
  async function hash160(bytes) {
    return ripemd160(await sha256(bytes));
  }

  function compressedPubkeyFromPrivateKey(privateKeyHex) {
    if (!root.ethers) throw new Error("ethers missing");
    const sk = new root.ethers.SigningKey(privateKeyHex);
    // compressed: 33 bytes
    return root.ethers.getBytes(sk.compressedPublicKey);
  }

  async function btcAddressFromPrivateKey(privateKeyHex) {
    const pub = compressedPubkeyFromPrivateKey(privateKeyHex);
    const prog = await hash160(pub);
    return bech32Encode("bc", 0, prog);
  }

  function deriveBtcWallet(seed, accountIndex) {
    if (!root.ethers) throw new Error("ethers missing");
    const hd = root.ethers.HDNodeWallet.fromSeed(seed);
    // BIP84 account 0 external chain
    const w = hd.derivePath("m/84'/0'/0'/0/" + (accountIndex | 0));
    return w;
  }

  async function deriveBitcoinKeys(seed, accountIndex) {
    const w = deriveBtcWallet(seed, accountIndex);
    const address = await btcAddressFromPrivateKey(w.privateKey);
    return {
      address,
      privateKey: w.privateKey,
      publicKey: w.publicKey,
    };
  }

  root.MultiHD = {
    deriveBitcoinKeys,
    deriveSuiKeys,
    btcAddressFromPrivateKey,
    suiAddressFromPubkey,
    blake2b256,
    ripemd160,
    bech32Encode,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
