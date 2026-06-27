from __future__ import annotations

from dataclasses import asdict
from typing import Any

from PIL import Image

from app.detection import Detector
from app.embedding import ImageEmbedder, crop_to_box
from app.repository import MatchCandidate, PawDexRepository


MATCH_THRESHOLD = 0.8
MIN_QUALITY_SCORE = 0.18


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
    ):
        self.detector = detector
        self.embedder = embedder
        self.repository = repository

    def analyze(self, image: Image.Image, place_id: str) -> dict[str, Any]:
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

        matches = self.repository.find_matches(
            place_id=place_id,
            species=detection.species,
            embedding=embedding.vector,
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
        )

        return {
            "analysisId": analysis_id,
            "detection": detection_api,
            "embedding": embedding_api,
            "matches": [match_to_api(match) for match in matches],
            "recommendation": recommendation_from_matches(matches),
        }
