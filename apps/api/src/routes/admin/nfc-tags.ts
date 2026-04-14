import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';

export async function adminNfcTagRoutes(fastify: FastifyInstance) {
  const managerGuard = [fastify.authenticateStaff, fastify.requireRole(['manager', 'admin'])];

  // GET /api/v1/admin/clubs/:club_id/nfc-tags
  fastify.get<{ Params: { club_id: string } }>(
    '/admin/clubs/:club_id/nfc-tags',
    { preHandler: managerGuard },
    async (req, reply) => {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT t.*, z.name as zone_name, z.zone_type
         FROM nfc_tags t
         JOIN zones z ON z.id = t.zone_id
         WHERE t.club_id = $1
         ORDER BY z.sort_order, t.tag_label`,
        [req.params.club_id]
      );
      return reply.send({ data: { tags: rows }, error: null });
    }
  );

  // POST /api/v1/admin/clubs/:club_id/nfc-tags
  fastify.post<{
    Params: { club_id: string };
    Body: { zoneId: string; tagUid: string; tagLabel: string };
  }>(
    '/admin/clubs/:club_id/nfc-tags',
    {
      preHandler: managerGuard,
      schema: {
        body: {
          type: 'object',
          required: ['zoneId', 'tagUid', 'tagLabel'],
          properties: {
            zoneId: { type: 'string', format: 'uuid' },
            tagUid: { type: 'string', minLength: 1, maxLength: 64 },
            tagLabel: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const tagUid = req.body.tagUid.replace(/:/g, '').toUpperCase();
      const appUrl = process.env['APP_URL'] ?? 'https://app.halokonobar.com';
      const qrUrl = `${appUrl}/nfc/${tagUid}`;

      const { rows: [tag] } = await pool.query(
        `INSERT INTO nfc_tags (club_id, zone_id, tag_uid, tag_label, qr_fallback_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.params.club_id, req.body.zoneId, tagUid, req.body.tagLabel, qrUrl]
      );
      return reply.status(201).send({ data: tag, error: null });
    }
  );

  // PATCH /api/v1/admin/clubs/:club_id/nfc-tags/:tag_id
  fastify.patch<{
    Params: { club_id: string; tag_id: string };
    Body: { isActive?: boolean; tagLabel?: string; zoneId?: string };
  }>(
    '/admin/clubs/:club_id/nfc-tags/:tag_id',
    { preHandler: managerGuard },
    async (req, reply) => {
      const pool = getPool();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(req.body.isActive); }
      if (req.body.tagLabel !== undefined) { fields.push(`tag_label = $${idx++}`); values.push(req.body.tagLabel); }
      if (req.body.zoneId !== undefined) { fields.push(`zone_id = $${idx++}`); values.push(req.body.zoneId); }

      if (fields.length === 0) return reply.send({ data: {}, error: null });

      values.push(req.params.tag_id, req.params.club_id);
      const { rows: [tag] } = await pool.query(
        `UPDATE nfc_tags SET ${fields.join(', ')}
         WHERE id = $${idx++} AND club_id = $${idx} RETURNING *`,
        values
      );
      return reply.send({ data: tag, error: null });
    }
  );
}
