/**
 * Per-command help text.
 *
 * `shannon <command> --help`, `shannon <command> -h`, and `shannon help <command>`
 * all render the matching command's usage, so a user can discover a command's
 * flags without scanning the global help. The global help lives in index.ts.
 */

import { getMode } from './mode.js';

interface CommandHelp {
  readonly usage: readonly string[];
  readonly description: string;
  readonly options?: readonly (readonly [string, string])[];
  readonly examples?: readonly string[];
}

const YES_OPTION: readonly [string, string] = [
  '-y, --yes',
  'Skip the confirmation prompt (required for non-interactive use)',
];
const HELP_OPTION: readonly [string, string] = ['-h, --help', 'Show this help'];

/**
 * `start`'s flags, the single source rendered by both the per-command help here
 * and the global help in index.ts, so the two can never drift.
 */
export const START_OPTIONS: readonly (readonly [string, string])[] = [
  ['-u, --url <url>', 'Target URL (required)'],
  ['-r, --repo <path>', 'Repository path (required)'],
  ['-c, --config <path>', 'Configuration file (YAML)'],
  ['-o, --output <path>', 'Copy deliverables to this directory after the run'],
  ['-w, --workspace <name>', 'Named workspace (auto-resumes if it exists)'],
  ['--pipeline-testing', 'Use minimal prompts for fast testing'],
  ['--debug', 'Preserve the worker container after exit for log inspection'],
];

const COMMAND_HELP: Readonly<Record<string, CommandHelp>> = {
  start: {
    usage: ['start -u <url> -r <path> [options]'],
    description: 'Start a pentest scan.',
    examples: [
      'start -u https://example.com -r ./my-repo',
      'start -u https://example.com -r /path/to/repo -c config.yaml -w q1-audit',
    ],
  },
  stop: {
    usage: ['stop <workspace> [--yes]', 'stop --all [--yes]'],
    description: 'Stop one scan by workspace, or every scan with --all (Temporal stays up).',
    options: [['--all', 'Stop all running scans'], YES_OPTION],
    examples: ['stop q1-audit', 'stop --all'],
  },
  reset: {
    usage: ['reset [--yes]'],
    description: 'Stop everything and permanently remove all Temporal data and volumes.',
    options: [YES_OPTION],
  },
  logs: {
    usage: ['logs <workspace>'],
    description: "Tail a scan's live log until it completes.",
    examples: ['logs q1-audit'],
  },
  status: {
    usage: ['status <workspace>'],
    description:
      "Show one scan's phase-by-phase progress, read live from Temporal. Watches and redraws until the scan finishes on a terminal; prints one frame when piped or already finished.",
    examples: ['status q1-audit'],
  },
  build: {
    usage: ['build [--no-cache]'],
    description: 'Build the worker Docker image (local mode only).',
    options: [['--no-cache', 'Build without using the Docker layer cache']],
  },
  setup: {
    usage: ['setup'],
    description: 'Configure provider credentials interactively (npx mode only).',
  },
  uninstall: {
    usage: ['uninstall [--yes]'],
    description: 'Remove ~/.shannon/ and all data (npx mode only).',
    options: [YES_OPTION],
  },
  version: {
    usage: ['version'],
    description: 'Show the version.',
  },
};

/** Commands that only exist in one mode; everything else is available in both. */
const MODE_ONLY: Readonly<Record<string, 'local' | 'npx'>> = {
  build: 'local',
  setup: 'npx',
  uninstall: 'npx',
};

/** Whether a command has its own help page (and so responds to `--help`/`-h`). */
export function isHelpableCommand(command: string): boolean {
  return command in COMMAND_HELP;
}

/**
 * User-facing command names available in the current mode, for "did you mean?"
 * suggestions. Derived from the same table that backs per-command help, so the
 * suggestion set can never drift from the commands that actually exist.
 */
export function availableCommands(): readonly string[] {
  const mode = getMode();
  const commands = Object.keys(COMMAND_HELP).filter((command) => (MODE_ONLY[command] ?? mode) === mode);
  return [...commands, 'help'];
}

/** Print the help page for one command. No-op if the command has no page. */
export function printCommandHelp(command: string): void {
  const help = COMMAND_HELP[command];
  if (!help) return;

  const prefix = getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon';
  const baseOptions = command === 'start' ? START_OPTIONS : (help.options ?? []);
  const options = [...baseOptions, HELP_OPTION];
  const flagWidth = Math.max(...options.map(([flag]) => flag.length));

  const lines: string[] = ['', help.description, '', 'USAGE'];
  for (const line of help.usage) {
    lines.push(`  ${prefix} ${line}`);
  }

  lines.push('', 'OPTIONS');
  for (const [flag, desc] of options) {
    lines.push(`  ${flag.padEnd(flagWidth)}  ${desc}`);
  }

  if (help.examples && help.examples.length > 0) {
    lines.push('', 'EXAMPLES');
    for (const example of help.examples) {
      lines.push(`  ${prefix} ${example}`);
    }
  }

  lines.push('');
  console.log(lines.join('\n'));
}
