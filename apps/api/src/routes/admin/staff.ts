import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';
import bcrypt from 'bcrypt';
import { AppError, NotFoundError } from '../../errors.js';

const BCRYPT_ROUNDS = 12;

export async function adminStaffRoutes(fastify: FastifyInstance) {
  const adminGuard = [fastify.authenticateStaff, fastify.requireRole(['admin'])];

  // GET /api/v1/admin/clubs/:club_id/staff
  fastify.get<{ Params: { club_id: string } }>(
    '/admin/clubs/:club_id/staff',
    { preHandler: adminGuard },
    async (req, reply) => {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, club_id, email, display_name, role, assigned_zones,
                is_active, last_login_at, created_at
         FROM staff
         WHERE club_id = $1
         ORDER BY
           CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
           display_name ASC`,
        [req.params.club_id]
      );
      return reply.send({ data: { staff: rows }, error: null });
    }
  );

  // POST /api/v1/admin/clubs/:club_id/staff
  fastify.post<{
    Params: { club_id: string };
    Body: {
      email: string;
      password: string;
      displayName: string;
      role: 'waiter' | 'manager' | 'admin';
      assignedZones?: string[];
    };
  }>(
    '/admin/clubs/:club_id/staff',
    {
      preHandler: adminGuard,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'displayName', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, maxLength: 128 },
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
            role: { type: 'string', enum: ['waiter', 'manager', 'admin'] },
            assignedZones: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              default: [],
            },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const email = req.body.email.toLowerCase().trim();

      // Check for duplicate email within the club
      const { rows: existing } = await pool.query(
        `SELECT id FROM staff WHERE club_id = $1 AND email = $2`,
        [req.params.club_id, email]
      );
      if (existing.length > 0) {
        throw new AppError(409, 'EMAIL_EXISTS', 'A staff member with this email already exists');
      }

      const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);

      const { rows: [created] } = await pool.query(
        `INSERT INTO staff (club_id, email, password_hash, display_name, role, assigned_zones)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, club_id, email, display_name, role, assigned_zones, is_active, created_at`,
        [
          req.params.club_id,
          email,
          passwordHash,
          req.body.displayName,
          req.body.role,
          req.body.assignedZones ?? [],
        ]
      );

      return reply.status(201).send({ data: created, error: null });
    }
  );

  // PATCH /api/v1/admin/clubs/:club_id/staff/:staff_id
  fastify.patch<{
    Params: { club_id: string; staff_id: string };
    Body: {
      displayName?: string;
      role?: 'waiter' | 'manager' | 'admin';
      assignedZones?: string[];
      isActive?: boolean;
      password?: string;
    };
  }>(
    '/admin/clubs/:club_id/staff/:staff_id',
    {
      preHandler: adminGuard,
      schema: {
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
            role: { type: 'string', enum: ['waiter', 'manager', 'admin'] },
            assignedZones: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
            },
            isActive: { type: 'boolean' },
            password: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();

      // Prevent admin from deactivating themselves
      if (req.body.isActive === false && req.params.staff_id === req.staffUser!.sub) {
        throw new AppError(400, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.displayName !== undefined) {
        fields.push(`display_name = $${idx++}`);
        values.push(req.body.displayName);
      }
      if (req.body.role !== undefined) {
        fields.push(`role = $${idx++}`);
        values.push(req.body.role);
      }
      if (req.body.assignedZones !== undefined) {
        fields.push(`assigned_zones = $${idx++}`);
        values.push(req.body.assignedZones);
      }
      if (req.body.isActive !== undefined) {
        fields.push(`is_active = $${idx++}`);
        values.push(req.body.isActive);
      }
      if (req.body.password !== undefined) {
        const hash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
        fields.push(`password_hash = $${idx++}`);
        values.push(hash);
      }

      if (fields.length === 0) {
        return reply.send({ data: {}, error: null });
      }

      values.push(req.params.staff_id, req.params.club_id);
      const { rows: [updated] } = await pool.query(
        `UPDATE staff SET ${fields.join(', ')}
         WHERE id = $${idx++} AND club_id = $${idx}
         RETURNING id, club_id, email, display_name, role, assigned_zones, is_active, last_login_at, created_at`,
        values
      );

      if (!updated) throw new NotFoundError('STAFF_NOT_FOUND', 'Staff member not found');

      return reply.send({ data: updated, error: null });
    }
  );

  // DELETE /api/v1/admin/clubs/:club_id/staff/:staff_id (soft delete — sets is_active=false)
  fastify.delete<{
    Params: { club_id: string; staff_id: string };
  }>(
    '/admin/clubs/:club_id/staff/:staff_id',
    { preHandler: adminGuard },
    async (req, reply) => {
      if (req.params.staff_id === req.staffUser!.sub) {
        throw new AppError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own account');
      }

      const pool = getPool();
      const { rows: [staff] } = await pool.query(
        `UPDATE staff SET is_active = false
         WHERE id = $1 AND club_id = $2
         RETURNING id`,
        [req.params.staff_id, req.params.club_id]
      );

      if (!staff) throw new NotFoundError('STAFF_NOT_FOUND', 'Staff member not found');

      return reply.send({ data: { deleted: true }, error: null });
    }
  );
}
