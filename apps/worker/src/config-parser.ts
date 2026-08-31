// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createRequire } from 'node:module';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';
import yaml from 'js-yaml';
import { fs } from 'zx';
import { PentestError } from './services/error-handling.js';
import {
  ALL_VULN_CLASSES,
  type Authentication,
  type BlackboxConfig,
  type BlackboxIdentity,
  type Config,
  type ConfigMode,
  type DistributedConfig,
  type IdentityBoundRequestField,
  type NormalizedBlackboxConfig,
  type Rule,
  type Rules,
} from './types/config.js';
import { ErrorCode } from './types/errors.js';

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
  throw new PentestError(`Failed to load configuration schema: ${errMsg}`, 'config', false, {
    schemaPath: '../configs/config-schema.json',
    originalError: errMsg,
  });
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

export const parseConfig = async (configPath: string, mode: ConfigMode = 'whitebox'): Promise<Config> => {
  try {
    // 1. Verify file exists
    if (!(await fs.pathExists(configPath))) {
      throw new PentestError(
        `Configuration file not found: ${configPath}`,
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_NOT_FOUND,
      );
    }

    // 2. Check file size
    const stats = await fs.stat(configPath);
    const maxFileSize = 1024 * 1024; // 1MB
    if (stats.size > maxFileSize) {
      throw new PentestError(
        `Configuration file too large: ${stats.size} bytes (maximum: ${maxFileSize} bytes)`,
        'config',
        false,
        { configPath, fileSize: stats.size, maxFileSize },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      );
    }

    // 3. Read and check for empty content
    const configContent = await fs.readFile(configPath, 'utf8');

    if (!configContent.trim()) {
      throw new PentestError(
        'Configuration file is empty',
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      );
    }

    // 4. Parse YAML with safe schema
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
        ErrorCode.CONFIG_PARSE_ERROR,
      );
    }

    // 5. Guard against null/undefined parse result
    if (config === null || config === undefined) {
      throw new PentestError(
        'Configuration file resulted in null/undefined after parsing',
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_PARSE_ERROR,
      );
    }

    // 6. Validate schema, security rules, and return
    validateConfig(config as Config, mode);

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
      ErrorCode.CONFIG_PARSE_ERROR,
    );
  }
};

/**
 * Parse a raw YAML string into a validated Config object.
 *
 * Same validation as parseConfig but accepts a string instead of a file path.
 * Used when config YAML is passed inline (e.g., from a parent workflow).
 */
export const parseConfigYAML = (yamlContent: string, mode: ConfigMode = 'whitebox'): Config => {
  if (!yamlContent.trim()) {
    throw new PentestError(
      'Configuration YAML string is empty',
      'config',
      false,
      {},
      ErrorCode.CONFIG_VALIDATION_FAILED,
    );
  }

  let config: unknown;
  try {
    config = yaml.load(yamlContent, {
      schema: yaml.FAILSAFE_SCHEMA,
      json: false,
    });
  } catch (yamlError) {
    const errMsg = yamlError instanceof Error ? yamlError.message : String(yamlError);
    throw new PentestError(
      `YAML parsing failed: ${errMsg}`,
      'config',
      false,
      { originalError: errMsg },
      ErrorCode.CONFIG_PARSE_ERROR,
    );
  }

  if (config === null || config === undefined) {
    throw new PentestError(
      'Configuration YAML resulted in null/undefined after parsing',
      'config',
      false,
      {},
      ErrorCode.CONFIG_PARSE_ERROR,
    );
  }

  validateConfig(config as Config, mode);
  return config as Config;
};

function checkDeprecatedFields(config: Config): void {
  const messages: string[] = [];

  const checkRules = (rules: unknown, where: string): void => {
    if (!Array.isArray(rules)) return;
    rules.forEach((rule, idx) => {
      if (typeof rule !== 'object' || rule === null) return;
      const r = rule as Record<string, unknown>;
      if (r.type === 'path') {
        messages.push(`rules.${where}[${idx}].type: 'path' has been renamed to 'url_path'.`);
      }
      if ('url_path' in r && !('value' in r)) {
        messages.push(`rules.${where}[${idx}]: the rule field 'url_path' has been renamed to 'value'.`);
      }
    });
  };

  const raw = config as Record<string, unknown>;
  const rules = raw.rules as { avoid?: unknown; focus?: unknown } | undefined;
  checkRules(rules?.avoid, 'avoid');
  checkRules(rules?.focus, 'focus');

  if (messages.length > 0) {
    throw new PentestError(
      `Configuration uses deprecated fields. Please update:\n  - ${messages.join('\n  - ')}`,
      'config',
      false,
      { deprecatedFields: messages },
      ErrorCode.CONFIG_VALIDATION_FAILED,
    );
  }
}

const validateConfig = (config: Config, mode: ConfigMode): void => {
  if (!config || typeof config !== 'object') {
    throw new PentestError(
      'Configuration must be a valid object',
      'config',
      false,
      {},
      ErrorCode.CONFIG_VALIDATION_FAILED,
    );
  }

  if (Array.isArray(config)) {
    throw new PentestError(
      'Configuration must be an object, not an array',
      'config',
      false,
      {},
      ErrorCode.CONFIG_VALIDATION_FAILED,
    );
  }

  checkDeprecatedFields(config);

  const isValid = validateSchema(config);
  if (!isValid) {
    const errors = validateSchema.errors || [];
    const errorMessages = formatAjvErrors(errors);
    throw new PentestError(
      `Configuration validation failed:\n  - ${errorMessages.join('\n  - ')}`,
      'config',
      false,
      { validationErrors: errorMessages },
      ErrorCode.CONFIG_VALIDATION_FAILED,
    );
  }

  validateMode(config, mode);
  performSecurityValidation(config);

  const hasAnySteering =
    !!config.rules ||
    !!config.authentication ||
    !!config.identities ||
    !!config.description ||
    !!config.vuln_classes ||
    config.exploit !== undefined ||
    !!config.report ||
    !!config.rules_of_engagement;
  if (!hasAnySteering) {
    console.warn('⚠️  Configuration file contains no steering fields. The pentest will run with all defaults.');
  } else if (config.rules && !config.rules.avoid && !config.rules.focus) {
    console.warn('⚠️  Configuration file contains no rules. The pentest will run without any scoping restrictions.');
  }
};

const validateMode = (config: Config, mode: ConfigMode): void => {
  if (mode === 'whitebox') {
    if (config.identities !== undefined) {
      throwConfigValidation('identities is only allowed in blackbox mode', { field: 'identities', mode });
    }
    if (config.identity_bound_request_fields !== undefined) {
      throwConfigValidation('identity_bound_request_fields is only allowed in blackbox mode', {
        field: 'identity_bound_request_fields',
        mode,
      });
    }
    return;
  }

  const identities = config.identities;
  if (!identities) {
    throwConfigValidation('identities is required in blackbox mode', { field: 'identities', mode });
    return;
  }
  const identityBoundRequestFields = config.identity_bound_request_fields;
  if (identityBoundRequestFields === undefined) {
    throwConfigValidation('identity_bound_request_fields is required in blackbox mode', {
      field: 'identity_bound_request_fields',
      mode,
    });
    return;
  }
  normalizeIdentityBoundRequestFields(identityBoundRequestFields);
  if (config.authentication !== undefined) {
    throwConfigValidation('authentication is not allowed in blackbox mode; use identities', {
      field: 'authentication',
      mode,
    });
  }

  const names = new Set<string>();
  for (const identity of identities) {
    if (names.has(identity.name)) {
      throwConfigValidation(`Duplicate blackbox identity name: ${identity.name}`, {
        field: 'identities.name',
        identityName: identity.name,
      });
    }
    names.add(identity.name);
  }

  const codePathRule = [...(config.rules?.avoid ?? []), ...(config.rules?.focus ?? [])].find(
    (rule) => rule.type === 'code_path',
  );
  if (codePathRule) {
    throwConfigValidation('code_path rules are not allowed in blackbox mode', {
      field: 'rules',
      ruleType: codePathRule.type,
    });
  }
  if (config.exploit === 'false') {
    throwConfigValidation('exploit must be "true" in blackbox mode', { field: 'exploit' });
  }
  if (config.vuln_classes && (config.vuln_classes.length !== 1 || config.vuln_classes[0] !== 'authz')) {
    throwConfigValidation('blackbox mode supports only the authz vulnerability class', {
      field: 'vuln_classes',
      vulnerabilityClasses: config.vuln_classes,
    });
  }
};

const RESERVED_IDENTITY_HEADER_NAMES = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'origin',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-shannon-capture',
]);
const JSON_POINTER_DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function validateIdentityJsonPointer(pointer: string): void {
  if (pointer.length === 0 || pointer.length > 512 || !pointer.startsWith('/') || /[\r\n\0]/.test(pointer)) {
    throwConfigValidation('Invalid JSON pointer in identity_bound_request_fields', {
      field: 'identity_bound_request_fields.pointer',
    });
  }
  for (const encoded of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(encoded)) {
      throwConfigValidation('Invalid JSON pointer escape in identity_bound_request_fields', {
        field: 'identity_bound_request_fields.pointer',
      });
    }
    const segment = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (JSON_POINTER_DANGEROUS_SEGMENTS.has(segment)) {
      throwConfigValidation('Unsafe JSON pointer in identity_bound_request_fields', {
        field: 'identity_bound_request_fields.pointer',
      });
    }
  }
}

function normalizeIdentityBoundRequestFields(
  fields: readonly IdentityBoundRequestField[],
): readonly IdentityBoundRequestField[] {
  const seen = new Set<string>();
  return fields.map((field): IdentityBoundRequestField => {
    let normalized: IdentityBoundRequestField;
    let identity: string;
    if (field.location === 'json') {
      validateIdentityJsonPointer(field.pointer);
      normalized = { location: 'json', pointer: field.pointer };
      identity = `json\0${field.pointer}`;
    } else {
      if (field.name.length === 0 || field.name.length > 128 || field.name.trim() !== field.name || /[\r\n\0]/.test(field.name)) {
        throwConfigValidation(`Invalid ${field.location} name in identity_bound_request_fields`, {
          field: 'identity_bound_request_fields.name',
          location: field.location,
        });
      }
      const name = field.location === 'header' ? field.name.toLowerCase() : field.name;
      if (field.location === 'header' && RESERVED_IDENTITY_HEADER_NAMES.has(name)) {
        throwConfigValidation(`Reserved header ${field.name} cannot be declared identity-bound`, {
          field: 'identity_bound_request_fields.name',
          location: field.location,
        });
      }
      normalized = { location: field.location, name };
      identity = `${field.location}\0${name}`;
    }
    if (seen.has(identity)) {
      throwConfigValidation('Duplicate identity_bound_request_fields selector', {
        field: 'identity_bound_request_fields',
      });
    }
    seen.add(identity);
    return normalized;
  });
}

const throwConfigValidation = (message: string, context: Record<string, unknown>): never => {
  throw new PentestError(message, 'config', false, context, ErrorCode.CONFIG_VALIDATION_FAILED);
};

const performSecurityValidation = (config: Config): void => {
  if (config.authentication) {
    validateAuthenticationSecurity(config.authentication, 'authentication');
  }
  if (config.identities) {
    config.identities.forEach((identity, index) => {
      validateAuthenticationSecurity(identity.authentication, `identities[${index}].authentication`);
    });
  }

  if (config.rules) {
    validateRulesSecurity(config.rules.avoid, 'avoid');
    validateRulesSecurity(config.rules.focus, 'focus');

    checkForDuplicates(config.rules.avoid || [], 'avoid');
    checkForDuplicates(config.rules.focus || [], 'focus');
    checkForConflicts(config.rules.avoid, config.rules.focus);
  }

  if (config.description) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(config.description)) {
        throw new PentestError(
          `description contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: 'description', pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
    }
  }

  if (config.rules_of_engagement) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(config.rules_of_engagement)) {
        throw new PentestError(
          `rules_of_engagement contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: 'rules_of_engagement', pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
    }
  }

  if (config.report?.guidance) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(config.report.guidance)) {
        throw new PentestError(
          `report.guidance contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: 'report.guidance', pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
    }
  }
};

const validateAuthenticationSecurity = (auth: Authentication, fieldPrefix: string): void => {
  // AJV's "uri" format allows non-HTTP schemes, so reject the established dangerous patterns here.
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(auth.login_url)) {
      throwConfigValidation(`${fieldPrefix}.login_url contains potentially dangerous pattern: ${pattern.source}`, {
        field: `${fieldPrefix}.login_url`,
        pattern: pattern.source,
      });
    }
    if (pattern.test(auth.credentials.username)) {
      throwConfigValidation(
        `${fieldPrefix}.credentials.username contains potentially dangerous pattern: ${pattern.source}`,
        { field: `${fieldPrefix}.credentials.username`, pattern: pattern.source },
      );
    }
  }

  auth.login_flow?.forEach((step, index) => {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(step)) {
        throwConfigValidation(
          `${fieldPrefix}.login_flow[${index}] contains potentially dangerous pattern: ${pattern.source}`,
          { field: `${fieldPrefix}.login_flow[${index}]`, pattern: pattern.source },
        );
      }
    }
  });
};

const validateRulesSecurity = (rules: Rule[] | undefined, ruleType: string): void => {
  if (!rules) return;

  rules.forEach((rule, index) => {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(rule.value)) {
        throw new PentestError(
          `rules.${ruleType}[${index}].value contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: `rules.${ruleType}[${index}].value`, pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      if (rule.description !== undefined && pattern.test(rule.description)) {
        throw new PentestError(
          `rules.${ruleType}[${index}].description contains potentially dangerous pattern: ${pattern.source}`,
          'config',
          false,
          { field: `rules.${ruleType}[${index}].description`, pattern: pattern.source },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
    }

    validateRuleTypeSpecific(rule, ruleType, index);
  });
};

const validateRuleTypeSpecific = (rule: Rule, ruleType: string, index: number): void => {
  const field = `rules.${ruleType}[${index}].value`;

  switch (rule.type) {
    case 'url_path':
      if (!rule.value.startsWith('/')) {
        throw new PentestError(
          `${field} for type 'url_path' must start with '/'`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      break;

    case 'code_path':
      if (rule.value.includes('://')) {
        throw new PentestError(
          `${field} for type 'code_path' must not contain a URL protocol (got '${rule.value}')`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      break;

    case 'subdomain':
    case 'domain':
      // Basic domain validation - no slashes allowed
      if (rule.value.includes('/')) {
        throw new PentestError(
          `${field} for type '${rule.type}' cannot contain '/' characters`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      // Must contain at least one dot for domains
      if (rule.type === 'domain' && !rule.value.includes('.')) {
        throw new PentestError(
          `${field} for type 'domain' must be a valid domain name`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      break;

    case 'method': {
      const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (!allowedMethods.includes(rule.value.toUpperCase())) {
        throw new PentestError(
          `${field} for type 'method' must be one of: ${allowedMethods.join(', ')}`,
          'config',
          false,
          { field, ruleType: rule.type, allowedMethods },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      break;
    }

    case 'header':
      if (!rule.value.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new PentestError(
          `${field} for type 'header' must be a valid header name (alphanumeric, hyphens, underscores only)`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      break;

    case 'parameter':
      if (!rule.value.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new PentestError(
          `${field} for type 'parameter' must be a valid parameter name (alphanumeric, hyphens, underscores only)`,
          'config',
          false,
          { field, ruleType: rule.type },
          ErrorCode.CONFIG_VALIDATION_FAILED,
        );
      }
      break;
  }
};

const checkForDuplicates = (rules: Rule[], ruleType: string): void => {
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.value}`;
    if (seen.has(key)) {
      throw new PentestError(
        `Duplicate rule found in rules.${ruleType}[${index}]: ${rule.type} '${rule.value}'`,
        'config',
        false,
        { field: `rules.${ruleType}[${index}]`, ruleType: rule.type, value: rule.value },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      );
    }
    seen.add(key);
  });
};

const checkForConflicts = (avoidRules: Rule[] = [], focusRules: Rule[] = []): void => {
  const avoidSet = new Set(avoidRules.map((rule) => `${rule.type}:${rule.value}`));

  focusRules.forEach((rule, index) => {
    const key = `${rule.type}:${rule.value}`;
    if (avoidSet.has(key)) {
      throw new PentestError(
        `Conflicting rule found: rules.focus[${index}] '${rule.value}' also exists in rules.avoid`,
        'config',
        false,
        { field: `rules.focus[${index}]`, value: rule.value },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      );
    }
  });
};

const sanitizeRule = (rule: Rule): Rule => {
  const sanitized: Rule = {
    type: rule.type.toLowerCase().trim() as Rule['type'],
    value: rule.value.trim(),
  };
  const description = rule.description?.trim();
  if (description) {
    sanitized.description = description;
  }
  return sanitized;
};

export const distributeConfig = (config: Config | null): DistributedConfig => {
  const avoid = config?.rules?.avoid || [];
  const focus = config?.rules?.focus || [];
  const authentication = config?.authentication || null;
  const description = config?.description?.trim() || '';

  const vuln_classes =
    config?.vuln_classes && config.vuln_classes.length > 0 ? [...config.vuln_classes] : [...ALL_VULN_CLASSES];

  const exploit = config?.exploit !== undefined ? config.exploit === 'true' : true;

  const report = {
    // Default on; only an explicit "false" opts out.
    sarif: config?.report?.sarif !== 'false',
    ...(config?.report?.min_severity && { min_severity: config.report.min_severity }),
    ...(config?.report?.min_confidence && { min_confidence: config.report.min_confidence }),
    ...(config?.report?.guidance && { guidance: config.report.guidance.trim() }),
  };

  const rules_of_engagement = config?.rules_of_engagement?.trim() ?? '';

  return {
    avoid: avoid.map(sanitizeRule),
    focus: focus.map(sanitizeRule),
    authentication: authentication ? sanitizeAuthentication(authentication) : null,
    description,
    vuln_classes,
    exploit,
    report,
    rules_of_engagement,
  };
};

const sanitizeAuthentication = (auth: Authentication): Authentication => {
  return {
    login_type: auth.login_type.toLowerCase().trim() as Authentication['login_type'],
    login_url: auth.login_url.trim(),
    credentials: {
      username: auth.credentials.username.trim(),
      ...(auth.credentials.password && { password: auth.credentials.password }),
      ...(auth.credentials.totp_secret && {
        totp_secret: auth.credentials.totp_secret.replace(/\s/g, ''),
      }),
      ...(auth.credentials.email_login && {
        email_login: {
          address: auth.credentials.email_login.address.trim(),
          password: auth.credentials.email_login.password,
          ...(auth.credentials.email_login.totp_secret && {
            totp_secret: auth.credentials.email_login.totp_secret.replace(/\s/g, ''),
          }),
        },
      }),
    },
    ...(auth.login_flow && { login_flow: auth.login_flow.map((step) => step.trim()) }),
    success_condition: {
      type: auth.success_condition.type.toLowerCase().trim() as Authentication['success_condition']['type'],
      value: auth.success_condition.value.trim(),
    },
  };
};

export function normalizeBlackboxConfig(config: Config): NormalizedBlackboxConfig {
  validateMode(config, 'blackbox');

  const rules: Rules = {};
  if (config.rules?.avoid) rules.avoid = config.rules.avoid.map(sanitizeRule);
  if (config.rules?.focus) rules.focus = config.rules.focus.map(sanitizeRule);

  return {
    identities: (config as BlackboxConfig).identities.map(
      (identity): BlackboxIdentity => ({
        name: identity.name.trim(),
        role: identity.role.trim(),
        authentication: sanitizeAuthentication(identity.authentication),
      }),
    ),
    identityBoundRequestFields: normalizeIdentityBoundRequestFields(
      (config as BlackboxConfig).identity_bound_request_fields,
    ),
    rules,
    description: config.description?.trim() ?? '',
    vulnClasses: ['authz'],
    exploit: true,
    rulesOfEngagement: config.rules_of_engagement?.trim() ?? '',
  };
}
