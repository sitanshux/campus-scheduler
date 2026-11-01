"""
Tests for the GET /api/dataset/full endpoint.

Verifies that all seven collections are returned with correct record counts
and that the endpoint is read-only (uses the cached dataset loader).

The endpoint requires admin or department_coordinator role — tests use
the ``override_auth`` fixture from conftest.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import dataset_full, app


class TestDatasetFullEndpoint:
    """Verify the /api/dataset/full endpoint."""

    @pytest.fixture()
    def result(self, override_auth):
        return dataset_full(user=override_auth)

    def test_returns_dict(self, result):
        assert isinstance(result, dict)

    def test_has_all_seven_collections(self, result):
        expected = [
            "rooms",
            "faculty",
            "student_groups",
            "courses",
            "sessions",
            "booking_requests",
            "exams",
        ]
        for key in expected:
            assert key in result, f"Missing collection: {key}"

    def test_no_extra_keys(self, result):
        expected = {
            "rooms",
            "faculty",
            "student_groups",
            "courses",
            "sessions",
            "booking_requests",
            "exams",
        }
        assert set(result.keys()) == expected

    def test_rooms_count(self, result):
        assert len(result["rooms"]) == 27

    def test_faculty_count(self, result):
        assert len(result["faculty"]) == 40

    def test_student_groups_count(self, result):
        assert len(result["student_groups"]) == 14

    def test_courses_count(self, result):
        assert len(result["courses"]) == 62

    def test_sessions_count(self, result):
        assert len(result["sessions"]) == 189

    def test_booking_requests_count(self, result):
        assert len(result["booking_requests"]) == 25

    def test_exams_count(self, result):
        assert len(result["exams"]) == 41

    def test_rooms_have_id_field(self, result):
        for room in result["rooms"]:
            assert "id" in room

    def test_faculty_have_id_field(self, result):
        for fac in result["faculty"]:
            assert "id" in fac

    def test_sessions_have_id_field(self, result):
        for sess in result["sessions"]:
            assert "id" in sess

    def test_route_registered(self):
        openapi_schema = app.openapi()
        assert "/api/dataset/full" in openapi_schema["paths"]

    def test_existing_endpoints_still_registered(self):
        """Ensure existing routes were not broken."""
        openapi_schema = app.openapi()
        assert "/api/dataset" in openapi_schema["paths"]
        assert "/api/dataset/summary" in openapi_schema["paths"]
        assert "/api/health" in openapi_schema["paths"]
