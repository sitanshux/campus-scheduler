/* ──────────────────────────────────────────────
 *  Types — CIT Campus Scheduler Frontend
 *
 *  Includes both UI-layer types and types that
 *  mirror the actual FastAPI response shapes.
 * ────────────────────────────────────────────── */

// ── Room (matches backend dataset.rooms[]) ──

export interface Room {
  id: string;
  name: string;
  building: string;
  type:
    | 'auditorium'
    | 'lecture_hall'
    | 'classroom'
    | 'seminar_hall'
    | 'outdoor'
    | 'lab_cs'
    | 'lab_elec'
    | 'lab_phy'
    | 'workshop'
    | 'lab_civil';
  capacity: number;
  features: string[];
  accessible: boolean;
  allowed_uses: string[];
}

// ── Faculty (matches backend dataset.faculty[]) ──

export interface FacultyUnavailability {
  day: string;
  periods: number[];
  reason: string;
}

export interface FacultyPreference {
  type: string;
  days: string[];
  periods: number[];
  note: string;
}

export interface Faculty {
  id: string;
  name: string;
  department: string;
  max_hours_per_day: number;
  needs_accessible: boolean;
  unavailable: FacultyUnavailability[];
  preferences: FacultyPreference[];
}

// ── Booking request (UI-layer shape for display) ──

export interface BookingRequest {
  id: string;
  title: string;
  requestedBy: string;
  role: 'faculty' | 'department_coordinator' | 'club' | 'admin';
  venue: string;
  date: string;
  timeSlot: string;
  status: 'pending' | 'approved' | 'rejected' | 'alternative_offered';
  category: 'guest_lecture' | 'department_event' | 'club_event' | 'institute_event';
  createdAt: string;
}

// ── Dashboard stats (UI-layer aggregate) ──

export interface DashboardStats {
  totalRooms: number;
  totalFaculty: number;
  activeSessions: number;
  pendingBookings: number;
}

// ── Navigation ──

export type PageId = 'dashboard' | 'timetable' | 'rooms' | 'faculty' | 'exams' | 'bookings';

// ══════════════════════════════════════════════
//  Backend API response types
//  (derived from inspecting the FastAPI routes)
// ══════════════════════════════════════════════

/** GET /api/health */
export interface HealthResponse {
  status: string;
  service: string;
}

/** GET /api/dataset/summary → get_dataset_summary() */
export interface DatasetSummaryResponse {
  dataset_id: string;
  institute: string;
  sections: number;
  counts: DatasetCounts;
  status: string;
}

export interface DatasetCounts {
  rooms: number;
  room_unavailability: number;
  faculty: number;
  student_groups: number;
  courses: number;
  sessions: number;
  booking_requests: number;
  cancellations: number;
  exams: number;
}

/** GET /api/dataset */
export interface DatasetInfoResponse {
  dataset_id: string;
  institute: string;
  calendar: DatasetCalendar;
  counts: DatasetCounts;
}

export interface DatasetCalendar {
  days: string[];
  periods: CalendarPeriod[];
  lunch: { after_period: number; start: string; end: string };
  lab_start_periods: number[];
  event_only_periods: number[];
  fest_week: string;
  exam_week: {
    days: string[];
    sessions: { id: string; start: string; end: string }[];
  };
}

export interface CalendarPeriod {
  id: number;
  start: string;
  end: string;
  teaching: boolean;
}

/** Booking time window within a booking request */
export interface DatasetBookingTimeWindow {
  day: string;
  from_period: number;
  to_period: number;
}

/** Individual booking request item in the dataset (matches backend dataset.booking_requests[]) */
export interface DatasetBookingRequest {
  id: string;
  submitted_at: string;
  requester: string;
  role: string;
  department: string | null;
  requested_category: string;
  title: string;
  attendance: number;
  duration_periods: number;
  windows: DatasetBookingTimeWindow[];
  room_types: string[];
  needs: string[];
  requested_room: string | null;
  mandatory_for_groups: string[];
  series_id: string | null;
  raw_text: string;
}

export interface Course {
  id: string;
  title: string;
  department: string;
  year: number;
  lecture_hours: number;
  tutorial_hours: number;
  lab_blocks: number;
}

export interface StudentGroup {
  id: string;
  name: string;
  year: number;
  department: string;
  size: number;
  needs_accessible: boolean;
}

export interface ExamRoomAllocation {
  room_id: string;
  seats_used: number;
}

export interface ScheduledExam {
  exam_id: string;
  course_ids: string[];
  groups: string[];
  size: number;
  day: string;
  session: 'AM' | 'PM';
  rooms: ExamRoomAllocation[];
}

export interface UnscheduledExam {
  exam_id: string;
  reason: string;
}

export interface ExamScheduleResult {
  total_exams: number;
  scheduled_count: number;
  unscheduled_count: number;
  scheduled: ScheduledExam[];
  unscheduled: UnscheduledExam[];
  slots_used: number;
  slots_available: number;
}

/** GET /api/dataset/full */
export interface DatasetFullResponse {
  rooms: Room[];
  faculty: Faculty[];
  student_groups: StudentGroup[];
  courses: Course[];
  sessions: unknown[];
  booking_requests: DatasetBookingRequest[];
  exams: unknown[];
}

/** POST /api/schedule/generate */
export interface ScheduleGenerateResponse {
  success: boolean;
  status: string;
  message: string;
  scheduled: ScheduledSession[];
  unscheduled: UnscheduledSession[];
  diagnostics: ScheduleDiagnostics;
  solve_time_seconds: number;
}

export interface FullTimetableData {
  schedule: ScheduleGenerateResponse;
  dataset: DatasetFullResponse;
}

export interface ScheduledSession {
  session_id: string;
  course_id: string;
  kind: string;
  groups: string[];
  faculty_id: string;
  day: string;
  period: number;
  duration: number;
  room_id: string;
  size: number;
}

export interface UnscheduledSession {
  session_id: string;
  reason: string;
}

export interface ScheduleDiagnostics {
  total_sessions: number;
  modelled_sessions: number;
  pre_infeasible: number;
  scheduled_count: number;
  unscheduled_count: number;
  objective_value: number | null;
  solver_status: string;
}

// ══════════════════════════════════════════════
//  Booking Processing & Decision Types
// ══════════════════════════════════════════════

export type DecisionStatus = 'approved' | 'rejected' | 'alternative_offered';

export interface AllocatedSlot {
  room_id: string;
  day: string;
  start_period: number;
  end_period: number;
}

export interface BookingDecision {
  request_id: string;
  title: string;
  requester: string;
  status: DecisionStatus;
  allocated: AllocatedSlot | null;
  alternative: AllocatedSlot | null;
  reasons: string[];
}

/** POST /api/bookings/process */
export interface ProcessBookingsResponse {
  total: number;
  summary: {
    approved: number;
    rejected: number;
    alternative_offered: number;
  };
  decisions: BookingDecision[];
}

/** Combined booking request joined with engine decision */
export interface ProcessedBooking {
  id: string;
  title: string;
  requester: string;
  role: string;
  department: string | null;
  requested_category: string;
  attendance: number;
  duration_periods: number;
  windows: DatasetBookingTimeWindow[];
  room_types: string[];
  needs: string[];
  requested_room: string | null;
  mandatory_for_groups: string[];
  series_id: string | null;
  raw_text: string;
  submitted_at: string;

  // Decision fields
  status: DecisionStatus | 'pending';
  allocated: AllocatedSlot | null;
  alternative: AllocatedSlot | null;
  reasons: string[];

  // Resolved display fields
  venue: string;
  day: string;
  timeSlot: string;
}

export interface FullBookingsData {
  total: number;
  summary: {
    approved: number;
    rejected: number;
    alternative_offered: number;
    pending: number;
  };
  bookings: ProcessedBooking[];
}
