#!/usr/bin/env bash
# Copy the repository-root llms docs into the skill so every client gets current docs.
# Run from anywhere: plugins/shannon/scripts/sync-docs.sh   (add --check to fail on drift)
#
# The bundled copies sit in skills/shannon/references/, where the root docs' relative links
# (README.md, docs/*.md, assets/*) do not resolve. Those links are rewritten to absolute GitHub
# URLs on the way in. Links between llms.txt and llms-full.txt, which are bundled side by side,
# and in-page anchors are left relative.
set -euo pipefail
plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$plugin_dir/../.." && pwd)"
refs="$plugin_dir/skills/shannon/references"
blob_base="https://github.com/KeygraphHQ/shannon/blob/main/"
raw_base="https://raw.githubusercontent.com/KeygraphHQ/shannon/main/"

# Print a root doc with its relative links made absolute. llms-full.txt inlines pages from docs/,
# so a target missing at the repository root is looked up under docs/ before falling back to the
# path as written. Images point at raw files so they render; everything else points at the GitHub
# page for that file.
bundle() {
  REPO_ROOT="$repo_root" BLOB_BASE="$blob_base" RAW_BASE="$raw_base" perl -pe '
    s{\]\((?!https?://|mailto:|#|/)(?!llms(?:-full)?\.txt(?:[#)]))(?:\./)?([^)\s]+)\)}{
      my $target = $1;
      my ($file) = split /#/, $target, 2;
      if (!-e "$ENV{REPO_ROOT}/$file" && -e "$ENV{REPO_ROOT}/docs/$file") {
        $target = "docs/$target";
      }
      my $base = $file =~ /\.(?:gif|png|jpe?g|svg|webp)$/i ? $ENV{RAW_BASE} : $ENV{BLOB_BASE};
      "](" . $base . $target . ")";
    }ge;
  ' "$1"
}

status=0
for f in llms.txt llms-full.txt; do
  if [[ "${1:-}" == "--check" ]]; then
    if ! bundle "$repo_root/$f" | cmp -s - "$refs/$f"; then
      msg="plugins/shannon/skills/shannon/references/$f is missing or out of date with $f at the repository root. Run plugins/shannon/scripts/sync-docs.sh to refresh it."
      if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
        echo "::error file=plugins/shannon/skills/shannon/references/$f::$msg"
      else
        echo "drift: $msg" >&2
      fi
      status=1
    fi
  else
    bundle "$repo_root/$f" > "$refs/$f"
  fi
done
[[ "${1:-}" == "--check" && $status -eq 0 ]] && echo "docs in sync"
exit $status
