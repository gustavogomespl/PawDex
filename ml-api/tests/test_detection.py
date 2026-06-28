from io import BytesIO

import pytest
from PIL import Image

from app.detection import (
    BoundingBox,
    RawDetection,
    build_detection_response,
    load_image,
    normalize_yolo_label,
)


def test_normalizes_pet_labels():
    assert normalize_yolo_label("cat") == "cat"
    assert normalize_yolo_label("dog") == "dog"
    assert normalize_yolo_label("person") is None


def test_filters_non_pet_detections_and_selects_best_detection():
    response = build_detection_response(
        [
            RawDetection("person", 0.99, BoundingBox(0, 0, 10, 10)),
            RawDetection("dog", 0.68, BoundingBox(10, 20, 110, 220)),
            RawDetection("cat", 0.91, BoundingBox(30, 40, 130, 240)),
        ]
    )

    assert [d.species for d in response.detections] == ["dog", "cat"]
    assert response.best_detection is not None
    assert response.best_detection.species == "cat"
    assert response.best_detection.confidence == 0.91
    assert response.best_detection.box.x1 == 30


def test_returns_null_best_detection_when_no_pet_is_detected():
    response = build_detection_response(
        [RawDetection("chair", 0.88, BoundingBox(0, 0, 10, 10))]
    )

    assert response.detections == []
    assert response.best_detection is None


def test_load_image_decodes_a_valid_image():
    buffer = BytesIO()
    Image.new("RGB", (4, 4), "white").save(buffer, format="PNG")

    image = load_image(buffer.getvalue())

    assert image.mode == "RGB"
    assert image.size == (4, 4)


def test_load_image_rejects_decompression_bomb(monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 16)
    buffer = BytesIO()
    Image.new("RGB", (64, 64), "white").save(buffer, format="PNG")

    with pytest.raises(ValueError):
        load_image(buffer.getvalue())
