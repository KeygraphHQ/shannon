import { describe, it, expect } from 'vitest';
import { filterJsonToolCalls } from './output-formatter.js';

describe('filterJsonToolCalls', () => {
  it('returns empty string for null/undefined input', () => {
    expect(filterJsonToolCalls(null)).toBe('');
    expect(filterJsonToolCalls(undefined)).toBe('');
  });

  it('keeps regular text lines unchanged', () => {
    expect(filterJsonToolCalls('Hello world')).toBe('Hello world');
  });

  it('filters valid tool_use JSON with Task name', () => {
    const line = '{"type":"tool_use","name":"Task","input":{"description":"recon scan"}}';
    const result = filterJsonToolCalls(line);
    expect(result).toContain('Launching recon scan');
  });

  it('drops tool calls with invalid structure (missing name)', () => {
    const line = '{"type":"tool_use","input":{"description":"bad"}}';
    const result = filterJsonToolCalls(line);
    // Should be dropped (empty result since no valid lines remain)
    expect(result).toBe('');
  });

  it('drops tool calls where name is not a string', () => {
    const line = '{"type":"tool_use","name":123,"input":{}}';
    const result = filterJsonToolCalls(line);
    expect(result).toBe('');
  });

  it('drops tool calls where input is an array (not a plain object)', () => {
    const line = '{"type":"tool_use","name":"Task","input":["malicious"]}';
    const result = filterJsonToolCalls(line);
    expect(result).toBe('');
  });

  it('drops tool calls where name is empty string', () => {
    const line = '{"type":"tool_use","name":"","input":{}}';
    const result = filterJsonToolCalls(line);
    expect(result).toBe('');
  });

  it('sanitizes control characters in description for display', () => {
    const line = '{"type":"tool_use","name":"Task","input":{"description":"recon\\u0000\\u0007scan"}}';
    const result = filterJsonToolCalls(line);
    expect(result).not.toContain('\x00');
    expect(result).not.toContain('\x07');
    expect(result).toContain('reconscan');
  });

  it('truncates very long descriptions to prevent log flooding', () => {
    const longDesc = 'A'.repeat(200);
    const line = `{"type":"tool_use","name":"Task","input":{"description":"${longDesc}"}}`;
    const result = filterJsonToolCalls(line);
    // sanitizeForDisplay truncates to 80 chars
    expect(result.length).toBeLessThan(200);
  });

  it('treats non-JSON lines starting with {"type":"tool_use" as regular text', () => {
    const line = '{"type":"tool_use" this is not valid json';
    const result = filterJsonToolCalls(line);
    expect(result).toBe(line);
  });
});
