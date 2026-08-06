# Gladiator Wallet (local)

Keys stay in the browser. Solana RPC key stays in a local **`.env`** and is used by `serve.py` — never pasted into the UI.

## Setup

1. Copy `.env.example` → `.env`
2. Put your key in `.env`:

```env
HELIUS_API_KEY=your_key_here
```

Or:

```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_key_here
```

## Run (PowerShell)

First time only — get the folder on your Desktop, then:

```powershell
cd $env:USERPROFILE\Desktop\Gladiator-Wallet
Copy-Item .env.example .env
notepad .env   # set HELIUS_API_KEY=...
.\start.ps1
```

After that, just:

```powershell
cd $env:USERPROFILE\Desktop\Gladiator-Wallet
.\start.ps1
```

To pull file updates (keeps your `.env`):

```powershell
.\update.ps1
```

Do **not** use `py -m http.server` — use `.\start.ps1` / `serve.py` so `.env` RPC works.

## WalletConnect (pump.fun)

1. Get a free Project ID at [cloud.reown.com](https://cloud.reown.com)
2. Extension → ⋮ → **WalletConnect**
3. Paste Project ID, then a fresh `wc:` URI from pump.fun
4. Keep the popup open while connecting / signing (URIs expire quickly)

## Notes

- Top-bar address switches with the selected chain (Solana / EVM / Bitcoin / Sui)
- Optional custom RPC override in Accounts is Solana/Helius only
- Never commit `.env`
