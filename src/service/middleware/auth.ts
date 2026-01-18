/**
 * API Key Authentication Middleware
 * Validates API keys and sets organization context on requests
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { errors } from './error-handler.js';
import { API_KEY_SCOPES, APIKeyScope } from '../types/api.js';
import { prisma } from '../db.js';

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract API key from Authorization header
 * Supports: Bearer sk_live_xxx or just sk_live_xxx
 */
function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  // Support "Bearer <key>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Support raw key format
  if (authHeader.startsWith('sk_')) {
    return authHeader;
  }

  return null;
}

/**
 * Check if the API key has the required scope
 */
export function hasScope(scopes: string[], required: APIKeyScope): boolean {
  // Admin scope grants all permissions
  if (scopes.includes('admin:*')) return true;

  return scopes.includes(required);
}

/**
 * Create scope check decorator
 */
export function requireScope(scope: APIKeyScope) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.scopes || !hasScope(request.scopes, scope)) {
      throw errors.insufficientScope(scope);
    }
  };
}

/**
 * Authentication hook for validating API keys
 */
async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = extractApiKey(request.headers.authorization);

  if (!apiKey) {
    throw errors.missingApiKey(request);
  }

  // Hash the key for lookup
  const keyHash = hashApiKey(apiKey);
  const keyPrefix = apiKey.slice(0, 8);

  try {
    // Look up the API key
    const apiKeyRecord = await prisma.aPIKey.findUnique({
      where: { keyHash },
      include: {
        organization: {
          select: {
            id: true,
            deletedAt: true,
          },
        },
      },
    });

    // Key not found
    if (!apiKeyRecord) {
      request.log.warn({ keyPrefix }, 'API key not found');
      throw errors.invalidApiKey(request);
    }

    // Check if key is revoked
    if (apiKeyRecord.revokedAt) {
      request.log.warn({ keyPrefix }, 'API key is revoked');
      throw errors.invalidApiKey(request);
    }

    // Check if key is expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      request.log.warn({ keyPrefix }, 'API key is expired');
      throw errors.expiredApiKey(request);
    }

    // Check if organization is deleted
    if (apiKeyRecord.organization.deletedAt) {
      request.log.warn({ keyPrefix }, 'Organization is deleted');
      throw errors.invalidApiKey(request);
    }

    // Set request context
    request.organizationId = apiKeyRecord.organizationId;
    request.apiKeyId = apiKeyRecord.id;
    request.scopes = apiKeyRecord.scopes;

    // Update last used timestamp (fire and forget)
    prisma.aPIKey
      .update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err: unknown) => {
        request.log.error({ err }, 'Failed to update API key last used timestamp');
      });

    request.log.info(
      { organizationId: apiKeyRecord.organizationId, keyPrefix },
      'Request authenticated'
    );
  } catch (error) {
    // Re-throw ServiceErrors
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ServiceError') {
      throw error;
    }

    // Log and throw generic error for database issues
    request.log.error({ err: error }, 'Authentication error');
    throw errors.invalidApiKey(request);
  }
}

/**
 * Register authentication plugin
 */
export async function authPlugin(app: FastifyInstance): Promise<void> {
  // Add authentication hook to all routes under /api/
  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for health and docs endpoints
    const skipAuth = ['/health', '/health/', '/docs', '/metrics', '/api/v1/info'];
    const skipPrefixes = ['/health/', '/docs/'];

    if (
      skipAuth.includes(request.url) ||
      skipPrefixes.some((prefix) => request.url.startsWith(prefix))
    ) {
      return;
    }

    // Require auth for API routes
    if (request.url.startsWith('/api/')) {
      await authenticate(request, reply);
    }
  });
}

/**
 * Generate a new API key
 * Returns the full key (only shown once) and the hash for storage
 */
export function generateApiKey(organizationId: string): {
  key: string;
  keyPrefix: string;
  keyHash: string;
} {
  // Generate 32 random bytes
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Format: sk_live_{orgIdPrefix}_{random}
  const orgPrefix = organizationId.slice(0, 8);
  const key = `sk_live_${orgPrefix}_${randomHex}`;
  const keyPrefix = key.slice(0, 8);
  const keyHash = hashApiKey(key);

  return { key, keyPrefix, keyHash };
}

export default authPlugin;
