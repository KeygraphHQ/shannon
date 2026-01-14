// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Configuration type definitions
 */

export type RuleType =
  | 'path'
  | 'subdomain'
  | 'domain'
  | 'method'
  | 'header'
  | 'parameter';

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

export type SuccessConditionType = 'url' | 'cookie' | 'element' | 'redirect';

export interface SuccessCondition {
  type: SuccessConditionType;
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

export interface Config {
  rules?: Rules;
  authentication?: Authentication;
  login?: unknown; // Deprecated
  ci?: CiConfig;
  api?: ApiConfig;
  integrations?: IntegrationsConfig;
  compliance?: ComplianceConfig;
}

export interface DistributedConfig {
  avoid: Rule[];
  focus: Rule[];
  authentication: Authentication | null;
}

export type CiPlatform = 'github' | 'gitlab';

export interface CiConfig {
  enabled?: boolean;
  platforms?: CiPlatform[];
  fail_on?: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  generate_sarif?: boolean;
  generate_gitlab_sast?: boolean;
}

export interface WebhookConfig {
  url: string;
  events?: string[];
  secret?: string;
}

export interface ApiConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  api_key?: string;
  webhooks?: WebhookConfig[];
}

export interface SlackConfig {
  webhook_url?: string;
  bot_token?: string;
  channel?: string;
  notify_on?: string[];
}

export interface JiraConfig {
  base_url: string;
  email: string;
  api_token: string;
  project_key: string;
  issue_type: string;
  labels?: string[];
  priority_mapping?: Record<string, string>;
}

export interface IntegrationsConfig {
  slack?: SlackConfig;
  jira?: JiraConfig;
  webhooks?: WebhookConfig[];
}

export interface ComplianceConfig {
  frameworks?: string[];
}
