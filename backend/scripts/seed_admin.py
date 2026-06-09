"""Idempotent: create or promote the admin@admin.com account to role=ADMIN.

Usage: `uv run python -m scripts.seed_admin`
"""

import asyncio

from sqlalchemy import select

from app.auth.security import hash_password
from app.db import Base, SessionLocal, engine
from app.models import User, UserRole

ADMIN_EMAIL = "admin@admin.com"
ADMIN_PASSWORD = "admin"


async def main() -> None:
    # ensure tables exist when running against a fresh db
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        ).scalar_one_or_none()
        if user is None:
            session.add(
                User(
                    first_name="Admin",
                    last_name="User",
                    email=ADMIN_EMAIL,
                    password=hash_password(ADMIN_PASSWORD),
                    role=UserRole.ADMIN,
                )
            )
            await session.commit()
            print(f"created {ADMIN_EMAIL} (ADMIN)")
        else:
            user.password = hash_password(ADMIN_PASSWORD)
            user.role = UserRole.ADMIN
            await session.commit()
            print(f"promoted existing {ADMIN_EMAIL} to ADMIN and reset password")


if __name__ == "__main__":
    asyncio.run(main())
