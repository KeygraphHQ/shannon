/**
 * Prisma Client Singleton for Shannon Service
 * Provides database access for the service layer
 *
 * Note: Requires `npx prisma generate` to be run in the web directory
 * before the client can be used.
 *
 * Prisma 7.x requires the @prisma/adapter-pg for PostgreSQL connections.
 */

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Use dynamic import to avoid compile-time errors when Prisma client isn't generated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PrismaClient: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaInstance: any = null;
let pgPool: pg.Pool | null = null;

/**
 * Initialize the Prisma client dynamically
 */
async function initPrisma(): Promise<void> {
  if (!PrismaClient) {
    try {
      // Dynamic import with type assertion for ESM compatibility
      const prismaModule = await import('@prisma/client') as { PrismaClient?: any; default?: { PrismaClient?: any } };
      // Handle both ESM and CJS module exports
      PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient || prismaModule.default;
      if (!PrismaClient) {
        throw new Error('PrismaClient not found in @prisma/client module');
      }
    } catch (error) {
      console.error('Failed to load Prisma client. Run: cd web && npx prisma generate');
      throw error;
    }
  }
}

/**
 * Get the Prisma client singleton
 * Creates a new instance if one doesn't exist
 */
export async function getPrismaClient(): Promise<any> {
  await initPrisma();
  if (!prismaInstance) {
    // Create pg pool for Prisma 7.x adapter
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ghostshell';
    pgPool = new pg.Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pgPool);

    prismaInstance = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }
  return prismaInstance;
}

/**
 * Get the Prisma client singleton synchronously
 * Throws if not initialized - call getPrismaClient() first
 */
export function getPrismaClientSync(): any {
  if (!prismaInstance) {
    throw new Error('Prisma client not initialized. Call getPrismaClient() first.');
  }
  return prismaInstance;
}

/**
 * Disconnect the Prisma client
 * Should be called during graceful shutdown
 */
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

/**
 * Check database connectivity
 * Returns true if database is reachable
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = await getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Lazy-initialized proxy for convenience
// Note: This will throw if used before getPrismaClient() is called
export const prisma = new Proxy({} as any, {
  get(target, prop) {
    if (!prismaInstance) {
      throw new Error('Prisma client not initialized. Call getPrismaClient() first.');
    }
    return prismaInstance[prop];
  },
});

export default prisma;
