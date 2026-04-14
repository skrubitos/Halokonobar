import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';

export async function sessionRoutes(fastify: FastifyInstance) {
  // GET /api/v1/session/me
  fastify.get(
    '/session/me',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pool = getPool();
      const { rows: [row] } = await pool.query(
        `SELECT s.id, s.expires_at, s.created_at, s.customer_name, s.party_size,
                c.id as club_id, c.name as club_name, c.slug as club_slug,
                z.id as zone_id, z.name as zone_name, z.zone_type,
                t.id as tag_id, t.tag_label
         FROM sessions s
         JOIN clubs c ON c.id = s.club_id
         JOIN zones z ON z.id = s.zone_id
         JOIN nfc_tags t ON t.id = s.nfc_tag_id
         WHERE s.id = $1`,
        [req.session!.id]
      );

      if (!row) {
        return reply.status(404).send({ data: null, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } });
      }

      return reply.send({
        data: {
          sessionId: row.id,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          customerName: row.customer_name,
          partySize: row.party_size,
          club: { id: row.club_id, name: row.club_name, slug: row.club_slug },
          zone: { id: row.zone_id, name: row.zone_name, zoneType: row.zone_type },
          tag: { id: row.tag_id, tagLabel: row.tag_label },
        },
        error: null,
      });
    }
  );

  // PATCH /api/v1/session/me
  fastify.patch<{ Body: { customerName?: string; partySize?: number } }>(
    '/session/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            customerName: { type: 'string', maxLength: 100 },
            partySize: { type: 'integer', minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.customerName !== undefined) {
        updates.push(`customer_name = $${idx++}`);
        values.push(req.body.customerName);
      }
      if (req.body.partySize !== undefined) {
        updates.push(`party_size = $${idx++}`);
        values.push(req.body.partySize);
      }

      if (updates.length === 0) {
        return reply.send({ data: { updated: false }, error: null });
      }

      values.push(req.session!.id);
      await pool.query(
        `UPDATE sessions SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );

      return reply.send({ data: { updated: true }, error: null });
    }
  );
}
