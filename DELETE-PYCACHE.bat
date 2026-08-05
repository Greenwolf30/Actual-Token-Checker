@echo off
cd /d "%~dp0"
echo Removing __pycache__ (Chrome/Opera cannot load folders that contain it)...
if exist "__pycache__" rd /s /q "__pycache__"
for /d /r %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
del /s /q "*.pyc" >nul 2>&1
echo.
echo Done. Now:
echo   1. opera://extensions  (or chrome://extensions)
echo   2. Remove old Gladiator if needed
echo   3. Load unpacked → this folder  OR  click Reload
pause
