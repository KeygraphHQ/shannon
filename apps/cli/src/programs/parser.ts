import type { ProgramConfig } from './types.js';

const SYSTEM_PROMPT = `You are a bug bounty program parser. Extract structured information from bug bounty program pages.

Return a JSON object matching this schema:
{
  "name": "Program name",
  "platform": "hackerone" | "bugcrowd" | "other",
  "in_scope_domains": ["domain1.com", "*.domain2.com"],
  "out_of_scope_patterns": ["pattern1", "pattern2"],
  "focus_classes": ["xss", "sqli"] (optional),
  "active_campaign": { "asset": "...", "multipliers": {"critical": 2} } (optional),
  "rules": "free-text participation rules" (optional)
}

Only include fields that are explicitly mentioned in the program text.`;

export async function parseProgram(rawText: string): Promise<ProgramConfig> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse the following bug bounty program page and extract structured information:\n\n${rawText}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    throw new Error(`LLM parse failed: ${resp.status} ${await resp.text()}`);
  }

  const data = (await resp.json()) as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in LLM response');
  return JSON.parse(jsonMatch[0]) as ProgramConfig;
}
