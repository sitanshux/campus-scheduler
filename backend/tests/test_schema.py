"""
Tests for Phase 2: Alembic configuration, migration structure, and schema correctness.

These tests validate:
1. Alembic configuration is valid
2. Migration chain is linear and complete (001→010)
3. Migration files are well-formed (have upgrade/downgrade)
4. SQLAlchemy ORM models reflect the planned schema
5. Schema constraints (CHECK, UNIQUE, FK, self-approval)
6. Migration SQL contains required security constructs
7. No BYPASSRLS anywhere in migrations
8. All tables owned by app_owner
9. Column-level grants for booking cancellation
10. Trigger and function definitions present

These tests do NOT require a live database — they validate the migration
source code and ORM model structure.
"""

from __future__ import annotations

import importlib
import re
import textwrap
from pathlib import Path

import pytest

# ── Paths ───────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _PROJECT_ROOT / "alembic.ini"
_ALEMBIC_DIR = _PROJECT_ROOT / "backend" / "alembic"
_VERSIONS_DIR = _ALEMBIC_DIR / "versions"
_ENV_PY = _ALEMBIC_DIR / "env.py"

# Expected migration chain
_MIGRATIONS = [
    ("001", None,  "create_roles"),
    ("002", "001", "profiles_and_helpers"),
    ("003", "002", "timetable_tables"),
    ("004", "003", "booking_tables"),
    ("005", "004", "exam_tables"),
    ("006", "005", "rescheduling_tables"),
    ("007", "006", "audit_log"),
    ("008", "007", "rls_policies"),
    ("009", "008", "admin_functions"),
    ("010", "009", "grants"),
]


def _load_migration_module(rev: str, slug: str):
    """Dynamically import a migration module."""
    filename = f"{rev}_{slug}"
    spec = importlib.util.spec_from_file_location(
        filename,
        _VERSIONS_DIR / f"{filename}.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _read_migration_source(rev: str, slug: str) -> str:
    """Read the raw source of a migration file."""
    path = _VERSIONS_DIR / f"{rev}_{slug}.py"
    return path.read_text(encoding="utf-8")


# ═══════════════════════════════════════════════════════════
# ALEMBIC CONFIGURATION TESTS
# ═══════════════════════════════════════════════════════════


class TestAlembicConfig:
    """Verify alembic.ini and env.py are correctly configured."""

    def test_alembic_ini_exists(self):
        assert _ALEMBIC_INI.exists(), "alembic.ini missing at project root"

    def test_alembic_ini_script_location(self):
        content = _ALEMBIC_INI.read_text()
        assert "script_location = backend/alembic" in content

    def test_alembic_ini_no_hardcoded_url(self):
        """sqlalchemy.url must be blank — URL comes from env var."""
        content = _ALEMBIC_INI.read_text()
        for line in content.splitlines():
            if line.startswith("sqlalchemy.url"):
                # Should be empty or just whitespace after =
                value = line.split("=", 1)[1].strip()
                assert value == "", f"sqlalchemy.url should be blank, got '{value}'"

    def test_env_py_exists(self):
        assert _ENV_PY.exists()

    def test_env_py_uses_migration_database_url(self):
        content = _ENV_PY.read_text()
        assert "MIGRATION_DATABASE_URL" in content, \
            "env.py must read MIGRATION_DATABASE_URL, not DATABASE_URL"

    def test_env_py_does_not_use_database_url_directly(self):
        """env.py should not use the runtime DATABASE_URL."""
        content = _ENV_PY.read_text()
        # It should reference MIGRATION_DATABASE_URL, not bare DATABASE_URL
        # (exclude the MIGRATION_ prefixed one)
        lines = content.splitlines()
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "DATABASE_URL" in stripped and "MIGRATION_DATABASE_URL" not in stripped:
                pytest.fail(f"env.py references DATABASE_URL directly: {stripped}")

    def test_script_template_exists(self):
        assert (_ALEMBIC_DIR / "script.py.mako").exists()

    def test_versions_dir_exists(self):
        assert _VERSIONS_DIR.exists()
        assert _VERSIONS_DIR.is_dir()


# ═══════════════════════════════════════════════════════════
# MIGRATION CHAIN TESTS
# ═══════════════════════════════════════════════════════════


class TestMigrationChain:
    """Verify the migration chain is linear and complete."""

    def test_all_migration_files_exist(self):
        for rev, _, slug in _MIGRATIONS:
            path = _VERSIONS_DIR / f"{rev}_{slug}.py"
            assert path.exists(), f"Missing migration: {path.name}"

    def test_migration_count(self):
        py_files = list(_VERSIONS_DIR.glob("*.py"))
        # Exclude __pycache__ and __init__
        migration_files = [f for f in py_files if not f.name.startswith("_")]
        assert len(migration_files) == 10, \
            f"Expected 10 migrations, found {len(migration_files)}"

    @pytest.mark.parametrize("rev,down_rev,slug", _MIGRATIONS)
    def test_revision_ids(self, rev, down_rev, slug):
        mod = _load_migration_module(rev, slug)
        assert mod.revision == rev
        assert mod.down_revision == down_rev

    @pytest.mark.parametrize("rev,_,slug", _MIGRATIONS)
    def test_has_upgrade_and_downgrade(self, rev, _, slug):
        mod = _load_migration_module(rev, slug)
        assert hasattr(mod, "upgrade") and callable(mod.upgrade)
        assert hasattr(mod, "downgrade") and callable(mod.downgrade)

    def test_chain_is_linear(self):
        """Each migration's down_revision points to the previous."""
        for i, (rev, down_rev, _) in enumerate(_MIGRATIONS):
            if i == 0:
                assert down_rev is None, "First migration must have down_revision=None"
            else:
                expected = _MIGRATIONS[i - 1][0]
                assert down_rev == expected, \
                    f"Migration {rev} down_revision={down_rev}, expected {expected}"


# ═══════════════════════════════════════════════════════════
# ROLE CREATION TESTS (Migration 001)
# ═══════════════════════════════════════════════════════════


class TestRolesCreation:
    """Verify migration 001 creates roles correctly."""

    def setup_method(self):
        self.src = _read_migration_source("001", "create_roles")

    def test_creates_app_owner_nologin(self):
        assert "app_owner" in self.src
        assert "NOLOGIN" in self.src

    def test_creates_app_api_login(self):
        assert "app_api" in self.src
        assert "CREATE ROLE app_api LOGIN" in self.src

    def test_no_bypassrls(self):
        """CRITICAL: No role gets BYPASSRLS in SQL statements."""
        for line in self.src.splitlines():
            stripped = line.strip()
            # Skip Python comments, docstrings, and SQL comments
            if stripped.startswith("#") or stripped.startswith("--"):
                continue
            if stripped.startswith('"""') or stripped.startswith("'''"):
                continue
            assert "BYPASSRLS" not in stripped.upper(), \
                f"BYPASSRLS found in SQL: {stripped}"

    def test_grants_schema_usage(self):
        assert "GRANT USAGE, CREATE ON SCHEMA public TO app_owner" in self.src
        assert "GRANT USAGE ON SCHEMA public TO app_api" in self.src

    def test_migrator_gets_create(self):
        assert "GRANT USAGE, CREATE ON SCHEMA public TO app_migrator" in self.src

    def test_migrator_gets_app_owner_membership(self):
        assert "GRANT app_owner TO app_migrator" in self.src

    def test_no_hardcoded_passwords(self):
        """Passwords must never be in migration files."""
        # Allow the word 'password' in comments but not in SQL
        for line in self.src.splitlines():
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("--"):
                continue
            if "PASSWORD" in stripped.upper() and "LOGIN PASSWORD" in stripped.upper():
                # Check it's not setting an actual password value
                assert "PASSWORD 'migrate" not in stripped, \
                    "Hardcoded password found in migration"


# ═══════════════════════════════════════════════════════════
# PROFILES & HELPERS TESTS (Migration 002)
# ═══════════════════════════════════════════════════════════


class TestProfilesMigration:
    """Verify migration 002 creates profiles and helper functions."""

    def setup_method(self):
        self.src = _read_migration_source("002", "profiles_and_helpers")

    def test_profiles_table(self):
        assert "CREATE TABLE" in self.src
        assert "profiles" in self.src

    def test_profiles_columns(self):
        for col in ["id", "email", "full_name", "role", "department",
                     "faculty_id", "created_at", "updated_at"]:
            assert col in self.src, f"Missing column: {col}"

    def test_role_check_constraint(self):
        assert "'admin'" in self.src
        assert "'department_coordinator'" in self.src
        assert "'faculty'" in self.src
        assert "'club'" in self.src

    def test_app_uid_function(self):
        assert "app_uid()" in self.src
        assert "SECURITY INVOKER" in self.src
        assert "app.current_user_id" in self.src

    def test_app_role_function(self):
        assert "app_role()" in self.src
        assert "app.current_user_role" in self.src

    def test_get_my_role_security_definer(self):
        assert "get_my_role()" in self.src
        assert "SECURITY DEFINER" in self.src

    def test_get_my_role_empty_search_path(self):
        assert "search_path = ''" in self.src

    def test_get_my_role_fully_qualified(self):
        assert "public.profiles" in self.src

    def test_get_my_role_owned_by_app_owner(self):
        assert "OWNER TO app_owner" in self.src

    def test_get_my_role_restricted_execute(self):
        assert "REVOKE ALL ON FUNCTION public.get_my_role()" in self.src

    def test_profile_protection_trigger(self):
        assert "protect_profile_fields" in self.src
        assert "BEFORE UPDATE ON public.profiles" in self.src

    def test_trigger_blocks_role_change(self):
        assert "OLD.role IS DISTINCT FROM NEW.role" in self.src

    def test_trigger_blocks_department_change(self):
        assert "OLD.department IS DISTINCT FROM NEW.department" in self.src

    def test_trigger_blocks_faculty_id_change(self):
        assert "OLD.faculty_id IS DISTINCT FROM NEW.faculty_id" in self.src

    def test_trigger_checks_admin(self):
        """Non-admin should be rejected."""
        assert "'admin'" in self.src
        assert "Admin required" in self.src

    def test_table_owned_by_app_owner(self):
        assert "ALTER TABLE public.profiles OWNER TO app_owner" in self.src


# ═══════════════════════════════════════════════════════════
# TIMETABLE TESTS (Migration 003)
# ═══════════════════════════════════════════════════════════


class TestTimetableMigration:

    def setup_method(self):
        self.src = _read_migration_source("003", "timetable_tables")

    def test_timetable_runs_table(self):
        assert "timetable_runs" in self.src

    def test_timetable_entries_table(self):
        assert "timetable_entries" in self.src

    def test_entries_fk_to_runs(self):
        assert "REFERENCES public.timetable_runs(id)" in self.src

    def test_cascade_delete(self):
        assert "ON DELETE CASCADE" in self.src

    def test_unique_run_session(self):
        assert "UNIQUE (run_id, session_id)" in self.src

    def test_indexes_exist(self):
        for idx in ["idx_te_run", "idx_te_faculty", "idx_te_room", "idx_te_group"]:
            assert idx in self.src, f"Missing index: {idx}"

    def test_tables_owned_by_app_owner(self):
        assert "ALTER TABLE public.timetable_runs OWNER TO app_owner" in self.src
        assert "ALTER TABLE public.timetable_entries OWNER TO app_owner" in self.src


# ═══════════════════════════════════════════════════════════
# BOOKING TESTS (Migration 004)
# ═══════════════════════════════════════════════════════════


class TestBookingMigration:

    def setup_method(self):
        self.src = _read_migration_source("004", "booking_tables")

    def test_booking_requests_table(self):
        assert "booking_requests" in self.src

    def test_booking_runs_table(self):
        assert "booking_runs" in self.src

    def test_booking_decisions_table(self):
        assert "booking_decisions" in self.src

    def test_attendance_check(self):
        assert "attendance > 0" in self.src

    def test_duration_check(self):
        assert "duration_periods > 0" in self.src

    def test_status_check(self):
        assert "'approved'" in self.src
        assert "'rejected'" in self.src
        assert "'alternative_offered'" in self.src

    def test_cancellation_columns(self):
        for col in ["cancelled", "cancelled_at", "cancelled_by", "cancel_note"]:
            assert col in self.src, f"Missing cancellation column: {col}"

    def test_cancel_trigger(self):
        assert "enforce_cancel_only" in self.src
        assert "BEFORE UPDATE ON public.booking_requests" in self.src

    def test_cancel_trigger_blocks_field_changes(self):
        src = self.src
        for field in ["request_code", "submitted_at", "submitted_by",
                       "requester_name", "title", "attendance",
                       "duration_periods", "requested_category"]:
            assert f"NEW.{field}" in src, \
                f"Cancel trigger must check field: {field}"

    def test_cancel_trigger_blocks_uncancellation(self):
        assert "Only admin can un-cancel" in self.src

    def test_submitted_by_fk(self):
        assert "REFERENCES public.profiles(id)" in self.src


# ═══════════════════════════════════════════════════════════
# EXAM TESTS (Migration 005)
# ═══════════════════════════════════════════════════════════


class TestExamMigration:

    def setup_method(self):
        self.src = _read_migration_source("005", "exam_tables")

    def test_exam_runs_table(self):
        assert "exam_runs" in self.src

    def test_exam_entries_table(self):
        assert "exam_entries" in self.src

    def test_exam_room_allocations_table(self):
        assert "exam_room_allocations" in self.src

    def test_session_check(self):
        assert "'AM'" in self.src
        assert "'PM'" in self.src

    def test_seats_check(self):
        assert "seats_used > 0" in self.src


# ═══════════════════════════════════════════════════════════
# RESCHEDULING TESTS (Migration 006)
# ═══════════════════════════════════════════════════════════


class TestReschedulingMigration:

    def setup_method(self):
        self.src = _read_migration_source("006", "rescheduling_tables")

    def test_reschedule_proposals_table(self):
        assert "reschedule_proposals" in self.src

    def test_reschedule_changes_table(self):
        assert "reschedule_changes" in self.src

    def test_self_approval_check_constraint(self):
        """CRITICAL: DB-level self-approval prevention."""
        assert "no_self_approval" in self.src
        assert "approved_by IS DISTINCT FROM proposed_by" in self.src

    def test_kind_check(self):
        assert "'moved'" in self.src
        assert "'added'" in self.src
        assert "'unscheduled'" in self.src

    def test_proposed_by_fk(self):
        assert "proposed_by" in self.src
        assert "REFERENCES public.profiles(id)" in self.src


# ═══════════════════════════════════════════════════════════
# AUDIT LOG TESTS (Migration 007)
# ═══════════════════════════════════════════════════════════


class TestAuditLogMigration:

    def setup_method(self):
        self.src = _read_migration_source("007", "audit_log")

    def test_audit_log_table(self):
        assert "audit_log" in self.src

    def test_audit_columns(self):
        for col in ["actor_id", "action", "target_type", "target_id",
                     "detail", "ip_address", "created_at"]:
            assert col in self.src

    def test_owned_by_app_owner(self):
        assert "OWNER TO app_owner" in self.src


# ═══════════════════════════════════════════════════════════
# RLS POLICY TESTS (Migration 008)
# ═══════════════════════════════════════════════════════════


class TestRLSPolicies:
    """Verify migration 008 creates correct RLS policies."""

    def setup_method(self):
        self.src = _read_migration_source("008", "rls_policies")

    def test_rls_enabled_on_profiles(self):
        assert "ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY" in self.src

    def test_rls_enabled_on_booking_requests(self):
        assert "ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY" in self.src

    def test_rls_enabled_on_result_tables(self):
        # Result tables are generated via f-string loop, so check the list
        result_tables = [
            "timetable_runs", "timetable_entries",
            "booking_runs", "booking_decisions",
            "exam_runs", "exam_entries", "exam_room_allocations",
            "reschedule_proposals", "reschedule_changes",
        ]
        for table in result_tables:
            # Either literal or via f-string variable
            has_literal = f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY" in self.src
            has_fstring = "{table} ENABLE ROW LEVEL SECURITY" in self.src
            assert has_literal or has_fstring, \
                f"RLS not enabled on {table}"

    def test_rls_enabled_on_audit_log(self):
        assert "ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY" in self.src

    def test_profiles_select_own_policies(self):
        assert "profiles_select_own_client" in self.src
        assert "profiles_select_own_api" in self.src

    def test_profiles_admin_select_policies(self):
        assert "profiles_select_admin_client" in self.src
        assert "profiles_select_admin_api" in self.src

    def test_profiles_no_insert(self):
        assert "profiles_no_insert_client" in self.src
        assert "profiles_no_insert_api" in self.src

    def test_profiles_no_delete(self):
        assert "profiles_no_delete_client" in self.src
        assert "profiles_no_delete_api" in self.src

    def test_profiles_api_no_direct_update(self):
        assert "profiles_no_direct_update_api" in self.src

    def test_booking_requests_select_own(self):
        assert "br_select_own_client" in self.src
        assert "br_select_own_api" in self.src

    def test_booking_requests_admin_select(self):
        assert "br_select_admin_client" in self.src
        assert "br_select_admin_api" in self.src

    def test_booking_requests_insert_own(self):
        assert "br_insert_own_client" in self.src
        assert "br_insert_own_api" in self.src

    def test_booking_requests_cancel_own(self):
        assert "br_cancel_own_client" in self.src
        assert "br_cancel_own_api" in self.src

    def test_booking_cancel_requires_true(self):
        """Cancel policy requires cancelled = true."""
        assert "cancelled = true" in self.src

    def test_result_tables_no_direct_writes(self):
        """Result tables block direct INSERT/UPDATE for both roles."""
        for prefix in ["tim", "boo", "exa", "res"]:
            assert f"no_insert_client" in self.src
            assert f"no_insert_api" in self.src

    def test_audit_admin_only_select(self):
        assert "audit_select_admin_client" in self.src
        assert "audit_select_admin_api" in self.src

    def test_audit_no_direct_writes(self):
        assert "audit_no_insert" in self.src
        assert "audit_no_update" in self.src
        assert "audit_no_delete" in self.src

    def test_uses_app_uid_for_api(self):
        assert "app_uid()" in self.src

    def test_uses_app_role_for_api(self):
        assert "app_role()" in self.src

    def test_uses_app_uid_for_client(self):
        """Client policies use app_uid() (GUC-based) instead of auth.uid()."""
        assert "app_uid()" in self.src

    def test_uses_get_my_role_for_client(self):
        assert "get_my_role()" in self.src


# ═══════════════════════════════════════════════════════════
# ADMIN FUNCTIONS TESTS (Migration 009)
# ═══════════════════════════════════════════════════════════


class TestAdminFunctions:
    """Verify migration 009 creates SECURITY DEFINER admin functions."""

    def setup_method(self):
        self.src = _read_migration_source("009", "admin_functions")

    def test_all_functions_exist(self):
        expected = [
            "admin_write_audit_log",
            "admin_insert_timetable_run",
            "admin_insert_timetable_entry",
            "admin_insert_booking_run",
            "admin_insert_booking_decision",
            "admin_insert_exam_run",
            "admin_insert_exam_entry",
            "admin_insert_exam_room_allocation",
            "admin_insert_reschedule_proposal",
            "admin_insert_reschedule_change",
            "admin_approve_proposal",
            "admin_update_user_role",
        ]
        for func in expected:
            assert func in self.src, f"Missing function: {func}"

    def test_all_security_definer(self):
        """Every admin function must be SECURITY DEFINER."""
        count = self.src.count("SECURITY DEFINER")
        assert count >= 12, \
            f"Expected ≥12 SECURITY DEFINER declarations, found {count}"

    def test_all_empty_search_path(self):
        """Every function must SET search_path = ''."""
        count = self.src.count("search_path = ''")
        assert count >= 12, \
            f"Expected ≥12 search_path settings, found {count}"

    def test_all_check_admin_role(self):
        """Every function must verify app_role() = 'admin'."""
        count = self.src.count("app_role() IS DISTINCT FROM 'admin'")
        assert count >= 12, \
            f"Expected ≥12 admin role checks, found {count}"

    def test_all_owned_by_app_owner(self):
        count = self.src.count("OWNER TO app_owner")
        assert count >= 12

    def test_all_revoke_from_public(self):
        count = self.src.count("REVOKE ALL ON FUNCTION")
        assert count >= 12

    def test_all_grant_to_app_api(self):
        count = self.src.count("GRANT EXECUTE ON FUNCTION")
        assert count >= 12

    def test_approve_proposal_self_check(self):
        """admin_approve_proposal must check for self-approval."""
        assert "Cannot approve your own proposal" in self.src
        assert "proposed_by = p_approver_id" in self.src

    def test_approve_proposal_already_approved(self):
        assert "already approved" in self.src

    def test_update_user_role_validates_role(self):
        assert "Invalid role" in self.src

    def test_update_user_role_audits(self):
        assert "audit_log" in self.src
        assert "update_user_role" in self.src


# ═══════════════════════════════════════════════════════════
# GRANTS TESTS (Migration 010)
# ═══════════════════════════════════════════════════════════


class TestGrants:
    """Verify migration 010 sets up least-privilege grants."""

    def setup_method(self):
        self.src = _read_migration_source("010", "grants")

    def test_app_owner_full_access(self):
        assert "GRANT ALL ON ALL TABLES IN SCHEMA public TO app_owner" in self.src
        assert "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_owner" in self.src

    def test_app_api_select_all(self):
        assert "GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_api" in self.src

    def test_app_api_insert_booking_requests(self):
        assert "GRANT INSERT ON public.booking_requests TO app_api" in self.src

    def test_app_api_column_level_update(self):
        """app_api can only UPDATE cancellation columns."""
        assert "GRANT UPDATE (cancelled, cancelled_at, cancelled_by, cancel_note)" in self.src

    def test_no_broad_update_grant(self):
        """No broad UPDATE grant on booking_requests."""
        lines = self.src.splitlines()
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("--"):
                continue
            if "GRANT UPDATE ON public.booking_requests" in stripped:
                pytest.fail("Found broad UPDATE grant on booking_requests")


# ═══════════════════════════════════════════════════════════
# GLOBAL SECURITY TESTS (all migrations)
# ═══════════════════════════════════════════════════════════


class TestGlobalSecurity:
    """Cross-migration security checks."""

    def setup_method(self):
        self.all_src = ""
        for rev, _, slug in _MIGRATIONS:
            self.all_src += _read_migration_source(rev, slug) + "\n"

    def test_no_bypassrls_anywhere(self):
        """CRITICAL: BYPASSRLS must never appear in any SQL statement."""
        for line in self.all_src.splitlines():
            stripped = line.strip()
            # Skip Python comments, docstrings, and SQL comments
            if stripped.startswith("#") or stripped.startswith("--"):
                continue
            if stripped.startswith('"""') or stripped.startswith("'''"):
                continue
            assert "BYPASSRLS" not in stripped.upper(), \
                f"BYPASSRLS found in SQL statement: {stripped}"

    def test_no_superuser_anywhere(self):
        """No migration should grant SUPERUSER."""
        # Exclude comments
        for line in self.all_src.splitlines():
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("--"):
                continue
            if "SUPERUSER" in stripped.upper() and "GRANT" in stripped.upper():
                pytest.fail(f"SUPERUSER grant found: {stripped}")

    def test_no_hardcoded_passwords(self):
        """No actual password values in any migration."""
        patterns = [
            r"PASSWORD\s+'[^']+'",  # PASSWORD 'actual-password'
            r"password\s*=\s*['\"](?!PASSWORD)[^'\"]+['\"]",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, self.all_src, re.IGNORECASE)
            assert len(matches) == 0, f"Hardcoded password found: {matches}"

    def test_all_tables_owned_by_app_owner(self):
        """Every CREATE TABLE should be followed by OWNER TO app_owner."""
        tables = re.findall(
            r"CREATE TABLE.*?public\.(\w+)",
            self.all_src,
        )
        for table in tables:
            assert f"ALTER TABLE public.{table} OWNER TO app_owner" in self.all_src, \
                f"Table {table} not owned by app_owner"


# ═══════════════════════════════════════════════════════════
# ORM MODEL TESTS
# ═══════════════════════════════════════════════════════════


class TestORMModels:
    """Verify SQLAlchemy ORM models match the planned schema."""

    def test_import_models(self):
        from app.models.db_models import (
            Base, Profile, TimetableRun, TimetableEntry,
            BookingRequest, BookingRun, BookingDecisionRow,
            ExamRun, ExamEntry, ExamRoomAllocation,
            RescheduleProposal, RescheduleChange, AuditLog,
        )

    def test_all_tables_present(self):
        from app.models.db_models import Base
        tables = Base.metadata.tables
        expected = {
            "profiles", "timetable_runs", "timetable_entries",
            "booking_requests", "booking_runs", "booking_decisions",
            "exam_runs", "exam_entries", "exam_room_allocations",
            "reschedule_proposals", "reschedule_changes", "audit_log",
        }
        assert expected == set(tables.keys()), \
            f"Missing tables: {expected - set(tables.keys())}"

    def test_profile_columns(self):
        from app.models.db_models import Profile
        cols = {c.name for c in Profile.__table__.columns}
        expected = {"id", "email", "full_name", "role", "department",
                    "faculty_id", "created_at", "updated_at"}
        assert expected == cols

    def test_booking_request_columns(self):
        from app.models.db_models import BookingRequest
        cols = {c.name for c in BookingRequest.__table__.columns}
        assert "submitted_by" in cols
        assert "cancelled" in cols
        assert "cancel_note" in cols
        assert "requester_name" in cols
        assert "role" in cols
        assert "department" in cols

    def test_reschedule_proposal_self_approval_constraint(self):
        from app.models.db_models import RescheduleProposal
        constraints = RescheduleProposal.__table__.constraints
        names = {c.name for c in constraints if c.name}
        assert "no_self_approval" in names, \
            "Missing no_self_approval CHECK constraint on reschedule_proposals"

    def test_audit_log_columns(self):
        from app.models.db_models import AuditLog
        cols = {c.name for c in AuditLog.__table__.columns}
        assert "actor_id" in cols
        assert "action" in cols
        assert "ip_address" in cols

    def test_timetable_entry_unique_constraint(self):
        from app.models.db_models import TimetableEntry
        constraints = TimetableEntry.__table__.constraints
        names = {c.name for c in constraints if c.name}
        assert "uq_te_run_session" in names

    def test_booking_decision_status_check(self):
        from app.models.db_models import BookingDecisionRow
        constraints = BookingDecisionRow.__table__.constraints
        names = {c.name for c in constraints if c.name}
        assert "bd_status_check" in names

    def test_foreign_keys_count(self):
        """Verify key FK relationships exist."""
        from app.models.db_models import Base
        meta = Base.metadata
        # Count FK constraints across all tables
        fk_count = sum(
            len(table.foreign_keys) for table in meta.tables.values()
        )
        # At least: timetable (2), booking (4), exam (3), rescheduling (3), audit (1) = 13
        assert fk_count >= 13, f"Expected ≥13 foreign keys, found {fk_count}"
