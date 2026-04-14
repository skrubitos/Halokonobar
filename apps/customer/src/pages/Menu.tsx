import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '../store/session.store.js';
import { useCartStore } from '../store/cart.store.js';
import { apiFetch, formatPrice } from '../utils/api.js';
import { Spinner } from '@halokonobar/ui';
import type { MenuCategoryWithItems, MenuItem } from '@halokonobar/types';

export function Menu() {
  const navigate = useNavigate();
  const { sessionToken, club, zone, tag } = useSessionStore();
  const { addItem, itemCount, totalPence } = useCartStore();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['menu', club?.id],
    queryFn: () =>
      apiFetch<{ clubId: string; categories: MenuCategoryWithItems[] }>(
        `/api/v1/clubs/${club!.id}/menu`,
        {},
        sessionToken ?? undefined
      ),
    enabled: !!club?.id && !!sessionToken,
    staleTime: 60_000,
  });

  const categories = data?.categories ?? [];
  const displayCategory = activeCategory ?? categories[0]?.id ?? null;
  const currentItems = categories.find((c) => c.id === displayCategory)?.items ?? [];

  function handleAdd(item: MenuItem) {
    addItem(item);
    setAddedItems((s) => new Set(s).add(item.id));
    setTimeout(() => {
      setAddedItems((s) => { const n = new Set(s); n.delete(item.id); return n; });
    }, 800);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-white/60 mb-4">Could not load menu</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 pt-safe-top">
        <div className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">{club?.name}</h1>
              <p className="text-white/50 text-sm">
                {tag?.tagLabel} · {zone?.name}
                {zone?.zoneType === 'vip' && (
                  <span className="ml-2 text-purple-400 text-xs font-bold">VIP</span>
                )}
              </p>
            </div>
            <button
              onClick={() => navigate('/orders')}
              className="text-white/50 text-sm"
            >
              Orders
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                cat.id === displayCategory
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              {cat.emoji && <span className="mr-1">{cat.emoji}</span>}
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* Menu items */}
      <main className="flex-1 px-4 py-4 pb-32">
        <div className="space-y-3">
          {currentItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              added={addedItems.has(item.id)}
              onAdd={() => handleAdd(item)}
            />
          ))}
        </div>
      </main>

      {/* Cart bar — visible when cart has items */}
      {itemCount() > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe-bottom bg-gradient-to-t from-gray-950 to-transparent">
          <button
            onClick={() => navigate('/cart')}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl text-lg flex items-center justify-between px-6 shadow-xl"
          >
            <span className="bg-indigo-500 text-white text-sm font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
              {itemCount()}
            </span>
            <span>View order</span>
            <span>{formatPrice(totalPence(), club?.settings.currencySymbol)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItemCard({
  item,
  added,
  onAdd,
}: {
  item: MenuItem;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={`bg-white/5 rounded-2xl p-4 flex gap-4 border transition-colors ${
        item.isAvailable ? 'border-white/10' : 'border-white/5 opacity-50'
      }`}
    >
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
          loading="lazy"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base leading-tight">
              {item.isFeatured && <span className="text-yellow-400 mr-1">★</span>}
              {item.name}
            </h3>
            {item.description && (
              <p className="text-white/50 text-sm mt-1 line-clamp-2">{item.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-white font-bold text-lg">
            £{(item.pricePence / 100).toFixed(2)}
          </span>

          <button
            onClick={onAdd}
            disabled={!item.isAvailable}
            className={`min-w-[44px] min-h-[44px] rounded-xl font-bold text-xl transition-all ${
              added
                ? 'bg-green-600 text-white scale-95'
                : item.isAvailable
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            {added ? '✓' : item.isAvailable ? '+' : '—'}
          </button>
        </div>
      </div>
    </div>
  );
}
