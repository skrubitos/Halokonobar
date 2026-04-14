import { getPublisher } from '@halokonobar/db';
import type {
  OrderCreatedPayload,
  OrderStatusChangedPayload,
  OrderAssignedPayload,
  OrderDelayedAlertPayload,
  MenuItemAvailabilityChangedPayload,
} from '@halokonobar/types';

async function publish(channel: string, event: object): Promise<void> {
  const publisher = getPublisher();
  await publisher.publish(channel, JSON.stringify(event));
}

export async function publishOrderCreated(
  clubId: string,
  payload: OrderCreatedPayload
): Promise<void> {
  await publish(`club:${clubId}:orders`, { event: 'order.created', payload });
}

export async function publishOrderStatusChanged(
  clubId: string,
  sessionId: string,
  payload: OrderStatusChangedPayload
): Promise<void> {
  // Broadcast to all staff AND to the specific customer session
  await Promise.all([
    publish(`club:${clubId}:orders`, { event: 'order.status_changed', payload }),
    publish(`club:${clubId}:session:${sessionId}`, { event: 'order.status_changed', payload }),
  ]);
}

export async function publishOrderAssigned(
  clubId: string,
  payload: OrderAssignedPayload
): Promise<void> {
  await publish(`club:${clubId}:orders`, { event: 'order.assigned', payload });
}

export async function publishOrderDelayedAlert(
  clubId: string,
  payload: OrderDelayedAlertPayload
): Promise<void> {
  await publish(`club:${clubId}:orders`, { event: 'order.delayed_alert', payload });
}

export async function publishMenuItemAvailabilityChanged(
  clubId: string,
  payload: MenuItemAvailabilityChangedPayload
): Promise<void> {
  await publish(`club:${clubId}:menu`, { event: 'menu.item_availability_changed', payload });
}
