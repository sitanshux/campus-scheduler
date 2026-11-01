"""
Integration tests for JWT Authentication and Verification.

Tests real cryptographic token verification through the FastAPI HTTP pipeline.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from tests.integration.conftest import create_integration_token


class TestJWTAuthIntegration:
    """End-to-end integration tests for Supabase ES256 JWT authentication."""

    def test_missing_auth_header_returns_401(self, client: TestClient):
        response = client.get("/api/me")
        assert response.status_code == 401
        assert "Missing" in response.json()["detail"] or "Not authenticated" in response.json()["detail"]

    def test_malformed_token_returns_401(self, client: TestClient):
        response = client.get("/api/me", headers={"Authorization": "Bearer not-a-valid-jwt-token"})
        assert response.status_code == 401

    def test_expired_token_returns_401(self, client: TestClient):
        expired_token = create_integration_token(exp_seconds=-300)
        response = client.get("/api/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert response.status_code == 401
        assert "expired" in response.json()["detail"].lower()

    def test_wrong_issuer_returns_401(self, client: TestClient):
        wrong_iss_token = create_integration_token(iss="https://malicious-attacker.supabase.co/auth/v1")
        response = client.get("/api/me", headers={"Authorization": f"Bearer {wrong_iss_token}"})
        assert response.status_code == 401
        assert "issuer" in response.json()["detail"].lower()

    def test_wrong_audience_returns_401(self, client: TestClient):
        wrong_aud_token = create_integration_token(aud="not-authenticated")
        response = client.get("/api/me", headers={"Authorization": f"Bearer {wrong_aud_token}"})
        assert response.status_code == 401
        assert "audience" in response.json()["detail"].lower()

    def test_algorithm_confusion_rejected(self, client: TestClient):
        from jose import jwt as j
        now = 1800000000
        payload = {
            "sub": str(uuid.uuid4()),
            "aud": "authenticated",
            "iss": f"{settings.supabase_url}/auth/v1" if settings.supabase_url else "https://test.supabase.co/auth/v1",
            "exp": now + 3600,
        }
        hs256_token = j.encode(payload, "fake-secret-key-at-least-32-chars-long!", algorithm="HS256")
        response = client.get("/api/me", headers={"Authorization": f"Bearer {hs256_token}"})
        assert response.status_code == 401
        assert "algorithm" in response.json()["detail"].lower()

    def test_valid_es256_token_verifies_and_resolves_profile(self, client: TestClient):
        user_id = str(uuid.uuid4())
        valid_token = create_integration_token(sub=user_id, email="prof.test@cit.edu")

        mock_profile = MagicMock()
        mock_profile.full_name = "Prof. Test"
        mock_profile.role = "faculty"
        mock_profile.department = "CS"
        mock_profile.faculty_id = "F-CS-01"

        mock_session = MagicMock()
        mock_session.execute.return_value.fetchone.return_value = mock_profile

        app.dependency_overrides[get_db] = lambda: mock_session
        try:
            response = client.get("/api/me", headers={"Authorization": f"Bearer {valid_token}"})
            assert response.status_code == 200
            data = response.json()
            assert data["user_id"] == user_id
            assert data["email"] == "prof.test@cit.edu"
            assert data["full_name"] == "Prof. Test"
            assert data["role"] == "faculty"
            assert data["department"] == "CS"
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_valid_token_with_missing_profile_returns_403(self, client: TestClient):
        user_id = str(uuid.uuid4())
        valid_token = create_integration_token(sub=user_id)

        mock_session = MagicMock()
        mock_session.execute.return_value.fetchone.return_value = None  # Profile not found

        app.dependency_overrides[get_db] = lambda: mock_session
        try:
            response = client.get("/api/me", headers={"Authorization": f"Bearer {valid_token}"})
            assert response.status_code == 403
            assert "profile not found" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_db, None)
