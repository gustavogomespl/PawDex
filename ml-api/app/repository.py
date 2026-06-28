from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol


# Abandoned analyses (user never confirmed) are purged opportunistically so the
# table cannot grow unbounded without an external scheduler.
PENDING_ANALYSIS_TTL = timedelta(hours=24)


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
        model_version: str,
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
        crop_key: str | None = None,
    ) -> str: ...

    def confirm_existing_animal(
        self,
        analysis_id: str,
        place_id: str,
        animal_id: str,
        photo_url: str,
        zone_label: str = "Area comum",
        match_confidence: float | None = None,
        created_by: str | None = None,
    ) -> dict[str, Any]: ...

    def confirm_new_animal(
        self,
        analysis_id: str,
        place_id: str,
        display_name: str,
        species: str,
        photo_url: str,
        zone_label: str = "Area comum",
        created_by: str | None = None,
    ) -> dict[str, Any]: ...

    def upsert_user(
        self,
        email: str,
        name: str | None = None,
    ) -> dict[str, Any]: ...

    def create_place(
        self,
        *,
        name: str,
        type: str,
        privacy_level: str,
        created_by: str,
        album_total_slots: int = 12,
        photo_url: str | None = None,
        geofence: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    def list_places_for_user(self, user_id: str) -> list[dict[str, Any]]: ...

    def get_place_privacy(self, place_id: str) -> str | None: ...

    def get_membership(
        self,
        place_id: str,
        user_id: str,
    ) -> dict[str, Any] | None: ...

    def get_place_by_invite_code(self, code: str) -> dict[str, Any] | None: ...

    def get_place_geofence(self, place_id: str) -> dict[str, Any] | None: ...

    def join_place(self, place_id: str, user_id: str, status: str) -> dict[str, Any]: ...

    def list_members(self, place_id: str) -> list[dict[str, Any]]: ...

    def set_member_status(
        self,
        place_id: str,
        user_id: str,
        status: str,
    ) -> None: ...

    def delete_content_by_user(self, user_id: str) -> dict[str, Any]: ...

    def record_audit(
        self,
        user_id: str | None,
        action: str,
        target_type: str | None = None,
        target_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None: ...


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
        "photoUrl": row.get("photo_url"),
        "inviteCode": row.get("invite_code"),
    }


def row_to_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "avatarUrl": row["avatar_url"],
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

    def upsert_user(self, email: str, name: str | None = None) -> dict[str, Any]:
        sql = """
            INSERT INTO users (email, name)
            VALUES (%s, %s)
            ON CONFLICT (email)
            DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name)
            RETURNING id, email, name, avatar_url
        """
        with self.pool.connection() as connection:
            row = connection.execute(sql, (email, name)).fetchone()
        if row is None:
            raise RuntimeError("User upsert did not return a row.")
        return row_to_user(row)

    def create_place(
        self,
        *,
        name: str,
        type: str,
        privacy_level: str,
        created_by: str,
        album_total_slots: int = 12,
        photo_url: str | None = None,
        geofence: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        place_id = _new_id("place")
        geo = geofence or {}
        with self.pool.connection() as connection:
            connection.execute(
                """
                INSERT INTO places (
                  id, name, type, privacy_level, album_total_slots,
                  photo_url, geofence_lat, geofence_lng, geofence_radius_m
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    place_id,
                    name,
                    type,
                    privacy_level,
                    album_total_slots,
                    photo_url,
                    geo.get("lat"),
                    geo.get("lng"),
                    geo.get("radiusM"),
                ),
            )
            connection.execute(
                """
                INSERT INTO place_members (place_id, user_id, role, status)
                VALUES (%s, %s, 'admin', 'approved')
                """,
                (place_id, created_by),
            )
            place = connection.execute(
                "SELECT * FROM places WHERE id = %s",
                (place_id,),
            ).fetchone()

        if place is None:
            raise RuntimeError("Place creation did not return a row.")
        return row_to_place(place)

    def list_places_for_user(self, user_id: str) -> list[dict[str, Any]]:
        sql = """
            SELECT p.*, pm.role
            FROM places p
            JOIN place_members pm
              ON pm.place_id = p.id
            WHERE pm.user_id = %s
              AND pm.status = 'approved'
            ORDER BY p.created_at ASC
        """
        with self.pool.connection() as connection:
            rows = connection.execute(sql, (user_id,)).fetchall()
        return [{**row_to_place(row), "role": row["role"]} for row in rows]

    def get_place_privacy(self, place_id: str) -> str | None:
        with self.pool.connection() as connection:
            row = connection.execute(
                "SELECT privacy_level FROM places WHERE id = %s",
                (place_id,),
            ).fetchone()
        return row["privacy_level"] if row else None

    def get_membership(
        self,
        place_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        with self.pool.connection() as connection:
            row = connection.execute(
                """
                SELECT role, status
                FROM place_members
                WHERE place_id = %s
                  AND user_id = %s
                """,
                (place_id, user_id),
            ).fetchone()
        return dict(row) if row else None

    def get_place_by_invite_code(self, code: str) -> dict[str, Any] | None:
        with self.pool.connection() as connection:
            row = connection.execute(
                "SELECT id, name FROM places WHERE invite_code = %s",
                (code,),
            ).fetchone()
        return {"id": row["id"], "name": row["name"]} if row else None

    def get_place_geofence(self, place_id: str) -> dict[str, Any] | None:
        with self.pool.connection() as connection:
            row = connection.execute(
                """
                SELECT geofence_lat, geofence_lng, geofence_radius_m
                FROM places
                WHERE id = %s
                """,
                (place_id,),
            ).fetchone()
        if (
            row is None
            or row["geofence_lat"] is None
            or row["geofence_lng"] is None
            or row["geofence_radius_m"] is None
        ):
            return None
        return {
            "lat": float(row["geofence_lat"]),
            "lng": float(row["geofence_lng"]),
            "radiusM": float(row["geofence_radius_m"]),
        }

    def join_place(self, place_id: str, user_id: str, status: str) -> dict[str, Any]:
        sql = """
            INSERT INTO place_members (place_id, user_id, role, status)
            VALUES (%s, %s, 'member', %s)
            ON CONFLICT (place_id, user_id)
            DO UPDATE SET status = CASE
                WHEN place_members.status = 'approved' THEN 'approved'
                ELSE EXCLUDED.status
            END
            RETURNING role, status
        """
        with self.pool.connection() as connection:
            row = connection.execute(sql, (place_id, user_id, status)).fetchone()
        if row is None:
            raise RuntimeError("Join did not return a membership.")
        return {"role": row["role"], "status": row["status"]}

    def list_members(self, place_id: str) -> list[dict[str, Any]]:
        sql = """
            SELECT pm.user_id, pm.role, pm.status, u.email, u.name
            FROM place_members pm
            JOIN users u ON u.id = pm.user_id
            WHERE pm.place_id = %s
            ORDER BY pm.created_at ASC
        """
        with self.pool.connection() as connection:
            rows = connection.execute(sql, (place_id,)).fetchall()
        return [
            {
                "userId": str(row["user_id"]),
                "role": row["role"],
                "status": row["status"],
                "email": row["email"],
                "name": row["name"],
            }
            for row in rows
        ]

    def set_member_status(
        self,
        place_id: str,
        user_id: str,
        status: str,
    ) -> None:
        with self.pool.connection() as connection:
            connection.execute(
                """
                UPDATE place_members
                SET status = %s
                WHERE place_id = %s
                  AND user_id = %s
                """,
                (status, place_id, user_id),
            )

    def delete_content_by_user(self, user_id: str) -> dict[str, Any]:
        with self.pool.connection() as connection:
            # Deleting authored animals cascades their sightings/embeddings;
            # then remove sightings the user authored on other people's animals.
            animals = connection.execute(
                "DELETE FROM animals WHERE created_by = %s",
                (user_id,),
            ).rowcount
            sightings = connection.execute(
                "DELETE FROM sightings WHERE created_by = %s",
                (user_id,),
            ).rowcount
        return {
            "animalsDeleted": int(animals or 0),
            "sightingsDeleted": int(sightings or 0),
        }

    def record_audit(
        self,
        user_id: str | None,
        action: str,
        target_type: str | None = None,
        target_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self.pool.connection() as connection:
            connection.execute(
                """
                INSERT INTO audit_log (
                  user_id, action, target_type, target_id, metadata
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    action,
                    target_type,
                    target_id,
                    _jsonb(metadata) if metadata is not None else None,
                ),
            )

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
        total_slots = max(int(place["album_total_slots"]), len(animal_ids))
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
        model_version: str,
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
              AND ae.model_version = %s
            GROUP BY ae.animal_id, a.display_name, a.species, a.primary_photo_url
            ORDER BY distance ASC
            LIMIT %s
        """
        with self.pool.connection() as connection:
            rows = connection.execute(
                sql,
                (embedding, place_id, species, model_version, limit),
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
        crop_key: str | None = None,
    ) -> str:
        sql = """
            INSERT INTO pending_sighting_analyses (
              place_id, species, detector_confidence, detection_box,
              model_version, embedding, quality_score, crop_key
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        with self.pool.connection() as connection:
            connection.execute(
                "DELETE FROM pending_sighting_analyses WHERE created_at < %s",
                (datetime.now(timezone.utc) - PENDING_ANALYSIS_TTL,),
            )
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
                    crop_key,
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
        created_by: str | None = None,
    ) -> dict[str, Any]:
        with self.pool.connection() as connection:
            pending = self._fetch_pending_analysis(connection, analysis_id, place_id)
            now = datetime.now(timezone.utc)
            sighting_id = _new_id("sighting")
            species = pending["species"]
            # Persist the stored crop (privacy-by-design), not the full photo.
            photo = pending.get("crop_key") or photo_url

            self._validate_existing_animal(connection, animal_id, place_id, species)
            self._insert_sighting(
                connection=connection,
                sighting_id=sighting_id,
                place_id=place_id,
                animal_id=animal_id,
                photo_url=photo,
                species=species,
                zone_label=zone_label,
                taken_at=now,
                detector_confidence=pending["detector_confidence"],
                match_confidence=match_confidence,
                created_by=created_by,
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
                (now, photo, animal_id, place_id, species),
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
        created_by: str | None = None,
    ) -> dict[str, Any]:
        with self.pool.connection() as connection:
            pending = self._fetch_pending_analysis(connection, analysis_id, place_id)
            if species != pending["species"]:
                raise ValueError("New animal species must match pending analysis species.")

            now = datetime.now(timezone.utc)
            animal_id = _new_id("animal")
            sighting_id = _new_id("sighting")
            photo = pending.get("crop_key") or photo_url

            connection.execute(
                """
                INSERT INTO animals (
                  id, place_id, species, display_name, status, description,
                  color_tags, rarity_label, primary_photo_url, first_seen_at,
                  last_seen_at, created_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                    photo,
                    now,
                    now,
                    created_by,
                ),
            )
            self._insert_sighting(
                connection=connection,
                sighting_id=sighting_id,
                place_id=place_id,
                animal_id=animal_id,
                photo_url=photo,
                species=species,
                zone_label=zone_label,
                taken_at=now,
                detector_confidence=pending["detector_confidence"],
                match_confidence=None,
                created_by=created_by,
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
        created_by: str | None = None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO sightings (
              id, place_id, animal_id, photo_url, species, zone_label, taken_at,
              detector_confidence, match_confidence, review_status, created_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                created_by,
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
