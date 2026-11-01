"""
Integration test fixtures and configuration.

Ensures:
  1. A separate test database (TEST_DATABASE_URL) is used for live DB integration tests.
  2. Production Supabase databases are NEVER touched by tests.
  3. Real cryptographic ES256 JWT tokens are generated and verified.
  4. FastAPI TestClient is configured for end-to-end HTTP request testing.
"""

from __future__ import annotations

import base64
import os
import time
from typing import Generator
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.main import app


# ═══════════════════════════════════════════════════════
# 1. Cryptographic ES256 Keypair & Token Generation
# ═══════════════════════════════════════════════════════

try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    from jose import jwt as jose_jwt

    _private_key = ec.generate_private_key(ec.SECP256R1())
    _public_key = _private_key.public_key()
    _pub_nums = _public_key.public_numbers()

    def _int_to_b64(val: int, length: int = 32) -> str:
        b = val.to_bytes(length, byteorder="big")
        return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

    _test_jwk = {
        "kty": "EC",
        "crv": "P-256",
        "x": _int_to_b64(_pub_nums.x),
        "y": _int_to_b64(_pub_nums.y),
        "kid": "integration-test-kid-001",
        "alg": "ES256",
        "use": "sig",
    }
    _pem_bytes = _private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    _HAS_CRYPTO = True
except ImportError:
    _HAS_CRYPTO = False
    _test_jwk = {}
    _pem_bytes = b""


def create_integration_token(
    sub: str = "00000000-0000-0000-0000-000000000001",
    email: str = "admin@test.cit.edu",
    role: str = "admin",
    exp_seconds: int = 3600,
    iss: str | None = None,
    aud: str = "authenticated",
    kid: str = "integration-test-kid-001",
    algorithm: str = "ES256",
) -> str:
    """Create a real cryptographically signed JWT token for integration testing."""
    now = int(time.time())
    issuer = iss or f"{settings.supabase_url}/auth/v1" if settings.supabase_url else "https://test.supabase.co/auth/v1"

    payload = {
        "sub": sub,
        "email": email,
        "role": "authenticated",  # Supabase client token role
        "aud": aud,
        "iss": issuer,
        "iat": now,
        "exp": now + exp_seconds,
    }
    headers = {"kid": kid, "alg": algorithm}
    return jose_jwt.encode(payload, _pem_bytes, algorithm="ES256", headers=headers)


# ═══════════════════════════════════════════════════════
# 2. Database Safety Checks & Test DB Fixture
# ═══════════════════════════════════════════════════════

TEST_DB_URL = os.environ.get("TEST_DATABASE_URL") or settings.test_database_url


def is_production_url(url: str) -> bool:
    """Verify that a database URL is definitely not production Supabase."""
    if not url:
        return False
    lower = url.lower()
    dangerous_patterns = [
        "supabase.co",
        "pooler.supabase.com",
        "aws-0-ap-south-1",
        "supabase.in",
    ]
    return any(p in lower for p in dangerous_patterns)


@pytest.fixture(scope="session")
def test_db_engine():
    """Create a test database engine if TEST_DATABASE_URL is safely configured."""
    if not TEST_DB_URL:
        pytest.skip("TEST_DATABASE_URL is not set. Skipping live database integration tests.")

    if is_production_url(TEST_DB_URL):
        pytest.fail(
            "SAFETY VIOLATION: TEST_DATABASE_URL points to a production Supabase instance! "
            "Tests are strictly forbidden from running against production."
        )

    try:
        engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return engine
    except Exception as exc:
        pytest.skip(f"Could not connect to TEST_DATABASE_URL ({TEST_DB_URL}): {exc}")


@pytest.fixture
def test_db(test_db_engine) -> Generator[Session, None, None]:
    """Provide a transactional test database session with automatic rollback."""
    connection = test_db_engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(bind=connection)
    session = SessionLocal()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


# ═══════════════════════════════════════════════════════
# 3. HTTP TestClient Fixture
# ═══════════════════════════════════════════════════════


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """FastAPI TestClient with patched JWKS endpoint returning test EC keys."""
    from app.core import auth

    with patch.object(auth, "_fetch_jwks", return_value={_test_jwk["kid"]: _test_jwk}):
        auth._jwks_cache = {
            "keys": {_test_jwk["kid"]: _test_jwk},
            "fetched_at": time.time(),
        }
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c

