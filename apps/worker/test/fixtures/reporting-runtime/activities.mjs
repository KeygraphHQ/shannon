// Benign local fixture activities: only journal and report production modules.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@temporalio/activity';
import { captureWorkerCodeIdentity, RunMetadataStore } from '../../../dist/audit/run-metadata.js';
import {
  copyBlackboxDeliverables,
  publishBlackboxArtifacts,
  renderBlackboxArtifacts,
} from '../../../dist/blackbox/artifacts.js';
import { atomicWrite, ensureDirectory } from '../../../dist/utils/file-io.js';

const TARGET_ORIGIN = 'https://reporting-fixture.invalid';

function fixtureSnapshot(status) {
  return {
    schemaVersion: 1,
    revision: 1,
    targetOrigin: TARGET_ORIGIN,
    runStatus: status,
    identities: [{ name: 'fixture-user', role: 'fixture role', authenticated: true, stateRef: 'private-fixture-state' }],
    exchanges: [{
      exchangeId: 'fixture-exchange',
      routeSignature: 'fixture-route',
      identity: 'fixture-user',
      captureSequence: 1,
      method: 'GET',
      origin: TARGET_ORIGIN,
      path: '/fixture-only',
      queryKeys: [],
      bodyShape: 'none',
      requestContentType: null,
      responseStatus: 200,
      responseContentType: 'text/plain',
      responseFingerprint: `sha256:${'0'.repeat(64)}`,
      candidateObjectReferences: [],
      rawRecordRef: 'private-fixture-record',
      provenance: { actor: 'blackbox-recon', taskId: 'fixture-task', baseRevision: 0 },
    }],
    resources: [],
    transitions: [],
    hypotheses: [],
    actions: [],
    candidateProofs: [],
    verifications: [],
    tasks: [],
    rejectedTasks: [],
  };
}

export function createReportingActivities(ownedRoot) {
  const absoluteRoot = path.resolve(ownedRoot);
  function ownedPath(value) {
    const resolved = path.resolve(value);
    const relative = path.relative(absoluteRoot, resolved);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('Runtime fixture path must stay beneath the test-owned temporary directory');
    }
    return resolved;
  }
  function workspace(input) {
    return ownedPath(input.workspace);
  }
  function markerPath(input) {
    return path.join(workspace(input), '.fixture', 'terminal.json');
  }
  async function publish(input, metadata, injectFailure = false) {
    const root = workspace(input);
    if (!metadata) throw new Error('Runtime fixture has no recorded metadata');
    const artifacts = renderBlackboxArtifacts({
      snapshot: fixtureSnapshot(input.status),
      findings: [],
      status: input.status,
      failure: null,
      runMetadata: metadata,
    });
    const artifactNames = await publishBlackboxArtifacts(root, artifacts, {
      ensureDirectory,
      async atomicWrite(filePath, content) {
        if (injectFailure && path.basename(filePath) === 'blackbox_authz_evidence.md') {
          throw new Error('Synthetic publication outage; no target or provider activity ran');
        }
        await atomicWrite(filePath, content);
      },
    });
    copyBlackboxDeliverables(root, path.join(root, 'copied-report'), artifactNames);
    return { metadata, artifactNames };
  }
  return {
    async beginAttempt(input) {
      const root = workspace(input);
      await mkdir(path.join(root, '.fixture'), { recursive: true });
      const captureCode = input.packagedModule
        ? (await import(pathToFileURL(ownedPath(input.packagedModule)).href)).captureWorkerCodeIdentity
        : captureWorkerCodeIdentity;
      const code = input.code ?? await captureCode();
      return new RunMetadataStore(root).start({
        attemptId: input.attemptId,
        workflowId: input.workflowId,
        startedAt: input.startedAt,
        isResume: input.isResume,
        configuredModel: input.configuredModel,
        code,
      });
    },
    async finalizeReport(input) {
      const root = workspace(input);
      const store = new RunMetadataStore(root);
      await store.prepareFinalization(input.attemptId, input.status, input.termination);
      // A synthetic terminal barrier stands in for a committed assessment state.
      // This fixture deliberately does not execute the production assessment workflow.
      await atomicWrite(markerPath(input), { status: input.status, ownerWorkflowId: input.workflowId });
      const metadata = await store.commitFinalization(input.status, input.workflowId);
      const attempt = Context.current().info.attempt;
      const injectFailure = input.failPublicationOnce === true && attempt === 1;
      await appendFile(path.join(root, '.fixture', 'publications.jsonl'), `${JSON.stringify({
        activityAttempt: attempt,
        selectedEndedAt: input.termination.endedAt,
        recordedEndedAt: metadata.attempts.find(record => record.attemptId === input.attemptId).endedAt,
        injectedFailure: injectFailure,
      })}\n`);
      return publish(input, metadata, injectFailure);
    },
    async repairReport(input) {
      const terminal = JSON.parse(await readFile(markerPath(input), 'utf8'));
      const metadata = await new RunMetadataStore(workspace(input)).commitFinalization(
        terminal.status,
        terminal.ownerWorkflowId,
      );
      return publish({ ...input, status: terminal.status }, metadata);
    },
    async publishSnapshot(input) {
      // Diagnostic fixture projection only. A cancelled production run may have no report.
      return publish({ ...input, status: 'incomplete' }, await new RunMetadataStore(workspace(input)).read());
    },
    async observeCancellation(input) {
      if (input.observedStatus !== 'CANCELLED') throw new Error('Expected an observed Temporal cancellation');
      const store = new RunMetadataStore(workspace(input));
      await store.observeEnd(input.attemptId, input.observedCloseTime, 'interrupted', 'temporal');
      return publish({ ...input, status: 'incomplete' }, await store.read());
    },
  };
}
