import { BookOpen, Loader2, RefreshCw } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { fetchFullExamData } from '../../services/api';

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

export default function UpcomingExams() {
  const { data: fullExamData, loading, error, refetch } = useApi(fetchFullExamData);

  const courseMap = new Map(fullExamData?.dataset?.courses?.map((c) => [c.id, c.title]) ?? []);
  const roomMap = new Map(fullExamData?.dataset?.rooms?.map((r) => [r.id, r.name]) ?? []);

  const scheduledExams = fullExamData?.schedule?.scheduled ?? [];
  const displayExams = scheduledExams.slice(0, 3).map((exam) => {
    const subject = exam.course_ids
      .map((cid) => courseMap.get(cid) ?? cid)
      .join(' / ');
    const venues = exam.rooms
      .map((r) => roomMap.get(r.room_id) ?? r.room_id)
      .join(', ');
    const branch = deriveBranchSem(exam.groups);

    return {
      id: exam.exam_id,
      code: exam.course_ids.join(', '),
      subject,
      branch,
      day: exam.day,
      session: `${exam.session} Session`,
      venues,
    };
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Upcoming Exams</h2>
        {error && (
          <button
            onClick={refetch}
            className="text-xs text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1"
            title="Retry loading exams"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          <span className="text-xs">Loading scheduled exams…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
          Failed to load exam schedule: {error}
        </div>
      ) : displayExams.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          No upcoming scheduled exams.
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-slate-200">
          {displayExams.map((exam) => (
            <div
              key={exam.id}
              className="border-l-4 border-indigo-500 pl-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-start gap-2">
                <BookOpen className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate" title={exam.subject}>
                    {exam.code} - {exam.subject}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {exam.branch}
                  </p>
                  <p className="text-xs text-slate-500">
                    Day: {exam.day} &middot; {exam.session}
                  </p>
                  <p className="text-xs text-slate-500 truncate" title={exam.venues}>
                    Venue: {exam.venues}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
