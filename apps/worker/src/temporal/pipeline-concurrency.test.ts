import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MAX_CONCURRENT_PIPELINES,
  isDirectMaxConcurrentPipelines,
  MAX_CONCURRENT_PIPELINES_ENV,
  parseMaxConcurrentPipelines,
} from './pipeline-concurrency.js';

/** Every rejected form must fall back to the default, never throw, and never run unbounded. */
const INVALID_VALUES = ['0', '-1', '2.5', '5x', 'abc', 'Infinity', '1e3', '٣'] as const;

test('the default fan-out is five, matching the previous hard-coded constant', () => {
  assert.equal(DEFAULT_MAX_CONCURRENT_PIPELINES, 5);
});

test('unset or blank values fall back to the default', () => {
  assert.equal(parseMaxConcurrentPipelines(undefined), DEFAULT_MAX_CONCURRENT_PIPELINES);
  assert.equal(parseMaxConcurrentPipelines(''), DEFAULT_MAX_CONCURRENT_PIPELINES);
  assert.equal(parseMaxConcurrentPipelines('   '), DEFAULT_MAX_CONCURRENT_PIPELINES);
});

test('a positive integer overrides the fan-out, and 1 runs sequentially', () => {
  assert.equal(parseMaxConcurrentPipelines('1'), 1);
  assert.equal(parseMaxConcurrentPipelines('3'), 3);
  assert.equal(parseMaxConcurrentPipelines('10'), 10);
  assert.equal(parseMaxConcurrentPipelines(' 2 '), 2);
});

test('non-positive or non-integer values fall back to the default', () => {
  for (const raw of INVALID_VALUES) {
    assert.equal(parseMaxConcurrentPipelines(raw), DEFAULT_MAX_CONCURRENT_PIPELINES, raw);
    assert.equal(isDirectMaxConcurrentPipelines(raw), false, raw);
  }
});

test('the environment variable name matches the documented knob', () => {
  assert.equal(MAX_CONCURRENT_PIPELINES_ENV, 'SHANNON_MAX_CONCURRENT_PIPELINES');
});
