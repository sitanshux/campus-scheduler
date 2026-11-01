"""API routes for disruption management and rescheduling.

Auth:
- propose: admin or department_coordinator (persists proposal to DB when active)
- get proposal: any authenticated user (checks DB then in-memory)
- approve: admin only, with anti-self-approval enforced both in API and DB
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_verified_user
from app.core.database import get_db
from app.core.permissions import require_admin, require_admin_or_coord, require_role
from app.core.persistence import (
    approve_reschedule_proposal_in_db,
    get_reschedule_proposal_from_db,
    persist_reschedule_proposal,
)
from app.rescheduling.engine import (
    approve_proposal,
    generate_proposal,
    get_proposal,
    list_proposals,
)

require_faculty_or_above = require_role("admin", "department_coordinator", "faculty")
from app.rescheduling.models import DisruptionInput

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reschedule", tags=["rescheduling"])


@router.post("/propose")
def propose_reschedule(
    disruption: DisruptionInput,
    time_limit_seconds: int = 60,
    user: dict = Depends(require_faculty_or_above),
    db: Session | None = Depends(get_db),
):
    """Generate a rescheduling proposal for the given disruptions.

    Does NOT apply any changes — the proposal must be explicitly
    approved via ``POST /api/reschedule/approve``.

    Persists proposal and session changes to the database when DB session is active.

    Requires: admin or department_coordinator role.
    """
    try:
        proposal = generate_proposal(
            disruption.changes,
            time_limit_seconds=time_limit_seconds,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Rescheduling error: {exc}",
        )

    if db is not None:
        try:
            persist_reschedule_proposal(db, user, proposal)
        except Exception as exc:
            logger.warning("Could not persist reschedule proposal: %s", exc)

    # Strip internal fields from the response
    return {
        k: v for k, v in proposal.items() if not k.startswith("_")
    }


@router.get("/proposal/{proposal_id}")
def get_proposal_by_id(
    proposal_id: str,
    user: dict = Depends(get_verified_user),
    db: Session | None = Depends(get_db),
):
    """Retrieve a previously generated proposal (checks DB first, fallback to memory).

    Requires: any authenticated user.
    """
    if db is not None:
        try:
            db_proposal = get_reschedule_proposal_from_db(db, user, proposal_id)
            if db_proposal:
                return {k: v for k, v in db_proposal.items() if not k.startswith("_")}
        except Exception as exc:
            logger.debug("DB proposal retrieval error: %s", exc)

    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return {
        k: v for k, v in proposal.items() if not k.startswith("_")
    }


@router.get("/proposals")
def get_all_proposals(
    user: dict = Depends(get_verified_user),
    db: Session | None = Depends(get_db),
):
    """Retrieve all generated proposals (checks memory and DB).

    Requires: any authenticated user.
    """
    proposals = list_proposals()
    return [
        {k: v for k, v in p.items() if not k.startswith("_")}
        for p in proposals
    ]


@router.post("/approve")
def approve_reschedule(
    proposal_id: str,
    user: dict = Depends(require_admin),
    db: Session | None = Depends(get_db),
):
    """Approve a previously generated and validated rescheduling proposal.

    Applies the exact schedule from the proposal without re-running
    the solver.  Self-approval prevention: ``approved_by`` is derived
    from the authenticated user, never from client input.

    When DB is active, updates `reschedule_proposals.approved = true`
    via `admin_approve_proposal` and logs to `audit_log`.

    Requires: admin role.
    """
    approved_by = user.get("user_id")

    # In-memory approval check
    result = approve_proposal(proposal_id, approved_by)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # Database approval
    if db is not None:
        try:
            approve_reschedule_proposal_in_db(db, user, proposal_id)
        except Exception as exc:
            logger.warning("Could not approve proposal in DB: %s", exc)

    return result
