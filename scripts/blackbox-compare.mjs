// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

const help = `Usage: blackbox-compare <deliverables-directory> [--raw-dir <directory>] [--output <new-directory>]

Compare recorded identities and saved responses from one native black-box artifact set offline.
Required: traffic_inventory.json and blackbox_blackboard.json (export schema 1).
Optional: blackbox_authz_findings.json and explicitly supplied saved native raw records.
Output describes recorded relations, triage signals and unknowns. It does not establish
authorization, session validity, expected policy, semantic equivalence or application coverage.

Prerequisites: Node.js 22 or newer and pnpm 10.33.0.
Setup from the repository root:
  pnpm install --frozen-lockfile
  pnpm --filter @shannon/worker build
Run: pnpm --silent blackbox-compare <deliverables-directory> [options]
Help works without installed dependencies or compiled output.

Stdout: deterministic versioned JSON. --output creates a new directory containing
comparison.json and comparison.md; its existing parent must be a real directory.
Existing destinations and output within either input directory are rejected.
These files contain private route and identity metadata; they are not a sharing format.
Limits: native file 16 MiB; raw file 1 MiB; aggregate input 64 MiB; 512 raw files;
depth 64; 500000 nodes; 10000 exchanges; 2000 routes; 16 recorded identities;
5000 transitions; 50000 collection records; 5000 comparisons; 256 sources per comparison;
each output 16 MiB; 60 seconds total.
Exit codes: 0 completed; 1 partial/failed processing, setup or output; 2 invalid usage.
`;

const MESSAGES = {
  invalid_usage: 'Unsupported arguments. Run blackbox-compare --help for usage.',
  setup_required: 'Build the worker from the repository root as shown by --help.',
  'output-limit': 'Comparison output exceeds the enforced limit.',
  processing_failed: 'Saved comparison processing failed.',
};

function diagnostic(code, exitCode = 1) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: 'failed',
    diagnostics: [{ code, message: MESSAGES[code] ?? MESSAGES.processing_failed }],
  })}\n`);
  process.exitCode = exitCode;
}

function parse(args) {
  if (!args[0] || args[0].startsWith('-')) return null;
  const parsed = { directory: args[0] };
  for (let index = 1; index < args.length; index += 2) {
    const value = args[index + 1];
    if (!value || value.startsWith('-')) return null;
    if (args[index] === '--raw-dir' && parsed.rawDirectory === undefined) parsed.rawDirectory = value;
    else if (args[index] === '--output' && parsed.outputDirectory === undefined) parsed.outputDirectory = value;
    else return null;
  }
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(help);
    return;
  }
  const parsed = parse(args);
  if (!parsed) {
    diagnostic('invalid_usage', 2);
    return;
  }
  let api;
  try {
    api = await import('../apps/worker/dist/blackbox-observation/access-index.js');
  } catch {
    diagnostic('setup_required');
    return;
  }
  const controller = new AbortController();
  const interrupted = () => controller.abort();
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    const report = await api.compareAccessDirectory(parsed.directory, {
      ...(parsed.rawDirectory === undefined ? {} : { rawDirectory: parsed.rawDirectory }),
      ...(parsed.outputDirectory === undefined ? {} : { outputDirectory: parsed.outputDirectory }),
      signal: controller.signal,
    });
    process.stdout.write(report.json);
    process.exitCode = report.result.status === 'completed' ? 0 : 1;
  } catch (error) {
    diagnostic(error instanceof api.AccessComparisonOutputError ? 'output-limit' : 'processing_failed');
  } finally {
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

await main();
