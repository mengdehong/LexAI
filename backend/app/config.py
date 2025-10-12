from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    qdrant_host: str = Field(default="http://localhost:6333", alias="QDRANT_HOST")
    embedding_model_name: str = Field(default="all-MiniLM-L6-v2", alias="EMBEDDING_MODEL_NAME")
    upload_dir: str = Field(default="/tmp/lexai_uploads", alias="LEXAI_UPLOAD_DIR")

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
