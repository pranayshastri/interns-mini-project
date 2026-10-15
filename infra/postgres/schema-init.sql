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

-- Seed 3 Users in ecommerce_auth_db (Password: 'Password123' hashed with bcrypt)
INSERT INTO users (id, email, password_hash, role, full_name, shop_id) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@shopping.com', '$2a$10$7EqJtq98hPqEX7fNZaFWoO.eR8M1gN7aU5F3aHkP4.N4/M.b/Vn1y', 'ADMIN', 'Platform Admin', NULL),
('b0000000-0000-0000-0000-000000000002', 'shopkeeper@gadgets.com', '$2a$10$7EqJtq98hPqEX7fNZaFWoO.eR8M1gN7aU5F3aHkP4.N4/M.b/Vn1y', 'SHOPKEEPER', 'John Merchant', 'd0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000003', 'customer@gmail.com', '$2a$10$7EqJtq98hPqEX7fNZaFWoO.eR8M1gN7aU5F3aHkP4.N4/M.b/Vn1y', 'CUSTOMER', 'Alice Consumer', NULL)
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
