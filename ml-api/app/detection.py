from __future__ import annotations

import os
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol

from PIL import Image, UnidentifiedImageError

# Cap decoded image dimensions to defend against decompression bombs. PIL emits a
# DecompressionBombError when an image exceeds twice this pixel count.
MAX_IMAGE_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@dataclass(frozen=True)
class BoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass(frozen=True)
class RawDetection:
    label: str
    confidence: float
    box: BoundingBox


@dataclass(frozen=True)
class PetDetection:
    species: str
    label: str
    confidence: float
    box: BoundingBox


@dataclass(frozen=True)
class DetectionResponse:
    detections: list[PetDetection]
    best_detection: PetDetection | None


class Detector(Protocol):
    def detect(self, image: Image.Image) -> DetectionResponse:
        ...


def normalize_yolo_label(label: str) -> str | None:
    normalized = label.strip().lower()
    if normalized in {"cat", "dog"}:
        return normalized
    return None


def build_detection_response(raw_detections: list[RawDetection]) -> DetectionResponse:
    detections = [
        PetDetection(
            species=species,
            label=raw.label,
            confidence=max(0.0, min(1.0, raw.confidence)),
            box=raw.box,
        )
        for raw in raw_detections
        if (species := normalize_yolo_label(raw.label)) is not None
    ]
    best_detection = max(detections, key=lambda item: item.confidence, default=None)
    return DetectionResponse(detections=detections, best_detection=best_detection)


def load_image(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
        return image.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Unsupported or invalid image file.") from exc


class UltralyticsYoloDetector:
    def __init__(self, model_path: str | None = None, confidence: float | None = None):
        from ultralytics import YOLO

        self.model_path = model_path or os.getenv("PAWDEX_YOLO_MODEL", "yolo11n.pt")
        self.confidence = confidence or float(
            os.getenv("PAWDEX_YOLO_CONFIDENCE", "0.35")
        )
        self.model = YOLO(self.model_path)

    def detect(self, image: Image.Image) -> DetectionResponse:
        results = self.model.predict(
            source=image,
            imgsz=640,
            conf=self.confidence,
            save=False,
            verbose=False,
        )
        raw_detections: list[RawDetection] = []

        if not results:
            return build_detection_response(raw_detections)

        result = results[0]
        boxes = result.boxes
        if boxes is None:
            return build_detection_response(raw_detections)

        xyxy = boxes.xyxy.cpu().numpy()
        conf = boxes.conf.cpu().numpy()
        cls = boxes.cls.cpu().numpy().astype(int)

        for index, coordinates in enumerate(xyxy):
            class_id = int(cls[index])
            label = result.names.get(class_id, f"class_{class_id}")
            raw_detections.append(
                RawDetection(
                    label=label,
                    confidence=float(conf[index]),
                    box=BoundingBox(
                        x1=float(coordinates[0]),
                        y1=float(coordinates[1]),
                        x2=float(coordinates[2]),
                        y2=float(coordinates[3]),
                    ),
                )
            )

        return build_detection_response(raw_detections)
