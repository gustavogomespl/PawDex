import math
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
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

from app.config import load_settings
from app.detection import Detector, load_image
from app.ratelimit import RateLimiter
from app.storage import is_storage_key

if TYPE_CHECKING:
    from app.embedding import ImageEmbedder
    from app.matching import AnalyzeSightingService
    from app.repository import PawDexRepository
    from app.storage import ObjectStorage

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


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def is_within_geofence(geofence: dict[str, Any], lat: float, lng: float) -> bool:
    return (
        haversine_meters(geofence["lat"], geofence["lng"], lat, lng)
        <= geofence["radiusM"]
    )


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


class JoinPlaceRequest(BaseModel):
    user_id: str = Field(alias="userId")
    method: Literal["invite", "request", "gps"]
    code: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class MemberStatusRequest(BaseModel):
    user_id: str = Field(alias="userId")
    status: Literal["approved", "rejected"]


class NameRequest(BaseModel):
    user_id: str = Field(alias="userId")
    name: str = Field(min_length=1, max_length=40)


class ReportRequest(BaseModel):
    user_id: str = Field(alias="userId")
    target_type: Literal["sighting", "animal"] = Field(alias="targetType")
    target_id: str = Field(alias="targetId")
    reason: Literal["duplicate", "wrong_info", "inappropriate", "at_risk", "privacy"]
    note: Optional[str] = Field(default=None, max_length=300)


class ResolveReportRequest(BaseModel):
    user_id: str = Field(alias="userId")
    status: Literal["resolved", "dismissed"]


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
    storage_factory: Optional[Callable[[], "ObjectStorage"]] = None,
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
            storage=get_storage(),
        )

    def default_embedder_factory() -> "ImageEmbedder":
        from app.embedding import TorchvisionMobileNetEmbedder

        return TorchvisionMobileNetEmbedder()

    def default_storage_factory() -> "ObjectStorage":
        from app.storage import MinioObjectStorage

        settings = load_settings()
        return MinioObjectStorage(
            endpoint=settings.s3_endpoint,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            bucket=settings.s3_bucket,
            secure=settings.s3_secure,
        )

    app.state.detector_factory = detector_factory or default_detector_factory
    app.state.repository_factory = repository_factory or default_repository_factory
    app.state.embedder_factory = embedder_factory or default_embedder_factory
    app.state.analyze_service_factory = (
        analyze_service_factory or default_analyze_service_factory
    )
    app.state.storage_factory = storage_factory or default_storage_factory
    app.state.detector = None
    app.state.repository = None
    app.state.embedder = None
    app.state.analyze_service = None
    app.state.storage = None
    app.state.repository_pool = None
    app.state.rate_limiter = RateLimiter(
        load_settings().rate_limit_per_min, per_seconds=60
    )

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

    def get_storage() -> "ObjectStorage":
        if app.state.storage is None:
            app.state.storage = app.state.storage_factory()
        return app.state.storage

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

    def authorize_admin(place_id: str, user_id: str) -> None:
        membership = get_repository().get_membership(place_id, user_id)
        if not (
            membership
            and membership.get("role") == "admin"
            and membership.get("status") == "approved"
        ):
            raise HTTPException(status_code=403, detail="Admin access required.")

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

    @app.delete(
        "/users/{user_id}/content",
        dependencies=[Depends(require_internal_token)],
    )
    def delete_user_content(user_id: str) -> dict[str, object]:
        repository = get_repository()
        result = repository.delete_content_by_user(user_id)
        counts = {
            "animalsDeleted": result.get("animalsDeleted"),
            "sightingsDeleted": result.get("sightingsDeleted"),
        }

        keys = [key for key in result.get("photoKeys", []) if is_storage_key(key)]
        if keys:
            storage = get_storage()
            for key in keys:
                try:
                    storage.delete(key)
                except Exception:
                    pass  # best-effort purge; row is already gone

        repository.record_audit(user_id, "remove_own_content", metadata=counts)
        return counts

    @app.get("/media/{key:path}", dependencies=[Depends(require_internal_token)])
    def get_media(key: str) -> Response:
        try:
            data, content_type = get_storage().get(key)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Object not found.") from exc
        return Response(content=data, media_type=content_type)

    @app.get("/invites/{code}", dependencies=[Depends(require_internal_token)])
    def resolve_invite(code: str) -> dict[str, object]:
        place = get_repository().get_place_by_invite_code(code)
        if place is None:
            raise HTTPException(status_code=404, detail="Invite not found.")
        return {"placeId": place["id"], "name": place["name"]}

    @app.post(
        "/places/{place_id}/join",
        dependencies=[Depends(require_internal_token)],
    )
    def join_place(place_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, object]:
        try:
            request = JoinPlaceRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc

        repository = get_repository()
        if repository.get_place_privacy(place_id) is None:
            raise HTTPException(status_code=404, detail="Place not found.")

        if request.method == "invite":
            if not request.code:
                raise HTTPException(status_code=400, detail="code is required.")
            target = repository.get_place_by_invite_code(request.code)
            if target is None or target["id"] != place_id:
                raise HTTPException(status_code=403, detail="Invalid invite code.")
            status = "approved"
        elif request.method == "gps":
            if request.lat is None or request.lng is None:
                raise HTTPException(status_code=400, detail="lat/lng are required.")
            geofence = repository.get_place_geofence(place_id)
            if geofence is None or not is_within_geofence(
                geofence, request.lat, request.lng
            ):
                raise HTTPException(status_code=403, detail="Outside the place area.")
            status = "approved"
        else:
            status = "pending"

        return repository.join_place(place_id, request.user_id, status)

    @app.get(
        "/places/{place_id}/members",
        dependencies=[Depends(require_internal_token)],
    )
    def list_members(place_id: str, user_id: str) -> dict[str, object]:
        authorize_admin(place_id, user_id)
        return {"members": get_repository().list_members(place_id)}

    @app.post(
        "/places/{place_id}/members/{member_user_id}",
        dependencies=[Depends(require_internal_token)],
    )
    def update_member(
        place_id: str,
        member_user_id: str,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, object]:
        try:
            request = MemberStatusRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc

        authorize_admin(place_id, request.user_id)
        get_repository().set_member_status(place_id, member_user_id, request.status)
        return {"ok": True}

    @app.get(
        "/places/{place_id}/export",
        dependencies=[Depends(require_internal_token)],
    )
    def export_place(place_id: str, user_id: str) -> dict[str, object]:
        authorize_admin(place_id, user_id)
        return get_repository().get_place_state(place_id)

    @app.delete(
        "/places/{place_id}/animals/{animal_id}",
        dependencies=[Depends(require_internal_token)],
    )
    def admin_delete_animal(
        place_id: str,
        animal_id: str,
        user_id: str,
    ) -> dict[str, object]:
        repository = get_repository()
        authorize_admin(place_id, user_id)
        keys = [
            key
            for key in repository.delete_animal(place_id, animal_id)
            if is_storage_key(key)
        ]
        if keys:
            storage = get_storage()
            for key in keys:
                try:
                    storage.delete(key)
                except Exception:
                    pass
        repository.record_audit(
            user_id,
            "admin_delete_animal",
            target_type="animal",
            target_id=animal_id,
        )
        return {"ok": True}

    @app.post(
        "/places/{place_id}/animals/{animal_id}/names",
        dependencies=[Depends(require_internal_token)],
    )
    def suggest_name(
        place_id: str,
        animal_id: str,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, object]:
        try:
            request = NameRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc
        authorize_place(place_id, request.user_id, require_write=True)
        get_repository().suggest_name(
            place_id, animal_id, request.user_id, request.name.strip()
        )
        return {"ok": True}

    @app.get(
        "/places/{place_id}/animals/{animal_id}/names",
        dependencies=[Depends(require_internal_token)],
    )
    def list_names(
        place_id: str,
        animal_id: str,
        user_id: Optional[str] = None,
    ) -> dict[str, object]:
        authorize_place(place_id, user_id, require_write=False)
        repository = get_repository()
        membership = repository.get_membership(place_id, user_id) if user_id else None
        can_promote = bool(
            membership
            and membership.get("role") == "admin"
            and membership.get("status") == "approved"
        )
        return {
            "suggestions": repository.list_name_suggestions(place_id, animal_id),
            "canPromote": can_promote,
        }

    @app.post(
        "/places/{place_id}/animals/{animal_id}/names/promote",
        dependencies=[Depends(require_internal_token)],
    )
    def promote_name(
        place_id: str,
        animal_id: str,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, object]:
        try:
            request = NameRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc
        authorize_admin(place_id, request.user_id)
        get_repository().promote_name(place_id, animal_id, request.name.strip())
        return {"ok": True}

    @app.post(
        "/places/{place_id}/reports",
        dependencies=[Depends(require_internal_token)],
    )
    def create_report(
        place_id: str,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, object]:
        try:
            request = ReportRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc
        authorize_place(place_id, request.user_id, require_write=True)
        note = request.note.strip() if request.note else None
        get_repository().create_report(
            place_id,
            request.target_type,
            request.target_id,
            request.user_id,
            request.reason,
            note,
        )
        return {"ok": True}

    @app.get(
        "/places/{place_id}/reports",
        dependencies=[Depends(require_internal_token)],
    )
    def list_reports(
        place_id: str,
        user_id: str,
    ) -> dict[str, object]:
        authorize_admin(place_id, user_id)
        return {"reports": get_repository().list_reports(place_id, "open")}

    @app.post(
        "/places/{place_id}/reports/{report_id}",
        dependencies=[Depends(require_internal_token)],
    )
    def resolve_report(
        place_id: str,
        report_id: str,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, object]:
        try:
            request = ResolveReportRequest.model_validate(payload)
        except ValidationError as exc:
            raise RequestValidationError(exc.errors()) from exc
        authorize_admin(place_id, request.user_id)
        get_repository().resolve_report(
            place_id, report_id, request.user_id, request.status
        )
        return {"ok": True}

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
        if not app.state.rate_limiter.allow(user_id):
            raise HTTPException(
                status_code=429, detail="Too many requests. Try again shortly."
            )
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
