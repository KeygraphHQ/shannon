// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createRequire } from 'module';
import { fs } from 'zx';
import yaml from 'js-yaml';
import { Ajv, type ValidateFunction, type ErrorObject } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';
import { PentestError } from './services/error-handling.js';
import { ErrorCode } from './types/errors.js';
import type {
  Config,
  Rule,
  Authentication,
  DistributedConfig,
} from './types/config.js';

// Handle ESM/CJS interop for ajv-formats using require
const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

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

const DANGEROUS_PATTERNS: RegExp[] = [
  /\.\.\//, // Path traversal
  /[<>]/, // HTML/XML injection
  /javascript:/i, // JavaScript URLs
  /data:/i, // Data URLs
  /file:/i, // File URLs
];

/**
 * Format a single AJV error into a human-readable message.
 * Translates AJV error keywords into plain English descriptions.
 */
function formatAjvError(error: ErrorObject): string {
  const path = error.instancePath || 'root';
  const params = error.params as Record<string, unknown>;

  switch (error.keyword) {
    case 'required': {
      const missingProperty = params.missingProperty as string;
      return `Missing required field: "${missingProperty}" at ${path || 'root'}`;
    }

    case 'type': {
      const expectedType = params.type as string;
      return `Invalid type at ${path}: expected ${expectedType}`;
    }

    case 'enum': {
      const allowedValues = params.allowedValues as unknown[];
      const formattedValues = allowedValues.map((v) => `"${v}"`).join(', ');
      return `Invalid value at ${path}: must be one of [${formattedValues}]`;
    }

    case 'additionalProperties': {
      const additionalProperty = params.additionalProperty as string;
      return `Unknown field at ${path}: "${additionalProperty}" is not allowed`;
    }

    case 'minLength': {
      const limit = params.limit as number;
      return `Value at ${path} is too short: must have at least ${limit} character(s)`;
    }

    case 'maxLength': {
      const limit = params.limit as number;
      return `Value at ${path} is too long: must have at most ${limit} character(s)`;
    }

    case 'minimum': {
      const limit = params.limit as number;
      return `Value at ${path} is too small: must be >= ${limit}`;
    }

    case 'maximum': {
      const limit = params.limit as number;
      return `Value at ${path} is too large: must be <= ${limit}`;
    }

    case 'minItems': {
      const limit = params.limit as number;
      return `Array at ${path} has too few items: must have at least ${limit} item(s)`;
    }

    case 'maxItems': {
      const limit = params.limit as number;
      return `Array at ${path} has too many items: must have at most ${limit} item(s)`;
    }

    case 'pattern': {
      const pattern = params.pattern as string;
      return `Value at ${path} does not match required pattern: ${pattern}`;
    }

    case 'format': {
      const format = params.format as string;
      return `Value at ${path} must be a valid ${format}`;
    }

    case 'const': {
      const allowedValue = params.allowedValue as unknown;
      return `Value at ${path} must be exactly "${allowedValue}"`;
    }

    case 'oneOf': {
      return `Value at ${path} must match exactly one schema (matched ${params.passingSchemas ?? 0})`;
    }

    case 'anyOf': {
      return `Value at ${path} must match at least one of the allowed schemas`;
    }

    case 'not': {
      return `Value at ${path} matches a schema it should not match`;
    }

    case 'if': {
      return `Value at ${path} does not satisfy conditional schema requirements`;
    }

    case 'uniqueItems': {
      const i = params.i as number;
      const j = params.j as number;
      return `Array at ${path} contains duplicate items at positions ${j} and ${i}`;
    }

    case 'propertyNames': {
      const propertyName = params.propertyName as string;
      return `Invalid property name at ${path}: "${propertyName}" does not match naming requirements`;
    }

    case 'dependencies':
    case 'dependentRequired': {
      const property = params.property as string;
      const missingProperty = params.missingProperty as string;
      return `Missing dependent field at ${path}: "${missingProperty}" is required when "${property}" is present`;
    }

    default: {
      // Fallback for any unhandled keywords - use AJV's message if available
      const message = error.message || `validation failed for keyword "${error.keyword}"`;
      return `${path}: ${message}`;
    }
  }
}

/**
 * Format all AJV errors into a list of human-readable messages.
 * Returns an array of formatted error strings.
 */
function formatAjvErrors(errors: ErrorObject[]): string[] {
  return errors.map(formatAjvError);
}

export const parseConfig = async (configPath: string): Promise<Config> => {
  try {
    if (!(await fs.pathExists(configPath))) {
      throw new PentestError(
        `Configuration file not found: ${configPath}`,
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_NOT_FOUND
      );
    }

    const stats = await fs.stat(configPath);
    const maxFileSize = 1024 * 1024; // 1MB
    if (stats.size > maxFileSize) {
      throw new PentestError(
        `Configuration file too large: ${stats.size} bytes (maximum: ${maxFileSize} bytes)`,
        'config',
        false,
        { configPath, fileSize: stats.size, maxFileSize },
        ErrorCode.CONFIG_VALIDATION_FAILED
      );
    }

    const configContent = await fs.readFile(configPath, 'utf8');

    if (!configContent.trim()) {
      throw new PentestError(
        'Configuration file is empty',
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_VALIDATION_FAILED
      );
    }

    let config: unknown;
    try {
      config = yaml.load(configContent, {
        schema: yaml.FAILSAFE_SCHEMA, // Only basic YAML types, no JS evaluation
        json: false, // Don't allow JSON-specific syntax
        filename: configPath,
      });
    } catch (yamlError) {
      const errMsg = yamlError instanceof Error ? yamlError.message : String(yamlError);
      throw new PentestError(
        `YAML parsing failed: ${errMsg}`,
        'config',
        false,
        { configPath, originalError: errMsg },
        ErrorCode.CONFIG_PARSE_ERROR
      );
    }

    if (config === null || config === undefined) {
      throw new PentestError(
        'Configuration file resulted in null/undefined after parsing',
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_PARSE_ERROR
      );
    }

    validateConfig(config as Config);

    return config as Config;
  } catch (error) {
    // PentestError instances are already well-formatted, re-throw as-is
    if (error instanceof PentestError) {
      throw error;
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(
      `Failed to parse configuration file '${configPath}': ${errMsg}`,
      'config',
      false,
      { configPath, originalError: errMsg },
      ErrorCode.CONFIG_PARSE_ERROR
    );
  }
};

const validateConfig = (config: Config): void => {
  if (!config || typeof config !== 'object') {
    throw new PentestError(
      'Configuration must be a valid object',
      'config',
      false,
      {},
      ErrorCode.CONFIG_VALIDATION_FAILED
    );
  }

  if (Array.isArray(config)) {
    throw new PentestError(
      'Configuration must be an object, not an array',
      'config',
      false,
      {},
      ErrorCode.CONFIG_VALIDATION_FAILED
    );
  }

  const isValid = validateSchema(config);
  if (!isValid) {
    const errors = validateSchema.errors || [];
    const errorMessages = formatAjvErrors(errors);
    throw new PentestError(
      `Configuration validation failed:\n  - ${errorMessages.join('\n  - ')}`,
      'config',
      false,
      { validationErrors: errorMessages },
      ErrorCode.CONFIG_VALIDATION_FAILED
    );
  }

  performSecurityValidation(config);

  if (!config.rules && !config.authentication) {
    console.warn(
      '⚠️  Configuration file contains no rules or authentication. The pentest will run without any scoping restrictions or login capabilities.'
    );
  } else if (config.rules && !config.rules.avoid && !config.rules.focus) {
    console.warn(
      '⚠️  Configuration file contains no rules. The pentest will run without any scoping restrictions.'
    );
  }
};

const performSecurityValidation = (config: Config): void => {
  if (config.authentication) {
    const auth = config.authentication;

    // Check login_url for dangerous patterns (AJV's "uri" format allows javascript: per RFC 3986)
    if (auth.login_url) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(auth.login_url)) {
          throw new PentestError(
            `authentication.login_url contains potentially dangerous pattern: ${pattern.source}`,
            'config',
            false,
            { field: 'login_url', pattern: pattern.source },
            ErrorCode.CONFIG_VALIDATION_FAILED
          );
        }
      }
    }

    if (auth.credentials) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(auth.credentials.username)) {
          throw new PentestError(
            `authentication.credentials.username contains potentially dangerous pattern: ${pattern.source}`,
            'config',
            false,
            { field: 'credentials.username', pattern: pattern.source },
            ErrorCode.CONFIG_VALIDATION_FAILED
          );
        }
        if (pattern.test(auth.credentials.password)) {
          throw new PentestError(
            `authentication.credentials.password contains potentially dangerous pattern: ${pattern.source}`,
            'config',
            false,
            { field: 'credentials.password', pattern: pattern.source },
            ErrorCode.CONFIG_VALIDATION_FAILED
          );
        }
      }
    }

    if (auth.login_flow) {
      auth.login_flow.forEach((step, index) => {
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(step)) {
            throw new PentestError(
              `authentication.login_flow[${index}] contains potentially dangerous pattern: ${pattern.source}`,
              'config',
              false,
              { field: `login_flow[${index}]`, pattern: pattern.source },
              ErrorCode.CONFIG_VALIDATION_FAILED
            );
          }
        }
      });
    }
  }

  if (config.rules) {
    validateRulesSecurity(config.rules.avoid, 'avoid');
    validateRulesSecurity(config.rules.focus, 'focus');

    checkForDuplicates(config.rules.avoid || [], 'avoid');
    checkForDuplicates(config.rules.focus || [], 'focus');
    checkForConflicts(config.rules.avoid, config.rules.focus);
  }
};

const validateRulesSecurity = (rules: Rule[] | undefined, ruleType: string): void => {
  if (!rules) return;

  rules.forEach((rule, index) => {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(rule.url_path)) {
        throw new PentestError(
          `rules.${ruleType}[${index}].url_path contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: `rules.${ruleType}[${index}].url_path`, pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      if (pattern.test(rule.description)) {
        throw new PentestError(
          `rules.${ruleType}[${index}].description contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: `rules.${ruleType}[${index}].description`, pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
    }

    validateRuleTypeSpecific(rule, ruleType, index);
  });
};

const validateRuleTypeSpecific = (rule: Rule, ruleType: string, index: number): void => {
  const field = `rules.${ruleType}[${index}].url_path`;

  switch (rule.type) {
    case 'path':
      if (!rule.url_path.startsWith('/')) {
        throw new PentestError(
          `${field} for type 'path' must start with '/'`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      break;

    case 'subdomain':
    case 'domain':
      // Basic domain validation - no slashes allowed
      if (rule.url_path.includes('/')) {
        throw new PentestError(
          `${field} for type '${rule.type}' cannot contain '/' characters`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      // Must contain at least one dot for domains
      if (rule.type === 'domain' && !rule.url_path.includes('.')) {
        throw new PentestError(
          `${field} for type 'domain' must be a valid domain name`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      break;

    case 'method': {
      const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (!allowedMethods.includes(rule.url_path.toUpperCase())) {
        throw new PentestError(
          `${field} for type 'method' must be one of: ${allowedMethods.join(', ')}`,
          'config',
          false,
          { field, ruleType: rule.type, allowedMethods },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      break;
    }

    case 'header':
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new PentestError(
          `${field} for type 'header' must be a valid header name (alphanumeric, hyphens, underscores only)`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      break;

    case 'parameter':
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new PentestError(
          `${field} for type 'parameter' must be a valid parameter name (alphanumeric, hyphens, underscores only)`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED
        );
      }
      break;
  }
};

const checkForDuplicates = (rules: Rule[], ruleType: string): void => {
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.url_path}`;
    if (seen.has(key)) {
      throw new PentestError(
        `Duplicate rule found in rules.${ruleType}[${index}]: ${rule.type} '${rule.url_path}'`,
        'config',
        false,
        { field: `rules.${ruleType}[${index}]`, ruleType: rule.type, urlPath: rule.url_path },
        ErrorCode.CONFIG_VALIDATION_FAILED
      );
    }
    seen.add(key);
  });
};

const checkForConflicts = (avoidRules: Rule[] = [], focusRules: Rule[] = []): void => {
  const avoidSet = new Set(avoidRules.map((rule) => `${rule.type}:${rule.url_path}`));

  focusRules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.url_path}`;
    if (avoidSet.has(key)) {
      throw new PentestError(
        `Conflicting rule found: rules.focus[${index}] '${rule.url_path}' also exists in rules.avoid`,
        'config',
        false,
        { field: `rules.focus[${index}]`, urlPath: rule.url_path },
        ErrorCode.CONFIG_VALIDATION_FAILED
      );
    }
  });
};

const sanitizeRule = (rule: Rule): Rule => {
  return {
    description: rule.description.trim(),
    type: rule.type.toLowerCase().trim() as Rule['type'],
    url_path: rule.url_path.trim(),
  };
};

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

const sanitizeAuthentication = (auth: Authentication): Authentication => {
  return {
    login_type: auth.login_type.toLowerCase().trim() as Authentication['login_type'],
    login_url: auth.login_url.trim(),
    credentials: {
      username: auth.credentials.username.trim(),
      password: auth.credentials.password,
      ...(auth.credentials.totp_secret && { totp_secret: auth.credentials.totp_secret.trim() }),
    },
    ...(auth.login_flow && { login_flow: auth.login_flow.map((step) => step.trim()) }),
    success_condition: {
      type: auth.success_condition.type.toLowerCase().trim() as Authentication['success_condition']['type'],
      value: auth.success_condition.value.trim(),
    },
  };
};
