// ─── Core domain models ────────────────────────────────────────────────────

export interface Club {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  subscriptionTier: 'mvp' | 'pro' | 'enterprise';
  settings: ClubSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClubSettings {
  currency: string;
  currencySymbol: string;
  vipEnabled: boolean;
  maxOrderValuePence: number;
  logoUrl?: string;
  primaryColor?: string;
  autoCancelPendingMinutes: number;
  delayAlertPendingMinutes: number;
  delayAlertPreparingMinutes: number;
}

export interface Zone {
  id: string;
  clubId: string;
  name: string;
  zoneType: 'standard' | 'vip' | 'bar' | 'terrace';
  capacity: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface NfcTag {
  id: string;
  clubId: string;
  zoneId: string;
  tagUid: string;
  tagLabel: string;
  qrFallbackUrl: string | null;
  isActive: boolean;
  lastTappedAt: string | null;
  tapCount: number;
  createdAt: string;
}

export interface Session {
  id: string;
  sessionToken: string;
  clubId: string;
  zoneId: string;
  nfcTagId: string;
  customerName: string | null;
  partySize: number | null;
  deviceFp: string | null;
  expiresAt: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface Staff {
  id: string;
  clubId: string;
  email: string;
  displayName: string;
  role: 'waiter' | 'manager' | 'admin';
  assignedZones: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MenuCategory {
  id: string;
  clubId: string;
  name: string;
  emoji: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuModifierOption {
  label: string;
  priceDeltaPence: number;
}

export interface MenuModifier {
  id: string;
  name: string;
  options: MenuModifierOption[];
  required: boolean;
}

export interface MenuItem {
  id: string;
  clubId: string;
  categoryId: string;
  name: string;
  description: string | null;
  pricePence: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  modifiers: MenuModifier[];
  sortOrder: number;
  prepTimeMins: number;
}

export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type OrderPriority = 'normal' | 'vip' | 'urgent';

export interface Order {
  id: string;
  clubId: string;
  sessionId: string;
  zoneId: string;
  nfcTagId: string;
  assignedStaffId: string | null;
  orderNumber: string;
  status: OrderStatus;
  priority: OrderPriority;
  notes: string | null;
  subtotalPence: number;
  totalPence: number;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  estimatedReadyAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface SelectedModifier {
  modifierId: string;
  modifierName: string;
  optionLabel: string;
  priceDeltaPence: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  unitPricePence: number;
  totalPence: number;
  selectedModifiers: SelectedModifier[];
  nameSnapshot: string;
  createdAt: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  changedByType: 'customer' | 'staff' | 'system' | null;
  note: string | null;
  createdAt: string;
}

// ─── Enriched / joined views ───────────────────────────────────────────────

export interface OrderWithItems extends Order {
  items: OrderItem[];
  zone: Pick<Zone, 'id' | 'name' | 'zoneType'>;
  tag: Pick<NfcTag, 'id' | 'tagLabel'>;
  waitingSeconds?: number;
}

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}

export interface ClubMenu {
  clubId: string;
  categories: MenuCategoryWithItems[];
}
