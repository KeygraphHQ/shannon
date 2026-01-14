// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Secure Jira Integration
 * Features: SSRF protection, retries, proper error handling, ADF formatting
 */

import type { JiraConfig } from '../types/config.js';
import type { Finding, Severity } from '../findings/types.js';
import { createSecureFetch, validateJiraUrl, validateJiraApiToken } from '../security/index.js';

// Create secure fetch for Jira API
const jiraFetch = createSecureFetch({
  timeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 1000,
  validateUrl: false, // We validate specifically for Jira
  onRetry: (attempt, error) => {
    console.warn(`⚠️  Jira retry ${attempt}: ${error.message}`);
  },
});

// Default priority mapping
const DEFAULT_PRIORITY_MAP: Record<Severity, string> = {
  Critical: 'Highest',
  High: 'High',
  Medium: 'Medium',
  Low: 'Low',
  Info: 'Lowest',
};

export interface JiraResult {
  success: boolean;
  issueKey?: string;
  issueUrl?: string;
  error?: string;
}

/**
 * Build Atlassian Document Format (ADF) description
 */
const buildAdfDescription = (finding: Finding): object => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Summary' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: finding.summary || 'No summary provided' }],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Impact' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: finding.impact || 'No impact assessment provided' }],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Evidence' }],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'text' },
      content: [{ type: 'text', text: finding.evidence || 'No evidence provided' }],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Affected Endpoints' }],
    },
    {
      type: 'bulletList',
      content: (finding.affected_endpoints || []).slice(0, 20).map((endpoint) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: endpoint }],
          },
        ],
      })),
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Remediation' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: finding.remediation || 'No remediation guidance provided' }],
    },
    ...(finding.references?.length
      ? [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'References' }],
          },
          {
            type: 'bulletList',
            content: finding.references.slice(0, 10).map((ref) => ({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: ref }],
                },
              ],
            })),
          },
        ]
      : []),
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Metadata' }],
    },
    {
      type: 'table',
      attrs: { isNumberColumnEnabled: false, layout: 'default' },
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Field' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Finding ID' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: finding.id || 'N/A' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Category' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: finding.category || 'N/A' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CWE' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: (finding.cwe || []).join(', ') || 'N/A' }] }] },
          ],
        },
        ...(finding.cvss_v31_score
          ? [
              {
                type: 'tableRow',
                content: [
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CVSS v3.1' }] }] },
                  { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${finding.cvss_v31_score} (${finding.cvss_v31_severity})` }] }] },
                ],
              },
            ]
          : []),
      ],
    },
  ],
});

/**
 * Create Jira issue for a finding
 */
export const createJiraIssue = async (
  config: JiraConfig,
  finding: Finding
): Promise<JiraResult> => {
  // Validate base URL
  const urlValidation = await validateJiraUrl(config.base_url);
  if (!urlValidation.valid) {
    return { success: false, error: urlValidation.error || 'Invalid Jira URL' };
  }

  // Validate API token
  const tokenValidation = validateJiraApiToken(config.api_token);
  if (!tokenValidation.valid) {
    return { success: false, error: tokenValidation.error || 'Invalid API token' };
  }

  // Build auth header
  const auth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');

  // Get priority from mapping or default
  const priorityMap = config.priority_mapping || DEFAULT_PRIORITY_MAP;
  const priority = priorityMap[finding.severity] || DEFAULT_PRIORITY_MAP[finding.severity];

  // Build issue payload
  const payload = {
    fields: {
      project: { key: config.project_key },
      summary: `[Shannon] ${finding.title} (${finding.severity})`,
      issuetype: { name: config.issue_type },
      description: buildAdfDescription(finding),
      labels: [...(config.labels || []), 'shannon', `severity-${finding.severity.toLowerCase()}`],
      priority: { name: priority },
    },
  };

  const baseUrl = config.base_url.replace(/\/$/, '');

  try {
    const response = await jiraFetch(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as {
      key?: string;
      id?: string;
      self?: string;
      errorMessages?: string[];
      errors?: Record<string, string>;
    };

    if (!response.ok) {
      const errorMsg = body.errorMessages?.join('; ') ||
        Object.entries(body.errors || {}).map(([k, v]) => `${k}: ${v}`).join('; ') ||
        'Unknown error';
      return { success: false, error: `HTTP ${response.status}: ${errorMsg}` };
    }

    return {
      success: true,
      ...(body.key && { issueKey: body.key }),
      ...(body.key && { issueUrl: `${baseUrl}/browse/${body.key}` }),
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
};

/**
 * Create Jira issues for all findings
 */
export const createJiraIssuesForFindings = async (
  config: JiraConfig,
  findings: Finding[]
): Promise<Map<string, JiraResult>> => {
  const results = new Map<string, JiraResult>();

  for (const finding of findings) {
    const result = await createJiraIssue(config, finding);
    results.set(finding.id, result);

    // Log progress
    if (result.success) {
      console.log(`  ✓ Created Jira issue ${result.issueKey} for ${finding.id}`);
    } else {
      console.warn(`  ✗ Failed to create Jira issue for ${finding.id}: ${result.error}`);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
};
