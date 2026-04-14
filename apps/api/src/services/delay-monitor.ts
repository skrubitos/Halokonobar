/**
 * Background worker that detects delayed orders and publishes alert events.
 * Runs every 60 seconds. Designed to run in a single designated instance
 * (or as a separate lightweight worker process at scale).
 *
 * Also handles auto-cancellation of unaccepted pending orders.
 */
import { getPool } from '@halokonobar/db';
import { publishOrderDelayedAlert, publishOrderStatusChanged } from './realtime.service.js';

interface DelayConfig {
  pendingAlertMinutes: number;
  preparingAlertMinutes: number;
  autoCancelPendingMinutes: number;
}

const DEFAULT_CONFIG: DelayConfig = {
  pendingAlertMinutes: 3,
  preparingAlertMinutes: 15,
  autoCancelPendingMinutes: 10,
};

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startDelayMonitor(): void {
  if (monitorInterval) return;

  monitorInterval = setInterval(() => {
    runDelayCheck().catch((err) => {
      console.error('[delay-monitor] Error during delay check:', err);
    });
  }, 60_000);

  console.info('[delay-monitor] Started');
}

export function stopDelayMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

async function runDelayCheck(): Promise<void> {
  const pool = getPool();

  // Fetch club configs for auto-cancel settings
  const { rows: clubs } = await pool.query(
    `SELECT id, settings FROM clubs WHERE is_active = true`
  );

  const configByClub = new Map<string, DelayConfig>();
  for (const club of clubs) {
    const s = club.settings as Partial<DelayConfig> & Record<string, unknown>;
    configByClub.set(club.id as string, {
      pendingAlertMinutes: Number(s['delayAlertPendingMinutes'] ?? DEFAULT_CONFIG.pendingAlertMinutes),
      preparingAlertMinutes: Number(s['delayAlertPreparingMinutes'] ?? DEFAULT_CONFIG.preparingAlertMinutes),
      autoCancelPendingMinutes: Number(s['autoCancelPendingMinutes'] ?? DEFAULT_CONFIG.autoCancelPendingMinutes),
    });
  }

  // Find delayed/overdue orders
  const { rows: orders } = await pool.query(
    `SELECT o.id, o.club_id, o.status, o.order_number, o.session_id,
            o.estimated_ready_at, o.created_at, o.accepted_at, o.preparing_at,
            z.name as zone_name, t.tag_label,
            EXTRACT(EPOCH FROM (now() - o.created_at))::int as waiting_seconds
     FROM orders o
     JOIN zones z ON z.id = o.zone_id
     JOIN nfc_tags t ON t.id = o.nfc_tag_id
     WHERE o.status IN ('pending', 'accepted', 'preparing')`
  );

  for (const order of orders) {
    const cfg = configByClub.get(order.club_id as string) ?? DEFAULT_CONFIG;
    const waitSeconds = order.waiting_seconds as number;
    const status = order.status as string;

    // Auto-cancel stale pending orders
    if (
      status === 'pending' &&
      waitSeconds > cfg.autoCancelPendingMinutes * 60
    ) {
      try {
        await pool.query(
          `UPDATE orders
           SET status = 'cancelled', cancelled_at = now(), updated_at = now(),
               cancel_reason = 'Not accepted in time'
           WHERE id = $1 AND status = 'pending'`,
          [order.id]
        );
        await pool.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_type, note)
           VALUES ($1, 'pending', 'cancelled', 'system', 'Auto-cancelled: not accepted in time')`,
          [order.id]
        );
        await publishOrderStatusChanged(order.club_id as string, order.session_id as string, {
          orderId: order.id as string,
          orderNumber: order.order_number as string,
          fromStatus: 'pending',
          toStatus: 'cancelled',
          zoneName: order.zone_name as string,
          tagLabel: order.tag_label as string,
          estimatedReadyAt: null,
          changedByName: null,
          cancelReason: 'Not accepted in time',
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[delay-monitor] Auto-cancel failed for order', order.id, err);
      }
      continue;
    }

    // Alert for overdue pending orders
    if (status === 'pending' && waitSeconds > cfg.pendingAlertMinutes * 60) {
      await publishOrderDelayedAlert(order.club_id as string, {
        orderId: order.id as string,
        orderNumber: order.order_number as string,
        status: 'pending',
        waitingSeconds: waitSeconds,
        zoneName: order.zone_name as string,
        tagLabel: order.tag_label as string,
      });
    }

    // Alert for overdue preparing orders
    if (
      status === 'preparing' &&
      order.preparing_at &&
      waitSeconds > cfg.preparingAlertMinutes * 60
    ) {
      await publishOrderDelayedAlert(order.club_id as string, {
        orderId: order.id as string,
        orderNumber: order.order_number as string,
        status: 'preparing',
        waitingSeconds: waitSeconds,
        zoneName: order.zone_name as string,
        tagLabel: order.tag_label as string,
      });
    }

    // Alert for accepted orders past estimated ready time
    if (
      status === 'accepted' &&
      order.estimated_ready_at &&
      new Date(order.estimated_ready_at as string) < new Date()
    ) {
      await publishOrderDelayedAlert(order.club_id as string, {
        orderId: order.id as string,
        orderNumber: order.order_number as string,
        status: 'accepted',
        waitingSeconds: waitSeconds,
        zoneName: order.zone_name as string,
        tagLabel: order.tag_label as string,
      });
    }
  }
}
