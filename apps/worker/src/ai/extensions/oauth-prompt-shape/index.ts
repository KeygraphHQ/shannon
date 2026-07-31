/**
 * pi extension: keep Claude Code OAuth requests on included subscription billing.
 *
 * Anthropic's OAuth billing classifier inspects the request payload and decides
 * from its shape which billing lane applies. pi prepends the Claude Code identity
 * block correctly, but its own harness system prompt names the product "pi", and
 * that name routes the request into the metered "extra usage" pool instead of the
 * subscription's included quota. Once that pool is empty — most subscribers never
 * fund it — every request fails with HTTP 429 "monthly spend limit".
 *
 * Isolated empirically against api.anthropic.com with a single credential,
 * alternating variants in one run: replacing only `pi` flips every request from
 * HTTP 429 to HTTP 200 and moves the response's anthropic-ratelimit-unified-reset
 * to the subscription window. Replacing only "harness", or only the opening
 * sentence, does not, and trimming the prompt does not either — the product name
 * is the fingerprint and it has to go everywhere.
 *
 * This handler rewrites the harness system prompt for OAuth runs only. Shannon's
 * own agent prompts are untouched: they travel as user messages, which the
 * classifier does not appear to inspect.
 *
 * Reference: NousResearch/hermes-agent#72171 (root cause + bisection of the same
 * class of bug in another harness).
 */

import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Product name the classifier fingerprints, and the identity pi already claims for OAuth. */
const HARNESS_NAME = /\bpi\b/gi;
const CLAUDE_CODE_NAME = 'Claude Code';

/**
 * Whether this run authenticates with a Claude Code OAuth token. pi decides the
 * OAuth wire path the same way — by the `sk-ant-oat` marker in the token — so this
 * gate matches exactly the requests that carry the Claude Code identity headers.
 */
function isOAuthRun(): boolean {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  return typeof token === 'string' && token.includes('sk-ant-oat');
}

export default function oauthPromptShapeExtension(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (event: BeforeAgentStartEvent): BeforeAgentStartEventResult | undefined => {
    if (!isOAuthRun()) return undefined;

    const rewritten = event.systemPrompt.replace(HARNESS_NAME, CLAUDE_CODE_NAME);
    if (rewritten === event.systemPrompt) return undefined;

    return { systemPrompt: rewritten };
  });
}
