import { path, fs } from 'zx';
import chalk from 'chalk';
import { validateQueueAndDeliverable } from './queue-validation.js';

// MCP agent mapping - assigns each agent to a specific Playwright instance to prevent conflicts
export const MCP_AGENT_MAPPING = Object.freeze({
  // Phase 1: Pre-reconnaissance (actual prompt name is 'pre-recon-code')
  // NOTE: Pre-recon is pure code analysis and doesn't use browser automation,
  // but assigning MCP server anyway for consistency and future extensibility
  'pre-recon-code': 'playwright-agent1',

  // Phase 2: Reconnaissance (actual prompt name is 'recon')
  'recon': 'playwright-agent2',

  // Phase 3: Vulnerability Analysis (5 parallel agents)
  'vuln-injection': 'playwright-agent1',
  'vuln-xss': 'playwright-agent2',
  'vuln-auth': 'playwright-agent3',
  'vuln-ssrf': 'playwright-agent4',
  'vuln-authz': 'playwright-agent5',

  // Phase 4: Exploitation (5 parallel agents - same as vuln counterparts)
  'exploit-injection': 'playwright-agent1',
  'exploit-xss': 'playwright-agent2',
  'exploit-auth': 'playwright-agent3',
  'exploit-ssrf': 'playwright-agent4',
  'exploit-authz': 'playwright-agent5',

  // Phase 5: Reporting (actual prompt name is 'report-executive')
  // NOTE: Report generation is typically text-based and doesn't use browser automation,
  // but assigning MCP server anyway for potential screenshot inclusion or future needs
  'report-executive': 'playwright-agent3'
});

// Direct agent-to-validator mapping - much simpler than pattern matching
export const AGENT_VALIDATORS = Object.freeze({
  // Pre-reconnaissance agent - validates the code analysis deliverable created by the agent
  'pre-recon': async (sourceDir) => {
    const codeAnalysisFile = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    return await fs.pathExists(codeAnalysisFile);
  },

  // Reconnaissance agent
  'recon': async (sourceDir) => {
    const reconFile = path.join(sourceDir, 'deliverables', 'recon_deliverable.md');
    return await fs.pathExists(reconFile);
  },

  // Vulnerability analysis agents
  'injection-vuln': async (sourceDir) => {
    try {
      await validateQueueAndDeliverable('injection', sourceDir);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`   Queue validation failed for injection: ${error.message}`));
      return false;
    }
  },

  'xss-vuln': async (sourceDir) => {
    try {
      await validateQueueAndDeliverable('xss', sourceDir);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`   Queue validation failed for xss: ${error.message}`));
      return false;
    }
  },

  'auth-vuln': async (sourceDir) => {
    try {
      await validateQueueAndDeliverable('auth', sourceDir);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`   Queue validation failed for auth: ${error.message}`));
      return false;
    }
  },

  'ssrf-vuln': async (sourceDir) => {
    try {
      await validateQueueAndDeliverable('ssrf', sourceDir);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`   Queue validation failed for ssrf: ${error.message}`));
      return false;
    }
  },

  'authz-vuln': async (sourceDir) => {
    try {
      await validateQueueAndDeliverable('authz', sourceDir);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`   Queue validation failed for authz: ${error.message}`));
      return false;
    }
  },

  // Exploitation agents
  'injection-exploit': async (sourceDir) => {
    const evidenceFile = path.join(sourceDir, 'deliverables', 'injection_exploitation_evidence.md');
    return await fs.pathExists(evidenceFile);
  },

  'xss-exploit': async (sourceDir) => {
    const evidenceFile = path.join(sourceDir, 'deliverables', 'xss_exploitation_evidence.md');
    return await fs.pathExists(evidenceFile);
  },

  'auth-exploit': async (sourceDir) => {
    const evidenceFile = path.join(sourceDir, 'deliverables', 'auth_exploitation_evidence.md');
    return await fs.pathExists(evidenceFile);
  },

  'ssrf-exploit': async (sourceDir) => {
    const evidenceFile = path.join(sourceDir, 'deliverables', 'ssrf_exploitation_evidence.md');
    return await fs.pathExists(evidenceFile);
  },

  'authz-exploit': async (sourceDir) => {
    const evidenceFile = path.join(sourceDir, 'deliverables', 'authz_exploitation_evidence.md');
    return await fs.pathExists(evidenceFile);
  },

  // Executive report agent
  'report': async (sourceDir) => {
    const reportFile = path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md');

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      console.log(chalk.red(`    ❌ Missing required deliverable: comprehensive_security_assessment_report.md`));
    }

    return reportExists;
  }
});