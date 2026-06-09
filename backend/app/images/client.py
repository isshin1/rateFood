"""MinIO storage helpers. Thin sync client wrapped for async use via run_in_threadpool."""

from datetime import timedelta
from io import BytesIO
from urllib.parse import urlparse

from fastapi.concurrency import run_in_threadpool
from minio import Minio
from minio.error import S3Error

from app.config import get_settings


class ImageStoreError(RuntimeError):
    pass


_client: Minio | None = None
_bucket_ready = False


def _get_client() -> Minio:
    global _client
    if _client is None:
        s = get_settings()
        parsed = urlparse(s.minio_url)
        host = parsed.netloc or parsed.path
        secure = parsed.scheme == "https"
        _client = Minio(
            host,
            access_key=s.minio_access_key,
            secret_key=s.minio_secret_key,
            secure=secure,
        )
    return _client


def _ensure_bucket_sync() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    s = get_settings()
    c = _get_client()
    if not c.bucket_exists(s.minio_bucket):
        c.make_bucket(s.minio_bucket)
    _bucket_ready = True


async def ensure_bucket() -> None:
    await run_in_threadpool(_ensure_bucket_sync)


def _put_object_sync(key: str, data: bytes, content_type: str) -> str:
    s = get_settings()
    c = _get_client()
    try:
        c.put_object(
            s.minio_bucket,
            key,
            BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
    except S3Error as e:
        raise ImageStoreError(f"minio put failed: {e}") from e
    return key


async def put_object(key: str, data: bytes, content_type: str) -> str:
    await ensure_bucket()
    return await run_in_threadpool(_put_object_sync, key, data, content_type)


def _presign_get_sync(key: str, expires_seconds: int) -> str:
    s = get_settings()
    c = _get_client()
    try:
        return c.presigned_get_object(
            s.minio_bucket, key, expires=timedelta(seconds=expires_seconds)
        )
    except S3Error as e:
        raise ImageStoreError(f"minio presign failed: {e}") from e


async def presign_get(key: str, expires_seconds: int = 3000) -> str:
    return await run_in_threadpool(_presign_get_sync, key, expires_seconds)
