-- Shop identity is owned by the administrative account service.
-- Existing externally assigned shop IDs are preserved without inventing shop rows.
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
