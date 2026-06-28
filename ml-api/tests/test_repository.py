from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import pytest

from app.repository import (
    PostgresPawDexRepository,
    row_to_animal,
    similarity_from_distance,
)


@dataclass
class RecordedQuery:
    sql: str
    params: tuple[Any, ...] | None


class FakeCursor:
    def __init__(
        self,
        row: dict[str, Any] | None = None,
        rows: list[dict[str, Any]] | None = None,
    ):
        self.row = row
        self.rows = rows or []

    def fetchone(self) -> dict[str, Any] | None:
        return self.row

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


class RecordingConnection:
    def __init__(
        self,
        *,
        pending_analysis: dict[str, Any] | None = None,
        pending_insert_id: str = "analysis-created",
        place: dict[str, Any] | None = None,
        animals: list[dict[str, Any]] | None = None,
        sightings: list[dict[str, Any]] | None = None,
        match_rows: list[dict[str, Any]] | None = None,
        user_row: dict[str, Any] | None = None,
        member_place_rows: list[dict[str, Any]] | None = None,
    ):
        self.pending_analysis = pending_analysis
        self.pending_insert_id = pending_insert_id
        self.place = place
        self.animals = animals or []
        self.sightings = sightings or []
        self.match_rows = match_rows or []
        self.user_row = user_row
        self.member_place_rows = member_place_rows or []
        self.queries: list[RecordedQuery] = []

    def __enter__(self) -> RecordingConnection:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> FakeCursor:
        self.queries.append(RecordedQuery(sql=sql, params=params))
        normalized = " ".join(sql.lower().split())

        if normalized.startswith("select 1"):
            return FakeCursor(row={"?column?": 1})
        if "insert into pending_sighting_analyses" in normalized:
            return FakeCursor(row={"id": self.pending_insert_id})
        if normalized.startswith("select * from pending_sighting_analyses"):
            return FakeCursor(row=self.pending_analysis)
        if normalized.startswith("select id from animals"):
            animal_id, place_id, species = params or (None, None, None)
            animal = next(
                (
                    row
                    for row in self.animals
                    if row["id"] == animal_id
                    and row["place_id"] == place_id
                    and row["species"] == species
                ),
                None,
            )
            return FakeCursor(row=animal)
        if normalized.startswith("delete from pending_sighting_analyses"):
            self.pending_analysis = None
            return FakeCursor()
        if normalized.startswith("insert into users"):
            return FakeCursor(row=self.user_row)
        if "join place_members" in normalized:
            return FakeCursor(rows=self.member_place_rows)
        if "from animal_embeddings" in normalized and "join animals" in normalized:
            return FakeCursor(rows=self.match_rows)
        if normalized.startswith("select * from places"):
            return FakeCursor(row=self.place)
        if normalized.startswith("select * from animals"):
            return FakeCursor(rows=self.animals)
        if normalized.startswith("select * from sightings"):
            return FakeCursor(rows=self.sightings)

        return FakeCursor()


class RecordingPool:
    def __init__(self, connection: RecordingConnection):
        self.connection_obj = connection

    def connection(self) -> RecordingConnection:
        return self.connection_obj


def test_similarity_from_distance_is_clamped():
    assert similarity_from_distance(-0.25) == 1.0
    assert similarity_from_distance(0.12345) == 0.8765
    assert similarity_from_distance(1.75) == 0.0


def test_configure_connection_registers_vector_and_commits(monkeypatch):
    import importlib
    import sys
    import types

    calls: list[tuple[str, object]] = []

    def fake_register_vector(connection: object) -> None:
        calls.append(("register_vector", connection))

    class FakeConnectionType:
        def __class_getitem__(cls, item: object) -> type[FakeConnectionType]:
            return cls

    class FakeConnectionPool:
        pass

    pgvector_module = types.ModuleType("pgvector")
    pgvector_psycopg_module = types.ModuleType("pgvector.psycopg")
    pgvector_psycopg_module.register_vector = fake_register_vector
    psycopg_module = types.ModuleType("psycopg")
    psycopg_module.Connection = FakeConnectionType
    psycopg_rows_module = types.ModuleType("psycopg.rows")
    psycopg_rows_module.dict_row = object()
    psycopg_pool_module = types.ModuleType("psycopg_pool")
    psycopg_pool_module.ConnectionPool = FakeConnectionPool

    monkeypatch.setitem(sys.modules, "pgvector", pgvector_module)
    monkeypatch.setitem(sys.modules, "pgvector.psycopg", pgvector_psycopg_module)
    monkeypatch.setitem(sys.modules, "psycopg", psycopg_module)
    monkeypatch.setitem(sys.modules, "psycopg.rows", psycopg_rows_module)
    monkeypatch.setitem(sys.modules, "psycopg_pool", psycopg_pool_module)

    original_database_module = sys.modules.pop("app.database", None)
    try:
        database = importlib.import_module("app.database")

        class FakeConnection:
            def __init__(self) -> None:
                self.commits = 0

            def commit(self) -> None:
                self.commits += 1

        connection = FakeConnection()

        database.configure_connection(connection)

        assert calls == [("register_vector", connection)]
        assert connection.commits == 1
    finally:
        sys.modules.pop("app.database", None)
        if original_database_module is not None:
            sys.modules["app.database"] = original_database_module


def test_row_to_animal_uses_frontend_field_names():
    row = animal_row(
        id="animal-mingau",
        place_id="place-office",
        first_seen_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        last_seen_at=datetime(2026, 6, 2, 15, 30, tzinfo=timezone.utc),
    )

    animal = row_to_animal(row)

    assert animal == {
        "id": "animal-mingau",
        "placeId": "place-office",
        "species": "cat",
        "displayName": "Mingau",
        "status": "community",
        "description": "Gato claro.",
        "colorTags": ["branco", "creme"],
        "rarityLabel": "Comum",
        "primaryPhotoUrl": "https://example.com/mingau.jpg",
        "firstSeenAt": "2026-06-01T12:00:00Z",
        "lastSeenAt": "2026-06-02T15:30:00Z",
    }
    assert "place_id" not in animal
    assert "display_name" not in animal
    assert "primary_photo_url" not in animal


def test_find_matches_restricts_vector_search_to_place_and_species():
    embedding = [0.1, 0.2, 0.3]
    connection = RecordingConnection(
        match_rows=[
            {
                "animal_id": "animal-mingau",
                "display_name": "Mingau",
                "species": "cat",
                "primary_photo_url": "https://example.com/mingau.jpg",
                "distance": 0.2,
            }
        ]
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    matches = repository.find_matches(
        place_id="place-office",
        species="cat",
        embedding=embedding,
        model_version="mobilenet-v3",
        limit=2,
    )

    query = only_query_containing(connection, "from animal_embeddings")
    assert "ae.embedding <=> %s" in query.sql
    assert "ae.place_id = %s" in query.sql
    assert "a.species = %s" in query.sql
    assert "ae.model_version = %s" in query.sql
    assert query.params == (embedding, "place-office", "cat", "mobilenet-v3", 2)
    assert matches[0].animal_id == "animal-mingau"
    assert matches[0].score == 0.8


def test_upsert_user_inserts_or_updates_by_email_and_maps_result():
    connection = RecordingConnection(
        user_row={
            "id": "11111111-1111-1111-1111-111111111111",
            "email": "tutor@example.com",
            "name": "Tutor",
            "avatar_url": None,
        }
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    user = repository.upsert_user(email="tutor@example.com", name="Tutor")

    insert = only_query_containing(connection, "insert into users")
    assert "on conflict (email)" in insert.sql.lower()
    assert "returning" in insert.sql.lower()
    assert insert.params == ("tutor@example.com", "Tutor")
    assert user == {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "tutor@example.com",
        "name": "Tutor",
        "avatarUrl": None,
    }


def test_create_place_inserts_place_and_admin_membership():
    connection = RecordingConnection(place=place_row())
    repository = PostgresPawDexRepository(RecordingPool(connection))

    repository.create_place(
        name="Escritorio Vila",
        type="office",
        privacy_level="invite-only",
        created_by="11111111-1111-1111-1111-111111111111",
        album_total_slots=10,
        photo_url="https://example.com/place.jpg",
    )

    place_insert = only_query_containing(connection, "insert into places")
    member_insert = only_query_containing(connection, "insert into place_members")
    place_id = place_insert.params[0]
    assert place_id.startswith("place-")
    assert "Escritorio Vila" in place_insert.params
    assert "invite-only" in place_insert.params
    assert "'admin'" in member_insert.sql.lower()
    assert "'approved'" in member_insert.sql.lower()
    assert member_insert.params == (place_id, "11111111-1111-1111-1111-111111111111")


def test_list_places_for_user_returns_approved_member_places_with_role():
    connection = RecordingConnection(
        member_place_rows=[{**place_row(), "role": "admin"}]
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    places = repository.list_places_for_user("user-1")

    query = only_query_containing(connection, "join place_members")
    assert "pm.user_id = %s" in query.sql
    assert "status = 'approved'" in query.sql.lower()
    assert query.params == ("user-1",)
    assert places[0]["id"] == "place-office"
    assert places[0]["role"] == "admin"
    assert places[0]["privacyLevel"] == "invite-only"


def test_get_place_state_returns_frontend_state_and_album_slots():
    connection = RecordingConnection(
        place=place_row(album_total_slots=3),
        animals=[animal_row(id="animal-mingau")],
        sightings=[sighting_row(id="sighting-mingau-001")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    state = repository.get_place_state("place-office")

    assert state["places"][0]["privacyLevel"] == "invite-only"
    assert state["animals"][0]["displayName"] == "Mingau"
    assert state["sightings"][0]["photoUrl"] == "https://example.com/sighting.jpg"
    assert state["albumSlots"] == [
        {
            "slotNumber": 1,
            "placeId": "place-office",
            "animalId": "animal-mingau",
            "isDiscovered": True,
        },
        {
            "slotNumber": 2,
            "placeId": "place-office",
            "animalId": None,
            "isDiscovered": False,
        },
        {
            "slotNumber": 3,
            "placeId": "place-office",
            "animalId": None,
            "isDiscovered": False,
        },
    ]


def test_get_place_state_expands_album_slots_when_animals_exceed_configured_total():
    animals = [
        animal_row(id=f"animal-{index:02d}", display_name=f"Animal {index}")
        for index in range(1, 14)
    ]
    connection = RecordingConnection(
        place=place_row(album_total_slots=12),
        animals=animals,
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    state = repository.get_place_state("place-office")

    assert len(state["albumSlots"]) == 13
    assert state["albumSlots"][-1] == {
        "slotNumber": 13,
        "placeId": "place-office",
        "animalId": "animal-13",
        "isDiscovered": True,
    }


def test_create_pending_analysis_inserts_parameterized_row_and_returns_id():
    embedding = [0.1, 0.2, 0.3]
    connection = RecordingConnection(pending_insert_id="analysis-123")
    repository = PostgresPawDexRepository(RecordingPool(connection))

    analysis_id = repository.create_pending_analysis(
        place_id="place-office",
        species="cat",
        detector_confidence=0.91,
        detection_box={"x1": 1, "y1": 2, "x2": 10, "y2": 12},
        model_version="mobilenet-v3",
        embedding=embedding,
        quality_score=0.82,
    )

    insert = only_query_containing(connection, "insert into pending_sighting_analyses")
    values = insert_values_by_column(insert)
    assert analysis_id == "analysis-123"
    assert values["place_id"] == "place-office"
    assert values["species"] == "cat"
    assert values["embedding"] is embedding
    assert "%s" in insert.sql


def test_create_pending_analysis_purges_stale_rows_before_insert():
    connection = RecordingConnection(pending_insert_id="analysis-123")
    repository = PostgresPawDexRepository(RecordingPool(connection))

    repository.create_pending_analysis(
        place_id="place-office",
        species="cat",
        detector_confidence=0.91,
        detection_box={"x1": 1, "y1": 2, "x2": 10, "y2": 12},
        model_version="mobilenet-v3",
        embedding=[0.1, 0.2, 0.3],
        quality_score=0.82,
    )

    purge = only_query_containing(connection, "delete from pending_sighting_analyses")
    assert "created_at < %s" in purge.sql
    assert purge.params is not None and len(purge.params) == 1


def test_confirm_existing_animal_inserts_embedding_for_confirmed_sighting_animal():
    embedding = [0.4, 0.5, 0.6]
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat", embedding=embedding),
        place=place_row(),
        animals=[animal_row(id="animal-mingau")],
        sightings=[sighting_row(animal_id="animal-mingau")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    result = repository.confirm_existing_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        animal_id="animal-mingau",
        photo_url="https://example.com/new-sighting.jpg",
        zone_label="Recepcao",
        match_confidence=0.86,
    )

    sighting = insert_values_by_column(only_query_containing(connection, "insert into sightings"))
    animal_embedding = insert_values_by_column(
        only_query_containing(connection, "insert into animal_embeddings")
    )
    assert re.fullmatch(r"sighting-[0-9a-f]{12}", sighting["id"])
    assert sighting["animal_id"] == "animal-mingau"
    assert sighting["species"] == "cat"
    assert sighting["match_confidence"] == 0.86
    assert animal_embedding["animal_id"] == sighting["animal_id"]
    assert animal_embedding["sighting_id"] == sighting["id"]
    assert animal_embedding["embedding"] is embedding
    assert result["selectedAnimalId"] == "animal-mingau"


def test_confirm_existing_animal_persists_crop_key_not_full_photo():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat", crop_key="crops/x.jpg"),
        place=place_row(),
        animals=[animal_row(id="animal-mingau")],
        sightings=[sighting_row(animal_id="animal-mingau")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    repository.confirm_existing_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        animal_id="animal-mingau",
        photo_url="data:image/png;base64,FULLPHOTO",
        zone_label="Recepcao",
    )

    sighting = insert_values_by_column(
        only_query_containing(connection, "insert into sightings")
    )
    assert sighting["photo_url"] == "crops/x.jpg"
    update = only_query_containing(connection, "update animals")
    assert update.params is not None and update.params[1] == "crops/x.jpg"


def test_confirm_existing_animal_records_match_suggestion():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat"),
        place=place_row(),
        animals=[animal_row(id="animal-mingau")],
        sightings=[sighting_row(animal_id="animal-mingau")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    repository.confirm_existing_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        animal_id="animal-mingau",
        photo_url="https://example.com/p.jpg",
        zone_label="Recepcao",
        match_confidence=0.86,
    )

    insert = only_query_containing(connection, "insert into match_suggestions")
    assert insert.params is not None
    assert insert.params[0] == "place-office"
    assert insert.params[2] == "animal-mingau"
    assert insert.params[3] == "cat"
    assert insert.params[4] == 0.86
    assert "'confirmed'" in insert.sql.lower()


def test_confirm_existing_animal_updates_last_seen_and_primary_photo_url():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat"),
        place=place_row(),
        animals=[animal_row(id="animal-mingau")],
        sightings=[sighting_row(animal_id="animal-mingau")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    repository.confirm_existing_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        animal_id="animal-mingau",
        photo_url="https://example.com/fresh-photo.jpg",
        zone_label="Recepcao",
    )

    update = only_query_containing(connection, "update animals")
    assert "last_seen_at = %s" in update.sql
    assert "primary_photo_url = %s" in update.sql
    assert update.params is not None
    assert update.params[1] == "https://example.com/fresh-photo.jpg"


def test_confirm_existing_animal_consumes_pending_analysis_once():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat"),
        place=place_row(),
        animals=[animal_row(id="animal-mingau")],
        sightings=[sighting_row(animal_id="animal-mingau")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    repository.confirm_existing_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        animal_id="animal-mingau",
        photo_url="https://example.com/first-confirmation.jpg",
        zone_label="Recepcao",
    )

    pending_fetch = only_query_containing(
        connection,
        "select * from pending_sighting_analyses",
    )
    assert "FOR UPDATE" in pending_fetch.sql
    assert only_query_containing(connection, "delete from pending_sighting_analyses")
    first_sighting_insert_count = len(queries_containing(connection, "insert into sightings"))
    with pytest.raises(ValueError, match="Pending sighting analysis not found."):
        repository.confirm_existing_animal(
            analysis_id="analysis-1",
            place_id="place-office",
            animal_id="animal-mingau",
            photo_url="https://example.com/second-confirmation.jpg",
            zone_label="Recepcao",
        )

    assert (
        len(queries_containing(connection, "insert into sightings"))
        == first_sighting_insert_count
    )


def test_confirm_existing_animal_rejects_place_or_species_mismatch_before_writes():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat"),
        place=place_row(),
        animals=[animal_row(id="animal-mingau", species="dog")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    with pytest.raises(
        ValueError,
        match="Confirmed animal does not match pending analysis.",
    ):
        repository.confirm_existing_animal(
            analysis_id="analysis-1",
            place_id="place-office",
            animal_id="animal-mingau",
            photo_url="https://example.com/new-sighting.jpg",
            zone_label="Recepcao",
        )

    validation = only_query_containing(connection, "select id from animals")
    assert validation.params == ("animal-mingau", "place-office", "cat")
    assert queries_containing(connection, "insert into sightings") == []
    assert queries_containing(connection, "insert into animal_embeddings") == []
    assert queries_containing(connection, "delete from pending_sighting_analyses") == []


def test_confirm_new_animal_creates_animal_and_embedding_for_same_animal():
    embedding = [0.7, 0.8, 0.9]
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat", embedding=embedding),
        place=place_row(),
        animals=[animal_row(id="animal-created", display_name="Nina")],
        sightings=[sighting_row(animal_id="animal-created")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    result = repository.confirm_new_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        display_name="Nina",
        species="cat",
        photo_url="https://example.com/nina.jpg",
        zone_label="Jardim",
    )

    animal = insert_values_by_column(only_query_containing(connection, "insert into animals"))
    sighting = insert_values_by_column(only_query_containing(connection, "insert into sightings"))
    animal_embedding = insert_values_by_column(
        only_query_containing(connection, "insert into animal_embeddings")
    )
    assert re.fullmatch(r"animal-[0-9a-f]{12}", animal["id"])
    assert animal["display_name"] == "Nina"
    assert animal["species"] == "cat"
    assert animal["status"] == "unknown"
    assert animal["color_tags"] == []
    assert sighting["animal_id"] == animal["id"]
    assert sighting["species"] == animal["species"]
    assert animal_embedding["animal_id"] == animal["id"]
    assert animal_embedding["sighting_id"] == sighting["id"]
    assert animal_embedding["embedding"] is embedding
    assert result["selectedAnimalId"] == animal["id"]


def test_confirm_new_animal_rejects_species_mismatch_with_pending_analysis():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat"),
        place=place_row(),
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    with pytest.raises(
        ValueError,
        match="New animal species must match pending analysis species.",
    ):
        repository.confirm_new_animal(
            analysis_id="analysis-1",
            place_id="place-office",
            display_name="Rex",
            species="dog",
            photo_url="https://example.com/rex.jpg",
            zone_label="Jardim",
        )

    assert queries_containing(connection, "insert into animals") == []
    assert queries_containing(connection, "insert into sightings") == []
    assert queries_containing(connection, "insert into animal_embeddings") == []


def test_confirm_existing_animal_raises_when_pending_analysis_is_missing():
    connection = RecordingConnection(pending_analysis=None)
    repository = PostgresPawDexRepository(RecordingPool(connection))

    with pytest.raises(ValueError, match="Pending sighting analysis not found."):
        repository.confirm_existing_animal(
            analysis_id="missing-analysis",
            place_id="place-office",
            animal_id="animal-mingau",
            photo_url="https://example.com/new-sighting.jpg",
            zone_label="Recepcao",
        )

    assert queries_containing(connection, "insert into sightings") == []
    assert queries_containing(connection, "insert into animal_embeddings") == []


def test_postgres_repository_smoke_creates_pending_and_confirms_new_animal():
    numpy = pytest.importorskip("numpy", reason="Postgres smoke requires numpy.")
    psycopg = pytest.importorskip("psycopg", reason="Postgres smoke requires psycopg.")
    pytest.importorskip(
        "psycopg_pool",
        reason="Postgres smoke requires psycopg_pool.",
    )
    pytest.importorskip("pgvector", reason="Postgres smoke requires pgvector.")

    from app.database import create_pool

    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://pawdex:pawdex@127.0.0.1:5432/pawdex",
    )
    try:
        with psycopg.connect(database_url, connect_timeout=2) as raw_connection:
            raw_connection.execute("SELECT 1").fetchone()
    except psycopg.OperationalError as exc:
        pytest.skip(f"Postgres smoke unavailable: raw connection failed: {exc}")

    analysis_id: str | None = None
    selected_animal_id: str | None = None
    place_id = "place-office-centro"
    display_name = f"Smoke {uuid.uuid4().hex[:8]}"
    photo_url = f"https://example.com/{uuid.uuid4().hex}.jpg"
    pool = create_pool(database_url)
    pool_ready = False

    try:
        pool.wait(timeout=5)
        pool_ready = True
        repository = PostgresPawDexRepository(pool)
        repository.healthcheck()
        analysis_id = repository.create_pending_analysis(
            place_id=place_id,
            species="cat",
            detector_confidence=0.91,
            detection_box={"x1": 1, "y1": 2, "x2": 10, "y2": 12},
            model_version="repository-smoke",
            embedding=numpy.zeros(576, dtype=numpy.float32),
            quality_score=0.82,
        )
        result = repository.confirm_new_animal(
            analysis_id=analysis_id,
            place_id=place_id,
            display_name=display_name,
            species="cat",
            photo_url=photo_url,
            zone_label="Smoke test",
        )

        selected_animal_id = result["selectedAnimalId"]
        selected = next(
            animal
            for animal in result["state"]["animals"]
            if animal["id"] == selected_animal_id
        )
        assert selected_animal_id.startswith("animal-")
        assert selected["displayName"] == display_name
        assert selected["species"] == "cat"
        assert selected["primaryPhotoUrl"] == photo_url
    finally:
        if pool_ready:
            with pool.connection() as connection:
                connection.execute(
                    """
                    DELETE FROM animals
                    WHERE place_id = %s
                      AND (
                        id = %s
                        OR (display_name = %s AND primary_photo_url = %s)
                      )
                    """,
                    (place_id, selected_animal_id, display_name, photo_url),
                )
                if analysis_id is not None:
                    connection.execute(
                        "DELETE FROM pending_sighting_analyses "
                        "WHERE id = %s AND place_id = %s",
                        (analysis_id, place_id),
                    )
        pool.close()


def test_confirm_new_animal_allows_species_matching_pending_analysis():
    connection = RecordingConnection(
        pending_analysis=pending_analysis_row(species="cat"),
        place=place_row(),
        animals=[animal_row(id="animal-created", display_name="Nina")],
        sightings=[sighting_row(animal_id="animal-created")],
    )
    repository = PostgresPawDexRepository(RecordingPool(connection))

    result = repository.confirm_new_animal(
        analysis_id="analysis-1",
        place_id="place-office",
        display_name="Nina",
        species="cat",
        photo_url="https://example.com/nina.jpg",
        zone_label="Jardim",
    )

    assert result["selectedAnimalId"].startswith("animal-")


def only_query_containing(
    connection: RecordingConnection,
    text: str,
) -> RecordedQuery:
    matches = queries_containing(connection, text)
    assert len(matches) == 1
    return matches[0]


def queries_containing(
    connection: RecordingConnection,
    text: str,
) -> list[RecordedQuery]:
    return [query for query in connection.queries if text.lower() in query.sql.lower()]


def insert_values_by_column(query: RecordedQuery) -> dict[str, Any]:
    assert query.params is not None
    columns = insert_columns(query)
    assert len(columns) == len(query.params)
    return dict(zip(columns, query.params))


def insert_columns(query: RecordedQuery) -> list[str]:
    match = re.search(
        r"insert\s+into\s+\w+\s*\((.*?)\)\s*values",
        query.sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert match is not None
    return [column.strip() for column in match.group(1).split(",")]


def pending_analysis_row(
    *,
    species: str = "cat",
    embedding: list[float] | None = None,
    crop_key: str | None = None,
) -> dict[str, Any]:
    return {
        "id": "analysis-1",
        "place_id": "place-office",
        "species": species,
        "detector_confidence": 0.91,
        "detection_box": {"x1": 1, "y1": 2, "x2": 10, "y2": 12},
        "model_version": "mobilenet-v3",
        "embedding": embedding or [0.1, 0.2, 0.3],
        "quality_score": 0.82,
        "crop_key": crop_key,
        "created_at": datetime(2026, 6, 3, 9, 0, tzinfo=timezone.utc),
    }


def place_row(*, album_total_slots: int = 12) -> dict[str, Any]:
    return {
        "id": "place-office",
        "name": "Escritorio Centro",
        "type": "office",
        "privacy_level": "invite-only",
        "album_total_slots": album_total_slots,
        "created_at": datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc),
    }


def animal_row(
    *,
    id: str,
    place_id: str = "place-office",
    species: str = "cat",
    display_name: str = "Mingau",
    first_seen_at: datetime | None = None,
    last_seen_at: datetime | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "place_id": place_id,
        "species": species,
        "display_name": display_name,
        "status": "community",
        "description": "Gato claro.",
        "color_tags": ["branco", "creme"],
        "rarity_label": "Comum",
        "primary_photo_url": "https://example.com/mingau.jpg",
        "first_seen_at": first_seen_at
        or datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        "last_seen_at": last_seen_at
        or datetime(2026, 6, 2, 15, 30, tzinfo=timezone.utc),
        "created_at": datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    }


def sighting_row(
    *,
    id: str = "sighting-mingau-001",
    place_id: str = "place-office",
    animal_id: str = "animal-mingau",
    species: str = "cat",
) -> dict[str, Any]:
    return {
        "id": id,
        "place_id": place_id,
        "animal_id": animal_id,
        "photo_url": "https://example.com/sighting.jpg",
        "species": species,
        "zone_label": "Recepcao",
        "taken_at": datetime(2026, 6, 2, 15, 30, tzinfo=timezone.utc),
        "detector_confidence": 0.91,
        "match_confidence": 0.8,
        "review_status": "confirmed",
        "created_at": datetime(2026, 6, 2, 15, 30, tzinfo=timezone.utc),
    }
