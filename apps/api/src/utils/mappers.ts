/**
 * Maps raw PostgreSQL snake_case rows to camelCase API types.
 */

type Row = Record<string, unknown>;

export function mapOrder(r: Row) {
  return {
    id:               r['id'],
    clubId:           r['club_id'],
    sessionId:        r['session_id'],
    zoneId:           r['zone_id'],
    nfcTagId:         r['nfc_tag_id'],
    assignedStaffId:  r['assigned_staff_id'] ?? null,
    orderNumber:      r['order_number'],
    status:           r['status'],
    priority:         r['priority'],
    notes:            r['notes'] ?? null,
    subtotalPence:    r['subtotal_pence'],
    totalPence:       r['total_pence'],
    acceptedAt:       r['accepted_at'] ?? null,
    preparingAt:      r['preparing_at'] ?? null,
    readyAt:          r['ready_at'] ?? null,
    deliveredAt:      r['delivered_at'] ?? null,
    cancelledAt:      r['cancelled_at'] ?? null,
    cancelReason:     r['cancel_reason'] ?? null,
    estimatedReadyAt: r['estimated_ready_at'] ?? null,
    idempotencyKey:   r['idempotency_key'],
    createdAt:        r['created_at'],
    updatedAt:        r['updated_at'],
  };
}

export function mapOrderItem(r: Row) {
  return {
    id:                 r['id'],
    orderId:            r['order_id'],
    menuItemId:         r['menu_item_id'],
    quantity:           r['quantity'],
    unitPricePence:     r['unit_price_pence'],
    totalPence:         r['total_pence'],
    selectedModifiers:  r['selected_modifiers'] ?? [],
    nameSnapshot:       r['name_snapshot'],
    createdAt:          r['created_at'],
  };
}

export function mapOrderWithItems(
  r: Row,
  items: Row[]
) {
  return {
    ...mapOrder(r),
    zone: {
      id:       r['zone_id'],
      name:     r['zone_name'],
      zoneType: r['zone_type'],
    },
    tag: {
      id:       r['nfc_tag_id'],
      tagLabel: r['tag_label'],
    },
    waitingSeconds: r['waiting_seconds'] ?? null,
    assignedStaffName: r['assigned_staff_name'] ?? null,
    items: items.map(mapOrderItem),
  };
}

export function mapZone(r: Row) {
  return {
    id:               r['id'],
    clubId:           r['club_id'],
    name:             r['name'],
    zoneType:         r['zone_type'],
    capacity:         r['capacity'] ?? null,
    isActive:         r['is_active'],
    sortOrder:        r['sort_order'],
    activeOrderCount: Number(r['active_order_count'] ?? 0),
  };
}

export function mapOrderStatusHistory(r: Row) {
  return {
    id:            r['id'],
    orderId:       r['order_id'],
    fromStatus:    r['from_status'] ?? null,
    toStatus:      r['to_status'],
    changedBy:     r['changed_by'] ?? null,
    changedByType: r['changed_by_type'] ?? null,
    note:          r['note'] ?? null,
    createdAt:     r['created_at'],
  };
}

export function mapDashboardSummary(r: Row) {
  return {
    activeOrdersCount:  Number(r['active_orders_count'] ?? 0),
    pendingOrdersCount: Number(r['pending_orders_count'] ?? 0),
    avgWaitTimeSeconds: Number(r['avg_wait_time_seconds'] ?? 0),
    ordersLastHour:     Number(r['orders_last_hour'] ?? 0),
    revenueTodayPence:  Number(r['revenue_today_pence'] ?? 0),
  };
}
