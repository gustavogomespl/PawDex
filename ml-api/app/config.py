from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


@dataclass(frozen=True)
class Settings:
    database_url: str
    yolo_model: str
    yolo_confidence: float
    allowed_origins: tuple[str, ...]


def parse_origins(raw: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


def load_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL", "postgresql://pawdex:pawdex@127.0.0.1:5432/pawdex"
        ),
        yolo_model=os.getenv("PAWDEX_YOLO_MODEL", "yolo11n.pt"),
        yolo_confidence=float(os.getenv("PAWDEX_YOLO_CONFIDENCE", "0.35")),
        allowed_origins=parse_origins(
            os.getenv("PAWDEX_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
        ),
    )
