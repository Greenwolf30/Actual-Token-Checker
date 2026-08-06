/**
 * Minimal Base58 (Bitcoin/Solana alphabet) — no deps.
 */
(function (root) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const MAP = {};
  for (let i = 0; i < ALPHABET.length; i++) MAP[ALPHABET[i]] = i;

  function encode(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (!bytes.length) return "";
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    const size = ((bytes.length - zeros) * 138) / 100 + 1 | 0;
    const b = new Uint8Array(size);
    let length = 0;
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      let j = 0;
      for (let k = size - 1; (k >= 0) && (carry !== 0 || j < length); k--, j++) {
        carry += 256 * b[k];
        b[k] = carry % 58;
        carry = (carry / 58) | 0;
      }
      length = j;
    }
    let it = size - length;
    while (it < size && b[it] === 0) it++;
    let str = "1".repeat(zeros);
    for (; it < size; it++) str += ALPHABET[b[it]];
    return str;
  }

  function decode(str) {
    if (!str) return new Uint8Array(0);
    let zeros = 0;
    while (zeros < str.length && str[zeros] === "1") zeros++;
    const size = ((str.length - zeros) * 733) / 1000 + 1 | 0;
    const b = new Uint8Array(size);
    let length = 0;
    for (let i = zeros; i < str.length; i++) {
      const val = MAP[str[i]];
      if (val === undefined) throw new Error("Invalid base58");
      let carry = val;
      let j = 0;
      for (let k = size - 1; (k >= 0) && (carry !== 0 || j < length); k--, j++) {
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

  root.Base58 = { encode, decode };
})(typeof globalThis !== "undefined" ? globalThis : window);
