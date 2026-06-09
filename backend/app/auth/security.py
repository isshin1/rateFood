import base64
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

_settings = get_settings()
_signing_key = base64.b64decode(_settings.jwt_signing_key)
_algorithm = "HS256"

# bcrypt's 72-byte limit is hit silently if you pass a longer password; reject explicitly.
_BCRYPT_MAX_BYTES = 72


def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")
    if len(pw) > _BCRYPT_MAX_BYTES:
        raise ValueError("password too long")
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    pw = plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]
    try:
        return bcrypt.checkpw(pw, hashed.encode("utf-8"))
    except ValueError:
        return False


def make_token(email: str) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(hours=_settings.jwt_ttl_hours)
    payload = {"sub": email, "exp": expires, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, _signing_key, algorithm=_algorithm), expires


def decode_token(token: str) -> dict:
    return jwt.decode(token, _signing_key, algorithms=[_algorithm])


__all__ = ["hash_password", "verify_password", "make_token", "decode_token", "JWTError"]
