/**
 * Copy to config.js and set apiBase for Netlify/Vercel static hosting.
 *
 *   cp config.example.js config.js
 *
 * Example:
 *   apiBase: "https://adtc-api.up.railway.app"
 */
window.ADTC_CONFIG = {
  apiBase: "https://YOUR-BACKEND-HOST.example.com",

  // RugWatch website (top yellow nav tab). Local for now; public URL later.
  rugwatchUrl: "http://127.0.0.1:8790/",
};
