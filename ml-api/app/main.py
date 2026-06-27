from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import TYPE_CHECKING, Annotated, Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import load_settings
from app.detection import Detector, load_image

if TYPE_CHECKING:
    from app.embedding import ImageEmbedder
    from app.matching import AnalyzeSightingService
    from app.repository import PawDexRepository


class ConfirmSightingRequest(BaseModel):
    analysis_id: Annotated[str, Field(alias="analysisId")]
    place_id: Annotated[str, Field(alias="placeId")]
    decision: Literal["existing", "new"]
    animal_id: Annotated[Optional[str], Field(alias="animalId")] = None
    display_name: Annotated[Optional[str], Field(alias="displayName")] = None
    species: Optional[str] = None
    photo_url: Annotated[str, Field(alias="photoUrl")]
    zone_label: Annotated[str, Field(alias="zoneLabel")] = "Area comum"


def create_app(
    detector_factory: Optional[Callable[[], Detector]] = None,
    repository_factory: Optional[Callable[[], "PawDexRepository"]] = None,
    embedder_factory: Optional[Callable[[], "ImageEmbedder"]] = None,
    analyze_service_factory: Optional[
        Callable[[FastAPI], "AnalyzeSightingService"]
    ] = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        pool = app.state.repository_pool
        if pool is not None:
            pool.close()

    app = FastAPI(title="PawDex ML API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def default_detector_factory() -> Detector:
        from app.detection import UltralyticsYoloDetector

        settings = load_settings()
        return UltralyticsYoloDetector(
            model_path=settings.yolo_model,
            confidence=settings.yolo_confidence,
        )

    def default_repository_factory() -> "PawDexRepository":
        from app.database import create_pool
        from app.repository import PostgresPawDexRepository

        settings = load_settings()
        pool = create_pool(settings.database_url)
        app.state.repository_pool = pool
        return PostgresPawDexRepository(pool)

    def default_analyze_service_factory(app: FastAPI) -> "AnalyzeSightingService":
        from app.matching import AnalyzeSightingService

        return AnalyzeSightingService(
            detector=get_detector(),
            embedder=get_embedder(),
            repository=get_repository(),
        )

    def default_embedder_factory() -> "ImageEmbedder":
        from app.embedding import TorchvisionMobileNetEmbedder

        return TorchvisionMobileNetEmbedder()

    app.state.detector_factory = detector_factory or default_detector_factory
    app.state.repository_factory = repository_factory or default_repository_factory
    app.state.embedder_factory = embedder_factory or default_embedder_factory
    app.state.analyze_service_factory = (
        analyze_service_factory or default_analyze_service_factory
    )
    app.state.detector = None
    app.state.repository = None
    app.state.embedder = None
    app.state.analyze_service = None
    app.state.repository_pool = None

    def get_detector() -> Detector:
        if app.state.detector is None:
            app.state.detector = app.state.detector_factory()
        return app.state.detector

    def get_repository() -> "PawDexRepository":
        if app.state.repository is None:
            app.state.repository = app.state.repository_factory()
        return app.state.repository

    def get_embedder() -> "ImageEmbedder":
        if app.state.embedder is None:
            app.state.embedder = app.state.embedder_factory()
        return app.state.embedder

    def get_analyze_service() -> "AnalyzeSightingService":
        if app.state.analyze_service is None:
            app.state.analyze_service = app.state.analyze_service_factory(app)
        return app.state.analyze_service

    @app.get("/health")
    async def health() -> dict[str, str]:
        response = {"status": "ok", "model": "configured"}
        get_repository().healthcheck()
        response["database"] = "connected"
        return response

    @app.post("/detect")
    async def detect(file: UploadFile = File(...)) -> dict[str, object]:
        image_bytes = await file.read()
        try:
            image = load_image(image_bytes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        result = get_detector().detect(image)
        return {
            "detections": [asdict(detection) for detection in result.detections],
            "bestDetection": asdict(result.best_detection)
            if result.best_detection is not None
            else None,
        }

    @app.get("/places/{place_id}/state")
    async def place_state(place_id: str) -> dict[str, object]:
        return get_repository().get_place_state(place_id)

    @app.post("/analyze-sighting")
    async def analyze_sighting(
        place_id: str = Form(...),
        file: UploadFile = File(...),
    ) -> dict[str, object]:
        image_bytes = await file.read()
        try:
            image = load_image(image_bytes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return get_analyze_service().analyze(image, place_id)

    @app.post("/confirm-sighting")
    async def confirm_sighting(request: ConfirmSightingRequest) -> dict[str, object]:
        repository = get_repository()
        try:
            if request.decision == "existing":
                if request.animal_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail="animalId is required.",
                    )
                return repository.confirm_existing_animal(
                    analysis_id=request.analysis_id,
                    place_id=request.place_id,
                    animal_id=request.animal_id,
                    photo_url=request.photo_url,
                    zone_label=request.zone_label,
                )

            if request.display_name is None or request.species is None:
                raise HTTPException(
                    status_code=400,
                    detail="displayName and species are required.",
                )
            return repository.confirm_new_animal(
                analysis_id=request.analysis_id,
                place_id=request.place_id,
                display_name=request.display_name,
                species=request.species,
                photo_url=request.photo_url,
                zone_label=request.zone_label,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return app


app = create_app()
