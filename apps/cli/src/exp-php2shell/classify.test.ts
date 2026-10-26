import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify } from './classify.js';
import type { ProbeResponse } from './transport.js';

function response(partial: Partial<ProbeResponse>): ProbeResponse {
  return { reachable: true, timedOut: false, status: 200, bodyLength: 100, bodyText: 'ok', headers: {}, ...partial };
}

const HEALTHY_CONTROL = response({ status: 200, bodyLength: 1200, bodyText: 'home' });
const FATAL_BODY = 'Fatal error: Allowed memory size of 134217728 bytes exhausted in Unknown on line 0';

test('in-band fatal memory error is a detected crash', () => {
  const result = classify(HEALTHY_CONTROL, response({ status: 500, bodyLength: 90, bodyText: FATAL_BODY }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'fatal-error-in-band');
});

test('detects the HTML-formatted fatal mod_php emits with html_errors on', () => {
  const htmlFatal =
    '<br />\n<b>Fatal error</b>:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 4096 bytes) in <b>Unknown</b> on line <b>0</b><br />\n';
  const result = classify(HEALTHY_CONTROL, response({ status: 200, bodyLength: 149, bodyText: htmlFatal }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'fatal-error-in-band');
});

test('empty 200 against a populated control is a detected crash', () => {
  const result = classify(HEALTHY_CONTROL, response({ status: 200, bodyLength: 0, bodyText: '' }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'empty-body-200');
});

test('empty 500 against a populated control is a detected crash', () => {
  const result = classify(HEALTHY_CONTROL, response({ status: 500, bodyLength: 0, bodyText: '' }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'empty-body-500');
});

test('a populated 500 error page is not an empty-body-500 crash', () => {
  const result = classify(
    HEALTHY_CONTROL,
    response({ status: 500, bodyLength: 120, bodyText: 'Internal Server Error' }),
  );
  assert.notEqual(result.signal, 'empty-body-500');
});

test('gateway 5xx against a healthy control is a detected crash', () => {
  const result = classify(HEALTHY_CONTROL, response({ status: 503, bodyLength: 20, bodyText: 'bad gateway' }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'gateway-5xx');
});

test('a dropped probe connection against a healthy control is a detected crash', () => {
  const result = classify(HEALTHY_CONTROL, response({ reachable: false, status: 0, bodyLength: 0, bodyText: '' }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'connection-dropped');
});

test('an edge rejection is inconclusive', () => {
  const result = classify(HEALTHY_CONTROL, response({ status: 413, bodyLength: 30, bodyText: 'too large' }));
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.signal, 'edge-blocked');
});

test('an unreachable control is inconclusive regardless of the probe', () => {
  const control = response({ reachable: false, timedOut: false, status: 0, bodyLength: 0, bodyText: '' });
  const result = classify(control, response({ status: 500, bodyText: FATAL_BODY }));
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.signal, 'control-unreachable');
});

test('a probe that hits the deadline is inconclusive, not a dropped connection', () => {
  const result = classify(
    HEALTHY_CONTROL,
    response({ reachable: false, timedOut: true, status: 0, bodyLength: 0, bodyText: '' }),
  );
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.signal, 'probe-timeout');
});

test('a server-error baseline is inconclusive even when the probe shows a fatal', () => {
  const control = response({ status: 503, bodyLength: 40, bodyText: 'Service Unavailable' });
  const result = classify(control, response({ status: 500, bodyLength: 90, bodyText: FATAL_BODY }));
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.signal, 'baseline-unhealthy');
});

test('a baseline that already carries the fatal is inconclusive', () => {
  const control = response({ status: 200, bodyLength: 90, bodyText: FATAL_BODY });
  const result = classify(control, response({ status: 200, bodyLength: 90, bodyText: FATAL_BODY }));
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.signal, 'baseline-unhealthy');
});

test('no crash with an affected version header is detected on the version', () => {
  const control = response({ bodyLength: 500, headers: { 'x-powered-by': 'PHP/8.3.20' } });
  const result = classify(control, response({ status: 200, bodyLength: 500 }));
  assert.equal(result.verdict, 'detected');
  assert.equal(result.signal, 'version-below-fix');
  assert.equal(result.version?.verdict, 'affected');
});

test('no crash with a patched version header is not detected', () => {
  const control = response({ bodyLength: 500, headers: { 'x-powered-by': 'PHP/8.3.36' } });
  const result = classify(control, response({ status: 200, bodyLength: 500 }));
  assert.equal(result.verdict, 'not_detected');
  assert.equal(result.signal, 'version-patched');
});

test('no crash and no version header is not detected with a caveat signal', () => {
  const result = classify(response({ bodyLength: 500, headers: {} }), response({ status: 200, bodyLength: 500 }));
  assert.equal(result.verdict, 'not_detected');
  assert.equal(result.signal, 'no-observable-signal');
  assert.equal(result.version, undefined);
});

test('a conflicting multi-banner header is recorded as an unknown version', () => {
  const control = response({ bodyLength: 500, headers: { server: 'Apache PHP/8.3.20 PHP/8.3.36' } });
  const result = classify(control, response({ status: 200, bodyLength: 500 }));
  assert.equal(result.version?.verdict, 'unknown');
});

test('a directly observed crash still attaches the supplementary version signal', () => {
  const control = response({ bodyLength: 1200, headers: { 'x-powered-by': 'PHP/8.3.20' } });
  const result = classify(control, response({ status: 500, bodyText: FATAL_BODY, bodyLength: 90 }));
  assert.equal(result.signal, 'fatal-error-in-band');
  assert.equal(result.version?.rawValue, 'PHP/8.3.20');
});
