# Actual Data Token Checker

Local + web token research tool (DexScreener markets, holders, bundles, alerts, About narrative).

**This repo has no API keys.** Copy `.env.example` → `.env` and add your own.

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

Public deploy notes: see `DEPLOY.md`.

## Layout

| Path | Role |
|------|------|
| `desktop_app.py` | Desktop UI |
| `token_tracker/` | Analyze, holders, bundles, about, alerts |
| `web/` + `web_server.py` | Website UI + API |
| `market_data/` | Optional local market/intel DB stack |
| `.env.example` | Key names only |

## Disclaimer

Heuristics only. Not financial advice.
