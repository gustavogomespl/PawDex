import math
import sys
import threading
import time
import types
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


def test_crop_to_box_returns_one_pixel_for_inverted_box():
    image = Image.new("RGB", (100, 80), "white")
    crop = crop_to_box(image, BoundingBox(40, 50, 20, 30))

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
    vector = np.arange(1, EMBEDDING_DIMENSION + 1, dtype=np.float32)
    result = EmbeddingResult(
        vector=vector,
        model_version=MODEL_VERSION,
        quality_score=0.8,
    )
    vector[0] = 0

    assert result.vector.shape == (EMBEDDING_DIMENSION,)
    assert result.vector.dtype == np.float32
    assert math.isclose(float(np.linalg.norm(result.vector)), 1.0, rel_tol=1e-6)
    assert result.model_version == MODEL_VERSION
    assert result.vector[0] != 0


def test_embedding_result_vector_is_read_only_after_validation():
    result = EmbeddingResult(
        vector=np.ones(EMBEDDING_DIMENSION, dtype=np.float32),
        model_version=MODEL_VERSION,
        quality_score=0.8,
    )

    with pytest.raises(ValueError, match="read-only"):
        result.vector[0] = 2.0

    assert math.isclose(float(np.linalg.norm(result.vector)), 1.0, rel_tol=1e-6)


def test_embedding_result_rejects_invalid_shape():
    with pytest.raises(ValueError, match="shape"):
        EmbeddingResult(
            vector=np.zeros(2, dtype=np.float32),
            model_version=MODEL_VERSION,
            quality_score=0.8,
        )


def test_embedding_result_rejects_zero_vector():
    with pytest.raises(ValueError, match="norm must be positive and finite"):
        EmbeddingResult(
            vector=np.zeros(EMBEDDING_DIMENSION, dtype=np.float32),
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
            vector=np.ones(EMBEDDING_DIMENSION, dtype=np.float32),
            model_version="other-model",
            quality_score=0.8,
        )


@pytest.mark.parametrize("quality_score", [-0.1, 1.1])
def test_embedding_result_rejects_invalid_quality_score(quality_score):
    with pytest.raises(ValueError, match="quality score"):
        EmbeddingResult(
            vector=np.ones(EMBEDDING_DIMENSION, dtype=np.float32),
            model_version=MODEL_VERSION,
            quality_score=quality_score,
        )


def test_torchvision_mobilenet_without_weights_outputs_embedding_dimension():
    torch = pytest.importorskip("torch")
    models = pytest.importorskip("torchvision.models")

    model = models.mobilenet_v3_small(weights=None)
    model.classifier = torch.nn.Identity()
    model.eval()

    with torch.no_grad():
        output = model(torch.zeros((1, 3, 224, 224), dtype=torch.float32))

    assert tuple(output.shape) == (1, EMBEDDING_DIMENSION)


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


def test_torchvision_embedder_initializes_lazy_model_once_for_concurrent_first_use(
    monkeypatch,
):
    calls = 0
    first_call_started = threading.Event()
    release_first_call = threading.Event()
    lock = threading.Lock()

    class FakeWeights:
        IMAGENET1K_V1 = None

        @staticmethod
        def transforms():
            return FakeTransforms()

    FakeWeights.IMAGENET1K_V1 = FakeWeights()

    class FakeIdentity:
        pass

    class FakeLoadedModel:
        classifier = None

        def eval(self):
            return None

    def mobilenet_v3_small(weights):
        nonlocal calls
        assert weights is FakeWeights.IMAGENET1K_V1
        with lock:
            calls += 1
            first_call_started.set()
        release_first_call.wait(timeout=1)
        return FakeLoadedModel()

    torch_module = types.ModuleType("torch")
    torch_module.nn = types.SimpleNamespace(Identity=FakeIdentity)
    torchvision_module = types.ModuleType("torchvision")
    torchvision_models_module = types.ModuleType("torchvision.models")
    torchvision_models_module.MobileNet_V3_Small_Weights = FakeWeights
    torchvision_models_module.mobilenet_v3_small = mobilenet_v3_small

    monkeypatch.setitem(sys.modules, "torch", torch_module)
    monkeypatch.setitem(sys.modules, "torchvision", torchvision_module)
    monkeypatch.setitem(sys.modules, "torchvision.models", torchvision_models_module)

    embedder = TorchvisionMobileNetEmbedder()
    start = threading.Event()
    errors = []

    def initialize():
        start.wait(timeout=1)
        try:
            embedder._ensure_model()
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=initialize) for _ in range(2)]
    for thread in threads:
        thread.start()

    start.set()
    assert first_call_started.wait(timeout=1)
    time.sleep(0.05)
    release_first_call.set()

    for thread in threads:
        thread.join(timeout=1)

    assert errors == []
    assert calls == 1


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
