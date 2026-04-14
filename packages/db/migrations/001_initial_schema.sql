-- =============================================================================
-- Halokonobar — Initial Database Schema
-- Migration: 001_initial_schema
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- clubs
-- One row per nightclub venue. Multi-tenancy root.
-- =============================================================================
CREATE TABLE clubs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  slug              TEXT        NOT NULL UNIQUE,  -- e.g. "fabric-london", used in URLs
  timezone          TEXT        NOT NULL DEFAULT 'UTC',
  subscription_tier TEXT        NOT NULL DEFAULT 'mvp'
                    CHECK (subscription_tier IN ('mvp', 'pro', 'enterprise')),
  -- JSONB settings: { currency, currencySymbol, vipEnabled, maxOrderValuePence,
  --                   logoUrl, primaryColor, autoCancelPendingMinutes,
  --                   delayAlertPendingMinutes, delayAlertPreparingMinutes }
  settings          JSONB       NOT NULL DEFAULT '{
    "currency": "GBP",
    "currencySymbol": "£",
    "vipEnabled": true,
    "maxOrderValuePence": 50000,
    "autoCancelPendingMinutes": 10,
    "delayAlertPendingMinutes": 3,
    "delayAlertPreparingMinutes": 15
  }',
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clubs_slug ON clubs (slug);

-- =============================================================================
-- zones
-- Physical sections of the club: Main Floor, VIP Booth 1, Terrace, etc.
-- =============================================================================
CREATE TABLE zones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  zone_type   TEXT        NOT NULL DEFAULT 'standard'
              CHECK (zone_type IN ('standard', 'vip', 'bar', 'terrace')),
  capacity    INT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_zones_club_id ON zones (club_id);

-- =============================================================================
-- nfc_tags
-- One row per physical NFC tag (and its QR equivalent) on a table/location.
-- =============================================================================
CREATE TABLE nfc_tags (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  zone_id          UUID        NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  tag_uid          TEXT        NOT NULL,   -- raw chip UID, e.g. "04AB23CDEF0102"
  tag_label        TEXT        NOT NULL,   -- human label: "Table 7", "Booth 3"
  qr_fallback_url  TEXT,                   -- identical URL encoded as QR on table card
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_tapped_at   TIMESTAMPTZ,
  tap_count        BIGINT      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, tag_uid)
);

CREATE INDEX idx_nfc_tags_club_id  ON nfc_tags (club_id);
CREATE INDEX idx_nfc_tags_tag_uid  ON nfc_tags (tag_uid);
CREATE INDEX idx_nfc_tags_zone_id  ON nfc_tags (zone_id);

-- =============================================================================
-- sessions
-- Created on every NFC tap / QR scan. Bearer token for customer auth.
-- =============================================================================
CREATE TABLE sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token    TEXT        NOT NULL UNIQUE,  -- 64-char hex, 256 bits entropy
  club_id          UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  zone_id          UUID        NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  nfc_tag_id       UUID        NOT NULL REFERENCES nfc_tags (id) ON DELETE CASCADE,
  customer_name    TEXT,                          -- optional self-reported name
  party_size       INT         CHECK (party_size > 0 AND party_size <= 50),
  device_fp        TEXT,                          -- browser fingerprint for dedup
  ip_address       INET,
  expires_at       TIMESTAMPTZ NOT NULL,          -- typically now() + 8 hours
  last_active_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token      ON sessions (session_token);
CREATE INDEX idx_sessions_nfc_tag_id ON sessions (nfc_tag_id);
CREATE INDEX idx_sessions_club_id    ON sessions (club_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- =============================================================================
-- staff
-- Waiters, managers, and admins.
-- =============================================================================
CREATE TABLE staff (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  password_hash    TEXT        NOT NULL,   -- bcrypt, cost factor 12
  display_name     TEXT        NOT NULL,
  role             TEXT        NOT NULL DEFAULT 'waiter'
                   CHECK (role IN ('waiter', 'manager', 'admin')),
  -- empty array = covers all zones; otherwise restricted to listed zone IDs
  assigned_zones   UUID[]      NOT NULL DEFAULT '{}',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, email)
);

CREATE INDEX idx_staff_club_id ON staff (club_id);
CREATE INDEX idx_staff_email   ON staff (email);

-- =============================================================================
-- menu_categories
-- Top-level drink categories: Cocktails, Spirits, Bottles, Soft Drinks, etc.
-- =============================================================================
CREATE TABLE menu_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  emoji       TEXT,                -- shown as tab icon on mobile, e.g. "🍸"
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_categories_club_id ON menu_categories (club_id);

-- =============================================================================
-- menu_items
-- Individual drink / product listings.
-- price_pence is stored as integer (smallest currency unit) to avoid float errors.
-- =============================================================================
CREATE TABLE menu_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  category_id    UUID        NOT NULL REFERENCES menu_categories (id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  description    TEXT,
  price_pence    INT         NOT NULL CHECK (price_pence >= 0),
  image_url      TEXT,                 -- CDN URL (WebP)
  is_available   BOOLEAN     NOT NULL DEFAULT true,
  is_featured    BOOLEAN     NOT NULL DEFAULT false,
  -- modifiers JSONB shape:
  -- [{ "id": "uuid", "name": "Ice", "required": false,
  --    "options": [{"label": "No ice", "priceDeltaPence": 0}] }]
  modifiers      JSONB       NOT NULL DEFAULT '[]',
  sort_order     INT         NOT NULL DEFAULT 0,
  prep_time_mins INT         NOT NULL DEFAULT 3,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_club_id     ON menu_items (club_id);
CREATE INDEX idx_menu_items_category_id ON menu_items (category_id);
-- Partial index: fast lookup of currently available items per club
CREATE INDEX idx_menu_items_available   ON menu_items (club_id) WHERE is_available = true;

-- =============================================================================
-- orders
-- Core business entity. Each row = one customer order submission.
-- =============================================================================
CREATE TABLE orders (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id            UUID        NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  session_id         UUID        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  zone_id            UUID        NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  nfc_tag_id         UUID        NOT NULL REFERENCES nfc_tags (id) ON DELETE CASCADE,
  assigned_staff_id  UUID        REFERENCES staff (id) ON DELETE SET NULL,
  -- Human-readable number, e.g. "T7-014" (table short + sequence)
  order_number       TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','preparing','ready','delivered','cancelled')),
  priority           TEXT        NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('normal', 'vip', 'urgent')),
  notes              TEXT,
  subtotal_pence     INT         NOT NULL CHECK (subtotal_pence >= 0),
  total_pence        INT         NOT NULL CHECK (total_pence >= 0),
  -- Timestamps for each lifecycle stage (set server-side, never client-provided)
  accepted_at        TIMESTAMPTZ,
  preparing_at       TIMESTAMPTZ,
  ready_at           TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,
  estimated_ready_at TIMESTAMPTZ,
  -- Prevents duplicate order submission on network retry / double-tap
  idempotency_key    TEXT        NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Active orders index (excludes terminal states — much smaller than full table)
CREATE INDEX idx_orders_active     ON orders (club_id, status, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled');
CREATE INDEX idx_orders_club_id    ON orders (club_id);
CREATE INDEX idx_orders_zone_id    ON orders (zone_id);
CREATE INDEX idx_orders_session_id ON orders (session_id);
CREATE INDEX idx_orders_nfc_tag_id ON orders (nfc_tag_id);
CREATE INDEX idx_orders_staff_id   ON orders (assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;
CREATE INDEX idx_orders_created_at ON orders (club_id, created_at DESC);

-- =============================================================================
-- order_items
-- Line items within an order. Prices are snapshotted at order time.
-- =============================================================================
CREATE TABLE order_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  menu_item_id        UUID        NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
  quantity            INT         NOT NULL CHECK (quantity > 0 AND quantity <= 20),
  unit_price_pence    INT         NOT NULL CHECK (unit_price_pence >= 0),
  total_pence         INT         NOT NULL CHECK (total_pence >= 0),
  -- Snapshot of chosen modifier options at order time
  -- [{ "modifierId": "uuid", "modifierName": "Ice", "optionLabel": "No ice", "priceDeltaPence": 0 }]
  selected_modifiers  JSONB       NOT NULL DEFAULT '[]',
  -- Item name at time of order (menu name may change later)
  name_snapshot       TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order_id     ON order_items (order_id);
CREATE INDEX idx_order_items_menu_item_id ON order_items (menu_item_id);

-- =============================================================================
-- order_status_history
-- Immutable audit log of every order status transition.
-- =============================================================================
CREATE TABLE order_status_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status      TEXT,                            -- NULL for initial 'pending' entry
  to_status        TEXT        NOT NULL,
  changed_by       UUID,                            -- staff.id if staff-initiated
  changed_by_type  TEXT        CHECK (changed_by_type IN ('customer', 'staff', 'system')),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order_id ON order_status_history (order_id);

-- =============================================================================
-- Triggers: auto-update updated_at on relevant tables
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
