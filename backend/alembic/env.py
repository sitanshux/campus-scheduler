"""
Alembic environment configuration.

Reads MIGRATION_DATABASE_URL from environment (never hardcoded).
The migration role (app_migrator) has CREATE/ALTER/DROP privileges
but cannot read application data.  The runtime role (app_api) is
never used for migrations.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool, text

# Add the project root to sys.path so we can import app modules
_project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_project_root))

# Load .env for migration database URL
from dotenv import load_dotenv

load_dotenv(_project_root / ".env")

# Alembic Config object
config = context.config

# Setup logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url with MIGRATION_DATABASE_URL from env
migration_url = os.environ.get("MIGRATION_DATABASE_URL", "")
if migration_url:
    config.set_main_option("sqlalchemy.url", migration_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL to stdout."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

