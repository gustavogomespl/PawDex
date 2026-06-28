"""place invite code

Revision ID: 0004_place_invite_code
Revises: 0003_place_profile
Create Date: 2026-06-27

Adds an unguessable invite_code per place (C5 join flow). Backfills existing
places and sets a random default for new ones (pgcrypto gen_random_bytes).
"""
from alembic import op

revision = "0004_place_invite_code"
down_revision = "0003_place_profile"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
ALTER TABLE places ADD COLUMN IF NOT EXISTS invite_code text;
UPDATE places
   SET invite_code = encode(gen_random_bytes(9), 'hex')
 WHERE invite_code IS NULL;
ALTER TABLE places
  ALTER COLUMN invite_code SET DEFAULT encode(gen_random_bytes(9), 'hex');
ALTER TABLE places ALTER COLUMN invite_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS places_invite_code_idx ON places(invite_code);
"""


DOWNGRADE_SQL = """
DROP INDEX IF EXISTS places_invite_code_idx;
ALTER TABLE places DROP COLUMN IF EXISTS invite_code;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
