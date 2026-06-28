"""content moderation reports

Revision ID: 0008_reports
Revises: 0007_name_suggestions
Create Date: 2026-06-27

Members flag a sighting or animal (duplicate, wrong info, inappropriate, animal
at risk, privacy). Reports land in an admin queue; reporting a sighting also
flips it to needs-review so it surfaces in the matching loop.
"""
from alembic import op

revision = "0008_reports"
down_revision = "0007_name_suggestions"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('sighting', 'animal')),
  target_id text NOT NULL,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS reports_place_status_idx
  ON reports(place_id, status, created_at);
"""


DOWNGRADE_SQL = """
DROP TABLE IF EXISTS reports;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
