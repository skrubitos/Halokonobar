# Halokonobar

Nightclub ordering system — NFC/QR entry, mobile drink ordering, real-time waiter dashboard.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **API**: Fastify + TypeScript (`apps/api`)
- **Customer app**: React + Vite + Zustand + TanStack Query (`apps/customer`)
- **Waiter app**: React + Vite + Zustand + TanStack Query (`apps/waiter`)
- **DB**: PostgreSQL 16 + Redis 7
- **Shared packages**: `packages/db`, `packages/types`, `packages/ui`

## Development

```bash
pnpm install
docker-compose up -d postgres redis   # start DB + Redis
pnpm db:migrate                        # run migrations
pnpm db:seed                           # seed dev data
pnpm dev                               # start all 3 apps
```

## Key conventions

- All DB tables scoped by `club_id` (multi-tenant)
- Customer auth: session tokens (64-char hex), stored in Redis + PG
- Staff auth: JWT with role-based access (waiter/manager/admin)
- Real-time: WebSocket via Redis pub/sub per club
- Prices stored as integers (pence) — never use floats for money
- i18n: English + Croatian (`apps/*/src/i18n/`)
- Order flow: pending → accepted → preparing → ready → delivered | cancelled
- SQL queries must use parameterized values ($1, $2, ...) — never string interpolation

## Ports (dev)

- API: 3000
- Customer: 5173
- Waiter: 5174
- Postgres: 5432
- Redis: 6379

## Important files

- `packages/db/migrations/` — SQL migrations (sequential, custom runner)
- `apps/api/src/plugins/auth.ts` — auth middleware (session + JWT)
- `apps/api/src/services/order.service.ts` — core order logic
- `apps/api/src/plugins/websocket.ts` — real-time pub/sub
- `apps/api/src/services/delay-monitor.ts` — order delay tracking
- `apps/api/src/routes/admin/staff.ts` — staff CRUD (admin only)
- `apps/waiter/src/pages/StaffAdmin.tsx` — staff management UI

## Commands

```bash
pnpm dev           # run all apps in parallel
pnpm build         # build everything (Turbo)
pnpm typecheck     # TypeScript check without emit
pnpm lint          # lint all packages
pnpm db:migrate    # run database migrations
pnpm db:seed       # seed development data
```

## Self-updating instructions

This file should grow with the project. When working on Halokonobar, **update this CLAUDE.md** whenever you:

- **Add a new package, app, or service** — add it to Stack and Important files
- **Add or change a dev command** — update Commands section
- **Discover or establish a convention** — add it to Key conventions (e.g. naming patterns, error handling approach, testing strategy)
- **Add a new integration** — document it (e.g. payment provider, push notifications, analytics)
- **Change ports or infrastructure** — update Ports and Development sections
- **Fix a non-obvious bug** — add a short note under Known gotchas so it doesn't recur
- **Add environment variables** — document them if they're required for dev setup

Keep entries short (one line each). Remove entries that become outdated. The goal is that any developer (or AI) reading this file gets an accurate, current picture of the project.

## Known gotchas

- `apps/customer/src/i18n/hr.ts` has TypeScript errors — Croatian translations use literal string types that don't match English. Needs i18n type rework.
- `paramIdx` in `order.service.ts` is shared across dynamic SET clauses and WHERE — when adding new dynamic fields, continue the counter correctly.
