#!/usr/bin/env bash
# Package skills/shannon as a standalone skill zip for Claude.ai / Claude Desktop upload
# (Customize > Skills) or for copying into ~/.claude/skills, ~/.codex/skills, etc.
# Usage: plugins/shannon/scripts/build-skill-zip.sh [output.zip]
set -euo pipefail
plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$plugin_dir/dist/shannon-skill.zip}"
mkdir -p "$(dirname "$out")"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
rm -f "$out"
(cd "$plugin_dir/skills" && zip -qr -X "$out" shannon -x '*.DS_Store')
echo "wrote $out"
