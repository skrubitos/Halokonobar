import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '../store/session.store.js';
import { apiFetch, formatPrice } from '../utils/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { StatusBadge } from '@halokonobar/ui';
import type { OrderDetailResponse, WsEvent } from '@halokonobar/types';

const STATUS_STEPS = ['pending', 'accepted', 'preparing', 'ready', 'delivered'] as const;

const STATUS_LABELS: Record<string, string> = {
  pending:   'Order received',
  accepted:  'Accepted by staff',
  preparing: 'Being prepared',
  ready:     'Ready for delivery',
  delivered: 'Delivered!',
  cancelled: 'Cancelled',
};

const STATUS_EMOJI: Record<string, string> = {
  pending:   '⏳',
  accepted:  '👍',
  preparing: '🍸',
  ready:     '🚀',
  delivered: '✅',
  cancelled: '❌',
};

export function OrderStatus() {
  const { order_id } = useParams<{ order_id: string }>();
  const navigate = useNavigate();
  const { sessionToken, club } = useSessionStore();
  const queryClient = useQueryClient();
  const symbol = club?.settings.currencySymbol ?? '£';

  const { data: order, isLoading } = useQuery<OrderDetailResponse>({
    queryKey: ['order', order_id],
    queryFn: () =>
      apiFetch<OrderDetailResponse>(
        `/api/v1/orders/${order_id}`,
        {},
        sessionToken ?? undefined
      ),
    enabled: !!order_id && !!sessionToken,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'delivered' || s === 'cancelled' ? false : 30_000;
    },
  });

  // Live status updates via WebSocket
  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event.event === 'order.status_changed' && event.payload.orderId === order_id) {
        queryClient.invalidateQueries({ queryKey: ['order', order_id] });
      }
    },
    [order_id, queryClient]
  );

  useWebSocket({ token: sessionToken, onEvent: handleWsEvent });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white/60">Loading order...</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-white/60 mb-4">Order not found</p>
          <button onClick={() => navigate('/menu')} className="text-indigo-400">Back to menu</button>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';
  const stepIndex = STATUS_STEPS.indexOf(order.status as typeof STATUS_STEPS[number]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-4 pt-safe-top">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/orders')} className="text-white/60 text-2xl">←</button>
          <div>
            <h1 className="text-lg font-bold">Order {order.orderNumber}</h1>
            <p className="text-white/50 text-sm">{order.tag?.tagLabel}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        {/* Big status indicator */}
        <div className="text-center py-8">
          <div className="text-7xl mb-4">{STATUS_EMOJI[order.status] ?? '⏳'}</div>
          <h2 className="text-2xl font-bold mb-2">{STATUS_LABELS[order.status]}</h2>
          <StatusBadge status={order.status} pulse={!isDelivered && !isCancelled} />

          {order.estimatedReadyAt && !isDelivered && !isCancelled && (
            <p className="text-white/50 text-sm mt-3">
              Est. ready: {new Date(order.estimatedReadyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {isCancelled && order.cancelReason && (
            <p className="text-red-400/80 text-sm mt-3">{order.cancelReason}</p>
          )}
        </div>

        {/* Progress steps */}
        {!isCancelled && (
          <div className="flex items-center justify-between px-2">
            {STATUS_STEPS.map((step, i) => (
              <React.Fragment key={step}>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i <= stepIndex
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/10 text-white/30'
                  }`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span className="text-white/40 text-xs mt-1 text-center max-w-[48px] leading-tight">
                    {step === 'pending' ? 'Received' :
                     step === 'accepted' ? 'Accepted' :
                     step === 'preparing' ? 'Making' :
                     step === 'ready' ? 'Ready' : 'Done'}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 transition-colors ${
                    i < stepIndex ? 'bg-indigo-600' : 'bg-white/10'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Order items */}
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="font-semibold text-white/80">Items</h3>
          </div>
          {order.items?.map((item) => (
            <div key={item.id} className="px-4 py-3 flex justify-between border-b border-white/5 last:border-0">
              <span className="text-white">
                {item.quantity}× {item.nameSnapshot}
              </span>
              <span className="text-white/60">{formatPrice(item.totalPence, symbol)}</span>
            </div>
          ))}
          <div className="px-4 py-3 flex justify-between font-bold">
            <span>Total</span>
            <span>{formatPrice(order.totalPence, symbol)}</span>
          </div>
        </div>
      </main>

      <div className="px-4 pb-safe-bottom pt-4 border-t border-white/10 flex gap-3">
        <button
          onClick={() => navigate('/menu')}
          className="flex-1 bg-white/10 text-white font-semibold py-4 rounded-2xl"
        >
          Back to menu
        </button>
        {isDelivered && (
          <button
            onClick={() => navigate(`/orders/${order_id}/reorder`)}
            className="flex-1 bg-indigo-600 text-white font-semibold py-4 rounded-2xl"
          >
            Reorder
          </button>
        )}
      </div>
    </div>
  );
}
