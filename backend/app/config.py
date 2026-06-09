from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # In containers we inject env vars via docker-compose env_file (project root .env).
    # Avoid coupling settings loading to a file path inside the image.
    model_config = SettingsConfigDict(extra="ignore")

    port: int = 8081

    db_host: str = "localhost"
    db_port: int = 5434
    db_user: str = "candle_user"
    db_password: str = "candle_password"
    db_database: str = "food_db"

    jwt_signing_key: str
    jwt_ttl_hours: int = 24

    redis_url: str = "redis://localhost:6379/0"

    minio_url: str = "http://localhost:9000"
    minio_access_key: str = "user"
    minio_secret_key: str = "password"
    minio_bucket: str = "ratefood"

    cors_allowed_origin_regex: str = r"http://localhost:\d+|https?://[^/]+\.kushy\.dev"

    google_places_api_key: str
    # Programmable Search Engine ("cx") for the dish image fallback.
    # Create one at https://programmablesearchengine.google.com, enable Image search,
    # set "Search the entire web". Reuses google_places_api_key for billing.
    google_cse_id: str | None = None

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_database}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
