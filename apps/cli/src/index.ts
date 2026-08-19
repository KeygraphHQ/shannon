/**
 * Shannon CLI — AI Penetration Testing Framework
 *
 * Unified CLI supporting two modes:
 *   Local mode: Run from cloned repo — builds locally, mounts prompts, uses ./workspaces/
 *   NPX mode:   Run via npx — pulls from Docker Hub, uses ~/.shannon/
 *
 * Mode is auto-detected based on presence of Dockerfile + docker-compose.yml + prompts/
 * in the current working directory.
 */

import { ArgError, parseArgs, YES_FLAGS } from './args.js';
import { build } from './commands/build.js';
import { logs } from './commands/logs.js';
import { reset } from './commands/reset.js';
import { scans } from './commands/scans.js';
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { status } from './commands/status.js';
import { stop } from './commands/stop.js';
import { crash, fail, failUsage } from './errors.js';
import { availableCommands, isHelpableCommand, printCommandHelp, START_OPTIONS } from './help.js';
import { commandPrefix, getMode, isLocal, type Mode } from './mode.js';
import { displaySplash } from './splash.js';
import { closestMatch } from './suggest.js';
import { getVersion, getVersionLine } from './version.js';

function blockSudo(): void {
  const isSudo = !!process.env.SUDO_USER;
  const isRoot = process.geteuid?.() === 0;
  if (!isSudo && !isRoot) return;

  const linuxHints =
    process.platform === 'linux'
      ? ['Configure Docker to run without sudo first:', 'https://docs.docker.com/engine/install/linux-postinstall']
      : [];

  if (isSudo) {
    fail('Shannon must not be run with sudo.', 'Re-run this command as your normal user.', ...linuxHints);
  }
  fail(
    'Shannon must not be run as the root user.',
    'Switch to a regular user account and re-run this command.',
    ...linuxHints,
  );
}

/** Render `start`'s flags for the global help, from the same source as `start --help`. */
function renderStartOptions(): string {
  const flagWidth = Math.max(...START_OPTIONS.map(([flag]) => flag.length));
  return START_OPTIONS.map(([flag, desc]) => `  ${flag.padEnd(flagWidth)}  ${desc}`).join('\n');
}

/**
 * Render the command list with the description column aligned. Padding is computed from the
 * widest command, so it lines up regardless of the prefix (`npx @keygraph/shannon` vs `./shannon`).
 */
function renderUsage(prefix: string, mode: Mode): string {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ...(mode === 'local' ? [] : [[`${prefix} setup`, 'Configure credentials'] as const]),
    [`${prefix} start --url <url> --repo <path> [options]`, 'Start a pentest scan'],
    [`${prefix} stop <workspace> [--yes]`, 'Stop one scan'],
    [`${prefix} stop --all [--yes]`, 'Stop all scans (Temporal stays up)'],
    [`${prefix} reset`, 'Stop everything and wipe all Temporal data'],
    [`${prefix} logs <workspace>`, "Show a scan's live log"],
    [`${prefix} status <workspace> [--json]`, 'Live phase/agent progress of one scan'],
    [`${prefix} scans [--json]`, 'List completed scans and their reports'],
    ...(mode === 'local' ? [[`${prefix} build [--no-cache]`, 'Build worker image'] as const] : []),
    [`${prefix} version [--json]`, 'Show version'],
    [`${prefix} help`, 'Show this help'],
  ];

  const commandWidth = Math.max(...rows.map(([command]) => command.length));
  return rows.map(([command, desc]) => `  ${command.padEnd(commandWidth)}   ${desc}`).join('\n');
}

function showHelp(withSplash: boolean): void {
  const mode = getMode();
  const prefix = commandPrefix();

  const header = withSplash ? '' : '\nShannon - AI Penetration Testing Framework\n';

  console.log(`${header}
Usage:
${renderUsage(prefix, mode)}

Options for 'start':
${renderStartOptions()}

Examples:
  ${prefix} start -u https://example.com -r ./my-repo
  ${prefix} start -u https://example.com -r /path/to/repo -c config.yaml -w q1-audit
  ${prefix} logs q1-audit
  ${prefix} stop q1-audit
  ${prefix} reset

Run '${prefix} <command> --help' for help on a specific command.

Docs & source: https://github.com/KeygraphHQ/shannon
`);
}

interface ParsedStartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  keepContainer: boolean;
  follow: boolean;
}

function parseStartArgs(argv: string[]): ParsedStartArgs {
  const { flags, values } = parseArgs(argv, {
    values: {
      url: ['-u', '--url'],
      repo: ['-r', '--repo'],
      config: ['-c', '--config'],
      output: ['-o', '--output'],
      workspace: ['-w', '--workspace'],
    },
    booleans: {
      pipelineTesting: ['--pipeline-testing'],
      keepContainer: ['--keep-container'],
      follow: ['-f', '--follow'],
    },
  });

  const url = values.url ?? '';
  const repo = values.repo ?? '';
  if (!url || !repo) {
    failUsage('--url and --repo are required', `Usage: ${commandPrefix()} start -u <url> -r <path>`);
  }

  try {
    new URL(url);
  } catch {
    failUsage(`invalid --url: ${url}`);
  }

  return {
    url,
    repo,
    pipelineTesting: !!flags.pipelineTesting,
    keepContainer: !!flags.keepContainer,
    follow: !!flags.follow,
    ...(values.config && { config: values.config }),
    ...(values.workspace && { workspace: values.workspace }),
    ...(values.output && { output: values.output }),
  };
}

// === Main Dispatch ===

async function main(): Promise<void> {
  // A reader that closes early (e.g. `shannon logs my-scan | head`) makes writes
  // to stdout raise EPIPE. That's normal for a piped CLI, not a crash — exit quietly
  // instead of letting Node dump an unhandled-error stack trace.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });

  blockSudo();

  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    const topic = rest[0];
    if (topic && isHelpableCommand(topic)) {
      printCommandHelp(topic);
    } else {
      const bare = command === undefined;
      if (bare) displaySplash(isLocal() ? undefined : getVersion());
      showHelp(bare);
    }
    return;
  }

  // Reachable from any invocation: `-h`/`--help` anywhere wins over the rest of the line.
  if (isHelpableCommand(command) && (rest.includes('-h') || rest.includes('--help'))) {
    printCommandHelp(command);
    return;
  }

  switch (command) {
    case 'start': {
      const parsed = parseStartArgs(rest);
      await start({ ...parsed, version: getVersion() });
      break;
    }
    case 'stop': {
      const { flags, positionals } = parseArgs(rest, {
        booleans: { all: ['--all'], yes: YES_FLAGS },
        maxPositionals: 1,
      });
      await stop({ all: !!flags.all, yes: !!flags.yes, ...(positionals[0] && { workspace: positionals[0] }) });
      break;
    }
    case 'reset': {
      // reset is all-or-nothing; a stray name likely means the user wanted `stop <name>`.
      parseArgs(rest, {
        positionalHint: 'reset takes no workspace argument. To stop one scan, use: stop <name>',
      });
      await reset();
      break;
    }
    case 'logs': {
      const { positionals } = parseArgs(rest, { maxPositionals: 1 });
      const workspaceId = positionals[0];
      if (!workspaceId) {
        failUsage('Workspace ID is required', `Usage: ${commandPrefix()} logs <workspace>`);
      }
      logs(workspaceId);
      break;
    }
    case 'status': {
      const { flags, positionals } = parseArgs(rest, { booleans: { json: ['--json'] }, maxPositionals: 1 });
      const workspaceId = positionals[0];
      if (!workspaceId) {
        failUsage('Workspace is required', `Usage: ${commandPrefix()} status <workspace> [--json]`);
      }
      await status(workspaceId, { json: !!flags.json });
      break;
    }
    case 'scans': {
      const { flags } = parseArgs(rest, { booleans: { json: ['--json'] } });
      scans({ json: !!flags.json });
      break;
    }
    case 'setup':
      if (getMode() === 'local') {
        fail('setup is only available in npx mode. In local mode, use .env');
      }
      parseArgs(rest, {});
      await setup();
      break;
    case 'build': {
      const { flags } = parseArgs(rest, { booleans: { noCache: ['--no-cache'] } });
      build(!!flags.noCache, getVersion());
      break;
    }
    case 'version':
    case '--version':
    case '-v': {
      const { flags } = parseArgs(rest, { booleans: { json: ['--json'] } });
      if (flags.json) {
        console.log(JSON.stringify({ version: getVersion(), mode: getMode() }, null, 2));
      } else {
        console.log(getVersionLine());
      }
      break;
    }
    default: {
      const prefix = commandPrefix();
      const suggestion = closestMatch(command, availableCommands());
      const hints = [
        ...(suggestion ? [`Did you mean '${suggestion}'?`] : []),
        `Run '${prefix} help' to see available commands.`,
      ];
      failUsage(`Unknown command: ${command}`, ...hints);
    }
  }
}

main().catch((err) => {
  if (err instanceof ArgError) {
    failUsage(err.message, `Run "${commandPrefix()} help" for usage`);
  }
  crash(err);
});
