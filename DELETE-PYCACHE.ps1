$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Get-ChildItem -Path $root -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $root -Recurse -Filter '*.pyc' -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "Removed __pycache__ / *.pyc under $root"
Write-Host "Reload at opera://extensions or chrome://extensions (Load unpacked this folder)."
