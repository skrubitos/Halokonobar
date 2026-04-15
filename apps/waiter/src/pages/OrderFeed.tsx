import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { apiFetch, formatPrice, timeAgo } from '../utils/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useNotifications, playNotificationSound, vibrate, showBrowserNotification } from '../hooks/useNotifications.js';
import { useI18n } from '../i18n/context.js';
import { LanguageSwitcher } from '../App.js';
import { StatusBadge, PriorityBadge } from '@halokonobar/ui';
import type {
  StaffOrdersResponse,
  OrderWithItems,
  OrderStatus,
  WsEvent,
  StaffTablesResponse,
  TableStatus,
} from '@halokonobar/types';

// ─── Urgency system ──────────────────────────────────────────────────────────
// Three tiers based on the oldest active order on a table:
//   fresh   = 0–2 min  (green, calm)
//   warning = 2–5 min  (orange, pulsing)
//   critical= 5+ min   (red/black, blinking — maximum eye-pull)

type UrgencyLevel = 'free' | 'fresh' | 'warning' | 'critical';

function tableUrgency(
  tableId: string,
  orders: OrderWithItems[]
): { level: UrgencyLevel; oldestSeconds: number } {
  const active = orders.filter(
    (o) => o.nfcTagId === tableId && !['delivered', 'cancelled'].includes(o.status)
  );
  if (!active.length) return { level: 'free', oldestSeconds: 0 };
  const oldest = Math.max(...active.map((o) => o.waitingSeconds ?? 0));
  const level: UrgencyLevel = oldest >= 300 ? 'critical' : oldest >= 120 ? 'warning' : 'fresh';
  return { level, oldestSeconds: oldest };
}

function fmtWait(s: number): string {
  if (!s) return '';
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

const CARD_STYLE: Record<UrgencyLevel, string> = {
  free:     'border-white/10 bg-white/5',
  fresh:    'border-emerald-500/40 bg-emerald-500/10',
  warning:  'border-orange-400/70 bg-orange-500/10',
  critical: 'border-red-500 bg-black',
};

const TIMER_STYLE: Record<UrgencyLevel, string> = {
  free:     'hidden',
  fresh:    'text-emerald-400 text-xs',
  warning:  'text-orange-400 text-xs font-bold',
  critical: 'text-red-400 text-xs font-bold animate-pulse',
};

const ZONE_EMOJI: Record<string, string> = {
  vip:      '⭐',
  bar:      '🍸',
  terrace:  '🌿',
  standard: '🪑',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Zone segmented control ───────────────────────────────────────────────────
// Shows all zones with live active-order badges so waiter knows which tabs matter.

function ZoneTabs({
  zones,
  selected,
  onSelect,
}: {
  zones: Array<{ id: string; name: string; zoneType: string; activeOrderCount: number }>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
          selected === null ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
        }`}
      >
        {t.zoneAll}
      </button>

      {zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          onClick={() => onSelect(zone.id)}
          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            selected === zone.id ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
          }`}
        >
          <span>{ZONE_EMOJI[zone.zoneType] ?? '🪑'}</span>
          <span>{zone.name}</span>
          {zone.activeOrderCount > 0 && (
            <span
              className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected === zone.id ? 'bg-white/20 text-white' : 'bg-orange-500 text-white'
              }`}
            >
              {zone.activeOrderCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Table card ───────────────────────────────────────────────────────────────
// Urgency-coloured card with timer badge, focus ring, and quick-complete button.

function TableCard({
  table,
  level,
  oldestSeconds,
  isSelected,
  hasReadyOrders,
  onSelect,
  onQuickComplete,
}: {
  table: TableStatus;
  level: UrgencyLevel;
  oldestSeconds: number;
  isSelected: boolean;
  hasReadyOrders: boolean;
  onSelect: () => void;
  onQuickComplete: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative rounded-xl border p-3 text-left transition-all active:scale-95 w-full min-h-[80px]
        ${CARD_STYLE[level]}
        ${isSelected ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-950' : ''}
        ${level === 'warning' ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}
      `}
    >
      {/* Timer — top-left */}
      <span className={`absolute top-2 left-2.5 ${TIMER_STYLE[level]}`}>
        {fmtWait(oldestSeconds)}
      </span>

      {/* Quick-complete checkmark — top-right, visible only when ready orders exist */}
      {hasReadyOrders && (
        <button
          type="button"
          title={t.quickCompleteTitle}
          onClick={(e) => { e.stopPropagation(); onQuickComplete(); }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center transition-colors"
        >
          <CheckIcon />
        </button>
      )}

      {/* Table label */}
      <div className={`font-bold text-sm leading-tight text-white ${oldestSeconds > 0 ? 'mt-4' : 'mt-1'}`}>
        {table.tagLabel}
      </div>

      {/* Order count */}
      <div className="mt-0.5">
        {table.activeOrderCount > 0 ? (
          <span className="text-xs text-white/60">
            {table.activeOrderCount} {t.ordersGroupLabel}{table.activeOrderCount > 1 ? 'e' : 'a'}
          </span>
        ) : (
          <span className="text-xs text-white/25">{t.tableFree}</span>
        )}
      </div>

      {/* Critical ping dot */}
      {level === 'critical' && (
        <span className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-ping" />
      )}
    </button>
  );
}

// ─── BAR anchor ───────────────────────────────────────────────────────────────
// Physical reference point at bottom of floor plan so waiter can orient themselves.

function BarAnchor({ label }: { label: string }) {
  return (
    <div className="mt-5 flex items-center gap-3 px-1">
      <div className="h-px flex-1 bg-amber-500/20" />
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5">
        <span className="text-lg">🍸</span>
        <span className="text-amber-400/80 text-xs font-bold tracking-widest uppercase">{label}</span>
      </div>
      <div className="h-px flex-1 bg-amber-500/20" />
    </div>
  );
}

// ─── Floor plan view ──────────────────────────────────────────────────────────

function FloorPlanView({
  tables,
  orders,
  isLoading,
  selectedZone,
  onZoneChange,
  selectedTagId,
  onSelectTag,
  onQuickComplete,
}: {
  tables: TableStatus[];
  orders: OrderWithItems[];
  isLoading: boolean;
  selectedZone: string | null;
  onZoneChange: (id: string | null) => void;
  selectedTagId: string | null;
  onSelectTag: (tagId: string, tagLabel: string) => void;
  onQuickComplete: (tagId: string) => void;
}) {
  const { t } = useI18n();

  // Compute zone summaries with active order counts
  const zones = useMemo(() => {
    const map = new Map<string, { id: string; name: string; zoneType: string; activeOrderCount: number }>();
    for (const tbl of tables) {
      if (!map.has(tbl.zoneId)) {
        map.set(tbl.zoneId, { id: tbl.zoneId, name: tbl.zoneName, zoneType: tbl.zoneType, activeOrderCount: 0 });
      }
      map.get(tbl.zoneId)!.activeOrderCount += tbl.activeOrderCount;
    }
    return Array.from(map.values());
  }, [tables]);

  const filteredTables = useMemo(
    () => (selectedZone ? tables.filter((t) => t.zoneId === selectedZone) : tables),
    [tables, selectedZone]
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-white/40">{t.loading}</div>;
  }

  // Check if any table in filtered set is a bar zone — show anchor at bottom
  const hasBarZone = filteredTables.some((t) => t.zoneType === 'bar')
    || (!selectedZone && tables.some((t) => t.zoneType === 'bar'));

  return (
    <div>
      {/* Zone segmented control */}
      <ZoneTabs zones={zones} selected={selectedZone} onSelect={onZoneChange} />

      {/* Table grid */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {filteredTables.map((tbl) => {
          const { level, oldestSeconds } = tableUrgency(tbl.id, orders);
          const readyOrders = orders.filter(
            (o) => o.nfcTagId === tbl.id && o.status === 'ready'
          );
          return (
            <TableCard
              key={tbl.id}
              table={tbl}
              level={level}
              oldestSeconds={oldestSeconds}
              isSelected={selectedTagId === tbl.id}
              hasReadyOrders={readyOrders.length > 0}
              onSelect={() => tbl.activeOrderCount > 0 && onSelectTag(tbl.id, tbl.tagLabel)}
              onQuickComplete={() => onQuickComplete(tbl.id)}
            />
          );
        })}
      </div>

      {/* BAR anchor — physical orientation reference */}
      <BarAnchor label={t.barLabel} />
    </div>
  );
}

// ─── Table side panel ─────────────────────────────────────────────────────────
// Appears as a bottom sheet on mobile, right panel on md+ screens.
// Orders are sorted by createdAt (oldest first) so waiter knows what's new vs. old.

function TableSidePanel({
  tagId,
  tagLabel,
  orders,
  statusActions,
  onStatusChange,
  mutatingOrderId,
  onCompleteAllReady,
  completingAll,
  onClose,
}: {
  tagId: string;
  tagLabel: string;
  orders: OrderWithItems[];
  statusActions: Record<string, { label: string; next: OrderStatus; color: string } | null>;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  mutatingOrderId: string | null;
  onCompleteAllReady: () => void;
  completingAll: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();

  // Orders sorted oldest-first — waiter sees what's been waiting longest at top
  const tagOrders = useMemo(
    () =>
      orders
        .filter((o) => o.nfcTagId === tagId && !['delivered', 'cancelled'].includes(o.status))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders, tagId]
  );

  const readyCount = tagOrders.filter((o) => o.status === 'ready').length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — slides up on mobile; on sm+ it's a right-side panel */}
      <div className="fixed bottom-0 left-0 right-0 sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:w-[38%] z-50 bg-gray-900 rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-white/10 flex flex-col max-h-[80vh] sm:max-h-full">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-xl">{tagLabel}</h2>
            {tagOrders.length > 0 && (
              <p className="text-white/40 text-sm mt-0.5">
                {tagOrders.length} aktivn{tagOrders.length === 1 ? 'a' : 'e'} narudžb{tagOrders.length === 1 ? 'a' : 'e'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 text-sm px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 flex-shrink-0"
          >
            {t.tableDrawerClose}
          </button>
        </div>

        {/* Complete all ready — prominent action when delivery is possible */}
        {readyCount > 0 && (
          <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
            <button
              type="button"
              onClick={onCompleteAllReady}
              disabled={completingAll}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-base transition-colors"
            >
              {completingAll ? '...' : `${t.completeAllReady} (${readyCount})`}
            </button>
          </div>
        )}

        {/* Order list — grouped by time of submission, oldest first */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3 pb-safe-bottom">
          {tagOrders.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-white/30">{t.noActiveOrders}</p>
            </div>
          ) : (
            tagOrders.map((order, idx) => (
              <div key={order.id}>
                {/* Time separator — makes the "submitted at X time" grouping explicit */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white/30 text-xs">
                    #{idx + 1} · {timeAgo(order.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <OrderCard
                  order={order}
                  statusActions={statusActions}
                  delayedLabel={t.delayed}
                  onStatusChange={(status) => onStatusChange(order.id, status)}
                  loading={mutatingOrderId === order.id}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── OrderFeed ────────────────────────────────────────────────────────────────

export function OrderFeed() {
  const navigate = useNavigate();
  const { accessToken, clearAuth } = useAuthStore();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing'>('all');
  const [wsConnected, setWsConnected] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<{ id: string; label: string } | null>(null);

  useNotifications();

  const statusActions = {
    pending:   { label: t.actionAccept,      next: 'accepted'  as OrderStatus, color: 'bg-blue-600' },
    accepted:  { label: t.actionStartMaking, next: 'preparing' as OrderStatus, color: 'bg-orange-500' },
    preparing: { label: t.actionReady,       next: 'ready'     as OrderStatus, color: 'bg-green-600' },
    ready:     { label: t.actionDelivered,   next: 'delivered' as OrderStatus, color: 'bg-indigo-600' },
    delivered: null,
    cancelled: null,
  } as const;

  const filterLabels = { all: t.filterAll, pending: t.filterPending, preparing: t.filterPreparing };

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['staff-orders', filter],
    queryFn: () =>
      apiFetch<StaffOrdersResponse>(
        `/api/v1/staff/orders${filter !== 'all' ? `?status=${filter}` : ''}`,
        {},
        accessToken ?? undefined
      ),
    enabled: !!accessToken,
    refetchInterval: wsConnected ? false : 15_000,
  });

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['staff-tables'],
    queryFn: () =>
      apiFetch<StaffTablesResponse>('/api/v1/staff/tables', {}, accessToken ?? undefined),
    enabled: !!accessToken,
    refetchInterval: wsConnected ? false : 15_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      apiFetch(
        `/api/v1/staff/orders/${orderId}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        accessToken ?? undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      queryClient.invalidateQueries({ queryKey: ['staff-tables'] });
    },
  });

  // "Complete all ready" — marks every ready order on a table as delivered
  const completeAllMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      await Promise.all(
        orderIds.map((id) =>
          apiFetch(
            `/api/v1/staff/orders/${id}/status`,
            { method: 'PATCH', body: JSON.stringify({ status: 'delivered' }) },
            accessToken ?? undefined
          )
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      queryClient.invalidateQueries({ queryKey: ['staff-tables'] });
    },
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event.event === 'order.created') {
        queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
        queryClient.invalidateQueries({ queryKey: ['staff-tables'] });
        playNotificationSound();
        vibrate([200, 100, 200]);
        showBrowserNotification(
          `New order: ${event.payload.orderNumber}`,
          `${event.payload.tagLabel} — ${event.payload.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`
        );
      }
      if (event.event === 'order.status_changed') {
        queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
        queryClient.invalidateQueries({ queryKey: ['staff-tables'] });
      }
      if (event.event === 'order.delayed_alert') {
        queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
        queryClient.invalidateQueries({ queryKey: ['staff-tables'] });
        vibrate(400);
      }
    },
    [queryClient]
  );

  useWebSocket({
    token: accessToken,
    onEvent: handleWsEvent,
    onConnect: () => setWsConnected(true),
    onDisconnect: () => setWsConnected(false),
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const orders = data?.orders ?? [];
  const tables = tablesData?.tables ?? [];
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleQuickComplete = useCallback(
    (tagId: string) => {
      const readyIds = orders
        .filter((o) => o.nfcTagId === tagId && o.status === 'ready')
        .map((o) => o.id);
      if (readyIds.length) completeAllMutation.mutate(readyIds);
    },
    [orders, completeAllMutation]
  );

  const handleCompleteAllReady = useCallback(() => {
    if (!selectedTag) return;
    const readyIds = orders
      .filter((o) => o.nfcTagId === selectedTag.id && o.status === 'ready')
      .map((o) => o.id);
    if (readyIds.length) completeAllMutation.mutate(readyIds);
  }, [selectedTag, orders, completeAllMutation]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-4 pt-safe-top">
        <div className="flex items-center justify-between mb-3">

          {/* Title + pending badge */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{t.ordersTitle}</h1>
            {pendingCount > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {pendingCount} {t.newBadge}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <LanguageSwitcher />

            {/* List / Map toggle */}
            <div className="flex items-center bg-white/10 rounded-lg p-0.5">
              <button
                type="button"
                title={t.viewList}
                onClick={() => setView('list')}
                className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'}`}
              >
                <ListIcon />
              </button>
              <button
                type="button"
                title={t.viewMap}
                onClick={() => setView('map')}
                className={`p-1.5 rounded-md transition-colors ${view === 'map' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white'}`}
              >
                <GridIcon />
              </button>
            </div>

            {/* WS status */}
            <div
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`}
              title={wsConnected ? 'Live' : 'Reconnecting...'}
            />

            {/* Logout */}
            <button
              type="button"
              onClick={() => { clearAuth(); navigate('/login', { replace: true }); }}
              className="text-white/40 text-sm"
            >
              {t.logout}
            </button>
          </div>
        </div>

        {/* Filter pills — list view only */}
        {view === 'list' && (
          <div className="flex gap-2">
            {(['all', 'pending', 'preparing'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  filter === f ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
                }`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 py-4 space-y-3">

        {/* ── List view ─────────────────────────────────────────────────── */}
        {view === 'list' && (
          <>
            {isLoading && (
              <div className="text-center py-16 text-white/40">{t.loadingOrders}</div>
            )}
            {!isLoading && orders.length === 0 && (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">✅</div>
                <p className="text-white/60 text-lg">{t.allClear}</p>
                <p className="text-white/30 text-sm mt-1">{t.noActiveOrders}</p>
              </div>
            )}
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                statusActions={statusActions}
                delayedLabel={t.delayed}
                onStatusChange={(status) => statusMutation.mutate({ orderId: order.id, status })}
                loading={statusMutation.isPending && statusMutation.variables?.orderId === order.id}
              />
            ))}
          </>
        )}

        {/* ── Floor plan view ───────────────────────────────────────────── */}
        {view === 'map' && (
          <FloorPlanView
            tables={tables}
            orders={orders}
            isLoading={tablesLoading}
            selectedZone={selectedZone}
            onZoneChange={setSelectedZone}
            selectedTagId={selectedTag?.id ?? null}
            onSelectTag={(id, label) => setSelectedTag({ id, label })}
            onQuickComplete={handleQuickComplete}
          />
        )}
      </main>

      {/* ── Side panel / bottom sheet ───────────────────────────────────── */}
      {selectedTag && (
        <TableSidePanel
          tagId={selectedTag.id}
          tagLabel={selectedTag.label}
          orders={orders}
          statusActions={statusActions}
          onStatusChange={(orderId, status) => statusMutation.mutate({ orderId, status })}
          mutatingOrderId={statusMutation.isPending ? (statusMutation.variables?.orderId ?? null) : null}
          onCompleteAllReady={handleCompleteAllReady}
          completingAll={completeAllMutation.isPending}
          onClose={() => setSelectedTag(null)}
        />
      )}
    </div>
  );
}

// ─── OrderCard ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  statusActions,
  delayedLabel,
  onStatusChange,
  loading,
}: {
  order: OrderWithItems;
  statusActions: Record<string, { label: string; next: OrderStatus; color: string } | null>;
  delayedLabel: string;
  onStatusChange: (status: OrderStatus) => void;
  loading: boolean;
}) {
  const action = statusActions[order.status];
  const isDelayed = (order.waitingSeconds ?? 0) > 300 && !['delivered', 'cancelled', 'ready'].includes(order.status);

  return (
    <div className={`rounded-2xl border overflow-hidden ${
      isDelayed ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/5'
    }`}>
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-lg">{order.orderNumber}</span>
            <StatusBadge status={order.status} pulse={order.status === 'pending'} />
            <PriorityBadge priority={order.priority} />
            {isDelayed && (
              <span className="text-red-400 text-xs font-bold animate-pulse">{delayedLabel}</span>
            )}
          </div>
          <p className="text-white/60 text-sm mt-0.5">
            {order.tag?.tagLabel} · {order.zone?.name}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold">{formatPrice(order.totalPence)}</p>
          <p className="text-white/40 text-xs mt-0.5">{timeAgo(order.createdAt)}</p>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1">
        {order.items?.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-white/80">{item.quantity}× {item.nameSnapshot}</span>
            <span className="text-white/40">{formatPrice(item.totalPence)}</span>
          </div>
        ))}
        {order.notes && (
          <p className="text-yellow-300/80 text-sm mt-2 italic">"{order.notes}"</p>
        )}
      </div>

      {action && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => onStatusChange(action.next)}
            disabled={loading}
            className={`w-full ${action.color} text-white font-bold py-3.5 rounded-xl text-base disabled:opacity-50 active:scale-98 transition-transform`}
          >
            {loading ? '...' : action.label}
          </button>
        </div>
      )}
    </div>
  );
}
