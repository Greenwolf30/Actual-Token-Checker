# Public deploy: Netlify/Vercel UI + separate API (keys safe)

```
Browser (Netlify/Vercel static web/)
        │  HTTPS, no secrets
        ▼
Your API host (Railway / Render / VPS)
        │  HELIUS_API_KEY, BIRDEYE_API_KEY, …
        ▼
Provider APIs
```

Provider keys **never** go on Netlify/Vercel. Only the static `web/` folder does.

---

## 1) Deploy the API (keys here)

Pick one host that can run Python for ~1–2 minutes per Analyze.

### Railway / Render / any VPS

1. Deploy this **whole repo** (or clone it).
2. Start command:
   ```bash
   python run_web.py --host 0.0.0.0 --port $PORT
   ```
3. Set **env vars** on that host (not in git):

   | Variable | Purpose |
   |----------|---------|
   | `HELIUS_API_KEY` | Solana holders / RPC |
   | `BIRDEYE_API_KEY` | optional |
   | `WEB_API_TOKEN` | **strongly recommended** site passcode |
   | `WEB_CORS_ORIGINS` | your UI origin, e.g. `https://yoursite.netlify.app` |
   | `WEB_TRUST_PROXY` | `1` behind their reverse proxy |

4. Note the public API URL, e.g. `https://adtc-api.onrender.com`  
   Check: `https://…/api/health` → should say providers configured, **no key values**.

`render.yaml` and `Procfile` are included as helpers.

---

## 2) Point the UI at the API

Edit **`web/config.js`** (safe to commit — no keys):

```js
window.ADTC_CONFIG = {
  apiBase: "https://YOUR-API-HOST.example.com",  // no trailing slash
};
```

Local `python run_web.py` can leave `apiBase: ""` (same origin).

---

## 3) Deploy the UI (static only)

### Netlify

1. New site → connect repo (or drag-drop `web/`).
2. **Publish directory:** `web`  
   (repo root `netlify.toml` already sets this.)
3. Deploy.
4. Set backend `WEB_CORS_ORIGINS=https://your-site.netlify.app` and restart API.

### Vercel

1. New project → this repo.
2. Root / output: use `vercel.json` (publishes `web`).
3. Deploy.
4. Set `WEB_CORS_ORIGINS=https://your-app.vercel.app` on the API.

---

## 4) Use the public site

1. Open the Netlify/Vercel URL.
2. Status pill should show **server ok · remote API**.
3. If you set `WEB_API_TOKEN`, click **⚙** and enter that passcode (not a Helius key).
4. Analyze.

---

## Safety checklist

- [ ] No `.env` or keys inside `web/`
- [ ] `apiBase` is only your API URL
- [ ] `WEB_API_TOKEN` set on the API when public
- [ ] `WEB_CORS_ORIGINS` locked to your Netlify/Vercel domain(s)
- [ ] `/api/health` never returns secret strings

---

## Local full stack (no Netlify)

```bash
python run_web.py
# open http://127.0.0.1:8080/
```
