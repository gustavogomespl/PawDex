from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    yolo_model: str
    yolo_confidence: float


def load_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL", "postgresql://pawdex:pawdex@127.0.0.1:5432/pawdex"
        ),
        yolo_model=os.getenv("PAWDEX_YOLO_MODEL", "yolo11n.pt"),
        yolo_confidence=float(os.getenv("PAWDEX_YOLO_CONFIDENCE", "0.35")),
    )
