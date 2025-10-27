from functools import lru_cache
from pathlib import Path
import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def get_default_data_dir() -> str:
    """Get platform-specific data directory for LexAI."""
    if os.name == 'nt':  # Windows
        base = os.getenv('APPDATA', os.path.expanduser('~'))
        return str(Path(base) / 'lexai')
    elif os.uname().sysname == 'Darwin':  # macOS
        return str(Path.home() / 'Library' / 'Application Support' / 'lexai')
    else:  # Linux/Unix
        xdg_data = os.getenv('XDG_DATA_HOME', str(Path.home() / '.local' / 'share'))
        return str(Path(xdg_data) / 'lexai')


class Settings(BaseSettings):
    qdrant_host: str = Field(default_factory=lambda: str(Path(get_default_data_dir()) / "qdrant"), alias="QDRANT_HOST")
    embedding_model_name: str = Field(default="all-MiniLM-L6-v2", alias="EMBEDDING_MODEL_NAME")
    upload_dir: str = Field(default_factory=lambda: str(Path(get_default_data_dir()) / "uploads"), alias="LEXAI_UPLOAD_DIR")

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
