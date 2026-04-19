import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import authPlugin from './plugins/auth.js';
import websocketPlugin from './plugins/websocket.js';
import { nfcRoutes } from './routes/nfc.js';
import { sessionRoutes } from './routes/session.js';
import { menuRoutes } from './routes/menu.js';
import { orderRoutes } from './routes/orders.js';
import { staffAuthRoutes } from './routes/staff/auth.js';
import { staffOrderRoutes } from './routes/staff/orders.js';
import { adminMenuRoutes } from './routes/admin/menu.js';
import { adminNfcTagRoutes } from './routes/admin/nfc-tags.js';
import { adminStaffRoutes } from './routes/admin/staff.js';
import { startDelayMonitor, stopDelayMonitor } from './services/delay-monitor.js';
import { closePool } from '@halokonobar/db';
import { closeRedis } from '@halokonobar/db';

const fastify = Fastify({
  logger: config.NODE_ENV !== 'production'
    ? { level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true } } }
    : { level: 'info' },
  trustProxy: true,
  ajv: {
    customOptions: { allErrors: true, coerceTypes: false },
  },
});

// ─── Global error handler ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
fastify.setErrorHandler(errorHandler as any);

// ─── Security plugins ──────────────────────────────────────────────────────
await fastify.register(helmet, {
  contentSecurityPolicy: false, // CSP configured at CDN level
  crossOriginEmbedderPolicy: false,
});

await fastify.register(cors, {
  origin: config.NODE_ENV === 'production'
    ? ['https://app.halokonobar.com', 'https://waiter.halokonobar.com']
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

await fastify.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string ?? req.ip,
});

// ─── Auth + WebSocket plugins ──────────────────────────────────────────────
await fastify.register(authPlugin);
await fastify.register(websocketPlugin);

// ─── Health check ─────────────────────────────────────────────────────────
fastify.get('/health', async (_req, reply) => {
  return reply.send({ status: 'ok', ts: new Date().toISOString() });
});

// ─── API routes (all under /api/v1) ───────────────────────────────────────
await fastify.register(
  async (api) => {
    await api.register(nfcRoutes);
    await api.register(sessionRoutes);
    await api.register(menuRoutes);
    await api.register(orderRoutes);
    await api.register(staffAuthRoutes);
    await api.register(staffOrderRoutes);
    await api.register(adminMenuRoutes);
    await api.register(adminNfcTagRoutes);
    await api.register(adminStaffRoutes);
  },
  { prefix: '/api/v1' }
);

// ─── Startup ──────────────────────────────────────────────────────────────
try {
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  console.info(`API listening on port ${config.PORT}`);
  startDelayMonitor();
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// ─── Graceful shutdown ─────────────────────────────────────────────────────
const shutdown = async () => {
  stopDelayMonitor();
  await fastify.close();
  await closePool();
  await closeRedis();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
