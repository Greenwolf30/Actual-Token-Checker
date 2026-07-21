# Actual Data Token Checker

Local + web token research tool (DexScreener markets, holders, bundles, alerts, About narrative).

**This repo has no API keys.** Copy `.env.example` → `.env` and add your own.

## Chains

| Chain | Market (DexScreener) | Holders / bundles |
|-------|----------------------|-------------------|
| **Solana** | Yes | Yes (Helius / Rugcheck / …) |
| **Robinhood Chain** (`robinhood`, chain id **4663**) | Yes | Explorer link only for now |
| Ethereum / Base / Arbitrum / … | Yes | Not fully wired |

Examples:
- Chain filter: **robinhood**
- Query: `0x…` token on Robinhood, or `robinhood:0x…`

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# edit .env with HELIUS_API_KEY etc.
```

## Desktop app

```bash
python desktop_app.py
```

Build Windows exe (optional):

```bash
python build_exe.py
```

## Website

```bash
python run_web.py
# open http://127.0.0.1:8080/
```

Provider keys stay on the server only (never in `web/`).

### RugWatch integration (flags + Ruggers Upload)

| Feature | What it does |
|--------|----------------|
| **RugWatch** checkbox (yellow) | Analyze includes or skips flagged-wallet merge |
| Top nav **RugWatch** (yellow, next to logo) | Opens RugWatch site (`web/config.js` → `rugwatchUrl`) |
| Ruggers **Upload** (yellow) | Any seller section → RugWatch local DB + Push cloud |
| Ruggers **Export** | Download JSON/txt for manual RugWatch import (all seller sections) |
| Ruggers lanes | Creator · Similar · Multi · Funder · Insider · Launch · Suspect · Single · Flagged (RugWatch) · Swing |
| Holders flags | Merges **local** `rugwatch*.db` + **cloud** `RUGWATCH_WALLETS_URL`; tags `[local]` / `[cloud]` / `[both]` |

Render ATC env (cloud flags):

```text
RUGWATCH_WALLETS_URL=https://raw.githubusercontent.com/Greenwolf30/RugWatch/main/data/wallets_index.json
```

Full user guide: [DOCUMENTATION.txt on GitHub](https://github.com/Greenwolf30/Actual-Token-Checker/blob/main/DOCUMENTATION.txt) (also `web/documentation.txt` / `/docs.html` on the site).  
**About tab sources** (Pump.fun API, X, Reddit, LinkedIn, news, etc.): see section **10. ABOUT** in that guide.

Public deploy notes: see `DEPLOY.md`.

## Layout

| Path | Role |
|------|------|
| `desktop_app.py` | Desktop UI |
| `token_tracker/` | Analyze, holders, bundles, about, alerts |
| `web/` + `web_server.py` | Website UI + API |
| `market_data/` | Optional local market/intel DB stack |
| `.env.example` | Key names only |

## Public view counter

The website tracks **profile views** (page loads) and **analyzes**, shown on the UI and via public endpoints (no keys, no raw IPs):

| URL | What |
|-----|------|
| `/api/stats` | JSON counters |
| `/badge.svg` | Embeddable badge |
| `/api/view` | Records one profile view |

Example badge markdown (after deploy):

```markdown
![views](https://YOUR-RENDER-URL/badge.svg)
```

Counts live in `data/view_stats.json` (gitignored). On free hosts they may reset on redeploy without a persistent disk.

## Disclaimer

Heuristics only. Not financial advice.
