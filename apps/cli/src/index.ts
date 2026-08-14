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
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { status } from './commands/status.js';
import { stop } from './commands/stop.js';
import { uninstall } from './commands/uninstall.js';
import { crash, fail } from './errors.js';
import { availableCommands, isHelpableCommand, printCommandHelp, START_OPTIONS } from './help.js';
import { getMode } from './mode.js';
import { closestMatch } from './suggest.js';
import { getVersion, getVersionLine } from './version.js';

function blockSudo(): void {
  const isSudo = !!process.env.SUDO_USER;
  const isRoot = process.geteuid?.() === 0;
  if (!isSudo && !isRoot) return;

  if (isSudo) {
    console.error('ERROR: Shannon must not be run with sudo.');
    console.error('Re-run this command as your normal user.');
  } else {
    console.error('ERROR: Shannon must not be run as the root user.');
    console.error('Switch to a regular user account and re-run this command.');
  }
  if (process.platform === 'linux') {
    console.error('Configure Docker to run without sudo first:');
    console.error('https://docs.docker.com/engine/install/linux-postinstall');
  }
  process.exit(1);
}

/** Render `start`'s flags for the global help, from the same source as `start --help`. */
function renderStartOptions(): string {
  const flagWidth = Math.max(...START_OPTIONS.map(([flag]) => flag.length));
  return START_OPTIONS.map(([flag, desc]) => `  ${flag.padEnd(flagWidth)}  ${desc}`).join('\n');
}

function showHelp(): void {
  const mode = getMode();
  const prefix = mode === 'local' ? './shannon' : 'npx @keygraph/shannon';

  console.log(`
Shannon - AI Penetration Testing Framework

Usage:${
    mode === 'local'
      ? ''
      : `
  ${prefix} setup                                       Configure credentials`
  }
  ${prefix} start --url <url> --repo <path> [options]   Start a pentest scan
  ${prefix} stop <workspace> [--yes]                     Stop one scan
  ${prefix} stop --all [--yes]                            Stop all scans (Temporal stays up)
  ${prefix} reset [--yes]                                 Stop everything and wipe all Temporal data
  ${prefix} logs <workspace>                             Show a scan's live log
  ${prefix} status <workspace>                           Live phase/agent progress of one scan${
    mode === 'local'
      ? `
  ${prefix} build [--no-cache]                           Build worker image`
      : `
  ${prefix} uninstall [--yes]                            Remove ~/.shannon/ and all data`
  }
  ${prefix} version                                      Show version
  ${prefix} help                                         Show this help

Options for 'start':
${renderStartOptions()}

Examples:
  ${prefix} start -u https://example.com -r ./my-repo
  ${prefix} start -u https://example.com -r /path/to/repo -c config.yaml -w q1-audit
  ${prefix} logs q1-audit
  ${prefix} stop q1-audit
  ${prefix} reset

Run '${prefix} <command> --help' for help on a specific command.
${
  mode === 'local'
    ? `
State directory: ./workspaces/`
    : `
State directory: ~/.shannon/`
}
Monitor scans at http://localhost:8233
`);
}

interface ParsedStartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  debug: boolean;
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
      debug: ['--debug'],
    },
  });

  const url = values.url ?? '';
  const repo = values.repo ?? '';
  if (!url || !repo) {
    fail(
      '--url and --repo are required',
      `Usage: ${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} start -u <url> -r <path>`,
    );
  }

  try {
    new URL(url);
  } catch {
    fail(`invalid --url: ${url}`);
  }

  return {
    url,
    repo,
    pipelineTesting: !!flags.pipelineTesting,
    debug: !!flags.debug,
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
      showHelp();
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
      const { flags } = parseArgs(rest, {
        booleans: { yes: YES_FLAGS },
        positionalHint: 'reset takes no workspace argument. To stop one scan, use: stop <name>',
      });
      await reset({ yes: !!flags.yes });
      break;
    }
    case 'logs': {
      const { positionals } = parseArgs(rest, { maxPositionals: 1 });
      const workspaceId = positionals[0];
      if (!workspaceId) {
        fail(
          'Workspace ID is required',
          `Usage: ${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} logs <workspace>`,
        );
      }
      logs(workspaceId);
      break;
    }
    case 'status': {
      const { positionals } = parseArgs(rest, { maxPositionals: 1 });
      const workspaceId = positionals[0];
      if (!workspaceId) {
        fail(
          'Workspace is required',
          `Usage: ${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} status <workspace>`,
        );
      }
      await status(workspaceId);
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
    case 'uninstall': {
      if (getMode() === 'local') {
        fail('uninstall is only available in npx mode.');
      }
      const { flags } = parseArgs(rest, { booleans: { yes: YES_FLAGS } });
      await uninstall(!!flags.yes);
      break;
    }
    case 'version':
    case '--version':
    case '-v':
      console.log(getVersionLine());
      break;
    default: {
      const prefix = getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon';
      const suggestion = closestMatch(command, availableCommands());
      console.error(`Unknown command: ${command}`);
      if (suggestion) {
        console.error(`Did you mean '${suggestion}'?`);
      }
      console.error(`Run '${prefix} help' to see available commands.`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  if (err instanceof ArgError) {
    fail(err.message, `Run "${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} help" for usage`);
  }
  crash(err);
});
