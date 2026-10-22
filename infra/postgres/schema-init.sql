-- =========================================================================
-- INDUSTRY-GRADE MULTI-SERVICE DATABASE SCHEMA INITIALIZATION & SEEDS
-- =========================================================================

-- 1. AUTH SERVICE DATABASE
\c ecommerce_auth_db;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL, -- 'ADMIN', 'SHOPKEEPER', 'CUSTOMER'
    full_name VARCHAR(128) NOT NULL,
    shop_id UUID NULL
);

-- Additive upgrade for existing Auth users. No roles, passwords or rows are replaced.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_name VARCHAR(128) NOT NULL,
  target_id UUID NOT NULL,
  target_email VARCHAR(255) NOT NULL,
  action VARCHAR(48) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  previous_status VARCHAR(16) NOT NULL,
  new_status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS users_role_status_id_idx ON users(role, status, id);
CREATE INDEX IF NOT EXISTS admin_audit_created_id_idx ON admin_audit_events(created_at DESC, id);

-- Personal delivery addresses belong to Auth, independently of shop addresses.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(80) NOT NULL,
  recipient VARCHAR(128) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  line1 VARCHAR(200) NOT NULL,
  line2 VARCHAR(200) NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal VARCHAR(32) NOT NULL,
  country VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON addresses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user ON addresses(user_id) WHERE is_default = true;

-- Seed 3 Users in ecommerce_auth_db (Password: 'Password123', bcrypt cost 12)
INSERT INTO users (id, email, password_hash, role, full_name, shop_id) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@shopping.com', '$2a$12$180.JGq7G31G9VZNMrB6sewBP197DUWsMxpCpwSgLqCLqgtTz9cia', 'ADMIN', 'Platform Admin', NULL),
('b0000000-0000-0000-0000-000000000002', 'shopkeeper@gadgets.com', '$2a$12$180.JGq7G31G9VZNMrB6sewBP197DUWsMxpCpwSgLqCLqgtTz9cia', 'SHOPKEEPER', 'John Merchant', 'd0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000003', 'customer@gmail.com', '$2a$12$180.JGq7G31G9VZNMrB6sewBP197DUWsMxpCpwSgLqCLqgtTz9cia', 'CUSTOMER', 'Alice Consumer', NULL)
ON CONFLICT (email) DO NOTHING;

-- 2. CATALOG SERVICE DATABASE
\c ecommerce_catalog_db;

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (id, shop_id, name, description, price_cents) VALUES
('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Mechanical Keyboard', 'RGB Hot-swappable Mechanical Keyboard', 8900)
ON CONFLICT (id) DO NOTHING;

-- 3. INVENTORY SERVICE DATABASE
\c ecommerce_inventory_db;

CREATE TABLE IF NOT EXISTS product_inventory (
    product_id UUID PRIMARY KEY,
    available_stock INT NOT NULL CHECK (available_stock >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inbox_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS order_confirmation_outbox (
    order_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    success BOOLEAN NOT NULL,
    insufficient_product_ids TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS order_confirmation_outbox_pending_idx
  ON order_confirmation_outbox(status, next_attempt_at, created_at);

INSERT INTO product_inventory (product_id, available_stock) VALUES
('e0000000-0000-0000-0000-000000000001', 50)
ON CONFLICT (product_id) DO NOTHING;

-- 4. ORDER SERVICE DATABASE (Transactional Outbox Pattern)
\c ecommerce_order_db;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    total_amount_cents BIGINT NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING' NOT NULL,
    shipping_address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    quantity INT NOT NULL,
    unit_price_cents BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inventory_reservations_order_status_idx
  ON inventory_reservations(order_id, status);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total_cents BIGINT NOT NULL,
    buyer_id UUID NOT NULL,
    seller_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE NULL,
    pdf_url TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 5. NOTIFICATION SERVICE DATABASE (In-App Inbox)
\c ecommerce_notification_db;

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,                       -- recipient user (e.g. customer)
    shop_id UUID NULL,                       -- recipient shop (shopkeeper inbox)
    type VARCHAR(64) NOT NULL,               -- 'ORDER_PLACED_CUSTOMER' | 'ORDER_RECEIVED_SHOPKEEPER'
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data_json TEXT NOT NULL DEFAULT '{}',    -- JSON: orderId, totalAmountCents, units, ...
    read_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_id IS NOT NULL OR shop_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_shop_created_idx ON notifications(shop_id, created_at DESC);

-- Idempotent consumer ledger (same pattern as ecommerce_inventory_db)
CREATE TABLE IF NOT EXISTS inbox_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
