import { create } from 'zustand';
import { randomUUID } from '../utils/uuid.js';
import type { MenuItem } from '@halokonobar/types';

export interface CartItem {
  menuItemId: string;
  name: string;
  pricePence: number;
  quantity: number;
  selectedModifiers: Array<{ modifierId: string; optionLabel: string }>;
}

interface CartState {
  items: CartItem[];
  idempotencyKey: string;
  notes: string;

  addItem: (item: MenuItem, modifiers?: CartItem['selectedModifiers']) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  totalPence: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  idempotencyKey: randomUUID(),
  notes: '',

  addItem: (item, modifiers = []) => {
    set((state) => {
      const existing = state.items.find((i) => i.menuItemId === item.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            menuItemId: item.id,
            name: item.name,
            pricePence: item.pricePence,
            quantity: 1,
            selectedModifiers: modifiers,
          },
        ],
      };
    });
  },

  removeItem: (menuItemId) =>
    set((state) => ({ items: state.items.filter((i) => i.menuItemId !== menuItemId) })),

  updateQuantity: (menuItemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.menuItemId === menuItemId ? { ...i, quantity } : i
      ),
    }));
  },

  setNotes: (notes) => set({ notes }),

  clearCart: () => set({ items: [], idempotencyKey: randomUUID(), notes: '' }),

  totalPence: () => get().items.reduce((sum, i) => sum + i.pricePence * i.quantity, 0),

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
