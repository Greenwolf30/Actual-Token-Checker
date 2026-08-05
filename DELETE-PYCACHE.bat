@echo off
cd /d "%~dp0"
echo Removing Python cache from:
echo %CD%
if exist "__pycache__" (
  rmdir /s /q "__pycache__"
  echo Deleted __pycache__
) else (
  echo No __pycache__ folder found.
)
for /r %%F in (*.pyc) do del /q "%%F" 2>nul
echo.
echo Done. Now in Opera/Chrome: Load unpacked -^> select THIS folder
echo (or click Reload on Gladiator Wallet)
pause
