from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol


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
        self,
        place_id: str,
        species: str,
        embedding: Any,
        limit: int = 3,
    ) -> list[MatchCandidate]: ...

    def create_pending_analysis(
        self,
        place_id: str,
        species: str,
        detector_confidence: float,
        detection_box: dict[str, float],
        model_version: str,
        embedding: Any,
        quality_score: float,
    ) -> str: ...

    def confirm_existing_animal(
        self,
        analysis_id: str,
        place_id: str,
        animal_id: str,
        photo_url: str,
        zone_label: str = "Area comum",
        match_confidence: float | None = None,
    ) -> dict[str, Any]: ...

    def confirm_new_animal(
        self,
        analysis_id: str,
        place_id: str,
        display_name: str,
        species: str,
        photo_url: str,
        zone_label: str = "Area comum",
    ) -> dict[str, Any]: ...


def similarity_from_distance(distance: float) -> float:
    return round(max(0.0, min(1.0, 1.0 - distance)), 4)


def iso(value: Any) -> str:
    if isinstance(value, datetime):
        timestamp = value
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
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


class PostgresPawDexRepository:
    def __init__(self, pool: Any):
        self.pool = pool

    def healthcheck(self) -> None:
        with self.pool.connection() as connection:
            connection.execute("SELECT 1").fetchone()

    def get_place_state(self, place_id: str) -> dict[str, Any]:
        with self.pool.connection() as connection:
            place = connection.execute(
                "SELECT * FROM places WHERE id = %s",
                (place_id,),
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

    def find_matches(
        self,
        place_id: str,
        species: str,
        embedding: Any,
        limit: int = 3,
    ) -> list[MatchCandidate]:
        sql = """
            SELECT
              ae.animal_id,
              a.display_name,
              a.species,
              a.primary_photo_url,
              MIN(ae.embedding <=> %s) AS distance
            FROM animal_embeddings ae
            JOIN animals a
              ON a.id = ae.animal_id
             AND a.place_id = ae.place_id
            WHERE ae.place_id = %s
              AND a.species = %s
            GROUP BY ae.animal_id, a.display_name, a.species, a.primary_photo_url
            ORDER BY distance ASC
            LIMIT %s
        """
        with self.pool.connection() as connection:
            rows = connection.execute(
                sql,
                (embedding, place_id, species, limit),
            ).fetchall()

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

    def create_pending_analysis(
        self,
        place_id: str,
        species: str,
        detector_confidence: float,
        detection_box: dict[str, float],
        model_version: str,
        embedding: Any,
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
                    _jsonb(detection_box),
                    model_version,
                    embedding,
                    quality_score,
                ),
            ).fetchone()

        if row is None:
            raise RuntimeError("Pending sighting analysis insert did not return an id.")
        return str(row["id"])

    def confirm_existing_animal(
        self,
        analysis_id: str,
        place_id: str,
        animal_id: str,
        photo_url: str,
        zone_label: str = "Area comum",
        match_confidence: float | None = None,
    ) -> dict[str, Any]:
        with self.pool.connection() as connection:
            pending = self._fetch_pending_analysis(connection, analysis_id, place_id)
            now = datetime.now(timezone.utc)
            sighting_id = _new_id("sighting")
            species = pending["species"]

            self._validate_existing_animal(connection, animal_id, place_id, species)
            self._insert_sighting(
                connection=connection,
                sighting_id=sighting_id,
                place_id=place_id,
                animal_id=animal_id,
                photo_url=photo_url,
                species=species,
                zone_label=zone_label,
                taken_at=now,
                detector_confidence=pending["detector_confidence"],
                match_confidence=match_confidence,
            )
            self._insert_animal_embedding(
                connection=connection,
                place_id=place_id,
                animal_id=animal_id,
                sighting_id=sighting_id,
                pending=pending,
            )
            connection.execute(
                """
                UPDATE animals
                SET last_seen_at = %s,
                    primary_photo_url = %s
                WHERE id = %s
                  AND place_id = %s
                  AND species = %s
                """,
                (now, photo_url, animal_id, place_id, species),
            )
            self._consume_pending_analysis(connection, analysis_id, place_id)

        return {
            "state": self.get_place_state(place_id),
            "selectedAnimalId": animal_id,
        }

    def confirm_new_animal(
        self,
        analysis_id: str,
        place_id: str,
        display_name: str,
        species: str,
        photo_url: str,
        zone_label: str = "Area comum",
    ) -> dict[str, Any]:
        with self.pool.connection() as connection:
            pending = self._fetch_pending_analysis(connection, analysis_id, place_id)
            if species != pending["species"]:
                raise ValueError("New animal species must match pending analysis species.")

            now = datetime.now(timezone.utc)
            animal_id = _new_id("animal")
            sighting_id = _new_id("sighting")

            connection.execute(
                """
                INSERT INTO animals (
                  id, place_id, species, display_name, status, description,
                  color_tags, rarity_label, primary_photo_url, first_seen_at,
                  last_seen_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    animal_id,
                    place_id,
                    species,
                    display_name,
                    "unknown",
                    "",
                    [],
                    "Ocasional",
                    photo_url,
                    now,
                    now,
                ),
            )
            self._insert_sighting(
                connection=connection,
                sighting_id=sighting_id,
                place_id=place_id,
                animal_id=animal_id,
                photo_url=photo_url,
                species=species,
                zone_label=zone_label,
                taken_at=now,
                detector_confidence=pending["detector_confidence"],
                match_confidence=None,
            )
            self._insert_animal_embedding(
                connection=connection,
                place_id=place_id,
                animal_id=animal_id,
                sighting_id=sighting_id,
                pending=pending,
            )
            self._consume_pending_analysis(connection, analysis_id, place_id)

        return {
            "state": self.get_place_state(place_id),
            "selectedAnimalId": animal_id,
        }

    def _fetch_pending_analysis(
        self,
        connection: Any,
        analysis_id: str,
        place_id: str,
    ) -> dict[str, Any]:
        row = connection.execute(
            """
            SELECT * FROM pending_sighting_analyses
            WHERE id = %s
              AND place_id = %s
            FOR UPDATE
            """,
            (analysis_id, place_id),
        ).fetchone()
        if row is None:
            raise ValueError("Pending sighting analysis not found.")
        return row

    def _validate_existing_animal(
        self,
        connection: Any,
        animal_id: str,
        place_id: str,
        species: str,
    ) -> None:
        row = connection.execute(
            """
            SELECT id FROM animals
            WHERE id = %s
              AND place_id = %s
              AND species = %s
            """,
            (animal_id, place_id, species),
        ).fetchone()
        if row is None:
            raise ValueError("Confirmed animal does not match pending analysis.")

    def _consume_pending_analysis(
        self,
        connection: Any,
        analysis_id: str,
        place_id: str,
    ) -> None:
        connection.execute(
            """
            DELETE FROM pending_sighting_analyses
            WHERE id = %s
              AND place_id = %s
            """,
            (analysis_id, place_id),
        )

    def _insert_sighting(
        self,
        *,
        connection: Any,
        sighting_id: str,
        place_id: str,
        animal_id: str,
        photo_url: str,
        species: str,
        zone_label: str,
        taken_at: datetime,
        detector_confidence: float,
        match_confidence: float | None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO sightings (
              id, place_id, animal_id, photo_url, species, zone_label, taken_at,
              detector_confidence, match_confidence, review_status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                sighting_id,
                place_id,
                animal_id,
                photo_url,
                species,
                zone_label,
                taken_at,
                detector_confidence,
                match_confidence,
                "confirmed",
            ),
        )

    def _insert_animal_embedding(
        self,
        *,
        connection: Any,
        place_id: str,
        animal_id: str,
        sighting_id: str,
        pending: dict[str, Any],
    ) -> None:
        connection.execute(
            """
            INSERT INTO animal_embeddings (
              place_id, animal_id, sighting_id, model_version, embedding,
              quality_score
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                place_id,
                animal_id,
                sighting_id,
                pending["model_version"],
                pending["embedding"],
                pending["quality_score"],
            ),
        )


def _new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6)}"


def _jsonb(value: dict[str, float]) -> Any:
    try:
        from psycopg.types.json import Jsonb
    except ImportError:
        return value
    return Jsonb(value)
