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

export type LoginType = 'form' | 'sso' | 'api' | 'basic';

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
  credentials: Credentials;
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
