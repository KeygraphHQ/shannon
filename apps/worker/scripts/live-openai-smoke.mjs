import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import dotenv from 'dotenv';
import { resolveModelSelection } from '../dist/ai/models.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

if (process.env.SHANNON_LIVE_OPENAI_SMOKE !== '1') {
  throw new Error('Refusing a billed request unless SHANNON_LIVE_OPENAI_SMOKE=1.');
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required for the live smoke test.');
}

const conflicting = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
].filter((name) => process.env[name]);
if (conflicting.length > 0) {
  throw new Error(`Unset conflicting provider variables before the smoke test: ${conflicting.join(', ')}`);
}

const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), 'large');
if (selection.model.id !== 'gpt-5.6-sol' || selection.model.api !== 'openai-responses') {
  throw new Error(`Expected openai/gpt-5.6-sol via Responses, got ${selection.providerId}/${selection.model.id}.`);
}

let session;
try {
  ({ session } = await createAgentSession({
    cwd: os.tmpdir(),
    model: selection.model,
    thinkingLevel: selection.thinkingLevel,
    noTools: 'all',
    authStorage: selection.authStorage,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } }),
  }));

  await session.prompt('Reply with exactly OK and no other text.');
  const text = session.getLastAssistantText()?.trim();
  const stats = session.getSessionStats();
  if (text !== 'OK') throw new Error(`Unexpected smoke response: ${JSON.stringify(text)}`);
  if (!Number.isFinite(stats.cost) || stats.cost <= 0) {
    throw new Error(`Expected a positive finite API cost, got ${JSON.stringify(stats.cost)}.`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      provider: selection.providerId,
      model: selection.model.id,
      api: selection.model.api,
      thinkingLevel: selection.thinkingLevel,
      response: text,
      inputTokens: stats.tokens.input,
      outputTokens: stats.tokens.output,
      cost: stats.cost,
    }),
  );
} finally {
  session?.dispose();
}
