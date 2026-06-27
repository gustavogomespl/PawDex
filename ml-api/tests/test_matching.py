from __future__ import annotations

from dataclasses import asdict
from typing import Any

import numpy as np
from PIL import Image

from app.detection import BoundingBox, DetectionResponse, PetDetection
from app.embedding import EMBEDDING_DIMENSION, MODEL_VERSION, EmbeddingResult
from app.matching import (
    MIN_QUALITY_SCORE,
    AnalyzeSightingService,
    recommendation_from_matches,
)
from app.repository import MatchCandidate


def test_recommends_probably_new_when_matches_are_empty():
    assert recommendation_from_matches([]) == "probably_new"


def test_recommends_probably_new_when_top_match_is_below_threshold():
    assert recommendation_from_matches([match(score=0.79)]) == "probably_new"


def test_recommends_possible_existing_when_top_match_meets_threshold():
    assert recommendation_from_matches([match(score=0.8)]) == "possible_existing"


def test_no_pet_detected_skips_embedding_and_repository_calls():
    repository = RecordingRepository()
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=None),
        embedder=FailingEmbedder(),
        repository=repository,
    )

    result = service.analyze(Image.new("RGB", (100, 100), "white"), "place-office")

    assert result == {
        "analysisId": None,
        "detection": None,
        "embedding": None,
        "matches": [],
        "recommendation": "no_pet_detected",
    }
    assert repository.find_match_calls == []
    assert repository.pending_calls == []


def test_possible_existing_match_returns_api_shape_and_records_pending_species():
    repository = RecordingRepository(matches=[match(score=0.82)])
    detection = pet_detection(species="cat")
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=detection),
        embedder=FakeEmbedder(quality_score=0.9),
        repository=repository,
    )

    result = service.analyze(Image.new("RGB", (100, 100), "white"), "place-office")

    assert result["analysisId"] == "analysis-created"
    assert result["recommendation"] == "possible_existing"
    assert result["matches"] == [
        {
            "animalId": "animal-mingau",
            "displayName": "Mingau",
            "species": "cat",
            "primaryPhotoUrl": "https://example.com/mingau.jpg",
            "score": 0.82,
        }
    ]
    assert repository.pending_calls[0]["species"] == "cat"


def test_low_quality_embedding_skips_repository_search_and_pending_creation():
    repository = RecordingRepository()
    detection = pet_detection()
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=detection),
        embedder=FakeEmbedder(quality_score=0.17),
        repository=repository,
    )

    result = service.analyze(Image.new("RGB", (100, 100), "white"), "place-office")

    assert result == {
        "analysisId": None,
        "detection": asdict(detection),
        "embedding": {"modelVersion": MODEL_VERSION, "qualityScore": 0.17},
        "matches": [],
        "recommendation": "needs_better_photo",
    }
    assert repository.find_match_calls == []
    assert repository.pending_calls == []


def test_embedder_receives_cropped_detection_image():
    detection = pet_detection(box=BoundingBox(10, 20, 70, 85))
    embedder = SizeRecordingEmbedder(quality_score=0.9)
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=detection),
        embedder=embedder,
        repository=RecordingRepository(),
    )

    service.analyze(Image.new("RGB", (200, 150), "white"), "place-office")

    assert embedder.image_sizes == [(60, 65)]


def test_quality_score_at_minimum_threshold_still_creates_pending_analysis():
    repository = RecordingRepository()
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=pet_detection()),
        embedder=FakeEmbedder(quality_score=MIN_QUALITY_SCORE),
        repository=repository,
    )

    result = service.analyze(Image.new("RGB", (100, 100), "white"), "place-office")

    assert result["analysisId"] == "analysis-created"
    assert result["recommendation"] == "probably_new"
    assert len(repository.find_match_calls) == 1
    assert len(repository.pending_calls) == 1
    assert repository.pending_calls[0]["quality_score"] == MIN_QUALITY_SCORE


def test_probably_new_without_matches_still_creates_pending_analysis():
    repository = RecordingRepository(matches=[])
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=pet_detection()),
        embedder=FakeEmbedder(quality_score=0.9),
        repository=repository,
    )

    result = service.analyze(Image.new("RGB", (100, 100), "white"), "place-office")

    assert result["analysisId"] == "analysis-created"
    assert result["matches"] == []
    assert result["recommendation"] == "probably_new"
    assert len(repository.pending_calls) == 1


def test_pending_call_includes_detection_and_embedding_metadata():
    repository = RecordingRepository(matches=[])
    detection = pet_detection(
        species="dog",
        confidence=0.73,
        box=BoundingBox(4, 5, 40, 50),
    )
    embedder = FakeEmbedder(quality_score=0.8)
    service = AnalyzeSightingService(
        detector=FakeDetector(best_detection=detection),
        embedder=embedder,
        repository=repository,
    )

    service.analyze(Image.new("RGB", (100, 100), "white"), "place-park")

    assert repository.find_match_calls == [
        {
            "place_id": "place-park",
            "species": "dog",
            "embedding": embedder.result.vector,
            "model_version": MODEL_VERSION,
            "limit": 3,
        }
    ]
    assert repository.pending_calls == [
        {
            "place_id": "place-park",
            "species": "dog",
            "detector_confidence": 0.73,
            "detection_box": {"x1": 4, "y1": 5, "x2": 40, "y2": 50},
            "model_version": MODEL_VERSION,
            "embedding": embedder.result.vector,
            "quality_score": 0.8,
        }
    ]


def pet_detection(
    *,
    species: str = "cat",
    confidence: float = 0.91,
    box: BoundingBox | None = None,
) -> PetDetection:
    return PetDetection(
        species=species,
        label=species,
        confidence=confidence,
        box=box or BoundingBox(10, 20, 80, 90),
    )


def match(score: float) -> MatchCandidate:
    return MatchCandidate(
        animal_id="animal-mingau",
        display_name="Mingau",
        species="cat",
        primary_photo_url="https://example.com/mingau.jpg",
        score=score,
    )


class FakeDetector:
    def __init__(self, best_detection: PetDetection | None):
        detections = [] if best_detection is None else [best_detection]
        self.response = DetectionResponse(
            detections=detections,
            best_detection=best_detection,
        )

    def detect(self, image: Image.Image) -> DetectionResponse:
        return self.response


class FakeEmbedder:
    def __init__(self, quality_score: float):
        self.result = EmbeddingResult(
            vector=np.ones(EMBEDDING_DIMENSION, dtype=np.float32),
            model_version=MODEL_VERSION,
            quality_score=quality_score,
        )

    def embed(self, image: Image.Image) -> EmbeddingResult:
        return self.result


class FailingEmbedder:
    def embed(self, image: Image.Image) -> EmbeddingResult:
        raise AssertionError("Embedder should not be called.")


class SizeRecordingEmbedder(FakeEmbedder):
    def __init__(self, quality_score: float):
        super().__init__(quality_score)
        self.image_sizes: list[tuple[int, int]] = []

    def embed(self, image: Image.Image) -> EmbeddingResult:
        self.image_sizes.append(image.size)
        return self.result


class RecordingRepository:
    def __init__(self, matches: list[MatchCandidate] | None = None):
        self.matches = matches or []
        self.find_match_calls: list[dict[str, Any]] = []
        self.pending_calls: list[dict[str, Any]] = []

    def find_matches(
        self,
        place_id: str,
        species: str,
        embedding: Any,
        model_version: str,
        limit: int = 3,
    ) -> list[MatchCandidate]:
        self.find_match_calls.append(
            {
                "place_id": place_id,
                "species": species,
                "embedding": embedding,
                "model_version": model_version,
                "limit": limit,
            }
        )
        return self.matches

    def create_pending_analysis(
        self,
        place_id: str,
        species: str,
        detector_confidence: float,
        detection_box: dict[str, float],
        model_version: str,
        embedding: Any,
        quality_score: float,
    ) -> str:
        self.pending_calls.append(
            {
                "place_id": place_id,
                "species": species,
                "detector_confidence": detector_confidence,
                "detection_box": detection_box,
                "model_version": model_version,
                "embedding": embedding,
                "quality_score": quality_score,
            }
        )
        return "analysis-created"
