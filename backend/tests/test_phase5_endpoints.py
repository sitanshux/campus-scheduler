"""
Unit tests for Phase 5: New Endpoints.

Covers:
  1. GET /api/me: Profile retrieval for authenticated users
  2. GET /api/bookings/my: Retrieval of user's own booking requests
  3. POST /api/bookings/submit: Server-derived identity and role permissions
  4. GET /api/admin/users: Admin-only user listing and 403 enforcement
  5. PUT /api/admin/users/{user_id}/role: Role updates, validation and 403 enforcement
  6. OpenAPI route registrations
"""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.admin.routes import UpdateRoleInput, change_user_role, list_users
from app.bookings.models import BookingRequestIn, TimeWindow
from app.bookings.routes import get_my_booking_requests, submit_booking_request
from app.core.permissions import require_admin
from app.core.persistence import (
    get_all_users,
    get_booking_requests,
    persist_booking_request,
    update_user_role,
)
from app.main import app, get_current_user_profile


# ═══════════════════════════════════════════════════════
# Helpers & Mock Fixtures
# ═══════════════════════════════════════════════════════


def _user(
    role: str = "faculty",
    user_id: str = "00000000-0000-0000-0000-000000000001",
    dept: str | None = "CS",
    full_name: str | None = None,
    email: str | None = None,
) -> dict:
    return {
        "user_id": user_id,
        "email": email or f"{role}@cit.edu",
        "full_name": full_name or f"Dr. {role.capitalize()}",
        "role": role,
        "department": dept,
        "faculty_id": f"F-{user_id[:4]}",
    }


def _sample_booking_request(
    category: str = "guest_lecture",
    spoofed_role: str = "admin",
    spoofed_dept: str = "SpoofedDept",
    spoofed_name: str = "Spoofed Admin",
) -> BookingRequestIn:
    return BookingRequestIn(
        id=str(uuid.uuid4()),
        title="Distinguished Lecture",
        requester=spoofed_name,
        role=spoofed_role,
        department=spoofed_dept,
        requested_category=category,
        attendance=40,
        duration_periods=2,
        windows=[TimeWindow(day="Monday", from_period=2, to_period=4)],
        room_types=["seminar_hall"],
        needs=["projector"],
    )


# ═══════════════════════════════════════════════════════
# 1. GET /api/me Tests
# ═══════════════════════════════════════════════════════


class TestGetMeEndpoint:

    def test_get_me_returns_profile(self):
        user = _user(role="faculty", dept="ECE")
        profile = get_current_user_profile(user=user)
        assert profile["user_id"] == user["user_id"]
        assert profile["email"] == user["email"]
        assert profile["full_name"] == user["full_name"]
        assert profile["role"] == "faculty"
        assert profile["department"] == "ECE"
        assert profile["faculty_id"] == user["faculty_id"]

    def test_get_me_club_user(self):
        club_user = _user(role="club", dept=None, full_name="Coding Club")
        profile = get_current_user_profile(user=club_user)
        assert profile["role"] == "club"
        assert profile["department"] is None
        assert profile["full_name"] == "Coding Club"

    def test_get_me_admin_user(self):
        admin_user = _user(role="admin")
        profile = get_current_user_profile(user=admin_user)
        assert profile["role"] == "admin"


# ═══════════════════════════════════════════════════════
# 2. GET /api/bookings/my Tests
# ═══════════════════════════════════════════════════════


class TestMyBookingsEndpoint:

    def test_my_bookings_calls_persistence_with_user_filter(self):
        mock_db = MagicMock()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.request_code = "BR-TEST"
        mock_row.submitted_at = datetime.now()
        mock_row.submitted_by = uuid.uuid4()
        mock_row.requester_name = "Dr. Test"
        mock_row.role = "faculty"
        mock_row.department = "CS"
        mock_row.requested_category = "guest_lecture"
        mock_row.title = "Test Booking"
        mock_row.attendance = 30
        mock_row.duration_periods = 1
        mock_row.windows = []
        mock_row.room_types = []
        mock_row.needs = []
        mock_row.requested_room = None
        mock_row.mandatory_for_groups = []
        mock_row.series_id = None
        mock_row.cancelled = False
        mock_row.cancelled_at = None
        mock_row.cancel_note = None

        mock_db.execute.return_value.fetchall.return_value = [mock_row]

        user = _user(user_id=str(mock_row.submitted_by))
        res = get_my_booking_requests(user=user, db=mock_db)

        assert len(res) == 1
        assert res[0]["id"] == str(mock_row.id)
        assert res[0]["submitted_by"] == str(mock_row.submitted_by)

    def test_persistence_filters_by_user_id(self):
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchall.return_value = []
        user = _user(user_id="11111111-1111-1111-1111-111111111111")

        get_booking_requests(
            db=mock_db,
            user=user,
            user_id_filter="11111111-1111-1111-1111-111111111111",
        )

        calls = mock_db.execute.call_args_list
        # At least one call should have params with user_id_filter
        found_filter = any(
            "user_id_filter" in call.args[1]
            for call in calls
            if len(call.args) > 1 and isinstance(call.args[1], dict)
        )
        assert found_filter is True


# ═══════════════════════════════════════════════════════
# 3. POST /api/bookings/submit Tests
# ═══════════════════════════════════════════════════════


class TestSubmitBookingEndpoint:

    def test_club_cannot_submit_institute_event(self):
        """Club user attempting to submit an institute_event is blocked with 403."""
        club_user = _user(role="club", dept=None)
        req = _sample_booking_request(category="institute_event")
        mock_db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            submit_booking_request(request=req, user=club_user, db=mock_db)

        assert exc_info.value.status_code == 403
        assert "cannot book category" in exc_info.value.detail.lower()

    def test_server_derived_identity_overrides_client_spoofing(self):
        """Role, department, and full_name in DB come strictly from verified profile."""
        mock_db = MagicMock()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.request_code = "BR-SPOOF"
        mock_row.submitted_at = datetime.now()
        mock_db.execute.return_value.fetchone.return_value = mock_row

        real_user = _user(
            role="faculty",
            user_id="55555555-5555-5555-5555-555555555555",
            dept="Mechanical",
            full_name="Prof. Real Name",
        )

        # Attacker tries to spoof admin role and fake department in request body
        attacker_input = _sample_booking_request(
            category="guest_lecture",
            spoofed_role="admin",
            spoofed_dept="FakeDept",
            spoofed_name="Fake Admin",
        )

        res = persist_booking_request(
            mock_db, real_user, attacker_input.model_dump()
        )
        assert res["status"] == "submitted"

        # Check params sent to SQL query
        calls = mock_db.execute.call_args_list
        insert_call = calls[-1]
        params = insert_call.args[1]

        assert params["submitted_by"] == real_user["user_id"]
        assert params["requester_name"] == "Prof. Real Name"
        assert params["role"] == "faculty"
        assert params["department"] == "Mechanical"


# ═══════════════════════════════════════════════════════
# 4. GET /api/admin/users Tests
# ═══════════════════════════════════════════════════════


class TestAdminListUsers:

    def test_admin_can_list_users(self):
        mock_db = MagicMock()
        u1 = MagicMock()
        u1.id = uuid.uuid4()
        u1.email = "faculty@cit.edu"
        u1.full_name = "Dr. Faculty"
        u1.role = "faculty"
        u1.department = "CS"
        u1.faculty_id = "F01"
        u1.created_at = datetime.now()
        u1.updated_at = datetime.now()

        mock_db.execute.return_value.fetchall.return_value = [u1]
        admin = _user(role="admin")

        res = list_users(admin_user=admin, db=mock_db)
        assert len(res) == 1
        assert res[0]["email"] == "faculty@cit.edu"
        assert res[0]["role"] == "faculty"

    def test_require_admin_blocks_faculty(self):
        faculty = _user(role="faculty")
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=faculty)
        assert exc_info.value.status_code == 403

    def test_require_admin_blocks_club(self):
        club = _user(role="club")
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=club)
        assert exc_info.value.status_code == 403

    def test_require_admin_blocks_dept_coordinator(self):
        coord = _user(role="department_coordinator")
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user=coord)
        assert exc_info.value.status_code == 403


# ═══════════════════════════════════════════════════════
# 5. PUT /api/admin/users/{user_id}/role Tests
# ═══════════════════════════════════════════════════════


class TestAdminUpdateRole:

    def test_admin_updates_role_success(self):
        mock_db = MagicMock()
        # Mock user exists
        mock_db.execute.return_value.fetchone.return_value = MagicMock(id=uuid.uuid4())

        admin = _user(role="admin")
        target_id = str(uuid.uuid4())
        body = UpdateRoleInput(role="department_coordinator")

        res = change_user_role(
            user_id=target_id, body=body, admin_user=admin, db=mock_db
        )

        assert res["success"] is True
        assert res["user_id"] == target_id
        assert res["new_role"] == "department_coordinator"
        assert mock_db.commit.called

    def test_invalid_role_raises_400(self):
        mock_db = MagicMock()
        admin = _user(role="admin")
        target_id = str(uuid.uuid4())
        body = UpdateRoleInput(role="super_god_mode")

        with pytest.raises(HTTPException) as exc_info:
            change_user_role(
                user_id=target_id, body=body, admin_user=admin, db=mock_db
            )
        assert exc_info.value.status_code == 400
        assert "invalid role" in exc_info.value.detail.lower()

    def test_invalid_uuid_format_raises_400(self):
        mock_db = MagicMock()
        admin = _user(role="admin")
        body = UpdateRoleInput(role="faculty")

        with pytest.raises(HTTPException) as exc_info:
            change_user_role(
                user_id="not-a-real-uuid", body=body, admin_user=admin, db=mock_db
            )
        assert exc_info.value.status_code == 400
        assert "invalid user id format" in exc_info.value.detail.lower()

    def test_user_not_found_raises_404(self):
        mock_db = MagicMock()
        # User not found
        mock_db.execute.return_value.fetchone.return_value = None
        admin = _user(role="admin")
        target_id = str(uuid.uuid4())
        body = UpdateRoleInput(role="faculty")

        with pytest.raises(HTTPException) as exc_info:
            change_user_role(
                user_id=target_id, body=body, admin_user=admin, db=mock_db
            )
        assert exc_info.value.status_code == 404


# ═══════════════════════════════════════════════════════
# 6. OpenAPI Route Verification
# ═══════════════════════════════════════════════════════


class TestRouteRegistration:

    def test_all_phase5_routes_registered(self):
        schema = app.openapi()
        paths = schema["paths"]

        assert "/api/me" in paths
        assert "get" in paths["/api/me"]

        assert "/api/bookings/my" in paths
        assert "get" in paths["/api/bookings/my"]

        assert "/api/bookings/submit" in paths
        assert "post" in paths["/api/bookings/submit"]

        assert "/api/admin/users" in paths
        assert "get" in paths["/api/admin/users"]

        assert "/api/admin/users/{user_id}/role" in paths
        assert "put" in paths["/api/admin/users/{user_id}/role"]

