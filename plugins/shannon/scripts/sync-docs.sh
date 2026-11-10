#!/usr/bin/env sh
# Refresh the plugin's bundled Shannon docs (llms-full.txt, llms.txt) from the
# repository-root copies, which are their source of truth. The docs are bundled
# under the plugin so the installed plugin is self-contained; this keeps those
# copies byte-identical to the root originals. check-plugin.sh fails if they drift.
#
# Run from anywhere; it resolves paths relative to this script.
set -eu

plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$plugin_dir/../.." && pwd)"

for f in llms-full.txt llms.txt; do
  if [ ! -f "$repo_root/$f" ]; then
    echo "sync-docs: $repo_root/$f not found" >&2
    exit 1
  fi
  cp "$repo_root/$f" "$plugin_dir/$f"
  echo "synced $f"
done

echo "sync-docs: bundled docs match the repo root"
