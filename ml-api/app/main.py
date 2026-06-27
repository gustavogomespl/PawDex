from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.detection import Detector, UltralyticsYoloDetector, load_image


def create_app(detector_factory: Callable[[], Detector] | None = None) -> FastAPI:
    app = FastAPI(title="PawDex ML API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.detector_factory = detector_factory or UltralyticsYoloDetector
    app.state.detector = None

    def get_detector() -> Detector:
        if app.state.detector is None:
            app.state.detector = app.state.detector_factory()
        return app.state.detector

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "model": "configured"}

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

    return app


app = create_app()
