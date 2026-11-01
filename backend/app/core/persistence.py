"""
Database persistence service for the CIT Campus Scheduler.

Handles persistent operations for:
- Booking requests (submission, cancellation, user/admin queries)
- Timetable runs and scheduled entries (via admin SECURITY DEFINER functions)
- Booking processing runs and decisions (via admin SECURITY DEFINER functions)
- Examination scheduling runs, entries, and room allocations (via admin functions)
- Rescheduling proposals, session changes, and approvals (via admin functions)
- Audit log records

Security Guarantees:
- Operates under the runtime `app_api` role (never uses `app_migrator`).
- Sets transaction-local claims via `get_db_for_user(user, db)` before queries.
- Privileged operations go through `app_owner`-owned SECURITY DEFINER functions
  that strictly enforce `app_role() = 'admin'`.
- Self-approval protections enforced at both API and database levels.
- Non-admin profile/role tampering is prevented.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db_for_user

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════
# 1. Audit Log Persistence
# ═══════════════════════════════════════════════════════


def write_audit_log(
    db: Session,
    user: dict,
    action: str,
    target_type: str = "",
    target_id: str = "",
    detail: dict[str, Any] | None = None,
) -> str | None:
    """Write an audit log entry via SECURITY DEFINER admin_write_audit_log.

    Only users with role='admin' can write to the audit log.
    """
    get_db_for_user(user, db)
    detail_json = json.dumps(detail or {})
    actor_id = str(user.get("user_id", ""))

    try:
        row = db.execute(
            text(
                """
                SELECT public.admin_write_audit_log(
                    :actor_id::uuid,
                    :action,
                    :target_type,
                    :target_id,
                    CAST(:detail AS jsonb)
                )
                """
            ),
            {
                "actor_id": actor_id,
                "action": action,
                "target_type": target_type,
                "target_id": str(target_id),
                "detail": detail_json,
            },
        ).fetchone()
        return str(row[0]) if row else None
    except Exception as exc:
        logger.warning("Failed to write audit log (%s): %s", action, exc)
        raise


def get_audit_logs(db: Session, user: dict, limit: int = 50) -> list[dict[str, Any]]:
    """Retrieve audit log records subject to RLS (admin only)."""
    get_db_for_user(user, db)
    result = db.execute(
        text(
            """
            SELECT id, timestamp, actor_id, action, target_type, target_id, detail
            FROM public.audit_log
            ORDER BY timestamp DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    )
    rows = result.fetchall()
    return [
        {
            "id": str(r.id),
            "timestamp": r.timestamp.isoformat() if hasattr(r.timestamp, "isoformat") else str(r.timestamp),
            "actor_id": str(r.actor_id),
            "action": r.action,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "detail": r.detail,
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════
# 2. Timetable Persistence
# ═══════════════════════════════════════════════════════


def persist_timetable_run(
    db: Session,
    user: dict,
    solver_result: dict[str, Any],
    dataset_id: str = "cit-public-v1",
) -> str:
    """Persist a timetable solver run and its entries via admin functions.

    Requires admin role.
    """
    creator_id = str(user.get("user_id"))
    status = solver_result.get("status", "UNKNOWN")
    diagnostics = solver_result.get("diagnostics", {})
    total_sessions = diagnostics.get("total_sessions", 0)
    scheduled_count = diagnostics.get("scheduled_count", 0)
    solve_time_sec = float(solver_result.get("solve_time_seconds", 0.0))

    try:
        get_db_for_user(user, db)
        # 1. Insert timetable run
        row = db.execute(
            text(
                """
                SELECT public.admin_insert_timetable_run(
                    :dataset_id,
                    :solver_status,
                    :total_sessions,
                    :scheduled_count,
                    :solve_time_sec,
                    CAST(:diagnostics AS jsonb),
                    :created_by::uuid
                )
                """
            ),
            {
                "dataset_id": dataset_id,
                "solver_status": status,
                "total_sessions": total_sessions,
                "scheduled_count": scheduled_count,
                "solve_time_sec": solve_time_sec,
                "diagnostics": json.dumps(diagnostics),
                "created_by": creator_id,
            },
        ).fetchone()
        run_id = str(row[0])

        # 2. Insert timetable entries
        scheduled_entries = solver_result.get("scheduled", [])
        for entry in scheduled_entries:
            db.execute(
                text(
                    """
                    SELECT public.admin_insert_timetable_entry(
                        :run_id::uuid,
                        :session_id,
                        :course_id,
                        :faculty_id,
                        :group_id,
                        :room_id,
                        :day,
                        :period,
                        :duration
                    )
                    """
                ),
                {
                    "run_id": run_id,
                    "session_id": entry.get("session_id", ""),
                    "course_id": entry.get("course_id", ""),
                    "faculty_id": entry.get("faculty_id", ""),
                    "group_id": entry.get("group_id", "") or entry.get("student_group", ""),
                    "room_id": entry.get("room_id", ""),
                    "day": entry.get("day", ""),
                    "period": int(entry.get("period", 1)),
                    "duration": int(entry.get("duration", 1)),
                },
            )

        # 3. Write audit log
        write_audit_log(
            db,
            user,
            action="generate_timetable",
            target_type="timetable_run",
            target_id=run_id,
            detail={"status": status, "scheduled_count": scheduled_count},
        )

        db.commit()
        return run_id
    except Exception:
        db.rollback()
        raise


def get_active_timetable(db: Session, user: dict) -> dict[str, Any] | None:
    """Retrieve the latest timetable run and its entries subject to RLS."""
    get_db_for_user(user, db)

    run_row = db.execute(
        text(
            """
            SELECT id, dataset_id, solver_status, total_sessions,
                   scheduled_count, solve_time_sec, diagnostics, created_at, created_by
            FROM public.timetable_runs
            WHERE solver_status IN ('OPTIMAL', 'FEASIBLE')
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
    ).fetchone()

    if not run_row:
        return None

    run_id = run_row.id
    entries_res = db.execute(
        text(
            """
            SELECT session_id, course_id, faculty_id, group_id, room_id, day, period, duration
            FROM public.timetable_entries
            WHERE run_id = :run_id
            ORDER BY day, period
            """
        ),
        {"run_id": run_id},
    )

    scheduled = [
        {
            "session_id": e.session_id,
            "course_id": e.course_id,
            "faculty_id": e.faculty_id,
            "group_id": e.group_id,
            "room_id": e.room_id,
            "day": e.day,
            "period": e.period,
            "duration": e.duration,
        }
        for e in entries_res.fetchall()
    ]

    return {
        "run_id": str(run_row.id),
        "dataset_id": run_row.dataset_id,
        "status": run_row.solver_status,
        "total_sessions": run_row.total_sessions,
        "scheduled_count": run_row.scheduled_count,
        "solve_time_seconds": run_row.solve_time_sec,
        "diagnostics": run_row.diagnostics,
        "created_at": run_row.created_at.isoformat() if hasattr(run_row.created_at, "isoformat") else str(run_row.created_at),
        "scheduled": scheduled,
    }


# ═══════════════════════════════════════════════════════
# 3. Booking Requests & Decisions Persistence
# ═══════════════════════════════════════════════════════


def persist_booking_request(
    db: Session,
    user: dict,
    request_data: dict[str, Any],
) -> dict[str, Any]:
    """Persist a user-submitted booking request under the app_api role.

    Enforces server-derived submitted_by to match the authenticated user UUID.
    """
    submitted_by = str(user.get("user_id"))
    req_id = request_data.get("id") or str(uuid.uuid4())
    req_code = request_data.get("request_code") or f"BR-{req_id[:8]}"

    # Validate UUID format
    try:
        parsed_id = str(uuid.UUID(str(req_id)))
    except (ValueError, TypeError):
        parsed_id = str(uuid.uuid4())

    try:
        get_db_for_user(user, db)
        row = db.execute(
            text(
                """
                INSERT INTO public.booking_requests (
                    id, request_code, submitted_at, submitted_by, requester_name,
                    role, department, requested_category, title, attendance,
                    duration_periods, windows, room_types, needs, requested_room,
                    mandatory_for_groups, series_id, raw_text, cancelled
                )
                VALUES (
                    :id::uuid,
                    :request_code,
                    now(),
                    :submitted_by::uuid,
                    :requester_name,
                    :role,
                    :department,
                    :requested_category,
                    :title,
                    :attendance,
                    :duration_periods,
                    CAST(:windows AS jsonb),
                    CAST(:room_types AS jsonb),
                    CAST(:needs AS jsonb),
                    :requested_room,
                    CAST(:mandatory_for_groups AS jsonb),
                    :series_id,
                    :raw_text,
                    false
                )
                RETURNING id, request_code, submitted_at
                """
            ),
            {
                "id": parsed_id,
                "request_code": req_code,
                "submitted_by": submitted_by,
                "requester_name": user.get("full_name") or "",
                "role": user.get("role") or "faculty",
                "department": user.get("department"),
                "requested_category": request_data.get("requested_category", "general"),
                "title": request_data.get("title", ""),
                "attendance": int(request_data.get("attendance", 1)),
                "duration_periods": int(request_data.get("duration_periods", 1)),
                "windows": json.dumps(request_data.get("windows", [])),
                "room_types": json.dumps(request_data.get("room_types", [])),
                "needs": json.dumps(request_data.get("needs", [])),
                "requested_room": request_data.get("requested_room"),
                "mandatory_for_groups": json.dumps(request_data.get("mandatory_for_groups", [])),
                "series_id": request_data.get("series_id"),
                "raw_text": request_data.get("raw_text", ""),
            },
        ).fetchone()

        db.commit()
        return {
            "id": str(row.id),
            "request_code": row.request_code,
            "submitted_at": row.submitted_at.isoformat() if hasattr(row.submitted_at, "isoformat") else str(row.submitted_at),
            "status": "submitted",
        }
    except Exception:
        db.rollback()
        raise


def cancel_booking_request(
    db: Session,
    user: dict,
    request_id: str,
    cancel_note: str = "",
) -> dict[str, Any]:
    """Cancel a user's own booking request.

    Enforced by column-level grants and trigger `enforce_booking_cancel_only`.
    """
    user_id = str(user.get("user_id"))

    try:
        get_db_for_user(user, db)
        row = db.execute(
            text(
                """
                UPDATE public.booking_requests
                SET cancelled = true,
                    cancelled_at = now(),
                    cancelled_by = :user_id::uuid,
                    cancel_note = :cancel_note
                WHERE id = :id::uuid
                RETURNING id, request_code, cancelled, cancelled_at
                """
            ),
            {
                "id": str(request_id),
                "user_id": user_id,
                "cancel_note": cancel_note,
            },
        ).fetchone()

        if not row:
            raise ValueError(f"Booking request not found or not owned by user: {request_id}")

        db.commit()
        return {
            "id": str(row.id),
            "request_code": row.request_code,
            "cancelled": row.cancelled,
            "cancelled_at": row.cancelled_at.isoformat() if hasattr(row.cancelled_at, "isoformat") else str(row.cancelled_at),
        }
    except Exception:
        db.rollback()
        raise


def get_booking_requests(
    db: Session,
    user: dict,
    status_filter: str | None = None,
    user_id_filter: str | None = None,
) -> list[dict[str, Any]]:
    """Retrieve booking requests subject to RLS (users see own, admin/coord see all)."""
    get_db_for_user(user, db)

    sql = """
        SELECT id, request_code, submitted_at, submitted_by, requester_name,
               role, department, requested_category, title, attendance,
               duration_periods, windows, room_types, needs, requested_room,
               mandatory_for_groups, series_id, cancelled, cancelled_at, cancel_note
        FROM public.booking_requests
    """
    where_clauses: list[str] = []
    params: dict[str, Any] = {}

    if status_filter == "cancelled":
        where_clauses.append("cancelled = true")
    elif status_filter == "active":
        where_clauses.append("cancelled = false")

    if user_id_filter:
        where_clauses.append("submitted_by = :user_id_filter::uuid")
        params["user_id_filter"] = str(user_id_filter)

    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)

    sql += " ORDER BY submitted_at DESC"

    res = db.execute(text(sql), params)
    rows = res.fetchall()
    return [
        {
            "id": str(r.id),
            "request_code": r.request_code,
            "submitted_at": r.submitted_at.isoformat() if hasattr(r.submitted_at, "isoformat") else str(r.submitted_at),
            "submitted_by": str(r.submitted_by),
            "requester_name": r.requester_name,
            "role": r.role,
            "department": r.department,
            "requested_category": r.requested_category,
            "title": r.title,
            "attendance": r.attendance,
            "duration_periods": r.duration_periods,
            "windows": r.windows,
            "room_types": r.room_types,
            "needs": r.needs,
            "requested_room": r.requested_room,
            "mandatory_for_groups": r.mandatory_for_groups,
            "series_id": r.series_id,
            "cancelled": r.cancelled,
            "cancelled_at": r.cancelled_at.isoformat() if hasattr(r.cancelled_at, "isoformat") and r.cancelled_at else None,
            "cancel_note": r.cancel_note,
        }
        for r in rows
    ]


def persist_booking_run(
    db: Session,
    user: dict,
    decisions: list[dict[str, Any]],
    timetable_run_id: str | None = None,
) -> str:
    """Persist booking decisions and the booking run via admin functions.

    Requires admin role.
    """
    creator_id = str(user.get("user_id"))

    total = len(decisions)
    approved = sum(1 for d in decisions if d.get("status") == "approved")
    rejected = sum(1 for d in decisions if d.get("status") == "rejected")
    alt = sum(1 for d in decisions if d.get("status") == "alternative_offered")

    try:
        get_db_for_user(user, db)
        row = db.execute(
            text(
                """
                SELECT public.admin_insert_booking_run(
                    :timetable_run_id,
                    :total_requests,
                    :approved_count,
                    :rejected_count,
                    :alt_count,
                    :created_by::uuid
                )
                """
            ),
            {
                "timetable_run_id": timetable_run_id,
                "total_requests": total,
                "approved_count": approved,
                "rejected_count": rejected,
                "alt_count": alt,
                "created_by": creator_id,
            },
        ).fetchone()
        run_id = str(row[0])

        for dec in decisions:
            allocated = json.dumps(dec.get("allocated")) if dec.get("allocated") else None
            alt_slot = json.dumps(dec.get("alternative")) if dec.get("alternative") else None
            reasons = json.dumps(dec.get("reasons", []))

            db.execute(
                text(
                    """
                    SELECT public.admin_insert_booking_decision(
                        :run_id::uuid,
                        :request_id,
                        :title,
                        :requester,
                        :status,
                        CAST(:allocated AS jsonb),
                        CAST(:alternative AS jsonb),
                        CAST(:reasons AS jsonb)
                    )
                    """
                ),
                {
                    "run_id": run_id,
                    "request_id": str(dec.get("request_id", "")),
                    "title": dec.get("title", ""),
                    "requester": dec.get("requester", ""),
                    "status": dec.get("status", "rejected"),
                    "allocated": allocated,
                    "alternative": alt_slot,
                    "reasons": reasons,
                },
            )

        write_audit_log(
            db,
            user,
            action="process_bookings",
            target_type="booking_run",
            target_id=run_id,
            detail={"total": total, "approved": approved, "rejected": rejected},
        )

        db.commit()
        return run_id
    except Exception:
        db.rollback()
        raise


def get_latest_booking_run(db: Session, user: dict) -> dict[str, Any] | None:
    """Retrieve the latest booking run and its decisions subject to RLS."""
    get_db_for_user(user, db)

    run_row = db.execute(
        text(
            """
            SELECT id, timetable_run_id, total_requests, approved_count,
                   rejected_count, alt_count, created_at, created_by
            FROM public.booking_runs
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
    ).fetchone()

    if not run_row:
        return None

    run_id = run_row.id
    dec_res = db.execute(
        text(
            """
            SELECT request_id, title, requester, status, allocated, alternative, reasons
            FROM public.booking_decisions
            WHERE run_id = :run_id
            """
        ),
        {"run_id": run_id},
    )

    decisions = [
        {
            "request_id": d.request_id,
            "title": d.title,
            "requester": d.requester,
            "status": d.status,
            "allocated": d.allocated,
            "alternative": d.alternative,
            "reasons": d.reasons,
        }
        for d in dec_res.fetchall()
    ]

    return {
        "run_id": str(run_row.id),
        "total_requests": run_row.total_requests,
        "approved_count": run_row.approved_count,
        "rejected_count": run_row.rejected_count,
        "alt_count": run_row.alt_count,
        "created_at": run_row.created_at.isoformat() if hasattr(run_row.created_at, "isoformat") else str(run_row.created_at),
        "decisions": decisions,
    }


# ═══════════════════════════════════════════════════════
# 4. Examination Persistence
# ═══════════════════════════════════════════════════════


def persist_exam_run(
    db: Session,
    user: dict,
    exam_result: dict[str, Any],
) -> str:
    """Persist exam scheduling run, entries and room allocations via admin functions.

    Requires admin role.
    """
    creator_id = str(user.get("user_id"))

    total_exams = exam_result.get("total_exams", 0)
    scheduled_count = exam_result.get("scheduled_count", 0)
    unscheduled_count = exam_result.get("unscheduled_count", 0)
    slots_used = exam_result.get("slots_used", 0)
    slots_available = exam_result.get("slots_available", 0)

    try:
        get_db_for_user(user, db)
        # 1. Insert exam run
        row = db.execute(
            text(
                """
                SELECT public.admin_insert_exam_run(
                    :total_exams,
                    :scheduled_count,
                    :unscheduled_count,
                    :slots_used,
                    :slots_available,
                    :created_by::uuid
                )
                """
            ),
            {
                "total_exams": total_exams,
                "scheduled_count": scheduled_count,
                "unscheduled_count": unscheduled_count,
                "slots_used": slots_used,
                "slots_available": slots_available,
                "created_by": creator_id,
            },
        ).fetchone()
        run_id = str(row[0])

        # 2. Insert exam entries and allocations
        for exam in exam_result.get("scheduled_exams", []):
            entry_row = db.execute(
                text(
                    """
                    SELECT public.admin_insert_exam_entry(
                        :run_id::uuid,
                        :exam_id,
                        CAST(:course_ids AS jsonb),
                        CAST(:groups AS jsonb),
                        :size,
                        :day,
                        :session
                    )
                    """
                ),
                {
                    "run_id": run_id,
                    "exam_id": exam.get("exam_id", ""),
                    "course_ids": json.dumps(exam.get("course_ids", [])),
                    "groups": json.dumps(exam.get("student_groups", [])),
                    "size": int(exam.get("total_students", 0)),
                    "day": exam.get("day", ""),
                    "session": exam.get("session", ""),
                },
            ).fetchone()
            entry_id = str(entry_row[0])

            # Multi-room allocations
            for alloc in exam.get("rooms", []):
                db.execute(
                    text(
                        """
                        SELECT public.admin_insert_exam_room_allocation(
                            :entry_id::uuid,
                            :room_id,
                            :seats_used
                        )
                        """
                    ),
                    {
                        "entry_id": entry_id,
                        "room_id": alloc.get("room_id", ""),
                        "seats_used": int(alloc.get("students_allocated", 0)),
                    },
                )

        write_audit_log(
            db,
            user,
            action="schedule_exams",
            target_type="exam_run",
            target_id=run_id,
            detail={"total": total_exams, "scheduled": scheduled_count},
        )

        db.commit()
        return run_id
    except Exception:
        db.rollback()
        raise


def get_active_exam_schedule(db: Session, user: dict) -> dict[str, Any] | None:
    """Retrieve the latest exam run, entries and room allocations subject to RLS."""
    get_db_for_user(user, db)

    run_row = db.execute(
        text(
            """
            SELECT id, total_exams, scheduled_count, unscheduled_count,
                   slots_used, slots_available, created_at, created_by
            FROM public.exam_runs
            ORDER BY created_at DESC
            LIMIT 1
            """
        )
    ).fetchone()

    if not run_row:
        return None

    run_id = run_row.id
    entries_res = db.execute(
        text(
            """
            SELECT id, exam_id, course_ids, groups, size, day, session
            FROM public.exam_entries
            WHERE run_id = :run_id
            ORDER BY day, session, exam_id
            """
        ),
        {"run_id": run_id},
    )

    scheduled_exams = []
    for entry in entries_res.fetchall():
        allocs_res = db.execute(
            text(
                """
                SELECT room_id, seats_used
                FROM public.exam_room_allocations
                WHERE entry_id = :entry_id
                """
            ),
            {"entry_id": entry.id},
        )
        rooms = [{"room_id": a.room_id, "students_allocated": a.seats_used} for a in allocs_res.fetchall()]

        scheduled_exams.append(
            {
                "exam_id": entry.exam_id,
                "course_ids": entry.course_ids,
                "student_groups": entry.groups,
                "total_students": entry.size,
                "day": entry.day,
                "session": entry.session,
                "rooms": rooms,
            }
        )

    return {
        "run_id": str(run_row.id),
        "total_exams": run_row.total_exams,
        "scheduled_count": run_row.scheduled_count,
        "unscheduled_count": run_row.unscheduled_count,
        "slots_used": run_row.slots_used,
        "slots_available": run_row.slots_available,
        "created_at": run_row.created_at.isoformat() if hasattr(run_row.created_at, "isoformat") else str(run_row.created_at),
        "scheduled_exams": scheduled_exams,
    }


# ═══════════════════════════════════════════════════════
# 5. Rescheduling Persistence
# ═══════════════════════════════════════════════════════


def persist_reschedule_proposal(
    db: Session,
    user: dict,
    proposal: dict[str, Any],
    timetable_run_id: str | None = None,
) -> str:
    """Persist a rescheduling proposal and its session changes via admin functions.

    Requires admin or coordinator role (privileged write).
    """
    proposed_by = str(user.get("user_id"))
    pid = proposal.get("proposal_id", "")

    try:
        get_db_for_user(user, db)
        row = db.execute(
            text(
                """
                SELECT public.admin_insert_reschedule_proposal(
                    :proposal_id,
                    :timetable_run_id,
                    :status,
                    :solver_status,
                    :total_sessions,
                    :frozen_count,
                    :rescheduled_count,
                    :moved_count,
                    :added_count,
                    :unscheduled_count,
                    CAST(:conflicts AS jsonb),
                    :solve_time_seconds,
                    CAST(:approved_schedule AS jsonb),
                    CAST(:proposed_by AS uuid)
                )
                """
            ),
            {
                "proposal_id": pid,
                "timetable_run_id": timetable_run_id,
                "status": proposal.get("status", "feasible"),
                "solver_status": proposal.get("solver_status", "FEASIBLE"),
                "total_sessions": int(proposal.get("total_sessions", 0)),
                "frozen_count": int(proposal.get("frozen_count", 0)),
                "rescheduled_count": int(proposal.get("rescheduled_count", 0)),
                "moved_count": int(proposal.get("moved_count", 0)),
                "added_count": int(proposal.get("added_count", 0)),
                "unscheduled_count": int(proposal.get("unscheduled_count", 0)),
                "conflicts": json.dumps(proposal.get("conflicts", [])),
                "solve_time_seconds": float(proposal.get("solve_time_seconds", 0.0)),
                "approved_schedule": json.dumps(proposal.get("approved_schedule", proposal.get("_new_schedule", []))),
                "proposed_by": proposed_by,
            },
        ).fetchone()
        proposal_uuid = str(row[0])

        # Insert individual session changes
        for ch in proposal.get("changes", []):
            before = ch.get("before") or {}
            after = ch.get("after") or {}
            db.execute(
                text(
                    """
                    SELECT public.admin_insert_reschedule_change(
                        CAST(:proposal_id AS uuid),
                        :session_id,
                        :kind,
                        :before_day,
                        :before_period,
                        :before_room_id,
                        :after_day,
                        :after_period,
                        :after_room_id,
                        :reason
                    )
                    """
                ),
                {
                    "proposal_id": proposal_uuid,
                    "session_id": ch.get("session_id", ""),
                    "kind": ch.get("kind", "moved"),
                    "before_day": before.get("day"),
                    "before_period": before.get("period"),
                    "before_room_id": before.get("room_id"),
                    "after_day": after.get("day"),
                    "after_period": after.get("period"),
                    "after_room_id": after.get("room_id"),
                    "reason": ch.get("reason", ""),
                },
            )

        write_audit_log(
            db,
            user,
            action="propose_reschedule",
            target_type="reschedule_proposal",
            target_id=pid,
            detail={"status": proposal.get("status"), "moved_count": proposal.get("moved_count")},
        )

        db.commit()
        return proposal_uuid
    except Exception:
        db.rollback()
        raise


def get_reschedule_proposal_from_db(
    db: Session,
    user: dict,
    proposal_id: str,
) -> dict[str, Any] | None:
    """Retrieve a proposal and its changes from DB subject to RLS."""
    get_db_for_user(user, db)

    prop_row = db.execute(
        text(
            """
            SELECT id, proposal_id, status, solver_status, total_sessions,
                   frozen_count, rescheduled_count, moved_count, added_count,
                   unscheduled_count, conflicts, solve_time_seconds, approved,
                   approved_by, approved_at, approved_schedule, proposed_by
            FROM public.reschedule_proposals
            WHERE proposal_id = :pid
            """
        ),
        {"pid": proposal_id},
    ).fetchone()

    if not prop_row:
        return None

    changes_res = db.execute(
        text(
            """
            SELECT session_id, kind, before_day, before_period, before_room_id,
                   after_day, after_period, after_room_id, reason
            FROM public.reschedule_changes
            WHERE proposal_id = :p_uuid
            """
        ),
        {"p_uuid": prop_row.id},
    )

    changes = []
    for c in changes_res.fetchall():
        change_dict: dict[str, Any] = {
            "session_id": c.session_id,
            "kind": c.kind,
            "reason": c.reason,
        }
        if c.before_day is not None:
            change_dict["before"] = {
                "day": c.before_day,
                "period": c.before_period,
                "room_id": c.before_room_id,
            }
        if c.after_day is not None:
            change_dict["after"] = {
                "day": c.after_day,
                "period": c.after_period,
                "room_id": c.after_room_id,
            }
        changes.append(change_dict)

    return {
        "proposal_id": prop_row.proposal_id,
        "status": prop_row.status,
        "solver_status": prop_row.solver_status,
        "total_sessions": prop_row.total_sessions,
        "frozen_count": prop_row.frozen_count,
        "rescheduled_count": prop_row.rescheduled_count,
        "moved_count": prop_row.moved_count,
        "added_count": prop_row.added_count,
        "unscheduled_count": prop_row.unscheduled_count,
        "changes": changes,
        "conflicts": prop_row.conflicts,
        "solve_time_seconds": prop_row.solve_time_seconds,
        "approved": prop_row.approved,
        "approved_by": str(prop_row.approved_by) if prop_row.approved_by else None,
        "approved_at": prop_row.approved_at.isoformat() if hasattr(prop_row.approved_at, "isoformat") and prop_row.approved_at else None,
        "approved_schedule": prop_row.approved_schedule,
    }


def approve_reschedule_proposal_in_db(
    db: Session,
    user: dict,
    proposal_id: str,
) -> dict[str, Any]:
    """Approve a rescheduling proposal in the database.

    Enforces anti-self-approval at the database function level (`admin_approve_proposal`)
    and writes an audit log.
    """
    approver_id = str(user.get("user_id"))

    try:
        get_db_for_user(user, db)
        row = db.execute(
            text(
                """
                SELECT public.admin_approve_proposal(:pid, CAST(:approver_id AS uuid))
                """
            ),
            {"pid": proposal_id, "approver_id": approver_id},
        ).fetchone()

        approved_schedule = row[0] if row else []

        write_audit_log(
            db,
            user,
            action="approve_reschedule",
            target_type="reschedule_proposal",
            target_id=proposal_id,
            detail={"approved_by": approver_id},
        )

        db.commit()
        return {
            "proposal_id": proposal_id,
            "approved": True,
            "approved_by": approver_id,
            "approved_schedule": approved_schedule,
        }
    except Exception:
        db.rollback()
        raise


# ═══════════════════════════════════════════════════════
# 6. Admin User Management & Role Updates
# ═══════════════════════════════════════════════════════


def get_all_users(db: Session, admin_user: dict) -> list[dict[str, Any]]:
    """Retrieve all user profiles from `profiles`.

    Requires admin role. Subject to RLS `profiles_select_admin_api`.
    """
    get_db_for_user(admin_user, db)

    rows = db.execute(
        text(
            """
            SELECT id, email, full_name, role, department, faculty_id, created_at, updated_at
            FROM public.profiles
            ORDER BY created_at DESC
            """
        )
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "email": r.email,
            "full_name": r.full_name,
            "role": r.role,
            "department": r.department,
            "faculty_id": r.faculty_id,
            "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") and r.created_at else str(r.created_at),
            "updated_at": r.updated_at.isoformat() if hasattr(r.updated_at, "isoformat") and r.updated_at else str(r.updated_at),
        }
        for r in rows
    ]


def update_user_role(
    db: Session,
    admin_user: dict,
    target_user_id: str,
    new_role: str,
) -> dict[str, Any]:
    """Update a user's role via the SECURITY DEFINER function `admin_update_user_role`.

    Requires admin role. Validates role name. Automatically logs to `audit_log`.
    """
    valid_roles = {"admin", "department_coordinator", "faculty", "club"}
    if new_role not in valid_roles:
        raise ValueError(
            f"Invalid role: '{new_role}'. Must be one of: {', '.join(sorted(valid_roles))}"
        )

    admin_id = str(admin_user.get("user_id"))

    try:
        get_db_for_user(admin_user, db)

        # Verify user exists
        user_row = db.execute(
            text("SELECT id FROM public.profiles WHERE id = :user_id::uuid"),
            {"user_id": str(target_user_id)},
        ).fetchone()

        if not user_row:
            raise KeyError(f"User {target_user_id} not found")

        db.execute(
            text(
                """
                SELECT public.admin_update_user_role(
                    :user_id::uuid,
                    :new_role,
                    :admin_id::uuid
                )
                """
            ),
            {
                "user_id": str(target_user_id),
                "new_role": new_role,
                "admin_id": admin_id,
            },
        )
        db.commit()
        return {
            "success": True,
            "user_id": str(target_user_id),
            "new_role": new_role,
        }
    except Exception:
        db.rollback()
        raise

