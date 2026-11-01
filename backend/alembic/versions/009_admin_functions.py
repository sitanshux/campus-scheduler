"""
009 - Create SECURITY DEFINER admin functions.

All privileged writes go through these functions.  Each one:
1. Verifies app_role() = 'admin' (fail-closed)
2. Performs the operation as app_owner (table owner)
3. Is owned by app_owner, granted EXECUTE only to app_api

Functions:
- admin_write_audit_log()
- admin_insert_timetable_run()
- admin_insert_timetable_entry()
- admin_insert_booking_run()
- admin_insert_booking_decision()
- admin_insert_exam_run()
- admin_insert_exam_entry()
- admin_insert_exam_room_allocation()
- admin_insert_reschedule_proposal()
- admin_insert_reschedule_change()
- admin_approve_proposal()
- admin_update_user_role()

Revision ID: 009
Revises: 008
Create Date: 2026-11-01 00:08:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Audit log writer ────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_write_audit_log(
            p_actor_id uuid,
            p_action text,
            p_target_type text DEFAULT '',
            p_target_id text DEFAULT '',
            p_detail jsonb DEFAULT '{}'
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.audit_log (actor_id, action, target_type, target_id, detail)
            VALUES (p_actor_id, p_action, p_target_type, p_target_id, p_detail)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_write_audit_log(uuid, text, text, text, jsonb)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_write_audit_log(uuid, text, text, text, jsonb)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_write_audit_log(uuid, text, text, text, jsonb)
            TO app_api;
    """)

    # ── Timetable run ───────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_timetable_run(
            p_dataset_id text,
            p_solver_status text,
            p_total_sessions integer,
            p_scheduled_count integer,
            p_solve_time_sec double precision,
            p_diagnostics jsonb,
            p_created_by uuid
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.timetable_runs
                (dataset_id, solver_status, total_sessions, scheduled_count,
                 solve_time_sec, diagnostics, created_by)
            VALUES
                (p_dataset_id, p_solver_status, p_total_sessions, p_scheduled_count,
                 p_solve_time_sec, p_diagnostics, p_created_by)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_timetable_run(text, text, integer, integer, double precision, jsonb, uuid)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_timetable_run(text, text, integer, integer, double precision, jsonb, uuid)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_timetable_run(text, text, integer, integer, double precision, jsonb, uuid)
            TO app_api;
    """)

    # ── Timetable entry ─────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_timetable_entry(
            p_run_id uuid,
            p_session_id text,
            p_course_id text,
            p_faculty_id text,
            p_group_id text,
            p_room_id text,
            p_day text,
            p_period integer,
            p_duration integer DEFAULT 1
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.timetable_entries
                (run_id, session_id, course_id, faculty_id, group_id, room_id, day, period, duration)
            VALUES
                (p_run_id, p_session_id, p_course_id, p_faculty_id, p_group_id, p_room_id, p_day, p_period, p_duration)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_timetable_entry(uuid, text, text, text, text, text, text, integer, integer)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_timetable_entry(uuid, text, text, text, text, text, text, integer, integer)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_timetable_entry(uuid, text, text, text, text, text, text, integer, integer)
            TO app_api;
    """)

    # ── Booking run ─────────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_booking_run(
            p_timetable_run_id uuid,
            p_total_requests integer,
            p_approved_count integer,
            p_rejected_count integer,
            p_alt_count integer,
            p_created_by uuid
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.booking_runs
                (timetable_run_id, total_requests, approved_count, rejected_count, alt_count, created_by)
            VALUES
                (p_timetable_run_id, p_total_requests, p_approved_count, p_rejected_count, p_alt_count, p_created_by)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_booking_run(uuid, integer, integer, integer, integer, uuid)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_booking_run(uuid, integer, integer, integer, integer, uuid)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_booking_run(uuid, integer, integer, integer, integer, uuid)
            TO app_api;
    """)

    # ── Booking decision ────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_booking_decision(
            p_run_id uuid,
            p_request_id text,
            p_title text,
            p_requester text,
            p_status text,
            p_allocated jsonb DEFAULT NULL,
            p_alternative jsonb DEFAULT NULL,
            p_reasons jsonb DEFAULT '[]'
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.booking_decisions
                (run_id, request_id, title, requester, status, allocated, alternative, reasons)
            VALUES
                (p_run_id, p_request_id, p_title, p_requester, p_status, p_allocated, p_alternative, p_reasons)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_booking_decision(uuid, text, text, text, text, jsonb, jsonb, jsonb)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_booking_decision(uuid, text, text, text, text, jsonb, jsonb, jsonb)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_booking_decision(uuid, text, text, text, text, jsonb, jsonb, jsonb)
            TO app_api;
    """)

    # ── Exam run ────────────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_exam_run(
            p_total_exams integer,
            p_scheduled_count integer,
            p_unscheduled_count integer,
            p_slots_used integer,
            p_slots_available integer,
            p_created_by uuid
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.exam_runs
                (total_exams, scheduled_count, unscheduled_count, slots_used, slots_available, created_by)
            VALUES
                (p_total_exams, p_scheduled_count, p_unscheduled_count, p_slots_used, p_slots_available, p_created_by)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_exam_run(integer, integer, integer, integer, integer, uuid)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_exam_run(integer, integer, integer, integer, integer, uuid)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_exam_run(integer, integer, integer, integer, integer, uuid)
            TO app_api;
    """)

    # ── Exam entry ──────────────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_exam_entry(
            p_run_id uuid,
            p_exam_id text,
            p_course_ids jsonb,
            p_groups jsonb,
            p_size integer,
            p_day text,
            p_session text
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.exam_entries
                (run_id, exam_id, course_ids, groups, size, day, session)
            VALUES
                (p_run_id, p_exam_id, p_course_ids, p_groups, p_size, p_day, p_session)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_exam_entry(uuid, text, jsonb, jsonb, integer, text, text)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_exam_entry(uuid, text, jsonb, jsonb, integer, text, text)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_exam_entry(uuid, text, jsonb, jsonb, integer, text, text)
            TO app_api;
    """)

    # ── Exam room allocation ────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_exam_room_allocation(
            p_entry_id uuid,
            p_room_id text,
            p_seats_used integer
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.exam_room_allocations
                (entry_id, room_id, seats_used)
            VALUES
                (p_entry_id, p_room_id, p_seats_used)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_exam_room_allocation(uuid, text, integer)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_exam_room_allocation(uuid, text, integer)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_exam_room_allocation(uuid, text, integer)
            TO app_api;
    """)

    # ── Reschedule proposal ─────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_reschedule_proposal(
            p_proposal_id text,
            p_timetable_run_id uuid,
            p_status text,
            p_solver_status text,
            p_total_sessions integer,
            p_frozen_count integer,
            p_rescheduled_count integer,
            p_moved_count integer,
            p_added_count integer,
            p_unscheduled_count integer,
            p_conflicts jsonb,
            p_solve_time_seconds double precision,
            p_approved_schedule jsonb,
            p_proposed_by uuid
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.reschedule_proposals
                (proposal_id, timetable_run_id, status, solver_status,
                 total_sessions, frozen_count, rescheduled_count,
                 moved_count, added_count, unscheduled_count,
                 conflicts, solve_time_seconds, approved_schedule, proposed_by)
            VALUES
                (p_proposal_id, p_timetable_run_id, p_status, p_solver_status,
                 p_total_sessions, p_frozen_count, p_rescheduled_count,
                 p_moved_count, p_added_count, p_unscheduled_count,
                 p_conflicts, p_solve_time_seconds, p_approved_schedule, p_proposed_by)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_reschedule_proposal(text, uuid, text, text, integer, integer, integer, integer, integer, integer, jsonb, double precision, jsonb, uuid)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_reschedule_proposal(text, uuid, text, text, integer, integer, integer, integer, integer, integer, jsonb, double precision, jsonb, uuid)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_reschedule_proposal(text, uuid, text, text, integer, integer, integer, integer, integer, integer, jsonb, double precision, jsonb, uuid)
            TO app_api;
    """)

    # ── Reschedule change ───────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_insert_reschedule_change(
            p_proposal_id uuid,
            p_session_id text,
            p_kind text,
            p_before_day text DEFAULT NULL,
            p_before_period integer DEFAULT NULL,
            p_before_room_id text DEFAULT NULL,
            p_after_day text DEFAULT NULL,
            p_after_period integer DEFAULT NULL,
            p_after_room_id text DEFAULT NULL,
            p_reason text DEFAULT ''
        )
        RETURNS uuid
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_id uuid;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            INSERT INTO public.reschedule_changes
                (proposal_id, session_id, kind,
                 before_day, before_period, before_room_id,
                 after_day, after_period, after_room_id, reason)
            VALUES
                (p_proposal_id, p_session_id, p_kind,
                 p_before_day, p_before_period, p_before_room_id,
                 p_after_day, p_after_period, p_after_room_id, p_reason)
            RETURNING id INTO v_id;

            RETURN v_id;
        END;
        $$;

        ALTER FUNCTION public.admin_insert_reschedule_change(uuid, text, text, text, integer, text, text, integer, text, text)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_insert_reschedule_change(uuid, text, text, text, integer, text, text, integer, text, text)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_insert_reschedule_change(uuid, text, text, text, integer, text, text, integer, text, text)
            TO app_api;
    """)

    # ── Approve proposal (with self-approval check) ─────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_approve_proposal(
            p_proposal_id text,
            p_approver_id uuid
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        DECLARE
            v_proposal record;
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            SELECT * INTO v_proposal
            FROM public.reschedule_proposals
            WHERE proposal_id = p_proposal_id;

            IF v_proposal IS NULL THEN
                RAISE EXCEPTION 'Proposal not found';
            END IF;

            IF v_proposal.proposed_by = p_approver_id THEN
                RAISE EXCEPTION 'Cannot approve your own proposal';
            END IF;

            IF v_proposal.approved THEN
                RAISE EXCEPTION 'Proposal already approved';
            END IF;

            UPDATE public.reschedule_proposals
            SET approved = true,
                approved_by = p_approver_id,
                approved_at = now()
            WHERE proposal_id = p_proposal_id;

            RETURN v_proposal.approved_schedule;
        END;
        $$;

        ALTER FUNCTION public.admin_approve_proposal(text, uuid)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_approve_proposal(text, uuid)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_approve_proposal(text, uuid)
            TO app_api;
    """)

    # ── Update user role (admin only) ───────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.admin_update_user_role(
            p_user_id uuid,
            p_new_role text,
            p_admin_id uuid
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $$
        BEGIN
            IF public.app_role() IS DISTINCT FROM 'admin' THEN
                RAISE EXCEPTION 'Unauthorized: admin role required';
            END IF;

            IF p_new_role NOT IN ('admin', 'department_coordinator', 'faculty', 'club') THEN
                RAISE EXCEPTION 'Invalid role: %', p_new_role;
            END IF;

            UPDATE public.profiles
            SET role = p_new_role,
                updated_at = now()
            WHERE id = p_user_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'User not found: %', p_user_id;
            END IF;

            -- Audit the role change
            INSERT INTO public.audit_log (actor_id, action, target_type, target_id, detail)
            VALUES (p_admin_id, 'update_user_role', 'profile', p_user_id::text,
                    jsonb_build_object('new_role', p_new_role));
        END;
        $$;

        ALTER FUNCTION public.admin_update_user_role(uuid, text, uuid)
            OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.admin_update_user_role(uuid, text, uuid)
            FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text, uuid)
            TO app_api;
    """)


def downgrade() -> None:
    _functions = [
        "admin_update_user_role(uuid, text, uuid)",
        "admin_approve_proposal(text, uuid)",
        "admin_insert_reschedule_change(uuid, text, text, text, integer, text, text, integer, text, text)",
        "admin_insert_reschedule_proposal(text, uuid, text, text, integer, integer, integer, integer, integer, integer, jsonb, double precision, jsonb, uuid)",
        "admin_insert_exam_room_allocation(uuid, text, integer)",
        "admin_insert_exam_entry(uuid, text, jsonb, jsonb, integer, text, text)",
        "admin_insert_exam_run(integer, integer, integer, integer, integer, uuid)",
        "admin_insert_booking_decision(uuid, text, text, text, text, jsonb, jsonb, jsonb)",
        "admin_insert_booking_run(uuid, integer, integer, integer, integer, uuid)",
        "admin_insert_timetable_entry(uuid, text, text, text, text, text, text, integer, integer)",
        "admin_insert_timetable_run(text, text, integer, integer, double precision, jsonb, uuid)",
        "admin_write_audit_log(uuid, text, text, text, jsonb)",
    ]
    for func in _functions:
        op.execute(f"DROP FUNCTION IF EXISTS public.{func};")

