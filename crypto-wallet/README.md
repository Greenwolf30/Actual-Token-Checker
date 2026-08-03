# Keel — Solana Wallet (UI)

Daylight Solana wallet design in `crypto-wallet/`.

## Open locally

```bash
# from repo root
python3 -m http.server 8765 --directory crypto-wallet
```

Then visit `http://localhost:8765`.

## What’s included

- **Home** — brand-first balance, Send / Receive / Swap, SOL + SPL holdings
- **Send** — asset, recipient, amount, fee line (demo validation)
- **Receive** — address + decorative QR pattern
- **Activity** — recent mock Solana txs
- Motions: balance count-up, atmosphere drift, staggered holdings rows

## Notes

This is a **design / demo shell**, not a live signer. Balances and activity are mock data. A production build would wire Phantom / Solana Wallet Adapter, RPC, and Jupiter for swap.
