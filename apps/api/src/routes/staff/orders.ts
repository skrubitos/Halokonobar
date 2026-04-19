import type { FastifyInstance } from 'fastify';
import { getPool } from '@halokonobar/db';
import { transitionOrderStatus, assignOrder, getOrderById } from '../../services/order.service.js';
import { NotFoundError } from '../../errors.js';
import type { OrderStatus } from '@halokonobar/types';
import { mapOrderWithItems, mapZone, mapDashboardSummary } from '../../utils/mappers.js';

export async function staffOrderRoutes(fastify: FastifyInstance) {
  // GET /api/v1/staff/orders
  fastify.get<{
    Querystring: {
      status?: string;
      zone_id?: string;
      since?: string;
      limit?: string;
    };
  }>(
    '/staff/orders',
    { preHandler: [fastify.authenticateStaff] },
    async (req, reply) => {
      const pool = getPool();
      const { clubId, assignedZones, role } = req.staffUser!;
      const { status, zone_id, since, limit } = req.query;

      const values: unknown[] = [clubId];
      const conditions: string[] = ['o.club_id = $1'];
      let idx = 2;

      // Default: show active orders only
      const statusList = status
        ? status.split(',')
        : ['pending', 'accepted', 'preparing', 'ready'];
      conditions.push(`o.status = ANY($${idx++}::text[])`);
      values.push(statusList);

      // Zone filter
      if (zone_id) {
        conditions.push(`o.zone_id = $${idx++}`);
        values.push(zone_id);
      } else if (assignedZones.length > 0) {
        // Staff restricted to their zones
        conditions.push(`o.zone_id = ANY($${idx++}::uuid[])`);
        values.push(assignedZones);
      } else if (role === 'waiter') {
        // Waiters without assigned zones should see no orders
        conditions.push('FALSE');
      }

      if (since) {
        conditions.push(`o.created_at > $${idx++}`);
        values.push(since);
      }

      const limitNum = Math.min(parseInt(limit ?? '50'), 100);

      const { rows } = await pool.query(
        `SELECT o.*,
                z.name as zone_name, z.zone_type,
                t.tag_label,
                s2.display_name as assigned_staff_name,
                EXTRACT(EPOCH FROM (now() - o.created_at))::int as waiting_seconds,
                json_agg(oi.* ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL) as items
         FROM orders o
         JOIN zones z ON z.id = o.zone_id
         JOIN nfc_tags t ON t.id = o.nfc_tag_id
         LEFT JOIN staff s2 ON s2.id = o.assigned_staff_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY o.id, z.name, z.zone_type, t.tag_label, s2.display_name
         ORDER BY
           CASE o.priority WHEN 'vip' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END ASC,
           o.created_at ASC
         LIMIT $${idx}`,
        [...values, limitNum]
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

  // PATCH /api/v1/staff/orders/:order_id/status
  fastify.patch<{
    Params: { order_id: string };
    Body: { status: OrderStatus; note?: string };
  }>(
    '/staff/orders/:order_id/status',
    {
      preHandler: [fastify.authenticateStaff],
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['accepted', 'preparing', 'ready', 'delivered', 'cancelled'],
            },
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      // Verify order belongs to staff's club
      const pool = getPool();
      const { rows: [check] } = await pool.query(
        `SELECT id FROM orders WHERE id = $1 AND club_id = $2`,
        [req.params.order_id, req.staffUser!.clubId]
      );
      if (!check) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');

      const staffName = await getStaffName(req.staffUser!.sub);
      const updated = await transitionOrderStatus(
        req.params.order_id,
        req.body.status,
        req.staffUser!.sub,
        staffName,
        req.body.note
      );

      return reply.send({ data: updated, error: null });
    }
  );

  // PATCH /api/v1/staff/orders/:order_id/assign
  fastify.patch<{
    Params: { order_id: string };
    Body: { staffId: string | null };
  }>(
    '/staff/orders/:order_id/assign',
    {
      preHandler: [fastify.authenticateStaff],
      schema: {
        body: {
          type: 'object',
          required: ['staffId'],
          properties: {
            staffId: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (req, reply) => {
      const pool = getPool();
      const { rows: [check] } = await pool.query(
        `SELECT id FROM orders WHERE id = $1 AND club_id = $2`,
        [req.params.order_id, req.staffUser!.clubId]
      );
      if (!check) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');

      let assigneeName: string | null = null;
      if (req.body.staffId) {
        const { rows: [s] } = await pool.query(
          `SELECT display_name FROM staff WHERE id = $1`,
          [req.body.staffId]
        );
        assigneeName = s?.display_name as string ?? null;
      }

      const updated = await assignOrder(
        req.params.order_id,
        req.body.staffId,
        req.staffUser!.sub,
        assigneeName
      );

      return reply.send({ data: updated, error: null });
    }
  );

  // GET /api/v1/staff/zones
  fastify.get(
    '/staff/zones',
    { preHandler: [fastify.authenticateStaff] },
    async (req, reply) => {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT z.*,
                COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled')) as active_order_count
         FROM zones z
         LEFT JOIN orders o ON o.zone_id = z.id AND o.club_id = z.club_id
         WHERE z.club_id = $1 AND z.is_active = true
         GROUP BY z.id
         ORDER BY z.sort_order ASC`,
        [req.staffUser!.clubId]
      );
      return reply.send({ data: { zones: rows.map((r) => mapZone(r as Record<string, unknown>)) }, error: null });
    }
  );

  // GET /api/v1/staff/tables
  fastify.get(
    '/staff/tables',
    { preHandler: [fastify.authenticateStaff] },
    async (req, reply) => {
      const pool = getPool();
      const { clubId, assignedZones } = req.staffUser!;

      const values: unknown[] = [clubId];
      let idx = 2;
      const extraConditions: string[] = [];

      if (assignedZones.length > 0) {
        extraConditions.push(`t.zone_id = ANY($${idx++}::uuid[])`);
        values.push(assignedZones);
      }

      const whereExtra = extraConditions.length > 0
        ? `AND ${extraConditions.join(' AND ')}`
        : '';

      const { rows } = await pool.query(
        `SELECT
           t.id,
           t.tag_label,
           t.zone_id,
           z.name        AS zone_name,
           z.zone_type,
           z.sort_order  AS zone_sort_order,
           COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled'))          AS active_order_count,
           BOOL_OR(o.status = 'pending')
             FILTER (WHERE o.status NOT IN ('delivered','cancelled'))                    AS has_pending,
           MIN(CASE o.status
                 WHEN 'pending'   THEN 1
                 WHEN 'accepted'  THEN 2
                 WHEN 'preparing' THEN 3
                 WHEN 'ready'     THEN 4
                 ELSE NULL END)
             FILTER (WHERE o.status NOT IN ('delivered','cancelled'))                    AS worst_status_rank,
           BOOL_OR(
             EXTRACT(EPOCH FROM (now() - o.created_at)) > 300
             AND o.status NOT IN ('ready','delivered','cancelled')
           ) FILTER (WHERE o.status NOT IN ('delivered','cancelled'))                    AS has_delayed
         FROM nfc_tags t
         JOIN zones z ON z.id = t.zone_id
         LEFT JOIN orders o ON o.nfc_tag_id = t.id AND o.club_id = $1
         WHERE t.club_id = $1 AND t.is_active = true ${whereExtra}
         GROUP BY t.id, t.tag_label, t.zone_id, z.name, z.zone_type, z.sort_order
         ORDER BY z.sort_order ASC, t.tag_label ASC`,
        values
      );

      const rankToStatus = (rank: number | null): string | null => {
        if (rank === null) return null;
        return ['pending', 'accepted', 'preparing', 'ready'][rank - 1] ?? null;
      };

      const tables = rows.map((r) => ({
        id: r.id as string,
        tagLabel: r.tag_label as string,
        zoneId: r.zone_id as string,
        zoneName: r.zone_name as string,
        zoneType: r.zone_type as string,
        activeOrderCount: Number(r.active_order_count ?? 0),
        worstStatus: rankToStatus(r.worst_status_rank != null ? Number(r.worst_status_rank) : null),
        hasPending: Boolean(r.has_pending),
        hasDelayed: Boolean(r.has_delayed),
      }));

      return reply.send({ data: { tables }, error: null });
    }
  );

  // GET /api/v1/staff/dashboard/summary
  fastify.get(
    '/staff/dashboard/summary',
    { preHandler: [fastify.authenticateStaff] },
    async (req, reply) => {
      const pool = getPool();
      const { rows: [summary] } = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled')) as active_orders_count,
           COUNT(*) FILTER (WHERE status = 'pending') as pending_orders_count,
           COALESCE(
             AVG(EXTRACT(EPOCH FROM (COALESCE(delivered_at, now()) - created_at)))
             FILTER (WHERE status = 'delivered' AND delivered_at > now() - interval '1 hour'),
             0
           )::int as avg_wait_time_seconds,
           COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour') as orders_last_hour,
           COALESCE(SUM(total_pence) FILTER (WHERE created_at > CURRENT_DATE AND status != 'cancelled'), 0)
             as revenue_today_pence
         FROM orders
         WHERE club_id = $1`,
        [req.staffUser!.clubId]
      );

      return reply.send({ data: mapDashboardSummary(summary as Record<string, unknown>), error: null });
    }
  );
}

async function getStaffName(staffId: string): Promise<string> {
  const pool = getPool();
  const { rows: [s] } = await pool.query(
    `SELECT display_name FROM staff WHERE id = $1`,
    [staffId]
  );
  return (s?.display_name as string) ?? 'Unknown';
}
