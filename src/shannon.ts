#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { path, fs, $ } from 'zx';
import chalk, { type ChalkInstance } from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Config and Tools
import { parseConfig, distributeConfig } from './config-parser.js';
import { checkToolAvailability, handleMissingTools } from './tool-checker.js';

// Session
import { AGENTS, getParallelGroups } from './session-manager.js';
import type { AgentName, PromptName } from './types/index.js';

// Setup and Deliverables
import { setupLocalRepo } from './setup/environment.js';

// AI and Prompts
import { runClaudePromptWithRetry } from './ai/claude-executor.js';
import { loadPrompt } from './prompts/prompt-manager.js';

// Phases
import { executePreReconPhase } from './phases/pre-recon.js';
import { assembleFinalReport } from './phases/reporting.js';
import { generateFindingsArtifacts } from './findings/runner.js';

// Utils
import { timingResults, displayTimingSummary, Timer } from './utils/metrics.js';
import { formatDuration, generateAuditPath } from './audit/utils.js';
import type { SessionMetadata } from './audit/utils.js';
import { AuditSession } from './audit/audit-session.js';

// CLI
import { showHelp, displaySplashScreen } from './cli/ui.js';
import { validateWebUrl, validateRepoPath } from './cli/input-validator.js';

// Error Handling
import { PentestError, logError } from './error-handling.js';

import type { DistributedConfig } from './types/config.js';
import type { Config } from './types/config.js';
import type { ToolAvailability } from './tool-checker.js';
import { safeValidateQueueAndDeliverable } from './queue-validation.js';
import { computeCiExitCode, resolveCiOptions, type CiOptions } from './ci/index.js';
import { runIntegrations } from './integrations/index.js';

// Extend global namespace for SHANNON_DISABLE_LOADER
declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

// Session Lock File Management
const STORE_PATH = path.join(process.cwd(), '.shannon-store.json');

interface Session {
  id: string;
  webUrl: string;
  repoPath: string;
  status: 'in-progress' | 'completed' | 'failed';
  startedAt: string;
}

interface SessionStore {
  sessions: Session[];
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

async function loadSessions(): Promise<SessionStore> {
  try {
    if (await fs.pathExists(STORE_PATH)) {
      return await fs.readJson(STORE_PATH) as SessionStore;
    }
  } catch {
    // Corrupted file, start fresh
  }
  return { sessions: [] };
}

async function saveSessions(store: SessionStore): Promise<void> {
  await fs.writeJson(STORE_PATH, store, { spaces: 2 });
}

async function createSession(webUrl: string, repoPath: string): Promise<Session> {
  const store = await loadSessions();

  // Check for existing in-progress session
  const existing = store.sessions.find(
    s => s.repoPath === repoPath && s.status === 'in-progress'
  );
  if (existing) {
    throw new PentestError(
      `Session already in progress for ${repoPath}`,
      'validation',
      false,
      { sessionId: existing.id }
    );
  }

  const session: Session = {
    id: generateSessionId(),
    webUrl,
    repoPath,
    status: 'in-progress',
    startedAt: new Date().toISOString()
  };

  store.sessions.push(session);
  await saveSessions(store);
  return session;
}

async function updateSessionStatus(
  sessionId: string,
  status: 'in-progress' | 'completed' | 'failed'
): Promise<void> {
  const store = await loadSessions();
  const session = store.sessions.find(s => s.id === sessionId);
  if (session) {
    session.status = status;
    await saveSessions(store);
  }
}

interface PromptVariables {
  webUrl: string;
  repoPath: string;
  sourceDir: string;
}

interface MainResult {
  reportPath: string;
  auditLogsPath: string;
  findingsPath?: string;
  compliancePath?: string;
  sarifPath?: string;
  gitlabPath?: string;
  ciExitCode?: number;
}

interface AgentResult {
  success: boolean;
  duration: number;
  cost?: number;
  error?: string;
  retryable?: boolean;
}

interface ParallelAgentResult {
  agentName: AgentName;
  success: boolean;
  timing?: number | undefined;
  cost?: number | undefined;
  attempts: number;
  error?: string | undefined;
}

// Configure zx to disable timeouts (let tools run as long as needed)
$.timeout = 0;

// Helper function to get prompt name from agent name
const getPromptName = (agentName: AgentName): PromptName => {
  const mappings: Record<AgentName, PromptName> = {
    'pre-recon': 'pre-recon-code',
    'recon': 'recon',
    'injection-vuln': 'vuln-injection',
    'xss-vuln': 'vuln-xss',
    'auth-vuln': 'vuln-auth',
    'ssrf-vuln': 'vuln-ssrf',
    'authz-vuln': 'vuln-authz',
    'injection-exploit': 'exploit-injection',
    'xss-exploit': 'exploit-xss',
    'auth-exploit': 'exploit-auth',
    'ssrf-exploit': 'exploit-ssrf',
    'authz-exploit': 'exploit-authz',
    'report': 'report-executive',
    'report-findings': 'report-findings'
  };

  return mappings[agentName] || agentName as PromptName;
};

// Get color function for agent
const getAgentColor = (agentName: AgentName): ChalkInstance => {
  const colorMap: Partial<Record<AgentName, ChalkInstance>> = {
    'injection-vuln': chalk.red,
    'injection-exploit': chalk.red,
    'xss-vuln': chalk.yellow,
    'xss-exploit': chalk.yellow,
    'auth-vuln': chalk.blue,
    'auth-exploit': chalk.blue,
    'ssrf-vuln': chalk.magenta,
    'ssrf-exploit': chalk.magenta,
    'authz-vuln': chalk.green,
    'authz-exploit': chalk.green
  };
  return colorMap[agentName] || chalk.cyan;
};

/**
 * Consolidate deliverables from target repo into the session folder
 */
async function consolidateOutputs(sourceDir: string, sessionPath: string): Promise<void> {
  const srcDeliverables = path.join(sourceDir, 'deliverables');
  const destDeliverables = path.join(sessionPath, 'deliverables');

  try {
    if (await fs.pathExists(srcDeliverables)) {
      await fs.copy(srcDeliverables, destDeliverables, { overwrite: true });
      console.log(chalk.gray(`📄 Deliverables copied to session folder`));
    } else {
      console.log(chalk.yellow(`⚠️ No deliverables directory found at ${srcDeliverables}`));
    }
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ Failed to consolidate deliverables: ${err.message}`));
  }
}

/**
 * Run a single agent
 */
async function runAgent(
  agentName: AgentName,
  sourceDir: string,
  variables: PromptVariables,
  distributedConfig: DistributedConfig | null,
  pipelineTestingMode: boolean,
  sessionMetadata: SessionMetadata
): Promise<AgentResult> {
  const agent = AGENTS[agentName];
  const promptName = getPromptName(agentName);
  const prompt = await loadPrompt(promptName, variables, distributedConfig, pipelineTestingMode);

  return await runClaudePromptWithRetry(
    prompt,
    sourceDir,
    '*',
    '',
    agent.displayName,
    agentName,
    getAgentColor(agentName),
    sessionMetadata
  );
}

/**
 * Run vulnerability agents in parallel
 */
async function runParallelVuln(
  sourceDir: string,
  variables: PromptVariables,
  distributedConfig: DistributedConfig | null,
  pipelineTestingMode: boolean,
  sessionMetadata: SessionMetadata
): Promise<ParallelAgentResult[]> {
  const { vuln: vulnAgents } = getParallelGroups();

  console.log(chalk.cyan(`\nStarting ${vulnAgents.length} vulnerability analysis specialists in parallel...`));
  console.log(chalk.gray('    Specialists: ' + vulnAgents.join(', ')));
  console.log();

  const startTime = Date.now();

  const results = await Promise.allSettled(
    vulnAgents.map(async (agentName, index) => {
      // Add 2-second stagger to prevent API overwhelm
      await new Promise(resolve => setTimeout(resolve, index * 2000));

      let lastError: Error | undefined;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const result = await runAgent(
            agentName,
            sourceDir,
            variables,
            distributedConfig,
            pipelineTestingMode,
            sessionMetadata
          );

          // Validate vulnerability analysis results
          const vulnType = agentName.replace('-vuln', '');
          try {
            const validation = await safeValidateQueueAndDeliverable(vulnType as 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz', sourceDir);

            if (validation.success && validation.data) {
              console.log(chalk.blue(`${agentName}: ${validation.data.shouldExploit ? `Ready for exploitation (${validation.data.vulnerabilityCount} vulnerabilities)` : 'No vulnerabilities found'}`));
            }
          } catch {
            // Validation failure is non-critical
          }

          return {
            agentName,
            success: result.success,
            timing: result.duration,
            cost: result.cost,
            attempts
          };
        } catch (error) {
          lastError = error as Error;
          if (attempts < maxAttempts) {
            console.log(chalk.yellow(`Warning: ${agentName} failed attempt ${attempts}/${maxAttempts}, retrying...`));
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      return {
        agentName,
        success: false,
        attempts,
        error: lastError?.message || 'Unknown error'
      };
    })
  );

  const totalDuration = Date.now() - startTime;

  // Process and display results
  console.log(chalk.cyan('\nVulnerability Analysis Results'));
  console.log(chalk.gray('-'.repeat(80)));
  console.log(chalk.bold('Agent                  Status     Attempt  Duration    Cost'));
  console.log(chalk.gray('-'.repeat(80)));

  const processedResults: ParallelAgentResult[] = [];

  results.forEach((result, index) => {
    const agentName = vulnAgents[index]!;
    const agentDisplay = agentName.padEnd(22);

    if (result.status === 'fulfilled') {
      const data = result.value;
      processedResults.push(data);

      if (data.success) {
        const duration = formatDuration(data.timing || 0);
        const cost = `$${(data.cost || 0).toFixed(4)}`;

        console.log(
          `${chalk.green(agentDisplay)} ${chalk.green('Success')}    ` +
          `${data.attempts}/3      ${duration.padEnd(11)} ${cost}`
        );
      } else {
        console.log(
          `${chalk.red(agentDisplay)} ${chalk.red('Failed ')}    ` +
          `${data.attempts}/3      -           -`
        );
        if (data.error) {
          console.log(chalk.gray(`  Error: ${data.error.substring(0, 60)}...`));
        }
      }
    } else {
      processedResults.push({
        agentName,
        success: false,
        attempts: 3,
        error: String(result.reason)
      });

      console.log(
        `${chalk.red(agentDisplay)} ${chalk.red('Failed ')}    ` +
        `3/3      -           -`
      );
    }
  });

  console.log(chalk.gray('-'.repeat(80)));
  const successCount = processedResults.filter(r => r.success).length;
  console.log(chalk.cyan(`Summary: ${successCount}/${vulnAgents.length} succeeded in ${formatDuration(totalDuration)}`));

  return processedResults;
}

/**
 * Run exploitation agents in parallel
 */
async function runParallelExploit(
  sourceDir: string,
  variables: PromptVariables,
  distributedConfig: DistributedConfig | null,
  pipelineTestingMode: boolean,
  sessionMetadata: SessionMetadata
): Promise<ParallelAgentResult[]> {
  const { exploit: exploitAgents, vuln: vulnAgents } = getParallelGroups();

  // Load validation module
  const { safeValidateQueueAndDeliverable } = await import('./queue-validation.js');

  // Check eligibility
  const eligibilityChecks = await Promise.all(
    exploitAgents.map(async (agentName) => {
      const vulnAgentName = agentName.replace('-exploit', '-vuln') as AgentName;
      const vulnType = vulnAgentName.replace('-vuln', '') as 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz';

      const validation = await safeValidateQueueAndDeliverable(vulnType, sourceDir);

      if (!validation.success || !validation.data?.shouldExploit) {
        console.log(chalk.gray(`Skipping ${agentName} (no vulnerabilities found in ${vulnAgentName})`));
        return { agentName, eligible: false };
      }

      console.log(chalk.blue(`${agentName} eligible (${validation.data.vulnerabilityCount} vulnerabilities from ${vulnAgentName})`));
      return { agentName, eligible: true };
    })
  );

  const eligibleAgents = eligibilityChecks
    .filter(check => check.eligible)
    .map(check => check.agentName);

  if (eligibleAgents.length === 0) {
    console.log(chalk.gray('No exploitation agents eligible (no vulnerabilities found)'));
    return [];
  }

  console.log(chalk.cyan(`\nStarting ${eligibleAgents.length} exploitation specialists in parallel...`));
  console.log(chalk.gray('    Specialists: ' + eligibleAgents.join(', ')));
  console.log();

  const startTime = Date.now();

  const results = await Promise.allSettled(
    eligibleAgents.map(async (agentName, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 2000));

      let lastError: Error | undefined;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const result = await runAgent(
            agentName,
            sourceDir,
            variables,
            distributedConfig,
            pipelineTestingMode,
            sessionMetadata
          );

          return {
            agentName,
            success: result.success,
            timing: result.duration,
            cost: result.cost,
            attempts
          };
        } catch (error) {
          lastError = error as Error;
          if (attempts < maxAttempts) {
            console.log(chalk.yellow(`Warning: ${agentName} failed attempt ${attempts}/${maxAttempts}, retrying...`));
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      return {
        agentName,
        success: false,
        attempts,
        error: lastError?.message || 'Unknown error'
      };
    })
  );

  const totalDuration = Date.now() - startTime;

  // Process and display results
  console.log(chalk.cyan('\nExploitation Results'));
  console.log(chalk.gray('-'.repeat(80)));
  console.log(chalk.bold('Agent                  Status     Attempt  Duration    Cost'));
  console.log(chalk.gray('-'.repeat(80)));

  const processedResults: ParallelAgentResult[] = [];

  results.forEach((result, index) => {
    const agentName = eligibleAgents[index]!;
    const agentDisplay = agentName.padEnd(22);

    if (result.status === 'fulfilled') {
      const data = result.value;
      processedResults.push(data);

      if (data.success) {
        const duration = formatDuration(data.timing || 0);
        const cost = `$${(data.cost || 0).toFixed(4)}`;

        console.log(
          `${chalk.green(agentDisplay)} ${chalk.green('Success')}    ` +
          `${data.attempts}/3      ${duration.padEnd(11)} ${cost}`
        );
      } else {
        console.log(
          `${chalk.red(agentDisplay)} ${chalk.red('Failed ')}    ` +
          `${data.attempts}/3      -           -`
        );
        if (data.error) {
          console.log(chalk.gray(`  Error: ${data.error.substring(0, 60)}...`));
        }
      }
    } else {
      processedResults.push({
        agentName,
        success: false,
        attempts: 3,
        error: String(result.reason)
      });

      console.log(
        `${chalk.red(agentDisplay)} ${chalk.red('Failed ')}    ` +
        `3/3      -           -`
      );
    }
  });

  console.log(chalk.gray('-'.repeat(80)));
  const successCount = processedResults.filter(r => r.success).length;
  console.log(chalk.cyan(`Summary: ${successCount}/${eligibleAgents.length} succeeded in ${formatDuration(totalDuration)}`));

  return processedResults;
}

// Setup graceful cleanup on process signals
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️ Received SIGINT, cleaning up...'));

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n⚠️ Received SIGTERM, cleaning up...'));

  process.exit(0);
});

// Main orchestration function
async function main(
  webUrl: string,
  repoPath: string,
  configPath: string | null = null,
  pipelineTestingMode: boolean = false,
  disableLoader: boolean = false,
  outputPath: string | null = null,
  ciCliOptions: Partial<CiOptions> = {}
): Promise<MainResult> {
  // Set global flag for loader control
  global.SHANNON_DISABLE_LOADER = disableLoader;

  const totalTimer = new Timer('total-execution');
  timingResults.total = totalTimer;

  // Display splash screen
  await displaySplashScreen();

  console.log(chalk.cyan.bold('🚀 AI PENETRATION TESTING AGENT'));
  console.log(chalk.cyan(`🎯 Target: ${webUrl}`));
  console.log(chalk.cyan(`📁 Source: ${repoPath}`));
  if (configPath) {
    console.log(chalk.cyan(`⚙️ Config: ${configPath}`));
  }
  if (outputPath) {
    console.log(chalk.cyan(`📂 Output: ${outputPath}`));
  }
  console.log(chalk.gray('─'.repeat(60)));

  // Parse configuration if provided
  let distributedConfig: DistributedConfig | null = null;
  let fullConfig: Config | null = null;
  if (configPath) {
    try {
      // Resolve config path - check configs folder if relative path
      let resolvedConfigPath = configPath;
      if (!path.isAbsolute(configPath)) {
        const configsDir = path.join(process.cwd(), 'configs');
        const configInConfigsDir = path.join(configsDir, configPath);
        // Check if file exists in configs directory, otherwise use original path
        if (await fs.pathExists(configInConfigsDir)) {
          resolvedConfigPath = configInConfigsDir;
        }
      }

      const config = await parseConfig(resolvedConfigPath);
      fullConfig = config;
      distributedConfig = distributeConfig(config);
      console.log(chalk.green(`✅ Configuration loaded successfully`));
    } catch (error) {
      await logError(error as Error, `Configuration loading from ${configPath}`);
      throw error; // Let the main error boundary handle it
    }
  }

  const ciOptions = resolveCiOptions(fullConfig?.ci, ciCliOptions);
  if (ciOptions.enabled) {
    console.log(chalk.yellow(`⚙️  CI/CD mode enabled (platforms: ${ciOptions.platforms.join(', ')})`));
  }

  // Check tool availability
  const toolAvailability: ToolAvailability = await checkToolAvailability();
  handleMissingTools(toolAvailability);

  // Setup local repository
  console.log(chalk.blue('📁 Setting up local repository...'));
  let sourceDir: string;
  try {
    sourceDir = await setupLocalRepo(repoPath);
    console.log(chalk.green('✅ Local repository setup successfully'));
  } catch (error) {
    const err = error as Error;
    console.log(chalk.red(`❌ Failed to setup local repository: ${err.message}`));
    console.log(chalk.gray('This could be due to:'));
    console.log(chalk.gray('  - Insufficient permissions'));
    console.log(chalk.gray('  - Repository path not accessible'));
    console.log(chalk.gray('  - Git initialization issues'));
    console.log(chalk.gray('  - Insufficient disk space'));
    process.exit(1);
  }

  const variables: PromptVariables = { webUrl, repoPath, sourceDir };

  // Create session (acts as lock file)
  const session: Session = await createSession(webUrl, repoPath);
  console.log(chalk.blue(`Session created: ${session.id.substring(0, 8)}...`));

  // Session metadata for audit logging
  const sessionMetadata: SessionMetadata = {
    id: session.id,
    webUrl,
    repoPath: sourceDir,
    ...(outputPath && { outputPath })
  };

  // Initialize audit session once and reuse (avoid race conditions)
  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize();

  // Create outputs directory in source directory
  try {
    const outputsDir = path.join(sourceDir, 'outputs');
    await fs.ensureDir(outputsDir);
    await fs.ensureDir(path.join(outputsDir, 'schemas'));
    await fs.ensureDir(path.join(outputsDir, 'scans'));
  } catch (error) {
    const err = error as Error;
    throw new PentestError(
      `Failed to create output directories: ${err.message}`,
      'filesystem',
      false,
      { sourceDir, originalError: err.message }
    );
  }

  try {
  // PHASE 1: PRE-RECONNAISSANCE
    const { duration: preReconDuration } = await executePreReconPhase(
      webUrl,
      sourceDir,
      variables,
      distributedConfig,
      toolAvailability,
      pipelineTestingMode,
      session.id,
      outputPath
    );
    console.log(chalk.green(`Pre-reconnaissance complete in ${formatDuration(preReconDuration)}`));

  // PHASE 2: RECONNAISSANCE
    console.log(chalk.magenta.bold('\n🔎 PHASE 2: RECONNAISSANCE'));
    console.log(chalk.magenta('Analyzing initial findings...'));
    const reconTimer = new Timer('phase-2-recon');

    await runAgent(
      'recon',
      sourceDir,
      variables,
      distributedConfig,
      pipelineTestingMode,
      sessionMetadata
    );
    const reconDuration = reconTimer.stop();
    console.log(chalk.green(`✅ Reconnaissance complete in ${formatDuration(reconDuration)}`));

  // PHASE 3: VULNERABILITY ANALYSIS
    const vulnTimer = new Timer('phase-3-vulnerability-analysis');
    console.log(chalk.red.bold('\n🚨 PHASE 3: VULNERABILITY ANALYSIS'));

    const vulnResults = await runParallelVuln(
      sourceDir,
      variables,
      distributedConfig,
      pipelineTestingMode,
      sessionMetadata
    );

    const vulnDuration = vulnTimer.stop();
    console.log(chalk.green(`✅ Vulnerability analysis phase complete in ${formatDuration(vulnDuration)}`));

  // PHASE 4: EXPLOITATION
    const exploitTimer = new Timer('phase-4-exploitation');
    console.log(chalk.red.bold('\n💥 PHASE 4: EXPLOITATION'));

    const exploitResults = await runParallelExploit(
      sourceDir,
      variables,
      distributedConfig,
      pipelineTestingMode,
      sessionMetadata
    );

    const exploitDuration = exploitTimer.stop();
    console.log(chalk.green(`✅ Exploitation phase complete in ${formatDuration(exploitDuration)}`));

  // PHASE 5: REPORTING
    console.log(chalk.greenBright.bold('\n📊 PHASE 5: REPORTING'));
    console.log(chalk.greenBright('Generating executive summary and assembling final report...'));
    const reportTimer = new Timer('phase-5-reporting');

    // Assemble all deliverables into a single concatenated report
    console.log(chalk.blue('📝 Assembling deliverables from specialist agents...'));
    try {
      await assembleFinalReport(sourceDir);
    } catch (error) {
      const err = error as Error;
      console.log(chalk.red(`❌ Error assembling final report: ${err.message}`));
    }

    // Run reporter agent to create executive summary
    console.log(chalk.blue('Generating executive summary and cleaning up report...'));
    await runAgent(
      'report',
      sourceDir,
      variables,
      distributedConfig,
      pipelineTestingMode,
      sessionMetadata
    );

    let findingsArtifacts: Awaited<ReturnType<typeof generateFindingsArtifacts>> | null = null;
    try {
      findingsArtifacts = await generateFindingsArtifacts(
        sourceDir,
        variables,
        distributedConfig,
        pipelineTestingMode,
        sessionMetadata,
        ciOptions
      );
    } catch (error) {
      const err = error as Error;
      console.log(chalk.yellow(`⚠️ Findings enrichment failed: ${err.message}`));
      if (ciOptions.enabled) {
        throw error;
      }
    }

    // Run integrations (Slack, Jira, webhooks) if configured
    if (findingsArtifacts && (fullConfig?.integrations || fullConfig?.api?.webhooks)) {
      console.log(chalk.blue('🔗 Running integrations...'));
      try {
        const integrationResult = await runIntegrations(
          fullConfig?.integrations,
          findingsArtifacts.report,
          fullConfig?.api?.webhooks
        );
        // Log integration results to audit (reuse existing session)
        await auditSession.logEvent('integrations', {
          jiraIssueCount: integrationResult.jiraIssueKeys.length,
          jiraIssues: integrationResult.jiraIssueKeys,
          slackSuccess: integrationResult.slackSuccess,
          webhookCount: integrationResult.webhookResults.size,
          errors: integrationResult.errors,
        });
        if (integrationResult.errors.length > 0) {
          console.log(chalk.yellow(`⚠️ ${integrationResult.errors.length} integration errors (see audit log)`));
        }
      } catch (error) {
        const err = error as Error;
        console.log(chalk.yellow(`⚠️ Integrations failed: ${err.message}`));
        await auditSession.logEvent('integrations_error', { error: err.message });
      }
    }

    const reportDuration = reportTimer.stop();
    console.log(chalk.green(`✅ Final report generated in ${formatDuration(reportDuration)}`));

    // Calculate final timing
    timingResults.total.stop();

    // Mark session as completed in both stores
    await updateSessionStatus(session.id, 'completed');

    // Update audit system's session.json status (reuse existing session)
    await auditSession.updateSessionStatus('completed');

    // Display comprehensive timing summary
    displayTimingSummary();

  console.log(chalk.cyan.bold('\n🎉 PENETRATION TESTING COMPLETE!'));
  console.log(chalk.gray('─'.repeat(60)));

  // Calculate audit logs path
    const auditLogsPath = generateAuditPath(sessionMetadata);

  // Consolidate deliverables into the session folder
  await consolidateOutputs(sourceDir, auditLogsPath);
  console.log(chalk.green(`\n📂 All outputs consolidated: ${auditLogsPath}`));

    const ciExitCode = findingsArtifacts && ciOptions.enabled
      ? computeCiExitCode(findingsArtifacts.report.findings, ciOptions.failOn)
      : undefined;

    return {
      reportPath: path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md'),
      auditLogsPath,
      ...(findingsArtifacts?.findingsPath && { findingsPath: findingsArtifacts.findingsPath }),
      ...(findingsArtifacts?.compliancePath && { compliancePath: findingsArtifacts.compliancePath }),
      ...(findingsArtifacts?.sarifPath && { sarifPath: findingsArtifacts.sarifPath }),
      ...(findingsArtifacts?.gitlabPath && { gitlabPath: findingsArtifacts.gitlabPath }),
      ...(ciExitCode !== undefined && { ciExitCode })
    };

  } catch (error) {
    // Mark session as failed in both stores
    await updateSessionStatus(session.id, 'failed');

    // Update audit system's session.json status (reuse existing session)
    await auditSession.updateSessionStatus('failed');

    // Log the error to audit trail
    const err = error as Error;
    await auditSession.logEvent('execution_error', {
      error: err.message,
      stack: process.env.DEBUG ? err.stack : undefined,
    });

    throw error;
  }
}

// Entry point - handle both direct node execution and shebang execution
let args = process.argv.slice(2);
// If first arg is the script name (from shebang), remove it
if (args[0] && args[0].includes('shannon')) {
  args = args.slice(1);
}

if (args[0] === 'server') {
  const { startApiServer } = await import('./api/server.js');
  await startApiServer(args.slice(1));
  process.exit(0);
}

// Parse flags and arguments
let configPath: string | null = null;
let outputPath: string | null = null;
let pipelineTestingMode = false;
let disableLoader = false;
let ciEnabled: boolean | undefined;
let ciPlatforms: CiOptions['platforms'] | undefined;
let ciFailOn: CiOptions['failOn'] | undefined;
const nonFlagArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') {
    if (i + 1 < args.length) {
      configPath = args[i + 1]!;
      i++; // Skip the next argument
    } else {
      console.log(chalk.red('❌ --config flag requires a file path'));
      process.exit(1);
    }
  } else if (args[i] === '--output') {
    if (i + 1 < args.length) {
      outputPath = path.resolve(args[i + 1]!);
      i++; // Skip the next argument
    } else {
      console.log(chalk.red('❌ --output flag requires a directory path'));
      process.exit(1);
    }
  } else if (args[i] === '--pipeline-testing') {
    pipelineTestingMode = true;
  } else if (args[i] === '--disable-loader') {
    disableLoader = true;
  } else if (args[i] === '--ci') {
    ciEnabled = true;
  } else if (args[i] === '--ci-platforms') {
    if (i + 1 < args.length) {
      const raw = args[i + 1]!;
      ciPlatforms = raw.split(',').map((p) => p.trim()).filter(Boolean) as CiOptions['platforms'];
      i++;
    } else {
      console.log(chalk.red('❌ --ci-platforms flag requires a comma-separated list'));
      process.exit(1);
    }
  } else if (args[i] === '--ci-fail-on') {
    if (i + 1 < args.length) {
      ciFailOn = args[i + 1] as CiOptions['failOn'];
      i++;
    } else {
      console.log(chalk.red('❌ --ci-fail-on flag requires a severity value'));
      process.exit(1);
    }
  } else if (!args[i]!.startsWith('-')) {
    nonFlagArgs.push(args[i]!);
  }
}

// Handle help flag
if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
  showHelp();
  process.exit(0);
}

// Handle no arguments - show help
if (nonFlagArgs.length === 0) {
  console.log(chalk.red.bold('❌ Error: No arguments provided\n'));
  showHelp();
  process.exit(1);
}

// Handle insufficient arguments
if (nonFlagArgs.length < 2) {
  console.log(chalk.red('❌ Both WEB_URL and REPO_PATH are required'));
  console.log(chalk.gray('Usage: shannon <WEB_URL> <REPO_PATH> [--config config.yaml]'));
  console.log(chalk.gray('Help:  shannon --help'));
  process.exit(1);
}

const [webUrl, repoPath] = nonFlagArgs;

// Validate web URL
const webUrlValidation = validateWebUrl(webUrl!);
if (!webUrlValidation.valid) {
  console.log(chalk.red(`❌ Invalid web URL: ${webUrlValidation.error}`));
  console.log(chalk.gray(`Expected format: https://example.com`));
  process.exit(1);
}

// Validate repository path
const repoPathValidation = await validateRepoPath(repoPath!);
if (!repoPathValidation.valid) {
  console.log(chalk.red(`❌ Invalid repository path: ${repoPathValidation.error}`));
  console.log(chalk.gray(`Expected: Accessible local directory path`));
  process.exit(1);
}

// Success - show validated inputs
console.log(chalk.green('✅ Input validation passed:'));
console.log(chalk.gray(`   Target Web URL: ${webUrl}`));
console.log(chalk.gray(`   Target Repository: ${repoPathValidation.path}\n`));
console.log(chalk.gray(`   Config Path: ${configPath}\n`));
if (outputPath) {
  console.log(chalk.gray(`   Output Path: ${outputPath}\n`));
}
if (pipelineTestingMode) {
  console.log(chalk.yellow('⚡ PIPELINE TESTING MODE ENABLED - Using minimal test prompts for fast pipeline validation\n'));
}
if (disableLoader) {
  console.log(chalk.yellow('⚙️  LOADER DISABLED - Progress indicator will not be shown\n'));
}

try {
  const ciCliOptions: Partial<CiOptions> = {
    ...(ciEnabled !== undefined && { enabled: ciEnabled }),
    ...(ciPlatforms && { platforms: ciPlatforms }),
    ...(ciFailOn && { failOn: ciFailOn }),
  };

  const result = await main(
    webUrl!,
    repoPathValidation.path!,
    configPath,
    pipelineTestingMode,
    disableLoader,
    outputPath,
    ciCliOptions
  );
  console.log(chalk.green.bold('\n📄 FINAL REPORT AVAILABLE:'));
  console.log(chalk.cyan(result.reportPath));
  console.log(chalk.green.bold('\n📂 AUDIT LOGS AVAILABLE:'));
  console.log(chalk.cyan(result.auditLogsPath));
  if (result.findingsPath) {
    console.log(chalk.green.bold('\n🧾 FINDINGS JSON AVAILABLE:'));
    console.log(chalk.cyan(result.findingsPath));
  }
  if (result.compliancePath) {
    console.log(chalk.green.bold('\n✅ COMPLIANCE REPORT AVAILABLE:'));
    console.log(chalk.cyan(result.compliancePath));
  }
  if (result.sarifPath) {
    console.log(chalk.green.bold('\n📦 SARIF REPORT AVAILABLE:'));
    console.log(chalk.cyan(result.sarifPath));
  }
  if (result.gitlabPath) {
    console.log(chalk.green.bold('\n📦 GITLAB SAST REPORT AVAILABLE:'));
    console.log(chalk.cyan(result.gitlabPath));
  }
  if (result.ciExitCode !== undefined) {
    process.exitCode = result.ciExitCode;
  }

} catch (error) {
  // Enhanced error boundary with proper logging
  if (error instanceof PentestError) {
    await logError(error, 'Main execution failed');
    console.log(chalk.red.bold('\n🚨 PENTEST EXECUTION FAILED'));
    console.log(chalk.red(`   Type: ${error.type}`));
    console.log(chalk.red(`   Retryable: ${error.retryable ? 'Yes' : 'No'}`));

    if (error.retryable) {
      console.log(chalk.yellow('   Consider running the command again or checking network connectivity.'));
    }
  } else {
    const err = error as Error;
    console.log(chalk.red.bold('\n🚨 UNEXPECTED ERROR OCCURRED'));
    console.log(chalk.red(`   Error: ${err?.message || err?.toString() || 'Unknown error'}`));

    if (process.env.DEBUG) {
      console.log(chalk.gray(`   Stack: ${err?.stack || 'No stack trace available'}`));
    }
  }

  process.exit(1);
}
