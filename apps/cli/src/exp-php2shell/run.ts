/**
 * CLI-native entry point for the experimental php2shell probe (`--exp-php2shell`).
 *
 * This runs entirely in the CLI. It does not start the worker, Temporal, or Docker. It shows an
 * upgrade banner and a confirmation prompt, sends the probe against the one target URL, prints the
 * verdict, and optionally writes a JSON report for integration. The process exit code is non-zero
 * when the crash vector was detected, so CI can gate on it. To test more than one path, run it once
 * per URL.
 */

import fs from 'node:fs';
import path from 'node:path';
import { confirmOrExit } from '../confirm.js';
import { PATCHED_BRANCHES } from './php-version.js';
import { runPhp2shellProbe } from './probe.js';
import type { Php2shellProbeVerdict, Php2shellReport } from './types.js';

export interface ExpPhp2shellArgs {
  readonly url: string;
  readonly output?: string;
  readonly yes: boolean;
}

/** Fixed releases, oldest first, for the banner. */
function fixedVersions(): string {
  return [...PATCHED_BRANCHES]
    .map((branch) => branch.firstFixed)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join(' / ');
}

const VERDICT_LABEL: Readonly<Record<Php2shellProbeVerdict, string>> = {
  detected: 'DETECTED',
  not_detected: 'NOT DETECTED',
  inconclusive: 'INCONCLUSIVE',
};

/** Print the upgrade banner and the crash warning, then require confirmation unless --yes. */
async function confirmRun(url: string, yes: boolean): Promise<void> {
  console.error('');
  console.error(`  Upgrade PHP immediately. Fixed versions: ${fixedVersions()}`);
  console.error('');
  console.error(`  The probe sends a crafted request to ${url} that is designed to crash one PHP`);
  console.error('  worker process. The worker respawns in milliseconds, but this is a real, brief');
  console.error('  disruption. It never attempts the second-stage code execution. Run it against');
  console.error('  staging or local development, not production, unless you are authorized.');
  console.error('');
  await confirmOrExit('exp-php2shell', 'Proceed with the php2shell probe?', yes);
}

function printReport(report: Php2shellReport): void {
  const label = VERDICT_LABEL[report.verdict];
  const version = report.version ? `  ${report.version.rawValue} [${report.version.verdict}]` : '';
  console.log('');
  console.log(`php2shell probe: ${report.url}`);
  console.log('');
  console.log(`  ${label}  (${report.signal})${version}`);
  console.log('');
  console.log(`Upgrade PHP to a fixed release (${fixedVersions()}) regardless of this result.`);

  if (report.caveats.length > 0) {
    console.log('');
    console.log('Caveats:');
    for (const caveat of report.caveats) {
      console.log(`  - ${caveat}`);
    }
  }
}

/** Write the full report as JSON into the output directory, for integration into a larger system. */
function writeJsonReport(outputDir: string, report: Php2shellReport): void {
  const resolved = path.resolve(outputDir);
  fs.mkdirSync(resolved, { recursive: true });
  const file = path.join(resolved, 'php2shell-report.json');
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('');
  console.log(`Report written to ${file}`);
}

/** The single CLI-native probe function. Confirms, probes, prints, and optionally writes JSON. */
export async function runExpPhp2shell(args: ExpPhp2shellArgs): Promise<void> {
  await confirmRun(args.url, args.yes);

  const logger = {
    info: (message: string) => console.error(message),
    warn: (message: string) => console.error(message),
    error: (message: string) => console.error(message),
  };
  const report = await runPhp2shellProbe({ url: args.url, logger });

  printReport(report);
  if (args.output) {
    writeJsonReport(args.output, report);
  }

  // Non-zero exit when the crash vector was detected, so CI can gate on it.
  if (report.verdict === 'detected') {
    process.exitCode = 1;
  }
}
