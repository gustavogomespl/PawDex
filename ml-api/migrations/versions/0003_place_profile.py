"""place profile fields (photo + geofence)

Revision ID: 0003_place_profile
Revises: 0002_users_membership
Create Date: 2026-06-27

Adds optional place profile fields used by place creation (photo) and by the
"I'm at the place" / GPS-proximity join flow (geofence). All nullable so the
seeded demo place stays valid.
"""
from alembic import op

revision = "0003_place_profile"
down_revision = "0002_users_membership"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
ALTER TABLE places ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS geofence_lat double precision;
ALTER TABLE places ADD COLUMN IF NOT EXISTS geofence_lng double precision;
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS geofence_radius_m double precision
  CHECK (geofence_radius_m IS NULL OR geofence_radius_m > 0);
"""


DOWNGRADE_SQL = """
ALTER TABLE places DROP COLUMN IF EXISTS geofence_radius_m;
ALTER TABLE places DROP COLUMN IF EXISTS geofence_lng;
ALTER TABLE places DROP COLUMN IF EXISTS geofence_lat;
ALTER TABLE places DROP COLUMN IF EXISTS photo_url;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
