// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agents that drive a live browser via the playwright-cli skill. These get the
 * skill registered through pi's `skillsOverride`.
 *
 * `validate-authentication` is not an AgentName in the main pipeline graph but
 * runs the same executor, so it is included by string.
 */
export const BROWSER_AGENTS: ReadonlySet<string> = new Set([
  'recon',
  'injection-vuln',
  'xss-vuln',
  'auth-vuln',
  'ssrf-vuln',
  'authz-vuln',
  'injection-exploit',
  'xss-exploit',
  'auth-exploit',
  'ssrf-exploit',
  'authz-exploit',
  'validate-authentication',
  'verify-exploit',
]);

/** Whether the given agent uses the browser (and therefore needs the playwright-cli skill under pi). */
export function isBrowserAgent(agentName: string | null | undefined): boolean {
  return agentName != null && BROWSER_AGENTS.has(agentName);
}
