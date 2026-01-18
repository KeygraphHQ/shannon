/**
 * Shannon Service Entry Point
 * Starts the HTTP service with graceful shutdown handling
 */

import dotenv from 'dotenv';
import { buildApp } from './app.js';
import { disconnectPrisma, checkDatabaseHealth } from './db.js';
import { disconnectTemporal, checkTemporalHealth } from './temporal-client.js';
import { startReportWorker, stopReportWorker } from './workers/report-worker.js';

// Load environment variables
dotenv.config();

// Configuration
const PORT = parseInt(process.env.SERVICE_PORT || '3100', 10);
const HOST = process.env.SERVICE_HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Service info
const SERVICE_NAME = 'shannon-service';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';

/**
 * Perform startup health checks
 */
async function performHealthChecks(): Promise<{
  database: boolean;
  temporal: boolean;
}> {
  console.log('Performing startup health checks...');

  const [database, temporal] = await Promise.all([
    checkDatabaseHealth(),
    checkTemporalHealth(),
  ]);

  console.log(`  Database: ${database ? 'OK' : 'FAILED'}`);
  console.log(`  Temporal: ${temporal ? 'OK' : 'FAILED'}`);

  return { database, temporal };
}

/**
 * Start the service
 */
async function start(): Promise<void> {
  console.log(`\n${SERVICE_NAME} v${SERVICE_VERSION}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log('');

  // Build the Fastify app
  const app = await buildApp({
    logger: NODE_ENV !== 'test',
    trustProxy: true,
  });

  // Perform health checks (non-blocking for startup)
  const healthStatus = await performHealthChecks();

  if (!healthStatus.database) {
    console.warn('WARNING: Database is not available. Service will start but database operations will fail.');
  }

  if (!healthStatus.temporal) {
    console.warn('WARNING: Temporal is not available. Scan requests will be queued.');
  }

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

    try {
      // Stop background workers
      stopReportWorker();
      console.log('  Report worker stopped');

      // Stop accepting new connections
      await app.close();
      console.log('  HTTP server closed');

      // Disconnect from services
      await Promise.all([
        disconnectPrisma().then(() => console.log('  Database disconnected')),
        disconnectTemporal().then(() => console.log('  Temporal disconnected')),
      ]);

      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejection, just log
  });

  // Start listening
  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log('');
    console.log(`Service started successfully!`);
    console.log(`  Address: ${address}`);
    console.log(`  API Docs: ${address}/docs`);
    console.log(`  Health: ${address}/health`);
    console.log('');

    // Start background workers
    if (healthStatus.database) {
      startReportWorker();
      console.log('  Report worker started');
    } else {
      console.warn('  Report worker NOT started (database unavailable)');
    }
    console.log('');
  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Start the service
start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
