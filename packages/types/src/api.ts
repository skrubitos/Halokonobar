import type {
  Club,
  Zone,
  NfcTag,
  Session,
  Staff,
  Order,
  OrderItem,
  OrderStatus,
  OrderWithItems,
  ClubMenu,
  MenuCategory,
  MenuItem,
  OrderStatusHistoryEntry,
} from './models.js';

// ─── Generic envelope ──────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── NFC / Session ────────────────────────────────────────────────────────

export interface NfcTapResponse {
  sessionToken: string;
  expiresAt: string;
  isReturning: boolean;
  club: Pick<Club, 'id' | 'name' | 'slug' | 'settings'>;
  zone: Pick<Zone, 'id' | 'name' | 'zoneType'>;
  tag: Pick<NfcTag, 'id' | 'tagLabel'>;
}

export interface SessionMeResponse {
  sessionId: string;
  expiresAt: string;
  createdAt: string;
  customerName: string | null;
  partySize: number | null;
  club: Pick<Club, 'id' | 'name' | 'slug'>;
  zone: Pick<Zone, 'id' | 'name' | 'zoneType'>;
  tag: Pick<NfcTag, 'id' | 'tagLabel'>;
}

export interface UpdateSessionBody {
  customerName?: string;
  partySize?: number;
}

// ─── Customer Ordering ────────────────────────────────────────────────────

export interface MenuResponse {
  clubId: string;
  categories: ClubMenu['categories'];
}

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  selectedModifiers: Array<{
    modifierId: string;
    optionLabel: string;
  }>;
}

export interface CreateOrderBody {
  idempotencyKey: string;
  notes?: string;
  items: CreateOrderItemInput[];
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  estimatedReadyAt: string | null;
  items: OrderItem[];
  subtotalPence: number;
  totalPence: number;
}

export interface ListOrdersResponse {
  orders: OrderWithItems[];
}

export interface OrderDetailResponse extends OrderWithItems {
  statusHistory: OrderStatusHistoryEntry[];
}

// ─── Staff Auth ───────────────────────────────────────────────────────────

export interface StaffLoginBody {
  email: string;
  password: string;
}

export interface StaffLoginResponse {
  accessToken: string;
  expiresIn: number;
  staff: Staff;
}

// ─── Waiter Dashboard ────────────────────────────────────────────────────

export interface StaffOrdersQuery {
  status?: string;
  zoneId?: string;
  since?: string;
  limit?: number;
}

export interface StaffOrdersResponse {
  orders: OrderWithItems[];
}

export interface UpdateOrderStatusBody {
  status: OrderStatus;
  note?: string;
}

export interface AssignOrderBody {
  staffId: string | null;
}

export interface ZoneSummary extends Zone {
  activeOrderCount: number;
}

export interface DashboardSummaryResponse {
  activeOrdersCount: number;
  avgWaitTimeSeconds: number;
  ordersLastHour: number;
  revenueTodayPence: number;
  pendingOrdersCount: number;
}

// ─── Admin ────────────────────────────────────────────────────────────────

export interface CreateMenuCategoryBody {
  name: string;
  emoji?: string;
  sortOrder?: number;
}

export interface UpdateMenuCategoryBody {
  name?: string;
  emoji?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateMenuItemBody {
  categoryId: string;
  name: string;
  description?: string;
  pricePence: number;
  imageUrl?: string;
  isAvailable?: boolean;
  isFeatured?: boolean;
  modifiers?: MenuItem['modifiers'];
  sortOrder?: number;
  prepTimeMins?: number;
}

export interface UpdateMenuItemBody {
  categoryId?: string;
  name?: string;
  description?: string;
  pricePence?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  isFeatured?: boolean;
  modifiers?: MenuItem['modifiers'];
  sortOrder?: number;
  prepTimeMins?: number;
}

export interface CreateNfcTagBody {
  zoneId: string;
  tagUid: string;
  tagLabel: string;
}

export interface TableStatus {
  id: string;
  tagLabel: string;
  zoneId: string;
  zoneName: string;
  zoneType: Zone['zoneType'];
  activeOrderCount: number;
  worstStatus: OrderStatus | null; // null = free / no active orders
  hasPending: boolean;
  hasDelayed: boolean;
}

export interface StaffTablesResponse {
  tables: TableStatus[];
}

export interface UploadImageResponse {
  url: string;
}
