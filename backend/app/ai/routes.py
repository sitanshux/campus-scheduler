"""
FastAPI routes for Gemini AI assistant and natural language processing.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.service import (
    explain_decision_ai,
    parse_booking_prompt,
    process_ai_reschedule_request,
)
from app.core.auth import get_verified_user
from app.core.database import get_db
from app.core.persistence import persist_reschedule_proposal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ParseBookingInput(BaseModel):
    text: str = Field(..., description="Plain English or Hinglish venue booking request")


class ReschedulePromptInput(BaseModel):
    prompt: str = Field(..., description="Faculty request to move, cancel, or add a session")


class ExplainInput(BaseModel):
    decision_type: str = Field(default="booking", description="'booking' or 'schedule'")
    context: dict[str, Any] = Field(default_factory=dict, description="Decision data and reasons")


@router.post("/parse-booking")
def parse_booking_endpoint(
    body: ParseBookingInput,
    user: dict = Depends(get_verified_user),
):
    """Parse plain English or Hinglish venue requests into structured, editable bookings.

    Allows user to inspect and edit the structured JSON before submitting.
    Never submits automatically.
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Booking text cannot be empty")

    structured = parse_booking_prompt(body.text, user)
    return structured


@router.post("/reschedule-request")
def ai_reschedule_endpoint(
    body: ReschedulePromptInput,
    user: dict = Depends(get_verified_user),
    db: Session | None = Depends(get_db),
):
    """Convert natural language schedule change into a CP-SAT rescheduling proposal.

    Strictly validated by the underlying CP-SAT solver.
    Requires Admin approval before any timetable change is applied.
    """
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Schedule change prompt cannot be empty")

    proposal = process_ai_reschedule_request(body.prompt, user)

    if db is not None:
        try:
            persist_reschedule_proposal(db, user, proposal)
        except Exception as exc:
            logger.warning("Could not persist AI reschedule proposal: %s", exc)

    return proposal


@router.post("/explain")
def explain_decision_endpoint(
    body: ExplainInput,
    user: dict = Depends(get_verified_user),
):
    """Generate human-readable explanations for scheduling or booking decisions."""
    explanation = explain_decision_ai(body.decision_type, body.context)
    return {
        "decision_type": body.decision_type,
        "explanation": explanation,
    }

