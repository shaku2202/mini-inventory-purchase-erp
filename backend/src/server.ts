import { env } from './config/env.js';
import { createApp } from './app.js';
import { closePool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  // Forward-only migrations are idempotent and guarded by an advisory lock,
  // so running them on boot is safe even with several instances.
  await runMigrations();

  const server = createApp().listen(env.port, () => {
    logger.info(`ERP API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Graceful shutdown: stop accepting connections, finish in-flight requests, close the pool.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.fatal(error, 'Failed to start server');
  process.exit(1);
});
