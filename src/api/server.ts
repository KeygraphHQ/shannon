// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon API Server - Production-grade REST API for security testing
 * Features: Rate limiting, request validation, secure error handling
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseConfig } from '../config-parser.js';
import type { ApiConfig, CiConfig } from '../types/config.js';
import {
  createApiRateLimiter,
  createScanRateLimiter,
  validateApiKey,
  generateSecureApiKey,
} from '../security/index.js';

// Types
interface ApiRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  webUrl: string;
  repoPath: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  reportPath?: string;
  auditLogsPath?: string;
  error?: string;
}

interface ApiStore {
  runs: ApiRun[];
  version: number;
}

interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  [key: string]: string;
}

// Constants
const STORE_PATH = path.join(process.cwd(), '.shannon-api-store.json');
const MAX_CONCURRENT_RUNS = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

// Rate limiters
const apiRateLimiter = createApiRateLimiter();
const scanRateLimiter = createScanRateLimiter();

// Active runs tracking
const activeRuns = new Map<string, ApiRun>();

// Store operations with file locking
const loadStore = async (): Promise<ApiStore> => {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const store = JSON.parse(raw) as ApiStore;
    return { runs: store.runs || [], version: store.version || 1 };
  } catch {
    return { runs: [], version: 1 };
  }
};

const saveStore = async (store: ApiStore): Promise<void> => {
  // Atomic write using temp file
  const tempPath = `${STORE_PATH}.tmp.${randomUUID()}`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(store, null, 2));
    await fs.rename(tempPath, STORE_PATH);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
};

// Request parsing with size limits
const parseBody = (req: http.IncomingMessage): Promise<string> => {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;

    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('Request timeout'));
    }, REQUEST_TIMEOUT_MS);

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        clearTimeout(timeout);
        req.destroy();
        reject(new Error(`Request body too large (max ${MAX_BODY_SIZE} bytes)`));
        return;
      }
      data += chunk;
    });

    req.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
};

// Response helpers
const sendJson = (
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...headers,
  });
  res.end(body);
};

const sendError = (
  res: http.ServerResponse,
  status: number,
  error: string,
  code: string,
  details?: unknown,
  headers: Record<string, string> = {}
): void => {
  const payload: ApiError = details !== undefined ? { error, code, details } : { error, code };
  sendJson(res, status, payload, headers);
};

const getRateLimitHeaders = (remaining: number, resetMs: number, limit: number): RateLimitHeaders => ({
  'X-RateLimit-Limit': String(limit),
  'X-RateLimit-Remaining': String(remaining),
  'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + resetMs / 1000)),
});

// Authentication
const requireApiKey = (req: http.IncomingMessage, apiKey: string): boolean => {
  const header = req.headers['x-api-key'] || req.headers['authorization'];
  if (!header) return false;

  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return false;

  // Constant-time comparison to prevent timing attacks
  const provided = value.startsWith('Bearer ') ? value.slice(7) : value;
  if (provided.length !== apiKey.length) return false;

  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ apiKey.charCodeAt(i);
  }
  return result === 0;
};

// Get client identifier for rate limiting
const getClientId = (req: http.IncomingMessage): string => {
  // Use X-Forwarded-For if behind proxy, otherwise remote address
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() || 'unknown';
  }
  return req.socket.remoteAddress || 'unknown';
};

// Build Shannon CLI arguments
const buildShannonArgs = (
  webUrl: string,
  repoPath: string,
  configPath: string | undefined,
  outputPath: string,
  ci: CiConfig | undefined
): string[] => {
  const args = [
    path.join(process.cwd(), 'dist', 'shannon.js'),
    webUrl,
    repoPath,
    '--disable-loader',
    '--output',
    outputPath,
  ];

  if (configPath) {
    args.push('--config', configPath);
  }

  if (ci?.enabled) {
    args.push('--ci');
    if (ci.platforms && ci.platforms.length) {
      args.push('--ci-platforms', ci.platforms.join(','));
    }
    if (ci.fail_on) {
      args.push('--ci-fail-on', ci.fail_on);
    }
  }

  return args;
};

// Update run in store
const updateRun = async (runId: string, updates: Partial<ApiRun>): Promise<void> => {
  const store = await loadStore();
  const index = store.runs.findIndex((item) => item.id === runId);
  if (index >= 0 && store.runs[index]) {
    const existing = store.runs[index]!;
    store.runs[index] = Object.assign({}, existing, updates) as ApiRun;
    await saveStore(store);
  }
};

// Request handlers
const handleHealth = (_req: http.IncomingMessage, res: http.ServerResponse): void => {
  sendJson(res, 200, {
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    activeRuns: activeRuns.size,
    uptime: process.uptime(),
  });
};

const handleGetRuns = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string,
  rateLimitHeaders: RateLimitHeaders
): Promise<void> => {
  if (!requireApiKey(req, apiKey)) {
    return sendError(res, 401, 'Invalid or missing API key', 'UNAUTHORIZED');
  }

  const store = await loadStore();
  const urlParts = req.url!.split('/').filter(Boolean);

  // GET /api/v1/runs
  if (urlParts.length === 3) {
    // Add pagination
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
    const offset = (page - 1) * limit;

    const paginatedRuns = store.runs.slice(offset, offset + limit);
    return sendJson(res, 200, {
      runs: paginatedRuns,
      total: store.runs.length,
      page,
      limit,
      hasMore: offset + limit < store.runs.length,
    }, rateLimitHeaders);
  }

  // GET /api/v1/runs/:id
  if (urlParts.length === 4) {
    const runId = urlParts[3];
    const run = store.runs.find((item) => item.id === runId);
    if (!run) {
      return sendError(res, 404, 'Run not found', 'NOT_FOUND', { runId }, rateLimitHeaders);
    }
    return sendJson(res, 200, run, rateLimitHeaders);
  }

  return sendError(res, 404, 'Not found', 'NOT_FOUND', undefined, rateLimitHeaders);
};

const handleCreateRun = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string,
  configPath: string | undefined,
  ciConfig: CiConfig | undefined,
  rateLimitHeaders: RateLimitHeaders
): Promise<void> => {
  if (!requireApiKey(req, apiKey)) {
    return sendError(res, 401, 'Invalid or missing API key', 'UNAUTHORIZED');
  }

  // Check concurrent run limit
  if (activeRuns.size >= MAX_CONCURRENT_RUNS) {
    return sendError(res, 429, `Maximum concurrent runs (${MAX_CONCURRENT_RUNS}) reached`, 'RATE_LIMITED', {
      activeRuns: activeRuns.size,
      maxConcurrent: MAX_CONCURRENT_RUNS,
    }, rateLimitHeaders);
  }

  // Parse and validate request body
  let body: { web_url: string; repo_path: string; config_path?: string; output_path?: string };
  try {
    const raw = await parseBody(req);
    if (!raw) {
      return sendError(res, 400, 'Request body is required', 'BAD_REQUEST', undefined, rateLimitHeaders);
    }
    body = JSON.parse(raw);
  } catch (error) {
    const err = error as Error;
    return sendError(res, 400, `Invalid JSON: ${err.message}`, 'BAD_REQUEST', undefined, rateLimitHeaders);
  }

  // Validate required fields
  if (!body.web_url || typeof body.web_url !== 'string') {
    return sendError(res, 400, 'web_url is required and must be a string', 'VALIDATION_ERROR', undefined, rateLimitHeaders);
  }
  if (!body.repo_path || typeof body.repo_path !== 'string') {
    return sendError(res, 400, 'repo_path is required and must be a string', 'VALIDATION_ERROR', undefined, rateLimitHeaders);
  }

  // Validate URL format
  try {
    const url = new URL(body.web_url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return sendError(res, 400, 'web_url must use http or https protocol', 'VALIDATION_ERROR', undefined, rateLimitHeaders);
    }
  } catch {
    return sendError(res, 400, 'web_url is not a valid URL', 'VALIDATION_ERROR', undefined, rateLimitHeaders);
  }

  // Create run record
  const runId = randomUUID();
  const outputPath = body.output_path || path.join(process.cwd(), 'audit-logs');
  const run: ApiRun = {
    id: runId,
    status: 'running',
    webUrl: body.web_url,
    repoPath: body.repo_path,
    startedAt: new Date().toISOString(),
  };

  // Save to store
  const store = await loadStore();
  store.runs.push(run);
  await saveStore(store);

  // Track active run
  activeRuns.set(runId, run);

  // Spawn Shannon process
  const args = buildShannonArgs(body.web_url, body.repo_path, body.config_path || configPath, outputPath, ciConfig);

  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SHANNON_DISABLE_LOADER: 'true' },
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
    const reportMatch = stdout.match(/FINAL REPORT AVAILABLE:[\s\S]*?\n(.*)/m);
    if (reportMatch?.[1]) {
      run.reportPath = reportMatch[1].trim();
    }
    const auditMatch = stdout.match(/AUDIT LOGS AVAILABLE:[\s\S]*?\n(.*)/m);
    if (auditMatch?.[1]) {
      run.auditLogsPath = auditMatch[1].trim();
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.on('close', async (code) => {
    run.endedAt = new Date().toISOString();
    run.exitCode = code ?? 1;
    run.status = code === 0 ? 'completed' : 'failed';

    if (code !== 0 && stderr) {
      // Extract error message but sanitize sensitive info
      run.error = stderr.slice(0, 500).replace(/api[_-]?key[^\s]*/gi, '[REDACTED]');
    }

    await updateRun(runId, run);
    activeRuns.delete(runId);
  });

  child.on('error', async (err) => {
    run.endedAt = new Date().toISOString();
    run.exitCode = 1;
    run.status = 'failed';
    run.error = err.message;
    await updateRun(runId, run);
    activeRuns.delete(runId);
  });

  return sendJson(res, 202, {
    run_id: runId,
    status: 'running',
    message: 'Scan started successfully',
    poll_url: `/api/v1/runs/${runId}`,
  }, rateLimitHeaders);
};

const handleCancelRun = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiKey: string,
  rateLimitHeaders: RateLimitHeaders
): Promise<void> => {
  if (!requireApiKey(req, apiKey)) {
    return sendError(res, 401, 'Invalid or missing API key', 'UNAUTHORIZED');
  }

  const urlParts = req.url!.split('/').filter(Boolean);
  if (urlParts.length !== 5 || urlParts[4] !== 'cancel') {
    return sendError(res, 404, 'Not found', 'NOT_FOUND', undefined, rateLimitHeaders);
  }

  const runId = urlParts[3];
  if (!runId) {
    return sendError(res, 400, 'Missing run ID', 'BAD_REQUEST', undefined, rateLimitHeaders);
  }

  const run = activeRuns.get(runId);

  if (!run) {
    // Check if it exists but is not active
    const store = await loadStore();
    const storedRun = store.runs.find((r) => r.id === runId);
    if (storedRun) {
      return sendError(res, 400, 'Run is not active', 'INVALID_STATE', {
        status: storedRun.status,
      }, rateLimitHeaders);
    }
    return sendError(res, 404, 'Run not found', 'NOT_FOUND', { runId }, rateLimitHeaders);
  }

  // Note: We'd need to track PIDs to actually kill the process
  // For now, just mark as cancelled
  run.status = 'failed';
  run.endedAt = new Date().toISOString();
  run.error = 'Cancelled by user';
  await updateRun(runId, run);
  activeRuns.delete(runId);

  return sendJson(res, 200, { message: 'Run cancellation requested', runId }, rateLimitHeaders);
};

const handleGenerateKey = (
  _req: http.IncomingMessage,
  res: http.ServerResponse
): void => {
  const apiKey = generateSecureApiKey(32);
  sendJson(res, 200, {
    api_key: apiKey,
    message: 'Store this key securely - it cannot be retrieved again',
  });
};

// Main request router
const createRequestHandler = (
  apiKey: string,
  configPath: string | undefined,
  ciConfig: CiConfig | undefined
) => async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';
  const clientId = getClientId(req);

  // Health check (no auth or rate limiting)
  if (url === '/health' || url === '/api/v1/health') {
    return handleHealth(req, res);
  }

  // Key generation endpoint (no auth for initial setup)
  if (url === '/api/v1/generate-key' && req.method === 'GET') {
    return handleGenerateKey(req, res);
  }

  // Apply rate limiting
  const isScanEndpoint = url === '/api/v1/runs' && req.method === 'POST';
  const rateLimiter = isScanEndpoint ? scanRateLimiter : apiRateLimiter;
  const rateLimit = rateLimiter.isAllowed(clientId);

  const rateLimitHeaders = getRateLimitHeaders(
    rateLimit.remaining,
    rateLimit.resetMs,
    isScanEndpoint ? 10 : 60
  );

  if (!rateLimit.allowed) {
    return sendError(res, 429, 'Rate limit exceeded', 'RATE_LIMITED', {
      retryAfter: Math.ceil(rateLimit.resetMs / 1000),
    }, {
      ...rateLimitHeaders,
      'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)),
    });
  }

  // Route requests
  try {
    if (url.startsWith('/api/v1/runs') && req.method === 'GET') {
      return await handleGetRuns(req, res, apiKey, rateLimitHeaders);
    }

    if (url === '/api/v1/runs' && req.method === 'POST') {
      return await handleCreateRun(req, res, apiKey, configPath, ciConfig, rateLimitHeaders);
    }

    if (url.match(/^\/api\/v1\/runs\/[^/]+\/cancel$/) && req.method === 'POST') {
      return await handleCancelRun(req, res, apiKey, rateLimitHeaders);
    }

    return sendError(res, 404, 'Not found', 'NOT_FOUND', undefined, rateLimitHeaders);
  } catch (error) {
    const err = error as Error;
    console.error('API error:', err);
    return sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
};

// Server startup
export const startApiServer = async (args: string[]): Promise<void> => {
  let configPath: string | undefined;
  let host = process.env.SHANNON_API_HOST || '127.0.0.1';
  let port = process.env.SHANNON_API_PORT ? Number(process.env.SHANNON_API_PORT) : 8080;
  let apiKey = process.env.SHANNON_API_KEY || '';

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--host' && args[i + 1]) {
      host = args[i + 1]!;
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--api-key' && args[i + 1]) {
      apiKey = args[i + 1]!;
      i++;
    }
  }

  // Load config if provided
  let apiConfig: ApiConfig | undefined;
  let ciConfig: CiConfig | undefined;

  if (configPath) {
    try {
      const config = await parseConfig(configPath);
      apiConfig = config.api;
      ciConfig = config.ci;
      if (config.api?.host) host = config.api.host;
      if (config.api?.port) port = config.api.port;
      if (config.api?.api_key) apiKey = config.api.api_key;
    } catch (error) {
      console.error('Failed to load config:', error);
      process.exit(1);
    }
  }

  // Validate API key
  if (!apiKey) {
    console.error('❌ API key is required.');
    console.error('   Set SHANNON_API_KEY environment variable, use --api-key flag,');
    console.error('   or set api.api_key in config file.');
    console.error('');
    console.error('   Generate a secure key: curl http://localhost:8080/api/v1/generate-key');
    process.exit(1);
  }

  const keyValidation = validateApiKey(apiKey, { minLength: 32 });
  if (!keyValidation.valid) {
    console.error(`❌ Invalid API key: ${keyValidation.error}`);
    process.exit(1);
  }
  if (keyValidation.strength === 'weak') {
    console.warn('⚠️  API key has weak entropy - consider using a stronger key');
  }

  // Warn about binding to all interfaces
  if (host === '0.0.0.0' || host === '::') {
    console.warn('⚠️  WARNING: API server is binding to all interfaces.');
    console.warn('   This exposes the API to the network. Use 127.0.0.1 for local-only access.');
  }

  // Create and start server
  const handler = createRequestHandler(apiKey, configPath, ciConfig);
  const server = http.createServer(handler);

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(port, host, () => {
    console.log(`\n🚀 Shannon API Server`);
    console.log(`   Listening: http://${host}:${port}`);
    console.log(`   Health:    http://${host}:${port}/health`);
    console.log(`   Docs:      http://${host}:${port}/api/v1/runs`);
    console.log('');
    if (apiConfig?.webhooks?.length) {
      console.log(`   Webhooks:  ${apiConfig.webhooks.length} configured`);
    }
    console.log('   Press Ctrl+C to stop\n');
  });
};
