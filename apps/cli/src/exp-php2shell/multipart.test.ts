import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildControlBody, buildProbeBody, PROBE_HEADER_COUNT, PROBE_SMALL_HEADER_COUNT } from './multipart.js';

/** Default PHP post_max_size; the probe body must fit under it to reach the parser. */
const DEFAULT_POST_MAX_SIZE = 8 * 1024 * 1024;

test('the control body is a single valid multipart field', () => {
  const control = buildControlBody();
  assert.match(control.contentType, /^multipart\/form-data; boundary=/);
  const text = control.body.toString('utf8');
  assert.equal((text.match(/Content-Disposition: form-data/g) ?? []).length, 1);
  assert.match(text, /name="probe"/);
});

test('the probe body floods one part with headers and no Content-Disposition', () => {
  const probe = buildProbeBody();
  const text = probe.body.toString('utf8');
  assert.equal((text.match(/^X-h\d+: a$/gm) ?? []).length, PROBE_HEADER_COUNT);
  assert.ok(PROBE_HEADER_COUNT > 1020, 'header count must exceed the patched parser part limit');
  assert.ok(!text.includes('Content-Disposition'), 'the probe part must omit Content-Disposition');
});

test('the probe body stays within the default post_max_size', () => {
  const probe = buildProbeBody();
  assert.ok(probe.body.length > 1024 * 1024);
  assert.ok(probe.body.length < DEFAULT_POST_MAX_SIZE);
});

test('the small first-attempt probe is around 1 MiB and smaller than the full body', () => {
  const small = buildProbeBody(PROBE_SMALL_HEADER_COUNT);
  const text = small.body.toString('utf8');
  assert.equal((text.match(/^X-h\d+: a$/gm) ?? []).length, PROBE_SMALL_HEADER_COUNT);
  assert.ok(!text.includes('Content-Disposition'));
  assert.ok(small.body.length > 512 * 1024 && small.body.length < 2 * 1024 * 1024);
  assert.ok(small.body.length < buildProbeBody(PROBE_HEADER_COUNT).body.length);
});

test('each probe body uses a fresh boundary', () => {
  assert.notEqual(buildProbeBody().contentType, buildProbeBody().contentType);
});
