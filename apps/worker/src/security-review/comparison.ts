// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  ChangeState,
  RepositoryChange,
  RepositoryComparison,
  RepositoryPolicy,
  RepositorySnapshot,
  SnapshotFile,
  SnapshotObservation,
} from './repository-types.js';
import { validateSnapshotBefore } from './snapshot.js';
import { RULES } from './types.js';

const ORDER: readonly ChangeState[] = ['new', 'unchanged', 'removed', 'unknown'];
const lexical = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function policyKey(policy: RepositoryPolicy): string {
  return JSON.stringify({
    conventionalNames: [...policy.conventionalNames].sort(),
    excludedDirectories: [...policy.excludedDirectories].sort(),
    includes: policy.includes.map((entry) => JSON.stringify([entry.path, entry.format])).sort(),
    excludes: [...policy.excludes].sort(),
  });
}

function assessed(file: SnapshotFile | undefined, ruleId: string): boolean {
  return file?.result.scope.rules.some((rule) => rule.ruleId === ruleId && rule.state === 'assessed') ?? false;
}

function observationKey(observation: SnapshotObservation | null): string {
  return observation === null
    ? ''
    : JSON.stringify([
        observation.issue.evidence.file,
        observation.issue.ruleId,
        observation.identity,
        observation.issue.evidence.pointer,
      ]);
}

/** Compare only bounded, validated local declarations; hashes do not authenticate producers. */
export function compareSnapshots(baseline: unknown, candidate: unknown): RepositoryComparison {
  const deadline = Date.now() + 30_000;
  let before: RepositorySnapshot;
  let after: RepositorySnapshot;
  const failure = (code: string): RepositoryComparison => ({
    schemaVersion: 1,
    kind: 'offline-repository-comparison',
    status: 'failed',
    baselineId: null,
    candidateId: null,
    compatible: false,
    counts: { new: 0, unchanged: 0, removed: 0, unknown: 0 },
    changes: [],
    diagnostics: [
      { code, path: '', message: 'The snapshots could not be validated and compared within the bounded contract.' },
    ],
  });
  try {
    before = validateSnapshotBefore(baseline, deadline);
    after = validateSnapshotBefore(candidate, deadline);
  } catch {
    return failure('comparison/invalid-snapshot');
  }

  const changes: RepositoryChange[] = [];
  const diagnostics: RepositoryComparison['diagnostics'][number][] = [];
  const checkTime = (): void => {
    if (Date.now() >= deadline) throw new Error('Comparison processing limit.');
  };
  const add = (
    state: ChangeState,
    reason: string,
    old: SnapshotObservation | null,
    current: SnapshotObservation | null,
  ): void => {
    checkTime();
    changes.push({ state, reason, before: old, after: current });
  };
  const unknownSide = (
    observations: readonly SnapshotObservation[],
    side: 'before' | 'after',
    reason: string,
  ): void => {
    for (const observation of observations)
      add('unknown', reason, side === 'before' ? observation : null, side === 'after' ? observation : null);
  };

  try {
    const compatible =
      before.reviewer.name === after.reviewer.name &&
      before.reviewer.semanticsVersion === after.reviewer.semanticsVersion &&
      before.reviewer.digest === after.reviewer.digest &&
      policyKey(before.policy) === policyKey(after.policy);
    if (!compatible) {
      for (const file of before.files)
        unknownSide(file.observations, 'before', 'Snapshot reviewer semantics or selection policies differ.');
      for (const file of after.files)
        unknownSide(file.observations, 'after', 'Snapshot reviewer semantics or selection policies differ.');
      diagnostics.push({
        code: 'comparison/incompatible-snapshots',
        path: '',
        message: 'Reviewer semantics and selection policies must agree before changes can be established.',
      });
    } else {
      if (before.status !== 'completed' || after.status !== 'completed') {
        diagnostics.push({
          code: 'comparison/incomplete-input',
          path: '',
          message: 'At least one snapshot has incomplete coverage; supported file and rule comparisons are retained.',
        });
      }
      const oldFiles = new Map(before.files.map((file) => [file.path, file]));
      const newFiles = new Map(after.files.map((file) => [file.path, file]));
      const removedFiles = before.files.filter((file) => !newFiles.has(file.path));
      const addedFiles = after.files.filter((file) => !oldFiles.has(file.path));
      const moved = new Set<string>();
      for (const old of removedFiles)
        for (const current of addedFiles) {
          checkTime();
          if (
            old.sha256 !== null &&
            old.sha256 === current.sha256 &&
            old.bytes === current.bytes &&
            old.format === current.format
          ) {
            moved.add(old.path);
            moved.add(current.path);
          }
        }
      const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
      for (const path of paths) {
        checkTime();
        const old = oldFiles.get(path);
        const current = newFiles.get(path);
        if (moved.has(path)) {
          if (old)
            unknownSide(
              old.observations,
              'before',
              'An identical-content file may have moved; remediation is not established.',
            );
          if (current)
            unknownSide(
              current.observations,
              'after',
              'An identical-content file may have moved; introduction is not established.',
            );
          continue;
        }
        if (!current) {
          if (old)
            unknownSide(
              old.observations,
              'before',
              'The candidate file is absent; removal of the declaration was not assessed.',
            );
          continue;
        }
        if (!old) {
          for (const observation of current.observations) {
            const stable =
              observation.identity !== null &&
              current.observations.filter(
                (entry) => entry.issue.ruleId === observation.issue.ruleId && entry.identity === observation.identity,
              ).length === 1;
            const knownAbsence =
              before.discovery.state === 'complete' &&
              before.status !== 'failed' &&
              !before.discovery.skipped.some(
                (entry) => entry.path === path || (entry.path !== '' && path.startsWith(`${entry.path}/`)),
              );
            add(
              stable && knownAbsence ? 'new' : 'unknown',
              stable && knownAbsence
                ? 'A complete compatible baseline inventory proves this newly added file was absent.'
                : 'Baseline file absence or declaration identity could not be established.',
              null,
              observation,
            );
          }
          continue;
        }
        if (old.format !== current.format) {
          unknownSide(old.observations, 'before', 'The selected format for this file changed.');
          unknownSide(current.observations, 'after', 'The selected format for this file changed.');
          continue;
        }
        for (const ruleId of RULES[current.format]) {
          checkTime();
          const oldObservations = old.observations.filter((entry) => entry.issue.ruleId === ruleId);
          const newObservations = current.observations.filter((entry) => entry.issue.ruleId === ruleId);
          const groups = (observations: readonly SnapshotObservation[]): Map<string, SnapshotObservation[]> => {
            const result = new Map<string, SnapshotObservation[]>();
            for (const observation of observations) {
              if (observation.identity === null) continue;
              const group = result.get(observation.identity) ?? [];
              group.push(observation);
              result.set(observation.identity, group);
            }
            return result;
          };
          const oldGroups = groups(oldObservations);
          const newGroups = groups(newObservations);
          const ambiguousOld = oldObservations.some((entry) => entry.identity === null);
          const ambiguousNew = newObservations.some((entry) => entry.identity === null);
          unknownSide(
            oldObservations.filter((entry) => entry.identity === null),
            'before',
            'The declaration identity is ambiguous.',
          );
          unknownSide(
            newObservations.filter((entry) => entry.identity === null),
            'after',
            'The declaration identity is ambiguous.',
          );
          const sameContent = old.sha256 !== null && old.sha256 === current.sha256 && old.bytes === current.bytes;
          for (const identity of [...new Set([...oldGroups.keys(), ...newGroups.keys()])].sort()) {
            const older = oldGroups.get(identity) ?? [];
            const newer = newGroups.get(identity) ?? [];
            if (older.length > 1 || newer.length > 1) {
              unknownSide(older, 'before', 'Repeated declaration identities prevent an unambiguous match.');
              unknownSide(newer, 'after', 'Repeated declaration identities prevent an unambiguous match.');
            } else if (older[0] && newer[0]) {
              add('unchanged', 'The same declaration identity is present in both snapshots.', older[0], newer[0]);
            } else if (newer[0]) {
              const supported = assessed(old, ruleId) && !ambiguousOld && !sameContent;
              add(
                supported ? 'new' : 'unknown',
                supported
                  ? 'The declaration is absent from adequately assessed baseline coverage.'
                  : 'Baseline coverage or declaration matching cannot establish introduction.',
                null,
                newer[0],
              );
            } else if (older[0]) {
              const supported = assessed(current, ruleId) && !ambiguousNew && !sameContent;
              add(
                supported ? 'removed' : 'unknown',
                supported
                  ? 'The declaration is absent from adequately assessed candidate coverage; deployed remediation was not assessed.'
                  : 'Candidate coverage or declaration matching cannot establish removal.',
                older[0],
                null,
              );
            }
          }
        }
      }
    }
    changes.sort((left, right) => {
      checkTime();
      return (
        lexical(observationKey(left.after ?? left.before), observationKey(right.after ?? right.before)) ||
        ORDER.indexOf(left.state) - ORDER.indexOf(right.state) ||
        lexical(observationKey(left.before), observationKey(right.before))
      );
    });
    checkTime();
    const counts = { new: 0, unchanged: 0, removed: 0, unknown: 0 };
    for (const change of changes) counts[change.state]++;
    if (counts.unknown > 0)
      diagnostics.push({
        code: 'comparison/unknown-change',
        path: '',
        message:
          'Some declarations cannot be classified as introduced, unchanged, or removed with the available evidence.',
      });
    return {
      schemaVersion: 1,
      kind: 'offline-repository-comparison',
      status: diagnostics.length > 0 ? 'partial' : 'completed',
      baselineId: before.id,
      candidateId: after.id,
      compatible,
      counts,
      changes,
      diagnostics,
    };
  } catch {
    return failure('comparison/processing-limit');
  }
}
