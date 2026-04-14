import type { OrderStatus, OrderPriority } from './models.js';

// ─── WebSocket message envelope ────────────────────────────────────────────

export interface WsMessage<T = unknown> {
  event: string;
  payload: T;
}

// ─── Client → Server messages ──────────────────────────────────────────────

export interface WsAuthMessage {
  type: 'auth';
  token: string;
}

export interface WsPingMessage {
  type: 'ping';
}

export type WsClientMessage = WsAuthMessage | WsPingMessage;

// ─── Server → Client messages ──────────────────────────────────────────────

export interface WsAuthOkMessage {
  type: 'auth_ok';
  subscribedChannels: string[];
}

export interface WsAuthErrorMessage {
  type: 'auth_error';
  message: string;
}

export interface WsPongMessage {
  type: 'pong';
  ts: number;
}

// ─── Domain event payloads ─────────────────────────────────────────────────

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  zoneId: string;
  zoneName: string;
  tagLabel: string;
  priority: OrderPriority;
  items: Array<{ name: string; quantity: number }>;
  totalPence: number;
  notes: string | null;
  createdAt: string;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  zoneName: string;
  tagLabel: string;
  estimatedReadyAt: string | null;
  changedByName: string | null;
  cancelReason: string | null;
  updatedAt: string;
}

export interface OrderAssignedPayload {
  orderId: string;
  orderNumber: string;
  assignedTo: { staffId: string; displayName: string } | null;
}

export interface OrderDelayedAlertPayload {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  waitingSeconds: number;
  zoneName: string;
  tagLabel: string;
}

export interface MenuItemAvailabilityChangedPayload {
  menuItemId: string;
  name: string;
  isAvailable: boolean;
}

// ─── Typed event union ─────────────────────────────────────────────────────

export type WsEvent =
  | WsMessage<OrderCreatedPayload> & { event: 'order.created' }
  | WsMessage<OrderStatusChangedPayload> & { event: 'order.status_changed' }
  | WsMessage<OrderAssignedPayload> & { event: 'order.assigned' }
  | WsMessage<OrderDelayedAlertPayload> & { event: 'order.delayed_alert' }
  | WsMessage<MenuItemAvailabilityChangedPayload> & { event: 'menu.item_availability_changed' };
