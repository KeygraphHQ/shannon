#!/usr/bin/env node

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'node:path';
import fs from 'node:fs';
import { scanRoutes } from './routes/scans.js';
import { closeDb } from './db.js';
import { closeTemporalConnection } from './temporal-client.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(fastifyCors, { origin: true });

  // API routes
  await app.register(scanRoutes);

  // Serve Vue frontend static files
  const staticDir = path.join(import.meta.dirname, '..', '..', 'web', 'dist');
  if (fs.existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler((_request, reply) => {
      const indexPath = path.join(staticDir, 'index.html');
      return reply.type('text/html').send(fs.createReadStream(indexPath));
    });
  } else {
    app.get('/', async () => {
      return { status: 'ok', message: 'Shannon Web API. Frontend not built yet.' };
    });
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down...');
    await app.close();
    closeDb();
    await closeTemporalConnection();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Ensure data directory exists for SQLite
  const dataDir = process.env.SHANNON_DB_PATH
    ? path.dirname(process.env.SHANNON_DB_PATH)
    : path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await app.listen({ port: PORT, host: HOST });
  console.log(`Shannon Web running at http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
