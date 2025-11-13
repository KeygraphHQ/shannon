#!/usr/bin/env zx

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.


import { path, fs } from 'zx';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Config and Tools
import { parseConfig, distributeConfig } from './src/config-parser.js';
import { checkToolAvailability, handleMissingTools } from './src/tool-checker.js';

// Session and Checkpoints
import { createSession, updateSession, getSession, AGENTS } from './src/session-manager.js';
import { runPhase, getGitCommitHash } from './src/checkpoint-manager.js';

// Setup and Deliverables
import { setupLocalRepo } from './src/setup/environment.js';

// AI and Prompts
import { runClaudePromptWithRetry } from './src/ai/claude-executor.js';
import { loadPrompt } from './src/prompts/prompt-manager.js';

// Phases
import { executePreReconPhase } from './src/phases/pre-recon.js';
import { assembleFinalReport } from './src/phases/reporting.js';

// Utils
import { timingResults, costResults, displayTimingSummary, Timer } from './src/utils/metrics.js';
import { formatDuration, generateAuditPath } from './src/audit/utils.js';

// CLI
import { handleDeveloperCommand } from './src/cli/command-handler.js';
import { showHelp, displaySplashScreen } from './src/cli/ui.js';
import { validateWebUrl, validateRepoPath } from './src/cli/input-validator.js';

// Error Handling
import { PentestError, logError } from './src/error-handling.js';

// Session Manager Functions
import {
  calculateVulnerabilityAnalysisSummary,
  calculateExploitationSummary,
  getNextAgent
} from './src/session-manager.js';

// Configure zx to disable timeouts (let tools run as long as needed)
$.timeout = 0;

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
async function main(webUrl, repoPath, configPath = null, pipelineTestingMode = false) {
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
  console.log(chalk.gray('─'.repeat(60)));

  // Parse configuration if provided
  let config = null;
  let distributedConfig = null;
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

      config = await parseConfig(resolvedConfigPath);
      distributedConfig = distributeConfig(config);
      console.log(chalk.green(`✅ Configuration loaded successfully`));
    } catch (error) {
      await logError(error, `Configuration loading from ${configPath}`);
      throw error; // Let the main error boundary handle it
    }
  }

  // Check tool availability
  const toolAvailability = await checkToolAvailability();
  handleMissingTools(toolAvailability);

  // Setup local repository
  console.log(chalk.blue('📁 Setting up local repository...'));
  let sourceDir;
  try {
    sourceDir = await setupLocalRepo(repoPath);
    const variables = { webUrl, repoPath, sourceDir };
    console.log(chalk.green('✅ Local repository setup successfully'));
  } catch (error) {
    console.log(chalk.red(`❌ Failed to setup local repository: ${error.message}`));
    console.log(chalk.gray('This could be due to:'));
    console.log(chalk.gray('  - Insufficient permissions'));
    console.log(chalk.gray('  - Repository path not accessible'));
    console.log(chalk.gray('  - Git initialization issues'));
    console.log(chalk.gray('  - Insufficient disk space'));
    process.exit(1);
  }

  const variables = { webUrl, repoPath, sourceDir };

  // Create session for tracking (in normal mode)
  const session = await createSession(webUrl, repoPath, configPath, sourceDir);
  console.log(chalk.blue(`📝 Session created: ${session.id.substring(0, 8)}...`));

  // If setup-only mode, exit after session creation
  if (process.argv.includes('--setup-only')) {
    console.log(chalk.green('✅ Setup complete! Local repository setup and session created.'));
    console.log(chalk.gray('Use developer commands to run individual agents:'));
    console.log(chalk.gray('  ./shannon.mjs --run-agent pre-recon'));
    console.log(chalk.gray('  ./shannon.mjs --status'));
    process.exit(0);
  }

  // Helper function to update session progress
  const updateSessionProgress = async (agentName, commitHash = null) => {
    try {
      const updates = {
        completedAgents: [...new Set([...session.completedAgents, agentName])],
        failedAgents: session.failedAgents.filter(name => name !== agentName), // Remove from failed if it was there
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
      console.log(chalk.yellow(`    ⚠️ Failed to update session: ${error.message}`));
    }
  };

  // Create outputs directory in source directory
  try {
    const outputsDir = path.join(sourceDir, 'outputs');
    await fs.ensureDir(outputsDir);
    await fs.ensureDir(path.join(outputsDir, 'schemas'));
    await fs.ensureDir(path.join(outputsDir, 'scans'));
  } catch (error) {
    throw new PentestError(
      `Failed to create output directories: ${error.message}`,
      'filesystem',
      false,
      { sourceDir, originalError: error.message }
    );
  }

  // Check if we should continue from where session left off
  const nextAgent = getNextAgent(session);
  if (!nextAgent) {
    console.log(chalk.green(`✅ All agents completed! Session is finished.`));
    await displayTimingSummary(timingResults, costResults, session.completedAgents);
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
      session.id  // Pass session ID for logging
    );
    timingResults.phases['pre-recon'] = preReconDuration;
    await updateSessionProgress('pre-recon');
  }

  // PHASE 2: RECONNAISSANCE
  if (startPhase <= 2) {
    console.log(chalk.magenta.bold('\n🔎 PHASE 2: RECONNAISSANCE'));
    console.log(chalk.magenta('Analyzing initial findings...'));
    const reconTimer = new Timer('phase-2-recon');
    const recon = await runClaudePromptWithRetry(
      await loadPrompt('recon', variables, distributedConfig, pipelineTestingMode),
      sourceDir,
      '*',
      '',
      AGENTS['recon'].displayName,
      'recon',  // Agent name for snapshot creation
      chalk.cyan,
      { id: session.id, webUrl }  // Session metadata for audit logging (STANDARD: use 'id' field)
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
    const vulnSummary = calculateVulnerabilityAnalysisSummary(currentSession);
    console.log(chalk.blue(`\n📊 Vulnerability Analysis Summary: ${vulnSummary.totalAnalyses} analyses, ${vulnSummary.totalVulnerabilities} vulnerabilities found, ${vulnSummary.exploitationCandidates} ready for exploitation`));

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
    await runPhase('exploitation', freshSession, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);

    // Display exploitation summary
    const finalSession = await getSession(session.id);
    const exploitSummary = calculateExploitationSummary(finalSession);
    if (exploitSummary.eligibleExploits > 0) {
      console.log(chalk.blue(`\n🎯 Exploitation Summary: ${exploitSummary.totalAttempts}/${exploitSummary.eligibleExploits} attempted, ${exploitSummary.skippedExploits} skipped (no vulnerabilities)`));
    } else {
      console.log(chalk.gray(`\n🎯 Exploitation Summary: No exploitation attempts (no vulnerabilities found)`));
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
      console.log(chalk.red(`❌ Error assembling final report: ${error.message}`));
    }

    // Then run reporter agent to create executive summary and clean up hallucinations
    console.log(chalk.blue('📋 Generating executive summary and cleaning up report...'));
    const execSummary = await runClaudePromptWithRetry(
      await loadPrompt('report-executive', variables, distributedConfig, pipelineTestingMode),
      sourceDir,
      '*',
      '',
      'Executive Summary and Report Cleanup',
      'report',  // Agent name for snapshot creation
      chalk.cyan,
      { id: session.id, webUrl }  // Session metadata for audit logging (STANDARD: use 'id' field)
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
      console.log(chalk.yellow(`    ⚠️ Failed to save report checkpoint: ${error.message}`));
      await updateSessionProgress('report'); // Fallback without checkpoint
    }
  }

  // Calculate final timing and cost data
  const totalDuration = timingResults.total.stop();
  const timingBreakdown = {
    total: totalDuration,
    phases: { ...timingResults.phases },
    agents: { ...timingResults.agents },
    commands: { ...timingResults.commands }
  };

  // Use accumulated cost data
  const costBreakdown = {
    total: costResults.total,
    agents: { ...costResults.agents }
  };

  // Mark session as completed with timing and cost data
  await updateSession(session.id, {
    status: 'completed',
    timingBreakdown,
    costBreakdown
  });

  // Display comprehensive timing summary
  displayTimingSummary();

  console.log(chalk.cyan.bold('\n🎉 PENETRATION TESTING COMPLETE!'));
  console.log(chalk.gray('─'.repeat(60)));

  // Calculate audit logs path
  const auditLogsPath = generateAuditPath(session);

  // Return final report path and audit logs path for clickable output
  return {
    reportPath: path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md'),
    auditLogsPath
  };
}

// Entry point - handle both direct node execution and shebang execution
let args = process.argv.slice(2);
// If first arg is the script name (from shebang), remove it
if (args[0] && args[0].includes('shannon.mjs')) {
  args = args.slice(1);
}

// Parse flags and arguments
let configPath = null;
let pipelineTestingMode = false;
const nonFlagArgs = [];
let developerCommand = null;
const developerCommands = ['--run-phase', '--run-all', '--rollback-to', '--rerun', '--status', '--list-agents', '--cleanup'];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') {
    if (i + 1 < args.length) {
      configPath = args[i + 1];
      i++; // Skip the next argument
    } else {
      console.log(chalk.red('❌ --config flag requires a file path'));
      process.exit(1);
    }
  } else if (args[i] === '--pipeline-testing') {
    pipelineTestingMode = true;
  } else if (developerCommands.includes(args[i])) {
    developerCommand = args[i];
    // Collect remaining args for the developer command
    const remainingArgs = args.slice(i + 1).filter(arg => !arg.startsWith('--') || arg === '--pipeline-testing');

    // Check for --pipeline-testing in remaining args
    if (remainingArgs.includes('--pipeline-testing')) {
      pipelineTestingMode = true;
    }

    // Add non-flag args (excluding --pipeline-testing)
    nonFlagArgs.push(...remainingArgs.filter(arg => arg !== '--pipeline-testing'));
    break; // Stop parsing after developer command
  } else if (!args[i].startsWith('-')) {
    nonFlagArgs.push(args[i]);
  }
}

// Handle help flag
if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
  showHelp();
  process.exit(0);
}

// Handle developer commands
if (developerCommand) {
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
  console.log(chalk.gray('Usage: ./shannon.mjs <WEB_URL> <REPO_PATH> [--config config.yaml]'));
  console.log(chalk.gray('Help:  ./shannon.mjs --help'));
  process.exit(1);
}

const [webUrl, repoPath] = nonFlagArgs;

// Validate web URL
const webUrlValidation = validateWebUrl(webUrl);
if (!webUrlValidation.valid) {
  console.log(chalk.red(`❌ Invalid web URL: ${webUrlValidation.error}`));
  console.log(chalk.gray(`Expected format: https://example.com`));
  process.exit(1);
}

// Validate repository path
const repoPathValidation = await validateRepoPath(repoPath);
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
if (pipelineTestingMode) {
  console.log(chalk.yellow('⚡ PIPELINE TESTING MODE ENABLED - Using minimal test prompts for fast pipeline validation\n'));
}

try {
  const result = await main(webUrl, repoPathValidation.path, configPath, pipelineTestingMode);
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
    console.log(chalk.red.bold('\n🚨 UNEXPECTED ERROR OCCURRED'));
    console.log(chalk.red(`   Error: ${error?.message || error?.toString() || 'Unknown error'}`));

    if (process.env.DEBUG) {
      console.log(chalk.gray(`   Stack: ${error?.stack || 'No stack trace available'}`));
    }
  }

  process.exit(1);
}