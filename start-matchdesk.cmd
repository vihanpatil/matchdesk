@echo off
rem MatchDesk launcher for Windows (ADR-038 / PRODUCT_DECISIONS launcher
rem requirement). Double-click this file. It checks for Node.js, installs
rem MatchDesk's components on first run, starts the local server in its own
rem window, and opens your browser. Nothing here talks to the internet
rem except the one-time component install and any job links you paste.
title MatchDesk
cd /d "%~dp0"

rem Guard: when a file is opened from inside a ZIP, Windows Explorer unpacks
rem that one file alone into %TEMP%\GUID_zipname\ and runs it there. The rest
rem of MatchDesk -- package.json included -- stays in the archive, so the
rem install below fails with ERR_PNPM_NO_PKG_MANIFEST and used to print a
rem message about the internet connection that had nothing to do with the
rem real cause. Check for the sentinel file before doing anything else.
if not exist "%~dp0package.json" (
  echo.
  echo   It looks like this file was started from inside the ZIP.
  echo   Windows unpacks only the file you double-click, so the rest of
  echo   MatchDesk is still inside the archive. Nothing is wrong with your
  echo   internet connection or your Node.js install.
  echo.
  echo   To fix: right-click matchdesk-main.zip in your Downloads folder and
  echo   choose "Extract All...", then pick a place you will find again,
  echo   such as Documents. Open that extracted folder - you should see
  echo   package.json sitting next to start-matchdesk.cmd - and double-click
  echo   start-matchdesk.cmd from there.
  echo.
  pause
  exit /b 1
)

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
    echo   The install did not finish. The red text above says why.
    echo   If it mentions a network, a proxy, or a certificate, try again on
    echo   a normal, non-work connection. Otherwise see "Common issues" in
    echo   docs/USER_GUIDE.md.
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
