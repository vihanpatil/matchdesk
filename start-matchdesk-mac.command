#!/bin/bash
# MatchDesk launcher for macOS (ADR-038, amended per H-123). Double-click
# this file in Finder. First run: right-click it and choose "Open" once,
# because macOS warns about files downloaded from the internet.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if ! cd "$(dirname "$0")"; then
  echo
  echo "  MatchDesk could not open its own folder. Move the MatchDesk folder"
  echo "  somewhere simple - like your home folder - and run this file again."
  read -r -p "Press Enter to close this window."
  exit 1
fi

if [ ! -f package.json ]; then
  echo
  echo "  This file is running outside the MatchDesk folder. Make sure the"
  echo "  ZIP is fully extracted (double-click it in Finder), then run"
  echo "  start-matchdesk-mac from inside the extracted folder."
  read -r -p "Press Enter to close this window."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed yet. It is the one thing MatchDesk needs."
  echo "  Your browser will open the download page - choose the macOS"
  echo "  Installer for Node.js 24, install it, then run this file again."
  echo
  echo "  If you just installed Node.js and still see this, close this"
  echo "  window and open a fresh one, or restart your Mac once."
  echo
  open "https://nodejs.org/en/download"
  read -r -p "Press Enter to close this window."
  exit 1
fi

NODE_MAJOR=$(node -v 2>/dev/null | head -n 1 | sed -e 's/^v//' -e 's/\..*//')
if ! [ "$NODE_MAJOR" -ge 24 ] 2>/dev/null; then
  echo
  echo "  This Mac's Node.js is either older than MatchDesk needs or not"
  echo "  working, and MatchDesk needs Node.js 24 or newer. Your browser"
  echo "  will open the download page - install Node.js 24, then run this"
  echo "  file again."
  echo
  open "https://nodejs.org/en/download"
  read -r -p "Press Enter to close this window."
  exit 1
fi

# corepack ships inside Node 24 but is removed from newer Nodes; npx ships
# with npm in every Node installer. Prefer corepack, fall back to npx, and
# remember what worked. The sentinel also proves the install finished -- a
# bare node_modules folder does not; a failed install leaves one behind.
# tr -d '\r': a sentinel written on Windows and synced across carries CRLF.
SENTINEL="node_modules/.matchdesk-install-ok"
PMNAME=""
[ -f "$SENTINEL" ] && PMNAME=$(head -n 1 "$SENTINEL" | tr -d '\r')
if [ "$PMNAME" != "npx" ] && command -v corepack >/dev/null 2>&1; then
  PM="corepack pnpm"
  PMNAME="corepack"
elif command -v npx >/dev/null 2>&1; then
  PM="npx --yes pnpm@11.21.0"
  PMNAME="npx"
else
  echo
  echo "  Your Node.js is missing the helper tools MatchDesk needs. The"
  echo "  simplest fix: go to https://nodejs.org/en/download, install"
  echo "  Node.js 24, then run this file again."
  echo
  open "https://nodejs.org/en/download"
  read -r -p "Press Enter to close this window."
  exit 1
fi

# Install on first run, and again when pnpm-lock.yaml does not match the
# signature recorded at the last successful install: extracting a new
# MatchDesk over an old folder keeps the old node_modules, which would
# otherwise be trusted forever. An inequality compare (not -nt) so a
# release committed BEFORE the last install still triggers the refresh.
LOCKSIG=$(stat -f "%z %m" pnpm-lock.yaml 2>/dev/null)
OLDLOCKSIG=$(head -n 1 "node_modules/.matchdesk-lock-sig" 2>/dev/null | tr -d '\r')
cleanup() {
  # Remove the install marker only if THIS run created it -- otherwise a
  # refused second launch would free the first launch's mutex on exit.
  [ -n "$MUTEX_OWNED" ] && rmdir "node_modules/.matchdesk-installing" 2>/dev/null
  [ -n "$POLL_PID" ] && kill "$POLL_PID" 2>/dev/null
}
MUTEX_OWNED=""
trap cleanup EXIT
if [ ! -f "$SENTINEL" ] || [ "$LOCKSIG" != "$OLDLOCKSIG" ]; then
  # One install at a time: mkdir is atomic, so a second double-click during
  # the install is refused instead of corrupting node_modules.
  mkdir -p node_modules 2>/dev/null
  if ! mkdir "node_modules/.matchdesk-installing" 2>/dev/null; then
    echo
    echo "  MatchDesk is already setting itself up in another window. Close"
    echo "  this window and let the other one finish."
    echo
    echo "  If no other MatchDesk window is open, an earlier setup was cut"
    echo "  off partway: delete the node_modules folder inside the MatchDesk"
    echo "  folder, then run this file again."
    read -r -p "Press Enter to close this window."
    exit 1
  fi
  MUTEX_OWNED=1
  if [ -f "$SENTINEL" ]; then
    echo
    echo "  MatchDesk was updated - refreshing its components. A few minutes."
    echo
  else
    echo
    echo "  First run: installing MatchDesk's components. This can take a few"
    echo "  minutes and only happens once."
    echo
  fi
  install_ok=0
  if $PM install; then
    install_ok=1
  elif [ "$PMNAME" = "corepack" ] && command -v npx >/dev/null 2>&1; then
    echo
    echo "  That did not finish - trying a different way. This is normal."
    echo
    PM="npx --yes pnpm@11.21.0"
    PMNAME="npx"
    if $PM install; then
      install_ok=1
    fi
  fi
  if [ "$install_ok" != "1" ]; then
    echo
    echo "  The install did not finish. The text above says why. If it"
    echo "  mentions a network, a proxy, or a certificate, try again on a"
    echo "  normal, non-work connection. Otherwise see 'Common issues' in"
    echo "  docs/USER_GUIDE.md."
    read -r -p "Press Enter to close this window."
    exit 1
  fi
  # Recompute the signature AFTER the install: pnpm may rewrite the lock
  # file while installing.
  LOCKSIG=$(stat -f "%z %m" pnpm-lock.yaml 2>/dev/null)
  { echo "$PMNAME" > "$SENTINEL" && echo "$LOCKSIG" > "node_modules/.matchdesk-lock-sig"; } 2>/dev/null \
    || echo "  (Could not record the finished install - the next start may repeat it.)"
  rmdir "node_modules/.matchdesk-installing" 2>/dev/null
  MUTEX_OWNED=""
fi

# If MatchDesk is already running from an earlier double-click, do not
# start a second server on the taken port - just open the browser.
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:3900/"; then
  echo
  echo "  MatchDesk is already running - opening your browser."
  echo "  To stop MatchDesk, close the window it is running in."
  echo
  open "http://127.0.0.1:3900"
  exit 0
fi

echo
echo "  Starting MatchDesk... a browser tab will open when it is ready."
echo "  The first start after an update can take a minute or two."
echo "  Keep this window open while you work; close it to stop MatchDesk."
echo
(
  for _ in $(seq 1 120); do
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:3900/"; then
      open "http://127.0.0.1:3900"
      exit 0
    fi
    sleep 2
  done
  echo
  echo "  MatchDesk is taking longer than expected. If this window shows an"
  echo "  error above, close it and run this file again. Otherwise open"
  echo "  this address in your browser yourself: http://127.0.0.1:3900"
) &
POLL_PID=$!
# The EXIT trap above (cleanup) kills this poller when the server stops:
# without that it outlives the script and can open a browser minutes after
# MatchDesk has already died.
$PM serve
