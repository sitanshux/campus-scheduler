# AI Usage Declaration — CIT Campus Scheduler

This document complies with Section 6 of the official CIT Campus Scheduling Problem Statement.

---

## 1. Models & APIs Called Inside the Product

| Model / API | Purpose | Endpoint / Module | Fallback Behavior |
|---|---|---|---|
| **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via Gemini REST API | **Natural Language Booking Extraction:** Parses plain English and Hinglish requests into structured booking fields (`attendance`, `duration_periods`, `windows`, `needs`, `room_types`, `follow_up`). | `POST /api/ai/parse-booking`<br>[`app.ai.service:parse_booking_prompt`](file:///c:/Hackathon%20final%20round/campus-scheduler/backend/app/ai/service.py) | **Deterministic Rule-Based Parser:** Regex and vocabulary extractors parse Hinglish keywords ("kal", "shaam", "log", "chahiye") and time windows if API is unavailable or offline. |
| **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via Gemini REST API | **Natural Language Schedule Changes:** Converts faculty requests into structured disruption objects (`faculty_unavailable`, `room_unavailable`, `add_session`). | `POST /api/ai/reschedule-request`<br>[`app.ai.service:process_ai_reschedule_request`](file:///c:/Hackathon%20final%20round/campus-scheduler/backend/app/ai/service.py) | **Deterministic Fallback:** Automatically constructs disruption payloads from regex patterns. |
| **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via Gemini REST API | **Decision Explanations:** Explains reasons for booking decisions, room allocations, or constraints in friendly language. | `POST /api/ai/explain`<br>[`app.ai.service:explain_decision_ai`](file:///c:/Hackathon%20final%20round/campus-scheduler/backend/app/ai/service.py) | **Deterministic Explainer:** Combines structured engine reason codes and policy messages. |

---

## 2. Location of Prompts

All system prompts and schema instructions are kept in the version-controlled codebase:
* File: [`backend/app/ai/prompts.py`](file:///c:/Hackathon%20final%20round/campus-scheduler/backend/app/ai/prompts.py)
  - `BOOKING_EXTRACTION_SYSTEM_PROMPT`: Campus period mappings, Hinglish vocabulary, and JSON schema.
  - `SCHEDULE_CHANGE_SYSTEM_PROMPT`: Disruption schema rules.
  - `DECISION_EXPLANATION_PROMPT`: Explainability prompt.

---

## 3. What the LLM is NOT Allowed to Decide

Per Section 6 of the problem statement:
1. **No Scheduling Decisions:** The LLM NEVER decides timeslot placement, room allocation, or timetable feasibility. All scheduling is solved deterministically by the Google OR-Tools CP-SAT constraint programming solver (`app/scheduling/solver.py`).
2. **No Booking Approvals:** The LLM NEVER approves or rejects bookings. All bookings are validated deterministically by the Python venue engine (`app/bookings/engine.py`) and enforced by database triggers and PostgreSQL Row-Level Security (RLS).
3. **No Direct Schedule Mutations:** The LLM NEVER directly mutates the active schedule. All AI-assisted schedule changes produce proposals that strictly require explicit **Admin Approval** (`POST /api/reschedule/approve`) before any change is applied.
4. **Hard Constraint Integrity:** Every output from the LLM is strictly validated by underlying Python code and constraint checks before modifying any data.

---

## 4. Manual Fallback Guarantee

If the Gemini API key is not configured, the network is offline, or the API quota is exhausted:
- The **Manual Booking Form** remains 100% functional via `POST /api/bookings/submit` and `POST /api/bookings/validate`.
- The **Manual Timetable Generator** remains 100% functional via `POST /api/schedule/generate`.
- The **Manual Rescheduling Workflow** remains 100% functional via `POST /api/reschedule/propose`.
- Core application workflows have **zero hard dependency** on external LLM services.

---

## 5. AI Coding Assistants Used During Development

- **Google DeepMind Antigravity:** Used for pair-programming, schema migration design, and test generation.

