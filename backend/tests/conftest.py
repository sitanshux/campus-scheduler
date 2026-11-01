"""
Shared test fixtures for the campus-scheduler backend.

Provides auth override fixtures so existing endpoint tests continue
to work without real JWT tokens or database connections.

Usage::

    # In test functions, use the ``override_auth`` fixture to bypass auth:
    def test_something(override_auth):
        from app.scheduling.routes import generate_schedule
        result = generate_schedule(time_limit_seconds=30, user=override_auth)

    # Or use ``as_role`` for specific role testing:
    def test_admin_only(as_role):
        user = as_role("admin")
        ...
"""

from __future__ import annotations

import pytest

from app.core.auth import get_current_user, get_verified_user
from app.main import app


# ═══════════════════════════════════════════════════════
# Mock user builders
# ═══════════════════════════════════════════════════════

_DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


def _make_mock_user(
    role: str = "admin",
    user_id: str = _DEFAULT_USER_ID,
    email: str | None = None,
    department: str | None = "CS",
    faculty_id: str | None = None,
) -> dict:
    """Build a mock user dict matching ``get_verified_user`` output."""
    if email is None:
        email = f"{role}@test.cit.edu"
    return {
        "user_id": user_id,
        "email": email,
        "full_name": f"Test {role.replace('_', ' ').title()}",
        "role": role,
        "department": department,
        "faculty_id": faculty_id,
    }


# ═══════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════


@pytest.fixture()
def override_auth():
    """Override auth dependencies with an admin user.

    Returns the mock user dict.  Restores original dependencies on teardown.
    """
    mock_user = _make_mock_user("admin")
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_verified_user] = lambda: mock_user
    yield mock_user
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_verified_user, None)


@pytest.fixture()
def as_role():
    """Factory fixture: override auth with a specific role.

    Usage::

        def test_faculty_access(as_role):
            user = as_role("faculty")
            # ... call endpoint with user=user
    """
    _prev_overrides = {}

    def _set_role(role: str, **kwargs) -> dict:
        mock_user = _make_mock_user(role, **kwargs)
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_verified_user] = lambda: mock_user
        return mock_user

    yield _set_role

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_verified_user, None)

