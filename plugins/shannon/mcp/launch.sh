#!/bin/sh
# Locate a Node.js runtime, then exec the Shannon MCP server with it.
#
# The MCP host (Cursor and the like) launches this with a minimal environment,
# so a Node installed only through a version manager (nvm, mise, fnm, volta,
# asdf) is often not on PATH and "command": "node" would fail to start. Try
# PATH first, then the common version-manager and package-manager locations,
# and exec the first node that runs. Shannon's server needs Node 18 or newer.
# POSIX sh; macOS and Linux (including WSL2). Native Windows is unsupported,
# matching Shannon itself.
set -u

server="${1:-}"
if [ -z "$server" ]; then
  echo "shannon MCP launcher: missing server path argument" >&2
  exit 2
fi

# Newest node under a glob of version directories, or empty if none match.
newest() {
  # shellcheck disable=SC2086
  ls -d $1 2>/dev/null | sort -V | tail -n 1
}

# 1. A node already on PATH wins.
if command -v node >/dev/null 2>&1; then
  exec node "$server"
fi

# 2. Fall back to common version-manager / package-manager locations.
mise_node=""
if command -v mise >/dev/null 2>&1; then
  mise_node="$(mise which node 2>/dev/null || true)"
fi

for candidate in \
  "$mise_node" \
  "$(newest "$HOME/.local/share/mise/installs/node/*/bin/node")" \
  "$(newest "$HOME/.nvm/versions/node/*/bin/node")" \
  "$(newest "$HOME/.local/share/fnm/node-versions/*/installation/bin/node")" \
  "$HOME/.volta/bin/node" \
  "$HOME/.asdf/shims/node" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "$HOME/.local/bin/node" \
  "/usr/bin/node"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    exec "$candidate" "$server"
  fi
done

echo "shannon MCP launcher: no Node.js runtime found. Install Node 18+ or add node to PATH." >&2
exit 127
