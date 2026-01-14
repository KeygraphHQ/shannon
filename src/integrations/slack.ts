// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Secure Slack Integration
 * Features: SSRF protection, retries, rate limiting, proper error handling
 */

import type { SlackConfig } from '../types/config.js';
import type { FindingsReport, Finding, Severity } from '../findings/types.js';
import { createSecureFetch, validateSlackWebhookUrl, validateSlackBotToken } from '../security/index.js';

// Default events to notify on
const DEFAULT_NOTIFY_EVENTS = ['run.completed'];

// Severity emoji mapping
const SEVERITY_EMOJI: Record<Severity, string> = {
  Critical: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
  Info: '🔵',
};

// Create secure fetch for Slack API
const slackFetch = createSecureFetch({
  timeoutMs: 10_000,
  maxRetries: 3,
  retryDelayMs: 500,
  validateUrl: false, // We validate specifically for Slack
  onRetry: (attempt, error) => {
    console.warn(`⚠️  Slack retry ${attempt}: ${error.message}`);
  },
});

export interface SlackResult {
  success: boolean;
  error?: string;
  channel?: string;
}

/**
 * Build summary text for completed run
 */
const buildSummaryText = (report: FindingsReport): string => {
  const counts = report.findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});

  const summaryLines = (['Critical', 'High', 'Medium', 'Low', 'Info'] as Severity[])
    .filter((sev) => (counts[sev] || 0) > 0)
    .map((sev) => `${SEVERITY_EMOJI[sev]} ${sev}: ${counts[sev] || 0}`);

  const target = report.target?.web_url || 'Unknown target';
  const date = report.assessment_date || new Date().toISOString().slice(0, 10);

  return [
    `*Shannon Security Scan Complete* 🔒`,
    `Target: ${target}`,
    `Date: ${date}`,
    ``,
    summaryLines.length ? summaryLines.join('\n') : '✅ No security findings',
  ].join('\n');
};

/**
 * Build finding notification text
 */
const buildFindingText = (finding: Finding): string => {
  const emoji = SEVERITY_EMOJI[finding.severity] || '⚪';
  return [
    `${emoji} *New Finding: ${finding.title}*`,
    `Severity: ${finding.severity}`,
    `Category: ${finding.category}`,
    finding.summary ? `Summary: ${finding.summary.slice(0, 200)}...` : '',
  ].filter(Boolean).join('\n');
};

/**
 * Post message via incoming webhook
 */
const postWebhook = async (webhookUrl: string, text: string): Promise<SlackResult> => {
  // Validate webhook URL
  const validation = await validateSlackWebhookUrl(webhookUrl);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Invalid webhook URL' };
  }

  try {
    const response = await slackFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${body}` };
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
};

/**
 * Post message via Bot API
 */
const postBotMessage = async (
  token: string,
  channel: string,
  text: string
): Promise<SlackResult> => {
  // Validate bot token
  const tokenValidation = validateSlackBotToken(token);
  if (!tokenValidation.valid) {
    return { success: false, error: tokenValidation.error || 'Invalid bot token' };
  }

  try {
    const response = await slackFetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const body = (await response.json()) as { ok?: boolean; error?: string; channel?: string };

    if (!body.ok) {
      return { success: false, error: body.error || 'Unknown Slack API error' };
    }

    return { success: true, ...(body.channel && { channel: body.channel }) };
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
};

/**
 * Send Slack notification
 */
export const notifySlack = async (
  config: SlackConfig,
  report: FindingsReport,
  event: string,
  finding?: Finding
): Promise<SlackResult> => {
  // Check if we should notify for this event
  const notifyOn = config.notify_on?.length ? config.notify_on : DEFAULT_NOTIFY_EVENTS;
  if (!notifyOn.includes(event)) {
    return { success: true }; // Skipped, not subscribed
  }

  // Validate config has at least one method
  if (!config.webhook_url && !config.bot_token) {
    return { success: false, error: 'No Slack webhook_url or bot_token configured' };
  }

  if (config.bot_token && !config.channel) {
    return { success: false, error: 'Slack bot_token requires channel to be configured' };
  }

  // Build message text
  let text: string;
  if (event === 'finding.created' && finding) {
    text = buildFindingText(finding);
  } else if (event === 'run.failed') {
    text = `⚠️ *Shannon Scan Failed*\nTarget: ${report.target?.web_url || 'Unknown'}`;
  } else {
    text = buildSummaryText(report);
  }

  // Send via both methods if configured
  const results: SlackResult[] = [];

  if (config.webhook_url) {
    const webhookResult = await postWebhook(config.webhook_url, text);
    results.push(webhookResult);
    if (!webhookResult.success) {
      console.warn(`⚠️  Slack webhook failed: ${webhookResult.error}`);
    }
  }

  if (config.bot_token && config.channel) {
    const botResult = await postBotMessage(config.bot_token, config.channel, text);
    results.push(botResult);
    if (!botResult.success) {
      console.warn(`⚠️  Slack bot message failed: ${botResult.error}`);
    }
  }

  // Return combined result
  const errors = results.filter((r) => !r.success).map((r) => r.error);
  if (errors.length === results.length) {
    return { success: false, error: errors.join('; ') };
  }

  return { success: true };
};
