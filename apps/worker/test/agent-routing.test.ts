// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAgentRunRouting } from '../src/services/agent-execution.js';
import { resolveAuthenticationRunRouting } from '../src/services/validate-authentication.js';
import { AGENTS } from '../src/session-manager.js';

test('production agents use the phase-specific GPT-5.6 routing matrix', () => {
  const expected = {
    'pre-recon': ['large', 'medium', 'medium', 'medium'],
    recon: ['medium', 'medium', 'medium', 'medium'],
    'injection-vuln': ['medium', 'medium', 'medium', 'medium'],
    'xss-vuln': ['medium', 'medium', 'medium', 'medium'],
    'auth-vuln': ['medium', 'medium', 'medium', 'medium'],
    'ssrf-vuln': ['medium', 'medium', 'medium', 'medium'],
    'authz-vuln': ['large', 'medium', 'medium', 'medium'],
    'injection-exploit': ['medium', 'medium', 'small', 'low'],
    'xss-exploit': ['medium', 'medium', 'small', 'low'],
    'auth-exploit': ['medium', 'medium', 'small', 'low'],
    'ssrf-exploit': ['medium', 'medium', 'small', 'low'],
    'authz-exploit': ['large', 'medium', 'small', 'low'],
    report: ['medium', 'medium', 'medium', 'medium'],
  } as const;

  for (const [agentName, route] of Object.entries(expected)) {
    const agent = AGENTS[agentName as keyof typeof AGENTS];
    assert.deepEqual(
      [agent.modelTier, agent.reasoningEffort, agent.childModelTier, agent.childReasoningEffort],
      route,
      `${agentName} should preserve its reviewed parent and task-child route`,
    );

    const resolved = resolveAgentRunRouting(agentName as keyof typeof AGENTS, false);
    assert.deepEqual(
      [
        resolved.modelTier,
        resolved.routing.reasoningEffort,
        resolved.routing.childModelTier,
        resolved.routing.childReasoningEffort,
      ],
      route,
      `${agentName} should execute through its registry route`,
    );
  }
});

test('pipeline fixtures force both coordinator and task-child sessions to Luna/off', () => {
  for (const agentName of Object.keys(AGENTS) as Array<keyof typeof AGENTS>) {
    assert.deepEqual(resolveAgentRunRouting(agentName, true), {
      modelTier: 'small',
      routing: {
        reasoningEffort: 'off',
        childModelTier: 'small',
        childReasoningEffort: 'off',
      },
    });
  }

  assert.deepEqual(resolveAuthenticationRunRouting(true), {
    modelTier: 'small',
    routing: {
      reasoningEffort: 'off',
      childModelTier: 'small',
      childReasoningEffort: 'off',
    },
  });
});

test('live authentication validation uses Terra/low for coordinator and task-child sessions', () => {
  assert.deepEqual(resolveAuthenticationRunRouting(false), {
    modelTier: 'medium',
    routing: {
      reasoningEffort: 'low',
      childModelTier: 'medium',
      childReasoningEffort: 'low',
    },
  });
});
