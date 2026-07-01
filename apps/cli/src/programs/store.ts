import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ProgramConfig } from './types.js';

function getProgramsDir(): string {
  const home = os.homedir();
  return path.join(home, '.shannon', 'programs');
}

export async function saveProgram(config: ProgramConfig): Promise<void> {
  const dir = getProgramsDir();
  await fs.mkdir(dir, { recursive: true });
  
  const slug = config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filepath = path.join(dir, `${slug}.json`);
  
  await fs.writeFile(filepath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function loadProgram(name: string): Promise<ProgramConfig> {
  const dir = getProgramsDir();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filepath = path.join(dir, `${slug}.json`);
  
  const content = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(content) as ProgramConfig;
}
