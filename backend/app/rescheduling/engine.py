"""
Disruption Management and Rescheduling Engine.

Given the original timetable and a set of disruptions (faculty
unavailability, room closure, new session), this engine:

  1. Generates the baseline schedule with the existing solver.
  2. Identifies which sessions are *affected* by the disruptions.
  3. Freezes all *unaffected* sessions in place.
  4. Re-solves with OR-Tools CP-SAT for only the affected + new sessions,
     subject to all original hard constraints.
  5. Minimises the number of moved sessions (soft objective).
  6. Produces a before/after diff and constraint-conflict explanations
     when no solution exists.

No LLM or non-deterministic logic is used.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import defaultdict
from typing import Any

from ortools.sat.python import cp_model

from app.core.dataset import load_dataset
from app.scheduling.data_prep import build_solver_data
from app.scheduling.solver import solve as solve_original


# ── Module-level proposal store (in-memory, no DB yet) ──────────

_proposals: dict[str, dict] = {}


def get_proposal(proposal_id: str) -> dict | None:
    return _proposals.get(proposal_id)


def list_proposals() -> list[dict]:
    """Return all stored proposals, newest first."""
    return list(reversed(list(_proposals.values())))


# ── Helpers ─────────────────────────────────────────────────────


def _apply_disruptions(data: dict[str, Any], changes: list[dict]) -> tuple[
    dict[str, Any],          # updated data (mutated copy)
    set[str],                # affected session ids
    list[dict],              # new sessions to add
]:
    """Mutate *data* lookups with disruption changes.

    Returns the set of session IDs that are directly affected and the
    list of newly added sessions.
    """
    affected: set[str] = set()
    new_sessions: list[dict] = []

    for change in changes:
        ctype = change.get("type", "")

        if ctype == "faculty_unavailable":
            fid = change.get("faculty_id")
            days = [d[:3].upper() if len(d) >= 3 else d for d in change.get("days", [])]
            for day in days:
                for pid in change.get("periods", []):
                    data["faculty_unavail"][(fid, day, pid)] = True

        elif ctype == "room_unavailable":
            rid = change.get("room_id")
            days = [d[:3].upper() if len(d) >= 3 else d for d in change.get("days", [])]
            for day in days:
                for pid in change.get("periods", []):
                    data["room_unavail"][(rid, day, pid)] = True

        elif ctype == "add_session":
            sess = dict(change.get("session", {}))
            sid = sess.get("id") or sess.get("session_id")
            if not sid:
                sid = f"EXTRA-{len(new_sessions) + 1}"
            sess["id"] = sid
            sess["session_id"] = sid

            req_day = sess.get("day")
            if req_day and len(req_day) >= 3:
                sess["day"] = req_day[:3].upper()

            # If this session already exists in the dataset, it is a move/shift!
            if sid in data.get("session_by_id", {}):
                affected.add(sid)
                orig_sess = data["session_by_id"][sid]
                if sess.get("day") and sess.get("period"):
                    orig_sess["fixed_slot"] = {"day": sess["day"], "period": sess["period"]}
                continue

            # Fill missing attributes with safe defaults
            if "course_id" not in sess:
                sess["course_id"] = f"EXTRA-{sid}"
            if "kind" not in sess:
                sess["kind"] = "lecture"
            if "groups" not in sess:
                sess["groups"] = ["CSE-1"]
            if "duration" not in sess:
                sess["duration"] = 2 if sess["kind"] == "lab" else 1
            if "size" not in sess:
                sess["size"] = 60
            if "room_types" not in sess or not sess["room_types"]:
                if sess["kind"] == "lab":
                    sess["room_types"] = ["lab_cs", "lab"]
                else:
                    sess["room_types"] = ["classroom", "lecture_hall", "auditorium"]
            if "needs_accessible" not in sess:
                sess["needs_accessible"] = False
            if "basket_slot" not in sess:
                sess["basket_slot"] = None
            if "fixed_slot" not in sess:
                if sess.get("day") and sess.get("period"):
                    sess["fixed_slot"] = {"day": sess["day"], "period": sess["period"]}
                else:
                    sess["fixed_slot"] = None

            new_sessions.append(sess)

        elif ctype in ("move_session", "session_unavailable"):
            sid = change.get("session_id") or change.get("id")
            if sid:
                affected.add(sid)
                t_day = change.get("target_day")
                t_per = change.get("target_period")
                if sid in data.get("session_by_id", {}) and t_day and t_per:
                    norm_day = t_day[:3].upper() if len(t_day) >= 3 else t_day
                    data["session_by_id"][sid]["fixed_slot"] = {
                        "day": norm_day,
                        "period": t_per,
                    }

    return data, affected, new_sessions


def _identify_affected(
    baseline: list[dict],
    data: dict[str, Any],
    new_sessions: list[dict],
) -> set[str]:
    """Return session IDs that conflict with the new disruption state.

    A session is affected if its current placement:
      - Uses a room+day+period that is now unavailable.
      - Has a faculty member who is now unavailable during that slot.
      - Shares a student-group slot with a newly added session
        (handled later during solve).
    """
    affected: set[str] = set()

    for s in baseline:
        sid = s["session_id"]
        day = s["day"]
        pid = s["period"]
        dur = s["duration"]
        rid = s["room_id"]
        fid = s.get("faculty_id")

        for off in range(dur):
            p = pid + off
            # Room now closed?
            if (rid, day, p) in data["room_unavail"]:
                affected.add(sid)
            # Faculty now unavailable?
            if fid and (fid, day, p) in data["faculty_unavail"]:
                affected.add(sid)

    # Also flag sessions that share groups/faculty with affected ones
    # (cascade: moving one session may free/block another's slot).
    # We do one level of cascade on group and faculty collisions.
    affected_groups: set[str] = set()
    affected_faculty: set[str] = set()
    baseline_map = {s["session_id"]: s for s in baseline}

    for sid in list(affected):
        s = baseline_map.get(sid)
        if s:
            if s.get("faculty_id"):
                affected_faculty.add(s["faculty_id"])
            for g in s.get("groups", []):
                affected_groups.add(g)

    # Sessions whose groups or faculty overlap the affected set AND
    # share the same day-period slot as an affected session need
    # freedom to move.  We add basket-mates of affected sessions too.
    affected_slots: set[tuple[str, int]] = set()
    for sid in affected:
        s = baseline_map.get(sid)
        if s:
            for off in range(s["duration"]):
                affected_slots.add((s["day"], s["period"] + off))

    # Add basket-mates of any affected session
    for sid in list(affected):
        sess_def = data["session_by_id"].get(sid)
        if sess_def and sess_def.get("basket_slot"):
            bs = sess_def["basket_slot"]
            for mate_id in data["basket_slots"].get(bs, []):
                affected.add(mate_id)

    # New sessions are always "affected" (need to be placed)
    for ns in new_sessions:
        affected.add(ns["id"])

    return affected


# ── Rescheduling solver ─────────────────────────────────────────


def _compatible_rooms(session: dict, data: dict[str, Any]) -> list[str]:
    """Room IDs compatible with a session (type, capacity, accessibility)."""
    compat = []
    r_types = session.get("room_types") or (
        ["lab_cs", "lab"] if session.get("kind") == "lab" else ["classroom", "lecture_hall", "auditorium"]
    )
    sz = session.get("size", 60)
    for r in data["rooms"]:
        if r["type"] not in r_types:
            continue
        if r["capacity"] < sz:
            continue
        if session.get("needs_accessible", False) and not r.get("accessible", False):
            continue
        fid = session.get("faculty_id")
        if fid:
            fac = data["faculty_by_id"].get(fid)
            if fac and fac.get("needs_accessible", False) and not r.get("accessible", False):
                continue
        compat.append(r["id"])
    return compat


def _valid_start_slots(session: dict, data: dict[str, Any]) -> list[int]:
    """Valid timeslot indices for a session start (mirrors solver logic)."""
    duration = session["duration"]
    fid = session.get("faculty_id")
    ts = data["timeslots"]
    ts_idx = data["ts_idx"]
    teaching = set(data["teaching_periods"])
    lunch_after = data["lunch_after"]
    lab_starts = set(data["lab_start_periods"])

    fixed = session.get("fixed_slot")
    if fixed:
        f_day = fixed.get("day", "")
        if len(f_day) >= 3:
            f_day = f_day[:3].upper()
        idx = ts_idx.get((f_day, fixed.get("period")))
        return [idx] if idx is not None else []

    valid = []
    for i, (day, pid) in enumerate(ts):
        period_ids = []
        ok = True
        for off in range(duration):
            tp = pid + off
            if tp not in teaching or (day, tp) not in ts_idx:
                ok = False
                break
            period_ids.append(tp)
        if not ok:
            continue

        if duration > 1:
            if any(period_ids[j] == lunch_after for j in range(len(period_ids) - 1)):
                continue

        if duration == 3 and session.get("kind") == "lab":
            if pid not in lab_starts:
                continue

        if fid:
            if any((fid, day, tp) in data["faculty_unavail"] for tp in period_ids):
                continue

        valid.append(i)
    return valid


def generate_proposal(
    changes: list[dict],
    time_limit_seconds: int = 60,
) -> dict:
    """Build a rescheduling proposal for the given disruptions.

    Returns a proposal dict suitable for inspection and approval.
    """
    t0 = time.time()

    # 1. Get baseline schedule
    baseline_result = solve_original(time_limit_seconds=120)
    if baseline_result["status"] not in ("OPTIMAL", "FEASIBLE"):
        return {
            "proposal_id": "",
            "status": "infeasible",
            "solver_status": baseline_result["status"],
            "total_sessions": 0,
            "frozen_count": 0,
            "rescheduled_count": 0,
            "moved_count": 0,
            "added_count": 0,
            "unscheduled_count": 0,
            "changes": [],
            "conflicts": ["Baseline schedule could not be generated"],
            "solve_time_seconds": round(time.time() - t0, 2),
            "approved": False,
        }

    baseline = baseline_result["scheduled"]
    baseline_map = {s["session_id"]: s for s in baseline}

    # 2. Build solver data and apply disruptions
    data = build_solver_data()

    # Make mutable copies so we never mutate the shared/cached originals
    data = dict(data)  # shallow copy of top-level dict
    data["faculty_unavail"] = dict(data["faculty_unavail"])
    data["room_unavail"] = dict(data["room_unavail"])
    data["sessions"] = list(data["sessions"])           # copy the list
    data["session_by_id"] = dict(data["session_by_id"]) # copy the dict
    data["basket_slots"] = {k: list(v) for k, v in data["basket_slots"].items()}  # deep-copy

    data, _, new_sessions = _apply_disruptions(data, changes)

    # Register new sessions in data lookups (now safe — mutates copies only)
    for ns in new_sessions:
        data["sessions"].append(ns)
        data["session_by_id"][ns["id"]] = ns
        bs = ns.get("basket_slot")
        if bs:
            data["basket_slots"].setdefault(bs, []).append(ns["id"])

    # 3. Identify affected sessions
    affected_ids = _identify_affected(baseline, data, new_sessions)

    # Build session list: all original + new
    all_session_ids = {s["id"] for s in data["sessions"]}
    frozen_ids = all_session_ids - affected_ids
    # Remove new sessions from frozen (they have no baseline placement)
    new_ids = {ns["id"] for ns in new_sessions}
    frozen_ids -= new_ids

    # Verify frozen sessions still fit (their placement must not violate
    # new constraints).  If a frozen session's slot is now invalid, unfreeze it.
    truly_frozen: dict[str, dict] = {}  # sid -> {day, period, room_id}
    for sid in list(frozen_ids):
        if sid not in baseline_map:
            frozen_ids.discard(sid)
            affected_ids.add(sid)
            continue
        s = baseline_map[sid]
        day, pid, dur, rid = s["day"], s["period"], s["duration"], s["room_id"]
        fid = s.get("faculty_id")
        still_ok = True
        for off in range(dur):
            p = pid + off
            if (rid, day, p) in data["room_unavail"]:
                still_ok = False
                break
            if fid and (fid, day, p) in data["faculty_unavail"]:
                still_ok = False
                break
        if still_ok:
            truly_frozen[sid] = {"day": day, "period": pid, "room_id": rid}
        else:
            frozen_ids.discard(sid)
            affected_ids.add(sid)

    # 4. Build CP-SAT model
    model = cp_model.CpModel()

    ts = data["timeslots"]
    ts_idx_map = data["ts_idx"]
    rooms = data["rooms"]

    # Decision variables
    x: dict[tuple[str, int, str], Any] = {}
    session_vars: dict[str, list[tuple[int, str]]] = {}
    infeasible_sessions: list[dict] = []

    sessions_to_schedule = [
        data["session_by_id"][sid]
        for sid in (affected_ids | frozen_ids)
        if sid in data["session_by_id"]
    ]

    for s in sessions_to_schedule:
        sid = s["id"]

        if sid in truly_frozen:
            # Fixed to baseline placement
            f = truly_frozen[sid]
            t_idx = ts_idx_map.get((f["day"], f["period"]))
            if t_idx is None:
                infeasible_sessions.append({"session_id": sid, "reason": "Frozen slot invalid"})
                continue
            rid = f["room_id"]
            var = model.new_bool_var(f"x_{sid}_{t_idx}_{rid}")
            model.add(var == 1)
            x[(sid, t_idx, rid)] = var
            session_vars[sid] = [(t_idx, rid)]
            continue

        # Free session — find valid placements
        valid_starts = _valid_start_slots(s, data)
        compat_rooms = _compatible_rooms(s, data)

        if not valid_starts:
            infeasible_sessions.append({"session_id": sid, "reason": "No valid timeslot after disruption"})
            continue
        if not compat_rooms:
            infeasible_sessions.append({"session_id": sid, "reason": "No compatible room after disruption"})
            continue

        combos: list[tuple[int, str]] = []
        for t_idx in valid_starts:
            day, pid = ts[t_idx]
            for rid in compat_rooms:
                room_ok = True
                for off in range(s["duration"]):
                    if (rid, day, pid + off) in data["room_unavail"]:
                        room_ok = False
                        break
                if room_ok:
                    var = model.new_bool_var(f"x_{sid}_{t_idx}_{rid}")
                    x[(sid, t_idx, rid)] = var
                    combos.append((t_idx, rid))

        if not combos:
            infeasible_sessions.append(
                {"session_id": sid, "reason": "No valid slot+room combo after disruption"}
            )
            continue

        session_vars[sid] = combos

    # HC1: every schedulable session exactly once
    for sid, combos in session_vars.items():
        model.add(sum(x[(sid, t, r)] for t, r in combos) == 1)

    # Build (day, period) -> variables mapping
    dp_vars: dict[tuple[str, int], list[tuple[str, int, str, Any]]] = defaultdict(list)
    for sid, combos in session_vars.items():
        s = data["session_by_id"][sid]
        dur = s["duration"]
        for t_idx, rid in combos:
            day, pid = ts[t_idx]
            for off in range(dur):
                dp_vars[(day, pid + off)].append((sid, t_idx, rid, x[(sid, t_idx, rid)]))

    # HC6: no room overlap
    for (day, pid), var_list in dp_vars.items():
        room_groups: dict[str, list] = defaultdict(list)
        for sid, t_idx, rid, var in var_list:
            room_groups[rid].append(var)
        for rid, vrs in room_groups.items():
            if len(vrs) > 1:
                model.add(sum(vrs) <= 1)

    # HC2: no faculty overlap
    faculty_dp: dict[tuple[str, str, int], list] = defaultdict(list)
    for sid, combos in session_vars.items():
        s = data["session_by_id"][sid]
        fid = s.get("faculty_id")
        if not fid:
            continue
        dur = s["duration"]
        for t_idx, rid in combos:
            day, pid = ts[t_idx]
            for off in range(dur):
                faculty_dp[(fid, day, pid + off)].append(x[(sid, t_idx, rid)])
    for key, vl in faculty_dp.items():
        if len(vl) > 1:
            model.add(sum(vl) <= 1)

    # HC3: no student-group overlap (basket-exempt)
    basket_mates: dict[str, set[str]] = {}
    for bs_name, bs_sids in data["basket_slots"].items():
        for sid in bs_sids:
            basket_mates.setdefault(sid, set())
            for other in bs_sids:
                if other != sid:
                    basket_mates[sid].add(other)

    group_dp: dict[tuple[str, str, int], list[tuple[str, Any]]] = defaultdict(list)
    for sid, combos in session_vars.items():
        s = data["session_by_id"][sid]
        dur = s["duration"]
        for gid in s.get("groups", []):
            for t_idx, rid in combos:
                day, pid = ts[t_idx]
                for off in range(dur):
                    group_dp[(gid, day, pid + off)].append((sid, x[(sid, t_idx, rid)]))

    for key, entries in group_dp.items():
        if len(entries) <= 1:
            continue
        sids_here = [e[0] for e in entries]
        vars_here = [e[1] for e in entries]
        has_basket = any(s in basket_mates for s in sids_here)
        if not has_basket:
            model.add(sum(vars_here) <= 1)
        else:
            bg: dict[str | None, list[int]] = defaultdict(list)
            for idx, sid in enumerate(sids_here):
                s_def = data["session_by_id"][sid]
                bg[s_def.get("basket_slot")].append(idx)
            non_basket = []
            basket_reps: list[Any] = []
            for bs, indices in bg.items():
                if bs is None:
                    for idx in indices:
                        non_basket.append(vars_here[idx])
                else:
                    if len(indices) == 1:
                        basket_reps.append(vars_here[indices[0]])
                    else:
                        rep = model.new_bool_var(f"brep_{key}_{bs}")
                        for idx in indices:
                            model.add(rep >= vars_here[idx])
                        model.add(rep <= sum(vars_here[idx] for idx in indices))
                        basket_reps.append(rep)
            all_competing = non_basket + basket_reps
            if len(all_competing) > 1:
                model.add(sum(all_competing) <= 1)

    # HC5: basket sessions must happen simultaneously
    for bs_name, bs_sids in data["basket_slots"].items():
        active = [sid for sid in bs_sids if sid in session_vars]
        if len(active) <= 1:
            continue
        common_ts = None
        for sid in active:
            sid_ts = {t for t, r in session_vars[sid]}
            common_ts = sid_ts if common_ts is None else common_ts & sid_ts
        if not common_ts:
            continue
        basket_ts_vars: dict[int, Any] = {}
        for t_idx in sorted(common_ts):
            basket_ts_vars[t_idx] = model.new_bool_var(f"basket_{bs_name}_ts_{t_idx}")
        model.add(sum(basket_ts_vars.values()) == 1)
        for sid in active:
            for t_idx in sorted(common_ts):
                sat = [x[(sid, t, r)] for t, r in session_vars[sid] if t == t_idx]
                if sat:
                    model.add(sum(sat) == basket_ts_vars[t_idx])
                else:
                    model.add(basket_ts_vars[t_idx] == 0)

    # HC14: faculty daily hours
    faculty_day_hrs: dict[tuple[str, str], list[tuple[Any, int]]] = defaultdict(list)
    for sid, combos in session_vars.items():
        s = data["session_by_id"][sid]
        fid = s.get("faculty_id")
        if not fid:
            continue
        dur = s["duration"]
        for t_idx, rid in combos:
            day, _ = ts[t_idx]
            faculty_day_hrs[(fid, day)].append((x[(sid, t_idx, rid)], dur))
    for (fid, day), entries in faculty_day_hrs.items():
        fac = data["faculty_by_id"].get(fid)
        max_h = fac.get("max_hours_per_day", 8) if fac else 8
        model.add(sum(v * d for v, d in entries) <= max_h)

    # ── Soft objective: minimise moves ──
    penalties: list[Any] = []
    MOVE_PENALTY = 10

    for sid in affected_ids:
        if sid in new_ids or sid not in session_vars or sid not in baseline_map:
            continue
        orig = baseline_map[sid]
        orig_t = ts_idx_map.get((orig["day"], orig["period"]))
        orig_r = orig["room_id"]
        if orig_t is not None and (sid, orig_t, orig_r) in x:
            # Penalise NOT staying in the original slot
            penalties.append((1 - x[(sid, orig_t, orig_r)]) * MOVE_PENALTY)

    if penalties:
        model.minimize(sum(penalties))

    # 5. Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_workers = 8
    solver.parameters.log_search_progress = False

    status_code = solver.solve(model)
    solve_time = time.time() - t0

    status_names = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN",
    }
    solver_status = status_names.get(status_code, "UNKNOWN")

    # Detect pre-infeasible original sessions — if any non-new session
    # could not even be modelled, the overall result is infeasible.
    pre_infeasible_originals = [
        inf for inf in infeasible_sessions if inf["session_id"] not in new_ids
    ]
    if pre_infeasible_originals:
        solver_status = "INFEASIBLE"

    # 6. Extract results and build diff
    change_list: list[dict] = []
    conflicts: list[str] = []

    if solver_status in ("OPTIMAL", "FEASIBLE"):
        new_schedule: dict[str, dict] = {}
        for sid, combos in session_vars.items():
            for t_idx, rid in combos:
                if solver.value(x[(sid, t_idx, rid)]):
                    day, pid = ts[t_idx]
                    new_schedule[sid] = {"day": day, "period": pid, "room_id": rid}
                    break

        # Diff: affected sessions only
        for sid in affected_ids:
            if sid in new_ids:
                # Added session
                if sid in new_schedule:
                    change_list.append({
                        "session_id": sid,
                        "kind": "added",
                        "before": None,
                        "after": new_schedule[sid],
                        "reason": "New session from disruption",
                    })
                else:
                    change_list.append({
                        "session_id": sid,
                        "kind": "unscheduled",
                        "before": None,
                        "after": None,
                        "reason": "New session could not be placed",
                    })
                continue

            orig = baseline_map.get(sid)
            before = (
                {"day": orig["day"], "period": orig["period"], "room_id": orig["room_id"]}
                if orig else None
            )

            if sid in new_schedule:
                after = new_schedule[sid]
                if before and (before["day"] != after["day"]
                               or before["period"] != after["period"]
                               or before["room_id"] != after["room_id"]):
                    change_list.append({
                        "session_id": sid,
                        "kind": "moved",
                        "before": before,
                        "after": after,
                        "reason": "Moved due to disruption",
                    })
                # If same placement, no change entry needed
            else:
                change_list.append({
                    "session_id": sid,
                    "kind": "unscheduled",
                    "before": before,
                    "after": None,
                    "reason": "Could not be rescheduled after disruption",
                })

        # Also record infeasible sessions
        for inf in infeasible_sessions:
            if inf["session_id"] not in {c["session_id"] for c in change_list}:
                change_list.append({
                    "session_id": inf["session_id"],
                    "kind": "unscheduled",
                    "before": baseline_map.get(inf["session_id"], {
                        "day": None, "period": None, "room_id": None,
                    }),
                    "after": None,
                    "reason": inf["reason"],
                })

    else:
        # Infeasible / unknown
        conflicts.append(f"Solver returned {solver_status} — no valid reschedule found")
        for inf in infeasible_sessions:
            conflicts.append(f"{inf['session_id']}: {inf['reason']}")
        # Mark all affected as unscheduled
        for sid in affected_ids:
            orig = baseline_map.get(sid)
            before = (
                {"day": orig["day"], "period": orig["period"], "room_id": orig["room_id"]}
                if orig else None
            )
            change_list.append({
                "session_id": sid,
                "kind": "unscheduled",
                "before": before,
                "after": None,
                "reason": "No feasible reschedule found",
            })

    moved = sum(1 for c in change_list if c["kind"] == "moved")
    added = sum(1 for c in change_list if c["kind"] == "added")
    unsched = sum(1 for c in change_list if c["kind"] == "unscheduled")

    # Build proposal
    proposal_id = hashlib.sha256(
        json.dumps(changes, sort_keys=True, default=str).encode()
        + str(time.time()).encode()
    ).hexdigest()[:16]

    # Build the full approved schedule for later use
    approved_schedule: list[dict] | None = None
    if solver_status in ("OPTIMAL", "FEASIBLE"):
        approved_schedule = []
        # Frozen sessions keep their baseline placement
        for sid, placement in truly_frozen.items():
            s = data["session_by_id"][sid]
            orig = baseline_map.get(sid, {})
            approved_schedule.append({
                "session_id": sid,
                "course_id": s.get("course_id"),
                "kind": s.get("kind"),
                "groups": s.get("groups", []),
                "faculty_id": s.get("faculty_id"),
                "day": placement["day"],
                "period": placement["period"],
                "duration": s["duration"],
                "room_id": placement["room_id"],
                "size": s.get("size"),
            })
        # Affected sessions get their new placements
        for sid, combos in session_vars.items():
            if sid in truly_frozen:
                continue
            for t_idx, rid in combos:
                if solver.value(x[(sid, t_idx, rid)]):
                    day, pid = ts[t_idx]
                    s = data["session_by_id"][sid]
                    approved_schedule.append({
                        "session_id": sid,
                        "course_id": s.get("course_id"),
                        "kind": s.get("kind"),
                        "groups": s.get("groups", []),
                        "faculty_id": s.get("faculty_id"),
                        "day": day,
                        "period": pid,
                        "duration": s["duration"],
                        "room_id": rid,
                        "size": s.get("size"),
                    })
                    break

    proposal = {
        "proposal_id": proposal_id,
        "status": "feasible" if solver_status in ("OPTIMAL", "FEASIBLE") else "infeasible",
        "solver_status": solver_status,
        "total_sessions": len(data["sessions"]),
        "frozen_count": len(truly_frozen),
        "rescheduled_count": len(affected_ids) - len(new_ids),
        "moved_count": moved,
        "added_count": added,
        "unscheduled_count": unsched,
        "changes": change_list,
        "conflicts": conflicts,
        "solve_time_seconds": round(solve_time, 2),
        "approved": False,
        # Internal fields for approval
        "_approved_schedule": approved_schedule,
        "_baseline": baseline,
    }

    _proposals[proposal_id] = proposal
    return proposal


def approve_proposal(proposal_id: str, approved_by: str) -> dict:
    """Approve a previously generated proposal.

    Returns the approved schedule without re-running the solver.
    Self-approval is not blocked here (admin endpoint), but the
    caller must have role ``admin``.
    """
    proposal = _proposals.get(proposal_id)
    if proposal is None:
        return {"error": f"Proposal '{proposal_id}' not found"}

    if proposal["status"] != "feasible":
        return {"error": "Cannot approve an infeasible proposal"}

    if proposal["approved"]:
        return {"error": "Proposal already approved"}

    proposal["approved"] = True
    proposal["approved_by"] = approved_by

    return {
        "proposal_id": proposal_id,
        "approved": True,
        "approved_by": approved_by,
        "schedule": proposal["_approved_schedule"],
        "changes": proposal["changes"],
    }

