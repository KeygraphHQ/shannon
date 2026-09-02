// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { isNormalizedRepositoryPath } from './capella/paths.js';

/**
 * The exact SARIF 2.1.0 profile Capella publishes. The reconciliation SAST
 * intake (`ai/reconciliation/sast/sarif-parser.ts`) re-validates the same shape
 * on read, so a field added or relaxed here without a matching parser change is
 * rejected at intake rather than reconciled.
 */

export const CAPELLA_SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';
export const CAPELLA_SARIF_DRIVER_NAME = 'Shannon Capella Agentic SAST';
export const CAPELLA_SARIF_DRIVER_VERSION = '1.0.0';
export const CAPELLA_SARIF_INFORMATION_URI = 'https://github.com/KeygraphHQ/shannon';

export type CapellaSarifSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type CapellaSarifLevel = 'error' | 'warning' | 'note';

export interface CapellaSarifPhysicalLocation {
  artifactLocation: { uri: string; uriBaseId?: '%SRCROOT%' };
  region: { startLine: number };
}

export interface CapellaSarifThreadFlowLocation {
  location: {
    physicalLocation: CapellaSarifPhysicalLocation;
    message: { text: string };
  };
  importance: 'essential' | 'important' | string;
}

export interface CapellaSarifResult {
  ruleId: `CWE-${number}`;
  level: CapellaSarifLevel;
  message: { text: string };
  locations: [{ physicalLocation: CapellaSarifPhysicalLocation }, ...unknown[]];
  codeFlows: Array<{ threadFlows: Array<{ locations: CapellaSarifThreadFlowLocation[] }> }>;
  properties: {
    severity: CapellaSarifSeverity;
    cwe: `CWE-${number}`;
    status: 'verified';
    description: string;
    findingSubType: 'AGENT_SAST';
  };
}

export interface CapellaSarifRule {
  id: `CWE-${number}`;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
  properties: { cwe: `CWE-${number}`; tags: string[] };
}

export interface CapellaSarif {
  $schema: string;
  version: '2.1.0';
  runs: [
    {
      tool: {
        driver: {
          name: string;
          version: string;
          informationUri: string;
          rules: CapellaSarifRule[];
        };
      };
      results: CapellaSarifResult[];
      properties: { repository: string; totalFindings: number };
    },
  ];
}

export interface SarifValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is { text: string } {
  return isRecord(value) && typeof value.text === 'string' && value.text.length > 0;
}

function validatePhysicalLocation(value: unknown, errors: string[], label: string, requireBase: boolean): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const artifact = value.artifactLocation;
  const region = value.region;
  if (!isRecord(artifact) || typeof artifact.uri !== 'string' || !isNormalizedRepositoryPath(artifact.uri)) {
    errors.push(`${label}.artifactLocation.uri must be a normalized repository-relative path`);
  }
  if (requireBase && (!isRecord(artifact) || artifact.uriBaseId !== '%SRCROOT%')) {
    errors.push(`${label}.artifactLocation.uriBaseId must be %SRCROOT%`);
  }
  if (!isRecord(region) || !Number.isSafeInteger(region.startLine) || Number(region.startLine) <= 0) {
    errors.push(`${label}.region.startLine must be a positive integer`);
  }
}

function validateResult(value: unknown, ruleIds: Set<string>, errors: string[], index: number): void {
  const label = `runs[0].results[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const ruleId = value.ruleId;
  if (typeof ruleId !== 'string' || !/^CWE-\d+$/.test(ruleId)) errors.push(`${label}.ruleId must be a bare CWE`);
  if (typeof ruleId === 'string' && !ruleIds.has(ruleId)) errors.push(`${label}.ruleId has no matching rule metadata`);
  if (!['error', 'warning', 'note'].includes(String(value.level))) errors.push(`${label}.level is invalid`);
  if (!isText(value.message)) errors.push(`${label}.message.text is required`);
  if (!Array.isArray(value.locations) || value.locations.length === 0 || !isRecord(value.locations[0])) {
    errors.push(`${label}.locations[0] is required`);
  } else {
    validatePhysicalLocation(
      value.locations[0].physicalLocation,
      errors,
      `${label}.locations[0].physicalLocation`,
      true,
    );
  }
  const properties = value.properties;
  if (!isRecord(properties)) {
    errors.push(`${label}.properties is required`);
  } else {
    if (!['Critical', 'High', 'Medium', 'Low', 'Info'].includes(String(properties.severity))) {
      errors.push(`${label}.properties.severity is invalid`);
    }
    if (properties.cwe !== ruleId) errors.push(`${label}.properties.cwe must equal ruleId`);
    if (properties.status !== 'verified') errors.push(`${label}.properties.status must be verified`);
    if (properties.findingSubType !== 'AGENT_SAST') errors.push(`${label}.properties.findingSubType is invalid`);
    if (typeof properties.description !== 'string') errors.push(`${label}.properties.description must be a string`);
    // The intake parser rejects results carrying these properties; refusing them
    // at publish time surfaces the violation to the producer instead of dropping
    // findings at intake.
    for (const forbidden of ['invariantDescription', 'owasp_category', 'proofOfConcept']) {
      if (forbidden in properties) errors.push(`${label}.properties.${forbidden} is forbidden`);
    }
  }
  if (!Array.isArray(value.codeFlows)) {
    errors.push(`${label}.codeFlows must be an array`);
  } else {
    value.codeFlows.forEach((flow, flowIndex) => {
      if (!isRecord(flow) || !Array.isArray(flow.threadFlows)) {
        errors.push(`${label}.codeFlows[${flowIndex}].threadFlows must be an array`);
        return;
      }
      flow.threadFlows.forEach((thread, threadIndex) => {
        if (!isRecord(thread) || !Array.isArray(thread.locations)) {
          errors.push(`${label}.codeFlows[${flowIndex}].threadFlows[${threadIndex}].locations must be an array`);
          return;
        }
        thread.locations.forEach((location, locationIndex) => {
          if (!isRecord(location) || !isRecord(location.location)) {
            errors.push(`${label}.codeFlows location must be an object`);
            return;
          }
          validatePhysicalLocation(
            location.location.physicalLocation,
            errors,
            `${label}.codeFlows[${flowIndex}].threadFlows[${threadIndex}].locations[${locationIndex}]`,
            false,
          );
          if (!isText(location.location.message)) errors.push(`${label}.codeFlows location message is required`);
          if (typeof location.importance !== 'string')
            errors.push(`${label}.codeFlows location importance is required`);
        });
      });
    });
  }
}

/**
 * Validate a document against the exact producer/consumer profile above. The
 * exporter refuses to publish a document this rejects, which is what lets the
 * reconciliation intake treat a violation as corruption instead of noise.
 */
export function validateCapellaSarif(value: unknown): SarifValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['SARIF document must be an object'] };
  if (value.$schema !== CAPELLA_SARIF_SCHEMA) errors.push('$schema is invalid');
  if (value.version !== '2.1.0') errors.push('version must be 2.1.0');
  if (!Array.isArray(value.runs) || value.runs.length !== 1 || !isRecord(value.runs[0])) {
    errors.push('runs must contain exactly one run');
    return { valid: false, errors };
  }
  const run = value.runs[0];
  const driver = isRecord(run.tool) && isRecord(run.tool.driver) ? run.tool.driver : undefined;
  if (!driver) {
    errors.push('runs[0].tool.driver is required');
    return { valid: false, errors };
  }
  if (driver.name !== CAPELLA_SARIF_DRIVER_NAME) errors.push('driver.name is invalid');
  if (driver.version !== CAPELLA_SARIF_DRIVER_VERSION) errors.push('driver.version is invalid');
  if (driver.informationUri !== CAPELLA_SARIF_INFORMATION_URI) errors.push('driver.informationUri is invalid');
  const ruleIds = new Set<string>();
  if (!Array.isArray(driver.rules)) {
    errors.push('driver.rules must be an array');
  } else {
    driver.rules.forEach((rule, index) => {
      if (!isRecord(rule) || typeof rule.id !== 'string' || !/^CWE-\d+$/.test(rule.id)) {
        errors.push(`driver.rules[${index}].id must be a bare CWE`);
        return;
      }
      if (ruleIds.has(rule.id)) errors.push(`driver.rules[${index}].id is duplicated`);
      ruleIds.add(rule.id);
      if (typeof rule.name !== 'string' || rule.name.length === 0)
        errors.push(`driver.rules[${index}].name is required`);
      if (!isText(rule.shortDescription) || !isText(rule.fullDescription))
        errors.push(`driver.rules[${index}] descriptions are required`);
      if (typeof rule.helpUri !== 'string' || rule.helpUri.length === 0) {
        errors.push(`driver.rules[${index}].helpUri is required`);
      }
      if (
        !isRecord(rule.properties) ||
        rule.properties.cwe !== rule.id ||
        !Array.isArray(rule.properties.tags) ||
        !rule.properties.tags.every((tag) => typeof tag === 'string')
      ) {
        errors.push(`driver.rules[${index}] properties are invalid`);
      }
    });
  }
  if (!Array.isArray(run.results)) {
    errors.push('runs[0].results must be an array');
  } else {
    run.results.forEach((result, index) => {
      validateResult(result, ruleIds, errors, index);
    });
  }
  if (!isRecord(run.properties)) {
    errors.push('runs[0].properties is required');
  } else {
    if (typeof run.properties.repository !== 'string') errors.push('runs[0].properties.repository must be a string');
    if (!Number.isSafeInteger(run.properties.totalFindings)) {
      errors.push('runs[0].properties.totalFindings must be an integer');
    } else if (Array.isArray(run.results) && run.properties.totalFindings !== run.results.length) {
      errors.push('runs[0].properties.totalFindings does not match results.length');
    }
  }
  return { valid: errors.length === 0, errors };
}
