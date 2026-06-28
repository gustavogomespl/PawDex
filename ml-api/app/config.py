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
    internal_token: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str
    s3_secure: bool


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
        internal_token=os.getenv("PAWDEX_INTERNAL_TOKEN", ""),
        s3_endpoint=os.getenv("PAWDEX_S3_ENDPOINT", "minio:9000"),
        s3_access_key=os.getenv("PAWDEX_S3_ACCESS_KEY", "pawdex"),
        s3_secret_key=os.getenv("PAWDEX_S3_SECRET_KEY", "pawdex-minio-secret"),
        s3_bucket=os.getenv("PAWDEX_S3_BUCKET", "pawdex"),
        s3_secure=os.getenv("PAWDEX_S3_SECURE", "false").lower() == "true",
    )
