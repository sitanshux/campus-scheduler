"""
Integration tests for User Roles and Authorization Matrix.

Verifies role-based access control end-to-end via FastAPI HTTP client:
Admin, Department Coordinator, Faculty, and Club Representative.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app
from tests.integration.conftest import create_integration_token


def _mock_db_with_profile(role: str, dept: str | None = "CS", full_name: str = "Test User"):
    """Helper to mock database profile resolution."""
    prof = MagicMock()
    prof.role = role
    prof.department = dept
    prof.full_name = full_name
    prof.faculty_id = "F01" if role == "faculty" else None

    mock_session = MagicMock()
    mock_session.execute.return_value.fetchone.return_value = prof
    mock_session.execute.return_value.fetchall.return_value = []
    return mock_session


class TestRoleAuthorizationIntegration:

    def test_admin_can_access_admin_endpoints(self, client: TestClient):
        admin_id = str(uuid.uuid4())
        token = create_integration_token(sub=admin_id, email="admin@cit.edu")
        mock_db = _mock_db_with_profile("admin")

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 200
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_coordinator_cannot_access_admin_endpoints(self, client: TestClient):
        coord_id = str(uuid.uuid4())
        token = create_integration_token(sub=coord_id, email="coord@cit.edu")
        mock_db = _mock_db_with_profile("department_coordinator")

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_faculty_cannot_access_admin_endpoints(self, client: TestClient):
        faculty_id = str(uuid.uuid4())
        token = create_integration_token(sub=faculty_id, email="faculty@cit.edu")
        mock_db = _mock_db_with_profile("faculty")

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_club_cannot_access_admin_endpoints(self, client: TestClient):
        club_id = str(uuid.uuid4())
        token = create_integration_token(sub=club_id, email="club@cit.edu")
        mock_db = _mock_db_with_profile("club", dept=None)

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_coordinator_can_access_full_dataset(self, client: TestClient):
        coord_id = str(uuid.uuid4())
        token = create_integration_token(sub=coord_id, email="coord@cit.edu")
        mock_db = _mock_db_with_profile("department_coordinator")

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.get("/api/dataset/full", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 200
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_faculty_cannot_access_full_dataset(self, client: TestClient):
        faculty_id = str(uuid.uuid4())
        token = create_integration_token(sub=faculty_id, email="faculty@cit.edu")
        mock_db = _mock_db_with_profile("faculty")

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.get("/api/dataset/full", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_club_cannot_submit_above_category_cap(self, client: TestClient):
        club_id = str(uuid.uuid4())
        token = create_integration_token(sub=club_id, email="club@cit.edu")
        mock_db = _mock_db_with_profile("club", dept=None)

        body = {
            "id": str(uuid.uuid4()),
            "title": "Annual Gala",
            "requester": "Club Rep",
            "role": "club",
            "requested_category": "institute_event",  # Exceeds club cap
            "attendance": 100,
            "duration_periods": 2,
            "windows": [{"day": "Monday", "from_period": 1, "to_period": 3}],
            "room_types": ["auditorium"],
        }

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            response = client.post(
                "/api/bookings/submit",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 403
            assert "cannot book category" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_db, None)
