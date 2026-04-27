// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import { PROMPTS_DIR } from '../paths.js';
import { PLAYWRIGHT_SESSION_MAPPING } from '../session-manager.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { Authentication, DistributedConfig } from '../types/config.js';
import { handlePromptError, PentestError } from './error-handling.js';

interface PromptVariables {
  webUrl: string;
  repoPath: string;
  PLAYWRIGHT_SESSION?: string;
}

interface IncludeReplacement {
  placeholder: string;
  content: string;
}

/**
 * Escape user-supplied values before interpolation into prompts.
 *
 * Prompts are how the orchestrator instructs LLM agents. If a user-controlled
 * field (config description, focus/avoid rules, credentials) is interpolated
 * raw, an attacker who can write the config can also inject prompt fragments
 * and override agent instructions. This neutralises the two injection vectors
 * Shannon's templating exposes:
 *
 *   1. `{{...}}` placeholder syntax — broken by spacing the braces apart, so
 *      a value containing `{{WEB_URL}}` cannot pose as a real placeholder.
 *   2. `@include(path)` directive — case-insensitively rewritten to
 *      `@_include(path)` so an injected value cannot pull in arbitrary files.
 *
 * Newlines are intentionally preserved — multi-line descriptions are valid
 * input. The defence is structural (placeholder + include syntax), not a
 * keyword denylist.
 */
export function sanitizePromptValue(value: string): string {
  return value
    .replace(/\{\{/g, '{ {')
    .replace(/\}\}/g, '} }')
    .replace(/@include\(/gi, '@_include(');
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
        userInstructions = userInstructions.replace(
          /\$username/g,
          sanitizePromptValue(authentication.credentials.username),
        );
      }
      if (authentication.credentials.password) {
        userInstructions = userInstructions.replace(
          /\$password/g,
          sanitizePromptValue(authentication.credentials.password),
        );
      }
      if (authentication.credentials.totp_secret) {
        userInstructions = userInstructions.replace(
          /\$totp/g,
          `generated TOTP code using secret "${sanitizePromptValue(authentication.credentials.totp_secret)}"`,
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
    `- Username: ${sanitizePromptValue(auth.credentials.username)}`,
    `- Login URL: ${sanitizePromptValue(auth.login_url)}`,
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
      .replace(/{{WEB_URL}}/g, sanitizePromptValue(variables.webUrl))
      .replace(/{{REPO_PATH}}/g, sanitizePromptValue(variables.repoPath))
      .replace(/{{PLAYWRIGHT_SESSION}}/g, variables.PLAYWRIGHT_SESSION || 'agent1')
      .replace(/{{AUTH_CONTEXT}}/g, buildAuthContext(config))
      .replace(
        /{{DESCRIPTION}}/g,
        config?.description ? `Description: ${sanitizePromptValue(config.description)}` : '',
      );

    if (config) {
      // Handle rules section - if both are empty, use cleaner messaging
      const hasAvoidRules = config.avoid && config.avoid.length > 0;
      const hasFocusRules = config.focus && config.focus.length > 0;

      if (!hasAvoidRules && !hasFocusRules) {
        // Replace the entire rules section with a clean message
        const cleanRulesSection = '<rules>\nNo specific rules or focus areas provided for this test.\n</rules>';
        result = result.replace(/<rules>[\s\S]*?<\/rules>/g, cleanRulesSection);
      } else {
        const avoidRules = hasAvoidRules
          ? config.avoid?.map((r) => `- ${sanitizePromptValue(r.description)}`).join('\n')
          : 'None';
        const focusRules = hasFocusRules
          ? config.focus?.map((r) => `- ${sanitizePromptValue(r.description)}`).join('\n')
          : 'None';

        result = result.replace(/{{RULES_AVOID}}/g, avoidRules).replace(/{{RULES_FOCUS}}/g, focusRules);
      }

      // Extract and inject login instructions from config
      if (config.authentication?.login_flow) {
        const loginInstructions = await buildLoginInstructions(config.authentication, logger, promptsBaseDir);
        result = result.replace(/{{LOGIN_INSTRUCTIONS}}/g, loginInstructions);
      } else {
        result = result.replace(/{{LOGIN_INSTRUCTIONS}}/g, '');
      }
    } else {
      // Replace the entire rules section with a clean message when no config provided
      const cleanRulesSection = '<rules>\nNo specific rules or focus areas provided for this test.\n</rules>';
      result = result.replace(/<rules>[\s\S]*?<\/rules>/g, cleanRulesSection);
      result = result.replace(/{{LOGIN_INSTRUCTIONS}}/g, '');
    }

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
