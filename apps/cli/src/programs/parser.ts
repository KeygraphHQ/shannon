import type { ProgramConfig } from './types.js';

/**
 * Parse raw program text into structured ProgramConfig using LLM.
 * (Placeholder for actual Anthropic API call using SDK)
 */
export async function parseProgram(rawText: string, apiKey?: string): Promise<ProgramConfig> {
  // TODO: Use actual Anthropic SDK for Claude Haiku struct output.
  // For now, we mock the response to unblock the CLI plumbing.
  
  return {
    name: "mock-program",
    platform: "hackerone",
    in_scope_domains: ["*.example.com"],
    out_of_scope_patterns: ["admin.example.com"],
    focus_classes: ["xss-vuln", "injection-vuln"],
    rules: ["Do not run automated scanners"]
  };
}
