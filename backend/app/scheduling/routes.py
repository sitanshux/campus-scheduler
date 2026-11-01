"""
API routes for the scheduling engine.

Auth: Admin-only — schedule generation is a privileged operation.
Persistence: Automatically persists successful runs and entries in the database.
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_verified_user
from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.persistence import get_active_timetable, persist_timetable_run
from app.scheduling.solver import solve

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


@router.post("/generate")
def generate_schedule(
    time_limit_seconds: int = 120,
    user: dict = Depends(require_admin),
    db: Session | None = Depends(get_db),
):
    """
    Run the CP-SAT solver and return the timetable.

    Returns solver status, scheduled sessions, unscheduled sessions,
    and diagnostics. Never reports success if hard constraints are violated.

    Persists solver output in `timetable_runs` and `timetable_entries` when DB session is active.

    Requires: admin role.
    """
    try:
        result = solve(time_limit_seconds=time_limit_seconds)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Solver error: {exc}",
        )

    status = result["status"]
    run_id: str | None = None

    if status in ("OPTIMAL", "FEASIBLE"):
        all_scheduled = result["diagnostics"]["scheduled_count"] == result["diagnostics"]["total_sessions"]

        if db is not None:
            try:
                run_id = persist_timetable_run(db, user, result)
            except Exception as exc:
                logger.warning("Could not persist timetable run: %s", exc)

        response = {
            "success": all_scheduled,
            "status": status,
            "message": (
                "All sessions scheduled successfully."
                if all_scheduled
                else f"{result['diagnostics']['unscheduled_count']} sessions could not be scheduled."
            ),
            "scheduled": result["scheduled"],
            "unscheduled": result["unscheduled"],
            "diagnostics": result["diagnostics"],
            "solve_time_seconds": result["solve_time_seconds"],
        }
        if run_id:
            response["run_id"] = run_id
        return response

    if status == "INFEASIBLE":
        return {
            "success": False,
            "status": status,
            "message": "No feasible schedule exists with the given constraints.",
            "scheduled": [],
            "unscheduled": result["unscheduled"],
            "diagnostics": result["diagnostics"],
            "solve_time_seconds": result["solve_time_seconds"],
        }

    # UNKNOWN or MODEL_INVALID
    return {
        "success": False,
        "status": status,
        "message": f"Solver returned status: {status}",
        "scheduled": result.get("scheduled", []),
        "unscheduled": result.get("unscheduled", []),
        "diagnostics": result.get("diagnostics", {}),
        "solve_time_seconds": result.get("solve_time_seconds"),
    }


@router.get("/active")
def get_active_timetable_schedule(
    user: dict = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    """Retrieve the latest active timetable run and entries from the database."""
    timetable = get_active_timetable(db, user)
    if not timetable:
        raise HTTPException(status_code=404, detail="No active timetable found")
    return timetable
