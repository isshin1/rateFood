import redis.asyncio as aioredis

from app.config import get_settings

_settings = get_settings()
_redis: aioredis.Redis | None = None


def _client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(_settings.redis_url, decode_responses=True)
    return _redis


def _key(token: str) -> str:
    return f"jwt:blk:{token}"


async def blacklist(token: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    await _client().setex(_key(token), ttl_seconds, "1")


async def is_blacklisted(token: str) -> bool:
    return bool(await _client().exists(_key(token)))
