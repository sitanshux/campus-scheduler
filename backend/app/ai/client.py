"""
Gemini API client with automatic deterministic fallback.

Provides reliable LLM invocation via httpx, with zero-dependency fallback
if GEMINI_API_KEY is not configured or network calls fail.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.ai.prompts import (
    BOOKING_EXTRACTION_SYSTEM_PROMPT,
    DECISION_EXPLANATION_PROMPT,
    SCHEDULE_CHANGE_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


# ═══════════════════════════════════════════════════════
# 1. Gemini REST API Invoker
# ═══════════════════════════════════════════════════════


def call_gemini(
    prompt: str,
    system_instruction: str = "",
    temperature: float = 0.2,
    timeout_sec: float = 8.0,
) -> str | None:
    """Call Gemini API via httpx. Returns generated text or None on failure."""
    api_key = settings.gemini_api_key
    if not api_key:
        logger.debug("GEMINI_API_KEY not configured. Using deterministic fallback.")
        return None

    model = settings.gemini_model or "gemini-2.5-flash"
    url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json" if "json" in prompt.lower() or "json" in system_instruction.lower() else "text/plain",
        },
    }

    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    try:
        with httpx.Client(timeout=timeout_sec) as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "")
            else:
                logger.warning("Gemini API returned status %d: %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.warning("Gemini API call failed (%s). Falling back to deterministic rules.", exc)

    return None


# ═══════════════════════════════════════════════════════
# 2. Rule-Based Deterministic Fallback Parser (Hinglish/EN)
# ═══════════════════════════════════════════════════════


def parse_booking_fallback(text: str, user: dict | None = None) -> dict[str, Any]:
    """Parse English / Hinglish booking requests without calling external APIs."""
    t_lower = text.lower()

    # 1. Attendance extraction
    attendance = 50  # default
    # First priority: explicit unit or keyword (e.g. "100 log", "300 students", "45 people")
    att_explicit = re.search(
        r"(\d+)\s*(?:people|log|participants|students|seats?|persons?|members?)",
        t_lower,
    )
    if att_explicit:
        attendance = int(att_explicit.group(1))
    else:
        att_prefix = re.search(
            r"(?:for|around|about|upto|approx|capacity\s*of)\s*(\d+)",
            t_lower,
        )
        if att_prefix:
            attendance = int(att_prefix.group(1))
        else:
            # Standalone number between 10 and 2000 that is not followed by time units
            for m in re.finditer(r"\b(\d+)\b", t_lower):
                val = int(m.group(1))
                after_text = t_lower[m.end():m.end() + 10]
                if any(w in after_text for w in ["pm", "am", "baje", "hour", "ghant", "to", "-"]):
                    continue
                if 10 <= val <= 2000:
                    attendance = val
                    break

    # 2. Duration extraction
    duration = 2  # default
    dur_match = re.search(r"(\d+)\s*(hour|hours|hr|hrs|ghante|ghanta)", t_lower)
    if dur_match:
        duration = int(dur_match.group(1))

    # 3. Day extraction (with Hinglish 'kal')
    day_map = {
        "monday": "MON", "mon": "MON", "somwar": "MON",
        "tuesday": "TUE", "tue": "TUE", "mangalwar": "TUE",
        "wednesday": "WED", "wed": "WED", "budhwar": "WED",
        "thursday": "THU", "thu": "THU", "guruwar": "THU", "veervar": "THU",
        "friday": "FRI", "fri": "FRI", "shukrawar": "FRI",
        "saturday": "SAT", "sat": "SAT", "shaniwar": "SAT",
    }
    target_day = None
    for k, v in day_map.items():
        if re.search(rf"\b{k}\b", t_lower):
            target_day = v
            break

    if not target_day:
        if "kal" in t_lower or "tomorrow" in t_lower:
            # Resolve to next weekday
            today_idx = datetime.now().weekday()  # Mon=0, Sun=6
            days_seq = ["MON", "TUE", "WED", "THU", "FRI", "MON", "MON"]
            target_day = days_seq[(today_idx + 1) % 7]
        else:
            target_day = "MON"  # fallback default

    # 4. Period / Time window resolution
    # P1=8, P2=9, P3=10, P4=11, P5=12, P6=14, P7=15, P8=16, P9=17, P10=18, P11=19, P12=20, P13=21
    from_p, to_p = 10, 10 + duration - 1  # default evening event

    if re.search(r"6\s*(to|-)\s*8\s*pm", t_lower) or re.search(r"shaam\s*6", t_lower) or re.search(r"6\s*pm", t_lower):
        from_p = 10
        to_p = min(13, from_p + duration - 1)
    elif re.search(r"after\s*lunch", t_lower) or "dopeher" in t_lower:
        from_p = 6
        to_p = min(9, from_p + duration - 1)
    elif re.search(r"10\s*am", t_lower) or re.search(r"morning", t_lower) or "subah" in t_lower:
        from_p = 3
        to_p = min(5, from_p + duration - 1)
    elif re.search(r"7\s*(to|-)\s*8\s*pm", t_lower) or re.search(r"7\s*pm", t_lower):
        from_p = 11
        to_p = min(13, from_p + duration - 1)

    # 5. Needs extraction
    needs = []
    if any(k in t_lower for k in ["projector", "screen", "display"]):
        needs.append("projector")
    if any(k in t_lower for k in ["mic", "microphone", "sound", "speaker", "pa", "audio"]):
        needs.append("pa_system")
    if any(k in t_lower for k in ["stage", "podium", "dais"]):
        needs.append("stage")
    if any(k in t_lower for k in ["computer", "computers", "pc", "coding", "software"]):
        needs.append("computers")
    if any(k in t_lower for k in ["wheelchair", "accessible", "ramp", "pwd"]):
        needs.append("accessible")

    # 6. Room types extraction
    room_types = []
    if any(k in t_lower for k in ["auditorium", "audi"]):
        room_types.append("auditorium")
    elif any(k in t_lower for k in ["seminar hall", "seminar", "sh-1", "sh-2", "sh-3"]):
        room_types.append("seminar_hall")
    elif any(k in t_lower for k in ["lab", "computer lab", "hardware lab"]):
        room_types.append("lab")
    elif any(k in t_lower for k in ["open air", "oat"]):
        room_types.append("open_air_theatre")
    else:
        if attendance > 150:
            room_types = ["auditorium", "open_air_theatre"]
        elif attendance > 60:
            room_types = ["lecture_hall", "seminar_hall"]
        else:
            room_types = ["classroom", "lecture_hall", "seminar_hall"]

    # 7. Follow up detection
    follow_up = None
    if "after lunch" in t_lower and not re.search(r"\d+\s*pm", t_lower):
        follow_up = "Would period 6 (2:00 PM) to period 8 (5:00 PM) work for your session?"
    elif not any(k in t_lower for k in day_map) and "kal" not in t_lower and "tomorrow" not in t_lower:
        follow_up = "Which day of the week would you prefer (Monday to Friday)?"

    # 8. Specific room check (e.g. SH-2 accessibility conflict)
    requested_room = None
    m_room = re.search(r"\b(sh-[1-3]|cr-10[1-6]|lh-[1-5]|aud|oat)\b", t_lower)
    if m_room:
        requested_room = m_room.group(1).upper()
        if requested_room == "SH-2" and "accessible" in needs:
            # SH-2 is non-accessible; prompt user
            follow_up = "Note: SH-2 does not have wheelchair access. We recommend SH-1 which is fully accessible."

    title = "Venue Booking Request"
    if "farewell" in t_lower:
        title = "Department Farewell"
    elif "contest" in t_lower:
        title = "Coding Contest"
    elif "poster" in t_lower:
        title = "Poster Presentation"
    elif "quiz" in t_lower:
        title = "Quiz Finals"

    return {
        "title": title,
        "attendance": attendance,
        "duration_periods": duration,
        "windows": [{"day": target_day, "from_period": from_p, "to_period": to_p}],
        "needs": needs,
        "room_types": room_types,
        "requested_room": requested_room,
        "mandatory_for_groups": [],
        "follow_up": follow_up,
    }
