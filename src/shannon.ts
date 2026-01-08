#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { path, fs, $ } from 'zx';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Config and Tools
import { parseConfig, distributeConfig } from './config-parser.js';
import { checkToolAvailability, handleMissingTools } from './tool-checker.js';

// Session and Checkpoints
import { createSession, updateSession, getSession, AGENTS } from './session-manager.js';
import type { Session } from './session-manager.js';
import type { AgentName } from './types/index.js';
import { runPhase, getGitCommitHash } from './checkpoint-manager.js';

// Setup and Deliverables
import { setupLocalRepo } from './setup/environment.js';

// AI and Prompts
import { runClaudePromptWithRetry } from './ai/claude-executor.js';
import { loadPrompt } from './prompts/prompt-manager.js';

// Phases
import { executePreReconPhase } from './phases/pre-recon.js';
import { assembleFinalReport } from './phases/reporting.js';

// Utils
import { timingResults, costResults, displayTimingSummary, Timer } from './utils/metrics.js';
import { formatDuration, generateAuditPath } from './audit/utils.js';

// CLI
import { handleDeveloperCommand } from './cli/command-handler.js';
import { showHelp, displaySplashScreen } from './cli/ui.js';
import { validateWebUrl, validateRepoPath } from './cli/input-validator.js';

// Error Handling
import { PentestError, logError } from './error-handling.js';

// Session Manager Functions
import {
  calculateVulnerabilityAnalysisSummary,
  calculateExploitationSummary,
  getNextAgent
} from './session-manager.js';

import type { DistributedConfig } from './types/config.js';
import type { ToolAvailability } from './tool-checker.js';

// Extend global namespace for SHANNON_DISABLE_LOADER
declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

interface PromptVariables {
  webUrl: string;
  repoPath: string;
  sourceDir: string;
}

interface SessionUpdates {
  completedAgents?: AgentName[];
  failedAgents?: AgentName[];
  status?: 'in-progress' | 'completed' | 'failed';
  checkpoints?: Record<AgentName, string>;
}

interface MainResult {
  reportPath: string;
  auditLogsPath: string;
}

// Configure zx to disable timeouts (let tools run as long as needed)
$.timeout = 0;

/**
 * Consolidate deliverables from target repo into the session folder
 * Copies deliverables directory from source repo to session audit path
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
  outputPath: string | null = null
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
      distributedConfig = distributeConfig(config);
      console.log(chalk.green(`✅ Configuration loaded successfully`));
    } catch (error) {
      await logError(error as Error, `Configuration loading from ${configPath}`);
      throw error; // Let the main error boundary handle it
    }
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

  // Create session for tracking (in normal mode)
  const session: Session = await createSession(webUrl, repoPath, configPath, sourceDir, outputPath);
  console.log(chalk.blue(`📝 Session created: ${session.id.substring(0, 8)}...`));

  // If setup-only mode, exit after session creation
  if (process.argv.includes('--setup-only')) {
    console.log(chalk.green('✅ Setup complete! Local repository setup and session created.'));
    console.log(chalk.gray('Use developer commands to run individual agents:'));
    console.log(chalk.gray('  shannon --run-agent pre-recon'));
    console.log(chalk.gray('  shannon --status'));
    process.exit(0);
  }

  // Helper function to update session progress
  const updateSessionProgress = async (agentName: AgentName, commitHash: string | null = null): Promise<void> => {
    try {
      const updates: SessionUpdates = {
        completedAgents: [...new Set([...session.completedAgents, agentName])] as AgentName[],
        failedAgents: session.failedAgents.filter(name => name !== agentName),
        status: 'in-progress'
      };

      if (commitHash) {
        updates.checkpoints = { ...session.checkpoints, [agentName]: commitHash };
      }

      await updateSession(session.id, updates);
      // Update local session object for subsequent updates
      Object.assign(session, updates);
      console.log(chalk.gray(`    📝 Session updated: ${agentName} completed`));
    } catch (error) {
      const err = error as Error;
      console.log(chalk.yellow(`    ⚠️ Failed to update session: ${err.message}`));
    }
  };

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

  // Check if we should continue from where session left off
  const nextAgent = getNextAgent(session);
  if (!nextAgent) {
    console.log(chalk.green(`✅ All agents completed! Session is finished.`));
    displayTimingSummary();
    process.exit(0);
  }

  console.log(chalk.blue(`🔄 Continuing from ${nextAgent.displayName} (${session.completedAgents.length}/${Object.keys(AGENTS).length} agents completed)`));

  // Determine which phase to start from based on next agent
  const startPhase = nextAgent.name === 'pre-recon' ? 1
                   : nextAgent.name === 'recon' ? 2
                   : ['injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln'].includes(nextAgent.name) ? 3
                   : ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'].includes(nextAgent.name) ? 4
                   : nextAgent.name === 'report' ? 5 : 1;

  // PHASE 1: PRE-RECONNAISSANCE
  if (startPhase <= 1) {
    const { duration: preReconDuration } = await executePreReconPhase(
      webUrl,
      sourceDir,
      variables,
      distributedConfig,
      toolAvailability,
      pipelineTestingMode,
      session.id,  // Pass session ID for logging
      outputPath   // Pass output path for audit logging
    );
    timingResults.phases['pre-recon'] = preReconDuration;
    await updateSessionProgress('pre-recon');
  }

  // PHASE 2: RECONNAISSANCE
  if (startPhase <= 2) {
    console.log(chalk.magenta.bold('\n🔎 PHASE 2: RECONNAISSANCE'));
    console.log(chalk.magenta('Analyzing initial findings...'));
    const reconTimer = new Timer('phase-2-recon');
    await runClaudePromptWithRetry(
      await loadPrompt('recon', variables, distributedConfig, pipelineTestingMode),
      sourceDir,
      '*',
      '',
      AGENTS['recon'].displayName,
      'recon',  // Agent name for snapshot creation
      chalk.cyan,
      { id: session.id, webUrl, repoPath: sourceDir, ...(outputPath && { outputPath }) }  // Session metadata for audit logging (STANDARD: use 'id' field)
    );
    const reconDuration = reconTimer.stop();
    timingResults.phases['recon'] = reconDuration;

    console.log(chalk.green(`✅ Reconnaissance complete in ${formatDuration(reconDuration)}`));
    await updateSessionProgress('recon');
  }

  // PHASE 3: VULNERABILITY ANALYSIS
  if (startPhase <= 3) {
    const vulnTimer = new Timer('phase-3-vulnerability-analysis');
    console.log(chalk.red.bold('\n🚨 PHASE 3: VULNERABILITY ANALYSIS'));

    await runPhase('vulnerability-analysis', session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);

    // Display vulnerability analysis summary
    const currentSession = await getSession(session.id);
    if (currentSession) {
      const vulnSummary = calculateVulnerabilityAnalysisSummary(currentSession);
      console.log(chalk.blue(`\n📊 Vulnerability Analysis Summary: ${vulnSummary.totalAnalyses} analyses, ${vulnSummary.totalVulnerabilities} vulnerabilities found, ${vulnSummary.exploitationCandidates} ready for exploitation`));
    }

    const vulnDuration = vulnTimer.stop();
    timingResults.phases['vulnerability-analysis'] = vulnDuration;

    console.log(chalk.green(`✅ Vulnerability analysis phase complete in ${formatDuration(vulnDuration)}`));
  }

  // PHASE 4: EXPLOITATION
  if (startPhase <= 4) {
    const exploitTimer = new Timer('phase-4-exploitation');
    console.log(chalk.red.bold('\n💥 PHASE 4: EXPLOITATION'));

    // Get fresh session data to ensure we have latest vulnerability analysis results
    const freshSession = await getSession(session.id);
    if (freshSession) {
      await runPhase('exploitation', freshSession, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
    }

    // Display exploitation summary
    const finalSession = await getSession(session.id);
    if (finalSession) {
      const exploitSummary = calculateExploitationSummary(finalSession);
      if (exploitSummary.eligibleExploits > 0) {
        console.log(chalk.blue(`\n🎯 Exploitation Summary: ${exploitSummary.totalAttempts}/${exploitSummary.eligibleExploits} attempted, ${exploitSummary.skippedExploits} skipped (no vulnerabilities)`));
      } else {
        console.log(chalk.gray(`\n🎯 Exploitation Summary: No exploitation attempts (no vulnerabilities found)`));
      }
    }

    const exploitDuration = exploitTimer.stop();
    timingResults.phases['exploitation'] = exploitDuration;

    console.log(chalk.green(`✅ Exploitation phase complete in ${formatDuration(exploitDuration)}`));
  }

  // PHASE 5: REPORTING
  if (startPhase <= 5) {
    console.log(chalk.greenBright.bold('\n📊 PHASE 5: REPORTING'));
    console.log(chalk.greenBright('Generating executive summary and assembling final report...'));
    const reportTimer = new Timer('phase-5-reporting');

    // First, assemble all deliverables into a single concatenated report
    console.log(chalk.blue('📝 Assembling deliverables from specialist agents...'));

    try {
      await assembleFinalReport(sourceDir);
    } catch (error) {
      const err = error as Error;
      console.log(chalk.red(`❌ Error assembling final report: ${err.message}`));
    }

    // Then run reporter agent to create executive summary and clean up hallucinations
    console.log(chalk.blue('📋 Generating executive summary and cleaning up report...'));
    await runClaudePromptWithRetry(
      await loadPrompt('report-executive', variables, distributedConfig, pipelineTestingMode),
      sourceDir,
      '*',
      '',
      'Executive Summary and Report Cleanup',
      'report',  // Agent name for snapshot creation
      chalk.cyan,
      { id: session.id, webUrl, repoPath: sourceDir, ...(outputPath && { outputPath }) }  // Session metadata for audit logging (STANDARD: use 'id' field)
    );

    const reportDuration = reportTimer.stop();
    timingResults.phases['reporting'] = reportDuration;

    console.log(chalk.green(`✅ Final report generated in ${formatDuration(reportDuration)}`));

    // Get the commit hash after successful report generation for checkpoint
    try {
      const reportCommitHash = await getGitCommitHash(sourceDir);
      await updateSessionProgress('report', reportCommitHash);
      console.log(chalk.gray(`    📍 Report checkpoint saved: ${reportCommitHash.substring(0, 8)}`));
    } catch (error) {
      const err = error as Error;
      console.log(chalk.yellow(`    ⚠️ Failed to save report checkpoint: ${err.message}`));
      await updateSessionProgress('report'); // Fallback without checkpoint
    }
  }

  // Calculate final timing and cost data
  timingResults.total.stop();

  // Mark session as completed
  await updateSession(session.id, {
    status: 'completed'
  });

  // Display comprehensive timing summary
  displayTimingSummary();

  console.log(chalk.cyan.bold('\n🎉 PENETRATION TESTING COMPLETE!'));
  console.log(chalk.gray('─'.repeat(60)));

  // Calculate audit logs path
  const auditLogsPath = generateAuditPath({ id: session.id, webUrl: session.webUrl, repoPath: session.repoPath, ...(outputPath && { outputPath }) });

  // Consolidate deliverables into the session folder
  await consolidateOutputs(sourceDir, auditLogsPath);
  console.log(chalk.green(`\n📂 All outputs consolidated: ${auditLogsPath}`));

  // Return final report path and audit logs path for clickable output
  return {
    reportPath: path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md'),
    auditLogsPath
  };
}

// Entry point - handle both direct node execution and shebang execution
let args = process.argv.slice(2);
// If first arg is the script name (from shebang), remove it
if (args[0] && args[0].includes('shannon')) {
  args = args.slice(1);
}

// Parse flags and arguments
let configPath: string | null = null;
let outputPath: string | null = null;
let pipelineTestingMode = false;
let disableLoader = false;
const nonFlagArgs: string[] = [];
let developerCommand: string | null = null;
const developerCommands = ['--run-phase', '--run-all', '--rollback-to', '--rerun', '--status', '--list-agents', '--cleanup'];

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
  } else if (developerCommands.includes(args[i]!)) {
    developerCommand = args[i]!;
    // Collect remaining args for the developer command
    const remainingArgs = args.slice(i + 1).filter(arg => !arg.startsWith('--') || arg === '--pipeline-testing' || arg === '--disable-loader');

    // Check for --pipeline-testing in remaining args
    if (remainingArgs.includes('--pipeline-testing')) {
      pipelineTestingMode = true;
    }

    // Check for --disable-loader in remaining args
    if (remainingArgs.includes('--disable-loader')) {
      disableLoader = true;
    }

    // Add non-flag args (excluding --pipeline-testing and --disable-loader)
    nonFlagArgs.push(...remainingArgs.filter(arg => arg !== '--pipeline-testing' && arg !== '--disable-loader'));
    break; // Stop parsing after developer command
  } else if (!args[i]!.startsWith('-')) {
    nonFlagArgs.push(args[i]!);
  }
}

// Handle help flag
if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
  showHelp();
  process.exit(0);
}

// Handle developer commands
if (developerCommand) {
  // Set global flag for loader control in developer mode too
  global.SHANNON_DISABLE_LOADER = disableLoader;

  await handleDeveloperCommand(developerCommand, nonFlagArgs, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);

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
  const result = await main(webUrl!, repoPathValidation.path!, configPath, pipelineTestingMode, disableLoader, outputPath);
  console.log(chalk.green.bold('\n📄 FINAL REPORT AVAILABLE:'));
  console.log(chalk.cyan(result.reportPath));
  console.log(chalk.green.bold('\n📂 AUDIT LOGS AVAILABLE:'));
  console.log(chalk.cyan(result.auditLogsPath));

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
