(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require2() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all3) => {
    for (var name in all3)
      __defProp(target, name, { get: all3[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key2 of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key2) && key2 !== except)
          __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);

  // node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "node_modules/base64-js/index.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i = 0, len = code.length; i < len; ++i) {
        lookup[i] = code[i];
        revLookup[code.charCodeAt(i)] = i;
      }
      var i;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i2;
        for (i2 = 0; i2 < len2; i2 += 4) {
          tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i2 = start; i2 < end; i2 += 3) {
          tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "node_modules/ieee754/index.js"(exports) {
      init_buffer_shim_entry();
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i = isLE ? nBytes - 1 : 0;
        var d = isLE ? -1 : 1;
        var s = buffer[offset + i];
        i += d;
        e = s & (1 << -nBits) - 1;
        s >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        m = e & (1 << -nBits) - 1;
        e >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        if (e === 0) {
          e = 1 - eBias;
        } else if (e === eMax) {
          return m ? NaN : (s ? -1 : 1) * Infinity;
        } else {
          m = m + Math.pow(2, mLen);
          e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i = isLE ? 0 : nBytes - 1;
        var d = isLE ? 1 : -1;
        var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m = isNaN(value) ? 1 : 0;
          e = eMax;
        } else {
          e = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c = Math.pow(2, -e)) < 1) {
            e--;
            c *= 2;
          }
          if (e + eBias >= 1) {
            value += rt / c;
          } else {
            value += rt * Math.pow(2, 1 - eBias);
          }
          if (value * c >= 2) {
            e++;
            c /= 2;
          }
          if (e + eBias >= eMax) {
            m = 0;
            e = eMax;
          } else if (e + eBias >= 1) {
            m = (value * c - 1) * Math.pow(2, mLen);
            e = e + eBias;
          } else {
            m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
        }
        e = e << mLen | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
        }
        buffer[offset + i - d] |= s * 128;
      };
    }
  });

  // node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "node_modules/buffer/index.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer3;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e) {
          return false;
        }
      }
      Object.defineProperty(Buffer3.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer3.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function Buffer3(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer3.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer3.from(valueOf, encodingOrOffset, length);
        }
        const b = fromObject(value);
        if (b) return b;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer3.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer3, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer3.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer3.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer3.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i = 0; i < length; i += 1) {
          buf[i] = array[i] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer3.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer3.alloc(+length);
      }
      Buffer3.isBuffer = function isBuffer2(b) {
        return b != null && b._isBuffer === true && b !== Buffer3.prototype;
      };
      Buffer3.compare = function compare2(a, b) {
        if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
        if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
        if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a === b) return 0;
        let x = a.length;
        let y = b.length;
        for (let i = 0, len = Math.min(x, y); i < len; ++i) {
          if (a[i] !== b[i]) {
            x = a[i];
            y = b[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      Buffer3.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer3.concat = function concat2(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer3.alloc(0);
        }
        let i;
        if (length === void 0) {
          length = 0;
          for (i = 0; i < list.length; ++i) {
            length += list[i].length;
          }
        }
        const buffer = Buffer3.allocUnsafe(length);
        let pos = 0;
        for (i = 0; i < list.length; ++i) {
          let buf = list[i];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer3.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer3.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.prototype._isBuffer = true;
      function swap(b, n, m) {
        const i = b[n];
        b[n] = b[m];
        b[m] = i;
      }
      Buffer3.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) {
          swap(this, i, i + 1);
        }
        return this;
      };
      Buffer3.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(this, i, i + 3);
          swap(this, i + 1, i + 2);
        }
        return this;
      };
      Buffer3.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(this, i, i + 7);
          swap(this, i + 1, i + 6);
          swap(this, i + 2, i + 5);
          swap(this, i + 3, i + 4);
        }
        return this;
      };
      Buffer3.prototype.toString = function toString3() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
      Buffer3.prototype.equals = function equals(b) {
        if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
        if (this === b) return true;
        return Buffer3.compare(this, b) === 0;
      };
      Buffer3.prototype.inspect = function inspect4() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
      }
      Buffer3.prototype.compare = function compare2(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer3.from(target, target.offset, target.byteLength);
        }
        if (!Buffer3.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x = thisEnd - thisStart;
        let y = end - start;
        const len = Math.min(x, y);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i = 0; i < len; ++i) {
          if (thisCopy[i] !== targetCopy[i]) {
            x = thisCopy[i];
            y = targetCopy[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer3.from(val, encoding);
        }
        if (Buffer3.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i2) {
          if (indexSize === 1) {
            return buf[i2];
          } else {
            return buf.readUInt16BE(i2 * indexSize);
          }
        }
        let i;
        if (dir) {
          let foundIndex = -1;
          for (i = byteOffset; i < arrLength; i++) {
            if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < valLength; j++) {
              if (read(arr, i + j) !== read(val, j)) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i;
        for (i = 0; i < length; ++i) {
          const parsed = parseInt(string.substr(i * 2, 2), 16);
          if (numberIsNaN(parsed)) return i;
          buf[offset + i] = parsed;
        }
        return i;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer3.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer3.prototype.toJSON = function toJSON2() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i = start;
        while (i < end) {
          const firstByte = buf[i];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                fourthByte = buf[i + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i = 0;
        while (i < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i = start; i < end; ++i) {
          out += hexSliceLookupTable[buf[i]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i = 0; i < bytes.length - 1; i += 2) {
          res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
        }
        return res;
      }
      Buffer3.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer3.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul3 = 1;
        let i = 0;
        while (++i < byteLength2 && (mul3 *= 256)) {
          val += this[offset + i] * mul3;
        }
        return val;
      };
      Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul3 = 1;
        while (byteLength2 > 0 && (mul3 *= 256)) {
          val += this[offset + --byteLength2] * mul3;
        }
        return val;
      };
      Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul3 = 1;
        let i = 0;
        while (++i < byteLength2 && (mul3 *= 256)) {
          val += this[offset + i] * mul3;
        }
        mul3 *= 128;
        if (val >= mul3) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i = byteLength2;
        let mul3 = 1;
        let val = this[offset + --i];
        while (i > 0 && (mul3 *= 256)) {
          val += this[offset + --i] * mul3;
        }
        mul3 *= 128;
        if (val >= mul3) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul3 = 1;
        let i = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul3 *= 256)) {
          this[offset + i] = value / mul3 & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i = byteLength2 - 1;
        let mul3 = 1;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul3 *= 256)) {
          this[offset + i] = value / mul3 & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = 0;
        let mul3 = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul3 *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul3 >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = byteLength2 - 1;
        let mul3 = 1;
        let sub = 0;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul3 *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul3 >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer3.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i;
        if (typeof val === "number") {
          for (i = start; i < end; ++i) {
            this[i] = val;
          }
        } else {
          const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i = 0; i < end - start; ++i) {
            this[i + start] = bytes[i % len];
          }
        }
        return this;
      };
      var errors = {};
      function E(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i >= start + 4; i -= 3) {
          res = `_${val.slice(i - 3, i)}${res}`;
        }
        return `${val.slice(0, i)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
            } else {
              range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
            }
          } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i = 0; i < length; ++i) {
          codePoint = string.charCodeAt(i);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          byteArray.push(str.charCodeAt(i) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c, hi, lo;
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          if ((units -= 2) < 0) break;
          c = str.charCodeAt(i);
          hi = c >> 8;
          lo = c % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i;
        for (i = 0; i < length; ++i) {
          if (i + offset >= dst.length || i >= src.length) break;
          dst[i + offset] = src[i];
        }
        return i;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = (function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i = 0; i < 16; ++i) {
          const i16 = i * 16;
          for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j];
          }
        }
        return table;
      })();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // buffer-shim-entry.js
  var import_buffer;
  var init_buffer_shim_entry = __esm({
    "buffer-shim-entry.js"() {
      import_buffer = __toESM(require_buffer());
      if (typeof globalThis !== "undefined") globalThis.Buffer = import_buffer.Buffer;
    }
  });

  // node_modules/events/events.js
  var require_events = __commonJS({
    "node_modules/events/events.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var R = typeof Reflect === "object" ? Reflect : null;
      var ReflectApply = R && typeof R.apply === "function" ? R.apply : function ReflectApply2(target, receiver, args) {
        return Function.prototype.apply.call(target, receiver, args);
      };
      var ReflectOwnKeys;
      if (R && typeof R.ownKeys === "function") {
        ReflectOwnKeys = R.ownKeys;
      } else if (Object.getOwnPropertySymbols) {
        ReflectOwnKeys = function ReflectOwnKeys2(target) {
          return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
        };
      } else {
        ReflectOwnKeys = function ReflectOwnKeys2(target) {
          return Object.getOwnPropertyNames(target);
        };
      }
      function ProcessEmitWarning(warning) {
        if (console && console.warn) console.warn(warning);
      }
      var NumberIsNaN = Number.isNaN || function NumberIsNaN2(value) {
        return value !== value;
      };
      function EventEmitter2() {
        EventEmitter2.init.call(this);
      }
      module.exports = EventEmitter2;
      module.exports.once = once;
      EventEmitter2.EventEmitter = EventEmitter2;
      EventEmitter2.prototype._events = void 0;
      EventEmitter2.prototype._eventsCount = 0;
      EventEmitter2.prototype._maxListeners = void 0;
      var defaultMaxListeners = 10;
      function checkListener(listener) {
        if (typeof listener !== "function") {
          throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
        }
      }
      Object.defineProperty(EventEmitter2, "defaultMaxListeners", {
        enumerable: true,
        get: function() {
          return defaultMaxListeners;
        },
        set: function(arg) {
          if (typeof arg !== "number" || arg < 0 || NumberIsNaN(arg)) {
            throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + ".");
          }
          defaultMaxListeners = arg;
        }
      });
      EventEmitter2.init = function() {
        if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
          this._events = /* @__PURE__ */ Object.create(null);
          this._eventsCount = 0;
        }
        this._maxListeners = this._maxListeners || void 0;
      };
      EventEmitter2.prototype.setMaxListeners = function setMaxListeners(n) {
        if (typeof n !== "number" || n < 0 || NumberIsNaN(n)) {
          throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + ".");
        }
        this._maxListeners = n;
        return this;
      };
      function _getMaxListeners(that) {
        if (that._maxListeners === void 0)
          return EventEmitter2.defaultMaxListeners;
        return that._maxListeners;
      }
      EventEmitter2.prototype.getMaxListeners = function getMaxListeners() {
        return _getMaxListeners(this);
      };
      EventEmitter2.prototype.emit = function emit(type) {
        var args = [];
        for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
        var doError = type === "error";
        var events = this._events;
        if (events !== void 0)
          doError = doError && events.error === void 0;
        else if (!doError)
          return false;
        if (doError) {
          var er;
          if (args.length > 0)
            er = args[0];
          if (er instanceof Error) {
            throw er;
          }
          var err = new Error("Unhandled error." + (er ? " (" + er.message + ")" : ""));
          err.context = er;
          throw err;
        }
        var handler = events[type];
        if (handler === void 0)
          return false;
        if (typeof handler === "function") {
          ReflectApply(handler, this, args);
        } else {
          var len = handler.length;
          var listeners = arrayClone(handler, len);
          for (var i = 0; i < len; ++i)
            ReflectApply(listeners[i], this, args);
        }
        return true;
      };
      function _addListener(target, type, listener, prepend) {
        var m;
        var events;
        var existing;
        checkListener(listener);
        events = target._events;
        if (events === void 0) {
          events = target._events = /* @__PURE__ */ Object.create(null);
          target._eventsCount = 0;
        } else {
          if (events.newListener !== void 0) {
            target.emit(
              "newListener",
              type,
              listener.listener ? listener.listener : listener
            );
            events = target._events;
          }
          existing = events[type];
        }
        if (existing === void 0) {
          existing = events[type] = listener;
          ++target._eventsCount;
        } else {
          if (typeof existing === "function") {
            existing = events[type] = prepend ? [listener, existing] : [existing, listener];
          } else if (prepend) {
            existing.unshift(listener);
          } else {
            existing.push(listener);
          }
          m = _getMaxListeners(target);
          if (m > 0 && existing.length > m && !existing.warned) {
            existing.warned = true;
            var w = new Error("Possible EventEmitter memory leak detected. " + existing.length + " " + String(type) + " listeners added. Use emitter.setMaxListeners() to increase limit");
            w.name = "MaxListenersExceededWarning";
            w.emitter = target;
            w.type = type;
            w.count = existing.length;
            ProcessEmitWarning(w);
          }
        }
        return target;
      }
      EventEmitter2.prototype.addListener = function addListener(type, listener) {
        return _addListener(this, type, listener, false);
      };
      EventEmitter2.prototype.on = EventEmitter2.prototype.addListener;
      EventEmitter2.prototype.prependListener = function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };
      function onceWrapper() {
        if (!this.fired) {
          this.target.removeListener(this.type, this.wrapFn);
          this.fired = true;
          if (arguments.length === 0)
            return this.listener.call(this.target);
          return this.listener.apply(this.target, arguments);
        }
      }
      function _onceWrap(target, type, listener) {
        var state = { fired: false, wrapFn: void 0, target, type, listener };
        var wrapped = onceWrapper.bind(state);
        wrapped.listener = listener;
        state.wrapFn = wrapped;
        return wrapped;
      }
      EventEmitter2.prototype.once = function once2(type, listener) {
        checkListener(listener);
        this.on(type, _onceWrap(this, type, listener));
        return this;
      };
      EventEmitter2.prototype.prependOnceListener = function prependOnceListener(type, listener) {
        checkListener(listener);
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };
      EventEmitter2.prototype.removeListener = function removeListener(type, listener) {
        var list, events, position, i, originalListener;
        checkListener(listener);
        events = this._events;
        if (events === void 0)
          return this;
        list = events[type];
        if (list === void 0)
          return this;
        if (list === listener || list.listener === listener) {
          if (--this._eventsCount === 0)
            this._events = /* @__PURE__ */ Object.create(null);
          else {
            delete events[type];
            if (events.removeListener)
              this.emit("removeListener", type, list.listener || listener);
          }
        } else if (typeof list !== "function") {
          position = -1;
          for (i = list.length - 1; i >= 0; i--) {
            if (list[i] === listener || list[i].listener === listener) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }
          if (position < 0)
            return this;
          if (position === 0)
            list.shift();
          else {
            spliceOne(list, position);
          }
          if (list.length === 1)
            events[type] = list[0];
          if (events.removeListener !== void 0)
            this.emit("removeListener", type, originalListener || listener);
        }
        return this;
      };
      EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
      EventEmitter2.prototype.removeAllListeners = function removeAllListeners(type) {
        var listeners, events, i;
        events = this._events;
        if (events === void 0)
          return this;
        if (events.removeListener === void 0) {
          if (arguments.length === 0) {
            this._events = /* @__PURE__ */ Object.create(null);
            this._eventsCount = 0;
          } else if (events[type] !== void 0) {
            if (--this._eventsCount === 0)
              this._events = /* @__PURE__ */ Object.create(null);
            else
              delete events[type];
          }
          return this;
        }
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          var key2;
          for (i = 0; i < keys.length; ++i) {
            key2 = keys[i];
            if (key2 === "removeListener") continue;
            this.removeAllListeners(key2);
          }
          this.removeAllListeners("removeListener");
          this._events = /* @__PURE__ */ Object.create(null);
          this._eventsCount = 0;
          return this;
        }
        listeners = events[type];
        if (typeof listeners === "function") {
          this.removeListener(type, listeners);
        } else if (listeners !== void 0) {
          for (i = listeners.length - 1; i >= 0; i--) {
            this.removeListener(type, listeners[i]);
          }
        }
        return this;
      };
      function _listeners(target, type, unwrap) {
        var events = target._events;
        if (events === void 0)
          return [];
        var evlistener = events[type];
        if (evlistener === void 0)
          return [];
        if (typeof evlistener === "function")
          return unwrap ? [evlistener.listener || evlistener] : [evlistener];
        return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
      }
      EventEmitter2.prototype.listeners = function listeners(type) {
        return _listeners(this, type, true);
      };
      EventEmitter2.prototype.rawListeners = function rawListeners(type) {
        return _listeners(this, type, false);
      };
      EventEmitter2.listenerCount = function(emitter, type) {
        if (typeof emitter.listenerCount === "function") {
          return emitter.listenerCount(type);
        } else {
          return listenerCount.call(emitter, type);
        }
      };
      EventEmitter2.prototype.listenerCount = listenerCount;
      function listenerCount(type) {
        var events = this._events;
        if (events !== void 0) {
          var evlistener = events[type];
          if (typeof evlistener === "function") {
            return 1;
          } else if (evlistener !== void 0) {
            return evlistener.length;
          }
        }
        return 0;
      }
      EventEmitter2.prototype.eventNames = function eventNames() {
        return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
      };
      function arrayClone(arr, n) {
        var copy = new Array(n);
        for (var i = 0; i < n; ++i)
          copy[i] = arr[i];
        return copy;
      }
      function spliceOne(list, index) {
        for (; index + 1 < list.length; index++)
          list[index] = list[index + 1];
        list.pop();
      }
      function unwrapListeners(arr) {
        var ret = new Array(arr.length);
        for (var i = 0; i < ret.length; ++i) {
          ret[i] = arr[i].listener || arr[i];
        }
        return ret;
      }
      function once(emitter, name) {
        return new Promise(function(resolve, reject) {
          function errorListener(err) {
            emitter.removeListener(name, resolver);
            reject(err);
          }
          function resolver() {
            if (typeof emitter.removeListener === "function") {
              emitter.removeListener("error", errorListener);
            }
            resolve([].slice.call(arguments));
          }
          ;
          eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
          if (name !== "error") {
            addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
          }
        });
      }
      function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
        if (typeof emitter.on === "function") {
          eventTargetAgnosticAddListener(emitter, "error", handler, flags);
        }
      }
      function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
        if (typeof emitter.on === "function") {
          if (flags.once) {
            emitter.once(name, listener);
          } else {
            emitter.on(name, listener);
          }
        } else if (typeof emitter.addEventListener === "function") {
          emitter.addEventListener(name, function wrapListener(arg) {
            if (flags.once) {
              emitter.removeEventListener(name, wrapListener);
            }
            listener(arg);
          });
        } else {
          throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
        }
      }
    }
  });

  // node_modules/semver/internal/constants.js
  var require_constants = __commonJS({
    "node_modules/semver/internal/constants.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SEMVER_SPEC_VERSION = "2.0.0";
      var MAX_LENGTH = 256;
      var MAX_SAFE_INTEGER3 = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
      9007199254740991;
      var MAX_SAFE_COMPONENT_LENGTH = 16;
      var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
      var RELEASE_TYPES = [
        "major",
        "premajor",
        "minor",
        "preminor",
        "patch",
        "prepatch",
        "prerelease"
      ];
      module.exports = {
        MAX_LENGTH,
        MAX_SAFE_COMPONENT_LENGTH,
        MAX_SAFE_BUILD_LENGTH,
        MAX_SAFE_INTEGER: MAX_SAFE_INTEGER3,
        RELEASE_TYPES,
        SEMVER_SPEC_VERSION,
        FLAG_INCLUDE_PRERELEASE: 1,
        FLAG_LOOSE: 2
      };
    }
  });

  // node_modules/semver/internal/debug.js
  var require_debug = __commonJS({
    "node_modules/semver/internal/debug.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
      };
      module.exports = debug;
    }
  });

  // node_modules/semver/internal/re.js
  var require_re = __commonJS({
    "node_modules/semver/internal/re.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var {
        MAX_SAFE_COMPONENT_LENGTH,
        MAX_SAFE_BUILD_LENGTH,
        MAX_LENGTH
      } = require_constants();
      var debug = require_debug();
      exports = module.exports = {};
      var re = exports.re = [];
      var safeRe = exports.safeRe = [];
      var src = exports.src = [];
      var safeSrc = exports.safeSrc = [];
      var t = exports.t = {};
      var R = 0;
      var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
      var safeRegexReplacements = [
        ["\\s", 1],
        ["\\d", MAX_LENGTH],
        [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
      ];
      var makeSafeRegex = (value) => {
        for (const [token, max] of safeRegexReplacements) {
          value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
        }
        return value;
      };
      var createToken = (name, value, isGlobal) => {
        const safe = makeSafeRegex(value);
        const index = R++;
        debug(name, index, value);
        t[name] = index;
        src[index] = value;
        safeSrc[index] = safe;
        re[index] = new RegExp(value, isGlobal ? "g" : void 0);
        safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
      };
      createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
      createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
      createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
      createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
      createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
      createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
      createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
      createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
      createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
      createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
      createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
      createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
      createToken("FULL", `^${src[t.FULLPLAIN]}$`);
      createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
      createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
      createToken("GTLT", "((?:<|>)?=?)");
      createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
      createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
      createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
      createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
      createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
      createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
      createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
      createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
      createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
      createToken("COERCERTL", src[t.COERCE], true);
      createToken("COERCERTLFULL", src[t.COERCEFULL], true);
      createToken("LONETILDE", "(?:~>?)");
      createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
      exports.tildeTrimReplace = "$1~";
      createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
      createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
      createToken("LONECARET", "(?:\\^)");
      createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
      exports.caretTrimReplace = "$1^";
      createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
      createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
      createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
      createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
      createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
      exports.comparatorTrimReplace = "$1$2$3";
      createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
      createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
      createToken("STAR", "(<|>)?=?\\s*\\*");
      createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
      createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
    }
  });

  // node_modules/semver/internal/parse-options.js
  var require_parse_options = __commonJS({
    "node_modules/semver/internal/parse-options.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var looseOption = Object.freeze({ loose: true });
      var emptyOpts = Object.freeze({});
      var parseOptions = (options) => {
        if (!options) {
          return emptyOpts;
        }
        if (typeof options !== "object") {
          return looseOption;
        }
        return options;
      };
      module.exports = parseOptions;
    }
  });

  // node_modules/semver/internal/identifiers.js
  var require_identifiers = __commonJS({
    "node_modules/semver/internal/identifiers.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var numeric = /^[0-9]+$/;
      var compareIdentifiers = (a, b) => {
        if (typeof a === "number" && typeof b === "number") {
          return a === b ? 0 : a < b ? -1 : 1;
        }
        const anum = numeric.test(a);
        const bnum = numeric.test(b);
        if (anum && bnum) {
          a = +a;
          b = +b;
        }
        return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
      };
      var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
      module.exports = {
        compareIdentifiers,
        rcompareIdentifiers
      };
    }
  });

  // node_modules/semver/classes/semver.js
  var require_semver = __commonJS({
    "node_modules/semver/classes/semver.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var debug = require_debug();
      var { MAX_LENGTH, MAX_SAFE_INTEGER: MAX_SAFE_INTEGER3 } = require_constants();
      var { safeRe: re, t } = require_re();
      var parseOptions = require_parse_options();
      var { compareIdentifiers } = require_identifiers();
      var SemVer = class _SemVer {
        constructor(version11, options) {
          options = parseOptions(options);
          if (version11 instanceof _SemVer) {
            if (version11.loose === !!options.loose && version11.includePrerelease === !!options.includePrerelease) {
              return version11;
            } else {
              version11 = version11.version;
            }
          } else if (typeof version11 !== "string") {
            throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version11}".`);
          }
          if (version11.length > MAX_LENGTH) {
            throw new TypeError(
              `version is longer than ${MAX_LENGTH} characters`
            );
          }
          debug("SemVer", version11, options);
          this.options = options;
          this.loose = !!options.loose;
          this.includePrerelease = !!options.includePrerelease;
          const m = version11.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
          if (!m) {
            throw new TypeError(`Invalid Version: ${version11}`);
          }
          this.raw = version11;
          this.major = +m[1];
          this.minor = +m[2];
          this.patch = +m[3];
          if (this.major > MAX_SAFE_INTEGER3 || this.major < 0) {
            throw new TypeError("Invalid major version");
          }
          if (this.minor > MAX_SAFE_INTEGER3 || this.minor < 0) {
            throw new TypeError("Invalid minor version");
          }
          if (this.patch > MAX_SAFE_INTEGER3 || this.patch < 0) {
            throw new TypeError("Invalid patch version");
          }
          if (!m[4]) {
            this.prerelease = [];
          } else {
            this.prerelease = m[4].split(".").map((id3) => {
              if (/^[0-9]+$/.test(id3)) {
                const num = +id3;
                if (num >= 0 && num < MAX_SAFE_INTEGER3) {
                  return num;
                }
              }
              return id3;
            });
          }
          this.build = m[5] ? m[5].split(".") : [];
          this.format();
        }
        format() {
          this.version = `${this.major}.${this.minor}.${this.patch}`;
          if (this.prerelease.length) {
            this.version += `-${this.prerelease.join(".")}`;
          }
          return this.version;
        }
        toString() {
          return this.version;
        }
        compare(other) {
          debug("SemVer.compare", this.version, this.options, other);
          if (!(other instanceof _SemVer)) {
            if (typeof other === "string" && other === this.version) {
              return 0;
            }
            other = new _SemVer(other, this.options);
          }
          if (other.version === this.version) {
            return 0;
          }
          return this.compareMain(other) || this.comparePre(other);
        }
        compareMain(other) {
          if (!(other instanceof _SemVer)) {
            other = new _SemVer(other, this.options);
          }
          if (this.major < other.major) {
            return -1;
          }
          if (this.major > other.major) {
            return 1;
          }
          if (this.minor < other.minor) {
            return -1;
          }
          if (this.minor > other.minor) {
            return 1;
          }
          if (this.patch < other.patch) {
            return -1;
          }
          if (this.patch > other.patch) {
            return 1;
          }
          return 0;
        }
        comparePre(other) {
          if (!(other instanceof _SemVer)) {
            other = new _SemVer(other, this.options);
          }
          if (this.prerelease.length && !other.prerelease.length) {
            return -1;
          } else if (!this.prerelease.length && other.prerelease.length) {
            return 1;
          } else if (!this.prerelease.length && !other.prerelease.length) {
            return 0;
          }
          let i = 0;
          do {
            const a = this.prerelease[i];
            const b = other.prerelease[i];
            debug("prerelease compare", i, a, b);
            if (a === void 0 && b === void 0) {
              return 0;
            } else if (b === void 0) {
              return 1;
            } else if (a === void 0) {
              return -1;
            } else if (a === b) {
              continue;
            } else {
              return compareIdentifiers(a, b);
            }
          } while (++i);
        }
        compareBuild(other) {
          if (!(other instanceof _SemVer)) {
            other = new _SemVer(other, this.options);
          }
          let i = 0;
          do {
            const a = this.build[i];
            const b = other.build[i];
            debug("build compare", i, a, b);
            if (a === void 0 && b === void 0) {
              return 0;
            } else if (b === void 0) {
              return 1;
            } else if (a === void 0) {
              return -1;
            } else if (a === b) {
              continue;
            } else {
              return compareIdentifiers(a, b);
            }
          } while (++i);
        }
        // preminor will bump the version up to the next minor release, and immediately
        // down to pre-release. premajor and prepatch work the same way.
        inc(release, identifier, identifierBase) {
          if (release.startsWith("pre")) {
            if (!identifier && identifierBase === false) {
              throw new Error("invalid increment argument: identifier is empty");
            }
            if (identifier) {
              const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
              if (!match || match[1] !== identifier) {
                throw new Error(`invalid identifier: ${identifier}`);
              }
            }
          }
          switch (release) {
            case "premajor":
              this.prerelease.length = 0;
              this.patch = 0;
              this.minor = 0;
              this.major++;
              this.inc("pre", identifier, identifierBase);
              break;
            case "preminor":
              this.prerelease.length = 0;
              this.patch = 0;
              this.minor++;
              this.inc("pre", identifier, identifierBase);
              break;
            case "prepatch":
              this.prerelease.length = 0;
              this.inc("patch", identifier, identifierBase);
              this.inc("pre", identifier, identifierBase);
              break;
            // If the input is a non-prerelease version, this acts the same as
            // prepatch.
            case "prerelease":
              if (this.prerelease.length === 0) {
                this.inc("patch", identifier, identifierBase);
              }
              this.inc("pre", identifier, identifierBase);
              break;
            case "release":
              if (this.prerelease.length === 0) {
                throw new Error(`version ${this.raw} is not a prerelease`);
              }
              this.prerelease.length = 0;
              break;
            case "major":
              if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
                this.major++;
              }
              this.minor = 0;
              this.patch = 0;
              this.prerelease = [];
              break;
            case "minor":
              if (this.patch !== 0 || this.prerelease.length === 0) {
                this.minor++;
              }
              this.patch = 0;
              this.prerelease = [];
              break;
            case "patch":
              if (this.prerelease.length === 0) {
                this.patch++;
              }
              this.prerelease = [];
              break;
            // This probably shouldn't be used publicly.
            // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
            case "pre": {
              const base2 = Number(identifierBase) ? 1 : 0;
              if (this.prerelease.length === 0) {
                this.prerelease = [base2];
              } else {
                let i = this.prerelease.length;
                while (--i >= 0) {
                  if (typeof this.prerelease[i] === "number") {
                    this.prerelease[i]++;
                    i = -2;
                  }
                }
                if (i === -1) {
                  if (identifier === this.prerelease.join(".") && identifierBase === false) {
                    throw new Error("invalid increment argument: identifier already exists");
                  }
                  this.prerelease.push(base2);
                }
              }
              if (identifier) {
                let prerelease = [identifier, base2];
                if (identifierBase === false) {
                  prerelease = [identifier];
                }
                if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                  if (isNaN(this.prerelease[1])) {
                    this.prerelease = prerelease;
                  }
                } else {
                  this.prerelease = prerelease;
                }
              }
              break;
            }
            default:
              throw new Error(`invalid increment argument: ${release}`);
          }
          this.raw = this.format();
          if (this.build.length) {
            this.raw += `+${this.build.join(".")}`;
          }
          return this;
        }
      };
      module.exports = SemVer;
    }
  });

  // node_modules/semver/functions/parse.js
  var require_parse = __commonJS({
    "node_modules/semver/functions/parse.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var parse3 = (version11, options, throwErrors = false) => {
        if (version11 instanceof SemVer) {
          return version11;
        }
        try {
          return new SemVer(version11, options);
        } catch (er) {
          if (!throwErrors) {
            return null;
          }
          throw er;
        }
      };
      module.exports = parse3;
    }
  });

  // node_modules/semver/functions/valid.js
  var require_valid = __commonJS({
    "node_modules/semver/functions/valid.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var parse3 = require_parse();
      var valid = (version11, options) => {
        const v = parse3(version11, options);
        return v ? v.version : null;
      };
      module.exports = valid;
    }
  });

  // node_modules/semver/functions/clean.js
  var require_clean = __commonJS({
    "node_modules/semver/functions/clean.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var parse3 = require_parse();
      var clean = (version11, options) => {
        const s = parse3(version11.trim().replace(/^[=v]+/, ""), options);
        return s ? s.version : null;
      };
      module.exports = clean;
    }
  });

  // node_modules/semver/functions/inc.js
  var require_inc = __commonJS({
    "node_modules/semver/functions/inc.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var inc = (version11, release, options, identifier, identifierBase) => {
        if (typeof options === "string") {
          identifierBase = identifier;
          identifier = options;
          options = void 0;
        }
        try {
          return new SemVer(
            version11 instanceof SemVer ? version11.version : version11,
            options
          ).inc(release, identifier, identifierBase).version;
        } catch (er) {
          return null;
        }
      };
      module.exports = inc;
    }
  });

  // node_modules/semver/functions/diff.js
  var require_diff = __commonJS({
    "node_modules/semver/functions/diff.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var parse3 = require_parse();
      var diff = (version1, version22) => {
        const v1 = parse3(version1, null, true);
        const v2 = parse3(version22, null, true);
        const comparison = v1.compare(v2);
        if (comparison === 0) {
          return null;
        }
        const v1Higher = comparison > 0;
        const highVersion = v1Higher ? v1 : v2;
        const lowVersion = v1Higher ? v2 : v1;
        const highHasPre = !!highVersion.prerelease.length;
        const lowHasPre = !!lowVersion.prerelease.length;
        if (lowHasPre && !highHasPre) {
          if (!lowVersion.patch && !lowVersion.minor) {
            return "major";
          }
          if (lowVersion.compareMain(highVersion) === 0) {
            if (lowVersion.minor && !lowVersion.patch) {
              return "minor";
            }
            return "patch";
          }
        }
        const prefix = highHasPre ? "pre" : "";
        if (v1.major !== v2.major) {
          return prefix + "major";
        }
        if (v1.minor !== v2.minor) {
          return prefix + "minor";
        }
        if (v1.patch !== v2.patch) {
          return prefix + "patch";
        }
        return "prerelease";
      };
      module.exports = diff;
    }
  });

  // node_modules/semver/functions/major.js
  var require_major = __commonJS({
    "node_modules/semver/functions/major.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var major = (a, loose) => new SemVer(a, loose).major;
      module.exports = major;
    }
  });

  // node_modules/semver/functions/minor.js
  var require_minor = __commonJS({
    "node_modules/semver/functions/minor.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var minor = (a, loose) => new SemVer(a, loose).minor;
      module.exports = minor;
    }
  });

  // node_modules/semver/functions/patch.js
  var require_patch = __commonJS({
    "node_modules/semver/functions/patch.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var patch = (a, loose) => new SemVer(a, loose).patch;
      module.exports = patch;
    }
  });

  // node_modules/semver/functions/prerelease.js
  var require_prerelease = __commonJS({
    "node_modules/semver/functions/prerelease.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var parse3 = require_parse();
      var prerelease = (version11, options) => {
        const parsed = parse3(version11, options);
        return parsed && parsed.prerelease.length ? parsed.prerelease : null;
      };
      module.exports = prerelease;
    }
  });

  // node_modules/semver/functions/compare.js
  var require_compare = __commonJS({
    "node_modules/semver/functions/compare.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var compare2 = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
      module.exports = compare2;
    }
  });

  // node_modules/semver/functions/rcompare.js
  var require_rcompare = __commonJS({
    "node_modules/semver/functions/rcompare.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var rcompare = (a, b, loose) => compare2(b, a, loose);
      module.exports = rcompare;
    }
  });

  // node_modules/semver/functions/compare-loose.js
  var require_compare_loose = __commonJS({
    "node_modules/semver/functions/compare-loose.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var compareLoose = (a, b) => compare2(a, b, true);
      module.exports = compareLoose;
    }
  });

  // node_modules/semver/functions/compare-build.js
  var require_compare_build = __commonJS({
    "node_modules/semver/functions/compare-build.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var compareBuild = (a, b, loose) => {
        const versionA = new SemVer(a, loose);
        const versionB = new SemVer(b, loose);
        return versionA.compare(versionB) || versionA.compareBuild(versionB);
      };
      module.exports = compareBuild;
    }
  });

  // node_modules/semver/functions/sort.js
  var require_sort = __commonJS({
    "node_modules/semver/functions/sort.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compareBuild = require_compare_build();
      var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
      module.exports = sort;
    }
  });

  // node_modules/semver/functions/rsort.js
  var require_rsort = __commonJS({
    "node_modules/semver/functions/rsort.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compareBuild = require_compare_build();
      var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
      module.exports = rsort;
    }
  });

  // node_modules/semver/functions/gt.js
  var require_gt = __commonJS({
    "node_modules/semver/functions/gt.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var gt = (a, b, loose) => compare2(a, b, loose) > 0;
      module.exports = gt;
    }
  });

  // node_modules/semver/functions/lt.js
  var require_lt = __commonJS({
    "node_modules/semver/functions/lt.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var lt = (a, b, loose) => compare2(a, b, loose) < 0;
      module.exports = lt;
    }
  });

  // node_modules/semver/functions/eq.js
  var require_eq = __commonJS({
    "node_modules/semver/functions/eq.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var eq4 = (a, b, loose) => compare2(a, b, loose) === 0;
      module.exports = eq4;
    }
  });

  // node_modules/semver/functions/neq.js
  var require_neq = __commonJS({
    "node_modules/semver/functions/neq.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var neq = (a, b, loose) => compare2(a, b, loose) !== 0;
      module.exports = neq;
    }
  });

  // node_modules/semver/functions/gte.js
  var require_gte = __commonJS({
    "node_modules/semver/functions/gte.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var gte = (a, b, loose) => compare2(a, b, loose) >= 0;
      module.exports = gte;
    }
  });

  // node_modules/semver/functions/lte.js
  var require_lte = __commonJS({
    "node_modules/semver/functions/lte.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var compare2 = require_compare();
      var lte = (a, b, loose) => compare2(a, b, loose) <= 0;
      module.exports = lte;
    }
  });

  // node_modules/semver/functions/cmp.js
  var require_cmp = __commonJS({
    "node_modules/semver/functions/cmp.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var eq4 = require_eq();
      var neq = require_neq();
      var gt = require_gt();
      var gte = require_gte();
      var lt = require_lt();
      var lte = require_lte();
      var cmp = (a, op, b, loose) => {
        switch (op) {
          case "===":
            if (typeof a === "object") {
              a = a.version;
            }
            if (typeof b === "object") {
              b = b.version;
            }
            return a === b;
          case "!==":
            if (typeof a === "object") {
              a = a.version;
            }
            if (typeof b === "object") {
              b = b.version;
            }
            return a !== b;
          case "":
          case "=":
          case "==":
            return eq4(a, b, loose);
          case "!=":
            return neq(a, b, loose);
          case ">":
            return gt(a, b, loose);
          case ">=":
            return gte(a, b, loose);
          case "<":
            return lt(a, b, loose);
          case "<=":
            return lte(a, b, loose);
          default:
            throw new TypeError(`Invalid operator: ${op}`);
        }
      };
      module.exports = cmp;
    }
  });

  // node_modules/semver/functions/coerce.js
  var require_coerce = __commonJS({
    "node_modules/semver/functions/coerce.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var parse3 = require_parse();
      var { safeRe: re, t } = require_re();
      var coerce = (version11, options) => {
        if (version11 instanceof SemVer) {
          return version11;
        }
        if (typeof version11 === "number") {
          version11 = String(version11);
        }
        if (typeof version11 !== "string") {
          return null;
        }
        options = options || {};
        let match = null;
        if (!options.rtl) {
          match = version11.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
        } else {
          const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
          let next;
          while ((next = coerceRtlRegex.exec(version11)) && (!match || match.index + match[0].length !== version11.length)) {
            if (!match || next.index + next[0].length !== match.index + match[0].length) {
              match = next;
            }
            coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
          }
          coerceRtlRegex.lastIndex = -1;
        }
        if (match === null) {
          return null;
        }
        const major = match[2];
        const minor = match[3] || "0";
        const patch = match[4] || "0";
        const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
        const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
        return parse3(`${major}.${minor}.${patch}${prerelease}${build}`, options);
      };
      module.exports = coerce;
    }
  });

  // node_modules/semver/internal/lrucache.js
  var require_lrucache = __commonJS({
    "node_modules/semver/internal/lrucache.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var LRUCache = class {
        constructor() {
          this.max = 1e3;
          this.map = /* @__PURE__ */ new Map();
        }
        get(key2) {
          const value = this.map.get(key2);
          if (value === void 0) {
            return void 0;
          } else {
            this.map.delete(key2);
            this.map.set(key2, value);
            return value;
          }
        }
        delete(key2) {
          return this.map.delete(key2);
        }
        set(key2, value) {
          const deleted = this.delete(key2);
          if (!deleted && value !== void 0) {
            if (this.map.size >= this.max) {
              const firstKey = this.map.keys().next().value;
              this.delete(firstKey);
            }
            this.map.set(key2, value);
          }
          return this;
        }
      };
      module.exports = LRUCache;
    }
  });

  // node_modules/semver/classes/range.js
  var require_range = __commonJS({
    "node_modules/semver/classes/range.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SPACE_CHARACTERS = /\s+/g;
      var Range = class _Range {
        constructor(range, options) {
          options = parseOptions(options);
          if (range instanceof _Range) {
            if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
              return range;
            } else {
              return new _Range(range.raw, options);
            }
          }
          if (range instanceof Comparator) {
            this.raw = range.value;
            this.set = [[range]];
            this.formatted = void 0;
            return this;
          }
          this.options = options;
          this.loose = !!options.loose;
          this.includePrerelease = !!options.includePrerelease;
          this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
          this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
          if (!this.set.length) {
            throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
          }
          if (this.set.length > 1) {
            const first = this.set[0];
            this.set = this.set.filter((c) => !isNullSet(c[0]));
            if (this.set.length === 0) {
              this.set = [first];
            } else if (this.set.length > 1) {
              for (const c of this.set) {
                if (c.length === 1 && isAny(c[0])) {
                  this.set = [c];
                  break;
                }
              }
            }
          }
          this.formatted = void 0;
        }
        get range() {
          if (this.formatted === void 0) {
            this.formatted = "";
            for (let i = 0; i < this.set.length; i++) {
              if (i > 0) {
                this.formatted += "||";
              }
              const comps = this.set[i];
              for (let k = 0; k < comps.length; k++) {
                if (k > 0) {
                  this.formatted += " ";
                }
                this.formatted += comps[k].toString().trim();
              }
            }
          }
          return this.formatted;
        }
        format() {
          return this.range;
        }
        toString() {
          return this.range;
        }
        parseRange(range) {
          const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
          const memoKey = memoOpts + ":" + range;
          const cached = cache.get(memoKey);
          if (cached) {
            return cached;
          }
          const loose = this.options.loose;
          const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
          range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
          debug("hyphen replace", range);
          range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
          debug("comparator trim", range);
          range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
          debug("tilde trim", range);
          range = range.replace(re[t.CARETTRIM], caretTrimReplace);
          debug("caret trim", range);
          let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
          if (loose) {
            rangeList = rangeList.filter((comp) => {
              debug("loose invalid filter", comp, this.options);
              return !!comp.match(re[t.COMPARATORLOOSE]);
            });
          }
          debug("range list", rangeList);
          const rangeMap = /* @__PURE__ */ new Map();
          const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
          for (const comp of comparators) {
            if (isNullSet(comp)) {
              return [comp];
            }
            rangeMap.set(comp.value, comp);
          }
          if (rangeMap.size > 1 && rangeMap.has("")) {
            rangeMap.delete("");
          }
          const result = [...rangeMap.values()];
          cache.set(memoKey, result);
          return result;
        }
        intersects(range, options) {
          if (!(range instanceof _Range)) {
            throw new TypeError("a Range is required");
          }
          return this.set.some((thisComparators) => {
            return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
              return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
                return rangeComparators.every((rangeComparator) => {
                  return thisComparator.intersects(rangeComparator, options);
                });
              });
            });
          });
        }
        // if ANY of the sets match ALL of its comparators, then pass
        test(version11) {
          if (!version11) {
            return false;
          }
          if (typeof version11 === "string") {
            try {
              version11 = new SemVer(version11, this.options);
            } catch (er) {
              return false;
            }
          }
          for (let i = 0; i < this.set.length; i++) {
            if (testSet(this.set[i], version11, this.options)) {
              return true;
            }
          }
          return false;
        }
      };
      module.exports = Range;
      var LRU = require_lrucache();
      var cache = new LRU();
      var parseOptions = require_parse_options();
      var Comparator = require_comparator();
      var debug = require_debug();
      var SemVer = require_semver();
      var {
        safeRe: re,
        t,
        comparatorTrimReplace,
        tildeTrimReplace,
        caretTrimReplace
      } = require_re();
      var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
      var isNullSet = (c) => c.value === "<0.0.0-0";
      var isAny = (c) => c.value === "";
      var isSatisfiable = (comparators, options) => {
        let result = true;
        const remainingComparators = comparators.slice();
        let testComparator = remainingComparators.pop();
        while (result && remainingComparators.length) {
          result = remainingComparators.every((otherComparator) => {
            return testComparator.intersects(otherComparator, options);
          });
          testComparator = remainingComparators.pop();
        }
        return result;
      };
      var parseComparator = (comp, options) => {
        comp = comp.replace(re[t.BUILD], "");
        debug("comp", comp, options);
        comp = replaceCarets(comp, options);
        debug("caret", comp);
        comp = replaceTildes(comp, options);
        debug("tildes", comp);
        comp = replaceXRanges(comp, options);
        debug("xrange", comp);
        comp = replaceStars(comp, options);
        debug("stars", comp);
        return comp;
      };
      var isX = (id3) => !id3 || id3.toLowerCase() === "x" || id3 === "*";
      var replaceTildes = (comp, options) => {
        return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
      };
      var replaceTilde = (comp, options) => {
        const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
        return comp.replace(r, (_, M, m, p, pr) => {
          debug("tilde", comp, _, M, m, p, pr);
          let ret;
          if (isX(M)) {
            ret = "";
          } else if (isX(m)) {
            ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
          } else if (isX(p)) {
            ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
          } else if (pr) {
            debug("replaceTilde pr", pr);
            ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
          }
          debug("tilde return", ret);
          return ret;
        });
      };
      var replaceCarets = (comp, options) => {
        return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
      };
      var replaceCaret = (comp, options) => {
        debug("caret", comp, options);
        const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
        const z = options.includePrerelease ? "-0" : "";
        return comp.replace(r, (_, M, m, p, pr) => {
          debug("caret", comp, _, M, m, p, pr);
          let ret;
          if (isX(M)) {
            ret = "";
          } else if (isX(m)) {
            ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
          } else if (isX(p)) {
            if (M === "0") {
              ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
            } else {
              ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
            }
          } else if (pr) {
            debug("replaceCaret pr", pr);
            if (M === "0") {
              if (m === "0") {
                ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
              } else {
                ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
              }
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
            }
          } else {
            debug("no pr");
            if (M === "0") {
              if (m === "0") {
                ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
              } else {
                ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
              }
            } else {
              ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
            }
          }
          debug("caret return", ret);
          return ret;
        });
      };
      var replaceXRanges = (comp, options) => {
        debug("replaceXRanges", comp, options);
        return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
      };
      var replaceXRange = (comp, options) => {
        comp = comp.trim();
        const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
        return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
          debug("xRange", comp, ret, gtlt, M, m, p, pr);
          const xM = isX(M);
          const xm = xM || isX(m);
          const xp = xm || isX(p);
          const anyX = xp;
          if (gtlt === "=" && anyX) {
            gtlt = "";
          }
          pr = options.includePrerelease ? "-0" : "";
          if (xM) {
            if (gtlt === ">" || gtlt === "<") {
              ret = "<0.0.0-0";
            } else {
              ret = "*";
            }
          } else if (gtlt && anyX) {
            if (xm) {
              m = 0;
            }
            p = 0;
            if (gtlt === ">") {
              gtlt = ">=";
              if (xm) {
                M = +M + 1;
                m = 0;
                p = 0;
              } else {
                m = +m + 1;
                p = 0;
              }
            } else if (gtlt === "<=") {
              gtlt = "<";
              if (xm) {
                M = +M + 1;
              } else {
                m = +m + 1;
              }
            }
            if (gtlt === "<") {
              pr = "-0";
            }
            ret = `${gtlt + M}.${m}.${p}${pr}`;
          } else if (xm) {
            ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
          } else if (xp) {
            ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
          }
          debug("xRange return", ret);
          return ret;
        });
      };
      var replaceStars = (comp, options) => {
        debug("replaceStars", comp, options);
        return comp.trim().replace(re[t.STAR], "");
      };
      var replaceGTE0 = (comp, options) => {
        debug("replaceGTE0", comp, options);
        return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
      };
      var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
        if (isX(fM)) {
          from = "";
        } else if (isX(fm)) {
          from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
        } else if (isX(fp)) {
          from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
        } else if (fpr) {
          from = `>=${from}`;
        } else {
          from = `>=${from}${incPr ? "-0" : ""}`;
        }
        if (isX(tM)) {
          to = "";
        } else if (isX(tm)) {
          to = `<${+tM + 1}.0.0-0`;
        } else if (isX(tp)) {
          to = `<${tM}.${+tm + 1}.0-0`;
        } else if (tpr) {
          to = `<=${tM}.${tm}.${tp}-${tpr}`;
        } else if (incPr) {
          to = `<${tM}.${tm}.${+tp + 1}-0`;
        } else {
          to = `<=${to}`;
        }
        return `${from} ${to}`.trim();
      };
      var testSet = (set, version11, options) => {
        for (let i = 0; i < set.length; i++) {
          if (!set[i].test(version11)) {
            return false;
          }
        }
        if (version11.prerelease.length && !options.includePrerelease) {
          for (let i = 0; i < set.length; i++) {
            debug(set[i].semver);
            if (set[i].semver === Comparator.ANY) {
              continue;
            }
            if (set[i].semver.prerelease.length > 0) {
              const allowed = set[i].semver;
              if (allowed.major === version11.major && allowed.minor === version11.minor && allowed.patch === version11.patch) {
                return true;
              }
            }
          }
          return false;
        }
        return true;
      };
    }
  });

  // node_modules/semver/classes/comparator.js
  var require_comparator = __commonJS({
    "node_modules/semver/classes/comparator.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
      var Comparator = class _Comparator {
        static get ANY() {
          return ANY;
        }
        constructor(comp, options) {
          options = parseOptions(options);
          if (comp instanceof _Comparator) {
            if (comp.loose === !!options.loose) {
              return comp;
            } else {
              comp = comp.value;
            }
          }
          comp = comp.trim().split(/\s+/).join(" ");
          debug("comparator", comp, options);
          this.options = options;
          this.loose = !!options.loose;
          this.parse(comp);
          if (this.semver === ANY) {
            this.value = "";
          } else {
            this.value = this.operator + this.semver.version;
          }
          debug("comp", this);
        }
        parse(comp) {
          const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
          const m = comp.match(r);
          if (!m) {
            throw new TypeError(`Invalid comparator: ${comp}`);
          }
          this.operator = m[1] !== void 0 ? m[1] : "";
          if (this.operator === "=") {
            this.operator = "";
          }
          if (!m[2]) {
            this.semver = ANY;
          } else {
            this.semver = new SemVer(m[2], this.options.loose);
          }
        }
        toString() {
          return this.value;
        }
        test(version11) {
          debug("Comparator.test", version11, this.options.loose);
          if (this.semver === ANY || version11 === ANY) {
            return true;
          }
          if (typeof version11 === "string") {
            try {
              version11 = new SemVer(version11, this.options);
            } catch (er) {
              return false;
            }
          }
          return cmp(version11, this.operator, this.semver, this.options);
        }
        intersects(comp, options) {
          if (!(comp instanceof _Comparator)) {
            throw new TypeError("a Comparator is required");
          }
          if (this.operator === "") {
            if (this.value === "") {
              return true;
            }
            return new Range(comp.value, options).test(this.value);
          } else if (comp.operator === "") {
            if (comp.value === "") {
              return true;
            }
            return new Range(this.value, options).test(comp.semver);
          }
          options = parseOptions(options);
          if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
            return false;
          }
          if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
            return false;
          }
          if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
            return true;
          }
          if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
            return true;
          }
          if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
            return true;
          }
          if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
            return true;
          }
          if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
            return true;
          }
          return false;
        }
      };
      module.exports = Comparator;
      var parseOptions = require_parse_options();
      var { safeRe: re, t } = require_re();
      var cmp = require_cmp();
      var debug = require_debug();
      var SemVer = require_semver();
      var Range = require_range();
    }
  });

  // node_modules/semver/functions/satisfies.js
  var require_satisfies = __commonJS({
    "node_modules/semver/functions/satisfies.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var Range = require_range();
      var satisfies = (version11, range, options) => {
        try {
          range = new Range(range, options);
        } catch (er) {
          return false;
        }
        return range.test(version11);
      };
      module.exports = satisfies;
    }
  });

  // node_modules/semver/ranges/to-comparators.js
  var require_to_comparators = __commonJS({
    "node_modules/semver/ranges/to-comparators.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var Range = require_range();
      var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
      module.exports = toComparators;
    }
  });

  // node_modules/semver/ranges/max-satisfying.js
  var require_max_satisfying = __commonJS({
    "node_modules/semver/ranges/max-satisfying.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var Range = require_range();
      var maxSatisfying = (versions, range, options) => {
        let max = null;
        let maxSV = null;
        let rangeObj = null;
        try {
          rangeObj = new Range(range, options);
        } catch (er) {
          return null;
        }
        versions.forEach((v) => {
          if (rangeObj.test(v)) {
            if (!max || maxSV.compare(v) === -1) {
              max = v;
              maxSV = new SemVer(max, options);
            }
          }
        });
        return max;
      };
      module.exports = maxSatisfying;
    }
  });

  // node_modules/semver/ranges/min-satisfying.js
  var require_min_satisfying = __commonJS({
    "node_modules/semver/ranges/min-satisfying.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var Range = require_range();
      var minSatisfying = (versions, range, options) => {
        let min = null;
        let minSV = null;
        let rangeObj = null;
        try {
          rangeObj = new Range(range, options);
        } catch (er) {
          return null;
        }
        versions.forEach((v) => {
          if (rangeObj.test(v)) {
            if (!min || minSV.compare(v) === 1) {
              min = v;
              minSV = new SemVer(min, options);
            }
          }
        });
        return min;
      };
      module.exports = minSatisfying;
    }
  });

  // node_modules/semver/ranges/min-version.js
  var require_min_version = __commonJS({
    "node_modules/semver/ranges/min-version.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var Range = require_range();
      var gt = require_gt();
      var minVersion = (range, loose) => {
        range = new Range(range, loose);
        let minver = new SemVer("0.0.0");
        if (range.test(minver)) {
          return minver;
        }
        minver = new SemVer("0.0.0-0");
        if (range.test(minver)) {
          return minver;
        }
        minver = null;
        for (let i = 0; i < range.set.length; ++i) {
          const comparators = range.set[i];
          let setMin = null;
          comparators.forEach((comparator) => {
            const compver = new SemVer(comparator.semver.version);
            switch (comparator.operator) {
              case ">":
                if (compver.prerelease.length === 0) {
                  compver.patch++;
                } else {
                  compver.prerelease.push(0);
                }
                compver.raw = compver.format();
              /* fallthrough */
              case "":
              case ">=":
                if (!setMin || gt(compver, setMin)) {
                  setMin = compver;
                }
                break;
              case "<":
              case "<=":
                break;
              /* istanbul ignore next */
              default:
                throw new Error(`Unexpected operation: ${comparator.operator}`);
            }
          });
          if (setMin && (!minver || gt(minver, setMin))) {
            minver = setMin;
          }
        }
        if (minver && range.test(minver)) {
          return minver;
        }
        return null;
      };
      module.exports = minVersion;
    }
  });

  // node_modules/semver/ranges/valid.js
  var require_valid2 = __commonJS({
    "node_modules/semver/ranges/valid.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var Range = require_range();
      var validRange = (range, options) => {
        try {
          return new Range(range, options).range || "*";
        } catch (er) {
          return null;
        }
      };
      module.exports = validRange;
    }
  });

  // node_modules/semver/ranges/outside.js
  var require_outside = __commonJS({
    "node_modules/semver/ranges/outside.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var SemVer = require_semver();
      var Comparator = require_comparator();
      var { ANY } = Comparator;
      var Range = require_range();
      var satisfies = require_satisfies();
      var gt = require_gt();
      var lt = require_lt();
      var lte = require_lte();
      var gte = require_gte();
      var outside = (version11, range, hilo, options) => {
        version11 = new SemVer(version11, options);
        range = new Range(range, options);
        let gtfn, ltefn, ltfn, comp, ecomp;
        switch (hilo) {
          case ">":
            gtfn = gt;
            ltefn = lte;
            ltfn = lt;
            comp = ">";
            ecomp = ">=";
            break;
          case "<":
            gtfn = lt;
            ltefn = gte;
            ltfn = gt;
            comp = "<";
            ecomp = "<=";
            break;
          default:
            throw new TypeError('Must provide a hilo val of "<" or ">"');
        }
        if (satisfies(version11, range, options)) {
          return false;
        }
        for (let i = 0; i < range.set.length; ++i) {
          const comparators = range.set[i];
          let high = null;
          let low = null;
          comparators.forEach((comparator) => {
            if (comparator.semver === ANY) {
              comparator = new Comparator(">=0.0.0");
            }
            high = high || comparator;
            low = low || comparator;
            if (gtfn(comparator.semver, high.semver, options)) {
              high = comparator;
            } else if (ltfn(comparator.semver, low.semver, options)) {
              low = comparator;
            }
          });
          if (high.operator === comp || high.operator === ecomp) {
            return false;
          }
          if ((!low.operator || low.operator === comp) && ltefn(version11, low.semver)) {
            return false;
          } else if (low.operator === ecomp && ltfn(version11, low.semver)) {
            return false;
          }
        }
        return true;
      };
      module.exports = outside;
    }
  });

  // node_modules/semver/ranges/gtr.js
  var require_gtr = __commonJS({
    "node_modules/semver/ranges/gtr.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var outside = require_outside();
      var gtr = (version11, range, options) => outside(version11, range, ">", options);
      module.exports = gtr;
    }
  });

  // node_modules/semver/ranges/ltr.js
  var require_ltr = __commonJS({
    "node_modules/semver/ranges/ltr.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var outside = require_outside();
      var ltr = (version11, range, options) => outside(version11, range, "<", options);
      module.exports = ltr;
    }
  });

  // node_modules/semver/ranges/intersects.js
  var require_intersects = __commonJS({
    "node_modules/semver/ranges/intersects.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var Range = require_range();
      var intersects = (r1, r2, options) => {
        r1 = new Range(r1, options);
        r2 = new Range(r2, options);
        return r1.intersects(r2, options);
      };
      module.exports = intersects;
    }
  });

  // node_modules/semver/ranges/simplify.js
  var require_simplify = __commonJS({
    "node_modules/semver/ranges/simplify.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var satisfies = require_satisfies();
      var compare2 = require_compare();
      module.exports = (versions, range, options) => {
        const set = [];
        let first = null;
        let prev = null;
        const v = versions.sort((a, b) => compare2(a, b, options));
        for (const version11 of v) {
          const included = satisfies(version11, range, options);
          if (included) {
            prev = version11;
            if (!first) {
              first = version11;
            }
          } else {
            if (prev) {
              set.push([first, prev]);
            }
            prev = null;
            first = null;
          }
        }
        if (first) {
          set.push([first, null]);
        }
        const ranges = [];
        for (const [min, max] of set) {
          if (min === max) {
            ranges.push(min);
          } else if (!max && min === v[0]) {
            ranges.push("*");
          } else if (!max) {
            ranges.push(`>=${min}`);
          } else if (min === v[0]) {
            ranges.push(`<=${max}`);
          } else {
            ranges.push(`${min} - ${max}`);
          }
        }
        const simplified = ranges.join(" || ");
        const original = typeof range.raw === "string" ? range.raw : String(range);
        return simplified.length < original.length ? simplified : range;
      };
    }
  });

  // node_modules/semver/ranges/subset.js
  var require_subset = __commonJS({
    "node_modules/semver/ranges/subset.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var Range = require_range();
      var Comparator = require_comparator();
      var { ANY } = Comparator;
      var satisfies = require_satisfies();
      var compare2 = require_compare();
      var subset = (sub, dom, options = {}) => {
        if (sub === dom) {
          return true;
        }
        sub = new Range(sub, options);
        dom = new Range(dom, options);
        let sawNonNull = false;
        OUTER: for (const simpleSub of sub.set) {
          for (const simpleDom of dom.set) {
            const isSub = simpleSubset(simpleSub, simpleDom, options);
            sawNonNull = sawNonNull || isSub !== null;
            if (isSub) {
              continue OUTER;
            }
          }
          if (sawNonNull) {
            return false;
          }
        }
        return true;
      };
      var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
      var minimumVersion = [new Comparator(">=0.0.0")];
      var simpleSubset = (sub, dom, options) => {
        if (sub === dom) {
          return true;
        }
        if (sub.length === 1 && sub[0].semver === ANY) {
          if (dom.length === 1 && dom[0].semver === ANY) {
            return true;
          } else if (options.includePrerelease) {
            sub = minimumVersionWithPreRelease;
          } else {
            sub = minimumVersion;
          }
        }
        if (dom.length === 1 && dom[0].semver === ANY) {
          if (options.includePrerelease) {
            return true;
          } else {
            dom = minimumVersion;
          }
        }
        const eqSet = /* @__PURE__ */ new Set();
        let gt, lt;
        for (const c of sub) {
          if (c.operator === ">" || c.operator === ">=") {
            gt = higherGT(gt, c, options);
          } else if (c.operator === "<" || c.operator === "<=") {
            lt = lowerLT(lt, c, options);
          } else {
            eqSet.add(c.semver);
          }
        }
        if (eqSet.size > 1) {
          return null;
        }
        let gtltComp;
        if (gt && lt) {
          gtltComp = compare2(gt.semver, lt.semver, options);
          if (gtltComp > 0) {
            return null;
          } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
            return null;
          }
        }
        for (const eq4 of eqSet) {
          if (gt && !satisfies(eq4, String(gt), options)) {
            return null;
          }
          if (lt && !satisfies(eq4, String(lt), options)) {
            return null;
          }
          for (const c of dom) {
            if (!satisfies(eq4, String(c), options)) {
              return false;
            }
          }
          return true;
        }
        let higher, lower;
        let hasDomLT, hasDomGT;
        let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
        let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
        if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
          needDomLTPre = false;
        }
        for (const c of dom) {
          hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
          hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
          if (gt) {
            if (needDomGTPre) {
              if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
                needDomGTPre = false;
              }
            }
            if (c.operator === ">" || c.operator === ">=") {
              higher = higherGT(gt, c, options);
              if (higher === c && higher !== gt) {
                return false;
              }
            } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
              return false;
            }
          }
          if (lt) {
            if (needDomLTPre) {
              if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
                needDomLTPre = false;
              }
            }
            if (c.operator === "<" || c.operator === "<=") {
              lower = lowerLT(lt, c, options);
              if (lower === c && lower !== lt) {
                return false;
              }
            } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
              return false;
            }
          }
          if (!c.operator && (lt || gt) && gtltComp !== 0) {
            return false;
          }
        }
        if (gt && hasDomLT && !lt && gtltComp !== 0) {
          return false;
        }
        if (lt && hasDomGT && !gt && gtltComp !== 0) {
          return false;
        }
        if (needDomGTPre || needDomLTPre) {
          return false;
        }
        return true;
      };
      var higherGT = (a, b, options) => {
        if (!a) {
          return b;
        }
        const comp = compare2(a.semver, b.semver, options);
        return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
      };
      var lowerLT = (a, b, options) => {
        if (!a) {
          return b;
        }
        const comp = compare2(a.semver, b.semver, options);
        return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
      };
      module.exports = subset;
    }
  });

  // node_modules/semver/index.js
  var require_semver2 = __commonJS({
    "node_modules/semver/index.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var internalRe = require_re();
      var constants = require_constants();
      var SemVer = require_semver();
      var identifiers = require_identifiers();
      var parse3 = require_parse();
      var valid = require_valid();
      var clean = require_clean();
      var inc = require_inc();
      var diff = require_diff();
      var major = require_major();
      var minor = require_minor();
      var patch = require_patch();
      var prerelease = require_prerelease();
      var compare2 = require_compare();
      var rcompare = require_rcompare();
      var compareLoose = require_compare_loose();
      var compareBuild = require_compare_build();
      var sort = require_sort();
      var rsort = require_rsort();
      var gt = require_gt();
      var lt = require_lt();
      var eq4 = require_eq();
      var neq = require_neq();
      var gte = require_gte();
      var lte = require_lte();
      var cmp = require_cmp();
      var coerce = require_coerce();
      var Comparator = require_comparator();
      var Range = require_range();
      var satisfies = require_satisfies();
      var toComparators = require_to_comparators();
      var maxSatisfying = require_max_satisfying();
      var minSatisfying = require_min_satisfying();
      var minVersion = require_min_version();
      var validRange = require_valid2();
      var outside = require_outside();
      var gtr = require_gtr();
      var ltr = require_ltr();
      var intersects = require_intersects();
      var simplifyRange = require_simplify();
      var subset = require_subset();
      module.exports = {
        parse: parse3,
        valid,
        clean,
        inc,
        diff,
        major,
        minor,
        patch,
        prerelease,
        compare: compare2,
        rcompare,
        compareLoose,
        compareBuild,
        sort,
        rsort,
        gt,
        lt,
        eq: eq4,
        neq,
        gte,
        lte,
        cmp,
        coerce,
        Comparator,
        Range,
        satisfies,
        toComparators,
        maxSatisfying,
        minSatisfying,
        minVersion,
        validRange,
        outside,
        gtr,
        ltr,
        intersects,
        simplifyRange,
        subset,
        SemVer,
        re: internalRe.re,
        src: internalRe.src,
        tokens: internalRe.t,
        SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
        RELEASE_TYPES: constants.RELEASE_TYPES,
        compareIdentifiers: identifiers.compareIdentifiers,
        rcompareIdentifiers: identifiers.rcompareIdentifiers
      };
    }
  });

  // (disabled):crypto
  var require_crypto = __commonJS({
    "(disabled):crypto"() {
      init_buffer_shim_entry();
    }
  });

  // node_modules/crypto-js/core.js
  var require_core = __commonJS({
    "node_modules/crypto-js/core.js"(exports, module) {
      init_buffer_shim_entry();
      (function(root, factory2) {
        if (typeof exports === "object") {
          module.exports = exports = factory2();
        } else if (typeof define === "function" && define.amd) {
          define([], factory2);
        } else {
          root.CryptoJS = factory2();
        }
      })(exports, function() {
        var CryptoJS = CryptoJS || (function(Math2, undefined2) {
          var crypto2;
          if (typeof window !== "undefined" && window.crypto) {
            crypto2 = window.crypto;
          }
          if (typeof self !== "undefined" && self.crypto) {
            crypto2 = self.crypto;
          }
          if (typeof globalThis !== "undefined" && globalThis.crypto) {
            crypto2 = globalThis.crypto;
          }
          if (!crypto2 && typeof window !== "undefined" && window.msCrypto) {
            crypto2 = window.msCrypto;
          }
          if (!crypto2 && typeof globalThis !== "undefined" && globalThis.crypto) {
            crypto2 = globalThis.crypto;
          }
          if (!crypto2 && typeof __require === "function") {
            try {
              crypto2 = require_crypto();
            } catch (err) {
            }
          }
          var cryptoSecureRandomInt = function() {
            if (crypto2) {
              if (typeof crypto2.getRandomValues === "function") {
                try {
                  return crypto2.getRandomValues(new Uint32Array(1))[0];
                } catch (err) {
                }
              }
              if (typeof crypto2.randomBytes === "function") {
                try {
                  return crypto2.randomBytes(4).readInt32LE();
                } catch (err) {
                }
              }
            }
            throw new Error("Native crypto module could not be used to get secure random number.");
          };
          var create = Object.create || /* @__PURE__ */ (function() {
            function F() {
            }
            return function(obj) {
              var subtype;
              F.prototype = obj;
              subtype = new F();
              F.prototype = null;
              return subtype;
            };
          })();
          var C = {};
          var C_lib = C.lib = {};
          var Base = C_lib.Base = /* @__PURE__ */ (function() {
            return {
              /**
               * Creates a new object that inherits from this object.
               *
               * @param {Object} overrides Properties to copy into the new object.
               *
               * @return {Object} The new object.
               *
               * @static
               *
               * @example
               *
               *     var MyType = CryptoJS.lib.Base.extend({
               *         field: 'value',
               *
               *         method: function () {
               *         }
               *     });
               */
              extend: function(overrides) {
                var subtype = create(this);
                if (overrides) {
                  subtype.mixIn(overrides);
                }
                if (!subtype.hasOwnProperty("init") || this.init === subtype.init) {
                  subtype.init = function() {
                    subtype.$super.init.apply(this, arguments);
                  };
                }
                subtype.init.prototype = subtype;
                subtype.$super = this;
                return subtype;
              },
              /**
               * Extends this object and runs the init method.
               * Arguments to create() will be passed to init().
               *
               * @return {Object} The new object.
               *
               * @static
               *
               * @example
               *
               *     var instance = MyType.create();
               */
              create: function() {
                var instance = this.extend();
                instance.init.apply(instance, arguments);
                return instance;
              },
              /**
               * Initializes a newly created object.
               * Override this method to add some logic when your objects are created.
               *
               * @example
               *
               *     var MyType = CryptoJS.lib.Base.extend({
               *         init: function () {
               *             // ...
               *         }
               *     });
               */
              init: function() {
              },
              /**
               * Copies properties into this object.
               *
               * @param {Object} properties The properties to mix in.
               *
               * @example
               *
               *     MyType.mixIn({
               *         field: 'value'
               *     });
               */
              mixIn: function(properties) {
                for (var propertyName in properties) {
                  if (properties.hasOwnProperty(propertyName)) {
                    this[propertyName] = properties[propertyName];
                  }
                }
                if (properties.hasOwnProperty("toString")) {
                  this.toString = properties.toString;
                }
              },
              /**
               * Creates a copy of this object.
               *
               * @return {Object} The clone.
               *
               * @example
               *
               *     var clone = instance.clone();
               */
              clone: function() {
                return this.init.prototype.extend(this);
              }
            };
          })();
          var WordArray = C_lib.WordArray = Base.extend({
            /**
             * Initializes a newly created word array.
             *
             * @param {Array} words (Optional) An array of 32-bit words.
             * @param {number} sigBytes (Optional) The number of significant bytes in the words.
             *
             * @example
             *
             *     var wordArray = CryptoJS.lib.WordArray.create();
             *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
             *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
             */
            init: function(words, sigBytes) {
              words = this.words = words || [];
              if (sigBytes != undefined2) {
                this.sigBytes = sigBytes;
              } else {
                this.sigBytes = words.length * 4;
              }
            },
            /**
             * Converts this word array to a string.
             *
             * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
             *
             * @return {string} The stringified word array.
             *
             * @example
             *
             *     var string = wordArray + '';
             *     var string = wordArray.toString();
             *     var string = wordArray.toString(CryptoJS.enc.Utf8);
             */
            toString: function(encoder) {
              return (encoder || Hex).stringify(this);
            },
            /**
             * Concatenates a word array to this word array.
             *
             * @param {WordArray} wordArray The word array to append.
             *
             * @return {WordArray} This word array.
             *
             * @example
             *
             *     wordArray1.concat(wordArray2);
             */
            concat: function(wordArray) {
              var thisWords = this.words;
              var thatWords = wordArray.words;
              var thisSigBytes = this.sigBytes;
              var thatSigBytes = wordArray.sigBytes;
              this.clamp();
              if (thisSigBytes % 4) {
                for (var i = 0; i < thatSigBytes; i++) {
                  var thatByte = thatWords[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                  thisWords[thisSigBytes + i >>> 2] |= thatByte << 24 - (thisSigBytes + i) % 4 * 8;
                }
              } else {
                for (var j = 0; j < thatSigBytes; j += 4) {
                  thisWords[thisSigBytes + j >>> 2] = thatWords[j >>> 2];
                }
              }
              this.sigBytes += thatSigBytes;
              return this;
            },
            /**
             * Removes insignificant bits.
             *
             * @example
             *
             *     wordArray.clamp();
             */
            clamp: function() {
              var words = this.words;
              var sigBytes = this.sigBytes;
              words[sigBytes >>> 2] &= 4294967295 << 32 - sigBytes % 4 * 8;
              words.length = Math2.ceil(sigBytes / 4);
            },
            /**
             * Creates a copy of this word array.
             *
             * @return {WordArray} The clone.
             *
             * @example
             *
             *     var clone = wordArray.clone();
             */
            clone: function() {
              var clone2 = Base.clone.call(this);
              clone2.words = this.words.slice(0);
              return clone2;
            },
            /**
             * Creates a word array filled with random bytes.
             *
             * @param {number} nBytes The number of random bytes to generate.
             *
             * @return {WordArray} The random word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.lib.WordArray.random(16);
             */
            random: function(nBytes) {
              var words = [];
              for (var i = 0; i < nBytes; i += 4) {
                words.push(cryptoSecureRandomInt());
              }
              return new WordArray.init(words, nBytes);
            }
          });
          var C_enc = C.enc = {};
          var Hex = C_enc.Hex = {
            /**
             * Converts a word array to a hex string.
             *
             * @param {WordArray} wordArray The word array.
             *
             * @return {string} The hex string.
             *
             * @static
             *
             * @example
             *
             *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
             */
            stringify: function(wordArray) {
              var words = wordArray.words;
              var sigBytes = wordArray.sigBytes;
              var hexChars = [];
              for (var i = 0; i < sigBytes; i++) {
                var bite = words[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                hexChars.push((bite >>> 4).toString(16));
                hexChars.push((bite & 15).toString(16));
              }
              return hexChars.join("");
            },
            /**
             * Converts a hex string to a word array.
             *
             * @param {string} hexStr The hex string.
             *
             * @return {WordArray} The word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
             */
            parse: function(hexStr) {
              var hexStrLength = hexStr.length;
              var words = [];
              for (var i = 0; i < hexStrLength; i += 2) {
                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << 24 - i % 8 * 4;
              }
              return new WordArray.init(words, hexStrLength / 2);
            }
          };
          var Latin1 = C_enc.Latin1 = {
            /**
             * Converts a word array to a Latin1 string.
             *
             * @param {WordArray} wordArray The word array.
             *
             * @return {string} The Latin1 string.
             *
             * @static
             *
             * @example
             *
             *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
             */
            stringify: function(wordArray) {
              var words = wordArray.words;
              var sigBytes = wordArray.sigBytes;
              var latin1Chars = [];
              for (var i = 0; i < sigBytes; i++) {
                var bite = words[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                latin1Chars.push(String.fromCharCode(bite));
              }
              return latin1Chars.join("");
            },
            /**
             * Converts a Latin1 string to a word array.
             *
             * @param {string} latin1Str The Latin1 string.
             *
             * @return {WordArray} The word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
             */
            parse: function(latin1Str) {
              var latin1StrLength = latin1Str.length;
              var words = [];
              for (var i = 0; i < latin1StrLength; i++) {
                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 255) << 24 - i % 4 * 8;
              }
              return new WordArray.init(words, latin1StrLength);
            }
          };
          var Utf8 = C_enc.Utf8 = {
            /**
             * Converts a word array to a UTF-8 string.
             *
             * @param {WordArray} wordArray The word array.
             *
             * @return {string} The UTF-8 string.
             *
             * @static
             *
             * @example
             *
             *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
             */
            stringify: function(wordArray) {
              try {
                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
              } catch (e) {
                throw new Error("Malformed UTF-8 data");
              }
            },
            /**
             * Converts a UTF-8 string to a word array.
             *
             * @param {string} utf8Str The UTF-8 string.
             *
             * @return {WordArray} The word array.
             *
             * @static
             *
             * @example
             *
             *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
             */
            parse: function(utf8Str) {
              return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
            }
          };
          var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
            /**
             * Resets this block algorithm's data buffer to its initial state.
             *
             * @example
             *
             *     bufferedBlockAlgorithm.reset();
             */
            reset: function() {
              this._data = new WordArray.init();
              this._nDataBytes = 0;
            },
            /**
             * Adds new data to this block algorithm's buffer.
             *
             * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
             *
             * @example
             *
             *     bufferedBlockAlgorithm._append('data');
             *     bufferedBlockAlgorithm._append(wordArray);
             */
            _append: function(data) {
              if (typeof data == "string") {
                data = Utf8.parse(data);
              }
              this._data.concat(data);
              this._nDataBytes += data.sigBytes;
            },
            /**
             * Processes available data blocks.
             *
             * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
             *
             * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
             *
             * @return {WordArray} The processed data.
             *
             * @example
             *
             *     var processedData = bufferedBlockAlgorithm._process();
             *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
             */
            _process: function(doFlush) {
              var processedWords;
              var data = this._data;
              var dataWords = data.words;
              var dataSigBytes = data.sigBytes;
              var blockSize = this.blockSize;
              var blockSizeBytes = blockSize * 4;
              var nBlocksReady = dataSigBytes / blockSizeBytes;
              if (doFlush) {
                nBlocksReady = Math2.ceil(nBlocksReady);
              } else {
                nBlocksReady = Math2.max((nBlocksReady | 0) - this._minBufferSize, 0);
              }
              var nWordsReady = nBlocksReady * blockSize;
              var nBytesReady = Math2.min(nWordsReady * 4, dataSigBytes);
              if (nWordsReady) {
                for (var offset = 0; offset < nWordsReady; offset += blockSize) {
                  this._doProcessBlock(dataWords, offset);
                }
                processedWords = dataWords.splice(0, nWordsReady);
                data.sigBytes -= nBytesReady;
              }
              return new WordArray.init(processedWords, nBytesReady);
            },
            /**
             * Creates a copy of this object.
             *
             * @return {Object} The clone.
             *
             * @example
             *
             *     var clone = bufferedBlockAlgorithm.clone();
             */
            clone: function() {
              var clone2 = Base.clone.call(this);
              clone2._data = this._data.clone();
              return clone2;
            },
            _minBufferSize: 0
          });
          var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
            /**
             * Configuration options.
             */
            cfg: Base.extend(),
            /**
             * Initializes a newly created hasher.
             *
             * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
             *
             * @example
             *
             *     var hasher = CryptoJS.algo.SHA256.create();
             */
            init: function(cfg) {
              this.cfg = this.cfg.extend(cfg);
              this.reset();
            },
            /**
             * Resets this hasher to its initial state.
             *
             * @example
             *
             *     hasher.reset();
             */
            reset: function() {
              BufferedBlockAlgorithm.reset.call(this);
              this._doReset();
            },
            /**
             * Updates this hasher with a message.
             *
             * @param {WordArray|string} messageUpdate The message to append.
             *
             * @return {Hasher} This hasher.
             *
             * @example
             *
             *     hasher.update('message');
             *     hasher.update(wordArray);
             */
            update: function(messageUpdate) {
              this._append(messageUpdate);
              this._process();
              return this;
            },
            /**
             * Finalizes the hash computation.
             * Note that the finalize operation is effectively a destructive, read-once operation.
             *
             * @param {WordArray|string} messageUpdate (Optional) A final message update.
             *
             * @return {WordArray} The hash.
             *
             * @example
             *
             *     var hash = hasher.finalize();
             *     var hash = hasher.finalize('message');
             *     var hash = hasher.finalize(wordArray);
             */
            finalize: function(messageUpdate) {
              if (messageUpdate) {
                this._append(messageUpdate);
              }
              var hash2 = this._doFinalize();
              return hash2;
            },
            blockSize: 512 / 32,
            /**
             * Creates a shortcut function to a hasher's object interface.
             *
             * @param {Hasher} hasher The hasher to create a helper for.
             *
             * @return {Function} The shortcut function.
             *
             * @static
             *
             * @example
             *
             *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
             */
            _createHelper: function(hasher) {
              return function(message, cfg) {
                return new hasher.init(cfg).finalize(message);
              };
            },
            /**
             * Creates a shortcut function to the HMAC's object interface.
             *
             * @param {Hasher} hasher The hasher to use in this HMAC helper.
             *
             * @return {Function} The shortcut function.
             *
             * @static
             *
             * @example
             *
             *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
             */
            _createHmacHelper: function(hasher) {
              return function(message, key2) {
                return new C_algo.HMAC.init(hasher, key2).finalize(message);
              };
            }
          });
          var C_algo = C.algo = {};
          return C;
        })(Math);
        return CryptoJS;
      });
    }
  });

  // node_modules/crypto-js/sha256.js
  var require_sha256 = __commonJS({
    "node_modules/crypto-js/sha256.js"(exports, module) {
      init_buffer_shim_entry();
      (function(root, factory2) {
        if (typeof exports === "object") {
          module.exports = exports = factory2(require_core());
        } else if (typeof define === "function" && define.amd) {
          define(["./core"], factory2);
        } else {
          factory2(root.CryptoJS);
        }
      })(exports, function(CryptoJS) {
        (function(Math2) {
          var C = CryptoJS;
          var C_lib = C.lib;
          var WordArray = C_lib.WordArray;
          var Hasher = C_lib.Hasher;
          var C_algo = C.algo;
          var H = [];
          var K = [];
          (function() {
            function isPrime(n2) {
              var sqrtN = Math2.sqrt(n2);
              for (var factor = 2; factor <= sqrtN; factor++) {
                if (!(n2 % factor)) {
                  return false;
                }
              }
              return true;
            }
            function getFractionalBits(n2) {
              return (n2 - (n2 | 0)) * 4294967296 | 0;
            }
            var n = 2;
            var nPrime = 0;
            while (nPrime < 64) {
              if (isPrime(n)) {
                if (nPrime < 8) {
                  H[nPrime] = getFractionalBits(Math2.pow(n, 1 / 2));
                }
                K[nPrime] = getFractionalBits(Math2.pow(n, 1 / 3));
                nPrime++;
              }
              n++;
            }
          })();
          var W = [];
          var SHA256 = C_algo.SHA256 = Hasher.extend({
            _doReset: function() {
              this._hash = new WordArray.init(H.slice(0));
            },
            _doProcessBlock: function(M, offset) {
              var H2 = this._hash.words;
              var a = H2[0];
              var b = H2[1];
              var c = H2[2];
              var d = H2[3];
              var e = H2[4];
              var f = H2[5];
              var g = H2[6];
              var h = H2[7];
              for (var i = 0; i < 64; i++) {
                if (i < 16) {
                  W[i] = M[offset + i] | 0;
                } else {
                  var gamma0x = W[i - 15];
                  var gamma0 = (gamma0x << 25 | gamma0x >>> 7) ^ (gamma0x << 14 | gamma0x >>> 18) ^ gamma0x >>> 3;
                  var gamma1x = W[i - 2];
                  var gamma1 = (gamma1x << 15 | gamma1x >>> 17) ^ (gamma1x << 13 | gamma1x >>> 19) ^ gamma1x >>> 10;
                  W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
                }
                var ch = e & f ^ ~e & g;
                var maj = a & b ^ a & c ^ b & c;
                var sigma0 = (a << 30 | a >>> 2) ^ (a << 19 | a >>> 13) ^ (a << 10 | a >>> 22);
                var sigma1 = (e << 26 | e >>> 6) ^ (e << 21 | e >>> 11) ^ (e << 7 | e >>> 25);
                var t1 = h + sigma1 + ch + K[i] + W[i];
                var t2 = sigma0 + maj;
                h = g;
                g = f;
                f = e;
                e = d + t1 | 0;
                d = c;
                c = b;
                b = a;
                a = t1 + t2 | 0;
              }
              H2[0] = H2[0] + a | 0;
              H2[1] = H2[1] + b | 0;
              H2[2] = H2[2] + c | 0;
              H2[3] = H2[3] + d | 0;
              H2[4] = H2[4] + e | 0;
              H2[5] = H2[5] + f | 0;
              H2[6] = H2[6] + g | 0;
              H2[7] = H2[7] + h | 0;
            },
            _doFinalize: function() {
              var data = this._data;
              var dataWords = data.words;
              var nBitsTotal = this._nDataBytes * 8;
              var nBitsLeft = data.sigBytes * 8;
              dataWords[nBitsLeft >>> 5] |= 128 << 24 - nBitsLeft % 32;
              dataWords[(nBitsLeft + 64 >>> 9 << 4) + 14] = Math2.floor(nBitsTotal / 4294967296);
              dataWords[(nBitsLeft + 64 >>> 9 << 4) + 15] = nBitsTotal;
              data.sigBytes = dataWords.length * 4;
              this._process();
              return this._hash;
            },
            clone: function() {
              var clone2 = Hasher.clone.call(this);
              clone2._hash = this._hash.clone();
              return clone2;
            }
          });
          C.SHA256 = Hasher._createHelper(SHA256);
          C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
        })(Math);
        return CryptoJS.SHA256;
      });
    }
  });

  // node_modules/crypto-js/sha224.js
  var require_sha224 = __commonJS({
    "node_modules/crypto-js/sha224.js"(exports, module) {
      init_buffer_shim_entry();
      (function(root, factory2, undef) {
        if (typeof exports === "object") {
          module.exports = exports = factory2(require_core(), require_sha256());
        } else if (typeof define === "function" && define.amd) {
          define(["./core", "./sha256"], factory2);
        } else {
          factory2(root.CryptoJS);
        }
      })(exports, function(CryptoJS) {
        (function() {
          var C = CryptoJS;
          var C_lib = C.lib;
          var WordArray = C_lib.WordArray;
          var C_algo = C.algo;
          var SHA256 = C_algo.SHA256;
          var SHA2242 = C_algo.SHA224 = SHA256.extend({
            _doReset: function() {
              this._hash = new WordArray.init([
                3238371032,
                914150663,
                812702999,
                4144912697,
                4290775857,
                1750603025,
                1694076839,
                3204075428
              ]);
            },
            _doFinalize: function() {
              var hash2 = SHA256._doFinalize.call(this);
              hash2.sigBytes -= 4;
              return hash2;
            }
          });
          C.SHA224 = SHA256._createHelper(SHA2242);
          C.HmacSHA224 = SHA256._createHmacHelper(SHA2242);
        })();
        return CryptoJS.SHA224;
      });
    }
  });

  // (disabled):node_modules/buffer/index.js
  var require_buffer2 = __commonJS({
    "(disabled):node_modules/buffer/index.js"() {
      init_buffer_shim_entry();
    }
  });

  // node_modules/bn.js/lib/bn.js
  var require_bn = __commonJS({
    "node_modules/bn.js/lib/bn.js"(exports, module) {
      init_buffer_shim_entry();
      (function(module2, exports2) {
        "use strict";
        function assert2(val, msg) {
          if (!val) throw new Error(msg || "Assertion failed");
        }
        function inherits2(ctor, superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
        function BN3(number, base2, endian) {
          if (BN3.isBN(number)) {
            return number;
          }
          this.negative = 0;
          this.words = null;
          this.length = 0;
          this.red = null;
          if (number !== null) {
            if (base2 === "le" || base2 === "be") {
              endian = base2;
              base2 = 10;
            }
            this._init(number || 0, base2 || 10, endian || "be");
          }
        }
        if (typeof module2 === "object") {
          module2.exports = BN3;
        } else {
          exports2.BN = BN3;
        }
        BN3.BN = BN3;
        BN3.wordSize = 26;
        var Buffer3;
        try {
          if (typeof window !== "undefined" && typeof window.Buffer !== "undefined") {
            Buffer3 = window.Buffer;
          } else {
            Buffer3 = require_buffer2().Buffer;
          }
        } catch (e) {
        }
        BN3.isBN = function isBN(num) {
          if (num instanceof BN3) {
            return true;
          }
          return num !== null && typeof num === "object" && num.constructor.wordSize === BN3.wordSize && Array.isArray(num.words);
        };
        BN3.max = function max(left, right) {
          if (left.cmp(right) > 0) return left;
          return right;
        };
        BN3.min = function min(left, right) {
          if (left.cmp(right) < 0) return left;
          return right;
        };
        BN3.prototype._init = function init2(number, base2, endian) {
          if (typeof number === "number") {
            return this._initNumber(number, base2, endian);
          }
          if (typeof number === "object") {
            return this._initArray(number, base2, endian);
          }
          if (base2 === "hex") {
            base2 = 16;
          }
          assert2(base2 === (base2 | 0) && base2 >= 2 && base2 <= 36);
          number = number.toString().replace(/\s+/g, "");
          var start = 0;
          if (number[0] === "-") {
            start++;
            this.negative = 1;
          }
          if (start < number.length) {
            if (base2 === 16) {
              this._parseHex(number, start, endian);
            } else {
              this._parseBase(number, base2, start);
              if (endian === "le") {
                this._initArray(this.toArray(), base2, endian);
              }
            }
          }
        };
        BN3.prototype._initNumber = function _initNumber(number, base2, endian) {
          if (number < 0) {
            this.negative = 1;
            number = -number;
          }
          if (number < 67108864) {
            this.words = [number & 67108863];
            this.length = 1;
          } else if (number < 4503599627370496) {
            this.words = [
              number & 67108863,
              number / 67108864 & 67108863
            ];
            this.length = 2;
          } else {
            assert2(number < 9007199254740992);
            this.words = [
              number & 67108863,
              number / 67108864 & 67108863,
              1
            ];
            this.length = 3;
          }
          if (endian !== "le") return;
          this._initArray(this.toArray(), base2, endian);
        };
        BN3.prototype._initArray = function _initArray(number, base2, endian) {
          assert2(typeof number.length === "number");
          if (number.length <= 0) {
            this.words = [0];
            this.length = 1;
            return this;
          }
          this.length = Math.ceil(number.length / 3);
          this.words = new Array(this.length);
          for (var i = 0; i < this.length; i++) {
            this.words[i] = 0;
          }
          var j, w;
          var off = 0;
          if (endian === "be") {
            for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
              w = number[i] | number[i - 1] << 8 | number[i - 2] << 16;
              this.words[j] |= w << off & 67108863;
              this.words[j + 1] = w >>> 26 - off & 67108863;
              off += 24;
              if (off >= 26) {
                off -= 26;
                j++;
              }
            }
          } else if (endian === "le") {
            for (i = 0, j = 0; i < number.length; i += 3) {
              w = number[i] | number[i + 1] << 8 | number[i + 2] << 16;
              this.words[j] |= w << off & 67108863;
              this.words[j + 1] = w >>> 26 - off & 67108863;
              off += 24;
              if (off >= 26) {
                off -= 26;
                j++;
              }
            }
          }
          return this._strip();
        };
        function parseHex4Bits(string, index) {
          var c = string.charCodeAt(index);
          if (c >= 48 && c <= 57) {
            return c - 48;
          } else if (c >= 65 && c <= 70) {
            return c - 55;
          } else if (c >= 97 && c <= 102) {
            return c - 87;
          } else {
            assert2(false, "Invalid character in " + string);
          }
        }
        function parseHexByte(string, lowerBound, index) {
          var r = parseHex4Bits(string, index);
          if (index - 1 >= lowerBound) {
            r |= parseHex4Bits(string, index - 1) << 4;
          }
          return r;
        }
        BN3.prototype._parseHex = function _parseHex(number, start, endian) {
          this.length = Math.ceil((number.length - start) / 6);
          this.words = new Array(this.length);
          for (var i = 0; i < this.length; i++) {
            this.words[i] = 0;
          }
          var off = 0;
          var j = 0;
          var w;
          if (endian === "be") {
            for (i = number.length - 1; i >= start; i -= 2) {
              w = parseHexByte(number, start, i) << off;
              this.words[j] |= w & 67108863;
              if (off >= 18) {
                off -= 18;
                j += 1;
                this.words[j] |= w >>> 26;
              } else {
                off += 8;
              }
            }
          } else {
            var parseLength = number.length - start;
            for (i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
              w = parseHexByte(number, start, i) << off;
              this.words[j] |= w & 67108863;
              if (off >= 18) {
                off -= 18;
                j += 1;
                this.words[j] |= w >>> 26;
              } else {
                off += 8;
              }
            }
          }
          this._strip();
        };
        function parseBase(str, start, end, mul3) {
          var r = 0;
          var b = 0;
          var len = Math.min(str.length, end);
          for (var i = start; i < len; i++) {
            var c = str.charCodeAt(i) - 48;
            r *= mul3;
            if (c >= 49) {
              b = c - 49 + 10;
            } else if (c >= 17) {
              b = c - 17 + 10;
            } else {
              b = c;
            }
            assert2(c >= 0 && b < mul3, "Invalid character");
            r += b;
          }
          return r;
        }
        BN3.prototype._parseBase = function _parseBase(number, base2, start) {
          this.words = [0];
          this.length = 1;
          for (var limbLen = 0, limbPow = 1; limbPow <= 67108863; limbPow *= base2) {
            limbLen++;
          }
          limbLen--;
          limbPow = limbPow / base2 | 0;
          var total = number.length - start;
          var mod = total % limbLen;
          var end = Math.min(total, total - mod) + start;
          var word = 0;
          for (var i = start; i < end; i += limbLen) {
            word = parseBase(number, i, i + limbLen, base2);
            this.imuln(limbPow);
            if (this.words[0] + word < 67108864) {
              this.words[0] += word;
            } else {
              this._iaddn(word);
            }
          }
          if (mod !== 0) {
            var pow = 1;
            word = parseBase(number, i, number.length, base2);
            for (i = 0; i < mod; i++) {
              pow *= base2;
            }
            this.imuln(pow);
            if (this.words[0] + word < 67108864) {
              this.words[0] += word;
            } else {
              this._iaddn(word);
            }
          }
          this._strip();
        };
        BN3.prototype.copy = function copy(dest) {
          dest.words = new Array(this.length);
          for (var i = 0; i < this.length; i++) {
            dest.words[i] = this.words[i];
          }
          dest.length = this.length;
          dest.negative = this.negative;
          dest.red = this.red;
        };
        function move(dest, src) {
          dest.words = src.words;
          dest.length = src.length;
          dest.negative = src.negative;
          dest.red = src.red;
        }
        BN3.prototype._move = function _move(dest) {
          move(dest, this);
        };
        BN3.prototype.clone = function clone2() {
          var r = new BN3(null);
          this.copy(r);
          return r;
        };
        BN3.prototype._expand = function _expand(size) {
          while (this.length < size) {
            this.words[this.length++] = 0;
          }
          return this;
        };
        BN3.prototype._strip = function strip() {
          while (this.length > 1 && this.words[this.length - 1] === 0) {
            this.length--;
          }
          return this._normSign();
        };
        BN3.prototype._normSign = function _normSign() {
          if (this.length === 1 && this.words[0] === 0) {
            this.negative = 0;
          }
          return this;
        };
        if (typeof Symbol !== "undefined" && typeof Symbol.for === "function") {
          try {
            BN3.prototype[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = inspect4;
          } catch (e) {
            BN3.prototype.inspect = inspect4;
          }
        } else {
          BN3.prototype.inspect = inspect4;
        }
        function inspect4() {
          return (this.red ? "<BN-R: " : "<BN: ") + this.toString(16) + ">";
        }
        var zeros = [
          "",
          "0",
          "00",
          "000",
          "0000",
          "00000",
          "000000",
          "0000000",
          "00000000",
          "000000000",
          "0000000000",
          "00000000000",
          "000000000000",
          "0000000000000",
          "00000000000000",
          "000000000000000",
          "0000000000000000",
          "00000000000000000",
          "000000000000000000",
          "0000000000000000000",
          "00000000000000000000",
          "000000000000000000000",
          "0000000000000000000000",
          "00000000000000000000000",
          "000000000000000000000000",
          "0000000000000000000000000"
        ];
        var groupSizes = [
          0,
          0,
          25,
          16,
          12,
          11,
          10,
          9,
          8,
          8,
          7,
          7,
          7,
          7,
          6,
          6,
          6,
          6,
          6,
          6,
          6,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5,
          5
        ];
        var groupBases = [
          0,
          0,
          33554432,
          43046721,
          16777216,
          48828125,
          60466176,
          40353607,
          16777216,
          43046721,
          1e7,
          19487171,
          35831808,
          62748517,
          7529536,
          11390625,
          16777216,
          24137569,
          34012224,
          47045881,
          64e6,
          4084101,
          5153632,
          6436343,
          7962624,
          9765625,
          11881376,
          14348907,
          17210368,
          20511149,
          243e5,
          28629151,
          33554432,
          39135393,
          45435424,
          52521875,
          60466176
        ];
        BN3.prototype.toString = function toString3(base2, padding) {
          base2 = base2 || 10;
          padding = padding | 0 || 1;
          var out;
          if (base2 === 16 || base2 === "hex") {
            out = "";
            var off = 0;
            var carry = 0;
            for (var i = 0; i < this.length; i++) {
              var w = this.words[i];
              var word = ((w << off | carry) & 16777215).toString(16);
              carry = w >>> 24 - off & 16777215;
              off += 2;
              if (off >= 26) {
                off -= 26;
                i--;
              }
              if (carry !== 0 || i !== this.length - 1) {
                out = zeros[6 - word.length] + word + out;
              } else {
                out = word + out;
              }
            }
            if (carry !== 0) {
              out = carry.toString(16) + out;
            }
            while (out.length % padding !== 0) {
              out = "0" + out;
            }
            if (this.negative !== 0) {
              out = "-" + out;
            }
            return out;
          }
          if (base2 === (base2 | 0) && base2 >= 2 && base2 <= 36) {
            var groupSize = groupSizes[base2];
            var groupBase = groupBases[base2];
            out = "";
            var c = this.clone();
            c.negative = 0;
            while (!c.isZero()) {
              var r = c.modrn(groupBase).toString(base2);
              c = c.idivn(groupBase);
              if (!c.isZero()) {
                out = zeros[groupSize - r.length] + r + out;
              } else {
                out = r + out;
              }
            }
            if (this.isZero()) {
              out = "0" + out;
            }
            while (out.length % padding !== 0) {
              out = "0" + out;
            }
            if (this.negative !== 0) {
              out = "-" + out;
            }
            return out;
          }
          assert2(false, "Base should be between 2 and 36");
        };
        BN3.prototype.toNumber = function toNumber() {
          var ret = this.words[0];
          if (this.length === 2) {
            ret += this.words[1] * 67108864;
          } else if (this.length === 3 && this.words[2] === 1) {
            ret += 4503599627370496 + this.words[1] * 67108864;
          } else if (this.length > 2) {
            assert2(false, "Number can only safely store up to 53 bits");
          }
          return this.negative !== 0 ? -ret : ret;
        };
        BN3.prototype.toJSON = function toJSON2() {
          return this.toString(16, 2);
        };
        if (Buffer3) {
          BN3.prototype.toBuffer = function toBuffer(endian, length) {
            return this.toArrayLike(Buffer3, endian, length);
          };
        }
        BN3.prototype.toArray = function toArray2(endian, length) {
          return this.toArrayLike(Array, endian, length);
        };
        var allocate = function allocate2(ArrayType, size) {
          if (ArrayType.allocUnsafe) {
            return ArrayType.allocUnsafe(size);
          }
          return new ArrayType(size);
        };
        BN3.prototype.toArrayLike = function toArrayLike(ArrayType, endian, length) {
          this._strip();
          var byteLength = this.byteLength();
          var reqLength = length || Math.max(1, byteLength);
          assert2(byteLength <= reqLength, "byte array longer than desired length");
          assert2(reqLength > 0, "Requested array length <= 0");
          var res = allocate(ArrayType, reqLength);
          var postfix = endian === "le" ? "LE" : "BE";
          this["_toArrayLike" + postfix](res, byteLength);
          return res;
        };
        BN3.prototype._toArrayLikeLE = function _toArrayLikeLE(res, byteLength) {
          var position = 0;
          var carry = 0;
          for (var i = 0, shift = 0; i < this.length; i++) {
            var word = this.words[i] << shift | carry;
            res[position++] = word & 255;
            if (position < res.length) {
              res[position++] = word >> 8 & 255;
            }
            if (position < res.length) {
              res[position++] = word >> 16 & 255;
            }
            if (shift === 6) {
              if (position < res.length) {
                res[position++] = word >> 24 & 255;
              }
              carry = 0;
              shift = 0;
            } else {
              carry = word >>> 24;
              shift += 2;
            }
          }
          if (position < res.length) {
            res[position++] = carry;
            while (position < res.length) {
              res[position++] = 0;
            }
          }
        };
        BN3.prototype._toArrayLikeBE = function _toArrayLikeBE(res, byteLength) {
          var position = res.length - 1;
          var carry = 0;
          for (var i = 0, shift = 0; i < this.length; i++) {
            var word = this.words[i] << shift | carry;
            res[position--] = word & 255;
            if (position >= 0) {
              res[position--] = word >> 8 & 255;
            }
            if (position >= 0) {
              res[position--] = word >> 16 & 255;
            }
            if (shift === 6) {
              if (position >= 0) {
                res[position--] = word >> 24 & 255;
              }
              carry = 0;
              shift = 0;
            } else {
              carry = word >>> 24;
              shift += 2;
            }
          }
          if (position >= 0) {
            res[position--] = carry;
            while (position >= 0) {
              res[position--] = 0;
            }
          }
        };
        if (Math.clz32) {
          BN3.prototype._countBits = function _countBits(w) {
            return 32 - Math.clz32(w);
          };
        } else {
          BN3.prototype._countBits = function _countBits(w) {
            var t = w;
            var r = 0;
            if (t >= 4096) {
              r += 13;
              t >>>= 13;
            }
            if (t >= 64) {
              r += 7;
              t >>>= 7;
            }
            if (t >= 8) {
              r += 4;
              t >>>= 4;
            }
            if (t >= 2) {
              r += 2;
              t >>>= 2;
            }
            return r + t;
          };
        }
        BN3.prototype._zeroBits = function _zeroBits(w) {
          if (w === 0) return 26;
          var t = w;
          var r = 0;
          if ((t & 8191) === 0) {
            r += 13;
            t >>>= 13;
          }
          if ((t & 127) === 0) {
            r += 7;
            t >>>= 7;
          }
          if ((t & 15) === 0) {
            r += 4;
            t >>>= 4;
          }
          if ((t & 3) === 0) {
            r += 2;
            t >>>= 2;
          }
          if ((t & 1) === 0) {
            r++;
          }
          return r;
        };
        BN3.prototype.bitLength = function bitLength() {
          var w = this.words[this.length - 1];
          var hi = this._countBits(w);
          return (this.length - 1) * 26 + hi;
        };
        function toBitArray(num) {
          var w = new Array(num.bitLength());
          for (var bit = 0; bit < w.length; bit++) {
            var off = bit / 26 | 0;
            var wbit = bit % 26;
            w[bit] = num.words[off] >>> wbit & 1;
          }
          return w;
        }
        BN3.prototype.zeroBits = function zeroBits() {
          if (this.isZero()) return 0;
          var r = 0;
          for (var i = 0; i < this.length; i++) {
            var b = this._zeroBits(this.words[i]);
            r += b;
            if (b !== 26) break;
          }
          return r;
        };
        BN3.prototype.byteLength = function byteLength() {
          return Math.ceil(this.bitLength() / 8);
        };
        BN3.prototype.toTwos = function toTwos(width) {
          if (this.negative !== 0) {
            return this.abs().inotn(width).iaddn(1);
          }
          return this.clone();
        };
        BN3.prototype.fromTwos = function fromTwos(width) {
          if (this.testn(width - 1)) {
            return this.notn(width).iaddn(1).ineg();
          }
          return this.clone();
        };
        BN3.prototype.isNeg = function isNeg() {
          return this.negative !== 0;
        };
        BN3.prototype.neg = function neg3() {
          return this.clone().ineg();
        };
        BN3.prototype.ineg = function ineg() {
          if (!this.isZero()) {
            this.negative ^= 1;
          }
          return this;
        };
        BN3.prototype.iuor = function iuor(num) {
          while (this.length < num.length) {
            this.words[this.length++] = 0;
          }
          for (var i = 0; i < num.length; i++) {
            this.words[i] = this.words[i] | num.words[i];
          }
          return this._strip();
        };
        BN3.prototype.ior = function ior(num) {
          assert2((this.negative | num.negative) === 0);
          return this.iuor(num);
        };
        BN3.prototype.or = function or(num) {
          if (this.length > num.length) return this.clone().ior(num);
          return num.clone().ior(this);
        };
        BN3.prototype.uor = function uor(num) {
          if (this.length > num.length) return this.clone().iuor(num);
          return num.clone().iuor(this);
        };
        BN3.prototype.iuand = function iuand(num) {
          var b;
          if (this.length > num.length) {
            b = num;
          } else {
            b = this;
          }
          for (var i = 0; i < b.length; i++) {
            this.words[i] = this.words[i] & num.words[i];
          }
          this.length = b.length;
          return this._strip();
        };
        BN3.prototype.iand = function iand(num) {
          assert2((this.negative | num.negative) === 0);
          return this.iuand(num);
        };
        BN3.prototype.and = function and(num) {
          if (this.length > num.length) return this.clone().iand(num);
          return num.clone().iand(this);
        };
        BN3.prototype.uand = function uand(num) {
          if (this.length > num.length) return this.clone().iuand(num);
          return num.clone().iuand(this);
        };
        BN3.prototype.iuxor = function iuxor(num) {
          var a;
          var b;
          if (this.length > num.length) {
            a = this;
            b = num;
          } else {
            a = num;
            b = this;
          }
          for (var i = 0; i < b.length; i++) {
            this.words[i] = a.words[i] ^ b.words[i];
          }
          if (this !== a) {
            for (; i < a.length; i++) {
              this.words[i] = a.words[i];
            }
          }
          this.length = a.length;
          return this._strip();
        };
        BN3.prototype.ixor = function ixor(num) {
          assert2((this.negative | num.negative) === 0);
          return this.iuxor(num);
        };
        BN3.prototype.xor = function xor(num) {
          if (this.length > num.length) return this.clone().ixor(num);
          return num.clone().ixor(this);
        };
        BN3.prototype.uxor = function uxor(num) {
          if (this.length > num.length) return this.clone().iuxor(num);
          return num.clone().iuxor(this);
        };
        BN3.prototype.inotn = function inotn(width) {
          assert2(typeof width === "number" && width >= 0);
          var bytesNeeded = Math.ceil(width / 26) | 0;
          var bitsLeft = width % 26;
          this._expand(bytesNeeded);
          if (bitsLeft > 0) {
            bytesNeeded--;
          }
          for (var i = 0; i < bytesNeeded; i++) {
            this.words[i] = ~this.words[i] & 67108863;
          }
          if (bitsLeft > 0) {
            this.words[i] = ~this.words[i] & 67108863 >> 26 - bitsLeft;
            i++;
          }
          for (; i < this.length; i++) {
            this.words[i] = 0;
          }
          return this._strip();
        };
        BN3.prototype.notn = function notn(width) {
          return this.clone().inotn(width);
        };
        BN3.prototype.setn = function setn(bit, val) {
          assert2(typeof bit === "number" && bit >= 0);
          var off = bit / 26 | 0;
          var wbit = bit % 26;
          this._expand(off + 1);
          if (val) {
            this.words[off] = this.words[off] | 1 << wbit;
          } else {
            this.words[off] = this.words[off] & ~(1 << wbit);
          }
          return this._strip();
        };
        BN3.prototype.iadd = function iadd(num) {
          var r;
          if (this.negative !== 0 && num.negative === 0) {
            this.negative = 0;
            r = this.isub(num);
            this.negative ^= 1;
            return this._normSign();
          } else if (this.negative === 0 && num.negative !== 0) {
            num.negative = 0;
            r = this.isub(num);
            num.negative = 1;
            return r._normSign();
          }
          var a, b;
          if (this.length > num.length) {
            a = this;
            b = num;
          } else {
            a = num;
            b = this;
          }
          var carry = 0;
          for (var i = 0; i < b.length; i++) {
            r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
            this.words[i] = r & 67108863;
            carry = r >>> 26;
          }
          for (; carry !== 0 && i < a.length; i++) {
            r = (a.words[i] | 0) + carry;
            this.words[i] = r & 67108863;
            carry = r >>> 26;
          }
          this.length = a.length;
          if (carry !== 0) {
            this.words[this.length] = carry;
            this.length++;
          } else if (a !== this) {
            for (; i < a.length; i++) {
              this.words[i] = a.words[i];
            }
          }
          return this;
        };
        BN3.prototype.add = function add3(num) {
          var res;
          if (num.negative !== 0 && this.negative === 0) {
            num.negative = 0;
            res = this.sub(num);
            num.negative ^= 1;
            return res;
          } else if (num.negative === 0 && this.negative !== 0) {
            this.negative = 0;
            res = num.sub(this);
            this.negative = 1;
            return res;
          }
          if (this.length > num.length) return this.clone().iadd(num);
          return num.clone().iadd(this);
        };
        BN3.prototype.isub = function isub(num) {
          if (num.negative !== 0) {
            num.negative = 0;
            var r = this.iadd(num);
            num.negative = 1;
            return r._normSign();
          } else if (this.negative !== 0) {
            this.negative = 0;
            this.iadd(num);
            this.negative = 1;
            return this._normSign();
          }
          var cmp = this.cmp(num);
          if (cmp === 0) {
            this.negative = 0;
            this.length = 1;
            this.words[0] = 0;
            return this;
          }
          var a, b;
          if (cmp > 0) {
            a = this;
            b = num;
          } else {
            a = num;
            b = this;
          }
          var carry = 0;
          for (var i = 0; i < b.length; i++) {
            r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
            carry = r >> 26;
            this.words[i] = r & 67108863;
          }
          for (; carry !== 0 && i < a.length; i++) {
            r = (a.words[i] | 0) + carry;
            carry = r >> 26;
            this.words[i] = r & 67108863;
          }
          if (carry === 0 && i < a.length && a !== this) {
            for (; i < a.length; i++) {
              this.words[i] = a.words[i];
            }
          }
          this.length = Math.max(this.length, i);
          if (a !== this) {
            this.negative = 1;
          }
          return this._strip();
        };
        BN3.prototype.sub = function sub(num) {
          return this.clone().isub(num);
        };
        function smallMulTo(self2, num, out) {
          out.negative = num.negative ^ self2.negative;
          var len = self2.length + num.length | 0;
          out.length = len;
          len = len - 1 | 0;
          var a = self2.words[0] | 0;
          var b = num.words[0] | 0;
          var r = a * b;
          var lo = r & 67108863;
          var carry = r / 67108864 | 0;
          out.words[0] = lo;
          for (var k = 1; k < len; k++) {
            var ncarry = carry >>> 26;
            var rword = carry & 67108863;
            var maxJ = Math.min(k, num.length - 1);
            for (var j = Math.max(0, k - self2.length + 1); j <= maxJ; j++) {
              var i = k - j | 0;
              a = self2.words[i] | 0;
              b = num.words[j] | 0;
              r = a * b + rword;
              ncarry += r / 67108864 | 0;
              rword = r & 67108863;
            }
            out.words[k] = rword | 0;
            carry = ncarry | 0;
          }
          if (carry !== 0) {
            out.words[k] = carry | 0;
          } else {
            out.length--;
          }
          return out._strip();
        }
        var comb10MulTo = function comb10MulTo2(self2, num, out) {
          var a = self2.words;
          var b = num.words;
          var o = out.words;
          var c = 0;
          var lo;
          var mid;
          var hi;
          var a0 = a[0] | 0;
          var al0 = a0 & 8191;
          var ah0 = a0 >>> 13;
          var a1 = a[1] | 0;
          var al1 = a1 & 8191;
          var ah1 = a1 >>> 13;
          var a2 = a[2] | 0;
          var al2 = a2 & 8191;
          var ah2 = a2 >>> 13;
          var a3 = a[3] | 0;
          var al3 = a3 & 8191;
          var ah3 = a3 >>> 13;
          var a4 = a[4] | 0;
          var al4 = a4 & 8191;
          var ah4 = a4 >>> 13;
          var a5 = a[5] | 0;
          var al5 = a5 & 8191;
          var ah5 = a5 >>> 13;
          var a6 = a[6] | 0;
          var al6 = a6 & 8191;
          var ah6 = a6 >>> 13;
          var a7 = a[7] | 0;
          var al7 = a7 & 8191;
          var ah7 = a7 >>> 13;
          var a8 = a[8] | 0;
          var al8 = a8 & 8191;
          var ah8 = a8 >>> 13;
          var a9 = a[9] | 0;
          var al9 = a9 & 8191;
          var ah9 = a9 >>> 13;
          var b0 = b[0] | 0;
          var bl0 = b0 & 8191;
          var bh0 = b0 >>> 13;
          var b1 = b[1] | 0;
          var bl1 = b1 & 8191;
          var bh1 = b1 >>> 13;
          var b2 = b[2] | 0;
          var bl2 = b2 & 8191;
          var bh2 = b2 >>> 13;
          var b3 = b[3] | 0;
          var bl3 = b3 & 8191;
          var bh3 = b3 >>> 13;
          var b4 = b[4] | 0;
          var bl4 = b4 & 8191;
          var bh4 = b4 >>> 13;
          var b5 = b[5] | 0;
          var bl5 = b5 & 8191;
          var bh5 = b5 >>> 13;
          var b6 = b[6] | 0;
          var bl6 = b6 & 8191;
          var bh6 = b6 >>> 13;
          var b7 = b[7] | 0;
          var bl7 = b7 & 8191;
          var bh7 = b7 >>> 13;
          var b8 = b[8] | 0;
          var bl8 = b8 & 8191;
          var bh8 = b8 >>> 13;
          var b9 = b[9] | 0;
          var bl9 = b9 & 8191;
          var bh9 = b9 >>> 13;
          out.negative = self2.negative ^ num.negative;
          out.length = 19;
          lo = Math.imul(al0, bl0);
          mid = Math.imul(al0, bh0);
          mid = mid + Math.imul(ah0, bl0) | 0;
          hi = Math.imul(ah0, bh0);
          var w0 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w0 >>> 26) | 0;
          w0 &= 67108863;
          lo = Math.imul(al1, bl0);
          mid = Math.imul(al1, bh0);
          mid = mid + Math.imul(ah1, bl0) | 0;
          hi = Math.imul(ah1, bh0);
          lo = lo + Math.imul(al0, bl1) | 0;
          mid = mid + Math.imul(al0, bh1) | 0;
          mid = mid + Math.imul(ah0, bl1) | 0;
          hi = hi + Math.imul(ah0, bh1) | 0;
          var w1 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w1 >>> 26) | 0;
          w1 &= 67108863;
          lo = Math.imul(al2, bl0);
          mid = Math.imul(al2, bh0);
          mid = mid + Math.imul(ah2, bl0) | 0;
          hi = Math.imul(ah2, bh0);
          lo = lo + Math.imul(al1, bl1) | 0;
          mid = mid + Math.imul(al1, bh1) | 0;
          mid = mid + Math.imul(ah1, bl1) | 0;
          hi = hi + Math.imul(ah1, bh1) | 0;
          lo = lo + Math.imul(al0, bl2) | 0;
          mid = mid + Math.imul(al0, bh2) | 0;
          mid = mid + Math.imul(ah0, bl2) | 0;
          hi = hi + Math.imul(ah0, bh2) | 0;
          var w2 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w2 >>> 26) | 0;
          w2 &= 67108863;
          lo = Math.imul(al3, bl0);
          mid = Math.imul(al3, bh0);
          mid = mid + Math.imul(ah3, bl0) | 0;
          hi = Math.imul(ah3, bh0);
          lo = lo + Math.imul(al2, bl1) | 0;
          mid = mid + Math.imul(al2, bh1) | 0;
          mid = mid + Math.imul(ah2, bl1) | 0;
          hi = hi + Math.imul(ah2, bh1) | 0;
          lo = lo + Math.imul(al1, bl2) | 0;
          mid = mid + Math.imul(al1, bh2) | 0;
          mid = mid + Math.imul(ah1, bl2) | 0;
          hi = hi + Math.imul(ah1, bh2) | 0;
          lo = lo + Math.imul(al0, bl3) | 0;
          mid = mid + Math.imul(al0, bh3) | 0;
          mid = mid + Math.imul(ah0, bl3) | 0;
          hi = hi + Math.imul(ah0, bh3) | 0;
          var w3 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w3 >>> 26) | 0;
          w3 &= 67108863;
          lo = Math.imul(al4, bl0);
          mid = Math.imul(al4, bh0);
          mid = mid + Math.imul(ah4, bl0) | 0;
          hi = Math.imul(ah4, bh0);
          lo = lo + Math.imul(al3, bl1) | 0;
          mid = mid + Math.imul(al3, bh1) | 0;
          mid = mid + Math.imul(ah3, bl1) | 0;
          hi = hi + Math.imul(ah3, bh1) | 0;
          lo = lo + Math.imul(al2, bl2) | 0;
          mid = mid + Math.imul(al2, bh2) | 0;
          mid = mid + Math.imul(ah2, bl2) | 0;
          hi = hi + Math.imul(ah2, bh2) | 0;
          lo = lo + Math.imul(al1, bl3) | 0;
          mid = mid + Math.imul(al1, bh3) | 0;
          mid = mid + Math.imul(ah1, bl3) | 0;
          hi = hi + Math.imul(ah1, bh3) | 0;
          lo = lo + Math.imul(al0, bl4) | 0;
          mid = mid + Math.imul(al0, bh4) | 0;
          mid = mid + Math.imul(ah0, bl4) | 0;
          hi = hi + Math.imul(ah0, bh4) | 0;
          var w4 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w4 >>> 26) | 0;
          w4 &= 67108863;
          lo = Math.imul(al5, bl0);
          mid = Math.imul(al5, bh0);
          mid = mid + Math.imul(ah5, bl0) | 0;
          hi = Math.imul(ah5, bh0);
          lo = lo + Math.imul(al4, bl1) | 0;
          mid = mid + Math.imul(al4, bh1) | 0;
          mid = mid + Math.imul(ah4, bl1) | 0;
          hi = hi + Math.imul(ah4, bh1) | 0;
          lo = lo + Math.imul(al3, bl2) | 0;
          mid = mid + Math.imul(al3, bh2) | 0;
          mid = mid + Math.imul(ah3, bl2) | 0;
          hi = hi + Math.imul(ah3, bh2) | 0;
          lo = lo + Math.imul(al2, bl3) | 0;
          mid = mid + Math.imul(al2, bh3) | 0;
          mid = mid + Math.imul(ah2, bl3) | 0;
          hi = hi + Math.imul(ah2, bh3) | 0;
          lo = lo + Math.imul(al1, bl4) | 0;
          mid = mid + Math.imul(al1, bh4) | 0;
          mid = mid + Math.imul(ah1, bl4) | 0;
          hi = hi + Math.imul(ah1, bh4) | 0;
          lo = lo + Math.imul(al0, bl5) | 0;
          mid = mid + Math.imul(al0, bh5) | 0;
          mid = mid + Math.imul(ah0, bl5) | 0;
          hi = hi + Math.imul(ah0, bh5) | 0;
          var w5 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w5 >>> 26) | 0;
          w5 &= 67108863;
          lo = Math.imul(al6, bl0);
          mid = Math.imul(al6, bh0);
          mid = mid + Math.imul(ah6, bl0) | 0;
          hi = Math.imul(ah6, bh0);
          lo = lo + Math.imul(al5, bl1) | 0;
          mid = mid + Math.imul(al5, bh1) | 0;
          mid = mid + Math.imul(ah5, bl1) | 0;
          hi = hi + Math.imul(ah5, bh1) | 0;
          lo = lo + Math.imul(al4, bl2) | 0;
          mid = mid + Math.imul(al4, bh2) | 0;
          mid = mid + Math.imul(ah4, bl2) | 0;
          hi = hi + Math.imul(ah4, bh2) | 0;
          lo = lo + Math.imul(al3, bl3) | 0;
          mid = mid + Math.imul(al3, bh3) | 0;
          mid = mid + Math.imul(ah3, bl3) | 0;
          hi = hi + Math.imul(ah3, bh3) | 0;
          lo = lo + Math.imul(al2, bl4) | 0;
          mid = mid + Math.imul(al2, bh4) | 0;
          mid = mid + Math.imul(ah2, bl4) | 0;
          hi = hi + Math.imul(ah2, bh4) | 0;
          lo = lo + Math.imul(al1, bl5) | 0;
          mid = mid + Math.imul(al1, bh5) | 0;
          mid = mid + Math.imul(ah1, bl5) | 0;
          hi = hi + Math.imul(ah1, bh5) | 0;
          lo = lo + Math.imul(al0, bl6) | 0;
          mid = mid + Math.imul(al0, bh6) | 0;
          mid = mid + Math.imul(ah0, bl6) | 0;
          hi = hi + Math.imul(ah0, bh6) | 0;
          var w6 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w6 >>> 26) | 0;
          w6 &= 67108863;
          lo = Math.imul(al7, bl0);
          mid = Math.imul(al7, bh0);
          mid = mid + Math.imul(ah7, bl0) | 0;
          hi = Math.imul(ah7, bh0);
          lo = lo + Math.imul(al6, bl1) | 0;
          mid = mid + Math.imul(al6, bh1) | 0;
          mid = mid + Math.imul(ah6, bl1) | 0;
          hi = hi + Math.imul(ah6, bh1) | 0;
          lo = lo + Math.imul(al5, bl2) | 0;
          mid = mid + Math.imul(al5, bh2) | 0;
          mid = mid + Math.imul(ah5, bl2) | 0;
          hi = hi + Math.imul(ah5, bh2) | 0;
          lo = lo + Math.imul(al4, bl3) | 0;
          mid = mid + Math.imul(al4, bh3) | 0;
          mid = mid + Math.imul(ah4, bl3) | 0;
          hi = hi + Math.imul(ah4, bh3) | 0;
          lo = lo + Math.imul(al3, bl4) | 0;
          mid = mid + Math.imul(al3, bh4) | 0;
          mid = mid + Math.imul(ah3, bl4) | 0;
          hi = hi + Math.imul(ah3, bh4) | 0;
          lo = lo + Math.imul(al2, bl5) | 0;
          mid = mid + Math.imul(al2, bh5) | 0;
          mid = mid + Math.imul(ah2, bl5) | 0;
          hi = hi + Math.imul(ah2, bh5) | 0;
          lo = lo + Math.imul(al1, bl6) | 0;
          mid = mid + Math.imul(al1, bh6) | 0;
          mid = mid + Math.imul(ah1, bl6) | 0;
          hi = hi + Math.imul(ah1, bh6) | 0;
          lo = lo + Math.imul(al0, bl7) | 0;
          mid = mid + Math.imul(al0, bh7) | 0;
          mid = mid + Math.imul(ah0, bl7) | 0;
          hi = hi + Math.imul(ah0, bh7) | 0;
          var w7 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w7 >>> 26) | 0;
          w7 &= 67108863;
          lo = Math.imul(al8, bl0);
          mid = Math.imul(al8, bh0);
          mid = mid + Math.imul(ah8, bl0) | 0;
          hi = Math.imul(ah8, bh0);
          lo = lo + Math.imul(al7, bl1) | 0;
          mid = mid + Math.imul(al7, bh1) | 0;
          mid = mid + Math.imul(ah7, bl1) | 0;
          hi = hi + Math.imul(ah7, bh1) | 0;
          lo = lo + Math.imul(al6, bl2) | 0;
          mid = mid + Math.imul(al6, bh2) | 0;
          mid = mid + Math.imul(ah6, bl2) | 0;
          hi = hi + Math.imul(ah6, bh2) | 0;
          lo = lo + Math.imul(al5, bl3) | 0;
          mid = mid + Math.imul(al5, bh3) | 0;
          mid = mid + Math.imul(ah5, bl3) | 0;
          hi = hi + Math.imul(ah5, bh3) | 0;
          lo = lo + Math.imul(al4, bl4) | 0;
          mid = mid + Math.imul(al4, bh4) | 0;
          mid = mid + Math.imul(ah4, bl4) | 0;
          hi = hi + Math.imul(ah4, bh4) | 0;
          lo = lo + Math.imul(al3, bl5) | 0;
          mid = mid + Math.imul(al3, bh5) | 0;
          mid = mid + Math.imul(ah3, bl5) | 0;
          hi = hi + Math.imul(ah3, bh5) | 0;
          lo = lo + Math.imul(al2, bl6) | 0;
          mid = mid + Math.imul(al2, bh6) | 0;
          mid = mid + Math.imul(ah2, bl6) | 0;
          hi = hi + Math.imul(ah2, bh6) | 0;
          lo = lo + Math.imul(al1, bl7) | 0;
          mid = mid + Math.imul(al1, bh7) | 0;
          mid = mid + Math.imul(ah1, bl7) | 0;
          hi = hi + Math.imul(ah1, bh7) | 0;
          lo = lo + Math.imul(al0, bl8) | 0;
          mid = mid + Math.imul(al0, bh8) | 0;
          mid = mid + Math.imul(ah0, bl8) | 0;
          hi = hi + Math.imul(ah0, bh8) | 0;
          var w8 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w8 >>> 26) | 0;
          w8 &= 67108863;
          lo = Math.imul(al9, bl0);
          mid = Math.imul(al9, bh0);
          mid = mid + Math.imul(ah9, bl0) | 0;
          hi = Math.imul(ah9, bh0);
          lo = lo + Math.imul(al8, bl1) | 0;
          mid = mid + Math.imul(al8, bh1) | 0;
          mid = mid + Math.imul(ah8, bl1) | 0;
          hi = hi + Math.imul(ah8, bh1) | 0;
          lo = lo + Math.imul(al7, bl2) | 0;
          mid = mid + Math.imul(al7, bh2) | 0;
          mid = mid + Math.imul(ah7, bl2) | 0;
          hi = hi + Math.imul(ah7, bh2) | 0;
          lo = lo + Math.imul(al6, bl3) | 0;
          mid = mid + Math.imul(al6, bh3) | 0;
          mid = mid + Math.imul(ah6, bl3) | 0;
          hi = hi + Math.imul(ah6, bh3) | 0;
          lo = lo + Math.imul(al5, bl4) | 0;
          mid = mid + Math.imul(al5, bh4) | 0;
          mid = mid + Math.imul(ah5, bl4) | 0;
          hi = hi + Math.imul(ah5, bh4) | 0;
          lo = lo + Math.imul(al4, bl5) | 0;
          mid = mid + Math.imul(al4, bh5) | 0;
          mid = mid + Math.imul(ah4, bl5) | 0;
          hi = hi + Math.imul(ah4, bh5) | 0;
          lo = lo + Math.imul(al3, bl6) | 0;
          mid = mid + Math.imul(al3, bh6) | 0;
          mid = mid + Math.imul(ah3, bl6) | 0;
          hi = hi + Math.imul(ah3, bh6) | 0;
          lo = lo + Math.imul(al2, bl7) | 0;
          mid = mid + Math.imul(al2, bh7) | 0;
          mid = mid + Math.imul(ah2, bl7) | 0;
          hi = hi + Math.imul(ah2, bh7) | 0;
          lo = lo + Math.imul(al1, bl8) | 0;
          mid = mid + Math.imul(al1, bh8) | 0;
          mid = mid + Math.imul(ah1, bl8) | 0;
          hi = hi + Math.imul(ah1, bh8) | 0;
          lo = lo + Math.imul(al0, bl9) | 0;
          mid = mid + Math.imul(al0, bh9) | 0;
          mid = mid + Math.imul(ah0, bl9) | 0;
          hi = hi + Math.imul(ah0, bh9) | 0;
          var w9 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w9 >>> 26) | 0;
          w9 &= 67108863;
          lo = Math.imul(al9, bl1);
          mid = Math.imul(al9, bh1);
          mid = mid + Math.imul(ah9, bl1) | 0;
          hi = Math.imul(ah9, bh1);
          lo = lo + Math.imul(al8, bl2) | 0;
          mid = mid + Math.imul(al8, bh2) | 0;
          mid = mid + Math.imul(ah8, bl2) | 0;
          hi = hi + Math.imul(ah8, bh2) | 0;
          lo = lo + Math.imul(al7, bl3) | 0;
          mid = mid + Math.imul(al7, bh3) | 0;
          mid = mid + Math.imul(ah7, bl3) | 0;
          hi = hi + Math.imul(ah7, bh3) | 0;
          lo = lo + Math.imul(al6, bl4) | 0;
          mid = mid + Math.imul(al6, bh4) | 0;
          mid = mid + Math.imul(ah6, bl4) | 0;
          hi = hi + Math.imul(ah6, bh4) | 0;
          lo = lo + Math.imul(al5, bl5) | 0;
          mid = mid + Math.imul(al5, bh5) | 0;
          mid = mid + Math.imul(ah5, bl5) | 0;
          hi = hi + Math.imul(ah5, bh5) | 0;
          lo = lo + Math.imul(al4, bl6) | 0;
          mid = mid + Math.imul(al4, bh6) | 0;
          mid = mid + Math.imul(ah4, bl6) | 0;
          hi = hi + Math.imul(ah4, bh6) | 0;
          lo = lo + Math.imul(al3, bl7) | 0;
          mid = mid + Math.imul(al3, bh7) | 0;
          mid = mid + Math.imul(ah3, bl7) | 0;
          hi = hi + Math.imul(ah3, bh7) | 0;
          lo = lo + Math.imul(al2, bl8) | 0;
          mid = mid + Math.imul(al2, bh8) | 0;
          mid = mid + Math.imul(ah2, bl8) | 0;
          hi = hi + Math.imul(ah2, bh8) | 0;
          lo = lo + Math.imul(al1, bl9) | 0;
          mid = mid + Math.imul(al1, bh9) | 0;
          mid = mid + Math.imul(ah1, bl9) | 0;
          hi = hi + Math.imul(ah1, bh9) | 0;
          var w10 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w10 >>> 26) | 0;
          w10 &= 67108863;
          lo = Math.imul(al9, bl2);
          mid = Math.imul(al9, bh2);
          mid = mid + Math.imul(ah9, bl2) | 0;
          hi = Math.imul(ah9, bh2);
          lo = lo + Math.imul(al8, bl3) | 0;
          mid = mid + Math.imul(al8, bh3) | 0;
          mid = mid + Math.imul(ah8, bl3) | 0;
          hi = hi + Math.imul(ah8, bh3) | 0;
          lo = lo + Math.imul(al7, bl4) | 0;
          mid = mid + Math.imul(al7, bh4) | 0;
          mid = mid + Math.imul(ah7, bl4) | 0;
          hi = hi + Math.imul(ah7, bh4) | 0;
          lo = lo + Math.imul(al6, bl5) | 0;
          mid = mid + Math.imul(al6, bh5) | 0;
          mid = mid + Math.imul(ah6, bl5) | 0;
          hi = hi + Math.imul(ah6, bh5) | 0;
          lo = lo + Math.imul(al5, bl6) | 0;
          mid = mid + Math.imul(al5, bh6) | 0;
          mid = mid + Math.imul(ah5, bl6) | 0;
          hi = hi + Math.imul(ah5, bh6) | 0;
          lo = lo + Math.imul(al4, bl7) | 0;
          mid = mid + Math.imul(al4, bh7) | 0;
          mid = mid + Math.imul(ah4, bl7) | 0;
          hi = hi + Math.imul(ah4, bh7) | 0;
          lo = lo + Math.imul(al3, bl8) | 0;
          mid = mid + Math.imul(al3, bh8) | 0;
          mid = mid + Math.imul(ah3, bl8) | 0;
          hi = hi + Math.imul(ah3, bh8) | 0;
          lo = lo + Math.imul(al2, bl9) | 0;
          mid = mid + Math.imul(al2, bh9) | 0;
          mid = mid + Math.imul(ah2, bl9) | 0;
          hi = hi + Math.imul(ah2, bh9) | 0;
          var w11 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w11 >>> 26) | 0;
          w11 &= 67108863;
          lo = Math.imul(al9, bl3);
          mid = Math.imul(al9, bh3);
          mid = mid + Math.imul(ah9, bl3) | 0;
          hi = Math.imul(ah9, bh3);
          lo = lo + Math.imul(al8, bl4) | 0;
          mid = mid + Math.imul(al8, bh4) | 0;
          mid = mid + Math.imul(ah8, bl4) | 0;
          hi = hi + Math.imul(ah8, bh4) | 0;
          lo = lo + Math.imul(al7, bl5) | 0;
          mid = mid + Math.imul(al7, bh5) | 0;
          mid = mid + Math.imul(ah7, bl5) | 0;
          hi = hi + Math.imul(ah7, bh5) | 0;
          lo = lo + Math.imul(al6, bl6) | 0;
          mid = mid + Math.imul(al6, bh6) | 0;
          mid = mid + Math.imul(ah6, bl6) | 0;
          hi = hi + Math.imul(ah6, bh6) | 0;
          lo = lo + Math.imul(al5, bl7) | 0;
          mid = mid + Math.imul(al5, bh7) | 0;
          mid = mid + Math.imul(ah5, bl7) | 0;
          hi = hi + Math.imul(ah5, bh7) | 0;
          lo = lo + Math.imul(al4, bl8) | 0;
          mid = mid + Math.imul(al4, bh8) | 0;
          mid = mid + Math.imul(ah4, bl8) | 0;
          hi = hi + Math.imul(ah4, bh8) | 0;
          lo = lo + Math.imul(al3, bl9) | 0;
          mid = mid + Math.imul(al3, bh9) | 0;
          mid = mid + Math.imul(ah3, bl9) | 0;
          hi = hi + Math.imul(ah3, bh9) | 0;
          var w12 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w12 >>> 26) | 0;
          w12 &= 67108863;
          lo = Math.imul(al9, bl4);
          mid = Math.imul(al9, bh4);
          mid = mid + Math.imul(ah9, bl4) | 0;
          hi = Math.imul(ah9, bh4);
          lo = lo + Math.imul(al8, bl5) | 0;
          mid = mid + Math.imul(al8, bh5) | 0;
          mid = mid + Math.imul(ah8, bl5) | 0;
          hi = hi + Math.imul(ah8, bh5) | 0;
          lo = lo + Math.imul(al7, bl6) | 0;
          mid = mid + Math.imul(al7, bh6) | 0;
          mid = mid + Math.imul(ah7, bl6) | 0;
          hi = hi + Math.imul(ah7, bh6) | 0;
          lo = lo + Math.imul(al6, bl7) | 0;
          mid = mid + Math.imul(al6, bh7) | 0;
          mid = mid + Math.imul(ah6, bl7) | 0;
          hi = hi + Math.imul(ah6, bh7) | 0;
          lo = lo + Math.imul(al5, bl8) | 0;
          mid = mid + Math.imul(al5, bh8) | 0;
          mid = mid + Math.imul(ah5, bl8) | 0;
          hi = hi + Math.imul(ah5, bh8) | 0;
          lo = lo + Math.imul(al4, bl9) | 0;
          mid = mid + Math.imul(al4, bh9) | 0;
          mid = mid + Math.imul(ah4, bl9) | 0;
          hi = hi + Math.imul(ah4, bh9) | 0;
          var w13 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w13 >>> 26) | 0;
          w13 &= 67108863;
          lo = Math.imul(al9, bl5);
          mid = Math.imul(al9, bh5);
          mid = mid + Math.imul(ah9, bl5) | 0;
          hi = Math.imul(ah9, bh5);
          lo = lo + Math.imul(al8, bl6) | 0;
          mid = mid + Math.imul(al8, bh6) | 0;
          mid = mid + Math.imul(ah8, bl6) | 0;
          hi = hi + Math.imul(ah8, bh6) | 0;
          lo = lo + Math.imul(al7, bl7) | 0;
          mid = mid + Math.imul(al7, bh7) | 0;
          mid = mid + Math.imul(ah7, bl7) | 0;
          hi = hi + Math.imul(ah7, bh7) | 0;
          lo = lo + Math.imul(al6, bl8) | 0;
          mid = mid + Math.imul(al6, bh8) | 0;
          mid = mid + Math.imul(ah6, bl8) | 0;
          hi = hi + Math.imul(ah6, bh8) | 0;
          lo = lo + Math.imul(al5, bl9) | 0;
          mid = mid + Math.imul(al5, bh9) | 0;
          mid = mid + Math.imul(ah5, bl9) | 0;
          hi = hi + Math.imul(ah5, bh9) | 0;
          var w14 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w14 >>> 26) | 0;
          w14 &= 67108863;
          lo = Math.imul(al9, bl6);
          mid = Math.imul(al9, bh6);
          mid = mid + Math.imul(ah9, bl6) | 0;
          hi = Math.imul(ah9, bh6);
          lo = lo + Math.imul(al8, bl7) | 0;
          mid = mid + Math.imul(al8, bh7) | 0;
          mid = mid + Math.imul(ah8, bl7) | 0;
          hi = hi + Math.imul(ah8, bh7) | 0;
          lo = lo + Math.imul(al7, bl8) | 0;
          mid = mid + Math.imul(al7, bh8) | 0;
          mid = mid + Math.imul(ah7, bl8) | 0;
          hi = hi + Math.imul(ah7, bh8) | 0;
          lo = lo + Math.imul(al6, bl9) | 0;
          mid = mid + Math.imul(al6, bh9) | 0;
          mid = mid + Math.imul(ah6, bl9) | 0;
          hi = hi + Math.imul(ah6, bh9) | 0;
          var w15 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w15 >>> 26) | 0;
          w15 &= 67108863;
          lo = Math.imul(al9, bl7);
          mid = Math.imul(al9, bh7);
          mid = mid + Math.imul(ah9, bl7) | 0;
          hi = Math.imul(ah9, bh7);
          lo = lo + Math.imul(al8, bl8) | 0;
          mid = mid + Math.imul(al8, bh8) | 0;
          mid = mid + Math.imul(ah8, bl8) | 0;
          hi = hi + Math.imul(ah8, bh8) | 0;
          lo = lo + Math.imul(al7, bl9) | 0;
          mid = mid + Math.imul(al7, bh9) | 0;
          mid = mid + Math.imul(ah7, bl9) | 0;
          hi = hi + Math.imul(ah7, bh9) | 0;
          var w16 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w16 >>> 26) | 0;
          w16 &= 67108863;
          lo = Math.imul(al9, bl8);
          mid = Math.imul(al9, bh8);
          mid = mid + Math.imul(ah9, bl8) | 0;
          hi = Math.imul(ah9, bh8);
          lo = lo + Math.imul(al8, bl9) | 0;
          mid = mid + Math.imul(al8, bh9) | 0;
          mid = mid + Math.imul(ah8, bl9) | 0;
          hi = hi + Math.imul(ah8, bh9) | 0;
          var w17 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w17 >>> 26) | 0;
          w17 &= 67108863;
          lo = Math.imul(al9, bl9);
          mid = Math.imul(al9, bh9);
          mid = mid + Math.imul(ah9, bl9) | 0;
          hi = Math.imul(ah9, bh9);
          var w18 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
          c = (hi + (mid >>> 13) | 0) + (w18 >>> 26) | 0;
          w18 &= 67108863;
          o[0] = w0;
          o[1] = w1;
          o[2] = w2;
          o[3] = w3;
          o[4] = w4;
          o[5] = w5;
          o[6] = w6;
          o[7] = w7;
          o[8] = w8;
          o[9] = w9;
          o[10] = w10;
          o[11] = w11;
          o[12] = w12;
          o[13] = w13;
          o[14] = w14;
          o[15] = w15;
          o[16] = w16;
          o[17] = w17;
          o[18] = w18;
          if (c !== 0) {
            o[19] = c;
            out.length++;
          }
          return out;
        };
        if (!Math.imul) {
          comb10MulTo = smallMulTo;
        }
        function bigMulTo(self2, num, out) {
          out.negative = num.negative ^ self2.negative;
          out.length = self2.length + num.length;
          var carry = 0;
          var hncarry = 0;
          for (var k = 0; k < out.length - 1; k++) {
            var ncarry = hncarry;
            hncarry = 0;
            var rword = carry & 67108863;
            var maxJ = Math.min(k, num.length - 1);
            for (var j = Math.max(0, k - self2.length + 1); j <= maxJ; j++) {
              var i = k - j;
              var a = self2.words[i] | 0;
              var b = num.words[j] | 0;
              var r = a * b;
              var lo = r & 67108863;
              ncarry = ncarry + (r / 67108864 | 0) | 0;
              lo = lo + rword | 0;
              rword = lo & 67108863;
              ncarry = ncarry + (lo >>> 26) | 0;
              hncarry += ncarry >>> 26;
              ncarry &= 67108863;
            }
            out.words[k] = rword;
            carry = ncarry;
            ncarry = hncarry;
          }
          if (carry !== 0) {
            out.words[k] = carry;
          } else {
            out.length--;
          }
          return out._strip();
        }
        function jumboMulTo(self2, num, out) {
          return bigMulTo(self2, num, out);
        }
        BN3.prototype.mulTo = function mulTo(num, out) {
          var res;
          var len = this.length + num.length;
          if (this.length === 10 && num.length === 10) {
            res = comb10MulTo(this, num, out);
          } else if (len < 63) {
            res = smallMulTo(this, num, out);
          } else if (len < 1024) {
            res = bigMulTo(this, num, out);
          } else {
            res = jumboMulTo(this, num, out);
          }
          return res;
        };
        function FFTM(x, y) {
          this.x = x;
          this.y = y;
        }
        FFTM.prototype.makeRBT = function makeRBT(N) {
          var t = new Array(N);
          var l = BN3.prototype._countBits(N) - 1;
          for (var i = 0; i < N; i++) {
            t[i] = this.revBin(i, l, N);
          }
          return t;
        };
        FFTM.prototype.revBin = function revBin(x, l, N) {
          if (x === 0 || x === N - 1) return x;
          var rb = 0;
          for (var i = 0; i < l; i++) {
            rb |= (x & 1) << l - i - 1;
            x >>= 1;
          }
          return rb;
        };
        FFTM.prototype.permute = function permute(rbt, rws, iws, rtws, itws, N) {
          for (var i = 0; i < N; i++) {
            rtws[i] = rws[rbt[i]];
            itws[i] = iws[rbt[i]];
          }
        };
        FFTM.prototype.transform = function transform(rws, iws, rtws, itws, N, rbt) {
          this.permute(rbt, rws, iws, rtws, itws, N);
          for (var s = 1; s < N; s <<= 1) {
            var l = s << 1;
            var rtwdf = Math.cos(2 * Math.PI / l);
            var itwdf = Math.sin(2 * Math.PI / l);
            for (var p = 0; p < N; p += l) {
              var rtwdf_ = rtwdf;
              var itwdf_ = itwdf;
              for (var j = 0; j < s; j++) {
                var re = rtws[p + j];
                var ie = itws[p + j];
                var ro = rtws[p + j + s];
                var io = itws[p + j + s];
                var rx = rtwdf_ * ro - itwdf_ * io;
                io = rtwdf_ * io + itwdf_ * ro;
                ro = rx;
                rtws[p + j] = re + ro;
                itws[p + j] = ie + io;
                rtws[p + j + s] = re - ro;
                itws[p + j + s] = ie - io;
                if (j !== l) {
                  rx = rtwdf * rtwdf_ - itwdf * itwdf_;
                  itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
                  rtwdf_ = rx;
                }
              }
            }
          }
        };
        FFTM.prototype.guessLen13b = function guessLen13b(n, m) {
          var N = Math.max(m, n) | 1;
          var odd = N & 1;
          var i = 0;
          for (N = N / 2 | 0; N; N = N >>> 1) {
            i++;
          }
          return 1 << i + 1 + odd;
        };
        FFTM.prototype.conjugate = function conjugate(rws, iws, N) {
          if (N <= 1) return;
          for (var i = 0; i < N / 2; i++) {
            var t = rws[i];
            rws[i] = rws[N - i - 1];
            rws[N - i - 1] = t;
            t = iws[i];
            iws[i] = -iws[N - i - 1];
            iws[N - i - 1] = -t;
          }
        };
        FFTM.prototype.normalize13b = function normalize13b(ws, N) {
          var carry = 0;
          for (var i = 0; i < N / 2; i++) {
            var w = Math.round(ws[2 * i + 1] / N) * 8192 + Math.round(ws[2 * i] / N) + carry;
            ws[i] = w & 67108863;
            if (w < 67108864) {
              carry = 0;
            } else {
              carry = w / 67108864 | 0;
            }
          }
          return ws;
        };
        FFTM.prototype.convert13b = function convert13b(ws, len, rws, N) {
          var carry = 0;
          for (var i = 0; i < len; i++) {
            carry = carry + (ws[i] | 0);
            rws[2 * i] = carry & 8191;
            carry = carry >>> 13;
            rws[2 * i + 1] = carry & 8191;
            carry = carry >>> 13;
          }
          for (i = 2 * len; i < N; ++i) {
            rws[i] = 0;
          }
          assert2(carry === 0);
          assert2((carry & ~8191) === 0);
        };
        FFTM.prototype.stub = function stub(N) {
          var ph = new Array(N);
          for (var i = 0; i < N; i++) {
            ph[i] = 0;
          }
          return ph;
        };
        FFTM.prototype.mulp = function mulp(x, y, out) {
          var N = 2 * this.guessLen13b(x.length, y.length);
          var rbt = this.makeRBT(N);
          var _ = this.stub(N);
          var rws = new Array(N);
          var rwst = new Array(N);
          var iwst = new Array(N);
          var nrws = new Array(N);
          var nrwst = new Array(N);
          var niwst = new Array(N);
          var rmws = out.words;
          rmws.length = N;
          this.convert13b(x.words, x.length, rws, N);
          this.convert13b(y.words, y.length, nrws, N);
          this.transform(rws, _, rwst, iwst, N, rbt);
          this.transform(nrws, _, nrwst, niwst, N, rbt);
          for (var i = 0; i < N; i++) {
            var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
            iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
            rwst[i] = rx;
          }
          this.conjugate(rwst, iwst, N);
          this.transform(rwst, iwst, rmws, _, N, rbt);
          this.conjugate(rmws, _, N);
          this.normalize13b(rmws, N);
          out.negative = x.negative ^ y.negative;
          out.length = x.length + y.length;
          return out._strip();
        };
        BN3.prototype.mul = function mul3(num) {
          var out = new BN3(null);
          out.words = new Array(this.length + num.length);
          return this.mulTo(num, out);
        };
        BN3.prototype.mulf = function mulf(num) {
          var out = new BN3(null);
          out.words = new Array(this.length + num.length);
          return jumboMulTo(this, num, out);
        };
        BN3.prototype.imul = function imul(num) {
          return this.clone().mulTo(num, this);
        };
        BN3.prototype.imuln = function imuln(num) {
          var isNegNum = num < 0;
          if (isNegNum) num = -num;
          assert2(typeof num === "number");
          assert2(num < 67108864);
          var carry = 0;
          for (var i = 0; i < this.length; i++) {
            var w = (this.words[i] | 0) * num;
            var lo = (w & 67108863) + (carry & 67108863);
            carry >>= 26;
            carry += w / 67108864 | 0;
            carry += lo >>> 26;
            this.words[i] = lo & 67108863;
          }
          if (carry !== 0) {
            this.words[i] = carry;
            this.length++;
          }
          if (num === 0) {
            this.length = 1;
            this._normSign();
          }
          return isNegNum ? this.ineg() : this;
        };
        BN3.prototype.muln = function muln(num) {
          return this.clone().imuln(num);
        };
        BN3.prototype.sqr = function sqr() {
          return this.mul(this);
        };
        BN3.prototype.isqr = function isqr() {
          return this.imul(this.clone());
        };
        BN3.prototype.pow = function pow(num) {
          var w = toBitArray(num);
          if (w.length === 0) return new BN3(1);
          var res = this;
          for (var i = 0; i < w.length; i++, res = res.sqr()) {
            if (w[i] !== 0) break;
          }
          if (++i < w.length) {
            for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
              if (w[i] === 0) continue;
              res = res.mul(q);
            }
          }
          return res;
        };
        BN3.prototype.iushln = function iushln(bits) {
          assert2(typeof bits === "number" && bits >= 0);
          var r = bits % 26;
          var s = (bits - r) / 26;
          var carryMask = 67108863 >>> 26 - r << 26 - r;
          var i;
          if (r !== 0) {
            var carry = 0;
            for (i = 0; i < this.length; i++) {
              var newCarry = this.words[i] & carryMask;
              var c = (this.words[i] | 0) - newCarry << r;
              this.words[i] = c | carry;
              carry = newCarry >>> 26 - r;
            }
            if (carry) {
              this.words[i] = carry;
              this.length++;
            }
          }
          if (s !== 0) {
            for (i = this.length - 1; i >= 0; i--) {
              this.words[i + s] = this.words[i];
            }
            for (i = 0; i < s; i++) {
              this.words[i] = 0;
            }
            this.length += s;
          }
          return this._strip();
        };
        BN3.prototype.ishln = function ishln(bits) {
          assert2(this.negative === 0);
          return this.iushln(bits);
        };
        BN3.prototype.iushrn = function iushrn(bits, hint, extended) {
          assert2(typeof bits === "number" && bits >= 0);
          var h;
          if (hint) {
            h = (hint - hint % 26) / 26;
          } else {
            h = 0;
          }
          var r = bits % 26;
          var s = Math.min((bits - r) / 26, this.length);
          var mask = 67108863 ^ 67108863 >>> r << r;
          var maskedWords = extended;
          h -= s;
          h = Math.max(0, h);
          if (maskedWords) {
            for (var i = 0; i < s; i++) {
              maskedWords.words[i] = this.words[i];
            }
            maskedWords.length = s;
          }
          if (s === 0) {
          } else if (this.length > s) {
            this.length -= s;
            for (i = 0; i < this.length; i++) {
              this.words[i] = this.words[i + s];
            }
          } else {
            this.words[0] = 0;
            this.length = 1;
          }
          var carry = 0;
          for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
            var word = this.words[i] | 0;
            this.words[i] = carry << 26 - r | word >>> r;
            carry = word & mask;
          }
          if (maskedWords && carry !== 0) {
            maskedWords.words[maskedWords.length++] = carry;
          }
          if (this.length === 0) {
            this.words[0] = 0;
            this.length = 1;
          }
          return this._strip();
        };
        BN3.prototype.ishrn = function ishrn(bits, hint, extended) {
          assert2(this.negative === 0);
          return this.iushrn(bits, hint, extended);
        };
        BN3.prototype.shln = function shln(bits) {
          return this.clone().ishln(bits);
        };
        BN3.prototype.ushln = function ushln(bits) {
          return this.clone().iushln(bits);
        };
        BN3.prototype.shrn = function shrn(bits) {
          return this.clone().ishrn(bits);
        };
        BN3.prototype.ushrn = function ushrn(bits) {
          return this.clone().iushrn(bits);
        };
        BN3.prototype.testn = function testn(bit) {
          assert2(typeof bit === "number" && bit >= 0);
          var r = bit % 26;
          var s = (bit - r) / 26;
          var q = 1 << r;
          if (this.length <= s) return false;
          var w = this.words[s];
          return !!(w & q);
        };
        BN3.prototype.imaskn = function imaskn(bits) {
          assert2(typeof bits === "number" && bits >= 0);
          var r = bits % 26;
          var s = (bits - r) / 26;
          assert2(this.negative === 0, "imaskn works only with positive numbers");
          if (this.length <= s) {
            return this;
          }
          if (r !== 0) {
            s++;
          }
          this.length = Math.min(s, this.length);
          if (r !== 0) {
            var mask = 67108863 ^ 67108863 >>> r << r;
            this.words[this.length - 1] &= mask;
          }
          if (this.length === 0) {
            this.words[0] = 0;
            this.length = 1;
          }
          return this._strip();
        };
        BN3.prototype.maskn = function maskn(bits) {
          return this.clone().imaskn(bits);
        };
        BN3.prototype.iaddn = function iaddn(num) {
          assert2(typeof num === "number");
          assert2(num < 67108864);
          if (num < 0) return this.isubn(-num);
          if (this.negative !== 0) {
            if (this.length === 1 && (this.words[0] | 0) <= num) {
              this.words[0] = num - (this.words[0] | 0);
              this.negative = 0;
              return this;
            }
            this.negative = 0;
            this.isubn(num);
            this.negative = 1;
            return this;
          }
          return this._iaddn(num);
        };
        BN3.prototype._iaddn = function _iaddn(num) {
          this.words[0] += num;
          for (var i = 0; i < this.length && this.words[i] >= 67108864; i++) {
            this.words[i] -= 67108864;
            if (i === this.length - 1) {
              this.words[i + 1] = 1;
            } else {
              this.words[i + 1]++;
            }
          }
          this.length = Math.max(this.length, i + 1);
          return this;
        };
        BN3.prototype.isubn = function isubn(num) {
          assert2(typeof num === "number");
          assert2(num < 67108864);
          if (num < 0) return this.iaddn(-num);
          if (this.negative !== 0) {
            this.negative = 0;
            this.iaddn(num);
            this.negative = 1;
            return this;
          }
          this.words[0] -= num;
          if (this.length === 1 && this.words[0] < 0) {
            this.words[0] = -this.words[0];
            this.negative = 1;
          } else {
            for (var i = 0; i < this.length && this.words[i] < 0; i++) {
              this.words[i] += 67108864;
              this.words[i + 1] -= 1;
            }
          }
          return this._strip();
        };
        BN3.prototype.addn = function addn(num) {
          return this.clone().iaddn(num);
        };
        BN3.prototype.subn = function subn(num) {
          return this.clone().isubn(num);
        };
        BN3.prototype.iabs = function iabs() {
          this.negative = 0;
          return this;
        };
        BN3.prototype.abs = function abs() {
          return this.clone().iabs();
        };
        BN3.prototype._ishlnsubmul = function _ishlnsubmul(num, mul3, shift) {
          var len = num.length + shift;
          var i;
          this._expand(len);
          var w;
          var carry = 0;
          for (i = 0; i < num.length; i++) {
            w = (this.words[i + shift] | 0) + carry;
            var right = (num.words[i] | 0) * mul3;
            w -= right & 67108863;
            carry = (w >> 26) - (right / 67108864 | 0);
            this.words[i + shift] = w & 67108863;
          }
          for (; i < this.length - shift; i++) {
            w = (this.words[i + shift] | 0) + carry;
            carry = w >> 26;
            this.words[i + shift] = w & 67108863;
          }
          if (carry === 0) return this._strip();
          assert2(carry === -1);
          carry = 0;
          for (i = 0; i < this.length; i++) {
            w = -(this.words[i] | 0) + carry;
            carry = w >> 26;
            this.words[i] = w & 67108863;
          }
          this.negative = 1;
          return this._strip();
        };
        BN3.prototype._wordDiv = function _wordDiv(num, mode) {
          var shift = this.length - num.length;
          var a = this.clone();
          var b = num;
          var bhi = b.words[b.length - 1] | 0;
          var bhiBits = this._countBits(bhi);
          shift = 26 - bhiBits;
          if (shift !== 0) {
            b = b.ushln(shift);
            a.iushln(shift);
            bhi = b.words[b.length - 1] | 0;
          }
          var m = a.length - b.length;
          var q;
          if (mode !== "mod") {
            q = new BN3(null);
            q.length = m + 1;
            q.words = new Array(q.length);
            for (var i = 0; i < q.length; i++) {
              q.words[i] = 0;
            }
          }
          var diff = a.clone()._ishlnsubmul(b, 1, m);
          if (diff.negative === 0) {
            a = diff;
            if (q) {
              q.words[m] = 1;
            }
          }
          for (var j = m - 1; j >= 0; j--) {
            var qj = (a.words[b.length + j] | 0) * 67108864 + (a.words[b.length + j - 1] | 0);
            qj = Math.min(qj / bhi | 0, 67108863);
            a._ishlnsubmul(b, qj, j);
            while (a.negative !== 0) {
              qj--;
              a.negative = 0;
              a._ishlnsubmul(b, 1, j);
              if (!a.isZero()) {
                a.negative ^= 1;
              }
            }
            if (q) {
              q.words[j] = qj;
            }
          }
          if (q) {
            q._strip();
          }
          a._strip();
          if (mode !== "div" && shift !== 0) {
            a.iushrn(shift);
          }
          return {
            div: q || null,
            mod: a
          };
        };
        BN3.prototype.divmod = function divmod(num, mode, positive) {
          assert2(!num.isZero());
          if (this.isZero()) {
            return {
              div: new BN3(0),
              mod: new BN3(0)
            };
          }
          var div, mod, res;
          if (this.negative !== 0 && num.negative === 0) {
            res = this.neg().divmod(num, mode);
            if (mode !== "mod") {
              div = res.div.neg();
            }
            if (mode !== "div") {
              mod = res.mod.neg();
              if (positive && mod.negative !== 0) {
                mod.iadd(num);
              }
            }
            return {
              div,
              mod
            };
          }
          if (this.negative === 0 && num.negative !== 0) {
            res = this.divmod(num.neg(), mode);
            if (mode !== "mod") {
              div = res.div.neg();
            }
            return {
              div,
              mod: res.mod
            };
          }
          if ((this.negative & num.negative) !== 0) {
            res = this.neg().divmod(num.neg(), mode);
            if (mode !== "div") {
              mod = res.mod.neg();
              if (positive && mod.negative !== 0) {
                mod.isub(num);
              }
            }
            return {
              div: res.div,
              mod
            };
          }
          if (num.length > this.length || this.cmp(num) < 0) {
            return {
              div: new BN3(0),
              mod: this
            };
          }
          if (num.length === 1) {
            if (mode === "div") {
              return {
                div: this.divn(num.words[0]),
                mod: null
              };
            }
            if (mode === "mod") {
              return {
                div: null,
                mod: new BN3(this.modrn(num.words[0]))
              };
            }
            return {
              div: this.divn(num.words[0]),
              mod: new BN3(this.modrn(num.words[0]))
            };
          }
          return this._wordDiv(num, mode);
        };
        BN3.prototype.div = function div(num) {
          return this.divmod(num, "div", false).div;
        };
        BN3.prototype.mod = function mod(num) {
          return this.divmod(num, "mod", false).mod;
        };
        BN3.prototype.umod = function umod(num) {
          return this.divmod(num, "mod", true).mod;
        };
        BN3.prototype.divRound = function divRound(num) {
          var dm = this.divmod(num);
          if (dm.mod.isZero()) return dm.div;
          var mod = dm.mod.abs();
          var half = num.abs().iushrn(1);
          var r2 = num.words[0] & 1;
          var cmp = mod.cmp(half);
          if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;
          var up = new BN3(1);
          up.negative = this.negative ^ num.negative;
          return dm.div.iadd(up);
        };
        BN3.prototype.modrn = function modrn(num) {
          var isNegNum = num < 0;
          if (isNegNum) num = -num;
          assert2(num <= 67108863);
          var p = (1 << 26) % num;
          var acc = 0;
          for (var i = this.length - 1; i >= 0; i--) {
            acc = (p * acc + (this.words[i] | 0)) % num;
          }
          return isNegNum ? -acc : acc;
        };
        BN3.prototype.modn = function modn(num) {
          return this.modrn(num);
        };
        BN3.prototype.idivn = function idivn(num) {
          var isNegNum = num < 0;
          if (isNegNum) num = -num;
          assert2(num <= 67108863);
          var carry = 0;
          for (var i = this.length - 1; i >= 0; i--) {
            var w = (this.words[i] | 0) + carry * 67108864;
            this.words[i] = w / num | 0;
            carry = w % num;
          }
          this._strip();
          return isNegNum ? this.ineg() : this;
        };
        BN3.prototype.divn = function divn(num) {
          return this.clone().idivn(num);
        };
        BN3.prototype.egcd = function egcd(p) {
          assert2(p.negative === 0);
          assert2(!p.isZero());
          var x = this;
          var y = p.clone();
          if (x.negative !== 0) {
            x = x.umod(p);
          } else {
            x = x.clone();
          }
          var A = new BN3(1);
          var B = new BN3(0);
          var C = new BN3(0);
          var D = new BN3(1);
          var g = 0;
          while (x.isEven() && y.isEven()) {
            x.iushrn(1);
            y.iushrn(1);
            ++g;
          }
          var yp = y.clone();
          var xp = x.clone();
          while (!x.isZero()) {
            for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1) ;
            if (i > 0) {
              x.iushrn(i);
              while (i-- > 0) {
                if (A.isOdd() || B.isOdd()) {
                  A.iadd(yp);
                  B.isub(xp);
                }
                A.iushrn(1);
                B.iushrn(1);
              }
            }
            for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1) ;
            if (j > 0) {
              y.iushrn(j);
              while (j-- > 0) {
                if (C.isOdd() || D.isOdd()) {
                  C.iadd(yp);
                  D.isub(xp);
                }
                C.iushrn(1);
                D.iushrn(1);
              }
            }
            if (x.cmp(y) >= 0) {
              x.isub(y);
              A.isub(C);
              B.isub(D);
            } else {
              y.isub(x);
              C.isub(A);
              D.isub(B);
            }
          }
          return {
            a: C,
            b: D,
            gcd: y.iushln(g)
          };
        };
        BN3.prototype._invmp = function _invmp(p) {
          assert2(p.negative === 0);
          assert2(!p.isZero());
          var a = this;
          var b = p.clone();
          if (a.negative !== 0) {
            a = a.umod(p);
          } else {
            a = a.clone();
          }
          var x1 = new BN3(1);
          var x2 = new BN3(0);
          var delta = b.clone();
          while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
            for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1) ;
            if (i > 0) {
              a.iushrn(i);
              while (i-- > 0) {
                if (x1.isOdd()) {
                  x1.iadd(delta);
                }
                x1.iushrn(1);
              }
            }
            for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1) ;
            if (j > 0) {
              b.iushrn(j);
              while (j-- > 0) {
                if (x2.isOdd()) {
                  x2.iadd(delta);
                }
                x2.iushrn(1);
              }
            }
            if (a.cmp(b) >= 0) {
              a.isub(b);
              x1.isub(x2);
            } else {
              b.isub(a);
              x2.isub(x1);
            }
          }
          var res;
          if (a.cmpn(1) === 0) {
            res = x1;
          } else {
            res = x2;
          }
          if (res.cmpn(0) < 0) {
            res.iadd(p);
          }
          return res;
        };
        BN3.prototype.gcd = function gcd(num) {
          if (this.isZero()) return num.abs();
          if (num.isZero()) return this.abs();
          var a = this.clone();
          var b = num.clone();
          a.negative = 0;
          b.negative = 0;
          for (var shift = 0; a.isEven() && b.isEven(); shift++) {
            a.iushrn(1);
            b.iushrn(1);
          }
          do {
            while (a.isEven()) {
              a.iushrn(1);
            }
            while (b.isEven()) {
              b.iushrn(1);
            }
            var r = a.cmp(b);
            if (r < 0) {
              var t = a;
              a = b;
              b = t;
            } else if (r === 0 || b.cmpn(1) === 0) {
              break;
            }
            a.isub(b);
          } while (true);
          return b.iushln(shift);
        };
        BN3.prototype.invm = function invm(num) {
          return this.egcd(num).a.umod(num);
        };
        BN3.prototype.isEven = function isEven() {
          return (this.words[0] & 1) === 0;
        };
        BN3.prototype.isOdd = function isOdd2() {
          return (this.words[0] & 1) === 1;
        };
        BN3.prototype.andln = function andln(num) {
          return this.words[0] & num;
        };
        BN3.prototype.bincn = function bincn(bit) {
          assert2(typeof bit === "number");
          var r = bit % 26;
          var s = (bit - r) / 26;
          var q = 1 << r;
          if (this.length <= s) {
            this._expand(s + 1);
            this.words[s] |= q;
            return this;
          }
          var carry = q;
          for (var i = s; carry !== 0 && i < this.length; i++) {
            var w = this.words[i] | 0;
            w += carry;
            carry = w >>> 26;
            w &= 67108863;
            this.words[i] = w;
          }
          if (carry !== 0) {
            this.words[i] = carry;
            this.length++;
          }
          return this;
        };
        BN3.prototype.isZero = function isZero() {
          return this.length === 1 && this.words[0] === 0;
        };
        BN3.prototype.cmpn = function cmpn(num) {
          var negative = num < 0;
          if (this.negative !== 0 && !negative) return -1;
          if (this.negative === 0 && negative) return 1;
          this._strip();
          var res;
          if (this.length > 1) {
            res = 1;
          } else {
            if (negative) {
              num = -num;
            }
            assert2(num <= 67108863, "Number is too big");
            var w = this.words[0] | 0;
            res = w === num ? 0 : w < num ? -1 : 1;
          }
          if (this.negative !== 0) return -res | 0;
          return res;
        };
        BN3.prototype.cmp = function cmp(num) {
          if (this.negative !== 0 && num.negative === 0) return -1;
          if (this.negative === 0 && num.negative !== 0) return 1;
          var res = this.ucmp(num);
          if (this.negative !== 0) return -res | 0;
          return res;
        };
        BN3.prototype.ucmp = function ucmp(num) {
          if (this.length > num.length) return 1;
          if (this.length < num.length) return -1;
          var res = 0;
          for (var i = this.length - 1; i >= 0; i--) {
            var a = this.words[i] | 0;
            var b = num.words[i] | 0;
            if (a === b) continue;
            if (a < b) {
              res = -1;
            } else if (a > b) {
              res = 1;
            }
            break;
          }
          return res;
        };
        BN3.prototype.gtn = function gtn(num) {
          return this.cmpn(num) === 1;
        };
        BN3.prototype.gt = function gt(num) {
          return this.cmp(num) === 1;
        };
        BN3.prototype.gten = function gten(num) {
          return this.cmpn(num) >= 0;
        };
        BN3.prototype.gte = function gte(num) {
          return this.cmp(num) >= 0;
        };
        BN3.prototype.ltn = function ltn(num) {
          return this.cmpn(num) === -1;
        };
        BN3.prototype.lt = function lt(num) {
          return this.cmp(num) === -1;
        };
        BN3.prototype.lten = function lten(num) {
          return this.cmpn(num) <= 0;
        };
        BN3.prototype.lte = function lte(num) {
          return this.cmp(num) <= 0;
        };
        BN3.prototype.eqn = function eqn(num) {
          return this.cmpn(num) === 0;
        };
        BN3.prototype.eq = function eq4(num) {
          return this.cmp(num) === 0;
        };
        BN3.red = function red(num) {
          return new Red(num);
        };
        BN3.prototype.toRed = function toRed(ctx) {
          assert2(!this.red, "Already a number in reduction context");
          assert2(this.negative === 0, "red works only with positives");
          return ctx.convertTo(this)._forceRed(ctx);
        };
        BN3.prototype.fromRed = function fromRed() {
          assert2(this.red, "fromRed works only with numbers in reduction context");
          return this.red.convertFrom(this);
        };
        BN3.prototype._forceRed = function _forceRed(ctx) {
          this.red = ctx;
          return this;
        };
        BN3.prototype.forceRed = function forceRed(ctx) {
          assert2(!this.red, "Already a number in reduction context");
          return this._forceRed(ctx);
        };
        BN3.prototype.redAdd = function redAdd(num) {
          assert2(this.red, "redAdd works only with red numbers");
          return this.red.add(this, num);
        };
        BN3.prototype.redIAdd = function redIAdd(num) {
          assert2(this.red, "redIAdd works only with red numbers");
          return this.red.iadd(this, num);
        };
        BN3.prototype.redSub = function redSub(num) {
          assert2(this.red, "redSub works only with red numbers");
          return this.red.sub(this, num);
        };
        BN3.prototype.redISub = function redISub(num) {
          assert2(this.red, "redISub works only with red numbers");
          return this.red.isub(this, num);
        };
        BN3.prototype.redShl = function redShl(num) {
          assert2(this.red, "redShl works only with red numbers");
          return this.red.shl(this, num);
        };
        BN3.prototype.redMul = function redMul(num) {
          assert2(this.red, "redMul works only with red numbers");
          this.red._verify2(this, num);
          return this.red.mul(this, num);
        };
        BN3.prototype.redIMul = function redIMul(num) {
          assert2(this.red, "redMul works only with red numbers");
          this.red._verify2(this, num);
          return this.red.imul(this, num);
        };
        BN3.prototype.redSqr = function redSqr() {
          assert2(this.red, "redSqr works only with red numbers");
          this.red._verify1(this);
          return this.red.sqr(this);
        };
        BN3.prototype.redISqr = function redISqr() {
          assert2(this.red, "redISqr works only with red numbers");
          this.red._verify1(this);
          return this.red.isqr(this);
        };
        BN3.prototype.redSqrt = function redSqrt() {
          assert2(this.red, "redSqrt works only with red numbers");
          this.red._verify1(this);
          return this.red.sqrt(this);
        };
        BN3.prototype.redInvm = function redInvm() {
          assert2(this.red, "redInvm works only with red numbers");
          this.red._verify1(this);
          return this.red.invm(this);
        };
        BN3.prototype.redNeg = function redNeg() {
          assert2(this.red, "redNeg works only with red numbers");
          this.red._verify1(this);
          return this.red.neg(this);
        };
        BN3.prototype.redPow = function redPow(num) {
          assert2(this.red && !num.red, "redPow(normalNum)");
          this.red._verify1(this);
          return this.red.pow(this, num);
        };
        var primes = {
          k256: null,
          p224: null,
          p192: null,
          p25519: null
        };
        function MPrime(name, p) {
          this.name = name;
          this.p = new BN3(p, 16);
          this.n = this.p.bitLength();
          this.k = new BN3(1).iushln(this.n).isub(this.p);
          this.tmp = this._tmp();
        }
        MPrime.prototype._tmp = function _tmp() {
          var tmp = new BN3(null);
          tmp.words = new Array(Math.ceil(this.n / 13));
          return tmp;
        };
        MPrime.prototype.ireduce = function ireduce(num) {
          var r = num;
          var rlen;
          do {
            this.split(r, this.tmp);
            r = this.imulK(r);
            r = r.iadd(this.tmp);
            rlen = r.bitLength();
          } while (rlen > this.n);
          var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
          if (cmp === 0) {
            r.words[0] = 0;
            r.length = 1;
          } else if (cmp > 0) {
            r.isub(this.p);
          } else {
            if (r.strip !== void 0) {
              r.strip();
            } else {
              r._strip();
            }
          }
          return r;
        };
        MPrime.prototype.split = function split(input, out) {
          input.iushrn(this.n, 0, out);
        };
        MPrime.prototype.imulK = function imulK(num) {
          return num.imul(this.k);
        };
        function K256() {
          MPrime.call(
            this,
            "k256",
            "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f"
          );
        }
        inherits2(K256, MPrime);
        K256.prototype.split = function split(input, output) {
          var mask = 4194303;
          var outLen = Math.min(input.length, 9);
          for (var i = 0; i < outLen; i++) {
            output.words[i] = input.words[i];
          }
          output.length = outLen;
          if (input.length <= 9) {
            input.words[0] = 0;
            input.length = 1;
            return;
          }
          var prev = input.words[9];
          output.words[output.length++] = prev & mask;
          for (i = 10; i < input.length; i++) {
            var next = input.words[i] | 0;
            input.words[i - 10] = (next & mask) << 4 | prev >>> 22;
            prev = next;
          }
          prev >>>= 22;
          input.words[i - 10] = prev;
          if (prev === 0 && input.length > 10) {
            input.length -= 10;
          } else {
            input.length -= 9;
          }
        };
        K256.prototype.imulK = function imulK(num) {
          num.words[num.length] = 0;
          num.words[num.length + 1] = 0;
          num.length += 2;
          var lo = 0;
          for (var i = 0; i < num.length; i++) {
            var w = num.words[i] | 0;
            lo += w * 977;
            num.words[i] = lo & 67108863;
            lo = w * 64 + (lo / 67108864 | 0);
          }
          if (num.words[num.length - 1] === 0) {
            num.length--;
            if (num.words[num.length - 1] === 0) {
              num.length--;
            }
          }
          return num;
        };
        function P224() {
          MPrime.call(
            this,
            "p224",
            "ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001"
          );
        }
        inherits2(P224, MPrime);
        function P192() {
          MPrime.call(
            this,
            "p192",
            "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff"
          );
        }
        inherits2(P192, MPrime);
        function P25519() {
          MPrime.call(
            this,
            "25519",
            "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed"
          );
        }
        inherits2(P25519, MPrime);
        P25519.prototype.imulK = function imulK(num) {
          var carry = 0;
          for (var i = 0; i < num.length; i++) {
            var hi = (num.words[i] | 0) * 19 + carry;
            var lo = hi & 67108863;
            hi >>>= 26;
            num.words[i] = lo;
            carry = hi;
          }
          if (carry !== 0) {
            num.words[num.length++] = carry;
          }
          return num;
        };
        BN3._prime = function prime(name) {
          if (primes[name]) return primes[name];
          var prime2;
          if (name === "k256") {
            prime2 = new K256();
          } else if (name === "p224") {
            prime2 = new P224();
          } else if (name === "p192") {
            prime2 = new P192();
          } else if (name === "p25519") {
            prime2 = new P25519();
          } else {
            throw new Error("Unknown prime " + name);
          }
          primes[name] = prime2;
          return prime2;
        };
        function Red(m) {
          if (typeof m === "string") {
            var prime = BN3._prime(m);
            this.m = prime.p;
            this.prime = prime;
          } else {
            assert2(m.gtn(1), "modulus must be greater than 1");
            this.m = m;
            this.prime = null;
          }
        }
        Red.prototype._verify1 = function _verify1(a) {
          assert2(a.negative === 0, "red works only with positives");
          assert2(a.red, "red works only with red numbers");
        };
        Red.prototype._verify2 = function _verify2(a, b) {
          assert2((a.negative | b.negative) === 0, "red works only with positives");
          assert2(
            a.red && a.red === b.red,
            "red works only with red numbers"
          );
        };
        Red.prototype.imod = function imod(a) {
          if (this.prime) return this.prime.ireduce(a)._forceRed(this);
          move(a, a.umod(this.m)._forceRed(this));
          return a;
        };
        Red.prototype.neg = function neg3(a) {
          if (a.isZero()) {
            return a.clone();
          }
          return this.m.sub(a)._forceRed(this);
        };
        Red.prototype.add = function add3(a, b) {
          this._verify2(a, b);
          var res = a.add(b);
          if (res.cmp(this.m) >= 0) {
            res.isub(this.m);
          }
          return res._forceRed(this);
        };
        Red.prototype.iadd = function iadd(a, b) {
          this._verify2(a, b);
          var res = a.iadd(b);
          if (res.cmp(this.m) >= 0) {
            res.isub(this.m);
          }
          return res;
        };
        Red.prototype.sub = function sub(a, b) {
          this._verify2(a, b);
          var res = a.sub(b);
          if (res.cmpn(0) < 0) {
            res.iadd(this.m);
          }
          return res._forceRed(this);
        };
        Red.prototype.isub = function isub(a, b) {
          this._verify2(a, b);
          var res = a.isub(b);
          if (res.cmpn(0) < 0) {
            res.iadd(this.m);
          }
          return res;
        };
        Red.prototype.shl = function shl(a, num) {
          this._verify1(a);
          return this.imod(a.ushln(num));
        };
        Red.prototype.imul = function imul(a, b) {
          this._verify2(a, b);
          return this.imod(a.imul(b));
        };
        Red.prototype.mul = function mul3(a, b) {
          this._verify2(a, b);
          return this.imod(a.mul(b));
        };
        Red.prototype.isqr = function isqr(a) {
          return this.imul(a, a.clone());
        };
        Red.prototype.sqr = function sqr(a) {
          return this.mul(a, a);
        };
        Red.prototype.sqrt = function sqrt(a) {
          if (a.isZero()) return a.clone();
          var mod3 = this.m.andln(3);
          assert2(mod3 % 2 === 1);
          if (mod3 === 3) {
            var pow = this.m.add(new BN3(1)).iushrn(2);
            return this.pow(a, pow);
          }
          var q = this.m.subn(1);
          var s = 0;
          while (!q.isZero() && q.andln(1) === 0) {
            s++;
            q.iushrn(1);
          }
          assert2(!q.isZero());
          var one = new BN3(1).toRed(this);
          var nOne = one.redNeg();
          var lpow = this.m.subn(1).iushrn(1);
          var z = this.m.bitLength();
          z = new BN3(2 * z * z).toRed(this);
          while (this.pow(z, lpow).cmp(nOne) !== 0) {
            z.redIAdd(nOne);
          }
          var c = this.pow(z, q);
          var r = this.pow(a, q.addn(1).iushrn(1));
          var t = this.pow(a, q);
          var m = s;
          while (t.cmp(one) !== 0) {
            var tmp = t;
            for (var i = 0; tmp.cmp(one) !== 0; i++) {
              tmp = tmp.redSqr();
            }
            assert2(i < m);
            var b = this.pow(c, new BN3(1).iushln(m - i - 1));
            r = r.redMul(b);
            c = b.redSqr();
            t = t.redMul(c);
            m = i;
          }
          return r;
        };
        Red.prototype.invm = function invm(a) {
          var inv = a._invmp(this.m);
          if (inv.negative !== 0) {
            inv.negative = 0;
            return this.imod(inv).redNeg();
          } else {
            return this.imod(inv);
          }
        };
        Red.prototype.pow = function pow(a, num) {
          if (num.isZero()) return new BN3(1).toRed(this);
          if (num.cmpn(1) === 0) return a.clone();
          var windowSize = 4;
          var wnd = new Array(1 << windowSize);
          wnd[0] = new BN3(1).toRed(this);
          wnd[1] = a;
          for (var i = 2; i < wnd.length; i++) {
            wnd[i] = this.mul(wnd[i - 1], a);
          }
          var res = wnd[0];
          var current = 0;
          var currentLen = 0;
          var start = num.bitLength() % 26;
          if (start === 0) {
            start = 26;
          }
          for (i = num.length - 1; i >= 0; i--) {
            var word = num.words[i];
            for (var j = start - 1; j >= 0; j--) {
              var bit = word >> j & 1;
              if (res !== wnd[0]) {
                res = this.sqr(res);
              }
              if (bit === 0 && current === 0) {
                currentLen = 0;
                continue;
              }
              current <<= 1;
              current |= bit;
              currentLen++;
              if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;
              res = this.mul(res, wnd[current]);
              currentLen = 0;
              current = 0;
            }
            start = 26;
          }
          return res;
        };
        Red.prototype.convertTo = function convertTo(num) {
          var r = num.umod(this.m);
          return r === num ? r.clone() : r;
        };
        Red.prototype.convertFrom = function convertFrom(num) {
          var res = num.clone();
          res.red = null;
          return res;
        };
        BN3.mont = function mont(num) {
          return new Mont(num);
        };
        function Mont(m) {
          Red.call(this, m);
          this.shift = this.m.bitLength();
          if (this.shift % 26 !== 0) {
            this.shift += 26 - this.shift % 26;
          }
          this.r = new BN3(1).iushln(this.shift);
          this.r2 = this.imod(this.r.sqr());
          this.rinv = this.r._invmp(this.m);
          this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
          this.minv = this.minv.umod(this.r);
          this.minv = this.r.sub(this.minv);
        }
        inherits2(Mont, Red);
        Mont.prototype.convertTo = function convertTo(num) {
          return this.imod(num.ushln(this.shift));
        };
        Mont.prototype.convertFrom = function convertFrom(num) {
          var r = this.imod(num.mul(this.rinv));
          r.red = null;
          return r;
        };
        Mont.prototype.imul = function imul(a, b) {
          if (a.isZero() || b.isZero()) {
            a.words[0] = 0;
            a.length = 1;
            return a;
          }
          var t = a.imul(b);
          var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
          var u = t.isub(c).iushrn(this.shift);
          var res = u;
          if (u.cmp(this.m) >= 0) {
            res = u.isub(this.m);
          } else if (u.cmpn(0) < 0) {
            res = u.iadd(this.m);
          }
          return res._forceRed(this);
        };
        Mont.prototype.mul = function mul3(a, b) {
          if (a.isZero() || b.isZero()) return new BN3(0)._forceRed(this);
          var t = a.mul(b);
          var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
          var u = t.isub(c).iushrn(this.shift);
          var res = u;
          if (u.cmp(this.m) >= 0) {
            res = u.isub(this.m);
          } else if (u.cmpn(0) < 0) {
            res = u.iadd(this.m);
          }
          return res._forceRed(this);
        };
        Mont.prototype.invm = function invm(a) {
          var res = this.imod(a._invmp(this.m).mul(this.r2));
          return res._forceRed(this);
        };
      })(typeof module === "undefined" || module, exports);
    }
  });

  // node_modules/js-sha3/src/sha3.js
  var require_sha3 = __commonJS({
    "node_modules/js-sha3/src/sha3.js"(exports, module) {
      init_buffer_shim_entry();
      (function() {
        "use strict";
        var INPUT_ERROR = "input is invalid type";
        var FINALIZE_ERROR = "finalize already called";
        var WINDOW = typeof window === "object";
        var root = WINDOW ? window : {};
        if (root.JS_SHA3_NO_WINDOW) {
          WINDOW = false;
        }
        var WEB_WORKER = !WINDOW && typeof self === "object";
        var NODE_JS = !root.JS_SHA3_NO_NODE_JS && typeof process === "object" && process.versions && process.versions.node;
        if (NODE_JS) {
          root = globalThis;
        } else if (WEB_WORKER) {
          root = self;
        }
        var COMMON_JS = !root.JS_SHA3_NO_COMMON_JS && typeof module === "object" && module.exports;
        var AMD = typeof define === "function" && define.amd;
        var ARRAY_BUFFER = !root.JS_SHA3_NO_ARRAY_BUFFER && typeof ArrayBuffer !== "undefined";
        var HEX_CHARS = "0123456789abcdef".split("");
        var SHAKE_PADDING = [31, 7936, 2031616, 520093696];
        var CSHAKE_PADDING = [4, 1024, 262144, 67108864];
        var KECCAK_PADDING = [1, 256, 65536, 16777216];
        var PADDING = [6, 1536, 393216, 100663296];
        var SHIFT = [0, 8, 16, 24];
        var RC = [
          1,
          0,
          32898,
          0,
          32906,
          2147483648,
          2147516416,
          2147483648,
          32907,
          0,
          2147483649,
          0,
          2147516545,
          2147483648,
          32777,
          2147483648,
          138,
          0,
          136,
          0,
          2147516425,
          0,
          2147483658,
          0,
          2147516555,
          0,
          139,
          2147483648,
          32905,
          2147483648,
          32771,
          2147483648,
          32770,
          2147483648,
          128,
          2147483648,
          32778,
          0,
          2147483658,
          2147483648,
          2147516545,
          2147483648,
          32896,
          2147483648,
          2147483649,
          0,
          2147516424,
          2147483648
        ];
        var BITS = [224, 256, 384, 512];
        var SHAKE_BITS = [128, 256];
        var OUTPUT_TYPES = ["hex", "buffer", "arrayBuffer", "array", "digest"];
        var CSHAKE_BYTEPAD = {
          "128": 168,
          "256": 136
        };
        if (root.JS_SHA3_NO_NODE_JS || !Array.isArray) {
          Array.isArray = function(obj) {
            return Object.prototype.toString.call(obj) === "[object Array]";
          };
        }
        if (ARRAY_BUFFER && (root.JS_SHA3_NO_ARRAY_BUFFER_IS_VIEW || !ArrayBuffer.isView)) {
          ArrayBuffer.isView = function(obj) {
            return typeof obj === "object" && obj.buffer && obj.buffer.constructor === ArrayBuffer;
          };
        }
        var createOutputMethod = function(bits2, padding, outputType) {
          return function(message) {
            return new Keccak(bits2, padding, bits2).update(message)[outputType]();
          };
        };
        var createShakeOutputMethod = function(bits2, padding, outputType) {
          return function(message, outputBits) {
            return new Keccak(bits2, padding, outputBits).update(message)[outputType]();
          };
        };
        var createCshakeOutputMethod = function(bits2, padding, outputType) {
          return function(message, outputBits, n, s) {
            return methods["cshake" + bits2].update(message, outputBits, n, s)[outputType]();
          };
        };
        var createKmacOutputMethod = function(bits2, padding, outputType) {
          return function(key2, message, outputBits, s) {
            return methods["kmac" + bits2].update(key2, message, outputBits, s)[outputType]();
          };
        };
        var createOutputMethods = function(method, createMethod2, bits2, padding) {
          for (var i2 = 0; i2 < OUTPUT_TYPES.length; ++i2) {
            var type = OUTPUT_TYPES[i2];
            method[type] = createMethod2(bits2, padding, type);
          }
          return method;
        };
        var createMethod = function(bits2, padding) {
          var method = createOutputMethod(bits2, padding, "hex");
          method.create = function() {
            return new Keccak(bits2, padding, bits2);
          };
          method.update = function(message) {
            return method.create().update(message);
          };
          return createOutputMethods(method, createOutputMethod, bits2, padding);
        };
        var createShakeMethod = function(bits2, padding) {
          var method = createShakeOutputMethod(bits2, padding, "hex");
          method.create = function(outputBits) {
            return new Keccak(bits2, padding, outputBits);
          };
          method.update = function(message, outputBits) {
            return method.create(outputBits).update(message);
          };
          return createOutputMethods(method, createShakeOutputMethod, bits2, padding);
        };
        var createCshakeMethod = function(bits2, padding) {
          var w = CSHAKE_BYTEPAD[bits2];
          var method = createCshakeOutputMethod(bits2, padding, "hex");
          method.create = function(outputBits, n, s) {
            if (!n && !s) {
              return methods["shake" + bits2].create(outputBits);
            } else {
              return new Keccak(bits2, padding, outputBits).bytepad([n, s], w);
            }
          };
          method.update = function(message, outputBits, n, s) {
            return method.create(outputBits, n, s).update(message);
          };
          return createOutputMethods(method, createCshakeOutputMethod, bits2, padding);
        };
        var createKmacMethod = function(bits2, padding) {
          var w = CSHAKE_BYTEPAD[bits2];
          var method = createKmacOutputMethod(bits2, padding, "hex");
          method.create = function(key2, outputBits, s) {
            return new Kmac(bits2, padding, outputBits).bytepad(["KMAC", s], w).bytepad([key2], w);
          };
          method.update = function(key2, message, outputBits, s) {
            return method.create(key2, outputBits, s).update(message);
          };
          return createOutputMethods(method, createKmacOutputMethod, bits2, padding);
        };
        var algorithms = [
          { name: "keccak", padding: KECCAK_PADDING, bits: BITS, createMethod },
          { name: "sha3", padding: PADDING, bits: BITS, createMethod },
          { name: "shake", padding: SHAKE_PADDING, bits: SHAKE_BITS, createMethod: createShakeMethod },
          { name: "cshake", padding: CSHAKE_PADDING, bits: SHAKE_BITS, createMethod: createCshakeMethod },
          { name: "kmac", padding: CSHAKE_PADDING, bits: SHAKE_BITS, createMethod: createKmacMethod }
        ];
        var methods = {}, methodNames = [];
        for (var i = 0; i < algorithms.length; ++i) {
          var algorithm = algorithms[i];
          var bits = algorithm.bits;
          for (var j = 0; j < bits.length; ++j) {
            var methodName = algorithm.name + "_" + bits[j];
            methodNames.push(methodName);
            methods[methodName] = algorithm.createMethod(bits[j], algorithm.padding);
            if (algorithm.name !== "sha3") {
              var newMethodName = algorithm.name + bits[j];
              methodNames.push(newMethodName);
              methods[newMethodName] = methods[methodName];
            }
          }
        }
        function Keccak(bits2, padding, outputBits) {
          this.blocks = [];
          this.s = [];
          this.padding = padding;
          this.outputBits = outputBits;
          this.reset = true;
          this.finalized = false;
          this.block = 0;
          this.start = 0;
          this.blockCount = 1600 - (bits2 << 1) >> 5;
          this.byteCount = this.blockCount << 2;
          this.outputBlocks = outputBits >> 5;
          this.extraBytes = (outputBits & 31) >> 3;
          for (var i2 = 0; i2 < 50; ++i2) {
            this.s[i2] = 0;
          }
        }
        Keccak.prototype.update = function(message) {
          if (this.finalized) {
            throw new Error(FINALIZE_ERROR);
          }
          var notString, type = typeof message;
          if (type !== "string") {
            if (type === "object") {
              if (message === null) {
                throw new Error(INPUT_ERROR);
              } else if (ARRAY_BUFFER && message.constructor === ArrayBuffer) {
                message = new Uint8Array(message);
              } else if (!Array.isArray(message)) {
                if (!ARRAY_BUFFER || !ArrayBuffer.isView(message)) {
                  throw new Error(INPUT_ERROR);
                }
              }
            } else {
              throw new Error(INPUT_ERROR);
            }
            notString = true;
          }
          var blocks = this.blocks, byteCount = this.byteCount, length = message.length, blockCount = this.blockCount, index = 0, s = this.s, i2, code;
          while (index < length) {
            if (this.reset) {
              this.reset = false;
              blocks[0] = this.block;
              for (i2 = 1; i2 < blockCount + 1; ++i2) {
                blocks[i2] = 0;
              }
            }
            if (notString) {
              for (i2 = this.start; index < length && i2 < byteCount; ++index) {
                blocks[i2 >> 2] |= message[index] << SHIFT[i2++ & 3];
              }
            } else {
              for (i2 = this.start; index < length && i2 < byteCount; ++index) {
                code = message.charCodeAt(index);
                if (code < 128) {
                  blocks[i2 >> 2] |= code << SHIFT[i2++ & 3];
                } else if (code < 2048) {
                  blocks[i2 >> 2] |= (192 | code >> 6) << SHIFT[i2++ & 3];
                  blocks[i2 >> 2] |= (128 | code & 63) << SHIFT[i2++ & 3];
                } else if (code < 55296 || code >= 57344) {
                  blocks[i2 >> 2] |= (224 | code >> 12) << SHIFT[i2++ & 3];
                  blocks[i2 >> 2] |= (128 | code >> 6 & 63) << SHIFT[i2++ & 3];
                  blocks[i2 >> 2] |= (128 | code & 63) << SHIFT[i2++ & 3];
                } else {
                  code = 65536 + ((code & 1023) << 10 | message.charCodeAt(++index) & 1023);
                  blocks[i2 >> 2] |= (240 | code >> 18) << SHIFT[i2++ & 3];
                  blocks[i2 >> 2] |= (128 | code >> 12 & 63) << SHIFT[i2++ & 3];
                  blocks[i2 >> 2] |= (128 | code >> 6 & 63) << SHIFT[i2++ & 3];
                  blocks[i2 >> 2] |= (128 | code & 63) << SHIFT[i2++ & 3];
                }
              }
            }
            this.lastByteIndex = i2;
            if (i2 >= byteCount) {
              this.start = i2 - byteCount;
              this.block = blocks[blockCount];
              for (i2 = 0; i2 < blockCount; ++i2) {
                s[i2] ^= blocks[i2];
              }
              f(s);
              this.reset = true;
            } else {
              this.start = i2;
            }
          }
          return this;
        };
        Keccak.prototype.encode = function(x, right) {
          var o = x & 255, n = 1;
          var bytes = [o];
          x = x >> 8;
          o = x & 255;
          while (o > 0) {
            bytes.unshift(o);
            x = x >> 8;
            o = x & 255;
            ++n;
          }
          if (right) {
            bytes.push(n);
          } else {
            bytes.unshift(n);
          }
          this.update(bytes);
          return bytes.length;
        };
        Keccak.prototype.encodeString = function(str) {
          var notString, type = typeof str;
          if (type !== "string") {
            if (type === "object") {
              if (str === null) {
                throw new Error(INPUT_ERROR);
              } else if (ARRAY_BUFFER && str.constructor === ArrayBuffer) {
                str = new Uint8Array(str);
              } else if (!Array.isArray(str)) {
                if (!ARRAY_BUFFER || !ArrayBuffer.isView(str)) {
                  throw new Error(INPUT_ERROR);
                }
              }
            } else {
              throw new Error(INPUT_ERROR);
            }
            notString = true;
          }
          var bytes = 0, length = str.length;
          if (notString) {
            bytes = length;
          } else {
            for (var i2 = 0; i2 < str.length; ++i2) {
              var code = str.charCodeAt(i2);
              if (code < 128) {
                bytes += 1;
              } else if (code < 2048) {
                bytes += 2;
              } else if (code < 55296 || code >= 57344) {
                bytes += 3;
              } else {
                code = 65536 + ((code & 1023) << 10 | str.charCodeAt(++i2) & 1023);
                bytes += 4;
              }
            }
          }
          bytes += this.encode(bytes * 8);
          this.update(str);
          return bytes;
        };
        Keccak.prototype.bytepad = function(strs, w) {
          var bytes = this.encode(w);
          for (var i2 = 0; i2 < strs.length; ++i2) {
            bytes += this.encodeString(strs[i2]);
          }
          var paddingBytes = w - bytes % w;
          var zeros = [];
          zeros.length = paddingBytes;
          this.update(zeros);
          return this;
        };
        Keccak.prototype.finalize = function() {
          if (this.finalized) {
            return;
          }
          this.finalized = true;
          var blocks = this.blocks, i2 = this.lastByteIndex, blockCount = this.blockCount, s = this.s;
          blocks[i2 >> 2] |= this.padding[i2 & 3];
          if (this.lastByteIndex === this.byteCount) {
            blocks[0] = blocks[blockCount];
            for (i2 = 1; i2 < blockCount + 1; ++i2) {
              blocks[i2] = 0;
            }
          }
          blocks[blockCount - 1] |= 2147483648;
          for (i2 = 0; i2 < blockCount; ++i2) {
            s[i2] ^= blocks[i2];
          }
          f(s);
        };
        Keccak.prototype.toString = Keccak.prototype.hex = function() {
          this.finalize();
          var blockCount = this.blockCount, s = this.s, outputBlocks = this.outputBlocks, extraBytes = this.extraBytes, i2 = 0, j2 = 0;
          var hex = "", block;
          while (j2 < outputBlocks) {
            for (i2 = 0; i2 < blockCount && j2 < outputBlocks; ++i2, ++j2) {
              block = s[i2];
              hex += HEX_CHARS[block >> 4 & 15] + HEX_CHARS[block & 15] + HEX_CHARS[block >> 12 & 15] + HEX_CHARS[block >> 8 & 15] + HEX_CHARS[block >> 20 & 15] + HEX_CHARS[block >> 16 & 15] + HEX_CHARS[block >> 28 & 15] + HEX_CHARS[block >> 24 & 15];
            }
            if (j2 % blockCount === 0) {
              f(s);
              i2 = 0;
            }
          }
          if (extraBytes) {
            block = s[i2];
            hex += HEX_CHARS[block >> 4 & 15] + HEX_CHARS[block & 15];
            if (extraBytes > 1) {
              hex += HEX_CHARS[block >> 12 & 15] + HEX_CHARS[block >> 8 & 15];
            }
            if (extraBytes > 2) {
              hex += HEX_CHARS[block >> 20 & 15] + HEX_CHARS[block >> 16 & 15];
            }
          }
          return hex;
        };
        Keccak.prototype.arrayBuffer = function() {
          this.finalize();
          var blockCount = this.blockCount, s = this.s, outputBlocks = this.outputBlocks, extraBytes = this.extraBytes, i2 = 0, j2 = 0;
          var bytes = this.outputBits >> 3;
          var buffer;
          if (extraBytes) {
            buffer = new ArrayBuffer(outputBlocks + 1 << 2);
          } else {
            buffer = new ArrayBuffer(bytes);
          }
          var array = new Uint32Array(buffer);
          while (j2 < outputBlocks) {
            for (i2 = 0; i2 < blockCount && j2 < outputBlocks; ++i2, ++j2) {
              array[j2] = s[i2];
            }
            if (j2 % blockCount === 0) {
              f(s);
            }
          }
          if (extraBytes) {
            array[i2] = s[i2];
            buffer = buffer.slice(0, bytes);
          }
          return buffer;
        };
        Keccak.prototype.buffer = Keccak.prototype.arrayBuffer;
        Keccak.prototype.digest = Keccak.prototype.array = function() {
          this.finalize();
          var blockCount = this.blockCount, s = this.s, outputBlocks = this.outputBlocks, extraBytes = this.extraBytes, i2 = 0, j2 = 0;
          var array = [], offset, block;
          while (j2 < outputBlocks) {
            for (i2 = 0; i2 < blockCount && j2 < outputBlocks; ++i2, ++j2) {
              offset = j2 << 2;
              block = s[i2];
              array[offset] = block & 255;
              array[offset + 1] = block >> 8 & 255;
              array[offset + 2] = block >> 16 & 255;
              array[offset + 3] = block >> 24 & 255;
            }
            if (j2 % blockCount === 0) {
              f(s);
            }
          }
          if (extraBytes) {
            offset = j2 << 2;
            block = s[i2];
            array[offset] = block & 255;
            if (extraBytes > 1) {
              array[offset + 1] = block >> 8 & 255;
            }
            if (extraBytes > 2) {
              array[offset + 2] = block >> 16 & 255;
            }
          }
          return array;
        };
        function Kmac(bits2, padding, outputBits) {
          Keccak.call(this, bits2, padding, outputBits);
        }
        Kmac.prototype = new Keccak();
        Kmac.prototype.finalize = function() {
          this.encode(this.outputBits, true);
          return Keccak.prototype.finalize.call(this);
        };
        var f = function(s) {
          var h, l, n, c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15, b16, b17, b18, b19, b20, b21, b22, b23, b24, b25, b26, b27, b28, b29, b30, b31, b32, b33, b34, b35, b36, b37, b38, b39, b40, b41, b42, b43, b44, b45, b46, b47, b48, b49;
          for (n = 0; n < 48; n += 2) {
            c0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40];
            c1 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
            c2 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42];
            c3 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
            c4 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44];
            c5 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
            c6 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46];
            c7 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
            c8 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48];
            c9 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];
            h = c8 ^ (c2 << 1 | c3 >>> 31);
            l = c9 ^ (c3 << 1 | c2 >>> 31);
            s[0] ^= h;
            s[1] ^= l;
            s[10] ^= h;
            s[11] ^= l;
            s[20] ^= h;
            s[21] ^= l;
            s[30] ^= h;
            s[31] ^= l;
            s[40] ^= h;
            s[41] ^= l;
            h = c0 ^ (c4 << 1 | c5 >>> 31);
            l = c1 ^ (c5 << 1 | c4 >>> 31);
            s[2] ^= h;
            s[3] ^= l;
            s[12] ^= h;
            s[13] ^= l;
            s[22] ^= h;
            s[23] ^= l;
            s[32] ^= h;
            s[33] ^= l;
            s[42] ^= h;
            s[43] ^= l;
            h = c2 ^ (c6 << 1 | c7 >>> 31);
            l = c3 ^ (c7 << 1 | c6 >>> 31);
            s[4] ^= h;
            s[5] ^= l;
            s[14] ^= h;
            s[15] ^= l;
            s[24] ^= h;
            s[25] ^= l;
            s[34] ^= h;
            s[35] ^= l;
            s[44] ^= h;
            s[45] ^= l;
            h = c4 ^ (c8 << 1 | c9 >>> 31);
            l = c5 ^ (c9 << 1 | c8 >>> 31);
            s[6] ^= h;
            s[7] ^= l;
            s[16] ^= h;
            s[17] ^= l;
            s[26] ^= h;
            s[27] ^= l;
            s[36] ^= h;
            s[37] ^= l;
            s[46] ^= h;
            s[47] ^= l;
            h = c6 ^ (c0 << 1 | c1 >>> 31);
            l = c7 ^ (c1 << 1 | c0 >>> 31);
            s[8] ^= h;
            s[9] ^= l;
            s[18] ^= h;
            s[19] ^= l;
            s[28] ^= h;
            s[29] ^= l;
            s[38] ^= h;
            s[39] ^= l;
            s[48] ^= h;
            s[49] ^= l;
            b0 = s[0];
            b1 = s[1];
            b32 = s[11] << 4 | s[10] >>> 28;
            b33 = s[10] << 4 | s[11] >>> 28;
            b14 = s[20] << 3 | s[21] >>> 29;
            b15 = s[21] << 3 | s[20] >>> 29;
            b46 = s[31] << 9 | s[30] >>> 23;
            b47 = s[30] << 9 | s[31] >>> 23;
            b28 = s[40] << 18 | s[41] >>> 14;
            b29 = s[41] << 18 | s[40] >>> 14;
            b20 = s[2] << 1 | s[3] >>> 31;
            b21 = s[3] << 1 | s[2] >>> 31;
            b2 = s[13] << 12 | s[12] >>> 20;
            b3 = s[12] << 12 | s[13] >>> 20;
            b34 = s[22] << 10 | s[23] >>> 22;
            b35 = s[23] << 10 | s[22] >>> 22;
            b16 = s[33] << 13 | s[32] >>> 19;
            b17 = s[32] << 13 | s[33] >>> 19;
            b48 = s[42] << 2 | s[43] >>> 30;
            b49 = s[43] << 2 | s[42] >>> 30;
            b40 = s[5] << 30 | s[4] >>> 2;
            b41 = s[4] << 30 | s[5] >>> 2;
            b22 = s[14] << 6 | s[15] >>> 26;
            b23 = s[15] << 6 | s[14] >>> 26;
            b4 = s[25] << 11 | s[24] >>> 21;
            b5 = s[24] << 11 | s[25] >>> 21;
            b36 = s[34] << 15 | s[35] >>> 17;
            b37 = s[35] << 15 | s[34] >>> 17;
            b18 = s[45] << 29 | s[44] >>> 3;
            b19 = s[44] << 29 | s[45] >>> 3;
            b10 = s[6] << 28 | s[7] >>> 4;
            b11 = s[7] << 28 | s[6] >>> 4;
            b42 = s[17] << 23 | s[16] >>> 9;
            b43 = s[16] << 23 | s[17] >>> 9;
            b24 = s[26] << 25 | s[27] >>> 7;
            b25 = s[27] << 25 | s[26] >>> 7;
            b6 = s[36] << 21 | s[37] >>> 11;
            b7 = s[37] << 21 | s[36] >>> 11;
            b38 = s[47] << 24 | s[46] >>> 8;
            b39 = s[46] << 24 | s[47] >>> 8;
            b30 = s[8] << 27 | s[9] >>> 5;
            b31 = s[9] << 27 | s[8] >>> 5;
            b12 = s[18] << 20 | s[19] >>> 12;
            b13 = s[19] << 20 | s[18] >>> 12;
            b44 = s[29] << 7 | s[28] >>> 25;
            b45 = s[28] << 7 | s[29] >>> 25;
            b26 = s[38] << 8 | s[39] >>> 24;
            b27 = s[39] << 8 | s[38] >>> 24;
            b8 = s[48] << 14 | s[49] >>> 18;
            b9 = s[49] << 14 | s[48] >>> 18;
            s[0] = b0 ^ ~b2 & b4;
            s[1] = b1 ^ ~b3 & b5;
            s[10] = b10 ^ ~b12 & b14;
            s[11] = b11 ^ ~b13 & b15;
            s[20] = b20 ^ ~b22 & b24;
            s[21] = b21 ^ ~b23 & b25;
            s[30] = b30 ^ ~b32 & b34;
            s[31] = b31 ^ ~b33 & b35;
            s[40] = b40 ^ ~b42 & b44;
            s[41] = b41 ^ ~b43 & b45;
            s[2] = b2 ^ ~b4 & b6;
            s[3] = b3 ^ ~b5 & b7;
            s[12] = b12 ^ ~b14 & b16;
            s[13] = b13 ^ ~b15 & b17;
            s[22] = b22 ^ ~b24 & b26;
            s[23] = b23 ^ ~b25 & b27;
            s[32] = b32 ^ ~b34 & b36;
            s[33] = b33 ^ ~b35 & b37;
            s[42] = b42 ^ ~b44 & b46;
            s[43] = b43 ^ ~b45 & b47;
            s[4] = b4 ^ ~b6 & b8;
            s[5] = b5 ^ ~b7 & b9;
            s[14] = b14 ^ ~b16 & b18;
            s[15] = b15 ^ ~b17 & b19;
            s[24] = b24 ^ ~b26 & b28;
            s[25] = b25 ^ ~b27 & b29;
            s[34] = b34 ^ ~b36 & b38;
            s[35] = b35 ^ ~b37 & b39;
            s[44] = b44 ^ ~b46 & b48;
            s[45] = b45 ^ ~b47 & b49;
            s[6] = b6 ^ ~b8 & b0;
            s[7] = b7 ^ ~b9 & b1;
            s[16] = b16 ^ ~b18 & b10;
            s[17] = b17 ^ ~b19 & b11;
            s[26] = b26 ^ ~b28 & b20;
            s[27] = b27 ^ ~b29 & b21;
            s[36] = b36 ^ ~b38 & b30;
            s[37] = b37 ^ ~b39 & b31;
            s[46] = b46 ^ ~b48 & b40;
            s[47] = b47 ^ ~b49 & b41;
            s[8] = b8 ^ ~b0 & b2;
            s[9] = b9 ^ ~b1 & b3;
            s[18] = b18 ^ ~b10 & b12;
            s[19] = b19 ^ ~b11 & b13;
            s[28] = b28 ^ ~b20 & b22;
            s[29] = b29 ^ ~b21 & b23;
            s[38] = b38 ^ ~b30 & b32;
            s[39] = b39 ^ ~b31 & b33;
            s[48] = b48 ^ ~b40 & b42;
            s[49] = b49 ^ ~b41 & b43;
            s[0] ^= RC[n];
            s[1] ^= RC[n + 1];
          }
        };
        if (COMMON_JS) {
          module.exports = methods;
        } else {
          for (i = 0; i < methodNames.length; ++i) {
            root[methodNames[i]] = methods[methodNames[i]];
          }
          if (AMD) {
            define(function() {
              return methods;
            });
          }
        }
      })();
    }
  });

  // node_modules/minimalistic-assert/index.js
  var require_minimalistic_assert = __commonJS({
    "node_modules/minimalistic-assert/index.js"(exports, module) {
      init_buffer_shim_entry();
      module.exports = assert2;
      function assert2(val, msg) {
        if (!val)
          throw new Error(msg || "Assertion failed");
      }
      assert2.equal = function assertEqual2(l, r, msg) {
        if (l != r)
          throw new Error(msg || "Assertion failed: " + l + " != " + r);
      };
    }
  });

  // node_modules/inherits/inherits_browser.js
  var require_inherits_browser = __commonJS({
    "node_modules/inherits/inherits_browser.js"(exports, module) {
      init_buffer_shim_entry();
      if (typeof Object.create === "function") {
        module.exports = function inherits2(ctor, superCtor) {
          if (superCtor) {
            ctor.super_ = superCtor;
            ctor.prototype = Object.create(superCtor.prototype, {
              constructor: {
                value: ctor,
                enumerable: false,
                writable: true,
                configurable: true
              }
            });
          }
        };
      } else {
        module.exports = function inherits2(ctor, superCtor) {
          if (superCtor) {
            ctor.super_ = superCtor;
            var TempCtor = function() {
            };
            TempCtor.prototype = superCtor.prototype;
            ctor.prototype = new TempCtor();
            ctor.prototype.constructor = ctor;
          }
        };
      }
    }
  });

  // node_modules/hash.js/lib/hash/utils.js
  var require_utils = __commonJS({
    "node_modules/hash.js/lib/hash/utils.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      var assert2 = require_minimalistic_assert();
      var inherits2 = require_inherits_browser();
      exports.inherits = inherits2;
      function isSurrogatePair(msg, i) {
        if ((msg.charCodeAt(i) & 64512) !== 55296) {
          return false;
        }
        if (i < 0 || i + 1 >= msg.length) {
          return false;
        }
        return (msg.charCodeAt(i + 1) & 64512) === 56320;
      }
      function toArray2(msg, enc) {
        if (Array.isArray(msg))
          return msg.slice();
        if (!msg)
          return [];
        var res = [];
        if (typeof msg === "string") {
          if (!enc) {
            var p = 0;
            for (var i = 0; i < msg.length; i++) {
              var c = msg.charCodeAt(i);
              if (c < 128) {
                res[p++] = c;
              } else if (c < 2048) {
                res[p++] = c >> 6 | 192;
                res[p++] = c & 63 | 128;
              } else if (isSurrogatePair(msg, i)) {
                c = 65536 + ((c & 1023) << 10) + (msg.charCodeAt(++i) & 1023);
                res[p++] = c >> 18 | 240;
                res[p++] = c >> 12 & 63 | 128;
                res[p++] = c >> 6 & 63 | 128;
                res[p++] = c & 63 | 128;
              } else {
                res[p++] = c >> 12 | 224;
                res[p++] = c >> 6 & 63 | 128;
                res[p++] = c & 63 | 128;
              }
            }
          } else if (enc === "hex") {
            msg = msg.replace(/[^a-z0-9]+/ig, "");
            if (msg.length % 2 !== 0)
              msg = "0" + msg;
            for (i = 0; i < msg.length; i += 2)
              res.push(parseInt(msg[i] + msg[i + 1], 16));
          }
        } else {
          for (i = 0; i < msg.length; i++)
            res[i] = msg[i] | 0;
        }
        return res;
      }
      exports.toArray = toArray2;
      function toHex2(msg) {
        var res = "";
        for (var i = 0; i < msg.length; i++)
          res += zero2(msg[i].toString(16));
        return res;
      }
      exports.toHex = toHex2;
      function htonl(w) {
        var res = w >>> 24 | w >>> 8 & 65280 | w << 8 & 16711680 | (w & 255) << 24;
        return res >>> 0;
      }
      exports.htonl = htonl;
      function toHex32(msg, endian) {
        var res = "";
        for (var i = 0; i < msg.length; i++) {
          var w = msg[i];
          if (endian === "little")
            w = htonl(w);
          res += zero8(w.toString(16));
        }
        return res;
      }
      exports.toHex32 = toHex32;
      function zero2(word) {
        if (word.length === 1)
          return "0" + word;
        else
          return word;
      }
      exports.zero2 = zero2;
      function zero8(word) {
        if (word.length === 7)
          return "0" + word;
        else if (word.length === 6)
          return "00" + word;
        else if (word.length === 5)
          return "000" + word;
        else if (word.length === 4)
          return "0000" + word;
        else if (word.length === 3)
          return "00000" + word;
        else if (word.length === 2)
          return "000000" + word;
        else if (word.length === 1)
          return "0000000" + word;
        else
          return word;
      }
      exports.zero8 = zero8;
      function join32(msg, start, end, endian) {
        var len = end - start;
        assert2(len % 4 === 0);
        var res = new Array(len / 4);
        for (var i = 0, k = start; i < res.length; i++, k += 4) {
          var w;
          if (endian === "big")
            w = msg[k] << 24 | msg[k + 1] << 16 | msg[k + 2] << 8 | msg[k + 3];
          else
            w = msg[k + 3] << 24 | msg[k + 2] << 16 | msg[k + 1] << 8 | msg[k];
          res[i] = w >>> 0;
        }
        return res;
      }
      exports.join32 = join32;
      function split32(msg, endian) {
        var res = new Array(msg.length * 4);
        for (var i = 0, k = 0; i < msg.length; i++, k += 4) {
          var m = msg[i];
          if (endian === "big") {
            res[k] = m >>> 24;
            res[k + 1] = m >>> 16 & 255;
            res[k + 2] = m >>> 8 & 255;
            res[k + 3] = m & 255;
          } else {
            res[k + 3] = m >>> 24;
            res[k + 2] = m >>> 16 & 255;
            res[k + 1] = m >>> 8 & 255;
            res[k] = m & 255;
          }
        }
        return res;
      }
      exports.split32 = split32;
      function rotr32(w, b) {
        return w >>> b | w << 32 - b;
      }
      exports.rotr32 = rotr32;
      function rotl32(w, b) {
        return w << b | w >>> 32 - b;
      }
      exports.rotl32 = rotl32;
      function sum32(a, b) {
        return a + b >>> 0;
      }
      exports.sum32 = sum32;
      function sum32_3(a, b, c) {
        return a + b + c >>> 0;
      }
      exports.sum32_3 = sum32_3;
      function sum32_4(a, b, c, d) {
        return a + b + c + d >>> 0;
      }
      exports.sum32_4 = sum32_4;
      function sum32_5(a, b, c, d, e) {
        return a + b + c + d + e >>> 0;
      }
      exports.sum32_5 = sum32_5;
      function sum64(buf, pos, ah, al) {
        var bh = buf[pos];
        var bl = buf[pos + 1];
        var lo = al + bl >>> 0;
        var hi = (lo < al ? 1 : 0) + ah + bh;
        buf[pos] = hi >>> 0;
        buf[pos + 1] = lo;
      }
      exports.sum64 = sum64;
      function sum64_hi(ah, al, bh, bl) {
        var lo = al + bl >>> 0;
        var hi = (lo < al ? 1 : 0) + ah + bh;
        return hi >>> 0;
      }
      exports.sum64_hi = sum64_hi;
      function sum64_lo(ah, al, bh, bl) {
        var lo = al + bl;
        return lo >>> 0;
      }
      exports.sum64_lo = sum64_lo;
      function sum64_4_hi(ah, al, bh, bl, ch, cl, dh, dl) {
        var carry = 0;
        var lo = al;
        lo = lo + bl >>> 0;
        carry += lo < al ? 1 : 0;
        lo = lo + cl >>> 0;
        carry += lo < cl ? 1 : 0;
        lo = lo + dl >>> 0;
        carry += lo < dl ? 1 : 0;
        var hi = ah + bh + ch + dh + carry;
        return hi >>> 0;
      }
      exports.sum64_4_hi = sum64_4_hi;
      function sum64_4_lo(ah, al, bh, bl, ch, cl, dh, dl) {
        var lo = al + bl + cl + dl;
        return lo >>> 0;
      }
      exports.sum64_4_lo = sum64_4_lo;
      function sum64_5_hi(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
        var carry = 0;
        var lo = al;
        lo = lo + bl >>> 0;
        carry += lo < al ? 1 : 0;
        lo = lo + cl >>> 0;
        carry += lo < cl ? 1 : 0;
        lo = lo + dl >>> 0;
        carry += lo < dl ? 1 : 0;
        lo = lo + el >>> 0;
        carry += lo < el ? 1 : 0;
        var hi = ah + bh + ch + dh + eh + carry;
        return hi >>> 0;
      }
      exports.sum64_5_hi = sum64_5_hi;
      function sum64_5_lo(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
        var lo = al + bl + cl + dl + el;
        return lo >>> 0;
      }
      exports.sum64_5_lo = sum64_5_lo;
      function rotr64_hi(ah, al, num) {
        var r = al << 32 - num | ah >>> num;
        return r >>> 0;
      }
      exports.rotr64_hi = rotr64_hi;
      function rotr64_lo(ah, al, num) {
        var r = ah << 32 - num | al >>> num;
        return r >>> 0;
      }
      exports.rotr64_lo = rotr64_lo;
      function shr64_hi(ah, al, num) {
        return ah >>> num;
      }
      exports.shr64_hi = shr64_hi;
      function shr64_lo(ah, al, num) {
        var r = ah << 32 - num | al >>> num;
        return r >>> 0;
      }
      exports.shr64_lo = shr64_lo;
    }
  });

  // node_modules/hash.js/lib/hash/common.js
  var require_common = __commonJS({
    "node_modules/hash.js/lib/hash/common.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var assert2 = require_minimalistic_assert();
      function BlockHash() {
        this.pending = null;
        this.pendingTotal = 0;
        this.blockSize = this.constructor.blockSize;
        this.outSize = this.constructor.outSize;
        this.hmacStrength = this.constructor.hmacStrength;
        this.padLength = this.constructor.padLength / 8;
        this.endian = "big";
        this._delta8 = this.blockSize / 8;
        this._delta32 = this.blockSize / 32;
      }
      exports.BlockHash = BlockHash;
      BlockHash.prototype.update = function update2(msg, enc) {
        msg = utils.toArray(msg, enc);
        if (!this.pending)
          this.pending = msg;
        else
          this.pending = this.pending.concat(msg);
        this.pendingTotal += msg.length;
        if (this.pending.length >= this._delta8) {
          msg = this.pending;
          var r = msg.length % this._delta8;
          this.pending = msg.slice(msg.length - r, msg.length);
          if (this.pending.length === 0)
            this.pending = null;
          msg = utils.join32(msg, 0, msg.length - r, this.endian);
          for (var i = 0; i < msg.length; i += this._delta32)
            this._update(msg, i, i + this._delta32);
        }
        return this;
      };
      BlockHash.prototype.digest = function digest(enc) {
        this.update(this._pad());
        assert2(this.pending === null);
        return this._digest(enc);
      };
      BlockHash.prototype._pad = function pad() {
        var len = this.pendingTotal;
        var bytes = this._delta8;
        var k = bytes - (len + this.padLength) % bytes;
        var res = new Array(k + this.padLength);
        res[0] = 128;
        for (var i = 1; i < k; i++)
          res[i] = 0;
        len <<= 3;
        if (this.endian === "big") {
          for (var t = 8; t < this.padLength; t++)
            res[i++] = 0;
          res[i++] = 0;
          res[i++] = 0;
          res[i++] = 0;
          res[i++] = 0;
          res[i++] = len >>> 24 & 255;
          res[i++] = len >>> 16 & 255;
          res[i++] = len >>> 8 & 255;
          res[i++] = len & 255;
        } else {
          res[i++] = len & 255;
          res[i++] = len >>> 8 & 255;
          res[i++] = len >>> 16 & 255;
          res[i++] = len >>> 24 & 255;
          res[i++] = 0;
          res[i++] = 0;
          res[i++] = 0;
          res[i++] = 0;
          for (t = 8; t < this.padLength; t++)
            res[i++] = 0;
        }
        return res;
      };
    }
  });

  // node_modules/hash.js/lib/hash/sha/common.js
  var require_common2 = __commonJS({
    "node_modules/hash.js/lib/hash/sha/common.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var rotr32 = utils.rotr32;
      function ft_1(s, x, y, z) {
        if (s === 0)
          return ch32(x, y, z);
        if (s === 1 || s === 3)
          return p32(x, y, z);
        if (s === 2)
          return maj32(x, y, z);
      }
      exports.ft_1 = ft_1;
      function ch32(x, y, z) {
        return x & y ^ ~x & z;
      }
      exports.ch32 = ch32;
      function maj32(x, y, z) {
        return x & y ^ x & z ^ y & z;
      }
      exports.maj32 = maj32;
      function p32(x, y, z) {
        return x ^ y ^ z;
      }
      exports.p32 = p32;
      function s0_256(x) {
        return rotr32(x, 2) ^ rotr32(x, 13) ^ rotr32(x, 22);
      }
      exports.s0_256 = s0_256;
      function s1_256(x) {
        return rotr32(x, 6) ^ rotr32(x, 11) ^ rotr32(x, 25);
      }
      exports.s1_256 = s1_256;
      function g0_256(x) {
        return rotr32(x, 7) ^ rotr32(x, 18) ^ x >>> 3;
      }
      exports.g0_256 = g0_256;
      function g1_256(x) {
        return rotr32(x, 17) ^ rotr32(x, 19) ^ x >>> 10;
      }
      exports.g1_256 = g1_256;
    }
  });

  // node_modules/hash.js/lib/hash/sha/1.js
  var require__ = __commonJS({
    "node_modules/hash.js/lib/hash/sha/1.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var common = require_common();
      var shaCommon = require_common2();
      var rotl32 = utils.rotl32;
      var sum32 = utils.sum32;
      var sum32_5 = utils.sum32_5;
      var ft_1 = shaCommon.ft_1;
      var BlockHash = common.BlockHash;
      var sha1_K = [
        1518500249,
        1859775393,
        2400959708,
        3395469782
      ];
      function SHA1() {
        if (!(this instanceof SHA1))
          return new SHA1();
        BlockHash.call(this);
        this.h = [
          1732584193,
          4023233417,
          2562383102,
          271733878,
          3285377520
        ];
        this.W = new Array(80);
      }
      utils.inherits(SHA1, BlockHash);
      module.exports = SHA1;
      SHA1.blockSize = 512;
      SHA1.outSize = 160;
      SHA1.hmacStrength = 80;
      SHA1.padLength = 64;
      SHA1.prototype._update = function _update(msg, start) {
        var W = this.W;
        for (var i = 0; i < 16; i++)
          W[i] = msg[start + i];
        for (; i < W.length; i++)
          W[i] = rotl32(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
        var a = this.h[0];
        var b = this.h[1];
        var c = this.h[2];
        var d = this.h[3];
        var e = this.h[4];
        for (i = 0; i < W.length; i++) {
          var s = ~~(i / 20);
          var t = sum32_5(rotl32(a, 5), ft_1(s, b, c, d), e, W[i], sha1_K[s]);
          e = d;
          d = c;
          c = rotl32(b, 30);
          b = a;
          a = t;
        }
        this.h[0] = sum32(this.h[0], a);
        this.h[1] = sum32(this.h[1], b);
        this.h[2] = sum32(this.h[2], c);
        this.h[3] = sum32(this.h[3], d);
        this.h[4] = sum32(this.h[4], e);
      };
      SHA1.prototype._digest = function digest(enc) {
        if (enc === "hex")
          return utils.toHex32(this.h, "big");
        else
          return utils.split32(this.h, "big");
      };
    }
  });

  // node_modules/hash.js/lib/hash/sha/256.js
  var require__2 = __commonJS({
    "node_modules/hash.js/lib/hash/sha/256.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var common = require_common();
      var shaCommon = require_common2();
      var assert2 = require_minimalistic_assert();
      var sum32 = utils.sum32;
      var sum32_4 = utils.sum32_4;
      var sum32_5 = utils.sum32_5;
      var ch32 = shaCommon.ch32;
      var maj32 = shaCommon.maj32;
      var s0_256 = shaCommon.s0_256;
      var s1_256 = shaCommon.s1_256;
      var g0_256 = shaCommon.g0_256;
      var g1_256 = shaCommon.g1_256;
      var BlockHash = common.BlockHash;
      var sha256_K = [
        1116352408,
        1899447441,
        3049323471,
        3921009573,
        961987163,
        1508970993,
        2453635748,
        2870763221,
        3624381080,
        310598401,
        607225278,
        1426881987,
        1925078388,
        2162078206,
        2614888103,
        3248222580,
        3835390401,
        4022224774,
        264347078,
        604807628,
        770255983,
        1249150122,
        1555081692,
        1996064986,
        2554220882,
        2821834349,
        2952996808,
        3210313671,
        3336571891,
        3584528711,
        113926993,
        338241895,
        666307205,
        773529912,
        1294757372,
        1396182291,
        1695183700,
        1986661051,
        2177026350,
        2456956037,
        2730485921,
        2820302411,
        3259730800,
        3345764771,
        3516065817,
        3600352804,
        4094571909,
        275423344,
        430227734,
        506948616,
        659060556,
        883997877,
        958139571,
        1322822218,
        1537002063,
        1747873779,
        1955562222,
        2024104815,
        2227730452,
        2361852424,
        2428436474,
        2756734187,
        3204031479,
        3329325298
      ];
      function SHA256() {
        if (!(this instanceof SHA256))
          return new SHA256();
        BlockHash.call(this);
        this.h = [
          1779033703,
          3144134277,
          1013904242,
          2773480762,
          1359893119,
          2600822924,
          528734635,
          1541459225
        ];
        this.k = sha256_K;
        this.W = new Array(64);
      }
      utils.inherits(SHA256, BlockHash);
      module.exports = SHA256;
      SHA256.blockSize = 512;
      SHA256.outSize = 256;
      SHA256.hmacStrength = 192;
      SHA256.padLength = 64;
      SHA256.prototype._update = function _update(msg, start) {
        var W = this.W;
        for (var i = 0; i < 16; i++)
          W[i] = msg[start + i];
        for (; i < W.length; i++)
          W[i] = sum32_4(g1_256(W[i - 2]), W[i - 7], g0_256(W[i - 15]), W[i - 16]);
        var a = this.h[0];
        var b = this.h[1];
        var c = this.h[2];
        var d = this.h[3];
        var e = this.h[4];
        var f = this.h[5];
        var g = this.h[6];
        var h = this.h[7];
        assert2(this.k.length === W.length);
        for (i = 0; i < W.length; i++) {
          var T1 = sum32_5(h, s1_256(e), ch32(e, f, g), this.k[i], W[i]);
          var T2 = sum32(s0_256(a), maj32(a, b, c));
          h = g;
          g = f;
          f = e;
          e = sum32(d, T1);
          d = c;
          c = b;
          b = a;
          a = sum32(T1, T2);
        }
        this.h[0] = sum32(this.h[0], a);
        this.h[1] = sum32(this.h[1], b);
        this.h[2] = sum32(this.h[2], c);
        this.h[3] = sum32(this.h[3], d);
        this.h[4] = sum32(this.h[4], e);
        this.h[5] = sum32(this.h[5], f);
        this.h[6] = sum32(this.h[6], g);
        this.h[7] = sum32(this.h[7], h);
      };
      SHA256.prototype._digest = function digest(enc) {
        if (enc === "hex")
          return utils.toHex32(this.h, "big");
        else
          return utils.split32(this.h, "big");
      };
    }
  });

  // node_modules/hash.js/lib/hash/sha/224.js
  var require__3 = __commonJS({
    "node_modules/hash.js/lib/hash/sha/224.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var SHA256 = require__2();
      function SHA2242() {
        if (!(this instanceof SHA2242))
          return new SHA2242();
        SHA256.call(this);
        this.h = [
          3238371032,
          914150663,
          812702999,
          4144912697,
          4290775857,
          1750603025,
          1694076839,
          3204075428
        ];
      }
      utils.inherits(SHA2242, SHA256);
      module.exports = SHA2242;
      SHA2242.blockSize = 512;
      SHA2242.outSize = 224;
      SHA2242.hmacStrength = 192;
      SHA2242.padLength = 64;
      SHA2242.prototype._digest = function digest(enc) {
        if (enc === "hex")
          return utils.toHex32(this.h.slice(0, 7), "big");
        else
          return utils.split32(this.h.slice(0, 7), "big");
      };
    }
  });

  // node_modules/hash.js/lib/hash/sha/512.js
  var require__4 = __commonJS({
    "node_modules/hash.js/lib/hash/sha/512.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var common = require_common();
      var assert2 = require_minimalistic_assert();
      var rotr64_hi = utils.rotr64_hi;
      var rotr64_lo = utils.rotr64_lo;
      var shr64_hi = utils.shr64_hi;
      var shr64_lo = utils.shr64_lo;
      var sum64 = utils.sum64;
      var sum64_hi = utils.sum64_hi;
      var sum64_lo = utils.sum64_lo;
      var sum64_4_hi = utils.sum64_4_hi;
      var sum64_4_lo = utils.sum64_4_lo;
      var sum64_5_hi = utils.sum64_5_hi;
      var sum64_5_lo = utils.sum64_5_lo;
      var BlockHash = common.BlockHash;
      var sha512_K = [
        1116352408,
        3609767458,
        1899447441,
        602891725,
        3049323471,
        3964484399,
        3921009573,
        2173295548,
        961987163,
        4081628472,
        1508970993,
        3053834265,
        2453635748,
        2937671579,
        2870763221,
        3664609560,
        3624381080,
        2734883394,
        310598401,
        1164996542,
        607225278,
        1323610764,
        1426881987,
        3590304994,
        1925078388,
        4068182383,
        2162078206,
        991336113,
        2614888103,
        633803317,
        3248222580,
        3479774868,
        3835390401,
        2666613458,
        4022224774,
        944711139,
        264347078,
        2341262773,
        604807628,
        2007800933,
        770255983,
        1495990901,
        1249150122,
        1856431235,
        1555081692,
        3175218132,
        1996064986,
        2198950837,
        2554220882,
        3999719339,
        2821834349,
        766784016,
        2952996808,
        2566594879,
        3210313671,
        3203337956,
        3336571891,
        1034457026,
        3584528711,
        2466948901,
        113926993,
        3758326383,
        338241895,
        168717936,
        666307205,
        1188179964,
        773529912,
        1546045734,
        1294757372,
        1522805485,
        1396182291,
        2643833823,
        1695183700,
        2343527390,
        1986661051,
        1014477480,
        2177026350,
        1206759142,
        2456956037,
        344077627,
        2730485921,
        1290863460,
        2820302411,
        3158454273,
        3259730800,
        3505952657,
        3345764771,
        106217008,
        3516065817,
        3606008344,
        3600352804,
        1432725776,
        4094571909,
        1467031594,
        275423344,
        851169720,
        430227734,
        3100823752,
        506948616,
        1363258195,
        659060556,
        3750685593,
        883997877,
        3785050280,
        958139571,
        3318307427,
        1322822218,
        3812723403,
        1537002063,
        2003034995,
        1747873779,
        3602036899,
        1955562222,
        1575990012,
        2024104815,
        1125592928,
        2227730452,
        2716904306,
        2361852424,
        442776044,
        2428436474,
        593698344,
        2756734187,
        3733110249,
        3204031479,
        2999351573,
        3329325298,
        3815920427,
        3391569614,
        3928383900,
        3515267271,
        566280711,
        3940187606,
        3454069534,
        4118630271,
        4000239992,
        116418474,
        1914138554,
        174292421,
        2731055270,
        289380356,
        3203993006,
        460393269,
        320620315,
        685471733,
        587496836,
        852142971,
        1086792851,
        1017036298,
        365543100,
        1126000580,
        2618297676,
        1288033470,
        3409855158,
        1501505948,
        4234509866,
        1607167915,
        987167468,
        1816402316,
        1246189591
      ];
      function SHA512() {
        if (!(this instanceof SHA512))
          return new SHA512();
        BlockHash.call(this);
        this.h = [
          1779033703,
          4089235720,
          3144134277,
          2227873595,
          1013904242,
          4271175723,
          2773480762,
          1595750129,
          1359893119,
          2917565137,
          2600822924,
          725511199,
          528734635,
          4215389547,
          1541459225,
          327033209
        ];
        this.k = sha512_K;
        this.W = new Array(160);
      }
      utils.inherits(SHA512, BlockHash);
      module.exports = SHA512;
      SHA512.blockSize = 1024;
      SHA512.outSize = 512;
      SHA512.hmacStrength = 192;
      SHA512.padLength = 128;
      SHA512.prototype._prepareBlock = function _prepareBlock(msg, start) {
        var W = this.W;
        for (var i = 0; i < 32; i++)
          W[i] = msg[start + i];
        for (; i < W.length; i += 2) {
          var c0_hi = g1_512_hi(W[i - 4], W[i - 3]);
          var c0_lo = g1_512_lo(W[i - 4], W[i - 3]);
          var c1_hi = W[i - 14];
          var c1_lo = W[i - 13];
          var c2_hi = g0_512_hi(W[i - 30], W[i - 29]);
          var c2_lo = g0_512_lo(W[i - 30], W[i - 29]);
          var c3_hi = W[i - 32];
          var c3_lo = W[i - 31];
          W[i] = sum64_4_hi(
            c0_hi,
            c0_lo,
            c1_hi,
            c1_lo,
            c2_hi,
            c2_lo,
            c3_hi,
            c3_lo
          );
          W[i + 1] = sum64_4_lo(
            c0_hi,
            c0_lo,
            c1_hi,
            c1_lo,
            c2_hi,
            c2_lo,
            c3_hi,
            c3_lo
          );
        }
      };
      SHA512.prototype._update = function _update(msg, start) {
        this._prepareBlock(msg, start);
        var W = this.W;
        var ah = this.h[0];
        var al = this.h[1];
        var bh = this.h[2];
        var bl = this.h[3];
        var ch = this.h[4];
        var cl = this.h[5];
        var dh = this.h[6];
        var dl = this.h[7];
        var eh = this.h[8];
        var el = this.h[9];
        var fh = this.h[10];
        var fl = this.h[11];
        var gh = this.h[12];
        var gl = this.h[13];
        var hh = this.h[14];
        var hl = this.h[15];
        assert2(this.k.length === W.length);
        for (var i = 0; i < W.length; i += 2) {
          var c0_hi = hh;
          var c0_lo = hl;
          var c1_hi = s1_512_hi(eh, el);
          var c1_lo = s1_512_lo(eh, el);
          var c2_hi = ch64_hi(eh, el, fh, fl, gh, gl);
          var c2_lo = ch64_lo(eh, el, fh, fl, gh, gl);
          var c3_hi = this.k[i];
          var c3_lo = this.k[i + 1];
          var c4_hi = W[i];
          var c4_lo = W[i + 1];
          var T1_hi = sum64_5_hi(
            c0_hi,
            c0_lo,
            c1_hi,
            c1_lo,
            c2_hi,
            c2_lo,
            c3_hi,
            c3_lo,
            c4_hi,
            c4_lo
          );
          var T1_lo = sum64_5_lo(
            c0_hi,
            c0_lo,
            c1_hi,
            c1_lo,
            c2_hi,
            c2_lo,
            c3_hi,
            c3_lo,
            c4_hi,
            c4_lo
          );
          c0_hi = s0_512_hi(ah, al);
          c0_lo = s0_512_lo(ah, al);
          c1_hi = maj64_hi(ah, al, bh, bl, ch, cl);
          c1_lo = maj64_lo(ah, al, bh, bl, ch, cl);
          var T2_hi = sum64_hi(c0_hi, c0_lo, c1_hi, c1_lo);
          var T2_lo = sum64_lo(c0_hi, c0_lo, c1_hi, c1_lo);
          hh = gh;
          hl = gl;
          gh = fh;
          gl = fl;
          fh = eh;
          fl = el;
          eh = sum64_hi(dh, dl, T1_hi, T1_lo);
          el = sum64_lo(dl, dl, T1_hi, T1_lo);
          dh = ch;
          dl = cl;
          ch = bh;
          cl = bl;
          bh = ah;
          bl = al;
          ah = sum64_hi(T1_hi, T1_lo, T2_hi, T2_lo);
          al = sum64_lo(T1_hi, T1_lo, T2_hi, T2_lo);
        }
        sum64(this.h, 0, ah, al);
        sum64(this.h, 2, bh, bl);
        sum64(this.h, 4, ch, cl);
        sum64(this.h, 6, dh, dl);
        sum64(this.h, 8, eh, el);
        sum64(this.h, 10, fh, fl);
        sum64(this.h, 12, gh, gl);
        sum64(this.h, 14, hh, hl);
      };
      SHA512.prototype._digest = function digest(enc) {
        if (enc === "hex")
          return utils.toHex32(this.h, "big");
        else
          return utils.split32(this.h, "big");
      };
      function ch64_hi(xh, xl, yh, yl, zh) {
        var r = xh & yh ^ ~xh & zh;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function ch64_lo(xh, xl, yh, yl, zh, zl) {
        var r = xl & yl ^ ~xl & zl;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function maj64_hi(xh, xl, yh, yl, zh) {
        var r = xh & yh ^ xh & zh ^ yh & zh;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function maj64_lo(xh, xl, yh, yl, zh, zl) {
        var r = xl & yl ^ xl & zl ^ yl & zl;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function s0_512_hi(xh, xl) {
        var c0_hi = rotr64_hi(xh, xl, 28);
        var c1_hi = rotr64_hi(xl, xh, 2);
        var c2_hi = rotr64_hi(xl, xh, 7);
        var r = c0_hi ^ c1_hi ^ c2_hi;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function s0_512_lo(xh, xl) {
        var c0_lo = rotr64_lo(xh, xl, 28);
        var c1_lo = rotr64_lo(xl, xh, 2);
        var c2_lo = rotr64_lo(xl, xh, 7);
        var r = c0_lo ^ c1_lo ^ c2_lo;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function s1_512_hi(xh, xl) {
        var c0_hi = rotr64_hi(xh, xl, 14);
        var c1_hi = rotr64_hi(xh, xl, 18);
        var c2_hi = rotr64_hi(xl, xh, 9);
        var r = c0_hi ^ c1_hi ^ c2_hi;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function s1_512_lo(xh, xl) {
        var c0_lo = rotr64_lo(xh, xl, 14);
        var c1_lo = rotr64_lo(xh, xl, 18);
        var c2_lo = rotr64_lo(xl, xh, 9);
        var r = c0_lo ^ c1_lo ^ c2_lo;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function g0_512_hi(xh, xl) {
        var c0_hi = rotr64_hi(xh, xl, 1);
        var c1_hi = rotr64_hi(xh, xl, 8);
        var c2_hi = shr64_hi(xh, xl, 7);
        var r = c0_hi ^ c1_hi ^ c2_hi;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function g0_512_lo(xh, xl) {
        var c0_lo = rotr64_lo(xh, xl, 1);
        var c1_lo = rotr64_lo(xh, xl, 8);
        var c2_lo = shr64_lo(xh, xl, 7);
        var r = c0_lo ^ c1_lo ^ c2_lo;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function g1_512_hi(xh, xl) {
        var c0_hi = rotr64_hi(xh, xl, 19);
        var c1_hi = rotr64_hi(xl, xh, 29);
        var c2_hi = shr64_hi(xh, xl, 6);
        var r = c0_hi ^ c1_hi ^ c2_hi;
        if (r < 0)
          r += 4294967296;
        return r;
      }
      function g1_512_lo(xh, xl) {
        var c0_lo = rotr64_lo(xh, xl, 19);
        var c1_lo = rotr64_lo(xl, xh, 29);
        var c2_lo = shr64_lo(xh, xl, 6);
        var r = c0_lo ^ c1_lo ^ c2_lo;
        if (r < 0)
          r += 4294967296;
        return r;
      }
    }
  });

  // node_modules/hash.js/lib/hash/sha/384.js
  var require__5 = __commonJS({
    "node_modules/hash.js/lib/hash/sha/384.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var SHA512 = require__4();
      function SHA384() {
        if (!(this instanceof SHA384))
          return new SHA384();
        SHA512.call(this);
        this.h = [
          3418070365,
          3238371032,
          1654270250,
          914150663,
          2438529370,
          812702999,
          355462360,
          4144912697,
          1731405415,
          4290775857,
          2394180231,
          1750603025,
          3675008525,
          1694076839,
          1203062813,
          3204075428
        ];
      }
      utils.inherits(SHA384, SHA512);
      module.exports = SHA384;
      SHA384.blockSize = 1024;
      SHA384.outSize = 384;
      SHA384.hmacStrength = 192;
      SHA384.padLength = 128;
      SHA384.prototype._digest = function digest(enc) {
        if (enc === "hex")
          return utils.toHex32(this.h.slice(0, 12), "big");
        else
          return utils.split32(this.h.slice(0, 12), "big");
      };
    }
  });

  // node_modules/hash.js/lib/hash/sha.js
  var require_sha = __commonJS({
    "node_modules/hash.js/lib/hash/sha.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      exports.sha1 = require__();
      exports.sha224 = require__3();
      exports.sha256 = require__2();
      exports.sha384 = require__5();
      exports.sha512 = require__4();
    }
  });

  // node_modules/hash.js/lib/hash/ripemd.js
  var require_ripemd = __commonJS({
    "node_modules/hash.js/lib/hash/ripemd.js"(exports) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var common = require_common();
      var rotl32 = utils.rotl32;
      var sum32 = utils.sum32;
      var sum32_3 = utils.sum32_3;
      var sum32_4 = utils.sum32_4;
      var BlockHash = common.BlockHash;
      function RIPEMD160() {
        if (!(this instanceof RIPEMD160))
          return new RIPEMD160();
        BlockHash.call(this);
        this.h = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
        this.endian = "little";
      }
      utils.inherits(RIPEMD160, BlockHash);
      exports.ripemd160 = RIPEMD160;
      RIPEMD160.blockSize = 512;
      RIPEMD160.outSize = 160;
      RIPEMD160.hmacStrength = 192;
      RIPEMD160.padLength = 64;
      RIPEMD160.prototype._update = function update2(msg, start) {
        var A = this.h[0];
        var B = this.h[1];
        var C = this.h[2];
        var D = this.h[3];
        var E = this.h[4];
        var Ah = A;
        var Bh = B;
        var Ch = C;
        var Dh = D;
        var Eh = E;
        for (var j = 0; j < 80; j++) {
          var T = sum32(
            rotl32(
              sum32_4(A, f(j, B, C, D), msg[r[j] + start], K(j)),
              s[j]
            ),
            E
          );
          A = E;
          E = D;
          D = rotl32(C, 10);
          C = B;
          B = T;
          T = sum32(
            rotl32(
              sum32_4(Ah, f(79 - j, Bh, Ch, Dh), msg[rh[j] + start], Kh(j)),
              sh[j]
            ),
            Eh
          );
          Ah = Eh;
          Eh = Dh;
          Dh = rotl32(Ch, 10);
          Ch = Bh;
          Bh = T;
        }
        T = sum32_3(this.h[1], C, Dh);
        this.h[1] = sum32_3(this.h[2], D, Eh);
        this.h[2] = sum32_3(this.h[3], E, Ah);
        this.h[3] = sum32_3(this.h[4], A, Bh);
        this.h[4] = sum32_3(this.h[0], B, Ch);
        this.h[0] = T;
      };
      RIPEMD160.prototype._digest = function digest(enc) {
        if (enc === "hex")
          return utils.toHex32(this.h, "little");
        else
          return utils.split32(this.h, "little");
      };
      function f(j, x, y, z) {
        if (j <= 15)
          return x ^ y ^ z;
        else if (j <= 31)
          return x & y | ~x & z;
        else if (j <= 47)
          return (x | ~y) ^ z;
        else if (j <= 63)
          return x & z | y & ~z;
        else
          return x ^ (y | ~z);
      }
      function K(j) {
        if (j <= 15)
          return 0;
        else if (j <= 31)
          return 1518500249;
        else if (j <= 47)
          return 1859775393;
        else if (j <= 63)
          return 2400959708;
        else
          return 2840853838;
      }
      function Kh(j) {
        if (j <= 15)
          return 1352829926;
        else if (j <= 31)
          return 1548603684;
        else if (j <= 47)
          return 1836072691;
        else if (j <= 63)
          return 2053994217;
        else
          return 0;
      }
      var r = [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        7,
        4,
        13,
        1,
        10,
        6,
        15,
        3,
        12,
        0,
        9,
        5,
        2,
        14,
        11,
        8,
        3,
        10,
        14,
        4,
        9,
        15,
        8,
        1,
        2,
        7,
        0,
        6,
        13,
        11,
        5,
        12,
        1,
        9,
        11,
        10,
        0,
        8,
        12,
        4,
        13,
        3,
        7,
        15,
        14,
        5,
        6,
        2,
        4,
        0,
        5,
        9,
        7,
        12,
        2,
        10,
        14,
        1,
        3,
        8,
        11,
        6,
        15,
        13
      ];
      var rh = [
        5,
        14,
        7,
        0,
        9,
        2,
        11,
        4,
        13,
        6,
        15,
        8,
        1,
        10,
        3,
        12,
        6,
        11,
        3,
        7,
        0,
        13,
        5,
        10,
        14,
        15,
        8,
        12,
        4,
        9,
        1,
        2,
        15,
        5,
        1,
        3,
        7,
        14,
        6,
        9,
        11,
        8,
        12,
        2,
        10,
        0,
        4,
        13,
        8,
        6,
        4,
        1,
        3,
        11,
        15,
        0,
        5,
        12,
        2,
        13,
        9,
        7,
        10,
        14,
        12,
        15,
        10,
        4,
        1,
        5,
        8,
        7,
        6,
        2,
        13,
        14,
        0,
        3,
        9,
        11
      ];
      var s = [
        11,
        14,
        15,
        12,
        5,
        8,
        7,
        9,
        11,
        13,
        14,
        15,
        6,
        7,
        9,
        8,
        7,
        6,
        8,
        13,
        11,
        9,
        7,
        15,
        7,
        12,
        15,
        9,
        11,
        7,
        13,
        12,
        11,
        13,
        6,
        7,
        14,
        9,
        13,
        15,
        14,
        8,
        13,
        6,
        5,
        12,
        7,
        5,
        11,
        12,
        14,
        15,
        14,
        15,
        9,
        8,
        9,
        14,
        5,
        6,
        8,
        6,
        5,
        12,
        9,
        15,
        5,
        11,
        6,
        8,
        13,
        12,
        5,
        12,
        13,
        14,
        11,
        8,
        5,
        6
      ];
      var sh = [
        8,
        9,
        9,
        11,
        13,
        15,
        15,
        5,
        7,
        7,
        8,
        11,
        14,
        14,
        12,
        6,
        9,
        13,
        15,
        7,
        12,
        8,
        9,
        11,
        7,
        7,
        12,
        7,
        6,
        15,
        13,
        11,
        9,
        7,
        15,
        11,
        8,
        6,
        6,
        14,
        12,
        13,
        5,
        14,
        13,
        13,
        7,
        5,
        15,
        5,
        8,
        11,
        14,
        14,
        6,
        14,
        6,
        9,
        12,
        9,
        12,
        5,
        15,
        8,
        8,
        5,
        12,
        9,
        12,
        5,
        14,
        6,
        8,
        13,
        6,
        5,
        15,
        13,
        11,
        11
      ];
    }
  });

  // node_modules/hash.js/lib/hash/hmac.js
  var require_hmac = __commonJS({
    "node_modules/hash.js/lib/hash/hmac.js"(exports, module) {
      "use strict";
      init_buffer_shim_entry();
      var utils = require_utils();
      var assert2 = require_minimalistic_assert();
      function Hmac(hash2, key2, enc) {
        if (!(this instanceof Hmac))
          return new Hmac(hash2, key2, enc);
        this.Hash = hash2;
        this.blockSize = hash2.blockSize / 8;
        this.outSize = hash2.outSize / 8;
        this.inner = null;
        this.outer = null;
        this._init(utils.toArray(key2, enc));
      }
      module.exports = Hmac;
      Hmac.prototype._init = function init2(key2) {
        if (key2.length > this.blockSize)
          key2 = new this.Hash().update(key2).digest();
        assert2(key2.length <= this.blockSize);
        for (var i = key2.length; i < this.blockSize; i++)
          key2.push(0);
        for (i = 0; i < key2.length; i++)
          key2[i] ^= 54;
        this.inner = new this.Hash().update(key2);
        for (i = 0; i < key2.length; i++)
          key2[i] ^= 106;
        this.outer = new this.Hash().update(key2);
      };
      Hmac.prototype.update = function update2(msg, enc) {
        this.inner.update(msg, enc);
        return this;
      };
      Hmac.prototype.digest = function digest(enc) {
        this.outer.update(this.inner.digest());
        return this.outer.digest(enc);
      };
    }
  });

  // node_modules/hash.js/lib/hash.js
  var require_hash = __commonJS({
    "node_modules/hash.js/lib/hash.js"(exports) {
      init_buffer_shim_entry();
      var hash2 = exports;
      hash2.utils = require_utils();
      hash2.common = require_common();
      hash2.sha = require_sha();
      hash2.ripemd = require_ripemd();
      hash2.hmac = require_hmac();
      hash2.sha1 = hash2.sha.sha1;
      hash2.sha256 = hash2.sha.sha256;
      hash2.sha224 = hash2.sha.sha224;
      hash2.sha384 = hash2.sha.sha384;
      hash2.sha512 = hash2.sha.sha512;
      hash2.ripemd160 = hash2.ripemd.ripemd160;
    }
  });

  // entry.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-transport-webhid/lib-es/TransportWebHID.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/hw-transport/lib-es/Transport.js
  init_buffer_shim_entry();
  var import_events = __toESM(require_events());

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/errors/lib-es/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/errors/lib-es/helpers.js
  init_buffer_shim_entry();
  var errorClasses = {};
  var deserializers = {};
  var addCustomErrorDeserializer = (name, deserializer) => {
    deserializers[name] = deserializer;
  };
  var createCustomErrorClass = (name) => {
    class CustomErrorClass extends Error {
      constructor(message, fields, options) {
        super(message || name, options);
        __publicField(this, "cause");
        Object.setPrototypeOf(this, CustomErrorClass.prototype);
        this.name = name;
        if (fields) {
          for (const k in fields) {
            this[k] = fields[k];
          }
        }
        if (options && isObject(options) && "cause" in options && !this.cause) {
          const cause = options.cause;
          this.cause = cause;
          if ("stack" in cause) {
            this.stack = this.stack + "\nCAUSE: " + cause.stack;
          }
        }
      }
    }
    errorClasses[name] = CustomErrorClass;
    return CustomErrorClass;
  };
  function isObject(value) {
    return typeof value === "object";
  }

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/errors/lib-es/index.js
  var AccountNameRequiredError = createCustomErrorClass("AccountNameRequired");
  var AccountNotSupported = createCustomErrorClass("AccountNotSupported");
  var AccountAwaitingSendPendingOperations = createCustomErrorClass("AccountAwaitingSendPendingOperations");
  var AmountRequired = createCustomErrorClass("AmountRequired");
  var BluetoothRequired = createCustomErrorClass("BluetoothRequired");
  var BtcUnmatchedApp = createCustomErrorClass("BtcUnmatchedApp");
  var CantOpenDevice = createCustomErrorClass("CantOpenDevice");
  var CashAddrNotSupported = createCustomErrorClass("CashAddrNotSupported");
  var ClaimRewardsFeesWarning = createCustomErrorClass("ClaimRewardsFeesWarning");
  var CurrencyNotSupported = createCustomErrorClass("CurrencyNotSupported");
  var DeviceAppVerifyNotSupported = createCustomErrorClass("DeviceAppVerifyNotSupported");
  var DeviceGenuineSocketEarlyClose = createCustomErrorClass("DeviceGenuineSocketEarlyClose");
  var DeviceNotGenuineError = createCustomErrorClass("DeviceNotGenuine");
  var DeviceOnDashboardExpected = createCustomErrorClass("DeviceOnDashboardExpected");
  var DeviceOnDashboardUnexpected = createCustomErrorClass("DeviceOnDashboardUnexpected");
  var DeviceInOSUExpected = createCustomErrorClass("DeviceInOSUExpected");
  var DeviceHalted = createCustomErrorClass("DeviceHalted");
  var DeviceNameInvalid = createCustomErrorClass("DeviceNameInvalid");
  var DeviceSocketFail = createCustomErrorClass("DeviceSocketFail");
  var DeviceSocketNoBulkStatus = createCustomErrorClass("DeviceSocketNoBulkStatus");
  var DeviceNeedsRestart = createCustomErrorClass("DeviceSocketNoBulkStatus");
  var UnresponsiveDeviceError = createCustomErrorClass("UnresponsiveDeviceError");
  var DisconnectedDevice = createCustomErrorClass("DisconnectedDevice");
  var DisconnectedDeviceDuringOperation = createCustomErrorClass("DisconnectedDeviceDuringOperation");
  var DeviceExtractOnboardingStateError = createCustomErrorClass("DeviceExtractOnboardingStateError");
  var DeviceOnboardingStatePollingError = createCustomErrorClass("DeviceOnboardingStatePollingError");
  var EnpointConfigError = createCustomErrorClass("EnpointConfig");
  var EthAppPleaseEnableContractData = createCustomErrorClass("EthAppPleaseEnableContractData");
  var SolAppPleaseEnableContractData = createCustomErrorClass("SolAppPleaseEnableContractData");
  var CeloAppPleaseEnableContractData = createCustomErrorClass("CeloAppPleaseEnableContractData");
  var FeeEstimationFailed = createCustomErrorClass("FeeEstimationFailed");
  var FirmwareNotRecognized = createCustomErrorClass("FirmwareNotRecognized");
  var HardResetFail = createCustomErrorClass("HardResetFail");
  var InvalidXRPTag = createCustomErrorClass("InvalidXRPTag");
  var InvalidAddress = createCustomErrorClass("InvalidAddress");
  var InvalidTransactionError = createCustomErrorClass("InvalidTransactionError");
  var InvalidNonce = createCustomErrorClass("InvalidNonce");
  var InvalidAddressBecauseDestinationIsAlsoSource = createCustomErrorClass("InvalidAddressBecauseDestinationIsAlsoSource");
  var LatestMCUInstalledError = createCustomErrorClass("LatestMCUInstalledError");
  var LatestFirmwareVersionRequired = createCustomErrorClass("LatestFirmwareVersionRequired");
  var UnsupportedFeatureError = createCustomErrorClass("UnsupportedFeatureError");
  var NanoSNotSupported = createCustomErrorClass("NanoSNotSupported");
  var UnknownMCU = createCustomErrorClass("UnknownMCU");
  var LedgerAPIError = createCustomErrorClass("LedgerAPIError");
  var LedgerAPIErrorWithMessage = createCustomErrorClass("LedgerAPIErrorWithMessage");
  var LedgerAPINotAvailable = createCustomErrorClass("LedgerAPINotAvailable");
  var ManagerAppAlreadyInstalledError = createCustomErrorClass("ManagerAppAlreadyInstalled");
  var ManagerAppRelyOnBTCError = createCustomErrorClass("ManagerAppRelyOnBTC");
  var ManagerAppDepInstallRequired = createCustomErrorClass("ManagerAppDepInstallRequired");
  var ManagerAppDepUninstallRequired = createCustomErrorClass("ManagerAppDepUninstallRequired");
  var ManagerDeviceLockedError = createCustomErrorClass("ManagerDeviceLocked");
  var ManagerFirmwareNotEnoughSpaceError = createCustomErrorClass("ManagerFirmwareNotEnoughSpace");
  var ManagerNotEnoughSpaceError = createCustomErrorClass("ManagerNotEnoughSpace");
  var ManagerUninstallBTCDep = createCustomErrorClass("ManagerUninstallBTCDep");
  var NetworkDown = createCustomErrorClass("NetworkDown");
  var NetworkError = createCustomErrorClass("NetworkError");
  var NoAddressesFound = createCustomErrorClass("NoAddressesFound");
  var NotEnoughBalance = createCustomErrorClass("NotEnoughBalance");
  var NotEnoughBalanceFees = createCustomErrorClass("NotEnoughBalanceFees");
  var NotEnoughBalanceSwap = createCustomErrorClass("NotEnoughBalanceSwap");
  var NotEnoughBalanceToDelegate = createCustomErrorClass("NotEnoughBalanceToDelegate");
  var UnstakeNotEnoughStakedBalanceLeft = createCustomErrorClass("UnstakeNotEnoughStakedBalanceLeft");
  var RestakeNotEnoughStakedBalanceLeft = createCustomErrorClass("RestakeNotEnoughStakedBalanceLeft");
  var NotEnoughToRestake = createCustomErrorClass("NotEnoughToRestake");
  var NotEnoughToUnstake = createCustomErrorClass("NotEnoughToUnstake");
  var NotEnoughBalanceInParentAccount = createCustomErrorClass("NotEnoughBalanceInParentAccount");
  var NotEnoughSpendableBalance = createCustomErrorClass("NotEnoughSpendableBalance");
  var NotEnoughBalanceBecauseDestinationNotCreated = createCustomErrorClass("NotEnoughBalanceBecauseDestinationNotCreated");
  var NotEnoughToStake = createCustomErrorClass("NotEnoughToStake");
  var NoAccessToCamera = createCustomErrorClass("NoAccessToCamera");
  var NotEnoughGas = createCustomErrorClass("NotEnoughGas");
  var NotEnoughGasSwap = createCustomErrorClass("NotEnoughGasSwap");
  var TronEmptyAccount = createCustomErrorClass("TronEmptyAccount");
  var MaybeKeepTronAccountAlive = createCustomErrorClass("MaybeKeepTronAccountAlive");
  var NotSupportedLegacyAddress = createCustomErrorClass("NotSupportedLegacyAddress");
  var GasLessThanEstimate = createCustomErrorClass("GasLessThanEstimate");
  var PriorityFeeTooLow = createCustomErrorClass("PriorityFeeTooLow");
  var PriorityFeeTooHigh = createCustomErrorClass("PriorityFeeTooHigh");
  var PriorityFeeHigherThanMaxFee = createCustomErrorClass("PriorityFeeHigherThanMaxFee");
  var MaxFeeTooLow = createCustomErrorClass("MaxFeeTooLow");
  var PasswordsDontMatchError = createCustomErrorClass("PasswordsDontMatch");
  var PasswordIncorrectError = createCustomErrorClass("PasswordIncorrect");
  var RecommendSubAccountsToEmpty = createCustomErrorClass("RecommendSubAccountsToEmpty");
  var RecommendUndelegation = createCustomErrorClass("RecommendUndelegation");
  var TimeoutTagged = createCustomErrorClass("TimeoutTagged");
  var UnexpectedBootloader = createCustomErrorClass("UnexpectedBootloader");
  var MCUNotGenuineToDashboard = createCustomErrorClass("MCUNotGenuineToDashboard");
  var RecipientRequired = createCustomErrorClass("RecipientRequired");
  var UnavailableTezosOriginatedAccountReceive = createCustomErrorClass("UnavailableTezosOriginatedAccountReceive");
  var UnavailableTezosOriginatedAccountSend = createCustomErrorClass("UnavailableTezosOriginatedAccountSend");
  var UpdateFetchFileFail = createCustomErrorClass("UpdateFetchFileFail");
  var UpdateIncorrectHash = createCustomErrorClass("UpdateIncorrectHash");
  var UpdateIncorrectSig = createCustomErrorClass("UpdateIncorrectSig");
  var UpdateYourApp = createCustomErrorClass("UpdateYourApp");
  var UserRefusedDeviceNameChange = createCustomErrorClass("UserRefusedDeviceNameChange");
  var UserRefusedAddress = createCustomErrorClass("UserRefusedAddress");
  var UserRefusedFirmwareUpdate = createCustomErrorClass("UserRefusedFirmwareUpdate");
  var UserRefusedAllowManager = createCustomErrorClass("UserRefusedAllowManager");
  var UserRefusedOnDevice = createCustomErrorClass("UserRefusedOnDevice");
  var PinNotSet = createCustomErrorClass("PinNotSet");
  var ExpertModeRequired = createCustomErrorClass("ExpertModeRequired");
  var TransportOpenUserCancelled = createCustomErrorClass("TransportOpenUserCancelled");
  var TransportInterfaceNotAvailable = createCustomErrorClass("TransportInterfaceNotAvailable");
  var TransportRaceCondition = createCustomErrorClass("TransportRaceCondition");
  var TransportWebUSBGestureRequired = createCustomErrorClass("TransportWebUSBGestureRequired");
  var TransactionHasBeenValidatedError = createCustomErrorClass("TransactionHasBeenValidatedError");
  var TransportExchangeTimeoutError = createCustomErrorClass("TransportExchangeTimeoutError");
  var DeviceShouldStayInApp = createCustomErrorClass("DeviceShouldStayInApp");
  var WebsocketConnectionError = createCustomErrorClass("WebsocketConnectionError");
  var WebsocketConnectionFailed = createCustomErrorClass("WebsocketConnectionFailed");
  var WrongDeviceForAccount = createCustomErrorClass("WrongDeviceForAccount");
  var WrongDeviceForAccountPayout = createCustomErrorClass("WrongDeviceForAccountPayout");
  var MissingSwapPayloadParamaters = createCustomErrorClass("MissingSwapPayloadParamaters");
  var WrongDeviceForAccountRefund = createCustomErrorClass("WrongDeviceForAccountRefund");
  var WrongAppForCurrency = createCustomErrorClass("WrongAppForCurrency");
  var ETHAddressNonEIP = createCustomErrorClass("ETHAddressNonEIP");
  var CantScanQRCode = createCustomErrorClass("CantScanQRCode");
  var FeeNotLoaded = createCustomErrorClass("FeeNotLoaded");
  var FeeNotLoadedSwap = createCustomErrorClass("FeeNotLoadedSwap");
  var FeeRequired = createCustomErrorClass("FeeRequired");
  var FeeTooHigh = createCustomErrorClass("FeeTooHigh");
  var ValAddressRequired = createCustomErrorClass("ValAddressRequired");
  var RedelegateDstValAddressRequired = createCustomErrorClass("RedelegateDstValAddressRequired");
  var PendingOperation = createCustomErrorClass("PendingOperation");
  var SyncError = createCustomErrorClass("SyncError");
  var PairingFailed = createCustomErrorClass("PairingFailed");
  var PeerRemovedPairing = createCustomErrorClass("PeerRemovedPairing");
  var GenuineCheckFailed = createCustomErrorClass("GenuineCheckFailed");
  var LedgerAPI4xx = createCustomErrorClass("LedgerAPI4xx");
  var LedgerAPI5xx = createCustomErrorClass("LedgerAPI5xx");
  var FirmwareOrAppUpdateRequired = createCustomErrorClass("FirmwareOrAppUpdateRequired");
  var ReplacementTransactionUnderpriced = createCustomErrorClass("ReplacementTransactionUnderpriced");
  var OpReturnDataSizeLimit = createCustomErrorClass("OpReturnSizeLimit");
  var DustLimit = createCustomErrorClass("DustLimit");
  var ConcordiumInsufficientFunds = createCustomErrorClass("ConcordiumInsufficientFunds");
  var ConcordiumMemoTooLong = createCustomErrorClass("ConcordiumMemoTooLong");
  var ConcordiumPairingExpiredError = createCustomErrorClass("ConcordiumPairingExpiredError");
  var ConcordiumSessionExpiredError = createCustomErrorClass("ConcordiumSessionExpiredError");
  var ConcordiumTrustedMetadataServiceError = createCustomErrorClass("ConcordiumTrustedMetadataServiceError");
  var ConcordiumAddressVerificationFailedError = createCustomErrorClass("ConcordiumAddressVerificationFailedError");
  var ConcordiumInvalidMaxFeeError = createCustomErrorClass("ConcordiumInvalidMaxFeeError");
  var LanguageNotFound = createCustomErrorClass("LanguageNotFound");
  var NoDBPathGiven = createCustomErrorClass("NoDBPathGiven");
  var DBWrongPassword = createCustomErrorClass("DBWrongPassword");
  var DBNotReset = createCustomErrorClass("DBNotReset");
  var SequenceNumberError = createCustomErrorClass("SequenceNumberError");
  var DisabledTransactionBroadcastError = createCustomErrorClass("DisabledTransactionBroadcastError");
  var InvalidParameterError = createCustomErrorClass("InvalidParameterError");
  var HwTransportErrorType;
  (function(HwTransportErrorType2) {
    HwTransportErrorType2["Unknown"] = "Unknown";
    HwTransportErrorType2["LocationServicesDisabled"] = "LocationServicesDisabled";
    HwTransportErrorType2["LocationServicesUnauthorized"] = "LocationServicesUnauthorized";
    HwTransportErrorType2["BluetoothScanStartFailed"] = "BluetoothScanStartFailed";
  })(HwTransportErrorType || (HwTransportErrorType = {}));
  var TransportError = class extends Error {
    constructor(message, id3) {
      const name = "TransportError";
      super(message || name);
      __publicField(this, "id");
      this.name = name;
      this.message = message;
      this.stack = new Error(message).stack;
      this.id = id3;
    }
  };
  addCustomErrorDeserializer("TransportError", (e) => new TransportError(e.message, e.id));
  var StatusCodes = {
    ACCESS_CONDITION_NOT_FULFILLED: 38916,
    ALGORITHM_NOT_SUPPORTED: 38020,
    CLA_NOT_SUPPORTED: 28160,
    CLA_NOT_SUPPORTED_BOOTLOADER: 28161,
    CODE_BLOCKED: 38976,
    CODE_NOT_INITIALIZED: 38914,
    COMMAND_INCOMPATIBLE_FILE_STRUCTURE: 27009,
    CONDITIONS_OF_USE_NOT_SATISFIED: 27013,
    CONTRADICTION_INVALIDATION: 38928,
    CONTRADICTION_SECRET_CODE_STATUS: 38920,
    DEVICE_IN_RECOVERY_MODE: 26159,
    CUSTOM_IMAGE_EMPTY: 26158,
    FILE_ALREADY_EXISTS: 27273,
    FILE_NOT_FOUND: 37892,
    GP_AUTH_FAILED: 25344,
    HALTED: 28586,
    INCONSISTENT_FILE: 37896,
    INCORRECT_DATA: 27264,
    INCORRECT_LENGTH: 26368,
    INCORRECT_P1_P2: 27392,
    INS_NOT_SUPPORTED: 27904,
    DEVICE_NOT_ONBOARDED: 27911,
    DEVICE_NOT_ONBOARDED_2: 26129,
    INVALID_KCV: 38021,
    INVALID_OFFSET: 37890,
    LICENSING: 28482,
    LOCKED_DEVICE: 21781,
    MAX_VALUE_REACHED: 38992,
    MEMORY_PROBLEM: 37440,
    MISSING_CRITICAL_PARAMETER: 26624,
    NO_EF_SELECTED: 37888,
    NOT_ENOUGH_MEMORY_SPACE: 27268,
    OK: 36864,
    PIN_REMAINING_ATTEMPTS: 25536,
    REFERENCED_DATA_NOT_FOUND: 27272,
    SECURITY_STATUS_NOT_SATISFIED: 27010,
    TECHNICAL_PROBLEM: 28416,
    UNKNOWN_APDU: 27906,
    USER_REFUSED_ON_DEVICE: 21761,
    NOT_ENOUGH_SPACE: 20738,
    APP_NOT_FOUND_OR_INVALID_CONTEXT: 20771,
    INVALID_APP_NAME_LENGTH: 26378,
    GEN_AES_KEY_FAILED: 21529,
    INTERNAL_CRYPTO_OPERATION_FAILED: 21530,
    INTERNAL_COMPUTE_AES_CMAC_FAILED: 21531,
    ENCRYPT_APP_STORAGE_FAILED: 21532,
    INVALID_BACKUP_STATE: 26178,
    PIN_NOT_SET: 21762,
    INVALID_BACKUP_LENGTH: 26419,
    INVALID_RESTORE_STATE: 26179,
    INVALID_CHUNK_LENGTH: 26420,
    INVALID_BACKUP_HEADER: 26698,
    SW_BAD_STATE: 45063
  };
  function getAltStatusMessage(code) {
    switch (code) {
      // improve text of most common errors
      case 26368:
        return "Incorrect length";
      case 26624:
        return "Missing critical parameter";
      case 27010:
        return "Security not satisfied (dongle locked or have invalid access rights)";
      case 27013:
        return "Condition of use not satisfied (denied by the user?)";
      case 27264:
        return "Invalid data received";
      case 27392:
        return "Invalid parameter received";
      case 21781:
        return "Locked device";
      case 45063:
        return "Unexpected state on the device";
    }
    if (28416 <= code && code <= 28671) {
      return "Internal error, please report";
    }
  }
  var TransportStatusError = class _TransportStatusError extends Error {
    /**
     * @param statusCode The error status code coming from a Transport implementation
     * @param options containing:
     *  - canBeMappedToChildError: enable the mapping of TransportStatusError to an error extending/inheriting from it
     *  . Ex: LockedDeviceError. Default to true.
     */
    constructor(statusCode, { canBeMappedToChildError = true } = {}) {
      const statusText = Object.keys(StatusCodes).find((k) => StatusCodes[k] === statusCode) || "UNKNOWN_ERROR";
      const smsg = getAltStatusMessage(statusCode) || statusText;
      const statusCodeStr = statusCode.toString(16);
      const message = `Ledger device: ${smsg} (0x${statusCodeStr})`;
      super(message);
      __publicField(this, "statusCode");
      __publicField(this, "statusText");
      this.name = "TransportStatusError";
      this.statusCode = statusCode;
      this.statusText = statusText;
      Object.setPrototypeOf(this, _TransportStatusError.prototype);
      if (canBeMappedToChildError && statusCode === StatusCodes.LOCKED_DEVICE) {
        return new LockedDeviceError(message);
      }
    }
  };
  var LockedDeviceError = class _LockedDeviceError extends TransportStatusError {
    constructor(message) {
      super(StatusCodes.LOCKED_DEVICE, { canBeMappedToChildError: false });
      if (message) {
        this.message = message;
      }
      this.name = "LockedDeviceError";
      Object.setPrototypeOf(this, _LockedDeviceError.prototype);
    }
  };
  addCustomErrorDeserializer("TransportStatusError", (e) => new TransportStatusError(e.statusCode));

  // node_modules/@ledgerhq/logs/lib-es/index.js
  init_buffer_shim_entry();
  var id = 0;
  var subscribers = [];
  var log = (type, message, data) => {
    const obj = {
      type,
      id: String(++id),
      date: /* @__PURE__ */ new Date()
    };
    if (message)
      obj.message = message;
    if (data)
      obj.data = data;
    dispatch(obj);
  };
  var trace = ({ type, message, data, context }) => {
    const obj = {
      type,
      id: String(++id),
      date: /* @__PURE__ */ new Date()
    };
    if (message)
      obj.message = message;
    if (data)
      obj.data = data;
    if (context)
      obj.context = context;
    dispatch(obj);
  };
  var LocalTracer = class _LocalTracer {
    constructor(type, context) {
      __publicField(this, "type");
      __publicField(this, "context");
      this.type = type;
      this.context = context;
    }
    trace(message, data) {
      trace({
        type: this.type,
        message,
        data,
        context: this.context
      });
    }
    getContext() {
      return this.context;
    }
    setContext(context) {
      this.context = context;
    }
    updateContext(contextToAdd) {
      this.context = { ...this.context, ...contextToAdd };
    }
    getType() {
      return this.type;
    }
    setType(type) {
      this.type = type;
    }
    /**
     * Create a new instance of the LocalTracer with an updated `type`
     *
     * It does not mutate the calling instance, but returns a new LocalTracer,
     * following a simple builder pattern.
     */
    withType(type) {
      return new _LocalTracer(type, this.context);
    }
    /**
     * Create a new instance of the LocalTracer with a new `context`
     *
     * It does not mutate the calling instance, but returns a new LocalTracer,
     * following a simple builder pattern.
     *
     * @param context A TraceContext, that can undefined to reset the context
     */
    withContext(context) {
      return new _LocalTracer(this.type, context);
    }
    /**
     * Create a new instance of the LocalTracer with an updated `context`,
     * on which an additional context is merged with the existing one.
     *
     * It does not mutate the calling instance, but returns a new LocalTracer,
     * following a simple builder pattern.
     */
    withUpdatedContext(contextToAdd) {
      return new _LocalTracer(this.type, { ...this.context, ...contextToAdd });
    }
  };
  var listen = (cb) => {
    subscribers.push(cb);
    return () => {
      const i = subscribers.indexOf(cb);
      if (i !== -1) {
        subscribers[i] = subscribers[subscribers.length - 1];
        subscribers.pop();
      }
    };
  };
  function dispatch(log2) {
    for (let i = 0; i < subscribers.length; i++) {
      try {
        subscribers[i](log2);
      } catch (e) {
        console.error(e);
      }
    }
  }
  if (typeof window !== "undefined") {
    window.__ledgerLogsListen = listen;
  }

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/hw-transport/lib-es/Transport.js
  var DEFAULT_LOG_TYPE = "transport";
  var Transport = class {
    constructor({ context, logType } = {}) {
      __publicField(this, "exchangeTimeout", 3e4);
      __publicField(this, "unresponsiveTimeout", 15e3);
      __publicField(this, "deviceModel", null);
      __publicField(this, "tracer");
      __publicField(this, "_events", new import_events.default());
      /**
       * Send data to the device using the higher level API.
       *
       * @param {number} cla - The instruction class for the command.
       * @param {number} ins - The instruction code for the command.
       * @param {number} p1 - The first parameter for the instruction.
       * @param {number} p2 - The second parameter for the instruction.
       * @param {Buffer} data - The data to be sent. Defaults to an empty buffer.
       * @param {Array<number>} statusList - A list of acceptable status codes for the response. Defaults to [StatusCodes.OK].
       * @param {Object} options - Contains optional options for the exchange function
       *  - abortTimeoutMs: stop the send after a given timeout. Another timeout exists
       *    to detect unresponsive device (see `unresponsiveTimeout`). This timeout aborts the exchange.
       * @returns {Promise<Buffer>} A promise that resolves with the response data from the device.
       */
      __publicField(this, "send", async (cla, ins, p1, p2, data = import_buffer.Buffer.alloc(0), statusList = [StatusCodes.OK], { abortTimeoutMs } = {}) => {
        const tracer = this.tracer.withUpdatedContext({ function: "send" });
        if (data.length >= 256) {
          tracer.trace("data.length exceeded 256 bytes limit", { dataLength: data.length });
          throw new TransportError("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");
        }
        const response = await this.exchange(
          // The size of the data is added in 1 byte just before `data`
          import_buffer.Buffer.concat([import_buffer.Buffer.from([cla, ins, p1, p2]), import_buffer.Buffer.from([data.length]), data]),
          { abortTimeoutMs }
        );
        const sw = response.readUInt16BE(response.length - 2);
        if (!statusList.some((s) => s === sw)) {
          throw new TransportStatusError(sw);
        }
        return response;
      });
      // Blocks other exchange to happen concurrently
      __publicField(this, "exchangeBusyPromise");
      __publicField(this, "_appAPIlock", null);
      this.tracer = new LocalTracer(logType ?? DEFAULT_LOG_TYPE, context);
    }
    /**
     * Send data to the device using a low level API.
     * It's recommended to use the "send" method for a higher level API.
     * @param {Buffer} apdu - The data to send.
     * @param {Object} options - Contains optional options for the exchange function
     *  - abortTimeoutMs: stop the exchange after a given timeout. Another timeout exists
     *    to detect unresponsive device (see `unresponsiveTimeout`). This timeout aborts the exchange.
     * @returns {Promise<Buffer>} A promise that resolves with the response data from the device.
     */
    exchange(_apdu, { abortTimeoutMs: _abortTimeoutMs } = {}) {
      throw new Error("exchange not implemented");
    }
    /**
     * Send apdus in batch to the device using a low level API.
     * The default implementation is to call exchange for each apdu.
     * @param {Array<Buffer>} apdus - array of apdus to send.
     * @param {Observer<Buffer>} observer - an observer that will receive the response of each apdu.
     * @returns {Subscription} A Subscription object on which you can call ".unsubscribe()" to stop sending apdus.
     */
    exchangeBulk(apdus, observer) {
      let unsubscribed = false;
      const unsubscribe = () => {
        unsubscribed = true;
      };
      const main = async () => {
        if (unsubscribed)
          return;
        for (const apdu of apdus) {
          const r = await this.exchange(apdu);
          if (unsubscribed)
            return;
          const status = r.readUInt16BE(r.length - 2);
          if (status !== StatusCodes.OK) {
            throw new TransportStatusError(status);
          }
          observer.next(r);
        }
      };
      main().then(() => !unsubscribed && observer.complete(), (e) => !unsubscribed && observer.error(e));
      return { unsubscribe };
    }
    /**
     * Set the "scramble key" for the next data exchanges with the device.
     * Each app can have a different scramble key and it is set internally during instantiation.
     * @param {string} key - The scramble key to set.
     * deprecated This method is no longer needed for modern transports and should be migrated away from.
     * no @ before deprecated as it breaks documentationjs on version 14.0.2
     * https://github.com/documentationjs/documentation/issues/1596
     */
    setScrambleKey(_key) {
    }
    /**
     * Close the connection with the device.
     *
     * Note: for certain transports (hw-transport-node-hid-singleton for ex), once the promise resolved,
     * the transport instance is actually still cached, and the device is disconnected only after a defined timeout.
     * But for the consumer of the Transport, this does not matter and it can consider the transport to be closed.
     *
     * @returns {Promise<void>} A promise that resolves when the transport is closed.
     */
    close() {
      return Promise.resolve();
    }
    /**
     * Listen for an event on the transport instance.
     * Transport implementations may have specific events. Common events include:
     * "disconnect" : triggered when the transport is disconnected.
     * @param {string} eventName - The name of the event to listen for.
     * @param {(...args: Array<any>) => any} cb - The callback function to be invoked when the event occurs.
     */
    on(eventName, cb) {
      this._events.on(eventName, cb);
    }
    /**
     * Stop listening to an event on an instance of transport.
     */
    off(eventName, cb) {
      this._events.removeListener(eventName, cb);
    }
    emit(event, ...args) {
      this._events.emit(event, ...args);
    }
    /**
     * Enable or not logs of the binary exchange
     */
    setDebugMode() {
      console.warn("setDebugMode is deprecated. use @ledgerhq/logs instead. No logs are emitted in this anymore.");
    }
    /**
     * Set a timeout (in milliseconds) for the exchange call. Only some transport might implement it. (e.g. U2F)
     */
    setExchangeTimeout(exchangeTimeout) {
      this.exchangeTimeout = exchangeTimeout;
    }
    /**
     * Define the delay before emitting "unresponsive" on an exchange that does not respond
     */
    setExchangeUnresponsiveTimeout(unresponsiveTimeout) {
      this.unresponsiveTimeout = unresponsiveTimeout;
    }
    /**
     * create() allows to open the first descriptor available or
     * throw if there is none or if timeout is reached.
     * This is a light helper, alternative to using listen() and open() (that you may need for any more advanced usecase)
     * @example
    TransportFoo.create().then(transport => ...)
     */
    static create(openTimeout = 3e3, listenTimeout) {
      return new Promise((resolve, reject) => {
        let found = false;
        const sub = this.listen({
          next: (e) => {
            found = true;
            if (sub)
              sub.unsubscribe();
            if (listenTimeoutId)
              clearTimeout(listenTimeoutId);
            this.open(e.descriptor, openTimeout).then(resolve, reject);
          },
          error: (e) => {
            if (listenTimeoutId)
              clearTimeout(listenTimeoutId);
            reject(e);
          },
          complete: () => {
            if (listenTimeoutId)
              clearTimeout(listenTimeoutId);
            if (!found) {
              reject(new TransportError(this.ErrorMessage_NoDeviceFound, "NoDeviceFound"));
            }
          }
        });
        const listenTimeoutId = listenTimeout ? setTimeout(() => {
          sub.unsubscribe();
          reject(new TransportError(this.ErrorMessage_ListenTimeout, "ListenTimeout"));
        }, listenTimeout) : null;
      });
    }
    /**
     * Wrapper to make an exchange "atomic" (blocking any other exchange)
     *
     * It also handles "unresponsiveness" by emitting "unresponsive" and "responsive" events.
     *
     * @param f The exchange job, using the transport to run
     * @returns a Promise resolving with the output of the given job
     */
    async exchangeAtomicImpl(f) {
      const tracer = this.tracer.withUpdatedContext({
        function: "exchangeAtomicImpl",
        unresponsiveTimeout: this.unresponsiveTimeout
      });
      if (this.exchangeBusyPromise) {
        tracer.trace("Atomic exchange is already busy");
        throw new TransportRaceCondition("An action was already pending on the Ledger device. Please deny or reconnect.");
      }
      let resolveBusy;
      const busyPromise = new Promise((r) => {
        resolveBusy = r;
      });
      this.exchangeBusyPromise = busyPromise;
      let unresponsiveReached = false;
      const timeout = setTimeout(() => {
        tracer.trace(`Timeout reached, emitting Transport event "unresponsive"`, {
          unresponsiveTimeout: this.unresponsiveTimeout
        });
        unresponsiveReached = true;
        this.emit("unresponsive");
      }, this.unresponsiveTimeout);
      try {
        const res = await f();
        if (unresponsiveReached) {
          tracer.trace("Device was unresponsive, emitting responsive");
          this.emit("responsive");
        }
        return res;
      } finally {
        tracer.trace("Finalize, clearing busy guard");
        clearTimeout(timeout);
        if (resolveBusy)
          resolveBusy();
        this.exchangeBusyPromise = null;
      }
    }
    decorateAppAPIMethods(self2, methods, scrambleKey) {
      for (const methodName of methods) {
        self2[methodName] = this.decorateAppAPIMethod(methodName, self2[methodName], self2, scrambleKey);
      }
    }
    decorateAppAPIMethod(methodName, f, ctx, scrambleKey) {
      return async (...args) => {
        const { _appAPIlock } = this;
        if (_appAPIlock) {
          return Promise.reject(new TransportError("Ledger Device is busy (lock " + _appAPIlock + ")", "TransportLocked"));
        }
        try {
          this._appAPIlock = methodName;
          this.setScrambleKey(scrambleKey);
          return await f.apply(ctx, args);
        } finally {
          this._appAPIlock = null;
        }
      };
    }
    /**
     * Sets the context used by the logging/tracing mechanism
     *
     * Useful when re-using (cached) the same Transport instance,
     * but with a new tracing context.
     *
     * @param context A TraceContext, that can undefined to reset the context
     */
    setTraceContext(context) {
      this.tracer = this.tracer.withContext(context);
    }
    /**
     * Updates the context used by the logging/tracing mechanism
     *
     * The update only overrides the key-value that are already defined in the current context.
     *
     * @param contextToAdd A TraceContext that will be added to the current context
     */
    updateTraceContext(contextToAdd) {
      this.tracer.updateContext(contextToAdd);
    }
    /**
     * Gets the tracing context of the transport instance
     */
    getTraceContext() {
      return this.tracer.getContext();
    }
  };
  /**
   * Check if the transport is supported on the current platform/browser.
   * @returns {Promise<boolean>} A promise that resolves with a boolean indicating support.
   */
  __publicField(Transport, "isSupported");
  /**
   * List all available descriptors for the transport.
   * For a better granularity, checkout `listen()`.
   *
   * @returns {Promise<Array<any>>} A promise that resolves with an array of descriptors.
   * @example
   * TransportFoo.list().then(descriptors => ...)
   */
  __publicField(Transport, "list");
  /**
   * Listen for device events for the transport. The method takes an observer of DescriptorEvent and returns a Subscription.
   * A DescriptorEvent is an object containing a "descriptor" and a "type" field. The "type" field can be "add" or "remove", and the "descriptor" field can be passed to the "open" method.
   * The "listen" method will first emit all currently connected devices and then will emit events as they occur, such as when a USB device is plugged in or a Bluetooth device becomes discoverable.
   * @param {Observer<DescriptorEvent<any>>} observer - An object with "next", "error", and "complete" functions, following the observer pattern.
   * @returns {Subscription} A Subscription object on which you can call ".unsubscribe()" to stop listening to descriptors.
   * @example
  const sub = TransportFoo.listen({
  next: e => {
    if (e.type==="add") {
      sub.unsubscribe();
      const transport = await TransportFoo.open(e.descriptor);
      ...
    }
  },
  error: error => {},
  complete: () => {}
  })
   */
  __publicField(Transport, "listen");
  /**
   * Attempt to create a Transport instance with a specific descriptor.
   * @param {any} descriptor - The descriptor to open the transport with.
   * @param {number} timeout - An optional timeout for the transport connection.
   * @param {TraceContext} context Optional tracing/log context
   * @returns {Promise<Transport>} A promise that resolves with a Transport instance.
   * @example
  TransportFoo.open(descriptor).then(transport => ...)
   */
  __publicField(Transport, "open");
  __publicField(Transport, "ErrorMessage_ListenTimeout", "No Ledger device found (timeout)");
  __publicField(Transport, "ErrorMessage_NoDeviceFound", "No Ledger device found");

  // node_modules/@ledgerhq/hw-transport-webhid/lib-es/hid-framing.js
  init_buffer_shim_entry();
  var Tag = 5;
  function asUInt16BE(value) {
    const b = import_buffer.Buffer.alloc(2);
    b.writeUInt16BE(value, 0);
    return b;
  }
  var initialAcc = {
    data: import_buffer.Buffer.alloc(0),
    dataLength: 0,
    sequence: 0
  };
  var createHIDframing = (channel, packetSize) => {
    return {
      /**
       * Frames/encodes an APDU message into HID USB packets/frames
       *
       * @param apdu The APDU message to send, in a Buffer containing [cla, ins, p1, p2, data length, data(if not empty)]
       * @returns an array of HID USB frames ready to be sent
       */
      makeBlocks(apdu) {
        let data = import_buffer.Buffer.concat([asUInt16BE(apdu.length), apdu]);
        const blockSize = packetSize - 5;
        const nbBlocks = Math.ceil(data.length / blockSize);
        data = import_buffer.Buffer.concat([data, import_buffer.Buffer.alloc(nbBlocks * blockSize - data.length + 1).fill(0)]);
        const blocks = [];
        for (let i = 0; i < nbBlocks; i++) {
          const head = import_buffer.Buffer.alloc(5);
          head.writeUInt16BE(channel, 0);
          head.writeUInt8(Tag, 2);
          head.writeUInt16BE(i, 3);
          const chunk = data.slice(i * blockSize, (i + 1) * blockSize);
          blocks.push(new Uint8Array(import_buffer.Buffer.concat([head, chunk])));
        }
        return blocks;
      },
      /**
       * Reduces HID USB packets/frames to one response.
       *
       * @param acc The value resulting from (accumulating) the previous call of reduceResponse.
       *   On first call initialized to `initialAcc`. The accumulator enables handling multi-frames messages.
       * @param chunk Current chunk to reduce into accumulator
       * @returns An accumulator value updated with the current chunk
       */
      reduceResponse(acc, chunk) {
        let { data, dataLength, sequence } = acc || initialAcc;
        if (chunk.readUInt16BE(0) !== channel) {
          throw new TransportError("Invalid channel", "InvalidChannel");
        }
        if (chunk.readUInt8(2) !== Tag) {
          throw new TransportError("Invalid tag", "InvalidTag");
        }
        if (chunk.readUInt16BE(3) !== sequence) {
          throw new TransportError("Invalid sequence", "InvalidSequence");
        }
        if (!acc) {
          dataLength = chunk.readUInt16BE(5);
        }
        sequence++;
        const chunkData = chunk.slice(acc ? 5 : 7);
        data = import_buffer.Buffer.concat([data, chunkData]);
        if (data.length > dataLength) {
          data = data.slice(0, dataLength);
        }
        return {
          data,
          dataLength,
          sequence
        };
      },
      /**
       * Returns the response message that has been reduced from the HID USB frames
       *
       * @param acc The accumulator
       * @returns A Buffer containing the cleaned response message, or null if no response message, or undefined if the
       *   accumulator is incorrect (message length is not valid)
       */
      getReducedResult(acc) {
        if (acc && acc.dataLength === acc.data.length) {
          return acc.data;
        }
      }
    };
  };
  var hid_framing_default = createHIDframing;

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/devices/lib-es/index.js
  init_buffer_shim_entry();
  var import_semver = __toESM(require_semver2());
  var DeviceModelId;
  (function(DeviceModelId2) {
    DeviceModelId2["blue"] = "blue";
    DeviceModelId2["nanoS"] = "nanoS";
    DeviceModelId2["nanoSP"] = "nanoSP";
    DeviceModelId2["nanoX"] = "nanoX";
    DeviceModelId2["stax"] = "stax";
    DeviceModelId2["europa"] = "europa";
    DeviceModelId2["apex"] = "apex";
  })(DeviceModelId || (DeviceModelId = {}));
  var devices = {
    [DeviceModelId.blue]: {
      id: DeviceModelId.blue,
      productName: "Ledger\xA0Blue",
      productIdMM: 0,
      legacyUsbProductId: 0,
      usbOnly: true,
      memorySize: 480 * 1024,
      masks: [822083584, 822149120],
      getBlockSize: (_firwareVersion) => 4 * 1024
    },
    [DeviceModelId.nanoS]: {
      id: DeviceModelId.nanoS,
      productName: "Ledger\xA0Nano\xA0S",
      productIdMM: 16,
      legacyUsbProductId: 1,
      usbOnly: true,
      memorySize: 320 * 1024,
      masks: [823132160],
      getBlockSize: (firmwareVersion) => import_semver.default.lt(import_semver.default.coerce(firmwareVersion) ?? "", "2.0.0") ? 4 * 1024 : 2 * 1024
    },
    [DeviceModelId.nanoX]: {
      id: DeviceModelId.nanoX,
      productName: "Ledger\xA0Nano\xA0X",
      productIdMM: 64,
      legacyUsbProductId: 4,
      usbOnly: false,
      memorySize: 2 * 1024 * 1024,
      masks: [855638016],
      getBlockSize: (_firwareVersion) => 4 * 1024,
      bluetoothSpec: [
        {
          serviceUuid: "13d63400-2c97-0004-0000-4c6564676572",
          notifyUuid: "13d63400-2c97-0004-0001-4c6564676572",
          writeUuid: "13d63400-2c97-0004-0002-4c6564676572",
          writeCmdUuid: "13d63400-2c97-0004-0003-4c6564676572"
        }
      ]
    },
    [DeviceModelId.nanoSP]: {
      id: DeviceModelId.nanoSP,
      productName: "Ledger Nano S Plus",
      productIdMM: 80,
      legacyUsbProductId: 5,
      usbOnly: true,
      memorySize: 1533 * 1024,
      masks: [856686592],
      getBlockSize: (_firmwareVersion) => 512
    },
    [DeviceModelId.apex]: {
      id: DeviceModelId.apex,
      productName: "Ledger\xA0Nano\xA0Gen5",
      productIdMM: 128,
      legacyUsbProductId: 8,
      usbOnly: false,
      memorySize: 1533 * 1024,
      masks: [859832320],
      getBlockSize: (_firmwareVersion) => 512,
      bluetoothSpec: [
        {
          serviceUuid: "13d63400-2c97-8004-0000-4c6564676572",
          notifyUuid: "13d63400-2c97-8004-0001-4c6564676572",
          writeUuid: "13d63400-2c97-8004-0002-4c6564676572",
          writeCmdUuid: "13d63400-2c97-8004-0003-4c6564676572"
        }
      ]
    },
    [DeviceModelId.stax]: {
      id: DeviceModelId.stax,
      productName: "Ledger\xA0Stax",
      productIdMM: 96,
      legacyUsbProductId: 6,
      usbOnly: false,
      memorySize: 1533 * 1024,
      masks: [857735168],
      getBlockSize: (_firmwareVersion) => 512,
      bluetoothSpec: [
        {
          serviceUuid: "13d63400-2c97-6004-0000-4c6564676572",
          notifyUuid: "13d63400-2c97-6004-0001-4c6564676572",
          writeUuid: "13d63400-2c97-6004-0002-4c6564676572",
          writeCmdUuid: "13d63400-2c97-6004-0003-4c6564676572"
        }
      ]
    },
    [DeviceModelId.europa]: {
      id: DeviceModelId.europa,
      productName: "Ledger\xA0Flex",
      productIdMM: 112,
      legacyUsbProductId: 7,
      usbOnly: false,
      memorySize: 1533 * 1024,
      masks: [858783744],
      getBlockSize: (_firmwareVersion) => 512,
      bluetoothSpec: [
        {
          serviceUuid: "13d63400-2c97-3004-0000-4c6564676572",
          notifyUuid: "13d63400-2c97-3004-0001-4c6564676572",
          writeUuid: "13d63400-2c97-3004-0002-4c6564676572",
          writeCmdUuid: "13d63400-2c97-3004-0003-4c6564676572"
        }
      ]
    }
  };
  var productMap = {
    Blue: DeviceModelId.blue,
    "Nano S": DeviceModelId.nanoS,
    "Nano S Plus": DeviceModelId.nanoSP,
    "Nano X": DeviceModelId.nanoX,
    Stax: DeviceModelId.stax,
    Europa: DeviceModelId.europa
  };
  var devicesList = Object.values(devices);
  var ledgerUSBVendorId = 11415;
  var identifyUSBProductId = (usbProductId) => {
    const legacy = devicesList.find((d) => d.legacyUsbProductId === usbProductId);
    if (legacy)
      return legacy;
    const mm = usbProductId >> 8;
    const deviceModel = devicesList.find((d) => d.productIdMM === mm);
    return deviceModel;
  };
  var bluetoothServices = [];
  var serviceUuidToInfos = {};
  for (const id3 in devices) {
    const deviceModel = devices[id3];
    const { bluetoothSpec } = deviceModel;
    if (bluetoothSpec) {
      for (let i = 0; i < bluetoothSpec.length; i++) {
        const spec = bluetoothSpec[i];
        bluetoothServices.push(spec.serviceUuid);
        serviceUuidToInfos[spec.serviceUuid] = serviceUuidToInfos[spec.serviceUuid.replace(/-/g, "")] = {
          deviceModel,
          ...spec
        };
      }
    }
  }

  // node_modules/@ledgerhq/hw-transport-webhid/lib-es/TransportWebHID.js
  var ledgerDevices = [
    {
      vendorId: ledgerUSBVendorId
    }
  ];
  var isSupported = () => Promise.resolve(!!(window.navigator && window.navigator.hid));
  var getHID = () => {
    const { hid } = navigator;
    if (!hid)
      throw new TransportError("navigator.hid is not supported", "HIDNotSupported");
    return hid;
  };
  async function requestLedgerDevices() {
    const device = await getHID().requestDevice({
      filters: ledgerDevices
    });
    if (Array.isArray(device))
      return device;
    return [device];
  }
  async function getLedgerDevices() {
    const devices2 = await getHID().getDevices();
    return devices2.filter((d) => d.vendorId === ledgerUSBVendorId);
  }
  async function getFirstLedgerDevice() {
    const existingDevices = await getLedgerDevices();
    if (existingDevices.length > 0)
      return existingDevices[0];
    const devices2 = await requestLedgerDevices();
    return devices2[0];
  }
  var _TransportWebHID = class _TransportWebHID extends Transport {
    constructor(device) {
      super();
      __publicField(this, "device");
      __publicField(this, "deviceModel");
      __publicField(this, "channel", Math.floor(Math.random() * 65535));
      __publicField(this, "packetSize", 64);
      __publicField(this, "inputs", []);
      __publicField(this, "inputCallback");
      __publicField(this, "read", () => {
        if (this.inputs.length) {
          const value = this.inputs.shift();
          if (value !== void 0)
            return Promise.resolve(value);
          throw new Error("Unreachable: non-empty inputs");
        }
        return new Promise((success) => {
          this.inputCallback = success;
        });
      });
      __publicField(this, "onInputReport", (e) => {
        const buffer = import_buffer.Buffer.from(e.data.buffer);
        if (this.inputCallback) {
          this.inputCallback(buffer);
          this.inputCallback = null;
        } else {
          this.inputs.push(buffer);
        }
      });
      __publicField(this, "_disconnectEmitted", false);
      __publicField(this, "_emitDisconnect", (e) => {
        if (this._disconnectEmitted)
          return;
        this._disconnectEmitted = true;
        this.emit("disconnect", e);
      });
      /**
       * Exchange with the device using APDU protocol.
       * @param apdu
       * @returns a promise of apdu response
       */
      __publicField(this, "exchange", async (apdu) => {
        const b = await this.exchangeAtomicImpl(async () => {
          const { channel, packetSize } = this;
          log("apdu", "=> " + apdu.toString("hex"));
          const framing = hid_framing_default(channel, packetSize);
          const blocks = framing.makeBlocks(apdu);
          for (let i = 0; i < blocks.length; i++) {
            await this.device.sendReport(0, blocks[i]);
          }
          let result;
          let acc;
          while (!(result = framing.getReducedResult(acc))) {
            try {
              const buffer = await this.read();
              acc = framing.reduceResponse(acc, buffer);
            } catch (e) {
              if (e instanceof TransportError && e.id === "InvalidChannel") {
                continue;
              }
              throw e;
            }
          }
          log("apdu", "<= " + result.toString("hex"));
          return result;
        }).catch((e) => {
          if (e && e.message && e.message.includes("write")) {
            this._emitDisconnect(e);
            throw new DisconnectedDeviceDuringOperation(e.message);
          }
          throw e;
        });
        return b;
      });
      this.device = device;
      this.deviceModel = typeof device.productId === "number" ? identifyUSBProductId(device.productId) : void 0;
      device.addEventListener("inputreport", this.onInputReport);
    }
    /**
     * Similar to create() except it will always display the device permission (even if some devices are already accepted).
     */
    static async request() {
      const [device] = await requestLedgerDevices();
      return _TransportWebHID.open(device);
    }
    /**
     * Similar to create() except it will never display the device permission (it returns a Promise<?Transport>, null if it fails to find a device).
     */
    static async openConnected() {
      const devices2 = await getLedgerDevices();
      if (devices2.length === 0)
        return null;
      return _TransportWebHID.open(devices2[0]);
    }
    /**
     * Create a Ledger transport with a HIDDevice
     */
    static async open(device) {
      await device.open();
      const transport = new _TransportWebHID(device);
      const onDisconnect = (e) => {
        if (device === e.device) {
          getHID().removeEventListener("disconnect", onDisconnect);
          transport._emitDisconnect(new DisconnectedDevice());
        }
      };
      getHID().addEventListener("disconnect", onDisconnect);
      return transport;
    }
    /**
     * Release the transport device
     */
    async close() {
      await this.exchangeBusyPromise;
      this.device.removeEventListener("inputreport", this.onInputReport);
      await this.device.close();
    }
    setScrambleKey() {
    }
  };
  /**
   * Check if WebUSB transport is supported.
   */
  __publicField(_TransportWebHID, "isSupported", isSupported);
  /**
   * List the WebUSB devices that was previously authorized by the user.
   */
  __publicField(_TransportWebHID, "list", getLedgerDevices);
  /**
   * Actively listen to WebUSB devices and emit ONE device
   * that was either accepted before, if not it will trigger the native permission UI.
   *
   * Important: it must be called in the context of a UI click!
   */
  __publicField(_TransportWebHID, "listen", (observer) => {
    let unsubscribed = false;
    getFirstLedgerDevice().then((device) => {
      if (!device) {
        observer.error(new TransportOpenUserCancelled("Access denied to use Ledger device"));
      } else if (!unsubscribed) {
        const deviceModel = typeof device.productId === "number" ? identifyUSBProductId(device.productId) : void 0;
        observer.next({
          type: "add",
          descriptor: device,
          deviceModel
        });
        observer.complete();
      }
    }, (error) => {
      observer.error(new TransportOpenUserCancelled(error.message));
    });
    function unsubscribe() {
      unsubscribed = true;
    }
    return {
      unsubscribe
    };
  });
  var TransportWebHID = _TransportWebHID;

  // node_modules/@ledgerhq/hw-app-eth/lib-es/Eth.js
  init_buffer_shim_entry();

  // node_modules/bignumber.js/bignumber.mjs
  init_buffer_shim_entry();
  var isNumeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  var mathceil = Math.ceil;
  var mathfloor = Math.floor;
  var bignumberError = "[BigNumber Error] ";
  var tooManyDigits = bignumberError + "Number primitive has more than 15 significant digits: ";
  var BASE = 1e14;
  var LOG_BASE = 14;
  var MAX_SAFE_INTEGER = 9007199254740991;
  var POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13];
  var SQRT_BASE = 1e7;
  var MAX = 1e9;
  function clone(configObject) {
    var div, convertBase, parseNumeric, P = BigNumber3.prototype = { constructor: BigNumber3, toString: null, valueOf: null }, ONE = new BigNumber3(1), DECIMAL_PLACES = 20, ROUNDING_MODE = 4, TO_EXP_NEG = -7, TO_EXP_POS = 21, MIN_EXP = -1e7, MAX_EXP = 1e7, CRYPTO = false, MODULO_MODE = 1, POW_PRECISION = 0, FORMAT = {
      prefix: "",
      groupSize: 3,
      secondaryGroupSize: 0,
      groupSeparator: ",",
      decimalSeparator: ".",
      fractionGroupSize: 0,
      fractionGroupSeparator: "\xA0",
      // non-breaking space
      suffix: ""
    }, ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz", alphabetHasNormalDecimalDigits = true;
    function BigNumber3(v, b) {
      var alphabet, c, caseChanged, e, i, isNum, len, str, x = this;
      if (!(x instanceof BigNumber3)) return new BigNumber3(v, b);
      if (b == null) {
        if (v && v._isBigNumber === true) {
          x.s = v.s;
          if (!v.c || v.e > MAX_EXP) {
            x.c = x.e = null;
          } else if (v.e < MIN_EXP) {
            x.c = [x.e = 0];
          } else {
            x.e = v.e;
            x.c = v.c.slice();
          }
          return;
        }
        if ((isNum = typeof v == "number") && v * 0 == 0) {
          x.s = 1 / v < 0 ? (v = -v, -1) : 1;
          if (v === ~~v) {
            for (e = 0, i = v; i >= 10; i /= 10, e++) ;
            if (e > MAX_EXP) {
              x.c = x.e = null;
            } else {
              x.e = e;
              x.c = [v];
            }
            return;
          }
          str = String(v);
        } else {
          if (!isNumeric.test(str = String(v))) return parseNumeric(x, str, isNum);
          x.s = str.charCodeAt(0) == 45 ? (str = str.slice(1), -1) : 1;
        }
        if ((e = str.indexOf(".")) > -1) str = str.replace(".", "");
        if ((i = str.search(/e/i)) > 0) {
          if (e < 0) e = i;
          e += +str.slice(i + 1);
          str = str.substring(0, i);
        } else if (e < 0) {
          e = str.length;
        }
      } else {
        intCheck(b, 2, ALPHABET.length, "Base");
        if (b == 10 && alphabetHasNormalDecimalDigits) {
          x = new BigNumber3(v);
          return round(x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE);
        }
        str = String(v);
        if (isNum = typeof v == "number") {
          if (v * 0 != 0) return parseNumeric(x, str, isNum, b);
          x.s = 1 / v < 0 ? (str = str.slice(1), -1) : 1;
          if (BigNumber3.DEBUG && str.replace(/^0\.0*|\./, "").length > 15) {
            throw Error(tooManyDigits + v);
          }
        } else {
          x.s = str.charCodeAt(0) === 45 ? (str = str.slice(1), -1) : 1;
        }
        alphabet = ALPHABET.slice(0, b);
        e = i = 0;
        for (len = str.length; i < len; i++) {
          if (alphabet.indexOf(c = str.charAt(i)) < 0) {
            if (c == ".") {
              if (i > e) {
                e = len;
                continue;
              }
            } else if (!caseChanged) {
              if (str == str.toUpperCase() && (str = str.toLowerCase()) || str == str.toLowerCase() && (str = str.toUpperCase())) {
                caseChanged = true;
                i = -1;
                e = 0;
                continue;
              }
            }
            return parseNumeric(x, String(v), isNum, b);
          }
        }
        isNum = false;
        str = convertBase(str, b, 10, x.s);
        if ((e = str.indexOf(".")) > -1) str = str.replace(".", "");
        else e = str.length;
      }
      for (i = 0; str.charCodeAt(i) === 48; i++) ;
      for (len = str.length; str.charCodeAt(--len) === 48; ) ;
      if (str = str.slice(i, ++len)) {
        len -= i;
        if (isNum && BigNumber3.DEBUG && len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) {
          throw Error(tooManyDigits + x.s * v);
        }
        if ((e = e - i - 1) > MAX_EXP) {
          x.c = x.e = null;
        } else if (e < MIN_EXP) {
          x.c = [x.e = 0];
        } else {
          x.e = e;
          x.c = [];
          i = (e + 1) % LOG_BASE;
          if (e < 0) i += LOG_BASE;
          if (i < len) {
            if (i) x.c.push(+str.slice(0, i));
            for (len -= LOG_BASE; i < len; ) {
              x.c.push(+str.slice(i, i += LOG_BASE));
            }
            i = LOG_BASE - (str = str.slice(i)).length;
          } else {
            i -= len;
          }
          for (; i--; str += "0") ;
          x.c.push(+str);
        }
      } else {
        x.c = [x.e = 0];
      }
    }
    BigNumber3.clone = clone;
    BigNumber3.ROUND_UP = 0;
    BigNumber3.ROUND_DOWN = 1;
    BigNumber3.ROUND_CEIL = 2;
    BigNumber3.ROUND_FLOOR = 3;
    BigNumber3.ROUND_HALF_UP = 4;
    BigNumber3.ROUND_HALF_DOWN = 5;
    BigNumber3.ROUND_HALF_EVEN = 6;
    BigNumber3.ROUND_HALF_CEIL = 7;
    BigNumber3.ROUND_HALF_FLOOR = 8;
    BigNumber3.EUCLID = 9;
    BigNumber3.config = BigNumber3.set = function(obj) {
      var p, v;
      if (obj != null) {
        if (typeof obj == "object") {
          if (obj.hasOwnProperty(p = "DECIMAL_PLACES")) {
            v = obj[p];
            intCheck(v, 0, MAX, p);
            DECIMAL_PLACES = v;
          }
          if (obj.hasOwnProperty(p = "ROUNDING_MODE")) {
            v = obj[p];
            intCheck(v, 0, 8, p);
            ROUNDING_MODE = v;
          }
          if (obj.hasOwnProperty(p = "EXPONENTIAL_AT")) {
            v = obj[p];
            if (v && v.pop) {
              intCheck(v[0], -MAX, 0, p);
              intCheck(v[1], 0, MAX, p);
              TO_EXP_NEG = v[0];
              TO_EXP_POS = v[1];
            } else {
              intCheck(v, -MAX, MAX, p);
              TO_EXP_NEG = -(TO_EXP_POS = v < 0 ? -v : v);
            }
          }
          if (obj.hasOwnProperty(p = "RANGE")) {
            v = obj[p];
            if (v && v.pop) {
              intCheck(v[0], -MAX, -1, p);
              intCheck(v[1], 1, MAX, p);
              MIN_EXP = v[0];
              MAX_EXP = v[1];
            } else {
              intCheck(v, -MAX, MAX, p);
              if (v) {
                MIN_EXP = -(MAX_EXP = v < 0 ? -v : v);
              } else {
                throw Error(bignumberError + p + " cannot be zero: " + v);
              }
            }
          }
          if (obj.hasOwnProperty(p = "CRYPTO")) {
            v = obj[p];
            if (v === !!v) {
              if (v) {
                if (typeof crypto != "undefined" && crypto && (crypto.getRandomValues || crypto.randomBytes)) {
                  CRYPTO = v;
                } else {
                  CRYPTO = !v;
                  throw Error(bignumberError + "crypto unavailable");
                }
              } else {
                CRYPTO = v;
              }
            } else {
              throw Error(bignumberError + p + " not true or false: " + v);
            }
          }
          if (obj.hasOwnProperty(p = "MODULO_MODE")) {
            v = obj[p];
            intCheck(v, 0, 9, p);
            MODULO_MODE = v;
          }
          if (obj.hasOwnProperty(p = "POW_PRECISION")) {
            v = obj[p];
            intCheck(v, 0, MAX, p);
            POW_PRECISION = v;
          }
          if (obj.hasOwnProperty(p = "FORMAT")) {
            v = obj[p];
            if (typeof v == "object") FORMAT = v;
            else throw Error(bignumberError + p + " not an object: " + v);
          }
          if (obj.hasOwnProperty(p = "ALPHABET")) {
            v = obj[p];
            if (typeof v == "string" && !/^.?$|[+\-.\s]|(.).*\1/.test(v)) {
              alphabetHasNormalDecimalDigits = v.slice(0, 10) == "0123456789";
              ALPHABET = v;
            } else {
              throw Error(bignumberError + p + " invalid: " + v);
            }
          }
        } else {
          throw Error(bignumberError + "Object expected: " + obj);
        }
      }
      return {
        DECIMAL_PLACES,
        ROUNDING_MODE,
        EXPONENTIAL_AT: [TO_EXP_NEG, TO_EXP_POS],
        RANGE: [MIN_EXP, MAX_EXP],
        CRYPTO,
        MODULO_MODE,
        POW_PRECISION,
        FORMAT,
        ALPHABET
      };
    };
    BigNumber3.isBigNumber = function(v) {
      if (!v || v._isBigNumber !== true) return false;
      if (!BigNumber3.DEBUG) return true;
      var i, n, c = v.c, e = v.e, s = v.s;
      out: if ({}.toString.call(c) == "[object Array]") {
        if ((s === 1 || s === -1) && e >= -MAX && e <= MAX && e === mathfloor(e)) {
          if (c[0] === 0) {
            if (e === 0 && c.length === 1) return true;
            break out;
          }
          i = (e + 1) % LOG_BASE;
          if (i < 1) i += LOG_BASE;
          if (String(c[0]).length == i) {
            for (i = 0; i < c.length; i++) {
              n = c[i];
              if (n < 0 || n >= BASE || n !== mathfloor(n)) break out;
            }
            if (n !== 0) return true;
          }
        }
      } else if (c === null && e === null && (s === null || s === 1 || s === -1)) {
        return true;
      }
      throw Error(bignumberError + "Invalid BigNumber: " + v);
    };
    BigNumber3.maximum = BigNumber3.max = function() {
      return maxOrMin(arguments, -1);
    };
    BigNumber3.minimum = BigNumber3.min = function() {
      return maxOrMin(arguments, 1);
    };
    BigNumber3.random = (function() {
      var pow2_53 = 9007199254740992;
      var random53bitInt = Math.random() * pow2_53 & 2097151 ? function() {
        return mathfloor(Math.random() * pow2_53);
      } : function() {
        return (Math.random() * 1073741824 | 0) * 8388608 + (Math.random() * 8388608 | 0);
      };
      return function(dp) {
        var a, b, e, k, v, i = 0, c = [], rand2 = new BigNumber3(ONE);
        if (dp == null) dp = DECIMAL_PLACES;
        else intCheck(dp, 0, MAX);
        k = mathceil(dp / LOG_BASE);
        if (CRYPTO) {
          if (crypto.getRandomValues) {
            a = crypto.getRandomValues(new Uint32Array(k *= 2));
            for (; i < k; ) {
              v = a[i] * 131072 + (a[i + 1] >>> 11);
              if (v >= 9e15) {
                b = crypto.getRandomValues(new Uint32Array(2));
                a[i] = b[0];
                a[i + 1] = b[1];
              } else {
                c.push(v % 1e14);
                i += 2;
              }
            }
            i = k / 2;
          } else if (crypto.randomBytes) {
            a = crypto.randomBytes(k *= 7);
            for (; i < k; ) {
              v = (a[i] & 31) * 281474976710656 + a[i + 1] * 1099511627776 + a[i + 2] * 4294967296 + a[i + 3] * 16777216 + (a[i + 4] << 16) + (a[i + 5] << 8) + a[i + 6];
              if (v >= 9e15) {
                crypto.randomBytes(7).copy(a, i);
              } else {
                c.push(v % 1e14);
                i += 7;
              }
            }
            i = k / 7;
          } else {
            CRYPTO = false;
            throw Error(bignumberError + "crypto unavailable");
          }
        }
        if (!CRYPTO) {
          for (; i < k; ) {
            v = random53bitInt();
            if (v < 9e15) c[i++] = v % 1e14;
          }
        }
        k = c[--i];
        dp %= LOG_BASE;
        if (k && dp) {
          v = POWS_TEN[LOG_BASE - dp];
          c[i] = mathfloor(k / v) * v;
        }
        for (; c[i] === 0; c.pop(), i--) ;
        if (i < 0) {
          c = [e = 0];
        } else {
          for (e = -1; c[0] === 0; c.splice(0, 1), e -= LOG_BASE) ;
          for (i = 1, v = c[0]; v >= 10; v /= 10, i++) ;
          if (i < LOG_BASE) e -= LOG_BASE - i;
        }
        rand2.e = e;
        rand2.c = c;
        return rand2;
      };
    })();
    BigNumber3.sum = function() {
      var i = 1, args = arguments, sum = new BigNumber3(args[0]);
      for (; i < args.length; ) sum = sum.plus(args[i++]);
      return sum;
    };
    convertBase = /* @__PURE__ */ (function() {
      var decimal = "0123456789";
      function toBaseOut(str, baseIn, baseOut, alphabet) {
        var j, arr = [0], arrL, i = 0, len = str.length;
        for (; i < len; ) {
          for (arrL = arr.length; arrL--; arr[arrL] *= baseIn) ;
          arr[0] += alphabet.indexOf(str.charAt(i++));
          for (j = 0; j < arr.length; j++) {
            if (arr[j] > baseOut - 1) {
              if (arr[j + 1] == null) arr[j + 1] = 0;
              arr[j + 1] += arr[j] / baseOut | 0;
              arr[j] %= baseOut;
            }
          }
        }
        return arr.reverse();
      }
      return function(str, baseIn, baseOut, sign3, callerIsToString) {
        var alphabet, d, e, k, r, x, xc, y, i = str.indexOf("."), dp = DECIMAL_PLACES, rm = ROUNDING_MODE;
        if (i >= 0) {
          k = POW_PRECISION;
          POW_PRECISION = 0;
          str = str.replace(".", "");
          y = new BigNumber3(baseIn);
          x = y.pow(str.length - i);
          POW_PRECISION = k;
          y.c = toBaseOut(
            toFixedPoint(coeffToString(x.c), x.e, "0"),
            10,
            baseOut,
            decimal
          );
          y.e = y.c.length;
        }
        xc = toBaseOut(str, baseIn, baseOut, callerIsToString ? (alphabet = ALPHABET, decimal) : (alphabet = decimal, ALPHABET));
        e = k = xc.length;
        for (; xc[--k] == 0; xc.pop()) ;
        if (!xc[0]) return alphabet.charAt(0);
        if (i < 0) {
          --e;
        } else {
          x.c = xc;
          x.e = e;
          x.s = sign3;
          x = div(x, y, dp, rm, baseOut);
          xc = x.c;
          r = x.r;
          e = x.e;
        }
        d = e + dp + 1;
        i = xc[d];
        k = baseOut / 2;
        r = r || d < 0 || xc[d + 1] != null;
        r = rm < 4 ? (i != null || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : i > k || i == k && (rm == 4 || r || rm == 6 && xc[d - 1] & 1 || rm == (x.s < 0 ? 8 : 7));
        if (d < 1 || !xc[0]) {
          str = r ? toFixedPoint(alphabet.charAt(1), -dp, alphabet.charAt(0)) : alphabet.charAt(0);
        } else {
          xc.length = d;
          if (r) {
            for (--baseOut; ++xc[--d] > baseOut; ) {
              xc[d] = 0;
              if (!d) {
                ++e;
                xc = [1].concat(xc);
              }
            }
          }
          for (k = xc.length; !xc[--k]; ) ;
          for (i = 0, str = ""; i <= k; str += alphabet.charAt(xc[i++])) ;
          str = toFixedPoint(str, e, alphabet.charAt(0));
        }
        return str;
      };
    })();
    div = /* @__PURE__ */ (function() {
      function multiply(x, k, base2) {
        var m, temp, xlo, xhi, carry = 0, i = x.length, klo = k % SQRT_BASE, khi = k / SQRT_BASE | 0;
        for (x = x.slice(); i--; ) {
          xlo = x[i] % SQRT_BASE;
          xhi = x[i] / SQRT_BASE | 0;
          m = khi * xlo + xhi * klo;
          temp = klo * xlo + m % SQRT_BASE * SQRT_BASE + carry;
          carry = (temp / base2 | 0) + (m / SQRT_BASE | 0) + khi * xhi;
          x[i] = temp % base2;
        }
        if (carry) x = [carry].concat(x);
        return x;
      }
      function compare2(a, b, aL, bL) {
        var i, cmp;
        if (aL != bL) {
          cmp = aL > bL ? 1 : -1;
        } else {
          for (i = cmp = 0; i < aL; i++) {
            if (a[i] != b[i]) {
              cmp = a[i] > b[i] ? 1 : -1;
              break;
            }
          }
        }
        return cmp;
      }
      function subtract(a, b, aL, base2) {
        var i = 0;
        for (; aL--; ) {
          a[aL] -= i;
          i = a[aL] < b[aL] ? 1 : 0;
          a[aL] = i * base2 + a[aL] - b[aL];
        }
        for (; !a[0] && a.length > 1; a.splice(0, 1)) ;
      }
      return function(x, y, dp, rm, base2) {
        var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0, yL, yz, s = x.s == y.s ? 1 : -1, xc = x.c, yc = y.c;
        if (!xc || !xc[0] || !yc || !yc[0]) {
          return new BigNumber3(
            // Return NaN if either NaN, or both Infinity or 0.
            !x.s || !y.s || (xc ? yc && xc[0] == yc[0] : !yc) ? NaN : (
              // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
              xc && xc[0] == 0 || !yc ? s * 0 : s / 0
            )
          );
        }
        q = new BigNumber3(s);
        qc = q.c = [];
        e = x.e - y.e;
        s = dp + e + 1;
        if (!base2) {
          base2 = BASE;
          e = bitFloor(x.e / LOG_BASE) - bitFloor(y.e / LOG_BASE);
          s = s / LOG_BASE | 0;
        }
        for (i = 0; yc[i] == (xc[i] || 0); i++) ;
        if (yc[i] > (xc[i] || 0)) e--;
        if (s < 0) {
          qc.push(1);
          more = true;
        } else {
          xL = xc.length;
          yL = yc.length;
          i = 0;
          s += 2;
          n = mathfloor(base2 / (yc[0] + 1));
          if (n > 1) {
            yc = multiply(yc, n, base2);
            xc = multiply(xc, n, base2);
            yL = yc.length;
            xL = xc.length;
          }
          xi = yL;
          rem = xc.slice(0, yL);
          remL = rem.length;
          for (; remL < yL; rem[remL++] = 0) ;
          yz = yc.slice();
          yz = [0].concat(yz);
          yc0 = yc[0];
          if (yc[1] >= base2 / 2) yc0++;
          do {
            n = 0;
            cmp = compare2(yc, rem, yL, remL);
            if (cmp < 0) {
              rem0 = rem[0];
              if (yL != remL) rem0 = rem0 * base2 + (rem[1] || 0);
              n = mathfloor(rem0 / yc0);
              if (n > 1) {
                if (n >= base2) n = base2 - 1;
                prod = multiply(yc, n, base2);
                prodL = prod.length;
                remL = rem.length;
                while (compare2(prod, rem, prodL, remL) == 1) {
                  n--;
                  subtract(prod, yL < prodL ? yz : yc, prodL, base2);
                  prodL = prod.length;
                  cmp = 1;
                }
              } else {
                if (n == 0) {
                  cmp = n = 1;
                }
                prod = yc.slice();
                prodL = prod.length;
              }
              if (prodL < remL) prod = [0].concat(prod);
              subtract(rem, prod, remL, base2);
              remL = rem.length;
              if (cmp == -1) {
                while (compare2(yc, rem, yL, remL) < 1) {
                  n++;
                  subtract(rem, yL < remL ? yz : yc, remL, base2);
                  remL = rem.length;
                }
              }
            } else if (cmp === 0) {
              n++;
              rem = [0];
            }
            qc[i++] = n;
            if (rem[0]) {
              rem[remL++] = xc[xi] || 0;
            } else {
              rem = [xc[xi]];
              remL = 1;
            }
          } while ((xi++ < xL || rem[0] != null) && s--);
          more = rem[0] != null;
          if (!qc[0]) qc.splice(0, 1);
        }
        if (base2 == BASE) {
          for (i = 1, s = qc[0]; s >= 10; s /= 10, i++) ;
          round(q, dp + (q.e = i + e * LOG_BASE - 1) + 1, rm, more);
        } else {
          q.e = e;
          q.r = +more;
        }
        return q;
      };
    })();
    function format(n, i, rm, id3) {
      var c0, e, ne, len, str;
      if (rm == null) rm = ROUNDING_MODE;
      else intCheck(rm, 0, 8);
      if (!n.c) return n.toString();
      c0 = n.c[0];
      ne = n.e;
      if (i == null) {
        str = coeffToString(n.c);
        str = id3 == 1 || id3 == 2 && (ne <= TO_EXP_NEG || ne >= TO_EXP_POS) ? toExponential(str, ne) : toFixedPoint(str, ne, "0");
      } else {
        n = round(new BigNumber3(n), i, rm);
        e = n.e;
        str = coeffToString(n.c);
        len = str.length;
        if (id3 == 1 || id3 == 2 && (i <= e || e <= TO_EXP_NEG)) {
          for (; len < i; str += "0", len++) ;
          str = toExponential(str, e);
        } else {
          i -= ne + (id3 === 2 && e > ne);
          str = toFixedPoint(str, e, "0");
          if (e + 1 > len) {
            if (--i > 0) for (str += "."; i--; str += "0") ;
          } else {
            i += e - len;
            if (i > 0) {
              if (e + 1 == len) str += ".";
              for (; i--; str += "0") ;
            }
          }
        }
      }
      return n.s < 0 && c0 ? "-" + str : str;
    }
    function maxOrMin(args, n) {
      var k, y, i = 1, x = new BigNumber3(args[0]);
      for (; i < args.length; i++) {
        y = new BigNumber3(args[i]);
        if (!y.s || (k = compare(x, y)) === n || k === 0 && x.s === n) {
          x = y;
        }
      }
      return x;
    }
    function normalise(n, c, e) {
      var i = 1, j = c.length;
      for (; !c[--j]; c.pop()) ;
      for (j = c[0]; j >= 10; j /= 10, i++) ;
      if ((e = i + e * LOG_BASE - 1) > MAX_EXP) {
        n.c = n.e = null;
      } else if (e < MIN_EXP) {
        n.c = [n.e = 0];
      } else {
        n.e = e;
        n.c = c;
      }
      return n;
    }
    parseNumeric = /* @__PURE__ */ (function() {
      var basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i, dotAfter = /^([^.]+)\.$/, dotBefore = /^\.([^.]+)$/, isInfinityOrNaN = /^-?(Infinity|NaN)$/, whitespaceOrPlus = /^\s*\+(?=[\w.])|^\s+|\s+$/g;
      return function(x, str, isNum, b) {
        var base2, s = isNum ? str : str.replace(whitespaceOrPlus, "");
        if (isInfinityOrNaN.test(s)) {
          x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
        } else {
          if (!isNum) {
            s = s.replace(basePrefix, function(m, p1, p2) {
              base2 = (p2 = p2.toLowerCase()) == "x" ? 16 : p2 == "b" ? 2 : 8;
              return !b || b == base2 ? p1 : m;
            });
            if (b) {
              base2 = b;
              s = s.replace(dotAfter, "$1").replace(dotBefore, "0.$1");
            }
            if (str != s) return new BigNumber3(s, base2);
          }
          if (BigNumber3.DEBUG) {
            throw Error(bignumberError + "Not a" + (b ? " base " + b : "") + " number: " + str);
          }
          x.s = null;
        }
        x.c = x.e = null;
      };
    })();
    function round(x, sd, rm, r) {
      var d, i, j, k, n, ni, rd, xc = x.c, pows10 = POWS_TEN;
      if (xc) {
        out: {
          for (d = 1, k = xc[0]; k >= 10; k /= 10, d++) ;
          i = sd - d;
          if (i < 0) {
            i += LOG_BASE;
            j = sd;
            n = xc[ni = 0];
            rd = mathfloor(n / pows10[d - j - 1] % 10);
          } else {
            ni = mathceil((i + 1) / LOG_BASE);
            if (ni >= xc.length) {
              if (r) {
                for (; xc.length <= ni; xc.push(0)) ;
                n = rd = 0;
                d = 1;
                i %= LOG_BASE;
                j = i - LOG_BASE + 1;
              } else {
                break out;
              }
            } else {
              n = k = xc[ni];
              for (d = 1; k >= 10; k /= 10, d++) ;
              i %= LOG_BASE;
              j = i - LOG_BASE + d;
              rd = j < 0 ? 0 : mathfloor(n / pows10[d - j - 1] % 10);
            }
          }
          r = r || sd < 0 || // Are there any non-zero digits after the rounding digit?
          // The expression  n % pows10[d - j - 1]  returns all digits of n to the right
          // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
          xc[ni + 1] != null || (j < 0 ? n : n % pows10[d - j - 1]);
          r = rm < 4 ? (rd || r) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : rd > 5 || rd == 5 && (rm == 4 || r || rm == 6 && // Check whether the digit to the left of the rounding digit is odd.
          (i > 0 ? j > 0 ? n / pows10[d - j] : 0 : xc[ni - 1]) % 10 & 1 || rm == (x.s < 0 ? 8 : 7));
          if (sd < 1 || !xc[0]) {
            xc.length = 0;
            if (r) {
              sd -= x.e + 1;
              xc[0] = pows10[(LOG_BASE - sd % LOG_BASE) % LOG_BASE];
              x.e = -sd || 0;
            } else {
              xc[0] = x.e = 0;
            }
            return x;
          }
          if (i == 0) {
            xc.length = ni;
            k = 1;
            ni--;
          } else {
            xc.length = ni + 1;
            k = pows10[LOG_BASE - i];
            xc[ni] = j > 0 ? mathfloor(n / pows10[d - j] % pows10[j]) * k : 0;
          }
          if (r) {
            for (; ; ) {
              if (ni == 0) {
                for (i = 1, j = xc[0]; j >= 10; j /= 10, i++) ;
                j = xc[0] += k;
                for (k = 1; j >= 10; j /= 10, k++) ;
                if (i != k) {
                  x.e++;
                  if (xc[0] == BASE) xc[0] = 1;
                }
                break;
              } else {
                xc[ni] += k;
                if (xc[ni] != BASE) break;
                xc[ni--] = 0;
                k = 1;
              }
            }
          }
          for (i = xc.length; xc[--i] === 0; xc.pop()) ;
        }
        if (x.e > MAX_EXP) {
          x.c = x.e = null;
        } else if (x.e < MIN_EXP) {
          x.c = [x.e = 0];
        }
      }
      return x;
    }
    function valueOf(n) {
      var str, e = n.e;
      if (e === null) return n.toString();
      str = coeffToString(n.c);
      str = e <= TO_EXP_NEG || e >= TO_EXP_POS ? toExponential(str, e) : toFixedPoint(str, e, "0");
      return n.s < 0 ? "-" + str : str;
    }
    P.absoluteValue = P.abs = function() {
      var x = new BigNumber3(this);
      if (x.s < 0) x.s = 1;
      return x;
    };
    P.comparedTo = function(y, b) {
      return compare(this, new BigNumber3(y, b));
    };
    P.decimalPlaces = P.dp = function(dp, rm) {
      var c, n, v, x = this;
      if (dp != null) {
        intCheck(dp, 0, MAX);
        if (rm == null) rm = ROUNDING_MODE;
        else intCheck(rm, 0, 8);
        return round(new BigNumber3(x), dp + x.e + 1, rm);
      }
      if (!(c = x.c)) return null;
      n = ((v = c.length - 1) - bitFloor(this.e / LOG_BASE)) * LOG_BASE;
      if (v = c[v]) for (; v % 10 == 0; v /= 10, n--) ;
      if (n < 0) n = 0;
      return n;
    };
    P.dividedBy = P.div = function(y, b) {
      return div(this, new BigNumber3(y, b), DECIMAL_PLACES, ROUNDING_MODE);
    };
    P.dividedToIntegerBy = P.idiv = function(y, b) {
      return div(this, new BigNumber3(y, b), 0, 1);
    };
    P.exponentiatedBy = P.pow = function(n, m) {
      var half, isModExp, i, k, more, nIsBig, nIsNeg, nIsOdd, y, x = this;
      n = new BigNumber3(n);
      if (n.c && !n.isInteger()) {
        throw Error(bignumberError + "Exponent not an integer: " + valueOf(n));
      }
      if (m != null) m = new BigNumber3(m);
      nIsBig = n.e > 14;
      if (!x.c || !x.c[0] || x.c[0] == 1 && !x.e && x.c.length == 1 || !n.c || !n.c[0]) {
        y = new BigNumber3(Math.pow(+valueOf(x), nIsBig ? n.s * (2 - isOdd(n)) : +valueOf(n)));
        return m ? y.mod(m) : y;
      }
      nIsNeg = n.s < 0;
      if (m) {
        if (m.c ? !m.c[0] : !m.s) return new BigNumber3(NaN);
        isModExp = !nIsNeg && x.isInteger() && m.isInteger();
        if (isModExp) x = x.mod(m);
      } else if (n.e > 9 && (x.e > 0 || x.e < -1 || (x.e == 0 ? x.c[0] > 1 || nIsBig && x.c[1] >= 24e7 : x.c[0] < 8e13 || nIsBig && x.c[0] <= 9999975e7))) {
        k = x.s < 0 && isOdd(n) ? -0 : 0;
        if (x.e > -1) k = 1 / k;
        return new BigNumber3(nIsNeg ? 1 / k : k);
      } else if (POW_PRECISION) {
        k = mathceil(POW_PRECISION / LOG_BASE + 2);
      }
      if (nIsBig) {
        half = new BigNumber3(0.5);
        if (nIsNeg) n.s = 1;
        nIsOdd = isOdd(n);
      } else {
        i = Math.abs(+valueOf(n));
        nIsOdd = i % 2;
      }
      y = new BigNumber3(ONE);
      for (; ; ) {
        if (nIsOdd) {
          y = y.times(x);
          if (!y.c) break;
          if (k) {
            if (y.c.length > k) y.c.length = k;
          } else if (isModExp) {
            y = y.mod(m);
          }
        }
        if (i) {
          i = mathfloor(i / 2);
          if (i === 0) break;
          nIsOdd = i % 2;
        } else {
          n = n.times(half);
          round(n, n.e + 1, 1);
          if (n.e > 14) {
            nIsOdd = isOdd(n);
          } else {
            i = +valueOf(n);
            if (i === 0) break;
            nIsOdd = i % 2;
          }
        }
        x = x.times(x);
        if (k) {
          if (x.c && x.c.length > k) x.c.length = k;
        } else if (isModExp) {
          x = x.mod(m);
        }
      }
      if (isModExp) return y;
      if (nIsNeg) y = ONE.div(y);
      return m ? y.mod(m) : k ? round(y, POW_PRECISION, ROUNDING_MODE, more) : y;
    };
    P.integerValue = function(rm) {
      var n = new BigNumber3(this);
      if (rm == null) rm = ROUNDING_MODE;
      else intCheck(rm, 0, 8);
      return round(n, n.e + 1, rm);
    };
    P.isEqualTo = P.eq = function(y, b) {
      return compare(this, new BigNumber3(y, b)) === 0;
    };
    P.isFinite = function() {
      return !!this.c;
    };
    P.isGreaterThan = P.gt = function(y, b) {
      return compare(this, new BigNumber3(y, b)) > 0;
    };
    P.isGreaterThanOrEqualTo = P.gte = function(y, b) {
      return (b = compare(this, new BigNumber3(y, b))) === 1 || b === 0;
    };
    P.isInteger = function() {
      return !!this.c && bitFloor(this.e / LOG_BASE) > this.c.length - 2;
    };
    P.isLessThan = P.lt = function(y, b) {
      return compare(this, new BigNumber3(y, b)) < 0;
    };
    P.isLessThanOrEqualTo = P.lte = function(y, b) {
      return (b = compare(this, new BigNumber3(y, b))) === -1 || b === 0;
    };
    P.isNaN = function() {
      return !this.s;
    };
    P.isNegative = function() {
      return this.s < 0;
    };
    P.isPositive = function() {
      return this.s > 0;
    };
    P.isZero = function() {
      return !!this.c && this.c[0] == 0;
    };
    P.minus = function(y, b) {
      var i, j, t, xLTy, x = this, a = x.s;
      y = new BigNumber3(y, b);
      b = y.s;
      if (!a || !b) return new BigNumber3(NaN);
      if (a != b) {
        y.s = -b;
        return x.plus(y);
      }
      var xe = x.e / LOG_BASE, ye = y.e / LOG_BASE, xc = x.c, yc = y.c;
      if (!xe || !ye) {
        if (!xc || !yc) return xc ? (y.s = -b, y) : new BigNumber3(yc ? x : NaN);
        if (!xc[0] || !yc[0]) {
          return yc[0] ? (y.s = -b, y) : new BigNumber3(xc[0] ? x : (
            // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
            ROUNDING_MODE == 3 ? -0 : 0
          ));
        }
      }
      xe = bitFloor(xe);
      ye = bitFloor(ye);
      xc = xc.slice();
      if (a = xe - ye) {
        if (xLTy = a < 0) {
          a = -a;
          t = xc;
        } else {
          ye = xe;
          t = yc;
        }
        t.reverse();
        for (b = a; b--; t.push(0)) ;
        t.reverse();
      } else {
        j = (xLTy = (a = xc.length) < (b = yc.length)) ? a : b;
        for (a = b = 0; b < j; b++) {
          if (xc[b] != yc[b]) {
            xLTy = xc[b] < yc[b];
            break;
          }
        }
      }
      if (xLTy) {
        t = xc;
        xc = yc;
        yc = t;
        y.s = -y.s;
      }
      b = (j = yc.length) - (i = xc.length);
      if (b > 0) for (; b--; xc[i++] = 0) ;
      b = BASE - 1;
      for (; j > a; ) {
        if (xc[--j] < yc[j]) {
          for (i = j; i && !xc[--i]; xc[i] = b) ;
          --xc[i];
          xc[j] += BASE;
        }
        xc[j] -= yc[j];
      }
      for (; xc[0] == 0; xc.splice(0, 1), --ye) ;
      if (!xc[0]) {
        y.s = ROUNDING_MODE == 3 ? -1 : 1;
        y.c = [y.e = 0];
        return y;
      }
      return normalise(y, xc, ye);
    };
    P.modulo = P.mod = function(y, b) {
      var q, s, x = this;
      y = new BigNumber3(y, b);
      if (!x.c || !y.s || y.c && !y.c[0]) {
        return new BigNumber3(NaN);
      } else if (!y.c || x.c && !x.c[0]) {
        return new BigNumber3(x);
      }
      if (MODULO_MODE == 9) {
        s = y.s;
        y.s = 1;
        q = div(x, y, 0, 3);
        y.s = s;
        q.s *= s;
      } else {
        q = div(x, y, 0, MODULO_MODE);
      }
      y = x.minus(q.times(y));
      if (!y.c[0] && MODULO_MODE == 1) y.s = x.s;
      return y;
    };
    P.multipliedBy = P.times = function(y, b) {
      var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc, base2, sqrtBase, x = this, xc = x.c, yc = (y = new BigNumber3(y, b)).c;
      if (!xc || !yc || !xc[0] || !yc[0]) {
        if (!x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc) {
          y.c = y.e = y.s = null;
        } else {
          y.s *= x.s;
          if (!xc || !yc) {
            y.c = y.e = null;
          } else {
            y.c = [0];
            y.e = 0;
          }
        }
        return y;
      }
      e = bitFloor(x.e / LOG_BASE) + bitFloor(y.e / LOG_BASE);
      y.s *= x.s;
      xcL = xc.length;
      ycL = yc.length;
      if (xcL < ycL) {
        zc = xc;
        xc = yc;
        yc = zc;
        i = xcL;
        xcL = ycL;
        ycL = i;
      }
      for (i = xcL + ycL, zc = []; i--; zc.push(0)) ;
      base2 = BASE;
      sqrtBase = SQRT_BASE;
      for (i = ycL; --i >= 0; ) {
        c = 0;
        ylo = yc[i] % sqrtBase;
        yhi = yc[i] / sqrtBase | 0;
        for (k = xcL, j = i + k; j > i; ) {
          xlo = xc[--k] % sqrtBase;
          xhi = xc[k] / sqrtBase | 0;
          m = yhi * xlo + xhi * ylo;
          xlo = ylo * xlo + m % sqrtBase * sqrtBase + zc[j] + c;
          c = (xlo / base2 | 0) + (m / sqrtBase | 0) + yhi * xhi;
          zc[j--] = xlo % base2;
        }
        zc[j] = c;
      }
      if (c) {
        ++e;
      } else {
        zc.splice(0, 1);
      }
      return normalise(y, zc, e);
    };
    P.negated = function() {
      var x = new BigNumber3(this);
      x.s = -x.s || null;
      return x;
    };
    P.plus = function(y, b) {
      var t, x = this, a = x.s;
      y = new BigNumber3(y, b);
      b = y.s;
      if (!a || !b) return new BigNumber3(NaN);
      if (a != b) {
        y.s = -b;
        return x.minus(y);
      }
      var xe = x.e / LOG_BASE, ye = y.e / LOG_BASE, xc = x.c, yc = y.c;
      if (!xe || !ye) {
        if (!xc || !yc) return new BigNumber3(a / 0);
        if (!xc[0] || !yc[0]) return yc[0] ? y : new BigNumber3(xc[0] ? x : a * 0);
      }
      xe = bitFloor(xe);
      ye = bitFloor(ye);
      xc = xc.slice();
      if (a = xe - ye) {
        if (a > 0) {
          ye = xe;
          t = yc;
        } else {
          a = -a;
          t = xc;
        }
        t.reverse();
        for (; a--; t.push(0)) ;
        t.reverse();
      }
      a = xc.length;
      b = yc.length;
      if (a - b < 0) {
        t = yc;
        yc = xc;
        xc = t;
        b = a;
      }
      for (a = 0; b; ) {
        a = (xc[--b] = xc[b] + yc[b] + a) / BASE | 0;
        xc[b] = BASE === xc[b] ? 0 : xc[b] % BASE;
      }
      if (a) {
        xc = [a].concat(xc);
        ++ye;
      }
      return normalise(y, xc, ye);
    };
    P.precision = P.sd = function(sd, rm) {
      var c, n, v, x = this;
      if (sd != null && sd !== !!sd) {
        intCheck(sd, 1, MAX);
        if (rm == null) rm = ROUNDING_MODE;
        else intCheck(rm, 0, 8);
        return round(new BigNumber3(x), sd, rm);
      }
      if (!(c = x.c)) return null;
      v = c.length - 1;
      n = v * LOG_BASE + 1;
      if (v = c[v]) {
        for (; v % 10 == 0; v /= 10, n--) ;
        for (v = c[0]; v >= 10; v /= 10, n++) ;
      }
      if (sd && x.e + 1 > n) n = x.e + 1;
      return n;
    };
    P.shiftedBy = function(k) {
      intCheck(k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER);
      return this.times("1e" + k);
    };
    P.squareRoot = P.sqrt = function() {
      var m, n, r, rep, t, x = this, c = x.c, s = x.s, e = x.e, dp = DECIMAL_PLACES + 4, half = new BigNumber3("0.5");
      if (s !== 1 || !c || !c[0]) {
        return new BigNumber3(!s || s < 0 && (!c || c[0]) ? NaN : c ? x : 1 / 0);
      }
      s = Math.sqrt(+valueOf(x));
      if (s == 0 || s == 1 / 0) {
        n = coeffToString(c);
        if ((n.length + e) % 2 == 0) n += "0";
        s = Math.sqrt(+n);
        e = bitFloor((e + 1) / 2) - (e < 0 || e % 2);
        if (s == 1 / 0) {
          n = "5e" + e;
        } else {
          n = s.toExponential();
          n = n.slice(0, n.indexOf("e") + 1) + e;
        }
        r = new BigNumber3(n);
      } else {
        r = new BigNumber3(s + "");
      }
      if (r.c[0]) {
        e = r.e;
        s = e + dp;
        if (s < 3) s = 0;
        for (; ; ) {
          t = r;
          r = half.times(t.plus(div(x, t, dp, 1)));
          if (coeffToString(t.c).slice(0, s) === (n = coeffToString(r.c)).slice(0, s)) {
            if (r.e < e) --s;
            n = n.slice(s - 3, s + 1);
            if (n == "9999" || !rep && n == "4999") {
              if (!rep) {
                round(t, t.e + DECIMAL_PLACES + 2, 0);
                if (t.times(t).eq(x)) {
                  r = t;
                  break;
                }
              }
              dp += 4;
              s += 4;
              rep = 1;
            } else {
              if (!+n || !+n.slice(1) && n.charAt(0) == "5") {
                round(r, r.e + DECIMAL_PLACES + 2, 1);
                m = !r.times(r).eq(x);
              }
              break;
            }
          }
        }
      }
      return round(r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m);
    };
    P.toExponential = function(dp, rm) {
      if (dp != null) {
        intCheck(dp, 0, MAX);
        dp++;
      }
      return format(this, dp, rm, 1);
    };
    P.toFixed = function(dp, rm) {
      if (dp != null) {
        intCheck(dp, 0, MAX);
        dp = dp + this.e + 1;
      }
      return format(this, dp, rm);
    };
    P.toFormat = function(dp, rm, format2) {
      var str, x = this;
      if (format2 == null) {
        if (dp != null && rm && typeof rm == "object") {
          format2 = rm;
          rm = null;
        } else if (dp && typeof dp == "object") {
          format2 = dp;
          dp = rm = null;
        } else {
          format2 = FORMAT;
        }
      } else if (typeof format2 != "object") {
        throw Error(bignumberError + "Argument not an object: " + format2);
      }
      str = x.toFixed(dp, rm);
      if (x.c) {
        var i, arr = str.split("."), g1 = +format2.groupSize, g2 = +format2.secondaryGroupSize, groupSeparator = format2.groupSeparator || "", intPart = arr[0], fractionPart = arr[1], isNeg = x.s < 0, intDigits = isNeg ? intPart.slice(1) : intPart, len = intDigits.length;
        if (g2) {
          i = g1;
          g1 = g2;
          g2 = i;
          len -= i;
        }
        if (g1 > 0 && len > 0) {
          i = len % g1 || g1;
          intPart = intDigits.substr(0, i);
          for (; i < len; i += g1) intPart += groupSeparator + intDigits.substr(i, g1);
          if (g2 > 0) intPart += groupSeparator + intDigits.slice(i);
          if (isNeg) intPart = "-" + intPart;
        }
        str = fractionPart ? intPart + (format2.decimalSeparator || "") + ((g2 = +format2.fractionGroupSize) ? fractionPart.replace(
          new RegExp("\\d{" + g2 + "}\\B", "g"),
          "$&" + (format2.fractionGroupSeparator || "")
        ) : fractionPart) : intPart;
      }
      return (format2.prefix || "") + str + (format2.suffix || "");
    };
    P.toFraction = function(md) {
      var d, d0, d1, d2, e, exp, n, n0, n1, q, r, s, x = this, xc = x.c;
      if (md != null) {
        n = new BigNumber3(md);
        if (!n.isInteger() && (n.c || n.s !== 1) || n.lt(ONE)) {
          throw Error(bignumberError + "Argument " + (n.isInteger() ? "out of range: " : "not an integer: ") + valueOf(n));
        }
      }
      if (!xc) return new BigNumber3(x);
      d = new BigNumber3(ONE);
      n1 = d0 = new BigNumber3(ONE);
      d1 = n0 = new BigNumber3(ONE);
      s = coeffToString(xc);
      e = d.e = s.length - x.e - 1;
      d.c[0] = POWS_TEN[(exp = e % LOG_BASE) < 0 ? LOG_BASE + exp : exp];
      md = !md || n.comparedTo(d) > 0 ? e > 0 ? d : n1 : n;
      exp = MAX_EXP;
      MAX_EXP = 1 / 0;
      n = new BigNumber3(s);
      n0.c[0] = 0;
      for (; ; ) {
        q = div(n, d, 0, 1);
        d2 = d0.plus(q.times(d1));
        if (d2.comparedTo(md) == 1) break;
        d0 = d1;
        d1 = d2;
        n1 = n0.plus(q.times(d2 = n1));
        n0 = d2;
        d = n.minus(q.times(d2 = d));
        n = d2;
      }
      d2 = div(md.minus(d0), d1, 0, 1);
      n0 = n0.plus(d2.times(n1));
      d0 = d0.plus(d2.times(d1));
      n0.s = n1.s = x.s;
      e = e * 2;
      r = div(n1, d1, e, ROUNDING_MODE).minus(x).abs().comparedTo(
        div(n0, d0, e, ROUNDING_MODE).minus(x).abs()
      ) < 1 ? [n1, d1] : [n0, d0];
      MAX_EXP = exp;
      return r;
    };
    P.toNumber = function() {
      return +valueOf(this);
    };
    P.toPrecision = function(sd, rm) {
      if (sd != null) intCheck(sd, 1, MAX);
      return format(this, sd, rm, 2);
    };
    P.toString = function(b) {
      var str, n = this, s = n.s, e = n.e;
      if (e === null) {
        if (s) {
          str = "Infinity";
          if (s < 0) str = "-" + str;
        } else {
          str = "NaN";
        }
      } else {
        if (b == null) {
          str = e <= TO_EXP_NEG || e >= TO_EXP_POS ? toExponential(coeffToString(n.c), e) : toFixedPoint(coeffToString(n.c), e, "0");
        } else if (b === 10 && alphabetHasNormalDecimalDigits) {
          n = round(new BigNumber3(n), DECIMAL_PLACES + e + 1, ROUNDING_MODE);
          str = toFixedPoint(coeffToString(n.c), n.e, "0");
        } else {
          intCheck(b, 2, ALPHABET.length, "Base");
          str = convertBase(toFixedPoint(coeffToString(n.c), e, "0"), 10, b, s, true);
        }
        if (s < 0 && n.c[0]) str = "-" + str;
      }
      return str;
    };
    P.valueOf = P.toJSON = function() {
      return valueOf(this);
    };
    P._isBigNumber = true;
    P[Symbol.toStringTag] = "BigNumber";
    P[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = P.valueOf;
    if (configObject != null) BigNumber3.set(configObject);
    return BigNumber3;
  }
  function bitFloor(n) {
    var i = n | 0;
    return n > 0 || n === i ? i : i - 1;
  }
  function coeffToString(a) {
    var s, z, i = 1, j = a.length, r = a[0] + "";
    for (; i < j; ) {
      s = a[i++] + "";
      z = LOG_BASE - s.length;
      for (; z--; s = "0" + s) ;
      r += s;
    }
    for (j = r.length; r.charCodeAt(--j) === 48; ) ;
    return r.slice(0, j + 1 || 1);
  }
  function compare(x, y) {
    var a, b, xc = x.c, yc = y.c, i = x.s, j = y.s, k = x.e, l = y.e;
    if (!i || !j) return null;
    a = xc && !xc[0];
    b = yc && !yc[0];
    if (a || b) return a ? b ? 0 : -j : i;
    if (i != j) return i;
    a = i < 0;
    b = k == l;
    if (!xc || !yc) return b ? 0 : !xc ^ a ? 1 : -1;
    if (!b) return k > l ^ a ? 1 : -1;
    j = (k = xc.length) < (l = yc.length) ? k : l;
    for (i = 0; i < j; i++) if (xc[i] != yc[i]) return xc[i] > yc[i] ^ a ? 1 : -1;
    return k == l ? 0 : k > l ^ a ? 1 : -1;
  }
  function intCheck(n, min, max, name) {
    if (n < min || n > max || n !== mathfloor(n)) {
      throw Error(bignumberError + (name || "Argument") + (typeof n == "number" ? n < min || n > max ? " out of range: " : " not an integer: " : " not a primitive number: ") + String(n));
    }
  }
  function isOdd(n) {
    var k = n.c.length - 1;
    return bitFloor(n.e / LOG_BASE) == k && n.c[k] % 2 != 0;
  }
  function toExponential(str, e) {
    return (str.length > 1 ? str.charAt(0) + "." + str.slice(1) : str) + (e < 0 ? "e" : "e+") + e;
  }
  function toFixedPoint(str, e, z) {
    var len, zs;
    if (e < 0) {
      for (zs = z + "."; ++e; zs += z) ;
      str = zs + str;
    } else {
      len = str.length;
      if (++e > len) {
        for (zs = z, e -= len; --e; zs += z) ;
        str += zs;
      } else if (e < len) {
        str = str.slice(0, e) + "." + str.slice(e);
      }
    }
    return str;
  }
  var BigNumber = clone();
  var bignumber_default = BigNumber;

  // node_modules/@ledgerhq/hw-app-eth/lib-es/errors.js
  init_buffer_shim_entry();
  var EthAppPleaseEnableContractData2 = class extends Error {
    constructor(message) {
      super(message || "EthAppPleaseEnableContractData");
      __publicField(this, "name", "EthAppPleaseEnableContractData");
    }
  };
  var EthAppNftNotSupported = class extends Error {
    constructor(message) {
      super(message || "EthAppNftNotSupported");
      __publicField(this, "name", "EthAppNftNotSupported");
    }
  };
  var CeloAppPleaseEnableContractData2 = class extends Error {
    constructor(message) {
      super(message || "CeloAppPleaseEnableContractData");
      __publicField(this, "name", "CeloAppPleaseEnableContractData");
    }
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/EIP712/index.js
  init_buffer_shim_entry();
  var import_semver2 = __toESM(require_semver2());

  // node_modules/@ledgerhq/evm-tools/lib-es/message/EIP712/index.js
  init_buffer_shim_entry();

  // node_modules/axios/index.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/axios.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/utils.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/bind.js
  init_buffer_shim_entry();
  function bind(fn, thisArg) {
    return function wrap() {
      return fn.apply(thisArg, arguments);
    };
  }

  // node_modules/axios/lib/utils.js
  var { toString } = Object.prototype;
  var { getPrototypeOf } = Object;
  var { iterator, toStringTag } = Symbol;
  var kindOf = /* @__PURE__ */ ((cache) => (thing) => {
    const str = toString.call(thing);
    return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
  })(/* @__PURE__ */ Object.create(null));
  var kindOfTest = (type) => {
    type = type.toLowerCase();
    return (thing) => kindOf(thing) === type;
  };
  var typeOfTest = (type) => (thing) => typeof thing === type;
  var { isArray } = Array;
  var isUndefined = typeOfTest("undefined");
  function isBuffer(val) {
    return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
  }
  var isArrayBuffer = kindOfTest("ArrayBuffer");
  function isArrayBufferView(val) {
    let result;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
      result = ArrayBuffer.isView(val);
    } else {
      result = val && val.buffer && isArrayBuffer(val.buffer);
    }
    return result;
  }
  var isString = typeOfTest("string");
  var isFunction = typeOfTest("function");
  var isNumber = typeOfTest("number");
  var isObject2 = (thing) => thing !== null && typeof thing === "object";
  var isBoolean = (thing) => thing === true || thing === false;
  var isPlainObject = (val) => {
    if (kindOf(val) !== "object") {
      return false;
    }
    const prototype2 = getPrototypeOf(val);
    return (prototype2 === null || prototype2 === Object.prototype || Object.getPrototypeOf(prototype2) === null) && !(toStringTag in val) && !(iterator in val);
  };
  var isEmptyObject = (val) => {
    if (!isObject2(val) || isBuffer(val)) {
      return false;
    }
    try {
      return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
    } catch (e) {
      return false;
    }
  };
  var isDate = kindOfTest("Date");
  var isFile = kindOfTest("File");
  var isBlob = kindOfTest("Blob");
  var isFileList = kindOfTest("FileList");
  var isStream = (val) => isObject2(val) && isFunction(val.pipe);
  var isFormData = (thing) => {
    let kind;
    return thing && (typeof FormData === "function" && thing instanceof FormData || isFunction(thing.append) && ((kind = kindOf(thing)) === "formdata" || // detect form-data instance
    kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]"));
  };
  var isURLSearchParams = kindOfTest("URLSearchParams");
  var [isReadableStream, isRequest, isResponse, isHeaders] = [
    "ReadableStream",
    "Request",
    "Response",
    "Headers"
  ].map(kindOfTest);
  var trim = (str) => str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
  function forEach(obj, fn, { allOwnKeys = false } = {}) {
    if (obj === null || typeof obj === "undefined") {
      return;
    }
    let i;
    let l;
    if (typeof obj !== "object") {
      obj = [obj];
    }
    if (isArray(obj)) {
      for (i = 0, l = obj.length; i < l; i++) {
        fn.call(null, obj[i], i, obj);
      }
    } else {
      if (isBuffer(obj)) {
        return;
      }
      const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
      const len = keys.length;
      let key2;
      for (i = 0; i < len; i++) {
        key2 = keys[i];
        fn.call(null, obj[key2], key2, obj);
      }
    }
  }
  function findKey(obj, key2) {
    if (isBuffer(obj)) {
      return null;
    }
    key2 = key2.toLowerCase();
    const keys = Object.keys(obj);
    let i = keys.length;
    let _key;
    while (i-- > 0) {
      _key = keys[i];
      if (key2 === _key.toLowerCase()) {
        return _key;
      }
    }
    return null;
  }
  var _global = (() => {
    if (typeof globalThis !== "undefined") return globalThis;
    return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis;
  })();
  var isContextDefined = (context) => !isUndefined(context) && context !== _global;
  function merge() {
    const { caseless, skipUndefined } = isContextDefined(this) && this || {};
    const result = {};
    const assignValue = (val, key2) => {
      if (key2 === "__proto__" || key2 === "constructor" || key2 === "prototype") {
        return;
      }
      const targetKey = caseless && findKey(result, key2) || key2;
      if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
        result[targetKey] = merge(result[targetKey], val);
      } else if (isPlainObject(val)) {
        result[targetKey] = merge({}, val);
      } else if (isArray(val)) {
        result[targetKey] = val.slice();
      } else if (!skipUndefined || !isUndefined(val)) {
        result[targetKey] = val;
      }
    };
    for (let i = 0, l = arguments.length; i < l; i++) {
      arguments[i] && forEach(arguments[i], assignValue);
    }
    return result;
  }
  var extend = (a, b, thisArg, { allOwnKeys } = {}) => {
    forEach(
      b,
      (val, key2) => {
        if (thisArg && isFunction(val)) {
          Object.defineProperty(a, key2, {
            value: bind(val, thisArg),
            writable: true,
            enumerable: true,
            configurable: true
          });
        } else {
          Object.defineProperty(a, key2, {
            value: val,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      },
      { allOwnKeys }
    );
    return a;
  };
  var stripBOM = (content) => {
    if (content.charCodeAt(0) === 65279) {
      content = content.slice(1);
    }
    return content;
  };
  var inherits = (constructor, superConstructor, props, descriptors) => {
    constructor.prototype = Object.create(
      superConstructor.prototype,
      descriptors
    );
    Object.defineProperty(constructor.prototype, "constructor", {
      value: constructor,
      writable: true,
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(constructor, "super", {
      value: superConstructor.prototype
    });
    props && Object.assign(constructor.prototype, props);
  };
  var toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
    let props;
    let i;
    let prop;
    const merged = {};
    destObj = destObj || {};
    if (sourceObj == null) return destObj;
    do {
      props = Object.getOwnPropertyNames(sourceObj);
      i = props.length;
      while (i-- > 0) {
        prop = props[i];
        if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
          destObj[prop] = sourceObj[prop];
          merged[prop] = true;
        }
      }
      sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
    } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
    return destObj;
  };
  var endsWith = (str, searchString, position) => {
    str = String(str);
    if (position === void 0 || position > str.length) {
      position = str.length;
    }
    position -= searchString.length;
    const lastIndex = str.indexOf(searchString, position);
    return lastIndex !== -1 && lastIndex === position;
  };
  var toArray = (thing) => {
    if (!thing) return null;
    if (isArray(thing)) return thing;
    let i = thing.length;
    if (!isNumber(i)) return null;
    const arr = new Array(i);
    while (i-- > 0) {
      arr[i] = thing[i];
    }
    return arr;
  };
  var isTypedArray = /* @__PURE__ */ ((TypedArray) => {
    return (thing) => {
      return TypedArray && thing instanceof TypedArray;
    };
  })(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
  var forEachEntry = (obj, fn) => {
    const generator = obj && obj[iterator];
    const _iterator = generator.call(obj);
    let result;
    while ((result = _iterator.next()) && !result.done) {
      const pair = result.value;
      fn.call(obj, pair[0], pair[1]);
    }
  };
  var matchAll = (regExp, str) => {
    let matches;
    const arr = [];
    while ((matches = regExp.exec(str)) !== null) {
      arr.push(matches);
    }
    return arr;
  };
  var isHTMLForm = kindOfTest("HTMLFormElement");
  var toCamelCase = (str) => {
    return str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(m, p1, p2) {
      return p1.toUpperCase() + p2;
    });
  };
  var hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
  var isRegExp = kindOfTest("RegExp");
  var reduceDescriptors = (obj, reducer) => {
    const descriptors = Object.getOwnPropertyDescriptors(obj);
    const reducedDescriptors = {};
    forEach(descriptors, (descriptor, name) => {
      let ret;
      if ((ret = reducer(descriptor, name, obj)) !== false) {
        reducedDescriptors[name] = ret || descriptor;
      }
    });
    Object.defineProperties(obj, reducedDescriptors);
  };
  var freezeMethods = (obj) => {
    reduceDescriptors(obj, (descriptor, name) => {
      if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
        return false;
      }
      const value = obj[name];
      if (!isFunction(value)) return;
      descriptor.enumerable = false;
      if ("writable" in descriptor) {
        descriptor.writable = false;
        return;
      }
      if (!descriptor.set) {
        descriptor.set = () => {
          throw Error("Can not rewrite read-only method '" + name + "'");
        };
      }
    });
  };
  var toObjectSet = (arrayOrString, delimiter) => {
    const obj = {};
    const define2 = (arr) => {
      arr.forEach((value) => {
        obj[value] = true;
      });
    };
    isArray(arrayOrString) ? define2(arrayOrString) : define2(String(arrayOrString).split(delimiter));
    return obj;
  };
  var noop = () => {
  };
  var toFiniteNumber = (value, defaultValue) => {
    return value != null && Number.isFinite(value = +value) ? value : defaultValue;
  };
  function isSpecCompliantForm(thing) {
    return !!(thing && isFunction(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
  }
  var toJSONObject = (obj) => {
    const stack = new Array(10);
    const visit = (source, i) => {
      if (isObject2(source)) {
        if (stack.indexOf(source) >= 0) {
          return;
        }
        if (isBuffer(source)) {
          return source;
        }
        if (!("toJSON" in source)) {
          stack[i] = source;
          const target = isArray(source) ? [] : {};
          forEach(source, (value, key2) => {
            const reducedValue = visit(value, i + 1);
            !isUndefined(reducedValue) && (target[key2] = reducedValue);
          });
          stack[i] = void 0;
          return target;
        }
      }
      return source;
    };
    return visit(obj, 0);
  };
  var isAsyncFn = kindOfTest("AsyncFunction");
  var isThenable = (thing) => thing && (isObject2(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
  var _setImmediate = ((setImmediateSupported, postMessageSupported) => {
    if (setImmediateSupported) {
      return setImmediate;
    }
    return postMessageSupported ? ((token, callbacks) => {
      _global.addEventListener(
        "message",
        ({ source, data }) => {
          if (source === _global && data === token) {
            callbacks.length && callbacks.shift()();
          }
        },
        false
      );
      return (cb) => {
        callbacks.push(cb);
        _global.postMessage(token, "*");
      };
    })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
  })(typeof setImmediate === "function", isFunction(_global.postMessage));
  var asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
  var isIterable = (thing) => thing != null && isFunction(thing[iterator]);
  var utils_default = {
    isArray,
    isArrayBuffer,
    isBuffer,
    isFormData,
    isArrayBufferView,
    isString,
    isNumber,
    isBoolean,
    isObject: isObject2,
    isPlainObject,
    isEmptyObject,
    isReadableStream,
    isRequest,
    isResponse,
    isHeaders,
    isUndefined,
    isDate,
    isFile,
    isBlob,
    isRegExp,
    isFunction,
    isStream,
    isURLSearchParams,
    isTypedArray,
    isFileList,
    forEach,
    merge,
    extend,
    trim,
    stripBOM,
    inherits,
    toFlatObject,
    kindOf,
    kindOfTest,
    endsWith,
    toArray,
    forEachEntry,
    matchAll,
    isHTMLForm,
    hasOwnProperty,
    hasOwnProp: hasOwnProperty,
    // an alias to avoid ESLint no-prototype-builtins detection
    reduceDescriptors,
    freezeMethods,
    toObjectSet,
    toCamelCase,
    noop,
    toFiniteNumber,
    findKey,
    global: _global,
    isContextDefined,
    isSpecCompliantForm,
    toJSONObject,
    isAsyncFn,
    isThenable,
    setImmediate: _setImmediate,
    asap,
    isIterable
  };

  // node_modules/axios/lib/core/Axios.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/buildURL.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/AxiosURLSearchParams.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/toFormData.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/core/AxiosError.js
  init_buffer_shim_entry();
  var AxiosError = class _AxiosError extends Error {
    static from(error, code, config, request, response, customProps) {
      const axiosError = new _AxiosError(error.message, code || error.code, config, request, response);
      axiosError.cause = error;
      axiosError.name = error.name;
      customProps && Object.assign(axiosError, customProps);
      return axiosError;
    }
    /**
     * Create an Error with the specified message, config, error code, request and response.
     *
     * @param {string} message The error message.
     * @param {string} [code] The error code (for example, 'ECONNABORTED').
     * @param {Object} [config] The config.
     * @param {Object} [request] The request.
     * @param {Object} [response] The response.
     *
     * @returns {Error} The created error.
     */
    constructor(message, code, config, request, response) {
      super(message);
      this.name = "AxiosError";
      this.isAxiosError = true;
      code && (this.code = code);
      config && (this.config = config);
      request && (this.request = request);
      if (response) {
        this.response = response;
        this.status = response.status;
      }
    }
    toJSON() {
      return {
        // Standard
        message: this.message,
        name: this.name,
        // Microsoft
        description: this.description,
        number: this.number,
        // Mozilla
        fileName: this.fileName,
        lineNumber: this.lineNumber,
        columnNumber: this.columnNumber,
        stack: this.stack,
        // Axios
        config: utils_default.toJSONObject(this.config),
        code: this.code,
        status: this.status
      };
    }
  };
  AxiosError.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
  AxiosError.ERR_BAD_OPTION = "ERR_BAD_OPTION";
  AxiosError.ECONNABORTED = "ECONNABORTED";
  AxiosError.ETIMEDOUT = "ETIMEDOUT";
  AxiosError.ERR_NETWORK = "ERR_NETWORK";
  AxiosError.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
  AxiosError.ERR_DEPRECATED = "ERR_DEPRECATED";
  AxiosError.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
  AxiosError.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
  AxiosError.ERR_CANCELED = "ERR_CANCELED";
  AxiosError.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
  AxiosError.ERR_INVALID_URL = "ERR_INVALID_URL";
  var AxiosError_default = AxiosError;

  // node_modules/axios/lib/helpers/null.js
  init_buffer_shim_entry();
  var null_default = null;

  // node_modules/axios/lib/helpers/toFormData.js
  function isVisitable(thing) {
    return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
  }
  function removeBrackets(key2) {
    return utils_default.endsWith(key2, "[]") ? key2.slice(0, -2) : key2;
  }
  function renderKey(path, key2, dots) {
    if (!path) return key2;
    return path.concat(key2).map(function each(token, i) {
      token = removeBrackets(token);
      return !dots && i ? "[" + token + "]" : token;
    }).join(dots ? "." : "");
  }
  function isFlatArray(arr) {
    return utils_default.isArray(arr) && !arr.some(isVisitable);
  }
  var predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
    return /^is[A-Z]/.test(prop);
  });
  function toFormData(obj, formData, options) {
    if (!utils_default.isObject(obj)) {
      throw new TypeError("target must be an object");
    }
    formData = formData || new (null_default || FormData)();
    options = utils_default.toFlatObject(options, {
      metaTokens: true,
      dots: false,
      indexes: false
    }, false, function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    });
    const metaTokens = options.metaTokens;
    const visitor = options.visitor || defaultVisitor;
    const dots = options.dots;
    const indexes = options.indexes;
    const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
    const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
    if (!utils_default.isFunction(visitor)) {
      throw new TypeError("visitor must be a function");
    }
    function convertValue(value) {
      if (value === null) return "";
      if (utils_default.isDate(value)) {
        return value.toISOString();
      }
      if (utils_default.isBoolean(value)) {
        return value.toString();
      }
      if (!useBlob && utils_default.isBlob(value)) {
        throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
      }
      if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
        return useBlob && typeof Blob === "function" ? new Blob([value]) : import_buffer.Buffer.from(value);
      }
      return value;
    }
    function defaultVisitor(value, key2, path) {
      let arr = value;
      if (value && !path && typeof value === "object") {
        if (utils_default.endsWith(key2, "{}")) {
          key2 = metaTokens ? key2 : key2.slice(0, -2);
          value = JSON.stringify(value);
        } else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key2, "[]")) && (arr = utils_default.toArray(value))) {
          key2 = removeBrackets(key2);
          arr.forEach(function each(el, index) {
            !(utils_default.isUndefined(el) || el === null) && formData.append(
              // eslint-disable-next-line no-nested-ternary
              indexes === true ? renderKey([key2], index, dots) : indexes === null ? key2 : key2 + "[]",
              convertValue(el)
            );
          });
          return false;
        }
      }
      if (isVisitable(value)) {
        return true;
      }
      formData.append(renderKey(path, key2, dots), convertValue(value));
      return false;
    }
    const stack = [];
    const exposedHelpers = Object.assign(predicates, {
      defaultVisitor,
      convertValue,
      isVisitable
    });
    function build(value, path) {
      if (utils_default.isUndefined(value)) return;
      if (stack.indexOf(value) !== -1) {
        throw Error("Circular reference detected in " + path.join("."));
      }
      stack.push(value);
      utils_default.forEach(value, function each(el, key2) {
        const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(
          formData,
          el,
          utils_default.isString(key2) ? key2.trim() : key2,
          path,
          exposedHelpers
        );
        if (result === true) {
          build(el, path ? path.concat(key2) : [key2]);
        }
      });
      stack.pop();
    }
    if (!utils_default.isObject(obj)) {
      throw new TypeError("data must be an object");
    }
    build(obj);
    return formData;
  }
  var toFormData_default = toFormData;

  // node_modules/axios/lib/helpers/AxiosURLSearchParams.js
  function encode(str) {
    const charMap = {
      "!": "%21",
      "'": "%27",
      "(": "%28",
      ")": "%29",
      "~": "%7E",
      "%20": "+",
      "%00": "\0"
    };
    return encodeURIComponent(str).replace(/[!'()~]|%20|%00/g, function replacer(match) {
      return charMap[match];
    });
  }
  function AxiosURLSearchParams(params, options) {
    this._pairs = [];
    params && toFormData_default(params, this, options);
  }
  var prototype = AxiosURLSearchParams.prototype;
  prototype.append = function append(name, value) {
    this._pairs.push([name, value]);
  };
  prototype.toString = function toString2(encoder) {
    const _encode3 = encoder ? function(value) {
      return encoder.call(this, value, encode);
    } : encode;
    return this._pairs.map(function each(pair) {
      return _encode3(pair[0]) + "=" + _encode3(pair[1]);
    }, "").join("&");
  };
  var AxiosURLSearchParams_default = AxiosURLSearchParams;

  // node_modules/axios/lib/helpers/buildURL.js
  function encode2(val) {
    return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
  }
  function buildURL(url, params, options) {
    if (!params) {
      return url;
    }
    const _encode3 = options && options.encode || encode2;
    const _options = utils_default.isFunction(options) ? {
      serialize: options
    } : options;
    const serializeFn = _options && _options.serialize;
    let serializedParams;
    if (serializeFn) {
      serializedParams = serializeFn(params, _options);
    } else {
      serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, _options).toString(_encode3);
    }
    if (serializedParams) {
      const hashmarkIndex = url.indexOf("#");
      if (hashmarkIndex !== -1) {
        url = url.slice(0, hashmarkIndex);
      }
      url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
    }
    return url;
  }

  // node_modules/axios/lib/core/InterceptorManager.js
  init_buffer_shim_entry();
  var InterceptorManager = class {
    constructor() {
      this.handlers = [];
    }
    /**
     * Add a new interceptor to the stack
     *
     * @param {Function} fulfilled The function to handle `then` for a `Promise`
     * @param {Function} rejected The function to handle `reject` for a `Promise`
     * @param {Object} options The options for the interceptor, synchronous and runWhen
     *
     * @return {Number} An ID used to remove interceptor later
     */
    use(fulfilled, rejected, options) {
      this.handlers.push({
        fulfilled,
        rejected,
        synchronous: options ? options.synchronous : false,
        runWhen: options ? options.runWhen : null
      });
      return this.handlers.length - 1;
    }
    /**
     * Remove an interceptor from the stack
     *
     * @param {Number} id The ID that was returned by `use`
     *
     * @returns {void}
     */
    eject(id3) {
      if (this.handlers[id3]) {
        this.handlers[id3] = null;
      }
    }
    /**
     * Clear all interceptors from the stack
     *
     * @returns {void}
     */
    clear() {
      if (this.handlers) {
        this.handlers = [];
      }
    }
    /**
     * Iterate over all the registered interceptors
     *
     * This method is particularly useful for skipping over any
     * interceptors that may have become `null` calling `eject`.
     *
     * @param {Function} fn The function to call for each interceptor
     *
     * @returns {void}
     */
    forEach(fn) {
      utils_default.forEach(this.handlers, function forEachHandler(h) {
        if (h !== null) {
          fn(h);
        }
      });
    }
  };
  var InterceptorManager_default = InterceptorManager;

  // node_modules/axios/lib/core/dispatchRequest.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/core/transformData.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/defaults/index.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/defaults/transitional.js
  init_buffer_shim_entry();
  var transitional_default = {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false,
    legacyInterceptorReqResOrdering: true
  };

  // node_modules/axios/lib/helpers/toURLEncodedForm.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/platform/index.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/platform/browser/index.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
  init_buffer_shim_entry();
  var URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams_default;

  // node_modules/axios/lib/platform/browser/classes/FormData.js
  init_buffer_shim_entry();
  var FormData_default = typeof FormData !== "undefined" ? FormData : null;

  // node_modules/axios/lib/platform/browser/classes/Blob.js
  init_buffer_shim_entry();
  var Blob_default = typeof Blob !== "undefined" ? Blob : null;

  // node_modules/axios/lib/platform/browser/index.js
  var browser_default = {
    isBrowser: true,
    classes: {
      URLSearchParams: URLSearchParams_default,
      FormData: FormData_default,
      Blob: Blob_default
    },
    protocols: ["http", "https", "file", "blob", "url", "data"]
  };

  // node_modules/axios/lib/platform/common/utils.js
  var utils_exports = {};
  __export(utils_exports, {
    hasBrowserEnv: () => hasBrowserEnv,
    hasStandardBrowserEnv: () => hasStandardBrowserEnv,
    hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
    navigator: () => _navigator,
    origin: () => origin
  });
  init_buffer_shim_entry();
  var hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
  var _navigator = typeof navigator === "object" && navigator || void 0;
  var hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
  var hasStandardBrowserWebWorkerEnv = (() => {
    return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
    self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
  })();
  var origin = hasBrowserEnv && window.location.href || "http://localhost";

  // node_modules/axios/lib/platform/index.js
  var platform_default = {
    ...utils_exports,
    ...browser_default
  };

  // node_modules/axios/lib/helpers/toURLEncodedForm.js
  function toURLEncodedForm(data, options) {
    return toFormData_default(data, new platform_default.classes.URLSearchParams(), {
      visitor: function(value, key2, path, helpers) {
        if (platform_default.isNode && utils_default.isBuffer(value)) {
          this.append(key2, value.toString("base64"));
          return false;
        }
        return helpers.defaultVisitor.apply(this, arguments);
      },
      ...options
    });
  }

  // node_modules/axios/lib/helpers/formDataToJSON.js
  init_buffer_shim_entry();
  function parsePropPath(name) {
    return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
      return match[0] === "[]" ? "" : match[1] || match[0];
    });
  }
  function arrayToObject(arr) {
    const obj = {};
    const keys = Object.keys(arr);
    let i;
    const len = keys.length;
    let key2;
    for (i = 0; i < len; i++) {
      key2 = keys[i];
      obj[key2] = arr[key2];
    }
    return obj;
  }
  function formDataToJSON(formData) {
    function buildPath(path, value, target, index) {
      let name = path[index++];
      if (name === "__proto__") return true;
      const isNumericKey = Number.isFinite(+name);
      const isLast = index >= path.length;
      name = !name && utils_default.isArray(target) ? target.length : name;
      if (isLast) {
        if (utils_default.hasOwnProp(target, name)) {
          target[name] = [target[name], value];
        } else {
          target[name] = value;
        }
        return !isNumericKey;
      }
      if (!target[name] || !utils_default.isObject(target[name])) {
        target[name] = [];
      }
      const result = buildPath(path, value, target[name], index);
      if (result && utils_default.isArray(target[name])) {
        target[name] = arrayToObject(target[name]);
      }
      return !isNumericKey;
    }
    if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
      const obj = {};
      utils_default.forEachEntry(formData, (name, value) => {
        buildPath(parsePropPath(name), value, obj, 0);
      });
      return obj;
    }
    return null;
  }
  var formDataToJSON_default = formDataToJSON;

  // node_modules/axios/lib/defaults/index.js
  function stringifySafely(rawValue, parser, encoder) {
    if (utils_default.isString(rawValue)) {
      try {
        (parser || JSON.parse)(rawValue);
        return utils_default.trim(rawValue);
      } catch (e) {
        if (e.name !== "SyntaxError") {
          throw e;
        }
      }
    }
    return (encoder || JSON.stringify)(rawValue);
  }
  var defaults = {
    transitional: transitional_default,
    adapter: ["xhr", "http", "fetch"],
    transformRequest: [function transformRequest(data, headers) {
      const contentType = headers.getContentType() || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils_default.isObject(data);
      if (isObjectPayload && utils_default.isHTMLForm(data)) {
        data = new FormData(data);
      }
      const isFormData2 = utils_default.isFormData(data);
      if (isFormData2) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
      }
      if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (utils_default.isArrayBufferView(data)) {
        return data.buffer;
      }
      if (utils_default.isURLSearchParams(data)) {
        headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
        return data.toString();
      }
      let isFileList2;
      if (isObjectPayload) {
        if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
          return toURLEncodedForm(data, this.formSerializer).toString();
        }
        if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
          const _FormData = this.env && this.env.FormData;
          return toFormData_default(
            isFileList2 ? { "files[]": data } : data,
            _FormData && new _FormData(),
            this.formSerializer
          );
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        return stringifySafely(data);
      }
      return data;
    }],
    transformResponse: [function transformResponse(data) {
      const transitional2 = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
      const JSONRequested = this.responseType === "json";
      if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (data && utils_default.isString(data) && (forcedJSONParsing && !this.responseType || JSONRequested)) {
        const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data, this.parseReviver);
        } catch (e) {
          if (strictJSONParsing) {
            if (e.name === "SyntaxError") {
              throw AxiosError_default.from(e, AxiosError_default.ERR_BAD_RESPONSE, this, null, this.response);
            }
            throw e;
          }
        }
      }
      return data;
    }],
    /**
     * A timeout in milliseconds to abort a request. If set to 0 (default) a
     * timeout is not created.
     */
    timeout: 0,
    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",
    maxContentLength: -1,
    maxBodyLength: -1,
    env: {
      FormData: platform_default.classes.FormData,
      Blob: platform_default.classes.Blob
    },
    validateStatus: function validateStatus(status) {
      return status >= 200 && status < 300;
    },
    headers: {
      common: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": void 0
      }
    }
  };
  utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
    defaults.headers[method] = {};
  });
  var defaults_default = defaults;

  // node_modules/axios/lib/core/AxiosHeaders.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/parseHeaders.js
  init_buffer_shim_entry();
  var ignoreDuplicateOf = utils_default.toObjectSet([
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "user-agent"
  ]);
  var parseHeaders_default = (rawHeaders) => {
    const parsed = {};
    let key2;
    let val;
    let i;
    rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
      i = line.indexOf(":");
      key2 = line.substring(0, i).trim().toLowerCase();
      val = line.substring(i + 1).trim();
      if (!key2 || parsed[key2] && ignoreDuplicateOf[key2]) {
        return;
      }
      if (key2 === "set-cookie") {
        if (parsed[key2]) {
          parsed[key2].push(val);
        } else {
          parsed[key2] = [val];
        }
      } else {
        parsed[key2] = parsed[key2] ? parsed[key2] + ", " + val : val;
      }
    });
    return parsed;
  };

  // node_modules/axios/lib/core/AxiosHeaders.js
  var $internals = /* @__PURE__ */ Symbol("internals");
  function normalizeHeader(header) {
    return header && String(header).trim().toLowerCase();
  }
  function normalizeValue(value) {
    if (value === false || value == null) {
      return value;
    }
    return utils_default.isArray(value) ? value.map(normalizeValue) : String(value);
  }
  function parseTokens(str) {
    const tokens = /* @__PURE__ */ Object.create(null);
    const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
    let match;
    while (match = tokensRE.exec(str)) {
      tokens[match[1]] = match[2];
    }
    return tokens;
  }
  var isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
  function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
    if (utils_default.isFunction(filter2)) {
      return filter2.call(this, value, header);
    }
    if (isHeaderNameFilter) {
      value = header;
    }
    if (!utils_default.isString(value)) return;
    if (utils_default.isString(filter2)) {
      return value.indexOf(filter2) !== -1;
    }
    if (utils_default.isRegExp(filter2)) {
      return filter2.test(value);
    }
  }
  function formatHeader(header) {
    return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
      return char.toUpperCase() + str;
    });
  }
  function buildAccessors(obj, header) {
    const accessorName = utils_default.toCamelCase(" " + header);
    ["get", "set", "has"].forEach((methodName) => {
      Object.defineProperty(obj, methodName + accessorName, {
        value: function(arg1, arg2, arg3) {
          return this[methodName].call(this, header, arg1, arg2, arg3);
        },
        configurable: true
      });
    });
  }
  var AxiosHeaders = class {
    constructor(headers) {
      headers && this.set(headers);
    }
    set(header, valueOrRewrite, rewrite) {
      const self2 = this;
      function setHeader(_value, _header, _rewrite) {
        const lHeader = normalizeHeader(_header);
        if (!lHeader) {
          throw new Error("header name must be a non-empty string");
        }
        const key2 = utils_default.findKey(self2, lHeader);
        if (!key2 || self2[key2] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key2] !== false) {
          self2[key2 || _header] = normalizeValue(_value);
        }
      }
      const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
      if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
        setHeaders(header, valueOrRewrite);
      } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
        setHeaders(parseHeaders_default(header), valueOrRewrite);
      } else if (utils_default.isObject(header) && utils_default.isIterable(header)) {
        let obj = {}, dest, key2;
        for (const entry of header) {
          if (!utils_default.isArray(entry)) {
            throw TypeError("Object iterator must return a key-value pair");
          }
          obj[key2 = entry[0]] = (dest = obj[key2]) ? utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]] : entry[1];
        }
        setHeaders(obj, valueOrRewrite);
      } else {
        header != null && setHeader(valueOrRewrite, header, rewrite);
      }
      return this;
    }
    get(header, parser) {
      header = normalizeHeader(header);
      if (header) {
        const key2 = utils_default.findKey(this, header);
        if (key2) {
          const value = this[key2];
          if (!parser) {
            return value;
          }
          if (parser === true) {
            return parseTokens(value);
          }
          if (utils_default.isFunction(parser)) {
            return parser.call(this, value, key2);
          }
          if (utils_default.isRegExp(parser)) {
            return parser.exec(value);
          }
          throw new TypeError("parser must be boolean|regexp|function");
        }
      }
    }
    has(header, matcher) {
      header = normalizeHeader(header);
      if (header) {
        const key2 = utils_default.findKey(this, header);
        return !!(key2 && this[key2] !== void 0 && (!matcher || matchHeaderValue(this, this[key2], key2, matcher)));
      }
      return false;
    }
    delete(header, matcher) {
      const self2 = this;
      let deleted = false;
      function deleteHeader(_header) {
        _header = normalizeHeader(_header);
        if (_header) {
          const key2 = utils_default.findKey(self2, _header);
          if (key2 && (!matcher || matchHeaderValue(self2, self2[key2], key2, matcher))) {
            delete self2[key2];
            deleted = true;
          }
        }
      }
      if (utils_default.isArray(header)) {
        header.forEach(deleteHeader);
      } else {
        deleteHeader(header);
      }
      return deleted;
    }
    clear(matcher) {
      const keys = Object.keys(this);
      let i = keys.length;
      let deleted = false;
      while (i--) {
        const key2 = keys[i];
        if (!matcher || matchHeaderValue(this, this[key2], key2, matcher, true)) {
          delete this[key2];
          deleted = true;
        }
      }
      return deleted;
    }
    normalize(format) {
      const self2 = this;
      const headers = {};
      utils_default.forEach(this, (value, header) => {
        const key2 = utils_default.findKey(headers, header);
        if (key2) {
          self2[key2] = normalizeValue(value);
          delete self2[header];
          return;
        }
        const normalized = format ? formatHeader(header) : String(header).trim();
        if (normalized !== header) {
          delete self2[header];
        }
        self2[normalized] = normalizeValue(value);
        headers[normalized] = true;
      });
      return this;
    }
    concat(...targets) {
      return this.constructor.concat(this, ...targets);
    }
    toJSON(asStrings) {
      const obj = /* @__PURE__ */ Object.create(null);
      utils_default.forEach(this, (value, header) => {
        value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
      });
      return obj;
    }
    [Symbol.iterator]() {
      return Object.entries(this.toJSON())[Symbol.iterator]();
    }
    toString() {
      return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
    }
    getSetCookie() {
      return this.get("set-cookie") || [];
    }
    get [Symbol.toStringTag]() {
      return "AxiosHeaders";
    }
    static from(thing) {
      return thing instanceof this ? thing : new this(thing);
    }
    static concat(first, ...targets) {
      const computed = new this(first);
      targets.forEach((target) => computed.set(target));
      return computed;
    }
    static accessor(header) {
      const internals = this[$internals] = this[$internals] = {
        accessors: {}
      };
      const accessors = internals.accessors;
      const prototype2 = this.prototype;
      function defineAccessor(_header) {
        const lHeader = normalizeHeader(_header);
        if (!accessors[lHeader]) {
          buildAccessors(prototype2, _header);
          accessors[lHeader] = true;
        }
      }
      utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
      return this;
    }
  };
  AxiosHeaders.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
  utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key2) => {
    let mapped = key2[0].toUpperCase() + key2.slice(1);
    return {
      get: () => value,
      set(headerValue) {
        this[mapped] = headerValue;
      }
    };
  });
  utils_default.freezeMethods(AxiosHeaders);
  var AxiosHeaders_default = AxiosHeaders;

  // node_modules/axios/lib/core/transformData.js
  function transformData(fns, response) {
    const config = this || defaults_default;
    const context = response || config;
    const headers = AxiosHeaders_default.from(context.headers);
    let data = context.data;
    utils_default.forEach(fns, function transform(fn) {
      data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
    });
    headers.normalize();
    return data;
  }

  // node_modules/axios/lib/cancel/isCancel.js
  init_buffer_shim_entry();
  function isCancel(value) {
    return !!(value && value.__CANCEL__);
  }

  // node_modules/axios/lib/cancel/CanceledError.js
  init_buffer_shim_entry();
  var CanceledError = class extends AxiosError_default {
    /**
     * A `CanceledError` is an object that is thrown when an operation is canceled.
     *
     * @param {string=} message The message.
     * @param {Object=} config The config.
     * @param {Object=} request The request.
     *
     * @returns {CanceledError} The created error.
     */
    constructor(message, config, request) {
      super(message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
      this.name = "CanceledError";
      this.__CANCEL__ = true;
    }
  };
  var CanceledError_default = CanceledError;

  // node_modules/axios/lib/adapters/adapters.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/adapters/xhr.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/core/settle.js
  init_buffer_shim_entry();
  function settle(resolve, reject, response) {
    const validateStatus2 = response.config.validateStatus;
    if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
      resolve(response);
    } else {
      reject(new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      ));
    }
  }

  // node_modules/axios/lib/helpers/parseProtocol.js
  init_buffer_shim_entry();
  function parseProtocol(url) {
    const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
    return match && match[1] || "";
  }

  // node_modules/axios/lib/helpers/progressEventReducer.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/speedometer.js
  init_buffer_shim_entry();
  function speedometer(samplesCount, min) {
    samplesCount = samplesCount || 10;
    const bytes = new Array(samplesCount);
    const timestamps = new Array(samplesCount);
    let head = 0;
    let tail = 0;
    let firstSampleTS;
    min = min !== void 0 ? min : 1e3;
    return function push(chunkLength) {
      const now = Date.now();
      const startedAt = timestamps[tail];
      if (!firstSampleTS) {
        firstSampleTS = now;
      }
      bytes[head] = chunkLength;
      timestamps[head] = now;
      let i = tail;
      let bytesCount = 0;
      while (i !== head) {
        bytesCount += bytes[i++];
        i = i % samplesCount;
      }
      head = (head + 1) % samplesCount;
      if (head === tail) {
        tail = (tail + 1) % samplesCount;
      }
      if (now - firstSampleTS < min) {
        return;
      }
      const passed = startedAt && now - startedAt;
      return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
    };
  }
  var speedometer_default = speedometer;

  // node_modules/axios/lib/helpers/throttle.js
  init_buffer_shim_entry();
  function throttle(fn, freq) {
    let timestamp = 0;
    let threshold = 1e3 / freq;
    let lastArgs;
    let timer;
    const invoke = (args, now = Date.now()) => {
      timestamp = now;
      lastArgs = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...args);
    };
    const throttled = (...args) => {
      const now = Date.now();
      const passed = now - timestamp;
      if (passed >= threshold) {
        invoke(args, now);
      } else {
        lastArgs = args;
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            invoke(lastArgs);
          }, threshold - passed);
        }
      }
    };
    const flush = () => lastArgs && invoke(lastArgs);
    return [throttled, flush];
  }
  var throttle_default = throttle;

  // node_modules/axios/lib/helpers/progressEventReducer.js
  var progressEventReducer = (listener, isDownloadStream, freq = 3) => {
    let bytesNotified = 0;
    const _speedometer = speedometer_default(50, 250);
    return throttle_default((e) => {
      const loaded = e.loaded;
      const total = e.lengthComputable ? e.total : void 0;
      const progressBytes = loaded - bytesNotified;
      const rate = _speedometer(progressBytes);
      const inRange = loaded <= total;
      bytesNotified = loaded;
      const data = {
        loaded,
        total,
        progress: total ? loaded / total : void 0,
        bytes: progressBytes,
        rate: rate ? rate : void 0,
        estimated: rate && total && inRange ? (total - loaded) / rate : void 0,
        event: e,
        lengthComputable: total != null,
        [isDownloadStream ? "download" : "upload"]: true
      };
      listener(data);
    }, freq);
  };
  var progressEventDecorator = (total, throttled) => {
    const lengthComputable = total != null;
    return [(loaded) => throttled[0]({
      lengthComputable,
      total,
      loaded
    }), throttled[1]];
  };
  var asyncDecorator = (fn) => (...args) => utils_default.asap(() => fn(...args));

  // node_modules/axios/lib/helpers/resolveConfig.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/isURLSameOrigin.js
  init_buffer_shim_entry();
  var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url) => {
    url = new URL(url, platform_default.origin);
    return origin2.protocol === url.protocol && origin2.host === url.host && (isMSIE || origin2.port === url.port);
  })(
    new URL(platform_default.origin),
    platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)
  ) : () => true;

  // node_modules/axios/lib/helpers/cookies.js
  init_buffer_shim_entry();
  var cookies_default = platform_default.hasStandardBrowserEnv ? (
    // Standard browser envs support document.cookie
    {
      write(name, value, expires, path, domain, secure, sameSite) {
        if (typeof document === "undefined") return;
        const cookie = [`${name}=${encodeURIComponent(value)}`];
        if (utils_default.isNumber(expires)) {
          cookie.push(`expires=${new Date(expires).toUTCString()}`);
        }
        if (utils_default.isString(path)) {
          cookie.push(`path=${path}`);
        }
        if (utils_default.isString(domain)) {
          cookie.push(`domain=${domain}`);
        }
        if (secure === true) {
          cookie.push("secure");
        }
        if (utils_default.isString(sameSite)) {
          cookie.push(`SameSite=${sameSite}`);
        }
        document.cookie = cookie.join("; ");
      },
      read(name) {
        if (typeof document === "undefined") return null;
        const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
        return match ? decodeURIComponent(match[1]) : null;
      },
      remove(name) {
        this.write(name, "", Date.now() - 864e5, "/");
      }
    }
  ) : (
    // Non-standard browser env (web workers, react-native) lack needed support.
    {
      write() {
      },
      read() {
        return null;
      },
      remove() {
      }
    }
  );

  // node_modules/axios/lib/core/buildFullPath.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/isAbsoluteURL.js
  init_buffer_shim_entry();
  function isAbsoluteURL(url) {
    if (typeof url !== "string") {
      return false;
    }
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
  }

  // node_modules/axios/lib/helpers/combineURLs.js
  init_buffer_shim_entry();
  function combineURLs(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
  }

  // node_modules/axios/lib/core/buildFullPath.js
  function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
    let isRelativeUrl = !isAbsoluteURL(requestedURL);
    if (baseURL && (isRelativeUrl || allowAbsoluteUrls == false)) {
      return combineURLs(baseURL, requestedURL);
    }
    return requestedURL;
  }

  // node_modules/axios/lib/core/mergeConfig.js
  init_buffer_shim_entry();
  var headersToObject = (thing) => thing instanceof AxiosHeaders_default ? { ...thing } : thing;
  function mergeConfig(config1, config2) {
    config2 = config2 || {};
    const config = {};
    function getMergedValue(target, source, prop, caseless) {
      if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
        return utils_default.merge.call({ caseless }, target, source);
      } else if (utils_default.isPlainObject(source)) {
        return utils_default.merge({}, source);
      } else if (utils_default.isArray(source)) {
        return source.slice();
      }
      return source;
    }
    function mergeDeepProperties(a, b, prop, caseless) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(a, b, prop, caseless);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a, prop, caseless);
      }
    }
    function valueFromConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      }
    }
    function defaultToConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a);
      }
    }
    function mergeDirectKeys(a, b, prop) {
      if (prop in config2) {
        return getMergedValue(a, b);
      } else if (prop in config1) {
        return getMergedValue(void 0, a);
      }
    }
    const mergeMap = {
      url: valueFromConfig2,
      method: valueFromConfig2,
      data: valueFromConfig2,
      baseURL: defaultToConfig2,
      transformRequest: defaultToConfig2,
      transformResponse: defaultToConfig2,
      paramsSerializer: defaultToConfig2,
      timeout: defaultToConfig2,
      timeoutMessage: defaultToConfig2,
      withCredentials: defaultToConfig2,
      withXSRFToken: defaultToConfig2,
      adapter: defaultToConfig2,
      responseType: defaultToConfig2,
      xsrfCookieName: defaultToConfig2,
      xsrfHeaderName: defaultToConfig2,
      onUploadProgress: defaultToConfig2,
      onDownloadProgress: defaultToConfig2,
      decompress: defaultToConfig2,
      maxContentLength: defaultToConfig2,
      maxBodyLength: defaultToConfig2,
      beforeRedirect: defaultToConfig2,
      transport: defaultToConfig2,
      httpAgent: defaultToConfig2,
      httpsAgent: defaultToConfig2,
      cancelToken: defaultToConfig2,
      socketPath: defaultToConfig2,
      responseEncoding: defaultToConfig2,
      validateStatus: mergeDirectKeys,
      headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true)
    };
    utils_default.forEach(
      Object.keys({ ...config1, ...config2 }),
      function computeConfigValue(prop) {
        if (prop === "__proto__" || prop === "constructor" || prop === "prototype")
          return;
        const merge2 = utils_default.hasOwnProp(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
        const configValue = merge2(config1[prop], config2[prop], prop);
        utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
      }
    );
    return config;
  }

  // node_modules/axios/lib/helpers/resolveConfig.js
  var resolveConfig_default = (config) => {
    const newConfig = mergeConfig({}, config);
    let { data, withXSRFToken, xsrfHeaderName, xsrfCookieName, headers, auth } = newConfig;
    newConfig.headers = headers = AxiosHeaders_default.from(headers);
    newConfig.url = buildURL(buildFullPath(newConfig.baseURL, newConfig.url, newConfig.allowAbsoluteUrls), config.params, config.paramsSerializer);
    if (auth) {
      headers.set(
        "Authorization",
        "Basic " + btoa((auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : ""))
      );
    }
    if (utils_default.isFormData(data)) {
      if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
        headers.setContentType(void 0);
      } else if (utils_default.isFunction(data.getHeaders)) {
        const formHeaders = data.getHeaders();
        const allowedHeaders = ["content-type", "content-length"];
        Object.entries(formHeaders).forEach(([key2, val]) => {
          if (allowedHeaders.includes(key2.toLowerCase())) {
            headers.set(key2, val);
          }
        });
      }
    }
    if (platform_default.hasStandardBrowserEnv) {
      withXSRFToken && utils_default.isFunction(withXSRFToken) && (withXSRFToken = withXSRFToken(newConfig));
      if (withXSRFToken || withXSRFToken !== false && isURLSameOrigin_default(newConfig.url)) {
        const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
        if (xsrfValue) {
          headers.set(xsrfHeaderName, xsrfValue);
        }
      }
    }
    return newConfig;
  };

  // node_modules/axios/lib/adapters/xhr.js
  var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
  var xhr_default = isXHRAdapterSupported && function(config) {
    return new Promise(function dispatchXhrRequest(resolve, reject) {
      const _config = resolveConfig_default(config);
      let requestData = _config.data;
      const requestHeaders = AxiosHeaders_default.from(_config.headers).normalize();
      let { responseType, onUploadProgress, onDownloadProgress } = _config;
      let onCanceled;
      let uploadThrottled, downloadThrottled;
      let flushUpload, flushDownload;
      function done() {
        flushUpload && flushUpload();
        flushDownload && flushDownload();
        _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
        _config.signal && _config.signal.removeEventListener("abort", onCanceled);
      }
      let request = new XMLHttpRequest();
      request.open(_config.method.toUpperCase(), _config.url, true);
      request.timeout = _config.timeout;
      function onloadend() {
        if (!request) {
          return;
        }
        const responseHeaders = AxiosHeaders_default.from(
          "getAllResponseHeaders" in request && request.getAllResponseHeaders()
        );
        const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
        const response = {
          data: responseData,
          status: request.status,
          statusText: request.statusText,
          headers: responseHeaders,
          config,
          request
        };
        settle(function _resolve(value) {
          resolve(value);
          done();
        }, function _reject(err) {
          reject(err);
          done();
        }, response);
        request = null;
      }
      if ("onloadend" in request) {
        request.onloadend = onloadend;
      } else {
        request.onreadystatechange = function handleLoad() {
          if (!request || request.readyState !== 4) {
            return;
          }
          if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
            return;
          }
          setTimeout(onloadend);
        };
      }
      request.onabort = function handleAbort() {
        if (!request) {
          return;
        }
        reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
        request = null;
      };
      request.onerror = function handleError(event) {
        const msg = event && event.message ? event.message : "Network Error";
        const err = new AxiosError_default(msg, AxiosError_default.ERR_NETWORK, config, request);
        err.event = event || null;
        reject(err);
        request = null;
      };
      request.ontimeout = function handleTimeout() {
        let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
        const transitional2 = _config.transitional || transitional_default;
        if (_config.timeoutErrorMessage) {
          timeoutErrorMessage = _config.timeoutErrorMessage;
        }
        reject(new AxiosError_default(
          timeoutErrorMessage,
          transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
          config,
          request
        ));
        request = null;
      };
      requestData === void 0 && requestHeaders.setContentType(null);
      if ("setRequestHeader" in request) {
        utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key2) {
          request.setRequestHeader(key2, val);
        });
      }
      if (!utils_default.isUndefined(_config.withCredentials)) {
        request.withCredentials = !!_config.withCredentials;
      }
      if (responseType && responseType !== "json") {
        request.responseType = _config.responseType;
      }
      if (onDownloadProgress) {
        [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
        request.addEventListener("progress", downloadThrottled);
      }
      if (onUploadProgress && request.upload) {
        [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
        request.upload.addEventListener("progress", uploadThrottled);
        request.upload.addEventListener("loadend", flushUpload);
      }
      if (_config.cancelToken || _config.signal) {
        onCanceled = (cancel) => {
          if (!request) {
            return;
          }
          reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
          request.abort();
          request = null;
        };
        _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
        if (_config.signal) {
          _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
        }
      }
      const protocol = parseProtocol(_config.url);
      if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
        reject(new AxiosError_default("Unsupported protocol " + protocol + ":", AxiosError_default.ERR_BAD_REQUEST, config));
        return;
      }
      request.send(requestData || null);
    });
  };

  // node_modules/axios/lib/adapters/fetch.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/helpers/composeSignals.js
  init_buffer_shim_entry();
  var composeSignals = (signals, timeout) => {
    const { length } = signals = signals ? signals.filter(Boolean) : [];
    if (timeout || length) {
      let controller = new AbortController();
      let aborted;
      const onabort = function(reason) {
        if (!aborted) {
          aborted = true;
          unsubscribe();
          const err = reason instanceof Error ? reason : this.reason;
          controller.abort(err instanceof AxiosError_default ? err : new CanceledError_default(err instanceof Error ? err.message : err));
        }
      };
      let timer = timeout && setTimeout(() => {
        timer = null;
        onabort(new AxiosError_default(`timeout of ${timeout}ms exceeded`, AxiosError_default.ETIMEDOUT));
      }, timeout);
      const unsubscribe = () => {
        if (signals) {
          timer && clearTimeout(timer);
          timer = null;
          signals.forEach((signal2) => {
            signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
          });
          signals = null;
        }
      };
      signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
      const { signal } = controller;
      signal.unsubscribe = () => utils_default.asap(unsubscribe);
      return signal;
    }
  };
  var composeSignals_default = composeSignals;

  // node_modules/axios/lib/helpers/trackStream.js
  init_buffer_shim_entry();
  var streamChunk = function* (chunk, chunkSize) {
    let len = chunk.byteLength;
    if (!chunkSize || len < chunkSize) {
      yield chunk;
      return;
    }
    let pos = 0;
    let end;
    while (pos < len) {
      end = pos + chunkSize;
      yield chunk.slice(pos, end);
      pos = end;
    }
  };
  var readBytes = async function* (iterable, chunkSize) {
    for await (const chunk of readStream(iterable)) {
      yield* streamChunk(chunk, chunkSize);
    }
  };
  var readStream = async function* (stream) {
    if (stream[Symbol.asyncIterator]) {
      yield* stream;
      return;
    }
    const reader = stream.getReader();
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield value;
      }
    } finally {
      await reader.cancel();
    }
  };
  var trackStream = (stream, chunkSize, onProgress, onFinish) => {
    const iterator2 = readBytes(stream, chunkSize);
    let bytes = 0;
    let done;
    let _onFinish = (e) => {
      if (!done) {
        done = true;
        onFinish && onFinish(e);
      }
    };
    return new ReadableStream({
      async pull(controller) {
        try {
          const { done: done2, value } = await iterator2.next();
          if (done2) {
            _onFinish();
            controller.close();
            return;
          }
          let len = value.byteLength;
          if (onProgress) {
            let loadedBytes = bytes += len;
            onProgress(loadedBytes);
          }
          controller.enqueue(new Uint8Array(value));
        } catch (err) {
          _onFinish(err);
          throw err;
        }
      },
      cancel(reason) {
        _onFinish(reason);
        return iterator2.return();
      }
    }, {
      highWaterMark: 2
    });
  };

  // node_modules/axios/lib/adapters/fetch.js
  var DEFAULT_CHUNK_SIZE = 64 * 1024;
  var { isFunction: isFunction2 } = utils_default;
  var globalFetchAPI = (({ Request, Response }) => ({
    Request,
    Response
  }))(utils_default.global);
  var {
    ReadableStream: ReadableStream2,
    TextEncoder
  } = utils_default.global;
  var test = (fn, ...args) => {
    try {
      return !!fn(...args);
    } catch (e) {
      return false;
    }
  };
  var factory = (env) => {
    env = utils_default.merge.call({
      skipUndefined: true
    }, globalFetchAPI, env);
    const { fetch: envFetch, Request, Response } = env;
    const isFetchSupported = envFetch ? isFunction2(envFetch) : typeof fetch === "function";
    const isRequestSupported = isFunction2(Request);
    const isResponseSupported = isFunction2(Response);
    if (!isFetchSupported) {
      return false;
    }
    const isReadableStreamSupported = isFetchSupported && isFunction2(ReadableStream2);
    const encodeText = isFetchSupported && (typeof TextEncoder === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
    const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
      let duplexAccessed = false;
      const hasContentType = new Request(platform_default.origin, {
        body: new ReadableStream2(),
        method: "POST",
        get duplex() {
          duplexAccessed = true;
          return "half";
        }
      }).headers.has("Content-Type");
      return duplexAccessed && !hasContentType;
    });
    const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
    const resolvers = {
      stream: supportsResponseStream && ((res) => res.body)
    };
    isFetchSupported && (() => {
      ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type) => {
        !resolvers[type] && (resolvers[type] = (res, config) => {
          let method = res && res[type];
          if (method) {
            return method.call(res);
          }
          throw new AxiosError_default(`Response type '${type}' is not supported`, AxiosError_default.ERR_NOT_SUPPORT, config);
        });
      });
    })();
    const getBodyLength = async (body) => {
      if (body == null) {
        return 0;
      }
      if (utils_default.isBlob(body)) {
        return body.size;
      }
      if (utils_default.isSpecCompliantForm(body)) {
        const _request = new Request(platform_default.origin, {
          method: "POST",
          body
        });
        return (await _request.arrayBuffer()).byteLength;
      }
      if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) {
        return body.byteLength;
      }
      if (utils_default.isURLSearchParams(body)) {
        body = body + "";
      }
      if (utils_default.isString(body)) {
        return (await encodeText(body)).byteLength;
      }
    };
    const resolveBodyLength = async (headers, body) => {
      const length = utils_default.toFiniteNumber(headers.getContentLength());
      return length == null ? getBodyLength(body) : length;
    };
    return async (config) => {
      let {
        url,
        method,
        data,
        signal,
        cancelToken,
        timeout,
        onDownloadProgress,
        onUploadProgress,
        responseType,
        headers,
        withCredentials = "same-origin",
        fetchOptions
      } = resolveConfig_default(config);
      let _fetch = envFetch || fetch;
      responseType = responseType ? (responseType + "").toLowerCase() : "text";
      let composedSignal = composeSignals_default([signal, cancelToken && cancelToken.toAbortSignal()], timeout);
      let request = null;
      const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
        composedSignal.unsubscribe();
      });
      let requestContentLength;
      try {
        if (onUploadProgress && supportsRequestStream && method !== "get" && method !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
          let _request = new Request(url, {
            method: "POST",
            body: data,
            duplex: "half"
          });
          let contentTypeHeader;
          if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
            headers.setContentType(contentTypeHeader);
          }
          if (_request.body) {
            const [onProgress, flush] = progressEventDecorator(
              requestContentLength,
              progressEventReducer(asyncDecorator(onUploadProgress))
            );
            data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
          }
        }
        if (!utils_default.isString(withCredentials)) {
          withCredentials = withCredentials ? "include" : "omit";
        }
        const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
        const resolvedOptions = {
          ...fetchOptions,
          signal: composedSignal,
          method: method.toUpperCase(),
          headers: headers.normalize().toJSON(),
          body: data,
          duplex: "half",
          credentials: isCredentialsSupported ? withCredentials : void 0
        };
        request = isRequestSupported && new Request(url, resolvedOptions);
        let response = await (isRequestSupported ? _fetch(request, fetchOptions) : _fetch(url, resolvedOptions));
        const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
        if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
          const options = {};
          ["status", "statusText", "headers"].forEach((prop) => {
            options[prop] = response[prop];
          });
          const responseContentLength = utils_default.toFiniteNumber(response.headers.get("content-length"));
          const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
            responseContentLength,
            progressEventReducer(asyncDecorator(onDownloadProgress), true)
          ) || [];
          response = new Response(
            trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
              flush && flush();
              unsubscribe && unsubscribe();
            }),
            options
          );
        }
        responseType = responseType || "text";
        let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](response, config);
        !isStreamResponse && unsubscribe && unsubscribe();
        return await new Promise((resolve, reject) => {
          settle(resolve, reject, {
            data: responseData,
            headers: AxiosHeaders_default.from(response.headers),
            status: response.status,
            statusText: response.statusText,
            config,
            request
          });
        });
      } catch (err) {
        unsubscribe && unsubscribe();
        if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
          throw Object.assign(
            new AxiosError_default("Network Error", AxiosError_default.ERR_NETWORK, config, request, err && err.response),
            {
              cause: err.cause || err
            }
          );
        }
        throw AxiosError_default.from(err, err && err.code, config, request, err && err.response);
      }
    };
  };
  var seedCache = /* @__PURE__ */ new Map();
  var getFetch = (config) => {
    let env = config && config.env || {};
    const { fetch: fetch2, Request, Response } = env;
    const seeds = [
      Request,
      Response,
      fetch2
    ];
    let len = seeds.length, i = len, seed, target, map = seedCache;
    while (i--) {
      seed = seeds[i];
      target = map.get(seed);
      target === void 0 && map.set(seed, target = i ? /* @__PURE__ */ new Map() : factory(env));
      map = target;
    }
    return target;
  };
  var adapter = getFetch();

  // node_modules/axios/lib/adapters/adapters.js
  var knownAdapters = {
    http: null_default,
    xhr: xhr_default,
    fetch: {
      get: getFetch
    }
  };
  utils_default.forEach(knownAdapters, (fn, value) => {
    if (fn) {
      try {
        Object.defineProperty(fn, "name", { value });
      } catch (e) {
      }
      Object.defineProperty(fn, "adapterName", { value });
    }
  });
  var renderReason = (reason) => `- ${reason}`;
  var isResolvedHandle = (adapter2) => utils_default.isFunction(adapter2) || adapter2 === null || adapter2 === false;
  function getAdapter(adapters, config) {
    adapters = utils_default.isArray(adapters) ? adapters : [adapters];
    const { length } = adapters;
    let nameOrAdapter;
    let adapter2;
    const rejectedReasons = {};
    for (let i = 0; i < length; i++) {
      nameOrAdapter = adapters[i];
      let id3;
      adapter2 = nameOrAdapter;
      if (!isResolvedHandle(nameOrAdapter)) {
        adapter2 = knownAdapters[(id3 = String(nameOrAdapter)).toLowerCase()];
        if (adapter2 === void 0) {
          throw new AxiosError_default(`Unknown adapter '${id3}'`);
        }
      }
      if (adapter2 && (utils_default.isFunction(adapter2) || (adapter2 = adapter2.get(config)))) {
        break;
      }
      rejectedReasons[id3 || "#" + i] = adapter2;
    }
    if (!adapter2) {
      const reasons = Object.entries(rejectedReasons).map(
        ([id3, state]) => `adapter ${id3} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
      );
      let s = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
      throw new AxiosError_default(
        `There is no suitable adapter to dispatch the request ` + s,
        "ERR_NOT_SUPPORT"
      );
    }
    return adapter2;
  }
  var adapters_default = {
    /**
     * Resolve an adapter from a list of adapter names or functions.
     * @type {Function}
     */
    getAdapter,
    /**
     * Exposes all known adapters
     * @type {Object<string, Function|Object>}
     */
    adapters: knownAdapters
  };

  // node_modules/axios/lib/core/dispatchRequest.js
  function throwIfCancellationRequested(config) {
    if (config.cancelToken) {
      config.cancelToken.throwIfRequested();
    }
    if (config.signal && config.signal.aborted) {
      throw new CanceledError_default(null, config);
    }
  }
  function dispatchRequest(config) {
    throwIfCancellationRequested(config);
    config.headers = AxiosHeaders_default.from(config.headers);
    config.data = transformData.call(
      config,
      config.transformRequest
    );
    if (["post", "put", "patch"].indexOf(config.method) !== -1) {
      config.headers.setContentType("application/x-www-form-urlencoded", false);
    }
    const adapter2 = adapters_default.getAdapter(config.adapter || defaults_default.adapter, config);
    return adapter2(config).then(function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(
        config,
        config.transformResponse,
        response
      );
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    }, function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    });
  }

  // node_modules/axios/lib/helpers/validator.js
  init_buffer_shim_entry();

  // node_modules/axios/lib/env/data.js
  init_buffer_shim_entry();
  var VERSION = "1.13.5";

  // node_modules/axios/lib/helpers/validator.js
  var validators = {};
  ["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i) => {
    validators[type] = function validator(thing) {
      return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
    };
  });
  var deprecatedWarnings = {};
  validators.transitional = function transitional(validator, version11, message) {
    function formatMessage(opt, desc) {
      return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
    }
    return (value, opt, opts) => {
      if (validator === false) {
        throw new AxiosError_default(
          formatMessage(opt, " has been removed" + (version11 ? " in " + version11 : "")),
          AxiosError_default.ERR_DEPRECATED
        );
      }
      if (version11 && !deprecatedWarnings[opt]) {
        deprecatedWarnings[opt] = true;
        console.warn(
          formatMessage(
            opt,
            " has been deprecated since v" + version11 + " and will be removed in the near future"
          )
        );
      }
      return validator ? validator(value, opt, opts) : true;
    };
  };
  validators.spelling = function spelling(correctSpelling) {
    return (value, opt) => {
      console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
      return true;
    };
  };
  function assertOptions(options, schema, allowUnknown) {
    if (typeof options !== "object") {
      throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
    }
    const keys = Object.keys(options);
    let i = keys.length;
    while (i-- > 0) {
      const opt = keys[i];
      const validator = schema[opt];
      if (validator) {
        const value = options[opt];
        const result = value === void 0 || validator(value, opt, options);
        if (result !== true) {
          throw new AxiosError_default("option " + opt + " must be " + result, AxiosError_default.ERR_BAD_OPTION_VALUE);
        }
        continue;
      }
      if (allowUnknown !== true) {
        throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
      }
    }
  }
  var validator_default = {
    assertOptions,
    validators
  };

  // node_modules/axios/lib/core/Axios.js
  var validators2 = validator_default.validators;
  var Axios = class {
    constructor(instanceConfig) {
      this.defaults = instanceConfig || {};
      this.interceptors = {
        request: new InterceptorManager_default(),
        response: new InterceptorManager_default()
      };
    }
    /**
     * Dispatch a request
     *
     * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
     * @param {?Object} config
     *
     * @returns {Promise} The Promise to be fulfilled
     */
    async request(configOrUrl, config) {
      try {
        return await this._request(configOrUrl, config);
      } catch (err) {
        if (err instanceof Error) {
          let dummy = {};
          Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
          const stack = dummy.stack ? dummy.stack.replace(/^.+\n/, "") : "";
          try {
            if (!err.stack) {
              err.stack = stack;
            } else if (stack && !String(err.stack).endsWith(stack.replace(/^.+\n.+\n/, ""))) {
              err.stack += "\n" + stack;
            }
          } catch (e) {
          }
        }
        throw err;
      }
    }
    _request(configOrUrl, config) {
      if (typeof configOrUrl === "string") {
        config = config || {};
        config.url = configOrUrl;
      } else {
        config = configOrUrl || {};
      }
      config = mergeConfig(this.defaults, config);
      const { transitional: transitional2, paramsSerializer, headers } = config;
      if (transitional2 !== void 0) {
        validator_default.assertOptions(transitional2, {
          silentJSONParsing: validators2.transitional(validators2.boolean),
          forcedJSONParsing: validators2.transitional(validators2.boolean),
          clarifyTimeoutError: validators2.transitional(validators2.boolean),
          legacyInterceptorReqResOrdering: validators2.transitional(validators2.boolean)
        }, false);
      }
      if (paramsSerializer != null) {
        if (utils_default.isFunction(paramsSerializer)) {
          config.paramsSerializer = {
            serialize: paramsSerializer
          };
        } else {
          validator_default.assertOptions(paramsSerializer, {
            encode: validators2.function,
            serialize: validators2.function
          }, true);
        }
      }
      if (config.allowAbsoluteUrls !== void 0) {
      } else if (this.defaults.allowAbsoluteUrls !== void 0) {
        config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
      } else {
        config.allowAbsoluteUrls = true;
      }
      validator_default.assertOptions(config, {
        baseUrl: validators2.spelling("baseURL"),
        withXsrfToken: validators2.spelling("withXSRFToken")
      }, true);
      config.method = (config.method || this.defaults.method || "get").toLowerCase();
      let contextHeaders = headers && utils_default.merge(
        headers.common,
        headers[config.method]
      );
      headers && utils_default.forEach(
        ["delete", "get", "head", "post", "put", "patch", "common"],
        (method) => {
          delete headers[method];
        }
      );
      config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
      const requestInterceptorChain = [];
      let synchronousRequestInterceptors = true;
      this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
        if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
          return;
        }
        synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
        const transitional3 = config.transitional || transitional_default;
        const legacyInterceptorReqResOrdering = transitional3 && transitional3.legacyInterceptorReqResOrdering;
        if (legacyInterceptorReqResOrdering) {
          requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
        } else {
          requestInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
        }
      });
      const responseInterceptorChain = [];
      this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
        responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      });
      let promise;
      let i = 0;
      let len;
      if (!synchronousRequestInterceptors) {
        const chain = [dispatchRequest.bind(this), void 0];
        chain.unshift(...requestInterceptorChain);
        chain.push(...responseInterceptorChain);
        len = chain.length;
        promise = Promise.resolve(config);
        while (i < len) {
          promise = promise.then(chain[i++], chain[i++]);
        }
        return promise;
      }
      len = requestInterceptorChain.length;
      let newConfig = config;
      while (i < len) {
        const onFulfilled = requestInterceptorChain[i++];
        const onRejected = requestInterceptorChain[i++];
        try {
          newConfig = onFulfilled(newConfig);
        } catch (error) {
          onRejected.call(this, error);
          break;
        }
      }
      try {
        promise = dispatchRequest.call(this, newConfig);
      } catch (error) {
        return Promise.reject(error);
      }
      i = 0;
      len = responseInterceptorChain.length;
      while (i < len) {
        promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
      }
      return promise;
    }
    getUri(config) {
      config = mergeConfig(this.defaults, config);
      const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
      return buildURL(fullPath, config.params, config.paramsSerializer);
    }
  };
  utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
    Axios.prototype[method] = function(url, config) {
      return this.request(mergeConfig(config || {}, {
        method,
        url,
        data: (config || {}).data
      }));
    };
  });
  utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
    function generateHTTPMethod(isForm) {
      return function httpMethod(url, data, config) {
        return this.request(mergeConfig(config || {}, {
          method,
          headers: isForm ? {
            "Content-Type": "multipart/form-data"
          } : {},
          url,
          data
        }));
      };
    }
    Axios.prototype[method] = generateHTTPMethod();
    Axios.prototype[method + "Form"] = generateHTTPMethod(true);
  });
  var Axios_default = Axios;

  // node_modules/axios/lib/cancel/CancelToken.js
  init_buffer_shim_entry();
  var CancelToken = class _CancelToken {
    constructor(executor) {
      if (typeof executor !== "function") {
        throw new TypeError("executor must be a function.");
      }
      let resolvePromise;
      this.promise = new Promise(function promiseExecutor(resolve) {
        resolvePromise = resolve;
      });
      const token = this;
      this.promise.then((cancel) => {
        if (!token._listeners) return;
        let i = token._listeners.length;
        while (i-- > 0) {
          token._listeners[i](cancel);
        }
        token._listeners = null;
      });
      this.promise.then = (onfulfilled) => {
        let _resolve;
        const promise = new Promise((resolve) => {
          token.subscribe(resolve);
          _resolve = resolve;
        }).then(onfulfilled);
        promise.cancel = function reject() {
          token.unsubscribe(_resolve);
        };
        return promise;
      };
      executor(function cancel(message, config, request) {
        if (token.reason) {
          return;
        }
        token.reason = new CanceledError_default(message, config, request);
        resolvePromise(token.reason);
      });
    }
    /**
     * Throws a `CanceledError` if cancellation has been requested.
     */
    throwIfRequested() {
      if (this.reason) {
        throw this.reason;
      }
    }
    /**
     * Subscribe to the cancel signal
     */
    subscribe(listener) {
      if (this.reason) {
        listener(this.reason);
        return;
      }
      if (this._listeners) {
        this._listeners.push(listener);
      } else {
        this._listeners = [listener];
      }
    }
    /**
     * Unsubscribe from the cancel signal
     */
    unsubscribe(listener) {
      if (!this._listeners) {
        return;
      }
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    }
    toAbortSignal() {
      const controller = new AbortController();
      const abort = (err) => {
        controller.abort(err);
      };
      this.subscribe(abort);
      controller.signal.unsubscribe = () => this.unsubscribe(abort);
      return controller.signal;
    }
    /**
     * Returns an object that contains a new `CancelToken` and a function that, when called,
     * cancels the `CancelToken`.
     */
    static source() {
      let cancel;
      const token = new _CancelToken(function executor(c) {
        cancel = c;
      });
      return {
        token,
        cancel
      };
    }
  };
  var CancelToken_default = CancelToken;

  // node_modules/axios/lib/helpers/spread.js
  init_buffer_shim_entry();
  function spread(callback) {
    return function wrap(arr) {
      return callback.apply(null, arr);
    };
  }

  // node_modules/axios/lib/helpers/isAxiosError.js
  init_buffer_shim_entry();
  function isAxiosError(payload) {
    return utils_default.isObject(payload) && payload.isAxiosError === true;
  }

  // node_modules/axios/lib/helpers/HttpStatusCode.js
  init_buffer_shim_entry();
  var HttpStatusCode = {
    Continue: 100,
    SwitchingProtocols: 101,
    Processing: 102,
    EarlyHints: 103,
    Ok: 200,
    Created: 201,
    Accepted: 202,
    NonAuthoritativeInformation: 203,
    NoContent: 204,
    ResetContent: 205,
    PartialContent: 206,
    MultiStatus: 207,
    AlreadyReported: 208,
    ImUsed: 226,
    MultipleChoices: 300,
    MovedPermanently: 301,
    Found: 302,
    SeeOther: 303,
    NotModified: 304,
    UseProxy: 305,
    Unused: 306,
    TemporaryRedirect: 307,
    PermanentRedirect: 308,
    BadRequest: 400,
    Unauthorized: 401,
    PaymentRequired: 402,
    Forbidden: 403,
    NotFound: 404,
    MethodNotAllowed: 405,
    NotAcceptable: 406,
    ProxyAuthenticationRequired: 407,
    RequestTimeout: 408,
    Conflict: 409,
    Gone: 410,
    LengthRequired: 411,
    PreconditionFailed: 412,
    PayloadTooLarge: 413,
    UriTooLong: 414,
    UnsupportedMediaType: 415,
    RangeNotSatisfiable: 416,
    ExpectationFailed: 417,
    ImATeapot: 418,
    MisdirectedRequest: 421,
    UnprocessableEntity: 422,
    Locked: 423,
    FailedDependency: 424,
    TooEarly: 425,
    UpgradeRequired: 426,
    PreconditionRequired: 428,
    TooManyRequests: 429,
    RequestHeaderFieldsTooLarge: 431,
    UnavailableForLegalReasons: 451,
    InternalServerError: 500,
    NotImplemented: 501,
    BadGateway: 502,
    ServiceUnavailable: 503,
    GatewayTimeout: 504,
    HttpVersionNotSupported: 505,
    VariantAlsoNegotiates: 506,
    InsufficientStorage: 507,
    LoopDetected: 508,
    NotExtended: 510,
    NetworkAuthenticationRequired: 511,
    WebServerIsDown: 521,
    ConnectionTimedOut: 522,
    OriginIsUnreachable: 523,
    TimeoutOccurred: 524,
    SslHandshakeFailed: 525,
    InvalidSslCertificate: 526
  };
  Object.entries(HttpStatusCode).forEach(([key2, value]) => {
    HttpStatusCode[value] = key2;
  });
  var HttpStatusCode_default = HttpStatusCode;

  // node_modules/axios/lib/axios.js
  function createInstance(defaultConfig) {
    const context = new Axios_default(defaultConfig);
    const instance = bind(Axios_default.prototype.request, context);
    utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
    utils_default.extend(instance, context, null, { allOwnKeys: true });
    instance.create = function create(instanceConfig) {
      return createInstance(mergeConfig(defaultConfig, instanceConfig));
    };
    return instance;
  }
  var axios = createInstance(defaults_default);
  axios.Axios = Axios_default;
  axios.CanceledError = CanceledError_default;
  axios.CancelToken = CancelToken_default;
  axios.isCancel = isCancel;
  axios.VERSION = VERSION;
  axios.toFormData = toFormData_default;
  axios.AxiosError = AxiosError_default;
  axios.Cancel = axios.CanceledError;
  axios.all = function all(promises) {
    return Promise.all(promises);
  };
  axios.spread = spread;
  axios.isAxiosError = isAxiosError;
  axios.mergeConfig = mergeConfig;
  axios.AxiosHeaders = AxiosHeaders_default;
  axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
  axios.getAdapter = adapters_default.getAdapter;
  axios.HttpStatusCode = HttpStatusCode_default;
  axios.default = axios;
  var axios_default = axios;

  // node_modules/axios/index.js
  var {
    Axios: Axios2,
    AxiosError: AxiosError2,
    CanceledError: CanceledError2,
    isCancel: isCancel2,
    CancelToken: CancelToken2,
    VERSION: VERSION2,
    all: all2,
    Cancel,
    isAxiosError: isAxiosError2,
    spread: spread2,
    toFormData: toFormData2,
    AxiosHeaders: AxiosHeaders2,
    HttpStatusCode: HttpStatusCode2,
    formToJSON,
    getAdapter: getAdapter2,
    mergeConfig: mergeConfig2
  } = axios_default;

  // node_modules/@ledgerhq/evm-tools/lib-es/message/EIP712/index.js
  var import_sha224 = __toESM(require_sha224());

  // node_modules/@ledgerhq/live-env/lib-es/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/live-env/lib-es/env.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/live-env/lib-es/state.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/constants/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/constants/lib.esm/addresses.js
  init_buffer_shim_entry();
  var AddressZero = "0x0000000000000000000000000000000000000000";

  // node_modules/@ethersproject/constants/lib.esm/bignumbers.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/bignumber/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/bignumber/lib.esm/bignumber.js
  init_buffer_shim_entry();
  var import_bn = __toESM(require_bn());

  // node_modules/@ethersproject/bytes/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/logger/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/logger/lib.esm/_version.js
  init_buffer_shim_entry();
  var version = "logger/5.8.0";

  // node_modules/@ethersproject/logger/lib.esm/index.js
  var _permanentCensorErrors = false;
  var _censorErrors = false;
  var LogLevels = { debug: 1, "default": 2, info: 2, warning: 3, error: 4, off: 5 };
  var _logLevel = LogLevels["default"];
  var _globalLogger = null;
  function _checkNormalize() {
    try {
      const missing = [];
      ["NFD", "NFC", "NFKD", "NFKC"].forEach((form) => {
        try {
          if ("test".normalize(form) !== "test") {
            throw new Error("bad normalize");
          }
          ;
        } catch (error) {
          missing.push(form);
        }
      });
      if (missing.length) {
        throw new Error("missing " + missing.join(", "));
      }
      if (String.fromCharCode(233).normalize("NFD") !== String.fromCharCode(101, 769)) {
        throw new Error("broken implementation");
      }
    } catch (error) {
      return error.message;
    }
    return null;
  }
  var _normalizeError = _checkNormalize();
  var LogLevel;
  (function(LogLevel2) {
    LogLevel2["DEBUG"] = "DEBUG";
    LogLevel2["INFO"] = "INFO";
    LogLevel2["WARNING"] = "WARNING";
    LogLevel2["ERROR"] = "ERROR";
    LogLevel2["OFF"] = "OFF";
  })(LogLevel || (LogLevel = {}));
  var ErrorCode;
  (function(ErrorCode2) {
    ErrorCode2["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
    ErrorCode2["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    ErrorCode2["UNSUPPORTED_OPERATION"] = "UNSUPPORTED_OPERATION";
    ErrorCode2["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCode2["SERVER_ERROR"] = "SERVER_ERROR";
    ErrorCode2["TIMEOUT"] = "TIMEOUT";
    ErrorCode2["BUFFER_OVERRUN"] = "BUFFER_OVERRUN";
    ErrorCode2["NUMERIC_FAULT"] = "NUMERIC_FAULT";
    ErrorCode2["MISSING_NEW"] = "MISSING_NEW";
    ErrorCode2["INVALID_ARGUMENT"] = "INVALID_ARGUMENT";
    ErrorCode2["MISSING_ARGUMENT"] = "MISSING_ARGUMENT";
    ErrorCode2["UNEXPECTED_ARGUMENT"] = "UNEXPECTED_ARGUMENT";
    ErrorCode2["CALL_EXCEPTION"] = "CALL_EXCEPTION";
    ErrorCode2["INSUFFICIENT_FUNDS"] = "INSUFFICIENT_FUNDS";
    ErrorCode2["NONCE_EXPIRED"] = "NONCE_EXPIRED";
    ErrorCode2["REPLACEMENT_UNDERPRICED"] = "REPLACEMENT_UNDERPRICED";
    ErrorCode2["UNPREDICTABLE_GAS_LIMIT"] = "UNPREDICTABLE_GAS_LIMIT";
    ErrorCode2["TRANSACTION_REPLACED"] = "TRANSACTION_REPLACED";
    ErrorCode2["ACTION_REJECTED"] = "ACTION_REJECTED";
  })(ErrorCode || (ErrorCode = {}));
  var HEX = "0123456789abcdef";
  var Logger = class _Logger {
    constructor(version11) {
      Object.defineProperty(this, "version", {
        enumerable: true,
        value: version11,
        writable: false
      });
    }
    _log(logLevel, args) {
      const level = logLevel.toLowerCase();
      if (LogLevels[level] == null) {
        this.throwArgumentError("invalid log level name", "logLevel", logLevel);
      }
      if (_logLevel > LogLevels[level]) {
        return;
      }
      console.log.apply(console, args);
    }
    debug(...args) {
      this._log(_Logger.levels.DEBUG, args);
    }
    info(...args) {
      this._log(_Logger.levels.INFO, args);
    }
    warn(...args) {
      this._log(_Logger.levels.WARNING, args);
    }
    makeError(message, code, params) {
      if (_censorErrors) {
        return this.makeError("censored error", code, {});
      }
      if (!code) {
        code = _Logger.errors.UNKNOWN_ERROR;
      }
      if (!params) {
        params = {};
      }
      const messageDetails = [];
      Object.keys(params).forEach((key2) => {
        const value = params[key2];
        try {
          if (value instanceof Uint8Array) {
            let hex = "";
            for (let i = 0; i < value.length; i++) {
              hex += HEX[value[i] >> 4];
              hex += HEX[value[i] & 15];
            }
            messageDetails.push(key2 + "=Uint8Array(0x" + hex + ")");
          } else {
            messageDetails.push(key2 + "=" + JSON.stringify(value));
          }
        } catch (error2) {
          messageDetails.push(key2 + "=" + JSON.stringify(params[key2].toString()));
        }
      });
      messageDetails.push(`code=${code}`);
      messageDetails.push(`version=${this.version}`);
      const reason = message;
      let url = "";
      switch (code) {
        case ErrorCode.NUMERIC_FAULT: {
          url = "NUMERIC_FAULT";
          const fault = message;
          switch (fault) {
            case "overflow":
            case "underflow":
            case "division-by-zero":
              url += "-" + fault;
              break;
            case "negative-power":
            case "negative-width":
              url += "-unsupported";
              break;
            case "unbound-bitwise-result":
              url += "-unbound-result";
              break;
          }
          break;
        }
        case ErrorCode.CALL_EXCEPTION:
        case ErrorCode.INSUFFICIENT_FUNDS:
        case ErrorCode.MISSING_NEW:
        case ErrorCode.NONCE_EXPIRED:
        case ErrorCode.REPLACEMENT_UNDERPRICED:
        case ErrorCode.TRANSACTION_REPLACED:
        case ErrorCode.UNPREDICTABLE_GAS_LIMIT:
          url = code;
          break;
      }
      if (url) {
        message += " [ See: https://links.ethers.org/v5-errors-" + url + " ]";
      }
      if (messageDetails.length) {
        message += " (" + messageDetails.join(", ") + ")";
      }
      const error = new Error(message);
      error.reason = reason;
      error.code = code;
      Object.keys(params).forEach(function(key2) {
        error[key2] = params[key2];
      });
      return error;
    }
    throwError(message, code, params) {
      throw this.makeError(message, code, params);
    }
    throwArgumentError(message, name, value) {
      return this.throwError(message, _Logger.errors.INVALID_ARGUMENT, {
        argument: name,
        value
      });
    }
    assert(condition, message, code, params) {
      if (!!condition) {
        return;
      }
      this.throwError(message, code, params);
    }
    assertArgument(condition, message, name, value) {
      if (!!condition) {
        return;
      }
      this.throwArgumentError(message, name, value);
    }
    checkNormalize(message) {
      if (message == null) {
        message = "platform missing String.prototype.normalize";
      }
      if (_normalizeError) {
        this.throwError("platform missing String.prototype.normalize", _Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "String.prototype.normalize",
          form: _normalizeError
        });
      }
    }
    checkSafeUint53(value, message) {
      if (typeof value !== "number") {
        return;
      }
      if (message == null) {
        message = "value not safe";
      }
      if (value < 0 || value >= 9007199254740991) {
        this.throwError(message, _Logger.errors.NUMERIC_FAULT, {
          operation: "checkSafeInteger",
          fault: "out-of-safe-range",
          value
        });
      }
      if (value % 1) {
        this.throwError(message, _Logger.errors.NUMERIC_FAULT, {
          operation: "checkSafeInteger",
          fault: "non-integer",
          value
        });
      }
    }
    checkArgumentCount(count, expectedCount, message) {
      if (message) {
        message = ": " + message;
      } else {
        message = "";
      }
      if (count < expectedCount) {
        this.throwError("missing argument" + message, _Logger.errors.MISSING_ARGUMENT, {
          count,
          expectedCount
        });
      }
      if (count > expectedCount) {
        this.throwError("too many arguments" + message, _Logger.errors.UNEXPECTED_ARGUMENT, {
          count,
          expectedCount
        });
      }
    }
    checkNew(target, kind) {
      if (target === Object || target == null) {
        this.throwError("missing new", _Logger.errors.MISSING_NEW, { name: kind.name });
      }
    }
    checkAbstract(target, kind) {
      if (target === kind) {
        this.throwError("cannot instantiate abstract class " + JSON.stringify(kind.name) + " directly; use a sub-class", _Logger.errors.UNSUPPORTED_OPERATION, { name: target.name, operation: "new" });
      } else if (target === Object || target == null) {
        this.throwError("missing new", _Logger.errors.MISSING_NEW, { name: kind.name });
      }
    }
    static globalLogger() {
      if (!_globalLogger) {
        _globalLogger = new _Logger(version);
      }
      return _globalLogger;
    }
    static setCensorship(censorship, permanent) {
      if (!censorship && permanent) {
        this.globalLogger().throwError("cannot permanently disable censorship", _Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "setCensorship"
        });
      }
      if (_permanentCensorErrors) {
        if (!censorship) {
          return;
        }
        this.globalLogger().throwError("error censorship permanent", _Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "setCensorship"
        });
      }
      _censorErrors = !!censorship;
      _permanentCensorErrors = !!permanent;
    }
    static setLogLevel(logLevel) {
      const level = LogLevels[logLevel.toLowerCase()];
      if (level == null) {
        _Logger.globalLogger().warn("invalid log level - " + logLevel);
        return;
      }
      _logLevel = level;
    }
    static from(version11) {
      return new _Logger(version11);
    }
  };
  Logger.errors = ErrorCode;
  Logger.levels = LogLevel;

  // node_modules/@ethersproject/bytes/lib.esm/_version.js
  init_buffer_shim_entry();
  var version2 = "bytes/5.8.0";

  // node_modules/@ethersproject/bytes/lib.esm/index.js
  var logger = new Logger(version2);
  function isHexable(value) {
    return !!value.toHexString;
  }
  function addSlice(array) {
    if (array.slice) {
      return array;
    }
    array.slice = function() {
      const args = Array.prototype.slice.call(arguments);
      return addSlice(new Uint8Array(Array.prototype.slice.apply(array, args)));
    };
    return array;
  }
  function isBytesLike(value) {
    return isHexString(value) && !(value.length % 2) || isBytes(value);
  }
  function isInteger(value) {
    return typeof value === "number" && value == value && value % 1 === 0;
  }
  function isBytes(value) {
    if (value == null) {
      return false;
    }
    if (value.constructor === Uint8Array) {
      return true;
    }
    if (typeof value === "string") {
      return false;
    }
    if (!isInteger(value.length) || value.length < 0) {
      return false;
    }
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (!isInteger(v) || v < 0 || v >= 256) {
        return false;
      }
    }
    return true;
  }
  function arrayify(value, options) {
    if (!options) {
      options = {};
    }
    if (typeof value === "number") {
      logger.checkSafeUint53(value, "invalid arrayify value");
      const result = [];
      while (value) {
        result.unshift(value & 255);
        value = parseInt(String(value / 256));
      }
      if (result.length === 0) {
        result.push(0);
      }
      return addSlice(new Uint8Array(result));
    }
    if (options.allowMissingPrefix && typeof value === "string" && value.substring(0, 2) !== "0x") {
      value = "0x" + value;
    }
    if (isHexable(value)) {
      value = value.toHexString();
    }
    if (isHexString(value)) {
      let hex = value.substring(2);
      if (hex.length % 2) {
        if (options.hexPad === "left") {
          hex = "0" + hex;
        } else if (options.hexPad === "right") {
          hex += "0";
        } else {
          logger.throwArgumentError("hex data is odd-length", "value", value);
        }
      }
      const result = [];
      for (let i = 0; i < hex.length; i += 2) {
        result.push(parseInt(hex.substring(i, i + 2), 16));
      }
      return addSlice(new Uint8Array(result));
    }
    if (isBytes(value)) {
      return addSlice(new Uint8Array(value));
    }
    return logger.throwArgumentError("invalid arrayify value", "value", value);
  }
  function concat(items) {
    const objects = items.map((item) => arrayify(item));
    const length = objects.reduce((accum, item) => accum + item.length, 0);
    const result = new Uint8Array(length);
    objects.reduce((offset, object) => {
      result.set(object, offset);
      return offset + object.length;
    }, 0);
    return addSlice(result);
  }
  function stripZeros(value) {
    let result = arrayify(value);
    if (result.length === 0) {
      return result;
    }
    let start = 0;
    while (start < result.length && result[start] === 0) {
      start++;
    }
    if (start) {
      result = result.slice(start);
    }
    return result;
  }
  function zeroPad(value, length) {
    value = arrayify(value);
    if (value.length > length) {
      logger.throwArgumentError("value out of range", "value", arguments[0]);
    }
    const result = new Uint8Array(length);
    result.set(value, length - value.length);
    return addSlice(result);
  }
  function isHexString(value, length) {
    if (typeof value !== "string" || !value.match(/^0x[0-9A-Fa-f]*$/)) {
      return false;
    }
    if (length && value.length !== 2 + 2 * length) {
      return false;
    }
    return true;
  }
  var HexCharacters = "0123456789abcdef";
  function hexlify(value, options) {
    if (!options) {
      options = {};
    }
    if (typeof value === "number") {
      logger.checkSafeUint53(value, "invalid hexlify value");
      let hex = "";
      while (value) {
        hex = HexCharacters[value & 15] + hex;
        value = Math.floor(value / 16);
      }
      if (hex.length) {
        if (hex.length % 2) {
          hex = "0" + hex;
        }
        return "0x" + hex;
      }
      return "0x00";
    }
    if (typeof value === "bigint") {
      value = value.toString(16);
      if (value.length % 2) {
        return "0x0" + value;
      }
      return "0x" + value;
    }
    if (options.allowMissingPrefix && typeof value === "string" && value.substring(0, 2) !== "0x") {
      value = "0x" + value;
    }
    if (isHexable(value)) {
      return value.toHexString();
    }
    if (isHexString(value)) {
      if (value.length % 2) {
        if (options.hexPad === "left") {
          value = "0x0" + value.substring(2);
        } else if (options.hexPad === "right") {
          value += "0";
        } else {
          logger.throwArgumentError("hex data is odd-length", "value", value);
        }
      }
      return value.toLowerCase();
    }
    if (isBytes(value)) {
      let result = "0x";
      for (let i = 0; i < value.length; i++) {
        let v = value[i];
        result += HexCharacters[(v & 240) >> 4] + HexCharacters[v & 15];
      }
      return result;
    }
    return logger.throwArgumentError("invalid hexlify value", "value", value);
  }
  function hexDataLength(data) {
    if (typeof data !== "string") {
      data = hexlify(data);
    } else if (!isHexString(data) || data.length % 2) {
      return null;
    }
    return (data.length - 2) / 2;
  }
  function hexDataSlice(data, offset, endOffset) {
    if (typeof data !== "string") {
      data = hexlify(data);
    } else if (!isHexString(data) || data.length % 2) {
      logger.throwArgumentError("invalid hexData", "value", data);
    }
    offset = 2 + 2 * offset;
    if (endOffset != null) {
      return "0x" + data.substring(offset, 2 + 2 * endOffset);
    }
    return "0x" + data.substring(offset);
  }
  function hexConcat(items) {
    let result = "0x";
    items.forEach((item) => {
      result += hexlify(item).substring(2);
    });
    return result;
  }
  function hexZeroPad(value, length) {
    if (typeof value !== "string") {
      value = hexlify(value);
    } else if (!isHexString(value)) {
      logger.throwArgumentError("invalid hex string", "value", value);
    }
    if (value.length > 2 * length + 2) {
      logger.throwArgumentError("value out of range", "value", arguments[1]);
    }
    while (value.length < 2 * length + 2) {
      value = "0x0" + value.substring(2);
    }
    return value;
  }
  function splitSignature(signature2) {
    const result = {
      r: "0x",
      s: "0x",
      _vs: "0x",
      recoveryParam: 0,
      v: 0,
      yParityAndS: "0x",
      compact: "0x"
    };
    if (isBytesLike(signature2)) {
      let bytes = arrayify(signature2);
      if (bytes.length === 64) {
        result.v = 27 + (bytes[32] >> 7);
        bytes[32] &= 127;
        result.r = hexlify(bytes.slice(0, 32));
        result.s = hexlify(bytes.slice(32, 64));
      } else if (bytes.length === 65) {
        result.r = hexlify(bytes.slice(0, 32));
        result.s = hexlify(bytes.slice(32, 64));
        result.v = bytes[64];
      } else {
        logger.throwArgumentError("invalid signature string", "signature", signature2);
      }
      if (result.v < 27) {
        if (result.v === 0 || result.v === 1) {
          result.v += 27;
        } else {
          logger.throwArgumentError("signature invalid v byte", "signature", signature2);
        }
      }
      result.recoveryParam = 1 - result.v % 2;
      if (result.recoveryParam) {
        bytes[32] |= 128;
      }
      result._vs = hexlify(bytes.slice(32, 64));
    } else {
      result.r = signature2.r;
      result.s = signature2.s;
      result.v = signature2.v;
      result.recoveryParam = signature2.recoveryParam;
      result._vs = signature2._vs;
      if (result._vs != null) {
        const vs2 = zeroPad(arrayify(result._vs), 32);
        result._vs = hexlify(vs2);
        const recoveryParam = vs2[0] >= 128 ? 1 : 0;
        if (result.recoveryParam == null) {
          result.recoveryParam = recoveryParam;
        } else if (result.recoveryParam !== recoveryParam) {
          logger.throwArgumentError("signature recoveryParam mismatch _vs", "signature", signature2);
        }
        vs2[0] &= 127;
        const s = hexlify(vs2);
        if (result.s == null) {
          result.s = s;
        } else if (result.s !== s) {
          logger.throwArgumentError("signature v mismatch _vs", "signature", signature2);
        }
      }
      if (result.recoveryParam == null) {
        if (result.v == null) {
          logger.throwArgumentError("signature missing v and recoveryParam", "signature", signature2);
        } else if (result.v === 0 || result.v === 1) {
          result.recoveryParam = result.v;
        } else {
          result.recoveryParam = 1 - result.v % 2;
        }
      } else {
        if (result.v == null) {
          result.v = 27 + result.recoveryParam;
        } else {
          const recId = result.v === 0 || result.v === 1 ? result.v : 1 - result.v % 2;
          if (result.recoveryParam !== recId) {
            logger.throwArgumentError("signature recoveryParam mismatch v", "signature", signature2);
          }
        }
      }
      if (result.r == null || !isHexString(result.r)) {
        logger.throwArgumentError("signature missing or invalid r", "signature", signature2);
      } else {
        result.r = hexZeroPad(result.r, 32);
      }
      if (result.s == null || !isHexString(result.s)) {
        logger.throwArgumentError("signature missing or invalid s", "signature", signature2);
      } else {
        result.s = hexZeroPad(result.s, 32);
      }
      const vs = arrayify(result.s);
      if (vs[0] >= 128) {
        logger.throwArgumentError("signature s out of range", "signature", signature2);
      }
      if (result.recoveryParam) {
        vs[0] |= 128;
      }
      const _vs = hexlify(vs);
      if (result._vs) {
        if (!isHexString(result._vs)) {
          logger.throwArgumentError("signature invalid _vs", "signature", signature2);
        }
        result._vs = hexZeroPad(result._vs, 32);
      }
      if (result._vs == null) {
        result._vs = _vs;
      } else if (result._vs !== _vs) {
        logger.throwArgumentError("signature _vs mismatch v and s", "signature", signature2);
      }
    }
    result.yParityAndS = result._vs;
    result.compact = result.r + result.yParityAndS.substring(2);
    return result;
  }

  // node_modules/@ethersproject/bignumber/lib.esm/_version.js
  init_buffer_shim_entry();
  var version3 = "bignumber/5.8.0";

  // node_modules/@ethersproject/bignumber/lib.esm/bignumber.js
  var BN = import_bn.default.BN;
  var logger2 = new Logger(version3);
  var _constructorGuard = {};
  var MAX_SAFE = 9007199254740991;
  var _warnedToStringRadix = false;
  var BigNumber2 = class _BigNumber {
    constructor(constructorGuard, hex) {
      if (constructorGuard !== _constructorGuard) {
        logger2.throwError("cannot call constructor directly; use BigNumber.from", Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "new (BigNumber)"
        });
      }
      this._hex = hex;
      this._isBigNumber = true;
      Object.freeze(this);
    }
    fromTwos(value) {
      return toBigNumber(toBN(this).fromTwos(value));
    }
    toTwos(value) {
      return toBigNumber(toBN(this).toTwos(value));
    }
    abs() {
      if (this._hex[0] === "-") {
        return _BigNumber.from(this._hex.substring(1));
      }
      return this;
    }
    add(other) {
      return toBigNumber(toBN(this).add(toBN(other)));
    }
    sub(other) {
      return toBigNumber(toBN(this).sub(toBN(other)));
    }
    div(other) {
      const o = _BigNumber.from(other);
      if (o.isZero()) {
        throwFault("division-by-zero", "div");
      }
      return toBigNumber(toBN(this).div(toBN(other)));
    }
    mul(other) {
      return toBigNumber(toBN(this).mul(toBN(other)));
    }
    mod(other) {
      const value = toBN(other);
      if (value.isNeg()) {
        throwFault("division-by-zero", "mod");
      }
      return toBigNumber(toBN(this).umod(value));
    }
    pow(other) {
      const value = toBN(other);
      if (value.isNeg()) {
        throwFault("negative-power", "pow");
      }
      return toBigNumber(toBN(this).pow(value));
    }
    and(other) {
      const value = toBN(other);
      if (this.isNegative() || value.isNeg()) {
        throwFault("unbound-bitwise-result", "and");
      }
      return toBigNumber(toBN(this).and(value));
    }
    or(other) {
      const value = toBN(other);
      if (this.isNegative() || value.isNeg()) {
        throwFault("unbound-bitwise-result", "or");
      }
      return toBigNumber(toBN(this).or(value));
    }
    xor(other) {
      const value = toBN(other);
      if (this.isNegative() || value.isNeg()) {
        throwFault("unbound-bitwise-result", "xor");
      }
      return toBigNumber(toBN(this).xor(value));
    }
    mask(value) {
      if (this.isNegative() || value < 0) {
        throwFault("negative-width", "mask");
      }
      return toBigNumber(toBN(this).maskn(value));
    }
    shl(value) {
      if (this.isNegative() || value < 0) {
        throwFault("negative-width", "shl");
      }
      return toBigNumber(toBN(this).shln(value));
    }
    shr(value) {
      if (this.isNegative() || value < 0) {
        throwFault("negative-width", "shr");
      }
      return toBigNumber(toBN(this).shrn(value));
    }
    eq(other) {
      return toBN(this).eq(toBN(other));
    }
    lt(other) {
      return toBN(this).lt(toBN(other));
    }
    lte(other) {
      return toBN(this).lte(toBN(other));
    }
    gt(other) {
      return toBN(this).gt(toBN(other));
    }
    gte(other) {
      return toBN(this).gte(toBN(other));
    }
    isNegative() {
      return this._hex[0] === "-";
    }
    isZero() {
      return toBN(this).isZero();
    }
    toNumber() {
      try {
        return toBN(this).toNumber();
      } catch (error) {
        throwFault("overflow", "toNumber", this.toString());
      }
      return null;
    }
    toBigInt() {
      try {
        return BigInt(this.toString());
      } catch (e) {
      }
      return logger2.throwError("this platform does not support BigInt", Logger.errors.UNSUPPORTED_OPERATION, {
        value: this.toString()
      });
    }
    toString() {
      if (arguments.length > 0) {
        if (arguments[0] === 10) {
          if (!_warnedToStringRadix) {
            _warnedToStringRadix = true;
            logger2.warn("BigNumber.toString does not accept any parameters; base-10 is assumed");
          }
        } else if (arguments[0] === 16) {
          logger2.throwError("BigNumber.toString does not accept any parameters; use bigNumber.toHexString()", Logger.errors.UNEXPECTED_ARGUMENT, {});
        } else {
          logger2.throwError("BigNumber.toString does not accept parameters", Logger.errors.UNEXPECTED_ARGUMENT, {});
        }
      }
      return toBN(this).toString(10);
    }
    toHexString() {
      return this._hex;
    }
    toJSON(key2) {
      return { type: "BigNumber", hex: this.toHexString() };
    }
    static from(value) {
      if (value instanceof _BigNumber) {
        return value;
      }
      if (typeof value === "string") {
        if (value.match(/^-?0x[0-9a-f]+$/i)) {
          return new _BigNumber(_constructorGuard, toHex(value));
        }
        if (value.match(/^-?[0-9]+$/)) {
          return new _BigNumber(_constructorGuard, toHex(new BN(value)));
        }
        return logger2.throwArgumentError("invalid BigNumber string", "value", value);
      }
      if (typeof value === "number") {
        if (value % 1) {
          throwFault("underflow", "BigNumber.from", value);
        }
        if (value >= MAX_SAFE || value <= -MAX_SAFE) {
          throwFault("overflow", "BigNumber.from", value);
        }
        return _BigNumber.from(String(value));
      }
      const anyValue = value;
      if (typeof anyValue === "bigint") {
        return _BigNumber.from(anyValue.toString());
      }
      if (isBytes(anyValue)) {
        return _BigNumber.from(hexlify(anyValue));
      }
      if (anyValue) {
        if (anyValue.toHexString) {
          const hex = anyValue.toHexString();
          if (typeof hex === "string") {
            return _BigNumber.from(hex);
          }
        } else {
          let hex = anyValue._hex;
          if (hex == null && anyValue.type === "BigNumber") {
            hex = anyValue.hex;
          }
          if (typeof hex === "string") {
            if (isHexString(hex) || hex[0] === "-" && isHexString(hex.substring(1))) {
              return _BigNumber.from(hex);
            }
          }
        }
      }
      return logger2.throwArgumentError("invalid BigNumber value", "value", value);
    }
    static isBigNumber(value) {
      return !!(value && value._isBigNumber);
    }
  };
  function toHex(value) {
    if (typeof value !== "string") {
      return toHex(value.toString(16));
    }
    if (value[0] === "-") {
      value = value.substring(1);
      if (value[0] === "-") {
        logger2.throwArgumentError("invalid hex", "value", value);
      }
      value = toHex(value);
      if (value === "0x00") {
        return value;
      }
      return "-" + value;
    }
    if (value.substring(0, 2) !== "0x") {
      value = "0x" + value;
    }
    if (value === "0x") {
      return "0x00";
    }
    if (value.length % 2) {
      value = "0x0" + value.substring(2);
    }
    while (value.length > 4 && value.substring(0, 4) === "0x00") {
      value = "0x" + value.substring(4);
    }
    return value;
  }
  function toBigNumber(value) {
    return BigNumber2.from(toHex(value));
  }
  function toBN(value) {
    const hex = BigNumber2.from(value).toHexString();
    if (hex[0] === "-") {
      return new BN("-" + hex.substring(3), 16);
    }
    return new BN(hex.substring(2), 16);
  }
  function throwFault(fault, operation, value) {
    const params = { fault, operation };
    if (value != null) {
      params.value = value;
    }
    return logger2.throwError(fault, Logger.errors.NUMERIC_FAULT, params);
  }
  function _base36To16(value) {
    return new BN(value, 36).toString(16);
  }

  // node_modules/@ethersproject/constants/lib.esm/bignumbers.js
  var NegativeOne = /* @__PURE__ */ BigNumber2.from(-1);
  var Zero = /* @__PURE__ */ BigNumber2.from(0);
  var One = /* @__PURE__ */ BigNumber2.from(1);
  var MaxUint256 = /* @__PURE__ */ BigNumber2.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  // node_modules/@ethersproject/hash/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/hash/lib.esm/id.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/keccak256/lib.esm/index.js
  init_buffer_shim_entry();
  var import_js_sha3 = __toESM(require_sha3());
  function keccak256(data) {
    return "0x" + import_js_sha3.default.keccak_256(arrayify(data));
  }

  // node_modules/@ethersproject/strings/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/strings/lib.esm/utf8.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/strings/lib.esm/_version.js
  init_buffer_shim_entry();
  var version4 = "strings/5.8.0";

  // node_modules/@ethersproject/strings/lib.esm/utf8.js
  var logger3 = new Logger(version4);
  var UnicodeNormalizationForm;
  (function(UnicodeNormalizationForm2) {
    UnicodeNormalizationForm2["current"] = "";
    UnicodeNormalizationForm2["NFC"] = "NFC";
    UnicodeNormalizationForm2["NFD"] = "NFD";
    UnicodeNormalizationForm2["NFKC"] = "NFKC";
    UnicodeNormalizationForm2["NFKD"] = "NFKD";
  })(UnicodeNormalizationForm || (UnicodeNormalizationForm = {}));
  var Utf8ErrorReason;
  (function(Utf8ErrorReason2) {
    Utf8ErrorReason2["UNEXPECTED_CONTINUE"] = "unexpected continuation byte";
    Utf8ErrorReason2["BAD_PREFIX"] = "bad codepoint prefix";
    Utf8ErrorReason2["OVERRUN"] = "string overrun";
    Utf8ErrorReason2["MISSING_CONTINUE"] = "missing continuation byte";
    Utf8ErrorReason2["OUT_OF_RANGE"] = "out of UTF-8 range";
    Utf8ErrorReason2["UTF16_SURROGATE"] = "UTF-16 surrogate";
    Utf8ErrorReason2["OVERLONG"] = "overlong representation";
  })(Utf8ErrorReason || (Utf8ErrorReason = {}));
  function errorFunc(reason, offset, bytes, output, badCodepoint) {
    return logger3.throwArgumentError(`invalid codepoint at offset ${offset}; ${reason}`, "bytes", bytes);
  }
  function ignoreFunc(reason, offset, bytes, output, badCodepoint) {
    if (reason === Utf8ErrorReason.BAD_PREFIX || reason === Utf8ErrorReason.UNEXPECTED_CONTINUE) {
      let i = 0;
      for (let o = offset + 1; o < bytes.length; o++) {
        if (bytes[o] >> 6 !== 2) {
          break;
        }
        i++;
      }
      return i;
    }
    if (reason === Utf8ErrorReason.OVERRUN) {
      return bytes.length - offset - 1;
    }
    return 0;
  }
  function replaceFunc(reason, offset, bytes, output, badCodepoint) {
    if (reason === Utf8ErrorReason.OVERLONG) {
      output.push(badCodepoint);
      return 0;
    }
    output.push(65533);
    return ignoreFunc(reason, offset, bytes, output, badCodepoint);
  }
  var Utf8ErrorFuncs = Object.freeze({
    error: errorFunc,
    ignore: ignoreFunc,
    replace: replaceFunc
  });
  function getUtf8CodePoints(bytes, onError) {
    if (onError == null) {
      onError = Utf8ErrorFuncs.error;
    }
    bytes = arrayify(bytes);
    const result = [];
    let i = 0;
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c >> 7 === 0) {
        result.push(c);
        continue;
      }
      let extraLength = null;
      let overlongMask = null;
      if ((c & 224) === 192) {
        extraLength = 1;
        overlongMask = 127;
      } else if ((c & 240) === 224) {
        extraLength = 2;
        overlongMask = 2047;
      } else if ((c & 248) === 240) {
        extraLength = 3;
        overlongMask = 65535;
      } else {
        if ((c & 192) === 128) {
          i += onError(Utf8ErrorReason.UNEXPECTED_CONTINUE, i - 1, bytes, result);
        } else {
          i += onError(Utf8ErrorReason.BAD_PREFIX, i - 1, bytes, result);
        }
        continue;
      }
      if (i - 1 + extraLength >= bytes.length) {
        i += onError(Utf8ErrorReason.OVERRUN, i - 1, bytes, result);
        continue;
      }
      let res = c & (1 << 8 - extraLength - 1) - 1;
      for (let j = 0; j < extraLength; j++) {
        let nextChar = bytes[i];
        if ((nextChar & 192) != 128) {
          i += onError(Utf8ErrorReason.MISSING_CONTINUE, i, bytes, result);
          res = null;
          break;
        }
        ;
        res = res << 6 | nextChar & 63;
        i++;
      }
      if (res === null) {
        continue;
      }
      if (res > 1114111) {
        i += onError(Utf8ErrorReason.OUT_OF_RANGE, i - 1 - extraLength, bytes, result, res);
        continue;
      }
      if (res >= 55296 && res <= 57343) {
        i += onError(Utf8ErrorReason.UTF16_SURROGATE, i - 1 - extraLength, bytes, result, res);
        continue;
      }
      if (res <= overlongMask) {
        i += onError(Utf8ErrorReason.OVERLONG, i - 1 - extraLength, bytes, result, res);
        continue;
      }
      result.push(res);
    }
    return result;
  }
  function toUtf8Bytes(str, form = UnicodeNormalizationForm.current) {
    if (form != UnicodeNormalizationForm.current) {
      logger3.checkNormalize();
      str = str.normalize(form);
    }
    let result = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 128) {
        result.push(c);
      } else if (c < 2048) {
        result.push(c >> 6 | 192);
        result.push(c & 63 | 128);
      } else if ((c & 64512) == 55296) {
        i++;
        const c2 = str.charCodeAt(i);
        if (i >= str.length || (c2 & 64512) !== 56320) {
          throw new Error("invalid utf-8 string");
        }
        const pair = 65536 + ((c & 1023) << 10) + (c2 & 1023);
        result.push(pair >> 18 | 240);
        result.push(pair >> 12 & 63 | 128);
        result.push(pair >> 6 & 63 | 128);
        result.push(pair & 63 | 128);
      } else {
        result.push(c >> 12 | 224);
        result.push(c >> 6 & 63 | 128);
        result.push(c & 63 | 128);
      }
    }
    return arrayify(result);
  }
  function _toUtf8String(codePoints) {
    return codePoints.map((codePoint) => {
      if (codePoint <= 65535) {
        return String.fromCharCode(codePoint);
      }
      codePoint -= 65536;
      return String.fromCharCode((codePoint >> 10 & 1023) + 55296, (codePoint & 1023) + 56320);
    }).join("");
  }
  function toUtf8String(bytes, onError) {
    return _toUtf8String(getUtf8CodePoints(bytes, onError));
  }

  // node_modules/@ethersproject/hash/lib.esm/id.js
  function id2(text) {
    return keccak256(toUtf8Bytes(text));
  }

  // node_modules/@ethersproject/address/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/rlp/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/rlp/lib.esm/_version.js
  init_buffer_shim_entry();
  var version5 = "rlp/5.8.0";

  // node_modules/@ethersproject/rlp/lib.esm/index.js
  var logger4 = new Logger(version5);
  function arrayifyInteger(value) {
    const result = [];
    while (value) {
      result.unshift(value & 255);
      value >>= 8;
    }
    return result;
  }
  function unarrayifyInteger(data, offset, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
      result = result * 256 + data[offset + i];
    }
    return result;
  }
  function _encode(object) {
    if (Array.isArray(object)) {
      let payload = [];
      object.forEach(function(child) {
        payload = payload.concat(_encode(child));
      });
      if (payload.length <= 55) {
        payload.unshift(192 + payload.length);
        return payload;
      }
      const length2 = arrayifyInteger(payload.length);
      length2.unshift(247 + length2.length);
      return length2.concat(payload);
    }
    if (!isBytesLike(object)) {
      logger4.throwArgumentError("RLP object must be BytesLike", "object", object);
    }
    const data = Array.prototype.slice.call(arrayify(object));
    if (data.length === 1 && data[0] <= 127) {
      return data;
    } else if (data.length <= 55) {
      data.unshift(128 + data.length);
      return data;
    }
    const length = arrayifyInteger(data.length);
    length.unshift(183 + length.length);
    return length.concat(data);
  }
  function encode3(object) {
    return hexlify(_encode(object));
  }
  function _decodeChildren(data, offset, childOffset, length) {
    const result = [];
    while (childOffset < offset + 1 + length) {
      const decoded = _decode(data, childOffset);
      result.push(decoded.result);
      childOffset += decoded.consumed;
      if (childOffset > offset + 1 + length) {
        logger4.throwError("child data too short", Logger.errors.BUFFER_OVERRUN, {});
      }
    }
    return { consumed: 1 + length, result };
  }
  function _decode(data, offset) {
    if (data.length === 0) {
      logger4.throwError("data too short", Logger.errors.BUFFER_OVERRUN, {});
    }
    if (data[offset] >= 248) {
      const lengthLength = data[offset] - 247;
      if (offset + 1 + lengthLength > data.length) {
        logger4.throwError("data short segment too short", Logger.errors.BUFFER_OVERRUN, {});
      }
      const length = unarrayifyInteger(data, offset + 1, lengthLength);
      if (offset + 1 + lengthLength + length > data.length) {
        logger4.throwError("data long segment too short", Logger.errors.BUFFER_OVERRUN, {});
      }
      return _decodeChildren(data, offset, offset + 1 + lengthLength, lengthLength + length);
    } else if (data[offset] >= 192) {
      const length = data[offset] - 192;
      if (offset + 1 + length > data.length) {
        logger4.throwError("data array too short", Logger.errors.BUFFER_OVERRUN, {});
      }
      return _decodeChildren(data, offset, offset + 1, length);
    } else if (data[offset] >= 184) {
      const lengthLength = data[offset] - 183;
      if (offset + 1 + lengthLength > data.length) {
        logger4.throwError("data array too short", Logger.errors.BUFFER_OVERRUN, {});
      }
      const length = unarrayifyInteger(data, offset + 1, lengthLength);
      if (offset + 1 + lengthLength + length > data.length) {
        logger4.throwError("data array too short", Logger.errors.BUFFER_OVERRUN, {});
      }
      const result = hexlify(data.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length));
      return { consumed: 1 + lengthLength + length, result };
    } else if (data[offset] >= 128) {
      const length = data[offset] - 128;
      if (offset + 1 + length > data.length) {
        logger4.throwError("data too short", Logger.errors.BUFFER_OVERRUN, {});
      }
      const result = hexlify(data.slice(offset + 1, offset + 1 + length));
      return { consumed: 1 + length, result };
    }
    return { consumed: 1, result: hexlify(data[offset]) };
  }
  function decode(data) {
    const bytes = arrayify(data);
    const decoded = _decode(bytes, 0);
    if (decoded.consumed !== bytes.length) {
      logger4.throwArgumentError("invalid rlp data", "data", data);
    }
    return decoded.result;
  }

  // node_modules/@ethersproject/address/lib.esm/_version.js
  init_buffer_shim_entry();
  var version6 = "address/5.8.0";

  // node_modules/@ethersproject/address/lib.esm/index.js
  var logger5 = new Logger(version6);
  function getChecksumAddress(address) {
    if (!isHexString(address, 20)) {
      logger5.throwArgumentError("invalid address", "address", address);
    }
    address = address.toLowerCase();
    const chars = address.substring(2).split("");
    const expanded = new Uint8Array(40);
    for (let i = 0; i < 40; i++) {
      expanded[i] = chars[i].charCodeAt(0);
    }
    const hashed = arrayify(keccak256(expanded));
    for (let i = 0; i < 40; i += 2) {
      if (hashed[i >> 1] >> 4 >= 8) {
        chars[i] = chars[i].toUpperCase();
      }
      if ((hashed[i >> 1] & 15) >= 8) {
        chars[i + 1] = chars[i + 1].toUpperCase();
      }
    }
    return "0x" + chars.join("");
  }
  var MAX_SAFE_INTEGER2 = 9007199254740991;
  function log10(x) {
    if (Math.log10) {
      return Math.log10(x);
    }
    return Math.log(x) / Math.LN10;
  }
  var ibanLookup = {};
  for (let i = 0; i < 10; i++) {
    ibanLookup[String(i)] = String(i);
  }
  for (let i = 0; i < 26; i++) {
    ibanLookup[String.fromCharCode(65 + i)] = String(10 + i);
  }
  var safeDigits = Math.floor(log10(MAX_SAFE_INTEGER2));
  function ibanChecksum(address) {
    address = address.toUpperCase();
    address = address.substring(4) + address.substring(0, 2) + "00";
    let expanded = address.split("").map((c) => {
      return ibanLookup[c];
    }).join("");
    while (expanded.length >= safeDigits) {
      let block = expanded.substring(0, safeDigits);
      expanded = parseInt(block, 10) % 97 + expanded.substring(block.length);
    }
    let checksum = String(98 - parseInt(expanded, 10) % 97);
    while (checksum.length < 2) {
      checksum = "0" + checksum;
    }
    return checksum;
  }
  function getAddress(address) {
    let result = null;
    if (typeof address !== "string") {
      logger5.throwArgumentError("invalid address", "address", address);
    }
    if (address.match(/^(0x)?[0-9a-fA-F]{40}$/)) {
      if (address.substring(0, 2) !== "0x") {
        address = "0x" + address;
      }
      result = getChecksumAddress(address);
      if (address.match(/([A-F].*[a-f])|([a-f].*[A-F])/) && result !== address) {
        logger5.throwArgumentError("bad address checksum", "address", address);
      }
    } else if (address.match(/^XE[0-9]{2}[0-9A-Za-z]{30,31}$/)) {
      if (address.substring(2, 4) !== ibanChecksum(address)) {
        logger5.throwArgumentError("bad icap checksum", "address", address);
      }
      result = _base36To16(address.substring(4));
      while (result.length < 40) {
        result = "0" + result;
      }
      result = getChecksumAddress("0x" + result);
    } else {
      logger5.throwArgumentError("invalid address", "address", address);
    }
    return result;
  }

  // node_modules/@ethersproject/properties/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/properties/lib.esm/_version.js
  init_buffer_shim_entry();
  var version7 = "properties/5.8.0";

  // node_modules/@ethersproject/properties/lib.esm/index.js
  var logger6 = new Logger(version7);
  function defineReadOnly(object, name, value) {
    Object.defineProperty(object, name, {
      enumerable: true,
      value,
      writable: false
    });
  }
  function getStatic(ctor, key2) {
    for (let i = 0; i < 32; i++) {
      if (ctor[key2]) {
        return ctor[key2];
      }
      if (!ctor.prototype || typeof ctor.prototype !== "object") {
        break;
      }
      ctor = Object.getPrototypeOf(ctor.prototype).constructor;
    }
    return null;
  }
  var opaque = { bigint: true, boolean: true, "function": true, number: true, string: true };
  function _isFrozen(object) {
    if (object === void 0 || object === null || opaque[typeof object]) {
      return true;
    }
    if (Array.isArray(object) || typeof object === "object") {
      if (!Object.isFrozen(object)) {
        return false;
      }
      const keys = Object.keys(object);
      for (let i = 0; i < keys.length; i++) {
        let value = null;
        try {
          value = object[keys[i]];
        } catch (error) {
          continue;
        }
        if (!_isFrozen(value)) {
          return false;
        }
      }
      return true;
    }
    return logger6.throwArgumentError(`Cannot deepCopy ${typeof object}`, "object", object);
  }
  function _deepCopy(object) {
    if (_isFrozen(object)) {
      return object;
    }
    if (Array.isArray(object)) {
      return Object.freeze(object.map((item) => deepCopy(item)));
    }
    if (typeof object === "object") {
      const result = {};
      for (const key2 in object) {
        const value = object[key2];
        if (value === void 0) {
          continue;
        }
        defineReadOnly(result, key2, deepCopy(value));
      }
      return result;
    }
    return logger6.throwArgumentError(`Cannot deepCopy ${typeof object}`, "object", object);
  }
  function deepCopy(object) {
    return _deepCopy(object);
  }
  var Description = class {
    constructor(info) {
      for (const key2 in info) {
        this[key2] = deepCopy(info[key2]);
      }
    }
  };

  // node_modules/@ledgerhq/evm-tools/lib-es/message/EIP712/index.js
  var sortObjectAlphabetically = (obj) => {
    const keys = Object.keys(obj).sort();
    return keys.reduce((acc, curr) => {
      const value = (() => {
        if (Array.isArray(obj[curr])) {
          return obj[curr].map((field) => sortObjectAlphabetically(field));
        }
        return obj[curr];
      })();
      acc[curr] = value;
      return acc;
    }, {});
  };
  var getSchemaHashForMessage = (message) => {
    const { types } = message;
    const sortedTypes = sortObjectAlphabetically(types);
    return (0, import_sha224.default)(JSON.stringify(sortedTypes).replace(" ", "")).toString();
  };
  var getFiltersForMessage = async (message, shouldUseV1Filters, calServiceURL, staticEIP712SignaturesV1, staticEIP712SignaturesV2) => {
    const schemaHash = getSchemaHashForMessage(message);
    const verifyingContract = message.domain?.verifyingContract?.toLowerCase() || AddressZero;
    try {
      if (calServiceURL) {
        const { data } = await axios_default.get(`${calServiceURL}/v1/dapps`, {
          params: {
            output: "eip712_signatures",
            eip712_signatures_version: shouldUseV1Filters ? "v1" : "v2",
            chain_id: message.domain?.chainId,
            contracts: verifyingContract
          }
        });
        const targetObject = data.find((item) => item?.eip712_signatures?.[verifyingContract]?.[schemaHash]);
        const filters = targetObject?.eip712_signatures?.[verifyingContract]?.[schemaHash];
        if (!filters) {
          throw new Error("Fallback to static file");
        }
        return filters;
      }
      throw new Error("No CAL service URL");
    } catch {
      const messageId = `${message.domain?.chainId ?? 0}:${verifyingContract}:${schemaHash}`;
      if (shouldUseV1Filters && staticEIP712SignaturesV1) {
        return staticEIP712SignaturesV1[messageId];
      }
      if (!shouldUseV1Filters && staticEIP712SignaturesV2) {
        return staticEIP712SignaturesV2[messageId];
      }
      return void 0;
    }
  };
  var getValue = (path, value) => {
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.map((v) => getValue(path, v)).flat();
      }
      if (!(path in value)) {
        throw new Error(`Could not find key ${path} in ${JSON.stringify(value)} `);
      }
      const result = value[path];
      return typeof result === "object" ? result : result.toString();
    }
    return value.toString();
  };
  var getValueFromPath = (path, eip721Message) => {
    const splittedPath = path.split(".");
    const { message } = eip721Message;
    let value = message;
    for (let i = 0; i <= splittedPath.length - 1; i++) {
      const subPath = splittedPath[i];
      const isLastElement = i >= splittedPath.length - 1;
      if (subPath === "[]" && !isLastElement)
        continue;
      value = getValue(subPath, value);
    }
    if (value === message) {
      throw new Error("getValueFromPath returned the whole original message");
    }
    return value;
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/erc20.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/loadConfig.js
  init_buffer_shim_entry();
  var defaultLoadConfig = {
    nftExplorerBaseURL: "https://nft.api.live.ledger.com/v1/ethereum",
    pluginBaseURL: "https://cdn.live.ledger.com",
    extraPlugins: null,
    cryptoassetsBaseURL: "https://cdn.live.ledger.com/cryptoassets",
    calServiceURL: "https://crypto-assets-service.api.ledger.com",
    staticERC20Signatures: null,
    staticEIP712SignaturesV1: null,
    staticEIP712SignaturesV2: null
  };
  function getLoadConfig(userLoadConfig) {
    return {
      ...defaultLoadConfig,
      ...userLoadConfig
    };
  }

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/erc20.js
  var asContractAddress = (addr) => {
    const a = addr.toLowerCase();
    return a.startsWith("0x") ? a : "0x" + a;
  };
  var findERC20SignaturesInfo = async (userLoadConfig, chainId) => {
    const { cryptoassetsBaseURL } = getLoadConfig(userLoadConfig);
    if (!cryptoassetsBaseURL)
      return null;
    const url = `${cryptoassetsBaseURL}/evm/${chainId}/erc20-signatures.json`;
    const blob = await axios_default.get(url).then(({ data }) => {
      if (!data || typeof data !== "string") {
        throw new Error(`ERC20 signatures for chainId ${chainId} file is malformed ${url}`);
      }
      return data;
    }).catch((e) => {
      log("error", "could not fetch from " + url + ": " + String(e));
      return null;
    });
    return blob;
  };
  var byContractAddressAndChainId = (contract, chainId, erc20SignaturesBlob, userLoadConfig) => {
    if (erc20SignaturesBlob) {
      try {
        return parse(erc20SignaturesBlob).byContractAndChainId(asContractAddress(contract), chainId);
      } catch {
      }
    }
    const loadConfig = userLoadConfig ? getLoadConfig(userLoadConfig) : null;
    if (loadConfig?.staticERC20Signatures?.[chainId]) {
      try {
        return parse(loadConfig.staticERC20Signatures[chainId]).byContractAndChainId(asContractAddress(contract), chainId);
      } catch (e) {
        log("error", `Failed to parse static ERC20 signatures for chainId ${chainId}: ${String(e)}`);
      }
    }
    return null;
  };
  var parse = (erc20SignaturesBlob) => {
    const buf = import_buffer.Buffer.from(erc20SignaturesBlob, "base64");
    const map = {};
    const entries = [];
    let i = 0;
    while (i < buf.length) {
      const length = buf.readUInt32BE(i);
      i += 4;
      const item = buf.slice(i, i + length);
      let j = 0;
      const tickerLength = item.readUInt8(j);
      j += 1;
      const ticker = item.slice(j, j + tickerLength).toString("ascii");
      j += tickerLength;
      const contractAddress = asContractAddress(item.slice(j, j + 20).toString("hex"));
      j += 20;
      const decimals = item.readUInt32BE(j);
      j += 4;
      const chainId = item.readUInt32BE(j);
      j += 4;
      const signature2 = item.slice(j);
      const entry = {
        ticker,
        contractAddress,
        decimals,
        chainId,
        signature: signature2,
        data: item
      };
      entries.push(entry);
      map[String(chainId) + ":" + contractAddress] = entry;
      i += length;
    }
    return {
      list: () => entries,
      byContractAndChainId: (contractAddress, chainId) => map[String(chainId) + ":" + contractAddress]
    };
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/utils.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/evm-tools/lib-es/selectors/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/evm-tools/lib-es/selectors/dappSelectors.js
  init_buffer_shim_entry();
  var ARBITRUM_CLEAR_SIGNED_SELECTORS;
  (function(ARBITRUM_CLEAR_SIGNED_SELECTORS2) {
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x0b86a4c1"] = "swapOnUniswapV2Fork";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x2521b930"] = "uniswapV3SwapToWithPermit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x259f8d1a"] = "withdraw";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x2e95b6c8"] = "unoswap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x4cc4a27b"] = "fillOrderRFQToWithPermit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x4d447995"] = "deposit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x617ba037"] = "supply";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x65ae14b5"] = "deleverageWithdraw";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x69328dec"] = "withdraw";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x6e553f65"] = "deposit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x7c025200"] = "swap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xa1251d75"] = "unoswapWithPermit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xa2922622"] = "withdrawWithSymbolCheck";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xaa2daba6"] = "depositWithSymbolCheck";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xb460af94"] = "withdraw";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xbc80f1a8"] = "uniswapV3SwapTo";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xd0a3b665"] = "fillOrderRFQ";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xe449022e"] = "uniswapV3Swap";
    ARBITRUM_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
  })(ARBITRUM_CLEAR_SIGNED_SELECTORS || (ARBITRUM_CLEAR_SIGNED_SELECTORS = {}));
  var AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS;
  (function(AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2) {
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x0d10d32c"] = "redeemOverdueShares";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x0f7e2048"] = "redeemOverdueShares";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x5bcb2fc6"] = "submit";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x617ba037"] = "supply";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x69328dec"] = "withdraw";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0xbe040fb0"] = "redeem";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0xc9d2ff9d"] = "requestUnlock";
    AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS2["0xdb006a75"] = "redeem";
  })(AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS || (AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS = {}));
  var BASE_CLEAR_SIGNED_SELECTORS;
  (function(BASE_CLEAR_SIGNED_SELECTORS2) {
    BASE_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    BASE_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x095ea7b3"] = "approve";
    BASE_CLEAR_SIGNED_SELECTORS2["0x0b86a4c1"] = "swapOnUniswapV2Fork";
    BASE_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    BASE_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x20b76e81"] = "repay";
    BASE_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    BASE_CLEAR_SIGNED_SELECTORS2["0x238d6579"] = "supplyCollateral";
    BASE_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    BASE_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    BASE_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    BASE_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x50d8cd4b"] = "borrow";
    BASE_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x5c2bea49"] = "withdraw";
    BASE_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    BASE_CLEAR_SIGNED_SELECTORS2["0x6e553f65"] = "deposit";
    BASE_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    BASE_CLEAR_SIGNED_SELECTORS2["0x8069218f"] = "setAuthorizationWithSig";
    BASE_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    BASE_CLEAR_SIGNED_SELECTORS2["0x833947fd"] = "reallocateTo";
    BASE_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x8720316d"] = "withdrawCollateral";
    BASE_CLEAR_SIGNED_SELECTORS2["0x8c1358a2"] = "createMarket";
    BASE_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    BASE_CLEAR_SIGNED_SELECTORS2["0x94bf804d"] = "mint";
    BASE_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    BASE_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    BASE_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    BASE_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    BASE_CLEAR_SIGNED_SELECTORS2["0xa99aad89"] = "supply";
    BASE_CLEAR_SIGNED_SELECTORS2["0xb460af94"] = "withdraw";
    BASE_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    BASE_CLEAR_SIGNED_SELECTORS2["0xba087652"] = "redeem";
    BASE_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    BASE_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
    BASE_CLEAR_SIGNED_SELECTORS2["0xe0232b42"] = "flashLoan";
    BASE_CLEAR_SIGNED_SELECTORS2["0xeecea000"] = "setAuthorization";
    BASE_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
  })(BASE_CLEAR_SIGNED_SELECTORS || (BASE_CLEAR_SIGNED_SELECTORS = {}));
  var BSC_CLEAR_SIGNED_SELECTORS;
  (function(BSC_CLEAR_SIGNED_SELECTORS2) {
    BSC_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    BSC_CLEAR_SIGNED_SELECTORS2["0x0863b7ac"] = "SwapOnUniswapFork";
    BSC_CLEAR_SIGNED_SELECTORS2["0x0d57afa6"] = "requestWithdraw";
    BSC_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    BSC_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x1e6d24c2"] = "dodoSwapV2TokenToETH";
    BSC_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    BSC_CLEAR_SIGNED_SELECTORS2["0x23b872dd"] = "transferFrom";
    BSC_CLEAR_SIGNED_SELECTORS2["0x26ef699d"] = "sendToken";
    BSC_CLEAR_SIGNED_SELECTORS2["0x2e1a7d4d"] = "withdraw";
    BSC_CLEAR_SIGNED_SELECTORS2["0x2e95b6c8"] = "unoswap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x33635226"] = "BuyOnUniswapFork";
    BSC_CLEAR_SIGNED_SELECTORS2["0x3c659741"] = "bridgeCall";
    BSC_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    BSC_CLEAR_SIGNED_SELECTORS2["0x3f2e5fc3"] = "sendNative";
    BSC_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x4d99dd16"] = "undelegate";
    BSC_CLEAR_SIGNED_SELECTORS2["0x5028bb95"] = "dodoSwapV2ETHToToken";
    BSC_CLEAR_SIGNED_SELECTORS2["0x51227094"] = "processOutputOrders";
    BSC_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x54bacd13"] = "externalSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x58b9d179"] = "SwapOnUniswap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x59491871"] = "redelegate";
    BSC_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    BSC_CLEAR_SIGNED_SELECTORS2["0x6d9634b7"] = "releaseTokens";
    BSC_CLEAR_SIGNED_SELECTORS2["0x7617b389"] = "mixSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x7c025200"] = "swap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    BSC_CLEAR_SIGNED_SELECTORS2["0x81791788"] = "dodoMutliSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x8ca3bf68"] = "callBridgeCall";
    BSC_CLEAR_SIGNED_SELECTORS2["0x8f00eccb"] = "MultiSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x90e1aa69"] = "processInputOrders";
    BSC_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    BSC_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    BSC_CLEAR_SIGNED_SELECTORS2["0x982ef0a7"] = "delegate";
    BSC_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    BSC_CLEAR_SIGNED_SELECTORS2["0x9ddb511a"] = "delegate";
    BSC_CLEAR_SIGNED_SELECTORS2["0xa21a9280"] = "withdraw";
    BSC_CLEAR_SIGNED_SELECTORS2["0xa27e8b6b"] = "SimpleBuy";
    BSC_CLEAR_SIGNED_SELECTORS2["0xa378534b"] = "create";
    BSC_CLEAR_SIGNED_SELECTORS2["0xa5977fbb"] = "send";
    BSC_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    BSC_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0xaa7415f5"] = "transferOut";
    BSC_CLEAR_SIGNED_SELECTORS2["0xaad3ec96"] = "claim";
    BSC_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    BSC_CLEAR_SIGNED_SELECTORS2["0xbba9b10c"] = "destroy";
    BSC_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    BSC_CLEAR_SIGNED_SELECTORS2["0xcfc0afeb"] = "SimpleSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0xd0e30db0"] = "deposit";
    BSC_CLEAR_SIGNED_SELECTORS2["0xde790c7e"] = "burn";
    BSC_CLEAR_SIGNED_SELECTORS2["0xec1d21dd"] = "MegaSwap";
    BSC_CLEAR_SIGNED_SELECTORS2["0xf35af1f8"] = "callBridge";
    BSC_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
    BSC_CLEAR_SIGNED_SELECTORS2["0xf8444436"] = "claimWithdrawal";
    BSC_CLEAR_SIGNED_SELECTORS2["0xf87dc1b7"] = "dodoSwapV2TokenToToken";
    BSC_CLEAR_SIGNED_SELECTORS2["0xf9355f72"] = "BuyOnUniswap";
    BSC_CLEAR_SIGNED_SELECTORS2["0xf95a49eb"] = "Buy";
  })(BSC_CLEAR_SIGNED_SELECTORS || (BSC_CLEAR_SIGNED_SELECTORS = {}));
  var ETHEREUM_CLEAR_SIGNED_SELECTORS;
  (function(ETHEREUM_CLEAR_SIGNED_SELECTORS2) {
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x00f714ce"] = "withdraw_to";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x01d523b6"] = "updateStateAndDepositAndMintOsToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x026e402b"] = "delegate";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x066055e0"] = "burnOsToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x074ee446"] = "mint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x084fd9b4"] = "claimFromVault";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0863b7ac"] = "swapOnUniswapFork";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x08dc9f42"] = "mint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x095ea7b3"] = "approve";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0968f264"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0b86a4c1"] = "swapOnUniswapV2Fork";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0c0a769b"] = "supply";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0dd8dd02"] = "queueWithdrawals";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0e752702"] = "repayBorrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x0ffab6c2"] = "batchWithdrawCLFee";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x10f13a8c"] = "SetText";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1249c58b"] = "mint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x148e23ce"] = "claimRewards";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x15373e3d"] = "castVote";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1564da79"] = "submitPOL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x16dc3ace"] = "swapExactAmountOut";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1896f70a"] = "setResolver";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x18f72950"] = "updateStateAndDeposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x19aa6257"] = "requestWithdrawalsWstETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1a7ff553"] = "updateState";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1c4b774b"] = "getReward";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1da649cf"] = "repay";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1e6d24c2"] = "dodoSwapV2TokenToETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x1f7ec122"] = "requestWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x201b9eb5"] = "mintOsToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x224199c2"] = "ProveAndClaimWithResolver";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x22a775b6"] = "mintAndTransfer";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x23463624"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x23b872dd"] = "transferFrom";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x23e103a8"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x242eba0e"] = "deletePendingValidators";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x24d83b79"] = "addToPerpetual";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2521b930"] = "uniswapV3SwapToWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x258d3c33"] = "redeemYield";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x259f8d1a"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2608f818"] = "repayBorrowBehalf";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x26ef699d"] = "sendToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x27050d1f"] = "createToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2775d01c"] = "withdrawInstantly";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2aba2aeb"] = "addToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2ba03a79"] = "withdrawCLFee";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2c4b04fa"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2d8918d7"] = "addLiquidity";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2def6620"] = "unstake";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2e17de78"] = "unstake";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2e1a7d4d"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2e2d2984"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x2e95b6c8"] = "unoswap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x304e6ade"] = "SetContentHash";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3111e7b3"] = "claimRewards";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x31807e42"] = "depositYieldToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x32ca494b"] = "withdrawWstETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x32f73258"] = "updateOperatorControllingAddress";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x33404396"] = "completeQueuedWithdrawals";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x33635226"] = "buyOnUniswapFork";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x379607f5"] = "claim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x388bbfd3"] = "redeem";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3a4b66f1"] = "stake";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3c659741"] = "bridgeCall";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3ccfd60b"] = "withdraw_all";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3d13f874"] = "claim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3d18b912"] = "getReward";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3db397c6"] = "__ERC721Rarible_init";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3e200d4b"] = "stakeRPL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x3f2e5fc3"] = "sendNative";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x42966c68"] = "burn";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x439370b1"] = "depositEth";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x43e82a79"] = "redeemOsToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x441a3e70"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x46e04a2f"] = "claimTokens";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x47e7ef24"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4957677c"] = "increase_amount";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4b8a3529"] = "borrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4cc4a27b"] = "fillOrderRFQToWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4d447995"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4d5693ab"] = "depositUnderlying";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4d99dd16"] = "undelegate";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4e3c04bd"] = "getRSETHWithETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4e71d92d"] = "claim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4f498c73"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x4faa8a26"] = "depositEtherFor";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5028bb95"] = "dodoSwapV2ETHToToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x510ccb43"] = "getReward";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x51227094"] = "processOutputOrders";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x51a60b02"] = "withdrawDelegated";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5243318f"] = "depositWstETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5358fbda"] = "depositETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x54741d6d"] = "addOperator";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x54bacd13"] = "externalSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x55362f4d"] = "swapTo";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x573ade81"] = "repay";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x58b9d179"] = "swapOnUniswap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5a3b74b9"] = "setUserUseReserveAsCollateral";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5ae401dc"] = "multicall";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5b0fc9c3"] = "setOwner";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5b34b966"] = "incrementCounter";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5c19a95c"] = "delegate";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x5ef2c7f0"] = "setSubnodeRecord";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x60ec5216"] = "addNewValidatorDetails";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x627cdcb9"] = "incrementNonce";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x657bb113"] = "mintSign";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x65ae14b5"] = "deleverageWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x65fc3873"] = "create_lock";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x66792ba1"] = "send";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x67dfd4c9"] = "leave";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x69328dec"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6ab15071"] = "buyVoucher";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6b088d5c"] = "withdrawRPL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6d104216"] = "burn";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6d9634b7"] = "releaseTokens";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6e26b9f8"] = "depositRequest";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6e553f65"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x6fc3f5d5"] = "deploySmartVault";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x71d6e892"] = "claimAlk";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x721c6513"] = "requestExit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x72c51c0b"] = "depositETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x73c2ad9c"] = "addToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x745400c9"] = "requestWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x74694a2b"] = "register";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7617b389"] = "mixSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7951b76f"] = "requestWithdrawalsWstETHWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7b0472f0"] = "stake";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7bde82f2"] = "redeem";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7c025200"] = "swap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7d41c86e"] = "requestRedeem";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7e108d52"] = "initiateWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x7f60d338"] = "withdrawSelfApeCoin";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x81791788"] = "dodoMutliSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x827481ea"] = "preSaleMint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8279e760"] = "claimSelfApeCoin";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x832fbb29"] = "transferFromOrMint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x833947fd"] = "reallocateTo";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8340f549"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x852a12e3"] = "redeemUnderlying";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x85f6d155"] = "register";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8697d2c2"] = "claimExitedAssets";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x87201b41"] = "fulfillAvailableAdvancedOrders";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8759c234"] = "unstakeClaimTokens_newPOL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x891407c0"] = "purchaseTo";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8ab936b8"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8b53f75e"] = "redeemInstant";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8b95dd71"] = "SetAddr";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8bbedf75"] = "ProveAndClaim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8ca3bf68"] = "callBridgeCall";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8ceab9aa"] = "enterExitQueue";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x8f00eccb"] = "multiSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x90e1aa69"] = "processInputOrders";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x9343d9e1"] = "cooldownShares";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x94ba89a2"] = "swapBorrowRateMode";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x94bf804d"] = "mint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x9aa3033a"] = "requestVoluntaryExit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x9dcaafb4"] = "depositSelfApeCoin";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0x9f5db69c"] = "updateOperatorName";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa0712d68"] = "mint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa1251d75"] = "unoswapWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa1903eab"] = "submit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa21a9280"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa22cb465"] = "setApprovalForAll";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa27e8b6b"] = "undefined";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa2922622"] = "withdrawWithSymbolCheck";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa378534b"] = "create";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa415bcad"] = "borrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa543ccea"] = "setWithdrawalAddress";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa5977fbb"] = "send";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa59f3e0c"] = "enter";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa62b2a3d"] = "openPerpetual";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa694fc3a"] = "stake";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa824ae8b"] = "swapFrom";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa8a41c70"] = "cancelOrder_";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa9059cbb"] = "transfer";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xaa2daba6"] = "depositWithSymbolCheck";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xab834bab"] = "atomicMatch_";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xabdb5ea8"] = "repayBorrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xac9650d8"] = "Multicall";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xacf1a841"] = "renew";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xacf41e4d"] = "requestWithdrawalsWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xadcf1163"] = "claim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xaf68b302"] = "mintToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xafc3083c"] = "removeLiquidity";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb02029e0"] = "extendRewardEmission";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb0431182"] = "clipperSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb1a1a882"] = "depositETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb3a34c4c"] = "fulfillOrder";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb460af94"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb6b06dec"] = "requestValidatorsExit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb6b55f25"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb7034f7e"] = "claim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb7482509"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb7ba18c7"] = "multiClaim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xb8aa0db9"] = "depositRsETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xba087652"] = "reedeem";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xbba9b10c"] = "destroy";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xbc80f1a8"] = "uniswapV3SwapTo";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xbd439126"] = "confirmWithdrawalAddress";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xbf509bd4"] = "withdrawELFee";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xbfc2d46a"] = "redeemRequest";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc02dd27a"] = "depositInstant";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc111fb91"] = "preSaleMint";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc22fb4ef"] = "withdrawUnderlying";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc3953502"] = "usePubKeysForValidatorSetup";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc3ae1766"] = "depositAsset";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc47f0027"] = "setName";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc48ef844"] = "createVault";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc4d66de8"] = "initialize";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc5a67b01"] = "initiateWithdrawal";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc5ebeaec"] = "borrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc7b8981c"] = "withdrawRewards";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc7cdea37"] = "withdrawETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xc83ec04d"] = "sellVoucher_new";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xca0bfcce"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xcb1c8321"] = "stakeRPLFor";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xcc8690ac"] = "depositCrvLp";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xccc143b8"] = "requestWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xcdac52ed"] = "cooldownAssets";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xcfc0afeb"] = "simpleSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd0a3b665"] = "fillOrderRFQ";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd0e30db0"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd1e6044a"] = "compound";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd3a86833"] = "completeWithdrawal";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd5f73f5c"] = "redeemFiatRequest";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd6681042"] = "requestWithdrawals";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd6a92a5d"] = "clipperSwapToWithPermit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd7b9d423"] = "withdrawFast";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xd99d32e3"] = "swapAndDeposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xda8be864"] = "undelegate";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xdb006a75"] = "redeem";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xdd307b99"] = "enableOperator";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xddd81f82"] = "registerProxy";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xde0e9a3e"] = "unwrap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xde5f6268"] = "depositAll";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe0db556b"] = "withdrawRewardsPOL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe1c2eea6"] = "redeemFast";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe2864fe3"] = "cancel";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe2bbb158"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe3afe0a3"] = "claimWithdrawals";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe4457a8a"] = "buyVoucherPOL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe449022e"] = "uniswapV3Swap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe5234c7a"] = "closePerpetual";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe570b78b"] = "sellVoucher_newPOL";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe61604cf"] = "liquidateBorrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe63697c8"] = "withdraw_to_with_slippage";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe69663f1"] = "ZapIn";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe7a050aa"] = "depositIntoStrategy";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe7acab24"] = "fulfillAdvancedOrder";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe7ffb5f7"] = "swapExactAmountIn";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe8a0c121"] = "batchWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe8c3516b"] = "getRSETHWithERC20";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe8d6dbb4"] = "RenewAll";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe8eda9df"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe8f28a6c"] = "updateOperatorRewardAddress";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe97fddc2"] = "unstakeClaimTokens_new";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe99454f5"] = "setWithdrawal";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe99a3f80"] = "matchOrders";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xe9fad8ee"] = "exit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xea598cb0"] = "wrap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xea99c2a6"] = "submit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xec1d21dd"] = "megaSwap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xecfe0521"] = "withdrawCrvLp";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xed98a574"] = "fulfillAvailableOrders";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xeda74e71"] = "deleteActiveValidators";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xeea9064b"] = "delegateTo";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xef5e4682"] = "batchWithdrawELFee";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xefef39a1"] = "purchase";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xeff7a612"] = "increase_unlock_time";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf14fcbc8"] = "commit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf2888dbb"] = "unstake";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf2b9fdb8"] = "supply";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf35af1f8"] = "callBridge";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf3fef3a3"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf4de10ac"] = "getStakingRewards";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf4f3b200"] = "withdrawERC20";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf532e86a"] = "submit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf56408ed"] = "disableOperator";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf5e3c462"] = "liquidateBorrow";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf6326fb3"] = "depositETH";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf756fa21"] = "completeWithdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf7a16963"] = "registerWithConfig";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf8444436"] = "claimWithdrawal";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf87dc1b7"] = "dodoSwapV2TokenToToken";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf8a70486"] = "claimWithdrawal";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf9355f72"] = "buyOnUniswap";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf95a49eb"] = "buy";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xf9609f08"] = "deposit_all";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xfa15b91b"] = "deposit";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xfb0f3ee1"] = "fulfillBasicOrder";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xfb7e92ea"] = "claim";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xfd3c11a8"] = "withdraw";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xfd9f1e10"] = "cancel";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xfe784eaa"] = "swapTokens";
    ETHEREUM_CLEAR_SIGNED_SELECTORS2["0xff3bf066"] = "zapInToPT";
  })(ETHEREUM_CLEAR_SIGNED_SELECTORS || (ETHEREUM_CLEAR_SIGNED_SELECTORS = {}));
  var ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS;
  (function(ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2) {
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x08dc9f42"] = "mint";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x0968f264"] = "withdraw";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x0ffab6c2"] = "batchWithdrawCLFee";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x11413601"] = "stableMintSign";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x1249c58b"] = "mint";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x2ba03a79"] = "withdrawCLFee";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x2c4b04fa"] = "deposit";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x4f498c73"] = "deposit";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x657bb113"] = "mintSign";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x66792ba1"] = "send";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x804b936f"] = "stableMint";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0x827481ea"] = "preSaleMint";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xa0712d68"] = "mint";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xb6b06dec"] = "requestValidatorsExit";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xbf509bd4"] = "withdrawELFee";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xc111fb91"] = "preSaleMint";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xd0e30db0"] = "deposit";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xe8a0c121"] = "batchWithdraw";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xe99454f5"] = "setWithdrawal";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xef5e4682"] = "batchWithdrawELFee";
    ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS2["0xf39247a9"] = "mintSign";
  })(ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS || (ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS = {}));
  var ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS;
  (function(ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2) {
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0x1249c58b"] = "mint";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0x22a775b6"] = "mintAndTransfer";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0x27050d1f"] = "createToken";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0x3db397c6"] = "__ERC721Rarible_init";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0x832fbb29"] = "transferFromOrMint";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0xa22cb465"] = "setApprovalForAll";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0xc111fb91"] = "preSaleMint";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0xe2864fe3"] = "cancel";
    ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS2["0xe99a3f80"] = "matchOrders";
  })(ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS || (ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS = {}));
  var FANTOM_CLEAR_SIGNED_SELECTORS;
  (function(FANTOM_CLEAR_SIGNED_SELECTORS2) {
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x00f714ce"] = "withdraw";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x0b86a4c1"] = "swapOnUniswapV2Fork";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x2521b930"] = "uniswapV3SwapToWithPermit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x2e1a7d4d"] = "withdraw";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x2e95b6c8"] = "unoswap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x3ccfd60b"] = "withdraw";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x4cc4a27b"] = "fillOrderRFQToWithPermit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x6e553f65"] = "deposit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x7c025200"] = "swap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xa1251d75"] = "unoswapWithPermit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xb6b55f25"] = "deposit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xbc80f1a8"] = "uniswapV3SwapTo";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xd0a3b665"] = "fillOrderRFQ";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xd0e30db0"] = "deposit";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xe449022e"] = "uniswapV3Swap";
    FANTOM_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
  })(FANTOM_CLEAR_SIGNED_SELECTORS || (FANTOM_CLEAR_SIGNED_SELECTORS = {}));
  var OPTIMISM_CLEAR_SIGNED_SELECTORS;
  (function(OPTIMISM_CLEAR_SIGNED_SELECTORS2) {
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x00f714ce"] = "withdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x0b86a4c1"] = "swapOnUniswapV2Fork";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x259f8d1a"] = "withdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x2e1a7d4d"] = "withdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x2e95b6c8"] = "unoswap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x3ccfd60b"] = "withdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x4d447995"] = "deposit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x617ba037"] = "supply";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x65ae14b5"] = "deleverageWithdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x69328dec"] = "withdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x6e553f65"] = "deposit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x7c025200"] = "swap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xb460af94"] = "withdraw";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xb6b55f25"] = "deposit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xd0e30db0"] = "deposit";
    OPTIMISM_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
  })(OPTIMISM_CLEAR_SIGNED_SELECTORS || (OPTIMISM_CLEAR_SIGNED_SELECTORS = {}));
  var POLYGON_CLEAR_SIGNED_SELECTORS;
  (function(POLYGON_CLEAR_SIGNED_SELECTORS2) {
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x02751cec"] = "removeLiquidityETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x03388b4e"] = "sublet";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x0863b7ac"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x0c65b39d"] = "unlink";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x1157decb"] = "endRental";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x11bcc81e"] = "downgrade";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x160e8be3"] = "downgradeToETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x16dc3ace"] = "swapExactAmountOut";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x18cbafe5"] = "swapExactTokensForETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x1a674419"] = "buyCAPSA";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x1ae50184"] = "preSignRentalOffer";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x1beddfdd"] = "endSublet";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x1e6d24c2"] = "dodoSwapV2TokenToETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x1e9a6950"] = "redeem";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x20905506"] = "whitelist_profile_creator";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x2195995c"] = "removeLiquidityWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x22a775b6"] = "mintAndTransfer";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x23463624"] = "deposit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x23b872dd"] = "transferFrom";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x2521b930"] = "uniswapV3SwapToWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x258d3c33"] = "redeemYield";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x26ef699d"] = "sendToken";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x27050d1f"] = "createToken";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x2d8918d7"] = "addLiquidity";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x2e1a7d4d"] = "withdraw";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x2e95b6c8"] = "unoswap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x33635226"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x38ed1739"] = "swapExactTokensForTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x39255d5b"] = "callAgreement";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3c659741"] = "bridgeCall";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3ce1108d"] = "sellToAMM";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3d18b912"] = "getReward";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3db397c6"] = "__ERC721Rarible_init";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x3f2e5fc3"] = "sendNative";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x42966c68"] = "burn";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x441a3e70"] = "withdraw";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x45977d03"] = "upgrade";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x4727ce3a"] = "collect";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x47e7ef24"] = "deposit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x48eaf6d6"] = "requestMaticXSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x4926c4ed"] = "change_del_exec_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x4a25d94a"] = "swapTokensForExactETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x4b7312a9"] = "follow";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x4cc4a27b"] = "fillOrderRFQToWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x4d7b35a0"] = "follow_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x5028bb95"] = "dodoSwapV2ETHToToken";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x51227094"] = "processOutputOrders";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x51c3659c"] = "change_del_exec_1";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x54506e92"] = "grind";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x54bacd13"] = "externalSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x560a4db1"] = "act";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x58b9d179"] = "swapOnUniswap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x5b0d5984"] = "removeLiquidityETHWithPermitSupportingFeeOnTransferTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x5b34b966"] = "incrementCounter";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x5c11d795"] = "swapExactTokensForTokensSupportingFeeOnTransferTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x617ba037"] = "supply";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x627cdcb9"] = "incrementNonce";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x6363e882"] = "registerAndRewardGameWithSignature";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x65f29f27"] = "quote_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x66b0dcd3"] = "post";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x69328dec"] = "withdraw";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x6ad3ca7d"] = "batchCall";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x6d0fd658"] = "metadata_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x6d9634b7"] = "releaseTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x6dea40b3"] = "set_follow_mod";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x6e09f420"] = "cancelRentalOffer";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x7617b389"] = "mixSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x77baf209"] = "claimMaticXSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x791ac947"] = "swapExactTokensForETHSupportingFeeOnTransferTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x7c025200"] = "swap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x7e502fe0"] = "link_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x7ff36ab5"] = "swapExactETHForTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x809d8947"] = "unfollow_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x815ed04a"] = "unfollow";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x81791788"] = "dodoMutliSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x825ab164"] = "unlink_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x832fbb29"] = "transferFromOrMint";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x85149258"] = "exerciseOptions";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x86cf48e7"] = "link";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x87201b41"] = "fulfillAvailableAdvancedOrders";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x8803dbee"] = "swapTokensForExactTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x8875eb84"] = "buyFromAMM";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x8ca3bf68"] = "callBridgeCall";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x8d259eb1"] = "rent";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x8f00eccb"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x907cd7d2"] = "post_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x90e1aa69"] = "processInputOrders";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0x9f916c9f"] = "buyFromAMMWithReferrer";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa1251d75"] = "unoswapWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa21a9280"] = "withdraw";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa22cb465"] = "setApprovalForAll";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa27e8b6b"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa2922622"] = "withdrawWithSymbolCheck";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa378534b"] = "create";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa5977fbb"] = "send";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa694fc3a"] = "stake";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa8a41c70"] = "cancelOrder_";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xaa2daba6"] = "depositWithSymbolCheck";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xaf2979eb"] = "removeLiquidityETHSupportingFeeOnTransferTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xafc3083c"] = "removeLiquidity";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb273b4a7"] = "comment";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb3a34c4c"] = "fulfillOrder";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb42df51a"] = "comment_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb60099b7"] = "craft";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb6b55f25"] = "deposit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb6f9de95"] = "swapExactETHForTokensSupportingFeeOnTransferTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb7034f7e"] = "claim";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb7902e73"] = "collect_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xbaa2abde"] = "removeLiquidity";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xbba9b10c"] = "destroy";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xbc80f1a8"] = "uniswapV3SwapTo";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc1f4b40a"] = "change_del_exec_2";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc5d5d96a"] = "act";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc6d45944"] = "set_block_status_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc78cf1a0"] = "swapMaticForMaticXViaInstantPool";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xc86642c7"] = "act_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xce30bb4f"] = "set_follow_mod_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xcf81464b"] = "upgradeByETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xcfc0afeb"] = "simpleSwap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xd06a750c"] = "exercisePositions";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xd0a3b665"] = "fillOrderRFQ";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xd0e30db0"] = "deposit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xde5f6268"] = "depositAll";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xded9382a"] = "removeLiquidityETHWithPermit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe1649e8d"] = "endRentalPrematurely";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe2864fe3"] = "cancel";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe2bbb158"] = "deposit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe449022e"] = "uniswapV3Swap";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe6a402b5"] = "mirror_with_sign";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe7acab24"] = "fulfillAdvancedOrder";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe7ffb5f7"] = "swapExactAmountIn";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe8e33700"] = "addLiquidity";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe99a3f80"] = "matchOrders";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xe9fad8ee"] = "exit";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xea25e176"] = "claim";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xec1d21dd"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xed98a574"] = "fulfillAvailableOrders";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xefe4fd83"] = "metadata";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf08e8f5e"] = "mint";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf0ba35f0"] = "quote";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf2b9fdb8"] = "supply";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf305d719"] = "addLiquidityETH";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf35af1f8"] = "callBridge";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf3fef3a3"] = "withdraw";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf87dc1b7"] = "dodoSwapV2TokenToToken";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf90604d1"] = "mirror";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf9355f72"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xf95a49eb"] = "undefined";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xfb0f3ee1"] = "fulfillBasicOrder";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xfb3bdb41"] = "swapETHForExactTokens";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xfb827e82"] = "set_block_status";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xfd9f1e10"] = "cancel";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xfe9d8323"] = "sellCAPSA";
    POLYGON_CLEAR_SIGNED_SELECTORS2["0xff3bf066"] = "zapInToPT";
  })(POLYGON_CLEAR_SIGNED_SELECTORS || (POLYGON_CLEAR_SIGNED_SELECTORS = {}));
  var POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS;
  (function(POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2) {
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x016cba5f"] = "execute";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x0b86a4c1"] = "swapOnUniswapV2Fork";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x0d5f0e3b"] = "uniswapV3SwapTo";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x12a0ddc7"] = "PMMV2Swap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x2298207a"] = "simpleBuy";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x3d21e25a"] = "swapBridgeToV2";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x46c67b6d"] = "megaSwap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x54840d1a"] = "swapOnUniswap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x54e3f31b"] = "SimpleSwap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x64466805"] = "swapOnZeroXv4";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x81033120"] = "swapOnZeroXv2";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x935fb84b"] = "buyOnUniswap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x972250fe"] = "bridgeToV2";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0x9871efa4"] = "unxswapByOrderId";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0xa6886da9"] = "directUniV3Swap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0xa94e78ef"] = "multiSwap";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0xb80c2f09"] = "smartSwapByOrderId";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0xc03786b0"] = "buyOnUniswapFork";
    POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS2["0xf5661034"] = "swapOnUniswapFork";
  })(POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS || (POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS = {}));
  var ZKSYNC_CLEAR_SIGNED_SELECTORS;
  (function(ZKSYNC_CLEAR_SIGNED_SELECTORS2) {
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0x0502b1c5"] = "unoswap";
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0x12aa3caf"] = "swap";
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0x3c15fd91"] = "unoswapToWithPermit";
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0x3eca9c0a"] = "fillOrderRFQ";
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0x70ccbd31"] = "fillOrderRFQToWithPermit";
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0x84bd6d29"] = "clipperSwap";
    ZKSYNC_CLEAR_SIGNED_SELECTORS2["0xc805a666"] = "clipperSwapToWithPermit";
  })(ZKSYNC_CLEAR_SIGNED_SELECTORS || (ZKSYNC_CLEAR_SIGNED_SELECTORS = {}));

  // node_modules/@ledgerhq/evm-tools/lib-es/selectors/index.js
  var ERC20_CLEAR_SIGNED_SELECTORS;
  (function(ERC20_CLEAR_SIGNED_SELECTORS2) {
    ERC20_CLEAR_SIGNED_SELECTORS2["APPROVE"] = "0x095ea7b3";
    ERC20_CLEAR_SIGNED_SELECTORS2["TRANSFER"] = "0xa9059cbb";
  })(ERC20_CLEAR_SIGNED_SELECTORS || (ERC20_CLEAR_SIGNED_SELECTORS = {}));
  var ERC721_CLEAR_SIGNED_SELECTORS;
  (function(ERC721_CLEAR_SIGNED_SELECTORS2) {
    ERC721_CLEAR_SIGNED_SELECTORS2["APPROVE"] = "0x095ea7b3";
    ERC721_CLEAR_SIGNED_SELECTORS2["SET_APPROVAL_FOR_ALL"] = "0xa22cb465";
    ERC721_CLEAR_SIGNED_SELECTORS2["TRANSFER_FROM"] = "0x23b872dd";
    ERC721_CLEAR_SIGNED_SELECTORS2["SAFE_TRANSFER_FROM"] = "0x42842e0e";
    ERC721_CLEAR_SIGNED_SELECTORS2["SAFE_TRANSFER_FROM_WITH_DATA"] = "0xb88d4fde";
  })(ERC721_CLEAR_SIGNED_SELECTORS || (ERC721_CLEAR_SIGNED_SELECTORS = {}));
  var ERC1155_CLEAR_SIGNED_SELECTORS;
  (function(ERC1155_CLEAR_SIGNED_SELECTORS2) {
    ERC1155_CLEAR_SIGNED_SELECTORS2["SET_APPROVAL_FOR_ALL"] = "0xa22cb465";
    ERC1155_CLEAR_SIGNED_SELECTORS2["SAFE_TRANSFER_FROM"] = "0xf242432a";
    ERC1155_CLEAR_SIGNED_SELECTORS2["SAFE_BATCH_TRANSFER_FROM"] = "0x2eb2c2d6";
  })(ERC1155_CLEAR_SIGNED_SELECTORS || (ERC1155_CLEAR_SIGNED_SELECTORS = {}));
  var DAPP_SELECTORS = {
    ...ARBITRUM_CLEAR_SIGNED_SELECTORS,
    ...AVALANCHE_C_CHAIN_CLEAR_SIGNED_SELECTORS,
    ...BASE_CLEAR_SIGNED_SELECTORS,
    ...BSC_CLEAR_SIGNED_SELECTORS,
    ...ETHEREUM_CLEAR_SIGNED_SELECTORS,
    ...ETHEREUM_GOERLI_CLEAR_SIGNED_SELECTORS,
    ...ETHEREUM_ROPSTEN_CLEAR_SIGNED_SELECTORS,
    ...FANTOM_CLEAR_SIGNED_SELECTORS,
    ...OPTIMISM_CLEAR_SIGNED_SELECTORS,
    ...POLYGON_CLEAR_SIGNED_SELECTORS,
    ...POLYGON_ZK_EVM_CLEAR_SIGNED_SELECTORS,
    ...ZKSYNC_CLEAR_SIGNED_SELECTORS
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/utils.js
  var padHexString = (str) => {
    return str.length % 2 ? "0" + str : str;
  };
  function splitPath(path) {
    const splittedPath = [];
    const paths = path.split("/");
    paths.forEach((path2) => {
      let value = parseInt(path2, 10);
      if (isNaN(value)) {
        return;
      }
      if (path2.length > 1 && path2[path2.length - 1] === "'") {
        value += 2147483648;
      }
      splittedPath.push(value);
    });
    return splittedPath;
  }
  function hexBuffer(str) {
    if (!str)
      return import_buffer.Buffer.alloc(0);
    const strWithoutPrefix = str.startsWith("0x") ? str.slice(2) : str;
    return import_buffer.Buffer.from(padHexString(strWithoutPrefix), "hex");
  }
  function maybeHexBuffer(str) {
    if (!str)
      return null;
    return hexBuffer(str);
  }
  var intAsHexBytes = (int, bytes) => int.toString(16).padStart(2 * bytes, "0");
  var tokenSelectors = Object.values(ERC20_CLEAR_SIGNED_SELECTORS);
  var nftSelectors = [
    ...Object.values(ERC721_CLEAR_SIGNED_SELECTORS),
    ...Object.values(ERC1155_CLEAR_SIGNED_SELECTORS)
  ];
  var mergeResolutions = (resolutionsArray) => {
    const mergedResolutions = {
      nfts: [],
      erc20Tokens: [],
      externalPlugin: [],
      plugin: [],
      domains: []
    };
    for (const resolutions of resolutionsArray) {
      for (const key2 in resolutions) {
        mergedResolutions[key2].push(...resolutions[key2]);
      }
    }
    return mergedResolutions;
  };
  var getParity = (vFromDevice, chainId, transactionType) => {
    if (transactionType)
      return vFromDevice;
    const chainIdUint32 = getChainIdAsUint32(chainId);
    const chainIdWithEIP155 = chainIdUint32 * 2 + 35;
    const chainIdWithOverflowZero = chainIdWithEIP155 % 256;
    const chainIdWithOverflowOne = (chainIdWithEIP155 + 1) % 256;
    if (chainIdWithOverflowZero === vFromDevice) {
      return 0;
    } else if (chainIdWithOverflowOne === vFromDevice) {
      return 1;
    }
    throw new Error("Invalid v value");
  };
  var getChainIdAsUint32 = (chainId) => {
    const chainIdBuff = import_buffer.Buffer.from(padHexString(new BigNumber(chainId).toString(16)), "hex");
    const chainIdUint32 = chainIdBuff.subarray(0, 4);
    return parseInt(chainIdUint32.toString("hex"), 16);
  };
  var getV = (vFromDevice, chainId, transactionType) => {
    if (chainId.isZero())
      return vFromDevice.toString(16);
    const parity = getParity(vFromDevice, chainId, transactionType);
    return !transactionType ? (
      // Legacy transactions (type 0) should apply EIP-155
      // EIP-155: rlp[(nonce, gasprice, startgas, to, value, data, chainid, 0, 0)]
      padHexString(chainId.times(2).plus(35).plus(parity).toString(16))
    ) : (
      // Transactions after type 1 should only use partity (00/01) as their v value
      // EIP-2930: 0x01 || rlp([chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, *signatureYParity*, signatureR, signatureS])
      // EIP-1559: 0x02 || rlp([chain_id, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit, destination, amount, data, access_list, *signature_y_parity*, signature_r, signature_s])
      // EIP-4844: 0x03 || rlp([chain_id, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit, to, value, data, access_list, max_fee_per_blob_gas, blob_versioned_hashes, *y_parity*, r, s])
      // EIP-7702: 0x05 || rlp([chain_id, nonce, max_priority_fee_per_gas, max_fee_per_gas, gas_limit, destination, value, data, access_list, authorization_list, *signature_y_parity*, signature_r, signature_s])
      padHexString(parity.toString(16))
    );
  };
  var safeChunkTransaction = (transactionRlp, derivationPath, transactionType) => {
    const maxChunkSize = 255;
    const payload = import_buffer.Buffer.concat([derivationPath, transactionRlp]);
    if (payload.length <= maxChunkSize)
      return [payload];
    if (transactionType) {
      const chunks2 = Math.ceil(payload.length / maxChunkSize);
      return new Array(chunks2).fill(null).map((_, i) => payload.subarray(i * maxChunkSize, (i + 1) * maxChunkSize));
    }
    const decodedVrs = decode(transactionRlp).slice(-3);
    const encodedVrs = encode3(decodedVrs);
    const encodedVrsBuff = hexBuffer(encodedVrs).subarray(1);
    let chunkSize = 0;
    const lastChunkSize = payload.length % maxChunkSize;
    if (lastChunkSize === 0 || lastChunkSize > encodedVrsBuff.length) {
      chunkSize = maxChunkSize;
    } else {
      for (let i = 1; i <= maxChunkSize; i++) {
        const lastChunkSize2 = payload.length % (maxChunkSize - i);
        if (lastChunkSize2 === 0 || lastChunkSize2 > encodedVrsBuff.length) {
          chunkSize = maxChunkSize - i;
          break;
        }
      }
    }
    const chunks = Math.ceil(payload.length / chunkSize);
    return new Array(chunks).fill(null).map((_, i) => payload.subarray(i * chunkSize, (i + 1) * chunkSize));
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/EIP712/utils.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/evm-tools/lib-es/message/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/EIP712/utils.js
  var EIP712_ARRAY_TYPE_VALUE;
  (function(EIP712_ARRAY_TYPE_VALUE2) {
    EIP712_ARRAY_TYPE_VALUE2[EIP712_ARRAY_TYPE_VALUE2["DYNAMIC"] = 0] = "DYNAMIC";
    EIP712_ARRAY_TYPE_VALUE2[EIP712_ARRAY_TYPE_VALUE2["FIXED"] = 1] = "FIXED";
  })(EIP712_ARRAY_TYPE_VALUE || (EIP712_ARRAY_TYPE_VALUE = {}));
  var EIP712_TYPE_PROPERTIES = {
    CUSTOM: {
      key: () => 0,
      size: () => null
    },
    INT: {
      key: () => 1,
      size: (size) => Number(size) / 8
    },
    UINT: {
      key: () => 2,
      size: (size) => Number(size) / 8
    },
    ADDRESS: {
      key: () => 3,
      size: () => null
    },
    BOOL: {
      key: () => 4,
      size: () => null
    },
    STRING: {
      key: () => 5,
      size: () => null
    },
    BYTES: {
      key: (size) => typeof size !== "undefined" ? 6 : 7,
      size: (size) => typeof size !== "undefined" ? Number(size) : null
    }
  };
  var EIP712_TYPE_ENCODERS = {
    INT(value, size = 256) {
      const failSafeValue = value ?? "0";
      if (typeof failSafeValue === "string" && failSafeValue?.startsWith("0x")) {
        return hexBuffer(failSafeValue);
      }
      let valueAsBN = new bignumber_default(failSafeValue);
      if (valueAsBN.lt(0)) {
        const sizeInBytes = size / 8;
        const maskAsBN = new bignumber_default(`0x${import_buffer.Buffer.alloc(sizeInBytes, 255).toString("hex")}`);
        valueAsBN = maskAsBN.plus(valueAsBN).plus(1);
      }
      const paddedHexString = valueAsBN.toString(16).length % 2 ? "0" + valueAsBN.toString(16) : valueAsBN.toString(16);
      return import_buffer.Buffer.from(paddedHexString, "hex");
    },
    UINT(value) {
      return this.INT(value);
    },
    BOOL(value) {
      return this.INT(typeof value === "boolean" ? Number(value).toString() : value);
    },
    ADDRESS(value) {
      return hexBuffer(value ?? "").slice(0, 20);
    },
    STRING(value) {
      return import_buffer.Buffer.from(value ?? "", "utf-8");
    },
    BYTES(value, size) {
      const failSafeValue = value ?? "";
      return hexBuffer(failSafeValue).slice(0, size ?? (failSafeValue?.length - 2) / 2);
    }
  };
  var destructTypeFromString = (typeName) => {
    const splitNameAndArraysRegex = new RegExp(/^([^[\]]*)(\[.*\])*/g);
    const splitArraysRegex = new RegExp(/\[(\d*)\]/g);
    const splitNameAndNumberRegex = new RegExp(/(?=u?int|bytes)([a-zA-Z-0-9]+?)(\d{1,3})$/g);
    const [, type, maybeArrays] = splitNameAndArraysRegex.exec(typeName || "") || [];
    const [, name = type, size] = splitNameAndNumberRegex.exec(type || "") || [];
    const typeDescription = name ? { name, size: size ? Number(size) : void 0 } : null;
    const arrays = maybeArrays ? [...maybeArrays.matchAll(splitArraysRegex)] : [];
    const arrayLengths = arrays.map(([, arrayLength]) => arrayLength ? Number(arrayLength) : null);
    return [typeDescription, arrayLengths];
  };
  var constructTypeDescByteString = (isArray2, typeSize, typeValue) => {
    if (typeValue >= 16) {
      throw new Error("Eth utils - constructTypeDescByteString - Cannot accept a typeValue >= 16 because the typeValue can only be 4 bits in binary" + { isArray: isArray2, typeSize, typeValue });
    }
    const isArrayBit = isArray2 ? "1" : "0";
    const hasTypeSize = typeof typeSize === "number" ? "1" : "0";
    const unusedBits = "00";
    const typeValueBits = typeValue.toString(2).padStart(4, "0");
    return intAsHexBytes(parseInt(isArrayBit + hasTypeSize + unusedBits + typeValueBits, 2), 1);
  };
  var makeTypeEntryStructBuffer = ({ name, type }) => {
    const [typeDescription, arrSizes] = destructTypeFromString(type);
    const isTypeAnArray = Boolean(arrSizes.length);
    const typeProperties = EIP712_TYPE_PROPERTIES[typeDescription?.name?.toUpperCase() || ""] || EIP712_TYPE_PROPERTIES.CUSTOM;
    const typeKey = typeProperties.key(typeDescription?.size);
    const typeSize = typeProperties.size(typeDescription?.size);
    const typeDescData = constructTypeDescByteString(isTypeAnArray, typeSize, typeKey);
    const bufferArray = [import_buffer.Buffer.from(typeDescData, "hex")];
    if (typeProperties === EIP712_TYPE_PROPERTIES.CUSTOM) {
      bufferArray.push(import_buffer.Buffer.from(intAsHexBytes(typeDescription?.name?.length ?? 0, 1), "hex"));
      bufferArray.push(import_buffer.Buffer.from(typeDescription?.name ?? "", "utf-8"));
    }
    if (typeof typeSize === "number") {
      bufferArray.push(import_buffer.Buffer.from(intAsHexBytes(typeSize, 1), "hex"));
    }
    if (isTypeAnArray) {
      bufferArray.push(import_buffer.Buffer.from(intAsHexBytes(arrSizes.length, 1), "hex"));
      arrSizes.forEach((size) => {
        if (typeof size === "number") {
          bufferArray.push(import_buffer.Buffer.from(intAsHexBytes(EIP712_ARRAY_TYPE_VALUE.FIXED, 1), "hex"), import_buffer.Buffer.from(intAsHexBytes(size, 1), "hex"));
        } else {
          bufferArray.push(import_buffer.Buffer.from(intAsHexBytes(EIP712_ARRAY_TYPE_VALUE.DYNAMIC, 1), "hex"));
        }
      });
    }
    bufferArray.push(import_buffer.Buffer.from(intAsHexBytes(name.length, 1), "hex"), import_buffer.Buffer.from(name, "utf-8"));
    return import_buffer.Buffer.concat(bufferArray);
  };
  var getCoinRefTokensMap = (filters, shouldUseV1Filters, message) => {
    const coinRefsTokensMap = {};
    if (shouldUseV1Filters || !filters)
      return coinRefsTokensMap;
    const tokenFilters = filters.fields.filter(({ format }) => format === "token").sort((a, b) => (a.coin_ref || 0) - (b.coin_ref || 0));
    const tokens = tokenFilters.reduce((acc, filter2) => {
      const token = getValueFromPath(filter2.path, message);
      if (Array.isArray(token)) {
        throw new Error("Array of tokens is not supported with a single coin ref");
      }
      return [...acc, { token, coinRef: filter2.coin_ref }];
    }, []);
    for (const { token, coinRef } of tokens) {
      coinRefsTokensMap[coinRef] = { token };
    }
    const shouldUseVerifyingContract = filters.fields.some((filter2) => filter2.format === "amount" && filter2.coin_ref === 255);
    if (shouldUseVerifyingContract && message.domain.verifyingContract) {
      coinRefsTokensMap[255] = { token: message.domain.verifyingContract };
    }
    return coinRefsTokensMap;
  };
  var getAppAndVersion = async (transport) => {
    const appAndVersionHex = await transport.send(176, 1, 0, 0);
    let offset = 1;
    const nameLength = appAndVersionHex[offset];
    offset += 1;
    const name = appAndVersionHex.subarray(offset, offset + nameLength).toString("ascii");
    offset += nameLength;
    const versionLength = appAndVersionHex[offset];
    offset += 1;
    const version11 = appAndVersionHex.subarray(offset, offset + versionLength).toString("ascii");
    return {
      name,
      version: version11
    };
  };
  var getFilterDisplayNameAndSigBuffers = (displayName, sig) => {
    const displayNameContentBuffer = import_buffer.Buffer.from(displayName);
    const displayNameLengthBuffer = import_buffer.Buffer.from(intAsHexBytes(displayNameContentBuffer.length, 1), "hex");
    const sigContentBuffer = import_buffer.Buffer.from(sig, "hex");
    const sigLengthBuffer = import_buffer.Buffer.from(intAsHexBytes(sigContentBuffer.length, 1), "hex");
    return {
      displayNameBuffer: import_buffer.Buffer.concat([displayNameLengthBuffer, displayNameContentBuffer]),
      sigBuffer: import_buffer.Buffer.concat([sigLengthBuffer, sigContentBuffer])
    };
  };
  var getPayloadForFilterV2 = (format, coinRef, coinRefsTokensMap, displayNameBuffer, sigBuffer) => {
    switch (format) {
      case "raw":
      case "datetime":
        return import_buffer.Buffer.concat([displayNameBuffer, sigBuffer]);
      case "token": {
        const { deviceTokenIndex } = coinRefsTokensMap[coinRef];
        return import_buffer.Buffer.concat([
          import_buffer.Buffer.from(intAsHexBytes(deviceTokenIndex || coinRef || 0, 1), "hex"),
          sigBuffer
        ]);
      }
      case "amount": {
        const { deviceTokenIndex } = coinRefsTokensMap[coinRef];
        return import_buffer.Buffer.concat([
          displayNameBuffer,
          import_buffer.Buffer.from(intAsHexBytes(deviceTokenIndex || coinRef || 0, 1), "hex"),
          sigBuffer
        ]);
      }
      default:
        throw new Error("Invalid format");
    }
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/EIP712/index.js
  var makeRecursiveFieldStructImplem = ({ transport, loadConfig, chainId, erc20SignaturesBlob, types, filters, shouldUseV1Filters, shouldUseDiscardedFields, coinRefsTokensMap }) => {
    const typesMap = {};
    for (const type in types) {
      typesMap[type] = types[type]?.reduce((acc, curr) => ({ ...acc, [curr.name]: curr.type }), {});
    }
    const recursiveFieldStructImplem = async (destructedType, data, path = "") => {
      const [typeDescription, arrSizes] = destructedType;
      const [currSize, ...restSizes] = arrSizes;
      const isCustomType = !EIP712_TYPE_PROPERTIES[typeDescription?.name?.toUpperCase() || ""];
      if (Array.isArray(data) && typeof currSize !== "undefined") {
        await sendStructImplem(transport, {
          structType: "array",
          value: data.length
        });
        const entryPath = `${path}.[]`;
        if (!data.length) {
          const entryFilters = filters?.fields.filter((f) => f.path.startsWith(entryPath));
          if (entryFilters && shouldUseDiscardedFields) {
            for (const entryFilter of entryFilters) {
              await sendFilteringInfo(transport, "discardField", loadConfig, {
                path: entryFilter.path
              });
              await sendFilteringInfo(transport, "showField", loadConfig, {
                displayName: entryFilter.label,
                sig: entryFilter.signature,
                format: entryFilter.format,
                coinRef: entryFilter.coin_ref,
                chainId,
                erc20SignaturesBlob,
                shouldUseV1Filters,
                coinRefsTokensMap,
                isDiscarded: true
              });
            }
          }
        }
        for (const entry of data) {
          await recursiveFieldStructImplem([typeDescription, restSizes], entry, entryPath);
        }
      } else if (isCustomType) {
        for (const fieldName of Object.keys(typesMap[typeDescription?.name || ""])) {
          const fieldValue = data[fieldName];
          const fieldType = typesMap[typeDescription?.name || ""]?.[fieldName];
          if (fieldType) {
            await recursiveFieldStructImplem(destructTypeFromString(fieldType), fieldValue, `${path}.${fieldName}`);
          }
        }
      } else {
        const filter2 = filters?.fields.find((f) => path === f.path);
        if (filter2) {
          await sendFilteringInfo(transport, "showField", loadConfig, {
            displayName: filter2.label,
            sig: filter2.signature,
            format: filter2.format,
            coinRef: filter2.coin_ref,
            chainId,
            erc20SignaturesBlob,
            shouldUseV1Filters,
            coinRefsTokensMap,
            isDiscarded: false
          });
        }
        await sendStructImplem(transport, {
          structType: "field",
          value: {
            data,
            type: typeDescription?.name || "",
            sizeInBits: typeDescription?.size
          }
        });
      }
    };
    return recursiveFieldStructImplem;
  };
  var sendStructDef = (transport, structDef) => {
    let APDU_FIELDS;
    (function(APDU_FIELDS2) {
      APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
      APDU_FIELDS2[APDU_FIELDS2["INS"] = 26] = "INS";
      APDU_FIELDS2[APDU_FIELDS2["P1_complete"] = 0] = "P1_complete";
      APDU_FIELDS2[APDU_FIELDS2["P1_partial"] = 1] = "P1_partial";
      APDU_FIELDS2[APDU_FIELDS2["P2_name"] = 0] = "P2_name";
      APDU_FIELDS2[APDU_FIELDS2["P2_field"] = 255] = "P2_field";
    })(APDU_FIELDS || (APDU_FIELDS = {}));
    const { structType, value } = structDef;
    const data = structType === "name" && typeof value === "string" ? import_buffer.Buffer.from(value, "utf-8") : value;
    return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_complete, structType === "name" ? APDU_FIELDS.P2_name : APDU_FIELDS.P2_field, data);
  };
  var sendStructImplem = async (transport, structImplem) => {
    let APDU_FIELDS;
    (function(APDU_FIELDS2) {
      APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
      APDU_FIELDS2[APDU_FIELDS2["INS"] = 28] = "INS";
      APDU_FIELDS2[APDU_FIELDS2["P1_complete"] = 0] = "P1_complete";
      APDU_FIELDS2[APDU_FIELDS2["P1_partial"] = 1] = "P1_partial";
      APDU_FIELDS2[APDU_FIELDS2["P2_root"] = 0] = "P2_root";
      APDU_FIELDS2[APDU_FIELDS2["P2_array"] = 15] = "P2_array";
      APDU_FIELDS2[APDU_FIELDS2["P2_field"] = 255] = "P2_field";
    })(APDU_FIELDS || (APDU_FIELDS = {}));
    const { structType, value } = structImplem;
    if (structType === "root") {
      return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_complete, APDU_FIELDS.P2_root, import_buffer.Buffer.from(value, "utf-8"));
    }
    if (structType === "array") {
      return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_complete, APDU_FIELDS.P2_array, import_buffer.Buffer.from(intAsHexBytes(value, 1), "hex"));
    }
    if (structType === "field") {
      const { data: rawData, type, sizeInBits } = value;
      const encodedData = EIP712_TYPE_ENCODERS[type.toUpperCase()]?.(rawData, sizeInBits);
      if (encodedData) {
        const dataLengthPer16Bits = Math.floor(encodedData.length / 256);
        const dataLengthModulo16Bits = encodedData.length % 256;
        const data = import_buffer.Buffer.concat([
          import_buffer.Buffer.from(intAsHexBytes(dataLengthPer16Bits, 1), "hex"),
          import_buffer.Buffer.from(intAsHexBytes(dataLengthModulo16Bits, 1), "hex"),
          encodedData
        ]);
        const bufferSlices = new Array(Math.ceil(data.length / 256)).fill(null).map((_, i) => data.subarray(i * 255, (i + 1) * 255));
        for (const bufferSlice of bufferSlices) {
          await transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, bufferSlice !== bufferSlices[bufferSlices.length - 1] ? APDU_FIELDS.P1_partial : APDU_FIELDS.P1_complete, APDU_FIELDS.P2_field, bufferSlice);
        }
      }
    }
    return Promise.resolve();
  };
  async function sendFilteringInfo(transport, type, loadConfig, data) {
    let APDU_FIELDS;
    (function(APDU_FIELDS2) {
      APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
      APDU_FIELDS2[APDU_FIELDS2["INS"] = 30] = "INS";
      APDU_FIELDS2[APDU_FIELDS2["P1_standard"] = 0] = "P1_standard";
      APDU_FIELDS2[APDU_FIELDS2["P1_discarded"] = 1] = "P1_discarded";
      APDU_FIELDS2[APDU_FIELDS2["P2_activate"] = 0] = "P2_activate";
      APDU_FIELDS2[APDU_FIELDS2["P2_discarded"] = 1] = "P2_discarded";
      APDU_FIELDS2[APDU_FIELDS2["P2_show_field"] = 255] = "P2_show_field";
      APDU_FIELDS2[APDU_FIELDS2["P2_message_info"] = 15] = "P2_message_info";
      APDU_FIELDS2[APDU_FIELDS2["P2_datetime"] = 252] = "P2_datetime";
      APDU_FIELDS2[APDU_FIELDS2["P2_amount_join_token"] = 253] = "P2_amount_join_token";
      APDU_FIELDS2[APDU_FIELDS2["P2_amount_join_value"] = 254] = "P2_amount_join_value";
      APDU_FIELDS2[APDU_FIELDS2["P2_raw"] = 255] = "P2_raw";
    })(APDU_FIELDS || (APDU_FIELDS = {}));
    switch (type) {
      case "activate":
        return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_discarded, APDU_FIELDS.P2_activate);
      case "contractName": {
        const { displayName, filtersCount, sig } = data;
        const { displayNameBuffer, sigBuffer } = getFilterDisplayNameAndSigBuffers(displayName, sig);
        const filtersCountBuffer = import_buffer.Buffer.from(intAsHexBytes(filtersCount, 1), "hex");
        const payload = import_buffer.Buffer.concat([displayNameBuffer, filtersCountBuffer, sigBuffer]);
        return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_standard, APDU_FIELDS.P2_message_info, payload);
      }
      case "showField": {
        const { displayName, sig, format, coinRef, chainId, coinRefsTokensMap, shouldUseV1Filters, erc20SignaturesBlob, isDiscarded } = data;
        const { displayNameBuffer, sigBuffer } = getFilterDisplayNameAndSigBuffers(displayName, sig);
        if (shouldUseV1Filters) {
          const payload2 = import_buffer.Buffer.concat([displayNameBuffer, sigBuffer]);
          return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_standard, APDU_FIELDS.P2_show_field, payload2);
        }
        const isTokenAddress = format === "token";
        if (isTokenAddress && coinRef !== void 0) {
          const { token, deviceTokenIndex } = coinRefsTokensMap[coinRef];
          if (deviceTokenIndex === void 0) {
            const payload2 = await byContractAddressAndChainId(token, chainId, erc20SignaturesBlob, loadConfig);
            if (payload2) {
              let PROVIDE_TOKEN_INFOS_APDU_FIELDS;
              (function(PROVIDE_TOKEN_INFOS_APDU_FIELDS2) {
                PROVIDE_TOKEN_INFOS_APDU_FIELDS2[PROVIDE_TOKEN_INFOS_APDU_FIELDS2["CLA"] = 224] = "CLA";
                PROVIDE_TOKEN_INFOS_APDU_FIELDS2[PROVIDE_TOKEN_INFOS_APDU_FIELDS2["INS"] = 10] = "INS";
                PROVIDE_TOKEN_INFOS_APDU_FIELDS2[PROVIDE_TOKEN_INFOS_APDU_FIELDS2["P1"] = 0] = "P1";
                PROVIDE_TOKEN_INFOS_APDU_FIELDS2[PROVIDE_TOKEN_INFOS_APDU_FIELDS2["P2"] = 0] = "P2";
              })(PROVIDE_TOKEN_INFOS_APDU_FIELDS || (PROVIDE_TOKEN_INFOS_APDU_FIELDS = {}));
              const response = await transport.send(PROVIDE_TOKEN_INFOS_APDU_FIELDS.CLA, PROVIDE_TOKEN_INFOS_APDU_FIELDS.INS, PROVIDE_TOKEN_INFOS_APDU_FIELDS.P1, PROVIDE_TOKEN_INFOS_APDU_FIELDS.P2, payload2.data);
              coinRefsTokensMap[coinRef].deviceTokenIndex = response[0];
            }
          }
        }
        const shouldUseVerifyingContract = format === "amount" && coinRef === 255;
        if (shouldUseVerifyingContract) {
          const { token } = coinRefsTokensMap[255];
          const payload2 = await byContractAddressAndChainId(token, chainId, erc20SignaturesBlob);
          if (payload2) {
            await transport.send(224, 10, 0, 0, payload2.data);
            coinRefsTokensMap[255].deviceTokenIndex = 255;
          }
        }
        if (!format) {
          throw new Error("Missing format");
        }
        const P2FormatMap = {
          raw: APDU_FIELDS.P2_raw,
          datetime: APDU_FIELDS.P2_datetime,
          token: APDU_FIELDS.P2_amount_join_token,
          amount: APDU_FIELDS.P2_amount_join_value
        };
        const payload = getPayloadForFilterV2(format, coinRef, coinRefsTokensMap, displayNameBuffer, sigBuffer);
        return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, isDiscarded ? APDU_FIELDS.P1_discarded : APDU_FIELDS.P1_standard, P2FormatMap[format], payload);
      }
      case "discardField": {
        const { path } = data;
        const pathBuffer = import_buffer.Buffer.from(path);
        const pathLengthBuffer = import_buffer.Buffer.from(intAsHexBytes(pathBuffer.length, 1), "hex");
        const payload = import_buffer.Buffer.concat([pathLengthBuffer, pathBuffer]);
        return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1_standard, APDU_FIELDS.P2_discarded, payload);
      }
    }
  }
  var signEIP712Message = async (transport, path, typedMessage, fullImplem = false, loadConfig) => {
    let APDU_FIELDS;
    (function(APDU_FIELDS2) {
      APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
      APDU_FIELDS2[APDU_FIELDS2["INS"] = 12] = "INS";
      APDU_FIELDS2[APDU_FIELDS2["P1"] = 0] = "P1";
      APDU_FIELDS2[APDU_FIELDS2["P2_v0"] = 0] = "P2_v0";
      APDU_FIELDS2[APDU_FIELDS2["P2_full"] = 1] = "P2_full";
    })(APDU_FIELDS || (APDU_FIELDS = {}));
    const { primaryType, types: unsortedTypes, domain, message } = typedMessage;
    const { calServiceURL, staticEIP712SignaturesV1, staticEIP712SignaturesV2 } = getLoadConfig(loadConfig);
    const types = sortObjectAlphabetically(unsortedTypes);
    const { version: version11 } = await getAppAndVersion(transport);
    const shouldUseV1Filters = !import_semver2.default.gte(version11, "1.11.1-0", { includePrerelease: true });
    const shouldUseDiscardedFields = import_semver2.default.gte(version11, "1.12.0-0", { includePrerelease: true });
    const filters = await getFiltersForMessage(typedMessage, shouldUseV1Filters, calServiceURL, staticEIP712SignaturesV1, staticEIP712SignaturesV2);
    const coinRefsTokensMap = getCoinRefTokensMap(filters, shouldUseV1Filters, typedMessage);
    const typeEntries = Object.entries(types);
    for (const [typeName, entries] of typeEntries) {
      await sendStructDef(transport, {
        structType: "name",
        value: typeName
      });
      for (const { name, type } of entries) {
        const typeEntryBuffer = makeTypeEntryStructBuffer({ name, type });
        await sendStructDef(transport, {
          structType: "field",
          value: typeEntryBuffer
        });
      }
    }
    if (filters) {
      await sendFilteringInfo(transport, "activate", loadConfig);
    }
    const erc20SignaturesBlob = !shouldUseV1Filters ? await findERC20SignaturesInfo(loadConfig, domain.chainId || 0) : void 0;
    const recursiveFieldStructImplem = makeRecursiveFieldStructImplem({
      transport,
      loadConfig,
      chainId: domain.chainId || 0,
      erc20SignaturesBlob,
      types,
      filters,
      shouldUseV1Filters,
      shouldUseDiscardedFields,
      coinRefsTokensMap
    });
    const domainName = "EIP712Domain";
    await sendStructImplem(transport, {
      structType: "root",
      value: domainName
    });
    const domainTypeFields = types[domainName];
    for (const { name, type } of domainTypeFields) {
      const domainFieldValue = domain[name];
      await recursiveFieldStructImplem(destructTypeFromString(type), domainFieldValue);
    }
    if (filters) {
      const { contractName, fields } = filters;
      const contractNameInfos = {
        displayName: contractName.label,
        filtersCount: fields.length,
        sig: contractName.signature
      };
      await sendFilteringInfo(transport, "contractName", loadConfig, contractNameInfos);
    }
    await sendStructImplem(transport, {
      structType: "root",
      value: primaryType
    });
    const primaryTypeFields = types[primaryType];
    for (const { name, type } of primaryTypeFields) {
      const primaryTypeValue = message[name];
      await recursiveFieldStructImplem(destructTypeFromString(type), primaryTypeValue, name);
    }
    const paths = splitPath(path);
    const signatureBuffer = import_buffer.Buffer.alloc(1 + paths.length * 4);
    signatureBuffer[0] = paths.length;
    paths.forEach((element, index) => {
      signatureBuffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1, fullImplem ? APDU_FIELDS.P2_v0 : APDU_FIELDS.P2_full, signatureBuffer).then((response) => {
      const v = response[0];
      const r = response.subarray(1, 1 + 32).toString("hex");
      const s = response.subarray(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    });
  };
  var signEIP712HashedMessage = (transport, path, domainSeparatorHex, hashStructMessageHex) => {
    const domainSeparator = hexBuffer(domainSeparatorHex);
    const hashStruct = hexBuffer(hashStructMessageHex);
    const paths = splitPath(path);
    const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 32 + 32, 0);
    let offset = 0;
    buffer[0] = paths.length;
    paths.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    offset = 1 + 4 * paths.length;
    domainSeparator.copy(buffer, offset);
    offset += 32;
    hashStruct.copy(buffer, offset);
    return transport.send(224, 12, 0, 0, buffer).then((response) => {
      const v = response[0];
      const r = response.subarray(1, 1 + 32).toString("hex");
      const s = response.subarray(1 + 32, 1 + 32 + 32).toString("hex");
      return {
        v,
        r,
        s
      };
    });
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/Domains/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/transactions/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/signing-key/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/signing-key/lib.esm/elliptic.js
  init_buffer_shim_entry();
  var import_bn2 = __toESM(require_bn());
  var import_hash = __toESM(require_hash());
  function createCommonjsModule(fn, basedir, module) {
    return module = {
      path: basedir,
      exports: {},
      require: function(path, base2) {
        return commonjsRequire(path, base2 === void 0 || base2 === null ? module.path : base2);
      }
    }, fn(module, module.exports), module.exports;
  }
  function commonjsRequire() {
    throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
  }
  var minimalisticAssert = assert;
  function assert(val, msg) {
    if (!val)
      throw new Error(msg || "Assertion failed");
  }
  assert.equal = function assertEqual(l, r, msg) {
    if (l != r)
      throw new Error(msg || "Assertion failed: " + l + " != " + r);
  };
  var utils_1 = createCommonjsModule(function(module, exports) {
    "use strict";
    var utils = exports;
    function toArray2(msg, enc) {
      if (Array.isArray(msg))
        return msg.slice();
      if (!msg)
        return [];
      var res = [];
      if (typeof msg !== "string") {
        for (var i = 0; i < msg.length; i++)
          res[i] = msg[i] | 0;
        return res;
      }
      if (enc === "hex") {
        msg = msg.replace(/[^a-z0-9]+/ig, "");
        if (msg.length % 2 !== 0)
          msg = "0" + msg;
        for (var i = 0; i < msg.length; i += 2)
          res.push(parseInt(msg[i] + msg[i + 1], 16));
      } else {
        for (var i = 0; i < msg.length; i++) {
          var c = msg.charCodeAt(i);
          var hi = c >> 8;
          var lo = c & 255;
          if (hi)
            res.push(hi, lo);
          else
            res.push(lo);
        }
      }
      return res;
    }
    utils.toArray = toArray2;
    function zero2(word) {
      if (word.length === 1)
        return "0" + word;
      else
        return word;
    }
    utils.zero2 = zero2;
    function toHex2(msg) {
      var res = "";
      for (var i = 0; i < msg.length; i++)
        res += zero2(msg[i].toString(16));
      return res;
    }
    utils.toHex = toHex2;
    utils.encode = function encode5(arr, enc) {
      if (enc === "hex")
        return toHex2(arr);
      else
        return arr;
    };
  });
  var utils_1$1 = createCommonjsModule(function(module, exports) {
    "use strict";
    var utils = exports;
    utils.assert = minimalisticAssert;
    utils.toArray = utils_1.toArray;
    utils.zero2 = utils_1.zero2;
    utils.toHex = utils_1.toHex;
    utils.encode = utils_1.encode;
    function getNAF2(num, w, bits) {
      var naf = new Array(Math.max(num.bitLength(), bits) + 1);
      var i;
      for (i = 0; i < naf.length; i += 1) {
        naf[i] = 0;
      }
      var ws = 1 << w + 1;
      var k = num.clone();
      for (i = 0; i < naf.length; i++) {
        var z;
        var mod = k.andln(ws - 1);
        if (k.isOdd()) {
          if (mod > (ws >> 1) - 1)
            z = (ws >> 1) - mod;
          else
            z = mod;
          k.isubn(z);
        } else {
          z = 0;
        }
        naf[i] = z;
        k.iushrn(1);
      }
      return naf;
    }
    utils.getNAF = getNAF2;
    function getJSF2(k1, k2) {
      var jsf = [
        [],
        []
      ];
      k1 = k1.clone();
      k2 = k2.clone();
      var d1 = 0;
      var d2 = 0;
      var m8;
      while (k1.cmpn(-d1) > 0 || k2.cmpn(-d2) > 0) {
        var m14 = k1.andln(3) + d1 & 3;
        var m24 = k2.andln(3) + d2 & 3;
        if (m14 === 3)
          m14 = -1;
        if (m24 === 3)
          m24 = -1;
        var u1;
        if ((m14 & 1) === 0) {
          u1 = 0;
        } else {
          m8 = k1.andln(7) + d1 & 7;
          if ((m8 === 3 || m8 === 5) && m24 === 2)
            u1 = -m14;
          else
            u1 = m14;
        }
        jsf[0].push(u1);
        var u2;
        if ((m24 & 1) === 0) {
          u2 = 0;
        } else {
          m8 = k2.andln(7) + d2 & 7;
          if ((m8 === 3 || m8 === 5) && m14 === 2)
            u2 = -m24;
          else
            u2 = m24;
        }
        jsf[1].push(u2);
        if (2 * d1 === u1 + 1)
          d1 = 1 - d1;
        if (2 * d2 === u2 + 1)
          d2 = 1 - d2;
        k1.iushrn(1);
        k2.iushrn(1);
      }
      return jsf;
    }
    utils.getJSF = getJSF2;
    function cachedProperty(obj, name, computer) {
      var key2 = "_" + name;
      obj.prototype[name] = function cachedProperty2() {
        return this[key2] !== void 0 ? this[key2] : this[key2] = computer.call(this);
      };
    }
    utils.cachedProperty = cachedProperty;
    function parseBytes(bytes) {
      return typeof bytes === "string" ? utils.toArray(bytes, "hex") : bytes;
    }
    utils.parseBytes = parseBytes;
    function intFromLE(bytes) {
      return new import_bn2.default(bytes, "hex", "le");
    }
    utils.intFromLE = intFromLE;
  });
  var getNAF = utils_1$1.getNAF;
  var getJSF = utils_1$1.getJSF;
  var assert$1 = utils_1$1.assert;
  function BaseCurve(type, conf) {
    this.type = type;
    this.p = new import_bn2.default(conf.p, 16);
    this.red = conf.prime ? import_bn2.default.red(conf.prime) : import_bn2.default.mont(this.p);
    this.zero = new import_bn2.default(0).toRed(this.red);
    this.one = new import_bn2.default(1).toRed(this.red);
    this.two = new import_bn2.default(2).toRed(this.red);
    this.n = conf.n && new import_bn2.default(conf.n, 16);
    this.g = conf.g && this.pointFromJSON(conf.g, conf.gRed);
    this._wnafT1 = new Array(4);
    this._wnafT2 = new Array(4);
    this._wnafT3 = new Array(4);
    this._wnafT4 = new Array(4);
    this._bitLength = this.n ? this.n.bitLength() : 0;
    var adjustCount = this.n && this.p.div(this.n);
    if (!adjustCount || adjustCount.cmpn(100) > 0) {
      this.redN = null;
    } else {
      this._maxwellTrick = true;
      this.redN = this.n.toRed(this.red);
    }
  }
  var base = BaseCurve;
  BaseCurve.prototype.point = function point() {
    throw new Error("Not implemented");
  };
  BaseCurve.prototype.validate = function validate() {
    throw new Error("Not implemented");
  };
  BaseCurve.prototype._fixedNafMul = function _fixedNafMul(p, k) {
    assert$1(p.precomputed);
    var doubles = p._getDoubles();
    var naf = getNAF(k, 1, this._bitLength);
    var I = (1 << doubles.step + 1) - (doubles.step % 2 === 0 ? 2 : 1);
    I /= 3;
    var repr = [];
    var j;
    var nafW;
    for (j = 0; j < naf.length; j += doubles.step) {
      nafW = 0;
      for (var l = j + doubles.step - 1; l >= j; l--)
        nafW = (nafW << 1) + naf[l];
      repr.push(nafW);
    }
    var a = this.jpoint(null, null, null);
    var b = this.jpoint(null, null, null);
    for (var i = I; i > 0; i--) {
      for (j = 0; j < repr.length; j++) {
        nafW = repr[j];
        if (nafW === i)
          b = b.mixedAdd(doubles.points[j]);
        else if (nafW === -i)
          b = b.mixedAdd(doubles.points[j].neg());
      }
      a = a.add(b);
    }
    return a.toP();
  };
  BaseCurve.prototype._wnafMul = function _wnafMul(p, k) {
    var w = 4;
    var nafPoints = p._getNAFPoints(w);
    w = nafPoints.wnd;
    var wnd = nafPoints.points;
    var naf = getNAF(k, w, this._bitLength);
    var acc = this.jpoint(null, null, null);
    for (var i = naf.length - 1; i >= 0; i--) {
      for (var l = 0; i >= 0 && naf[i] === 0; i--)
        l++;
      if (i >= 0)
        l++;
      acc = acc.dblp(l);
      if (i < 0)
        break;
      var z = naf[i];
      assert$1(z !== 0);
      if (p.type === "affine") {
        if (z > 0)
          acc = acc.mixedAdd(wnd[z - 1 >> 1]);
        else
          acc = acc.mixedAdd(wnd[-z - 1 >> 1].neg());
      } else {
        if (z > 0)
          acc = acc.add(wnd[z - 1 >> 1]);
        else
          acc = acc.add(wnd[-z - 1 >> 1].neg());
      }
    }
    return p.type === "affine" ? acc.toP() : acc;
  };
  BaseCurve.prototype._wnafMulAdd = function _wnafMulAdd(defW, points, coeffs, len, jacobianResult) {
    var wndWidth = this._wnafT1;
    var wnd = this._wnafT2;
    var naf = this._wnafT3;
    var max = 0;
    var i;
    var j;
    var p;
    for (i = 0; i < len; i++) {
      p = points[i];
      var nafPoints = p._getNAFPoints(defW);
      wndWidth[i] = nafPoints.wnd;
      wnd[i] = nafPoints.points;
    }
    for (i = len - 1; i >= 1; i -= 2) {
      var a = i - 1;
      var b = i;
      if (wndWidth[a] !== 1 || wndWidth[b] !== 1) {
        naf[a] = getNAF(coeffs[a], wndWidth[a], this._bitLength);
        naf[b] = getNAF(coeffs[b], wndWidth[b], this._bitLength);
        max = Math.max(naf[a].length, max);
        max = Math.max(naf[b].length, max);
        continue;
      }
      var comb = [
        points[a],
        /* 1 */
        null,
        /* 3 */
        null,
        /* 5 */
        points[b]
        /* 7 */
      ];
      if (points[a].y.cmp(points[b].y) === 0) {
        comb[1] = points[a].add(points[b]);
        comb[2] = points[a].toJ().mixedAdd(points[b].neg());
      } else if (points[a].y.cmp(points[b].y.redNeg()) === 0) {
        comb[1] = points[a].toJ().mixedAdd(points[b]);
        comb[2] = points[a].add(points[b].neg());
      } else {
        comb[1] = points[a].toJ().mixedAdd(points[b]);
        comb[2] = points[a].toJ().mixedAdd(points[b].neg());
      }
      var index = [
        -3,
        /* -1 -1 */
        -1,
        /* -1 0 */
        -5,
        /* -1 1 */
        -7,
        /* 0 -1 */
        0,
        /* 0 0 */
        7,
        /* 0 1 */
        5,
        /* 1 -1 */
        1,
        /* 1 0 */
        3
        /* 1 1 */
      ];
      var jsf = getJSF(coeffs[a], coeffs[b]);
      max = Math.max(jsf[0].length, max);
      naf[a] = new Array(max);
      naf[b] = new Array(max);
      for (j = 0; j < max; j++) {
        var ja = jsf[0][j] | 0;
        var jb = jsf[1][j] | 0;
        naf[a][j] = index[(ja + 1) * 3 + (jb + 1)];
        naf[b][j] = 0;
        wnd[a] = comb;
      }
    }
    var acc = this.jpoint(null, null, null);
    var tmp = this._wnafT4;
    for (i = max; i >= 0; i--) {
      var k = 0;
      while (i >= 0) {
        var zero = true;
        for (j = 0; j < len; j++) {
          tmp[j] = naf[j][i] | 0;
          if (tmp[j] !== 0)
            zero = false;
        }
        if (!zero)
          break;
        k++;
        i--;
      }
      if (i >= 0)
        k++;
      acc = acc.dblp(k);
      if (i < 0)
        break;
      for (j = 0; j < len; j++) {
        var z = tmp[j];
        p;
        if (z === 0)
          continue;
        else if (z > 0)
          p = wnd[j][z - 1 >> 1];
        else if (z < 0)
          p = wnd[j][-z - 1 >> 1].neg();
        if (p.type === "affine")
          acc = acc.mixedAdd(p);
        else
          acc = acc.add(p);
      }
    }
    for (i = 0; i < len; i++)
      wnd[i] = null;
    if (jacobianResult)
      return acc;
    else
      return acc.toP();
  };
  function BasePoint(curve, type) {
    this.curve = curve;
    this.type = type;
    this.precomputed = null;
  }
  BaseCurve.BasePoint = BasePoint;
  BasePoint.prototype.eq = function eq() {
    throw new Error("Not implemented");
  };
  BasePoint.prototype.validate = function validate2() {
    return this.curve.validate(this);
  };
  BaseCurve.prototype.decodePoint = function decodePoint(bytes, enc) {
    bytes = utils_1$1.toArray(bytes, enc);
    var len = this.p.byteLength();
    if ((bytes[0] === 4 || bytes[0] === 6 || bytes[0] === 7) && bytes.length - 1 === 2 * len) {
      if (bytes[0] === 6)
        assert$1(bytes[bytes.length - 1] % 2 === 0);
      else if (bytes[0] === 7)
        assert$1(bytes[bytes.length - 1] % 2 === 1);
      var res = this.point(
        bytes.slice(1, 1 + len),
        bytes.slice(1 + len, 1 + 2 * len)
      );
      return res;
    } else if ((bytes[0] === 2 || bytes[0] === 3) && bytes.length - 1 === len) {
      return this.pointFromX(bytes.slice(1, 1 + len), bytes[0] === 3);
    }
    throw new Error("Unknown point format");
  };
  BasePoint.prototype.encodeCompressed = function encodeCompressed(enc) {
    return this.encode(enc, true);
  };
  BasePoint.prototype._encode = function _encode2(compact) {
    var len = this.curve.p.byteLength();
    var x = this.getX().toArray("be", len);
    if (compact)
      return [this.getY().isEven() ? 2 : 3].concat(x);
    return [4].concat(x, this.getY().toArray("be", len));
  };
  BasePoint.prototype.encode = function encode4(enc, compact) {
    return utils_1$1.encode(this._encode(compact), enc);
  };
  BasePoint.prototype.precompute = function precompute(power) {
    if (this.precomputed)
      return this;
    var precomputed = {
      doubles: null,
      naf: null,
      beta: null
    };
    precomputed.naf = this._getNAFPoints(8);
    precomputed.doubles = this._getDoubles(4, power);
    precomputed.beta = this._getBeta();
    this.precomputed = precomputed;
    return this;
  };
  BasePoint.prototype._hasDoubles = function _hasDoubles(k) {
    if (!this.precomputed)
      return false;
    var doubles = this.precomputed.doubles;
    if (!doubles)
      return false;
    return doubles.points.length >= Math.ceil((k.bitLength() + 1) / doubles.step);
  };
  BasePoint.prototype._getDoubles = function _getDoubles(step, power) {
    if (this.precomputed && this.precomputed.doubles)
      return this.precomputed.doubles;
    var doubles = [this];
    var acc = this;
    for (var i = 0; i < power; i += step) {
      for (var j = 0; j < step; j++)
        acc = acc.dbl();
      doubles.push(acc);
    }
    return {
      step,
      points: doubles
    };
  };
  BasePoint.prototype._getNAFPoints = function _getNAFPoints(wnd) {
    if (this.precomputed && this.precomputed.naf)
      return this.precomputed.naf;
    var res = [this];
    var max = (1 << wnd) - 1;
    var dbl3 = max === 1 ? null : this.dbl();
    for (var i = 1; i < max; i++)
      res[i] = res[i - 1].add(dbl3);
    return {
      wnd,
      points: res
    };
  };
  BasePoint.prototype._getBeta = function _getBeta() {
    return null;
  };
  BasePoint.prototype.dblp = function dblp(k) {
    var r = this;
    for (var i = 0; i < k; i++)
      r = r.dbl();
    return r;
  };
  var inherits_browser = createCommonjsModule(function(module) {
    if (typeof Object.create === "function") {
      module.exports = function inherits2(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module.exports = function inherits2(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  });
  var assert$2 = utils_1$1.assert;
  function ShortCurve(conf) {
    base.call(this, "short", conf);
    this.a = new import_bn2.default(conf.a, 16).toRed(this.red);
    this.b = new import_bn2.default(conf.b, 16).toRed(this.red);
    this.tinv = this.two.redInvm();
    this.zeroA = this.a.fromRed().cmpn(0) === 0;
    this.threeA = this.a.fromRed().sub(this.p).cmpn(-3) === 0;
    this.endo = this._getEndomorphism(conf);
    this._endoWnafT1 = new Array(4);
    this._endoWnafT2 = new Array(4);
  }
  inherits_browser(ShortCurve, base);
  var short_1 = ShortCurve;
  ShortCurve.prototype._getEndomorphism = function _getEndomorphism(conf) {
    if (!this.zeroA || !this.g || !this.n || this.p.modn(3) !== 1)
      return;
    var beta;
    var lambda;
    if (conf.beta) {
      beta = new import_bn2.default(conf.beta, 16).toRed(this.red);
    } else {
      var betas = this._getEndoRoots(this.p);
      beta = betas[0].cmp(betas[1]) < 0 ? betas[0] : betas[1];
      beta = beta.toRed(this.red);
    }
    if (conf.lambda) {
      lambda = new import_bn2.default(conf.lambda, 16);
    } else {
      var lambdas = this._getEndoRoots(this.n);
      if (this.g.mul(lambdas[0]).x.cmp(this.g.x.redMul(beta)) === 0) {
        lambda = lambdas[0];
      } else {
        lambda = lambdas[1];
        assert$2(this.g.mul(lambda).x.cmp(this.g.x.redMul(beta)) === 0);
      }
    }
    var basis;
    if (conf.basis) {
      basis = conf.basis.map(function(vec) {
        return {
          a: new import_bn2.default(vec.a, 16),
          b: new import_bn2.default(vec.b, 16)
        };
      });
    } else {
      basis = this._getEndoBasis(lambda);
    }
    return {
      beta,
      lambda,
      basis
    };
  };
  ShortCurve.prototype._getEndoRoots = function _getEndoRoots(num) {
    var red = num === this.p ? this.red : import_bn2.default.mont(num);
    var tinv = new import_bn2.default(2).toRed(red).redInvm();
    var ntinv = tinv.redNeg();
    var s = new import_bn2.default(3).toRed(red).redNeg().redSqrt().redMul(tinv);
    var l1 = ntinv.redAdd(s).fromRed();
    var l2 = ntinv.redSub(s).fromRed();
    return [l1, l2];
  };
  ShortCurve.prototype._getEndoBasis = function _getEndoBasis(lambda) {
    var aprxSqrt = this.n.ushrn(Math.floor(this.n.bitLength() / 2));
    var u = lambda;
    var v = this.n.clone();
    var x1 = new import_bn2.default(1);
    var y1 = new import_bn2.default(0);
    var x2 = new import_bn2.default(0);
    var y2 = new import_bn2.default(1);
    var a0;
    var b0;
    var a1;
    var b1;
    var a2;
    var b2;
    var prevR;
    var i = 0;
    var r;
    var x;
    while (u.cmpn(0) !== 0) {
      var q = v.div(u);
      r = v.sub(q.mul(u));
      x = x2.sub(q.mul(x1));
      var y = y2.sub(q.mul(y1));
      if (!a1 && r.cmp(aprxSqrt) < 0) {
        a0 = prevR.neg();
        b0 = x1;
        a1 = r.neg();
        b1 = x;
      } else if (a1 && ++i === 2) {
        break;
      }
      prevR = r;
      v = u;
      u = r;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
    a2 = r.neg();
    b2 = x;
    var len1 = a1.sqr().add(b1.sqr());
    var len2 = a2.sqr().add(b2.sqr());
    if (len2.cmp(len1) >= 0) {
      a2 = a0;
      b2 = b0;
    }
    if (a1.negative) {
      a1 = a1.neg();
      b1 = b1.neg();
    }
    if (a2.negative) {
      a2 = a2.neg();
      b2 = b2.neg();
    }
    return [
      { a: a1, b: b1 },
      { a: a2, b: b2 }
    ];
  };
  ShortCurve.prototype._endoSplit = function _endoSplit(k) {
    var basis = this.endo.basis;
    var v1 = basis[0];
    var v2 = basis[1];
    var c1 = v2.b.mul(k).divRound(this.n);
    var c2 = v1.b.neg().mul(k).divRound(this.n);
    var p1 = c1.mul(v1.a);
    var p2 = c2.mul(v2.a);
    var q1 = c1.mul(v1.b);
    var q2 = c2.mul(v2.b);
    var k1 = k.sub(p1).sub(p2);
    var k2 = q1.add(q2).neg();
    return { k1, k2 };
  };
  ShortCurve.prototype.pointFromX = function pointFromX(x, odd) {
    x = new import_bn2.default(x, 16);
    if (!x.red)
      x = x.toRed(this.red);
    var y2 = x.redSqr().redMul(x).redIAdd(x.redMul(this.a)).redIAdd(this.b);
    var y = y2.redSqrt();
    if (y.redSqr().redSub(y2).cmp(this.zero) !== 0)
      throw new Error("invalid point");
    var isOdd2 = y.fromRed().isOdd();
    if (odd && !isOdd2 || !odd && isOdd2)
      y = y.redNeg();
    return this.point(x, y);
  };
  ShortCurve.prototype.validate = function validate3(point3) {
    if (point3.inf)
      return true;
    var x = point3.x;
    var y = point3.y;
    var ax = this.a.redMul(x);
    var rhs = x.redSqr().redMul(x).redIAdd(ax).redIAdd(this.b);
    return y.redSqr().redISub(rhs).cmpn(0) === 0;
  };
  ShortCurve.prototype._endoWnafMulAdd = function _endoWnafMulAdd(points, coeffs, jacobianResult) {
    var npoints = this._endoWnafT1;
    var ncoeffs = this._endoWnafT2;
    for (var i = 0; i < points.length; i++) {
      var split = this._endoSplit(coeffs[i]);
      var p = points[i];
      var beta = p._getBeta();
      if (split.k1.negative) {
        split.k1.ineg();
        p = p.neg(true);
      }
      if (split.k2.negative) {
        split.k2.ineg();
        beta = beta.neg(true);
      }
      npoints[i * 2] = p;
      npoints[i * 2 + 1] = beta;
      ncoeffs[i * 2] = split.k1;
      ncoeffs[i * 2 + 1] = split.k2;
    }
    var res = this._wnafMulAdd(1, npoints, ncoeffs, i * 2, jacobianResult);
    for (var j = 0; j < i * 2; j++) {
      npoints[j] = null;
      ncoeffs[j] = null;
    }
    return res;
  };
  function Point(curve, x, y, isRed) {
    base.BasePoint.call(this, curve, "affine");
    if (x === null && y === null) {
      this.x = null;
      this.y = null;
      this.inf = true;
    } else {
      this.x = new import_bn2.default(x, 16);
      this.y = new import_bn2.default(y, 16);
      if (isRed) {
        this.x.forceRed(this.curve.red);
        this.y.forceRed(this.curve.red);
      }
      if (!this.x.red)
        this.x = this.x.toRed(this.curve.red);
      if (!this.y.red)
        this.y = this.y.toRed(this.curve.red);
      this.inf = false;
    }
  }
  inherits_browser(Point, base.BasePoint);
  ShortCurve.prototype.point = function point2(x, y, isRed) {
    return new Point(this, x, y, isRed);
  };
  ShortCurve.prototype.pointFromJSON = function pointFromJSON(obj, red) {
    return Point.fromJSON(this, obj, red);
  };
  Point.prototype._getBeta = function _getBeta2() {
    if (!this.curve.endo)
      return;
    var pre = this.precomputed;
    if (pre && pre.beta)
      return pre.beta;
    var beta = this.curve.point(this.x.redMul(this.curve.endo.beta), this.y);
    if (pre) {
      var curve = this.curve;
      var endoMul = function(p) {
        return curve.point(p.x.redMul(curve.endo.beta), p.y);
      };
      pre.beta = beta;
      beta.precomputed = {
        beta: null,
        naf: pre.naf && {
          wnd: pre.naf.wnd,
          points: pre.naf.points.map(endoMul)
        },
        doubles: pre.doubles && {
          step: pre.doubles.step,
          points: pre.doubles.points.map(endoMul)
        }
      };
    }
    return beta;
  };
  Point.prototype.toJSON = function toJSON() {
    if (!this.precomputed)
      return [this.x, this.y];
    return [this.x, this.y, this.precomputed && {
      doubles: this.precomputed.doubles && {
        step: this.precomputed.doubles.step,
        points: this.precomputed.doubles.points.slice(1)
      },
      naf: this.precomputed.naf && {
        wnd: this.precomputed.naf.wnd,
        points: this.precomputed.naf.points.slice(1)
      }
    }];
  };
  Point.fromJSON = function fromJSON(curve, obj, red) {
    if (typeof obj === "string")
      obj = JSON.parse(obj);
    var res = curve.point(obj[0], obj[1], red);
    if (!obj[2])
      return res;
    function obj2point(obj2) {
      return curve.point(obj2[0], obj2[1], red);
    }
    var pre = obj[2];
    res.precomputed = {
      beta: null,
      doubles: pre.doubles && {
        step: pre.doubles.step,
        points: [res].concat(pre.doubles.points.map(obj2point))
      },
      naf: pre.naf && {
        wnd: pre.naf.wnd,
        points: [res].concat(pre.naf.points.map(obj2point))
      }
    };
    return res;
  };
  Point.prototype.inspect = function inspect() {
    if (this.isInfinity())
      return "<EC Point Infinity>";
    return "<EC Point x: " + this.x.fromRed().toString(16, 2) + " y: " + this.y.fromRed().toString(16, 2) + ">";
  };
  Point.prototype.isInfinity = function isInfinity() {
    return this.inf;
  };
  Point.prototype.add = function add(p) {
    if (this.inf)
      return p;
    if (p.inf)
      return this;
    if (this.eq(p))
      return this.dbl();
    if (this.neg().eq(p))
      return this.curve.point(null, null);
    if (this.x.cmp(p.x) === 0)
      return this.curve.point(null, null);
    var c = this.y.redSub(p.y);
    if (c.cmpn(0) !== 0)
      c = c.redMul(this.x.redSub(p.x).redInvm());
    var nx = c.redSqr().redISub(this.x).redISub(p.x);
    var ny = c.redMul(this.x.redSub(nx)).redISub(this.y);
    return this.curve.point(nx, ny);
  };
  Point.prototype.dbl = function dbl() {
    if (this.inf)
      return this;
    var ys1 = this.y.redAdd(this.y);
    if (ys1.cmpn(0) === 0)
      return this.curve.point(null, null);
    var a = this.curve.a;
    var x2 = this.x.redSqr();
    var dyinv = ys1.redInvm();
    var c = x2.redAdd(x2).redIAdd(x2).redIAdd(a).redMul(dyinv);
    var nx = c.redSqr().redISub(this.x.redAdd(this.x));
    var ny = c.redMul(this.x.redSub(nx)).redISub(this.y);
    return this.curve.point(nx, ny);
  };
  Point.prototype.getX = function getX() {
    return this.x.fromRed();
  };
  Point.prototype.getY = function getY() {
    return this.y.fromRed();
  };
  Point.prototype.mul = function mul(k) {
    k = new import_bn2.default(k, 16);
    if (this.isInfinity())
      return this;
    else if (this._hasDoubles(k))
      return this.curve._fixedNafMul(this, k);
    else if (this.curve.endo)
      return this.curve._endoWnafMulAdd([this], [k]);
    else
      return this.curve._wnafMul(this, k);
  };
  Point.prototype.mulAdd = function mulAdd(k1, p2, k2) {
    var points = [this, p2];
    var coeffs = [k1, k2];
    if (this.curve.endo)
      return this.curve._endoWnafMulAdd(points, coeffs);
    else
      return this.curve._wnafMulAdd(1, points, coeffs, 2);
  };
  Point.prototype.jmulAdd = function jmulAdd(k1, p2, k2) {
    var points = [this, p2];
    var coeffs = [k1, k2];
    if (this.curve.endo)
      return this.curve._endoWnafMulAdd(points, coeffs, true);
    else
      return this.curve._wnafMulAdd(1, points, coeffs, 2, true);
  };
  Point.prototype.eq = function eq2(p) {
    return this === p || this.inf === p.inf && (this.inf || this.x.cmp(p.x) === 0 && this.y.cmp(p.y) === 0);
  };
  Point.prototype.neg = function neg(_precompute) {
    if (this.inf)
      return this;
    var res = this.curve.point(this.x, this.y.redNeg());
    if (_precompute && this.precomputed) {
      var pre = this.precomputed;
      var negate = function(p) {
        return p.neg();
      };
      res.precomputed = {
        naf: pre.naf && {
          wnd: pre.naf.wnd,
          points: pre.naf.points.map(negate)
        },
        doubles: pre.doubles && {
          step: pre.doubles.step,
          points: pre.doubles.points.map(negate)
        }
      };
    }
    return res;
  };
  Point.prototype.toJ = function toJ() {
    if (this.inf)
      return this.curve.jpoint(null, null, null);
    var res = this.curve.jpoint(this.x, this.y, this.curve.one);
    return res;
  };
  function JPoint(curve, x, y, z) {
    base.BasePoint.call(this, curve, "jacobian");
    if (x === null && y === null && z === null) {
      this.x = this.curve.one;
      this.y = this.curve.one;
      this.z = new import_bn2.default(0);
    } else {
      this.x = new import_bn2.default(x, 16);
      this.y = new import_bn2.default(y, 16);
      this.z = new import_bn2.default(z, 16);
    }
    if (!this.x.red)
      this.x = this.x.toRed(this.curve.red);
    if (!this.y.red)
      this.y = this.y.toRed(this.curve.red);
    if (!this.z.red)
      this.z = this.z.toRed(this.curve.red);
    this.zOne = this.z === this.curve.one;
  }
  inherits_browser(JPoint, base.BasePoint);
  ShortCurve.prototype.jpoint = function jpoint(x, y, z) {
    return new JPoint(this, x, y, z);
  };
  JPoint.prototype.toP = function toP() {
    if (this.isInfinity())
      return this.curve.point(null, null);
    var zinv = this.z.redInvm();
    var zinv2 = zinv.redSqr();
    var ax = this.x.redMul(zinv2);
    var ay = this.y.redMul(zinv2).redMul(zinv);
    return this.curve.point(ax, ay);
  };
  JPoint.prototype.neg = function neg2() {
    return this.curve.jpoint(this.x, this.y.redNeg(), this.z);
  };
  JPoint.prototype.add = function add2(p) {
    if (this.isInfinity())
      return p;
    if (p.isInfinity())
      return this;
    var pz2 = p.z.redSqr();
    var z2 = this.z.redSqr();
    var u1 = this.x.redMul(pz2);
    var u2 = p.x.redMul(z2);
    var s1 = this.y.redMul(pz2.redMul(p.z));
    var s2 = p.y.redMul(z2.redMul(this.z));
    var h = u1.redSub(u2);
    var r = s1.redSub(s2);
    if (h.cmpn(0) === 0) {
      if (r.cmpn(0) !== 0)
        return this.curve.jpoint(null, null, null);
      else
        return this.dbl();
    }
    var h2 = h.redSqr();
    var h3 = h2.redMul(h);
    var v = u1.redMul(h2);
    var nx = r.redSqr().redIAdd(h3).redISub(v).redISub(v);
    var ny = r.redMul(v.redISub(nx)).redISub(s1.redMul(h3));
    var nz = this.z.redMul(p.z).redMul(h);
    return this.curve.jpoint(nx, ny, nz);
  };
  JPoint.prototype.mixedAdd = function mixedAdd(p) {
    if (this.isInfinity())
      return p.toJ();
    if (p.isInfinity())
      return this;
    var z2 = this.z.redSqr();
    var u1 = this.x;
    var u2 = p.x.redMul(z2);
    var s1 = this.y;
    var s2 = p.y.redMul(z2).redMul(this.z);
    var h = u1.redSub(u2);
    var r = s1.redSub(s2);
    if (h.cmpn(0) === 0) {
      if (r.cmpn(0) !== 0)
        return this.curve.jpoint(null, null, null);
      else
        return this.dbl();
    }
    var h2 = h.redSqr();
    var h3 = h2.redMul(h);
    var v = u1.redMul(h2);
    var nx = r.redSqr().redIAdd(h3).redISub(v).redISub(v);
    var ny = r.redMul(v.redISub(nx)).redISub(s1.redMul(h3));
    var nz = this.z.redMul(h);
    return this.curve.jpoint(nx, ny, nz);
  };
  JPoint.prototype.dblp = function dblp2(pow) {
    if (pow === 0)
      return this;
    if (this.isInfinity())
      return this;
    if (!pow)
      return this.dbl();
    var i;
    if (this.curve.zeroA || this.curve.threeA) {
      var r = this;
      for (i = 0; i < pow; i++)
        r = r.dbl();
      return r;
    }
    var a = this.curve.a;
    var tinv = this.curve.tinv;
    var jx = this.x;
    var jy = this.y;
    var jz = this.z;
    var jz4 = jz.redSqr().redSqr();
    var jyd = jy.redAdd(jy);
    for (i = 0; i < pow; i++) {
      var jx2 = jx.redSqr();
      var jyd2 = jyd.redSqr();
      var jyd4 = jyd2.redSqr();
      var c = jx2.redAdd(jx2).redIAdd(jx2).redIAdd(a.redMul(jz4));
      var t1 = jx.redMul(jyd2);
      var nx = c.redSqr().redISub(t1.redAdd(t1));
      var t2 = t1.redISub(nx);
      var dny = c.redMul(t2);
      dny = dny.redIAdd(dny).redISub(jyd4);
      var nz = jyd.redMul(jz);
      if (i + 1 < pow)
        jz4 = jz4.redMul(jyd4);
      jx = nx;
      jz = nz;
      jyd = dny;
    }
    return this.curve.jpoint(jx, jyd.redMul(tinv), jz);
  };
  JPoint.prototype.dbl = function dbl2() {
    if (this.isInfinity())
      return this;
    if (this.curve.zeroA)
      return this._zeroDbl();
    else if (this.curve.threeA)
      return this._threeDbl();
    else
      return this._dbl();
  };
  JPoint.prototype._zeroDbl = function _zeroDbl() {
    var nx;
    var ny;
    var nz;
    if (this.zOne) {
      var xx = this.x.redSqr();
      var yy = this.y.redSqr();
      var yyyy = yy.redSqr();
      var s = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
      s = s.redIAdd(s);
      var m = xx.redAdd(xx).redIAdd(xx);
      var t = m.redSqr().redISub(s).redISub(s);
      var yyyy8 = yyyy.redIAdd(yyyy);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      nx = t;
      ny = m.redMul(s.redISub(t)).redISub(yyyy8);
      nz = this.y.redAdd(this.y);
    } else {
      var a = this.x.redSqr();
      var b = this.y.redSqr();
      var c = b.redSqr();
      var d = this.x.redAdd(b).redSqr().redISub(a).redISub(c);
      d = d.redIAdd(d);
      var e = a.redAdd(a).redIAdd(a);
      var f = e.redSqr();
      var c8 = c.redIAdd(c);
      c8 = c8.redIAdd(c8);
      c8 = c8.redIAdd(c8);
      nx = f.redISub(d).redISub(d);
      ny = e.redMul(d.redISub(nx)).redISub(c8);
      nz = this.y.redMul(this.z);
      nz = nz.redIAdd(nz);
    }
    return this.curve.jpoint(nx, ny, nz);
  };
  JPoint.prototype._threeDbl = function _threeDbl() {
    var nx;
    var ny;
    var nz;
    if (this.zOne) {
      var xx = this.x.redSqr();
      var yy = this.y.redSqr();
      var yyyy = yy.redSqr();
      var s = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
      s = s.redIAdd(s);
      var m = xx.redAdd(xx).redIAdd(xx).redIAdd(this.curve.a);
      var t = m.redSqr().redISub(s).redISub(s);
      nx = t;
      var yyyy8 = yyyy.redIAdd(yyyy);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      ny = m.redMul(s.redISub(t)).redISub(yyyy8);
      nz = this.y.redAdd(this.y);
    } else {
      var delta = this.z.redSqr();
      var gamma = this.y.redSqr();
      var beta = this.x.redMul(gamma);
      var alpha = this.x.redSub(delta).redMul(this.x.redAdd(delta));
      alpha = alpha.redAdd(alpha).redIAdd(alpha);
      var beta4 = beta.redIAdd(beta);
      beta4 = beta4.redIAdd(beta4);
      var beta8 = beta4.redAdd(beta4);
      nx = alpha.redSqr().redISub(beta8);
      nz = this.y.redAdd(this.z).redSqr().redISub(gamma).redISub(delta);
      var ggamma8 = gamma.redSqr();
      ggamma8 = ggamma8.redIAdd(ggamma8);
      ggamma8 = ggamma8.redIAdd(ggamma8);
      ggamma8 = ggamma8.redIAdd(ggamma8);
      ny = alpha.redMul(beta4.redISub(nx)).redISub(ggamma8);
    }
    return this.curve.jpoint(nx, ny, nz);
  };
  JPoint.prototype._dbl = function _dbl() {
    var a = this.curve.a;
    var jx = this.x;
    var jy = this.y;
    var jz = this.z;
    var jz4 = jz.redSqr().redSqr();
    var jx2 = jx.redSqr();
    var jy2 = jy.redSqr();
    var c = jx2.redAdd(jx2).redIAdd(jx2).redIAdd(a.redMul(jz4));
    var jxd4 = jx.redAdd(jx);
    jxd4 = jxd4.redIAdd(jxd4);
    var t1 = jxd4.redMul(jy2);
    var nx = c.redSqr().redISub(t1.redAdd(t1));
    var t2 = t1.redISub(nx);
    var jyd8 = jy2.redSqr();
    jyd8 = jyd8.redIAdd(jyd8);
    jyd8 = jyd8.redIAdd(jyd8);
    jyd8 = jyd8.redIAdd(jyd8);
    var ny = c.redMul(t2).redISub(jyd8);
    var nz = jy.redAdd(jy).redMul(jz);
    return this.curve.jpoint(nx, ny, nz);
  };
  JPoint.prototype.trpl = function trpl() {
    if (!this.curve.zeroA)
      return this.dbl().add(this);
    var xx = this.x.redSqr();
    var yy = this.y.redSqr();
    var zz = this.z.redSqr();
    var yyyy = yy.redSqr();
    var m = xx.redAdd(xx).redIAdd(xx);
    var mm = m.redSqr();
    var e = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
    e = e.redIAdd(e);
    e = e.redAdd(e).redIAdd(e);
    e = e.redISub(mm);
    var ee = e.redSqr();
    var t = yyyy.redIAdd(yyyy);
    t = t.redIAdd(t);
    t = t.redIAdd(t);
    t = t.redIAdd(t);
    var u = m.redIAdd(e).redSqr().redISub(mm).redISub(ee).redISub(t);
    var yyu4 = yy.redMul(u);
    yyu4 = yyu4.redIAdd(yyu4);
    yyu4 = yyu4.redIAdd(yyu4);
    var nx = this.x.redMul(ee).redISub(yyu4);
    nx = nx.redIAdd(nx);
    nx = nx.redIAdd(nx);
    var ny = this.y.redMul(u.redMul(t.redISub(u)).redISub(e.redMul(ee)));
    ny = ny.redIAdd(ny);
    ny = ny.redIAdd(ny);
    ny = ny.redIAdd(ny);
    var nz = this.z.redAdd(e).redSqr().redISub(zz).redISub(ee);
    return this.curve.jpoint(nx, ny, nz);
  };
  JPoint.prototype.mul = function mul2(k, kbase) {
    k = new import_bn2.default(k, kbase);
    return this.curve._wnafMul(this, k);
  };
  JPoint.prototype.eq = function eq3(p) {
    if (p.type === "affine")
      return this.eq(p.toJ());
    if (this === p)
      return true;
    var z2 = this.z.redSqr();
    var pz2 = p.z.redSqr();
    if (this.x.redMul(pz2).redISub(p.x.redMul(z2)).cmpn(0) !== 0)
      return false;
    var z3 = z2.redMul(this.z);
    var pz3 = pz2.redMul(p.z);
    return this.y.redMul(pz3).redISub(p.y.redMul(z3)).cmpn(0) === 0;
  };
  JPoint.prototype.eqXToP = function eqXToP(x) {
    var zs = this.z.redSqr();
    var rx = x.toRed(this.curve.red).redMul(zs);
    if (this.x.cmp(rx) === 0)
      return true;
    var xc = x.clone();
    var t = this.curve.redN.redMul(zs);
    for (; ; ) {
      xc.iadd(this.curve.n);
      if (xc.cmp(this.curve.p) >= 0)
        return false;
      rx.redIAdd(t);
      if (this.x.cmp(rx) === 0)
        return true;
    }
  };
  JPoint.prototype.inspect = function inspect2() {
    if (this.isInfinity())
      return "<EC JPoint Infinity>";
    return "<EC JPoint x: " + this.x.toString(16, 2) + " y: " + this.y.toString(16, 2) + " z: " + this.z.toString(16, 2) + ">";
  };
  JPoint.prototype.isInfinity = function isInfinity2() {
    return this.z.cmpn(0) === 0;
  };
  var curve_1 = createCommonjsModule(function(module, exports) {
    "use strict";
    var curve = exports;
    curve.base = base;
    curve.short = short_1;
    curve.mont = /*RicMoo:ethers:require(./mont)*/
    null;
    curve.edwards = /*RicMoo:ethers:require(./edwards)*/
    null;
  });
  var curves_1 = createCommonjsModule(function(module, exports) {
    "use strict";
    var curves = exports;
    var assert2 = utils_1$1.assert;
    function PresetCurve(options) {
      if (options.type === "short")
        this.curve = new curve_1.short(options);
      else if (options.type === "edwards")
        this.curve = new curve_1.edwards(options);
      else
        this.curve = new curve_1.mont(options);
      this.g = this.curve.g;
      this.n = this.curve.n;
      this.hash = options.hash;
      assert2(this.g.validate(), "Invalid curve");
      assert2(this.g.mul(this.n).isInfinity(), "Invalid curve, G*N != O");
    }
    curves.PresetCurve = PresetCurve;
    function defineCurve(name, options) {
      Object.defineProperty(curves, name, {
        configurable: true,
        enumerable: true,
        get: function() {
          var curve = new PresetCurve(options);
          Object.defineProperty(curves, name, {
            configurable: true,
            enumerable: true,
            value: curve
          });
          return curve;
        }
      });
    }
    defineCurve("p192", {
      type: "short",
      prime: "p192",
      p: "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff",
      a: "ffffffff ffffffff ffffffff fffffffe ffffffff fffffffc",
      b: "64210519 e59c80e7 0fa7e9ab 72243049 feb8deec c146b9b1",
      n: "ffffffff ffffffff ffffffff 99def836 146bc9b1 b4d22831",
      hash: import_hash.default.sha256,
      gRed: false,
      g: [
        "188da80e b03090f6 7cbf20eb 43a18800 f4ff0afd 82ff1012",
        "07192b95 ffc8da78 631011ed 6b24cdd5 73f977a1 1e794811"
      ]
    });
    defineCurve("p224", {
      type: "short",
      prime: "p224",
      p: "ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001",
      a: "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff fffffffe",
      b: "b4050a85 0c04b3ab f5413256 5044b0b7 d7bfd8ba 270b3943 2355ffb4",
      n: "ffffffff ffffffff ffffffff ffff16a2 e0b8f03e 13dd2945 5c5c2a3d",
      hash: import_hash.default.sha256,
      gRed: false,
      g: [
        "b70e0cbd 6bb4bf7f 321390b9 4a03c1d3 56c21122 343280d6 115c1d21",
        "bd376388 b5f723fb 4c22dfe6 cd4375a0 5a074764 44d58199 85007e34"
      ]
    });
    defineCurve("p256", {
      type: "short",
      prime: null,
      p: "ffffffff 00000001 00000000 00000000 00000000 ffffffff ffffffff ffffffff",
      a: "ffffffff 00000001 00000000 00000000 00000000 ffffffff ffffffff fffffffc",
      b: "5ac635d8 aa3a93e7 b3ebbd55 769886bc 651d06b0 cc53b0f6 3bce3c3e 27d2604b",
      n: "ffffffff 00000000 ffffffff ffffffff bce6faad a7179e84 f3b9cac2 fc632551",
      hash: import_hash.default.sha256,
      gRed: false,
      g: [
        "6b17d1f2 e12c4247 f8bce6e5 63a440f2 77037d81 2deb33a0 f4a13945 d898c296",
        "4fe342e2 fe1a7f9b 8ee7eb4a 7c0f9e16 2bce3357 6b315ece cbb64068 37bf51f5"
      ]
    });
    defineCurve("p384", {
      type: "short",
      prime: null,
      p: "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe ffffffff 00000000 00000000 ffffffff",
      a: "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe ffffffff 00000000 00000000 fffffffc",
      b: "b3312fa7 e23ee7e4 988e056b e3f82d19 181d9c6e fe814112 0314088f 5013875a c656398d 8a2ed19d 2a85c8ed d3ec2aef",
      n: "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff c7634d81 f4372ddf 581a0db2 48b0a77a ecec196a ccc52973",
      hash: import_hash.default.sha384,
      gRed: false,
      g: [
        "aa87ca22 be8b0537 8eb1c71e f320ad74 6e1d3b62 8ba79b98 59f741e0 82542a38 5502f25d bf55296c 3a545e38 72760ab7",
        "3617de4a 96262c6f 5d9e98bf 9292dc29 f8f41dbd 289a147c e9da3113 b5f0b8c0 0a60b1ce 1d7e819d 7a431d7c 90ea0e5f"
      ]
    });
    defineCurve("p521", {
      type: "short",
      prime: null,
      p: "000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff",
      a: "000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffc",
      b: "00000051 953eb961 8e1c9a1f 929a21a0 b68540ee a2da725b 99b315f3 b8b48991 8ef109e1 56193951 ec7e937b 1652c0bd 3bb1bf07 3573df88 3d2c34f1 ef451fd4 6b503f00",
      n: "000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffa 51868783 bf2f966b 7fcc0148 f709a5d0 3bb5c9b8 899c47ae bb6fb71e 91386409",
      hash: import_hash.default.sha512,
      gRed: false,
      g: [
        "000000c6 858e06b7 0404e9cd 9e3ecb66 2395b442 9c648139 053fb521 f828af60 6b4d3dba a14b5e77 efe75928 fe1dc127 a2ffa8de 3348b3c1 856a429b f97e7e31 c2e5bd66",
        "00000118 39296a78 9a3bc004 5c8a5fb4 2c7d1bd9 98f54449 579b4468 17afbd17 273e662c 97ee7299 5ef42640 c550b901 3fad0761 353c7086 a272c240 88be9476 9fd16650"
      ]
    });
    defineCurve("curve25519", {
      type: "mont",
      prime: "p25519",
      p: "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed",
      a: "76d06",
      b: "1",
      n: "1000000000000000 0000000000000000 14def9dea2f79cd6 5812631a5cf5d3ed",
      hash: import_hash.default.sha256,
      gRed: false,
      g: [
        "9"
      ]
    });
    defineCurve("ed25519", {
      type: "edwards",
      prime: "p25519",
      p: "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed",
      a: "-1",
      c: "1",
      // -121665 * (121666^(-1)) (mod P)
      d: "52036cee2b6ffe73 8cc740797779e898 00700a4d4141d8ab 75eb4dca135978a3",
      n: "1000000000000000 0000000000000000 14def9dea2f79cd6 5812631a5cf5d3ed",
      hash: import_hash.default.sha256,
      gRed: false,
      g: [
        "216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a",
        // 4/5
        "6666666666666666666666666666666666666666666666666666666666666658"
      ]
    });
    var pre;
    try {
      pre = /*RicMoo:ethers:require(./precomputed/secp256k1)*/
      null.crash();
    } catch (e) {
      pre = void 0;
    }
    defineCurve("secp256k1", {
      type: "short",
      prime: "k256",
      p: "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f",
      a: "0",
      b: "7",
      n: "ffffffff ffffffff ffffffff fffffffe baaedce6 af48a03b bfd25e8c d0364141",
      h: "1",
      hash: import_hash.default.sha256,
      // Precomputed endomorphism
      beta: "7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee",
      lambda: "5363ad4cc05c30e0a5261c028812645a122e22ea20816678df02967c1b23bd72",
      basis: [
        {
          a: "3086d221a7d46bcde86c90e49284eb15",
          b: "-e4437ed6010e88286f547fa90abfe4c3"
        },
        {
          a: "114ca50f7a8e2f3f657c1108d9d44cfd8",
          b: "3086d221a7d46bcde86c90e49284eb15"
        }
      ],
      gRed: false,
      g: [
        "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
        "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
        pre
      ]
    });
  });
  function HmacDRBG(options) {
    if (!(this instanceof HmacDRBG))
      return new HmacDRBG(options);
    this.hash = options.hash;
    this.predResist = !!options.predResist;
    this.outLen = this.hash.outSize;
    this.minEntropy = options.minEntropy || this.hash.hmacStrength;
    this._reseed = null;
    this.reseedInterval = null;
    this.K = null;
    this.V = null;
    var entropy = utils_1.toArray(options.entropy, options.entropyEnc || "hex");
    var nonce = utils_1.toArray(options.nonce, options.nonceEnc || "hex");
    var pers = utils_1.toArray(options.pers, options.persEnc || "hex");
    minimalisticAssert(
      entropy.length >= this.minEntropy / 8,
      "Not enough entropy. Minimum is: " + this.minEntropy + " bits"
    );
    this._init(entropy, nonce, pers);
  }
  var hmacDrbg = HmacDRBG;
  HmacDRBG.prototype._init = function init(entropy, nonce, pers) {
    var seed = entropy.concat(nonce).concat(pers);
    this.K = new Array(this.outLen / 8);
    this.V = new Array(this.outLen / 8);
    for (var i = 0; i < this.V.length; i++) {
      this.K[i] = 0;
      this.V[i] = 1;
    }
    this._update(seed);
    this._reseed = 1;
    this.reseedInterval = 281474976710656;
  };
  HmacDRBG.prototype._hmac = function hmac() {
    return new import_hash.default.hmac(this.hash, this.K);
  };
  HmacDRBG.prototype._update = function update(seed) {
    var kmac = this._hmac().update(this.V).update([0]);
    if (seed)
      kmac = kmac.update(seed);
    this.K = kmac.digest();
    this.V = this._hmac().update(this.V).digest();
    if (!seed)
      return;
    this.K = this._hmac().update(this.V).update([1]).update(seed).digest();
    this.V = this._hmac().update(this.V).digest();
  };
  HmacDRBG.prototype.reseed = function reseed(entropy, entropyEnc, add3, addEnc) {
    if (typeof entropyEnc !== "string") {
      addEnc = add3;
      add3 = entropyEnc;
      entropyEnc = null;
    }
    entropy = utils_1.toArray(entropy, entropyEnc);
    add3 = utils_1.toArray(add3, addEnc);
    minimalisticAssert(
      entropy.length >= this.minEntropy / 8,
      "Not enough entropy. Minimum is: " + this.minEntropy + " bits"
    );
    this._update(entropy.concat(add3 || []));
    this._reseed = 1;
  };
  HmacDRBG.prototype.generate = function generate(len, enc, add3, addEnc) {
    if (this._reseed > this.reseedInterval)
      throw new Error("Reseed is required");
    if (typeof enc !== "string") {
      addEnc = add3;
      add3 = enc;
      enc = null;
    }
    if (add3) {
      add3 = utils_1.toArray(add3, addEnc || "hex");
      this._update(add3);
    }
    var temp = [];
    while (temp.length < len) {
      this.V = this._hmac().update(this.V).digest();
      temp = temp.concat(this.V);
    }
    var res = temp.slice(0, len);
    this._update(add3);
    this._reseed++;
    return utils_1.encode(res, enc);
  };
  var assert$3 = utils_1$1.assert;
  function KeyPair(ec2, options) {
    this.ec = ec2;
    this.priv = null;
    this.pub = null;
    if (options.priv)
      this._importPrivate(options.priv, options.privEnc);
    if (options.pub)
      this._importPublic(options.pub, options.pubEnc);
  }
  var key = KeyPair;
  KeyPair.fromPublic = function fromPublic(ec2, pub, enc) {
    if (pub instanceof KeyPair)
      return pub;
    return new KeyPair(ec2, {
      pub,
      pubEnc: enc
    });
  };
  KeyPair.fromPrivate = function fromPrivate(ec2, priv, enc) {
    if (priv instanceof KeyPair)
      return priv;
    return new KeyPair(ec2, {
      priv,
      privEnc: enc
    });
  };
  KeyPair.prototype.validate = function validate4() {
    var pub = this.getPublic();
    if (pub.isInfinity())
      return { result: false, reason: "Invalid public key" };
    if (!pub.validate())
      return { result: false, reason: "Public key is not a point" };
    if (!pub.mul(this.ec.curve.n).isInfinity())
      return { result: false, reason: "Public key * N != O" };
    return { result: true, reason: null };
  };
  KeyPair.prototype.getPublic = function getPublic(compact, enc) {
    if (typeof compact === "string") {
      enc = compact;
      compact = null;
    }
    if (!this.pub)
      this.pub = this.ec.g.mul(this.priv);
    if (!enc)
      return this.pub;
    return this.pub.encode(enc, compact);
  };
  KeyPair.prototype.getPrivate = function getPrivate(enc) {
    if (enc === "hex")
      return this.priv.toString(16, 2);
    else
      return this.priv;
  };
  KeyPair.prototype._importPrivate = function _importPrivate(key2, enc) {
    this.priv = new import_bn2.default(key2, enc || 16);
    this.priv = this.priv.umod(this.ec.curve.n);
  };
  KeyPair.prototype._importPublic = function _importPublic(key2, enc) {
    if (key2.x || key2.y) {
      if (this.ec.curve.type === "mont") {
        assert$3(key2.x, "Need x coordinate");
      } else if (this.ec.curve.type === "short" || this.ec.curve.type === "edwards") {
        assert$3(key2.x && key2.y, "Need both x and y coordinate");
      }
      this.pub = this.ec.curve.point(key2.x, key2.y);
      return;
    }
    this.pub = this.ec.curve.decodePoint(key2, enc);
  };
  KeyPair.prototype.derive = function derive(pub) {
    if (!pub.validate()) {
      assert$3(pub.validate(), "public point not validated");
    }
    return pub.mul(this.priv).getX();
  };
  KeyPair.prototype.sign = function sign(msg, enc, options) {
    return this.ec.sign(msg, this, enc, options);
  };
  KeyPair.prototype.verify = function verify(msg, signature2, options) {
    return this.ec.verify(msg, signature2, this, void 0, options);
  };
  KeyPair.prototype.inspect = function inspect3() {
    return "<Key priv: " + (this.priv && this.priv.toString(16, 2)) + " pub: " + (this.pub && this.pub.inspect()) + " >";
  };
  var assert$4 = utils_1$1.assert;
  function Signature(options, enc) {
    if (options instanceof Signature)
      return options;
    if (this._importDER(options, enc))
      return;
    assert$4(options.r && options.s, "Signature without r or s");
    this.r = new import_bn2.default(options.r, 16);
    this.s = new import_bn2.default(options.s, 16);
    if (options.recoveryParam === void 0)
      this.recoveryParam = null;
    else
      this.recoveryParam = options.recoveryParam;
  }
  var signature = Signature;
  function Position() {
    this.place = 0;
  }
  function getLength(buf, p) {
    var initial = buf[p.place++];
    if (!(initial & 128)) {
      return initial;
    }
    var octetLen = initial & 15;
    if (octetLen === 0 || octetLen > 4) {
      return false;
    }
    if (buf[p.place] === 0) {
      return false;
    }
    var val = 0;
    for (var i = 0, off = p.place; i < octetLen; i++, off++) {
      val <<= 8;
      val |= buf[off];
      val >>>= 0;
    }
    if (val <= 127) {
      return false;
    }
    p.place = off;
    return val;
  }
  function rmPadding(buf) {
    var i = 0;
    var len = buf.length - 1;
    while (!buf[i] && !(buf[i + 1] & 128) && i < len) {
      i++;
    }
    if (i === 0) {
      return buf;
    }
    return buf.slice(i);
  }
  Signature.prototype._importDER = function _importDER(data, enc) {
    data = utils_1$1.toArray(data, enc);
    var p = new Position();
    if (data[p.place++] !== 48) {
      return false;
    }
    var len = getLength(data, p);
    if (len === false) {
      return false;
    }
    if (len + p.place !== data.length) {
      return false;
    }
    if (data[p.place++] !== 2) {
      return false;
    }
    var rlen = getLength(data, p);
    if (rlen === false) {
      return false;
    }
    if ((data[p.place] & 128) !== 0) {
      return false;
    }
    var r = data.slice(p.place, rlen + p.place);
    p.place += rlen;
    if (data[p.place++] !== 2) {
      return false;
    }
    var slen = getLength(data, p);
    if (slen === false) {
      return false;
    }
    if (data.length !== slen + p.place) {
      return false;
    }
    if ((data[p.place] & 128) !== 0) {
      return false;
    }
    var s = data.slice(p.place, slen + p.place);
    if (r[0] === 0) {
      if (r[1] & 128) {
        r = r.slice(1);
      } else {
        return false;
      }
    }
    if (s[0] === 0) {
      if (s[1] & 128) {
        s = s.slice(1);
      } else {
        return false;
      }
    }
    this.r = new import_bn2.default(r);
    this.s = new import_bn2.default(s);
    this.recoveryParam = null;
    return true;
  };
  function constructLength(arr, len) {
    if (len < 128) {
      arr.push(len);
      return;
    }
    var octets = 1 + (Math.log(len) / Math.LN2 >>> 3);
    arr.push(octets | 128);
    while (--octets) {
      arr.push(len >>> (octets << 3) & 255);
    }
    arr.push(len);
  }
  Signature.prototype.toDER = function toDER(enc) {
    var r = this.r.toArray();
    var s = this.s.toArray();
    if (r[0] & 128)
      r = [0].concat(r);
    if (s[0] & 128)
      s = [0].concat(s);
    r = rmPadding(r);
    s = rmPadding(s);
    while (!s[0] && !(s[1] & 128)) {
      s = s.slice(1);
    }
    var arr = [2];
    constructLength(arr, r.length);
    arr = arr.concat(r);
    arr.push(2);
    constructLength(arr, s.length);
    var backHalf = arr.concat(s);
    var res = [48];
    constructLength(res, backHalf.length);
    res = res.concat(backHalf);
    return utils_1$1.encode(res, enc);
  };
  var rand = (
    /*RicMoo:ethers:require(brorand)*/
    (function() {
      throw new Error("unsupported");
    })
  );
  var assert$5 = utils_1$1.assert;
  function EC(options) {
    if (!(this instanceof EC))
      return new EC(options);
    if (typeof options === "string") {
      assert$5(
        Object.prototype.hasOwnProperty.call(curves_1, options),
        "Unknown curve " + options
      );
      options = curves_1[options];
    }
    if (options instanceof curves_1.PresetCurve)
      options = { curve: options };
    this.curve = options.curve.curve;
    this.n = this.curve.n;
    this.nh = this.n.ushrn(1);
    this.g = this.curve.g;
    this.g = options.curve.g;
    this.g.precompute(options.curve.n.bitLength() + 1);
    this.hash = options.hash || options.curve.hash;
  }
  var ec = EC;
  EC.prototype.keyPair = function keyPair(options) {
    return new key(this, options);
  };
  EC.prototype.keyFromPrivate = function keyFromPrivate(priv, enc) {
    return key.fromPrivate(this, priv, enc);
  };
  EC.prototype.keyFromPublic = function keyFromPublic(pub, enc) {
    return key.fromPublic(this, pub, enc);
  };
  EC.prototype.genKeyPair = function genKeyPair(options) {
    if (!options)
      options = {};
    var drbg = new hmacDrbg({
      hash: this.hash,
      pers: options.pers,
      persEnc: options.persEnc || "utf8",
      entropy: options.entropy || rand(this.hash.hmacStrength),
      entropyEnc: options.entropy && options.entropyEnc || "utf8",
      nonce: this.n.toArray()
    });
    var bytes = this.n.byteLength();
    var ns2 = this.n.sub(new import_bn2.default(2));
    for (; ; ) {
      var priv = new import_bn2.default(drbg.generate(bytes));
      if (priv.cmp(ns2) > 0)
        continue;
      priv.iaddn(1);
      return this.keyFromPrivate(priv);
    }
  };
  EC.prototype._truncateToN = function _truncateToN(msg, truncOnly, bitLength) {
    var byteLength;
    if (import_bn2.default.isBN(msg) || typeof msg === "number") {
      msg = new import_bn2.default(msg, 16);
      byteLength = msg.byteLength();
    } else if (typeof msg === "object") {
      byteLength = msg.length;
      msg = new import_bn2.default(msg, 16);
    } else {
      var str = msg.toString();
      byteLength = str.length + 1 >>> 1;
      msg = new import_bn2.default(str, 16);
    }
    if (typeof bitLength !== "number") {
      bitLength = byteLength * 8;
    }
    var delta = bitLength - this.n.bitLength();
    if (delta > 0)
      msg = msg.ushrn(delta);
    if (!truncOnly && msg.cmp(this.n) >= 0)
      return msg.sub(this.n);
    else
      return msg;
  };
  EC.prototype.sign = function sign2(msg, key2, enc, options) {
    if (typeof enc === "object") {
      options = enc;
      enc = null;
    }
    if (!options)
      options = {};
    if (typeof msg !== "string" && typeof msg !== "number" && !import_bn2.default.isBN(msg)) {
      assert$5(
        typeof msg === "object" && msg && typeof msg.length === "number",
        "Expected message to be an array-like, a hex string, or a BN instance"
      );
      assert$5(msg.length >>> 0 === msg.length);
      for (var i = 0; i < msg.length; i++) assert$5((msg[i] & 255) === msg[i]);
    }
    key2 = this.keyFromPrivate(key2, enc);
    msg = this._truncateToN(msg, false, options.msgBitLength);
    assert$5(!msg.isNeg(), "Can not sign a negative message");
    var bytes = this.n.byteLength();
    var bkey = key2.getPrivate().toArray("be", bytes);
    var nonce = msg.toArray("be", bytes);
    assert$5(new import_bn2.default(nonce).eq(msg), "Can not sign message");
    var drbg = new hmacDrbg({
      hash: this.hash,
      entropy: bkey,
      nonce,
      pers: options.pers,
      persEnc: options.persEnc || "utf8"
    });
    var ns1 = this.n.sub(new import_bn2.default(1));
    for (var iter = 0; ; iter++) {
      var k = options.k ? options.k(iter) : new import_bn2.default(drbg.generate(this.n.byteLength()));
      k = this._truncateToN(k, true);
      if (k.cmpn(1) <= 0 || k.cmp(ns1) >= 0)
        continue;
      var kp = this.g.mul(k);
      if (kp.isInfinity())
        continue;
      var kpX = kp.getX();
      var r = kpX.umod(this.n);
      if (r.cmpn(0) === 0)
        continue;
      var s = k.invm(this.n).mul(r.mul(key2.getPrivate()).iadd(msg));
      s = s.umod(this.n);
      if (s.cmpn(0) === 0)
        continue;
      var recoveryParam = (kp.getY().isOdd() ? 1 : 0) | (kpX.cmp(r) !== 0 ? 2 : 0);
      if (options.canonical && s.cmp(this.nh) > 0) {
        s = this.n.sub(s);
        recoveryParam ^= 1;
      }
      return new signature({ r, s, recoveryParam });
    }
  };
  EC.prototype.verify = function verify2(msg, signature$1, key2, enc, options) {
    if (!options)
      options = {};
    msg = this._truncateToN(msg, false, options.msgBitLength);
    key2 = this.keyFromPublic(key2, enc);
    signature$1 = new signature(signature$1, "hex");
    var r = signature$1.r;
    var s = signature$1.s;
    if (r.cmpn(1) < 0 || r.cmp(this.n) >= 0)
      return false;
    if (s.cmpn(1) < 0 || s.cmp(this.n) >= 0)
      return false;
    var sinv = s.invm(this.n);
    var u1 = sinv.mul(msg).umod(this.n);
    var u2 = sinv.mul(r).umod(this.n);
    var p;
    if (!this.curve._maxwellTrick) {
      p = this.g.mulAdd(u1, key2.getPublic(), u2);
      if (p.isInfinity())
        return false;
      return p.getX().umod(this.n).cmp(r) === 0;
    }
    p = this.g.jmulAdd(u1, key2.getPublic(), u2);
    if (p.isInfinity())
      return false;
    return p.eqXToP(r);
  };
  EC.prototype.recoverPubKey = function(msg, signature$1, j, enc) {
    assert$5((3 & j) === j, "The recovery param is more than two bits");
    signature$1 = new signature(signature$1, enc);
    var n = this.n;
    var e = new import_bn2.default(msg);
    var r = signature$1.r;
    var s = signature$1.s;
    var isYOdd = j & 1;
    var isSecondKey = j >> 1;
    if (r.cmp(this.curve.p.umod(this.curve.n)) >= 0 && isSecondKey)
      throw new Error("Unable to find sencond key candinate");
    if (isSecondKey)
      r = this.curve.pointFromX(r.add(this.curve.n), isYOdd);
    else
      r = this.curve.pointFromX(r, isYOdd);
    var rInv = signature$1.r.invm(n);
    var s1 = n.sub(e).mul(rInv).umod(n);
    var s2 = s.mul(rInv).umod(n);
    return this.g.mulAdd(s1, r, s2);
  };
  EC.prototype.getKeyRecoveryParam = function(e, signature$1, Q, enc) {
    signature$1 = new signature(signature$1, enc);
    if (signature$1.recoveryParam !== null)
      return signature$1.recoveryParam;
    for (var i = 0; i < 4; i++) {
      var Qprime;
      try {
        Qprime = this.recoverPubKey(e, signature$1, i);
      } catch (e2) {
        continue;
      }
      if (Qprime.eq(Q))
        return i;
    }
    throw new Error("Unable to find valid recovery factor");
  };
  var elliptic_1 = createCommonjsModule(function(module, exports) {
    "use strict";
    var elliptic = exports;
    elliptic.version = /*RicMoo:ethers*/
    { version: "6.6.1" }.version;
    elliptic.utils = utils_1$1;
    elliptic.rand = /*RicMoo:ethers:require(brorand)*/
    (function() {
      throw new Error("unsupported");
    });
    elliptic.curve = curve_1;
    elliptic.curves = curves_1;
    elliptic.ec = ec;
    elliptic.eddsa = /*RicMoo:ethers:require(./elliptic/eddsa)*/
    null;
  });
  var EC$1 = elliptic_1.ec;

  // node_modules/@ethersproject/signing-key/lib.esm/_version.js
  init_buffer_shim_entry();
  var version8 = "signing-key/5.8.0";

  // node_modules/@ethersproject/signing-key/lib.esm/index.js
  var logger7 = new Logger(version8);
  var _curve = null;
  function getCurve() {
    if (!_curve) {
      _curve = new EC$1("secp256k1");
    }
    return _curve;
  }
  var SigningKey = class {
    constructor(privateKey) {
      defineReadOnly(this, "curve", "secp256k1");
      defineReadOnly(this, "privateKey", hexlify(privateKey));
      if (hexDataLength(this.privateKey) !== 32) {
        logger7.throwArgumentError("invalid private key", "privateKey", "[[ REDACTED ]]");
      }
      const keyPair2 = getCurve().keyFromPrivate(arrayify(this.privateKey));
      defineReadOnly(this, "publicKey", "0x" + keyPair2.getPublic(false, "hex"));
      defineReadOnly(this, "compressedPublicKey", "0x" + keyPair2.getPublic(true, "hex"));
      defineReadOnly(this, "_isSigningKey", true);
    }
    _addPoint(other) {
      const p0 = getCurve().keyFromPublic(arrayify(this.publicKey));
      const p1 = getCurve().keyFromPublic(arrayify(other));
      return "0x" + p0.pub.add(p1.pub).encodeCompressed("hex");
    }
    signDigest(digest) {
      const keyPair2 = getCurve().keyFromPrivate(arrayify(this.privateKey));
      const digestBytes = arrayify(digest);
      if (digestBytes.length !== 32) {
        logger7.throwArgumentError("bad digest length", "digest", digest);
      }
      const signature2 = keyPair2.sign(digestBytes, { canonical: true });
      return splitSignature({
        recoveryParam: signature2.recoveryParam,
        r: hexZeroPad("0x" + signature2.r.toString(16), 32),
        s: hexZeroPad("0x" + signature2.s.toString(16), 32)
      });
    }
    computeSharedSecret(otherKey) {
      const keyPair2 = getCurve().keyFromPrivate(arrayify(this.privateKey));
      const otherKeyPair = getCurve().keyFromPublic(arrayify(computePublicKey(otherKey)));
      return hexZeroPad("0x" + keyPair2.derive(otherKeyPair.getPublic()).toString(16), 32);
    }
    static isSigningKey(value) {
      return !!(value && value._isSigningKey);
    }
  };
  function recoverPublicKey(digest, signature2) {
    const sig = splitSignature(signature2);
    const rs = { r: arrayify(sig.r), s: arrayify(sig.s) };
    return "0x" + getCurve().recoverPubKey(arrayify(digest), rs, sig.recoveryParam).encode("hex", false);
  }
  function computePublicKey(key2, compressed) {
    const bytes = arrayify(key2);
    if (bytes.length === 32) {
      const signingKey = new SigningKey(bytes);
      if (compressed) {
        return "0x" + getCurve().keyFromPrivate(bytes).getPublic(true, "hex");
      }
      return signingKey.publicKey;
    } else if (bytes.length === 33) {
      if (compressed) {
        return hexlify(bytes);
      }
      return "0x" + getCurve().keyFromPublic(bytes).getPublic(false, "hex");
    } else if (bytes.length === 65) {
      if (!compressed) {
        return hexlify(bytes);
      }
      return "0x" + getCurve().keyFromPublic(bytes).getPublic(true, "hex");
    }
    return logger7.throwArgumentError("invalid public or private key", "key", "[REDACTED]");
  }

  // node_modules/@ethersproject/transactions/lib.esm/_version.js
  init_buffer_shim_entry();
  var version9 = "transactions/5.8.0";

  // node_modules/@ethersproject/transactions/lib.esm/index.js
  var logger8 = new Logger(version9);
  var TransactionTypes;
  (function(TransactionTypes2) {
    TransactionTypes2[TransactionTypes2["legacy"] = 0] = "legacy";
    TransactionTypes2[TransactionTypes2["eip2930"] = 1] = "eip2930";
    TransactionTypes2[TransactionTypes2["eip1559"] = 2] = "eip1559";
  })(TransactionTypes || (TransactionTypes = {}));
  function handleAddress(value) {
    if (value === "0x") {
      return null;
    }
    return getAddress(value);
  }
  function handleNumber(value) {
    if (value === "0x") {
      return Zero;
    }
    return BigNumber2.from(value);
  }
  function computeAddress(key2) {
    const publicKey = computePublicKey(key2);
    return getAddress(hexDataSlice(keccak256(hexDataSlice(publicKey, 1)), 12));
  }
  function recoverAddress(digest, signature2) {
    return computeAddress(recoverPublicKey(arrayify(digest), signature2));
  }
  function formatNumber(value, name) {
    const result = stripZeros(BigNumber2.from(value).toHexString());
    if (result.length > 32) {
      logger8.throwArgumentError("invalid length for " + name, "transaction:" + name, value);
    }
    return result;
  }
  function accessSetify(addr, storageKeys) {
    return {
      address: getAddress(addr),
      storageKeys: (storageKeys || []).map((storageKey, index) => {
        if (hexDataLength(storageKey) !== 32) {
          logger8.throwArgumentError("invalid access list storageKey", `accessList[${addr}:${index}]`, storageKey);
        }
        return storageKey.toLowerCase();
      })
    };
  }
  function accessListify(value) {
    if (Array.isArray(value)) {
      return value.map((set, index) => {
        if (Array.isArray(set)) {
          if (set.length > 2) {
            logger8.throwArgumentError("access list expected to be [ address, storageKeys[] ]", `value[${index}]`, set);
          }
          return accessSetify(set[0], set[1]);
        }
        return accessSetify(set.address, set.storageKeys);
      });
    }
    const result = Object.keys(value).map((addr) => {
      const storageKeys = value[addr].reduce((accum, storageKey) => {
        accum[storageKey] = true;
        return accum;
      }, {});
      return accessSetify(addr, Object.keys(storageKeys).sort());
    });
    result.sort((a, b) => a.address.localeCompare(b.address));
    return result;
  }
  function formatAccessList(value) {
    return accessListify(value).map((set) => [set.address, set.storageKeys]);
  }
  function _serializeEip1559(transaction, signature2) {
    if (transaction.gasPrice != null) {
      const gasPrice = BigNumber2.from(transaction.gasPrice);
      const maxFeePerGas = BigNumber2.from(transaction.maxFeePerGas || 0);
      if (!gasPrice.eq(maxFeePerGas)) {
        logger8.throwArgumentError("mismatch EIP-1559 gasPrice != maxFeePerGas", "tx", {
          gasPrice,
          maxFeePerGas
        });
      }
    }
    const fields = [
      formatNumber(transaction.chainId || 0, "chainId"),
      formatNumber(transaction.nonce || 0, "nonce"),
      formatNumber(transaction.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
      formatNumber(transaction.maxFeePerGas || 0, "maxFeePerGas"),
      formatNumber(transaction.gasLimit || 0, "gasLimit"),
      transaction.to != null ? getAddress(transaction.to) : "0x",
      formatNumber(transaction.value || 0, "value"),
      transaction.data || "0x",
      formatAccessList(transaction.accessList || [])
    ];
    if (signature2) {
      const sig = splitSignature(signature2);
      fields.push(formatNumber(sig.recoveryParam, "recoveryParam"));
      fields.push(stripZeros(sig.r));
      fields.push(stripZeros(sig.s));
    }
    return hexConcat(["0x02", encode3(fields)]);
  }
  function _serializeEip2930(transaction, signature2) {
    const fields = [
      formatNumber(transaction.chainId || 0, "chainId"),
      formatNumber(transaction.nonce || 0, "nonce"),
      formatNumber(transaction.gasPrice || 0, "gasPrice"),
      formatNumber(transaction.gasLimit || 0, "gasLimit"),
      transaction.to != null ? getAddress(transaction.to) : "0x",
      formatNumber(transaction.value || 0, "value"),
      transaction.data || "0x",
      formatAccessList(transaction.accessList || [])
    ];
    if (signature2) {
      const sig = splitSignature(signature2);
      fields.push(formatNumber(sig.recoveryParam, "recoveryParam"));
      fields.push(stripZeros(sig.r));
      fields.push(stripZeros(sig.s));
    }
    return hexConcat(["0x01", encode3(fields)]);
  }
  function _parseEipSignature(tx, fields, serialize) {
    try {
      const recid = handleNumber(fields[0]).toNumber();
      if (recid !== 0 && recid !== 1) {
        throw new Error("bad recid");
      }
      tx.v = recid;
    } catch (error) {
      logger8.throwArgumentError("invalid v for transaction type: 1", "v", fields[0]);
    }
    tx.r = hexZeroPad(fields[1], 32);
    tx.s = hexZeroPad(fields[2], 32);
    try {
      const digest = keccak256(serialize(tx));
      tx.from = recoverAddress(digest, { r: tx.r, s: tx.s, recoveryParam: tx.v });
    } catch (error) {
    }
  }
  function _parseEip1559(payload) {
    const transaction = decode(payload.slice(1));
    if (transaction.length !== 9 && transaction.length !== 12) {
      logger8.throwArgumentError("invalid component count for transaction type: 2", "payload", hexlify(payload));
    }
    const maxPriorityFeePerGas = handleNumber(transaction[2]);
    const maxFeePerGas = handleNumber(transaction[3]);
    const tx = {
      type: 2,
      chainId: handleNumber(transaction[0]).toNumber(),
      nonce: handleNumber(transaction[1]).toNumber(),
      maxPriorityFeePerGas,
      maxFeePerGas,
      gasPrice: null,
      gasLimit: handleNumber(transaction[4]),
      to: handleAddress(transaction[5]),
      value: handleNumber(transaction[6]),
      data: transaction[7],
      accessList: accessListify(transaction[8])
    };
    if (transaction.length === 9) {
      return tx;
    }
    tx.hash = keccak256(payload);
    _parseEipSignature(tx, transaction.slice(9), _serializeEip1559);
    return tx;
  }
  function _parseEip2930(payload) {
    const transaction = decode(payload.slice(1));
    if (transaction.length !== 8 && transaction.length !== 11) {
      logger8.throwArgumentError("invalid component count for transaction type: 1", "payload", hexlify(payload));
    }
    const tx = {
      type: 1,
      chainId: handleNumber(transaction[0]).toNumber(),
      nonce: handleNumber(transaction[1]).toNumber(),
      gasPrice: handleNumber(transaction[2]),
      gasLimit: handleNumber(transaction[3]),
      to: handleAddress(transaction[4]),
      value: handleNumber(transaction[5]),
      data: transaction[6],
      accessList: accessListify(transaction[7])
    };
    if (transaction.length === 8) {
      return tx;
    }
    tx.hash = keccak256(payload);
    _parseEipSignature(tx, transaction.slice(8), _serializeEip2930);
    return tx;
  }
  function _parse(rawTransaction) {
    const transaction = decode(rawTransaction);
    if (transaction.length !== 9 && transaction.length !== 6) {
      logger8.throwArgumentError("invalid raw transaction", "rawTransaction", rawTransaction);
    }
    const tx = {
      nonce: handleNumber(transaction[0]).toNumber(),
      gasPrice: handleNumber(transaction[1]),
      gasLimit: handleNumber(transaction[2]),
      to: handleAddress(transaction[3]),
      value: handleNumber(transaction[4]),
      data: transaction[5],
      chainId: 0
    };
    if (transaction.length === 6) {
      return tx;
    }
    try {
      tx.v = BigNumber2.from(transaction[6]).toNumber();
    } catch (error) {
      return tx;
    }
    tx.r = hexZeroPad(transaction[7], 32);
    tx.s = hexZeroPad(transaction[8], 32);
    if (BigNumber2.from(tx.r).isZero() && BigNumber2.from(tx.s).isZero()) {
      tx.chainId = tx.v;
      tx.v = 0;
    } else {
      tx.chainId = Math.floor((tx.v - 35) / 2);
      if (tx.chainId < 0) {
        tx.chainId = 0;
      }
      let recoveryParam = tx.v - 27;
      const raw = transaction.slice(0, 6);
      if (tx.chainId !== 0) {
        raw.push(hexlify(tx.chainId));
        raw.push("0x");
        raw.push("0x");
        recoveryParam -= tx.chainId * 2 + 8;
      }
      const digest = keccak256(encode3(raw));
      try {
        tx.from = recoverAddress(digest, { r: hexlify(tx.r), s: hexlify(tx.s), recoveryParam });
      } catch (error) {
      }
      tx.hash = keccak256(rawTransaction);
    }
    tx.type = null;
    return tx;
  }
  function parse2(rawTransaction) {
    const payload = arrayify(rawTransaction);
    if (payload[0] > 127) {
      return _parse(payload);
    }
    switch (payload[0]) {
      case 1:
        return _parseEip2930(payload);
      case 2:
        return _parseEip1559(payload);
      default:
        break;
    }
    return logger8.throwError(`unsupported transaction type: ${payload[0]}`, Logger.errors.UNSUPPORTED_OPERATION, {
      operation: "parseTransaction",
      transactionType: payload[0]
    });
  }

  // node_modules/@ethersproject/abi/lib.esm/index.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/abi/lib.esm/fragments.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/abi/lib.esm/_version.js
  init_buffer_shim_entry();
  var version10 = "abi/5.8.0";

  // node_modules/@ethersproject/abi/lib.esm/fragments.js
  var logger9 = new Logger(version10);
  var _constructorGuard2 = {};
  var ModifiersBytes = { calldata: true, memory: true, storage: true };
  var ModifiersNest = { calldata: true, memory: true };
  function checkModifier(type, name) {
    if (type === "bytes" || type === "string") {
      if (ModifiersBytes[name]) {
        return true;
      }
    } else if (type === "address") {
      if (name === "payable") {
        return true;
      }
    } else if (type.indexOf("[") >= 0 || type === "tuple") {
      if (ModifiersNest[name]) {
        return true;
      }
    }
    if (ModifiersBytes[name] || name === "payable") {
      logger9.throwArgumentError("invalid modifier", "name", name);
    }
    return false;
  }
  function parseParamType(param, allowIndexed) {
    let originalParam = param;
    function throwError(i) {
      logger9.throwArgumentError(`unexpected character at position ${i}`, "param", param);
    }
    param = param.replace(/\s/g, " ");
    function newNode(parent2) {
      let node2 = { type: "", name: "", parent: parent2, state: { allowType: true } };
      if (allowIndexed) {
        node2.indexed = false;
      }
      return node2;
    }
    let parent = { type: "", name: "", state: { allowType: true } };
    let node = parent;
    for (let i = 0; i < param.length; i++) {
      let c = param[i];
      switch (c) {
        case "(":
          if (node.state.allowType && node.type === "") {
            node.type = "tuple";
          } else if (!node.state.allowParams) {
            throwError(i);
          }
          node.state.allowType = false;
          node.type = verifyType(node.type);
          node.components = [newNode(node)];
          node = node.components[0];
          break;
        case ")":
          delete node.state;
          if (node.name === "indexed") {
            if (!allowIndexed) {
              throwError(i);
            }
            node.indexed = true;
            node.name = "";
          }
          if (checkModifier(node.type, node.name)) {
            node.name = "";
          }
          node.type = verifyType(node.type);
          let child = node;
          node = node.parent;
          if (!node) {
            throwError(i);
          }
          delete child.parent;
          node.state.allowParams = false;
          node.state.allowName = true;
          node.state.allowArray = true;
          break;
        case ",":
          delete node.state;
          if (node.name === "indexed") {
            if (!allowIndexed) {
              throwError(i);
            }
            node.indexed = true;
            node.name = "";
          }
          if (checkModifier(node.type, node.name)) {
            node.name = "";
          }
          node.type = verifyType(node.type);
          let sibling = newNode(node.parent);
          node.parent.components.push(sibling);
          delete node.parent;
          node = sibling;
          break;
        // Hit a space...
        case " ":
          if (node.state.allowType) {
            if (node.type !== "") {
              node.type = verifyType(node.type);
              delete node.state.allowType;
              node.state.allowName = true;
              node.state.allowParams = true;
            }
          }
          if (node.state.allowName) {
            if (node.name !== "") {
              if (node.name === "indexed") {
                if (!allowIndexed) {
                  throwError(i);
                }
                if (node.indexed) {
                  throwError(i);
                }
                node.indexed = true;
                node.name = "";
              } else if (checkModifier(node.type, node.name)) {
                node.name = "";
              } else {
                node.state.allowName = false;
              }
            }
          }
          break;
        case "[":
          if (!node.state.allowArray) {
            throwError(i);
          }
          node.type += c;
          node.state.allowArray = false;
          node.state.allowName = false;
          node.state.readArray = true;
          break;
        case "]":
          if (!node.state.readArray) {
            throwError(i);
          }
          node.type += c;
          node.state.readArray = false;
          node.state.allowArray = true;
          node.state.allowName = true;
          break;
        default:
          if (node.state.allowType) {
            node.type += c;
            node.state.allowParams = true;
            node.state.allowArray = true;
          } else if (node.state.allowName) {
            node.name += c;
            delete node.state.allowArray;
          } else if (node.state.readArray) {
            node.type += c;
          } else {
            throwError(i);
          }
      }
    }
    if (node.parent) {
      logger9.throwArgumentError("unexpected eof", "param", param);
    }
    delete parent.state;
    if (node.name === "indexed") {
      if (!allowIndexed) {
        throwError(originalParam.length - 7);
      }
      if (node.indexed) {
        throwError(originalParam.length - 7);
      }
      node.indexed = true;
      node.name = "";
    } else if (checkModifier(node.type, node.name)) {
      node.name = "";
    }
    parent.type = verifyType(parent.type);
    return parent;
  }
  function populate(object, params) {
    for (let key2 in params) {
      defineReadOnly(object, key2, params[key2]);
    }
  }
  var FormatTypes = Object.freeze({
    // Bare formatting, as is needed for computing a sighash of an event or function
    sighash: "sighash",
    // Human-Readable with Minimal spacing and without names (compact human-readable)
    minimal: "minimal",
    // Human-Readable with nice spacing, including all names
    full: "full",
    // JSON-format a la Solidity
    json: "json"
  });
  var paramTypeArray = new RegExp(/^(.*)\[([0-9]*)\]$/);
  var ParamType = class _ParamType {
    constructor(constructorGuard, params) {
      if (constructorGuard !== _constructorGuard2) {
        logger9.throwError("use fromString", Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "new ParamType()"
        });
      }
      populate(this, params);
      let match = this.type.match(paramTypeArray);
      if (match) {
        populate(this, {
          arrayLength: parseInt(match[2] || "-1"),
          arrayChildren: _ParamType.fromObject({
            type: match[1],
            components: this.components
          }),
          baseType: "array"
        });
      } else {
        populate(this, {
          arrayLength: null,
          arrayChildren: null,
          baseType: this.components != null ? "tuple" : this.type
        });
      }
      this._isParamType = true;
      Object.freeze(this);
    }
    // Format the parameter fragment
    //   - sighash: "(uint256,address)"
    //   - minimal: "tuple(uint256,address) indexed"
    //   - full:    "tuple(uint256 foo, address bar) indexed baz"
    format(format) {
      if (!format) {
        format = FormatTypes.sighash;
      }
      if (!FormatTypes[format]) {
        logger9.throwArgumentError("invalid format type", "format", format);
      }
      if (format === FormatTypes.json) {
        let result2 = {
          type: this.baseType === "tuple" ? "tuple" : this.type,
          name: this.name || void 0
        };
        if (typeof this.indexed === "boolean") {
          result2.indexed = this.indexed;
        }
        if (this.components) {
          result2.components = this.components.map((comp) => JSON.parse(comp.format(format)));
        }
        return JSON.stringify(result2);
      }
      let result = "";
      if (this.baseType === "array") {
        result += this.arrayChildren.format(format);
        result += "[" + (this.arrayLength < 0 ? "" : String(this.arrayLength)) + "]";
      } else {
        if (this.baseType === "tuple") {
          if (format !== FormatTypes.sighash) {
            result += this.type;
          }
          result += "(" + this.components.map((comp) => comp.format(format)).join(format === FormatTypes.full ? ", " : ",") + ")";
        } else {
          result += this.type;
        }
      }
      if (format !== FormatTypes.sighash) {
        if (this.indexed === true) {
          result += " indexed";
        }
        if (format === FormatTypes.full && this.name) {
          result += " " + this.name;
        }
      }
      return result;
    }
    static from(value, allowIndexed) {
      if (typeof value === "string") {
        return _ParamType.fromString(value, allowIndexed);
      }
      return _ParamType.fromObject(value);
    }
    static fromObject(value) {
      if (_ParamType.isParamType(value)) {
        return value;
      }
      return new _ParamType(_constructorGuard2, {
        name: value.name || null,
        type: verifyType(value.type),
        indexed: value.indexed == null ? null : !!value.indexed,
        components: value.components ? value.components.map(_ParamType.fromObject) : null
      });
    }
    static fromString(value, allowIndexed) {
      function ParamTypify(node) {
        return _ParamType.fromObject({
          name: node.name,
          type: node.type,
          indexed: node.indexed,
          components: node.components
        });
      }
      return ParamTypify(parseParamType(value, !!allowIndexed));
    }
    static isParamType(value) {
      return !!(value != null && value._isParamType);
    }
  };
  function parseParams(value, allowIndex) {
    return splitNesting(value).map((param) => ParamType.fromString(param, allowIndex));
  }
  var Fragment = class _Fragment {
    constructor(constructorGuard, params) {
      if (constructorGuard !== _constructorGuard2) {
        logger9.throwError("use a static from method", Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "new Fragment()"
        });
      }
      populate(this, params);
      this._isFragment = true;
      Object.freeze(this);
    }
    static from(value) {
      if (_Fragment.isFragment(value)) {
        return value;
      }
      if (typeof value === "string") {
        return _Fragment.fromString(value);
      }
      return _Fragment.fromObject(value);
    }
    static fromObject(value) {
      if (_Fragment.isFragment(value)) {
        return value;
      }
      switch (value.type) {
        case "function":
          return FunctionFragment.fromObject(value);
        case "event":
          return EventFragment.fromObject(value);
        case "constructor":
          return ConstructorFragment.fromObject(value);
        case "error":
          return ErrorFragment.fromObject(value);
        case "fallback":
        case "receive":
          return null;
      }
      return logger9.throwArgumentError("invalid fragment object", "value", value);
    }
    static fromString(value) {
      value = value.replace(/\s/g, " ");
      value = value.replace(/\(/g, " (").replace(/\)/g, ") ").replace(/\s+/g, " ");
      value = value.trim();
      if (value.split(" ")[0] === "event") {
        return EventFragment.fromString(value.substring(5).trim());
      } else if (value.split(" ")[0] === "function") {
        return FunctionFragment.fromString(value.substring(8).trim());
      } else if (value.split("(")[0].trim() === "constructor") {
        return ConstructorFragment.fromString(value.trim());
      } else if (value.split(" ")[0] === "error") {
        return ErrorFragment.fromString(value.substring(5).trim());
      }
      return logger9.throwArgumentError("unsupported fragment", "value", value);
    }
    static isFragment(value) {
      return !!(value && value._isFragment);
    }
  };
  var EventFragment = class _EventFragment extends Fragment {
    format(format) {
      if (!format) {
        format = FormatTypes.sighash;
      }
      if (!FormatTypes[format]) {
        logger9.throwArgumentError("invalid format type", "format", format);
      }
      if (format === FormatTypes.json) {
        return JSON.stringify({
          type: "event",
          anonymous: this.anonymous,
          name: this.name,
          inputs: this.inputs.map((input) => JSON.parse(input.format(format)))
        });
      }
      let result = "";
      if (format !== FormatTypes.sighash) {
        result += "event ";
      }
      result += this.name + "(" + this.inputs.map((input) => input.format(format)).join(format === FormatTypes.full ? ", " : ",") + ") ";
      if (format !== FormatTypes.sighash) {
        if (this.anonymous) {
          result += "anonymous ";
        }
      }
      return result.trim();
    }
    static from(value) {
      if (typeof value === "string") {
        return _EventFragment.fromString(value);
      }
      return _EventFragment.fromObject(value);
    }
    static fromObject(value) {
      if (_EventFragment.isEventFragment(value)) {
        return value;
      }
      if (value.type !== "event") {
        logger9.throwArgumentError("invalid event object", "value", value);
      }
      const params = {
        name: verifyIdentifier(value.name),
        anonymous: value.anonymous,
        inputs: value.inputs ? value.inputs.map(ParamType.fromObject) : [],
        type: "event"
      };
      return new _EventFragment(_constructorGuard2, params);
    }
    static fromString(value) {
      let match = value.match(regexParen);
      if (!match) {
        logger9.throwArgumentError("invalid event string", "value", value);
      }
      let anonymous = false;
      match[3].split(" ").forEach((modifier) => {
        switch (modifier.trim()) {
          case "anonymous":
            anonymous = true;
            break;
          case "":
            break;
          default:
            logger9.warn("unknown modifier: " + modifier);
        }
      });
      return _EventFragment.fromObject({
        name: match[1].trim(),
        anonymous,
        inputs: parseParams(match[2], true),
        type: "event"
      });
    }
    static isEventFragment(value) {
      return value && value._isFragment && value.type === "event";
    }
  };
  function parseGas(value, params) {
    params.gas = null;
    let comps = value.split("@");
    if (comps.length !== 1) {
      if (comps.length > 2) {
        logger9.throwArgumentError("invalid human-readable ABI signature", "value", value);
      }
      if (!comps[1].match(/^[0-9]+$/)) {
        logger9.throwArgumentError("invalid human-readable ABI signature gas", "value", value);
      }
      params.gas = BigNumber2.from(comps[1]);
      return comps[0];
    }
    return value;
  }
  function parseModifiers(value, params) {
    params.constant = false;
    params.payable = false;
    params.stateMutability = "nonpayable";
    value.split(" ").forEach((modifier) => {
      switch (modifier.trim()) {
        case "constant":
          params.constant = true;
          break;
        case "payable":
          params.payable = true;
          params.stateMutability = "payable";
          break;
        case "nonpayable":
          params.payable = false;
          params.stateMutability = "nonpayable";
          break;
        case "pure":
          params.constant = true;
          params.stateMutability = "pure";
          break;
        case "view":
          params.constant = true;
          params.stateMutability = "view";
          break;
        case "external":
        case "public":
        case "":
          break;
        default:
          console.log("unknown modifier: " + modifier);
      }
    });
  }
  function verifyState(value) {
    let result = {
      constant: false,
      payable: true,
      stateMutability: "payable"
    };
    if (value.stateMutability != null) {
      result.stateMutability = value.stateMutability;
      result.constant = result.stateMutability === "view" || result.stateMutability === "pure";
      if (value.constant != null) {
        if (!!value.constant !== result.constant) {
          logger9.throwArgumentError("cannot have constant function with mutability " + result.stateMutability, "value", value);
        }
      }
      result.payable = result.stateMutability === "payable";
      if (value.payable != null) {
        if (!!value.payable !== result.payable) {
          logger9.throwArgumentError("cannot have payable function with mutability " + result.stateMutability, "value", value);
        }
      }
    } else if (value.payable != null) {
      result.payable = !!value.payable;
      if (value.constant == null && !result.payable && value.type !== "constructor") {
        logger9.throwArgumentError("unable to determine stateMutability", "value", value);
      }
      result.constant = !!value.constant;
      if (result.constant) {
        result.stateMutability = "view";
      } else {
        result.stateMutability = result.payable ? "payable" : "nonpayable";
      }
      if (result.payable && result.constant) {
        logger9.throwArgumentError("cannot have constant payable function", "value", value);
      }
    } else if (value.constant != null) {
      result.constant = !!value.constant;
      result.payable = !result.constant;
      result.stateMutability = result.constant ? "view" : "payable";
    } else if (value.type !== "constructor") {
      logger9.throwArgumentError("unable to determine stateMutability", "value", value);
    }
    return result;
  }
  var ConstructorFragment = class _ConstructorFragment extends Fragment {
    format(format) {
      if (!format) {
        format = FormatTypes.sighash;
      }
      if (!FormatTypes[format]) {
        logger9.throwArgumentError("invalid format type", "format", format);
      }
      if (format === FormatTypes.json) {
        return JSON.stringify({
          type: "constructor",
          stateMutability: this.stateMutability !== "nonpayable" ? this.stateMutability : void 0,
          payable: this.payable,
          gas: this.gas ? this.gas.toNumber() : void 0,
          inputs: this.inputs.map((input) => JSON.parse(input.format(format)))
        });
      }
      if (format === FormatTypes.sighash) {
        logger9.throwError("cannot format a constructor for sighash", Logger.errors.UNSUPPORTED_OPERATION, {
          operation: "format(sighash)"
        });
      }
      let result = "constructor(" + this.inputs.map((input) => input.format(format)).join(format === FormatTypes.full ? ", " : ",") + ") ";
      if (this.stateMutability && this.stateMutability !== "nonpayable") {
        result += this.stateMutability + " ";
      }
      return result.trim();
    }
    static from(value) {
      if (typeof value === "string") {
        return _ConstructorFragment.fromString(value);
      }
      return _ConstructorFragment.fromObject(value);
    }
    static fromObject(value) {
      if (_ConstructorFragment.isConstructorFragment(value)) {
        return value;
      }
      if (value.type !== "constructor") {
        logger9.throwArgumentError("invalid constructor object", "value", value);
      }
      let state = verifyState(value);
      if (state.constant) {
        logger9.throwArgumentError("constructor cannot be constant", "value", value);
      }
      const params = {
        name: null,
        type: value.type,
        inputs: value.inputs ? value.inputs.map(ParamType.fromObject) : [],
        payable: state.payable,
        stateMutability: state.stateMutability,
        gas: value.gas ? BigNumber2.from(value.gas) : null
      };
      return new _ConstructorFragment(_constructorGuard2, params);
    }
    static fromString(value) {
      let params = { type: "constructor" };
      value = parseGas(value, params);
      let parens = value.match(regexParen);
      if (!parens || parens[1].trim() !== "constructor") {
        logger9.throwArgumentError("invalid constructor string", "value", value);
      }
      params.inputs = parseParams(parens[2].trim(), false);
      parseModifiers(parens[3].trim(), params);
      return _ConstructorFragment.fromObject(params);
    }
    static isConstructorFragment(value) {
      return value && value._isFragment && value.type === "constructor";
    }
  };
  var FunctionFragment = class _FunctionFragment extends ConstructorFragment {
    format(format) {
      if (!format) {
        format = FormatTypes.sighash;
      }
      if (!FormatTypes[format]) {
        logger9.throwArgumentError("invalid format type", "format", format);
      }
      if (format === FormatTypes.json) {
        return JSON.stringify({
          type: "function",
          name: this.name,
          constant: this.constant,
          stateMutability: this.stateMutability !== "nonpayable" ? this.stateMutability : void 0,
          payable: this.payable,
          gas: this.gas ? this.gas.toNumber() : void 0,
          inputs: this.inputs.map((input) => JSON.parse(input.format(format))),
          outputs: this.outputs.map((output) => JSON.parse(output.format(format)))
        });
      }
      let result = "";
      if (format !== FormatTypes.sighash) {
        result += "function ";
      }
      result += this.name + "(" + this.inputs.map((input) => input.format(format)).join(format === FormatTypes.full ? ", " : ",") + ") ";
      if (format !== FormatTypes.sighash) {
        if (this.stateMutability) {
          if (this.stateMutability !== "nonpayable") {
            result += this.stateMutability + " ";
          }
        } else if (this.constant) {
          result += "view ";
        }
        if (this.outputs && this.outputs.length) {
          result += "returns (" + this.outputs.map((output) => output.format(format)).join(", ") + ") ";
        }
        if (this.gas != null) {
          result += "@" + this.gas.toString() + " ";
        }
      }
      return result.trim();
    }
    static from(value) {
      if (typeof value === "string") {
        return _FunctionFragment.fromString(value);
      }
      return _FunctionFragment.fromObject(value);
    }
    static fromObject(value) {
      if (_FunctionFragment.isFunctionFragment(value)) {
        return value;
      }
      if (value.type !== "function") {
        logger9.throwArgumentError("invalid function object", "value", value);
      }
      let state = verifyState(value);
      const params = {
        type: value.type,
        name: verifyIdentifier(value.name),
        constant: state.constant,
        inputs: value.inputs ? value.inputs.map(ParamType.fromObject) : [],
        outputs: value.outputs ? value.outputs.map(ParamType.fromObject) : [],
        payable: state.payable,
        stateMutability: state.stateMutability,
        gas: value.gas ? BigNumber2.from(value.gas) : null
      };
      return new _FunctionFragment(_constructorGuard2, params);
    }
    static fromString(value) {
      let params = { type: "function" };
      value = parseGas(value, params);
      let comps = value.split(" returns ");
      if (comps.length > 2) {
        logger9.throwArgumentError("invalid function string", "value", value);
      }
      let parens = comps[0].match(regexParen);
      if (!parens) {
        logger9.throwArgumentError("invalid function signature", "value", value);
      }
      params.name = parens[1].trim();
      if (params.name) {
        verifyIdentifier(params.name);
      }
      params.inputs = parseParams(parens[2], false);
      parseModifiers(parens[3].trim(), params);
      if (comps.length > 1) {
        let returns = comps[1].match(regexParen);
        if (returns[1].trim() != "" || returns[3].trim() != "") {
          logger9.throwArgumentError("unexpected tokens", "value", value);
        }
        params.outputs = parseParams(returns[2], false);
      } else {
        params.outputs = [];
      }
      return _FunctionFragment.fromObject(params);
    }
    static isFunctionFragment(value) {
      return value && value._isFragment && value.type === "function";
    }
  };
  function checkForbidden(fragment) {
    const sig = fragment.format();
    if (sig === "Error(string)" || sig === "Panic(uint256)") {
      logger9.throwArgumentError(`cannot specify user defined ${sig} error`, "fragment", fragment);
    }
    return fragment;
  }
  var ErrorFragment = class _ErrorFragment extends Fragment {
    format(format) {
      if (!format) {
        format = FormatTypes.sighash;
      }
      if (!FormatTypes[format]) {
        logger9.throwArgumentError("invalid format type", "format", format);
      }
      if (format === FormatTypes.json) {
        return JSON.stringify({
          type: "error",
          name: this.name,
          inputs: this.inputs.map((input) => JSON.parse(input.format(format)))
        });
      }
      let result = "";
      if (format !== FormatTypes.sighash) {
        result += "error ";
      }
      result += this.name + "(" + this.inputs.map((input) => input.format(format)).join(format === FormatTypes.full ? ", " : ",") + ") ";
      return result.trim();
    }
    static from(value) {
      if (typeof value === "string") {
        return _ErrorFragment.fromString(value);
      }
      return _ErrorFragment.fromObject(value);
    }
    static fromObject(value) {
      if (_ErrorFragment.isErrorFragment(value)) {
        return value;
      }
      if (value.type !== "error") {
        logger9.throwArgumentError("invalid error object", "value", value);
      }
      const params = {
        type: value.type,
        name: verifyIdentifier(value.name),
        inputs: value.inputs ? value.inputs.map(ParamType.fromObject) : []
      };
      return checkForbidden(new _ErrorFragment(_constructorGuard2, params));
    }
    static fromString(value) {
      let params = { type: "error" };
      let parens = value.match(regexParen);
      if (!parens) {
        logger9.throwArgumentError("invalid error signature", "value", value);
      }
      params.name = parens[1].trim();
      if (params.name) {
        verifyIdentifier(params.name);
      }
      params.inputs = parseParams(parens[2], false);
      return checkForbidden(_ErrorFragment.fromObject(params));
    }
    static isErrorFragment(value) {
      return value && value._isFragment && value.type === "error";
    }
  };
  function verifyType(type) {
    if (type.match(/^uint($|[^1-9])/)) {
      type = "uint256" + type.substring(4);
    } else if (type.match(/^int($|[^1-9])/)) {
      type = "int256" + type.substring(3);
    }
    return type;
  }
  var regexIdentifier = new RegExp("^[a-zA-Z$_][a-zA-Z0-9$_]*$");
  function verifyIdentifier(value) {
    if (!value || !value.match(regexIdentifier)) {
      logger9.throwArgumentError(`invalid identifier "${value}"`, "value", value);
    }
    return value;
  }
  var regexParen = new RegExp("^([^)(]*)\\((.*)\\)([^)(]*)$");
  function splitNesting(value) {
    value = value.trim();
    let result = [];
    let accum = "";
    let depth = 0;
    for (let offset = 0; offset < value.length; offset++) {
      let c = value[offset];
      if (c === "," && depth === 0) {
        result.push(accum);
        accum = "";
      } else {
        accum += c;
        if (c === "(") {
          depth++;
        } else if (c === ")") {
          depth--;
          if (depth === -1) {
            logger9.throwArgumentError("unbalanced parenthesis", "value", value);
          }
        }
      }
    }
    if (accum) {
      result.push(accum);
    }
    return result;
  }

  // node_modules/@ethersproject/abi/lib.esm/abi-coder.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/abi/lib.esm/coders/abstract-coder.js
  init_buffer_shim_entry();
  var logger10 = new Logger(version10);
  var Coder = class {
    constructor(name, type, localName, dynamic) {
      this.name = name;
      this.type = type;
      this.localName = localName;
      this.dynamic = dynamic;
    }
    _throwError(message, value) {
      logger10.throwArgumentError(message, this.localName, value);
    }
  };
  var Writer = class {
    constructor(wordSize) {
      defineReadOnly(this, "wordSize", wordSize || 32);
      this._data = [];
      this._dataLength = 0;
      this._padding = new Uint8Array(wordSize);
    }
    get data() {
      return hexConcat(this._data);
    }
    get length() {
      return this._dataLength;
    }
    _writeData(data) {
      this._data.push(data);
      this._dataLength += data.length;
      return data.length;
    }
    appendWriter(writer) {
      return this._writeData(concat(writer._data));
    }
    // Arrayish items; padded on the right to wordSize
    writeBytes(value) {
      let bytes = arrayify(value);
      const paddingOffset = bytes.length % this.wordSize;
      if (paddingOffset) {
        bytes = concat([bytes, this._padding.slice(paddingOffset)]);
      }
      return this._writeData(bytes);
    }
    _getValue(value) {
      let bytes = arrayify(BigNumber2.from(value));
      if (bytes.length > this.wordSize) {
        logger10.throwError("value out-of-bounds", Logger.errors.BUFFER_OVERRUN, {
          length: this.wordSize,
          offset: bytes.length
        });
      }
      if (bytes.length % this.wordSize) {
        bytes = concat([this._padding.slice(bytes.length % this.wordSize), bytes]);
      }
      return bytes;
    }
    // BigNumberish items; padded on the left to wordSize
    writeValue(value) {
      return this._writeData(this._getValue(value));
    }
    writeUpdatableValue() {
      const offset = this._data.length;
      this._data.push(this._padding);
      this._dataLength += this.wordSize;
      return (value) => {
        this._data[offset] = this._getValue(value);
      };
    }
  };
  var Reader = class _Reader {
    constructor(data, wordSize, coerceFunc, allowLoose) {
      defineReadOnly(this, "_data", arrayify(data));
      defineReadOnly(this, "wordSize", wordSize || 32);
      defineReadOnly(this, "_coerceFunc", coerceFunc);
      defineReadOnly(this, "allowLoose", allowLoose);
      this._offset = 0;
    }
    get data() {
      return hexlify(this._data);
    }
    get consumed() {
      return this._offset;
    }
    // The default Coerce function
    static coerce(name, value) {
      let match = name.match("^u?int([0-9]+)$");
      if (match && parseInt(match[1]) <= 48) {
        value = value.toNumber();
      }
      return value;
    }
    coerce(name, value) {
      if (this._coerceFunc) {
        return this._coerceFunc(name, value);
      }
      return _Reader.coerce(name, value);
    }
    _peekBytes(offset, length, loose) {
      let alignedLength = Math.ceil(length / this.wordSize) * this.wordSize;
      if (this._offset + alignedLength > this._data.length) {
        if (this.allowLoose && loose && this._offset + length <= this._data.length) {
          alignedLength = length;
        } else {
          logger10.throwError("data out-of-bounds", Logger.errors.BUFFER_OVERRUN, {
            length: this._data.length,
            offset: this._offset + alignedLength
          });
        }
      }
      return this._data.slice(this._offset, this._offset + alignedLength);
    }
    subReader(offset) {
      return new _Reader(this._data.slice(this._offset + offset), this.wordSize, this._coerceFunc, this.allowLoose);
    }
    readBytes(length, loose) {
      let bytes = this._peekBytes(0, length, !!loose);
      this._offset += bytes.length;
      return bytes.slice(0, length);
    }
    readValue() {
      return BigNumber2.from(this.readBytes(this.wordSize));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/address.js
  init_buffer_shim_entry();
  var AddressCoder = class extends Coder {
    constructor(localName) {
      super("address", "address", localName, false);
    }
    defaultValue() {
      return "0x0000000000000000000000000000000000000000";
    }
    encode(writer, value) {
      try {
        value = getAddress(value);
      } catch (error) {
        this._throwError(error.message, value);
      }
      return writer.writeValue(value);
    }
    decode(reader) {
      return getAddress(hexZeroPad(reader.readValue().toHexString(), 20));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/array.js
  init_buffer_shim_entry();

  // node_modules/@ethersproject/abi/lib.esm/coders/anonymous.js
  init_buffer_shim_entry();
  var AnonymousCoder = class extends Coder {
    constructor(coder) {
      super(coder.name, coder.type, void 0, coder.dynamic);
      this.coder = coder;
    }
    defaultValue() {
      return this.coder.defaultValue();
    }
    encode(writer, value) {
      return this.coder.encode(writer, value);
    }
    decode(reader) {
      return this.coder.decode(reader);
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/array.js
  var logger11 = new Logger(version10);
  function pack(writer, coders, values) {
    let arrayValues = null;
    if (Array.isArray(values)) {
      arrayValues = values;
    } else if (values && typeof values === "object") {
      let unique = {};
      arrayValues = coders.map((coder) => {
        const name = coder.localName;
        if (!name) {
          logger11.throwError("cannot encode object for signature with missing names", Logger.errors.INVALID_ARGUMENT, {
            argument: "values",
            coder,
            value: values
          });
        }
        if (unique[name]) {
          logger11.throwError("cannot encode object for signature with duplicate names", Logger.errors.INVALID_ARGUMENT, {
            argument: "values",
            coder,
            value: values
          });
        }
        unique[name] = true;
        return values[name];
      });
    } else {
      logger11.throwArgumentError("invalid tuple value", "tuple", values);
    }
    if (coders.length !== arrayValues.length) {
      logger11.throwArgumentError("types/value length mismatch", "tuple", values);
    }
    let staticWriter = new Writer(writer.wordSize);
    let dynamicWriter = new Writer(writer.wordSize);
    let updateFuncs = [];
    coders.forEach((coder, index) => {
      let value = arrayValues[index];
      if (coder.dynamic) {
        let dynamicOffset = dynamicWriter.length;
        coder.encode(dynamicWriter, value);
        let updateFunc = staticWriter.writeUpdatableValue();
        updateFuncs.push((baseOffset) => {
          updateFunc(baseOffset + dynamicOffset);
        });
      } else {
        coder.encode(staticWriter, value);
      }
    });
    updateFuncs.forEach((func) => {
      func(staticWriter.length);
    });
    let length = writer.appendWriter(staticWriter);
    length += writer.appendWriter(dynamicWriter);
    return length;
  }
  function unpack(reader, coders) {
    let values = [];
    let baseReader = reader.subReader(0);
    coders.forEach((coder) => {
      let value = null;
      if (coder.dynamic) {
        let offset = reader.readValue();
        let offsetReader = baseReader.subReader(offset.toNumber());
        try {
          value = coder.decode(offsetReader);
        } catch (error) {
          if (error.code === Logger.errors.BUFFER_OVERRUN) {
            throw error;
          }
          value = error;
          value.baseType = coder.name;
          value.name = coder.localName;
          value.type = coder.type;
        }
      } else {
        try {
          value = coder.decode(reader);
        } catch (error) {
          if (error.code === Logger.errors.BUFFER_OVERRUN) {
            throw error;
          }
          value = error;
          value.baseType = coder.name;
          value.name = coder.localName;
          value.type = coder.type;
        }
      }
      if (value != void 0) {
        values.push(value);
      }
    });
    const uniqueNames = coders.reduce((accum, coder) => {
      const name = coder.localName;
      if (name) {
        if (!accum[name]) {
          accum[name] = 0;
        }
        accum[name]++;
      }
      return accum;
    }, {});
    coders.forEach((coder, index) => {
      let name = coder.localName;
      if (!name || uniqueNames[name] !== 1) {
        return;
      }
      if (name === "length") {
        name = "_length";
      }
      if (values[name] != null) {
        return;
      }
      const value = values[index];
      if (value instanceof Error) {
        Object.defineProperty(values, name, {
          enumerable: true,
          get: () => {
            throw value;
          }
        });
      } else {
        values[name] = value;
      }
    });
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value instanceof Error) {
        Object.defineProperty(values, i, {
          enumerable: true,
          get: () => {
            throw value;
          }
        });
      }
    }
    return Object.freeze(values);
  }
  var ArrayCoder = class extends Coder {
    constructor(coder, length, localName) {
      const type = coder.type + "[" + (length >= 0 ? length : "") + "]";
      const dynamic = length === -1 || coder.dynamic;
      super("array", type, localName, dynamic);
      this.coder = coder;
      this.length = length;
    }
    defaultValue() {
      const defaultChild = this.coder.defaultValue();
      const result = [];
      for (let i = 0; i < this.length; i++) {
        result.push(defaultChild);
      }
      return result;
    }
    encode(writer, value) {
      if (!Array.isArray(value)) {
        this._throwError("expected array value", value);
      }
      let count = this.length;
      if (count === -1) {
        count = value.length;
        writer.writeValue(value.length);
      }
      logger11.checkArgumentCount(value.length, count, "coder array" + (this.localName ? " " + this.localName : ""));
      let coders = [];
      for (let i = 0; i < value.length; i++) {
        coders.push(this.coder);
      }
      return pack(writer, coders, value);
    }
    decode(reader) {
      let count = this.length;
      if (count === -1) {
        count = reader.readValue().toNumber();
        if (count * 32 > reader._data.length) {
          logger11.throwError("insufficient data length", Logger.errors.BUFFER_OVERRUN, {
            length: reader._data.length,
            count
          });
        }
      }
      let coders = [];
      for (let i = 0; i < count; i++) {
        coders.push(new AnonymousCoder(this.coder));
      }
      return reader.coerce(this.name, unpack(reader, coders));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/boolean.js
  init_buffer_shim_entry();
  var BooleanCoder = class extends Coder {
    constructor(localName) {
      super("bool", "bool", localName, false);
    }
    defaultValue() {
      return false;
    }
    encode(writer, value) {
      return writer.writeValue(value ? 1 : 0);
    }
    decode(reader) {
      return reader.coerce(this.type, !reader.readValue().isZero());
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/bytes.js
  init_buffer_shim_entry();
  var DynamicBytesCoder = class extends Coder {
    constructor(type, localName) {
      super(type, type, localName, true);
    }
    defaultValue() {
      return "0x";
    }
    encode(writer, value) {
      value = arrayify(value);
      let length = writer.writeValue(value.length);
      length += writer.writeBytes(value);
      return length;
    }
    decode(reader) {
      return reader.readBytes(reader.readValue().toNumber(), true);
    }
  };
  var BytesCoder = class extends DynamicBytesCoder {
    constructor(localName) {
      super("bytes", localName);
    }
    decode(reader) {
      return reader.coerce(this.name, hexlify(super.decode(reader)));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/fixed-bytes.js
  init_buffer_shim_entry();
  var FixedBytesCoder = class extends Coder {
    constructor(size, localName) {
      let name = "bytes" + String(size);
      super(name, name, localName, false);
      this.size = size;
    }
    defaultValue() {
      return "0x0000000000000000000000000000000000000000000000000000000000000000".substring(0, 2 + this.size * 2);
    }
    encode(writer, value) {
      let data = arrayify(value);
      if (data.length !== this.size) {
        this._throwError("incorrect data length", value);
      }
      return writer.writeBytes(data);
    }
    decode(reader) {
      return reader.coerce(this.name, hexlify(reader.readBytes(this.size)));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/null.js
  init_buffer_shim_entry();
  var NullCoder = class extends Coder {
    constructor(localName) {
      super("null", "", localName, false);
    }
    defaultValue() {
      return null;
    }
    encode(writer, value) {
      if (value != null) {
        this._throwError("not null", value);
      }
      return writer.writeBytes([]);
    }
    decode(reader) {
      reader.readBytes(0);
      return reader.coerce(this.name, null);
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/number.js
  init_buffer_shim_entry();
  var NumberCoder = class extends Coder {
    constructor(size, signed, localName) {
      const name = (signed ? "int" : "uint") + size * 8;
      super(name, name, localName, false);
      this.size = size;
      this.signed = signed;
    }
    defaultValue() {
      return 0;
    }
    encode(writer, value) {
      let v = BigNumber2.from(value);
      let maxUintValue = MaxUint256.mask(writer.wordSize * 8);
      if (this.signed) {
        let bounds = maxUintValue.mask(this.size * 8 - 1);
        if (v.gt(bounds) || v.lt(bounds.add(One).mul(NegativeOne))) {
          this._throwError("value out-of-bounds", value);
        }
      } else if (v.lt(Zero) || v.gt(maxUintValue.mask(this.size * 8))) {
        this._throwError("value out-of-bounds", value);
      }
      v = v.toTwos(this.size * 8).mask(this.size * 8);
      if (this.signed) {
        v = v.fromTwos(this.size * 8).toTwos(8 * writer.wordSize);
      }
      return writer.writeValue(v);
    }
    decode(reader) {
      let value = reader.readValue().mask(this.size * 8);
      if (this.signed) {
        value = value.fromTwos(this.size * 8);
      }
      return reader.coerce(this.name, value);
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/string.js
  init_buffer_shim_entry();
  var StringCoder = class extends DynamicBytesCoder {
    constructor(localName) {
      super("string", localName);
    }
    defaultValue() {
      return "";
    }
    encode(writer, value) {
      return super.encode(writer, toUtf8Bytes(value));
    }
    decode(reader) {
      return toUtf8String(super.decode(reader));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/coders/tuple.js
  init_buffer_shim_entry();
  var TupleCoder = class extends Coder {
    constructor(coders, localName) {
      let dynamic = false;
      const types = [];
      coders.forEach((coder) => {
        if (coder.dynamic) {
          dynamic = true;
        }
        types.push(coder.type);
      });
      const type = "tuple(" + types.join(",") + ")";
      super("tuple", type, localName, dynamic);
      this.coders = coders;
    }
    defaultValue() {
      const values = [];
      this.coders.forEach((coder) => {
        values.push(coder.defaultValue());
      });
      const uniqueNames = this.coders.reduce((accum, coder) => {
        const name = coder.localName;
        if (name) {
          if (!accum[name]) {
            accum[name] = 0;
          }
          accum[name]++;
        }
        return accum;
      }, {});
      this.coders.forEach((coder, index) => {
        let name = coder.localName;
        if (!name || uniqueNames[name] !== 1) {
          return;
        }
        if (name === "length") {
          name = "_length";
        }
        if (values[name] != null) {
          return;
        }
        values[name] = values[index];
      });
      return Object.freeze(values);
    }
    encode(writer, value) {
      return pack(writer, this.coders, value);
    }
    decode(reader) {
      return reader.coerce(this.name, unpack(reader, this.coders));
    }
  };

  // node_modules/@ethersproject/abi/lib.esm/abi-coder.js
  var logger12 = new Logger(version10);
  var paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
  var paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);
  var AbiCoder = class {
    constructor(coerceFunc) {
      defineReadOnly(this, "coerceFunc", coerceFunc || null);
    }
    _getCoder(param) {
      switch (param.baseType) {
        case "address":
          return new AddressCoder(param.name);
        case "bool":
          return new BooleanCoder(param.name);
        case "string":
          return new StringCoder(param.name);
        case "bytes":
          return new BytesCoder(param.name);
        case "array":
          return new ArrayCoder(this._getCoder(param.arrayChildren), param.arrayLength, param.name);
        case "tuple":
          return new TupleCoder((param.components || []).map((component) => {
            return this._getCoder(component);
          }), param.name);
        case "":
          return new NullCoder(param.name);
      }
      let match = param.type.match(paramTypeNumber);
      if (match) {
        let size = parseInt(match[2] || "256");
        if (size === 0 || size > 256 || size % 8 !== 0) {
          logger12.throwArgumentError("invalid " + match[1] + " bit length", "param", param);
        }
        return new NumberCoder(size / 8, match[1] === "int", param.name);
      }
      match = param.type.match(paramTypeBytes);
      if (match) {
        let size = parseInt(match[1]);
        if (size === 0 || size > 32) {
          logger12.throwArgumentError("invalid bytes length", "param", param);
        }
        return new FixedBytesCoder(size, param.name);
      }
      return logger12.throwArgumentError("invalid type", "type", param.type);
    }
    _getWordSize() {
      return 32;
    }
    _getReader(data, allowLoose) {
      return new Reader(data, this._getWordSize(), this.coerceFunc, allowLoose);
    }
    _getWriter() {
      return new Writer(this._getWordSize());
    }
    getDefaultValue(types) {
      const coders = types.map((type) => this._getCoder(ParamType.from(type)));
      const coder = new TupleCoder(coders, "_");
      return coder.defaultValue();
    }
    encode(types, values) {
      if (types.length !== values.length) {
        logger12.throwError("types/values length mismatch", Logger.errors.INVALID_ARGUMENT, {
          count: { types: types.length, values: values.length },
          value: { types, values }
        });
      }
      const coders = types.map((type) => this._getCoder(ParamType.from(type)));
      const coder = new TupleCoder(coders, "_");
      const writer = this._getWriter();
      coder.encode(writer, values);
      return writer.data;
    }
    decode(types, data, loose) {
      const coders = types.map((type) => this._getCoder(ParamType.from(type)));
      const coder = new TupleCoder(coders, "_");
      return coder.decode(this._getReader(arrayify(data), loose));
    }
  };
  var defaultAbiCoder = new AbiCoder();

  // node_modules/@ethersproject/abi/lib.esm/interface.js
  init_buffer_shim_entry();
  var logger13 = new Logger(version10);
  var LogDescription = class extends Description {
  };
  var TransactionDescription = class extends Description {
  };
  var ErrorDescription = class extends Description {
  };
  var Indexed = class extends Description {
    static isIndexed(value) {
      return !!(value && value._isIndexed);
    }
  };
  var BuiltinErrors = {
    "0x08c379a0": { signature: "Error(string)", name: "Error", inputs: ["string"], reason: true },
    "0x4e487b71": { signature: "Panic(uint256)", name: "Panic", inputs: ["uint256"] }
  };
  function wrapAccessError(property, error) {
    const wrap = new Error(`deferred error during ABI decoding triggered accessing ${property}`);
    wrap.error = error;
    return wrap;
  }
  var Interface = class {
    constructor(fragments) {
      let abi = [];
      if (typeof fragments === "string") {
        abi = JSON.parse(fragments);
      } else {
        abi = fragments;
      }
      defineReadOnly(this, "fragments", abi.map((fragment) => {
        return Fragment.from(fragment);
      }).filter((fragment) => fragment != null));
      defineReadOnly(this, "_abiCoder", getStatic(new.target, "getAbiCoder")());
      defineReadOnly(this, "functions", {});
      defineReadOnly(this, "errors", {});
      defineReadOnly(this, "events", {});
      defineReadOnly(this, "structs", {});
      this.fragments.forEach((fragment) => {
        let bucket = null;
        switch (fragment.type) {
          case "constructor":
            if (this.deploy) {
              logger13.warn("duplicate definition - constructor");
              return;
            }
            defineReadOnly(this, "deploy", fragment);
            return;
          case "function":
            bucket = this.functions;
            break;
          case "event":
            bucket = this.events;
            break;
          case "error":
            bucket = this.errors;
            break;
          default:
            return;
        }
        let signature2 = fragment.format();
        if (bucket[signature2]) {
          logger13.warn("duplicate definition - " + signature2);
          return;
        }
        bucket[signature2] = fragment;
      });
      if (!this.deploy) {
        defineReadOnly(this, "deploy", ConstructorFragment.from({
          payable: false,
          type: "constructor"
        }));
      }
      defineReadOnly(this, "_isInterface", true);
    }
    format(format) {
      if (!format) {
        format = FormatTypes.full;
      }
      if (format === FormatTypes.sighash) {
        logger13.throwArgumentError("interface does not support formatting sighash", "format", format);
      }
      const abi = this.fragments.map((fragment) => fragment.format(format));
      if (format === FormatTypes.json) {
        return JSON.stringify(abi.map((j) => JSON.parse(j)));
      }
      return abi;
    }
    // Sub-classes can override these to handle other blockchains
    static getAbiCoder() {
      return defaultAbiCoder;
    }
    static getAddress(address) {
      return getAddress(address);
    }
    static getSighash(fragment) {
      return hexDataSlice(id2(fragment.format()), 0, 4);
    }
    static getEventTopic(eventFragment) {
      return id2(eventFragment.format());
    }
    // Find a function definition by any means necessary (unless it is ambiguous)
    getFunction(nameOrSignatureOrSighash) {
      if (isHexString(nameOrSignatureOrSighash)) {
        for (const name in this.functions) {
          if (nameOrSignatureOrSighash === this.getSighash(name)) {
            return this.functions[name];
          }
        }
        logger13.throwArgumentError("no matching function", "sighash", nameOrSignatureOrSighash);
      }
      if (nameOrSignatureOrSighash.indexOf("(") === -1) {
        const name = nameOrSignatureOrSighash.trim();
        const matching = Object.keys(this.functions).filter((f) => f.split(
          "("
          /* fix:) */
        )[0] === name);
        if (matching.length === 0) {
          logger13.throwArgumentError("no matching function", "name", name);
        } else if (matching.length > 1) {
          logger13.throwArgumentError("multiple matching functions", "name", name);
        }
        return this.functions[matching[0]];
      }
      const result = this.functions[FunctionFragment.fromString(nameOrSignatureOrSighash).format()];
      if (!result) {
        logger13.throwArgumentError("no matching function", "signature", nameOrSignatureOrSighash);
      }
      return result;
    }
    // Find an event definition by any means necessary (unless it is ambiguous)
    getEvent(nameOrSignatureOrTopic) {
      if (isHexString(nameOrSignatureOrTopic)) {
        const topichash = nameOrSignatureOrTopic.toLowerCase();
        for (const name in this.events) {
          if (topichash === this.getEventTopic(name)) {
            return this.events[name];
          }
        }
        logger13.throwArgumentError("no matching event", "topichash", topichash);
      }
      if (nameOrSignatureOrTopic.indexOf("(") === -1) {
        const name = nameOrSignatureOrTopic.trim();
        const matching = Object.keys(this.events).filter((f) => f.split(
          "("
          /* fix:) */
        )[0] === name);
        if (matching.length === 0) {
          logger13.throwArgumentError("no matching event", "name", name);
        } else if (matching.length > 1) {
          logger13.throwArgumentError("multiple matching events", "name", name);
        }
        return this.events[matching[0]];
      }
      const result = this.events[EventFragment.fromString(nameOrSignatureOrTopic).format()];
      if (!result) {
        logger13.throwArgumentError("no matching event", "signature", nameOrSignatureOrTopic);
      }
      return result;
    }
    // Find a function definition by any means necessary (unless it is ambiguous)
    getError(nameOrSignatureOrSighash) {
      if (isHexString(nameOrSignatureOrSighash)) {
        const getSighash = getStatic(this.constructor, "getSighash");
        for (const name in this.errors) {
          const error = this.errors[name];
          if (nameOrSignatureOrSighash === getSighash(error)) {
            return this.errors[name];
          }
        }
        logger13.throwArgumentError("no matching error", "sighash", nameOrSignatureOrSighash);
      }
      if (nameOrSignatureOrSighash.indexOf("(") === -1) {
        const name = nameOrSignatureOrSighash.trim();
        const matching = Object.keys(this.errors).filter((f) => f.split(
          "("
          /* fix:) */
        )[0] === name);
        if (matching.length === 0) {
          logger13.throwArgumentError("no matching error", "name", name);
        } else if (matching.length > 1) {
          logger13.throwArgumentError("multiple matching errors", "name", name);
        }
        return this.errors[matching[0]];
      }
      const result = this.errors[FunctionFragment.fromString(nameOrSignatureOrSighash).format()];
      if (!result) {
        logger13.throwArgumentError("no matching error", "signature", nameOrSignatureOrSighash);
      }
      return result;
    }
    // Get the sighash (the bytes4 selector) used by Solidity to identify a function
    getSighash(fragment) {
      if (typeof fragment === "string") {
        try {
          fragment = this.getFunction(fragment);
        } catch (error) {
          try {
            fragment = this.getError(fragment);
          } catch (_) {
            throw error;
          }
        }
      }
      return getStatic(this.constructor, "getSighash")(fragment);
    }
    // Get the topic (the bytes32 hash) used by Solidity to identify an event
    getEventTopic(eventFragment) {
      if (typeof eventFragment === "string") {
        eventFragment = this.getEvent(eventFragment);
      }
      return getStatic(this.constructor, "getEventTopic")(eventFragment);
    }
    _decodeParams(params, data) {
      return this._abiCoder.decode(params, data);
    }
    _encodeParams(params, values) {
      return this._abiCoder.encode(params, values);
    }
    encodeDeploy(values) {
      return this._encodeParams(this.deploy.inputs, values || []);
    }
    decodeErrorResult(fragment, data) {
      if (typeof fragment === "string") {
        fragment = this.getError(fragment);
      }
      const bytes = arrayify(data);
      if (hexlify(bytes.slice(0, 4)) !== this.getSighash(fragment)) {
        logger13.throwArgumentError(`data signature does not match error ${fragment.name}.`, "data", hexlify(bytes));
      }
      return this._decodeParams(fragment.inputs, bytes.slice(4));
    }
    encodeErrorResult(fragment, values) {
      if (typeof fragment === "string") {
        fragment = this.getError(fragment);
      }
      return hexlify(concat([
        this.getSighash(fragment),
        this._encodeParams(fragment.inputs, values || [])
      ]));
    }
    // Decode the data for a function call (e.g. tx.data)
    decodeFunctionData(functionFragment, data) {
      if (typeof functionFragment === "string") {
        functionFragment = this.getFunction(functionFragment);
      }
      const bytes = arrayify(data);
      if (hexlify(bytes.slice(0, 4)) !== this.getSighash(functionFragment)) {
        logger13.throwArgumentError(`data signature does not match function ${functionFragment.name}.`, "data", hexlify(bytes));
      }
      return this._decodeParams(functionFragment.inputs, bytes.slice(4));
    }
    // Encode the data for a function call (e.g. tx.data)
    encodeFunctionData(functionFragment, values) {
      if (typeof functionFragment === "string") {
        functionFragment = this.getFunction(functionFragment);
      }
      return hexlify(concat([
        this.getSighash(functionFragment),
        this._encodeParams(functionFragment.inputs, values || [])
      ]));
    }
    // Decode the result from a function call (e.g. from eth_call)
    decodeFunctionResult(functionFragment, data) {
      if (typeof functionFragment === "string") {
        functionFragment = this.getFunction(functionFragment);
      }
      let bytes = arrayify(data);
      let reason = null;
      let message = "";
      let errorArgs = null;
      let errorName = null;
      let errorSignature = null;
      switch (bytes.length % this._abiCoder._getWordSize()) {
        case 0:
          try {
            return this._abiCoder.decode(functionFragment.outputs, bytes);
          } catch (error) {
          }
          break;
        case 4: {
          const selector = hexlify(bytes.slice(0, 4));
          const builtin = BuiltinErrors[selector];
          if (builtin) {
            errorArgs = this._abiCoder.decode(builtin.inputs, bytes.slice(4));
            errorName = builtin.name;
            errorSignature = builtin.signature;
            if (builtin.reason) {
              reason = errorArgs[0];
            }
            if (errorName === "Error") {
              message = `; VM Exception while processing transaction: reverted with reason string ${JSON.stringify(errorArgs[0])}`;
            } else if (errorName === "Panic") {
              message = `; VM Exception while processing transaction: reverted with panic code ${errorArgs[0]}`;
            }
          } else {
            try {
              const error = this.getError(selector);
              errorArgs = this._abiCoder.decode(error.inputs, bytes.slice(4));
              errorName = error.name;
              errorSignature = error.format();
            } catch (error) {
            }
          }
          break;
        }
      }
      return logger13.throwError("call revert exception" + message, Logger.errors.CALL_EXCEPTION, {
        method: functionFragment.format(),
        data: hexlify(data),
        errorArgs,
        errorName,
        errorSignature,
        reason
      });
    }
    // Encode the result for a function call (e.g. for eth_call)
    encodeFunctionResult(functionFragment, values) {
      if (typeof functionFragment === "string") {
        functionFragment = this.getFunction(functionFragment);
      }
      return hexlify(this._abiCoder.encode(functionFragment.outputs, values || []));
    }
    // Create the filter for the event with search criteria (e.g. for eth_filterLog)
    encodeFilterTopics(eventFragment, values) {
      if (typeof eventFragment === "string") {
        eventFragment = this.getEvent(eventFragment);
      }
      if (values.length > eventFragment.inputs.length) {
        logger13.throwError("too many arguments for " + eventFragment.format(), Logger.errors.UNEXPECTED_ARGUMENT, {
          argument: "values",
          value: values
        });
      }
      let topics = [];
      if (!eventFragment.anonymous) {
        topics.push(this.getEventTopic(eventFragment));
      }
      const encodeTopic = (param, value) => {
        if (param.type === "string") {
          return id2(value);
        } else if (param.type === "bytes") {
          return keccak256(hexlify(value));
        }
        if (param.type === "bool" && typeof value === "boolean") {
          value = value ? "0x01" : "0x00";
        }
        if (param.type.match(/^u?int/)) {
          value = BigNumber2.from(value).toHexString();
        }
        if (param.type === "address") {
          this._abiCoder.encode(["address"], [value]);
        }
        return hexZeroPad(hexlify(value), 32);
      };
      values.forEach((value, index) => {
        let param = eventFragment.inputs[index];
        if (!param.indexed) {
          if (value != null) {
            logger13.throwArgumentError("cannot filter non-indexed parameters; must be null", "contract." + param.name, value);
          }
          return;
        }
        if (value == null) {
          topics.push(null);
        } else if (param.baseType === "array" || param.baseType === "tuple") {
          logger13.throwArgumentError("filtering with tuples or arrays not supported", "contract." + param.name, value);
        } else if (Array.isArray(value)) {
          topics.push(value.map((value2) => encodeTopic(param, value2)));
        } else {
          topics.push(encodeTopic(param, value));
        }
      });
      while (topics.length && topics[topics.length - 1] === null) {
        topics.pop();
      }
      return topics;
    }
    encodeEventLog(eventFragment, values) {
      if (typeof eventFragment === "string") {
        eventFragment = this.getEvent(eventFragment);
      }
      const topics = [];
      const dataTypes = [];
      const dataValues = [];
      if (!eventFragment.anonymous) {
        topics.push(this.getEventTopic(eventFragment));
      }
      if (values.length !== eventFragment.inputs.length) {
        logger13.throwArgumentError("event arguments/values mismatch", "values", values);
      }
      eventFragment.inputs.forEach((param, index) => {
        const value = values[index];
        if (param.indexed) {
          if (param.type === "string") {
            topics.push(id2(value));
          } else if (param.type === "bytes") {
            topics.push(keccak256(value));
          } else if (param.baseType === "tuple" || param.baseType === "array") {
            throw new Error("not implemented");
          } else {
            topics.push(this._abiCoder.encode([param.type], [value]));
          }
        } else {
          dataTypes.push(param);
          dataValues.push(value);
        }
      });
      return {
        data: this._abiCoder.encode(dataTypes, dataValues),
        topics
      };
    }
    // Decode a filter for the event and the search criteria
    decodeEventLog(eventFragment, data, topics) {
      if (typeof eventFragment === "string") {
        eventFragment = this.getEvent(eventFragment);
      }
      if (topics != null && !eventFragment.anonymous) {
        let topicHash = this.getEventTopic(eventFragment);
        if (!isHexString(topics[0], 32) || topics[0].toLowerCase() !== topicHash) {
          logger13.throwError("fragment/topic mismatch", Logger.errors.INVALID_ARGUMENT, { argument: "topics[0]", expected: topicHash, value: topics[0] });
        }
        topics = topics.slice(1);
      }
      let indexed = [];
      let nonIndexed = [];
      let dynamic = [];
      eventFragment.inputs.forEach((param, index) => {
        if (param.indexed) {
          if (param.type === "string" || param.type === "bytes" || param.baseType === "tuple" || param.baseType === "array") {
            indexed.push(ParamType.fromObject({ type: "bytes32", name: param.name }));
            dynamic.push(true);
          } else {
            indexed.push(param);
            dynamic.push(false);
          }
        } else {
          nonIndexed.push(param);
          dynamic.push(false);
        }
      });
      let resultIndexed = topics != null ? this._abiCoder.decode(indexed, concat(topics)) : null;
      let resultNonIndexed = this._abiCoder.decode(nonIndexed, data, true);
      let result = [];
      let nonIndexedIndex = 0, indexedIndex = 0;
      eventFragment.inputs.forEach((param, index) => {
        if (param.indexed) {
          if (resultIndexed == null) {
            result[index] = new Indexed({ _isIndexed: true, hash: null });
          } else if (dynamic[index]) {
            result[index] = new Indexed({ _isIndexed: true, hash: resultIndexed[indexedIndex++] });
          } else {
            try {
              result[index] = resultIndexed[indexedIndex++];
            } catch (error) {
              result[index] = error;
            }
          }
        } else {
          try {
            result[index] = resultNonIndexed[nonIndexedIndex++];
          } catch (error) {
            result[index] = error;
          }
        }
        if (param.name && result[param.name] == null) {
          const value = result[index];
          if (value instanceof Error) {
            Object.defineProperty(result, param.name, {
              enumerable: true,
              get: () => {
                throw wrapAccessError(`property ${JSON.stringify(param.name)}`, value);
              }
            });
          } else {
            result[param.name] = value;
          }
        }
      });
      for (let i = 0; i < result.length; i++) {
        const value = result[i];
        if (value instanceof Error) {
          Object.defineProperty(result, i, {
            enumerable: true,
            get: () => {
              throw wrapAccessError(`index ${i}`, value);
            }
          });
        }
      }
      return Object.freeze(result);
    }
    // Given a transaction, find the matching function fragment (if any) and
    // determine all its properties and call parameters
    parseTransaction(tx) {
      let fragment = this.getFunction(tx.data.substring(0, 10).toLowerCase());
      if (!fragment) {
        return null;
      }
      return new TransactionDescription({
        args: this._abiCoder.decode(fragment.inputs, "0x" + tx.data.substring(10)),
        functionFragment: fragment,
        name: fragment.name,
        signature: fragment.format(),
        sighash: this.getSighash(fragment),
        value: BigNumber2.from(tx.value || "0")
      });
    }
    // @TODO
    //parseCallResult(data: BytesLike): ??
    // Given an event log, find the matching event fragment (if any) and
    // determine all its properties and values
    parseLog(log2) {
      let fragment = this.getEvent(log2.topics[0]);
      if (!fragment || fragment.anonymous) {
        return null;
      }
      return new LogDescription({
        eventFragment: fragment,
        name: fragment.name,
        signature: fragment.format(),
        topic: this.getEventTopic(fragment),
        args: this.decodeEventLog(fragment, log2.data, log2.topics)
      });
    }
    parseError(data) {
      const hexData = hexlify(data);
      let fragment = this.getError(hexData.substring(0, 10).toLowerCase());
      if (!fragment) {
        return null;
      }
      return new ErrorDescription({
        args: this._abiCoder.decode(fragment.inputs, "0x" + hexData.substring(10)),
        errorFragment: fragment,
        name: fragment.name,
        signature: fragment.format(),
        sighash: this.getSighash(fragment)
      });
    }
    /*
    static from(value: Array<Fragment | string | JsonAbi> | string | Interface) {
        if (Interface.isInterface(value)) {
            return value;
        }
        if (typeof(value) === "string") {
            return new Interface(JSON.parse(value));
        }
        return new Interface(value);
    }
    */
    static isInterface(value) {
      return !!(value && value._isInterface);
    }
  };

  // node_modules/@ledgerhq/domain-service/lib-es/signers/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/domain-service/lib-es/registries/index.js
  init_buffer_shim_entry();
  var REGISTRIES = [
    {
      name: "ens",
      resolvers: {
        forward: "https://explorers.api.live.ledger.com/blockchain/v4/eth/ens/resolve/{name}",
        reverse: "https://explorers.api.live.ledger.com/blockchain/v4/eth/ens/reverse-resolve/{address}"
      },
      signatures: {
        forward: "https://nft.api.live.ledger.com/v1/names/ens/forward/{name}?challenge={challenge}",
        reverse: "https://nft.api.live.ledger.com/v1/names/ens/reverse/{address}?challenge={challenge}"
      },
      patterns: {
        forward: new RegExp("\\.eth$"),
        reverse: new RegExp("^0x[0-9a-fA-F]{40}$")
      },
      coinTypes: [60]
    }
  ];
  var getRegistries = async () => REGISTRIES;

  // node_modules/@ledgerhq/domain-service/lib-es/utils/index.js
  init_buffer_shim_entry();
  var validateDomain = (domain) => {
    if (typeof domain !== "string") {
      return false;
    }
    const lengthIsValid = domain.length > 0 && Number(domain.length) < 30;
    const containsOnlyValidChars = new RegExp("^[a-zA-Z0-9\\-\\_\\.]+$").test(domain);
    return lengthIsValid && containsOnlyValidChars;
  };

  // node_modules/@ledgerhq/domain-service/lib-es/signers/index.js
  var signDomainResolution = async (domain, registryName, challenge) => {
    if (!validateDomain(domain)) {
      throw new Error(`Domains with more than 255 caracters or with unicode are not supported on the nano. Domain: ${domain}`);
    }
    const registries = await getRegistries();
    const registry = registries.find((r) => r.name === registryName);
    if (!registry)
      return null;
    const url = registry.signatures.forward.replace("{name}", domain).replace("{challenge}", challenge);
    return axios_default.request({
      method: "GET",
      url
    }).then(({ data }) => data.payload).catch((error) => {
      if (error.status !== 404) {
        log("domain-service", "failed to get APDU for a domain", {
          domain,
          error
        });
      }
      return null;
    });
  };
  var signAddressResolution = async (address, registryName, challenge) => {
    const registries = await getRegistries();
    const registry = registries.find((r) => r.name === registryName);
    if (!registry)
      return null;
    const url = registry.signatures.reverse.replace("{address}", address).replace("{challenge}", challenge);
    return axios_default.request({
      method: "GET",
      url
    }).then(({ data }) => data.payload).catch((error) => {
      if (error.status !== 404) {
        log("domain-service", "failed to get APDU for an address", {
          address,
          error
        });
      }
      return null;
    });
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/Uniswap/constants.js
  init_buffer_shim_entry();
  var UNISWAP_UNIVERSAL_ROUTER_ADDRESS = "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad";
  var UNISWAP_EXECUTE_SELECTOR = "0x3593564c";
  var WETH_PER_CHAIN_ID = {
    // Ethereum Mainnet
    1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    // Ethereum Goerli
    5: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    // Ethereum Sepolia
    11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    // Arbitrum One
    42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    // Arbitrum Goerli
    421613: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
    // Avalanche C-Chain
    43114: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    // BSC
    56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    // Base
    8453: "0x4200000000000000000000000000000000000006",
    // Base Goerli
    84531: "0x44D627f900da8AdaC7561bD73aA745F132450798",
    // Blast
    23888: "0x4300000000000000000000000000000000000004",
    // Celo
    42220: new Error("Celo isn't supporting wrapping Eth"),
    // Celo Alfajores
    44787: new Error("Celo Alfajores isn't supporting wrapping Eth"),
    // Optimism
    10: "0x4200000000000000000000000000000000000006",
    // Optimism Goerli
    420: "0x4200000000000000000000000000000000000006",
    // Polygon
    137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    // Polygon Mumbai
    80001: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889"
  };
  var UNISWAP_COMMANDS = {
    "0x08": "V2_SWAP_EXACT_IN",
    "0x09": "V2_SWAP_EXACT_OUT",
    "0x00": "V3_SWAP_EXACT_IN",
    "0x01": "V3_SWAP_EXACT_OUT",
    "0x0b": "WRAP_ETH",
    "0x0c": "UNWRAP_ETH",
    "0x0a": "PERMIT2_PERMIT",
    "0x0d": "PERMIT2_TRANSFER_FROM",
    "0x02": "PERMIT2_PERMIT_BATCH",
    "0x03": "PERMIT2_TRANSFER_FROM_BATCH",
    "0x06": "PAY_PORTION",
    "0x04": "SWEEP"
  };
  var SWAP_COMMANDS = [
    "V2_SWAP_EXACT_IN",
    "V2_SWAP_EXACT_OUT",
    "V3_SWAP_EXACT_IN",
    "V3_SWAP_EXACT_OUT"
  ];

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/Uniswap/index.js
  init_buffer_shim_entry();

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/Uniswap/decoders.js
  init_buffer_shim_entry();
  var swapV2Decoder = (input) => {
    const [, , , addresses] = defaultAbiCoder.decode(["address", "uint256", "uint256", "address[]", "bool"], input);
    return addresses.map((address) => address.toLowerCase());
  };
  var swapV3Decoder = (input) => {
    const [, , , path] = defaultAbiCoder.decode(["address", "uint256", "uint256", "bytes", "bool"], input);
    const pathBuffer = import_buffer.Buffer.from(path.slice(2), "hex");
    const tokens = [];
    let i = 0;
    while (i < pathBuffer.length) {
      tokens.push(`0x${pathBuffer.subarray(i, i + 20).toString("hex").toLowerCase()}`);
      i += 23;
    }
    return tokens;
  };
  var wrapEthDecoder = (input, chainId) => {
    const contract = WETH_PER_CHAIN_ID[chainId];
    return contract instanceof Error ? [] : [contract.toLowerCase()];
  };
  var sweepDecoder = (input) => {
    const [token] = defaultAbiCoder.decode(["address", "address", "uint256"], input);
    return [token.toLowerCase()];
  };
  var noDecoder = () => [];
  var UniswapDecoders = {
    V2_SWAP_EXACT_IN: swapV2Decoder,
    V2_SWAP_EXACT_OUT: swapV2Decoder,
    V3_SWAP_EXACT_IN: swapV3Decoder,
    V3_SWAP_EXACT_OUT: swapV3Decoder,
    WRAP_ETH: wrapEthDecoder,
    UNWRAP_ETH: wrapEthDecoder,
    PERMIT2_PERMIT: noDecoder,
    PERMIT2_TRANSFER_FROM: noDecoder,
    PERMIT2_PERMIT_BATCH: noDecoder,
    PERMIT2_TRANSFER_FROM_BATCH: noDecoder,
    PAY_PORTION: noDecoder,
    SWEEP: sweepDecoder
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/Uniswap/index.js
  var isSupported2 = (calldata, to, chainId, commandsAndTokens) => {
    const selector = calldata.slice(0, 10);
    const contractAddress = to?.toLowerCase();
    if (selector !== UNISWAP_EXECUTE_SELECTOR || contractAddress !== UNISWAP_UNIVERSAL_ROUTER_ADDRESS || !commandsAndTokens.length) {
      return false;
    }
    let endingAsset;
    for (let i = 0; i < commandsAndTokens.length; i++) {
      const [command, tokens] = commandsAndTokens[i];
      if (!command)
        return false;
      if (!SWAP_COMMANDS.includes(command))
        continue;
      const poolVersion = command.slice(0, 2);
      if (endingAsset && // Chained swaps should work as a pipe regarding the traded assets:
      // The last asset of swap 1 should be the first asset of swap 2
      // and the same pool version should be used for both swaps
      (endingAsset.asset !== tokens[0] || endingAsset.poolVersion !== poolVersion)) {
        return false;
      } else {
        endingAsset = {
          poolVersion,
          asset: tokens[tokens.length - 1]
        };
      }
    }
    return true;
  };
  var getCommandsAndTokensFromUniswapCalldata = (calldata, chainId) => {
    try {
      const [commands, inputs] = new Interface([
        "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable"
      ]).decodeFunctionData("execute", calldata);
      const commandsBuffer = import_buffer.Buffer.from(commands.slice(2), "hex");
      return commandsBuffer.reduce((acc, curr, i) => {
        const commandName = UNISWAP_COMMANDS[`0x${curr.toString(16).padStart(2, "0")}`];
        if (!commandName)
          return [...acc, [void 0, []]];
        const commandDecoder = UniswapDecoders[commandName];
        return [...acc, [commandName, commandDecoder(inputs[i], chainId)]];
      }, []);
    } catch (e) {
      log("Uniswap", "Error decoding Uniswap calldata", e);
      return [];
    }
  };
  var loadInfosForUniswap = async (transaction, chainId, userConfig) => {
    const selector = transaction.data.slice(0, 10);
    const commandsAndTokens = getCommandsAndTokensFromUniswapCalldata(transaction.data, chainId);
    if (!isSupported2(selector, transaction.to, chainId, commandsAndTokens)) {
      return {};
    }
    const uniqueTokens = Array.from(new Set(commandsAndTokens.flatMap(([, tokens]) => tokens)));
    const tokenDescriptorsPromises = Promise.all(uniqueTokens.map(async (token) => {
      const erc20SignaturesBlob = await findERC20SignaturesInfo(userConfig || {}, chainId);
      return byContractAddressAndChainId(token, chainId, erc20SignaturesBlob, userConfig)?.data;
    }));
    const tokenDescriptors = await tokenDescriptorsPromises.then((descriptors) => descriptors.filter((descriptor) => !!descriptor));
    const pluginName = "Uniswap";
    const lengthBuff = import_buffer.Buffer.alloc(1);
    lengthBuff.writeUIntBE(pluginName.length, 0, 1);
    const pluginNameBuff = import_buffer.Buffer.from(pluginName);
    const contractAddressBuff = import_buffer.Buffer.from(UNISWAP_UNIVERSAL_ROUTER_ADDRESS.slice(2), "hex");
    const selectorBuff = import_buffer.Buffer.from(UNISWAP_EXECUTE_SELECTOR.slice(2), "hex");
    const signature2 = import_buffer.Buffer.from(
      // Signature is hardcoded as it would create issues by being in the CAL ethereum.json file
      "3044022014391e8f355867a57fe88f6a5a4dbcb8bf8f888a9db3ff3449caf72d120396bd02200c13d9c3f79400fe0aa0434ac54d59b79503c9964a4abc3e8cd22763e0242935",
      "hex"
    );
    const pluginData = import_buffer.Buffer.concat([
      lengthBuff,
      pluginNameBuff,
      contractAddressBuff,
      selectorBuff,
      signature2
    ]);
    return {
      pluginData,
      tokenDescriptors
    };
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/contracts.js
  init_buffer_shim_entry();
  var loadInfosForContractMethod = async (contractAddress, selector, chainId, userLoadConfig) => {
    const { pluginBaseURL, extraPlugins } = getLoadConfig(userLoadConfig);
    let data = {};
    if (pluginBaseURL) {
      const url = `${pluginBaseURL}/plugins/ethereum.json`;
      data = await axios_default.get(`${pluginBaseURL}/plugins/ethereum.json`).then((r) => r.data).catch((e) => {
        log("error", "could not fetch from " + url + ": " + String(e));
        return null;
      });
    }
    if (extraPlugins) {
      data = { ...data, ...extraPlugins };
    }
    if (!data)
      return;
    const lcSelector = selector.toLowerCase();
    const lcContractAddress = contractAddress.toLowerCase();
    if (lcContractAddress in data) {
      const contractSelectors = data[lcContractAddress];
      if (lcSelector in contractSelectors) {
        return {
          payload: contractSelectors[lcSelector]["serialized_data"],
          signature: contractSelectors[lcSelector]["signature"],
          plugin: contractSelectors[lcSelector]["plugin"],
          erc20OfInterest: contractSelectors[lcSelector]["erc20OfInterest"],
          abi: contractSelectors["abi"]
        };
      }
    }
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/nfts.js
  init_buffer_shim_entry();
  var getNFTInfo = async (contractAddress, chainId, userLoadConfig) => {
    const { nftExplorerBaseURL } = getLoadConfig(userLoadConfig);
    if (!nftExplorerBaseURL)
      return;
    const url = `${nftExplorerBaseURL}/${chainId}/contracts/${contractAddress}`;
    const response = await axios_default.get(url).then((r) => r.data).catch((e) => {
      log("error", "could not fetch from " + url + ": " + String(e));
      return null;
    });
    if (!response)
      return;
    const payload = response["payload"];
    const collectionNameLength = parseInt(payload.slice(4, 6), 16);
    const collectionNameHex = payload.substr(6, collectionNameLength * 2);
    const collectionName = collectionNameHex.match(/.{2}/g)?.reduce((acc, curr) => acc += String.fromCharCode(parseInt(curr, 16)), "");
    return {
      contractAddress,
      collectionName: collectionName || "",
      data: payload
    };
  };
  var loadNftPlugin = async (contractAddress, selector, chainId, userLoadConfig) => {
    const { nftExplorerBaseURL } = getLoadConfig(userLoadConfig);
    if (!nftExplorerBaseURL)
      return;
    const url = `${nftExplorerBaseURL}/${chainId}/contracts/${contractAddress}/plugin-selector/${selector}`;
    const response = await axios_default.get(url).then((r) => r.data).catch((e) => {
      log("error", "could not fetch from " + url + ": " + String(e));
      return null;
    });
    if (!response)
      return;
    const payload = response["payload"];
    return payload;
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/services/ledger/index.js
  var getAdditionalDataForContract = async (contractAddress, chainIdUint32, loadConfig, shouldResolve, providedErc20SignaturesBlob) => {
    const resolution = {
      nfts: [],
      erc20Tokens: []
    };
    if (shouldResolve.nft) {
      const nftInfo = await getNFTInfo(contractAddress, chainIdUint32, loadConfig);
      if (nftInfo) {
        log("ethereum", "loaded nft info for " + nftInfo.contractAddress + " (" + nftInfo.collectionName + ")");
        resolution.nfts.push(nftInfo.data);
      } else {
        log("ethereum", "couldn't load nft info for " + contractAddress);
      }
    }
    if (shouldResolve.token) {
      const erc20SignaturesBlob = providedErc20SignaturesBlob ?? await findERC20SignaturesInfo(loadConfig, chainIdUint32);
      const erc20Info = byContractAddressAndChainId(contractAddress, chainIdUint32, erc20SignaturesBlob, loadConfig);
      if (erc20Info) {
        log("ethereum", "loaded erc20token info for " + erc20Info.contractAddress + " (" + erc20Info.ticker + ")");
        resolution.erc20Tokens.push(erc20Info.data.toString("hex"));
      } else {
        log("ethereum", "couldn't load erc20token info for " + contractAddress);
      }
    }
    return resolution;
  };
  var loadNanoAppPlugins = async (contractAddress, selector, parsedTransaction, chainIdUint32, loadConfig, shouldResolve) => {
    let resolution = {
      externalPlugin: [],
      plugin: [],
      nfts: [],
      erc20Tokens: [],
      domains: []
    };
    if (shouldResolve.nft) {
      const nftPluginPayload = await loadNftPlugin(contractAddress, selector, chainIdUint32, loadConfig);
      if (nftPluginPayload) {
        resolution.plugin.push(nftPluginPayload);
      } else {
        log("ethereum", "no NFT plugin payload for selector " + selector + " and address " + contractAddress);
      }
    }
    if (shouldResolve.externalPlugins && contractAddress !== UNISWAP_UNIVERSAL_ROUTER_ADDRESS) {
      const contractMethodInfos = await loadInfosForContractMethod(contractAddress, selector, chainIdUint32, loadConfig);
      if (contractMethodInfos) {
        const { plugin, payload, signature: signature2, erc20OfInterest, abi } = contractMethodInfos;
        if (plugin) {
          log("ethereum", `found plugin (${plugin}) for selector: ${selector}`);
          resolution.externalPlugin.push({ payload, signature: signature2 });
        }
        if (erc20OfInterest && erc20OfInterest.length && abi) {
          const contract = new Interface(abi);
          const args = contract.parseTransaction(parsedTransaction).args;
          for (const path of erc20OfInterest) {
            const erc20ContractAddress = path.split(".").reduce((value, seg) => {
              if (seg === "-1" && Array.isArray(value)) {
                return value[value.length - 1];
              }
              return value[seg];
            }, args);
            const externalPluginResolution = await getAdditionalDataForContract(erc20ContractAddress, chainIdUint32, loadConfig, {
              nft: false,
              externalPlugins: false,
              token: true,
              // enforcing resolution of tokens for external plugins that need info on assets (e.g. for a swap)
              uniswapV3: false
            });
            resolution = mergeResolutions([resolution, externalPluginResolution]);
          }
        }
      } else {
        log("ethereum", "no infos for selector " + selector);
      }
    }
    if (shouldResolve.uniswapV3) {
      const { pluginData, tokenDescriptors } = await loadInfosForUniswap(parsedTransaction, chainIdUint32);
      if (pluginData && tokenDescriptors) {
        resolution.externalPlugin.push({
          payload: pluginData.toString("hex"),
          signature: ""
        });
        resolution.erc20Tokens.push(...tokenDescriptors.map((d) => d.toString("hex")));
      }
    }
    return resolution;
  };
  var resolveTransaction = async (rawTxHex, loadConfig, resolutionConfig, parseTx = parse2, additionalErc20SignaturesConfig = null) => {
    const rawTx = import_buffer.Buffer.from(rawTxHex, "hex");
    const parsedTransaction = parseTx(`0x${rawTx.toString("hex")}`);
    const chainIdUint32 = getChainIdAsUint32(parsedTransaction.chainId);
    const { domains } = resolutionConfig;
    const contractAddress = parsedTransaction.to?.toLowerCase();
    if (!contractAddress)
      return {
        nfts: [],
        erc20Tokens: [],
        externalPlugin: [],
        plugin: [],
        domains: []
      };
    const selector = parsedTransaction.data.length >= 10 && parsedTransaction.data.substring(0, 10);
    const resolutions = [];
    if (selector) {
      const shouldResolve = {
        token: resolutionConfig.erc20 && tokenSelectors.includes(selector),
        nft: resolutionConfig.nft && nftSelectors.includes(selector),
        externalPlugins: resolutionConfig.externalPlugins,
        uniswapV3: resolutionConfig.uniswapV3
      };
      const pluginsResolution = await loadNanoAppPlugins(contractAddress, selector, parsedTransaction, chainIdUint32, loadConfig, shouldResolve);
      if (pluginsResolution) {
        resolutions.push(pluginsResolution);
      }
      const contractResolution = await getAdditionalDataForContract(contractAddress, chainIdUint32, loadConfig, shouldResolve);
      if (contractResolution) {
        resolutions.push(contractResolution);
      }
    }
    if (additionalErc20SignaturesConfig) {
      const contractResolution = await getAdditionalDataForContract(additionalErc20SignaturesConfig.contractAddressToResolve, chainIdUint32, loadConfig, { token: true, nft: false, externalPlugins: false, uniswapV3: false }, additionalErc20SignaturesConfig.additionalErc20SignaturesBlob);
      if (contractResolution) {
        resolutions.push(contractResolution);
      }
    }
    if (domains) {
      const domainResolutions = {
        domains
      };
      resolutions.push(domainResolutions);
    }
    return mergeResolutions(resolutions);
  };
  var ledger_default = {
    resolveTransaction,
    signDomainResolution,
    signAddressResolution,
    parseTransaction: parse2
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/modules/Domains/index.js
  var domainResolutionFlow = async (appBinding, domainDescriptor) => {
    if (!domainDescriptor)
      return;
    const { domain, address, registry, type } = domainDescriptor;
    const challenge = await appBinding.getChallenge();
    const domainAPDU = type === "forward" ? await ledger_default.signDomainResolution(domain, registry, challenge) : await ledger_default.signAddressResolution(address, registry, challenge);
    if (domainAPDU) {
      await appBinding.provideDomainName(domainAPDU);
    }
  };

  // node_modules/@ledgerhq/hw-app-eth/lib-es/Eth.js
  var starkQuantizationTypeMap = {
    eth: 1,
    erc20: 2,
    erc721: 3,
    erc20mintable: 4,
    erc721mintable: 5
  };
  var remapTransactionRelatedErrors = (e, chainId) => {
    if (e && e.statusCode === 27264) {
      if (chainId.toNumber() === 42220) {
        return new CeloAppPleaseEnableContractData2();
      }
      return new EthAppPleaseEnableContractData2("Please enable Blind signing or Contract data in the Ethereum app Settings");
    }
    return e;
  };
  var Eth = class {
    constructor(transport, scrambleKey = "w0w", loadConfig = {}, ledgerService = ledger_default) {
      __publicField(this, "transport");
      __publicField(this, "loadConfig");
      __publicField(this, "ledgerService");
      this.transport = transport;
      this.loadConfig = loadConfig;
      this.ledgerService = ledgerService;
      transport.decorateAppAPIMethods(this, [
        // "getChallange",                  | ⚠️
        // "provideERC20TokenInformation",  | Those methods are not decorated as they're
        // "setExternalPlugin",             | being used inside of the `signTransaction` flow
        // "setPlugin",                     | and shouldn't be locking the transport
        // "provideDomainName",             | ⚠️
        // "provideNFTInformation",         |
        "getAddress",
        "signTransaction",
        "signPersonalMessage",
        "getAppConfiguration",
        "signEIP712Message",
        "signEIP712HashedMessage",
        "starkGetPublicKey",
        "starkSignOrder",
        "starkSignOrder_v2",
        "starkSignTransfer",
        "starkSignTransfer_v2",
        "starkProvideQuantum",
        "starkProvideQuantum_v2",
        "starkUnsafeSign",
        "eth2GetPublicKey",
        "eth2SetWithdrawalIndex",
        "getEIP1024PublicEncryptionKey",
        "getEIP1024SharedSecret"
      ], scrambleKey);
    }
    setLoadConfig(loadConfig) {
      this.loadConfig = loadConfig;
    }
    /**
     * get Ethereum address for a given BIP 32 path.
     * @param path a path in BIP 32 format
     * @option boolDisplay optionally enable or not the display
     * @option boolChaincode optionally enable or not the chaincode request
     * @option chainId optionally display the network clearly on a Stax device
     * @return an object with a publicKey, address and (optionally) chainCode
     * @example
     * eth.getAddress("44'/60'/0'/0/0").then(o => o.address)
     */
    getAddress(path, boolDisplay, boolChaincode, chainId) {
      const paths = splitPath(path);
      let buffer = import_buffer.Buffer.alloc(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      if (chainId) {
        const chainIdBufferMask = import_buffer.Buffer.alloc(8, 0);
        const chainIdBuffer = import_buffer.Buffer.from(padHexString(new BigNumber(chainId).toString(16)), "hex");
        chainIdBufferMask.write(chainIdBuffer.toString("hex"), chainIdBufferMask.length - chainIdBuffer.length, "hex");
        buffer = import_buffer.Buffer.concat([buffer, chainIdBufferMask]);
      }
      return this.transport.send(224, 2, boolDisplay ? 1 : 0, boolChaincode ? 1 : 0, buffer).then((response) => {
        const publicKeyLength = response[0];
        const addressLength = response[1 + publicKeyLength];
        return {
          publicKey: response.slice(1, 1 + publicKeyLength).toString("hex"),
          address: "0x" + response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString("ascii"),
          chainCode: boolChaincode ? response.slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32).toString("hex") : void 0
        };
      });
    }
    /**
     * You can sign a transaction and retrieve v, r, s given the raw transaction and the BIP 32 path of the account to sign.
     *
     * @param path: the BIP32 path to sign the transaction on
     * @param rawTxHex: the raw ethereum transaction in hexadecimal to sign
     * @param resolution: resolution is an object with all "resolved" metadata necessary to allow the device to clear sign information. This includes: ERC20 token information, plugins, contracts, NFT signatures,... You must explicitly provide something to avoid having a warning. By default, you can use Ledger's service or your own resolution service. See services/types.js for the contract. Setting the value to "null" will fallback everything to blind signing but will still allow the device to sign the transaction.
     * @example
     import { ledgerService } from "@ledgerhq/hw-app-eth"
     const tx = "e8018504e3b292008252089428ee52a8f3d6e5d15f8b131996950d7f296c7952872bd72a2487400080"; // raw tx to sign
     const resolution = await ledgerService.resolveTransaction(tx);
     const result = eth.signTransaction("44'/60'/0'/0/0", tx, resolution);
     console.log(result);
     */
    async signTransaction(path, rawTxHex, resolution) {
      let APDU_FIELDS;
      (function(APDU_FIELDS2) {
        APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
        APDU_FIELDS2[APDU_FIELDS2["INS"] = 4] = "INS";
        APDU_FIELDS2[APDU_FIELDS2["P1_FIRST_CHUNK"] = 0] = "P1_FIRST_CHUNK";
        APDU_FIELDS2[APDU_FIELDS2["P1_FOLLOWING_CHUNK"] = 128] = "P1_FOLLOWING_CHUNK";
        APDU_FIELDS2[APDU_FIELDS2["P2"] = 0] = "P2";
      })(APDU_FIELDS || (APDU_FIELDS = {}));
      if (resolution === void 0) {
        console.warn("hw-app-eth: signTransaction(path, rawTxHex, resolution): please provide the 'resolution' parameter. See https://github.com/LedgerHQ/ledgerjs/blob/master/packages/hw-app-eth/README.md \u2013 the previous signature is deprecated and providing the 3rd 'resolution' parameter explicitly will become mandatory so you have the control on the resolution and the fallback mecanism (e.g. fallback to blind signing or not).// Possible solution:\n + import { ledgerService } from '@ledgerhq/hw-app-eth';\n + const resolution = await ledgerService.resolveTransaction(rawTxHex);");
        resolution = await this.ledgerService.resolveTransaction(rawTxHex, this.loadConfig, {
          externalPlugins: true,
          erc20: true,
          uniswapV3: false
        }).catch((e) => {
          console.warn("an error occurred in resolveTransaction => fallback to blind signing: " + String(e));
          return null;
        });
      }
      if (resolution) {
        for (const domainDescriptor of resolution.domains) {
          await domainResolutionFlow(this, domainDescriptor).catch((e) => {
            log("error", "domainResolutionFlow failed", {
              domainDescriptor,
              error: e
            });
          });
        }
        for (const plugin of resolution.plugin) {
          await this.setPlugin(plugin);
        }
        for (const { payload, signature: signature2 } of resolution.externalPlugin) {
          await this.setExternalPlugin(payload, signature2);
        }
        for (const nft of resolution.nfts) {
          await this.provideNFTInformation(nft);
        }
        for (const data of resolution.erc20Tokens) {
          await this.provideERC20TokenInformation(data);
        }
      }
      const rawTx = import_buffer.Buffer.from(rawTxHex, "hex");
      const parsedTransaction = this.ledgerService.parseTransaction(`0x${rawTx.toString("hex")}`);
      const chainId = new BigNumber(parsedTransaction.chainId);
      const paths = splitPath(path);
      const derivationPathBuff = import_buffer.Buffer.alloc(1 + paths.length * 4);
      derivationPathBuff[0] = paths.length;
      paths.forEach((element, index) => {
        derivationPathBuff.writeUInt32BE(element, 1 + 4 * index);
      });
      const payloadChunks = safeChunkTransaction(rawTx, derivationPathBuff, parsedTransaction.type);
      let response;
      for (const chunk of payloadChunks) {
        const isFirstChunk = chunk === payloadChunks[0];
        response = await this.transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, isFirstChunk ? APDU_FIELDS.P1_FIRST_CHUNK : APDU_FIELDS.P1_FOLLOWING_CHUNK, APDU_FIELDS.P2, chunk).catch((e) => {
          throw remapTransactionRelatedErrors(e, chainId);
        });
      }
      const v = getV(response[0], chainId, parsedTransaction.type);
      const r = response.subarray(1, 1 + 32).toString("hex");
      const s = response.subarray(1 + 32, 1 + 32 + 32).toString("hex");
      return { v, r, s };
    }
    /**
     * Helper to get resolution and signature of a transaction in a single method
     *
     * @param path: the BIP32 path to sign the transaction on
     * @param rawTxHex: the raw ethereum transaction in hexadecimal to sign
     * @param resolutionConfig: configuration about what should be clear signed in the transaction
     * @param throwOnError: optional parameter to determine if a failing resolution of the transaction should throw an error or not
     * @example
     const tx = "e8018504e3b292008252089428ee52a8f3d6e5d15f8b131996950d7f296c7952872bd72a2487400080"; // raw tx to sign
     const result = eth.clearSignTransaction("44'/60'/0'/0/0", tx, { erc20: true, externalPlugins: true, nft: true});
     console.log(result);
     */
    async clearSignTransaction(path, rawTxHex, resolutionConfig, throwOnError = false) {
      const resolution = await this.ledgerService.resolveTransaction(rawTxHex, this.loadConfig, resolutionConfig).catch((e) => {
        console.warn("an error occurred in resolveTransaction => fallback to blind signing: " + String(e));
        if (throwOnError) {
          throw e;
        }
        return null;
      });
      return this.signTransaction(path, rawTxHex, resolution);
    }
    /**
     */
    getAppConfiguration() {
      return this.transport.send(224, 6, 0, 0).then((response) => {
        return {
          arbitraryDataEnabled: response[0] & 1,
          erc20ProvisioningNecessary: response[0] & 2,
          starkEnabled: response[0] & 4,
          starkv2Supported: response[0] & 8,
          version: "" + response[1] + "." + response[2] + "." + response[3]
        };
      });
    }
    /**
    * You can sign a message according to eth_sign RPC call and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
    * @example
    eth.signPersonalMessage("44'/60'/0'/0/0", Buffer.from("test").toString("hex")).then(result => {
    var v = result['v'] - 27;
    v = v.toString(16);
    if (v.length < 2) {
      v = "0" + v;
    }
    console.log("Signature 0x" + result['r'] + result['s'] + v);
    })
     */
    async signPersonalMessage(path, messageHex) {
      const paths = splitPath(path);
      let offset = 0;
      const message = import_buffer.Buffer.from(messageHex, "hex");
      let response;
      while (offset !== message.length) {
        const maxChunkSize = offset === 0 ? 150 - 1 - paths.length * 4 - 4 : 150;
        const chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
        const buffer = import_buffer.Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + 4 + chunkSize : chunkSize);
        if (offset === 0) {
          buffer[0] = paths.length;
          paths.forEach((element, index) => {
            buffer.writeUInt32BE(element, 1 + 4 * index);
          });
          buffer.writeUInt32BE(message.length, 1 + 4 * paths.length);
          message.copy(buffer, 1 + 4 * paths.length + 4, offset, offset + chunkSize);
        } else {
          message.copy(buffer, 0, offset, offset + chunkSize);
        }
        response = await this.transport.send(224, 8, offset === 0 ? 0 : 128, 0, buffer);
        offset += chunkSize;
      }
      const v = response[0];
      const r = response.slice(1, 1 + 32).toString("hex");
      const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
      return { v, r, s };
    }
    /**
    * Sign a prepared message following web3.eth.signTypedData specification. The host computes the domain separator and hashStruct(message)
    * @example
    eth.signEIP712HashedMessage("44'/60'/0'/0/0", Buffer.from("0101010101010101010101010101010101010101010101010101010101010101").toString("hex"), Buffer.from("0202020202020202020202020202020202020202020202020202020202020202").toString("hex")).then(result => {
    var v = result['v'] - 27;
    v = v.toString(16);
    if (v.length < 2) {
      v = "0" + v;
    }
    console.log("Signature 0x" + result['r'] + result['s'] + v);
    })
     */
    signEIP712HashedMessage(path, domainSeparatorHex, hashStructMessageHex) {
      return signEIP712HashedMessage(this.transport, path, domainSeparatorHex, hashStructMessageHex);
    }
    /**
     * Sign an EIP-712 formatted message following the specification here:
     * https://github.com/LedgerHQ/app-ethereum/blob/develop/doc/ethapp.asc#sign-eth-eip-712
     * ⚠️ This method is not compatible with nano S (LNS). Make sure to use a try/catch to fallback on the signEIP712HashedMessage method ⚠️
     @example
     eth.signEIP712Message("44'/60'/0'/0/0", {
        domain: {
          chainId: 69,
          name: "Da Domain",
          verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
          version: "1"
        },
        types: {
          "EIP712Domain": [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" }
            ],
          "Test": [
            { name: "contents", type: "string" }
          ]
        },
        primaryType: "Test",
        message: {contents: "Hello, Bob!"},
      })
     *
     * @param {String} path derivationPath
     * @param {Object} jsonMessage message to sign
     * @param {Boolean} fullImplem use the legacy implementation
     * @returns {Promise}
     */
    async signEIP712Message(path, jsonMessage, fullImplem = false) {
      return signEIP712Message(this.transport, path, jsonMessage, fullImplem, this.loadConfig);
    }
    /**
     * Method returning a 4 bytes TLV challenge as an hexa string
     *
     * @returns {Promise<string>}
     */
    async getChallenge() {
      let APDU_FIELDS;
      (function(APDU_FIELDS2) {
        APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
        APDU_FIELDS2[APDU_FIELDS2["INS"] = 32] = "INS";
        APDU_FIELDS2[APDU_FIELDS2["P1"] = 0] = "P1";
        APDU_FIELDS2[APDU_FIELDS2["P2"] = 0] = "P2";
        APDU_FIELDS2[APDU_FIELDS2["LC"] = 0] = "LC";
      })(APDU_FIELDS || (APDU_FIELDS = {}));
      return this.transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, APDU_FIELDS.P1, APDU_FIELDS.P2).then((res) => {
        const [, fourBytesChallenge, statusCode] = new RegExp("(.*)(.{4}$)").exec(res.toString("hex")) || [];
        if (statusCode !== "9000") {
          throw new Error(`An error happened while generating the challenge. Status code: ${statusCode}`);
        }
        return `0x${fourBytesChallenge}`;
      }).catch((e) => {
        log("error", "couldn't request a challenge", e);
        throw e;
      });
    }
    /**
     * get Stark public key for a given BIP 32 path.
     * @param path a path in BIP 32 format
     * @option boolDisplay optionally enable or not the display
     * @return the Stark public key
     */
    starkGetPublicKey(path, boolDisplay) {
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      return this.transport.send(240, 2, boolDisplay ? 1 : 0, 0, buffer).then((response) => {
        return response.slice(0, response.length - 2);
      });
    }
    /**
     * sign a Stark order
     * @param path a path in BIP 32 format
     * @option sourceTokenAddress contract address of the source token (not present for ETH)
     * @param sourceQuantization quantization used for the source token
     * @option destinationTokenAddress contract address of the destination token (not present for ETH)
     * @param destinationQuantization quantization used for the destination token
     * @param sourceVault ID of the source vault
     * @param destinationVault ID of the destination vault
     * @param amountSell amount to sell
     * @param amountBuy amount to buy
     * @param nonce transaction nonce
     * @param timestamp transaction validity timestamp
     * @return the signature
     */
    starkSignOrder(path, sourceTokenAddress, sourceQuantization, destinationTokenAddress, destinationQuantization, sourceVault, destinationVault, amountSell, amountBuy, nonce, timestamp) {
      const sourceTokenAddressHex = maybeHexBuffer(sourceTokenAddress);
      const destinationTokenAddressHex = maybeHexBuffer(destinationTokenAddress);
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 20 + 32 + 20 + 32 + 4 + 4 + 8 + 8 + 4 + 4, 0);
      let offset = 0;
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      offset = 1 + 4 * paths.length;
      if (sourceTokenAddressHex) {
        sourceTokenAddressHex.copy(buffer, offset);
      }
      offset += 20;
      import_buffer.Buffer.from(sourceQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      offset += 32;
      if (destinationTokenAddressHex) {
        destinationTokenAddressHex.copy(buffer, offset);
      }
      offset += 20;
      import_buffer.Buffer.from(destinationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      offset += 32;
      buffer.writeUInt32BE(sourceVault, offset);
      offset += 4;
      buffer.writeUInt32BE(destinationVault, offset);
      offset += 4;
      import_buffer.Buffer.from(amountSell.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
      offset += 8;
      import_buffer.Buffer.from(amountBuy.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
      offset += 8;
      buffer.writeUInt32BE(nonce, offset);
      offset += 4;
      buffer.writeUInt32BE(timestamp, offset);
      return this.transport.send(240, 4, 1, 0, buffer).then((response) => {
        const r = response.slice(1, 1 + 32).toString("hex");
        const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return {
          r,
          s
        };
      });
    }
    /**
     * sign a Stark order using the Starkex V2 protocol
     * @param path a path in BIP 32 format
     * @option sourceTokenAddress contract address of the source token (not present for ETH)
     * @param sourceQuantizationType quantization type used for the source token
     * @option sourceQuantization quantization used for the source token (not present for erc 721 or mintable erc 721)
     * @option sourceMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) associated to the source token
     * @option destinationTokenAddress contract address of the destination token (not present for ETH)
     * @param destinationQuantizationType quantization type used for the destination token
     * @option destinationQuantization quantization used for the destination token (not present for erc 721 or mintable erc 721)
     * @option destinationMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) associated to the destination token
     * @param sourceVault ID of the source vault
     * @param destinationVault ID of the destination vault
     * @param amountSell amount to sell
     * @param amountBuy amount to buy
     * @param nonce transaction nonce
     * @param timestamp transaction validity timestamp
     * @return the signature
     */
    starkSignOrder_v2(path, sourceTokenAddress, sourceQuantizationType, sourceQuantization, sourceMintableBlobOrTokenId, destinationTokenAddress, destinationQuantizationType, destinationQuantization, destinationMintableBlobOrTokenId, sourceVault, destinationVault, amountSell, amountBuy, nonce, timestamp) {
      const sourceTokenAddressHex = maybeHexBuffer(sourceTokenAddress);
      const destinationTokenAddressHex = maybeHexBuffer(destinationTokenAddress);
      if (!(sourceQuantizationType in starkQuantizationTypeMap)) {
        throw new Error("eth.starkSignOrderv2 invalid source quantization type=" + sourceQuantizationType);
      }
      if (!(destinationQuantizationType in starkQuantizationTypeMap)) {
        throw new Error("eth.starkSignOrderv2 invalid destination quantization type=" + destinationQuantizationType);
      }
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 1 + 20 + 32 + 32 + 1 + 20 + 32 + 32 + 4 + 4 + 8 + 8 + 4 + 4, 0);
      let offset = 0;
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      offset = 1 + 4 * paths.length;
      buffer[offset] = starkQuantizationTypeMap[sourceQuantizationType];
      offset++;
      if (sourceTokenAddressHex) {
        sourceTokenAddressHex.copy(buffer, offset);
      }
      offset += 20;
      if (sourceQuantization) {
        import_buffer.Buffer.from(sourceQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      if (sourceMintableBlobOrTokenId) {
        import_buffer.Buffer.from(sourceMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      buffer[offset] = starkQuantizationTypeMap[destinationQuantizationType];
      offset++;
      if (destinationTokenAddressHex) {
        destinationTokenAddressHex.copy(buffer, offset);
      }
      offset += 20;
      if (destinationQuantization) {
        import_buffer.Buffer.from(destinationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      if (destinationMintableBlobOrTokenId) {
        import_buffer.Buffer.from(destinationMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      buffer.writeUInt32BE(sourceVault, offset);
      offset += 4;
      buffer.writeUInt32BE(destinationVault, offset);
      offset += 4;
      import_buffer.Buffer.from(amountSell.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
      offset += 8;
      import_buffer.Buffer.from(amountBuy.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
      offset += 8;
      buffer.writeUInt32BE(nonce, offset);
      offset += 4;
      buffer.writeUInt32BE(timestamp, offset);
      return this.transport.send(240, 4, 3, 0, buffer).then((response) => {
        const r = response.slice(1, 1 + 32).toString("hex");
        const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return {
          r,
          s
        };
      });
    }
    /**
     * sign a Stark transfer
     * @param path a path in BIP 32 format
     * @option transferTokenAddress contract address of the token to be transferred (not present for ETH)
     * @param transferQuantization quantization used for the token to be transferred
     * @param targetPublicKey target Stark public key
     * @param sourceVault ID of the source vault
     * @param destinationVault ID of the destination vault
     * @param amountTransfer amount to transfer
     * @param nonce transaction nonce
     * @param timestamp transaction validity timestamp
     * @return the signature
     */
    starkSignTransfer(path, transferTokenAddress, transferQuantization, targetPublicKey, sourceVault, destinationVault, amountTransfer, nonce, timestamp) {
      const transferTokenAddressHex = maybeHexBuffer(transferTokenAddress);
      const targetPublicKeyHex = hexBuffer(targetPublicKey);
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 20 + 32 + 32 + 4 + 4 + 8 + 4 + 4, 0);
      let offset = 0;
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      offset = 1 + 4 * paths.length;
      if (transferTokenAddressHex) {
        transferTokenAddressHex.copy(buffer, offset);
      }
      offset += 20;
      import_buffer.Buffer.from(transferQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      offset += 32;
      targetPublicKeyHex.copy(buffer, offset);
      offset += 32;
      buffer.writeUInt32BE(sourceVault, offset);
      offset += 4;
      buffer.writeUInt32BE(destinationVault, offset);
      offset += 4;
      import_buffer.Buffer.from(amountTransfer.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
      offset += 8;
      buffer.writeUInt32BE(nonce, offset);
      offset += 4;
      buffer.writeUInt32BE(timestamp, offset);
      return this.transport.send(240, 4, 2, 0, buffer).then((response) => {
        const r = response.slice(1, 1 + 32).toString("hex");
        const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return {
          r,
          s
        };
      });
    }
    /**
     * sign a Stark transfer or conditional transfer using the Starkex V2 protocol
     * @param path a path in BIP 32 format
     * @option transferTokenAddress contract address of the token to be transferred (not present for ETH)
     * @param transferQuantizationType quantization type used for the token to be transferred
     * @option transferQuantization quantization used for the token to be transferred (not present for erc 721 or mintable erc 721)
     * @option transferMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) associated to the token to be transferred
     * @param targetPublicKey target Stark public key
     * @param sourceVault ID of the source vault
     * @param destinationVault ID of the destination vault
     * @param amountTransfer amount to transfer
     * @param nonce transaction nonce
     * @param timestamp transaction validity timestamp
     * @option conditionalTransferAddress onchain address of the condition for a conditional transfer
     * @option conditionalTransferFact fact associated to the condition for a conditional transfer
     * @return the signature
     */
    starkSignTransfer_v2(path, transferTokenAddress, transferQuantizationType, transferQuantization, transferMintableBlobOrTokenId, targetPublicKey, sourceVault, destinationVault, amountTransfer, nonce, timestamp, conditionalTransferAddress, conditionalTransferFact) {
      const transferTokenAddressHex = maybeHexBuffer(transferTokenAddress);
      const targetPublicKeyHex = hexBuffer(targetPublicKey);
      const conditionalTransferAddressHex = maybeHexBuffer(conditionalTransferAddress);
      if (!(transferQuantizationType in starkQuantizationTypeMap)) {
        throw new Error("eth.starkSignTransferv2 invalid quantization type=" + transferQuantizationType);
      }
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 1 + 20 + 32 + 32 + 32 + 4 + 4 + 8 + 4 + 4 + (conditionalTransferAddressHex ? 32 + 20 : 0), 0);
      let offset = 0;
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      offset = 1 + 4 * paths.length;
      buffer[offset] = starkQuantizationTypeMap[transferQuantizationType];
      offset++;
      if (transferTokenAddressHex) {
        transferTokenAddressHex.copy(buffer, offset);
      }
      offset += 20;
      if (transferQuantization) {
        import_buffer.Buffer.from(transferQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      if (transferMintableBlobOrTokenId) {
        import_buffer.Buffer.from(transferMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      targetPublicKeyHex.copy(buffer, offset);
      offset += 32;
      buffer.writeUInt32BE(sourceVault, offset);
      offset += 4;
      buffer.writeUInt32BE(destinationVault, offset);
      offset += 4;
      import_buffer.Buffer.from(amountTransfer.toString(16).padStart(16, "0"), "hex").copy(buffer, offset);
      offset += 8;
      buffer.writeUInt32BE(nonce, offset);
      offset += 4;
      buffer.writeUInt32BE(timestamp, offset);
      if (conditionalTransferAddressHex && conditionalTransferFact) {
        offset += 4;
        import_buffer.Buffer.from(conditionalTransferFact.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
        offset += 32;
        conditionalTransferAddressHex.copy(buffer, offset);
      }
      return this.transport.send(240, 4, conditionalTransferAddressHex ? 5 : 4, 0, buffer).then((response) => {
        const r = response.slice(1, 1 + 32).toString("hex");
        const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return {
          r,
          s
        };
      });
    }
    /**
     * provide quantization information before singing a deposit or withdrawal Stark powered contract call
     *
     * It shall be run following a provideERC20TokenInformation call for the given contract
     *
     * @param operationContract contract address of the token to be transferred (not present for ETH)
     * @param operationQuantization quantization used for the token to be transferred
     */
    starkProvideQuantum(operationContract, operationQuantization) {
      const operationContractHex = maybeHexBuffer(operationContract);
      const buffer = import_buffer.Buffer.alloc(20 + 32, 0);
      if (operationContractHex) {
        operationContractHex.copy(buffer, 0);
      }
      import_buffer.Buffer.from(operationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, 20);
      return this.transport.send(240, 8, 0, 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27904) {
          return false;
        }
        throw e;
      });
    }
    /**
     * provide quantization information before singing a deposit or withdrawal Stark powered contract call using the Starkex V2 protocol
     *
     * It shall be run following a provideERC20TokenInformation call for the given contract
     *
     * @param operationContract contract address of the token to be transferred (not present for ETH)
     * @param operationQuantizationType quantization type of the token to be transferred
     * @option operationQuantization quantization used for the token to be transferred (not present for erc 721 or mintable erc 721)
     * @option operationMintableBlobOrTokenId mintable blob (mintable erc 20 / mintable erc 721) or token id (erc 721) of the token to be transferred
     */
    starkProvideQuantum_v2(operationContract, operationQuantizationType, operationQuantization, operationMintableBlobOrTokenId) {
      const operationContractHex = maybeHexBuffer(operationContract);
      if (!(operationQuantizationType in starkQuantizationTypeMap)) {
        throw new Error("eth.starkProvideQuantumV2 invalid quantization type=" + operationQuantizationType);
      }
      const buffer = import_buffer.Buffer.alloc(20 + 32 + 32, 0);
      let offset = 0;
      if (operationContractHex) {
        operationContractHex.copy(buffer, offset);
      }
      offset += 20;
      if (operationQuantization) {
        import_buffer.Buffer.from(operationQuantization.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      offset += 32;
      if (operationMintableBlobOrTokenId) {
        import_buffer.Buffer.from(operationMintableBlobOrTokenId.toString(16).padStart(64, "0"), "hex").copy(buffer, offset);
      }
      return this.transport.send(240, 8, starkQuantizationTypeMap[operationQuantizationType], 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27904) {
          return false;
        }
        throw e;
      });
    }
    /**
     * sign the given hash over the Stark curve
     * It is intended for speed of execution in case an unknown Stark model is pushed and should be avoided as much as possible.
     * @param path a path in BIP 32 format
     * @param hash hexadecimal hash to sign
     * @return the signature
     */
    starkUnsafeSign(path, hash2) {
      const hashHex = hexBuffer(hash2);
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 32);
      let offset = 0;
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      offset = 1 + 4 * paths.length;
      hashHex.copy(buffer, offset);
      return this.transport.send(240, 10, 0, 0, buffer).then((response) => {
        const r = response.slice(1, 1 + 32).toString("hex");
        const s = response.slice(1 + 32, 1 + 32 + 32).toString("hex");
        return {
          r,
          s
        };
      });
    }
    /**
     * get an Ethereum 2 BLS-12 381 public key for a given BIP 32 path.
     * @param path a path in BIP 32 format
     * @option boolDisplay optionally enable or not the display
     * @return an object with a publicKey
     * @example
     * eth.eth2GetPublicKey("12381/3600/0/0").then(o => o.publicKey)
     */
    eth2GetPublicKey(path, boolDisplay) {
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      return this.transport.send(224, 14, boolDisplay ? 1 : 0, 0, buffer).then((response) => {
        return {
          publicKey: response.slice(0, -2).toString("hex")
        };
      });
    }
    /**
     * Set the index of a Withdrawal key used as withdrawal credentials in an ETH 2 deposit contract call signature
     *
     * It shall be run before the ETH 2 deposit transaction is signed. If not called, the index is set to 0
     *
     * @param withdrawalIndex index path in the EIP 2334 path m/12381/3600/withdrawalIndex/0
     * @return True if the method was executed successfully
     */
    eth2SetWithdrawalIndex(withdrawalIndex) {
      const buffer = import_buffer.Buffer.alloc(4, 0);
      buffer.writeUInt32BE(withdrawalIndex, 0);
      return this.transport.send(224, 16, 0, 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27904) {
          return false;
        }
        throw e;
      });
    }
    /**
     * get a public encryption key on Curve25519 according to EIP 1024
     * @param path a path in BIP 32 format
     * @option boolDisplay optionally enable or not the display
     * @return an object with a publicKey
     * @example
     * eth.getEIP1024PublicEncryptionKey("44'/60'/0'/0/0").then(o => o.publicKey)
     */
    getEIP1024PublicEncryptionKey(path, boolDisplay) {
      const paths = splitPath(path);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4);
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      return this.transport.send(224, 24, boolDisplay ? 1 : 0, 0, buffer).then((response) => {
        return {
          publicKey: response.slice(0, -2).toString("hex")
        };
      });
    }
    /**
     * get a shared secret on Curve25519 according to EIP 1024
     * @param path a path in BIP 32 format
     * @param remotePublicKeyHex remote Curve25519 public key
     * @option boolDisplay optionally enable or not the display
     * @return an object with a shared secret
     * @example
     * eth.getEIP1024SharedSecret("44'/60'/0'/0/0", "87020e80af6e07a6e4697f091eacadb9e7e6629cb7e5a8a371689a3ed53b3d64").then(o => o.sharedSecret)
     */
    getEIP1024SharedSecret(path, remotePublicKeyHex, boolDisplay) {
      const paths = splitPath(path);
      const remotePublicKey = hexBuffer(remotePublicKeyHex);
      const buffer = import_buffer.Buffer.alloc(1 + paths.length * 4 + 32);
      let offset = 0;
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      offset = 1 + 4 * paths.length;
      remotePublicKey.copy(buffer, offset);
      return this.transport.send(224, 24, boolDisplay ? 1 : 0, 1, buffer).then((response) => {
        return {
          sharedSecret: response.slice(0, -2).toString("hex")
        };
      });
    }
    /**
     * provides a trusted description of an ERC 20 token to associate a contract address with a ticker and number of decimals.
     *
     * @param data stringified buffer of ERC20 signature
     * @returns a boolean
     */
    provideERC20TokenInformation(data) {
      const buffer = import_buffer.Buffer.from(data, "hex");
      return this.transport.send(224, 10, 0, 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27904) {
          return false;
        }
        throw e;
      });
    }
    /**
     * provides the name of a trusted binding of a plugin with a contract address and a supported method selector. This plugin will be called to interpret contract data in the following transaction signing command.
     *
     * @param payload external plugin data
     * @option signature optionally signature for the plugin
     * @returns a boolean
     */
    setExternalPlugin(payload, signature2) {
      const payloadBuffer = import_buffer.Buffer.from(payload, "hex");
      const signatureBuffer = import_buffer.Buffer.from(signature2 ?? "", "hex");
      const buffer = import_buffer.Buffer.concat([payloadBuffer, signatureBuffer]);
      return this.transport.send(224, 18, 0, 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27264) {
          return false;
        } else if (e && e.statusCode === 27012) {
          return false;
        } else if (e && e.statusCode === 27904) {
          return false;
        }
        throw e;
      });
    }
    /**
     * provides the name of a trusted binding of a plugin with a contract address and a supported method selector. This plugin will be called to interpret contract data in the following transaction signing command.
     *
     * @param data stringified buffer of plugin signature
     * @returns a boolean
     */
    setPlugin(data) {
      const buffer = import_buffer.Buffer.from(data, "hex");
      return this.transport.send(224, 22, 0, 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27264) {
          return false;
        } else if (e && e.statusCode === 27012) {
          return false;
        } else if (e && e.statusCode === 27904) {
          return false;
        }
        throw e;
      });
    }
    /**
     *  provides a trusted description of an NFT to associate a contract address with a collectionName.
     *
     * @param data stringified buffer of the NFT description
     * @returns a boolean
     */
    provideNFTInformation(data) {
      const buffer = import_buffer.Buffer.from(data, "hex");
      return this.transport.send(224, 20, 0, 0, buffer).then(() => true, (e) => {
        if (e && e.statusCode === 27904) {
          throw new EthAppNftNotSupported();
        }
        throw e;
      });
    }
    /**
     * provides a domain name (like ENS) to be displayed during transactions in place of the address it is associated to. It shall be run just before a transaction involving the associated address that would be displayed on the device.
     *
     * @param data an stringied buffer of some TLV encoded data to represent the domain
     * @returns a boolean
     */
    async provideDomainName(data) {
      let APDU_FIELDS;
      (function(APDU_FIELDS2) {
        APDU_FIELDS2[APDU_FIELDS2["CLA"] = 224] = "CLA";
        APDU_FIELDS2[APDU_FIELDS2["INS"] = 34] = "INS";
        APDU_FIELDS2[APDU_FIELDS2["P1_FIRST_CHUNK"] = 1] = "P1_FIRST_CHUNK";
        APDU_FIELDS2[APDU_FIELDS2["P1_FOLLOWING_CHUNK"] = 0] = "P1_FOLLOWING_CHUNK";
        APDU_FIELDS2[APDU_FIELDS2["P2"] = 0] = "P2";
      })(APDU_FIELDS || (APDU_FIELDS = {}));
      const buffer = import_buffer.Buffer.from(data, "hex");
      const payload = import_buffer.Buffer.concat([import_buffer.Buffer.from(intAsHexBytes(buffer.length, 2), "hex"), buffer]);
      const bufferChunks = new Array(Math.ceil(payload.length / 256)).fill(null).map((_, i) => payload.slice(i * 255, (i + 1) * 255));
      for (const chunk of bufferChunks) {
        const isFirstChunk = chunk === bufferChunks[0];
        await this.transport.send(APDU_FIELDS.CLA, APDU_FIELDS.INS, isFirstChunk ? APDU_FIELDS.P1_FIRST_CHUNK : APDU_FIELDS.P1_FOLLOWING_CHUNK, APDU_FIELDS.P2, chunk);
      }
      return true;
    }
  };

  // entry.js
  async function tryOpenDevice(device) {
    if (!device) return null;
    try {
      if (device.opened) {
        try {
          await device.close();
        } catch (_) {
        }
      }
      return await TransportWebHID.open(device);
    } catch (_) {
      return null;
    }
  }
  async function requestAndOpenLedgerDevice() {
    const hid = navigator && navigator.hid;
    if (!hid || typeof hid.requestDevice !== "function") {
      throw new Error("WebHID unavailable");
    }
    const devices2 = await hid.requestDevice({
      filters: [{ vendorId: 11415 }]
    });
    const list = Array.isArray(devices2) ? devices2 : devices2 ? [devices2] : [];
    const device = list.find((d) => d && d.vendorId === 11415) || list[0] || null;
    if (!device) throw new Error("No device selected");
    const opened = await tryOpenDevice(device);
    if (opened) return opened;
    if (device.opened) {
      try {
        await device.close();
      } catch (_) {
      }
    }
    return await TransportWebHID.open(device);
  }
  async function createTransport(opts) {
    const silent = !!(opts && opts.silent);
    try {
      const listed = typeof TransportWebHID.list === "function" ? await TransportWebHID.list() : [];
      for (let i = 0; i < (listed || []).length; i++) {
        const opened = await tryOpenDevice(listed[i]);
        if (opened) return opened;
      }
    } catch (_) {
    }
    if (silent) {
      throw new Error(
        "Ledger not ready \u2014 open Gladiator \u2192 Accounts \u2192 Connect Ledger once (USB), open the Ethereum app, then retry"
      );
    }
    try {
      return await requestAndOpenLedgerDevice();
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (/denied|cancel|No device selected|Access denied|WebHID unavailable/i.test(msg)) {
        throw err;
      }
    }
    return await TransportWebHID.create();
  }
  async function withEthApp(fn, opts) {
    const transport = await createTransport(opts);
    try {
      const app = new Eth(transport);
      return await fn(app, transport);
    } finally {
      try {
        await transport.close();
      } catch (_) {
      }
    }
  }
  function pathForIndex(accountIndex) {
    const i = Math.max(0, Number(accountIndex) || 0);
    return "44'/60'/0'/0/" + i;
  }
  async function getAddress2(accountIndex, display) {
    const path = pathForIndex(accountIndex);
    return withEthApp(async (app) => {
      const r = await app.getAddress(path, !!display, false);
      const address = String(r && r.address || "");
      if (!address) throw new Error("Ledger returned no Ethereum address");
      return {
        path,
        address: address.startsWith("0x") ? address : "0x" + address,
        publicKey: r && r.publicKey ? String(r.publicKey) : ""
      };
    });
  }
  async function signTransaction(accountIndex, rawTxHex) {
    const path = pathForIndex(accountIndex);
    let hex = String(rawTxHex || "").replace(/^0x/i, "");
    if (!hex) throw new Error("Empty transaction hex");
    return withEthApp(async (app) => {
      const r = await app.signTransaction(path, hex, null);
      return {
        path,
        v: String(r.v),
        r: String(r.r).startsWith("0x") ? String(r.r) : "0x" + String(r.r),
        s: String(r.s).startsWith("0x") ? String(r.s) : "0x" + String(r.s)
      };
    }, { silent: true });
  }
  async function signPersonalMessage(accountIndex, messageHex) {
    const path = pathForIndex(accountIndex);
    let hex = String(messageHex || "").replace(/^0x/i, "");
    return withEthApp(async (app) => {
      const r = await app.signPersonalMessage(path, hex);
      return {
        path,
        v: Number(r.v),
        r: String(r.r).startsWith("0x") ? String(r.r) : "0x" + String(r.r),
        s: String(r.s).startsWith("0x") ? String(r.s) : "0x" + String(r.s)
      };
    }, { silent: true });
  }
  async function signEIP712Message2(accountIndex, typedData) {
    const path = pathForIndex(accountIndex);
    let data = typedData;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (_) {
        throw new Error("Invalid typed data JSON");
      }
    }
    if (!data || typeof data !== "object") throw new Error("Missing typed data");
    return withEthApp(async (app) => {
      const r = await app.signEIP712Message(path, data);
      return {
        path,
        v: Number(r.v),
        r: String(r.r).startsWith("0x") ? String(r.r) : "0x" + String(r.r),
        s: String(r.s).startsWith("0x") ? String(r.s) : "0x" + String(r.s)
      };
    }, { silent: true });
  }
  async function isSupported3() {
    try {
      return !!(navigator && navigator.hid && typeof navigator.hid.requestDevice === "function");
    } catch (_) {
      return false;
    }
  }
  var api = {
    pathForIndex,
    getAddress: getAddress2,
    signTransaction,
    signPersonalMessage,
    signEIP712Message: signEIP712Message2,
    isSupported: isSupported3,
    createTransport,
    TransportWebHID
  };
  if (typeof globalThis !== "undefined") globalThis.GladiatorLedgerEth = api;
  if (typeof window !== "undefined") window.GladiatorLedgerEth = api;
  var entry_default = api;
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

js-sha3/src/sha3.js:
  (**
   * [js-sha3]{@link https://github.com/emn178/js-sha3}
   *
   * @version 0.8.0
   * @author Chen, Yi-Cyuan [emn178@gmail.com]
   * @copyright Chen, Yi-Cyuan 2015-2018
   * @license MIT
   *)
*/
