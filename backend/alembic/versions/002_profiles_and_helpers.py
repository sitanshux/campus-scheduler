"""
002 - Create profiles table, helper functions, and profile field protection trigger.

Tables: profiles
Functions: app_uid(), app_role(), get_my_role(), protect_profile_fields()
Triggers: enforce_protected_profile_fields

Revision ID: 002
Revises: 001
Create Date: 2026-11-01 00:01:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── profiles table ──────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.profiles (
            id          uuid PRIMARY KEY,
            email       text NOT NULL,
            full_name   text NOT NULL DEFAULT '',
            role        text NOT NULL DEFAULT 'faculty'
                        CHECK (role IN (
                            'admin',
                            'department_coordinator',
                            'faculty',
                            'club'
                        )),
            department  text,
            faculty_id  text,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_profiles_email
            ON public.profiles (email);
        CREATE INDEX IF NOT EXISTS idx_profiles_role
            ON public.profiles (role);
        CREATE INDEX IF NOT EXISTS idx_profiles_department
            ON public.profiles (department)
            WHERE department IS NOT NULL;
    """)

    # Transfer ownership to app_owner
    op.execute("ALTER TABLE public.profiles OWNER TO app_owner;")

    # ── Claim-reading helper functions ──────────────────────
    # app_uid(): returns the authenticated user's UUID from GUC
    op.execute("""
        CREATE OR REPLACE FUNCTION public.app_uid()
        RETURNS uuid
        LANGUAGE sql STABLE
        SECURITY INVOKER
        SET search_path = ''
        AS $$
            SELECT nullif(current_setting('app.current_user_id', true), '')::uuid;
        $$;

        ALTER FUNCTION public.app_uid() OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.app_uid() FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.app_uid() TO app_api;
    """)

    # app_role(): returns the authenticated user's role from GUC
    op.execute("""
        CREATE OR REPLACE FUNCTION public.app_role()
        RETURNS text
        LANGUAGE sql STABLE
        SECURITY INVOKER
        SET search_path = ''
        AS $$
            SELECT nullif(current_setting('app.current_user_role', true), '');
        $$;

        ALTER FUNCTION public.app_role() OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.app_role() FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION public.app_role() TO app_api;
    """)

    # ── get_my_role(): SECURITY DEFINER helper ──────────────────
    # Uses app_uid() (GUC-based) instead of auth.uid() to avoid
    # requiring USAGE on the Supabase auth schema.
    # Hardened: empty search_path, fully qualified, restricted owner.
    op.execute("""
        CREATE OR REPLACE FUNCTION public.get_my_role()
        RETURNS text
        LANGUAGE sql STABLE
        SECURITY DEFINER
        SET search_path = ''
        AS $$
            SELECT role FROM public.profiles WHERE id = public.app_uid();
        $$;

        ALTER FUNCTION public.get_my_role() OWNER TO app_owner;
        REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
    """)

    # Grant get_my_role to authenticated and app_api
    # (authenticated may not exist yet on non-Supabase DBs — ignore errors)
    op.execute("""
        DO $$
        BEGIN
            GRANT EXECUTE ON FUNCTION public.get_my_role() TO app_api;
            BEGIN
                GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
            EXCEPTION WHEN undefined_object THEN
                -- 'authenticated' role doesn't exist (non-Supabase DB)
                NULL;
            END;
        END
        $$;
    """)

    # ── Profile field protection trigger ────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION public.protect_profile_fields()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SET search_path = ''
        AS $$
        BEGIN
            -- Protected fields: role, department, faculty_id
            -- Only allow changes if the caller is admin.
            IF (OLD.role IS DISTINCT FROM NEW.role
                OR OLD.department IS DISTINCT FROM NEW.department
                OR OLD.faculty_id IS DISTINCT FROM NEW.faculty_id)
            THEN
                IF coalesce(
                    nullif(current_setting('app.current_user_role', true), ''),
                    'none'
                ) IS DISTINCT FROM 'admin'
                THEN
                    RAISE EXCEPTION
                        'Cannot modify protected fields (role, department, faculty_id). Admin required.';
                END IF;
            END IF;

            NEW.updated_at := now();
            RETURN NEW;
        END;
        $$;

        ALTER FUNCTION public.protect_profile_fields() OWNER TO app_owner;

        CREATE TRIGGER enforce_protected_profile_fields
            BEFORE UPDATE ON public.profiles
            FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS enforce_protected_profile_fields ON public.profiles;")
    op.execute("DROP FUNCTION IF EXISTS public.protect_profile_fields();")
    op.execute("DROP FUNCTION IF EXISTS public.get_my_role();")
    op.execute("DROP FUNCTION IF EXISTS public.app_role();")
    op.execute("DROP FUNCTION IF EXISTS public.app_uid();")
    op.execute("DROP TABLE IF EXISTS public.profiles CASCADE;")

