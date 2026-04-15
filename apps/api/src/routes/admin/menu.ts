import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';
import { publishMenuItemAvailabilityChanged } from '../../services/realtime.service.js';
import { NotFoundError } from '../../errors.js';

export async function adminMenuRoutes(fastify: FastifyInstance) {
  const managerGuard = [fastify.authenticateStaff, fastify.requireRole(['manager', 'admin'])];

  // GET /api/v1/admin/clubs/:club_id/menu/categories
  fastify.get<{ Params: { club_id: string } }>(
    '/admin/clubs/:club_id/menu/categories',
    { preHandler: managerGuard },
    async (req, reply) => {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM menu_categories WHERE club_id = $1 ORDER BY sort_order ASC`,
        [req.params.club_id]
      );
      return reply.send({ data: { categories: rows }, error: null });
    }
  );

  // POST /api/v1/admin/clubs/:club_id/menu/categories
  fastify.post<{
    Params: { club_id: string };
    Body: { name: string; emoji?: string; sortOrder?: number };
  }>(
    '/admin/clubs/:club_id/menu/categories',
    {
      preHandler: managerGuard,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            emoji: { type: 'string', maxLength: 10 },
            sortOrder: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const { rows: [cat] } = await pool.query(
        `INSERT INTO menu_categories (club_id, name, emoji, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.club_id, req.body.name, req.body.emoji ?? null, req.body.sortOrder ?? 0]
      );
      return reply.status(201).send({ data: cat, error: null });
    }
  );

  // PATCH /api/v1/admin/clubs/:club_id/menu/categories/:category_id
  fastify.patch<{
    Params: { club_id: string; category_id: string };
    Body: { name?: string; emoji?: string; sortOrder?: number; isActive?: boolean };
  }>(
    '/admin/clubs/:club_id/menu/categories/:category_id',
    { preHandler: managerGuard },
    async (req, reply) => {
      const pool = getPool();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(req.body.name); }
      if (req.body.emoji !== undefined) { fields.push(`emoji = $${idx++}`); values.push(req.body.emoji); }
      if (req.body.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(req.body.sortOrder); }
      if (req.body.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(req.body.isActive); }

      if (fields.length === 0) return reply.send({ data: {}, error: null });

      values.push(req.params.category_id, req.params.club_id);
      const { rows: [cat] } = await pool.query(
        `UPDATE menu_categories SET ${fields.join(', ')}
         WHERE id = $${idx++} AND club_id = $${idx} RETURNING *`,
        values
      );
      if (!cat) throw new NotFoundError('CATEGORY_NOT_FOUND', 'Category not found');
      return reply.send({ data: cat, error: null });
    }
  );

  // GET /api/v1/admin/clubs/:club_id/menu/items
  fastify.get<{ Params: { club_id: string } }>(
    '/admin/clubs/:club_id/menu/items',
    { preHandler: managerGuard },
    async (req, reply) => {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT * FROM menu_items WHERE club_id = $1 ORDER BY sort_order ASC, name ASC`,
        [req.params.club_id]
      );
      return reply.send({ data: { items: rows }, error: null });
    }
  );

  // POST /api/v1/admin/clubs/:club_id/menu/items
  fastify.post<{
    Params: { club_id: string };
    Body: {
      categoryId: string;
      name: string;
      description?: string;
      pricePence: number;
      imageUrl?: string;
      isAvailable?: boolean;
      isFeatured?: boolean;
      modifiers?: unknown[];
      sortOrder?: number;
      prepTimeMins?: number;
    };
  }>(
    '/admin/clubs/:club_id/menu/items',
    {
      preHandler: managerGuard,
      schema: {
        body: {
          type: 'object',
          required: ['categoryId', 'name', 'pricePence'],
          properties: {
            categoryId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 1000 },
            pricePence: { type: 'integer', minimum: 0 },
            imageUrl: { type: 'string', maxLength: 500 },
            isAvailable: { type: 'boolean' },
            isFeatured: { type: 'boolean' },
            modifiers: { type: 'array' },
            sortOrder: { type: 'integer' },
            prepTimeMins: { type: 'integer', minimum: 1, maximum: 60 },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const { rows: [item] } = await pool.query(
        `INSERT INTO menu_items (
           club_id, category_id, name, description, price_pence,
           image_url, is_available, is_featured, modifiers, sort_order, prep_time_mins
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          req.params.club_id, req.body.categoryId, req.body.name,
          req.body.description ?? null, req.body.pricePence,
          req.body.imageUrl ?? null, req.body.isAvailable ?? true,
          req.body.isFeatured ?? false,
          JSON.stringify(req.body.modifiers ?? []),
          req.body.sortOrder ?? 0, req.body.prepTimeMins ?? 3,
        ]
      );
      return reply.status(201).send({ data: item, error: null });
    }
  );

  // PATCH /api/v1/admin/clubs/:club_id/menu/items/:item_id
  fastify.patch<{
    Params: { club_id: string; item_id: string };
    Body: Record<string, unknown>;
  }>(
    '/admin/clubs/:club_id/menu/items/:item_id',
    { preHandler: managerGuard },
    async (req, reply) => {
      const pool = getPool();

      // Get current state before update (need to detect availability change)
      const { rows: [current] } = await pool.query(
        `SELECT is_available FROM menu_items WHERE id = $1 AND club_id = $2`,
        [req.params.item_id, req.params.club_id]
      );
      if (!current) throw new NotFoundError('ITEM_NOT_FOUND', 'Menu item not found');

      const ALLOWED = ['categoryId', 'name', 'description', 'pricePence', 'imageUrl',
                       'isAvailable', 'isFeatured', 'modifiers', 'sortOrder', 'prepTimeMins'];
      const DB_MAP: Record<string, string> = {
        categoryId: 'category_id', name: 'name', description: 'description',
        pricePence: 'price_pence', imageUrl: 'image_url', isAvailable: 'is_available',
        isFeatured: 'is_featured', modifiers: 'modifiers', sortOrder: 'sort_order',
        prepTimeMins: 'prep_time_mins',
      };

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const key of ALLOWED) {
        if (req.body[key] !== undefined) {
          fields.push(`${DB_MAP[key]} = $${idx++}`);
          values.push(key === 'modifiers' ? JSON.stringify(req.body[key]) : req.body[key]);
        }
      }

      if (fields.length === 0) return reply.send({ data: current, error: null });

      values.push(req.params.item_id, req.params.club_id);
      const { rows: [updated] } = await pool.query(
        `UPDATE menu_items SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${idx++} AND club_id = $${idx}
         RETURNING *`,
        values
      );

      // If availability changed, broadcast to all connected customers
      if (
        req.body['isAvailable'] !== undefined &&
        req.body['isAvailable'] !== current.is_available
      ) {
        await publishMenuItemAvailabilityChanged(req.params.club_id, {
          menuItemId: req.params.item_id,
          name: updated.name as string,
          isAvailable: req.body['isAvailable'] as boolean,
        });
      }

      return reply.send({ data: updated, error: null });
    }
  );
}
