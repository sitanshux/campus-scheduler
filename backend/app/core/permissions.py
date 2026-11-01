"""
Role-based authorization dependencies for FastAPI.

Usage in route handlers::

    from app.core.permissions import require_admin, require_any_authenticated

    @router.post("/api/schedule/generate")
    def generate_schedule(user: dict = Depends(require_admin)):
        ...

    @router.get("/api/bookings/my")
    def my_bookings(user: dict = Depends(require_any_authenticated)):
        ...

Design (from v4 plan §7):
- ``require_role(*roles)`` returns a dependency that checks the user's
  role against the allowed set.  Raises 403 if the role is not allowed.
- Pre-built shortcuts for common patterns.
- All role information comes from the database profile (via
  ``get_verified_user``), never from client input.
"""

from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException

from app.core.auth import get_verified_user


def require_role(*allowed_roles: str) -> Callable:
    """Return a FastAPI dependency that enforces role membership.

    Parameters
    ----------
    *allowed_roles : str
        One or more role names (e.g. ``"admin"``, ``"faculty"``).

    Returns
    -------
    Callable
        A dependency function that returns the verified user dict if
        authorised, or raises ``HTTPException(403)`` otherwise.
    """

    def _check(user: dict = Depends(get_verified_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Forbidden: requires role "
                    f"{' or '.join(allowed_roles)}, "
                    f"got '{user.get('role')}'"
                ),
            )
        return user

    return _check


# ── Pre-built shortcuts ────────────────────────────────

require_admin = require_role("admin")
"""Only ``admin`` users may access."""

require_admin_or_coord = require_role("admin", "department_coordinator")
"""``admin`` or ``department_coordinator`` users may access."""

require_any_authenticated = Depends(get_verified_user)
"""Any authenticated user with a valid profile may access.

Note: This is a ``Depends(...)`` instance — use it directly as a
default parameter value, not wrapped in another ``Depends()``::

    def my_route(user: dict = require_any_authenticated):
        ...
"""

