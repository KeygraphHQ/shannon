import fs from 'node:fs/promises';

/**
 * Fetch program configuration text from a URL or file path.
 */
export async function fetchProgram(source: string): Promise<string> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch program from URL: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  }

  // Treat as local file path
  try {
    return await fs.readFile(source, 'utf-8');
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw new Error(`Failed to read program file: ${err.message}`);
    }
    throw err;
  }
}
