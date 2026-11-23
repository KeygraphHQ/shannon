#!/usr/bin/env bash
# Copy the repository-root llms docs into the skill so every client gets current docs.
# Run from anywhere: plugins/shannon/scripts/sync-docs.sh   (add --check to fail on drift)
set -euo pipefail
plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$plugin_dir/../.." && pwd)"
refs="$plugin_dir/skills/shannon/references"
status=0
for f in llms.txt llms-full.txt; do
  if [[ "${1:-}" == "--check" ]]; then
    if ! cmp -s "$repo_root/$f" "$refs/$f"; then
      msg="plugins/shannon/skills/shannon/references/$f is missing or differs from $f at the repository root. Run plugins/shannon/scripts/sync-docs.sh to refresh it."
      if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
        echo "::error file=plugins/shannon/skills/shannon/references/$f::$msg"
      else
        echo "drift: $msg" >&2
      fi
      status=1
    fi
  else
    cp "$repo_root/$f" "$refs/$f"
  fi
done
[[ "${1:-}" == "--check" && $status -eq 0 ]] && echo "docs in sync"
exit $status
