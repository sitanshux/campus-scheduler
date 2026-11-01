import { Loader2, RefreshCw, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { fetchFullExamData } from '../../services/api';

interface UpcomingExamsProps {
  onNavigate?: (page: string) => void;
}

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

export default function UpcomingExams({ onNavigate }: UpcomingExamsProps) {
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
    <div className="bg-[#FFFDF8] rounded-[24px] border border-[#E8E1D5] p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-[#1E1E1E] tracking-tight">
            Upcoming Examinations
          </h2>
          <p className="text-xs text-[#75716B] mt-0.5 font-medium">
            Active exam slots from the Fall 2027 calendar
          </p>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <button
              onClick={refetch}
              className="text-xs text-[#7D2956] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
              title="Retry loading exams"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate?.('exams')}
            className="text-xs font-bold text-[#1E1E1E] hover:text-[#5D55D4] inline-flex items-center gap-1 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center text-[#75716B] gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-[#1E1E1E]" />
          <span className="text-xs font-semibold">Loading scheduled examinations…</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-[#E9A8CE]/15 border border-[#E9A8CE]/30 p-3 text-xs text-[#7D2956] font-medium">
          Failed to load exam schedule: {error}
        </div>
      ) : displayExams.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#A39E95]">
          No upcoming scheduled examinations found.
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayExams.map((exam) => (
            <div
              key={exam.id}
              className="rounded-2xl bg-[#FAF6ED]/60 border border-[#E8E1D5] p-3.5 hover:bg-[#FAF6ED] hover:border-[#D5CDBD] transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="bg-[#F4DA69]/30 text-[#6B530E] border border-[#F4DA69]/50 font-bold text-[10px] px-2 py-0.5 rounded-full shrink-0">
                    {exam.code}
                  </span>
                  <span className="font-bold text-[#1E1E1E] text-xs sm:text-sm truncate" title={exam.subject}>
                    {exam.subject}
                  </span>
                </div>
                <span className="bg-[#B9D9C2]/35 text-[#1B4D2E] border border-[#B9D9C2]/60 font-bold text-[10px] px-2 py-0.5 rounded-full shrink-0">
                  {exam.branch}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#EFE8DA] text-[11px] text-[#75716B]">
                <div className="flex items-center gap-1.5 truncate">
                  <Calendar size={12} className="text-[#A39E95] shrink-0" />
                  <span className="font-semibold text-[#1E1E1E]">{exam.day}</span>
                  <span>({exam.session})</span>
                </div>
                <div className="flex items-center gap-1.5 truncate" title={exam.venues}>
                  <MapPin size={12} className="text-[#A39E95] shrink-0" />
                  <span className="truncate">{exam.venues}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}