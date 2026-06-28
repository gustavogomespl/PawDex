"""append-only audit log

Revision ID: 0005_audit_log
Revises: 0004_place_invite_code
Create Date: 2026-06-27

LGPD accountability: an append-only record of sensitive actions (e.g. a user
erasing their own content). user_id is ON DELETE SET NULL so the trail survives.
"""
from alembic import op

revision = "0005_audit_log"
down_revision = "0004_place_invite_code"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);
"""


DOWNGRADE_SQL = """
DROP TABLE IF EXISTS audit_log;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
