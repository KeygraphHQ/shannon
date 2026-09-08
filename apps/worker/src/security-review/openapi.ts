// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReviewDiagnostic, ReviewLimits, RuleAnalysis, RuleId, StaticIssue } from './types.js';
import { at, DEFAULT_LIMITS, isRecord, RULES } from './types.js';

const SCHEME = RULES.openapi[0];
const SCOPE = RULES.openapi[1];
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const FLOWS = new Set(['implicit', 'password', 'clientCredentials', 'authorizationCode']);
const own = (value: object, key: string): boolean => Object.hasOwn(value, key);

interface LocatedObject {
  readonly value: Record<string, unknown>;
  readonly pointer: string;
}
interface Scheme {
  readonly type: string;
  readonly scopes?: ReadonlySet<string>;
}

/**
 * Offline declaration checks, not a general OpenAPI validator or authentication audit.
 * Security requirements are checked where declared: inherited root declarations are
 * not copied onto operations, and every AND member and OR alternative is checked.
 * OAS 3.0.4 / 3.1.1 Security Requirement, Security Scheme, OAuth Flow, Reference,
 * Path Item and Callback Objects define the supported interpretation.
 */
export function analyzeOpenApi(document: unknown, limits: ReviewLimits = DEFAULT_LIMITS): RuleAnalysis {
  const issues: StaticIssue[] = [];
  const diagnostics: ReviewDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const issueKeys = new Set<string>();
  const deadline = Date.now() + limits.timeoutMs;
  let nodes = 0;
  let references = 0;
  let stopped = false;

  function diagnose(code: string, pointer: string, message: string, ruleIds: readonly RuleId[] = RULES.openapi): void {
    const key = JSON.stringify([code, pointer, ruleIds]);
    if (!diagnosticKeys.has(key)) {
      diagnosticKeys.add(key);
      diagnostics.push({ code, pointer, ruleIds, message });
    }
  }

  function tick(pointer: string, depth = 0): boolean {
    if (stopped) return false;
    let code: string | undefined;
    if (Date.now() >= deadline) code = 'openapi/time-limit';
    else if (depth > limits.maxDepth) code = 'openapi/depth-limit';
    else if (++nodes > limits.maxNodes) code = 'openapi/node-limit';
    if (code) {
      stopped = true;
      diagnose(code, pointer, 'The bounded local analysis stopped before all relevant declarations could be checked.');
      return false;
    }
    return true;
  }

  function report(ruleId: RuleId, pointer: string): void {
    const key = `${ruleId}:${pointer}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({
      ruleId,
      classification: 'contract-consistency',
      applicability: 'declared',
      pointer,
      message:
        ruleId === SCHEME
          ? 'This security requirement names a scheme absent from the local security-scheme declarations.'
          : 'This OAuth2 requirement names a scope absent from all locally declared flows for the scheme.',
      remediation:
        ruleId === SCHEME
          ? 'Correct the requirement name or declare the intended scheme under components.securitySchemes.'
          : 'Correct the required scope or add the intended scope to the appropriate OAuth2 flow declaration.',
    });
  }

  if (!tick('')) return { issues, diagnostics };
  if (!isRecord(document)) {
    diagnose('openapi/invalid-document', '', 'An OpenAPI input must be a mapping.');
    return { issues, diagnostics };
  }
  if (typeof document.openapi !== 'string' || !/^3\.[01]\.\d+$/.test(document.openapi)) {
    diagnose('openapi/unsupported-version', '/openapi', 'Only OpenAPI 3.0.x and 3.1.x declarations are supported.');
    return { issues, diagnostics };
  }
  const version31 = document.openapi.startsWith('3.1.');
  const root = document;

  // Validate the minimum document envelope without becoming a full schema linter.
  // Keep checking local requirements when metadata is invalid, retaining useful
  // declarations while diagnostics make the incomplete document explicit.
  if (!isRecord(root.info) || own(root.info, '$ref')) {
    diagnose(
      'openapi/invalid-info',
      '/info',
      'OpenAPI requires an inline info mapping with string title and version fields.',
    );
  } else {
    for (const field of ['title', 'version']) {
      if (typeof root.info[field] !== 'string') {
        diagnose('openapi/invalid-info', at('/info', field), 'This required OpenAPI info field must be a string.');
      }
    }
  }
  if (version31 && !['paths', 'components', 'webhooks'].some((field) => own(root, field))) {
    diagnose(
      'openapi/missing-description-content',
      '',
      'An OpenAPI 3.1 description requires paths, components, or webhooks.',
    );
  }

  /** Resolve URI-fragment JSON Pointers only; never consult a file, URL, or environment. */
  function resolve(value: unknown, pointer: string, kind: 'scheme' | 'path' | 'callback'): LocatedObject | undefined {
    const seen = new Set<object>();
    while (tick(pointer)) {
      if (!isRecord(value)) {
        diagnose('openapi/invalid-structure', pointer, 'A relevant OpenAPI declaration must be a mapping.');
        return undefined;
      }
      if (!own(value, '$ref')) return { value, pointer };
      const refPointer = at(pointer, '$ref');
      if (seen.has(value)) {
        diagnose(
          'openapi/cyclic-reference',
          refPointer,
          'A cyclic local reference prevents this declaration from being resolved.',
        );
        return undefined;
      }
      seen.add(value);
      if (
        kind === 'path' &&
        Object.keys(value).some((key) => !['$ref', 'summary', 'description'].includes(key) && !key.startsWith('x-'))
      ) {
        diagnose(
          'openapi/path-reference-siblings',
          pointer,
          'A referenced Path Item with adjacent structural fields is outside the supported interpretation.',
        );
        return undefined;
      }
      const reference = value.$ref;
      if (typeof reference !== 'string') {
        diagnose('openapi/invalid-reference', refPointer, 'A reference must be a URI string.');
        return undefined;
      }
      if (!reference.startsWith('#')) {
        diagnose(
          'openapi/external-reference',
          refPointer,
          'A reference outside this document was not read; the affected declaration is unknown.',
        );
        return undefined;
      }
      let fragment: string;
      try {
        fragment = decodeURIComponent(reference.slice(1));
      } catch {
        diagnose(
          'openapi/invalid-reference',
          refPointer,
          'The local reference contains invalid URI-fragment encoding.',
        );
        return undefined;
      }
      if (fragment !== '' && !fragment.startsWith('/')) {
        diagnose(
          'openapi/unsupported-reference',
          refPointer,
          'Only local URI-fragment JSON Pointer references are supported.',
        );
        return undefined;
      }
      if (/~(?:[^01]|$)/.test(fragment)) {
        diagnose(
          'openapi/invalid-reference',
          refPointer,
          'The local reference contains invalid JSON Pointer escaping.',
        );
        return undefined;
      }
      if (++references > limits.maxReferences) {
        stopped = true;
        diagnose(
          'openapi/reference-limit',
          refPointer,
          'The local reference expansion limit was reached before analysis completed.',
        );
        return undefined;
      }
      let target: unknown = root;
      let targetPointer = '';
      const tokens =
        fragment === ''
          ? []
          : fragment
              .slice(1)
              .split('/')
              .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
      for (const token of tokens) {
        if (!tick(refPointer)) return undefined;
        if (
          (!isRecord(target) && !Array.isArray(target)) ||
          !own(target, token) ||
          (Array.isArray(target) && !/^(0|[1-9]\d*)$/.test(token))
        ) {
          diagnose(
            'openapi/unresolved-reference',
            refPointer,
            'The local reference target is absent or cannot be traversed.',
          );
          return undefined;
        }
        target = (target as Record<string, unknown>)[token];
        targetPointer = at(targetPointer, token);
      }
      value = target;
      pointer = targetPointer;
    }
    return undefined;
  }

  let schemeMap: Record<string, unknown> | undefined = {};
  if (own(root, 'components')) {
    if (!isRecord(root.components) || own(root.components, '$ref')) {
      diagnose(
        'openapi/invalid-components',
        '/components',
        'The components declaration must be a local mapping, not a reference.',
      );
      schemeMap = undefined;
    } else if (own(root.components, 'securitySchemes')) {
      if (!isRecord(root.components.securitySchemes) || own(root.components.securitySchemes, '$ref')) {
        diagnose(
          'openapi/invalid-security-schemes',
          '/components/securitySchemes',
          'Security schemes must be a local mapping of named scheme declarations.',
        );
        schemeMap = undefined;
      } else schemeMap = root.components.securitySchemes;
    }
  }
  const schemes = new Map<string, Scheme | undefined>();

  function oauthScopes(value: Record<string, unknown>, pointer: string): ReadonlySet<string> | undefined {
    const flowPointer = at(pointer, 'flows');
    if (!isRecord(value.flows) || own(value.flows, '$ref')) {
      diagnose(
        'openapi/invalid-oauth-flows',
        flowPointer,
        'OAuth2 flows must be an inline mapping of supported flow declarations.',
        [SCOPE],
      );
      return undefined;
    }
    const scopes = new Set<string>();
    let complete = true;
    for (const [name, flow] of Object.entries(value.flows)) {
      const currentPointer = at(flowPointer, name);
      if (!tick(currentPointer)) return undefined;
      if (name.startsWith('x-')) continue;
      if (!FLOWS.has(name)) {
        diagnose(
          'openapi/unsupported-oauth-flow',
          currentPointer,
          'This OAuth flow field is outside the supported OpenAPI flow definitions.',
          [SCOPE],
        );
        complete = false;
        continue;
      }
      const needsAuthorization = name === 'implicit' || name === 'authorizationCode';
      const needsToken = name !== 'implicit';
      if (
        !isRecord(flow) ||
        own(flow, '$ref') ||
        (needsAuthorization && typeof flow.authorizationUrl !== 'string') ||
        (needsToken && typeof flow.tokenUrl !== 'string') ||
        !isRecord(flow.scopes) ||
        Object.values(flow.scopes).some((description) => typeof description !== 'string')
      ) {
        diagnose(
          'openapi/invalid-oauth-flow',
          currentPointer,
          'The OAuth flow requires its URL fields and an inline mapping of scope names to string descriptions.',
          [SCOPE],
        );
        complete = false;
        continue;
      }
      for (const scope of Object.keys(flow.scopes)) {
        if (!tick(at(at(currentPointer, 'scopes'), scope))) return undefined;
        scopes.add(scope);
      }
    }
    return complete ? scopes : undefined;
  }

  function scheme(name: string): Scheme | undefined {
    if (schemes.has(name)) return schemes.get(name);
    // Absence is handled separately, before resolving this named declaration.
    const located = resolve(schemeMap?.[name], at('/components/securitySchemes', name), 'scheme');
    if (!located) {
      schemes.set(name, undefined);
      return undefined;
    }
    const { value, pointer } = located;
    const type = value.type;
    const validType =
      type === 'apiKey' ||
      type === 'http' ||
      type === 'oauth2' ||
      type === 'openIdConnect' ||
      (version31 && type === 'mutualTLS');
    if (
      !validType ||
      (type === 'apiKey' &&
        (typeof value.name !== 'string' || !['query', 'header', 'cookie'].includes(String(value.in)))) ||
      (type === 'http' && typeof value.scheme !== 'string') ||
      (type === 'openIdConnect' && typeof value.openIdConnectUrl !== 'string')
    ) {
      diagnose(
        'openapi/invalid-security-scheme',
        pointer,
        'The named security scheme has missing or unsupported required fields.',
      );
      schemes.set(name, undefined);
      return undefined;
    }
    const scopes = type === 'oauth2' ? oauthScopes(value, pointer) : undefined;
    const result: Scheme = scopes === undefined ? { type } : { type, scopes };
    schemes.set(name, result);
    return result;
  }

  function requirements(value: unknown, pointer: string, depth: number): void {
    if (!tick(pointer, depth)) return;
    if (!Array.isArray(value)) {
      diagnose('openapi/invalid-security-requirement', pointer, 'Security must be an array of requirement mappings.');
      return;
    }
    for (let index = 0; index < value.length; index++) {
      const requirement = value[index];
      const requirementPointer = at(pointer, index);
      if (!tick(requirementPointer, depth + 1)) return;
      if (!isRecord(requirement)) {
        diagnose(
          'openapi/invalid-security-requirement',
          requirementPointer,
          'Each security alternative must be an inline requirement mapping.',
        );
        continue;
      }
      for (const [name, requested] of Object.entries(requirement)) {
        const requestedPointer = at(requirementPointer, name);
        if (!tick(requestedPointer, depth + 2)) return;
        if (!Array.isArray(requested) || requested.some((scope) => typeof scope !== 'string')) {
          diagnose(
            'openapi/invalid-security-requirement',
            requestedPointer,
            'A security requirement value must be an array of strings.',
          );
          continue;
        }
        if (!schemeMap) continue;
        if (!own(schemeMap, name)) {
          report(SCHEME, requestedPointer);
          continue;
        }
        const declared = scheme(name);
        if (!declared || stopped) continue;
        if (declared.type === 'openIdConnect') {
          if (requested.length > 0)
            diagnose(
              'openapi/openid-scopes-unknown',
              requestedPointer,
              'OpenID scope availability requires discovery data, which this offline analysis does not fetch.',
              [SCOPE],
            );
        } else if (declared.type === 'oauth2') {
          if (!declared.scopes) continue;
          for (let scopeIndex = 0; scopeIndex < requested.length; scopeIndex++) {
            const scopePointer = at(requestedPointer, scopeIndex);
            if (!tick(scopePointer, depth + 3)) return;
            if (!declared.scopes.has(requested[scopeIndex])) report(SCOPE, scopePointer);
          }
        } else if (!version31 && requested.length > 0) {
          diagnose(
            'openapi/invalid-security-requirement',
            requestedPointer,
            'OpenAPI 3.0 requires an empty array for non-OAuth and non-OpenID security schemes.',
          );
        }
      }
    }
  }

  const active = new Set<object>();
  const visitedPaths = new Set<string>();
  const visitedCallbacks = new Set<string>();

  function callback(value: unknown, pointer: string, depth: number): void {
    if (!tick(pointer, depth)) return;
    const located = resolve(value, pointer, 'callback');
    if (!located) return;
    if (active.has(located.value)) {
      diagnose(
        'openapi/cyclic-reference',
        pointer,
        'A recursive callback reference prevents complete local traversal.',
      );
      return;
    }
    if (visitedCallbacks.has(located.pointer)) return;
    visitedCallbacks.add(located.pointer);
    active.add(located.value);
    for (const [expression, path] of Object.entries(located.value)) {
      if (stopped) break;
      if (!expression.startsWith('x-')) pathItem(path, at(located.pointer, expression), depth + 1);
    }
    active.delete(located.value);
  }

  function operation(value: unknown, pointer: string, depth: number): void {
    if (!tick(pointer, depth)) return;
    if (!isRecord(value) || own(value, '$ref')) {
      diagnose(
        'openapi/invalid-operation',
        pointer,
        'An operation must be an inline mapping; operation references are not supported by these OpenAPI versions.',
      );
      return;
    }
    if (own(value, 'security')) requirements(value.security, at(pointer, 'security'), depth + 1);
    if (own(value, 'callbacks')) {
      const callbacksPointer = at(pointer, 'callbacks');
      if (!isRecord(value.callbacks))
        diagnose(
          'openapi/invalid-callbacks',
          callbacksPointer,
          'Operation callbacks must be a mapping of callback declarations.',
        );
      else
        for (const [name, entry] of Object.entries(value.callbacks)) {
          if (stopped) break;
          callback(entry, at(callbacksPointer, name), depth + 1);
        }
    }
  }

  function pathItem(value: unknown, pointer: string, depth: number): void {
    if (!tick(pointer, depth)) return;
    const located = resolve(value, pointer, 'path');
    if (!located) return;
    if (active.has(located.value)) {
      diagnose(
        'openapi/cyclic-reference',
        pointer,
        'A recursive Path Item reference prevents complete local traversal.',
      );
      return;
    }
    if (visitedPaths.has(located.pointer)) return;
    visitedPaths.add(located.pointer);
    active.add(located.value);
    for (const [name, entry] of Object.entries(located.value)) {
      if (stopped) break;
      const entryPointer = at(located.pointer, name);
      if (METHODS.has(name)) operation(entry, entryPointer, depth + 1);
      else if (!['summary', 'description', 'servers', 'parameters'].includes(name) && !name.startsWith('x-')) {
        diagnose(
          'openapi/unsupported-path-field',
          entryPointer,
          'This structural Path Item field is outside the supported OpenAPI interpretation.',
        );
      }
    }
    active.delete(located.value);
  }

  if (own(root, 'security')) requirements(root.security, '/security', 1);
  if (own(root, 'paths')) {
    if (!isRecord(root.paths))
      diagnose('openapi/invalid-paths', '/paths', 'Paths must be a mapping of local Path Item declarations.');
    else
      for (const [name, value] of Object.entries(root.paths)) {
        if (stopped) break;
        if (name.startsWith('x-')) continue;
        if (!name.startsWith('/'))
          diagnose(
            'openapi/invalid-path',
            at('/paths', name),
            'An OpenAPI path field must begin with a forward slash.',
          );
        else pathItem(value, at('/paths', name), 2);
      }
  } else if (!version31) diagnose('openapi/invalid-paths', '/paths', 'OpenAPI 3.0 requires a paths mapping.');
  if (own(root, 'webhooks')) {
    if (!version31)
      diagnose(
        'openapi/unsupported-webhooks',
        '/webhooks',
        'Top-level webhooks are supported only for OpenAPI 3.1 inputs.',
      );
    else if (!isRecord(root.webhooks))
      diagnose('openapi/invalid-webhooks', '/webhooks', 'Webhooks must be a mapping of Path Item declarations.');
    else
      for (const [name, value] of Object.entries(root.webhooks)) {
        if (stopped) break;
        pathItem(value, at('/webhooks', name), 2);
      }
  }
  return { issues, diagnostics };
}
