"""
003 - Create timetable tables (runs + entries).

Tables: timetable_runs, timetable_entries
Indexes: on run_id, faculty_id, room_id, group_id, day/period

Revision ID: 003
Revises: 002
Create Date: 2026-11-01 00:02:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── timetable_runs ──────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.timetable_runs (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            dataset_id      text NOT NULL,
            solver_status   text NOT NULL,
            total_sessions  integer NOT NULL,
            scheduled_count integer NOT NULL,
            solve_time_sec  double precision NOT NULL DEFAULT 0,
            diagnostics     jsonb NOT NULL DEFAULT '{}',
            is_active       boolean NOT NULL DEFAULT false,
            created_by      uuid NOT NULL REFERENCES public.profiles(id),
            created_at      timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_timetable_runs_active
            ON public.timetable_runs (is_active)
            WHERE is_active = true;
        CREATE INDEX IF NOT EXISTS idx_timetable_runs_created
            ON public.timetable_runs (created_at DESC);
    """)
    op.execute("ALTER TABLE public.timetable_runs OWNER TO app_owner;")

    # ── timetable_entries ───────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.timetable_entries (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id      uuid NOT NULL REFERENCES public.timetable_runs(id)
                        ON DELETE CASCADE,
            session_id  text NOT NULL,
            course_id   text NOT NULL,
            faculty_id  text NOT NULL,
            group_id    text NOT NULL,
            room_id     text NOT NULL,
            day         text NOT NULL,
            period      integer NOT NULL,
            duration    integer NOT NULL DEFAULT 1,

            UNIQUE (run_id, session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_te_run
            ON public.timetable_entries (run_id);
        CREATE INDEX IF NOT EXISTS idx_te_faculty
            ON public.timetable_entries (faculty_id, day, period);
        CREATE INDEX IF NOT EXISTS idx_te_room
            ON public.timetable_entries (room_id, day, period);
        CREATE INDEX IF NOT EXISTS idx_te_group
            ON public.timetable_entries (group_id, day, period);
    """)
    op.execute("ALTER TABLE public.timetable_entries OWNER TO app_owner;")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.timetable_entries CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.timetable_runs CASCADE;")

