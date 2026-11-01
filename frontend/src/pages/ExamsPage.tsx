import { useState } from 'react';
import { Calendar, Download } from 'lucide-react';
import { fetchFullExamData } from '../services/api';
import { useApi } from '../hooks/useApi';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import ErrorAlert from '../components/ui/ErrorAlert';

interface ExamRow {
  id: string;
  code: string;
  subject: string;
  date: string;
  session: 'AM' | 'PM';
  venues: string;
  branchSem: string;
  size: number;
}

const DAY_ORDER: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const SESSION_ORDER: Record<string, number> = {
  AM: 1,
  PM: 2,
};

function deriveBranchSem(groups: string[]): string {
  const setG = new Set(groups);
  if (
    setG.has('Y1-A') &&
    setG.has('Y1-B') &&
    setG.has('Y1-C') &&
    setG.has('Y1-D')
  ) {
    return 'All 1st Year';
  }
  if (
    setG.has('CSE-2') &&
    setG.has('ECE-2') &&
    setG.has('EE-2') &&
    setG.has('ME-2') &&
    setG.has('CE-2')
  ) {
    return 'All 2nd Year';
  }
  if (
    setG.has('CSE-3') &&
    setG.has('ECE-3') &&
    setG.has('EE-3') &&
    setG.has('ME-3') &&
    setG.has('CE-3')
  ) {
    return 'All 3rd Year';
  }
  if (groups.length === 1) {
    const g = groups[0];
    if (g.includes('-')) {
      const [dept, yr] = g.split('-');
      const suffix = yr === '1' ? 'st' : yr === '2' ? 'nd' : yr === '3' ? 'rd' : 'th';
      return `${dept} ${yr}${suffix} Year`;
    }
    return g;
  }
  return groups.join(', ');
}

export default function ExamsPage() {
  const [selectedSemester, setSelectedSemester] = useState('End Semester - Nov 2027');

  const {
    data: fullExamData,
    loading,
    error,
    refetch,
  } = useApi(fetchFullExamData);

  // Map backend data when available
  let displayedExams: ExamRow[] = [];
  let scheduledCount = 0;
  let unscheduledCount = 0;
  let slotsUsed = 0;
  let slotsAvailable = 12;

  if (fullExamData?.schedule && fullExamData.dataset) {
    const { schedule, dataset } = fullExamData;
    const courseMap = new Map(dataset.courses.map((c) => [c.id, c]));
    const roomMap = new Map(dataset.rooms.map((r) => [r.id, r]));

    scheduledCount = schedule.scheduled_count;
    unscheduledCount = schedule.unscheduled_count;
    slotsUsed = schedule.slots_used;
    slotsAvailable = schedule.slots_available;

    const mapped: ExamRow[] = schedule.scheduled.map((s) => {
      const code = s.course_ids.join(', ');
      const subject = s.course_ids
        .map((cid) => courseMap.get(cid)?.title ?? cid)
        .join(' / ');
      const date = s.day; // Actual scheduled day (e.g. MON, TUE, WED...)
      const session = s.session as 'AM' | 'PM';
      const venues = s.rooms
        .map((r) => roomMap.get(r.room_id)?.name ?? r.room_id)
        .join(', ');
      const branchSem = deriveBranchSem(s.groups);

      return {
        id: s.exam_id,
        code,
        subject,
        date,
        session,
        venues,
        branchSem,
        size: s.size,
      };
    });

    // Sort in calendar order: Day -> Session -> Code
    mapped.sort((a, b) => {
      const dayDiff = (DAY_ORDER[a.date] ?? 99) - (DAY_ORDER[b.date] ?? 99);
      if (dayDiff !== 0) return dayDiff;
      const sessDiff = (SESSION_ORDER[a.session] ?? 99) - (SESSION_ORDER[b.session] ?? 99);
      if (sessDiff !== 0) return sessDiff;
      return a.code.localeCompare(b.code);
    });

    displayedExams = mapped;
  }

  const handleExport = () => {
    const headers = ['Code', 'Subject', 'Scheduled Day', 'Session', 'Venues', 'Branch & Sem', 'Size'];
    const rows = displayedExams.map((e) => [
      `"${e.code}"`,
      `"${e.subject}"`,
      `"${e.date}"`,
      `"${e.session}"`,
      `"${e.venues}"`,
      `"${e.branchSem}"`,
      `"${e.size}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'CIT_Exam_Schedule_2027.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Examination Schedule</h1>
            <p className="text-sm text-slate-500 mt-1">
              View and manage upcoming examination schedules
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/20">
            <Calendar className="h-3.5 w-3.5" />
            End Semester 2027
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Semester Selector */}
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="End Semester - Nov 2027">End Semester - Nov 2027</option>
            <option value="Mid Semester - Sep 2027">Mid Semester - Sep 2027</option>
            <option value="End Semester - May 2027">End Semester - May 2027</option>
          </select>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {!loading && error && (
        <ErrorAlert
          message={error}
          onRetry={refetch}
        />
      )}

      {/* Loading State */}
      {loading ? (
        <LoadingSpinner message="Loading examination schedule..." />
      ) : !error ? (
        /* Exam Table */
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[100px_2fr_100px_80px_1.5fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Code
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Subject
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Day
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Session
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Venue(s)
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Branch & Sem
            </span>
          </div>

          {/* Table Rows */}
          {displayedExams.map((exam, index) => (
            <div
              key={exam.id}
              className={`grid grid-cols-1 md:grid-cols-[100px_2fr_100px_80px_1.5fr_1fr] gap-2 md:gap-4 items-center px-6 py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors ${
                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
              }`}
            >
              {/* Code */}
              <div>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {exam.code}
                </span>
              </div>

              {/* Subject */}
              <div>
                <span className="text-sm font-medium text-slate-900">{exam.subject}</span>
              </div>

              {/* Day */}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 hidden md:block" />
                <span className="text-sm font-medium text-slate-700">{exam.date}</span>
              </div>

              {/* Session */}
              <div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    exam.session === 'AM'
                      ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
                      : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20'
                  }`}
                >
                  {exam.session === 'AM' ? '🌅 AM' : '🌇 PM'}
                </span>
              </div>

              {/* Venue */}
              <div>
                <span className="text-sm text-slate-600">{exam.venues}</span>
              </div>

              {/* Branch & Sem */}
              <div>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                  {exam.branchSem}
                </span>
              </div>
            </div>
          ))}

          {displayedExams.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              No examination schedules found.
            </div>
          )}
        </div>
      ) : null}

      {/* Footer Summary */}
      {!loading && !error && fullExamData && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600">
            <span>
              Showing <strong className="font-semibold text-slate-900">{scheduledCount}</strong> examinations scheduled
            </span>
            {unscheduledCount > 0 ? (
              <span className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                {unscheduledCount} unscheduled
              </span>
            ) : (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                0 unscheduled (100% placed)
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400">
            {slotsUsed > 0
              ? `${slotsUsed} of ${slotsAvailable} exam slots utilized`
              : 'Last updated: Oct 31, 2027'}
          </span>
        </div>
      )}
    </div>
  );
}
