# Pgvector Pet Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Dockerized Postgres + pgvector persistence and use stored visual embeddings to suggest whether an uploaded pet sighting matches an existing animal in the current place.

**Architecture:** The Next.js app remains browser-facing and calls same-origin API routes. Those routes proxy to `ml-api`, which owns YOLO detection, crop embedding, pgvector insertion/search, and confirmation persistence. Postgres stores places, animals, sightings, pending analyses, embeddings, and match suggestion audit rows.

**Tech Stack:** Next.js 16, React 19, Vitest, Python 3.12, FastAPI, Pytest, Pillow, Ultralytics YOLO, Torch/Torchvision CPU, Psycopg 3, pgvector-python, Postgres with pgvector, Docker Compose.

---

## File Structure

- Create `db/init/001_schema.sql`: pgvector-enabled schema for PawDex places, animals, sightings, pending analyses, embeddings, and match suggestions.
- Create `db/init/002_seed.sql`: seed the demo office place, animals, and sightings currently mirrored in `src/domain/pawdex/seed.ts`.
- Modify `compose.yaml`: add `db`, wire `ml-api` to `DATABASE_URL`, and make service startup depend on database health.
- Modify `ml-api/requirements.txt`: add `psycopg`, `psycopg_pool`, `pgvector`, and `numpy`.
- Create `ml-api/app/config.py`: typed environment settings.
- Create `ml-api/app/database.py`: Psycopg pool creation, dict rows, pgvector registration, and health check helper.
- Create `ml-api/app/repository.py`: database methods for state loading, pending analyses, vector search, confirmations, and suggestion audit rows.
- Create `ml-api/tests/test_repository.py`: repository tests using fake rows and query-recording connection objects.
- Create `ml-api/app/embedding.py`: crop helpers, quality score, embedder protocol, and MobileNetV3 Small embedder.
- Create `ml-api/tests/test_embedding.py`: crop, quality, normalization, and fake embedding tests.
- Create `ml-api/app/matching.py`: analyze and confirm use cases that combine detector, embedder, and repository.
- Create `ml-api/tests/test_matching.py`: service tests for no-pet, probably-new, possible-existing, and confirmations.
- Modify `ml-api/app/main.py`: add `/places/{place_id}/state`, `/analyze-sighting`, and `/confirm-sighting`; keep `/detect`.
- Modify `ml-api/tests/test_main.py`: API tests for state, analyze, confirm, and database-aware health.
- Create `src/domain/matching/types.ts`: frontend contracts for analyze and confirm responses.
- Create `src/domain/matching/client.ts`: browser helpers for analyze and confirm calls.
- Create `src/app/api/analyze-sighting/route.ts`: Next proxy route to `ml-api`.
- Create `src/app/api/analyze-sighting/route.test.ts`: proxy tests.
- Create `src/app/api/confirm-sighting/route.ts`: Next proxy route to `ml-api`.
- Create `src/app/api/confirm-sighting/route.test.ts`: proxy tests.
- Create `src/app/api/pawdex/state/route.ts`: Next proxy route for loading current place state from Postgres.
- Create `src/app/api/pawdex/state/route.test.ts`: state proxy tests.
- Modify `src/components/SightingComposer.tsx`: call analyze endpoint, render vector matches, pass `analysisId` during confirmation.
- Modify `src/components/SightingComposer.test.tsx`: replace mocked detection-only expectations with match analysis expectations.
- Modify `src/hooks/usePawDexStore.ts`: load remote PawDex state first, confirm sightings through API, keep local state in sync with returned state.
- Modify `src/components/PawDexApp.test.tsx`: cover remote state loading and confirmation flow.
- Modify `README.md`: document Docker Compose, database reset, and matching flow verification.

## Task 1: Dockerized Pgvector Database

**Files:**
- Create: `db/init/001_schema.sql`
- Create: `db/init/002_seed.sql`
- Modify: `compose.yaml`
- Test: Docker Compose health checks

- [ ] **Step 1: Add schema migration**

Create `db/init/001_schema.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS places (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  privacy_level text NOT NULL,
  album_total_slots integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animals (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  display_name text NOT NULL,
  status text NOT NULL,
  description text NOT NULL DEFAULT '',
  color_tags text[] NOT NULL DEFAULT '{}',
  rarity_label text NOT NULL DEFAULT 'Ocasional',
  primary_photo_url text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sightings (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  zone_label text NOT NULL DEFAULT 'Area comum',
  taken_at timestamptz NOT NULL,
  detector_confidence double precision,
  match_confidence double precision,
  review_status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_sighting_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  species text NOT NULL CHECK (species IN ('cat', 'dog')),
  detector_confidence double precision NOT NULL,
  detection_box jsonb NOT NULL,
  model_version text NOT NULL,
  embedding vector(576) NOT NULL,
  quality_score double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS animal_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  sighting_id text REFERENCES sightings(id) ON DELETE CASCADE,
  model_version text NOT NULL,
  embedding vector(576) NOT NULL,
  quality_score double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  sighting_id text NOT NULL REFERENCES sightings(id) ON DELETE CASCADE,
  candidate_animal_id text NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  score double precision NOT NULL,
  status text NOT NULL CHECK (status IN ('suggested', 'confirmed', 'rejected', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS animals_place_id_idx ON animals(place_id);
CREATE INDEX IF NOT EXISTS sightings_place_id_taken_at_idx ON sightings(place_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS animal_embeddings_place_species_idx ON animal_embeddings(place_id, animal_id);
```

- [ ] **Step 2: Add seed data**

Create `db/init/002_seed.sql` with the same demo records as `src/domain/pawdex/seed.ts`. Use `ON CONFLICT DO NOTHING` so container restarts are stable:

```sql
INSERT INTO places (id, name, type, privacy_level, album_total_slots)
VALUES ('place-office-centro', 'Escritorio Centro', 'office', 'invite-only', 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO animals (
  id, place_id, species, display_name, status, description, color_tags,
  rarity_label, primary_photo_url, first_seen_at, last_seen_at
) VALUES
('animal-mingau', 'place-office-centro', 'cat', 'Mingau', 'community', 'Gato claro que costuma aparecer perto da recepcao.', ARRAY['branco','creme'], 'Comum', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80', '2026-05-02T12:00:00.000Z', '2026-06-24T13:20:00.000Z'),
('animal-caramelo', 'place-office-centro', 'dog', 'Caramelo', 'has-owner', 'Cachorro simpatico visto no jardim lateral.', ARRAY['caramelo'], 'Ocasional', 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=800&q=80', '2026-05-09T14:10:00.000Z', '2026-06-21T11:05:00.000Z'),
('animal-pretinha', 'place-office-centro', 'cat', 'Pretinha', 'unknown', 'Gata escura e discreta, geralmente vista no estacionamento.', ARRAY['preto'], 'Timida', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=800&q=80', '2026-05-17T09:30:00.000Z', '2026-06-26T18:25:00.000Z'),
('animal-thor', 'place-office-centro', 'dog', 'Thor', 'has-owner', 'Visitante de pequeno porte que aparece com um colaborador.', ARRAY['marrom','branco'], 'Visitante', 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80', '2026-06-03T16:15:00.000Z', '2026-06-25T15:00:00.000Z'),
('animal-sombra', 'place-office-centro', 'cat', 'Sombra', 'community', 'Gato cinza que circula perto do bicicletario.', ARRAY['cinza'], 'Raro', 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=800&q=80', '2026-06-01T10:00:00.000Z', '2026-06-12T10:45:00.000Z'),
('animal-luna', 'place-office-centro', 'cat', 'Luna', 'unknown', 'Gata rajada que aparece perto das plantas.', ARRAY['rajado','dourado'], 'Ocasional', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80', '2026-05-27T12:30:00.000Z', '2026-06-18T12:40:00.000Z'),
('animal-bento', 'place-office-centro', 'dog', 'Bento', 'has-owner', 'Cachorro pequeno visto em dias de visita pet-friendly.', ARRAY['preto','branco'], 'Lenda local', 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80', '2026-06-06T10:20:00.000Z', '2026-06-06T10:20:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sightings (
  id, place_id, animal_id, photo_url, species, zone_label, taken_at,
  detector_confidence, match_confidence, review_status
) VALUES
('sighting-mingau-001', 'place-office-centro', 'animal-mingau', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80', 'cat', 'Recepcao', '2026-06-24T13:20:00.000Z', 0.87, 0.88, 'confirmed'),
('sighting-caramelo-001', 'place-office-centro', 'animal-caramelo', 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=800&q=80', 'dog', 'Jardim lateral', '2026-06-21T11:05:00.000Z', 0.86, 0.82, 'confirmed'),
('sighting-thor-002', 'place-office-centro', 'animal-thor', 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=800&q=80', 'dog', 'Andar 3', '2026-06-25T15:00:00.000Z', 0.8, 0.75, 'confirmed'),
('sighting-pretinha-003', 'place-office-centro', 'animal-pretinha', 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=800&q=80', 'cat', 'Estacionamento', '2026-06-26T18:25:00.000Z', 0.84, 0.79, 'confirmed')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 3: Update Compose**

Modify `compose.yaml`:

```yaml
services:
  db:
    image: pgvector/pgvector:pg18-trixie
    environment:
      POSTGRES_DB: pawdex
      POSTGRES_USER: pawdex
      POSTGRES_PASSWORD: pawdex
    ports:
      - "5432:5432"
    volumes:
      - pawdex-db-data:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pawdex -d pawdex"]
      interval: 10s
      timeout: 5s
      retries: 5

  ml-api:
    build:
      context: ./ml-api
    environment:
      DATABASE_URL: postgresql://pawdex:pawdex@db:5432/pawdex
      PAWDEX_YOLO_MODEL: ${PAWDEX_YOLO_MODEL:-yolo11n.pt}
      PAWDEX_YOLO_CONFIDENCE: ${PAWDEX_YOLO_CONFIDENCE:-0.35}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
    environment:
      ML_API_URL: http://ml-api:8000
    ports:
      - "3000:3000"
    depends_on:
      ml-api:
        condition: service_healthy

volumes:
  pawdex-db-data:
```

- [ ] **Step 4: Verify database startup**

Run:

```bash
docker compose up --build -d db
docker compose ps
```

Expected: `db` is `healthy`.

- [ ] **Step 5: Verify schema exists**

Run:

```bash
docker compose exec db psql -U pawdex -d pawdex -c "SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pgcrypto'); SELECT COUNT(*) FROM animals;"
```

Expected: output includes `vector`, `pgcrypto`, and `7` animals.

- [ ] **Step 6: Commit**

```bash
git add compose.yaml db/init/001_schema.sql db/init/002_seed.sql
git commit -m "chore: add pgvector database"
```

## Task 2: Python Database Repository

**Files:**
- Modify: `ml-api/requirements.txt`
- Create: `ml-api/app/config.py`
- Create: `ml-api/app/database.py`
- Create: `ml-api/app/repository.py`
- Test: `ml-api/tests/test_repository.py`

- [ ] **Step 1: Add Python database dependencies**

Modify `ml-api/requirements.txt`:

```txt
fastapi==0.115.13
uvicorn[standard]==0.34.3
python-multipart==0.0.20
pillow==11.1.0
ultralytics==8.3.59
pytest==8.3.4
httpx==0.28.1
psycopg[binary,pool]==3.2.10
pgvector==0.4.1
numpy==2.2.1
```

- [ ] **Step 2: Write failing repository tests**

Create `ml-api/tests/test_repository.py`:

```python
import numpy as np

from app.repository import (
    MatchCandidate,
    PostgresPawDexRepository,
    row_to_animal,
    similarity_from_distance,
)


def test_similarity_from_distance_is_clamped():
    assert similarity_from_distance(0.16) == 0.84
    assert similarity_from_distance(-0.5) == 1.0
    assert similarity_from_distance(1.4) == 0.0


def test_row_to_animal_uses_frontend_field_names():
    animal = row_to_animal(
        {
            "id": "animal-mingau",
            "place_id": "place-office-centro",
            "species": "cat",
            "display_name": "Mingau",
            "status": "community",
            "description": "Gato claro.",
            "color_tags": ["branco"],
            "rarity_label": "Comum",
            "primary_photo_url": "https://example.com/cat.jpg",
            "first_seen_at": "2026-05-02T12:00:00+00:00",
            "last_seen_at": "2026-06-24T13:20:00+00:00",
        }
    )

    assert animal["placeId"] == "place-office-centro"
    assert animal["displayName"] == "Mingau"
    assert animal["primaryPhotoUrl"] == "https://example.com/cat.jpg"
    assert animal["colorTags"] == ["branco"]


class RecordingConnection:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        return self

    def fetchall(self):
        return [
            {
                "animal_id": "animal-mingau",
                "display_name": "Mingau",
                "species": "cat",
                "primary_photo_url": "https://example.com/cat.jpg",
                "distance": 0.18,
            }
        ]


class RecordingPool:
    def __init__(self, conn):
        self.conn = conn

    def connection(self):
        return self

    def __enter__(self):
        return self.conn

    def __exit__(self, exc_type, exc, tb):
        return False


def test_find_matches_restricts_vector_search_to_place_and_species():
    conn = RecordingConnection()
    repository = PostgresPawDexRepository(RecordingPool(conn))

    matches = repository.find_matches(
        place_id="place-office-centro",
        species="cat",
        embedding=np.zeros(576, dtype=np.float32),
        limit=3,
    )

    sql, params = conn.calls[0]
    assert "WHERE ae.place_id = %s" in sql
    assert "a.species = %s" in sql
    assert params[1] == "place-office-centro"
    assert params[2] == "cat"
    assert isinstance(matches[0], MatchCandidate)
    assert matches[0].score == 0.82
```

- [ ] **Step 3: Run repository tests to verify failure**

Run:

```bash
cd ml-api
python -m pytest tests/test_repository.py -q
```

Expected: FAIL because `app.repository` does not exist.

- [ ] **Step 4: Add config and database helpers**

Create `ml-api/app/config.py`:

```python
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    yolo_model: str
    yolo_confidence: float


def load_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL", "postgresql://pawdex:pawdex@127.0.0.1:5432/pawdex"
        ),
        yolo_model=os.getenv("PAWDEX_YOLO_MODEL", "yolo11n.pt"),
        yolo_confidence=float(os.getenv("PAWDEX_YOLO_CONFIDENCE", "0.35")),
    )
```

Create `ml-api/app/database.py`:

```python
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from pgvector.psycopg import register_vector
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def configure_connection(connection: Connection[Any]) -> None:
    register_vector(connection)


def create_pool(database_url: str) -> ConnectionPool:
    return ConnectionPool(
        database_url,
        min_size=1,
        max_size=5,
        open=False,
        kwargs={"row_factory": dict_row},
        configure=configure_connection,
    )


@contextmanager
def connection_from_pool(pool: ConnectionPool) -> Iterator[Connection[Any]]:
    with pool.connection() as connection:
        yield connection
```

- [ ] **Step 5: Add repository implementation**

Create `ml-api/app/repository.py` with these public objects:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

import numpy as np


@dataclass(frozen=True)
class MatchCandidate:
    animal_id: str
    display_name: str
    species: str
    primary_photo_url: str
    score: float


class PawDexRepository(Protocol):
    def healthcheck(self) -> None: ...
    def get_place_state(self, place_id: str) -> dict[str, Any]: ...
    def find_matches(
        self, place_id: str, species: str, embedding: np.ndarray, limit: int
    ) -> list[MatchCandidate]: ...
    def create_pending_analysis(
        self,
        place_id: str,
        species: str,
        detector_confidence: float,
        detection_box: dict[str, float],
        model_version: str,
        embedding: np.ndarray,
        quality_score: float,
    ) -> str: ...


def similarity_from_distance(distance: float) -> float:
    return round(max(0.0, min(1.0, 1.0 - distance)), 4)
```

Then add `PostgresPawDexRepository` with parameterized SQL:

```python
class PostgresPawDexRepository:
    def __init__(self, pool):
        self.pool = pool

    def healthcheck(self) -> None:
        with self.pool.connection() as connection:
            connection.execute("SELECT 1").fetchone()

    def find_matches(
        self, place_id: str, species: str, embedding: np.ndarray, limit: int = 3
    ) -> list[MatchCandidate]:
        sql = """
            SELECT
              ae.animal_id,
              a.display_name,
              a.species,
              a.primary_photo_url,
              MIN(ae.embedding <=> %s) AS distance
            FROM animal_embeddings ae
            JOIN animals a ON a.id = ae.animal_id
            WHERE ae.place_id = %s
              AND a.species = %s
            GROUP BY ae.animal_id, a.display_name, a.species, a.primary_photo_url
            ORDER BY distance ASC
            LIMIT %s
        """
        with self.pool.connection() as connection:
            rows = connection.execute(sql, (embedding, place_id, species, limit)).fetchall()

        return [
            MatchCandidate(
                animal_id=row["animal_id"],
                display_name=row["display_name"],
                species=row["species"],
                primary_photo_url=row["primary_photo_url"],
                score=similarity_from_distance(float(row["distance"])),
            )
            for row in rows
        ]
```

Add these mapping helpers to the same file:

```python
def iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return str(value).replace("+00:00", "Z")


def row_to_place(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "privacyLevel": row["privacy_level"],
        "albumTotalSlots": row["album_total_slots"],
    }


def row_to_animal(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "placeId": row["place_id"],
        "species": row["species"],
        "displayName": row["display_name"],
        "status": row["status"],
        "description": row["description"],
        "colorTags": list(row["color_tags"]),
        "rarityLabel": row["rarity_label"],
        "primaryPhotoUrl": row["primary_photo_url"],
        "firstSeenAt": iso(row["first_seen_at"]),
        "lastSeenAt": iso(row["last_seen_at"]),
    }


def row_to_sighting(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "placeId": row["place_id"],
        "animalId": row["animal_id"],
        "photoUrl": row["photo_url"],
        "zoneLabel": row["zone_label"],
        "takenAt": iso(row["taken_at"]),
        "matchConfidence": row["match_confidence"],
        "reviewStatus": row["review_status"],
    }
```

Add `get_place_state` using three ordered queries:

```python
def get_place_state(self, place_id: str) -> dict[str, Any]:
    with self.pool.connection() as connection:
        place = connection.execute(
            "SELECT * FROM places WHERE id = %s", (place_id,)
        ).fetchone()
        animals = connection.execute(
            "SELECT * FROM animals WHERE place_id = %s ORDER BY first_seen_at ASC",
            (place_id,),
        ).fetchall()
        sightings = connection.execute(
            "SELECT * FROM sightings WHERE place_id = %s ORDER BY taken_at DESC",
            (place_id,),
        ).fetchall()

    if place is None:
        return {"places": [], "animals": [], "sightings": [], "albumSlots": []}

    animal_ids = [row["id"] for row in animals]
    total_slots = int(place["album_total_slots"])
    album_slots = [
        {
            "slotNumber": index + 1,
            "placeId": place_id,
            "animalId": animal_ids[index] if index < len(animal_ids) else None,
            "isDiscovered": index < len(animal_ids),
        }
        for index in range(total_slots)
    ]

    return {
        "places": [row_to_place(place)],
        "animals": [row_to_animal(row) for row in animals],
        "sightings": [row_to_sighting(row) for row in sightings],
        "albumSlots": album_slots,
    }
```

Add `create_pending_analysis` with `RETURNING id`:

```python
def create_pending_analysis(
    self,
    place_id: str,
    species: str,
    detector_confidence: float,
    detection_box: dict[str, float],
    model_version: str,
    embedding: np.ndarray,
    quality_score: float,
) -> str:
    sql = """
        INSERT INTO pending_sighting_analyses (
          place_id, species, detector_confidence, detection_box,
          model_version, embedding, quality_score
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """
    with self.pool.connection() as connection:
        row = connection.execute(
            sql,
            (
                place_id,
                species,
                detector_confidence,
                detection_box,
                model_version,
                embedding,
                quality_score,
            ),
        ).fetchone()
    return str(row["id"])
```

Add confirmation methods that:

- Fetch the pending analysis by `analysis_id` and `place_id`.
- Insert a `sightings` row with an id shaped like `sighting-<12 hex chars>`.
- Insert an `animal_embeddings` row using the pending embedding.
- Update `animals.last_seen_at`, and for new animals insert the animal first with id `animal-<12 hex chars>`.
- Return `{"state": self.get_place_state(place_id), "selectedAnimalId": animal_id}`.

- [ ] **Step 6: Run repository tests**

Run:

```bash
cd ml-api
python -m pytest tests/test_repository.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ml-api/requirements.txt ml-api/app/config.py ml-api/app/database.py ml-api/app/repository.py ml-api/tests/test_repository.py
git commit -m "feat: add pawdex postgres repository"
```

## Task 3: Embedding and Crop Domain

**Files:**
- Create: `ml-api/app/embedding.py`
- Test: `ml-api/tests/test_embedding.py`

- [ ] **Step 1: Write failing embedding tests**

Create `ml-api/tests/test_embedding.py`:

```python
import math

import numpy as np
from PIL import Image

from app.detection import BoundingBox
from app.embedding import (
    EmbeddingResult,
    crop_to_box,
    estimate_quality_score,
    normalize_vector,
)


def test_crop_to_box_clamps_coordinates_to_image_bounds():
    image = Image.new("RGB", (100, 80), "white")
    crop = crop_to_box(image, BoundingBox(-10, 5, 120, 60))

    assert crop.size == (100, 55)


def test_quality_score_penalizes_tiny_crops():
    small = Image.new("RGB", (40, 40), "white")
    large = Image.new("RGB", (300, 240), "white")

    assert estimate_quality_score(small) < estimate_quality_score(large)
    assert 0 <= estimate_quality_score(small) <= 1
    assert 0 <= estimate_quality_score(large) <= 1


def test_normalize_vector_returns_unit_vector():
    vector = normalize_vector(np.array([3.0, 4.0], dtype=np.float32))

    assert math.isclose(float(np.linalg.norm(vector)), 1.0)


def test_embedding_result_keeps_fixed_contract():
    result = EmbeddingResult(
        vector=np.zeros(576, dtype=np.float32),
        model_version="torchvision-mobilenet-v3-small-imagenet1k-v1",
        quality_score=0.8,
    )

    assert result.vector.shape == (576,)
    assert result.model_version == "torchvision-mobilenet-v3-small-imagenet1k-v1"
```

- [ ] **Step 2: Run embedding tests to verify failure**

Run:

```bash
cd ml-api
python -m pytest tests/test_embedding.py -q
```

Expected: FAIL because `app.embedding` does not exist.

- [ ] **Step 3: Add embedding module**

Create `ml-api/app/embedding.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image

from app.detection import BoundingBox

MODEL_VERSION = "torchvision-mobilenet-v3-small-imagenet1k-v1"
EMBEDDING_DIMENSION = 576


@dataclass(frozen=True)
class EmbeddingResult:
    vector: np.ndarray
    model_version: str
    quality_score: float


class ImageEmbedder(Protocol):
    def embed(self, image: Image.Image) -> EmbeddingResult: ...


def crop_to_box(image: Image.Image, box: BoundingBox) -> Image.Image:
    width, height = image.size
    x1 = max(0, min(width, int(round(box.x1))))
    y1 = max(0, min(height, int(round(box.y1))))
    x2 = max(x1 + 1, min(width, int(round(box.x2))))
    y2 = max(y1 + 1, min(height, int(round(box.y2))))
    return image.crop((x1, y1, x2, y2))


def estimate_quality_score(image: Image.Image) -> float:
    width, height = image.size
    short_side = min(width, height)
    area = width * height
    short_side_score = min(1.0, short_side / 224)
    area_score = min(1.0, area / (224 * 224))
    return round(max(0.0, min(1.0, (short_side_score * 0.7) + (area_score * 0.3))), 4)


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if norm == 0:
        return vector.astype(np.float32)
    return (vector / norm).astype(np.float32)
```

Add `TorchvisionMobileNetEmbedder` below those helpers:

```python
class TorchvisionMobileNetEmbedder:
    def __init__(self):
        import torch
        from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

        self.torch = torch
        self.weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
        self.model = mobilenet_v3_small(weights=self.weights)
        self.model.classifier = torch.nn.Identity()
        self.model.eval()
        self.transforms = self.weights.transforms()

    def embed(self, image: Image.Image) -> EmbeddingResult:
        tensor = self.transforms(image).unsqueeze(0)
        with self.torch.no_grad():
            features = self.model(tensor).squeeze(0).detach().cpu().numpy()

        vector = normalize_vector(features.astype(np.float32))
        if vector.shape != (EMBEDDING_DIMENSION,):
            raise ValueError(f"Expected embedding shape {(EMBEDDING_DIMENSION,)}, got {vector.shape}.")

        return EmbeddingResult(
            vector=vector,
            model_version=MODEL_VERSION,
            quality_score=estimate_quality_score(image),
        )
```

- [ ] **Step 4: Run embedding tests**

Run:

```bash
cd ml-api
python -m pytest tests/test_embedding.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ml-api/app/embedding.py ml-api/tests/test_embedding.py
git commit -m "feat: add pet image embeddings"
```

## Task 4: Matching Service

**Files:**
- Create: `ml-api/app/matching.py`
- Test: `ml-api/tests/test_matching.py`

- [ ] **Step 1: Write failing matching tests**

Create `ml-api/tests/test_matching.py`:

```python
import numpy as np
from PIL import Image

from app.detection import BoundingBox, DetectionResponse, PetDetection
from app.embedding import EmbeddingResult
from app.matching import AnalyzeSightingService, recommendation_from_matches
from app.repository import MatchCandidate


class FakeDetector:
    def __init__(self, response):
        self.response = response

    def detect(self, image):
        return self.response


class FakeEmbedder:
    def embed(self, image):
        return EmbeddingResult(
            vector=np.ones(576, dtype=np.float32),
            model_version="fake-model",
            quality_score=0.9,
        )


class FakeRepository:
    def __init__(self, matches):
        self.matches = matches
        self.pending_calls = []

    def find_matches(self, place_id, species, embedding, limit):
        return self.matches

    def create_pending_analysis(self, **kwargs):
        self.pending_calls.append(kwargs)
        return "analysis-1"


def test_recommendation_from_matches_uses_threshold():
    assert recommendation_from_matches([]) == "probably_new"
    assert recommendation_from_matches([MatchCandidate("a", "A", "cat", "url", 0.79)]) == "probably_new"
    assert recommendation_from_matches([MatchCandidate("a", "A", "cat", "url", 0.8)]) == "possible_existing"


def test_analyze_returns_no_pet_detected_without_embedding():
    service = AnalyzeSightingService(
        detector=FakeDetector(DetectionResponse([], None)),
        embedder=FakeEmbedder(),
        repository=FakeRepository([]),
    )

    result = service.analyze(Image.new("RGB", (300, 300), "white"), "place-office-centro")

    assert result["recommendation"] == "no_pet_detected"
    assert result["matches"] == []
    assert result["analysisId"] is None


def test_analyze_returns_possible_existing_match():
    detection = PetDetection(
        species="cat",
        label="cat",
        confidence=0.91,
        box=BoundingBox(0, 0, 300, 300),
    )
    repository = FakeRepository(
        [MatchCandidate("animal-mingau", "Mingau", "cat", "https://example.com/cat.jpg", 0.86)]
    )
    service = AnalyzeSightingService(
        detector=FakeDetector(DetectionResponse([detection], detection)),
        embedder=FakeEmbedder(),
        repository=repository,
    )

    result = service.analyze(Image.new("RGB", (300, 300), "white"), "place-office-centro")

    assert result["analysisId"] == "analysis-1"
    assert result["recommendation"] == "possible_existing"
    assert result["matches"][0]["animalId"] == "animal-mingau"
    assert repository.pending_calls[0]["species"] == "cat"
```

- [ ] **Step 2: Run matching tests to verify failure**

Run:

```bash
cd ml-api
python -m pytest tests/test_matching.py -q
```

Expected: FAIL because `app.matching` does not exist.

- [ ] **Step 3: Add matching service**

Create `ml-api/app/matching.py`:

```python
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from PIL import Image

from app.detection import Detector
from app.embedding import ImageEmbedder, crop_to_box
from app.repository import MatchCandidate, PawDexRepository

MATCH_THRESHOLD = 0.8
MIN_QUALITY_SCORE = 0.18


def recommendation_from_matches(matches: list[MatchCandidate]) -> str:
    if matches and matches[0].score >= MATCH_THRESHOLD:
        return "possible_existing"
    return "probably_new"


def match_to_api(match: MatchCandidate) -> dict[str, Any]:
    return {
        "animalId": match.animal_id,
        "displayName": match.display_name,
        "species": match.species,
        "primaryPhotoUrl": match.primary_photo_url,
        "score": match.score,
    }


class AnalyzeSightingService:
    def __init__(
        self,
        detector: Detector,
        embedder: ImageEmbedder,
        repository: PawDexRepository,
    ):
        self.detector = detector
        self.embedder = embedder
        self.repository = repository

    def analyze(self, image: Image.Image, place_id: str) -> dict[str, Any]:
        detection_result = self.detector.detect(image)
        detection = detection_result.best_detection

        if detection is None:
            return {
                "analysisId": None,
                "detection": None,
                "embedding": None,
                "matches": [],
                "recommendation": "no_pet_detected",
            }

        crop = crop_to_box(image, detection.box)
        embedding = self.embedder.embed(crop)

        if embedding.quality_score < MIN_QUALITY_SCORE:
            return {
                "analysisId": None,
                "detection": asdict(detection),
                "embedding": {
                    "modelVersion": embedding.model_version,
                    "qualityScore": embedding.quality_score,
                },
                "matches": [],
                "recommendation": "needs_better_photo",
            }

        matches = self.repository.find_matches(
            place_id=place_id,
            species=detection.species,
            embedding=embedding.vector,
            limit=3,
        )
        analysis_id = self.repository.create_pending_analysis(
            place_id=place_id,
            species=detection.species,
            detector_confidence=detection.confidence,
            detection_box=asdict(detection.box),
            model_version=embedding.model_version,
            embedding=embedding.vector,
            quality_score=embedding.quality_score,
        )

        return {
            "analysisId": analysis_id,
            "detection": asdict(detection),
            "embedding": {
                "modelVersion": embedding.model_version,
                "qualityScore": embedding.quality_score,
            },
            "matches": [match_to_api(match) for match in matches],
            "recommendation": recommendation_from_matches(matches),
        }
```

- [ ] **Step 4: Run matching tests**

Run:

```bash
cd ml-api
python -m pytest tests/test_matching.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ml-api/app/matching.py ml-api/tests/test_matching.py
git commit -m "feat: add pet matching service"
```

## Task 5: FastAPI Matching Endpoints

**Files:**
- Modify: `ml-api/app/main.py`
- Modify: `ml-api/tests/test_main.py`

- [ ] **Step 1: Add failing API tests**

Extend `ml-api/tests/test_main.py` with:

```python
class FakeRepository:
    def healthcheck(self):
        self.healthy = True

    def get_place_state(self, place_id):
        return {
            "places": [
                {
                    "id": place_id,
                    "name": "Escritorio Centro",
                    "type": "office",
                    "privacyLevel": "invite-only",
                    "albumTotalSlots": 12,
                }
            ],
            "animals": [],
            "sightings": [],
            "albumSlots": [],
        }


def test_health_checks_database():
    repository = FakeRepository()
    app = create_app(
        lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["database"] == "connected"


def test_get_place_state_returns_repository_state():
    app = create_app(
        lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=FakeRepository,
    )
    client = TestClient(app)

    response = client.get("/places/place-office-centro/state")

    assert response.status_code == 200
    assert response.json()["places"][0]["id"] == "place-office-centro"
```

Add an analyze endpoint test with a fake service factory:

```python
class FakeAnalyzeService:
    def analyze(self, image, place_id):
        return {
            "analysisId": "analysis-1",
            "detection": {
                "species": "cat",
                "label": "cat",
                "confidence": 0.9,
                "box": {"x1": 1, "y1": 2, "x2": 10, "y2": 11},
            },
            "embedding": {"modelVersion": "fake-model", "qualityScore": 0.9},
            "matches": [],
            "recommendation": "probably_new",
        }


def test_analyze_sighting_returns_matching_response():
    app = create_app(
        lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=FakeRepository,
        analyze_service_factory=lambda app: FakeAnalyzeService(),
    )
    client = TestClient(app)

    response = client.post(
        "/analyze-sighting",
        data={"place_id": "place-office-centro"},
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["analysisId"] == "analysis-1"
    assert response.json()["recommendation"] == "probably_new"
```

- [ ] **Step 2: Run API tests to verify failure**

Run:

```bash
cd ml-api
python -m pytest tests/test_main.py -q
```

Expected: FAIL because `create_app` does not accept repository or matching factories.

- [ ] **Step 3: Update FastAPI app factory**

Modify `ml-api/app/main.py` so `create_app` accepts dependency factories:

```python
def create_app(
    detector_factory: Callable[[], Detector] | None = None,
    repository_factory: Callable[[], PawDexRepository] | None = None,
    embedder_factory: Callable[[], ImageEmbedder] | None = None,
    analyze_service_factory: Callable[[FastAPI], AnalyzeSightingService] | None = None,
) -> FastAPI:
```

Add lazy getters on `app.state`:

```python
def get_repository() -> PawDexRepository:
    if app.state.repository is None:
        app.state.repository = app.state.repository_factory()
    return app.state.repository


def get_embedder() -> ImageEmbedder:
    if app.state.embedder is None:
        app.state.embedder = app.state.embedder_factory()
    return app.state.embedder


def get_analyze_service() -> AnalyzeSightingService:
    if app.state.analyze_service is None:
        app.state.analyze_service = app.state.analyze_service_factory(app)
    return app.state.analyze_service
```

Add new routes:

```python
@app.get("/places/{place_id}/state")
async def place_state(place_id: str) -> dict[str, object]:
    return get_repository().get_place_state(place_id)


@app.post("/analyze-sighting")
async def analyze_sighting(
    place_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    image_bytes = await file.read()
    try:
        image = load_image(image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return get_analyze_service().analyze(image, place_id)
```

Keep the existing `/detect` route unchanged for compatibility.

- [ ] **Step 4: Add confirm endpoint**

Add this request model:

```python
class ConfirmSightingRequest(BaseModel):
    analysis_id: str = Field(alias="analysisId")
    place_id: str = Field(alias="placeId")
    decision: Literal["existing", "new"]
    animal_id: str | None = Field(default=None, alias="animalId")
    display_name: str | None = Field(default=None, alias="displayName")
    species: str | None = None
    photo_url: str = Field(alias="photoUrl")
    zone_label: str = Field(default="Area comum", alias="zoneLabel")
```

Add:

```python
@app.post("/confirm-sighting")
async def confirm_sighting(request: ConfirmSightingRequest) -> dict[str, object]:
    repository = get_repository()
    if request.decision == "existing":
        if request.animal_id is None:
            raise HTTPException(status_code=400, detail="animalId is required.")
        return repository.confirm_existing_animal(
            analysis_id=request.analysis_id,
            place_id=request.place_id,
            animal_id=request.animal_id,
            photo_url=request.photo_url,
            zone_label=request.zone_label,
        )

    if request.display_name is None or request.species is None:
        raise HTTPException(status_code=400, detail="displayName and species are required.")
    return repository.confirm_new_animal(
        analysis_id=request.analysis_id,
        place_id=request.place_id,
        display_name=request.display_name,
        species=request.species,
        photo_url=request.photo_url,
        zone_label=request.zone_label,
    )
```

- [ ] **Step 5: Run ML API tests**

Run:

```bash
cd ml-api
python -m pytest -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ml-api/app/main.py ml-api/tests/test_main.py
git commit -m "feat: expose pgvector matching api"
```

## Task 6: Next.js API Proxies

**Files:**
- Create: `src/domain/matching/types.ts`
- Create: `src/app/api/analyze-sighting/route.ts`
- Create: `src/app/api/analyze-sighting/route.test.ts`
- Create: `src/app/api/confirm-sighting/route.ts`
- Create: `src/app/api/confirm-sighting/route.test.ts`
- Create: `src/app/api/pawdex/state/route.ts`
- Create: `src/app/api/pawdex/state/route.test.ts`

- [ ] **Step 1: Add frontend matching types**

Create `src/domain/matching/types.ts`:

```ts
import type { DetectionBox, DetectionSpecies } from "@/domain/detection/types";
import type { PawDexState, Species } from "@/domain/pawdex/types";

export type MatchRecommendation =
  | "possible_existing"
  | "probably_new"
  | "no_pet_detected"
  | "needs_better_photo";

export type MatchCandidate = {
  animalId: string;
  displayName: string;
  species: Species;
  primaryPhotoUrl: string;
  score: number;
};

export type AnalyzeSightingResponse = {
  analysisId: string | null;
  detection: {
    species: DetectionSpecies;
    label: string;
    confidence: number;
    box: DetectionBox;
  } | null;
  embedding: {
    modelVersion: string;
    qualityScore: number;
  } | null;
  matches: MatchCandidate[];
  recommendation: MatchRecommendation;
  error?: string;
};

export type ConfirmSightingPayload =
  | {
      analysisId: string;
      placeId: string;
      decision: "existing";
      animalId: string;
      photoUrl: string;
      zoneLabel?: string;
    }
  | {
      analysisId: string;
      placeId: string;
      decision: "new";
      displayName: string;
      species: Species;
      photoUrl: string;
      zoneLabel?: string;
    };

export type ConfirmSightingResponse = {
  state: PawDexState;
  selectedAnimalId: string;
  error?: string;
};
```

- [ ] **Step 2: Write proxy tests**

Create `src/app/api/analyze-sighting/route.test.ts`:

```ts
/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/analyze-sighting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards uploaded image and place id to the ML API", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          analysisId: "analysis-1",
          detection: null,
          embedding: null,
          matches: [],
          recommendation: "probably_new",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("placeId", "place-office-centro");
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/analyze-sighting", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/analyze-sighting",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const outgoingForm = fetchMock.mock.calls[0][1].body as FormData;
    expect(outgoingForm.get("place_id")).toBe("place-office-centro");
  });
});
```

Create `src/app/api/confirm-sighting/route.test.ts`:

```ts
/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/confirm-sighting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards confirmation JSON to the ML API", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ state: { places: [], animals: [], sightings: [], albumSlots: [] }, selectedAnimalId: "animal-mingau" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = {
      analysisId: "analysis-1",
      placeId: "place-office-centro",
      decision: "existing",
      animalId: "animal-mingau",
      photoUrl: "data:image/png;base64,abc",
    };

    const response = await POST(
      new Request("http://localhost/api/confirm-sighting", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/confirm-sighting",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  });
});
```

Create `src/app/api/pawdex/state/route.test.ts`:

```ts
/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/pawdex/state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("loads place state from the ML API", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ places: [], animals: [], sightings: [], albumSlots: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/pawdex/state?placeId=place-office-centro"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/places/place-office-centro/state",
    );
  });
});
```

- [ ] **Step 3: Run proxy tests to verify failure**

Run:

```bash
npm run test -- src/app/api/analyze-sighting/route.test.ts src/app/api/confirm-sighting/route.test.ts src/app/api/pawdex/state/route.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 4: Add proxy routes**

Create the three route files with `DEFAULT_ML_API_URL = "http://127.0.0.1:8000"` and JSON error bodies containing an `error` string. `analyze-sighting` must validate both `file` and `placeId`, then forward `place_id` to Python:

```ts
const outgoingForm = new FormData();
outgoingForm.set("file", file, file.name);
outgoingForm.set("place_id", String(placeId));
```

`confirm-sighting` must forward the request JSON unchanged. `pawdex/state` must validate `placeId` and URL-encode it into the proxied path.

- [ ] **Step 5: Run proxy tests**

Run:

```bash
npm run test -- src/app/api/analyze-sighting/route.test.ts src/app/api/confirm-sighting/route.test.ts src/app/api/pawdex/state/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/matching/types.ts src/app/api/analyze-sighting src/app/api/confirm-sighting src/app/api/pawdex/state
git commit -m "feat: proxy pawdex matching api"
```

## Task 7: Frontend Matching Client and Composer UI

**Files:**
- Create: `src/domain/matching/client.ts`
- Modify: `src/components/SightingComposer.tsx`
- Modify: `src/components/SightingComposer.test.tsx`

- [ ] **Step 1: Add failing composer tests**

Modify `src/components/SightingComposer.test.tsx` to mock `analyzePetSighting` from `@/domain/matching/client` instead of `detectPetImage`. Add:

```ts
it("shows returned vector match candidates", async () => {
  const user = userEvent.setup();
  analyzePetSightingMock.mockResolvedValue({
    analysisId: "analysis-1",
    detection: {
      species: "cat",
      label: "cat",
      confidence: 0.91,
      box: { x1: 5, y1: 6, x2: 70, y2: 80 },
    },
    embedding: {
      modelVersion: "fake-model",
      qualityScore: 0.9,
    },
    matches: [
      {
        animalId: "animal-mingau",
        displayName: "Mingau",
        species: "cat",
        primaryPhotoUrl: "https://example.com/cat.jpg",
        score: 0.86,
      },
    ],
    recommendation: "possible_existing",
  });
  const onAddToExisting = vi.fn();

  render(
    <SightingComposer
      placeId="place-office-centro"
      onAddToExisting={onAddToExisting}
      onCreateNew={vi.fn()}
      onCancel={vi.fn()}
      onWarning={vi.fn()}
    />,
  );

  await user.upload(
    screen.getByLabelText(/enviar imagem/i),
    new File(["pet"], "pet.png", { type: "image/png" }),
  );

  expect(
    await screen.findByText("Parece ser Mingau, 86% de similaridade."),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /confirmar como mingau/i }));

  expect(onAddToExisting).toHaveBeenCalledWith(
    expect.objectContaining({
      analysisId: "analysis-1",
      animalId: "animal-mingau",
    }),
  );
});
```

- [ ] **Step 2: Run composer tests to verify failure**

Run:

```bash
npm run test -- src/components/SightingComposer.test.tsx
```

Expected: FAIL because the component still uses detection-only client and `suggestions`.

- [ ] **Step 3: Add matching client**

Create `src/domain/matching/client.ts`:

```ts
import type {
  AnalyzeSightingResponse,
  ConfirmSightingPayload,
  ConfirmSightingResponse,
} from "./types";

export async function analyzePetSighting(
  file: File,
  placeId: string,
): Promise<AnalyzeSightingResponse> {
  const formData = new FormData();
  formData.set("file", file, file.name);
  formData.set("placeId", placeId);

  const response = await fetch("/api/analyze-sighting", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as AnalyzeSightingResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Matching failed.");
  }

  return body;
}

export async function confirmPetSighting(
  payload: ConfirmSightingPayload,
): Promise<ConfirmSightingResponse> {
  const response = await fetch("/api/confirm-sighting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as ConfirmSightingResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Confirmation failed.");
  }

  return body;
}
```

- [ ] **Step 4: Update composer implementation**

Modify `SightingComposer`:

- Replace `suggestions` prop with `placeId`.
- Replace `detectPetImage(file)` with `analyzePetSighting(file, placeId)`.
- Store `analysisId`, `matches`, and `recommendation`.
- Render strong match text when `recommendation === "possible_existing"` and there is a first match.
- Render probably-new text when `recommendation === "probably_new"`.
- Pass `analysisId` to `onAddToExisting` and `onCreateNew`.

Use these payload types:

```ts
type ExistingSightingPayload = {
  analysisId: string;
  animalId: string;
  photoUrl: string;
  matchConfidence: number;
};

type NewAnimalPayload = {
  analysisId: string;
  displayName: string;
  species: Species;
  photoUrl: string;
};
```

- [ ] **Step 5: Run composer tests**

Run:

```bash
npm run test -- src/components/SightingComposer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/matching/client.ts src/components/SightingComposer.tsx src/components/SightingComposer.test.tsx
git commit -m "feat: show vector match suggestions"
```

## Task 8: Store Remote State and Confirmations

**Files:**
- Modify: `src/hooks/usePawDexStore.ts`
- Modify: `src/components/PawDexApp.tsx`
- Modify: `src/components/PawDexApp.test.tsx`

- [ ] **Step 1: Add failing app/store tests**

Modify `src/components/PawDexApp.test.tsx` to mock remote state loading:

```ts
vi.stubGlobal(
  "fetch",
  vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/pawdex/state")) {
      return Promise.resolve(
        new Response(JSON.stringify(demoState), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }),
);
```

Add this test:

```ts
it("loads PawDex state from the API before showing the album", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/pawdex/state")) {
        return Promise.resolve(
          new Response(JSON.stringify(demoState), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );

  render(<PawDexApp />);

  expect(await screen.findByText("Escritorio Centro")).toBeInTheDocument();
  expect(screen.getByText("Mingau")).toBeInTheDocument();
});
```

Add this confirmation test:

```ts
it("applies confirmed sighting state returned by the API", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/pawdex/state")) {
        return Promise.resolve(
          new Response(JSON.stringify(demoState), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (url.includes("/api/analyze-sighting")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              analysisId: "analysis-1",
              detection: {
                species: "cat",
                label: "cat",
                confidence: 0.9,
                box: { x1: 1, y1: 2, x2: 30, y2: 40 },
              },
              embedding: { modelVersion: "fake-model", qualityScore: 0.9 },
              matches: [
                {
                  animalId: "animal-mingau",
                  displayName: "Mingau",
                  species: "cat",
                  primaryPhotoUrl: demoState.animals[0].primaryPhotoUrl,
                  score: 0.86,
                },
              ],
              recommendation: "possible_existing",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      if (url.includes("/api/confirm-sighting")) {
        expect(init?.method).toBe("POST");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              state: {
                ...demoState,
                sightings: [
                  {
                    ...demoState.sightings[0],
                    id: "sighting-confirmed-api",
                    matchConfidence: 0.86,
                  },
                  ...demoState.sightings,
                ],
              },
              selectedAnimalId: "animal-mingau",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );

  render(<PawDexApp />);
  await screen.findByText("Escritorio Centro");
  await user.click(screen.getByRole("button", { name: /registrar avistamento/i }));
  await user.upload(
    screen.getByLabelText(/enviar imagem/i),
    new File(["pet"], "pet.png", { type: "image/png" }),
  );
  await user.click(await screen.findByRole("button", { name: /confirmar como mingau/i }));

  expect(await screen.findByText(/avistamento salvo/i)).toBeInTheDocument();
  expect(screen.getByText(/86%/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run app tests to verify failure**

Run:

```bash
npm run test -- src/components/PawDexApp.test.tsx
```

Expected: FAIL because `usePawDexStore` does not fetch remote state or call confirm API.

- [ ] **Step 3: Update store**

Modify `usePawDexStore`:

- On mount, fetch `/api/pawdex/state?placeId=place-office-centro`.
- If remote load succeeds, set that state and selected animal.
- If remote load fails, fall back to `loadPawDexState()` and show a warning.
- Make `addExistingSighting` and `createNewAnimal` async.
- Call `confirmPetSighting` and replace local state with `response.state`.
- Keep local optimistic state out of this step; the API response is the source of truth.

The existing exported input types become:

```ts
export type ExistingSightingInput = {
  analysisId: string;
  animalId: string;
  photoUrl: string;
  matchConfidence: number;
};

export type NewAnimalInput = {
  analysisId: string;
  displayName: string;
  species: Species;
  photoUrl: string;
};
```

- [ ] **Step 4: Update `PawDexApp` props wiring**

Pass `placeId={store.place.id}` to `SightingComposer`. Remove the old `suggestions` prop.

- [ ] **Step 5: Run app and component tests**

Run:

```bash
npm run test -- src/components/PawDexApp.test.tsx src/components/SightingComposer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePawDexStore.ts src/components/PawDexApp.tsx src/components/PawDexApp.test.tsx
git commit -m "feat: persist sighting confirmations"
```

## Task 9: End-to-End Verification and Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run all unit tests**

Run:

```bash
npm run test
cd ml-api
python -m pytest -q
```

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 3: Rebuild the Docker stack**

Run:

```bash
docker compose up --build -d
docker compose ps
```

Expected: `db`, `ml-api`, and `web` are running; `db` and `ml-api` are healthy.

- [ ] **Step 4: Verify health and state endpoints**

Run:

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:3000/api/pawdex/state?placeId=place-office-centro
```

Expected: health JSON includes `database: "connected"` and state JSON includes `animal-mingau`.

- [ ] **Step 5: Update README**

Add a concise section:

````md
## Local Docker Stack

Run the full PawDex stack:

```bash
docker compose up --build
```

Services:

- Web app: http://localhost:3000
- ML API: http://localhost:8000
- Postgres + pgvector: localhost:5432

The database initializes from `db/init`. To reset local database data:

```bash
docker compose down -v
docker compose up --build
```

Pet matching uses YOLO to crop cats/dogs, MobileNetV3 Small to generate a
576-dimensional vector, and pgvector cosine distance to search embeddings inside
the current place.
````

- [ ] **Step 6: Final status**

Run:

```bash
git status --short
```

Expected: only intentional README changes before the final docs commit, then clean after commit.

- [ ] **Step 7: Commit docs**

```bash
git add README.md
git commit -m "docs: document pgvector matching stack"
```

## Self-Review Checklist

- Spec coverage: the plan includes Dockerized Postgres + pgvector, schema, seed data, embeddings, vector search, analyze endpoint, confirm endpoint, frontend matching UI, remote state loading, and Docker verification.
- Scope boundary: auth, object storage, moderation, Flutter, GPU deployment, and model fine-tuning are not included.
- Type consistency: frontend uses `analysisId`, `placeId`, `animalId`, `displayName`, `primaryPhotoUrl`, and `matchConfidence`; Python receives aliases and returns frontend field names.
- Vector contract: both migration and embedder use `vector(576)` with `torchvision-mobilenet-v3-small-imagenet1k-v1`.
