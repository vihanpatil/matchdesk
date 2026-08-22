@echo off
rem MatchDesk launcher (bundled release, ADR-039). Double-click this file.
rem Everything MatchDesk needs is inside this folder, including its own
rem private copy of Node. Nothing here talks to the internet except the
rem job links you paste inside MatchDesk.
title MatchDesk
setlocal

rem -- Guard: network folders (same reasoning as the repo launcher, H-123).
set "HERE=%~dp0"
if "%HERE:~0,2%"=="\\" goto unc_error

rem -- Guard: run from inside the ZIP (H-122). Explorer unpacks only the
rem file you double-click, so the bundled runtime would be missing.
if not exist "%~dp0runtime\node.exe" goto zip_error
if not exist "%~dp0apps\server\dist\http\serve.js" goto zip_error
cd /d "%~dp0" || goto unc_error

rem -- The bundled runtime goes first on PATH so "node" below is ours.
set "PATH=%~dp0runtime;%PATH%"

rem -- Already running? Do not start a second server on the taken port.
where curl.exe >nul 2>nul
if errorlevel 1 goto start_server
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3900/
if not "%ERRORLEVEL%"=="0" goto start_server
echo.
echo   MatchDesk is already running - opening your browser.
echo   To stop MatchDesk, close the "MatchDesk server" window.
echo.
if not defined MATCHDESK_NO_BROWSER start "" http://127.0.0.1:3900
exit /b 0

:start_server
echo.
echo   Starting MatchDesk... your browser will open when it is ready.
echo   Keep the "MatchDesk server" window open while you work.
echo   To stop MatchDesk, simply close that window.
echo.
start "MatchDesk server" cmd /k "title MatchDesk server&&node apps\server\dist\http\serve.js"

rem -- Open the browser when the server answers, not on a timer.
where curl.exe >nul 2>nul
if errorlevel 1 goto wait_blind
set "WAITED=0"
:wait_loop
curl.exe -s -o nul --max-time 2 http://127.0.0.1:3900/
if "%ERRORLEVEL%"=="0" goto server_up
set /a WAITED+=2
if %WAITED% geq 120 goto wait_timeout
ping -n 3 127.0.0.1 >nul
goto wait_loop

:server_up
if not defined MATCHDESK_NO_BROWSER start "" http://127.0.0.1:3900
exit /b 0

:wait_blind
ping -n 16 127.0.0.1 >nul
if not defined MATCHDESK_NO_BROWSER start "" http://127.0.0.1:3900
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
echo   If there is no such window at all, just run this file again.
echo   If it is still busy, give it a moment, then open this address in
echo   your browser yourself: http://127.0.0.1:3900
echo.
pause
exit /b 1

:zip_error
echo.
echo   It looks like this file was started from inside the ZIP, or the ZIP
echo   was only partly extracted. Right-click the MatchDesk ZIP in your
echo   Downloads folder, choose "Extract All...", and pick a place you will
echo   find again. Extraction usually creates a folder inside a folder -
echo   open them until you see the one with many files, then double-click
echo   Start-MatchDesk in there.
echo.
pause
exit /b 1

:unc_error
echo.
echo   MatchDesk is in a network folder or a folder this computer cannot
echo   open, and it can only run from a normal folder on this computer.
echo   Move the whole MatchDesk folder into your user folder - for example
echo   C:\Users\yourname\MatchDesk - then double-click Start-MatchDesk
echo   there.
echo.
pause
exit /b 1
