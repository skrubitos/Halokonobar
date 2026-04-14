import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { getRedis } from '@halokonobar/db';
import { getPool } from '@halokonobar/db';
import { config } from '../config.js';
import { UnauthorizedError } from '../errors.js';

export interface SessionPayload {
  id: string;
  clubId: string;
  zoneId: string;
  nfcTagId: string;
  expiresAt: string;
}

export interface StaffJwtPayload {
  sub: string;       // staff.id
  clubId: string;
  role: 'waiter' | 'manager' | 'admin';
  assignedZones: string[];
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateStaff: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Array<'waiter' | 'manager' | 'admin'>) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    session?: SessionPayload;
    staffUser?: StaffJwtPayload;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  // Customer session auth
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing session token');
      }
      const token = authHeader.slice(7);
      const session = await verifySessionToken(fastify, token);
      if (!session) throw new UnauthorizedError('Invalid or expired session');
      req.session = session;
    }
  );

  // Staff JWT auth
  fastify.decorate(
    'authenticateStaff',
    async (req: FastifyRequest, _reply: FastifyReply) => {
      try {
        await req.jwtVerify();
        req.staffUser = req.user as StaffJwtPayload;
      } catch {
        throw new UnauthorizedError('Invalid or expired staff token');
      }
    }
  );

  fastify.decorate(
    'requireRole',
    (roles: Array<'waiter' | 'manager' | 'admin'>) =>
      async (req: FastifyRequest, _reply: FastifyReply) => {
        if (!req.staffUser) throw new UnauthorizedError();
        if (!roles.includes(req.staffUser.role)) {
          throw new UnauthorizedError('Insufficient permissions');
        }
      }
  );
}

/** Validates a customer session token via Redis (fast) then Postgres (fallback) */
export async function verifySessionToken(
  _fastify: FastifyInstance,
  token: string
): Promise<SessionPayload | null> {
  if (!token || token.length !== 64) return null;

  // Redis fast path
  const redis = getRedis();
  const cached = await redis.get(`session:${token}`);
  if (cached) {
    const parsed = JSON.parse(cached) as SessionPayload;
    if (new Date(parsed.expiresAt) > new Date()) return parsed;
    return null;
  }

  // Postgres fallback
  const pool = getPool();
  const { rows } = await pool.query<SessionPayload & { expires_at: string }>(
    `SELECT id, club_id as "clubId", zone_id as "zoneId",
            nfc_tag_id as "nfcTagId", expires_at as "expiresAt"
     FROM sessions
     WHERE session_token = $1 AND expires_at > now()`,
    [token]
  );
  if (!rows[0]) return null;

  const session = rows[0];
  // Re-populate Redis cache
  const ttl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
  if (ttl > 0) {
    await redis.set(`session:${token}`, JSON.stringify(session), 'EX', ttl);
  }
  return session;
}

/** Validates a staff JWT and returns payload */
export async function verifyStaffToken(
  fastify: FastifyInstance,
  token: string
): Promise<StaffJwtPayload | null> {
  try {
    return fastify.jwt.verify<StaffJwtPayload>(token);
  } catch {
    return null;
  }
}

export default fp(authPlugin, { name: 'auth' });
