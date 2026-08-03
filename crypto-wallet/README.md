# Keel — Solana Wallet

Dark-navy Solana wallet UI with OCR-A type and `#B8A7CF` accents.

Works as:
1. a **browser extension** (Chrome / Edge / Brave — Manifest V3)
2. a local **web demo**

## Install as a browser extension

1. Open Chrome (or Edge) → `chrome://extensions` (Edge: `edge://extensions`)
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `crypto-wallet/`
5. Pin **Keel** from the puzzle-piece toolbar menu
6. Click the Keel icon to open the popup wallet

## Run as a local web page

```bash
python3 -m http.server 8765 --directory crypto-wallet
```

Open **http://localhost:8765/** (not `/crypto-wallet/`).

## What’s included

- Popup / page: Home, Send, Receive, Activity
- Extension files: `manifest.json`, `popup.html`, `background.js`, `icons/`
- Demo balances only — not a live Solana signer

## Notes

This is a **UI demo**. Real receive/send needs a keypair or Wallet Adapter + RPC.
