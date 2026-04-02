from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app import __version__


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    APP_NAME: str = "LocalDocs Hub"
    APP_VERSION: str = __version__
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 4320

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/localdocs"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:4321"]

    # File watching
    WATCHDEBOUNCE_SECONDS: float = 0.5
    FILESYSTEM_ROOT: str = ""

    # Layer 4 operations
    BACKUP_DIR: str = ""

    # Layer 5 replica storage
    REPLICA_ROOT: str = ""

    # Layer 5 thin-agent distributions
    AGENT_DIST_DIR: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
