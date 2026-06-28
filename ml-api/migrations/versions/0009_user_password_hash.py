"""add password hash to users

Revision ID: 0009_user_password_hash
Revises: 0008_reports
Create Date: 2026-06-28
"""
from alembic import op

revision = "0009_user_password_hash"
down_revision = "0008_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")
