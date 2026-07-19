# Actual Data Token Checker — Website

Browser UI for the same analyze pipeline as the desktop app.  
**Third-party API keys never leave the server.**

**Public deploy (Netlify/Vercel UI + remote API):** see [../DEPLOY.md](../DEPLOY.md).  
Set `apiBase` in `config.js` to your API host when the UI is static-hosted separately.

## Run locally

```bash
cd GrokScreener
# ensure project .env has HELIUS_API_KEY / BIRDEYE_API_KEY if you want those layers
python run_web.py
```

Open **http://127.0.0.1:8080/**

```bash
python run_web.py --host 0.0.0.0 --port 8080   # LAN / deploy bind
```

## Security model

| Location | What lives there |
|----------|------------------|
| Server `.env` | `HELIUS_API_KEY`, `BIRDEYE_API_KEY`, Solscan, CMC, RPC URLs |
| Browser | Only public report text + market summary from **your** `/api/*` |

- Responses are sanitized; URLs containing `api-key=` are redacted.
- Rate limit: 12 analyzes / IP / minute (in-memory).
- Optional site passcode: set `WEB_API_TOKEN=your-pass` in `.env`.  
  The UI ⚙ control stores it in `sessionStorage` and sends `X-API-Token` (this is **not** a provider key).

## API

| Method | Path | Body / query |
|--------|------|----------------|
| GET | `/api/health` | Provider **configured?** flags only (no secrets) |
| POST | `/api/analyze` | `{"query":"mint or symbol","chain":"solana"?,"quick":false?}` |
| GET | `/api/analyze?q=...&chain=solana&quick=0` | same |

Response includes `sections.overview|holders|bundles|alerts|maps|about` (same text as desktop tabs) plus safe `market` / `links` for the header.

## Files

```
web_server.py     HTTP server + analyze API
run_web.py        launcher
web/
  index.html
  styles.css
  app.js
  README.md
```

## Deploy notes

1. Put `.env` on the **host only** (never in the static `web/` folder or git).
2. Prefer reverse proxy (Caddy/nginx) with HTTPS.
3. Set `WEB_API_TOKEN` if the site is public, so random visitors cannot burn your Helius quota.
4. Set `WEB_TRUST_PROXY=1` only behind a trusted reverse proxy (for client IP rate limits).
