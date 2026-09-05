import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { AGENT_VALIDATORS, incompleteRecordedPrerequisites } from '../dist/session-manager.js';
import { renderRecon } from '../dist/services/recon-renderer.js';

const RECON_WITH_MEMORIES = [
  '## 4. API Endpoint Inventory',
  '',
  '| Route ID | Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| GET /rest/memories | GET | /rest/memories | anon | None | None | Lists shared memories and associated users. (routes/memory.ts:20) |',
  '',
  '## 5. Potential Input Vectors for Vulnerability Analysis',
].join('\n');

async function validateAuthzQueue(queue, reconMarkdown = RECON_WITH_MEMORIES, mode = 'completion') {
  const sourceDir = await mkdtemp(join(tmpdir(), 'shannon-recon-handoff-'));
  const warnings = [];
  const logger = {
    info() {},
    warn(message) {
      warnings.push(message);
    },
    error() {},
  };

  try {
    await writeFile(join(sourceDir, 'recon_deliverable.md'), reconMarkdown, 'utf8');
    await writeFile(join(sourceDir, 'authz_exploitation_queue.json'), JSON.stringify(queue), 'utf8');
    const valid = await AGENT_VALIDATORS['authz-vuln'](sourceDir, logger, mode);
    return { valid, warnings };
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
  }
}

test('recon renders the canonical method and path as a stable route ID', () => {
  const markdown = renderRecon({
    endpoints: [
      {
        method: 'GET',
        path: '/rest/memories',
        required_role: 'anon',
        object_id_parameters: [],
        authorization_mechanism: 'None',
        description: 'Lists shared memories and associated users.',
        code_pointer: 'routes/memory.ts:20',
      },
    ],
  });

  assert.match(markdown, /\| Route ID \| Method \| Endpoint Path \|/);
  assert.match(markdown, /\| GET \/rest\/memories \| GET \| \/rest\/memories \|/);
});

test('authz analysis rejects a recon route without a disposition', async () => {
  const { valid, warnings } = await validateAuthzQueue({ vulnerabilities: [], recon_route_dispositions: [] });

  assert.equal(valid, false);
  assert.match(warnings.join('\n'), /GET \/rest\/memories/);
});

test('legacy recon tables derive the same canonical route ID', async () => {
  const legacyRecon = [
    '## 4. API Endpoint Inventory',
    '',
    '| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |',
    '| --- | --- | --- | --- | --- | --- |',
    '| GET | /rest/memories | anon | None | None | Lists shared memories and associated users. (routes/memory.ts:20) |',
    '',
    '## 5. Potential Input Vectors for Vulnerability Analysis',
  ].join('\n');
  const { valid, warnings } = await validateAuthzQueue(
    { vulnerabilities: [], recon_route_dispositions: [] },
    legacyRecon,
  );

  assert.equal(valid, false);
  assert.match(warnings.join('\n'), /GET \/rest\/memories/);
});

test('authz analysis accepts one code-backed disposition for the route', async () => {
  const { valid } = await validateAuthzQueue({
    vulnerabilities: [],
    recon_route_dispositions: [
      {
        route_id: 'GET /rest/memories',
        disposition: 'ruled_out',
        finding_ids: [],
        evidence: 'routes/memory.ts:20 applies the public-only projection before serialization.',
      },
    ],
  });

  assert.equal(valid, true);
});

test('authz analysis accepts queued and blocked route dispositions', async (t) => {
  await t.test('queued route links a submitted finding', async () => {
    const { valid } = await validateAuthzQueue({
      vulnerabilities: [{ ID: 'AUTHZ-VULN-01' }],
      recon_route_dispositions: [
        {
          route_id: 'GET /rest/memories',
          disposition: 'queued',
          finding_ids: ['AUTHZ-VULN-01'],
          evidence: 'routes/memory.ts:20 returns private user fields without an authorization guard.',
        },
      ],
    });
    assert.equal(valid, true);
  });

  await t.test('blocked route records its blocker', async () => {
    const { valid } = await validateAuthzQueue({
      vulnerabilities: [],
      recon_route_dispositions: [
        {
          route_id: 'GET /rest/memories',
          disposition: 'blocked',
          finding_ids: [],
          evidence: 'Generated handler source is absent from the supplied repository.',
        },
      ],
    });
    assert.equal(valid, true);
  });
});

test('pipeline fixture with no recon routes accepts an empty disposition list', async () => {
  const { valid } = await validateAuthzQueue(
    { vulnerabilities: [], recon_route_dispositions: [] },
    '## 4. API Endpoint Inventory\n\n_[Section 4: not provided — `add_endpoints` was not called]_\n\n## 5. Potential Input Vectors',
  );

  assert.equal(valid, true);
});

test('authz analysis rejects a missing or malformed recon endpoint section', async () => {
  const { valid, warnings } = await validateAuthzQueue(
    { vulnerabilities: [], recon_route_dispositions: [] },
    '## 3. Authentication\n\ntruncated before the endpoint inventory',
  );

  assert.equal(valid, false);
  assert.match(warnings.join('\n'), /Section 4.*missing or malformed/i);
});

test('resume invalidates recorded downstream work when a recorded prerequisite must rerun', () => {
  const states = {
    recon: { status: 'failed' },
    'authz-vuln': { status: 'success' },
    'authz-exploit': { status: 'success' },
    report: { status: 'success' },
  };
  const completed = new Set(['pre-recon']);

  assert.deepEqual(incompleteRecordedPrerequisites('authz-vuln', states, completed), ['recon']);
  assert.deepEqual(incompleteRecordedPrerequisites('authz-exploit', states, completed), ['authz-vuln']);
  assert.deepEqual(incompleteRecordedPrerequisites('report', states, completed), ['authz-exploit']);
});

test('authz analysis rejects fabricated and duplicate route dispositions', async () => {
  const disposition = {
    route_id: 'GET /rest/memories',
    disposition: 'ruled_out',
    finding_ids: [],
    evidence: 'routes/memory.ts:20 applies the public-only projection before serialization.',
  };
  const { valid, warnings } = await validateAuthzQueue({
    vulnerabilities: [],
    recon_route_dispositions: [
      disposition,
      disposition,
      { ...disposition, route_id: 'GET /rest/not-real' },
    ],
  });

  assert.equal(valid, false);
  assert.match(warnings.join('\n'), /duplicate.*GET \/rest\/memories/i);
  assert.match(warnings.join('\n'), /unknown.*GET \/rest\/not-real/i);
});

test('queued route dispositions must link to submitted vulnerability IDs', async () => {
  const { valid, warnings } = await validateAuthzQueue({
    vulnerabilities: [],
    recon_route_dispositions: [
      {
        route_id: 'GET /rest/memories',
        disposition: 'queued',
        finding_ids: ['AUTHZ-VULN-01'],
        evidence: 'routes/memory.ts:20 returns private user fields without an authorization guard.',
      },
    ],
  });

  assert.equal(valid, false);
  assert.match(warnings.join('\n'), /AUTHZ-VULN-01/);
});

test('resume accepts an authz queue written before route dispositions existed', async () => {
  const legacyQueue = { vulnerabilities: [] };

  const completion = await validateAuthzQueue(legacyQueue, RECON_WITH_MEMORIES, 'completion');
  assert.equal(completion.valid, false);

  const resume = await validateAuthzQueue(legacyQueue, RECON_WITH_MEMORIES, 'resume');
  assert.equal(resume.valid, true);
});

test('resume still rejects an authz queue whose route dispositions are malformed', async () => {
  const malformedQueue = { vulnerabilities: [], recon_route_dispositions: 'nope' };

  const completion = await validateAuthzQueue(malformedQueue, RECON_WITH_MEMORIES, 'completion');
  assert.equal(completion.valid, false);

  const resume = await validateAuthzQueue(malformedQueue, RECON_WITH_MEMORIES, 'resume');
  assert.equal(resume.valid, false);
});
