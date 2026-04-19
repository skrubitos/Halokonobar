# Halokonobar

> [!info] Nightclub Ordering System
> NFC/QR ulaz, mobilno narucivanje pica, real-time waiter dashboard.
> **Status:** U razvoju | **Jezik:** TypeScript | **Monorepo:** pnpm + Turborepo

---

## Sadrzaj

- [[#Arhitektura]]
- [[#Stack]]
- [[#Struktura projekta]]
- [[#Baza podataka]]
- [[#API rute]]
- [[#Frontend aplikacije]]
- [[#Konvencije]]
- [[#Development setup]]
- [[#Pronadjene mane]]
- [[#Popravljeno]]
- [[#Roadmap]]

---

## Arhitektura

```
                     +------------------+
                     |   NFC Tag / QR   |
                     +--------+---------+
                              |
                              v
                  +-----------+-----------+
                  |   Customer App (PWA)  |
                  |   React + Vite        |
                  |   :5173               |
                  +-----------+-----------+
                              |
                              v
               +--------------+--------------+
               |       Fastify API           |
               |       :3000                 |
               |  REST + WebSocket (Redis)   |
               +---------+------+-----------+
                         |      |
                    +----+      +----+
                    v                v
             +------+------+  +-----+------+
             | PostgreSQL   |  |   Redis    |
             |   :5432      |  |   :6379    |
             +--------------+  +------------+
                              |
                  +-----------+-----------+
                  |    Waiter App (PWA)    |
                  |    React + Vite        |
                  |    :5174               |
                  +-----------+-----------+
```

### Multi-tenancy

Sve tablice imaju `club_id` — potpuna izolacija podataka po klubu.

### Autentikacija

| Korisnik   | Metoda                          | Trajanje |
| ---------- | ------------------------------- | -------- |
| **Gost**   | Session token (64-char hex)     | ~8h      |
| **Osoblje**| JWT (role: waiter/manager/admin)| 8h       |

### Order state machine

```
pending --> accepted --> preparing --> ready --> delivered
   |           |            |           |
   +-----------+------------+-----------+---> cancelled
```

---

## Stack

| Sloj        | Tehnologija                                    |
| ----------- | ---------------------------------------------- |
| API         | Fastify + TypeScript                           |
| Customer    | React 18 + Vite + Zustand + TanStack Query     |
| Waiter      | React 18 + Vite + Zustand + TanStack Query     |
| Baza        | PostgreSQL 16                                  |
| Cache       | Redis 7 (pub/sub + session cache)              |
| Monorepo    | pnpm workspaces + Turborepo                    |
| Auth        | bcrypt + JWT (@fastify/jwt)                    |
| Validacija  | Fastify AJV schemas + Zod                      |
| Real-time   | WebSocket via Redis pub/sub                    |
| PWA         | vite-plugin-pwa (offline menu, image caching)  |
| i18n        | Hrvatski + Engleski                            |
| Deploy      | Docker Compose (Nginx za frontend)             |
| CI          | GitHub Actions (typecheck + migration lint)    |

---

## Struktura projekta

```
Halokonobar/
├── apps/
│   ├── api/                  # Fastify REST + WebSocket server
│   │   └── src/
│   │       ├── index.ts              # Server setup, plugin i route registracija
│   │       ├── config.ts             # Environment varijable
│   │       ├── errors.ts             # Globalni error handler
│   │       ├── plugins/
│   │       │   ├── auth.ts           # JWT + session autentikacija
│   │       │   └── websocket.ts      # Redis pub/sub WebSocket
│   │       ├── routes/
│   │       │   ├── nfc.ts            # NFC tap -> kreiranje sesije
│   │       │   ├── session.ts        # Upravljanje sesijom
│   │       │   ├── menu.ts           # Javni meni (cached)
│   │       │   ├── orders.ts         # Kreiranje narudzbi
│   │       │   ├── admin/
│   │       │   │   ├── menu.ts       # CRUD meni (manager+)
│   │       │   │   ├── nfc-tags.ts   # CRUD NFC tagovi (manager+)
│   │       │   │   └── staff.ts      # CRUD osoblje (admin only)
│   │       │   └── staff/
│   │       │       ├── auth.ts       # Login / refresh
│   │       │       └── orders.ts     # Order feed + status update
│   │       ├── services/
│   │       │   ├── order.service.ts  # Order business logika
│   │       │   ├── session.service.ts
│   │       │   ├── realtime.service.ts
│   │       │   └── delay-monitor.ts  # Auto-cancel + alerting
│   │       └── utils/
│   │           └── mappers.ts        # DB -> API response mapperi
│   │
│   ├── customer/             # Customer mobile PWA
│   │   └── src/
│   │       ├── pages/        # NfcLanding, Menu, Cart, OrderStatus, OrderHistory
│   │       ├── store/        # Zustand (cart, session)
│   │       ├── hooks/        # useWebSocket
│   │       └── i18n/         # en.ts, hr.ts
│   │
│   └── waiter/               # Staff dashboard PWA
│       └── src/
│           ├── pages/        # Login, Dashboard, OrderFeed, MenuAdmin,
│           │                 # TablesAdmin, StaffAdmin
│           ├── store/        # Zustand (auth)
│           ├── hooks/        # useWebSocket, useNotifications
│           └── i18n/         # en.ts, hr.ts
│
├── packages/
│   ├── db/                   # PostgreSQL + Redis klijenti, migracije
│   ├── types/                # Dijeljeni TypeScript tipovi
│   └── ui/                   # Dijeljene React komponente
│
├── docker-compose.yml
├── turbo.json
├── CLAUDE.md
└── .github/workflows/ci.yml
```

---

## Baza podataka

### ER dijagram (pojednostavljen)

```
clubs 1──* zones 1──* nfc_tags
  |                      |
  |                      |
  +──* staff          sessions
  |                      |
  +──* menu_categories   |
  |       |              |
  |   menu_items         |
  |                      |
  +──* orders ───────────+
         |
     order_items
         |
     order_status_history
```

### Tablice

| Tablica                  | Opis                              | Kljucna polja                                              |
| ------------------------ | --------------------------------- | ---------------------------------------------------------- |
| `clubs`                  | Klubovi (root multi-tenancy)      | slug, timezone, subscription_tier, settings (JSONB)        |
| `zones`                  | Fizicke zone (VIP, terasa, sank)  | zone_type, capacity, sort_order                            |
| `nfc_tags`               | NFC tagovi na stolovima           | tag_uid, qr_fallback_url, tap_count                        |
| `sessions`               | Gost sesije (NFC tap)             | session_token (256-bit), expires_at, device_fp             |
| `staff`                  | Osoblje                           | email, password_hash, role, assigned_zones[]               |
| `menu_categories`        | Kategorije pica                   | emoji, sort_order                                          |
| `menu_items`             | Pojedina pica                     | price_pence, modifiers (JSONB), prep_time_mins             |
| `orders`                 | Narudzbe                          | order_number, status, priority, idempotency_key            |
| `order_items`            | Stavke narudzbe                   | quantity, unit_price_pence, selected_modifiers, name_snapshot |
| `order_status_history`   | Audit log promjena statusa        | from_status, to_status, changed_by_type                    |

> [!important] Cijene
> Cijene su uvijek u **pence** (integer). Nikada float za novac.

---

## API rute

### Javne (customer)

| Metoda | Ruta                          | Opis                    |
| ------ | ----------------------------- | ----------------------- |
| POST   | `/api/v1/nfc/tap`             | NFC tap -> nova sesija  |
| GET    | `/api/v1/session/me`          | Detalji sesije          |
| PATCH  | `/api/v1/session/me`          | Update ime, party size  |
| GET    | `/api/v1/clubs/:id/menu`      | Meni kluba (cached 60s) |
| POST   | `/api/v1/orders`              | Nova narudzba           |
| GET    | `/api/v1/orders`              | Moje narudzbe           |
| GET    | `/api/v1/orders/:id`          | Detalji narudzbe        |

### Staff (JWT auth)

| Metoda | Ruta                                  | Opis                     | Role         |
| ------ | ------------------------------------- | ------------------------ | ------------ |
| POST   | `/api/v1/staff/auth/login`            | Login                    | svi          |
| POST   | `/api/v1/staff/auth/refresh`          | Refresh token            | svi          |
| GET    | `/api/v1/staff/orders`                | Order feed               | svi          |
| PATCH  | `/api/v1/staff/orders/:id/status`     | Promijeni status         | svi          |
| PATCH  | `/api/v1/staff/orders/:id/assign`     | Dodijeli konobaru        | svi          |
| GET    | `/api/v1/staff/zones`                 | Lista zona               | svi          |
| GET    | `/api/v1/staff/tables`                | Status stolova           | svi          |
| GET    | `/api/v1/staff/dashboard/summary`     | Dashboard statistike     | svi          |

### Admin (manager/admin)

| Metoda | Ruta                                          | Opis                   | Role          |
| ------ | --------------------------------------------- | ---------------------- | ------------- |
| GET    | `/api/v1/admin/clubs/:cid/menu/categories`    | Lista kategorija       | manager+      |
| POST   | `/api/v1/admin/clubs/:cid/menu/categories`    | Nova kategorija        | manager+      |
| PATCH  | `/api/v1/admin/clubs/:cid/menu/categories/:id`| Uredi kategoriju       | manager+      |
| GET    | `/api/v1/admin/clubs/:cid/menu/items`         | Lista artikala         | manager+      |
| POST   | `/api/v1/admin/clubs/:cid/menu/items`         | Novi artikl            | manager+      |
| PATCH  | `/api/v1/admin/clubs/:cid/menu/items/:id`     | Uredi artikl           | manager+      |
| GET    | `/api/v1/admin/clubs/:cid/nfc-tags`           | Lista NFC tagova       | manager+      |
| POST   | `/api/v1/admin/clubs/:cid/nfc-tags`           | Novi NFC tag           | manager+      |
| PATCH  | `/api/v1/admin/clubs/:cid/nfc-tags/:id`       | Uredi NFC tag          | manager+      |
| GET    | `/api/v1/admin/clubs/:cid/staff`              | Lista osoblja          | admin         |
| POST   | `/api/v1/admin/clubs/:cid/staff`              | Novi clan osoblja      | admin         |
| PATCH  | `/api/v1/admin/clubs/:cid/staff/:id`          | Uredi osoblje          | admin         |
| DELETE | `/api/v1/admin/clubs/:cid/staff/:id`          | Deaktiviraj osoblje    | admin         |

### WebSocket eventi

| Event                 | Smjer          | Opis                               |
| --------------------- | -------------- | ---------------------------------- |
| `order:created`       | server -> all  | Nova narudzba kreirana             |
| `order:status`        | server -> all  | Status narudzbe promijenjen        |
| `order:assigned`      | server -> all  | Narudzba dodijeljena konobaru      |
| `menu:updated`        | server -> all  | Artikl dostupnost promijenjena     |
| `delay:alert`         | server -> staff| Narudzba kasni                     |

---

## Frontend aplikacije

### Customer App (:5173)

| Stranica      | Opis                                                |
| ------------- | --------------------------------------------------- |
| NfcLanding    | Landing nakon NFC tap/QR scan                       |
| Menu          | Pregled menija s kategorijama, dodavanje u kosaricu  |
| Cart          | Pregled kosarice, posebni zahtjevi, naruci           |
| OrderStatus   | Real-time pracenje statusa narudzbe                  |
| OrderHistory  | Povijest narudzbi, reorder                          |

### Waiter App (:5174)

| Stranica    | Opis                                          | Pristup    |
| ----------- | --------------------------------------------- | ---------- |
| Login       | Prijava osoblja                               | svi        |
| OrderFeed   | Feed narudzbi, prihvati/pripremi/dostavi      | svi        |
| Dashboard   | Statistike veceri (aktivne, prihod, cekanje)  | svi        |
| MenuAdmin   | CRUD meni artikala                            | manager+   |
| TablesAdmin | CRUD stolova/NFC tagova                       | manager+   |
| StaffAdmin  | CRUD osoblja, role, zone                      | admin      |

---

## Konvencije

> [!warning] Obavezno
> - SQL upiti **moraju** koristiti parametrizirane vrijednosti (`$1`, `$2`) — nikada string interpolaciju
> - Cijene uvijek u **pence** (integer) — nikada float
> - Sve tablice moraju imati `club_id` za multi-tenancy

- Zustand za client state, TanStack Query za server state
- Response format: `{ data: T, error: null }` ili `{ data: null, error: { code, message } }`
- Soft delete putem `is_active` flaga (ne hard delete)
- Idempotency key na narudzbama (sprjecava duplikate)
- i18n: `hr.ts` definira tipove, `en.ts` ih implementira
- PWA: StaleWhileRevalidate za meni, CacheFirst za slike

---

## Development setup

### Preduvjeti

- Node.js >= 20
- pnpm 9.1.4
- Docker (za Postgres + Redis)

### Pokretanje

```bash
pnpm install
docker-compose up -d postgres redis
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Portovi

| Servis   | Port |
| -------- | ---- |
| API      | 3000 |
| Customer | 5173 |
| Waiter   | 5174 |
| Postgres | 5432 |
| Redis    | 6379 |

### Komande

| Komanda           | Opis                         |
| ----------------- | ---------------------------- |
| `pnpm dev`        | Pokreni sve appove           |
| `pnpm build`      | Build sve (Turbo)            |
| `pnpm typecheck`  | TypeScript provjera          |
| `pnpm lint`       | Lint sve pakete              |
| `pnpm db:migrate` | Pokreni migracije            |
| `pnpm db:seed`    | Seed dev podatke             |

### Demo korisnici (seed)

| Email              | Lozinka      | Uloga   |
| ------------------ | ------------ | ------- |
| waiter@demo.com    | password123  | waiter  |
| manager@demo.com   | password123  | manager |

> [!tip] Admin pristup
> Za testiranje admin funkcionalnosti, promijeni ulogu managera:
> ```sql
> UPDATE staff SET role = 'admin' WHERE email = 'manager@demo.com';
> ```

### Environment varijable

```env
# Obavezne
DATABASE_URL=postgresql://postgres:password@localhost:5432/halokonobar
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-in-production-minimum-32-characters
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Opcionalne (produkcija)
S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
CDN_BASE_URL
CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN
```

---

## Pronadjene mane

### Popravljeno

- [x] **SQL Injection** u `order.service.ts:278` — `orderId` se interpolirao u SQL string
- [x] **Zone bypass** u `staff/orders.ts:40` — waiter bez zona vidio sve narudzbe
- [x] **Nema staff managementa** — dodan kompletni CRUD za osoblje (admin only)

### Visoki prioritet

- [ ] **Nema testova** — niti jedan test ne postoji u projektu. Dodati Vitest.
- [ ] **Nema ESLint konfiguracije** — CI ima lint job ali nema config
- [ ] **Preglomazne komponente:**
    - `OrderFeed.tsx` — 781 linija (razbiti na ZoneTabs, OrderListView, OrderGridView)
    - `MenuAdmin.tsx` — 353 linija (izvuci modalne komponente)
    - `TablesAdmin.tsx` — 338 linija

### Srednji prioritet

- [ ] **Duplirani kod** izmedju customer i waiter appova:
    - `useWebSocket.ts` — gotovo identican u oba appa
    - `utils/api.ts` — `apiFetch`, `formatPrice` duplicirani
    - `i18n/context.tsx` — zajednicka logika
- [ ] **Nema strukturiranog logginga** — samo `console.error` / `console.info`. Koristiti pino.
- [ ] **Nedovoljna validacija** modifiera u menu i order rutama (`{ type: 'array' }` bez sadrzaja)
- [ ] **Silent failures** u pozadinskim procesima (delay-monitor, NFC tap update)
- [ ] **Hardkodirani pragovi** u delay-monitor.ts — trebaju biti per-club konfigurabili

### Nizi prioritet

- [ ] **Accessibility** — nema ARIA atributa, nema semantickog HTML-a
- [ ] **Type safety** — `as any` u error handleru, `Record<string, unknown>` castovi
- [ ] **WebSocket payload limit** — 4KB moze biti premalo
- [ ] **Nema retry logike** u frontend API klijentu
- [ ] **i18n type greska** — `hr.ts` u customer appu ima literal type mismatch

---

## Roadmap

> [!note] Planirani koraci po prioritetu

### Faza 1 — Stabilizacija

- [ ] Dodati Vitest + unit testove za order service i auth middleware
- [ ] Dodati ESLint konfiguraciju za cijeli monorepo
- [ ] Popraviti i18n type greske u customer appu

### Faza 2 — Refaktoring

- [ ] Razbiti velike komponente (OrderFeed, MenuAdmin, TablesAdmin)
- [ ] Izvuci duplirani kod u shared pakete (`packages/shared`)
- [ ] Zamijeniti `console.*` sa pino loggerom

### Faza 3 — Robusnost

- [ ] Dodati retry logiku u API klijent
- [ ] Validacija modifiera (JSON Schema)
- [ ] Per-club konfigurabilni pragovi za delay monitor
- [ ] Povecati WebSocket payload limit

### Faza 4 — UX poboljsanja

- [ ] Accessibility (ARIA, semanticki HTML, keyboard navigacija)
- [ ] Push notifikacije za konobare (narudzba kasni)
- [ ] Offline narudzbe (queue kad nema mreze)

---

#halokonobar #nightclub #ordering #typescript #fastify #react
