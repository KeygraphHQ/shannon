import { test, expect, describe } from 'vitest';
import { ScopeValidator } from './scope-validator.js';

describe('ScopeValidator', () => {
  test('validates in-scope domains correctly', () => {
    const validator = new ScopeValidator(['example.com', '*.api.com'], []);
    expect(validator.validateUrl('https://example.com/api')).toBe(true);
    expect(validator.validateUrl('http://test.api.com/v1')).toBe(true);
    expect(validator.validateUrl('https://other.com')).toBe(false);
  });

  test('respects out-of-scope patterns', () => {
    const validator = new ScopeValidator(['*.example.com'], ['admin.example.com']);
    expect(validator.validateUrl('https://api.example.com')).toBe(true);
    expect(validator.validateUrl('https://admin.example.com')).toBe(false);
  });
});
