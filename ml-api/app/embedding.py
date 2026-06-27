from __future__ import annotations

import math
import threading
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image

from app.detection import BoundingBox


MODEL_VERSION = "torchvision-mobilenet-v3-small-imagenet1k-v1"
EMBEDDING_DIMENSION = 576


@dataclass(frozen=True)
class EmbeddingResult:
    vector: np.ndarray
    model_version: str
    quality_score: float

    def __post_init__(self) -> None:
        vector = np.asarray(self.vector, dtype=np.float32)
        if vector.shape != (EMBEDDING_DIMENSION,):
            raise ValueError(
                f"Embedding vector must have shape ({EMBEDDING_DIMENSION},)."
            )
        if self.model_version != MODEL_VERSION:
            raise ValueError(f"Embedding model version must be {MODEL_VERSION}.")
        if not 0 <= self.quality_score <= 1:
            raise ValueError("Embedding quality score must be between 0 and 1.")

        normalized_vector = normalize_vector(vector).copy()
        normalized_vector.setflags(write=False)

        object.__setattr__(self, "vector", normalized_vector)
        object.__setattr__(self, "quality_score", float(self.quality_score))


class ImageEmbedder(Protocol):
    def embed(self, image: Image.Image) -> EmbeddingResult:
        ...


def crop_to_box(image: Image.Image, box: BoundingBox) -> Image.Image:
    width, height = image.size
    if width < 1 or height < 1:
        raise ValueError("Cannot crop an empty image.")

    if not all(
        math.isfinite(coordinate)
        for coordinate in (box.x1, box.y1, box.x2, box.y2)
    ):
        raise ValueError("Bounding box coordinates must be finite.")

    left = _clamp(math.floor(box.x1), 0, width - 1)
    upper = _clamp(math.floor(box.y1), 0, height - 1)
    right = _clamp(math.ceil(box.x2), 1, width)
    lower = _clamp(math.ceil(box.y2), 1, height)

    if right <= left:
        right = min(width, left + 1)
        left = max(0, right - 1)
    if lower <= upper:
        lower = min(height, upper + 1)
        upper = max(0, lower - 1)

    return image.crop((left, upper, right, lower))


def estimate_quality_score(image: Image.Image) -> float:
    width, height = image.size
    short_side = min(width, height)
    area = width * height

    short_side_score = _clamp(short_side / 224.0, 0.0, 1.0)
    area_score = _clamp(area / float(224 * 224), 0.0, 1.0)
    score = (short_side_score + area_score) / 2.0

    return round(float(_clamp(score, 0.0, 1.0)), 4)


def normalize_vector(vector: np.ndarray) -> np.ndarray:
    normalized = np.asarray(vector, dtype=np.float32)
    if not np.all(np.isfinite(normalized)):
        raise ValueError("Embedding vector contains non-finite values.")

    norm = float(np.linalg.norm(normalized))
    if not math.isfinite(norm) or norm <= 0:
        raise ValueError("Embedding vector norm must be positive and finite.")

    return (normalized / norm).astype(np.float32)


class TorchvisionMobileNetEmbedder:
    def __init__(self) -> None:
        self._model_lock = threading.Lock()
        self._torch = None
        self._model = None
        self._transforms = None

    def embed(self, image: Image.Image) -> EmbeddingResult:
        torch, model, transforms = self._ensure_model()
        rgb_image = image.convert("RGB")

        with torch.no_grad():
            tensor = transforms(rgb_image).unsqueeze(0)
            output = model(tensor)

        raw_vector = output.detach().cpu().numpy().astype(np.float32)
        if raw_vector.shape != (1, EMBEDDING_DIMENSION):
            raise ValueError(
                f"Expected embedding shape (1, {EMBEDDING_DIMENSION}), got {raw_vector.shape}."
            )
        vector = raw_vector.reshape(EMBEDDING_DIMENSION)

        return EmbeddingResult(
            vector=vector,
            model_version=MODEL_VERSION,
            quality_score=estimate_quality_score(rgb_image),
        )

    def _ensure_model(self):
        if (
            self._torch is not None
            and self._model is not None
            and self._transforms is not None
        ):
            return self._torch, self._model, self._transforms

        with self._model_lock:
            if (
                self._torch is not None
                and self._model is not None
                and self._transforms is not None
            ):
                return self._torch, self._model, self._transforms

            import torch
            from torchvision.models import (
                MobileNet_V3_Small_Weights,
                mobilenet_v3_small,
            )

            weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
            model = mobilenet_v3_small(weights=weights)
            model.classifier = torch.nn.Identity()
            model.eval()

            self._torch = torch
            self._model = model
            self._transforms = weights.transforms()

        return self._torch, self._model, self._transforms


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))
