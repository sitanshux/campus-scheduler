"""
007 - Create audit_log table.

Tables: audit_log
Indexes: on actor_id, action, created_at

Revision ID: 007
Revises: 006
Create Date: 2026-11-01 00:06:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.audit_log (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_id    uuid NOT NULL REFERENCES public.profiles(id),
            action      text NOT NULL,
            target_type text NOT NULL DEFAULT '',
            target_id   text NOT NULL DEFAULT '',
            detail      jsonb NOT NULL DEFAULT '{}',
            ip_address  inet,
            created_at  timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_audit_actor
            ON public.audit_log (actor_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action
            ON public.audit_log (action);
        CREATE INDEX IF NOT EXISTS idx_audit_created
            ON public.audit_log (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_target
            ON public.audit_log (target_type, target_id);
    """)
    op.execute("ALTER TABLE public.audit_log OWNER TO app_owner;")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.audit_log CASCADE;")

