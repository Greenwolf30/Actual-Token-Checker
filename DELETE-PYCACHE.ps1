$ErrorActionPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot
Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Filter '*.pyc' | Remove-Item -Force
Write-Host "Cleaned. Load unpacked this folder:" $PSScriptRoot
