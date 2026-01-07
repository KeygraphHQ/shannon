// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import chalk, { type ChalkInstance } from 'chalk';
import { PentestError } from './error-handling.js';
import { parseConfig, distributeConfig } from './config-parser.js';
import { executeGitCommandWithRetry } from './utils/git-manager.js';
import { formatDuration } from './audit/utils.js';
import {
  AGENTS,
  PHASES,
  validateAgent,
  validateAgentRange,
  validatePhase,
  checkPrerequisites,
  getNextAgent,
  markAgentCompleted,
  markAgentFailed,
  getSessionStatus,
  rollbackToAgent,
  getSession
} from './session-manager.js';
import type { Session, AgentDefinition } from './session-manager.js';
import type { AgentName, PhaseName, PromptName } from './types/index.js';
import type { DistributedConfig } from './types/config.js';
import type { SessionMetadata } from './audit/utils.js';

// Types for callback functions
type RunClaudePromptWithRetry = (
  prompt: string,
  sourceDir: string,
  allowedTools: string,
  context: string,
  description: string,
  agentName: string | null,
  colorFn: ChalkInstance,
  sessionMetadata: SessionMetadata | null
) => Promise<AgentResult>;

type LoadPrompt = (
  promptName: string,
  variables: { webUrl: string; repoPath: string; sourceDir?: string },
  config: DistributedConfig | null,
  pipelineTestingMode: boolean
) => Promise<string>;

export interface AgentResult {
  success: boolean;
  duration: number;
  cost?: number;
  partialCost?: number;
  error?: string;
  retryable?: boolean;
  logFile?: string;
}

interface ValidationData {
  shouldExploit: boolean;
  vulnerabilityCount: number;
}

interface SingleAgentResult {
  success: boolean;
  agentName: string;
  result?: AgentResult;
  validation?: ValidationData | null;
  timing?: number | null;
  cost?: number | null;
  checkpoint?: string;
  completedAt?: string;
  attempts?: number;
  logFile?: string;
  error?: {
    message: string;
    type: string;
    retryable: boolean;
    originalError?: Error;
  };
  failedAt?: string;
  context?: {
    targetRepo: string;
    promptName: PromptName;
    sessionId: string;
  };
}

interface ParallelResult {
  completed: AgentName[];
  failed: Array<{ agent: AgentName; error: string }>;
}

// Check if target repository exists and is accessible
const validateTargetRepo = async (targetRepo: string): Promise<boolean> => {
  if (!targetRepo || !await fs.pathExists(targetRepo)) {
    throw new PentestError(
      `Target repository '${targetRepo}' not found or not accessible`,
      'filesystem',
      false,
      { targetRepo }
    );
  }

  // Check if it's a git repository
  const gitDir = path.join(targetRepo, '.git');
  if (!await fs.pathExists(gitDir)) {
    throw new PentestError(
      `Target repository '${targetRepo}' is not a git repository`,
      'validation',
      false,
      { targetRepo }
    );
  }

  return true;
};

// Get git commit hash for checkpoint
export const getGitCommitHash = async (targetRepo: string): Promise<string> => {
  try {
    const result = await executeGitCommandWithRetry(['git', 'rev-parse', 'HEAD'], targetRepo, 'getting commit hash');
    return result.stdout.trim();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(
      `Failed to get git commit hash: ${errMsg}`,
      'validation',
      false,
      { targetRepo, originalError: errMsg }
    );
  }
};

// Rollback git workspace to specific commit
const rollbackGitToCommit = async (targetRepo: string, commitHash: string): Promise<void> => {
  try {
    await executeGitCommandWithRetry(['git', 'reset', '--hard', commitHash], targetRepo, 'rollback to commit');
    await executeGitCommandWithRetry(['git', 'clean', '-fd'], targetRepo, 'cleaning after rollback');
    console.log(chalk.green(`✅ Git workspace rolled back to commit ${commitHash.substring(0, 8)}`));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(
      `Failed to rollback git workspace: ${errMsg}`,
      'validation',
      false,
      { targetRepo, commitHash, originalError: errMsg }
    );
  }
};

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
    'report': 'report-executive'
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

// Run a single agent with retry logic and checkpointing
const runSingleAgent = async (
  agentName: AgentName,
  session: Session,
  pipelineTestingMode: boolean,
  runClaudePromptWithRetry: RunClaudePromptWithRetry,
  loadPrompt: LoadPrompt,
  allowRerun: boolean = false,
  skipWorkspaceClean: boolean = false
): Promise<SingleAgentResult> => {
  // Validate agent first
  const agent = validateAgent(agentName);

  console.log(chalk.cyan(`\n🤖 Running agent: ${agent.displayName}`));

  // Reload session to get latest state (important for agent ranges)
  const freshSession = await getSession(session.id);
  if (!freshSession) {
    throw new PentestError(`Session ${session.id} not found`, 'validation', false);
  }

  // Use fresh session for all subsequent checks
  const currentSession = freshSession;

  // Warn if session is completed
  if (currentSession.status === 'completed') {
    console.log(chalk.yellow('⚠️  This session is already completed. Re-running will modify completed results.'));
  }

  // Block re-running completed agents unless explicitly allowed
  if (!allowRerun && currentSession.completedAgents.includes(agentName)) {
    throw new PentestError(
      `Agent '${agentName}' has already been completed. Use --rerun ${agentName} for explicit rollback and re-execution.`,
      'validation',
      false,
      {
        agentName,
        suggestion: `--rerun ${agentName}`,
        completedAgents: currentSession.completedAgents
      }
    );
  }

  const targetRepo = currentSession.targetRepo;
  await validateTargetRepo(targetRepo);

  // Check prerequisites
  checkPrerequisites(currentSession, agentName);

  // Clean workspace if needed
  if (!currentSession.completedAgents.includes(agentName) && !allowRerun && !skipWorkspaceClean) {
    try {
      const status = await executeGitCommandWithRetry(['git', 'status', '--porcelain'], targetRepo, 'checking workspace status');
      const hasUncommittedChanges = status.stdout.trim().length > 0;

      if (hasUncommittedChanges) {
        console.log(chalk.yellow(`    ⚠️  Detected uncommitted changes before running ${agentName}`));
        console.log(chalk.yellow(`    🧹 Cleaning workspace to ensure clean agent execution`));
        await executeGitCommandWithRetry(['git', 'reset', '--hard', 'HEAD'], targetRepo, 'cleaning workspace');
        await executeGitCommandWithRetry(['git', 'clean', '-fd'], targetRepo, 'removing untracked files');
        console.log(chalk.green(`    ✅ Workspace cleaned successfully`));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`    ⚠️ Could not check/clean workspace: ${errMsg}`));
    }
  }

  // Create variables for prompt
  const variables = {
    webUrl: currentSession.webUrl,
    repoPath: currentSession.repoPath,
    sourceDir: targetRepo
  };

  // Handle relative config paths
  let configPath: string | null = null;
  if (currentSession.configFile) {
    configPath = path.isAbsolute(currentSession.configFile) || currentSession.configFile.startsWith('configs/')
      ? currentSession.configFile
      : path.join('configs', currentSession.configFile);
  }

  const config = configPath ? await parseConfig(configPath) : null;
  const distributedConfig = config ? distributeConfig(config) : null;

  // Initialize variables for result
  let validationData: ValidationData | null = null;
  let timingData: number | null = null;
  let costData: number | null = null;

  try {
    // Load and run the appropriate prompt
    const promptName = getPromptName(agentName);
    const prompt = await loadPrompt(promptName, variables, distributedConfig, pipelineTestingMode);

    const result = await runClaudePromptWithRetry(
      prompt,
      targetRepo,
      '*',
      '',
      AGENTS[agentName]!.displayName,
      agentName,
      getAgentColor(agentName),
      { id: currentSession.id, webUrl: currentSession.webUrl, repoPath: currentSession.repoPath }
    );

    if (!result.success) {
      throw new PentestError(
        `Agent execution failed: ${result.error}`,
        'validation',
        result.retryable || false,
        { agentName, result }
      );
    }

    // Get commit hash for checkpoint
    const commitHash = await getGitCommitHash(targetRepo);

    // Extract timing and cost data
    timingData = result.duration;
    costData = result.cost || 0;

    if (agentName.includes('-vuln')) {
      // Validate vulnerability analysis results
      const vulnType = agentName.replace('-vuln', '');
      try {
        const { safeValidateQueueAndDeliverable } = await import('./queue-validation.js');
        const validation = await safeValidateQueueAndDeliverable(vulnType as 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz', targetRepo);

        if (validation.success && validation.data) {
          console.log(chalk.blue(`📋 Validation: ${validation.data.shouldExploit ? `Ready for exploitation (${validation.data.vulnerabilityCount} vulnerabilities)` : 'No vulnerabilities found'}`));
          validationData = {
            shouldExploit: validation.data.shouldExploit,
            vulnerabilityCount: validation.data.vulnerabilityCount
          };
        } else if (validation.error) {
          console.log(chalk.yellow(`⚠️ Validation failed: ${validation.error.message}`));
        }
      } catch (validationError) {
        const errMsg = validationError instanceof Error ? validationError.message : String(validationError);
        console.log(chalk.yellow(`⚠️ Could not validate ${vulnType}: ${errMsg}`));
      }
    }

    // Mark agent as completed
    await markAgentCompleted(currentSession.id, agentName, commitHash);

    // Only show completion message for sequential execution
    if (!skipWorkspaceClean) {
      console.log(chalk.green(`✅ Agent '${agentName}' completed successfully`));
    }

    // Return immutable result object
    return Object.freeze({
      success: true,
      agentName,
      result,
      validation: validationData,
      timing: timingData,
      cost: costData,
      checkpoint: commitHash,
      completedAt: new Date().toISOString()
    });

  } catch (error) {
    // Mark agent as failed
    await markAgentFailed(currentSession.id, agentName);

    const err = error as Error & { retryable?: boolean };

    // Only show failure message for sequential execution
    if (!skipWorkspaceClean) {
      console.log(chalk.red(`❌ Agent '${agentName}' failed: ${err.message}`));
    }

    // Return immutable error object
    const errorResult: SingleAgentResult = Object.freeze({
      success: false,
      agentName,
      error: {
        message: err.message,
        type: err.constructor.name,
        retryable: err.retryable || false,
        originalError: err
      },
      validation: validationData,
      timing: timingData,
      failedAt: new Date().toISOString(),
      context: {
        targetRepo,
        promptName: getPromptName(agentName),
        sessionId: currentSession.id
      }
    });

    // Throw enhanced error
    const enhancedError = new PentestError(
      `Agent '${agentName}' execution failed: ${err.message}`,
      'validation',
      err.retryable || false,
      {
        agentName,
        sessionId: currentSession.id,
        originalError: err.message,
        errorResult
      }
    );

    throw enhancedError;
  }
};

// Run vulnerability agents in parallel
const runParallelVuln = async (
  session: Session,
  pipelineTestingMode: boolean,
  runClaudePromptWithRetry: RunClaudePromptWithRetry,
  loadPrompt: LoadPrompt
): Promise<ParallelResult> => {
  const vulnAgents: AgentName[] = ['injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln'];
  const activeAgents = vulnAgents.filter(agent => !session.completedAgents.includes(agent));

  if (activeAgents.length === 0) {
    console.log(chalk.gray('⏭️  All vulnerability agents already completed'));
    return { completed: vulnAgents, failed: [] };
  }

  console.log(chalk.cyan(`\n🚀 Starting ${activeAgents.length} vulnerability analysis specialists in parallel...`));
  console.log(chalk.gray('    Specialists: ' + activeAgents.join(', ')));
  console.log();

  const startTime = Date.now();

  // Collect all results without logging individual completions
  const results = await Promise.allSettled(
    activeAgents.map(async (agentName, index) => {
      // Add 2-second stagger to prevent API overwhelm
      await new Promise(resolve => setTimeout(resolve, index * 2000));

      let lastError: Error | undefined;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const result = await runSingleAgent(agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, false, true);
          return { ...result, attempts };
        } catch (error) {
          lastError = error as Error;
          if (attempts < maxAttempts) {
            console.log(chalk.yellow(`⚠️ ${agentName} failed attempt ${attempts}/${maxAttempts}, retrying...`));
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }
      throw { agentName, error: lastError, attempts };
    })
  );

  const totalDuration = Date.now() - startTime;

  // Process and display results
  console.log(chalk.cyan('\n📊 Vulnerability Analysis Results'));
  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.bold('Agent                  Status     Vulns  Attempt  Duration    Cost'));
  console.log(chalk.gray('─'.repeat(80)));

  const completed: AgentName[] = [];
  const failed: Array<{ agent: AgentName; error: string }> = [];

  results.forEach((result, index) => {
    const agentName = activeAgents[index]!;
    const agentDisplay = agentName.padEnd(22);

    if (result.status === 'fulfilled') {
      const data = result.value;
      completed.push(agentName);

      const vulnCount = data.validation?.vulnerabilityCount || 0;
      const duration = formatDuration(data.timing || 0);
      const cost = `$${(data.cost || 0).toFixed(4)}`;

      console.log(
        `${chalk.green(agentDisplay)} ${chalk.green('✓ Success')}  ${vulnCount.toString().padStart(5)}  ` +
        `${data.attempts}/3      ${duration.padEnd(11)} ${cost}`
      );

      if (data.logFile) {
        const relativePath = path.relative(process.cwd(), data.logFile);
        console.log(chalk.gray(`  └─ Detailed log: ${relativePath}`));
      }
    } else {
      const reason = result.reason as { error?: Error; attempts?: number };
      const error = reason.error || result.reason;
      const errMsg = error instanceof Error ? error.message : String(error);
      failed.push({ agent: agentName, error: errMsg });

      const attempts = reason.attempts || 3;

      console.log(
        `${chalk.red(agentDisplay)} ${chalk.red('✗ Failed ')}     -  ` +
        `${attempts}/3      -           -`
      );
      console.log(chalk.gray(`  └─ ${errMsg.substring(0, 60)}...`));
    }
  });

  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.cyan(`Summary: ${completed.length}/${activeAgents.length} succeeded in ${formatDuration(totalDuration)}`));

  return { completed, failed };
};

// Run exploitation agents in parallel
const runParallelExploit = async (
  session: Session,
  pipelineTestingMode: boolean,
  runClaudePromptWithRetry: RunClaudePromptWithRetry,
  loadPrompt: LoadPrompt
): Promise<ParallelResult> => {
  const exploitAgents: AgentName[] = ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'];

  // Get fresh session data
  const freshSession = await getSession(session.id);
  if (!freshSession) {
    throw new PentestError(`Session ${session.id} not found`, 'validation', false);
  }

  // Load validation module
  const { safeValidateQueueAndDeliverable } = await import('./queue-validation.js');

  // Check eligibility
  const eligibilityChecks = await Promise.all(
    exploitAgents.map(async (agentName) => {
      const vulnAgentName = agentName.replace('-exploit', '-vuln') as AgentName;

      if (!freshSession.completedAgents.includes(vulnAgentName)) {
        return { agentName, eligible: false };
      }

      const vulnType = vulnAgentName.replace('-vuln', '') as 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz';
      const validation = await safeValidateQueueAndDeliverable(vulnType, freshSession.targetRepo);

      if (!validation.success || !validation.data?.shouldExploit) {
        console.log(chalk.gray(`⏭️  Skipping ${agentName} (no vulnerabilities found in ${vulnAgentName})`));
        return { agentName, eligible: false };
      }

      console.log(chalk.blue(`✓ ${agentName} eligible (${validation.data.vulnerabilityCount} vulnerabilities from ${vulnAgentName})`));
      return { agentName, eligible: true };
    })
  );

  const eligibleAgents = eligibilityChecks
    .filter(check => check.eligible)
    .map(check => check.agentName);

  const activeAgents = eligibleAgents.filter(agent => !freshSession.completedAgents.includes(agent));

  if (activeAgents.length === 0) {
    if (eligibleAgents.length === 0) {
      console.log(chalk.gray('⏭️  No exploitation agents eligible (no vulnerabilities found)'));
    } else {
      console.log(chalk.gray('⏭️  All eligible exploitation agents already completed'));
    }
    return { completed: eligibleAgents, failed: [] };
  }

  console.log(chalk.cyan(`\n🎯 Starting ${activeAgents.length} exploitation specialists in parallel...`));
  console.log(chalk.gray('    Specialists: ' + activeAgents.join(', ')));
  console.log();

  const startTime = Date.now();

  const results = await Promise.allSettled(
    activeAgents.map(async (agentName, index) => {
      await new Promise(resolve => setTimeout(resolve, index * 2000));

      let lastError: Error | undefined;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const result = await runSingleAgent(agentName, freshSession, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, false, true);
          return { ...result, attempts };
        } catch (error) {
          lastError = error as Error;
          if (attempts < maxAttempts) {
            console.log(chalk.yellow(`⚠️ ${agentName} failed attempt ${attempts}/${maxAttempts}, retrying...`));
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }
      throw { agentName, error: lastError, attempts };
    })
  );

  const totalDuration = Date.now() - startTime;

  console.log(chalk.cyan('\n🎯 Exploitation Results'));
  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.bold('Agent                  Status     Result Attempt  Duration    Cost'));
  console.log(chalk.gray('─'.repeat(80)));

  const completed: AgentName[] = [];
  const failed: Array<{ agent: AgentName; error: string }> = [];

  results.forEach((result, index) => {
    const agentName = activeAgents[index]!;
    const agentDisplay = agentName.padEnd(22);

    if (result.status === 'fulfilled') {
      const data = result.value;
      completed.push(agentName);

      const exploitResult = 'Success';
      const duration = formatDuration(data.timing || 0);
      const cost = `$${(data.cost || 0).toFixed(4)}`;

      console.log(
        `${chalk.green(agentDisplay)} ${chalk.green('✓ Success')}  ${exploitResult.padEnd(6)}  ` +
        `${data.attempts}/3      ${duration.padEnd(11)} ${cost}`
      );

      if (data.logFile) {
        const relativePath = path.relative(process.cwd(), data.logFile);
        console.log(chalk.gray(`  └─ Detailed log: ${relativePath}`));
      }
    } else {
      const reason = result.reason as { error?: Error; attempts?: number };
      const error = reason.error || result.reason;
      const errMsg = error instanceof Error ? error.message : String(error);
      failed.push({ agent: agentName, error: errMsg });

      const attempts = reason.attempts || 3;

      console.log(
        `${chalk.red(agentDisplay)} ${chalk.red('✗ Failed ')}  -      ` +
        `${attempts}/3      -           -`
      );
      console.log(chalk.gray(`  └─ ${errMsg.substring(0, 60)}...`));
    }
  });

  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.cyan(`Summary: ${completed.length}/${activeAgents.length} succeeded in ${formatDuration(totalDuration)}`));

  return { completed, failed };
};

// Run all agents in a phase
export const runPhase = async (
  phaseName: string,
  session: Session,
  pipelineTestingMode: boolean,
  runClaudePromptWithRetry: RunClaudePromptWithRetry,
  loadPrompt: LoadPrompt
): Promise<void> => {
  console.log(chalk.cyan(`\n📋 Running phase: ${phaseName} (parallel execution)`));

  if (phaseName === 'vulnerability-analysis') {
    console.log(chalk.cyan('🚀 Using parallel execution for 5x faster vulnerability analysis'));
    const results = await runParallelVuln(session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);

    if (results.failed.length > 0) {
      console.log(chalk.yellow(`⚠️  ${results.failed.length} agents failed, but phase continues`));
      results.failed.forEach(failure => {
        console.log(chalk.red(`   - ${failure.agent}: ${failure.error}`));
      });
    }

    console.log(chalk.green(`✅ Phase '${phaseName}' completed: ${results.completed.length} succeeded, ${results.failed.length} failed`));
    return;
  }

  if (phaseName === 'exploitation') {
    console.log(chalk.cyan('🎯 Using parallel execution for 5x faster exploitation'));
    const results = await runParallelExploit(session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);

    if (results.failed.length > 0) {
      console.log(chalk.yellow(`⚠️  ${results.failed.length} agents failed, but phase continues`));
      results.failed.forEach(failure => {
        console.log(chalk.red(`   - ${failure.agent}: ${failure.error}`));
      });
    }

    console.log(chalk.green(`✅ Phase '${phaseName}' completed: ${results.completed.length} succeeded, ${results.failed.length} failed`));
    return;
  }

  // For other phases, run single agent
  const agents = validatePhase(phaseName);
  if (agents.length === 1) {
    const agent = agents[0]!;
    if (session.completedAgents.includes(agent.name)) {
      console.log(chalk.gray(`⏭️  Agent '${agent.name}' already completed, skipping`));
      return;
    }

    await runSingleAgent(agent.name, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
    console.log(chalk.green(`✅ Phase '${phaseName}' completed successfully`));
  } else {
    throw new PentestError(`Phase '${phaseName}' has multiple agents but no parallel execution defined`, 'validation', false);
  }
};

// Rollback to specific agent checkpoint
export const rollbackTo = async (targetAgent: string, session: Session): Promise<void> => {
  console.log(chalk.yellow(`🔄 Rolling back to agent: ${targetAgent}`));

  await validateTargetRepo(session.targetRepo);
  validateAgent(targetAgent);

  const agentName = targetAgent as AgentName;
  if (!session.checkpoints[agentName]) {
    throw new PentestError(
      `No checkpoint found for agent '${targetAgent}' in session history`,
      'validation',
      false,
      { targetAgent, availableCheckpoints: Object.keys(session.checkpoints) }
    );
  }

  const commitHash = session.checkpoints[agentName]!;

  await rollbackGitToCommit(session.targetRepo, commitHash);
  await rollbackToAgent(session.id, targetAgent);

  // Mark rolled-back agents in audit system
  try {
    const { AuditSession } = await import('./audit/index.js');
    const sessionMetadata: SessionMetadata = {
      id: session.id,
      webUrl: session.webUrl,
      repoPath: session.repoPath
    };
    const auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();

    const targetOrder = AGENTS[agentName]!.order;
    const rolledBackAgents = Object.values(AGENTS)
      .filter(agent => agent.order > targetOrder)
      .map(agent => agent.name);

    if (rolledBackAgents.length > 0) {
      await auditSession.markMultipleRolledBack(rolledBackAgents);
      console.log(chalk.gray(`   Marked ${rolledBackAgents.length} agents as rolled-back in audit logs`));
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`   ⚠️ Failed to update audit logs: ${errMsg}`));
  }

  console.log(chalk.green(`✅ Successfully rolled back to agent '${targetAgent}'`));
};

// Rerun specific agent
export const rerunAgent = async (
  agentName: string,
  session: Session,
  pipelineTestingMode: boolean,
  runClaudePromptWithRetry: RunClaudePromptWithRetry,
  loadPrompt: LoadPrompt
): Promise<void> => {
  console.log(chalk.cyan(`🔁 Rerunning agent: ${agentName}`));

  const agent = validateAgent(agentName);

  // Find previous agent checkpoint
  let rollbackTarget: AgentName | null = null;
  if (agent.prerequisites.length > 0) {
    const completedPrereqs = agent.prerequisites.filter(prereq =>
      session.completedAgents.includes(prereq)
    );
    if (completedPrereqs.length > 0) {
      rollbackTarget = completedPrereqs.reduce((latest, current) =>
        AGENTS[current]!.order > AGENTS[latest]!.order ? current : latest
      );
    }
  }

  if (rollbackTarget) {
    console.log(chalk.blue(`📍 Rolling back to prerequisite: ${rollbackTarget}`));
    await rollbackTo(rollbackTarget, session);
  } else if (agent.name === 'pre-recon') {
    console.log(chalk.blue(`📍 Rolling back to initial repository state`));
    try {
      const initialCommit = await executeGitCommandWithRetry(['git', 'log', '--reverse', '--format=%H'], session.targetRepo, 'finding initial commit');
      const firstCommit = initialCommit.stdout.trim().split('\n')[0];
      if (firstCommit) {
        await rollbackGitToCommit(session.targetRepo, firstCommit);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`⚠️ Could not find initial commit, using HEAD: ${errMsg}`));
    }
  }

  await runSingleAgent(agent.name, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, true);

  console.log(chalk.green(`✅ Agent '${agentName}' rerun completed successfully`));
};

// Run all remaining agents
export const runAll = async (
  session: Session,
  pipelineTestingMode: boolean,
  runClaudePromptWithRetry: RunClaudePromptWithRetry,
  loadPrompt: LoadPrompt
): Promise<void> => {
  const allAgentNames = Object.keys(AGENTS) as AgentName[];

  console.log(chalk.cyan(`\n🚀 Running all remaining agents to completion`));
  console.log(chalk.gray(`Current progress: ${session.completedAgents.length}/${allAgentNames.length} agents completed`));

  const remainingAgents = allAgentNames.filter(agentName =>
    !session.completedAgents.includes(agentName)
  );

  if (remainingAgents.length === 0) {
    console.log(chalk.green('✅ All agents already completed!'));
    return;
  }

  console.log(chalk.blue(`📋 Remaining agents: ${remainingAgents.join(', ')}`));
  console.log();

  for (const agentName of remainingAgents) {
    await runSingleAgent(agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
  }

  console.log(chalk.green(`\n🎉 All agents completed successfully! Session marked as completed.`));
};

// Helper for time ago calculation
const getTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
};

// Display session status
export const displayStatus = async (session: Session): Promise<void> => {
  const status = getSessionStatus(session);
  const timeAgo = getTimeAgo(session.lastActivity);

  console.log(chalk.cyan(`Session: ${new URL(session.webUrl).hostname} + ${path.basename(session.repoPath)}`));
  console.log(chalk.gray(`Session ID: ${session.id}`));
  console.log(chalk.gray(`Source Directory: ${session.targetRepo}`));

  // Check if final deliverable exists
  if (session.targetRepo) {
    const finalReportPath = path.join(session.targetRepo, 'deliverables', 'comprehensive_security_assessment_report.md');
    try {
      if (await fs.pathExists(finalReportPath)) {
        console.log(chalk.gray(`Final Deliverable Available: ${finalReportPath}`));
      }
    } catch {
      // Silently ignore
    }
  }

  const statusColor = status.status === 'completed' ? chalk.green : status.status === 'failed' ? chalk.red : chalk.blue;
  console.log(statusColor(`Status: ${status.status} (${status.completedCount}/${status.totalAgents} agents completed)`));
  console.log(chalk.gray(`Last Activity: ${timeAgo}`));

  if (session.configFile) {
    console.log(chalk.gray(`Config: ${session.configFile}`));
  }

  console.log();

  // Display agent status
  const agentList = Object.values(AGENTS).sort((a, b) => a.order - b.order);

  for (const agent of agentList) {
    let statusIcon: string, statusText: string, statusColorFn: ChalkInstance;

    if (session.completedAgents.includes(agent.name)) {
      statusIcon = '✅';
      statusText = `completed ${getTimeAgo(session.lastActivity)}`;
      statusColorFn = chalk.green;
    } else if (session.failedAgents.includes(agent.name)) {
      statusIcon = '❌';
      statusText = `failed ${getTimeAgo(session.lastActivity)}`;
      statusColorFn = chalk.red;
    } else {
      statusIcon = '⏸️';
      statusText = 'pending';
      statusColorFn = chalk.gray;
    }

    const displayName = agent.name.replace(/-/g, ' ');
    console.log(`${statusIcon} ${statusColorFn(displayName.padEnd(20))} (${statusText})`);
  }

  // Show next action
  const nextAgent = getNextAgent(session);
  if (nextAgent) {
    console.log(chalk.cyan(`\nNext: Run --run-agent ${nextAgent.name}`));
  } else if (status.failedCount > 0) {
    const failedAgent = session.failedAgents[0];
    console.log(chalk.yellow(`\nNext: Fix ${failedAgent} failure or run --rerun ${failedAgent}`));
  } else if (status.status === 'completed') {
    console.log(chalk.green('\nAll agents completed successfully! 🎉'));
  }
};

// List all available agents
export const listAgents = (): void => {
  console.log(chalk.cyan('Available Agents:'));

  const phaseNames = Object.keys(PHASES) as PhaseName[];

  phaseNames.forEach((phaseName, phaseIndex) => {
    const phaseAgents = PHASES[phaseName];
    const phaseDisplayName = phaseName.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    console.log(chalk.yellow(`\nPhase ${phaseIndex + 1} - ${phaseDisplayName}:`));

    phaseAgents.forEach(agentName => {
      const agent = AGENTS[agentName]!;
      console.log(chalk.white(`  ${agent.name.padEnd(18)} ${agent.displayName}`));
    });
  });
};
