"""
Synchronous SQLAlchemy database engine and session management.

Design (from v4 plan §1.2):
- ``get_db()`` yields a plain session for unauthenticated/public routes.
- ``get_db_for_user()`` sets transaction-local GUC claims so RLS policies
  can identify the caller.  Used for all authenticated endpoints.
- ``set_config(..., ..., true)`` makes settings local to the current
  transaction, safe with PgBouncer transaction-mode pooling.

The engine is created lazily on first use (not at import time) so that
unit tests never need a live database — they mock the auth dependencies
and never call ``get_db()``.
"""

from __future__ import annotations

import logging
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Engine (lazy singleton) ─────────────────────────────

_engine = None
_SessionLocal = None


def _get_engine():
    """Create the engine on first call.  Subsequent calls return the same engine."""
    global _engine, _SessionLocal
    if _engine is None:
        if not settings.database_url:
            raise RuntimeError(
                "DATABASE_URL is not configured. "
                "Set it in .env or as an environment variable."
            )
        _engine = create_engine(
            settings.database_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            connect_args={"sslmode": "require"},
        )
        _SessionLocal = sessionmaker(
            bind=_engine,
            autocommit=False,
            autoflush=False,
        )
        logger.info("Database engine created (pool_size=5, sslmode=require)")
    return _engine


def _get_session_factory() -> sessionmaker:
    """Return the session factory, initialising the engine if needed."""
    _get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


# ── FastAPI Dependencies ────────────────────────────────


def get_db() -> Generator[Session, None, None]:
    """Yield a database session.  Used for public / unauthenticated routes.

    The ``finally`` block issues an explicit ``rollback()`` before
    ``close()`` to guarantee that any in-progress transaction is
    terminated.  This is critical with PgBouncer transaction-mode
    pooling: ``set_config(..., ..., true)`` claims are only cleared
    when the transaction ends, so we must ensure no lingering
    transaction leaks claims to the next request that gets the same
    pooled connection.
    """
    factory = _get_session_factory()
    db = factory()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def get_db_for_user(user: dict, db: Session) -> Session:
    """Set transaction-local claims so RLS policies can authorise.

    Parameters
    ----------
    user : dict
        The verified user dict (from ``get_verified_user``).
    db : Session
        An active SQLAlchemy session (from ``get_db``).

    Returns
    -------
    Session
        The same session, with GUC claims set.
    """
    db.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": user["user_id"]},
    )
    db.execute(
        text("SELECT set_config('app.current_user_role', :role, true)"),
        {"role": user["role"]},
    )
    return db

