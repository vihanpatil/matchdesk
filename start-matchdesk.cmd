@echo off
rem MatchDesk launcher for Windows (ADR-038 / PRODUCT_DECISIONS launcher
rem requirement). Double-click this file. It checks for Node.js, installs
rem MatchDesk's components on first run, starts the local server in its own
rem window, and opens your browser. Nothing here talks to the internet
rem except the one-time component install and any job links you paste.
title MatchDesk
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet. It is the one thing MatchDesk needs.
  echo   Your browser will open the download page - choose the Windows
  echo   Installer for Node.js 24, install it with all default options,
  echo   then double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   First run: installing MatchDesk's components. This can take a few
  echo   minutes and only happens once.
  echo.
  call corepack pnpm install
  if errorlevel 1 (
    echo.
    echo   The install did not finish. Check your internet connection and
    echo   run this file again. If it keeps failing, see "Common issues"
    echo   in docs/USER_GUIDE.md.
    pause
    exit /b 1
  )
)

echo.
echo   Starting MatchDesk... a browser tab will open in a moment.
echo   Keep the "MatchDesk server" window open while you work.
echo   To stop MatchDesk, simply close that window.
echo.
start "MatchDesk server" /min cmd /k "corepack pnpm serve"
rem Give the server time to build and bind before opening the browser.
ping -n 15 127.0.0.1 >nul
start "" http://127.0.0.1:3900
exit /b 0
