// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { Timer } from '../utils/metrics.js';
import { formatDuration } from '../utils/formatting.js';
import { handleToolError, PentestError } from '../error-handling.js';
import { AGENTS } from '../session-manager.js';
import { runClaudePromptWithRetry } from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import type { ToolAvailability } from '../tool-checker.js';
import type { DistributedConfig } from '../types/config.js';

interface AgentResult {
  success: boolean;
  duration: number;
  cost?: number | undefined;
  error?: string | undefined;
  retryable?: boolean | undefined;
}

type ToolName = 'nmap' | 'subfinder' | 'whatweb' | 'schemathesis';
type ToolStatus = 'success' | 'skipped' | 'error';

interface TerminalScanResult {
  tool: ToolName;
  output: string;
  status: ToolStatus;
  duration: number;
  success?: boolean;
  error?: Error;
}

interface PromptVariables {
  webUrl: string;
  repoPath: string;
}

// Discriminated union for Wave1 tool results - clearer than loose union types
type Wave1ToolResult =
  | { kind: 'scan'; result: TerminalScanResult }
  | { kind: 'skipped'; message: string }
  | { kind: 'agent'; result: AgentResult };

interface Wave1Results {
  nmap: Wave1ToolResult;
  subfinder: Wave1ToolResult;
  whatweb: Wave1ToolResult;
  naabu?: Wave1ToolResult;
  codeAnalysis: AgentResult;
}

interface Wave2Results {
  schemathesis: TerminalScanResult;
}

interface PreReconResult {
  duration: number;
  report: string;
}

// Runs external security tools (nmap, whatweb, etc). Schemathesis requires schemas from code analysis.
async function runTerminalScan(tool: ToolName, target: string, sourceDir: string | null = null): Promise<TerminalScanResult> {
  const timer = new Timer(`command-${tool}`);
  try {
    let result;
    switch (tool) {
      case 'nmap': {
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const nmapHostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`nmap -sV -sC ${nmapHostname}`;
        const duration = timer.stop();
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(duration)}`));
        return { tool: 'nmap', output: result.stdout, status: 'success', duration };
      }
      case 'subfinder': {
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const hostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`subfinder -d ${hostname}`;
        const subfinderDuration = timer.stop();
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(subfinderDuration)}`));
        return { tool: 'subfinder', output: result.stdout, status: 'success', duration: subfinderDuration };
      }
      case 'whatweb': {
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const command = `whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        console.log(chalk.gray(`    Command: ${command}`));
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        const whatwebDuration = timer.stop();
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(whatwebDuration)}`));
        return { tool: 'whatweb', output: result.stdout, status: 'success', duration: whatwebDuration };
      }
      case 'schemathesis': {
        // Schemathesis depends on code analysis output - skip if no schemas found
        const schemasDir = path.join(sourceDir || '.', 'outputs', 'schemas');
        if (await fs.pathExists(schemasDir)) {
          const schemaFiles = await fs.readdir(schemasDir) as string[];
          const apiSchemas = schemaFiles.filter((f: string) => f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.yaml'));
          if (apiSchemas.length > 0) {
            console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
            const allResults: string[] = [];

            // Run schemathesis on each schema file
            for (const schemaFile of apiSchemas) {
              const schemaPath = path.join(schemasDir, schemaFile);
              try {
                result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`schemathesis run ${schemaPath} -u ${target} --max-failures=5`;
                allResults.push(`Schema: ${schemaFile}\n${result.stdout}`);
              } catch (schemaError) {
                const err = schemaError as { stdout?: string; message?: string };
                allResults.push(`Schema: ${schemaFile}\nError: ${err.stdout || err.message}`);
              }
            }

            const schemaDuration = timer.stop();
            console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(schemaDuration)}`));
            return { tool: 'schemathesis', output: allResults.join('\n\n'), status: 'success', duration: schemaDuration };
          } else {
            console.log(chalk.gray(`    ⏭️ ${tool} - no API schemas found`));
            return { tool: 'schemathesis', output: 'No API schemas found', status: 'skipped', duration: timer.stop() };
          }
        } else {
          console.log(chalk.gray(`    ⏭️ ${tool} - schemas directory not found`));
          return { tool: 'schemathesis', output: 'Schemas directory not found', status: 'skipped', duration: timer.stop() };
        }
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    const duration = timer.stop();
    console.log(chalk.red(`    ❌ ${tool} failed in ${formatDuration(duration)}`));
    return handleToolError(tool, error as Error & { code?: string }) as TerminalScanResult;
  }
}

// Wave 1: Initial footprinting + authentication
async function runPreReconWave1(
  webUrl: string,
  sourceDir: string,
  variables: PromptVariables,
  config: DistributedConfig | null,
  pipelineTestingMode: boolean = false,
  sessionId: string | null = null,
  outputPath: string | null = null
): Promise<Wave1Results> {
  console.log(chalk.blue('    → Launching Wave 1 operations in parallel...'));

  const operations: Promise<TerminalScanResult | AgentResult>[] = [];

  const skippedResult = (message: string): Wave1ToolResult => ({ kind: 'skipped', message });

  // Skip external commands in pipeline testing mode
  if (pipelineTestingMode) {
    console.log(chalk.gray('    ⏭️ Skipping external tools (pipeline testing mode)'));
    operations.push(
      runClaudePromptWithRetry(
        await loadPrompt('pre-recon-code', variables, null, pipelineTestingMode),
        sourceDir,
        '*',
        '',
        AGENTS['pre-recon'].displayName,
        'pre-recon',  // Agent name for snapshot creation
        chalk.cyan,
        { id: sessionId!, webUrl, repoPath: sourceDir, ...(outputPath && { outputPath }) }  // Session metadata for audit logging (STANDARD: use 'id' field)
      )
    );
    const [codeAnalysis] = await Promise.all(operations);
    return {
      nmap: skippedResult('Skipped (pipeline testing mode)'),
      subfinder: skippedResult('Skipped (pipeline testing mode)'),
      whatweb: skippedResult('Skipped (pipeline testing mode)'),
      codeAnalysis: codeAnalysis as AgentResult
    };
  } else {
    operations.push(
      runTerminalScan('nmap', webUrl),
      runTerminalScan('subfinder', webUrl),
      runTerminalScan('whatweb', webUrl),
      runClaudePromptWithRetry(
        await loadPrompt('pre-recon-code', variables, null, pipelineTestingMode),
        sourceDir,
        '*',
        '',
        AGENTS['pre-recon'].displayName,
        'pre-recon',  // Agent name for snapshot creation
        chalk.cyan,
        { id: sessionId!, webUrl, repoPath: sourceDir, ...(outputPath && { outputPath }) }  // Session metadata for audit logging (STANDARD: use 'id' field)
      )
    );
  }

  // Check if authentication config is provided for login instructions injection
  console.log(chalk.gray(`    → Config check: ${config ? 'present' : 'missing'}, Auth: ${config?.authentication ? 'present' : 'missing'}`));

  const [nmap, subfinder, whatweb, codeAnalysis] = await Promise.all(operations);

  return {
    nmap: { kind: 'scan', result: nmap as TerminalScanResult },
    subfinder: { kind: 'scan', result: subfinder as TerminalScanResult },
    whatweb: { kind: 'scan', result: whatweb as TerminalScanResult },
    codeAnalysis: codeAnalysis as AgentResult
  };
}

// Wave 2: Additional scanning
async function runPreReconWave2(
  webUrl: string,
  sourceDir: string,
  toolAvailability: ToolAvailability,
  pipelineTestingMode: boolean = false
): Promise<Wave2Results> {
  console.log(chalk.blue('    → Running Wave 2 additional scans in parallel...'));

  // Skip external commands in pipeline testing mode
  if (pipelineTestingMode) {
    console.log(chalk.gray('    ⏭️ Skipping external tools (pipeline testing mode)'));
    return {
      schemathesis: { tool: 'schemathesis', output: 'Skipped (pipeline testing mode)', status: 'skipped', duration: 0 }
    };
  }

  const operations: Promise<TerminalScanResult>[] = [];

  // Parallel additional scans (only run if tools are available)

  if (toolAvailability.schemathesis) {
    operations.push(runTerminalScan('schemathesis', webUrl, sourceDir));
  }

  // If no tools are available, return early
  if (operations.length === 0) {
    console.log(chalk.gray('    ⏭️ No Wave 2 tools available'));
    return {
      schemathesis: { tool: 'schemathesis', output: 'Tool not available', status: 'skipped', duration: 0 }
    };
  }

  // Run all operations in parallel
  const results = await Promise.all(operations);

  // Map results back to named properties
  const response: Wave2Results = {
    schemathesis: { tool: 'schemathesis', output: 'Tool not available', status: 'skipped', duration: 0 }
  };
  let resultIndex = 0;

  if (toolAvailability.schemathesis) {
    response.schemathesis = results[resultIndex++]!;
  } else {
    console.log(chalk.gray('    ⏭️ schemathesis - tool not available'));
  }

  return response;
}

// Extracts status and output from a Wave1 tool result
function extractResult(r: Wave1ToolResult | undefined): { status: string; output: string } {
  if (!r) return { status: 'Skipped', output: 'No output' };
  switch (r.kind) {
    case 'scan':
      return { status: r.result.status || 'Skipped', output: r.result.output || 'No output' };
    case 'skipped':
      return { status: 'Skipped', output: r.message };
    case 'agent':
      return { status: r.result.success ? 'success' : 'error', output: 'See agent output' };
  }
}

// Combines tool outputs into single deliverable. Falls back to reference if file missing.
async function stitchPreReconOutputs(wave1: Wave1Results, additionalScans: TerminalScanResult[], sourceDir: string): Promise<string> {
  // Try to read the code analysis deliverable file
  let codeAnalysisContent = 'No analysis available';
  try {
    const codeAnalysisPath = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    codeAnalysisContent = await fs.readFile(codeAnalysisPath, 'utf8');
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ Could not read code analysis deliverable: ${err.message}`));
    codeAnalysisContent = 'Analysis located in deliverables/code_analysis_deliverable.md';
  }

  // Build additional scans section
  let additionalSection = '';
  if (additionalScans.length > 0) {
    additionalSection = '\n## Authenticated Scans\n';
    for (const scan of additionalScans) {
      additionalSection += `
### ${scan.tool.toUpperCase()}
Status: ${scan.status}
${scan.output}
`;
    }
  }

  const nmap = extractResult(wave1.nmap);
  const subfinder = extractResult(wave1.subfinder);
  const whatweb = extractResult(wave1.whatweb);
  const naabu = extractResult(wave1.naabu);

  const report = `
# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: ${naabu.status}
${naabu.output}

## Network Scanning (nmap)
Status: ${nmap.status}
${nmap.output}

## Subdomain Discovery (subfinder)
Status: ${subfinder.status}
${subfinder.output}

## Technology Detection (whatweb)
Status: ${whatweb.status}
${whatweb.output}
## Code Analysis
${codeAnalysisContent}
${additionalSection}
---
Report generated at: ${new Date().toISOString()}
  `.trim();

  // Ensure deliverables directory exists in the cloned repo
  try {
    const deliverablePath = path.join(sourceDir, 'deliverables', 'pre_recon_deliverable.md');
    await fs.ensureDir(path.join(sourceDir, 'deliverables'));

    // Write to file in the cloned repository
    await fs.writeFile(deliverablePath, report);
  } catch (error) {
    const err = error as Error;
    throw new PentestError(
      `Failed to write pre-recon report: ${err.message}`,
      'filesystem',
      false,
      { sourceDir, originalError: err.message }
    );
  }

  return report;
}

// Main pre-recon phase execution function
export async function executePreReconPhase(
  webUrl: string,
  sourceDir: string,
  variables: PromptVariables,
  config: DistributedConfig | null,
  toolAvailability: ToolAvailability,
  pipelineTestingMode: boolean,
  sessionId: string | null = null,
  outputPath: string | null = null
): Promise<PreReconResult> {
  console.log(chalk.yellow.bold('\n🔍 PHASE 1: PRE-RECONNAISSANCE'));
  const timer = new Timer('phase-1-pre-recon');

  console.log(chalk.yellow('Wave 1: Initial footprinting...'));
  const wave1Results = await runPreReconWave1(webUrl, sourceDir, variables, config, pipelineTestingMode, sessionId, outputPath);
  console.log(chalk.green('  ✅ Wave 1 operations completed'));

  console.log(chalk.yellow('Wave 2: Additional scanning...'));
  const wave2Results = await runPreReconWave2(webUrl, sourceDir, toolAvailability, pipelineTestingMode);
  console.log(chalk.green('  ✅ Wave 2 operations completed'));

  console.log(chalk.blue('📝 Stitching pre-recon outputs...'));
  const additionalScans = wave2Results.schemathesis ? [wave2Results.schemathesis] : [];
  const preReconReport = await stitchPreReconOutputs(wave1Results, additionalScans, sourceDir);
  const duration = timer.stop();

  console.log(chalk.green(`✅ Pre-reconnaissance complete in ${formatDuration(duration)}`));
  console.log(chalk.green(`💾 Saved to ${sourceDir}/deliverables/pre_recon_deliverable.md`));

  return { duration, report: preReconReport };
}
