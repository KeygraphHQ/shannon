// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type } from 'typebox';
import { loadArtifactRef, sha256Bytes, stableJson } from '../artifacts.js';
import { CapellaRetryableError } from '../errors.js';
import {
  ARCHITECTURE_TOOLS,
  buildCodePathScopeSnippet,
  buildKnowledgeBaseContext,
  PLAN_TOOLS,
  THREAT_MODEL_TOOLS,
} from '../prompt-context.js';
import { createCapellaPromptLoader } from '../prompt-loader.js';
import {
  ARCHITECTURE_SCHEMA,
  type KbEntity,
  type KbResult,
  PLAN_SCHEMA,
  THREAT_MODEL_SCHEMA,
  type ThreatModelResult,
} from '../schemas.js';
import type {
  ArchitectureValue,
  CapellaStageInput,
  CapellaStageRuntime,
  CompletedStage,
  PlanStageInput,
  PlanValue,
  ThreatModelStageInput,
  ThreatModelValue,
} from '../types.js';
import {
  isArchitectureValue,
  isPlanValue,
  isThreatModelResult,
  isThreatModelValue,
  salvageKbResult,
  salvagePlanResult,
} from '../validation.js';
import {
  artifactLineage,
  buildStageFingerprint,
  completeStage,
  maybeReuseStage,
  publishTextAsset,
  resolveStageIdentity,
} from './shared.js';

// Per-session caps on model turns, sized to how much repository exploration each
// stage legitimately needs before its structured output is due.
const ARCHITECTURE_MAX_TURNS = 400;
const THREAT_MODEL_MAX_TURNS = 150;
const PLAN_MAX_TURNS = 150;
const KB_CONTENT_HASH_LENGTH = 12;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function slugName(name: string): string {
  return (
    name
      .replace(/\.md$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'entity'
  );
}

async function publishKnowledgeBase(input: CapellaStageInput, knowledgeBase: KbResult): Promise<void> {
  await publishTextAsset(input, 'kb/architecture.md', knowledgeBase.architecture);
  await publishTextAsset(input, 'kb/index.md', knowledgeBase.index);
  await publishTextAsset(input, 'kb/dependencies.json', stableJson(knowledgeBase.dependencies));

  async function publishEntities(subdirectory: string, entities: readonly KbEntity[]): Promise<void> {
    for (const asset of knowledgeBaseEntityAssets(subdirectory, entities).assets) {
      await publishTextAsset(input, asset.relativePath, asset.entity.content);
    }
  }

  await publishEntities('entities', knowledgeBase.entities);
  await publishEntities('vulnerabilities', knowledgeBase.vulnerabilities);
}

interface KnowledgeBaseEntityAsset {
  readonly entity: KbEntity;
  readonly relativePath: string;
}

interface KnowledgeBaseEntityAssets {
  readonly assets: KnowledgeBaseEntityAsset[];
  readonly uniqueEntities: KbEntity[];
  readonly duplicateCount: number;
}

/** Deterministic collision-safe KB names, scoped independently to each subdirectory. */
export function knowledgeBaseEntityAssets(
  subdirectory: string,
  entities: readonly KbEntity[],
): KnowledgeBaseEntityAssets {
  const groups = new Map<string, Array<{ entity: KbEntity; contentHash: string }>>();
  for (const entity of entities) {
    const baseSlug = slugName(entity.name);
    const group = groups.get(baseSlug) ?? [];
    group.push({ entity, contentHash: sha256Bytes(entity.content) });
    groups.set(baseSlug, group);
  }

  const assets: KnowledgeBaseEntityAsset[] = [];
  const uniqueEntities: KbEntity[] = [];
  let duplicateCount = 0;
  for (const baseSlug of [...groups.keys()].sort(compareText)) {
    const group = groups.get(baseSlug) ?? [];
    group.sort(
      (left, right) =>
        compareText(left.entity.name, right.entity.name) ||
        compareText(left.contentHash, right.contentHash) ||
        compareText(left.entity.content, right.entity.content),
    );
    const unique = group.filter((entry, index) => {
      const previous = group[index - 1];
      const duplicate =
        previous !== undefined &&
        previous.entity.name === entry.entity.name &&
        previous.entity.content === entry.entity.content;
      if (duplicate) duplicateCount += 1;
      return !duplicate;
    });
    const suffixCounts = new Map<string, number>();
    for (const entry of unique) {
      const shortHash = entry.contentHash.slice(0, KB_CONTENT_HASH_LENGTH);
      suffixCounts.set(shortHash, (suffixCounts.get(shortHash) ?? 0) + 1);
    }
    const suffixOrdinals = new Map<string, number>();
    for (const entry of unique) {
      const shortHash = entry.contentHash.slice(0, KB_CONTENT_HASH_LENGTH);
      let filename = baseSlug;
      if (unique.length > 1) {
        filename = `${baseSlug}-${shortHash}`;
        // A truncated hash prefix can still collide between two genuinely distinct contents; an
        // ordinal suffix breaks that tie instead of one entity silently overwriting the other's file.
        if ((suffixCounts.get(shortHash) ?? 0) > 1) {
          const ordinal = (suffixOrdinals.get(shortHash) ?? 0) + 1;
          suffixOrdinals.set(shortHash, ordinal);
          filename = `${filename}-${String(ordinal)}`;
        }
      }
      uniqueEntities.push(entry.entity);
      assets.push({ entity: entry.entity, relativePath: `kb/${subdirectory}/${filename}.md` });
    }
  }
  return { assets, uniqueEntities, duplicateCount };
}

export async function runArchitectureStage(
  input: CapellaStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<ArchitectureValue>> {
  const startedAt = Date.now();
  const identity = await resolveStageIdentity(input);
  const loader = createCapellaPromptLoader(input.promptDir);
  const prompt = loader.render(
    'sast.capella.architecture',
    {
      ...ARCHITECTURE_TOOLS,
      LANGUAGE_CONTEXT: '',
      BOUNDARY_CONTEXT: buildCodePathScopeSnippet(input.codePathFocus, input.codePathAvoids),
    },
    { pipelineTestingMode: input.pipelineTestingMode },
  );
  const fingerprint = buildStageFingerprint('architecture', identity, prompt, {
    schema: ARCHITECTURE_SCHEMA,
  });
  const reused = await maybeReuseStage(input, 'architecture', fingerprint, isArchitectureValue, identity, startedAt);
  if (reused) return reused;

  const response = await runtime.executor.run<unknown>({
    stage: 'architecture',
    role: 'large',
    cwd: input.repoPath,
    systemPrompt:
      'You are the knowledge-base synthesizer of a security audit. Describe the security-relevant architecture ' +
      'of the codebase and return the complete knowledge base as structured output.',
    userPrompt: prompt,
    maxTurns: ARCHITECTURE_MAX_TURNS,
    timeoutMs: input.timeoutMs,
    tools: runtime.repositoryTools,
    outputSchema: Type.Unsafe(ARCHITECTURE_SCHEMA),
    signal: runtime.signal,
  });
  const salvaged = salvageKbResult(response.output);
  if (!salvaged) {
    throw new CapellaRetryableError('Capella architecture output failed core validation', 'ARCHITECTURE_SCHEMA');
  }

  const entityAssets = knowledgeBaseEntityAssets('entities', salvaged.value.entities);
  const vulnerabilityAssets = knowledgeBaseEntityAssets('vulnerabilities', salvaged.value.vulnerabilities);
  const omittedEntityCount =
    salvaged.omittedEntityCount + entityAssets.duplicateCount + vulnerabilityAssets.duplicateCount;
  const knowledgeBase: KbResult = {
    ...salvaged.value,
    entities: entityAssets.uniqueEntities,
    vulnerabilities: vulnerabilityAssets.uniqueEntities,
  };
  const reduced = omittedEntityCount + salvaged.omittedDependencyCount > 0;

  const value: ArchitectureValue = {
    knowledgeBase,
    componentCount: knowledgeBase.entities.length,
    ...(reduced && {
      reduction: {
        stage: 'architecture',
        reason: 'invalid_architecture_items',
        entityCount: salvaged.consideredEntityCount,
        omittedEntityCount,
        dependencyCount: salvaged.consideredDependencyCount,
        omittedDependencyCount: salvaged.omittedDependencyCount,
      },
    }),
  };
  await publishKnowledgeBase(input, knowledgeBase);
  return completeStage(input, 'architecture', fingerprint, response.usage, value, identity, startedAt);
}

export async function runThreatModelStage(
  input: ThreatModelStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<ThreatModelValue>> {
  const startedAt = Date.now();
  const architecture = await loadArtifactRef(
    input.artifactRoot,
    input.architectureArtifact,
    'architecture',
    isArchitectureValue,
  );
  const identity = await resolveStageIdentity(input);
  const loader = createCapellaPromptLoader(input.promptDir);
  // The prompt template expects a knowledge-base directory; the KB is inlined below
  // the prompt instead, so KB_DIR redirects the model to that inline context.
  const prompt = `${loader.render(
    'sast.capella.threat_model',
    { ...THREAT_MODEL_TOOLS, KB_DIR: 'the host-provided context below' },
    { pipelineTestingMode: input.pipelineTestingMode },
  )}\n\n${buildKnowledgeBaseContext(architecture.value.knowledgeBase)}`;
  const fingerprint = buildStageFingerprint('threat-model', identity, prompt, {
    architecture: artifactLineage(input.architectureArtifact),
    schema: THREAT_MODEL_SCHEMA,
  });
  const reused = await maybeReuseStage(
    input,
    'threat-model',
    fingerprint,
    isThreatModelValue,
    identity,
    startedAt,
    // Reuse is valid only while the published THREAT_MODEL.md still matches the
    // artifact byte for byte; the fingerprint cannot see edits to the published asset.
    async (value) => {
      const expectedPath = resolve(input.artifactRoot, 'kb', 'THREAT_MODEL.md');
      if (value.threatModelPath !== expectedPath) return false;
      try {
        return (await readFile(expectedPath, 'utf8')) === value.threatModel;
      } catch {
        return false;
      }
    },
  );
  if (reused) return reused;

  const response = await runtime.executor.run<ThreatModelResult>({
    stage: 'threat-model',
    role: 'medium',
    cwd: input.repoPath,
    systemPrompt:
      'You are the security architect of a security audit. Synthesize the threat model from the supplied knowledge ' +
      'base and return the deployment-intent verdict as its own field.',
    userPrompt: prompt,
    maxTurns: THREAT_MODEL_MAX_TURNS,
    timeoutMs: input.timeoutMs,
    tools: runtime.repositoryTools,
    outputSchema: Type.Unsafe(THREAT_MODEL_SCHEMA),
    signal: runtime.signal,
  });
  if (!isThreatModelResult(response.output)) {
    throw new CapellaRetryableError(
      'Capella threat-model output failed schema or intent validation',
      'THREAT_MODEL_SCHEMA',
    );
  }
  const threatModelPath = resolve(input.artifactRoot, 'kb', 'THREAT_MODEL.md');
  await publishTextAsset(input, 'kb/THREAT_MODEL.md', response.output.threatModel);
  const value: ThreatModelValue = { ...response.output, threatModelPath };
  return completeStage(input, 'threat-model', fingerprint, response.usage, value, identity, startedAt);
}

export async function runPlanStage(
  input: PlanStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<PlanValue>> {
  const startedAt = Date.now();
  const architecture = await loadArtifactRef(
    input.artifactRoot,
    input.architectureArtifact,
    'architecture',
    isArchitectureValue,
  );
  const threatModel = await loadArtifactRef(
    input.artifactRoot,
    input.threatModelArtifact,
    'threat-model',
    isThreatModelValue,
  );
  const identity = await resolveStageIdentity(input);
  const loader = createCapellaPromptLoader(input.promptDir);
  const knowledgeBase = {
    ...architecture.value.knowledgeBase,
    threatModel: threatModel.value.threatModel,
    intent: threatModel.value.intent,
  };
  const prompt = `${loader.render(
    'sast.capella.plan',
    {
      ...PLAN_TOOLS,
      KB_DIR: 'the host-provided context below',
      LANGUAGE_CONTEXT: '',
      BOUNDARY_CONTEXT: buildCodePathScopeSnippet(input.codePathFocus, input.codePathAvoids),
    },
    { pipelineTestingMode: input.pipelineTestingMode },
  )}\n\n${buildKnowledgeBaseContext(architecture.value.knowledgeBase)}\n\n<capella_threat_model>\n${threatModel.value.threatModel}\n</capella_threat_model>`;
  const fingerprint = buildStageFingerprint('plan', identity, prompt, {
    architecture: artifactLineage(input.architectureArtifact),
    threatModel: artifactLineage(input.threatModelArtifact),
    schema: PLAN_SCHEMA,
    knowledgeBaseDigest: stableJson(knowledgeBase),
  });
  const reused = await maybeReuseStage(input, 'plan', fingerprint, isPlanValue, identity, startedAt);
  if (reused) return reused;

  const response = await runtime.executor.run<unknown>({
    stage: 'plan',
    role: 'medium',
    cwd: input.repoPath,
    systemPrompt:
      'You are the strategist of a security audit. Produce an adaptive review roadmap that covers the production ' +
      'code and return it as structured output.',
    userPrompt: prompt,
    maxTurns: PLAN_MAX_TURNS,
    timeoutMs: input.timeoutMs,
    tools: runtime.repositoryTools,
    outputSchema: Type.Unsafe(PLAN_SCHEMA),
    signal: runtime.signal,
  });
  const salvaged = salvagePlanResult(response.output);
  if (!salvaged || salvaged.value.investigations.length === 0) {
    throw new CapellaRetryableError('Capella plan output contained no usable investigations', 'PLAN_SCHEMA');
  }
  const value: PlanValue = {
    investigations: [...salvaged.value.investigations],
    investigationCount: salvaged.value.investigations.length,
    ...(salvaged.omittedCount > 0 && {
      reduction: {
        stage: 'plan',
        reason: 'invalid_investigations',
        consideredCount: salvaged.consideredCount,
        usableCount: salvaged.value.investigations.length,
        omittedCount: salvaged.omittedCount,
      },
    }),
  };
  await publishTextAsset(input, 'plan.json', stableJson(salvaged.value));
  return completeStage(input, 'plan', fingerprint, response.usage, value, identity, startedAt);
}
