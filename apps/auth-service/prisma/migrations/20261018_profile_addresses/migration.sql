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
