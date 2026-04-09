// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Config Loader Service
 *
 * Wraps parseConfig + distributeConfig with Result type for explicit error handling.
 * Pure service with no Temporal dependencies.
 */

import { distributeConfig, parseConfig, parseConfigYAML } from '../config-parser.js';
import type { DistributedConfig } from '../types/config.js';
import { ErrorCode } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import { PentestError } from './error-handling.js';

/**
 * Service for loading and distributing configuration files.
 *
 * Provides a Result-based API for explicit error handling,
 * allowing callers to decide how to handle failures.
 */
export class ConfigLoaderService {
  /**
   * Load and distribute a configuration file.
   *
   * @param configPath - Path to the YAML configuration file
   * @returns Result containing DistributedConfig on success, PentestError on failure
   */
  async load(configPath: string): Promise<Result<DistributedConfig, PentestError>> {
    try {
      const config = await parseConfig(configPath);
      const distributed = distributeConfig(config);
      return ok(distributed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Determine appropriate error code based on error message
      let errorCode = ErrorCode.CONFIG_PARSE_ERROR;
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        errorCode = ErrorCode.CONFIG_NOT_FOUND;
      } else if (errorMessage.includes('validation failed')) {
        errorCode = ErrorCode.CONFIG_VALIDATION_FAILED;
      }

      return err(
        new PentestError(
          `Failed to load config ${configPath}: ${errorMessage}`,
          'config',
          false,
          { configPath, originalError: errorMessage },
          errorCode,
        ),
      );
    }
  }

  /**
   * Load config if path is provided, otherwise return null config.
   * If configData is provided (pre-parsed), returns it directly without file I/O.
   *
   * @param configPath - Optional path to the YAML configuration file
   * @param configData - Optional pre-parsed config (bypasses file loading)
   * @returns Result containing DistributedConfig (or null) on success, PentestError on failure
   */
  async loadOptional(
    configPath: string | undefined,
    configData?: DistributedConfig,
    configYAML?: string,
  ): Promise<Result<DistributedConfig | null, PentestError>> {
    if (configData) {
      return ok(configData);
    }
    if (configYAML) {
      try {
        const config = parseConfigYAML(configYAML);
        return ok(distributeConfig(config));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return err(
          new PentestError(`Failed to parse config YAML: ${errorMessage}`, 'config', false, { originalError: errorMessage }, ErrorCode.CONFIG_PARSE_ERROR),
        );
      }
    }
    if (!configPath) {
      return ok(null);
    }
    return this.load(configPath);
  }
}
