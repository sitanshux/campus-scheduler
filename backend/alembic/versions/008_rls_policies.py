"""
008 - Enable RLS policies on all tables for both app_api and authenticated roles.

Each table gets:
- Row Level Security enabled
- SELECT/INSERT/UPDATE/DELETE policies for authenticated (Supabase client)
- SELECT/INSERT/UPDATE/DELETE policies for app_api (FastAPI backend)

Principle: least privilege. Direct writes are blocked; all writes go through
SECURITY DEFINER admin functions (migration 009) except:
- booking_requests INSERT (users submit their own)
- booking_requests UPDATE (users cancel their own, trigger-protected)

Revision ID: 008
Revises: 007
Create Date: 2026-11-01 00:07:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables where all authenticated users can read but nobody can write directly
_RESULT_TABLES = [
    "timetable_runs",
    "timetable_entries",
    "booking_runs",
    "booking_decisions",
    "exam_runs",
    "exam_entries",
    "exam_room_allocations",
    "reschedule_proposals",
    "reschedule_changes",
]


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════
    # PROFILES
    # ══════════════════════════════════════════════════════════
    op.execute("""
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

        -- === Supabase client (authenticated role) ===
        CREATE POLICY "profiles_select_own_client" ON public.profiles
            FOR SELECT TO authenticated
            USING (public.app_uid() = id);

        CREATE POLICY "profiles_select_admin_client" ON public.profiles
            FOR SELECT TO authenticated
            USING (public.get_my_role() = 'admin');

        CREATE POLICY "profiles_update_own_client" ON public.profiles
            FOR UPDATE TO authenticated
            USING (public.app_uid() = id)
            WITH CHECK (public.app_uid() = id);

        CREATE POLICY "profiles_no_insert_client" ON public.profiles
            FOR INSERT TO authenticated
            WITH CHECK (false);

        CREATE POLICY "profiles_no_delete_client" ON public.profiles
            FOR DELETE TO authenticated
            USING (false);

        -- === FastAPI backend (app_api role) ===
        CREATE POLICY "profiles_select_own_api" ON public.profiles
            FOR SELECT TO app_api
            USING (public.app_uid() = id);

        CREATE POLICY "profiles_select_admin_api" ON public.profiles
            FOR SELECT TO app_api
            USING (public.app_role() = 'admin');

        CREATE POLICY "profiles_no_direct_update_api" ON public.profiles
            FOR UPDATE TO app_api
            USING (false);

        CREATE POLICY "profiles_no_insert_api" ON public.profiles
            FOR INSERT TO app_api
            WITH CHECK (false);

        CREATE POLICY "profiles_no_delete_api" ON public.profiles
            FOR DELETE TO app_api
            USING (false);
    """)

    # ══════════════════════════════════════════════════════════
    # BOOKING REQUESTS (users can submit and cancel their own)
    # ══════════════════════════════════════════════════════════
    op.execute("""
        ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

        -- === Supabase client ===
        CREATE POLICY "br_select_own_client" ON public.booking_requests
            FOR SELECT TO authenticated
            USING (submitted_by = public.app_uid());

        CREATE POLICY "br_select_admin_client" ON public.booking_requests
            FOR SELECT TO authenticated
            USING (public.get_my_role() IN ('admin', 'department_coordinator'));

        CREATE POLICY "br_insert_own_client" ON public.booking_requests
            FOR INSERT TO authenticated
            WITH CHECK (submitted_by = public.app_uid());

        CREATE POLICY "br_cancel_own_client" ON public.booking_requests
            FOR UPDATE TO authenticated
            USING (submitted_by = public.app_uid())
            WITH CHECK (submitted_by = public.app_uid() AND cancelled = true);

        CREATE POLICY "br_no_delete_client" ON public.booking_requests
            FOR DELETE TO authenticated
            USING (false);

        -- === FastAPI backend ===
        CREATE POLICY "br_select_own_api" ON public.booking_requests
            FOR SELECT TO app_api
            USING (submitted_by = public.app_uid());

        CREATE POLICY "br_select_admin_api" ON public.booking_requests
            FOR SELECT TO app_api
            USING (public.app_role() IN ('admin', 'department_coordinator'));

        CREATE POLICY "br_insert_own_api" ON public.booking_requests
            FOR INSERT TO app_api
            WITH CHECK (submitted_by = public.app_uid());

        CREATE POLICY "br_cancel_own_api" ON public.booking_requests
            FOR UPDATE TO app_api
            USING (submitted_by = public.app_uid())
            WITH CHECK (submitted_by = public.app_uid() AND cancelled = true);
    """)

    # ══════════════════════════════════════════════════════════
    # RESULT TABLES — read-only for all, writes via admin functions
    # ══════════════════════════════════════════════════════════
    for table in _RESULT_TABLES:
        _prefix = table[:3]  # short prefix for policy names
        op.execute(f"""
            ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;

            -- Authenticated: read all, no direct writes
            CREATE POLICY "{_prefix}_select_client" ON public.{table}
                FOR SELECT TO authenticated
                USING (true);

            CREATE POLICY "{_prefix}_no_insert_client" ON public.{table}
                FOR INSERT TO authenticated
                WITH CHECK (false);

            CREATE POLICY "{_prefix}_no_update_client" ON public.{table}
                FOR UPDATE TO authenticated
                USING (false);

            CREATE POLICY "{_prefix}_no_delete_client" ON public.{table}
                FOR DELETE TO authenticated
                USING (false);

            -- app_api: read all, no direct writes (must use admin functions)
            CREATE POLICY "{_prefix}_select_api" ON public.{table}
                FOR SELECT TO app_api
                USING (true);

            CREATE POLICY "{_prefix}_no_insert_api" ON public.{table}
                FOR INSERT TO app_api
                WITH CHECK (false);

            CREATE POLICY "{_prefix}_no_update_api" ON public.{table}
                FOR UPDATE TO app_api
                USING (false);

            CREATE POLICY "{_prefix}_no_delete_api" ON public.{table}
                FOR DELETE TO app_api
                USING (false);
        """)

    # ══════════════════════════════════════════════════════════
    # AUDIT LOG — admin read only, writes via admin functions
    # ══════════════════════════════════════════════════════════
    op.execute("""
        ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "audit_select_admin_client" ON public.audit_log
            FOR SELECT TO authenticated
            USING (public.get_my_role() = 'admin');

        CREATE POLICY "audit_select_admin_api" ON public.audit_log
            FOR SELECT TO app_api
            USING (public.app_role() = 'admin');

        CREATE POLICY "audit_no_insert" ON public.audit_log
            FOR INSERT TO authenticated, app_api
            WITH CHECK (false);

        CREATE POLICY "audit_no_update" ON public.audit_log
            FOR UPDATE TO authenticated, app_api
            USING (false);

        CREATE POLICY "audit_no_delete" ON public.audit_log
            FOR DELETE TO authenticated, app_api
            USING (false);
    """)


def downgrade() -> None:
    # Drop all policies and disable RLS
    _all_tables = [
        "profiles", "booking_requests",
        *_RESULT_TABLES,
        "audit_log",
    ]
    for table in _all_tables:
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;")
        # Drop all policies on the table
        op.execute(f"""
            DO $$
            DECLARE
                pol record;
            BEGIN
                FOR pol IN
                    SELECT policyname FROM pg_policies
                    WHERE tablename = '{table}' AND schemaname = 'public'
                LOOP
                    EXECUTE format('DROP POLICY %I ON public.{table}', pol.policyname);
                END LOOP;
            END
            $$;
        """)

