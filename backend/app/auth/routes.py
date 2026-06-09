from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.blacklist import blacklist
from app.auth.schemas import JwtResponse, LogoutResponse, SignInRequest, SignUpRequest
from app.auth.security import (
    JWTError,
    decode_token,
    hash_password,
    make_token,
    verify_password,
)
from app.db import get_session
from app.models import User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


def _response(user: User) -> JwtResponse:
    token, _ = make_token(user.email)
    return JwtResponse(token=token, roles=[f"ROLE_{user.role.value}"])


@router.post("/signin")
async def signin(
    payload: SignInRequest, session: AsyncSession = Depends(get_session)
) -> JwtResponse:
    user = (
        await session.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return _response(user)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignUpRequest, session: AsyncSession = Depends(get_session)
) -> JwtResponse:
    exists = (
        await session.execute(select(User.id).where(User.email == payload.email))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    user = User(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        password=hash_password(payload.password),
        role=UserRole.USER,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _response(user)


@router.post("/logout")
async def logout(
    authorization: Annotated[str | None, Header()] = None,
) -> LogoutResponse:
    # mirror Java behavior: always 200; if a valid token is present, blacklist it
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
        try:
            claims = decode_token(token)
            exp = int(claims.get("exp", 0))
            ttl = exp - int(datetime.now(timezone.utc).timestamp())
            await blacklist(token, max(ttl, 0))
        except JWTError:
            pass
    return LogoutResponse(message="Logout successful")
