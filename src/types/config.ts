// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Configuration type definitions
 */

import type { TargetType } from './agents.js';

export type RuleType =
  | 'path'
  | 'subdomain'
  | 'domain'
  | 'method'
  | 'header'
  | 'parameter'
  | 'command'
  | 'argument'
  | 'endpoint';

export interface Rule {
  description: string;
  type: RuleType;
  url_path: string;
}

export interface Rules {
  avoid?: Rule[];
  focus?: Rule[];
}

export type LoginType = 'form' | 'sso' | 'api' | 'basic';

export interface SuccessCondition {
  type: 'url' | 'cookie' | 'element' | 'redirect';
  value: string;
}

export interface Credentials {
  username: string;
  password: string;
  totp_secret?: string;
}

export interface Authentication {
  login_type: LoginType;
  login_url: string;
  credentials: Credentials;
  login_flow: string[];
  success_condition: SuccessCondition;
}

// === CLI Target Configuration ===

export interface CliTarget {
  /** The CLI command or binary to test */
  command: string;
  /** Working directory for CLI execution */
  working_directory?: string;
  /** Environment variables to set during execution */
  env_vars?: Record<string, string>;
  /** Subcommands to focus testing on */
  subcommands?: string[];
  /** Whether the CLI accepts stdin input */
  accepts_stdin?: boolean;
  /** Whether the CLI is AI-powered (enables prompt injection testing) */
  ai_powered?: boolean;
  /** Config files the CLI reads (for config injection testing) */
  config_files?: string[];
}

// === API Target Configuration ===

export interface ApiTarget {
  /** Base URL for the API */
  base_url: string;
  /** API authentication method */
  auth_method?: 'bearer' | 'api_key' | 'oauth2' | 'basic' | 'none';
  /** API key or token for authenticated testing */
  auth_token?: string;
  /** Header name for API key (default: Authorization) */
  auth_header?: string;
  /** OpenAPI/Swagger spec path (for endpoint discovery) */
  openapi_spec?: string;
  /** GraphQL endpoint (enables GraphQL-specific testing) */
  graphql_endpoint?: string;
}

export interface Config {
  /** Target type determines which pipeline and agents to use */
  target_type?: TargetType;
  rules?: Rules;
  authentication?: Authentication;
  pipeline?: PipelineConfig;
  /** CLI-specific target configuration */
  cli_target?: CliTarget;
  /** API-specific target configuration */
  api_target?: ApiTarget;
}

export type RetryPreset = 'default' | 'subscription';

export interface PipelineConfig {
  retry_preset?: RetryPreset;
  max_concurrent_pipelines?: number;
}

export interface DistributedConfig {
  avoid: Rule[];
  focus: Rule[];
  authentication: Authentication | null;
  /** CLI target configuration, present when target_type is 'cli' */
  cliTarget: CliTarget | null;
  /** API target configuration, present when target_type is 'api' */
  apiTarget: ApiTarget | null;
}
