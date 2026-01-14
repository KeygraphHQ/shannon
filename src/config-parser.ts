// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createRequire } from 'module';
import { fs } from 'zx';
import yaml from 'js-yaml';
import { Ajv, type ValidateFunction } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';
import { PentestError } from './error-handling.js';
import {
  validateApiKey,
  validateSlackBotToken,
  validateJiraApiToken,
  validateSlackWebhookUrl,
  validateJiraUrl,
  validateWebhookUrl,
} from './security/index.js';
import type {
  Config,
  Rule,
  Rules,
  Authentication,
  DistributedConfig,
} from './types/config.js';

// Handle ESM/CJS interop for ajv-formats using require
const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require('ajv-formats');

// Initialize AJV with formats
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

// Load JSON Schema
let configSchema: object;
let validateSchema: ValidateFunction;

try {
  const schemaPath = new URL('../configs/config-schema.json', import.meta.url);
  const schemaContent = await fs.readFile(schemaPath, 'utf8');
  configSchema = JSON.parse(schemaContent) as object;
  validateSchema = ajv.compile(configSchema);
} catch (error) {
  const errMsg = error instanceof Error ? error.message : String(error);
  throw new PentestError(
    `Failed to load configuration schema: ${errMsg}`,
    'config',
    false,
    { schemaPath: '../configs/config-schema.json', originalError: errMsg }
  );
}

// Security patterns to block
const DANGEROUS_PATTERNS: RegExp[] = [
  /\.\.\//, // Path traversal
  /[<>]/, // HTML/XML injection
  /javascript:/i, // JavaScript URLs
  /data:/i, // Data URLs
  /file:/i, // File URLs
  /vbscript:/i, // VBScript URLs
  /\$\{.*\}/, // Template injection
  /\{\{.*\}\}/, // Template injection
  /%00/, // Null byte injection
];

// Blocked internal hostnames for SSRF protection
const INTERNAL_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /metadata\.google/i,
  /\.internal$/i,
  /\.local$/i,
];

// Parse and load YAML configuration file with enhanced safety
export const parseConfig = async (configPath: string): Promise<Config> => {
  try {
    // File existence check
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // File size check (prevent extremely large files)
    const stats = await fs.stat(configPath);
    const maxFileSize = 1024 * 1024; // 1MB
    if (stats.size > maxFileSize) {
      throw new Error(
        `Configuration file too large: ${stats.size} bytes (maximum: ${maxFileSize} bytes)`
      );
    }

    // Read file content
    const configContent = await fs.readFile(configPath, 'utf8');

    // Basic content validation
    if (!configContent.trim()) {
      throw new Error('Configuration file is empty');
    }

    // Parse YAML with safety options
    let config: unknown;
    try {
      config = yaml.load(configContent, {
        schema: yaml.FAILSAFE_SCHEMA, // Only basic YAML types, no JS evaluation
        json: false, // Don't allow JSON-specific syntax
        filename: configPath,
      });
    } catch (yamlError) {
      const errMsg = yamlError instanceof Error ? yamlError.message : String(yamlError);
      throw new Error(`YAML parsing failed: ${errMsg}`);
    }

    // Additional safety check
    if (config === null || config === undefined) {
      throw new Error('Configuration file resulted in null/undefined after parsing');
    }

    // Validate the configuration structure and content
    validateConfig(config as Config);

    // Perform deep security validation
    await performDeepSecurityValidation(config as Config);

    return config as Config;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // Enhance error message with context
    if (
      errMsg.startsWith('Configuration file not found') ||
      errMsg.startsWith('YAML parsing failed') ||
      errMsg.includes('must be') ||
      errMsg.includes('exceeds maximum') ||
      errMsg.includes('validation failed')
    ) {
      // These are already well-formatted errors, re-throw as-is
      throw error;
    } else {
      // Wrap other errors with context
      throw new Error(`Failed to parse configuration file '${configPath}': ${errMsg}`);
    }
  }
};

// Validate overall configuration structure using JSON Schema
const validateConfig = (config: Config): void => {
  // Basic structure validation
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be a valid object');
  }

  if (Array.isArray(config)) {
    throw new Error('Configuration must be an object, not an array');
  }

  // JSON Schema validation
  const isValid = validateSchema(config);
  if (!isValid) {
    const errors = validateSchema.errors || [];
    const errorMessages = errors.map((err) => {
      const path = err.instancePath || 'root';
      return `${path}: ${err.message}`;
    });
    throw new Error(`Configuration validation failed:\n  - ${errorMessages.join('\n  - ')}`);
  }

  // Additional security validation
  performSecurityValidation(config);

  // Warn if deprecated fields are used
  if (config.login) {
    console.warn('⚠️  The "login" section is deprecated. Please use "authentication" instead.');
  }

  // Ensure at least some meaningful configuration is provided
  const hasActionableConfig = Boolean(
    config.authentication ||
    (config.rules && (config.rules.avoid?.length || config.rules.focus?.length))
  );

  if (!hasActionableConfig) {
    console.warn(
      '⚠️  Configuration file contains no actionable rules or authentication. ' +
      'The pentest will run without any scoping restrictions or login capabilities.'
    );
  }
};

// Perform additional security validation beyond JSON Schema
const performSecurityValidation = (config: Config): void => {
  // Validate authentication section for security issues
  if (config.authentication) {
    const auth = config.authentication;

    // Check for dangerous patterns in credentials
    if (auth.credentials) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(auth.credentials.username)) {
          throw new Error(
            'authentication.credentials.username contains potentially dangerous pattern'
          );
        }
        if (pattern.test(auth.credentials.password)) {
          throw new Error(
            'authentication.credentials.password contains potentially dangerous pattern'
          );
        }
      }
    }

    // Check login flow for dangerous patterns
    if (auth.login_flow) {
      auth.login_flow.forEach((step, index) => {
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(step)) {
            throw new Error(
              `authentication.login_flow[${index}] contains potentially dangerous pattern: ${pattern.source}`
            );
          }
        }
      });
    }
  }

  // Validate rules section for security issues
  if (config.rules) {
    validateRulesSecurity(config.rules.avoid, 'avoid');
    validateRulesSecurity(config.rules.focus, 'focus');

    // Check for duplicate and conflicting rules
    checkForDuplicates(config.rules.avoid || [], 'avoid');
    checkForDuplicates(config.rules.focus || [], 'focus');
    checkForConflicts(config.rules.avoid, config.rules.focus);
  }

  // Validate integration URLs for dangerous patterns (sync check)
  if (config.integrations?.slack?.webhook_url) {
    validateStringSafety(config.integrations.slack.webhook_url, 'integrations.slack.webhook_url');
  }
  if (config.integrations?.jira?.base_url) {
    validateStringSafety(config.integrations.jira.base_url, 'integrations.jira.base_url');
  }
  if (config.integrations?.webhooks) {
    config.integrations.webhooks.forEach((hook, index) => {
      validateStringSafety(hook.url, `integrations.webhooks[${index}].url`);
    });
  }
  if (config.api?.webhooks) {
    config.api.webhooks.forEach((hook, index) => {
      validateStringSafety(hook.url, `api.webhooks[${index}].url`);
    });
  }
};

// Deep security validation with async URL/secret checks
const performDeepSecurityValidation = async (config: Config): Promise<void> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate API key if present
  if (config.api?.api_key) {
    const apiKeyResult = validateApiKey(config.api.api_key, { minLength: 32 });
    if (!apiKeyResult.valid) {
      errors.push(`api.api_key: ${apiKeyResult.error}`);
    } else if (apiKeyResult.strength === 'weak') {
      warnings.push('api.api_key has weak entropy - consider using a stronger key');
    }
    warnings.push(...apiKeyResult.warnings.map(w => `api.api_key: ${w}`));
  }

  // Validate Slack configuration
  if (config.integrations?.slack) {
    const slack = config.integrations.slack;

    if (slack.webhook_url) {
      const urlResult = await validateSlackWebhookUrl(slack.webhook_url);
      if (!urlResult.valid) {
        errors.push(`integrations.slack.webhook_url: ${urlResult.error}`);
      }
      warnings.push(...urlResult.warnings.map(w => `integrations.slack.webhook_url: ${w}`));
    }

    if (slack.bot_token) {
      const tokenResult = validateSlackBotToken(slack.bot_token);
      if (!tokenResult.valid) {
        errors.push(`integrations.slack.bot_token: ${tokenResult.error}`);
      }
    }
  }

  // Validate Jira configuration
  if (config.integrations?.jira) {
    const jira = config.integrations.jira;

    const urlResult = await validateJiraUrl(jira.base_url);
    if (!urlResult.valid) {
      errors.push(`integrations.jira.base_url: ${urlResult.error}`);
    }
    warnings.push(...urlResult.warnings.map(w => `integrations.jira.base_url: ${w}`));

    const tokenResult = validateJiraApiToken(jira.api_token);
    if (!tokenResult.valid) {
      errors.push(`integrations.jira.api_token: ${tokenResult.error}`);
    }
    warnings.push(...tokenResult.warnings.map(w => `integrations.jira.api_token: ${w}`));
  }

  // Validate webhooks
  const allWebhooks = [
    ...(config.integrations?.webhooks || []).map((h, i) => ({ hook: h, path: `integrations.webhooks[${i}]` })),
    ...(config.api?.webhooks || []).map((h, i) => ({ hook: h, path: `api.webhooks[${i}]` })),
  ];

  for (const { hook, path } of allWebhooks) {
    // URL validation
    const urlResult = await validateWebhookUrl(hook.url);
    if (!urlResult.valid) {
      errors.push(`${path}.url: ${urlResult.error}`);
    }
    warnings.push(...urlResult.warnings.map(w => `${path}.url: ${w}`));

    // Secret requirement check
    if (!hook.secret) {
      errors.push(`${path}.secret: Webhook secret is required for security (HMAC signing)`);
    } else {
      const secretResult = validateApiKey(hook.secret, { minLength: 32 });
      if (!secretResult.valid) {
        errors.push(`${path}.secret: ${secretResult.error}`);
      }
      warnings.push(...secretResult.warnings.map(w => `${path}.secret: ${w}`));
    }
  }

  // Log warnings
  for (const warning of warnings) {
    console.warn(`⚠️  ${warning}`);
  }

  // Throw if there are errors
  if (errors.length > 0) {
    throw new Error(`Security validation failed:\n  - ${errors.join('\n  - ')}`);
  }
};

// Validate rules for security issues
const validateRulesSecurity = (rules: Rule[] | undefined, ruleType: string): void => {
  if (!rules) return;

  rules.forEach((rule, index) => {
    // Security validation
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(rule.url_path)) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path contains potentially dangerous pattern: ${pattern.source}`
        );
      }
      if (pattern.test(rule.description)) {
        throw new Error(
          `rules.${ruleType}[${index}].description contains potentially dangerous pattern: ${pattern.source}`
        );
      }
    }

    // Type-specific validation
    validateRuleTypeSpecific(rule, ruleType, index);
  });
};

const validateStringSafety = (value: string, label: string): void => {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`${label} contains potentially dangerous pattern: ${pattern.source}`);
    }
  }

  // Check for internal hostnames (SSRF)
  try {
    const url = new URL(value);
    for (const hostPattern of INTERNAL_HOSTNAME_PATTERNS) {
      if (hostPattern.test(url.hostname)) {
        throw new Error(`${label} contains internal/private hostname: ${url.hostname}`);
      }
    }
  } catch (e) {
    // Not a valid URL, that's fine for non-URL fields
    if (value.startsWith('http://') || value.startsWith('https://')) {
      throw new Error(`${label} appears to be a malformed URL`);
    }
  }
};

// Validate rule based on its specific type
const validateRuleTypeSpecific = (rule: Rule, ruleType: string, index: number): void => {
  switch (rule.type) {
    case 'path':
      if (!rule.url_path.startsWith('/')) {
        throw new Error(`rules.${ruleType}[${index}].url_path for type 'path' must start with '/'`);
      }
      break;

    case 'subdomain':
    case 'domain':
      // Basic domain validation - no slashes allowed
      if (rule.url_path.includes('/')) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type '${rule.type}' cannot contain '/' characters`
        );
      }
      // Must contain at least one dot for domains
      if (rule.type === 'domain' && !rule.url_path.includes('.')) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'domain' must be a valid domain name`
        );
      }
      break;

    case 'method': {
      const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (!allowedMethods.includes(rule.url_path.toUpperCase())) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'method' must be one of: ${allowedMethods.join(', ')}`
        );
      }
      break;
    }

    case 'header':
      // Header name validation (basic)
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'header' must be a valid header name (alphanumeric, hyphens, underscores only)`
        );
      }
      break;

    case 'parameter':
      // Parameter name validation (basic)
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new Error(
          `rules.${ruleType}[${index}].url_path for type 'parameter' must be a valid parameter name (alphanumeric, hyphens, underscores only)`
        );
      }
      break;
  }
};

// Check for duplicate rules
const checkForDuplicates = (rules: Rule[], ruleType: string): void => {
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.url_path}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate rule found in rules.${ruleType}[${index}]: ${rule.type} '${rule.url_path}'`
      );
    }
    seen.add(key);
  });
};

// Check for conflicting rules between avoid and focus
const checkForConflicts = (avoidRules: Rule[] = [], focusRules: Rule[] = []): void => {
  const avoidSet = new Set(avoidRules.map((rule) => `${rule.type}:${rule.url_path}`));

  focusRules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.url_path}`;
    if (avoidSet.has(key)) {
      throw new Error(
        `Conflicting rule found: rules.focus[${index}] '${rule.url_path}' also exists in rules.avoid`
      );
    }
  });
};

// Sanitize and normalize rule values
const sanitizeRule = (rule: Rule): Rule => {
  return {
    description: rule.description.trim(),
    type: rule.type.toLowerCase().trim() as Rule['type'],
    url_path: rule.url_path.trim(),
  };
};

// Distribute configuration sections to different agents with sanitization
export const distributeConfig = (config: Config | null): DistributedConfig => {
  const avoid = config?.rules?.avoid || [];
  const focus = config?.rules?.focus || [];
  const authentication = config?.authentication || null;

  return {
    avoid: avoid.map(sanitizeRule),
    focus: focus.map(sanitizeRule),
    authentication: authentication ? sanitizeAuthentication(authentication) : null,
  };
};

// Sanitize and normalize authentication values
const sanitizeAuthentication = (auth: Authentication): Authentication => {
  return {
    login_type: auth.login_type.toLowerCase().trim() as Authentication['login_type'],
    login_url: auth.login_url.trim(),
    credentials: {
      username: auth.credentials.username.trim(),
      password: auth.credentials.password,
      ...(auth.credentials.totp_secret && { totp_secret: auth.credentials.totp_secret.trim() }),
    },
    login_flow: auth.login_flow.map((step) => step.trim()),
    success_condition: {
      type: auth.success_condition.type.toLowerCase().trim() as Authentication['success_condition']['type'],
      value: auth.success_condition.value.trim(),
    },
  };
};
