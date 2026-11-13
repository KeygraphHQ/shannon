// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Configuration type definitions
 */

// Every variant but `code_path` scopes network requests (URL/method/header/parameter matching).
// `code_path` is enforced by a different mechanism entirely: it becomes a permission-system deny
// rule so an avoided path is blocked from every tool and child session, not just outbound traffic.
export type RuleType = 'url_path' | 'subdomain' | 'domain' | 'method' | 'header' | 'parameter' | 'code_path';

export interface Rule {
  description?: string;
  type: RuleType;
  value: string;
}

export interface Rules {
  avoid?: Rule[];
  focus?: Rule[];
}

export type VulnClass = 'injection' | 'xss' | 'auth' | 'authz' | 'ssrf';

export const ALL_VULN_CLASSES: readonly VulnClass[] = ['injection', 'xss', 'auth', 'authz', 'ssrf'];

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';

export interface ReportConfig {
  min_severity?: Severity;
  min_confidence?: Confidence;
  guidance?: string;
  /**
   * Emit report.sarif alongside the markdown report. On by default for exploit runs; set 'false'
   * to opt out. Ignored when exploit is false.
   */
  sarif?: 'true' | 'false';
}

// `form` and `sso` are browser flows: a real login is driven in Playwright and the resulting
// session (cookies/storage) is captured and reused. `api` is a non-browser flow for API-only
// targets: a bearer token is obtained from an OAuth token endpoint (see OAuthConfig) and
// attached to the agents' raw HTTP requests instead of a browser session. `basic` is reserved.
export type LoginType = 'form' | 'sso' | 'api' | 'basic';

export interface SuccessCondition {
  type: 'url_contains' | 'element_present' | 'url_equals_exactly' | 'text_contains';
  value: string;
}

export interface EmailLogin {
  address: string;
  password: string;
  totp_secret?: string;
}

export interface Credentials {
  username: string;
  password?: string;
  totp_secret?: string;
  email_login?: EmailLogin;
}

export type GrantType = 'client_credentials' | 'password' | 'refresh_token';
export type ClientAuthMethod = 'client_secret_post' | 'client_secret_basic';

// Non-browser OAuth token acquisition for `login_type: api`. The preflight fetches a token to
// fail fast on a broken grant and writes this config to disk; downstream agents mint fresh
// tokens on demand via the `get-oauth-token` CLI (which refreshes on expiry).
export interface OAuthConfig {
  token_url: string;
  grant_type: GrantType;
  client_id?: string;
  client_secret?: string;
  /** Resource-owner-password grant only. */
  username?: string;
  /** Resource-owner-password grant only. */
  password?: string;
  scope?: string;
  audience?: string;
  /** refresh_token grant only; the initial refresh token to exchange. */
  refresh_token?: string;
  /** How client credentials are presented to the token endpoint. Default: client_secret_post. */
  client_auth?: ClientAuthMethod;
  /** Header the agents attach the token under. Default: Authorization. */
  token_header?: string;
  /** Prefix placed before the token value in the header. Default: "Bearer ". */
  token_prefix?: string;
  /** Extra form parameters sent verbatim in the token request body. */
  extra_params?: Record<string, string>;
}

export interface Authentication {
  login_type: LoginType;
  // Optional: browser flows (form/sso) require login_url + credentials + success_condition;
  // the api flow requires oauth instead. The JSON schema enforces the right combination per
  // login_type, so these are typed optional but are present at runtime for the flow that needs them.
  login_url?: string;
  credentials?: Credentials;
  login_flow?: string[];
  success_condition?: SuccessCondition;
  oauth?: OAuthConfig;
}

export interface AgenticSastConfig {
  enabled: 'true' | 'false';
}

export interface Config {
  rules?: Rules;
  authentication?: Authentication;
  description?: string;
  agentic_sast?: AgenticSastConfig;
  exploit?: 'true' | 'false';
  report?: ReportConfig;
  rules_of_engagement?: string;
}

/** Report config after coercion. The YAML form of `sarif` is a string (see ReportConfig). */
export type DistributedReportConfig = Omit<ReportConfig, 'sarif'> & { sarif: boolean };

export interface DistributedConfig {
  avoid: Rule[];
  focus: Rule[];
  authentication: Authentication | null;
  description: string;
  /** Present only when Capella is enabled. */
  agenticSast?: true;
  exploit: boolean;
  report: DistributedReportConfig;
  rules_of_engagement: string;
}

/**
 * Runtime configuration for the DI container.
 *
 * Abstracts path conventions so consumers can override OSS defaults
 * without modifying source files.
 */
export interface ContainerConfig {
  /** Subdirectory for deliverables relative to repoPath. Default: '.shannon/deliverables' */
  readonly deliverablesSubdir: string;
  /** Directory for audit logs. Default: './workspaces' */
  readonly auditDir: string;
  /** Prompt directory override — when set, prompt manager loads from this path */
  readonly promptDir?: string;
}
