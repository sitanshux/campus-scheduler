"""
Application settings loaded from environment variables.

All secrets and connection strings come from .env (never hardcoded).
See .env.example for the full list of variables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project root (two levels up from this file)
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(_ENV_PATH)


def _env(key: str, default: str = "") -> str:
    """Read an env var, stripping whitespace."""
    return os.environ.get(key, default).strip()


_ALLOWED_JWT_ALGORITHMS = frozenset({"RS256", "HS256", "ES256"})


@dataclass(frozen=True)
class Settings:
    """Immutable application settings.

    These are resolved once at import time. Tests can monkeypatch
    ``app.core.config.settings`` or environment variables before import.
    """

    # ── Supabase project ────────────────────────────────
    supabase_url: str = field(default_factory=lambda: _env("SUPABASE_URL"))

    # ── JWT verification ────────────────────────────────
    jwt_algorithm: str = field(
        default_factory=lambda: _env("JWT_ALGORITHM", "RS256")
    )
    supabase_jwt_secret: str = field(
        default_factory=lambda: _env("SUPABASE_JWT_SECRET")
    )

    # ── Database connections ────────────────────────────
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL"))
    migration_database_url: str = field(
        default_factory=lambda: _env("MIGRATION_DATABASE_URL")
    )
    test_database_url: str = field(
        default_factory=lambda: _env("TEST_DATABASE_URL")
    )

    # ── Gemini LLM Configuration ────────────────────────
    gemini_api_key: str = field(
        default_factory=lambda: _env("GEMINI_API_KEY")
    )
    gemini_model: str = field(
        default_factory=lambda: _env("GEMINI_MODEL", "gemini-2.5-flash")
    )

    # ── Demo mode (hackathon judging) ───────────────────
    demo_mode: bool = field(
        default_factory=lambda: _env("DEMO_MODE", "false").lower() in ("true", "1", "yes")
    )

    def __post_init__(self) -> None:
        """Validate settings at construction time (fail-fast)."""
        if self.jwt_algorithm and self.jwt_algorithm not in _ALLOWED_JWT_ALGORITHMS:
            raise ValueError(
                f"JWT_ALGORITHM must be one of {sorted(_ALLOWED_JWT_ALGORITHMS)}, "
                f"got '{self.jwt_algorithm}'"
            )


# Singleton — imported as ``from app.core.config import settings``
settings = Settings()

