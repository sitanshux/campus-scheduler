"""
Unit and integration tests for Phase 4: Database Persistence.

Tests cover:
- Timetable run and entry persistence
- Booking request submission and cancellation (trigger-protected)
- Booking run and decision persistence
- Examination run, entries and multi-room allocation persistence
- Rescheduling proposal, changes and anti-self-approval persistence
- Audit log persistence and retrieval
- Transaction rollback behavior on failure
- Transaction-local user claims verification for RLS
"""

from __future__ import annotations

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.persistence import (
    approve_reschedule_proposal_in_db,
    cancel_booking_request,
    get_active_exam_schedule,
    get_active_timetable,
    get_audit_logs,
    get_booking_requests,
    get_latest_booking_run,
    get_reschedule_proposal_from_db,
    persist_booking_request,
    persist_booking_run,
    persist_exam_run,
    persist_reschedule_proposal,
    persist_timetable_run,
    write_audit_log,
)


def _make_user(role="admin", user_id="00000000-0000-0000-0000-000000000001"):
    return {
        "user_id": user_id,
        "email": f"{role}@test.cit.edu",
        "full_name": f"Test {role.title()}",
        "role": role,
        "department": "CS",
        "faculty_id": "F01",
    }


# ═══════════════════════════════════════════════════════
# 1. Audit Log Persistence Tests
# ═══════════════════════════════════════════════════════


class TestAuditLogPersistence:

    def test_write_audit_log_success(self):
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = ["11111111-1111-1111-1111-111111111111"]

        user = _make_user("admin")
        log_id = write_audit_log(
            mock_db,
            user,
            action="test_action",
            target_type="test_target",
            target_id="tgt-123",
            detail={"key": "val"},
        )
        assert log_id == "11111111-1111-1111-1111-111111111111"
        assert mock_db.execute.call_count >= 1

    def test_get_audit_logs(self):
        mock_db = MagicMock()
        mock_row = MagicMock()
        mock_row.id = uuid.uuid4()
        mock_row.timestamp = "2026-11-01T04:00:00Z"
        mock_row.actor_id = uuid.uuid4()
        mock_row.action = "generate_timetable"
        mock_row.target_type = "timetable_run"
        mock_row.target_id = "run-1"
        mock_row.detail = {"status": "OPTIMAL"}
        mock_db.execute.return_value.fetchall.return_value = [mock_row]

        user = _make_user("admin")
        logs = get_audit_logs(mock_db, user, limit=10)
        assert len(logs) == 1
        assert logs[0]["action"] == "generate_timetable"


# ═══════════════════════════════════════════════════════
# 2. Timetable Persistence Tests
# ═══════════════════════════════════════════════════════


class TestTimetablePersistence:

    def test_persist_timetable_run(self):
        mock_db = MagicMock()
        run_uuid = "22222222-2222-2222-2222-222222222222"
        mock_db.execute.return_value.fetchone.return_value = [run_uuid]

        user = _make_user("admin")
        solver_result = {
            "status": "OPTIMAL",
            "diagnostics": {"total_sessions": 189, "scheduled_count": 189},
            "solve_time_seconds": 1.25,
            "scheduled": [
                {
                    "session_id": "sess_1",
                    "course_id": "CS101",
                    "faculty_id": "F01",
                    "group_id": "CS-A",
                    "room_id": "CR101",
                    "day": "Monday",
                    "period": 1,
                    "duration": 1,
                }
            ],
        }

        res_id = persist_timetable_run(mock_db, user, solver_result)
        assert res_id == run_uuid
        # Should insert run, insert entry, write audit log, commit
        assert mock_db.commit.called

    def test_persist_timetable_rollback_on_error(self):
        mock_db = MagicMock()
        mock_db.execute.side_effect = Exception("DB connection dropped")

        user = _make_user("admin")
        with pytest.raises(Exception, match="DB connection dropped"):
            persist_timetable_run(mock_db, user, {"status": "OPTIMAL"})

        mock_db.rollback.assert_called_once()

    def test_get_active_timetable(self):
        mock_db = MagicMock()
        run_row = MagicMock()
        run_row.id = uuid.uuid4()
        run_row.dataset_id = "cit-public-v1"
        run_row.solver_status = "OPTIMAL"
        run_row.total_sessions = 189
        run_row.scheduled_count = 189
        run_row.solve_time_sec = 1.5
        run_row.diagnostics = {}
        run_row.created_at = "2026-11-01T04:00:00Z"

        entry_row = MagicMock()
        entry_row.session_id = "sess_1"
        entry_row.course_id = "CS101"
        entry_row.faculty_id = "F01"
        entry_row.group_id = "CS-A"
        entry_row.room_id = "CR101"
        entry_row.day = "Monday"
        entry_row.period = 1
        entry_row.duration = 1

        mock_db.execute.return_value.fetchone.return_value = run_row
        mock_db.execute.return_value.fetchall.return_value = [entry_row]

        user = _make_user("faculty")
        timetable = get_active_timetable(mock_db, user)
        assert timetable is not None
        assert timetable["status"] == "OPTIMAL"
        assert len(timetable["scheduled"]) == 1


# ═══════════════════════════════════════════════════════
# 3. Booking Request & Run Persistence Tests
# ═══════════════════════════════════════════════════════


class TestBookingPersistence:

    def test_persist_booking_request(self):
        mock_db = MagicMock()
        row = MagicMock()
        row.id = uuid.uuid4()
        row.request_code = "BR-TEST01"
        row.submitted_at = "2026-11-01T04:00:00Z"
        mock_db.execute.return_value.fetchone.return_value = row

        user = _make_user("faculty")
        req_data = {
            "title": "Guest Lecture",
            "attendance": 50,
            "duration_periods": 2,
            "requested_category": "academic",
            "windows": [{"day": "Tuesday", "from_period": 2, "to_period": 3}],
            "room_types": ["lecture_hall"],
        }

        saved = persist_booking_request(mock_db, user, req_data)
        assert saved["status"] == "submitted"
        assert saved["request_code"] == "BR-TEST01"
        mock_db.commit.assert_called_once()

    def test_cancel_booking_request_success(self):
        mock_db = MagicMock()
        row = MagicMock()
        row.id = uuid.uuid4()
        row.request_code = "BR-TEST01"
        row.cancelled = True
        row.cancelled_at = "2026-11-01T04:05:00Z"
        mock_db.execute.return_value.fetchone.return_value = row

        user = _make_user("faculty")
        result = cancel_booking_request(
            mock_db, user, str(row.id), cancel_note="Speaker unavailable"
        )
        assert result["cancelled"] is True
        mock_db.commit.assert_called_once()

    def test_cancel_booking_request_not_found(self):
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = None

        user = _make_user("faculty")
        with pytest.raises(ValueError, match="not found or not owned"):
            cancel_booking_request(mock_db, user, "nonexistent-id")

        mock_db.rollback.assert_called_once()

    def test_persist_booking_run(self):
        mock_db = MagicMock()
        run_uuid = "33333333-3333-3333-3333-333333333333"
        mock_db.execute.return_value.fetchone.return_value = [run_uuid]

        user = _make_user("admin")
        decisions = [
            {
                "request_id": "req-1",
                "title": "Workshop",
                "requester": "Alice",
                "status": "approved",
                "allocated": {"room_id": "CR101", "day": "Monday", "start_period": 1, "end_period": 2},
                "reasons": ["Valid"],
            }
        ]

        run_id = persist_booking_run(mock_db, user, decisions)
        assert run_id == run_uuid
        mock_db.commit.assert_called_once()


# ═══════════════════════════════════════════════════════
# 4. Exam Persistence Tests
# ═══════════════════════════════════════════════════════


class TestExamPersistence:

    def test_persist_exam_run(self):
        mock_db = MagicMock()
        run_uuid = "44444444-4444-4444-4444-444444444444"
        entry_uuid = "55555555-5555-5555-5555-555555555555"
        audit_uuid = "77777777-7777-7777-7777-777777777777"

        # fetchone for run_id, entry_id, and write_audit_log
        mock_db.execute.return_value.fetchone.side_effect = [[run_uuid], [entry_uuid], [audit_uuid]]

        user = _make_user("admin")
        exam_result = {
            "total_exams": 41,
            "scheduled_count": 41,
            "unscheduled_count": 0,
            "slots_used": 10,
            "slots_available": 12,
            "scheduled_exams": [
                {
                    "exam_id": "exam_1",
                    "course_ids": ["CS101"],
                    "student_groups": ["CS-A"],
                    "total_students": 60,
                    "day": "Monday",
                    "session": "AM",
                    "rooms": [
                        {"room_id": "HALL1", "students_allocated": 40},
                        {"room_id": "HALL2", "students_allocated": 20},
                    ],
                }
            ],
        }

        res_id = persist_exam_run(mock_db, user, exam_result)
        assert res_id == run_uuid
        mock_db.commit.assert_called_once()

    def test_get_active_exam_schedule(self):
        mock_db = MagicMock()
        run_row = MagicMock()
        run_row.id = uuid.uuid4()
        run_row.total_exams = 41
        run_row.scheduled_count = 41
        run_row.unscheduled_count = 0
        run_row.slots_used = 10
        run_row.slots_available = 12
        run_row.created_at = "2026-11-01T04:00:00Z"

        entry_row = MagicMock()
        entry_row.id = uuid.uuid4()
        entry_row.exam_id = "exam_1"
        entry_row.course_ids = ["CS101"]
        entry_row.groups = ["CS-A"]
        entry_row.size = 60
        entry_row.day = "Monday"
        entry_row.session = "AM"

        alloc_row = MagicMock()
        alloc_row.room_id = "HALL1"
        alloc_row.seats_used = 60

        mock_db.execute.return_value.fetchone.return_value = run_row
        mock_db.execute.return_value.fetchall.side_effect = [[entry_row], [alloc_row]]

        user = _make_user("faculty")
        schedule = get_active_exam_schedule(mock_db, user)
        assert schedule is not None
        assert schedule["scheduled_count"] == 41
        assert len(schedule["scheduled_exams"]) == 1


# ═══════════════════════════════════════════════════════
# 5. Rescheduling Persistence & Anti-Self-Approval Tests
# ═══════════════════════════════════════════════════════


class TestReschedulingPersistence:

    def test_persist_reschedule_proposal(self):
        mock_db = MagicMock()
        p_uuid = "66666666-6666-6666-6666-666666666666"
        mock_db.execute.return_value.fetchone.return_value = [p_uuid]

        user = _make_user("department_coordinator")
        proposal = {
            "proposal_id": "prop-001",
            "status": "feasible",
            "solver_status": "OPTIMAL",
            "total_sessions": 189,
            "frozen_count": 185,
            "rescheduled_count": 4,
            "moved_count": 4,
            "added_count": 0,
            "unscheduled_count": 0,
            "conflicts": [],
            "solve_time_seconds": 0.5,
            "changes": [
                {
                    "session_id": "sess_1",
                    "kind": "moved",
                    "before": {"day": "Monday", "period": 1, "room_id": "CR101"},
                    "after": {"day": "Monday", "period": 2, "room_id": "CR102"},
                    "reason": "Faculty clash",
                }
            ],
            "approved_schedule": [],
        }

        res_id = persist_reschedule_proposal(mock_db, user, proposal)
        assert res_id == p_uuid
        mock_db.commit.assert_called_once()

    def test_approve_proposal_in_db_success(self):
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = [[{"session_id": "sess_1"}]]

        user = _make_user("admin", user_id="00000000-0000-0000-0000-000000000002")
        result = approve_reschedule_proposal_in_db(mock_db, user, "prop-001")
        assert result["approved"] is True
        mock_db.commit.assert_called_once()

    def test_approve_proposal_in_db_self_approval_fails(self):
        """Database function admin_approve_proposal raises exception on self-approval."""
        mock_db = MagicMock()
        mock_db.execute.side_effect = Exception("Cannot approve your own proposal")

        user = _make_user("admin", user_id="00000000-0000-0000-0000-000000000001")
        with pytest.raises(Exception, match="Cannot approve your own proposal"):
            approve_reschedule_proposal_in_db(mock_db, user, "prop-001")

        mock_db.rollback.assert_called_once()


# ═══════════════════════════════════════════════════════
# 6. Route Integration with Persistence Tests
# ═══════════════════════════════════════════════════════


class TestRoutePersistenceIntegration:

    def test_schedule_generate_attaches_run_id_when_db_present(self, override_auth):
        from app.scheduling.routes import generate_schedule

        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = ["run-uuid-123"]

        with patch("app.scheduling.routes.solve") as mock_solve:
            mock_solve.return_value = {
                "status": "OPTIMAL",
                "scheduled": [],
                "unscheduled": [],
                "diagnostics": {"scheduled_count": 189, "total_sessions": 189},
                "solve_time_seconds": 1.0,
            }

            result = generate_schedule(
                time_limit_seconds=10,
                user=override_auth,
                db=mock_db,
            )
            assert result["success"] is True
            assert "run_id" in result

    def test_schedule_generate_works_without_db(self, override_auth):
        from app.scheduling.routes import generate_schedule

        with patch("app.scheduling.routes.solve") as mock_solve:
            mock_solve.return_value = {
                "status": "OPTIMAL",
                "scheduled": [],
                "unscheduled": [],
                "diagnostics": {"scheduled_count": 189, "total_sessions": 189},
                "solve_time_seconds": 1.0,
            }

            result = generate_schedule(
                time_limit_seconds=10,
                user=override_auth,
                db=None,
            )
            assert result["success"] is True
            assert "run_id" not in result

    def test_booking_submit_route(self, override_auth):
        from app.bookings.models import BookingRequestIn
        from app.bookings.routes import submit_booking_request

        mock_db = MagicMock()
        row = MagicMock()
        row.id = uuid.uuid4()
        row.request_code = "BR-NEW"
        row.submitted_at = "2026-11-01T04:00:00Z"
        mock_db.execute.return_value.fetchone.return_value = row

        req = BookingRequestIn(
            id=str(uuid.uuid4()),
            title="Seminar",
            requester="Admin",
            role="admin",
            requested_category="academic",
            attendance=30,
            duration_periods=1,
            windows=[{"day": "Monday", "from_period": 1, "to_period": 2}],
            room_types=["seminar_hall"],
        )

        res = submit_booking_request(req, user=override_auth, db=mock_db)
        assert res["status"] == "submitted"
        assert res["request_code"] == "BR-NEW"

    def test_booking_cancel_route(self, override_auth):
        from app.bookings.routes import CancelBookingInput, cancel_booking_endpoint

        mock_db = MagicMock()
        row = MagicMock()
        row.id = uuid.uuid4()
        row.request_code = "BR-NEW"
        row.cancelled = True
        row.cancelled_at = "2026-11-01T04:00:00Z"
        mock_db.execute.return_value.fetchone.return_value = row

        res = cancel_booking_endpoint(
            str(row.id),
            CancelBookingInput(cancel_note="Done"),
            user=override_auth,
            db=mock_db,
        )
        assert res["cancelled"] is True

    def test_reschedule_propose_route_persists(self, override_auth):
        from app.rescheduling.models import DisruptionInput
        from app.rescheduling.routes import propose_reschedule

        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = ["prop-uuid-999"]

        with patch("app.rescheduling.routes.generate_proposal") as mock_gen:
            mock_gen.return_value = {
                "proposal_id": "p-1",
                "status": "feasible",
                "solver_status": "FEASIBLE",
                "total_sessions": 10,
                "frozen_count": 8,
                "rescheduled_count": 2,
                "moved_count": 2,
                "added_count": 0,
                "unscheduled_count": 0,
                "changes": [],
                "conflicts": [],
                "solve_time_seconds": 0.2,
                "approved_schedule": [],
            }

            res = propose_reschedule(
                DisruptionInput(changes=[]),
                user=override_auth,
                db=mock_db,
            )
            assert res["proposal_id"] == "p-1"
            assert mock_db.commit.called


# ═══════════════════════════════════════════════════════
# 7. Claims and Transaction Behavior Tests
# ═══════════════════════════════════════════════════════


class TestClaimsAndTransactionBehavior:

    def test_claims_set_transaction_local(self):
        from app.core.database import get_db_for_user

        mock_db = MagicMock()
        user = _make_user("faculty", "99999999-9999-9999-9999-999999999999")
        get_db_for_user(user, mock_db)

        # Check set_config calls
        calls = mock_db.execute.call_args_list
        assert len(calls) == 2
        sql1 = str(calls[0][0][0])
        params1 = calls[0][0][1]
        assert "app.current_user_id" in sql1
        assert ", true)" in sql1  # is_local = true
        assert params1["uid"] == "99999999-9999-9999-9999-999999999999"

        sql2 = str(calls[1][0][0])
        params2 = calls[1][0][1]
        assert "app.current_user_role" in sql2
        assert ", true)" in sql2  # is_local = true
        assert params2["role"] == "faculty"

    def test_booking_persistence_sets_claims_first(self):
        mock_db = MagicMock()
        call_order = []
        mock_db.execute.side_effect = lambda sql, *args, **kwargs: (
            call_order.append("claims" if "set_config" in str(sql) else "operation"),
            MagicMock(fetchone=lambda: MagicMock(id=uuid.uuid4(), request_code="BR-1", submitted_at="2026-11-01T04:00:00Z"))
        )[1]

        user = _make_user("faculty")
        persist_booking_request(mock_db, user, {"title": "Test", "attendance": 10, "duration_periods": 1})
        assert call_order[0] == "claims"
        assert call_order[1] == "claims"
        assert "operation" in call_order[2:]

    def test_timetable_persistence_sets_claims_first(self):
        mock_db = MagicMock()
        call_order = []
        mock_db.execute.side_effect = lambda sql, *args, **kwargs: (
            call_order.append("claims" if "set_config" in str(sql) else "operation"),
            MagicMock(fetchone=lambda: [str(uuid.uuid4())])
        )[1]

        user = _make_user("admin")
        persist_timetable_run(mock_db, user, {"status": "OPTIMAL", "scheduled": []})
        assert call_order[0] == "claims"
        assert call_order[1] == "claims"
        assert "operation" in call_order[2:]


# ═══════════════════════════════════════════════════════
# 8. RLS and Authorization Query Tests
# ═══════════════════════════════════════════════════════


class TestRLSPersistenceAuthorization:

    def test_get_booking_requests_admin_vs_faculty(self):
        mock_db = MagicMock()
        user_faculty = _make_user("faculty")
        get_booking_requests(mock_db, user_faculty)

        # Faculty query sets claims for faculty
        calls = mock_db.execute.call_args_list
        assert calls[0][0][1]["uid"] == user_faculty["user_id"]
        assert calls[1][0][1]["role"] == "faculty"

    def test_get_latest_booking_run_returns_none_when_empty(self):
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = None

        user = _make_user("faculty")
        run = get_latest_booking_run(mock_db, user)
        assert run is None

    def test_get_reschedule_proposal_not_found(self):
        mock_db = MagicMock()
        mock_db.execute.return_value.fetchone.return_value = None

        user = _make_user("faculty")
        prop = get_reschedule_proposal_from_db(mock_db, user, "prop-nonexistent")
        assert prop is None

