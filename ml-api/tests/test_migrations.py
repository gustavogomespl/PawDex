"""Guards that the Alembic baseline migration stays in sync with the fast-path
bootstrap schema in db/init/001_schema.sql.

Two schema sources exist on purpose: db/init runs only on a fresh Docker volume,
while Alembic is the forward-evolution path (and the only schema source on managed
Postgres that has no init scripts). New schema changes must be NEW Alembic
migrations — never edit 0001_baseline or 001_schema.sql. These tests fail if the
baseline drifts from the bootstrap schema.
"""
from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_SQL = (REPO_ROOT / "db" / "init" / "001_schema.sql").read_text()
BASELINE = (
    REPO_ROOT / "ml-api" / "migrations" / "versions" / "0001_baseline.py"
).read_text()


def _tables(sql: str) -> set[str]:
    return set(re.findall(r"create table if not exists (\w+)", sql, re.IGNORECASE))


def _indexes(sql: str) -> set[str]:
    return set(re.findall(r"create index if not exists (\w+)", sql, re.IGNORECASE))


def test_baseline_migration_covers_every_db_init_table():
    db_init_tables = _tables(SCHEMA_SQL)
    assert db_init_tables, "expected to find tables in db/init/001_schema.sql"
    assert db_init_tables <= _tables(BASELINE)


def test_baseline_migration_covers_every_db_init_index():
    db_init_indexes = _indexes(SCHEMA_SQL)
    assert db_init_indexes, "expected to find indexes in db/init/001_schema.sql"
    assert db_init_indexes <= _indexes(BASELINE)


def test_baseline_migration_is_the_alembic_root():
    assert 'down_revision = None' in BASELINE
    assert 'revision = "0001_baseline"' in BASELINE


def _read_migration(filename: str) -> str:
    return (
        REPO_ROOT / "ml-api" / "migrations" / "versions" / filename
    ).read_text()


def test_membership_migration_chains_from_baseline():
    sql = _read_migration("0002_users_membership.py")
    assert 'revision = "0002_users_membership"' in sql
    assert 'down_revision = "0001_baseline"' in sql


def test_membership_migration_defines_users_membership_and_ownership():
    sql = _read_migration("0002_users_membership.py").lower()
    assert "create table if not exists users" in sql
    assert "create table if not exists place_members" in sql
    # ownership column added to the user-generated content tables
    assert "created_by" in sql


def test_place_profile_migration_chains_and_adds_columns():
    sql = _read_migration("0003_place_profile.py")
    assert 'revision = "0003_place_profile"' in sql
    assert 'down_revision = "0002_users_membership"' in sql
    low = sql.lower()
    assert "alter table places" in low
    assert "photo_url" in low
    assert "geofence" in low
