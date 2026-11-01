"""
006 - Create rescheduling tables with self-approval CHECK constraint.

Tables: reschedule_proposals, reschedule_changes

Revision ID: 006
Revises: 005
Create Date: 2026-11-01 00:05:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── reschedule_proposals ────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.reschedule_proposals (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id         text NOT NULL UNIQUE,
            timetable_run_id    uuid REFERENCES public.timetable_runs(id),
            status              text NOT NULL DEFAULT 'feasible'
                                CHECK (status IN ('feasible', 'infeasible')),
            solver_status       text NOT NULL DEFAULT '',
            total_sessions      integer NOT NULL DEFAULT 0,
            frozen_count        integer NOT NULL DEFAULT 0,
            rescheduled_count   integer NOT NULL DEFAULT 0,
            moved_count         integer NOT NULL DEFAULT 0,
            added_count         integer NOT NULL DEFAULT 0,
            unscheduled_count   integer NOT NULL DEFAULT 0,
            conflicts           jsonb NOT NULL DEFAULT '[]',
            solve_time_seconds  double precision NOT NULL DEFAULT 0,
            approved_schedule   jsonb,
            approved            boolean NOT NULL DEFAULT false,
            proposed_by         uuid NOT NULL REFERENCES public.profiles(id),
            approved_by         uuid REFERENCES public.profiles(id),
            approved_at         timestamptz,
            created_at          timestamptz NOT NULL DEFAULT now(),

            -- Self-approval prevention: proposer cannot be approver
            CONSTRAINT no_self_approval
                CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM proposed_by)
        );

        CREATE INDEX IF NOT EXISTS idx_rp_proposal_id
            ON public.reschedule_proposals (proposal_id);
        CREATE INDEX IF NOT EXISTS idx_rp_approved
            ON public.reschedule_proposals (approved)
            WHERE approved = false;
        CREATE INDEX IF NOT EXISTS idx_rp_created
            ON public.reschedule_proposals (created_at DESC);
    """)
    op.execute("ALTER TABLE public.reschedule_proposals OWNER TO app_owner;")

    # ── reschedule_changes ──────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.reschedule_changes (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            proposal_id uuid NOT NULL REFERENCES public.reschedule_proposals(id)
                        ON DELETE CASCADE,
            session_id  text NOT NULL,
            kind        text NOT NULL
                        CHECK (kind IN ('moved', 'added', 'unscheduled')),
            before_day      text,
            before_period   integer,
            before_room_id  text,
            after_day       text,
            after_period    integer,
            after_room_id   text,
            reason          text NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_rc_proposal
            ON public.reschedule_changes (proposal_id);
    """)
    op.execute("ALTER TABLE public.reschedule_changes OWNER TO app_owner;")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.reschedule_changes CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.reschedule_proposals CASCADE;")

