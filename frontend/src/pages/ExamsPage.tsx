import { useState } from 'react';
import { Calendar, Download, Filter, Clock } from 'lucide-react';
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
  const [selectedCohort, setSelectedCohort] = useState('All');

  const {
    data: fullExamData,
    loading,
    error,
    refetch,
  } = useApi(fetchFullExamData);

  // In the CIT dataset, all 41 scheduled exams belong to the primary fall session: 'End Semester - Nov 2027'.
  const isCurrentPeriod = selectedSemester === 'End Semester - Nov 2027';

  // Map backend data when available and matching the selected semester
  let displayedExams: ExamRow[] = [];
  let unscheduledCount = 0;
  let slotsUsed = 0;
  let slotsAvailable = 12;

  if (isCurrentPeriod && fullExamData?.schedule && fullExamData.dataset) {
    const { schedule, dataset } = fullExamData;
    const courseMap = new Map(dataset.courses.map((c) => [c.id, c]));
    const roomMap = new Map(dataset.rooms.map((r) => [r.id, r]));

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

  const filteredExams = displayedExams.filter((e) => {
    if (selectedCohort === 'All') return true;
    if (selectedCohort === '1st Year') return e.branchSem.includes('1st Year') || e.code.startsWith('MA1') || e.code.startsWith('PH1') || e.code.startsWith('HS1') || e.code.startsWith('CS1') || e.code.startsWith('WS1');
    return e.branchSem.toLowerCase().includes(selectedCohort.toLowerCase()) || e.code.toLowerCase().includes(selectedCohort.toLowerCase());
  });

  const handleExport = () => {
    const headers = ['Code', 'Subject', 'Scheduled Day', 'Session', 'Venues', 'Branch & Sem', 'Size'];
    const rows = filteredExams.map((e) => [
      `"${e.code.replace(/"/g, '""')}"`,
      `"${e.subject.replace(/"/g, '""')}"`,
      `"${e.date}"`,
      `"${e.session}"`,
      `"${e.venues.replace(/"/g, '""')}"`,
      `"${e.branchSem.replace(/"/g, '""')}"`,
      `"${e.size}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = selectedSemester.replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('download', `CIT_Exam_Schedule_${safeName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1E1E1E] tracking-tight">Examination Schedule</h1>
            <p className="text-xs sm:text-sm text-[#75716B] mt-0.5 font-medium">
              View and manage upcoming examination schedules
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#B9B5F4]/20 border border-[#B9B5F4]/40 px-3 py-1 text-xs font-semibold text-[#1E1E1E]">
            <Calendar className="h-3.5 w-3.5 text-[#5D55D4]" />
            {selectedSemester}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Student Cohort / Department Filter */}
          <div className="relative">
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="appearance-none rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] px-3.5 py-2 pr-8 text-xs sm:text-sm font-semibold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:outline-none cursor-pointer"
              title="Filter by Student Cohort / Branch"
            >
              <option value="All">All Cohorts (41 Exams)</option>
              <option value="1st Year">Common 1st Year (Y1)</option>
              <option value="CSE">Computer Science (CSE)</option>
              <option value="ECE">Electronics (ECE)</option>
              <option value="EE">Electrical (EE)</option>
              <option value="ME">Mechanical (ME)</option>
              <option value="CE">Civil (CE)</option>
            </select>
            <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#75716B] pointer-events-none" />
          </div>

          {/* Semester Selector */}
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="rounded-2xl border border-[#E8E1D5] bg-[#FFFDF8] px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#1E1E1E] shadow-2xs focus:border-[#E9A8CE] focus:ring-1 focus:ring-[#E9A8CE] focus:outline-none cursor-pointer"
          >
            <option value="End Semester - Nov 2027">End Semester - Nov 2027</option>
            <option value="Mid Semester - Sep 2027">Mid Semester - Sep 2027</option>
            <option value="End Semester - May 2027">End Semester - May 2027</option>
          </select>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#1E1E1E] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-black transition-all cursor-pointer"
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
        <div className="rounded-[22px] border border-[#E8E1D5] bg-[#FFFDF8] shadow-xs overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[100px_2fr_90px_150px_1.5fr_1fr] gap-4 border-b border-[#E8E1D5] bg-[#FAF6ED] px-6 py-3.5">
            <span className="text-[11px] font-bold text-[#75716B] uppercase tracking-wider">
              Code
            </span>
            <span className="text-[11px] font-bold text-[#75716B] uppercase tracking-wider">
              Subject
            </span>
            <span className="text-[11px] font-bold text-[#75716B] uppercase tracking-wider">
              Day
            </span>
            <span className="text-[11px] font-bold text-[#75716B] uppercase tracking-wider">
              Session & Duration
            </span>
            <span className="text-[11px] font-bold text-[#75716B] uppercase tracking-wider">
              Allocated Venues (50% Seating)
            </span>
            <span className="text-[11px] font-bold text-[#75716B] uppercase tracking-wider">
              Cohort & Enrolled
            </span>
          </div>

          {/* Table Rows */}
          {filteredExams.map((exam, index) => (
            <div
              key={exam.id}
              className={`grid grid-cols-1 md:grid-cols-[100px_2fr_90px_150px_1.5fr_1fr] gap-2 md:gap-4 items-center px-6 py-4 border-b border-[#EFE8DA] last:border-b-0 hover:bg-[#FAF6ED]/70 transition-colors ${
                index % 2 === 0 ? 'bg-[#FFFDF8]' : 'bg-[#FAF6ED]/30'
              }`}
            >
              {/* Code */}
              <div>
                <span className="inline-flex items-center rounded-lg bg-[#FAF6ED] border border-[#E8E1D5] px-2.5 py-0.5 text-xs font-bold text-[#1E1E1E]">
                  {exam.code}
                </span>
              </div>

              {/* Subject */}
              <div>
                <span className="text-xs sm:text-sm font-semibold text-[#1E1E1E]">{exam.subject}</span>
              </div>

              {/* Day */}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#75716B] hidden md:block" />
                <span className="text-xs sm:text-sm font-medium text-[#1E1E1E]">{exam.date}</span>
              </div>

              {/* Session & Duration */}
              <div className="space-y-0.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    exam.session === 'AM'
                      ? 'bg-[#F4DA69]/30 text-[#6B530E] border border-[#F4DA69]/50'
                      : 'bg-[#B8CDEB]/40 text-[#1E3A5F] border border-[#B8CDEB]/60'
                  }`}
                >
                  <Clock size={11} />
                  <span>{exam.session === 'AM' ? 'AM (09:30–12:30)' : 'PM (14:00–17:00)'}</span>
                </span>
                <span className="block text-[10px] text-[#75716B] font-semibold pl-1">
                  3h standard duration
                </span>
              </div>

              {/* Venue */}
              <div>
                <span className="text-xs sm:text-sm text-[#75716B] font-medium">{exam.venues}</span>
              </div>

              {/* Branch & Sem */}
              <div>
                <span className="inline-flex items-center rounded-full bg-[#B9D9C2]/35 border border-[#B9D9C2]/60 px-2.5 py-0.5 text-[11px] font-bold text-[#1B4D2E]">
                  {exam.branchSem}
                </span>
              </div>
            </div>
          ))}

          {filteredExams.length === 0 && (
            <div className="px-6 py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] mx-auto flex items-center justify-center text-[#75716B] mb-3 shadow-2xs">
                <Calendar className="h-6 w-6 text-[#A39E95]" />
              </div>
              <h3 className="text-base font-bold text-[#1E1E1E]">
                No examination schedules found
              </h3>
              <p className="text-xs sm:text-sm text-[#75716B] mt-1 max-w-md mx-auto">
                No examination sessions are scheduled for <span className="font-semibold text-[#1E1E1E]">{selectedSemester}</span> in the current academic dataset. Select &ldquo;End Semester - Nov 2027&rdquo; to view the active exam timetable.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Footer Summary */}
      {!loading && !error && fullExamData && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-[#FFFDF8] border border-[#E8E1D5] px-5 py-3.5 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm text-[#75716B]">
            <span>
              Showing <strong className="font-bold text-[#1E1E1E]">{isCurrentPeriod ? filteredExams.length : 0}</strong> examinations scheduled {selectedCohort !== "All" && `(${selectedCohort} cohort)`}
            </span>
            {isCurrentPeriod ? (
              unscheduledCount > 0 ? (
                <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-0.5">
                  {unscheduledCount} unscheduled
                </span>
              ) : (
                <span className="text-xs font-semibold text-[#1B4D2E] bg-[#B9D9C2]/35 border border-[#B9D9C2]/60 rounded-full px-2.5 py-0.5">
                  0 unscheduled (100% placed)
                </span>
              )
            ) : (
              <span className="text-xs font-semibold text-[#75716B] bg-[#F3EDE0] border border-[#E8E1D5] rounded-full px-2.5 py-0.5">
                No active exam slots
              </span>
            )}
          </div>
          <span className="text-xs text-[#75716B]">
            {isCurrentPeriod && slotsUsed > 0
              ? `${slotsUsed} of ${slotsAvailable} exam slots utilized`
              : `Period: ${selectedSemester}`}
          </span>
        </div>
      )}
    </div>
  );
}
