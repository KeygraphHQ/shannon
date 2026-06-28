import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureImage, ensureInfra, randomSuffix, spawnWorker } from '../docker.js';
import { buildEnvFlags, loadEnv, validateCredentials } from '../env.js';
import { getWorkspacesDir, initHome } from '../home.js';
import { getMode } from '../mode.js';
import { resolveRepo } from '../paths.js';
import { fetchProgram } from '../programs/fetcher.js';
import { parseProgram } from '../programs/parser.js';
import { listPrograms, loadProgram, saveProgram } from '../programs/store.js';
import type { BountyConfig, ProgramConfig } from '../programs/types.js';
import { displaySplash } from '../splash.js';

export interface BountyStartArgs {
  url: string;
  repo: string;
  program: string;
  refreshProgram: boolean;
  workspace?: string | undefined;
  output?: string | undefined;
  pipelineTesting: boolean;
  debug: boolean;
  version: string;
}

function convertScopeToRules(config: ProgramConfig): BountyConfig['rules'] {
  const focus = config.in_scope_domains.map((d) => ({
    type: 'domain' as const,
    value: d,
    description: `In-scope domain: ${d}`,
  }));
  const avoid = config.out_of_scope_patterns.map((p) => ({
    type: 'url_path' as const,
    value: p,
    description: `Out-of-scope pattern: ${p}`,
  }));
  return { focus, avoid };
}

export async function bountyStart(args: BountyStartArgs): Promise<void> {
  initHome();
  loadEnv();
  const creds = validateCredentials();
  if (!creds.valid) {
    console.error(`ERROR: ${creds.error}`);
    process.exit(1);
  }

  let programConfig: ProgramConfig;

  if (args.refreshProgram || !loadProgram(path.basename(args.program).replace(/\.(txt|json|html?)$/, ''))) {
    const { text, source } = await fetchProgram(args.program);
    console.error(`Fetched program from ${source}`);
    programConfig = await parseProgram(text);
    saveProgram(programConfig, source);
    console.error(`Parsed program: ${programConfig.name}`);
  } else {
    const stored = loadProgram(path.basename(args.program).replace(/\.(txt|json|html?)$/, ''));
    if (!stored) throw new Error('Program not found');
    programConfig = stored.config;
    console.error(`Loaded cached program: ${programConfig.name}`);
  }

  const repo = resolveRepo(args.repo);
  const rules = convertScopeToRules(programConfig);
  const bountyConfig: BountyConfig = { program: programConfig, rules };

  const workspacesDir = getWorkspacesDir();
  fs.mkdirSync(workspacesDir, { recursive: true });
  fs.chmodSync(workspacesDir, 0o777);

  ensureImage(args.version);
  await ensureInfra();

  const suffix = randomSuffix();
  const taskQueue = `shannon-${suffix}`;
  const containerName = `shannon-worker-${suffix}`;
  const workspace =
    args.workspace ?? `bounty_${programConfig.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}_${Date.now()}`;
  const workspacePath = path.join(workspacesDir, workspace);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.chmodSync(workspacePath, 0o777);
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli', '.playwright']) {
    const dirPath = path.join(workspacePath, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.chmodSync(dirPath, 0o777);
  }

  const shannonDir = path.join(repo.hostPath, '.shannon');
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli']) {
    fs.mkdirSync(path.join(shannonDir, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(repo.hostPath, '.playwright'), { recursive: true });

  const credentialsPath = path.join(workspacesDir, '..', 'credentials', 'google-sa-key.json');
  const hasCredentials = fs.existsSync(credentialsPath);

  if (hasCredentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/app/credentials/google-sa-key.json';
  }

  const outputDir = args.output ? path.resolve(args.output) : undefined;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const promptsDir = getMode() === 'local' ? path.resolve('apps/worker/prompts') : undefined;

  displaySplash(getMode() === 'local' ? undefined : args.version);
  printBountyInfo(programConfig, workspace);

  const proc = spawnWorker({
    version: args.version,
    url: args.url,
    repo,
    workspacesDir,
    taskQueue,
    containerName,
    envFlags: buildEnvFlags(),
    ...(hasCredentials && { credentials: credentialsPath }),
    ...(promptsDir && { promptsDir }),
    ...(outputDir && { outputDir }),
    workspace,
    bountyConfig,
    ...(args.pipelineTesting && { pipelineTesting: true }),
    ...(args.debug && { debug: true }),
  });

  const dockerExitCode = await new Promise<number>((resolve) => {
    proc.once('exit', (code) => resolve(code ?? 1));
    proc.once('error', (err) => {
      console.error(`Failed to start worker: ${err.message}`);
      resolve(1);
    });
  });

  if (dockerExitCode !== 0) process.exit(1);

  const sessionJson = path.join(workspacesDir, workspace, 'session.json');
  process.stdout.write('Waiting for workflow to start...');
  let started = false;
  let attempts = 0;
  const pollInterval = setInterval(() => {
    attempts++;
    if (attempts > 60) {
      clearInterval(pollInterval);
      process.stdout.write('\n');
      console.error('Timeout waiting for workflow to start');
      process.exit(1);
    }
    try {
      const session = JSON.parse(fs.readFileSync(sessionJson, 'utf-8'));
      if (session.session?.originalWorkflowId || (session.session?.resumeAttempts?.length ?? 0) > 0) {
        clearInterval(pollInterval);
        started = true;
        process.stdout.write('\r\x1b[K');
        console.log(`  Workflow started. Monitor at http://localhost:8233`);
        return;
      }
    } catch {}
    process.stdout.write('.');
  }, 2000);

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned || started) return;
    cleaned = true;
    clearInterval(pollInterval);
    console.log(`\nStopping worker ${containerName}...`);
    try {
      execFileSync('docker', ['stop', containerName], { stdio: 'pipe' });
    } catch {}
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);
}

function printBountyInfo(program: ProgramConfig, workspace: string): void {
  console.log(`  Bounty Program: ${program.name} (${program.platform})`);
  console.log(`  In-scope: ${program.in_scope_domains.length} domains`);
  console.log(`  Out-of-scope: ${program.out_of_scope_patterns.length} patterns`);
  if (program.active_campaign) {
    console.log(`  Active Campaign: ${program.active_campaign.asset || 'N/A'}`);
    if (program.active_campaign.multipliers) {
      for (const [sev, mult] of Object.entries(program.active_campaign.multipliers)) {
        console.log(`    ${sev}: ${mult}x`);
      }
    }
  }
  console.log(`  Workspace: ${workspace}`);
  console.log('');
}

export function bountyList(): void {
  const programs = listPrograms();
  if (programs.length === 0) {
    console.log('No saved programs found.');
    return;
  }
  console.log('Saved bounty programs:');
  for (const p of programs) {
    console.log(`  ${p.slug}: ${p.config.name} (${p.config.platform})`);
    if (p.source_url) console.log(`    URL: ${p.source_url}`);
    console.log(`    Saved: ${p.created_at}`);
  }
}

export function showBountyHelp(): void {
  const prefix = getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon';
  console.log(`
Usage:
  ${prefix} bounty start -u <url> -r <path> --program <file|url> [options]
  ${prefix} bounty list
  ${prefix} bounty --help

Start a bug-bounty-mode scan:
  -u, --url <url>           Target URL (required)
  -r, --repo <path>         Repository path (required)
  -p, --program <file|url>  Bug bounty program page URL or file path (required)
      --refresh-program     Re-fetch and re-parse program config
  -w, --workspace <name>    Named workspace
  -o, --output <path>       Output directory
      --pipeline-testing    Minimal prompts for fast testing
      --debug               Preserve worker container after exit
`);
}
