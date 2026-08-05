# Update Gladiator in place (overwrites files in this folder, keeps .env).
# Usage:
#   .\update.ps1
# Optional custom zip URL:
#   .\update.ps1 https://litter.catbox.moe/xxxx.zip

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$defaultUrlFile = Join-Path $PSScriptRoot "update-url.txt"
$Url = $args[0]
if (-not $Url) {
  if (Test-Path $defaultUrlFile) {
    $Url = (Get-Content $defaultUrlFile -Raw).Trim()
  }
}
if (-not $Url) {
  Write-Host "No update URL. Pass one: .\update.ps1 https://..." -ForegroundColor Red
  exit 1
}

$zip = Join-Path $env:TEMP "Gladiator-Wallet-update.zip"
$stage = Join-Path $env:TEMP "Gladiator-Wallet-update"
Write-Host "Downloading update..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $Url -OutFile $zip
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $stage -Force

$src = Join-Path $stage "Gladiator-Wallet"
if (-not (Test-Path $src)) {
  # zip may contain files at root
  $src = $stage
}

# Keep local secrets + optional custom override
$keep = @(".env")
foreach ($f in Get-ChildItem $src -Force) {
  if ($keep -contains $f.Name) { continue }
  $dest = Join-Path $PSScriptRoot $f.Name
  if ($f.PSIsContainer) {
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $f.FullName $dest -Recurse -Force
  } else {
    Copy-Item $f.FullName $dest -Force
  }
}

Write-Host "Updated. Start with: .\start.ps1" -ForegroundColor Green
