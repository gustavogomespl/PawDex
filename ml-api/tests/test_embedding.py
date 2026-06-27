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
