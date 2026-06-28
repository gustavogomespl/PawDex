from collections.abc import Callable
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, Literal, Optional

from fastapi import (
    Body,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from app.config import load_settings
from app.detection import Detector, load_image

if TYPE_CHECKING:
    from app.embedding import ImageEmbedder
    from app.matching import AnalyzeSightingService
    from app.repository import PawDexRepository

# Reject uploads larger than this before reading them into the detection pipeline.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def is_place_access_allowed(
    privacy_level: str,
    membership_status: Optional[str],
    *,
    require_write: bool,
) -> bool:
    """Read access: public places, or approved members. Write: approved members."""
    is_approved_member = membership_status == "approved"
    if require_write:
        return is_approved_member
    return privacy_level == "public" or is_approved_member


def require_internal_token(
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
) -> None:
    """Defense in depth: when PAWDEX_INTERNAL_TOKEN is set, only callers presenting
    it (the Next.js server) may reach place-scoped endpoints. Unset (tests/local) =
    skipped."""
    expected = load_settings().internal_token
    if expected and x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Invalid internal token.")


def read_upload_within_limit(file: UploadFile) -> bytes:
    image_bytes = file.file.read()
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image file is too large.")
    return image_bytes


class SyncUserRequest(BaseModel):
    email: str = Field(min_length=3)
    name: Optional[str] = None


class CreatePlaceRequest(BaseModel):
    name: str = Field(min_length=1)
    # Aliased so the field does not shadow the builtin ``type`` (which breaks
    # Pydantic schema generation for the fields declared after it).
    place_type: str = Field(alias="type", min_length=1)
    privacy_level: Literal["private", "invite-only", "public"] = Field(
        alias="privacyLevel"
    )
    album_total_slots: int = Field(default=12, alias="albumTotalSlots", gt=0)
    photo_url: Optional[str] = Field(default=None, alias="photoUrl")
    created_by: str = Field(alias="createdBy")
    geofence: Optional[dict[str, Any]] = None


class ConfirmSightingRequest(BaseModel):
    analysis_id: str = Field(alias="analysisId")
    place_id: str = Field(alias="placeId")
    user_id: str = Field(alias="userId")
    decision: Literal["existing", "new"]
    animal_id: Optional[str] = Field(default=None, alias="animalId")
    match_confidence: Optional[float] = Field(
        default=None,
        alias="matchConfidence",
        ge=0,
        le=1,
    )
    display_name: Optional[str] = Field(default=None, alias="displayName")
    species: Optional[str] = None
    photo_url: str = Field(alias="photoUrl")
    zone_label: str = Field(default="Area comum", alias="zoneLabel")


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
        allow_origins=list(load_settings().allowed_origins),
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

    def authorize_place(
        place_id: str,
        user_id: Optional[str],
        *,
        require_write: bool,
    ) -> None:
        repository = get_repository()
        privacy = repository.get_place_privacy(place_id)
        if privacy is None:
            raise HTTPException(status_code=404, detail="Place not found.")

        membership_status: Optional[str] = None
        if user_id:
            membership = repository.get_membership(place_id, user_id)
            membership_status = membership.get("status") if membership else None

        if not is_place_access_allowed(
            privacy, membership_status, require_write=require_write
        ):
            raise HTTPException(
                status_code=403, detail="Not authorized for this place."
            )

    @app.get("/health")
    def health() -> dict[str, str]:
        response = {"status": "ok", "model": "configured"}
        get_repository().healthcheck()
        response["database"] = "connected"
        return response

    @app.post("/detect")
    def detect(file: UploadFile = File(...)) -> dict[str, object]:
        image_bytes = read_upload_within_limit(file)
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

    @app.post("/users/sync", dependencies=[Depends(require_internal_token)])
    def sync_user(payload: SyncUserRequest) -> dict[str, object]:
        return get_repository().upsert_user(email=payload.email, name=payload.name)

    @app.post("/places", dependencies=[Depends(require_internal_token)])
    def create_place(payload: dict[str, Any] = Body(...)) -> dict[str, object]:
        # Validated manually (like confirm-sighting) so FastAPI does not introspect
        # an aliased body model directly, which emits spurious alias warnings.
        try:
            request = CreatePlaceRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc

        return get_repository().create_place(
            name=request.name,
            type=request.place_type,
            privacy_level=request.privacy_level,
            created_by=request.created_by,
            album_total_slots=request.album_total_slots,
            photo_url=request.photo_url,
            geofence=request.geofence,
        )

    @app.get(
        "/users/{user_id}/places",
        dependencies=[Depends(require_internal_token)],
    )
    def list_user_places(user_id: str) -> dict[str, object]:
        return {"places": get_repository().list_places_for_user(user_id)}

    @app.get(
        "/places/{place_id}/state",
        dependencies=[Depends(require_internal_token)],
    )
    def place_state(
        place_id: str,
        user_id: Optional[str] = None,
    ) -> dict[str, object]:
        authorize_place(place_id, user_id, require_write=False)
        return get_repository().get_place_state(place_id)

    @app.post("/analyze-sighting", dependencies=[Depends(require_internal_token)])
    def analyze_sighting(
        place_id: str = Form(...),
        user_id: str = Form(...),
        file: UploadFile = File(...),
    ) -> dict[str, object]:
        authorize_place(place_id, user_id, require_write=True)
        image_bytes = read_upload_within_limit(file)
        try:
            image = load_image(image_bytes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return get_analyze_service().analyze(image, place_id)

    @app.post("/confirm-sighting", dependencies=[Depends(require_internal_token)])
    def confirm_sighting(
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, object]:
        try:
            request = ConfirmSightingRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc

        authorize_place(request.place_id, request.user_id, require_write=True)

        try:
            if request.decision == "existing":
                if request.animal_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail="animalId is required.",
                    )
                return get_repository().confirm_existing_animal(
                    analysis_id=request.analysis_id,
                    place_id=request.place_id,
                    animal_id=request.animal_id,
                    photo_url=request.photo_url,
                    zone_label=request.zone_label,
                    match_confidence=request.match_confidence,
                    created_by=request.user_id,
                )

            if request.display_name is None or request.species is None:
                raise HTTPException(
                    status_code=400,
                    detail="displayName and species are required.",
                )
            return get_repository().confirm_new_animal(
                analysis_id=request.analysis_id,
                place_id=request.place_id,
                display_name=request.display_name,
                species=request.species,
                photo_url=request.photo_url,
                zone_label=request.zone_label,
                created_by=request.user_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return app


app = create_app()
