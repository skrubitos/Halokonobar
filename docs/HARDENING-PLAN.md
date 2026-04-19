# Halokonobar — Hardening & Refactoring Plan

> Technical specification for production readiness.
> Each decision explains **why** it prevents failure in a real nightclub (noise, poor Wi-Fi, high concurrency, staff under pressure).

---

## 1. ARCHITECTURAL DECOUPLING

### 1.1 Shared Package Extraction

**Problem:** 91–95% identical code duplicated between `apps/customer` and `apps/waiter`:

| File | Duplication | Difference |
|------|------------|------------|
| `useWebSocket.ts` | 95% identical | Formatting only |
| `utils/api.ts` | 91% identical | Waiter has `timeAgo()`, param named `token` vs `sessionToken` |
| `i18n/context.tsx` | 90% identical | Storage key, default language, type annotation |

**Solution:** Create `packages/shared` with three exports:

```
packages/shared/
├── src/
│   ├── hooks/
│   │   └── useWebSocket.ts       # Unified hook (zero config change)
│   ├── utils/
│   │   ├── api.ts                # apiFetch<T>(), formatPrice(), timeAgo()
│   │   └── date.ts               # timeAgo(), fmtWait(), formatDate()
│   └── i18n/
│       └── createI18nContext.ts   # Factory: createI18nContext({ storageKey, defaultLang, translations })
├── package.json                   # peer: react, @halokonobar/types
└── tsconfig.json
```

**Key design decisions:**

`useWebSocket.ts` — merge as-is, both versions are functionally identical:
```typescript
// packages/shared/src/hooks/useWebSocket.ts
// Exact current implementation — no changes needed.
// Both apps import from '@halokonobar/shared/hooks' instead of local copy.
```

`apiFetch` — unify the token parameter name:
```typescript
// packages/shared/src/utils/api.ts
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string               // <-- unified name
): Promise<T>
```

`i18n` — factory pattern so each app can configure its own defaults:
```typescript
// packages/shared/src/i18n/createI18nContext.ts
export function createI18nContext<T extends Record<string, string>>(config: {
  storageKey: string;
  defaultLang: 'en' | 'hr';
  translations: Record<'en' | 'hr', T>;
}) {
  // Returns { I18nProvider, useI18n } — same API as current, zero migration cost
}
```

**Why this matters in a club:** When a bug is fixed in WebSocket reconnection logic, it must be fixed once. In a loud club with patchy Wi-Fi, a reconnection bug in the waiter app but not the customer app means lost orders.

---

### 1.2 OrderFeed.tsx Decomposition

**Current state:** 791 lines, 12 functions/components in one file.

**Decomposition strategy — extract by responsibility, not by visual hierarchy:**

```
apps/waiter/src/pages/OrderFeed/
├── index.tsx                  # <OrderFeed /> — orchestrator (≈80 lines)
├── OrderCard.tsx              # Single order card (67 lines, already isolated)
├── FloorPlanView.tsx          # Table grid + zone tabs (≈140 lines)
│   ├── ZoneTabs.tsx           # Zone segmented control (47 lines)
│   ├── TableCard.tsx          # Individual table tile (70 lines)
│   └── BarAnchor.tsx          # Physical bar reference (12 lines)
├── TableSidePanel.tsx         # Bottom sheet for table orders (106 lines)
├── hooks/
│   ├── useOrderFeedData.ts    # Queries + derived state (orders, tables, pendingCount)
│   ├── useOrderMutations.ts   # statusMutation + completeAllMutation + onError refetch
│   └── useOrderWebSocket.ts   # WS connection + event → invalidation mapping
├── constants.ts               # CARD_STYLE, TIMER_STYLE, ZONE_EMOJI, statusActions
└── utils.ts                   # tableUrgency(), fmtWait()
```

**The orchestrator becomes clean:**
```typescript
// OrderFeed/index.tsx — ≈80 lines
export function OrderFeed() {
  const { orders, tables, isLoading, pendingCount } = useOrderFeedData();
  const { statusMutation, completeAllMutation } = useOrderMutations();
  const { wsConnected } = useOrderWebSocket();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedTag, setSelectedTag] = useState<...>(null);

  return (
    <div>
      <OrderFeedHeader ... />
      {view === 'list' ? <OrderListView ... /> : <FloorPlanView ... />}
      {selectedTag && <TableSidePanel ... />}
    </div>
  );
}
```

**Why this matters in a club:** A waiter under pressure taps "Accept" on the wrong order. A bug in `TableCard` should not break the entire order list. Isolated components = isolated failures. Also: every extracted piece becomes independently testable.

---

## 2. TYPE SAFETY & VALIDATION

### 2.1 Zod Schema Strategy

**Current state:**
- Zod installed in API but only used for env vars (`config.ts`)
- 16 `Record<string, unknown>` usages — all in PostgreSQL row mapping
- Fastify uses JSON Schema for route validation (separate from TypeScript types)
- `packages/types` has 187 lines of pure interfaces — no runtime validation

**Proposed: Single Source of Truth with Zod**

Create `packages/schemas` — Zod schemas that **generate** both TypeScript types and Fastify JSON schemas:

```
packages/schemas/
├── src/
│   ├── models/
│   │   ├── order.schema.ts       # orderSchema, orderItemSchema, orderStatusSchema
│   │   ├── staff.schema.ts       # staffSchema, staffRoleSchema
│   │   ├── menu.schema.ts        # menuItemSchema, modifierSchema
│   │   └── session.schema.ts     # sessionSchema
│   ├── api/
│   │   ├── orders.api.ts         # createOrderBody, createOrderResponse
│   │   ├── staff.api.ts          # staffLoginBody, staffLoginResponse
│   │   └── admin.api.ts          # admin CRUD schemas
│   ├── db/
│   │   └── row-parsers.ts        # Zod parsers for PostgreSQL rows (replaces mappers.ts)
│   └── index.ts
└── package.json                   # deps: zod; devDeps: zod-to-json-schema
```

**How row parsing replaces `Record<string, unknown>`:**

```typescript
// packages/schemas/src/db/row-parsers.ts
import { z } from 'zod';

// Define once — derives TypeScript type + runtime parser + JSON schema
export const orderRowSchema = z.object({
  id:                z.string().uuid(),
  club_id:           z.string().uuid(),
  session_id:        z.string().uuid(),
  zone_id:           z.string().uuid(),
  nfc_tag_id:        z.string().uuid(),
  assigned_staff_id: z.string().uuid().nullable(),
  order_number:      z.string(),
  status:            z.enum(['pending','accepted','preparing','ready','delivered','cancelled']),
  priority:          z.enum(['normal','vip','urgent']),
  notes:             z.string().nullable(),
  subtotal_pence:    z.coerce.number(),
  total_pence:       z.coerce.number(),
  // ...timestamps
});

// Mapper becomes a transform, not a manual property copy:
export const orderTransform = orderRowSchema.transform((r) => ({
  id:              r.id,
  clubId:          r.club_id,
  sessionId:       r.session_id,
  status:          r.status,
  // ...
}));

export type OrderFromDb = z.input<typeof orderRowSchema>;
export type Order = z.output<typeof orderTransform>;
```

**Usage in routes (replaces `as Record<string, unknown>`):**

```typescript
// Before:
const { rows } = await pool.query(...);
return rows.map((r) => mapOrderWithItems(r as Record<string, unknown>, ...));

// After:
const { rows } = await pool.query(...);
return rows.map((r) => orderWithItemsTransform.parse(r));
// ↑ Throws ZodError at API boundary if DB returns unexpected shape
```

**Fastify JSON Schema generation (replaces manual schema objects):**

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

// Before (manual, can drift from types):
schema: {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
    }
  }
}

// After (generated from Zod, always in sync):
schema: {
  body: zodToJsonSchema(createStaffBodySchema)
}
```

**Why this matters in a club:** At 2 AM, a bartender adds a menu item with `pricePence: "twelve hundred"` instead of `1200`. Without Zod, it reaches the database as a string, calculations break, bills are wrong. With Zod, it's rejected at the API boundary with a clear error message.

---

### 2.2 Strictly Typed i18n

**Current state:** `hr.ts` defines keys with `as const`, `en.ts` implements `Record<keyof typeof hr, string>`. Customer app has 46 TypeScript errors because the literal string types don't match.

**Problem:** The types enforce that English values must **equal** Croatian strings (literal types from `as const`). This is fundamentally wrong.

**Solution:**

```typescript
// packages/shared/src/i18n/types.ts
// Step 1: Define keys as an enum-like object (not literal values)
export interface TranslationKeys {
  staffLogin: string;
  email: string;
  password: string;
  // ... every key
}

// Step 2: Each language file implements the interface
// apps/waiter/src/i18n/hr.ts
import type { TranslationKeys } from '@halokonobar/shared/i18n';
export const hr: TranslationKeys = {
  staffLogin: 'Prijava osoblja',
  // ...
} satisfies TranslationKeys;  // <-- compile error if key missing, no literal type conflict

// apps/waiter/src/i18n/en.ts
export const en: TranslationKeys = {
  staffLogin: 'Staff Login',
  // ...
} satisfies TranslationKeys;
```

**Why `satisfies` instead of `as const`:**
- `as const` makes values literal types → Croatian "Prijava" ≠ English "Login" → type error
- `satisfies` checks the **shape** (all keys present) without constraining values

**Why this matters in a club:** A missing translation key in Croatian means the button shows `undefined` instead of "Prihvati" (Accept). In a dark, noisy club, the waiter sees a blank button and doesn't know what it does. `satisfies` catches missing keys at compile time.

---

## 3. RESILIENCY & OBSERVABILITY

### 3.1 Structured Logging with Pino

**Current state:** 10 `console.*` calls. Fastify logger configured but unused by routes/services. No request correlation. No club/staff context.

**Design: Request-scoped structured logging**

Fastify already uses pino internally. The fix is to **pass the request logger** through to services.

**Step 1: Enrich every request with context**

```typescript
// apps/api/src/plugins/request-context.ts
import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.addHook('onRequest', (req, _reply, done) => {
    // Attach club/staff context to logger for every subsequent log call
    req.log = req.log.child({
      traceId: req.id,                           // Fastify auto-generates
      clubId: req.staffUser?.clubId ?? req.session?.clubId ?? null,
      staffId: req.staffUser?.sub ?? null,
      staffRole: req.staffUser?.role ?? null,
      ip: req.ip,
    });
    done();
  });
});
```

**Step 2: Pass `req.log` to services (not `console`)**

```typescript
// Before (delay-monitor.ts):
console.error('[delay-monitor] Auto-cancel failed for order', order.id, err);

// After:
logger.error({ orderId: order.id, clubId: order.club_id, err }, 'Auto-cancel failed');
// Output: {"level":50,"traceId":"req-42","clubId":"abc","orderId":"xyz","err":{...},"msg":"Auto-cancel failed"}
```

**Step 3: Replace all `console.*` calls**

| Current | Replacement | Context |
|---------|-------------|---------|
| `console.error('[delay-monitor]...')` | `fastify.log.error({ orderId, clubId }, 'msg')` | Background job — use fastify.log directly |
| `console.info('API listening...')` | `fastify.log.info('msg')` | Startup — already on fastify instance |
| `.catch(console.error)` | `.catch((err) => req.log.warn({ err }, 'fire-and-forget failed'))` | Request-scoped — use req.log |
| `console.error('WebSocket error')` | `fastify.log.error({ err, clientType }, 'ws error')` | Plugin — use fastify.log |

**Log schema (JSON, one line per event):**

```jsonc
{
  "level": 30,                    // pino levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error
  "time": 1700000000000,
  "traceId": "req-4291",          // correlates all logs for one request
  "clubId": "uuid",               // multi-tenant isolation in log analysis
  "staffId": "uuid",              // who triggered the action
  "staffRole": "waiter",
  "msg": "order.status_changed",
  "orderId": "uuid",
  "fromStatus": "pending",
  "toStatus": "accepted",
  "responseTime": 42
}
```

**Why this matters in a club:** At peak hour, 200 orders are flowing. Something breaks. With `console.error('error', err)`, you search through noise. With structured logs, you filter: `clubId=X AND level>=40 AND time > 23:00` and see exactly which orders failed and which waiter was involved.

---

### 3.2 Vitest Testing Strategy

**Current state:** Zero tests. Turbo `test` task configured but empty.

**Philosophy:** Test the **invariants that cause money loss** when broken. Not 100% line coverage — 100% coverage on **golden paths**.

**Golden Path #1: Order State Machine** (highest priority)

```
File: apps/api/src/services/__tests__/order.service.test.ts
```

What to test:
```
✓ pending → accepted (happy path)
✓ pending → cancelled (customer cancels)
✓ accepted → preparing → ready → delivered (full lifecycle)
✓ cancelled → anything = REJECTED (terminal state)
✓ delivered → anything = REJECTED (terminal state)
✓ pending → ready = REJECTED (skip not allowed)
✓ concurrent transitions — two waiters accept same order = one wins
✓ idempotency key — same key returns existing order, no duplicate
✓ auto-cancel — order pending > N minutes = system cancels
```

**Why:** Wrong state transition = wrong bill. Double order = customer charged twice. These cost real money.

**Golden Path #2: Multi-Tenancy Isolation**

```
File: apps/api/src/routes/__tests__/multi-tenancy.test.ts
```

What to test:
```
✓ Staff from Club A cannot see orders from Club B
✓ Staff from Club A cannot modify menu of Club B
✓ Session token from Club A cannot place order in Club B
✓ NFC tag from Club A scanned at Club B = error
✓ Admin from Club A cannot create staff in Club B
```

**Why:** If Club A's waiter sees Club B's VIP bottle orders, it's a data breach. In a nightclub ecosystem, competitor intelligence is extremely sensitive.

**Golden Path #3: Authentication Boundaries**

```
File: apps/api/src/plugins/__tests__/auth.test.ts
```

What to test:
```
✓ Expired JWT → 401
✓ Waiter cannot access admin routes → 403
✓ Manager cannot access admin-only routes (staff CRUD) → 403
✓ Waiter with no assigned zones sees zero orders (not all orders)
✓ Session token cannot access staff routes
✓ Deactivated staff (is_active=false) cannot login
```

**Golden Path #4: Price Calculations**

```
File: apps/api/src/services/__tests__/order-pricing.test.ts
```

What to test:
```
✓ Single item, no modifiers → price = quantity × unit_price
✓ Multiple items → subtotal = sum of line totals
✓ Server-side price used, NOT client-submitted price
✓ Unavailable item → 409 rejection
✓ Item from different club → 404 rejection
```

**Why:** Client sends `pricePence: 0` for a £250 bottle. Server must recalculate.

**Testing infrastructure:**

```typescript
// vitest.config.ts (root)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],    // shared DB setup/teardown
    pool: 'forks',                       // isolate tests
    coverage: {
      include: ['apps/api/src/services/**', 'apps/api/src/plugins/**'],
      thresholds: {
        'apps/api/src/services/order.service.ts': { statements: 95 },
      }
    }
  }
});
```

```typescript
// test/setup.ts — test database lifecycle
import { Pool } from 'pg';

const testPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

beforeEach(async () => {
  await testPool.query('BEGIN');    // wrap each test in transaction
});

afterEach(async () => {
  await testPool.query('ROLLBACK'); // undo all changes — clean slate
});
```

---

## 4. PERFORMANCE

### 4.1 WebSocket at Scale (500+ concurrent connections)

**Current state:**
- 3 Redis clients (main, subscriber, publisher) — correct separation
- `psubscribe('club:*')` — subscribes to all clubs on every API instance
- In-memory `Map<clubId, Set<WsClient>>` — no sharding
- 30s ping interval, 4KB max payload
- Exponential backoff reconnection on client

**Bottleneck analysis for 500 concurrent users in one club:**

| Component | Current limit | Issue at 500 conn |
|-----------|--------------|-------------------|
| Redis pub/sub | ~100K msg/s | Not the bottleneck |
| WS fan-out | O(N) per event | 500 serializations per order update — ~2ms, acceptable |
| Memory | ~2KB per WsClient | 500 × 2KB = 1MB — negligible |
| `JSON.stringify` per broadcast | Once per event | Currently stringifies once, sends same buffer — correct |

**Verdict:** Current architecture handles 500 connections on a **single API instance** without changes. The real risks are elsewhere:

**Risk 1: Message storms during peak**

At peak (midnight), 50 orders per minute = ~200 status changes per minute = 200 × 500 = 100K WS messages/minute. Each triggers `invalidateQueries` on every connected client, causing 100K HTTP refetches.

**Solution: Debounced invalidation on client**

```typescript
// packages/shared/src/hooks/useWebSocket.ts — add batching
const pendingInvalidations = useRef(new Set<string>());
const flushTimer = useRef<ReturnType<typeof setTimeout>>();

function scheduleInvalidation(queryKey: string) {
  pendingInvalidations.current.add(queryKey);
  clearTimeout(flushTimer.current);
  flushTimer.current = setTimeout(() => {
    for (const key of pendingInvalidations.current) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    pendingInvalidations.current.clear();
  }, 300); // batch invalidations within 300ms window
}
```

**Why 300ms:** Human reaction time is ~250ms. Batching within 300ms is imperceptible to the waiter but reduces refetches from 200/min to ~40/min.

**Risk 2: Thundering herd on reconnect**

Club Wi-Fi drops for 10 seconds. 500 clients reconnect simultaneously, each sending `auth` + triggering full data refetch.

**Solution: Jittered reconnection (already implemented!) + server-side connection rate limiting**

```typescript
// Current client code (correct):
const delay = Math.min(500 * Math.pow(2, attempts) + Math.random() * 1000, 30_000);

// Add server-side: rate limit WS auth messages
let authsThisSecond = 0;
setInterval(() => { authsThisSecond = 0; }, 1000);

socket.on('message', async (rawData) => {
  if (msg.type === 'auth') {
    if (authsThisSecond > 50) {
      socket.send(JSON.stringify({ type: 'auth_error', message: 'Rate limited, retry' }));
      return;
    }
    authsThisSecond++;
    // ... proceed with auth
  }
});
```

**Risk 3: maxPayload too small**

Current: `maxPayload: 4096` (4KB). An order with 15 items and modifiers can exceed this.

**Solution:** Increase to 16KB. Orders with 15 items + modifiers serialize to ~3–5KB. 16KB gives headroom without enabling abuse.

```typescript
await fastify.register(websocket, {
  options: { maxPayload: 16_384 },
});
```

---

### 4.2 PWA Offline-First Ordering (Queue & Sync)

**Current state:**
- Customer app: StaleWhileRevalidate for menu (10 min), CacheFirst for images (24h)
- Waiter app: No custom caching
- Neither app handles offline mutations

**Why offline matters:** Club Wi-Fi drops constantly. 500 people streaming, Bluetooth speakers, metal structures. A customer builds a £120 order, taps "Place order", network fails → order lost → customer walks to the bar → lost revenue.

**Design: Optimistic Queue with Background Sync**

```
Customer taps "Place order"
         │
         ├── Network available?
         │     ├── YES → POST /orders → success → show confirmation
         │     └── NO  → Queue in IndexedDB → show "Queued" UI → sync when online
         │
         └── Background sync (ServiceWorker)
               ├── When connectivity restored
               ├── Replay queued orders (idempotency key prevents duplicates)
               └── Notify customer via postMessage
```

**Implementation layers:**

**Layer 1: Order queue store**
```typescript
// apps/customer/src/utils/order-queue.ts
import { openDB } from 'idb';

const db = await openDB('hk-orders', 1, {
  upgrade(db) {
    db.createObjectStore('pending-orders', { keyPath: 'idempotencyKey' });
  },
});

export async function queueOrder(order: CreateOrderBody): Promise<void> {
  await db.put('pending-orders', {
    ...order,
    queuedAt: Date.now(),
  });
}

export async function getQueuedOrders(): Promise<CreateOrderBody[]> {
  return db.getAll('pending-orders');
}

export async function removeQueuedOrder(key: string): Promise<void> {
  await db.delete('pending-orders', key);
}
```

**Layer 2: Submit with fallback**
```typescript
// apps/customer/src/hooks/useCreateOrder.ts
export function useCreateOrder() {
  return useMutation({
    mutationFn: async (body: CreateOrderBody) => {
      try {
        return await apiFetch<CreateOrderResponse>('/api/v1/orders', {
          method: 'POST',
          body: JSON.stringify(body),
        }, sessionToken);
      } catch (err) {
        if (!navigator.onLine || (err as any).status === undefined) {
          // Network failure — queue for later
          await queueOrder(body);
          // Register background sync
          const reg = await navigator.serviceWorker.ready;
          await reg.sync.register('sync-orders');
          return { queued: true, idempotencyKey: body.idempotencyKey };
        }
        throw err; // Real API error (400, 409, etc.) — don't queue
      }
    },
  });
}
```

**Layer 3: Service Worker sync**
```typescript
// apps/customer/src/sw-custom.ts (injected into SW by vite-plugin-pwa)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncQueuedOrders());
  }
});

async function syncQueuedOrders() {
  const orders = await getQueuedOrders();
  for (const order of orders) {
    try {
      await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(order),
      });
      await removeQueuedOrder(order.idempotencyKey);
    } catch {
      // Will retry on next sync event
      break;
    }
  }
}
```

**Why idempotency keys are critical here:** The customer taps "Order" → queued → Wi-Fi returns → SW sends order → but the original request also made it through (delayed TCP). Without idempotency keys, the customer gets charged twice. The existing `idempotency_key` column in the `orders` table already handles this — the SW sync is safe.

**Waiter app — different strategy:**

Waiters should **not** have offline-first ordering. Their actions (accept, prepare, ready) affect shared state. An offline "accept" that replays 5 minutes later can conflict with another waiter's actions. Instead:

- Show clear **"Offline — actions disabled"** banner
- Cache the last known order list in SW (read-only)
- Auto-retry the last failed action when connectivity returns (single retry, not queue)

---

## Implementation Priority

| Phase | What | Impact | Effort |
|-------|------|--------|--------|
| **Week 1** | Pino structured logging + replace all console.* | Observability for all future debugging | Low |
| **Week 1** | Increase WS maxPayload to 16KB | Prevents silent message drops | Trivial |
| **Week 2** | Vitest setup + Order State Machine tests | Catches billing/state bugs | Medium |
| **Week 2** | Extract `packages/shared` (hooks, utils, i18n factory) | Eliminates duplication | Medium |
| **Week 3** | OrderFeed.tsx decomposition | Testable components | Medium |
| **Week 3** | Multi-tenancy + auth boundary tests | Security assurance | Medium |
| **Week 4** | `packages/schemas` with Zod row parsers | Type safety at DB boundary | High |
| **Week 4** | Fix i18n types (`satisfies` pattern) | Eliminates 46 TS errors | Low |
| **Week 5** | WS invalidation batching | Performance under load | Medium |
| **Week 6** | PWA offline queue (customer app) | Revenue protection | High |
