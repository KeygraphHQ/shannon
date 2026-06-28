import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ProgramConfig, StoredProgram } from './types.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

function getProgramsDir(): string {
  const dir = path.join(SHANNON_HOME, 'programs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function saveProgram(config: ProgramConfig, sourceUrl?: string): StoredProgram {
  const slug = slugify(config.name);
  const stored: StoredProgram = {
    slug,
    config,
    created_at: new Date().toISOString(),
    ...(sourceUrl !== undefined && { source_url: sourceUrl }),
  };
  const filePath = path.join(getProgramsDir(), `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2));
  return stored;
}

export function loadProgram(name: string): StoredProgram | null {
  const slug = slugify(name);
  const filePath = path.join(getProgramsDir(), `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoredProgram;
}

export function listPrograms(): StoredProgram[] {
  const dir = getProgramsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as StoredProgram);
}
