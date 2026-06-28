from __future__ import annotations

from io import BytesIO
from typing import Protocol


class ObjectStorage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, key: str) -> tuple[bytes, str]: ...


class InMemoryObjectStorage:
    """Test/dev double — keeps objects in a dict."""

    def __init__(self) -> None:
        self._objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._objects[key] = (data, content_type)

    def get(self, key: str) -> tuple[bytes, str]:
        if key not in self._objects:
            raise KeyError(key)
        return self._objects[key]


class MinioObjectStorage:
    """S3-compatible storage (MinIO / S3 / R2). Bucket is created on first use."""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        secure: bool = False,
    ) -> None:
        from minio import Minio

        self.bucket = bucket
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            self.bucket,
            key,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    def get(self, key: str) -> tuple[bytes, str]:
        from minio.error import S3Error

        try:
            response = self.client.get_object(self.bucket, key)
        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchBucket"):
                raise KeyError(key) from exc
            raise
        try:
            data = response.read()
            content_type = response.headers.get(
                "Content-Type", "application/octet-stream"
            )
        finally:
            response.close()
            response.release_conn()
        return data, content_type
