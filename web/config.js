/**
 * Public site config (safe to commit).
 *
 * Local (python run_web.py): leave apiBase empty → same origin.
 * Netlify/Vercel: set apiBase to your backend URL, e.g.
 *   "https://your-api.up.railway.app"
 *
 * Never put HELIUS / BIRDEYE / other provider keys here.
 */
window.ADTC_CONFIG = {
  // Backend root with no trailing slash. Empty = same host as this page.
  apiBase: "",

  // RugWatch website link (top nav tab). Local for now; replace with public URL later.
  rugwatchUrl: "http://127.0.0.1:8790/",

  // Optional default site passcode hint only (do not put secrets here).
  // Real gate value is WEB_API_TOKEN on the backend; users enter it via ⚙.
};
