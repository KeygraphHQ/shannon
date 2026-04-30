// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import { PROMPTS_DIR } from '../paths.js';
import { PLAYWRIGHT_SESSION_MAPPING } from '../session-manager.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { Authentication, DistributedConfig, ReportConfig, Rule, VulnClass } from '../types/config.js';
import { handlePromptError, PentestError } from './error-handling.js';

const GLOB_CHARS = /[*?[\]{}!]/;

function renderCodePathRules(rules: Rule[]): string {
  const filtered = rules.filter((r) => r.type === 'code_path');
  if (filtered.length === 0) return 'None';
  return filtered
    .map((r) => {
      const kind = GLOB_CHARS.test(r.value) ? '[GLOB]' : '[FILE]';
      return `- ${r.value} ${kind} — ${r.description}`;
    })
    .join('\n');
}

interface VulnSummarySpec {
  readonly heading: string;
  readonly evidenceSection: string;
  readonly noneFoundLabel: string;
}

const VULN_SUMMARY_SPECS: Record<VulnClass, VulnSummarySpec> = {
  auth: {
    heading: 'Authentication Vulnerabilities',
    evidenceSection: 'Authentication Exploitation Evidence',
    noneFoundLabel: 'authentication',
  },
  authz: {
    heading: 'Authorization Vulnerabilities',
    evidenceSection: 'Authorization Exploitation Evidence',
    noneFoundLabel: 'authorization',
  },
  xss: {
    heading: 'Cross-Site Scripting (XSS) Vulnerabilities',
    evidenceSection: 'XSS Exploitation Evidence',
    noneFoundLabel: 'XSS',
  },
  injection: {
    heading: 'SQL/Command Injection Vulnerabilities',
    evidenceSection: 'Injection Exploitation Evidence',
    noneFoundLabel: 'SQL or command injection',
  },
  ssrf: {
    heading: 'Server-Side Request Forgery (SSRF) Vulnerabilities',
    evidenceSection: 'SSRF Exploitation Evidence',
    noneFoundLabel: 'SSRF',
  },
};

function renderVulnSummarySubsections(selected: readonly VulnClass[]): string {
  const classes = selected.length > 0 ? selected : (Object.keys(VULN_SUMMARY_SPECS) as VulnClass[]);
  return classes
    .map((cls) => {
      const spec = VULN_SUMMARY_SPECS[cls];
      return `**${spec.heading}:**\n{Check for "${spec.evidenceSection}" section. Include actually exploited vulnerabilities and those blocked by security controls. Exclude theoretical vulnerabilities requiring internal network access. If vulnerabilities exist, summarize their impact and severity. If section is missing or empty, state: "No ${spec.noneFoundLabel} vulnerabilities were found."}`;
    })
    .join('\n\n');
}

/**
 * Renders the top-level <report_filters> block. Empty when no filters are set —
 * each filter is included only when the operator configured it, so the agent
 * never sees `none` placeholders or instructions for filters that don't apply.
 */
function renderReportFiltersBlock(report: ReportConfig | undefined): string {
  if (!report) return '';
  const guidance = report.guidance?.trim();
  if (!report.min_severity && !report.min_confidence && !guidance) return '';

  const lines: string[] = [
    '<report_filters>',
    'The filters below are user-supplied and binding for this assessment. Honor each strictly when assembling the final report.',
    '',
  ];
  if (report.min_severity) {
    lines.push(
      `- Minimum severity: ${report.min_severity} — keep only findings rated this severity or higher (scale: low < medium < high < critical).`,
    );
  }
  if (report.min_confidence) {
    lines.push(
      `- Minimum confidence: ${report.min_confidence} — keep only findings rated this confidence or higher (scale: low < medium < high).`,
    );
  }
  if (guidance) {
    lines.push('');
    lines.push('User guidance — apply throughout the report as binding directives for finding selection:');
    lines.push(guidance);
  }
  lines.push('</report_filters>');
  return lines.join('\n');
}

/**
 * Renders the per-finding DROP rules used inside the cleanup step. Severity and
 * confidence inline as concrete thresholds; guidance is referenced by pointer
 * so the actual text only lives in <report_filters>, avoiding double-statement.
 */
function renderReportFilterRules(report: ReportConfig | undefined): string {
  const drops: string[] = [];
  if (report?.min_severity) drops.push(`* severity is below ${report.min_severity}`);
  if (report?.min_confidence) drops.push(`* confidence is below ${report.min_confidence}`);
  if (report?.guidance?.trim()) drops.push('* topic matches an exclusion in the user guidance');
  if (drops.length === 0) return '';
  return ['   - DROP any `### [TYPE]-VULN-[NUMBER]` finding whose:', ...drops.map((d) => `     ${d}`)].join('\n');
}

interface PromptVariables {
  webUrl: string;
  repoPath: string;
  PLAYWRIGHT_SESSION?: string;
}

interface IncludeReplacement {
  placeholder: string;
  content: string;
}

// Pure function: Build complete login instructions from config
async function buildLoginInstructions(
  authentication: Authentication,
  logger: ActivityLogger,
  promptsBaseDir: string = PROMPTS_DIR,
): Promise<string> {
  try {
    // 1. Load the login instructions template
    const loginInstructionsPath = path.join(promptsBaseDir, 'shared', 'login-instructions.txt');

    if (!(await fs.pathExists(loginInstructionsPath))) {
      throw new PentestError('Login instructions template not found', 'filesystem', false, { loginInstructionsPath });
    }

    const fullTemplate = await fs.readFile(loginInstructionsPath, 'utf8');

    const getSection = (content: string, sectionName: string): string => {
      const regex = new RegExp(`<!-- BEGIN:${sectionName} -->([\\s\\S]*?)<!-- END:${sectionName} -->`, 'g');
      const match = regex.exec(content);
      return match?.[1]?.trim() ?? '';
    };

    // 2. Extract sections based on login type
    const loginType = authentication.login_type?.toUpperCase();
    let loginInstructions = '';

    const commonSection = getSection(fullTemplate, 'COMMON');
    const authSection = loginType ? getSection(fullTemplate, loginType) : ''; // FORM or SSO
    const verificationSection = getSection(fullTemplate, 'VERIFICATION');

    // 3. Assemble instructions from sections (fallback to full template if markers missing)
    if (!commonSection && !authSection && !verificationSection) {
      logger.warn('Section markers not found, using full login instructions template');
      loginInstructions = fullTemplate;
    } else {
      loginInstructions = [commonSection, authSection, verificationSection].filter((section) => section).join('\n\n');
    }

    // 4. Interpolate login flow and credential placeholders
    let userInstructions = (authentication.login_flow ?? []).join('\n');

    if (authentication.credentials) {
      if (authentication.credentials.username) {
        userInstructions = userInstructions.replace(/\$username/g, authentication.credentials.username);
      }
      if (authentication.credentials.password) {
        userInstructions = userInstructions.replace(/\$password/g, authentication.credentials.password);
      }
      if (authentication.credentials.totp_secret) {
        userInstructions = userInstructions.replace(
          /\$totp/g,
          `generated TOTP code using secret "${authentication.credentials.totp_secret}"`,
        );
      }
    }

    loginInstructions = loginInstructions.replace(/{{user_instructions}}/g, userInstructions);

    // 5. Replace TOTP secret placeholder if present in template
    if (authentication.credentials?.totp_secret) {
      loginInstructions = loginInstructions.replace(/{{totp_secret}}/g, authentication.credentials.totp_secret);
    }

    return loginInstructions;
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(`Failed to build login instructions: ${errMsg}`, 'config', false, {
      authentication,
      originalError: errMsg,
    });
  }
}

// Pure function: Process @include() directives
async function processIncludes(content: string, baseDir: string): Promise<string> {
  const includeRegex = /@include\(([^)]+)\)/g;
  const resolvedBase = path.resolve(baseDir);

  const replacements: IncludeReplacement[] = await Promise.all(
    Array.from(content.matchAll(includeRegex)).map(async (match) => {
      const rawPath = match[1] ?? '';
      const includePath = path.resolve(baseDir, rawPath);
      if (!includePath.startsWith(resolvedBase + path.sep) && includePath !== resolvedBase) {
        throw new PentestError(`Path traversal detected in @include(): ${rawPath}`, 'prompt', false, {
          includePath,
          baseDir: resolvedBase,
        });
      }
      const sharedContent = await fs.readFile(includePath, 'utf8');
      return {
        placeholder: match[0],
        content: sharedContent,
      };
    }),
  );

  for (const replacement of replacements) {
    content = content.replace(replacement.placeholder, replacement.content);
  }
  return content;
}

function buildAuthContext(config: DistributedConfig | null): string {
  if (!config?.authentication) {
    return 'No authentication configured - unauthenticated testing only';
  }

  const auth = config.authentication;
  const lines = [
    `- Login type: ${auth.login_type.toUpperCase()}`,
    `- Username: ${auth.credentials.username}`,
    `- Login URL: ${auth.login_url}`,
  ];

  if (auth.credentials?.totp_secret) {
    lines.push('- MFA: TOTP enabled');
  }

  return lines.join('\n');
}

// Pure function: Variable interpolation
async function interpolateVariables(
  template: string,
  variables: PromptVariables,
  config: DistributedConfig | null = null,
  logger: ActivityLogger,
  promptsBaseDir: string = PROMPTS_DIR,
): Promise<string> {
  try {
    if (!template || typeof template !== 'string') {
      throw new PentestError('Template must be a non-empty string', 'validation', false, {
        templateType: typeof template,
        templateLength: template?.length,
      });
    }

    if (!variables || !variables.webUrl || !variables.repoPath) {
      throw new PentestError('Variables must include webUrl and repoPath', 'validation', false, {
        variables: Object.keys(variables || {}),
      });
    }

    let result = template
      .replace(/{{WEB_URL}}/g, variables.webUrl)
      .replace(/{{REPO_PATH}}/g, variables.repoPath)
      .replace(/{{PLAYWRIGHT_SESSION}}/g, variables.PLAYWRIGHT_SESSION || 'agent1')
      .replace(/{{AUTH_CONTEXT}}/g, buildAuthContext(config))
      .replace(/{{DESCRIPTION}}/g, config?.description ? `Description: ${config.description}` : '');

    const avoidUrlRules = config?.avoid?.filter((r) => r.type !== 'code_path') ?? [];
    const focusUrlRules = config?.focus?.filter((r) => r.type !== 'code_path') ?? [];
    if (avoidUrlRules.length === 0 && focusUrlRules.length === 0) {
      result = result.replace(/<rules>[\s\S]*?<\/rules>\s*/g, '');
    } else {
      const avoidStr = avoidUrlRules.length > 0 ? avoidUrlRules.map((r) => `- ${r.description}`).join('\n') : 'None';
      const focusStr = focusUrlRules.length > 0 ? focusUrlRules.map((r) => `- ${r.description}`).join('\n') : 'None';
      result = result.replace(/{{RULES_AVOID}}/g, avoidStr).replace(/{{RULES_FOCUS}}/g, focusStr);
    }

    const avoidCodeRules = (config?.avoid ?? []).filter((r) => r.type === 'code_path');
    const focusCodeRules = (config?.focus ?? []).filter((r) => r.type === 'code_path');
    if (avoidCodeRules.length === 0 && focusCodeRules.length === 0) {
      result = result.replace(/<code_path_rules>[\s\S]*?<\/code_path_rules>\s*/g, '');
    } else {
      result = result
        .replace(/{{CODE_RULES_AVOID}}/g, renderCodePathRules(config?.avoid ?? []))
        .replace(/{{CODE_RULES_FOCUS}}/g, renderCodePathRules(config?.focus ?? []));
    }

    const roe = config?.rules_of_engagement?.trim() ?? '';
    if (roe) {
      result = result.replace(/{{RULES_OF_ENGAGEMENT}}/g, roe);
    } else {
      result = result.replace(/<rules_of_engagement>[\s\S]*?<\/rules_of_engagement>\s*/g, '');
    }

    if (config?.authentication?.login_flow) {
      const loginInstructions = await buildLoginInstructions(config.authentication, logger, promptsBaseDir);
      result = result.replace(/{{LOGIN_INSTRUCTIONS}}/g, loginInstructions);
    } else {
      result = result.replace(/{{LOGIN_INSTRUCTIONS}}/g, '');
    }

    const vulnClasses = config?.vuln_classes ?? [];
    result = result.replace(
      /{{VULN_CLASSES_TESTED}}/g,
      vulnClasses.length > 0 ? vulnClasses.join(', ') : 'injection, xss, auth, authz, ssrf',
    );
    result = result.replace(/{{VULN_SUMMARY_SUBSECTIONS}}/g, renderVulnSummarySubsections(vulnClasses));

    const exploitEnabled = config?.exploit ?? true;
    result = result
      .replace(/{{EXPLOITATION}}/g, exploitEnabled ? 'enabled' : 'disabled')
      .replace(/{{REPORT_VULN_HEADING}}/g, exploitEnabled ? 'Exploitation Evidence' : 'Findings')
      .replace(
        /{{REPORT_VULN_SUBHEADING}}/g,
        exploitEnabled ? 'Successfully Exploited Vulnerabilities' : 'Identified Vulnerabilities',
      );

    result = result
      .replace(/{{REPORT_FILTERS_BLOCK}}/g, renderReportFiltersBlock(config?.report))
      .replace(/{{REPORT_FILTER_RULES}}/g, renderReportFilterRules(config?.report));

    // Collapse runs of 3+ newlines (left behind by tag-strip and empty-fragment substitutions).
    result = result.replace(/\n{3,}/g, '\n\n');

    // Validate that all placeholders have been replaced (excluding instructional text)
    const remainingPlaceholders = result.match(/\{\{[^}]+\}\}/g);
    if (remainingPlaceholders) {
      logger.warn(`Found unresolved placeholders in prompt: ${remainingPlaceholders.join(', ')}`);
    }

    return result;
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(`Variable interpolation failed: ${errMsg}`, 'prompt', false, { originalError: errMsg });
  }
}

// Pure function: Load and interpolate prompt template
export async function loadPrompt(
  promptName: string,
  variables: PromptVariables,
  config: DistributedConfig | null = null,
  pipelineTestingMode: boolean = false,
  logger: ActivityLogger,
  promptDir?: string,
): Promise<string> {
  try {
    // 1. Resolve prompt file path (promptDir override → default PROMPTS_DIR)
    const basePromptsDir = promptDir ?? PROMPTS_DIR;
    const promptsDir = pipelineTestingMode ? path.join(basePromptsDir, 'pipeline-testing') : basePromptsDir;
    const promptPath = path.join(promptsDir, `${promptName}.txt`);

    if (pipelineTestingMode) {
      logger.info(`Using pipeline testing prompt: ${promptPath}`);
    }

    if (!(await fs.pathExists(promptPath))) {
      throw new PentestError(`Prompt file not found: ${promptPath}`, 'prompt', false, { promptName, promptPath });
    }

    // 2. Assign Playwright session based on agent name
    const enhancedVariables: PromptVariables = { ...variables };

    const session = PLAYWRIGHT_SESSION_MAPPING[promptName as keyof typeof PLAYWRIGHT_SESSION_MAPPING];
    if (session) {
      enhancedVariables.PLAYWRIGHT_SESSION = session;
      logger.info(`Assigned ${promptName} -> ${enhancedVariables.PLAYWRIGHT_SESSION}`);
    } else {
      enhancedVariables.PLAYWRIGHT_SESSION = 'agent1';
      logger.warn(`Unknown agent ${promptName}, using fallback -> ${enhancedVariables.PLAYWRIGHT_SESSION}`);
    }

    // 3. Read template file
    let template = await fs.readFile(promptPath, 'utf8');

    // 4. Process @include directives
    template = await processIncludes(template, promptsDir);

    // 5. Interpolate variables and return final prompt
    return await interpolateVariables(template, enhancedVariables, config, logger, basePromptsDir);
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    const promptError = handlePromptError(promptName, error as Error);
    throw promptError.error;
  }
}
