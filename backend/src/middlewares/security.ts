import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { createError, formatMessage } from '../utils/appError.js';

/** Only the configured front-end origins may call the API from a browser. */
export const corsMiddleware = cors({
  origin(origin, callback) {
    // Non-browser clients (curl, Postman, server-to-server) send no Origin.
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(createError('CORS_NOT_ALLOWED', { origin }));
  },
  exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'],
});

/** Basic abuse protection for write endpoints. */
export const writeRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isTest ? 10_000 : 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: formatMessage('TOO_MANY_REQUESTS'), requestId: req.id },
    });
  },
});
