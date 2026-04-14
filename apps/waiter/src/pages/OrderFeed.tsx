import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { apiFetch, formatPrice, timeAgo } from '../utils/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useNotifications, playNotificationSound, vibrate, showBrowserNotification } from '../hooks/useNotifications.js';
import { StatusBadge, PriorityBadge } from '@halokonobar/ui';
import type { StaffOrdersResponse, OrderWithItems, OrderStatus, WsEvent } from '@halokonobar/types';

const STATUS_ACTIONS: Record<OrderStatus, { label: string; next: OrderStatus; color: string } | null> = {
  pending:   { label: 'Accept', next: 'accepted', color: 'bg-blue-600' },
  accepted:  { label: 'Start making', next: 'preparing', color: 'bg-orange-500' },
  preparing: { label: 'Ready', next: 'ready', color: 'bg-green-600' },
  ready:     { label: 'Delivered', next: 'delivered', color: 'bg-indigo-600' },
  delivered: null,
  cancelled: null,
};

export function OrderFeed() {
  const navigate = useNavigate();
  const { accessToken, staff, clearAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing'>('all');
  const [wsConnected, setWsConnected] = useState(false);

  useNotifications();

  const { data, isLoading } = useQuery({
    queryKey: ['staff-orders', filter],
    queryFn: () =>
      apiFetch<StaffOrdersResponse>(
        `/api/v1/staff/orders${filter !== 'all' ? `?status=${filter}` : ''}`,
        {},
        accessToken ?? undefined
      ),
    enabled: !!accessToken,
    refetchInterval: wsConnected ? false : 15_000, // poll if WS not connected
  });

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      apiFetch(
        `/api/v1/staff/orders/${orderId}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        accessToken ?? undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
    },
  });

  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event.event === 'order.created') {
        queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
        playNotificationSound();
        vibrate([200, 100, 200]);
        showBrowserNotification(
          `New order: ${event.payload.orderNumber}`,
          `${event.payload.tagLabel} — ${event.payload.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`
        );
      }
      if (event.event === 'order.status_changed') {
        queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      }
      if (event.event === 'order.delayed_alert') {
        queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
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

  const orders = data?.orders ?? [];
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-4 pt-safe-top">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Orders</h1>
            {pendingCount > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {pendingCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} title={wsConnected ? 'Live' : 'Reconnecting...'} />
            <button onClick={() => { clearAuth(); navigate('/login', { replace: true }); }} className="text-white/40 text-sm">
              Logout
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'pending', 'preparing'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/60'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {/* Order list */}
      <main className="flex-1 px-4 py-4 space-y-3">
        {isLoading && <div className="text-center py-16 text-white/40">Loading orders...</div>}

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">✅</div>
            <p className="text-white/60 text-lg">All clear</p>
            <p className="text-white/30 text-sm mt-1">No active orders</p>
          </div>
        )}

        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onStatusChange={(status) =>
              statusMutation.mutate({ orderId: order.id, status })
            }
            loading={statusMutation.isPending && statusMutation.variables?.orderId === order.id}
          />
        ))}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  onStatusChange,
  loading,
}: {
  order: OrderWithItems;
  onStatusChange: (status: OrderStatus) => void;
  loading: boolean;
}) {
  const action = STATUS_ACTIONS[order.status];
  const isDelayed = (order.waitingSeconds ?? 0) > 300 && !['delivered', 'cancelled', 'ready'].includes(order.status);

  return (
    <div className={`rounded-2xl border overflow-hidden ${
      isDelayed ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/5'
    }`}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-lg">{order.orderNumber}</span>
            <StatusBadge status={order.status} pulse={order.status === 'pending'} />
            <PriorityBadge priority={order.priority} />
            {isDelayed && (
              <span className="text-red-400 text-xs font-bold animate-pulse">DELAYED</span>
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

      {/* Items list */}
      <div className="px-4 pb-3 space-y-1">
        {order.items?.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-white/80">
              {item.quantity}× {item.nameSnapshot}
            </span>
            <span className="text-white/40">{formatPrice(item.totalPence)}</span>
          </div>
        ))}
        {order.notes && (
          <p className="text-yellow-300/80 text-sm mt-2 italic">"{order.notes}"</p>
        )}
      </div>

      {/* Action button */}
      {action && (
        <div className="px-4 pb-4">
          <button
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
