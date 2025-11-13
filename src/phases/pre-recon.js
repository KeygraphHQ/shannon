// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { Timer, timingResults } from '../utils/metrics.js';
import { formatDuration } from '../audit/utils.js';
import { handleToolError, PentestError } from '../error-handling.js';
import { AGENTS } from '../session-manager.js';
import { runClaudePromptWithRetry } from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';

// Pure function: Run terminal scanning tools
async function runTerminalScan(tool, target, sourceDir = null) {
  const timer = new Timer(`command-${tool}`);
  try {
    let command, result;
    switch (tool) {
      case 'nmap':
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const nmapHostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`nmap -sV -sC ${nmapHostname}`;
        const duration = timer.stop();
        timingResults.commands[tool] = duration;
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(duration)}`));
        return { tool: 'nmap', output: result.stdout, status: 'success', duration };
      case 'subfinder':
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        const hostname = new URL(target).hostname;
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`subfinder -d ${hostname}`;
        const subfinderDuration = timer.stop();
        timingResults.commands[tool] = subfinderDuration;
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(subfinderDuration)}`));
        return { tool: 'subfinder', output: result.stdout, status: 'success', duration: subfinderDuration };
      case 'whatweb':
        console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
        command = `whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        console.log(chalk.gray(`    Command: ${command}`));
        result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`whatweb --open-timeout 30 --read-timeout 60 ${target}`;
        const whatwebDuration = timer.stop();
        timingResults.commands[tool] = whatwebDuration;
        console.log(chalk.green(`    ✅ ${tool} completed in ${formatDuration(whatwebDuration)}`));
        return { tool: 'whatweb', output: result.stdout, status: 'success', duration: whatwebDuration };
      case 'schemathesis':
        // Only run if API schemas found
        const schemasDir = path.join(sourceDir || '.', 'outputs', 'schemas');
        if (await fs.pathExists(schemasDir)) {
          const schemaFiles = await fs.readdir(schemasDir);
          const apiSchemas = schemaFiles.filter(f => f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.yaml'));
          if (apiSchemas.length > 0) {
            console.log(chalk.blue(`    🔍 Running ${tool} scan...`));
            let allResults = [];

            // Run schemathesis on each schema file
            for (const schemaFile of apiSchemas) {
              const schemaPath = path.join(schemasDir, schemaFile);
              try {
                result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`schemathesis run ${schemaPath} -u ${target} --max-failures=5`;
                allResults.push(`Schema: ${schemaFile}\n${result.stdout}`);
              } catch (schemaError) {
                allResults.push(`Schema: ${schemaFile}\nError: ${schemaError.stdout || schemaError.message}`);
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
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    const duration = timer.stop();
    timingResults.commands[tool] = duration;
    console.log(chalk.red(`    ❌ ${tool} failed in ${formatDuration(duration)}`));
    return handleToolError(tool, error);
  }
}

// Wave 1: Initial footprinting + authentication
async function runPreReconWave1(webUrl, sourceDir, variables, config, pipelineTestingMode = false, sessionId = null) {
  console.log(chalk.blue('    → Launching Wave 1 operations in parallel...'));

  const operations = [];

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
        { id: sessionId, webUrl }  // Session metadata for audit logging (STANDARD: use 'id' field)
      )
    );
    const [codeAnalysis] = await Promise.all(operations);
    return {
      nmap: 'Skipped (pipeline testing mode)',
      subfinder: 'Skipped (pipeline testing mode)',
      whatweb: 'Skipped (pipeline testing mode)',

      codeAnalysis
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
        { id: sessionId, webUrl }  // Session metadata for audit logging (STANDARD: use 'id' field)
      )
    );
  }

  // Check if authentication config is provided for login instructions injection
  console.log(chalk.gray(`    → Config check: ${config ? 'present' : 'missing'}, Auth: ${config?.authentication ? 'present' : 'missing'}`));

  const [nmap, subfinder, whatweb, naabu, codeAnalysis] = await Promise.all(operations);

  return { nmap, subfinder, whatweb, naabu, codeAnalysis };
}

// Wave 2: Additional scanning
async function runPreReconWave2(webUrl, sourceDir, toolAvailability, pipelineTestingMode = false) {
  console.log(chalk.blue('    → Running Wave 2 additional scans in parallel...'));

  // Skip external commands in pipeline testing mode
  if (pipelineTestingMode) {
    console.log(chalk.gray('    ⏭️ Skipping external tools (pipeline testing mode)'));
    return {
      schemathesis: { tool: 'schemathesis', output: 'Skipped (pipeline testing mode)', status: 'skipped', duration: 0 }
    };
  }

  const operations = [];

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
  const response = {};
  let resultIndex = 0;

  if (toolAvailability.schemathesis) {
    response.schemathesis = results[resultIndex++];
  } else {
    console.log(chalk.gray('    ⏭️ schemathesis - tool not available'));
    response.schemathesis = { tool: 'schemathesis', output: 'Tool not available', status: 'skipped', duration: 0 };
  }

  return response;
}

// Pure function: Stitch together pre-recon outputs and save to file
async function stitchPreReconOutputs(outputs, sourceDir) {
  const [nmap, subfinder, whatweb, naabu, codeAnalysis, ...additionalScans] = outputs;

  // Try to read the code analysis deliverable file
  let codeAnalysisContent = 'No analysis available';
  try {
    const codeAnalysisPath = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    codeAnalysisContent = await fs.readFile(codeAnalysisPath, 'utf8');
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Could not read code analysis deliverable: ${error.message}`));
    // Fallback message if file doesn't exist
    codeAnalysisContent = 'Analysis located in deliverables/code_analysis_deliverable.md';
  }


  // Build additional scans section
  let additionalSection = '';
  if (additionalScans && additionalScans.length > 0) {
    additionalSection = '\n## Authenticated Scans\n';
    additionalScans.forEach(scan => {
      if (scan && scan.tool) {
        additionalSection += `
### ${scan.tool.toUpperCase()}
Status: ${scan.status}
${scan.output}
`;
      }
    });
  }

  const report = `
# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: ${naabu?.status || 'Skipped'}
${naabu?.output || naabu || 'No output'}

## Network Scanning (nmap)
Status: ${nmap?.status || 'Skipped'}
${nmap?.output || nmap || 'No output'}

## Subdomain Discovery (subfinder)
Status: ${subfinder?.status || 'Skipped'}
${subfinder?.output || subfinder || 'No output'}

## Technology Detection (whatweb)
Status: ${whatweb?.status || 'Skipped'}
${whatweb?.output || whatweb || 'No output'}
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
    throw new PentestError(
      `Failed to write pre-recon report: ${error.message}`,
      'filesystem',
      false,
      { sourceDir, originalError: error.message }
    );
  }

  return report;
}

// Main pre-recon phase execution function
export async function executePreReconPhase(webUrl, sourceDir, variables, config, toolAvailability, pipelineTestingMode, sessionId = null) {
  console.log(chalk.yellow.bold('\n🔍 PHASE 1: PRE-RECONNAISSANCE'));
  const timer = new Timer('phase-1-pre-recon');

  console.log(chalk.yellow('Wave 1: Initial footprinting...'));
  const wave1Results = await runPreReconWave1(webUrl, sourceDir, variables, config, pipelineTestingMode, sessionId);
  console.log(chalk.green('  ✅ Wave 1 operations completed'));

  console.log(chalk.yellow('Wave 2: Additional scanning...'));
  const wave2Results = await runPreReconWave2(webUrl, sourceDir, toolAvailability, pipelineTestingMode);
  console.log(chalk.green('  ✅ Wave 2 operations completed'));

  console.log(chalk.blue('📝 Stitching pre-recon outputs...'));
  // Combine wave 1 and wave 2 results for stitching
  const allResults = [
    wave1Results.nmap,
    wave1Results.subfinder,
    wave1Results.whatweb,
    wave1Results.naabu,
    wave1Results.codeAnalysis,
    ...(wave2Results.schemathesis ? [wave2Results.schemathesis] : [])
  ];
  const preReconReport = await stitchPreReconOutputs(allResults, sourceDir);
  const duration = timer.stop();

  console.log(chalk.green(`✅ Pre-reconnaissance complete in ${formatDuration(duration)}`));
  console.log(chalk.green(`💾 Saved to ${sourceDir}/deliverables/pre_recon_deliverable.md`));

  return { duration, report: preReconReport };
}