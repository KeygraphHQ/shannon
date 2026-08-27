// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Revalidate stage artifacts and materialize every observation into one fixed task. */

import { Check } from 'typebox/value';
import type { ReconciliationClass } from '../../types/reconciliation.js';
import { classEntrySchema, QUEUE_ENTRY_FIELD_NAMES } from '../queue-schemas.js';
import { ArtifactIntegrityError, artifactInputsMatch, readArtifact, writeArtifact } from './artifact-store.js';
import type { ArtifactInputDigest, ArtifactRef, ReconciliationObservation } from './contracts.js';
import { buildFixedTasks } from './materialize-core.js';
import { combineObservations } from './observations.js';
import { isProducerId } from './refs.js';
import { type FixedTasksBody, type FormResult, type MaterializeResult, SINGLETON_FALLBACK } from './stage-contracts.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSastLocation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.file === 'string' &&
    value.file.length > 0 &&
    Number.isSafeInteger(value.line) &&
    (value.line as number) > 0 &&
    Number.isSafeInteger(value.column) &&
    (value.column as number) > 0 &&
    typeof value.rule_id === 'string' &&
    value.rule_id.length > 0
  );
}

// Defense in depth: an earlier stage already validated this observation's shape, but materialization
// is the last stop before publication, so it revalidates independently rather than trusting an
// artifact read back off disk. Re-derives the evidence subset and schema-checks it, then confirms no
// field outside the declared class/source contract survived (including any internal key a bug in an
// earlier stage might have let through).
function validateEvidenceShape(observation: ReconciliationObservation, vulnerabilityClass: ReconciliationClass): void {
  const record = observation as unknown as Record<string, unknown>;
  const evidence: Record<string, unknown> = { ID: observation.producer_id };
  for (const key of QUEUE_ENTRY_FIELD_NAMES[vulnerabilityClass]) {
    if (key !== 'ID' && key in record) evidence[key] = record[key];
  }
  if (!Check(classEntrySchema(vulnerabilityClass), evidence)) {
    throw new ArtifactIntegrityError('Observation evidence does not match its declared class schema');
  }

  const allowed = new Set<string>([
    ...QUEUE_ENTRY_FIELD_NAMES[vulnerabilityClass].filter((key) => key !== 'ID'),
    'producer_id',
    'scan_source',
    'primary_preference',
    ...(observation.scan_source === 'sast' ? ['priority', 'sast_source_location'] : []),
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new ArtifactIntegrityError('Observation contains fields outside its class/source contract');
  }
}

/** Reconfirm producer identity and evidence shape match the observation's declared source and class. */
function validateObservation(observation: ReconciliationObservation, vulnerabilityClass: ReconciliationClass): void {
  validateEvidenceShape(observation, vulnerabilityClass);
  if (observation.scan_source === 'vulnerability_analysis') {
    if (
      observation.primary_preference !== 'default' ||
      !isProducerId(observation.producer_id, vulnerabilityClass, 'VULN')
    ) {
      throw new ArtifactIntegrityError('Vulnerability-analysis observation has an invalid class/source identity');
    }
    return;
  }

  if (observation.scan_source !== 'sast') {
    throw new ArtifactIntegrityError('Observation has an unknown producer source');
  }
  if (
    observation.primary_preference !== 'preferred' ||
    !isProducerId(observation.producer_id, vulnerabilityClass, 'SAST') ||
    !['P1', 'P2', 'P3'].includes(observation.priority) ||
    !validateSastLocation(observation.sast_source_location)
  ) {
    throw new ArtifactIntegrityError('SAST observation has an invalid class/source identity or annotation');
  }
}

function partitionMembers(
  observations: readonly ReconciliationObservation[],
  groups: readonly unknown[],
): ReconciliationObservation[][] {
  const byProducerId = new Map(observations.map((observation) => [observation.producer_id, observation]));
  const assigned = new Set<string>();
  const memberGroups: ReconciliationObservation[][] = [];

  for (const rawGroup of groups) {
    if (
      !isRecord(rawGroup) ||
      Object.keys(rawGroup).some((key) => key !== 'producer_ids' && key !== 'reasoning') ||
      !Array.isArray(rawGroup.producer_ids) ||
      !rawGroup.producer_ids.every((producerId) => typeof producerId === 'string') ||
      rawGroup.producer_ids.length < 2 ||
      typeof rawGroup.reasoning !== 'string' ||
      rawGroup.reasoning.length === 0
    ) {
      throw new ArtifactIntegrityError('Accepted task formation contains a malformed group');
    }
    const group = rawGroup as { producer_ids: string[]; reasoning: string };
    const members: ReconciliationObservation[] = [];
    const groupIds = new Set<string>();
    for (const producerId of group.producer_ids) {
      const observation = byProducerId.get(producerId);
      if (observation === undefined || groupIds.has(producerId) || assigned.has(producerId)) {
        throw new ArtifactIntegrityError('Accepted task formation has unknown, duplicate, or reused membership');
      }
      groupIds.add(producerId);
      members.push(observation);
    }
    for (const producerId of groupIds) assigned.add(producerId);
    memberGroups.push(members);
  }

  // Every observation the model did not place into a group becomes its own singleton task. This is
  // also exactly the whole-set result when task formation is skipped, so the fallback path and the
  // model path converge on the same shape: one task per unmerged observation.
  for (const observation of observations) {
    if (!assigned.has(observation.producer_id)) memberGroups.push([observation]);
  }
  return memberGroups;
}

function assertRefClass(ref: ArtifactRef, vulnerabilityClass: ReconciliationClass): void {
  if (ref.vulnerabilityClass !== vulnerabilityClass) {
    throw new ArtifactIntegrityError('Artifact reference crosses the declared class boundary');
  }
}

export interface MaterializeClassExploitTasksArgs {
  sessionId: string;
  workspacesDir?: string;
  vulnerabilityClass: ReconciliationClass;
  producerRef: ArtifactRef<'producer-observations'>;
  supplementalRef: ArtifactRef<'supplemental-observations'>;
  form: FormResult;
}

/**
 * Materialize one class and publish its content-addressed `03-fixed-tasks` artifact.
 *
 * Combines the producer and supplemental observations, applies the accepted formation groups (or
 * treats every observation as its own singleton task when formation fell back), collapses each
 * group into one task via `buildFixedTasks`, and confirms the resulting observation-to-task map
 * covers every observation exactly once before returning.
 */
export async function materializeClassExploitTasks(args: MaterializeClassExploitTasksArgs): Promise<MaterializeResult> {
  assertRefClass(args.producerRef, args.vulnerabilityClass);
  assertRefClass(args.supplementalRef, args.vulnerabilityClass);
  if (args.form !== SINGLETON_FALLBACK) assertRefClass(args.form.ref, args.vulnerabilityClass);

  const producer = await readArtifact(args.producerRef, args.sessionId, args.workspacesDir);
  const supplemental = await readArtifact(args.supplementalRef, args.sessionId, args.workspacesDir);
  if (!Array.isArray(producer.observations) || !Array.isArray(supplemental.observations)) {
    throw new ArtifactIntegrityError('Observation artifact body is truncated or malformed');
  }
  const observations = combineObservations(producer.observations, supplemental.observations);
  for (const observation of observations) validateObservation(observation, args.vulnerabilityClass);

  const observationInputs: ArtifactInputDigest[] = [
    { artifactKind: 'producer-observations', sha256: args.producerRef.sha256 },
    { artifactKind: 'supplemental-observations', sha256: args.supplementalRef.sha256 },
  ];
  // With the singleton fallback there are no groups, so every observation materializes alone. With a
  // real formation artifact, its lineage must name these exact observation digests, or it grouped a
  // different observation set than the one being materialized here.
  let groups: readonly unknown[] = [];
  if (args.form !== SINGLETON_FALLBACK) {
    if (!artifactInputsMatch(args.form.ref.inputs, observationInputs)) {
      throw new ArtifactIntegrityError('Task-formation lineage does not match the supplied observations');
    }
    const formation = await readArtifact(args.form.ref, args.sessionId, args.workspacesDir);
    if (!Array.isArray(formation.groups)) {
      throw new ArtifactIntegrityError('Accepted task formation has no groups array');
    }
    groups = formation.groups;
  }

  const memberGroups = partitionMembers(observations, groups);
  const fixed = buildFixedTasks(memberGroups, args.vulnerabilityClass);
  if (Object.keys(fixed.observationToTask).length !== observations.length) {
    throw new ArtifactIntegrityError('Observation-to-task map is incomplete');
  }

  const inputs: ArtifactInputDigest[] = [...observationInputs];
  if (args.form !== SINGLETON_FALLBACK) {
    inputs.push({ artifactKind: 'task-formation', sha256: args.form.ref.sha256 });
  }
  const body: FixedTasksBody = {
    tasks: fixed.tasks,
    observation_to_task: fixed.observationToTask,
  };
  const ref = await writeArtifact({
    sessionId: args.sessionId,
    ...(args.workspacesDir !== undefined ? { workspacesDir: args.workspacesDir } : {}),
    artifactKind: 'fixed-tasks',
    vulnerabilityClass: args.vulnerabilityClass,
    body,
    inputs,
    counts: { tasks: fixed.tasks.length, merged_from_total: fixed.mergedFromTotal },
  });
  return { ref };
}
