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
    rate_limit_per_min: int


def parse_origins(raw: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


def env_first(*names: str, default: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return default


def parse_bool(raw: str) -> bool:
    return raw.lower() in ("1", "true", "yes", "on")


def load_settings() -> Settings:
    s3_endpoint = env_first(
        "PAWDEX_S3_ENDPOINT",
        "AWS_ENDPOINT_URL",
        default="minio:9000",
    )
    s3_secure = (
        parse_bool(os.environ["PAWDEX_S3_SECURE"])
        if "PAWDEX_S3_SECURE" in os.environ
        else s3_endpoint.startswith("https://")
    )

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
        s3_endpoint=s3_endpoint,
        s3_access_key=env_first(
            "PAWDEX_S3_ACCESS_KEY",
            "AWS_ACCESS_KEY_ID",
            default="pawdex",
        ),
        s3_secret_key=env_first(
            "PAWDEX_S3_SECRET_KEY",
            "AWS_SECRET_ACCESS_KEY",
            default="pawdex-minio-secret",
        ),
        s3_bucket=env_first(
            "PAWDEX_S3_BUCKET",
            "AWS_S3_BUCKET_NAME",
            default="pawdex",
        ),
        s3_secure=s3_secure,
        rate_limit_per_min=int(os.getenv("PAWDEX_RATE_LIMIT_PER_MIN", "60")),
    )
