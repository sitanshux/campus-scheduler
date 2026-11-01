"""
005 - Create exam tables.

Tables: exam_runs, exam_entries, exam_room_allocations

Revision ID: 005
Revises: 004
Create Date: 2026-11-01 00:04:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── exam_runs ───────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.exam_runs (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            total_exams         integer NOT NULL,
            scheduled_count     integer NOT NULL,
            unscheduled_count   integer NOT NULL DEFAULT 0,
            slots_used          integer NOT NULL DEFAULT 0,
            slots_available     integer NOT NULL DEFAULT 0,
            is_active           boolean NOT NULL DEFAULT false,
            created_by          uuid NOT NULL REFERENCES public.profiles(id),
            created_at          timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_exam_runs_active
            ON public.exam_runs (is_active)
            WHERE is_active = true;
    """)
    op.execute("ALTER TABLE public.exam_runs OWNER TO app_owner;")

    # ── exam_entries ────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.exam_entries (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id      uuid NOT NULL REFERENCES public.exam_runs(id)
                        ON DELETE CASCADE,
            exam_id     text NOT NULL,
            course_ids  jsonb NOT NULL DEFAULT '[]',
            groups      jsonb NOT NULL DEFAULT '[]',
            size        integer NOT NULL,
            day         text NOT NULL,
            session     text NOT NULL CHECK (session IN ('AM', 'PM')),

            UNIQUE (run_id, exam_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ee_run
            ON public.exam_entries (run_id);
        CREATE INDEX IF NOT EXISTS idx_ee_day_session
            ON public.exam_entries (day, session);
    """)
    op.execute("ALTER TABLE public.exam_entries OWNER TO app_owner;")

    # ── exam_room_allocations ───────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.exam_room_allocations (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            entry_id    uuid NOT NULL REFERENCES public.exam_entries(id)
                        ON DELETE CASCADE,
            room_id     text NOT NULL,
            seats_used  integer NOT NULL CHECK (seats_used > 0)
        );

        CREATE INDEX IF NOT EXISTS idx_era_entry
            ON public.exam_room_allocations (entry_id);
        CREATE INDEX IF NOT EXISTS idx_era_room
            ON public.exam_room_allocations (room_id);
    """)
    op.execute("ALTER TABLE public.exam_room_allocations OWNER TO app_owner;")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.exam_room_allocations CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.exam_entries CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.exam_runs CASCADE;")

