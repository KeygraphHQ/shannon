/**
 * validate_config Tool
 *
 * Validates a YAML configuration file against Shannon's JSON Schema.
 * Duplicates the validation logic from src/config-parser.ts to avoid
 * pulling in heavy Shannon dependencies.
 */

import fs from 'fs/promises';
import { createRequire } from 'module';
import yaml from 'js-yaml';
import { Ajv, type ValidateFunction } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import { toolSuccess, toolError, type ToolResult, type Config } from '../types.js';

// Handle ESM/CJS interop for ajv-formats
const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require('ajv-formats');

export async function validateConfig(
  configName: string,
  paths: PathResolver
): Promise<ToolResult> {
  // 1. Resolve config path
  const configPath = await paths.resolveConfig(configName);
  if (!configPath) {
    const available = await paths.listConfigs();
    return toolError(`Config file not found: ${configName}`, {
      suggestion: 'Provide a filename in configs/ or an absolute path',
      available_configs: available,
    });
  }

  // 2. Read and size-check the file
  let content: string;
  try {
    const stats = await fs.stat(configPath);
    if (stats.size > 1024 * 1024) {
      return toolError('Config file too large (max 1MB)', { size: stats.size });
    }
    content = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return toolError(`Failed to read config file: ${errMsg}`);
  }

  if (!content.trim()) {
    return toolError('Config file is empty');
  }

  // 3. Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(content, {
      schema: yaml.FAILSAFE_SCHEMA,
      json: false,
      filename: configPath,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return toolError(`YAML parsing failed: ${errMsg}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return toolError('Config must be a YAML object (not null, array, or scalar)');
  }

  // 4. JSON Schema validation
  let schemaErrors: string[] = [];
  try {
    const schemaContent = await fs.readFile(paths.configSchemaPath, 'utf8');
    const schema = JSON.parse(schemaContent) as object;

    const ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(ajv);
    const validate: ValidateFunction = ajv.compile(schema);

    const isValid = validate(parsed);
    if (!isValid && validate.errors) {
      schemaErrors = validate.errors.map((err) => {
        const errorPath = err.instancePath || 'root';
        return `${errorPath}: ${err.message}`;
      });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return toolError(`Failed to load config schema: ${errMsg}`);
  }

  if (schemaErrors.length > 0) {
    return toolError('Config validation failed', { errors: schemaErrors });
  }

  // 5. Summarize valid config
  const config = parsed as Config;
  return toolSuccess({
    valid: true,
    path: configPath,
    summary: {
      hasAuthentication: !!config.authentication,
      loginType: config.authentication?.login_type ?? null,
      avoidRules: config.rules?.avoid?.length ?? 0,
      focusRules: config.rules?.focus?.length ?? 0,
    },
  });
}
