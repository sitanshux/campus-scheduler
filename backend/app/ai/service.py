"""
AI Service layer combining Gemini LLM reasoning with deterministic engine checks.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.ai.client import call_gemini, parse_booking_fallback
from app.ai.prompts import (
    BOOKING_EXTRACTION_SYSTEM_PROMPT,
    DECISION_EXPLANATION_PROMPT,
    SCHEDULE_CHANGE_SYSTEM_PROMPT,
)
from app.core.dataset import load_dataset
from app.rescheduling.engine import generate_proposal

logger = logging.getLogger(__name__)


def parse_booking_prompt(text: str, user: dict) -> dict[str, Any]:
    """Parse English / Hinglish booking text into a structured booking request.

    Uses Gemini API if available, with automatic rule-based fallback.
    """
    raw_response = call_gemini(
        prompt=f"User request: '{text}'",
        system_instruction=BOOKING_EXTRACTION_SYSTEM_PROMPT,
        temperature=0.1,
    )

    result = None
    if raw_response:
        try:
            # Strip markdown json codeblocks if returned
            clean_json = raw_response.strip()
            if clean_json.startswith("```"):
                clean_json = re.sub(r"^```[a-zA-Z]*\n", "", clean_json)
                clean_json = re.sub(r"\n```$", "", clean_json)
            result = json.loads(clean_json)
        except Exception as exc:
            logger.warning("Failed to parse Gemini booking JSON (%s). Using fallback.", exc)

    if not result:
        result = parse_booking_fallback(text, user)

    # Ensure required structure
    result.setdefault("title", "Venue Booking")
    result.setdefault("attendance", 40)
    result.setdefault("duration_periods", 1)
    result.setdefault("windows", [{"day": "MON", "from_period": 10, "to_period": 11}])
    result.setdefault("needs", [])
    result.setdefault("room_types", ["classroom", "seminar_hall"])
    result.setdefault("mandatory_for_groups", [])
    result.setdefault("follow_up", None)
    result["raw_text"] = text

    # Set appropriate category based on user role
    role = user.get("role", "faculty")
    role_category_defaults = {
        "admin": "institute_event",
        "faculty": "guest_lecture",
        "department_coordinator": "department_event",
        "club": "club_event",
    }
    result["requested_category"] = role_category_defaults.get(role, "club_event")

    return result


# ── Hinglish & English time / day resolution helpers ────────────


_DAY_MAP: dict[str, str] = {
    # English
    "monday": "MON", "tuesday": "TUE", "wednesday": "WED",
    "thursday": "THU", "friday": "FRI", "saturday": "SAT",
    # Abbreviations
    "mon": "MON", "tue": "TUE", "wed": "WED",
    "thu": "THU", "fri": "FRI", "sat": "SAT",
    # Hinglish
    "somvar": "MON", "mangalvar": "TUE", "budhvar": "WED",
    "guruvar": "THU", "shukravar": "FRI", "shanivar": "SAT",
    "kal": "MON",  # "tomorrow" — resolved generically
    "aaj": "MON",  # "today" — resolved generically
}

_PERIOD_FROM_HOUR: dict[int, int] = {
    8: 1, 9: 2, 10: 3, 11: 4, 12: 5,
    # Lunch gap
    14: 6, 2: 6,  # "2 baje" afternoon → P6
    15: 7, 3: 7,  # "3 baje" afternoon → P7
    16: 8, 4: 8,
    17: 9, 5: 9,  # "5 baje" → P9 (17:00)
    18: 10, 6: 10,
    19: 11, 7: 11,
    20: 12, 21: 13,
}


def _resolve_day(text_lower: str) -> str:
    """Extract the target day from text, defaulting to MON."""
    for word, code in _DAY_MAP.items():
        if word in text_lower:
            return code
    return "MON"


def _resolve_periods(text_lower: str) -> list[int]:
    """Extract target periods from time references in text.

    Handles: "5 baje", "sham ko", "subah", "dopeher", "period 3", etc.
    """
    # Explicit period reference: "period 3", "P7"
    period_match = re.search(r"(?:period|p)\s*(\d+)", text_lower)
    if period_match:
        p = int(period_match.group(1))
        if 1 <= p <= 13:
            return [p]

    # Hour reference: "5 baje", "at 5", "5 pm", "17:00"
    hour_match = re.search(r"(\d{1,2})\s*(?:baje|pm|o.?clock|:\d{2})", text_lower)
    if hour_match:
        h = int(hour_match.group(1))
        # Disambiguate small numbers based on context
        is_evening = any(w in text_lower for w in ("sham", "shaam", "evening", "pm"))
        is_morning = any(w in text_lower for w in ("subah", "morning", "am"))
        if h <= 7 and not is_morning:
            # "5 baje" in evening context → 17:00
            h += 12
        p = _PERIOD_FROM_HOUR.get(h)
        if p:
            return [p]

    # Time-of-day Hinglish keywords
    if any(w in text_lower for w in ("sham", "shaam", "evening")):
        return [9]  # Default evening → P9 (17:00–18:00)
    if any(w in text_lower for w in ("dopeher", "dopahar", "afternoon")):
        return [6, 7]
    if any(w in text_lower for w in ("subah", "morning")):
        return [1, 2]

    return [1, 2]  # Fallback: early morning


def _resolve_course_and_groups(
    text_lower: str, fac_id: str
) -> tuple[str | None, list[str], int]:
    """Try to resolve course_id and student groups from the dataset sessions."""
    ds = load_dataset()
    faculty_sessions = [s for s in ds["sessions"] if s.get("faculty_id") == fac_id]

    if not faculty_sessions:
        return None, [], 50

    # Try matching a course code in the text
    for sess in faculty_sessions:
        cid = sess["course_id"]
        if cid.lower() in text_lower or cid.lower().replace("-", "") in text_lower:
            return cid, sess.get("groups", []), sess.get("size", 50)

    # Default to first course taught by this faculty
    first = faculty_sessions[0]
    return first["course_id"], first.get("groups", []), first.get("size", 50)


def process_ai_reschedule_request(prompt: str, user: dict) -> dict[str, Any]:
    """Translate natural language request into a disruption and generate a proposal.

    Rule: Gemini NEVER alters schedules directly; all proposals run through CP-SAT.
    """
    fac_id = user.get("faculty_id") or "F01"

    # Attempt Gemini extraction
    gemini_out = call_gemini(
        prompt=f"Faculty {fac_id} requests: '{prompt}'",
        system_instruction=SCHEDULE_CHANGE_SYSTEM_PROMPT,
        temperature=0.1,
    )

    changes = []
    description = prompt

    if gemini_out:
        try:
            clean = gemini_out.strip()
            if clean.startswith("```"):
                clean = re.sub(r"^```[a-zA-Z]*\n", "", clean)
                clean = re.sub(r"\n```$", "", clean)
            parsed = json.loads(clean)
            changes = parsed.get("changes", [])
            description = parsed.get("description", prompt)
        except Exception:
            pass

    # Deterministic fallback disruption parsing if Gemini not available or empty
    if not changes:
        t_low = prompt.lower()
        target_day = _resolve_day(t_low)
        target_periods = _resolve_periods(t_low)

        if "leave" in t_low or "unavailable" in t_low:
            changes.append({
                "type": "faculty_unavailable",
                "faculty_id": fac_id,
                "days": [target_day],
                "periods": [1, 2, 3, 4, 5, 6, 7, 8, 9],
                "reason": prompt,
            })
            description = f"Faculty {fac_id} unavailable on {target_day}"
        elif "maintenance" in t_low or "closed" in t_low:
            room_match = re.search(r"\b(cr-10[1-6]|lh-[1-5]|sh-[1-3]|aud)\b", t_low)
            rid = room_match.group(1).upper() if room_match else "CR-101"
            changes.append({
                "type": "room_unavailable",
                "room_id": rid,
                "days": [target_day],
                "periods": target_periods,
                "reason": prompt,
            })
            description = f"Room {rid} maintenance on {target_day}"
        elif any(kw in t_low for kw in (
            "class", "lecture", "session", "chahiye", "zaroorat",
            "add", "extra", "remedial", "laga do",
        )):
            # Faculty wants an extra / remedial session
            course_id, groups, size = _resolve_course_and_groups(t_low, fac_id)
            kind = "lab" if any(w in t_low for w in ("lab", "practical")) else "lecture"
            duration = 2 if kind == "lab" else 1
            room_types = ["lab_cs"] if kind == "lab" else ["classroom", "lecture_hall"]

            new_id = f"EXTRA-{fac_id}-{target_day}-P{target_periods[0]}"
            changes.append({
                "type": "add_session",
                "session": {
                    "id": new_id,
                    "course_id": course_id or f"EXTRA-{fac_id}",
                    "faculty_id": fac_id,
                    "groups": groups,
                    "duration": duration,
                    "kind": kind,
                    "room_types": room_types,
                    "size": size,
                },
            })
            description = (
                f"Extra {kind} for {course_id or fac_id} on {target_day} "
                f"around period {target_periods[0]}"
            )
        elif any(kw in t_low for kw in ("move", "shift", "swap", "reschedule", "badlo")):
            # Faculty wants to move an existing session
            changes.append({
                "type": "faculty_unavailable",
                "faculty_id": fac_id,
                "days": [target_day],
                "periods": target_periods,
                "reason": prompt,
            })
            description = f"Faculty {fac_id} requesting schedule change on {target_day}"
        else:
            # General request — default to adding an extra session
            course_id, groups, size = _resolve_course_and_groups(t_low, fac_id)
            new_id = f"EXTRA-{fac_id}-{target_day}-P{target_periods[0]}"
            changes.append({
                "type": "add_session",
                "session": {
                    "id": new_id,
                    "course_id": course_id or f"EXTRA-{fac_id}",
                    "faculty_id": fac_id,
                    "groups": groups,
                    "duration": 1,
                    "kind": "lecture",
                    "room_types": ["classroom", "lecture_hall"],
                    "size": size,
                },
            })
            description = f"Extra lecture for {course_id or fac_id} on {target_day} P{target_periods[0]}"

    # Execute deterministic CP-SAT proposal solver (minimal moves)
    proposal = generate_proposal(changes, time_limit_seconds=60)

    return {
        "description": description,
        "extracted_changes": changes,
        "proposal_id": proposal.get("proposal_id"),
        "status": proposal.get("status"),
        "solver_status": proposal.get("solver_status"),
        "frozen_count": proposal.get("frozen_count", 0),
        "moved_count": proposal.get("moved_count", 0),
        "added_count": proposal.get("added_count", 0),
        "unscheduled_count": proposal.get("unscheduled_count", 0),
        "solve_time_seconds": proposal.get("solve_time_seconds", 0.0),
        "conflicts": proposal.get("conflicts", []),
        "changes": proposal.get("changes", []),
        "approved": False,
        "requires_admin_approval": True,
    }


def explain_decision_ai(decision_type: str, context: dict[str, Any]) -> str:
    """Generate human-readable explanation for a booking or scheduling decision."""
    prompt = (
        f"Explain this {decision_type} decision clearly to a student/faculty member.\n"
        f"Context: {json.dumps(context, default=str)}"
    )

    gemini_out = call_gemini(
        prompt=prompt,
        system_instruction=DECISION_EXPLANATION_PROMPT,
        temperature=0.3,
    )

    if gemini_out and len(gemini_out.strip()) > 10:
        return gemini_out.strip()

    # Deterministic fallback explanations
    reasons = context.get("reasons", [])
    status = context.get("status", "")

    if status == "rejected":
        reason_str = "; ".join(reasons) if reasons else "Venue capacity or time-window conflict."
        return (
            f"Your booking could not be approved due to the following constraint: {reason_str}. "
            f"Please check alternative available venues or choose a different time window."
        )
    elif status == "alternative_offered":
        alt = context.get("alternative", {})
        alt_room = alt.get("room_id", "an alternative room")
        return (
            f"Your requested venue was unavailable due to existing priority allocations, "
            f"but {alt_room} has been offered as an alternative that fits your capacity and needs."
        )
    elif status == "approved":
        return "Your booking request satisfies all campus venue policies, capacity limits, and time-window constraints."

    # Handle schedule queries with context about the faculty
    query = context.get("query", "")
    faculty_name = context.get("faculty_name", "Faculty")
    weekly_hours = context.get("weekly_hours", 0)
    daily_limit = context.get("daily_limit", 4)

    if query:
        return (
            f"Based on {faculty_name}'s current schedule: {weekly_hours} weekly teaching hours "
            f"against a daily limit of {daily_limit}h. "
            f"The CP-SAT solver ensures all hard constraints (room capacity, faculty conflicts, "
            f"student group clashes) are respected. Use the chat to request specific changes."
        )

    return "Decision evaluated according to CIT Campus scheduling and venue allocation policies."
