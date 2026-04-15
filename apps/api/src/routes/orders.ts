import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';
import {
  createOrder,
  getOrderById,
  transitionOrderStatus,
} from '../services/order.service.js';
import { NotFoundError, AppError } from '../errors.js';
import type { CreateOrderBody } from '@halokonobar/types';
import { mapOrderWithItems, mapOrderStatusHistory } from '../utils/mappers.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // POST /api/v1/orders — create order
  fastify.post<{ Body: CreateOrderBody }>(
    '/orders',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['idempotencyKey', 'items'],
          properties: {
            idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
            notes: { type: 'string', maxLength: 500 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 30,
              items: {
                type: 'object',
                required: ['menuItemId', 'quantity'],
                properties: {
                  menuItemId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1, maximum: 20 },
                  selectedModifiers: { type: 'array' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const result = await createOrder(req.session!, req.body);
      return reply.status(201).send({ data: result, error: null });
    }
  );

  // GET /api/v1/orders — list session's orders
  fastify.get<{ Querystring: { status?: string } }>(
    '/orders',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pool = getPool();
      const statusFilter = req.query.status;

      let statusClause = '';
      const values: unknown[] = [req.session!.id];

      if (statusFilter === 'active') {
        statusClause = `AND o.status NOT IN ('delivered', 'cancelled')`;
      } else if (statusFilter && statusFilter !== 'all') {
        statusClause = `AND o.status = ANY($2::text[])`;
        values.push(statusFilter.split(','));
      }

      const { rows } = await pool.query(
        `SELECT o.*,
                z.name as zone_name, z.zone_type,
                t.tag_label,
                EXTRACT(EPOCH FROM (now() - o.created_at))::int as waiting_seconds,
                json_agg(oi.* ORDER BY oi.created_at) as items
         FROM orders o
         JOIN zones z ON z.id = o.zone_id
         JOIN nfc_tags t ON t.id = o.nfc_tag_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.session_id = $1 ${statusClause}
         GROUP BY o.id, z.name, z.zone_type, t.tag_label
         ORDER BY o.created_at DESC
         LIMIT 50`,
        values
      );

      return reply.send({
        data: {
          orders: rows.map((r) =>
            mapOrderWithItems(r as Record<string, unknown>, r.items as Record<string, unknown>[] ?? [])
          ),
        },
        error: null,
      });
    }
  );

  // GET /api/v1/orders/:order_id
  fastify.get<{ Params: { order_id: string } }>(
    '/orders/:order_id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pool = getPool();

      // Verify order belongs to this session
      const { rows: [check] } = await pool.query(
        `SELECT id FROM orders WHERE id = $1 AND session_id = $2`,
        [req.params.order_id, req.session!.id]
      );
      if (!check) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');

      const order = await getOrderById(req.params.order_id, req.session!.clubId);

      // Include status history
      const { rows: history } = await pool.query(
        `SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`,
        [req.params.order_id]
      );

      return reply.send({ data: { ...order, statusHistory: history.map((h) => mapOrderStatusHistory(h as Record<string, unknown>)) }, error: null });
    }
  );

  // POST /api/v1/orders/:order_id/reorder
  fastify.post<{ Params: { order_id: string } }>(
    '/orders/:order_id/reorder',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pool = getPool();

      // Fetch original order items
      const { rows: [origOrder] } = await pool.query(
        `SELECT o.notes FROM orders o WHERE o.id = $1 AND o.session_id = $2`,
        [req.params.order_id, req.session!.id]
      );
      if (!origOrder) throw new NotFoundError('ORDER_NOT_FOUND', 'Original order not found');

      const { rows: origItems } = await pool.query(
        `SELECT menu_item_id, quantity, selected_modifiers FROM order_items WHERE order_id = $1`,
        [req.params.order_id]
      );

      const { randomUUID } = await import('node:crypto');
      const origNotes = origOrder.notes as string | null;
      const body: CreateOrderBody = {
        idempotencyKey: randomUUID(),
        ...(origNotes ? { notes: origNotes } : {}),
        items: origItems.map((i) => ({
          menuItemId: i.menu_item_id as string,
          quantity: i.quantity as number,
          selectedModifiers: (i.selected_modifiers as Array<{ modifierId: string; optionLabel: string }>) ?? [],
        })),
      };

      const result = await createOrder(req.session!, body);
      return reply.status(201).send({ data: result, error: null });
    }
  );

  // DELETE /api/v1/orders/:order_id — cancel (only if pending)
  fastify.delete<{ Params: { order_id: string } }>(
    '/orders/:order_id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pool = getPool();

      const { rows: [order] } = await pool.query(
        `SELECT id, status, club_id, session_id FROM orders
         WHERE id = $1 AND session_id = $2`,
        [req.params.order_id, req.session!.id]
      );

      if (!order) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');
      if (order.status !== 'pending') {
        throw new AppError(409, 'CANNOT_CANCEL', 'Only pending orders can be cancelled by the customer');
      }

      await pool.query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = now(),
         cancel_reason = 'Cancelled by customer', updated_at = now()
         WHERE id = $1`,
        [req.params.order_id]
      );
      await pool.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_type, note)
         VALUES ($1, 'pending', 'cancelled', 'customer', 'Cancelled by customer')`,
        [req.params.order_id]
      );

      return reply.send({ data: { cancelled: true }, error: null });
    }
  );
}
