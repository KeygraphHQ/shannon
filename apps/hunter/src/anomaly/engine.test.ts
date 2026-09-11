import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectAnomaliesAgainstBaseline,
  detectAnomaly,
  jsonStructureFingerprint,
  type ObservationSample,
} from './engine.js';

function sample(overrides: Partial<ObservationSample> = {}): ObservationSample {
  return {
    label: 'baseline',
    httpStatus: 200,
    headerNames: ['content-type', 'date'],
    cookieNames: [],
    contentType: 'application/json',
    bodyLength: 120,
    bodyStructureFingerprint: 'fp-a',
    ...overrides,
  };
}

test('detectAnomaly returns undefined for two identical samples', () => {
  const anomaly = detectAnomaly(sample(), sample({ label: 'variant' }), { source: 'test' });
  assert.equal(anomaly, undefined);
});

test('detectAnomaly reports a changed http-status dimension', () => {
  const anomaly = detectAnomaly(sample(), sample({ label: 'variant', httpStatus: 403 }), { source: 'test' });
  assert.ok(anomaly);
  assert.equal(anomaly?.changedDimensions.length, 1);
  assert.equal(anomaly?.changedDimensions[0]?.dimension, 'http-status');
  assert.equal(anomaly?.changedDimensions[0]?.baselineValue, '200');
  assert.equal(anomaly?.changedDimensions[0]?.variantValue, '403');
});

test('detectAnomaly is deterministic for identical inputs', () => {
  const a = detectAnomaly(sample(), sample({ label: 'v', httpStatus: 500 }), { source: 'test' });
  const b = detectAnomaly(sample(), sample({ label: 'v', httpStatus: 500 }), { source: 'test' });
  assert.equal(a?.significance, b?.significance);
  assert.equal(a?.confidence, b?.confidence);
  assert.deepEqual(a?.changedDimensions, b?.changedDimensions);
});

test('significance grows with the number and weight of changed dimensions', () => {
  const oneDimension = detectAnomaly(sample(), sample({ label: 'v', httpStatus: 500 }), { source: 'test' });
  const manyDimensions = detectAnomaly(
    sample(),
    sample({
      label: 'v',
      httpStatus: 500,
      bodyStructureFingerprint: 'fp-b',
      redirectLocation: '/login',
      contentType: 'text/html',
    }),
    { source: 'test' },
  );
  assert.ok((manyDimensions?.significance ?? 0) > (oneDimension?.significance ?? 0));
});

test('timing differences below the noise threshold are not reported as anomalies', () => {
  const anomaly = detectAnomaly(sample({ timingMs: 100 }), sample({ label: 'v', timingMs: 120 }), { source: 'test' });
  assert.equal(anomaly, undefined);
});

test('timing differences above the noise threshold are reported, with low reliability', () => {
  const anomaly = detectAnomaly(sample({ timingMs: 100 }), sample({ label: 'v', timingMs: 900 }), { source: 'test' });
  assert.ok(anomaly);
  assert.equal(anomaly?.changedDimensions[0]?.dimension, 'timing');
  assert.ok((anomaly?.changedDimensions[0]?.reliability ?? 1) < 0.5);
});

test('authorization-outcome changes carry maximum weight and reliability', () => {
  const anomaly = detectAnomaly(
    sample({ authorizationOutcome: 'denied' }),
    sample({ label: 'v', authorizationOutcome: 'allowed' }),
    { source: 'test' },
  );
  assert.ok(anomaly);
  const dim = anomaly?.changedDimensions.find((c) => c.dimension === 'authorization-outcome');
  assert.ok(dim);
  assert.equal(dim?.weight, 1.0);
});

test('an anomaly never claims a vulnerability — it only reports competing explanations', () => {
  const anomaly = detectAnomaly(sample(), sample({ label: 'v', httpStatus: 403 }), { source: 'test' });
  assert.ok(anomaly);
  assert.ok((anomaly?.possibleExplanations.length ?? 0) >= 2);
  assert.ok((anomaly?.suggestedExperiments.length ?? 0) >= 1);
});

test('confidence is scaled by the caller-supplied source confidence', () => {
  const full = detectAnomaly(sample(), sample({ label: 'v', httpStatus: 500 }), {
    source: 'test',
    confidenceOfSource: 1,
  });
  const half = detectAnomaly(sample(), sample({ label: 'v', httpStatus: 500 }), {
    source: 'test',
    confidenceOfSource: 0.5,
  });
  assert.ok((half?.confidence ?? 0) < (full?.confidence ?? 0));
});

test('detectAnomaliesAgainstBaseline compares every variant independently', () => {
  const baseline = sample();
  const anomalies = detectAnomaliesAgainstBaseline(
    baseline,
    [
      sample({ label: 'v1', httpStatus: 500 }),
      sample({ label: 'v2' }),
      sample({ label: 'v3', contentType: 'text/html' }),
    ],
    { source: 'test' },
  );
  assert.equal(anomalies.length, 2);
});

test('jsonStructureFingerprint is stable across key order and ignores values', () => {
  const a = jsonStructureFingerprint({ id: 1, name: 'alice' });
  const b = jsonStructureFingerprint({ name: 'bob', id: 2 });
  assert.equal(a, b);
});

test('jsonStructureFingerprint distinguishes different shapes', () => {
  const a = jsonStructureFingerprint({ id: 1 });
  const b = jsonStructureFingerprint({ id: 1, name: 'x' });
  assert.notEqual(a, b);
});

test('jsonStructureFingerprint handles arrays by shape of the first element', () => {
  const a = jsonStructureFingerprint([{ id: 1 }, { id: 2 }]);
  const b = jsonStructureFingerprint([{ id: 9 }]);
  assert.equal(a, b);
});
