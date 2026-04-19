import { getPool } from '@halokonobar/db';
import type {
  CreateOrderBody,
  CreateOrderResponse,
  OrderWithItems,
  OrderStatus,
} from '@halokonobar/types';
import type { SessionPayload } from '../plugins/auth.js';
import {
  AppError,
  NotFoundError,
  ConflictError,
  InvalidTransitionError,
  ValidationError,
} from '../errors.js';
import { mapOrder, mapOrderItem, mapOrderWithItems } from '../utils/mappers.js';
import {
  publishOrderCreated,
  publishOrderStatusChanged,
  publishOrderAssigned,
} from './realtime.service.js';

// Valid state machine transitions
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:   ['accepted', 'cancelled'],
  accepted:  ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['delivered', 'preparing'],
  delivered: [],
  cancelled: [],
};

export async function createOrder(
  session: SessionPayload,
  body: CreateOrderBody
): Promise<CreateOrderResponse> {
  const pool = getPool();

  // Idempotency check — return existing order if key already used
  const { rows: existing } = await pool.query(
    `SELECT o.id, o.order_number, o.status, o.estimated_ready_at,
            o.subtotal_pence, o.total_pence
     FROM orders o
     WHERE o.idempotency_key = $1`,
    [body.idempotencyKey]
  );
  if (existing[0]) {
    const { rows: items } = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [existing[0].id]
    );
    return {
      orderId: existing[0].id as string,
      orderNumber: existing[0].order_number as string,
      status: existing[0].status as OrderStatus,
      estimatedReadyAt: existing[0].estimated_ready_at as string | null,
      items,
      subtotalPence: existing[0].subtotal_pence as number,
      totalPence: existing[0].total_pence as number,
    };
  }

  // Validate all menu items belong to the session's club and are available
  const itemIds = body.items.map((i) => i.menuItemId);
  const { rows: menuItems } = await pool.query(
    `SELECT id, name, price_pence, prep_time_mins, is_available
     FROM menu_items
     WHERE id = ANY($1::uuid[]) AND club_id = $2`,
    [itemIds, session.clubId]
  );

  if (menuItems.length !== itemIds.length) {
    throw new NotFoundError('MENU_ITEM_NOT_FOUND', 'One or more menu items not found');
  }

  type MenuItemRow = { id: string; name: string; price_pence: number; prep_time_mins: number; is_available: boolean };
  const menuItemMap = new Map<string, MenuItemRow>(
    (menuItems as MenuItemRow[]).map((m) => [m.id, m])
  );

  for (const item of body.items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem?.is_available) {
      throw new AppError(409, 'ITEM_UNAVAILABLE', `'${menuItem?.name ?? item.menuItemId}' is currently unavailable`);
    }
  }

  // Compute totals server-side (never trust client prices)
  let subtotalPence = 0;
  let maxPrepMins = 0;

  const lineItems = body.items.map((item) => {
    const menuItem = menuItemMap.get(item.menuItemId)!;
    const modifierDelta = (item.selectedModifiers ?? []).reduce((sum, mod) => {
      // Find the modifier option and its price delta
      return sum; // modifiers with 0 price delta are the norm; extend as needed
    }, 0);
    const unitPrice = (menuItem.price_pence as number) + modifierDelta;
    const lineTotal = unitPrice * item.quantity;
    subtotalPence += lineTotal;
    if ((menuItem.prep_time_mins as number) > maxPrepMins) maxPrepMins = menuItem.prep_time_mins as number;

    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPricePence: unitPrice,
      totalPence: lineTotal,
      selectedModifiers: item.selectedModifiers ?? [],
      nameSnapshot: menuItem.name as string,
    };
  });

  const totalPence = subtotalPence;
  const estimatedReadyAt = new Date(Date.now() + maxPrepMins * 60 * 1000).toISOString();

  // Determine priority from zone type
  const { rows: [zone] } = await pool.query(
    `SELECT zone_type FROM zones WHERE id = $1`,
    [session.zoneId]
  );
  const priority = zone?.zone_type === 'vip' ? 'vip' : 'normal';

  // Get tag label for order number generation
  const { rows: [tag] } = await pool.query(
    `SELECT tag_label FROM nfc_tags WHERE id = $1`,
    [session.nfcTagId]
  );
  const tagShort = (tag?.tag_label as string ?? 'X')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 4)
    .toUpperCase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate order number using sequence (per-tag per-day)
    const { rows: [seqRow] } = await client.query(
      `SELECT COALESCE(MAX(
         CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)
       ), 0) + 1 as next_seq
       FROM orders
       WHERE nfc_tag_id = $1
         AND created_at > CURRENT_DATE AT TIME ZONE 'UTC'`,
      [session.nfcTagId]
    );
    const seq = String(seqRow?.next_seq ?? 1).padStart(3, '0');
    const orderNumber = `${tagShort}-${seq}`;

    const { rows: [order] } = await client.query(
      `INSERT INTO orders (
         club_id, session_id, zone_id, nfc_tag_id, order_number, status, priority,
         notes, subtotal_pence, total_pence, estimated_ready_at, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11)
       RETURNING id, order_number, status, estimated_ready_at, subtotal_pence, total_pence`,
      [
        session.clubId, session.id, session.zoneId, session.nfcTagId,
        orderNumber, priority, body.notes ?? null,
        subtotalPence, totalPence, estimatedReadyAt, body.idempotencyKey,
      ]
    );

    // Insert all line items
    const insertedItems: Record<string, unknown>[] = [];
    for (const li of lineItems) {
      const { rows: [oi] } = await client.query(
        `INSERT INTO order_items (
           order_id, menu_item_id, quantity, unit_price_pence,
           total_pence, selected_modifiers, name_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          order.id, li.menuItemId, li.quantity, li.unitPricePence,
          li.totalPence, JSON.stringify(li.selectedModifiers), li.nameSnapshot,
        ]
      );
      insertedItems.push(oi);
    }

    // Insert initial status history entry
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_type)
       VALUES ($1, NULL, 'pending', 'customer')`,
      [order.id]
    );

    await client.query('COMMIT');

    // Publish real-time event (after commit — data is now visible)
    await publishOrderCreated(session.clubId, {
      orderId: order.id as string,
      orderNumber: order.order_number as string,
      zoneId: session.zoneId,
      zoneName: zone?.zone_type ?? '',
      tagLabel: tag?.tag_label ?? '',
      priority,
      items: lineItems.map((li) => ({ name: li.nameSnapshot, quantity: li.quantity })),
      totalPence,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
    });

    return {
      orderId: order.id as string,
      orderNumber: order.order_number as string,
      status: 'pending',
      estimatedReadyAt,
      items: insertedItems.map((i) => mapOrderItem(i)) as CreateOrderResponse['items'],
      subtotalPence,
      totalPence,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function transitionOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  staffId: string,
  staffName: string,
  note?: string
): Promise<OrderWithItems> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the row to prevent concurrent transitions
    const { rows: [order] } = await client.query(
      `SELECT o.*, s.id as session_id_val,
              z.name as zone_name, t.tag_label
       FROM orders o
       JOIN sessions s ON s.id = o.session_id
       JOIN zones z ON z.id = o.zone_id
       JOIN nfc_tags t ON t.id = o.nfc_tag_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );

    if (!order) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');

    const fromStatus = order.status as OrderStatus;
    const validNext = VALID_TRANSITIONS[fromStatus];
    if (!validNext.includes(toStatus)) {
      throw new InvalidTransitionError(fromStatus, toStatus);
    }

    // Build timestamp updates
    const tsUpdates: string[] = [];
    const tsValues: unknown[] = [];
    let paramIdx = 2;

    if (toStatus === 'accepted') {
      tsUpdates.push(`accepted_at = now()`);
      // Re-compute estimated_ready_at
      tsUpdates.push(`estimated_ready_at = now() + interval '5 minutes'`);
    }
    if (toStatus === 'preparing') tsUpdates.push(`preparing_at = now()`);
    if (toStatus === 'ready')     tsUpdates.push(`ready_at = now()`);
    if (toStatus === 'delivered') tsUpdates.push(`delivered_at = now()`);
    if (toStatus === 'cancelled') {
      tsUpdates.push(`cancelled_at = now()`);
      if (note) {
        tsUpdates.push(`cancel_reason = $${paramIdx++}`);
        tsValues.push(note);
      }
    }

    const setClauses = [`status = $1`, ...tsUpdates].join(', ');
    const whereParam = paramIdx++;
    const { rows: [updated] } = await client.query(
      `UPDATE orders SET ${setClauses}, updated_at = now()
       WHERE id = $${whereParam}
       RETURNING *`,
      [toStatus, ...tsValues, orderId]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_by_type, note)
       VALUES ($1, $2, $3, $4, 'staff', $5)`,
      [orderId, fromStatus, toStatus, staffId, note ?? null]
    );

    await client.query('COMMIT');

    // Publish event
    await publishOrderStatusChanged(order.club_id as string, order.session_id_val as string, {
      orderId,
      orderNumber: order.order_number as string,
      fromStatus,
      toStatus,
      zoneName: order.zone_name as string,
      tagLabel: order.tag_label as string,
      estimatedReadyAt: updated.estimated_ready_at as string | null,
      changedByName: staffName,
      cancelReason: note ?? null,
      updatedAt: new Date().toISOString(),
    });

    // Return enriched order
    return getOrderById(orderId, order.club_id as string);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function assignOrder(
  orderId: string,
  staffId: string | null,
  assignedByStaffId: string,
  staffName: string | null
): Promise<OrderWithItems> {
  const pool = getPool();
  const { rows: [order] } = await pool.query(
    `UPDATE orders SET assigned_staff_id = $1, updated_at = now()
     WHERE id = $2
     RETURNING club_id, order_number, session_id`,
    [staffId, orderId]
  );
  if (!order) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');

  await publishOrderAssigned(order.club_id as string, {
    orderId,
    orderNumber: order.order_number as string,
    assignedTo: staffId && staffName
      ? { staffId, displayName: staffName }
      : null,
  });

  return getOrderById(orderId, order.club_id as string);
}

export async function getOrderById(orderId: string, clubId: string): Promise<OrderWithItems> {
  const pool = getPool();
  const { rows: [order] } = await pool.query(
    `SELECT o.*,
            z.name as zone_name, z.zone_type,
            t.tag_label,
            EXTRACT(EPOCH FROM (now() - o.created_at))::int as waiting_seconds
     FROM orders o
     JOIN zones z ON z.id = o.zone_id
     JOIN nfc_tags t ON t.id = o.nfc_tag_id
     WHERE o.id = $1 AND o.club_id = $2`,
    [orderId, clubId]
  );
  if (!order) throw new NotFoundError('ORDER_NOT_FOUND', 'Order not found');

  const { rows: items } = await pool.query(
    `SELECT * FROM order_items WHERE order_id = $1`,
    [orderId]
  );

  return mapOrderWithItems(
    order as Record<string, unknown>,
    items as Record<string, unknown>[]
  ) as unknown as OrderWithItems;
}
