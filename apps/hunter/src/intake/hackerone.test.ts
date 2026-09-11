import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HackerOneApiIntake, LocalFileIntake, parseProgramScope } from './hackerone.js';

const FIXTURE_PATH = fileURLToPath(new URL('../../fixtures/programs/example-program.json', import.meta.url));

test('LocalFileIntake loads a well-formed fixture', async () => {
  const intake = new LocalFileIntake();
  const result = await intake.loadProgram(FIXTURE_PATH);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.programId, 'example-program');
    assert.equal(result.value.authorizationConfirmed, true);
    assert.equal(result.value.assets.length, 2);
  }
});

test('LocalFileIntake fails cleanly on a missing file', async () => {
  const intake = new LocalFileIntake();
  const result = await intake.loadProgram('/nonexistent/does-not-exist.json');
  assert.equal(result.ok, false);
});

test('parseProgramScope rejects a malformed asset list', () => {
  const result = parseProgramScope({
    programId: 'x',
    programName: 'X',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [{ identifier: 'x.com', type: 'not-a-real-type', instruction: 'in-scope' }],
    rulesOfEngagement: [],
    disallowedTechniques: [],
  });
  assert.equal(result.ok, false);
});

test('parseProgramScope rejects a non-hackerone platform', () => {
  const result = parseProgramScope({
    programId: 'x',
    programName: 'X',
    platform: 'bugcrowd',
    authorizationConfirmed: true,
    assets: [],
    rulesOfEngagement: [],
    disallowedTechniques: [],
  });
  assert.equal(result.ok, false);
});

test('HackerOneApiIntake is disabled by design', async () => {
  const intake = new HackerOneApiIntake();
  const result = await intake.loadProgram('example-program');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /not implemented/);
  }
});
