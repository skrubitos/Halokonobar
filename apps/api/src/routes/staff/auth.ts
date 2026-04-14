import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';
import bcrypt from 'bcrypt';
import { AppError } from '../../errors.js';

export async function staffAuthRoutes(fastify: FastifyInstance) {
  // POST /api/v1/staff/auth/login
  fastify.post<{ Body: { email: string; password: string } }>(
    '/staff/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const { email, password } = req.body;

      const { rows: [staff] } = await pool.query(
        `SELECT id, club_id, email, password_hash, display_name,
                role, assigned_zones, is_active
         FROM staff
         WHERE email = $1`,
        [email.toLowerCase().trim()]
      );

      // Constant-time comparison (even on miss, we still run bcrypt)
      const hash = staff?.password_hash ?? '$2b$12$invalidhash00000000000000000000000000000000000';
      const match = await bcrypt.compare(password, hash as string);

      if (!staff || !match || !staff.is_active) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }

      // Update last_login_at (fire and forget)
      pool.query('UPDATE staff SET last_login_at = now() WHERE id = $1', [staff.id]).catch(console.error);

      const payload = {
        sub: staff.id as string,
        clubId: staff.club_id as string,
        role: staff.role as string,
        assignedZones: (staff.assigned_zones as string[]) ?? [],
      };

      const accessToken = fastify.jwt.sign(payload);

      return reply.send({
        data: {
          accessToken,
          expiresIn: 28800,
          staff: {
            id: staff.id,
            email: staff.email,
            displayName: staff.display_name,
            role: staff.role,
            assignedZones: staff.assigned_zones,
            isActive: staff.is_active,
            lastLoginAt: new Date().toISOString(),
            createdAt: null,
          },
        },
        error: null,
      });
    }
  );

  // POST /api/v1/staff/auth/refresh
  fastify.post(
    '/staff/auth/refresh',
    { preHandler: [fastify.authenticateStaff] },
    async (req, reply) => {
      const { sub, clubId, role, assignedZones } = req.staffUser!;
      const accessToken = fastify.jwt.sign({ sub, clubId, role, assignedZones });
      return reply.send({ data: { accessToken, expiresIn: 28800 }, error: null });
    }
  );
}
