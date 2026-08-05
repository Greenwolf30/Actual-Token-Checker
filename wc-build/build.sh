#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npx esbuild walletconnect-entry.js --bundle --minify --format=iife \
  --outfile=../lib/walletconnect.bundle.js --platform=browser --target=es2020 \
  --define:global=globalThis
npx esbuild solana-tx-entry.js --bundle --minify --format=iife \
  --outfile=../lib/solana-tx.bundle.js --platform=browser --target=es2020 \
  --define:global=globalThis
echo "Built lib/walletconnect.bundle.js and lib/solana-tx.bundle.js"
