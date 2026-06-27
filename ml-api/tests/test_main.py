from io import BytesIO

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


def make_png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (12, 8), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_returns_model_metadata():
    app = create_app(lambda: FakeDetector(DetectionResponse([], None)))
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["model"] == "configured"


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
