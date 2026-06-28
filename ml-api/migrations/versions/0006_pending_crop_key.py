"""pending analysis crop_key (object-storage key for the cropped animal)

Revision ID: 0006_pending_crop_key
Revises: 0005_audit_log
Create Date: 2026-06-27

The analyze step uploads the cropped animal to object storage and stores its key
here; confirm then persists the crop key (not the full base64 photo).
"""
from alembic import op

revision = "0006_pending_crop_key"
down_revision = "0005_audit_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE pending_sighting_analyses ADD COLUMN IF NOT EXISTS crop_key text;"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE pending_sighting_analyses DROP COLUMN IF EXISTS crop_key;"
    )
