from __future__ import annotations

import secrets
from dataclasses import asdict
from io import BytesIO
from typing import Any

from PIL import Image

from app.detection import Detector
from app.embedding import ImageEmbedder, crop_to_box
from app.privacy import blur_sensitive_regions
from app.repository import MatchCandidate, PawDexRepository
from app.storage import ObjectStorage, is_storage_key


MATCH_THRESHOLD = 0.8
MIN_QUALITY_SCORE = 0.18


def encode_jpeg(image: Image.Image, quality: int = 85) -> bytes:
    """Re-encode a crop as JPEG (drops EXIF/metadata in the process)."""
    buffer = BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def recommendation_from_matches(matches: list[MatchCandidate]) -> str:
    if matches and matches[0].score >= MATCH_THRESHOLD:
        return "possible_existing"
    return "probably_new"


def match_to_api(match: MatchCandidate) -> dict[str, Any]:
    return {
        "animalId": match.animal_id,
        "displayName": match.display_name,
        "species": match.species,
        "primaryPhotoUrl": match.primary_photo_url,
        "score": match.score,
    }


class AnalyzeSightingService:
    def __init__(
        self,
        detector: Detector,
        embedder: ImageEmbedder,
        repository: PawDexRepository,
        storage: ObjectStorage | None = None,
    ):
        self.detector = detector
        self.embedder = embedder
        self.repository = repository
        self.storage = storage

    def analyze(
        self,
        image: Image.Image,
        place_id: str,
        created_by: str | None = None,
    ) -> dict[str, Any]:
        detection_response = self.detector.detect(image)
        detection = detection_response.best_detection

        if detection is None:
            return {
                "analysisId": None,
                "detection": None,
                "embedding": None,
                "matches": [],
                "recommendation": "no_pet_detected",
            }

        crop = crop_to_box(image, detection.box)
        embedding = self.embedder.embed(crop)
        detection_api = asdict(detection)
        embedding_api = {
            "modelVersion": embedding.model_version,
            "qualityScore": embedding.quality_score,
        }

        if embedding.quality_score < MIN_QUALITY_SCORE:
            return {
                "analysisId": None,
                "detection": detection_api,
                "embedding": embedding_api,
                "matches": [],
                "recommendation": "needs_better_photo",
            }

        self._purge_stale_pending_crops()

        crop_key: str | None = None
        if self.storage is not None:
            # Embedding uses the original crop; only the blurred crop is stored.
            safe_crop = blur_sensitive_regions(crop)
            crop_key = f"crops/{secrets.token_hex(16)}.jpg"
            self.storage.put(crop_key, encode_jpeg(safe_crop), "image/jpeg")

        try:
            matches = self.repository.find_matches(
                place_id=place_id,
                species=detection.species,
                embedding=embedding.vector,
                model_version=embedding.model_version,
                limit=3,
            )
            analysis_id = self.repository.create_pending_analysis(
                place_id=place_id,
                species=detection.species,
                detector_confidence=detection.confidence,
                detection_box=asdict(detection.box),
                model_version=embedding.model_version,
                embedding=embedding.vector,
                quality_score=embedding.quality_score,
                crop_key=crop_key,
                created_by=created_by,
            )
        except Exception:
            if crop_key is not None and self.storage is not None:
                self.storage.delete(crop_key)
            raise

        return {
            "analysisId": analysis_id,
            "detection": detection_api,
            "embedding": embedding_api,
            "cropKey": crop_key,
            "matches": [match_to_api(match) for match in matches],
            "recommendation": recommendation_from_matches(matches),
        }

    def _purge_stale_pending_crops(self) -> None:
        stale_crop_keys = self.repository.purge_stale_pending_analyses()
        if self.storage is None:
            return

        for key in stale_crop_keys:
            if is_storage_key(key):
                self.storage.delete(key)
