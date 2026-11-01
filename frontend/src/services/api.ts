/* ──────────────────────────────────────────────
 *  API client — CIT Campus Scheduler
 *
 *  Thin wrapper around fetch(). Base URL is read
 *  from the VITE_API_BASE_URL env variable so it
 *  is never hardcoded in component code.
 * ────────────────────────────────────────────── */

import type {
  HealthResponse,
  DatasetSummaryResponse,
  DatasetInfoResponse,
  DatasetFullResponse,
  ScheduleGenerateResponse,
  BookingRequest,
  Room,
  Faculty,
  ExamScheduleResult,
  ProcessBookingsResponse,
  BookingDecision,
  ProcessedBooking,
  FullBookingsData,
  FullTimetableData,
  DecisionStatus,
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

/** Represents a structured error from the API layer. */
export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

// ── Internal helpers ──────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(
      `API request failed: ${res.status}`,
      res.status,
      detail,
    );
  }

  return res.json() as Promise<T>;
}

// ── Public API surface ────────────────────────

/** GET /api/health */
export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

/**
 * GET /api/dataset/summary
 *
 * Returns counts for rooms, faculty, sessions,
 * booking_requests, exams, etc. — perfect for
 * populating the dashboard stat cards.
 */
export function fetchDatasetSummary(): Promise<DatasetSummaryResponse> {
  return request<DatasetSummaryResponse>('/api/dataset/summary');
}

/** GET /api/dataset */
export function fetchDatasetInfo(): Promise<DatasetInfoResponse> {
  return request<DatasetInfoResponse>('/api/dataset');
}

/**
 * GET /api/dataset/full
 *
 * Returns the complete dataset records:
 * rooms, faculty, student_groups, courses,
 * sessions, booking_requests, and exams.
 */
export function fetchDatasetFull(): Promise<DatasetFullResponse> {
  return request<DatasetFullResponse>('/api/dataset/full');
}

// ── Period times & Room Type mapping ──────────

const PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '08:00', end: '09:00' },
  2: { start: '09:00', end: '10:00' },
  3: { start: '10:00', end: '11:00' },
  4: { start: '11:00', end: '12:00' },
  5: { start: '12:00', end: '13:00' },
  6: { start: '14:00', end: '15:00' },
  7: { start: '15:00', end: '16:00' },
  8: { start: '16:00', end: '17:00' },
  9: { start: '17:00', end: '18:00' },
  10: { start: '18:00', end: '19:00' },
  11: { start: '19:00', end: '20:00' },
  12: { start: '20:00', end: '21:00' },
  13: { start: '21:00', end: '22:00' },
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  auditorium: 'Main Auditorium',
  lecture_hall: 'Lecture Hall',
  classroom: 'Classroom',
  seminar_hall: 'Seminar Hall',
  outdoor: 'Open Air Theatre (OAT)',
  lab_cs: 'Computing Lab',
  lab_elec: 'Electronics Lab',
  lab_phy: 'Physics Lab',
  workshop: 'Central Workshop',
  lab_civil: 'Civil Engineering Lab',
};

/**
 * Maps raw booking requests from `/api/dataset/full` to the frontend `BookingRequest` shape.
 */
export function mapDatasetBookingRequests(
  dataset: DatasetFullResponse,
  limit?: number,
): BookingRequest[] {
  const roomMap = new Map<string, string>();
  if (Array.isArray(dataset.rooms)) {
    for (const r of dataset.rooms) {
      roomMap.set(r.id, r.name);
    }
  }

  // Handle common LHC-5 alias if present
  if (!roomMap.has('LHC-5') && roomMap.has('LH-5')) {
    roomMap.set('LHC-5', roomMap.get('LH-5')!);
  }

  const list = Array.isArray(dataset.booking_requests) ? dataset.booking_requests : [];

  // Sort by submitted_at descending to present the most recent submissions first
  const sorted = [...list].sort((a, b) => {
    const timeA = new Date(a.submitted_at).getTime();
    const timeB = new Date(b.submitted_at).getTime();
    if (isNaN(timeA) || isNaN(timeB)) {
      return b.id.localeCompare(a.id);
    }
    return timeB - timeA;
  });

  const selected = typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;

  return selected.map((raw) => {
    // Resolve venue
    let venue = 'TBD';
    if (raw.requested_room) {
      venue = roomMap.get(raw.requested_room) ?? raw.requested_room;
    } else if (raw.room_types && raw.room_types.length > 0) {
      venue = ROOM_TYPE_LABELS[raw.room_types[0]] ?? raw.room_types[0];
    }

    // Resolve date
    let date = '2027-01-20';
    if (raw.submitted_at) {
      date = raw.submitted_at.split('T')[0];
    }

    // Resolve timeSlot from windows
    let timeSlot = 'TBD';
    if (raw.windows && raw.windows.length > 0) {
      const win = raw.windows[0];
      const start = PERIOD_TIMES[win.from_period]?.start ?? `P${win.from_period}`;
      const end = PERIOD_TIMES[win.to_period]?.end ?? `P${win.to_period}`;
      timeSlot = `${win.day} ${start} – ${end}`;
    }

    const role: BookingRequest['role'] =
      raw.role === 'admin' ||
      raw.role === 'club' ||
      raw.role === 'faculty' ||
      raw.role === 'department_coordinator'
        ? raw.role
        : 'club';

    const category: BookingRequest['category'] =
      raw.requested_category === 'guest_lecture' ||
      raw.requested_category === 'department_event' ||
      raw.requested_category === 'club_event' ||
      raw.requested_category === 'institute_event'
        ? raw.requested_category
        : 'club_event';

    return {
      id: raw.id,
      title: raw.title,
      requestedBy: raw.requester,
      role,
      venue,
      date,
      timeSlot,
      status: 'pending',
      category,
      createdAt: raw.submitted_at,
    };
  });
}

/**
 * Fetch booking requests from the full dataset endpoint and map them
 * into UI-compatible BookingRequest objects.
 */
export async function fetchRecentBookings(limit: number = 6): Promise<BookingRequest[]> {
  const full = await fetchDatasetFull();
  return mapDatasetBookingRequests(full, limit);
}

/**
 * Fetch all campus rooms from the full dataset endpoint.
 */
export async function fetchRooms(): Promise<Room[]> {
  const full = await fetchDatasetFull();
  return full.rooms ?? [];
}

/**
 * Fetch all faculty records from the full dataset endpoint.
 */
export async function fetchFaculty(): Promise<Faculty[]> {
  const full = await fetchDatasetFull();
  return full.faculty ?? [];
}

/**
 * GET /api/exams/schedule
 *
 * Retrieves the deterministically generated exam schedule for all 41 exams.
 */
export function fetchExamSchedule(): Promise<ExamScheduleResult> {
  return request<ExamScheduleResult>('/api/exams/schedule');
}

/**
 * Composite fetcher: fetches both the scheduled exam results and
 * the full dataset records (courses, rooms, student groups) in parallel.
 */
export async function fetchFullExamData(): Promise<{
  schedule: ExamScheduleResult;
  dataset: DatasetFullResponse;
}> {
  const [schedule, dataset] = await Promise.all([
    fetchExamSchedule(),
    fetchDatasetFull(),
  ]);
  return { schedule, dataset };
}

/**
 * POST /api/schedule/generate
 *
 * Triggers the CP-SAT solver. Can take up to
 * `timeLimitSeconds` to complete (default 120).
 */
export function generateSchedule(
  timeLimitSeconds: number = 120,
): Promise<ScheduleGenerateResponse> {
  return request<ScheduleGenerateResponse>(
    `/api/schedule/generate?time_limit_seconds=${timeLimitSeconds}`,
    { method: 'POST' },
  );
}

let cachedTimetableData: FullTimetableData | null = null;
const TIMETABLE_STORAGE_KEY = 'cit_timetable_full_data';

/**
 * Clear cached timetable to force a re-generation on next fetch.
 */
export function clearTimetableCache(): void {
  cachedTimetableData = null;
  try {
    sessionStorage.removeItem(TIMETABLE_STORAGE_KEY);
  } catch {
    // Ignore storage errors in private browsing/restricted environments
  }
}

/**
 * Composite fetcher for Timetable:
 * Runs or retrieves the CP-SAT timetable schedule and loads the full dataset records (courses, faculty, rooms, groups)
 * to resolve human-readable labels. Caches the result in-memory and sessionStorage so subsequent navigation to the
 * Timetable page is instantaneous.
 */
export async function fetchFullTimetableData(
  timeLimitSeconds: number = 120,
  forceRegenerate: boolean = false,
): Promise<FullTimetableData> {
  if (!forceRegenerate) {
    if (cachedTimetableData) {
      return cachedTimetableData;
    }
    try {
      const stored = sessionStorage.getItem(TIMETABLE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FullTimetableData;
        if (parsed?.schedule?.scheduled?.length > 0) {
          cachedTimetableData = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
  }

  const [schedule, dataset] = await Promise.all([
    generateSchedule(timeLimitSeconds),
    fetchDatasetFull(),
  ]);

  if (
    !schedule.success ||
    schedule.status === 'UNKNOWN' ||
    schedule.status === 'INFEASIBLE' ||
    !Array.isArray(schedule.scheduled) ||
    schedule.scheduled.length === 0
  ) {
    throw new ApiError(
      schedule.message || `Solver returned status: ${schedule.status}`,
      200,
      schedule.status === 'UNKNOWN'
        ? `CP-SAT solver timed out after ${schedule.solve_time_seconds ?? 0}s without finding a feasible timetable. Please click "Regenerate" to run again with the full 120s limit.`
        : `Solver returned status: ${schedule.status} (${schedule.diagnostics?.scheduled_count ?? 0}/${schedule.diagnostics?.total_sessions ?? 189} sessions scheduled).`,
    );
  }

  cachedTimetableData = { schedule, dataset };
  try {
    sessionStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(cachedTimetableData));
  } catch {
    // Ignore storage quota errors
  }

  return cachedTimetableData;
}

/**
 * POST /api/bookings/process
 *
 * Runs the deterministic booking engine on all dataset booking requests.
 */
export function processBookings(): Promise<ProcessBookingsResponse> {
  return request<ProcessBookingsResponse>('/api/bookings/process', {
    method: 'POST',
  });
}

/**
 * Composite fetcher: fetches all raw booking requests from /api/dataset/full
 * and joins them with engine decisions from /api/bookings/process via request_id and id.
 */
export async function fetchFullBookings(): Promise<FullBookingsData> {
  const [dataset, processed] = await Promise.all([
    fetchDatasetFull(),
    processBookings(),
  ]);

  const roomMap = new Map<string, string>();
  if (Array.isArray(dataset.rooms)) {
    for (const r of dataset.rooms) {
      roomMap.set(r.id, r.name);
    }
  }

  // Handle common LHC-5 alias if present
  if (!roomMap.has('LHC-5') && roomMap.has('LH-5')) {
    roomMap.set('LHC-5', roomMap.get('LH-5')!);
  }

  const decisionMap = new Map<string, BookingDecision>();
  if (Array.isArray(processed?.decisions)) {
    for (const d of processed.decisions) {
      decisionMap.set(d.request_id, d);
    }
  }

  const rawList = Array.isArray(dataset.booking_requests) ? dataset.booking_requests : [];

  const bookings: ProcessedBooking[] = rawList.map((raw) => {
    const decision = decisionMap.get(raw.id);
    const status: DecisionStatus | 'pending' = decision?.status ?? 'pending';
    const allocated = decision?.allocated ?? null;
    const alternative = decision?.alternative ?? null;
    const reasons = decision?.reasons ?? [];

    // Resolve venue
    let venue = 'None allocated';
    if (allocated) {
      const name = roomMap.get(allocated.room_id) ?? allocated.room_id;
      venue = `${name} (${allocated.room_id})`;
    } else if (alternative) {
      const name = roomMap.get(alternative.room_id) ?? alternative.room_id;
      venue = `${name} (${alternative.room_id})`;
    } else if (raw.requested_room) {
      const name = roomMap.get(raw.requested_room) ?? raw.requested_room;
      venue = `${name} (${raw.requested_room})`;
    } else if (raw.room_types && raw.room_types.length > 0) {
      venue = `${ROOM_TYPE_LABELS[raw.room_types[0]] ?? raw.room_types[0]}`;
    }

    // Resolve day & timeSlot
    let day = 'TBD';
    let timeSlot = 'TBD';

    if (allocated) {
      day = allocated.day;
      const start = PERIOD_TIMES[allocated.start_period]?.start ?? `P${allocated.start_period}`;
      const end = PERIOD_TIMES[allocated.end_period]?.end ?? `P${allocated.end_period}`;
      timeSlot = `Period ${allocated.start_period}–${allocated.end_period} (${start} – ${end})`;
    } else if (alternative) {
      day = alternative.day;
      const start = PERIOD_TIMES[alternative.start_period]?.start ?? `P${alternative.start_period}`;
      const end = PERIOD_TIMES[alternative.end_period]?.end ?? `P${alternative.end_period}`;
      timeSlot = `Period ${alternative.start_period}–${alternative.end_period} (${start} – ${end})`;
    } else if (raw.windows && raw.windows.length > 0) {
      const win = raw.windows[0];
      day = win.day;
      const start = PERIOD_TIMES[win.from_period]?.start ?? `P${win.from_period}`;
      const end = PERIOD_TIMES[win.to_period]?.end ?? `P${win.to_period}`;
      timeSlot = `Period ${win.from_period}–${win.to_period} (${start} – ${end})`;
    }

    return {
      id: raw.id,
      title: raw.title,
      requester: raw.requester,
      role: raw.role,
      department: raw.department,
      requested_category: raw.requested_category,
      attendance: raw.attendance,
      duration_periods: raw.duration_periods,
      windows: raw.windows,
      room_types: raw.room_types,
      needs: raw.needs,
      requested_room: raw.requested_room,
      mandatory_for_groups: raw.mandatory_for_groups,
      series_id: raw.series_id,
      raw_text: raw.raw_text,
      submitted_at: raw.submitted_at,

      status,
      allocated,
      alternative,
      reasons,

      venue,
      day,
      timeSlot,
    };
  });

  const summary = processed?.summary ?? {
    approved: bookings.filter((b) => b.status === 'approved').length,
    rejected: bookings.filter((b) => b.status === 'rejected').length,
    alternative_offered: bookings.filter((b) => b.status === 'alternative_offered').length,
  };

  return {
    total: bookings.length,
    summary: {
      ...summary,
      pending: bookings.filter((b) => b.status === 'pending').length,
    },
    bookings,
  };
}
