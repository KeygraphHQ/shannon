// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

const help = `Usage: blackbox-validation-bundle <deliverables-directory> --raw-dir <directory> --comparison <comparison-id> --output <new-directory>

Create one self-contained validation bundle from a completed eligible cross-identity comparison.
The source comparison is recomputed from guarded native and raw evidence. The output leaf must
not exist or overlap either input. Success writes observation/, raw/, comparison.json and
selection.json, then recomputes and resolves the copied bundle before returning.

Prerequisites: Node.js 22 or newer, installed dependencies and a built worker.
Setup: pnpm --filter @shannon/worker build
Exit codes: 0 bundle created; 1 setup or bundle failure; 2 invalid usage.
`;

const MESSAGES = Object.freeze({
  invalid_usage: 'Unsupported arguments. Run blackbox-validation-bundle --help for usage.',
  setup_required: 'Build the worker from the repository root as shown by --help.',
  bundle_failed: 'Black-box access validation bundle could not be created.',
});

function diagnostic(code, exitCode) {
  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: 1,
      kind: 'blackbox-cross-identity-validation-bundle',
      status: 'failed',
      diagnostics: [{ code, message: MESSAGES[code] ?? MESSAGES.bundle_failed }],
    })}\n`,
  );
  process.exitCode = exitCode;
}

function parse(args) {
  if (!args[0] || args[0].startsWith('-')) return null;
  const result = { directory: args[0] };
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith('-')) return null;
    if (flag === '--raw-dir' && result.rawDirectory === undefined) result.rawDirectory = value;
    else if (flag === '--comparison' && result.comparisonId === undefined) result.comparisonId = value;
    else if (flag === '--output' && result.outputDirectory === undefined) result.outputDirectory = value;
    else return null;
  }
  if (!result.rawDirectory || !result.outputDirectory || !/^comparison-[0-9]{6}$/.test(result.comparisonId ?? ''))
    return null;
  return result;
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
    api = await import('../apps/worker/dist/blackbox-observation/access-validation-bundle.js');
  } catch {
    diagnostic('setup_required', 1);
    return;
  }
  const controller = new AbortController();
  const interrupted = () => controller.abort();
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    const resolved = await api.createAccessValidationBundle(parsed.directory, parsed.comparisonId, {
      rawDirectory: parsed.rawDirectory,
      outputDirectory: parsed.outputDirectory,
      signal: controller.signal,
    });
    process.stdout.write(`${JSON.stringify(resolved)}\n`);
  } catch {
    diagnostic('bundle_failed', 1);
  } finally {
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

await main();
