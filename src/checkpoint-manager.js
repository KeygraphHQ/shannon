// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path, $ } from 'zx';
import chalk from 'chalk';
import { PentestError } from './error-handling.js';
import { parseConfig, distributeConfig } from './config-parser.js';
import { executeGitCommandWithRetry } from './utils/git-manager.js';
import { formatDuration } from './audit/utils.js';
import {
  AGENTS,
  PHASES,
  selectSession,
  validateAgent,
  validateAgentRange,
  validatePhase,
  checkPrerequisites,
  getNextAgent,
  markAgentCompleted,
  markAgentFailed,
  getSessionStatus,
  rollbackToAgent,
  updateSession
} from './session-manager.js';

// Check if target repository exists and is accessible
const validateTargetRepo = async (targetRepo) => {
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
export const getGitCommitHash = async (targetRepo) => {
  try {
    const result = await executeGitCommandWithRetry(['git', 'rev-parse', 'HEAD'], targetRepo, 'getting commit hash');
    return result.stdout.trim();
  } catch (error) {
    throw new PentestError(
      `Failed to get git commit hash: ${error.message}`,
      'git',
      false,
      { targetRepo, originalError: error.message }
    );
  }
};

// Rollback git workspace to specific commit
const rollbackGitToCommit = async (targetRepo, commitHash) => {
  try {
    await executeGitCommandWithRetry(['git', 'reset', '--hard', commitHash], targetRepo, 'rollback to commit');
    await executeGitCommandWithRetry(['git', 'clean', '-fd'], targetRepo, 'cleaning after rollback');
    console.log(chalk.green(`✅ Git workspace rolled back to commit ${commitHash.substring(0, 8)}`));
  } catch (error) {
    throw new PentestError(
      `Failed to rollback git workspace: ${error.message}`,
      'git',
      false,
      { targetRepo, commitHash, originalError: error.message }
    );
  }
};

// Run a single agent with retry logic and checkpointing
const runSingleAgent = async (agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, allowRerun = false, skipWorkspaceClean = false) => {
  // Validate agent first
  const agent = validateAgent(agentName);

  console.log(chalk.cyan(`\n🤖 Running agent: ${agent.displayName}`));
  
  // Reload session to get latest state (important for agent ranges)
  const { getSession } = await import('./session-manager.js');
  const freshSession = await getSession(session.id);
  if (!freshSession) {
    throw new PentestError(`Session ${session.id} not found`, 'validation', false);
  }
  
  // Use fresh session for all subsequent checks
  session = freshSession;
  
  // Warn if session is completed
  if (session.status === 'completed') {
    console.log(chalk.yellow('⚠️  This session is already completed. Re-running will modify completed results.'));
  }
  
  // Block re-running completed agents unless explicitly allowed - use --rerun for explicit rollback and re-run
  if (!allowRerun && session.completedAgents.includes(agentName)) {
    throw new PentestError(
      `Agent '${agentName}' has already been completed. Use --rerun ${agentName} for explicit rollback and re-execution.`,
      'validation',
      false,
      { 
        agentName, 
        suggestion: `--rerun ${agentName}`,
        completedAgents: session.completedAgents 
      }
    );
  }
  
  const targetRepo = session.targetRepo;
  await validateTargetRepo(targetRepo);
  
  // Check prerequisites
  checkPrerequisites(session, agentName);
  
  // Additional safety check: if this agent is not completed but we have uncommitted changes,
  // it might be from a previous interrupted run. Clean the workspace to be safe.
  // Skip workspace cleaning during parallel execution to avoid agents interfering with each other
  if (!session.completedAgents.includes(agentName) && !allowRerun && !skipWorkspaceClean) {
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
      console.log(chalk.yellow(`    ⚠️ Could not check/clean workspace: ${error.message}`));
    }
  }
  
  // Create checkpoint before execution
  const variables = {
    webUrl: session.webUrl,
    repoPath: session.repoPath,
    sourceDir: targetRepo
  };
  
  // Handle relative config paths - prepend configs/ if needed
  let configPath = null;
  if (session.configFile) {
    configPath = path.isAbsolute(session.configFile) || session.configFile.startsWith('configs/')
      ? session.configFile
      : path.join('configs', session.configFile);
  }
  
  const config = configPath ? await parseConfig(configPath) : null;
  const distributedConfig = config ? distributeConfig(config) : null;
  // Removed prompt snapshotting - using live prompts from repo

  // Initialize variables that will be used in both try and catch blocks
  let validationData = null;
  let timingData = null;
  let costData = null;

  try {
    // Load and run the appropriate prompt
    let promptName = getPromptName(agentName);
    const prompt = await loadPrompt(promptName, variables, distributedConfig, pipelineTestingMode);
    
    // Get color function for this agent
    const getAgentColor = (agentName) => {
      const colorMap = {
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

    const result = await runClaudePromptWithRetry(
      prompt,
      targetRepo,
      '*',
      '',
      AGENTS[agentName].displayName,
      agentName,  // Pass agent name for snapshot creation
      getAgentColor(agentName),  // Pass color function for this agent
      { id: session.id, webUrl: session.webUrl, repoPath: session.repoPath }  // Session metadata for audit logging
    );
    
    if (!result.success) {
      throw new PentestError(
        `Agent execution failed: ${result.error}`,
        'agent',
        result.retryable || false,
        { agentName, result }
      );
    }
    
    // Get commit hash for checkpoint
    const commitHash = await getGitCommitHash(targetRepo);
    
    // Extract timing and cost data from result if available
    timingData = result.duration;
    costData = result.cost || 0;

    if (agentName.includes('-vuln')) {
      // Extract vulnerability type from agent name (e.g., 'injection-vuln' -> 'injection')
      const vulnType = agentName.replace('-vuln', '');
      try {
        const { safeValidateQueueAndDeliverable } = await import('./queue-validation.js');
        const validation = await safeValidateQueueAndDeliverable(vulnType, targetRepo);

        if (validation.success) {
          // Log validation result (don't store - will be re-validated during exploitation phase)
          console.log(chalk.blue(`📋 Validation: ${validation.data.shouldExploit ? `Ready for exploitation (${validation.data.vulnerabilityCount} vulnerabilities)` : 'No vulnerabilities found'}`));
          validationData = {
            shouldExploit: validation.data.shouldExploit,
            vulnerabilityCount: validation.data.vulnerabilityCount
          };
        } else {
          console.log(chalk.yellow(`⚠️ Validation failed: ${validation.error.message}`));
        }
      } catch (validationError) {
        console.log(chalk.yellow(`⚠️ Could not validate ${vulnType}: ${validationError.message}`));
      }
    }

    // Mark agent as completed (validation not stored - will be re-checked during exploitation)
    await markAgentCompleted(session.id, agentName, commitHash);

    // Only show completion message for sequential execution
    if (!skipWorkspaceClean) {
      console.log(chalk.green(`✅ Agent '${agentName}' completed successfully`));
    }

    // Return immutable result object with enhanced metadata
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
    await markAgentFailed(session.id, agentName);

    // Only show failure message for sequential execution
    if (!skipWorkspaceClean) {
      console.log(chalk.red(`❌ Agent '${agentName}' failed: ${error.message}`));
    }

    // Return immutable error object with enhanced context
    const errorResult = Object.freeze({
      success: false,
      agentName,
      error: {
        message: error.message,
        type: error.constructor.name,
        retryable: error.retryable || false,
        originalError: error
      },
      validation: validationData,
      timing: timingData,
      failedAt: new Date().toISOString(),
      context: {
        targetRepo,
        promptName: getPromptName(agentName),
        sessionId: session.id
      }
    });

    // Throw enhanced error with preserved context
    const enhancedError = new PentestError(
      `Agent '${agentName}' execution failed: ${error.message}`,
      'agent',
      error.retryable || false,
      {
        agentName,
        sessionId: session.id,
        originalError: error.message,
        errorResult
      }
    );

    throw enhancedError;
  }
};

// Run multiple agents in sequence
const runAgentRange = async (startAgent, endAgent, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) => {
  const agents = validateAgentRange(startAgent, endAgent);
  
  console.log(chalk.cyan(`\n🔄 Running agent range: ${startAgent} to ${endAgent} (${agents.length} agents)`));
  
  for (const agent of agents) {
    // Skip if already completed
    if (session.completedAgents.includes(agent.name)) {
      console.log(chalk.gray(`⏭️  Agent '${agent.name}' already completed, skipping`));
      continue;
    }
    
    try {
      await runSingleAgent(agent.name, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
    } catch (error) {
      console.log(chalk.red(`❌ Agent range execution stopped at '${agent.name}' due to failure`));
      throw error;
    }
  }
  
  console.log(chalk.green(`✅ Agent range ${startAgent} to ${endAgent} completed successfully`));
};

// Run vulnerability agents in parallel
const runParallelVuln = async (session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) => {
  const vulnAgents = ['injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln'];
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

      let lastError;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const result = await runSingleAgent(agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, false, true);
          return { agentName, ...result, attempts };
        } catch (error) {
          lastError = error;
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

  // Process and display results in a nice table
  console.log(chalk.cyan('\n📊 Vulnerability Analysis Results'));
  console.log(chalk.gray('─'.repeat(80)));

  // Table header
  console.log(chalk.bold('Agent                  Status     Vulns  Attempt  Duration    Cost'));
  console.log(chalk.gray('─'.repeat(80)));

  const completed = [];
  const failed = [];

  results.forEach((result, index) => {
    const agentName = activeAgents[index];
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

      // Show log file path for detailed review
      if (data.logFile) {
        const relativePath = path.relative(process.cwd(), data.logFile);
        console.log(chalk.gray(`  └─ Detailed log: ${relativePath}`));
      }
    } else {
      const error = result.reason.error || result.reason;
      failed.push({ agent: agentName, error: error.message });

      const attempts = result.reason.attempts || 3; // Default to 3 if not available

      console.log(
        `${chalk.red(agentDisplay)} ${chalk.red('✗ Failed ')}     -  ` +
        `${attempts}/3      -           -`
      );
      console.log(chalk.gray(`  └─ ${error.message.substring(0, 60)}...`));
    }
  });

  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.cyan(`Summary: ${completed.length}/${activeAgents.length} succeeded in ${formatDuration(totalDuration)}`));

  return { completed, failed };
};

// Run exploitation agents in parallel
const runParallelExploit = async (session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) => {
  const exploitAgents = ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'];

  // Get fresh session data to ensure we have the latest vulnerability analysis results
  // This prevents race conditions where parallel vuln agents haven't updated session state yet
  const { getSession } = await import('./session-manager.js');
  const freshSession = await getSession(session.id);

  // Load validation module
  const { safeValidateQueueAndDeliverable } = await import('./queue-validation.js');

  // Only run exploit agents whose vuln counterparts completed successfully AND found vulnerabilities
  const eligibilityChecks = await Promise.all(
    exploitAgents.map(async (agentName) => {
      const vulnAgentName = agentName.replace('-exploit', '-vuln');

      // Must have completed the vulnerability analysis
      if (!freshSession.completedAgents.includes(vulnAgentName)) {
        return { agentName, eligible: false };
      }

      // Check if vulnerabilities were found by validating the queue file
      const vulnType = vulnAgentName.replace('-vuln', ''); // "injection-vuln" -> "injection"
      const validation = await safeValidateQueueAndDeliverable(vulnType, freshSession.targetRepo);

      if (!validation.success || !validation.data.shouldExploit) {
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

  // Collect all results without logging individual completions
  const results = await Promise.allSettled(
    activeAgents.map(async (agentName, index) => {
      // Add 2-second stagger to prevent API overwhelm
      await new Promise(resolve => setTimeout(resolve, index * 2000));

      let lastError;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const result = await runSingleAgent(agentName, freshSession, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, false, true);
          return { agentName, ...result, attempts };
        } catch (error) {
          lastError = error;
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

  // Process and display results in a nice table
  console.log(chalk.cyan('\n🎯 Exploitation Results'));
  console.log(chalk.gray('─'.repeat(80)));

  // Table header
  console.log(chalk.bold('Agent                  Status     Result Attempt  Duration    Cost'));
  console.log(chalk.gray('─'.repeat(80)));

  const completed = [];
  const failed = [];

  results.forEach((result, index) => {
    const agentName = activeAgents[index];
    const agentDisplay = agentName.padEnd(22);

    if (result.status === 'fulfilled') {
      const data = result.value;
      completed.push(agentName);

      const exploitResult = 'Success'; // Could be enhanced to show actual exploitation result
      const duration = formatDuration(data.timing || 0);
      const cost = `$${(data.cost || 0).toFixed(4)}`;

      console.log(
        `${chalk.green(agentDisplay)} ${chalk.green('✓ Success')}  ${exploitResult.padEnd(6)}  ` +
        `${data.attempts}/3      ${duration.padEnd(11)} ${cost}`
      );

      // Show log file path for detailed review
      if (data.logFile) {
        const relativePath = path.relative(process.cwd(), data.logFile);
        console.log(chalk.gray(`  └─ Detailed log: ${relativePath}`));
      }
    } else {
      const error = result.reason.error || result.reason;
      failed.push({ agent: agentName, error: error.message });

      const attempts = result.reason.attempts || 3; // Default to 3 if not available

      console.log(
        `${chalk.red(agentDisplay)} ${chalk.red('✗ Failed ')}  -      ` +
        `${attempts}/3      -           -`
      );
      console.log(chalk.gray(`  └─ ${error.message.substring(0, 60)}...`));
    }
  });

  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.cyan(`Summary: ${completed.length}/${activeAgents.length} succeeded in ${formatDuration(totalDuration)}`));

  return { completed, failed };
};

// Run all agents in a phase
export const runPhase = async (phaseName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) => {
  console.log(chalk.cyan(`\n📋 Running phase: ${phaseName} (parallel execution)`));

  // Use parallel execution for both vulnerability-analysis and exploitation phases
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

  // For other phases (pre-reconnaissance, reconnaissance, reporting), run the single agent
  const agents = validatePhase(phaseName);
  if (agents.length === 1) {
    const agent = agents[0];
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
export const rollbackTo = async (targetAgent, session) => {
  console.log(chalk.yellow(`🔄 Rolling back to agent: ${targetAgent}`));
  
  await validateTargetRepo(session.targetRepo);
  validateAgent(targetAgent);
  
  if (!session.checkpoints[targetAgent]) {
    throw new PentestError(
      `No checkpoint found for agent '${targetAgent}' in session history`,
      'validation',
      false,
      { targetAgent, availableCheckpoints: Object.keys(session.checkpoints) }
    );
  }
  
  const commitHash = session.checkpoints[targetAgent];

  // Rollback git workspace
  await rollbackGitToCommit(session.targetRepo, commitHash);

  // Update session state (removes agents from completedAgents)
  await rollbackToAgent(session.id, targetAgent);

  // Mark rolled-back agents in audit system (for forensic trail)
  try {
    const { AuditSession } = await import('./audit/index.js');
    const auditSession = new AuditSession(session);
    await auditSession.initialize();

    // Find agents that were rolled back (agents after targetAgent)
    const targetOrder = AGENTS[targetAgent].order;
    const rolledBackAgents = Object.values(AGENTS)
      .filter(agent => agent.order > targetOrder)
      .map(agent => agent.name);

    // Mark them as rolled-back in audit system
    if (rolledBackAgents.length > 0) {
      await auditSession.markMultipleRolledBack(rolledBackAgents);
      console.log(chalk.gray(`   Marked ${rolledBackAgents.length} agents as rolled-back in audit logs`));
    }
  } catch (error) {
    // Non-critical: rollback succeeded even if audit update failed
    console.log(chalk.yellow(`   ⚠️ Failed to update audit logs: ${error.message}`));
  }

  console.log(chalk.green(`✅ Successfully rolled back to agent '${targetAgent}'`));
};

// Rerun specific agent (rollback to previous + run current)
export const rerunAgent = async (agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) => {
  console.log(chalk.cyan(`🔁 Rerunning agent: ${agentName}`));
  
  const agent = validateAgent(agentName);
  
  // Find previous agent checkpoint or initial state
  let rollbackTarget = null;
  if (agent.prerequisites.length > 0) {
    // Find the last completed prerequisite
    const completedPrereqs = agent.prerequisites.filter(prereq => 
      session.completedAgents.includes(prereq)
    );
    if (completedPrereqs.length > 0) {
      // Get the prerequisite with highest order
      rollbackTarget = completedPrereqs.reduce((latest, current) => 
        AGENTS[current].order > AGENTS[latest].order ? current : latest
      );
    }
  }
  
  if (rollbackTarget) {
    console.log(chalk.blue(`📍 Rolling back to prerequisite: ${rollbackTarget}`));
    await rollbackTo(rollbackTarget, session);
  } else if (agent.name === 'pre-recon') {
    // Special case: rollback to initial clone
    console.log(chalk.blue(`📍 Rolling back to initial repository state`));
    try {
      const initialCommit = await executeGitCommandWithRetry(['git', 'log', '--reverse', '--format=%H'], session.targetRepo, 'finding initial commit');
      const firstCommit = initialCommit.stdout.trim().split('\n')[0];
      await rollbackGitToCommit(session.targetRepo, firstCommit);
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Could not find initial commit, using HEAD: ${error.message}`));
    }
  }
  
  // Run the target agent (allow rerun since we've explicitly rolled back)
  await runSingleAgent(agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt, true);
  
  console.log(chalk.green(`✅ Agent '${agentName}' rerun completed successfully`));
};

// Run all remaining agents to completion
export const runAll = async (session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) => {
  // Get all agents in order
  const allAgentNames = Object.keys(AGENTS);
  
  console.log(chalk.cyan(`\n🚀 Running all remaining agents to completion`));
  console.log(chalk.gray(`Current progress: ${session.completedAgents.length}/${allAgentNames.length} agents completed`));
  
  // Find remaining agents (not yet completed)
  const remainingAgents = allAgentNames.filter(agentName => 
    !session.completedAgents.includes(agentName)
  );
  
  if (remainingAgents.length === 0) {
    console.log(chalk.green('✅ All agents already completed!'));
    return;
  }
  
  console.log(chalk.blue(`📋 Remaining agents: ${remainingAgents.join(', ')}`));
  console.log();
  
  // Run each remaining agent in sequence
  for (const agentName of remainingAgents) {
    await runSingleAgent(agentName, session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
  }
  
  console.log(chalk.green(`\n🎉 All agents completed successfully! Session marked as completed.`));
};

// Display session status
export const displayStatus = async (session) => {
  const status = getSessionStatus(session);
  const timeAgo = getTimeAgo(session.lastActivity);
  
  console.log(chalk.cyan(`Session: ${new URL(session.webUrl).hostname} + ${path.basename(session.repoPath)}`));
  console.log(chalk.gray(`Session ID: ${session.id}`));
  console.log(chalk.gray(`Source Directory: ${session.targetRepo}`));
  
  // Check if final deliverable exists and show its path
  if (session.targetRepo) {
    const finalReportPath = path.join(session.targetRepo, 'deliverables', 'comprehensive_security_assessment_report.md');
    try {
      if (await fs.pathExists(finalReportPath)) {
        console.log(chalk.gray(`Final Deliverable Available: ${finalReportPath}`));
      }
    } catch (error) {
      // Silently ignore if we can't check the file
    }
  }
  
  const statusColor = status.status === 'completed' ? chalk.green : status.status === 'failed' ? chalk.red : chalk.blue;
  console.log(statusColor(`Status: ${status.status} (${status.completedCount}/${status.totalAgents} agents completed)`));
  console.log(chalk.gray(`Last Activity: ${timeAgo}`));
  
  if (session.configFile) {
    console.log(chalk.gray(`Config: ${session.configFile}`));
  }
  
  // Display cost and timing breakdown if available
  if (session.costBreakdown || session.timingBreakdown) {
    console.log(); // Empty line before metrics
    
    if (session.timingBreakdown) {
      console.log(chalk.blue('⏱️  Timing Breakdown:'));
      console.log(chalk.gray(`   Total Execution: ${formatDuration(session.timingBreakdown.total || 0)}`));
      
      if (session.timingBreakdown.phases) {
        Object.entries(session.timingBreakdown.phases).forEach(([phase, duration]) => {
          console.log(chalk.gray(`   ${phase}: ${formatDuration(duration)}`));
        });
      }
      
      if (session.timingBreakdown.agents) {
        console.log(chalk.gray('   Per Agent:'));
        Object.entries(session.timingBreakdown.agents).forEach(([agent, duration]) => {
          console.log(chalk.gray(`     ${agent}: ${formatDuration(duration)}`));
        });
      }
    }
    
    if (session.costBreakdown) {
      console.log(chalk.blue('💰 Cost Breakdown:'));
      console.log(chalk.gray(`   Total Cost: $${(session.costBreakdown.total || 0).toFixed(4)}`));
      
      if (session.costBreakdown.agents) {
        console.log(chalk.gray('   Per Agent:'));
        Object.entries(session.costBreakdown.agents).forEach(([agent, cost]) => {
          console.log(chalk.gray(`     ${agent}: $${cost.toFixed(4)}`));
        });
      }
    }
  }
  
  console.log(); // Empty line
  
  // Display agent status
  const agentList = Object.values(AGENTS).sort((a, b) => a.order - b.order);
  
  for (const agent of agentList) {
    let statusIcon, statusText, statusColor;
    
    if (session.completedAgents.includes(agent.name)) {
      statusIcon = '✅';
      statusText = `completed ${getTimeAgoForAgent(session, agent.name)}`;
      statusColor = chalk.green;
    } else if (session.failedAgents.includes(agent.name)) {
      statusIcon = '❌';
      statusText = `failed ${getTimeAgoForAgent(session, agent.name)}`;
      statusColor = chalk.red;
    } else {
      statusIcon = '⏸️';
      statusText = 'pending';
      statusColor = chalk.gray;
    }
    
    const displayName = agent.name.replace(/-/g, ' ');
    console.log(`${statusIcon} ${statusColor(displayName.padEnd(20))} (${statusText})`);
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
export const listAgents = () => {
  console.log(chalk.cyan('Available Agents:'));
  
  const phaseNames = Object.keys(PHASES);
  
  phaseNames.forEach((phaseName, phaseIndex) => {
    const phaseAgents = PHASES[phaseName];
    const phaseDisplayName = phaseName.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    console.log(chalk.yellow(`\nPhase ${phaseIndex + 1} - ${phaseDisplayName}:`));
    
    phaseAgents.forEach(agentName => {
      const agent = AGENTS[agentName];
      console.log(chalk.white(`  ${agent.name.padEnd(18)} ${agent.displayName}`));
    });
  });
};

// Helper function to get prompt name from agent name
const getPromptName = (agentName) => {
  const mappings = {
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
  
  return mappings[agentName] || agentName;
};

// Helper function to get time ago for specific agent
const getTimeAgoForAgent = (session, agentName) => {
  // This would need to be implemented based on session checkpoint timestamps
  // For now, just return relative to last activity
  return getTimeAgo(session.lastActivity);
};

// Helper function for time ago calculation
const getTimeAgo = (timestamp) => {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  
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

