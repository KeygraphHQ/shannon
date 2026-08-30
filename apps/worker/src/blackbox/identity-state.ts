// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import path from 'node:path';

import { atomicWrite, ensureDirectory, readJson } from '../utils/file-io.js';

const IDENTITY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const CAPTURE_INDEX_VERSION = 1;

export interface IdentityStateResolver {
  isKnownIdentity(identity: string): boolean;
  getCookieHeader(identity: string, target: URL): Promise<string | null>;
  getLatestExchangeId(identity: string, routeSignature: string): Promise<string | null>;
}

export interface CaptureIndexEntry {
  readonly exchangeId: string;
  readonly routeSignature: string;
  readonly captureSequence: number;
}

export interface FileIdentityStateResolverOptions {
  readonly targetRoot: string;
  readonly identities: readonly string[];
  readonly now?: () => number;
}

interface StorageCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires: number;
  readonly secure: boolean;
}

interface CaptureIndexDocument {
  readonly version: 1;
  readonly identity: string;
  readonly entries: readonly CaptureIndexEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Invalid ${label}: unknown field ${key}`);
  }
}

function assertString(value: unknown, label: string, options: { allowEmpty?: boolean } = {}): asserts value is string {
  if (typeof value !== 'string' || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`Invalid ${label}: expected ${options.allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) throw new Error(`Invalid ${label}: control characters are not allowed`);
  }
}

function parseStorageState(value: unknown): readonly StorageCookie[] {
  if (!isRecord(value)) throw new Error('Invalid Playwright storage state: expected an object');
  assertExactKeys(value, ['cookies', 'origins'], 'Playwright storage state');
  if (!Array.isArray(value.cookies)) throw new Error('Invalid Playwright storage state: cookies must be an array');
  if (!Array.isArray(value.origins)) throw new Error('Invalid Playwright storage state: origins must be an array');

  for (const [index, origin] of value.origins.entries()) {
    if (!isRecord(origin)) throw new Error(`Invalid Playwright storage state origin at index ${index}`);
    assertExactKeys(origin, ['origin', 'localStorage'], `Playwright storage state origin at index ${index}`);
    assertString(origin.origin, `Playwright storage state origin at index ${index}.origin`);
    if (!Array.isArray(origin.localStorage)) {
      throw new Error(`Invalid Playwright storage state origin at index ${index}.localStorage`);
    }
    for (const [storageIndex, entry] of origin.localStorage.entries()) {
      if (!isRecord(entry)) throw new Error(`Invalid Playwright localStorage entry at index ${storageIndex}`);
      assertExactKeys(entry, ['name', 'value'], `Playwright localStorage entry at index ${storageIndex}`);
      assertString(entry.name, `Playwright localStorage entry at index ${storageIndex}.name`);
      assertString(entry.value, `Playwright localStorage entry at index ${storageIndex}.value`, { allowEmpty: true });
    }
  }

  return value.cookies.map((cookie, index) => {
    if (!isRecord(cookie)) throw new Error(`Invalid Playwright cookie at index ${index}`);
    assertExactKeys(
      cookie,
      ['name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite'],
      `Playwright cookie at index ${index}`,
    );
    assertString(cookie.name, `Playwright cookie at index ${index}.name`);
    assertString(cookie.value, `Playwright cookie at index ${index}.value`, { allowEmpty: true });
    assertString(cookie.domain, `Playwright cookie at index ${index}.domain`);
    assertString(cookie.path, `Playwright cookie at index ${index}.path`);
    if (!cookie.path.startsWith('/')) throw new Error(`Invalid Playwright cookie at index ${index}.path`);
    if (typeof cookie.expires !== 'number' || !Number.isFinite(cookie.expires) || cookie.expires < -1) {
      throw new Error(`Invalid Playwright cookie at index ${index}.expires`);
    }
    if (typeof cookie.secure !== 'boolean') throw new Error(`Invalid Playwright cookie at index ${index}.secure`);
    if (cookie.httpOnly !== undefined && typeof cookie.httpOnly !== 'boolean') {
      throw new Error(`Invalid Playwright cookie at index ${index}.httpOnly`);
    }
    if (
      cookie.sameSite !== undefined &&
      cookie.sameSite !== 'Strict' &&
      cookie.sameSite !== 'Lax' &&
      cookie.sameSite !== 'None'
    ) {
      throw new Error(`Invalid Playwright cookie at index ${index}.sameSite`);
    }
    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.secure,
    };
  });
}

function isDomainMatch(cookieDomain: string, hostname: string): boolean {
  const isDomainCookie = cookieDomain.startsWith('.');
  const domain = isDomainCookie ? cookieDomain.slice(1) : cookieDomain;
  const host = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  return host === domain || (isDomainCookie && host.endsWith(`.${domain}`));
}

function isPathMatch(cookiePath: string, requestPath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function validateOpaqueValue(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function parseCaptureIndex(value: unknown, identity: string): CaptureIndexDocument {
  if (!isRecord(value)) throw new Error('Invalid capture index: expected an object');
  assertExactKeys(value, ['version', 'identity', 'entries'], 'capture index');
  if (value.version !== CAPTURE_INDEX_VERSION) throw new Error('Unsupported capture index version');
  if (value.identity !== identity) throw new Error('Capture index identity does not match its path');
  if (!Array.isArray(value.entries)) throw new Error('Invalid capture index: entries must be an array');

  const entries = value.entries.map((entry, index): CaptureIndexEntry => {
    if (!isRecord(entry)) throw new Error(`Invalid capture index entry at index ${index}`);
    assertExactKeys(
      entry,
      ['exchangeId', 'routeSignature', 'captureSequence'],
      `capture index entry at index ${index}`,
    );
    const exchangeId = entry.exchangeId;
    const routeSignature = entry.routeSignature;
    const captureSequence = entry.captureSequence;
    validateOpaqueValue(exchangeId, `capture index entry at index ${index}.exchangeId`);
    validateOpaqueValue(routeSignature, `capture index entry at index ${index}.routeSignature`);
    if (typeof captureSequence !== 'number' || !Number.isSafeInteger(captureSequence) || captureSequence < 1) {
      throw new Error(`Invalid capture index entry at index ${index}.captureSequence`);
    }
    return {
      exchangeId,
      routeSignature,
      captureSequence,
    };
  });

  return { version: CAPTURE_INDEX_VERSION, identity, entries };
}

function validateIdentity(identity: unknown): asserts identity is string {
  if (typeof identity !== 'string' || !IDENTITY_PATTERN.test(identity)) {
    throw new Error(`Invalid identity: ${String(identity)}`);
  }
}

export class FileIdentityStateResolver implements IdentityStateResolver {
  private readonly targetRoot: string;
  private readonly identityDirectories: ReadonlyMap<string, string>;
  private readonly now: () => number;

  public constructor(options: FileIdentityStateResolverOptions) {
    if (!isRecord(options) || typeof options.targetRoot !== 'string' || options.targetRoot.length === 0) {
      throw new Error('Invalid identity state target root');
    }
    if (!Array.isArray(options.identities)) throw new Error('Invalid identity state identities');

    this.targetRoot = path.resolve(options.targetRoot);
    this.now = options.now ?? Date.now;
    if (typeof this.now !== 'function') throw new Error('Invalid identity state clock');

    const identityDirectories = new Map<string, string>();
    for (const identity of options.identities) {
      validateIdentity(identity);
      if (identityDirectories.has(identity)) throw new Error(`Duplicate identity: ${identity}`);
      const directory = path.resolve(this.targetRoot, '.shannon', 'blackbox', 'identities', identity);
      this.assertContained(directory);
      identityDirectories.set(identity, directory);
    }
    this.identityDirectories = identityDirectories;
  }

  public isKnownIdentity(identity: string): boolean {
    return typeof identity === 'string' && this.identityDirectories.has(identity);
  }

  public async getCookieHeader(identity: string, target: URL): Promise<string | null> {
    const directory = this.requireIdentity(identity);
    if (!(target instanceof URL) || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
      throw new Error('Invalid cookie target URL');
    }

    let storageState: unknown;
    try {
      storageState = await readJson(path.join(directory, 'storage-state.json'));
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw new Error(`Unable to read storage state for identity ${identity}`, { cause: error });
    }
    const cookies = parseStorageState(storageState);
    const nowSeconds = this.now() / 1000;
    if (!Number.isFinite(nowSeconds)) throw new Error('Invalid identity state clock value');

    const matching = cookies
      .map((cookie, index) => ({ cookie, index }))
      .filter(({ cookie }) => {
        if (cookie.secure && target.protocol !== 'https:') return false;
        if (!isDomainMatch(cookie.domain.toLowerCase(), target.hostname.toLowerCase())) return false;
        if (!isPathMatch(cookie.path, target.pathname)) return false;
        return cookie.expires === -1 || cookie.expires > nowSeconds;
      })
      .sort((left, right) => right.cookie.path.length - left.cookie.path.length || left.index - right.index);

    if (matching.length === 0) return null;
    return matching.map(({ cookie }) => `${cookie.name}=${cookie.value}`).join('; ');
  }

  public async getLatestExchangeId(identity: string, routeSignature: string): Promise<string | null> {
    const directory = this.requireIdentity(identity);
    if (typeof routeSignature !== 'string' || routeSignature.length === 0) return null;

    let indexFile: unknown;
    try {
      indexFile = await readJson(path.join(directory, 'capture-index.json'));
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw new Error(`Unable to read capture index for identity ${identity}`, { cause: error });
    }
    const document = parseCaptureIndex(indexFile, identity);
    let latest: CaptureIndexEntry | null = null;
    for (const entry of document.entries) {
      if (
        entry.routeSignature === routeSignature &&
        (latest === null || entry.captureSequence >= latest.captureSequence)
      ) {
        latest = entry;
      }
    }
    return latest?.exchangeId ?? null;
  }

  public async writeCaptureIndex(identity: string, entries: readonly CaptureIndexEntry[]): Promise<void> {
    const directory = this.requireIdentity(identity);
    if (!Array.isArray(entries)) throw new Error('Invalid capture index entries');

    // Re-parse a redacted projection so caller-provided fields never reach disk.
    const redactedEntries = entries.map((entry, index) => {
      if (!isRecord(entry)) throw new Error(`Invalid capture index entry at index ${index}`);
      return {
        exchangeId: entry.exchangeId,
        routeSignature: entry.routeSignature,
        captureSequence: entry.captureSequence,
      };
    });
    const document = parseCaptureIndex(
      { version: CAPTURE_INDEX_VERSION, identity, entries: redactedEntries },
      identity,
    );
    await ensureDirectory(directory);
    this.assertContained(path.join(directory, 'capture-index.json'));
    await atomicWrite(path.join(directory, 'capture-index.json'), document);
  }

  private requireIdentity(identity: string): string {
    if (!this.isKnownIdentity(identity)) throw new Error(`Unknown identity: ${identity}`);
    const directory = this.identityDirectories.get(identity);
    if (!directory) throw new Error(`Unknown identity: ${identity}`);
    this.assertContained(directory);
    return directory;
  }

  private assertContained(candidate: string): void {
    const relative = path.relative(this.targetRoot, candidate);
    if (relative === '' || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
      throw new Error('Identity state path escapes target root');
    }
  }
}
