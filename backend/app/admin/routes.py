"""API routes for administrative actions.

All routes require the `admin` role.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.persistence import get_all_users, update_user_role

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UpdateRoleInput(BaseModel):
    role: str = Field(
        ...,
        description="New role: 'admin', 'department_coordinator', 'faculty', or 'club'",
    )


@router.get("/users")
def list_users(
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all user profiles.

    Requires: admin role.
    """
    try:
        return get_all_users(db, admin_user)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list users: {exc}")


@router.put("/users/{user_id}/role")
def change_user_role(
    user_id: str,
    body: UpdateRoleInput,
    admin_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a user's role.

    Requires: admin role.
    Audits the role change in `audit_log` via `admin_update_user_role`.
    """
    try:
        UUID(str(user_id))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID format (valid UUID expected)",
        )

    try:
        result = update_user_role(db, admin_user, user_id, body.role)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke).strip("'\""))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Role update error: {exc}")

