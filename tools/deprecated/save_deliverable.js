#!/usr/bin/env node

/**
 * Save Deliverable Tool
 *
 * This tool handles saving deliverable files with correct filenames and validation.
 * AI agents call this instead of using fs.writeFile directly.
 *
 * Usage: node save_deliverable.js <TYPE> <content>
 *
 * Example: node save_deliverable.js INJECTION_QUEUE '{"vulnerabilities": []}'
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Hard-coded filename mappings from agent prompts
const DELIVERABLE_TYPES = {
  // Pre-recon agent
  CODE_ANALYSIS: 'code_analysis_deliverable.md',

  // Recon agent
  RECON: 'recon_deliverable.md',

  // Vulnerability analysis agents
  INJECTION_ANALYSIS: 'injection_analysis_deliverable.md',
  INJECTION_QUEUE: 'injection_exploitation_queue.json',

  XSS_ANALYSIS: 'xss_analysis_deliverable.md',
  XSS_QUEUE: 'xss_exploitation_queue.json',

  AUTH_ANALYSIS: 'auth_analysis_deliverable.md',
  AUTH_QUEUE: 'auth_exploitation_queue.json',

  AUTHZ_ANALYSIS: 'authz_analysis_deliverable.md',
  AUTHZ_QUEUE: 'authz_exploitation_queue.json',

  SSRF_ANALYSIS: 'ssrf_analysis_deliverable.md',
  SSRF_QUEUE: 'ssrf_exploitation_queue.json',

  // Exploitation agents
  INJECTION_EVIDENCE: 'injection_exploitation_evidence.md',
  XSS_EVIDENCE: 'xss_exploitation_evidence.md',
  AUTH_EVIDENCE: 'auth_exploitation_evidence.md',
  AUTHZ_EVIDENCE: 'authz_exploitation_evidence.md',
  SSRF_EVIDENCE: 'ssrf_exploitation_evidence.md'
};

/**
 * Validate JSON structure for queue files
 */
function validateQueueJson(content, type) {
  try {
    const parsed = JSON.parse(content);

    // Queue files must have a 'vulnerabilities' array
    if (!parsed.vulnerabilities || !Array.isArray(parsed.vulnerabilities)) {
      return {
        valid: false,
        message: `Invalid ${type}: Missing or invalid 'vulnerabilities' array. Expected format: {"vulnerabilities": [...]}`
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      message: `Invalid JSON in ${type}: ${error.message}`
    };
  }
}

/**
 * Main execution
 */
function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.length < 2) {
      console.log(JSON.stringify({
        status: 'error',
        message: 'Usage: node save_deliverable.js <TYPE> <content>'
      }));
      process.exit(1);
    }

    const type = args[0];
    const content = args.slice(1).join(' ');

    // Validate type
    if (!DELIVERABLE_TYPES[type]) {
      console.log(JSON.stringify({
        status: 'error',
        message: `Unknown deliverable type: ${type}. Valid types: ${Object.keys(DELIVERABLE_TYPES).join(', ')}`
      }));
      process.exit(1);
    }

    // Validate JSON structure for queue files
    if (type.endsWith('_QUEUE')) {
      const validation = validateQueueJson(content, type);
      if (!validation.valid) {
        console.log(JSON.stringify({
          status: 'error',
          message: validation.message
        }));
        process.exit(1);
      }
    }

    // Determine file path (deliverables/ directory)
    const filename = DELIVERABLE_TYPES[type];
    const deliverablesDir = join(process.cwd(), 'deliverables');
    const filepath = join(deliverablesDir, filename);

    // Ensure deliverables directory exists
    try {
      mkdirSync(deliverablesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore
    }

    // Write file
    writeFileSync(filepath, content, 'utf8');

    // Success
    console.log(JSON.stringify({ status: 'success' }));
    process.exit(0);

  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      message: `Failed to save deliverable: ${error.message}`
    }));
    process.exit(1);
  }
}

main();
