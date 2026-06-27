from io import BytesIO
from typing import Optional

from fastapi.testclient import TestClient
from PIL import Image

from app.detection import BoundingBox, DetectionResponse, PetDetection
from app.main import create_app


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
        self.confirm_error: ValueError | None = None

    def healthcheck(self) -> None:
        self.healthcheck_calls += 1

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
        }
        self.confirm_new_calls.append(call)
        return {"confirmed": True, "animalId": "animal-new"}


class FakeAnalyzeService:
    def __init__(self):
        self.calls = []

    def analyze(self, image, place_id: str) -> dict[str, object]:
        assert image.mode == "RGB"
        self.calls.append({"size": image.size, "place_id": place_id})
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


def test_detect_returns_pet_detections():
    detector = FakeDetector(
        DetectionResponse(
            detections=[
                PetDetection(
                    species="cat",
                    label="cat",
                    confidence=0.87,
                    box=BoundingBox(1, 2, 10, 11),
                )
            ],
            best_detection=PetDetection(
                species="cat",
                label="cat",
                confidence=0.87,
                box=BoundingBox(1, 2, 10, 11),
            ),
        )
    )
    app = create_app(lambda: detector)
    client = TestClient(app)

    response = client.post(
        "/detect",
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert detector.calls == 1
    assert response.json() == {
        "detections": [
            {
                "species": "cat",
                "label": "cat",
                "confidence": 0.87,
                "box": {"x1": 1, "y1": 2, "x2": 10, "y2": 11},
            }
        ],
        "bestDetection": {
            "species": "cat",
            "label": "cat",
            "confidence": 0.87,
            "box": {"x1": 1, "y1": 2, "x2": 10, "y2": 11},
        },
    }


def test_detect_rejects_invalid_image():
    app = create_app(lambda: FakeDetector(DetectionResponse([], None)))
    client = TestClient(app)

    response = client.post(
        "/detect",
        files={"file": ("not-image.txt", b"nope", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported or invalid image file."


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
        analyze_service_factory=lambda _app: service,
    )
    client = TestClient(app)

    response = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1"},
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
    assert service.calls == [{"size": (12, 8), "place_id": "place-1"}]


def test_analyze_sighting_rejects_invalid_image():
    service = FakeAnalyzeService()
    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        analyze_service_factory=lambda _app: service,
    )
    client = TestClient(app)

    response = client.post(
        "/analyze-sighting",
        data={"place_id": "place-1"},
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
        }
    ]


def test_confirm_sighting_existing_requires_animal_id():
    repository_factory_calls = 0

    def repository_factory():
        nonlocal repository_factory_calls
        repository_factory_calls += 1
        return FakeRepository()

    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=repository_factory,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "decision": "existing",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "animalId is required."
    assert repository_factory_calls == 0


def test_confirm_sighting_new_requires_display_name_and_species():
    repository_factory_calls = 0

    def repository_factory():
        nonlocal repository_factory_calls
        repository_factory_calls += 1
        return FakeRepository()

    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=repository_factory,
    )
    client = TestClient(app)

    response = client.post(
        "/confirm-sighting",
        json={
            "analysisId": "analysis-1",
            "placeId": "place-1",
            "decision": "new",
            "displayName": "Mimi",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "displayName and species are required."
    assert repository_factory_calls == 0


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
            "decision": "existing",
            "animalId": "animal-1",
            "photoUrl": "https://example.test/pet.png",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Analysis is stale."


def test_detect_does_not_construct_matching_dependencies():
    counters = {"repository": 0, "embedder": 0, "analyze_service": 0}

    def repository_factory():
        counters["repository"] += 1
        return FakeRepository()

    def embedder_factory():
        counters["embedder"] += 1
        raise AssertionError("embedder should not be constructed")

    def analyze_service_factory(_app):
        counters["analyze_service"] += 1
        raise AssertionError("analyze service should not be constructed")

    app = create_app(
        detector_factory=lambda: FakeDetector(DetectionResponse([], None)),
        repository_factory=repository_factory,
        embedder_factory=embedder_factory,
        analyze_service_factory=analyze_service_factory,
    )
    client = TestClient(app)

    response = client.post(
        "/detect",
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert counters == {"repository": 0, "embedder": 0, "analyze_service": 0}
