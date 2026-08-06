# Chrome/Opera cannot load folders named __pycache__
Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Filter '*.pyc' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
$env:PYTHONDONTWRITEBYTECODE = "1"

# Start Gladiator locally (reads .env via serve.py).
# Usage:
#   cd $env:USERPROFILE\Desktop\Gladiator-Wallet
#   .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.env")) {
  if (Test-Path ".\.env.example") {
    Copy-Item ".\.env.example" ".\.env"
    Write-Host "Created .env — set HELIUS_API_KEY=your_key then save." -ForegroundColor Yellow
    notepad .\.env
  } else {
    Write-Host "Missing .env — create it with HELIUS_API_KEY=..." -ForegroundColor Red
    exit 1
  }
}

$hasKey = $false
Get-Content .\.env | ForEach-Object {
  if ($_ -match '^\s*HELIUS_API_KEY\s*=\s*(.+)\s*$' -and $Matches[1].Trim().Length -gt 0) { $hasKey = $true }
  if ($_ -match '^\s*SOLANA_RPC_URL\s*=\s*(https?://\S+)\s*$') { $hasKey = $true }
}
if (-not $hasKey) {
  Write-Host "Your .env has no HELIUS_API_KEY (or SOLANA_RPC_URL) yet." -ForegroundColor Yellow
  Write-Host "Example line: HELIUS_API_KEY=abc123" -ForegroundColor Yellow
  notepad .\.env
}

Write-Host "Starting Gladiator (auto-picks a free port if 8765 is blocked)..." -ForegroundColor Cyan
py serve.py
