"""
004 - Create booking tables + cancellation trigger.

Tables: booking_requests, booking_runs, booking_decisions
Triggers: enforce_booking_cancel_only
Functions: enforce_cancel_only()

Revision ID: 004
Revises: 003
Create Date: 2026-11-01 00:03:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── booking_requests ────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.booking_requests (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            request_code        text NOT NULL UNIQUE,
            submitted_at        timestamptz NOT NULL DEFAULT now(),
            submitted_by        uuid NOT NULL REFERENCES public.profiles(id),
            requester_name      text NOT NULL,
            role                text NOT NULL,
            department          text,
            requested_category  text NOT NULL,
            title               text NOT NULL,
            attendance          integer NOT NULL CHECK (attendance > 0),
            duration_periods    integer NOT NULL CHECK (duration_periods > 0),
            windows             jsonb NOT NULL DEFAULT '[]',
            room_types          jsonb NOT NULL DEFAULT '[]',
            needs               jsonb NOT NULL DEFAULT '[]',
            requested_room      text,
            mandatory_for_groups jsonb NOT NULL DEFAULT '[]',
            series_id           text,
            raw_text            text NOT NULL DEFAULT '',
            cancelled           boolean NOT NULL DEFAULT false,
            cancelled_at        timestamptz,
            cancelled_by        uuid REFERENCES public.profiles(id),
            cancel_note         text
        );

        CREATE INDEX IF NOT EXISTS idx_br_submitted_by
            ON public.booking_requests (submitted_by);
        CREATE INDEX IF NOT EXISTS idx_br_submitted_at
            ON public.booking_requests (submitted_at DESC);
        CREATE INDEX IF NOT EXISTS idx_br_cancelled
            ON public.booking_requests (cancelled)
            WHERE cancelled = false;
        CREATE INDEX IF NOT EXISTS idx_br_series
            ON public.booking_requests (series_id)
            WHERE series_id IS NOT NULL;
    """)
    op.execute("ALTER TABLE public.booking_requests OWNER TO app_owner;")

    # ── booking_runs ────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.booking_runs (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            timetable_run_id uuid REFERENCES public.timetable_runs(id),
            total_requests  integer NOT NULL,
            approved_count  integer NOT NULL DEFAULT 0,
            rejected_count  integer NOT NULL DEFAULT 0,
            alt_count       integer NOT NULL DEFAULT 0,
            created_by      uuid NOT NULL REFERENCES public.profiles(id),
            created_at      timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_brun_created
            ON public.booking_runs (created_at DESC);
    """)
    op.execute("ALTER TABLE public.booking_runs OWNER TO app_owner;")

    # ── booking_decisions ───────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.booking_decisions (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id      uuid NOT NULL REFERENCES public.booking_runs(id)
                        ON DELETE CASCADE,
            request_id  text NOT NULL,
            title       text NOT NULL,
            requester   text NOT NULL,
            status      text NOT NULL
                        CHECK (status IN ('approved', 'rejected', 'alternative_offered')),
            allocated   jsonb,
            alternative jsonb,
            reasons     jsonb NOT NULL DEFAULT '[]',

            UNIQUE (run_id, request_id)
        );

        CREATE INDEX IF NOT EXISTS idx_bd_run
            ON public.booking_decisions (run_id);
        CREATE INDEX IF NOT EXISTS idx_bd_request
            ON public.booking_decisions (request_id);
    """)
    op.execute("ALTER TABLE public.booking_decisions OWNER TO app_owner;")

    # ── Cancellation protection trigger ─────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.enforce_cancel_only()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = ''
        AS $$
        BEGIN
            -- Only fires when transitioning from not-cancelled to cancelled.
            -- Admin (via SECURITY DEFINER functions) can modify any field.
            IF NEW.cancelled = true AND OLD.cancelled = false THEN
                -- Verify only cancellation fields changed
                IF NEW.request_code        IS DISTINCT FROM OLD.request_code
                OR NEW.submitted_at        IS DISTINCT FROM OLD.submitted_at
                OR NEW.submitted_by        IS DISTINCT FROM OLD.submitted_by
                OR NEW.requester_name      IS DISTINCT FROM OLD.requester_name
                OR NEW.role                IS DISTINCT FROM OLD.role
                OR NEW.department          IS DISTINCT FROM OLD.department
                OR NEW.requested_category  IS DISTINCT FROM OLD.requested_category
                OR NEW.title               IS DISTINCT FROM OLD.title
                OR NEW.attendance          IS DISTINCT FROM OLD.attendance
                OR NEW.duration_periods    IS DISTINCT FROM OLD.duration_periods
                OR NEW.windows             IS DISTINCT FROM OLD.windows
                OR NEW.room_types          IS DISTINCT FROM OLD.room_types
                OR NEW.needs               IS DISTINCT FROM OLD.needs
                OR NEW.requested_room      IS DISTINCT FROM OLD.requested_room
                OR NEW.mandatory_for_groups IS DISTINCT FROM OLD.mandatory_for_groups
                OR NEW.series_id           IS DISTINCT FROM OLD.series_id
                OR NEW.raw_text            IS DISTINCT FROM OLD.raw_text
                THEN
                    RAISE EXCEPTION
                        'Only cancelled, cancelled_at, cancelled_by, and cancel_note may change during cancellation';
                END IF;
            END IF;

            -- Block un-cancellation for non-admin
            IF NEW.cancelled = false AND OLD.cancelled = true THEN
                IF coalesce(
                    nullif(current_setting('app.current_user_role', true), ''),
                    'none'
                ) IS DISTINCT FROM 'admin' THEN
                    RAISE EXCEPTION 'Only admin can un-cancel a booking request';
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$;

        ALTER FUNCTION public.enforce_cancel_only() OWNER TO app_owner;

        CREATE TRIGGER enforce_booking_cancel_only
            BEFORE UPDATE ON public.booking_requests
            FOR EACH ROW EXECUTE FUNCTION public.enforce_cancel_only();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS enforce_booking_cancel_only ON public.booking_requests;")
    op.execute("DROP FUNCTION IF EXISTS public.enforce_cancel_only();")
    op.execute("DROP TABLE IF EXISTS public.booking_decisions CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.booking_runs CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.booking_requests CASCADE;")

