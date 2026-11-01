"""API routes for the venue booking system.

Auth:
- process_bookings: admin or department_coordinator (persists run if admin & db active)
- validate_booking: admin or department_coordinator, with self-approval prevention
- submit: any authenticated user (persists in `booking_requests`)
- cancel: any authenticated user (cancels own request in `booking_requests`)
- get requests: subject to RLS (users see own, admin/coord see all)
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.bookings.engine import (
    check_role_permission,
    process_all_bookings,
    validate_single_booking,
)
from app.bookings.models import BookingRequestIn
from app.core.auth import get_verified_user
from app.core.database import get_db
from app.core.dataset import load_dataset
from app.core.permissions import require_admin_or_coord
from app.core.persistence import (
    cancel_booking_request,
    get_booking_requests,
    get_latest_booking_run,
    persist_booking_request,
    persist_booking_run,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


class CancelBookingInput(BaseModel):
    cancel_note: Optional[str] = ""


@router.post("/process")
def process_bookings(
    user: dict = Depends(require_admin_or_coord),
    db: Session | None = Depends(get_db),
):
    """Process all booking requests from the dataset and return decisions.

    Requests are evaluated in priority order (highest first), then by
    submission timestamp.  Each receives ``approved``, ``rejected``, or
    ``alternative_offered`` with reasons.

    Persists booking run & decisions to the database if admin role and DB is active.

    Requires: admin or department_coordinator role.
    """
    try:
        decisions = process_all_bookings()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Processing error: {exc}",
        )

    summary = {
        "approved": sum(1 for d in decisions if d["status"] == "approved"),
        "rejected": sum(1 for d in decisions if d["status"] == "rejected"),
        "alternative_offered": sum(
            1 for d in decisions if d["status"] == "alternative_offered"
        ),
    }

    run_id: str | None = None
    if db is not None and user.get("role") == "admin":
        try:
            run_id = persist_booking_run(db, user, decisions)
        except Exception as exc:
            logger.warning("Could not persist booking run: %s", exc)

    response = {
        "total": len(decisions),
        "summary": summary,
        "decisions": decisions,
    }
    if run_id:
        response["run_id"] = run_id
    return response


@router.post("/validate")
def validate_booking(
    request: BookingRequestIn,
    user: dict = Depends(require_admin_or_coord),
):
    """Validate a single booking request.

    Self-approval prevention: the server derives ``approved_by`` from
    the authenticated user's identity, not from client input.  If the
    approver is the same as the requester, the booking is rejected.

    Requires: admin or department_coordinator role.
    """
    approved_by = user.get("user_id")

    try:
        decision = validate_single_booking(
            request.model_dump(),
            approver=approved_by,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Validation error: {exc}",
        )

    return decision


@router.post("/submit")
def submit_booking_request(
    request: BookingRequestIn,
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Submit and persist a new booking request in `booking_requests`.

    Server derives `submitted_by` and profile info from the authenticated user.
    Checks role permissions against category cap.
    """
    try:
        dataset = load_dataset()
        priority_order = dataset.get("priority_order", [])
        role_category_cap = dataset.get("role_category_cap", {})
        if request.requested_category in priority_order:
            perm_err = check_role_permission(
                user.get("role", "faculty"),
                request.requested_category,
                priority_order,
                role_category_cap,
            )
            if perm_err:
                raise HTTPException(status_code=403, detail=perm_err)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Could not check role permission against dataset: %s", exc)

    try:
        saved = persist_booking_request(db, user, request.model_dump())
        return saved
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Booking submission error: {exc}")


@router.get("/my")
def get_my_booking_requests(
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Retrieve the authenticated user's own booking requests."""
    try:
        return get_booking_requests(db, user, user_id_filter=user.get("user_id"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retrieval error: {exc}")


@router.post("/{request_id}/cancel")
def cancel_booking_endpoint(
    request_id: str,
    body: CancelBookingInput,
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Cancel a previously submitted booking request owned by the user.

    Enforced by database trigger `enforce_booking_cancel_only`.
    """
    try:
        result = cancel_booking_request(
            db, user, request_id, cancel_note=body.cancel_note or ""
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cancellation error: {exc}")


@router.get("/requests")
def get_booking_requests_endpoint(
    status: Optional[str] = None,
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Retrieve booking requests subject to RLS (users see own, admin/coord see all)."""
    try:
        return get_booking_requests(db, user, status_filter=status)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retrieval error: {exc}")


@router.get("/latest")
def get_latest_booking_run_endpoint(
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Retrieve the latest persisted booking processing run and decisions."""
    run = get_latest_booking_run(db, user)
    if not run:
        raise HTTPException(status_code=404, detail="No booking run found")
    return run
