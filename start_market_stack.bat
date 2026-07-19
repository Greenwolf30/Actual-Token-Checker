@echo off
cd /d "%~dp0"
echo ============================================
echo  Leonidas data stack
echo ============================================
echo.
echo  Pump.fun policy:
echo    - TRACK only tokens still on the bonding curve
echo    - DELETE if no real volume for 7+ days
echo    - Also drop graduated (left bonding) auto-tracks
echo.
echo  Process 1: intel collector
echo  Process 2: local API http://127.0.0.1:8787
echo.
echo  Leave collector + API windows open.
echo  Press a key here only to close this launcher.
echo.
start "Leonidas Intel Collector" cmd /k python run_intel_collector.py --interval 40 --max-pumpfun 350 --pumpfun-discover 150 --refresh-batch 50 --enrich-batch 8 --quiet-days 7 --min-volume 100
timeout /t 2 /nobreak >nul
start "Leonidas Market API" cmd /k python run_market_api.py --port 8787
echo.
echo Started.
pause
