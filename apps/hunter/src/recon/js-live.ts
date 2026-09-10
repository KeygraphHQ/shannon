/**
 * Live JavaScript + source-map intelligence pipeline.
 *
 * Real, network-capable code: fetch HTML -> find `<script src>` tags ->
 * fetch each script -> detect `sourceMappingURL` -> fetch and parse the
 * source map -> recover original source content -> run the existing
 * static `js-intel.ts` analysis over both the bundle and every recovered
 * source file. Every step uses the platform `fetch`, so this genuinely
 * performs live requests — this package's own tests only ever point it at
 * `testing/local-app-server.ts` (127.0.0.1), never an external host.
 */

import type { RawDiscovery } from '../types.js';
import { analyzeJavaScript, type JsIntelResult } from './js-intel.js';

export function extractScriptSources(html: string, baseUrl: string): readonly string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1];
    if (!src) continue;
    try {
      urls.push(new URL(src, baseUrl).toString());
    } catch {
      // Ignore an unparseable script src rather than failing the whole page.
    }
  }
  return urls;
}

export function detectSourceMappingUrl(jsContent: string): string | undefined {
  const match = jsContent.match(/\/\/[#@]\s*sourceMappingURL=(\S+)/);
  return match?.[1];
}

export function resolveSourceMapUrl(scriptUrl: string, sourceMappingUrl: string): string {
  return new URL(sourceMappingUrl, scriptUrl).toString();
}

export interface ParsedSourceMap {
  readonly sources: readonly string[];
  readonly sourcesContent: readonly string[];
}

export function parseSourceMap(json: string): ParsedSourceMap {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    return { sources: [], sourcesContent: [] };
  }
  const record = parsed as Record<string, unknown>;
  return {
    sources: Array.isArray(record.sources) ? record.sources.filter((s): s is string => typeof s === 'string') : [],
    sourcesContent: Array.isArray(record.sourcesContent)
      ? record.sourcesContent.filter((s): s is string => typeof s === 'string')
      : [],
  };
}

export interface LiveJsPipelineResult extends JsIntelResult {
  readonly scriptsAnalyzed: number;
  readonly sourceMapsRecovered: number;
}

function mergeResults(a: JsIntelResult, b: JsIntelResult): JsIntelResult {
  return { discoveries: [...a.discoveries, ...b.discoveries], observations: [...a.observations, ...b.observations] };
}

export interface LiveJsPipelineOptions {
  readonly timeoutMs?: number;
}

/**
 * Fetches `pageUrl`, analyzes every same-origin-or-explicit script it
 * references, and — where a source map is published — recovers and
 * analyzes the original source content too. `assetRef` is the
 * application/asset these discoveries and observations belong to.
 */
export async function analyzeLiveApplication(
  pageUrl: string,
  assetRef: string,
  engagementId: string,
  options: LiveJsPipelineOptions = {},
): Promise<LiveJsPipelineResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  let result: JsIntelResult = { discoveries: [], observations: [] };
  let scriptsAnalyzed = 0;
  let sourceMapsRecovered = 0;

  const pageResponse = await fetch(pageUrl, { signal: AbortSignal.timeout(timeoutMs) });
  const html = await pageResponse.text();
  const scriptUrls = extractScriptSources(html, pageUrl);

  for (const scriptUrl of scriptUrls) {
    const jsResponse = await fetch(scriptUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!jsResponse.ok) continue;
    const jsContent = await jsResponse.text();
    scriptsAnalyzed += 1;
    result = mergeResults(result, analyzeJavaScript(jsContent, scriptUrl, assetRef, engagementId));

    const sourceMappingUrl = detectSourceMappingUrl(jsContent);
    if (!sourceMappingUrl) continue;

    const mapUrl = resolveSourceMapUrl(scriptUrl, sourceMappingUrl);
    try {
      const mapResponse = await fetch(mapUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!mapResponse.ok) continue;
      const mapJson = await mapResponse.text();
      const parsedMap = parseSourceMap(mapJson);
      sourceMapsRecovered += 1;

      const sourceMapDiscovery: RawDiscovery = {
        source: 'js-intelligence',
        kind: 'source-location',
        label: mapUrl,
        attributes: { assetRef, recoveredSources: parsedMap.sources },
        confidence: 1,
        discoveredAt: new Date().toISOString(),
      };
      result = { discoveries: [...result.discoveries, sourceMapDiscovery], observations: result.observations };

      for (let i = 0; i < parsedMap.sources.length; i += 1) {
        const content = parsedMap.sourcesContent[i];
        if (content === undefined) continue;
        const sourceRef = parsedMap.sources[i] ?? mapUrl;
        result = mergeResults(result, analyzeJavaScript(content, sourceRef, assetRef, engagementId));
      }
    } catch {
      // A source map that fails to fetch or parse does not invalidate the bundle analysis already collected.
    }
  }

  return { ...result, scriptsAnalyzed, sourceMapsRecovered };
}
