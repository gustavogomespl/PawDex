"""users, place membership, and content ownership

Revision ID: 0002_users_membership
Revises: 0001_baseline
Create Date: 2026-06-27

Phase C foundation. Provider-agnostic: `users` is self-managed (upserted on
sign-in by the JWT-session auth layer), independent of any specific auth provider.
`created_by` columns are nullable so existing/seed rows (which have no author)
remain valid; they use ON DELETE SET NULL to preserve content if a user is removed.
"""
from alembic import op

revision = "0002_users_membership"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS place_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, user_id)
);

ALTER TABLE animals
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sightings
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pending_sighting_analyses
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS place_members_user_id_idx ON place_members(user_id);
CREATE INDEX IF NOT EXISTS animals_created_by_idx ON animals(created_by);
CREATE INDEX IF NOT EXISTS sightings_created_by_idx ON sightings(created_by);
CREATE INDEX IF NOT EXISTS pending_analyses_created_by_idx ON pending_sighting_analyses(created_by);
"""


DOWNGRADE_SQL = """
ALTER TABLE pending_sighting_analyses DROP COLUMN IF EXISTS created_by;
ALTER TABLE sightings DROP COLUMN IF EXISTS created_by;
ALTER TABLE animals DROP COLUMN IF EXISTS created_by;
DROP TABLE IF EXISTS place_members;
DROP TABLE IF EXISTS users;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
