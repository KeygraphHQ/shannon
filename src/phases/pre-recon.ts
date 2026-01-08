// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { Timer, timingResults } from '../utils/metrics.js';
import { formatDuration } from '../audit/utils.js';
import { handleToolError, PentestError } from '../error-handling.js';
import { AGENTS } from '../session-manager.js';
import { runClaudePromptWithRetry } from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import type { ToolAvailability } from '../tool-checker.js';
import type { DistributedConfig } from '../types/config.js';
import type { AgentResult } from '../checkpoint-manager.js';

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

interface Wave1Results {
  nmap: TerminalScanResult | string | AgentResult;
  subfinder: TerminalScanResult | string | AgentResult;
  whatweb: TerminalScanResult | string | AgentResult;
  naabu?: TerminalScanResult | string | AgentResult;
  codeAnalysis: AgentResult;
}

interface Wave2Results {
  schemathesis: TerminalScanResult;
}

interface PreReconResult {
  duration: number;
  report: string;
}

// Pure function: Run terminal scanning tools
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
        timingResults.commands[tool] = duration;
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(duration)}`));
        return { tool: 'nmap', output: result.stdout, status: 'success', duration };
      }
      case 'subfinder': {
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const hostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`subfinder -d ${hostname}`;
        const subfinderDuration = timer.stop();
        timingResults.commands[tool] = subfinderDuration;
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(subfinderDuration)}`));
        return { tool: 'subfinder', output: result.stdout, status: 'success', duration: subfinderDuration };
      }
      case 'whatweb': {
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const command = `whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        console.log(chalk.gray(`    Command: ${command}`));
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        const whatwebDuration = timer.stop();
        timingResults.commands[tool] = whatwebDuration;
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(whatwebDuration)}`));
        return { tool: 'whatweb', output: result.stdout, status: 'success', duration: whatwebDuration };
      }
      case 'schemathesis': {
        // Only run if API schemas found
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
            timingResults.commands[tool] = schemaDuration;
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
    timingResults.commands[tool] = duration;
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
      nmap: 'Skipped (pipeline testing mode)',
      subfinder: 'Skipped (pipeline testing mode)',
      whatweb: 'Skipped (pipeline testing mode)',
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
    nmap: nmap as TerminalScanResult,
    subfinder: subfinder as TerminalScanResult,
    whatweb: whatweb as TerminalScanResult,
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

// Helper type for stitching results
interface StitchableResult {
  status?: string;
  output?: string;
  tool?: string;
}

// Pure function: Stitch together pre-recon outputs and save to file
async function stitchPreReconOutputs(outputs: (StitchableResult | string | undefined)[], sourceDir: string): Promise<string> {
  const [nmap, subfinder, whatweb, naabu, codeAnalysis, ...additionalScans] = outputs;

  // Try to read the code analysis deliverable file
  let codeAnalysisContent = 'No analysis available';
  try {
    const codeAnalysisPath = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    codeAnalysisContent = await fs.readFile(codeAnalysisPath, 'utf8');
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ Could not read code analysis deliverable: ${err.message}`));
    // Fallback message if file doesn't exist
    codeAnalysisContent = 'Analysis located in deliverables/code_analysis_deliverable.md';
  }


  // Build additional scans section
  let additionalSection = '';
  if (additionalScans && additionalScans.length > 0) {
    additionalSection = '\n## Authenticated Scans\n';
    additionalScans.forEach(scan => {
      const s = scan as StitchableResult;
      if (s && s.tool) {
        additionalSection += `
### ${s.tool.toUpperCase()}
Status: ${s.status}
${s.output}
`;
      }
    });
  }

  const nmapResult = nmap as StitchableResult | string | undefined;
  const subfinderResult = subfinder as StitchableResult | string | undefined;
  const whatwebResult = whatweb as StitchableResult | string | undefined;
  const naabuResult = naabu as StitchableResult | string | undefined;

  const getStatus = (r: StitchableResult | string | undefined): string => {
    if (!r) return 'Skipped';
    if (typeof r === 'string') return 'Skipped';
    return r.status || 'Skipped';
  };

  const getOutput = (r: StitchableResult | string | undefined): string => {
    if (!r) return 'No output';
    if (typeof r === 'string') return r;
    return r.output || 'No output';
  };

  const report = `
# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: ${getStatus(naabuResult)}
${getOutput(naabuResult)}

## Network Scanning (nmap)
Status: ${getStatus(nmapResult)}
${getOutput(nmapResult)}

## Subdomain Discovery (subfinder)
Status: ${getStatus(subfinderResult)}
${getOutput(subfinderResult)}

## Technology Detection (whatweb)
Status: ${getStatus(whatwebResult)}
${getOutput(whatwebResult)}
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
  // Combine wave 1 and wave 2 results for stitching
  const allResults: (StitchableResult | string | undefined)[] = [
    wave1Results.nmap as StitchableResult | string,
    wave1Results.subfinder as StitchableResult | string,
    wave1Results.whatweb as StitchableResult | string,
    wave1Results.naabu as StitchableResult | string | undefined,
    wave1Results.codeAnalysis as unknown as StitchableResult,
    ...(wave2Results.schemathesis ? [wave2Results.schemathesis as StitchableResult] : [])
  ];
  const preReconReport = await stitchPreReconOutputs(allResults, sourceDir);
  const duration = timer.stop();

  console.log(chalk.green(`✅ Pre-reconnaissance complete in ${formatDuration(duration)}`));
  console.log(chalk.green(`💾 Saved to ${sourceDir}/deliverables/pre_recon_deliverable.md`));

  return { duration, report: preReconReport };
}
