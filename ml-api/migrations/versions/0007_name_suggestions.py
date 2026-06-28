"""community name suggestions / voting

Revision ID: 0007_name_suggestions
Revises: 0006_pending_crop_key
Create Date: 2026-06-27

One name suggestion per member per animal (their vote). The most-suggested name
is the community pick; an admin can promote it to the animal's official name.
"""
from alembic import op

revision = "0007_name_suggestions"
down_revision = "0006_pending_crop_key"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
CREATE TABLE IF NOT EXISTS name_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL,
  animal_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, animal_id, user_id),
  FOREIGN KEY (animal_id, place_id) REFERENCES animals(id, place_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS name_suggestions_animal_idx
  ON name_suggestions(place_id, animal_id);
"""


DOWNGRADE_SQL = """
DROP TABLE IF EXISTS name_suggestions;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
