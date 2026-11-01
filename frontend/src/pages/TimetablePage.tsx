import { useState, useMemo, useCallback } from 'react';
import {
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar,
  MapPin,
  User,
  Users,
  BookOpen,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { fetchFullTimetableData, clearTimetableCache } from '../services/api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';
import type { FullTimetableData, ScheduledSession } from '../types';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const timeSlots = [
  '8:00 AM',  // Slot 0 -> Period 1 (08:00 – 09:00)
  '9:00 AM',  // Slot 1 -> Period 2 (09:00 – 10:00)
  '10:00 AM', // Slot 2 -> Period 3 (10:00 – 11:00)
  '11:00 AM', // Slot 3 -> Period 4 (11:00 – 12:00)
  '12:00 PM', // Slot 4 -> Period 5 (12:00 – 13:00)
  '1:00 PM',  // Slot 5 -> Lunch Break (13:00 – 14:00)
  '2:00 PM',  // Slot 6 -> Period 6 (14:00 – 15:00)
  '3:00 PM',  // Slot 7 -> Period 7 (15:00 – 16:00)
  '4:00 PM',  // Slot 8 -> Period 8 (16:00 – 17:00)
  '5:00 PM',  // Slot 9 -> Period 9 (17:00 – 18:00)
];

const DAY_INDEX: Record<string, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
};

interface TimetableBlock {
  id: string;
  code: string;
  name: string;
  venue: string;
  day: number;       // 0 = Monday
  startSlot: number; // 0 = 8 AM, 6 = 2 PM
  span: number;      // duration in periods
  color: 'indigo' | 'emerald' | 'violet' | 'amber';
  kind: string;
  facultyName: string;
  facultyId: string;
  groups: string[];
  period: number;
  duration: number;
  timeSlotString: string;
  size: number;
}

const colorMap = {
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-l-indigo-500',
    text: 'text-indigo-700',
    sub: 'text-indigo-600',
    badge: 'bg-indigo-100/70 text-indigo-700',
  },
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-l-emerald-500',
    text: 'text-emerald-700',
    sub: 'text-emerald-600',
    badge: 'bg-emerald-100/70 text-emerald-700',
  },
  violet: {
    bg: 'bg-violet-50',
    border: 'border-l-violet-500',
    text: 'text-violet-700',
    sub: 'text-violet-600',
    badge: 'bg-violet-100/70 text-violet-700',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-l-amber-500',
    text: 'text-amber-700',
    sub: 'text-amber-600',
    badge: 'bg-amber-100/70 text-amber-700',
  },
};

function getSessionColor(kind: string): 'indigo' | 'emerald' | 'violet' | 'amber' {
  const k = (kind || '').toLowerCase();
  if (k === 'lab' || k.includes('lab') || k.includes('practical')) return 'violet';
  if (k === 'tutorial' || k.includes('tut')) return 'emerald';
  if (k === 'lecture' || k.includes('lec')) return 'indigo';
  return 'amber';
}

function periodToStartSlot(period: number): number {
  if (period <= 5) {
    return period - 1;
  }
  // Period 6 starts at 14:00, which corresponds to index 6 ('2:00 PM')
  return period;
}

function formatPeriodRange(startPeriod: number, duration: number): string {
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
  };

  const endPeriod = startPeriod + duration - 1;
  const start = PERIOD_TIMES[startPeriod]?.start ?? `P${startPeriod}`;
  const end = PERIOD_TIMES[endPeriod]?.end ?? `P${endPeriod}`;
  return `${start} – ${end} (Period ${startPeriod}${duration > 1 ? `–${endPeriod}` : ''})`;
}

function getTargetGroups(dept: string, sem: string, section?: string): string[] {
  const d = dept === 'EEE' ? 'EE' : dept;

  if (sem === '1st' || sem === '2nd' || dept === 'COMMON') {
    if (section && section !== 'ALL') return [section];
    return ['Y1-A', 'Y1-B', 'Y1-C', 'Y1-D'];
  }
  if (sem === '3rd' || sem === '4th') {
    return [`${d}-2`];
  }
  if (sem === '5th' || sem === '6th') {
    return [`${d}-3`];
  }
  return [];
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  // 0 = Sunday -> -6 days, 1 = Monday -> 0 days, 2 = Tuesday -> -1 day, etc.
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function TimetablePage() {
  const [department, setDepartment] = useState('CSE');
  const [semester, setSemester] = useState('3rd');
  const [section, setSection] = useState('Y1-A');
  const [selectedSession, setSelectedSession] = useState<TimetableBlock | null>(null);
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const monday = useMemo(() => {
    const m = getMonday(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    return [0, 1, 2, 3, 4].map((offset) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      return d;
    });
  }, [monday]);

  const formattedWeekRange = useMemo(() => {
    const friday = weekDates[4];
    const startMonth = monday.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = friday.toLocaleDateString('en-US', { month: 'short' });
    const startDay = monday.getDate();
    const endDay = friday.getDate();
    const year = friday.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} – ${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  }, [monday, weekDates]);

  const fetcher = useCallback(() => fetchFullTimetableData(120), []);
  const { data: timetableData, loading, error, refetch } = useApi<FullTimetableData>(fetcher);

  const handleRegenerate = useCallback(async () => {
    clearTimetableCache();
    refetch();
  }, [refetch]);

  const isYear1 = semester === '1st' || semester === '2nd' || department === 'COMMON';

  // Map backend dataset sessions to TimetableBlock UI format
  const mappedSessions = useMemo<TimetableBlock[]>(() => {
    if (
      !timetableData?.schedule?.scheduled ||
      timetableData.schedule.scheduled.length === 0 ||
      !timetableData.dataset
    ) {
      return [];
    }

    const { schedule, dataset } = timetableData;
    const courseMap = new Map(dataset.courses.map((c) => [c.id, c]));
    const facultyMap = new Map(dataset.faculty.map((f) => [f.id, f]));
    const roomMap = new Map(dataset.rooms.map((r) => [r.id, r]));

    return schedule.scheduled.map((s: ScheduledSession) => {
      const course = courseMap.get(s.course_id);
      const faculty = facultyMap.get(s.faculty_id);
      const room = roomMap.get(s.room_id);

      const dayIdx = DAY_INDEX[s.day] ?? 0;
      const startSlot = periodToStartSlot(s.period);
      const venueName = room ? `${room.name} (${s.room_id})` : s.room_id;

      return {
        id: s.session_id,
        code: s.course_id,
        name: course?.title ?? s.course_id,
        venue: venueName,
        day: dayIdx,
        startSlot,
        span: s.duration,
        color: getSessionColor(s.kind),
        kind: s.kind,
        facultyName: faculty?.name ?? s.faculty_id,
        facultyId: s.faculty_id,
        groups: s.groups,
        period: s.period,
        duration: s.duration,
        timeSlotString: formatPeriodRange(s.period, s.duration),
        size: s.size,
      };
    });
  }, [timetableData]);

  // Filter sessions based on selected department, semester, and section
  const targetGroups = useMemo(
    () => getTargetGroups(department, semester, isYear1 ? section : undefined),
    [department, semester, isYear1, section],
  );

  const filteredSessions = useMemo(() => {
    if (targetGroups.length === 0) return [];
    return mappedSessions.filter((s) => s.groups.some((g) => targetGroups.includes(g)));
  }, [mappedSessions, targetGroups]);

  const diagnostics = timetableData?.schedule?.diagnostics;
  const isOptimalOrFeasible =
    timetableData?.schedule?.status === 'OPTIMAL' ||
    timetableData?.schedule?.status === 'FEASIBLE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Weekly Timetable</h1>
          <p className="text-sm text-slate-500 mt-1">
            Deterministic timetable generated by CP-SAT solver with zero constraint clashes
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Department Filter */}
          <div className="relative">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="CSE">CSE</option>
              <option value="ECE">ECE</option>
              <option value="EEE">EEE</option>
              <option value="ME">ME</option>
              <option value="CE">CE</option>
              <option value="COMMON">Common (Year 1)</option>
            </select>
            <Filter className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Semester Filter */}
          <div className="relative">
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="1st">1st Semester</option>
              <option value="2nd">2nd Semester</option>
              <option value="3rd">3rd Semester</option>
              <option value="4th">4th Semester</option>
              <option value="5th">5th Semester</option>
              <option value="6th">6th Semester</option>
              <option value="7th">7th Semester</option>
              <option value="8th">8th Semester</option>
            </select>
            <Filter className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Section Selector for Year 1 */}
          {isYear1 && (
            <div className="relative">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
              >
                <option value="Y1-A">Section A (Y1-A)</option>
                <option value="Y1-B">Section B (Y1-B)</option>
                <option value="Y1-C">Section C (Y1-C)</option>
                <option value="Y1-D">Section D (Y1-D)</option>
              </select>
              <Filter className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          )}

          {/* Week Navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              aria-label="Previous week"
              title="Previous week (-7 days)"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              title={weekOffset === 0 ? 'Current week' : 'Click to reset to current week'}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                weekOffset === 0
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
              }`}
            >
              <span>This Week</span>
              <span
                className={`text-xs ${
                  weekOffset === 0 ? 'text-indigo-500 font-normal' : 'text-slate-400 font-normal'
                }`}
              >
                ({formattedWeekRange})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              aria-label="Next week"
              title="Next week (+7 days)"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Regenerate Button */}
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Re-run the CP-SAT schedule solver"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>
      </div>

      {/* Solver Diagnostics Bar */}
      {diagnostics && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm text-xs text-slate-600">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                isOptimalOrFeasible
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
              }`}
            >
              {isOptimalOrFeasible ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              Solver: {timetableData?.schedule?.status}
            </span>
            <span>•</span>
            <span>
              Scheduled:{' '}
              <strong className="text-slate-800">
                {diagnostics.scheduled_count}/{diagnostics.total_sessions}
              </strong>{' '}
              sessions
            </span>
            <span>•</span>
            <span>
              Solve Time:{' '}
              <strong className="text-slate-800">
                {timetableData?.schedule?.solve_time_seconds != null
                  ? `${timetableData.schedule.solve_time_seconds.toFixed(1)}s`
                  : 'cached'}
              </strong>
            </span>
          </div>

          <div className="text-slate-500 font-medium">
            Active Group:{' '}
            <span className="font-semibold text-slate-800">
              {targetGroups.join(', ') || 'None'}
            </span>{' '}
            ({filteredSessions.length} sessions scheduled)
          </div>
        </div>
      )}

      {/* Solver Incomplete Notice */}
      {timetableData && !isOptimalOrFeasible && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-start gap-2.5 shadow-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900">
              Solver generation did not complete successfully (Status: {timetableData.schedule.status})
            </p>
            <p className="text-amber-700">
              {timetableData.schedule.message || 'The CP-SAT solver timed out before finding a feasible timetable.'}
              {' '}Please click &ldquo;Regenerate&rdquo; above to re-run the solver with the full 120-second time limit.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !timetableData && (
        <ErrorAlert message={error} onRetry={refetch} />
      )}

      {/* Loading state */}
      {loading && !timetableData && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <LoadingSpinner message="Generating campus timetable with CP-SAT solver… Evaluating constraints for all 189 sessions." />
        </div>
      )}

      {/* Timetable Grid */}
      {(!loading || timetableData) && (!error || Boolean(timetableData)) && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {filteredSessions.length === 0 ? (
              <div className="p-16 text-center">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">
                  No scheduled sessions found for {department} ({semester} Semester)
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
                  The dataset contains curriculum schedules for 1st Year (1st/2nd Sem), 2nd Year (3rd/4th Sem), and 3rd Year (5th/6th Sem).
                  Please choose an active semester from the dropdown.
                </p>
              </div>
            ) : (
              <div
                className="grid min-w-[860px] relative"
                style={{
                  gridTemplateColumns: '100px repeat(5, 1fr)',
                  gridTemplateRows: '48px repeat(10, minmax(68px, auto))',
                }}
              >
                {/* Header: Time label */}
                <div className="sticky left-0 z-30 bg-slate-50 p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 flex items-center justify-center">
                  Time
                </div>

                {/* Header: Days */}
                {days.map((day, dIdx) => {
                  const dayDate = weekDates[dIdx];
                  const dateStr = dayDate
                    ? dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '';

                  return (
                    <div
                      key={day}
                      style={{ gridColumn: dIdx + 2, gridRow: 1 }}
                      className="p-2 text-center text-sm font-semibold text-slate-700 bg-slate-50 border-b border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center"
                    >
                      <span>{day}</span>
                      {dateStr && (
                        <span className="text-[11px] font-normal text-slate-400">
                          {dateStr}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Time Column Labels */}
                {timeSlots.map((time, rIdx) => {
                  const isLunch = rIdx === 5;
                  return (
                    <div
                      key={time}
                      style={{ gridColumn: 1, gridRow: rIdx + 2 }}
                      className={`sticky left-0 z-20 bg-white p-3 text-xs font-medium border-b border-r border-slate-200 flex items-start ${
                        isLunch ? 'text-amber-700 bg-amber-50/50 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {time}
                    </div>
                  );
                })}

                {/* Background Grid Cells & Lunch Hour Row */}
                {timeSlots.map((_, rIdx) =>
                  days.map((dayName, dIdx) => {
                    const isLunch = rIdx === 5;
                    return (
                      <div
                        key={`cell-${dayName}-${rIdx}`}
                        style={{ gridColumn: dIdx + 2, gridRow: rIdx + 2 }}
                        className={`border-b border-r border-slate-100 last:border-r-0 p-1.5 min-h-[68px] ${
                          isLunch ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        {isLunch && (
                          <div className="h-full w-full rounded border border-dashed border-amber-200/70 flex items-center justify-center text-[10px] font-medium text-amber-600/70 select-none">
                            Lunch Break
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Scheduled Session Blocks (Overlay on Grid) */}
                {filteredSessions.map((session) => {
                  const colors = colorMap[session.color];
                  const colStart = session.day + 2;
                  const rowStart = session.startSlot + 2;

                  return (
                    <div
                      key={session.id}
                      style={{
                        gridColumn: colStart,
                        gridRow: `${rowStart} / span ${session.span}`,
                      }}
                      className="p-1.5 z-10"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSession(session)}
                        className={`w-full h-full text-left rounded-lg border-l-4 ${colors.border} ${colors.bg} p-2.5 cursor-pointer hover:shadow-md transition-all flex flex-col justify-between`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-xs font-bold ${colors.text}`}>
                              {session.code}
                            </span>
                            <span
                              className={`text-[10px] uppercase font-semibold px-1 py-0.5 rounded ${colors.badge}`}
                            >
                              {session.kind}
                            </span>
                          </div>
                          <p
                            className={`text-xs font-medium line-clamp-1 ${colors.text} mt-0.5`}
                            title={session.name}
                          >
                            {session.name}
                          </p>
                        </div>

                        <div className="mt-1.5 space-y-0.5 text-[11px]">
                          <div className={`flex items-center gap-1 ${colors.sub} font-medium`}>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{session.venue}</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-500 text-[10px] truncate">
                            <User className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{session.facultyName}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            Grp: {session.groups.join(', ')}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {selectedSession.code}
                  </span>
                  <span
                    className={`text-xs uppercase font-semibold px-2 py-0.5 rounded capitalize ${
                      colorMap[selectedSession.color].badge
                    }`}
                  >
                    {selectedSession.kind}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedSession.name}
                </h3>
              </div>

              <button
                onClick={() => setSelectedSession(null)}
                aria-label="Close details"
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Details */}
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block">Venue</span>
                  <span className="font-semibold text-slate-800">{selectedSession.venue}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-600">
                <User className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block">Faculty Instructor</span>
                  <span className="font-semibold text-slate-800">
                    {selectedSession.facultyName}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      ({selectedSession.facultyId})
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-600">
                <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block">Schedule &amp; Period</span>
                  <span className="font-semibold text-slate-800">
                    {days[selectedSession.day]} · {selectedSession.timeSlotString}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-600">
                <Users className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block">Student Groups</span>
                  <span className="font-semibold text-slate-800">
                    {selectedSession.groups.join(', ')} ({selectedSession.size} students)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-600">
                <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block">Session ID</span>
                  <span className="font-mono text-xs font-semibold text-slate-700">
                    {selectedSession.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
