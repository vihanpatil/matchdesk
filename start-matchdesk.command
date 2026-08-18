#!/bin/bash
# MatchDesk launcher for macOS (ADR-038). Double-click this file in Finder.
# First run: right-click it and choose "Open" once, because macOS warns
# about files downloaded from the internet.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed yet. It is the one thing MatchDesk needs."
  echo "  Your browser will open the download page - choose the macOS"
  echo "  Installer for Node.js 24, install it, then run this file again."
  echo
  open "https://nodejs.org/en/download"
  read -r -p "Press Enter to close this window."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo
  echo "  First run: installing MatchDesk's components. This can take a few"
  echo "  minutes and only happens once."
  echo
  corepack pnpm install || {
    echo
    echo "  The install did not finish. Check your internet connection and"
    echo "  run this file again. See 'Common issues' in docs/USER_GUIDE.md."
    read -r -p "Press Enter to close this window."
    exit 1
  }
fi

echo
echo "  Starting MatchDesk... a browser tab will open in a moment."
echo "  Keep this window open while you work; close it to stop MatchDesk."
echo
(sleep 10 && open "http://127.0.0.1:3900") &
corepack pnpm serve
