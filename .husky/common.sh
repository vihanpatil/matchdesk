# Shared hook preamble.
#
# Git hooks do not inherit an interactive shell, so a machine whose default
# `node` differs from .nvmrc (e.g. a Homebrew Node alongside nvm) would run the
# hooks against the wrong runtime — or fail to find pnpm at all, producing a
# confusing error that has nothing to do with the code being committed.
#
# Load the pinned Node if nvm is available, then verify. Never silently
# continue on the wrong runtime.

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use --silent >/dev/null 2>&1 || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✖ hook: node is not on PATH."
  echo "  Install Node 24 (see .nvmrc) and retry."
  exit 1
fi

# Compare the full version, not just the major — v24.0.0 satisfies a major-only
# check but violates engines >= 24.15.0.
node_ok=$(node -p "
  const [a,b,c] = process.versions.node.split('.').map(Number);
  const [x,y,z] = [24,15,0];
  (a>x || (a===x && (b>y || (b===y && c>=z)))) ? 'yes' : 'no';
")
if [ "$node_ok" != "yes" ]; then
  echo "✖ hook: Node $(node -v) is too old — this project requires >= 24.15.0 (.nvmrc)."
  echo "  Run:  nvm use"
  echo "  Why:  better-sqlite3 requires Node >= 22 and pnpm 11 requires >= 22.22.2 / 24.15.0."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "✖ hook: pnpm is not on PATH."
  echo "  Run:  corepack enable"
  exit 1
fi
