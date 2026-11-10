#!/usr/bin/env sh
# Verifies the Shannon plugin under plugins/shannon/ is well formed: a valid
# Cursor plugin manifest, a skill whose frontmatter name matches its folder, the
# bundled llms docs (kept identical to the repo-root originals), the logo the
# manifest points to, the MCP server, and the repo-root marketplace manifest
# that lists this plugin.
set -eu

plugin_dir="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$plugin_dir/../.." && pwd)"
cd "$plugin_dir"

fail() {
  echo "check-plugin: $1" >&2
  exit 1
}

[ -f .cursor-plugin/plugin.json ] || fail ".cursor-plugin/plugin.json is missing"
[ -f skills/shannon/SKILL.md ] || fail "skills/shannon/SKILL.md is missing"

node -e '
  const m = JSON.parse(require("fs").readFileSync(".cursor-plugin/plugin.json", "utf8"));
  if (!m.name) throw new Error("plugin.json needs a name");
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(m.name)) throw new Error("plugin.json name must be lowercase kebab-case");
  if (m.skills !== "./skills/") throw new Error("plugin.json skills must be \"./skills/\"");
  if (!m.logo) throw new Error("plugin.json needs a logo");
' || fail ".cursor-plugin/plugin.json is invalid"

skill_name="$(sed -n '2,12p' skills/shannon/SKILL.md | sed -n 's/^name: *//p' | head -1)"
[ "$skill_name" = "shannon" ] || fail "SKILL.md frontmatter name must be 'shannon' to match its folder"

# The logo the manifest references must exist (the marketplace listing needs it).
logo="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(".cursor-plugin/plugin.json","utf8")).logo)')"
[ -f "$logo" ] || fail "the logo named in plugin.json ($logo) is missing"

# The docs are bundled so the installed plugin is self-contained, and must stay
# byte-identical to the repo-root originals that are their source of truth.
[ -f llms-full.txt ] || fail "llms-full.txt is missing from the plugin; the skill points to it"
[ -f llms.txt ] || fail "llms.txt is missing from the plugin"
if [ -f "$repo_root/llms-full.txt" ]; then
  cmp -s llms-full.txt "$repo_root/llms-full.txt" || fail "plugins/shannon/llms-full.txt is out of sync with the repo-root llms-full.txt (copy it again)"
  cmp -s llms.txt "$repo_root/llms.txt" || fail "plugins/shannon/llms.txt is out of sync with the repo-root llms.txt (copy it again)"
fi

grep -q "llms-full.txt" skills/shannon/SKILL.md \
  || fail "SKILL.md no longer references llms-full.txt; update the check or the skill"

# MCP server: the manifest, the node launcher, and the stdio server it runs.
[ -f mcp.json ] || fail "mcp.json is missing"
[ -f mcp/launch.sh ] || fail "mcp/launch.sh is missing"
[ -f mcp/shannon-mcp.mjs ] || fail "mcp/shannon-mcp.mjs is missing"

node -e '
  const m = JSON.parse(require("fs").readFileSync("mcp.json", "utf8"));
  const s = m.mcpServers && m.mcpServers.shannon;
  if (!s) throw new Error("mcp.json must define mcpServers.shannon");
  if (s.type !== "stdio") throw new Error("the shannon server must be type stdio");
  if (!s.command) throw new Error("the shannon server needs a command");
  if (!Array.isArray(s.args)) throw new Error("the shannon server needs an args array");
  if (!s.args.some((a) => a.includes("launch.sh"))) throw new Error("the shannon server args must run launch.sh");
  if (!s.args.some((a) => a.includes("shannon-mcp.mjs"))) throw new Error("the shannon server args must pass shannon-mcp.mjs");
' || fail "mcp.json is invalid"

sh -n mcp/launch.sh || fail "mcp/launch.sh has a syntax error"
node --check mcp/shannon-mcp.mjs || fail "mcp/shannon-mcp.mjs has a syntax error"

# The repo-root marketplace manifest must list this plugin at its subdirectory.
mkt="$repo_root/.cursor-plugin/marketplace.json"
[ -f "$mkt" ] || fail ".cursor-plugin/marketplace.json is missing at the repo root"
node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const p = (m.plugins || []).find((x) => x.name === "shannon");
  if (!p) throw new Error("marketplace.json must list a plugin named shannon");
  if (p.source !== "plugins/shannon") throw new Error("the shannon plugin source must be plugins/shannon");
' "$mkt" || fail ".cursor-plugin/marketplace.json is invalid"

echo "check-plugin: ok"
