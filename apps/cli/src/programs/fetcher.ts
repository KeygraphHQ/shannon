import fs from 'node:fs';

export async function fetchProgram(
  input: string,
): Promise<{ text: string; source: string }> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const resp = await fetch(input);
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${input}: ${resp.status} ${resp.statusText}`);
    }
    const text = await resp.text();
    return { text, source: input };
  }

  if (!fs.existsSync(input)) {
    throw new Error(`File not found: ${input}`);
  }
  const text = fs.readFileSync(input, 'utf-8');
  return { text, source: input };
}
