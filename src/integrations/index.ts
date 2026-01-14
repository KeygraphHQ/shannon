// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Integrations Module - Orchestrates all third-party integrations
 * Handles Slack, Jira, and webhook notifications with proper error handling
 */

import type { IntegrationsConfig, WebhookConfig } from '../types/config.js';
import type { FindingsReport, Finding } from '../findings/types.js';
import { notifySlack } from './slack.js';
import { createJiraIssue, createJiraIssuesForFindings } from './jira.js';
import { sendWebhookEvent, sendWebhookEventToAll, type WebhookResult } from './webhooks.js';

export interface IntegrationArtifacts {
  jiraIssueKeys: string[];
  slackSuccess: boolean;
  webhookResults: Map<string, WebhookResult>;
  errors: string[];
}

/**
 * Collect all webhooks from config sources
 */
const collectWebhooks = (
  integrations?: IntegrationsConfig,
  apiWebhooks?: WebhookConfig[]
): WebhookConfig[] => {
  return [...(integrations?.webhooks || []), ...(apiWebhooks || [])];
};

/**
 * Run all integrations for a completed scan
 */
export const runIntegrations = async (
  integrations: IntegrationsConfig | undefined,
  report: FindingsReport,
  apiWebhooks?: WebhookConfig[]
): Promise<IntegrationArtifacts> => {
  const artifacts: IntegrationArtifacts = {
    jiraIssueKeys: [],
    slackSuccess: false,
    webhookResults: new Map(),
    errors: [],
  };

  // Collect all webhooks
  const webhookTargets = collectWebhooks(integrations, apiWebhooks);

  // Build run.completed event data
  const runCompletedData = {
    target: report.target,
    assessment_date: report.assessment_date,
    findings_count: report.findings.length,
    findings_by_severity: report.findings.reduce(
      (acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }),
      {} as Record<string, number>
    ),
  };

  // Send webhooks for run.completed
  console.log('📤 Sending integration notifications...');

  if (webhookTargets.length > 0) {
    const webhookResults = await sendWebhookEventToAll(
      webhookTargets,
      'run.completed',
      runCompletedData
    );
    for (const [url, result] of webhookResults) {
      artifacts.webhookResults.set(url, result);
      if (!result.success) {
        artifacts.errors.push(`Webhook ${url}: ${result.error}`);
      }
    }
  }

  // Notify Slack
  if (integrations?.slack) {
    try {
      const slackResult = await notifySlack(integrations.slack, report, 'run.completed');
      artifacts.slackSuccess = slackResult.success;
      if (!slackResult.success && slackResult.error) {
        artifacts.errors.push(`Slack: ${slackResult.error}`);
      }
    } catch (error) {
      const err = error as Error;
      artifacts.errors.push(`Slack: ${err.message}`);
    }
  }

  // Create Jira issues for findings
  if (integrations?.jira && report.findings.length > 0) {
    console.log('🎫 Creating Jira issues...');
    try {
      const jiraResults = await createJiraIssuesForFindings(
        integrations.jira,
        report.findings
      );
      for (const [findingId, result] of jiraResults) {
        if (result.success && result.issueKey) {
          artifacts.jiraIssueKeys.push(result.issueKey);
        } else if (!result.success) {
          artifacts.errors.push(`Jira issue for ${findingId}: ${result.error}`);
        }
      }
    } catch (error) {
      const err = error as Error;
      artifacts.errors.push(`Jira: ${err.message}`);
    }
  }

  // Send individual finding notifications
  for (const finding of report.findings) {
    // Webhook notifications for each finding
    if (webhookTargets.length > 0) {
      await sendWebhookEventToAll(webhookTargets, 'finding.created', {
        ...finding,
        target: report.target,
      });
    }

    // Slack notifications for each finding (if subscribed)
    if (integrations?.slack) {
      try {
        await notifySlack(integrations.slack, report, 'finding.created', finding);
      } catch (error) {
        // Don't fail the whole run for individual notifications
        const err = error as Error;
        console.warn(`⚠️  Slack finding notification failed: ${err.message}`);
      }
    }
  }

  // Log summary
  const successCount = artifacts.jiraIssueKeys.length;
  const errorCount = artifacts.errors.length;

  if (successCount > 0) {
    console.log(`  ✓ Created ${successCount} Jira issues`);
  }
  if (artifacts.slackSuccess) {
    console.log(`  ✓ Slack notifications sent`);
  }
  if (artifacts.webhookResults.size > 0) {
    const webhookSuccessCount = [...artifacts.webhookResults.values()].filter((r) => r.success).length;
    console.log(`  ✓ Webhooks: ${webhookSuccessCount}/${artifacts.webhookResults.size} successful`);
  }
  if (errorCount > 0) {
    console.warn(`  ⚠️  ${errorCount} integration errors occurred`);
  }

  return artifacts;
};

// Re-export individual modules
export { notifySlack } from './slack.js';
export { createJiraIssue, createJiraIssuesForFindings } from './jira.js';
export { sendWebhookEvent, sendWebhookEventToAll, verifyWebhookSignature, type WebhookResult } from './webhooks.js';
