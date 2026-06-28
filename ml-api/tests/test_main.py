import inspect
from io import BytesIO
from typing import Optional

from fastapi.testclient import TestClient
from PIL import Image

from app.detection import DetectionResponse
from app.main import create_app, is_place_access_allowed, is_within_geofence
from app.security import hash_password, verify_password


class FakeDetector:
    def __init__(self, response: DetectionResponse):
        self.response = response
        self.calls = 0

    def detect(self, image):
        self.calls += 1
        assert image.mode == "RGB"
        return self.response


class FakeRepository:
    def __init__(self):
        self.healthcheck_calls = 0
        self.confirm_existing_calls = []
        self.confirm_new_calls = []
        self.upsert_calls = []
        self.set_password_calls = []
        self.user_with_password = None
        self.create_place_calls = []
        self.list_places_calls = []
        self.confirm_error: ValueError | None = None
        # Authorization defaults: public place + approved member, so flows are
        # allowed unless a test overrides them to exercise 403s.
        self.place_privacy = "public"
        self.membership = {"role": "admin", "status": "approved"}
        # C5 join-flow defaults
        self.invite_place = {"id": "place-1", "name": "Escritorio"}
        self.geofence = None
        self.members = [
            {
                "userId": "user-2",
                "role": "member",
                "status": "pending",
                "email": "novo@x.com",
                "name": None,
            }
        ]
        self.join_calls = []
        self.member_status_calls = []
        self.delete_content_calls = []
        self.delete_photo_keys: list[str] = []
        self.delete_animal_calls = []
        self.delete_animal_keys: list[str] = []
        self.media_place_id = "place-1"
        self.media_key_calls: list[str] = []
        self.audit_calls = []
        self.name_suggestion_calls = []
        self.promote_name_calls = []
        self.name_suggestions = [
            {"name": "Mingau", "votes": 3},
            {"name": "Tigrinho", "votes": 1},
        ]
        self.report_calls = []
        self.resolve_report_calls = []
        self.reports = [
            {
                "id": "report-1",
                "targetType": "animal",
                "targetId": "animal-1",
                "reason": "duplicate",
                "note": None,
                "status": "open",
                "createdAt": "2026-06-27T10:00:00Z",
                "reporterName": "Ana",
            }
        ]

    def healthcheck(self) -> None:
        self.healthcheck_calls += 1

    def get_place_privacy(self, place_id: str):
        return self.place_privacy

    def get_membership(self, place_id: str, user_id: str):
        return self.membership

    def get_place_by_invite_code(self, code: str):
        return self.invite_place

    def get_place_geofence(self, place_id: str):
        return self.geofence

    def join_place(self, place_id: str, user_id: str, status: str):
        self.join_calls.append((place_id, user_id, status))
        return {"role": "member", "status": status}

    def list_members(self, place_id: str):
        return self.members

    def set_member_status(self, place_id: str, user_id: str, status: str):
        self.member_status_calls.append((place_id, user_id, status))

    def delete_content_by_user(self, user_id: str):
        self.delete_content_calls.append(user_id)
        return {
            "animalsDeleted": 2,
            "sightingsDeleted": 3,
            "photoKeys": list(self.delete_photo_keys),
        }

    def record_audit(self, user_id, action, target_type=None, target_id=None, metadata=None):
        self.audit_calls.append((user_id, action, metadata))

    def delete_animal(self, place_id: str, animal_id: str):
        self.delete_animal_calls.append((place_id, animal_id))
        return list(self.delete_animal_keys)

    def get_media_place_id(self, key: str):
        self.media_key_calls.append(key)
        return self.media_place_id

    def suggest_name(self, place_id, animal_id, user_id, name):
        self.name_suggestion_calls.append((place_id, animal_id, user_id, name))

    def list_name_suggestions(self, place_id, animal_id):
        return self.name_suggestions

    def promote_name(self, place_id, animal_id, name):
        self.promote_name_calls.append((place_id, animal_id, name))

    def create_report(self, place_id, target_type, target_id, reporter_id, reason, note):
        self.report_calls.append(
            (place_id, target_type, target_id, reporter_id, reason, note)
        )

    def list_reports(self, place_id, status="open"):
        return self.reports

    def resolve_report(self, place_id, report_id, resolver_id, status):
        self.resolve_report_calls.append((place_id, report_id, resolver_id, status))

    def upsert_user(self, email: str, name: Optional[str] = None) -> dict[str, object]:
        self.upsert_calls.append({"email": email, "name": name})
        return {"id": "user-1", "email": email, "name": name, "avatarUrl": None}

    def set_user_password(
        self,
        email: str,
        name: Optional[str],
        password_hash: str,
    ) -> dict[str, object]:
        self.set_password_calls.append(
            {"email": email, "name": name, "password_hash": password_hash}
        )
        return {"id": "user-1", "email": email, "name": name, "avatarUrl": None}

    def get_user_with_password(self, email: str):
        if self.user_with_password is None:
            return None
        if self.user_with_password["email"] != email:
            return None
        return self.user_with_password

    def create_place(self, **kwargs) -> dict[str, object]:
        self.create_place_calls.append(kwargs)
        return {
            "id": "place-new",
            "name": kwargs["name"],
            "type": kwargs["type"],
            "privacyLevel": kwargs["privacy_level"],
            "albumTotalSlots": kwargs.get("album_total_slots", 12),
            "photoUrl": kwargs.get("photo_url"),
        }

    def list_places_for_user(self, user_id: str) -> list[dict[str, object]]:
        self.list_places_calls.append(user_id)
        return [
            {
                "id": "place-1",
                "name": "Escritorio Centro",
                "type": "office",
                "privacyLevel": "invite-only",
                "albumTotalSlots": 12,
                "photoUrl": None,
                "role": "admin",
            }
        ]

    def get_place_state(self, place_id: str) -> dict[str, object]:
        return {
            "places": [{"id": place_id, "name": "Main Park"}],
            "animals": [],
            "sightings": [],
            "albumSlots": [],
        }

    def confirm_existing_animal(
        self,
        analysis_id: str,
        place_id: str,
        animal_id: str,
        photo_url: str,
        zone_label: str = "Area comum",
        match_confidence: Optional[float] = None,
        created_by: Optional[str] = None,
    ) -> dict[str, object]:
        if self.confirm_error is not None:
            raise self.confirm_error
        call = {
            "analysis_id": analysis_id,
            "place_id": place_id,
            "animal_id": animal_id,
            "photo_url": photo_url,
            "zone_label": zone_label,
            "match_confidence": match_confidence,
            "created_by": created_by,
        }
        self.confirm_existing_calls.append(call)
        return {"confirmed": True, "animalId": animal_id}

    def confirm_new_animal(
        self,
        analysis_id: str,
        place_id: str,
        display_name: str,
        species: str,
        photo_url: str,
        zone_label: str = "Area comum",
        created_by: Optional[str] = None,
    ) -> dict[str, object]:
        if self.confirm_error is not None:
            raise self.confirm_error
        call = {
            "analysis_id": analysis_id,
            "place_id": place_id,
            "display_name": display_name,
            "species": species,
            "photo_url": photo_url,
            "zone_label": zone_label,
            "created_by": created_by,
        }
        self.confirm_new_calls.append(call)
        return {"confirmed": True, "animalId": "animal-new"}


class FakeAnalyzeService:
    def __init__(self):
        self.calls = []

    def analyze(
        self,
        image,
        place_id: str,
        created_by: Optional[str] = None,
    ) -> dict[str, object]:
        assert image.mode == "RGB"
        self.calls.append(
            {"size": image.size, "place_id": place_id, "created_by": created_by}
        )
        return {
            "analysisId": "analysis-1",
            "detection": None,
            "embedding": {"modelVersion": "fake-model", "qualityScore": 0.9},
            "matches": [],
            "recommendation": "probably_new",
        }


def make_png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (12, 8), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_checks_database_and_returns_model_metadata():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "model": "configured",
        "database": "connected",
    }
    assert repository.healthcheck_calls == 1


def test_place_state_returns_repository_state():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.get("/places/place-1/state")

    assert response.status_code == 200
    assert response.json() == {
        "places": [{"id": "place-1", "name": "Main Park"}],
        "animals": [],
        "sightings": [],
        "albumSlots": [],
    }


def test_analyze_sighting_forwards_image_and_place_to_service():
    service = FakeAnalyzeService()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        analyze_service_factory=lambda _app: service,
    )
    client = TestClient(app)

    response = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1", "user_id": "user-1"},
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "analysisId": "analysis-1",
        "detection": None,
        "embedding": {"modelVersion": "fake-model", "qualityScore": 0.9},
        "matches": [],
        "recommendation": "probably_new",
    }
    assert service.calls == [
        {"size": (12, 8), "place_id": "place-1", "created_by": "user-1"}
    ]


def test_analyze_sighting_rejects_invalid_image():
    service = FakeAnalyzeService()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        analyze_service_factory=lambda _app: service,
    )
    client = TestClient(app)

    response = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1", "user_id": "user-1"},
        files={"file": ("not-image.txt", b"nope", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported or invalid image file."
    assert service.calls == []


def test_confirm_sighting_existing_animal_returns_repository_result():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "userId": "user-1",
            "decision": "existing",
            "animalId": "animal-1",
            "matchConfidence": 0.86,
            "photoUrl": "https://example.test/pet.png",
            "zoneLabel": "Jardim",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"confirmed": True, "animalId": "animal-1"}
    assert repository.confirm_existing_calls == [
        {
            "analysis_id": "analysis-1",
            "place_id": "place-1",
            "animal_id": "animal-1",
            "photo_url": "https://example.test/pet.png",
            "zone_label": "Jardim",
            "match_confidence": 0.86,
            "created_by": "user-1",
        }
    ]


def test_confirm_sighting_new_animal_returns_repository_result():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "userId": "user-1",
            "decision": "new",
            "displayName": "Mimi",
            "species": "cat",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"confirmed": True, "animalId": "animal-new"}
    assert repository.confirm_new_calls == [
        {
            "analysis_id": "analysis-1",
            "place_id": "place-1",
            "display_name": "Mimi",
            "species": "cat",
            "photo_url": "https://example.test/pet.png",
            "zone_label": "Area comum",
            "created_by": "user-1",
        }
    ]


def test_confirm_sighting_existing_requires_animal_id():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "userId": "user-1",
            "decision": "existing",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "animalId is required."
    assert repository.confirm_existing_calls == []


def test_confirm_sighting_new_requires_display_name_and_species():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "userId": "user-1",
            "decision": "new",
            "displayName": "Mimi",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "displayName and species are required."
    assert repository.confirm_new_calls == []


def test_confirm_sighting_repository_value_error_returns_bad_request():
    repository = FakeRepository()
    repository.confirm_error = ValueError("Analysis is stale.")
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "userId": "user-1",
            "decision": "existing",
            "animalId": "animal-1",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Analysis is stale."


def test_users_sync_upserts_and_returns_user():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/users/sync",
        json={"email": "tutor@example.com", "name": "Tutor"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-1",
        "email": "tutor@example.com",
        "name": "Tutor",
        "avatarUrl": None,
    }
    assert repository.upsert_calls == [{"email": "tutor@example.com", "name": "Tutor"}]


def test_users_sync_requires_email():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post("/users/sync", json={"name": "No Email"})

    assert response.status_code == 422
    assert repository.upsert_calls == []


def test_users_register_hashes_password_and_returns_user():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/users/register",
        json={
            "email": "tutor@example.com",
            "name": "Tutor",
            "password": "senha-segura",
        },
    )

    assert response.status_code == 200
    assert response.json()["email"] == "tutor@example.com"
    assert len(repository.set_password_calls) == 1
    call = repository.set_password_calls[0]
    assert call["email"] == "tutor@example.com"
    assert call["name"] == "Tutor"
    assert call["password_hash"] != "senha-segura"
    assert verify_password("senha-segura", call["password_hash"]) is True


def test_users_login_returns_user_for_matching_password():
    repository = FakeRepository()
    repository.user_with_password = {
        "id": "user-1",
        "email": "tutor@example.com",
        "name": "Tutor",
        "avatarUrl": None,
        "passwordHash": hash_password("senha-segura"),
    }
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/users/login",
        json={"email": "tutor@example.com", "password": "senha-segura"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "user-1",
        "email": "tutor@example.com",
        "name": "Tutor",
        "avatarUrl": None,
    }


def test_users_login_rejects_wrong_password():
    repository = FakeRepository()
    repository.user_with_password = {
        "id": "user-1",
        "email": "tutor@example.com",
        "name": "Tutor",
        "avatarUrl": None,
        "passwordHash": hash_password("senha-segura"),
    }
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/users/login",
        json={"email": "tutor@example.com", "password": "senha-errada"},
    )

    assert response.status_code == 401


def test_create_place_endpoint_creates_and_returns_place():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/places",
        json={
            "name": "Escritorio Vila",
            "type": "office",
            "privacyLevel": "invite-only",
            "createdBy": "user-1",
            "photoUrl": "https://example.com/p.jpg",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Escritorio Vila"
    assert body["privacyLevel"] == "invite-only"
    assert repository.create_place_calls[0]["created_by"] == "user-1"
    assert repository.create_place_calls[0]["name"] == "Escritorio Vila"


def test_create_place_endpoint_rejects_invalid_privacy_level():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/places",
        json={
            "name": "X",
            "type": "office",
            "privacyLevel": "bogus",
            "createdBy": "user-1",
        },
    )

    assert response.status_code == 422
    assert repository.create_place_calls == []


def test_list_user_places_endpoint_returns_member_places():
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.get("/users/user-1/places")

    assert response.status_code == 200
    assert response.json()["places"][0]["role"] == "admin"
    assert repository.list_places_calls == ["user-1"]


def test_is_place_access_allowed_rules():
    # read: public allowed for anyone; private needs approved membership
    assert is_place_access_allowed("public", None, require_write=False) is True
    assert is_place_access_allowed("invite-only", None, require_write=False) is False
    assert is_place_access_allowed("invite-only", "pending", require_write=False) is False
    assert is_place_access_allowed("invite-only", "approved", require_write=False) is True
    # write: always needs approved membership, even for public places
    assert is_place_access_allowed("public", None, require_write=True) is False
    assert is_place_access_allowed("public", "approved", require_write=True) is True
    assert is_place_access_allowed("invite-only", "pending", require_write=True) is False


def test_place_state_forbids_non_member_of_private_place():
    repository = FakeRepository()
    repository.place_privacy = "invite-only"
    repository.membership = None
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.get("/places/place-1/state?user_id=intruder")

    assert response.status_code == 403


def test_place_state_returns_404_for_unknown_place():
    repository = FakeRepository()
    repository.place_privacy = None
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.get("/places/ghost/state?user_id=user-1")

    assert response.status_code == 404


def test_confirm_sighting_forbids_non_member():
    repository = FakeRepository()
    repository.place_privacy = "invite-only"
    repository.membership = None
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "userId": "intruder",
            "decision": "existing",
            "animalId": "animal-1",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 403
    assert repository.confirm_existing_calls == []


def test_internal_token_required_when_configured(monkeypatch):
    monkeypatch.setenv("PAWDEX_INTERNAL_TOKEN", "s3cret")
    repository = FakeRepository()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )
    client = TestClient(app)

    blocked = client.get("/places/place-1/state?user_id=user-1")
    assert blocked.status_code == 401

    allowed = client.get(
        "/places/place-1/state?user_id=user-1",
        headers={"X-Internal-Token": "s3cret"},
    )
    assert allowed.status_code == 200


def test_is_within_geofence():
    geofence = {"lat": 0.0, "lng": 0.0, "radiusM": 1000.0}
    assert is_within_geofence(geofence, 0.0005, 0.0005) is True
    assert is_within_geofence(geofence, 1.0, 1.0) is False


def _app_with(repository):
    return create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
    )


def test_resolve_invite_returns_place():
    repository = FakeRepository()
    repository.invite_place = {"id": "place-1", "name": "Escritorio"}
    client = TestClient(_app_with(repository))

    response = client.get("/invites/abc123")

    assert response.status_code == 200
    assert response.json() == {"placeId": "place-1", "name": "Escritorio"}


def test_resolve_invite_404_for_unknown_code():
    repository = FakeRepository()
    repository.invite_place = None
    client = TestClient(_app_with(repository))

    assert client.get("/invites/nope").status_code == 404


def test_join_via_invite_code_approves_member():
    repository = FakeRepository()
    repository.invite_place = {"id": "place-1", "name": "Escritorio"}
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/join",
        json={"userId": "user-2", "method": "invite", "code": "abc123"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert repository.join_calls == [("place-1", "user-2", "approved")]


def test_join_via_invite_code_rejects_wrong_code():
    repository = FakeRepository()
    repository.invite_place = {"id": "other-place", "name": "X"}
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/join",
        json={"userId": "user-2", "method": "invite", "code": "wrong"},
    )

    assert response.status_code == 403
    assert repository.join_calls == []


def test_join_request_is_pending():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/join",
        json={"userId": "user-2", "method": "request"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert repository.join_calls == [("place-1", "user-2", "pending")]


def test_join_via_gps_within_radius_approves():
    repository = FakeRepository()
    repository.geofence = {"lat": 0.0, "lng": 0.0, "radiusM": 1000.0}
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/join",
        json={"userId": "user-2", "method": "gps", "lat": 0.0005, "lng": 0.0005},
    )

    assert response.status_code == 200
    assert repository.join_calls == [("place-1", "user-2", "approved")]


def test_join_via_gps_outside_radius_forbidden():
    repository = FakeRepository()
    repository.geofence = {"lat": 0.0, "lng": 0.0, "radiusM": 1000.0}
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/join",
        json={"userId": "user-2", "method": "gps", "lat": 1.0, "lng": 1.0},
    )

    assert response.status_code == 403
    assert repository.join_calls == []


def test_list_members_requires_admin():
    repository = FakeRepository()
    repository.membership = {"role": "member", "status": "approved"}
    client = TestClient(_app_with(repository))

    assert client.get("/places/place-1/members?user_id=user-2").status_code == 403


def test_list_members_returns_members_for_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.get("/places/place-1/members?user_id=admin")

    assert response.status_code == 200
    assert response.json()["members"][0]["status"] == "pending"


def test_update_member_status_approves_as_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/members/user-2",
        json={"userId": "admin", "status": "approved"},
    )

    assert response.status_code == 200
    assert repository.member_status_calls == [("place-1", "user-2", "approved")]


def test_delete_user_content_removes_and_audits():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.delete("/users/user-1/content")

    assert response.status_code == 200
    assert response.json() == {"animalsDeleted": 2, "sightingsDeleted": 3}
    assert repository.delete_content_calls == ["user-1"]
    assert repository.audit_calls[0][0] == "user-1"
    assert repository.audit_calls[0][1] == "remove_own_content"


def test_delete_user_content_purges_stored_crops_only():
    from app.storage import InMemoryObjectStorage

    storage = InMemoryObjectStorage()
    storage.put("crops/keep-me-not.jpg", b"x", "image/jpeg")
    repository = FakeRepository()
    repository.delete_photo_keys = [
        "crops/keep-me-not.jpg",
        "https://seed.example/remote.jpg",  # not a storage key -> left alone
    ]
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
        storage_factory=lambda: storage,
    )
    client = TestClient(app)

    response = client.delete("/users/user-1/content")

    assert response.status_code == 200
    assert response.json() == {"animalsDeleted": 2, "sightingsDeleted": 3}
    # crop object purged; remote URL untouched (no KeyError to assert, just absent)
    import pytest

    with pytest.raises(KeyError):
        storage.get("crops/keep-me-not.jpg")


def test_media_endpoint_streams_stored_object():
    from app.storage import InMemoryObjectStorage

    storage = InMemoryObjectStorage()
    storage.put("crops/x.jpg", b"\xff\xd8jpegbytes", "image/jpeg")
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        storage_factory=lambda: storage,
    )
    client = TestClient(app)

    response = client.get("/media/crops/x.jpg")

    assert response.status_code == 200
    assert app.state.repository.media_key_calls == ["crops/x.jpg"]
    assert response.content == b"\xff\xd8jpegbytes"
    assert response.headers["content-type"] == "image/jpeg"


def test_media_endpoint_forbids_private_place_for_non_member():
    from app.storage import InMemoryObjectStorage

    storage = InMemoryObjectStorage()
    storage.put("crops/private.jpg", b"x", "image/jpeg")
    repository = FakeRepository()
    repository.place_privacy = "invite-only"
    repository.membership = None
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
        storage_factory=lambda: storage,
    )
    client = TestClient(app)

    response = client.get("/media/crops/private.jpg?user_id=intruder")

    assert response.status_code == 403


def test_media_endpoint_404_when_key_is_not_linked_to_content():
    from app.storage import InMemoryObjectStorage

    storage = InMemoryObjectStorage()
    storage.put("crops/orphan.jpg", b"x", "image/jpeg")
    repository = FakeRepository()
    repository.media_place_id = None
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
        storage_factory=lambda: storage,
    )
    client = TestClient(app)

    response = client.get("/media/crops/orphan.jpg?user_id=user-1")

    assert response.status_code == 404


def test_media_endpoint_404_for_missing_object():
    from app.storage import InMemoryObjectStorage

    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        storage_factory=lambda: InMemoryObjectStorage(),
    )
    client = TestClient(app)

    assert client.get("/media/crops/missing.jpg").status_code == 404


def test_export_place_returns_state_for_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.get("/places/place-1/export?user_id=admin")

    assert response.status_code == 200
    assert "animals" in response.json()


def test_export_place_forbidden_for_non_admin():
    repository = FakeRepository()
    repository.membership = {"role": "member", "status": "approved"}
    client = TestClient(_app_with(repository))

    assert client.get("/places/place-1/export?user_id=member").status_code == 403


def test_admin_delete_animal_purges_crops_and_audits():
    from app.storage import InMemoryObjectStorage

    storage = InMemoryObjectStorage()
    storage.put("crops/gone.jpg", b"x", "image/jpeg")
    repository = FakeRepository()
    repository.delete_animal_keys = ["crops/gone.jpg", "https://seed/a.jpg"]
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: repository,
        storage_factory=lambda: storage,
    )
    client = TestClient(app)

    response = client.delete("/places/place-1/animals/animal-9?user_id=admin")

    assert response.status_code == 200
    assert repository.delete_animal_calls == [("place-1", "animal-9")]
    import pytest

    with pytest.raises(KeyError):
        storage.get("crops/gone.jpg")
    assert repository.audit_calls[-1][1] == "admin_delete_animal"


def test_admin_delete_animal_forbidden_for_non_admin():
    repository = FakeRepository()
    repository.membership = None
    client = TestClient(_app_with(repository))

    assert (
        client.delete("/places/place-1/animals/animal-9?user_id=intruder").status_code
        == 403
    )
    assert repository.delete_animal_calls == []


def test_suggest_name_records_vote_for_member():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/animals/animal-1/names",
        json={"userId": "user-1", "name": "  Mingau  "},
    )

    assert response.status_code == 200
    assert repository.name_suggestion_calls == [
        ("place-1", "animal-1", "user-1", "Mingau")
    ]


def test_suggest_name_forbidden_for_non_member():
    repository = FakeRepository()
    repository.place_privacy = "invite-only"
    repository.membership = None
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/animals/animal-1/names",
        json={"userId": "intruder", "name": "Hack"},
    )

    assert response.status_code == 403
    assert repository.name_suggestion_calls == []


def test_list_names_returns_ranked_votes_and_promote_flag_for_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.get("/places/place-1/animals/animal-1/names?user_id=admin")

    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"][0] == {"name": "Mingau", "votes": 3}
    assert body["canPromote"] is True


def test_list_names_promote_flag_false_for_member():
    repository = FakeRepository()
    repository.membership = {"role": "member", "status": "approved"}
    client = TestClient(_app_with(repository))

    response = client.get("/places/place-1/animals/animal-1/names?user_id=member")

    assert response.status_code == 200
    assert response.json()["canPromote"] is False


def test_promote_name_sets_official_name_as_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/animals/animal-1/names/promote",
        json={"userId": "admin", "name": "Mingau"},
    )

    assert response.status_code == 200
    assert repository.promote_name_calls == [("place-1", "animal-1", "Mingau")]


def test_promote_name_forbidden_for_non_admin():
    repository = FakeRepository()
    repository.membership = {"role": "member", "status": "approved"}
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/animals/animal-1/names/promote",
        json={"userId": "member", "name": "Mingau"},
    )

    assert response.status_code == 403
    assert repository.promote_name_calls == []


def test_create_report_records_flag_for_member():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/reports",
        json={
            "userId": "user-1",
            "targetType": "animal",
            "targetId": "animal-9",
            "reason": "duplicate",
            "note": "  mesmo gato do slot 3  ",
        },
    )

    assert response.status_code == 200
    assert repository.report_calls == [
        ("place-1", "animal", "animal-9", "user-1", "duplicate", "mesmo gato do slot 3")
    ]


def test_create_report_rejects_unknown_reason():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/reports",
        json={
            "userId": "user-1",
            "targetType": "animal",
            "targetId": "animal-9",
            "reason": "because",
        },
    )

    assert response.status_code == 422
    assert repository.report_calls == []


def test_create_report_forbidden_for_non_member():
    repository = FakeRepository()
    repository.place_privacy = "invite-only"
    repository.membership = None
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/reports",
        json={
            "userId": "intruder",
            "targetType": "animal",
            "targetId": "animal-9",
            "reason": "inappropriate",
        },
    )

    assert response.status_code == 403
    assert repository.report_calls == []


def test_list_reports_returns_queue_for_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.get("/places/place-1/reports?user_id=admin")

    assert response.status_code == 200
    assert response.json()["reports"][0]["reason"] == "duplicate"


def test_list_reports_forbidden_for_member():
    repository = FakeRepository()
    repository.membership = {"role": "member", "status": "approved"}
    client = TestClient(_app_with(repository))

    assert client.get("/places/place-1/reports?user_id=member").status_code == 403


def test_resolve_report_as_admin():
    repository = FakeRepository()
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/reports/report-1",
        json={"userId": "admin", "status": "dismissed"},
    )

    assert response.status_code == 200
    assert repository.resolve_report_calls == [
        ("place-1", "report-1", "admin", "dismissed")
    ]


def test_resolve_report_forbidden_for_member():
    repository = FakeRepository()
    repository.membership = {"role": "member", "status": "approved"}
    client = TestClient(_app_with(repository))

    response = client.post(
        "/places/place-1/reports/report-1",
        json={"userId": "member", "status": "resolved"},
    )

    assert response.status_code == 403
    assert repository.resolve_report_calls == []


def test_analyze_sighting_is_rate_limited(monkeypatch):
    monkeypatch.setenv("PAWDEX_RATE_LIMIT_PER_MIN", "1")
    service = FakeAnalyzeService()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        analyze_service_factory=lambda _app: service,
    )
    client = TestClient(app)

    first = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1", "user_id": "user-1"},
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )
    second = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1", "user_id": "user-1"},
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_blocking_endpoints_run_in_threadpool_not_event_loop():
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        analyze_service_factory=lambda _app: FakeAnalyzeService(),
    )
    endpoints = {
        route.path: route.endpoint
        for route in app.routes
        if hasattr(route, "endpoint")
    }

    for path in (
        "/health",
        "/places/{place_id}/state",
        "/analyze-sighting",
        "/confirm-sighting",
    ):
        assert not inspect.iscoroutinefunction(endpoints[path]), (
            f"{path} must be a sync handler so Starlette offloads it to the "
            "threadpool instead of blocking the event loop"
        )


def test_cors_allows_origin_configured_via_env(monkeypatch):
    monkeypatch.setenv("PAWDEX_ALLOWED_ORIGINS", "https://pawdex.example")
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
    )
    client = TestClient(app)

    response = client.options(
        "/health",
        headers={
            "Origin": "https://pawdex.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers.get("access-control-allow-origin") == "https://pawdex.example"


def test_cors_rejects_unconfigured_origin(monkeypatch):
    monkeypatch.setenv("PAWDEX_ALLOWED_ORIGINS", "https://pawdex.example")
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
    )
    client = TestClient(app)

    response = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert "access-control-allow-origin" not in response.headers


def test_analyze_sighting_rejects_oversized_upload(monkeypatch):
    monkeypatch.setattr("app.main.MAX_UPLOAD_BYTES", 4)
    service = FakeAnalyzeService()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=lambda: FakeRepository(),
        analyze_service_factory=lambda _app: service,
    )
    client = TestClient(app)

    response = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1", "user_id": "user-1"},
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 413
    assert service.calls == []
