import { describe, it, expect, afterAll } from 'vitest';
import { saveDeliverableFile } from './file-operations.js';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), `shannon-file-ops-test-${Date.now()}`);

afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('saveDeliverableFile - path traversal protection', () => {
  it('saves a valid file successfully', () => {
    mkdirSync(testDir, { recursive: true });
    const filepath = saveDeliverableFile(testDir, 'report.md', '# Test Report');
    expect(existsSync(filepath)).toBe(true);
    expect(readFileSync(filepath, 'utf8')).toBe('# Test Report');
  });

  it('rejects filename with ../ path traversal', () => {
    expect(() => saveDeliverableFile(testDir, '../../../etc/passwd', 'malicious')).toThrow(
      'must not contain path separators'
    );
  });

  it('rejects filename with ../ in the middle', () => {
    expect(() => saveDeliverableFile(testDir, 'foo/../../../bar', 'malicious')).toThrow(
      'must not contain path separators'
    );
  });

  it('rejects filename with backslash traversal (Windows-style)', () => {
    // On Unix, path.basename uses / as separator, but we also check for ..
    expect(() => saveDeliverableFile(testDir, '..\\..\\pwn.txt', 'malicious')).toThrow();
  });

  it('rejects filename containing null bytes', () => {
    expect(() => saveDeliverableFile(testDir, 'file\0.txt', 'malicious')).toThrow(
      'forbidden characters'
    );
  });

  it('rejects absolute path as filename', () => {
    expect(() => saveDeliverableFile(testDir, '/etc/passwd', 'malicious')).toThrow(
      'must not contain path separators'
    );
  });

  it('allows filenames with dots that are not traversal', () => {
    mkdirSync(testDir, { recursive: true });
    const filepath = saveDeliverableFile(testDir, 'report.v2.md', 'content');
    expect(existsSync(filepath)).toBe(true);
  });
});
