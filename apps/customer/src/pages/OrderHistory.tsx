import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../store/session.store.js';
import { apiFetch, formatPrice } from '../utils/api.js';
import { StatusBadge } from '@halokonobar/ui';
import type { ListOrdersResponse } from '@halokonobar/types';

export function OrderHistory() {
  const navigate = useNavigate();
  const { sessionToken, club } = useSessionStore();
  const symbol = club?.settings.currencySymbol ?? '£';

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () =>
      apiFetch<ListOrdersResponse>(
        '/api/v1/orders?status=all',
        {},
        sessionToken ?? undefined
      ),
    enabled: !!sessionToken,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiFetch<{ orderId: string }>(
        `/api/v1/orders/${orderId}/reorder`,
        { method: 'POST' },
        sessionToken ?? undefined
      ),
    onSuccess: (res) => navigate(`/orders/${res.orderId}`),
  });

  const orders = data?.orders ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-4 pt-safe-top">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/menu')} className="text-white/60 text-2xl">←</button>
          <h1 className="text-xl font-bold">Your orders</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        {isLoading && (
          <div className="text-center py-16 text-white/40">Loading...</div>
        )}

        {!isLoading && orders.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-white/60">No orders yet</p>
            <button
              onClick={() => navigate('/menu')}
              className="mt-6 text-indigo-400 font-semibold"
            >
              Order something
            </button>
          </div>
        )}

        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => navigate(`/orders/${order.id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{order.orderNumber}</span>
                    <StatusBadge
                      status={order.status}
                      pulse={!['delivered', 'cancelled'].includes(order.status)}
                    />
                  </div>
                  <span className="text-white/60 text-sm">
                    {formatPrice(order.totalPence, symbol)}
                  </span>
                </div>
                <p className="text-white/40 text-sm">
                  {order.items?.slice(0, 2).map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(', ')}
                  {(order.items?.length ?? 0) > 2 && ` +${(order.items?.length ?? 0) - 2} more`}
                </p>
                <p className="text-white/30 text-xs mt-1">
                  {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {order.status === 'delivered' && (
                <div className="px-4 pb-4">
                  <button
                    onClick={() => reorderMutation.mutate(order.id)}
                    disabled={reorderMutation.isPending}
                    className="w-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-semibold py-3 rounded-xl text-sm"
                  >
                    {reorderMutation.isPending ? 'Ordering...' : 'Reorder the same'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
