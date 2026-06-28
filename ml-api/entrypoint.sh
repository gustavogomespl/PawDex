#!/bin/sh
set -e

echo "Applying database migrations (alembic upgrade head)..."
# Postgres may not accept connections the instant the container boots (Railway has
# no depends_on health gating between services), so retry before giving up instead
# of crash-looping immediately. `until` is exempt from `set -e`.
attempt=1
max_attempts=10
until alembic upgrade head; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Migrations still failing after ${max_attempts} attempts; exiting."
    exit 1
  fi
  echo "Migration attempt ${attempt} failed; retrying in 3s..."
  attempt=$((attempt + 1))
  sleep 3
done

echo "Starting PawDex ML API..."
# Empty --host binds dual-stack (IPv4 + IPv6) on Linux: Railway private networking
# resolves to IPv6 while the platform healthcheck uses IPv4 — both must work.
exec uvicorn app.main:app --host "" --port "${PORT:-8000}"
