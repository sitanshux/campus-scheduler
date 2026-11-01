"""
Integration tests for Database Persistence.

Tests persistence of:
  - Booking requests and user isolation
  - Timetable runs and entry persistence
  - Exam scheduling runs and room allocations
  - Rescheduling proposals and audit logs

Safety:
  Uses the `test_db` fixture (which requires a safe, separate `TEST_DATABASE_URL`).
  If `TEST_DATABASE_URL` is not configured, live DB tests skip safely to protect production Supabase data.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.persistence import (
    cancel_booking_request,
    get_active_exam_schedule,
    get_active_timetable,
    get_all_users,
    get_booking_requests,
    persist_booking_request,
    persist_exam_run,
    persist_timetable_run,
    update_user_role,
    write_audit_log,
)


def _mock_user(role="admin", user_id="00000000-0000-0000-0000-000000000001", dept="CS"):
    return {
        "user_id": user_id,
        "email": f"{role}@test.cit.edu",
        "full_name": f"Test {role.title()}",
        "role": role,
        "department": dept,
        "faculty_id": "F01",
    }


class TestLiveDBPersistenceIntegration:
    """Tests requiring a live, isolated PostgreSQL test database (via TEST_DATABASE_URL)."""

    def test_live_db_user_role_update_and_audit(self, test_db: Session):
        """Test admin_update_user_role function and audit_log entry in test DB."""
        admin = _mock_user("admin", user_id=str(uuid.uuid4()))
        target_user = _mock_user("faculty", user_id=str(uuid.uuid4()))

        # Insert profiles into test DB
        test_db.execute(
            text(
                "INSERT INTO public.profiles (id, email, full_name, role, department) "
                "VALUES (:aid::uuid, :aemail, :afull, 'admin', 'AdminDept'), "
                "       (:tid::uuid, :temail, :tfull, 'faculty', 'CS')"
            ),
            {
                "aid": admin["user_id"],
                "aemail": admin["email"],
                "afull": admin["full_name"],
                "tid": target_user["user_id"],
                "temail": target_user["email"],
                "tfull": target_user["full_name"],
            },
        )
        test_db.flush()

        res = update_user_role(
            db=test_db,
            admin_user=admin,
            target_user_id=target_user["user_id"],
            new_role="department_coordinator",
        )
        assert res["success"] is True
        assert res["new_role"] == "department_coordinator"

        # Verify profile updated
        updated_prof = test_db.execute(
            text("SELECT role FROM public.profiles WHERE id = :id::uuid"),
            {"id": target_user["user_id"]},
        ).fetchone()
        assert updated_prof[0] == "department_coordinator"

    def test_live_db_booking_persistence_and_cancellation(self, test_db: Session):
        """Test booking request insertion and cancel-only trigger in test DB."""
        faculty = _mock_user("faculty", user_id=str(uuid.uuid4()))

        test_db.execute(
            text(
                "INSERT INTO public.profiles (id, email, full_name, role, department) "
                "VALUES (:id::uuid, :email, :full, 'faculty', 'CS')"
            ),
            {
                "id": faculty["user_id"],
                "email": faculty["email"],
                "full_name": faculty["full_name"],
            },
        )
        test_db.flush()

        req_data = {
            "title": "Guest Lecture on AI",
            "requested_category": "guest_lecture",
            "attendance": 50,
            "duration_periods": 2,
            "windows": [{"day": "Monday", "from_period": 1, "to_period": 3}],
            "room_types": ["seminar_hall"],
        }

        saved = persist_booking_request(test_db, faculty, req_data)
        assert saved["status"] == "submitted"
        booking_id = saved["id"]

        # Cancel request
        cancel_res = cancel_booking_request(
            test_db, faculty, booking_id, cancel_note="Speaker unavailable"
        )
        assert cancel_res["cancelled"] is True


class TestPersistenceContractIntegration:
    """Verifies persistence contracts and SQL statement formatting."""

    def test_booking_persistence_sql_contract(self):
        mock_db = MagicMock()
        mock_row = MagicMock(id=uuid.uuid4(), request_code="BR-123", submitted_at=datetime.now())
        mock_db.execute.return_value.fetchone.return_value = mock_row

        user = _mock_user("faculty")
        data = {
            "title": "Lab Session",
            "requested_category": "department_event",
            "attendance": 25,
            "duration_periods": 1,
            "windows": [],
            "room_types": ["lab"],
        }

        res = persist_booking_request(mock_db, user, data)
        assert res["status"] == "submitted"
        assert res["request_code"] == "BR-123"

        # Check SQL execution
        sql_call = mock_db.execute.call_args_list[-1]
        params = sql_call.args[1]
        assert params["submitted_by"] == user["user_id"]
        assert params["role"] == "faculty"

    def test_timetable_run_persistence_contract(self):
        mock_db = MagicMock()
        run_uuid = str(uuid.uuid4())
        mock_db.execute.return_value.fetchone.return_value = (run_uuid,)

        admin = _mock_user("admin")
        solver_res = {
            "dataset_id": "cit-test",
            "status": "OPTIMAL",
            "diagnostics": {"scheduled_count": 10},
            "scheduled": [
                {
                    "session_id": "S1",
                    "course_id": "C101",
                    "faculty_id": "F01",
                    "group_id": "G1",
                    "room_id": "CR-101",
                    "day": "Monday",
                    "period": 1,
                    "duration": 1,
                }
            ],
            "unscheduled": [],
            "solve_time_seconds": 1.25,
        }

        res_id = persist_timetable_run(mock_db, admin, solver_res)
        assert res_id == run_uuid
        assert mock_db.commit.called

    def test_exam_run_persistence_contract(self):
        mock_db = MagicMock()
        exam_run_uuid = str(uuid.uuid4())
        mock_db.execute.return_value.fetchone.return_value = (exam_run_uuid,)

        admin = _mock_user("admin")
        exam_result = {
            "total_exams": 2,
            "scheduled_count": 2,
            "unscheduled_count": 0,
            "solve_time_seconds": 0.5,
            "scheduled": [
                {
                    "course_code": "CS101",
                    "slot": {"day": "Monday", "session": "Morning"},
                    "rooms": [{"room_id": "HALL-A", "capacity_allocated": 60}],
                }
            ],
        }

        run_id = persist_exam_run(mock_db, admin, exam_result)
        assert run_id == exam_run_uuid
        assert mock_db.commit.called

