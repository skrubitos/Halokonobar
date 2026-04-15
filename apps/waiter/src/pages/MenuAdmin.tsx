import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store.js';
import { useI18n } from '../i18n/context.js';
import { apiFetch, formatPrice } from '../utils/api.js';

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
}

interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_pence: number;
  is_available: boolean;
  is_featured: boolean;
  prep_time_mins: number;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-checked={checked ? 'true' : 'false'}
      role="switch"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-white/20'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function EditItemModal({
  item,
  categories,
  clubId,
  token,
  onClose,
}: {
  item: MenuItem | null;
  categories: Category[];
  clubId: string;
  token: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const isNew = item === null;

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [pricePounds, setPricePounds] = useState(
    item ? (item.price_pence / 100).toFixed(2) : ''
  );
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? '');
  const [prepTime, setPrepTime] = useState(String(item?.prep_time_mins ?? 3));
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const pricePence = Math.round(parseFloat(pricePounds) * 100);
      if (isNaN(pricePence) || pricePence < 0) throw new Error(t.enterValidPrice);
      if (!name.trim()) throw new Error(t.nameRequired);

      const body = {
        categoryId,
        name: name.trim(),
        description: description.trim() || undefined,
        pricePence,
        prepTimeMins: parseInt(prepTime) || 3,
        isFeatured,
        isAvailable,
      };

      if (isNew) {
        return apiFetch(`/api/v1/admin/clubs/${clubId}/menu/items`, {
          method: 'POST',
          body: JSON.stringify(body),
        }, token);
      } else {
        return apiFetch(`/api/v1/admin/clubs/${clubId}/menu/items/${item!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }, token);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-menu-items', clubId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-safe-bottom">
      <div className="w-full max-w-lg bg-gray-900 rounded-2xl border border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-lg font-bold">{isNew ? t.newItem : t.editItem}</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-white/60 text-sm block mb-1">{t.itemName} *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
              placeholder={t.itemNamePlaceholder}
            />
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">{t.description}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              title={t.description}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 resize-none"
              placeholder={t.descriptionPlaceholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/60 text-sm block mb-1">{t.price} *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricePounds}
                onChange={(e) => setPricePounds(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-white/60 text-sm block mb-1">{t.prepTime}</label>
              <input
                type="number"
                min="1"
                max="60"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">{t.category}</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              title={t.category}
              className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-gray-900">
                  {c.emoji ? `${c.emoji} ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-white/60 text-sm">{t.available}</span>
            <Toggle checked={isAvailable} onChange={setIsAvailable} />
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-white/60 text-sm">{t.featured}</span>
            <Toggle checked={isFeatured} onChange={setIsFeatured} />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/20 text-white/60 font-semibold"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuAdmin() {
  const { accessToken, staff } = useAuthStore();
  const { t } = useI18n();
  const clubId = staff?.clubId ?? '';
  const qc = useQueryClient();

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | 'new' | null>(null);

  const { data: catData } = useQuery({
    queryKey: ['admin-menu-categories', clubId],
    queryFn: () =>
      apiFetch<{ categories: Category[] }>(
        `/api/v1/admin/clubs/${clubId}/menu/categories`,
        {},
        accessToken ?? undefined
      ),
    enabled: !!clubId && !!accessToken,
  });

  const { data: itemsData } = useQuery({
    queryKey: ['admin-menu-items', clubId],
    queryFn: () =>
      apiFetch<{ items: MenuItem[] }>(
        `/api/v1/admin/clubs/${clubId}/menu/items`,
        {},
        accessToken ?? undefined
      ),
    enabled: !!clubId && !!accessToken,
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) =>
      apiFetch(
        `/api/v1/admin/clubs/${clubId}/menu/items/${itemId}`,
        { method: 'PATCH', body: JSON.stringify({ isAvailable }) },
        accessToken ?? undefined
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-menu-items', clubId] }),
  });

  const categories = catData?.categories ?? [];
  const allItems = itemsData?.items ?? [];

  const displayCategoryId = activeCategoryId ?? categories[0]?.id ?? null;
  const currentItems = allItems.filter((i) => i.category_id === displayCategoryId);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-white/10 px-4 pt-safe-top">
        <div className="py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t.menuManagement}</h1>
          <button
            type="button"
            onClick={() => setEditingItem('new')}
            className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            {t.addItem}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategoryId(cat.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                cat.id === displayCategoryId
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

      <main className="flex-1 px-4 py-4 space-y-3 pb-24">
        {currentItems.length === 0 && (
          <div className="text-center text-white/30 py-16">{t.noItemsInCategory}</div>
        )}
        {currentItems.map((item) => (
          <div
            key={item.id}
            className={`bg-white/5 rounded-2xl p-4 border transition-colors ${
              item.is_available ? 'border-white/10' : 'border-white/5 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {item.is_featured && <span className="text-yellow-400 text-sm">★</span>}
                  <p className="font-semibold text-base leading-tight">{item.name}</p>
                </div>
                {item.description && (
                  <p className="text-white/40 text-sm mt-0.5 line-clamp-1">{item.description}</p>
                )}
                <p className="text-white font-bold text-lg mt-2">
                  {formatPrice(item.price_pence)}
                </p>
              </div>

              <div className="flex flex-col items-end gap-3">
                <Toggle
                  checked={item.is_available}
                  onChange={(v) => toggleAvailability.mutate({ itemId: item.id, isAvailable: v })}
                />
                <button
                  type="button"
                  onClick={() => setEditingItem(item)}
                  className="text-white/40 hover:text-white text-sm px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
                >
                  {t.editItem}
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>

      {editingItem !== null && (
        <EditItemModal
          item={editingItem === 'new' ? null : editingItem}
          categories={categories}
          clubId={clubId}
          token={accessToken ?? ''}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
