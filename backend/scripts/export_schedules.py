"""
Export script to generate official schedule.json and schedule_after.json.

Uses real engine outputs:
  - CP-SAT solver for weekly timetable
  - Midsem exam allocator
  - Spectra week booking processor
  - Disruption rescheduling solver
"""

import json
import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from app.bookings.engine import process_all_bookings
from app.core.dataset import load_dataset
from app.examinations.engine import schedule_exams
from app.rescheduling.engine import approve_proposal, generate_proposal
from app.scheduling.solver import solve


def format_booking_decision(d: dict) -> dict:
    status = d["status"]
    reason = "; ".join(d.get("reasons", [])) or "Decision based on priority and availability"
    req_id = d["request_id"]

    if status == "approved":
        slot = d["allocated"]
        return {
            "request_id": req_id,
            "status": "approved",
            "day": slot["day"],
            "start_period": slot["start_period"],
            "end_period": slot["end_period"],
            "room_id": slot["room_id"],
            "reason": reason,
        }
    elif status == "alternative_offered":
        slot = d.get("alternative") or d.get("allocated")
        return {
            "request_id": req_id,
            "status": "alternative_offered",
            "day": slot["day"],
            "start_period": slot["start_period"],
            "end_period": slot["end_period"],
            "room_id": slot["room_id"],
            "reason": reason,
        }
    else:  # rejected
        return {
            "request_id": req_id,
            "status": "rejected",
            "reason": reason,
        }


def format_exam_entry(e: dict) -> dict:
    return {
        "exam_id": e["exam_id"],
        "day": e["day"],
        "session": e["session"],
        "rooms": [r["room_id"] for r in e.get("rooms", [])],
    }


def main():
    project_root = backend_dir.parent
    exports_dir = project_root / "exports"
    exports_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("1. Generating Baseline Schedule (Timetable, Exams, Bookings)...")
    print("=" * 60)

    # 1. Weekly timetable
    print("Running weekly timetable CP-SAT solver...")
    tt_result = solve(time_limit_seconds=120)
    if tt_result["status"] not in ("OPTIMAL", "FEASIBLE"):
        print(f"ERROR: Weekly timetable solver failed with status {tt_result['status']}")
        sys.exit(1)
    print(f"Timetable solver status: {tt_result['status']} in {tt_result['solve_time_seconds']}s")
    print(f"Scheduled sessions: {len(tt_result['scheduled'])}")

    formatted_sessions = [
        {
            "session_id": s["session_id"],
            "day": s["day"],
            "start_period": s["period"],
            "room_id": s["room_id"],
        }
        for s in tt_result["scheduled"]
    ]

    # 2. Exams
    print("Running midsem exam allocator...")
    exam_res = schedule_exams()
    print(f"Scheduled exams: {exam_res['scheduled_count']}/{exam_res['total_exams']}")
    formatted_exams = [format_exam_entry(e) for e in exam_res["scheduled"]]

    # 3. Bookings
    print("Processing Spectra week booking requests...")
    booking_decisions = process_all_bookings()
    print(f"Total booking decisions: {len(booking_decisions)}")
    formatted_bookings = [format_booking_decision(d) for d in booking_decisions]

    baseline_export = {
        "team": "CIT Campus Schedulers",
        "dataset_id": "cit-public-v1",
        "sessions": formatted_sessions,
        "fest_week": {
            "bookings": formatted_bookings,
            "session_overrides": [],
        },
        "exams": formatted_exams,
    }

    baseline_path = exports_dir / "schedule.json"
    with open(baseline_path, "w", encoding="utf-8") as f:
        json.dump(baseline_export, f, indent=2)
    print(f"Saved baseline schedule to: {baseline_path}")

    # 4. Rescheduling with sample_disruption.json
    print("\n" + "=" * 60)
    print("2. Generating After-Disruption Schedule (sample_disruption.json)...")
    print("=" * 60)

    disruption_path = project_root / "data" / "sample_disruption.json"
    with open(disruption_path, "r", encoding="utf-8") as f:
        disruption_data = json.load(f)

    changes = disruption_data.get("changes", [])
    print(f"Applying {len(changes)} disruptions from {disruption_path.name}...")

    proposal = generate_proposal(changes, time_limit_seconds=120)
    if proposal["status"] != "feasible":
        print(f"ERROR: Disruption proposal infeasible! Conflicts: {proposal.get('conflicts')}")
        sys.exit(1)

    print(f"Disruption solver status: {proposal['status']} in {proposal['solve_time_seconds']}s")
    print(f"Moved count: {proposal['moved_count']}, Added count: {proposal['added_count']}")

    approved = approve_proposal(proposal["proposal_id"], approved_by="admin")
    after_schedule_sessions = approved["schedule"]

    formatted_after_sessions = [
        {
            "session_id": s["session_id"],
            "day": s["day"],
            "start_period": s["period"],
            "room_id": s["room_id"],
        }
        for s in after_schedule_sessions
    ]

    after_export = {
        "team": "CIT Campus Schedulers",
        "dataset_id": "cit-public-v1",
        "sessions": formatted_after_sessions,
        "fest_week": {
            "bookings": formatted_bookings,
            "session_overrides": [],
        },
        "exams": formatted_exams,
    }

    after_path = exports_dir / "schedule_after.json"
    with open(after_path, "w", encoding="utf-8") as f:
        json.dump(after_export, f, indent=2)
    print(f"Saved rescheduled schedule to: {after_path}")

    print("\n" + "=" * 60)
    print("EXPORTS GENERATED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    main()

