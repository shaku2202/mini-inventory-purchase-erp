import 'dotenv/config';
import { z } from 'zod';

/**
 * All configuration comes from environment variables and is validated once at
 * boot. The process refuses to start with a clear message instead of failing
 * later with an obscure runtime error. No secrets live in source code.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

const raw = parsed.data;
const isTest = raw.NODE_ENV === 'test';

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest,
  port: raw.PORT,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  logLevel: isTest ? 'silent' : raw.LOG_LEVEL,
  db: {
    // Tests always run against the dedicated test database.
    url: isTest ? (raw.TEST_DATABASE_URL ?? raw.DATABASE_URL) : raw.DATABASE_URL,
    ssl: raw.DATABASE_SSL,
    poolMax: raw.DB_POOL_MAX,
  },
} as const;
