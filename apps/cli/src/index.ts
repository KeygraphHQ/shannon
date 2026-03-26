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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './commands/build.js';
import { logs } from './commands/logs.js';
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { status } from './commands/status.js';
import { stop } from './commands/stop.js';
import { uninstall } from './commands/uninstall.js';
import { workspaces } from './commands/workspaces.js';
import { getMode } from './mode.js';
import { displaySplash } from './splash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
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
  ${prefix} stop [--clean]                               Stop all containers
  ${prefix} workspaces                                   List all workspaces
  ${prefix} logs <workspace>                             Tail workflow log
  ${prefix} status                                       Show running workers${
    mode === 'local'
      ? `
  ${prefix} build [--no-cache]                           Build worker image`
      : `
  ${prefix} uninstall                                    Remove ~/.shannon/ and all data`
  }
  ${prefix} info                                         Show splash screen
  ${prefix} help                                         Show this help

Options for 'start':
  -u, --url <url>           Target URL (required)
  -r, --repo <path>         Repository path${mode === 'local' ? ' or bare name' : ''} (required)
  -c, --config <path>       Configuration file (YAML)
  -o, --output <path>       Copy deliverables to this directory after run
  -w, --workspace <name>    Named workspace (auto-resumes if exists)
      --pipeline-testing    Use minimal prompts for fast testing
      --router              Route requests through claude-code-router

Examples:
  ${prefix} start -u https://example.com -r ${mode === 'local' ? 'my-repo' : './my-repo'}
  ${prefix} start -u https://example.com -r /path/to/repo -c config.yaml -w q1-audit
  ${prefix} logs q1-audit
  ${prefix} stop --clean
${
  mode === 'local'
    ? `
State directory: ./workspaces/`
    : `
State directory: ~/.shannon/`
}
Monitor workflows at http://localhost:8233
`);
}

interface ParsedStartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  router: boolean;
}

function parseStartArgs(argv: string[]): ParsedStartArgs {
  let url = '';
  let repo = '';
  let config: string | undefined;
  let workspace: string | undefined;
  let output: string | undefined;
  let pipelineTesting = false;
  let router = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '-u':
      case '--url':
        if (next && !next.startsWith('-')) {
          url = next;
          i++;
        }
        break;
      case '-r':
      case '--repo':
        if (next && !next.startsWith('-')) {
          repo = next;
          i++;
        }
        break;
      case '-c':
      case '--config':
        if (next && !next.startsWith('-')) {
          config = next;
          i++;
        }
        break;
      case '-w':
      case '--workspace':
        if (next && !next.startsWith('-')) {
          workspace = next;
          i++;
        }
        break;
      case '-o':
      case '--output':
        if (next && !next.startsWith('-')) {
          output = next;
          i++;
        }
        break;
      case '--pipeline-testing':
        pipelineTesting = true;
        break;
      case '--router':
        router = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.error(`Run "${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} help" for usage`);
        process.exit(1);
    }
  }

  if (!url || !repo) {
    console.error('ERROR: --url and --repo are required');
    console.error(`Usage: ${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} start -u <url> -r <path>`);
    process.exit(1);
  }

  return {
    url,
    repo,
    pipelineTesting,
    router,
    ...(config && { config }),
    ...(workspace && { workspace }),
    ...(output && { output }),
  };
}

// === Main Dispatch ===

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'start': {
    const parsed = parseStartArgs(args.slice(1));
    await start({ ...parsed, version: getVersion() });
    break;
  }
  case 'stop':
    stop(args.includes('--clean'));
    break;
  case 'logs': {
    const workspaceId = args[1];
    if (!workspaceId) {
      console.error('ERROR: Workspace ID is required');
      console.error(`Usage: ${getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon'} logs <workspace>`);
      process.exit(1);
    }
    logs(workspaceId);
    break;
  }
  case 'workspaces':
    workspaces(getVersion());
    break;
  case 'status':
    status();
    break;
  case 'setup':
    if (getMode() === 'local') {
      console.error('ERROR: setup is only available in npx mode. In local mode, use .env');
      process.exit(1);
    }
    setup();
    break;
  case 'build':
    build(args.includes('--no-cache'));
    break;
  case 'uninstall':
    if (getMode() === 'local') {
      console.error('ERROR: uninstall is only available in npx mode.');
      process.exit(1);
    }
    uninstall();
    break;
  case 'info':
    displaySplash(getMode() === 'local' ? undefined : getVersion());
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
