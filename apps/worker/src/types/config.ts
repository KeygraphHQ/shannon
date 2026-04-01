// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Configuration type definitions
 */

export type RuleType = 'path' | 'subdomain' | 'domain' | 'method' | 'header' | 'parameter';

export interface Rule {
  description: string;
  type: RuleType;
  url_path: string;
}

export interface Rules {
  avoid?: Rule[];
  focus?: Rule[];
}

export type LoginType = 'form' | 'sso' | 'api' | 'basic' | 'interactive';

export interface SuccessCondition {
  type: 'url_contains' | 'element_present' | 'url_equals_exactly' | 'text_contains';
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
  credentials?: Credentials;
  login_flow?: string[];
  success_condition: SuccessCondition;
}

export interface Config {
  rules?: Rules;
  authentication?: Authentication;
  pipeline?: PipelineConfig;
  description?: string;
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
  description: string;
}

/**
 * LLM provider configuration for multi-provider support.
 *
 * Maps to SDK environment variables at execution time. When providerType
 * is omitted or 'anthropic_api', falls back to apiKey + ANTHROPIC_API_KEY.
 */
export interface ProviderConfig {
  readonly providerType?: string;
  readonly apiKey?: string;
  readonly awsRegion?: string;
  readonly awsAccessKeyId?: string;
  readonly awsSecretAccessKey?: string;
  readonly gcpRegion?: string;
  readonly gcpProjectId?: string;
  readonly gcpCredentialsPath?: string;
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly modelOverrides?: Record<string, string>;
  readonly supportsStructuredOutput?: boolean;
}

/**
 * Runtime configuration for the DI container.
 *
 * Abstracts path conventions and credential threading so consumers
 * can override OSS defaults without modifying source files.
 */
export interface ContainerConfig {
  /** Subdirectory for deliverables relative to repoPath. Default: '.shannon/deliverables' */
  readonly deliverablesSubdir: string;
  /** Directory for audit logs. Default: './workspaces' */
  readonly auditDir: string;
  /** API key override — when set, executor reads from config instead of process.env */
  readonly apiKey?: string;
  /** Prompt directory override — when set, prompt manager loads from this path */
  readonly promptDir?: string;
  /** LLM provider configuration — when set, executor maps to SDK env vars directly */
  readonly providerConfig?: ProviderConfig;
}
