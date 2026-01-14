// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Production-grade URL validation and SSRF protection
 * Inspired by CAI framework security best practices
 */

import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

// Blocked URL schemes that could be exploited
const BLOCKED_SCHEMES = new Set([
  'file:',
  'javascript:',
  'data:',
  'vbscript:',
  'about:',
  'blob:',
  'chrome:',
  'chrome-extension:',
  'moz-extension:',
  'ms-browser-extension:',
  'resource:',
  'view-source:',
  'jar:',
  'netdoc:',
  'wyciwyg:',
]);

// Private/internal IP ranges (SSRF protection)
const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./, // Private Class C
  /^169\.254\./, // Link-local
  /^0\./, // Current network
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^198\.1[89]\./, // Benchmarking
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 unique local
  /^fe80:/, // IPv6 link-local
  /^fd/, // IPv6 private
];

// AWS/cloud metadata endpoints (SSRF targets)
const CLOUD_METADATA_HOSTS = new Set([
  '169.254.169.254', // AWS/GCP/Azure metadata
  'metadata.google.internal',
  'metadata.gcp.internal',
  '169.254.170.2', // ECS task metadata
  'fd00:ec2::254', // AWS IPv6 metadata
  '100.100.100.200', // Alibaba Cloud metadata
]);

// Known dangerous hostnames
const DANGEROUS_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
]);

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  normalizedUrl?: string;
}

export interface UrlValidationOptions {
  allowPrivateIPs?: boolean;
  allowLocalhost?: boolean;
  requireHttps?: boolean;
  allowedHosts?: Set<string>;
  blockedHosts?: Set<string>;
  maxRedirects?: number;
}

const DEFAULT_OPTIONS: UrlValidationOptions = {
  allowPrivateIPs: false,
  allowLocalhost: false,
  requireHttps: true,
  maxRedirects: 5,
};

/**
 * Check if an IP address is private/internal
 */
const isPrivateIP = (ip: string): boolean => {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
};

/**
 * Check if hostname is a cloud metadata endpoint
 */
const isCloudMetadataHost = (hostname: string): boolean => {
  return CLOUD_METADATA_HOSTS.has(hostname.toLowerCase());
};

/**
 * Check if hostname is dangerous/internal
 */
const isDangerousHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  return DANGEROUS_HOSTNAMES.has(lower) || lower.endsWith('.local') || lower.endsWith('.internal');
};

/**
 * Resolve hostname to IP and check for SSRF
 */
export const resolveAndValidateHost = async (
  hostname: string,
  options: UrlValidationOptions = {}
): Promise<{ valid: boolean; error?: string; ip?: string }> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check for cloud metadata
  if (isCloudMetadataHost(hostname)) {
    return { valid: false, error: `Blocked cloud metadata endpoint: ${hostname}` };
  }

  // Check for dangerous hostnames
  if (!opts.allowLocalhost && isDangerousHostname(hostname)) {
    return { valid: false, error: `Blocked internal hostname: ${hostname}` };
  }

  // Check if already an IP
  if (net.isIP(hostname)) {
    if (!opts.allowPrivateIPs && isPrivateIP(hostname)) {
      return { valid: false, error: `Blocked private IP address: ${hostname}` };
    }
    return { valid: true, ip: hostname };
  }

  // Resolve DNS
  try {
    const addresses = await dns.resolve4(hostname);
    for (const ip of addresses) {
      if (!opts.allowPrivateIPs && isPrivateIP(ip)) {
        return { valid: false, error: `Hostname ${hostname} resolves to private IP: ${ip}` };
      }
    }
    const resolvedIp = addresses[0];
    return resolvedIp ? { valid: true, ip: resolvedIp } : { valid: true };
  } catch {
    // DNS resolution failed - might be okay for some hosts
    return { valid: true };
  }
};

/**
 * Validate a URL for security issues
 */
export const validateUrl = async (
  urlString: string,
  options: UrlValidationOptions = {}
): Promise<UrlValidationResult> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // Basic parsing
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format', warnings };
  }

  // Check scheme
  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return { valid: false, error: `Blocked URL scheme: ${parsed.protocol}`, warnings };
  }

  // Check for HTTPS requirement
  if (opts.requireHttps && parsed.protocol !== 'https:') {
    if (opts.allowLocalhost && isDangerousHostname(parsed.hostname)) {
      warnings.push('Using HTTP for localhost - ensure this is intentional');
    } else {
      return { valid: false, error: 'HTTPS is required for external URLs', warnings };
    }
  }

  // Check allowed/blocked hosts
  if (opts.allowedHosts && opts.allowedHosts.size > 0 && !opts.allowedHosts.has(parsed.hostname)) {
    return { valid: false, error: `Hostname not in allowlist: ${parsed.hostname}`, warnings };
  }
  if (opts.blockedHosts?.has(parsed.hostname)) {
    return { valid: false, error: `Hostname is blocked: ${parsed.hostname}`, warnings };
  }

  // Resolve and validate hostname
  const hostValidation = await resolveAndValidateHost(parsed.hostname, opts);
  if (!hostValidation.valid && hostValidation.error) {
    return { valid: false, error: hostValidation.error, warnings };
  }

  // Check for username/password in URL (info leak)
  if (parsed.username || parsed.password) {
    warnings.push('URL contains embedded credentials - this is a security risk');
  }

  // Check for weird ports
  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
  if (port < 1 || port > 65535) {
    return { valid: false, error: `Invalid port number: ${port}`, warnings };
  }

  // Warn about non-standard ports
  if (parsed.port && !['80', '443', '8080', '8443'].includes(parsed.port)) {
    warnings.push(`Non-standard port ${parsed.port} - verify this is intentional`);
  }

  return {
    valid: true,
    warnings,
    normalizedUrl: parsed.toString(),
  };
};

/**
 * Validate webhook URL with strict SSRF protection
 */
export const validateWebhookUrl = async (
  urlString: string,
  allowedDomains?: string[]
): Promise<UrlValidationResult> => {
  const options: UrlValidationOptions = {
    allowPrivateIPs: false,
    allowLocalhost: false,
    requireHttps: true,
  };

  if (allowedDomains && allowedDomains.length > 0) {
    options.allowedHosts = new Set(allowedDomains);
  }

  return validateUrl(urlString, options);
};

/**
 * Check if hostname is a valid Slack domain
 */
const isValidSlackDomain = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  // Must be exactly 'slack.com' or end with '.slack.com'
  return lower === 'slack.com' || lower === 'hooks.slack.com' ||
         lower.endsWith('.slack.com');
};

/**
 * Validate Slack webhook URL specifically
 */
export const validateSlackWebhookUrl = async (urlString: string): Promise<UrlValidationResult> => {
  const result = await validateUrl(urlString, {
    requireHttps: true,
    allowPrivateIPs: false,
    allowLocalhost: false,
  });

  if (!result.valid) return result;

  try {
    const parsed = new URL(urlString);
    if (!isValidSlackDomain(parsed.hostname)) {
      return {
        valid: false,
        error: 'Slack webhook URL must be from hooks.slack.com domain',
        warnings: result.warnings,
      };
    }
  } catch {
    return { valid: false, error: 'Invalid URL format', warnings: [] };
  }

  return result;
};

/**
 * Validate Jira base URL
 */
export const validateJiraUrl = async (urlString: string): Promise<UrlValidationResult> => {
  const result = await validateUrl(urlString, {
    requireHttps: true,
    allowPrivateIPs: false,
    allowLocalhost: false,
  });

  if (!result.valid) return result;

  try {
    const parsed = new URL(urlString);
    if (!parsed.hostname.endsWith('.atlassian.net') && !parsed.hostname.endsWith('.atlassian.com')) {
      result.warnings.push('Jira URL is not from atlassian.net/atlassian.com - ensure this is your self-hosted instance');
    }
  } catch {
    return { valid: false, error: 'Invalid URL format', warnings: [] };
  }

  return result;
};
