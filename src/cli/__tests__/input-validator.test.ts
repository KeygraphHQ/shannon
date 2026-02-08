// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { describe, it, expect } from 'vitest';
import { validateWebUrl, validateRepoPath } from '../input-validator.js';

// =============================================================================
// validateWebUrl
// =============================================================================

describe('validateWebUrl', () => {
  // --- Valid URLs ---

  it('accepts a valid HTTPS URL', () => {
    const result = validateWebUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid HTTP URL', () => {
    const result = validateWebUrl('http://example.com');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with a port', () => {
    const result = validateWebUrl('https://example.com:8080');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with a path', () => {
    const result = validateWebUrl('https://example.com/api/v1');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with query parameters', () => {
    const result = validateWebUrl('https://example.com/search?q=test&page=1');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with a fragment', () => {
    const result = validateWebUrl('https://example.com/page#section');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with an IP address', () => {
    const result = validateWebUrl('http://192.168.1.1:3000');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with localhost', () => {
    const result = validateWebUrl('http://localhost:8080');
    expect(result.valid).toBe(true);
  });

  // --- Invalid: Protocol ---

  it('rejects FTP protocol', () => {
    const result = validateWebUrl('ftp://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must use HTTP or HTTPS protocol');
  });

  it('rejects file protocol', () => {
    const result = validateWebUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must use HTTP or HTTPS protocol');
  });

  it('rejects javascript protocol', () => {
    // new URL('javascript:alert(1)') has protocol 'javascript:' and no hostname
    const result = validateWebUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
  });

  // --- Invalid: Format ---

  it('rejects an empty string', () => {
    const result = validateWebUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid web URL format');
  });

  it('rejects a bare hostname without protocol', () => {
    const result = validateWebUrl('example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid web URL format');
  });

  it('rejects random text', () => {
    const result = validateWebUrl('not a url at all');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid web URL format');
  });

  // --- Invalid: Embedded credentials ---

  it('rejects a URL with username and password', () => {
    const result = validateWebUrl('http://admin:secret@example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  it('rejects a URL with only a username', () => {
    const result = validateWebUrl('http://admin@example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  it('rejects a URL with empty username and password', () => {
    const result = validateWebUrl('http://:password@example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  it('rejects an HTTPS URL with embedded credentials', () => {
    const result = validateWebUrl('https://user:pass@secure.example.com/path');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  it('rejects URL-encoded credentials (percent-encoded username)', () => {
    // URL API decodes %61 -> 'a', so username becomes 'admin'
    const result = validateWebUrl('http://%61dmin@example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  it('rejects credentials with special characters', () => {
    const result = validateWebUrl('http://user%40name:p%40ss@example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  it('rejects credentials combined with port, path, and query', () => {
    const result = validateWebUrl('https://admin:secret@example.com:8443/api?key=val');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must not contain embedded credentials');
  });

  // --- Edge: @ in non-credential positions (must NOT false-positive) ---

  it('accepts a URL with @ in the path (not credentials)', () => {
    const result = validateWebUrl('https://example.com/users/@admin');
    expect(result.valid).toBe(true);
  });

  it('accepts a URL with @ in a query parameter', () => {
    const result = validateWebUrl('https://example.com/search?email=user@domain.com');
    expect(result.valid).toBe(true);
  });

  // --- Edge: Guard clause ordering ---

  it('returns protocol error (not credentials error) for non-HTTP URL with credentials', () => {
    // ftp://user:pass@host should fail on protocol BEFORE reaching the credentials check
    const result = validateWebUrl('ftp://user:pass@example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Web URL must use HTTP or HTTPS protocol');
  });
});

// =============================================================================
// validateRepoPath
// =============================================================================

describe('validateRepoPath', () => {
  // --- Valid paths ---

  it('accepts a valid directory and returns absolute path', async () => {
    // Use the project root as a known-valid directory
    const result = await validateRepoPath('.');
    expect(result.valid).toBe(true);
    expect(result.path).toBeDefined();
    // Absolute path should not start with '.'
    expect(result.path!.startsWith('.')).toBe(false);
  });

  it('accepts a relative subdirectory path', async () => {
    const result = await validateRepoPath('src');
    expect(result.valid).toBe(true);
    expect(result.path).toBeDefined();
    expect(result.path!.endsWith('src')).toBe(true);
  });

  // --- Invalid paths ---

  it('rejects a path that does not exist', async () => {
    const result = await validateRepoPath('/nonexistent/path/that/should/not/exist');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Repository path does not exist');
  });

  it('rejects a file path (not a directory)', async () => {
    // package.json exists but is a file, not a directory
    const result = await validateRepoPath('package.json');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Repository path must be a directory');
  });

  it('rejects an empty string', async () => {
    const result = await validateRepoPath('');
    expect(result.valid).toBe(false);
  });
});
