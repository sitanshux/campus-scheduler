"""
001 - Create database roles and grant schema privileges.

Creates: app_owner (NOLOGIN), app_api (LOGIN, no RLS bypass), app_migrator (LOGIN).
Grants USAGE/CREATE on public schema as needed.

NOTE: Role creation requires superuser.  On Supabase, roles may already
exist or need to be created via the dashboard.  This migration uses
IF NOT EXISTS to be idempotent.  Passwords must be set separately
(never stored in migration files).

Revision ID: 001
Revises: None
Create Date: 2026-11-01 00:00:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── app_owner: owns tables and SECURITY DEFINER functions ──
    # NOLOGIN — never connects directly, only used as function execution context.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_owner') THEN
                CREATE ROLE app_owner NOLOGIN;
            END IF;
        END
        $$;
    """)
    op.execute("GRANT USAGE, CREATE ON SCHEMA public TO app_owner;")

    # ── app_api: FastAPI connects as this role ──
    # No BYPASSRLS — every query is subject to RLS policy evaluation.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_api') THEN
                CREATE ROLE app_api LOGIN;
            END IF;
        END
        $$;
    """)
    op.execute("GRANT USAGE ON SCHEMA public TO app_api;")

    # ── app_migrator privileges ──
    # The migrator role itself is created during initial setup (needs superuser).
    # Here we just ensure it can set role to app_owner for table ownership transfer.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_migrator') THEN
                CREATE ROLE app_migrator LOGIN;
            END IF;
        END
        $$;
    """)
    op.execute("GRANT USAGE, CREATE ON SCHEMA public TO app_migrator;")

    # app_migrator needs to be able to SET ROLE app_owner (to transfer ownership)
    op.execute("""
        DO $$
        BEGIN
            IF NOT pg_has_role('app_migrator', 'app_owner', 'MEMBER') THEN
                GRANT app_owner TO app_migrator;
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    # Revoke grants (roles are not dropped — they may own objects)
    op.execute("REVOKE app_owner FROM app_migrator;")
    op.execute("REVOKE USAGE, CREATE ON SCHEMA public FROM app_migrator;")
    op.execute("REVOKE USAGE ON SCHEMA public FROM app_api;")
    op.execute("REVOKE USAGE, CREATE ON SCHEMA public FROM app_owner;")

