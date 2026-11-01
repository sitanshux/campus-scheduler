"""
Integration tests for Self-Approval Prevention.

Covers:
  1. Anti-self-approval rule for rescheduling proposals (FastAPI route + engine + DB level).
  2. Booking validation self-approval prevention (approver cannot equal requester).
  3. Two-party administrative separation of duties.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app
from app.rescheduling.engine import _proposals
from tests.integration.conftest import create_integration_token


def _mock_db_with_profile(user_id: str, role: str = "admin", full_name: str = "Test Admin"):
    prof = MagicMock()
    prof.role = role
    prof.department = "CS"
    prof.full_name = full_name
    prof.faculty_id = None

    mock_session = MagicMock()
    mock_session.execute.return_value.fetchone.return_value = prof
    mock_session.execute.return_value.fetchall.return_value = []
    return mock_session


class TestSelfApprovalIntegration:

    def test_admin_cannot_approve_own_reschedule_proposal(self, client: TestClient):
        """Admin A proposes a disruption; Admin A attempting to approve is rejected."""
        admin_a_id = "00000000-0000-0000-0000-000000000001"
        token_a = create_integration_token(sub=admin_a_id, email="admin_a@cit.edu")

        mock_db = _mock_db_with_profile(admin_a_id, role="admin", full_name="Admin Alice")

        # Seed proposal proposed by Admin A
        proposal_id = f"prop-{uuid.uuid4().hex[:8]}"
        _proposals[proposal_id] = {
            "proposal_id": proposal_id,
            "proposed_by": admin_a_id,
            "approved": False,
            "approved_by": None,
            "approved_schedule": [],
            "schedule": [],
            "changes": [],
            "diagnostics": {},
        }

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            # Admin A attempts to self-approve
            approve_res = client.post(
                "/api/reschedule/approve",
                params={"proposal_id": proposal_id},
                headers={"Authorization": f"Bearer {token_a}"},
            )

            # Must fail with 400 forbidding self-approval
            assert approve_res.status_code == 400
            assert "cannot approve your own" in approve_res.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_different_admin_can_approve_reschedule_proposal(self, client: TestClient):
        """Admin A proposes; Admin B (different admin) approves -> Succeeds."""
        admin_a_id = "00000000-0000-0000-0000-000000000001"
        admin_b_id = "00000000-0000-0000-0000-000000000002"

        token_b = create_integration_token(sub=admin_b_id, email="admin_b@cit.edu")
        mock_db_b = _mock_db_with_profile(admin_b_id, role="admin", full_name="Admin Bob")

        # Seed proposal proposed by Admin A
        proposal_id = f"prop-{uuid.uuid4().hex[:8]}"
        _proposals[proposal_id] = {
            "proposal_id": proposal_id,
            "proposed_by": admin_a_id,
            "approved": False,
            "approved_by": None,
            "approved_schedule": [{"session_id": "S1", "room_id": "CR-101"}],
            "schedule": [],
            "changes": [],
            "diagnostics": {},
        }

        app.dependency_overrides[get_db] = lambda: mock_db_b
        try:
            approve_res = client.post(
                "/api/reschedule/approve",
                params={"proposal_id": proposal_id},
                headers={"Authorization": f"Bearer {token_b}"},
            )

            assert approve_res.status_code == 200
            assert approve_res.json()["approved"] is True
            assert approve_res.json()["approved_by"] == admin_b_id
        finally:
            app.dependency_overrides.pop(get_db, None)

    def test_booking_validation_self_approval_prevented(self, client: TestClient):
        """Booking approver cannot approve their own booking request."""
        admin_id = "00000000-0000-0000-0000-000000000001"
        token = create_integration_token(sub=admin_id, email="admin@cit.edu")
        mock_db = _mock_db_with_profile(admin_id, role="admin")

        booking_req = {
            "id": "BR-SELF-01",
            "title": "Admin Self Booking",
            "requester": admin_id,  # Requester is the admin themselves
            "role": "admin",
            "requested_category": "institute_event",
            "attendance": 20,
            "duration_periods": 1,
            "windows": [{"day": "Monday", "from_period": 1, "to_period": 2}],
            "room_types": ["seminar_hall"],
        }

        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            res = client.post(
                "/api/bookings/validate",
                json=booking_req,
                headers={"Authorization": f"Bearer {token}"},
            )
            assert res.status_code == 200
            decision = res.json()
            assert decision["status"] == "rejected" or any(
                "self" in r.lower() or "approv" in r.lower() for r in decision.get("reasons", [])
            )
        finally:
            app.dependency_overrides.pop(get_db, None)
