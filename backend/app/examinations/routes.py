"""API routes for the exam scheduling system.

Auth:
- POST /schedule: admin only (generate exam schedule, persists to DB)
- GET /schedule: any authenticated user (view exam schedule)
- GET /active: any authenticated user (view persisted exam schedule)
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_verified_user
from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.persistence import get_active_exam_schedule, persist_exam_run
from app.examinations.engine import schedule_exams

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.post("/schedule")
def generate_exam_schedule(
    user: dict = Depends(require_admin),
    db: Session | None = Depends(get_db),
):
    """Run the deterministic exam scheduler and return the result.

    Schedules all exams from the dataset into exam-week slots
    (Mon–Sat, AM/PM) using half seating capacity with multi-room
    allocation.  Returns scheduled exams, unscheduled exams, and
    summary counts.

    Persists exam run, entries and room allocations when DB session is active.

    Requires: admin role.
    """
    try:
        result = schedule_exams()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Exam scheduling error: {exc}",
        )

    run_id: str | None = None
    if db is not None:
        try:
            run_id = persist_exam_run(db, user, result)
        except Exception as exc:
            logger.warning("Could not persist exam run: %s", exc)

    if run_id:
        result["run_id"] = run_id
    return result


@router.get("/schedule")
def get_exam_schedule(
    user: dict = Depends(get_verified_user),
    db: Session | None = Depends(get_db),
):
    """Retrieve the exam schedule (checks DB first, fallback to deterministic calculation).

    Requires: any authenticated user.
    """
    if db is not None:
        try:
            active = get_active_exam_schedule(db, user)
            if active:
                return active
        except Exception as exc:
            logger.debug("Falling back to deterministic calculation: %s", exc)

    try:
        result = schedule_exams()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Exam scheduling error: {exc}",
        )

    return result


@router.get("/active")
def get_active_exam_schedule_endpoint(
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Retrieve the latest persisted active exam schedule from the database."""
    active = get_active_exam_schedule(db, user)
    if not active:
        raise HTTPException(status_code=404, detail="No active exam schedule found")
    return active
