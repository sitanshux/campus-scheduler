"""
010 - Least-privilege grants for app_api and app_owner.

Grants:
- app_api: SELECT on all tables (RLS enforced), INSERT on booking_requests,
  column-level UPDATE on booking_requests (cancellation fields only).
- app_owner: ALL on all tables + sequences (for SECURITY DEFINER functions).

Column-level grants on booking_requests enforce defense-in-depth:
even if RLS is misconfigured, app_api cannot UPDATE non-cancellation fields.

Revision ID: 010
Revises: 009
Create Date: 2026-11-01 00:09:00.000000+00:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── app_owner: full access (used by SECURITY DEFINER functions) ──
    op.execute("""
        GRANT ALL ON ALL TABLES IN SCHEMA public TO app_owner;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_owner;
    """)

    # ── app_api: least-privilege ────────────────────────────

    # SELECT on all tables (RLS enforced per-row)
    op.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_api;")

    # INSERT on booking_requests (users submit their own, RLS enforced)
    op.execute("GRANT INSERT ON public.booking_requests TO app_api;")

    # Column-level UPDATE on booking_requests: ONLY cancellation fields
    # This is defense-in-depth — the trigger also enforces this.
    op.execute("""
        GRANT UPDATE (cancelled, cancelled_at, cancelled_by, cancel_note)
            ON public.booking_requests TO app_api;
    """)

    # No INSERT/UPDATE on result tables — all writes go through admin functions.
    # No DELETE on any table for app_api.

    # Sequence usage for booking_requests INSERT (gen_random_uuid doesn't need it,
    # but grant for safety if any table uses serial/bigserial in future)
    op.execute("GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_api;")


def downgrade() -> None:
    op.execute("""
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_api;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_api;
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_owner;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_owner;
    """)

