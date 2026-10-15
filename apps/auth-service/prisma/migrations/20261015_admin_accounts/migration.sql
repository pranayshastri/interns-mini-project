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
