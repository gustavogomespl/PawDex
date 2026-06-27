import math
import sys
from contextlib import nullcontext

import numpy as np
import pytest
from PIL import Image

from app.detection import BoundingBox
from app.embedding import (
    EMBEDDING_DIMENSION,
    EmbeddingResult,
    MODEL_VERSION,
    TorchvisionMobileNetEmbedder,
    crop_to_box,
    estimate_quality_score,
    normalize_vector,
)


def test_crop_to_box_clamps_coordinates_to_image_bounds():
    image = Image.new("RGB", (100, 80), "white")
    crop = crop_to_box(image, BoundingBox(-10, 5, 120, 60))

    assert crop.size == (100, 55)


def test_crop_to_box_returns_one_pixel_for_degenerate_box():
    image = Image.new("RGB", (100, 80), "white")
    crop = crop_to_box(image, BoundingBox(10, 10, 10, 10))

    assert crop.size == (1, 1)


def test_crop_to_box_returns_one_pixel_for_box_outside_image_bounds():
    image = Image.new("RGB", (100, 80), "white")
    crop = crop_to_box(image, BoundingBox(110, 90, 120, 100))

    assert crop.size == (1, 1)


def test_crop_to_box_rejects_non_finite_coordinates():
    image = Image.new("RGB", (100, 80), "white")

    with pytest.raises(ValueError, match="coordinates must be finite"):
        crop_to_box(image, BoundingBox(0, 0, np.nan, 20))


def test_quality_score_penalizes_tiny_crops():
    small = Image.new("RGB", (40, 40), "white")
    large = Image.new("RGB", (300, 240), "white")

    assert estimate_quality_score(small) < estimate_quality_score(large)
    assert 0 <= estimate_quality_score(small) <= 1
    assert 0 <= estimate_quality_score(large) <= 1


def test_normalize_vector_returns_unit_vector():
    vector = normalize_vector(np.array([3.0, 4.0], dtype=np.float32))

    assert math.isclose(float(np.linalg.norm(vector)), 1.0)


def test_normalize_vector_rejects_zero_vector():
    with pytest.raises(ValueError, match="norm must be positive and finite"):
        normalize_vector(np.zeros(EMBEDDING_DIMENSION, dtype=np.float64))


@pytest.mark.parametrize(
    "vector",
    [
        np.array([np.nan, 1.0], dtype=np.float32),
        np.array([np.inf, 1.0], dtype=np.float32),
    ],
)
def test_normalize_vector_rejects_non_finite_values(vector):
    with pytest.raises(ValueError, match="non-finite"):
        normalize_vector(vector)


def test_embedding_result_keeps_fixed_contract():
    result = EmbeddingResult(
        vector=np.zeros(EMBEDDING_DIMENSION, dtype=np.float32),
        model_version=MODEL_VERSION,
        quality_score=0.8,
    )

    assert result.vector.shape == (EMBEDDING_DIMENSION,)
    assert result.model_version == MODEL_VERSION


def test_embedding_result_rejects_invalid_shape():
    with pytest.raises(ValueError, match="shape"):
        EmbeddingResult(
            vector=np.zeros(2, dtype=np.float32),
            model_version=MODEL_VERSION,
            quality_score=0.8,
        )


def test_embedding_result_rejects_non_finite_vector_values():
    vector = np.zeros(EMBEDDING_DIMENSION, dtype=np.float32)
    vector[0] = np.nan

    with pytest.raises(ValueError, match="non-finite"):
        EmbeddingResult(
            vector=vector,
            model_version=MODEL_VERSION,
            quality_score=0.8,
        )


def test_embedding_result_rejects_invalid_model_version():
    with pytest.raises(ValueError, match="model version"):
        EmbeddingResult(
            vector=np.zeros(EMBEDDING_DIMENSION, dtype=np.float32),
            model_version="other-model",
            quality_score=0.8,
        )


@pytest.mark.parametrize("quality_score", [-0.1, 1.1])
def test_embedding_result_rejects_invalid_quality_score(quality_score):
    with pytest.raises(ValueError, match="quality score"):
        EmbeddingResult(
            vector=np.zeros(EMBEDDING_DIMENSION, dtype=np.float32),
            model_version=MODEL_VERSION,
            quality_score=quality_score,
        )


def test_embedding_module_import_does_not_require_torch(monkeypatch):
    import builtins
    import importlib

    original_import = builtins.__import__

    def fail_torch_import(name, *args, **kwargs):
        if name == "torch" or name.startswith("torchvision"):
            raise AssertionError(f"Unexpected import: {name}")
        return original_import(name, *args, **kwargs)

    original_module = sys.modules.pop("app.embedding", None)
    monkeypatch.setattr(builtins, "__import__", fail_torch_import)
    try:
        module = importlib.import_module("app.embedding")

        assert module.MODEL_VERSION == MODEL_VERSION
    finally:
        sys.modules.pop("app.embedding", None)
        if original_module is not None:
            sys.modules["app.embedding"] = original_module


def test_torchvision_embedder_returns_normalized_embedding_from_model_output():
    embedder = TorchvisionMobileNetEmbedder()
    embedder._ensure_model = lambda: (
        FakeTorch(),
        FakeModel(np.ones((1, EMBEDDING_DIMENSION), dtype=np.float32)),
        FakeTransforms(),
    )

    result = embedder.embed(Image.new("RGB", (224, 224), "white"))

    assert result.vector.shape == (EMBEDDING_DIMENSION,)
    assert math.isclose(float(np.linalg.norm(result.vector)), 1.0, rel_tol=1e-6)
    assert result.model_version == MODEL_VERSION


def test_torchvision_embedder_rejects_wrong_model_output_dimension():
    embedder = TorchvisionMobileNetEmbedder()
    embedder._ensure_model = lambda: (
        FakeTorch(),
        FakeModel(np.ones((1, EMBEDDING_DIMENSION - 1), dtype=np.float32)),
        FakeTransforms(),
    )

    with pytest.raises(ValueError, match="Expected embedding shape"):
        embedder.embed(Image.new("RGB", (224, 224), "white"))


def test_torchvision_embedder_rejects_wrong_raw_model_output_shape():
    embedder = TorchvisionMobileNetEmbedder()
    embedder._ensure_model = lambda: (
        FakeTorch(),
        FakeModel(np.ones((2, 288), dtype=np.float32)),
        FakeTransforms(),
    )

    with pytest.raises(ValueError, match="Expected embedding shape"):
        embedder.embed(Image.new("RGB", (224, 224), "white"))


class FakeTorch:
    no_grad = staticmethod(nullcontext)


class FakeTransforms:
    def __call__(self, image):
        return FakeInputTensor()


class FakeInputTensor:
    def unsqueeze(self, dimension):
        assert dimension == 0
        return self


class FakeModel:
    def __init__(self, output):
        self.output = output

    def __call__(self, tensor):
        assert isinstance(tensor, FakeInputTensor)
        return FakeTensor(self.output)


class FakeTensor:
    def __init__(self, array):
        self.array = array

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.array
