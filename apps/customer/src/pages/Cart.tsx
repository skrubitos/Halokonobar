import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useSessionStore } from '../store/session.store.js';
import { useCartStore } from '../store/cart.store.js';
import { apiFetch, formatPrice } from '../utils/api.js';
import { Button } from '@halokonobar/ui';
import type { CreateOrderResponse } from '@halokonobar/types';

export function Cart() {
  const navigate = useNavigate();
  const { sessionToken, club } = useSessionStore();
  const { items, notes, idempotencyKey, setNotes, updateQuantity, removeItem, clearCart, totalPence } = useCartStore();
  const symbol = club?.settings.currencySymbol ?? '£';

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateOrderResponse>(
        '/api/v1/orders',
        {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey,
            notes: notes || undefined,
            items: items.map((i) => ({
              menuItemId: i.menuItemId,
              quantity: i.quantity,
              selectedModifiers: i.selectedModifiers,
            })),
          }),
        },
        sessionToken ?? undefined
      ),
    onSuccess: (order) => {
      clearCart();
      navigate(`/orders/${order.orderId}`, { replace: true });
    },
  });

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-5xl mb-4">🛒</div>
          <p className="text-white/60 text-lg mb-6">Your cart is empty</p>
          <button
            onClick={() => navigate('/menu')}
            className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-semibold text-lg"
          >
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 py-4 pt-safe-top">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/menu')} className="text-white/60 text-2xl">←</button>
          <h1 className="text-xl font-bold">Your order</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {items.map((item) => (
          <div key={item.menuItemId} className="bg-white/5 rounded-2xl p-4 flex items-center gap-4 border border-white/10">
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{item.name}</p>
              <p className="text-white/50 text-sm">{formatPrice(item.pricePence, symbol)} each</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                className="w-9 h-9 rounded-full bg-white/10 text-white font-bold text-lg flex items-center justify-center"
              >
                −
              </button>
              <span className="text-white font-bold text-lg w-5 text-center">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                className="w-9 h-9 rounded-full bg-white/10 text-white font-bold text-lg flex items-center justify-center"
              >
                +
              </button>
            </div>
            <span className="text-white font-bold w-16 text-right">
              {formatPrice(item.pricePence * item.quantity, symbol)}
            </span>
          </div>
        ))}

        {/* Notes */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <label className="text-white/60 text-sm mb-2 block">Special requests</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. No ice, extra lime..."
            maxLength={500}
            rows={2}
            className="w-full bg-transparent text-white placeholder-white/30 resize-none focus:outline-none text-base"
          />
        </div>

        {/* Total */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex justify-between items-center">
          <span className="text-white/60 font-medium">Total</span>
          <span className="text-white font-bold text-xl">{formatPrice(totalPence(), symbol)}</span>
        </div>

        {/* Error message */}
        {mutation.isError && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
            {(mutation.error as { message?: string })?.message ?? 'Failed to place order. Please try again.'}
          </div>
        )}
      </main>

      <div className="sticky bottom-0 px-4 pb-safe-bottom pt-4 bg-gray-950 border-t border-white/10">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Place order · {formatPrice(totalPence(), symbol)}
        </Button>
      </div>
    </div>
  );
}
