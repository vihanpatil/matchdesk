@echo off
rem MatchDesk launcher for Windows (ADR-038, amended per H-123). Double-click
rem this file. It checks for Node.js, installs MatchDesk's components on
rem first run, starts the local server in its own window, and opens your
rem browser once the server is actually ready. Nothing here talks to the
rem internet except the one-time component install and any job links you
rem paste.
title MatchDesk
setlocal
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"

rem -- Guard: network folders, first, because this string test cannot be
rem fooled by an unreadable share. cd /d cannot enter a UNC path and would
rem leave this script running from the wrong directory, and installing onto
rem a network share fails in worse ways later. Refuse with directions.
set "HERE=%~dp0"
if "%HERE:~0,2%"=="\\" goto unc_error

rem -- Guard: run from inside the ZIP (H-122). Explorer unpacks only the
rem file you double-click into a temp folder, so the rest of MatchDesk --
rem package.json included -- is missing and the install would fail with
rem ERR_PNPM_NO_PKG_MANIFEST while blaming the network.
if not exist "%~dp0package.json" goto zip_error
cd /d "%~dp0" || goto unc_error

where node >nul 2>nul
if errorlevel 1 goto node_missing

rem -- Node 24 or newer is required (package.json engines). Read the FIRST
rem line of node -v via set /p on a temp file -- a for /f over the command
rem would take the LAST line if a wrapper printed a banner after it. The
rem findstr check keeps garbage out of the numeric comparison below.
set "NODEVER="
set "NODEMAJOR="
node -v >"%TEMP%\matchdesk-node-v.txt" 2>nul
set /p NODEVER=<"%TEMP%\matchdesk-node-v.txt"
del "%TEMP%\matchdesk-node-v.txt" >nul 2>nul
for /f "tokens=1 delims=v." %%v in ("%NODEVER%") do set "NODEMAJOR=%%v"
if not defined NODEMAJOR goto node_old
echo %NODEMAJOR%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 goto node_old
if %NODEMAJOR% lss 24 goto node_old

rem -- Choose how to run pnpm. corepack ships inside Node 24 but is removed
rem from newer Nodes; npx ships with npm inside every Node installer.
rem Prefer corepack, fall back to npx, and remember what worked last time
rem in a sentinel that is written only after a successful install -- a bare
rem node_modules folder is NOT proof of success, because a failed install
rem leaves one behind. The read is guarded by its own goto because cmd
rem hoists redirections out of an if statement, and a one-line
rem "if exist ... set /p ... <file" prints a file-not-found error on the
rem first run, before anything else the user sees.
set "SENTINEL=node_modules\.matchdesk-install-ok"
set "PMNAME="
if not exist "%SENTINEL%" goto no_saved_pm
set /p PMNAME=<"%SENTINEL%"
:no_saved_pm
if "%PMNAME%"=="npx" goto pm_npx
where corepack >nul 2>nul
if errorlevel 1 goto pm_npx
set "PM=corepack pnpm"
set "PMNAME=corepack"
goto pm_done
:pm_npx
where npx >nul 2>nul
if errorlevel 1 goto npx_missing
set "PM=npx --yes pnpm@11.21.0"
set "PMNAME=npx"
:pm_done

rem -- Install when there is no sentinel, and ALSO when pnpm-lock.yaml does
rem not match the one recorded at the last successful install: extracting a
rem new MatchDesk over an old folder keeps the old node_modules, which
rem would otherwise be trusted forever. The signature is the lock file's
rem size and timestamp -- both change with every release, and GitHub's ZIP
rem stamps files with the release's commit time.
set "LOCKSIG="
for %%f in (pnpm-lock.yaml) do set "LOCKSIG=%%~zf %%~tf"
set "OLDLOCKSIG="
if not exist "node_modules\.matchdesk-lock-sig" goto no_saved_sig
set /p OLDLOCKSIG=<"node_modules\.matchdesk-lock-sig"
:no_saved_sig
if not exist "%SENTINEL%" goto need_install
if "%LOCKSIG%"=="%OLDLOCKSIG%" goto installed

:need_install
rem -- One install at a time: a second double-click during the multi-minute
rem install would run a second pnpm against the same node_modules, and the
rem loser could leave a valid sentinel over a half-written tree. md is
rem atomic: whichever run creates the marker first proceeds. Acquired
rem BEFORE the banners so a refused run never prints "First run" first.
md "node_modules" >nul 2>nul
md "node_modules\.matchdesk-installing" 2>nul || goto install_busy
if not exist "%SENTINEL%" goto first_install
echo.
echo   MatchDesk was updated - refreshing its components. A few minutes.
echo.
goto run_install

:first_install
echo.
echo   First run: installing MatchDesk's components. This can take a few
echo   minutes and only happens once.
echo.

:run_install
call %PM% install
if "%ERRORLEVEL%"=="0" goto install_ok

rem corepack fails on some setups even when present; try npx once before
rem reporting a real failure. The string comparison against 0 is deliberate:
rem "if errorlevel 1" is a SIGNED greater-or-equal test, and a crashed
rem installer exits with a negative NTSTATUS code that it would read as
rem success -- writing the sentinel for an install that never happened.
if not "%PMNAME%"=="corepack" goto install_failed
where npx >nul 2>nul
if errorlevel 1 goto install_failed
echo.
echo   That did not finish - trying a different way. This is normal.
echo.
set "PM=npx --yes pnpm@11.21.0"
set "PMNAME=npx"
call %PM% install
if not "%ERRORLEVEL%"=="0" goto install_failed

:install_ok
rd "node_modules\.matchdesk-installing" >nul 2>nul
rem Recompute the signature AFTER the install: pnpm may rewrite the lock
rem file while installing, and recording the pre-install signature would
rem replay "refreshing its components" on every future launch. pnpm does
rem not prune unknown dotfiles at the node_modules root today; if a future
rem pnpm does, the only cost is a redundant reinstall next launch.
set "LOCKSIG="
for %%f in (pnpm-lock.yaml) do set "LOCKSIG=%%~zf %%~tf"
>"%SENTINEL%" echo(%PMNAME%
>"node_modules\.matchdesk-lock-sig" echo(%LOCKSIG%

:installed
rem -- If MatchDesk is already running from an earlier double-click, do not
rem start a second server that would crash on the taken port -- just open
rem the browser at the one that is already answering.
where curl.exe >nul 2>nul
if errorlevel 1 goto start_server
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3900/
if not "%ERRORLEVEL%"=="0" goto start_server
echo.
echo   MatchDesk is already running - opening your browser.
echo   To stop MatchDesk, close the "MatchDesk server" window.
echo.
start "" http://127.0.0.1:3900
exit /b 0

:start_server
echo.
echo   Starting MatchDesk... your browser will open when it is ready.
echo   The first start after an update can take a minute or two.
echo   Keep the "MatchDesk server" window open while you work.
echo   To stop MatchDesk, simply close that window.
echo.
start "MatchDesk server" cmd /k "title MatchDesk server&&%PM% serve"

rem -- Open the browser when the server answers, not on a timer (closes
rem ADR-038's accepted cost; audit F5). The title command above pins the
rem window name that all the messages here point at. curl.exe ships with
rem Windows 10 1803 and later; without it, fall back to a fixed wait that
rem leaves instructions on screen instead of vanishing.
where curl.exe >nul 2>nul
if errorlevel 1 goto wait_blind
set "WAITED=0"
:wait_loop
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3900/
if "%ERRORLEVEL%"=="0" goto server_up
set /a WAITED+=2
if %WAITED% geq 240 goto wait_timeout
set /a "WMOD=WAITED %% 30"
if %WMOD% equ 0 echo   Still starting - the first start can take a few minutes...
ping -n 3 127.0.0.1 >nul
goto wait_loop

:server_up
start "" http://127.0.0.1:3900
exit /b 0

:wait_blind
ping -n 31 127.0.0.1 >nul
start "" http://127.0.0.1:3900
echo.
echo   If the browser page says it cannot be reached, the server is still
echo   starting - wait a minute and press refresh. The address is:
echo   http://127.0.0.1:3900
echo.
echo   You can close this window once MatchDesk is working.
pause
exit /b 0

:wait_timeout
echo.
echo   MatchDesk is taking longer than expected. Look at the window named
echo   "MatchDesk server" in your taskbar - it shows what is happening.
echo   If that window shows red text, close it and run this file again.
echo   If it is still busy, give it a moment, then open this address in
echo   your browser yourself: http://127.0.0.1:3900
echo.
pause
exit /b 0

:zip_error
echo.
echo   It looks like this file was started from inside the ZIP.
echo   Windows unpacks only the file you double-click, so the rest of
echo   MatchDesk is still inside the archive. Nothing is wrong with your
echo   internet connection or your Node.js install.
echo.
echo   To fix: right-click matchdesk-main.zip in your Downloads folder and
echo   choose "Extract All...", then pick a place you will find again.
echo   Extraction usually creates a folder inside a folder - open them
echo   until you see the one with many files, then double-click
echo   start-matchdesk-windows in there.
echo.
pause
exit /b 1

:unc_error
echo.
echo   MatchDesk is in a network folder or a folder this computer cannot
echo   open, and it can only run from a normal folder on this computer.
echo   Move the whole MatchDesk folder into your user folder - for example
echo   C:\Users\yourname\MatchDesk - then double-click
echo   start-matchdesk-windows there.
echo.
pause
exit /b 1

:node_missing
echo.
echo   Node.js is not installed yet. It is the one thing MatchDesk needs.
echo   Your browser will open the download page - choose the Windows
echo   Installer for Node.js 24, install it with all default options,
echo   then double-click this file again.
echo.
echo   If you just installed Node.js and still see this message, restart
echo   your computer once and try again.
echo   If your work computer asks for an administrator password, ask your
echo   IT team to install "Node.js 24 LTS" - that is all they need to do.
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:node_old
echo.
echo   This computer's Node.js is either older than MatchDesk needs or not
echo   working, and MatchDesk needs Node.js 24 or newer. Your browser will
echo   open the download page - choose the Windows Installer for Node.js
echo   24, install it with all default options, then double-click this
echo   file again.
echo.
echo   If you just installed Node.js and still see this message, restart
echo   your computer once and try again.
echo   If your work computer asks for an administrator password, ask your
echo   IT team to install "Node.js 24 LTS" - that is all they need to do.
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:npx_missing
echo.
echo   Your Node.js is missing the helper tools MatchDesk needs. The
echo   simplest fix: go to https://nodejs.org/en/download, install
echo   Node.js 24 with all default options, then run this file again.
echo.
start "" https://nodejs.org/en/download
pause
exit /b 1

:install_busy
echo.
echo   MatchDesk is already setting itself up in another window. Close this
echo   window and let the other one finish.
echo.
echo   If no other MatchDesk window is open, an earlier setup was cut off
echo   partway: open the MatchDesk folder, delete the folder named
echo   node_modules, then double-click start-matchdesk-windows again.
echo.
pause
exit /b 1

:install_failed
rd "node_modules\.matchdesk-installing" >nul 2>nul
echo.
echo   The install did not finish. The red text above says why.
echo   If it mentions a network, a proxy, or a certificate, try again on
echo   a normal, non-work connection. On a locked-down work laptop, your
echo   IT team may need to allow downloads from registry.npmjs.org.
echo   Otherwise see "Common issues" in docs\USER_GUIDE.md.
echo.
pause
exit /b 1
