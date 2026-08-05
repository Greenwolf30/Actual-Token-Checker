(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
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

  // node_modules/events/events.js
  var require_events = __commonJS({
    "node_modules/events/events.js"(exports, module) {
      "use strict";
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
          var key;
          for (i = 0; i < keys.length; ++i) {
            key = keys[i];
            if (key === "removeListener") continue;
            this.removeAllListeners(key);
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
      var SEMVER_SPEC_VERSION = "2.0.0";
      var MAX_LENGTH = 256;
      var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
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
        MAX_SAFE_INTEGER,
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
      var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
      };
      module.exports = debug;
    }
  });

  // node_modules/semver/internal/re.js
  var require_re = __commonJS({
    "node_modules/semver/internal/re.js"(exports, module) {
      "use strict";
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
      var debug = require_debug();
      var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
      var { safeRe: re, t } = require_re();
      var parseOptions = require_parse_options();
      var { compareIdentifiers } = require_identifiers();
      var SemVer = class _SemVer {
        constructor(version, options) {
          options = parseOptions(options);
          if (version instanceof _SemVer) {
            if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
              return version;
            } else {
              version = version.version;
            }
          } else if (typeof version !== "string") {
            throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
          }
          if (version.length > MAX_LENGTH) {
            throw new TypeError(
              `version is longer than ${MAX_LENGTH} characters`
            );
          }
          debug("SemVer", version, options);
          this.options = options;
          this.loose = !!options.loose;
          this.includePrerelease = !!options.includePrerelease;
          const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
          if (!m) {
            throw new TypeError(`Invalid Version: ${version}`);
          }
          this.raw = version;
          this.major = +m[1];
          this.minor = +m[2];
          this.patch = +m[3];
          if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
            throw new TypeError("Invalid major version");
          }
          if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
            throw new TypeError("Invalid minor version");
          }
          if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
            throw new TypeError("Invalid patch version");
          }
          if (!m[4]) {
            this.prerelease = [];
          } else {
            this.prerelease = m[4].split(".").map((id2) => {
              if (/^[0-9]+$/.test(id2)) {
                const num = +id2;
                if (num >= 0 && num < MAX_SAFE_INTEGER) {
                  return num;
                }
              }
              return id2;
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
              const base = Number(identifierBase) ? 1 : 0;
              if (this.prerelease.length === 0) {
                this.prerelease = [base];
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
                  this.prerelease.push(base);
                }
              }
              if (identifier) {
                let prerelease = [identifier, base];
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
      var SemVer = require_semver();
      var parse = (version, options, throwErrors = false) => {
        if (version instanceof SemVer) {
          return version;
        }
        try {
          return new SemVer(version, options);
        } catch (er) {
          if (!throwErrors) {
            return null;
          }
          throw er;
        }
      };
      module.exports = parse;
    }
  });

  // node_modules/semver/functions/valid.js
  var require_valid = __commonJS({
    "node_modules/semver/functions/valid.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var valid = (version, options) => {
        const v = parse(version, options);
        return v ? v.version : null;
      };
      module.exports = valid;
    }
  });

  // node_modules/semver/functions/clean.js
  var require_clean = __commonJS({
    "node_modules/semver/functions/clean.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var clean = (version, options) => {
        const s = parse(version.trim().replace(/^[=v]+/, ""), options);
        return s ? s.version : null;
      };
      module.exports = clean;
    }
  });

  // node_modules/semver/functions/inc.js
  var require_inc = __commonJS({
    "node_modules/semver/functions/inc.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var inc = (version, release, options, identifier, identifierBase) => {
        if (typeof options === "string") {
          identifierBase = identifier;
          identifier = options;
          options = void 0;
        }
        try {
          return new SemVer(
            version instanceof SemVer ? version.version : version,
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
      var parse = require_parse();
      var diff = (version1, version2) => {
        const v1 = parse(version1, null, true);
        const v2 = parse(version2, null, true);
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
      var SemVer = require_semver();
      var major = (a, loose) => new SemVer(a, loose).major;
      module.exports = major;
    }
  });

  // node_modules/semver/functions/minor.js
  var require_minor = __commonJS({
    "node_modules/semver/functions/minor.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var minor = (a, loose) => new SemVer(a, loose).minor;
      module.exports = minor;
    }
  });

  // node_modules/semver/functions/patch.js
  var require_patch = __commonJS({
    "node_modules/semver/functions/patch.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var patch = (a, loose) => new SemVer(a, loose).patch;
      module.exports = patch;
    }
  });

  // node_modules/semver/functions/prerelease.js
  var require_prerelease = __commonJS({
    "node_modules/semver/functions/prerelease.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var prerelease = (version, options) => {
        const parsed = parse(version, options);
        return parsed && parsed.prerelease.length ? parsed.prerelease : null;
      };
      module.exports = prerelease;
    }
  });

  // node_modules/semver/functions/compare.js
  var require_compare = __commonJS({
    "node_modules/semver/functions/compare.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
      module.exports = compare;
    }
  });

  // node_modules/semver/functions/rcompare.js
  var require_rcompare = __commonJS({
    "node_modules/semver/functions/rcompare.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var rcompare = (a, b, loose) => compare(b, a, loose);
      module.exports = rcompare;
    }
  });

  // node_modules/semver/functions/compare-loose.js
  var require_compare_loose = __commonJS({
    "node_modules/semver/functions/compare-loose.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var compareLoose = (a, b) => compare(a, b, true);
      module.exports = compareLoose;
    }
  });

  // node_modules/semver/functions/compare-build.js
  var require_compare_build = __commonJS({
    "node_modules/semver/functions/compare-build.js"(exports, module) {
      "use strict";
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
      var compareBuild = require_compare_build();
      var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
      module.exports = sort;
    }
  });

  // node_modules/semver/functions/rsort.js
  var require_rsort = __commonJS({
    "node_modules/semver/functions/rsort.js"(exports, module) {
      "use strict";
      var compareBuild = require_compare_build();
      var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
      module.exports = rsort;
    }
  });

  // node_modules/semver/functions/gt.js
  var require_gt = __commonJS({
    "node_modules/semver/functions/gt.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var gt = (a, b, loose) => compare(a, b, loose) > 0;
      module.exports = gt;
    }
  });

  // node_modules/semver/functions/lt.js
  var require_lt = __commonJS({
    "node_modules/semver/functions/lt.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var lt = (a, b, loose) => compare(a, b, loose) < 0;
      module.exports = lt;
    }
  });

  // node_modules/semver/functions/eq.js
  var require_eq = __commonJS({
    "node_modules/semver/functions/eq.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var eq = (a, b, loose) => compare(a, b, loose) === 0;
      module.exports = eq;
    }
  });

  // node_modules/semver/functions/neq.js
  var require_neq = __commonJS({
    "node_modules/semver/functions/neq.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var neq = (a, b, loose) => compare(a, b, loose) !== 0;
      module.exports = neq;
    }
  });

  // node_modules/semver/functions/gte.js
  var require_gte = __commonJS({
    "node_modules/semver/functions/gte.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var gte = (a, b, loose) => compare(a, b, loose) >= 0;
      module.exports = gte;
    }
  });

  // node_modules/semver/functions/lte.js
  var require_lte = __commonJS({
    "node_modules/semver/functions/lte.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var lte = (a, b, loose) => compare(a, b, loose) <= 0;
      module.exports = lte;
    }
  });

  // node_modules/semver/functions/cmp.js
  var require_cmp = __commonJS({
    "node_modules/semver/functions/cmp.js"(exports, module) {
      "use strict";
      var eq = require_eq();
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
            return eq(a, b, loose);
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
      var SemVer = require_semver();
      var parse = require_parse();
      var { safeRe: re, t } = require_re();
      var coerce = (version, options) => {
        if (version instanceof SemVer) {
          return version;
        }
        if (typeof version === "number") {
          version = String(version);
        }
        if (typeof version !== "string") {
          return null;
        }
        options = options || {};
        let match = null;
        if (!options.rtl) {
          match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
        } else {
          const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
          let next;
          while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
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
        return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
      };
      module.exports = coerce;
    }
  });

  // node_modules/semver/internal/lrucache.js
  var require_lrucache = __commonJS({
    "node_modules/semver/internal/lrucache.js"(exports, module) {
      "use strict";
      var LRUCache = class {
        constructor() {
          this.max = 1e3;
          this.map = /* @__PURE__ */ new Map();
        }
        get(key) {
          const value = this.map.get(key);
          if (value === void 0) {
            return void 0;
          } else {
            this.map.delete(key);
            this.map.set(key, value);
            return value;
          }
        }
        delete(key) {
          return this.map.delete(key);
        }
        set(key, value) {
          const deleted = this.delete(key);
          if (!deleted && value !== void 0) {
            if (this.map.size >= this.max) {
              const firstKey = this.map.keys().next().value;
              this.delete(firstKey);
            }
            this.map.set(key, value);
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
        test(version) {
          if (!version) {
            return false;
          }
          if (typeof version === "string") {
            try {
              version = new SemVer(version, this.options);
            } catch (er) {
              return false;
            }
          }
          for (let i = 0; i < this.set.length; i++) {
            if (testSet(this.set[i], version, this.options)) {
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
      var isX = (id2) => !id2 || id2.toLowerCase() === "x" || id2 === "*";
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
      var testSet = (set, version, options) => {
        for (let i = 0; i < set.length; i++) {
          if (!set[i].test(version)) {
            return false;
          }
        }
        if (version.prerelease.length && !options.includePrerelease) {
          for (let i = 0; i < set.length; i++) {
            debug(set[i].semver);
            if (set[i].semver === Comparator.ANY) {
              continue;
            }
            if (set[i].semver.prerelease.length > 0) {
              const allowed = set[i].semver;
              if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
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
        test(version) {
          debug("Comparator.test", version, this.options.loose);
          if (this.semver === ANY || version === ANY) {
            return true;
          }
          if (typeof version === "string") {
            try {
              version = new SemVer(version, this.options);
            } catch (er) {
              return false;
            }
          }
          return cmp(version, this.operator, this.semver, this.options);
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
      var Range = require_range();
      var satisfies = (version, range, options) => {
        try {
          range = new Range(range, options);
        } catch (er) {
          return false;
        }
        return range.test(version);
      };
      module.exports = satisfies;
    }
  });

  // node_modules/semver/ranges/to-comparators.js
  var require_to_comparators = __commonJS({
    "node_modules/semver/ranges/to-comparators.js"(exports, module) {
      "use strict";
      var Range = require_range();
      var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
      module.exports = toComparators;
    }
  });

  // node_modules/semver/ranges/max-satisfying.js
  var require_max_satisfying = __commonJS({
    "node_modules/semver/ranges/max-satisfying.js"(exports, module) {
      "use strict";
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
      var SemVer = require_semver();
      var Comparator = require_comparator();
      var { ANY } = Comparator;
      var Range = require_range();
      var satisfies = require_satisfies();
      var gt = require_gt();
      var lt = require_lt();
      var lte = require_lte();
      var gte = require_gte();
      var outside = (version, range, hilo, options) => {
        version = new SemVer(version, options);
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
        if (satisfies(version, range, options)) {
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
          if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
            return false;
          } else if (low.operator === ecomp && ltfn(version, low.semver)) {
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
      var outside = require_outside();
      var gtr = (version, range, options) => outside(version, range, ">", options);
      module.exports = gtr;
    }
  });

  // node_modules/semver/ranges/ltr.js
  var require_ltr = __commonJS({
    "node_modules/semver/ranges/ltr.js"(exports, module) {
      "use strict";
      var outside = require_outside();
      var ltr = (version, range, options) => outside(version, range, "<", options);
      module.exports = ltr;
    }
  });

  // node_modules/semver/ranges/intersects.js
  var require_intersects = __commonJS({
    "node_modules/semver/ranges/intersects.js"(exports, module) {
      "use strict";
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
      var satisfies = require_satisfies();
      var compare = require_compare();
      module.exports = (versions, range, options) => {
        const set = [];
        let first = null;
        let prev = null;
        const v = versions.sort((a, b) => compare(a, b, options));
        for (const version of v) {
          const included = satisfies(version, range, options);
          if (included) {
            prev = version;
            if (!first) {
              first = version;
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
      var Range = require_range();
      var Comparator = require_comparator();
      var { ANY } = Comparator;
      var satisfies = require_satisfies();
      var compare = require_compare();
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
          gtltComp = compare(gt.semver, lt.semver, options);
          if (gtltComp > 0) {
            return null;
          } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
            return null;
          }
        }
        for (const eq of eqSet) {
          if (gt && !satisfies(eq, String(gt), options)) {
            return null;
          }
          if (lt && !satisfies(eq, String(lt), options)) {
            return null;
          }
          for (const c of dom) {
            if (!satisfies(eq, String(c), options)) {
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
        const comp = compare(a.semver, b.semver, options);
        return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
      };
      var lowerLT = (a, b, options) => {
        if (!a) {
          return b;
        }
        const comp = compare(a.semver, b.semver, options);
        return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
      };
      module.exports = subset;
    }
  });

  // node_modules/semver/index.js
  var require_semver2 = __commonJS({
    "node_modules/semver/index.js"(exports, module) {
      "use strict";
      var internalRe = require_re();
      var constants = require_constants();
      var SemVer = require_semver();
      var identifiers = require_identifiers();
      var parse = require_parse();
      var valid = require_valid();
      var clean = require_clean();
      var inc = require_inc();
      var diff = require_diff();
      var major = require_major();
      var minor = require_minor();
      var patch = require_patch();
      var prerelease = require_prerelease();
      var compare = require_compare();
      var rcompare = require_rcompare();
      var compareLoose = require_compare_loose();
      var compareBuild = require_compare_build();
      var sort = require_sort();
      var rsort = require_rsort();
      var gt = require_gt();
      var lt = require_lt();
      var eq = require_eq();
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
        parse,
        valid,
        clean,
        inc,
        diff,
        major,
        minor,
        patch,
        prerelease,
        compare,
        rcompare,
        compareLoose,
        compareBuild,
        sort,
        rsort,
        gt,
        lt,
        eq,
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

  // node_modules/bip32-path/index.js
  var require_bip32_path = __commonJS({
    "node_modules/bip32-path/index.js"(exports, module) {
      var HARDENED = 2147483648;
      var BIPPath2 = function(path) {
        if (!Array.isArray(path)) {
          throw new Error("Input must be an Array");
        }
        if (path.length === 0) {
          throw new Error("Path must contain at least one level");
        }
        for (var i = 0; i < path.length; i++) {
          if (typeof path[i] !== "number") {
            throw new Error("Path element is not a number");
          }
        }
        this.path = path;
      };
      BIPPath2.validatePathArray = function(path) {
        try {
          BIPPath2.fromPathArray(path);
          return true;
        } catch (e) {
          return false;
        }
      };
      BIPPath2.validateString = function(text, reqRoot) {
        try {
          BIPPath2.fromString(text, reqRoot);
          return true;
        } catch (e) {
          return false;
        }
      };
      BIPPath2.fromPathArray = function(path) {
        return new BIPPath2(path);
      };
      BIPPath2.fromString = function(text, reqRoot) {
        if (/^m\//i.test(text)) {
          text = text.slice(2);
        } else if (reqRoot) {
          throw new Error("Root element is required");
        }
        var path = text.split("/");
        var ret = new Array(path.length);
        for (var i = 0; i < path.length; i++) {
          var tmp = /(\d+)([hH\']?)/.exec(path[i]);
          if (tmp === null) {
            throw new Error("Invalid input");
          }
          ret[i] = parseInt(tmp[1], 10);
          if (ret[i] >= HARDENED) {
            throw new Error("Invalid child index");
          }
          if (tmp[2] === "h" || tmp[2] === "H" || tmp[2] === "'") {
            ret[i] += HARDENED;
          } else if (tmp[2].length != 0) {
            throw new Error("Invalid modifier");
          }
        }
        return new BIPPath2(ret);
      };
      BIPPath2.prototype.toPathArray = function() {
        return this.path;
      };
      BIPPath2.prototype.toString = function(noRoot, oldStyle) {
        var ret = new Array(this.path.length);
        for (var i = 0; i < this.path.length; i++) {
          var tmp = this.path[i];
          if (tmp & HARDENED) {
            ret[i] = (tmp & ~HARDENED) + (oldStyle ? "h" : "'");
          } else {
            ret[i] = tmp;
          }
        }
        return (noRoot ? "" : "m/") + ret.join("/");
      };
      BIPPath2.prototype.inspect = function() {
        return "BIPPath <" + this.toString() + ">";
      };
      module.exports = BIPPath2;
    }
  });

  // node_modules/base-x/src/index.js
  var require_src = __commonJS({
    "node_modules/base-x/src/index.js"(exports, module) {
      "use strict";
      function base(ALPHABET) {
        if (ALPHABET.length >= 255) {
          throw new TypeError("Alphabet too long");
        }
        var BASE_MAP = new Uint8Array(256);
        for (var j = 0; j < BASE_MAP.length; j++) {
          BASE_MAP[j] = 255;
        }
        for (var i = 0; i < ALPHABET.length; i++) {
          var x = ALPHABET.charAt(i);
          var xc = x.charCodeAt(0);
          if (BASE_MAP[xc] !== 255) {
            throw new TypeError(x + " is ambiguous");
          }
          BASE_MAP[xc] = i;
        }
        var BASE = ALPHABET.length;
        var LEADER = ALPHABET.charAt(0);
        var FACTOR = Math.log(BASE) / Math.log(256);
        var iFACTOR = Math.log(256) / Math.log(BASE);
        function encode(source) {
          if (source instanceof Uint8Array) {
          } else if (ArrayBuffer.isView(source)) {
            source = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
          } else if (Array.isArray(source)) {
            source = Uint8Array.from(source);
          }
          if (!(source instanceof Uint8Array)) {
            throw new TypeError("Expected Uint8Array");
          }
          if (source.length === 0) {
            return "";
          }
          var zeroes = 0;
          var length = 0;
          var pbegin = 0;
          var pend = source.length;
          while (pbegin !== pend && source[pbegin] === 0) {
            pbegin++;
            zeroes++;
          }
          var size = (pend - pbegin) * iFACTOR + 1 >>> 0;
          var b58 = new Uint8Array(size);
          while (pbegin !== pend) {
            var carry = source[pbegin];
            var i2 = 0;
            for (var it1 = size - 1; (carry !== 0 || i2 < length) && it1 !== -1; it1--, i2++) {
              carry += 256 * b58[it1] >>> 0;
              b58[it1] = carry % BASE >>> 0;
              carry = carry / BASE >>> 0;
            }
            if (carry !== 0) {
              throw new Error("Non-zero carry");
            }
            length = i2;
            pbegin++;
          }
          var it2 = size - length;
          while (it2 !== size && b58[it2] === 0) {
            it2++;
          }
          var str = LEADER.repeat(zeroes);
          for (; it2 < size; ++it2) {
            str += ALPHABET.charAt(b58[it2]);
          }
          return str;
        }
        function decodeUnsafe(source) {
          if (typeof source !== "string") {
            throw new TypeError("Expected String");
          }
          if (source.length === 0) {
            return new Uint8Array();
          }
          var psz = 0;
          var zeroes = 0;
          var length = 0;
          while (source[psz] === LEADER) {
            zeroes++;
            psz++;
          }
          var size = (source.length - psz) * FACTOR + 1 >>> 0;
          var b256 = new Uint8Array(size);
          while (source[psz]) {
            var charCode = source.charCodeAt(psz);
            if (charCode > 255) {
              return;
            }
            var carry = BASE_MAP[charCode];
            if (carry === 255) {
              return;
            }
            var i2 = 0;
            for (var it3 = size - 1; (carry !== 0 || i2 < length) && it3 !== -1; it3--, i2++) {
              carry += BASE * b256[it3] >>> 0;
              b256[it3] = carry % 256 >>> 0;
              carry = carry / 256 >>> 0;
            }
            if (carry !== 0) {
              throw new Error("Non-zero carry");
            }
            length = i2;
            psz++;
          }
          var it4 = size - length;
          while (it4 !== size && b256[it4] === 0) {
            it4++;
          }
          var vch = new Uint8Array(zeroes + (size - it4));
          var j2 = zeroes;
          while (it4 !== size) {
            vch[j2++] = b256[it4++];
          }
          return vch;
        }
        function decode(string) {
          var buffer = decodeUnsafe(string);
          if (buffer) {
            return buffer;
          }
          throw new Error("Non-base" + BASE + " character");
        }
        return {
          encode,
          decodeUnsafe,
          decode
        };
      }
      module.exports = base;
    }
  });

  // node_modules/bs58/index.js
  var require_bs58 = __commonJS({
    "node_modules/bs58/index.js"(exports, module) {
      var basex = require_src();
      var ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      module.exports = basex(ALPHABET);
    }
  });

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/hw-transport/lib-es/Transport.js
  var import_events = __toESM(require_events());

  // node_modules/@ledgerhq/hw-transport-webhid/node_modules/@ledgerhq/errors/lib-es/helpers.js
  var errorClasses = {};
  var deserializers = {};
  var addCustomErrorDeserializer = (name, deserializer) => {
    deserializers[name] = deserializer;
  };
  var createCustomErrorClass = (name) => {
    class CustomErrorClass extends Error {
      cause;
      constructor(message, fields, options) {
        super(message || name, options);
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
  (function(HwTransportErrorType3) {
    HwTransportErrorType3["Unknown"] = "Unknown";
    HwTransportErrorType3["LocationServicesDisabled"] = "LocationServicesDisabled";
    HwTransportErrorType3["LocationServicesUnauthorized"] = "LocationServicesUnauthorized";
    HwTransportErrorType3["BluetoothScanStartFailed"] = "BluetoothScanStartFailed";
  })(HwTransportErrorType || (HwTransportErrorType = {}));
  var TransportError = class extends Error {
    id;
    constructor(message, id2) {
      const name = "TransportError";
      super(message || name);
      this.name = name;
      this.message = message;
      this.stack = new Error(message).stack;
      this.id = id2;
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
    statusCode;
    statusText;
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
    type;
    context;
    constructor(type, context) {
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
    exchangeTimeout = 3e4;
    unresponsiveTimeout = 15e3;
    deviceModel = null;
    tracer;
    constructor({ context, logType } = {}) {
      this.tracer = new LocalTracer(logType ?? DEFAULT_LOG_TYPE, context);
    }
    /**
     * Check if the transport is supported on the current platform/browser.
     * @returns {Promise<boolean>} A promise that resolves with a boolean indicating support.
     */
    static isSupported;
    /**
     * List all available descriptors for the transport.
     * For a better granularity, checkout `listen()`.
     *
     * @returns {Promise<Array<any>>} A promise that resolves with an array of descriptors.
     * @example
     * TransportFoo.list().then(descriptors => ...)
     */
    static list;
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
    static listen;
    /**
     * Attempt to create a Transport instance with a specific descriptor.
     * @param {any} descriptor - The descriptor to open the transport with.
     * @param {number} timeout - An optional timeout for the transport connection.
     * @param {TraceContext} context Optional tracing/log context
     * @returns {Promise<Transport>} A promise that resolves with a Transport instance.
     * @example
    TransportFoo.open(descriptor).then(transport => ...)
     */
    static open;
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
    _events = new import_events.default();
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
    send = async (cla, ins, p1, p2, data = Buffer.alloc(0), statusList = [StatusCodes.OK], { abortTimeoutMs } = {}) => {
      const tracer = this.tracer.withUpdatedContext({ function: "send" });
      if (data.length >= 256) {
        tracer.trace("data.length exceeded 256 bytes limit", { dataLength: data.length });
        throw new TransportError("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");
      }
      const response = await this.exchange(
        // The size of the data is added in 1 byte just before `data`
        Buffer.concat([Buffer.from([cla, ins, p1, p2]), Buffer.from([data.length]), data]),
        { abortTimeoutMs }
      );
      const sw = response.readUInt16BE(response.length - 2);
      if (!statusList.some((s) => s === sw)) {
        throw new TransportStatusError(sw);
      }
      return response;
    };
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
    // Blocks other exchange to happen concurrently
    exchangeBusyPromise;
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
    decorateAppAPIMethods(self, methods, scrambleKey) {
      for (const methodName of methods) {
        self[methodName] = this.decorateAppAPIMethod(methodName, self[methodName], self, scrambleKey);
      }
    }
    _appAPIlock = null;
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
    static ErrorMessage_ListenTimeout = "No Ledger device found (timeout)";
    static ErrorMessage_NoDeviceFound = "No Ledger device found";
  };

  // node_modules/@ledgerhq/hw-transport-webhid/lib-es/hid-framing.js
  var Tag = 5;
  function asUInt16BE(value) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(value, 0);
    return b;
  }
  var initialAcc = {
    data: Buffer.alloc(0),
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
        let data = Buffer.concat([asUInt16BE(apdu.length), apdu]);
        const blockSize = packetSize - 5;
        const nbBlocks = Math.ceil(data.length / blockSize);
        data = Buffer.concat([data, Buffer.alloc(nbBlocks * blockSize - data.length + 1).fill(0)]);
        const blocks = [];
        for (let i = 0; i < nbBlocks; i++) {
          const head = Buffer.alloc(5);
          head.writeUInt16BE(channel, 0);
          head.writeUInt8(Tag, 2);
          head.writeUInt16BE(i, 3);
          const chunk = data.slice(i * blockSize, (i + 1) * blockSize);
          blocks.push(new Uint8Array(Buffer.concat([head, chunk])));
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
        data = Buffer.concat([data, chunkData]);
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
  for (const id2 in devices) {
    const deviceModel = devices[id2];
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
  var TransportWebHID = class _TransportWebHID extends Transport {
    device;
    deviceModel;
    channel = Math.floor(Math.random() * 65535);
    packetSize = 64;
    constructor(device) {
      super();
      this.device = device;
      this.deviceModel = typeof device.productId === "number" ? identifyUSBProductId(device.productId) : void 0;
      device.addEventListener("inputreport", this.onInputReport);
    }
    inputs = [];
    inputCallback;
    read = () => {
      if (this.inputs.length) {
        const value = this.inputs.shift();
        if (value !== void 0)
          return Promise.resolve(value);
        throw new Error("Unreachable: non-empty inputs");
      }
      return new Promise((success) => {
        this.inputCallback = success;
      });
    };
    onInputReport = (e) => {
      const buffer = Buffer.from(e.data.buffer);
      if (this.inputCallback) {
        this.inputCallback(buffer);
        this.inputCallback = null;
      } else {
        this.inputs.push(buffer);
      }
    };
    /**
     * Check if WebUSB transport is supported.
     */
    static isSupported = isSupported;
    /**
     * List the WebUSB devices that was previously authorized by the user.
     */
    static list = getLedgerDevices;
    /**
     * Actively listen to WebUSB devices and emit ONE device
     * that was either accepted before, if not it will trigger the native permission UI.
     *
     * Important: it must be called in the context of a UI click!
     */
    static listen = (observer) => {
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
    };
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
    _disconnectEmitted = false;
    _emitDisconnect = (e) => {
      if (this._disconnectEmitted)
        return;
      this._disconnectEmitted = true;
      this.emit("disconnect", e);
    };
    /**
     * Release the transport device
     */
    async close() {
      await this.exchangeBusyPromise;
      this.device.removeEventListener("inputreport", this.onInputReport);
      await this.device.close();
    }
    /**
     * Exchange with the device using APDU protocol.
     * @param apdu
     * @returns a promise of apdu response
     */
    exchange = async (apdu) => {
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
    };
    setScrambleKey() {
    }
  };

  // node_modules/@ledgerhq/errors/lib-es/helpers.js
  var errorClasses2 = {};
  var deserializers2 = {};
  var addCustomErrorDeserializer2 = (name, deserializer) => {
    deserializers2[name] = deserializer;
  };
  var createCustomErrorClass2 = (name) => {
    class CustomErrorClass extends Error {
      cause;
      constructor(message, fields, options) {
        super(message || name, options);
        Object.setPrototypeOf(this, CustomErrorClass.prototype);
        this.name = name;
        if (fields) {
          for (const k in fields) {
            this[k] = fields[k];
          }
        }
        if (options && isObject2(options) && "cause" in options && !this.cause) {
          const cause = options.cause;
          this.cause = cause;
          if ("stack" in cause) {
            this.stack = this.stack + "\nCAUSE: " + cause.stack;
          }
        }
      }
    }
    errorClasses2[name] = CustomErrorClass;
    return CustomErrorClass;
  };
  function isObject2(value) {
    return typeof value === "object";
  }

  // node_modules/@ledgerhq/errors/lib-es/index.js
  var AccountNameRequiredError2 = createCustomErrorClass2("AccountNameRequired");
  var AccountNotSupported2 = createCustomErrorClass2("AccountNotSupported");
  var AccountAwaitingSendPendingOperations2 = createCustomErrorClass2("AccountAwaitingSendPendingOperations");
  var AmountRequired2 = createCustomErrorClass2("AmountRequired");
  var BluetoothRequired2 = createCustomErrorClass2("BluetoothRequired");
  var BtcUnmatchedApp2 = createCustomErrorClass2("BtcUnmatchedApp");
  var CantOpenDevice2 = createCustomErrorClass2("CantOpenDevice");
  var CashAddrNotSupported2 = createCustomErrorClass2("CashAddrNotSupported");
  var ClaimRewardsFeesWarning2 = createCustomErrorClass2("ClaimRewardsFeesWarning");
  var CurrencyNotSupported2 = createCustomErrorClass2("CurrencyNotSupported");
  var DeviceAppVerifyNotSupported2 = createCustomErrorClass2("DeviceAppVerifyNotSupported");
  var DeviceGenuineSocketEarlyClose2 = createCustomErrorClass2("DeviceGenuineSocketEarlyClose");
  var DeviceNotGenuineError2 = createCustomErrorClass2("DeviceNotGenuine");
  var DeviceOnDashboardExpected2 = createCustomErrorClass2("DeviceOnDashboardExpected");
  var DeviceOnDashboardUnexpected2 = createCustomErrorClass2("DeviceOnDashboardUnexpected");
  var DeviceInOSUExpected2 = createCustomErrorClass2("DeviceInOSUExpected");
  var DeviceHalted2 = createCustomErrorClass2("DeviceHalted");
  var DeviceNameInvalid2 = createCustomErrorClass2("DeviceNameInvalid");
  var DeviceSocketFail2 = createCustomErrorClass2("DeviceSocketFail");
  var DeviceSocketNoBulkStatus2 = createCustomErrorClass2("DeviceSocketNoBulkStatus");
  var DeviceNeedsRestart2 = createCustomErrorClass2("DeviceSocketNoBulkStatus");
  var UnresponsiveDeviceError2 = createCustomErrorClass2("UnresponsiveDeviceError");
  var DisconnectedDevice2 = createCustomErrorClass2("DisconnectedDevice");
  var DisconnectedDeviceDuringOperation2 = createCustomErrorClass2("DisconnectedDeviceDuringOperation");
  var DeviceExtractOnboardingStateError2 = createCustomErrorClass2("DeviceExtractOnboardingStateError");
  var DeviceOnboardingStatePollingError2 = createCustomErrorClass2("DeviceOnboardingStatePollingError");
  var EnpointConfigError2 = createCustomErrorClass2("EnpointConfig");
  var EthAppPleaseEnableContractData2 = createCustomErrorClass2("EthAppPleaseEnableContractData");
  var SolAppPleaseEnableContractData2 = createCustomErrorClass2("SolAppPleaseEnableContractData");
  var CeloAppPleaseEnableContractData2 = createCustomErrorClass2("CeloAppPleaseEnableContractData");
  var FeeEstimationFailed2 = createCustomErrorClass2("FeeEstimationFailed");
  var FirmwareNotRecognized2 = createCustomErrorClass2("FirmwareNotRecognized");
  var HardResetFail2 = createCustomErrorClass2("HardResetFail");
  var InvalidXRPTag2 = createCustomErrorClass2("InvalidXRPTag");
  var InvalidAddress2 = createCustomErrorClass2("InvalidAddress");
  var InvalidTransactionError2 = createCustomErrorClass2("InvalidTransactionError");
  var InvalidNonce2 = createCustomErrorClass2("InvalidNonce");
  var InvalidAddressBecauseDestinationIsAlsoSource2 = createCustomErrorClass2("InvalidAddressBecauseDestinationIsAlsoSource");
  var LatestMCUInstalledError2 = createCustomErrorClass2("LatestMCUInstalledError");
  var LatestFirmwareVersionRequired2 = createCustomErrorClass2("LatestFirmwareVersionRequired");
  var UnsupportedFeatureError2 = createCustomErrorClass2("UnsupportedFeatureError");
  var NanoSNotSupported2 = createCustomErrorClass2("NanoSNotSupported");
  var UnknownMCU2 = createCustomErrorClass2("UnknownMCU");
  var LedgerAPIError2 = createCustomErrorClass2("LedgerAPIError");
  var LedgerAPIErrorWithMessage2 = createCustomErrorClass2("LedgerAPIErrorWithMessage");
  var LedgerAPINotAvailable2 = createCustomErrorClass2("LedgerAPINotAvailable");
  var ManagerAppAlreadyInstalledError2 = createCustomErrorClass2("ManagerAppAlreadyInstalled");
  var ManagerAppRelyOnBTCError2 = createCustomErrorClass2("ManagerAppRelyOnBTC");
  var ManagerAppDepInstallRequired2 = createCustomErrorClass2("ManagerAppDepInstallRequired");
  var ManagerAppDepUninstallRequired2 = createCustomErrorClass2("ManagerAppDepUninstallRequired");
  var ManagerDeviceLockedError2 = createCustomErrorClass2("ManagerDeviceLocked");
  var ManagerFirmwareNotEnoughSpaceError2 = createCustomErrorClass2("ManagerFirmwareNotEnoughSpace");
  var ManagerNotEnoughSpaceError2 = createCustomErrorClass2("ManagerNotEnoughSpace");
  var ManagerUninstallBTCDep2 = createCustomErrorClass2("ManagerUninstallBTCDep");
  var NetworkDown2 = createCustomErrorClass2("NetworkDown");
  var NetworkError2 = createCustomErrorClass2("NetworkError");
  var NoAddressesFound2 = createCustomErrorClass2("NoAddressesFound");
  var NotEnoughBalance2 = createCustomErrorClass2("NotEnoughBalance");
  var NotEnoughBalanceFees2 = createCustomErrorClass2("NotEnoughBalanceFees");
  var NotEnoughBalanceSwap2 = createCustomErrorClass2("NotEnoughBalanceSwap");
  var NotEnoughBalanceToDelegate2 = createCustomErrorClass2("NotEnoughBalanceToDelegate");
  var UnstakeNotEnoughStakedBalanceLeft2 = createCustomErrorClass2("UnstakeNotEnoughStakedBalanceLeft");
  var RestakeNotEnoughStakedBalanceLeft2 = createCustomErrorClass2("RestakeNotEnoughStakedBalanceLeft");
  var NotEnoughToRestake2 = createCustomErrorClass2("NotEnoughToRestake");
  var NotEnoughToUnstake2 = createCustomErrorClass2("NotEnoughToUnstake");
  var NotEnoughBalanceInParentAccount2 = createCustomErrorClass2("NotEnoughBalanceInParentAccount");
  var NotEnoughSpendableBalance2 = createCustomErrorClass2("NotEnoughSpendableBalance");
  var NotEnoughBalanceBecauseDestinationNotCreated2 = createCustomErrorClass2("NotEnoughBalanceBecauseDestinationNotCreated");
  var NotEnoughToStake2 = createCustomErrorClass2("NotEnoughToStake");
  var NoAccessToCamera2 = createCustomErrorClass2("NoAccessToCamera");
  var NotEnoughGas2 = createCustomErrorClass2("NotEnoughGas");
  var NotEnoughGasSwap2 = createCustomErrorClass2("NotEnoughGasSwap");
  var TronEmptyAccount2 = createCustomErrorClass2("TronEmptyAccount");
  var MaybeKeepTronAccountAlive2 = createCustomErrorClass2("MaybeKeepTronAccountAlive");
  var NotSupportedLegacyAddress2 = createCustomErrorClass2("NotSupportedLegacyAddress");
  var GasLessThanEstimate2 = createCustomErrorClass2("GasLessThanEstimate");
  var PriorityFeeTooLow2 = createCustomErrorClass2("PriorityFeeTooLow");
  var PriorityFeeTooHigh2 = createCustomErrorClass2("PriorityFeeTooHigh");
  var PriorityFeeHigherThanMaxFee2 = createCustomErrorClass2("PriorityFeeHigherThanMaxFee");
  var MaxFeeTooLow2 = createCustomErrorClass2("MaxFeeTooLow");
  var PasswordsDontMatchError2 = createCustomErrorClass2("PasswordsDontMatch");
  var PasswordIncorrectError2 = createCustomErrorClass2("PasswordIncorrect");
  var RecommendSubAccountsToEmpty2 = createCustomErrorClass2("RecommendSubAccountsToEmpty");
  var RecommendUndelegation2 = createCustomErrorClass2("RecommendUndelegation");
  var TimeoutTagged2 = createCustomErrorClass2("TimeoutTagged");
  var UnexpectedBootloader2 = createCustomErrorClass2("UnexpectedBootloader");
  var MCUNotGenuineToDashboard2 = createCustomErrorClass2("MCUNotGenuineToDashboard");
  var RecipientRequired2 = createCustomErrorClass2("RecipientRequired");
  var UnavailableTezosOriginatedAccountReceive2 = createCustomErrorClass2("UnavailableTezosOriginatedAccountReceive");
  var UnavailableTezosOriginatedAccountSend2 = createCustomErrorClass2("UnavailableTezosOriginatedAccountSend");
  var UpdateFetchFileFail2 = createCustomErrorClass2("UpdateFetchFileFail");
  var UpdateIncorrectHash2 = createCustomErrorClass2("UpdateIncorrectHash");
  var UpdateIncorrectSig2 = createCustomErrorClass2("UpdateIncorrectSig");
  var UpdateYourApp2 = createCustomErrorClass2("UpdateYourApp");
  var UserRefusedDeviceNameChange2 = createCustomErrorClass2("UserRefusedDeviceNameChange");
  var UserRefusedAddress2 = createCustomErrorClass2("UserRefusedAddress");
  var UserRefusedFirmwareUpdate2 = createCustomErrorClass2("UserRefusedFirmwareUpdate");
  var UserRefusedAllowManager2 = createCustomErrorClass2("UserRefusedAllowManager");
  var UserRefusedOnDevice2 = createCustomErrorClass2("UserRefusedOnDevice");
  var PinNotSet2 = createCustomErrorClass2("PinNotSet");
  var ExpertModeRequired2 = createCustomErrorClass2("ExpertModeRequired");
  var TransportOpenUserCancelled2 = createCustomErrorClass2("TransportOpenUserCancelled");
  var TransportInterfaceNotAvailable2 = createCustomErrorClass2("TransportInterfaceNotAvailable");
  var TransportRaceCondition2 = createCustomErrorClass2("TransportRaceCondition");
  var TransportWebUSBGestureRequired2 = createCustomErrorClass2("TransportWebUSBGestureRequired");
  var TransactionHasBeenValidatedError2 = createCustomErrorClass2("TransactionHasBeenValidatedError");
  var TransportExchangeTimeoutError2 = createCustomErrorClass2("TransportExchangeTimeoutError");
  var DeviceShouldStayInApp2 = createCustomErrorClass2("DeviceShouldStayInApp");
  var WebsocketConnectionError2 = createCustomErrorClass2("WebsocketConnectionError");
  var WebsocketConnectionFailed2 = createCustomErrorClass2("WebsocketConnectionFailed");
  var WrongDeviceForAccount2 = createCustomErrorClass2("WrongDeviceForAccount");
  var WrongDeviceForAccountPayout2 = createCustomErrorClass2("WrongDeviceForAccountPayout");
  var MissingSwapPayloadParamaters2 = createCustomErrorClass2("MissingSwapPayloadParamaters");
  var WrongDeviceForAccountRefund2 = createCustomErrorClass2("WrongDeviceForAccountRefund");
  var WrongAppForCurrency2 = createCustomErrorClass2("WrongAppForCurrency");
  var ETHAddressNonEIP2 = createCustomErrorClass2("ETHAddressNonEIP");
  var CantScanQRCode2 = createCustomErrorClass2("CantScanQRCode");
  var FeeNotLoaded2 = createCustomErrorClass2("FeeNotLoaded");
  var FeeNotLoadedSwap2 = createCustomErrorClass2("FeeNotLoadedSwap");
  var FeeRequired2 = createCustomErrorClass2("FeeRequired");
  var FeeTooHigh2 = createCustomErrorClass2("FeeTooHigh");
  var ValAddressRequired2 = createCustomErrorClass2("ValAddressRequired");
  var RedelegateDstValAddressRequired2 = createCustomErrorClass2("RedelegateDstValAddressRequired");
  var PendingOperation2 = createCustomErrorClass2("PendingOperation");
  var SyncError2 = createCustomErrorClass2("SyncError");
  var PairingFailed2 = createCustomErrorClass2("PairingFailed");
  var PeerRemovedPairing2 = createCustomErrorClass2("PeerRemovedPairing");
  var GenuineCheckFailed2 = createCustomErrorClass2("GenuineCheckFailed");
  var LedgerAPI4xx2 = createCustomErrorClass2("LedgerAPI4xx");
  var LedgerAPI5xx2 = createCustomErrorClass2("LedgerAPI5xx");
  var FirmwareOrAppUpdateRequired2 = createCustomErrorClass2("FirmwareOrAppUpdateRequired");
  var ReplacementTransactionUnderpriced2 = createCustomErrorClass2("ReplacementTransactionUnderpriced");
  var OpReturnDataSizeLimit2 = createCustomErrorClass2("OpReturnSizeLimit");
  var DustLimit2 = createCustomErrorClass2("DustLimit");
  var ConcordiumInsufficientFunds2 = createCustomErrorClass2("ConcordiumInsufficientFunds");
  var ConcordiumMemoTooLong2 = createCustomErrorClass2("ConcordiumMemoTooLong");
  var ConcordiumPairingExpiredError2 = createCustomErrorClass2("ConcordiumPairingExpiredError");
  var ConcordiumSessionExpiredError2 = createCustomErrorClass2("ConcordiumSessionExpiredError");
  var ConcordiumTrustedMetadataServiceError2 = createCustomErrorClass2("ConcordiumTrustedMetadataServiceError");
  var ConcordiumAddressVerificationFailedError2 = createCustomErrorClass2("ConcordiumAddressVerificationFailedError");
  var ConcordiumInvalidMaxFeeError2 = createCustomErrorClass2("ConcordiumInvalidMaxFeeError");
  var LanguageNotFound2 = createCustomErrorClass2("LanguageNotFound");
  var NoDBPathGiven2 = createCustomErrorClass2("NoDBPathGiven");
  var DBWrongPassword2 = createCustomErrorClass2("DBWrongPassword");
  var DBNotReset2 = createCustomErrorClass2("DBNotReset");
  var SequenceNumberError2 = createCustomErrorClass2("SequenceNumberError");
  var DisabledTransactionBroadcastError2 = createCustomErrorClass2("DisabledTransactionBroadcastError");
  var InvalidParameterError2 = createCustomErrorClass2("InvalidParameterError");
  var HwTransportErrorType2;
  (function(HwTransportErrorType3) {
    HwTransportErrorType3["Unknown"] = "Unknown";
    HwTransportErrorType3["LocationServicesDisabled"] = "LocationServicesDisabled";
    HwTransportErrorType3["LocationServicesUnauthorized"] = "LocationServicesUnauthorized";
    HwTransportErrorType3["BluetoothScanStartFailed"] = "BluetoothScanStartFailed";
  })(HwTransportErrorType2 || (HwTransportErrorType2 = {}));
  var TransportError2 = class extends Error {
    id;
    constructor(message, id2) {
      const name = "TransportError";
      super(message || name);
      this.name = name;
      this.message = message;
      this.stack = new Error(message).stack;
      this.id = id2;
    }
  };
  addCustomErrorDeserializer2("TransportError", (e) => new TransportError2(e.message, e.id));
  var StatusCodes2 = {
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
  function getAltStatusMessage2(code) {
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
  var TransportStatusError2 = class _TransportStatusError extends Error {
    statusCode;
    statusText;
    /**
     * @param statusCode The error status code coming from a Transport implementation
     * @param options containing:
     *  - canBeMappedToChildError: enable the mapping of TransportStatusError to an error extending/inheriting from it
     *  . Ex: LockedDeviceError. Default to true.
     */
    constructor(statusCode, { canBeMappedToChildError = true } = {}) {
      const statusText = Object.keys(StatusCodes2).find((k) => StatusCodes2[k] === statusCode) || "UNKNOWN_ERROR";
      const smsg = getAltStatusMessage2(statusCode) || statusText;
      const statusCodeStr = statusCode.toString(16);
      const message = `Ledger device: ${smsg} (0x${statusCodeStr})`;
      super(message);
      this.name = "TransportStatusError";
      this.statusCode = statusCode;
      this.statusText = statusText;
      Object.setPrototypeOf(this, _TransportStatusError.prototype);
      if (canBeMappedToChildError && statusCode === StatusCodes2.LOCKED_DEVICE) {
        return new LockedDeviceError2(message);
      }
    }
  };
  var LockedDeviceError2 = class _LockedDeviceError extends TransportStatusError2 {
    constructor(message) {
      super(StatusCodes2.LOCKED_DEVICE, { canBeMappedToChildError: false });
      if (message) {
        this.message = message;
      }
      this.name = "LockedDeviceError";
      Object.setPrototypeOf(this, _LockedDeviceError.prototype);
    }
  };
  addCustomErrorDeserializer2("TransportStatusError", (e) => new TransportStatusError2(e.statusCode));

  // node_modules/@ledgerhq/hw-app-solana/lib-es/Solana.js
  var import_bip32_path = __toESM(require_bip32_path());

  // node_modules/@ledgerhq/hw-app-solana/lib-es/descriptor.js
  function buildTLV(tag, value) {
    const length = value.length;
    if (length > 255) {
      throw new Error("Value length exceeds 255 bytes");
    }
    return Buffer.concat([tag, new Uint8Array([length]), value]);
  }
  function buildDescriptor({ data, signature }) {
    const SIGNATURE_TAG = Buffer.from(new Uint8Array([8]));
    return Buffer.concat([data, buildTLV(SIGNATURE_TAG, signature)]);
  }

  // node_modules/@ledgerhq/hw-app-solana/lib-es/Solana.js
  var P1_NON_CONFIRM = 0;
  var P1_CONFIRM = 1;
  var P2_INIT = 0;
  var P2_EXTEND = 1;
  var P2_MORE = 2;
  var P2_USER_INPUT_ATA = 8;
  var MAX_PAYLOAD = 255;
  var LEDGER_CLA = 224;
  var INS = {
    GET_VERSION: 4,
    GET_ADDR: 5,
    SIGN: 6,
    SIGN_OFFCHAIN: 7,
    GET_CHALLENGE: 32,
    PROVIDE_TRUSTED_NAME: 33,
    PROVIDE_TRUSTED_DYNAMIC_DESCRIPTOR: 34
  };
  var EXTRA_STATUS_CODES;
  (function(EXTRA_STATUS_CODES2) {
    EXTRA_STATUS_CODES2[EXTRA_STATUS_CODES2["BLIND_SIGNATURE_REQUIRED"] = 26632] = "BLIND_SIGNATURE_REQUIRED";
  })(EXTRA_STATUS_CODES || (EXTRA_STATUS_CODES = {}));
  var Solana = class {
    transport;
    constructor(transport, scrambleKey = "solana_default_scramble_key") {
      this.transport = transport;
      this.transport.decorateAppAPIMethods(this, [
        "getAddress",
        "signTransaction",
        "getAppConfiguration",
        "getChallenge",
        "provideTrustedName",
        "provideTrustedDynamicDescriptor"
      ], scrambleKey);
    }
    /**
     * Get Solana address (public key) for a BIP32 path.
     *
     * Because Solana uses Ed25519 keypairs, as per SLIP-0010
     * all derivation-path indexes will be promoted to hardened indexes.
     *
     * @param path a BIP32 path
     * @param display flag to show display
     * @returns an object with the address field
     *
     * @example
     * solana.getAddress("44'/501'/0'").then(r => r.address)
     */
    async getAddress(path, display = false) {
      const pathBuffer = this.pathToBuffer(path);
      const addressBuffer = await this.sendToDevice(INS.GET_ADDR, display ? P1_CONFIRM : P1_NON_CONFIRM, pathBuffer);
      return {
        address: addressBuffer
      };
    }
    /**
     * Provides trusted dynamic and signed coin metadata
     *
     * @param data An object containing the descriptor and its signature from the CAL
     */
    async provideTrustedDynamicDescriptor(data) {
      await this.sendToDevice(INS.PROVIDE_TRUSTED_DYNAMIC_DESCRIPTOR, P1_NON_CONFIRM, buildDescriptor(data));
      return true;
    }
    /**
     * Sign a Solana transaction.
     *
     * @param path a BIP32 path
     * @param txBuffer serialized transaction
     * @param userInputType optional user input type (ata or sol, for the case of token transfers)
     *
     * @returns an object with the signature field
     *
     * @example
     * solana.signTransaction("44'/501'/0'", txBuffer).then(r => r.signature)
     */
    async signTransaction(path, txBuffer, userInputType) {
      const pathBuffer = this.pathToBuffer(path);
      const pathsCountBuffer = Buffer.alloc(1);
      pathsCountBuffer.writeUInt8(1, 0);
      const payload = Buffer.concat([pathsCountBuffer, pathBuffer, txBuffer]);
      const p2Flag = userInputType === "ata" ? P2_USER_INPUT_ATA : void 0;
      const signatureBuffer = await this.sendToDevice(INS.SIGN, P1_CONFIRM, payload, p2Flag);
      return {
        signature: signatureBuffer
      };
    }
    /**
     * Sign a Solana off-chain message.
     *
     * @param path a BIP32 path
     * @param msgBuffer serialized off-chain message
     *
     * @returns an object with the signature field
     *
     * @example
     * solana.signOffchainMessage("44'/501'/0'", msgBuffer).then(r => r.signature)
     */
    async signOffchainMessage(path, msgBuffer) {
      const pathBuffer = this.pathToBuffer(path);
      const pathsCountBuffer = Buffer.alloc(1);
      pathsCountBuffer.writeUInt8(1, 0);
      const payload = Buffer.concat([pathsCountBuffer, pathBuffer, msgBuffer]);
      const signatureBuffer = await this.sendToDevice(INS.SIGN_OFFCHAIN, P1_CONFIRM, payload);
      return {
        signature: signatureBuffer
      };
    }
    /**
     * Get application configuration.
     *
     * @returns application config object
     *
     * @example
     * solana.getAppConfiguration().then(r => r.version)
     */
    async getAppConfiguration() {
      const [blindSigningEnabled, pubKeyDisplayMode, major, minor, patch] = await this.sendToDevice(INS.GET_VERSION, P1_NON_CONFIRM, Buffer.alloc(0));
      return {
        blindSigningEnabled: Boolean(blindSigningEnabled),
        pubKeyDisplayMode,
        version: `${major}.${minor}.${patch}`
      };
    }
    /**
     * Method returning a 4 bytes TLV challenge as an hex string
     *
     * @returns {Promise<string>}
     */
    async getChallenge() {
      return this.transport.send(LEDGER_CLA, INS.GET_CHALLENGE, P1_NON_CONFIRM, P2_INIT).then((res) => {
        const data = res.toString("hex");
        const fourBytesChallenge = data.slice(0, -4);
        const statusCode = data.slice(-4);
        if (statusCode !== "9000") {
          throw new Error(`An error happened while generating the challenge. Status code: ${statusCode}`);
        }
        return `0x${fourBytesChallenge}`;
      });
    }
    /**
     * Provides a trusted name to be displayed during transactions in place of the token address it is associated to. It shall be run just before a transaction involving the associated address that would be displayed on the device.
     *
     * @param data a stringified buffer of some TLV encoded data to represent the trusted name
     * @returns a boolean
     */
    async provideTrustedName(data) {
      await this.transport.send(LEDGER_CLA, INS.PROVIDE_TRUSTED_NAME, P1_NON_CONFIRM, P2_INIT, Buffer.from(data, "hex"));
      return true;
    }
    pathToBuffer(originalPath) {
      const path = originalPath.split("/").map((value) => value.endsWith("'") || value.endsWith("h") ? value : value + "'").join("/");
      const pathNums = import_bip32_path.default.fromString(path).toPathArray();
      return this.serializePath(pathNums);
    }
    serializePath(path) {
      const buf = Buffer.alloc(1 + path.length * 4);
      buf.writeUInt8(path.length, 0);
      for (const [i, num] of path.entries()) {
        buf.writeUInt32BE(num, 1 + i * 4);
      }
      return buf;
    }
    // send chunked if payload size exceeds maximum for a call
    async sendToDevice(instruction, p1, payload, p2 = P2_INIT) {
      const acceptStatusList = [StatusCodes2.OK, EXTRA_STATUS_CODES.BLIND_SIGNATURE_REQUIRED];
      let payload_offset = 0;
      if (payload.length > MAX_PAYLOAD) {
        while (payload.length - payload_offset > MAX_PAYLOAD) {
          const buf2 = payload.slice(payload_offset, payload_offset + MAX_PAYLOAD);
          payload_offset += MAX_PAYLOAD;
          const reply2 = await this.transport.send(LEDGER_CLA, instruction, p1, p2 | P2_MORE, buf2, acceptStatusList);
          this.throwOnFailure(reply2);
          p2 |= P2_EXTEND;
        }
      }
      const buf = payload.slice(payload_offset);
      const reply = await this.transport.send(LEDGER_CLA, instruction, p1, p2, buf, acceptStatusList);
      this.throwOnFailure(reply);
      return reply.slice(0, reply.length - 2);
    }
    throwOnFailure(reply) {
      const status = reply.readUInt16BE(reply.length - 2);
      switch (status) {
        case EXTRA_STATUS_CODES.BLIND_SIGNATURE_REQUIRED:
          throw new Error("Missing a parameter. Try enabling blind signature in the app");
        default:
          return;
      }
    }
  };
  var PubKeyDisplayMode;
  (function(PubKeyDisplayMode2) {
    PubKeyDisplayMode2[PubKeyDisplayMode2["LONG"] = 0] = "LONG";
    PubKeyDisplayMode2[PubKeyDisplayMode2["SHORT"] = 1] = "SHORT";
  })(PubKeyDisplayMode || (PubKeyDisplayMode = {}));

  // entry.js
  var import_bs58 = __toESM(require_bs58());
  async function tryOpenDevice(device) {
    if (!device) return null;
    try {
      // Stale authorized sessions often leave the device "already open".
      if (device.opened) {
        try {
          await device.close();
        } catch (_) {
        }
      }
      return await TransportWebHID.open(device);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (/already open|InvalidStateError/i.test(msg)) {
        try {
          await device.close();
        } catch (_) {
        }
        try {
          return await TransportWebHID.open(device);
        } catch (_) {
        }
      }
      return null;
    }
  }
  async function createTransport() {
    // 1) Prefer already-authorized Ledger devices (no chooser).
    try {
      const listed = typeof TransportWebHID.list === "function" ? await TransportWebHID.list() : [];
      for (let i = 0; i < (listed || []).length; i++) {
        const opened = await tryOpenDevice(listed[i]);
        if (opened) return opened;
      }
    } catch (_) {
    }
    // 2) From a user click, always show the Chrome HID chooser (most reliable).
    try {
      if (typeof TransportWebHID.request === "function") {
        return await TransportWebHID.request();
      }
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      // User dismissed the picker — surface that clearly.
      if (/denied|cancel|No device selected|Access denied/i.test(msg)) {
        throw err;
      }
    }
    // 3) Last resort: create()/listen helper.
    return await TransportWebHID.create();
  }
  async function withSolanaApp(fn) {
    const transport = await createTransport();
    try {
      const app = new Solana(transport);
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
    return "44'/501'/" + i + "'";
  }
  async function getAddress(accountIndex, display) {
    const path = pathForIndex(accountIndex);
    return withSolanaApp(async (app) => {
      const r = await app.getAddress(path, !!display);
      const bytes = r.address instanceof Uint8Array ? r.address : new Uint8Array(r.address);
      return { path, publicKey: import_bs58.default.encode(bytes), addressBytes: Array.from(bytes) };
    });
  }
  async function signTransaction(accountIndex, txBytes) {
    const path = pathForIndex(accountIndex);
    const u8 = txBytes instanceof Uint8Array ? txBytes : new Uint8Array(txBytes);
    const buf = typeof Buffer !== "undefined" && typeof Buffer.from === "function" ? Buffer.from(u8) : u8;
    return withSolanaApp(async (app) => {
      const r = await app.signTransaction(path, buf);
      const sig = r.signature instanceof Uint8Array ? r.signature : new Uint8Array(r.signature);
      return { path, signature: import_bs58.default.encode(sig), signatureBytes: Array.from(sig) };
    });
  }
  async function isSupported2() {
    try {
      return !!(navigator && navigator.hid && typeof navigator.hid.requestDevice === "function");
    } catch (_) {
      return false;
    }
  }
  var api = {
    pathForIndex,
    getAddress,
    signTransaction,
    isSupported: isSupported2,
    createTransport,
    TransportWebHID
  };
  var entry_default = api;
  if (typeof globalThis !== "undefined") globalThis.GladiatorLedger = api;
  if (typeof window !== "undefined") window.GladiatorLedger = api;
})();
