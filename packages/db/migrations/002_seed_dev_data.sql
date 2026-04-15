-- =============================================================================
-- Development seed data
-- Migration: 002_seed_dev_data
-- DO NOT run in production — use a separate admin UI for real club setup
-- =============================================================================

-- Club
INSERT INTO clubs (id, name, slug, timezone, settings) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Halokonobar Demo Club',
  'halokonobar-demo',
  'Europe/London',
  '{
    "currency": "GBP",
    "currencySymbol": "£",
    "vipEnabled": true,
    "maxOrderValuePence": 50000,
    "autoCancelPendingMinutes": 10,
    "delayAlertPendingMinutes": 3,
    "delayAlertPreparingMinutes": 15
  }'
) ON CONFLICT (id) DO NOTHING;

-- Zones
INSERT INTO zones (id, club_id, name, zone_type, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Main Floor', 'standard', 1),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'VIP Booth 1', 'vip', 2),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'Terrace', 'terrace', 3),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Bar Area', 'bar', 4)
ON CONFLICT (id) DO NOTHING;

-- NFC Tags
INSERT INTO nfc_tags (id, club_id, zone_id, tag_uid, tag_label) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001', 'TESTUID0001', 'Table 1'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001', 'TESTUID0002', 'Table 2'),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001', 'TESTUID0003', 'Table 3'),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000002', 'TESTUID0004', 'Booth 1'),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003', 'TESTUID0005', 'Terrace 1')
ON CONFLICT (id) DO NOTHING;

-- Staff (password: "password123" bcrypt hash)
INSERT INTO staff (id, club_id, email, password_hash, display_name, role) VALUES
  (
    '00000000-0000-0000-0003-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'waiter@demo.com',
    '$2b$12$Q4PrC9OmVPDXCbLbccNkd.iVGWLEtznya7IxTGg1TbkINE3.wvCqa',
    'Alex (Waiter)',
    'waiter'
  ),
  (
    '00000000-0000-0000-0003-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'manager@demo.com',
    '$2b$12$Q4PrC9OmVPDXCbLbccNkd.iVGWLEtznya7IxTGg1TbkINE3.wvCqa',
    'Sam (Manager)',
    'manager'
  )
ON CONFLICT (id) DO NOTHING;

-- Menu Categories
INSERT INTO menu_categories (id, club_id, name, emoji, sort_order) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', 'Cocktails', '🍸', 1),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001', 'Spirits', '🥃', 2),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001', 'Bottles', '🍾', 3),
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000001', 'Soft Drinks', '🥤', 4)
ON CONFLICT (id) DO NOTHING;

-- Menu Items
INSERT INTO menu_items (id, club_id, category_id, name, description, price_pence, is_featured, modifiers, prep_time_mins) VALUES
  -- Cocktails
  (
    '00000000-0000-0000-0005-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000001',
    'Negroni',
    'Campari, sweet vermouth, gin. A timeless classic.',
    1200,
    true,
    '[{"id":"mod-1","name":"Ice","required":false,"options":[{"label":"Normal ice","priceDeltaPence":0},{"label":"No ice","priceDeltaPence":0},{"label":"Extra ice","priceDeltaPence":0}]}]',
    3
  ),
  (
    '00000000-0000-0000-0005-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000001',
    'Aperol Spritz',
    'Aperol, prosecco, soda. Italian refreshment.',
    1000,
    true,
    '[]',
    2
  ),
  (
    '00000000-0000-0000-0005-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000001',
    'Espresso Martini',
    'Vodka, coffee liqueur, fresh espresso.',
    1300,
    false,
    '[]',
    4
  ),
  (
    '00000000-0000-0000-0005-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000001',
    'Mojito',
    'White rum, lime, mint, sugar, soda.',
    1100,
    false,
    '[{"id":"mod-2","name":"Sugar","required":false,"options":[{"label":"Normal","priceDeltaPence":0},{"label":"Less sugar","priceDeltaPence":0},{"label":"Extra sugar","priceDeltaPence":0}]}]',
    4
  ),
  -- Spirits
  (
    '00000000-0000-0000-0005-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000002',
    'Grey Goose Vodka',
    '50ml. Single serve.',
    800,
    false,
    '[{"id":"mod-3","name":"Mixer","required":false,"options":[{"label":"Neat","priceDeltaPence":0},{"label":"Tonic","priceDeltaPence":0},{"label":"Soda","priceDeltaPence":0},{"label":"Cranberry","priceDeltaPence":0}]}]',
    2
  ),
  (
    '00000000-0000-0000-0005-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000002',
    'Hendricks Gin',
    '50ml. Paired with tonic and cucumber.',
    900,
    false,
    '[]',
    2
  ),
  -- Bottles
  (
    '00000000-0000-0000-0005-000000000007',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000003',
    'Dom Pérignon Champagne',
    '750ml. Includes mixers and ice bucket.',
    25000,
    true,
    '[]',
    10
  ),
  (
    '00000000-0000-0000-0005-000000000008',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000003',
    'Grey Goose 1L',
    '1 litre bottle. Includes mixers.',
    18000,
    false,
    '[]',
    10
  ),
  -- Soft Drinks
  (
    '00000000-0000-0000-0005-000000000009',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000004',
    'Still Water',
    '500ml bottle.',
    300,
    false,
    '[]',
    1
  ),
  (
    '00000000-0000-0000-0005-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0004-000000000004',
    'Red Bull',
    '250ml can.',
    500,
    false,
    '[]',
    1
  )
ON CONFLICT (id) DO NOTHING;
