"""
Unit tests for AI / LLM integration:
  1. Plain English booking parsing
  2. Hinglish booking parsing (kal, shaam, ghante, log, mic)
  3. Accessibility conflict awareness
  4. Follow-up questioning for ambiguous requests
  5. AI-assisted scheduling change proposals (converted to CP-SAT proposals)
  6. Decision explanations
  7. Deterministic manual fallback when Gemini API is unavailable
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.ai.client import parse_booking_fallback
from app.ai.service import (
    explain_decision_ai,
    parse_booking_prompt,
    process_ai_reschedule_request,
)
from app.main import app
from app.core.auth import get_verified_user


@pytest.fixture
def mock_faculty_user():
    return {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "email": "faculty@cit.edu",
        "full_name": "Dr. Sharma",
        "role": "faculty",
        "department": "CS",
        "faculty_id": "F01",
    }


@pytest.fixture
def client_with_auth(mock_faculty_user):
    app.dependency_overrides[get_verified_user] = lambda: mock_faculty_user
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.pop(get_verified_user, None)


class TestAIBookingParser:

    def test_english_request_parsing(self, client_with_auth):
        """Sample 1: Need a room for 45 people on Tuesday 6 to 8 pm, projector please."""
        text = "Need a room for 45 people on Tuesday 6 to 8 pm, projector please."
        res = client_with_auth.post("/api/ai/parse-booking", json={"text": text})

        assert res.status_code == 200
        data = res.json()
        assert data["attendance"] == 45
        assert data["duration_periods"] == 2
        assert any(w["day"] == "TUE" and w["from_period"] == 10 for w in data["windows"])
        assert "projector" in data["needs"]

    def test_hinglish_request_parsing(self, client_with_auth):
        """Sample 6: seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye."""
        text = "seminar hall kal shaam 6 baje, 2 ghante, 100 log, mic chahiye"
        res = client_with_auth.post("/api/ai/parse-booking", json={"text": text})

        assert res.status_code == 200
        data = res.json()
        assert data["attendance"] == 100
        assert data["duration_periods"] == 2
        assert "seminar_hall" in data["room_types"]
        assert "pa_system" in data["needs"]
        assert any(w["from_period"] == 10 for w in data["windows"])

    def test_accessibility_conflict_detection(self, client_with_auth):
        """Sample 7: Requesting non-accessible SH-2 with wheelchair need produces advisory."""
        text = "I want SH-2 on Friday at 10 am for a wheelchair-accessible poster session, 60 people."
        res = client_with_auth.post("/api/ai/parse-booking", json={"text": text})

        assert res.status_code == 200
        data = res.json()
        assert "accessible" in data["needs"]
        assert data["follow_up"] is not None
        assert "sh-1" in data["follow_up"].lower()

    def test_vague_request_follow_up(self, client_with_auth):
        """Sample 8: Vague request after lunch generates follow-up question."""
        text = "Need somewhere for the quiz finals after lunch on Thursday, maybe 150 people."
        res = client_with_auth.post("/api/ai/parse-booking", json={"text": text})

        assert res.status_code == 200
        data = res.json()
        assert data["attendance"] == 150
        assert data["follow_up"] is not None


class TestAISchedulingChanges:

    def test_faculty_leave_request_to_proposal(self, client_with_auth):
        """Faculty requests leave, converted to disruption and sent to solver."""
        prompt = "I am on leave next Monday due to personal work, please reschedule my classes."
        res = client_with_auth.post("/api/ai/reschedule-request", json={"prompt": prompt})

        assert res.status_code == 200
        data = res.json()
        assert data["requires_admin_approval"] is True
        assert data["proposal_id"] is not None
        assert any(c["type"] == "faculty_unavailable" for c in data["extracted_changes"])


class TestAIDecisionExplanation:

    def test_explain_rejected_booking(self, client_with_auth):
        context = {
            "request_id": "BR-09",
            "status": "rejected",
            "reasons": ["No venue on campus seats 1,200 (largest is OAT at 800)"],
        }
        res = client_with_auth.post(
            "/api/ai/explain",
            json={"decision_type": "booking", "context": context},
        )
        assert res.status_code == 200
        assert "1,200" in res.json()["explanation"] or "capacity" in res.json()["explanation"].lower()


class TestDeterministicFallback:

    def test_fallback_parser_works_completely_offline(self):
        result = parse_booking_fallback("Auditorium on Friday 6 to 8 pm for 300 students with mic and stage")
        assert result["attendance"] == 300
        assert result["duration_periods"] == 2
        assert "auditorium" in result["room_types"]
        assert "pa_system" in result["needs"]
        assert "stage" in result["needs"]

